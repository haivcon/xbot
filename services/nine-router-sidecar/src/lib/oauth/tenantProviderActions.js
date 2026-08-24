import crypto from "node:crypto";
import { getProvider } from "./providers.js";
import { generateCodeVerifier, generateCodeChallenge } from "./utils/pkce.js";
import { createProviderConnection } from "../db/repos/connectionsRepo.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { oauthProxyManager } from "./proxyServerManager.js";
import { getOAuthClient, getMissingOAuthClientEnv } from "open-sse/config/oauthClients.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_SECRET_CHARS = 16 * 1024;
const sessions = new Map();
const PROXY_PROVIDERS = new Set(["codex", "antigravity", "gemini-cli"]);

const CAPABILITIES = Object.freeze({
  antigravity: Object.freeze({ action: "manual_callback" }),
  "gemini-cli": Object.freeze({ action: "manual_callback" }),
  claude: Object.freeze({ action: "manual_code" }),
  codex: Object.freeze({ action: "manual_callback" }),
  cline: Object.freeze({ action: "manual_secret" }),
  kimchi: Object.freeze({ action: "manual_secret" }),
  cursor: Object.freeze({ action: "manual_secret" }),
  "grok-web": Object.freeze({ action: "manual_secret" }),
  "perplexity-web": Object.freeze({ action: "manual_secret" }),
  opencode: Object.freeze({ action: "free_connection" }),
  "mimo-free": Object.freeze({ action: "service_probe" }),
});

const FREE_PROVIDERS = Object.freeze({
  opencode: Object.freeze({ modelsUrl: "https://opencode.ai/zen/v1/models", name: "OpenCode Free" }),
});

const GOOGLE_LOOPBACK_REDIRECT_URI = "http://localhost:54545/callback";

function requireConfiguredOAuthClient(provider) {
  const missing = getMissingOAuthClientEnv(provider);
  if (missing.length) {
    throw actionError(
      "OAUTH_CONFIGURATION_REQUIRED",
      `OAuth configuration required: ${missing.join(", ")}`,
      409
    );
  }
  return getOAuthClient(provider);
}

const VALIDATION = Object.freeze({
  cline: Object.freeze({ url: "https://api.cline.bot/api/v1/models" }),
  kimchi: Object.freeze({
    url: "https://api.cast.ai/v1/llm/openai/supported-providers",
    modelsUrl: "https://llm.kimchi.dev/v1/models/metadata?include_in_cli=true",
  }),
  cursor: Object.freeze({ url: "https://agent.api5.cursor.sh/agent.v1.AgentService/GetUsableModels" }),
  "grok-web": Object.freeze({ url: "https://grok.com/rest/app-chat/conversations" }),
  "perplexity-web": Object.freeze({ url: "https://www.perplexity.ai/api/auth/session" }),
});

function actionError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeBinding(binding) {
  const normalized = {
    tenantId: String(binding?.tenantId || ""),
    userId: String(binding?.userId || ""),
    sessionId: String(binding?.sessionId || ""),
  };
  if (!normalized.tenantId || !normalized.userId || !normalized.sessionId) {
    throw actionError("PROVIDER_ACTION_INVALID", "Authenticated tenant session is required", 401);
  }
  return normalized;
}

function sameBinding(left, right) {
  return left.tenantId === right.tenantId
    && left.userId === right.userId
    && left.sessionId === right.sessionId;
}

function token() {
  return crypto.randomBytes(32).toString("base64url");
}

function assertBoundedString(value, label = "credential") {
  const text = String(value ?? "").trim();
  if (!text || text.length > MAX_SECRET_CHARS || /[\u0000-\u001f\u007f]/.test(text)) {
    throw actionError("PROVIDER_ACTION_INVALID", `Invalid ${label}`);
  }
  return text;
}

function parseClaudeInput(input, expectedState) {
  const value = assertBoundedString(input, "authorization code");
  const split = value.lastIndexOf("#");
  const code = split >= 0 ? value.slice(0, split) : value;
  const state = split >= 0 ? value.slice(split + 1) : expectedState;
  if (!code || state !== expectedState || code.length > 4096) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid authorization code");
  }
  return value;
}

