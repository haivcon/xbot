/**
 * AI Autonomous Trading Agent — LIVE
 * Signal-driven auto trading with AI risk scoring & approval workflow
 *
 * Flow: AI scans market → creates trade plans → user approves → executes → tracks PnL
 * Auto-stops when profit target is reached.
 */
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('TradingAgent');

// In-memory agent state (per-user)
const agentStates = new Map();

// #3 Concurrent execution guard — per-user mutex
const executionLocks = new Map();
async function withExecutionLock(userId, fn) {
    const startWait = Date.now();
    while (executionLocks.get(userId)) {
        if (Date.now() - startWait > 30000) throw new Error('Execution lock timeout — please try again');
        await new Promise(r => setTimeout(r, 200));
    }
    executionLocks.set(userId, true);
    try { return await fn(); } finally { executionLocks.delete(userId); }
}

// #8 chainId mapping — OKX chainIndex → actual EVM chainId
const CHAIN_ID_MAP = {
    '1': 1, '56': 56, '137': 137, '196': 196,
    '42161': 42161, '10': 10, '43114': 43114, '324': 324,
    '8453': 8453, '59144': 59144, '501': 501
};

// #9 Retry helper for swap broadcast
async function retryBroadcast(fn, retries = 3, delayMs = 2000) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try { return await fn(); } catch (err) {
            lastErr = err;
            if (i === retries - 1) throw err;
            log.warn(`Broadcast retry ${i + 1}/${retries}:`, err.message);
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
    throw lastErr; // unreachable, but satisfies lint
}

// Research result cache (tokenAddress -> { report, timestamp })
const researchCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Rate limiter: track research calls per user per minute
const rateLimiter = new Map();
const MAX_RESEARCH_PER_MIN = 3;

const RISK_PROFILES = {
    conservative: { minScore: 70, maxAmountUsd: 5, stopLoss: 20, takeProfit: 50 },
    moderate: { minScore: 55, maxAmountUsd: 15, stopLoss: 30, takeProfit: 100 },
    aggressive: { minScore: 40, maxAmountUsd: 50, stopLoss: 50, takeProfit: 200 }
};

const CHAIN_LABELS = {
    '196': 'XLayer', '1': 'Ethereum', '56': 'BSC', '501': 'Solana',
    '137': 'Polygon', '42161': 'Arbitrum', '10': 'Optimism', '43114': 'Avalanche'
};

let _dbInitialized = false;

/**
 * Initialize DB tables for auto trading (once)
 */
async function initDB() {
    if (_dbInitialized) return;
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`CREATE TABLE IF NOT EXISTS auto_trading_config (
            userId TEXT PRIMARY KEY,
            enabled INTEGER DEFAULT 0,
            riskLevel TEXT DEFAULT 'conservative',
            maxAmountUsd REAL DEFAULT 5,
            chains TEXT DEFAULT '196,1,56,501',
            stopLossPct REAL DEFAULT 20,
            takeProfitPct REAL DEFAULT 50,
            profitTargetPct REAL DEFAULT 25,
            totalBudgetUsd REAL DEFAULT 100,
            currentPnlUsd REAL DEFAULT 0,
            totalTrades INTEGER DEFAULT 0,
            totalPnlUsd REAL DEFAULT 0,
            pausedByUser INTEGER DEFAULT 0,
            autoApprove INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS auto_trading_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            tokenAddress TEXT NOT NULL,
            tokenSymbol TEXT,
            tokenName TEXT,
            tokenPrice REAL,
            chainIndex TEXT,
            chainLabel TEXT,
            action TEXT DEFAULT 'buy',
            suggestedAmountUsd REAL DEFAULT 5,
            aiScore INTEGER DEFAULT 0,
            aiReason TEXT,
            targetPct REAL DEFAULT 30,
            stopLossPct REAL DEFAULT 15,
            status TEXT DEFAULT 'pending',
            userNote TEXT,
            modifiedAmountUsd REAL,
            txHash TEXT,
            executedPrice REAL,
            currentPrice REAL,
            pnlUsd REAL DEFAULT 0,
            pnlPct REAL DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            executedAt TEXT,
            closedAt TEXT
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS auto_trading_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            tokenAddress TEXT,
            tokenSymbol TEXT,
            chainIndex TEXT,
            action TEXT,
            amount TEXT,
            researchScore INTEGER,
            txHash TEXT,
            pnlUsd REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        // Add missing columns if upgrading from old schema
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN profitTargetPct REAL DEFAULT 25'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN totalBudgetUsd REAL DEFAULT 100'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN currentPnlUsd REAL DEFAULT 0'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN pausedByUser INTEGER DEFAULT 0'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN autoApprove INTEGER DEFAULT 0'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_plans ADD COLUMN signalSource TEXT'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN walletId INTEGER'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN paperMode INTEGER DEFAULT 0'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN selectedTokens TEXT'); } catch {}
        try { await dbRun('ALTER TABLE auto_trading_config ADD COLUMN aiModel TEXT DEFAULT \'auto\''); } catch {}
        _dbInitialized = true;
    } catch (err) {
        log.error('initDB error:', err.message);
    }
}

/**
 * Check rate limit for research calls
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const key = userId;
    const timestamps = rateLimiter.get(key) || [];
    const recent = timestamps.filter(t => now - t < 60000);
    rateLimiter.set(key, recent);
    if (recent.length >= MAX_RESEARCH_PER_MIN) return false;
    recent.push(now);
    return true;
}

/**
 * Get cached research or run new research
 */
async function getCachedResearch(chainIndex, tokenAddress, options) {
    const cacheKey = `${chainIndex}:${tokenAddress}`;
    const cached = researchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.report;
    }

    const { deepResearch } = require('../skills/onchain/researchPipeline');
    const report = await deepResearch(chainIndex, tokenAddress, options);
    researchCache.set(cacheKey, { report, timestamp: Date.now() });

    for (const [k, v] of researchCache.entries()) {
        if (Date.now() - v.timestamp > CACHE_TTL_MS * 2) researchCache.delete(k);
    }

    return report;
}

// ═══════════════════════════════════════════════
// DASHBOARD API — Agent Management
// ═══════════════════════════════════════════════

/**
 * Enable AI Trading Agent
 */
async function enableAgent(userId, config = {}) {
    await initDB();
    const { dbRun, dbGet } = require('../../db/core');
    const profile = RISK_PROFILES[config.riskLevel] || RISK_PROFILES.conservative;
    const maxAmt = Math.max(0, Number(config.maxAmountUsd) || profile.maxAmountUsd);
    const chains = config.chains || '196,1,56,501';
    const sl = Math.max(0, Math.min(100, Number(config.stopLossPct) || profile.stopLoss));
    const tp = Math.max(0, Math.min(500, Number(config.takeProfitPct) || profile.takeProfit));
    const profitTarget = Math.max(0, Math.min(1000, Number(config.profitTargetPct) || 25));
    const totalBudget = Math.max(0, Number(config.totalBudgetUsd) || 100);
    const autoApprove = config.autoApprove ? 1 : 0;
    const riskLevel = config.riskLevel || 'conservative';

    // Bug #1 fix: Use UPDATE if exists, INSERT only for new users (preserves PnL/trades)
    const existing = await dbGet('SELECT userId FROM auto_trading_config WHERE userId = ?', [userId]);
    if (existing) {
        await dbRun(`UPDATE auto_trading_config SET 
            enabled = 1, riskLevel = ?, maxAmountUsd = ?, chains = ?, stopLossPct = ?, 
            takeProfitPct = ?, profitTargetPct = ?, totalBudgetUsd = ?, autoApprove = ?, 
            paperMode = ?, pausedByUser = 0, updatedAt = datetime('now') WHERE userId = ?`,
            [riskLevel, maxAmt, chains, sl, tp, profitTarget, totalBudget, autoApprove, config.paperMode ? 1 : 0, userId]);
        // Update walletId if provided
        if (config.walletId !== undefined) {
            await dbRun('UPDATE auto_trading_config SET walletId = ? WHERE userId = ?', [config.walletId || null, userId]);
        }
        // Save selectedTokens
        if (config.selectedTokens !== undefined) {
            await dbRun('UPDATE auto_trading_config SET selectedTokens = ? WHERE userId = ?', [config.selectedTokens || null, userId]);
        }
        // Save aiModel
        if (config.aiModel) {
            await dbRun('UPDATE auto_trading_config SET aiModel = ? WHERE userId = ?', [config.aiModel, userId]);
        }
    } else {
        await dbRun(`INSERT INTO auto_trading_config 
            (userId, enabled, riskLevel, maxAmountUsd, chains, stopLossPct, takeProfitPct, profitTargetPct, totalBudgetUsd, autoApprove, paperMode, pausedByUser, updatedAt) 
            VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
            [userId, riskLevel, maxAmt, chains, sl, tp, profitTarget, totalBudget, autoApprove, config.paperMode ? 1 : 0]);
    }

    // Start polling
    startSignalPolling(userId, {
        riskLevel, maxAmountUsd: maxAmt, chains, stopLoss: sl, takeProfit: tp
    }, { chatId: userId });

    return { success: true, config: { riskLevel, maxAmountUsd: maxAmt, chains, stopLossPct: sl, takeProfitPct: tp, profitTargetPct: profitTarget, totalBudgetUsd: totalBudget, autoApprove } };
}

