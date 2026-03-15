/**
 * T2: Smart Reply Buttons — Suggest 2-3 follow-up actions after every AI response
 * T4: Rate-Limited AI Queue — Prevent concurrent overload
 * T6: Multi-Step Trading Wizard — Guided swap flow
 */
const logger = require('../core/logger');
const log = logger.child('SmartAI');

// ═══════════════════════════════════════════════════════
// T2: Smart Reply Buttons
// ═══════════════════════════════════════════════════════

/**
 * Analyze AI response text + tool calls and generate smart follow-up buttons
 * @param {string} responseText - The AI response text
 * @param {Array} toolCalls - Array of tool calls executed
 * @param {string} lang - User language code
 * @returns {Array} Array of button objects [{text, callback_data}]
 */
function generateSmartReplies(responseText, toolCalls = [], lang = 'en') {
    const suggestions = [];
    const toolNames = toolCalls.map(tc => tc.name || tc);
    const lower = (responseText || '').toLowerCase();
    const isVi = lang === 'vi';

    // Token/Price related
    if (toolNames.some(n => /price|market|token_info/.test(n))) {
        suggestions.push(
            { text: isVi ? '📊 Phân tích sâu' : '📊 Deep Research', data: 'sr|research' },
            { text: isVi ? '🔔 Đặt cảnh báo giá' : '🔔 Set Price Alert', data: 'sr|alert' },
            { text: isVi ? '💱 Swap token này' : '💱 Swap This', data: 'sr|swap' }
        );
    }
    // Swap/Trade related
    else if (toolNames.some(n => /swap|quote/.test(n))) {
        suggestions.push(
            { text: isVi ? '💼 Xem balance' : '💼 Check Balance', data: 'sr|balance' },
            { text: isVi ? '📈 Top trending' : '📈 Top Trending', data: 'sr|trending' },
            { text: isVi ? '🐳 Whale signals' : '🐳 Whale Signals', data: 'sr|signals' }
        );
    }
    // Wallet/Balance related
    else if (toolNames.some(n => /wallet|balance|portfolio/.test(n))) {
        suggestions.push(
            { text: isVi ? '💱 Swap tokens' : '💱 Swap Tokens', data: 'sr|swap' },
            { text: isVi ? '📊 Top tokens' : '📊 Top Tokens', data: 'sr|trending' },
            { text: isVi ? '📤 Chuyển token' : '📤 Transfer', data: 'sr|transfer' }
        );
    }
    // Signal/Analysis related
    else if (toolNames.some(n => /signal|research|analyze/.test(n))) {
        suggestions.push(
            { text: isVi ? '💰 Portfolio' : '💰 Portfolio', data: 'sr|portfolio' },
            { text: isVi ? '📊 Phân tích token' : '📊 Analyze Token', data: 'sr|analyze' },
            { text: isVi ? '🔔 Đặt alert' : '🔔 Set Alert', data: 'sr|alert' }
        );
    }
    // Copy Trading
    else if (toolNames.some(n => /copy_trading/.test(n))) {
        suggestions.push(
            { text: isVi ? '📋 Leaderboard' : '📋 Leaderboard', data: 'sr|leaderboard' },
            { text: isVi ? '💼 Portfolio' : '💼 Portfolio', data: 'sr|portfolio' }
        );
    }
    // Auto Trading
    else if (toolNames.some(n => /auto_trading/.test(n))) {
        suggestions.push(
            { text: isVi ? '📊 Trạng thái agent' : '📊 Agent Status', data: 'sr|agent_status' },
            { text: isVi ? '💼 Portfolio' : '💼 Portfolio', data: 'sr|portfolio' }
        );
    }
    // Arbitrage
    else if (toolNames.some(n => /arbitrage/.test(n))) {
        suggestions.push(
            { text: isVi ? '💱 Thực hiện swap' : '💱 Execute Swap', data: 'sr|swap' },
            { text: isVi ? '📊 Scan token khác' : '📊 Scan Another', data: 'sr|scan' }
        );
    }
    // Generic/Default
    else {
        // Context-detect from response text
        if (/portfolio|balance|wallet/i.test(lower)) {
            suggestions.push({ text: isVi ? '💼 Xem portfolio' : '💼 View Portfolio', data: 'sr|portfolio' });
        }
        if (/price|token|chart/i.test(lower)) {
            suggestions.push({ text: isVi ? '📊 Xem giá token' : '📊 Check Prices', data: 'sr|prices' });
        }
        if (suggestions.length === 0) {
            suggestions.push(
                { text: isVi ? '💰 Portfolio' : '💰 Portfolio', data: 'sr|portfolio' },
                { text: isVi ? '📊 Trending' : '📊 Trending', data: 'sr|trending' }
            );
        }
    }

    return suggestions.slice(0, 3);
}

