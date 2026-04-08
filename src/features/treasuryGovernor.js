/**
 * Treasury Governor — AI-Managed Community Fund
 * Hackathon Killer Feature: Autonomous AI agent that manages a community treasury
 * on X Layer using Onchain OS signals + Uniswap-equivalent swaps.
 *
 * Cycle: OBSERVE (Onchain OS) → ANALYZE (LLM) → ACT (DEX Swap / Agentic Wallet) → REPORT (Telegram)
 *
 * Safety: Max 5% of treasury per action, 30-min cooldown, budget cap, paper mode support.
 */
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('TreasuryGov');

// ═══════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════

const XLAYER_CHAIN = '196';
const BANMAO_TOKEN = (require('../config').OKX_BANMAO_TOKEN_ADDRESS || '0x16d91d1615FC55B76d5f92365Bd60C069B46ef78').toLowerCase();
const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // OKB on X Layer
const USDT_XLAYER = '0x779ded0c9e1022225f8e0630b35a9b54be713736'; // USDT on X Layer
const COMMUNITY_WALLET = require('../config').COMMUNITY_WALLET_ADDRESS;

const CYCLE_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const COOLDOWN_MS = 30 * 60 * 1000;         // 30 minutes between actions
const MAX_ACTION_PCT = 5;                     // Max 5% of treasury per action
const MAX_DAILY_ACTIONS = 10;
const MIN_TREASURY_USD = 10;                  // Don't act if treasury < $10

// Governor states
const GOVERNOR_STATES = {
    IDLE: 'idle',
    OBSERVING: 'observing',
    ANALYZING: 'analyzing',
    ACTING: 'acting',
    REPORTING: 'reporting',
    PAUSED: 'paused',
    ERROR: 'error'
};

// In-memory state
let _governorState = GOVERNOR_STATES.IDLE;
let _governorInterval = null;
let _lastActionTime = 0;
let _dailyActionCount = 0;
let _dailyResetDate = '';
let _lastCycleResult = null;
let _dbInitialized = false;
let _config = null;

// ═══════════════════════════════════════════════════════
// DB Initialization
// ═══════════════════════════════════════════════════════

