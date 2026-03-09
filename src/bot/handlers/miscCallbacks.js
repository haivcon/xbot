/**
 * Miscellaneous callback handlers - extracted from index.js
 * Contains: AI persona, rmchat, donate, admin moderation,
 * lang admin, checkin user flow, and language selection callbacks.
 */
const logger = require('../../core/logger');
const log = logger.child('MiscCB');

async function handleMiscCallback(query, ctx, deps) {
    const {
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
    } = deps;

    const { queryId, chatId, callbackLang } = ctx;
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
                    const { customPersonaCache, userPersonaPreferences } = require('../../app/aiHandlers/sharedState');
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
                    log.child('Persona').error('Delete custom error:', error.message);
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
                    log.child('Filters').warn(`Failed to refresh list after deletion in ${targetChatId}: ${error.message}`);
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
            log.child('LangHub').error(`Failed to refresh for ${query.from.id}: ${error.message}`);
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
            log.child('LangHub').warn(`Failed to refresh after removal: ${error.message}`);
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
    return false;
}

module.exports = handleMiscCallback;
