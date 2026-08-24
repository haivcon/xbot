import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";


const sidecarRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(sidecarRoot, "../..");
const distDir = process.env.NINEROUTER_PARITY_DIST_DIR || ".next-catalog-parity";
const standaloneRoot = path.join(sidecarRoot, distDir, "standalone");
const fixturePath = path.join(sidecarRoot, "tests/fixtures/provider-catalog.inventory.json");
const secret = crypto.createHash("sha256").update("provider-catalog-parity-fixture").digest("hex");
const tenantId = "123456789";
const requiredFiles = ["server.js", "custom-server.js", "tenant-context.cjs"];
const require = createRequire(import.meta.url);
const { createTenantHeaders } = require(path.join(repoRoot, "src/services/nineRouterTenantClient.js"));

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function inventory(catalog) {
  const providers = catalog.providers || [];
  return {
    providerIds: sorted(providers.map((provider) => provider.id)),
    deviceCodeProviderIds: sorted(providers.filter((provider) => provider.connection?.action === "device_code").map((provider) => provider.id)),
  };
}

function assertUniqueAliases(providers) {
  const ownerByAlias = new Map();
  for (const provider of providers) {
    for (const alias of new Set([provider.id, provider.alias, ...(provider.aliases || [])].filter(Boolean))) {
      const owner = ownerByAlias.get(alias);
      assert(!owner || owner === provider.id, `alias ${alias} belongs to both ${owner} and ${provider.id}`);
      ownerByAlias.set(alias, provider.id);
    }
  }
}

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitReady(base, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`standalone exited early: ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("standalone readiness timeout");
}

function buildStandalone() {
  if (process.env.NINEROUTER_PARITY_SKIP_BUILD === "1") return;
  const nextCli = path.join(sidecarRoot, "node_modules/next/dist/bin/next");
  const result = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
    cwd: sidecarRoot,
    env: { ...process.env, NEXT_DIST_DIR: distDir },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "production standalone build failed");
}

buildStandalone();
const vitestCli = path.join(sidecarRoot, "tests/node_modules/vitest/vitest.mjs");
const sourceResult = spawnSync(process.execPath, [vitestCli, "run", "tests/unit/provider-catalog-capabilities.test.js", "--config", "scripts/vitest-offline.config.mjs"], {
  cwd: sidecarRoot,
  env: { ...process.env, NINEROUTER_OFFLINE_TESTS: "1" },
  stdio: "inherit",
});
if (sourceResult.error) throw sourceResult.error;
assert.equal(sourceResult.status, 0, "direct source catalog inventory test failed");
for (const file of requiredFiles) {
  const source = file === "server.js" ? path.join(standaloneRoot, file) : path.join(sidecarRoot, file);
  assert(fs.existsSync(source), `missing production artifact ${source}`);
  if (file !== "server.js") fs.copyFileSync(source, path.join(standaloneRoot, file));
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const { default: registry } = await import(pathToFileURL(path.join(sidecarRoot, "open-sse/providers/registry/index.js")));
const raw = {
  total: registry.length,
  hiddenIds: sorted(registry.filter((provider) => provider.hidden === true).map((provider) => provider.id)),
  duplicateIds: sorted(registry.map((provider) => provider.id).filter((id, index, ids) => ids.indexOf(id) !== index)),
};
const sourceInventory = {
  providerIds: fixture.providerIds,
  deviceCodeProviderIds: fixture.deviceCodeProviderIds,
};

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xbot-provider-catalog-parity-"));
const child = spawn(process.execPath, ["custom-server.js"], {
  cwd: standaloneRoot,
  env: { ...process.env, DATA_DIR: dataDir, ROUTER_SECRET: secret, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitReady(base, child);
  process.env.ROUTER_SECRET = secret;
  process.env.ROUTER_URL = base;
  const requestPath = "/api/providers/catalog";
  const response = await fetch(`${base}${requestPath}`, {
    headers: createTenantHeaders({ tenantId, method: "GET", path: requestPath }),
  });
  assert.equal(response.status, 200, `signed production catalog returned ${response.status}`);
  const runtimeCatalog = await response.json();
  const runtimeInventory = inventory(runtimeCatalog);
  assertUniqueAliases(runtimeCatalog.providers);
  assert.deepEqual(runtimeInventory, sourceInventory, "source catalog and production standalone inventory differ");
  assert.deepEqual(runtimeInventory.providerIds, fixture.providerIds, "production provider inventory differs from reviewed fixture");
  assert.deepEqual(runtimeInventory.deviceCodeProviderIds, fixture.deviceCodeProviderIds, "production device-code inventory differs from reviewed fixture");
  for (const id of fixture.requiredApiKeyProviderIds) {
    assert.equal(runtimeCatalog.providers.find((provider) => provider.id === id)?.connection?.action, "api_key", `${id} is not actionable in production`);
  }
  console.log(JSON.stringify({
    result: "PASS",
    rawRegistry: raw,
    source: { providerCount: sourceInventory.providerIds.length, deviceCodeCount: sourceInventory.deviceCodeProviderIds.length },
    runtime: { providerCount: runtimeInventory.providerIds.length, deviceCodeCount: runtimeInventory.deviceCodeProviderIds.length },
    providerIds: runtimeInventory.providerIds,
    deviceCodeProviderIds: runtimeInventory.deviceCodeProviderIds,
  }));
} finally {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}
