import { beforeEach, describe, expect, it, vi } from "vitest";

const connectionWrites = [];
const providerHandlers = {
  antigravity: {
    flowType: "authorization_code",
    config: { clientId: "configured", clientSecret: "configured" },
    buildAuthUrl: (_config, redirectUri, state, codeChallenge) => `https://accounts.example/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`,
    exchangeToken: vi.fn(async () => ({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 })),
    mapTokens: tokens => ({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in }),
  },
  "gemini-cli": {
    flowType: "authorization_code",
    config: { clientId: "configured", clientSecret: "configured" },
    buildAuthUrl: (_config, redirectUri, state, codeChallenge) => `https://accounts.example/gemini?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`,
    exchangeToken: vi.fn(async () => ({ access_token: "gemini-secret", refresh_token: "gemini-refresh", expires_in: 3600 })),
    mapTokens: tokens => ({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in }),
  },
  cline: {
    flowType: "authorization_code",
    config: {},
    buildAuthUrl: (_config, redirectUri) => `https://app.cline.example/login?callback_url=${encodeURIComponent(redirectUri)}`,
    exchangeToken: vi.fn(async () => ({ access_token: "cline-secret", refresh_token: "cline-refresh", email: "user@example.test" })),
    mapTokens: tokens => ({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, email: tokens.email, expiresIn: 3600 }),
  },
  kimchi: {
    flowType: "browser_token",
    config: {},
    buildAuthUrl: (_config, redirectUri, state) => `https://app.kimchi.example/cli-auth?callback=${encodeURIComponent(redirectUri)}&state=${state}`,
    exchangeToken: vi.fn(async (_config, token) => ({ access_token: token, _kimchiUser: { email: "kimchi@example.test" } })),
    mapTokens: tokens => ({ accessToken: tokens.access_token, refreshToken: null, email: tokens._kimchiUser.email }),
  },
};

const loadModule = async (env = {}) => {
  vi.resetModules();
  Object.assign(process.env, env);
  return import("../../src/lib/oauth/publicRedirect.js");
};

beforeEach(() => {
  connectionWrites.length = 0;
  vi.clearAllMocks();
  process.env.ANTIGRAVITY_OAUTH_CLIENT_ID = "configured";
  process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET = "configured";
  process.env.GEMINI_OAUTH_CLIENT_ID = "configured";
  process.env.GEMINI_OAUTH_CLIENT_SECRET = "configured";
});

