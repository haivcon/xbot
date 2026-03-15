/**
 * AI Database Module
 * Handles AI keys, providers, preferences, memory, and TTS settings
 * File: db/ai.js
 */

const { dbRun, dbGet, dbAll, safeJsonParse, getTodayDateString } = require('./core');

function normalizeTargetId(targetId) {
    if (!targetId) return null;
    return String(targetId).trim() || null;
}

// ========================================================================
// AI KEYS
// ========================================================================

async function listUserAiKeys(userId, provider = null) {
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedUser) return [];
    const filter = provider ? ' AND provider = ?' : '';
    const params = provider ? [normalizedUser, provider] : [normalizedUser];
    return await dbAll(`SELECT id, name, apiKey, provider, createdAt FROM user_ai_keys WHERE userId = ?${filter} ORDER BY createdAt DESC, id DESC`, params) || [];
}

async function getUserAiKey(userId, keyId) {
    const normalizedUser = normalizeTargetId(userId);
    const normalizedKeyId = Number(keyId);
    if (!normalizedUser || !Number.isFinite(normalizedKeyId)) return null;
    return dbGet('SELECT id, name, apiKey, provider, createdAt FROM user_ai_keys WHERE userId = ? AND id = ?', [normalizedUser, normalizedKeyId]);
}

async function listAllUserAiKeysDetailed() {
    return await dbAll(`SELECT k.id, k.userId, k.name, k.apiKey, k.provider, k.createdAt, u.username, u.fullName, u.firstSeen, u.lastSeen
        FROM user_ai_keys k LEFT JOIN users u ON u.chatId = k.userId ORDER BY k.provider ASC, k.createdAt DESC, k.id DESC`) || [];
}

async function addUserAiKey(userId, name, apiKey, provider = 'google') {
    const normalizedUser = normalizeTargetId(userId);
    const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!normalizedUser || !trimmedKey) return { added: false };
    const safeProvider = typeof provider === 'string' && provider.trim() ? provider.trim() : 'google';
    const safeName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null;
    const now = Date.now();
    const existing = await dbGet('SELECT id, name FROM user_ai_keys WHERE userId = ? AND apiKey = ? AND provider = ? LIMIT 1', [normalizedUser, trimmedKey, safeProvider]);
    if (existing) {
        if (safeName && safeName !== existing.name) {
            await dbRun('UPDATE user_ai_keys SET name = ?, createdAt = ? WHERE id = ?', [safeName, now, existing.id]);
            return { added: false, updated: true, id: existing.id, name: safeName, provider: safeProvider };
        }
        return { added: false, updated: false, id: existing.id, name: existing.name, provider: safeProvider };
    }
    const result = await dbRun('INSERT INTO user_ai_keys (userId, name, apiKey, provider, createdAt) VALUES (?, ?, ?, ?, ?)', [normalizedUser, safeName, trimmedKey, safeProvider, now]);
    return { added: true, id: result?.lastID || null, name: safeName, provider: safeProvider };
}

async function deleteUserAiKey(userId, keyId) {
    const normalizedUser = normalizeTargetId(userId);
    const numericId = Number(keyId);
    if (!normalizedUser || !Number.isInteger(numericId)) return { deleted: false };
    const result = await dbRun('DELETE FROM user_ai_keys WHERE userId = ? AND id = ?', [normalizedUser, numericId]);
    return { deleted: Boolean(result?.changes) };
}

async function deleteUserAiKeys(userId) {
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedUser) return { deleted: 0 };
    const result = await dbRun('DELETE FROM user_ai_keys WHERE userId = ?', [normalizedUser]);
    return { deleted: Number(result?.changes) || 0 };
}

async function deleteAllUserAiKeys() {
    const result = await dbRun('DELETE FROM user_ai_keys');
    return { deleted: Number(result?.changes) || 0 };
}

