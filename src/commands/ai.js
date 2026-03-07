const { getLang, t } = require('../../i18n');
const { v4: uuidv4 } = require('uuid');
const { enforceOwnerCommandLimit } = require('../features/auth/utils');
const { ensureDeviceInfo, buildDeviceTargetId } = require('../utils/device');
const db = require('../../db.js');
const { normalizeAiProvider, buildAiProviderMeta, purgeAiProviderSelections, aiProviderSelectionSessions } = require('../features/ai');
const { GEMINI_API_KEYS, GROQ_API_KEYS, OPENAI_API_KEYS } = require('../config');
const { buildAiUsageKeyboard, sendAiIntroMedia } = require('../features/ai');
const { sendReply } = require('../utils/chat');
const { handleAiTtsCommand, runAiRequestWithProvider } = require('../features/ai');
const { extractAudioSourceFromMessage } = require('../utils/chat');

module.exports = {
    command: /^\/ai(?:@[---￿]|[�-�][�-�])?(?:\s|$)/i,
    handler: async (msg) => {
        const lang = await getLang(msg);
        const textOrCaption = (msg.text || msg.caption || '').trim();
        const promptMatch = textOrCaption.match(/^\/ai(?:@[---￿]|[�-�][�-�])?(?:\s+([\s\S]+))?$/i);
        const userPrompt = promptMatch && promptMatch[1] ? promptMatch[1].trim() : '';
        const photos = Array.isArray(msg.photo) ? msg.photo : [];
        const hasPhoto = photos.length > 0;
        const audioSource = extractAudioSourceFromMessage(msg);
        const hasAudio = Boolean(audioSource);
        const isTtsMode = /^tts\b/i.test(userPrompt);
        const ttsPayload = isTtsMode ? userPrompt.replace(/^tts\b/i, '').trim() : '';
        const userId = msg.from?.id?.toString();
        const usageDate = new Date().toISOString().slice(0, 10);
        const deviceInfo = msg.__deviceInfo || await ensureDeviceInfo(msg);
        const deviceTargetId = buildDeviceTargetId(deviceInfo?.deviceId);
        const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
        const googleUserKeys = userApiKeys.filter((entry) => normalizeAiProvider(entry.provider) === 'google').map((entry) => entry.apiKey).filter(Boolean);
        const groqUserKeys = userApiKeys.filter((entry) => normalizeAiProvider(entry.provider) === 'groq').map((entry) => entry.apiKey).filter(Boolean);
        const openAiUserKeys = userApiKeys
            .filter((entry) => normalizeAiProvider(entry.provider) === 'openai')
            .map((entry) => entry.apiKey)
            .filter(Boolean);
        const availableProviders = [];
        if (GEMINI_API_KEYS.length || googleUserKeys.length) {
            availableProviders.push('google');
        }
        if (GROQ_API_KEYS.length || groqUserKeys.length) {
            availableProviders.push('groq');
        }
        if (OPENAI_API_KEYS.length || openAiUserKeys.length) {
            availableProviders.push('openai');
        }

        if (!userPrompt && !hasPhoto && !hasAudio) {
            const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
            const preferredLabel = preferredProvider
                ? buildAiProviderMeta(lang, preferredProvider).label
                : availableProviders.length
                    ? buildAiProviderMeta(lang, availableProviders[0]).label
                    : null;

            const introLines = [t(lang, 'ai_usage_with_api')];
            if (preferredLabel) {
                introLines.push(t(lang, 'ai_provider_default_label', { provider: preferredLabel }));
            }
            introLines.push(t(lang, 'ai_support_reminder'));

            const caption = introLines.filter(Boolean).join('\n\n');
            const replyMarkup = buildAiUsageKeyboard(lang);
            const sentMedia = await sendAiIntroMedia(msg, lang, caption, replyMarkup);

            if (!sentMedia) {
                await sendReply(msg, caption, {
                    parse_mode: 'Markdown',
                    reply_markup: replyMarkup
                });
            }
            return;
        }

        if (!availableProviders.length) {
            await sendReply(msg, t(lang, 'ai_missing_api_key'), {
                parse_mode: 'Markdown',
                reply_markup: buildAiUsageKeyboard(lang)
            });
            return;
        }

        if (await enforceOwnerCommandLimit(msg, 'ai')) {
            return;
        }

        const promptText = userPrompt || t(lang, 'ai_default_prompt');
        const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
        let provider = null;

        if (preferredProvider && availableProviders.includes(preferredProvider)) {
            provider = preferredProvider;
        } else if (availableProviders.length === 1) {
            provider = availableProviders[0];
        }

        purgeAiProviderSelections();

        if (isTtsMode) {
            await handleAiTtsCommand({ msg, lang, payload: ttsPayload, audioSource });
            return;
        }

        if (!provider) {
            const token = uuidv4();
            aiProviderSelectionSessions.set(token, {
                userId,
                lang,
                msg,
                promptText,
                photos,
                hasPhoto,
                audioSource,
                hasAudio,
                deviceTargetId,
                usageDate,
                googleUserKeys,
                groqUserKeys,
                openAiUserKeys,
                createdAt: Date.now()
            });

            const inline_keyboard = availableProviders.map((id) => {
                const meta = buildAiProviderMeta(lang, id);
                return [{ text: `${meta.icon} ${meta.label}`, callback_data: `aiselect|${meta.id}|${token}` }];
            });
            inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

            const providerLabels = availableProviders.map((id) => buildAiProviderMeta(lang, id).label);
            const selectionText = t(lang, 'ai_provider_prompt_dynamic', {
                providers: providerLabels.map((entry) => `• ${entry}`).join('\n')
            });

            const selectionLines = [selectionText];

            if (preferredProvider && availableProviders.includes(preferredProvider)) {
                const preferredLabel = buildAiProviderMeta(lang, preferredProvider).label;
                inline_keyboard.unshift([{ text: `🧭 ${t(lang, 'ai_provider_default_label', { provider: preferredLabel })}`, callback_data: 'aiapi|default|' + preferredProvider }]);
                selectionLines.push(t(lang, 'ai_provider_default_label', { provider: preferredLabel }));
            }

            await sendReply(msg, selectionLines.join('\n\n'), {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard }
            });
            return;
        }

        await runAiRequestWithProvider({
            msg,
            lang,
            provider,
            promptText,
            photos,
            hasPhoto,
            audioSource,
            hasAudio,
            userId,
            deviceTargetId,
            usageDate,
            googleUserKeys,
            groqUserKeys,
            openAiUserKeys
        });
    }
}