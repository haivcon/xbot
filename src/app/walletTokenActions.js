const ethersLib = require('ethers');
const ethers = ethersLib.ethers || ethersLib;
const { t } = require('../core/i18n');
const { escapeHtml } = require('../utils/text');
const { normalizeAddressSafe, shortenAddress, normalizeNumeric } = require('../utils/helpers');
const { formatTokenQuantity, subtractDecimalStrings } = require('../utils/format');
const { formatCopyableValueHtml } = require('./utils/markdown');
const { buildThreadedOptions } = require('./utils/telegram');
const { walletTokenActionCache, tokenDecimalsCache, tokenPriceCache } = require('../core/state');
const {
    WALLET_TOKEN_ACTIONS,
    WALLET_TOKEN_ACTION_LOOKUP,
    WALLET_TOKEN_BUTTON_LIMIT,
    WALLET_TOKEN_TX_HISTORY_LIMIT,
    WALLET_TOKEN_HOLDER_LIMIT,
    WALLET_TOKEN_TRADE_LIMIT,
    WALLET_TOKEN_CANDLE_RECENT_BAR,
    WALLET_TOKEN_CANDLE_RECENT_LIMIT,
    WALLET_TOKEN_CANDLE_DAY_SPAN,
    WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS,
    WALLET_RPC_HEALTH_TIMEOUT,
    hasOkxCredentials
} = require('../config/env');

function createWalletTokenActions({
    buildOkxPortfolioAnalysisUrl,
    registerWalletTokenContext,
    callOkxDexEndpoint,
    fetchOkxDexBalanceSnapshot,
    fetchOkxDexWalletHoldings,
    unwrapOkxData,
    unwrapOkxFirst,
    pickOkxNumeric,
    extractOkxPriceValue
}) {const WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS || 15000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 15000;
})();
const WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS || 120000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 120000;
})();
const WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS || 60000);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 60000;
})();
const WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES || 256);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 256;
})();
const OKX_DEX_DEFAULT_MAX_RETRIES = (() => {
    const value = Number(process.env.OKX_DEX_DEFAULT_MAX_RETRIES || 3);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 3;
})();
const OKX_DEX_DEFAULT_RETRY_DELAY_MS = (() => {
    const value = Number(process.env.OKX_DEX_DEFAULT_RETRY_DELAY_MS || 1200);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1200;
})();
const walletTokenActionCache = new Map();
const ownerActionStates = new Map();
const WALLET_TOKEN_HISTORY_MAX_PAGES = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_MAX_PAGES || 4);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4;
})();
const WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES || 2);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
})();
const WALLET_TOKEN_HISTORY_FALLBACK_BAR = process.env.WALLET_TOKEN_HISTORY_FALLBACK_BAR || '1d';
const WALLET_TOKEN_HISTORY_FALLBACK_LIMIT = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_FALLBACK_LIMIT || 10);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
})();
const WALLET_TOKEN_HISTORY_DEFAULT_LIMIT = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_DEFAULT_LIMIT || 30);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
})();
const WALLET_TOKEN_HISTORY_DEFAULT_PERIOD = process.env.WALLET_TOKEN_HISTORY_DEFAULT_PERIOD || '1d';
const WALLET_TOKEN_HISTORY_MAX_LIMIT = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_MAX_LIMIT || 200);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200;
})();
const WALLET_TOKEN_HISTORY_PERIOD_MS = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '60d': 60 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
};
const WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP = {
    '30m': '30m',
    '1h': '1h',
    '12h': '1h',
    '1d': '1d',
    '7d': '1d',
    '30d': '1d',
    '60d': '1d',
    '90d': '1d'
};
const WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};
const OKX_CANDLE_BAR_MAP = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '1hour': '1H',
    '2h': '2H',
    '4h': '4H',
    '6h': '6H',
    '12h': '12H',
    '1d': '1D',
    '1day': '1D',
    '24h': '1D',
    '2d': '2D',
    '2day': '2D',
    '3d': '3D',
    '7d': '7D',
    '14d': '14D',
    '30d': '30D',
    '30day': '30D',
    '60d': '60D',
    '60day': '60D',
    '90d': '90D',
    '90day': '90D',
    '1w': '1W',
    '1mo': '1M',
    '1mth': '1M',
    '1month': '1M',
    '1mutc': '1Mutc',
    '3mutc': '3Mutc',
    '6hutc': '6Hutc',
    '12hutc': '12Hutc',
    '1dutc': '1Dutc',
    '1wutc': '1Wutc'
};
const TELEGRAM_MESSAGE_SAFE_LENGTH = (() => {
    const value = Number(process.env.TELEGRAM_MESSAGE_SAFE_LENGTH || 3900);
    return Number.isFinite(value) && value > 100 ? Math.min(Math.floor(value), 4050) : 3900;
})();
const WALLET_TOKEN_HOLDER_LIMIT = 20;
const WALLET_TOKEN_TRADE_LIMIT = 1;
const WALLET_TOKEN_TX_HISTORY_LIMIT = 20;
const WALLET_TOKEN_CANDLE_DAY_SPAN = 7;
const WALLET_TOKEN_CANDLE_RECENT_LIMIT = 24;
const WALLET_TOKEN_CANDLE_RECENT_BAR = '1H';
const WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS = 1;
const WALLET_TOKEN_ACTIONS = [
    {
        key: 'current_price',
        labelKey: 'wallet_token_action_current_price',
        path: '/api/v6/dex/index/current-price',
        method: 'POST',
        bodyType: 'array'
    },
    {
        key: 'historical_price',
        labelKey: 'wallet_token_action_historical_price',
        path: '/api/v6/dex/index/historical-price',
        method: 'GET'
    },
    { key: 'candles', labelKey: 'wallet_token_action_candles', path: '/api/v6/dex/market/candles', method: 'GET' },
    {
        key: 'historical_candles',
        labelKey: 'wallet_token_action_historical_candles',
        path: '/api/v6/dex/market/historical-candles',
        method: 'GET'
    },
    { key: 'latest_price', labelKey: 'wallet_token_action_latest_price', path: '/api/v6/dex/market/trades', method: 'GET' },
    {
        key: 'price_info',
        labelKey: 'wallet_token_action_price_info',
        path: '/api/v6/dex/market/price-info',
        method: 'POST',
        bodyType: 'array'
    },
    {
        key: 'wallet_history',
        labelKey: 'wallet_token_action_wallet_history',
        path: '/api/v6/dex/post-transaction/transactions-by-address',
        method: 'GET'
    },
    { key: 'token_info', labelKey: 'wallet_token_action_token_info', path: '/api/v6/dex/market/token/basic-info', method: 'POST', bodyType: 'array' },
    { key: 'holder', labelKey: 'wallet_token_action_holder', path: '/api/v6/dex/market/token/holder', method: 'GET' }
];
const WALLET_TOKEN_ACTION_LOOKUP = WALLET_TOKEN_ACTIONS.reduce((map, action) => {
    map[action.key] = action;
    return map;
}, {});
const ERC20_MIN_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];
const ERC20_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
let xlayerProvider = null;
let xlayerWebsocketProvider = null;
try {
    if (XLAYER_RPC_URL) {
        xlayerProvider = new ethers.JsonRpcProvider(XLAYER_RPC_URL);
    }
} catch (error) {
    console.error(`[RPC] Không thể khởi tạo RPC Xlayer: ${error.message}`);
    xlayerProvider = null;
}
const walletWatchers = new Map();

function mapWithConcurrency(items, limit, mapper) {
    const tasks = Math.max(1, Math.min(limit || 1, items.length || 0));
    const results = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) {
                return;
            }

            try {
                results[index] = await mapper(items[index], index);
            } catch (error) {
                results[index] = undefined;
            }
        }
    };

    const pool = [];
    for (let i = 0; i < tasks; i += 1) {
        pool.push(runWorker());
    }

    return Promise.all(pool).then(() => results);
}

async function isProviderHealthy(provider, timeoutMs = WALLET_RPC_HEALTH_TIMEOUT) {
    if (!provider || typeof provider.getBlockNumber !== 'function') {
        return false;
    }

    try {
        await Promise.race([
            provider.getBlockNumber(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('rpc_health_timeout')), timeoutMs))
        ]);
        return true;
    } catch (error) {
        console.warn(`[RPC] Provider health check failed: ${error.message}`);
        return false;
    }
}

const CHECKIN_MAX_ATTEMPTS = 3;
const CHECKIN_SCIENCE_PROBABILITY = Math.min(
    Math.max(Number(process.env.CHECKIN_SCIENCE_PROBABILITY ?? 0.5), 0),
    1
);
const CHECKIN_SCHEDULER_INTERVAL = 45 * 1000;
const CHECKIN_DEFAULT_TIME = '08:00';
const CHECKIN_DEFAULT_TIMEZONE = 'UTC';
const CHECKIN_EMOTIONS = ['🤩', '👍', '💪', '😴', '😊', '🔥'];
const ADMIN_DETAIL_BULLET = '• ';
const CHECKIN_GOAL_PRESETS = [
    'checkin_goal_preset_learn',
    'checkin_goal_preset_task',
    'checkin_goal_preset_workout',
    'checkin_goal_preset_rest',
    'checkin_goal_preset_help'
];

const SCIENCE_CATEGORY_KEYS = ['physics', 'chemistry', 'okx', 'crypto'];
const QUESTION_TYPE_KEYS = ['math', ...SCIENCE_CATEGORY_KEYS];

const DEFAULT_QUESTION_WEIGHTS = (() => {
    if (Object.prototype.hasOwnProperty.call(process.env, 'CHECKIN_SCIENCE_PROBABILITY')) {
        const mathShare = Math.max(1 - CHECKIN_SCIENCE_PROBABILITY, 0);
        const scienceShare = Math.max(CHECKIN_SCIENCE_PROBABILITY, 0);
        if (mathShare + scienceShare > 0) {
            const sharedScience = SCIENCE_CATEGORY_KEYS.length > 0
                ? scienceShare / SCIENCE_CATEGORY_KEYS.length
                : scienceShare;
            return {
                math: mathShare,
                physics: sharedScience,
                chemistry: sharedScience,
                okx: sharedScience,
                crypto: sharedScience
            };
        }
    }
    return { math: 2, physics: 1, chemistry: 1, okx: 1, crypto: 1 };
})();

const QUESTION_WEIGHT_PRESETS = [
    { math: 40, physics: 15, chemistry: 15, okx: 15, crypto: 15 },
    { math: 34, physics: 22, chemistry: 22, okx: 11, crypto: 11 },
    { math: 30, physics: 20, chemistry: 20, okx: 15, crypto: 15 },
    { math: 25, physics: 25, chemistry: 25, okx: 12.5, crypto: 12.5 },
    { math: 50, physics: 15, chemistry: 15, okx: 10, crypto: 10 }
];

const CHECKIN_SCHEDULE_MAX_SLOTS = 6;
const CHECKIN_ADMIN_SUMMARY_MAX_ROWS = 30;
const CHECKIN_SCHEDULE_PRESETS = [
    { labelKey: 'checkin_admin_button_schedule_once', slots: ['08:00'] },
    { labelKey: 'checkin_admin_button_schedule_twice', slots: ['08:00', '20:00'] },
    { labelKey: 'checkin_admin_button_schedule_thrice', slots: ['07:00', '12:00', '21:00'] }
];
const CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT = 15;
const LEADERBOARD_MODE_CONFIG = [
    { key: 'streak', labelKey: 'checkin_admin_leaderboard_mode_streak' },
    { key: 'points', labelKey: 'checkin_admin_leaderboard_mode_points' },
    { key: 'total', labelKey: 'checkin_admin_leaderboard_mode_total' },
    { key: 'longest', labelKey: 'checkin_admin_leaderboard_mode_longest' }
];
const SUMMARY_DEFAULT_TIME = '21:00';
const SUMMARY_SCHEDULE_PRESETS = [
    { labelKey: 'checkin_admin_button_summary_schedule_once', slots: ['21:00'] },
    { labelKey: 'checkin_admin_button_summary_schedule_twice', slots: ['12:00', '21:00'] },
    { labelKey: 'checkin_admin_button_summary_schedule_thrice', slots: ['09:00', '15:00', '21:30'] }
];
const SUMMARY_BROADCAST_MAX_ROWS = 5;
const CHECKIN_ADMIN_DM_MAX_RECIPIENTS = 50;
const WELCOME_VERIFICATION_DEFAULTS = {
    enabled: false,
    timeLimitSeconds: 60,
    maxAttempts: 3,
    action: 'kick',
    mathWeight: DEFAULT_QUESTION_WEIGHTS.math,
    physicsWeight: DEFAULT_QUESTION_WEIGHTS.physics,
    chemistryWeight: DEFAULT_QUESTION_WEIGHTS.chemistry,
    okxWeight: DEFAULT_QUESTION_WEIGHTS.okx,
    cryptoWeight: DEFAULT_QUESTION_WEIGHTS.crypto,
    titleTemplate: ''
};
const WELCOME_ENFORCEMENT_ACTIONS = ['kick', 'mute', 'ban'];
const WELCOME_QUEUE_INTERVAL_MS = 200;
const WELCOME_QUEUE_MAX_PER_TICK = 2;

function sanitizeWeightValue(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return Math.max(fallback, 0);
    }
    return numeric;
}

function formatTemplateWithVariables(template, replacements = {}) {
    if (!template || typeof template !== 'string') {
        return '';
    }

    const map = new Map(Object.entries(replacements));
    return template.replace(/<([^>]+)>/g, (_, key) => {
        const normalized = key.trim().toLowerCase();
        return map.get(normalized) ?? `<${key}>`;
    });
}

function getQuestionWeights(settings = null) {
    const fallback = DEFAULT_QUESTION_WEIGHTS;
    const weights = {
        math: sanitizeWeightValue(settings?.mathWeight, fallback.math),
        physics: sanitizeWeightValue(settings?.physicsWeight, fallback.physics),
        chemistry: sanitizeWeightValue(settings?.chemistryWeight, fallback.chemistry),
        okx: sanitizeWeightValue(settings?.okxWeight, fallback.okx),
        crypto: sanitizeWeightValue(settings?.cryptoWeight, fallback.crypto)
    };
    const total = QUESTION_TYPE_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
    if (total <= 0) {
        return { ...DEFAULT_QUESTION_WEIGHTS };
    }
    return weights;
}

function pickQuestionType(settings = null) {
    const weights = getQuestionWeights(settings);
    const total = QUESTION_TYPE_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
    if (total <= 0) {
        return 'math';
    }
    const roll = Math.random() * total;
    let accumulator = 0;
    for (const key of QUESTION_TYPE_KEYS) {
        accumulator += weights[key] || 0;
        if (roll < accumulator) {
            return key;
        }
    }
    return QUESTION_TYPE_KEYS[QUESTION_TYPE_KEYS.length - 1] || 'math';
}

function formatQuestionWeightPercentages(weights) {
    const total = QUESTION_TYPE_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
    if (total <= 0) {
        const zero = {};
        QUESTION_TYPE_KEYS.forEach((key) => { zero[key] = '0%'; });
        return zero;
    }
    const toPercent = (value) => `${Math.round((value / total) * 1000) / 10}%`;
    const percents = {};
    QUESTION_TYPE_KEYS.forEach((key) => { percents[key] = toPercent(weights[key]); });
    return percents;
}

function normalizeTimeSlot(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
        return null;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function sanitizeScheduleSlots(values = []) {
    const seen = new Set();
    const sanitized = [];
    for (const value of values) {
        const slot = normalizeTimeSlot(value);
        if (!slot || seen.has(slot)) {
            continue;
        }
        seen.add(slot);
        sanitized.push(slot);
        if (sanitized.length >= CHECKIN_SCHEDULE_MAX_SLOTS) {
            break;
        }
    }
    return sanitized.sort();
}

function parseScheduleTextInput(text) {
    if (typeof text !== 'string') {
        return null;
    }

    const tokens = text.split(/[,;\s]+/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 0) {
        return null;
    }

    const sanitized = sanitizeScheduleSlots(tokens);
    return sanitized.length > 0 ? sanitized : null;
}

function getScheduleSlots(settings = null) {
    const raw = Array.isArray(settings?.autoMessageTimes) ? settings.autoMessageTimes : [];
    const fallback = settings?.checkinTime || CHECKIN_DEFAULT_TIME;
    const base = raw.length > 0 ? raw : [fallback];
    const sanitized = sanitizeScheduleSlots(base);
    return sanitized.length > 0 ? sanitized : [CHECKIN_DEFAULT_TIME];
}

function getSummaryScheduleSlots(settings = null) {
    const raw = Array.isArray(settings?.summaryMessageTimes) ? settings.summaryMessageTimes : [];
    const sanitized = sanitizeScheduleSlots(raw);
    if (sanitized.length > 0) {
        return sanitized;
    }
    if (Number(settings?.summaryMessageEnabled) === 1) {
        return getScheduleSlots(settings);
    }
    return [];
}

const pendingCheckinChallenges = new Map();
const pendingEmotionPrompts = new Map();
const pendingGoalInputs = new Map();
const pendingSecretMessages = new Map();
const checkinAdminStates = new Map();
const checkinAdminMenus = new Map();
const helpMenuStates = new Map();
const adminHubSessions = new Map();
const idTelegramSessions = new Map();
const registerWizardStates = new Map();
const txhashWizardStates = new Map();
const tokenWizardStates = new Map();
const contractWizardStates = new Map();
const aiApiAddPrompts = new Map();
const rmchatBotMessages = new Map();
const rmchatUserMessages = new Map();
let checkinSchedulerTimer = null;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBotStartLink(payload = '') {
    if (!BOT_USERNAME) {
        return null;
    }

    const trimmedPayload = typeof payload === 'string' && payload.trim() ? payload.trim() : '';
    const suffix = trimmedPayload ? `?start=${encodeURIComponent(trimmedPayload)}` : '';
    return `https://t.me/${BOT_USERNAME}${suffix}`;
}

function scheduleMessageDeletion(chatId, messageId, delayMs = 15000) {
    if (!chatId || !messageId) {
        return;
    }

    const timer = setTimeout(() => {
        bot.deleteMessage(chatId, messageId).catch(() => { /* ignore */ });
    }, Math.max(delayMs, 1000));

    if (typeof timer.unref === 'function') {
        timer.unref();
    }
}

async function sendEphemeralMessage(chatId, text, options = {}, delayMs = 15000) {
    const message = await bot.sendMessage(chatId, text, options);
    scheduleMessageDeletion(chatId, message.message_id, delayMs);
    return message;
}

function rememberRmchatMessage(collection, chatId, messageId, limit = 300) {
    if (!chatId || !messageId) {
        return;
    }

    const key = chatId.toString();
    const existing = collection.get(key) || [];
    if (!existing.includes(messageId)) {
        const next = [...existing, messageId];
        while (next.length > limit) {
            next.shift();
        }
        collection.set(key, next);
    }
}

async function purgeRmchatMessages(collection, chatId) {
    if (!chatId) {
        return 0;
    }

    const key = chatId.toString();
    const ids = collection.get(key) || [];
    let deleted = 0;
    for (const id of ids) {
        try {
            await bot.deleteMessage(chatId, id);
            deleted += 1;
        } catch (error) {
            // ignore missing permissions or missing messages
        }
    }
    collection.delete(key);
    return deleted;
}

function normalizeAddress(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return ethers.getAddress(trimmed);
    } catch (error) {
        const basicHexPattern = /^0x[0-9a-fA-F]{40}$/;
        if (basicHexPattern.test(trimmed)) {
            return trimmed;
        }
    }

    return null;
}

function normalizeOkxConfigAddress(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return ethers.getAddress(trimmed);
    } catch (error) {
        const basicHexPattern = /^0x[0-9a-fA-F]{40}$/;
        if (basicHexPattern.test(trimmed)) {
            return trimmed;
        }
    }

    return null;
}

// --- Kiểm tra Cấu hình ---
if (!TELEGRAM_TOKEN) {
    console.error("LỖI NGHIÊM TRỌNG: Thiếu TELEGRAM_TOKEN trong file .env!");
    process.exit(1);
}

// --- KHỞI TẠO CÁC DỊCH VỤ ---
// db.init() sẽ được gọi trong hàm main()
const app = express();
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const originalAnswerCallbackQuery = bot.answerCallbackQuery.bind(bot);
bot.answerCallbackQuery = async (...args) => {
    try {
        return await originalAnswerCallbackQuery(...args);
    } catch (error) {
        const description = error?.response?.body?.description || error?.message || '';
        if (error?.code === 'ETELEGRAM' && /query is too old|query ID is invalid/i.test(description)) {
            console.warn(`[Callback] Ignored stale callback query: ${sanitizeSecrets(description)}`);
            return null;
        }

        console.error(`[Callback] Failed to answer callback query: ${sanitizeSecrets(description || error?.toString())}`);
        return null;
    }
};

const originalSendMessage = bot.sendMessage.bind(bot);
bot.sendMessage = async (chatId, text, options = {}) => {
    const message = await originalSendMessage(chatId, text, options);
    rememberRmchatMessage(rmchatBotMessages, chatId, message?.message_id);
    return message;
};

// Hàm 't' (translate) nội bộ
function t(lang_code, key, variables = {}) {
    return t_(lang_code, key, variables);
}

function resolveLangCode(lang_code) {
    return normalizeLanguageCode(lang_code || defaultLang);
}

function escapeHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const EXTENDED_PICTOGRAPHIC_REGEX = /\p{Extended_Pictographic}/u;
let graphemeSegmenter;
try {
    graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
} catch (err) {
    graphemeSegmenter = null;
}

