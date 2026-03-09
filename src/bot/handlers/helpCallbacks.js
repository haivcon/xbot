/**
 * Help callback handlers — extracted from index.js
 * Registers help_group|, help_cmd|, and start_help routes on the callback router.
 */
const logger = require('../../core/logger');
const log = logger.child('Help');

function registerHelpCallbacks(cbRouter, deps) {
    const {
        bot, t, getLang, sendReply,
        resolveHelpGroups, buildHelpText, buildHelpKeyboard, getDefaultHelpGroup,
        saveHelpMessageState, helpCommandExecutors, sanitizeSecrets
    } = deps;

    // help_group|<group> — switch help view to a different group
    cbRouter.onPrefix('help_group|', async (query, params, ctx) => {
        const requestedGroup = params;
        const groups = resolveHelpGroups();
        const selectedGroup = groups.includes(requestedGroup) ? requestedGroup : (groups[0] || null);
        const replyMarkup = buildHelpKeyboard(ctx.callbackLang, selectedGroup);
        const chatId = query.message?.chat?.id;
        const messageId = query.message?.message_id;
        const helpText = buildHelpText(ctx.callbackLang, selectedGroup);

        if (chatId && messageId) {
            try {
                await bot.editMessageText(helpText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                });
                saveHelpMessageState(chatId.toString(), messageId, { view: 'user', group: selectedGroup });
            } catch (error) {
                const description = error?.response?.body?.description || error?.message || '';
                if (/message is not modified/i.test(description)) {
                    saveHelpMessageState(chatId.toString(), messageId, { view: 'user', group: selectedGroup });
                } else {
                    try {
                        await bot.editMessageReplyMarkup(replyMarkup, { chat_id: chatId, message_id: messageId });
                        saveHelpMessageState(chatId.toString(), messageId, { view: 'user', group: selectedGroup });
                    } catch (innerError) {
                        log.warn(`Failed to update help view for ${chatId}: ${sanitizeSecrets(description || innerError?.message || innerError?.toString() || '')}`);
                    }
                }
            }
        }

        await bot.answerCallbackQuery(ctx.queryId);
    });

    // help_cmd|<commandKey>|<targetChatId> — execute a help command
    cbRouter.onPrefix('help_cmd|', async (query, params, ctx) => {
        const [commandKey, targetChatId] = params.split('|');
        const executor = helpCommandExecutors[commandKey];
        if (!executor) {
            await bot.answerCallbackQuery(ctx.queryId, { text: t(ctx.callbackLang, 'help_action_not_available'), show_alert: true });
            return;
        }

        try {
            const result = await executor(query, ctx.callbackLang, { targetChatId });
            if (!result || !result.message) {
                await bot.answerCallbackQuery(ctx.queryId);
            } else {
                await bot.answerCallbackQuery(ctx.queryId, {
                    text: result.message,
                    show_alert: Boolean(result.showAlert)
                });
            }
        } catch (error) {
            const description = error?.response?.body?.description || error?.message || '';
            if (error?.code === 'ETELEGRAM' && /query is too old|query ID is invalid/i.test(description)) {
                log.warn(`Ignored stale help callback for ${commandKey}: ${sanitizeSecrets(description)}`);
                return;
            }

            log.error(`Failed to execute ${commandKey} from help: ${sanitizeSecrets(description || error?.toString())}`);
            await bot.answerCallbackQuery(ctx.queryId, {
                text: t(ctx.callbackLang, 'help_action_failed'),
                show_alert: true
            });
        }
    });

    // start_help — open help menu from /start
    cbRouter.on('start_help', async (query, _params, ctx) => {
        const helpLang = query.message ? await getLang(query.message) : ctx.callbackLang;
        const defaultGroup = getDefaultHelpGroup();
        const helpText = buildHelpText(helpLang, defaultGroup);
        const replyMarkup = buildHelpKeyboard(helpLang, defaultGroup);
        const sent = await sendReply(query.message, helpText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup
        });
        if (sent?.chat?.id && sent?.message_id) {
            saveHelpMessageState(sent.chat.id.toString(), sent.message_id, { view: 'user', group: defaultGroup });
        }
        await bot.answerCallbackQuery(ctx.queryId);
    });
}

module.exports = registerHelpCallbacks;
