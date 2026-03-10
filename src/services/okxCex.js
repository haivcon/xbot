/**
 * OKX CEX REST API Service
 * Lightweight client for OKX centralized exchange (CEX) API.
 * Supports per-user encrypted API keys with demo/live profiles.
 * File: src/services/okxCex.js
 */

const crypto = require('crypto');
const logger = require('../core/logger');
const log = logger.child('OKXCex');

// ─── OKX CEX base URLs by site ───
const OKX_SITES = {
    global: 'https://www.okx.com',
    eea: 'https://my.okx.com',
    us: 'https://app.okx.com',
};

const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

/**
 * Generate HMAC-SHA256 signature for OKX API
 */
function signPayload(timestamp, method, requestPath, body, secretKey) {
    const payload = timestamp + method.toUpperCase() + requestPath + (body || '');
    return crypto.createHmac('sha256', secretKey).update(payload).digest('base64');
}

/**
 * Core authenticated fetch to OKX CEX API
 * @param {object} credentials - { apiKey, secretKey, passphrase, demo?, site? }
 * @param {'GET'|'POST'} method
 * @param {string} path - Request path with query string
 * @param {object} [body] - POST body
 */
async function okxCexFetch(credentials, method, path, body) {
    const site = credentials.site || 'global';
    const baseUrl = OKX_SITES[site] || OKX_SITES.global;
    const bodyStr = body ? JSON.stringify(body) : '';
    const url = `${baseUrl}${path}`;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const timestamp = new Date().toISOString();
            const sign = signPayload(timestamp, method, path, bodyStr, credentials.secretKey);

            const headers = {
                'OK-ACCESS-KEY': credentials.apiKey,
                'OK-ACCESS-SIGN': sign,
                'OK-ACCESS-PASSPHRASE': credentials.passphrase,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'Content-Type': 'application/json',
            };

            // Demo mode header
            if (credentials.demo) {
                headers['x-simulated-trading'] = '1';
            }

            const fetchOptions = {
                method,
                headers,
                signal: controller.signal,
            };
            if (body) fetchOptions.body = bodyStr;

            const res = await fetch(url, fetchOptions);

            if (res.status === 429) {
                lastError = { code: 'RATE_LIMITED', msg: 'Rate limited', retryable: true };
                if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY * (attempt + 1)); continue; }
                throw lastError;
            }
            if (res.status >= 500) {
                lastError = { code: `HTTP_${res.status}`, msg: `Server error ${res.status}`, retryable: true };
                if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY * (attempt + 1)); continue; }
                throw lastError;
            }

            const json = await res.json();
            clearTimeout(timer);

            if (json.code !== '0' && json.code !== '1') {
                throw { code: json.code, msg: json.msg || 'OKX API error', retryable: false };
            }
            return json.data || [];

        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                if (attempt >= MAX_RETRIES) throw { code: 'TIMEOUT', msg: `Request timed out`, retryable: true };
                lastError = { code: 'TIMEOUT', msg: 'Request timed out', retryable: true };
                await sleep(RETRY_DELAY * (attempt + 1));
                continue;
            }
            if (error.retryable === false || attempt >= MAX_RETRIES) throw error;
            lastError = error;
            await sleep(RETRY_DELAY * (attempt + 1));
        }
    }
    throw lastError || { code: 'UNKNOWN', msg: 'Unknown error after retries' };
}

/**
 * Public GET (no auth needed) — for market data
 */
async function publicGet(path) {
    const site = 'global';
    const baseUrl = OKX_SITES[site];
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timer);
        const json = await res.json();
        if (json.code !== '0') throw { code: json.code, msg: json.msg || 'API error' };
        return json.data || [];
    } catch (error) {
        clearTimeout(timer);
        throw error;
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildPath(base, params) {
    const filtered = {};
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') filtered[k] = String(v);
    }
    const qs = new URLSearchParams(filtered).toString();
    return qs ? `${base}?${qs}` : base;
}

// ───────────────────────────────────
// Encryption helpers for per-user keys
// ───────────────────────────────────

function getEncryptKey() {
    const { _getEncryptKey } = require('../features/ai/onchain/helpers');
    return _getEncryptKey();
}

