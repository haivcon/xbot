/**
 * Games Database Module
 * Handles game results, stats, leaderboards, achievements, challenges, ELO
 * File: db/games.js
 */

const { dbRun, dbGet, dbAll, getTodayDateString } = require('./core');

const LEADERBOARD_GAME_TYPES = ['sudoku', 'minesweeper', 'chess', 'gomoku', 'memory', 'treasure'];

// ========================================================================
// DAILY CHALLENGES
// ========================================================================

async function getDailyChallenges(chatId, userId, challengeDate) {
    if (!userId || !challengeDate) return [];
    const rows = await dbAll('SELECT * FROM daily_challenges WHERE chatId = ? AND userId = ? AND challengeDate = ?', [chatId || '', userId, challengeDate]);
    return (rows || []).map(row => ({ id: row.id, chatId: row.chatId, userId: row.userId, challengeDate: row.challengeDate, challengeType: row.challengeType, progress: row.progress, target: row.target, completed: row.completed === 1, pointsAwarded: row.pointsAwarded, xpAwarded: row.xpAwarded, createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

async function upsertDailyChallenge(chatId, userId, challengeDate, challengeType, data = {}) {
    if (!userId || !challengeDate || !challengeType) return false;
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT * FROM daily_challenges WHERE chatId = ? AND userId = ? AND challengeDate = ? AND challengeType = ?', [chatId || '', userId, challengeDate, challengeType]);
    if (!existing) {
        await dbRun('INSERT INTO daily_challenges(chatId, userId, challengeDate, challengeType, progress, target, completed, pointsAwarded, xpAwarded, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [chatId || '', userId, challengeDate, challengeType, data.progress || 0, data.target || 1, data.completed ? 1 : 0, data.pointsAwarded || 0, data.xpAwarded || 0, now, now]);
    } else {
        const setClauses = ['updatedAt = ?'], params = [now];
        if (data.progress !== undefined) { setClauses.push('progress = ?'); params.push(data.progress); }
        if (data.target !== undefined) { setClauses.push('target = ?'); params.push(data.target); }
        if (data.completed !== undefined) { setClauses.push('completed = ?'); params.push(data.completed ? 1 : 0); }
        if (data.pointsAwarded !== undefined) { setClauses.push('pointsAwarded = ?'); params.push(data.pointsAwarded); }
        if (data.xpAwarded !== undefined) { setClauses.push('xpAwarded = ?'); params.push(data.xpAwarded); }
        params.push(existing.id);
        await dbRun(`UPDATE daily_challenges SET ${setClauses.join(', ')} WHERE id = ?`, params);
    }
    return true;
}

async function incrementChallengeProgress(chatId, userId, challengeDate, challengeType, amount = 1) {
    const existing = await dbGet('SELECT * FROM daily_challenges WHERE chatId = ? AND userId = ? AND challengeDate = ? AND challengeType = ?', [chatId || '', userId, challengeDate, challengeType]);
    if (!existing) return false;
    const newProgress = existing.progress + amount;
    await dbRun('UPDATE daily_challenges SET progress = ?, updatedAt = ? WHERE id = ?', [newProgress, Math.floor(Date.now() / 1000), existing.id]);
    return { newProgress, target: existing.target, completed: newProgress >= existing.target };
}

// ========================================================================
// GLOBAL LEADERBOARD
// ========================================================================

async function getGlobalLeaderboard(gameType, limit = 10) {
    if (!gameType) return [];
    const rows = await dbAll('SELECT * FROM global_leaderboard WHERE gameType = ? ORDER BY score DESC, wins DESC, gamesPlayed DESC LIMIT ?', [gameType, limit]);
    return (rows || []).map((row, index) => ({ rank: index + 1, userId: row.userId, userName: row.userName, gameType: row.gameType, score: row.score, wins: row.wins, losses: row.losses, draws: row.draws, bestScore: row.bestScore, bestTime: row.bestTime, gamesPlayed: row.gamesPlayed, lastPlayedAt: row.lastPlayedAt }));
}

async function getPlayerLeaderboardStats(userId) {
    if (!userId) return [];
    const rows = await dbAll('SELECT * FROM global_leaderboard WHERE userId = ?', [userId]);
    return (rows || []).map(row => ({ gameType: row.gameType, score: row.score, wins: row.wins, losses: row.losses, draws: row.draws, bestScore: row.bestScore, bestTime: row.bestTime, gamesPlayed: row.gamesPlayed, lastPlayedAt: row.lastPlayedAt }));
}

async function updateLeaderboardEntry(userId, userName, gameType, result) {
    if (!userId || !gameType) return false;
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT * FROM global_leaderboard WHERE userId = ? AND gameType = ?', [userId, gameType]);
    if (!existing) {
        await dbRun('INSERT INTO global_leaderboard (userId, userName, gameType, score, wins, losses, draws, bestScore, bestTime, gamesPlayed, lastPlayedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, userName || null, gameType, result.score || 0, result.won ? 1 : 0, result.lost ? 1 : 0, result.draw ? 1 : 0, result.score || null, result.time || null, 1, now, now, now]);
    } else {
        const newScore = existing.score + (result.score || 0);
        const newWins = existing.wins + (result.won ? 1 : 0);
        const newLosses = existing.losses + (result.lost ? 1 : 0);
        const newDraws = existing.draws + (result.draw ? 1 : 0);
        const newGamesPlayed = existing.gamesPlayed + 1;
        const newBestScore = result.score && (!existing.bestScore || result.score > existing.bestScore) ? result.score : existing.bestScore;
        const newBestTime = result.time && (!existing.bestTime || result.time < existing.bestTime) ? result.time : existing.bestTime;
        await dbRun('UPDATE global_leaderboard SET userName = COALESCE(?, userName), score = ?, wins = ?, losses = ?, draws = ?, bestScore = ?, bestTime = ?, gamesPlayed = ?, lastPlayedAt = ?, updatedAt = ? WHERE id = ?',
            [userName, newScore, newWins, newLosses, newDraws, newBestScore, newBestTime, newGamesPlayed, now, now, existing.id]);
    }
    return true;
}

async function getPlayerRank(userId, gameType) {
    if (!userId || !gameType) return null;
    const player = await dbGet('SELECT * FROM global_leaderboard WHERE userId = ? AND gameType = ?', [userId, gameType]);
    if (!player) return null;
    const rankRow = await dbGet('SELECT COUNT(*) as rank FROM global_leaderboard WHERE gameType = ? AND score > ?', [gameType, player.score]);
    return { rank: (rankRow?.rank || 0) + 1, ...player };
}

// ========================================================================
// ACHIEVEMENTS
// ========================================================================

async function getUserAchievements(userId) {
    if (!userId) return [];
    const rows = await dbAll('SELECT * FROM user_achievements WHERE userId = ? ORDER BY unlockedAt DESC', [userId]);
    return (rows || []).map(row => ({ achievementId: row.achievementId, unlockedAt: row.unlockedAt }));
}

async function hasAchievement(userId, achievementId) {
    if (!userId || !achievementId) return false;
    const row = await dbGet('SELECT 1 FROM user_achievements WHERE userId = ? AND achievementId = ?', [userId, achievementId]);
    return Boolean(row);
}

async function unlockAchievement(userId, achievementId) {
    if (!userId || !achievementId) return false;
    if (await hasAchievement(userId, achievementId)) return false;
    await dbRun('INSERT OR IGNORE INTO user_achievements (userId, achievementId, unlockedAt) VALUES (?, ?, ?)', [userId, achievementId, Math.floor(Date.now() / 1000)]);
    return true;
}

// ========================================================================
// USER STATS
// ========================================================================

async function getUserStats(userId) {
    if (!userId) return null;
    const row = await dbGet('SELECT * FROM user_stats WHERE userId = ?', [userId]);
    if (!row) return { userId, totalXP: 0, checkinCount: 0, gamesPlayed: 0, gamesWon: 0, aiChats: 0, imagesGenerated: 0, priceChecks: 0 };
    return row;
}

async function updateUserStats(userId, updates = {}) {
    if (!userId) return false;
    const now = Math.floor(Date.now() / 1000);
    const existing = await dbGet('SELECT * FROM user_stats WHERE userId = ?', [userId]);
    if (!existing) {
        await dbRun('INSERT INTO user_stats (userId, totalXP, checkinCount, gamesPlayed, gamesWon, aiChats, imagesGenerated, priceChecks, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, updates.totalXP || 0, updates.checkinCount || 0, updates.gamesPlayed || 0, updates.gamesWon || 0, updates.aiChats || 0, updates.imagesGenerated || 0, updates.priceChecks || 0, now, now]);
    } else {
        const setClauses = ['updatedAt = ?'], params = [now];
        if (updates.totalXP !== undefined) { setClauses.push('totalXP = totalXP + ?'); params.push(updates.totalXP); }
        if (updates.checkinCount !== undefined) { setClauses.push('checkinCount = checkinCount + ?'); params.push(updates.checkinCount); }
        if (updates.gamesPlayed !== undefined) { setClauses.push('gamesPlayed = gamesPlayed + ?'); params.push(updates.gamesPlayed); }
        if (updates.gamesWon !== undefined) { setClauses.push('gamesWon = gamesWon + ?'); params.push(updates.gamesWon); }
        if (updates.aiChats !== undefined) { setClauses.push('aiChats = aiChats + ?'); params.push(updates.aiChats); }
        if (updates.imagesGenerated !== undefined) { setClauses.push('imagesGenerated = imagesGenerated + ?'); params.push(updates.imagesGenerated); }
        if (updates.priceChecks !== undefined) { setClauses.push('priceChecks = priceChecks + ?'); params.push(updates.priceChecks); }
        params.push(userId);
        await dbRun(`UPDATE user_stats SET ${setClauses.join(', ')} WHERE userId = ?`, params);
    }
    return true;
}

// ========================================================================
// GROUP ANALYTICS & REPUTATION
// ========================================================================

async function getGroupAnalytics(chatId, days = 7) {
    if (!chatId) return null;
    const usageDate = getTodayDateString('UTC');
    const commandUsage = await dbAll('SELECT command, SUM(count) as total FROM group_command_usage_logs WHERE chatId = ? GROUP BY command ORDER BY total DESC LIMIT 10', [chatId]);
    const checkinStats = await dbGet('SELECT COUNT(DISTINCT userId) as uniqueUsers, COUNT(*) as totalCheckins, SUM(pointsAwarded) as totalPoints FROM checkin_records WHERE chatId = ? AND createdAt > ?', [chatId, Math.floor(Date.now() / 1000) - (days * 86400)]);
    const activeUsers = await dbGet('SELECT COUNT(DISTINCT userId) as count FROM command_usage_logs WHERE usageDate >= ?', [getTodayDateString('UTC')]);
    const gameActivity = await dbAll('SELECT gameType, COUNT(*) as games, SUM(CASE WHEN wins > 0 THEN 1 ELSE 0 END) as wins FROM global_leaderboard WHERE lastPlayedAt > ? GROUP BY gameType', [Math.floor(Date.now() / 1000) - (days * 86400)]);
    return { chatId, period: `${days} days`, commandUsage: commandUsage || [], checkins: { uniqueUsers: checkinStats?.uniqueUsers || 0, totalCheckins: checkinStats?.totalCheckins || 0, totalPoints: checkinStats?.totalPoints || 0 }, activeUsersToday: activeUsers?.count || 0, gameActivity: gameActivity || [], generatedAt: Date.now() };
}

async function getGroupMemberCount(chatId) {
    if (!chatId) return 0;
    const row = await dbGet('SELECT COUNT(DISTINCT userId) as count FROM checkin_members WHERE chatId = ?', [chatId]);
    return row?.count || 0;
}

async function getGroupTopUsers(chatId, limit = 10) {
    if (!chatId) return [];
    const rows = await dbAll('SELECT cm.userId, cm.totalPoints, cm.totalCheckins, cm.longestStreak, u.username, u.fullName FROM checkin_members cm LEFT JOIN users u ON u.chatId = cm.userId WHERE cm.chatId = ? ORDER BY cm.totalPoints DESC, cm.totalCheckins DESC LIMIT ?', [chatId, limit]);
    return (rows || []).map((row, index) => ({ rank: index + 1, userId: row.userId, userName: row.fullName || row.username || 'Unknown', totalPoints: row.totalPoints, totalCheckins: row.totalCheckins, longestStreak: row.longestStreak }));
}

async function getUserReputation(chatId, userId) {
    if (!userId) return null;
    const checkinStats = await dbGet('SELECT totalCheckins, totalPoints FROM checkin_members WHERE chatId = ? AND userId = ?', [chatId || '', userId]);
    const warnings = await dbAll('SELECT COUNT(*) as count FROM user_warnings WHERE chatId = ? AND targetUserId = ?', [chatId || '', userId]);
    const gameStats = await dbGet('SELECT SUM(wins) as wins, SUM(losses) as losses, SUM(gamesPlayed) as games FROM global_leaderboard WHERE userId = ?', [userId]);
    const achievements = await dbAll('SELECT * FROM user_achievements WHERE userId = ?', [userId]);
    let score = 50;
    score += Math.min((checkinStats?.totalCheckins || 0) * 0.5, 20);
    score += Math.min((gameStats?.wins || 0) * 0.3, 10);
    score += Math.min((achievements?.length || 0) * 2, 15);
    score -= (warnings?.[0]?.count || 0) * 10;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const level = score >= 80 ? 'Trusted' : score >= 60 ? 'Good' : score >= 40 ? 'Neutral' : score >= 20 ? 'Low' : 'Untrusted';
    return { userId, chatId: chatId || null, score, level, checkins: checkinStats?.totalCheckins || 0, points: checkinStats?.totalPoints || 0, warnings: warnings?.[0]?.count || 0, gamesWon: gameStats?.wins || 0, gamesLost: gameStats?.losses || 0, achievements: achievements?.length || 0 };
}

async function getGroupReputationLeaderboard(chatId, limit = 10) {
    if (!chatId) return [];
    const members = await dbAll('SELECT userId FROM checkin_members WHERE chatId = ? ORDER BY totalPoints DESC LIMIT ?', [chatId, limit * 2]);
    const results = [];
    for (const member of members || []) {
        const rep = await getUserReputation(chatId, member.userId);
        if (rep) results.push(rep);
        if (results.length >= limit) break;
    }
    return results.sort((a, b) => b.score - a.score);
}

module.exports = {
    LEADERBOARD_GAME_TYPES,
    // Challenges
    getDailyChallenges,
    upsertDailyChallenge,
    incrementChallengeProgress,
    // Leaderboard
    getGlobalLeaderboard,
    getPlayerLeaderboardStats,
    updateLeaderboardEntry,
    getPlayerRank,
    // Achievements
    getUserAchievements,
    hasAchievement,
    unlockAchievement,
    // Stats
    getUserStats,
    updateUserStats,
    // Analytics & Reputation
    getGroupAnalytics,
    getGroupMemberCount,
    getGroupTopUsers,
    getUserReputation,
    getGroupReputationLeaderboard
};
