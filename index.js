// Đảm bảo dotenv được gọi ĐẦU TIÊN
require('dotenv').config();

// Enable automatic filename/content-type detection to silence upcoming file send deprecations
process.env.NTBA_FIX_350 = process.env.NTBA_FIX_350 || '1';

// Global error handlers - prevent crashes and log errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]', err);
    // Don't exit - let PM2 handle restart if needed
});

// --- Import các thư viện ---
const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const crypto = require('crypto');
const axios = require('axios');
const { randomFortunes, resolveFortuneLang, formatFortuneEntry } = require('./data/randomFortunes');
const db = require('./db');
const { SCIENCE_TEMPLATES, SCIENCE_ENTRIES } = require('./data/scienceQuestions.js');
const {
    chunkInlineButtons,
    delay,
    decimalToRawBigInt,
    normalizeAddress,
    normalizeAddressSafe,
    normalizeNumeric,
    normalizeOkxConfigAddress,
    shortenAddress,
    unwrapOkxData,
    unwrapOkxFirst
} = require('./src/utils/helpers');
const { buildPaginatedChainKeyboard, sortChainsWithPriority } = require('./src/features/chainMenu');
const { getChainIcon } = require('./src/features/chainIcons');
const {
    formatBigIntValue,
    formatPercentage,
    formatRelativeTime,
    formatTimestampRange,
    multiplyDecimalStrings,
    formatTokenAmountFromUnits,
    formatTokenQuantity,
    formatUsdCompact,
    formatUsdPrice,
    parseBigIntValue,
    parseDecimalStringParts,
    subtractDecimalStrings
} = require('./src/utils/format');
const { escapeHtml } = require('./src/utils/text');
const {
    formatCommandLabel,
    formatMarkdownTableBlock,
    convertMarkdownToTelegram,
    escapeMarkdownV2,
    formatCopyableValueHtml,
    formatBoldMarkdownToHtml
} = require('./src/app/utils/markdown');
const createRandomCallbackHandler = require('./src/app/randomCallbacks');
const createRandomTextHelpers = require('./src/app/utils/randomText');
const createIdTelegramHandler = require('./src/app/utils/idTelegram');
const {
    TELEGRAM_MESSAGE_SAFE_LENGTH,
    splitTelegramMessageText,
    splitTelegramMarkdownV2Text,
    extractThreadId,
    buildThreadedOptions
} = require('./src/app/utils/telegram');
const { createReplyHelpers } = require('./src/app/utils/reply');
const {
    buildSyntheticCommandMessage,
    saveHelpMessageState,
    getHelpMessageState,
    clearHelpMessageState,
    detectTelegramMessageType,
    collectTelegramFileIds,
    extractAudioSourceFromMessage,
    resolveAudioFormatFromPath,
    resolveAudioMimeType,
    writeWaveFileFromPcm
} = require('./src/app/telegram/messageUtils');
const { buildCloseKeyboard, appendCloseButton } = require('./src/features/ui');
const {
    bot,
    buildBotStartLink,
    scheduleMessageDeletion,
    sendEphemeralMessage,
    rememberRmchatMessage,
    purgeRmchatMessages
} = require('./src/core/bot');
const { t, resolveLangCode } = require('./src/core/i18n');
const { sanitizeSecrets } = require('./src/core/sanitize');
const { commandRegistry } = require('./src/core/commandRegistry');
const { loadCommands, startHotReload } = require('./src/core/commandLoader');
const { createCommandRouter } = require('./src/core/commandRouter');
const {
    aiState,
    normalizeAiProvider,
    buildAiProviderMeta,
    extractGoogleCandidateText,
    probeGoogleApiKey,
    probeGroqApiKey,
    isUserApiKeyValid,
    rememberAiApiMenuState,
    getAiApiMenuState,
    buildAiApiMenu,
    parseAiApiSubmission,
    urlToGenerativePart,
    bufferToGenerativePart,
    detectImageAction,
    isQuotaOrRateLimitError,
    isOpenAiBillingError,
    isGeminiApiKeyExpired,
    downloadTelegramPhotoBuffer,
    convertImageToPngSquare,
    buildGroqMessageContent,
    getGeminiClient,
    disableGeminiKey,
    disableUserGeminiKey,
    getUserGeminiKeyIndex,
    setUserGeminiKeyIndex,
    getGeminiTtsVoiceMeta,
    getGeminiTtsLanguageMeta,
    formatTtsVoiceLabel,
    formatTtsLanguageLabel,
    getUserTtsConfig,
    saveUserTtsVoice,
    saveUserTtsLanguage,
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
    buildAiUsageKeyboard,
    buildTtsSettingsKeyboard,
    buildTtsSettingsText,
    getUserGeminiModelConfig,
    saveUserGeminiModel,
    saveUserThinkingLevel,
    buildGeminiModelSelectionKeyboard,
    buildGeminiModelSelectionText,
    setDatabase: setAiServiceDatabase,
    hydrateAiModelPreferences
} = require('./src/features/aiService');

const createCheckinScheduler = require('./src/features/checkin/scheduler');
const createPriceAlerts = require('./src/features/priceAlerts');
const {
    mapWithConcurrency,
    getXlayerProvider,
    getXlayerWebsocketProvider,
    teardownWalletWatcher
} = require('./src/services/walletWatchers');
const {
    CHECKIN_MAX_ATTEMPTS,
    CHECKIN_SCIENCE_PROBABILITY,
    CHECKIN_SCHEDULER_INTERVAL,
    CHECKIN_DEFAULT_TIME,
    CHECKIN_DEFAULT_TIMEZONE,
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
    WELCOME_ENFORCEMENT_ACTIONS,
    WELCOME_QUEUE_INTERVAL_MS,
    WELCOME_QUEUE_MAX_PER_TICK,
    sanitizeWeightValue,
    formatTemplateWithVariables,
    getQuestionWeights,
    pickQuestionType,
    formatQuestionWeightPercentages,
    normalizeTimeSlot,
    sanitizeScheduleSlots,
    parseScheduleTextInput,
    getScheduleSlots,
    getSummaryScheduleSlots
} = require('./src/features/checkin/constants');
const {
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
} = require('./src/config/env');
const createOkxService = require('./src/services/okxService');
const { startApiServer } = require('./src/server/apiServer');
const { handleTopTokenCallback } = require('./src/handlers/callbacks/topToken');
const createTopTokenHelpers = require('./src/handlers/commands/topToken');
const { handleTxhashCallback } = require('./src/handlers/callbacks/txhash');
const { handleTokenCallback } = require('./src/handlers/callbacks/token');
const { handleContractCommand } = require('./src/handlers/commands/contract');
const { handleOkxChainsCommand } = require('./src/handlers/commands/okxChains');
const { handleOkx402StatusCommand } = require('./src/handlers/commands/okx402');
const { handleTxhashCommand } = require('./src/handlers/commands/txhash');
const { getPersonaStrings } = require('./src/app/personaI18n');
const { pendingVoiceCommands } = require('./src/core/state');
const { executeFunctionCall: executeVoiceFunctionCall, buildLiveTools } = require('./src/features/liveAudioTools');
const { processAudioWithLiveAPI } = require('./src/features/geminiLiveAudio');
const {
    ADMIN_MENU_SECTION_CONFIG,
    CHECKIN_EMOTIONS,
    HELP_COMMAND_DETAILS,
    HELP_GROUP_DETAILS,
    HELP_TABLE_LAYOUT,
    HELP_USER_SECTIONS
} = require('./src/config/constants');
const createCheckinChallenges = require('./src/features/checkin/challenges');
const {
    resolveScienceLang,
    getScienceEntriesByType,
    getScienceTemplate,
    renderScienceQuestion,
    buildScienceOptionTexts,
    shuffleArray,
    generateMathChallenge,
    generateScienceChallenge,
    generateCheckinChallenge,
    buildEmotionKeyboard,
    buildGoalKeyboard,
    sanitizeGoalInput,
    createShortToken
} = createCheckinChallenges({
    t,
    pickQuestionType,
    CHECKIN_EMOTIONS,
    CHECKIN_GOAL_PRESETS,
    SCIENCE_TEMPLATES,
    SCIENCE_ENTRIES
});
const { createCheckinRuntime } = require('./src/features/checkin/runtime');
const createCheckinAdminUi = require('./src/features/checkin/adminUi');
const createHelpFeature = require('./src/features/help');
const createOwnerListFeature = require('./src/features/ownerList');
const { createTelegramDebugHelpers } = require('./src/app/telegramDebug');
const { createAiApiHandlers } = require('./src/app/aiApiHandlers');
const { createAiHandlers } = require('./src/app/aiHandlers');
const { registerAutoDetection } = require('./src/bot/handlers/autoDetection');
const { getPendingConfirmation, clearPendingConfirmation } = require('./src/bot/handlers/confirmationHandler');
const { createStartHandlers } = require('./src/app/startHandlers');
const { createWalletCommandHandlers } = require('./src/app/walletCommandHandlers');
const { createDonateHandlers } = require('./src/app/donateHandlers');
const { createAdminHandlers } = require('./src/app/adminHandlers');
const { createWalletFeatures } = require('./src/app/walletFeatures');
const { createRandomFeature } = require('./src/app/random');
const registerRandomCommands = require('./src/app/randomCommands');
const registerAdminCommands = require('./src/app/adminCommands');
const registerCoreCommands = require('./src/app/coreCommands');
const registerModerationCommands = require('./src/app/moderationCommands');
const createFeatureTopicsHandlers = require('./src/app/featureTopics');
const registerFeatureTopicCommands = require('./src/app/featureTopicCommands');
const registerUtilityCommands = require('./src/app/utilityCommands');
const createHelpExecutors = require('./src/app/helpExecutors');
const { createOwnerFeature } = require('./src/app/owner');
const { createTxhashFlow } = require('./src/app/txhashFlow');
const { createTokenFlow } = require('./src/app/tokenFlow');
const { createCheckinAdminActions } = require('./src/features/checkin/adminActions');
const { createWalletOverview } = require('./src/app/walletOverview');
const { createAiAudio } = require('./src/features/aiAudio');
const createRmchatCommands = require('./src/app/rmchatCommands');
const createWalletInline = require('./src/app/walletInline');
const {
    findLanguageOption,
    buildLanguageMenuText,
    buildLanguageKeyboard,
    buildLanguageKeyboardWithPrefix
} = require('./src/features/languageMenu');

// --- Ki?m tra C?u h�nh ---
if (!TELEGRAM_TOKEN) {
    console.error("L?I NGHIEM TR?NG: Thi?u TELEGRAM_TOKEN trong file .env!");
    process.exit(1);
}
const {
    getGroupSettings,
    getWelcomeVerificationSettings,
    saveWelcomeVerificationSettings,
    rememberAdminChat,
    getWarnState,
    getFilterState,
    ensureFilterState,
    normalizeFilterResponse,
    isUserAdmin,
    isGroupAdmin,
    isGroupAdminFlexible,
    parseDuration,
    clearScheduledUnmute,
    scheduleAutomaticUnmute,
    parseTargetFromCommand,
    resolveTargetId,
    resolveUserProfile,
    applyWarnAction
} = require('./src/app/moderation');
const {
    isOwner,
    hasOwnerOverride,
    hydrateCoOwners,
    hydrateBannedUsers,
    hydrateBannedDevices,
    buildDeviceTargetId,
    isDeviceTarget,
    parseDevicePayload,
    extractTelegramDeviceInfo,
    recordDeviceInfo,
    ensureDeviceInfo,
    loadDevicesForUsers,
    registerCoOwner,
    revokeCoOwner,
    banUser,
    unbanUser,
    buildBanNotice,
    createAccessControlHandlers
} = require('./src/app/accessControl');
const createWalletUi = require('./src/app/walletUi');
const {
    getLang,
    resolveNotificationLanguage,
    resolveGroupLanguage,
    resolveTopicLanguage
} = require('./src/app/language');
const {
    adminBroadcastPrompts,
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
    filterSetupStates,
    floodTrackers,
    geminiClientPool,
    idTelegramSessions,
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
    userGroqKeyIndices,
    userOpenAiKeyIndices,
    userTtsSettings,
    walletChainCallbackStore,
    walletTokenActionCache,
    walletTokenCallbackStore,
    welcomeAdminStates,
    welcomeUserIndex
    , welcomeAdminMenus
} = require('./src/core/state');
const randomFeature = createRandomFeature({
    t,
    defaultLang,
    escapeHtml,
    randomFortunes,
    resolveFortuneLang,
    formatFortuneEntry,
    createShortToken,
    randomQuizSessions,
    bot
});
const {
    RANDOM_MENU_ACTIONS,
    RANDOM_MENU_COMMANDS,
    randomizeTextCase,
    storeRandomQuiz,
    getRandomQuiz,
    clearRandomQuiz,
    generateLongShortOutcome,
    getRandomInt,
    parseDiceNotation,
    rollDice,
    renderDieFaceArt,
    buildDiceArt,
    formatDiceDetail,
    formatRollContext,
    stripHtmlTags,
    buildRandomResultKeyboard,
    formatExecutionAudit,
    pickRandomFortune,
    buildRandomMenuKeyboard,
    buildRandomMenuText,
    buildRpsKeyboard,
    buildTruthKeyboard,
    buildFortuneKeyboard,
    buildQuizKeyboard,
    buildMemoryThemeKeyboard,
    getMemoryThemeLabel,
    parseMemorySizeInput,
    buildMemorySizeKeyboard,
    createMemoryGame,
    handleMemoryPick,
    buildMinesweeperSizeKeyboard,
    createMinesweeperGame,
    handleMinesweeperPick,
    toggleMinesweeperFlagMode,
    replayMinesweeperGame,
    parseSudokuSizeInput,
    buildSudokuSizeKeyboard,
    createSudokuGame,
    handleSudokuPick,
    handleSudokuSetNumber,
    handleSudokuClear,
    getGomokuUserDifficulty,
    setGomokuUserDifficulty,
    getGomokuDifficultyLabel,
    parseGomokuSizeInput,
    buildGomokuSizeKeyboard,
    createGomokuGame,
    handleGomokuPick,
    createChessGame,
    handleChessPick,
    joinChessGame,
    setChessMessageContext,
    parseTreasureSizeInput,
    buildTreasureSizeKeyboard,
    createTreasureGame,
    handleTreasurePick,
    determineRpsResult,
    updateRandomMenuMessage
} = randomFeature;

const { buildRandomGameText } = createRandomTextHelpers({
    t,
    escapeHtml,
    formatExecutionAudit,
    defaultLang
});


// --- C?U HÌNH ---
const okxService = createOkxService({
    OKX_BASE_URL,
    OKX_API_KEY,
    OKX_SECRET_KEY,
    OKX_API_PASSPHRASE,
    OKX_API_PROJECT,
    OKX_API_SIMULATED,
    OKX_FETCH_TIMEOUT,
    OKX_CHAIN_SHORT_NAME,
    OKX_CHAIN_INDEX,
    OKX_CHAIN_INDEX_FALLBACK,
    OKX_BANMAO_TOKEN_ADDRESS,
    OKX_QUOTE_TOKEN_ADDRESS,
    OKX_OKB_TOKEN_ADDRESSES,
    OKX_OKB_SYMBOL_KEYS,
    OKX_MARKET_INSTRUMENT,
    BANMAO_DECIMALS_DEFAULT,
    BANMAO_DECIMALS_CACHE_TTL,
    PRICE_REF_OKB_ADDRESS,
    PRICE_REF_OKB_CHAIN_INDEX,
    PRICE_REF_ETH_ADDRESS,
    PRICE_REF_ETH_CHAIN_INDEX,
    PRICE_REF_BTC_ADDRESS,
    PRICE_REF_BTC_CHAIN_INDEX
});
const {
    callOkxDexEndpoint,
    fetchOkxDexBalanceSnapshot,
    fetchOkxDexWalletHoldings,
    fetchOkxSupportedChains,
    fetchOkxBalanceSupportedChains,
    fetchOkx402Supported,
    fetchOkxTxhashDetail,
    fetchOkxTopTokenList,
    fetchBanmaoPrice,
    fetchTokenMarketSnapshot,
    fetchTokenPriceOverview,
    pickOkxNumeric,
    collectTxhashChainEntries,
    ensureOkxChainDirectory,
    getOkxChainShortNameCandidates,
    resolveChainContextShortName,
    resolveTopTokenChainEntry,
    sortTxhashChainEntries
} = okxService;
const walletUi = createWalletUi({
    t,
    db,
    appendCloseButton,
    shortenAddress,
    normalizeAddressSafe,
    fetchOkxBalanceSupportedChains,
    WALLET_CHAIN_CALLBACK_TTL,
    WALLET_TOKEN_CALLBACK_TTL,
    OKX_CHAIN_INDEX_FALLBACK,
    preferredChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK,
    walletChainCallbackStore,
    walletTokenCallbackStore,
    PUBLIC_BASE_URL,
    escapeHtml
});
const {
    buildWalletActionKeyboard,
    sortChainsForMenu,
    createWalletChainCallback,
    resolveWalletChainCallback,
    registerWalletTokenContext,
    resolveWalletTokenContext,
    buildWalletChainMenu,
    buildWalletSelectMenu,
    buildWalletManagerMenu,
    buildPortfolioEmbedUrl,
    buildOkxPortfolioAnalysisUrl,
    formatChainLabel
} = walletUi;
const {
    sendMessageRespectingThread,
    sendReply
} = createReplyHelpers(bot);
const accessControlHandlers = createAccessControlHandlers({
    bot,
    getLang,
    sendReply,
    buildCloseKeyboard,
    resolveNotificationLanguage
});

const {
    enforceBanForMessage,
    enforceBanForCallback,
    resetOwnerPasswordAttempts,
    recordOwnerPasswordFailure,
    clearOwnerAction,
    enforceOwnerCommandLimit,
    enforceDoremonLimit
} = accessControlHandlers;

const handleRandomCallback = createRandomCallbackHandler({
    bot,
    t,
    escapeHtml,
    updateRandomMenuMessage,
    getRandomInt,
    formatExecutionAudit,
    buildRandomResultKeyboard,
    buildRandomGameText,
    getGomokuUserDifficulty,
    getGomokuDifficultyLabel,
    setGomokuUserDifficulty,
    parseGomokuSizeInput,
    buildGomokuSizeKeyboard,
    createGomokuGame,
    buildRpsKeyboard,
    buildMemoryThemeKeyboard,
    getMemoryThemeLabel,
    buildMemorySizeKeyboard,
    createMemoryGame,
    parseMemorySizeInput,
    buildSudokuSizeKeyboard,
    parseSudokuSizeInput,
    createSudokuGame,
    buildMinesweeperSizeKeyboard,
    createMinesweeperGame,
    handleMinesweeperPick,
    toggleMinesweeperFlagMode,
    replayMinesweeperGame,
    parseTreasureSizeInput,
    buildTreasureSizeKeyboard,
    createTreasureGame,
    handleTreasurePick,
    handleGomokuPick,
    createChessGame,
    handleChessPick,
    joinChessGame,
    setChessMessageContext,
    determineRpsResult,
    rollDice,
    formatRollContext,
    formatDiceDetail,
    generateLongShortOutcome,
    generateCheckinChallenge,
    storeRandomQuiz,
    getRandomQuiz,
    clearRandomQuiz,
    buildQuizKeyboard,
    buildFortuneKeyboard,
    pickRandomFortune,
    enforceDoremonLimit,
    handleMemoryPick,
    handleSudokuPick,
    handleSudokuSetNumber,
    handleSudokuClear
});

function baseMaskApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length <= 8) {
        return '****';
    }
    const trimmed = apiKey.trim();
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

const {
    handleRmchatCommand,
    buildRmchatKeyboard,
    buildRmchatText
} = createRmchatCommands({
    t,
    getLang,
    sendReply,
    scheduleMessageDeletion
});

const LANGUAGE_MENU_AUTO_CLOSE_MS = 10000;
const LANGUAGE_MENU_FEEDBACK_MS = 4500;

function buildLanguagePickerView(lang, currentLang, isGroupChat = false, { prefix = 'lang' } = {}) {
    const normalizedLang = resolveLangCode(currentLang || lang || defaultLang);
    return {
        text: buildLanguageMenuText({
            t,
            lang,
            currentLang: normalizedLang,
            isGroupChat,
            autoCloseSeconds: Math.round(LANGUAGE_MENU_AUTO_CLOSE_MS / 1000)
        }),
        reply_markup: buildLanguageKeyboardWithPrefix({
            t,
            lang,
            currentLang: normalizedLang,
            includeClose: true,
            prefix
        })
    };
}

function buildLanguageChangeFeedback(newLang, isGroupChat = false) {
    const targetLang = resolveLangCode(newLang || defaultLang);
    const option = findLanguageOption(targetLang);
    const effect = option.vibe || '✨';
    const messageKey = isGroupChat ? 'group_language_changed_success' : 'language_changed_success';

    return {
        toast: `${option.flag} ${option.nativeName} ${effect}`,
        text: `${option.flag} ${option.nativeName} ${effect}\n${t(targetLang, messageKey)}`,
        langOption: option
    };
}

async function handleLangCommand(msg) {
    const chatId = msg?.chat?.id;
    const topicId = Object.prototype.hasOwnProperty.call(msg || {}, 'message_thread_id') ? msg.message_thread_id : null;
    const userId = msg.from?.id;
    if (!chatId) {
        return;
    }

    const lang = await getLang(msg);
    const normalizedLang = resolveLangCode(lang);
    const isGroupChat = ['group', 'supergroup'].includes(msg?.chat?.type);
    const isTopicMessage = isGroupChat && topicId !== null && topicId !== undefined;

    if (isTopicMessage) {
        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            const feedbackLang = resolveLangCode(msg.from?.language_code || lang);
            await sendReply(msg, t(feedbackLang, 'group_language_admin_only'));
            return;
        }

        const currentLang = await resolveTopicLanguage(chatId, topicId, lang);
        const picker = buildLanguagePickerView(lang, currentLang, true, { prefix: 'langtopic' });
        const sent = await sendReply(msg, picker.text, {
            reply_markup: picker.reply_markup,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        if (sent?.chat?.id && sent?.message_id) {
            scheduleMessageDeletion(sent.chat.id, sent.message_id, LANGUAGE_MENU_AUTO_CLOSE_MS);
        }
        return;
    }

    if (isGroupChat) {
        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            const feedbackLang = resolveLangCode(msg.from?.language_code || lang);
            await sendReply(msg, t(feedbackLang, 'group_language_admin_only'));
            return;
        }
    }

    const currentLang = isGroupChat
        ? await resolveGroupLanguage(chatId, normalizedLang)
        : normalizedLang;
    const picker = buildLanguagePickerView(lang, currentLang, isGroupChat);
    const sent = await sendReply(msg, picker.text, {
        reply_markup: picker.reply_markup,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    });

    if (sent?.chat?.id && sent?.message_id) {
        scheduleMessageDeletion(sent.chat.id, sent.message_id, LANGUAGE_MENU_AUTO_CLOSE_MS);
    }

    if (!isGroupChat && userId) {
        try {
            await openAdminHub(userId, { fallbackLang: lang, mode: 'language' });
        } catch (error) {
            const feedbackLang = resolveLangCode(msg.from?.language_code || lang);
            await sendReply(msg, t(feedbackLang, 'help_action_dm_blocked'), { reply_markup: buildCloseKeyboard(feedbackLang) });
        }
    } else if (isGroupChat) {
        try {
            await openAdminHub(userId, { fallbackLang: lang, mode: 'language' });
            const feedbackLang = resolveLangCode(msg.from?.language_code || lang);
            await sendReply(msg, t(feedbackLang, 'language_hub_dm_notice'), { reply_markup: buildCloseKeyboard(feedbackLang) });
        } catch (error) {
            const feedbackLang = resolveLangCode(msg.from?.language_code || lang);
            await sendReply(msg, t(feedbackLang, 'help_action_dm_blocked'), { reply_markup: buildCloseKeyboard(feedbackLang) });
        }
    }
}

async function handleLanguageCommand(msg) {
    await handleLangCommand(msg);
}

async function handleTopicLanguageCommand(msg) {
    await handleLangCommand(msg);
}

