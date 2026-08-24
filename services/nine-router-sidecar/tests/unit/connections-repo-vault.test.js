import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = [];
const adapter = {
  all(sql, params = []) {
    if (sql.includes("WHERE provider = ?")) return rows.filter(row => row.provider === params[0]);
    if (sql.includes("WHERE isActive = ?")) return rows.filter(row => row.isActive === params[0]);
    return [...rows];
  },
  get(sql, params = []) {
    if (sql.includes("WHERE id = ?")) return rows.find(row => row.id === params[0]);
    return null;
  },
  run(sql, params = []) {
    if (sql.includes("INSERT INTO providerConnections")) {
      const [id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt] = params;
      const next = { id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt };
      const index = rows.findIndex(row => row.id === id);
      if (index === -1) rows.push(next); else rows[index] = next;
      return;
    }
    if (sql.includes("UPDATE providerConnections SET priority")) {
      const row = rows.find(item => item.id === params[1]);
      if (row) row.priority = params[0];
    }
  },
  transaction(fn) { fn(); },
};

vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: async () => adapter }));

const tenantContext = await import("../../tenant-context.cjs");
const repo = await import("../../src/lib/db/repos/connectionsRepo.js");

function withTenant(tenantId, callback) {
  return tenantContext.runWithTenant(tenantId, callback);
}

beforeEach(() => {
  rows.length = 0;
  process.env.NINEROUTER_VAULT_KEY = "test-only-key-material-that-is-long-enough";
});

afterEach(() => {
  delete process.env.NINEROUTER_VAULT_KEY;
});

describe("connections repository tenant vault compatibility", () => {
  it("reads a legacy plaintext row and encrypts it on a bounded update without losing fields", async () => {
    rows.push({
      id: "legacy-1", provider: "github", authType: "oauth", name: "Legacy", email: "u@example.invalid",
      priority: 1, isActive: 1,
      data: JSON.stringify({ accessToken: "legacy-token", refreshToken: "legacy-refresh", providerSpecificData: { account: "a" } }),
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const existing = await withTenant("10001", () => repo.getProviderConnectionById("legacy-1"));
    expect(existing).toMatchObject({ accessToken: "legacy-token", refreshToken: "legacy-refresh", providerSpecificData: { account: "a" } });

    await withTenant("10001", () => repo.updateProviderConnection("legacy-1", { testStatus: "active" }));
    expect(rows[0].data).toMatch(/^xbot-vault:v1:/);
    expect(rows[0].data).not.toContain("legacy-token");
    const migrated = await withTenant("10001", () => repo.getProviderConnectionById("legacy-1"));
    expect(migrated).toMatchObject({ accessToken: "legacy-token", refreshToken: "legacy-refresh", testStatus: "active", providerSpecificData: { account: "a" } });
  });

  it("round-trips API-key and OAuth connections and rejects missing or wrong tenant context", async () => {
    const api = await withTenant("10001", () => repo.createProviderConnection({ provider: "openai", authType: "apikey", name: "Primary", apiKey: "api-secret" }));
    const oauth = await withTenant("10001", () => repo.createProviderConnection({ provider: "gemini-cli", authType: "oauth", email: "u@example.invalid", accessToken: "access", refreshToken: "refresh" }));

    await expect(repo.getProviderConnectionById(api.id)).rejects.toThrow("Tenant context is required");
    await expect(withTenant("20002", () => repo.getProviderConnectionById(oauth.id))).rejects.toThrow();
    await expect(withTenant("10001", () => repo.getProviderConnectionById(api.id))).resolves.toMatchObject({ apiKey: "api-secret", authType: "apikey" });
    await expect(withTenant("10001", () => repo.getProviderConnectionById(oauth.id))).resolves.toMatchObject({ accessToken: "access", refreshToken: "refresh", authType: "oauth" });
  });

  it.each([
    ["cline", { authType: "oauth", accessToken: "cline-access", refreshToken: "cline-refresh" }],
    ["kimchi", { authType: "oauth", apiKey: "kimchi-secret" }],
    ["cursor", { authType: "oauth", accessToken: "cursor-access", providerSpecificData: { machineId: "0123456789abcdef0123456789abcdef" } }],
    ["grok-web", { authType: "cookie", apiKey: "grok-cookie-secret" }],
    ["perplexity-web", { authType: "cookie", apiKey: "perplexity-cookie-secret" }],
  ])("encrypts %s imported credentials and denies cross-tenant read", async (provider, credentials) => {
    const connection = await withTenant("10001", () => repo.createProviderConnection({
      provider,
      ...credentials,
      providerSpecificData: { ...(credentials.providerSpecificData || {}), enabledModels: [`${provider}-model`] },
    }));
    const row = rows.find(item => item.id === connection.id);
    expect(row.data).toMatch(/^xbot-vault:v1:/);
    for (const secret of [credentials.accessToken, credentials.refreshToken, credentials.apiKey].filter(Boolean)) {
      expect(row.data).not.toContain(secret);
    }
    await expect(withTenant("20002", () => repo.getProviderConnectionById(connection.id))).rejects.toThrow();
    await expect(withTenant("10001", () => repo.getProviderConnectionById(connection.id))).resolves.toMatchObject({
      provider,
      providerSpecificData: expect.objectContaining({ enabledModels: [`${provider}-model`] }),
    });
  });
});
