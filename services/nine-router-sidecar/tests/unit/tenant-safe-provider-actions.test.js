import { beforeEach, describe, expect, it, vi } from "vitest";

const { createConnectionMock, fetchMock } = vi.hoisted(() => ({
  createConnectionMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("../../src/lib/db/repos/connectionsRepo.js", () => ({
  createProviderConnection: createConnectionMock,
}));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: fetchMock }));

import {
  beginTenantProviderAction,
  completeTenantProviderAction,
  enableFreeProvider,
  getTenantProviderCapability,
  importTenantProviderSecret,
  pollTenantProviderProxy,
  probeFreeProvider,
  resetTenantProviderActionStateForTests,
} from "../../src/lib/oauth/tenantProviderActions.js";

const tenant = { tenantId: "1001", userId: "1001", sessionId: "session-a" };

beforeEach(() => {
  process.env.ANTIGRAVITY_OAUTH_CLIENT_ID = "fixture-antigravity-client-id";
  process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET = "fixture-antigravity-client-secret";
  process.env.GEMINI_OAUTH_CLIENT_ID = "fixture-gemini-client-id";
  process.env.GEMINI_OAUTH_CLIENT_SECRET = "fixture-gemini-client-secret";
  createConnectionMock.mockReset();
  fetchMock.mockReset();
  resetTenantProviderActionStateForTests();
  createConnectionMock.mockImplementation(async data => ({ id: "conn-1", ...data }));
});

