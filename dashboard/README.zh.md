# XBot 仪表板

此仓库只包含一个仪表板应用。Vite 负责构建，XBot Express API 在
`/xBot/` 路径提供静态文件。

## 环境要求

- Node.js 20.19+ 或 22.12+
- npm 9+
- 已配置并可运行的 XBot 后端

## 安装与开发

```bash
cd dashboard
npm install
npm run dev
```

打开 `http://localhost:5173/xBot/`。Vite 会将 `/api` 请求代理到
`http://localhost:3000`。

## 生产构建

```bash
cd dashboard
npm run build
```

构建入口为 `dashboard/dist/xBot/index.html`。构建后重启 XBot 进程；API
服务器会提供 `dashboard/dist`，并将 `/` 重定向到 `/xBot/`。

## 配置

浏览器端变量必须以 `VITE_` 开头，模板见 `dashboard/.env.example`。
后端部署和认证配置仍位于仓库根目录的 `.env`；不要把服务端凭证放入
仪表板变量。

## 目录结构

- `dashboard/xBot/index.html` — HTML 入口
- `dashboard/xBot/src/App.jsx` — 路由
- `dashboard/xBot/src/pages/` — 页面
- `dashboard/xBot/src/components/` — 通用组件
- `dashboard/xBot/src/i18n/` — 翻译
- `dashboard/xBot/src/api/client.js` — 后端 API 客户端
- `dashboard/public/` — PWA 清单、Service Worker、图标和 XBot 静态资源
- `dashboard/vite.config.js` — xBot 构建入口和 API 代理

## 验证

```bash
npm --prefix dashboard run build
npm test -- --runInBand
```

仓库边界回归测试位于 `__tests__/xbotRepositorySurface.test.js`。
