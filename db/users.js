/**
 * Users Database Module
 * Handles user profiles, language settings, co-owners, banned users, devices
 * File: db/users.js
 */

const { dbRun, dbGet, dbAll, safeJsonParse } = require('./core');
const { normalizeLanguageCode } = require('../i18n.js');

// ========================================================================
// USER LANGUAGE FUNCTIONS
// ========================================================================

async function getUserLanguageInfo(chatId) {
    const user = await dbGet('SELECT lang, lang_source FROM users WHERE chatId = ?', [chatId]);
    if (!user) return null;
    const normalizedLang = normalizeLanguageCode(user.lang);
    const source = user.lang_source || 'auto';
    if (normalizedLang !== user.lang || source !== user.lang_source) {
        try { await dbRun('UPDATE users SET lang = ?, lang_source = ? WHERE chatId = ?', [normalizedLang, source, chatId]); }
        catch (err) { console.error(`[DB] Cannot sync lang for ${chatId}:`, err.message); }
    }
    return { lang: normalizedLang, source };
}

async function getUserLanguage(chatId) {
    const info = await getUserLanguageInfo(chatId);
    return info ? info.lang : null;
}

async function setUserLanguage(chatId, lang, source = 'manual') {
    const normalizedLang = normalizeLanguageCode(lang);
    const normalizedSource = source === 'manual' ? 'manual' : 'auto';
    await dbRun('INSERT OR IGNORE INTO users (chatId, lang, lang_source, wallets) VALUES (?, ?, ?, ?)', [chatId, normalizedLang, normalizedSource, '[]']);
    await dbRun('UPDATE users SET lang = ?, lang_source = ? WHERE chatId = ?', [normalizedLang, normalizedSource, chatId]);
    console.log(`[DB] Saved language ${normalizedLang} (${normalizedSource}) for ${chatId}`);
}

async function setLanguage(chatId, lang) { await setUserLanguage(chatId, lang, 'manual'); }
async function setLanguageAuto(chatId, lang) { await setUserLanguage(chatId, lang, 'auto'); }

// ========================================================================
// USER PROFILE FUNCTIONS
// ========================================================================

async function listUserChatIds() {
    const rows = await dbAll('SELECT chatId FROM users');
    return rows ? rows.map(r => r.chatId) : [];
}

