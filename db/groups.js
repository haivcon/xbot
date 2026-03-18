/**
 * Groups Database Module
 * Handles group settings, rules, subscriptions, profiles, member languages
 * File: db/groups.js
 */

const { dbRun, dbGet, dbAll, safeJsonParse } = require('./core');
const { normalizeLanguageCode } = require('../i18n.js');

// ========================================================================
// GROUP BOT SETTINGS
// ========================================================================

async function getGroupBotSettings(chatId) {
    if (!chatId) return {};
    const row = await dbGet('SELECT settings FROM group_bot_settings WHERE chatId = ?', [chatId]);
    return row ? safeJsonParse(row.settings, {}) || {} : {};
}

async function updateGroupBotSettings(chatId, updates = {}) {
    if (!chatId) return {};
    const current = await getGroupBotSettings(chatId);
    const next = { ...current, ...updates };
    const now = Date.now();
    await dbRun(`INSERT INTO group_bot_settings(chatId, settings, updatedAt) VALUES(?, ?, ?) ON CONFLICT(chatId) DO UPDATE SET settings = excluded.settings, updatedAt = excluded.updatedAt`,
        [chatId, JSON.stringify(next), now]);
    return next;
}

async function setGroupRules(chatId, rulesText, updatedBy) {
    const normalized = (rulesText || '').trim();
    return updateGroupBotSettings(chatId, { rulesText: normalized, rulesUpdatedAt: Date.now(), rulesUpdatedBy: updatedBy || null });
}

async function getGroupRules(chatId) {
    const settings = await getGroupBotSettings(chatId);
    return settings.rulesText || null;
}

// ========================================================================
// BLACKLIST
// ========================================================================

async function updateBlacklist(chatId, transformFn) {
    const settings = await getGroupBotSettings(chatId);
    const existing = Array.isArray(settings.blacklist) ? settings.blacklist : [];
    return updateGroupBotSettings(chatId, { blacklist: transformFn(existing) });
}

async function addBlacklistWord(chatId, word) {
    const normalized = (word || '').trim().toLowerCase();
    if (!normalized) return [];
    return updateBlacklist(chatId, list => {
        const unique = new Set(list.map(item => item.toLowerCase()));
        unique.add(normalized);
        return Array.from(unique);
    });
}

async function removeBlacklistWord(chatId, word) {
    const normalized = (word || '').trim().toLowerCase();
    if (!normalized) return [];
    return updateBlacklist(chatId, list => list.filter(item => item.toLowerCase() !== normalized));
}

// ========================================================================
// GROUP SUBSCRIPTIONS
// ========================================================================

async function upsertGroupSubscription(chatId, lang, minStake, messageThreadId = null) {
    const now = Math.floor(Date.now() / 1000);
    await dbRun(`INSERT INTO group_subscriptions (chatId, lang, minStake, messageThreadId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chatId) DO UPDATE SET lang = excluded.lang, minStake = excluded.minStake, messageThreadId = excluded.messageThreadId, updatedAt = excluded.updatedAt`,
        [chatId, normalizeLanguageCode(lang), minStake, messageThreadId, now, now]);
}

async function removeGroupSubscription(chatId) {
    await dbRun('DELETE FROM group_subscriptions WHERE chatId = ?', [chatId]);
}

async function getGroupSubscription(chatId) {
    const row = await dbGet('SELECT * FROM group_subscriptions WHERE chatId = ?', [chatId]);
    if (!row) return null;
    return { chatId: row.chatId, lang: normalizeLanguageCode(row.lang), minStake: row.minStake, messageThreadId: row.messageThreadId || null };
}

async function getGroupSubscriptions() {
    const rows = await dbAll('SELECT * FROM group_subscriptions');
    return rows.map(row => ({ chatId: row.chatId, lang: normalizeLanguageCode(row.lang), minStake: row.minStake, messageThreadId: row.messageThreadId || null }));
}

async function updateGroupSubscriptionLanguage(chatId, lang) {
    await dbRun('UPDATE group_subscriptions SET lang = ?, updatedAt = ? WHERE chatId = ?', [normalizeLanguageCode(lang), Math.floor(Date.now() / 1000), chatId]);
}

async function updateGroupSubscriptionTopic(chatId, messageThreadId) {
    const topic = messageThreadId === null || messageThreadId === undefined ? null : messageThreadId;
    await dbRun('UPDATE group_subscriptions SET messageThreadId = ?, updatedAt = ? WHERE chatId = ?', [topic, Math.floor(Date.now() / 1000), chatId]);
}

// ========================================================================
// GROUP PROFILES
// ========================================================================

