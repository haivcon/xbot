/**
 * Dashboard Configuration
 * All customizable values in one place.
 * Override via Vite env vars (VITE_*) or edit defaults below.
 *
 * For .env file: prefix all with VITE_ (e.g., VITE_APP_NAME=MyBot)
 */

const config = {
    // ─── Branding ───
    appName: import.meta.env.VITE_APP_NAME || 'XBot',
    appTagline: import.meta.env.VITE_APP_TAGLINE || 'Dashboard',
    appDescription: import.meta.env.VITE_APP_DESCRIPTION || 'Manage your bot with a powerful web interface',
    appVersion: import.meta.env.VITE_APP_VERSION || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'),
    buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null,
    footerText: import.meta.env.VITE_FOOTER_TEXT || 'Powered by Telegram + OKX Web 3',

    // ─── Developer ───
    devName: 'ＤＯＲＥＭＯＮ',
    devTelegram: '@haivcon',
    devTwitter: '@haivcon_X',
    botTelegram: '@XlayerAi_bot',
    botTwitter: '@XlayerAi_bot',
    githubRepo: 'https://github.com/haivcon/xbot',

    // ─── Blockchain Explorer ───
    explorerBaseUrl: import.meta.env.VITE_EXPLORER_URL || 'https://www.okx.com/web3/explorer/xlayer',
    chainName: import.meta.env.VITE_CHAIN_NAME || 'X Layer',

    // ─── API ───
    apiBase: import.meta.env.VITE_API_BASE || '/api/dashboard',
    wsUrl: import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,

    // ─── Default Language ───
    defaultLang: import.meta.env.VITE_DEFAULT_LANG || 'en',
};

export default config;
