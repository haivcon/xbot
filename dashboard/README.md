# XBot Dashboard

The dashboard is a single React application served at `/xBot/` by the XBot Express API.

## Development

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173/xBot/`; `/api` requests proxy to
`http://localhost:3000`.

## Production build

```bash
npm run build
```

The build emits `dist/xBot/index.html` plus shared public assets. The backend serves
`dashboard/dist` and redirects `/` to `/xBot/`.

## Source layout

- `xBot/index.html` — dashboard HTML entry
- `xBot/src/` — dashboard application source
- `public/` — XBot PWA icons, manifest, service worker, and retained app assets
- `vite.config.js` — single xBot build entry and local API proxy