async function upsertGroupProfile(profile = {}) {
    const { chatId, title, type, memberCount } = profile;
    if (!chatId) return null;
    // Normalize chatId to clean integer string (prevents .0 suffix duplicates)
    const normalizedChatId = String(chatId).replace(/\.0$/, '');
    const now = Math.floor(Date.now() / 1000);
    await dbRun(`INSERT INTO group_profiles (chatId, title, type, memberCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chatId) DO UPDATE SET title = COALESCE(excluded.title, group_profiles.title), type = COALESCE(excluded.type, group_profiles.type), memberCount = COALESCE(excluded.memberCount, group_profiles.memberCount), updatedAt = excluded.updatedAt`,
        [normalizedChatId, title || null, type || null, memberCount || null, now, now]);
    return dbGet('SELECT * FROM group_profiles WHERE chatId = ?', [normalizedChatId]);
}

async function listGroupProfiles() {
    return await dbAll('SELECT * FROM group_profiles ORDER BY updatedAt DESC') || [];
}

async function removeGroupProfile(chatId) {
    if (!chatId) return false;
    await dbRun('DELETE FROM group_profiles WHERE chatId = ?', [chatId]);
    return true;
}

// ========================================================================
// GROUP MEMBER LANGUAGES
// ========================================================================

async function getGroupMemberLanguage(groupChatId, userId) {
    const row = await dbGet('SELECT lang FROM group_member_languages WHERE groupChatId = ? AND userId = ?', [groupChatId, userId]);
    return row ? normalizeLanguageCode(row.lang) : null;
}

async function getGroupMemberLanguages(groupChatId) {
    const rows = await dbAll('SELECT userId, lang FROM group_member_languages WHERE groupChatId = ?', [groupChatId]);
    return rows || [];
}

async function setGroupMemberLanguage(groupChatId, userId, lang) {
    const now = Math.floor(Date.now() / 1000);
    await dbRun(`INSERT INTO group_member_languages (groupChatId, userId, lang, updatedAt) VALUES (?, ?, ?, ?)
        ON CONFLICT(groupChatId, userId) DO UPDATE SET lang = excluded.lang, updatedAt = excluded.updatedAt`,
        [groupChatId, userId, normalizeLanguageCode(lang), now]);
}

async function removeGroupMemberLanguage(groupChatId, userId) {
    await dbRun('DELETE FROM group_member_languages WHERE groupChatId = ? AND userId = ?', [groupChatId, userId]);
}

// ========================================================================
// GROUP ADMINS (for dashboard user-level group management)
// ========================================================================

async function addGroupAdmin(chatId, userId) {
    if (!chatId || !userId) return;
    const now = Math.floor(Date.now() / 1000);
    await dbRun(`INSERT INTO group_admins (chatId, userId, addedAt) VALUES (?, ?, ?)
        ON CONFLICT(chatId, userId) DO UPDATE SET addedAt = excluded.addedAt`,
        [String(chatId), String(userId), now]);
}

async function removeGroupAdmin(chatId, userId) {
    if (!chatId || !userId) return;
    await dbRun('DELETE FROM group_admins WHERE chatId = ? AND userId = ?', [String(chatId), String(userId)]);
}

async function getGroupsByAdmin(userId) {
    if (!userId) return [];
    const rows = await dbAll(
        `SELECT ga.chatId, ga.addedAt, gp.title, gp.type, gp.memberCount, gp.updatedAt
         FROM group_admins ga
         LEFT JOIN group_profiles gp ON ga.chatId = gp.chatId
         WHERE ga.userId = ?
         ORDER BY gp.updatedAt DESC`,
        [String(userId)]
    );
    return rows || [];
}

async function isGroupAdminInDb(chatId, userId) {
    if (!chatId || !userId) return false;
    const row = await dbGet('SELECT 1 FROM group_admins WHERE chatId = ? AND userId = ?', [String(chatId), String(userId)]);
    return !!row;
}

module.exports = {
    // Settings
    getGroupBotSettings,
    updateGroupBotSettings,
    setGroupRules,
    getGroupRules,

    // Blacklist
    updateBlacklist,
    addBlacklistWord,
    removeBlacklistWord,

    // Subscriptions
    upsertGroupSubscription,
    removeGroupSubscription,
    getGroupSubscription,
    getGroupSubscriptions,
    updateGroupSubscriptionLanguage,
    updateGroupSubscriptionTopic,

    // Profiles
    upsertGroupProfile,
    listGroupProfiles,
    removeGroupProfile,

    // Member languages
    getGroupMemberLanguage,
    getGroupMemberLanguages,
    setGroupMemberLanguage,
    removeGroupMemberLanguage,

    // Group admins
    addGroupAdmin,
    removeGroupAdmin,
    getGroupsByAdmin,
    isGroupAdminInDb,
};
