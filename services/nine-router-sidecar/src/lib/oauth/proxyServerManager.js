import http from "node:http";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
export const OAUTH_PROXY_CONFIGS = Object.freeze({
  codex: Object.freeze({ port: 1455, callbackPath: "/auth/callback" }),
  antigravity: Object.freeze({ port: 54545, callbackPath: "/callback" }),
  "gemini-cli": Object.freeze({ port: 54545, callbackPath: "/callback" }),
});

function isLoopbackOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function resultPage(success) {
  const title = success ? "Authentication Successful" : "Authentication Failed";
  const color = success ? "#22c55e" : "#ef4444";
  const icon = success ? "&#10003;" : "&#10007;";
  const message = success
    ? "Your provider connection was created. You can close this window."
    : "Provider authorization did not complete. Return to xBot and try again.";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.c{text-align:center;max-width:28rem;padding:2rem;background:#fff;border-radius:.75rem;box-shadow:0 2px 12px #0002}.i{color:${color};font-size:3rem}h1{margin:1rem 0}p{color:#555}</style></head><body><main class="c"><div class="i">${icon}</div><h1>${title}</h1><p>${message}</p><p>Closing in <span id="countdown">3</span> seconds…</p></main><script>let n=3;const e=document.getElementById("countdown");const t=setInterval(()=>{n-=1;e.textContent=n;if(n<=0){clearInterval(t);window.close()}},1000)</script></body></html>`;
}

function html(res, status, success) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(resultPage(success));
}

function safeErrorCode(error) {
  const code = String(error?.code || "");
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : "PROVIDER_ACTION_FAILED";
}

export function createOAuthProxyManager({ configs = OAUTH_PROXY_CONFIGS, ttlMs = DEFAULT_TTL_MS } = {}) {
  const records = new Map();

  function closeServer(record) {
    if (record.timer) {
      clearTimeout(record.timer);
      record.timer = null;
    }
    if (record.server) {
      record.server.close();
      record.server = null;
    }
  }

  function publicStatus(record) {
    if (!record) return { status: "error", code: "PROVIDER_ACTION_INVALID", error: "Provider authorization session was not found" };
    if (record.status === "done") return { status: "done", ...(record.connection ? { connection: record.connection } : {}) };
    if (record.status === "error") return {
      status: "error",
      code: record.code || "PROVIDER_ACTION_FAILED",
      error: record.error || "Provider authorization did not complete",
    };
    return { status: "pending" };
  }

  async function start({ provider, state, onCallback }) {
    const config = configs[provider];
    if (!config || !state || typeof onCallback !== "function") return { success: false, reason: "invalid_request" };
    const previous = records.get(provider);
    if (previous?.status === "pending") return { success: false, reason: "session_active" };
    if (previous) {
      closeServer(previous);
      records.delete(provider);
    }

    const record = { provider, state, status: "pending", server: null, timer: null };
    const server = http.createServer(async (req, res) => {
      let url;
      try { url = new URL(req.url, `http://127.0.0.1:${config.port}`); } catch {
        res.writeHead(400, { "Cache-Control": "no-store" });
        res.end("Bad request");
        return;
      }
      if (req.method !== "GET" || url.pathname !== config.callbackPath) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end("Not found");
        return;
      }
      if (!isLoopbackOrigin(req.headers.origin)) {
        html(res, 403, false);
        return;
      }
      if (record.status !== "pending" || url.searchParams.get("state") !== record.state) {
        html(res, 400, false);
        return;
      }

      const code = url.searchParams.get("code");
      const providerError = url.searchParams.get("error");
      if (!code || providerError) {
        record.status = "error";
        record.code = providerError ? "PROVIDER_AUTHORIZATION_DENIED" : "PROVIDER_ACTION_INVALID";
        record.error = "Provider authorization did not complete";
        closeServer(record);
        html(res, 200, false);
        return;
      }

      record.status = "processing";
      try {
        const result = await onCallback({
          provider,
          code,
          state: record.state,
          scope: url.searchParams.get("scope") || "",
        });
        record.status = "done";
        record.connection = result?.connection;
        html(res, 200, true);
      } catch (error) {
        record.status = "error";
        record.code = safeErrorCode(error);
        record.error = "Provider authorization did not complete";
        html(res, 200, false);
      } finally {
        closeServer(record);
      }
    });
    record.server = server;
    records.set(provider, record);

    return new Promise(resolve => {
      let settled = false;
      server.once("error", error => {
        if (settled) return;
        settled = true;
        records.delete(provider);
        resolve({ success: false, reason: error.code === "EADDRINUSE" ? "port_busy" : "listen_failed" });
      });
      server.listen(config.port, "127.0.0.1", () => {
        if (settled) return;
        settled = true;
        record.timer = setTimeout(() => {
          if (record.status === "pending") {
            record.status = "error";
            record.code = "PROVIDER_ACTION_EXPIRED";
            record.error = "Provider authorization timed out";
          }
          closeServer(record);
        }, ttlMs);
        record.timer.unref?.();
        resolve({ success: true, port: config.port });
      });
    });
  }

  function poll({ provider, state }) {
    const record = records.get(provider);
    if (!record || record.state !== state) return publicStatus(null);
    return publicStatus(record);
  }

  async function stop({ provider, state } = {}) {
    const record = records.get(provider);
    if (!record || (state && record.state !== state)) return false;
    closeServer(record);
    records.delete(provider);
    return true;
  }

  async function stopAll() {
    await Promise.all([...records.keys()].map(provider => stop({ provider })));
  }

  return { start, poll, stop, stopAll };
}

export const oauthProxyManager = createOAuthProxyManager();