/**
 * Disable AI Trading Agent
 */
async function disableAgent(userId) {
    await initDB();
    const { dbRun } = require('../../db/core');
    await dbRun("UPDATE auto_trading_config SET enabled = 0, updatedAt = datetime('now') WHERE userId = ?", [userId]);
    stopSignalPolling(userId);
    // Issue #6: Clean per-user rate limiter entries
    rateLimiter.delete(userId);
    return { success: true };
}

/**
 * Pause/Resume AI Trading Agent
 */
async function pauseAgent(userId, pause = true) {
    await initDB();
    const { dbRun } = require('../../db/core');
    await dbRun("UPDATE auto_trading_config SET pausedByUser = ?, updatedAt = datetime('now') WHERE userId = ?", [pause ? 1 : 0, userId]);
    if (pause) {
        stopSignalPolling(userId);
    } else {
        const config = await getAgentConfig(userId);
        if (config && config.enabled) {
            startSignalPolling(userId, config, { chatId: userId });
        }
    }
    return { success: true, paused: pause };
}

/**
 * Get agent config
 */
async function getAgentConfig(userId) {
    await initDB();
    const { dbGet } = require('../../db/core');
    return await dbGet('SELECT * FROM auto_trading_config WHERE userId = ?', [userId]);
}

/**
 * Get agent status with PnL summary
 */
async function getAgentStatus(userId) {
    await initDB();
    const { dbGet, dbAll } = require('../../db/core');
    const config = await dbGet('SELECT * FROM auto_trading_config WHERE userId = ?', [userId]);
    if (!config) return { enabled: false, configured: false };

    const pendingPlans = await dbAll(
        "SELECT COUNT(*) as count FROM auto_trading_plans WHERE userId = ? AND status = 'pending'",
        [userId]
    );
    const executedPlans = await dbAll(
        "SELECT COUNT(*) as count, COALESCE(SUM(pnlUsd), 0) as totalPnl FROM auto_trading_plans WHERE userId = ? AND status IN ('executed', 'closed')",
        [userId]
    );
    const recentPlans = await dbAll(
        "SELECT * FROM auto_trading_plans WHERE userId = ? ORDER BY createdAt DESC LIMIT 5",
        [userId]
    );

    const isPolling = agentStates.has(userId);

    return {
        configured: true,
        enabled: Boolean(config.enabled),
        paused: Boolean(config.pausedByUser),
        isPolling,
        riskLevel: config.riskLevel,
        maxAmountUsd: config.maxAmountUsd,
        chains: config.chains,
        chainLabels: (config.chains || '').split(',').map(c => CHAIN_LABELS[c.trim()] || c.trim()),
        stopLossPct: config.stopLossPct,
        takeProfitPct: config.takeProfitPct,
        profitTargetPct: config.profitTargetPct || 25,
        totalBudgetUsd: config.totalBudgetUsd || 100,
        autoApprove: Boolean(config.autoApprove),
        aiModel: config.aiModel || 'auto',
        totalTrades: config.totalTrades || 0,
        totalPnlUsd: Number(config.totalPnlUsd || 0),
        currentPnlUsd: Number(config.currentPnlUsd || 0),
        pendingPlans: pendingPlans?.[0]?.count || 0,
        executedTrades: executedPlans?.[0]?.count || 0,
        executedPnlUsd: Number(executedPlans?.[0]?.totalPnl || 0),
        recentPlans: recentPlans || [],
        profitProgress: config.profitTargetPct > 0
            ? Math.min(100, Math.round((Number(config.currentPnlUsd || 0) / (Number(config.totalBudgetUsd || 100) * (config.profitTargetPct || 25) / 100)) * 100))
            : 0,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
    };
}

// ═══════════════════════════════════════════════
// TRADE PLANS — Create, List, Approve, Reject
// ═══════════════════════════════════════════════

/**
 * Get pending trade plans
 */
async function getPendingPlans(userId) {
    await initDB();
    const { dbAll } = require('../../db/core');
    return await dbAll(
        "SELECT * FROM auto_trading_plans WHERE userId = ? AND status = 'pending' ORDER BY createdAt DESC",
        [userId]
    ) || [];
}

/**
 * Get all trade plans (with optional status filter)
 */
async function getTradePlans(userId, status = null, limit = 20) {
    await initDB();
    const { dbAll } = require('../../db/core');
    if (status) {
        return await dbAll(
            "SELECT * FROM auto_trading_plans WHERE userId = ? AND status = ? ORDER BY createdAt DESC LIMIT ?",
            [userId, status, limit]
        ) || [];
    }
    return await dbAll(
        "SELECT * FROM auto_trading_plans WHERE userId = ? ORDER BY createdAt DESC LIMIT ?",
        [userId, limit]
    ) || [];
}

/**
 * Create a trade plan (called by signal polling)
 */
