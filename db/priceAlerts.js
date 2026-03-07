/**
 * Price Alerts Database Module
 * Handles price alert tokens and targets
 * File: db/priceAlerts.js
 */

const { dbRun, dbGet, dbAll, normalizePriceIntervalSeconds, PRICE_ALERT_DEFAULT_INTERVAL } = require('./core');

// ========================================================================
// HELPERS
// ========================================================================

function mapPriceAlertRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        chatId: row.chatId,
        tokenAddress: row.tokenAddress,
        tokenLabel: row.tokenLabel || null,
        customTitle: row.customTitle || null,
        chainIndex: Number.isFinite(row.chainIndex) ? Number(row.chainIndex) : null,
        chainShortName: row.chainShortName || null,
        intervalSeconds: Number.isFinite(row.intervalSeconds) ? Number(row.intervalSeconds) : PRICE_ALERT_DEFAULT_INTERVAL,
        enabled: Number(row.enabled) === 1 ? 1 : 0,
        lastRunAt: row.lastRunAt || null,
        nextRunAt: row.nextRunAt || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null
    };
}

// ========================================================================
// PRICE ALERT TOKENS
// ========================================================================

async function listPriceAlertTokens(chatId) {
    if (!chatId) return [];
    const rows = await dbAll('SELECT * FROM price_alert_tokens WHERE chatId = ? ORDER BY createdAt ASC', [chatId.toString()]);
    return rows.map(mapPriceAlertRow);
}

async function getPriceAlertToken(chatId, tokenId) {
    const chatKey = chatId ? chatId.toString() : null;
    const id = Number(tokenId);
    if (!chatKey || !Number.isFinite(id)) return null;
    const row = await dbGet('SELECT * FROM price_alert_tokens WHERE id = ? AND chatId = ?', [id, chatKey]);
    return mapPriceAlertRow(row);
}

async function upsertPriceAlertToken(chatId, tokenData = {}) {
    const chatKey = chatId ? chatId.toString() : null;
    const tokenAddress = (tokenData.tokenAddress || '').trim();
    if (!chatKey || !tokenAddress) return null;
    const now = Date.now();
    const label = tokenData.tokenLabel ? tokenData.tokenLabel.toString().trim() : null;
    const chainIndex = Number.isFinite(Number(tokenData.chainIndex)) ? Number(tokenData.chainIndex) : null;
    const chainShortName = tokenData.chainShortName ? tokenData.chainShortName.toString().trim() : null;
    const enabled = tokenData.enabled === undefined || tokenData.enabled === null ? 1 : (tokenData.enabled ? 1 : 0);
    const intervalSeconds = normalizePriceIntervalSeconds(tokenData.intervalSeconds, PRICE_ALERT_DEFAULT_INTERVAL);
    const nextRunAt = Number.isFinite(Number(tokenData.nextRunAt)) ? Number(tokenData.nextRunAt) : now;
    const lastRunAt = Number.isFinite(Number(tokenData.lastRunAt)) ? Number(tokenData.lastRunAt) : null;

    if (tokenData.id) {
        const updates = [], values = [];
        const patch = { tokenAddress, tokenLabel: label, chainIndex, chainShortName, intervalSeconds, enabled, nextRunAt, lastRunAt };
        for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined) { updates.push(`${key} = ?`); values.push(value); }
        }
        if (updates.length === 0) return getPriceAlertToken(chatKey, tokenData.id);
        updates.push('updatedAt = ?'); values.push(now, tokenData.id, chatKey);
        await dbRun(`UPDATE price_alert_tokens SET ${updates.join(', ')} WHERE id = ? AND chatId = ?`, values);
        return getPriceAlertToken(chatKey, tokenData.id);
    }

    const result = await dbRun('INSERT INTO price_alert_tokens(chatId, tokenAddress, tokenLabel, chainIndex, chainShortName, intervalSeconds, enabled, lastRunAt, nextRunAt, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [chatKey, tokenAddress, label, chainIndex, chainShortName, intervalSeconds, enabled, lastRunAt, nextRunAt, now, now]);
    if (result?.lastID) return getPriceAlertToken(chatKey, result.lastID);
    const row = await dbGet('SELECT * FROM price_alert_tokens WHERE chatId = ? AND tokenAddress = ? AND COALESCE(chainIndex, -1) = COALESCE(?, -1)', [chatKey, tokenAddress, chainIndex]);
    return mapPriceAlertRow(row);
}

