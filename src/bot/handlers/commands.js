function registerCommandHandlers(context) {
    let handleIdTelegramCommand;
    let buildFiltersListView;
    const {
        bot, t, db, defaultLang,
        escapeHtml, formatExecutionAudit,
        handleDonateCommand, handleDonateDevCommand, handleDonateCommunityManageCommand,
        enforceBanForMessage, enforceOwnerCommandLimit, enforceDoremonLimit,
        resolveNotificationLanguage, resolveGroupLanguage, buildLeaderboardText,
        sendMessageRespectingThread, sendReply,
        handleOkxChainsCommand, handleOkx402StatusCommand,
        handleTxhashCommand, handleTokenCommand, handleTopTokenCommand,
        handleContractCommand, handleAdminCommand, launchWelcomeAdminFlow,
        handleRmchatCommand, handleUnregisterCommand,
        isOwner, registerCoOwner, resetOwnerPasswordAttempts, recordOwnerPasswordFailure,
        ownerPasswordPrompts, ownerActionStates,
        getDefaultOwnerGroup, buildOwnerMenuText, buildOwnerMenuKeyboard, buildCloseKeyboard,
        handleLangCommand, handleLanguageCommand,
        getDefaultHelpGroup, buildHelpText, buildHelpKeyboard, saveHelpMessageState,
        getLang, buildRandomMenuText, buildRandomMenuKeyboard,
        randomizeTextCase, getRandomInt, generateLongShortOutcome,
        parseMemorySizeInput, createMemoryGame,
        createMinesweeperGame, createTreasureGame,
        parseGomokuSizeInput, getGomokuUserDifficulty, createGomokuGame,
        determineRpsResult, buildRpsKeyboard,
        parseDiceNotation, rollDice, formatRollContext, formatDiceDetail,
        generateCheckinChallenge, storeRandomQuiz, buildQuizKeyboard,
        randomFortunes, pickRandomFortune, buildRandomResultKeyboard, buildFortuneKeyboard,
        okxChainsCommandDeps, okx402CommandDeps, txhashCommandDeps, tokenCommandDeps, contractCommandDeps,
        initiateCheckinChallenge, sendCheckinStartPrompt, sendCheckinDmFailureNotice,
        launchAdminHelpMenu, getAdminTargetChatId, parseTargetFromCommand, resolveTargetId,
        ensureAdminOrOwner, resolveUserProfile, getGroupSettings, clearScheduledUnmute, scheduleAutomaticUnmute,
        getWarnState, applyWarnAction, sendIdTelegramDetails, collectTelegramFileIds,
        idTelegramSessions, OWNER_PASSWORD,
        handleAiaCommand
    } = context;

    const buildRandomGameText = (bodyText, actor, lang) => {
        const safeBody = bodyText || '';
        const audit = formatExecutionAudit(actor || {}, lang);
        return [safeBody, '', audit].join('\n');
    };
    // COMMAND: /donate - C?n async
    bot.onText(/^\/donate(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleDonateCommand(msg);
    });

    // COMMAND: /donatedev - C?n async
    bot.onText(/^\/donatedev(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleDonateDevCommand(msg);
    });

    // COMMAND: /donatecm - C?n async
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
        const userLang = await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
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
        const mode = (match && match[1]) ? match[1] : 'streak';
        const userLang = await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await sendMessageRespectingThread(chatId, msg, t(userLang, 'checkin_error_group_only'));
            return;
        }

        const boardLang = await resolveGroupLanguage(chatId);
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

    bot.onText(/^\/checkinadmin(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleAdminCommand(msg);
    });

    bot.onText(/^\/welcomeadmin(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const chatType = msg.chat?.type;
        const lang = await getLang(msg);
        const result = await launchWelcomeAdminFlow({
            actorId: msg.from?.id,
            chatId: msg.chat?.id,
            chatType,
            lang,
            replyMessage: msg
        });

        if (result.status === 'invalid_chat') {
            await sendReply(msg, t(lang, 'welcome_admin_group_only'));
            return;
        }
        if (result.status === 'forbidden') {
            await sendReply(msg, t(lang, 'welcome_admin_no_permission'));
            return;
        }
        if (result.status === 'error') {
            await sendReply(msg, t(lang, 'welcome_admin_dm_error'));
            return;
        }
        if (result.status === 'dm_opened' && chatType === 'private') {
            await sendReply(msg, t(lang, 'welcome_admin_menu_opening'));
        }
    });

    bot.onText(/^\/okx402status(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkx402StatusCommand(msg);
    });

    bot.onText(/^\/rmchat(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleRmchatCommand(msg);
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

    const unifiedLanguageHandler = handleLangCommand || handleLanguageCommand;
    bot.onText(/^\/lang(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (typeof unifiedLanguageHandler === 'function') {
            await unifiedLanguageHandler(msg);
        }
    });

    // L?NH: /help - C?n async
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

    bot.onText(/^\/random(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const text = buildRandomMenuText(lang);
        await sendReply(msg, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: buildRandomMenuKeyboard(lang)
        });
    });

    bot.onText(/^\/rand(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const replyText = msg.reply_to_message?.text || msg.reply_to_message?.caption;
        if (replyText) {
            const randomized = randomizeTextCase(replyText);
            await sendReply(msg, t(lang, 'random_textcase_result', { text: escapeHtml(randomized) }), { parse_mode: 'HTML' });
            return;
        }

        const rawArgs = (match?.[1] || '').trim();
        const normalizedSignature = rawArgs.replace(/\s+/g, '').toLowerCase();
        const args = rawArgs.split(/\s+/).filter(Boolean);
        const allNumeric = args.length > 0 && args.every((item) => /^[-+]?\d+(?:\.\d+)?$/.test(item));

        if (normalizedSignature === 'long/short' || normalizedSignature === 'longshort') {
            const outcome = generateLongShortOutcome(lang);
            const text = [`?? <b>${escapeHtml(t(lang, 'random_longshort_title'))}</b>`, '', `${escapeHtml(outcome.line)}`, '', formatExecutionAudit(msg.from, lang)].join('\n');
            await sendReply(msg, text, { parse_mode: 'HTML' });
            return;
        }

        if (args.length >= 2 && !allNumeric) {
            const choiceIndex = getRandomInt(1, args.length) - 1;
            const formattedList = args
                .map((option, idx) => `${idx + 1}. ${escapeHtml(option)}`)
                .join('\n');

            const text = [
                // Ti�u d? -> ??
                `?? <b>${escapeHtml(t(lang, 'random_choice_title'))}</b>`,

                // T�m t?t s? lu?ng -> ??
                `?? ${escapeHtml(t(lang, 'random_choice_summary', { count: args.length }))}`,
                '',
                // Danh s�ch t�y ch?n -> ??
                `?? ${escapeHtml(t(lang, 'random_choice_options'))}`,
                `<code>${formattedList}</code>`,
                '',
                // K?t qu? -> ?
                `? ${escapeHtml(t(lang, 'random_choice_result_label'))} <b>${escapeHtml(args[choiceIndex])}</b>`
            ].join('\n');

            await sendReply(msg, text, { parse_mode: 'HTML' });
            return;
        }

        if (!rawArgs) {
            args.push('1', '1000');
        }

        if (args.length === 1 && allNumeric) {
            args.unshift('1');
        }

        if (args.length === 1) {
            await sendReply(msg, t(lang, 'random_rand_usage'), { parse_mode: 'HTML' });
            return;
        }

        const min = Number(args[0]);
        const max = Number(args[1]);
        const value = getRandomInt(min || 1, max || 1000);
        const text = [
            `?? <b>${escapeHtml(t(lang, 'random_number_title'))}</b>`,
            `?? ${escapeHtml(t(lang, 'random_number_range', { min: min || 1, max: max || 1000 }))}`,
            `? ${escapeHtml(t(lang, 'random_number_result', { value }))}`
        ].join('\n');
        await sendReply(msg, text, { parse_mode: 'HTML' });
    });

    bot.onText(/^\/memory(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const raw = (match?.[1] || '').trim();
        const themeKeys = ['food', 'sports', 'nature', 'animals', 'travel', 'symbols', 'mixed', 'mix', 'all'];
        let theme = 'mixed';
        let sizeRaw = raw;
        if (raw) {
            const tokens = raw.split(/\s+/).filter(Boolean);
            const first = (tokens[0] || '').toLowerCase();
            if (themeKeys.includes(first)) {
                theme = first;
                sizeRaw = tokens.slice(1).join(' ');
            }
        }
        const parsed = parseMemorySizeInput(sizeRaw);
        if (sizeRaw && !parsed) {
            await sendReply(msg, t(lang, 'random_memory_usage'));
            return;
        }
        const game = createMemoryGame(lang, parsed?.cols, parsed?.rows, theme);
        const text = buildRandomGameText(game.text, msg.from, lang);
        await sendReply(msg, text, { reply_markup: game.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/mines(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const raw = (match?.[1] || '').trim();
        const parsed = parseMemorySizeInput(raw);
        if (raw && !parsed) {
            await sendReply(msg, t(lang, 'random_mines_usage'));
            return;
        }
        const game = createMinesweeperGame(lang, parsed?.cols, parsed?.rows);
        const text = buildRandomGameText(game.text, msg.from, lang);
        await sendReply(msg, text, { reply_markup: game.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/treasure(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const raw = (match?.[1] || '').trim();
        const parsed = parseTreasureSizeInput(raw);
        if (raw && !parsed) {
            await sendReply(msg, t(lang, 'random_treasure_usage'));
            return;
        }
        const game = createTreasureGame(lang, parsed || undefined, msg.from, { chatType: msg.chat?.type });
        const opponent = game.playerA?.id === msg.from?.id?.toString() ? game.playerB : game.playerA;
        const text = buildRandomGameText(game.text, msg.from, lang, opponent);
        await sendReply(msg, text, { reply_markup: game.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/gomoku(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const raw = (match?.[1] || '').trim();
        const parsedSize = parseGomokuSizeInput(raw);
        if (raw && !parsedSize) {
            await sendReply(msg, t(lang, 'random_gomoku_usage'));
            return;
        }
        const preferred = getGomokuUserDifficulty(msg.from?.id);
        const game = createGomokuGame(lang, parsedSize || undefined, msg.from, {
            chatType: msg.chat?.type,
            difficulty: preferred
        });
        const opponent = game.playerX?.id === msg.from?.id?.toString() ? game.playerO : game.playerX;
        const text = buildRandomGameText(game.text, msg.from, lang, opponent);
        await sendReply(msg, text, { reply_markup: game.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/rps(?:@[\w_]+)?(?:\s+(rock|paper|scissors))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const choice = (match?.[1] || '').toLowerCase();
        const result = determineRpsResult(choice);
        if (!result) {
            await sendReply(msg, t(lang, 'random_rps_usage'), {
                reply_markup: buildRpsKeyboard(lang)
            });
            return;
        }
        const outcomeText = t(lang, `random_rps_${result.outcome}`, {
            user: `${result.userChoice.icon} ${t(lang, `random_rps_${result.userChoice.key}`)}`,
            bot: `${result.botChoice.icon} ${t(lang, `random_rps_${result.botChoice.key}`)}`
        });
        const text = [
            `?? <b>${escapeHtml(t(lang, 'random_rps_title'))}</b>`,
            '',
            `?? ${escapeHtml(t(lang, 'random_rps_you', { move: `${result.userChoice.icon} ${t(lang, `random_rps_${result.userChoice.key}`)}` }))}`,
            `?? ${escapeHtml(t(lang, 'random_rps_bot', { move: `${result.botChoice.icon} ${t(lang, `random_rps_${result.botChoice.key}`)}` }))}`,
            `? ${escapeHtml(t(lang, 'random_rps_reveal'))}`,
            '',
            `?? <b>${escapeHtml(outcomeText)}</b>`,
            '',
            `?? ${escapeHtml(t(lang, 'random_rps_hint'))}`,
            '',
            formatExecutionAudit(msg.from, lang)
        ].join('\n');
        await sendReply(msg, text, { parse_mode: 'HTML' });
    });

    bot.onText(/^\/roll(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const notation = (match?.[1] || '2d6').trim();
        const parsed = parseDiceNotation(notation);
        if (!parsed) {
            await sendReply(msg, t(lang, 'random_roll_usage'));
            return;
        }
        const result = rollDice(notation);
        const contextLine = formatRollContext(notation, parsed, lang);
        const detail = formatDiceDetail(result);
        const text = [
            `?? <b>${escapeHtml(t(lang, 'random_roll_title'))}</b>`,
            '',
            `?? ${escapeHtml(contextLine)}`,
            `?? ${escapeHtml(t(lang, 'random_roll_notation', { notation }))}`,
            '',
            `${escapeHtml(t(lang, 'random_roll_faces_label'))}`,
            `<pre>${escapeHtml(detail)}</pre>`,
            '',
            formatExecutionAudit(msg.from, lang)
        ].join('\n');
        await sendReply(msg, text, { parse_mode: 'HTML' });
    });

    bot.onText(/^\/td(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const challenge = generateCheckinChallenge(lang);
        const token = storeRandomQuiz(challenge, lang);
        const text = [
            `?? <b>${escapeHtml(t(lang, 'random_truth_title'))}</b>`,
            '',
            `? ${escapeHtml(challenge.question)}`,
            `?? ${escapeHtml(t(lang, 'random_truth_hint'))}`,
            '',
            formatExecutionAudit(msg.from, lang)
        ].join('\n');
        await sendReply(msg, text, { reply_markup: buildQuizKeyboard(token, challenge, lang), parse_mode: 'HTML' });
    });

    bot.onText(/^\/doremon(?:@[\w_]+)?(?:\s+(\d+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceDoremonLimit(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const topicIndex = Number.parseInt(match?.[1], 10) || getRandomInt(1, randomFortunes.length);
        const result = await pickRandomFortune(topicIndex, lang);
        if (!result) {
            await sendReply(msg, t(lang, 'random_fortune_invalid'));
            return;
        }
        const text = [
            `?? <b>${escapeHtml(t(lang, 'random_fortune_title'))}</b>`,
            '',
            `${escapeHtml(t(lang, 'random_fortune_drawn_topic', { topic: result.topicLabel }))}`,
            '',
            `<b>? ${escapeHtml(result.fortuneText)}</b>`,
            '',
            formatExecutionAudit(msg.from, lang)
        ].join('\n');
        await sendReply(msg, text, {
            parse_mode: 'HTML',
            reply_markup: buildRandomResultKeyboard(
                lang,
                buildFortuneKeyboard(lang, { includeBack: false }).inline_keyboard
            )
        });
    });

    async function handleIdTelegramCommand(msg, langOverride = null) {
        const lang = langOverride || (await getLang(msg));
        const userId = msg.from?.id?.toString() || null;
        const senderChatId = msg.sender_chat?.id?.toString() || null;
        const sessionKey = userId || (senderChatId ? `chat:${senderChatId}` : null);
        const chatId = msg.chat?.id;
        const chatIdStr = chatId ? chatId.toString() : null;
        const targetMessage = msg.reply_to_message || (collectTelegramFileIds(msg).length > 0 ? msg : null);

        if (targetMessage) {
            try {
                await sendIdTelegramDetails(targetMessage, msg, lang);
            } catch (error) {
                console.error(`[IdTelegram] Failed to send details: ${error.message}`);
            }
            return { status: 'details_sent' };
        }

        if (!sessionKey || !chatIdStr) {
            return { status: 'skipped' };
        }

        const existing = idTelegramSessions.get(sessionKey);
        if (existing?.promptMessageId && existing.chatId === chatIdStr) {
            try {
                await bot.deleteMessage(chatId, existing.promptMessageId);
            } catch (error) {
                // ignore cleanup errors
            }
        }

        const prompt = await sendReply(msg, t(lang, 'idtelegram_prompt'));
        idTelegramSessions.set(sessionKey, {
            chatId: chatIdStr,
            promptMessageId: prompt?.message_id || null,
            lang
        });

        return { status: 'prompt_sent' };
    }

    bot.onText(/^\/dataTelegram(?:@[\w_]+)?$/i, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }

        await handleIdTelegramCommand(msg);
    });


    bot.onText(/^\/admin(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        await launchAdminHelpMenu({
            actorId: msg.from?.id,
            chat: msg.chat,
            lang,
            replyMessage: msg
        });
    });

    bot.onText(/^\/id(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '') || { id: targetChatId, name: msg.chat.title };
        const resolved = await resolveTargetId(targetChatId, target);
        if (!resolved) {
            await sendReply(msg, t(lang, 'help_action_not_available'));
            return;
        }

        const profile = await resolveUserProfile(targetChatId, resolved);
        const lines = [`ID: ${resolved}`];
        if (profile?.username) {
            lines.push(`Username: @${profile.username}`);
        }
        if (profile?.first_name || profile?.last_name) {
            const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
            if (name) {
                lines.push(`Name: ${name}`);
            }
        }

        await sendReply(msg, `${t(lang, 'help_command_admin_id')}\n${lines.join('\n')}`);
    });

    bot.onText(/^\/ban(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Kh�ng t�m th?y ngu?i d�ng d? c?m.');
            return;
        }

        const settings = getGroupSettings(targetChatId);
        settings.bannedUsers.add(userId);
        await bot.banChatMember(targetChatId, userId, { revoke_messages: true });
        await sendReply(msg, `�� c?m ${userId}.`);
    });

    bot.onText(/^\/unban(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Kh�ng t�m th?y ngu?i d�ng d? g? c?m.');
            return;
        }

        const settings = getGroupSettings(targetChatId);
        settings.bannedUsers.delete(userId);
        await bot.unbanChatMember(targetChatId, userId, { only_if_banned: true });
        await sendReply(msg, `�� g? c?m ${userId}.`);
    });

    bot.onText(/^\/unbanall(?:@[\w_]+)?(?:\s*)$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        for (const userId of settings.bannedUsers) {
            await bot.unbanChatMember(targetChatId, userId, { only_if_banned: true }); // eslint-disable-line no-await-in-loop
        }
        settings.bannedUsers.clear();
        await sendReply(msg, '�� g? c?m cho t?t c? ngu?i d�ng d� b? c?m b?i bot.');
    });

    bot.onText(/^\/kick(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Kh�ng t�m th?y ngu?i d�ng d? du?i.');
            return;
        }

        await bot.banChatMember(targetChatId, userId, { until_date: Math.floor(Date.now() / 1000) + 60 });
        await bot.unbanChatMember(targetChatId, userId, { only_if_banned: true });
        await sendReply(msg, `�� du?i ${userId}.`);
    });

    bot.onText(/^\/muteall(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.muteAll = true;
        await bot.setChatPermissions(targetChatId, { can_send_messages: false }); await sendReply(msg, '�� t?t quy?n g?i tin nh?n c?a m?i th�nh vi�n.');
    });

    bot.onText(/^\/unmuteall(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.muteAll = false;
        await bot.setChatPermissions(targetChatId, { can_send_messages: true }); await sendReply(msg, '�� m? l?i quy?n g?i tin nh?n cho m?i th�nh vi�n.');
    });

    bot.onText(/^\/mute(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const parts = (msg.text || '').split(/\s+/).filter(Boolean);
        const duration = parseDuration(parts[2] || parts[1]);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const targetChatId = getAdminTargetChatId(msg);
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Kh�ng t�m th?y ngu?i d�ng d? c?m n�i.');
            return;
        }

        const until = Math.floor(Date.now() / 1000) + duration;
        clearScheduledUnmute(targetChatId, userId);
        await bot.restrictChatMember(targetChatId, userId, { until_date: until, permissions: { can_send_messages: false } });
        scheduleAutomaticUnmute(targetChatId, userId, duration);
        await sendReply(msg, `�� c?m n�i ${userId} trong ${duration} gi�y.`);
    });

    bot.onText(/^\/unmute(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Kh�ng t�m th?y ngu?i d�ng d? g? c?m n�i.');
            return;
        }

        clearScheduledUnmute(targetChatId, userId);
        await bot.restrictChatMember(targetChatId, userId, { permissions: { can_send_messages: true } });
        await sendReply(msg, `�� g? c?m n�i ${userId}.`);
    });

    bot.onText(/^\/warn(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, t(lang, 'help_action_not_available'));
            return;
        }

        const reason = (msg.text || '').split(/\s+/).slice(1).join(' ').trim() || 'No reason provided';
        const warnState = getWarnState(targetChatId);
        const current = warnState.get(userId) || { count: 0, reasons: [] };
        current.count += 1;
        current.reasons.push(reason);
        warnState.set(userId, current);

        const settings = getGroupSettings(targetChatId);
        await sendReply(msg, `Ngu?i d�ng ${userId} d� b? c?nh c�o (${current.count}/${settings.warnLimit}) v� ${reason}.`);
        if (current.count >= settings.warnLimit) {
            await applyWarnAction(targetChatId, userId, settings.warnAction);
            await sendReply(msg, `�� �p d?ng h�nh ph?t ${settings.warnAction} cho ${userId}.`);
        }
    });

    bot.onText(/^\/warnings(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const warnState = getWarnState(targetChatId);
        if (target) {
            const userId = await resolveTargetId(targetChatId, target);
            const entry = userId ? warnState.get(userId) : null;
            if (!entry) {
                await sendReply(msg, 'Kh�ng c� c?nh c�o.');
                return;
            }
            await sendReply(msg, `C?nh c�o cho ${userId}: ${entry.count}\n${entry.reasons.join('\n')}`);
            return;
        }

        if (!warnState.size) {
            await sendReply(msg, 'Chua c� c?nh c�o n�o.');
            return;
        }

        const lines = [];
        for (const [userId, entry] of warnState.entries()) {
            lines.push(`${userId}: ${entry.count}`);
        }
        await sendReply(msg, lines.join('\n'));
    });

    bot.onText(/^\/setwarnlimit(?:@[\w_]+)?\s+(\d+)(?:\s+(\w+))?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const limit = Number(match[1]);
        const action = (match[2] || 'ban').toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.warnLimit = Number.isFinite(limit) && limit > 0 ? limit : settings.warnLimit;
        settings.warnAction = ['ban', 'kick', 'mute'].includes(action) ? action : settings.warnAction;
        await sendReply(msg, `�� d?t gi?i h?n c?nh c�o ${settings.warnLimit} v� h�nh ph?t ${settings.warnAction}.`);
    });

    bot.onText(/^\/setwelcome(?:@[\w_]+)?\s+([\s\S]+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.welcomeMessage = match[1];
        await sendReply(msg, '�� luu l?i ch�o m?i.');
    });

    bot.onText(/^\/welcome(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }

        const userId = msg.from?.id;
        const chatId = msg.chat?.id;
        const chatType = msg.chat?.type;
        const fallbackLang = msg.from?.language_code;

        if (!userId) {
            return;
        }

        if (chatType === 'private') {
            const lang = await resolveNotificationLanguage(userId, fallbackLang);
            try {
                await openAdminHub(userId, { fallbackLang: lang, mode: 'welcome' });
            } catch (error) {
                console.error(`[WelcomeCommand] Failed to open hub in DM for ${userId}: ${error.message}`);
                await sendReply(msg, t(lang, 'welcome_admin_dm_error'));
            }
            return;
        }

        const isGroupChat = ['group', 'supergroup'].includes(chatType || '');
        const replyLang = isGroupChat
            ? await resolveGroupLanguage(chatId, defaultLang)
            : await getLang(msg);

        if (!isGroupChat) {
            await sendReply(msg, t(replyLang, 'welcome_admin_group_only'));
            return;
        }

        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await sendMessageRespectingThread(chatId, msg, t(replyLang, 'welcome_admin_no_permission'), {
                allow_sending_without_reply: true
            });
            return;
        }

        try {
            await db.ensureCheckinGroup(chatId.toString());
        } catch (error) {
            console.error(`[WelcomeCommand] Failed to register group ${chatId}: ${error.message}`);
        }

        try {
            await openAdminHub(userId, { fallbackLang, mode: 'welcome' });
            await sendWelcomeAdminMenu(userId, chatId, { fallbackLang: replyLang });
            await sendMessageRespectingThread(chatId, msg, t(replyLang, 'welcome_admin_dm_notice'), {
                allow_sending_without_reply: true
            });
        } catch (error) {
            console.error(`[WelcomeCommand] Failed to send welcome admin menu for ${userId} in ${chatId}: ${error.message}`);
            await sendMessageRespectingThread(chatId, msg, t(replyLang, 'welcome_admin_dm_error'), {
                allow_sending_without_reply: true
            });
        }
    });

    bot.onText(/^\/del(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const replyId = msg.reply_to_message?.message_id;
        if (!replyId) {
            await sendReply(msg, 'H�y reply v�o tin nh?n c?n x�a.');
            return;
        }
        await bot.deleteMessage(msg.chat.id, replyId).catch(() => { });
        await bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => { });
    });

    bot.onText(/^\/dela(?:@[\w_]+)?(?:\s+(\d+))?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const replyId = msg.reply_to_message?.message_id;
        if (!replyId) {
            await sendReply(msg, 'H�y reply v�o tin nh?n g?c d? x�a h�ng lo?t.');
            return;
        }
        const count = Number(match[1] || '0') || 0;
        const total = count > 0 ? count : 50;
        for (let i = 0; i < total; i += 1) {
            const id = replyId + i;
            await bot.deleteMessage(msg.chat.id, id).catch(() => { });
        }
        await bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => { });
    });

    bot.onText(/^\/lock(?:@[\w_]+)?\s+links/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.enabled = true;
        await sendReply(msg, '�� b?t kh�a link.');
    });

    bot.onText(/^\/setlinkaction(?:@[\w_]+)?\s+(\w+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const action = match[1].toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.action = ['warn', 'mute', 'kick', 'ban', 'delete'].includes(action)
            ? action
            : settings.linkLock.action; await sendReply(msg, `�� d?t h�nh d?ng v?i link: ${settings.linkLock.action}.`);
    });

    bot.onText(/^\/unlock(?:@[\w_]+)?\s+links/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.enabled = false;
        await sendReply(msg, '�� m? kh�a link.');
    });

    bot.onText(/^\/link(?:@[\w_]+)?\s+(.+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.allowlist.add(match[1].trim());
        await sendReply(msg, '�� th�m li�n k?t v�o danh s�ch an to�n.');
    });

    bot.onText(/^\/lock(?:@[\w_]+)?\s+(photos|videos|stickers|documents)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const type = match[1];
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.fileLocks[type] = true;
        await sendReply(msg, `�� kh�a ${type}.`);
    });

    bot.onText(/^\/unlock(?:@[\w_]+)?\s+files/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.fileLocks = { photos: false, videos: false, stickers: false, documents: false };
        await sendReply(msg, '�� m? kh�a t?t c? t?p.');
    });

    bot.onText(/^\/setflood(?:@[\w_]+)?\s+(\d+)\/(\d+)s?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.flood.enabled = true;
        settings.flood.limit = Number(match[1]);
        settings.flood.windowSeconds = Number(match[2]);
        await sendReply(msg, `�� d?t gi?i h?n flood ${settings.flood.limit}/${settings.flood.windowSeconds}s.`);
    });

    bot.onText(/^\/setfloodaction(?:@[\w_]+)?\s+(\w+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const action = match[1].toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.flood.action = ['mute', 'kick', 'ban', 'delete'].includes(action) ? action : settings.flood.action;
        await sendReply(msg, `�� d?t h�nh d?ng ch?ng flood: ${settings.flood.action}.`);
    });

    bot.onText(/^\/flood(?:@[\w_]+)?\s+(on|off)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.flood.enabled = match[1] === 'on';
        await sendReply(msg, settings.flood.enabled ? '�� b?t ch?ng flood.' : '�� t?t ch?ng flood.');
    });

    bot.onText(/^\/rules(?:@[\w_]+)?(?:\s+([\s\S]+))?/, async (msg, match) => {
        const text = match[1];
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        if (text) {
            if (!(await ensureAdminOrOwner(msg))) {
                return;
            }
            settings.rulesText = text.trim();
            await sendReply(msg, '�� luu n?i quy nh�m.');
            return;
        }
        if (settings.rulesText) {
            await sendReply(msg, settings.rulesText, {
                reply_markup: { inline_keyboard: [[{ text: '/rules', callback_data: 'admin_action|rules' }]] }
            });
        } else {
            await sendReply(msg, 'Chua c� n?i quy.');
        }
    });

    bot.onText(/^\/info(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '') || { id: msg.reply_to_message?.from?.id };
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, t(lang, 'help_action_not_available'));
            return;
        }
        const warnState = getWarnState(targetChatId);
        const warnings = warnState.get(userId) || { count: 0 };
        const profile = await resolveUserProfile(targetChatId, userId);
        const infoLines = [`ID: ${userId}`, `Warnings: ${warnings.count}`];
        if (profile?.username) {
            infoLines.splice(1, 0, `Username: @${profile.username}`);
        }
        if (profile?.first_name || profile?.last_name) {
            const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
            if (name) {
                infoLines.splice(1, 0, `Name: ${name}`);
            }
        }
        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Ban', callback_data: `admin_action|ban|${userId}|${targetChatId}` },
                    { text: 'Kick', callback_data: `admin_action|kick|${userId}|${targetChatId}` },
                    { text: 'Mute', callback_data: `admin_action|mute|${userId}|${targetChatId}` }
                ],
                [
                    { text: 'Warn', callback_data: `admin_action|warn|${userId}|${targetChatId}` },
                    { text: 'Unmute', callback_data: `admin_action|unmute|${userId}|${targetChatId}` },
                    { text: 'Del', callback_data: `admin_action|del|${userId}|${targetChatId}` }
                ]
            ]
        };
        await sendReply(msg, infoLines.join('\n'), { reply_markup: keyboard });
    });

    function trimFilterEntities(entities, startOffset = 0) { // eslint-disable-line no-unused-vars
        if (!Array.isArray(entities) || !entities.length) {
            return [];
        }

        const trimmed = [];
        for (const entity of entities) {
            if (!entity || typeof entity.offset !== 'number' || typeof entity.length !== 'number') {
                continue;
            }
            const entityStart = entity.offset;
            const entityEnd = entity.offset + entity.length;
            if (entityEnd <= startOffset) {
                continue;
            }

            const offset = Math.max(0, entityStart - startOffset);
            const length = entityEnd - Math.max(entityStart, startOffset);
            if (length <= 0) {
                continue;
            }

            trimmed.push({ ...entity, offset, length });
        }

        return trimmed;
    }

    bot.onText(/^\/filter(?:@[\w_]+)?\s+(\S+)(?:\s+([\s\S]+))?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const keyword = match[1].toLowerCase();
        const inlinePayload = normalizeFilterResponse(match[2], keyword);
        const targetChatId = getAdminTargetChatId(msg);
        const filters = await ensureFilterState(targetChatId);

        if (inlinePayload) {
            const inlineStart = msg.text?.indexOf(match[2]) ?? -1;
            const entities = inlineStart >= 0
                ? trimFilterEntities(msg.entities || [], inlineStart)
                : [];
            filters.set(keyword, { text: inlinePayload, entities });
            await db.upsertFilter(targetChatId, keyword, inlinePayload, entities);
            await sendReply(msg, t(lang, 'admin_filter_saved', { keyword: escapeHtml(keyword) }));
            return;
        }

        filterSetupStates.set(msg.from.id, { chatId: targetChatId, keyword });
        await sendReply(msg, t(lang, 'admin_filter_prompt', { keyword: escapeHtml(keyword) }));
    });

    function buildFiltersListView(lang, chatId) {
        const filters = getFilterState(chatId);
        if (!filters.size) {
            return {
                text: t(lang, 'admin_filters_empty'),
                reply_markup: { inline_keyboard: [[{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]] }
            };
        }

        const lines = [t(lang, 'admin_filters_title')];
        const inline_keyboard = [];
        const entries = Array.from(filters.entries());

        entries.forEach(([keyword, response]) => {
            const preview = (response?.text || response || '').toString();
            const short = preview.length > 64 ? `${preview.slice(0, 61)}?` : preview;
            lines.push(`? <code>${escapeHtml(keyword)}</code> : ${escapeHtml(short || t(lang, 'admin_filters_no_content'))}`);
        });

        lines.push('', escapeHtml(t(lang, 'admin_filters_remove_hint')));

        for (let i = 0; i < entries.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, entries.length); j += 1) {
                const [keyword] = entries[j]; // eslint-disable-line no-unused-vars
                row.push({ text: `/filters ${keyword}`, callback_data: `filter_remove|${chatId}|${keyword}` });
            }
            inline_keyboard.push(row);
        }

        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]);

        return { text: lines.join('\n'), reply_markup: { inline_keyboard } };
    }

    bot.onText(/^\/filters(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        await ensureFilterState(targetChatId);
        const view = buildFiltersListView(lang, targetChatId);
        await sendReply(msg, view.text, { reply_markup: view.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/filterx(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const keyword = match?.[1];
        if (!keyword) {
            const lang = await getLang(msg);
            await sendReply(msg, t(lang, 'admin_filter_usage'));
            return;
        }
        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        await db.deleteFilter(targetChatId, keyword);
        await sendReply(msg, t(lang, 'admin_filter_removed', { keyword: escapeHtml(keyword) }));
    });

    // COMMAND: /aia - AI Function Calling
    bot.onText(/^\/aia(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleAiaCommand(msg);
    });


    return { handleIdTelegramCommand, buildFiltersListView, handleAiaCommand };
}

module.exports = { registerCommandHandlers };