async function createTradePlan(userId, planData) {
    // #7 Wrap budget check + insert in execution lock to prevent race conditions
    // when 2 signals arrive simultaneously and both pass the budget check
    return withExecutionLock(userId, async () => {
    await initDB();
    const { dbRun, dbGet } = require('../../db/core');

    // Bug #2: Check budget before creating new plans
    const agentConfig = await dbGet('SELECT totalBudgetUsd, totalTrades FROM auto_trading_config WHERE userId = ?', [userId]);
    if (agentConfig) {
        const { dbGet: dbGet2 } = require('../../db/core');
        const spent = await dbGet2(
            "SELECT COALESCE(SUM(COALESCE(modifiedAmountUsd, suggestedAmountUsd)), 0) as totalSpent FROM auto_trading_plans WHERE userId = ? AND status IN ('approved', 'executed', 'pending')",
            [userId]
        );
        const totalSpent = Number(spent?.totalSpent || 0);
        const suggestedAmt = Number(planData.suggestedAmountUsd) || 5;
        if (totalSpent + suggestedAmt > Number(agentConfig.totalBudgetUsd || 100)) {
            return { created: false, reason: 'budget_exhausted', spent: totalSpent, budget: agentConfig.totalBudgetUsd };
        }
    }

    // Check if similar plan already exists (same token, pending)
    const existing = await dbGet(
        "SELECT id FROM auto_trading_plans WHERE userId = ? AND tokenAddress = ? AND status = 'pending'",
        [userId, planData.tokenAddress]
    );
    if (existing) return { created: false, reason: 'duplicate', existingId: existing.id };

    const result = await dbRun(
        `INSERT INTO auto_trading_plans 
        (userId, tokenAddress, tokenSymbol, tokenName, tokenPrice, chainIndex, chainLabel, action, suggestedAmountUsd, aiScore, aiReason, targetPct, stopLossPct, signalSource, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
            userId,
            planData.tokenAddress,
            planData.tokenSymbol || 'UNKNOWN',
            planData.tokenName || '',
            planData.tokenPrice || 0,
            planData.chainIndex || '196',
            CHAIN_LABELS[planData.chainIndex] || planData.chainIndex || 'Unknown',
            planData.action || 'buy',
            planData.suggestedAmountUsd || 5,
            planData.aiScore || 0,
            planData.aiReason || '',
            planData.targetPct || 30,
            planData.stopLossPct || 15,
            planData.signalSource || 'whale'
        ]
    );

    const planId = result?.lastID;
    log.info(`Created trade plan #${planId} for user ${userId}: ${planData.tokenSymbol} on chain ${planData.chainIndex}`);

    // Check if auto-approve is enabled
    const config = await dbGet('SELECT autoApprove FROM auto_trading_config WHERE userId = ?', [userId]);
    if (config?.autoApprove && planId) {
        log.info(`Auto-approving plan #${planId} for user ${userId}`);
        await approvePlan(userId, planId);
    }

    return { created: true, planId };
    }); // end withExecutionLock
}

/**
 * Approve a trade plan
 */
async function approvePlan(userId, planId, modifiedAmount = null) {
    await initDB();
    const { dbRun, dbGet } = require('../../db/core');

    const plan = await dbGet(
        "SELECT * FROM auto_trading_plans WHERE id = ? AND userId = ? AND status = 'pending'",
        [planId, userId]
    );
    if (!plan) return { success: false, error: 'Plan not found or already processed' };

    const amount = modifiedAmount || plan.suggestedAmountUsd;

    // Mark as approved→execute
    await dbRun(
        "UPDATE auto_trading_plans SET status = 'approved', modifiedAmountUsd = ?, updatedAt = datetime('now') WHERE id = ?",
        [amount, planId]
    );

    // #12 DCA routing for large orders (>$50)
    if (amount > 50) {
        try {
            const { startVwapExecution } = require('./smartOrderExecutor');
            const vwapResult = startVwapExecution({
                userId, planId, chainIndex: plan.chainIndex || '196',
                tokenAddress: plan.tokenAddress, tokenSymbol: plan.tokenSymbol,
                totalAmountUsd: amount, chunks: Math.ceil(amount / 25), intervalMs: 60000,
                action: plan.action || 'buy'
            });
            if (vwapResult?.success) {
                log.info(`Plan #${planId} routed to VWAP: ${vwapResult.chunks} chunks`);
                return { success: true, planId, amount, executionType: 'vwap', chunks: vwapResult.chunks };
            }
        } catch (vwapErr) {
            log.warn(`VWAP routing failed for plan #${planId}:`, vwapErr.message);
            // Fall through to standard execution
        }
    }

    // Execute the trade
    try {
        await executeTradePlan(userId, planId);
    } catch (err) {
        log.error(`Failed to execute plan #${planId}:`, err.message);
        // executeTradePlan already marks plan as 'failed', just return error
        return { success: false, error: 'Execution failed: ' + err.message };
    }

    return { success: true, planId, amount };
}

/**
 * Reject a trade plan
 */
async function rejectPlan(userId, planId, reason = '') {
    await initDB();
    const { dbRun, dbGet } = require('../../db/core');

    const plan = await dbGet(
        "SELECT * FROM auto_trading_plans WHERE id = ? AND userId = ? AND status = 'pending'",
        [planId, userId]
    );
    if (!plan) return { success: false, error: 'Plan not found or already processed' };

    await dbRun(
        "UPDATE auto_trading_plans SET status = 'rejected', userNote = ?, updatedAt = datetime('now') WHERE id = ?",
        [reason || 'User rejected', planId]
    );

    return { success: true, planId };
}

/**
 * Execute a trade plan — REAL on-chain swap via OKX DEX aggregator
 * Improvements: #1 balance check, #2 actual balance sell, #3 mutex,
 * #7 gas estimation, #8 chainId map, #9 retry, #10 paper mode, #13 guardian
 */
async function executeTradePlan(userId, planId) {
    // #3 Mutex — prevent concurrent execution per user
    return withExecutionLock(userId, async () => {
        const { dbRun, dbGet } = require('../../db/core');
        const plan = await dbGet('SELECT * FROM auto_trading_plans WHERE id = ? AND userId = ?', [planId, userId]);
        if (!plan) throw new Error('Plan not found');

        const amountUsd = Number(plan.modifiedAmountUsd || plan.suggestedAmountUsd || 5);
        const chainIndex = plan.chainIndex || '196';
        let txHash = null;
        let executedPrice = plan.tokenPrice || 0;

        // #10 Paper trading mode — simulate without real swap
        const config = await dbGet('SELECT * FROM auto_trading_config WHERE userId = ?', [userId]);
        if (config?.paperMode) {
            txHash = `0xpaper_${Date.now().toString(36)}_${planId}`;
            log.info(`[PAPER] Simulated trade plan #${planId}: ${plan.action} ${plan.tokenSymbol} $${amountUsd}`);
        } else {
            // REAL execution
            try {
                const tw = config?.walletId
                    ? await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [config.walletId, userId])
                    : await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);

                if (!tw) throw new Error('No trading wallet found. Create a wallet first.');
                if (!global._decryptTradingKey) throw new Error('Decryption system not ready.');

                const privateKey = global._decryptTradingKey(tw.encryptedKey);
                const ethers = require('ethers');
                const { _getChainRpc } = require('./ai/onchain/helpers');
                const rpcUrl = _getChainRpc(chainIndex);
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const wallet = new ethers.Wallet(privateKey, provider);
                // #8 Use correct EVM chain ID
                const chainIdNum = CHAIN_ID_MAP[chainIndex] || parseInt(chainIndex);

                const nativeToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                const fromTokenAddress = plan.action === 'buy' ? nativeToken : plan.tokenAddress;
                const toTokenAddress = plan.action === 'buy' ? plan.tokenAddress : nativeToken;

                // #13 Wallet Guardian pre-swap safety check
                try {
                    const { preSwapCheck } = require('./walletGuardian');
                    const safety = await preSwapCheck(plan.tokenAddress, {
                        advancedInfoFn: async (addr) => {
                            const info = await onchainos.getTokenAdvancedInfo(chainIndex, addr);
                            return info || {};
                        }
                    });
                    if (!safety.safe && safety.highestSeverity === 'CRITICAL') {
                        throw new Error(`Guardian blocked: ${safety.risks.map(r => r.detail).join(', ')}`);
                    }
                    if (!safety.safe) {
                        log.warn(`[GUARDIAN] Risks detected for ${plan.tokenSymbol}: ${safety.risks.map(r => r.detail).join(', ')}`);
                    }
                } catch (guardErr) {
                    if (guardErr.message.startsWith('Guardian blocked')) throw guardErr;
                    log.warn(`[GUARDIAN] Check skipped:`, guardErr.message);
                }

                // #7 Get gas price from provider
                let gasPrice;
                try {
                    const feeData = await provider.getFeeData();
                    gasPrice = feeData.gasPrice || BigInt('1000000000');
                } catch { gasPrice = BigInt('1000000000'); }

                // Calculate swap amount
                let swapAmount;
                if (plan.action === 'buy') {
                    const priceData = await onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: nativeToken }]);
                    const nativePrice = Number(priceData?.[0]?.price || 0);
                    if (nativePrice <= 0) throw new Error('Cannot fetch native token price');
                    const nativeAmount = amountUsd / nativePrice;

                    // #1 Balance pre-check
                    const balance = await provider.getBalance(tw.address);
                    const requiredWei = ethers.parseEther(nativeAmount.toFixed(8));
                    if (balance < requiredWei) {
                        const balStr = ethers.formatEther(balance);
                        throw new Error(`Insufficient balance: have ${balStr}, need ${nativeAmount.toFixed(8)} native tokens ($${amountUsd})`);
                    }

                    swapAmount = requiredWei.toString();
                } else {
                    // #2 Sell with actual on-chain balance
                    const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: plan.tokenAddress }]);
                    const decimals = Number(basicInfo?.[0]?.decimal || 18);
                    const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
                    const tokenContract = new ethers.Contract(plan.tokenAddress, erc20Abi, provider);
                    let onChainBalance;
                    try { onChainBalance = await tokenContract.balanceOf(tw.address); } catch { onChainBalance = 0n; }

                    if (onChainBalance <= 0n) throw new Error('No token balance to sell');

                    // Use actual balance (sell all) or calculated amount, whichever is smaller
                    const tokenPrice = Number(basicInfo?.[0]?.tokenPrice || executedPrice);
                    const targetTokenAmount = amountUsd / (tokenPrice || 1);
                    const targetWei = ethers.parseUnits(targetTokenAmount.toFixed(Math.min(decimals, 8)), decimals);
                    swapAmount = (targetWei < onChainBalance ? targetWei : onChainBalance).toString();
                }

                log.info(`[SWAP] user=${userId} plan=${planId} ${plan.action} ${plan.tokenSymbol} $${amountUsd} chain=${chainIndex}`);

                // ERC-20 approval (skip for native)
                const isNativeFrom = fromTokenAddress.toLowerCase() === nativeToken;
                if (!isNativeFrom) {
                    try {
                        const approveData = await onchainos.getApproveTransaction(chainIndex, fromTokenAddress, swapAmount);
                        if (approveData?.[0]?.dexContractAddress) {
                            const approval = approveData[0];
                            const erc20Abi2 = ['function allowance(address,address) view returns (uint256)'];
                            const tokenContract2 = new ethers.Contract(fromTokenAddress, erc20Abi2, provider);
                            let allowance = 0n;
                            try { allowance = await tokenContract2.allowance(tw.address, approval.dexContractAddress); } catch {}

                            if (allowance < BigInt(swapAmount)) {
                                const iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
                                const approveCalldata = iface.encodeFunctionData('approve', [approval.dexContractAddress, ethers.MaxUint256]);
                                const approveTx = await wallet.signTransaction({
                                    to: fromTokenAddress, data: approveCalldata, value: 0n,
                                    gasLimit: BigInt(approval.gasLimit || '150000'),
                                    gasPrice,
                                    nonce: await provider.getTransactionCount(wallet.address, 'pending'),
                                    chainId: chainIdNum
                                });
                                // #9 Retry broadcast
                                await retryBroadcast(() => onchainos.broadcastTransaction(approveTx, chainIndex, tw.address));
                                await new Promise(r => setTimeout(r, 8000)); // Wait for approval to confirm + nonce to increment
                            }
                        }
                    } catch (approveErr) {
                        log.warn(`[SWAP] Approve error:`, approveErr.message);
                        throw new Error('Token approval failed: ' + approveErr.message);
                    }
                }

                // Get swap quote for dynamic slippage
                const quoteData = await onchainos.getSwapQuote({ chainIndex, fromTokenAddress, toTokenAddress, amount: swapAmount });
                const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
                let slippage = 5;
                if (quote?.routerResult?.priceImpactPercentage) {
                    slippage = Math.max(3, Math.ceil(Number(quote.routerResult.priceImpactPercentage) + 2));
                }
                slippage = Math.min(50, slippage);

                // Get swap tx data
                const txData = await onchainos.getSwapTransaction({
                    chainIndex, fromTokenAddress, toTokenAddress, amount: swapAmount,
                    userWalletAddress: tw.address, slippagePercent: String(slippage)
                });
                const txRaw = Array.isArray(txData) ? txData[0] : txData;
                if (!txRaw?.tx) throw new Error('No swap transaction data returned');

                // #7 Gas estimation
                const tx = txRaw.tx;
                let gasLimit;
                try {
                    const estimated = await provider.estimateGas({
                        from: tw.address, to: tx.to, data: tx.data, value: BigInt(tx.value || '0')
                    });
                    gasLimit = estimated * 130n / 100n; // 30% buffer
                } catch {
                    gasLimit = BigInt(tx.gas || tx.gasLimit || '300000');
                }

                // Sign and broadcast with #9 retry
                const signedTx = await wallet.signTransaction({
                    to: tx.to, data: tx.data, value: BigInt(tx.value || '0'),
                    gasLimit, gasPrice,
                    nonce: await provider.getTransactionCount(wallet.address, 'pending'),
                    chainId: chainIdNum
                });
                const broadcastResult = await retryBroadcast(() => onchainos.broadcastTransaction(signedTx, chainIndex, tw.address));
                const result = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
                txHash = result?.txHash || result?.orderId || 'pending';

                // Wait for receipt
                if (txHash && txHash !== 'pending') {
                    try {
                        const receipt = await provider.waitForTransaction(txHash, 1, 30000);
                        if (receipt?.status === 0) throw new Error('Transaction reverted on-chain');
                        log.info(`[SWAP] ✅ Confirmed: ${txHash}`);
                    } catch (receiptErr) {
                        if (receiptErr.message.includes('reverted')) throw receiptErr;
                        log.warn(`[SWAP] Receipt timeout:`, receiptErr.message);
                    }
                }

                if (txRaw.routerResult?.toToken?.tokenUnitPrice) {
                    executedPrice = Number(txRaw.routerResult.toToken.tokenUnitPrice);
                }

            } catch (swapErr) {
                log.error(`[SWAP] Failed plan #${planId}:`, swapErr.message);
                await dbRun(
                    "UPDATE auto_trading_plans SET status = 'failed', userNote = ?, updatedAt = datetime('now') WHERE id = ?",
                    [`Swap error: ${swapErr.message}`, planId]
                );
                // #5 Telegram notification on failure
                notifyUserTelegram(userId, `❌ <b>Trade Failed</b>\n${plan.tokenSymbol} $${amountUsd}\n<i>${swapErr.message}</i>`);
                throw swapErr;
            }
        }

        // Update plan as executed
        await dbRun(
            `UPDATE auto_trading_plans SET 
                status = 'executed', txHash = ?, executedPrice = ?,
                executedAt = datetime('now'), updatedAt = datetime('now')
            WHERE id = ?`,
            [txHash, executedPrice, planId]
        );
        await dbRun("UPDATE auto_trading_config SET totalTrades = totalTrades + 1, updatedAt = datetime('now') WHERE userId = ?", [userId]);
        await dbRun(
            'INSERT INTO auto_trading_log (userId, tokenAddress, tokenSymbol, chainIndex, action, amount, researchScore, txHash, status) VALUES (?,?,?,?,?,?,?,?,?)',
            [userId, plan.tokenAddress, plan.tokenSymbol, chainIndex, plan.action, amountUsd, plan.aiScore, txHash, 'executed']
        );

        // Open position in Triple Barrier engine
        try {
            const engine = require('./tradeExecutionEngine');
            await engine.openPosition(userId, { ...plan, txHash }, {
                stopLossPct: plan.stopLossPct || config?.stopLossPct || 15,
                takeProfitPct: plan.targetPct || config?.takeProfitPct || 30,
                trailingStopEnabled: true, trailingStopActivation: 5, trailingStopDelta: 2, timeLimitHours: 48,
            });
        } catch (engineErr) { log.warn(`Engine position open failed for plan #${planId}:`, engineErr.message); }

        // #5 Telegram notification on success
        const mode = config?.paperMode ? '📝 PAPER' : '💰 LIVE';
        notifyUserTelegram(userId, `✅ <b>${mode} Trade Executed</b>\n${plan.action.toUpperCase()} ${plan.tokenSymbol} $${amountUsd}\nTx: <code>${txHash?.slice(0, 18)}...</code>`);

        log.info(`[SWAP] ✅ Plan #${planId}: ${plan.action} ${plan.tokenSymbol} $${amountUsd} tx=${txHash}`);
    });
}