function parseLoopbackInput(input, expectedState, expectedRedirect) {
  const value = assertBoundedString(input, "loopback callback URL");
  let url;
  try { url = new URL(value); } catch {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid loopback callback URL");
  }
  const expected = new URL(expectedRedirect);
  const keys = [...url.searchParams.keys()];
  const ALLOWED_PARAMS = new Set(["code", "state", "scope"]);
  if (url.protocol !== "http:"
    || !new Set(["localhost", "127.0.0.1"]).has(url.hostname)
    || url.port !== expected.port || url.pathname !== expected.pathname
    || url.username || url.password || url.hash
    || !keys.includes("code") || !keys.includes("state")
    || keys.some(k => !ALLOWED_PARAMS.has(k))
    || url.searchParams.get("state") !== expectedState || !url.searchParams.get("code")
    || url.searchParams.get("code").length > 4095) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid loopback callback URL");
  }
  return url.searchParams.get("code");
}

async function exchange(provider, session, code) {
  const handler = getProvider(provider);
  const config = handler.config;
  const headers = { Accept: "application/json" };
  let body;
  if (provider === "claude") {
    let authCode = code;
    let state = session.state;
    if (authCode.includes("#")) [authCode, state] = authCode.split("#", 2);
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      code: authCode, state, grant_type: "authorization_code",
      client_id: config.clientId, redirect_uri: session.redirectUri,
      code_verifier: session.codeVerifier,
    });
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const client = getOAuthClient(provider);
    body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client?.clientId || config.clientId,
      ...(client?.clientSecret ? { client_secret: client.clientSecret } : {}),
      code,
      redirect_uri: session.redirectUri,
      code_verifier: session.codeVerifier,
    });
  }
  const response = await proxyAwareFetch(config.tokenUrl, { method: "POST", headers, body });
  if (!response.ok) throw actionError("PROVIDER_ACTION_EXCHANGE_FAILED", "Provider authorization exchange failed", 502);
  const rawTokens = await response.json();

  let extra = null;
  if (provider === "antigravity" || provider === "gemini-cli") {
    const accessToken = rawTokens.access_token;
    const userInfoResponse = await proxyAwareFetch(`${config.userInfoUrl}?alt=json`, {
      method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : {};
    const loadUrl = provider === "antigravity"
      ? config.loadCodeAssistEndpoint
      : "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
    const projectResponse = await proxyAwareFetch(loadUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ metadata: { ideType: 9, platform: 5, pluginType: 2 }, ...(provider === "gemini-cli" ? { mode: 1 } : {}) }),
    });
    const projectData = projectResponse.ok ? await projectResponse.json() : {};
    extra = {
      userInfo,
      projectId: projectData.cloudaicompanionProject?.id || projectData.cloudaicompanionProject || "",
    };
  }

  const tokenData = handler.mapTokens(rawTokens, extra);
  if (!tokenData?.accessToken) throw actionError("PROVIDER_ACTION_EXCHANGE_FAILED", "Malformed provider authorization response", 502);
  return tokenData;
}

function parseCline(input) {
  const encoded = assertBoundedString(input, "Cline callback payload");
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) throw actionError("PROVIDER_ACTION_INVALID", "Invalid Cline callback payload");
  let value;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    if (Buffer.from(decoded).toString("base64url").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) throw new Error("non canonical");
    value = JSON.parse(decoded);
  } catch {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid Cline callback payload");
  }
  const allowed = new Set(["accessToken", "refreshToken", "email", "firstName", "lastName", "expiresAt"]);
  if (!value || Array.isArray(value) || Object.keys(value).some(key => !allowed.has(key))) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid Cline callback payload");
  }
  const accessToken = assertBoundedString(value.accessToken, "Cline access token");
  const refreshToken = assertBoundedString(value.refreshToken, "Cline refresh token");
  const expiresAt = new Date(value.expiresAt);
  if (accessToken.length < 20 || refreshToken.length < 20 || !Number.isFinite(expiresAt.getTime())) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid Cline callback payload");
  }
  return {
    authType: "oauth", accessToken, refreshToken,
    email: typeof value.email === "string" ? value.email.slice(0, 320) : null,
    expiresAt: expiresAt.toISOString(),
    providerSpecificData: {
      firstName: typeof value.firstName === "string" ? value.firstName.slice(0, 128) : null,
      lastName: typeof value.lastName === "string" ? value.lastName.slice(0, 128) : null,
    },
  };
}