async function listAiKeyUsers() {
    const rows = await dbAll('SELECT DISTINCT userId FROM user_ai_keys');
    return (rows || []).map(row => row.userId);
}

// ========================================================================
// AI PROVIDER & PREFERENCES
// ========================================================================

async function getUserAiProvider(userId) {
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedUser) return null;
    const row = await dbGet('SELECT provider FROM user_ai_preferences WHERE userId = ? LIMIT 1', [normalizedUser]);
    return row && typeof row.provider === 'string' && row.provider.trim() ? row.provider.trim() : null;
}

async function setUserAiProvider(userId, provider) {
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedUser) return { saved: false };
    const safeProvider = typeof provider === 'string' && provider.trim() ? provider.trim() : null;
    if (!safeProvider) { await dbRun('DELETE FROM user_ai_preferences WHERE userId = ?', [normalizedUser]); return { saved: false }; }
    const now = Date.now();
    await dbRun('INSERT INTO user_ai_preferences(userId, provider, updatedAt) VALUES(?, ?, ?) ON CONFLICT(userId) DO UPDATE SET provider = excluded.provider, updatedAt = excluded.updatedAt', [normalizedUser, safeProvider, now]);
    return { saved: true, provider: safeProvider };
}

async function getUserAiModelPreferences(userId) {
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedUser) return null;
    const row = await dbGet('SELECT modelFamily, thinkingLevel, preferredKeyIndex FROM user_ai_preferences WHERE userId = ? LIMIT 1', [normalizedUser]);
    if (!row) return null;
    return { modelFamily: row.modelFamily || 'gemini-3-flash', thinkingLevel: row.thinkingLevel || null, preferredKeyIndex: row.preferredKeyIndex ?? 0 };
}

async function saveUserAiModelPreferences(userId, preferences) {
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedUser || !preferences) return { saved: false };
    const { modelFamily, thinkingLevel, preferredKeyIndex } = preferences;
    const now = Date.now();
    await dbRun('INSERT INTO user_ai_preferences(userId, updatedAt) VALUES(?, ?) ON CONFLICT(userId) DO UPDATE SET updatedAt = excluded.updatedAt', [normalizedUser, now]);
    const updates = [], values = [];
    if (modelFamily !== undefined) { updates.push('modelFamily = ?'); values.push(modelFamily); }
    if (thinkingLevel !== undefined) { updates.push('thinkingLevel = ?'); values.push(thinkingLevel); }
    if (preferredKeyIndex !== undefined) { updates.push('preferredKeyIndex = ?'); values.push(preferredKeyIndex); }
    if (updates.length > 0) { updates.push('updatedAt = ?'); values.push(now, normalizedUser); await dbRun(`UPDATE user_ai_preferences SET ${updates.join(', ')} WHERE userId = ?`, values); }
    return { saved: true };
}

async function listAllAiModelPreferences() {
    return await dbAll('SELECT userId, modelFamily, thinkingLevel, preferredKeyIndex FROM user_ai_preferences') || [];
}

// ========================================================================
// API KEY BLOCKS
// ========================================================================

async function setApiKeyBlock(userId, blocked = true, reason = null, addedBy = null) {
    const normalizedUser = normalizeTargetId(userId) || 'GLOBAL';
    if (!blocked) { await dbRun('DELETE FROM api_key_blocks WHERE userId = ?', [normalizedUser]); return { blocked: false }; }
    const now = Date.now();
    await dbRun('INSERT INTO api_key_blocks(userId, reason, addedBy, createdAt) VALUES(?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET reason = excluded.reason, addedBy = excluded.addedBy, createdAt = excluded.createdAt', [normalizedUser, reason || null, addedBy || null, now]);
    return { blocked: true };
}

async function isUserBlockedFromApiKeys(userId) {
    const normalizedUser = normalizeTargetId(userId);
    const globalBlock = await dbGet('SELECT userId FROM api_key_blocks WHERE userId = ? LIMIT 1', ['GLOBAL']);
    if (globalBlock) return true;
    if (!normalizedUser) return false;
    const row = await dbGet('SELECT userId FROM api_key_blocks WHERE userId = ? LIMIT 1', [normalizedUser]);
    return Boolean(row);
}