/**
 * #5 Telegram notification helper
 */
let _notifyBot = null;
function notifyUserTelegram(userId, htmlMessage) {
    try {
        if (!_notifyBot) {
            const { Telegraf } = require('telegraf');
            const botToken = process.env.BOT_TOKEN;
            if (!botToken) return;
            _notifyBot = new Telegraf(botToken);
        }
        _notifyBot.telegram.sendMessage(userId, htmlMessage, { parse_mode: 'HTML', disable_web_page_preview: true })
            .catch(err => log.warn(`Telegram notify error:`, err.message));
    } catch (err) { log.warn(`Telegram notify setup error:`, err.message); }
}

/**
 * #11 Trade history CSV export
 */
async function exportTradeHistory(userId) {
    await initDB();
    const { dbAll } = require('../../db/core');
    const plans = await dbAll(
        "SELECT * FROM auto_trading_plans WHERE userId = ? ORDER BY createdAt DESC",
        [userId]
    ) || [];
    if (plans.length === 0) return { csv: '', count: 0 };

    const sanitize = (v) => String(v ?? '').replace(/[\r\n,]/g, ' ').replace(/^[=+\-@]/, "'");
    const header = 'Date,Token,Action,Amount USD,AI Score,Status,Entry Price,Current Price,PnL USD,PnL %,Tx Hash\n';
    const rows = plans.map(p => {
        const date = sanitize(p.executedAt || p.createdAt || '');
        return `${date},${sanitize(p.tokenSymbol)},${sanitize(p.action)},${sanitize(p.modifiedAmountUsd || p.suggestedAmountUsd)},${sanitize(p.aiScore)},${sanitize(p.status)},${sanitize(p.executedPrice || p.tokenPrice)},${sanitize(p.currentPrice)},${p.pnlUsd || 0},${p.pnlPct || 0},${sanitize(p.txHash)}`;
    }).join('\n');
    return { csv: header + rows, count: plans.length };
}

