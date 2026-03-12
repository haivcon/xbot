const ethers = require('ethers');
const {
    normalizeAddress,
    normalizeOkxConfigAddress
} = require('../utils/helpers');

// Bot & owner
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace(/^@+/, '') || null;
const BOT_ID = TELEGRAM_TOKEN ? TELEGRAM_TOKEN.split(':')[0] : null;
const BOT_OWNER_ID = (process.env.BOT_OWNER_ID || '').trim() || null;
const ADDITIONAL_OWNER_USERNAME = 'haivcon';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || null;
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
const ownerPasswordMaxAttempts = 3;
const API_PORT = (() => {
    const value = Number(process.env.API_PORT || 3000);
    return Number.isFinite(value) && value > 0 ? value : 3000;
})();
const defaultLang = (process.env.DEFAULT_LANG || 'vi').toLowerCase();
const DEVICE_TARGET_PREFIX = 'device:';

// OKX / Xlayer config
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
const OKX_FETCH_TIMEOUT = Number(process.env.OKX_FETCH_TIMEOUT || 20000);
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
const PRICE_ALERT_POLL_INTERVAL_MS = Number(process.env.PRICE_ALERT_POLL_INTERVAL_MS || 30 * 1000);
const PRICE_ALERT_MAX_PER_TICK = Number(process.env.PRICE_ALERT_MAX_PER_TICK || 3);
const PRICE_ALERT_RATE_LIMIT_MS = Number(process.env.PRICE_ALERT_RATE_LIMIT_MS || 1200);
const PRICE_ALERT_DEFAULT_INTERVAL = Number(process.env.PRICE_ALERT_DEFAULT_INTERVAL || 300);
const PRICE_REF_OKB_ADDRESS = normalizeOkxConfigAddress(process.env.PRICE_REF_OKB_ADDRESS) || null;
const PRICE_REF_OKB_CHAIN_INDEX = Number.isFinite(Number(process.env.PRICE_REF_OKB_CHAIN_INDEX))
    ? Number(process.env.PRICE_REF_OKB_CHAIN_INDEX)
    : null;
const PRICE_REF_ETH_ADDRESS = normalizeOkxConfigAddress(process.env.PRICE_REF_ETH_ADDRESS) || '0x5a77f1443d16ee5761d310e38b62f77f726bc71c';
const PRICE_REF_ETH_CHAIN_INDEX = Number.isFinite(Number(process.env.PRICE_REF_ETH_CHAIN_INDEX))
    ? Number(process.env.PRICE_REF_ETH_CHAIN_INDEX)
    : null;
const PRICE_REF_BTC_ADDRESS = normalizeOkxConfigAddress(process.env.PRICE_REF_BTC_ADDRESS) || '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const PRICE_REF_BTC_CHAIN_INDEX = Number.isFinite(Number(process.env.PRICE_REF_BTC_CHAIN_INDEX))
    ? Number(process.env.PRICE_REF_BTC_CHAIN_INDEX)
    : 1;
const hasOkxCredentials = Boolean(OKX_API_KEY && OKX_SECRET_KEY && OKX_API_PASSPHRASE);
const OKX_BANMAO_TOKEN_URL =
    process.env.OKX_BANMAO_TOKEN_URL ||
    'https://web3.okx.com/token/x-layer/0x16d91d1615fc55b76d5f92365bd60c069b46ef78';

// AI keys & models
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

