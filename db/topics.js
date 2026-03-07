/**
 * Topics Database Module
 * Handles topic languages, feature topics, and price alert token topics
 * File: db/topics.js
 */

const { dbRun, dbGet, dbAll } = require('./core');
const { normalizeLanguageCode } = require('../i18n.js');

// ========================================================================
// TOPIC LANGUAGES
// ========================================================================

async function setTopicLanguage(chatId, topicId, lang) {
    const chatKey = chatId ? chatId.toString() : null;
    const topicKey = topicId === undefined || topicId === null ? null : topicId.toString();
    if (!chatKey || !topicKey || !lang) return null;
    const now = Date.now();
    await dbRun('INSERT INTO topic_languages(chatId, topicId, lang, updatedAt) VALUES(?, ?, ?, ?) ON CONFLICT(chatId, topicId) DO UPDATE SET lang = excluded.lang, updatedAt = excluded.updatedAt',
        [chatKey, topicKey, normalizeLanguageCode(lang), now]);
    return getTopicLanguage(chatKey, topicKey);
}

async function getTopicLanguage(chatId, topicId) {
    const chatKey = chatId ? chatId.toString() : null;
    const topicKey = topicId === undefined || topicId === null ? null : topicId.toString();
    if (!chatKey || !topicKey) return null;
    const row = await dbGet('SELECT chatId, topicId, lang, updatedAt FROM topic_languages WHERE chatId = ? AND topicId = ?', [chatKey, topicKey]);
    if (!row) return null;
    return { chatId: row.chatId, topicId: row.topicId, lang: normalizeLanguageCode(row.lang), updatedAt: row.updatedAt };
}

async function listTopicLanguages(chatId) {
    const chatKey = chatId ? chatId.toString() : null;
    if (!chatKey) return [];
    const rows = await dbAll('SELECT chatId, topicId, lang, updatedAt FROM topic_languages WHERE chatId = ? ORDER BY updatedAt DESC', [chatKey]);
    return (rows || []).map(row => ({ chatId: row.chatId, topicId: row.topicId, lang: normalizeLanguageCode(row.lang), updatedAt: row.updatedAt || null }));
}

async function removeTopicLanguage(chatId, topicId) {
    const chatKey = chatId ? chatId.toString() : null;
    const topicKey = topicId === undefined || topicId === null ? null : topicId.toString();
    if (!chatKey || !topicKey) return false;
    const result = await dbRun('DELETE FROM topic_languages WHERE chatId = ? AND topicId = ?', [chatKey, topicKey]);
    return Boolean(result?.changes);
}

// ========================================================================
// FEATURE TOPICS
// ========================================================================

async function addFeatureTopic(chatId, feature, topicId = null) {
    const chatKey = chatId ? chatId.toString() : null;
    const featureKey = (feature || '').toString().trim().toLowerCase();
    if (!chatKey || !featureKey) return null;
    const topicKey = topicId === undefined || topicId === null ? 'main' : topicId.toString();
    const now = Date.now();
    await dbRun('INSERT INTO feature_topics(chatId, feature, topicId, updatedAt) VALUES(?, ?, ?, ?) ON CONFLICT(chatId, feature, topicId) DO UPDATE SET updatedAt = excluded.updatedAt',
        [chatKey, featureKey, topicKey, now]);
    return { chatId: chatKey, feature: featureKey, topicId: topicKey, updatedAt: now };
}

async function listFeatureTopics(chatId, feature) {
    const chatKey = chatId ? chatId.toString() : null;
    const featureKey = (feature || '').toString().trim().toLowerCase();
    if (!chatKey || !featureKey) return [];
    const rows = await dbAll('SELECT chatId, feature, topicId, updatedAt FROM feature_topics WHERE chatId = ? AND feature = ? ORDER BY updatedAt ASC', [chatKey, featureKey]);
    return rows.map(row => ({ chatId: row.chatId, feature: row.feature, topicId: row.topicId, updatedAt: row.updatedAt }));
}

async function removeFeatureTopic(chatId, feature, topicId = null) {
    const chatKey = chatId ? chatId.toString() : null;
    const featureKey = (feature || '').toString().trim().toLowerCase();
    if (!chatKey || !featureKey) return false;
    const topicKey = topicId === undefined || topicId === null ? 'main' : topicId.toString();
    const result = await dbRun('DELETE FROM feature_topics WHERE chatId = ? AND feature = ? AND topicId = ?', [chatKey, featureKey, topicKey]);
    return Boolean(result?.changes);
}

// ========================================================================
// PRICE ALERT TOKEN TOPICS
// ========================================================================

async function listPriceAlertTokenTopics(tokenId, chatId = null) {
    const id = Number(tokenId);
    if (!Number.isFinite(id)) return [];
    const rows = await dbAll('SELECT tokenId, chatId, topicId, enabled, updatedAt FROM price_alert_token_topics WHERE tokenId = ? ORDER BY updatedAt ASC', [id]);
    return rows.filter(row => !chatId || row.chatId === chatId.toString())
        .map(row => ({ tokenId: row.tokenId, chatId: row.chatId, topicId: row.topicId, enabled: Number(row.enabled) === 1 ? 1 : 0, updatedAt: row.updatedAt }));
}

async function setPriceAlertTokenTopic(tokenId, chatId, topicId, enabled = 1) {
    const id = Number(tokenId);
    const chatKey = chatId ? chatId.toString() : null;
    const topicKey = topicId === undefined || topicId === null ? 'main' : topicId.toString();
    if (!Number.isFinite(id) || !chatKey || !topicKey) return null;
    const now = Date.now();
    await dbRun('INSERT INTO price_alert_token_topics(tokenId, chatId, topicId, enabled, updatedAt) VALUES(?, ?, ?, ?, ?) ON CONFLICT(tokenId, topicId) DO UPDATE SET enabled = excluded.enabled, updatedAt = excluded.updatedAt',
        [id, chatKey, topicKey, enabled ? 1 : 0, now]);
    return { tokenId: id, chatId: chatKey, topicId: topicKey, enabled: enabled ? 1 : 0, updatedAt: now };
}

module.exports = {
    // Topic languages
    setTopicLanguage,
    getTopicLanguage,
    listTopicLanguages,
    removeTopicLanguage,

    // Feature topics
    addFeatureTopic,
    listFeatureTopics,
    removeFeatureTopic,

    // Price alert token topics
    listPriceAlertTokenTopics,
    setPriceAlertTokenTopic
};