async function updatePriceAlertToken(chatId, tokenId, patch = {}) {
    const chatKey = chatId ? chatId.toString() : null;
    const id = Number(tokenId);
    if (!chatKey || !Number.isFinite(id)) return null;
    const allowed = ['tokenAddress', 'tokenLabel', 'customTitle', 'chainIndex', 'chainShortName', 'intervalSeconds', 'enabled', 'nextRunAt', 'lastRunAt'];
    const updates = [], values = [];
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            let value = patch[key];
            if (key === 'intervalSeconds') value = normalizePriceIntervalSeconds(value, PRICE_ALERT_DEFAULT_INTERVAL);
            if (key === 'enabled') value = value ? 1 : 0;
            if (key === 'chainIndex' && (value === undefined || value === null || value === '')) value = null;
            updates.push(`${key} = ?`); values.push(value);
        }
    }
    if (updates.length === 0) return getPriceAlertToken(chatKey, id);
    updates.push('updatedAt = ?'); values.push(Date.now(), id, chatKey);
    await dbRun(`UPDATE price_alert_tokens SET ${updates.join(', ')} WHERE id = ? AND chatId = ?`, values);
    return getPriceAlertToken(chatKey, id);
}

async function deletePriceAlertToken(chatId, tokenId) {
    const chatKey = chatId ? chatId.toString() : null;
    const id = Number(tokenId);
    if (!chatKey || !Number.isFinite(id)) return false;
    const result = await dbRun('DELETE FROM price_alert_tokens WHERE id = ? AND chatId = ?', [id, chatKey]);
    return Boolean(result?.changes);
}

async function listDuePriceAlertTokens(limit = 10, nowMs = null) {
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
    const rows = await dbAll('SELECT * FROM price_alert_tokens WHERE enabled = 1 AND (nextRunAt IS NULL OR nextRunAt <= ?) ORDER BY COALESCE(nextRunAt, 0) ASC LIMIT ?', [now, safeLimit]);
    return rows.map(mapPriceAlertRow);
}

async function recordPriceAlertRun(tokenId, intervalSeconds = PRICE_ALERT_DEFAULT_INTERVAL) {
    const id = Number(tokenId);
    if (!Number.isFinite(id)) return null;
    const now = Date.now();
    const interval = normalizePriceIntervalSeconds(intervalSeconds, PRICE_ALERT_DEFAULT_INTERVAL);
    await dbRun('UPDATE price_alert_tokens SET lastRunAt = ?, nextRunAt = ?, updatedAt = ? WHERE id = ?', [now, now + interval * 1000, now, id]);
    const row = await dbGet('SELECT * FROM price_alert_tokens WHERE id = ?', [id]);
    return mapPriceAlertRow(row);
}

// ========================================================================
// PRICE ALERT TARGETS
// ========================================================================

async function setPriceAlertTarget(chatId, topicId) {
    const chatKey = chatId ? chatId.toString() : null;
    if (!chatKey) return null;
    const now = Date.now();
    const topic = topicId === undefined || topicId === null ? null : topicId.toString();
    await dbRun('INSERT INTO price_alert_targets(chatId, topicId, updatedAt) VALUES(?, ?, ?) ON CONFLICT(chatId) DO UPDATE SET topicId = excluded.topicId, updatedAt = excluded.updatedAt',
        [chatKey, topic, now]);
    return getPriceAlertTarget(chatKey);
}

async function getPriceAlertTarget(chatId) {
    if (!chatId) return null;
    const row = await dbGet('SELECT chatId, topicId, updatedAt FROM price_alert_targets WHERE chatId = ?', [chatId.toString()]);
    if (!row) return null;
    return { chatId: row.chatId, topicId: row.topicId || null, updatedAt: row.updatedAt || null };
}

// ========================================================================
// PENDING TOKENS (for API wallet verification)
// ========================================================================

async function addPendingToken(token, walletAddress) {
    if (!token || !walletAddress) return null;
    const now = Date.now();
    await dbRun('INSERT INTO pending_tokens (token, walletAddress, createdAt, status) VALUES (?, ?, ?, ?)',
        [token, walletAddress, now, 'pending']);
    return { token, walletAddress, createdAt: now };
}

async function getPendingToken(token) {
    if (!token) return null;
    return dbGet('SELECT token, walletAddress, createdAt, status FROM pending_tokens WHERE token = ?', [token]);
}

async function deletePendingToken(token) {
    if (!token) return false;
    const result = await dbRun('DELETE FROM pending_tokens WHERE token = ?', [token]);
    return Boolean(result?.changes);
}

// ========================================================================
// PRICE ALERT MEDIA
// ========================================================================

function mapPriceAlertMediaRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        tokenId: row.tokenId,
        chatId: row.chatId,
        mediaType: row.mediaType || 'photo',
        fileId: row.fileId,
        createdAt: row.createdAt || null
    };
}