function isFullWidthCodePoint(codePoint) {
    if (Number.isNaN(codePoint)) {
        return false;
    }

    return (
        codePoint >= 0x1100 &&
        (
            codePoint <= 0x115f ||
            codePoint === 0x2329 ||
            codePoint === 0x232a ||
            (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
            (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
            (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
            (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
            (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
            (codePoint >= 0xff00 && codePoint <= 0xff60) ||
            (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
            (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
            (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
        )
    );
}

function measureDisplayWidth(text) {
    const graphemes = graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(text || ''), (item) => item.segment)
        : Array.from(text || '');

    let width = 0;
    for (const grapheme of graphemes) {
        const codePoint = grapheme.codePointAt(0);
        if (EXTENDED_PICTOGRAPHIC_REGEX.test(grapheme) || isFullWidthCodePoint(codePoint)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

function padDisplayText(text, width) {
    const raw = text || '';
    const len = measureDisplayWidth(raw);
    if (len >= width) {
        return raw;
    }
    return raw + ' '.repeat(width - len);
}

function looksLikeTableRow(line) {
    if (!line || typeof line !== 'string') {
        return false;
    }
    const pipeCount = (line.match(/\|/g) || []).length;
    return pipeCount >= 2;
}

function isTableSeparatorLine(line) {
    if (!line || typeof line !== 'string') {
        return false;
    }
    const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
    if (!cells.length) {
        return false;
    }
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeTableCellText(text) {
    if (text === undefined || text === null) {
        return '';
    }

    let cleaned = String(text);

    cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    cleaned = cleaned.replace(/[`*_~]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

function mapBoldChar(char) {
    const code = char.codePointAt(0);
    if (code >= 0x41 && code <= 0x5a) {
        return String.fromCodePoint(0x1d400 + (code - 0x41));
    }
    if (code >= 0x61 && code <= 0x7a) {
        return String.fromCodePoint(0x1d41a + (code - 0x61));
    }
    if (code >= 0x30 && code <= 0x39) {
        return String.fromCodePoint(0x1d7ce + (code - 0x30));
    }
    return char;
}

function formatCommandText(commandText, { context = 'html' } = {}) {
    if (!commandText) {
        return '';
    }

    if (context === 'html') {
        return `<b>${escapeHtml(commandText)}</b>`;
    }

    const mapped = Array.from(commandText)
        .map((ch) => mapBoldChar(ch))
        .join('');

    return mapped;
}

function formatCommandLabel(commandText, { icon = '', context = 'html' } = {}) {
    const formatted = formatCommandText(commandText, { context });
    if (!formatted) {
        return icon || '';
    }
    return icon ? `${icon} ${formatted}` : formatted;
}

function formatMarkdownTableBlock(lines, options = {}) {
    const MAX_COLUMN_WIDTH = options.maxColumnWidth || 40;
    const MIN_COLUMN_WIDTH = options.minColumnWidth || 6;
    const MAX_TABLE_WIDTH = options.maxWidth || 70;
    const TARGET_TABLE_WIDTH = Math.min(options.targetWidth || MAX_TABLE_WIDTH, MAX_TABLE_WIDTH);

    const borderStyle = options.borderStyle === 'ascii'
        ? {
            horizontal: '-',
            vertical: '|',
            topLeft: '+',
            topJoin: '+',
            topRight: '+',
            midLeft: '+',
            midJoin: '+',
            midRight: '+',
            bottomLeft: '+',
            bottomJoin: '+',
            bottomRight: '+'
        }
        : {
            horizontal: '─',
            vertical: '│',
            topLeft: '┌',
            topJoin: '┬',
            topRight: '┐',
            midLeft: '├',
            midJoin: '┼',
            midRight: '┤',
            bottomLeft: '└',
            bottomJoin: '┴',
            bottomRight: '┘'
        };
    const rows = [];

    for (const line of lines || []) {
        const parts = line.split('|').map((cell) => normalizeTableCellText(cell));
        if (parts.length && parts[0] === '') {
            parts.shift();
        }
        if (parts.length && parts[parts.length - 1] === '') {
            parts.pop();
        }

        if (!parts.length) {
            continue;
        }

        const isSeparator = parts.every((cell) => /^:?-{3,}:?$/.test(cell));
        if (isSeparator) {
            continue;
        }

        rows.push(parts);
    }

    if (!rows.length) {
        return lines.join('\n');
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const columnWidths = new Array(columnCount).fill(0);

    for (const row of rows) {
        while (row.length < columnCount) {
            row.push('');
        }
        row.forEach((cell, idx) => {
            const width = measureDisplayWidth(cell);
            columnWidths[idx] = Math.min(Math.max(columnWidths[idx], width), MAX_COLUMN_WIDTH);
        });
    }

    const totalWidth = () =>
        columnWidths.reduce((sum, width) => sum + width + 2, 0) + Math.max(0, columnCount - 1);

    const shrinkColumns = () => {
        const overBy = totalWidth() - MAX_TABLE_WIDTH;
        if (overBy <= 0) {
            return false;
        }

        const adjustable = columnWidths
            .map((width, idx) => ({ idx, width, spare: width - MIN_COLUMN_WIDTH }))
            .filter((col) => col.spare > 0);

        if (!adjustable.length) {
            return false;
        }

        const totalSpare = adjustable.reduce((sum, col) => sum + col.spare, 0);
        if (totalSpare <= 0) {
            return false;
        }

        adjustable.forEach((col) => {
            const share = Math.min(col.spare, Math.ceil((col.spare / totalSpare) * overBy));
            columnWidths[col.idx] -= share;
        });

        return true;
    };

    while (totalWidth() > MAX_TABLE_WIDTH) {
        if (!shrinkColumns()) {
            break;
        }
    }

    const growColumns = () => {
        const underBy = TARGET_TABLE_WIDTH - totalWidth();
        if (underBy <= 0) {
            return false;
        }

        const expandable = columnWidths
            .map((width, idx) => ({ idx, width, spare: MAX_COLUMN_WIDTH - width }))
            .filter((col) => col.spare > 0);

        if (!expandable.length) {
            return false;
        }

        const totalSpare = expandable.reduce((sum, col) => sum + col.spare, 0);
        if (totalSpare <= 0) {
            return false;
        }

        expandable.forEach((col) => {
            const share = Math.min(col.spare, Math.ceil((col.spare / totalSpare) * underBy));
            columnWidths[col.idx] += share;
        });

        return true;
    };

    while (totalWidth() < TARGET_TABLE_WIDTH) {
        if (!growColumns()) {
            break;
        }
    }

    const wrapCell = (cell, width) => {
        const words = (cell || '').split(/(\s+)/).filter((w) => w.length > 0);
        const linesOut = [];
        let current = '';
        let currentWidth = 0;

        const flush = () => {
            linesOut.push(current || '');
            current = '';
            currentWidth = 0;
        };

        for (const word of words) {
            const wordWidth = measureDisplayWidth(word);
            if (wordWidth > width) {
                if (current) {
                    flush();
                }
                let buffer = word;
                while (buffer.length) {
                    let slice = '';
                    let sliceWidth = 0;
                    for (const char of buffer) {
                        const charWidth = measureDisplayWidth(char);
                        if (sliceWidth + charWidth > width && slice) {
                            break;
                        }
                        slice += char;
                        sliceWidth += charWidth;
                    }
                    linesOut.push(slice);
                    buffer = buffer.slice(slice.length);
                }
                continue;
            }

            if (currentWidth + wordWidth > width) {
                flush();
            }

            current += word;
            currentWidth += wordWidth;
        }

        if (current || !linesOut.length) {
            flush();
        }

        return linesOut;
    };

    const buildBorder = (left, middle, right) => {
        const segments = columnWidths.map((width) => borderStyle.horizontal.repeat(width + 2));
        return `${left}${segments.join(middle)}${right}`;
    };

    const formatWrappedRow = (row) => {
        const wrappedCells = row.map((cell, idx) => wrapCell(cell, columnWidths[idx]));
        const rowHeight = Math.max(...wrappedCells.map((lines) => lines.length));
        const linesOut = [];

        for (let lineIdx = 0; lineIdx < rowHeight; lineIdx += 1) {
            const padded = wrappedCells.map((lines, idx) => padDisplayText(lines[lineIdx] || '', columnWidths[idx]));
            linesOut.push(`${borderStyle.vertical} ${padded.join(` ${borderStyle.vertical} `)} ${borderStyle.vertical}`);
        }

        return linesOut;
    };

    const output = [];
    output.push(buildBorder(borderStyle.topLeft, borderStyle.topJoin, borderStyle.topRight));
    formatWrappedRow(rows[0]).forEach((line) => output.push(line));

    if (rows.length > 1) {
        output.push(buildBorder(borderStyle.midLeft, borderStyle.midJoin, borderStyle.midRight));
        rows.slice(1).forEach((row, index, arr) => {
            formatWrappedRow(row).forEach((line) => output.push(line));
            if (index < arr.length - 1) {
                output.push(buildBorder(borderStyle.midLeft, borderStyle.midJoin, borderStyle.midRight));
            }
        });
    }

    output.push(buildBorder(borderStyle.bottomLeft, borderStyle.bottomJoin, borderStyle.bottomRight));

    return output.join('\n');
}

function formatBoldMarkdownToHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }

    const parts = [];
    let lastIndex = 0;
    const regex = /\*\*(.+?)\*\*/gs;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const [fullMatch, boldContent] = match;
        const start = match.index;
        if (start > lastIndex) {
            parts.push(escapeHtml(text.slice(lastIndex, start)));
        }
        parts.push(`<b>${escapeHtml(boldContent)}</b>`);
        lastIndex = start + fullMatch.length;
    }

    if (lastIndex < text.length) {
        parts.push(escapeHtml(text.slice(lastIndex)));
    }

    return parts.join('');
}

function escapeMarkdownV2(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text.replace(/([_*\\>`\[\]()~>#+\-=|{}.!])/g, '\\$1');
}

function convertMarkdownToTelegram(text) {
    if (typeof text !== 'string') {
        return '';
    }

    const placeholders = [];
    let working = text;

    const toPlaceholder = (content) => {
        const key = `@@MDPH${placeholders.length}@@`;
        placeholders.push({ key, content });
        return key;
    };

    working = working.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => `**${title.trim()}**`);

    const lines = working.split('\n');
    const rebuilt = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (looksLikeTableRow(line) && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
            const tableLines = [line];
            i += 1;
            while (i + 1 < lines.length && looksLikeTableRow(lines[i + 1])) {
                tableLines.push(lines[i + 1]);
                i += 1;
            }

            const formattedTable = formatMarkdownTableBlock(tableLines);
            rebuilt.push(toPlaceholder(['```', escapeMarkdownV2(formattedTable), '```'].join('\n')));
            continue;
        }

        rebuilt.push(line);
    }

    working = rebuilt.join('\n');

    working = working.replace(/```([\s\S]*?)```/g, (match, code) => toPlaceholder(['```', escapeMarkdownV2(code), '```'].join('\n')));
    working = working.replace(/`([^`]+)`/g, (match, code) => toPlaceholder(`\`${escapeMarkdownV2(code)}\``));
    working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const safeLabel = escapeMarkdownV2(label);
        const safeUrl = escapeMarkdownV2(url);
        return toPlaceholder(`[${safeLabel}](${safeUrl})`);
    });
    working = working.replace(/\*\*([^*]+)\*\*/g, (match, boldText) => toPlaceholder(`*${escapeMarkdownV2(boldText)}*`));
    working = working.replace(/__(.+?)__/g, (match, underlineText) => toPlaceholder(`__${escapeMarkdownV2(underlineText)}__`));
    working = working.replace(/~~(.+?)~~/g, (match, strikeText) => toPlaceholder(`~${escapeMarkdownV2(strikeText)}~`));
    working = working.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (match, italicText) => toPlaceholder(`_${escapeMarkdownV2(italicText)}_`));

    const escaped = escapeMarkdownV2(working);
    let restored = escaped;

    for (const { key, content } of placeholders) {
        restored = restored.split(key).join(content);
    }

    if (/@@MDPH\d+@@/.test(restored)) {
        restored = restored.replace(/@@MDPH\d+@@/g, '');
    }

    return restored;
}

function normalizeAddressSafe(address) {
    if (!address) {
        return null;
    }
    try {
        return ethers.getAddress(address);
    } catch (error) {
        return null;
    }
}

function shortenAddress(address) {
    if (!address || address.length < 10) {
        return address || '';
    }
    const normalized = normalizeAddressSafe(address) || address;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function formatCopyableValueHtml(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    if (!text) {
        return null;
    }
    const encoded = encodeURIComponent(text);
    const code = `<code>${escapeHtml(text)}</code>`;
    return `<a href="https://t.me/share/url?url=${encoded}&text=${encoded}">${code}</a>`;
}

function isOwner(userId, username) {
    if (!userId) {
        return false;
    }

    if (BOT_OWNER_ID && userId.toString() === BOT_OWNER_ID) {
        return true;
    }

    if (username && username.toLowerCase() === ADDITIONAL_OWNER_USERNAME) {
        return true;
    }

    return coOwnerIds.has(userId.toString());
}

function hasOwnerOverride(msg) {
    const executorId = msg?.ownerExecutorId;
    if (!executorId) {
        return false;
    }
    return isOwner(executorId.toString(), msg?.ownerExecutorUsername);
}

async function hydrateCoOwners() {
    try {
        const rows = await db.listCoOwners();
        coOwnerIds.clear();
        for (const row of rows || []) {
            if (row?.userId) {
                coOwnerIds.add(row.userId.toString());
            }
        }
    } catch (error) {
        console.error(`[Owner] Failed to hydrate co-owners: ${error.message}`);
    }
}

async function hydrateBannedUsers() {
    try {
        const rows = await db.listBannedUsers();
        bannedUserIds.clear();
        for (const row of rows || []) {
            if (row?.userId) {
                bannedUserIds.add(row.userId.toString());
            }
        }
    } catch (error) {
        console.error(`[Ban] Failed to hydrate banned users: ${error.message}`);
    }
}

async function hydrateBannedDevices() {
    try {
        const rows = await db.listBannedDevices();
        bannedDeviceIds.clear();
        for (const row of rows || []) {
            if (row?.deviceId) {
                bannedDeviceIds.add(row.deviceId.toString());
            }
        }
    } catch (error) {
        console.error(`[Ban] Failed to hydrate banned devices: ${error.message}`);
    }
}

function buildDeviceTargetId(deviceId) {
    if (!deviceId) {
        return null;
    }
    const normalized = deviceId.toString().trim();
    return normalized ? `${DEVICE_TARGET_PREFIX}${normalized}` : null;
}

function isDeviceTarget(targetId) {
    return typeof targetId === 'string' && targetId.startsWith(DEVICE_TARGET_PREFIX);
}

function parseDevicePayload(raw) {
    if (!raw || typeof raw !== 'string') {
        return null;
    }

    const attempts = [];

    attempts.push(raw);

    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        if (decoded && decoded !== raw) {
            attempts.push(decoded);
        }
    } catch (error) {
        // ignore
    }

    try {
        const decodedUri = decodeURIComponent(raw);
        if (decodedUri && decodedUri !== raw) {
            attempts.push(decodedUri);
        }
    } catch (error) {
        // ignore
    }

    for (const candidate of attempts) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (error) {
            continue;
        }
    }

    return null;
}

function extractTelegramDeviceInfo(update) {
    const source = update?.message || update;
    const from = update?.from || source?.from || null;
    const rawPayload = source?.web_app_data?.data || null;
    const payload = parseDevicePayload(rawPayload);

    const platform = payload?.platform || payload?.os || payload?.osName || payload?.system || null;
    const model = payload?.model || payload?.deviceModel || payload?.device || null;
    const clientId = payload?.clientId || payload?.client_id || null;

    let deviceId = payload?.deviceId || payload?.device_id || clientId || null;
    if (!deviceId && (platform || model) && from?.id) {
        deviceId = crypto.createHash('sha256')
            .update([from.id, platform || '', model || '', clientId || ''].join('|'))
            .digest('hex');
    }

    if (!deviceId && from?.id) {
        deviceId = `unknown-${from.id}`;
    }

    return {
        deviceId: deviceId || null,
        clientId: null,
        platform: null,
        deviceType: null,
        osVersion: null,
        appVersion: null,
        model: null,
        serial: null,
        isMobile: null,
        rawInfo: null
    };
}

async function recordDeviceInfo(update) {
    if (!update) {
        return null;
    }

    const info = extractTelegramDeviceInfo(update);
    if (info?.deviceId && update?.from?.id) {
        try {
            await db.upsertUserDevice(update.from.id, info);
        } catch (error) {
            console.warn(`[Device] Failed to persist device ${info.deviceId}: ${error.message}`);
        }
    }

    if (update) {
        update.__deviceInfo = info;
    }

    return info;
}

async function ensureDeviceInfo(update) {
    if (!update) {
        return null;
    }
    if (update.__deviceInfo) {
        return update.__deviceInfo;
    }
    return recordDeviceInfo(update);
}

async function loadDevicesForUsers(userIds = []) {
    const unique = Array.from(new Set((userIds || []).map((id) => id?.toString()).filter(Boolean)));
    const result = new Map();

    for (const id of unique) {
        try {
            const devices = await db.listUserDevices(id);
            result.set(id, devices || []);
        } catch (error) {
            console.warn(`[Device] Failed to load devices for ${id}: ${error.message}`);
            result.set(id, []);
        }
    }

    return result;
}

async function registerCoOwner(userId, fromInfo = {}, addedBy = null) {
    if (!userId) {
        return;
    }

    const fullName = [fromInfo.first_name, fromInfo.last_name].filter(Boolean).join(' ') || fromInfo.fullName;
    const payload = {
        username: fromInfo.username,
        fullName: fullName || null,
        addedBy: addedBy || BOT_OWNER_ID || null
    };

    try {
        await db.addCoOwner(userId, payload);
    } catch (error) {
        console.error(`[Owner] Failed to persist co-owner ${userId}: ${error.message}`);
    }

    coOwnerIds.add(userId.toString());
}

async function revokeCoOwner(userId) {
    if (!userId) {
        return;
    }
    try {
        await db.removeCoOwner(userId);
        coOwnerIds.delete(userId.toString());
    } catch (error) {
        console.error(`[Owner] Failed to revoke co-owner ${userId}: ${error.message}`);
    }
}

async function banUser(userId, fromInfo = {}, addedBy = null, deviceInfo = null) {
    if (!userId || isOwner(userId, fromInfo?.username)) {
        return;
    }
    const fullName = [fromInfo.first_name, fromInfo.last_name].filter(Boolean).join(' ') || fromInfo.fullName;
    try {
        await db.addBannedUser(userId, {
            username: fromInfo.username,
            fullName: fullName || null,
            addedBy: addedBy || null
        });
        bannedUserIds.add(userId.toString());

        const deviceCandidates = [];
        if (deviceInfo?.deviceId) {
            deviceCandidates.push(deviceInfo);
        }

        try {
            const knownDevices = await db.listUserDevices(userId);
            for (const device of knownDevices || []) {
                deviceCandidates.push(device);
            }
        } catch (error) {
            console.warn(`[Ban] Unable to load devices for user ${userId}: ${error.message}`);
        }

        for (const device of deviceCandidates) {
            if (!device?.deviceId) {
                continue;
            }
            try {
                await db.addBannedDevice(device.deviceId, {
                    userId: userId.toString(),
                    addedBy: addedBy || null
                });
                bannedDeviceIds.add(device.deviceId.toString());
            } catch (error) {
                console.warn(`[Ban] Failed to ban device ${device.deviceId}: ${error.message}`);
            }
        }
    } catch (error) {
        console.error(`[Ban] Failed to ban user ${userId}: ${error.message}`);
    }
}

async function unbanUser(userId) {
    if (!userId) {
        return;
    }
    try {
        await db.removeBannedUser(userId);
        bannedUserIds.delete(userId.toString());

        try {
            const knownDevices = await db.listUserDevices(userId);
            for (const device of knownDevices || []) {
                if (!device?.deviceId) {
                    continue;
                }
                await db.removeBannedDevice(device.deviceId);
                bannedDeviceIds.delete(device.deviceId.toString());
            }
        } catch (error) {
            console.warn(`[Ban] Unable to unban devices for user ${userId}: ${error.message}`);
        }
    } catch (error) {
        console.error(`[Ban] Failed to unban user ${userId}: ${error.message}`);
    }
}

function buildBanNotice(lang, userInfo = {}) {
    const fullName = [userInfo.first_name, userInfo.last_name, userInfo.fullName]
        .filter(Boolean)
        .join(' ') || userInfo.name || t(lang, 'owner_user_unknown');
    const username = userInfo.username ? `@${escapeHtml(userInfo.username)}` : t(lang, 'owner_banned_unknown_username');
    const idLabel = formatCopyableValueHtml(userInfo.id || userInfo.userId || userInfo.chatId) || escapeHtml(userInfo.id || userInfo.userId || userInfo.chatId || '');

    return t(lang, 'owner_banned_notice', {
        fullName: escapeHtml(fullName),
        telegramId: idLabel,
        username,
        contact: 'x.com/haivcon'
    });
}

async function enforceBanForMessage(msg) {
    const userId = msg?.from?.id?.toString();
    if (!userId || isOwner(userId, msg.from?.username) || hasOwnerOverride(msg)) {
        return false;
    }

    if (msg.__banHandled) {
        return true;
    }

    const deviceInfo = await ensureDeviceInfo(msg);
    const deviceId = deviceInfo?.deviceId;

    const isBanned = bannedUserIds.has(userId) || await db.isUserBanned(userId);
    const isDeviceBanned = deviceId && (bannedDeviceIds.has(deviceId) || await db.isDeviceBanned(deviceId));
    if (!isBanned && !isDeviceBanned) {
        return false;
    }

    bannedUserIds.add(userId);
    if (deviceId) {
        bannedDeviceIds.add(deviceId);
    }
    const lang = await getLang(msg);
    const notice = buildBanNotice(lang, {
        id: userId,
        username: msg.from?.username,
        first_name: msg.from?.first_name,
        last_name: msg.from?.last_name,
        fullName: msg.from ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() : ''
    });
    await sendReply(msg, notice, { reply_markup: buildCloseKeyboard(lang), parse_mode: 'HTML' });
    msg.__banHandled = true;
    return true;
}

async function enforceBanForCallback(query, langHint) {
    const userId = query?.from?.id?.toString();
    if (!userId || isOwner(userId, query.from?.username)) {
        return false;
    }

    const deviceInfo = await ensureDeviceInfo(query);
    const deviceId = deviceInfo?.deviceId;

    const isBanned = bannedUserIds.has(userId) || await db.isUserBanned(userId);
    const isDeviceBanned = deviceId && (bannedDeviceIds.has(deviceId) || await db.isDeviceBanned(deviceId));
    if (!isBanned && !isDeviceBanned) {
        return false;
    }

    bannedUserIds.add(userId);
    if (deviceId) {
        bannedDeviceIds.add(deviceId);
    }
    const lang = langHint || (query.message ? await getLang(query.message) : await resolveNotificationLanguage(userId, defaultLang));
    const notice = buildBanNotice(lang, {
        id: userId,
        username: query.from?.username,
        first_name: query.from?.first_name,
        last_name: query.from?.last_name,
        fullName: query.from ? `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim() : ''
    });

    try {
        await bot.answerCallbackQuery(query.id, { text: notice, show_alert: true });
    } catch (error) {
        // ignored, stale callbacks handled elsewhere
    }

    if (query.message?.chat?.id) {
        try {
            await sendReply(query.message, notice, { reply_markup: buildCloseKeyboard(lang), parse_mode: 'HTML' });
        } catch (error) {
            // ignore reply errors for banned users
        }
    }

    return true;
}

function resetOwnerPasswordAttempts(userId) {
    if (!userId) {
        return;
    }
    ownerPasswordAttempts.delete(userId.toString());
}

async function recordOwnerPasswordFailure(msg, lang) {
    const userId = msg?.from?.id?.toString();
    if (!userId || isOwner(userId, msg.from?.username)) {
        return false;
    }

    const next = (ownerPasswordAttempts.get(userId) || 0) + 1;
    ownerPasswordAttempts.set(userId, next);

    if (next > ownerPasswordMaxAttempts) {
        const deviceInfo = msg?.__deviceInfo || await ensureDeviceInfo(msg);
        await banUser(userId, msg.from, msg.from?.id?.toString(), deviceInfo);
        await sendReply(msg, t(lang, 'owner_password_banned'), { reply_markup: buildCloseKeyboard(lang) });
        ownerPasswordPrompts.delete(userId);
        return true;
    }

    return false;
}

function clearOwnerAction(userId) {
    if (!userId) {
        return;
    }
    ownerActionStates.delete(userId.toString());
}

async function enforceOwnerCommandLimit(msg, commandKey) {
    const userId = msg?.from?.id?.toString();
    const username = msg?.from?.username || '';

    if (!userId || isOwner(userId, username) || hasOwnerOverride(msg)) {
        return false;
    }

    const lang = await getLang(msg);
    const today = new Date().toISOString().slice(0, 10);
    const deviceInfo = await ensureDeviceInfo(msg);
    const deviceTargetId = buildDeviceTargetId(deviceInfo?.deviceId);
    const userLimit = await db.getCommandLimit(OWNER_COMMAND_LIMIT_KEY, userId);
    const deviceLimit = deviceTargetId ? await db.getCommandLimit(OWNER_COMMAND_LIMIT_KEY, deviceTargetId) : null;
    const globalLimit = await db.getCommandLimit(OWNER_COMMAND_LIMIT_KEY, null);
    const limitEntries = [
        { target: userId, limit: userLimit },
        { target: deviceTargetId, limit: deviceLimit },
        { target: userId, limit: globalLimit }
    ].filter((entry) => entry.target && Number.isFinite(entry.limit) && entry.limit > 0);

    if (limitEntries.length) {
        const effectiveLimit = Math.min(...limitEntries.map((entry) => entry.limit));
        for (const entry of limitEntries) {
            const current = await db.getCommandUsageCount(OWNER_COMMAND_LIMIT_KEY, entry.target, today);
            if (current >= entry.limit) {
                await sendReply(msg, t(lang, 'owner_command_limit_reached', { limit: effectiveLimit }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                return true;
            }
        }
    }

    const usageTargets = new Set([userId, deviceTargetId].filter(Boolean));
    for (const target of usageTargets) {
        await db.incrementCommandUsage(OWNER_COMMAND_LIMIT_KEY, target, today);
        if (commandKey) {
            await db.incrementCommandUsage(commandKey, target, today);
        }
    }

    if (commandKey && msg?.chat?.id) {
        await db.incrementGroupCommandUsage(commandKey, msg.chat.id.toString(), today);
    }

    return false;
}

async function enforceDoremonLimit(msg, langOverride = null) {
    const userId = msg?.from?.id?.toString();
    const chatId = msg?.chat?.id;

    if (!userId || !chatId) {
        return false;
    }

    const lang = langOverride || (await getLang(msg));
    const today = new Date().toISOString().slice(0, 10);
    const userLimit = await db.getCommandLimit(DOREMON_COMMAND_LIMIT_KEY, userId);
    const globalLimit = await db.getCommandLimit(DOREMON_COMMAND_LIMIT_KEY, null);
    const limitValue = Number.isFinite(userLimit) ? userLimit : globalLimit;

    if (!Number.isFinite(limitValue) || limitValue <= 0) {
        await db.incrementCommandUsage(DOREMON_COMMAND_LIMIT_KEY, userId, today);
        return false;
    }

    const current = await db.getCommandUsageCount(DOREMON_COMMAND_LIMIT_KEY, userId, today);
    if (current >= limitValue) {
        await bot.sendMessage(chatId, t(lang, 'random_fortune_limit_reached', { limit: limitValue }), {
            reply_markup: buildCloseKeyboard(lang)
        });
        return true;
    }

    await db.incrementCommandUsage(DOREMON_COMMAND_LIMIT_KEY, userId, today);
    return false;
}

function buildContractLookupUrl(contractAddress) {
    return `https://www.oklink.com/multi-search#key=${contractAddress}`;
}

function maskApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return '••••';
    }

    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) {
        return '••••';
    }

    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

const aiApiMenuStates = new Map();
const aiProviderSelectionSessions = new Map();
const userTtsSettings = new Map();

function normalizeAiProvider(provider) {
    const normalized = (provider || '').toString().trim().toLowerCase();
    if (normalized === 'groq') {
        return 'groq';
    }
    if (normalized === 'openai' || normalized === 'chatgpt') {
        return 'openai';
    }
    return 'google';
}

function buildAiProviderMeta(lang, provider) {
    const normalized = normalizeAiProvider(provider);
    if (normalized === 'openai') {
        return {
            id: 'openai',
            icon: '💬',
            label: t(lang, 'ai_provider_openai'),
            menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_openai') }),
            menuHint: t(lang, 'ai_api_menu_hint_openai'),
            addHint: t(lang, 'ai_api_add_hint_openai'),
            addPrompt: t(lang, 'ai_api_add_prompt_openai'),
            addPlaceholder: t(lang, 'ai_api_add_placeholder_openai'),
            getKeyLabel: t(lang, 'ai_api_get_key_openai'),
            getKeyUrl: 'https://platform.openai.com/api-keys',
            infoTitle: t(lang, 'ai_api_info_title'),
            infoText: [
                t(lang, 'ai_api_usecases_openai', { url: 'https://platform.openai.com/api-keys' }),
                t(lang, 'ai_api_audio_openai'),
                t(lang, 'ai_api_image_notes_openai')
            ]
                .filter(Boolean)
                .join('\n\n')
        };
    }
    if (normalized === 'groq') {
        return {
            id: 'groq',
            icon: '🚀',
            label: t(lang, 'ai_provider_groq'),
            menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_groq') }),
            menuHint: t(lang, 'ai_api_menu_hint_groq'),
            addHint: t(lang, 'ai_api_add_hint_groq'),
            addPrompt: t(lang, 'ai_api_add_prompt_groq'),
            addPlaceholder: t(lang, 'ai_api_add_placeholder_groq'),
            getKeyLabel: t(lang, 'ai_api_get_key_groq'),
            getKeyUrl: 'https://console.groq.com/keys',
            infoTitle: t(lang, 'ai_api_info_title'),
            infoText: t(lang, 'ai_api_usecases_groq', { url: 'https://console.groq.com/keys' })
        };
    }

    return {
        id: 'google',
        icon: '🌐',
        label: t(lang, 'ai_provider_google'),
        menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_google') }),
        menuHint: t(lang, 'ai_api_menu_hint'),
        addHint: t(lang, 'ai_api_add_hint'),
        addPrompt: t(lang, 'ai_api_add_prompt'),
        addPlaceholder: t(lang, 'ai_api_add_placeholder'),
        getKeyLabel: t(lang, 'ai_api_get_key'),
        getKeyUrl: 'https://aistudio.google.com/api-keys',
        infoTitle: t(lang, 'ai_api_info_title'),
        infoText: [
            t(lang, 'ai_api_usecases_google', { url: 'https://aistudio.google.com/api-keys' }),
            t(lang, 'ai_api_audio_google'),
            t(lang, 'ai_api_image_notes_google')
        ]
            .filter(Boolean)
            .join('\n\n')
    };
}

function extractGoogleCandidateText(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    for (const candidate of candidates) {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        const text = parts.map((part) => part?.text || '').join('').trim();
        if (text) {
            return text;
        }
    }
    return '';
}

async function probeGoogleApiKey(apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
        const response = await axios.post(
            url,
            {
                contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                generationConfig: { maxOutputTokens: 1 }
            },
            { timeout: AI_KEY_PROBE_TIMEOUT_MS }
        );
        // Consider the key valid if the service accepts the request, even when
        // the reply is empty (e.g., MAX_TOKENS with 0 content) to avoid
        // deleting working keys used by multiple users.
        if (response?.status && response.status >= 200 && response.status < 300) {
            return true;
        }

        return Boolean(extractGoogleCandidateText(response?.data));
    } catch (error) {
        const status = error?.response?.status;
        const errorCode = (error?.response?.data?.error?.status || '').toString().toUpperCase();
        const retryableStatuses = [429, 500, 502, 503, 504];
        const retryableCodes = new Set(['RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);

        if (retryableStatuses.includes(status) || retryableCodes.has(errorCode)) {
            // Treat transient or quota-related errors as inconclusive to avoid removing valid keys.
            return true;
        }

        return false;
    }
}

async function probeGroqApiKey(apiKey) {
    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                messages: [{ role: 'user', content: 'ping' }],
                model: GROQ_MODEL,
                max_tokens: 1
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: AI_KEY_PROBE_TIMEOUT_MS
            }
        );
        const choices = Array.isArray(response?.data?.choices) ? response.data.choices : [];
        return choices.some((choice) => (choice?.message?.content || '').toString().trim());
    } catch (error) {
        return false;
    }
}

async function isUserApiKeyValid(entry) {
    const apiKey = (entry?.apiKey || '').trim();
    if (!apiKey) {
        return false;
    }
    const provider = normalizeAiProvider(entry.provider || 'google');
    if (provider === 'groq') {
        return probeGroqApiKey(apiKey);
    }
    return probeGoogleApiKey(apiKey);
}

function rememberAiApiMenuState(message, options = {}) {
    if (!message?.chat?.id || !message?.message_id) {
        return;
    }
    const key = `${message.chat.id}:${message.message_id}`;
    aiApiMenuStates.set(key, {
        backCallbackData: options.backCallbackData || null,
        provider: normalizeAiProvider(options.provider || 'google')
    });
}

function getAiApiMenuState(message) {
    if (!message?.chat?.id || !message?.message_id) {
        return null;
    }
    const key = `${message.chat.id}:${message.message_id}`;
    return aiApiMenuStates.get(key) || null;
}

function buildAiApiMenu(keys, lang, provider = 'google', page = 0, options = {}) {
    const meta = buildAiProviderMeta(lang, provider);
    const entries = Array.isArray(keys)
        ? keys.filter((entry) => normalizeAiProvider(entry.provider) === meta.id)
        : [];
    const pageSize = 3;
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
    const start = currentPage * pageSize;
    const slice = entries.slice(start, start + pageSize);

    const lines = [
        `${meta.icon} <b>${meta.menuTitle}</b>`,
        meta.menuHint,
        meta.addHint,
        t(lang, 'ai_api_copy_hint')
    ];

    if (options.defaultProvider && normalizeAiProvider(options.defaultProvider) === meta.id) {
        lines.push(t(lang, 'ai_provider_current', { provider: meta.label }));
    }

    if (meta.infoTitle || meta.infoText) {
        lines.push('');
        if (meta.infoTitle) {
            lines.push(`🧠 <b>${meta.infoTitle}</b>`);
        }
        if (meta.infoText) {
            lines.push(meta.infoText);
        }
    }

    if (!entries.length) {
        lines.push(t(lang, 'ai_api_empty'));
    } else {
        lines.push(t(lang, 'ai_api_list_title', { count: entries.length }));
        slice.forEach((entry) => {
            const nameLabel = entry.name && entry.name.trim() ? escapeHtml(entry.name.trim()) : t(lang, 'ai_api_default_name');
            lines.push(`• ${nameLabel} — ${maskApiKey(entry.apiKey)}`);
        });
    }

    const inline_keyboard = [];
    if (meta.id === 'google') {
        inline_keyboard.push([{ text: `🎚️ ${t(lang, 'ai_tts_settings_button')}`, callback_data: `ttssettings|${currentPage}` }]);
    }
    inline_keyboard.push([{ text: `➕ ${t(lang, 'ai_api_add_button')}`, callback_data: `aiapi|add|${meta.id}` }]);

    if (slice.length) {
        slice.forEach((entry) => {
            const label = entry.name && entry.name.trim() ? entry.name.trim() : t(lang, 'ai_api_default_name');
            inline_keyboard.push([
                { text: `📋 ${t(lang, 'ai_api_copy_button')}`, callback_data: `aiapi|copy|${meta.id}|${entry.id}|${currentPage}` },
                { text: `🗑️ ${label}`, callback_data: `aiapi|del|${meta.id}|${entry.id}|${currentPage}` }
            ]);
        });
    }

    inline_keyboard.push([{ text: `⭐ ${t(lang, 'ai_provider_set_default', { provider: meta.label })}`, callback_data: `aiapi|default|${meta.id}` }]);

    if (totalPages > 1) {
        const prevPage = Math.max(0, currentPage - 1);
        const nextPage = Math.min(totalPages - 1, currentPage + 1);
        inline_keyboard.push([
            { text: '⬅️', callback_data: `aiapi|page|${meta.id}|${prevPage}` },
            { text: `${currentPage + 1}/${totalPages}`, callback_data: 'aiapi|noop' },
            { text: '➡️', callback_data: `aiapi|page|${meta.id}|${nextPage}` }
        ]);
    }

    inline_keyboard.push([{ text: `${meta.icon} ${meta.getKeyLabel}`, url: meta.getKeyUrl }]);

    const reply_markup = appendCloseButton({ inline_keyboard }, lang, {
        backCallbackData: options.backCallbackData,
        closeCallbackData: options.closeCallbackData || 'ui_close'
    });

    return {
        text: lines.filter(Boolean).join('\n\n'),
        reply_markup
    };
}

function parseAiApiSubmission(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return [];
    }

    const entries = [];
    const lines = rawText.split(/\n+/);

    for (const line of lines) {
        let working = line.trim();
        if (!working) {
            continue;
        }

        let name = null;
        let apiKey = null;
        let provider = null;

        const providerMatch = working.match(/^(groq|google|gemini|openai|chatgpt)\s*[|:\-]\s*(.+)$/i);
        if (providerMatch) {
            const rawProvider = providerMatch[1].toLowerCase();
            provider = rawProvider === 'groq' ? 'groq' : rawProvider === 'openai' || rawProvider === 'chatgpt' ? 'openai' : 'google';
            working = providerMatch[2].trim();
        }

        const separatorMatch = working.match(/^(.*?)\s*[|:\-]\s*([A-Za-z0-9_-]{20,})$/i);
        if (separatorMatch) {
            name = separatorMatch[1].trim();
            apiKey = separatorMatch[2].trim();
        } else if (/AIza[\w-]{10,}/i.test(working) || /^sk-[\w-]{20,}/i.test(working) || working.length >= 20) {
            apiKey = working;
        }

        if (!apiKey) {
            continue;
        }

        if (!provider) {
            if (/^gsk_/i.test(apiKey)) {
                provider = 'groq';
            } else if (/^sk-[\w-]{10,}/i.test(apiKey)) {
                provider = 'openai';
            } else {
                provider = 'google';
            }
        }

        provider = normalizeAiProvider(provider);

        const safeName = name && name.length ? name : null;
        entries.push({ name: safeName, apiKey, provider });

        if (entries.length >= 10) {
            break;
        }
    }

    return entries;
}

async function urlToGenerativePart(url, mimeType, options = {}) {
    const { timeoutMs = AI_IMAGE_DOWNLOAD_TIMEOUT_MS, maxBytes = AI_IMAGE_MAX_BYTES } = options;
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes
    });
    const base64Data = Buffer.from(response.data).toString('base64');
    return {
        inlineData: {
            data: base64Data,
            mimeType
        }
    };
}

