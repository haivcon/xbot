function registerCoreCommands(deps = {}) {
    const {
        bot,
        enforceBanForMessage,
        enforceOwnerCommandLimit,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        sendMessageRespectingThread,
        handleDonateCommand,
        handleDonateDevCommand,
        handleDonateCommunityManageCommand,
        initiateCheckinChallenge,
        sendCheckinStartPrompt,
        sendCheckinDmFailureNotice,
        t,
        buildLeaderboardText,
        handleOkxChainsCommand,
        okxChainsCommandDeps,
        handleOkx402StatusCommand,
        okx402CommandDeps,
        handleTxhashCommand,
        txhashCommandDeps,
        handleTokenCommand,
        tokenCommandDeps,
        handleTopTokenCommand,
        handleContractCommand,
        contractCommandDeps,
        handlePriceCommand,
        handlePriceTargetCommand,
        handlePriceUnsubscribeCommand,
        handleStartNoToken,
        handleRmchatCommand,
        handleRegisterCommand,
        handleWalletManagerCommand,
        handleUnregisterCommand,
        isOwner,
        registerCoOwner,
        OWNER_PASSWORD,
        resetOwnerPasswordAttempts,
        recordOwnerPasswordFailure,
        ownerPasswordPrompts,
        ownerActionStates,
        getLang,
        sendReply,
        buildOwnerMenuText,
        buildOwnerMenuKeyboard,
        getDefaultOwnerGroup,
        buildCloseKeyboard,
        handleLangCommand,
        handleLanguageCommand,
        handleTopicLanguageCommand,
        getDefaultHelpGroup,
        buildHelpText,
        buildHelpKeyboard,
        saveHelpMessageState,
        handleAiaCommand
    } = deps;

    if (!bot) throw new Error('bot is required for core commands');

    bot.onText(/^\/donate(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleDonateCommand(msg);
    });

    bot.onText(/^\/donatedev(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleDonateDevCommand(msg);
    });

    bot.onText(/^\/donatecm(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = match[1];
        await handleDonateCommunityManageCommand(msg, payload);
    });

    bot.onText(/^\/checkin(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'checkin')) {
            return;
        }
        const chatType = msg.chat?.type;
        const chatId = msg.chat.id.toString();
        const topicId = msg.message_thread_id;
        const userLang = topicId ? await resolveGroupLanguage(chatId, msg.from.language_code, topicId) : await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await bot.sendMessage(chatId, t(userLang, 'checkin_dm_use_button'));
            return;
        }

        const result = await initiateCheckinChallenge(chatId, msg.from, { replyMessage: msg });
        const responseLang = result.userLang || userLang;
        if (result.status === 'locked') {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_locked'));
        } else if (result.status === 'checked') {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_already_checked'));
        } else if (result.status === 'failed') {
            if (result.failureReason === 'dm_unreachable') {
                if (result.startLink) {
                    await sendCheckinStartPrompt(msg, responseLang, result.startLink, msg.from);
                } else {
                    await sendCheckinDmFailureNotice(msg, responseLang, msg.from);
                }
            } else {
                await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_dm_failed'));
            }
        } else {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_answer_sent_dm'));
        }
    });

    bot.onText(/^\/topcheckin(?:@[\w_]+)?(?:\s+(streak|total|points|longest))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'topcheckin')) {
            return;
        }
        const chatId = msg.chat.id.toString();
        const chatType = msg.chat?.type;
        const topicId = msg.message_thread_id;
        const mode = (match && match[1]) ? match[1] : 'streak';
        const userLang = topicId ? await resolveGroupLanguage(chatId, msg.from.language_code, topicId) : await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await bot.sendMessage(chatId, t(userLang, 'checkin_error_group_only'));
            return;
        }

        const boardLang = await resolveGroupLanguage(chatId, null, topicId);
        const text = await buildLeaderboardText(chatId, mode, 10, boardLang);
        await sendMessageRespectingThread(chatId, msg, text);
    });

    bot.onText(/^\/okxchains(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkxChainsCommand(okxChainsCommandDeps, msg);
    });

    bot.onText(/^\/okx402status(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkx402StatusCommand(okx402CommandDeps, msg);
    });

    bot.onText(/^\/txhash(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleTxhashCommand(txhashCommandDeps, msg, null);
    });

    bot.onText(/^\/token(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleTokenCommand(tokenCommandDeps, msg, null);
    });

    bot.onText(/^\/toptoken(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleTopTokenCommand(msg);
    });

    bot.onText(/^\/contract(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = match[1];
        await handleContractCommand(contractCommandDeps, msg, payload);
    });

    bot.onText(/^\/price(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handlePriceCommand(msg);
    });

    bot.onText(/^\/pricev(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handlePriceTargetCommand(msg);
    });

    bot.onText(/^\/pricex(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handlePriceUnsubscribeCommand(msg);
    });

    bot.onText(/^\/okx402status(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkx402StatusCommand(msg);
    });

    bot.onText(/^\/start(?:@[\w_]+)?(?:\s(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = (match && match[1]) ? match[1].trim() : '';

        // Handle deep link: /start dashboard_login
        if (payload === 'dashboard_login') {
            const userId = msg.from?.id?.toString();
            try {
                const crypto = require('crypto');
                const { dashboardLoginTokens } = require('../core/state');
                const token = crypto.randomBytes(32).toString('hex');
                dashboardLoginTokens.set(token, {
                    userId,
                    firstName: msg.from?.first_name || '',
                    username: msg.from?.username || '',
                    createdAt: Date.now(),
                });
                setTimeout(() => dashboardLoginTokens.delete(token), 5 * 60 * 1000);

                const port = process.env.API_PORT || 3001;
                const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
                const loginUrl = `${baseUrl}/api/dashboard/auth/auto-login?token=${token}`;

                const lang = await getLang(msg);
                const isHttps = loginUrl.startsWith('https://');

                if (isHttps) {
                    // HTTPS: use inline button (Telegram requires HTTPS for URL buttons)
                    await bot.sendMessage(msg.chat.id, `🌐 *XBot Dashboard*\n\n✅ Click the button below to login\n⏳ Link expires in 5 minutes`, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔓 Open Dashboard', url: loginUrl }
                            ]]
                        }
                    });
                } else {
                    // HTTP/localhost: send as text link
                    await bot.sendMessage(msg.chat.id, `🌐 XBot Dashboard\n\n🔗 ${loginUrl}\n\n⏳ Link expires in 5 minutes`, {
                        disable_web_page_preview: true,
                    });
                }
            } catch (err) {
                const logger = require('../core/logger');
                logger.child('Dashboard').error('Error generating dashboard link:', err);
                await bot.sendMessage(msg.chat.id, '❌ Error generating dashboard link').catch(() => { });
            }
            return;
        }

        await handleStartNoToken(msg);
    });

    bot.onText(/^\/rmchat(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleRmchatCommand(msg);
    });

    bot.onText(/^\/register(?:@[\w_]+)?(?:\s+(.*))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = (match && match[1]) || '';
        await handleRegisterCommand(msg, payload);
    });

    bot.onText(/^\/mywallet(?:@[\w_]+)?(?:\s|$)/i, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleWalletManagerCommand(msg);
    });

    bot.onText(/^\/unregister(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleUnregisterCommand(msg);
    });

    bot.onText(/^\/owner(?:@[\w_]+)?(?:\s+(.*))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const userId = msg.from?.id?.toString();
        const username = msg.from?.username || '';
        const lang = await getLang(msg);

        const providedPassword = (match?.[1] || '').trim();
        if (!isOwner(userId, username)) {
            if (providedPassword && providedPassword === OWNER_PASSWORD) {
                await registerCoOwner(userId, msg.from, userId);
                resetOwnerPasswordAttempts(userId);
                ownerPasswordPrompts.delete(userId);
            } else {
                if (providedPassword && providedPassword !== OWNER_PASSWORD) {
                    const stopped = await recordOwnerPasswordFailure(msg, lang);
                    if (stopped) {
                        return;
                    }
                }
                const prompt = await sendReply(msg, t(lang, 'owner_password_prompt'), {
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: t(lang, 'owner_password_placeholder')
                    }
                });

                ownerPasswordPrompts.set(userId, {
                    chatId: msg.chat?.id?.toString(),
                    messageId: prompt?.message_id || null,
                    lang
                });
                return;
            }
        }

        const targetChatId = msg.chat?.type === 'private' ? msg.chat.id : msg.from?.id;
        ownerActionStates.delete(userId);

        const defaultGroup = getDefaultOwnerGroup();
        const menuText = buildOwnerMenuText(lang, defaultGroup);
        await bot.sendMessage(targetChatId, menuText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: buildOwnerMenuKeyboard(lang, defaultGroup)
        });

        if (targetChatId !== msg.chat.id) {
            await sendReply(msg, t(lang, 'owner_menu_dm_notice'), { reply_markup: buildCloseKeyboard(lang) });
        }
    });

    const unifiedLanguageHandler = handleLangCommand || handleTopicLanguageCommand || handleLanguageCommand;
    bot.onText(/^\/lang(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (typeof unifiedLanguageHandler === 'function') {
            await unifiedLanguageHandler(msg);
        }
    });

    bot.onText(/^\/help(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'help')) {
            return;
        }
        const lang = await getLang(msg);
        const defaultGroup = getDefaultHelpGroup();
        const helpText = buildHelpText(lang, defaultGroup);
        const replyMarkup = buildHelpKeyboard(lang, defaultGroup);
        const sent = await sendReply(msg, helpText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup
        });
        if (sent?.chat?.id && sent?.message_id) {
            saveHelpMessageState(sent.chat.id.toString(), sent.message_id, {
                view: 'user',
                group: defaultGroup,
                threadId: sent.message_thread_id  // Save thread ID for callbacks
            });
        }
    });

    // COMMAND: /aib - AI Function Calling
    bot.onText(/^\/aib(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (typeof handleAiaCommand === 'function') {
            await handleAiaCommand(msg);
        }
    });
    // COMMAND: /dashboard - Open web dashboard with auto-login link
    bot.onText(/^\/dashboard(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) return;
        const userId = msg.from?.id?.toString();
        const lang = await getLang(msg);

        try {
            const crypto = require('crypto');
            const { dashboardLoginTokens } = require('../core/state');

            const token = crypto.randomBytes(32).toString('hex');

            dashboardLoginTokens.set(token, {
                userId,
                firstName: msg.from?.first_name || '',
                username: msg.from?.username || '',
                createdAt: Date.now(),
            });

            setTimeout(() => dashboardLoginTokens.delete(token), 5 * 60 * 1000);

            const port = process.env.API_PORT || 3001;
            const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
            const loginUrl = `${baseUrl}/api/dashboard/auth/auto-login?token=${token}`;

            const text = `🌐 XBot Dashboard\n\n🔗 ${loginUrl}\n\n⏳ Link expires in 5 minutes`;

            await bot.sendMessage(msg.chat.id, text, {
                disable_web_page_preview: true,
            });
        } catch (err) {
            const logger = require('../core/logger');
            logger.child('Dashboard').error('Error generating dashboard link:', err);
            await bot.sendMessage(msg.chat.id, '❌ Error generating dashboard link: ' + err.message).catch(() => { });
        }
    });
}

module.exports = registerCoreCommands;
