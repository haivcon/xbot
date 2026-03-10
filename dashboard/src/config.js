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
    appVersion: import.meta.env.VITE_APP_VERSION || '1.0',
    footerText: import.meta.env.VITE_FOOTER_TEXT || 'Powered by Telegram',

    // ─── Blockchain Explorer ───
    explorerBaseUrl: import.meta.env.VITE_EXPLORER_URL || 'https://www.okx.com/web3/explorer/xlayer',
    chainName: import.meta.env.VITE_CHAIN_NAME || 'X Layer',

    // ─── API ───
    apiBase: import.meta.env.VITE_API_BASE || '/api/dashboard',
    wsUrl: import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,

    // ─── Default Language ───
    defaultLang: import.meta.env.VITE_DEFAULT_LANG || 'en',

    // ─── Dev Mode ───
    devLoginEnabled: import.meta.env.VITE_DEV_LOGIN !== 'false',
};

export default config;
