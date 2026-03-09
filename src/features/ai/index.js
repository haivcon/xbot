const { t } = require('../../i18n');
const logger = require('../../core/logger');
const log = logger.child('Ai');
const { GEMINI_API_KEYS, GROQ_API_KEYS, OPENAI_API_KEYS, startVideoFileIds } = require('../../config');
const { buildCloseKeyboard, buildAiUsageKeyboard } = require('../../utils/builders');
const { sendReply, buildThreadedOptions } = require('../../utils/chat');
const { runGeminiCompletion, runGoogleAudioCompletion, runGoogleImageRequest, runGroqCompletion, runOpenAiAudioCompletion, runOpenAiCompletion, runOpenAiImageRequest } = require('./gemini');
const { detectImageAction, isQuotaOrRateLimitError, isOpenAiBillingError, isGeminiApiKeyExpired } = require('./utils');
const { extractAudioSourceFromMessage } = require('../../utils/chat');
const { v4: uuidv4 } = require('uuid');
const { handleAiTtsCommand } = require('./tts');

const aiProviderSelectionSessions = new Map();

function normalizeAiProvider(provider) {
    const normalized = (provider || '').toString().trim().toLowerCase();
    if (normalized === 'groq') {
        return 'groq';
    }
    if (normalized === 'openai' || normalized === 'chatgpt') {
        return 'openai';
    }
    return 'google';
}

function buildAiProviderMeta(lang, provider) {
    const normalized = normalizeAiProvider(provider);
    if (normalized === 'openai') {
        return {
            id: 'openai',
            icon: '💬',
            label: t(lang, 'ai_provider_openai'),
            menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_openai') }),
            menuHint: t(lang, 'ai_api_menu_hint_openai'),
            addHint: t(lang, 'ai_api_add_hint_openai'),
            addPrompt: t(lang, 'ai_api_add_prompt_openai'),
            addPlaceholder: t(lang, 'ai_api_add_placeholder_openai'),
            getKeyLabel: t(lang, 'ai_api_get_key_openai'),
            getKeyUrl: 'https://platform.openai.com/api-keys',
            infoTitle: t(lang, 'ai_api_info_title'),
            infoText: [
                t(lang, 'ai_api_usecases_openai', { url: 'https://platform.openai.com/api-keys' }),
                t(lang, 'ai_api_audio_openai'),
                t(lang, 'ai_api_image_notes_openai')
            ]
                .filter(Boolean)
                .join('\n\n')
        };
    }
    if (normalized === 'groq') {
        return {
            id: 'groq',
            icon: '🚀',
            label: t(lang, 'ai_provider_groq'),
            menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_groq') }),
            menuHint: t(lang, 'ai_api_menu_hint_groq'),
            addHint: t(lang, 'ai_api_add_hint_groq'),
            addPrompt: t(lang, 'ai_api_add_prompt_groq'),
            addPlaceholder: t(lang, 'ai_api_add_placeholder_groq'),
            getKeyLabel: t(lang, 'ai_api_get_key_groq'),
            getKeyUrl: 'https://console.groq.com/keys',
            infoTitle: t(lang, 'ai_api_info_title'),
            infoText: t(lang, 'ai_api_usecases_groq', { url: 'https://console.groq.com/keys' })
        };
    }

    return {
        id: 'google',
        icon: '🌐',
        label: t(lang, 'ai_provider_google'),
        menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_google') }),
        menuHint: t(lang, 'ai_api_menu_hint'),
        addHint: t(lang, 'ai_api_add_hint'),
        addPrompt: t(lang, 'ai_api_add_prompt'),
        addPlaceholder: t(lang, 'ai_api_add_placeholder'),
        getKeyLabel: t(lang, 'ai_api_get_key'),
        getKeyUrl: 'https://aistudio.google.com/api-keys',
        infoTitle: t(lang, 'ai_api_info_title'),
        infoText: [
            t(lang, 'ai_api_usecases_google', { url: 'https://aistudio.google.com/api-keys' }),
            t(lang, 'ai_api_audio_google'),
            t(lang, 'ai_api_image_notes_google')
        ]
            .filter(Boolean)
            .join('\n\n')
    };
}

function purgeAiProviderSelections(maxAgeMs = 10 * 60 * 1000) {
    const now = Date.now();
    for (const [token, session] of aiProviderSelectionSessions.entries()) {
        if (session?.createdAt && now - session.createdAt > maxAgeMs) {
            aiProviderSelectionSessions.delete(token);
        }
    }
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
        log.error(`Failed to send intro media: ${error.message}`);
        disableStartVideo(startVideo, error);
    }

    return false;
}



module.exports = {
    normalizeAiProvider,
    buildAiProviderMeta,
    purgeAiProviderSelections,
    aiProviderSelectionSessions,
    sendAiIntroMedia,
    handleAiTtsCommand,
    runAiRequestWithProvider
}
