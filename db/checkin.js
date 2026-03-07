/**
 * Checkin Database Module
 * Handles all check-in related operations: groups, attempts, records, members, leaderboards
 * File: db/checkin.js
 */

const crypto = require('crypto');
const {
    dbRun, dbGet, dbAll,
    CHECKIN_DEFAULTS,
    normalizeAutoMessageTimes,
    normalizeSummaryMessageTimes,
    normalizeDateString,
    getTodayDateString,
    getPreviousDate,
    sanitizeTimeSlot,
    resolveLeaderboardPeriodStart,
    resolveSummaryPeriodStart
} = require('./core');

// ========================================================================
// CHECKIN GROUP FUNCTIONS
// ========================================================================

async function ensureCheckinGroup(chatId) {
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT chatId FROM checkin_groups WHERE chatId = ?', [chatId]);
    if (existing) return existing.chatId;

    const defaultStart = getTodayDateString(CHECKIN_DEFAULTS.timezone);
    await dbRun(
        `INSERT INTO checkin_groups (chatId, checkinTime, timezone, autoMessageEnabled, dailyPoints, summaryWindow, mathWeight, physicsWeight, chemistryWeight, okxWeight, cryptoWeight, autoMessageTimes, summaryMessageEnabled, summaryMessageTimes, leaderboardPeriodStart, summaryPeriodStart, promptTemplate, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [chatId, CHECKIN_DEFAULTS.checkinTime, CHECKIN_DEFAULTS.timezone, CHECKIN_DEFAULTS.autoMessageEnabled,
            CHECKIN_DEFAULTS.dailyPoints, CHECKIN_DEFAULTS.summaryWindow, CHECKIN_DEFAULTS.mathWeight,
            CHECKIN_DEFAULTS.physicsWeight, CHECKIN_DEFAULTS.chemistryWeight, CHECKIN_DEFAULTS.okxWeight,
            CHECKIN_DEFAULTS.cryptoWeight, JSON.stringify(CHECKIN_DEFAULTS.autoMessageTimes),
            CHECKIN_DEFAULTS.summaryMessageEnabled, JSON.stringify(CHECKIN_DEFAULTS.summaryMessageTimes),
            defaultStart, CHECKIN_DEFAULTS.summaryPeriodStart, CHECKIN_DEFAULTS.promptTemplate, now, now]
    );
    return chatId;
}

async function getCheckinGroup(chatId) {
    const row = await dbGet('SELECT * FROM checkin_groups WHERE chatId = ?', [chatId]);
    if (!row) {
        return {
            chatId, ...CHECKIN_DEFAULTS,
            lastAutoMessageDate: null,
            leaderboardPeriodStart: getTodayDateString(CHECKIN_DEFAULTS.timezone)
        };
    }
    return {
        chatId: row.chatId,
        checkinTime: row.checkinTime || CHECKIN_DEFAULTS.checkinTime,
        timezone: row.timezone || CHECKIN_DEFAULTS.timezone,
        autoMessageEnabled: row.autoMessageEnabled ?? CHECKIN_DEFAULTS.autoMessageEnabled,
        dailyPoints: row.dailyPoints ?? CHECKIN_DEFAULTS.dailyPoints,
        summaryWindow: row.summaryWindow ?? CHECKIN_DEFAULTS.summaryWindow,
        mathWeight: row.mathWeight ?? CHECKIN_DEFAULTS.mathWeight,
        physicsWeight: row.physicsWeight ?? CHECKIN_DEFAULTS.physicsWeight,
        chemistryWeight: row.chemistryWeight ?? CHECKIN_DEFAULTS.chemistryWeight,
        okxWeight: row.okxWeight ?? CHECKIN_DEFAULTS.okxWeight,
        cryptoWeight: row.cryptoWeight ?? CHECKIN_DEFAULTS.cryptoWeight,
        lastAutoMessageDate: row.lastAutoMessageDate || null,
        autoMessageTimes: normalizeAutoMessageTimes(row.autoMessageTimes, row.checkinTime || CHECKIN_DEFAULTS.checkinTime),
        summaryMessageEnabled: row.summaryMessageEnabled ?? CHECKIN_DEFAULTS.summaryMessageEnabled,
        summaryMessageTimes: normalizeSummaryMessageTimes(row.summaryMessageTimes),
        leaderboardPeriodStart: resolveLeaderboardPeriodStart(row.leaderboardPeriodStart, row.timezone || CHECKIN_DEFAULTS.timezone),
        summaryPeriodStart: resolveSummaryPeriodStart(row.summaryPeriodStart),
        promptTemplate: typeof row.promptTemplate === 'string' ? row.promptTemplate : CHECKIN_DEFAULTS.promptTemplate
    };
}

async function listCheckinGroups() {
    const rows = await dbAll('SELECT * FROM checkin_groups');
    if (!rows || rows.length === 0) return [];
    return rows.map(row => ({
        chatId: row.chatId,
        checkinTime: row.checkinTime || CHECKIN_DEFAULTS.checkinTime,
        timezone: row.timezone || CHECKIN_DEFAULTS.timezone,
        autoMessageEnabled: row.autoMessageEnabled ?? CHECKIN_DEFAULTS.autoMessageEnabled,
        dailyPoints: row.dailyPoints ?? CHECKIN_DEFAULTS.dailyPoints,
        summaryWindow: row.summaryWindow ?? CHECKIN_DEFAULTS.summaryWindow,
        mathWeight: row.mathWeight ?? CHECKIN_DEFAULTS.mathWeight,
        physicsWeight: row.physicsWeight ?? CHECKIN_DEFAULTS.physicsWeight,
        chemistryWeight: row.chemistryWeight ?? CHECKIN_DEFAULTS.chemistryWeight,
        okxWeight: row.okxWeight ?? CHECKIN_DEFAULTS.okxWeight,
        cryptoWeight: row.cryptoWeight ?? CHECKIN_DEFAULTS.cryptoWeight,
        lastAutoMessageDate: row.lastAutoMessageDate || null,
        autoMessageTimes: normalizeAutoMessageTimes(row.autoMessageTimes, row.checkinTime || CHECKIN_DEFAULTS.checkinTime),
        summaryMessageEnabled: row.summaryMessageEnabled ?? CHECKIN_DEFAULTS.summaryMessageEnabled,
        summaryMessageTimes: normalizeSummaryMessageTimes(row.summaryMessageTimes),
        leaderboardPeriodStart: resolveLeaderboardPeriodStart(row.leaderboardPeriodStart, row.timezone || CHECKIN_DEFAULTS.timezone),
        summaryPeriodStart: resolveSummaryPeriodStart(row.summaryPeriodStart),
        promptTemplate: typeof row.promptTemplate === 'string' ? row.promptTemplate : CHECKIN_DEFAULTS.promptTemplate
    }));
}

async function updateCheckinGroup(chatId, patch = {}) {
    await ensureCheckinGroup(chatId);
    const fields = [], values = [];
    const allowed = ['checkinTime', 'timezone', 'autoMessageEnabled', 'dailyPoints', 'summaryWindow', 'lastAutoMessageDate', 'mathWeight', 'physicsWeight', 'chemistryWeight', 'okxWeight', 'cryptoWeight', 'autoMessageTimes', 'leaderboardPeriodStart', 'summaryMessageEnabled', 'summaryMessageTimes', 'summaryPeriodStart', 'promptTemplate'];
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            let value = patch[key];
            if ((key === 'autoMessageTimes' || key === 'summaryMessageTimes') && Array.isArray(value)) {
                value = JSON.stringify(value);
            }
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }
    if (fields.length === 0) return getCheckinGroup(chatId);
    fields.push('updatedAt = ?');
    values.push(Math.floor(Date.now() / 1000), chatId);
    await dbRun(`UPDATE checkin_groups SET ${fields.join(', ')} WHERE chatId = ?`, values);
    return getCheckinGroup(chatId);
}

async function updateAutoMessageDate(chatId, dateStr) {
    const normalized = normalizeDateString(dateStr);
    return updateCheckinGroup(chatId, { lastAutoMessageDate: normalized || null });
}

async function setLeaderboardPeriodStart(chatId, dateStr, timezone = CHECKIN_DEFAULTS.timezone) {
    const resolved = normalizeDateString(dateStr) || getTodayDateString(timezone || CHECKIN_DEFAULTS.timezone);
    return updateCheckinGroup(chatId, { leaderboardPeriodStart: resolved });
}

async function setSummaryPeriodStart(chatId, dateStr, timezone = CHECKIN_DEFAULTS.timezone) {
    if (!dateStr && dateStr !== '0') return updateCheckinGroup(chatId, { summaryPeriodStart: null });
    const resolved = normalizeDateString(dateStr) || getTodayDateString(timezone || CHECKIN_DEFAULTS.timezone);
    return updateCheckinGroup(chatId, { summaryPeriodStart: resolved });
}

// ========================================================================
// CHECKIN ATTEMPTS FUNCTIONS
// ========================================================================

async function getCheckinAttempt(chatId, userId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return null;
    const row = await dbGet('SELECT attempts, locked FROM checkin_attempts WHERE chatId = ? AND userId = ? AND checkinDate = ?', [chatId, userId, normalized]);
    return row ? { attempts: Number(row.attempts || 0), locked: Number(row.locked || 0) } : { attempts: 0, locked: 0 };
}

async function setCheckinAttempt(chatId, userId, checkinDate, attempts, locked) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) throw new Error('Invalid checkin date');
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT chatId FROM checkin_attempts WHERE chatId = ? AND userId = ? AND checkinDate = ?', [chatId, userId, normalized]);
    if (existing) {
        await dbRun('UPDATE checkin_attempts SET attempts = ?, locked = ?, updatedAt = ? WHERE chatId = ? AND userId = ? AND checkinDate = ?', [attempts, locked ? 1 : 0, now, chatId, userId, normalized]);
    } else {
        await dbRun('INSERT INTO checkin_attempts (chatId, userId, checkinDate, attempts, locked, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [chatId, userId, normalized, attempts, locked ? 1 : 0, now]);
    }
}

async function incrementCheckinAttempt(chatId, userId, checkinDate, maxAttempts = 3) {
    const status = await getCheckinAttempt(chatId, userId, checkinDate);
    const nextAttempts = status ? status.attempts + 1 : 1;
    const shouldLock = nextAttempts >= maxAttempts;
    await setCheckinAttempt(chatId, userId, checkinDate, nextAttempts, shouldLock);
    return { attempts: nextAttempts, locked: shouldLock };
}

async function clearDailyAttempts(chatId, userId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return;
    await dbRun('DELETE FROM checkin_attempts WHERE chatId = ? AND userId = ? AND checkinDate = ?', [chatId, userId, normalized]);
}

// ========================================================================
// CHECKIN RECORDS FUNCTIONS
// ========================================================================

async function getCheckinRecord(chatId, userId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return null;
    const row = await dbGet('SELECT * FROM checkin_records WHERE chatId = ? AND userId = ? AND checkinDate = ?', [chatId, userId, normalized]);
    return row ? { ...row } : null;
}

async function getCheckinsForDate(chatId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return [];
    return await dbAll('SELECT * FROM checkin_records WHERE chatId = ? AND checkinDate = ? ORDER BY updatedAt ASC', [chatId, normalized]);
}

async function getCheckinsInRange(chatId, startDate, endDate) {
    const normalizedStart = normalizeDateString(startDate);
    const normalizedEnd = normalizeDateString(endDate);
    if (!normalizedStart || !normalizedEnd) return [];
    return await dbAll('SELECT * FROM checkin_records WHERE chatId = ? AND checkinDate BETWEEN ? AND ? ORDER BY checkinDate ASC, updatedAt ASC', [chatId, normalizedStart, normalizedEnd]) || [];
}

async function removeCheckinRecord(chatId, userId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return false;
    const record = await getCheckinRecord(chatId, userId, normalized);
    if (!record) return false;
    await dbRun('DELETE FROM checkin_records WHERE id = ?', [record.id]);
    await recalculateMemberStats(chatId, userId);
    await clearDailyAttempts(chatId, userId, normalized);
    return true;
}

// ========================================================================
// CHECKIN MEMBER FUNCTIONS
// ========================================================================

async function ensureMemberRow(chatId, userId) {
    const existing = await dbGet('SELECT userId FROM checkin_members WHERE chatId = ? AND userId = ?', [chatId, userId]);
    if (existing) return existing.userId;
    await dbRun('INSERT INTO checkin_members (chatId, userId, streak, longestStreak, totalCheckins, totalPoints, createdAt, updatedAt) VALUES (?, ?, 0, 0, 0, 0, ?, ?)', [chatId, userId, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)]);
    return userId;
}

function calculateConsecutiveStreak(dates) {
    if (!Array.isArray(dates) || dates.length === 0) return { streak: 0, longest: 0, lastDate: null };
    const sorted = [...dates].sort();
    let longest = 1, current = 1;
    for (let i = 1; i < sorted.length; i++) {
        const prevDate = new Date(`${sorted[i - 1]}T00:00:00Z`);
        const currentDate = new Date(`${sorted[i]}T00:00:00Z`);
        const diffDays = Math.round((currentDate - prevDate) / (24 * 60 * 60 * 1000));
        if (diffDays === 1) current += 1;
        else if (diffDays !== 0) current = 1;
        if (current > longest) longest = current;
    }
    const lastDate = sorted[sorted.length - 1];
    let streak = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
        const prevDate = new Date(`${sorted[i]}T00:00:00Z`);
        const nextDate = new Date(`${sorted[i + 1]}T00:00:00Z`);
        const diffDays = Math.round((nextDate - prevDate) / (24 * 60 * 60 * 1000));
        if (diffDays === 1) streak += 1;
        else if (diffDays !== 0) break;
    }
    return { streak, longest, lastDate };
}

async function recalculateMemberStats(chatId, userId) {
    await ensureMemberRow(chatId, userId);
    const records = await dbAll('SELECT checkinDate, pointsAwarded FROM checkin_records WHERE chatId = ? AND userId = ? ORDER BY checkinDate ASC', [chatId, userId]);
    const dates = records.map(row => row.checkinDate).filter(Boolean);
    const { streak, longest, lastDate } = calculateConsecutiveStreak(dates);
    const totalCheckins = records.length;
    const totalPoints = records.reduce((sum, row) => sum + Number(row.pointsAwarded || 0), 0);
    await dbRun('UPDATE checkin_members SET streak = ?, longestStreak = CASE WHEN ? > longestStreak THEN ? ELSE longestStreak END, totalCheckins = ?, totalPoints = ?, lastCheckinDate = ?, updatedAt = ?, lockedUntilDate = NULL WHERE chatId = ? AND userId = ?',
        [streak, longest, longest, totalCheckins, totalPoints, lastDate, Math.floor(Date.now() / 1000), chatId, userId]);
    return { streak, longest, totalCheckins, totalPoints, lastCheckinDate: lastDate };
}

async function getCheckinMemberSummary(chatId, userId) {
    if (!chatId || !userId) return null;
    const row = await dbGet('SELECT streak, longestStreak, totalCheckins, totalPoints FROM checkin_members WHERE chatId = ? AND userId = ?', [chatId, userId]);
    if (!row) return null;
    return { streak: Number(row.streak || 0), longestStreak: Number(row.longestStreak || 0), totalCheckins: Number(row.totalCheckins || 0), totalPoints: Number(row.totalPoints || 0) };
}

async function unlockMemberCheckin(chatId, userId) {
    await ensureMemberRow(chatId, userId);
    await dbRun('UPDATE checkin_members SET lockedUntilDate = NULL, updatedAt = ? WHERE chatId = ? AND userId = ?', [Math.floor(Date.now() / 1000), chatId, userId]);
    await dbRun('UPDATE checkin_attempts SET locked = 0 WHERE chatId = ? AND userId = ?', [chatId, userId]);
}

async function markMemberLocked(chatId, userId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return;
    await ensureMemberRow(chatId, userId);
    await dbRun('UPDATE checkin_members SET lockedUntilDate = ?, updatedAt = ? WHERE chatId = ? AND userId = ?', [normalized, Math.floor(Date.now() / 1000), chatId, userId]);
}

async function getLockedMembers(chatId, checkinDate) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) return [];
    return await dbAll('SELECT attempts.userId, attempts.attempts FROM checkin_attempts attempts WHERE attempts.chatId = ? AND attempts.checkinDate = ? AND attempts.locked = 1', [chatId, normalized]) || [];
}

// ========================================================================
// COMPLETE CHECKIN FUNCTION
// ========================================================================

async function completeCheckin({ chatId, userId, checkinDate, walletAddress = null, pointsAwarded = 0 }) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) throw new Error('Invalid checkin date');
    await ensureCheckinGroup(chatId);
    await ensureMemberRow(chatId, userId);
    const existingRecord = await getCheckinRecord(chatId, userId, normalized);
    const now = Math.floor(Date.now() / 1000);
    if (existingRecord) {
        await dbRun('UPDATE checkin_records SET walletAddress = ?, pointsAwarded = ?, updatedAt = ? WHERE id = ?', [walletAddress, pointsAwarded, now, existingRecord.id]);
    } else {
        await dbRun('INSERT INTO checkin_records (id, chatId, userId, checkinDate, walletAddress, pointsAwarded, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), chatId, userId, normalized, walletAddress, pointsAwarded, now, now]);
    }
    await clearDailyAttempts(chatId, userId, normalized);
    const memberRow = await dbGet('SELECT streak, lastCheckinDate, longestStreak, totalCheckins, totalPoints FROM checkin_members WHERE chatId = ? AND userId = ?', [chatId, userId]);
    let streak = 1, longestStreak = 1, totalCheckins = 1, totalPoints = Number(pointsAwarded || 0);
    if (memberRow) {
        totalCheckins = Number(memberRow.totalCheckins || 0) + (existingRecord ? 0 : 1);
        totalPoints = Number(memberRow.totalPoints || 0) + Number(pointsAwarded || 0) - Number(existingRecord?.pointsAwarded || 0);
        const lastDate = memberRow.lastCheckinDate;
        if (lastDate) {
            if (lastDate === normalized) streak = Number(memberRow.streak || 1);
            else {
                const prevDate = getPreviousDate(normalized);
                streak = (prevDate && prevDate === lastDate) ? Number(memberRow.streak || 0) + 1 : 1;
            }
        }
        longestStreak = streak > Number(memberRow.longestStreak || 0) ? streak : Number(memberRow.longestStreak || 0);
    }
    await dbRun('UPDATE checkin_members SET streak = ?, longestStreak = CASE WHEN ? > longestStreak THEN ? ELSE longestStreak END, totalCheckins = ?, totalPoints = ?, lastCheckinDate = ?, lockedUntilDate = NULL, updatedAt = ? WHERE chatId = ? AND userId = ?',
        [streak, longestStreak, longestStreak, totalCheckins, totalPoints, normalized, now, chatId, userId]);
    return { streak, longestStreak, totalCheckins, totalPoints };
}

async function updateCheckinFeedback(chatId, userId, checkinDate, { emotion = null, goal = null } = {}) {
    const normalized = normalizeDateString(checkinDate);
    if (!normalized) throw new Error('Invalid checkin date');
    const record = await getCheckinRecord(chatId, userId, normalized);
    if (!record) throw new Error('Check-in record not found');
    const updates = [], params = [];
    if (emotion !== null) { updates.push('emotion = ?'); params.push(emotion); }
    if (goal !== null) { updates.push('goal = ?'); params.push(goal); }
    if (updates.length === 0) return record;
    updates.push('updatedAt = ?');
    params.push(Math.floor(Date.now() / 1000), record.id);
    await dbRun(`UPDATE checkin_records SET ${updates.join(', ')} WHERE id = ?`, params);
    return getCheckinRecord(chatId, userId, normalized);
}

// ========================================================================
// LEADERBOARD FUNCTIONS
// ========================================================================

async function getMemberLeaderboardStats(chatId, userId, sinceDate = null) {
    if (!chatId || !userId) return { entries: [] };
    const normalizedSince = normalizeDateString(sinceDate);
    let sql = 'SELECT checkinDate, pointsAwarded, createdAt, updatedAt FROM checkin_records WHERE chatId = ? AND userId = ?';
    const params = [chatId, userId];
    if (normalizedSince) { sql += ' AND checkinDate >= ?'; params.push(normalizedSince); }
    sql += ' ORDER BY checkinDate ASC, updatedAt ASC';
    const rows = await dbAll(sql, params);
    if (!rows || rows.length === 0) return { entries: [] };
    const dates = rows.map(row => row.checkinDate).filter(Boolean);
    const { streak, longest, lastDate } = calculateConsecutiveStreak(dates);
    const totalPoints = rows.reduce((sum, row) => sum + Number(row.pointsAwarded || 0), 0);
    return { streak, longestStreak: longest, totalCheckins: rows.length, totalPoints, lastCheckinDate: lastDate, entries: rows.map(row => ({ ...row, createdAt: Number(row.createdAt || 0), updatedAt: Number(row.updatedAt || 0) })) };
}

function compareLeaderboardRows(a, b, mode) {
    const metrics = { streak: ['streak', 'totalCheckins', 'totalPoints', 'longestStreak'], total: ['totalCheckins', 'streak', 'totalPoints', 'longestStreak'], points: ['totalPoints', 'streak', 'totalCheckins', 'longestStreak'], longest: ['longestStreak', 'totalCheckins', 'totalPoints', 'streak'] };
    const keys = metrics[mode] || metrics.streak;
    for (const key of keys) { const diff = Number(b[key] || 0) - Number(a[key] || 0); if (diff !== 0) return diff; }
    const lastDiff = Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0);
    if (lastDiff !== 0) return lastDiff;
    return String(a.userId || '').localeCompare(String(b.userId || ''));
}

async function getTopCheckins(chatId, limit = 10, mode = 'streak', sinceDate = null) {
    const allowedModes = new Set(['streak', 'total', 'points', 'longest']);
    const finalMode = allowedModes.has(mode) ? mode : 'streak';
    const normalizedLimit = Math.max(Number(limit) || 0, 1);
    const normalizedSince = normalizeDateString(sinceDate);
    if (!normalizedSince) {
        let orderClause = 'streak DESC, totalCheckins DESC';
        if (finalMode === 'total') orderClause = 'totalCheckins DESC, streak DESC';
        else if (finalMode === 'points') orderClause = 'totalPoints DESC, streak DESC';
        else if (finalMode === 'longest') orderClause = 'longestStreak DESC, totalCheckins DESC';
        return await dbAll(`SELECT * FROM checkin_members WHERE chatId = ? ORDER BY ${orderClause} LIMIT ?`, [chatId, normalizedLimit]) || [];
    }
    const rows = await dbAll('SELECT userId, checkinDate, pointsAwarded, createdAt, updatedAt FROM checkin_records WHERE chatId = ? AND checkinDate >= ? ORDER BY userId ASC, checkinDate ASC, updatedAt ASC', [chatId, normalizedSince]);
    if (!rows || rows.length === 0) return [];
    const perUser = new Map();
    for (const row of rows) {
        if (!row?.userId) continue;
        if (!perUser.has(row.userId)) perUser.set(row.userId, { userId: row.userId, dates: [], totalPoints: 0, totalCheckins: 0, lastTimestamp: 0, lastCheckinDate: null });
        const entry = perUser.get(row.userId);
        if (row.checkinDate) { entry.dates.push(row.checkinDate); entry.lastCheckinDate = row.checkinDate; }
        entry.totalPoints += Number(row.pointsAwarded || 0);
        entry.totalCheckins += 1;
        const updatedAt = Number(row.updatedAt || row.createdAt || 0);
        if (updatedAt > entry.lastTimestamp) entry.lastTimestamp = updatedAt;
    }
    const leaderboard = [];
    for (const entry of perUser.values()) {
        const { streak, longest, lastDate } = calculateConsecutiveStreak(entry.dates);
        leaderboard.push({ userId: entry.userId, streak, longestStreak: longest, totalCheckins: entry.totalCheckins, totalPoints: entry.totalPoints, lastCheckinDate: lastDate || entry.lastCheckinDate, lastTimestamp: entry.lastTimestamp });
    }
    leaderboard.sort((a, b) => compareLeaderboardRows(a, b, finalMode));
    return leaderboard.slice(0, normalizedLimit);
}

async function clearMemberLeaderboardEntries(chatId, userId, sinceDate = null) {
    if (!chatId || !userId) return false;
    const normalizedSince = normalizeDateString(sinceDate);
    let sql = 'DELETE FROM checkin_records WHERE chatId = ? AND userId = ?';
    const params = [chatId, userId];
    if (normalizedSince) { sql += ' AND checkinDate >= ?'; params.push(normalizedSince); }
    await dbRun(sql, params);
    await recalculateMemberStats(chatId, userId);
    return true;
}

// ========================================================================
// AUTO MESSAGE LOG FUNCTIONS
// ========================================================================

async function hasAutoMessageLog(chatId, checkinDate, slot) {
    const normalizedDate = normalizeDateString(checkinDate);
    const normalizedSlot = sanitizeTimeSlot(slot);
    if (!normalizedDate || !normalizedSlot) return false;
    const row = await dbGet('SELECT 1 FROM checkin_auto_logs WHERE chatId = ? AND checkinDate = ? AND slot = ?', [chatId, normalizedDate, normalizedSlot]);
    return Boolean(row);
}

async function recordAutoMessageLog(chatId, checkinDate, slot) {
    const normalizedDate = normalizeDateString(checkinDate);
    const normalizedSlot = sanitizeTimeSlot(slot);
    if (!normalizedDate || !normalizedSlot) return false;
    const result = await dbRun('INSERT OR IGNORE INTO checkin_auto_logs (chatId, checkinDate, slot, sentAt) VALUES (?, ?, ?, ?)', [chatId, normalizedDate, normalizedSlot, Math.floor(Date.now() / 1000)]);
    return Boolean(result?.changes);
}

async function hasSummaryMessageLog(chatId, summaryDate, slot) {
    const normalizedDate = normalizeDateString(summaryDate);
    const normalizedSlot = sanitizeTimeSlot(slot);
    if (!normalizedDate || !normalizedSlot) return false;
    const row = await dbGet('SELECT 1 FROM checkin_summary_logs WHERE chatId = ? AND summaryDate = ? AND slot = ?', [chatId, normalizedDate, normalizedSlot]);
    return Boolean(row);
}

async function recordSummaryMessageLog(chatId, summaryDate, slot) {
    const normalizedDate = normalizeDateString(summaryDate);
    const normalizedSlot = sanitizeTimeSlot(slot);
    if (!normalizedDate || !normalizedSlot) return false;
    const result = await dbRun('INSERT OR IGNORE INTO checkin_summary_logs (chatId, summaryDate, slot, sentAt) VALUES (?, ?, ?, ?)', [chatId, normalizedDate, normalizedSlot, Math.floor(Date.now() / 1000)]);
    return Boolean(result?.changes);
}

async function resetSummaryMessageLogs(chatId) {
    if (!chatId) return;
    await dbRun('DELETE FROM checkin_summary_logs WHERE chatId = ?', [chatId]);
}

module.exports = {
    // Group functions
    ensureCheckinGroup,
    getCheckinGroup,
    listCheckinGroups,
    updateCheckinGroup,
    updateAutoMessageDate,
    setLeaderboardPeriodStart,
    setSummaryPeriodStart,

    // Attempt functions
    getCheckinAttempt,
    setCheckinAttempt,
    incrementCheckinAttempt,
    clearDailyAttempts,

    // Record functions
    getCheckinRecord,
    getCheckinsForDate,
    getCheckinsInRange,
    removeCheckinRecord,

    // Member functions
    ensureMemberRow,
    calculateConsecutiveStreak,
    recalculateMemberStats,
    getCheckinMemberSummary,
    unlockMemberCheckin,
    markMemberLocked,
    getLockedMembers,

    // Complete checkin
    completeCheckin,
    updateCheckinFeedback,

    // Leaderboard functions
    getMemberLeaderboardStats,
    compareLeaderboardRows,
    getTopCheckins,
    clearMemberLeaderboardEntries,

    // Message log functions
    hasAutoMessageLog,
    recordAutoMessageLog,
    hasSummaryMessageLog,
    recordSummaryMessageLog,
    resetSummaryMessageLogs
};
