const logger = require('../core/logger');
const log = logger.child('WalletCmd');

function createWalletCommandHandlers({
    enforceOwnerCommandLimit,
    getLang,
    sendReply,
    bot,
    parseRegisterPayload,
    buildWalletActionKeyboard,
    buildCloseKeyboard,
    buildWalletSelectMenu,
    buildWalletManagerMenu,
    buildPortfolioEmbedUrl,
    db,
    t,
    escapeHtml,
    shortenAddress,
    registerWizardStates
}) {
    const managerMenuMessages = new Map();

    async function sendWalletManagerMenu(chatId, lang, { replyTo = null } = {}) {
        if (!chatId) {
            return null;
        }
        const previousId = managerMenuMessages.get(chatId);
        if (previousId) {
            try {
                await bot.deleteMessage(chatId, previousId);
            } catch (error) {
                // ignore deletion errors
            }
        }

        const menu = await buildWalletManagerMenu(lang, chatId);
        const options = { parse_mode: 'HTML', reply_markup: menu.replyMarkup };
        const sent = replyTo ? await sendReply(replyTo, menu.text, options) : await bot.sendMessage(chatId, menu.text, options);

        if (sent?.message_id) {
            managerMenuMessages.set(chatId, sent.message_id);
        }

        return sent;
    }

    async function startRegisterWizard(userId, lang, { notifyInChat = null } = {}) {
        if (!userId) {
            return null;
        }

        const promptText = t(lang, 'register_help_prompt');
        try {
            const prompt = await bot.sendMessage(userId, promptText, {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: t(lang, 'register_help_placeholder')
                }
            });

            registerWizardStates.set(userId, {
                promptMessageId: prompt?.message_id || null,
                createdAt: Date.now()
            });

            if (notifyInChat) {
                await sendReply(notifyInChat, t(lang, 'help_action_dm_sent'), {
                    reply_markup: buildCloseKeyboard(lang)
                });
            }

            return prompt;
        } catch (error) {
            log.child('RegisterWizard').warn(`Cannot DM ${userId}: ${error.message}`);
            if (notifyInChat) {
                await sendReply(notifyInChat, t(lang, 'help_action_dm_blocked'), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                return null;
            }
            throw error;
        }
    }

    async function handleRegisterCommand(msg, payload) {
        if (await enforceOwnerCommandLimit(msg, 'register')) {
            return;
        }
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        if (!payload || !payload.trim()) {
            try {
                await startRegisterWizard(msg.from?.id?.toString(), lang, { notifyInChat: msg });
            } catch (error) {
                log.child('Register').warn(`Wizard failed for ${chatId}: ${error.message}`);
                await sendReply(msg, t(lang, 'register_usage'), { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang) });
            }
            return;
        }

        const parsed = parseRegisterPayload(payload);
        if (!parsed) {
            await sendReply(msg, t(lang, 'register_usage'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        try {
            const result = await db.addWalletToUser(chatId, lang, parsed.wallet, { name: parsed.name });

            const walletLabel = shortenAddress(parsed.wallet);
            const effectiveName = parsed.name || result?.name;
            const messageKey = result?.added
                ? (effectiveName ? 'register_wallet_saved_named' : 'register_wallet_saved')
                : (result?.nameChanged ? 'register_wallet_renamed' : 'register_wallet_exists');
            const message = t(lang, messageKey, { wallet: `<code>${escapeHtml(parsed.wallet)}</code>`, name: `<b>${escapeHtml(effectiveName)}</b>` });
            const portfolioLinks = [{ address: parsed.wallet, url: buildPortfolioEmbedUrl(parsed.wallet) }];
            await sendReply(msg, message, { parse_mode: 'HTML', reply_markup: buildWalletActionKeyboard(lang, portfolioLinks) });
            log.child('BOT').info(`Dang ky ${walletLabel} -> ${chatId} (tokens: auto-detect)`);

            try {
                await sendWalletManagerMenu(chatId, lang, { replyTo: msg });
            } catch (error) {
                log.child('Register').warn(`Failed to refresh wallet manager for ${chatId}: ${error.message}`);
            }
        } catch (error) {
            log.child('Register').error(`Failed to save token for ${chatId}: ${error.message}`);
            await sendReply(msg, t(lang, 'register_help_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        }
    }

    async function handleMyWalletCommand(msg) {
        return handleWalletManagerCommand(msg);
    }

    async function handleWalletManagerCommand(msg) {
        if (await enforceOwnerCommandLimit(msg, 'mywallet')) {
            return;
        }
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        try {
            await sendWalletManagerMenu(chatId, lang, { replyTo: msg });
        } catch (error) {
            log.child('WalletManager').error(`Failed to open manager for ${chatId}: ${error.message}`);
            await sendReply(msg, t(lang, 'wallet_overview_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        }
    }

    async function handleUnregisterCommand(msg) {
        return handleWalletManagerCommand(msg);
    }

    return {
        handleRegisterCommand,
        handleMyWalletCommand,
        handleUnregisterCommand,
        handleWalletManagerCommand,
        startRegisterWizard,
        sendWalletManagerMenu
    };
}

module.exports = { createWalletCommandHandlers };
