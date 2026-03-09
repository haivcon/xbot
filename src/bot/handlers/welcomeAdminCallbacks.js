/**
 * Welcome admin callback handlers — extracted from index.js
 * Contains all welcome_admin_* callback routes.
 */
const logger = require('../../core/logger');
const log = logger.child('WelcomeAdmin');

async function handleWelcomeAdminCallback(query, ctx, deps) {
    const { bot, t, isGroupAdmin, welcomeAdminStates, welcomeAdminMenus,
        sendWelcomeAdminMenu, presentWelcomeTopics,
        setWelcomeQuestionWeights, showWelcomeWeightMenu,
        resetWelcomeTitleTemplate, toggleWelcomeVerification,
        setWelcomeAction, getWelcomeVerificationSettings } = deps;

    const { queryId, chatId, callbackLang } = ctx;

    if (query.data.startsWith('welcome_admin_close|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const userKey = query.from.id.toString();
        welcomeAdminStates.delete(userKey);
        if (targetChatId) {
            welcomeAdminMenus.delete(targetChatId);
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        if (targetChatId) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_menu_closed') });
        } else {
            await bot.answerCallbackQuery(queryId);
        }
        return;
    }

    if (query.data.startsWith('welcome_admin_back|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        welcomeAdminStates.delete(query.from.id.toString());
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore cleanup issues
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
        await sendWelcomeAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('welcome_admin_topics|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        await presentWelcomeTopics(query.from.id, targetChatId, { fallbackLang: callbackLang, messageContext: query.message });
        await bot.answerCallbackQuery(queryId);
        return;
    }

    if (query.data.startsWith('welcome_admin_toggle|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const settings = await getWelcomeVerificationSettings(targetChatId);
        await toggleWelcomeVerification(targetChatId, query.from.id, !settings.enabled, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
        return;
    }

    if (query.data.startsWith('welcome_admin_weights_set|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const presetWeights = {
            math: Number(parts[2]),
            physics: Number(parts[3]),
            chemistry: Number(parts[4]),
            okx: Number(parts[5]),
            crypto: Number(parts[6])
        };
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
        await setWelcomeQuestionWeights(targetChatId, query.from.id, presetWeights, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('welcome_admin_weights_custom|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_weights_prompt'), {
            reply_markup: {
                inline_keyboard: [[{ text: t(callbackLang, 'welcome_admin_button_back'), callback_data: `welcome_admin_back|${targetChatId}` }]]
            }
        });
        welcomeAdminStates.set(query.from.id.toString(), {
            type: 'weights_custom',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_weights_prompted') });
        return;
    }

    if (query.data.startsWith('welcome_admin_weights|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
        await showWelcomeWeightMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
        return;
    }

    if (query.data.startsWith('welcome_admin_time|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_time_prompt'));
        welcomeAdminStates.set(query.from.id.toString(), {
            type: 'time',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_time_prompted') });
        return;
    }

    if (query.data.startsWith('welcome_admin_title|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const defaultTitle = t(callbackLang, 'welcome_admin_title_default');
        const example = t(callbackLang, 'welcome_admin_title_example');
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_title_prompt', { default: defaultTitle, example }), {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(callbackLang, 'welcome_admin_button_back'), callback_data: `welcome_admin_back|${targetChatId}` },
                        { text: t(callbackLang, 'welcome_admin_button_title_reset'), callback_data: `welcome_admin_title_reset|${targetChatId}` }
                    ],
                    [{ text: t(callbackLang, 'help_button_close'), callback_data: `welcome_admin_close|${targetChatId}` }]
                ]
            }
        });
        welcomeAdminStates.set(query.from.id.toString(), {
            type: 'title',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_title_prompted') });
        return;
    }

    if (query.data.startsWith('welcome_admin_title_reset|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        welcomeAdminStates.delete(query.from.id.toString());
        await resetWelcomeTitleTemplate(targetChatId, query.from.id, { fallbackLang: callbackLang });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_title_reset_alert') });
        return;
    }

    if (query.data.startsWith('welcome_admin_attempts|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_attempts_prompt'));
        welcomeAdminStates.set(query.from.id.toString(), {
            type: 'attempts',
            chatId: targetChatId,
            promptMessageId: promptMessage.message_id
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_attempts_prompted') });
        return;
    }

    if (query.data.startsWith('welcome_admin_action_set|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        const action = parts[2];
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        await setWelcomeAction(targetChatId, query.from.id, action, { fallbackLang: callbackLang });
        await sendWelcomeAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, editOnly: true });
        if (query.message?.chat?.id && query.message?.message_id) {
            try {
                await bot.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (error) {
                // ignore
            }
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_refreshing') });
        return;
    }

    if (query.data.startsWith('welcome_admin_action|')) {
        const parts = query.data.split('|');
        const targetChatId = (parts[1] || chatId || '').toString();
        if (!targetChatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_no_permission'), show_alert: true });
            return;
        }
        const inline_keyboard = [
            [{ text: t(callbackLang, 'welcome_admin_action_kick'), callback_data: `welcome_admin_action_set|${targetChatId}|kick` }],
            [{ text: t(callbackLang, 'welcome_admin_action_mute'), callback_data: `welcome_admin_action_set|${targetChatId}|mute` }],
            [{ text: t(callbackLang, 'welcome_admin_action_ban'), callback_data: `welcome_admin_action_set|${targetChatId}|ban` }],
            [
                { text: t(callbackLang, 'welcome_admin_button_back'), callback_data: `welcome_admin_back|${targetChatId}` },
                { text: t(callbackLang, 'help_button_close'), callback_data: `welcome_admin_close|${targetChatId}` }
            ]
        ];
        const prompt = await bot.sendMessage(query.from.id, t(callbackLang, 'welcome_admin_action_prompt'), { reply_markup: { inline_keyboard } });
        if (prompt?.message_id) {
            setTimeout(async () => {
                try {
                    await bot.deleteMessage(prompt.chat.id, prompt.message_id);
                } catch (error) {
                    // ignore auto delete
                }
            }, 60 * 1000);
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'welcome_admin_action_prompted') });
        return;
    }

    // Export callback handler
}

module.exports = handleWelcomeAdminCallback;
