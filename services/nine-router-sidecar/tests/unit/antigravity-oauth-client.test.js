// Guards server-only Google OAuth configuration without committing real credentials.
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { proxyFetchMock } = vi.hoisted(() => ({ proxyFetchMock: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: proxyFetchMock }));

beforeEach(() => {
  proxyFetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ANTIGRAVITY = {
  clientId: "test-antigravity-client-id",
  clientSecret: "test-antigravity-client-secret",
};

const GOOGLE = {
  clientId: "test-gemini-client-id",
  clientSecret: "test-gemini-client-secret",
};

process.env.ANTIGRAVITY_OAUTH_CLIENT_ID = ANTIGRAVITY.clientId;
process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET = ANTIGRAVITY.clientSecret;
process.env.GEMINI_OAUTH_CLIENT_ID = GOOGLE.clientId;
process.env.GEMINI_OAUTH_CLIENT_SECRET = GOOGLE.clientSecret;

async function loadExecutor(provider) {
  if (provider === "antigravity") {
    return (await import("../../open-sse/executors/antigravity.js")).AntigravityExecutor;
  }
  return (await import("../../open-sse/executors/gemini-cli.js")).GeminiCLIExecutor;
}

describe("Google OAuth client configuration", () => {
  it("reads canonical clients from private server environment variables", async () => {
    const {
      ANTIGRAVITY_OAUTH_CLIENT,
      GOOGLE_OAUTH_CLIENT,
      requireOAuthClient,
    } = await import("../../open-sse/config/oauthClients.js");

    expect(ANTIGRAVITY_OAUTH_CLIENT).toEqual(ANTIGRAVITY);
    expect(GOOGLE_OAUTH_CLIENT).toEqual(GOOGLE);
    expect(requireOAuthClient(GOOGLE_OAUTH_CLIENT, "Gemini CLI", "GEMINI_OAUTH"))
      .toBe(GOOGLE_OAUTH_CLIENT);
  });

  it("fails clearly when OAuth deployment variables are missing", async () => {
    const { requireOAuthClient } = await import("../../open-sse/config/oauthClients.js");

    expect(() => requireOAuthClient({}, "Gemini CLI", "GEMINI_OAUTH"))
      .toThrow("GEMINI_OAUTH_CLIENT_ID and GEMINI_OAUTH_CLIENT_SECRET");
  });

  it("keeps private credentials out of provider registry metadata", async () => {
    const antigravity = (await import("../../open-sse/providers/registry/antigravity.js")).default;
    const gemini = (await import("../../open-sse/providers/registry/gemini.js")).default;
    const geminiCli = (await import("../../open-sse/providers/registry/gemini-cli.js")).default;

    for (const provider of [antigravity, gemini, geminiCli]) {
      expect(provider.transport).not.toHaveProperty("clientId");
      expect(provider.transport).not.toHaveProperty("clientSecret");
    }
  });

  it("composes server OAuth configs from environment clients and registry endpoints", async () => {
    const {
      ANTIGRAVITY_CONFIG,
      GEMINI_CONFIG,
    } = await import("../../src/lib/oauth/constants/oauth.js");

    expect(ANTIGRAVITY_CONFIG).toMatchObject(ANTIGRAVITY);
    expect(GEMINI_CONFIG).toMatchObject(GOOGLE);
    expect(ANTIGRAVITY_CONFIG.tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(GEMINI_CONFIG.tokenUrl).toBe("https://oauth2.googleapis.com/token");
  });

  it.each(["antigravity", "gemini-cli"])("sends PKCE S256 in the %s authorization and token requests", async (providerName) => {
    const { getProvider } = await import("../../src/lib/oauth/providers.js");
    const provider = getProvider(providerName);
    const authorizationUrl = new URL(provider.buildAuthUrl(
      provider.config,
      `https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/${providerName}`,
      "opaque-state",
      "pkce-challenge",
    ));
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "test-only" }) }));
    vi.stubGlobal("fetch", fetchMock);
    await provider.exchangeToken(
      provider.config,
      "authorization-code",
      `https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/${providerName}`,
      "pkce-verifier",
    );
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("code_verifier")).toBe("pkce-verifier");
  }, 15000);

  it("refreshes gemini-cli with the configured web client and preserves a non-rotated refresh token", async () => {
    const Executor = await loadExecutor("gemini-cli");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new-access", expires_in: 3600 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const refreshed = await new Executor().refreshCredentials({
      refreshToken: "existing-refresh",
      projectId: "tenant-project",
    });
    const body = fetchMock.mock.calls[0][1].body;

    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe(GOOGLE.clientId);
    expect(body.get("client_secret")).toBe(GOOGLE.clientSecret);
    expect(refreshed).toMatchObject({
      accessToken: "new-access",
      refreshToken: "existing-refresh",
      projectId: "tenant-project",
    });
  });

  it("refreshes Antigravity with the configured web client and preserves a non-rotated refresh token", async () => {
    const Executor = await loadExecutor("antigravity");
    proxyFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "new-access", expires_in: 3600 }),
    });

    const refreshed = await new Executor().refreshCredentials({
      refreshToken: "existing-refresh",
      projectId: "tenant-project",
    });
    const body = proxyFetchMock.mock.calls[0][1].body;

    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe(ANTIGRAVITY.clientId);
    expect(body.get("client_secret")).toBe(ANTIGRAVITY.clientSecret);
    expect(refreshed).toMatchObject({
      accessToken: "new-access",
      refreshToken: "existing-refresh",
      projectId: "tenant-project",
    });
  });

  it.each(["antigravity", "gemini-cli"])("sends the first mocked %s model call with only the connection bearer token", async (provider) => {
    const Executor = await loadExecutor(provider);
    proxyFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
    });

    await new Executor().execute({
      model: "mock-model",
      body: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
      stream: false,
      credentials: { accessToken: "tenant-access", projectId: "tenant-project" },
      log: {},
    });
    const [url, request] = proxyFetchMock.mock.calls[0];

    expect(url).not.toMatch(/\.example(?:\/|$)/);
    expect(request.headers.Authorization).toBe("Bearer tenant-access");
    expect(JSON.stringify({ url, request })).not.toMatch(/clientSecret|existing-refresh|new-access/);
  });

  it("does not import OAuth clients from browser-shared provider constants", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, "../../src/lib/oauth/constants/oauth.js"),
      "utf8"
    );

    expect(source).toContain('from "open-sse/config/oauthClients.js"');
    expect(source).not.toContain('from "open-sse/providers/shared.js"');
  });
});