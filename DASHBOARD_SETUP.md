# XBot Web Dashboard — Setup Guide

The repository contains one dashboard application. It is built by Vite and served by
the XBot Express API at `/xBot/`.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm 9+
- A configured XBot backend

## Install and run

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173/xBot/`. Vite proxies `/api` to
`http://localhost:3000`.

## Production build

```bash
cd dashboard
npm run build
```

The build writes `dashboard/dist/xBot/index.html` and public PWA assets. Restart
the XBot process after building; its API server serves `dashboard/dist` and
redirects `/` to `/xBot/`.

## Configuration

Dashboard browser variables use the `VITE_` prefix. See `dashboard/.env.example`.
The common settings are:

- `VITE_APP_NAME`
- `VITE_APP_TAGLINE`
- `VITE_APP_DESCRIPTION`
- `VITE_EXPLORER_URL`
- `VITE_CHAIN_NAME`
- `VITE_API_BASE` (default `/api/dashboard`)
- `VITE_WS_URL`
- `VITE_DEFAULT_LANG`

Backend deployment and authentication settings remain in the repository root
`.env`; do not place server credentials in dashboard variables.

## Source layout

- `dashboard/xBot/index.html` — HTML entry
- `dashboard/xBot/src/App.jsx` — routes
- `dashboard/xBot/src/pages/` — dashboard pages
- `dashboard/xBot/src/components/` — reusable UI
- `dashboard/xBot/src/i18n/` — translations
- `dashboard/xBot/src/api/client.js` — backend client
- `dashboard/public/` — manifest, service worker, icons, and retained XBot assets
- `dashboard/vite.config.js` — xBot build entry and API proxy

## Authentication

The dashboard supports Telegram-based authentication. The bot's `/dashboard`
command issues a short-lived one-time link. After authentication, the backend
redirects the browser to `/xBot/`.

## Verification

```bash
npm --prefix dashboard run build
npm test -- --runInBand
```

The focused repository-surface regression check is
`__tests__/xbotRepositorySurface.test.js`.
