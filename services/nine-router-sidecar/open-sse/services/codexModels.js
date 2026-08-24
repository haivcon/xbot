import { resolveConnectionProxyConfig } from "../../src/lib/network/connectionProxy.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";

export const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0";

const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

export const appendCodexReviewModels = (models) => models.flatMap((model) => {
  const id = model?.id || model?.slug || model?.model || model?.name;
  if (!id) return [];
  const name = model?.display_name || model?.displayName || model?.name || id;
  const normalized = { ...model, id, name };
  const isChatModel = (model?.type || "llm") !== "image" && !id.toLowerCase().includes("embed");
  if (!isChatModel || id.endsWith("-review")) return [normalized];
  return [
    normalized,
    {
      ...normalized,
      id: `${id}-review`,
      name: `${name} Review`,
      upstreamModelId: id,
      quotaFamily: "review",
    },
  ];
});

export async function resolveCodexModels(connection, { fetchFn = proxyAwareFetch } = {}) {
  const token = connection?.accessToken || connection?.apiKey;
  if (!token) return { error: "No valid token found", status: 401 };

  const providerSpecificData = connection?.providerSpecificData || {};
  const accountId = providerSpecificData.workspaceId
    || providerSpecificData.chatgptAccountId
    || providerSpecificData.accountId;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (typeof accountId === "string" && accountId) {
    headers["ChatGPT-Account-ID"] = accountId;
  }

  const proxy = await resolveConnectionProxyConfig(providerSpecificData) || {};
  const response = await fetchFn(CODEX_MODELS_URL, {
    method: "GET",
    headers,
    cache: "no-store",
  }, {
    connectionProxyEnabled: proxy.connectionProxyEnabled === true,
    connectionProxyUrl: proxy.connectionProxyUrl || "",
    connectionNoProxy: proxy.connectionNoProxy || "",
    vercelRelayUrl: proxy.vercelRelayUrl || "",
    strictProxy: proxy.strictProxy === true,
  });

  if (!response.ok) {
    return { error: `Failed to fetch models: ${response.status}`, status: response.status };
  }
  const data = await response.json();
  return { models: appendCodexReviewModels(parseOpenAIStyleModels(data)) };
}
