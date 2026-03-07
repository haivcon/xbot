function createRandomCallbackHandler({
    bot,
    t,
    escapeHtml,
    updateRandomMenuMessage,
    getRandomInt,
    formatExecutionAudit,
    buildRandomResultKeyboard,
    buildRandomGameText,
    getGomokuUserDifficulty,
    getGomokuDifficultyLabel,
    setGomokuUserDifficulty,
    parseGomokuSizeInput,
    buildGomokuSizeKeyboard,
    createGomokuGame,
    buildRpsKeyboard,
    buildMemoryThemeKeyboard,
    getMemoryThemeLabel,
    buildMemorySizeKeyboard,
    createMemoryGame,
    parseMemorySizeInput,
    buildSudokuSizeKeyboard,
    parseSudokuSizeInput,
    createSudokuGame,
    buildMinesweeperSizeKeyboard,
    createMinesweeperGame,
    handleMinesweeperPick,
    toggleMinesweeperFlagMode,
    replayMinesweeperGame,
    parseTreasureSizeInput,
    buildTreasureSizeKeyboard,
    createTreasureGame,
    handleTreasurePick,
    handleGomokuPick,
    createChessGame,
    handleChessPick,
    joinChessGame,
    setChessMessageContext,
    determineRpsResult,
    rollDice,
    formatRollContext,
    formatDiceDetail,
    generateLongShortOutcome,
    generateCheckinChallenge,
    storeRandomQuiz,
    getRandomQuiz,
    clearRandomQuiz,
    buildQuizKeyboard,
    buildFortuneKeyboard,
    pickRandomFortune,
    enforceDoremonLimit,
    handleMemoryPick,
    handleSudokuPick,
    handleSudokuSetNumber,
    handleSudokuClear
}) {
    if (!bot) {
        throw new Error('bot is required for random callbacks');
    }

    return async function handleRandomCallback(query, callbackLang) {
        if (!query?.data?.startsWith('random|')) {
            return false;
        }
        const queryId = query.id;
        const parts = query.data.split('|');
        const action = parts[1];

        if (action === 'close') {
            if (query.message?.chat?.id && query.message?.message_id) {
                try {
                    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                } catch (error) {
                    // ignore cleanup errors
                }
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'back') {
            try {
                await updateRandomMenuMessage(query.message, callbackLang);
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'number') {
            const value = getRandomInt();
            const resultText = t(callbackLang, 'random_number_result', { value });
            const alertText = [
                `🔢 ${t(callbackLang, 'random_number_title')}`,
                `≈≈ ${t(callbackLang, 'random_number_range', { min: 1, max: 1000 })}`,
                `✨ ${resultText}`
            ].join('\n');
            try {
                await bot.editMessageText([
                    `🔢 <b>${escapeHtml(t(callbackLang, 'random_number_title'))}</b>`,
                    `≈≈ ${escapeHtml(t(callbackLang, 'random_number_range', { min: 1, max: 1000 }))}`,
                    `✨ ${escapeHtml(resultText)}`,
                    '',
                    formatExecutionAudit(query.from, callbackLang)
                ].join('\n'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildRandomResultKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edit errors
            }
            await bot.answerCallbackQuery(queryId, { text: alertText, show_alert: true });
            return true;
        }

        if (action === 'textcase') {
            const hint = t(callbackLang, 'random_textcase_hint');
            await bot.answerCallbackQuery(queryId, { text: hint, show_alert: true });
            return true;
        }

        if (action === 'gomoku') {
            const currentDiff = getGomokuUserDifficulty(query.from?.id);
            const levelLabel = getGomokuDifficultyLabel(callbackLang, currentDiff);
            const prompt = [
                t(callbackLang, 'random_gomoku_size_prompt'),
                '',
                t(callbackLang, 'random_gomoku_level_prompt', { level: levelLabel })
            ].join('\n');
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildGomokuSizeKeyboard(callbackLang, currentDiff)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'gomoku_level') {
            const desired = parts[2];
            const normalized = setGomokuUserDifficulty(query.from?.id, desired);
            const levelLabel = getGomokuDifficultyLabel(callbackLang, normalized);
            const prompt = [
                t(callbackLang, 'random_gomoku_size_prompt'),
                '',
                t(callbackLang, 'random_gomoku_level_prompt', { level: levelLabel })
            ].join('\n');
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildGomokuSizeKeyboard(callbackLang, normalized)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_level_set', { level: levelLabel }) });
            return true;
        }

        if (action === 'gomoku_custom') {
            const hint = t(callbackLang, 'random_gomoku_custom_hint');
            await bot.answerCallbackQuery(queryId, { text: hint, show_alert: true });
            return true;
        }

        if (action === 'gomoku_size') {
            const size = parseGomokuSizeInput(parts.slice(2).join('x'));
            if (!size) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_usage'), show_alert: true });
                return true;
            }
            const preferred = getGomokuUserDifficulty(query.from?.id);
            const game = createGomokuGame(callbackLang, size, query.from, {
                chatType: query.message?.chat?.type,
                difficulty: preferred
            });
            const opponent = game.playerX?.id === query.from?.id?.toString() ? game.playerO : game.playerX;
            const text = buildRandomGameText(game.text, query.from, callbackLang, opponent);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: game.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'chess') {
            const game = createChessGame(callbackLang, query.from, { chatType: query.message?.chat?.type });
            const text = buildRandomGameText(game.text, query.from, callbackLang);
            setChessMessageContext(game.token, query.message?.chat?.id, query.message?.message_id);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: game.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'chess_join') {
            const token = parts[2];
            const result = joinChessGame(token, query.from);
            if (!result || result.error === 'expired') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_expired'), show_alert: true });
                return true;
            }
            if (result.error === 'not_pvp') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_not_player'), show_alert: true });
                return true;
            }
            if (result.error === 'taken') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_taken'), show_alert: true });
                return true;
            }
            if (result.error === 'already_in') {
                await bot.answerCallbackQuery(queryId);
            } else {
                setChessMessageContext(token, query.message?.chat?.id, query.message?.message_id);
                try {
                    await bot.editMessageText(result.text, {
                        chat_id: query.message?.chat?.id,
                        message_id: query.message?.message_id,
                        parse_mode: 'HTML',
                        reply_markup: result.reply_markup
                    });
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_joined'), show_alert: true });
            }
            return true;
        }

        if (action === 'chess_pick') {
            const token = parts[2];
            const index = Number(parts[3]);
            if (!Number.isFinite(index)) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_invalid_move'), show_alert: true });
                return true;
            }
            const result = handleChessPick(token, query.from, index);
            if (!result) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_expired'), show_alert: true });
                return true;
            }
            if (result.error === 'expired') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_expired'), show_alert: true });
                return true;
            }
            if (result.error === 'not_player') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_not_player'), show_alert: true });
                return true;
            }
            if (result.error === 'not_turn') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_not_your_turn'), show_alert: true });
                return true;
            }
            if (result.error === 'need_opponent') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_waiting_opponent'), show_alert: true });
                return true;
            }
            if (result.error === 'select_piece') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_chess_select_piece'), show_alert: true });
                return true;
            }
            setChessMessageContext(token, query.message?.chat?.id, query.message?.message_id);
            try {
                await bot.editMessageText(result.text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            if (result.toast) {
                await bot.answerCallbackQuery(queryId, { text: result.toast, show_alert: true });
            } else {
                await bot.answerCallbackQuery(queryId);
            }
            return true;
        }

        if (action === 'rps') {
            try {
                await updateRandomMenuMessage(query.message, callbackLang, {
                    replyMarkup: buildRpsKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'memory') {
            const prompt = t(callbackLang, 'random_memory_theme_prompt');
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildMemoryThemeKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'memory_theme') {
            const theme = parts[2];
            const label = getMemoryThemeLabel(callbackLang, theme);
            const prompt = t(callbackLang, 'random_memory_size_prompt_with_theme', { theme: label });
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildMemorySizeKeyboard(callbackLang, theme)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'memory_custom') {
            const hint = t(callbackLang, 'random_memory_custom_hint');
            await bot.answerCallbackQuery(queryId, { text: hint, show_alert: true });
            return true;
        }

        if (action === 'memory_size') {
            const rows = Number(parts[2]);
            const cols = Number(parts[3] || parts[2]);
            const theme = parts[4];
            if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_memory_usage'), show_alert: true });
                return true;
            }
            const game = createMemoryGame(callbackLang, cols, rows, theme);
            const text = buildRandomGameText(game.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: game.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'sudoku') {
            const prompt = t(callbackLang, 'random_sudoku_size_prompt');
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildSudokuSizeKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'sudoku_custom') {
            const hint = t(callbackLang, 'random_sudoku_custom_hint');
            await bot.answerCallbackQuery(queryId, { text: hint, show_alert: true });
            return true;
        }

        if (action === 'sudoku_size') {
            const size = parseSudokuSizeInput(parts[2]);
            if (!size) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_usage'), show_alert: true });
                return true;
            }
            const game = createSudokuGame(callbackLang, size);
            const text = buildRandomGameText(game.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: game.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'mines') {
            const prompt = t(callbackLang, 'random_mines_size_prompt');
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildMinesweeperSizeKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'mines_custom') {
            const hint = t(callbackLang, 'random_mines_custom_hint');
            await bot.answerCallbackQuery(queryId, { text: hint, show_alert: true });
            return true;
        }

        if (action === 'mines_size') {
            const rows = Number(parts[2]);
            const cols = Number(parts[3] || parts[2]);
            if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_usage'), show_alert: true });
                return true;
            }
            const game = createMinesweeperGame(callbackLang, cols, rows);
            const text = buildRandomGameText(game.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: game.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'mines_flag') {
            const token = parts[2];
            const result = toggleMinesweeperFlagMode(token, callbackLang);
            if (result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_expired'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'mines_pick') {
            const token = parts[2];
            const cellIndex = parts[3];
            const result = handleMinesweeperPick(token, cellIndex, callbackLang);
            if (result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_invalid_pick'), show_alert: true });
                return true;
            }
            if (result.status === 'flagged_blocked') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_flagged_block'), show_alert: true });
                return true;
            }
            if (result.status === 'finished') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_finished'), show_alert: true });
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            if (result.status === 'lost') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_boom'), show_alert: true });
                return true;
            }
            if (result.status === 'won') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_win', { moves: result.moves }), show_alert: true });
                return true;
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'treasure') {
            const prompt = t(callbackLang, 'random_treasure_size_prompt');
            try {
                await bot.editMessageText(prompt, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildTreasureSizeKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'treasure_custom') {
            const hint = t(callbackLang, 'random_treasure_custom_hint');
            await bot.answerCallbackQuery(queryId, { text: hint, show_alert: true });
            return true;
        }

        if (action === 'treasure_size') {
            const size = parseTreasureSizeInput(parts.slice(2).join('x')) || parseTreasureSizeInput(`${parts[2]}x${parts[3]}`);
            if (!size) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_usage'), show_alert: true });
                return true;
            }
            const game = createTreasureGame(callbackLang, size, query.from, { chatType: query.message?.chat?.type });
            const opponent = game.playerA?.id === query.from?.id?.toString() ? game.playerB : game.playerA;
            const text = buildRandomGameText(game.text, query.from, callbackLang, opponent);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: game.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'treasure_pick') {
            const token = parts[2];
            const cellIndex = parts[3];
            const result = handleTreasurePick(token, cellIndex, query.from, callbackLang);
            if (result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_usage'), show_alert: true });
                return true;
            }
            if (result.status === 'not_player') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_not_player'), show_alert: true });
                return true;
            }
            if (result.status === 'not_turn') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_not_turn'), show_alert: true });
                return true;
            }
            if (result.status === 'duplicate') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_already'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang, result.opponent);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            if (result.status === 'won') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_win_toast'), show_alert: true });
                return true;
            }
            if (result.status === 'skip') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_treasure_skip'), show_alert: true });
                return true;
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'gomoku_pick') {
            const token = parts[2];
            const cellIndex = parts[3];
            const result = handleGomokuPick(token, cellIndex, query.from, callbackLang);
            if (result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_invalid_pick'), show_alert: true });
                return true;
            }
            if (result.status === 'occupied') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_occupied'), show_alert: true });
                return true;
            }
            if (result.status === 'not_turn') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_not_your_turn'), show_alert: true });
                return true;
            }
            if (result.status === 'not_player') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_not_player'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang, result.opponent);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            if (result.status === 'won') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_win_toast'), show_alert: true });
                return true;
            }
            if (result.status === 'draw') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_gomoku_draw'), show_alert: true });
                return true;
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'mines_replay') {
            const token = parts[2];
            const result = replayMinesweeperGame(token, callbackLang);
            if (result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_mines_expired'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'sudoku_pick') {
            const token = parts[2];
            const cellIndex = parts[3];
            const result = handleSudokuPick(token, cellIndex, callbackLang);
            if (!result || result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_invalid_pick'), show_alert: true });
                return true;
            }
            if (result.status === 'locked') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_locked_cell'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            if (result.status === 'completed') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_already_completed'), show_alert: true });
                return true;
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'sudoku_set') {
            const token = parts[2];
            const cellIndex = parts[3];
            const value = parts[4];
            const result = handleSudokuSetNumber(token, cellIndex, value, callbackLang);
            if (!result || result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_invalid_pick'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid_number') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_invalid_number'), show_alert: true });
                return true;
            }
            if (result.status === 'no_selection') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_no_selection'), show_alert: true });
                return true;
            }
            if (result.status === 'locked') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_locked_cell'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            if (result.status === 'completed') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_completed_toast'), show_alert: true });
                return true;
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'sudoku_clear') {
            const token = parts[2];
            const cellIndex = parts[3];
            const result = handleSudokuClear(token, cellIndex, callbackLang);
            if (!result || result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_invalid_pick'), show_alert: true });
                return true;
            }
            if (result.status === 'no_selection') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_no_selection'), show_alert: true });
                return true;
            }
            if (result.status === 'locked') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_sudoku_locked_cell'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'memory_pick') {
            const token = parts[2];
            const tileIndex = parts[3];
            const result = handleMemoryPick(token, tileIndex, callbackLang);
            if (!result || result.status === 'expired') {
                try {
                    await updateRandomMenuMessage(query.message, callbackLang);
                } catch (error) {
                    // ignore edits
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_memory_expired'), show_alert: true });
                return true;
            }
            if (result.status === 'invalid') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_memory_invalid_pick'), show_alert: true });
                return true;
            }
            if (result.status === 'already_matched') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_memory_already_matched'), show_alert: true });
                return true;
            }
            if (result.status === 'duplicate') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_memory_duplicate_pick'), show_alert: true });
                return true;
            }
            const text = buildRandomGameText(result.text, query.from, callbackLang);
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: result.reply_markup
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'rps_choice') {
            const choice = parts[2];
            const result = determineRpsResult(choice);
            if (!result) {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'random_rps_usage'), show_alert: true });
                return true;
            }
            const resultText = t(callbackLang, `random_rps_${result.outcome}`, {
                user: `${result.userChoice.icon} ${t(callbackLang, `random_rps_${result.userChoice.key}`)}`,
                bot: `${result.botChoice.icon} ${t(callbackLang, `random_rps_${result.botChoice.key}`)}`
            });
            try {
                await bot.editMessageText([
                    `⚔️ <b>${escapeHtml(t(callbackLang, 'random_rps_title'))}</b>`,
                    '',
                    `👤 ${escapeHtml(t(callbackLang, 'random_rps_you', { move: `${result.userChoice.icon} ${t(callbackLang, `random_rps_${result.userChoice.key}`)}` }))}`,
                    `🤖 ${escapeHtml(t(callbackLang, 'random_rps_bot', { move: `${result.botChoice.icon} ${t(callbackLang, `random_rps_${result.botChoice.key}`)}` }))}`,
                    `✨ ${escapeHtml(t(callbackLang, 'random_rps_reveal'))}`,
                    '',
                    `🏆 <b>${escapeHtml(resultText)}</b>`,
                    '',
                    formatExecutionAudit(query.from, callbackLang)
                ].join('\n'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildRandomResultKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'dice') {
            const result = rollDice('2d6');
            const contextLine = formatRollContext('2d6', { count: 2, faces: 6 }, callbackLang);
            const detail = formatDiceDetail(result);
            const resultText = t(callbackLang, 'random_roll_result', { detail });
            try {
                await bot.editMessageText([
                    `🎲 <b>${escapeHtml(t(callbackLang, 'random_roll_title'))}</b>`,
                    '',
                    `ℹ️ ${escapeHtml(contextLine)}`,
                    `🎯 ${escapeHtml(t(callbackLang, 'random_roll_notation', { notation: '2d6' }))}`,
                    '',
                    `${escapeHtml(t(callbackLang, 'random_roll_faces_label'))}`,
                    `<pre>${escapeHtml(detail)}</pre>`,
                    '',
                    formatExecutionAudit(query.from, callbackLang)
                ].join('\n'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildRandomResultKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'longshort') {
            const outcome = generateLongShortOutcome(callbackLang);
            try {
                await bot.editMessageText([
                    `📈 <b>${escapeHtml(t(callbackLang, 'random_longshort_title'))}</b>`,
                    '',
                    `${escapeHtml(outcome.line)}`,
                    '',
                    formatExecutionAudit(query.from, callbackLang)
                ].join('\n'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildRandomResultKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'truth') {
            const challenge = generateCheckinChallenge(callbackLang);
            const token = storeRandomQuiz(challenge, callbackLang);
            const text = [
                `🧠 <b>${escapeHtml(t(callbackLang, 'random_truth_title'))}</b>`,
                '',
                `❓ ${escapeHtml(challenge.question)}`,
                `👇 ${escapeHtml(t(callbackLang, 'random_truth_hint'))}`,
                '',
                formatExecutionAudit(query.from, callbackLang)
            ].join('\n');
            try {
                await bot.editMessageText(text, {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    reply_markup: buildQuizKeyboard(token, challenge, callbackLang),
                    parse_mode: 'HTML'
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'truth_answer' || action === 'quiz_answer') {
            const token = parts[2];
            const answerIndex = Number(parts[3]);
            const stored = getRandomQuiz(token);
            const challenge = stored?.challenge;
            const answer = Number.isInteger(answerIndex)
                ? challenge?.options?.find((opt) => opt.index === answerIndex)
                : null;
            const isCorrect = Boolean(answer?.isCorrect);
            const resultText = isCorrect
                ? t(callbackLang, 'random_truth_correct')
                : t(callbackLang, 'random_truth_incorrect');
            try {
                await bot.editMessageText([
                    `🧠 <b>${escapeHtml(t(callbackLang, 'random_truth_title'))}</b>`,
                    '',
                    challenge?.question ? `? ${escapeHtml(challenge.question)}` : null,
                    answer ? `✅ ${escapeHtml(t(callbackLang, 'random_truth_choice', { choice: answer.text }))}` : null,
                    '',
                    `💡 <b>${escapeHtml(resultText)}</b>`,
                    '',
                    formatExecutionAudit(query.from, callbackLang)
                ].filter(Boolean).join('\n'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildRandomResultKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            clearRandomQuiz(token);
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'fortune') {
            try {
                await bot.editMessageText(t(callbackLang, 'random_fortune_choose'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    reply_markup: buildFortuneKeyboard(callbackLang)
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }

        if (action === 'fortune_topic') {
            const topicIndex = Number(parts[2]);
            const syntheticMsg = { from: query.from, chat: query.message?.chat };
            if (await enforceDoremonLimit(syntheticMsg, callbackLang)) {
                await bot.answerCallbackQuery(queryId);
                return true;
            }
            const fortune = await pickRandomFortune(topicIndex, callbackLang);
            const resultText = fortune?.fortuneText || t(callbackLang, 'random_fortune_invalid');
            try {
                await bot.editMessageText([
                    `🔮 <b>${escapeHtml(t(callbackLang, 'random_fortune_title'))}</b>`,
                    '',
                    `${fortune ? escapeHtml(t(callbackLang, 'random_fortune_drawn_topic', { topic: fortune.topicLabel })) : ''}`,
                    '',
                    fortune ? `<b>✨ ${escapeHtml(resultText)}</b>` : escapeHtml(t(callbackLang, 'random_fortune_invalid')),
                    '',
                    formatExecutionAudit(query.from, callbackLang)
                ].join('\n'), {
                    chat_id: query.message?.chat?.id,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: buildRandomResultKeyboard(
                        callbackLang,
                        buildFortuneKeyboard(callbackLang, { includeBack: false }).inline_keyboard
                    )
                });
            } catch (error) {
                // ignore edits
            }
            await bot.answerCallbackQuery(queryId);
            return true;
        }
        return true;
    };
}

module.exports = createRandomCallbackHandler;
