/**
 * Owner callback handlers — extracted from index.js
 * Handles all owner_list|, owner_menu|, owner_api|, owner_command|,
 * owner_doremon|, owner_ai_command|, owner_group| callbacks.
 *
 * deps is passed as a single object to keep the interface manageable (~30 deps).
 */
const logger = require('../../core/logger');
const log = logger.child('Owner');

function registerOwnerCallbacks(cbRouter, deps) {

    // ── owner_list| ──────────────────────────────────────
    cbRouter.onPrefix('owner_list|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, getOwnerListState, updateOwnerListState,
            resolveOwnerListFilters, renderOwnerListState, exportOwnerList, buildCloseKeyboard } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const parts = query.data.split('|');
        const stateId = parts[2];
        const action = parts[3];
        const state = getOwnerListState(stateId, ownerId);

        if (!state) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_list_state_missing'), show_alert: true });
            return;
        }

        const targetChatId = ctx.chatId || ownerId;

        if (action === 'export') {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_list_export_started') });
            await exportOwnerList(state, ctx.callbackLang, targetChatId);
            return;
        }

        if (action === 'search') {
            ownerActionStates.set(ownerId, { mode: 'owner_list_search', stateId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_list_search_prompt_short') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_list_search_prompt'), {
                reply_markup: buildCloseKeyboard(ctx.callbackLang)
            });
            return;
        }

        const filters = resolveOwnerListFilters(state);
        let updatedState = state;

        if (action === 'next') {
            updatedState = updateOwnerListState(stateId, ownerId, (c) => ({ ...c, page: c.page + 1 }));
        } else if (action === 'prev') {
            updatedState = updateOwnerListState(stateId, ownerId, (c) => ({ ...c, page: Math.max(0, c.page - 1) }));
        } else if (action === 'filter') {
            const currentIndex = filters.indexOf(state.filter);
            const nextFilter = filters[(currentIndex + 1) % filters.length];
            updatedState = updateOwnerListState(stateId, ownerId, (c) => ({ ...c, filter: nextFilter, page: 0 }));
        } else if (action === 'refresh') {
            updatedState = updateOwnerListState(stateId, ownerId, (c) => ({ ...c, page: 0 }));
        }

        const rendered = renderOwnerListState(updatedState, ctx.callbackLang);
        const options = {
            chat_id: targetChatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: rendered?.reply_markup
        };

        try {
            await bot.editMessageText(rendered.text, options);
        } catch (_) {
            await bot.sendMessage(targetChatId, rendered.text, {
                parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: rendered?.reply_markup
            });
        }
        await bot.answerCallbackQuery(ctx.queryId);
    });

    // ── owner_menu| ──────────────────────────────────────
    cbRouter.onPrefix('owner_menu|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, clearOwnerAction, buildCloseKeyboard,
            getDefaultOwnerGroup, buildOwnerMenuText, buildOwnerMenuKeyboard,
            buildOwnerCommandLimitKeyboard, buildOwnerAiCommandLimitKeyboard,
            commandRegistry, sendOwnerUserOverview, sendOwnerApiStats,
            sendOwnerGroupDashboard, sendOwnerCommandUsageStats, sendOwnerAiStats } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const action = query.data.split('|')[1];
        const targetChatId = query.message?.chat?.id || query.from?.id;

        if (action === 'close') {
            clearOwnerAction(ownerId);
            if (query.message?.chat?.id && query.message?.message_id) {
                try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
            }
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'help_action_executed') });
            return;
        }

        if (action === 'group') {
            const requestedGroup = query.data.split('|')[2] || getDefaultOwnerGroup();
            const ownerText = buildOwnerMenuText(ctx.callbackLang, requestedGroup);
            const replyMarkup = buildOwnerMenuKeyboard(ctx.callbackLang, requestedGroup);
            const cid = query.message?.chat?.id;
            const mid = query.message?.message_id;
            if (cid && mid) {
                try {
                    await bot.editMessageText(ownerText, { chat_id: cid, message_id: mid, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup });
                    await bot.answerCallbackQuery(ctx.queryId);
                    return;
                } catch (_) { }
            }
            await bot.sendMessage(targetChatId, ownerText, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup });
            await bot.answerCallbackQuery(ctx.queryId);
            return;
        }

        if (action === 'broadcast') {
            ownerActionStates.set(ownerId, { mode: 'broadcast', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_prompt_target') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_prompt_target'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'cmdstats') {
            const allStats = commandRegistry.getAllStats().filter(s => s.calls > 0).sort((a, b) => b.calls - a.calls).slice(0, 20);
            let statsText;
            if (allStats.length === 0) {
                statsText = '📊 <b>' + t(ctx.callbackLang, 'owner_menu_cmdstats') + '</b>\n\n<i>Chưa có thống kê sử dụng lệnh modular.</i>';
            } else {
                const lines = ['📊 <b>' + t(ctx.callbackLang, 'owner_menu_cmdstats') + '</b>', '', '<b>Top Commands (by usage):</b>', ''];
                allStats.forEach((s, i) => { lines.push(`${i + 1}. /${s.name}: ${s.calls} calls, ${s.avgTime}ms avg, ${s.errorRate}% errors`); });
                statsText = lines.join('\n');
            }
            await bot.sendMessage(targetChatId, statsText, { parse_mode: 'HTML', reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            await bot.answerCallbackQuery(ctx.queryId);
            return;
        }

        if (action === 'check_users') {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_user_checking') });
            await sendOwnerUserOverview(targetChatId, ctx.callbackLang);
            ownerActionStates.set(ownerId, { mode: 'user_check', step: 'query', chatId: targetChatId });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_user_check_prompt'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'coowner_grant' || action === 'coowner_revoke') {
            const mode = action === 'coowner_grant' ? 'grant' : 'revoke';
            const promptKey = mode === 'grant' ? 'owner_coowner_grant_prompt' : 'owner_coowner_revoke_prompt';
            ownerActionStates.set(ownerId, { mode: 'coowner_manage', step: 'target', action: mode, chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_user_check_prompt') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, promptKey), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'ai_command_limits') {
            ownerActionStates.set(ownerId, { mode: 'ai_command_limits', step: 'idle', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_ai_command_limit_menu_short') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_ai_command_limit_menu'), { parse_mode: 'HTML', reply_markup: buildOwnerAiCommandLimitKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'api_stats') {
            clearOwnerAction(ownerId);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_api_refreshing') });
            await sendOwnerApiStats(targetChatId, ctx.callbackLang);
            return;
        }

        if (action === 'group_stats') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'idle', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_prompt_short') });
            await sendOwnerGroupDashboard(targetChatId, ctx.callbackLang);
            return;
        }

        if (action === 'run_command') {
            ownerActionStates.set(ownerId, { mode: 'run_command', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_run_target_prompt') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_run_target_prompt'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'command_limits') {
            ownerActionStates.set(ownerId, { mode: 'command_limits', step: 'idle', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_command_limit_menu_short') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_command_limit_menu'), { parse_mode: 'HTML', reply_markup: buildOwnerCommandLimitKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'reset_id') {
            ownerActionStates.set(ownerId, { mode: 'reset_id', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_reset_prompt') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_reset_prompt'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'ban' || action === 'unban') {
            ownerActionStates.set(ownerId, { mode: action, step: 'target', chatId: targetChatId });
            const promptKey = action === 'ban' ? 'owner_prompt_ban_target' : 'owner_prompt_unban_target';
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, promptKey) });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, promptKey), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
    });

    // ── owner_api| ──────────────────────────────────────
    cbRouter.onPrefix('owner_api|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, clearOwnerAction,
            buildCloseKeyboard, sendOwnerApiStats, autoDeleteInvalidApiKeys } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const action = query.data.split('|')[1];
        const targetChatId = query.message?.chat?.id || query.from?.id;

        if (action === 'stats' || action === 'refresh') {
            clearOwnerAction(ownerId);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_api_refreshing') });
            await sendOwnerApiStats(targetChatId, ctx.callbackLang);
            return;
        }

        if (action === 'autodelete') {
            clearOwnerAction(ownerId);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_api_autodelete_running') });
            await autoDeleteInvalidApiKeys(targetChatId, ctx.callbackLang);
            return;
        }

        const promptMap = {
            delete: 'owner_api_prompt_target', add: 'owner_api_prompt_add_target',
            block: 'owner_api_prompt_block_target', unblock: 'owner_api_prompt_unblock_target',
            message: 'owner_api_prompt_message_target'
        };
        if (promptMap[action]) {
            ownerActionStates.set(ownerId, { mode: 'api_manage', action, step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, promptMap[action]) });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, promptMap[action]), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
    });

    // ── owner_command| ──────────────────────────────────
    cbRouter.onPrefix('owner_command|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, clearOwnerAction,
            buildCloseKeyboard, sendOwnerCommandUsageStats } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const action = query.data.split('|')[1];
        const targetChatId = query.message?.chat?.id || query.from?.id;

        if (action === 'limit') {
            ownerActionStates.set(ownerId, { mode: 'command_limit', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_command_limit_prompt_target') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_command_limit_prompt_target'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
        if (action === 'unlimit') {
            ownerActionStates.set(ownerId, { mode: 'command_unlimit', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_command_limit_prompt_target') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_command_limit_prompt_target'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
        if (action === 'stats') {
            clearOwnerAction(ownerId);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_command_usage_running') });
            await sendOwnerCommandUsageStats(targetChatId, ctx.callbackLang);
            return;
        }
    });

    // ── owner_doremon| ──────────────────────────────────
    cbRouter.onPrefix('owner_doremon|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, buildCloseKeyboard } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const action = query.data.split('|')[1];
        const targetChatId = query.message?.chat?.id || query.from?.id;

        if (action === 'limit') {
            ownerActionStates.set(ownerId, { mode: 'doremon_limit', step: 'limit', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_doremon_limit_prompt') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_doremon_limit_prompt'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
        if (action === 'unlimit') {
            ownerActionStates.set(ownerId, { mode: 'doremon_unlimit', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_doremon_unlimit_prompt_short') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_doremon_unlimit_prompt'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
    });

    // ── owner_ai_command| ───────────────────────────────
    cbRouter.onPrefix('owner_ai_command|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, clearOwnerAction,
            buildCloseKeyboard, sendOwnerAiStats } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const action = query.data.split('|')[1];
        const targetChatId = query.message?.chat?.id || query.from?.id;

        if (action === 'limit') {
            ownerActionStates.set(ownerId, { mode: 'ai_limit', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_prompt_target') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_prompt_target'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
        if (action === 'unlimit') {
            ownerActionStates.set(ownerId, { mode: 'ai_unlimit', step: 'target', chatId: targetChatId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_prompt_target') });
            await bot.sendMessage(targetChatId, t(ctx.callbackLang, 'owner_prompt_target'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }
        if (action === 'stats') {
            clearOwnerAction(ownerId);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_ai_stats_running') });
            await sendOwnerAiStats(targetChatId, ctx.callbackLang);
            return;
        }
    });

    // ── owner_group| ────────────────────────────────────
    cbRouter.onPrefix('owner_group|', async (query, _params, ctx) => {
        const { bot, t, isOwner, ownerActionStates, buildCloseKeyboard,
            sendOwnerGroupDashboard, sendOwnerGroupDetail, discardOwnerPanelMessage,
            loadActiveGroupProfiles, formatGroupAddress, isLikelyGroupChatId,
            cleanupGroupProfile, purgeBotMessagesInGroup, toggleBotAnonymousMode } = deps;
        const ownerId = query.from?.id?.toString();
        const ownerUsername = query.from?.username || '';
        if (!isOwner(ownerId, ownerUsername)) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_not_allowed'), show_alert: true });
            return;
        }

        const parts = query.data.split('|');
        const action = parts[1];
        const targetChatId = parts[2];
        const detail = parts[3];

        if (action !== 'refresh' && action !== 'back') {
            await discardOwnerPanelMessage(query);
        }

        if (action === 'refresh' || action === 'back') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'idle', chatId: ctx.chatId || ownerId });
            if (query.message?.chat?.id && query.message?.message_id) {
                try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
            }
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_prompt_short') });
            await sendOwnerGroupDashboard(ctx.chatId || ownerId, ctx.callbackLang);
            return;
        }

        if (action === 'info') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'idle', chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_prompt_short') });
            await sendOwnerGroupDetail(ctx.chatId || ownerId, targetChatId, ctx.callbackLang);
            return;
        }

        if (action === 'copy') {
            const groups = await loadActiveGroupProfiles();
            const profile = groups.find(item => item.chatId === detail || item.chatId === detail?.toString()) || { chatId: detail };
            const address = formatGroupAddress(profile);
            const value = targetChatId === 'address' ? address : profile.chatId;
            const label = targetChatId === 'address' ? t(ctx.callbackLang, 'owner_group_button_copy_address') : t(ctx.callbackLang, 'owner_group_button_copy_id');
            const copyText = `${label}: ${value?.toString() || t(ctx.callbackLang, 'owner_group_unknown_count')}`;
            const target = ctx.chatId || ownerId;
            if (target) {
                await bot.sendMessage(target, copyText, { disable_web_page_preview: true, reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            }
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'help_action_executed') });
            return;
        }

        if (action === 'broadcast_all') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'broadcast_message', targetChatId: null, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_prompt_message') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_prompt_message'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'broadcast') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'broadcast_message', targetChatId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_prompt_message') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_prompt_message'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'kick' || action === 'ban_users') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'ban_users', targetChatId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_ban_hint') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_group_ban_hint'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'add_users') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'add_users', targetChatId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_add_users_hint') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_group_add_users_hint'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'pin') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'pin_message', targetChatId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_pin_hint') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_group_pin_hint'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'topic') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'create_topic', targetChatId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_topic_hint') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_group_topic_hint'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'change_info') {
            ownerActionStates.set(ownerId, { mode: 'group_stats', step: 'change_info', targetChatId, chatId: ctx.chatId || ownerId });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_change_info_hint') });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_group_change_info_hint'), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'delete_messages') {
            const result = await purgeBotMessagesInGroup(targetChatId, ctx.callbackLang, 300);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_delete_done_short', { deleted: result.deleted }) });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, 'owner_group_delete_done', { deleted: result.deleted }), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'toggle_anon') {
            const toggleResult = await toggleBotAnonymousMode(targetChatId, ctx.callbackLang);
            const key = toggleResult.nextState ? 'owner_group_anon_on' : 'owner_group_anon_off';
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, key) });
            await bot.sendMessage(ctx.chatId || ownerId, t(ctx.callbackLang, key), { reply_markup: buildCloseKeyboard(ctx.callbackLang) });
            return;
        }

        if (action === 'remove') {
            if (targetChatId) {
                try { if (isLikelyGroupChatId(targetChatId)) await bot.leaveChat(targetChatId); } catch (error) {
                    log.warn(`Failed to leave group ${targetChatId}: ${error.message}`);
                }
                await cleanupGroupProfile(targetChatId);
                await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_removed', { id: targetChatId }) });
                await sendOwnerGroupDashboard(ctx.chatId || ownerId, ctx.callbackLang);
                return;
            }
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'owner_group_usage_help'), show_alert: true });
            return;
        }
    });
}

module.exports = registerOwnerCallbacks;