/**
 * Update config
 */
async function updateAgentConfig(userId, updates) {
    await initDB();
    const { dbRun } = require('../../db/core');
    const allowed = ['riskLevel', 'maxAmountUsd', 'chains', 'stopLossPct', 'takeProfitPct', 'profitTargetPct', 'totalBudgetUsd', 'autoApprove', 'walletId', 'paperMode', 'selectedTokens', 'aiModel'];
    const numericFields = ['maxAmountUsd', 'stopLossPct', 'takeProfitPct', 'profitTargetPct', 'totalBudgetUsd'];
    const setClauses = [];
    const params = [];
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            let val = updates[key];
            // Bug #4: Validate numeric fields — reject NaN and negative values
            if (numericFields.includes(key)) {
                val = Number(val);
                if (isNaN(val) || val < 0) continue;
            }
            if (key === 'riskLevel' && !RISK_PROFILES[val]) continue; // invalid risk level
            setClauses.push(`${key} = ?`);
            params.push(key === 'autoApprove' ? (val ? 1 : 0) : val);
        }
    }
    if (setClauses.length === 0) return { success: false, error: 'No valid fields' };
    setClauses.push("updatedAt = datetime('now')");
    params.push(userId);
    await dbRun(`UPDATE auto_trading_config SET ${setClauses.join(', ')} WHERE userId = ?`, params);
    return { success: true };
}

// ═══════════════════════════════════════════════
// SIGNAL POLLING ENGINE
// ═══════════════════════════════════════════════

/**
 * Signal polling engine — creates trade plans instead of direct notifications
 */
