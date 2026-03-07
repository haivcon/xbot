const { normalizeAddressSafe } = require('./web3');
const { PUBLIC_BASE_URL } = require('../config');

function parseRegisterPayload(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return null;
    }

    const trimmed = rawText.trim();
    if (!trimmed) {
        return null;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 1) {
        return null;
    }

    const wallet = normalizeAddressSafe(parts.shift());
    if (!wallet) {
        return null;
    }

    const name = parts.join(' ').trim();

    return { wallet, name: name || null, tokens: [] };
}

function buildPortfolioEmbedUrl(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress) || walletAddress;
    const base = PUBLIC_BASE_URL.replace(/\/$/, '');
    if (!base || base.includes('localhost') || base.startsWith('http://127.')) {
        return null;
    }
    if (!/^https?:\/\//i.test(base)) {
        return null;
    }
    return `${base}/webview/portfolio/${encodeURIComponent(normalized)}`;
}

module.exports = {
    parseRegisterPayload,
    buildPortfolioEmbedUrl
}