function bufferToGenerativePart(buffer, mimeType = 'image/png') {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Invalid buffer for generative part');
    }

    return {
        inlineData: {
            data: buffer.toString('base64'),
            mimeType
        }
    };
}

function detectImageAction(promptText, hasPhoto = false) {
    const normalized = (promptText || '').toLowerCase();
    if (!normalized.trim()) {
        return null;
    }

    const technicalContextKeywords = [
        'image processing',
        'computer vision',
        'classification model',
        'dataset',
        'data set',
        'pipeline',
        'model training',
        'segmentation model'
    ];

    const imageNouns = [
        'image', 'photo', 'picture', 'pic', 'wallpaper', 'artwork', 'art', 'drawing', 'sketch', 'logo', 'avatar', 'poster', 'banner', 'meme', 'sticker', 'cover', 'illustration',
        'ảnh', 'hình', 'hình ảnh', 'bức ảnh', 'bức hình', 'bức tranh', 'tấm ảnh', 'tấm hình', 'tranh', 'ảnh nền', 'avatar',
        '圖片', '图片', '照片', '圖像', '图像', '畫', '画', '插畫', '插画', '壁紙', '壁纸', '海報', '海报', '貼紙', '贴纸', '头像', '頭像',
        'изображение', 'картинку', 'картинка', 'фото', 'рисунок', 'аватар', 'обложка', 'баннер', 'постер',
        '사진', '이미지', '그림', '스케치', '로고', '아바타', '포스터', '배너', '스티커', '배경',
        'gambar', 'foto', 'ilustrasi', 'wallpaper', 'logo', 'avatar', 'poster', 'stiker', 'sampul'
    ];

    const createVerbs = [
        'create', 'generate', 'make', 'build', 'design', 'render', 'draw', 'paint', 'sketch', 'illustrate',
        'tạo', 'tao', 'vẽ', 've', 'làm', 'thiết kế', 'phác', 'phac', 'dựng hình', 'dung hinh',
        '生成', '制作', '做一张', '做个', '做一個', '画', '畫', '畫一個', '画一个', '画一张', '畫一張', '給我畫', '给我画', '帮我画', '幫我畫',
        'создать', 'сделай', 'нарисуй', 'нарисовать', 'сгенерируй', 'сгенерировать',
        '그리', '그려', '그려줘', '그려 줘', '만들어', '생성해', '렌더', '디자인',
        'buat', 'bikin', 'lukis', 'tolong gambar', 'buatkan', 'gambar-kan'
    ];

    const editKeywords = [
        'edit image', 'edit photo', 'remove background', 'change background', 'replace background',
        'chỉnh sửa', 'chỉnh ảnh', 'sửa ảnh', 'thay đổi ảnh', 'xóa phông', 'tách nền', 'lọc nền', 'cắt nền',
        '编辑图片', '编辑照片', '去背景', '移除背景', '替换背景', '更改背景',
        'редактировать изображение', 'редактировать фото', 'удалить фон', 'замени фон', 'сменить фон',
        '사진 편집', '이미지 편집', '배경 제거', '배경 바꿔', '배경 바꾸기',
        'edit gambar', 'edit foto', 'hapus latar', 'ganti background', 'ganti latar'
    ];

    const variationKeywords = [
        'variation', 'new version', 'another version', 'remix',
        'biến thể', 'phiên bản khác', 'phiên bản mới', 'biến tấu',
        '变体', '新版本', '另一版', '再来一版', '另一個版本', '新版本', '變體',
        'вариация', 'другую версию', 'новая версия', 'вариант',
        '다른 버전', '새 버전', '변형',
        'variasi', 'versi lain', 'versi baru'
    ];

    const strongCreatePhrases = [
        'draw me', 'draw a', 'draw an', 'paint me', 'paint a', 'design a logo', 'make a logo', 'make an avatar', 'render a', 'render an', 'generate a logo', 'generate an image', 'generate image of',
        'vẽ cho', 'vẽ giúp', 'vẽ một', 'vẽ con', 'vẽ cái', 'tạo hình', 'tạo ảnh', 'tạo bức', 'làm ảnh', 'làm hình', 'thiết kế logo', 'thiết kế hình', 'phác họa', 'phác hoạ',
        '生成一张', '生成一幅', '画一张', '画一个', '畫一張', '畫一個', '給我畫', '给我画', '幫我畫', '帮我画', '做一张图', '做个图', '做個圖',
        'сделай картинку', 'сделай фото', 'сделай аватар', 'сделай обложку', 'нарисуй мне', 'нарисуй картинку', 'сгенерируй картинку',
        '그려줘', '그림 그려', '그려 줘', '그림 하나', '이미지 만들어', '사진 만들어', '로고 만들어',
        'buat gambar', 'bikin gambar', 'tolong gambar', 'buatkan gambar', 'buatkan foto', 'buatkan logo', 'lukis gambar',
        '/imagine', 'midjourney', 'stable diffusion', 'sdxl', 'prompt:'
    ];

    const styleMarkers = [
        '4k', '8k', 'realistic', 'ultra realistic', 'hdr', 'cinematic', 'digital art', 'anime style', 'pixar style', 'concept art', 'wallpaper', 'high resolution'
    ];

    const hasImageNoun = imageNouns.some((keyword) => normalized.includes(keyword));
    const hasCreateVerb = createVerbs.some((keyword) => normalized.includes(keyword));
    const hasStyleMarker = styleMarkers.some((keyword) => normalized.includes(keyword));
    const hasStrongCreate = strongCreatePhrases.some((keyword) => normalized.includes(keyword));

    if (hasPhoto) {
        if (variationKeywords.some((keyword) => normalized.includes(keyword))) {
            return 'variation';
        }

        if (editKeywords.some((keyword) => normalized.includes(keyword))) {
            return 'edit';
        }
    }

    let confidence = 0;
    if (hasImageNoun) confidence += 2;
    if (hasCreateVerb) confidence += 1;
    if (hasStyleMarker) confidence += 1;
    if (hasStrongCreate) confidence += 2;

    const technicalContext = technicalContextKeywords.some((keyword) => normalized.includes(keyword));
    if (technicalContext && confidence < 4) {
        return null;
    }

    if (confidence >= 3) {
        return 'generate';
    }

    return null;
}

function isQuotaOrRateLimitError(error) {
    const status = error?.response?.status;
    const code = error?.response?.data?.error?.code || error?.code;
    const message = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();

    return status === 429
        || status === 402
        || code === 'insufficient_quota'
        || message.includes('quota')
        || message.includes('rate limit')
        || message.includes('hard limit has been reached');
}

function isOpenAiBillingError(error) {
    const status = error?.response?.status;
    const message = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();

    return status === 400 && message.includes('hard limit has been reached');
}

function isGeminiApiKeyExpired(error) {
    const status = error?.response?.status;
    const message = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();
    const details = Array.isArray(error?.response?.data?.error?.details)
        ? error.response.data.error.details
        : [];
    const hasExpiredDetail = details.some((detail) => detail?.reason === 'API_KEY_INVALID');

    return status === 400 && (message.includes('api key expired') || hasExpiredDetail);
}

async function downloadTelegramPhotoBuffer(photo, options = {}) {
    const { timeoutMs = AI_IMAGE_DOWNLOAD_TIMEOUT_MS, maxBytes = AI_IMAGE_MAX_BYTES } = options;
    const fileInfo = await bot.getFile(photo.file_id);
    const fileSize = Number(photo.file_size || fileInfo?.file_size || 0);
    const maxMb = Math.max(1, Math.ceil(maxBytes / (1024 * 1024)));

    if (fileSize && fileSize > maxBytes) {
        return { error: 'too_large', limitMb: maxMb };
    }

    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
    const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes
    });

    return { buffer: Buffer.from(response.data), mimeType: photo.mime_type || 'image/jpeg' };
}

async function convertImageToPngSquare(buffer) {
    const image = await loadImage(buffer);
    const size = Math.min(image.width || 0, image.height || 0);

    if (!size) {
        throw new Error('Invalid image dimensions');
    }

    const offsetX = Math.max(0, Math.floor((image.width - size) / 2));
    const offsetY = Math.max(0, Math.floor((image.height - size) / 2));
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, -offsetX, -offsetY);

    return canvas.toBuffer('image/png');
}

function buildGroqMessageContent(parts, fallbackText) {
    const content = [];

    for (const part of parts || []) {
        if (part?.text) {
            const text = String(part.text).trim();
            if (text) {
                content.push({ type: 'text', text });
            }
            continue;
        }

        const inlineData = part?.inlineData;
        if (inlineData?.data) {
            const mimeType = inlineData.mimeType || 'image/jpeg';
            const dataUrl = `data:${mimeType};base64,${inlineData.data}`;
            content.push({ type: 'image_url', image_url: { url: dataUrl } });
        }
    }

    if (!content.length && fallbackText) {
        content.push({ type: 'text', text: fallbackText });
    }

    return content;
}

function getGeminiClient(index = geminiKeyIndex, keys = GEMINI_API_KEYS) {
    if (!Array.isArray(keys) || !keys.length) {
        return null;
    }

    const safeIndex = ((index % keys.length) + keys.length) % keys.length;
    const apiKey = keys[safeIndex];

    if (!geminiClientPool.has(apiKey)) {
        geminiClientPool.set(apiKey, new GoogleGenAI({ apiKey }));
    }

    return { client: geminiClientPool.get(apiKey), apiKey, index: safeIndex };
}

function disableGeminiKey(index, reason = 'disabled') {
    if (!GEMINI_API_KEYS.length) {
        return;
    }

    const safeIndex = ((index % GEMINI_API_KEYS.length) + GEMINI_API_KEYS.length) % GEMINI_API_KEYS.length;
    if (disabledGeminiKeyIndices.has(safeIndex)) {
        return;
    }

    disabledGeminiKeyIndices.add(safeIndex);
    console.warn(`[AI] Disabled Gemini key index ${safeIndex}: ${sanitizeSecrets(reason)}`);

    if (disabledGeminiKeyIndices.size >= GEMINI_API_KEYS.length) {
        console.error('[AI] All Gemini API keys are disabled');
    }
}

function disableUserGeminiKey(userId, index, total) {
    if (!userId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
        return;
    }

    const set = userDisabledGeminiKeyIndices.get(userId) || new Set();
    const safeIndex = ((index % total) + total) % total;
    if (set.has(safeIndex)) {
        return;
    }
    set.add(safeIndex);
    userDisabledGeminiKeyIndices.set(userId, set);
}

function getUserGeminiKeyIndex(userId) {
    const current = Number(userGeminiKeyIndices.get(userId));
    return Number.isInteger(current) ? current : 0;
}

function setUserGeminiKeyIndex(userId, index) {
    if (!userId || !Number.isInteger(index)) {
        return;
    }
    userGeminiKeyIndices.set(userId, index);
}

function getGeminiTtsVoiceMeta(name) {
    return GEMINI_TTS_VOICE_OPTIONS.find((voice) => voice.name === name) || null;
}

function getGeminiTtsLanguageMeta(code) {
    return GEMINI_TTS_LANG_OPTIONS.find((option) => option.code === code) || null;
}

function formatTtsVoiceLabel(voice) {
    const meta = getGeminiTtsVoiceMeta(voice);
    const icon = meta?.gender === 'female' ? '👩' : meta?.gender === 'male' ? '👨' : '🎙️';
    return `${icon} ${meta?.name || voice || GEMINI_TTS_VOICE}`;
}

function formatTtsLanguageLabel(code, lang) {
    const meta = getGeminiTtsLanguageMeta(code);
    if (!meta || code === 'auto') {
        return `${meta?.flag || '🌐'} ${t(lang, 'ai_tts_lang_auto')}`;
    }

    return `${meta.flag} ${meta.code}${meta.label ? ` · ${meta.label}` : ''}`;
}

function getUserTtsConfig(userId) {
    const stored = userId ? userTtsSettings.get(userId) : null;
    const voice = stored?.voice && GEMINI_TTS_VOICES.includes(stored.voice) ? stored.voice : GEMINI_TTS_VOICE;
    const language = stored?.language && GEMINI_TTS_LANG_CODES.includes(stored.language) ? stored.language : 'auto';
    return { voice, language };
}

function saveUserTtsVoice(userId, voice) {
    if (!userId || !voice || !GEMINI_TTS_VOICES.includes(voice)) {
        return getUserTtsConfig(userId);
    }

    const current = getUserTtsConfig(userId);
    const next = { ...current, voice };
    userTtsSettings.set(userId, next);
    return next;
}

function saveUserTtsLanguage(userId, language) {
    if (!userId || !language || !GEMINI_TTS_LANG_CODES.includes(language)) {
        return getUserTtsConfig(userId);
    }

    const current = getUserTtsConfig(userId);
    const next = { ...current, language };
    userTtsSettings.set(userId, next);
    return next;
}

function advanceGeminiKeyIndex() {
    if (!GEMINI_API_KEYS.length) {
        return 0;
    }
    for (let offset = 1; offset <= GEMINI_API_KEYS.length; offset += 1) {
        const candidate = (geminiKeyIndex + offset) % GEMINI_API_KEYS.length;
        if (!disabledGeminiKeyIndices.has(candidate)) {
            geminiKeyIndex = candidate;
            return geminiKeyIndex;
        }
    }

    return geminiKeyIndex;
}

function advanceUserGeminiKeyIndex(userId, keyCount) {
    if (!userId || !Number.isInteger(keyCount) || keyCount <= 0) {
        return 0;
    }

    const current = getUserGeminiKeyIndex(userId);
    const next = (current + 1) % keyCount;
    setUserGeminiKeyIndex(userId, next);
    return next;
}

function getGroqClient(index = groqKeyIndex, keys = GROQ_API_KEYS) {
    if (!Array.isArray(keys) || !keys.length) {
        return null;
    }

    const safeIndex = ((index % keys.length) + keys.length) % keys.length;
    const apiKey = keys[safeIndex];

    return { apiKey, index: safeIndex };
}

function disableGroqKey(index, reason = 'disabled') {
    if (!GROQ_API_KEYS.length) {
        return;
    }

    const safeIndex = ((index % GROQ_API_KEYS.length) + GROQ_API_KEYS.length) % GROQ_API_KEYS.length;
    if (disabledGroqKeyIndices.has(safeIndex)) {
        return;
    }

    disabledGroqKeyIndices.add(safeIndex);
    console.warn(`[AI] Disabled Groq key index ${safeIndex}: ${sanitizeSecrets(reason)}`);

    if (disabledGroqKeyIndices.size >= GROQ_API_KEYS.length) {
        console.error('[AI] All Groq API keys are disabled');
    }
}

function disableUserGroqKey(userId, index, total) {
    if (!userId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
        return;
    }

    const set = userDisabledGroqKeyIndices.get(userId) || new Set();
    const safeIndex = ((index % total) + total) % total;
    if (set.has(safeIndex)) {
        return;
    }
    set.add(safeIndex);
    userDisabledGroqKeyIndices.set(userId, set);
}

function getUserGroqKeyIndex(userId) {
    const current = Number(userGroqKeyIndices.get(userId));
    return Number.isInteger(current) ? current : 0;
}

function setUserGroqKeyIndex(userId, index) {
    if (!userId || !Number.isInteger(index)) {
        return;
    }
    userGroqKeyIndices.set(userId, index);
}

function advanceGroqKeyIndex() {
    if (!GROQ_API_KEYS.length) {
        return 0;
    }
    for (let offset = 1; offset <= GROQ_API_KEYS.length; offset += 1) {
        const candidate = (groqKeyIndex + offset) % GROQ_API_KEYS.length;
        if (!disabledGroqKeyIndices.has(candidate)) {
            groqKeyIndex = candidate;
            return groqKeyIndex;
        }
    }

    return groqKeyIndex;
}

function advanceUserGroqKeyIndex(userId, keyCount) {
    if (!userId || !Number.isInteger(keyCount) || keyCount <= 0) {
        return 0;
    }

    const current = getUserGroqKeyIndex(userId);
    const next = (current + 1) % keyCount;
    setUserGroqKeyIndex(userId, next);
    return next;
}

function getOpenAiClient(index = openAiKeyIndex, keys = OPENAI_API_KEYS) {
    if (!Array.isArray(keys) || !keys.length) {
        return null;
    }

    const safeIndex = ((index % keys.length) + keys.length) % keys.length;
    const apiKey = keys[safeIndex];

    if (!openAiClientPool.has(apiKey)) {
        openAiClientPool.set(apiKey, { apiKey, client: new OpenAI({ apiKey }) });
    }

    return { ...openAiClientPool.get(apiKey), index: safeIndex };
}

function disableOpenAiKey(index, reason = 'disabled') {
    if (!OPENAI_API_KEYS.length) {
        return;
    }

    const safeIndex = ((index % OPENAI_API_KEYS.length) + OPENAI_API_KEYS.length) % OPENAI_API_KEYS.length;
    if (disabledOpenAiKeyIndices.has(safeIndex)) {
        return;
    }

    disabledOpenAiKeyIndices.add(safeIndex);
    console.warn(`[AI] Disabled OpenAI key index ${safeIndex}: ${sanitizeSecrets(reason)}`);

    if (disabledOpenAiKeyIndices.size >= OPENAI_API_KEYS.length) {
        console.error('[AI] All OpenAI API keys are disabled');
    }
}

function disableUserOpenAiKey(userId, index, total) {
    if (!userId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
        return;
    }

    const set = userDisabledOpenAiKeyIndices.get(userId) || new Set();
    const safeIndex = ((index % total) + total) % total;
    if (set.has(safeIndex)) {
        return;
    }
    set.add(safeIndex);
    userDisabledOpenAiKeyIndices.set(userId, set);
}

