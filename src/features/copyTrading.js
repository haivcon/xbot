/**
 * Copy Trading — Idea #5
 * Leader-follower social trading system
 */
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('CopyTrade');

/**
 * Initialize DB tables for copy trading
 */
async function initDB() {
    const { dbRun } = require('../../db/core');
    await dbRun(`CREATE TABLE IF NOT EXISTS copy_leaders (
        userId TEXT PRIMARY KEY,
        walletAddress TEXT NOT NULL,
        displayName TEXT DEFAULT 'Anonymous',
        totalFollowers INTEGER DEFAULT 0,
        totalTrades INTEGER DEFAULT 0,
        winRate REAL DEFAULT 0,
        totalPnlUsd REAL DEFAULT 0,
        isPublic INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now'))
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS copy_followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        followerId TEXT NOT NULL,
        leaderId TEXT NOT NULL,
        maxAmountUsd REAL DEFAULT 10,
        autoExecute INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        UNIQUE(followerId, leaderId)
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS copy_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leaderId TEXT NOT NULL,
        followerId TEXT,
        tokenAddress TEXT,
        tokenSymbol TEXT,
        chainIndex TEXT,
        action TEXT,
        leaderAmount TEXT,
        followerAmount TEXT,
        txHash TEXT,
        status TEXT DEFAULT 'pending',
        createdAt TEXT DEFAULT (datetime('now'))
    )`);
}

/**
 * Register as a copy trading leader
 */
async function registerAsLeader(userId, walletAddress, displayName) {
    // W10 fix: Validate wallet address format
    if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
        return { success: false, error: 'Invalid wallet address format. Must be 0x... (42 chars).' };
    }
    await initDB();
    const { dbRun } = require('../../db/core');
    await dbRun(`INSERT OR REPLACE INTO copy_leaders (userId, walletAddress, displayName) VALUES (?, ?, ?)`,
        [userId, walletAddress.toLowerCase(), displayName || 'Anonymous']);
    return { success: true, message: 'Registered as copy trading leader.' };
}

/**
 * Follow a leader
 */
async function followLeader(followerId, leaderId, options = {}) {
    if (followerId === leaderId) return { success: false, error: 'Cannot follow yourself.' };
    await initDB();
    const { dbGet, dbRun } = require('../../db/core');

    const leader = await dbGet('SELECT * FROM copy_leaders WHERE userId = ?', [leaderId]);
    if (!leader) return { success: false, error: 'Leader not found.' };

    // Check if already following (avoid double-counting followers)
    const existing = await dbGet('SELECT * FROM copy_followers WHERE followerId = ? AND leaderId = ? AND active = 1', [followerId, leaderId]);
    if (existing) return { success: true, leader: leader.displayName, message: 'Already following.' };

    await dbRun(`INSERT OR REPLACE INTO copy_followers (followerId, leaderId, maxAmountUsd, autoExecute, active) VALUES (?, ?, ?, ?, 1)`,
        [followerId, leaderId, options.maxAmountUsd || 10, options.autoExecute ? 1 : 0]);

    await dbRun('UPDATE copy_leaders SET totalFollowers = totalFollowers + 1 WHERE userId = ?', [leaderId]);

    return { success: true, leader: leader.displayName };
}

/**
 * Unfollow a leader
 */
async function unfollowLeader(followerId, leaderId) {
    const { dbRun } = require('../../db/core');
    await dbRun('UPDATE copy_followers SET active = 0 WHERE followerId = ? AND leaderId = ?', [followerId, leaderId]);
    await dbRun('UPDATE copy_leaders SET totalFollowers = MAX(0, totalFollowers - 1) WHERE userId = ?', [leaderId]);
    return { success: true };
}

/**
 * Get leaderboard of top leaders
 */
async function getLeaderboard(limit = 10) {
    await initDB();
    const { dbAll } = require('../../db/core');
    const leaders = await dbAll(
        'SELECT * FROM copy_leaders WHERE isPublic = 1 ORDER BY totalPnlUsd DESC LIMIT ?',
        [limit]
    );
    return leaders || [];
}

/**
 * Get followers of a leader
 */
