/**
 * Operator-owned Google OAuth Web application client credentials.
 *
 * Environment values are accessed dynamically so Next.js cannot inline private
 * credentials into browser bundles that import provider metadata. Upstream's
 * bundled public/native clients are intentionally not imported: their loopback
 * redirect registration cannot authorize xBot's public HTTPS callbacks.
 */

function readPrivateEnv(name) {
  if (typeof process === "undefined" || !process?.env) return "";
  return String(process.env[name] || "").trim();
}

const OAUTH_CLIENT_ENV = Object.freeze({
  antigravity: Object.freeze({
    clientId: "ANTIGRAVITY_OAUTH_CLIENT_ID",
    clientSecret: "ANTIGRAVITY_OAUTH_CLIENT_SECRET",
  }),
  "gemini-cli": Object.freeze({
    clientId: "GEMINI_OAUTH_CLIENT_ID",
    clientSecret: "GEMINI_OAUTH_CLIENT_SECRET",
  }),
  gemini: Object.freeze({
    clientId: "GEMINI_OAUTH_CLIENT_ID",
    clientSecret: "GEMINI_OAUTH_CLIENT_SECRET",
  }),
});

function createOAuthClient(clientIdEnv, clientSecretEnv) {
  return Object.freeze({
    clientId: readPrivateEnv(clientIdEnv),
    clientSecret: readPrivateEnv(clientSecretEnv),
  });
}

export function getOAuthClient(provider) {
  const env = OAUTH_CLIENT_ENV[String(provider || "").toLowerCase()];
  return env ? createOAuthClient(env.clientId, env.clientSecret) : Object.freeze({});
}

export function getMissingOAuthClientEnv(provider) {
  const env = OAUTH_CLIENT_ENV[String(provider || "").toLowerCase()];
  if (!env) return [];
  return Object.values(env).filter(name => !readPrivateEnv(name));
}

export const GOOGLE_OAUTH_CLIENT = getOAuthClient("gemini-cli");
export const ANTIGRAVITY_OAUTH_CLIENT = getOAuthClient("antigravity");

/**
 * Fail before starting an OAuth request when deployment credentials are absent.
 */
export function requireOAuthClient(client, providerName, envPrefix) {
  const missing = [];
  if (!client?.clientId) missing.push(`${envPrefix}_CLIENT_ID`);
  if (!client?.clientSecret) missing.push(`${envPrefix}_CLIENT_SECRET`);

  if (missing.length) {
    throw new Error(
      `${providerName} OAuth is not configured. Set ${missing.join(" and ")} in the server environment.`
    );
  }

  return client;
}