function parseSimpleToken(input, provider) {
  let value = assertBoundedString(input, `${provider} credential`);
  if (/^https?:\/\//i.test(value) || /(?:^|;)\s*(?:domain|path|expires|max-age|httponly|secure|samesite)=/i.test(value)) {
    throw actionError("PROVIDER_ACTION_INVALID", `Invalid ${provider} credential`);
  }
  const exactPrefix = provider === "grok-web" ? "sso="
    : provider === "perplexity-web" ? "__Secure-next-auth.session-token=" : "";
  if (exactPrefix && value.startsWith(exactPrefix)) value = value.slice(exactPrefix.length);
  if (value.includes("=") && provider !== "kimchi") throw actionError("PROVIDER_ACTION_INVALID", `Invalid ${provider} credential`);
  if (value.length < 20 || !/^[\x21-\x7e]+$/.test(value)) throw actionError("PROVIDER_ACTION_INVALID", `Invalid ${provider} credential`);
  return { authType: provider === "kimchi" ? "oauth" : "cookie", apiKey: value };
}

function parseCursor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["accessToken", "machineId"].includes(key))) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid Cursor credential import");
  }
  const accessToken = assertBoundedString(input.accessToken, "Cursor access token");
  const machineId = assertBoundedString(input.machineId, "Cursor machine ID");
  if (accessToken.length < 32 || !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/i.test(machineId)) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid Cursor credential import");
  }
  return { authType: "oauth", accessToken, providerSpecificData: { machineId, ghostMode: true } };
}

function extractModels(payload) {
  const entries = Array.isArray(payload) ? payload : payload?.data || payload?.models || payload?.providers || [];
  return [...new Set(entries.map(entry => typeof entry === "string" ? entry : entry?.id || entry?.name).filter(value => typeof value === "string" && value.trim()))];
}

async function validateImport(provider, credentials) {
  const reviewed = VALIDATION[provider];
  const tokenValue = credentials.accessToken || credentials.apiKey;
  const headers = { Accept: "application/json" };
  if (provider === "grok-web") headers.Cookie = `sso=${tokenValue}`;
  else if (provider === "perplexity-web") headers.Cookie = `__Secure-next-auth.session-token=${tokenValue}`;
  else headers.Authorization = `Bearer ${tokenValue}`;
  const response = await proxyAwareFetch(reviewed.url, { method: provider === "cursor" ? "POST" : "GET", headers });
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "PROVIDER_CREDENTIAL_EXPIRED" : "PROVIDER_ACTION_VALIDATION_FAILED";
    throw actionError(code, "Provider credential validation failed", response.status === 401 || response.status === 403 ? 401 : 502);
  }
  const payload = await response.json();
  let models = extractModels(payload);
  if (provider === "kimchi" && reviewed.modelsUrl && models.length === 0) {
    const modelResponse = await proxyAwareFetch(reviewed.modelsUrl, { method: "GET", headers });
    if (!modelResponse.ok) throw actionError("PROVIDER_ACTION_VALIDATION_FAILED", "Provider model discovery failed", 502);
    models = extractModels(await modelResponse.json());
  }
  return models;
}

function safeConnection(connection) {
  return { id: connection.id, provider: connection.provider, status: connection.testStatus || "active" };
}

export function getTenantProviderCapability(provider) {
  return CAPABILITIES[String(provider || "").toLowerCase()]
    || { action: "unavailable", reason: "unsupported_auth_flow" };
}