async function getFollowers(leaderId) {
    const { dbAll } = require('../../db/core');
    const followers = await dbAll(
        'SELECT * FROM copy_followers WHERE leaderId = ? AND active = 1',
        [leaderId]
    );
    return followers || [];
}

/**
 * Notify followers when leader makes a trade
 */
async function notifyFollowers(leaderId, tradeInfo) {
    try {
        const bot = require('../core/bot').bot;
        const { dbAll, dbRun, dbGet } = require('../../db/core');
        const followers = await dbAll(
            'SELECT * FROM copy_followers WHERE leaderId = ? AND active = 1',
            [leaderId]
        );

        if (!followers || followers.length === 0) return;

        const leader = await dbGet('SELECT * FROM copy_leaders WHERE userId = ?', [leaderId]);
        const leaderName = leader?.displayName || 'Leader';

        // C4 fix: Use Promise.allSettled to notify all followers in parallel
        // One blocked follower won't delay/block others
        const notifyPromises = followers.map(async (follower) => {
            try {
                const msg = `📋 <b>Copy Trade Alert</b>\n━━━━━━━━━━━━━━━━━━\n` +
                    `👤 Leader: <b>${leaderName}</b>\n` +
                    `💱 ${tradeInfo.action}: <code>${tradeInfo.tokenSymbol}</code>\n` +
                    `💰 Amount: $${tradeInfo.amountUsd || '?'}\n` +
                    `⛓ Chain: ${tradeInfo.chainIndex}`;

                const confirmId = `copy_${follower.followerId}_${Date.now()}`;

                if (follower.autoExecute) {
                    await dbRun('INSERT INTO copy_trades (leaderId, followerId, tokenAddress, tokenSymbol, chainIndex, action, leaderAmount, status) VALUES (?,?,?,?,?,?,?,?)',
                        [leaderId, follower.followerId, tradeInfo.tokenAddress, tradeInfo.tokenSymbol, tradeInfo.chainIndex, tradeInfo.action, tradeInfo.amount, 'auto_queued']);
                    await bot.sendMessage(follower.followerId, msg + '\n\n🤖 <i>Auto-executing copy trade...</i>', { parse_mode: 'HTML', disable_web_page_preview: true });
                } else {
                    await bot.sendMessage(follower.followerId, msg, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ Copy', callback_data: `copy|yes|${confirmId}`.slice(0, 64) },
                                { text: '❌ Skip', callback_data: `copy|no|${confirmId}`.slice(0, 64) }
                            ]]
                        },
                        disable_web_page_preview: true
                    });
                }
            } catch (err) {
                log.warn(`Failed to notify follower ${follower.followerId}:`, err.message);
            }
        });

        await Promise.allSettled(notifyPromises);
    } catch (err) {
        log.error('Notify followers error:', err.message);
    }
}

/**
 * Format leaderboard for display
 */
function formatLeaderboard(leaders, lang = 'en') {
    const headers = { en: 'COPY TRADING LEADERBOARD', vi: 'BẢNG XẾP HẠNG COPY TRADING' };
    let card = `🏆 <b>${headers[lang] || headers.en}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

    if (!leaders || leaders.length === 0) {
        card += lang === 'vi' ? '<i>Chưa có leader nào.</i>' : '<i>No leaders registered yet.</i>';
        return card;
    }

    const medals = ['🥇', '🥈', '🥉'];
    for (let i = 0; i < leaders.length; i++) {
        const l = leaders[i];
        const icon = medals[i] || `${i + 1}.`;
        const pnl = Number(l.totalPnlUsd || 0);
        const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
        const winRateStr = `${Number(l.winRate || 0).toFixed(1)}%`;
        card += `${icon} <b>${l.displayName}</b>\n`;
        card += `   📊 PnL: <code>${pnlStr}</code> | Win: <code>${winRateStr}</code>\n`;
        card += `   👥 ${l.totalFollowers} followers | 📈 ${l.totalTrades} trades\n\n`;
    }

    return card;
}

module.exports = { registerAsLeader, followLeader, unfollowLeader, getLeaderboard, getFollowers, notifyFollowers, formatLeaderboard, initDB };