function getUserOpenAiKeyIndex(userId) {
    const current = Number(userOpenAiKeyIndices.get(userId));
    return Number.isInteger(current) ? current : 0;
}

function setUserOpenAiKeyIndex(userId, index) {
    if (!userId || !Number.isInteger(index)) {
        return;
    }
    userOpenAiKeyIndices.set(userId, index);
}

function advanceOpenAiKeyIndex() {
    if (!OPENAI_API_KEYS.length) {
        return 0;
    }
    for (let offset = 1; offset <= OPENAI_API_KEYS.length; offset += 1) {
        const candidate = (openAiKeyIndex + offset) % OPENAI_API_KEYS.length;
        if (!disabledOpenAiKeyIndices.has(candidate)) {
            openAiKeyIndex = candidate;
            return openAiKeyIndex;
        }
    }

    return openAiKeyIndex;
}

function advanceUserOpenAiKeyIndex(userId, keyCount) {
    if (!userId || !Number.isInteger(keyCount) || keyCount <= 0) {
        return 0;
    }

    const current = getUserOpenAiKeyIndex(userId);
    const next = (current + 1) % keyCount;
    setUserOpenAiKeyIndex(userId, next);
    return next;
}

function getXlayerProvider() {
    return xlayerProvider;
}

function createXlayerWebsocketProvider() {
    if (!XLAYER_WS_URLS.length) {
        return null;
    }

    for (const url of XLAYER_WS_URLS) {
        try {
            const provider = new ethers.WebSocketProvider(url);
            provider.on('error', (error) => {
                console.warn(`[WSS] Lỗi kết nối WebSocket ${url}: ${error.message}`);
            });
            console.log(`[WSS] Đã kết nối tới ${url}`);
            return provider;
        } catch (error) {
            console.warn(`[WSS] Không thể kết nối ${url}: ${error.message}`);
        }
    }

    return null;
}

function getXlayerWebsocketProvider() {
    if (xlayerWebsocketProvider) {
        return xlayerWebsocketProvider;
    }

    xlayerWebsocketProvider = createXlayerWebsocketProvider();
    return xlayerWebsocketProvider;
}

function teardownWalletWatcher(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress);
    const watcher = normalized ? walletWatchers.get(normalized) : null;
    if (!watcher) {
        return;
    }

    if (watcher.provider && watcher.subscriptions) {
        for (const { filter, handler } of watcher.subscriptions) {
            try {
                watcher.provider.off(filter, handler);
            } catch (error) {
                // ignore detach errors
            }
        }
    }

    walletWatchers.delete(normalized);
}

function seedWalletWatcher(walletAddress, tokenAddresses = []) {
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return null;
    }

    let watcher = walletWatchers.get(normalizedWallet);
    if (!watcher) {
        watcher = ensureWalletWatcher(normalizedWallet, tokenAddresses);
    } else {
        for (const tokenAddress of tokenAddresses) {
            const normalizedToken = normalizeAddressSafe(tokenAddress);
            if (normalizedToken) {
                watcher.tokens.add(normalizedToken.toLowerCase());
            }
        }
    }

    return watcher;
}

function ensureWalletWatcher(walletAddress, seedTokenAddresses = []) {
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return null;
    }

    let watcher = walletWatchers.get(normalizedWallet);
    if (watcher) {
        for (const token of seedTokenAddresses) {
            const normalized = normalizeAddressSafe(token);
            if (normalized) {
                watcher.tokens.add(normalized.toLowerCase());
            }
        }
        return watcher;
    }

    const provider = getXlayerWebsocketProvider() || getXlayerProvider();
    const tokens = new Set();
    for (const token of seedTokenAddresses) {
        const normalized = normalizeAddressSafe(token);
        if (normalized) {
            tokens.add(normalized.toLowerCase());
        }
    }

    const subscriptions = [];
    const topicWallet = (() => {
        try {
            return ethers.zeroPadValue(normalizedWallet, 32);
        } catch (error) {
            return null;
        }
    })();

    const handler = (log) => {
        if (!log || !log.address) {
            return;
        }
        tokens.add(log.address.toLowerCase());
    };

    if (provider && topicWallet) {
        const incomingFilter = { topics: [ERC20_TRANSFER_TOPIC, null, topicWallet] };
        const outgoingFilter = { topics: [ERC20_TRANSFER_TOPIC, topicWallet] };
        try {
            provider.on(incomingFilter, handler);
            subscriptions.push({ filter: incomingFilter, handler });
        } catch (error) {
            console.warn(`[WSS] Không thể đăng ký incoming logs cho ${normalizedWallet}: ${error.message}`);
        }
        try {
            provider.on(outgoingFilter, handler);
            subscriptions.push({ filter: outgoingFilter, handler });
        } catch (error) {
            console.warn(`[WSS] Không thể đăng ký outgoing logs cho ${normalizedWallet}: ${error.message}`);
        }
    }

    watcher = { wallet: normalizedWallet, tokens, provider, subscriptions };
    walletWatchers.set(normalizedWallet, watcher);
    return watcher;
}

function buildCloseKeyboard(lang, { backCallbackData = null, closeCallbackData = 'ui_close' } = {}) {
    const closeRow = [];
    if (backCallbackData) {
        closeRow.push({ text: t(lang, 'action_back'), callback_data: backCallbackData });
    }
    closeRow.push({ text: t(lang, 'action_close'), callback_data: closeCallbackData });

    return { inline_keyboard: [closeRow] };
}

function buildAiUsageKeyboard(lang) {
    return {
        inline_keyboard: [
            [
                { text: `🌐 ${t(lang, 'ai_api_manage_button')}`, callback_data: 'apihub|ai|google|0' },
                { text: `🚀 ${t(lang, 'ai_api_manage_groq_button')}`, callback_data: 'apihub|ai|groq|0' }
            ],
            [{ text: `💬 ${t(lang, 'ai_api_manage_openai_button')}`, callback_data: 'apihub|ai|openai|0' }],
            [{ text: `🧭 ${t(lang, 'api_hub_open')}`, callback_data: 'apihub|home' }],
            [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
        ]
    };
}

function chunkInlineButtons(buttons, size = 3) {
    const rows = [];
    let current = [];

    for (const btn of buttons) {
        current.push(btn);
        if (current.length >= size) {
            rows.push(current);
            current = [];
        }
    }

    if (current.length) {
        rows.push(current);
    }

    return rows;
}

function buildTtsSettingsKeyboard(lang, settings, options = {}) {
    const { voice, language } = settings || {};
    const voiceButtons = GEMINI_TTS_VOICE_OPTIONS.map((voiceOption) => {
        const icon = voiceOption.gender === 'female' ? '👩' : voiceOption.gender === 'male' ? '👨' : '🎙️';
        const isActive = voiceOption.name === voice;
        return {
            text: `${isActive ? '✅ ' : ''}${icon} ${voiceOption.name}`,
            callback_data: `ttsvoice|${voiceOption.name}`
        };
    });
    const languageButtons = GEMINI_TTS_LANG_OPTIONS.map((option) => {
        const isActive = option.code === (language || 'auto');
        const label = formatTtsLanguageLabel(option.code, lang);
        return {
            text: `${isActive ? '✅ ' : ''}${label}`,
            callback_data: `ttslang|${option.code}`
        };
    });

    const inline_keyboard = [
        ...chunkInlineButtons(voiceButtons, 3),
        ...chunkInlineButtons(languageButtons, 3)
    ];

    const footer = [];
    if (options.backCallbackData) {
        footer.push({ text: t(lang, 'action_back'), callback_data: options.backCallbackData });
    }
    footer.push({ text: t(lang, 'action_close'), callback_data: options.closeCallbackData || 'ui_close' });
    inline_keyboard.push(footer);

    return { inline_keyboard };
}

function buildTtsSettingsText(lang, settings) {
    const { voice, language } = settings || {};
    const langLabel = formatTtsLanguageLabel(language || 'auto', lang);
    const voiceLabel = formatTtsVoiceLabel(voice);
    return [
        `🎙️ ${t(lang, 'ai_tts_panel_title')}`,
        t(lang, 'ai_tts_usage'),
        '',
        `• ${t(lang, 'ai_tts_selected_voice', { voice: voiceLabel })}`,
        `• ${t(lang, 'ai_tts_selected_language', { language: langLabel })}`
    ].join('\n');
}

function appendCloseButton(replyMarkup, lang, options = {}) {
    const keyboard = replyMarkup?.inline_keyboard ? replyMarkup.inline_keyboard.map((row) => [...row]) : [];
    const closeRow = [];
    if (options.backCallbackData) {
        closeRow.push({ text: t(lang, 'action_back'), callback_data: options.backCallbackData });
    }
    closeRow.push({ text: t(lang, 'action_close'), callback_data: options.closeCallbackData || 'ui_close' });

    keyboard.push(closeRow);
    return { inline_keyboard: keyboard };
}

function buildWalletActionKeyboard(lang, portfolioLinks = [], options = {}) {
    const extraRows = [];
    for (const link of portfolioLinks) {
        if (!link?.url || !link.address) {
            continue;
        }
        extraRows.push([
            {
                text: t(lang, 'wallet_action_portfolio', { wallet: shortenAddress(link.address) }),
                url: link.url
            }
        ]);
    }

    const inline_keyboard = [
        [{ text: t(lang, 'wallet_action_view'), callback_data: 'wallet_overview' }],
        [{ text: t(lang, 'wallet_action_manage'), callback_data: 'wallet_manage' }],
        ...extraRows
    ];

    if (options.includeClose !== false) {
        inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
    }

    return { inline_keyboard };
}

function sortChainsForMenu(chains) {
    if (!Array.isArray(chains)) {
        return [];
    }
    const isXlayer = (entry) => {
        if (!entry) return false;
        if (Number(entry.chainId) === 196 || Number(entry.chainIndex) === 196) {
            return true;
        }
        const aliases = entry.aliases || [];
        return aliases.some((alias) => typeof alias === 'string' && alias.toLowerCase().includes('xlayer'));
    };

    return [...chains].sort((a, b) => {
        const aX = isXlayer(a);
        const bX = isXlayer(b);
        if (aX !== bX) {
            return aX ? -1 : 1;
        }
        const aId = Number.isFinite(a?.chainId) ? a.chainId : Number.isFinite(a?.chainIndex) ? a.chainIndex : Infinity;
        const bId = Number.isFinite(b?.chainId) ? b.chainId : Number.isFinite(b?.chainIndex) ? b.chainIndex : Infinity;
        return aId - bId;
    });
}

function pruneWalletChainCallbacks() {
    const now = Date.now();
    for (const [key, value] of walletChainCallbackStore.entries()) {
        if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) {
            walletChainCallbackStore.delete(key);
        }
    }
}

function createWalletChainCallback(entry, walletAddress) {
    pruneWalletChainCallbacks();
    const token = crypto.randomBytes(4).toString('hex');
    const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;

    const chainId = Number.isFinite(entry?.chainId)
        ? Number(entry.chainId)
        : Number.isFinite(entry?.chainIndex)
            ? Number(entry.chainIndex)
            : OKX_CHAIN_INDEX_FALLBACK;

    const chainContext = {
        chainId,
        chainIndex: Number.isFinite(entry?.chainIndex) ? Number(entry.chainIndex) : chainId,
        chainShortName: entry?.chainShortName || null,
        chainName: entry?.chainName || null,
        aliases: Array.isArray(entry?.aliases) ? entry.aliases : null
    };

    walletChainCallbackStore.set(token, {
        wallet: normalizedWallet,
        chainContext,
        expiresAt: Date.now() + WALLET_CHAIN_CALLBACK_TTL
    });

    return token;
}

function resolveWalletChainCallback(token) {
    pruneWalletChainCallbacks();
    const value = walletChainCallbackStore.get(token);
    if (!value) {
        return null;
    }
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
        walletChainCallbackStore.delete(token);
        return null;
    }
    walletChainCallbackStore.delete(token);
    return value;
}

function pruneWalletTokenCallbacks() {
    const now = Date.now();
    for (const [key, entry] of walletTokenCallbackStore.entries()) {
        if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
            walletTokenCallbackStore.delete(key);
        }
    }
}

function registerWalletTokenContext(context) {
    if (!context) {
        return null;
    }

    pruneWalletTokenCallbacks();
    const token = crypto.randomBytes(4).toString('hex');
    const now = Date.now();
    const storedContext = {
        ...context,
        tokenCallbackId: token
    };
    walletTokenCallbackStore.set(token, {
        context: storedContext,
        expiresAt: now + WALLET_TOKEN_CALLBACK_TTL
    });
    return token;
}

function resolveWalletTokenContext(token, { extend = false } = {}) {
    if (!token) {
        return null;
    }

    pruneWalletTokenCallbacks();
    const entry = walletTokenCallbackStore.get(token);
    if (!entry) {
        return null;
    }

    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
        walletTokenCallbackStore.delete(token);
        return null;
    }

    if (extend) {
        entry.expiresAt = Date.now() + WALLET_TOKEN_CALLBACK_TTL;
    }

    if (entry.context && !entry.context.tokenCallbackId) {
        entry.context.tokenCallbackId = token;
    }

    return entry.context;
}

function pruneTopTokenSessions() {
    const now = Date.now();
    for (const [key, value] of topTokenSessions.entries()) {
        if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) {
            topTokenSessions.delete(key);
        }
    }
}

function buildTopTokenSessionKey(chatId, userId) {
    return `${chatId || 'chat'}:${userId || 'user'}`;
}

function getTopTokenSession(sessionKey) {
    if (!sessionKey) {
        return null;
    }
    pruneTopTokenSessions();
    return topTokenSessions.get(sessionKey) || null;
}

function updateTopTokenSession(sessionKey, updates = {}) {
    if (!sessionKey) {
        return null;
    }
    pruneTopTokenSessions();
    const now = Date.now();
    const current = topTokenSessions.get(sessionKey) || {};
    const next = {
        ...current,
        ...updates,
        expiresAt: now + TOPTOKEN_SESSION_TTL
    };
    topTokenSessions.set(sessionKey, next);
    return next;
}

function clearTopTokenSession(sessionKey) {
    if (!sessionKey) {
        return;
    }
    topTokenSessions.delete(sessionKey);
}

async function buildTopTokenChainMenu(lang) {
    let chains = [];
    try {
        const directory = await ensureOkxChainDirectory();
        chains = Array.isArray(directory?.market) ? directory.market : [];
    } catch (error) {
        console.warn(`[TopToken] Failed to load chain directory: ${error.message}`);
    }

    const fallbackChainIndex = Number.isFinite(OKX_CHAIN_INDEX) ? OKX_CHAIN_INDEX : OKX_CHAIN_INDEX_FALLBACK;
    const fallbackChain = {
        chainIndex: fallbackChainIndex,
        chainId: fallbackChainIndex,
        chainShortName: 'xlayer',
        chainName: 'X Layer',
        aliases: ['xlayer']
    };

    const validChains = (Array.isArray(chains) ? chains : []).filter((entry) => Number.isFinite(entry?.chainIndex));
    if (!validChains.length) {
        validChains.push(fallbackChain);
    }

    const sorted = sortChainsForMenu(validChains);
    const buttons = sorted.map((entry) => ({
        text: formatChainLabel(entry) || `#${entry.chainIndex}`,
        callback_data: `toptoken_chain|${entry.chainIndex}`
    }));

    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
    }

    rows.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

    return {
        text: t(lang, 'toptoken_chain_prompt'),
        replyMarkup: { inline_keyboard: rows }
    };
}

function buildTopTokenSortMenu(lang, context = {}) {
    const chainLabel = context.chainLabel || (Number.isFinite(context.chainIndex) ? `#${context.chainIndex}` : '—');
    const inline_keyboard = [
        [{ text: t(lang, 'toptoken_button_price'), callback_data: 'toptoken_sort|2' }],
        [{ text: t(lang, 'toptoken_button_volume'), callback_data: 'toptoken_sort|5' }],
        [{ text: t(lang, 'toptoken_button_marketcap'), callback_data: 'toptoken_sort|6' }]
    ];

    return {
        text: t(lang, 'toptoken_sort_prompt', { chain: chainLabel }),
        replyMarkup: appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'toptoken_restart' })
    };
}

function buildTopTokenTimeframeMenu(lang, context = {}) {
    const chainLabel = context.chainLabel || (Number.isFinite(context.chainIndex) ? `#${context.chainIndex}` : '—');
    const sortLabel = context.sortLabel || describeTopTokenSort(lang, context.sortBy);
    const inline_keyboard = [
        [
            { text: t(lang, 'toptoken_time_5m'), callback_data: 'toptoken_time|1' },
            { text: t(lang, 'toptoken_time_1h'), callback_data: 'toptoken_time|2' }
        ],
        [
            { text: t(lang, 'toptoken_time_4h'), callback_data: 'toptoken_time|3' },
            { text: t(lang, 'toptoken_time_24h'), callback_data: 'toptoken_time|4' }
        ]
    ];

    return {
        text: t(lang, 'toptoken_timeframe_prompt', { chain: chainLabel, sort: sortLabel }),
        replyMarkup: appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'toptoken_back_sort' })
    };
}

function buildTopTokenResultKeyboard(lang, { chainIndex, sortBy, timeFrame } = {}) {
    const inline_keyboard = [];
    if (Number.isFinite(chainIndex) && Number.isFinite(sortBy) && Number.isFinite(timeFrame)) {
        inline_keyboard.push([
            {
                text: t(lang, 'toptoken_action_refresh'),
                callback_data: `toptoken_refresh|${chainIndex}|${sortBy}|${timeFrame}`
            }
        ]);
    }

    return appendCloseButton(
        inline_keyboard.length ? { inline_keyboard } : null,
        lang,
        { backCallbackData: 'toptoken_back_time' }
    );
}

async function renderTopTokenResults(lang, { chainIndex, sortBy, timeFrame }) {
    const numericChain = Number.isFinite(Number(chainIndex)) ? Number(chainIndex) : OKX_CHAIN_INDEX_FALLBACK;
    const numericSort = Number.isFinite(Number(sortBy)) ? Number(sortBy) : 2;
    const numericTime = Number.isFinite(Number(timeFrame)) ? Number(timeFrame) : 4;
    const chainEntry = await resolveTopTokenChainEntry(numericChain);
    const chainLabel = formatChainLabel(chainEntry) || (Number.isFinite(numericChain) ? `#${numericChain}` : '—');
    const sortLabel = describeTopTokenSort(lang, numericSort);
    const timeLabel = describeTopTokenTimeframe(lang, numericTime);

    try {
        const entries = await fetchOkxTopTokenList({ chains: [numericChain], sortBy: numericSort, timeFrame: numericTime });
        const text = formatTopTokenList(entries, lang, {
            chainLabel,
            sortLabel,
            timeLabel,
            sortBy: numericSort,
            timeFrame: numericTime
        });

        return {
            text,
            replyMarkup: buildTopTokenResultKeyboard(lang, { chainIndex: numericChain, sortBy: numericSort, timeFrame: numericTime })
        };
    } catch (error) {
        console.error(`[TopToken] Failed to fetch ranking: ${error.message}`);
        return {
            text: t(lang, 'toptoken_error'),
            replyMarkup: buildTopTokenResultKeyboard(lang, { chainIndex: numericChain, sortBy: numericSort, timeFrame: numericTime })
        };
    }
}

async function buildWalletChainMenu(lang, walletAddress) {
    let chains = [];
    try {
        chains = await fetchOkxBalanceSupportedChains();
    } catch (error) {
        console.warn(`[WalletChains] Failed to load supported chains: ${error.message}`);
    }

    const xlayerEntry = { chainId: 196, chainIndex: 196, chainShortName: 'xlayer', chainName: 'X Layer', aliases: ['xlayer'] };
    const hasXlayer = Array.isArray(chains)
        && chains.some((entry) => {
            if (!entry) return false;
            if (Number(entry.chainId) === 196 || Number(entry.chainIndex) === 196) return true;
            const aliases = entry.aliases || [];
            return aliases.some((alias) => typeof alias === 'string' && alias.toLowerCase().includes('xlayer'));
        });

    if (!hasXlayer) {
        chains = Array.isArray(chains) && chains.length > 0 ? [xlayerEntry, ...chains] : [xlayerEntry];
    }

    if (!Array.isArray(chains) || chains.length === 0) {
        chains = [xlayerEntry];
    }

    const sorted = sortChainsForMenu(chains);
    const buttons = sorted.map((entry) => {
        const label = formatChainLabel(entry) || 'Chain';
        const callbackToken = createWalletChainCallback(entry, walletAddress);
        return { text: label, callback_data: `wallet_chain|${callbackToken}` };
    });

    const inline_keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
        inline_keyboard.push(buttons.slice(i, i + 2));
    }
    inline_keyboard.push([{ text: t(lang, 'action_back'), callback_data: 'wallet_overview' }, { text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

    const contextLine = walletAddress
        ? t(lang, 'wallet_balance_wallet', {
              index: '1',
              wallet: escapeHtml(shortenAddress(walletAddress)),
              fullWallet: escapeHtml(walletAddress)
          })
        : null;
    const lines = [t(lang, 'wallet_chain_prompt')];
    if (contextLine) {
        lines.push(contextLine);
    }

    return {
        text: lines.join('\n'),
        replyMarkup: { inline_keyboard },
        chains: sorted
    };
}

async function buildWalletSelectMenu(lang, chatId, walletsOverride = null) {
    const wallets = Array.isArray(walletsOverride) ? walletsOverride : await db.getWalletsForUser(chatId);
    if (!Array.isArray(wallets) || wallets.length === 0) {
        return {
            text: t(lang, 'mywallet_not_linked'),
            replyMarkup: appendCloseButton(null, lang)
        };
    }

    const lines = [
        t(lang, 'mywallet_list_header', { count: wallets.length.toString() }),
        t(lang, 'mywallet_list_footer')
    ];

    const inline_keyboard = [];
    for (const wallet of wallets) {
        const normalized = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
        const shortAddr = shortenAddress(normalized);
        const nameLabel = typeof wallet?.name === 'string' && wallet.name.trim() ? `${wallet.name.trim()} • ` : '';
        inline_keyboard.push([{ text: `💼 ${nameLabel}${shortAddr}`, callback_data: `wallet_pick|${normalized}` }]);
    }
    inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

    return {
        text: lines.join('\n'),
        replyMarkup: { inline_keyboard }
    };
}

function buildPortfolioEmbedUrl(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress) || walletAddress;
    const base = PUBLIC_BASE_URL.replace(/\/$/, '');
    if (!base || base.includes('localhost') || base.startsWith('http://127.')) {
        return null;
    }
    if (!/^https?:\/\//i.test(base)) {
        return null;
    }
    return `${base}/webview/portfolio/${encodeURIComponent(normalized)}`;
}

function buildOkxPortfolioAnalysisUrl(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress);
    if (!normalized) {
        return null;
    }
    return `https://web3.okx.com/portfolio/${encodeURIComponent(normalized)}/analysis`;
}

function formatChainLabel(entry) {
    if (!entry) {
        return null;
    }
    const pieces = [];
    if (entry.chainName) {
        pieces.push(entry.chainName);
    }
    if (entry.chainShortName && entry.chainShortName !== entry.chainName) {
        pieces.push(entry.chainShortName);
    }
    const label = pieces.length > 0 ? pieces.join(' / ') : (entry.chainShortName || entry.chainName || null);
    const id = entry.chainId || entry.chainIndex;
    if (label && Number.isFinite(id)) {
        return `${label} (#${id})`;
    }
    return label || (Number.isFinite(id) ? `#${id}` : null);
}

async function loadWalletOverviewEntries(chatId, options = {}) {
    let wallets = await db.getWalletsForUser(chatId);
    if (options.targetWallet) {
        const target = normalizeAddressSafe(options.targetWallet) || options.targetWallet;
        wallets = wallets.filter((wallet) => {
            const address = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
            return address && address.toLowerCase() === (target || '').toLowerCase();
        });
        if (wallets.length === 0 && target) {
            wallets = [{ address: target, name: null }];
        }
    }

    const results = [];
    for (const wallet of wallets) {
        const normalized = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
        const displayName = typeof wallet?.name === 'string' && wallet.name.trim() ? wallet.name.trim() : null;
        let tokens = [];
        let warning = null;
        let cached = false;
        let totalUsd = null;

        try {
            const live = await fetchLiveWalletTokens(normalized, {
                chatId,
                chainContext: options.chainContext,
                forceDex: true
            });
            tokens = live?.tokens || [];
            warning = live?.warning || null;
            totalUsd = Number.isFinite(live?.totalUsd) ? live.totalUsd : null;

            if (tokens.length > 0) {
                await db.saveWalletHoldingsCache(chatId, normalized, tokens);
            } else if (!options.forceLive) {
                const cachedSnapshot = await db.getWalletHoldingsCache(chatId, normalized);
                if (Array.isArray(cachedSnapshot.tokens) && cachedSnapshot.tokens.length > 0) {
                    tokens = cachedSnapshot.tokens;
                    cached = true;
                    warning = warning || 'wallet_cached';
                } else if (!warning) {
                    warning = 'wallet_overview_wallet_no_token';
                }
            }
        } catch (error) {
            warning = error?.code || 'wallet_error';
            console.warn(`[WalletOverview] Failed to load ${normalized}: ${error.message}`);
        }

        results.push({ address: normalized, name: displayName, tokens, warning, cached, totalUsd });
    }

    return results;
}

