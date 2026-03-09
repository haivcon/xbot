/**
 * Checkin admin callback handlers — extracted from index.js
 * Contains all checkin_admin_* callback routes (52 blocks).
 * These are dispatched as a single block since they share common patterns.
 */
const logger = require('../../core/logger');
const log = logger.child('Checkin');

/**
 * Handle all checkin_admin_* callbacks.
 * Called from the callback_query handler in index.js when query.data starts with 'checkin_admin'.
 * @param {object} query - Telegram callback query
 * @param {object} ctx - { queryId, chatId, lang, callbackLang }
 * @param {object} deps - All required dependencies
 */
async function handleCheckinAdminCallback(query, ctx, deps) {
    const { bot, t, db, isGroupAdmin, checkinAdminStates, pendingSecretMessages,
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
        CHECKIN_DEFAULT_TIMEZONE, CHECKIN_ADMIN_DM_MAX_RECIPIENTS } = deps;

    const { queryId, chatId, callbackLang } = ctx;


    if (query.data.startsWith('checkin_admin_menu|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const requestedView = parts[2] || 'home';
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }

        try {
            await sendAdminMenu(query.from.id, targetChatId, {
                fallbackLang: callbackLang,
                view: requestedView,
                messageContext: query.message
            });
            const viewKey = resolveAdminMenuView(requestedView);
            const sectionConfig = ADMIN_MENU_SECTION_CONFIG[viewKey];
            const sectionLabel = viewKey === 'home'
                ? t(callbackLang, 'checkin_admin_menu_choose_action')
                : t(callbackLang, sectionConfig?.labelKey || 'checkin_admin_menu_board_hint');
            await bot.answerCallbackQuery(queryId, {
                text: t(callbackLang, 'checkin_admin_section_opened', { section: sectionLabel })
            });
        } catch (error) {
            log.child('AdminMenu').error(`Failed to switch view for ${query.from.id}: ${error.message}`);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('checkin_admin_close|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const userKey = query.from.id.toString();
        checkinAdminStates.delete(userKey);
        pendingSecretMessages.delete(userKey);
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_closed') });
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await closeAdminMenu(query.from.id);
        return;
    }

    if (query.data.startsWith('checkin_admin_back|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        const userKey = query.from.id.toString();
        checkinAdminStates.delete(userKey);
        pendingSecretMessages.delete(userKey);

        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_backing') });
        // Edit the current message instead of deleting and sending new
        await sendAdminMenu(query.from.id, targetChatId, {
            fallbackLang: callbackLang,
            view: 'home',
            messageContext: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_refresh|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        await sendAdminMenu(query.from.id, targetChatId, {
            fallbackLang: callbackLang,
            messageContext: query.message
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_refreshed') });
        return;
    }

    if (query.data.startsWith('checkin_admin_topics|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await presentCheckinTopics(query.from.id, targetChatId, { fallbackLang: callbackLang, messageContext: query.message });
        await bot.answerCallbackQuery(queryId);
        return;
    }

    if (query.data.startsWith('checkin_admin_cancel_input|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        const userKey = query.from.id.toString();
        const adminState = checkinAdminStates.get(userKey);
        const secretState = pendingSecretMessages.get(userKey);
        if (adminState?.promptMessageId) {
            try {
                await bot.deleteMessage(query.from.id, adminState.promptMessageId);
            } catch (error) {
                // ignore
            }
        }
        if (secretState?.promptMessageId) {
            try {
                await bot.deleteMessage(query.from.id, secretState.promptMessageId);
            } catch (error) {
                // ignore
            }
        }
        checkinAdminStates.delete(userKey);
        pendingSecretMessages.delete(userKey);

        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }

        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_cancelled') });
        await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_user_prompt|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        try {
            const groupLang = await resolveGroupLanguage(targetChatId);
            await bot.sendMessage(targetChatId, t(groupLang, 'checkin_admin_user_prompt_text'), {
                disable_web_page_preview: true
            });

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_user_prompt_alert') });
        } catch (error) {
            log.child('Checkin').error(`Failed to broadcast member guide for ${targetChatId}: ${error.message}`);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('checkin_admin_user_leaderboard|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        try {
            const groupLang = await resolveGroupLanguage(targetChatId);
            await bot.sendMessage(targetChatId, t(groupLang, 'checkin_admin_user_leaderboard_text'), {
                disable_web_page_preview: true
            });

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_user_leaderboard_alert') });
        } catch (error) {
            log.child('Checkin').error(`Failed to broadcast leaderboard guide for ${targetChatId}: ${error.message}`);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_reset_confirm|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_processing') });
        await confirmLeaderboardReset(query.from.id, targetChatId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_reset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
        await promptLeaderboardReset(query.from.id, targetChatId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_remove|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const targetUserId = parts[2];
        if (!targetChatId || !targetUserId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_processing') });
        await confirmLeaderboardRemoval(query.from.id, targetChatId, targetUserId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_member|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const targetUserId = parts[2];
        if (!targetChatId || !targetUserId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
        await presentAdminLeaderboardMemberDetail(query.from.id, targetChatId, targetUserId, {
            fallbackLang: callbackLang,
            messageContext: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_members|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
        await presentAdminLeaderboardManageList(query.from.id, targetChatId, {
            fallbackLang: callbackLang,
            messageContext: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_mode|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const mode = parts[2] || 'streak';
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
        await presentAdminLeaderboardView(query.from.id, targetChatId, {
            fallbackLang: callbackLang,
            mode,
            messageContext: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_leaderboard_view|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
        await presentAdminLeaderboardView(query.from.id, targetChatId, {
            fallbackLang: callbackLang,
            messageContext: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_list|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_list_progress_alert') });
        await sendTodayCheckinList(targetChatId, query.from.id, {
            fallbackLang: callbackLang,
            messageContext: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_window|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_window_progress_alert') });
        await sendSummaryWindowCheckinList(targetChatId, query.from.id, {
            fallbackLang: callbackLang,
            messageContext: query.message
        });
        return;
    }

    // Export callback handler
    if (query.data.startsWith('checkin_export|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const format = parts[2] || 'csv';
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_list_progress_alert') });
        await handleExportRequest(targetChatId, query.from.id, format, { fallbackLang: callbackLang });
        return;
    }

    // Broadcast pagination handler (for summary sent to group)
    if (query.data.startsWith('checkin_broadcast_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        // Anyone in the group can paginate the broadcast message
        await bot.answerCallbackQuery(queryId);
        await sendSummaryAnnouncement(targetChatId, {
            page,
            messageContext: query.message
        });
        return;
    }

    // Pagination handlers for checkin admin lists
    if (query.data.startsWith('checkin_today_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId);
        await sendTodayCheckinList(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
        return;
    }

    if (query.data.startsWith('checkin_summary_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId);
        await sendSummaryWindowCheckinList(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
        return;
    }

    if (query.data.startsWith('checkin_removal_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId);
        await promptAdminForRemoval(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
        return;
    }

    if (query.data.startsWith('checkin_unlock_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId);
        await promptAdminUnlock(targetChatId, query.from.id, { fallbackLang: callbackLang, page, messageContext: query.message });
        return;
    }

    if (query.data.startsWith('checkin_leaderboard_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId);
        await presentAdminLeaderboardManageList(query.from.id, targetChatId, { fallbackLang: callbackLang, page, messageContext: query.message });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_reset_confirm|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_reset_success_alert') });
        await executeAdminSummaryReset(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_reset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_reset_prompt_alert') });
        await promptAdminSummaryReset(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_broadcast|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_broadcast_progress_alert') });
        await sendCheckinAnnouncement(targetChatId, { triggeredBy: 'manual' });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_broadcast|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        const sent = await sendSummaryAnnouncement(targetChatId, { sourceMessage: query.message, triggeredBy: 'manual' });
        await bot.answerCallbackQuery(queryId, {
            text: sent
                ? t(callbackLang, 'checkin_admin_summary_broadcast_success_alert')
                : t(callbackLang, 'checkin_admin_summary_broadcast_empty'),
            show_alert: !sent
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_toggle_auto|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }

        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        const settings = await getGroupCheckinSettings(targetChatId);
        const nextEnabled = Number(settings.autoMessageEnabled) === 1 ? 0 : 1;
        await db.updateCheckinGroup(targetChatId, { autoMessageEnabled: nextEnabled });

        const alertKey = nextEnabled ? 'checkin_admin_toggle_on_alert' : 'checkin_admin_toggle_off_alert';
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, alertKey) });
        const currentView = checkinAdminMenus.get(query.from.id)?.view || 'home';
        await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, view: currentView });
        return;
    }

    if (query.data.startsWith('checkin_admin_remove_confirm|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const targetUserId = parts[2];
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_remove_progress_alert') });
        await executeAdminRemoval(targetChatId, query.from.id, targetUserId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_remove|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_remove_choose_prompt') });
        await promptAdminForRemoval(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_unlock_confirm|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const targetUserId = parts[2];
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_unlock_progress_alert') });
        await executeAdminUnlock(targetChatId, query.from.id, targetUserId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_unlock|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_unlock_choose_prompt') });
        await promptAdminUnlock(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_dm_all|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        const settings = await getGroupCheckinSettings(targetChatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        const records = await db.getCheckinsForDate(targetChatId, today);
        const uniqueRecipients = Array.from(new Set((records || []).map((record) => record.userId.toString())));
        const filtered = uniqueRecipients
            .filter((recipient) => recipient && recipient !== query.from.id.toString())
            .slice(0, CHECKIN_ADMIN_DM_MAX_RECIPIENTS);
        if (filtered.length === 0) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_empty'), show_alert: true });
            return;
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_dm_all_prompt', { count: filtered.length }), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        pendingSecretMessages.set(query.from.id.toString(), {
            chatId: targetChatId,
            targetUserId: 'all',
            recipients: filtered,
            promptMessageId: promptMessage.message_id,
            mode: 'all'
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_all_progress_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_dm_target|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const targetUserId = parts[2];
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const profile = await resolveMemberProfile(targetChatId, targetUserId, callbackLang);
        const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_dm_enter_message', { user: userLabel }), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        pendingSecretMessages.set(query.from.id.toString(), {
            chatId: targetChatId,
            targetUserId,
            promptMessageId: promptMessage.message_id,
            mode: 'single'
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_enter_prompt_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_dm_page|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const page = Number.parseInt(parts[2], 10) || 0;
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        await bot.answerCallbackQuery(queryId);
        await promptAdminSecretMessage(targetChatId, query.from.id, {
            fallbackLang: callbackLang,
            page,
            message: query.message
        });
        return;
    }

    if (query.data.startsWith('checkin_admin_dm|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_choose_prompt_alert') });
        await promptAdminSecretMessage(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_title_reset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        checkinAdminStates.delete(query.from.id.toString());
        await resetCheckinTitleTemplate(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_title_reset_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_title|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await promptCheckinTitleTemplate(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_title_prompted') });
        return;
    }

    if (query.data.startsWith('checkin_admin_points_set|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const value = parts[2];
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_updated_alert') });
        await setAdminDailyPoints(targetChatId, query.from.id, value, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_points_custom|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_points_prompt'), {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        checkinAdminStates.set(query.from.id.toString(), {
            type: 'points_custom',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_prompt_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_points|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_choose_prompt') });
        await promptAdminPoints(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_set|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const value = parts[2];
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_updated_alert') });
        await setAdminSummaryWindow(targetChatId, query.from.id, value, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_custom|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_summary_prompt'), {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        checkinAdminStates.set(query.from.id.toString(), {
            type: 'summary_custom',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_prompt_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_choose_prompt') });
        await promptAdminSummaryWindow(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_schedule_preset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const presetValue = parts[2] || '';
        const presetSlots = presetValue.split(',').map((slot) => slot.trim()).filter(Boolean);
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_updated_alert') });
        await setAdminScheduleSlots(targetChatId, query.from.id, presetSlots, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_schedule_preset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const presetValue = parts[2] || '';
        const presetSlots = presetValue.split(',').map((slot) => slot.trim()).filter(Boolean);
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await setAdminSummaryScheduleSlots(targetChatId, query.from.id, presetSlots, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_updated_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_schedule_custom|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_schedule_prompt'), {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        checkinAdminStates.set(query.from.id.toString(), {
            type: 'schedule_custom',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_prompt_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_schedule_custom|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_summary_schedule_prompt'), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        checkinAdminStates.set(query.from.id.toString(), {
            type: 'summary_schedule_custom',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_prompt_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_schedule_clear|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_cleared_alert') });
        await resetAdminScheduleSlots(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_schedule_disable|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await disableAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_disabled_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_schedule_reset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await resetAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_reset_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_schedule_sync|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await syncAdminSummaryScheduleWithAuto(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_sync_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_schedule|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_choose_prompt') });
        await promptAdminSchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_summary_schedule|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await promptAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_choose_prompt') });
        return;
    }

    if (query.data.startsWith('checkin_admin_weights_set|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const presetWeights = {
            math: Number(parts[2]),
            physics: Number(parts[3]),
            chemistry: Number(parts[4]),
            okx: Number(parts[5]),
            crypto: Number(parts[6])
        };
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_updated_alert') });
        await setAdminQuestionWeights(targetChatId, query.from.id, presetWeights, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin_weights_custom|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_weights_prompt'), {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                ]
            }
        });
        checkinAdminStates.set(query.from.id.toString(), {
            type: 'weights_custom',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_prompt_alert') });
        return;
    }

    if (query.data.startsWith('checkin_admin_weights|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_choose_prompt') });
        await showQuestionWeightMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('checkin_admin|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_opening') });
        try {
            await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
        } catch (error) {
            log.child('Checkin').error(`Không th? g?i menu qu?n lý: ${error.message}`);
        }
        return;
    }
}

module.exports = handleCheckinAdminCallback;
