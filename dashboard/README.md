# XBot Dashboard

A modern, responsive web dashboard for managing your XBot Telegram bot.

## Quick Start

### Prerequisites

- **Node.js** v18+
- **npm** v9+
- The XBot bot server running (see root `README.md`)

### Installation

```bash
# Navigate to the dashboard directory
cd dashboard

# Install dependencies
npm install

# (Optional) Copy and customize environment variables
cp .env.example .env
```

### Development

```bash
npm run dev
# → Opens at http://localhost:5173
# → API proxy: /api/* → http://localhost:3000
```

### Production Build

```bash
npm run build
# → Output: dashboard/dist/
# → Served automatically by the bot's Express server
```

No separate deployment needed — the bot serves the built dashboard at `/dashboard/`.

---

## Environment Variables

All dashboard env vars must start with `VITE_` to be available in the browser.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_APP_NAME` | `XBot` | App name shown in sidebar |
| `VITE_APP_TAGLINE` | `Dashboard` | Tagline below app name |
| `VITE_APP_DESCRIPTION` | — | Meta description |
| `VITE_EXPLORER_URL` | OKX Explorer | Blockchain explorer URL |
| `VITE_CHAIN_NAME` | `X Layer` | Chain display name |
| `VITE_API_BASE` | `/api/dashboard` | API base path |
| `VITE_WS_URL` | Auto-detected | WebSocket URL |
| `VITE_DEFAULT_LANG` | `en` | Default language (en/vi/zh/ko/ru/id) |

---

## Directory Structure

```
dashboard/
├── public/               # Static assets (favicon, etc.)
├── src/
│   ├── api/
│   │   └── client.js     # API client — all HTTP requests to backend
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.jsx    # Top bar: search, theme toggle, user avatar
│   │   │   ├── Layout.jsx    # Main layout: sidebar + header + content
│   │   │   └── Sidebar.jsx   # Navigation sidebar with role-based links
│   │   ├── LoginModal.jsx    # Telegram login widget + bot deep link
│   │   ├── Skeleton.jsx      # Loading skeleton components
│   │   └── ToastContainer.jsx # Toast notification overlay
│   │
│   ├── i18n/
│   │   └── index.js      # Translations for 6 languages
│   │
│   ├── pages/
│   │   ├── owner/             # Owner-only pages (admin)
│   │   │   ├── DashboardPage.jsx  # Bot health, user/group stats, latency
│   │   │   ├── UsersPage.jsx      # User list, search, ban/unban
│   │   │   ├── GroupsPage.jsx     # Group management
│   │   │   ├── AnalyticsPage.jsx  # Usage charts and stats
│   │   │   ├── AlertsPage.jsx    # Price alert management
│   │   │   ├── PostsPage.jsx     # Scheduled post management
│   │   │   └── ConfigPage.jsx    # Bot configuration & API keys
│   │   ├── user/              # User pages (everyone)
│   │   │   ├── ProfilePage.jsx    # User profile and preferences
│   │   │   ├── WalletsPage.jsx    # Wallet management
│   │   │   ├── TradingPage.jsx    # Trading history
│   │   │   ├── LeaderboardPage.jsx # Game leaderboards
│   │   │   └── SettingsPage.jsx   # User settings
│   │   ├── LandingPage.jsx    # Public landing page
│   │   ├── LoginPage.jsx      # Login page
│   │   └── NotFoundPage.jsx   # 404 page
│   │
│   ├── stores/            # Zustand state management
│   │   ├── authStore.js   # Auth state, JWT, role, view mode toggle
│   │   ├── themeStore.js  # Dark/Light theme
│   │   ├── toastStore.js  # Toast notification queue
│   │   └── wsStore.js     # WebSocket connection & real-time events
│   │
│   ├── App.jsx            # Root component with routes & code splitting
│   ├── config.js          # Dashboard configuration (from VITE_ env)
│   ├── index.css          # Global styles and design system
│   └── main.jsx           # Entry point
│
├── .env.example           # Environment variable template
├── index.html             # HTML entry point
├── package.json           # Dependencies
├── tailwind.config.js     # Tailwind CSS configuration
└── vite.config.js         # Vite build config with vendor chunks
```

---

## Architecture

### Authentication Flow

```
User → /dashboard
  ├── Has valid JWT in localStorage? → Dashboard (Owner or User view)
  └── No JWT →  Landing Page
       ├── Click "Login with Telegram" → Telegram Login Widget → JWT
       └── Click "Open Bot" → /start dashboard_login → One-time token → JWT
```

### Role System

| Role | Access | How assigned |
|------|--------|--------------|
| **Owner** | All pages (admin + user) | Telegram ID matches `BOT_OWNER_ID` |
| **User** | Profile, Wallets, Trading, Leaderboard, Settings | Any authenticated Telegram user |

**Owner View Toggle**: Owners can switch between Owner and User views using the toggle button in the sidebar.

### API Endpoints

All endpoints are prefixed with `/api/dashboard`.

#### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/bot-info` | Bot username |
| GET | `/health` | Server health status |
| GET | `/auth/auto-login?token=` | One-time token login |

#### Protected (JWT Required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/refresh` | Refresh JWT token |
| GET | `/user/profile` | User profile |
| PUT | `/user/preferences` | Update preferences |
| GET | `/user/wallets` | User wallets |
| GET | `/user/trading-history` | Trade history |
| GET | `/user/leaderboard` | Game leaderboard |

#### Owner Only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/owner/overview` | User/group stats, Telegram latency |
| GET | `/owner/users` | All users |
| POST | `/owner/users/ban` | Ban user |
| POST | `/owner/users/unban` | Unban user |
| GET | `/owner/groups` | All groups |
| GET | `/owner/analytics` | Command usage stats |
| GET | `/owner/config/runtime` | Runtime configuration |
| GET/POST/PUT/DELETE | `/owner/alerts/*` | Price alert CRUD |
| GET/POST/PUT/DELETE | `/owner/posts/*` | Scheduled post CRUD |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 6 |
| Routing | React Router 7 |
| State | Zustand |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| i18n | react-i18next (6 languages) |
| Real-time | WebSocket (auto-reconnect) |

---

## Security

- **Telegram-only auth** — No password-based login
- **JWT with 7-day expiry** — Auto-refresh available
- **Login rate limiting** — 5 attempts/min per IP
- **Gzip compression** — All responses compressed
- **Owner verification** — Server-side role check via Telegram ID
- **Wallet key stripping** — Private keys never sent to dashboard

---

## Customization

1. **Branding**: Override via `VITE_*` env vars (see table above)
2. **Languages**: Edit `src/i18n/index.js` to add or modify translations
3. **Theme**: Tailwind config in `tailwind.config.js`, design tokens in `index.css`
4. **Pages**: Add new pages in `src/pages/`, register routes in `App.jsx`