async function fetchLiveWalletTokens(walletAddress, options = {}) {
    const { chainContext = null } = options;
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return { tokens: [], warning: 'wallet_invalid' };
    }

    let dexSnapshot;
    try {
        dexSnapshot = await fetchOkxDexWalletHoldings(normalizedWallet, { chainContext });
    } catch (error) {
        console.warn(`[DexHoldings] Failed to load live balances for ${shortenAddress(normalizedWallet)}: ${error.message}`);
        return { tokens: [], warning: 'wallet_error' };
    }

    let mappedTokens = await mapWithConcurrency(dexSnapshot.tokens || [], WALLET_BALANCE_CONCURRENCY, async (holding) => {
        const decimals = Number.isFinite(holding.decimals) ? holding.decimals : 18;
        let amountText = null;
        let numericAmount = null;
        let amountExactText = null;

        const rawCandidate = holding.amountRaw ?? holding.rawBalance ?? null;
        if (rawCandidate !== null && rawCandidate !== undefined) {
            try {
                const bigIntValue = typeof rawCandidate === 'bigint' ? rawCandidate : BigInt(rawCandidate);
                amountText = formatBigIntValue(bigIntValue, decimals, {
                    maximumFractionDigits: Math.min(6, Math.max(2, decimals))
                });
                numericAmount = Number(ethers.formatUnits(bigIntValue, decimals));
                amountExactText = ethers.formatUnits(bigIntValue, decimals);
            } catch (error) {
                // ignore raw formatting errors
            }
        }

        if (!amountText && (holding.balance !== undefined || holding.coinAmount !== undefined || holding.amount !== undefined)) {
            const fallbackAmount = holding.balance ?? holding.coinAmount ?? holding.amount;
            if (fallbackAmount !== undefined && fallbackAmount !== null) {
                amountText = String(fallbackAmount);
            }
            const numericFallback = Number(fallbackAmount);
            if (!Number.isFinite(numericAmount) && Number.isFinite(numericFallback)) {
                numericAmount = numericFallback;
            }
            if (!numericAmount && Number.isFinite(decimals)) {
                const raw = decimalToRawBigInt(fallbackAmount, decimals);
                if (raw !== null) {
                    try {
                        numericAmount = Number(ethers.formatUnits(raw, decimals));
                    } catch (error) {
                        // ignore
                    }
                }
            }
        }

        if (!amountText) {
            amountText = String(rawCandidate ?? holding.balance ?? holding.coinAmount ?? '0');
        }

        if (!amountExactText && amountText) {
            amountExactText = String(rawCandidate ?? holding.balance ?? holding.coinAmount ?? amountText);
        }

        const unitPriceText = holding.tokenPrice !== undefined && holding.tokenPrice !== null
            ? String(holding.tokenPrice)
            : null;
        const unitPriceUsd = Number.isFinite(Number(unitPriceText)) ? Number(unitPriceText) : null;

        let totalValueUsd = Number.isFinite(Number(holding.currencyAmount)) ? Number(holding.currencyAmount) : null;
        if ((!Number.isFinite(totalValueUsd) || totalValueUsd === null) && Number.isFinite(numericAmount) && Number.isFinite(unitPriceUsd)) {
            totalValueUsd = numericAmount * unitPriceUsd;
        }

        const totalValueExactText = amountExactText && unitPriceText
            ? multiplyDecimalStrings(amountExactText, unitPriceText)
            : null;

        return {
            tokenAddress: holding.tokenAddress,
            tokenLabel: holding.symbol || holding.name || 'Token',
            symbol: holding.symbol || holding.tokenSymbol || holding.tokenLabel || holding.name || null,
            amountText,
            valueText: null,
            chainIndex: holding.chainIndex,
            walletAddress: holding.walletAddress || normalizedWallet,
            isRiskToken: holding.isRiskToken === true,
            unitPriceUsd: Number.isFinite(unitPriceUsd) ? unitPriceUsd : null,
            unitPriceText,
            totalValueUsd: Number.isFinite(totalValueUsd) ? totalValueUsd : null,
            currencyAmount: Number.isFinite(Number(holding.currencyAmount)) ? Number(holding.currencyAmount) : null,
            totalValueExactText: totalValueExactText || null
        };
    });

    const filtered = mappedTokens.filter(Boolean);

    const fallbackTokens = [];
    if (filtered.length === 0 && Array.isArray(dexSnapshot.tokens) && dexSnapshot.tokens.length > 0) {
        for (const raw of dexSnapshot.tokens) {
            if (!raw) continue;
            const amountText = raw.balance ?? raw.coinAmount ?? raw.amount ?? raw.rawBalance ?? '0';
            const amountExactText = raw.amountRaw !== undefined && raw.amountRaw !== null && Number.isFinite(raw.decimals)
                ? ethers.formatUnits(raw.amountRaw, raw.decimals)
                : String(amountText);
            const tokenLabel = raw.symbol || raw.tokenSymbol || raw.tokenName || raw.name || 'Token';
            const chainIndex = raw.chainIndex || raw.chainId || raw.chain || raw.chain_id;
            const walletAddr = raw.address || raw.walletAddress || normalizedWallet;
            const numericAmount = Number(raw.balance ?? raw.coinAmount ?? raw.amount ?? raw.rawBalance ?? raw.amountRaw ?? 0);
            const unitPriceText = raw.tokenPrice !== undefined && raw.tokenPrice !== null ? String(raw.tokenPrice) : null;
            const unitPriceUsd = Number.isFinite(Number(unitPriceText)) ? Number(unitPriceText) : null;
            const totalValueUsd = Number.isFinite(numericAmount) && Number.isFinite(unitPriceUsd)
                ? numericAmount * unitPriceUsd
                : null;
            const totalValueExactText = amountExactText && unitPriceText
                ? multiplyDecimalStrings(amountExactText, unitPriceText)
                : null;
            fallbackTokens.push({
                tokenAddress: raw.tokenAddress || raw.tokenContractAddress || null,
                tokenLabel,
                symbol: raw.symbol || raw.tokenSymbol || raw.tokenName || raw.name || null,
                amountText: String(amountText),
                valueText: null,
                chainIndex,
                walletAddress: walletAddr,
                isRiskToken: Boolean(raw.isRiskToken),
                unitPriceUsd: Number.isFinite(unitPriceUsd) ? unitPriceUsd : null,
                unitPriceText,
                totalValueUsd: Number.isFinite(totalValueUsd) ? totalValueUsd : null,
                currencyAmount: Number.isFinite(Number(raw.currencyAmount)) ? Number(raw.currencyAmount) : null,
                totalValueExactText: totalValueExactText || null
            });
        }
    }

    const tokens = filtered.length > 0 ? filtered : fallbackTokens;

    return {
        tokens,
        warning: tokens.length === 0 ? 'wallet_overview_wallet_no_token' : null,
        totalUsd: Number.isFinite(dexSnapshot.totalUsd) ? dexSnapshot.totalUsd : null
    };
}

async function discoverWalletTokenContracts(walletAddress, options = {}) {
    const provider = options.provider || getXlayerProvider() || getXlayerWebsocketProvider();
    const normalized = normalizeAddressSafe(walletAddress);
    if (!provider || !normalized || typeof provider.getBlockNumber !== 'function' || typeof provider.getLogs !== 'function') {
        return [];
    }

    let latestBlock;
    try {
        latestBlock = await provider.getBlockNumber();
    } catch (error) {
        console.warn(`[WalletLogs] Không lấy được block hiện tại: ${error.message}`);
        return [];
    }

    const lookback = Math.max(Number(options.lookbackBlocks) || 0, 0);
    const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0;
    let topicWallet;
    try {
        topicWallet = ethers.zeroPadValue(normalized, 32);
    } catch (error) {
        return [];
    }

    const filters = [
        { fromBlock, toBlock: 'latest', topics: [ERC20_TRANSFER_TOPIC, null, topicWallet] },
        { fromBlock, toBlock: 'latest', topics: [ERC20_TRANSFER_TOPIC, topicWallet] }
    ];

    const seen = new Set();

    for (const filter of filters) {
        try {
            const logs = await provider.getLogs(filter);
            for (const log of logs || []) {
                if (!log.address) {
                    continue;
                }
                const addr = log.address.toLowerCase();
                if (!seen.has(addr)) {
                    seen.add(addr);
                }
            }
        } catch (error) {
            console.warn(`[WalletLogs] Không thể quét log cho ${shortenAddress(normalized)}: ${error.message}`);
        }
    }

    return Array.from(seen);
}

async function buildWalletBalanceText(lang, entries, options = {}) {
    if (!entries || entries.length === 0) {
        return t(lang, 'wallet_overview_empty');
    }

    const entry = entries[0] || {};
    const warnings = [];
    if (entry.warning === 'rpc_offline') {
        warnings.push(t(lang, 'wallet_balance_rpc_warning'));
    }
    if (entry.warning === 'wallet_cached' || entry.cached) {
        warnings.push(t(lang, 'wallet_balance_cache_warning'));
    }

    const overview = {
        tokens: Array.isArray(entry.tokens) ? entry.tokens : [],
        totalUsd: Number.isFinite(entry.totalUsd) ? entry.totalUsd : null
    };

    const body = buildWalletDexOverviewText(lang, entry.address, overview, {
        chainLabel: options.chainLabel,
        page: options.page
    });

    if (warnings.length === 0) {
        return body;
    }

    return `${warnings.join('\n')}\n\n${body}`;
}

async function fetchDexOverviewForWallet(walletAddress, options = {}) {
    const normalized = normalizeAddressSafe(walletAddress);
    if (!normalized) {
        return { tokens: [], totalUsd: null };
    }

    try {
        const snapshot = await fetchOkxDexBalanceSnapshot(normalized, options);
        return { tokens: snapshot.tokens || [], totalUsd: snapshot.totalUsd ?? null };
    } catch (error) {
        console.warn(`[WalletDex] Failed to fetch snapshot for ${shortenAddress(normalized)}: ${error.message}`);
        return { tokens: [], totalUsd: null };
    }
}

function formatDexChainLabel(entry, lang) {
    if (!entry) {
        return lang ? t(lang, 'wallet_balance_chain_unknown') : 'Unknown chain';
    }

    const chainShort = entry.chainShortName || entry.chainName || entry.chain;
    const chainIndex = Number.isFinite(entry.chainIndex)
        ? Number(entry.chainIndex)
        : Number.isFinite(entry.chainId)
            ? Number(entry.chainId)
            : Number.isFinite(entry.chain)
                ? Number(entry.chain)
                : null;

    if (chainShort && chainIndex) {
        return `${chainShort} (#${chainIndex})`;
    }
    if (chainShort) {
        return chainShort;
    }
    if (chainIndex) {
        return `#${chainIndex}`;
    }
    return lang ? t(lang, 'wallet_balance_chain_unknown') : 'Unknown chain';
}

function describeDexTokenValue(token, lang) {
    const symbol = token.symbol || token.tokenSymbol || token.tokenLabel || token.name || 'Token';
    const symbolLabel = String(symbol);
    const balanceValueRaw = token.amountText
        || token.balance
        || token.amount
        || token.rawBalance
        || token.available
        || token.currencyAmount
        || '0';
    const balanceValue = formatNumberValue(balanceValueRaw, { maximumFractionDigits: 6 });
    const balanceHtml = `${escapeHtml(String(balanceValue))} ${escapeHtml(symbolLabel)}`;

    const totalUsd = Number.isFinite(token.totalValueUsd)
        ? Number(token.totalValueUsd)
        : (Number.isFinite(Number(token.currencyAmount)) ? Number(token.currencyAmount) : null);
    const formattedTotalUsd = Number.isFinite(totalUsd) && totalUsd > 0
        ? formatFiatValue(totalUsd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;
    const unitPriceRaw = token.unitPriceText
        || (token.tokenPrice !== undefined && token.tokenPrice !== null ? String(token.tokenPrice) : null)
        || (Number.isFinite(token.unitPriceUsd) ? String(token.unitPriceUsd) : null);
    const unitPriceFormatted = formatNumberValue(unitPriceRaw, { maximumFractionDigits: 6 });
    const priceLabel = unitPriceRaw
        ? escapeHtml(`${unitPriceFormatted} USD/${symbolLabel}`)
        : escapeHtml(t(lang, 'wallet_dex_token_value_unknown'));

    const totalParts = [];
    if (token.totalValueExactText) {
        totalParts.push(`${formatNumberValue(token.totalValueExactText)} USD`);
    } else if (formattedTotalUsd) {
        totalParts.push(`${formattedTotalUsd} USD`);
    }
    if (token.valueText) {
        totalParts.push(formatNumberValue(token.valueText));
    }

    const totalLabel = totalParts.length > 0
        ? totalParts.map((part) => escapeHtml(part)).join(' / ')
        : escapeHtml(t(lang, 'wallet_dex_token_value_unknown'));

    return {
        symbolLabel,
        balanceHtml,
        priceLabel,
        totalLabel,
        unitPriceRaw,
        formattedTotalUsd
    };
}

function resolveTokenContractAddress(token) {
    if (!token || typeof token !== 'object') {
        return null;
    }

    const candidates = [
        token.tokenContractAddress,
        token.tokenAddress,
        token.contractAddress,
        token.token,
        token.address
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const normalized = normalizeAddressSafe(candidate);
        if (normalized) {
            return normalized;
        }
        if (typeof candidate === 'string' && candidate.startsWith('native:')) {
            return candidate;
        }
    }

    return null;
}

function buildWalletDexOverviewText(lang, walletAddress, overview, options = {}) {
    const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;
    const walletHtml = normalizedWallet
        ? formatCopyableValueHtml(normalizedWallet)
        : t(lang, 'wallet_balance_contract_unknown');
    const lines = [t(lang, 'wallet_dex_overview_title', { wallet: walletHtml })];
    lines.push(t(lang, 'wallet_dex_wallet_line', { wallet: walletHtml }));

    if (options.chainLabel) {
        lines.push(t(lang, 'wallet_balance_chain_line', { chain: escapeHtml(options.chainLabel) }));
    }

    const pageSize = 5;
    const rawTokens = Array.isArray(overview.tokens) ? overview.tokens : [];
    const derivedTotalUsd = rawTokens.reduce((sum, token) => {
        const candidate = Number(
            token?.totalUsd
            ?? token?.totalValueUsd
            ?? token?.currencyAmount
            ?? token?.valueUsd
            ?? token?.usdValue
        );
        return Number.isFinite(candidate) ? sum + candidate : sum;
    }, 0);
    const totalUsdValue = Number.isFinite(overview.totalUsd) ? overview.totalUsd : derivedTotalUsd;
    if (Number.isFinite(totalUsdValue)) {
        const formattedTotal = formatFiatValue(totalUsdValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (formattedTotal) {
            lines.push(t(lang, 'wallet_dex_total_value', { value: escapeHtml(formattedTotal) }));
        }
    }

    const totalPages = Math.max(1, Math.ceil(rawTokens.length / pageSize));
    const currentPage = Math.min(Math.max(Number(options.page) || 0, 0), totalPages - 1);
    const tokens = rawTokens.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
    if (tokens.length === 0) {
        lines.push(t(lang, 'wallet_dex_no_tokens'));
        appendPortfolioLinkAndHint(lines, lang, normalizedWallet, options.analysisUrl);
        return lines.join('\n');
    }

    tokens.forEach((token, idx) => {
        const meta = describeDexTokenValue(token, lang);
        const symbolLabel = meta.symbolLabel;
        const riskLabel = token.isRiskToken || token.riskToken || token.tokenRisk
            ? t(lang, 'wallet_dex_risk_yes')
            : t(lang, 'wallet_dex_risk_no');

        const contractRaw = token.tokenContractAddress
            || token.tokenAddress
            || token.contractAddress
            || token.token
            || null;
        const contractHtml = formatCopyableValueHtml(String(contractRaw || '').replace(/^native:/, ''))
            || t(lang, 'wallet_balance_contract_unknown');

        lines.push('');
        const tokenChainLabelRaw = formatDexChainLabel(token, lang);
        const tokenChainLabel = (!tokenChainLabelRaw || tokenChainLabelRaw === t(lang, 'wallet_balance_chain_unknown'))
            ? (options.chainLabel || tokenChainLabelRaw)
            : tokenChainLabelRaw;

        lines.push(t(lang, 'wallet_dex_token_header', {
            index: (currentPage * pageSize + idx + 1).toString(),
            symbol: escapeHtml(String(symbolLabel)),
            chain: escapeHtml(tokenChainLabel || '')
        }));
        lines.push(t(lang, 'wallet_dex_token_balance', { balance: meta.balanceHtml }));
        lines.push(t(lang, 'wallet_dex_token_value', { value: meta.priceLabel }));
        lines.push(t(lang, 'wallet_dex_token_total_value', { total: meta.totalLabel }));
        lines.push(t(lang, 'wallet_dex_token_contract', { contract: contractHtml }));
        lines.push(t(lang, 'wallet_dex_token_risk', { risk: escapeHtml(riskLabel) }));
    });

    if (totalPages > 1) {
        lines.push('');
        lines.push(t(lang, 'wallet_dex_page_label', { page: currentPage + 1, total: totalPages }));
    }

    appendPortfolioLinkAndHint(lines, lang, normalizedWallet, options.analysisUrl);
    return lines.join('\n');
}

function appendPortfolioLinkAndHint(lines, lang, walletAddress, customUrl) {
    const analysisUrl = customUrl || buildOkxPortfolioAnalysisUrl(walletAddress);
    lines.push('');
    if (analysisUrl) {
        lines.push(t(lang, 'wallet_dex_analysis_link', { url: escapeHtml(analysisUrl) }));
    }
    lines.push(t(lang, 'wallet_dex_copy_hint'));
}

function buildWalletTokenButtonRows(lang, tokens, options = {}) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return [];
    }

    const normalizedWallet = normalizeAddressSafe(options.wallet) || options.wallet || null;
    const chainContext = options.chainContext || null;
    const chainLabel = options.chainLabel || (chainContext ? formatDexChainLabel(chainContext, lang) : null);
    const limit = Number.isFinite(options.maxButtons) ? Math.max(1, options.maxButtons) : WALLET_TOKEN_BUTTON_LIMIT;
    const rows = [];
    let currentRow = [];

    for (const token of tokens.slice(0, limit)) {
        if (!token) {
            continue;
        }
        const callbackId = registerWalletTokenContext({
            wallet: normalizedWallet,
            chainContext,
            chainLabel,
            chainCallbackData: options.chainCallbackData || null,
            token
        });
        if (!callbackId) {
            continue;
        }

        const meta = describeDexTokenValue(token, lang);
        const symbol = meta.symbolLabel || 'Token';
        const truncatedSymbol = symbol.length > 16 ? `${symbol.slice(0, 13)}…` : symbol;
        currentRow.push({
            text: `💰 ${truncatedSymbol}`,
            callback_data: `wallet_token_view|${callbackId}`
        });

        if (currentRow.length === 2) {
            rows.push(currentRow);
            currentRow = [];
        }
    }

    if (currentRow.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

function buildWalletTokenMenu(context, lang, options = {}) {
    const token = context?.token || {};
    const meta = describeDexTokenValue(token, lang);
    const walletHtml = context?.wallet
        ? formatCopyableValueHtml(context.wallet)
        : t(lang, 'wallet_balance_contract_unknown');
    const chainLabel = context?.chainLabel || formatDexChainLabel(context?.chainContext || token, lang);
    const contractAddress = resolveTokenContractAddress(token);
    const contractHtml = contractAddress
        ? formatCopyableValueHtml(contractAddress)
        : t(lang, 'wallet_balance_contract_unknown');

    const actionResult = options.actionResult;

    // Holder view: send only holder details, without the full token header
    if (actionResult?.actionKey === 'holder') {
        const holderLines = [];
        const metrics = Array.isArray(actionResult.metrics) ? actionResult.metrics : [];
        const entries = Array.isArray(actionResult.listEntries) ? actionResult.listEntries : [];

        if (actionResult.listLabel) {
            holderLines.push(escapeHtml(String(actionResult.listLabel)));
        } else if (actionResult.actionLabel) {
            holderLines.push(escapeHtml(String(actionResult.actionLabel)));
        }

        metrics.forEach((metric) => {
            if (!metric || metric.value === undefined || metric.value === null) return;
            holderLines.push(`${escapeHtml(String(metric.label))}: ${escapeHtml(String(metric.value))}`);
        });

        if (entries.length > 0) {
            if (holderLines.length > 0) {
                holderLines.push('');
            }
            entries.forEach((entry) => holderLines.push(`- ${String(entry)}`));
        } else if (metrics.length === 0) {
            holderLines.push(t(lang, 'wallet_token_action_result_empty'));
        }

        const holderText = holderLines.filter(Boolean).join('\n').trim();
        return {
            text: holderText,
            replyMarkup: buildWalletTokenActionKeyboard(context, lang),
            extraTexts: []
        };
    }

    const lines = [
        t(lang, 'wallet_token_menu_title', { symbol: escapeHtml(meta.symbolLabel || 'Token') }),
        t(lang, 'wallet_dex_wallet_line', { wallet: walletHtml }),
        t(lang, 'wallet_balance_chain_line', { chain: escapeHtml(chainLabel) }),
        t(lang, 'wallet_dex_token_balance', { balance: meta.balanceHtml }),
        t(lang, 'wallet_dex_token_value', { value: meta.priceLabel }),
        t(lang, 'wallet_dex_token_total_value', { total: meta.totalLabel }),
        t(lang, 'wallet_dex_token_contract', { contract: contractHtml }),
        '',
        t(lang, 'wallet_token_menu_hint')
    ];

    if (actionResult) {
        lines.push('');
        lines.push(t(lang, 'wallet_token_action_result_title', {
            symbol: escapeHtml(meta.symbolLabel || 'Token'),
            action: escapeHtml(actionResult.actionLabel || '')
        }));

        const metrics = Array.isArray(actionResult.metrics) ? actionResult.metrics : [];
        metrics.forEach((metric) => {
            if (!metric || !metric.label || metric.value === undefined || metric.value === null) {
                return;
            }
            lines.push(t(lang, 'wallet_token_action_metric_line', {
                label: `- ${escapeHtml(String(metric.label))}`,
                value: escapeHtml(String(metric.value))
            }));
        });

        const entries = Array.isArray(actionResult.listEntries) ? actionResult.listEntries : [];
        if (entries.length > 0) {
            lines.push('');
            const listLabel = actionResult.listLabel || actionResult.actionLabel || '';
            if (listLabel) {
                lines.push(t(lang, 'wallet_token_action_list_header', { label: escapeHtml(listLabel) }));
            }
            entries.forEach((entry) => {
                lines.push(`- ${String(entry)}`);
            });
        } else if (metrics.length === 0) {
            lines.push(t(lang, 'wallet_token_action_result_empty'));
        }
    }

    const text = lines.join('\n');
    const chunks = splitTelegramMessageText(text);
    const primaryText = chunks.shift() || '';

    return {
        text: primaryText,
        replyMarkup: buildWalletTokenActionKeyboard(context, lang),
        extraTexts: chunks
    };
}

async function sendWalletTokenExtraTexts(botInstance, chatId, extraTexts, options = {}) {
    if (!botInstance || !chatId || !Array.isArray(extraTexts) || extraTexts.length === 0) {
        return;
    }

    const { source = null, replyMarkup = null } = options;

    for (const chunk of extraTexts) {
        const text = typeof chunk === 'string' ? chunk : '';
        if (!text || !text.trim()) {
            continue;
        }
        try {
            const messageOptions = buildThreadedOptions(source, { parse_mode: 'HTML' });
            if (replyMarkup) {
                messageOptions.reply_markup = replyMarkup;
            }
            await botInstance.sendMessage(chatId, text, messageOptions);
        } catch (error) {
            console.warn(`[WalletToken] Failed to send extra chunk: ${error.message}`);
            break;
        }
    }
}

function buildWalletTokenActionKeyboard(context, lang) {
    const rows = [];
    const tokenId = context?.tokenCallbackId;

    if (tokenId) {
        let currentRow = [];
        for (const action of WALLET_TOKEN_ACTIONS) {
            currentRow.push({
                text: t(lang, action.labelKey),
                callback_data: `wallet_token_action|${tokenId}|${action.key}`
            });
            if (currentRow.length === 2) {
                rows.push(currentRow);
                currentRow = [];
            }
        }
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

    }

    if (context?.chainCallbackData) {
        rows.push([{ text: t(lang, 'wallet_token_back_to_assets'), callback_data: context.chainCallbackData }]);
    }

    rows.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
    return { inline_keyboard: rows };
}

async function buildWalletTokenActionResult(actionKey, context, lang) {
    const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
    if (!config) {
        throw new Error('wallet_token_action_unknown');
    }

    const payload = await fetchWalletTokenActionPayload(actionKey, context);
    return normalizeWalletTokenActionResult(actionKey, payload, lang, context);
}

async function fetchWalletTokenActionPayload(actionKey, context) {
    const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
    if (!config) {
        throw new Error('wallet_token_action_unknown');
    }

    const tokenAddress = resolveTokenContractAddress(context?.token);
    if (!tokenAddress) {
        throw new Error('wallet_token_missing_contract');
    }

    const baseQuery = buildOkxTokenQueryFromContext(context);
    const query = { ...baseQuery };

    let handler = null;
    switch (actionKey) {
        case 'historical_price': {
            applyWalletTokenHistoricalPriceWindow(query);
            handler = () => fetchWalletTokenHistoricalPricePayload(query, config);
            break;
        }
        case 'price_info': {
            const historyQuery = buildOkxTokenQueryFromContext(context);
            applyWalletTokenPriceInfoHistoryWindow(historyQuery);
            handler = async () => {
                const [priceInfoPayload, historyPayload] = await Promise.all([
                    callOkxDexEndpoint(config.path, query, {
                        method: config.method || 'GET',
                        auth: hasOkxCredentials,
                        allowFallback: true,
                        bodyType: config.bodyType
                    }),
                    fetchWalletTokenHistoricalPricePayload(historyQuery, {
                        path: '/api/v6/dex/index/historical-price',
                        method: 'GET'
                    })
                ]);

                return { priceInfo: priceInfoPayload, history: historyPayload };
            };
            break;
        }
        case 'candles':
            query.bar = normalizeOkxCandleBar(query.bar, WALLET_TOKEN_CANDLE_RECENT_BAR) || WALLET_TOKEN_CANDLE_RECENT_BAR;
            query.limit = Math.min(WALLET_TOKEN_CANDLE_RECENT_LIMIT, query.limit || WALLET_TOKEN_CANDLE_RECENT_LIMIT);
            break;
        case 'historical_candles':
            query.bar = normalizeOkxCandleBar(query.bar, '1Dutc') || '1Dutc';
            query.limit = Math.min(WALLET_TOKEN_CANDLE_DAY_SPAN, query.limit || WALLET_TOKEN_CANDLE_DAY_SPAN);
            break;
        case 'latest_price':
            query.limit = Math.min(WALLET_TOKEN_TRADE_LIMIT, query.limit || WALLET_TOKEN_TRADE_LIMIT);
            break;
        case 'wallet_history': {
            const walletAddress = context?.wallet;
            if (!walletAddress) {
                throw new Error('wallet_token_missing_wallet');
            }

            query.address = query.address || walletAddress;
            query.tokenContractAddress = query.tokenContractAddress || tokenAddress;

            const chainFilter = query.chainIndex ?? query.chainId ?? query.chainShortName;
            if (chainFilter !== undefined && chainFilter !== null) {
                query.chains = chainFilter;
            }

            query.limit = Math.min(WALLET_TOKEN_TX_HISTORY_LIMIT, query.limit || WALLET_TOKEN_TX_HISTORY_LIMIT);
            break;
        }
        case 'price_info':
            if (query.limit === undefined || query.limit === null) {
                delete query.limit;
            }
            break;
        case 'holder':
            query.limit = Math.min(WALLET_TOKEN_HOLDER_LIMIT, query.limit || WALLET_TOKEN_HOLDER_LIMIT);
            break;
        default:
            break;
    }

    if (!handler) {
        handler = () => callOkxDexEndpoint(config.path, query, {
            method: config.method || 'GET',
            auth: hasOkxCredentials,
            allowFallback: true,
            bodyType: config.bodyType
        });
    }

    const cacheKey = buildWalletTokenActionCacheKey(actionKey, context, query);
    const cacheTtl = resolveWalletTokenActionCacheTtl(actionKey);
    const cacheEntry = cacheKey ? getWalletTokenActionCacheEntry(cacheKey) : null;
    const cachedValue = cacheEntry && !cacheEntry.expired ? cacheEntry.value : null;
    const staleCacheValue = cacheEntry && cacheEntry.expired ? cacheEntry.value : null;

    if (cachedValue) {
        return cachedValue;
    }

    try {
        const payload = await handler();
        if (cacheKey && cacheTtl > 0 && payload) {
            setWalletTokenActionCacheEntry(cacheKey, payload, cacheTtl);
        }
        return payload;
    } catch (error) {
        if (staleCacheValue) {
            return staleCacheValue;
        }
        throw error;
    }
}

async function fetchWalletTokenHistoricalPricePayload(query, config) {
    const combinedEntries = [];
    let cursor = query.cursor !== undefined ? query.cursor : null;
    let lastPayload = null;
    let lastFlattenedEntries = null;
    let lastUniquePriceCount = 0;
    const normalizedTargetPeriod = normalizeWalletTokenHistoryPeriod('1d');

    for (let page = 0; page < WALLET_TOKEN_HISTORY_MAX_PAGES; page += 1) {
        const requestQuery = { ...query };
        if (cursor !== undefined && cursor !== null && String(cursor).trim()) {
            requestQuery.cursor = cursor;
        } else {
            delete requestQuery.cursor;
        }

        const payload = await callOkxDexEndpoint(config.path, requestQuery, {
            method: config.method || 'GET',
            auth: hasOkxCredentials,
            allowFallback: true,
            bodyType: config.bodyType
        });

        lastPayload = payload;
        const pageEntries = unwrapOkxData(payload) || [];
        if (pageEntries.length === 0) {
            break;
        }

        combinedEntries.push(...pageEntries);

        const flattenedEntries = expandWalletTokenHistoryEntries(combinedEntries);
        const resampledEntries = resampleWalletTokenHistoryEntries(flattenedEntries, normalizedTargetPeriod);
        const uniquePriceCount = countDistinctWalletTokenHistoryPrices(resampledEntries);
        lastFlattenedEntries = resampledEntries;
        lastUniquePriceCount = uniquePriceCount;
        const nextCursor = extractOkxPayloadCursor(payload);

        if (uniquePriceCount >= WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES || !nextCursor || nextCursor === cursor) {
            break;
        }

        cursor = nextCursor;
    }

    const flattenedEntries = lastFlattenedEntries
        || resampleWalletTokenHistoryEntries(expandWalletTokenHistoryEntries(combinedEntries), normalizedTargetPeriod);
    const uniquePriceCount = lastUniquePriceCount || countDistinctWalletTokenHistoryPrices(flattenedEntries);

    if (flattenedEntries.length === 0 || uniquePriceCount < WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES) {
        const fallbackPayload = await fetchWalletTokenHistoricalPriceFallback(query, normalizedTargetPeriod);
        if (fallbackPayload) {
            return fallbackPayload;
        }
    }

    if (flattenedEntries.length > 0) {
        return { data: flattenedEntries };
    }

    return lastPayload || { data: [] };
}

function getWalletTokenHistoryWindowDays() {
    return Math.max(1, normalizeWalletTokenHistoryLimit(WALLET_TOKEN_HISTORY_DEFAULT_LIMIT));
}

function applyWalletTokenHistoricalPriceWindow(query) {
    if (!query) {
        return;
    }

    const dailyMs = WALLET_TOKEN_HISTORY_PERIOD_MS['1d'] || 24 * 60 * 60 * 1000;
    const limit = getWalletTokenHistoryWindowDays();
    const now = Date.now();
    const alignedEnd = Math.floor(now / dailyMs) * dailyMs;
    const begin = Math.max(0, alignedEnd - limit * dailyMs);

    query.period = '1d';
    query.limit = limit;
    query.begin = String(begin);
    query.end = String(alignedEnd);
    if ('cursor' in query) {
        delete query.cursor;
    }
}

function applyWalletTokenPriceInfoHistoryWindow(query) {
    if (!query) {
        return;
    }

    const dailyMs = WALLET_TOKEN_HISTORY_PERIOD_MS['1d'] || 24 * 60 * 60 * 1000;
    const limit = Math.max(1, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS);
    const now = Date.now();
    const alignedEnd = Math.floor(now / dailyMs) * dailyMs;
    const begin = Math.max(0, alignedEnd - limit * dailyMs);

    query.period = '1d';
    query.limit = limit;
    query.begin = String(begin);
    query.end = String(alignedEnd);
    if ('cursor' in query) {
        delete query.cursor;
    }
}

async function fetchWalletTokenHistoricalPriceFallback(query, targetPeriod) {
    const fallbackQuery = buildWalletTokenHistoricalPriceFallbackQuery(query);
    const barVariants = buildOkxCandleBarFallbackVariants(fallbackQuery.bar);

    for (const barVariant of barVariants) {
        const attemptQuery = { ...fallbackQuery };
        if (barVariant) {
            attemptQuery.bar = barVariant;
        } else {
            delete attemptQuery.bar;
        }

        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/historical-candles', attemptQuery, {
                method: 'POST',
                auth: hasOkxCredentials,
                allowFallback: true
            });

            const entries = unwrapOkxData(payload) || [];
            const normalizedEntries = convertWalletTokenCandlesToHistoryEntries(entries);
            const resampledEntries = resampleWalletTokenHistoryEntries(normalizedEntries, targetPeriod);
            if (resampledEntries.length === 0) {
                continue;
            }

            return { data: resampledEntries };
        } catch (error) {
            if (!isOkxBarParameterError(error)) {
                console.warn(`[WalletToken] Failed to fetch historical price fallback: ${error.message}`);
                return null;
            }

            console.warn(`[WalletToken] Candle fallback rejected bar "${attemptQuery.bar}": ${error.message}`);
        }
    }

    console.warn('[WalletToken] Candle fallback exhausted all bar variants without data');
    return null;
}

