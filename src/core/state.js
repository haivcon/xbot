const logger = require('./logger');
const log = logger.child('State');

// Shared mutable state holders extracted from index.js
// These Maps/Sets are imported wherever global bot state is needed.

const coOwnerIds = new Set();
const bannedUserIds = new Set();
const bannedDeviceIds = new Set();
const ownerPasswordPrompts = new Map();
const ownerPasswordAttempts = new Map();
const ownerListStates = new Map();

const okxResolvedChainCache = new Map();
const geminiClientPool = new Map();
const disabledGeminiKeyIndices = new Set();
const groqClientPool = new Map();
const disabledGroqKeyIndices = new Set();
const openAiClientPool = new Map();
const disabledOpenAiKeyIndices = new Set();

const tokenDecimalsCache = new Map();
const okxTokenDirectoryCache = new Map();
const tokenPriceCache = new Map();
const walletChainCallbackStore = new Map();
const walletTokenCallbackStore = new Map();
const topTokenSessions = new Map();
const filterCacheHydrated = new Set();
const userGeminiKeyIndices = new Map();
const userDisabledGeminiKeyIndices = new Map();
const userGroqKeyIndices = new Map();
const userDisabledGroqKeyIndices = new Map();
const userOpenAiKeyIndices = new Map();
const userDisabledOpenAiKeyIndices = new Map();

// Store info about failed API keys for user notification
// Key: userId, Value: Map<keyIndex, { reason, keyName, timestamp }>
const userExpiredKeyNotices = new Map();

const walletTokenActionCache = new Map();
const ownerActionStates = new Map();
const walletWatchers = new Map();

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
const customPersonaPrompts = new Map(); // Custom persona input sessions
const rmchatBotMessages = new Map();
const rmchatUserMessages = new Map();

const aiApiMenuStates = new Map();
const aiProviderSelectionSessions = new Map();
const userTtsSettings = new Map();
const userGeminiModelPreferences = new Map(); // userId -> { modelFamily: 'gemini-3-pro' | 'gemini-2.5-flash', thinkingLevel: 'low' | 'high' | null }

const randomQuizSessions = new Map();
const groupAdminSettings = new Map();
const adminChatIndex = new Map();
const warnHistory = new Map();
const filterConfigs = new Map();
const filterSetupStates = new Map();
const floodTrackers = new Map();
const muteTimers = new Map();
const adminBroadcastPrompts = new Map();
const pendingWelcomeChallenges = new Map();
const welcomeUserIndex = new Map();
const welcomeAdminStates = new Map();
const welcomeAdminMenus = new Map();
const pendingVoiceCommands = new Map(); // For voice command confirmations: token -> { msg, lang, toolCalls, audioContext, transcript, createdAt }

// ============================================
// TTL Configuration for session-based Maps
// ============================================
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 phút cho sessions
const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 phút cho cache
const PROMPT_TTL_MS = 5 * 60 * 1000;   // 5 phút cho prompts