async function listApiKeyBlocks() {
    return await dbAll('SELECT userId, reason, addedBy, createdAt FROM api_key_blocks') || [];
}

// ========================================================================
// AI MEMORY
// ========================================================================

async function getAiMemory(userId) {
    if (!userId) return null;
    const row = await dbGet('SELECT * FROM user_ai_memory WHERE userId = ?', [userId]);
    if (!row) return null;
    return { userId: row.userId, userName: row.userName, userPreferences: safeJsonParse(row.userPreferences, {}), conversationSummary: row.conversationSummary, persona: row.persona || 'default', lastContext: row.lastContext, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

async function updateAiMemory(userId, updates = {}) {
    if (!userId) return false;
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT * FROM user_ai_memory WHERE userId = ?', [userId]);
    if (!existing) {
        await dbRun('INSERT INTO user_ai_memory(userId, userName, userPreferences, conversationSummary, persona, lastContext, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, updates.userName || null, updates.userPreferences ? JSON.stringify(updates.userPreferences) : '{}', updates.conversationSummary || null, updates.persona || 'default', updates.lastContext || null, now, now]);
    } else {
        const setClauses = ['updatedAt = ?'], params = [now];
        if (updates.userName !== undefined) { setClauses.push('userName = ?'); params.push(updates.userName); }
        if (updates.userPreferences !== undefined) { setClauses.push('userPreferences = ?'); params.push(JSON.stringify(updates.userPreferences)); }
        if (updates.conversationSummary !== undefined) { setClauses.push('conversationSummary = ?'); params.push(updates.conversationSummary); }
        if (updates.persona !== undefined) { setClauses.push('persona = ?'); params.push(updates.persona); }
        if (updates.lastContext !== undefined) { setClauses.push('lastContext = ?'); params.push(updates.lastContext); }
        if (updates.conversationHistory !== undefined) { setClauses.push('conversationHistory = ?'); params.push(JSON.stringify(updates.conversationHistory)); }
        params.push(userId);
        await dbRun(`UPDATE user_ai_memory SET ${setClauses.join(', ')} WHERE userId = ?`, params);
    }
    return true;
}

async function clearAiMemory(userId) {
    if (!userId) return false;
    await dbRun('DELETE FROM user_ai_memory WHERE userId = ?', [userId]);
    return true;
}

// ========================================================================
// TTS SETTINGS
// ========================================================================

async function getTtsSettings(userId) {
    if (!userId) return null;
    return await dbGet('SELECT voice, language FROM user_tts_settings WHERE userId = ?', [userId]);
}

async function saveTtsSettings(userId, voice, language) {
    if (!userId) return false;
    await dbRun('INSERT INTO user_tts_settings(userId, voice, language, updatedAt) VALUES(?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET voice = excluded.voice, language = excluded.language, updatedAt = excluded.updatedAt',
        [userId, voice, language, Date.now()]);
    return true;
}

module.exports = {
    // Keys
    listUserAiKeys,
    getUserAiKey,
    listAllUserAiKeysDetailed,
    addUserAiKey,
    deleteUserAiKey,
    deleteUserAiKeys,
    deleteAllUserAiKeys,
    listAiKeyUsers,

    // Provider & preferences
    getUserAiProvider,
    setUserAiProvider,
    getUserAiModelPreferences,
    saveUserAiModelPreferences,
    listAllAiModelPreferences,

    // Blocks
    setApiKeyBlock,
    isUserBlockedFromApiKeys,
    listApiKeyBlocks,

    // Memory
    getAiMemory,
    updateAiMemory,
    clearAiMemory,

    // TTS
    getTtsSettings,
    saveTtsSettings
};
