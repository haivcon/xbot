/**
 * AI Completions Helper Module
 * 
 * Provides shared utilities for AI completion functions.
 * These helpers reduce code duplication in runGeminiCompletion,
 * runGroqCompletion, and runOpenAiCompletion.
 */

/**
 * Initialize response pools based on available keys
 * @param {Object} options
 * @param {Array} options.personalKeys - User's personal API keys
 * @param {Array} options.serverKeys - Server-wide API keys
 * @param {Set} options.userDisabledSet - Set of disabled key indices for user
 * @param {Set} options.serverDisabledSet - Server disabled key set
 * @param {Object} options.serverLimitState - Server limit state { blocked: boolean }
 * @returns {Array} Array of pool objects { type: 'user'|'server', keys, disabledSet }
 */
function initializeResponsePools({
    personalKeys = [],
    serverKeys = [],
    userDisabledSet,
    serverDisabledSet,
    serverLimitState = {}
}) {
    const pools = [];

    if (personalKeys.length) {
        pools.push({
            type: 'user',
            keys: personalKeys,
            disabledSet: userDisabledSet || new Set()
        });
    }

    if (!serverLimitState.blocked && serverKeys.length) {
        pools.push({
            type: 'server',
            keys: serverKeys,
            disabledSet: serverDisabledSet || new Set()
        });
    }

    return pools;
}

/**
 * Build completion response text with provider notice and formatting
 * @param {Object} options
 * @param {Function} options.t - i18n translation function
 * @param {string} options.lang - Language code
 * @param {string} options.aiResponse - Raw AI response text
 * @param {Object} options.providerMeta - Provider metadata { label }
 * @param {string} options.keySource - 'user' or 'server'
 * @param {string|null} options.limitNotice - Optional limit notice
 * @param {Function} options.escapeMarkdownV2 - Markdown escaping function
 * @param {Function} options.decorateWithContextualIcons - Icon decoration function
 * @param {Function} options.convertMarkdownToTelegram - Markdown conversion function
 * @returns {string} Formatted reply text
 */
function buildCompletionReplyText({
    t,
    lang,
    aiResponse,
    providerMeta,
    keySource,
    limitNotice,
    escapeMarkdownV2,
    decorateWithContextualIcons,
    convertMarkdownToTelegram,
    modelLine = null,
    extraLines = []
}) {
    const body = (aiResponse || '').trim() || t(lang, 'ai_error');

    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));

    if (modelLine) {
        noticePrefix.push(escapeMarkdownV2(modelLine));
    }

    for (const line of extraLines) {
        noticePrefix.push(escapeMarkdownV2(line));
    }

    if (limitNotice && keySource === 'server') {
        noticePrefix.push(escapeMarkdownV2(limitNotice));
    }

    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const decoratedBody = decorateWithContextualIcons(body);
    const convertedBody = convertMarkdownToTelegram(decoratedBody);

    return `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${convertedBody}`;
}

/**
 * Send chunked completion response to Telegram
 * @param {Object} options
 * @param {Object} options.bot - Telegram bot instance
 * @param {Object} options.msg - Original message
 * @param {string} options.replyText - Text to send
 * @param {Object} options.replyMarkup - Reply keyboard
 * @param {Function} options.splitTelegramMarkdownV2Text - Text splitting function
 * @param {Function} options.applyThreadId - Thread ID application function
 * @param {Function} options.sendMessageRespectingThread - Thread-aware send function
 */
async function sendChunkedCompletionResponse({
    msg,
    replyText,
    replyMarkup,
    splitTelegramMarkdownV2Text,
    applyThreadId,
    sendMessageRespectingThread
}) {
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = applyThreadId(msg, {
        reply_markup: replyMarkup,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
    });

    for (const chunk of chunks) {
        if (!chunk || !chunk.trim()) {
            continue;
        }
        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
}

/**
 * Check if all keys in a pool are disabled
 * @param {Set} disabledSet - Set of disabled indices
 * @param {number} keyCount - Total number of keys
 * @returns {boolean} True if all keys are disabled
 */
function areAllKeysDisabled(disabledSet, keyCount) {
    return disabledSet && disabledSet.size >= keyCount;
}

/**
 * Get next key index with rotation
 * @param {number} startIndex - Starting index
 * @param {number} attempt - Current attempt number
 * @param {number} keyCount - Total number of keys
 * @returns {number} Next key index
 */
function getRotatedKeyIndex(startIndex, attempt, keyCount) {
    return (startIndex + attempt) % keyCount;
}

module.exports = {
    initializeResponsePools,
    buildCompletionReplyText,
    sendChunkedCompletionResponse,
    areAllKeysDisabled,
    getRotatedKeyIndex
};
