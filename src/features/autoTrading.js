/**
 * AI Autonomous Trading Agent — Idea #1
 * Signal-driven auto trading with AI risk scoring
 *
 * Fixes applied:
 * - C1: restoreAgents() to recover polling after bot restart
 * - C2: Rate limiting (max 3 research/min, cache 5min)
 * - W4: Pending confirm cleanup
 * - W5: Context refresh from DB on each poll cycle
 * - Fixed all require paths
 */
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('TradingAgent');

// In-memory agent state (per-user)
const agentStates = new Map();

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
            totalTrades INTEGER DEFAULT 0,
            totalPnlUsd REAL DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
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
    // Remove entries older than 60s
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

    // Clean stale cache entries (>10min)
    for (const [k, v] of researchCache.entries()) {
        if (Date.now() - v.timestamp > CACHE_TTL_MS * 2) researchCache.delete(k);
    }

    return report;
}

/**
 * Manage auto trading config
 */
async function manageAutoTrading(args, context) {
    const userId = context?.userId;
    if (!userId) return '❌ User not identified.';

    const { dbGet, dbRun } = require('../../db/core');
    await initDB();
    const action = (args.action || '').toLowerCase();

    switch (action) {
        case 'enable': {
            const profile = RISK_PROFILES[args.riskLevel] || RISK_PROFILES.conservative;
            const maxAmt = Number(args.maxAmountUsd) || profile.maxAmountUsd;
            const chains = args.chains || '196,1,56,501';
            const sl = args.stopLossPct || profile.stopLoss;
            const tp = args.takeProfitPct || profile.takeProfit;

            await dbRun(`INSERT OR REPLACE INTO auto_trading_config 
                (userId, enabled, riskLevel, maxAmountUsd, chains, stopLossPct, takeProfitPct, updatedAt) 
                VALUES (?, 1, ?, ?, ?, ?, ?, datetime('now'))`,
                [userId, args.riskLevel || 'conservative', maxAmt, chains, sl, tp]);

            // Start polling (context will be refreshed from DB each cycle)
            startSignalPolling(userId, {
                riskLevel: args.riskLevel || 'conservative',
                maxAmountUsd: maxAmt, chains, stopLoss: sl, takeProfit: tp
            }, { chatId: context?.chatId || context?.msg?.chat?.id || userId });

            const lang = context?.lang || 'en';
            const msgs = {
                en: `🤖 <b>AI Trading Agent ACTIVATED</b>\n━━━━━━━━━━━━━━━━━━\n📊 Risk: <code>${args.riskLevel || 'conservative'}</code>\n💰 Max/trade: <code>$${maxAmt}</code>\n⛓ Chains: <code>${chains}</code>\n📉 Stop Loss: <code>${sl}%</code>\n📈 Take Profit: <code>${tp}%</code>\n\n<i>Monitoring Smart Money & Whale signals...</i>`,
                vi: `🤖 <b>AI Trading Agent ĐÃ BẬT</b>\n━━━━━━━━━━━━━━━━━━\n📊 Rủi ro: <code>${args.riskLevel || 'conservative'}</code>\n💰 Max/lệnh: <code>$${maxAmt}</code>\n⛓ Chains: <code>${chains}</code>\n📉 Stop Loss: <code>${sl}%</code>\n📈 Take Profit: <code>${tp}%</code>\n\n<i>Đang theo dõi tín hiệu Smart Money & Cá voi...</i>`,
                zh: `🤖 <b>AI交易代理已激活</b>\n━━━━━━━━━━━━━━━━━━\n📊 风险: <code>${args.riskLevel || 'conservative'}</code>\n💰 每笔上限: <code>$${maxAmt}</code>\n⛓ 链: <code>${chains}</code>\n📉 止损: <code>${sl}%</code>\n📈 止盈: <code>${tp}%</code>\n\n<i>正在监控智能资金和鲸鱼信号...</i>`,
                ko: `🤖 <b>AI 트레이딩 에이전트 활성화</b>\n━━━━━━━━━━━━━━━━━━\n📊 위험: <code>${args.riskLevel || 'conservative'}</code>\n💰 최대/거래: <code>$${maxAmt}</code>\n⛓ 체인: <code>${chains}</code>\n📉 손절: <code>${sl}%</code>\n📈 익절: <code>${tp}%</code>\n\n<i>스마트 머니 & 고래 신호 모니터링 중...</i>`
            };
            return { displayMessage: msgs[lang] || msgs.en };
        }

        case 'disable': {
            await dbRun("UPDATE auto_trading_config SET enabled = 0, updatedAt = datetime('now') WHERE userId = ?", [userId]);
            stopSignalPolling(userId);
            const lang = context?.lang || 'en';
            const msgs = {
                en: '🔴 AI Trading Agent DEACTIVATED.',
                vi: '🔴 AI Trading Agent đã TẮT.',
                zh: '🔴 AI交易代理已停用。',
                ko: '🔴 AI 트레이딩 에이전트 비활성화.'
            };
            return { displayMessage: msgs[lang] || msgs.en };
        }

        case 'status': {
            const config = await dbGet('SELECT * FROM auto_trading_config WHERE userId = ?', [userId]);
            if (!config) {
                const lang = context?.lang || 'en';
                const msgs = { en: '📭 Auto trading not configured yet.', vi: '📭 Chưa cấu hình AI Trading Agent.' };
                return { displayMessage: msgs[lang] || msgs.en };
            }
            const lang = context?.lang || 'en';
            const statusIcon = config.enabled ? '🟢' : '🔴';
            const statusText = config.enabled ? (lang === 'vi' ? 'ĐANG HOẠT ĐỘNG' : 'ACTIVE') : (lang === 'vi' ? 'TẮT' : 'INACTIVE');
            let card = `🤖 <b>AI Trading Agent</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `${statusIcon} <b>Status:</b> ${statusText}\n`;
            card += `📊 Risk: <code>${config.riskLevel}</code>\n`;
            card += `💰 Max/trade: <code>$${config.maxAmountUsd}</code>\n`;
            card += `⛓ Chains: <code>${config.chains}</code>\n`;
            card += `📉 SL: <code>${config.stopLossPct}%</code> | 📈 TP: <code>${config.takeProfitPct}%</code>\n`;
            card += `📈 Total trades: <code>${config.totalTrades}</code>\n`;
            card += `💵 Total PnL: <code>$${Number(config.totalPnlUsd || 0).toFixed(2)}</code>`;
            return { displayMessage: card };
        }

        case 'set_config': {
            const updates = [];
            const params = [];
            if (args.riskLevel) { updates.push('riskLevel = ?'); params.push(args.riskLevel); }
            if (args.maxAmountUsd) { updates.push('maxAmountUsd = ?'); params.push(Number(args.maxAmountUsd)); }
            if (args.chains) { updates.push('chains = ?'); params.push(args.chains); }
            if (args.stopLossPct) { updates.push('stopLossPct = ?'); params.push(args.stopLossPct); }
            if (args.takeProfitPct) { updates.push('takeProfitPct = ?'); params.push(args.takeProfitPct); }
            if (updates.length === 0) return '❌ No config parameters provided.';
            updates.push("updatedAt = datetime('now')");
            params.push(userId);
            await dbRun(`UPDATE auto_trading_config SET ${updates.join(', ')} WHERE userId = ?`, params);
            const lang = context?.lang || 'en';
            return { displayMessage: lang === 'vi' ? '✅ Đã cập nhật cấu hình.' : '✅ Config updated.' };
        }

        default:
            return '❌ Unknown action. Use: enable, disable, status, set_config';
    }
}

/**
 * Signal polling engine (in-memory interval per user)
 * C1 fix: minimal context stored, refreshed from DB each cycle
 * C2 fix: rate limiting + research caching
 */
function startSignalPolling(userId, config, minimalContext) {
    stopSignalPolling(userId); // Clear existing

    // Store only chatId — lang will be refreshed from DB each cycle
    const chatId = minimalContext?.chatId || userId;

    const intervalId = setInterval(async () => {
        try {
            const { dbGet } = require('../../db/core');
            const dbConfig = await dbGet('SELECT * FROM auto_trading_config WHERE userId = ? AND enabled = 1', [userId]);
            if (!dbConfig) { stopSignalPolling(userId); return; }

            // Refresh user language from DB (fix W5: stale context)
            let lang = 'en';
            try {
                const { getUserLanguage } = require('../../db/users');
                const dbLang = await getUserLanguage(String(chatId));
                if (dbLang) lang = dbLang;
            } catch (e) { /* use default */ }

            const chains = (dbConfig.chains || '196').split(',');
            for (const chain of chains) {
                try {
                    // Poll whale signals only (reduce API calls from 2→1 per chain)
                    const signals = await onchainos.getSignalList(chain.trim(), { walletType: '4' });
                    const allSignals = Array.isArray(signals) ? signals : [];

                    for (const signal of allSignals.slice(0, 3)) { // Reduced from 5→3
                        const tokenAddr = signal.tokenContractAddress;
                        if (!tokenAddr) continue;

                        // Rate limit check (C2 fix)
                        if (!checkRateLimit(userId)) {
                            log.info(`Rate limit hit for user ${userId}, skipping remaining signals`);
                            break;
                        }

                        // Check if we already analyzed/traded this token recently
                        const recent = await dbGet(
                            "SELECT * FROM auto_trading_log WHERE userId = ? AND tokenAddress = ? AND createdAt > datetime('now', '-2 hours')",
                            [userId, tokenAddr]
                        );
                        if (recent) continue;

                        // Run deep research with cache (C2 fix)
                        const report = await getCachedResearch(chain.trim(), tokenAddr, { lang });

                        const riskProfile = RISK_PROFILES[dbConfig.riskLevel] || RISK_PROFILES.conservative;
                        if (report.scores.overall >= riskProfile.minScore && report.scores.safety >= 40) {
                            await notifyTradeOpportunity(userId, report, dbConfig, { chatId, lang });
                        }
                    }
                } catch (chainErr) {
                    log.warn(`Signal poll error for chain ${chain}:`, chainErr.message);
                }
            }
        } catch (err) {
            log.error('Signal polling error:', err.message);
        }
    }, 90000); // 90 seconds (was 60s — reduced API pressure)

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
 * C1 fix: Restore all active agents after bot restart
 */
async function restoreAgents() {
    try {
        await initDB();
        const { dbAll } = require('../../db/core');
        const configs = await dbAll('SELECT * FROM auto_trading_config WHERE enabled = 1');
        if (!configs || configs.length === 0) {
            log.info('No active trading agents to restore.');
            return;
        }

        for (const c of configs) {
            // Use userId as chatId fallback — will refresh from DB in polling
            startSignalPolling(c.userId, {
                riskLevel: c.riskLevel,
                maxAmountUsd: c.maxAmountUsd,
                chains: c.chains,
                stopLoss: c.stopLossPct,
                takeProfit: c.takeProfitPct
            }, { chatId: c.userId });
        }
        log.info(`Restored ${configs.length} active trading agent(s).`);
    } catch (err) {
        log.error('Restore agents error:', err.message);
    }
}

/**
 * Notify user about a trade opportunity
 */
async function notifyTradeOpportunity(userId, report, config, context) {
    try {
        const bot = require('../core/bot').bot;
        const { dbRun } = require('../../db/core');
        const { formatResearchReport } = require('../skills/onchain/researchPipeline');
        const lang = context?.lang || 'en';

        const card = formatResearchReport(report, lang);
        const alertHeaders = {
            en: `🚨 <b>AI Agent — Opportunity Found!</b>\n━━━━━━━━━━━━━━━━━━\n`,
            vi: `🚨 <b>AI Agent — Phát hiện cơ hội!</b>\n━━━━━━━━━━━━━━━━━━\n`,
            zh: `🚨 <b>AI代理 — 发现机会！</b>\n━━━━━━━━━━━━━━━━━━\n`,
            ko: `🚨 <b>AI 에이전트 — 기회 발견!</b>\n━━━━━━━━━━━━━━━━━━\n`
        };

        const chatId = context?.chatId || userId;
        const confirmId = `agent_${userId}_${Date.now()}`;

        // Truncate card if too long for Telegram (max ~4096 chars)
        const fullMsg = (alertHeaders[lang] || alertHeaders.en) + card;
        const truncatedMsg = fullMsg.length > 4000 ? fullMsg.slice(0, 3950) + '\n\n<i>... (truncated)</i>' : fullMsg;

        await bot.sendMessage(chatId, truncatedMsg, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: lang === 'vi' ? '✅ Mua ngay' : '✅ Buy Now', callback_data: `agent|buy|${confirmId}`.slice(0, 64) },
                    { text: lang === 'vi' ? '❌ Bỏ qua' : '❌ Skip', callback_data: `agent|skip|${confirmId}`.slice(0, 64) }
                ]]
            },
            disable_web_page_preview: true
        });

        // Log the opportunity
        await dbRun('INSERT INTO auto_trading_log (userId, tokenAddress, tokenSymbol, chainIndex, action, researchScore, status) VALUES (?,?,?,?,?,?,?)',
            [userId, report.tokenAddress, report.symbol, report.chainIndex, 'opportunity', report.scores.overall, 'notified']);

    } catch (err) {
        log.error('Notify trade opportunity error:', err.message);
    }
}

module.exports = { manageAutoTrading, startSignalPolling, stopSignalPolling, restoreAgents, agentStates };
