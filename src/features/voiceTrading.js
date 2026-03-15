/**
 * Voice Trading AI — Idea #8
 * Extends voice recognition to support trading-specific commands
 */
const logger = require('../core/logger');
const log = logger.child('VoiceTrade');

// ═══════════════════════════════════════════════════════
// Vietnamese voice command patterns
// ═══════════════════════════════════════════════════════
const VOICE_COMMANDS = {
    swap: {
        patterns: [
            /mua\s+(?:nhanh\s+)?(?:khoảng\s+|chừng\s+|cỡ\s+)?(?:khoảng\s+)?(\d+(?:\.\d+)?)\s+(\w+)/i,
            /swap\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(?:sang|to|thành|qua)\s+(\w+)/i,
            /bán\s+(?:hết\s+)?(\w+)/i,
            /buy\s+(?:about\s+)?(\d+(?:\.\d+)?)\s+(\w+)/i,
            /sell\s+(?:all\s+)?(\w+)/i
        ],
        extract: (match, text) => {
            const lower = text.toLowerCase();
            if (lower.includes('mua nhanh') || lower.includes('buy')) {
                return { action: 'buy', amount: match[2] || match[1], token: match[3] || match[2] };
            }
            if (lower.includes('bán hết') || lower.includes('sell all')) {
                return { action: 'sell_all', token: match[2] || match[1] };
            }
            if (lower.includes('swap')) {
                return { action: 'swap', amount: match[1], fromToken: match[2], toToken: match[3] };
            }
            return null;
        }
    },
    signal: {
        patterns: [
            /(?:cá voi|whale|smart money)\s+(?:mua|buy|đang|gì)/i,
            /tín hiệu|signal|ai đang mua/i,
            /check signal/i
        ],
        action: 'check_signals'
    },
    portfolio: {
        patterns: [
            /(?:ví|wallet|portfolio|tài sản|balance|số dư)/i,
            /(?:kiểm tra|check)\s+(?:ví|wallet|balance)/i
        ],
        action: 'check_portfolio'
    },
    research: {
        patterns: [
            /(?:phân tích|analyze|research|đánh giá)\s+(\w+)/i,
            /(?:token|coin)\s+(\w+)\s+(?:có tốt|safe|an toàn)/i
        ],
        extract: (match) => ({ action: 'research', token: match[1] })
    },
    price: {
        patterns: [
            /(?:giá|price)\s+(\w+)/i,
            /(\w+)\s+(?:bao nhiêu|how much)/i
        ],
        extract: (match) => ({ action: 'price', token: match[1] })
    }
};

// Safety keywords that require verbal confirmation
const SAFETY_CONFIRM_KEYWORDS = ['xác nhận', 'confirm', 'ok', 'yes', 'đồng ý', 'chấp nhận'];
const SAFETY_CANCEL_KEYWORDS = ['hủy', 'cancel', 'no', 'không', 'stop', 'thôi'];

/**
 * Parse a voice transcription into a trading intent
 * @param {string} text - Transcribed voice text
 * @param {string} lang - User language
 * @returns {object|null} Parsed intent or null
 */
function parseVoiceIntent(text, lang = 'en') {
    if (!text || text.length < 2) return null;
    const lower = text.toLowerCase().trim();

    // Check safety responses first
    if (SAFETY_CONFIRM_KEYWORDS.some(k => lower.includes(k))) {
        return { type: 'confirmation', value: true };
    }
    if (SAFETY_CANCEL_KEYWORDS.some(k => lower.includes(k))) {
        return { type: 'confirmation', value: false };
    }

    // Try each command category
    for (const [category, config] of Object.entries(VOICE_COMMANDS)) {
        for (const pattern of config.patterns) {
            const match = lower.match(pattern);
            if (match) {
                if (config.extract) {
                    const result = config.extract(match, text);
                    if (result) return { type: category, ...result };
                } else {
                    return { type: category, action: config.action };
                }
            }
        }
    }

    return null;
}

/**
 * Fallback: return raw text for AI to process if no pattern matches
 * This ensures even unrecognized voice commands get handled
 */
function parseVoiceIntentOrFallback(text, lang = 'en') {
    const parsed = parseVoiceIntent(text, lang);
    if (parsed) return parsed;
    // Return raw text — let AI interpret it
    return { type: 'raw', text: text.trim() };
}

/**
 * Convert voice intent to AI tool call parameters
 */
function intentToToolCall(intent) {
    switch (intent.type) {
        case 'swap':
            if (intent.action === 'buy') {
                return {
                    toolName: 'execute_swap',
                    args: {
                        fromTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // native
                        toTokenAddress: intent.token,
                        amount: intent.amount,
                        chainIndex: '196'
                    },
                    requiresConfirmation: true
                };
            }
            if (intent.action === 'sell_all') {
                return {
                    toolName: 'execute_swap',
                    args: {
                        fromTokenAddress: intent.token,
                        toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                        amount: 'all',
                        chainIndex: '196'
                    },
                    requiresConfirmation: true
                };
            }
            if (intent.action === 'swap') {
                return {
                    toolName: 'execute_swap',
                    args: {
                        fromTokenAddress: intent.fromToken,
                        toTokenAddress: intent.toToken,
                        amount: intent.amount,
                        chainIndex: '196'
                    },
                    requiresConfirmation: true
                };
            }
            return null;

        case 'signal':
            return { toolName: 'get_signal_list', args: { chainIndex: '196', walletType: '4' }, requiresConfirmation: false };

        case 'portfolio':
            return { toolName: 'get_wallet_balance', args: {}, requiresConfirmation: false };

        case 'research':
            return { toolName: 'deep_research_token', args: { chainIndex: '196', tokenContractAddress: intent.token }, requiresConfirmation: false };

        case 'price':
            return { toolName: 'get_token_price', args: { tokens: [{ tokenContractAddress: intent.token, chainIndex: '196' }] }, requiresConfirmation: false };

        default:
            return null;
    }
}

/**
 * Format voice trading response with audio-friendly text
 */
function formatVoiceResponse(intent, result, lang = 'en') {
    const prefix = lang === 'vi' ? '🎙️ <b>Lệnh giọng nói:</b>\n' : '🎙️ <b>Voice Command:</b>\n';
    let description = '';

    switch (intent.type) {
        case 'swap':
            description = lang === 'vi'
                ? `💱 ${intent.action === 'buy' ? 'Mua' : 'Bán'} ${intent.amount || 'tất cả'} ${intent.token || '?'}`
                : `💱 ${intent.action === 'buy' ? 'Buy' : 'Sell'} ${intent.amount || 'all'} ${intent.token || '?'}`;
            break;
        case 'signal':
            description = lang === 'vi' ? '📡 Kiểm tra tín hiệu cá voi' : '📡 Checking whale signals';
            break;
        case 'portfolio':
            description = lang === 'vi' ? '💼 Kiểm tra ví' : '💼 Checking portfolio';
            break;
        case 'research':
            description = lang === 'vi' ? `🔬 Phân tích ${intent.token}` : `🔬 Researching ${intent.token}`;
            break;
        default:
            description = lang === 'vi' ? '🎤 Lệnh nhận diện' : '🎤 Command recognized';
    }

    return prefix + description;
}

module.exports = { parseVoiceIntent, parseVoiceIntentOrFallback, intentToToolCall, formatVoiceResponse, VOICE_COMMANDS, SAFETY_CONFIRM_KEYWORDS };
