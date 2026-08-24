import REGISTRY from "open-sse/providers/registry/index.js";
import { getProvider } from "@/lib/oauth/providers";
import { getPublicRedirectCapability } from "@/lib/oauth/publicRedirect";
import { getTenantProviderCapability } from "@/lib/oauth/tenantProviderActions";

// Generic API-key providers reconciled from upstream 9Router. Each uses the
// bundled default executor and has a tenant-safe server-vault credential flow.
export const SAFE_UPSTREAM_API_KEY_PROVIDER_IDS = Object.freeze([
  "api-airforce",
  "baidu",
  "bazaarlink",
  "kilo-gateway",
  "llm7",
  "morph",
  "poolside",
  "tencent",
]);

// These IDs are backed end-to-end by the dynamic device-code and poll routes.
// Keep this explicit because registry category/auth metadata alone is not proof
// that xBot's tenant routes implement the required device flow contract.
const DEVICE_CODE_PROVIDERS = new Set([
  "codebuddy-cn",
  "github",
  "grok-cli",
  "kilocode",
  "kiro",
  "kimi-coding",
  "qoder",
  "qwen",
]);

const LOCAL_CALLBACK_PROVIDERS = new Set(["codex", "xai", "zed"]);

function authModesFor(entry) {
  const modes = new Set(Array.isArray(entry.authModes) ? entry.authModes : []);
  if (entry.authType === "apikey" || entry.category === "apikey" || entry.category === "freeTier") modes.add("apikey");
  if (entry.authType === "cookie" || entry.category === "webCookie") modes.add("cookie");
  if (entry.hasOAuth || entry.authType === "oauth" || entry.category === "oauth") modes.add("oauth");
  return [...modes].sort();
}

function hasDeviceCodeHandler(providerId) {
  if (!DEVICE_CODE_PROVIDERS.has(providerId)) return false;
  try {
    return getProvider(providerId).flowType === "device_code";
  } catch {
    return false;
  }
}

function connectionCapability(entry) {
  const modes = authModesFor(entry);
  if (hasDeviceCodeHandler(entry.id)) {
    return { action: "device_code" };
  }
  const redirect = getPublicRedirectCapability(entry.id);
  if (redirect.ready) {
    const reviewed = getTenantProviderCapability(entry.id);
    return reviewed.action === "manual_callback"
      ? { action: "oauth_redirect", fallback: reviewed }
      : { action: "oauth_redirect" };
  }
  if (redirect.reason === "configuration_required") {
    const reviewed = getTenantProviderCapability(entry.id);
    return reviewed.action === "manual_callback"
      ? reviewed
      : { action: "unavailable", reason: redirect.reason, requiredEnv: redirect.requiredEnv };
  }
  if (redirect.reason && redirect.reason !== "unsupported_auth_flow") {
    const reviewed = getTenantProviderCapability(entry.id);
    return reviewed.action === "unavailable"
      ? { action: "unavailable", reason: reviewed.reason || redirect.reason }
      : reviewed;
  }
  const reviewed = getTenantProviderCapability(entry.id);
  if (reviewed.action !== "unavailable" || reviewed.reason !== "unsupported_auth_flow") return reviewed;
  if (modes.includes("apikey")) return { action: "api_key" };
  if (modes.includes("cookie")) {
    return { action: "unavailable", reason: "cookie_capture_infrastructure_required" };
  }
  if (LOCAL_CALLBACK_PROVIDERS.has(entry.id)) {
    return { action: "unavailable", reason: redirect.reason || "local_callback_infrastructure_required" };
  }
  if (modes.includes("oauth")) {
    return { action: "unavailable", reason: redirect.reason || "public_redirect_callback_required" };
  }
  return { action: "unavailable", reason: redirect.reason || "unsupported_auth_flow" };
}

function safeProviderMetadata(entry) {
  const connection = connectionCapability(entry);
  return {
    id: entry.id,
    alias: entry.uiAlias || entry.alias || entry.id,
    aliases: [...new Set([entry.alias, entry.uiAlias, ...(entry.aliases || [])].filter(Boolean))],
    name: entry.display?.name || entry.id,
    icon: entry.display?.icon || "hub",
    category: entry.category || "unknown",
    authModes: authModesFor(entry),
    connection,
    setup: {
      website: entry.display?.website || null,
      apiKeyUrl: entry.display?.notice?.apiKeyUrl || null,
      signupUrl: entry.display?.notice?.signupUrl || null,
    },
  };
}

export function buildTenantProviderCatalog() {
  const byId = new Map();
  for (const entry of REGISTRY) {
    if (!entry?.id || entry.hidden === true || byId.has(entry.id)) continue;
    byId.set(entry.id, safeProviderMetadata(entry));
  }
  const providers = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { providers };
}