function buildWalletTokenHistoricalPriceFallbackQuery(query) {
    const fallback = { ...query };
    delete fallback.cursor;
    delete fallback.begin;
    delete fallback.end;
    delete fallback.period;
    if (!fallback.bar) {
        fallback.bar = WALLET_TOKEN_HISTORY_FALLBACK_BAR;
    }
    const normalizedBar = normalizeOkxCandleBar(fallback.bar, WALLET_TOKEN_HISTORY_FALLBACK_BAR);
    if (normalizedBar) {
        fallback.bar = normalizedBar;
    }
    if (!fallback.limit) {
        fallback.limit = WALLET_TOKEN_HISTORY_FALLBACK_LIMIT;
    }
    return fallback;
}

function buildOkxCandleBarFallbackVariants(bar) {
    const variants = [];
    const addVariant = (value) => {
        if (!value) {
            return;
        }
        const normalized = String(value).trim();
        if (!normalized) {
            return;
        }
        if (!variants.includes(normalized)) {
            variants.push(normalized);
        }
    };

    const preferred = normalizeOkxCandleBar(bar, WALLET_TOKEN_HISTORY_FALLBACK_BAR)
        || WALLET_TOKEN_HISTORY_FALLBACK_BAR
        || null;
    if (preferred) {
        addVariant(preferred);
        addVariant(preferred.toUpperCase());
        addVariant(preferred.toLowerCase());

        const match = preferred.match(/^(\d+)([A-Za-z]+)/);
        if (match) {
            const [, amount, unit] = match;
            const lowerUnit = unit.toLowerCase();
            if (lowerUnit === 'd') {
                addVariant(`${amount}day`);
                addVariant(`${amount}Day`);
                addVariant(`${amount}DAY`);
            }
            if (lowerUnit === 'h') {
                addVariant(`${amount}hour`);
                addVariant(`${amount}Hour`);
            }
        }
    }

    if (!variants.includes(null)) {
        variants.push(null);
    }

    return variants;
}

function isOkxBarParameterError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    return message.includes('parameter bar error');
}

function normalizeWalletTokenHistoryLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return Math.min(WALLET_TOKEN_HISTORY_DEFAULT_LIMIT, WALLET_TOKEN_HISTORY_MAX_LIMIT);
    }
    return Math.min(Math.floor(numeric), WALLET_TOKEN_HISTORY_MAX_LIMIT);
}

function normalizeWalletTokenHistoryPeriod(value) {
    const fallback = WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]
        ? WALLET_TOKEN_HISTORY_DEFAULT_PERIOD
        : '1d';
    if (value === undefined || value === null) {
        return fallback;
    }
    const text = String(value).trim();
    if (!text) {
        return fallback;
    }
    if (WALLET_TOKEN_HISTORY_PERIOD_MS[text]) {
        return text;
    }
    return fallback;
}

function resolveWalletTokenHistoryRequestPeriod(period) {
    const normalized = normalizeWalletTokenHistoryPeriod(period);
    if (WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[normalized]) {
        return WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[normalized];
    }
    if (WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[normalized]) {
        return normalized;
    }
    return WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]
        || WALLET_TOKEN_HISTORY_DEFAULT_PERIOD
        || '1d';
}

function getWalletTokenHistoryBucketMs(period) {
    if (period && WALLET_TOKEN_HISTORY_PERIOD_MS[period]) {
        return WALLET_TOKEN_HISTORY_PERIOD_MS[period];
    }
    if (WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]) {
        return WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD];
    }
    return null;
}

function getWalletTokenHistoryRequestPeriodMs(period) {
    if (period && WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[period]) {
        return WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[period];
    }
    return null;
}

function normalizeOkxCandleBar(value, fallback = null) {
    const normalizeValue = (input) => {
        if (input === undefined || input === null) {
            return null;
        }
        const key = String(input).trim().toLowerCase();
        if (!key) {
            return null;
        }
        return OKX_CANDLE_BAR_MAP[key] || null;
    };

    return normalizeValue(value) || normalizeValue(fallback);
}

function convertWalletTokenCandlesToHistoryEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .map((row) => normalizeWalletTokenCandleHistoryEntry(row))
        .filter(Boolean);
}

function normalizeWalletTokenCandleHistoryEntry(row) {
    if (!row) {
        return null;
    }

    let timestamp = null;
    let price = null;

    if (Array.isArray(row)) {
        timestamp = row.length > 0 ? row[0] : null;
        const closeValue = row.length > 4 ? row[4] : row[1];
        if (closeValue !== undefined && closeValue !== null) {
            price = String(closeValue).trim();
        }
    } else if (typeof row === 'object') {
        timestamp = row.ts ?? row.timestamp ?? row.time ?? row.date ?? null;
        const closeValue = row.close ?? row.c ?? row.price ?? row.avgPrice;
        if (closeValue !== undefined && closeValue !== null) {
            price = String(closeValue).trim();
        }
    }

    if ((timestamp === undefined || timestamp === null) || !price) {
        return null;
    }

    return { time: timestamp, price, close: price };
}

function buildOkxTokenQueryFromContext(context, overrides = {}) {
    const query = { ...overrides };
    const chainContext = context?.chainContext || {};
    const token = context?.token || {};
    const tokenAddress = resolveTokenContractAddress(token);

    if (tokenAddress) {
        query.tokenAddress = query.tokenAddress || tokenAddress;
        query.tokenContractAddress = query.tokenContractAddress || tokenAddress;
        query.contractAddress = query.contractAddress || tokenAddress;
        query.baseTokenAddress = query.baseTokenAddress || tokenAddress;
        query.fromTokenAddress = query.fromTokenAddress || tokenAddress;
    }

    const chainIndex = Number.isFinite(token?.chainIndex)
        ? Number(token.chainIndex)
        : Number.isFinite(chainContext?.chainIndex)
            ? Number(chainContext.chainIndex)
            : null;
    const chainId = Number.isFinite(token?.chainId)
        ? Number(token.chainId)
        : Number.isFinite(chainContext?.chainId)
            ? Number(chainContext.chainId)
            : chainIndex;

    if (Number.isFinite(chainIndex) && !Number.isFinite(query.chainIndex)) {
        query.chainIndex = chainIndex;
    }
    if (Number.isFinite(chainId) && !Number.isFinite(query.chainId)) {
        query.chainId = chainId;
    }

    const chainShortName = resolveChainContextShortName(chainContext) || chainContext.chainShortName;
    if (chainShortName && !query.chainShortName) {
        query.chainShortName = chainShortName;
    }

    if (context?.wallet && !query.walletAddress) {
        query.walletAddress = context.wallet;
    }

    if (OKX_QUOTE_TOKEN_ADDRESS) {
        query.quoteTokenAddress = query.quoteTokenAddress || OKX_QUOTE_TOKEN_ADDRESS;
        query.toTokenAddress = query.toTokenAddress || OKX_QUOTE_TOKEN_ADDRESS;
    }

    return query;
}

function resolveWalletTokenActionCacheTtl(actionKey) {
    switch (actionKey) {
        case 'historical_price':
        case 'historical_candles':
            return WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS;
        default:
            return WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS;
    }
}

function buildWalletTokenActionCacheKey(actionKey, context, query = null) {
    if (!actionKey) {
        return null;
    }

    const chainContext = context?.chainContext || {};
    const tokenAddress = resolveTokenContractAddress(context?.token) || context?.token?.address;
    const normalizedToken = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : '';
    const normalizedQuery = normalizeWalletTokenCacheQuery(query);

    try {
        return JSON.stringify({
            actionKey,
            token: normalizedToken,
            chain: chainContext.chainIndex ?? chainContext.chainId ?? chainContext.chainShortName ?? '',
            wallet: context?.wallet || '',
            query: normalizedQuery
        });
    } catch (error) {
        return null;
    }
}

function normalizeWalletTokenCacheQuery(query) {
    if (!query || typeof query !== 'object') {
        return null;
    }

    const entries = Object.entries(query)
        .filter(([_, value]) => value !== undefined && value !== null)
        .sort(([a], [b]) => a.localeCompare(b));

    return entries.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
    }, {});
}

function getWalletTokenActionCacheEntry(cacheKey) {
    if (!cacheKey || !walletTokenActionCache.has(cacheKey)) {
        return null;
    }

    const entry = walletTokenActionCache.get(cacheKey);
    if (!entry) {
        walletTokenActionCache.delete(cacheKey);
        return null;
    }

    const now = Date.now();
    const expired = typeof entry.expiresAt === 'number' && entry.expiresAt <= now;

    return {
        value: cloneJsonValue(entry.value),
        expired
    };
}

function setWalletTokenActionCacheEntry(cacheKey, payload, ttlMs) {
    if (!cacheKey || !payload || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        return;
    }

    pruneWalletTokenActionCache();

    walletTokenActionCache.set(cacheKey, {
        value: cloneJsonValue(payload),
        expiresAt: Date.now() + ttlMs
    });
}

function pruneWalletTokenActionCache() {
    const now = Date.now();

    for (const [cacheKey, entry] of walletTokenActionCache.entries()) {
        if (!entry) {
            walletTokenActionCache.delete(cacheKey);
            continue;
        }

        const expiresAt = typeof entry.expiresAt === 'number' ? entry.expiresAt : 0;
        if (expiresAt && expiresAt + WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS < now) {
            walletTokenActionCache.delete(cacheKey);
        }
    }

    while (walletTokenActionCache.size > WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES) {
        const oldestKey = walletTokenActionCache.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        walletTokenActionCache.delete(oldestKey);
    }
}

function cloneJsonValue(value) {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'object') {
        return value;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

function isOkxMethodNotAllowedError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    if (message.includes('http 405')) {
        return true;
    }
    if (message.includes("request method 'get' not supported") || message.includes("request method 'post' not supported")) {
        return true;
    }
    if (message.includes('method not allowed')) {
        return true;
    }

    return false;
}

function isOkxRateLimitError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    return message.includes('http 429') || message.includes('too many requests') || message.includes('rate limit');
}

function isOkxTransientResponseError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    if (message.includes('okx response code -1')) {
        return true;
    }
    if (message.includes('timed out') || message.includes('etimedout')) {
        return true;
    }
    if (message.includes('http 5')) {
        return true;
    }
    return false;
}

function isOkxRetryableError(error) {
    return isOkxRateLimitError(error) || isOkxTransientResponseError(error);
}

function isTelegramMessageNotModifiedError(error) {
    if (!error) {
        return false;
    }

    const description = error?.response?.body?.description || error?.message || '';
    return typeof description === 'string'
        ? description.toLowerCase().includes('message is not modified')
        : false;
}

async function callOkxDexEndpoint(path, query, options = {}) {
    const {
        method = 'GET',
        auth = hasOkxCredentials,
        allowFallback = true,
        bodyType = null,
        maxRetries = OKX_DEX_DEFAULT_MAX_RETRIES,
        retryDelayMs = OKX_DEX_DEFAULT_RETRY_DELAY_MS
    } = options;

    const resolvedMaxRetries = Number.isFinite(Number(maxRetries))
        ? Math.max(0, Math.floor(Number(maxRetries)))
        : OKX_DEX_DEFAULT_MAX_RETRIES;
    const resolvedRetryDelayMs = Number.isFinite(Number(retryDelayMs))
        ? Math.max(0, Math.floor(Number(retryDelayMs)))
        : OKX_DEX_DEFAULT_RETRY_DELAY_MS;

    const preferredMethod = (method || 'GET').toUpperCase();
    const fallbackMethod = preferredMethod === 'POST' ? 'GET' : 'POST';
    const methods = allowFallback && fallbackMethod !== preferredMethod
        ? [preferredMethod, fallbackMethod]
        : [preferredMethod];

    let lastError = null;

    for (const currentMethod of methods) {
        for (let attempt = 0; attempt <= resolvedMaxRetries; attempt += 1) {
            try {
                const requestBody = bodyType === 'array' && currentMethod !== 'GET'
                    ? Array.isArray(query)
                        ? query
                        : query
                            ? [query]
                            : []
                    : query;

                const requestOptions = currentMethod === 'GET'
                    ? { query, auth }
                    : { body: requestBody, auth };

                return await okxJsonRequest(currentMethod, path, requestOptions);
            } catch (error) {
                const methodNotAllowed = isOkxMethodNotAllowedError(error);
                const canRetry = !methodNotAllowed && attempt < resolvedMaxRetries && isOkxRetryableError(error);

                if (canRetry) {
                    const backoff = resolvedRetryDelayMs * Math.max(1, attempt + 1);
                    if (backoff > 0) {
                        await delay(backoff);
                    }
                    continue;
                }

                lastError = error;
                if (!allowFallback || !methodNotAllowed) {
                    throw error;
                }

                break;
            }
        }
    }

    if (lastError) {
        throw lastError;
    }

    return null;
}

function extractOkxPayloadCursor(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const candidates = [];
    if (payload.cursor !== undefined && payload.cursor !== null) {
        candidates.push(payload.cursor);
    }
    if (payload.nextCursor !== undefined && payload.nextCursor !== null) {
        candidates.push(payload.nextCursor);
    }

    const directData = payload.data;
    if (Array.isArray(directData)) {
        for (const entry of directData) {
            if (entry && entry.cursor !== undefined && entry.cursor !== null) {
                candidates.push(entry.cursor);
                break;
            }
        }
    } else if (directData && typeof directData === 'object') {
        if (directData.cursor !== undefined && directData.cursor !== null) {
            candidates.push(directData.cursor);
        }
        if (Array.isArray(directData.data)) {
            for (const entry of directData.data) {
                if (entry && entry.cursor !== undefined && entry.cursor !== null) {
                    candidates.push(entry.cursor);
                    break;
                }
            }
        }
    }

    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) {
            continue;
        }
        const normalized = String(candidate).trim();
        if (normalized) {
            return normalized;
        }
    }

    return null;
}

function normalizeWalletTokenActionResult(actionKey, payload, lang, context = null) {
    const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
    const actionLabel = config ? t(lang, config.labelKey) : actionKey;
    const result = {
        actionLabel,
        actionKey,
        metrics: [],
        listEntries: [],
        listLabel: null
    };

    const entries = unwrapOkxData(payload) || [];
    const primaryEntry = unwrapOkxFirst(payload) || (entries.length > 0 ? entries[0] : null);
    switch (actionKey) {
        case 'current_price': {
            result.metrics.push(...buildWalletTokenPriceMetrics(primaryEntry, actionKey));
            break;
        }
        case 'price_info': {
            const priceInfoEntry = unwrapOkxFirst(payload?.priceInfo) || primaryEntry;
            result.metrics.push(...buildWalletTokenPriceInfoMetrics(priceInfoEntry));

            const historyEntries = expandWalletTokenHistoryEntries(unwrapOkxData(payload?.history) || entries);
            const sortedHistory = sortWalletTokenHistoryEntries(historyEntries);
            const dailyLimit = Math.max(1, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS);
            const formattedHistory = [];

            for (let i = 0; i < sortedHistory.length && formattedHistory.length < dailyLimit; i += 1) {
                const row = sortedHistory[i];
                const prev = i + 1 < sortedHistory.length ? sortedHistory[i + 1] : null;
                const formatted = formatWalletTokenHistoryEntry(row, prev, lang);
                if (formatted) {
                    formattedHistory.push(formatted);
                }
            }

            result.listEntries = formattedHistory;
            if (result.listEntries.length > 0) {
                result.listLabel = t(lang, 'wallet_token_action_price_info_history_label', {
                    days: WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS
                }) || actionLabel;
            }
            break;
        }
        case 'historical_price': {
            const historyEntries = expandWalletTokenHistoryEntries(entries);
            const sortedHistoryEntries = sortWalletTokenHistoryEntries(historyEntries);
            const formattedEntries = [];
            const historyDays = getWalletTokenHistoryWindowDays();
            const maxHistoryEntries = Math.max(1, Math.min(historyDays, sortedHistoryEntries.length));

            for (let i = 0; i < sortedHistoryEntries.length && formattedEntries.length < maxHistoryEntries; i += 1) {
                const row = sortedHistoryEntries[i];
                const previousRow = i + 1 < sortedHistoryEntries.length ? sortedHistoryEntries[i + 1] : null;
                const formatted = formatWalletTokenHistoryEntry(row, previousRow, lang);
                if (formatted) {
                    formattedEntries.push(formatted);
                }
            }

            result.listEntries = formattedEntries;
            const historyLabel = t(lang, 'wallet_token_action_history_last_days', { days: historyDays }) || actionLabel;
            result.listLabel = historyLabel;
            break;
        }
        case 'candles': {
            const candleInsights = buildWalletTokenCandleInsights(entries, lang, {
                windowLabel: t(lang, 'wallet_token_action_candles_label_recent', { hours: 24 }),
                defaultWindowLabel: '24h'
            });
            result.listEntries = candleInsights.entries;
            result.listLabel = candleInsights.label || actionLabel;
            break;
        }
        case 'historical_candles': {
            const candleInsights = buildWalletTokenCandleInsights(entries, lang, {
                windowLabel: t(lang, 'wallet_token_action_historical_candles_label', {
                    days: WALLET_TOKEN_CANDLE_DAY_SPAN
                }),
                defaultWindowLabel: `${WALLET_TOKEN_CANDLE_DAY_SPAN}D`
            });
            result.listEntries = candleInsights.entries;
            result.listLabel = candleInsights.label || actionLabel;
            break;
        }
        case 'token_info': {
            if (primaryEntry) {
                const name = primaryEntry.name || primaryEntry.tokenName;
                const symbol = primaryEntry.symbol || primaryEntry.tokenSymbol;
                if (name || symbol) {
                    result.metrics.push({ label: '🧬 Token', value: [name, symbol].filter(Boolean).join(' / ') });
                }
                const decimals = pickOkxNumeric(primaryEntry, ['decimals', 'decimal', 'tokenDecimal']);
                if (Number.isFinite(decimals)) {
                    result.metrics.push({ label: '🔢 Decimals', value: decimals });
                }
                const supply = pickOkxNumeric(primaryEntry, ['supply', 'totalSupply', 'circulatingSupply']);
                if (Number.isFinite(supply)) {
                    result.metrics.push({ label: '📦 Supply', value: supply });
                }
                const holders = pickOkxNumeric(primaryEntry, ['holderCount', 'holders']);
                if (Number.isFinite(holders)) {
                    result.metrics.push({ label: '👥 Holders', value: holders });
                }
                const website = primaryEntry.website || primaryEntry.site;
                if (website) {
                    result.metrics.push({ label: '🌐 Website', value: website });
                }
            }
            result.listEntries = buildWalletTokenTokenInfoEntries(primaryEntry);
            if (result.listEntries.length > 0) {
                result.listLabel = t(lang, 'wallet_token_action_token_info_list_label') || actionLabel;
            }
            break;
        }
        case 'latest_price': {
            const formattedTrades = [];
            const maxTrades = Math.min(WALLET_TOKEN_TRADE_LIMIT, entries.length);
            for (let i = 0; i < maxTrades; i += 1) {
                const entry = entries[i];
                const formatted = formatWalletTokenTradeEntry(entry, i);
                if (formatted) {
                    formattedTrades.push(formatted);
                }
            }
            result.listEntries = formattedTrades;
            result.listLabel = t(lang, 'wallet_token_action_latest_price_list_label', {
                count: WALLET_TOKEN_TRADE_LIMIT
            }) || actionLabel;
            if (result.listEntries.length === 0) {
                const fallbackEntry = formatWalletTokenTradeEntry(primaryEntry, 0);
                if (fallbackEntry) {
                    result.listEntries.push(fallbackEntry);
                }
            }
            break;
        }
        case 'wallet_history': {
            const walletAddress = context?.wallet || null;
            const tokenAddress = resolveTokenContractAddress(context?.token) || null;
            const tokenSymbol = describeDexTokenValue(context?.token || {}, lang).symbolLabel || primaryEntry?.symbol;

            const historyEntries = collectWalletHistoryEntries(payload, tokenAddress);
            const { entries: limitedEntries, buyStats, sellStats } = summarizeWalletHistoryEntries(
                historyEntries,
                walletAddress,
                tokenSymbol
            );

            result.metrics.push({
                label: t(lang, 'wallet_token_action_wallet_history_metric_buys'),
                value: t(lang, 'wallet_token_action_wallet_history_metric_value', {
                    count: buyStats.count,
                    total: buyStats.total,
                    symbol: tokenSymbol || 'TOKEN'
                })
            });

            result.metrics.push({
                label: t(lang, 'wallet_token_action_wallet_history_metric_sells'),
                value: t(lang, 'wallet_token_action_wallet_history_metric_value', {
                    count: sellStats.count,
                    total: sellStats.total,
                    symbol: tokenSymbol || 'TOKEN'
                })
            });

            result.listEntries = limitedEntries.map((entry, index) =>
                formatWalletHistoryEntry(entry, walletAddress, tokenSymbol, index)
            );
            if (result.listEntries.length > 0) {
                result.listLabel = t(lang, 'wallet_token_action_wallet_history_list_label', {
                    count: result.listEntries.length
                }) || actionLabel;
            }
            break;
        }
        case 'holder': {
            const total = pickOkxNumeric(primaryEntry || payload?.data || {}, ['holderCount', 'holders', 'total']);
            if (Number.isFinite(total)) {
                result.metrics.push({ label: 'Total holders', value: formatNumberValue(total, { maximumFractionDigits: 0 }) });
            }
            const formattedHolders = [];
            const holderLimit = Math.min(WALLET_TOKEN_HOLDER_LIMIT, entries.length);
            for (let i = 0; i < holderLimit; i += 1) {
                const entry = entries[i];
                const formatted = formatWalletTokenHolderEntry(entry, i);
                if (formatted) {
                    formattedHolders.push(formatted);
                }
            }
            result.listEntries = formattedHolders;
            result.listLabel = t(lang, 'wallet_token_action_holder_list_label', {
                count: formattedHolders.length || holderLimit
            }) || actionLabel;
            break;
        }
        default:
            break;
    }

    return result;
}

