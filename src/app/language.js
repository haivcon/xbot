const db = require('../../db.js');
const logger = require('../core/logger');
const log = logger.child('Lang');
const { resolveLangCode } = require('../core/i18n');
const { defaultLang } = require('../config/env');

function detectLanguageFromText(text) {
    if (!text || typeof text !== 'string') {
        return { lang: null, confidence: 0 };
    }

    const sample = text.trim();
    if (!sample) return { lang: null, confidence: 0 };

    // Basic script detection
    const hasCyrillic = /[А-Яа-яЁё]/.test(sample);
    if (hasCyrillic) return { lang: 'ru', confidence: 0.9 };

    const hasKorean = /[가-힣]/.test(sample);
    if (hasKorean) return { lang: 'ko', confidence: 0.9 };

    const hasChinese = /[\u4E00-\u9FFF]/.test(sample);
    if (hasChinese) return { lang: 'zh', confidence: 0.9 };

    // Vietnamese diacritics heuristic
    const viMarks = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệìíỉĩịòóỏõọồốổỗộờớởỡợụủùúũưựữửứừỳýỷỹỵ]/i;
    if (viMarks.test(sample)) return { lang: 'vi', confidence: 0.85 };

    // Common Indonesian words
    const idWords = /\b(saya|kamu|anda|tidak|yang|dengan|akan|itu|ini)\b/i;
    if (idWords.test(sample)) return { lang: 'id', confidence: 0.6 };

    // Default to English
    return { lang: 'en', confidence: 0.5 };
}

async function getLang(msg) {
    if (!msg || !msg.chat) {
        return defaultLang;
    }

    const chatId = msg.chat.id.toString();
    const topicId = Object.prototype.hasOwnProperty.call(msg, 'message_thread_id') ? msg.message_thread_id : null;
    const detectedLang = resolveLangCode(msg?.from?.language_code);
    const isGroupChat = msg.chat?.type === 'group' || msg.chat?.type === 'supergroup';

    if (isGroupChat && topicId !== null && topicId !== undefined) {
        try {
            const topicLang = await resolveTopicLanguage(chatId, topicId, null);
            if (topicLang) {
                return topicLang;
            }
        } catch (error) {
            log.child('TopicLang').warn(`Khong the doc lang cho topic ${chatId}/${topicId}: ${error.message}`);
        }
    }

    const info = await db.getUserLanguageInfo(chatId);
    if (info) {
        const savedLang = resolveLangCode(info.lang);
        const source = info.source || 'auto';

        if (source === 'manual') {
            if (savedLang !== info.lang) {
                await db.setLanguage(chatId, savedLang);
            }
            return savedLang;
        }

        // Try auto-detect from message text/caption
        const textSample = (msg.text || msg.caption || '').trim();
        const detection = detectLanguageFromText(textSample);
        const candidateLang = detection.confidence >= 0.6 ? resolveLangCode(detection.lang) : savedLang;

        if (candidateLang !== savedLang) {
            await db.setLanguageAuto(chatId, candidateLang);
            return candidateLang;
        }

        if (savedLang !== info.lang || source !== info.source || candidateLang !== savedLang) {
            await db.setLanguageAuto(chatId, candidateLang);
        }

        return candidateLang;
    }

    await db.setLanguageAuto(chatId, detectedLang);
    return detectedLang;
}

async function resolveNotificationLanguage(chatId, fallbackLang) {
    try {
        if (chatId) {
            const info = await db.getUserLanguageInfo(chatId);
            if (info && info.lang) {
                return resolveLangCode(info.lang);
            }
        }
    } catch (error) {
        log.child('Notify').warn(`Khong the doc ngon ngu da luu cho ${chatId}: ${error.message}`);
    }

    return resolveLangCode(fallbackLang || defaultLang);
}

async function resolveGroupLanguage(chatId, fallbackLang, topicId = null) {
    const resolvedFallback = resolveLangCode(fallbackLang || defaultLang);
    if (!chatId) {
        return resolvedFallback;
    }
    const chatKey = chatId.toString();

    if (topicId !== undefined && topicId !== null) {
        const topicLang = await resolveTopicLanguage(chatKey, topicId, null);
        if (topicLang) {
            return topicLang;
        }
    }

    try {
        const info = await db.getUserLanguageInfo(chatKey);
        if (info?.lang) {
            return resolveLangCode(info.lang);
        }
    } catch (error) {
        log.child('Notify').warn(`Khong the doc ngon ngu da luu cho nhom ${chatKey}: ${error.message}`);
    }

    try {
        const subscription = await db.getGroupSubscription(chatKey);
        if (subscription && subscription.lang) {
            return resolveLangCode(subscription.lang);
        }
    } catch (error) {
        log.child('Notify').warn(`Khong the doc ngon ngu nhom cho ${chatKey}: ${error.message}`);
    }

    return resolvedFallback;
}

async function resolveTopicLanguage(chatId, topicId, fallbackLang) {
    const fallback = await resolveGroupLanguage(chatId, fallbackLang);
    if (!chatId || topicId === undefined || topicId === null) {
        return fallback;
    }

    try {
        const info = await db.getTopicLanguage(chatId.toString(), topicId.toString());
        if (info?.lang) {
            return resolveLangCode(info.lang);
        }
    } catch (error) {
        log.child('Notify').warn(`Khong the doc ngon ngu topic ${chatId}/${topicId}: ${error.message}`);
    }

    return fallback;
}

module.exports = {
    getLang,
    resolveNotificationLanguage,
    resolveGroupLanguage,
    resolveTopicLanguage
};