function startSignalPolling(userId, config, minimalContext) {
    stopSignalPolling(userId);

    const chatId = minimalContext?.chatId || userId;

    // Issue #7: Run first scan immediately, then every 90s
    const runScan = async () => {
        try {
            const { dbGet } = require('../../db/core');
            const dbConfig = await dbGet('SELECT * FROM auto_trading_config WHERE userId = ? AND enabled = 1 AND pausedByUser = 0', [userId]);
            if (!dbConfig) { stopSignalPolling(userId); return; }

            // Check if profit target reached → auto-stop
            if (dbConfig.profitTargetPct > 0 && dbConfig.totalBudgetUsd > 0) {
                const targetUsd = dbConfig.totalBudgetUsd * (dbConfig.profitTargetPct / 100);
                if (Number(dbConfig.currentPnlUsd || 0) >= targetUsd) {
                    log.info(`User ${userId} reached profit target ($${dbConfig.currentPnlUsd} >= $${targetUsd}) — auto-stopping agent`);
                    await disableAgent(userId);
                    return;
                }
            }

            const chains = (dbConfig.chains || '196').split(',');
            for (const chain of chains) {
                try {
                    const signals = await onchainos.getSignalList(chain.trim(), { walletType: '4' });
                    const allSignals = Array.isArray(signals) ? signals : [];

                    // ★ FIX: Filter signals by user's selectedTokens
                    const selectedTokenFilter = dbConfig.selectedTokens ? dbConfig.selectedTokens.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
                    const filteredSignals = selectedTokenFilter.length > 0
                        ? allSignals.filter(s => selectedTokenFilter.includes((s.tokenSymbol || '').toUpperCase()))
                        : allSignals;
                    if (selectedTokenFilter.length > 0 && filteredSignals.length === 0) {
                        log.info(`[${userId}] No signals matched selectedTokens: ${selectedTokenFilter.join(',')} on chain ${chain}`);
                    }

                    for (const signal of filteredSignals.slice(0, 3)) {
                        const tokenAddr = signal.tokenContractAddress;
                        if (!tokenAddr) continue;

                        if (!checkRateLimit(userId)) {
                            log.info(`Rate limit hit for user ${userId}, skipping remaining signals`);
                            break;
                        }

                        const recent = await dbGet(
                            "SELECT * FROM auto_trading_log WHERE userId = ? AND tokenAddress = ? AND createdAt > datetime('now', '-2 hours')",
                            [userId, tokenAddr]
                        );
                        if (recent) continue;

                        // Run deep research
                        let report;
                        try {
                            report = await getCachedResearch(chain.trim(), tokenAddr, { lang: 'en' });
                        } catch (researchErr) {
                            log.warn(`Research failed for ${tokenAddr}:`, researchErr.message);
                            continue;
                        }

                        const riskProfile = RISK_PROFILES[dbConfig.riskLevel] || RISK_PROFILES.conservative;
                        if (report.scores?.overall >= riskProfile.minScore && report.scores?.safety >= 40) {
                            const reasons = [];
                            const signalSources = ['whale'];
                            if (report.scores.overall >= 70) reasons.push('High AI score');
                            if (report.whaleActivity) reasons.push('Whale accumulation detected');
                            if (report.smartMoneyBuys > 0) reasons.push(`${report.smartMoneyBuys} Smart Money buys`);
                            if (report.liquidityOk) reasons.push('Liquidity OK');
                            if (report.scores.safety >= 60) reasons.push('Good safety score');

                            // Technical signal boost (Phase 2)
                            let techBoost = 0;
                            try {
                                const techSignals = require('./technicalSignals');
                                const analysis = await techSignals.analyzeToken(chain.trim(), tokenAddr, '1H');
                                if (analysis && analysis.score > 0) {
                                    for (const s of (analysis.signals || [])) {
                                        if (s.signal === 1) {
                                            signalSources.push(s.type);
                                            reasons.push(`${s.label}: ${s.reason}`);
                                        }
                                    }
                                    // Boost score by up to 15 based on tech signal score
                                    if (analysis.score > 50) {
                                        techBoost = Math.min(15, Math.round((analysis.score - 50) / 50 * 15));
                                    }
                                }
                            } catch (techErr) {
                                log.warn(`Tech signals failed for ${tokenAddr}:`, techErr.message);
                            }

                            const finalScore = Math.min(100, report.scores.overall + techBoost);

                            await createTradePlan(userId, {
                                tokenAddress: tokenAddr,
                                tokenSymbol: report.symbol || signal.tokenSymbol || 'UNKNOWN',
                                tokenName: report.name || signal.tokenName || '',
                                tokenPrice: report.priceUsd || signal.priceUsd || 0,
                                chainIndex: chain.trim(),
                                action: 'buy',
                                suggestedAmountUsd: Math.min(riskProfile.maxAmountUsd, dbConfig.maxAmountUsd),
                                aiScore: finalScore,
                                aiReason: reasons.join(' • ') || 'Signal detected',
                                targetPct: dbConfig.takeProfitPct || 30,
                                stopLossPct: dbConfig.stopLossPct || 15,
                                signalSource: signalSources.join(',')
                            });
                        }
                    }
                } catch (chainErr) {
                    log.warn(`Signal poll error for chain ${chain}:`, chainErr.message);
                }
            }

            // #6 MemeRadar signal integration
            try {
                const { memeRadar } = require('./memeRadar');
                const candidates = memeRadar.getSnipeCandidates({ minScore: 60, minLiquidity: 5000, maxMarketCap: 500000 });
                for (const token of candidates.slice(0, 2)) {
                    const tokenAddr = token.address;
                    if (!tokenAddr || !checkRateLimit(userId)) continue;
                    const recent = await dbGet(
                        "SELECT * FROM auto_trading_log WHERE userId = ? AND tokenAddress = ? AND createdAt > datetime('now', '-2 hours')",
                        [userId, tokenAddr]
                    );
                    if (recent) continue;

                    const riskProfile = RISK_PROFILES[dbConfig.riskLevel] || RISK_PROFILES.conservative;
                    if (token.riskScore >= riskProfile.minScore) {
                        await createTradePlan(userId, {
                            tokenAddress: tokenAddr,
                            tokenSymbol: token.symbol || 'MEME',
                            tokenName: token.name || '',
                            tokenPrice: token.priceUsd || 0,
                            chainIndex: token.chainIndex || '196',
                            action: 'buy',
                            suggestedAmountUsd: Math.min(riskProfile.maxAmountUsd, dbConfig.maxAmountUsd),
                            aiScore: token.riskScore,
                            aiReason: `MemeRadar: ${token.risk?.label || 'OK'} • Score ${token.riskScore}`,
                            targetPct: dbConfig.takeProfitPct || 30,
                            stopLossPct: dbConfig.stopLossPct || 15,
                            signalSource: 'meme_radar'
                        });
                    }
                }
            } catch (memeErr) {
                log.warn(`MemeRadar scan error:`, memeErr.message);
            }
            // ── Paper Mode: generate demo trade plans with diverse tokens ──
            if (dbConfig.paperMode) {
                const { dbAll: dbAllPlans } = require('../../db/core');
                const recentPlans = await dbAllPlans(
                    "SELECT id FROM auto_trading_plans WHERE userId = ? AND createdAt > datetime('now', '-2 minutes')",
                    [userId]
                ) || [];
                if (recentPlans.length === 0) {
                    const userChains = (dbConfig.chains || '196').split(',').map(c => c.trim());
                    // ── Comprehensive token pool per chain ──
                    const TOKEN_POOL = {
                        '196': [ // XLayer (cleaned — matches frontend)
                            { symbol: 'WOKB', name: 'Wrapped OKB', addr: '0x7c6b91D9Be155A6Db01f749217d76fF02A7227F2', price: 42.5 },
                            { symbol: 'USDT', name: 'Tether USD', addr: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', price: 1.00 },
                            { symbol: 'WETH', name: 'Wrapped ETH', addr: '0xe538905cf8410324e03a5a23c1c177a474d59b2b', price: 3450.0 },
                            { symbol: 'OKB', name: 'OKB Token', addr: '0xd2637562F0e81cf5Ba4F5D9e1A30BcD0a3FBCeF1', price: 48.3 },
                            { symbol: 'USDC', name: 'USD Coin', addr: '0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035', price: 1.00 },
                        ],
                        '1': [ // Ethereum
                            { symbol: 'WBTC', name: 'Wrapped BTC', addr: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', price: 87200.0 },
                            { symbol: 'UNI', name: 'Uniswap', addr: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', price: 14.2 },
                            { symbol: 'LINK', name: 'Chainlink', addr: '0x514910771AF9Ca656af840dff83E8264EcF986CA', price: 18.5 },
                            { symbol: 'AAVE', name: 'Aave', addr: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', price: 285.0 },
                            { symbol: 'PEPE', name: 'Pepe', addr: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', price: 0.0000089 },
                            { symbol: 'SHIB', name: 'Shiba Inu', addr: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', price: 0.0000245 },
                        ],
                        '56': [ // BSC
                            { symbol: 'CAKE', name: 'PancakeSwap', addr: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', price: 2.85 },
                            { symbol: 'XVS', name: 'Venus', addr: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63', price: 8.9 },
                            { symbol: 'BAKE', name: 'BakeryToken', addr: '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5', price: 0.28 },
                        ],
                        '501': [ // Solana
                            { symbol: 'JUP', name: 'Jupiter', addr: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', price: 1.05 },
                            { symbol: 'RAY', name: 'Raydium', addr: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', price: 4.2 },
                            { symbol: 'BONK', name: 'Bonk', addr: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', price: 0.0000298 },
                        ],
                        '137': [ // Polygon
                            { symbol: 'MATIC', name: 'Polygon', addr: '0x0000000000000000000000000000000000001010', price: 0.52 },
                            { symbol: 'QUICK', name: 'QuickSwap', addr: '0xB5C064F955D8e7F38fE0460C556a72987494eE17', price: 0.048 },
                        ],
                        '42161': [ // Arbitrum
                            { symbol: 'ARB', name: 'Arbitrum', addr: '0x912CE59144191C1D03E6191e9C48aEcAe7A6cB7d', price: 1.15 },
                            { symbol: 'GMX', name: 'GMX', addr: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', price: 28.5 },
                            { symbol: 'MAGIC', name: 'Magic', addr: '0x539bdE0d7Dbd336b79148AA742883198BBF60342', price: 0.62 },
                        ],
                    };

                    // Try to fetch live trending tokens from OKX API
                    let liveTokens = [];
                    try {
                        for (const chain of userChains.slice(0, 2)) {
                            const topTokens = await onchainos.getTopTokens?.(chain, { sortBy: '2', timeFrame: '4' });
                            if (Array.isArray(topTokens)) {
                                for (const t of topTokens.slice(0, 5)) {
                                    if (t.tokenContractAddress && t.tokenSymbol) {
                                        liveTokens.push({
                                            symbol: t.tokenSymbol,
                                            name: t.tokenName || t.tokenSymbol,
                                            addr: t.tokenContractAddress,
                                            price: Number(t.price || t.priceUsd) || 0.01,
                                            chain,
                                        });
                                    }
                                }
                            }
                        }
                    } catch { /* API might not be available */ }

                    // Build candidate pool from user's selected chains
                    let candidates = [];
                    for (const chain of userChains) {
                        const pool = TOKEN_POOL[chain] || [];
                        candidates.push(...pool.map(t => ({ ...t, chain })));
                    }
                    // Prepend live tokens (higher priority)
                    if (liveTokens.length > 0) candidates = [...liveTokens, ...candidates];
                    if (candidates.length === 0) candidates = TOKEN_POOL['196'].map(t => ({ ...t, chain: '196' }));

                    // Pick 1-2 random tokens (avoid duplicates with recent plans)
                    const recentAddrs = new Set();
                    try {
                        const recent24h = await dbAllPlans(
                            "SELECT tokenAddress FROM auto_trading_plans WHERE userId = ? AND createdAt > datetime('now', '-1 hour')",
                            [userId]
                        ) || [];
                        recent24h.forEach(r => recentAddrs.add(r.tokenAddress));
                    } catch {}
                    const fresh = candidates.filter(c => !recentAddrs.has(c.addr));
                    // Also filter by selectedTokens if specified
                    const selectedTokenFilter = dbConfig.selectedTokens ? dbConfig.selectedTokens.split(',').map(s => s.trim()).filter(Boolean) : [];
                    let filteredPool = fresh.length > 0 ? fresh : candidates;
                    if (selectedTokenFilter.length > 0) {
                        const bySelected = filteredPool.filter(c => selectedTokenFilter.includes(c.symbol));
                        if (bySelected.length > 0) filteredPool = bySelected;
                    }
                    const pool = filteredPool;

                    // Shuffle and pick 1-2
                    const shuffled = pool.sort(() => Math.random() - 0.5);
                    const planCount = 1 + (Math.random() > 0.5 ? 1 : 0); // 1 or 2 plans
                    const riskProfile = RISK_PROFILES[dbConfig.riskLevel] || RISK_PROFILES.conservative;

                    const signalTypes = ['whale', 'smart_money', 'bollinger', 'macd_bb', 'supertrend', 'volume_spike'];
                    const reasonTemplates = [
                        ['Whale accumulation detected', 'High trading volume', 'Positive momentum'],
                        ['Smart money inflow', 'Breakout above resistance', 'Strong buy signal'],
                        ['Bollinger Band squeeze', 'MACD crossover bullish', 'Volume spike +150%'],
                        ['SuperTrend flipped bullish', 'RSI recovering from oversold', 'Orderbook imbalance'],
                        ['Whale wallet entry', 'KOL mentions trending', 'Liquidity surge detected'],
                        ['Price consolidation breakout', 'Moving average golden cross', 'On-chain accumulation'],
                    ];

                    for (let i = 0; i < Math.min(planCount, shuffled.length); i++) {
                        const token = shuffled[i];
                        const score = 55 + Math.floor(Math.random() * 40); // 55-95
                        const priceVariance = token.price * (0.95 + Math.random() * 0.10);
                        const isLive = liveTokens.some(l => l.addr === token.addr);
                        const sigIdx = Math.floor(Math.random() * signalTypes.length);
                        const sources = [signalTypes[sigIdx]];
                        if (Math.random() > 0.5) sources.push(signalTypes[(sigIdx + 1) % signalTypes.length]);

                        const reasonSet = reasonTemplates[Math.floor(Math.random() * reasonTemplates.length)];
                        const reasons = [
                            isLive ? '🔴 Live signal' : '📝 Paper signal',
                            ...reasonSet.slice(0, 2 + Math.floor(Math.random() * 2)),
                            `AI Score: ${score}/100`,
                        ];

                        await createTradePlan(userId, {
                            tokenAddress: token.addr,
                            tokenSymbol: `${isLive ? '🔴' : '📝'}${token.symbol}`,
                            tokenName: `${isLive ? '' : '[PAPER] '}${token.name}`,
                            tokenPrice: priceVariance,
                            chainIndex: token.chain,
                            action: 'buy',
                            suggestedAmountUsd: Math.min(riskProfile.maxAmountUsd, dbConfig.maxAmountUsd),
                            aiScore: score,
                            aiReason: reasons.join(' • '),
                            targetPct: dbConfig.takeProfitPct || 30,
                            stopLossPct: dbConfig.stopLossPct || 15,
                            signalSource: sources.join(',')
                        });
                        log.info(`[Paper] Generated ${isLive ? 'LIVE' : 'demo'} trade plan for user ${userId}: ${token.symbol} ($${priceVariance.toPrecision(4)}) on chain ${CHAIN_LABELS[token.chain] || token.chain}`);
                    }
                }
            }

        } catch (err) {
            log.error('Signal polling error:', err.message);
        }
    };

    // Run first scan after short delay, then every 90s
    setTimeout(() => runScan(), 5000);
    const intervalId = setInterval(runScan, 90000);

    agentStates.set(userId, { intervalId, config, chatId });
    log.info(`Started signal polling for user ${userId}`);
}

function stopSignalPolling(userId) {
    const state = agentStates.get(userId);
    if (state?.intervalId) {
        clearInterval(state.intervalId);
        agentStates.delete(userId);
        log.info(`Stopped signal polling for user ${userId}`);
    }
}

/**
 * Restore all active agents after bot restart
 */
async function restoreAgents() {
    try {
        await initDB();
        const { dbAll } = require('../../db/core');
        const configs = await dbAll('SELECT * FROM auto_trading_config WHERE enabled = 1 AND pausedByUser = 0');
        if (!configs || configs.length === 0) {
            log.info('No active trading agents to restore.');
            return;
        }

        for (const c of configs) {
            startSignalPolling(c.userId, {
                riskLevel: c.riskLevel,
                maxAmountUsd: c.maxAmountUsd,
                chains: c.chains,
                stopLoss: c.stopLossPct,
                takeProfit: c.takeProfitPct
            }, { chatId: c.userId });
        }
        log.info(`Restored ${configs.length} active trading agent(s).`);

        // Restore active positions in the execution engine
        try {
            const engine = require('./tradeExecutionEngine');
            await engine.restorePositions();
        } catch (engineErr) {
            log.warn('Position restore error:', engineErr.message);
        }
    } catch (err) {
        log.error('Restore agents error:', err.message);
    }
}

// ═══════════════════════════════════════════════
// LEGACY — Telegram bot integration (manageAutoTrading)
// ═══════════════════════════════════════════════

async function manageAutoTrading(args, context) {
    const userId = context?.userId;
    if (!userId) return '❌ User not identified.';

    const action = (args.action || '').toLowerCase();

    switch (action) {
        case 'enable': {
            const result = await enableAgent(userId, args);
            const lang = context?.lang || 'en';
            const cfg = result.config;
            const msgs = {
                en: `🤖 <b>AI Trading Agent ACTIVATED</b> (BETA)\n━━━━━━━━━━━━━━━━━━\n📊 Risk: <code>${cfg.riskLevel}</code>\n💰 Max/trade: <code>$${cfg.maxAmountUsd}</code>\n⛓ Chains: <code>${cfg.chains}</code>\n📉 Stop Loss: <code>${cfg.stopLossPct}%</code>\n📈 Take Profit: <code>${cfg.takeProfitPct}%</code>\n🎯 Target: <code>${cfg.profitTargetPct}%</code>\n\n<i>Monitoring Smart Money & Whale signals...</i>`,
                vi: `🤖 <b>AI Trading Agent ĐÃ BẬT</b> (BETA)\n━━━━━━━━━━━━━━━━━━\n📊 Rủi ro: <code>${cfg.riskLevel}</code>\n💰 Max/lệnh: <code>$${cfg.maxAmountUsd}</code>\n⛓ Chains: <code>${cfg.chains}</code>\n📉 Stop Loss: <code>${cfg.stopLossPct}%</code>\n📈 Take Profit: <code>${cfg.takeProfitPct}%</code>\n🎯 Mục tiêu: <code>${cfg.profitTargetPct}%</code>\n\n<i>Đang theo dõi tín hiệu Smart Money & Cá voi...</i>`
            };
            return { displayMessage: msgs[lang] || msgs.en };
        }

        case 'disable': {
            await disableAgent(userId);
            const lang = context?.lang || 'en';
            return { displayMessage: lang === 'vi' ? '🔴 AI Trading Agent đã TẮT.' : '🔴 AI Trading Agent DEACTIVATED.' };
        }

        case 'status': {
            const status = await getAgentStatus(userId);
            if (!status.configured) {
                const lang = context?.lang || 'en';
                return { displayMessage: lang === 'vi' ? '📭 Chưa cấu hình AI Trading Agent.' : '📭 Auto trading not configured.' };
            }
            const statusIcon = status.enabled ? (status.paused ? '⏸️' : '🟢') : '🔴';
            let card = `🤖 <b>AI Trading Agent</b> (LIVE)\n━━━━━━━━━━━━━━━━━━\n`;
            card += `${statusIcon} <b>Status:</b> ${status.enabled ? (status.paused ? 'PAUSED' : 'ACTIVE') : 'INACTIVE'}\n`;
            card += `📊 Risk: <code>${status.riskLevel}</code>\n`;
            card += `💰 Max/trade: <code>$${status.maxAmountUsd}</code>\n`;
            card += `📈 Total trades: <code>${status.totalTrades}</code>\n`;
            card += `💵 Total PnL: <code>$${status.totalPnlUsd.toFixed(2)}</code>\n`;
            card += `🎯 Progress: <code>${status.profitProgress}%</code> of target`;
            if (status.pendingPlans > 0) {
                card += `\n\n⏳ <b>${status.pendingPlans} pending plan(s)</b> waiting for approval`;
            }
            return { displayMessage: card };
        }

        case 'set_config': {
            const result = await updateAgentConfig(userId, args);
            return { displayMessage: result.success ? '✅ Config updated.' : `❌ ${result.error}` };
        }

        default:
            return '❌ Unknown action. Use: enable, disable, status, set_config';
    }
}

module.exports = {
    // Legacy Telegram
    manageAutoTrading,
    // Dashboard API
    enableAgent, disableAgent, pauseAgent,
    getAgentStatus, getAgentConfig, updateAgentConfig,
    // Trade Plans
    createTradePlan, getPendingPlans, getTradePlans,
    approvePlan, rejectPlan,
    // #11 CSV export
    exportTradeHistory,
    // Polling
    startSignalPolling, stopSignalPolling, restoreAgents,
    agentStates,
    // Constants
    RISK_PROFILES, CHAIN_LABELS, CHAIN_ID_MAP
};
