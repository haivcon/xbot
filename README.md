# xBot

AI-powered Telegram bot and web dashboard for the OKX X Layer ecosystem.

## Features

- **Telegram Bot** — AI chat, on-chain analytics, price alerts, portfolio tracking
- **Web Dashboard** — user & admin panels, chat AI, trading, wallet management
- **9Router** — unified model routing via `xlayerbot.fun/v1` (multi-model, tenant-aware)
- **xBot Agent** — agent runtime with tool execution, approval flow, and SSE streaming
- **OnchainOS** — on-chain tools (swap, bridge, DeFi, token research, security scan)
- **Multi-language** — i18n support across bot and dashboard

## Architecture

```
Telegram ──► xBot Node/Express ──► 9Router sidecar ──► AI models
                 │                       │
                 ├── Dashboard (Vite/React)
                 ├── xBot Agent adapter (FastAPI)
                 ├── OnchainOS tools
                 └── SQLite DB
```

## Project Layout

```
src/                     # Backend — bot, server, services
  app/                   # Telegram handlers
  server/                # Express API routes
  services/              # 9Router, xBot Agent, orchestrator
  features/              # AI, on-chain, trading
dashboard/               # Web dashboard (Vite + React)
  xBot/src/              # Dashboard source
services/
  nine-router-sidecar/   # 9Router model routing service
  hermes-api/            # xBot Agent adapter (FastAPI)
scripts/                 # Deploy, backup, utilities
__tests__/               # Jest test suite
```

## Setup

```bash
# Install dependencies
npm install
npm --prefix dashboard install

# Configure
cp .env.example .env   # Edit with your tokens and config

# Run
npm start              # Bot + API server
```

### Dashboard build

```bash
npm --prefix dashboard run build
```

### Environment variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token |
| `ROUTER_URL` | Private 9Router service root (without `/v1`) |
| `ROUTER_SECRET` | Shared tenant HMAC secret (minimum 32 characters) |
| `ROUTER_MODEL` | Default/allowed 9Router model |
| `ROUTER_ENABLED` | Enable 9Router after sidecar health verification |
| `XBOT_AGENT_ENABLED` | Enable xBot Agent runtime (`true`/`false`) |
| `XBOT_AGENT_INTERNAL_URL` | Agent service URL (private) |
| `XBOT_AGENT_SERVICE_TOKEN` | Agent service auth token |
| `XBOT_AGENT_CONTEXT_SECRET` | Agent context HMAC secret |

### Public dashboard behind Cloudflare Tunnel

Use a loopback-only tunnel origin and an exact browser-origin allowlist:

```dotenv
PUBLIC_BASE_URL=https://xbot.xlayer.my
HOST=127.0.0.1
API_PORT=3000
CORS_ALLOWED_ORIGINS=https://xbot.xlayer.my
TRUST_PROXY=loopback
USE_WEBHOOK=false
EXECUTION_DISABLED=true
```

Point Cloudflare Tunnel at `http://127.0.0.1:3000`. `TRUST_PROXY=loopback`
accepts forwarded HTTPS metadata only from a local proxy peer. Public `/health`,
`/healthz`, and `/api/dashboard/health` return only `{ "status": "ok|degraded" }`;
dashboard runtime diagnostics remain owner-authenticated. The public `bot-info`
response contains only `botUsername`, which is required by the Telegram login UX.
`/metrics` is reachable only from a direct loopback peer, and `/readyz` exposes
only `ready`/`not_ready` status.

API migration: clients that consumed public health diagnostics or public
`bot-info.communities`, `bot-info.tokens`, or `bot-info.dashboardUrl` must move to
authenticated APIs. Dashboard auth and sensitive responses are `no-store`.

## Testing

```bash
npm test -- --runInBand --no-coverage
```

### 9Router provider inventory

The provider count is not an upstream marketing count. It is the exact set returned by a
fresh production standalone after the bundled registry has applied canonical-ID dedupe and
`hidden` filtering. Device-code support is the subset whose current tenant route exposes a
callable `device_code` handler. The reviewed ID fixture is
`services/nine-router-sidecar/tests/fixtures/provider-catalog.inventory.json`.

After any registry or OAuth-handler change, review/regenerate that fixture from
`buildTenantProviderCatalog()`, then build and compare the signed production endpoint:

```bash
npm --prefix services/nine-router-sidecar run test:catalog-parity
```

The gate also checks unique aliases, the eight reviewed generic API-key additions, and exact
source/runtime provider and device-code ID parity. Do not update the fixture merely to make the
gate pass; review every added or removed ID and its tenant-safe action first.

### Tenant-safe provider OAuth

Only Antigravity and Gemini CLI are eligible for public HTTPS redirect authentication. They are
shown as `configuration_required` until the corresponding Google OAuth web client is configured.

Upstream 9Router bundles public/native OAuth client material for both providers. Its dashboard uses
a loopback `http://localhost:<port>/callback` redirect (and remote users may manually paste the
resulting callback URL); it does not use device authorization for either provider. Gemini CLI's
official native client likewise uses loopback or its Google-hosted manual-code redirect. A native
client's bundled "secret" is public application material, not a confidential server credential.
That public/native OAuth client is nevertheless registered for the native application's redirect
semantics and identity: it cannot authorize the xBot HTTPS callback and must not be repurposed by a
remote, multi-tenant web service.

