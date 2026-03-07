/**
 * Scheduled Posts Database Module
 * Handles scheduled posts management
 * File: db/scheduledPosts.js
 */

const { dbRun, dbGet, dbAll } = require('./core');

// ========================================================================
// SCHEDULED POSTS
// ========================================================================

async function getScheduledPosts(chatId, options = {}) {
    let sql = 'SELECT * FROM scheduled_posts WHERE chatId = ?';
    const params = [chatId];
    if (options.enabledOnly) sql += ' AND enabled = 1';
    sql += ' ORDER BY nextRunAt ASC';
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }
    return await dbAll(sql, params) || [];
}

async function getScheduledPostById(postId) {
    return await dbGet('SELECT * FROM scheduled_posts WHERE id = ?', [postId]) || null;
}

async function getDueScheduledPosts(beforeTimestamp) {
    return await dbAll('SELECT * FROM scheduled_posts WHERE enabled = 1 AND nextRunAt <= ? ORDER BY nextRunAt ASC', [beforeTimestamp]) || [];
}

async function createScheduledPost(chatId, data) {
    if (!chatId || !data.content || !data.scheduleTime) return null;
    const now = Math.floor(Date.now() / 1000);
    const result = await dbRun('INSERT INTO scheduled_posts (chatId, topicId, content, mediaType, mediaFileId, scheduleTime, repeatType, timezone, enabled, nextRunAt, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [chatId, data.topicId || null, data.content, data.mediaType || null, data.mediaFileId || null, data.scheduleTime, data.repeatType || 'none', data.timezone || 'UTC', data.enabled !== false ? 1 : 0, data.nextRunAt || now, data.createdBy || '', now, now]);
    return result?.lastID || null;
}

async function updateScheduledPost(postId, updates) {
    if (!postId) return false;
    const now = Math.floor(Date.now() / 1000);
    const setClauses = ['updatedAt = ?'], params = [now];
    if (updates.content !== undefined) { setClauses.push('content = ?'); params.push(updates.content); }
    if (updates.scheduleTime !== undefined) { setClauses.push('scheduleTime = ?'); params.push(updates.scheduleTime); }
    if (updates.repeatType !== undefined) { setClauses.push('repeatType = ?'); params.push(updates.repeatType); }
    if (updates.enabled !== undefined) { setClauses.push('enabled = ?'); params.push(updates.enabled ? 1 : 0); }
    if (updates.lastRunAt !== undefined) { setClauses.push('lastRunAt = ?'); params.push(updates.lastRunAt); }
    if (updates.nextRunAt !== undefined) { setClauses.push('nextRunAt = ?'); params.push(updates.nextRunAt); }
    params.push(postId);
    await dbRun(`UPDATE scheduled_posts SET ${setClauses.join(', ')} WHERE id = ?`, params);
    return true;
}

async function deleteScheduledPost(postId) {
    if (!postId) return false;
    await dbRun('DELETE FROM scheduled_posts WHERE id = ?', [postId]);
    return true;
}

module.exports = {
    getScheduledPosts,
    getScheduledPostById,
    getDueScheduledPosts,
    createScheduledPost,
    updateScheduledPost,
    deleteScheduledPost
};