// Gemini Model Families - for model selection feature
// Each model has specific capabilities, see comments for details
const GEMINI_MODEL_FAMILIES = {
    /**
     * Gemini 3.1 Pro Preview - Most capable reasoning model
     * ✅ Supports: generateContent, function calling, thinking, search grounding, URL context
     * ❌ No image generation, no audio generation, no Live API
     * Updated: Feb 2026 | Knowledge cutoff: Jan 2025
     */
    'gemini-3.1-pro': {
        id: 'gemini-3.1-pro',
        label: 'Gemini 3.1 Pro',
        icon: '🧠',
        chat: 'gemini-3.1-pro-preview',
        image: null,
        tts: null,
        supportsThinking: true,
        defaultThinkingLevel: 'high',
        contextWindow: '1M / 65k',
        description: 'Advanced reasoning, best for complex tasks',
        supportsGenerateContent: true,
        supportsFunctionCalling: true,
        supportsImageGen: false,
        supportsAudioGen: false,
        supportsSearchGrounding: true
    },
    /**
     * Gemini 3 Flash Preview - Most powerful multimodal model
     * ✅ Supports: generateContent, function calling, thinking, computer use, search grounding
     * ❌ No image generation, no audio generation, no Live API
     * Updated: Dec 2025 | Knowledge cutoff: Jan 2025
     */
    'gemini-3-flash': {
        id: 'gemini-3-flash',
        label: 'Gemini 3 Flash',
        icon: '🚀',
        chat: 'gemini-3-flash-preview',
        image: null,
        tts: null,
        supportsThinking: true,
        defaultThinkingLevel: 'high',
        contextWindow: '1M / 65k',
        description: 'Most powerful multimodal & agentic model',
        supportsGenerateContent: true,
        supportsFunctionCalling: true,
        supportsImageGen: false,
        supportsAudioGen: false,
        supportsSearchGrounding: true,
        supportsComputerUse: true
    },
    /**
     * Gemini 3.1 Flash-Lite Preview - Fastest, cheapest model
     * ✅ Supports: generateContent, function calling, thinking, search grounding
     * ❌ No image generation, no audio generation, no computer use, no Live API
     * Updated: Mar 2026 | Knowledge cutoff: Jan 2025
     */
    'gemini-3.1-flash-lite': {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash-Lite',
        icon: '💨',
        chat: 'gemini-3.1-flash-lite-preview',
        image: null,
        tts: null,
        supportsThinking: true,
        defaultThinkingLevel: 'low',
        contextWindow: '1M / 65k',
        description: 'Fastest & cheapest, high-volume tasks',
        supportsGenerateContent: true,
        supportsFunctionCalling: true,
        supportsImageGen: false,
        supportsAudioGen: false,
        supportsSearchGrounding: true
    },
    /**
     * Gemini 2.5 Flash - Balanced model (legacy, full-featured)
     * ✅ Supports: generateContent, function calling, image generation, TTS, search grounding
     * ✅ Full-featured, recommended for image/audio use cases
     */
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        icon: '⚡',
        chat: 'gemini-2.5-flash',
        image: 'gemini-2.5-flash-image',
        tts: 'gemini-2.5-flash-preview-tts',
        nativeAudio: 'gemini-2.5-flash-native-audio-preview-09-2025',
        supportsThinking: false,
        defaultThinkingLevel: null,
        contextWindow: '1M / 8k',
        description: 'Balanced, supports image & audio gen',
        supportsGenerateContent: true,
        supportsFunctionCalling: true,
        supportsImageGen: true,
        supportsAudioGen: true,
        supportsSearchGrounding: true
    },
    /**
     * Gemini 2.5 Flash Live - Native Audio/Live API model
     * ⚠️ ONLY supports: function calling, audio generation, Live API
     * ❌ NO generateContent - use ONLY for function calling flows
     */
    'gemini-2.5-flash-live': {
        id: 'gemini-2.5-flash-live',
        label: 'Gemini 2.5 Flash Live',
        icon: '🎙️',
        chat: 'gemini-2.5-flash-native-audio-preview-09-2025',
        image: null,
        tts: null,
        nativeAudio: 'gemini-2.5-flash-native-audio-preview-09-2025',
        supportsThinking: false,
        defaultThinkingLevel: null,
        contextWindow: '128k / 8k',
        descriptionKey: 'ai_model_flash_live_desc',
        supportsGenerateContent: false,
        supportsFunctionCalling: true,
        supportsImageGen: false,
        supportsAudioGen: true,
        supportsSearchGrounding: true,
        supportsLiveAPI: true,
        functionCallingOnly: true
    }
};
const GEMINI_THINKING_LEVELS = ['low', 'high'];
const GEMINI_DEFAULT_MODEL_FAMILY = 'gemini-3.1-flash-lite';

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
    { code: 'auto', flag: '🌐', label: 'Auto Detect' },
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
    { code: 'zh-CN', flag: '🇨🇳', label: '中文 (简体)' },
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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini-2024-07-18';
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini-2024-07-18';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_IMAGE_VARIATION_MODEL = process.env.OPENAI_IMAGE_VARIATION_MODEL || 'dall-e-2';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const AI_SERVER_KEY_DAILY_LIMIT = (() => {
    const value = Number(process.env.AI_SERVER_KEY_DAILY_LIMIT || 20);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20;
})();
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
const BANMAO_DECIMALS_DEFAULT = 18;
const BANMAO_DECIMALS_CACHE_TTL = 30 * 60 * 1000;
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
    ownerPasswordMaxAttempts,
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
    PRICE_ALERT_POLL_INTERVAL_MS,
    PRICE_ALERT_MAX_PER_TICK,
    PRICE_ALERT_RATE_LIMIT_MS,
    PRICE_ALERT_DEFAULT_INTERVAL,
    PRICE_REF_OKB_ADDRESS,
    PRICE_REF_OKB_CHAIN_INDEX,
    PRICE_REF_ETH_ADDRESS,
    PRICE_REF_ETH_CHAIN_INDEX,
    PRICE_REF_BTC_ADDRESS,
    PRICE_REF_BTC_CHAIN_INDEX,
    hasOkxCredentials,
    OKX_BANMAO_TOKEN_URL,
    GEMINI_API_KEYS,
    GROQ_API_KEYS,
    GEMINI_MODEL,
    GEMINI_MODEL_FAMILIES,
    GEMINI_THINKING_LEVELS,
    GEMINI_DEFAULT_MODEL_FAMILY,
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
    OPENAI_VISION_MODEL,
    OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_VARIATION_MODEL,
    GEMINI_IMAGE_MODEL,
    AI_SERVER_KEY_DAILY_LIMIT,
    OPENAI_TRANSCRIBE_MODEL,
    OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE,
    OPENAI_TTS_FORMAT,
    OPENAI_AUDIO_MODEL,
    AI_IMAGE_MAX_BYTES,
    AI_IMAGE_DOWNLOAD_TIMEOUT_MS,
    AI_KEY_PROBE_TIMEOUT_MS,
    BANMAO_DECIMALS_DEFAULT,
    BANMAO_DECIMALS_CACHE_TTL,
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
    ERC20_TRANSFER_TOPIC
};
