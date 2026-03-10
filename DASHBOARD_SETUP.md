# 🌐 XBot Web Dashboard — Setup Guide

> A professional web dashboard for managing your XBot Telegram bot with multi-language support.

---

## 📋 Table of Contents
- [Quick Start](#-quick-start)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Dashboard](#-running-the-dashboard)
- [Customization](#-customization)
- [Language Support](#-language-support)
- [Production Deployment](#-production-deployment)
- [Troubleshooting](#-troubleshooting)

---

## ⚡ Quick Start

```bash
# 1. Install dashboard dependencies
cd dashboard && npm install

# 2. Build for production
npm run build

# 3. Go back and start the bot (dashboard is served automatically)
cd .. && pm2 start index.js --name xbot

# 4. Open in browser
# http://localhost:3001/dashboard/

# 5. In Telegram, type /dashboard to get an auto-login link
```

---

## 📦 Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** 9+
- A running XBot instance with `.env` configured
- (Optional) **Nginx** + **SSL** for production HTTPS

---

## 🔧 Installation

### 1. Install Dependencies

```bash
# From the project root
cd dashboard
npm install
```

### 2. Build the Dashboard

```bash
npm run build
```

This creates `dashboard/dist/` — the bot's API server serves these files automatically.

### 3. Configure Environment

Add these to your `.env` file in the project root:

```env
# Required
API_PORT=3001

# Required for VPS/Production (replace with your domain)
PUBLIC_BASE_URL=https://yourdomain.com

# Optional: Disable dev login buttons in production
# DASHBOARD_DISABLE_DEV_LOGIN=true

# Optional: Custom JWT secret (auto-generated if not set)
# DASHBOARD_JWT_SECRET=your_random_secret_here
```

---

## 🚀 Running the Dashboard

### Development (Hot Reload)

```bash
cd dashboard
npm run dev
# → Opens at http://localhost:5173
# → API proxied to http://localhost:3001
```

### Production (With Bot)

```bash
cd dashboard && npm run build
cd .. && pm2 restart xbot
# → Dashboard at http://localhost:3001/dashboard/
```

### Login Methods

| Method | How |
|---|---|
| **Telegram command** | Type `/dashboard` in Telegram → click the auto-login link |
| **Dev mode buttons** | Click "Login as Owner" or "Login as User" on the login page |
| **Telegram Widget** | Requires HTTPS domain + BotFather `/setdomain` setup |

---

## 🎨 Customization

### Change Brand Colors

Edit `dashboard/tailwind.config.js`:

```js
colors: {
    brand: {
        400: '#60a5fa',  // Primary light
        500: '#3b82f6',  // Primary
        600: '#2563eb',  // Primary dark
        // ... add more shades
    },
}
```

### Change Logo & Title

Edit `dashboard/index.html`:
```html
<title>Your Bot Dashboard</title>
```

Edit `dashboard/src/i18n/index.js` → change `dashboard.auth.title`:
```js
auth: {
    title: 'Your Bot Name',
    subtitle: 'Your custom subtitle',
}
```

### Add/Remove Pages

- **Pages directory:** `dashboard/src/pages/`
  - Owner pages: `dashboard/src/pages/owner/`
  - User pages: `dashboard/src/pages/user/`
- **Routes:** `dashboard/src/App.jsx`
- **Sidebar nav:** `dashboard/src/components/layout/Sidebar.jsx`
- **API endpoints:** `src/server/dashboardRoutes.js`

### Dark/Light Mode

The dashboard has a built-in dark/light mode toggle (Sun/Moon icon in the header). Theme preference is saved in `localStorage`.

---

## 🌍 Language Support

The dashboard supports **6 languages** out of the box:

| Code | Language | Flag |
|---|---|---|
| `en` | English | 🇺🇸 |
| `vi` | Tiếng Việt | 🇻🇳 |
| `zh` | 中文 | 🇨🇳 |
| `ko` | 한국어 | 🇰🇷 |
| `ru` | Русский | 🇷🇺 |
| `id` | Indonesia | 🇮🇩 |

### How to Edit Translations

All translations are in a single file: `dashboard/src/i18n/index.js`

Structure:
```js
const dashboardResources = {
    en: {
        dashboard: {
            sidebar: { home: 'Dashboard', users: 'Users', ... },
            common: { save: 'Save', cancel: 'Cancel', ... },
        }
    },
    vi: {
        dashboard: {
            sidebar: { home: 'Tổng quan', users: 'Người dùng', ... },
            common: { save: 'Lưu', cancel: 'Hủy', ... },
        }
    },
    // ... more languages
};
```

### How to Add a New Language

1. Open `dashboard/src/i18n/index.js`
2. Copy the `en` block and create a new language block:

```js
// Add after the 'id' block
ja: {
    dashboard: {
        sidebar: { home: 'ダッシュボード', users: 'ユーザー', ... },
        // ... translate all keys
    }
},
```

3. Add the language option to the login page selector in `dashboard/src/pages/LoginPage.jsx`:
```html
<option value="ja">🇯🇵 日本語</option>
```

4. Add to the sidebar language switcher in `dashboard/src/components/layout/Sidebar.jsx`

5. Rebuild: `npm run build`

### Auto-Detection

The dashboard automatically detects the user's browser language. Users can also manually switch via:
- The language dropdown on the **Login page**
- The language selector in the **Sidebar**

---

## 🏗️ Production Deployment

### With Nginx + SSL (Recommended)

1. **Install Nginx & Certbot:**
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

2. **Create Nginx config** (`/etc/nginx/sites-available/xbot`):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. **Enable & get SSL:**
```bash
sudo ln -s /etc/nginx/sites-available/xbot /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
```

4. **Update `.env`:**
```env
PUBLIC_BASE_URL=https://yourdomain.com
DASHBOARD_DISABLE_DEV_LOGIN=true
```

5. **Firewall:**
```bash
sudo ufw allow 80
sudo ufw allow 443
```

### Telegram Login Widget (Optional)

For the built-in Telegram Login Widget on the login page:

1. Chat with **@BotFather** on Telegram
2. Send `/setdomain`
3. Select your bot
4. Enter: `yourdomain.com`

> **Note:** Telegram Login Widget requires HTTPS. On localhost, use the `/dashboard` command or dev login buttons instead.

---

## 🔐 Security Notes

- **Wallet private keys** are never exposed via the API
- **API keys** are masked in the config page (`abc1...xyz9`)
- **JWT tokens** expire after 7 days
- **Auto-login tokens** are one-time use and expire in 5 minutes
- Set `DASHBOARD_DISABLE_DEV_LOGIN=true` in production

---

## ❓ Troubleshooting

| Problem | Solution |
|---|---|
| Dashboard shows blank page | Run `cd dashboard && npm run build`, then `pm2 restart xbot` |
| "Telegram authentication failed" | Restart bot: `pm2 restart xbot` |
| `/dashboard` link doesn't work | Set `PUBLIC_BASE_URL` in `.env` to your domain/IP |
| CSS warnings in IDE | Normal — TailwindCSS directives. Add `.vscode/settings.json` with `"css.validate": false` |
| Port already in use | Change `API_PORT` in `.env` or kill existing process |

---

## 📁 Dashboard File Structure

```
dashboard/
├── index.html              # Entry HTML
├── package.json            # Dependencies
├── vite.config.js          # Build config
├── tailwind.config.js      # Styling config
├── src/
│   ├── main.jsx            # React entry
│   ├── App.jsx             # Routes
│   ├── index.css           # Global styles (glassmorphism, light/dark)
│   ├── api/client.js       # API client
│   ├── i18n/index.js       # All translations (6 languages)
│   ├── stores/
│   │   ├── authStore.js    # Authentication state
│   │   └── themeStore.js   # Dark/Light mode state
│   ├── components/layout/
│   │   ├── Layout.jsx      # Main layout
│   │   ├── Sidebar.jsx     # Navigation sidebar
│   │   └── Header.jsx      # Top header with theme toggle
│   └── pages/
│       ├── LoginPage.jsx   # Login with Telegram
│       ├── NotFoundPage.jsx
│       ├── owner/          # Owner-only pages (7 pages)
│       └── user/           # User pages (5 pages)
```