export async function beginTenantProviderAction({
  provider,
  binding,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  enableLoopbackProxy = false,
}) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const capability = getTenantProviderCapability(normalizedProvider);
  if (!["manual_code", "manual_callback"].includes(capability.action)) {
    throw actionError("PROVIDER_ACTION_UNAVAILABLE", capability.reason || "Provider action unavailable", 409);
  }
  const normalizedBinding = normalizeBinding(binding);
  const handler = getProvider(normalizedProvider);
  const codeVerifier = generateCodeVerifier();
  const state = token();
  const sessionToken = token();
  const oauthClient = ["antigravity", "gemini-cli"].includes(normalizedProvider)
    ? requireConfiguredOAuthClient(normalizedProvider)
    : null;
  const redirectUri = normalizedProvider === "codex"
    ? "http://localhost:1455/auth/callback"
    : GOOGLE_LOOPBACK_REDIRECT_URI;
  const config = oauthClient ? { ...handler.config, ...oauthClient } : handler.config;
  const authorizationUrl = handler.buildAuthUrl(config, redirectUri, state, generateCodeChallenge(codeVerifier));
  const parsed = new URL(authorizationUrl);
  if (parsed.protocol !== "https:") throw actionError("PROVIDER_ACTION_INVALID", "Provider authorization URL must use HTTPS");
  const boundedTtl = Math.min(Math.max(Number(ttlMs) || DEFAULT_TTL_MS, 1000), DEFAULT_TTL_MS);
  sessions.set(sessionToken, {
    provider: normalizedProvider, binding: normalizedBinding, state, codeVerifier, redirectUri, expiresAt: now + boundedTtl,
  });
  let proxy = {
    success: false,
    reason: PROXY_PROVIDERS.has(normalizedProvider)
      ? "remote_tenant_manual_callback"
      : "unsupported",
  };
  if (enableLoopbackProxy && PROXY_PROVIDERS.has(normalizedProvider)) {
    proxy = await oauthProxyManager.start({
      provider: normalizedProvider,
      state,
      onCallback: ({ code, state: callbackState }) => completeTenantProviderActionFromProxy({
        provider: normalizedProvider,
        binding: normalizedBinding,
        sessionToken,
        code,
        state: callbackState,
      }),
    });
  }
  return {
    action: capability.action,
    authorizationUrl: parsed.toString(), callbackUri: redirectUri,
    sessionToken, state, expiresIn: Math.ceil(boundedTtl / 1000),
    proxyAvailable: proxy.success,
    ...(proxy.success
      ? { pollEndpoint: `/api/providers/oauth/poll-status?provider=${encodeURIComponent(normalizedProvider)}&state=${encodeURIComponent(state)}` }
      : { proxyFailure: proxy.reason }),
  };
}

export async function completeTenantProviderActionFromProxy({ provider, binding, sessionToken, code, state, now = Date.now() }) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const key = String(sessionToken || "");
  const session = sessions.get(key);
  const normalizedBinding = normalizeBinding(binding);
  if (!session || session.consumed || session.provider !== normalizedProvider || !sameBinding(session.binding, normalizedBinding)
    || session.state !== state || !PROXY_PROVIDERS.has(normalizedProvider)) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid or consumed provider action");
  }
  session.consumed = true;
  if (now > session.expiresAt) throw actionError("PROVIDER_ACTION_EXPIRED", "Provider action expired", 410);
  const boundedCode = assertBoundedString(code, "authorization code");
  if (boundedCode.length > 4095) throw actionError("PROVIDER_ACTION_INVALID", "Invalid authorization code");
  const tokenData = await exchange(normalizedProvider, session, boundedCode);
  const connection = await createProviderConnection({
    provider: normalizedProvider, authType: "oauth", ...tokenData,
    expiresAt: tokenData.expiresIn ? new Date(now + tokenData.expiresIn * 1000).toISOString() : null,
    testStatus: "active",
  });
  return { success: true, connection: safeConnection(connection) };
}

function findBoundProxySession({ provider, binding, state }) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const normalizedBinding = normalizeBinding(binding);
  for (const [sessionToken, session] of sessions) {
    if (session.provider === normalizedProvider && session.state === state && sameBinding(session.binding, normalizedBinding)) {
      return { sessionToken, session };
    }
  }
  return null;
}

export function pollTenantProviderProxy({ provider, binding, state }) {
  const found = findBoundProxySession({ provider, binding, state });
  if (!found) throw actionError("PROVIDER_ACTION_INVALID", "Invalid provider action");
  const status = oauthProxyManager.poll({ provider: String(provider || "").toLowerCase(), state: String(state || "") });
  if (status.status === "done" || status.status === "error") sessions.delete(found.sessionToken);
  return status;
}

