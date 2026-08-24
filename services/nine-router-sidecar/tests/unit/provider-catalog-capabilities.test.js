import { describe, expect, it } from "vitest";
import {
  buildTenantProviderCatalog,
  SAFE_UPSTREAM_API_KEY_PROVIDER_IDS,
} from "../../src/lib/providerCatalog.js";
import { AI_PROVIDERS } from "../../src/shared/constants/providers.js";
import fs from "node:fs";
import inventoryFixture from "../fixtures/provider-catalog.inventory.json";

const sidecarRoot = new URL("../../", import.meta.url);
const repoRoot = new URL("../../../../", import.meta.url);
const readSidecar = (relative) => fs.readFileSync(new URL(relative, sidecarRoot), "utf8");
const readRepo = (relative) => fs.readFileSync(new URL(relative, repoRoot), "utf8");

const EXPECTED_SAFE_UPSTREAM_API_KEY_PROVIDERS = [
  "api-airforce",
  "baidu",
  "bazaarlink",
  "kilo-gateway",
  "llm7",
  "morph",
  "poolside",
  "tencent",
];

describe("tenant provider catalog capabilities", () => {
  it("surfaces every reconciled upstream API-key provider that the bundled generic executor can safely connect", () => {
    expect(SAFE_UPSTREAM_API_KEY_PROVIDER_IDS).toEqual(EXPECTED_SAFE_UPSTREAM_API_KEY_PROVIDERS);
    for (const id of EXPECTED_SAFE_UPSTREAM_API_KEY_PROVIDERS) {
      expect(AI_PROVIDERS[id]?.authModes).toContain("apikey");
    }
  });

  it("deduplicates canonical provider IDs and exposes safe actions only", () => {
    const catalog = buildTenantProviderCatalog();
    expect(new Set(catalog.providers.map((provider) => provider.id)).size).toBe(catalog.providers.length);
    expect(catalog.providers.find((provider) => provider.id === "github")?.connection.action).toBe("device_code");
    expect(catalog.providers.find((provider) => provider.id === "codebuddy-cn")?.connection.action).toBe("device_code");
    expect(catalog.providers.find((provider) => provider.id === "grok-cli")?.connection.action).toBe("device_code");
    const reasons = Object.fromEntries(catalog.providers.map(provider => [provider.id, provider.connection]));
    const frozenIds = ["antigravity", "gemini-cli", "claude", "codex", "cline", "kimchi", "cursor", "grok-web", "perplexity-web", "opencode", "mimo-free"];
    expect(reasons.claude).toEqual({ action: "manual_code" });
    expect(reasons.cline).toEqual({ action: "manual_secret" });
    expect(reasons.cursor).toEqual({ action: "manual_secret" });
    expect(reasons.kimchi).toEqual({ action: "manual_secret" });
    expect(reasons.codex).toEqual({ action: "manual_callback" });
    expect(reasons["grok-web"]).toEqual({ action: "manual_secret" });
    expect(reasons["perplexity-web"]).toEqual({ action: "manual_secret" });
    expect(reasons["mimo-free"]).toEqual({ action: "service_probe" });
    expect(reasons.opencode).toEqual({ action: "free_connection" });
    for (const id of ["antigravity", "gemini-cli"]) {
      expect(["oauth_redirect", "manual_callback"]).toContain(reasons[id].action);
      if (reasons[id].action === "oauth_redirect") expect(reasons[id].fallback).toEqual({ action: "manual_callback" });
    }
    expect(frozenIds.every(id => reasons[id]?.action !== "unavailable")).toBe(true);
    expect(catalog.providers.some((provider) => provider.id === "zed")).toBe(false);
    expect(catalog.providers.every((provider) => ["api_key", "device_code", "oauth_redirect", "manual_code", "manual_callback", "manual_secret", "free_connection", "service_probe", "unavailable"].includes(provider.connection.action))).toBe(true);
  });

  it("returns one canonical providers array without duplicate compatibility lists", () => {
    const catalog = buildTenantProviderCatalog();
    expect(Object.keys(catalog)).toEqual(["providers"]);
    expect(catalog.providers.map((provider) => provider.id).sort()).toEqual(inventoryFixture.providerIds);
    expect(catalog.providers.filter((provider) => provider.connection.action === "device_code").map((provider) => provider.id).sort()).toEqual(inventoryFixture.deviceCodeProviderIds);
  });

  it("imports exactly the eight reconciled upstream registry files once", () => {
    const indexSource = readSidecar("open-sse/providers/registry/index.js");
    const imported = [...indexSource.matchAll(/import\s+p\d+\s+from\s+["']\.\/([^"']+)\.js["']/g)].map((match) => match[1]);
    for (const id of EXPECTED_SAFE_UPSTREAM_API_KEY_PROVIDERS) {
      expect(imported.filter((value) => value === id)).toHaveLength(1);
    }
    expect(imported.filter((id) => EXPECTED_SAFE_UPSTREAM_API_KEY_PROVIDERS.includes(id))).toHaveLength(8);
  });

  it("returns metadata only and never serializes credential fields", () => {
    const payload = JSON.stringify(buildTenantProviderCatalog());
    expect(payload).not.toMatch(/accessToken|refreshToken|clientSecret|apiKey\"\s*:/);
  });

  it("never uses the static provider model catalog as tenant availability fallback", () => {
    const modelRoute = readSidecar("src/app/api/v1/models/route.js");
    expect(modelRoute).toMatch(/Tenant model\s*\r?\n?\s*\/\/ availability must come from an explicit enabled list or live discovery\./i);
    expect(modelRoute).not.toMatch(/:\s*providerModels\.map\(\(model\)\s*=>\s*model\.id\)/);
  });

  it("keeps large authoritative model lists searchable, grouped, and selection-safe in Chat AI", () => {
    const chatPage = readRepo("dashboard/xBot/src/pages/user/ChatPage.jsx");
    expect(chatPage).toMatch(/modelSearch|Search models/i);
    expect(chatPage).toMatch(/model\.provider\s*!==\s*'9router'/);
    expect(chatPage).toMatch(/upstream\.id|modelsByUpstream/);
    expect(chatPage).toMatch(/if\s*\(!modelOptions\.some\(model\s*=>\s*model\.id\s*===\s*selectedModel\)\)/);
  });

  it("renders every catalog capability truthfully without persisting provider credentials", () => {
    const settings = readRepo("dashboard/xBot/src/components/chat/NineRouterSettings.jsx");
    expect(settings).toMatch(/catalog\.providers/);
    expect(settings).toMatch(/connection\?\.action\s*===\s*'api_key'/);
    expect(settings).toMatch(/provider:\s*provider\.id/);
    expect(settings).toMatch(/connection\?\.reason/);
    expect(settings).not.toMatch(/localStorage\.setItem\([^\n]*(apiKey|credential|token)/i);
  });
});
