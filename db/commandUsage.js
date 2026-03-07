/**
 * Command Usage Database Module
 * Handles command limits, usage tracking, and statistics
 * File: db/commandUsage.js
 */

const { dbRun, dbGet, dbAll, getTodayDateString } = require('./core');

function normalizeCommandKey(command) {
    if (!command) return null;
    return command.toString().trim().toLowerCase().replace(/^\//, '');
}

function normalizeTargetId(targetId) {
    if (!targetId) return null;
    return String(targetId).trim() || null;
}

let commandUsageLastPruneDate = null;

// ========================================================================
// COMMAND LIMITS
// ========================================================================

async function setCommandLimit(command, limit, targetId = null) {
    const normalizedCommand = normalizeCommandKey(command);
    if (!normalizedCommand) return false;
    const normalizedLimit = Number(limit);
    if (!Number.isFinite(normalizedLimit) || normalizedLimit < 0) return false;
    const normalizedTarget = normalizeTargetId(targetId) || 'GLOBAL';
    const now = Date.now();
    await dbRun('INSERT INTO command_limits(command, targetId, limitValue, updatedAt) VALUES(?, ?, ?, ?) ON CONFLICT(command, targetId) DO UPDATE SET limitValue = excluded.limitValue, updatedAt = excluded.updatedAt',
        [normalizedCommand, normalizedTarget, normalizedLimit, now]);
    return true;
}

async function clearCommandLimit(command, targetId = null) {
    const normalizedCommand = normalizeCommandKey(command);
    if (!normalizedCommand) return false;
    const normalizedTarget = normalizeTargetId(targetId) || 'GLOBAL';
    await dbRun('DELETE FROM command_limits WHERE command = ? AND targetId = ?', [normalizedCommand, normalizedTarget]);
    return true;
}

async function clearAllCommandLimits(command) {
    const normalizedCommand = normalizeCommandKey(command);
    if (!normalizedCommand) return 0;
    const result = await dbRun('DELETE FROM command_limits WHERE command = ?', [normalizedCommand]);
    return result?.changes || 0;
}

async function getCommandLimit(command, targetId = null) {
    const normalizedCommand = normalizeCommandKey(command);
    if (!normalizedCommand) return null;
    const normalizedTarget = normalizeTargetId(targetId);
    if (normalizedTarget) {
        const specific = await dbGet('SELECT limitValue FROM command_limits WHERE command = ? AND targetId = ?', [normalizedCommand, normalizedTarget]);
        if (specific && Number.isFinite(Number(specific.limitValue))) return Number(specific.limitValue);
    }
    const global = await dbGet('SELECT limitValue FROM command_limits WHERE command = ? AND targetId = ?', [normalizedCommand, 'GLOBAL']);
    return global && Number.isFinite(Number(global.limitValue)) ? Number(global.limitValue) : null;
}

async function getCommandUsageCount(command, userId, usageDate = null) {
    const normalizedCommand = normalizeCommandKey(command);
    const normalizedUser = normalizeTargetId(userId);
    if (!normalizedCommand || !normalizedUser) return 0;
    const date = usageDate || getTodayDateString('UTC');
    const row = await dbGet('SELECT count FROM command_usage_logs WHERE userId = ? AND command = ? AND usageDate = ?', [normalizedUser, normalizedCommand, date]);
    return row && Number.isFinite(Number(row.count)) ? Number(row.count) : 0;
}

// ========================================================================
// COMMAND USAGE TRACKING
// ========================================================================

async function pruneCommandUsage(beforeDate) {
    if (!beforeDate) return 0;
    await dbRun('DELETE FROM command_usage_logs WHERE usageDate < ?', [beforeDate]);
}

async function incrementCommandUsage(command, userId, usageDate = null) {
    const normalizedCommand = normalizeCommandKey(command);
    const normalizedUserId = normalizeTargetId(userId);
    if (!normalizedCommand || !normalizedUserId) return 0;
    const date = usageDate || getTodayDateString('UTC');
    if (commandUsageLastPruneDate !== date) { commandUsageLastPruneDate = date; await pruneCommandUsage(date); }
    const current = await getCommandUsageCount(normalizedCommand, normalizedUserId, date);
    const nextCount = current + 1;
    await dbRun('INSERT INTO command_usage_logs(userId, command, usageDate, count) VALUES(?, ?, ?, ?) ON CONFLICT(userId, command, usageDate) DO UPDATE SET count = excluded.count',
        [normalizedUserId, normalizedCommand, date, nextCount]);
    return nextCount;
}

// ========================================================================
// GROUP COMMAND USAGE
// ========================================================================

async function getGroupCommandUsageCount(command, chatId, usageDate = null) {
    if (!command || !chatId) return 0;
    const normalizedCommand = normalizeCommandKey(command);
    const normalizedChatId = chatId.toString();
    const date = usageDate || getTodayDateString('UTC');
    const row = await dbGet('SELECT count FROM group_command_usage_logs WHERE chatId = ? AND command = ? AND usageDate = ?', [normalizedChatId, normalizedCommand, date]);
    return row && Number.isFinite(Number(row.count)) ? Number(row.count) : 0;
}

async function incrementGroupCommandUsage(command, chatId, usageDate = null) {
    if (!command || !chatId) return 0;
    const normalizedCommand = normalizeCommandKey(command);
    const normalizedChatId = chatId.toString();
    const date = usageDate || getTodayDateString('UTC');
    const current = await getGroupCommandUsageCount(normalizedCommand, normalizedChatId, date);
    const nextCount = current + 1;
    await dbRun('INSERT INTO group_command_usage_logs(chatId, command, usageDate, count) VALUES(?, ?, ?, ?) ON CONFLICT(chatId, command, usageDate) DO UPDATE SET count = excluded.count',
        [normalizedChatId, normalizedCommand, date, nextCount]);
    return nextCount;
}

async function getGroupCommandUsageSummary(chatId, limit = 20, usageDate = null) {
    if (!chatId) return [];
    const numericLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 20;
    const date = usageDate || getTodayDateString('UTC');
    return await dbAll('SELECT command, SUM(count) AS total FROM group_command_usage_logs WHERE chatId = ? AND usageDate = ? GROUP BY command HAVING total > 0 ORDER BY total DESC LIMIT ?',
        [chatId.toString(), date, numericLimit]) || [];
}

async function getGroupCommandUsageTotal(chatId, usageDate = null) {
    if (!chatId) return 0;
    const date = usageDate || getTodayDateString('UTC');
    const row = await dbGet('SELECT SUM(count) AS total FROM group_command_usage_logs WHERE chatId = ? AND usageDate = ?', [chatId.toString(), date]);
    return row && Number.isFinite(Number(row.total)) ? Number(row.total) : 0;
}

// ========================================================================
// LEADERBOARD & STATS
// ========================================================================

async function getCommandUsageLeaderboard(command, limit = 50, usageDate = null) {
    const normalizedCommand = normalizeCommandKey(command);
    const numericLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 50;
    if (!normalizedCommand) return [];
    const date = usageDate || getTodayDateString('UTC');
    return await dbAll(`SELECT logs.userId, SUM(logs.count) AS total, users.username, users.fullName, users.firstSeen, users.lastSeen
        FROM command_usage_logs AS logs LEFT JOIN users ON users.chatId = logs.userId
        WHERE logs.command = ? AND logs.usageDate = ? AND logs.userId NOT LIKE 'device:%'
        GROUP BY logs.userId, users.username, users.fullName, users.firstSeen, users.lastSeen HAVING total > 0 ORDER BY total DESC LIMIT ?`,
        [normalizedCommand, date, numericLimit]) || [];
}

async function getAllCommandUsageStats(limit = 100, usageDate = null) {
    const numericLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 100;
    const date = usageDate || getTodayDateString('UTC');
    const rows = await dbAll(`SELECT logs.userId, logs.command, SUM(logs.count) AS total, users.username, users.fullName, users.firstSeen, users.lastSeen
        FROM command_usage_logs AS logs LEFT JOIN users ON users.chatId = logs.userId
        WHERE logs.usageDate = ? AND logs.userId NOT LIKE 'device:%'
        GROUP BY logs.userId, logs.command, users.username, users.fullName, users.firstSeen, users.lastSeen HAVING total > 0 ORDER BY total DESC`, [date]);
    const userMap = new Map();
    for (const row of rows || []) {
        const userId = row.userId?.toString();
        if (!userId) continue;
        const existing = userMap.get(userId) || { userId, username: row.username || null, fullName: row.fullName || null, firstSeen: row.firstSeen || null, lastSeen: row.lastSeen || null, total: 0, commands: {} };
        const count = Number(row.total) || 0;
        existing.total += count;
        if (row.command) existing.commands[row.command] = (existing.commands[row.command] || 0) + count;
        userMap.set(userId, existing);
    }
    return Array.from(userMap.values()).sort((a, b) => b.total - a.total).slice(0, numericLimit);
}

module.exports = {
    normalizeCommandKey,
    normalizeTargetId,

    // Limits
    setCommandLimit,
    clearCommandLimit,
    clearAllCommandLimits,
    getCommandLimit,
    getCommandUsageCount,

    // Usage tracking
    pruneCommandUsage,
    incrementCommandUsage,

    // Group usage
    getGroupCommandUsageCount,
    incrementGroupCommandUsage,
    getGroupCommandUsageSummary,
    getGroupCommandUsageTotal,

    // Stats
    getCommandUsageLeaderboard,
    getAllCommandUsageStats
};
