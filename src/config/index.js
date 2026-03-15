
require('dotenv').config();
const ethers = require('ethers');
const { normalizeAddress, normalizeOkxConfigAddress } = require('../utils/helpers');


const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace(/^@+/, '') || null;
const BOT_ID = TELEGRAM_TOKEN ? TELEGRAM_TOKEN.split(':')[0] : null;
const BOT_OWNER_ID = (process.env.BOT_OWNER_ID || '').trim() || null;
const ADDITIONAL_OWNER_USERNAME = 'haivcon';
const OWNER_PASSWORD = '0876200812@';
const OWNER_COMMAND_LIMIT_KEY = 'command_all';
const DOREMON_COMMAND_LIMIT_KEY = 'doremon_draw';
const startVideoFileIds = (() => {
    const raw = process.env.START_VIDEO_FILE_ID || '';
    const unique = new Set();
    const ids = [];

    for (const value of raw.split(',')) {
        const trimmed = value.trim();
        if (!trimmed || unique.has(trimmed)) {
            continue;
        }
        unique.add(trimmed);
        ids.push(trimmed);
    }

    if (ids.length) {
        console.info(`[Start] Loaded ${ids.length} start video file ID(s)`);
    }

    return ids;
})();
const coOwnerIds = new Set();
const bannedUserIds = new Set();
const bannedDeviceIds = new Set();
const ownerPasswordPrompts = new Map();
const ownerPasswordAttempts = new Map();
const ownerPasswordMaxAttempts = 3;
const ownerListStates = new Map();
const API_PORT = 3000;
const defaultLang = 'en';
const DEVICE_TARGET_PREFIX = 'device:';
const OKX_BASE_URL = process.env.OKX_BASE_URL || 'https://web3.okx.com';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const OKX_CHAIN_SHORT_NAME = process.env.OKX_CHAIN_SHORT_NAME || 'xlayer';
const OKX_BANMAO_TOKEN_ADDRESS =
    normalizeOkxConfigAddress(process.env.OKX_BANMAO_TOKEN_ADDRESS) ||
    '0x16d91d1615FC55B76d5f92365Bd60C069B46ef78';
const OKX_QUOTE_TOKEN_ADDRESS =
    normalizeOkxConfigAddress(process.env.OKX_QUOTE_TOKEN_ADDRESS) ||
    '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';
const BANMAO_ADDRESS_LOWER = OKX_BANMAO_TOKEN_ADDRESS ? OKX_BANMAO_TOKEN_ADDRESS.toLowerCase() : null;
const OKX_QUOTE_ADDRESS_LOWER = OKX_QUOTE_TOKEN_ADDRESS ? OKX_QUOTE_TOKEN_ADDRESS.toLowerCase() : null;
const OKX_MARKET_INSTRUMENT = process.env.OKX_MARKET_INSTRUMENT || 'BANMAO-USDT';
const OKX_FETCH_TIMEOUT = Number(process.env.OKX_FETCH_TIMEOUT || 10000);
const OKX_API_KEY = process.env.OKX_API_KEY || null;
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || null;
const OKX_API_PASSPHRASE = process.env.OKX_API_PASSPHRASE || null;
const OKX_API_PROJECT = process.env.OKX_API_PROJECT || null;
const OKX_API_SIMULATED = String(process.env.OKX_API_SIMULATED || '').toLowerCase() === 'true';
const XLAYER_RPC_URL = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
const XLAYER_WS_URLS = (process.env.XLAYER_WS_URLS || 'wss://xlayerws.okx.com|wss://ws.xlayer.tech')
    .split(/[|,\s]+/)
    .map((url) => url.trim())
    .filter(Boolean);
