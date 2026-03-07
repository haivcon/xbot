/**
 * Wallets Database Module
 * Handles wallet management, token tracking, and holdings cache
 * File: db/wallets.js
 */

const ethers = require('ethers');
const { dbRun, dbGet, dbAll, safeJsonParse, normalizeWalletAddressSafe, normalizeTokenKey, DEFAULT_QUOTE_TARGETS } = require('./core');
const { normalizeLanguageCode } = require('../i18n.js');

// ========================================================================
// WALLET ENTRY HELPERS
// ========================================================================

function normalizeWalletEntry(input) {
    if (!input) return null;
    if (typeof input === 'string') {
        const normalized = normalizeWalletAddressSafe(input);
        return normalized ? { address: normalized, name: null } : null;
    }
    if (typeof input === 'object') {
        const normalized = normalizeWalletAddressSafe(input.address || input.wallet || input.addr);
        if (!normalized) return null;
        const rawName = typeof input.name === 'string' ? input.name.trim() : '';
        return { address: normalized, name: rawName ? rawName.slice(0, 64) : null };
    }
    return null;
}

function normalizeWalletEntries(walletsRaw) {
    const seen = new Set(), wallets = [];
    for (const entry of Array.isArray(walletsRaw) ? walletsRaw : []) {
        const normalized = normalizeWalletEntry(entry);
        if (!normalized) continue;
        const lower = normalized.address.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        wallets.push(normalized);
    }
    return wallets;
}

// ========================================================================
// USER WALLET FUNCTIONS
// ========================================================================

async function addWalletToUser(chatId, lang, walletAddress, options = {}) {
    const normalizedLangInput = normalizeLanguageCode(lang);
    const normalizedAddr = ethers.getAddress(walletAddress);
    const requestedName = typeof options.name === 'string' && options.name.trim().length > 0 ? options.name.trim().slice(0, 64) : null;

    const user = await dbGet('SELECT lang, lang_source, wallets FROM users WHERE chatId = ?', [chatId]);
    const walletsRaw = user ? safeJsonParse(user.wallets, []) : [];
    const wallets = normalizeWalletEntries(walletsRaw);
    const existingIndex = wallets.findIndex(entry => entry.address.toLowerCase() === normalizedAddr.toLowerCase());

    let added = false, nameChanged = false;
    let finalName = existingIndex >= 0 ? wallets[existingIndex].name || null : null;

    if (existingIndex >= 0) {
        if (requestedName && requestedName !== finalName) {
            wallets[existingIndex] = { address: normalizedAddr, name: requestedName };
            finalName = requestedName;
            nameChanged = true;
        }
    } else {
        wallets.push({ address: normalizedAddr, name: requestedName });
        added = true;
        finalName = requestedName;
    }

    const hasStoredLang = typeof user?.lang === 'string' && user.lang.trim().length > 0;
    const normalizedStored = hasStoredLang ? normalizeLanguageCode(user.lang) : null;
    const source = user?.lang_source || 'auto';
    let langToPersist = normalizedStored || normalizedLangInput;
    let nextSource = source;
    if (!normalizedStored) nextSource = 'auto';
    else if (source !== 'manual' && normalizedStored !== normalizedLangInput) { langToPersist = normalizedLangInput; nextSource = 'auto'; }

    const now = Math.floor(Date.now() / 1000);
    await dbRun(`INSERT INTO users(chatId, lang, wallets, lang_source, firstSeen, lastSeen) VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(chatId) DO UPDATE SET lang = excluded.lang, lang_source = excluded.lang_source, wallets = excluded.wallets, lastSeen = excluded.lastSeen, firstSeen = COALESCE(users.firstSeen, excluded.firstSeen)`,
        [chatId, langToPersist, JSON.stringify(wallets), nextSource, now, now]);
    console.log(`[DB] Added/updated wallet ${normalizedAddr} for ${chatId}`);
    return { added, wallet: normalizedAddr, name: finalName, nameChanged };
}