async function addPriceAlertMedia(tokenId, chatId, mediaType, fileId) {
    if (!tokenId || !chatId || !fileId) return null;
    const now = Date.now();
    const result = await dbRun(
        'INSERT INTO price_alert_media(tokenId, chatId, mediaType, fileId, createdAt) VALUES(?, ?, ?, ?, ?)',
        [tokenId, chatId.toString(), mediaType || 'photo', fileId, now]
    );
    if (result?.lastID) {
        const row = await dbGet('SELECT * FROM price_alert_media WHERE id = ?', [result.lastID]);
        return mapPriceAlertMediaRow(row);
    }
    return null;
}

async function listPriceAlertMedia(tokenId, chatId) {
    if (!tokenId || !chatId) return [];
    const rows = await dbAll(
        'SELECT * FROM price_alert_media WHERE tokenId = ? AND chatId = ? ORDER BY createdAt ASC',
        [tokenId, chatId.toString()]
    );
    return rows.map(mapPriceAlertMediaRow);
}

async function deletePriceAlertMedia(mediaId) {
    if (!mediaId) return false;
    const result = await dbRun('DELETE FROM price_alert_media WHERE id = ?', [mediaId]);
    return Boolean(result?.changes);
}

async function deleteAllPriceAlertMedia(tokenId, chatId) {
    if (!tokenId || !chatId) return 0;
    const result = await dbRun(
        'DELETE FROM price_alert_media WHERE tokenId = ? AND chatId = ?',
        [tokenId, chatId.toString()]
    );
    return result?.changes || 0;
}

async function countPriceAlertMedia(tokenId, chatId) {
    if (!tokenId || !chatId) return 0;
    const row = await dbGet(
        'SELECT COUNT(*) as count FROM price_alert_media WHERE tokenId = ? AND chatId = ?',
        [tokenId, chatId.toString()]
    );
    return row?.count || 0;
}

// ========================================================================
// PRICE ALERT TITLES
// ========================================================================

function mapPriceAlertTitleRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        tokenId: row.tokenId,
        chatId: row.chatId,
        title: row.title,
        createdAt: row.createdAt || null
    };
}

async function addPriceAlertTitle(tokenId, chatId, title) {
    if (!tokenId || !chatId || !title) return null;
    const now = Date.now();
    const result = await dbRun(
        'INSERT INTO price_alert_titles(tokenId, chatId, title, createdAt) VALUES(?, ?, ?, ?)',
        [tokenId, chatId.toString(), title.trim(), now]
    );
    if (result?.lastID) {
        const row = await dbGet('SELECT * FROM price_alert_titles WHERE id = ?', [result.lastID]);
        return mapPriceAlertTitleRow(row);
    }
    return null;
}

async function listPriceAlertTitles(tokenId, chatId) {
    if (!tokenId || !chatId) return [];
    const rows = await dbAll(
        'SELECT * FROM price_alert_titles WHERE tokenId = ? AND chatId = ? ORDER BY createdAt ASC',
        [tokenId, chatId.toString()]
    );
    return rows.map(mapPriceAlertTitleRow);
}

async function deletePriceAlertTitle(titleId) {
    if (!titleId) return false;
    const result = await dbRun('DELETE FROM price_alert_titles WHERE id = ?', [titleId]);
    return Boolean(result?.changes);
}

async function deleteAllPriceAlertTitles(tokenId, chatId) {
    if (!tokenId || !chatId) return 0;
    const result = await dbRun(
        'DELETE FROM price_alert_titles WHERE tokenId = ? AND chatId = ?',
        [tokenId, chatId.toString()]
    );
    return result?.changes || 0;
}

async function countPriceAlertTitles(tokenId, chatId) {
    if (!tokenId || !chatId) return 0;
    const row = await dbGet(
        'SELECT COUNT(*) as count FROM price_alert_titles WHERE tokenId = ? AND chatId = ?',
        [tokenId, chatId.toString()]
    );
    return row?.count || 0;
}

module.exports = {
    mapPriceAlertRow,
    listPriceAlertTokens,
    getPriceAlertToken,
    upsertPriceAlertToken,
    updatePriceAlertToken,
    deletePriceAlertToken,
    listDuePriceAlertTokens,
    recordPriceAlertRun,
    setPriceAlertTarget,
    getPriceAlertTarget,
    // Pending tokens (API wallet verification)
    addPendingToken,
    getPendingToken,
    deletePendingToken,
    // Price alert media
    addPriceAlertMedia,
    listPriceAlertMedia,
    deletePriceAlertMedia,
    deleteAllPriceAlertMedia,
    countPriceAlertMedia,
    // Price alert titles
    addPriceAlertTitle,
    listPriceAlertTitles,
    deletePriceAlertTitle,
    deleteAllPriceAlertTitles,
    countPriceAlertTitles
};