export async function stopTenantProviderProxy({ provider, binding, state }) {
  const found = findBoundProxySession({ provider, binding, state });
  if (!found) throw actionError("PROVIDER_ACTION_INVALID", "Invalid provider action");
  sessions.delete(found.sessionToken);
  await oauthProxyManager.stop({ provider: found.session.provider, state: found.session.state });
  return { success: true };
}

export async function completeTenantProviderAction({ provider, binding, sessionToken, input, now = Date.now() }) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const key = String(sessionToken || "");
  const session = sessions.get(key);
  sessions.delete(key);
  const normalizedBinding = normalizeBinding(binding);
  if (!session || session.provider !== normalizedProvider || !sameBinding(session.binding, normalizedBinding)) {
    throw actionError("PROVIDER_ACTION_INVALID", "Invalid or consumed provider action");
  }
  if (PROXY_PROVIDERS.has(normalizedProvider)) {
    await oauthProxyManager.stop({ provider: normalizedProvider, state: session.state });
  }
  if (now > session.expiresAt) throw actionError("PROVIDER_ACTION_EXPIRED", "Provider action expired", 410);
  const code = normalizedProvider === "claude"
    ? parseClaudeInput(input, session.state)
    : parseLoopbackInput(input, session.state, session.redirectUri);
  const tokenData = await exchange(normalizedProvider, session, code);
  const connection = await createProviderConnection({
    provider: normalizedProvider, authType: "oauth", ...tokenData,
    expiresAt: tokenData.expiresIn ? new Date(now + tokenData.expiresIn * 1000).toISOString() : null,
    testStatus: "active",
  });
  return { success: true, connection: safeConnection(connection) };
}

export async function importTenantProviderSecret({ provider, binding, input }) {
  normalizeBinding(binding);
  const normalizedProvider = String(provider || "").toLowerCase();
  if (getTenantProviderCapability(normalizedProvider).action !== "manual_secret") {
    throw actionError("PROVIDER_ACTION_UNAVAILABLE", "Manual secret import is not available", 409);
  }
  const credentials = normalizedProvider === "cline" ? parseCline(input)
    : normalizedProvider === "cursor" ? parseCursor(input)
      : parseSimpleToken(input, normalizedProvider);
  const models = await validateImport(normalizedProvider, credentials);
  const connection = await createProviderConnection({
    provider: normalizedProvider,
    ...credentials,
    ...(models.length ? { providerSpecificData: { ...(credentials.providerSpecificData || {}), enabledModels: models } } : {}),
    testStatus: "active",
  });
  return { success: true, connection: safeConnection(connection), models };
}

export async function enableFreeProvider({ provider }) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const reviewed = FREE_PROVIDERS[normalizedProvider];
  if (!reviewed) throw actionError("PROVIDER_ACTION_UNAVAILABLE", "Free provider is not available", 409);
  const response = await proxyAwareFetch(reviewed.modelsUrl, { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) throw actionError("PROVIDER_ACTION_VALIDATION_FAILED", "Free provider model discovery failed", 502);
  const models = extractModels(await response.json());
  if (!models.length) throw actionError("PROVIDER_ACTION_VALIDATION_FAILED", "Free provider returned no models", 502);
  const connection = await createProviderConnection({
    provider: normalizedProvider, authType: "none", name: reviewed.name,
    providerSpecificData: { enabledModels: models }, testStatus: "active",
  });
  return { success: true, connection: safeConnection(connection), models };
}

export async function probeFreeProvider({ provider }) {
  if (String(provider || "").toLowerCase() !== "mimo-free") {
    throw actionError("PROVIDER_ACTION_UNAVAILABLE", "Service probe is not available", 409);
  }
  let response;
  try {
    response = await proxyAwareFetch("https://api.xiaomimimo.com/api/free-ai/openai/models", {
      method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw actionError("UPSTREAM_SERVICE_ENDED", "MiMo free service has ended", 410);
  }
  if (!response.ok) throw actionError("UPSTREAM_SERVICE_ENDED", "MiMo free service has ended", 410);
  const models = extractModels(await response.json());
  if (!models.length) throw actionError("UPSTREAM_SERVICE_ENDED", "MiMo free service has ended", 410);
  return { status: "available", models };
}

export async function resetTenantProviderActionStateForTests() {
  sessions.clear();
  await oauthProxyManager.stopAll();
}