async function upsertUserProfile(chatId, profile = {}) {
    const now = Math.floor(Date.now() / 1000);
    const { username, firstName, lastName, languageCode } = profile;
    const existing = await dbGet('SELECT chatId FROM users WHERE chatId = ?', [chatId]);
    if (existing) {
        const updates = [], params = [];
        if (username !== undefined) { updates.push('username = ?'); params.push(username || null); }
        if (firstName !== undefined) { updates.push('firstName = ?'); params.push(firstName || null); }
        if (lastName !== undefined) { updates.push('lastName = ?'); params.push(lastName || null); }
        if (languageCode !== undefined) {
            const normalized = normalizeLanguageCode(languageCode);
            const info = await getUserLanguageInfo(chatId);
            if ((!info || info.source !== 'manual') && normalized) {
                updates.push('lang = ?'); params.push(normalized);
                updates.push('lang_source = ?'); params.push('auto');
            }
        }
        if (updates.length > 0) {
            updates.push('lastSeen = ?'); params.push(now);
            params.push(chatId);
            await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE chatId = ?`, params);
        }
    } else {
        const normalizedLang = languageCode ? normalizeLanguageCode(languageCode) : null;
        await dbRun('INSERT OR IGNORE INTO users (chatId, username, firstName, lastName, lang, lang_source, wallets, firstSeen, lastSeen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [chatId, username || null, firstName || null, lastName || null, normalizedLang, 'auto', '[]', now, now]);
    }
    return dbGet('SELECT * FROM users WHERE chatId = ?', [chatId]);
}

async function listUsersDetailed() {
    return await dbAll('SELECT * FROM users') || [];
}

async function findUserByIdOrUsername(identifier) {
    if (!identifier) return null;
    const str = String(identifier).trim();
    if (/^\d+$/.test(str)) {
        const byId = await dbGet('SELECT * FROM users WHERE chatId = ?', [str]);
        if (byId) return byId;
    }
    const username = str.startsWith('@') ? str.slice(1) : str;
    return await dbGet('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
}

// ========================================================================
// CO-OWNER FUNCTIONS
// ========================================================================

async function addCoOwner(userId, data = {}) {
    const { username, firstName, addedBy } = data;
    const now = Math.floor(Date.now() / 1000);
    await dbRun('INSERT OR REPLACE INTO co_owners (userId, username, firstName, addedBy, addedAt) VALUES (?, ?, ?, ?, ?)',
        [userId, username || null, firstName || null, addedBy || null, now]);
    console.log(`[DB] Added co-owner ${userId}`);
}

async function removeCoOwner(userId) {
    await dbRun('DELETE FROM co_owners WHERE userId = ?', [userId]);
    console.log(`[DB] Removed co-owner ${userId}`);
}

async function listCoOwners() {
    return await dbAll('SELECT * FROM co_owners ORDER BY addedAt DESC') || [];
}

async function isCoOwner(userId) {
    if (!userId) return false;
    const row = await dbGet('SELECT 1 FROM co_owners WHERE userId = ?', [userId]);
    return Boolean(row);
}

// ========================================================================
// BANNED USER FUNCTIONS
// ========================================================================

async function addBannedUser(userId, data = {}) {
    const { username, firstName, reason, bannedBy } = data;
    const now = Math.floor(Date.now() / 1000);
    await dbRun('INSERT OR REPLACE INTO banned_users (userId, username, firstName, reason, bannedBy, bannedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, username || null, firstName || null, reason || null, bannedBy || null, now]);
    console.log(`[DB] Banned user ${userId}`);
}

async function removeBannedUser(userId) {
    await dbRun('DELETE FROM banned_users WHERE userId = ?', [userId]);
    console.log(`[DB] Unbanned user ${userId}`);
}

async function listBannedUsers() {
    return await dbAll('SELECT * FROM banned_users ORDER BY bannedAt DESC') || [];
}

async function isUserBanned(userId) {
    if (!userId) return false;
    const row = await dbGet('SELECT 1 FROM banned_users WHERE userId = ?', [userId]);
    return Boolean(row);
}

// ========================================================================
// DEVICE FUNCTIONS
// ========================================================================

function normalizeDeviceId(deviceId) {
    if (!deviceId) return null;
    const str = String(deviceId).trim();
    return str.length > 0 && str.length <= 256 ? str : null;
}

function normalizeBooleanFlag(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false') return 0;
    return null;
}

async function upsertUserDevice(userId, device = {}) {
    const { deviceId, deviceModel, osVersion, appVersion, ipAddress, lastSeen } = device;
    const normalizedId = normalizeDeviceId(deviceId);
    if (!userId || !normalizedId) return null;
    const now = Math.floor(Date.now() / 1000);
    // Use INSERT...ON CONFLICT to handle UNIQUE constraint on deviceId
    const result = await dbRun(`INSERT INTO user_devices (userId, deviceId, deviceModel, osVersion, appVersion, ipAddress, firstSeen, lastSeen) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deviceId) DO UPDATE SET 
            userId = excluded.userId,
            deviceModel = COALESCE(excluded.deviceModel, user_devices.deviceModel),
            osVersion = COALESCE(excluded.osVersion, user_devices.osVersion),
            appVersion = COALESCE(excluded.appVersion, user_devices.appVersion),
            ipAddress = COALESCE(excluded.ipAddress, user_devices.ipAddress),
            lastSeen = excluded.lastSeen`,
        [userId, normalizedId, deviceModel || null, osVersion || null, appVersion || null, ipAddress || null, now, lastSeen || now]);
    return result?.lastID || null;
}

async function listUserDevices(userId) {
    if (!userId) return [];
    const rows = await dbAll('SELECT * FROM user_devices WHERE userId = ? ORDER BY lastSeen DESC', [userId]);
    return rows || [];
}

async function listDevicesByIds(deviceIds = []) {
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return [];
    const placeholders = deviceIds.map(() => '?').join(',');
    return await dbAll(`SELECT * FROM user_devices WHERE deviceId IN (${placeholders})`, deviceIds) || [];
}

// ========================================================================
// BANNED DEVICE FUNCTIONS
// ========================================================================

async function addBannedDevice(deviceId, data = {}) {
    const normalizedId = normalizeDeviceId(deviceId);
    if (!normalizedId) return false;
    const { userId, reason, bannedBy } = data;
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT id FROM banned_devices WHERE deviceId = ?', [normalizedId]);
    if (existing) {
        await dbRun('UPDATE banned_devices SET reason = COALESCE(?, reason), bannedBy = COALESCE(?, bannedBy), bannedAt = ? WHERE id = ?',
            [reason || null, bannedBy || null, now, existing.id]);
        return true;
    }
    await dbRun('INSERT INTO banned_devices (deviceId, userId, reason, bannedBy, bannedAt) VALUES (?, ?, ?, ?, ?)',
        [normalizedId, userId || null, reason || null, bannedBy || null, now]);
    console.log(`[DB] Banned device ${normalizedId}`);
    return true;
}

async function removeBannedDevice(deviceId) {
    const normalizedId = normalizeDeviceId(deviceId);
    if (!normalizedId) return false;
    await dbRun('DELETE FROM banned_devices WHERE deviceId = ?', [normalizedId]);
    console.log(`[DB] Unbanned device ${normalizedId}`);
    return true;
}

async function listBannedDevices() {
    return await dbAll('SELECT * FROM banned_devices ORDER BY bannedAt DESC') || [];
}

async function isDeviceBanned(deviceId) {
    const normalizedId = normalizeDeviceId(deviceId);
    if (!normalizedId) return false;
    const row = await dbGet('SELECT 1 FROM banned_devices WHERE deviceId = ?', [normalizedId]);
    return Boolean(row);
}

// ========================================================================
// USER DATA RESET
// ========================================================================

async function resetUserData(targetId = null) {
    const tables = ['users', 'co_owners', 'banned_users', 'user_devices', 'banned_devices', 'user_ai_keys', 'user_ai_model_preferences', 'api_key_blocks'];
    if (targetId) {
        for (const table of tables) {
            try {
                const col = table === 'co_owners' || table === 'banned_users' ? 'userId' : 'chatId';
                await dbRun(`DELETE FROM ${table} WHERE ${col} = ?`, [targetId]);
            } catch (e) { /* ignore */ }
        }
        console.log(`[DB] Reset user data for ${targetId}`);
    } else {
        for (const table of tables) {
            try { await dbRun(`DELETE FROM ${table}`); } catch (e) { /* ignore */ }
        }
        console.log('[DB] Reset all user data');
    }
}

module.exports = {
    // Language
    getUserLanguageInfo,
    getUserLanguage,
    setUserLanguage,
    setLanguage,
    setLanguageAuto,

    // Profile
    listUserChatIds,
    upsertUserProfile,
    listUsersDetailed,
    findUserByIdOrUsername,

    // Co-owners
    addCoOwner,
    removeCoOwner,
    listCoOwners,
    isCoOwner,

    // Banned users
    addBannedUser,
    removeBannedUser,
    listBannedUsers,
    isUserBanned,

    // Devices
    normalizeDeviceId,
    normalizeBooleanFlag,
    upsertUserDevice,
    listUserDevices,
    listDevicesByIds,

    // Banned devices
    addBannedDevice,
    removeBannedDevice,
    listBannedDevices,
    isDeviceBanned,

    // Reset
    resetUserData
};
