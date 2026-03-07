const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const { sanitizeSecrets } = require('../../utils/format');

const geminiClientPool = new Map();
const disabledGeminiKeyIndices = new Set();
const userDisabledGeminiKeyIndices = new Map();
const userGeminiKeyIndices = new Map();
let geminiKeyIndex = 0;

const groqKeyIndex = 0;
const disabledGroqKeyIndices = new Set();
const userDisabledGroqKeyIndices = new Map();
const userGroqKeyIndices = new Map();

const openAiClientPool = new Map();
const disabledOpenAiKeyIndices = new Set();
const userDisabledOpenAiKeyIndices = new Map();
const userOpenAiKeyIndices = new Map();
let openAiKeyIndex = 0;

function getGeminiClient(index = geminiKeyIndex, keys = []) {
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

function getGroqClient(index = groqKeyIndex, keys = []) {
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

function getOpenAiClient(index = openAiKeyIndex, keys = []) {
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

module.exports = {
    getGeminiClient,
    disableGeminiKey,
    disableUserGeminiKey,
    getUserGeminiKeyIndex,
    setUserGeminiKeyIndex,
    advanceGeminiKeyIndex,
    advanceUserGeminiKeyIndex,
    getGroqClient,
    disableGroqKey,
    disableUserGroqKey,
    getUserGroqKeyIndex,
    setUserGroqKeyIndex,
    advanceGroqKeyIndex,
    advanceUserGroqKeyIndex,
    getOpenAiClient,
    disableOpenAiKey,
    disableUserOpenAiKey,
    getUserOpenAiKeyIndex,
    setUserOpenAiKeyIndex,
    advanceOpenAiKeyIndex,
    advanceUserOpenAiKeyIndex,
    geminiClientPool,
    disabledGeminiKeyIndices,
    userDisabledGeminiKeyIndices,
    userGeminiKeyIndices,
    geminiKeyIndex,
    groqKeyIndex,
    disabledGroqKeyIndices,
    userDisabledGroqKeyIndices,
    userGroqKeyIndices,
    openAiClientPool,
    disabledOpenAiKeyIndices,
    userDisabledOpenAiKeyIndices,
    userOpenAiKeyIndices,
    openAiKeyIndex
}