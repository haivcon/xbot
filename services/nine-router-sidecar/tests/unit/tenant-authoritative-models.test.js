import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
  getDisabledModels: vi.fn(),
  proxyAwareFetch: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getCombos: mocks.getCombos,
  getCustomModels: mocks.getCustomModels,
  getModelAliases: mocks.getModelAliases,
}));
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: mocks.getDisabledModels,
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: mocks.proxyAwareFetch,
}));

const { buildModelsList } = await import("../../src/app/api/v1/models/route.js");

describe("tenant-authoritative model discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderConnections.mockResolvedValue([]);
    mocks.getCombos.mockResolvedValue([]);
    mocks.getCustomModels.mockResolvedValue([]);
    mocks.getModelAliases.mockResolvedValue({});
    mocks.getDisabledModels.mockResolvedValue({});
  });

  it("returns no available models when the tenant has no active provider connection", async () => {
    await expect(buildModelsList(["llm"])).resolves.toEqual([]);
  });

  it("returns only explicitly enabled models from the tenant active connection", async () => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: "conn-a",
      provider: "openai",
      isActive: true,
      providerSpecificData: { enabledModels: ["gpt-4.1-mini"] },
    }]);

    const models = await buildModelsList(["llm"]);
    expect(models.map((model) => model.id)).toEqual(["openai/gpt-4.1-mini"]);
  });

  it("treats a connected custom OpenAI-compatible node as an LLM provider", async () => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: "custom-conn",
      provider: "openai-compatible-chat-custom",
      isActive: true,
      providerSpecificData: { prefix: "mock", enabledModels: ["mock-only-model"] },
    }]);

    const models = await buildModelsList(["llm"]);
    expect(models.map((model) => model.id)).toEqual(["mock/mock-only-model"]);
  });

  it("discovers dynamic models for a connected custom OpenAI-compatible node", async () => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: "custom-dynamic-conn",
      provider: "openai-compatible-chat-dynamic",
      isActive: true,
      apiKey: "test-key",
      providerSpecificData: { prefix: "mock", baseUrl: "http://127.0.0.1:12345" },
    }]);
    mocks.proxyAwareFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "mock-only-model" }] }),
    });

    const models = await buildModelsList(["llm"]);
    expect(mocks.proxyAwareFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:12345/models",
      expect.objectContaining({ method: "GET" }),
      expect.objectContaining({ connectionProxyEnabled: false }),
    );
    expect(models.map((model) => model.id)).toEqual(["mock/mock-only-model"]);
  });

  it("discovers Codex models from an active tenant connection", async () => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: "codex-connection",
      provider: "codex",
      isActive: true,
      accessToken: "vault-token",
      providerSpecificData: { chatgptAccountId: "account-a" },
    }]);
    mocks.proxyAwareFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-5.6-terra", display_name: "GPT-5.6 Terra" }] }),
    });

    const models = await buildModelsList(["llm"]);

    expect(mocks.proxyAwareFetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer vault-token",
          "ChatGPT-Account-ID": "account-a",
        }),
      }),
      expect.objectContaining({ connectionProxyEnabled: false }),
    );
    expect(models.map((model) => model.id)).toEqual([
      "cx/gpt-5.6-terra",
      "cx/gpt-5.6-terra-review",
    ]);
  });

  it("does not expose models from inactive provider connections", async () => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: "conn-disabled",
      provider: "openai",
      isActive: false,
      providerSpecificData: { enabledModels: ["gpt-4.1-mini"] },
    }]);

    await expect(buildModelsList(["llm"])).resolves.toEqual([]);
  });

  it.each([
    ["cline", "cl"],
    ["kimchi", "kimchi"],
    ["cursor", "cu"],
    ["grok-web", "gw"],
    ["perplexity-web", "pw"],
  ])("exposes exact same-tenant enabled models for %s and zero after disconnect", async (provider, publicAlias) => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: `${provider}-connection`,
      provider,
      isActive: true,
      providerSpecificData: { enabledModels: [`${provider}-model`] },
    }]);
    expect((await buildModelsList(["llm"])).map(model => model.id)).toEqual([`${publicAlias}/${provider}-model`]);

    mocks.getProviderConnections.mockResolvedValue([]);
    await expect(buildModelsList(["llm"])).resolves.toEqual([]);
  });

  it.each(["cline", "kimchi", "cursor", "grok-web", "perplexity-web"])("does not expose %s models after disable", async provider => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: `${provider}-disabled`,
      provider,
      isActive: false,
      providerSpecificData: { enabledModels: [`${provider}-model`] },
    }]);
    await expect(buildModelsList(["llm"])).resolves.toEqual([]);
  });

  it("returns a combo only when all of its members are available", async () => {
    mocks.getProviderConnections.mockResolvedValue([{
      id: "conn-a",
      provider: "openai",
      isActive: true,
      providerSpecificData: { enabledModels: ["gpt-4.1-mini"] },
    }]);
    mocks.getCombos.mockResolvedValue([
      { name: "ready-combo", models: ["openai/gpt-4.1-mini"] },
      { name: "stale-combo", models: ["openai/gpt-4.1-mini", "anthropic/claude-missing"] },
    ]);

    const models = await buildModelsList(["llm"]);
    expect(models.map((model) => model.id)).toEqual(["openai/gpt-4.1-mini", "ready-combo"]);
  });
});