function encryptValue(value) {
    const key = getEncryptKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptValue(encrypted) {
    const key = getEncryptKey();
    const [ivHex, data] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ═══════════════════════════════════
// API Key Management (DB)
// ═══════════════════════════════════

async function saveUserOkxKeys(userId, { apiKey, secretKey, passphrase, demo = false, site = 'global' }) {
    const { dbRun, dbGet } = require('../../db/core');
    const encApiKey = encryptValue(apiKey);
    const encSecretKey = encryptValue(secretKey);
    const encPassphrase = encryptValue(passphrase);

    const existing = await dbGet('SELECT id FROM user_okx_keys WHERE userId = ?', [userId]);
    if (existing) {
        await dbRun(
            'UPDATE user_okx_keys SET encApiKey = ?, encSecretKey = ?, encPassphrase = ?, demo = ?, site = ?, updatedAt = ? WHERE userId = ?',
            [encApiKey, encSecretKey, encPassphrase, demo ? 1 : 0, site, Math.floor(Date.now() / 1000), userId]
        );
    } else {
        await dbRun(
            'INSERT INTO user_okx_keys (userId, encApiKey, encSecretKey, encPassphrase, demo, site, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, encApiKey, encSecretKey, encPassphrase, demo ? 1 : 0, site, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)]
        );
    }
}

async function getUserOkxCredentials(userId) {
    const { dbGet } = require('../../db/core');
    const row = await dbGet('SELECT * FROM user_okx_keys WHERE userId = ?', [userId]);
    if (!row) return null;

    return {
        apiKey: decryptValue(row.encApiKey),
        secretKey: decryptValue(row.encSecretKey),
        passphrase: decryptValue(row.encPassphrase),
        demo: !!row.demo,
        site: row.site || 'global'
    };
}

async function hasUserOkxKeys(userId) {
    const { dbGet } = require('../../db/core');
    const row = await dbGet('SELECT id, demo, site FROM user_okx_keys WHERE userId = ?', [userId]);
    return row ? { exists: true, demo: !!row.demo, site: row.site } : { exists: false };
}

async function deleteUserOkxKeys(userId) {
    const { dbRun } = require('../../db/core');
    await dbRun('DELETE FROM user_okx_keys WHERE userId = ?', [userId]);
}

// ═══════════════════════════════════
// Market Data (Public, no auth)
// ═══════════════════════════════════

async function getTicker(instId) {
    return publicGet(buildPath('/api/v5/market/ticker', { instId }));
}

async function getTickers(instType = 'SPOT') {
    return publicGet(buildPath('/api/v5/market/tickers', { instType }));
}

async function getOrderBook(instId, sz = '20') {
    return publicGet(buildPath('/api/v5/market/books', { instId, sz }));
}

async function getCandles(instId, bar = '1H', limit = '100') {
    return publicGet(buildPath('/api/v5/market/candles', { instId, bar, limit }));
}

async function getFundingRate(instId) {
    return publicGet(buildPath('/api/v5/public/funding-rate', { instId }));
}

async function getInstruments(instType = 'SPOT', instId) {
    return publicGet(buildPath('/api/v5/public/instruments', { instType, instId }));
}

// ═══════════════════════════════════
// Account (Private, requires auth)
// ═══════════════════════════════════

async function getAccountBalance(creds, ccy) {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/account/balance', { ccy }));
}

async function getAssetBalance(creds, ccy) {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/asset/balances', { ccy }));
}

async function getPositions(creds, instType) {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/account/positions', { instType }));
}

// ═══════════════════════════════════
// Spot Trading (Private)
// ═══════════════════════════════════

async function placeOrder(creds, params) {
    return okxCexFetch(creds, 'POST', '/api/v5/trade/order', {
        instId: params.instId,
        tdMode: params.tdMode || 'cash',
        side: params.side,     // buy | sell
        ordType: params.ordType, // market | limit | post_only | fok | ioc
        sz: params.sz,
        px: params.px,          // price (for limit orders)
        tgtCcy: params.tgtCcy,  // base_ccy | quote_ccy
    });
}

async function cancelOrder(creds, instId, ordId) {
    return okxCexFetch(creds, 'POST', '/api/v5/trade/cancel-order', { instId, ordId });
}

async function getOpenOrders(creds, instType, instId) {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/trade/orders-pending', { instType, instId }));
}

async function getOrderHistory(creds, instType = 'SPOT', limit = '50') {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/trade/orders-history-archive', { instType, limit }));
}

async function getOrder(creds, instId, ordId) {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/trade/order', { instId, ordId }));
}

// ═══════════════════════════════════
// Grid Bot (Private)
// ═══════════════════════════════════

async function createGridOrder(creds, params) {
    return okxCexFetch(creds, 'POST', '/api/v5/tradingBot/grid/order-algo', {
        instId: params.instId,
        algoOrdType: params.algoOrdType || 'grid', // grid, contract_grid, moon_grid
        maxPx: params.maxPx,
        minPx: params.minPx,
        gridNum: params.gridNum,
        quoteSz: params.quoteSz,
        basePos: params.basePos,
        runType: params.runType || '1', // 1=auto
    });
}

async function stopGridOrder(creds, algoId, instId, algoOrdType) {
    return okxCexFetch(creds, 'POST', '/api/v5/tradingBot/grid/stop-order-algo', [{
        algoId,
        instId,
        algoOrdType: algoOrdType || 'grid',
        stopType: '1', // 1=market close
    }]);
}

async function getGridOrders(creds, algoOrdType = 'grid', algoId) {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/tradingBot/grid/orders-algo-pending', { algoOrdType, algoId }));
}

async function getGridOrderHistory(creds, algoOrdType = 'grid') {
    return okxCexFetch(creds, 'GET', buildPath('/api/v5/tradingBot/grid/orders-algo-history', { algoOrdType }));
}

module.exports = {
    // Key management
    saveUserOkxKeys,
    getUserOkxCredentials,
    hasUserOkxKeys,
    deleteUserOkxKeys,
    encryptValue,
    decryptValue,
    // Market (public)
    getTicker,
    getTickers,
    getOrderBook,
    getCandles,
    getFundingRate,
    getInstruments,
    // Account (private)
    getAccountBalance,
    getAssetBalance,
    getPositions,
    // Spot trading (private)
    placeOrder,
    cancelOrder,
    getOpenOrders,
    getOrderHistory,
    getOrder,
    // Grid bot (private)
    createGridOrder,
    stopGridOrder,
    getGridOrders,
    getGridOrderHistory,
};