async function handleLanguageSelection(query, newLang, callbackLang) {
    const chatId = query.message?.chat?.id;
    if (!chatId) {
        await bot.answerCallbackQuery(query.id);
        return;
    }

    const chatKey = chatId.toString();
    const targetLang = resolveLangCode(newLang || defaultLang);
    const isGroupChat = ['group', 'supergroup'].includes(query.message?.chat?.type);

    if (isGroupChat) {
        const isAdmin = await isGroupAdmin(chatKey, query.from?.id);
        if (!isAdmin) {
            const feedbackLang = resolveLangCode(callbackLang || query.from?.language_code || targetLang);
            await bot.answerCallbackQuery(query.id, { text: t(feedbackLang, 'group_language_admin_only'), show_alert: true });
            return;
        }
    }

    await db.setLanguage(chatKey, targetLang);

    if (isGroupChat) {
        try {
            const subscription = await db.getGroupSubscription(chatKey);
            if (subscription) {
                await db.updateGroupSubscriptionLanguage(chatKey, targetLang);
            }
        } catch (error) {
            console.warn(`[GroupLanguage] Unable to update broadcast language for ${chatKey}: ${error.message}`);
        }
    }

    const feedback = buildLanguageChangeFeedback(targetLang, isGroupChat);

    if (query.message?.message_id) {
        bot.deleteMessage(chatKey, query.message.message_id).catch(() => { /* ignore cleanup errors */ });
    }

    const confirmation = await sendReply(query.message, feedback.text, { disable_web_page_preview: true });
    if (confirmation?.chat?.id && confirmation?.message_id) {
        scheduleMessageDeletion(confirmation.chat.id, confirmation.message_id, LANGUAGE_MENU_FEEDBACK_MS);
    }

    console.log(`[BOT] ChatID ${chatKey} changed language to: ${targetLang}`);
    await bot.answerCallbackQuery(query.id, { text: feedback.toast });
}

async function handleTopicLanguageSelection(query, newLang, callbackLang) {
    const chatId = query.message?.chat?.id;
    const topicId = query.message?.message_thread_id;
    if (!chatId || topicId === undefined || topicId === null) {
        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'topic_language_topic_only'), show_alert: true });
        return;
    }

    const chatKey = chatId.toString();
    const targetLang = resolveLangCode(newLang || defaultLang);
    const isGroupChat = ['group', 'supergroup'].includes(query.message?.chat?.type);

    if (isGroupChat) {
        const isAdmin = await isGroupAdmin(chatKey, query.from?.id);
        if (!isAdmin) {
            const feedbackLang = resolveLangCode(callbackLang || query.from?.language_code || targetLang);
            await bot.answerCallbackQuery(query.id, { text: t(feedbackLang, 'group_language_admin_only'), show_alert: true });
            return;
        }
    }

    await db.setTopicLanguage(chatKey, topicId.toString(), targetLang);

    const feedback = {
        toast: t(targetLang, 'topic_language_changed_success'),
        text: t(targetLang, 'topic_language_changed_success')
    };

    if (query.message?.message_id) {
        bot.deleteMessage(chatKey, query.message.message_id).catch(() => { /* ignore cleanup errors */ });
    }

    const confirmation = await sendReply(query.message, feedback.text, {
        disable_web_page_preview: true
    });
    if (confirmation?.chat?.id && confirmation?.message_id) {
        scheduleMessageDeletion(confirmation.chat.id, confirmation.message_id, LANGUAGE_MENU_FEEDBACK_MS);
    }

    console.log(`[BOT] Topic ${chatKey}/${topicId} changed language to: ${targetLang}`);
    await bot.answerCallbackQuery(query.id, { text: feedback.toast });
}

function formatLanguageLabel(code) {
    const option = findLanguageOption(resolveLangCode(code || defaultLang));
    const flag = option?.flag || '🌐';
    const name = option?.nativeName || option?.code || resolveLangCode(code || defaultLang);
    return `${flag} ${name}`.trim();
}

function buildLanguageTopicLink(chatId, topicId) {
    if (!chatId || !topicId || topicId === 'main') {
        return null;
    }
    const chatStr = chatId.toString();
    const numeric = chatStr.startsWith('-100') ? chatStr.slice(4) : chatStr.replace(/^-/, '');
    if (!numeric) {
        return null;
    }
    return `https://t.me/c/${numeric}/${topicId}`;
}

async function buildLanguageAdminView(chatId, lang) {
    const chatKey = chatId?.toString();
    const lines = [`🌐 <b>${escapeHtml(t(lang, 'language_hub_title'))}</b>`, `<i>${escapeHtml(t(lang, 'language_hub_hint'))}</i>`];

    let chatLabel = chatKey;
    try {
        const chat = await bot.getChat(chatKey);
        if (chat?.title) {
            chatLabel = chat.title;
        } else if (chat?.username) {
            chatLabel = `@${chat.username}`;
        }
    } catch (error) {
        // ignore lookup errors
    }

    const groupLang = await resolveGroupLanguage(chatKey, lang);
    lines.push('', `🏷️ ${t(lang, 'language_hub_group_label', { title: escapeHtml(chatLabel), id: escapeHtml(chatKey) })}`);
    lines.push(`🗣️ ${t(lang, 'language_hub_primary_lang', { lang: escapeHtml(formatLanguageLabel(groupLang)) })}`);

    const topics = await db.listTopicLanguages(chatKey);
    const inline_keyboard = [];

    if (!topics || topics.length === 0) {
        lines.push('', t(lang, 'language_hub_topics_empty'));
    } else {
        lines.push('', t(lang, 'language_hub_topics_header'));
        for (const entry of topics) {
            const topicId = entry.topicId === undefined || entry.topicId === null ? 'main' : entry.topicId.toString();
            let topicLabel = topicId === 'main' ? t(lang, 'language_topic_main') : t(lang, 'language_topic_label', { id: topicId });
            try {
                if (topicId !== 'main') {
                    const topic = await bot.getForumTopic(chatKey, Number(topicId));
                    if (topic?.name) {
                        topicLabel = topic.name;
                    }
                }
            } catch (error) {
                // ignore topic lookup errors
            }
            const langLabel = formatLanguageLabel(entry.lang);
            const link = buildLanguageTopicLink(chatKey, topicId);
            const parts = [topicLabel, `– ${langLabel}`];
            if (link) {
                parts.push(`(<a href=\"${escapeHtml(link)}\">${escapeHtml(t(lang, 'language_hub_topic_link'))}</a>)`);
            }
            lines.push(`• ${parts.join(' ')}`);
            inline_keyboard.push([{
                text: `🗑️ ${topicLabel}`,
                callback_data: `lang_topic_clear|${chatKey}|${topicId}`
            }]);
        }
    }

    inline_keyboard.push([
        { text: `${t(lang, 'admin_hub_button_home')}`, callback_data: 'admin_hub_from_menu' },
        { text: `🔄 ${t(lang, 'language_hub_refresh')}`, callback_data: `lang_admin_refresh|${chatKey}` }
    ]);
    inline_keyboard.push([{ text: `✖️ ${t(lang, 'language_hub_close')}`, callback_data: `lang_admin_close|${chatKey}` }]);

    return { text: lines.filter(Boolean).join('\n'), reply_markup: { inline_keyboard } };
}

async function sendLanguageAdminMenu(userId, chatId, { fallbackLang, forceRefresh = false } = {}) {
    const lang = await resolveNotificationLanguage(userId, fallbackLang);
    const chatKey = chatId?.toString();
    if (!chatKey || !userId) {
        return null;
    }
    const isAdmin = await isGroupAdmin(chatKey, userId);
    if (!isAdmin) {
        await bot.sendMessage(userId, t(lang, 'language_hub_no_permission'), { reply_markup: buildCloseKeyboard(lang) });
        return null;
    }

    const payload = await buildLanguageAdminView(chatKey, lang);
    const sessionKey = `${userId}:${chatKey}`;
    const existing = languageHubSessions.get(sessionKey);

    if (existing && !forceRefresh) {
        try {
            const edited = await bot.editMessageText(payload.text, {
                chat_id: userId,
                message_id: existing.messageId,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: payload.reply_markup
            });
            return { messageId: existing.messageId, replaced: false };
        } catch (error) {
            try {
                await bot.deleteMessage(userId, existing.messageId);
            } catch (cleanupError) {
                // ignore cleanup errors
            }
        }
    }

    const sent = await bot.sendMessage(userId, payload.text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: payload.reply_markup
    });
    if (sent?.message_id) {
        languageHubSessions.set(sessionKey, { messageId: sent.message_id, chatId: chatKey });
    }
    return { messageId: sent?.message_id || null, replaced: true };
}

const { createRmchatHandlers } = require('./src/app/rmchat');
const { executeRmchatAction } = createRmchatHandlers({
    t,
    db,
    purgeRmchatMessages,
    rmchatBotMessages,
    rmchatUserMessages
});

const topTokenHelpers = createTopTokenHelpers({
    TOPTOKEN_SESSION_TTL,
    OKX_CHAIN_INDEX,
    OKX_CHAIN_INDEX_FALLBACK,
    topTokenSessions,
    enforceOwnerCommandLimit,
    getLang,
    sendReply,
    t,
    escapeHtml,
    shortenAddress,
    formatUsdPrice,
    formatUsdCompact,
    ensureOkxChainDirectory,
    sortChainsForMenu,
    formatChainLabel,
    appendCloseButton,
    fetchOkxTopTokenList,
    resolveTopTokenChainEntry
});
const { handleTokenCommand } = require('./src/handlers/commands/token');
const {
    buildTopTokenSessionKey,
    getTopTokenSession,
    updateTopTokenSession,
    clearTopTokenSession,
    describeTopTokenSort,
    describeTopTokenTimeframe,
    formatTopTokenList,
    buildTopTokenChainMenu,
    buildTopTokenSortMenu,
    buildTopTokenTimeframeMenu,
    buildTopTokenResultKeyboard,
    renderTopTokenResults,
    handleTopTokenCommand
} = topTokenHelpers;
const {
    buildHelpGroupCard,
    buildHelpText,
    buildHelpKeyboard,
    buildDonateMessage,
    buildDonateKeyboard,
    buildCommunityDonationBroadcastText,
    resolveHelpGroups,
    getDefaultHelpGroup
} = createHelpFeature({
    t,
    escapeHtml,
    formatCommandLabel,
    formatMarkdownTableBlock,
    HELP_COMMAND_DETAILS,
    HELP_GROUP_DETAILS,
    HELP_USER_SECTIONS,
    HELP_TABLE_LAYOUT,
    DEVELOPER_DONATION_ADDRESS,
    COMMUNITY_WALLET_ADDRESS,
    db
});
const ownerFormatUserLabel = (user) => {
    const nameParts = [];
    if (user?.fullName) {
        nameParts.push(escapeHtml(user.fullName));
    }
    if (user?.username) {
        nameParts.push(`@${escapeHtml(user.username)}`);
    }
    const copyableId = formatCopyableValueHtml(user?.chatId || user?.userId) || escapeHtml(user?.chatId || user?.userId || '');
    if (!nameParts.length) {
        return copyableId;
    }
    return `${nameParts.join(' · ')} (${copyableId})`;
};

const {
    createOwnerListState,
    getOwnerListState,
    updateOwnerListState,
    filterOwnerListItems,
    buildOwnerListNavigation,
    formatOwnerUserEntry,
    formatOwnerApiEntry,
    formatOwnerGroupEntry,
    renderOwnerListState,
    resolveOwnerListFilters,
    exportOwnerList,
    formatOwnerCommandEntry,
    formatOwnerAiEntry
} = createOwnerListFeature({
    t,
    escapeHtml,
    formatCommandLabel,
    formatCopyableValueHtml,
    formatUserLabel: ownerFormatUserLabel,
    maskApiKey: baseMaskApiKey,
    buildCloseKeyboard,
    ownerListStates,
    bot
});
const ownerFeature = createOwnerFeature({
    t,
    defaultLang,
    resolveLangCode,
    formatCommandLabel,
    formatMarkdownTableBlock,
    escapeHtml,
    formatCopyableValueHtml,
    buildCloseKeyboard,
    buildDeviceTargetId,
    isOwner,
    banUser,
    unbanUser,
    registerCoOwner,
    revokeCoOwner,
    clearOwnerAction,
    getLang,
    sendReply,
    parseAiApiSubmission,
    normalizeAiProvider,
    isUserApiKeyValid,
    OWNER_COMMAND_LIMIT_KEY,
    DOREMON_COMMAND_LIMIT_KEY,
    ADDITIONAL_OWNER_USERNAME,
    BOT_OWNER_ID,
    BOT_ID,
    GEMINI_API_KEYS,
    GROQ_API_KEYS,
    ownerActionStates,
    coOwnerIds,
    bannedUserIds,
    bannedDeviceIds,
    ownerPasswordPrompts,
    bot,
    db,
    sanitizeSecrets,
    createOwnerListState,
    renderOwnerListState,
    updateOwnerListState,
    getOwnerListState
});
const {
    OWNER_TABLE_LAYOUT,
    OWNER_MENU_ACTIONS,
    OWNER_MENU_GROUPS,
    getDefaultOwnerGroup,
    buildOwnerMenuText,
    buildOwnerMenuKeyboard,
    buildOwnerCommandLimitKeyboard,
    buildOwnerAiCommandLimitKeyboard,
    isLikelyGroupChatId,
    filterGroupProfiles,
    isGroupRevokedError,
    cleanupGroupProfile,
    loadActiveGroupProfiles,
    buildOwnerGroupDashboardKeyboard,
    buildOwnerGroupDetailKeyboard,
    formatOwnerTable,
    extractOwnerBroadcastPayload,
    sendOwnerBroadcastPayload,
    formatOwnerUserCards,
    formatOwnerCommandCards,
    buildCopyList,
    formatOwnerIdCell,
    parseOwnerTargetInput,
    resolveOwnerTargetWithUsername,
    describeOwnerTarget,
    setCommandLimitForUserAndDevices,
    clearCommandLimitForUserAndDevices,
    clearOwnerCaches,
    purgeChatHistory,
    collectAllKnownChatIds,
    clearChatHistoriesForIds,
    clearChatHistoriesForTarget,
    ensureGroupProfile,
    resolveOwnerGroupTarget,
    resolveGroupMetadata,
    hydrateGroupProfiles,
    formatGroupAddress,
    getGroupMemberCountSafe,
    getGroupAdminSummary,
    formatAdminList,
    parseUserIdsFromText,
    purgeBotMessagesInGroup,
    toggleBotAnonymousMode,
    sendOwnerGroupDashboard,
    sendOwnerGroupDetail,
    discardOwnerPanelMessage,
    buildUserInfoLine,
    safeParseJsonObject,
    formatTimestampLabel,
    buildUserBasicInfoBlock,
    sendChunkedHtmlMessages,
    sendOwnerUserOverview,
    sendOwnerAiStats,
    sendOwnerCommandUsageStats,
    buildServerApiKeyStats,
    sendOwnerApiStats,
    autoDeleteInvalidApiKeys,
    handleOwnerStateMessage
} = ownerFeature;
const walletOverview = createWalletOverview({
    db,
    normalizeAddressSafe,
    shortenAddress,
    mapWithConcurrency,
    WALLET_BALANCE_CONCURRENCY,
    fetchOkxDexWalletHoldings,
    formatBigIntValue,
    decimalToRawBigInt,
    multiplyDecimalStrings
});
const {
    loadWalletOverviewEntries,
    fetchLiveWalletTokens
} = walletOverview;

const walletFeatures = createWalletFeatures({
    t,
    escapeHtml,
    formatCopyableValueHtml,
    splitTelegramMessageText,
    buildThreadedOptions,
    normalizeAddressSafe,
    normalizeOkxConfigAddress,
    normalizeNumeric,
    shortenAddress,
    buildOkxPortfolioAnalysisUrl,
    registerWalletTokenContext,
    appendCloseButton,
    WALLET_TOKEN_BUTTON_LIMIT,
    WALLET_TOKEN_ACTIONS,
    WALLET_TOKEN_ACTION_LOOKUP,
    WALLET_TOKEN_CANDLE_DAY_SPAN,
    WALLET_TOKEN_CANDLE_RECENT_LIMIT,
    WALLET_TOKEN_CANDLE_RECENT_BAR,
    WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS,
    WALLET_TOKEN_TX_HISTORY_LIMIT,
    WALLET_TOKEN_TRADE_LIMIT,
    WALLET_TOKEN_HOLDER_LIMIT,
    TOKEN_PRICE_CACHE_TTL,
    OKX_QUOTE_TOKEN_ADDRESS,
    OKX_BANMAO_TOKEN_ADDRESS,
    OKX_OKB_TOKEN_ADDRESSES,
    OKX_OKB_SYMBOL_KEYS,
    hasOkxCredentials,
    callOkxDexEndpoint,
    fetchOkxDexBalanceSnapshot,
    pickOkxNumeric,
    ensureOkxChainDirectory,
    resolveChainContextShortName,
    unwrapOkxData,
    unwrapOkxFirst,
    subtractDecimalStrings,
    walletTokenActionCache,
    tokenPriceCache,
    loadWalletOverviewEntries,
    fetchTokenMarketSnapshot,
    formatTokenQuantity,
    resolveTopTokenChainEntry,
    buildWalletActionKeyboard
});
const { buildWalletDexOverviewText } = walletFeatures;
const { buildWalletBalanceTextInline, formatUserLabel } = createWalletInline({
    t,
    buildWalletDexOverviewText,
    formatCopyableValueHtml,
    escapeHtml
});
const {
    buildContractLookupUrl,
    maskApiKey,
    fetchDexOverviewForWallet,
    formatDexChainLabel,
    describeDexTokenValue,
    resolveTokenContractAddress,
    appendPortfolioLinkAndHint,
    buildWalletTokenButtonRows,
    buildWalletTokenMenu,
    sendWalletTokenExtraTexts,
    buildWalletTokenActionKeyboard,
    buildWalletTokenActionResult,
    fetchWalletTokenActionPayload,
    fetchWalletTokenHistoricalPricePayload,
    getWalletTokenHistoryWindowDays,
    applyWalletTokenHistoricalPriceWindow,
    applyWalletTokenPriceInfoHistoryWindow,
    buildWalletTokenHistoricalPriceFallbackQuery,
    buildOkxCandleBarFallbackVariants,
    isOkxBarParameterError,
    normalizeWalletTokenHistoryLimit,
    normalizeWalletTokenHistoryPeriod,
    resolveWalletTokenHistoryRequestPeriod,
    getWalletTokenHistoryBucketMs,
    getWalletTokenHistoryRequestPeriodMs,
    normalizeOkxCandleBar,
    convertWalletTokenCandlesToHistoryEntries,
    normalizeWalletTokenCandleHistoryEntry,
    buildOkxTokenQueryFromContext,
    resolveWalletTokenActionCacheTtl,
    buildWalletTokenActionCacheKey,
    normalizeWalletTokenCacheQuery,
    getWalletTokenActionCacheEntry,
    setWalletTokenActionCacheEntry,
    pruneWalletTokenActionCache,
    cloneJsonValue,
    isTelegramMessageNotModifiedError,
    extractOkxPayloadCursor,
    normalizeWalletTokenActionResult,
    buildWalletTokenPriceMetrics,
    buildWalletTokenPriceInfoMetrics,
    formatWalletTokenTimestamp,
    expandWalletTokenHistoryEntries,
    resampleWalletTokenHistoryEntries,
    sortWalletTokenHistoryEntries,
    getWalletTokenHistoryTimestampRaw,
    getWalletTokenHistoryTimestampValue,
    getWalletTokenHistoryPriceText,
    countDistinctWalletTokenHistoryPrices,
    formatWalletTokenHistoryEntry,
    formatWalletTokenPriceInfoEntry,
    buildWalletTokenCandleInsights,
    normalizeWalletTokenCandles,
    analyzeWalletTokenCandles,
    formatWalletTokenCandleSummary,
    formatWalletTokenCandleDetailLines,
    describeWalletTokenCandleTrend,
    formatCandleNumber,
    formatPercent,
    formatCandleVolume,
    buildWalletTokenTokenInfoEntries,
    formatWalletTokenTokenInfoValue,
    formatWalletTokenHolderEntry,
    formatWalletTokenTradeEntry,
    collectWalletHistoryEntries,
    summarizeWalletHistoryEntries,
    classifyWalletHistoryDirection,
    resolveWalletHistoryAmount,
    formatWalletHistoryEntry,
    formatTxhashDetail,
    resolveTxhashPrimaryAddress,
    buildTxhashActionSummary,
    normalizeTxStatusText,
    deriveTxFeeLabel,
    summarizeTokenTransfers,
    formatTxhashTotals,
    formatTxAddressDetails,
    formatInternalTxDetails,
    formatTokenTransferDetails,
    resolveKnownTokenAddress,
    resolveRegisteredTokenAddress,
    formatFiatValue,
    getTokenPriceInfo,
    buildUnregisterMenu,
    parseRegisterPayload
} = walletFeatures;

const txhashFlow = createTxhashFlow({
    fetchOkxTxhashDetail,
    collectTxhashChainEntries,
    sendMessageRespectingThread,
    sendReply,
    buildCloseKeyboard,
    splitTelegramMessageText,
    formatTxhashDetail,
    txhashWizardStates,
    t,
    bot,
    preferChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK
});
const {
    deliverTxhashDetail,
    buildTxhashHashPromptText,
    startTxhashFlow
} = txhashFlow;
const tokenFlow = createTokenFlow({
    normalizeAddressSafe,
    sendMessageRespectingThread,
    t,
    buildCloseKeyboard,
    formatDexChainLabel,
    fetchWalletTokenActionPayload,
    unwrapOkxFirst,
    pickOkxNumeric,
    normalizeWalletTokenActionResult,
    registerWalletTokenContext,
    buildWalletTokenMenu,
    sendWalletTokenExtraTexts,
    sendReply,
    bot,
    collectTxhashChainEntries,
    tokenWizardStates,
    preferChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK
});
const {
    deliverTokenDetail,
    buildTokenAddressPromptText,
    startTokenFlow
} = tokenFlow;

const tokenCommandDeps = {
    enforceOwnerCommandLimit,
    getLang,
    startTokenFlow
};
const contractCommandDeps = {
    enforceOwnerCommandLimit,
    getLang,
    normalizeAddress,
    contractWizardStates,
    sendReply,
    buildCloseKeyboard,
    buildContractLookupUrl,
    formatCopyableValueHtml,
    escapeHtml,
    t,
    bot
};
const okxChainsCommandDeps = {
    enforceOwnerCommandLimit,
    getLang,
    fetchOkxSupportedChains,
    sendReply,
    buildCloseKeyboard,
    t
};
const okx402CommandDeps = {
    enforceOwnerCommandLimit,
    getLang,
    fetchOkx402Supported,
    sendReply,
    buildCloseKeyboard,
    t
};
const txhashCommandDeps = {
    enforceOwnerCommandLimit,
    getLang,
    startTxhashFlow
};
const aiAudio = createAiAudio({
    bot,
    axios,
    fs,
    path,
    os,
    TELEGRAM_TOKEN,
    AI_IMAGE_DOWNLOAD_TIMEOUT_MS,
    resolveAudioFormatFromPath,
    sanitizeSecrets,
    writeWaveFileFromPcm,
    GEMINI_TTS_MODEL,
    GEMINI_TTS_VOICE,
    GEMINI_TTS_VOICES,
    GEMINI_TTS_SAMPLE_RATE,
    GEMINI_TTS_CHANNELS,
    GEMINI_TTS_BIT_DEPTH,
    OPENAI_TRANSCRIBE_MODEL,
    OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE,
    OPENAI_TTS_FORMAT
});
const {
    downloadTelegramFile,
    synthesizeGeminiSpeech,
    transcribeOpenAiAudio,
    synthesizeOpenAiSpeech
} = aiAudio;
const telegramDebugHelpers = createTelegramDebugHelpers({
    detectTelegramMessageType,
    collectTelegramFileIds,
    sendMessageRespectingThread,
    t,
    defaultLang,
    escapeHtml
});
const {
    sanitizeTelegramMessage,
    buildIdTelegramPayload,
    sendIdTelegramDetails,
    buildUserMention,
    buildAdminProfileLink,
    buildAdminUserIdLink
} = telegramDebugHelpers;