describe("tenant-safe manual and free provider actions", () => {
  it.each([
    ["antigravity", "ANTIGRAVITY_OAUTH_CLIENT_ID"],
    ["gemini-cli", "GEMINI_OAUTH_CLIENT_ID"],
  ])("fails closed when %s runtime OAuth configuration is missing", async (provider, missingEnv) => {
    delete process.env[missingEnv];
    await expect(beginTenantProviderAction({ provider, binding: tenant }))
      .rejects.toMatchObject({ code: "OAUTH_CONFIGURATION_REQUIRED", statusCode: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it("exposes the exact reviewed capability matrix", () => {
    expect(getTenantProviderCapability("antigravity")).toEqual({ action: "manual_callback" });
    expect(getTenantProviderCapability("gemini-cli")).toEqual({ action: "manual_callback" });
    expect(getTenantProviderCapability("claude")).toEqual({ action: "manual_code" });
    expect(getTenantProviderCapability("codex")).toEqual({ action: "manual_callback" });
    for (const provider of ["cline", "kimchi", "cursor", "grok-web", "perplexity-web"]) {
      expect(getTenantProviderCapability(provider)).toEqual({ action: "manual_secret" });
    }
    expect(getTenantProviderCapability("opencode")).toEqual({ action: "free_connection" });
    expect(getTenantProviderCapability("mimo-free")).toEqual({ action: "service_probe" });
  });

  it.each(["antigravity", "gemini-cli"])("completes %s from an exact one-time loopback callback", async provider => {
    const started = await beginTenantProviderAction({ provider, binding: tenant });
    expect(started.action).toBe("manual_callback");
    const callback = new URL(started.callbackUri);
    expect(callback.protocol).toBe("http:");
    expect(["localhost", "127.0.0.1"]).toContain(callback.hostname);
    expect(started.authorizationUrl).toContain(encodeURIComponent(started.callbackUri));

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: `${provider}-access`, refresh_token: `${provider}-refresh`, expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: "user@test.invalid" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cloudaicompanionProject: "project-a", allowedTiers: [] }) });
    const result = await completeTenantProviderAction({
      provider,
      binding: tenant,
      sessionToken: started.sessionToken,
      input: `${started.callbackUri}?code=provider-code&state=${started.state}`,
    });
    expect(result.connection.provider).toBe(provider);
    expect(JSON.stringify(result)).not.toMatch(/provider-code|-access|-refresh/);
    expect(fetchMock.mock.calls[0][1].body.toString()).toContain("code_verifier=");
  });

  it("completes Claude with a PKCE-bound one-time short code and never echoes it", async () => {
    const started = await beginTenantProviderAction({ provider: "claude", binding: tenant });
    expect(started.action).toBe("manual_code");
    expect(started.authorizationUrl).toMatch(/^https:/);
    expect(started).not.toHaveProperty("codeVerifier");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 }),
    });
    const completed = await completeTenantProviderAction({
      provider: "claude",
      binding: tenant,
      sessionToken: started.sessionToken,
      input: `short-auth-code#${started.state}`,
    });
    expect(completed).toEqual({ success: true, connection: { id: "conn-1", provider: "claude", status: "active" } });
    expect(JSON.stringify(completed)).not.toMatch(/short-auth-code|access-secret|refresh-secret/);
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
    await expect(completeTenantProviderAction({ provider: "claude", binding: tenant, sessionToken: started.sessionToken, input: "again" }))
      .rejects.toMatchObject({ code: "PROVIDER_ACTION_INVALID" });
  });

  it("defaults Codex to manual callback for remote tenants instead of opening a server-local proxy", async () => {
    const started = await beginTenantProviderAction({ provider: "codex", binding: tenant });
    expect(started).toMatchObject({
      action: "manual_callback",
      callbackUri: "http://localhost:1455/auth/callback",
      proxyAvailable: false,
      proxyFailure: "remote_tenant_manual_callback",
    });
    expect(started).not.toHaveProperty("pollEndpoint");
  });

  it("accepts Codex only from the exact loopback callback and consumes wrong-state attempts", async () => {
    const started = await beginTenantProviderAction({ provider: "codex", binding: tenant });
    await expect(completeTenantProviderAction({
      provider: "codex",
      binding: tenant,
      sessionToken: started.sessionToken,
      input: `http://localhost:1455/auth/callback?code=code-only&state=wrong`,
    })).rejects.toMatchObject({ code: "PROVIDER_ACTION_INVALID" });

    const fresh = await beginTenantProviderAction({ provider: "codex", binding: tenant });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "codex-access", refresh_token: "codex-refresh", id_token: "a.eyJlbW...0ifQ.c", expires_in: 3600 }),
    });
    const result = await completeTenantProviderAction({
      provider: "codex",
      binding: tenant,
      sessionToken: fresh.sessionToken,
      input: `http://127.0.0.1:1455/auth/callback?code=code-only&state=${fresh.state}`,
    });
    expect(result.connection.provider).toBe("codex");
    expect(JSON.stringify(result)).not.toMatch(/code-only|codex-access|codex-refresh/);
  });

  it("accepts Codex callback with additional scope parameter", async () => {
    const started = await beginTenantProviderAction({ provider: "codex", binding: tenant });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "codex-scope-access", refresh_token: "codex-scope-refresh", expires_in: 3600 }),
    });
    const result = await completeTenantProviderAction({
      provider: "codex",
      binding: tenant,
      sessionToken: started.sessionToken,
      input: `http://localhost:1455/auth/callback?code=scope-code&scope=openid+profile+email+offline_access&state=${started.state}`,
    });
    expect(result.connection.provider).toBe("codex");
    expect(JSON.stringify(result)).not.toMatch(/scope-code|codex-scope-access|codex-scope-refresh/);
  });

  it("auto-completes Codex through the explicitly enabled loopback proxy and polls pending to done", async () => {
    const started = await beginTenantProviderAction({ provider: "codex", binding: tenant, enableLoopbackProxy: true });
    expect(started).toMatchObject({ proxyAvailable: true, action: "manual_callback", pollEndpoint: expect.any(String) });
    expect(pollTenantProviderProxy({ provider: "codex", binding: tenant, state: started.state })).toEqual({ status: "pending" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "proxy-access", refresh_token: "proxy-refresh", expires_in: 3600 }),
    });
    const callback = await fetch(`http://127.0.0.1:1455/auth/callback?code=proxy-code&scope=openid+profile&state=${started.state}`);
    expect(await callback.text()).toContain("Authentication Successful");
    expect(pollTenantProviderProxy({ provider: "codex", binding: tenant, state: started.state }))
      .toEqual({ status: "done", connection: { id: "conn-1", provider: "codex", status: "active" } });
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(createConnectionMock.mock.calls)).not.toContain("proxy-code");
  });

  it.each([
    "https://localhost:1455/auth/callback?code=x&state=s",
    "http://localhost:1456/auth/callback?code=x&state=s",
    "http://localhost:1455/other?code=x&state=s",
    "http://evil.test:1455/auth/callback?code=x&state=s",
    "http://user:pass@localhost:1455/auth/callback?code=x&state=s",
    "http://localhost:1455/auth/callback?code=x&state=s#fragment",
    "http://localhost:1455/auth/callback?access_token=x&state=s",
    "http://localhost:1455/auth/callback?code=x&state=s&token=evil",
    `http://localhost:1455/auth/callback?code=${"x".repeat(4096)}&state=s`,
  ])("rejects unsafe Codex callback input %s", async input => {
    const started = await beginTenantProviderAction({ provider: "codex", binding: tenant });
    await expect(completeTenantProviderAction({ provider: "codex", binding: tenant, sessionToken: started.sessionToken, input }))
      .rejects.toMatchObject({ code: "PROVIDER_ACTION_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized otherwise-valid Codex callback before exchange", async () => {
    const started = await beginTenantProviderAction({ provider: "codex", binding: tenant });
    const input = `http://localhost:1455/auth/callback?code=${"x".repeat(4096)}&state=${started.state}`;
    await expect(completeTenantProviderAction({ provider: "codex", binding: tenant, sessionToken: started.sessionToken, input }))
      .rejects.toMatchObject({ code: "PROVIDER_ACTION_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("binds manual sessions to tenant/user/session/provider and expires them", async () => {
    const started = await beginTenantProviderAction({ provider: "claude", binding: tenant, now: 1000, ttlMs: 1000 });
    await expect(completeTenantProviderAction({
      provider: "claude",
      binding: { ...tenant, tenantId: "2002" },
      sessionToken: started.sessionToken,
      input: `code#${started.state}`,
      now: 1500,
    })).rejects.toMatchObject({ code: "PROVIDER_ACTION_INVALID" });

    const expired = await beginTenantProviderAction({ provider: "claude", binding: tenant, now: 1000, ttlMs: 1000 });
    await expect(completeTenantProviderAction({ provider: "claude", binding: tenant, sessionToken: expired.sessionToken, input: `code#${expired.state}`, now: 2001 }))
      .rejects.toMatchObject({ code: "PROVIDER_ACTION_EXPIRED" });
  });

  it("enables only reviewed no-auth OpenCode after deterministic model discovery", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "model-a" }, { id: "model-b" }] }),
    });
    const result = await enableFreeProvider({ provider: "opencode" });
    expect(result).toEqual({ success: true, connection: { id: "conn-1", provider: "opencode", status: "active" }, models: ["model-a", "model-b"] });
    expect(createConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "opencode",
      authType: "none",
      providerSpecificData: { enabledModels: ["model-a", "model-b"] },
    }));
    await expect(enableFreeProvider({ provider: "mimo-free" })).rejects.toMatchObject({ code: "PROVIDER_ACTION_UNAVAILABLE" });
  });

  it("imports the exact Cline base64 callback payload and validates models before persistence", async () => {
    const payload = Buffer.from(JSON.stringify({
      accessToken: "cline-access-token-value-1234567890",
      refreshToken: "cline-refresh-token-value-1234567890",
      email: "user@test.invalid",
      firstName: "Test",
      lastName: "User",
      expiresAt: "2030-01-01T00:00:00.000Z",
    })).toString("base64url");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "cline/model-a" }] }) });
    const result = await importTenantProviderSecret({ provider: "cline", binding: tenant, input: payload });
    expect(result.models).toEqual(["cline/model-a"]);
    expect(JSON.stringify(result)).not.toMatch(/cline-access|cline-refresh/);
    expect(createConnectionMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "cline", authType: "oauth" }));
  });

  it("imports and validates exact Kimchi and web-cookie credentials without echoing them", async () => {
    for (const [provider, input, validationPayload] of [
      ["kimchi", "kimchi-token-value-12345678901234567890", { providers: ["openai"] }],
      ["grok-web", "grok-sso-value-123456789012345678901234567890", { user: { id: "1" } }],
      ["perplexity-web", "perplexity-session-value-123456789012345678901234", { user: { id: "1" } }],
    ]) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => validationPayload });
      const result = await importTenantProviderSecret({ provider, binding: tenant, input });
      expect(result.connection.provider).toBe(provider);
      expect(JSON.stringify(result)).not.toContain(input);
      expect(createConnectionMock).toHaveBeenLastCalledWith(expect.objectContaining({
        provider,
        apiKey: input,
      }));
    }
  });

  it("validates Cursor access token and machine ID through exact usable-model discovery before persistence", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [{ id: "cursor-model-a" }] }) });
    const result = await importTenantProviderSecret({
      provider: "cursor",
      binding: tenant,
      input: {
        accessToken: "cursor-access-token-value-123456789012345678901234567890",
        machineId: "0123456789abcdef0123456789abcdef",
      },
    });
    expect(result.models).toEqual(["cursor-model-a"]);
    expect(createConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "cursor",
      providerSpecificData: expect.objectContaining({ machineId: "0123456789abcdef0123456789abcdef" }),
    }));
  });

  it.each([
    ["cline", "not-base64-json"],
    ["kimchi", "short"],
    ["grok-web", "sso=value\r\nInjected: yes"],
    ["perplexity-web", "__Secure-next-auth.session-token=value\u0000"],
    ["cursor", { accessToken: "short", machineId: "not-a-machine-id" }],
  ])("rejects malformed %s imports before any upstream call", async (provider, input) => {
    await expect(importTenantProviderSecret({ provider, binding: tenant, input }))
      .rejects.toMatchObject({ code: "PROVIDER_ACTION_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it("returns a typed ended result for MiMo probe and never creates a connection", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 410, json: async () => ({}) });
    await expect(probeFreeProvider({ provider: "mimo-free" }))
      .rejects.toMatchObject({ code: "UPSTREAM_SERVICE_ENDED", statusCode: 410 });
    expect(createConnectionMock).not.toHaveBeenCalled();
  });
});
