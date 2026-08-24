'use strict';

const { dbRun, dbGet, dbAll, safeJsonParse } = require('./core');

function rowToConversation(row) {
    if (!row) return null;
    return { ...row, turns: safeJsonParse(row.turns, []) };
}

async function saveAiConversation(conversation) {
    await dbRun(`INSERT INTO ai_chat_conversations (id, tenantId, routeRef, status, turns, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET routeRef=excluded.routeRef, status=excluded.status, turns=excluded.turns, updatedAt=excluded.updatedAt
        WHERE ai_chat_conversations.tenantId=excluded.tenantId`, [
        conversation.id, conversation.tenantId, conversation.routeRef || '', conversation.status || 'ready',
        JSON.stringify(conversation.turns || []), conversation.createdAt, conversation.updatedAt
    ]);
}

async function getAiConversation(tenantId, conversationId) {
    return rowToConversation(await dbGet('SELECT * FROM ai_chat_conversations WHERE tenantId = ? AND id = ?', [String(tenantId), String(conversationId)]));
}

async function listAiConversations(tenantId, limit = 10) {
    const rows = await dbAll('SELECT * FROM ai_chat_conversations WHERE tenantId = ? ORDER BY updatedAt DESC LIMIT ?', [String(tenantId), Math.max(1, Math.min(50, Number(limit) || 10))]);
    return rows.map(rowToConversation);
}

const aiConversationAdapter = {
    saveConversation: saveAiConversation,
    getConversation: getAiConversation,
    listConversations: listAiConversations
};

module.exports = { aiConversationAdapter, getAiConversation, listAiConversations, saveAiConversation };