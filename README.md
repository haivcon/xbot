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
| `NINEROUTER_BASE_URL` | 9Router service URL (private) |
| `NINEROUTER_MODEL` | Default AI model |
| `XBOT_AGENT_ENABLED` | Enable xBot Agent runtime (`true`/`false`) |
| `XBOT_AGENT_INTERNAL_URL` | Agent service URL (private) |
| `XBOT_AGENT_SERVICE_TOKEN` | Agent service auth token |
| `XBOT_AGENT_CONTEXT_SECRET` | Agent context HMAC secret |

## Testing

```bash
npm test -- --runInBand --no-coverage
```

## Deploy

```bash
# On VPS
cd /root/xbot
bash scripts/deploy.sh
```

See `scripts/deploy.sh` for PM2-based production deployment with backup, health check, and rollback.

## License

MIT