const checkinRuntime = createCheckinRuntime({
    t,
    defaultLang,
    escapeHtml,
    formatCopyableValueHtml,
    formatMarkdownTableBlock,
    HELP_TABLE_LAYOUT,
    buildBotStartLink,
    sendMessageRespectingThread,
    buildUserMention,
    scheduleMessageDeletion,
    sendEphemeralMessage,
    appendCloseButton,
    buildCloseKeyboard,
    buildAdminProfileLink,
    buildAdminUserIdLink,
    buildEmotionKeyboard,
    buildGoalKeyboard,
    sanitizeGoalInput,
    createShortToken,
    generateCheckinChallenge,
    createCheckinScheduler,
    normalizeAddressSafe,
    resolveNotificationLanguage,
    resolveGroupLanguage,
    resolveLangCode,
    isGroupAdminFlexible,
    getLang,
    db,
    listFeatureTopics: db.listFeatureTopics,
    bot,
    CHECKIN_MAX_ATTEMPTS,
    CHECKIN_DEFAULT_TIMEZONE,
    CHECKIN_DEFAULT_TIME,
    ADMIN_DETAIL_BULLET,
    CHECKIN_GOAL_PRESETS,
    SCIENCE_TEMPLATES,
    SCIENCE_ENTRIES,
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
    WELCOME_ENFORCEMENT_ACTIONS,
    WELCOME_QUEUE_INTERVAL_MS,
    WELCOME_QUEUE_MAX_PER_TICK,
    sanitizeWeightValue,
    formatTemplateWithVariables,
    getQuestionWeights,
    pickQuestionType,
    formatQuestionWeightPercentages,
    normalizeTimeSlot,
    sanitizeScheduleSlots,
    parseScheduleTextInput,
    listFeatureTopics: db.listFeatureTopics,
    getScheduleSlots,
    getSummaryScheduleSlots,
    getWelcomeVerificationSettings,
    saveWelcomeVerificationSettings,
    pendingCheckinChallenges,
    pendingEmotionPrompts,
    pendingGoalInputs,
    pendingWelcomeChallenges,
    checkinAdminStates,
    checkinAdminMenus,
    adminHubSessions,
    welcomeUserIndex,
    welcomeAdminMenus,
    randomFortunes,
    resolveScienceLang,
    getScienceEntriesByType,
    getScienceTemplate,
    renderScienceQuestion,
    buildScienceOptionTexts,
    shuffleArray,
    generateMathChallenge,
    generateScienceChallenge,
    ADMIN_MENU_SECTION_CONFIG,
    isGroupAdmin,
    filterGroupProfiles,
    sendReply
});
const {
    answerCheckinStartPrompt,
    buildAdminHubKeyboard,
    buildAdminHubText,
    buildAdminMenuKeyboard,
    buildCheckinKeyboard,
    buildLeaderboardHistoryLines,
    buildLeaderboardModeKeyboard,
    buildLeaderboardText,
    buildStartBotButton,
    buildWelcomeQuestionKeyboard,
    calculateInclusiveDayDiff,
    clearWelcomeChallenge,
    closeAdminMenu,
    confirmLeaderboardRemoval,
    confirmLeaderboardReset,
    disableAdminSummarySchedule,
    enqueueWelcomeVerification,
    executeAdminRemoval,
    executeAdminSummaryReset,
    executeAdminUnlock,
    formatCheckinTitleTemplate,
    formatDateForTimezone,
    formatDateTimeForTimezone,
    formatTimeForTimezone,
    formatWalletPreview,
    formatWelcomeActionLabel,
    formatWelcomeTitleTemplate,
    getGroupCheckinSettings,
    getLeaderboardPeriodStart,
    getSummaryPeriodStart,
    getSummaryWindowBounds,
    handleCheckinAnswerCallback,
    handleEmotionCallback,
    handleExportRequest,
    handleGoalCallback,
    handleGoalTextInput,
    handleWelcomeAnswer,
    initiateCheckinChallenge,
    launchWelcomeAdminFlow,
    normalizeDateInput,
    openAdminHub,
    pickLaterDateString,
    presentAdminLeaderboardManageList,
    presentAdminLeaderboardMemberDetail,
    presentAdminLeaderboardView,
    promptAdminForRemoval,
    promptAdminPoints,
    promptAdminSchedule,
    promptAdminSecretMessage,
    promptAdminSummaryReset,
    promptAdminSummarySchedule,
    promptAdminSummaryWindow,
    promptAdminUnlock,
    promptCheckinTitleTemplate,
    promptLeaderboardReset,
    resetAdminScheduleSlots,
    resetAdminSummarySchedule,
    resetCheckinTitleTemplate,
    resetWelcomeTitleTemplate,
    resolveAdminMenuView,
    resolveMemberProfile,
    sendAdminMenu,
    sendCheckinAnnouncement,
    sendCheckinDmFailureNotice,
    sendCheckinStartPrompt,
    presentCheckinTopics,
    presentWelcomeTopics,
    sendSummaryAnnouncement,
    sendSummaryWindowCheckinList,
    sendTodayCheckinList,
    sendWelcomeAdminMenu,
    setAdminDailyPoints,
    setAdminScheduleSlots,
    setAdminSummaryScheduleSlots,
    setAdminSummaryWindow,
    setCheckinTitleTemplate,
    setWelcomeAction,
    setWelcomeAttemptLimit,
    setWelcomeQuestionWeights,
    setWelcomeTimeLimit,
    setWelcomeTitleTemplate,
    startCheckinScheduler,
    startWelcomeQueueProcessor,
    subtractDaysFromDate,
    syncAdminSummaryScheduleWithAuto,
    toggleWelcomeVerification,
    truncateLabel
} = checkinRuntime;

const featureTopics = createFeatureTopicsHandlers({
    t,
    defaultLang,
    resolveGroupLanguage,
    isGroupAdmin,
    sendReply,
    db,
    presentCheckinTopics,
    presentWelcomeTopics,
    bot
});

const checkinAdminUi = createCheckinAdminUi({
    t,
    resolveNotificationLanguage,
    getGroupCheckinSettings,
    getWelcomeVerificationSettings,
    formatQuestionWeightPercentages,
    getQuestionWeights,
    QUESTION_WEIGHT_PRESETS,
    bot,
    formatWelcomeActionLabel,
    formatMarkdownTableBlock,
    HELP_TABLE_LAYOUT,
    escapeHtml,
    truncateLabel
});
const {
    showQuestionWeightMenu,
    showWelcomeWeightMenu,
    buildWelcomeAdminPayload
} = checkinAdminUi;
checkinRuntime.setWelcomeAdminPayloadBuilder(buildWelcomeAdminPayload);

const checkinAdminActions = createCheckinAdminActions({
    resolveNotificationLanguage,
    sanitizeWeightValue,
    db,
    t,
    showQuestionWeightMenu,
    sendEphemeralMessage
});
const {
    setAdminQuestionWeights,
    parseQuestionWeightsInput
} = checkinAdminActions;

const priceAlerts = createPriceAlerts({
    t,
    defaultLang,
    getLang,
    escapeHtml,
    bot,
    delay,
    shortenAddress,
    sendReply,
    sendMessageRespectingThread,
    buildCloseKeyboard,
    buildPaginatedChainKeyboard,
    sortChainsWithPriority,
    getChainIcon,
    collectTxhashChainEntries,
    resolveGroupLanguage,
    resolveTopicLanguage,
    resolveNotificationLanguage,
    isGroupAdmin,
    openAdminHub,
    adminHubSessions,
    formatMarkdownTableBlock,
    HELP_TABLE_LAYOUT,
    addFeatureTopic: db.addFeatureTopic,
    listFeatureTopics: db.listFeatureTopics,
    removeFeatureTopic: db.removeFeatureTopic,
    listPriceAlertTokenTopics: db.listPriceAlertTokenTopics,
    setPriceAlertTokenTopic: db.setPriceAlertTokenTopic,
    listPriceAlertTokens: db.listPriceAlertTokens,
    getPriceAlertToken: db.getPriceAlertToken,
    upsertPriceAlertToken: db.upsertPriceAlertToken,
    updatePriceAlertToken: db.updatePriceAlertToken,
    deletePriceAlertToken: db.deletePriceAlertToken,
    listDuePriceAlertTokens: db.listDuePriceAlertTokens,
    recordPriceAlertRun: db.recordPriceAlertRun,
    setPriceAlertTarget: db.setPriceAlertTarget,
    getPriceAlertTarget: db.getPriceAlertTarget,
    // Price alert media functions
    addPriceAlertMedia: db.addPriceAlertMedia,
    listPriceAlertMedia: db.listPriceAlertMedia,
    deletePriceAlertMedia: db.deletePriceAlertMedia,
    deleteAllPriceAlertMedia: db.deleteAllPriceAlertMedia,
    countPriceAlertMedia: db.countPriceAlertMedia,
    // Price alert title functions
    addPriceAlertTitle: db.addPriceAlertTitle,
    listPriceAlertTitles: db.listPriceAlertTitles,
    deletePriceAlertTitle: db.deletePriceAlertTitle,
    deleteAllPriceAlertTitles: db.deleteAllPriceAlertTitles,
    countPriceAlertTitles: db.countPriceAlertTitles,
    fetchTokenPriceOverview,
    PRICE_ALERT_DEFAULT_INTERVAL,
    PRICE_ALERT_POLL_INTERVAL_MS,
    PRICE_ALERT_MAX_PER_TICK,
    PRICE_ALERT_RATE_LIMIT_MS
});
const {
    handlePriceCommand,
    handlePriceTargetCommand,
    handlePriceUnsubscribeCommand,
    handlePriceCallback,
    handlePriceWizardMessage,
    sendPriceAdminMenu,
    startPriceAlertScheduler
} = priceAlerts;

const languageHubSessions = new Map();