function buildWalletTokenPriceMetrics(entry, actionKey) {
    const metrics = [];
    if (!entry) {
        return metrics;
    }

    const price = extractOkxPriceValue(entry);
    if (price !== null && price !== undefined) {
        metrics.push({ label: '💰 Price', value: `${price} USD` });
    }

    const changeAbs = pickOkxNumeric(entry, ['usdChange24h', 'change24h', 'change', 'priceChange']);
    if (Number.isFinite(changeAbs)) {
        metrics.push({ label: '📈 Change (24h)', value: changeAbs });
    }

    const changePercent = pickOkxNumeric(entry, ['changeRate', 'changePercent', 'change24hPercent', 'percentChange', 'changePct']);
    if (Number.isFinite(changePercent)) {
        metrics.push({ label: '📉 Change %', value: `${changePercent}%` });
    }

    const volume = pickOkxNumeric(entry, ['volume24h', 'usdVolume24h', 'turnover24h', 'volume']);
    if (Number.isFinite(volume)) {
        metrics.push({ label: '📊 Volume 24h', value: volume });
    }

    if (actionKey === 'price_info') {
        const high24h = pickOkxNumeric(entry, ['high24h', 'priceHigh24h', 'highestPrice24h', 'high']);
        if (Number.isFinite(high24h)) {
            metrics.push({ label: '🚀 24h High', value: high24h });
        }
        const low24h = pickOkxNumeric(entry, ['low24h', 'priceLow24h', 'lowestPrice24h', 'low']);
        if (Number.isFinite(low24h)) {
            metrics.push({ label: '📉 24h Low', value: low24h });
        }
        const volume30d = pickOkxNumeric(entry, ['volume30d', 'usdVolume30d', 'thirtyDayVolume', 'volume30Days', 'turnover30d']);
        if (Number.isFinite(volume30d)) {
            metrics.push({ label: '📦 Volume (30d)', value: volume30d });
        }
    }

    const liquidity = pickOkxNumeric(entry, ['liquidity', 'liquidityUsd', 'usdLiquidity']);
    if (Number.isFinite(liquidity)) {
        metrics.push({ label: '💦 Liquidity', value: liquidity });
    }

    const marketCap = pickOkxNumeric(entry, ['marketCap', 'marketCapUsd', 'fdvUsd', 'fullyDilutedMarketCap']);
    if (Number.isFinite(marketCap)) {
        metrics.push({ label: '🏦 Market cap', value: marketCap });
    }

    const timestamp = entry.ts || entry.timestamp || entry.time;
    const timestampLabel = formatWalletTokenTimestamp(timestamp);
    if (timestampLabel) {
        metrics.push({ label: '🕒 Timestamp', value: timestampLabel });
    }

    const source = entry.source || entry.market || entry.venue;
    if (source) {
        metrics.push({ label: '🔗 Source', value: source });
    }

    return metrics;
}

function buildWalletTokenPriceInfoMetrics(entry) {
    const metrics = [];
    if (!entry) {
        return metrics;
    }

    const timestamp = entry.time || entry.ts || entry.timestamp;
    const label = formatWalletTokenTimestamp(timestamp);
    if (label) {
        metrics.push({ label: '⏰ Time', value: label });
    }

    const price = entry.price || entry.latestPrice;
    if (price !== undefined && price !== null) {
        metrics.push({ label: '💰 Price', value: `${price} USD` });
    }

    const marketCap = pickOkxNumeric(entry, ['marketCap']);
    if (Number.isFinite(marketCap)) {
        metrics.push({ label: '🏦 Market cap', value: marketCap });
    }

    if (entry.minPrice !== undefined && entry.minPrice !== null) {
        metrics.push({ label: '📉 24h Low', value: entry.minPrice });
    }

    if (entry.maxPrice !== undefined && entry.maxPrice !== null) {
        metrics.push({ label: '🚀 24h High', value: entry.maxPrice });
    }

    const tradeNum = pickOkxNumeric(entry, ['tradeNum']);
    if (Number.isFinite(tradeNum)) {
        metrics.push({ label: '🔁 Trades (24h)', value: tradeNum });
    }

    const changeKeys = [
        ['priceChange5M', 'priceChange5m'],
        ['priceChange1H', 'priceChange1h'],
        ['priceChange4H', 'priceChange4h'],
        ['priceChange24H', 'priceChange24h']
    ];
    for (const pair of changeKeys) {
        for (const key of pair) {
            if (entry[key] !== undefined && entry[key] !== null) {
                metrics.push({ label: `📈 ${key.replace('priceChange', '')}`, value: `${entry[key]}%` });
                break;
            }
        }
    }

    const volumeKeys = [
        ['volume5M', 'volume5m'],
        ['volume1H', 'volume1h'],
        ['volume4H', 'volume4h'],
        ['volume24H', 'volume24h']
    ];
    for (const pair of volumeKeys) {
        for (const key of pair) {
            const volume = pickOkxNumeric(entry, [key]);
            if (Number.isFinite(volume)) {
                metrics.push({ label: `📊 ${key.replace('volume', 'Vol ')}`, value: volume });
                break;
            }
        }
    }

    const txKeys = [
        ['txs5M', 'txs5m'],
        ['txs1H', 'txs1h'],
        ['txs4H', 'txs4h'],
        ['txs24H', 'txs24h']
    ];
    for (const pair of txKeys) {
        for (const key of pair) {
            const txs = pickOkxNumeric(entry, [key]);
            if (Number.isFinite(txs)) {
                metrics.push({ label: `🧾 ${key.replace('txs', 'Txs ')}`, value: txs });
                break;
            }
        }
    }

    const circSupply = pickOkxNumeric(entry, ['circSupply', 'circulatingSupply']);
    if (Number.isFinite(circSupply)) {
        metrics.push({ label: '🔄 Circulating supply', value: circSupply });
    }

    const liquidity = pickOkxNumeric(entry, ['liquidity']);
    if (Number.isFinite(liquidity)) {
        metrics.push({ label: '💦 Liquidity', value: liquidity });
    }

    const holders = pickOkxNumeric(entry, ['holders', 'holderCount']);
    if (Number.isFinite(holders)) {
        metrics.push({ label: '👥 Holders', value: holders });
    }

    return metrics;
}

function formatWalletTokenTimestamp(value) {
    if (value === undefined || value === null) {
        return null;
    }

    let numeric = null;
    if (typeof value === 'number') {
        numeric = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+$/.test(trimmed)) {
            numeric = Number(trimmed);
        } else {
            return trimmed;
        }
    } else {
        return null;
    }

    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    if (!Number.isFinite(ms)) {
        return null;
    }
    return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function expandWalletTokenHistoryEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    const result = [];
    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        if (Array.isArray(entry.prices)) {
            for (const priceRow of entry.prices) {
                if (priceRow) {
                    result.push(priceRow);
                }
            }
            continue;
        }

        result.push(entry);
    }

    return result;
}

function resampleWalletTokenHistoryEntries(entries, targetPeriod) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    const normalizedTarget = normalizeWalletTokenHistoryPeriod(targetPeriod);
    const bucketMs = getWalletTokenHistoryBucketMs(normalizedTarget);
    const requestPeriod = resolveWalletTokenHistoryRequestPeriod(normalizedTarget);
    const requestPeriodMs = getWalletTokenHistoryRequestPeriodMs(requestPeriod);

    if (!bucketMs || !requestPeriodMs || bucketMs <= requestPeriodMs) {
        return entries.slice();
    }

    const buckets = new Map();
    for (const entry of entries) {
        const timestamp = getWalletTokenHistoryTimestampValue(entry);
        if (!Number.isFinite(timestamp)) {
            continue;
        }
        const bucketKey = Math.floor(timestamp / bucketMs);
        const existing = buckets.get(bucketKey);
        if (!existing || timestamp > existing.timestamp) {
            buckets.set(bucketKey, { entry, timestamp });
        }
    }

    const aggregated = [];
    for (const value of buckets.values()) {
        if (value?.entry) {
            aggregated.push(value.entry);
        }
    }

    return aggregated;
}

function sortWalletTokenHistoryEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .slice()
        .sort((a, b) => {
            const timestampA = getWalletTokenHistoryTimestampValue(a);
            const timestampB = getWalletTokenHistoryTimestampValue(b);

            if (timestampA === null && timestampB === null) {
                return 0;
            }
            if (timestampA === null) {
                return 1;
            }
            if (timestampB === null) {
                return -1;
            }

            return timestampB - timestampA;
        });
}

function getWalletTokenHistoryTimestampRaw(row) {
    if (!row) {
        return null;
    }

    if (Array.isArray(row)) {
        return row.length > 0 ? row[0] : null;
    }

    return row.ts ?? row.timestamp ?? row.time ?? row.date ?? null;
}

function getWalletTokenHistoryTimestampValue(row) {
    const raw = getWalletTokenHistoryTimestampRaw(row);
    if (raw === undefined || raw === null) {
        return null;
    }

    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }

        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return numeric;
        }

        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function getWalletTokenHistoryPriceText(row) {
    if (!row) {
        return null;
    }

    if (Array.isArray(row)) {
        const candidate = row[1] ?? row[2];
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
            return String(candidate).trim();
        }
    }

    const fields = ['price', 'value', 'indexPrice', 'close', 'avgPrice'];
    for (const field of fields) {
        if (row[field] !== undefined && row[field] !== null) {
            const text = String(row[field]).trim();
            if (text) {
                return text;
            }
        }
    }

    return null;
}

function countDistinctWalletTokenHistoryPrices(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 0;
    }

    const seen = new Set();
    for (const entry of entries) {
        const priceText = getWalletTokenHistoryPriceText(entry);
        if (priceText !== null) {
            seen.add(priceText);
        }
    }

    return seen.size;
}

function formatWalletTokenHistoryEntry(row, previousRow, lang) {
    if (!row) {
        return null;
    }

    const timestampRaw = getWalletTokenHistoryTimestampRaw(row);
    const label = formatWalletTokenTimestamp(timestampRaw) || timestampRaw;
    const priceText = getWalletTokenHistoryPriceText(row);

    if (!label && priceText === null) {
        return null;
    }

    let deltaSuffix = '';
    if (previousRow) {
        const previousPriceText = getWalletTokenHistoryPriceText(previousRow);
        if (priceText !== null && previousPriceText !== null) {
            const deltaValue = subtractDecimalStrings(priceText, previousPriceText);
            if (deltaValue !== null) {
                let normalizedDelta = deltaValue;
                if (!normalizedDelta.startsWith('-') && normalizedDelta !== '0') {
                    normalizedDelta = `+${normalizedDelta}`;
                }
                const deltaLabel = t(lang || defaultLang, 'wallet_token_action_history_delta', { delta: normalizedDelta });
                if (deltaLabel) {
                    deltaSuffix = ` (${deltaLabel})`;
                }
            }
        }
    }

    const priceDisplay = priceText !== null ? priceText : '—';
    return label ? `${label}: ${priceDisplay}${deltaSuffix}` : `${priceDisplay}${deltaSuffix}`;
}

function formatWalletTokenPriceInfoEntry(row, index = 0) {
    if (!row) {
        return null;
    }

    const timestamp = row.time || row.ts || row.timestamp;
    const label = formatWalletTokenTimestamp(timestamp) || 'Snapshot';
    const price = row.price || row.latestPrice;
    const marketCap = pickOkxNumeric(row, ['marketCap']);
    const volume24h = pickOkxNumeric(row, ['volume24H', 'volume24h']);
    const liquidity = pickOkxNumeric(row, ['liquidity']);
    const holders = pickOkxNumeric(row, ['holders', 'holderCount']);

    const parts = [];
    if (price !== undefined && price !== null) {
        parts.push(`Price ${price} USD`);
    }
    if (Number.isFinite(marketCap)) {
        parts.push(`MC ${marketCap}`);
    }
    if (Number.isFinite(volume24h)) {
        parts.push(`Vol24h ${volume24h}`);
    }
    if (Number.isFinite(liquidity)) {
        parts.push(`Liq ${liquidity}`);
    }
    if (Number.isFinite(holders)) {
        parts.push(`Holders ${holders}`);
    }

    return `${index + 1}. ${label}${parts.length > 0 ? ` — ${parts.join(' | ')}` : ''}`;
}

function buildWalletTokenCandleInsights(entries, lang, options = {}) {
    const { windowLabel, defaultWindowLabel } = options;
    const normalizedCandles = normalizeWalletTokenCandles(entries);
    const analysis = analyzeWalletTokenCandles(normalizedCandles);

    if (!analysis || normalizedCandles.length === 0) {
        return { entries: [], label: windowLabel || defaultWindowLabel };
    }

    const label = (windowLabel || defaultWindowLabel || '').trim();
    const summary = formatWalletTokenCandleSummary(normalizedCandles, analysis, lang, label);
    const detail = formatWalletTokenCandleDetailLines(analysis, lang);

    return {
        entries: [summary, ...detail].filter(Boolean),
        label,
    };
}

function normalizeWalletTokenCandles(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    const normalized = [];

    for (const row of entries) {
        if (!row) {
            continue;
        }

        let timestamp;
        let open;
        let high;
        let low;
        let close;
        let volume;

        if (Array.isArray(row)) {
            [timestamp, open, high, low, close, volume] = row;
        } else {
            timestamp = row.ts || row.timestamp || row.time;
            open = row.open || row.o;
            high = row.high || row.h;
            low = row.low || row.l;
            close = row.close || row.c;
            volume = row.volume || row.v;
        }

        if (timestamp === undefined || timestamp === null) {
            continue;
        }

        normalized.push({
            time: timestamp,
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
            volume: Number(volume),
        });
    }

    return normalized.filter((row) => Number.isFinite(row.open) && Number.isFinite(row.close));
}

function analyzeWalletTokenCandles(candles) {
    if (!Array.isArray(candles) || candles.length === 0) {
        return null;
    }

    const sorted = [...candles].sort((a, b) => (b.time || 0) - (a.time || 0));
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];

    const startPrice = oldest.open;
    const finalPrice = newest.close;

    const stats = sorted.reduce(
        (acc, candle) => {
            acc.overallHigh = Math.max(acc.overallHigh, candle.high);
            acc.overallLow = Math.min(acc.overallLow, candle.low);
            acc.totalVolume += Number.isFinite(candle.volume) ? candle.volume : 0;

            if (Number.isFinite(candle.volume) && candle.volume > acc.maxVolume.volume) {
                acc.maxVolume = { volume: candle.volume, time: candle.time };
            }

            return acc;
        },
        {
            overallHigh: -Infinity,
            overallLow: Infinity,
            totalVolume: 0,
            maxVolume: { volume: 0, time: null },
        }
    );

    const netChange = finalPrice - startPrice;
    const percentChange = startPrice !== 0 ? (netChange / startPrice) * 100 : 0;

    return {
        startPrice,
        finalPrice,
        netChange,
        percentChange,
        ...stats,
    };
}

function formatWalletTokenCandleSummary(candles, analysis, lang, windowLabel = '') {
    const trend = describeWalletTokenCandleTrend(analysis.percentChange, lang);
    const start = formatCandleNumber(analysis.startPrice);
    const end = formatCandleNumber(analysis.finalPrice);
    const pct = formatPercent(analysis.percentChange);
    const label = windowLabel ? ` (${windowLabel})` : '';

    return [
        t(lang, 'wallet_token_action_candles_summary_title', { window: windowLabel || 'Candle' }) ||
            `📊 Candle analysis${label}`,
        t(lang, 'wallet_token_action_candles_summary_change', {
            start,
            end,
            percent: pct,
            trend,
        }) || `💹 O→C: ${start} → ${end} (${pct}) — ${trend}`,
    ]
        .filter(Boolean)
        .join('\n');
}

function formatWalletTokenCandleDetailLines(analysis, lang) {
    if (!analysis) {
        return [];
    }

    const low = formatCandleNumber(analysis.overallLow);
    const high = formatCandleNumber(analysis.overallHigh);
    const totalVolume = formatCandleVolume(analysis.totalVolume);
    const maxVolume = formatCandleVolume(analysis.maxVolume.volume);
    const maxVolumeTime = formatWalletTokenTimestamp(analysis.maxVolume.time) || '—';

    const rangeLine =
        t(lang, 'wallet_token_action_candles_summary_range', { low, high }) || `📈 Range: L ${low} / H ${high}`;
    const volumeLine =
        t(lang, 'wallet_token_action_candles_summary_volume', {
            total: totalVolume,
            peak: maxVolume,
            time: maxVolumeTime,
        }) || `🔊 Vol: ${totalVolume} | Peak ${maxVolume} @ ${maxVolumeTime}`;

    const insightLine = t(lang, 'wallet_token_action_candles_summary_support', { low, high });

    return [rangeLine, volumeLine, insightLine].filter(Boolean);
}

function describeWalletTokenCandleTrend(percentChange, lang) {
    if (!Number.isFinite(percentChange)) {
        return '';
    }

    const pct = formatPercent(percentChange);
    if (percentChange >= 5) {
        return t(lang, 'wallet_token_action_candles_summary_trend_strong_up', { percent: pct }) ||
            `🚀 Strong upside (${pct})`;
    }
    if (percentChange <= -5) {
        return t(lang, 'wallet_token_action_candles_summary_trend_strong_down', { percent: pct }) ||
            `🚨 Heavy sell-off (${pct})`;
    }
    if (percentChange > 0) {
        return t(lang, 'wallet_token_action_candles_summary_trend_up', { percent: pct }) || `🟢 Mild rise (${pct})`;
    }
    return t(lang, 'wallet_token_action_candles_summary_trend_down', { percent: pct }) || `🔴 Slight dip (${pct})`;
}

function formatCandleNumber(value, decimals = 8) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return Number(value).toFixed(decimals);
}

function formatPercent(value) {
    if (!Number.isFinite(value)) {
        return '0.00%';
    }
    return `${value.toFixed(2)}%`;
}

