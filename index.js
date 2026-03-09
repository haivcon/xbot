// Đảm bảo dotenv được gọi ĐẦU TIÊN
require('dotenv').config();
const logger = require('./src/core/logger');
const log = logger.child('Bot');

// Enable automatic filename/content-type detection to silence upcoming file send deprecations
process.env.NTBA_FIX_350 = process.env.NTBA_FIX_350 || '1';

// Global error handlers - prevent crashes and log errors
process.on('unhandledRejection', (reason, promise) => {
    logger.child('Process').error('Unhandled Rejection', reason);
});

process.on('uncaughtException', (err) => {
    logger.child('Process').error('Uncaught Exception', err);
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
const { createLanguageHandlers } = require('./src/app/languageHandlers');
const { createCallbackRouter } = require('./src/bot/handlers/callbackRouter');
const registerHelpCallbacks = require('./src/bot/handlers/helpCallbacks');
const registerAdminHubCallbacks = require('./src/bot/handlers/adminHubCallbacks');
const registerOwnerCallbacks = require('./src/bot/handlers/ownerCallbacks');
const handleCheckinAdminCallback = require('./src/bot/handlers/checkinAdminCallbacks');
const handleWelcomeAdminCallback = require('./src/bot/handlers/welcomeAdminCallbacks');
const handleWalletCallback = require('./src/bot/handlers/walletCallbacks');
const handleMiscCallback = require('./src/bot/handlers/miscCallbacks');
const handlePrivateMessageFlows = require('./src/bot/handlers/privateMessageFlows');
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
    log.error('FATAL: Missing TELEGRAM_TOKEN in .env!');
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

// Language handlers — extracted to src/app/languageHandlers.js
const {
    buildLanguagePickerView,
    buildLanguageChangeFeedback,
    handleLangCommand,
    handleLanguageCommand,
    handleTopicLanguageCommand,
    handleLanguageSelection,
    handleTopicLanguageSelection,
    formatLanguageLabel,
    buildLanguageTopicLink,
    buildLanguageAdminView,
    sendLanguageAdminMenu,
    LANGUAGE_MENU_AUTO_CLOSE_MS,
    LANGUAGE_MENU_FEEDBACK_MS
} = createLanguageHandlers({
    bot, db, t, defaultLang, escapeHtml,
    getLang, sendReply, scheduleMessageDeletion,
    isGroupAdmin, resolveGroupLanguage, resolveTopicLanguage,
    resolveNotificationLanguage,
    buildCloseKeyboard, buildLanguageMenuText, buildLanguageKeyboardWithPrefix,
    findLanguageOption, openAdminHub, languageHubSessions
});

function startTelegramBot() {

    // ── Callback Router ─────────────────────────────
    const cbRouter = createCallbackRouter();

    // Close / noop / separator — just delete or ack
    const closeHandler = async (query, _params, ctx) => {
        if (query.message?.chat?.id && query.message?.message_id) {
            try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { /* ignore */ }
        }
        await bot.answerCallbackQuery(ctx.queryId);
    };
    cbRouter.on('ui_close', closeHandler);
    cbRouter.on('aiclose', closeHandler);
    cbRouter.on('help_close', async (query, _params, ctx) => {
        if (query.message?.chat?.id && query.message?.message_id) {
            try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { /* ignore */ }
            clearHelpMessageState(query.message.chat.id.toString(), query.message.message_id);
        }
        await bot.answerCallbackQuery(ctx.queryId);
    });
    cbRouter.on('lang_close', async (query, _params, ctx) => {
        if (query.message?.chat?.id && query.message?.message_id) {
            try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { /* ignore */ }
        }
        await bot.answerCallbackQuery(ctx.queryId, { text: '✅' });
    });
    cbRouter.on('help_separator', async (_query, _params, ctx) => {
        await bot.answerCallbackQuery(ctx.queryId);
    });
    cbRouter.on('wallet_chain_menu_noop', async (_query, _params, ctx) => {
        await bot.answerCallbackQuery(ctx.queryId);
    });
    cbRouter.on('checkin_admin_noop', async (_query, _params, ctx) => {
        await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_menu_board_hint') });
    });

    log.child('Router').info(`Callback router initialized (${cbRouter.stats().total} routes)`);

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
                    log.error(`Failed to register commands for scope ${scope?.type} lang=${langCode}: ${error.message}${body}`);
                }
                await delay(500);
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
                log.child('ModularCmd').error(`Error in /${cmd.name}:`, error.message);
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
                    log.child('ModularCmd').error(`Error in /${alias} (→/${cmd.name}):`, error.message);
                    await sendReply(msg, t(lang, 'command_execution_error'));
                }
                commandRegistry.recordStats(cmd.name, Date.now() - startTime, hasError);
            });
        }
    }
    log.info(`Registered ${modularCommands.length} modular commands with ${modularCommands.reduce((sum, c) => sum + (c.aliases?.length || 0), 0)} aliases`);


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
        log.child('Start').warn(`Disabled intro video ID after failure: ${videoId}${reason}`);
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
            const p = bot.sendVideo(msg.chat.id, startVideo, videoOptions);
            p.catch(() => { }); // suppress request-promise duplicate rejection
            await p;
            return true;
        } catch (error) {
            log.child('AI').error(`Failed to send intro media: ${error.message}`);
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

    // Register extracted callback modules (must be after helpCommandExecutors)
    registerHelpCallbacks(cbRouter, {
        bot, t, getLang, sendReply,
        resolveHelpGroups, buildHelpText, buildHelpKeyboard, getDefaultHelpGroup,
        saveHelpMessageState, helpCommandExecutors, sanitizeSecrets
    });
    log.child('Router').info(`+ Help callbacks (${cbRouter.stats().total} routes total)`);

    registerAdminHubCallbacks(cbRouter, {
        bot, t, adminHubSessions, openAdminHub, clearAdminContext,
        isGroupAdmin, sendWelcomeAdminMenu, sendModerationAdminPanel,
        sendLanguageAdminMenu, sendPriceAdminMenu, sendAdminMenu
    });
    log.child('Router').info(`+ AdminHub callbacks (${cbRouter.stats().total} routes total)`);

    registerOwnerCallbacks(cbRouter, {
        bot, t, isOwner, ownerActionStates, clearOwnerAction, buildCloseKeyboard,
        getOwnerListState, updateOwnerListState, resolveOwnerListFilters, renderOwnerListState, exportOwnerList,
        getDefaultOwnerGroup, buildOwnerMenuText, buildOwnerMenuKeyboard,
        buildOwnerCommandLimitKeyboard, buildOwnerAiCommandLimitKeyboard,
        commandRegistry, sendOwnerUserOverview, sendOwnerApiStats, sendOwnerAiStats,
        sendOwnerGroupDashboard, sendOwnerGroupDetail, sendOwnerCommandUsageStats,
        autoDeleteInvalidApiKeys, discardOwnerPanelMessage,
        loadActiveGroupProfiles, formatGroupAddress, isLikelyGroupChatId,
        cleanupGroupProfile, purgeBotMessagesInGroup, toggleBotAnonymousMode
    });
    log.child('Router').info(`+ Owner callbacks (${cbRouter.stats().total} routes total)`);

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

        // ── Router fast path ────────────────────────
        const routed = cbRouter.match(query.data);
        if (routed) {
            await routed.handler(query, routed.params, { queryId, chatId, lang, callbackLang });
            return;
        }

        // ── Checkin admin fast path ─────────────────
        const checkinPrefixes = ['checkin_admin', 'checkin_export', 'checkin_broadcast_page', 'checkin_today_page', 'checkin_summary_page', 'checkin_removal_page', 'checkin_unlock_page', 'checkin_leaderboard_page', 'checkin_emotion'];
        if (checkinPrefixes.some(p => query.data?.startsWith(p))) {
            await handleCheckinAdminCallback(query, { queryId, chatId, lang, callbackLang }, {
                bot, t, db, isGroupAdmin, checkinAdminStates, pendingSecretMessages,
                closeAdminMenu, sendAdminMenu, resolveAdminMenuView, ADMIN_MENU_SECTION_CONFIG,
                checkinAdminMenus, sendEphemeralMessage, presentCheckinTopics,
                presentAdminLeaderboardMemberDetail, presentAdminLeaderboardView,
                presentAdminLeaderboardManageList, confirmLeaderboardReset, confirmLeaderboardRemoval,
                promptAdminForRemoval, promptAdminPoints, promptAdminSchedule,
                promptAdminSecretMessage, promptAdminSummaryReset, promptAdminSummarySchedule,
                promptAdminSummaryWindow, promptAdminUnlock, promptCheckinTitleTemplate,
                promptLeaderboardReset, resetAdminScheduleSlots, resetAdminSummarySchedule,
                resetCheckinTitleTemplate, setAdminPoints, setAdminDailyPoints, setAdminSummaryWindow,
                setAdminScheduleSlots, setAdminSummaryScheduleSlots,
                syncAdminSummaryScheduleWithAuto, disableAdminSummarySchedule,
                setAdminQuestionWeights, parseQuestionWeightsInput, showQuestionWeightMenu,
                buildLeaderboardText, buildLeaderboardModeKeyboard, buildLeaderboardHistoryLines,
                sendMessageRespectingThread, buildCloseKeyboard, sanitizeSecrets,
                sendCheckinAnnouncement, sendSummaryAnnouncement,
                sendTodayCheckinList, sendSummaryWindowCheckinList,
                handleExportRequest, executeAdminRemoval, executeAdminUnlock, executeAdminSummaryReset,
                getAdminContextChatId, setAdminContextParam,
                getGroupCheckinSettings, formatDateForTimezone, resolveGroupLanguage, resolveMemberProfile,
                CHECKIN_DEFAULT_TIMEZONE, CHECKIN_ADMIN_DM_MAX_RECIPIENTS
            });
            return;
        }

        // ── Welcome admin fast path ─────────────────
        if (query.data?.startsWith('welcome_admin_')) {
            await handleWelcomeAdminCallback(query, { queryId, chatId, callbackLang }, {
                bot, t, isGroupAdmin, welcomeAdminStates, welcomeAdminMenus,
                sendWelcomeAdminMenu, presentWelcomeTopics,
                setWelcomeQuestionWeights, showWelcomeWeightMenu,
                resetWelcomeTitleTemplate, toggleWelcomeVerification,
                setWelcomeAction, getWelcomeVerificationSettings
            });
            return;
        }

        // ── Wallet fast path ─────────────────────────
        const walletPrefixes = ['wallet_overview', 'wallet_chain', 'wallet_pick|', 'wallet_dexp|', 'wallet_token_', 'wallet_manage', 'walletmgr|', 'wallet_remove|'];
        if (walletPrefixes.some(p => query.data?.startsWith(p))) {
            await handleWalletCallback(query, { queryId, chatId, callbackLang }, {
                bot, t, db, buildWalletBalanceTextInline, buildWalletChainMenu,
                buildWalletManagerMenu, buildWalletTokenActionResult,
                fetchLiveWalletTokens, fetchOkxBalanceSupportedChains,
                sendWalletTokenExtraTexts, startRegisterWizard,
                buildCloseKeyboard, appendCloseButton,
                resolveWalletChainCallback, resolveWalletTokenContext,
                normalizeAddressSafe, formatChainLabel, createWalletChainCallback,
                buildWalletTokenButtonRows, buildPortfolioEmbedUrl, shortenAddress,
                buildWalletTokenMenu, buildThreadedOptions, isTelegramMessageNotModifiedError,
                teardownWalletWatcher
            });
            return;
        }
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
                    log.child('AutoConfirm').info('✓ Retrieved original text from pending confirmations');
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
                    log.child('AutoConfirm').info('✓ Cancel pressed, routing to /aib:', originalText.slice(0, 50) + '...');

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
                    log.child('AutoConfirm').info('✓ Cancel pressed, no original text found');
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
                log.child('AutoConfirm').info('✓ Executing confirmed command:', commandText);

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
                log.child('VoiceConfirm').info('Cancel pressed, re-processing for normal response');
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
                    log.child('VoiceConfirm').error('Re-processing failed:', error.message);
                    await bot.sendMessage(msg.chat.id, t(originalLang, 'ai_live_audio_error') || '⚠️ Voice processing failed.', buildThreadedOptions(msg, {}));
                }

                return;
            }

            if (action === 'execute') {
                // Execute the function
                log.child('VoiceConfirm').info('Execute pressed, running function');
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
                    log.child('VoiceConfirm').error('Function execution failed:', error.message);
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
                log.child('AI').warn(`Failed to render TTS settings: ${error.message}`);
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
                    log.child('AIAPI').warn(`Cannot DM ${query.from.id}: ${error.message}`);
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
                    log.child('AI').warn(`Failed to render model selection: ${error.message}`);
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
                    log.child('AI').warn(`Failed to go back to API menu: ${error.message}`);
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

        // AI Usage Dashboard callback
        // ── Misc callbacks fast path ────────────────
        const miscResult = await handleMiscCallback(query, { queryId, chatId, lang, callbackLang }, {
            bot, t, db, isGroupAdmin, isUserAdmin,
            buildSyntheticCommandMessage, handleAiUsageDashboard,
            getUserPersona, setUserPersona, AI_PERSONAS,
            getPersonaStrings, getPersonaLabel, buildPersonaKeyboard, promptCustomPersonaInput,
            executeRmchatAction, buildRmchatKeyboard, sendMessageRespectingThread, scheduleMessageDeletion,
            handleDonateDevCommand, handleDonateCommunityManageCommand, buildCommunityDonationBroadcastText,
            getWarnState, clearScheduledUnmute, scheduleAutomaticUnmute, getGroupSettings,
            sendModerationAdminPanel, extractThreadId, adminBroadcastPrompts,
            ensureFilterState, buildFiltersListView, escapeHtml,
            sendLanguageAdminMenu, languageHubSessions,
            initiateCheckinChallenge, answerCheckinStartPrompt,
            handleCheckinAnswerCallback, handleWelcomeAnswer,
            handleEmotionCallback, handleGoalCallback,
            resolveGroupLanguage, buildLeaderboardText,
            resolveLangCode, handleTopicLanguageSelection, handleLanguageSelection,
            featureTopics, resolveNotificationLanguage
        });
        if (miscResult !== false) return;

        const handledFeatureTopic = await featureTopics.handleCallback({ query, callbackLang, chatId });
        if (handledFeatureTopic) {
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
                log.child('IdTelegram').error(`Failed to deliver details: ${error.message}`);
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
                log.child('AdminBroadcast').error(`Failed to forward message: ${error.message}`);
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
            const handled = await handlePrivateMessageFlows(msg, { userId, lang }, {
                bot, t, db, sendReply, sendEphemeralMessage,
                sendMessageRespectingThread, buildCloseKeyboard,
                resolveNotificationLanguage, scheduleMessageDeletion,
                registerWizardStates, parseRegisterPayload, sendWalletManagerMenu,
                shortenAddress, normalizeAddress,
                txhashWizardStates, deliverTxhashDetail,
                tokenWizardStates, deliverTokenDetail,
                contractWizardStates, buildContractLookupUrl, formatCopyableValueHtml, escapeHtml,
                handlePriceWizardMessage,
                pendingSecretMessages, sendAdminMenu,
                welcomeAdminStates, parseQuestionWeightsInput,
                setWelcomeQuestionWeights, setWelcomeTimeLimit,
                setWelcomeAttemptLimit, setWelcomeTitleTemplate,
                checkinAdminStates, setAdminDailyPoints, setCheckinTitleTemplate,
                setAdminSummaryWindow, setAdminQuestionWeights,
                setAdminScheduleSlots, setAdminSummaryScheduleSlots,
                parseScheduleTextInput,
                aiApiAddPrompts, handleAiApiSubmission
            });
            if (handled !== false) return;
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

        log.child('LIBOTPOLLING').error(`: ${formatted}`);
    });

    log.info('🤖 [Telegram Bot] Đang chạy...');
}


