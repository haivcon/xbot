/**
 * User Preferences Module — Long-term AI memory
 * Stores user preferences that persist across sessions
 * File: db/preferences.js
 */

const { dbRun, dbGet, dbAll } = require('./core');

// ─── Get all preferences for a user ───
async function getUserPreferences(userId) {
    const rows = await dbAll(
        'SELECT key, value, updatedAt FROM user_preferences WHERE userId = ?',
        [String(userId)]
    );
    const prefs = {};
    for (const row of rows) {
        prefs[row.key] = row.value;
    }
    return prefs;
}

// ─── Get a single preference ───
async function getUserPreference(userId, key) {
    const row = await dbGet(
        'SELECT value FROM user_preferences WHERE userId = ? AND key = ?',
        [String(userId), key]
    );
    return row?.value || null;
}

// ─── Set a preference (upsert) ───
async function setUserPreference(userId, key, value) {
    await dbRun(
        `INSERT INTO user_preferences (userId, key, value, updatedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
        [String(userId), key, String(value), Date.now()]
    );
}

// ─── Delete a preference ───
async function deleteUserPreference(userId, key) {
    await dbRun(
        'DELETE FROM user_preferences WHERE userId = ? AND key = ?',
        [String(userId), key]
    );
}

// ─── Format preferences as system prompt context ───
function formatPreferencesForPrompt(prefs) {
    if (!prefs || Object.keys(prefs).length === 0) return '';
    const lines = Object.entries(prefs).map(([k, v]) => `- ${k}: ${v}`);
    return `\n\nUser Preferences (remembered from past conversations):\n${lines.join('\n')}`;
}

module.exports = {
    getUserPreferences,
    getUserPreference,
    setUserPreference,
    deleteUserPreference,
    formatPreferencesForPrompt,
};