describe("public OAuth redirect provider adapters", () => {
  it("uses the exact safe allowlist and authoritative blocked reasons", async () => {
    const { getPublicRedirectCapability } = await loadModule();
    expect(getPublicRedirectCapability("antigravity")).toEqual({ ready: true, action: "oauth_redirect" });
    expect(getPublicRedirectCapability("gemini-cli")).toEqual({ ready: true, action: "oauth_redirect" });
    expect(getPublicRedirectCapability("claude")).toEqual({ ready: false, reason: "manual_code_exchange_only" });
    expect(getPublicRedirectCapability("cline")).toEqual({ ready: false, reason: "credential_in_callback_url_not_allowed" });
    expect(getPublicRedirectCapability("cursor")).toEqual({ ready: false, reason: "local_token_import_only" });
    expect(getPublicRedirectCapability("kimchi")).toEqual({ ready: false, reason: "credential_in_callback_url_not_allowed" });
    expect(getPublicRedirectCapability("codex")).toEqual({ ready: false, reason: "loopback_redirect_registration_required" });
    expect(getPublicRedirectCapability("grok-web")).toEqual({ ready: false, reason: "secure_cookie_capture_not_supported" });
    expect(getPublicRedirectCapability("perplexity-web")).toEqual({ ready: false, reason: "secure_cookie_capture_not_supported" });
    expect(getPublicRedirectCapability("mimo-free")).toEqual({ ready: false, reason: "no_account_authentication_flow" });
    expect(getPublicRedirectCapability("opencode")).toEqual({ ready: false, reason: "no_account_authentication_flow" });
  });

  it("reports Antigravity configuration names without values", async () => {
    delete process.env.ANTIGRAVITY_OAUTH_CLIENT_ID;
    delete process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET;
    const { getPublicRedirectCapability } = await loadModule();
    expect(getPublicRedirectCapability("antigravity")).toEqual({
      ready: false,
      reason: "configuration_required",
      requiredEnv: ["ANTIGRAVITY_OAUTH_CLIENT_ID", "ANTIGRAVITY_OAUTH_CLIENT_SECRET"],
    });
    const { authorizePublicRedirect, exchangePublicRedirect } = await loadModule();
    const args = {
      provider: "antigravity",
      callbackUri: "https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/antigravity",
      state: "state-value-that-is-at-least-thirty-two-bytes",
      getProvider: name => providerHandlers[name],
    };
    await expect(authorizePublicRedirect(args))
      .rejects.toMatchObject({ code: "OAUTH_CONFIGURATION_REQUIRED", statusCode: 409 });
    await expect(exchangePublicRedirect({ ...args, code: "code", codeVerifier: "verifier" }))
      .rejects.toMatchObject({ code: "OAUTH_CONFIGURATION_REQUIRED", statusCode: 409 });
  });

  it.each(["antigravity", "gemini-cli"])("builds %s authorization metadata while keeping state caller-bound", async provider => {
    const { authorizePublicRedirect } = await loadModule();
    const result = await authorizePublicRedirect({
      provider,
      callbackUri: `https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/${provider}`,
      state: "state-value-that-is-at-least-thirty-two-bytes",
      getProvider: name => providerHandlers[name],
    });
    expect(result.authorizationUrl).toMatch(/^https:\/\//);
    expect(result.state).toBe("state-value-that-is-at-least-thirty-two-bytes");
    expect(result.codeVerifier).toEqual(expect.any(String));
    expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
    const authorizationUrl = new URL(result.authorizationUrl);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result)).not.toContain("access-secret");
  });

  it("rejects non-HTTPS callback, wrong provider and malformed exchange input", async () => {
    const { authorizePublicRedirect, exchangePublicRedirect } = await loadModule();
    await expect(authorizePublicRedirect({ provider: "antigravity", callbackUri: "http://localhost/callback", state: "state", getProvider: name => providerHandlers[name] }))
      .rejects.toMatchObject({ code: "PUBLIC_REDIRECT_INVALID" });
    await expect(authorizePublicRedirect({ provider: "claude", callbackUri: "https://xbot.xlayer.my/callback", state: "state", getProvider: name => providerHandlers[name] }))
      .rejects.toMatchObject({ code: "PUBLIC_REDIRECT_UNAVAILABLE" });
    await expect(exchangePublicRedirect({ provider: "antigravity", callbackUri: "https://xbot.xlayer.my/callback", state: "state", code: "", codeVerifier: "verifier", getProvider: name => providerHandlers[name] }))
      .rejects.toMatchObject({ code: "PUBLIC_REDIRECT_INVALID" });
  });

  it("exchanges once and returns metadata without credential fields", async () => {
    const { exchangePublicRedirect } = await loadModule();
    const result = await exchangePublicRedirect({
      provider: "antigravity",
      callbackUri: "https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/antigravity",
      state: "state-value-that-is-at-least-thirty-two-bytes",
      code: "authorization-code",
      codeVerifier: "verifier-value",
      getProvider: name => providerHandlers[name],
      createConnection: async data => {
        connectionWrites.push(data);
        return { id: "connection-1", provider: data.provider, email: data.email, testStatus: data.testStatus };
      },
    });
    expect(connectionWrites).toHaveLength(1);
    expect(providerHandlers.antigravity.exchangeToken).toHaveBeenCalledWith(
      providerHandlers.antigravity.config,
      "authorization-code",
      "https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/antigravity",
      "verifier-value",
      "state-value-that-is-at-least-thirty-two-bytes",
    );
    expect(connectionWrites[0]).toEqual(expect.objectContaining({ provider: "antigravity", accessToken: "access-secret", refreshToken: "refresh-secret" }));
    expect(result).toEqual({ success: true, connection: { id: "connection-1", provider: "antigravity", email: undefined, status: "active" } });
    expect(JSON.stringify(result)).not.toMatch(/accessToken|refreshToken|authorization-code|verifier-value|access-secret/);
  });
});