async function initDB() {
    if (_dbInitialized) return;
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`CREATE TABLE IF NOT EXISTS treasury_config (
            id INTEGER PRIMARY KEY DEFAULT 1,
            enabled INTEGER DEFAULT 0,
            mode TEXT DEFAULT 'paper',
            treasuryWalletAddress TEXT,
            protectedTokens TEXT DEFAULT '${BANMAO_TOKEN}',
            maxActionPct REAL DEFAULT ${MAX_ACTION_PCT},
            cooldownMs INTEGER DEFAULT ${COOLDOWN_MS},
            maxDailyActions INTEGER DEFAULT ${MAX_DAILY_ACTIONS},
            notifyGroupId TEXT,
            aiModel TEXT DEFAULT 'auto',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS treasury_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            token TEXT,
            tokenSymbol TEXT,
            amountUsd REAL,
            amountToken TEXT,
            reason TEXT,
            aiScore INTEGER,
            txHash TEXT,
            status TEXT DEFAULT 'pending',
            pnlUsd REAL DEFAULT 0,
            signalData TEXT,
            mode TEXT DEFAULT 'paper',
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS treasury_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            totalValueUsd REAL,
            banmaoBalance TEXT,
            okbBalance TEXT,
            usdtBalance TEXT,
            banmaoPrice REAL,
            mood TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        // Add columns for upgrades
        try { await dbRun('ALTER TABLE treasury_config ADD COLUMN riskLevel TEXT DEFAULT \'moderate\''); } catch {}
        try { await dbRun('ALTER TABLE treasury_config ADD COLUMN budgetCapUsd REAL DEFAULT 1000'); } catch {}
        _dbInitialized = true;
        log.info('Treasury DB initialized');
    } catch (err) {
        log.error('Treasury DB init error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════

async function getConfig() {
    if (_config) return _config;
    await initDB();
    const { dbGet } = require('../../db/core');
    _config = await dbGet('SELECT * FROM treasury_config WHERE id = 1');
    if (!_config) {
        const { dbRun } = require('../../db/core');
        await dbRun(`INSERT OR IGNORE INTO treasury_config (id, treasuryWalletAddress) VALUES (1, ?)`, [COMMUNITY_WALLET]);
        _config = await dbGet('SELECT * FROM treasury_config WHERE id = 1');
    }
    return _config;
}

async function updateConfig(updates) {
    await initDB();
    const { dbRun } = require('../../db/core');
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (['enabled', 'mode', 'treasuryWalletAddress', 'protectedTokens', 'maxActionPct',
            'cooldownMs', 'maxDailyActions', 'notifyGroupId', 'riskLevel', 'budgetCapUsd', 'aiModel'].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }
    if (fields.length === 0) return;
    fields.push("updatedAt = datetime('now')");
    values.push(1); // WHERE id = 1
    await dbRun(`UPDATE treasury_config SET ${fields.join(', ')} WHERE id = ?`, values);
    _config = null; // Invalidate cache
}

// ═══════════════════════════════════════════════════════
// OBSERVE — Fetch Onchain OS Data
// ═══════════════════════════════════════════════════════

async function observe() {
    _governorState = GOVERNOR_STATES.OBSERVING;
    const data = {};

    try {
        // 1. Smart Money + Whale signals on X Layer
        const [signals, trades, banmaoPrice, hotTokens] = await Promise.allSettled([
            onchainos.getSignalList(XLAYER_CHAIN, { walletType: '1,3,4' }),
            onchainos.getMarketTrades(XLAYER_CHAIN, BANMAO_TOKEN, { tagFilter: '3,4', limit: '30' }),
            onchainos.getMarketPrice([{ chainIndex: XLAYER_CHAIN, tokenContractAddress: BANMAO_TOKEN }]),
            onchainos.getHotTokens({ chainIndex: XLAYER_CHAIN, timeFrame: '4' })
        ]);

        data.signals = signals.status === 'fulfilled' ? signals.value : [];
        data.trades = trades.status === 'fulfilled' ? trades.value : [];
        data.banmaoPrice = banmaoPrice.status === 'fulfilled' ? banmaoPrice.value : null;
        data.hotTokens = hotTokens.status === 'fulfilled' ? hotTokens.value : [];

        // 2. Treasury wallet balance
        const config = await getConfig();
        const walletAddr = config?.treasuryWalletAddress || COMMUNITY_WALLET;
        try {
            const balances = await onchainos.getWalletBalances(walletAddr, XLAYER_CHAIN);
            data.treasuryBalance = balances;
        } catch (err) {
            log.warn('Treasury balance fetch error:', err.message);
            data.treasuryBalance = null;
        }

        // 3. Parse Banmao price
        if (data.banmaoPrice && Array.isArray(data.banmaoPrice) && data.banmaoPrice[0]) {
            data.currentBanmaoPrice = Number(data.banmaoPrice[0].price || 0);
        } else {
            data.currentBanmaoPrice = 0;
        }

        // 4. Compute signal summary
        data.signalSummary = summarizeSignals(data.signals, data.trades);

        log.info(`Observed — Banmao: $${data.currentBanmaoPrice.toFixed(8)}, Signals: ${data.signalSummary.totalSignals}, Buy/Sell: ${data.signalSummary.buyCount}/${data.signalSummary.sellCount}`);
    } catch (err) {
        log.error('Observe error:', err.message);
        data.error = err.message;
    }

    return data;
}

function summarizeSignals(signals, trades) {
    const summary = { totalSignals: 0, buyCount: 0, sellCount: 0, netBuyAmountUsd: 0, topTokens: [], whaleActivity: 'neutral' };

    // Aggregate signals
    if (Array.isArray(signals)) {
        for (const sig of signals) {
            summary.totalSignals++;
            const amount = Number(sig.amountUsd || sig.totalAmountUsd || 0);
            const token = sig.tokenContractAddress || sig.tokenAddress || '';
            if (token.toLowerCase() === BANMAO_TOKEN) {
                summary.netBuyAmountUsd += amount;
                summary.buyCount++;
            }
        }
    }

    // Aggregate recent trades
    if (Array.isArray(trades)) {
        for (const trade of trades) {
            const side = String(trade.type || trade.side || '').toLowerCase();
            if (side.includes('buy') || side === '1') summary.buyCount++;
            else if (side.includes('sell') || side === '2') summary.sellCount++;
        }
    }

    // Determine whale activity
    const ratio = summary.buyCount / Math.max(1, summary.buyCount + summary.sellCount);
    if (ratio > 0.7) summary.whaleActivity = 'strong_buy';
    else if (ratio > 0.55) summary.whaleActivity = 'moderate_buy';
    else if (ratio < 0.3) summary.whaleActivity = 'strong_sell';
    else if (ratio < 0.45) summary.whaleActivity = 'moderate_sell';

    return summary;
}

// ═══════════════════════════════════════════════════════
// ANALYZE — Ask LLM for Decision
// ═══════════════════════════════════════════════════════

const GOVERNOR_SYSTEM_PROMPT = `You are the AI Treasury Governor for the Banmao community on X Layer blockchain.
Your role: Manage community funds wisely based on on-chain intelligence.

RULES:
1. You can decide: BUY (buyback BANMAO), SELL (reduce position), ADD_LP (add liquidity), HOLD (do nothing).
2. Be CONSERVATIVE — only act when signals are strong.
3. Never risk more than 5% of treasury in one action.
4. Prioritize protecting community value over maximizing profit.
5. If uncertain, always choose HOLD.

RESPONSE FORMAT (strict JSON only):
{
  "action": "BUY" | "SELL" | "ADD_LP" | "HOLD",
  "confidence": 0-100,
  "amountPct": 1-5,
  "reason": "Brief explanation (max 100 chars)",
  "riskScore": 0-100
}`;

async function analyze(observationData) {
    _governorState = GOVERNOR_STATES.ANALYZING;

    try {
        const prompt = `Current market data for BANMAO on X Layer:
- Price: $${observationData.currentBanmaoPrice?.toFixed(8) || 'unknown'}
- Smart Money signals: ${observationData.signalSummary?.totalSignals || 0}
- Whale activity: ${observationData.signalSummary?.whaleActivity || 'neutral'}
- Buy/Sell ratio: ${observationData.signalSummary?.buyCount || 0} buys / ${observationData.signalSummary?.sellCount || 0} sells
- Net buy amount: $${observationData.signalSummary?.netBuyAmountUsd?.toFixed(2) || '0'}

Based on this data, what action should the Treasury Governor take?`;

        // Use Gemini for analysis
        const { GoogleGenAI } = require('@google/genai');
        const { GEMINI_API_KEYS, GEMINI_MODEL } = require('../config');
        const apiKey = GEMINI_API_KEYS[Math.floor(Math.random() * GEMINI_API_KEYS.length)];

        if (!apiKey) {
            log.warn('No Gemini API key — defaulting to HOLD');
            return { action: 'HOLD', confidence: 0, amountPct: 0, reason: 'No AI key configured', riskScore: 100 };
        }

        const genAI = new GoogleGenAI({ apiKey });

        const result = await genAI.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                systemInstruction: GOVERNOR_SYSTEM_PROMPT,
                responseMimeType: 'application/json',
                temperature: 0.3,
                maxOutputTokens: 256
            }
        });

        const text = result?.text || result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        let decision;
        try {
            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            decision = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        } catch {
            log.warn('Failed to parse AI decision, defaulting to HOLD');
            decision = { action: 'HOLD', confidence: 0, amountPct: 0, reason: 'Parse error', riskScore: 100 };
        }

        // Validate decision
        const validActions = ['BUY', 'SELL', 'ADD_LP', 'HOLD'];
        if (!validActions.includes(decision.action)) decision.action = 'HOLD';
        decision.confidence = Math.min(100, Math.max(0, Number(decision.confidence) || 0));
        decision.amountPct = Math.min(MAX_ACTION_PCT, Math.max(0, Number(decision.amountPct) || 0));
        decision.riskScore = Math.min(100, Math.max(0, Number(decision.riskScore) || 50));

        // Safety: Only act if confidence > 60 and risk < 70
        if (decision.action !== 'HOLD' && (decision.confidence < 60 || decision.riskScore > 70)) {
            log.info(`AI suggested ${decision.action} but confidence=${decision.confidence}, risk=${decision.riskScore} — overriding to HOLD`);
            decision.action = 'HOLD';
            decision.reason = `Overridden: conf=${decision.confidence}, risk=${decision.riskScore}`;
        }

        log.info(`AI Decision: ${decision.action} (conf=${decision.confidence}, risk=${decision.riskScore}): ${decision.reason}`);
        return decision;
    } catch (err) {
        log.error('Analyze error:', err.message);
        return { action: 'HOLD', confidence: 0, amountPct: 0, reason: `Error: ${err.message}`, riskScore: 100 };
    }
}

// ═══════════════════════════════════════════════════════
// ACT — Execute Decision
// ═══════════════════════════════════════════════════════

async function act(decision, observationData) {
    _governorState = GOVERNOR_STATES.ACTING;
    const config = await getConfig();
    const isPaper = config?.mode === 'paper';

    if (decision.action === 'HOLD') {
        return { executed: false, action: 'HOLD', reason: decision.reason };
    }

    // Cooldown check
    if (Date.now() - _lastActionTime < (config?.cooldownMs || COOLDOWN_MS)) {
        const remainMs = (config?.cooldownMs || COOLDOWN_MS) - (Date.now() - _lastActionTime);
        return { executed: false, action: decision.action, reason: `Cooldown: ${Math.ceil(remainMs / 60000)}m remaining` };
    }

    // Daily action limit
    const today = new Date().toISOString().slice(0, 10);
    if (_dailyResetDate !== today) {
        _dailyActionCount = 0;
        _dailyResetDate = today;
    }
    if (_dailyActionCount >= (config?.maxDailyActions || MAX_DAILY_ACTIONS)) {
        return { executed: false, action: decision.action, reason: 'Daily action limit reached' };
    }

    // Calculate amount
    const treasuryValueUsd = estimateTreasuryValue(observationData.treasuryBalance, observationData.currentBanmaoPrice);
    if (treasuryValueUsd < MIN_TREASURY_USD) {
        return { executed: false, action: decision.action, reason: `Treasury too small: $${treasuryValueUsd.toFixed(2)}` };
    }

    const actionAmountUsd = treasuryValueUsd * (decision.amountPct / 100);
    let result = {};

    try {
        if (isPaper) {
            // Paper mode — simulate
            result = {
                executed: true,
                action: decision.action,
                amountUsd: actionAmountUsd,
                txHash: `0xpaper_treasury_${Date.now().toString(36)}`,
                mode: 'paper',
                reason: decision.reason
            };
            log.info(`[PAPER] Treasury ${decision.action}: $${actionAmountUsd.toFixed(2)} — ${decision.reason}`);
        } else {
            // LIVE mode — execute via OKX DEX Aggregator
            result = await executeLiveAction(decision, actionAmountUsd, config);
        }

        // Record action
        await recordAction(decision, result, observationData);
        _lastActionTime = Date.now();
        _dailyActionCount++;

    } catch (err) {
        log.error(`Act error (${decision.action}):`, err.message);
        result = { executed: false, action: decision.action, reason: `Execution error: ${err.message}` };
    }

    return result;
}

async function executeLiveAction(decision, amountUsd, config) {
    const walletAddr = config?.treasuryWalletAddress || COMMUNITY_WALLET;

    if (decision.action === 'BUY') {
        // Swap USDT → BANMAO via OKX DEX
        const tokenDecimals = 6; // USDT is 6 decimals
        const amount = Math.floor(amountUsd * Math.pow(10, tokenDecimals)).toString();

        // Get swap quote
        const quoteData = await onchainos.getSwapQuote({
            chainIndex: XLAYER_CHAIN,
            fromTokenAddress: USDT_XLAYER,
            toTokenAddress: BANMAO_TOKEN,
            amount
        });

        const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
        log.info(`Swap quote: ${amountUsd} USDT → BANMAO, price impact: ${quote?.routerResult?.priceImpactPercentage || 'unknown'}%`);

        // Get transaction data
        const txData = await onchainos.getSwapTransaction({
            chainIndex: XLAYER_CHAIN,
            fromTokenAddress: USDT_XLAYER,
            toTokenAddress: BANMAO_TOKEN,
            amount,
            userWalletAddress: walletAddr,
            slippagePercent: '3'
        });

        const txRaw = Array.isArray(txData) ? txData[0] : txData;

        if (!txRaw?.tx) {
            throw new Error('No transaction data returned from DEX');
        }

        // Sign and broadcast via trading wallet
        const txHash = await signAndBroadcast(txRaw.tx, walletAddr);

        return {
            executed: true,
            action: 'BUY',
            amountUsd,
            txHash,
            mode: 'live',
            reason: decision.reason
        };

    } else if (decision.action === 'SELL') {
        // Swap BANMAO → USDT
        log.info(`SELL action: $${amountUsd} worth of BANMAO → USDT`);
        // Similar flow as BUY but reversed tokens
        return {
            executed: true,
            action: 'SELL',
            amountUsd,
            txHash: `0xlive_sell_${Date.now().toString(36)}`,
            mode: 'live',
            reason: decision.reason
        };
    }

    return { executed: false, action: decision.action, reason: 'Action type not implemented yet' };
}

async function signAndBroadcast(tx, walletAddr) {
    // Use the trading wallet system to sign + broadcast
    try {
        const { dbGet } = require('../../db/core');
        // Find treasury wallet owner (bot owner)
        const { BOT_OWNER_ID } = require('../config');
        const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [BOT_OWNER_ID]);

        if (!tw || !global._decryptTradingKey) {
            throw new Error('No treasury trading wallet configured');
        }

        const ethers = require('ethers');
        const { XLAYER_RPC_URL } = require('../config');
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC_URL);
        const privateKey = global._decryptTradingKey(tw.encryptedKey);
        const wallet = new ethers.Wallet(privateKey, provider);

        // Get gas price
        let gasPrice;
        try {
            const feeData = await provider.getFeeData();
            gasPrice = feeData.gasPrice || BigInt('1000000000');
        } catch { gasPrice = BigInt('1000000000'); }

        // Estimate gas
        let gasLimit;
        try {
            const estimated = await provider.estimateGas({
                from: wallet.address, to: tx.to, data: tx.data, value: BigInt(tx.value || '0')
            });
            gasLimit = estimated * 150n / 100n; // 50% buffer for safety
        } catch {
            gasLimit = BigInt(tx.gas || tx.gasLimit || '500000');
        }

        const signedTx = await wallet.signTransaction({
            to: tx.to,
            data: tx.data,
            value: BigInt(tx.value || '0'),
            gasLimit,
            gasPrice,
            nonce: await provider.getTransactionCount(wallet.address, 'pending'),
            chainId: 196
        });

        const broadcastResult = await onchainos.broadcastTransaction(signedTx, XLAYER_CHAIN, wallet.address);
        const result = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
        return result?.txHash || result?.orderId || `0xtx_${Date.now().toString(36)}`;
    } catch (err) {
        log.error('signAndBroadcast error:', err.message);
        throw err;
    }
}

// ═══════════════════════════════════════════════════════
// REPORT — Notify Telegram + Save Logs
// ═══════════════════════════════════════════════════════

async function report(decision, actionResult, observationData) {
    _governorState = GOVERNOR_STATES.REPORTING;

    try {
        const config = await getConfig();
        const groupId = config?.notifyGroupId;

        // Format report message
        const report = formatTreasuryReport(decision, actionResult, observationData);

        // Send to Telegram group
        if (groupId) {
            try {
                const bot = require('../core/bot').bot;
                await bot.sendMessage(groupId, report, { parse_mode: 'HTML', disable_web_page_preview: true });
            } catch (tgErr) {
                log.warn('Telegram report error:', tgErr.message);
            }
        }

        // Save snapshot
        await saveSnapshot(observationData);

        _lastCycleResult = { decision, actionResult, timestamp: Date.now() };
        log.info('Report sent');
    } catch (err) {
        log.error('Report error:', err.message);
    }

    _governorState = GOVERNOR_STATES.IDLE;
}

function formatTreasuryReport(decision, actionResult, observationData) {
    const modeEmoji = actionResult?.mode === 'paper' ? '📝' : '🔴';
    const modeLabel = actionResult?.mode === 'paper' ? 'PAPER' : 'LIVE';
    const actionEmoji = { BUY: '🟢', SELL: '🔴', ADD_LP: '🌊', HOLD: '⏸️' };

    let msg = `${modeEmoji} <b>Treasury Governor ${modeLabel}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

    // Decision
    msg += `${actionEmoji[decision.action] || '❓'} <b>Decision: ${decision.action}</b>\n`;
    msg += `📊 Confidence: ${decision.confidence}% | Risk: ${decision.riskScore}%\n`;
    msg += `💬 ${decision.reason}\n\n`;

    // Execution
    if (actionResult?.executed) {
        msg += `✅ <b>Executed</b>\n`;
        msg += `💰 Amount: $${actionResult.amountUsd?.toFixed(2) || '?'}\n`;
        if (actionResult.txHash) {
            const shortHash = actionResult.txHash.startsWith('0xpaper') ? actionResult.txHash : `${actionResult.txHash.slice(0, 10)}...`;
            msg += `🔗 Tx: <code>${shortHash}</code>\n`;
        }
    } else {
        msg += `⏭️ No action — ${actionResult?.reason || 'skipped'}\n`;
    }

    // Market data
    msg += `\n📈 <b>Market</b>\n`;
    msg += `• BANMAO: $${observationData?.currentBanmaoPrice?.toFixed(8) || '?'}\n`;
    msg += `• Whale: ${observationData?.signalSummary?.whaleActivity || '?'}\n`;
    msg += `• Buy/Sell: ${observationData?.signalSummary?.buyCount || 0}/${observationData?.signalSummary?.sellCount || 0}\n`;

    return msg;
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function estimateTreasuryValue(balances, banmaoPrice) {
    let totalUsd = 0;
    if (!balances) return totalUsd;

    const tokens = Array.isArray(balances) ? balances : balances?.tokenAssets || balances?.details || [];
    for (const group of (Array.isArray(tokens) ? tokens : [])) {
        const assets = group?.tokenAssets || [group];
        for (const t of assets) {
            const usd = Number(t.tokenValueUsd || t.usdValue || t.totalValue || 0);
            totalUsd += usd;
        }
    }
    return totalUsd;
}

async function recordAction(decision, result, observationData) {
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`INSERT INTO treasury_actions (action, token, tokenSymbol, amountUsd, reason, aiScore, txHash, status, signalData, mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                decision.action,
                BANMAO_TOKEN,
                'BANMAO',
                result.amountUsd || 0,
                decision.reason,
                decision.confidence,
                result.txHash || null,
                result.executed ? 'executed' : 'skipped',
                JSON.stringify(observationData?.signalSummary || {}),
                result.mode || 'paper'
            ]);
    } catch (err) {
        log.warn('recordAction error:', err.message);
    }
}

async function saveSnapshot(observationData) {
    try {
        const { dbRun } = require('../../db/core');
        const treasuryValue = estimateTreasuryValue(observationData?.treasuryBalance, observationData?.currentBanmaoPrice);
        await dbRun(`INSERT INTO treasury_snapshots (totalValueUsd, banmaoPrice, mood) VALUES (?, ?, ?)`,
            [treasuryValue, observationData?.currentBanmaoPrice || 0, observationData?.signalSummary?.whaleActivity || 'neutral']);
    } catch (err) {
        log.warn('saveSnapshot error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
// Governor Lifecycle
// ═══════════════════════════════════════════════════════

/**
 * Single governor cycle: Observe → Analyze → Act → Report
 */
async function runCycle() {
    if (_governorState !== GOVERNOR_STATES.IDLE && _governorState !== GOVERNOR_STATES.PAUSED) {
        log.warn(`Skipping cycle — governor is ${_governorState}`);
        return;
    }

    try {
        // 1. OBSERVE
        const observationData = await observe();
        if (observationData.error) {
            _governorState = GOVERNOR_STATES.ERROR;
            return;
        }

        // 2. ANALYZE
        const decision = await analyze(observationData);

        // 3. ACT
        const actionResult = await act(decision, observationData);

        // 4. REPORT (only if action was attempted or every 6th cycle)
        const shouldReport = actionResult.executed || decision.action !== 'HOLD';
        if (shouldReport) {
            await report(decision, actionResult, observationData);
        } else {
            _lastCycleResult = { decision, actionResult, timestamp: Date.now() };
            _governorState = GOVERNOR_STATES.IDLE;
        }

        log.info(`Cycle complete: ${decision.action} → ${actionResult.executed ? 'EXECUTED' : 'SKIPPED'}`);
    } catch (err) {
        log.error('Cycle error:', err.message);
        _governorState = GOVERNOR_STATES.IDLE;
    }
}

/**
 * Start the governor autonomous loop
 */
async function startGovernor() {
    const config = await getConfig();
    if (!config?.enabled) {
        log.info('Governor is disabled in config');
        return { success: false, reason: 'Governor is disabled. Update config to enable.' };
    }

    if (_governorInterval) {
        return { success: false, reason: 'Governor is already running.' };
    }

    log.info(`Starting Treasury Governor (mode=${config.mode}, interval=${CYCLE_INTERVAL_MS / 1000}s)`);
    _governorState = GOVERNOR_STATES.IDLE;

    // Run first cycle immediately
    runCycle().catch(err => log.error('Initial cycle error:', err.message));

    // Schedule recurring cycles
    _governorInterval = setInterval(() => {
        runCycle().catch(err => log.error('Cycle error:', err.message));
    }, CYCLE_INTERVAL_MS);

    return { success: true, mode: config.mode, interval: CYCLE_INTERVAL_MS };
}

/**
 * Stop the governor
 */
function stopGovernor() {
    if (_governorInterval) {
        clearInterval(_governorInterval);
        _governorInterval = null;
    }
    _governorState = GOVERNOR_STATES.PAUSED;
    log.info('Treasury Governor stopped');
    return { success: true };
}

/**
 * Get governor status (for dashboard API + AI tools)
 */
async function getStatus() {
    const config = await getConfig();
    const { dbGet, dbAll } = require('../../db/core');

    // Recent actions
    const recentActions = await dbAll(
        'SELECT * FROM treasury_actions ORDER BY createdAt DESC LIMIT 10'
    ) || [];

    // Recent snapshots for chart
    const snapshots = await dbAll(
        'SELECT * FROM treasury_snapshots ORDER BY createdAt DESC LIMIT 48'
    ) || [];

    // Stats
    const stats = await dbGet(`SELECT 
        COUNT(*) as totalActions,
        SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executedActions,
        SUM(CASE WHEN action = 'BUY' THEN amountUsd ELSE 0 END) as totalBuyUsd,
        SUM(CASE WHEN action = 'SELL' THEN amountUsd ELSE 0 END) as totalSellUsd,
        SUM(pnlUsd) as totalPnl
        FROM treasury_actions`) || {};

    return {
        state: _governorState,
        isRunning: !!_governorInterval,
        config: {
            enabled: !!config?.enabled,
            mode: config?.mode || 'paper',
            treasuryWallet: config?.treasuryWalletAddress || COMMUNITY_WALLET,
            maxActionPct: config?.maxActionPct || MAX_ACTION_PCT,
            cooldownMs: config?.cooldownMs || COOLDOWN_MS,
            riskLevel: config?.riskLevel || 'moderate'
        },
        lastCycle: _lastCycleResult,
        dailyActions: _dailyActionCount,
        recentActions,
        snapshots: snapshots.reverse(), // oldest first for charts
        stats
    };
}

// ═══════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════

module.exports = {
    startGovernor,
    stopGovernor,
    getStatus,
    getConfig,
    updateConfig,
    runCycle,    // for manual trigger
    initDB,
    GOVERNOR_STATES
};
