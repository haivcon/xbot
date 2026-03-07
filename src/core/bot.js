const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_TOKEN, BOT_USERNAME } = require('../config/env');
const { rmchatBotMessages } = require('./state');
const { sanitizeSecrets } = require('./sanitize');

if (!TELEGRAM_TOKEN) {
    console.error('LỖI NGHIÊM TRỌNG: Thiếu TELEGRAM_TOKEN trong file .env!');
    process.exit(1);
}

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

const originalSendMessage = bot.sendMessage.bind(bot);
bot.sendMessage = async (chatId, text, options = {}) => {
    const message = await originalSendMessage(chatId, text, options);
    rememberRmchatMessage(rmchatBotMessages, chatId, message?.message_id);
    return message;
};

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

module.exports = {
    bot,
    buildBotStartLink,
    scheduleMessageDeletion,
    sendEphemeralMessage,
    rememberRmchatMessage,
    purgeRmchatMessages
};
