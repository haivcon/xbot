import { generateCodeVerifier, generateCodeChallenge } from "./utils/pkce.js";
import { getMissingOAuthClientEnv } from "open-sse/config/oauthClients.js";

export const PUBLIC_REDIRECT_PROVIDER_IDS = Object.freeze(["antigravity", "gemini-cli"]);
const PUBLIC_REDIRECT_PROVIDERS = new Set(PUBLIC_REDIRECT_PROVIDER_IDS);

const BLOCKED_REASONS = Object.freeze({
  claude: "manual_code_exchange_only",
  cline: "credential_in_callback_url_not_allowed",
  cursor: "local_token_import_only",
  kimchi: "credential_in_callback_url_not_allowed",
  codex: "loopback_redirect_registration_required",
  "grok-web": "secure_cookie_capture_not_supported",
  "perplexity-web": "secure_cookie_capture_not_supported",
  "mimo-free": "no_account_authentication_flow",
  opencode: "no_account_authentication_flow",
});

function publicRedirectError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function validateCallbackUri(provider, callbackUri) {
  let url;
  try { url = new URL(String(callbackUri || "")); } catch {
    throw publicRedirectError("PUBLIC_REDIRECT_INVALID", "Invalid public callback URI");
  }
  const expectedSuffix = `/api/dashboard/ai/9router/oauth/callback/${provider}`;
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(expectedSuffix)) {
    throw publicRedirectError("PUBLIC_REDIRECT_INVALID", "Invalid public callback URI");
  }
  return url.toString();
}

export function getPublicRedirectCapability(provider) {
  const normalized = String(provider || "").toLowerCase();
  if (PUBLIC_REDIRECT_PROVIDERS.has(normalized)) {
    const requiredEnv = getMissingOAuthClientEnv(normalized);
    if (requiredEnv.length) return { ready: false, reason: "configuration_required", requiredEnv };
  }
  if (PUBLIC_REDIRECT_PROVIDERS.has(normalized)) return { ready: true, action: "oauth_redirect" };
  return { ready: false, reason: BLOCKED_REASONS[normalized] || "unsupported_auth_flow" };
}

export async function authorizePublicRedirect({ provider, callbackUri, state, getProvider }) {
  const normalized = String(provider || "").toLowerCase();
  const capability = getPublicRedirectCapability(normalized);
  if (!capability.ready) {
    const statusCode = capability.reason === "configuration_required" ? 409 : 400;
    throw publicRedirectError(
      capability.reason === "configuration_required" ? "OAUTH_CONFIGURATION_REQUIRED" : "PUBLIC_REDIRECT_UNAVAILABLE",
      capability.reason,
      statusCode
    );
  }
  const callback = validateCallbackUri(normalized, callbackUri);
  const expectedState = String(state || "");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(expectedState)) {
    throw publicRedirectError("PUBLIC_REDIRECT_INVALID", "Invalid OAuth state");
  }
  const handler = getProvider(normalized);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const providerCallback = callback;
  const authorizationUrl = handler.flowType === "authorization_code_pkce"
    ? handler.buildAuthUrl(handler.config, providerCallback, expectedState, codeChallenge)
    : handler.buildAuthUrl(handler.config, providerCallback, expectedState, codeChallenge);
  const parsed = new URL(authorizationUrl);
  if (parsed.protocol !== "https:") throw publicRedirectError("PUBLIC_REDIRECT_INVALID", "Provider authorization URL must use HTTPS");
  return { authorizationUrl: parsed.toString(), state: expectedState, codeVerifier };
}

export async function exchangePublicRedirect({
  provider,
  callbackUri,
  state,
  code,
  codeVerifier,
  getProvider,
  createConnection,
}) {
  const normalized = String(provider || "").toLowerCase();
  const capability = getPublicRedirectCapability(normalized);
  if (!capability.ready) {
    const configurationRequired = capability.reason === "configuration_required";
    throw publicRedirectError(
      configurationRequired ? "OAUTH_CONFIGURATION_REQUIRED" : "PUBLIC_REDIRECT_UNAVAILABLE",
      capability.reason,
      configurationRequired ? 409 : 400
    );
  }
  const callback = validateCallbackUri(normalized, callbackUri);
  const expectedState = String(state || "");
  const authCode = String(code || "");
  if (!expectedState || !authCode || !String(codeVerifier || "")) {
    throw publicRedirectError("PUBLIC_REDIRECT_INVALID", "Missing redirect exchange fields");
  }
  const handler = getProvider(normalized);
  const providerCallback = callback;
  const rawTokens = await handler.exchangeToken(handler.config, authCode, providerCallback, codeVerifier, expectedState);
  let extra = null;
  if (handler.postExchange) extra = await handler.postExchange(rawTokens);
  const tokenData = handler.mapTokens(rawTokens, extra);
  if (!tokenData?.accessToken) throw publicRedirectError("PUBLIC_REDIRECT_EXCHANGE_FAILED", "Malformed provider token response", 502);
  const connection = await createConnection({
    provider: normalized,
    authType: "oauth",
    ...tokenData,
    expiresAt: tokenData.expiresIn ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString() : null,
    testStatus: "active",
  });
  return {
    success: true,
    connection: {
      id: connection.id,
      provider: connection.provider,
      email: connection.email,
      status: connection.testStatus || "active",
    },
  };
}
