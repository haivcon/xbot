import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const sidecarRoot = path.resolve(import.meta.dirname, "../..");
const standaloneRoot = path.join(sidecarRoot, ".next", "standalone");
const { createTenantHeaders } = require(path.join(repoRoot, "src/services/nineRouterTenantClient.js"));
const secret = crypto.createHash("sha256").update("nine-router-integration-fixture").digest("hex");
const tenantA = "10001";
const tenantB = "20002";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function getFreePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function signedHeaders(tenantId, method, requestPath, body) {
  process.env.ROUTER_SECRET = secret;
  process.env.ROUTER_URL = "http://127.0.0.1";
  return createTenantHeaders({ tenantId, method, path: requestPath, body });
}

function staleHeaders(tenantId, requestPath) {
  const timestamp = Date.now() - 60_000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyDigest = crypto.createHash("sha256").update("").digest("hex");
  const signature = crypto.createHmac("sha256", secret)
    .update(`${tenantId}\n${timestamp}\n${nonce}\nGET\n${requestPath}\n${bodyDigest}`)
    .digest("hex");
  return {
    "x-xbot-tenant": tenantId,
    "x-xbot-timestamp": String(timestamp),
    "x-xbot-nonce": nonce,
    "x-xbot-body-sha256": bodyDigest,
    "x-xbot-signature": signature,
  };
}

async function request(base, label, requestPath, { tenantId, method = "GET", body, headers } = {}) {
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  const assertion = headers || (tenantId ? signedHeaders(tenantId, method, requestPath, serializedBody) : {});
  const response = await fetch(`${base}${requestPath}`, {
    method,
    headers: { ...assertion, ...(serializedBody ? { "content-type": "application/json" } : {}) },
    body: serializedBody,
  });
  const payload = await response.json();
  console.log(JSON.stringify({ label, status: response.status, modelCount: payload?.data?.length, error: payload?.error }));
  return { response, payload, headers: assertion };
}

function assertRedacted(value, trail = "root") {
  const forbidden = /^(apiKey|accessToken|refreshToken|idToken|token|cookie|credentials|secret)$/i;
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!forbidden.test(key), `secret-bearing key ${trail}.${key}`);
    assertRedacted(child, `${trail}.${key}`);
  }
}