/**
 * Build inline keyboard from smart reply suggestions
 */
function buildSmartReplyKeyboard(suggestions) {
    if (!suggestions?.length) return null;
    return {
        inline_keyboard: [
            suggestions.map(s => ({
                text: s.text,
                callback_data: s.data
            }))
        ]
    };
}

// Map callback data to AI prompts
const SMART_REPLY_PROMPTS = {
    'sr|research': 'Deep research the token we just discussed',
    'sr|alert': 'Set a price alert for the token we just discussed',
    'sr|swap': 'I want to swap tokens',
    'sr|balance': 'Check my wallet balance',
    'sr|trending': 'Show me top trending tokens',
    'sr|signals': 'Show whale signals',
    'sr|transfer': 'I want to transfer tokens',
    'sr|portfolio': 'Check my portfolio',
    'sr|analyze': 'Analyze the token we discussed',
    'sr|leaderboard': 'Show copy trading leaderboard',
    'sr|agent_status': 'Show my auto trading agent status',
    'sr|scan': 'Scan arbitrage for another token',
    'sr|prices': 'Check token prices',
};

/**
 * Register smart reply callback handlers
 */
function registerSmartReplyCallbacks(bot, processMessage) {
    bot.on('callback_query', async (query) => {
        const data = query.data || '';
        if (!data.startsWith('sr|')) return;

        const prompt = SMART_REPLY_PROMPTS[data];
        if (!prompt) return;

        try {
            await bot.answerCallbackQuery(query.id, { text: '⏳...' }).catch(() => {});
            // Construct a mock message to process through AI
            const msg = {
                chat: query.message?.chat,
                from: query.from,
                text: prompt,
                message_id: query.message?.message_id,
                reply_to_message: query.message
            };
            if (typeof processMessage === 'function') {
                await processMessage(msg, prompt);
            }
        } catch (err) {
            log.warn('Smart reply error:', err.message);
        }
    });
}

// ═══════════════════════════════════════════════════════
// T4: Rate-Limited AI Queue
// ═══════════════════════════════════════════════════════

class AIRequestQueue {
    constructor(maxConcurrent = 3, maxPerUser = 1) {
        this.maxConcurrent = maxConcurrent;
        this.maxPerUser = maxPerUser;
        this.running = 0;
        this.userRunning = new Map(); // userId -> count
        this.queue = []; // { userId, fn, resolve, reject }
    }

    /**
     * Enqueue an AI request. Returns a promise that resolves when complete.
     * @param {string} userId - User ID
     * @param {Function} fn - Async function to execute
     * @returns {Promise}
     */
    async enqueue(userId, fn) {
        const userCount = this.userRunning.get(userId) || 0;
        // If user already has max requests, reject immediately
        if (userCount >= this.maxPerUser) {
            return { queued: false, reason: 'busy' };
        }

        return new Promise((resolve, reject) => {
            this.queue.push({ userId, fn, resolve, reject });
            this._process();
        });
    }

    async _process() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

        const item = this.queue.shift();
        if (!item) return;

        this.running++;
        const uc = this.userRunning.get(item.userId) || 0;
        this.userRunning.set(item.userId, uc + 1);

        try {
            const result = await item.fn();
            item.resolve(result);
        } catch (err) {
            item.reject(err);
        } finally {
            this.running--;
            const current = this.userRunning.get(item.userId) || 1;
            if (current <= 1) this.userRunning.delete(item.userId);
            else this.userRunning.set(item.userId, current - 1);
            // Process next in queue
            this._process();
        }
    }

    get stats() {
        return {
            running: this.running,
            queued: this.queue.length,
            users: this.userRunning.size
        };
    }
}

