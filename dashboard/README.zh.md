# XBot 仪表板

一个现代化、响应式的 Telegram 机器人管理仪表板。

## 快速开始

### 环境要求

- **Node.js** v18+
- **npm** v9+
- XBot 机器人服务正在运行（详见根目录 `README.md`）

### 安装

```bash
# 进入仪表板目录
cd dashboard

# 安装依赖
npm install

# （可选）复制并自定义环境变量
cp .env.example .env
```

### 开发模式

```bash
npm run dev
# → 在 http://localhost:5173 打开
# → API 代理：/api/* → http://localhost:3000
```

### 生产构建

```bash
npm run build
# → 输出目录：dashboard/dist/
# → 由机器人的 Express 服务器自动提供
```

无需单独部署 — 机器人会在 `/dashboard/` 路径自动服务构建后的仪表板。

---

## 环境变量

所有仪表板环境变量必须以 `VITE_` 开头才能在浏览器中使用。

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `VITE_APP_NAME` | `XBot` | 侧边栏显示的应用名称 |
| `VITE_APP_TAGLINE` | `Dashboard` | 应用名称下方的标语 |
| `VITE_APP_DESCRIPTION` | — | Meta 描述 |
| `VITE_EXPLORER_URL` | OKX 浏览器 | 区块链浏览器 URL |
| `VITE_CHAIN_NAME` | `X Layer` | 链名称 |
| `VITE_API_BASE` | `/api/dashboard` | API 基础路径 |
| `VITE_WS_URL` | 自动检测 | WebSocket URL |
| `VITE_DEFAULT_LANG` | `en` | 默认语言（en/vi/zh/ko/ru/id） |

---

## 目录结构

```
dashboard/
├── public/               # 静态资源（图标等）
├── src/
│   ├── api/
│   │   └── client.js     # API 客户端 — 所有后端 HTTP 请求
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.jsx    # 顶栏：搜索、主题切换、用户头像
│   │   │   ├── Layout.jsx    # 主布局：侧边栏 + 顶栏 + 内容区
│   │   │   └── Sidebar.jsx   # 导航侧边栏（根据角色显示不同菜单）
│   │   ├── LoginModal.jsx    # Telegram 登录组件 + 机器人深度链接
│   │   ├── Skeleton.jsx      # 加载骨架屏组件
│   │   └── ToastContainer.jsx # 通知提示组件
│   │
│   ├── i18n/
│   │   └── index.js      # 6种语言翻译文件
│   │
│   ├── pages/
│   │   ├── owner/             # 所有者页面（管理员）
│   │   │   ├── DashboardPage.jsx  # 机器人状态、用户/群组统计、延迟
│   │   │   ├── UsersPage.jsx      # 用户列表、搜索、封禁/解封
│   │   │   ├── GroupsPage.jsx     # 群组管理
│   │   │   ├── AnalyticsPage.jsx  # 使用统计和图表
│   │   │   ├── AlertsPage.jsx    # 价格提醒管理
│   │   │   ├── PostsPage.jsx     # 定时发布管理
│   │   │   └── ConfigPage.jsx    # 机器人配置和 API 密钥
│   │   ├── user/              # 用户页面（所有人可见）
│   │   │   ├── ProfilePage.jsx    # 用户资料和偏好设置
│   │   │   ├── WalletsPage.jsx    # 钱包管理
│   │   │   ├── TradingPage.jsx    # 交易历史
│   │   │   ├── LeaderboardPage.jsx # 游戏排行榜
│   │   │   └── SettingsPage.jsx   # 用户设置
│   │   ├── LandingPage.jsx    # 公共着陆页
│   │   ├── LoginPage.jsx      # 登录页面
│   │   └── NotFoundPage.jsx   # 404 页面
│   │
│   ├── stores/            # Zustand 状态管理
│   │   ├── authStore.js   # 认证状态、JWT、角色、视图模式切换
│   │   ├── themeStore.js  # 深色/浅色主题
│   │   ├── toastStore.js  # 通知队列
│   │   └── wsStore.js     # WebSocket 连接和实时事件
│   │
│   ├── App.jsx            # 根组件（路由和代码分割）
│   ├── config.js          # 仪表板配置（来自 VITE_ 环境变量）
│   ├── index.css          # 全局样式和设计系统
│   └── main.jsx           # 入口文件
│
├── .env.example           # 环境变量模板
├── index.html             # HTML 入口
├── package.json           # 依赖列表
├── tailwind.config.js     # Tailwind CSS 配置
└── vite.config.js         # Vite 构建配置（含 vendor 分包）
```

---

## 架构概览

### 认证流程

```
用户 → /dashboard
  ├── localStorage 中有有效 JWT？→ 仪表板（所有者或用户视图）
  └── 无 JWT → 着陆页
       ├── 点击 "使用 Telegram 登录" → Telegram 登录组件 → 获取 JWT
       └── 点击 "打开机器人" → /start dashboard_login → 一次性令牌 → JWT
```

### 角色系统

| 角色 | 权限 | 分配方式 |
|------|------|----------|
| **所有者 (Owner)** | 所有页面（管理 + 用户） | Telegram ID 匹配 `BOT_OWNER_ID` |
| **用户 (User)** | 资料、钱包、交易、排行榜、设置 | 任何已认证的 Telegram 用户 |

**视图切换**：所有者可通过侧边栏底部的切换按钮在"所有者视图"和"用户视图"之间切换。

### API 端点

所有端点前缀为 `/api/dashboard`。

#### 公开端点
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/bot-info` | 获取机器人用户名 |
| GET | `/health` | 服务器健康状态 |
| GET | `/auth/auto-login?token=` | 一次性令牌登录 |

#### 需认证（JWT）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/refresh` | 刷新 JWT 令牌 |
| GET | `/user/profile` | 用户资料 |
| PUT | `/user/preferences` | 更新偏好设置 |
| GET | `/user/wallets` | 用户钱包 |
| GET | `/user/trading-history` | 交易历史 |
| GET | `/user/leaderboard` | 游戏排行榜 |

#### 仅所有者
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/owner/overview` | 用户/群组统计、Telegram 延迟 |
| GET | `/owner/users` | 所有用户 |
| POST | `/owner/users/ban` | 封禁用户 |
| POST | `/owner/users/unban` | 解封用户 |
| GET | `/owner/groups` | 所有群组 |
| GET | `/owner/analytics` | 命令使用统计 |
| GET | `/owner/config/runtime` | 运行时配置 |
| GET/POST/PUT/DELETE | `/owner/alerts/*` | 价格提醒增删改查 |
| GET/POST/PUT/DELETE | `/owner/posts/*` | 定时发布增删改查 |

### 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | React 19 + Vite 6 |
| 路由 | React Router 7 |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS 3 |
| 图标 | Lucide React |
| 国际化 | react-i18next（6种语言） |
| 实时通信 | WebSocket（自动重连） |

---

## 安全性

- **仅 Telegram 认证** — 无密码登录
- **JWT 7天有效期** — 支持自动刷新
- **登录频率限制** — 每个 IP 每分钟最多5次
- **Gzip 压缩** — 所有响应均被压缩
- **所有者验证** — 服务端通过 Telegram ID 验证角色
- **私钥保护** — 私钥永不发送到仪表板

---

## 自定义

1. **品牌**：通过 `VITE_*` 环境变量覆盖（见上表）
2. **语言**：编辑 `src/i18n/index.js` 添加或修改翻译
3. **主题**：在 `tailwind.config.js` 中配置，设计令牌在 `index.css` 中
4. **页面**：在 `src/pages/` 中添加新页面，在 `App.jsx` 中注册路由