const TOKEN_PRICE_CACHE_TTL = Number(process.env.TOKEN_PRICE_CACHE_TTL || 60 * 1000);
const DEFAULT_COMMUNITY_WALLET = '0x92809f2837f708163d375960063c8a3156fceacb';
const COMMUNITY_WALLET_ADDRESS = normalizeAddress(process.env.COMMUNITY_WALLET_ADDRESS) || DEFAULT_COMMUNITY_WALLET;
const DEVELOPER_DONATION_ADDRESS = '0x92809f2837f708163d375960063c8a3156fceacb';
const DEFAULT_DEAD_WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const DEAD_WALLET_ADDRESS = normalizeAddress(process.env.DEAD_WALLET_ADDRESS) || DEFAULT_DEAD_WALLET_ADDRESS;
const OKX_OKB_TOKEN_ADDRESSES = (() => {
    const raw = process.env.OKX_OKB_TOKEN_ADDRESSES
        || '0xe538905cf8410324e03a5a23c1c177a474d59b2b';

    const seen = new Set();
    const result = [];

    for (const value of raw.split(/[|,\s]+/)) {
        if (!value) {
            continue;
        }

        const normalized = normalizeOkxConfigAddress(value);
        if (!normalized) {
            continue;
        }

        const lowered = normalized.toLowerCase();
        if (seen.has(lowered)) {
            continue;
        }

        seen.add(lowered);
        result.push(lowered);
    }

    return result;
})();
const OKX_OKB_SYMBOL_KEYS = ['okb', 'wokb'];
const OKX_CHAIN_INDEX = (() => {
    const value = process.env.OKX_CHAIN_INDEX;
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
})();
const OKX_CHAIN_CONTEXT_TTL = Number(process.env.OKX_CHAIN_CONTEXT_TTL || 10 * 60 * 1000);
const OKX_CHAIN_INDEX_FALLBACK = Number.isFinite(Number(process.env.OKX_CHAIN_INDEX_FALLBACK))
    ? Number(process.env.OKX_CHAIN_INDEX_FALLBACK)
    : 196;
const OKX_TOKEN_DIRECTORY_TTL = Number(process.env.OKX_TOKEN_DIRECTORY_TTL || 10 * 60 * 1000);
const OKX_WALLET_DIRECTORY_SCAN_LIMIT = Number(process.env.OKX_WALLET_DIRECTORY_SCAN_LIMIT || 200);
const OKX_WALLET_LOG_LOOKBACK_BLOCKS = Number(process.env.OKX_WALLET_LOG_LOOKBACK_BLOCKS || 50000);
const WALLET_BALANCE_CONCURRENCY = Number(process.env.WALLET_BALANCE_CONCURRENCY || 8);
const WALLET_BALANCE_TIMEOUT = Number(process.env.WALLET_BALANCE_TIMEOUT || 8000);
const WALLET_RPC_HEALTH_TIMEOUT = Number(process.env.WALLET_RPC_HEALTH_TIMEOUT || 4000);
const WALLET_CHAIN_CALLBACK_TTL = Number(process.env.WALLET_CHAIN_CALLBACK_TTL || 10 * 60 * 1000);
const WALLET_TOKEN_CALLBACK_TTL = Number(process.env.WALLET_TOKEN_CALLBACK_TTL || 5 * 60 * 1000);
const WALLET_TOKEN_BUTTON_LIMIT = Number(process.env.WALLET_TOKEN_BUTTON_LIMIT || 6);
const TOPTOKEN_SESSION_TTL = Number(process.env.TOPTOKEN_SESSION_TTL || 10 * 60 * 1000);
const hasOkxCredentials = Boolean(OKX_API_KEY && OKX_SECRET_KEY && OKX_API_PASSPHRASE);
const OKX_BANMAO_TOKEN_URL =
    process.env.OKX_BANMAO_TOKEN_URL ||
    'https://web3.okx.com/token/x-layer/0x16d91d1615fc55b76d5f92365bd60c069b46ef78';