// Singleton queue instance
const aiQueue = new AIRequestQueue(5, 2);

// ═══════════════════════════════════════════════════════
// T6: Multi-Step Trading Wizard
// ═══════════════════════════════════════════════════════

// In-memory wizard sessions: userId -> { step, data, createdAt }
const wizardSessions = new Map();
const WIZARD_TTL = 10 * 60 * 1000; // 10 minutes

// HTML escape for Telegram messages
const _escWz = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Start or continue a trading wizard session
 */
function startTradingWizard(userId, lang = 'en') {
    const isVi = lang === 'vi';
    wizardSessions.set(userId, {
        step: 'select_from',
        data: {},
        createdAt: Date.now()
    });
    return {
        text: isVi
            ? '🧭 <b>Hướng dẫn Swap từng bước</b>\n\n📌 Bước 1/4: Chọn token nguồn\n\nGõ tên token bạn muốn bán (ví dụ: OKB, ETH, USDT):'
            : '🧭 <b>Step-by-Step Swap Wizard</b>\n\n📌 Step 1/4: Select source token\n\nType the token you want to sell (e.g., OKB, ETH, USDT):',
        keyboard: {
            inline_keyboard: [
                [
                    { text: 'OKB', callback_data: 'wz|from|OKB' },
                    { text: 'ETH', callback_data: 'wz|from|ETH' },
                    { text: 'USDT', callback_data: 'wz|from|USDT' }
                ],
                [{ text: isVi ? '❌ Hủy' : '❌ Cancel', callback_data: 'wz|cancel' }]
            ]
        }
    };
}

/**
 * Process wizard step
 */
function processWizardStep(userId, input, lang = 'en') {
    const session = wizardSessions.get(userId);
    if (!session) return null;

    // Expire old sessions
    if (Date.now() - session.createdAt > WIZARD_TTL) {
        wizardSessions.delete(userId);
        return null;
    }

    const isVi = lang === 'vi';

    switch (session.step) {
        case 'select_from': {
            session.data.fromToken = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
            session.step = 'select_to';
            const from = _escWz(session.data.fromToken);
            return {
                text: isVi
                    ? `✅ Token nguồn: <b>${from}</b>\n\n📌 Bước 2/4: Chọn token đích\n\nGõ tên token bạn muốn mua:`
                    : `✅ Source: <b>${from}</b>\n\n📌 Step 2/4: Select target token\n\nType the token you want to buy:`,
                keyboard: {
                    inline_keyboard: [
                        [
                            { text: 'OKB', callback_data: 'wz|to|OKB' },
                            { text: 'ETH', callback_data: 'wz|to|ETH' },
                            { text: 'USDT', callback_data: 'wz|to|USDT' },
                            { text: 'BANMAO', callback_data: 'wz|to|BANMAO' }
                        ],
                        [{ text: isVi ? '⬅️ Quay lại' : '⬅️ Back', callback_data: 'wz|back|select_from' },
                         { text: isVi ? '❌ Hủy' : '❌ Cancel', callback_data: 'wz|cancel' }]
                    ]
                }
            };
        }

        case 'select_to': {
            session.data.toToken = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
            session.step = 'enter_amount';
            const from2 = _escWz(session.data.fromToken);
            const to2 = _escWz(session.data.toToken);
            return {
                text: isVi
                    ? `✅ ${from2} ➔ <b>${to2}</b>\n\n📌 Bước 3/4: Nhập số lượng\n\nNhập số lượng ${from2} muốn swap:`
                    : `✅ ${from2} ➔ <b>${to2}</b>\n\n📌 Step 3/4: Enter amount\n\nEnter the amount of ${from2} to swap:`,
                keyboard: {
                    inline_keyboard: [
                        [
                            { text: '10%', callback_data: 'wz|amt|10' },
                            { text: '25%', callback_data: 'wz|amt|25' },
                            { text: '50%', callback_data: 'wz|amt|50' },
                            { text: '100%', callback_data: 'wz|amt|100' }
                        ],
                        [{ text: isVi ? '⬅️ Quay lại' : '⬅️ Back', callback_data: 'wz|back|select_to' },
                         { text: isVi ? '❌ Hủy' : '❌ Cancel', callback_data: 'wz|cancel' }]
                    ]
                }
            };
        }

        case 'enter_amount': {
            // Sanitize amount: allow digits, dots, % only
            session.data.amount = String(input).replace(/[^0-9.%]/g, '').slice(0, 20);
            session.step = 'confirm';
            const from3 = _escWz(session.data.fromToken);
            const to3 = _escWz(session.data.toToken);
            const amt3 = _escWz(session.data.amount);
            return {
                text: isVi
                    ? `🧾 <b>Xác nhận Swap</b>\n━━━━━━━━━━━━━━━━━━\n` +
                      `📤 Bán: <code>${amt3}</code> ${from3}\n` +
                      `📥 Mua: ${to3}\n` +
                      `━━━━━━━━━━━━━━━━━━\n\n⚠️ Vui lòng xác nhận giao dịch:`
                    : `🧾 <b>Swap Confirmation</b>\n━━━━━━━━━━━━━━━━━━\n` +
                      `📤 Sell: <code>${amt3}</code> ${from3}\n` +
                      `📥 Buy: ${to3}\n` +
                      `━━━━━━━━━━━━━━━━━━\n\n⚠️ Please confirm this trade:`,
                keyboard: {
                    inline_keyboard: [
                        [
                            { text: isVi ? '✅ Xác nhận Swap' : '✅ Confirm Swap', callback_data: 'wz|confirm' },
                            { text: isVi ? '❌ Hủy' : '❌ Cancel', callback_data: 'wz|cancel' }
                        ],
                        [{ text: isVi ? '⬅️ Sửa số lượng' : '⬅️ Edit Amount', callback_data: 'wz|back|enter_amount' }]
                    ]
                }
            };
        }

        default:
            wizardSessions.delete(userId);
            return null;
    }
}

