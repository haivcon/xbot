function createHelpExecutors(deps) {
    const {
        bot,
        t,
        buildSyntheticCommandMessage,
        commandRegistry,
        handleStartNoToken,
        handleIdTelegramCommand,
        handleAiCommand,
        handleApiCommand,
        startRegisterWizard,
        handleMyWalletCommand,
        handleRmchatCommand,
        handleDonateCommand,
        buildRandomMenuText,
        buildRandomMenuKeyboard,
        handleOkxChainsCommand,
        okxChainsCommandDeps,
        handleOkx402StatusCommand,
        okx402CommandDeps,
        handleTopTokenCommand,
        handleTxhashCommand,
        txhashCommandDeps,
        handleContractCommand,
        contractCommandDeps,
        handleTokenCommand,
        tokenCommandDeps,
        handleUnregisterCommand,
        handleLangCommand,
        handleLanguageCommand,
        handleTopicLanguageCommand,
        handlePriceCommand,
        initiateCheckinChallenge,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        buildLeaderboardText,
        sendMessageRespectingThread,
        handleAdminCommand,
        getAdminContextChatId,
        getHelpMessageState,
        openAdminHub,
        sendModerationAdminPanel,
        extractThreadId,
        buildAdminCommandDetail,
        launchWelcomeAdminFlow
    } = deps || {};

    const trackCommand = (commandName, query, synthetic) => {
        if (!commandRegistry || !commandName) return;
        const userId = query?.from?.id?.toString();
        if (!userId) return;
        commandRegistry.trackRecent(userId, commandName);
        if (synthetic) {
            synthetic._recentTracked = true;
        }
    };

    const buildAdminDetailExecutor = (key) => async (query, lang, { targetChatId } = {}) => {
        trackCommand(key, query);
        const chatId = query.message?.chat?.id;
        const resolvedChatId = targetChatId || getAdminContextChatId(query.from?.id);
        const detail = buildAdminCommandDetail(lang, key);
        if (chatId && detail) {
            if (resolvedChatId) {
                detail.text = `${detail.text}\n\n${t(lang, 'admin_group_info_id', { id: resolvedChatId.toString() })}`;
            }
            await bot.sendMessage(chatId, detail.text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: detail.reply_markup
            });
        }
        return { message: t(lang, 'help_action_executed') };
    };

    return {
        start: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('start', query, synthetic);
            await handleStartNoToken(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        datatelegram: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/dataTelegram';
            trackCommand('datatelegram', query, synthetic);
            await handleIdTelegramCommand(synthetic, lang);
            return { message: t(lang, 'help_action_executed') };
        },
        ai: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/ai';
            trackCommand('ai', query, synthetic);
            await handleAiCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        api: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/api';
            trackCommand('api', query, synthetic);
            await handleApiCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        register: async (query, lang) => {
            try {
                trackCommand('register', query);
                await startRegisterWizard(query.from.id, lang);
                return { message: t(lang, 'help_action_dm_sent') };
            } catch (error) {
                const statusCode = error?.response?.statusCode;
                if (statusCode === 403) {
                    return { message: t(lang, 'help_action_dm_blocked'), showAlert: true };
                }
                return { message: t(lang, 'help_action_failed'), showAlert: true };
            }
        },
        mywallet: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('mywallet', query, synthetic);
            await handleMyWalletCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        rmchat: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('rmchat', query, synthetic);
            await handleRmchatCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        donate: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('donate', query, synthetic);
            await handleDonateCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        profile: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/profile';
            trackCommand('profile', query, synthetic);
            bot.processUpdate({ update_id: Date.now(), message: synthetic });
            return { message: t(lang, 'help_action_executed') };
        },
        ping: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/ping';
            synthetic.entities = [{ type: 'bot_command', offset: 0, length: 5 }];
            trackCommand('ping', query, synthetic);
            bot.processUpdate({ update_id: Date.now(), message: synthetic });
            return { message: t(lang, 'help_action_executed') };
        },
        recent: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/recent';
            synthetic.entities = [{ type: 'bot_command', offset: 0, length: 7 }];
            trackCommand('recent', query, synthetic);
            bot.processUpdate({ update_id: Date.now(), message: synthetic });
            return { message: t(lang, 'help_action_executed') };
        },
        random: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            trackCommand('random', query);

            // Get saved thread ID from help message state
            const helpState = chatId && query.message?.message_id
                ? getHelpMessageState(chatId.toString(), query.message.message_id)
                : null;
            const savedThreadId = helpState?.threadId;

            if (chatId) {
                try {
                    // Create message with correct thread ID
                    const messageWithThread = {
                        ...query.message,
                        message_thread_id: savedThreadId || query.message?.message_thread_id
                    };

                    await sendMessageRespectingThread(chatId, messageWithThread, buildRandomMenuText(lang), {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        reply_markup: buildRandomMenuKeyboard(lang)
                    });
                } catch (error) {
                    console.warn(`[Help] Failed to open random menu from help: ${error.message}`);
                }
            }
            return { message: t(lang, 'help_action_executed') };
        },
        rand: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        rps: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        roll: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        td: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        doremon: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        okxchains: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            const deps = okxChainsCommandDeps || {};
            const wrappedDeps = {
                ...deps,
                enforceOwnerCommandLimit: typeof deps.enforceOwnerCommandLimit === 'function' ? deps.enforceOwnerCommandLimit : async () => false
            };
            trackCommand('okxchains', query, synthetic);
            await handleOkxChainsCommand(wrappedDeps, synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        okx402status: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            const deps = okx402CommandDeps || {};
            const wrappedDeps = {
                ...deps,
                enforceOwnerCommandLimit: typeof deps.enforceOwnerCommandLimit === 'function' ? deps.enforceOwnerCommandLimit : async () => false
            };
            trackCommand('okx402status', query, synthetic);
            await handleOkx402StatusCommand(wrappedDeps, synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        toptoken: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('toptoken', query, synthetic);
            await handleTopTokenCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        txhash: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('txhash', query, synthetic);
            await handleTxhashCommand(txhashCommandDeps, synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        contract: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('contract', query, synthetic);
            await handleContractCommand(contractCommandDeps, synthetic, '');
            return { message: t(lang, 'help_action_executed') };
        },
        token: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('token', query, synthetic);
            await handleTokenCommand(tokenCommandDeps, synthetic, '');
            return { message: t(lang, 'help_action_executed') };
        },
        unregister: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            trackCommand('unregister', query, synthetic);
            await handleUnregisterCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        lang: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            const handler = handleLangCommand || handleTopicLanguageCommand || handleLanguageCommand;
            trackCommand('lang', query, synthetic);
            await handler(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        language: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            const handler = handleLangCommand || handleTopicLanguageCommand || handleLanguageCommand;
            trackCommand('language', query, synthetic);
            await handler(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        languagev: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            const handler = handleLangCommand || handleTopicLanguageCommand || handleLanguageCommand;
            trackCommand('languagev', query, synthetic);
            await handler(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        help: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        price: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/price';
            trackCommand('price', query, synthetic);
            await handlePriceCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        checkin: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            const chatType = query.message?.chat?.type;
            trackCommand('checkin', query);
            if (!chatId || chatType === 'private') {
                return { message: t(lang, 'checkin_error_group_only'), showAlert: true };
            }

            const result = await initiateCheckinChallenge(chatId, query.from, { replyMessage: query.message });
            const responseLang = result.userLang || lang;
            if (result.status === 'locked') {
                return { message: t(responseLang, 'checkin_error_locked'), showAlert: true };
            }
            if (result.status === 'checked') {
                return { message: t(responseLang, 'checkin_error_already_checked'), showAlert: true };
            }
            if (result.status === 'failed') {
                if (result.failureReason === 'dm_unreachable') {
                    return { message: t(responseLang, 'checkin_dm_failure_start_alert'), showAlert: true };
                }
                return { message: t(responseLang, 'checkin_error_dm_failed'), showAlert: true };
            }
            return { message: t(responseLang, 'checkin_answer_sent_alert') };
        },
        topcheckin: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            const chatType = query.message?.chat?.type;
            trackCommand('topcheckin', query);
            if (!chatId || chatType === 'private') {
                return { message: t(lang, 'checkin_error_group_only'), showAlert: true };
            }

            const boardLang = await resolveGroupLanguage(chatId);
            const text = await buildLeaderboardText(chatId, 'streak', 10, boardLang);
            await sendMessageRespectingThread(chatId, query.message, text);
            return { message: t(lang, 'help_action_executed') };
        },
        checkinadmin: async (query, lang, context = {}) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/checkinadmin';
            trackCommand('checkinadmin', query, synthetic);
            await handleAdminCommand(synthetic, { targetChatId: context.targetChatId });
            return { message: t(lang, 'help_action_executed') };
        },
        admin: async (query, lang, context = {}) => {
            const langWithFallback = await resolveNotificationLanguage(query.from?.id, lang);
            const chat = query.message?.chat;
            const chatType = chat?.type;
            const targetChatId =
                context.targetChatId ||
                getAdminContextChatId(query.from?.id) ||
                (chat && ['group', 'supergroup'].includes(chatType || '') ? chat.id.toString() : null);

            if (!targetChatId || !chat || !['group', 'supergroup'].includes(chatType || '')) {
                return { message: t(langWithFallback, 'admin_action_group_only'), showAlert: true };
            }

            trackCommand('admin', query);
            const result = await sendModerationAdminPanel(query.from.id, targetChatId, {
                fallbackLang: langWithFallback,
                deliverToChatId: targetChatId,
                threadId: extractThreadId(query),
                editMessage: query.message
            });

            if (result.status === 'forbidden') {
                return { message: t(langWithFallback, 'owner_not_allowed'), showAlert: true };
            }
            if (result.status === 'error' || result.status === 'invalid') {
                return { message: t(langWithFallback, 'help_action_failed'), showAlert: true };
            }
            return { message: t(langWithFallback, 'admin_hub_refreshed') };
        },
        admin_id: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            const detail = buildAdminCommandDetail(lang, 'admin_id');
            if (chatId && detail) {
                await bot.sendMessage(chatId, detail.text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: detail.reply_markup });
            }
            return { message: t(lang, 'help_action_executed') };
        },
        admin_welcome: async (query, lang, context = {}) => {
            const chatId = query.message?.chat?.id;
            const chatType = query.message?.chat?.type;
            const targetChatId = context.targetChatId || getAdminContextChatId(query.from?.id);
            const result = await launchWelcomeAdminFlow({
                actorId: query.from?.id,
                chatId: targetChatId || chatId,
                chatType,
                lang,
                replyMessage: query.message,
                notifyInChat: false
            });

            if (result.status === 'invalid_chat') {
                return { message: t(lang, 'welcome_admin_group_only'), showAlert: true };
            }
            if (result.status === 'forbidden') {
                return { message: t(lang, 'welcome_admin_no_permission'), showAlert: true };
            }
            if (result.status === 'error') {
                return { message: t(lang, 'welcome_admin_dm_error'), showAlert: true };
            }
            return { message: t(lang, 'welcome_admin_menu_opening') };
        },
        welcomeadmin: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            const chatType = query.message?.chat?.type;
            const result = await launchWelcomeAdminFlow({
                actorId: query.from?.id,
                chatId,
                chatType,
                lang,
                replyMessage: query.message,
                notifyInChat: false
            });

            if (result.status === 'invalid_chat') {
                return { message: t(lang, 'welcome_admin_group_only'), showAlert: true };
            }
            if (result.status === 'forbidden') {
                return { message: t(lang, 'welcome_admin_no_permission'), showAlert: true };
            }
            if (result.status === 'error') {
                return { message: t(lang, 'welcome_admin_dm_error'), showAlert: true };
            }
            return { message: t(lang, 'welcome_admin_menu_opening') };
        },
        admin: buildAdminDetailExecutor('admin'),
        admin_ban: buildAdminDetailExecutor('admin_ban'),
        admin_kick: buildAdminDetailExecutor('admin_kick'),
        admin_mute: buildAdminDetailExecutor('admin_mute'),
        admin_unmute: buildAdminDetailExecutor('admin_unmute'),
        admin_muteall: buildAdminDetailExecutor('admin_muteall'),
        admin_unmuteall: buildAdminDetailExecutor('admin_unmuteall'),
        admin_warn: buildAdminDetailExecutor('admin_warn'),
        admin_delete: buildAdminDetailExecutor('admin_delete'),
        admin_lock_links: buildAdminDetailExecutor('admin_lock_links'),
        admin_lock_files: buildAdminDetailExecutor('admin_lock_files'),
        admin_antiflood: buildAdminDetailExecutor('admin_antiflood'),
        admin_rules: buildAdminDetailExecutor('admin_rules'),
        admin_info: buildAdminDetailExecutor('admin_info'),
        admin_filter: buildAdminDetailExecutor('admin_filter'),
        admin_filters: buildAdminDetailExecutor('admin_filters'),
        admin_filterx: buildAdminDetailExecutor('admin_filterx')
    };
}

module.exports = createHelpExecutors;