async function removeWalletFromUser(chatId, walletAddress) {
    const user = await dbGet('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return false;
    const normalizedTarget = normalizeWalletAddressSafe(walletAddress);
    const walletsRaw = safeJsonParse(user.wallets, []);
    const normalizedWallets = normalizeWalletEntries(walletsRaw);
    const nextWallets = normalizedWallets.filter(entry => normalizedTarget && entry.address.toLowerCase() !== normalizedTarget.toLowerCase());
    await dbRun('UPDATE users SET wallets = ? WHERE chatId = ?', [JSON.stringify(nextWallets), chatId]);
    await removeWalletTokensForWallet(chatId, walletAddress);
    await removeWalletHoldingsCache(chatId, walletAddress);
    console.log(`[DB] Removed wallet ${walletAddress} from ${chatId}`);
    return true;
}

async function removeAllWalletsFromUser(chatId) {
    await dbRun('UPDATE users SET wallets = ? WHERE chatId = ?', ['[]', chatId]);
    await removeAllWalletTokens(chatId);
    await removeAllWalletHoldingsCache(chatId);
    console.log(`[DB] Removed all wallets from ${chatId}`);
    return true;
}

async function getWalletsForUser(chatId) {
    const user = await dbGet('SELECT wallets FROM users WHERE chatId = ?', [chatId]);
    return normalizeWalletEntries(user ? safeJsonParse(user.wallets, []) : []);
}

async function getUsersForWallet(walletAddress) {
    const normalizedAddr = ethers.getAddress(walletAddress);
    const allUsers = await dbAll('SELECT chatId, lang, wallets FROM users');
    const users = [];
    for (const user of allUsers) {
        let wallets = [];
        try { if (user.wallets) wallets = JSON.parse(user.wallets); } catch (e) { console.error(`JSON parse error for ${user.chatId}`); }
        const normalizedWallets = normalizeWalletEntries(wallets);
        if (normalizedWallets.some(entry => entry.address.toLowerCase() === normalizedAddr.toLowerCase())) {
            users.push({ chatId: user.chatId, lang: normalizeLanguageCode(user.lang) });
        }
    }
    return users;
}

// ========================================================================
// WALLET TOKEN FUNCTIONS
// ========================================================================

async function upsertWalletTokenRecord({ chatId, walletAddress, tokenKey, tokenLabel, tokenAddress = null, quoteTargets = DEFAULT_QUOTE_TARGETS }) {
    const normalizedWallet = normalizeWalletAddressSafe(walletAddress);
    const normalizedTokenKey = normalizeTokenKey(tokenKey);
    if (!chatId || !normalizedWallet || !normalizedTokenKey) throw new Error('INVALID_WALLET_TOKEN_INPUT');
    const payload = Array.isArray(quoteTargets) && quoteTargets.length > 0 ? quoteTargets : DEFAULT_QUOTE_TARGETS;
    const normalizedTokenAddress = tokenAddress ? normalizeWalletAddressSafe(tokenAddress) : null;
    const normalizedLabel = tokenLabel && tokenLabel.trim().length > 0 ? tokenLabel.trim() : normalizedTokenKey.toUpperCase();
    const now = Date.now();
    await dbRun(`INSERT INTO user_wallet_tokens(chatId, walletAddress, tokenKey, tokenLabel, tokenAddress, quoteTargets, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chatId, walletAddress, tokenKey) DO UPDATE SET tokenLabel = excluded.tokenLabel, tokenAddress = excluded.tokenAddress, quoteTargets = excluded.quoteTargets, updatedAt = excluded.updatedAt`,
        [chatId, normalizedWallet, normalizedTokenKey, normalizedLabel, normalizedTokenAddress, JSON.stringify(payload), now, now]);
}

async function removeWalletTokenRecord(chatId, walletAddress, tokenKey) {
    const normalizedWallet = normalizeWalletAddressSafe(walletAddress);
    const normalizedTokenKey = normalizeTokenKey(tokenKey);
    if (!chatId || !normalizedWallet || !normalizedTokenKey) return false;
    await dbRun('DELETE FROM user_wallet_tokens WHERE chatId = ? AND walletAddress = ? AND tokenKey = ?', [chatId, normalizedWallet, normalizedTokenKey]);
    return true;
}

async function removeWalletTokensForWallet(chatId, walletAddress) {
    const normalizedWallet = normalizeWalletAddressSafe(walletAddress);
    if (!chatId || !normalizedWallet) return false;
    await dbRun('DELETE FROM user_wallet_tokens WHERE chatId = ? AND walletAddress = ?', [chatId, normalizedWallet]);
    return true;
}

async function removeAllWalletTokens(chatId) {
    if (!chatId) return false;
    await dbRun('DELETE FROM user_wallet_tokens WHERE chatId = ?', [chatId]);
    return true;
}

async function getWalletTokenOverview(chatId) {
    if (!chatId) return [];
    const rows = await dbAll('SELECT walletAddress, tokenKey, tokenLabel, tokenAddress, quoteTargets FROM user_wallet_tokens WHERE chatId = ? ORDER BY createdAt ASC', [chatId]);
    if (!rows || rows.length === 0) return [];
    const grouped = new Map();
    for (const row of rows) {
        const wallet = normalizeWalletAddressSafe(row.walletAddress);
        if (!wallet) continue;
        if (!grouped.has(wallet)) grouped.set(wallet, []);
        grouped.get(wallet).push({ tokenKey: row.tokenKey, tokenLabel: row.tokenLabel || row.tokenKey.toUpperCase(), tokenAddress: row.tokenAddress || null, quoteTargets: safeJsonParse(row.quoteTargets, DEFAULT_QUOTE_TARGETS) });
    }
    return Array.from(grouped.entries()).map(([wallet, tokens]) => ({ walletAddress: wallet, tokens }));
}

// ========================================================================
// HOLDINGS CACHE FUNCTIONS
// ========================================================================

async function saveWalletHoldingsCache(chatId, walletAddress, tokens) {
    const normalizedWallet = normalizeWalletAddressSafe(walletAddress);
    if (!chatId || !normalizedWallet || !Array.isArray(tokens)) return false;
    const now = Date.now();
    await dbRun(`INSERT INTO wallet_holdings_cache(chatId, walletAddress, tokens, updatedAt) VALUES(?, ?, ?, ?) ON CONFLICT(chatId, walletAddress) DO UPDATE SET tokens = excluded.tokens, updatedAt = excluded.updatedAt`,
        [chatId, normalizedWallet, JSON.stringify(tokens), now]);
    return true;
}

async function getWalletHoldingsCache(chatId, walletAddress) {
    const normalizedWallet = normalizeWalletAddressSafe(walletAddress);
    if (!chatId || !normalizedWallet) return { tokens: [], updatedAt: 0 };
    const row = await dbGet('SELECT tokens, updatedAt FROM wallet_holdings_cache WHERE chatId = ? AND walletAddress = ?', [chatId, normalizedWallet]);
    if (!row || !row.tokens) return { tokens: [], updatedAt: 0 };
    return { tokens: safeJsonParse(row.tokens, []), updatedAt: Number(row.updatedAt) || 0 };
}

async function removeWalletHoldingsCache(chatId, walletAddress) {
    const normalizedWallet = normalizeWalletAddressSafe(walletAddress);
    if (!chatId || !normalizedWallet) return false;
    await dbRun('DELETE FROM wallet_holdings_cache WHERE chatId = ? AND walletAddress = ?', [chatId, normalizedWallet]);
    return true;
}

async function removeAllWalletHoldingsCache(chatId) {
    if (!chatId) return false;
    await dbRun('DELETE FROM wallet_holdings_cache WHERE chatId = ?', [chatId]);
    return true;
}

module.exports = {
    // Helpers
    normalizeWalletEntry,
    normalizeWalletEntries,

    // User wallets
    addWalletToUser,
    removeWalletFromUser,
    removeAllWalletsFromUser,
    getWalletsForUser,
    getUsersForWallet,

    // Wallet tokens
    upsertWalletTokenRecord,
    removeWalletTokenRecord,
    removeWalletTokensForWallet,
    removeAllWalletTokens,
    getWalletTokenOverview,

    // Holdings cache
    saveWalletHoldingsCache,
    getWalletHoldingsCache,
    removeWalletHoldingsCache,
    removeAllWalletHoldingsCache
};