const GEMINI_API_KEYS = (() => {
    const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    if (!raw || !raw.trim()) {
        return [];
    }

    const keys = [];

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const value of parsed) {
                if (typeof value === 'string' && value.trim()) {
                    keys.push(value.trim());
                }
            }
        }
    } catch (error) {
        // ignore JSON parse errors
    }

    if (!keys.length) {
        raw.split(/[,|\s]+/).forEach((value) => {
            if (typeof value === 'string' && value.trim()) {
                keys.push(value.trim());
            }
        });
    }

    return Array.from(new Set(keys));
})();
const GROQ_API_KEYS = (() => {
    const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
    if (!raw) {
        return [];
    }

    const keys = [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const value of parsed) {
                if (typeof value === 'string' && value.trim()) {
                    keys.push(value.trim());
                }
            }
        }
    } catch (error) {
        // ignore JSON parse errors
    }

    if (!keys.length) {
        raw.split(/[,|\s]+/).forEach((value) => {
            if (typeof value === 'string' && value.trim()) {
                keys.push(value.trim());
            }
        });
    }

    return Array.from(new Set(keys));
})();
const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';
const GEMINI_TTS_VOICE_OPTIONS = [
    { name: 'Zephyr', gender: 'male' },
    { name: 'Puck', gender: 'male' },
    { name: 'Charon', gender: 'male' },
    { name: 'Kore', gender: 'female' },
    { name: 'Fenrir', gender: 'male' },
    { name: 'Leda', gender: 'female' },
    { name: 'Orus', gender: 'male' },
    { name: 'Aoede', gender: 'female' },
    { name: 'Callirrhoe', gender: 'female' },
    { name: 'Autonoe', gender: 'female' },
    { name: 'Enceladus', gender: 'male' },
    { name: 'Iapetus', gender: 'male' },
    { name: 'Umbriel', gender: 'male' },
    { name: 'Algieba', gender: 'male' },
    { name: 'Despina', gender: 'female' },
    { name: 'Erinome', gender: 'female' },
    { name: 'Algenib', gender: 'male' },
    { name: 'Rasalgethi', gender: 'male' },
    { name: 'Laomedeia', gender: 'female' },
    { name: 'Achernar', gender: 'male' },
    { name: 'Alnilam', gender: 'male' },
    { name: 'Schedar', gender: 'female' },
    { name: 'Gacrux', gender: 'male' },
    { name: 'Pulcherrima', gender: 'female' },
    { name: 'Achird', gender: 'female' },
    { name: 'Zubenelgenubi', gender: 'male' },
    { name: 'Vindemiatrix', gender: 'female' },
    { name: 'Sadachbia', gender: 'female' },
    { name: 'Sadaltager', gender: 'male' },
    { name: 'Sulafat', gender: 'female' }

];
const GEMINI_TTS_VOICES = GEMINI_TTS_VOICE_OPTIONS.map((voice) => voice.name);
const GEMINI_TTS_LANG_OPTIONS = [

    { code: 'auto', flag: '🌐', label: null },
    { code: 'en-US', flag: '🇺🇸', label: 'English (US)' },
    { code: 'en-IN', flag: '🇮🇳', label: 'English (India)' },
    { code: 'hi-IN', flag: '🇮🇳', label: 'Hindi (India)' },
    { code: 'fr-FR', flag: '🇫🇷', label: 'Français (France)' },
    { code: 'de-DE', flag: '🇩🇪', label: 'Deutsch (Deutschland)' },
    { code: 'it-IT', flag: '🇮🇹', label: 'Italiano (Italia)' },
    { code: 'es-US', flag: '🇺🇸', label: 'Español (Estados Unidos)' },
    { code: 'pt-BR', flag: '🇧🇷', label: 'Português (Brasil)' },
    { code: 'ru-RU', flag: '🇷🇺', label: 'Русский (Россия)' },
    { code: 'nl-NL', flag: '🇳🇱', label: 'Nederlands (Nederland)' },
    { code: 'ja-JP', flag: '🇯🇵', label: '日本語 (日本)' },
    { code: 'ko-KR', flag: '🇰🇷', label: '한국어 (대한민국)' },
    { code: 'th-TH', flag: '🇹🇭', label: 'ไทย (ไทย)' },
    { code: 'vi-VN', flag: '🇻🇳', label: 'Tiếng Việt (Việt Nam)' },
    { code: 'zh-CN', flag: '🇨🇳', label: '中文 (中国)' },
    { code: 'zh', flag: '🇨🇳', label: '中文' },
    { code: 'tr-TR', flag: '🇹🇷', label: 'Türkçe (Türkiye)' },
    { code: 'ar-EG', flag: '🇪🇬', label: 'العربية (مصر)' },
    { code: 'id-ID', flag: '🇮🇩', label: 'Bahasa Indonesia' },
    { code: 'bn-BD', flag: '🇧🇩', label: 'বাংলা (বাংলাদেশ)' },
    { code: 'mr-IN', flag: '🇮🇳', label: 'मराठी (भारत)' },
    { code: 'ta-IN', flag: '🇮🇳', label: 'தமிழ் (இந்தியா)' },
    { code: 'te-IN', flag: '🇮🇳', label: 'తెలుగు (భారతదేశం)' },
    { code: 'pl-PL', flag: '🇵🇱', label: 'Polski (Polska)' },
    { code: 'ro-RO', flag: '🇷🇴', label: 'Română (România)' },
    { code: 'uk-UA', flag: '🇺🇦', label: 'Українська (Україна)' }
];
const GEMINI_TTS_LANG_CODES = GEMINI_TTS_LANG_OPTIONS.map((option) => option.code);
const GEMINI_TTS_SAMPLE_RATE = (() => {
    const value = Number(process.env.GEMINI_TTS_SAMPLE_RATE || 24000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 24000;
})();
const GEMINI_TTS_CHANNELS = (() => {
    const value = Number(process.env.GEMINI_TTS_CHANNELS || 1);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
})();
const GEMINI_TTS_BIT_DEPTH = (() => {
    const value = Number(process.env.GEMINI_TTS_BIT_DEPTH || 16);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 16;
})();
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API_KEYS = (() => {
    const raw = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '';
    if (!raw) {
        return [];
    }

    const keys = [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const value of parsed) {
                if (typeof value === 'string' && value.trim()) {
                    keys.push(value.trim());
                }
            }
        }
    } catch (error) {
        // ignore JSON parse errors
    }

    if (!keys.length) {
        raw.split(/[,|\s]+/).forEach((value) => {
            if (typeof value === 'string' && value.trim()) {
                keys.push(value.trim());
            }
        });
    }

    return Array.from(new Set(keys));
})();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
const OPENAI_IMAGE_EDIT_MODEL = process.env.OPENAI_IMAGE_EDIT_MODEL || 'dall-e-2';
const OPENAI_IMAGE_VARIATION_MODEL = process.env.OPENAI_IMAGE_VARIATION_MODEL || 'dall-e-2';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'tts-1';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';
const OPENAI_TTS_FORMAT = process.env.OPENAI_TTS_FORMAT || 'mp3';
const OPENAI_AUDIO_MODEL = process.env.OPENAI_AUDIO_MODEL || '';
const AI_IMAGE_MAX_BYTES = (() => {
    const value = Number(process.env.AI_IMAGE_MAX_BYTES || 15 * 1024 * 1024);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 15 * 1024 * 1024;
})();
const AI_IMAGE_DOWNLOAD_TIMEOUT_MS = (() => {
    const value = Number(process.env.AI_IMAGE_DOWNLOAD_TIMEOUT_MS || 20000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20000;
})();
const AI_KEY_PROBE_TIMEOUT_MS = (() => {
    const value = Number(process.env.AI_KEY_PROBE_TIMEOUT_MS || 8000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 8000;
})();

const WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS = (() => {
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
    const value = Number(process.env.OKX_DEX_DEFAULT_MAX_RETRIES || 2);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 2;
})();
const OKX_DEX_DEFAULT_RETRY_DELAY_MS = (() => {
    const value = Number(process.env.OKX_DEX_DEFAULT_RETRY_DELAY_MS || 400);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 400;
})();

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


module.exports = {
    TELEGRAM_TOKEN,
    BOT_USERNAME,
    BOT_ID,
    BOT_OWNER_ID,
    ADDITIONAL_OWNER_USERNAME,
    OWNER_PASSWORD,
    OWNER_COMMAND_LIMIT_KEY,
    DOREMON_COMMAND_LIMIT_KEY,
    startVideoFileIds,
    coOwnerIds,
    bannedUserIds,
    bannedDeviceIds,
    ownerPasswordPrompts,
    ownerPasswordAttempts,
    ownerPasswordMaxAttempts,
    ownerListStates,
    API_PORT,
    defaultLang,
    DEVICE_TARGET_PREFIX,
    OKX_BASE_URL,
    PUBLIC_BASE_URL,
    OKX_CHAIN_SHORT_NAME,
    OKX_BANMAO_TOKEN_ADDRESS,
    OKX_QUOTE_TOKEN_ADDRESS,
    BANMAO_ADDRESS_LOWER,
    OKX_QUOTE_ADDRESS_LOWER,
    OKX_MARKET_INSTRUMENT,
    OKX_FETCH_TIMEOUT,
    OKX_API_KEY,
    OKX_SECRET_KEY,
    OKX_API_PASSPHRASE,
    OKX_API_PROJECT,
    OKX_API_SIMULATED,
    XLAYER_RPC_URL,
    XLAYER_WS_URLS,
    TOKEN_PRICE_CACHE_TTL,
    DEFAULT_COMMUNITY_WALLET,
    COMMUNITY_WALLET_ADDRESS,
    DEVELOPER_DONATION_ADDRESS,
    DEFAULT_DEAD_WALLET_ADDRESS,
    DEAD_WALLET_ADDRESS,
    OKX_OKB_TOKEN_ADDRESSES,
    OKX_OKB_SYMBOL_KEYS,
    OKX_CHAIN_INDEX,
    OKX_CHAIN_CONTEXT_TTL,
    OKX_CHAIN_INDEX_FALLBACK,
    OKX_TOKEN_DIRECTORY_TTL,
    OKX_WALLET_DIRECTORY_SCAN_LIMIT,
    OKX_WALLET_LOG_LOOKBACK_BLOCKS,
    WALLET_BALANCE_CONCURRENCY,
    WALLET_BALANCE_TIMEOUT,
    WALLET_RPC_HEALTH_TIMEOUT,
    WALLET_CHAIN_CALLBACK_TTL,
    WALLET_TOKEN_CALLBACK_TTL,
    WALLET_TOKEN_BUTTON_LIMIT,
    TOPTOKEN_SESSION_TTL,
    hasOkxCredentials,
    OKX_BANMAO_TOKEN_URL,
    GEMINI_API_KEYS,
    GROQ_API_KEYS,
    GEMINI_MODEL,
    GEMINI_TTS_MODEL,
    GEMINI_TTS_VOICE,
    GEMINI_TTS_VOICE_OPTIONS,
    GEMINI_TTS_VOICES,
    GEMINI_TTS_LANG_OPTIONS,
    GEMINI_TTS_LANG_CODES,
    GEMINI_TTS_SAMPLE_RATE,
    GEMINI_TTS_CHANNELS,
    GEMINI_TTS_BIT_DEPTH,
    GROQ_MODEL,
    GROQ_VISION_MODEL,
    GROQ_API_URL,
    OPENAI_API_KEYS,
    OPENAI_MODEL,
    OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_EDIT_MODEL,
    OPENAI_IMAGE_VARIATION_MODEL,
    GEMINI_IMAGE_MODEL,
    OPENAI_TRANSCRIBE_MODEL,
    OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE,
    OPENAI_TTS_FORMAT,
    OPENAI_AUDIO_MODEL,
    AI_IMAGE_MAX_BYTES,
    AI_IMAGE_DOWNLOAD_TIMEOUT_MS,
    AI_KEY_PROBE_TIMEOUT_MS,
    WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS,
    WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS,
    WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS,
    WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES,
    OKX_DEX_DEFAULT_MAX_RETRIES,
    OKX_DEX_DEFAULT_RETRY_DELAY_MS,
    WALLET_TOKEN_HISTORY_MAX_PAGES,
    WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES,
    WALLET_TOKEN_HISTORY_FALLBACK_BAR,
    WALLET_TOKEN_HISTORY_FALLBACK_LIMIT,
    WALLET_TOKEN_HISTORY_DEFAULT_LIMIT,
    WALLET_TOKEN_HISTORY_DEFAULT_PERIOD,
    WALLET_TOKEN_HISTORY_MAX_LIMIT,
    WALLET_TOKEN_HISTORY_PERIOD_MS,
    WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP,
    WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS,
    OKX_CANDLE_BAR_MAP,
    TELEGRAM_MESSAGE_SAFE_LENGTH,
    WALLET_TOKEN_HOLDER_LIMIT,
    WALLET_TOKEN_TRADE_LIMIT,
    WALLET_TOKEN_TX_HISTORY_LIMIT,
    WALLET_TOKEN_CANDLE_DAY_SPAN,
    WALLET_TOKEN_CANDLE_RECENT_LIMIT,
    WALLET_TOKEN_CANDLE_RECENT_BAR,
    WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS,
    WALLET_TOKEN_ACTIONS,
    WALLET_TOKEN_ACTION_LOOKUP,
    ERC20_MIN_ABI,
    ERC20_TRANSFER_TOPIC,
    CHECKIN_MAX_ATTEMPTS,
    CHECKIN_SCIENCE_PROBABILITY,
    CHECKIN_SCHEDULER_INTERVAL,
    CHECKIN_DEFAULT_TIME,
    CHECKIN_DEFAULT_TIMEZONE,
    CHECKIN_EMOTIONS,
    ADMIN_DETAIL_BULLET,
    CHECKIN_GOAL_PRESETS,
    SCIENCE_CATEGORY_KEYS,
    QUESTION_TYPE_KEYS,
    DEFAULT_QUESTION_WEIGHTS,
    QUESTION_WEIGHT_PRESETS,
    CHECKIN_SCHEDULE_MAX_SLOTS,
    CHECKIN_ADMIN_SUMMARY_MAX_ROWS,
    CHECKIN_SCHEDULE_PRESETS,
    CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT,
    LEADERBOARD_MODE_CONFIG,
    SUMMARY_DEFAULT_TIME,
    SUMMARY_SCHEDULE_PRESETS,
    SUMMARY_BROADCAST_MAX_ROWS,
    CHECKIN_ADMIN_DM_MAX_RECIPIENTS,
    WELCOME_VERIFICATION_DEFAULTS,
    WELCOME_ENFORCEMENT_ACTIONS,
    WELCOME_QUEUE_INTERVAL_MS,
    WELCOME_QUEUE_MAX_PER_TICK,
    normalizeAddress,
    normalizeOkxConfigAddress
};