/**
 * Get completed wizard data and clear session
 */
function completeWizard(userId) {
    const session = wizardSessions.get(userId);
    if (!session || session.step !== 'confirm') return null;
    wizardSessions.delete(userId);
    return session.data;
}

function cancelWizard(userId) {
    wizardSessions.delete(userId);
}

function hasActiveWizard(userId) {
    const session = wizardSessions.get(userId);
    if (!session) return false;
    if (Date.now() - session.createdAt > WIZARD_TTL) {
        wizardSessions.delete(userId);
        return false;
    }
    return true;
}

// ═══════════════════════════════════════════════════════
// T3: Image Analysis for DeFi (helper functions)
// ═══════════════════════════════════════════════════════

/**
 * Build a DeFi-aware image analysis prompt
 * @param {string} userCaption - Optional user caption
 * @returns {string} System prompt for DeFi image analysis
 */
function buildDeFiImagePrompt(userCaption = '') {
    return `You are an expert DeFi analyst examining a user's screenshot. Analyze the image and provide:
1. **Token Identification**: Identify any tokens, prices, pools, or DEX interfaces visible
2. **Key Metrics**: Extract any visible prices, APY, TVL, volume, market cap data
3. **Risk Assessment**: Note any red flags (rug pull indicators, low liquidity, honeypot warnings)
4. **Actionable Insights**: Suggest what the user could do next (swap, add liquidity, set alert)

If the image shows a DEX interface (Uniswap, PancakeSwap, OKX DEX, etc.), identify:
- Which tokens are being traded
- Current exchange rate
- Slippage settings if visible
- Gas estimates if shown

${userCaption ? `User's note: "${userCaption}"` : ''}
Respond concisely, use bullet points. If the image doesn't contain DeFi/crypto content, analyze normally.`;
}

module.exports = {
    // T2
    generateSmartReplies,
    buildSmartReplyKeyboard,
    registerSmartReplyCallbacks,
    SMART_REPLY_PROMPTS,
    // T4
    AIRequestQueue,
    aiQueue,
    // T6
    startTradingWizard,
    processWizardStep,
    completeWizard,
    cancelWizard,
    hasActiveWizard,
    wizardSessions,
    // T3
    buildDeFiImagePrompt,
};
