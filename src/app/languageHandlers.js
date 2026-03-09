/**
 * Language Handlers — extracted from index.js
 * Manages language picker UI, language/topic language switching, and admin language hub.
 */
const { resolveLangCode } = require('../core/i18n');

const logger = require('../core/logger');
const log = logger.child('LanguageHandlers');
function createLanguageHandlers({
    bot, db, t, defaultLang, escapeHtml,
    getLang, sendReply, scheduleMessageDeletion,
    isGroupAdmin, resolveGroupLanguage, resolveTopicLanguage,
    resolveNotificationLanguage,
    buildCloseKeyboard, buildLanguageMenuText, buildLanguageKeyboardWithPrefix,
    findLanguageOption, openAdminHub, languageHubSessions
}) {

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
                log.child('GroupLanguage').warn(`Unable to update broadcast language for ${chatKey}: ${error.message}`);
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

        log.child('BOT').info(`ChatID ${chatKey} changed language to: ${targetLang}`);
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

        log.child('BOT').info(`Topic ${chatKey}/${topicId} changed language to: ${targetLang}`);
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
                await bot.editMessageText(payload.text, {
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

    return {
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
    };
}

module.exports = { createLanguageHandlers };
