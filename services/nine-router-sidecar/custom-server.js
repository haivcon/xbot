const http = require("http");
const { Readable } = require("stream");
const {
  runWithTenant,
  verifyTenantAssertion,
} = require("./tenant-context.cjs");

const origCreate = http.createServer.bind(http);
const MAX_ASSERTED_BODY_BYTES = 1024 * 1024;

function isTenantProtectedPath(requestPath) {
  return requestPath.startsWith("/api/")
    || requestPath === "/api"
    || requestPath.startsWith("/v1/")
    || requestPath === "/v1"
    || requestPath.startsWith("/v1beta/");
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_ASSERTED_BODY_BYTES) {
        const error = Object.assign(new Error("Tenant request body is too large"), { statusCode: 413 });
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.once("end", () => resolve(Buffer.concat(chunks)));
    req.once("aborted", () => reject(Object.assign(new Error("Tenant request was aborted"), { statusCode: 400 })));
    req.once("error", reject);
  });
}

function createReplayRequest(req, rawBody) {
  const replay = Readable.from(rawBody.length ? [rawBody] : []);
  for (const name of [
    "method",
    "url",
    "headers",
    "rawHeaders",
    "httpVersion",
    "httpVersionMajor",
    "httpVersionMinor",
    "trailers",
    "rawTrailers",
  ]) {
    replay[name] = req[name];
  }
  Object.defineProperties(replay, {
    socket: { value: req.socket, enumerable: true },
    connection: { value: req.connection, enumerable: true },
    complete: { value: true, enumerable: true },
  });
  return replay;
}

function sendTenantError(res, error) {
  if (res.headersSent || res.writableEnded) return;
  res.statusCode = error.statusCode || 401;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: "Tenant authentication failed" }));
}

// Wrap Next standalone HTTP server: derive client IP from the TCP socket
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);

  const wrapped = (req, res) => {
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1"
      || socketIp === "::1"
      || socketIp === "::ffff:127.0.0.1";
    // Trust forwarding headers only when the TCP peer is a local reverse proxy.
    // Direct/public sockets remain keyed by the unspoofable peer address.
    const proxyIp = xRealIp || (xff ? String(xff).split(",")[0].trim() : "");
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
    delete req.headers["x-9r-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-9r-via-proxy"];
    delete req.headers["x-9r-tenant-authenticated"];
    req.headers["x-9r-real-ip"] = ip;
    if (viaProxy) req.headers["x-9r-via-proxy"] = "1";

    const requestPath = String(req.url || "/").split("?")[0];
    if (!isTenantProtectedPath(requestPath)) return handler(req, res);

    return collectRequestBody(req)
      .then((rawBody) => {
        const tenantId = verifyTenantAssertion(req, rawBody);
        const replay = createReplayRequest(req, rawBody);
        delete replay.headers["x-xbot-signature"];
        delete replay.headers["x-xbot-body-sha256"];
        replay.headers["x-9r-tenant-authenticated"] = "1";
        return runWithTenant(tenantId, () => handler(replay, res));
      })
      .catch((error) => sendTenantError(res, error));
  };

  return origCreate(...rest, wrapped);
};

require("./server.js");