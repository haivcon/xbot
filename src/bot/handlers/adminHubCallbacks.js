/**
 * Admin Hub callback handlers — extracted from index.js
 * Registers admin_hub_refresh, admin_hub_from_menu, admin_hub_close, admin_hub_open| routes.
 */
const logger = require('../../core/logger');
const log = logger.child('AdminHub');

function registerAdminHubCallbacks(cbRouter, deps) {
    const {
        bot, t, adminHubSessions, openAdminHub, clearAdminContext,
        isGroupAdmin, sendWelcomeAdminMenu, sendModerationAdminPanel,
        sendLanguageAdminMenu, sendPriceAdminMenu, sendAdminMenu
    } = deps;

    cbRouter.on('admin_hub_refresh', async (query, _params, ctx) => {
        const session = adminHubSessions.get(query.from.id);
        try {
            await openAdminHub(query.from.id, { fallbackLang: ctx.callbackLang, mode: session?.mode });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'admin_hub_refreshed') });
        } catch (error) {
            log.error(`Failed to refresh hub for ${query.from.id}: ${error.message}`);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_command_error'), show_alert: true });
        }
    });

    cbRouter.on('admin_hub_from_menu', async (query, _params, ctx) => {
        const session = adminHubSessions.get(query.from.id);
        const nextMode = session?.mode || 'checkin';
        try {
            await openAdminHub(query.from.id, { fallbackLang: ctx.callbackLang, mode: nextMode });
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'admin_hub_refreshed') });
        } catch (error) {
            log.error(`Failed to open hub from menu for ${query.from.id}: ${error.message}`);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_command_error'), show_alert: true });
        }
    });

    cbRouter.on('admin_hub_close', async (query, _params, ctx) => {
        const session = adminHubSessions.get(query.from.id);
        if (session?.messageId) {
            try { await bot.deleteMessage(query.from.id, session.messageId); } catch (_) { /* ignore */ }
        }
        adminHubSessions.delete(query.from.id);
        clearAdminContext(query.from.id);
        await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'admin_hub_closed') });
    });

    cbRouter.onPrefix('admin_hub_open|', async (query, params, ctx) => {
        const targetChatId = params;
        if (!targetChatId) {
            await bot.answerCallbackQuery(ctx.queryId);
            return;
        }

        const session = adminHubSessions.get(query.from.id);
        const hubMode = session?.mode || 'checkin';

        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
            return;
        }

        try {
            if (hubMode === 'welcome') {
                await sendWelcomeAdminMenu(query.from.id, targetChatId, { fallbackLang: ctx.callbackLang });
                await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'welcome_admin_menu_opening') });
            } else if (hubMode === 'moderation') {
                const result = await sendModerationAdminPanel(query.from.id, targetChatId, { fallbackLang: ctx.callbackLang });
                if (result.status === 'dm_blocked') {
                    await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_command_dm_error'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'admin_dm_sent') });
            } else if (hubMode === 'language') {
                await sendLanguageAdminMenu(query.from.id, targetChatId, { fallbackLang: ctx.callbackLang, forceRefresh: true });
                await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'admin_hub_refreshed') });
            } else if (hubMode === 'price') {
                await sendPriceAdminMenu(query.from.id, targetChatId, { fallbackLang: ctx.callbackLang });
                await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'admin_hub_refreshed') });
            } else {
                await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: ctx.callbackLang });
                await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_menu_opening') });
            }
        } catch (error) {
            log.error(`Failed to open menu for ${query.from.id} in ${targetChatId}: ${error.message}`);
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'checkin_admin_command_error'), show_alert: true });
        }
    });
}

module.exports = registerAdminHubCallbacks;