// Maps cần cleanup với TTL (session-based)
const sessionMapsWithTTL = [
    { map: ownerPasswordPrompts, ttl: PROMPT_TTL_MS },
    { map: ownerPasswordAttempts, ttl: SESSION_TTL_MS },
    { map: ownerListStates, ttl: SESSION_TTL_MS },
    { map: walletChainCallbackStore, ttl: CACHE_TTL_MS },
    { map: walletTokenCallbackStore, ttl: CACHE_TTL_MS },
    { map: topTokenSessions, ttl: CACHE_TTL_MS },
    { map: walletTokenActionCache, ttl: CACHE_TTL_MS },
    { map: ownerActionStates, ttl: SESSION_TTL_MS },
    { map: pendingCheckinChallenges, ttl: PROMPT_TTL_MS },
    { map: pendingEmotionPrompts, ttl: PROMPT_TTL_MS },
    { map: pendingGoalInputs, ttl: PROMPT_TTL_MS },
    { map: pendingSecretMessages, ttl: PROMPT_TTL_MS },
    { map: checkinAdminStates, ttl: SESSION_TTL_MS },
    { map: checkinAdminMenus, ttl: SESSION_TTL_MS },
    { map: helpMenuStates, ttl: SESSION_TTL_MS },
    { map: adminHubSessions, ttl: SESSION_TTL_MS },
    { map: idTelegramSessions, ttl: SESSION_TTL_MS },
    { map: registerWizardStates, ttl: SESSION_TTL_MS },
    { map: txhashWizardStates, ttl: SESSION_TTL_MS },
    { map: tokenWizardStates, ttl: SESSION_TTL_MS },
    { map: contractWizardStates, ttl: SESSION_TTL_MS },
    { map: aiApiAddPrompts, ttl: PROMPT_TTL_MS },
    { map: aiApiMenuStates, ttl: SESSION_TTL_MS },
    { map: aiProviderSelectionSessions, ttl: SESSION_TTL_MS },
    { map: randomQuizSessions, ttl: SESSION_TTL_MS },
    { map: filterSetupStates, ttl: SESSION_TTL_MS },
    { map: adminBroadcastPrompts, ttl: PROMPT_TTL_MS },
    { map: pendingWelcomeChallenges, ttl: PROMPT_TTL_MS },
    { map: welcomeAdminStates, ttl: SESSION_TTL_MS },
    { map: welcomeAdminMenus, ttl: SESSION_TTL_MS },
    { map: pendingVoiceCommands, ttl: PROMPT_TTL_MS },
    { map: customPersonaPrompts, ttl: SESSION_TTL_MS }
];

/**
 * Cleanup expired entries from session Maps
 * Entries must have a `createdAt` or `timestamp` property (in ms)
 */
function cleanupExpiredSessions() {
    const now = Date.now();
    let totalCleaned = 0;

    for (const { map, ttl } of sessionMapsWithTTL) {
        for (const [key, value] of map) {
            const createdAt = value?.createdAt || value?.timestamp || value?.ts;
            if (typeof createdAt === 'number' && now - createdAt > ttl) {
                map.delete(key);
                totalCleaned++;
            }
        }
    }

    if (totalCleaned > 0) {
        log.info(`Cleaned up ${totalCleaned} expired session entries`);
    }
}

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref(); // Don't prevent Node.js from exiting
}

module.exports = {
    adminBroadcastPrompts,
    adminChatIndex,
    adminHubSessions,
    aiApiAddPrompts,
    aiApiMenuStates,
    aiProviderSelectionSessions,
    bannedDeviceIds,
    bannedUserIds,
    checkinAdminMenus,
    checkinAdminStates,
    coOwnerIds,
    contractWizardStates,
    disabledGeminiKeyIndices,
    disabledGroqKeyIndices,
    disabledOpenAiKeyIndices,
    filterCacheHydrated,
    filterConfigs,
    filterSetupStates,
    floodTrackers,
    geminiClientPool,
    groupAdminSettings,
    helpMenuStates,
    customPersonaPrompts,
    idTelegramSessions,
    muteTimers,
    okxResolvedChainCache,
    okxTokenDirectoryCache,
    openAiClientPool,
    ownerActionStates,
    ownerListStates,
    ownerPasswordAttempts,
    ownerPasswordPrompts,
    pendingCheckinChallenges,
    pendingEmotionPrompts,
    pendingGoalInputs,
    pendingSecretMessages,
    pendingWelcomeChallenges,
    randomQuizSessions,
    registerWizardStates,
    rmchatBotMessages,
    rmchatUserMessages,
    tokenDecimalsCache,
    tokenPriceCache,
    tokenWizardStates,
    topTokenSessions,
    txhashWizardStates,
    userDisabledGeminiKeyIndices,
    userDisabledGroqKeyIndices,
    userDisabledOpenAiKeyIndices,
    userGeminiKeyIndices,
    userGeminiModelPreferences,
    userGroqKeyIndices,
    userOpenAiKeyIndices,
    userExpiredKeyNotices,
    userTtsSettings,
    walletChainCallbackStore,
    walletTokenActionCache,
    walletTokenCallbackStore,
    walletWatchers,
    warnHistory,
    welcomeAdminStates,
    welcomeAdminMenus,
    welcomeUserIndex,
    pendingVoiceCommands,
    // TTL constants and cleanup utilities
    SESSION_TTL_MS,
    CACHE_TTL_MS,
    PROMPT_TTL_MS,
    cleanupExpiredSessions
};