async function waitReady(base, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`sidecar exited early: ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("sidecar readiness timeout");
}

for (const file of ["server.js", "custom-server.js", "tenant-context.cjs"]) {
  const source = file === "server.js" ? path.join(standaloneRoot, file) : path.join(sidecarRoot, file);
  assert(fs.existsSync(source), `missing production artifact ${source}; run npm run build first`);
  if (file !== "server.js") fs.copyFileSync(source, path.join(standaloneRoot, file));
}

const mockRequests = [];
let mockModelIds = ["mock-only-model"];
const mockServer = http.createServer((req, res) => {
  mockRequests.push({ method: req.method, path: req.url });
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ object: "list", data: mockModelIds.map((id) => ({ id })) }));
});
const mockPort = await listen(mockServer);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xbot-nine-router-integration-"));
const port = await getFreePort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["custom-server.js"], {
  cwd: standaloneRoot,
  env: { ...process.env, DATA_DIR: dataDir, ROUTER_SECRET: secret, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitReady(base, child);
  const unsigned = await request(base, "unsigned catalog", "/api/providers/catalog");
  assert.equal(unsigned.response.status, 401);

  const catalog = await request(base, "signed catalog", "/api/providers/catalog", { tenantId: tenantA });
  assert.equal(catalog.response.status, 200);
  assertRedacted(catalog.payload);
  assert.deepEqual(Object.keys(catalog.payload), ["providers"]);
  assert(Array.isArray(catalog.payload.providers));

  const replay = await request(base, "replayed catalog", "/api/providers/catalog", { headers: catalog.headers });
  assert.equal(replay.response.status, 401);
  const stale = await request(base, "stale catalog", "/api/providers/catalog", { headers: staleHeaders(tenantA, "/api/providers/catalog") });
  assert.equal(stale.response.status, 401);

  const wrongSecret = crypto.createHash("sha256").update("wrong-integration-secret").digest("hex");
  process.env.ROUTER_SECRET = wrongSecret;
  const wrongHeaders = createTenantHeaders({ tenantId: tenantA, method: "GET", path: "/api/providers" });
  process.env.ROUTER_SECRET = secret;
  const wrong = await request(base, "wrong secret providers", "/api/providers", { headers: wrongHeaders });
  assert.equal(wrong.response.status, 401);

  const providers = await request(base, "signed providers", "/api/providers", { tenantId: tenantA });
  assert.equal(providers.response.status, 200);
  assert.deepEqual(providers.payload.connections, []);

  for (const tenantId of [tenantA, tenantB]) {
    const empty = await request(base, `empty models tenant ${tenantId}`, "/v1/models", { tenantId });
    assert.equal(empty.response.status, 200);
    assert.deepEqual(empty.payload.data, []);
  }

  const node = await request(base, "create mocked node", "/api/provider-nodes", {
    tenantId: tenantA,
    method: "POST",
    body: { name: "Mock provider", prefix: "mock", apiType: "chat", type: "openai-compatible", baseUrl: `http://127.0.0.1:${mockPort}` },
  });
  assert.equal(node.response.status, 201);

  const connection = await request(base, "create mocked connection", "/api/providers", {
    tenantId: tenantA,
    method: "POST",
    body: { provider: node.payload.node.id, name: "Mock connection", apiKey: "integration-fixture-key" },
  });
  assert.equal(connection.response.status, 201);
  assertRedacted(connection.payload);
  assert.equal(connection.payload.connection.provider, node.payload.node.id);
  assert.equal(connection.payload.connection.isActive, true);
  assert.deepEqual(
    Object.keys(connection.payload.connection.providerSpecificData || {}).sort(),
    ["apiType", "baseUrl", "connectionNoProxy", "connectionProxyEnabled", "connectionProxyUrl", "nodeName", "prefix"].sort(),
  );

  const tenantAModels = await request(base, "connected tenant models", "/v1/models", { tenantId: tenantA });
  assert.deepEqual(mockRequests, [{ method: "GET", path: "/models" }]);
  assert.equal(tenantAModels.response.status, 200);
  assert.deepEqual(tenantAModels.payload.data.map((model) => model.id), ["mock/mock-only-model"]);
  const tenantBModels = await request(base, "separate tenant models", "/v1/models", { tenantId: tenantB });
  assert.deepEqual(tenantBModels.payload.data, []);

  const disabled = await request(base, "disable mocked connection", `/api/providers/${connection.payload.connection.id}`, {
    tenantId: tenantA,
    method: "PUT",
    body: { isActive: false },
  });
  assert.equal(disabled.response.status, 200);
  const disabledModels = await request(base, "disabled tenant models", "/v1/models", { tenantId: tenantA });
  assert.deepEqual(disabledModels.payload.data, []);

  mockModelIds = ["mock-revised-model", "mock-disabled-model"];
  const reenabled = await request(base, "re-enable mocked connection with revised models", `/api/providers/${connection.payload.connection.id}`, {
    tenantId: tenantA,
    method: "PUT",
    body: { isActive: true, providerSpecificData: { enabledModels: ["mock-revised-model"] } },
  });
  assert.equal(reenabled.response.status, 200);
  const revisedModels = await request(base, "revised tenant models", "/v1/models", { tenantId: tenantA });
  assert.deepEqual(revisedModels.payload.data.map((model) => model.id), ["mock/mock-revised-model"]);

  const deleted = await request(base, "delete mocked connection", `/api/providers/${connection.payload.connection.id}`, {
    tenantId: tenantA,
    method: "DELETE",
  });
  assert.equal(deleted.response.status, 200);
  const deletedModels = await request(base, "deleted tenant models", "/v1/models", { tenantId: tenantA });
  assert.deepEqual(deletedModels.payload.data, []);

  console.log(JSON.stringify({ result: "PASS", assertions: "auth, replay, stale, wrong-secret, tenant isolation, connection-authoritative lifecycle models, redaction" }));
} finally {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
  await new Promise((resolve) => mockServer.close(resolve));
}
