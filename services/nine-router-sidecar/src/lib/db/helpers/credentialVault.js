import crypto from "node:crypto";

const PREFIX = "xbot-vault:v1:";

function getMasterKey() {
  const dedicated = String(process.env.NINEROUTER_VAULT_KEY || "");
  const fallback = String(process.env.ROUTER_SECRET || "");
  const material = dedicated || fallback;
  const minimumLength = dedicated ? 32 : 64;
  if (material.length < minimumLength) {
    throw Object.assign(new Error("Tenant credential vault is not configured"), {
      code: "NINEROUTER_VAULT_KEY_INVALID",
    });
  }
  return crypto.createHash("sha256").update(material).digest();
}

function assertContext(tenantId, connectionId) {
  if (!String(tenantId || "").trim() || !String(connectionId || "").trim()) {
    throw Object.assign(new Error("Tenant credential vault context is required"), {
      code: "NINEROUTER_VAULT_CONTEXT_INVALID",
    });
  }
}

function tenantKey(masterKey, tenantId) {
  return crypto.hkdfSync("sha256", masterKey, Buffer.from("xbot-nine-router-vault"), Buffer.from(String(tenantId)), 32);
}

export function encryptConnectionData(value, { tenantId, connectionId }) {
  assertContext(tenantId, connectionId);
  const iv = crypto.randomBytes(12);
  const key = tenantKey(getMasterKey(), tenantId);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`connection:${connectionId}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value ?? null), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptConnectionData(value, { tenantId, connectionId }) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  assertContext(tenantId, connectionId);
  const parts = value.slice(PREFIX.length).split(".");
  if (parts.length !== 3) throw new Error("Invalid tenant credential vault record");
  const [ivText, tagText, dataText] = parts;
  const key = tenantKey(getMasterKey(), tenantId);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAAD(Buffer.from(`connection:${connectionId}`));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

export function isEncryptedConnectionData(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}