xBot therefore requires separate Google OAuth web clients owned by the xBot operator. The client
secrets are confidential and server-only; the configuration variable names are:

- `ANTIGRAVITY_OAUTH_CLIENT_ID`
- `ANTIGRAVITY_OAUTH_CLIENT_SECRET`
- `GEMINI_OAUTH_CLIENT_ID`
- `GEMINI_OAUTH_CLIENT_SECRET`
- `NINEROUTER_VAULT_KEY` (preferred credential-encryption key)

Register these exact callback URLs in the Google Cloud console for the matching web client:

- Antigravity: `https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/antigravity`
- Gemini CLI: `https://xbot.xlayer.my/api/dashboard/ai/9router/oauth/callback/gemini-cli`

For each provider, create or select an owned OAuth 2.0 Web application client, add only the matching
callback URL to its authorized redirect URI list, save, set the matching server environment
variables, and restart the local candidate before re-running the catalog and callback tests.
The Antigravity client must be configured in a Google project permitted to request the listed Code
Assist/Antigravity scopes; creating a generic client does not itself guarantee provider approval.
Never place client secrets in dashboard build variables.

The reviewed local flow matrix is exact and fail-closed:

- Antigravity and Gemini CLI: `oauth_redirect` when the operator-owned Google Web OAuth client is configured,
  with `manual_callback` fallback using the pinned native installed-app client, PKCE/state, and the exact
  `http://localhost:54545/callback?code=...&state=...` loopback URL. The fallback never substitutes an xBot HTTPS redirect.
- Claude Code: `WORKING_LOCAL` `manual_code`; xBot creates server-side state/PKCE, opens authorization,
  and accepts only the short authorization code. The session and exchange are tenant-bound and one-time.
- OpenAI Codex: `WORKING_LOCAL` `manual_callback`; paste the complete
  `http://localhost:1455/auth/callback?code=...&state=...` URL. Only localhost/127.0.0.1, HTTP,
  port 1455, `/auth/callback`, and exactly `code` plus `state` are accepted once.
- OpenCode Free (`opencode`): `WORKING_LOCAL` `free_connection`; an explicit tenant click creates a
  credentialless connection after model validation. Removing/disabling that connection removes its models.
- Cline and Kimchi: `manual_secret`; paste only the exact upstream callback payload/token into the password-style field.
- Cursor: `manual_secret`; paste `accessToken` plus `storage.serviceMachineId` from a user-controlled export.
  xBot never reads local files or SQLite automatically.
- Grok Web and Perplexity Web: `manual_secret`; after acknowledging the sensitive-session warning, paste only
  the exact upstream session-cookie value. The value is body-only, validated before write, tenant-encrypted,
  never echoed, and can be revoked by logout or disconnect. Prefer each provider's official API when available.
- MiMo Code Free: `service_probe`; xBot probes only the bounded v0.5.55 metadata endpoint. An unavailable old
  endpoint returns typed `UPSTREAM_SERVICE_ENDED` and creates no connection; xBot does not fabricate availability.

Provider icons are same-origin files copied byte-for-byte from the pinned upstream 9Router `v0.5.55`
`public/providers` tree. `dashboard/public/providers/provenance.json` records repository, tag, source path,
license, ID mapping, and SHA-256 for every one of the eleven reviewed providers. Their only public route is
`/xBot/providers/<reviewed-file>`: the dashboard build places `public/providers` inside `dist/xBot`, which
the root Express server mounts at `/xBot`; `/providers/*` is not an alias. To regenerate, check out
that exact upstream tag read-only, copy only the manifest-listed files without conversion, recompute each
SHA-256, and run `provider-icon-parity.test.js`, the dashboard build, and
`node dashboard/scripts/verify-provider-assets.mjs` against the root server. Never hotlink or substitute a
fabricated logo; aliases resolve centrally and an inaccessible image falls back to a reviewed monogram.

Connection credential data uses tenant- and connection-bound AES-256-GCM. Prefer a dedicated
`NINEROUTER_VAULT_KEY`; a `ROUTER_SECRET` fallback is accepted only at 64 characters or longer.
Legacy plaintext rows remain readable and are encrypted on their next bounded repository write.
Before rotating either key material, run an explicit decrypt-and-reencrypt migration with the old
key still available; changing the key first makes existing ciphertext unreadable.

## Deploy

Deploy from an immutable release built from a clean tracked checkout; this repository does not ship a
host-specific activation script. The committed dashboard contract is `dashboard/vite.config.js`, and the
release artifact contract is `scripts/generate-release-manifest.js` with runtime validation in
`src/core/releaseManifest.js`.

```bash
npm --prefix dashboard run build
npm run release:manifest -- --git-sha <40-character-git-sha> --built-at <ISO-UTC-timestamp>
```

Promotion tooling must preserve the generated release manifest and verify the public `/health` and `/readyz`
contracts defined by `src/core/readiness.js` before considering an immutable release active. The canonical CI
sequence is committed in `.github/workflows/ci.yml`; host activation, backup, and rollback remain
operator-controlled procedures outside this repository.

## License

MIT
