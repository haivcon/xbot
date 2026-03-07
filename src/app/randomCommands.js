function registerRandomCommands(deps = {}) {
    const {
        bot,
        enforceBanForMessage,
        enforceDoremonLimit,
        getLang,
        t,
        escapeHtml,
        formatExecutionAudit,
        buildRandomMenuText,
        buildRandomMenuKeyboard,
        randomizeTextCase,
        generateLongShortOutcome,
        getRandomInt,
        parseMemorySizeInput,
        createMemoryGame,
        createMinesweeperGame,
        parseTreasureSizeInput,
        createTreasureGame,
        getGomokuUserDifficulty,
        parseGomokuSizeInput,
        createGomokuGame,
        createChessGame,
        setChessMessageContext,
        parseSudokuSizeInput,
        createSudokuGame,
        determineRpsResult,
        buildRpsKeyboard,
        parseDiceNotation,
        rollDice,
        formatRollContext,
        formatDiceDetail,
        generateCheckinChallenge,
        storeRandomQuiz,
        buildQuizKeyboard,
        pickRandomFortune,
        buildRandomResultKeyboard,
        buildFortuneKeyboard,
        randomFortunes,
        sendReply,
        buildRandomGameText
    } = deps;

    if (!bot) throw new Error('bot is required for random commands');

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
            const text = [`📈 <b>${escapeHtml(t(lang, 'random_longshort_title'))}</b>`, '', `${escapeHtml(outcome.line)}`, '', formatExecutionAudit(msg.from, lang)].join('\n');
            await sendReply(msg, text, { parse_mode: 'HTML' });
            return;
        }

        if (args.length >= 2 && !allNumeric) {
            const choiceIndex = getRandomInt(1, args.length) - 1;
            const formattedList = args.map((option, idx) => `${idx + 1}. ${escapeHtml(option)}`).join('\n');
            const text = [
                `抽選 <b>${escapeHtml(t(lang, 'random_choice_title'))}</b>`,
                `🔢 ${escapeHtml(t(lang, 'random_choice_summary', { count: args.length }))}`,
                '',
                `📝 ${escapeHtml(t(lang, 'random_choice_options'))}`,
                `<code>${formattedList}</code>`,
                '',
                `✨ ${escapeHtml(t(lang, 'random_choice_result_label'))} <b>${escapeHtml(args[choiceIndex])}</b>`
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
            `🔢 <b>${escapeHtml(t(lang, 'random_number_title'))}</b>`,
            `≈≈ ${escapeHtml(t(lang, 'random_number_range', { min: min || 1, max: max || 1000 }))}`,
            `✨ ${escapeHtml(t(lang, 'random_number_result', { value }))}`
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
        const text = buildRandomGameText(game.text, msg.from, lang);
        await sendReply(msg, text, { reply_markup: game.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/chess(?:@[\w_]+)?$/i, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const game = createChessGame(lang, msg.from, { chatType: msg.chat?.type });
        const text = buildRandomGameText(game.text, msg.from, lang);
        const sent = await sendReply(msg, text, { reply_markup: game.reply_markup, parse_mode: 'HTML' });
        if (sent?.chat?.id && sent?.message_id) {
            setChessMessageContext(game.token, sent.chat.id, sent.message_id);
        }
    });

    bot.onText(/^\/sudoku(?:@[\w_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        const raw = (match?.[1] || '').trim();
        const parsedSize = parseSudokuSizeInput(raw);
        if (raw && !parsedSize) {
            await sendReply(msg, t(lang, 'random_sudoku_usage'));
            return;
        }
        const game = createSudokuGame(lang, parsedSize || undefined);
        const text = buildRandomGameText(game.text, msg.from, lang);
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
            await sendReply(msg, t(lang, 'random_rps_usage'), { reply_markup: buildRpsKeyboard(lang) });
            return;
        }
        const outcomeText = t(lang, `random_rps_${result.outcome}`, {
            user: `${result.userChoice.icon} ${t(lang, `random_rps_${result.userChoice.key}`)}`,
            bot: `${result.botChoice.icon} ${t(lang, `random_rps_${result.botChoice.key}`)}`
        });
        const text = [
            `⚔️ <b>${escapeHtml(t(lang, 'random_rps_title'))}</b>`,
            '',
            `👤 ${escapeHtml(t(lang, 'random_rps_you', { move: `${result.userChoice.icon} ${t(lang, `random_rps_${result.userChoice.key}`)}` }))}`,
            `🤖 ${escapeHtml(t(lang, 'random_rps_bot', { move: `${result.botChoice.icon} ${t(lang, `random_rps_${result.botChoice.key}`)}` }))}`,
            `✨ ${escapeHtml(t(lang, 'random_rps_reveal'))}`,
            '',
            `🏆 <b>${escapeHtml(outcomeText)}</b>`,
            '',
            `💡 ${escapeHtml(t(lang, 'random_rps_hint'))}`,
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
            `🎲 <b>${escapeHtml(t(lang, 'random_roll_title'))}</b>`,
            '',
            `ℹ️ ${escapeHtml(contextLine)}`,
            `🎯 ${escapeHtml(t(lang, 'random_roll_notation', { notation }))}`,
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
            `🧠 <b>${escapeHtml(t(lang, 'random_truth_title'))}</b>`,
            '',
            `❓ ${escapeHtml(challenge.question)}`,
            `👇 ${escapeHtml(t(lang, 'random_truth_hint'))}`,
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
            `🔮 <b>${escapeHtml(t(lang, 'random_fortune_title'))}</b>`,
            '',
            `${escapeHtml(t(lang, 'random_fortune_drawn_topic', { topic: result.topicLabel }))}`,
            '',
            `<b>✨ ${escapeHtml(result.fortuneText)}</b>`,
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
}

module.exports = registerRandomCommands;
