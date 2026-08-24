"use strict";

const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

// Next bundles this module into route chunks while custom-server loads the
// packaged CJS file. Share one context across both module instances.
const storageKey = Symbol.for("xbot.nineRouterTenantStorage");
const storage = globalThis[storageKey] || (globalThis[storageKey] = new AsyncLocalStorage());
const usedNonces = new Map();
const MAX_CLOCK_SKEW_MS = 30_000;
const NONCE_HEX_LENGTH = 32;
const SHA256_HEX_LENGTH = 64;

function timingSafeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (!/^[a-f0-9]+$/.test(left) || !/^[a-f0-9]+$/.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isPrivatePeer(address = "") {
  const value = String(address).replace(/^::ffff:/, "");
  return value === "127.0.0.1"
    || value === "::1"
    || value.startsWith("10.")
    || value.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(value);
}

function normalizeRequestPath(value) {
  const rawPath = String(value || "/").split("?")[0] || "/";
  if (rawPath.includes("\\") || rawPath.includes("\0")) {
    throw Object.assign(new Error("Invalid tenant assertion path"), { statusCode: 401 });
  }

  let decoded = rawPath;
  for (let index = 0; index < 3; index += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw Object.assign(new Error("Invalid tenant assertion path"), { statusCode: 401 });
    }
    if (next === decoded) break;
    decoded = next;
  }

  const segments = decoded.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    throw Object.assign(new Error("Invalid tenant assertion path"), { statusCode: 401 });
  }
  return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
}

function calculateBodyDigest(body) {
  const payload = body === undefined || body === null
    ? Buffer.alloc(0)
    : Buffer.isBuffer(body)
      ? body
      : Buffer.from(String(body));
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function pruneUsedNonces(now = Date.now()) {
  const cutoff = now - MAX_CLOCK_SKEW_MS;
  for (const [key, seenAt] of usedNonces) {
    if (seenAt < cutoff) usedNonces.delete(key);
  }
}

function verifyTenantAssertion(req, rawBody = Buffer.alloc(0)) {
  const secret = String(process.env.ROUTER_SECRET || "");
  if (secret.length < 32) {
    throw Object.assign(new Error("Tenant assertion secret is not configured"), { statusCode: 503 });
  }

  if (!isPrivatePeer(req.socket?.remoteAddress)) {
    throw Object.assign(new Error("Tenant gateway is restricted to private peers"), { statusCode: 403 });
  }

  const tenantId = String(req.headers["x-xbot-tenant"] || "");
  const timestampText = String(req.headers["x-xbot-timestamp"] || "");
  const timestamp = Number(timestampText);
  const nonce = String(req.headers["x-xbot-nonce"] || "");
  const bodyDigest = String(req.headers["x-xbot-body-sha256"] || "");
  const signature = String(req.headers["x-xbot-signature"] || "");

  if (
    !/^\d{1,24}$/.test(tenantId)
    || !/^\d{10,16}$/.test(timestampText)
    || !Number.isSafeInteger(timestamp)
    || !new RegExp(`^[a-f0-9]{${NONCE_HEX_LENGTH}}$`).test(nonce)
    || !new RegExp(`^[a-f0-9]{${SHA256_HEX_LENGTH}}$`).test(bodyDigest)
    || !new RegExp(`^[a-f0-9]{${SHA256_HEX_LENGTH}}$`).test(signature)
  ) {
    throw Object.assign(new Error("Invalid tenant assertion"), { statusCode: 401 });
  }

  const now = Date.now();
  pruneUsedNonces(now);
  if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
    throw Object.assign(new Error("Expired tenant assertion"), { statusCode: 401 });
  }

  const replayKey = `${tenantId}:${nonce}`;
  if (usedNonces.has(replayKey)) {
    throw Object.assign(new Error("Replayed tenant assertion"), { statusCode: 401 });
  }

  const actualBodyDigest = calculateBodyDigest(rawBody);
  if (!timingSafeHexEqual(bodyDigest, actualBodyDigest)) {
    throw Object.assign(new Error("Tenant assertion body mismatch"), { statusCode: 401 });
  }

  const method = String(req.method || "GET").toUpperCase();
  const requestPath = normalizeRequestPath(req.url);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${tenantId}\n${timestamp}\n${nonce}\n${method}\n${requestPath}\n${bodyDigest}`)
    .digest("hex");

  if (!timingSafeHexEqual(signature, expected)) {
    throw Object.assign(new Error("Invalid tenant assertion"), { statusCode: 401 });
  }

  usedNonces.set(replayKey, timestamp);
  return tenantId;
}

function runWithTenant(tenantId, callback) {
  return storage.run({ tenantId }, callback);
}

function getTenantId() {
  const tenantId = storage.getStore()?.tenantId;
  if (!tenantId) throw new Error("Tenant context is required");
  return tenantId;
}

function clearUsedNoncesForTests() {
  if (process.env.NODE_ENV === "test") usedNonces.clear();
}

module.exports = {
  calculateBodyDigest,
  clearUsedNoncesForTests,
  getTenantId,
  normalizeRequestPath,
  runWithTenant,
  verifyTenantAssertion,
};