// ==========================================================
// === KHỞI ĐỘNG TẤT CẢ DỊCH VỤ (PHIÊN BẢN MỚI, AN TOÀN) ===
// ==========================================================
async function main() {
    try {
        log.info('Đang khởi động...');

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
        logger.child('CommandSystem').info(`Loaded ${commandRegistry.size} modular commands`);

        // Bước 2: Bật API
        startApiServer();

        // Bước 3: Bật Bot
        startTelegramBot();
        startCheckinScheduler();
        startPriceAlertScheduler();

        log.info('✅ Tất cả dịch vụ đã sẵn sàng!');

    } catch (error) {
        log.error('Lỗi khởi động nghiêm trọng', error);
        process.exit(1);
    }
}

main(); // Chạy hàm khởi động chính

// ═══════════════════════════════════════════════════════
// Graceful Shutdown — protect pending swap/transfer ops
// ═══════════════════════════════════════════════════════
let isShuttingDown = false;
function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.warn(`Received ${signal}. Graceful shutdown...`);
    try {
        bot.stopPolling({ cancel: true });
        log.info('Telegram polling stopped.');
    } catch (err) {
        log.error('Error stopping polling', err);
    }
    // Wait for pending operations (swaps, transfers, etc.)
    const GRACE_PERIOD_MS = 5000;
    log.info(`Waiting ${GRACE_PERIOD_MS / 1000}s for pending operations...`);
    setTimeout(() => {
        log.info('Shutdown complete. Goodbye! 👋');
        process.exit(0);
    }, GRACE_PERIOD_MS);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
