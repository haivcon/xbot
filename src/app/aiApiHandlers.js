const {
    buildAiApiMenu,
    buildAiProviderMeta,
    buildAiUsageKeyboard,
    getAiApiMenuState,
    normalizeAiProvider,
    parseAiApiSubmission,
    rememberAiApiMenuState
} = require('../features/aiService');
const { aiApiAddPrompts, aiApiMenuStates } = require('../core/state');
const logger = require('../core/logger');
const log = logger.child('AiApiHandlers');
const { getPersonaStrings } = require('./personaI18n');

function createAiApiHandlers({ t, bot, db, getLang, buildCloseKeyboard, maskApiKey, escapeHtml }) {
    function resolveThreadId(message, options = {}) {
        return options.message_thread_id
            ?? message?.message_thread_id
            ?? message?.reply_to_message?.message_thread_id
            ?? null;
    }

    async function editOrSendMenuMessage(message, text, options = {}) {
        const hasText = typeof message?.text === 'string' && message.text.trim() !== '';
        const messageThreadId = resolveThreadId(message, options);
        const baseOptions = messageThreadId !== null && messageThreadId !== undefined
            ? { ...options, message_thread_id: messageThreadId }
            : { ...options };

        if (message?.chat?.id && message?.message_id && hasText) {
            try {
                await bot.editMessageText(text, {
                    chat_id: message.chat.id,
                    message_id: message.message_id,
                    ...baseOptions
                });
                return message;
            } catch (error) {
                const description = (error?.response?.body?.description || error.message || '').toString();
                if (description.includes('message is not modified')) {
                    return message;
                }
                log.child('ApiHub').warn(`editMessageText failed, sending new message instead: ${error.message}`);
            }
        }

        if (!message?.chat?.id) {
            return null;
        }

        try {
            return await bot.sendMessage(message.chat.id, text, baseOptions);
        } catch (error) {
            log.child('ApiHub').warn(`sendMessage fallback failed: ${error.message}`);
            return null;
        }
    }

    async function renderAiApiMenuMessage(message, lang, userId, provider = 'google', page = 0, options = {}) {
        const chatId = message?.chat?.id || options.chatId;
        if (!chatId) return;
        const messageThreadId = resolveThreadId(message, options);

        const normalizedProvider = normalizeAiProvider(provider);
        const keys = userId ? await db.listUserAiKeys(userId) : [];
        const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
        const personaInfo = await getUserPersonaInfo(userId, lang);

        // Get TTS config for voice/language display
        let ttsConfig = null;
        if (normalizedProvider === 'google' && userId && db?.getTtsSettings) {
            try {
                const settings = await db.getTtsSettings(userId);
                if (settings) {
                    ttsConfig = { voice: settings.voice || 'Kore', language: settings.language || 'auto' };
                } else {
                    ttsConfig = { voice: 'Kore', language: 'auto' };
                }
            } catch (e) {
                ttsConfig = { voice: 'Kore', language: 'auto' };
            }
        }

        const menu = buildAiApiMenu(keys, lang, normalizedProvider, page, {
            ...options,
            defaultProvider: preferredProvider,
            userId,
            personaInfo,
            ttsConfig
        });
        const renderedMessage = await editOrSendMenuMessage(message || { chat: { id: chatId } }, menu.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: menu.reply_markup,
            ...(messageThreadId !== null && messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {})
        });

        if (renderedMessage) {
            rememberAiApiMenuState(renderedMessage, { ...options, provider: normalizedProvider });
        }
    }

    function formatApiKeyDetails(entries, lang, meta) {
        if (!Array.isArray(entries) || !entries.length) {
            return null;
        }

        const preview = entries.slice(0, 3);
        const body = preview.map((entry) => {
            const name = entry.name && entry.name.trim() ? entry.name.trim() : t(lang, 'ai_api_default_name');
            return `• ${meta.icon} ${escapeHtml(name)} → ${escapeHtml(maskApiKey(entry.apiKey))}`;
        });

        if (entries.length > preview.length) {
            body.push(t(lang, 'api_hub_more_keys', { remaining: entries.length - preview.length }));
        }

        return body.join('\n\n');
    }

    async function getUserPersonaInfo(userId, lang) {
        if (!userId || !db?.getAiMemory) {
            return null;
        }
        const memory = await db.getAiMemory(userId);
        const personaId = memory?.persona || 'default';
        const preferences = memory?.userPreferences || {};
        const customPersona = personaId === 'custom' ? preferences.customPersona : null;
        const { name, desc } = getPersonaStrings(lang, personaId);
        const personaName = personaId === 'custom'
            ? (customPersona?.name || name)
            : name;
        const personaDesc = personaId === 'custom'
            ? (customPersona?.prompt || desc || '')
            : desc || '';
        return {
            id: personaId,
            name: personaName,
            desc: personaDesc
        };
    }

    function buildApiHubMenu(lang, { keys = [], defaultProvider = null } = {}) {
        const googleMeta = buildAiProviderMeta(lang, 'google');
        const groqMeta = buildAiProviderMeta(lang, 'groq');
        const openAiMeta = buildAiProviderMeta(lang, 'openai');
        const preferredLabel = defaultProvider ? buildAiProviderMeta(lang, defaultProvider).label : null;
        const googleEntries = Array.isArray(keys)
            ? keys.filter((entry) => normalizeAiProvider(entry.provider) === 'google')
            : [];
        const groqEntries = Array.isArray(keys)
            ? keys.filter((entry) => normalizeAiProvider(entry.provider) === 'groq')
            : [];
        const openAiEntries = Array.isArray(keys)
            ? keys.filter((entry) => normalizeAiProvider(entry.provider) === 'openai')
            : [];
        const googleCount = googleEntries.length;
        const groqCount = groqEntries.length;
        const openAiCount = openAiEntries.length;
        const totalKeys = googleCount + groqCount + openAiCount;

        // Helper: pad string to width
        const pad = (str, len) => {
            const s = String(str || '');
            return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
        };
        const padStart = (str, len) => {
            const s = String(str || '');
            return s.length >= len ? s.substring(0, len) : ' '.repeat(len - s.length) + s;
        };

        // Build ASCII table for API Keys Summary
        const providerCol = t(lang, 'ai_usage_preferred_provider') || 'Provider';
        const keysCol = t(lang, 'api_hub_table_keys') || 'Keys';
        const statusCol = t(lang, 'api_hub_table_status') || 'Status';

        const col1Width = 12;
        const col2Width = 6;
        const col3Width = 10;
        const tableWidth = col1Width + col2Width + col3Width + 4; // 4 for borders

        // Table header
        const topBorder = `╔${'═'.repeat(col1Width)}╦${'═'.repeat(col2Width)}╦${'═'.repeat(col3Width)}╗`;
        const headerRow = `║${pad(providerCol, col1Width)}║${pad(keysCol, col2Width)}║${pad(statusCol, col3Width)}║`;
        const midBorder = `╠${'═'.repeat(col1Width)}╬${'═'.repeat(col2Width)}╬${'═'.repeat(col3Width)}╣`;
        const rowSeparator = `╠${'═'.repeat(col1Width)}╬${'═'.repeat(col2Width)}╬${'═'.repeat(col3Width)}╣`;
        const bottomBorder = `╚${'═'.repeat(col1Width)}╩${'═'.repeat(col2Width)}╩${'═'.repeat(col3Width)}╝`;

        // Status labels (localized)
        const activeLabel = t(lang, 'api_hub_table_active') || 'Active';
        const readyLabel = t(lang, 'api_hub_table_ready') || 'Ready';
        const inactiveLabel = '-';

        // Data rows
        const googleStatus = defaultProvider === 'google' ? activeLabel : (googleCount > 0 ? readyLabel : inactiveLabel);
        const groqStatus = defaultProvider === 'groq' ? activeLabel : (groqCount > 0 ? readyLabel : inactiveLabel);
        const openaiStatus = defaultProvider === 'openai' ? activeLabel : (openAiCount > 0 ? readyLabel : inactiveLabel);

        const googleRow = `║${pad('Google', col1Width)}║${padStart(googleCount, col2Width)}║${pad(googleStatus, col3Width)}║`;
        const groqRow = `║${pad('Groq', col1Width)}║${padStart(groqCount, col2Width)}║${pad(groqStatus, col3Width)}║`;
        const openaiRow = `║${pad('ChatGPT', col1Width)}║${padStart(openAiCount, col2Width)}║${pad(openaiStatus, col3Width)}║`;

        // Build table with row separators between each provider
        const table = [
            topBorder,
            headerRow,
            midBorder,
            googleRow,
            rowSeparator,
            groqRow,
            rowSeparator,
            openaiRow,
            bottomBorder
        ].join('\n');

        // Build message
        const lines = [
            `✨ <b>${t(lang, 'api_hub_title')}</b>`,
            '',
            `<pre>${table}</pre>`,
            ''
        ];

        // Current provider info
        if (preferredLabel) {
            lines.push(`${t(lang, 'ai_provider_current', { provider: preferredLabel })}`);
            lines.push('');
        }

        // Add clear notes with links OUTSIDE the table
        lines.push(`<b>${t(lang, 'ai_api_info_title') || 'Quick Guide'}:</b>`);
        lines.push('');
        lines.push(`• <b>Google AI</b>: ${t(lang, 'api_hub_ai_desc', { count: googleCount })}`);
        lines.push(`  ${t(lang, 'api_hub_key_portal', { url: googleMeta.getKeyUrl })}`);
        lines.push('');
        lines.push(`• <b>Groq</b>: ${t(lang, 'api_hub_groq_desc', { count: groqCount })}`);
        lines.push(`  ${t(lang, 'api_hub_key_portal', { url: groqMeta.getKeyUrl })}`);
        lines.push('');
        lines.push(`• <b>ChatGPT</b>: ${t(lang, 'api_hub_openai_desc', { count: openAiCount })}`);
        lines.push(`  ${t(lang, 'api_hub_key_portal', { url: openAiMeta.getKeyUrl })}`);
        lines.push('');
        lines.push(t(lang, 'ai_support_reminder_html'));

        const inline_keyboard = [
            [{ text: `${googleMeta.icon} ${t(lang, 'api_hub_ai_button', { count: googleCount })}`, callback_data: 'apihub|ai|google|0' }],
            [{ text: `${groqMeta.icon} ${t(lang, 'api_hub_groq_button', { count: groqCount })}`, callback_data: 'apihub|ai|groq|0' }],
            [{ text: `${openAiMeta.icon} ${t(lang, 'api_hub_openai_button', { count: openAiCount })}`, callback_data: 'apihub|ai|openai|0' }],
            [{ text: `📊 ${t(lang, 'ai_usage_dashboard_button') || 'AI Statistics'}`, callback_data: 'ai_usage_dashboard' }],
            [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
        ];

        return {
            text: lines.join('\n'),
            reply_markup: { inline_keyboard }
        };
    }

    async function renderApiHubMessage(message, lang, userId, options = {}) {
        const chatId = message?.chat?.id || options.chatId;
        if (!chatId) {
            return;
        }
        const messageThreadId = resolveThreadId(message, options);
        const keys = userId ? await db.listUserAiKeys(userId) : [];
        const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
        const menu = buildApiHubMenu(lang, { keys, defaultProvider: preferredProvider });

        await editOrSendMenuMessage(message || { chat: { id: chatId } }, menu.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: menu.reply_markup,
            ...(messageThreadId !== null && messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {})
        });
    }

    async function handleApiCommand(msg, page = 0) {
        const lang = await getLang(msg);
        const userId = msg.from?.id?.toString();
        if (!userId) {
            return;
        }

        const keys = await db.listUserAiKeys(userId);
        const preferredProvider = await db.getUserAiProvider(userId);
        const menu = buildApiHubMenu(lang, { keys, defaultProvider: preferredProvider });

        const messageThreadId = msg?.message_thread_id ?? msg?.reply_to_message?.message_thread_id ?? null;
        await bot.sendMessage(msg.chat.id, menu.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: menu.reply_markup,
            ...(messageThreadId !== null && messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {})
        });
    }

    async function startAiApiAddPrompt(userId, lang, provider = 'google') {
        if (!userId) {
            return null;
        }

        if (await db.isUserBlockedFromApiKeys(userId)) {
            await bot.sendMessage(userId, t(lang, 'ai_api_blocked_notice'), {
                reply_markup: buildCloseKeyboard(lang)
            });
            return null;
        }
        const meta = buildAiProviderMeta(lang, provider);
        const promptText = meta.addPrompt;
        const placeholder = meta.addPlaceholder;
        const message = await bot.sendMessage(userId, promptText, {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: placeholder
            }
        });

        aiApiAddPrompts.set(userId.toString(), { messageId: message.message_id, lang, provider: meta.id });
        return message;
    }

    async function handleAiApiSubmission(msg, prompt) {
        const userId = msg.chat?.id?.toString();
        const lang = prompt?.lang || await getLang(msg);
        const provider = prompt?.provider || 'google';
        if (!userId) {
            return;
        }

        if (await db.isUserBlockedFromApiKeys(userId)) {
            await bot.sendMessage(userId, t(lang, 'ai_api_blocked_notice'), { reply_markup: buildCloseKeyboard(lang) });
            aiApiAddPrompts.delete(userId);
            return;
        }

        const parsed = parseAiApiSubmission(msg.text || '');
        if (!parsed.length) {
            const meta = buildAiProviderMeta(lang, provider);
            const simpleKeyboard = {
                inline_keyboard: [
                    [{ text: `${meta.icon} ${meta.label}`, callback_data: `apihub|ai|${provider}|0` }],
                    [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
                ]
            };
            await bot.sendMessage(userId, t(lang, 'ai_api_parse_error'), { reply_markup: simpleKeyboard });
            return;
        }

        let added = 0;
        let updated = 0;

        for (let i = 0; i < parsed.length; i += 1) {
            const entry = parsed[i];
            const safeName = entry.name || t(lang, 'ai_api_default_name');
            const result = await db.addUserAiKey(userId, safeName, entry.apiKey, entry.provider || provider);
            if (result.added) {
                added += 1;
            } else if (result.updated) {
                updated += 1;
            }
        }

        aiApiAddPrompts.delete(userId);

        if (prompt?.messageId) {
            try {
                await bot.deleteMessage(userId, prompt.messageId);
            } catch (error) {
                // ignore cleanup errors
            }
        }

        const summary = t(lang, 'ai_api_save_result', {
            added,
            updated,
            total: parsed.length
        });

        const meta = buildAiProviderMeta(lang, provider);
        const simpleKeyboard = {
            inline_keyboard: [
                [{ text: `${meta.icon} ${meta.label}`, callback_data: `apihub|ai|${provider}|0` }],
                [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
            ]
        };

        await bot.sendMessage(userId, summary, { reply_markup: simpleKeyboard });
    }

    return {
        buildApiHubMenu,
        handleAiApiSubmission,
        handleApiCommand,
        renderAiApiMenuMessage,
        renderApiHubMessage,
        startAiApiAddPrompt
    };
}

module.exports = { createAiApiHandlers };
