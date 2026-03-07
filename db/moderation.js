/**
 * Moderation Database Module
 * Handles filters, warnings, data cleanup
 * File: db/moderation.js
 */

const { dbRun, dbGet, dbAll, safeJsonParse, FILTERS_TABLE } = require('./core');

// ========================================================================
// FILTERS
// ========================================================================

async function listFilters(chatId) {
    if (!chatId) return [];
    const rows = await dbAll(`SELECT keyword, responseText, entities, updatedAt FROM ${FILTERS_TABLE} WHERE chatId = ? ORDER BY keyword ASC`, [chatId.toString()]);
    return rows.map(row => ({ keyword: row.keyword, responseText: row.responseText, entities: safeJsonParse(row.entities, []) || [], updatedAt: row.updatedAt }));
}

async function upsertFilter(chatId, keyword, responseText, entities = []) {
    if (!chatId || !keyword) return false;
    const now = Date.now();
    await dbRun(`INSERT INTO ${FILTERS_TABLE} (chatId, keyword, responseText, entities, updatedAt) VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(chatId, keyword) DO UPDATE SET responseText = excluded.responseText, entities = excluded.entities, updatedAt = excluded.updatedAt`,
        [chatId.toString(), keyword.toString().toLowerCase(), responseText || '', JSON.stringify(entities || []), now]);
    return true;
}

async function deleteFilter(chatId, keyword) {
    if (!chatId || !keyword) return false;
    const result = await dbRun(`DELETE FROM ${FILTERS_TABLE} WHERE chatId = ? AND keyword = ?`, [chatId.toString(), keyword.toString().toLowerCase()]);
    return Boolean(result?.changes);
}

// ========================================================================
// WARNINGS
// ========================================================================

async function addWarning({ chatId, targetUserId, targetUsername = null, reason = '', createdBy }) {
    if (!chatId || !targetUserId || !createdBy) throw new Error('INVALID_WARNING_INPUT');
    const now = Date.now();
    await dbRun('INSERT INTO user_warnings(chatId, targetUserId, targetUsername, reason, createdBy, createdAt) VALUES(?, ?, ?, ?, ?, ?)',
        [chatId, targetUserId.toString(), targetUsername, reason, createdBy.toString(), now]);
}

async function getWarnings(chatId, targetUserId) {
    if (!chatId || !targetUserId) return [];
    return await dbAll('SELECT id, reason, createdBy, createdAt FROM user_warnings WHERE chatId = ? AND targetUserId = ? ORDER BY createdAt ASC',
        [chatId, targetUserId.toString()]) || [];
}

async function clearWarnings(chatId, targetUserId) {
    if (!chatId || !targetUserId) return false;
    await dbRun('DELETE FROM user_warnings WHERE chatId = ? AND targetUserId = ?', [chatId, targetUserId.toString()]);
    return true;
}

// ========================================================================
// DATA CLEANUP
// ========================================================================

async function wipeChatFootprint(chatId) {
    if (!chatId) return 0;
    const normalized = chatId.toString();
    const tables = [
        { table: 'users', column: 'chatId' },
        { table: 'group_subscriptions', column: 'chatId' },
        { table: 'group_member_languages', column: 'groupChatId' },
        { table: 'group_member_languages', column: 'userId' },
        { table: 'group_bot_settings', column: 'chatId' },
        { table: FILTERS_TABLE, column: 'chatId' },
        { table: 'user_wallet_tokens', column: 'chatId' },
        { table: 'wallet_holdings_cache', column: 'chatId' },
        { table: 'user_warnings', column: 'chatId' },
        { table: 'pending_memes', column: 'chatId' },
        { table: 'checkin_groups', column: 'chatId' },
        { table: 'checkin_members', column: 'chatId' },
        { table: 'checkin_members', column: 'userId' },
        { table: 'checkin_records', column: 'chatId' },
        { table: 'checkin_records', column: 'userId' },
        { table: 'checkin_attempts', column: 'chatId' },
        { table: 'checkin_attempts', column: 'userId' },
        { table: 'checkin_auto_logs', column: 'chatId' },
        { table: 'checkin_summary_logs', column: 'chatId' },
        { table: 'co_owners', column: 'userId' },
        { table: 'banned_users', column: 'userId' },
        { table: 'user_devices', column: 'userId' },
        { table: 'banned_devices', column: 'userId' },
        { table: 'command_limits', column: 'targetId' },
        { table: 'command_usage_logs', column: 'userId' },
        { table: 'group_command_usage_logs', column: 'chatId' },
        { table: 'group_profiles', column: 'chatId' }
    ];
    let totalChanges = 0;
    for (const entry of tables) {
        const result = await dbRun(`DELETE FROM ${entry.table} WHERE ${entry.column} = ?`, [normalized]);
        totalChanges += result?.changes || 0;
    }
    return totalChanges;
}

// ========================================================================
// MEMBER XP
// ========================================================================

async function setMemberXp(chatId, userId, amount) {
    if (!chatId || !userId) throw new Error('INVALID_XP_INPUT');
    const normalized = Number(amount);
    if (!Number.isFinite(normalized)) throw new Error('INVALID_XP_VALUE');
    const now = Date.now();
    await dbRun('INSERT OR IGNORE INTO checkin_members(chatId, userId, streak, longestStreak, totalCheckins, totalPoints, createdAt, updatedAt) VALUES(?, ?, 0, 0, 0, 0, ?, ?)',
        [chatId, userId.toString(), now, now]);
    await dbRun('UPDATE checkin_members SET totalPoints = ?, updatedAt = ? WHERE chatId = ? AND userId = ?', [normalized, now, chatId, userId.toString()]);
    return normalized;
}

// ========================================================================
// PENDING MEMES
// ========================================================================

async function getPendingMemes(chatId, status = 'pending') {
    if (!chatId) return [];
    return await dbAll('SELECT id, chatId, authorId, content, status, createdAt FROM pending_memes WHERE chatId = ? AND status = ? ORDER BY createdAt ASC',
        [chatId.toString(), status]) || [];
}

async function updateMemeStatus(id, status) {
    if (!id) return false;
    await dbRun('UPDATE pending_memes SET status = ?, updatedAt = ? WHERE id = ?', [status, Date.now(), id]);
    return true;
}

module.exports = {
    // Filters
    listFilters,
    upsertFilter,
    deleteFilter,

    // Warnings
    addWarning,
    getWarnings,
    clearWarnings,

    // Cleanup
    wipeChatFootprint,

    // XP
    setMemberXp,

    // Memes
    getPendingMemes,
    updateMemeStatus
};