function startTelegramBot() {

    async function registerBaseCommands() {
        const commandKeys = [
            'start',
            'lang',
            'help',
            'ai',
            'random',
            'mywallet',
            'ping'
        ];

        const sanitizeDescription = (rawText, fallback = '') => {
            const base = (rawText || '').toString().trim() || (fallback || '').toString().trim();
            const normalized = base.replace(/\s+/g, ' ');
            if (normalized.length < 3) {
                return fallback ? fallback.slice(0, 256) : '';
            }
            return normalized.slice(0, 256);
        };

        const scopes = [
            { type: 'default' },
            { type: 'all_private_chats' },
            { type: 'all_group_chats' },
            { type: 'all_chat_administrators' }
        ];

        const localesDir = path.join(__dirname, 'locales');
        const languageCodes = Array.from(new Set(
            fs.readdirSync(localesDir)
                .filter((file) => file.endsWith('.json'))
                .map((file) => resolveLangCode(file.replace('.json', '')))
        ));

        for (const langCode of languageCodes) {
            const commands = commandKeys
                .map((key) => HELP_COMMAND_DETAILS[key])
                .filter(Boolean)
                .map((detail) => {
                    const commandName = detail.command.replace('/', '');
                    const fallbackDesc = detail.command.replace(/^\//, '') || detail.descKey || commandName;
                    return {
                        command: commandName,
                        description: sanitizeDescription(t(langCode, detail.descKey), fallbackDesc)
                    };
                })
                .filter((entry) => Boolean(entry.description));

            if (!commands.length) {
                continue;
            }

            for (const scope of scopes) {
                try {
                    await bot.setMyCommands(commands, { scope, language_code: langCode });
                } catch (error) {
                    const body = error?.response?.body ? ` | body=${JSON.stringify(error.response.body)}` : ''; // eslint-disable-line no-await-in-loop
                    console.error(`[Bot] Failed to register commands for scope ${scope?.type} lang=${langCode}: ${error.message}${body}`);
                }
            }
        }
    }

    registerBaseCommands();

    // Register modular commands from CommandRegistry
    const modularCommands = commandRegistry.list();
    for (const cmd of modularCommands) {
        const pattern = new RegExp(`^\\/${cmd.name}(?:@[\\w_]+)?(?:\\s+(.*))?$`, 'is');
        bot.onText(pattern, async (msg, match) => {
            const argsText = (match && match[1]) || '';
            const args = argsText.split(/\s+/).filter(Boolean);
            const userId = msg.from?.id?.toString();
            const username = msg.from?.username || '';

            // Get language
            const stored = userId ? await db.getUserLanguage(userId) : null;
            const lang = stored?.language || resolveLangCode(msg.from?.language_code || 'vi');

            // Check VIP bypass
            const isVip = isOwner(userId, username) || await db.isCoOwner(userId);

            // Check cooldown
            const cooldownCheck = commandRegistry.checkCooldown(userId, cmd.name, { bypass: isVip });
            if (!cooldownCheck.allowed) {
                const seconds = Math.ceil(cooldownCheck.remainingMs / 1000);
                await sendReply(msg, t(lang, 'command_cooldown', { time: `${seconds}s` }));
                return;
            }

            // Track recent
            if (!msg._recentTracked) {
                commandRegistry.trackRecent(userId, cmd.name);
                msg._recentTracked = true;
            }

            // Execute
            const startTime = Date.now();
            let hasError = false;
            try {
                await cmd.handler(msg, { args, argsText, lang, command: cmd });
            } catch (error) {
                hasError = true;
                console.error(`[ModularCmd] Error in /${cmd.name}:`, error.message);
                await sendReply(msg, t(lang, 'command_execution_error'));
            }

            // Record stats
            commandRegistry.recordStats(cmd.name, Date.now() - startTime, hasError);
        });

        // Also register aliases
        for (const alias of cmd.aliases || []) {
            const aliasPattern = new RegExp(`^\\/${alias}(?:@[\\w_]+)?(?:\\s+(.*))?$`, 'is');
            bot.onText(aliasPattern, async (msg, match) => {
                const argsText = (match && match[1]) || '';
                const args = argsText.split(/\s+/).filter(Boolean);
                const userId = msg.from?.id?.toString();
                const username = msg.from?.username || '';

                const stored = userId ? await db.getUserLanguage(userId) : null;
                const lang = stored?.language || resolveLangCode(msg.from?.language_code || 'vi');

                const isVip = isOwner(userId, username) || await db.isCoOwner(userId);
                const cooldownCheck = commandRegistry.checkCooldown(userId, cmd.name, { bypass: isVip });
                if (!cooldownCheck.allowed) {
                    const seconds = Math.ceil(cooldownCheck.remainingMs / 1000);
                    await sendReply(msg, t(lang, 'command_cooldown', { time: `${seconds}s` }));
                    return;
                }

                if (!msg._recentTracked) {
                    commandRegistry.trackRecent(userId, cmd.name);
                    msg._recentTracked = true;
                }

                const startTime = Date.now();
                let hasError = false;
                try {
                    await cmd.handler(msg, { args, argsText, lang, command: cmd });
                } catch (error) {
                    hasError = true;
                    console.error(`[ModularCmd] Error in /${alias} (→/${cmd.name}):`, error.message);
                    await sendReply(msg, t(lang, 'command_execution_error'));
                }
                commandRegistry.recordStats(cmd.name, Date.now() - startTime, hasError);
            });
        }
    }
    console.log(`[Bot] Registered ${modularCommands.length} modular commands with ${modularCommands.reduce((sum, c) => sum + (c.aliases?.length || 0), 0)} aliases`);


    const {
        buildApiHubMenu,
        handleAiApiSubmission,
        handleApiCommand,
        renderAiApiMenuMessage,
        renderApiHubMessage,
        startAiApiAddPrompt
    } = createAiApiHandlers({
        t,
        bot,
        db,
        getLang,
        buildCloseKeyboard,
        maskApiKey,
        escapeHtml
    });

    function pickStartVideo() {
        if (startVideoFileIds.length) {
            const index = Math.floor(Math.random() * startVideoFileIds.length);
            return startVideoFileIds[index];
        }
        return null;
    }

    function disableStartVideo(videoId, error) {
        if (!videoId) {
            return;
        }

        const index = startVideoFileIds.indexOf(videoId);
        if (index === -1) {
            return;
        }

        startVideoFileIds.splice(index, 1);
        const reason = error?.message ? ` (${error.message})` : '';
        console.warn(`[Start] Disabled intro video ID after failure: ${videoId}${reason}`);
    }

    async function sendAiIntroMedia(msg, lang, caption, replyMarkup = null) {
        if (!startVideoFileIds.length) {
            return false;
        }

        const startVideo = pickStartVideo();
        if (!startVideo) {
            return false;
        }

        const videoOptions = buildThreadedOptions(msg, {
            caption,
            parse_mode: 'Markdown',
            reply_markup: replyMarkup || undefined
        });

        try {
            await bot.sendVideo(msg.chat.id, startVideo, videoOptions);
            return true;
        } catch (error) {
            console.error(`[AI] Failed to send intro media: ${error.message}`);
            disableStartVideo(startVideo, error);
        }

        return false;
    }

    const {
        handleAiCommand,
        handleAiTtsCommand,
        runAiRequestWithProvider,
        handleAiaCommand,
        handleAiUsageDashboard,
        setUserPersona,
        getUserPersona,
        AI_PERSONAS,
        buildPersonaKeyboard,
        promptCustomPersonaInput,
        handleCustomPersonaReply,
        getPersonaLabel
    } = createAiHandlers({
        t,
        bot,
        db,
        getLang,
        sendReply,
        sendMessageRespectingThread,
        buildCloseKeyboard,
        buildThreadedOptions,
        extractAudioSourceFromMessage,
        ensureDeviceInfo,
        buildDeviceTargetId,
        sendAiIntroMedia,
        enforceOwnerCommandLimit,
        synthesizeGeminiSpeech,
        downloadTelegramFile,
        resolveAudioMimeType
    });

    // Register auto-detection for /aib (Option 4 - Smart Hybrid + Confirmation)
    registerAutoDetection({
        bot,
        handleAiaCommand,
        handleAiCommand,
        handleCustomPersonaReply,
        handlePriceWizardMessage,
        t,
        scheduleMessageDeletion,
        getLang
    });

    const {
        handleRegisterCommand,
        handleMyWalletCommand,
        handleUnregisterCommand,
        handleWalletManagerCommand,
        startRegisterWizard,
        sendWalletManagerMenu
    } = createWalletCommandHandlers({
        enforceOwnerCommandLimit,
        getLang,
        sendReply,
        bot,
        parseRegisterPayload,
        buildWalletActionKeyboard,
        buildCloseKeyboard,
        buildWalletSelectMenu,
        buildWalletManagerMenu,
        buildPortfolioEmbedUrl,
        db,
        t,
        escapeHtml,
        shortenAddress,
        registerWizardStates
    });

    const { handleStartNoToken } = createStartHandlers({
        bot,
        t,
        getLang,
        buildThreadedOptions,
        sendReply,
        enforceOwnerCommandLimit,
        pickStartVideo,
        disableStartVideo,
        sendAiIntroMedia
    });
    const {
        handleAdminCommand,
        ensureAdminOrOwner,
        getAdminTargetChatId,
        sendModerationAdminPanel,
        launchAdminHelpMenu,
        buildAdminCommandDetail,
        getAdminContextChatId,
        clearAdminContext
    } = createAdminHandlers({
        bot,
        t,
        db,
        defaultLang,
        HELP_COMMAND_DETAILS,
        formatCommandLabel,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        getLang,
        isUserAdmin,
        isGroupAdmin,
        hasOwnerOverride,
        rememberAdminChat,
        enforceOwnerCommandLimit,
        sendReply,
        openAdminHub,
        sendAdminMenu,
        escapeHtml
    });

    registerFeatureTopicCommands({ bot, enforceBanForMessage, featureTopics });
    registerAdminCommands({
        bot,
        enforceBanForMessage,
        handleAdminCommand,
        launchWelcomeAdminFlow,
        getLang,
        sendReply,
        t
    });
    registerModerationCommands({
        bot,
        enforceBanForMessage,
        ensureAdminOrOwner,
        getAdminTargetChatId,
        parseTargetFromCommand,
        resolveTargetId,
        getGroupSettings,
        parseDuration,
        clearScheduledUnmute,
        scheduleAutomaticUnmute,
        getWarnState,
        applyWarnAction,
        ensureFilterState,
        getFilterState,
        normalizeFilterResponse,
        filterSetupStates,
        escapeHtml,
        resolveUserProfile,
        getLang,
        t,
        resolveGroupLanguage,
        defaultLang,
        isGroupAdmin,
        db,
        openAdminHub,
        sendWelcomeAdminMenu,
        sendReply
    });
    const handleIdTelegramCommand = createIdTelegramHandler({
        bot,
        getLang,
        collectTelegramFileIds,
        sendIdTelegramDetails,
        idTelegramSessions,
        t,
        sendReply
    });
    registerRandomCommands({
        bot,
        enforceBanForMessage,
        enforceDoremonLimit,
        getLang,
        t,
        escapeHtml,
        formatExecutionAudit,
        buildRandomMenuText,
        buildRandomMenuKeyboard,
        randomizeTextCase,
        generateLongShortOutcome,
        getRandomInt,
        parseMemorySizeInput,
        createMemoryGame,
        createMinesweeperGame,
        parseTreasureSizeInput,
        createTreasureGame,
        getGomokuUserDifficulty,
        parseGomokuSizeInput,
        createGomokuGame,
        createChessGame,
        setChessMessageContext,
        parseSudokuSizeInput,
        createSudokuGame,
        determineRpsResult,
        buildRpsKeyboard,
        parseDiceNotation,
        rollDice,
        formatRollContext,
        formatDiceDetail,
        generateCheckinChallenge,
        storeRandomQuiz,
        buildQuizKeyboard,
        pickRandomFortune,
        buildRandomResultKeyboard,
        buildFortuneKeyboard,
        randomFortunes,
        sendReply,
        buildRandomGameText
    });
    registerUtilityCommands({
        bot,
        enforceBanForMessage,
        ensureAdminOrOwner,
        getLang,
        launchAdminHelpMenu,
        parseTargetFromCommand,
        resolveTargetId,
        resolveUserProfile,
        sendReply,
        t,
        sendIdTelegramDetails,
        collectTelegramFileIds,
        idTelegramSessions,
        handleIdTelegramCommand
    });

    const {
        handleDonateCommand,
        handleDonateDevCommand,
        handleDonateCommunityManageCommand
    } = createDonateHandlers({
        bot,
        t,
        db,
        getLang,
        sendReply,
        buildDonateMessage,
        buildDonateKeyboard,
        buildCloseKeyboard,
        COMMUNITY_WALLET_ADDRESS,
        isGroupAdmin,
        escapeHtml,
        enforceOwnerCommandLimit
    });
    setImmediate(() => registerCoreCommands({
        bot,
        enforceBanForMessage,
        enforceOwnerCommandLimit,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        sendMessageRespectingThread,
        handleDonateCommand,
        handleDonateDevCommand,
        handleDonateCommunityManageCommand,
        initiateCheckinChallenge,
        sendCheckinStartPrompt,
        sendCheckinDmFailureNotice,
        t,
        buildLeaderboardText,
        handleOkxChainsCommand,
        okxChainsCommandDeps,
        handleOkx402StatusCommand,
        okx402CommandDeps,
        handleTxhashCommand,
        txhashCommandDeps,
        handleTokenCommand,
        tokenCommandDeps,
        handleTopTokenCommand,
        handleContractCommand,
        contractCommandDeps,
        handlePriceCommand,
        handlePriceTargetCommand,
        handlePriceUnsubscribeCommand,
        handleStartNoToken,
        handleRmchatCommand,
        handleRegisterCommand,
        handleWalletManagerCommand,
        handleUnregisterCommand,
        isOwner,
        registerCoOwner,
        OWNER_PASSWORD,
        resetOwnerPasswordAttempts,
        recordOwnerPasswordFailure,
        ownerPasswordPrompts,
        ownerActionStates,
        getLang,
        sendReply,
        buildOwnerMenuText,
        buildOwnerMenuKeyboard,
        getDefaultOwnerGroup,
        buildCloseKeyboard,
        handleLangCommand,
        handleLanguageCommand,
        handleTopicLanguageCommand,
        getDefaultHelpGroup,
        buildHelpText,
        buildHelpKeyboard,
        saveHelpMessageState,
        handleAiaCommand
    }));

    const helpCommandExecutors = createHelpExecutors({
        bot,
        t,
        commandRegistry,
        buildSyntheticCommandMessage,
        handleStartNoToken,
        handleIdTelegramCommand,
        handleAiCommand,
        handleApiCommand,
        startRegisterWizard,
        handleMyWalletCommand,
        handleRmchatCommand,
        handleDonateCommand,
        buildRandomMenuText,
        buildRandomMenuKeyboard,
        handleOkxChainsCommand,
        okxChainsCommandDeps,
        handleOkx402StatusCommand,
        okx402CommandDeps,
        handleTopTokenCommand,
        handleTxhashCommand,
        txhashCommandDeps,
        handleContractCommand,
        contractCommandDeps,
        handleTokenCommand,
        tokenCommandDeps,
        handlePriceCommand,
        handleUnregisterCommand,
        handleLangCommand,
        handleLanguageCommand,
        handleTopicLanguageCommand,
        initiateCheckinChallenge,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        buildLeaderboardText,
        sendMessageRespectingThread,
        handleAdminCommand,
        getAdminContextChatId,
        getHelpMessageState,
        openAdminHub,
        sendModerationAdminPanel,
        buildAdminCommandDetail,
        launchWelcomeAdminFlow,
        extractThreadId
    });

    bot.on('callback_query', async (query) => {
        const queryId = query.id;
        const messageChatId = query.message?.chat?.id;
        const chatId = messageChatId ? messageChatId.toString() : null;
        const fallbackLang = resolveLangCode(query.from?.language_code || defaultLang);
        const lang = query.message ? await getLang(query.message) : fallbackLang;
        const callbackLang = await resolveNotificationLanguage(chatId || query.from.id, lang || fallbackLang);

        await ensureDeviceInfo(query);

        if (await enforceBanForCallback(query, callbackLang)) {
            return;
        }

        // ==============================================
        // SMART CONFIRMATION - Handle auto-detection confirmations
        // ==============================================
        const autoConfirmAction = query.data?.startsWith('autoconfirm|') ? query.data.split('|') : null;
        if (autoConfirmAction && autoConfirmAction.length > 1) {
            const command = autoConfirmAction[1];
            const params = autoConfirmAction[2] || '';

            // Get original message text from reply_to_message or from pending confirmations
            let originalText = query.message?.reply_to_message?.text || query.message?.reply_to_message?.caption || '';
            let originalMsg = query.message?.reply_to_message;

            // Fallback: get from pending confirmations if reply_to_message not available
            if (!originalText && query.message?.chat?.id && query.message?.message_id) {
                const pendingData = getPendingConfirmation(query.message.chat.id, query.message.message_id);
                if (pendingData?.originalMsg) {
                    originalMsg = pendingData.originalMsg;
                    originalText = pendingData.originalMsg.text || pendingData.originalMsg.caption || '';
                    console.log('[AutoConfirm] ✓ Retrieved original text from pending confirmations');
                }
            }

            // Handle cancel - route to /aib instead of just deleting
            if (command === 'cancel') {
                // Clear pending confirmation
                if (query.message?.chat?.id && query.message?.message_id) {
                    clearPendingConfirmation(query.message.chat.id, query.message.message_id);
                }

                // Delete confirmation message
                if (query.message?.message_id) {
                    bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { });
                }

                if (originalText) {
                    // Route through /aib for AI response
                    console.log('[AutoConfirm] ✓ Cancel pressed, routing to /aib:', originalText.slice(0, 50) + '...');

                    // Create synthetic message for /aib
                    const syntheticMsg = {
                        ...(originalMsg || {}),
                        chat: query.message.chat,
                        from: query.from,
                        message_thread_id: originalMsg?.message_thread_id || query.message?.message_thread_id,
                        text: `/aib ${originalText}`,
                        entities: [{ type: 'bot_command', offset: 0, length: 4 }]
                    };

                    // Process as /aib command
                    const syntheticUpdate = {
                        update_id: Date.now(),
                        message: syntheticMsg
                    };
                    bot.processUpdate(syntheticUpdate);

                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'confirm_cancelled') || '❌ Đã hủy, bot sẽ trả lời bình thường' });
                } else {
                    console.log('[AutoConfirm] ✓ Cancel pressed, no original text found');
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'confirm_cancelled') || '❌ Đã hủy' });
                }
                return;
            }

            // Delete confirmation message (for non-cancel actions)
            if (query.message?.message_id) {
                bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { });
            }



            // Build and execute command
            let commandText;
            switch (command) {
                case 'roll':
                    commandText = `/roll ${params || '1d6'}`;
                    break;
                case 'rps':
                    commandText = params ? `/rps ${params}` : '/rps';
                    break;
                case 'gomoku':
                    commandText = '/gomoku';
                    break;
                case 'rand':
                    commandText = params ? `/rand ${params}` : '/rand';
                    break;
                case 'long':
                    commandText = params ? `/rand long/short ${params}` : '/rand long/short';
                    break;
                case 'td':
                    commandText = '/td';
                    break;
                case 'doremon':
                    commandText = '/doremon';
                    break;
                case 'mines':
                    commandText = params ? `/mines ${params}` : '/mines';
                    break;
                case 'memory':
                    commandText = params ? `/memory ${params}` : '/memory';
                    break;
                case 'sudoku':
                    commandText = params ? `/sudoku ${params}` : '/sudoku';
                    break;
                case 'chess':
                    commandText = '/chess';
                    break;
                case 'treasure':
                    commandText = params ? `/treasure ${params}` : '/treasure';
                    break;
                default:
                    commandText = null;
            }

            if (commandText) {
                console.log('[AutoConfirm] ✓ Executing confirmed command:', commandText);

                // Create synthetic message from original context
                const syntheticMsg = {
                    ...query.message,
                    from: query.from,
                    text: commandText,
                    entities: [{ type: 'bot_command', offset: 0, length: commandText.split(' ')[0].length }]
                };

                // Process as command
                const syntheticUpdate = {
                    update_id: Date.now(),
                    message: syntheticMsg
                };
                bot.processUpdate(syntheticUpdate);

                await bot.answerCallbackQuery(queryId, { text: '▶️ Đang thực thi...' });
            } else {
                await bot.answerCallbackQuery(queryId, { text: '❓ Lệnh không xác định' });
            }

            return;
        }

        // ==============================================
        // VOICE COMMAND CONFIRMATION - Handle voice function call confirmations
        // ==============================================
        const voiceConfirmAction = query.data?.startsWith('voiceconfirm|') ? query.data.split('|') : null;
        if (voiceConfirmAction && voiceConfirmAction.length > 2) {
            const action = voiceConfirmAction[1];
            const token = voiceConfirmAction[2];

            // Get stored context
            const pendingData = pendingVoiceCommands.get(token);
            if (!pendingData) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'voice_confirm_expired') || '⏰ Request expired', show_alert: true });
                return;
            }

            const { msg, lang: originalLang, toolCalls, inputTranscript, audioContext } = pendingData;

            // Delete confirmation message
            if (query.message?.message_id) {
                bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { });
            }

            // Clear pending data
            pendingVoiceCommands.delete(token);

            if (action === 'cancel') {
                // User wants normal response - re-process audio without function calling
                console.log('[VoiceConfirm] Cancel pressed, re-processing for normal response');
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'voice_confirm_cancelled') || '❌ Cancelled, processing normal reply...' });

                try {
                    // Re-process audio WITHOUT function calling
                    const liveToolsNoFunctions = buildLiveTools(true, false); // Search ON, functions OFF

                    const result = await processAudioWithLiveAPI(audioContext.audioBuffer, audioContext.apiKey, {
                        language: audioContext.ttsLanguage,
                        voice: audioContext.selectedVoice,
                        enableThinking: false,
                        thinkingBudget: 0,
                        enableInputTranscription: true,
                        enableOutputTranscription: true,
                        enableAffectiveDialog: false,
                        customInstruction: audioContext.customContext,
                        tools: liveToolsNoFunctions
                    });

                    if (result?.audioPath) {
                        // Send audio response
                        const caption = `🎙️ ${t(originalLang, 'ai_live_audio_response') || 'AI Voice Response'}`;
                        const voiceOptions = buildThreadedOptions(msg, { caption });

                        try {
                            await bot.sendAudio(msg.chat.id, result.audioPath, voiceOptions, {
                                filename: require('path').basename(result.audioPath),
                                contentType: 'audio/wav'
                            });
                        } catch (sendError) {
                            const errMsg = (sendError?.message || '').toLowerCase();
                            if (errMsg.includes('thread not found') || errMsg.includes('topic')) {
                                const { message_thread_id, ...fallbackOptions } = voiceOptions;
                                await bot.sendAudio(msg.chat.id, result.audioPath, fallbackOptions, {
                                    filename: require('path').basename(result.audioPath),
                                    contentType: 'audio/wav'
                                });
                            } else {
                                throw sendError;
                            }
                        }

                        // Cleanup
                        try {
                            await require('fs').promises.unlink(result.audioPath);
                        } catch (e) { }
                    } else {
                        await bot.sendMessage(msg.chat.id, t(originalLang, 'ai_live_audio_error') || '⚠️ Voice processing failed.', buildThreadedOptions(msg, {}));
                    }
                } catch (error) {
                    console.error('[VoiceConfirm] Re-processing failed:', error.message);
                    await bot.sendMessage(msg.chat.id, t(originalLang, 'ai_live_audio_error') || '⚠️ Voice processing failed.', buildThreadedOptions(msg, {}));
                }

                return;
            }

            if (action === 'execute') {
                // Execute the function
                console.log('[VoiceConfirm] Execute pressed, running function');
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'voice_confirm_executing') || '▶️ Executing...' });

                try {
                    const toolCall = toolCalls[0];
                    const funcName = toolCall.name;
                    const funcArgs = toolCall.args || {};

                    // Execute the function
                    const result = executeVoiceFunctionCall(funcName, funcArgs);

                    // Format result message based on function
                    let resultText = '';
                    if (funcName === 'get_fortune') {
                        resultText = `🔮 <b>${t(originalLang, 'fortune_title') || 'Fortune'}</b>\n\n${result.fortune}\n\n<i>Category: ${result.category}</i>`;
                    } else if (funcName === 'roll_dice') {
                        const rollDetails = result.results.join(' + ');
                        resultText = `🎲 <b>${t(originalLang, 'dice_result') || 'Dice Result'}</b>\n\n${result.dice}: [${rollDetails}] = <b>${result.total}</b>`;
                    } else if (funcName === 'get_current_time') {
                        resultText = `🕐 <b>${t(originalLang, 'time_result') || 'Current Time'}</b>\n\n${result.datetime}\n\n<i>Timezone: ${result.timezone}</i>`;
                    } else if (funcName === 'flip_coin') {
                        const coinIcon = result.result === 'heads' ? '🔵' : '🔴';
                        resultText = `🪙 <b>${t(originalLang, 'coin_result') || 'Coin Flip'}</b>\n\n${coinIcon} ${result.result.toUpperCase()}`;
                    } else if (funcName === 'get_bot_introduction') {
                        resultText = `🤖 <b>${t(originalLang, 'bot_intro_title') || 'About Me'}</b>\n\n${result.introduction}\n\n👨‍💻 ${t(originalLang, 'developer') || 'Developer'}: <b>${result.developer}</b>\n🔗 ${result.contact}`;
                    } else {
                        resultText = `✅ <b>Result</b>\n\n<pre>${JSON.stringify(result, null, 2)}</pre>`;
                    }

                    // Add transcript if available
                    if (inputTranscript) {
                        resultText = `💬 <i>"${inputTranscript.trim().substring(0, 80)}${inputTranscript.length > 80 ? '...' : ''}"</i>\n\n${resultText}`;
                    }

                    await bot.sendMessage(msg.chat.id, resultText, buildThreadedOptions(msg, { parse_mode: 'HTML' }));
                } catch (error) {
                    console.error('[VoiceConfirm] Function execution failed:', error.message);
                    await bot.sendMessage(msg.chat.id, `⚠️ ${t(originalLang, 'voice_confirm_error') || 'Function execution failed'}`, buildThreadedOptions(msg, {}));
                }

                return;
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        const apiHubAction = query.data?.startsWith('apihub|') ? query.data.split('|') : null;
        if (apiHubAction && apiHubAction.length > 1) {
            const step = apiHubAction[1];
            const providerArg = apiHubAction[2];
            const pageArg = Number(apiHubAction[3]) || 0;
            const userId = query.from?.id?.toString();

            if (step === 'home') {
                if (userId) {
                    await renderApiHubMessage(query.message, callbackLang, userId, { chatId });
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (step === 'ai') {
                const provider = normalizeAiProvider(providerArg || 'google');
                if (userId) {
                    await renderAiApiMenuMessage(query.message, callbackLang, userId, provider, pageArg, {
                        backCallbackData: 'apihub|home',
                        provider,
                        chatId
                    });
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        const ttsSettingsAction = query.data?.startsWith('ttssettings|') ? query.data.split('|') : null;
        if (ttsSettingsAction && ttsSettingsAction.length > 1) {
            const userId = query.from?.id?.toString();
            const currentPage = Number(ttsSettingsAction[1]) || 0;
            const settings = await getUserTtsConfig(userId);
            const panelText = buildTtsSettingsText(callbackLang, settings);
            const replyMarkup = buildTtsSettingsKeyboard(callbackLang, settings, {
                backCallbackData: `aiapi|open|google|${currentPage}`
            });

            try {
                if (query.message) {
                    await bot.editMessageText(panelText, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        reply_markup: replyMarkup
                    });
                }
            } catch (error) {
                console.warn(`[AI] Failed to render TTS settings: ${error.message}`);
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        const aiApiAction = query.data?.startsWith('aiapi|') ? query.data.split('|') : null;
        if (aiApiAction && aiApiAction.length > 1) {
            const userId = query.from?.id?.toString();
            const action = aiApiAction[1];
            const provider = normalizeAiProvider(aiApiAction[2] || 'google');
            const pageArg = Number(aiApiAction[3]) || 0;
            const menuState = getAiApiMenuState(query.message);
            const backCallbackData = menuState?.backCallbackData;

            if (action === 'noop') {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'open' || action === 'page') {
                if (userId) {
                    await renderAiApiMenuMessage(query.message, callbackLang, userId, provider, pageArg, { backCallbackData, provider });
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'copy') {
                const keyId = aiApiAction[3];
                const currentPage = Number(aiApiAction[4]) || 0;

                if (userId && keyId) {
                    const keyEntry = await db.getUserAiKey(userId, keyId);
                    if (keyEntry?.apiKey) {
                        const meta = buildAiProviderMeta(callbackLang, keyEntry.provider || provider);
                        const name = keyEntry.name && keyEntry.name.trim()
                            ? escapeHtml(keyEntry.name.trim())
                            : t(callbackLang, 'ai_api_default_name');
                        const copyText = [
                            `${meta.icon} ${t(callbackLang, 'ai_api_copy_title', { provider: meta.label, name })}`,
                            `<code>${escapeHtml(keyEntry.apiKey)}</code>`,
                            t(callbackLang, 'ai_api_copy_notice')
                        ]
                            .filter(Boolean)
                            .join('\n');

                        await bot.sendMessage(userId, copyText, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });

                        if (query.message) {
                            await renderAiApiMenuMessage(query.message, callbackLang, userId, provider, currentPage, {
                                backCallbackData,
                                provider
                            });
                        }

                        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_api_copy_sent'), show_alert: true });
                        return;
                    }
                }

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_api_copy_missing'), show_alert: true });
                return;
            }

            if (action === 'del') {
                const keyId = aiApiAction[3];
                const currentPage = Number(aiApiAction[4]) || 0;
                if (userId && keyId) {
                    await db.deleteUserAiKey(userId, keyId);
                    await renderAiApiMenuMessage(query.message, callbackLang, userId, provider, currentPage, {
                        backCallbackData,
                        provider
                    });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_api_deleted') });
                    return;
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'add') {
                try {
                    await startAiApiAddPrompt(query.from.id, callbackLang, provider);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_api_add_dm'), show_alert: true });
                } catch (error) {
                    console.warn(`[AI API] Cannot DM ${query.from.id}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_dm_blocked'), show_alert: true });
                }
                return;
            }

            if (action === 'default') {
                if (userId) {
                    await db.setUserAiProvider(userId, provider);
                    if (query.message) {
                        await renderAiApiMenuMessage(query.message, callbackLang, userId, provider, pageArg, {
                            backCallbackData,
                            provider
                        });
                    }
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_provider_saved', { provider: buildAiProviderMeta(callbackLang, provider).label }) });
                    return;
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        const aiProviderAction = query.data?.startsWith('aiselect|') ? query.data.split('|') : null;
        if (aiProviderAction && aiProviderAction.length > 2) {
            const provider = normalizeAiProvider(aiProviderAction[1]);
            const token = aiProviderAction[2];
            const session = aiProviderSelectionSessions.get(token);
            const requesterId = query.from?.id?.toString();

            if (!session || !requesterId || session.userId !== requesterId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (session.createdAt && Date.now() - session.createdAt > 10 * 60 * 1000) {
                aiProviderSelectionSessions.delete(token);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_session_expired'), show_alert: true });
                return;
            }

            aiProviderSelectionSessions.delete(token);
            await db.setUserAiProvider(session.userId, provider);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_provider_saved', { provider: buildAiProviderMeta(callbackLang, provider).label }) });

            await runAiRequestWithProvider({
                msg: session.msg,
                lang: session.lang || callbackLang,
                provider,
                promptText: session.promptText,
                photos: session.photos,
                hasPhoto: session.hasPhoto,
                audioSource: session.audioSource,
                hasAudio: session.hasAudio,
                userId: session.userId,
                deviceTargetId: session.deviceTargetId,
                usageDate: session.usageDate,
                googleUserKeys: session.googleUserKeys,
                groqUserKeys: session.groqUserKeys,
                openAiUserKeys: session.openAiUserKeys
            });
            return;
        }

        const ttsVoiceAction = query.data?.startsWith('ttsvoice|') ? query.data.split('|') : null;
        if (ttsVoiceAction && ttsVoiceAction.length > 1) {
            const userId = query.from?.id?.toString();
            const voice = ttsVoiceAction[1];
            const settings = await saveUserTtsVoice(userId, voice);
            const text = buildTtsSettingsText(callbackLang, settings);
            try {
                if (query.message) {
                    await bot.editMessageText(text, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        reply_markup: buildTtsSettingsKeyboard(callbackLang, settings, { backCallbackData: 'apihub|ai|google|0' })
                    });
                }
            } catch (error) {
                // ignore edit errors
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_tts_voice_saved', { voice: settings.voice }) });
            return;
        }

        const ttsLangAction = query.data?.startsWith('ttslang|') ? query.data.split('|') : null;
        if (ttsLangAction && ttsLangAction.length > 1) {
            const userId = query.from?.id?.toString();
            const language = ttsLangAction[1];
            const settings = await saveUserTtsLanguage(userId, language);
            const text = buildTtsSettingsText(callbackLang, settings);
            try {
                if (query.message) {
                    await bot.editMessageText(text, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        reply_markup: buildTtsSettingsKeyboard(callbackLang, settings, { backCallbackData: 'apihub|ai|google|0' })
                    });
                }
            } catch (error) {
                // ignore edit errors
            }
            const langLabel = settings.language === 'auto' ? t(callbackLang, 'ai_tts_lang_auto') : settings.language;
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_tts_language_saved', { language: langLabel }) });
            return;
        }

        // Gemini Model Selection callback handler
        const geminiModelAction = query.data?.startsWith('geminimodel|') ? query.data.split('|') : null;
        if (geminiModelAction && geminiModelAction.length > 1) {
            const userId = query.from?.id?.toString();
            const action = geminiModelAction[1];
            const value = geminiModelAction[2];

            if (action === 'noop') {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'select') {
                // Show model selection menu
                const modelConfig = getUserGeminiModelConfig(userId);
                const text = buildGeminiModelSelectionText(callbackLang, modelConfig.modelFamily, modelConfig.thinkingLevel);
                const keyboard = buildGeminiModelSelectionKeyboard(callbackLang, modelConfig.modelFamily, modelConfig.thinkingLevel);
                try {
                    if (query.message) {
                        await bot.editMessageText(text, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    }
                } catch (error) {
                    console.warn(`[AI] Failed to render model selection: ${error.message}`);
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'set') {
                // Set model family
                const result = saveUserGeminiModel(userId, value);
                const text = buildGeminiModelSelectionText(callbackLang, result.modelFamily, result.thinkingLevel);
                const keyboard = buildGeminiModelSelectionKeyboard(callbackLang, result.modelFamily, result.thinkingLevel);
                try {
                    if (query.message) {
                        await bot.editMessageText(text, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    }
                } catch (error) {
                    // ignore edit errors
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_model_saved', { model: result.modelConfig?.label || value }) });
                return;
            }

            if (action === 'thinking') {
                // Set thinking level
                const result = saveUserThinkingLevel(userId, value);
                const text = buildGeminiModelSelectionText(callbackLang, result.modelFamily, result.thinkingLevel);
                const keyboard = buildGeminiModelSelectionKeyboard(callbackLang, result.modelFamily, result.thinkingLevel);
                try {
                    if (query.message) {
                        await bot.editMessageText(text, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    }
                } catch (error) {
                    // ignore edit errors
                }
                const levelLabel = value === 'high' ? t(callbackLang, 'ai_thinking_level_high') : t(callbackLang, 'ai_thinking_level_low');
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_thinking_level_saved', { level: levelLabel }) });
                return;
            }

            if (action === 'back') {
                // Go back to Google AI API menu
                try {
                    const normalizedProvider = 'google';
                    const keys = await db.listUserAiKeys(userId);
                    const preferredProvider = await db.getUserAiProvider(userId);
                    const memory = await db.getAiMemory(userId);
                    const personaId = memory?.persona || 'default';
                    const preferences = memory?.userPreferences || {};
                    const customPersona = personaId === 'custom' ? preferences.customPersona : null;
                    const personaStrings = getPersonaStrings(callbackLang, personaId);
                    const personaInfo = {
                        id: personaId,
                        name: personaId === 'custom' ? (customPersona?.name || personaStrings.name) : personaStrings.name,
                        desc: personaId === 'custom' ? (customPersona?.prompt || '') : (personaStrings.desc || '')
                    };
                    const menu = buildAiApiMenu(keys, callbackLang, normalizedProvider, 0, {
                        defaultProvider: preferredProvider,
                        userId,
                        personaInfo
                    });

                    if (query.message) {
                        await bot.editMessageText(menu.text, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            reply_markup: menu.reply_markup
                        });
                    }
                } catch (error) {
                    console.warn(`[AI] Failed to go back to API menu: ${error.message}`);
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        const randomHandled = await handleRandomCallback(query, callbackLang);
        if (randomHandled) {
            return;
        }
        if (query.data?.startsWith('owner_list|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const parts = query.data.split('|');
            const stateId = parts[2];
            const action = parts[3];
            const state = getOwnerListState(stateId, ownerId);

            if (!state) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_list_state_missing'), show_alert: true });
                return;
            }

            const targetChatId = chatId || ownerId;

            if (action === 'export') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_list_export_started') });
                await exportOwnerList(state, callbackLang, targetChatId);
                return;
            }

            if (action === 'search') {
                ownerActionStates.set(ownerId, { mode: 'owner_list_search', stateId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_list_search_prompt_short') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_list_search_prompt'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            const filters = resolveOwnerListFilters(state);
            let updatedState = state;

            if (action === 'next') {
                updatedState = updateOwnerListState(stateId, ownerId, (current) => ({ ...current, page: current.page + 1 }));
            } else if (action === 'prev') {
                updatedState = updateOwnerListState(stateId, ownerId, (current) => ({ ...current, page: Math.max(0, current.page - 1) }));
            } else if (action === 'filter') {
                const currentIndex = filters.indexOf(state.filter);
                const nextFilter = filters[(currentIndex + 1) % filters.length];
                updatedState = updateOwnerListState(stateId, ownerId, (current) => ({ ...current, filter: nextFilter, page: 0 }));
            } else if (action === 'refresh') {
                updatedState = updateOwnerListState(stateId, ownerId, (current) => ({ ...current, page: 0 }));
            }

            const rendered = renderOwnerListState(updatedState, callbackLang);
            const options = {
                chat_id: targetChatId,
                message_id: query.message?.message_id,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: rendered?.reply_markup
            };

            try {
                await bot.editMessageText(rendered.text, options);
            } catch (error) {
                await bot.sendMessage(targetChatId, rendered.text, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: rendered?.reply_markup
                });
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data?.startsWith('owner_menu|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const action = query.data.split('|')[1];
            const targetChatId = query.message?.chat?.id || query.from?.id;

            if (action === 'close') {
                clearOwnerAction(ownerId);
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_executed') });
                return;
            }

            if (action === 'group') {
                const requestedGroup = query.data.split('|')[2] || getDefaultOwnerGroup();
                const ownerText = buildOwnerMenuText(callbackLang, requestedGroup);
                const replyMarkup = buildOwnerMenuKeyboard(callbackLang, requestedGroup);
                const chatId = query.message?.chat?.id;
                const messageId = query.message?.message_id;

                if (chatId && messageId) {
                    try {
                        await bot.editMessageText(ownerText, {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            reply_markup: replyMarkup
                        });
                        await bot.answerCallbackQuery(queryId);
                        return;
                    } catch (error) {
                        // fallback to sending a new message
                    }
                }

                await bot.sendMessage(targetChatId, ownerText, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                });
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'broadcast') {
                ownerActionStates.set(ownerId, { mode: 'broadcast', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_prompt_target') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_prompt_target'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'cmdstats') {
                // Show command analytics from CommandRegistry
                const allStats = commandRegistry.getAllStats()
                    .filter(s => s.calls > 0)
                    .sort((a, b) => b.calls - a.calls)
                    .slice(0, 20);

                let statsText;
                if (allStats.length === 0) {
                    statsText = '📊 <b>' + t(callbackLang, 'owner_menu_cmdstats') + '</b>\n\n' +
                        '<i>Chưa có thống kê sử dụng lệnh modular.</i>';
                } else {
                    const lines = [
                        '📊 <b>' + t(callbackLang, 'owner_menu_cmdstats') + '</b>',
                        '',
                        '<b>Top Commands (by usage):</b>',
                        ''
                    ];
                    allStats.forEach((s, i) => {
                        lines.push(`${i + 1}. /${s.name}: ${s.calls} calls, ${s.avgTime}ms avg, ${s.errorRate}% errors`);
                    });
                    statsText = lines.join('\n');
                }

                await bot.sendMessage(targetChatId, statsText, {
                    parse_mode: 'HTML',
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'check_users') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_user_checking') });
                await sendOwnerUserOverview(targetChatId, callbackLang);
                ownerActionStates.set(ownerId, { mode: 'user_check', step: 'query', chatId: targetChatId });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_user_check_prompt'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'coowner_grant' || action === 'coowner_revoke') {
                const mode = action === 'coowner_grant' ? 'grant' : 'revoke';
                const promptKey = mode === 'grant' ? 'owner_coowner_grant_prompt' : 'owner_coowner_revoke_prompt';
                ownerActionStates.set(ownerId, { mode: 'coowner_manage', step: 'target', action: mode, chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_user_check_prompt') });
                await bot.sendMessage(targetChatId, t(callbackLang, promptKey), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'ai_command_limits') {
                ownerActionStates.set(ownerId, { mode: 'ai_command_limits', step: 'idle', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_ai_command_limit_menu_short') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_ai_command_limit_menu'), {
                    parse_mode: 'HTML',
                    reply_markup: buildOwnerAiCommandLimitKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'api_stats') {
                clearOwnerAction(ownerId);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_api_refreshing') });
                await sendOwnerApiStats(targetChatId, callbackLang);
                return;
            }

            if (action === 'group_stats') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'idle', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_prompt_short') });
                await sendOwnerGroupDashboard(targetChatId, callbackLang);
                return;
            }

            if (action === 'run_command') {
                ownerActionStates.set(ownerId, { mode: 'run_command', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_run_target_prompt') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_run_target_prompt'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'command_limits') {
                ownerActionStates.set(ownerId, { mode: 'command_limits', step: 'idle', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_command_limit_menu_short') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_command_limit_menu'), {
                    parse_mode: 'HTML',
                    reply_markup: buildOwnerCommandLimitKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'reset_id') {
                ownerActionStates.set(ownerId, { mode: 'reset_id', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_reset_prompt') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_reset_prompt'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'ban' || action === 'unban') {
                ownerActionStates.set(ownerId, { mode: action, step: 'target', chatId: targetChatId });
                const promptKey = action === 'ban' ? 'owner_prompt_ban_target' : 'owner_prompt_unban_target';
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, promptKey) });
                await bot.sendMessage(targetChatId, t(callbackLang, promptKey), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }
        }

        if (query.data?.startsWith('owner_api|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const action = query.data.split('|')[1];
            const targetChatId = query.message?.chat?.id || query.from?.id;

            if (action === 'stats' || action === 'refresh') {
                clearOwnerAction(ownerId);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_api_refreshing') });
                await sendOwnerApiStats(targetChatId, callbackLang);
                return;
            }

            if (action === 'autodelete') {
                clearOwnerAction(ownerId);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_api_autodelete_running') });
                await autoDeleteInvalidApiKeys(targetChatId, callbackLang);
                return;
            }

            const promptMap = {
                delete: 'owner_api_prompt_target',
                add: 'owner_api_prompt_add_target',
                block: 'owner_api_prompt_block_target',
                unblock: 'owner_api_prompt_unblock_target',
                message: 'owner_api_prompt_message_target'
            };

            if (promptMap[action]) {
                ownerActionStates.set(ownerId, { mode: 'api_manage', action, step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, promptMap[action]) });
                await bot.sendMessage(targetChatId, t(callbackLang, promptMap[action]), { reply_markup: buildCloseKeyboard(callbackLang) });
                return;
            }
        }

        if (query.data?.startsWith('owner_command|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const action = query.data.split('|')[1];
            const targetChatId = query.message?.chat?.id || query.from?.id;

            if (action === 'limit') {
                ownerActionStates.set(ownerId, { mode: 'command_limit', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_command_limit_prompt_target') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_command_limit_prompt_target'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'unlimit') {
                ownerActionStates.set(ownerId, { mode: 'command_unlimit', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_command_limit_prompt_target') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_command_limit_prompt_target'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'stats') {
                clearOwnerAction(ownerId);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_command_usage_running') });
                await sendOwnerCommandUsageStats(targetChatId, callbackLang);
                return;
            }
        }

        if (query.data?.startsWith('owner_doremon|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const action = query.data.split('|')[1];
            const targetChatId = query.message?.chat?.id || query.from?.id;

            if (action === 'limit') {
                ownerActionStates.set(ownerId, { mode: 'doremon_limit', step: 'limit', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_doremon_limit_prompt') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_doremon_limit_prompt'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'unlimit') {
                ownerActionStates.set(ownerId, { mode: 'doremon_unlimit', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_doremon_unlimit_prompt_short') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_doremon_unlimit_prompt'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }
        }

        if (query.data?.startsWith('owner_ai_command|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const action = query.data.split('|')[1];
            const targetChatId = query.message?.chat?.id || query.from?.id;

            if (action === 'limit') {
                ownerActionStates.set(ownerId, { mode: 'ai_limit', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_prompt_target') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_prompt_target'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'unlimit') {
                ownerActionStates.set(ownerId, { mode: 'ai_unlimit', step: 'target', chatId: targetChatId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_prompt_target') });
                await bot.sendMessage(targetChatId, t(callbackLang, 'owner_prompt_target'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'stats') {
                clearOwnerAction(ownerId);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_ai_stats_running') });
                await sendOwnerAiStats(targetChatId, callbackLang);
                return;
            }
        }

        if (query.data?.startsWith('owner_group|')) {
            const ownerId = query.from?.id?.toString();
            const ownerUsername = query.from?.username || '';
            if (!isOwner(ownerId, ownerUsername)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const parts = query.data.split('|');
            const action = parts[1];
            const targetChatId = parts[2];
            const detail = parts[3];

            const shouldDiscard = action !== 'refresh' && action !== 'back';
            if (shouldDiscard) {
                await discardOwnerPanelMessage(query);
            }

            if (action === 'refresh' || action === 'back') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'idle', chatId: chatId || ownerId });
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_prompt_short') });
                await sendOwnerGroupDashboard(chatId || ownerId, callbackLang);
                return;
            }

            if (action === 'info') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'idle', chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_prompt_short') });
                await sendOwnerGroupDetail(chatId || ownerId, targetChatId, callbackLang);
                return;
            }

            if (action === 'copy') {
                const groups = await loadActiveGroupProfiles();
                const profile = groups.find((item) => item.chatId === detail || item.chatId === detail?.toString())
                    || { chatId: detail };
                const address = formatGroupAddress(profile);
                const value = targetChatId === 'address' ? address : profile.chatId;
                const label = targetChatId === 'address'
                    ? t(callbackLang, 'owner_group_button_copy_address')
                    : t(callbackLang, 'owner_group_button_copy_id');

                const copyText = `${label}: ${value?.toString() || t(callbackLang, 'owner_group_unknown_count')}`;
                const target = chatId || ownerId;
                if (target) {
                    await bot.sendMessage(target, copyText, {
                        disable_web_page_preview: true,
                        reply_markup: buildCloseKeyboard(callbackLang)
                    });
                }

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_executed') });
                return;
            }

            if (action === 'broadcast_all') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'broadcast_message', targetChatId: null, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_prompt_message') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_prompt_message'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'broadcast') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'broadcast_message', targetChatId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_prompt_message') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_prompt_message'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'kick' || action === 'ban_users') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'ban_users', targetChatId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_ban_hint') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_group_ban_hint'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'add_users') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'add_users', targetChatId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_add_users_hint') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_group_add_users_hint'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'pin') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'pin_message', targetChatId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_pin_hint') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_group_pin_hint'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'topic') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'create_topic', targetChatId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_topic_hint') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_group_topic_hint'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'change_info') {
                ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'change_info', targetChatId, chatId: chatId || ownerId });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_change_info_hint') });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_group_change_info_hint'), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'delete_messages') {
                const result = await purgeBotMessagesInGroup(targetChatId, callbackLang, 300);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_delete_done_short', { deleted: result.deleted }) });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, 'owner_group_delete_done', { deleted: result.deleted }), {
                    reply_markup: buildCloseKeyboard(callbackLang)
                });
                return;
            }

            if (action === 'toggle_anon') {
                const toggleResult = await toggleBotAnonymousMode(targetChatId, callbackLang);
                const key = toggleResult.nextState ? 'owner_group_anon_on' : 'owner_group_anon_off';
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, key) });
                await bot.sendMessage(chatId || ownerId, t(callbackLang, key), { reply_markup: buildCloseKeyboard(callbackLang) });
                return;
            }

            if (action === 'remove') {
                if (targetChatId) {
                    try {
                        if (isLikelyGroupChatId(targetChatId)) {
                            await bot.leaveChat(targetChatId);
                        }
                    } catch (error) {
                        console.warn(`[Owner] Failed to leave group ${targetChatId}: ${error.message}`);
                    }

                    await cleanupGroupProfile(targetChatId);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_removed', { id: targetChatId }) });
                    await sendOwnerGroupDashboard(chatId || ownerId, callbackLang);
                    return;
                }

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_group_usage_help'), show_alert: true });
                return;
            }
        }

        const handledTopToken = await handleTopTokenCallback({
            bot,
            query,
            chatId,
            callbackLang,
            buildTopTokenSessionKey,
            getTopTokenSession,
            updateTopTokenSession,
            buildTopTokenChainMenu,
            buildTopTokenSortMenu,
            buildTopTokenTimeframeMenu,
            renderTopTokenResults,
            describeTopTokenSort,
            formatChainLabel,
            resolveTopTokenChainEntry,
            t
        });
        if (handledTopToken) {
            return;
        }

        const handledPrice = await handlePriceCallback({
            query,
            callbackLang
        });
        if (handledPrice) {
            return;
        }

        const handledTxhash = await handleTxhashCallback({
            bot,
            query,
            chatId,
            callbackLang,
            txhashWizardStates,
            collectTxhashChainEntries,
            buildTxhashHashPromptText,
            buildCloseKeyboard,
            buildHelpText,
            sendMessageRespectingThread,
            t,
            buildPaginatedChainKeyboard,
            preferChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK
        });
        if (handledTxhash) {
            return;
        }

        const handledToken = await handleTokenCallback({
            bot,
            query,
            chatId,
            callbackLang,
            tokenWizardStates,
            collectTxhashChainEntries,
            buildTokenAddressPromptText,
            buildCloseKeyboard,
            buildHelpText,
            sendMessageRespectingThread,
            t,
            buildPaginatedChainKeyboard,
            preferChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK
        });
        if (handledToken) {
            return;
        }

        if (query.data === 'ui_close') {
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore cleanup errors
                }
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

        // AI Usage Dashboard callback
        if (query.data === 'ai_usage_dashboard') {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleAiUsageDashboard(synthetic, callbackLang);
            await bot.answerCallbackQuery(queryId);
            return;
        }

        // Open personal info profile prompt
        if (query.data === 'profile_prompt') {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/profile';
            synthetic.entities = [{ type: 'bot_command', offset: 0, length: 8 }];
            bot.processUpdate({ update_id: Date.now(), message: synthetic });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'profile_prompt') || 'Send your personal info.', show_alert: false });
            return;
        }

        // Open persona selection menu
        if (query.data === 'aipersona_menu') {
            const userId = query.from?.id?.toString();
            if (userId) {
                const currentPersonaId = await getUserPersona(userId);
                const personaList = Object.values(AI_PERSONAS).map((p) => {
                    const current = currentPersonaId === p.id ? ' ✓' : '';
                    const { name, desc } = getPersonaStrings(callbackLang, p.id);
                    return `• ${name}${current}: ${desc}`;
                }).join('\n');

                const menuText = `🎭 ${t(callbackLang, 'ai_persona_title')}\n\n${personaList}\n\n${t(callbackLang, 'ai_persona_hint')}`;
                await bot.sendMessage(chatId, menuText, { reply_markup: await buildPersonaKeyboard(callbackLang, userId) });
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

        // AI Persona Selection callback
        if (query.data && query.data.startsWith('aipersona|')) {
            const personaId = query.data.split('|')[1];
            const userId = query.from?.id?.toString();

            if (personaId && userId) {
                // Delete custom persona
                if (personaId === 'delete_custom') {
                    try {
                        const memory = await db.getAiMemory(userId);
                        const userPreferences = memory?.userPreferences || {};
                        delete userPreferences.customPersona;
                        await db.updateAiMemory(userId, {
                            persona: 'default',
                            userPreferences
                        });
                        // Clear caches
                        const { customPersonaCache, userPersonaPreferences } = require('./src/app/aiHandlers/sharedState');
                        customPersonaCache.delete(userId);
                        userPersonaPreferences.set(userId, 'default');

                        await bot.answerCallbackQuery(queryId, {
                            text: t(callbackLang, 'ai_persona_deleted') || 'Custom persona deleted!',
                            show_alert: false
                        });
                        // Update keyboard
                        try {
                            const newKeyboard = await buildPersonaKeyboard(callbackLang, userId);
                            await bot.editMessageReplyMarkup(newKeyboard, {
                                chat_id: query.message?.chat?.id,
                                message_id: query.message?.message_id
                            });
                        } catch (e) { /* ignore */ }
                    } catch (error) {
                        console.error('[Persona] Delete custom error:', error.message);
                        await bot.answerCallbackQuery(queryId, { text: 'Error deleting persona', show_alert: true });
                    }
                    return;
                }

                if (personaId === 'custom') {
                    await promptCustomPersonaInput(query.message, callbackLang);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'ai_persona_custom_prompt') || 'Send your custom persona details.', show_alert: false });
                    return;
                }

                const success = await setUserPersona(userId, personaId);
                if (success) {
                    const persona = AI_PERSONAS[personaId];
                    const personaLabel = getPersonaLabel(callbackLang, persona) || personaId;
                    const text = t(callbackLang, 'ai_persona_saved', { name: personaLabel });
                    await bot.answerCallbackQuery(queryId, { text, show_alert: false });

                    // Update the message with new keyboard showing selected persona
                    try {
                        const newKeyboard = await buildPersonaKeyboard(callbackLang, userId);
                        await bot.editMessageReplyMarkup(newKeyboard, {
                            chat_id: query.message?.chat?.id,
                            message_id: query.message?.message_id
                        });
                    } catch (e) {
                        // Ignore edit errors
                    }
                } else {
                    await bot.answerCallbackQuery(queryId, { text: 'Invalid persona', show_alert: true });
                }
            }
            return;
        }

        // AI Close callback
        if (query.data === 'aiclose') {
            try {
                await bot.deleteMessage(query.message?.chat?.id, query.message?.message_id);
            } catch (e) {
                // Ignore delete errors
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data && query.data.startsWith('rmchat:')) {
            const scope = query.data.split(':')[1];
            const chatKey = query.message?.chat?.id;
            const resultText = await executeRmchatAction({ chatId: chatKey, lang: callbackLang, scope });
            const replyMarkup = buildRmchatKeyboard(callbackLang);

            let responseMessageId = null;
            const isPrivateChat = query.message?.chat?.type === 'private';

            if (query.message?.message_id && chatKey) {
                try {
                    const res = await bot.editMessageText(resultText, {
                        chat_id: chatKey,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup
                    });
                    responseMessageId = res?.message_id || query.message.message_id;
                } catch (error) {
                    const sent = await sendMessageRespectingThread(chatKey, query.message, resultText, {
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup
                    });
                    responseMessageId = sent?.message_id || null;
                }
            } else if (chatKey) {
                const sent = await sendMessageRespectingThread(chatKey, query.message, resultText, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                responseMessageId = sent?.message_id || null;
            }

            if (isPrivateChat && chatKey && responseMessageId) {
                scheduleMessageDeletion(chatKey, responseMessageId, 20000);
            }

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'rmchat_action_done'), show_alert: false });
            return;
        }

        if (query.data === 'wallet_overview' || query.data.startsWith('wallet_chain_menu') || query.data.startsWith('wallet_chain_page')) {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const walletParam = query.data.startsWith('wallet_chain_menu')
                ? decodeURIComponent(query.data.split('|')[1] || '')
                : null;

            if (query.data === 'wallet_chain_menu_noop') {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data.startsWith('wallet_chain_page|')) {
                const parts = query.data.split('|');
                const pageToken = parts[1] || '';
                const page = Number(parts[2] || '0');
                const resolved = resolveWalletChainCallback(pageToken);
                const targetWallet = resolved?.wallet || null;
                try {
                    const menu = await buildWalletChainMenu(callbackLang, targetWallet || null, { page });
                    const options = {
                        chat_id: chatId,
                        message_id: query.message?.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup
                    };
                    if (options.message_id) {
                        await bot.editMessageText(menu.text, options);
                    } else {
                        await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                    }
                } catch (error) {
                    console.warn(`[WalletChains] Failed to paginate chain menu: ${error.message}`);
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            try {
                if (walletParam) {
                    const menu = await buildWalletChainMenu(callbackLang, walletParam);
                    const options = {
                        chat_id: chatId,
                        message_id: query.message?.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup
                    };

                    if (options.message_id) {
                        await bot.editMessageText(menu.text, options);
                    } else {
                        await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                    }
                } else {
                    const menu = await buildWalletManagerMenu(callbackLang, chatId);
                    const options = {
                        chat_id: chatId,
                        message_id: query.message?.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup
                    };

                    if (options.message_id) {
                        await bot.editMessageText(menu.text, options);
                    } else {
                        await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
            } catch (error) {
                console.error(`[WalletChains] Failed to render wallet menu: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('wallet_pick|')) {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const wallet = decodeURIComponent(query.data.split('|')[1] || '');
            try {
                const menu = await buildWalletChainMenu(callbackLang, wallet);
                const options = {
                    chat_id: chatId,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup
                };

                if (options.message_id) {
                    await bot.editMessageText(menu.text, options);
                } else {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                }

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
            } catch (error) {
                console.error(`[WalletPick] Failed to render chains for ${wallet}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('wallet_dexp|')) {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const parts = query.data.split('|');
            let targetWallet = null;
            let chainContext = null;
            let chainShort = null;
            let chainIndex = null;
            let page = 0;

            if (parts.length === 3) {
                const pageToken = parts[1] || null;
                page = Number(parts[2]) || 0;
                const resolved = pageToken ? resolveWalletChainCallback(pageToken) : null;
                if (resolved?.wallet) {
                    targetWallet = normalizeAddressSafe(resolved.wallet) || resolved.wallet || null;
                }
                if (resolved?.chainContext) {
                    chainContext = resolved.chainContext;
                    chainShort = chainContext.chainShortName || null;
                    chainIndex = Number.isFinite(chainContext.chainIndex)
                        ? chainContext.chainIndex
                        : Number.isFinite(chainContext.chainId)
                            ? chainContext.chainId
                            : null;
                }
            } else {
                const walletRaw = parts[1] ? decodeURIComponent(parts[1]) : null;
                const chainIndexRaw = parts[2];
                const chainShortRaw = parts[3];
                const pageRaw = parts[4];
                targetWallet = normalizeAddressSafe(walletRaw) || walletRaw || null;
                chainIndex = Number(chainIndexRaw);
                chainShort = chainShortRaw ? decodeURIComponent(chainShortRaw) : null;
                page = Number(pageRaw) || 0;
            }

            chainContext = chainContext || {
                chainIndex: Number.isFinite(chainIndex) ? chainIndex : 196,
                chainId: Number.isFinite(chainIndex) ? chainIndex : 196,
                chainShortName: chainShort || 'xlayer',
                aliases: chainShort ? [chainShort] : ['xlayer']
            };
            const chainLabel = formatChainLabel(chainContext);

            if (!targetWallet) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
                return;
            }

            try {
                const liveSnapshot = await fetchLiveWalletTokens(targetWallet, {
                    chainContext,
                    forceDex: true
                });

                const entries = [{
                    address: targetWallet,
                    tokens: Array.isArray(liveSnapshot.tokens) ? liveSnapshot.tokens : [],
                    warning: liveSnapshot.warning,
                    cached: false,
                    totalUsd: Number.isFinite(liveSnapshot.totalUsd) ? liveSnapshot.totalUsd : null
                }];

                const pageSize = 3;
                const totalTokens = entries[0]?.tokens?.length || 0;
                const totalPages = Math.max(1, Math.ceil(totalTokens / pageSize));
                const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
                const pageTokens = (entries[0]?.tokens || []).slice(currentPage * pageSize, currentPage * pageSize + pageSize);

                const text = await buildWalletBalanceTextInline(callbackLang, entries, {
                    chainLabel,
                    page: currentPage
                });

                const chainRefreshToken = createWalletChainCallback(chainContext, targetWallet);
                const chainCallbackData = chainRefreshToken
                    ? `wallet_chain|${chainRefreshToken}|${currentPage}`
                    : null;
                const pageNavToken = createWalletChainCallback(chainContext, targetWallet);
                const tokenButtonRows = buildWalletTokenButtonRows(callbackLang, pageTokens, {
                    wallet: targetWallet,
                    chainContext,
                    chainLabel,
                    chainCallbackData
                });
                const navRow = [];
                const navToken = pageNavToken || chainRefreshToken;
                if (totalPages > 1 && navToken) {
                    const prevPage = Math.max(0, currentPage - 1);
                    const nextPage = Math.min(totalPages - 1, currentPage + 1);
                    navRow.push({ text: '⬅️', callback_data: `wallet_dexp|${navToken}|${prevPage}` });
                    navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: `wallet_dexp|${navToken}|${currentPage}` });
                    navRow.push({ text: '➡️', callback_data: `wallet_dexp|${navToken}|${nextPage}` });
                }
                const portfolioRows = entries
                    .map((entry) => ({ address: entry.address, url: buildPortfolioEmbedUrl(entry.address) }))
                    .filter((row) => row.address && row.url)
                    .map((row) => [{ text: t(callbackLang, 'wallet_action_portfolio', { wallet: shortenAddress(row.address) }), url: row.url }]);
                const backCallback = targetWallet ? `wallet_chain_menu|${encodeURIComponent(targetWallet)}` : 'wallet_overview';
                const combinedRows = [];
                if (navRow.length) {
                    combinedRows.push(navRow);
                }
                if (tokenButtonRows.length > 0) {
                    combinedRows.push(...tokenButtonRows);
                }
                if (portfolioRows.length > 0) {
                    combinedRows.push(...portfolioRows);
                }
                const replyMarkup = appendCloseButton(
                    combinedRows.length ? { inline_keyboard: combinedRows } : null,
                    callbackLang,
                    { backCallbackData: backCallback }
                );

                if (query.message?.message_id) {
                    try {
                        await bot.editMessageText(text, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: replyMarkup
                        });
                    } catch (error) {
                        await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
                    }
                } else {
                    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
                }

                await bot.answerCallbackQuery(queryId);
            } catch (error) {
                console.error(`[WalletDexPage] Failed to paginate DEX assets: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('wallet_chain|')) {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const parts = query.data.split('|');
            const chainToken = parts[1] ? parts[1].trim() : null;
            const third = parts.length > 3 ? decodeURIComponent(parts[2]) : null;
            const fourth = parts.length > 3 ? decodeURIComponent(parts[3]) : null;
            const pageArg = parts.length === 3 ? (Number(parts[2]) || 0) : (Number(parts[4]) || 0);

            let chainShort = null;
            let targetWallet = null;
            let chainId = Number.isFinite(Number(chainToken)) ? Number(chainToken) : null;
            let chainEntry = null;

            if (chainToken && !Number.isFinite(chainId)) {
                const resolved = resolveWalletChainCallback(chainToken);
                if (resolved?.chainContext) {
                    chainEntry = resolved.chainContext;
                    chainId = Number.isFinite(chainEntry.chainId)
                        ? chainEntry.chainId
                        : Number.isFinite(chainEntry.chainIndex)
                            ? chainEntry.chainIndex
                            : chainId;
                    chainShort = chainEntry.chainShortName || chainShort;
                    targetWallet = targetWallet || resolved.wallet || null;
                }
            }

            if (fourth) {
                chainShort = third;
                targetWallet = normalizeAddressSafe(fourth) || fourth;
            } else if (third) {
                const maybeWallet = normalizeAddressSafe(third);
                if (maybeWallet) {
                    targetWallet = maybeWallet;
                } else {
                    chainShort = third;
                }
            }

            try {
                const chains = await fetchOkxBalanceSupportedChains();
                chainEntry = chainEntry || chains.find((entry) => Number(entry.chainId) === chainId
                    || Number(entry.chainIndex) === chainId
                    || (chainShort && entry.chainShortName === chainShort));
            } catch (error) {
                console.warn(`[WalletChains] Failed to load chains for selection: ${error.message}`);
            }

            const chainContext = chainEntry || {
                chainId: Number.isFinite(chainId) ? chainId : 196,
                chainIndex: Number.isFinite(chainId) ? chainId : 196,
                chainShortName: chainEntry?.chainShortName || chainShort || 'xlayer',
                aliases: chainEntry?.aliases || (chainShort ? [chainShort] : ['xlayer'])
            };
            const chainLabel = formatChainLabel(chainContext) || 'X Layer (#196)';

            try {
                const normalizedWallet = normalizeAddressSafe(targetWallet) || targetWallet;
                const liveSnapshot = await fetchLiveWalletTokens(normalizedWallet, {
                    chainContext,
                    forceDex: true
                });

                const pageSize = 3;
                const entries = [{
                    address: normalizedWallet,
                    tokens: Array.isArray(liveSnapshot.tokens) ? liveSnapshot.tokens : [],
                    warning: liveSnapshot.warning,
                    cached: false,
                    totalUsd: Number.isFinite(liveSnapshot.totalUsd) ? liveSnapshot.totalUsd : null
                }];

                const totalTokens = entries[0]?.tokens?.length || 0;
                const totalPages = Math.max(1, Math.ceil(totalTokens / pageSize));
                const currentPage = Math.min(Math.max(pageArg, 0), totalPages - 1);
                const pageTokens = (entries[0]?.tokens || []).slice(currentPage * pageSize, currentPage * pageSize + pageSize);

                const text = await buildWalletBalanceTextInline(callbackLang, entries, { chainLabel, page: currentPage });
                const chainRefreshToken = createWalletChainCallback(chainContext, normalizedWallet);
                const chainCallbackData = chainRefreshToken
                    ? `wallet_chain|${chainRefreshToken}|${currentPage}`
                    : null;
                const pageNavToken = createWalletChainCallback(chainContext, normalizedWallet);
                const tokenButtonRows = buildWalletTokenButtonRows(callbackLang, pageTokens, {
                    wallet: normalizedWallet,
                    chainContext,
                    chainLabel,
                    chainCallbackData
                });
                const navRow = [];
                const navToken = pageNavToken || chainRefreshToken;
                if (totalPages > 1 && navToken) {
                    const prevPage = Math.max(0, currentPage - 1);
                    const nextPage = Math.min(totalPages - 1, currentPage + 1);
                    navRow.push({ text: '⬅️', callback_data: `wallet_dexp|${navToken}|${prevPage}` });
                    navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: `wallet_dexp|${navToken}|${currentPage}` });
                    navRow.push({ text: '➡️', callback_data: `wallet_dexp|${navToken}|${nextPage}` });
                }
                const portfolioRows = entries
                    .map((entry) => ({ address: entry.address, url: buildPortfolioEmbedUrl(entry.address) }))
                    .filter((row) => row.address && row.url)
                    .map((row) => [{ text: t(callbackLang, 'wallet_action_portfolio', { wallet: shortenAddress(row.address) }), url: row.url }]);
                const backTarget = targetWallet || normalizedWallet;
                const backCallback = backTarget ? `wallet_chain_menu|${encodeURIComponent(backTarget)}` : 'wallet_overview';
                const combinedRows = [];
                if (navRow.length) {
                    combinedRows.push(navRow);
                }
                if (tokenButtonRows.length > 0) {
                    combinedRows.push(...tokenButtonRows);
                }
                if (portfolioRows.length > 0) {
                    combinedRows.push(...portfolioRows);
                }
                const replyMarkup = appendCloseButton(
                    combinedRows.length ? { inline_keyboard: combinedRows } : null,
                    callbackLang,
                    { backCallbackData: backCallback }
                );

                let rendered = false;
                if (query.message?.message_id) {
                    try {
                        await bot.editMessageText(text, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: replyMarkup
                        });
                        rendered = true;
                    } catch (editError) {
                        console.warn(`[WalletChains] editMessageText failed, retrying with sendMessage: ${editError.message}`);
                    }
                }

                if (!rendered) {
                    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
                }

                try {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
                } catch (ackError) {
                    console.warn(`[WalletChains] Callback ack failed: ${ackError.message}`);
                }
            } catch (error) {
                console.error(`[WalletChains] Failed to render holdings for chain ${chainId}: ${error.message}`);
                const fallback = t(callbackLang, 'wallet_overview_wallet_no_token');
                const backTarget = targetWallet || null;
                const backCallback = backTarget ? `wallet_chain_menu|${encodeURIComponent(backTarget)}` : 'wallet_overview';
                try {
                    await bot.sendMessage(chatId, fallback, { parse_mode: 'HTML', reply_markup: appendCloseButton(null, callbackLang, { backCallbackData: backCallback }) });
                } catch (sendError) {
                    console.warn(`[WalletChains] Fallback send failed: ${sendError.message}`);
                }
                try {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_chain_error'), show_alert: true });
                } catch (ackError) {
                    console.warn(`[WalletChains] Callback ack error after failure: ${ackError.message}`);
                }
            }
            return;
        }

        if (query.data.startsWith('wallet_token_action|')) {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const parts = query.data.split('|');
            const tokenId = parts[1];
            const actionKey = parts[2];
            const context = resolveWalletTokenContext(tokenId, { extend: true });
            if (!context || !actionKey) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_token_action_error'), show_alert: true });
                return;
            }

            try {
                const actionResult = await buildWalletTokenActionResult(actionKey, context, callbackLang);
                const menu = buildWalletTokenMenu(context, callbackLang, { actionResult });
                const shouldSendNew = (menu.extraTexts && menu.extraTexts.length > 0) || (menu.text && menu.text.length > 1200);
                const sendOptions = buildThreadedOptions(query.message, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                let rendered = false;

                if (!shouldSendNew && query.message?.message_id) {
                    try {
                        await bot.editMessageText(menu.text, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: menu.replyMarkup
                        });
                        rendered = true;
                    } catch (editError) {
                        if (!isTelegramMessageNotModifiedError(editError)) {
                            throw editError;
                        }
                        rendered = true;
                    }
                }

                if (!rendered) {
                    const sent = await bot.sendMessage(chatId, menu.text, sendOptions);
                    rendered = true;
                    if (query.message?.message_id) {
                        bot.deleteMessage(chatId, query.message.message_id).catch(() => { });
                    }
                }

                await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts, {
                    source: query.message,
                    replyMarkup: menu.replyMarkup
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
            } catch (error) {
                console.error(`[WalletToken] Failed to run ${actionKey}: ${error.message}`);
                const alertText = error.message === 'wallet_token_missing_contract'
                    ? t(callbackLang, 'wallet_token_action_no_contract')
                    : t(callbackLang, 'wallet_token_action_error');
                await bot.answerCallbackQuery(queryId, { text: alertText, show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('wallet_token_view|')) {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const tokenId = query.data.split('|')[1];
            const context = resolveWalletTokenContext(tokenId, { extend: true });
            if (!context) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_token_action_error'), show_alert: true });
                return;
            }

            const menu = buildWalletTokenMenu(context, callbackLang);
            const sendOptions = buildThreadedOptions(query.message, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });

            let rendered = false;
            if (query.message?.message_id) {
                try {
                    await bot.editMessageText(menu.text, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup
                    });
                    rendered = true;
                } catch (editError) {
                    // fall through to send new
                }
            }

            if (!rendered) {
                const sent = await bot.sendMessage(chatId, menu.text, sendOptions);
                rendered = true;
                if (query.message?.message_id) {
                    bot.deleteMessage(chatId, query.message.message_id).catch(() => { });
                }
            }

            await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts, {
                source: query.message,
                replyMarkup: menu.replyMarkup
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
            return;
        }

        if (query.data === 'wallet_manage') {
            if (!chatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const menu = await buildWalletManagerMenu(callbackLang, chatId);
            const options = {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'HTML',
                reply_markup: menu.replyMarkup || appendCloseButton(null, callbackLang, { backCallbackData: 'wallet_overview' })
            };

            try {
                if (options.message_id) {
                    await bot.editMessageText(menu.text, options);
                } else {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
                }
            } catch (error) {
                await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_manage_opened') });
            return;
        }

        if (query.data?.startsWith('walletmgr|')) {
            const action = query.data.split('|')[1] || 'open';
            if (action === 'add') {
                try {
                    await startRegisterWizard(query.from?.id?.toString(), callbackLang);
                    await bot.answerCallbackQuery(queryId);
                } catch (error) {
                    console.warn(`[WalletMgr] Cannot start register wizard: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_dm_blocked'), show_alert: true });
                }
                return;
            }

            const menu = await buildWalletManagerMenu(callbackLang, chatId);
            const options = {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'HTML',
                reply_markup: menu.replyMarkup || appendCloseButton(null, callbackLang, { backCallbackData: 'wallet_overview' })
            };
            try {
                if (options.message_id) {
                    await bot.editMessageText(menu.text, options);
                } else {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
                }
            } catch (error) {
                await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data.startsWith('wallet_remove|')) {
            if (!chatId || !query.message?.message_id) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const [, scope, walletEncoded, tokenKeyEncoded] = query.data.split('|');
            const wallet = walletEncoded ? decodeURIComponent(walletEncoded) : null;
            const tokenKey = tokenKeyEncoded ? decodeURIComponent(tokenKeyEncoded) : null;
            let feedback = null;
            if (scope === 'all') {
                const existingWallets = await db.getWalletsForUser(chatId);
                await db.removeAllWalletsFromUser(chatId);
                for (const w of existingWallets) {
                    const addr = normalizeAddressSafe(w?.address || w) || w?.address || w;
                    if (addr) {
                        teardownWalletWatcher(addr);
                    }
                }
                feedback = t(callbackLang, 'unregister_all_success');
            } else if (scope === 'wallet' && wallet) {
                await db.removeWalletFromUser(chatId, wallet);
                teardownWalletWatcher(wallet);
                feedback = t(callbackLang, 'unregister_wallet_removed', { wallet: shortenAddress(wallet) });
            } else if (scope === 'token' && wallet && tokenKey) {
                await db.removeWalletTokenRecord(chatId, wallet, tokenKey);
                feedback = t(callbackLang, 'unregister_token_removed', {
                    wallet: shortenAddress(wallet),
                    token: tokenKey.toUpperCase()
                });
            }

            const menu = await buildWalletManagerMenu(callbackLang, chatId);
            try {
                await bot.editMessageText(menu.text, {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup || undefined
                });
            } catch (error) {
                // ignore edit errors
            }

            await bot.answerCallbackQuery(queryId, { text: feedback || t(callbackLang, 'unregister_action_done') });
            return;
        }

        if (query.data.startsWith('donate_cmd|')) {
            const [, payload] = query.data.split('|');
            if (payload === 'close') {
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = `/${payload}`;
            if (payload === 'donatedev') {
                await handleDonateDevCommand(synthetic);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'donate_action_opened') });
                return;
            }

            if (payload === 'donatecm') {
                await handleDonateCommunityManageCommand(synthetic);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'donate_action_opened') });
                return;
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data === 'donatecm_broadcast') {
            const chatId = query.message?.chat?.id?.toString();
            const userId = query.from?.id;
            const chatType = query.message?.chat?.type;

            if (!chatId || !userId || !['group', 'supergroup'].includes(chatType)) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const isAdmin = await isGroupAdmin(chatId, userId);
            if (!isAdmin) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'donatecm_no_permission'), show_alert: true });
                return;
            }

            const broadcastText = await buildCommunityDonationBroadcastText(callbackLang, chatId);
            await bot.sendMessage(chatId, broadcastText, { parse_mode: 'HTML', disable_web_page_preview: true });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'donatecm_broadcast_sent') });
            return;
        }

        if (query.data?.startsWith('admin_action|')) {
            const [, action, rawUserId, rawChatId] = query.data.split('|');
            const targetChatId = rawChatId || query.message?.chat?.id;
            const messageChatType = query.message?.chat?.type;
            const actorId = query.from?.id;
            if (!targetChatId || !actorId) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_failed'), show_alert: true });
                return;
            }

            if (['private'].includes(messageChatType) && (action === 'muteall' || action === 'unmuteall')) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_action_group_only'), show_alert: true });
                return;
            }
            const isAdmin = await isUserAdmin(targetChatId, actorId);
            if (!isAdmin) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            if (action === 'muteall') {
                await bot.setChatPermissions(targetChatId, { can_send_messages: false }); await bot.answerCallbackQuery(queryId, { text: 'Đã bật mute all.' });
                return;
            }
            if (action === 'unmuteall') {
                await bot.setChatPermissions(targetChatId, { can_send_messages: true }); await bot.answerCallbackQuery(queryId, { text: 'Đã tắt mute all.' });
                return;
            }

            if (action === 'warnings') {
                const warnState = getWarnState(targetChatId);
                const lines = [];
                for (const [id, entry] of warnState.entries()) {
                    lines.push(`${id}: ${entry.count}`);
                }
                await bot.answerCallbackQuery(queryId, { text: lines.join('\n') || 'Chưa có cảnh cáo.' });
                return;
            }

            if (!rawUserId) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_failed'), show_alert: true });
                return;
            }

            const targetUserId = Number(rawUserId);

            if (action === 'ban') {
                await bot.banChatMember(targetChatId, targetUserId, { revoke_messages: true });
                await bot.answerCallbackQuery(queryId, { text: 'Đã cấm.' });
                return;
            }
            if (action === 'kick') {
                await bot.banChatMember(targetChatId, targetUserId, { until_date: Math.floor(Date.now() / 1000) + 60 });
                await bot.unbanChatMember(targetChatId, targetUserId, { only_if_banned: true });
                await bot.answerCallbackQuery(queryId, { text: 'Đã đuổi.' });
                return;
            }
            if (action === 'mute') {
                const seconds = 3600;
                clearScheduledUnmute(targetChatId, targetUserId);
                await bot.restrictChatMember(targetChatId, targetUserId, {
                    permissions: { can_send_messages: false },
                    until_date: Math.floor(Date.now() / 1000) + seconds
                });
                scheduleAutomaticUnmute(targetChatId, targetUserId, seconds);
                await bot.answerCallbackQuery(queryId, { text: 'Đã mute 1h.' });
                return;
            }
            if (action === 'unmute') {
                clearScheduledUnmute(targetChatId, targetUserId);
                await bot.restrictChatMember(targetChatId, targetUserId, { permissions: { can_send_messages: true } });
                await bot.answerCallbackQuery(queryId, { text: 'Đã gỡ mute.' });
                return;
            }
            if (action === 'warn') {
                const warnState = getWarnState(targetChatId);
                const current = warnState.get(targetUserId) || { count: 0, reasons: [] };
                current.count += 1;
                warnState.set(targetUserId, current);
                await bot.answerCallbackQuery(queryId, { text: `Warn (${current.count})` });
                return;
            }
            if (action === 'del' && query.message?.message_id) {
                await bot.deleteMessage(targetChatId, query.message.message_id).catch(() => { });
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (action === 'rules' && targetChatId) {
                const settings = getGroupSettings(targetChatId);
                const text = settings.rulesText || 'Chưa có nội quy.';
                await bot.sendMessage(targetChatId, text);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_executed') });
                return;
            }
        }

        if (query.data === 'help_close') {
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore deletion errors
                }
                clearHelpMessageState(query.message.chat.id.toString(), query.message.message_id);
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data?.startsWith('filter_remove|')) {
            const [, targetChatId, keyword] = query.data.split('|');
            const actorId = query.from?.id?.toString();

            if (!targetChatId || !keyword || !actorId) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_failed'), show_alert: true });
                return;
            }

            const isAdmin = await isUserAdmin(targetChatId, actorId);
            if (!isAdmin) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const lang = await resolveNotificationLanguage(actorId, callbackLang);
            const filters = await ensureFilterState(targetChatId);

            if (!filters.has(keyword)) {
                await bot.answerCallbackQuery(queryId, { text: t(lang, 'admin_filter_missing', { keyword: escapeHtml(keyword) }), show_alert: true });
            } else {
                filters.delete(keyword);
                await db.deleteFilter(targetChatId, keyword);
                await bot.answerCallbackQuery(queryId, { text: t(lang, 'admin_filter_removed', { keyword: escapeHtml(keyword) }) });
            }

            if (query.message?.chat?.id?.toString() === targetChatId.toString() && query.message?.message_id) {
                const view = buildFiltersListView(lang, targetChatId);
                try {
                    await bot.editMessageText(view.text, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: view.reply_markup
                    });
                } catch (error) {
                    if (!/message is not modified/i.test(error?.response?.body?.description || '')) {
                        console.warn(`[Filters] Failed to refresh list after deletion in ${targetChatId}: ${error.message}`);
                    }
                }
            }
            return;
        }

        if (query.data?.startsWith('admin_select|')) {
            const [, targetChatId] = query.data.split('|');
            const actorId = query.from?.id;

            if (!targetChatId || !actorId) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_failed'), show_alert: true });
                return;
            }

            const result = await sendModerationAdminPanel(actorId, targetChatId, {
                fallbackLang: callbackLang,
                threadId: extractThreadId(query),
                editMessage: query.message
            });

            if (result.status === 'forbidden') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            if (result.status === 'dm_blocked') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_dm_error'), show_alert: true });
                return;
            }

            if (result.status !== 'sent') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_failed'), show_alert: true });
                return;
            }

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_dm_sent') });
            return;
        }

        if (query.data?.startsWith('admin_broadcast|')) {
            const [, targetChatId, mode] = query.data.split('|');
            const actorId = query.from?.id?.toString();

            if (!targetChatId || !actorId) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_failed'), show_alert: true });
                return;
            }

            const isAdmin = await isUserAdmin(targetChatId, actorId);
            if (!isAdmin) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }

            const promptText = mode === 'direct'
                ? t(callbackLang, 'admin_broadcast_prompt_direct')
                : t(callbackLang, 'admin_broadcast_prompt_group');
            const prompt = await bot.sendMessage(actorId, promptText, {
                parse_mode: 'HTML',
                reply_markup: { force_reply: true, input_field_placeholder: promptText }
            });

            adminBroadcastPrompts.set(actorId, { chatId: targetChatId, mode: mode === 'direct' ? 'direct' : 'group', promptId: prompt.message_id });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_executed') });
            return;
        }

        if (query.data === 'help_separator') {
            await bot.answerCallbackQuery(queryId);
            return;
        }

        const adminCategoryAction = query.data?.startsWith('admin_cat|') ? query.data.split('|') : null;
        if (adminCategoryAction && adminCategoryAction.length >= 2) {
            const [, categoryKeyRaw, chatIdArg] = adminCategoryAction;
            const targetChatId = chatIdArg || query.message?.chat?.id?.toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUserResult = await isUserAdmin(targetChatId, query.from.id);
            if (!isAdminUserResult) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'owner_not_allowed'), show_alert: true });
                return;
            }
            const categoryKey = categoryKeyRaw === 'root' ? null : categoryKeyRaw;
            const panelResult = await sendModerationAdminPanel(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                deliverToChatId: targetChatId,
                category: categoryKey,
                editMessage: query.message,
                threadId: extractThreadId(query)
            });
            const statusText = panelResult.status === 'error' ? t(callbackLang, 'help_action_failed') : undefined;
            await bot.answerCallbackQuery(queryId, statusText ? { text: statusText, show_alert: true } : {});
            return;
        }

        if (query.data.startsWith('help_group|')) {
            const [, requestedGroup] = query.data.split('|');
            const groups = resolveHelpGroups();
            const selectedGroup = groups.includes(requestedGroup) ? requestedGroup : (groups[0] || null);
            const replyMarkup = buildHelpKeyboard(callbackLang, selectedGroup);
            const chatId = query.message?.chat?.id;
            const messageId = query.message?.message_id;
            const helpText = buildHelpText(callbackLang, selectedGroup);

            if (chatId && messageId) {
                try {
                    await bot.editMessageText(helpText, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        reply_markup: replyMarkup
                    });
                    saveHelpMessageState(chatId.toString(), messageId, { view: 'user', group: selectedGroup });
                } catch (error) {
                    const description = error?.response?.body?.description || error?.message || '';
                    if (/message is not modified/i.test(description)) {
                        saveHelpMessageState(chatId.toString(), messageId, { view: 'user', group: selectedGroup });
                    } else {
                        try {
                            await bot.editMessageReplyMarkup(replyMarkup, { chat_id: chatId, message_id: messageId });
                            saveHelpMessageState(chatId.toString(), messageId, { view: 'user', group: selectedGroup });
                        } catch (innerError) {
                            console.warn(`[Help] Failed to update help view for ${chatId}: ${sanitizeSecrets(description || innerError?.message || innerError?.toString() || '')}`);
                        }
                    }
                }
            }

            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data.startsWith('help_cmd|')) {
            const [, commandKey, targetChatId] = query.data.split('|');
            const executor = helpCommandExecutors[commandKey];
            if (!executor) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_not_available'), show_alert: true });
                return;
            }

            try {
                const result = await executor(query, callbackLang, { targetChatId });
                if (!result || !result.message) {
                    await bot.answerCallbackQuery(queryId);
                } else {
                    await bot.answerCallbackQuery(queryId, {
                        text: result.message,
                        show_alert: Boolean(result.showAlert)
                    });
                }
            } catch (error) {
                const description = error?.response?.body?.description || error?.message || '';
                if (error?.code === 'ETELEGRAM' && /query is too old|query ID is invalid/i.test(description)) {
                    console.warn(`[Help] Ignored stale help callback for ${commandKey}: ${sanitizeSecrets(description)}`);
                    return;
                }

                console.error(`[Help] Failed to execute ${commandKey} from help: ${sanitizeSecrets(description || error?.toString())}`);
                await bot.answerCallbackQuery(queryId, {
                    text: t(callbackLang, 'help_action_failed'),
                    show_alert: true
                });
            }
            return;
        }

        if (query.data === 'admin_hub_refresh') {
            const session = adminHubSessions.get(query.from.id);
            try {
                await openAdminHub(query.from.id, { fallbackLang: callbackLang, mode: session?.mode });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
            } catch (error) {
                console.error(`[AdminHub] Failed to refresh hub for ${query.from.id}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data === 'admin_hub_from_menu') {
            const session = adminHubSessions.get(query.from.id);
            const nextMode = session?.mode || 'checkin';
            try {
                await openAdminHub(query.from.id, { fallbackLang: callbackLang, mode: nextMode });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
            } catch (error) {
                console.error(`[AdminHub] Failed to open hub from menu for ${query.from.id}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data === 'admin_hub_close') {
            const session = adminHubSessions.get(query.from.id);
            if (session?.messageId) {
                try {
                    await bot.deleteMessage(query.from.id, session.messageId);
                } catch (error) {
                    // ignore errors
                }
            }
            adminHubSessions.delete(query.from.id);
            clearAdminContext(query.from.id);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_closed') });
            return;
        }

        if (query.data.startsWith('admin_hub_open|')) {
            const [, targetChatId] = query.data.split('|');
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const session = adminHubSessions.get(query.from.id);
            const hubMode = session?.mode || 'checkin';

            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            try {
                if (hubMode === 'welcome') {
                    await sendWelcomeAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_menu_opening') });
                } else if (hubMode === 'moderation') {
                    const result = await sendModerationAdminPanel(query.from.id, targetChatId, { fallbackLang: callbackLang });

                    if (result.status === 'dm_blocked') {
                        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_dm_error'), show_alert: true });
                        return;
                    }

                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_dm_sent') });
                } else if (hubMode === 'language') {
                    await sendLanguageAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, forceRefresh: true });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
                } else if (hubMode === 'price') {
                    await sendPriceAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
                } else {
                    await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_opening') });
                }
            } catch (error) {
                console.error(`[AdminHub] Failed to open menu for ${query.from.id} in ${targetChatId}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data?.startsWith('lang_admin_refresh|')) {
            const [, targetChatId] = query.data.split('|');
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            try {
                const result = await sendLanguageAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, forceRefresh: true });
                if (result?.replaced && query.message?.message_id && query.message.message_id !== result.messageId) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
            } catch (error) {
                console.error(`[LangHub] Failed to refresh for ${query.from.id}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data?.startsWith('lang_admin_close|')) {
            const [, targetChatId] = query.data.split('|');
            const sessionKey = `${query.from.id}:${(targetChatId || '').toString()}`;
            const session = languageHubSessions.get(sessionKey);
            if (session?.messageId) {
                try {
                    await bot.deleteMessage(query.from.id, session.messageId);
                } catch (error) {
                    // ignore cleanup errors
                }
            }
            languageHubSessions.delete(sessionKey);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_closed') });
            return;
        }

        if (query.data?.startsWith('lang_topic_clear|')) {
            const [, targetChatId, topicIdRaw] = query.data.split('|');
            const topicId = topicIdRaw === undefined ? null : topicIdRaw;
            if (!targetChatId || !topicId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const isAdmin = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdmin) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'group_language_admin_only'), show_alert: true });
                return;
            }

            const removed = await db.removeTopicLanguage(targetChatId, topicId);
            if (!removed) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'language_hub_topic_not_found'), show_alert: true });
                return;
            }

            try {
                const result = await sendLanguageAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, forceRefresh: true });
                if (result?.replaced && query.message?.message_id && query.message.message_id !== result.messageId) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
            } catch (error) {
                console.warn(`[LangHub] Failed to refresh after removal: ${error.message}`);
            }

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'language_hub_topic_removed') });
            return;
        }

        if (query.data.startsWith('checkin_start|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const result = await initiateCheckinChallenge(targetChatId, query.from, { replyMessage: query.message });
            const responseLang = result.userLang || callbackLang;

            if (result.status === 'locked') {
                await bot.answerCallbackQuery(queryId, { text: t(responseLang, 'checkin_error_locked'), show_alert: true });
            } else if (result.status === 'checked') {
                await bot.answerCallbackQuery(queryId, { text: t(responseLang, 'checkin_error_already_checked'), show_alert: true });
            } else if (result.status === 'failed') {
                if (result.failureReason === 'dm_unreachable' && result.startLink) {
                    await answerCheckinStartPrompt(query, responseLang, result.startLink);
                } else {
                    await bot.answerCallbackQuery(queryId, { text: t(responseLang, 'checkin_error_dm_failed'), show_alert: true });
                }
            } else {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_answer_sent_alert') });
            }
            return;
        }

        if (query.data.startsWith('checkin_answer|')) {
            const parts = query.data.split('|');
            const token = parts[1];
            const answerIndex = parts[2];
            await handleCheckinAnswerCallback(query, token, answerIndex);
            return;
        }

        if (query.data.startsWith('welcome_answer|')) {
            const parts = query.data.split('|');
            const token = parts[1];
            const answerIndex = parts[2];
            await handleWelcomeAnswer(query, token, answerIndex);
            return;
        }

        if (query.data.startsWith('checkin_emotion_skip|')) {
            const parts = query.data.split('|');
            const token = parts[1];
            await handleEmotionCallback(query, token, null, { skip: true });
            return;
        }

        if (query.data.startsWith('checkin_emotion|')) {
            const parts = query.data.split('|');
            const token = parts[1];
            const emoji = parts[2] || '';
            await handleEmotionCallback(query, token, emoji);
            return;
        }

        if (query.data.startsWith('checkin_goal_choose|')) {
            const parts = query.data.split('|');
            await handleGoalCallback(query, parts[1], 'choose', parts[2] || '');
            return;
        }

        if (query.data.startsWith('checkin_goal_skip|')) {
            const parts = query.data.split('|');
            await handleGoalCallback(query, parts[1], 'skip');
            return;
        }

        if (query.data.startsWith('checkin_goal_custom|')) {
            const parts = query.data.split('|');
            await handleGoalCallback(query, parts[1], 'custom');
            return;
        }

        if (query.data.startsWith('checkin_leaderboard|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const mode = parts[2] || 'streak';
            const boardLang = await resolveGroupLanguage(targetChatId);
            const boardText = await buildLeaderboardText(targetChatId, mode, 10, boardLang);
            await sendMessageRespectingThread(targetChatId, query.message, boardText);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_leaderboard_sent_alert') });
            return;
        }

        if (query.data.startsWith('welcome_admin_close|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const userKey = query.from.id.toString();
            welcomeAdminStates.delete(userKey);
            if (targetChatId) {
                welcomeAdminMenus.delete(targetChatId);
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            if (targetChatId) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_menu_closed') });
            } else {
                await bot.answerCallbackQuery(queryId);
            }
            return;
        }

        if (query.data.startsWith('welcome_admin_back|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            welcomeAdminStates.delete(query.from.id.toString());
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore cleanup issues
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
            await sendWelcomeAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('welcome_admin_topics|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            await presentWelcomeTopics(query.from.id, targetChatId, { fallbackLang: callbackLang, messageContext: query.message });
            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data.startsWith('welcome_admin_toggle|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const settings = await getWelcomeVerificationSettings(targetChatId);
            await toggleWelcomeVerification(targetChatId, query.from.id, !settings.enabled, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
            return;
        }

        if (query.data.startsWith('welcome_admin_weights_set|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const presetWeights = {
                math: Number(parts[2]),
                physics: Number(parts[3]),
                chemistry: Number(parts[4]),
                okx: Number(parts[5]),
                crypto: Number(parts[6])
            };
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
            await setWelcomeQuestionWeights(targetChatId, query.from.id, presetWeights, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('welcome_admin_weights_custom|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_weights_prompt'), {
                reply_markup: {
                    inline_keyboard: [[{ text: t(callbackLang, 'welcome_admin_button_back'), callback_data: `welcome_admin_back|${targetChatId}` }]]
                }
            });
            welcomeAdminStates.set(query.from.id.toString(), {
                type: 'weights_custom',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_weights_prompted') });
            return;
        }

        if (query.data.startsWith('welcome_admin_weights|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
            await showWelcomeWeightMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('welcome_admin_time|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_time_prompt'));
            welcomeAdminStates.set(query.from.id.toString(), {
                type: 'time',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_time_prompted') });
            return;
        }

        if (query.data.startsWith('welcome_admin_title|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const defaultTitle = t(callbackLang, 'welcome_admin_title_default');
            const example = t(callbackLang, 'welcome_admin_title_example');
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_title_prompt', { default: defaultTitle, example }), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'welcome_admin_button_back'), callback_data: `welcome_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'welcome_admin_button_title_reset'), callback_data: `welcome_admin_title_reset|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'help_button_close'), callback_data: `welcome_admin_close|${targetChatId}` }]
                    ]
                }
            });
            welcomeAdminStates.set(query.from.id.toString(), {
                type: 'title',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_title_prompted') });
            return;
        }

        if (query.data.startsWith('welcome_admin_title_reset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            welcomeAdminStates.delete(query.from.id.toString());
            await resetWelcomeTitleTemplate(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_title_reset_alert') });
            return;
        }

        if (query.data.startsWith('welcome_admin_attempts|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_attempts_prompt'));
            welcomeAdminStates.set(query.from.id.toString(), {
                type: 'attempts',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_attempts_prompted') });
            return;
        }

        if (query.data.startsWith('welcome_admin_action_set|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const action = parts[2];
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            await setWelcomeAction(targetChatId, query.from.id, action, { fallbackLang: callbackLang });
            await sendWelcomeAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, editOnly: true });
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
            return;
        }

        if (query.data.startsWith('welcome_admin_action|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
                return;
            }
            const inline_keyboard = [
                [{ text: t(callbackLang, 'welcome_admin_action_kick'), callback_data: `welcome_admin_action_set|${targetChatId}|kick` }],
                [{ text: t(callbackLang, 'welcome_admin_action_mute'), callback_data: `welcome_admin_action_set|${targetChatId}|mute` }],
                [{ text: t(callbackLang, 'welcome_admin_action_ban'), callback_data: `welcome_admin_action_set|${targetChatId}|ban` }],
                [
                    { text: t(callbackLang, 'welcome_admin_button_back'), callback_data: `welcome_admin_back|${targetChatId}` },
                    { text: t(callbackLang, 'help_button_close'), callback_data: `welcome_admin_close|${targetChatId}` }
                ]
            ];
            const prompt = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_action_prompt'), { reply_markup: { inline_keyboard } });
            if (prompt?.message_id) {
                setTimeout(async () => {
                    try {
                        await bot.deleteMessage(prompt.chat.id, prompt.message_id);
                    } catch (error) {
                        // ignore auto delete
                    }
                }, 60 * 1000);
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_action_prompted') });
            return;
        }

        if (query.data === 'checkin_admin_noop') {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_board_hint') });
            return;
        }

        if (query.data.startsWith('checkin_admin_menu|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const requestedView = parts[2] || 'home';
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            try {
                await sendAdminMenu(query.from.id, targetChatId, {
                    fallbackLang: callbackLang,
                    view: requestedView,
                    messageContext: query.message
                });
                const viewKey = resolveAdminMenuView(requestedView);
                const sectionConfig = ADMIN_MENU_SECTION_CONFIG[viewKey];
                const sectionLabel = viewKey === 'home'
                    ? t(callbackLang, 'checkin_admin_menu_choose_action')
                    : t(callbackLang, sectionConfig?.labelKey || 'checkin_admin_menu_board_hint');
                await bot.answerCallbackQuery(queryId, {
                    text: t(callbackLang, 'checkin_admin_section_opened', { section: sectionLabel })
                });
            } catch (error) {
                console.error(`[AdminMenu] Failed to switch view for ${query.from.id}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('checkin_admin_close|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const userKey = query.from.id.toString();
            checkinAdminStates.delete(userKey);
            pendingSecretMessages.delete(userKey);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_closed') });
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await closeAdminMenu(query.from.id);
            return;
        }

        if (query.data.startsWith('checkin_admin_back|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            const userKey = query.from.id.toString();
            checkinAdminStates.delete(userKey);
            pendingSecretMessages.delete(userKey);

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_backing') });
            // Edit the current message instead of deleting and sending new
            await sendAdminMenu(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                view: 'home',
                messageContext: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_refresh|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            await sendAdminMenu(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                messageContext: query.message
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_refreshed') });
            return;
        }

        if (query.data.startsWith('checkin_admin_topics|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await presentCheckinTopics(query.from.id, targetChatId, { fallbackLang: callbackLang, messageContext: query.message });
            await bot.answerCallbackQuery(queryId);
            return;
        }

        if (query.data.startsWith('checkin_admin_cancel_input|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            const userKey = query.from.id.toString();
            const adminState = checkinAdminStates.get(userKey);
            const secretState = pendingSecretMessages.get(userKey);
            if (adminState?.promptMessageId) {
                try {
                    await bot.deleteMessage(query.from.id, adminState.promptMessageId);
                } catch (error) {
                    // ignore
                }
            }
            if (secretState?.promptMessageId) {
                try {
                    await bot.deleteMessage(query.from.id, secretState.promptMessageId);
                } catch (error) {
                    // ignore
                }
            }
            checkinAdminStates.delete(userKey);
            pendingSecretMessages.delete(userKey);

            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_cancelled') });
            await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_user_prompt|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            try {
                const groupLang = await resolveGroupLanguage(targetChatId);
                await bot.sendMessage(targetChatId, t(groupLang, 'checkin_admin_user_prompt_text'), {
                    disable_web_page_preview: true
                });

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_user_prompt_alert') });
            } catch (error) {
                console.error(`[Checkin] Failed to broadcast member guide for ${targetChatId}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('checkin_admin_user_leaderboard|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            try {
                const groupLang = await resolveGroupLanguage(targetChatId);
                await bot.sendMessage(targetChatId, t(groupLang, 'checkin_admin_user_leaderboard_text'), {
                    disable_web_page_preview: true
                });

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_user_leaderboard_alert') });
            } catch (error) {
                console.error(`[Checkin] Failed to broadcast leaderboard guide for ${targetChatId}: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
            }
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_reset_confirm|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_processing') });
            await confirmLeaderboardReset(query.from.id, targetChatId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_reset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
            await promptLeaderboardReset(query.from.id, targetChatId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_remove|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const targetUserId = parts[2];
            if (!targetChatId || !targetUserId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_processing') });
            await confirmLeaderboardRemoval(query.from.id, targetChatId, targetUserId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_member|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const targetUserId = parts[2];
            if (!targetChatId || !targetUserId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
            await presentAdminLeaderboardMemberDetail(query.from.id, targetChatId, targetUserId, {
                fallbackLang: callbackLang,
                messageContext: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_members|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
            await presentAdminLeaderboardManageList(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                messageContext: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_mode|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const mode = parts[2] || 'streak';
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
            await presentAdminLeaderboardView(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                mode,
                messageContext: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_leaderboard_view|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
            await presentAdminLeaderboardView(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                messageContext: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_list|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_list_progress_alert') });
            await sendTodayCheckinList(targetChatId, query.from.id, {
                fallbackLang: callbackLang,
                messageContext: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_window|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_window_progress_alert') });
            await sendSummaryWindowCheckinList(targetChatId, query.from.id, {
                fallbackLang: callbackLang,
                messageContext: query.message
            });
            return;
        }

        // Export callback handler
        if (query.data.startsWith('checkin_export|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const format = parts[2] || 'csv';
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_list_progress_alert') });
            await handleExportRequest(targetChatId, query.from.id, format, { fallbackLang: callbackLang });
            return;
        }

        // Broadcast pagination handler (for summary sent to group)
        if (query.data.startsWith('checkin_broadcast_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            // Anyone in the group can paginate the broadcast message
            await bot.answerCallbackQuery(queryId);
            await sendSummaryAnnouncement(targetChatId, {
                page,
                messageContext: query.message
            });
            return;
        }

        // Pagination handlers for checkin admin lists
        if (query.data.startsWith('checkin_today_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId);
            await sendTodayCheckinList(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
            return;
        }

        if (query.data.startsWith('checkin_summary_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId);
            await sendSummaryWindowCheckinList(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
            return;
        }

        if (query.data.startsWith('checkin_removal_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId);
            await promptAdminForRemoval(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
            return;
        }

        if (query.data.startsWith('checkin_unlock_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId);
            await promptAdminUnlock(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
            return;
        }

        if (query.data.startsWith('checkin_leaderboard_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId);
            await presentAdminLeaderboardManageList(query.from.id, targetChatId, { fallbackLang: callbackLang, page, messageContext: query.message });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_reset_confirm|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_reset_success_alert') });
            await executeAdminSummaryReset(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_reset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_reset_prompt_alert') });
            await promptAdminSummaryReset(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_broadcast|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_broadcast_progress_alert') });
            await sendCheckinAnnouncement(targetChatId, { triggeredBy: 'manual' });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_broadcast|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            const sent = await sendSummaryAnnouncement(targetChatId, { sourceMessage: query.message, triggeredBy: 'manual' });
            await bot.answerCallbackQuery(queryId, {
                text: sent
                    ? t(callbackLang, 'checkin_admin_summary_broadcast_success_alert')
                    : t(callbackLang, 'checkin_admin_summary_broadcast_empty'),
                show_alert: !sent
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_toggle_auto|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            const settings = await getGroupCheckinSettings(targetChatId);
            const nextEnabled = Number(settings.autoMessageEnabled) === 1 ? 0 : 1;
            await db.updateCheckinGroup(targetChatId, { autoMessageEnabled: nextEnabled });

            const alertKey = nextEnabled ? 'checkin_admin_toggle_on_alert' : 'checkin_admin_toggle_off_alert';
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, alertKey) });
            const currentView = checkinAdminMenus.get(query.from.id)?.view || 'home';
            await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, view: currentView });
            return;
        }

        if (query.data.startsWith('checkin_admin_remove_confirm|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const targetUserId = parts[2];
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_remove_progress_alert') });
            await executeAdminRemoval(targetChatId, query.from.id, targetUserId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_remove|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_remove_choose_prompt') });
            await promptAdminForRemoval(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_unlock_confirm|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const targetUserId = parts[2];
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_unlock_progress_alert') });
            await executeAdminUnlock(targetChatId, query.from.id, targetUserId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_unlock|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_unlock_choose_prompt') });
            await promptAdminUnlock(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_dm_all|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            const settings = await getGroupCheckinSettings(targetChatId);
            const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
            const records = await db.getCheckinsForDate(targetChatId, today);
            const uniqueRecipients = Array.from(new Set((records || []).map((record) => record.userId.toString())));
            const filtered = uniqueRecipients
                .filter((recipient) => recipient && recipient !== query.from.id.toString())
                .slice(0, CHECKIN_ADMIN_DM_MAX_RECIPIENTS);
            if (filtered.length === 0) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_empty'), show_alert: true });
                return;
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_dm_all_prompt', { count: filtered.length }), {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            pendingSecretMessages.set(query.from.id.toString(), {
                chatId: targetChatId,
                targetUserId: 'all',
                recipients: filtered,
                promptMessageId: promptMessage.message_id,
                mode: 'all'
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_all_progress_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_dm_target|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const targetUserId = parts[2];
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const profile = await resolveMemberProfile(targetChatId, targetUserId, callbackLang);
            const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_dm_enter_message', { user: userLabel }), {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            pendingSecretMessages.set(query.from.id.toString(), {
                chatId: targetChatId,
                targetUserId,
                promptMessageId: promptMessage.message_id,
                mode: 'single'
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_enter_prompt_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_dm_page|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            const page = Number.parseInt(parts[2], 10) || 0;
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }

            await bot.answerCallbackQuery(queryId);
            await promptAdminSecretMessage(targetChatId, query.from.id, {
                fallbackLang: callbackLang,
                page,
                message: query.message
            });
            return;
        }

        if (query.data.startsWith('checkin_admin_dm|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_choose_prompt_alert') });
            await promptAdminSecretMessage(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_title_reset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            checkinAdminStates.delete(query.from.id.toString());
            await resetCheckinTitleTemplate(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_title_reset_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_title|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await promptCheckinTitleTemplate(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_title_prompted') });
            return;
        }

        if (query.data.startsWith('checkin_admin_points_set|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const value = parts[2];
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_updated_alert') });
            await setAdminDailyPoints(targetChatId, query.from.id, value, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_points_custom|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_points_prompt'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            checkinAdminStates.set(query.from.id.toString(), {
                type: 'points_custom',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_prompt_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_points|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_choose_prompt') });
            await promptAdminPoints(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_set|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const value = parts[2];
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_updated_alert') });
            await setAdminSummaryWindow(targetChatId, query.from.id, value, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_custom|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_summary_prompt'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            checkinAdminStates.set(query.from.id.toString(), {
                type: 'summary_custom',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_prompt_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_choose_prompt') });
            await promptAdminSummaryWindow(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_schedule_preset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const presetValue = parts[2] || '';
            const presetSlots = presetValue.split(',').map((slot) => slot.trim()).filter(Boolean);
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_updated_alert') });
            await setAdminScheduleSlots(targetChatId, query.from.id, presetSlots, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_schedule_preset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const presetValue = parts[2] || '';
            const presetSlots = presetValue.split(',').map((slot) => slot.trim()).filter(Boolean);
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await setAdminSummaryScheduleSlots(targetChatId, query.from.id, presetSlots, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_updated_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_schedule_custom|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_schedule_prompt'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            checkinAdminStates.set(query.from.id.toString(), {
                type: 'schedule_custom',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_prompt_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_schedule_custom|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_summary_schedule_prompt'), {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            checkinAdminStates.set(query.from.id.toString(), {
                type: 'summary_schedule_custom',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_prompt_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_schedule_clear|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_cleared_alert') });
            await resetAdminScheduleSlots(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_schedule_disable|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await disableAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_disabled_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_schedule_reset|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await resetAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_reset_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_schedule_sync|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            await syncAdminSummaryScheduleWithAuto(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_sync_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_schedule|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_choose_prompt') });
            await promptAdminSchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_summary_schedule|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await promptAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_choose_prompt') });
            return;
        }

        if (query.data.startsWith('checkin_admin_weights_set|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const presetWeights = {
                math: Number(parts[2]),
                physics: Number(parts[3]),
                chemistry: Number(parts[4]),
                okx: Number(parts[5]),
                crypto: Number(parts[6])
            };
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_updated_alert') });
            await setAdminQuestionWeights(targetChatId, query.from.id, presetWeights, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin_weights_custom|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore
                }
            }
            const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_weights_prompt'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                            { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                        ],
                        [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                    ]
                }
            });
            checkinAdminStates.set(query.from.id.toString(), {
                type: 'weights_custom',
                chatId: targetChatId,
                promptMessageId: promptMessage.message_id
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_prompt_alert') });
            return;
        }

        if (query.data.startsWith('checkin_admin_weights|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_choose_prompt') });
            await showQuestionWeightMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
            return;
        }

        if (query.data.startsWith('checkin_admin|')) {
            const parts = query.data.split('|');
            const targetChatId = (parts[1] || chatId || '').toString();
            if (!targetChatId) {
                await bot.answerCallbackQuery(queryId);
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
            if (!isAdminUser) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_no_permission'), show_alert: true });
                return;
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_opening') });
            try {
                await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
            } catch (error) {
                console.error(`[Checkin] Không th? g?i menu qu?n lý: ${error.message}`);
            }
            return;
        }

        if (query.data === 'lang_close') {
            if (query.message?.chat?.id && query.message?.message_id) {
                bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { /* ignore cleanup errors */ });
            }
            await bot.answerCallbackQuery(queryId, { text: '✅' });
            return;
        }

        if (query.data.startsWith('langtopic_')) {
            const newLang = resolveLangCode(query.data.split('_')[1]);
            await handleTopicLanguageSelection(query, newLang, callbackLang);
            return;
        }

        const handledFeatureTopic = await featureTopics.handleCallback({ query, callbackLang, chatId });
        if (handledFeatureTopic) {
            return;
        }

        if (query.data.startsWith('lang_')) {
            const newLang = resolveLangCode(query.data.split('_')[1]);
            await handleLanguageSelection(query, newLang, callbackLang);
            return;
        }

        if (query.data === 'start_help') {
            const helpLang = query.message ? await getLang(query.message) : callbackLang;
            const defaultGroup = getDefaultHelpGroup();
            const helpText = buildHelpText(helpLang, defaultGroup);
            const replyMarkup = buildHelpKeyboard(helpLang, defaultGroup);
            const sent = await sendReply(query.message, helpText, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: replyMarkup
            });
            if (sent?.chat?.id && sent?.message_id) {
                saveHelpMessageState(sent.chat.id.toString(), sent.message_id, { view: 'user', group: defaultGroup });
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

    });

    bot.on('message', async (msg) => {
        const chatId = msg?.chat?.id;
        if (!chatId || !msg?.message_id) {
            return;
        }

        if (msg.from && !msg.from.is_bot) {
            rememberRmchatMessage(rmchatUserMessages, chatId, msg.message_id);
        }

        if (await handleGoalTextInput(msg)) {
            return;
        }

        const textOrCaption = (msg.text || msg.caption || '').trim();
        const userId = msg.from?.id?.toString();
        const senderChatId = msg.sender_chat?.id?.toString();
        const sessionKey = userId || (senderChatId ? `chat:${senderChatId}` : null);
        const chatType = msg.chat?.type || '';
        const chatIdStr = chatId ? chatId.toString() : null;
        const commandMatch = textOrCaption.match(/^\/([^\s@]+)(?:@[\w_]+)?/);
        if (userId && commandMatch && !msg._recentTracked) {
            commandRegistry.trackRecent(userId, commandMatch[1]);
            msg._recentTracked = true;
        }
        const isDataTelegramCommand = /^\/dataTelegram(?:@[\w_]+)?/i.test(textOrCaption);
        const idSession = sessionKey ? idTelegramSessions.get(sessionKey) : null;

        if (
            idSession &&
            idSession.chatId === chatIdStr &&
            msg.message_id !== idSession.promptMessageId &&
            !isDataTelegramCommand
        ) {
            try {
                if (idSession.promptMessageId) {
                    await bot.deleteMessage(chatId, idSession.promptMessageId);
                }
            } catch (error) {
                // ignore cleanup errors
            }

            try {
                await sendIdTelegramDetails(msg, msg, idSession.lang || (await getLang(msg)));
            } catch (error) {
                console.error(`[IdTelegram] Failed to deliver details: ${error.message}`);
            }

            idTelegramSessions.delete(sessionKey);
            return;
        }

        const pendingBroadcast = userId ? adminBroadcastPrompts.get(userId) : null;
        if (pendingBroadcast && msg.reply_to_message?.message_id === pendingBroadcast.promptId) {
            adminBroadcastPrompts.delete(userId);
            const lang = await getLang(msg);
            if (!(await isUserAdmin(pendingBroadcast.chatId, userId))) {
                await sendReply(msg, t(lang, 'owner_not_allowed'));
                return;
            }

            const content = textOrCaption;
            if (!content) {
                await sendReply(msg, t(lang, 'admin_broadcast_format_error'));
                return;
            }

            try {
                if (pendingBroadcast.mode === 'direct') {
                    const [targetId, ...restParts] = content.split(/\s+/);
                    const messageBody = restParts.join(' ').trim();
                    if (!targetId || !messageBody) {
                        await sendReply(msg, t(lang, 'admin_broadcast_format_error'));
                        return;
                    }
                    await bot.sendMessage(targetId, messageBody, { allow_sending_without_reply: true });
                    await sendReply(msg, t(lang, 'admin_broadcast_sent_direct'));
                } else {
                    await bot.sendMessage(pendingBroadcast.chatId, content, { allow_sending_without_reply: true });
                    await sendReply(msg, t(lang, 'admin_broadcast_sent_group'));
                }
            } catch (error) {
                console.error(`[AdminBroadcast] Failed to forward message: ${error.message}`);
                await sendReply(msg, t(lang, 'help_action_failed'));
            }
            return;
        }

        const deviceInfo = await ensureDeviceInfo(msg);

        if (['group', 'supergroup'].includes(chatType)) {
            await ensureGroupProfile(msg.chat);
            const settings = getGroupSettings(chatId);

            if (msg.new_chat_members?.length) {
                const welcomeConfig = await getWelcomeVerificationSettings(chatId);
                for (const member of msg.new_chat_members) {
                    if (!member || member.is_bot || (BOT_ID && member.id.toString() === BOT_ID.toString())) {
                        continue;
                    }
                    if (welcomeConfig.enabled) {
                        enqueueWelcomeVerification({ chatId, member, sourceMessage: msg, settings: welcomeConfig });
                    }
                }

                const welcome = settings.welcomeMessage;
                if (welcome) {
                    const member = msg.new_chat_members[0];
                    const rendered = welcome
                        .replace('{name}', member.first_name || '')
                        .replace('{chat_name}', msg.chat?.title || '')
                        .replace('{members}', (msg.chat?.all_members_are_administrators ? '' : '') || '')
                        .replace('{rules}', '/rules');
                    const sent = await sendReply(msg, rendered, {
                        disable_web_page_preview: true,
                        reply_markup: settings.rulesText
                            ? { inline_keyboard: [[{ text: '/rules', callback_data: 'admin_action|rules' }]] }
                            : undefined
                    });
                    if (settings.welcomeAutoDeleteSeconds && sent?.message_id) {
                        scheduleMessageDeletion(chatId, sent.message_id, settings.welcomeAutoDeleteSeconds * 1000);
                    }
                }
            }
        }

        if (userId) {
            await db.upsertUserProfile(userId, {
                fullName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '),
                username: msg.from?.username || null
            });
        }

        if (await enforceBanForMessage(msg)) {
            return;
        }

        if (['group', 'supergroup'].includes(chatType) && userId) {
            const settings = getGroupSettings(chatId);
            const isAdmin = await isUserAdmin(chatId, userId);

            const pendingFilter = filterSetupStates.get(msg.from.id);
            if (pendingFilter && pendingFilter.chatId === chatId) {
                const lang = await getLang(msg);
                const filters = await ensureFilterState(chatId);
                const cleaned = normalizeFilterResponse(textOrCaption, pendingFilter.keyword);
                const payload = cleaned || textOrCaption || '[media]';
                const entities = msg.entities || msg.caption_entities || [];
                filters.set(pendingFilter.keyword, { text: payload, entities });
                await db.upsertFilter(chatId, pendingFilter.keyword, payload, entities);
                filterSetupStates.delete(msg.from.id);
                await sendReply(msg, t(lang, 'admin_filter_saved', { keyword: escapeHtml(pendingFilter.keyword) }));
                return;
            }

            if (!isAdmin) {
                if (settings.muteAll) {
                    await bot.deleteMessage(chatId, msg.message_id).catch(() => { });
                    return;
                }

                if (settings.linkLock.enabled && textOrCaption) {
                    const hasLink = /(https?:\/\/\S+)/i.test(textOrCaption);
                    const allowlisted = Array.from(settings.linkLock.allowlist).some((link) => textOrCaption.includes(link));
                    if (hasLink && !allowlisted) {
                        if (settings.linkLock.action === 'delete') {
                            await bot.deleteMessage(chatId, msg.message_id).catch(() => { });
                        }
                        if (settings.linkLock.action === 'warn') {
                            await sendReply(msg, 'Vui lòng không g?i link.');
                        }
                        if (settings.linkLock.action === 'mute') {
                            await bot.restrictChatMember(chatId, msg.from.id, {
                                permissions: { can_send_messages: false },
                                until_date: Math.floor(Date.now() / 1000) + 3600
                            });
                        }
                        if (settings.linkLock.action === 'kick') {
                            await bot.banChatMember(chatId, msg.from.id, { until_date: Math.floor(Date.now() / 1000) + 60 });
                            await bot.unbanChatMember(chatId, msg.from.id, { only_if_banned: true });
                        }
                        if (settings.linkLock.action === 'ban') {
                            await bot.banChatMember(chatId, msg.from.id, { revoke_messages: true });
                        }
                        return;
                    }
                }

                const fileTypeLocked =
                    (settings.fileLocks.photos && msg.photo) ||
                    (settings.fileLocks.videos && msg.video) ||
                    (settings.fileLocks.stickers && msg.sticker) ||
                    (settings.fileLocks.documents && msg.document);
                if (fileTypeLocked) {
                    await bot.deleteMessage(chatId, msg.message_id).catch(() => { });
                    return;
                }

                if (settings.flood.enabled) {
                    const tracker = floodTrackers.get(chatId) || new Map();
                    const now = Date.now();
                    const history = tracker.get(userId) || [];
                    const filtered = history.filter((ts) => now - ts < settings.flood.windowSeconds * 1000);
                    filtered.push(now);
                    tracker.set(userId, filtered);
                    floodTrackers.set(chatId, tracker);
                    if (filtered.length > settings.flood.limit) {
                        if (settings.flood.action === 'delete') {
                            await bot.deleteMessage(chatId, msg.message_id).catch(() => { });
                        }
                        if (settings.flood.action === 'mute') {
                            await bot.restrictChatMember(chatId, msg.from.id, {
                                permissions: { can_send_messages: false },
                                until_date: Math.floor(Date.now() / 1000) + 3600
                            });
                        }
                        if (settings.flood.action === 'kick') {
                            await bot.banChatMember(chatId, msg.from.id, { until_date: Math.floor(Date.now() / 1000) + 60 });
                            await bot.unbanChatMember(chatId, msg.from.id, { only_if_banned: true });
                        }
                        if (settings.flood.action === 'ban') {
                            await bot.banChatMember(chatId, msg.from.id, { revoke_messages: true });
                        }
                        return;
                    }
                }
            }

            const filters = await ensureFilterState(chatId);
            for (const [keyword, response] of filters.entries()) {
                if (keyword && textOrCaption.toLowerCase().includes(keyword)) {
                    const payload = typeof response === 'string'
                        ? { text: normalizeFilterResponse(response, keyword), entities: [] }
                        : response || {};
                    const normalizedResponse = normalizeFilterResponse(payload.text, keyword);
                    await sendReply(msg, normalizedResponse, {
                        allow_sending_without_reply: true,
                        entities: Array.isArray(payload.entities) ? payload.entities : undefined
                    });
                    break;
                }
            }
        }

        const pendingPassword = userId ? ownerPasswordPrompts.get(userId) : null;
        if (pendingPassword && msg.reply_to_message?.message_id === pendingPassword.messageId && msg.chat?.id?.toString() === pendingPassword.chatId) {
            const lang = pendingPassword.lang || await getLang(msg);
            ownerPasswordPrompts.delete(userId);

            if (textOrCaption === OWNER_PASSWORD) {
                await registerCoOwner(userId, msg.from, userId);
                resetOwnerPasswordAttempts(userId);
                await sendReply(msg, t(lang, 'owner_password_success'), { reply_markup: buildCloseKeyboard(lang) });
                await bot.sendMessage(msg.chat.id, t(lang, 'owner_menu_title'), {
                    parse_mode: 'HTML',
                    reply_markup: buildOwnerMenuKeyboard(lang)
                });
            } else {
                const stopped = await recordOwnerPasswordFailure(msg, lang);
                if (!stopped) {
                    await sendReply(msg, t(lang, 'owner_password_invalid'), { reply_markup: buildCloseKeyboard(lang) });
                }
            }
            return;
        }

        if (await handleOwnerStateMessage(msg, textOrCaption)) {
            return;
        }

        if (/^\/(?:persona|personas|personality)(?:@[\w_]+)?(?:\s|$)/i.test(textOrCaption)) {
            const lang = await resolveNotificationLanguage(userId, msg.from?.language_code);
            const currentPersonaId = await getUserPersona(userId);
            const personaList = Object.values(AI_PERSONAS).map((p) => {
                const current = currentPersonaId === p.id ? ' ✓' : '';
                const label = getPersonaLabel(lang, p);
                return `• ${label}${current}: ${p.description}`;
            }).join('\n');

            const menuText = `🎭 ${t(lang, 'ai_persona_title')}\n\n${personaList}\n\n${t(lang, 'ai_persona_hint')}`;
            await sendReply(msg, menuText, { reply_markup: await buildPersonaKeyboard(lang, userId) });
            return;
        }

        if (/^\/api(?:@[\w_]+)?(?:\s|$)/i.test(textOrCaption)) {
            await handleApiCommand(msg);
            return;
        }

        if (/^\/ai(?:@[\w_]+)?(?:\s|$)/i.test(textOrCaption)) {
            await handleAiCommand(msg);
            return;
        }

        if (!userId) {
            return;
        }

        if (await handleCustomPersonaReply(msg)) {
            return;
        }

        if (chatType === 'private') {
            const lang = await resolveNotificationLanguage(userId, msg.from?.language_code);
            const apiPrompt = aiApiAddPrompts.get(userId);
            if (apiPrompt && msg.chat?.id?.toString() === userId && msg.reply_to_message?.message_id === apiPrompt.messageId) {
                await handleAiApiSubmission(msg, apiPrompt);
                return;
            }
            const registerState = registerWizardStates.get(userId);
            if (registerState && msg.chat?.id?.toString() === userId && msg.reply_to_message?.message_id === registerState.promptMessageId) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'register_help_invalid'));
                    return;
                }

                try {
                    const parsed = parseRegisterPayload(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'register_help_invalid'));
                        return;
                    }

                    const result = await db.addWalletToUser(userId, lang, parsed.wallet, { name: parsed.name });

                    if (registerState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, registerState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }

                    scheduleMessageDeletion(msg.chat.id, msg.message_id, 15000);
                    const effectiveName = parsed.name || result?.name;
                    const successKey = result?.added
                        ? (effectiveName ? 'register_help_success_wallet_named' : 'register_help_success_wallet')
                        : (result?.nameChanged ? 'register_wallet_renamed' : 'register_wallet_exists');
                    await sendEphemeralMessage(userId, t(lang, successKey, {
                        wallet: shortenAddress(parsed.wallet),
                        name: effectiveName
                    }), {}, 20000);

                    try {
                        await sendWalletManagerMenu(userId, lang);
                    } catch (err) {
                        console.warn(`[RegisterWizard] Failed to refresh wallet manager for ${userId}: ${err.message}`);
                    }

                    registerWizardStates.delete(userId);
                } catch (error) {
                    console.error(`[RegisterWizard] Failed to save wallet for ${userId}: ${error.message}`);
                    await sendEphemeralMessage(userId, t(lang, 'register_help_error'));
                }
                return;
            }

            const txhashState = txhashWizardStates.get(userId);
            if (
                txhashState &&
                txhashState.stage === 'hash' &&
                msg.chat?.id?.toString() === txhashState.chatId &&
                msg.reply_to_message?.message_id === txhashState.promptMessageId
            ) {
                const rawHash = (msg.text || '').trim();
                const effectiveLang = txhashState.lang || lang;

                if (!rawHash) {
                    if (msg.chat.type === 'private') {
                        await sendEphemeralMessage(userId, t(effectiveLang, 'txhash_help_invalid'));
                    } else {
                        await sendMessageRespectingThread(txhashState.chatId, msg, t(effectiveLang, 'txhash_help_invalid'), {
                            reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'txhash_back' })
                        });
                    }
                    return;
                }

                if (!txhashState.chainIndex) {
                    await sendMessageRespectingThread(txhashState.chatId, msg, t(effectiveLang, 'txhash_chain_missing'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'txhash_back' })
                    });
                    return;
                }

                try {
                    await deliverTxhashDetail({
                        chatId: txhashState.chatId,
                        lang: effectiveLang,
                        txHash: rawHash,
                        chainIndex: txhashState.chainIndex,
                        replyContextMessage: txhashState.replyContextMessage || msg
                    });
                    txhashWizardStates.delete(userId);
                } catch (error) {
                    console.error(`[TxhashWizard] Failed to handle txhash for ${userId}: ${error.message}`);
                    await sendReply(msg, t(effectiveLang, 'txhash_error'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'txhash_back' })
                    });
                }
                return;
            }

            const tokenState = tokenWizardStates.get(userId);
            if (
                tokenState &&
                tokenState.stage === 'address' &&
                msg.chat?.id?.toString() === tokenState.chatId &&
                msg.reply_to_message?.message_id === tokenState.promptMessageId
            ) {
                const rawAddress = (msg.text || '').trim();
                const effectiveLang = tokenState.lang || lang;

                if (!rawAddress) {
                    const keyboard = buildCloseKeyboard(effectiveLang, { backCallbackData: 'token_back' });
                    if (msg.chat.type === 'private') {
                        await sendEphemeralMessage(userId, t(effectiveLang, 'token_help_invalid'));
                    } else {
                        await sendMessageRespectingThread(tokenState.chatId, msg, t(effectiveLang, 'token_help_invalid'), { reply_markup: keyboard });
                    }
                    return;
                }

                if (!tokenState.chainIndex) {
                    await sendMessageRespectingThread(tokenState.chatId, msg, t(effectiveLang, 'token_chain_missing'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'token_back' })
                    });
                    return;
                }

                try {
                    await deliverTokenDetail({
                        chatId: tokenState.chatId,
                        lang: effectiveLang,
                        chainEntry: tokenState.chainEntry,
                        chainIndex: tokenState.chainIndex,
                        contractAddress: rawAddress,
                        replyContextMessage: tokenState.replyContextMessage || msg
                    });
                    tokenWizardStates.delete(userId);
                } catch (error) {
                    console.error(`[TokenWizard] Failed to handle token for ${userId}: ${error.message}`);
                    await sendReply(msg, t(effectiveLang, 'token_error'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'token_back' })
                    });
                }
                return;
            }

            const contractState = contractWizardStates.get(userId);
            if (
                contractState &&
                msg.chat?.id?.toString() === contractState.chatId &&
                msg.reply_to_message?.message_id === contractState.promptMessageId
            ) {
                const rawAddress = (msg.text || '').trim();
                const effectiveLang = contractState.lang || lang;

                if (!rawAddress) {
                    await sendMessageRespectingThread(contractState.chatId, msg, t(effectiveLang, 'contract_invalid'), {
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });
                    return;
                }

                const contractAddress = normalizeAddress(rawAddress);
                if (!contractAddress) {
                    await sendMessageRespectingThread(contractState.chatId, msg, t(effectiveLang, 'contract_invalid'), {
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });
                    return;
                }

                try {
                    if (contractState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, contractState.promptMessageId);
                        } catch (error) {
                            // ignore cleanup errors
                        }
                    }

                    const oklinkUrl = buildContractLookupUrl(contractAddress);
                    const addressLabel = formatCopyableValueHtml(contractAddress) || escapeHtml(contractAddress);
                    const linkLabel = `<a href="${oklinkUrl}">${escapeHtml(oklinkUrl)}</a>`;
                    const responseLines = [
                        t(effectiveLang, 'contract_result'),
                        t(effectiveLang, 'contract_result_address', { address: addressLabel }),
                        t(effectiveLang, 'contract_result_link', { link: linkLabel })
                    ];

                    await sendMessageRespectingThread(contractState.chatId, msg, responseLines.join('\n'), {
                        parse_mode: 'HTML',
                        disable_web_page_preview: false,
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });

                    contractWizardStates.delete(userId);
                } catch (error) {
                    console.error(`[ContractWizard] Failed to respond for ${userId}: ${error.message}`);
                    await sendMessageRespectingThread(contractState.chatId, msg, t(effectiveLang, 'contract_invalid'), {
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });
                }
                return;
            }

            const handledPriceWizard = await handlePriceWizardMessage(msg, textOrCaption);
            if (handledPriceWizard) {
                return;
            }

            const secretState = pendingSecretMessages.get(userId);
            if (secretState) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_invalid'));
                    return;
                }

                const clipped = rawText.length > 500 ? rawText.slice(0, 500) : rawText;

                try {
                    if (secretState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, secretState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    const mode = secretState.mode || 'single';
                    if (mode === 'all') {
                        const uniqueRecipients = Array.from(new Set(Array.isArray(secretState.recipients) ? secretState.recipients : []));
                        let successCount = 0;
                        let failureCount = 0;
                        for (const recipientId of uniqueRecipients) {
                            if (!recipientId || recipientId === userId) {
                                continue;
                            }
                            try {
                                const targetLang = await resolveNotificationLanguage(recipientId);
                                await bot.sendMessage(recipientId, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                                successCount += 1;
                            } catch (error) {
                                failureCount += 1;
                            }
                        }
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_dm_all_result', {
                            success: successCount,
                            failed: failureCount
                        }));
                    } else {
                        const targetLang = await resolveNotificationLanguage(secretState.targetUserId);
                        await bot.sendMessage(secretState.targetUserId, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                        await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_confirm'));
                    }
                } catch (error) {
                    console.error(`[Checkin] Không th? chuy?n ti?p tin nh?n bí m?t: ${error.message}`);
                    await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_error'), {}, 15000);
                } finally {
                    pendingSecretMessages.delete(userId);
                }

                if (secretState.chatId) {
                    await sendAdminMenu(msg.from.id, secretState.chatId, { fallbackLang: lang });
                }
                return;
            }

            const welcomeState = welcomeAdminStates.get(userId);
            if (welcomeState) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_error_input_invalid'));
                    return;
                }

                if (welcomeState.type === 'weights_custom') {
                    const parsed = parseQuestionWeightsInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_weights_invalid'));
                        return;
                    }
                    if (welcomeState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setWelcomeQuestionWeights(welcomeState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    welcomeAdminStates.delete(userId);
                    return;
                }

                if (welcomeState.type === 'time') {
                    const numeric = Number(rawText.replace(',', '.'));
                    if (!Number.isFinite(numeric) || numeric <= 0) {
                        await sendEphemeralMessage(userId, t(lang, 'welcome_admin_time_invalid'));
                        return;
                    }
                    if (welcomeState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setWelcomeTimeLimit(welcomeState.chatId, msg.from.id, numeric, { fallbackLang: lang });
                    welcomeAdminStates.delete(userId);
                    return;
                }

                if (welcomeState.type === 'attempts') {
                    const numeric = Number(rawText.replace(',', '.'));
                    if (!Number.isFinite(numeric) || numeric < 1) {
                        await sendEphemeralMessage(userId, t(lang, 'welcome_admin_attempts_invalid'));
                        return;
                    }
                    if (welcomeState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setWelcomeAttemptLimit(welcomeState.chatId, msg.from.id, numeric, { fallbackLang: lang });
                    welcomeAdminStates.delete(userId);
                    return;
                }

                if (welcomeState.type === 'title') {
                    if (welcomeState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setWelcomeTitleTemplate(welcomeState.chatId, msg.from.id, rawText, { fallbackLang: lang });
                    welcomeAdminStates.delete(userId);
                    return;
                }
            }

            const adminState = checkinAdminStates.get(userId);
            if (adminState) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_error_input_invalid'));
                    return;
                }

                if (adminState.type === 'points_custom') {
                    const normalized = Number(rawText.replace(',', '.'));
                    if (!Number.isFinite(normalized) || normalized < 0) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_points_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminDailyPoints(adminState.chatId, msg.from.id, normalized, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'title_custom') {
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setCheckinTitleTemplate(adminState.chatId, msg.from.id, rawText, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'summary_custom') {
                    const normalized = Number(rawText.replace(',', '.'));
                    if (!Number.isFinite(normalized) || normalized <= 0) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_summary_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminSummaryWindow(adminState.chatId, msg.from.id, normalized, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'weights_custom') {
                    const parsed = parseQuestionWeightsInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_weights_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminQuestionWeights(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'schedule_custom') {
                    const parsed = parseScheduleTextInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_schedule_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminScheduleSlots(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'summary_schedule_custom') {
                    const parsed = parseScheduleTextInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_summary_schedule_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminSummaryScheduleSlots(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }
            }
        }
    });

    const formatPollingError = (error) => {
        if (!error) {
            return 'Unknown polling error';
        }

        const parts = [];

        if (error.message) {
            parts.push(error.message);
        }

        if (error.code) {
            parts.push(`code=${error.code}`);
        }

        if (error.response?.statusCode) {
            parts.push(`status=${error.response.statusCode}`);
        }

        if (error.response?.body) {
            try {
                const bodyText = typeof error.response.body === 'string'
                    ? error.response.body
                    : JSON.stringify(error.response.body);
                parts.push(`body=${bodyText}`);
            } catch (_) {
                parts.push('body=[unreadable]');
            }
        }

        if (error instanceof AggregateError && Array.isArray(error.errors)) {
            const childErrors = error.errors
                .map((child) => (child?.message ? child.message : String(child)))
                .filter(Boolean);
            if (childErrors.length) {
                parts.push(`causes=${childErrors.join('; ')}`);
            }
        }

        if (error.stack) {
            parts.push(`stack=${error.stack}`);
        }

        return sanitizeSecrets(parts.join(' | ') || String(error));
    };

    bot.on('polling_error', (error) => {
        const formatted = formatPollingError(error);
        const code = error?.code || error?.response?.body?.error_code;
        if (
            !formatted ||
            code === 'EFATAL' ||
            /query is too old|timeout expired|expired or query ID is invalid/i.test(formatted) ||
            /ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|connect EHOSTUNREACH/i.test(formatted)
        ) {
            return;
        }

        console.error(`[LỖI BOT POLLING]: ${formatted}`);
    });

    console.log('🤖 [Telegram Bot] Đang chạy...');
}


// ==========================================================
// === KHỞI ĐỘNG TẤT CẢ DỊCH VỤ (PHIÊN BẢN MỚI, AN TOÀN) ===
// ==========================================================
async function main() {
    try {
        console.log("Đang khởi động...");

        // Bước 1: Khởi tạo DB
        await db.init();
        await hydrateCoOwners();
        await hydrateBannedUsers();
        await hydrateBannedDevices();

        // Bước 1.5: Hydrate AI preferences từ database
        setAiServiceDatabase(db);
        await hydrateAiModelPreferences();

        // Bước 1.6: Load modular commands
        const commandDeps = {
            buildCloseKeyboard,
            bot,
            db,
            t,
            sendReply: (msg, text, options) => bot.sendMessage(msg.chat.id, text, options),
            getLang: async (msg) => {
                const userId = msg.from?.id?.toString();
                const chatId = msg.chat?.id?.toString();
                const stored = userId ? await db.getUserLanguage(userId) : null;
                return stored?.language || resolveLangCode(msg.from?.language_code || 'vi');
            },
            isOwner: (userId, username) => {
                const { BOT_OWNER_ID, ADDITIONAL_OWNER_USERNAME } = require('./src/config/env');
                return userId === BOT_OWNER_ID || username?.toLowerCase() === (ADDITIONAL_OWNER_USERNAME || '').toLowerCase();
            },
            isCoOwner: async (userId) => db.isCoOwner(userId),
            isGroupAdmin: async (chatId, userId) => {
                try {
                    const member = await bot.getChatMember(chatId, userId);
                    return ['creator', 'administrator'].includes(member.status);
                } catch {
                    return false;
                }
            }
        };
        await loadCommands(commandDeps);
        startHotReload(commandDeps);
        console.log(`[CommandSystem] Loaded ${commandRegistry.size} modular commands`);

        // Bước 2: Bật API
        startApiServer();

        // Bước 3: Bật Bot
        startTelegramBot();
        startCheckinScheduler();
        startPriceAlertScheduler();

        console.log("✅ Tất cả dịch vụ đã sẵn sàng!");

    } catch (error) {
        console.error("Lỗi khởi động nghiêm trọng:", error);
        process.exit(1);
    }
}

main(); // Chạy hàm khởi động chính
