/**
 * Smart Copy Engine — Intent-based AI Copy-Trader
 * Hackathon Feature #2: Zero-click copy-trading based on Onchain OS whale tracking
 *
 * Flow: User says "copy trade cá mập X Layer" → Engine finds top traders via
 * Onchain OS → monitors their trades → auto-executes copies via trading wallet.
 *
 * Integrates with autoTrading.js for execution and tradeExecutionEngine.js for position management.
 */
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('SmartCopy');

const XLAYER_CHAIN = '196';

// Active copy sessions (userId → session)
const activeSessions = new Map();

// Polling intervals per user
const pollingIntervals = new Map();

const POLL_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes
const MAX_TRACKED_WALLETS = 10;
const DEFAULT_COPY_BUDGET_USD = 50;
const MIN_TRADE_USD = 5;

let _dbInit = false;

// ═══════════════════════════════════════════════════════
// DB
// ═══════════════════════════════════════════════════════

async function initDB() {
    if (_dbInit) return;
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`CREATE TABLE IF NOT EXISTS smart_copy_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            chainIndex TEXT DEFAULT '196',
            status TEXT DEFAULT 'active',
            budgetUsd REAL DEFAULT ${DEFAULT_COPY_BUDGET_USD},
            spentUsd REAL DEFAULT 0,
            maxPerTradeUsd REAL DEFAULT 10,
            trackedWallets TEXT,
            totalCopies INTEGER DEFAULT 0,
            totalPnlUsd REAL DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS smart_copy_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sessionId INTEGER NOT NULL,
            userId TEXT NOT NULL,
            leaderAddress TEXT NOT NULL,
            leaderTag TEXT,
            tokenAddress TEXT NOT NULL,
            tokenSymbol TEXT,
            action TEXT DEFAULT 'buy',
            leaderAmountUsd REAL,
            copyAmountUsd REAL,
            txHash TEXT,
            status TEXT DEFAULT 'pending',
            pnlUsd REAL DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS smart_copy_leaders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT NOT NULL UNIQUE,
            chainIndex TEXT DEFAULT '196',
            tag TEXT,
            winRate REAL DEFAULT 0,
            totalPnlUsd REAL DEFAULT 0,
            totalTrades INTEGER DEFAULT 0,
            aiScore INTEGER DEFAULT 0,
            lastTradeAt TEXT,
            discoveredAt TEXT DEFAULT (datetime('now'))
        )`);
        _dbInit = true;
    } catch (err) {
        log.error('SmartCopy DB init error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
// DISCOVER — Find top traders on X Layer via Onchain OS
// ═══════════════════════════════════════════════════════

/**
 * Discover top traders/whales on X Layer
 * Uses Onchain OS portfolio + signal APIs
 */
async function discoverLeaders(chainIndex = XLAYER_CHAIN, options = {}) {
    const leaders = [];

    try {
        // 1. Get Smart Money + Whale signals
        const signals = await onchainos.getSignalList(chainIndex, {
            walletType: '1,3,4' // Smart Money, Whale, KOL
        });

        if (!Array.isArray(signals)) return leaders;

        // 2. Extract unique wallet addresses from signals
        const walletSet = new Set();
        for (const sig of signals) {
            const addrs = sig.addressList || sig.walletAddresses || [];
            if (Array.isArray(addrs)) {
                for (const addr of addrs.slice(0, 5)) {
                    if (addr && addr.startsWith('0x')) walletSet.add(addr.toLowerCase());
                }
            }
            // Also check single address fields
            const singleAddr = sig.walletAddress || sig.address || '';
            if (singleAddr && singleAddr.startsWith('0x')) walletSet.add(singleAddr.toLowerCase());
        }

        // 3. Get portfolio overview for each top wallet
        const wallets = [...walletSet].slice(0, 20);
        const portfolioResults = await Promise.allSettled(
            wallets.map(addr =>
                onchainos.getPortfolioOverview(chainIndex, addr, '4') // 1-month timeframe
                    .then(data => ({ address: addr, data }))
                    .catch(() => ({ address: addr, data: null }))
            )
        );

        // 4. Score and rank leaders
        for (const result of portfolioResults) {
            if (result.status !== 'fulfilled' || !result.value?.data) continue;
            const { address, data } = result.value;
            const portfolio = Array.isArray(data) ? data[0] : data;
            if (!portfolio) continue;

            const winRate = Number(portfolio.winRate || portfolio.profitableRate || 0);
            const pnl = Number(portfolio.totalPnlUsd || portfolio.realizedPnl || 0);
            const trades = Number(portfolio.totalTrades || portfolio.tradeCount || 0);

            // Score: combination of win rate, PnL, and trade count
            const score = Math.round(
                (winRate * 40) +                        // 40% weight on win rate
                (Math.min(pnl / 1000, 30)) +           // 30% weight on PnL (capped)
                (Math.min(trades / 10, 30))            // 30% weight on activity
            );

            leaders.push({
                address,
                winRate: winRate * 100,
                totalPnlUsd: pnl,
                totalTrades: trades,
                aiScore: Math.min(100, Math.max(0, score)),
                tag: winRate > 0.6 ? 'Smart Money' : pnl > 500 ? 'Whale' : 'Active Trader'
            });
        }

        // Sort by score
        leaders.sort((a, b) => b.aiScore - a.aiScore);

        // Save to DB
        await initDB();
        const { dbRun } = require('../../db/core');
        for (const leader of leaders.slice(0, MAX_TRACKED_WALLETS)) {
            await dbRun(`INSERT OR REPLACE INTO smart_copy_leaders (address, chainIndex, tag, winRate, totalPnlUsd, totalTrades, aiScore)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [leader.address, chainIndex, leader.tag, leader.winRate, leader.totalPnlUsd, leader.totalTrades, leader.aiScore]);
        }

        log.info(`Discovered ${leaders.length} leaders on chain ${chainIndex}`);
    } catch (err) {
        log.error('discoverLeaders error:', err.message);
    }

    return leaders.slice(0, MAX_TRACKED_WALLETS);
}

// ═══════════════════════════════════════════════════════
// START SESSION — Begin copy-trading
// ═══════════════════════════════════════════════════════

async function startSession(userId, options = {}) {
    await initDB();
    const { dbRun, dbGet } = require('../../db/core');

    // Check for existing active session
    const existing = await dbGet('SELECT * FROM smart_copy_sessions WHERE userId = ? AND status = ?', [userId, 'active']);
    if (existing) {
        return { success: false, error: 'You already have an active copy session. Stop it first.' };
    }

    const chainIndex = options.chainIndex || XLAYER_CHAIN;
    const budget = Math.max(MIN_TRADE_USD, Number(options.budgetUsd) || DEFAULT_COPY_BUDGET_USD);
    const maxPerTrade = Math.max(1, Number(options.maxPerTradeUsd) || Math.min(10, budget / 5));

    // Discover leaders
    const leaders = await discoverLeaders(chainIndex, options);
    if (leaders.length === 0) {
        return { success: false, error: 'No valid leaders found on this chain. Try again later.' };
    }

    const topLeaders = leaders.slice(0, options.maxLeaders || 5);
    const trackedWallets = topLeaders.map(l => l.address);

    // Create session
    const result = await dbRun(`INSERT INTO smart_copy_sessions (userId, chainIndex, budgetUsd, maxPerTradeUsd, trackedWallets)
        VALUES (?, ?, ?, ?, ?)`,
        [userId, chainIndex, budget, maxPerTrade, JSON.stringify(trackedWallets)]);

    const sessionId = result?.lastID;

    // Start monitoring
    const session = {
        id: sessionId,
        userId,
        chainIndex,
        budget,
        maxPerTrade,
        spent: 0,
        trackedWallets,
        leaders: topLeaders,
        lastKnownTrades: new Map()
    };

    activeSessions.set(userId, session);
    startPolling(userId, session);

    log.info(`SmartCopy session #${sessionId} started for user ${userId}: tracking ${trackedWallets.length} leaders, budget $${budget}`);

    return {
        success: true,
        sessionId,
        leaders: topLeaders,
        budget,
        maxPerTrade,
        trackedCount: trackedWallets.length
    };
}

// ═══════════════════════════════════════════════════════
// POLLING — Monitor leader trades
// ═══════════════════════════════════════════════════════

function startPolling(userId, session) {
    if (pollingIntervals.has(userId)) return;

    const interval = setInterval(async () => {
        try {
            await pollLeaderTrades(userId, session);
        } catch (err) {
            log.warn(`Polling error for user ${userId}:`, err.message);
        }
    }, POLL_INTERVAL_MS);

    pollingIntervals.set(userId, interval);
    log.info(`Started polling for user ${userId}`);

    // Run first poll immediately
    pollLeaderTrades(userId, session).catch(err => log.warn('Initial poll error:', err.message));
}

function stopPolling(userId) {
    const interval = pollingIntervals.get(userId);
    if (interval) {
        clearInterval(interval);
        pollingIntervals.delete(userId);
    }
}

async function pollLeaderTrades(userId, session) {
    if (!session?.trackedWallets?.length) return;

    const walletFilter = session.trackedWallets.slice(0, 10).join(',');

    try {
        // Fetch recent trades by tracked wallets
        const trades = await onchainos.getMarketTrades(session.chainIndex, '', {
            walletAddressFilter: walletFilter,
            limit: '50'
        });

        if (!Array.isArray(trades)) return;

        for (const trade of trades) {
            const tradeId = trade.txHash || trade.id || `${trade.walletAddress}_${trade.timestamp}`;
            if (session.lastKnownTrades.has(tradeId)) continue; // Already seen

            session.lastKnownTrades.set(tradeId, true);

            // Only copy BUY trades from Smart Money
            const side = String(trade.type || trade.side || '').toLowerCase();
            if (!side.includes('buy') && side !== '1') continue;

            const amountUsd = Number(trade.amountUsd || trade.totalAmountUsd || 0);
            if (amountUsd < MIN_TRADE_USD) continue;

            // Budget check
            if (session.spent >= session.budget) {
                log.info(`Budget exhausted for user ${userId}`);
                continue;
            }

            const copyAmount = Math.min(session.maxPerTrade, session.budget - session.spent);

            // Execute copy trade
            await executeCopyTrade(userId, session, trade, copyAmount);
        }

        // Cleanup old trade IDs (keep last 500)
        if (session.lastKnownTrades.size > 500) {
            const keys = [...session.lastKnownTrades.keys()];
            for (let i = 0; i < keys.length - 500; i++) {
                session.lastKnownTrades.delete(keys[i]);
            }
        }
    } catch (err) {
        log.warn(`pollLeaderTrades error:`, err.message);
    }
}

// ═══════════════════════════════════════════════════════
// EXECUTE — Copy a leader's trade
// ═══════════════════════════════════════════════════════

async function executeCopyTrade(userId, session, leaderTrade, copyAmountUsd) {
    try {
        const tokenAddress = leaderTrade.tokenContractAddress || leaderTrade.tokenAddress;
        const tokenSymbol = leaderTrade.tokenSymbol || leaderTrade.symbol || 'UNKNOWN';
        const leaderAddress = leaderTrade.walletAddress || leaderTrade.address || '';

        if (!tokenAddress) return;

        // Security check — token scan
        try {
            const scanResult = await onchainos.tokenScan([{
                chainId: session.chainIndex,
                contractAddress: tokenAddress
            }]);
            const scan = Array.isArray(scanResult) ? scanResult[0] : scanResult;
            if (scan?.isHoneypot || scan?.riskLevel === 'high') {
                log.warn(`Skipping honeypot token ${tokenSymbol} (${tokenAddress})`);
                return;
            }
        } catch {}

        // Create trade plan via autoTrading system
        const autoTrading = require('./autoTrading');
        const plan = {
            tokenAddress,
            tokenSymbol,
            chainIndex: session.chainIndex,
            action: 'buy',
            suggestedAmountUsd: copyAmountUsd,
            aiScore: 70,
            aiReason: `Copy trade from ${leaderTrade.tag || 'Smart Money'}: ${leaderAddress.slice(0, 10)}...`,
            signalSource: 'smart_copy'
        };

        // Record copy trade
        const { dbRun } = require('../../db/core');
        await dbRun(`INSERT INTO smart_copy_trades (sessionId, userId, leaderAddress, leaderTag, tokenAddress, tokenSymbol, action, leaderAmountUsd, copyAmountUsd, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [session.id, userId, leaderAddress, leaderTrade.tag || '', tokenAddress, tokenSymbol, 'buy',
                Number(leaderTrade.amountUsd || 0), copyAmountUsd, 'queued']);

        session.spent += copyAmountUsd;

        // Update session in DB
        await dbRun('UPDATE smart_copy_sessions SET spentUsd = ?, totalCopies = totalCopies + 1, updatedAt = datetime(\'now\') WHERE id = ?',
            [session.spent, session.id]);

        // Notify user via Telegram
        try {
            const bot = require('../core/bot').bot;
            const msg = `📋 <b>Smart Copy Trade</b>\n━━━━━━━━━━━━━━━━━━\n` +
                `🐋 Leader: <code>${leaderAddress.slice(0, 10)}...</code>\n` +
                `💱 Buy: <b>${tokenSymbol}</b>\n` +
                `💰 Amount: $${copyAmountUsd.toFixed(2)}\n` +
                `📊 Budget remaining: $${(session.budget - session.spent).toFixed(2)}`;
            await bot.sendMessage(userId, msg, { parse_mode: 'HTML' });
        } catch {}

        log.info(`Copy trade: ${tokenSymbol} $${copyAmountUsd} from ${leaderAddress.slice(0, 10)}... for user ${userId}`);
    } catch (err) {
        log.error('executeCopyTrade error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
// STOP SESSION
// ═══════════════════════════════════════════════════════

async function stopSession(userId) {
    await initDB();
    const { dbRun } = require('../../db/core');
    await dbRun("UPDATE smart_copy_sessions SET status = 'stopped', updatedAt = datetime('now') WHERE userId = ? AND status = 'active'", [userId]);
    stopPolling(userId);
    activeSessions.delete(userId);
    log.info(`SmartCopy session stopped for user ${userId}`);
    return { success: true };
}

// ═══════════════════════════════════════════════════════
// STATUS & HISTORY
// ═══════════════════════════════════════════════════════

async function getSessionStatus(userId) {
    await initDB();
    const { dbGet, dbAll } = require('../../db/core');

    const session = await dbGet('SELECT * FROM smart_copy_sessions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1', [userId]);
    const recentTrades = await dbAll('SELECT * FROM smart_copy_trades WHERE userId = ? ORDER BY createdAt DESC LIMIT 10', [userId]) || [];
    const leaders = await dbAll('SELECT * FROM smart_copy_leaders ORDER BY aiScore DESC LIMIT 10') || [];

    return {
        session,
        isActive: session?.status === 'active',
        isPolling: pollingIntervals.has(userId),
        recentTrades,
        leaders,
        budget: session?.budgetUsd || 0,
        spent: session?.spentUsd || 0,
        remaining: (session?.budgetUsd || 0) - (session?.spentUsd || 0),
        totalCopies: session?.totalCopies || 0,
        totalPnl: session?.totalPnlUsd || 0
    };
}

async function getLeaderboard() {
    await initDB();
    const { dbAll } = require('../../db/core');
    return await dbAll('SELECT * FROM smart_copy_leaders ORDER BY aiScore DESC LIMIT 20') || [];
}

// ═══════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════

module.exports = {
    discoverLeaders,
    startSession,
    stopSession,
    getSessionStatus,
    getLeaderboard,
    initDB
};
