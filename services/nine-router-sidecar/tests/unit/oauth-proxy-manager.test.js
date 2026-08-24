import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthProxyManager } from "../../src/lib/oauth/proxyServerManager.js";

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

const managers = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map(manager => manager.stopAll()));
  vi.useRealTimers();
});

describe("tenant OAuth loopback proxy manager", () => {
  it("receives code+state+scope once, renders success HTML, and exposes done status", async () => {
    const probe = http.createServer();
    const port = await listen(probe);
    await close(probe);
    const exchange = vi.fn(async ({ code, state }) => ({ connection: { id: "conn-1" }, code, state }));
    const manager = createOAuthProxyManager({
      configs: { codex: { port, callbackPath: "/auth/callback" } },
      ttlMs: 300_000,
    });
    managers.push(manager);

    await expect(manager.start({ provider: "codex", state: "state-1", onCallback: exchange })).resolves.toEqual({ success: true, port });
    expect(manager.poll({ provider: "codex", state: "state-1" })).toEqual({ status: "pending" });

    const response = await fetch(`http://127.0.0.1:${port}/auth/callback?code=opaque-code&state=state-1&scope=openid+profile`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Authentication Successful");
    expect(exchange).toHaveBeenCalledWith(expect.objectContaining({ provider: "codex", code: "opaque-code", state: "state-1", scope: "openid profile" }));
    expect(manager.poll({ provider: "codex", state: "state-1" })).toEqual({ status: "done", connection: { id: "conn-1" } });

    await expect(fetch(`http://127.0.0.1:${port}/auth/callback?code=replay&state=state-1`)).rejects.toThrow();
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("rejects external Origin without consuming the pending session", async () => {
    const probe = http.createServer();
    const port = await listen(probe);
    await close(probe);
    const exchange = vi.fn();
    const manager = createOAuthProxyManager({ configs: { antigravity: { port, callbackPath: "/callback" } } });
    managers.push(manager);
    await manager.start({ provider: "antigravity", state: "state-2", onCallback: exchange });

    const response = await fetch(`http://127.0.0.1:${port}/callback?code=x&state=state-2`, { headers: { Origin: "https://evil.invalid" } });
    expect(response.status).toBe(403);
    expect(exchange).not.toHaveBeenCalled();
    expect(manager.poll({ provider: "antigravity", state: "state-2" })).toEqual({ status: "pending" });
  });

  it("reports exchange errors without exposing callback secrets in HTML or poll output", async () => {
    const probe = http.createServer();
    const port = await listen(probe);
    await close(probe);
    const manager = createOAuthProxyManager({ configs: { "gemini-cli": { port, callbackPath: "/callback" } } });
    managers.push(manager);
    await manager.start({ provider: "gemini-cli", state: "state-3", onCallback: async () => {
      const error = new Error("upstream leaked opaque-code");
      error.code = "PROVIDER_ACTION_EXCHANGE_FAILED";
      throw error;
    } });

    const response = await fetch(`http://127.0.0.1:${port}/callback?code=opaque-code&state=state-3`);
    const html = await response.text();
    expect(html).toContain("Authentication Failed");
    expect(html).not.toContain("opaque-code");
    expect(manager.poll({ provider: "gemini-cli", state: "state-3" })).toEqual({ status: "error", code: "PROVIDER_ACTION_EXCHANGE_FAILED", error: "Provider authorization did not complete" });
  });

  it("cleans up on timeout and marks the session as error", async () => {
    vi.useFakeTimers();
    const probe = http.createServer();
    const port = await listen(probe);
    await close(probe);
    const manager = createOAuthProxyManager({ configs: { codex: { port, callbackPath: "/auth/callback" } }, ttlMs: 50 });
    managers.push(manager);
    await manager.start({ provider: "codex", state: "state-4", onCallback: vi.fn() });
    await vi.advanceTimersByTimeAsync(51);
    expect(manager.poll({ provider: "codex", state: "state-4" })).toEqual({ status: "error", code: "PROVIDER_ACTION_EXPIRED", error: "Provider authorization timed out" });
  });

  it("gracefully reports port_busy and preserves the existing listener", async () => {
    const occupied = http.createServer((req, res) => res.end("occupied"));
    const port = await listen(occupied);
    const manager = createOAuthProxyManager({ configs: { codex: { port, callbackPath: "/auth/callback" } } });
    managers.push(manager);
    await expect(manager.start({ provider: "codex", state: "state-5", onCallback: vi.fn() })).resolves.toEqual({ success: false, reason: "port_busy" });
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("occupied");
    await close(occupied);
  });

  it("allows only one active session per provider", async () => {
    const probe = http.createServer();
    const port = await listen(probe);
    await close(probe);
    const manager = createOAuthProxyManager({ configs: { codex: { port, callbackPath: "/auth/callback" } } });
    managers.push(manager);
    await manager.start({ provider: "codex", state: "state-a", onCallback: vi.fn() });
    await expect(manager.start({ provider: "codex", state: "state-b", onCallback: vi.fn() })).resolves.toEqual({ success: false, reason: "session_active" });
  });
});