function formatCandleVolume(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function buildWalletTokenTokenInfoEntries(entry) {
    if (!entry || typeof entry !== 'object') {
        return [];
    }

    return Object.keys(entry)
        .sort()
        .map((key) => {
            const value = formatWalletTokenTokenInfoValue(entry[key]);
            if (value === null) {
                return null;
            }
            return `${key}: ${value}`;
        })
        .filter(Boolean);
}

function formatWalletTokenTokenInfoValue(value) {
    if (value === undefined) {
        return null;
    }
    if (value === null) {
        return '—';
    }
    if (typeof value === 'object') {
        try {
            const serialized = JSON.stringify(value);
            if (serialized.length > 300) {
                return `${serialized.slice(0, 297)}…`;
            }
            return serialized;
        } catch (error) {
            return String(value);
        }
    }
    return String(value);
}

function formatWalletTokenHolderEntry(row, index = 0) {
    if (!row) {
        return null;
    }
    const address =
        row.address || row.walletAddress || row.holderAddress || row.holderWalletAddress;
    const normalizedAddress = normalizeAddressSafe(address) || address;
    const addressHtml = normalizedAddress ? formatCopyableValueHtml(normalizedAddress) : null;
    const amount = row.amount || row.balance || row.quantity || row.holdAmount || row.holding;
    const percent = pickOkxNumeric(row, ['percentage', 'percent', 'ratio', 'share']);
    const usdValue = pickOkxNumeric(row, ['usdValue', 'valueUsd', 'holdingValueUsd', 'usd']);
    const parts = [];
    const rank = index + 1;

    const header = addressHtml ? `#${rank} - ${addressHtml}` : `#${rank} - Wallet`;
    parts.push(header);

    if (amount !== undefined && amount !== null) {
        const amountLabel = formatNumberValue(amount, { maximumFractionDigits: 6 });
        parts.push(`Hold: <b>${escapeHtml(String(amountLabel))}</b>`);
    }
    if (Number.isFinite(percent)) {
        const percentLabel = formatNumberValue(percent, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        parts.push(`Share: ${percentLabel}%`);
    }
    if (Number.isFinite(usdValue)) {
        const usdLabel = formatFiatValue(usdValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || usdValue;
        parts.push(`USD: ${escapeHtml(String(usdLabel))}`);
    }

    return parts.join(' | ');
}
function formatWalletTokenTradeEntry(row, index = 0) {
    if (!row) {
        return null;
    }

    let timestamp;
    let price;
    let amount;
    let side;
    let maker;
    let taker;
    let volume;
    let dexName;
    let txHashUrl;

    if (Array.isArray(row)) {
        [timestamp, price, amount, side] = row;
    } else {
        timestamp = row.ts || row.timestamp || row.time;
        price = row.price || row.fillPrice || row.tradePrice;
        amount = row.amount || row.size || row.qty || row.quantity;
        side = row.side || row.direction || row.type;
        volume = row.volume;
        dexName = row.dexName || row.dex;
        txHashUrl = row.txHashUrl || row.txUrl;
        maker = row.maker
            || row.makerAddress
            || row.buyerAddress
            || row.buyer
            || row.from
            || row.fromAddress
            || row.addressFrom
            || row.traderAddress
            || row.userAddress;
        taker = row.taker
            || row.takerAddress
            || row.sellerAddress
            || row.seller
            || row.to
            || row.toAddress
            || row.addressTo
            || row.counterpartyAddress;
    }

    const label = formatWalletTokenTimestamp(timestamp) || timestamp || 'Trade';
    const sideLabel = side ? String(side).toUpperCase() : null;
    const detailParts = [];
    if (sideLabel) {
        detailParts.push(sideLabel);
    }
    if (dexName) {
        detailParts.push(`DEX ${dexName}`);
    }
    if (amount !== undefined && amount !== null) {
        detailParts.push(`Amount ${amount}`);
    }
    if (price !== undefined && price !== null) {
        detailParts.push(`Price ${price}`);
    }
    if (volume !== undefined && volume !== null) {
        detailParts.push(`USD ${volume}`);
    }

    const normalizedMaker = normalizeAddressSafe(maker) || maker;
    const normalizedTaker = normalizeAddressSafe(taker) || taker;
    const makerHtml = normalizedMaker ? formatCopyableValueHtml(normalizedMaker) : null;
    const takerHtml = normalizedTaker ? formatCopyableValueHtml(normalizedTaker) : null;
    const addressParts = [];
    if (makerHtml) {
        addressParts.push(`👤 From: ${makerHtml}`);
    }
    if (takerHtml) {
        addressParts.push(`🎯 To: ${takerHtml}`);
    }

    const txHash = row.txHash || row.transactionHash || row.hash || row.txid;

    const changed = row.changedTokenInfo || row.changedTokenInfos;
    const changeLines = [];
    if (Array.isArray(changed)) {
        for (const info of changed) {
            if (!info) continue;
            const symbol = info.tokenSymbol || info.symbol;
            const infoAmount = info.amount;
            const infoAddress = info.tokenContractAddress;
            const parts = [];
            if (symbol) parts.push(symbol);
            if (infoAmount !== undefined && infoAmount !== null) {
                parts.push(`Amt ${infoAmount}`);
            }
            if (infoAddress) {
                const contractHtml = formatCopyableValueHtml(infoAddress) || infoAddress;
                parts.push(`Contract ${contractHtml}`);
            }
            if (parts.length > 0) {
                changeLines.push(`   • ${parts.join(' | ')}`);
            }
        }
    }

    const lines = [];
    lines.push('—'.repeat(28));
    const header = detailParts.length > 0 ? ` — ${detailParts.join(' | ')}` : '';
    lines.push(`💱 Trade #${index + 1}: ${label}${header}`);
    if (addressParts.length > 0) {
        lines.push(addressParts.join(' / '));
    }
    if (txHashUrl) {
        lines.push(`🔗 Tx: ${formatCopyableValueHtml(txHashUrl) || txHashUrl}`);
    } else if (txHash) {
        lines.push(`🔗 Tx: ${formatCopyableValueHtml(txHash) || txHash}`);
    }
    if (changeLines.length > 0) {
        lines.push(...changeLines.map((line) => line.replace('•', '📦')));
    }

    return lines.join('\n');
}

function collectWalletHistoryEntries(payload, tokenAddress) {
    const rawEntries = unwrapOkxData(payload) || [];
    const tokenLower = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : null;
    const result = [];

    for (const group of rawEntries) {
        if (!group) {
            continue;
        }

        const transactions = Array.isArray(group.transactionList)
            ? group.transactionList
            : Array.isArray(group.transactions)
                ? group.transactions
                : Array.isArray(group.transaction_list)
                    ? group.transaction_list
                    : null;

        if (Array.isArray(transactions)) {
            for (const tx of transactions) {
                if (!tx) continue;
                if (tokenLower && tx.tokenContractAddress && tx.tokenContractAddress.toLowerCase() !== tokenLower) {
                    continue;
                }
                result.push(tx);
            }
            continue;
        }

        if (group.txHash) {
            if (tokenLower && group.tokenContractAddress && group.tokenContractAddress.toLowerCase() !== tokenLower) {
                continue;
            }
            result.push(group);
        }
    }

    return result;
}

function summarizeWalletHistoryEntries(entries, walletAddress, tokenSymbol) {
    const walletLower = typeof walletAddress === 'string' ? walletAddress.toLowerCase() : null;
    const sorted = [...entries].sort((a, b) => {
        const aTime = Number(a?.txTime || a?.timestamp || a?.time || 0);
        const bTime = Number(b?.txTime || b?.timestamp || b?.time || 0);
        return Number.isFinite(bTime) && Number.isFinite(aTime) ? bTime - aTime : 0;
    });

    const limited = sorted.slice(0, WALLET_TOKEN_TX_HISTORY_LIMIT);
    const buyStats = { count: 0, total: 0 };
    const sellStats = { count: 0, total: 0 };

    for (const entry of limited) {
        const direction = classifyWalletHistoryDirection(entry, walletLower);
        const amount = resolveWalletHistoryAmount(entry, walletLower);

        if (direction === 'buy') {
            buyStats.count += 1;
            if (Number.isFinite(amount)) {
                buyStats.total += amount;
            }
        } else if (direction === 'sell') {
            sellStats.count += 1;
            if (Number.isFinite(amount)) {
                sellStats.total += amount;
            }
        }
    }

    return { entries: limited, buyStats, sellStats, tokenSymbol };
}

function classifyWalletHistoryDirection(entry, walletLower) {
    if (!entry || !walletLower) {
        return null;
    }

    const fromAddrs = Array.isArray(entry.from)
        ? entry.from.map((item) => item?.address?.toLowerCase()).filter(Boolean)
        : [];
    const toAddrs = Array.isArray(entry.to)
        ? entry.to.map((item) => item?.address?.toLowerCase()).filter(Boolean)
        : [];

    if (toAddrs.includes(walletLower)) {
        return 'buy';
    }
    if (fromAddrs.includes(walletLower)) {
        return 'sell';
    }

    return null;
}

function resolveWalletHistoryAmount(entry, walletLower) {
    if (!entry) {
        return null;
    }

    const direct = normalizeNumeric(entry.amount);
    if (Number.isFinite(direct)) {
        return direct;
    }

    const findAmount = (rows = []) => {
        for (const row of rows) {
            if (!row || !row.address) continue;
            const isMatch = walletLower ? row.address.toLowerCase() === walletLower : true;
            if (!isMatch) continue;
            const numeric = normalizeNumeric(row.amount);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
        return null;
    };

    const toAmount = findAmount(entry.to);
    if (Number.isFinite(toAmount)) {
        return toAmount;
    }

    const fromAmount = findAmount(entry.from);
    if (Number.isFinite(fromAmount)) {
        return fromAmount;
    }

    return null;
}

function formatWalletHistoryEntry(entry, walletAddress, tokenSymbol, index = 0) {
    if (!entry) {
        return null;
    }

    const walletLower = typeof walletAddress === 'string' ? walletAddress.toLowerCase() : null;
    const direction = classifyWalletHistoryDirection(entry, walletLower);
    const amount = resolveWalletHistoryAmount(entry, walletLower);
    const amountLabel = amount !== null && amount !== undefined
        ? `${amount} ${tokenSymbol || entry.symbol || ''}`.trim()
        : '—';

    const fromAddrs = Array.isArray(entry.from) ? entry.from.map((item) => item?.address).filter(Boolean) : [];
    const toAddrs = Array.isArray(entry.to) ? entry.to.map((item) => item?.address).filter(Boolean) : [];
    const txHash = entry.txHash || entry.txhash || entry.hash;
    const txFee = entry.txFee || entry.fee;
    const status = entry.txStatus || entry.status || '—';
    const timestampLabel = formatWalletTokenTimestamp(entry.txTime || entry.timestamp || entry.time) || 'Tx';

    const lines = [];
    lines.push('—'.repeat(28));
    const prefix = direction === 'buy' ? '🟢 Buy' : direction === 'sell' ? '🔴 Sell' : '⚪️ Tx';
    lines.push(`${prefix} #${index + 1} — ${timestampLabel}`);
    lines.push(`💰 ${escapeHtml(amountLabel)}`);
    lines.push(`📡 Status: ${escapeHtml(String(status))}`);
    if (txFee !== undefined && txFee !== null && txFee !== '') {
        lines.push(`⛽ Fee: ${escapeHtml(String(txFee))}`);
    }

    if (fromAddrs.length > 0) {
        const formatted = fromAddrs.map((addr) => formatCopyableValueHtml(addr) || escapeHtml(addr));
        lines.push(`👤 From: ${formatted.join(', ')}`);
    }

    if (toAddrs.length > 0) {
        const formatted = toAddrs.map((addr) => formatCopyableValueHtml(addr) || escapeHtml(addr));
        lines.push(`🎯 To: ${formatted.join(', ')}`);
    }

    if (txHash) {
        lines.push(`🔗 Tx: ${formatCopyableValueHtml(txHash) || escapeHtml(txHash)}`);
    }

    return lines.join('\n');
}

function formatTxhashDetail(detail, lang, options = {}) {
    const lines = [];
    const mainAddress = resolveTxhashPrimaryAddress(detail, options.mainAddress);
    const mainLower = mainAddress ? mainAddress.toLowerCase() : null;
    const txHash = detail.txhash || detail.txHash || detail.hash || '—';
    const chain = detail.chainIndex ?? detail.chainId ?? '—';
    const status = normalizeTxStatusText(detail.txStatus);
    const amount = detail.amount !== undefined && detail.amount !== null ? detail.amount : '0';
    const symbol = detail.symbol || 'TOKEN';
    const amountLabel = `${amount} ${symbol}`.trim();
    const gasLimit = detail.gasLimit || detail.gas || null;
    const gasUsed = detail.gasUsed || null;
    const gasPrice = detail.gasPrice || null;
    const fee = detail.txFee || detail.fee || null;
    const methodId = detail.methodId || null;
    const tokenTransfers = Array.isArray(detail.tokenTransferDetails) ? detail.tokenTransferDetails : [];
    const internalTransfers = Array.isArray(detail.internalTransactionDetails)
        ? detail.internalTransactionDetails
        : [];

    const computedFee = deriveTxFeeLabel(fee, gasUsed, gasPrice);
    const tokenTransferInsight = summarizeTokenTransfers(tokenTransfers, mainLower, internalTransfers, symbol);
    const primaryAction = buildTxhashActionSummary(tokenTransferInsight, lang);

    lines.push(t(lang, 'txhash_title'));
    lines.push(t(lang, 'txhash_hash_line', { hash: formatCopyableValueHtml(txHash) || escapeHtml(txHash) }));
    lines.push(t(lang, 'txhash_summary_line', {
        chain: escapeHtml(String(chain)),
        status: escapeHtml(status),
        amount: escapeHtml(amountLabel)
    }));

    if (mainAddress) {
        lines.push(t(lang, 'txhash_insight_wallet', {
            wallet: formatCopyableValueHtml(mainAddress) || escapeHtml(mainAddress)
        }));
    } else {
        lines.push(t(lang, 'txhash_insight_no_wallet'));
    }

    lines.push('', t(lang, 'txhash_action_title'));
    lines.push(primaryAction);
    lines.push(t(lang, 'txhash_insight_buy', {
        summary: formatTxhashTotals(tokenTransferInsight.buys, lang)
    }));
    lines.push(t(lang, 'txhash_insight_sell', {
        summary: formatTxhashTotals(tokenTransferInsight.sells, lang)
    }));

    const hasFeeBlock = fee || computedFee || gasUsed || gasPrice || methodId || detail.l1OriginHash;
    if (hasFeeBlock) {
        lines.push('', t(lang, 'txhash_fee_header'));
        if (fee || computedFee) {
            lines.push(t(lang, 'txhash_fee_line', { fee: escapeHtml(String(fee || computedFee)) }));
        }
        if (gasUsed || gasPrice || gasLimit) {
            lines.push(t(lang, 'txhash_gas_line', {
                limit: gasLimit ? escapeHtml(String(gasLimit)) : '—',
                used: gasUsed ? escapeHtml(String(gasUsed)) : '—',
                price: gasPrice ? escapeHtml(String(gasPrice)) : '—'
            }));
        }
        if (methodId) {
            lines.push(t(lang, 'txhash_method_line', { method: escapeHtml(String(methodId)) }));
        }
        if (detail.l1OriginHash) {
            lines.push(t(lang, 'txhash_l1_hash', {
                hash: formatCopyableValueHtml(detail.l1OriginHash) || escapeHtml(String(detail.l1OriginHash))
            }));
        }
    }

    lines.push('', t(lang, 'txhash_token_header'));
    const tokenDetails = formatTokenTransferDetails(detail.tokenTransferDetails, lang);
    if (tokenDetails.length > 0) {
        lines.push(...tokenDetails);
    } else {
        lines.push(t(lang, 'txhash_token_none'));
    }

    lines.push('', t(lang, 'txhash_lookup_hint'));

    return lines.join('\n');
}

function resolveTxhashPrimaryAddress(detail, providedAddress) {
    const normalizedProvided = normalizeAddressSafe(providedAddress);
    if (normalizedProvided) {
        return normalizedProvided;
    }

    if (Array.isArray(detail.fromDetails)) {
        for (const row of detail.fromDetails) {
            if (!row || row.isContract) continue;
            const normalized = normalizeAddressSafe(row.address);
            if (normalized) {
                return normalized;
            }
        }
    }

    if (Array.isArray(detail.tokenTransferDetails)) {
        for (const row of detail.tokenTransferDetails) {
            if (!row || row.isFromContract) continue;
            const normalized = normalizeAddressSafe(row.from);
            if (normalized) {
                return normalized;
            }
        }
    }

    const counts = new Map();
    const bump = (address, weight = 1) => {
        const normalized = normalizeAddressSafe(address);
        if (!normalized) return;
        const current = counts.get(normalized) || 0;
        counts.set(normalized, current + weight);
    };

    const maybeWeigh = (address, isContract, weight = 1) => bump(address, isContract ? weight * 0.5 : weight);

    if (Array.isArray(detail.fromDetails)) {
        for (const row of detail.fromDetails) {
            if (!row) continue;
            maybeWeigh(row.address, row.isContract, 2);
        }
    }

    if (Array.isArray(detail.tokenTransferDetails)) {
        for (const row of detail.tokenTransferDetails) {
            if (!row) continue;
            maybeWeigh(row.from, row.isFromContract, 1.5);
            maybeWeigh(row.to, row.isToContract);
        }
    }

    if (Array.isArray(detail.toDetails)) {
        for (const row of detail.toDetails) {
            if (!row) continue;
            maybeWeigh(row.address, row.isContract);
        }
    }

    let bestAddress = null;
    let bestScore = 0;
    for (const [address, score] of counts.entries()) {
        if (score > bestScore) {
            bestAddress = address;
            bestScore = score;
        }
    }

    return bestAddress;
}

function buildTxhashActionSummary(tokenTransferInsight, lang) {
    const pickTopToken = (map) => {
        if (!map || !(map instanceof Map) || map.size === 0) return null;
        let best = null;
        for (const [symbol, bucket] of map.entries()) {
            if (!best) {
                best = { symbol, bucket };
                continue;
            }
            const bestValue = best.bucket.hasNumeric ? best.bucket.totalNumeric : best.bucket.count;
            const currentValue = bucket.hasNumeric ? bucket.totalNumeric : bucket.count;
            if (currentValue > bestValue) {
                best = { symbol, bucket };
            }
        }
        if (!best) return null;
        const amountText = best.bucket.hasNumeric
            ? formatTokenQuantity(best.bucket.totalNumeric, { maximumFractionDigits: 8 })
            : best.bucket.raw.join(' + ');
        return { symbol: best.symbol, amount: amountText };
    };

    const topSell = pickTopToken(tokenTransferInsight?.sells);
    const topBuy = pickTopToken(tokenTransferInsight?.buys);

    if (topSell && topBuy) {
        return t(lang, 'txhash_action_swap', {
            sell: `${topSell.amount} ${topSell.symbol}`.trim(),
            buy: `${topBuy.amount} ${topBuy.symbol}`.trim()
        });
    }

    if (topSell) {
        return t(lang, 'txhash_action_sell', { sell: `${topSell.amount} ${topSell.symbol}`.trim() });
    }

    if (topBuy) {
        return t(lang, 'txhash_action_buy', { buy: `${topBuy.amount} ${topBuy.symbol}`.trim() });
    }

    return t(lang, 'txhash_action_none');
}

function normalizeTxStatusText(status) {
    if (status === 1 || status === '1' || status === 'pending') {
        return 'pending';
    }
    if (status === 2 || status === '2' || status === 'success') {
        return 'success';
    }
    if (status === 3 || status === '3' || status === 'fail' || status === 'failed') {
        return 'fail';
    }
    return status ? String(status) : '—';
}

function deriveTxFeeLabel(fee, gasUsed, gasPrice) {
    if (fee !== undefined && fee !== null && fee !== '') {
        return String(fee);
    }

    const gasUsedNumeric = normalizeNumeric(gasUsed);
    const gasPriceNumeric = normalizeNumeric(gasPrice);

    if (Number.isFinite(gasUsedNumeric) && Number.isFinite(gasPriceNumeric)) {
        const total = gasUsedNumeric * gasPriceNumeric;
        if (Number.isFinite(total)) {
            return formatTokenQuantity(total, { maximumFractionDigits: 8 });
        }
    }

    return null;
}

function summarizeTokenTransfers(entries, mainLower, internalEntries = [], nativeSymbol = 'TOKEN') {
    const result = {
        buys: new Map(),
        sells: new Map(),
        buyCount: 0,
        sellCount: 0,
        otherCount: 0
    };

    const addToBucket = (symbol, amountValue, bucketKey) => {
        const amountText = amountValue !== undefined && amountValue !== null ? String(amountValue) : '—';
        const amountNumeric = normalizeNumeric(amountValue);
        const bucket = result[bucketKey].get(symbol) || {
            count: 0,
            totalNumeric: 0,
            hasNumeric: false,
            raw: []
        };

        bucket.count += 1;
        bucket.raw.push(amountText);
        if (Number.isFinite(amountNumeric)) {
            bucket.totalNumeric += amountNumeric;
            bucket.hasNumeric = true;
        }

        result[bucketKey].set(symbol, bucket);
    };

    if (Array.isArray(entries)) {
        for (const row of entries) {
            if (!row) continue;
            const fromLower = row.from ? row.from.toLowerCase() : null;
            const toLower = row.to ? row.to.toLowerCase() : null;
            const symbol = (row.symbol || row.tokenSymbol || 'TOKEN').toUpperCase();
            let bucketKey = null;

            if (mainLower && toLower === mainLower) {
                bucketKey = 'buys';
                result.buyCount += 1;
            } else if (mainLower && fromLower === mainLower) {
                bucketKey = 'sells';
                result.sellCount += 1;
            } else {
                result.otherCount += 1;
            }

            if (!bucketKey) {
                continue;
            }

            addToBucket(symbol, row.amount, bucketKey);
        }
    }

    if (Array.isArray(internalEntries)) {
        const nativeKey = (nativeSymbol || 'NATIVE').toUpperCase();
        for (const row of internalEntries) {
            if (!row) continue;
            const fromLower = row.from ? row.from.toLowerCase() : null;
            const toLower = row.to ? row.to.toLowerCase() : null;
            let bucketKey = null;

            if (mainLower && toLower === mainLower) {
                bucketKey = 'buys';
                result.buyCount += 1;
            } else if (mainLower && fromLower === mainLower) {
                bucketKey = 'sells';
                result.sellCount += 1;
            } else {
                result.otherCount += 1;
            }

            if (!bucketKey) {
                continue;
            }

            addToBucket(nativeKey, row.amount, bucketKey);
        }
    }

    return result;
}

function formatTxhashTotals(map, lang) {
    const parts = [];
    for (const [symbol, bucket] of map.entries()) {
        const amount = bucket.hasNumeric
            ? `${formatTokenQuantity(bucket.totalNumeric, { maximumFractionDigits: 8 })} ${symbol}`
            : `${bucket.raw.join(' + ')} ${symbol}`;
        const count = t(lang, 'txhash_insight_count_suffix', { count: bucket.count });
        parts.push(`${amount} ${count}`);
    }
    return parts.length > 0 ? parts.join(' • ') : t(lang, 'txhash_insight_none');
}

function formatTxAddressDetails(entries, icon, lang) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    return entries.map((row, index) => {
        if (!row) return null;
        const parts = [];
        const address = row.address ? formatCopyableValueHtml(row.address) || escapeHtml(row.address) : '—';
        const amount = row.amount !== undefined && row.amount !== null ? escapeHtml(String(row.amount)) : null;
        const contractFlag = row.isContract ? t(lang, 'txhash_contract_flag') : '';
        parts.push(`${icon} #${index + 1} — ${address} ${contractFlag}`.trim());
        if (amount) {
            parts.push(t(lang, 'txhash_amount_line', { amount }));
        }
        if (row.vinIndex || row.preVoutIndex || row.voutIndex) {
            const vin = row.vinIndex ? `vin ${escapeHtml(String(row.vinIndex))}` : null;
            const pre = row.preVoutIndex ? `pre ${escapeHtml(String(row.preVoutIndex))}` : null;
            const vout = row.voutIndex ? `vout ${escapeHtml(String(row.voutIndex))}` : null;
            const meta = [vin, pre, vout].filter(Boolean).join(' | ');
            if (meta) {
                parts.push(meta);
            }
        }
        if (row.txhash) {
            parts.push(`↩️ ${formatCopyableValueHtml(row.txhash) || escapeHtml(String(row.txhash))}`);
        }
        return parts.join('\n');
    }).filter(Boolean);
}

function formatInternalTxDetails(entries, lang) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    return entries.map((row, index) => {
        if (!row) return null;
        const from = row.from ? formatCopyableValueHtml(row.from) || escapeHtml(row.from) : '—';
        const to = row.to ? formatCopyableValueHtml(row.to) || escapeHtml(row.to) : '—';
        const amount = row.amount !== undefined && row.amount !== null ? escapeHtml(String(row.amount)) : '—';
        const status = normalizeTxStatusText(row.txStatus);
        const fromFlag = row.isFromContract ? t(lang, 'txhash_contract_flag') : '';
        const toFlag = row.isToContract ? t(lang, 'txhash_contract_flag') : '';
        return `🔁 #${index + 1} — ${from}${fromFlag} → ${to}${toFlag} | ${amount} | ${status}`;
    }).filter(Boolean);
}

function formatTokenTransferDetails(entries, lang) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    return entries.map((row, index) => {
        if (!row) return null;
        const from = row.from ? formatCopyableValueHtml(row.from) || escapeHtml(row.from) : '—';
        const to = row.to ? formatCopyableValueHtml(row.to) || escapeHtml(row.to) : '—';
        const amount = row.amount !== undefined && row.amount !== null ? escapeHtml(String(row.amount)) : '—';
        const symbol = escapeHtml(row.symbol || row.tokenSymbol || 'TOKEN');
        const amountLabel = `${amount} ${symbol}`.trim();
        const fromFlag = row.isFromContract ? t(lang, 'txhash_contract_flag') : '';
        const toFlag = row.isToContract ? t(lang, 'txhash_contract_flag') : '';
        const tokenContract = row.tokenContractAddress
            ? formatCopyableValueHtml(row.tokenContractAddress) || escapeHtml(String(row.tokenContractAddress))
            : null;

        const lines = [];
        lines.push(`💱 #${index + 1} — ${symbol}`.trim());
        lines.push(`📤 ${t(lang, 'txhash_from_label', { address: `${from}${fromFlag}` })}`);
        lines.push(`📥 ${t(lang, 'txhash_to_label', { address: `${to}${toFlag}` })}`);
        lines.push(`💰 ${t(lang, 'txhash_amount_token_line', { amount: amountLabel })}`);
        if (tokenContract) {
            lines.push(`📄 ${t(lang, 'txhash_token_contract_line', { contract: tokenContract })}`);
        }
        return lines.join('\n');
    }).filter(Boolean);
}

function resolveKnownTokenAddress(tokenKey) {
    if (!tokenKey) {
        return null;
    }
    const key = tokenKey.toLowerCase();
    if (key === 'banmao' && OKX_BANMAO_TOKEN_ADDRESS) {
        return OKX_BANMAO_TOKEN_ADDRESS;
    }
    if (OKX_OKB_SYMBOL_KEYS.includes(key) && OKX_OKB_TOKEN_ADDRESSES.length > 0) {
        return normalizeOkxConfigAddress(OKX_OKB_TOKEN_ADDRESSES[0]);
    }
    return null;
}

function resolveRegisteredTokenAddress(tokenRecord) {
    if (!tokenRecord || typeof tokenRecord !== 'object') {
        return null;
    }
    if (tokenRecord.tokenAddress) {
        return normalizeOkxConfigAddress(tokenRecord.tokenAddress) || tokenRecord.tokenAddress;
    }
    return resolveKnownTokenAddress(tokenRecord.tokenKey);
}

function formatFiatValue(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
        ? options.minimumFractionDigits
        : 2;
    const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
        ? options.maximumFractionDigits
        : Math.max(minimumFractionDigits, 2);
    return numeric.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits });
}

function formatNumberValue(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return value;
    }
    const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
        ? options.maximumFractionDigits
        : 6;
    const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
        ? options.minimumFractionDigits
        : 0;
    return numeric.toLocaleString('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });
}

async function getTokenPriceInfo(tokenAddress, tokenKey) {
    const normalized = normalizeOkxConfigAddress(tokenAddress) || tokenAddress;
    if (!normalized) {
        return null;
    }

    const cacheKey = normalized.toLowerCase();
    const now = Date.now();
    const cached = tokenPriceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    try {
        const snapshot = await fetchTokenMarketSnapshot({ tokenAddress: normalized });
        const value = snapshot
            ? {
                priceUsd: Number.isFinite(snapshot.price) ? Number(snapshot.price) : null,
                priceOkb: Number.isFinite(snapshot.priceOkb) ? Number(snapshot.priceOkb) : null,
                okbUsd: Number.isFinite(snapshot.okbUsd) ? Number(snapshot.okbUsd) : null,
                source: snapshot.source || 'OKX'
            }
            : null;
        tokenPriceCache.set(cacheKey, { value, expiresAt: now + TOKEN_PRICE_CACHE_TTL });
        return value;
    } catch (error) {
        console.warn(`[WalletPrice] Failed to load price for ${tokenKey || tokenAddress}: ${error.message}`);
        tokenPriceCache.set(cacheKey, { value: null, expiresAt: now + 30 * 1000 });
        return null;
    }
}

async function buildUnregisterMenu(lang, chatId) {
    const entries = await loadWalletOverviewEntries(chatId);
    if (!entries || entries.length === 0) {
        return {
            text: t(lang, 'unregister_empty'),
            replyMarkup: null
        };
    }

    const lines = [t(lang, 'unregister_header')];
    const inline_keyboard = [];
    for (const entry of entries) {
        const walletAddr = entry.address;
        const shortAddr = shortenAddress(walletAddr);
        const label = entry.name ? `${entry.name} • ${shortAddr}` : shortAddr;
        inline_keyboard.push([{ text: `🧹 ${label}`, callback_data: `wallet_remove|wallet|${walletAddr}` }]);
    }
    inline_keyboard.push([{ text: `🔥🔥 ${t(lang, 'unregister_all')} 🔥🔥`, callback_data: 'wallet_remove|all' }]);

    const replyMarkup = appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'wallet_overview' });

    return {
        text: lines.join('\n'),
        replyMarkup
    };
}
    return {
        buildContractLookupUrl,
        maskApiKey,
        formatDexChainLabel,
        buildWalletDexOverviewText,
        buildWalletTokenButtonRows,
        buildWalletTokenMenu,
        buildWalletTokenActionResult,
        fetchWalletTokenActionPayload,
        sendWalletTokenExtraTexts,
        normalizeWalletTokenActionResult,
        formatTxhashDetail
    };
}

module.exports = { createWalletTokenActions };
