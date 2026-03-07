const bot = require('../core/bot');
const { startVideoFileIds } = require('../config');
const { enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');

const rmchatBotMessages = new Map();
const rmchatUserMessages = new Map();

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

function extractThreadId(source) {
    if (!source) {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(source, 'message_thread_id') && source.message_thread_id !== undefined && source.message_thread_id !== null) {
        return source.message_thread_id;
    }

    if (source.message && Object.prototype.hasOwnProperty.call(source.message, 'message_thread_id') && source.message.message_thread_id !== undefined && source.message.message_thread_id !== null) {
        return source.message.message_thread_id;
    }

    return null;
}

function buildThreadedOptions(source, options = {}) {
    const threadId = extractThreadId(source);
    if (threadId === undefined || threadId === null) {
        return { ...options };
    }

    return { ...options, message_thread_id: threadId };
}

async function sendMessageRespectingThread(chatId, source, text, options = {}) {
    const threadedOptions = buildThreadedOptions(source, options);
    const sendWithOptions = async (opts) => bot.sendMessage(chatId, text, opts);

    try {
        return await sendWithOptions(threadedOptions);
    } catch (error) {
        let lastError = error;
        const errorCode = error?.response?.body?.error_code;
        const description = error?.response?.body?.description || '';
        const hasThread = Object.prototype.hasOwnProperty.call(threadedOptions, 'message_thread_id');

        if (hasThread && errorCode === 400) {
            const lowered = description.toLowerCase();
            const shouldFallback =
                lowered.includes('message thread not found') ||
                lowered.includes('topic is closed') ||
                lowered.includes('forum topic is closed') ||
                lowered.includes('forum topics are disabled') ||
                lowered.includes('forum is disabled') ||
                lowered.includes('wrong message thread id specified') ||
                lowered.includes("can't send messages to the topic") ||
                lowered.includes('not enough rights to send in the topic') ||
                lowered.includes('not enough rights to send messages in the topic');

            if (shouldFallback) {
                console.warn(`[ThreadFallback] Gửi tin nhắn tới thread ${threadedOptions.message_thread_id} thất bại (${description}). Thử gửi không chỉ định thread.`);
                const fallbackOptions = { ...options };
                try {
                    return await sendWithOptions(fallbackOptions);
                } catch (fallbackError) {
                    lastError = fallbackError;
                }
            }
        }

        const parseDescription = (lastError?.response?.body?.description || lastError?.message || '').toLowerCase();
        const parseErrorCode = lastError?.response?.body?.error_code;
        const isParseError =
            parseErrorCode === 400 &&
            (/parse entities/.test(parseDescription) || /can't parse entities/.test(parseDescription) || /pre entity/.test(parseDescription));

        if (isParseError) {
            const plainOptions = buildThreadedOptions(source, { ...options });
            delete plainOptions.parse_mode;
            delete plainOptions.entities;
            console.warn(`[MarkdownFallback] Failed to parse entities (${parseDescription}). Sending as plain text.`);
            try {
                return await sendWithOptions(plainOptions);
            } catch (fallbackError) {
                lastError = fallbackError;
            }
        }

        throw lastError;
    }
}

function sendReply(sourceMessage, text, options = {}) {
    if (!sourceMessage || !sourceMessage.chat) {
        throw new Error('sendReply requires a message with chat information');
    }

    const targetChatId = sourceMessage.ownerRedirectId || sourceMessage.chat.id;
    return sendMessageRespectingThread(targetChatId, sourceMessage, text, options);
}

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

async function handleStartNoToken(msg) {
    if (await enforceOwnerCommandLimit(msg, 'start')) {
        return;
    }
    const lang = await getLang(msg);
    const message = t(lang, 'welcome_generic');
    const videoOptions = buildThreadedOptions(msg, { caption: message, parse_mode: 'Markdown' });
    const maxAttempts = startVideoFileIds.length;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const startVideo = pickStartVideo();
        if (!startVideo) {
            break;
        }

        try {
            await bot.sendVideo(msg.chat.id, startVideo, videoOptions);
            return;
        } catch (error) {
            console.error(`[Start] Failed to send intro video: ${error.message}`);
            disableStartVideo(startVideo, error);
        }
    }

    sendReply(msg, message, { parse_mode: 'Markdown' });
}

module.exports = {
    rmchatBotMessages,
    rmchatUserMessages,
    rememberRmchatMessage,
    sendReply,
    handleStartNoToken
}