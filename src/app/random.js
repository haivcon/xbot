function createRandomFeature({
    t,
    defaultLang,
    escapeHtml,
    randomFortunes,
    resolveFortuneLang,
    formatFortuneEntry,
    createShortToken,
    randomQuizSessions,
    bot
}) {
    const RANDOM_QUIZ_TTL_MS = 10 * 60 * 1000;
    const MEMORY_TTL_MS = 15 * 60 * 1000;

    const RANDOM_MENU_ACTIONS = {
        number: 'random|number',
        rps: 'random|rps',
        mines: 'random|mines',
        memory: 'random|memory',
        gomoku: 'random|gomoku',
        chess: 'random|chess',
        sudoku: 'random|sudoku',
        dice: 'random|dice',
        longshort: 'random|longshort',
        truth: 'random|truth',
        fortune: 'random|fortune',
        treasure: 'random|treasure'
    };

    const RANDOM_RPS_CHOICES = [
        { key: 'rock', icon: '✊', beats: 'scissors' },
        { key: 'paper', icon: '✋', beats: 'rock' },
        { key: 'scissors', icon: '✌️', beats: 'paper' }
    ];

    const MEMORY_THEMES = {
        food: [
            '🍎', '🍇', '🍋', '🍉', '🍓', '🍒', '🥝', '🍍', '🍑', '🥥',
            '🥑', '🍊', '🍌', '🥕', '🌽', '🍆', '🍄', '🥨', '🥐', '🥯',
            '🍔', '🍟', '🌭', '🍕', '🥪', '🌮', '🥙', '🍣', '🍤', '🍪',
            '🧀', '🥞', '🍿', '🍩', '🍭', '🍫', '🧁', '🍰', '🎂', '🍯',
            '🍵', '☕', '🥛', '🍺', '🍷', '🍸', '🥃', '🍹', '🧃', '🍾'
        ],
        sports: [
            '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🥏', '🏓', '🏸',
            '🎲', '♟️', '🧩', '🎯', '🎮', '🏀', '🏸', '🏓', '🎳', '🤿',
            '⛳', '🎱', '🥍', '🥊', '🥋', '🏹', '🤺', '⛸️', '🤾', '🏋️'
        ],
        nature: [
            '🌞', '🌜', '⭐', '⚡', '🔥', '🌈', '❄️', '🌊', '🌋', '🍀',
            '🌹', '🌻', '🌵', '🌴', '🌳', '🍁', '🍂', '🌾', '🪴', '🌼',
            '🌕', '🌑', '🌙', '☄️', '🌠', '🌧️', '🌤️', '🌪️', '🌫️', '🌎',
            '🌌', '🌗', '🌔', '🌒', '🌖', '🌘', '🌍', '🌏', '🪐', '🏜️',
            '🏔️', '🏕️', '🏖️', '🏝️', '🏞️', '🏟️', '🏛️', '🛤️', '🛣️'
        ],
        animals: [
            '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
            '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦄',
            '🦉', '🦅', '🦇', '🦋', '🐙', '🦑', '🦀', '🐠', '🐳', '🐬',
            '🦈', '🦭', '🐢', '🦎', '🐍', '🦕', '🦖', '🦒', '🦓', '🐫',
            '🦬', '🐂', '🐏', '🐑', '🐐', '🦌', '🦜', '🦚', '🦩', '🦦',
            '🦥', '🐿️', '🦔', '🐉', '🦂', '🐡', '🦧', '🦝', '🪼', '🪿'
        ],
        travel: [
            '🚗', '🚕', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚜', '✈️',
            '🚀', '🛰️', '🛸', '⛵', '🚢', '🛶', '⚓', '🧭', '🗺️', '🎡',
            '🎢', '🎠', '🛝', '🏰', '🏯', '🗼', '🗽', '⛩️', '🕌', '🕍',
            '🛩️', '🛥️', '🚠', '🚡', '🚟', '🚞', '🚂', '🚆', '🚈', '🚊',
            '🚇', '🚉', '🛫', '🛬', '🚧', '🚦', '🛑', '🚥'
        ],
        symbols: [
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖',
            '💎', '🔔', '🔑', '🧲', '💡', '🔮', '🪄', '🧸', '🎁', '📚',
            '🎈', '🎀', '📷', '🎧', '📱', '⌚', '💾', '🧬', '🧪', '⚙️',
            '🪙', '📡', '📀', '💳', '🪫', '🪩', '📌', '📍', '🔗', '🧭'
        ]
    };
    const MEMORY_THEME_ORDER = [
        { key: 'mixed', labelKey: 'random_memory_theme_mixed', icon: '🧠' },
        { key: 'food', labelKey: 'random_memory_theme_food', icon: '🍎' },
        { key: 'sports', labelKey: 'random_memory_theme_sports', icon: '🏀' },
        { key: 'nature', labelKey: 'random_memory_theme_nature', icon: '🌈' },
        { key: 'animals', labelKey: 'random_memory_theme_animals', icon: '🐶' },
        { key: 'travel', labelKey: 'random_memory_theme_travel', icon: '✈️' },
        { key: 'symbols', labelKey: 'random_memory_theme_symbols', icon: '💎' }
    ];
    const MEMORY_THEME_DEFAULT = 'mixed';
    const MEMORY_ICONS = Object.values(MEMORY_THEMES).flat();
    const MEMORY_MAX_WIDTH = 50;
    const MEMORY_MAX_HEIGHT = 50;
    const MEMORY_MAX_INLINE_COLS = 8;
    const MEMORY_DEFAULT_WIDTH = 4;
    const MEMORY_DEFAULT_HEIGHT = 4;
    const MEMORY_PRESET_SIZES = [
        { rows: 4, cols: 4 },
        { rows: 5, cols: 5 },
        { rows: 6, cols: 6 },
        { rows: 7, cols: 7 },
        { rows: 8, cols: 8 },
        { rows: 9, cols: 9 },
        { rows: 10, cols: 12 },
        { rows: 12, cols: 12 },
        { rows: 6, cols: 10 },
        { rows: 8, cols: 12 },
        { rows: 12, cols: 15 },
        { rows: 15, cols: 15 },
        { rows: 20, cols: 20 },
        { rows: 25, cols: 25 }
    ];
    const memorySessions = new Map();
    const MEMORY_MAX_BUTTONS = 98; // Keep inline keyboard under Telegram limits

    const MINESWEEPER_DEFAULT_ROWS = 5;
    const MINESWEEPER_DEFAULT_COLS = 5;
    const MINESWEEPER_PRESET_SIZES = [
        { rows: 5, cols: 5 },
        { rows: 6, cols: 6 },
        { rows: 7, cols: 7 },
        { rows: 8, cols: 8 },
        { rows: 9, cols: 9 }
    ];
    const MINESWEEPER_MAX_ROWS = 12;
    const MINESWEEPER_MAX_COLS = 9;
    const MINESWEEPER_MIN_SIZE = 3;
    const MINESWEEPER_MAX_BUTTONS = 96; // Leave space for control buttons
    const MINESWEEPER_TTL_MS = MEMORY_TTL_MS;
    const minesweeperSessions = new Map();
    const TREASURE_DEFAULT_ROWS = 6;
    const TREASURE_DEFAULT_COLS = 6;
    const TREASURE_PRESET_SIZES = [
        { rows: 5, cols: 5 },
        { rows: 6, cols: 6 },
        { rows: 7, cols: 7 },
        { rows: 8, cols: 6 },
        { rows: 8, cols: 8 }
    ];
    const TREASURE_MIN_ROWS = 4;
    const TREASURE_MIN_COLS = 4;
    const TREASURE_MAX_ROWS = 8;
    const TREASURE_MAX_COLS = 8;
    const TREASURE_MAX_CELLS = 64;
    const TREASURE_TTL_MS = 10 * 60 * 1000;
    const treasureSessions = new Map();
    const SUDOKU_ALLOWED_SIZES = [4, 6, 9];
    const SUDOKU_DEFAULT_SIZE = 4;
    const SUDOKU_TTL_MS = 8 * 60 * 1000;
    const sudokuSessions = new Map();
    const GOMOKU_DIFFICULTIES = [
        { key: 'easy', baseDepth: 0, alphaBeta: false, labelKey: 'random_gomoku_level_easy' },
        { key: 'medium', baseDepth: 2, alphaBeta: true, labelKey: 'random_gomoku_level_medium' },
        { key: 'hard', baseDepth: 3, alphaBeta: true, labelKey: 'random_gomoku_level_hard' }
    ];
    const GOMOKU_DEFAULT_DIFFICULTY = 'easy';
    const gomokuPreferredDifficulty = new Map();
    const CHESS_TTL_MS = 20 * 60 * 1000;
    const CHESS_MAX_MOVES = 200;
    const CHESS_TURN_MS = 30 * 1000;
    const chessSessions = new Map();
    const CHESS_PIECE_ICONS = {
        wP: '♙',
        wR: '♖',
        wN: '♘',
        wB: '♗',
        wQ: '♕',
        wK: '♔',
        bP: '♟',
        bR: '♜',
        bN: '♞',
        bB: '♝',
        bQ: '♛',
        bK: '♚',
        empty: ' '
    };
    const CHESS_PIECE_SYMBOLS = {
        wP: '♙',
        wR: '♖',
        wN: '♘',
        wB: '♗',
        wQ: '♕',
        wK: '♔',
        bP: '♟',
        bR: '♜',
        bN: '♞',
        bB: '♝',
        bQ: '♛',
        bK: '♚'
    };
    const CHESS_COLOR_ICONS = {
        w: '⚪',
        b: '⚫'
    };
    const CHESS_PIECE_LABELS = {
        en: { P: 'Pawn', R: 'Rook', N: 'Knight', B: 'Bishop', Q: 'Queen', K: 'King' },
        vi: { P: 'Tốt', R: 'Xe', N: 'Mã', B: 'Tượng', Q: 'Hậu', K: 'Vua' },
        zh: { P: '兵', R: '车', N: '马', B: '象', Q: '后', K: '王' },
        ko: { P: '폰', R: '룩', N: '나이트', B: '비숍', Q: '퀸', K: '킹' },
        ru: { P: 'Пешка', R: 'Ладья', N: 'Конь', B: 'Слон', Q: 'Ферзь', K: 'Король' },
        id: { P: 'Pion', R: 'Benteng', N: 'Kuda', B: 'Gajah', Q: 'Ratu', K: 'Raja' }
    };

    function randomizeTextCase(text) {
        return Array.from(text)
            .map((char) => (Math.random() > 0.5 ? char.toUpperCase() : char.toLowerCase()))
            .join('');
    }

    function storeRandomQuiz(challenge, lang) {
        const token = createShortToken('tdq');
        randomQuizSessions.set(token, { challenge, lang, createdAt: Date.now() });
        return token;
    }

    function getRandomQuiz(token) {
        const entry = randomQuizSessions.get(token);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.createdAt > RANDOM_QUIZ_TTL_MS) {
            randomQuizSessions.delete(token);
            return null;
        }
        return entry;
    }

    function clearRandomQuiz(token) {
        randomQuizSessions.delete(token);
    }

    function generateLongShortOutcome(lang) {
        const isLong = Math.random() > 0.5;
        const multiplier = getRandomInt(1, 100);
        const directionKey = isLong ? 'random_longshort_long' : 'random_longshort_short';
        const directionIcon = isLong ? '🚀' : '📉';
        const direction = `${directionIcon} ${t(lang, directionKey)}`;
        const magnitude = `${multiplier}x`;
        const line = t(lang, 'random_longshort_result', { direction, multiplier: magnitude });

        return { direction, multiplier, line };
    }

    function getRandomInt(min = 1, max = 1000) {
        const low = Number.isFinite(min) ? Math.floor(min) : 1;
        const high = Number.isFinite(max) ? Math.floor(max) : 1000;
        const normalizedMin = Math.min(low, high);
        const normalizedMax = Math.max(low, high);
        return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
    }

    function parseDiceNotation(notation) {
        const match = /^([1-9]\d*)d([1-9]\d*)$/i.exec((notation || '').trim());
        if (!match) {
            return null;
        }
        const count = Math.min(10, Math.max(1, Number.parseInt(match[1], 10)));
        const faces = Math.min(100, Math.max(2, Number.parseInt(match[2], 10)));
        return { count, faces };
    }

    function rollDice(notation = '1d6') {
        const parsed = parseDiceNotation(notation) || { count: 1, faces: 6 };
        const rolls = [];
        for (let i = 0; i < parsed.count; i += 1) {
            rolls.push(getRandomInt(1, parsed.faces));
        }
        const total = rolls.reduce((sum, value) => sum + value, 0);
        return { ...parsed, rolls, total };
    }

    const DICE_UNICODE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

    function renderDieFaceArt(value) {
        const templates = {
            1: ['+-------+', '|       |', '|   o   |', '|       |', '+-------+'],
            2: ['+-------+', '| o     |', '|       |', '|     o |', '+-------+'],
            3: ['+-------+', '| o     |', '|   o   |', '|     o |', '+-------+'],
            4: ['+-------+', '| o   o |', '|       |', '| o   o |', '+-------+'],
            5: ['+-------+', '| o   o |', '|   o   |', '| o   o |', '+-------+'],
            6: ['+-------+', '| o   o |', '| o   o |', '| o   o |', '+-------+']
        };

        return templates[value] || null;
    }

    function buildDiceArt(rolls) {
        const diceRows = rolls
            .map((value) => renderDieFaceArt(value))
            .filter((row) => Array.isArray(row));

        if (!diceRows.length) {
            return null;
        }

        const height = diceRows[0].length;
        const lines = [];
        const perRow = 3;

        for (let start = 0; start < diceRows.length; start += perRow) {
            const segment = diceRows.slice(start, start + perRow);
            for (let i = 0; i < height; i += 1) {
                lines.push(segment.map((rows) => rows[i]).join('  '));
            }
            if (start + perRow < diceRows.length) {
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    function formatDiceDetail(result) {
        const art = result.faces <= 6 ? buildDiceArt(result.rolls) : null;
        if (art) {
            return [art, `🎲 = ${result.total}  (${result.count}d${result.faces})`].join('\n');
        }

        const icons = result.rolls.map((value) => {
            if (result.faces <= 6 && value >= 1 && value <= 6) {
                return DICE_UNICODE[value - 1];
            }
            return `[${value}]`;
        });
        const body = icons.join('  ');
        return `${body}\n🎲 = ${result.total}  (${result.count}d${result.faces})`;
    }

    function formatRollContext(notation, parsed, lang) {
        return t(lang, 'random_roll_context', { notation, count: parsed.count, faces: parsed.faces });
    }

    function stripHtmlTags(text) {
        return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function buildRandomResultKeyboard(lang, extraRows = []) {
        const inline_keyboard = [];
        if (Array.isArray(extraRows) && extraRows.length) {
            inline_keyboard.push(...extraRows);
        }
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'random|close' }]);
        return { inline_keyboard };
    }

    function formatExecutionAudit(user, lang = defaultLang) {
        const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'N/A';
        const username = user?.username ? `@${escapeHtml(user.username)}` : 'N/A';
        const userId = user?.id ? escapeHtml(user.id.toString()) : 'N/A';
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');

        return [
            `👤 <b>${escapeHtml(t(lang, 'audit_executor_title'))}</b>`,
            `🪪 ${escapeHtml(t(lang, 'audit_name_label'))}: ${escapeHtml(fullName)}`,
            `🔗 ${escapeHtml(t(lang, 'audit_username_label'))}: ${username}`,
            `🆔 ${escapeHtml(t(lang, 'audit_id_label'))}: <code>${userId}</code>`,
            `🕒 ${escapeHtml(t(lang, 'audit_timestamp_label'))}: ${escapeHtml(timestamp)}`
        ].join('\n');
    }

    async function pickRandomFortune(topicIndex, lang = defaultLang) {
        const topic = randomFortunes.find((item) => item.index === topicIndex);
        if (!topic || topic.entries.length === 0) {
            return null;
        }
        const entry = topic.entries[getRandomInt(1, topic.entries.length) - 1];
        const langCode = resolveFortuneLang(lang);
        const topicLabel = `${topic.icon} ${topic.names[langCode] || topic.names.en}`;
        const formatted = await formatFortuneEntry(topic, entry, lang);
        return {
            formatted,
            topicLabel,
            fortuneText: stripHtmlTags(formatted.replace(topicLabel, '').trim()).replace(/^\s*/, '')
        };
    }

    const RANDOM_MENU_COMMANDS = [
        { command: '/rand', icon: '🎲', titleKey: 'random_info_rand_title', usageKey: 'random_info_rand_usage' },
        { command: '/rand long/short', icon: '📈', titleKey: 'random_info_longshort_title', usageKey: 'random_info_longshort_usage' },
        { command: '/rps', icon: '✊', titleKey: 'random_info_rps_title', usageKey: 'random_info_rps_usage' },
        { command: '/roll', icon: '🎯', titleKey: 'random_info_roll_title', usageKey: 'random_info_roll_usage' },
        { command: '/td', icon: '❓', titleKey: 'random_info_td_title', usageKey: 'random_info_td_usage' },
        { command: '/doremon', icon: '🍀', titleKey: 'random_info_doremon_title', usageKey: 'random_info_doremon_usage' },
        { command: '/mines', icon: '💣', titleKey: 'random_info_mines_title', usageKey: 'random_info_mines_usage' },
        { command: '/memory', icon: '🧠', titleKey: 'random_info_memory_title', usageKey: 'random_info_memory_usage' },
        { command: '/sudoku', icon: '🔢', titleKey: 'random_info_sudoku_title', usageKey: 'random_info_sudoku_usage' },
        { command: '/gomoku', icon: '⭕', titleKey: 'random_info_gomoku_title', usageKey: 'random_info_gomoku_usage' },
        { command: '/chess', icon: '♟️', titleKey: 'random_info_chess_title', usageKey: 'random_info_chess_usage' },
        { command: '/treasure', icon: '🧭', titleKey: 'random_info_treasure_title', usageKey: 'random_info_treasure_usage' }
    ];

    function buildRandomMenuKeyboard(lang) {
        const inline_keyboard = [
            [
                { text: `🔢 ${t(lang, 'random_action_number')}`, callback_data: RANDOM_MENU_ACTIONS.number },
                { text: `✊ ${t(lang, 'random_action_rps')}`, callback_data: RANDOM_MENU_ACTIONS.rps }
            ],
            [
                { text: `🎲 ${t(lang, 'random_action_dice')}`, callback_data: RANDOM_MENU_ACTIONS.dice },
                { text: `📈 ${t(lang, 'random_action_longshort')}`, callback_data: RANDOM_MENU_ACTIONS.longshort }
            ],
            [
                { text: `❓ ${t(lang, 'random_action_truth')}`, callback_data: RANDOM_MENU_ACTIONS.truth },
                { text: `🔮 ${t(lang, 'random_action_fortune')}`, callback_data: RANDOM_MENU_ACTIONS.fortune }
            ],
            [
                { text: `💣 ${t(lang, 'random_action_mines')}`, callback_data: RANDOM_MENU_ACTIONS.mines },
                { text: `🧠 ${t(lang, 'random_action_memory')}`, callback_data: RANDOM_MENU_ACTIONS.memory }
            ],
            [
                { text: `🔢 ${t(lang, 'random_action_sudoku')}`, callback_data: RANDOM_MENU_ACTIONS.sudoku },
                { text: `⭕ ${t(lang, 'random_action_gomoku')}`, callback_data: RANDOM_MENU_ACTIONS.gomoku }
            ],
            [
                { text: `♟️ ${t(lang, 'random_action_chess')}`, callback_data: RANDOM_MENU_ACTIONS.chess },
                { text: `🧭 ${t(lang, 'random_action_treasure')}`, callback_data: RANDOM_MENU_ACTIONS.treasure }
            ],
            [{ text: t(lang, 'help_button_close'), callback_data: 'random|close' }]
        ];
        return { inline_keyboard };
    }

    function buildRandomMenuTable(lang) {
        const rows = RANDOM_MENU_COMMANDS.map((entry) => ({
            cmd: `${entry.icon} ${entry.command}`,
            desc: t(lang, entry.usageKey)
        }));
        const cmdWidth = Math.max(
            t(lang, 'random_menu_table_cmd').length,
            ...rows.map((r) => chessDisplayWidth(r.cmd))
        );
        const descWidth = Math.max(
            t(lang, 'random_menu_table_desc').length,
            ...rows.map((r) => chessDisplayWidth(r.desc))
        );
        const pad = (text, width) => {
            const raw = String(text || '');
            const diff = width - chessDisplayWidth(raw);
            return diff > 0 ? raw + ' '.repeat(diff) : raw;
        };
        const top = `╔${'═'.repeat(cmdWidth + 2)}╦${'═'.repeat(descWidth + 2)}╗`;
        const header = `║ ${pad(t(lang, 'random_menu_table_cmd'), cmdWidth)} ║ ${pad(t(lang, 'random_menu_table_desc'), descWidth)} ║`;
        const mid = `╠${'═'.repeat(cmdWidth + 2)}╬${'═'.repeat(descWidth + 2)}╣`;
        const rowSep = `╟${'─'.repeat(cmdWidth + 2)}╫${'─'.repeat(descWidth + 2)}╢`;
        const bottom = `╚${'═'.repeat(cmdWidth + 2)}╩${'═'.repeat(descWidth + 2)}╝`;
        const body = rows.flatMap((r, idx) => {
            const line = `║ ${pad(r.cmd, cmdWidth)} ║ ${pad(r.desc, descWidth)} ║`;
            if (idx === rows.length - 1) return [line];
            return [line, rowSep];
        });
        return [top, header, mid, ...body, bottom].join('\n');
    }

    function buildRandomMenuText(lang, resultText = null) {
        const lines = [
            `🎲 <b>${escapeHtml(t(lang, 'random_menu_title'))}</b>`,
            `<i>${escapeHtml(t(lang, 'random_menu_description'))}</i>`
        ];

        if (resultText) {
            lines.push('', `💡 ${escapeHtml(t(lang, 'random_menu_result_label'))}`, `<code>${escapeHtml(resultText)}</code>`);
        }

        lines.push('', `📋 <b>${escapeHtml(t(lang, 'random_menu_commands_header'))}</b>`);
        lines.push(`<pre>${escapeHtml(buildRandomMenuTable(lang))}</pre>`);

        return lines.join('\n');
    }

    function buildRpsKeyboard(lang) {
        const inline_keyboard = [
            RANDOM_RPS_CHOICES.map((choice) => ({
                text: `${choice.icon} ${t(lang, `random_rps_${choice.key}`)}`,
                callback_data: `random|rps_choice|${choice.key}`
            })),
            [{ text: t(lang, 'random_back'), callback_data: 'random|back' }]
        ];

        return { inline_keyboard };
    }

    function buildTruthKeyboard(question, lang) {
        const inline_keyboard = [];
        for (let i = 0; i < question.options.length; i += 2) {
            const row = question.options.slice(i, i + 2).map((option) => ({
                text: option,
                callback_data: `random|truth_answer|${question.key}|${option}`
            }));
            inline_keyboard.push(row);
        }
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        return { inline_keyboard };
    }

    function buildFortuneKeyboard(lang, { includeBack = true } = {}) {
        const inline_keyboard = [];
        const langCode = resolveFortuneLang(lang);
        const buttons = randomFortunes.map((topic) => ({
            text: `${topic.icon} #${topic.index} · ${topic.names[langCode] || topic.names.en}`,
            callback_data: `random|fortune_topic|${topic.index}`
        }));
        for (let i = 0; i < buttons.length; i += 2) {
            inline_keyboard.push(buttons.slice(i, i + 2));
        }
        if (includeBack) {
            inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        }
        return { inline_keyboard };
    }

    function buildQuizKeyboard(token, challenge, lang) {
        const inline_keyboard = challenge.options.map((option) => ([{
            text: option.text,
            callback_data: `random|truth_answer|${token}|${option.index}`
        }]));
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        return { inline_keyboard };
    }

    function shuffleArray(items) {
        for (let i = items.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return items;
    }

    function normalizeMemoryDimensions(width, height) {
        const parsedWidth = Math.floor(Number(width ?? MEMORY_DEFAULT_WIDTH));
        const parsedHeight = Math.floor(Number(height ?? MEMORY_DEFAULT_HEIGHT));

        const baseCols = Number.isFinite(parsedWidth) ? parsedWidth : MEMORY_DEFAULT_WIDTH;
        const baseRows = Number.isFinite(parsedHeight) ? parsedHeight : MEMORY_DEFAULT_HEIGHT;

        let rows = Math.max(2, Math.min(MEMORY_MAX_HEIGHT, baseRows));
        let cols = Math.max(2, Math.min(MEMORY_MAX_WIDTH, MEMORY_MAX_INLINE_COLS, baseCols));

        let capped = rows !== baseRows || cols !== baseCols;

        const maxArea = MEMORY_MAX_BUTTONS;
        if (rows * cols > maxArea) {
            const scale = Math.sqrt(maxArea / (rows * cols));
            rows = Math.max(2, Math.floor(rows * scale));
            cols = Math.max(2, Math.floor(cols * scale));
            while (rows * cols > maxArea && (rows > 2 || cols > 2)) {
                if (rows >= cols && rows > 2) {
                    rows -= 1;
                } else if (cols > 2) {
                    cols -= 1;
                } else {
                    break;
                }
            }
            capped = true;
        }

        return { rows, cols, capped };
    }

    function parseMemorySizeInput(input) {
        if (input === undefined || input === null) {
            return null;
        }
        const text = String(input).trim().toLowerCase();
        if (!text) {
            return null;
        }
        const parts = text
            .split(/[^0-9]+/)
            .filter(Boolean)
            .map((p) => Number(p));
        if (!parts.length || parts.some((n) => !Number.isFinite(n))) {
            return null;
        }
        if (parts.length === 1) {
            return { cols: parts[0], rows: parts[0] };
        }
        return { cols: parts[0], rows: parts[1] };
    }

    function parseSudokuSizeInput(input) {
        if (input === undefined || input === null) {
            return null;
        }
        const text = String(input).trim().toLowerCase();
        if (!text) {
            return null;
        }
        const match = text.match(/\d+/);
        if (!match) {
            return null;
        }
        const candidate = Math.floor(Number(match[0]));
        if (!Number.isFinite(candidate) || !SUDOKU_ALLOWED_SIZES.includes(candidate)) {
            return null;
        }
        return candidate;
    }

    function normalizeSudokuSize(size) {
        const candidate = Math.floor(Number(size ?? SUDOKU_DEFAULT_SIZE));
        if (Number.isFinite(candidate) && SUDOKU_ALLOWED_SIZES.includes(candidate)) {
            return candidate;
        }
        return SUDOKU_DEFAULT_SIZE;
    }

    function normalizeMemoryTheme(themeKey) {
        const key = String(themeKey || '').toLowerCase();
        if (!key || key === 'mix' || key === 'mixed' || key === 'all') {
            return MEMORY_THEME_DEFAULT;
        }
        if (MEMORY_THEMES[key]) {
            return key;
        }
        return MEMORY_THEME_DEFAULT;
    }

    function getMemoryThemeLabel(lang, themeKey) {
        const theme = MEMORY_THEME_ORDER.find((item) => item.key === themeKey) || MEMORY_THEME_ORDER[0];
        return `${theme.icon} ${t(lang, theme.labelKey)}`;
    }

    function buildMemoryValues(pairCount, themeKey = MEMORY_THEME_DEFAULT) {
        const normalized = normalizeMemoryTheme(themeKey);
        const primary = normalized === MEMORY_THEME_DEFAULT
            ? [...MEMORY_ICONS]
            : [...(MEMORY_THEMES[normalized] || [])];
        const fallback = MEMORY_ICONS.filter((icon) => !primary.includes(icon));

        const uniqueIcons = [];
        const seen = new Set();
        shuffleArray(primary).forEach((icon) => {
            if (uniqueIcons.length < pairCount && !seen.has(icon)) {
                uniqueIcons.push(icon);
                seen.add(icon);
            }
        });

        shuffleArray(fallback).forEach((icon) => {
            if (uniqueIcons.length < pairCount && !seen.has(icon)) {
                uniqueIcons.push(icon);
                seen.add(icon);
            }
        });

        let counter = 1;
        while (uniqueIcons.length < pairCount) {
            uniqueIcons.push(`#${counter.toString(36).toUpperCase()}`);
            counter += 1;
        }

        return shuffleArray(uniqueIcons).slice(0, pairCount);
    }

    function buildMemorySizeKeyboard(lang, theme = MEMORY_THEME_DEFAULT) {
        const inline_keyboard = [];
        let row = [];
        MEMORY_PRESET_SIZES.forEach(({ rows: r, cols: c }) => {
            row.push({ text: `${r}x${c}`, callback_data: `random|memory_size|${r}|${c}|${theme}` });
            if (row.length === 3) {
                inline_keyboard.push(row);
                row = [];
            }
        });
        if (row.length) {
            inline_keyboard.push(row);
        }
        inline_keyboard.push([{ text: t(lang, 'random_memory_custom_button'), callback_data: 'random|memory_custom' }]);
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        return { inline_keyboard };
    }

    function buildSudokuSizeKeyboard(lang) {
        const inline_keyboard = [];
        const presets = [
            { size: 4, label: '4x4' },
            { size: 6, label: '6x6' },
            { size: 9, label: '9x9' }
        ];
        let row = [];
        presets.forEach((entry) => {
            row.push({ text: entry.label, callback_data: `random|sudoku_size|${entry.size}` });
            if (row.length === 2) {
                inline_keyboard.push(row);
                row = [];
            }
        });
        if (row.length) {
            inline_keyboard.push(row);
        }
        inline_keyboard.push([{ text: t(lang, 'random_sudoku_custom_button'), callback_data: 'random|sudoku_custom' }]);
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        return { inline_keyboard };
    }

    function buildMemoryThemeKeyboard(lang) {
        const inline_keyboard = [];
        let row = [];
        MEMORY_THEME_ORDER.forEach((theme) => {
            const label = `${theme.icon} ${t(lang, theme.labelKey)}`;
            row.push({ text: label, callback_data: `random|memory_theme|${theme.key}` });
            if (row.length === 2) {
                inline_keyboard.push(row);
                row = [];
            }
        });
        if (row.length) {
            inline_keyboard.push(row);
        }
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        return { inline_keyboard };
    }

    function createMemoryBoard(rows, cols, theme = MEMORY_THEME_DEFAULT) {
        const totalCells = rows * cols;
        const pairCount = Math.floor(totalCells / 2);
        const icons = buildMemoryValues(pairCount, theme);
        const tiles = shuffleArray(icons.flatMap((icon) => [icon, icon]));

        if (tiles.length > totalCells) {
            tiles.length = totalCells;
        }
        while (tiles.length < totalCells) {
            tiles.push('⬛');
        }

        return tiles.map((value, idx) => ({
            id: idx,
            value,
            matched: value === '⬛'
        }));
    }

    function storeMemorySession(session) {
        memorySessions.set(session.token, session);
    }

    function getMemorySession(token) {
        const entry = memorySessions.get(token);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.createdAt > MEMORY_TTL_MS) {
            memorySessions.delete(token);
            return null;
        }
        return entry;
    }

    function buildMemoryKeyboard(session, { reveal = [] } = {}) {
        const revealSet = new Set(reveal);
        session.picks.forEach((idx) => revealSet.add(idx));
        const inline_keyboard = [];

        for (let row = 0; row < session.rows; row += 1) {
            const buttons = [];
            for (let col = 0; col < session.cols; col += 1) {
                const idx = row * session.cols + col;
                const tile = session.board[idx];
                const visible = tile.matched || revealSet.has(idx);
                const label = visible ? tile.value : '⬜';
                buttons.push({
                    text: label,
                    callback_data: `random|memory_pick|${session.token}|${idx}`
                });
            }
            inline_keyboard.push(buttons);
        }

        return { inline_keyboard };
    }

    function renderMemoryText(session, statusText = '') {
        const title = t(session.lang, 'random_memory_title', { size: `${session.rows}x${session.cols}` });
        const progress = t(session.lang, 'random_memory_progress', {
            moves: session.moves,
            matches: session.matches,
            pairs: session.targetPairs
        });
        const lines = [title, progress, statusText || null].filter(Boolean);

        lines.push(t(session.lang, 'random_memory_instruction'));

        if (session.completed) {
            lines.push('', t(session.lang, 'random_memory_completed', { moves: session.moves }));
        }

        return lines.join('\n');
    }

    function createMemoryGame(lang = defaultLang, width = MEMORY_DEFAULT_WIDTH, height = MEMORY_DEFAULT_HEIGHT, theme = MEMORY_THEME_DEFAULT) {
        const normalizedTheme = normalizeMemoryTheme(theme);
        const dims = normalizeMemoryDimensions(width, height);
        const totalCells = dims.rows * dims.cols;
        const targetPairs = Math.floor(totalCells / 2);
        const token = createShortToken('mem');
        const cappedNotice = dims.capped
            ? t(lang || defaultLang, 'random_memory_size_capped', { size: `${dims.rows}x${dims.cols}` })
            : '';
        const session = {
            token,
            lang: lang || defaultLang,
            rows: dims.rows,
            cols: dims.cols,
            theme: normalizedTheme,
            targetPairs,
            board: createMemoryBoard(dims.rows, dims.cols, normalizedTheme),
            picks: [],
            moves: 0,
            matches: 0,
            completed: false,
            createdAt: Date.now()
        };
        storeMemorySession(session);

        return {
            token,
            text: renderMemoryText(session, cappedNotice),
            reply_markup: buildMemoryKeyboard(session)
        };
    }

    function handleMemoryPick(token, index, lang = defaultLang) {
        const session = getMemorySession(token);
        if (!session) {
            return { status: 'expired' };
        }

        if (session.completed) {
            return {
                status: 'completed',
                text: renderMemoryText(session, t(session.lang, 'random_memory_already_completed')),
                reply_markup: buildMemoryKeyboard(session)
            };
        }

        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.board.length) {
            return { status: 'invalid' };
        }

        if (session.board[idx].matched) {
            return { status: 'already_matched' };
        }

        if (session.picks.includes(idx)) {
            return { status: 'duplicate' };
        }

        session.picks.push(idx);
        let status = 'pick';
        let revealOnce = [...session.picks];

        if (session.picks.length === 2) {
            session.moves += 1;
            const [a, b] = session.picks;
            const match = session.board[a].value === session.board[b].value;
            if (match) {
                session.board[a].matched = true;
                session.board[b].matched = true;
                session.matches += 1;
                status = 'match';
                session.picks = [];
                if (session.matches >= session.targetPairs) {
                    session.completed = true;
                    status = 'completed';
                }
            } else {
                status = 'mismatch';
                session.picks = [];
            }
        }

        storeMemorySession(session);

        let statusText = '';
        if (status === 'match') {
            statusText = t(session.lang, 'random_memory_status_match');
        } else if (status === 'mismatch') {
            statusText = t(session.lang, 'random_memory_status_mismatch');
        }

        return {
            status,
            text: renderMemoryText(session, statusText),
            reply_markup: buildMemoryKeyboard(session, { reveal: revealOnce })
        };
    }

    function normalizeMinesweeperDimensions(width, height) {
        const parsedWidth = Math.floor(Number(width ?? MINESWEEPER_DEFAULT_COLS));
        const parsedHeight = Math.floor(Number(height ?? MINESWEEPER_DEFAULT_ROWS));

        const baseCols = Number.isFinite(parsedWidth) ? parsedWidth : MINESWEEPER_DEFAULT_COLS;
        const baseRows = Number.isFinite(parsedHeight) ? parsedHeight : MINESWEEPER_DEFAULT_ROWS;

        let rows = Math.max(MINESWEEPER_MIN_SIZE, Math.min(MINESWEEPER_MAX_ROWS, baseRows));
        let cols = Math.max(MINESWEEPER_MIN_SIZE, Math.min(MINESWEEPER_MAX_COLS, baseCols));
        let capped = rows !== baseRows || cols !== baseCols;

        if (rows * cols > MINESWEEPER_MAX_BUTTONS) {
            const scale = Math.sqrt(MINESWEEPER_MAX_BUTTONS / (rows * cols));
            rows = Math.max(MINESWEEPER_MIN_SIZE, Math.floor(rows * scale));
            cols = Math.max(MINESWEEPER_MIN_SIZE, Math.floor(cols * scale));
            while (rows * cols > MINESWEEPER_MAX_BUTTONS && (rows > MINESWEEPER_MIN_SIZE || cols > MINESWEEPER_MIN_SIZE)) {
                if (rows >= cols && rows > MINESWEEPER_MIN_SIZE) {
                    rows -= 1;
                } else if (cols > MINESWEEPER_MIN_SIZE) {
                    cols -= 1;
                } else {
                    break;
                }
            }
            capped = true;
        }

        return { rows, cols, capped };
    }

    function buildMinesweeperSizeKeyboard(lang) {
        const inline_keyboard = [];
        let row = [];
        MINESWEEPER_PRESET_SIZES.forEach(({ rows: r, cols: c }) => {
            row.push({ text: `${r}x${c}`, callback_data: `random|mines_size|${r}|${c}` });
            if (row.length === 3) {
                inline_keyboard.push(row);
                row = [];
            }
        });
        if (row.length) {
            inline_keyboard.push(row);
        }
        inline_keyboard.push([{ text: t(lang, 'random_mines_custom_button'), callback_data: 'random|mines_custom' }]);
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        return { inline_keyboard };
    }

    function getMinesweeperNeighbors(index, rows, cols) {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const neighbors = [];
        for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
                if (dr === 0 && dc === 0) {
                    continue;
                }
                const nr = row + dr;
                const nc = col + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    neighbors.push(nr * cols + nc);
                }
            }
        }
        return neighbors;
    }

    function pickMineCount(rows, cols) {
        const total = rows * cols;
        const base = Math.floor(total * 0.18);
        return Math.max(1, Math.min(total - 1, base || Math.floor(total * 0.15)));
    }

    function createMinesweeperBoard(rows, cols, mines) {
        const total = rows * cols;
        const board = Array.from({ length: total }, (_, idx) => ({
            id: idx,
            hasMine: false,
            adjacent: 0,
            revealed: false,
            flagged: false
        }));

        const indices = shuffleArray([...board.keys()]);
        for (let i = 0; i < mines && i < total; i += 1) {
            const mineIndex = indices[i];
            board[mineIndex].hasMine = true;
        }

        for (let i = 0; i < board.length; i += 1) {
            if (board[i].hasMine) {
                continue;
            }
            const neighbors = getMinesweeperNeighbors(i, rows, cols);
            board[i].adjacent = neighbors.reduce((count, idx) => count + (board[idx].hasMine ? 1 : 0), 0);
        }

        return board;
    }

    function storeMinesweeperSession(session) {
        minesweeperSessions.set(session.token, session);
    }

    function getMinesweeperSession(token) {
        const entry = minesweeperSessions.get(token);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.createdAt > MINESWEEPER_TTL_MS) {
            minesweeperSessions.delete(token);
            return null;
        }
        return entry;
    }

    function revealMinesweeperArea(session, index, visited = new Set()) {
        if (visited.has(index)) {
            return 0;
        }
        visited.add(index);
        const cell = session.board[index];
        if (cell.revealed || cell.flagged || cell.hasMine) {
            return 0;
        }
        cell.revealed = true;
        let revealed = 1;
        if (cell.adjacent === 0) {
            const neighbors = getMinesweeperNeighbors(index, session.rows, session.cols);
            neighbors.forEach((neighbor) => {
                revealed += revealMinesweeperArea(session, neighbor, visited);
            });
        }
        return revealed;
    }

    function renderMinesweeperCell(cell, session, { revealAll = false } = {}) {
        if ((revealAll || cell.revealed) && cell.hasMine) {
            return '💣';
        }
        if (cell.revealed) {
            if (cell.adjacent === 0) {
                return '·';
            }
            return cell.adjacent.toString();
        }
        if (cell.flagged) {
            if (revealAll && !cell.hasMine && session.status === 'lost') {
                return '✖️';
            }
            return '🚩';
        }
        if (revealAll && cell.hasMine) {
            return '💣';
        }
        return '⬜';
    }

    function buildMinesweeperKeyboard(session) {
        const revealAll = session.status !== 'playing';
        const inline_keyboard = [];

        for (let row = 0; row < session.rows; row += 1) {
            const buttons = [];
            for (let col = 0; col < session.cols; col += 1) {
                const idx = row * session.cols + col;
                const cell = session.board[idx];
                const label = renderMinesweeperCell(cell, session, { revealAll });
                buttons.push({
                    text: label,
                    callback_data: `random|mines_pick|${session.token}|${idx}`
                });
            }
            inline_keyboard.push(buttons);
        }

        inline_keyboard.push([
            {
                text: session.flagMode
                    ? `🚩 ${t(session.lang, 'random_mines_flag_on')}`
                    : `🚩 ${t(session.lang, 'random_mines_flag_off')}`,
                callback_data: `random|mines_flag|${session.token}`
            },
            {
                text: `🔄 ${t(session.lang, 'random_mines_replay')}`,
                callback_data: `random|mines_replay|${session.token}`
            }
        ]);
        inline_keyboard.push([{ text: t(session.lang, 'random_back'), callback_data: 'random|back' }]);

        return { inline_keyboard };
    }

    function renderMinesweeperText(session, statusText = '') {
        const title = t(session.lang, 'random_mines_title', { size: `${session.rows}x${session.cols}` });
        const stats = t(session.lang, 'random_mines_stats', {
            moves: session.moves,
            flags: session.flagsPlaced,
            mines: session.mines,
            mode: session.flagMode
                ? t(session.lang, 'random_mines_mode_flag')
                : t(session.lang, 'random_mines_mode_reveal')
        });

        const lines = [title, stats];
        const instruction = session.status === 'playing'
            ? t(session.lang, 'random_mines_instruction', {
                mode: session.flagMode
                    ? t(session.lang, 'random_mines_mode_flag')
                    : t(session.lang, 'random_mines_mode_reveal')
            })
            : t(session.lang, 'random_mines_finished_hint');
        if (statusText) {
            lines.push(statusText);
        } else if (session.status === 'won') {
            lines.push(t(session.lang, 'random_mines_win', { moves: session.moves }));
        } else if (session.status === 'lost') {
            lines.push(t(session.lang, 'random_mines_boom'));
        }
        lines.push(instruction);

        return lines.join('\n');
    }

    function createMinesweeperGame(lang = defaultLang, width = MINESWEEPER_DEFAULT_COLS, height = MINESWEEPER_DEFAULT_ROWS) {
        const dims = normalizeMinesweeperDimensions(width, height);
        const mineCount = pickMineCount(dims.rows, dims.cols);
        const token = createShortToken('mine');
        const cappedNotice = dims.capped
            ? t(lang || defaultLang, 'random_mines_size_capped', { size: `${dims.rows}x${dims.cols}` })
            : '';

        const session = {
            token,
            lang: lang || defaultLang,
            rows: dims.rows,
            cols: dims.cols,
            mines: mineCount,
            board: createMinesweeperBoard(dims.rows, dims.cols, mineCount),
            moves: 0,
            flagsPlaced: 0,
            revealed: 0,
            status: 'playing',
            flagMode: false,
            createdAt: Date.now()
        };
        storeMinesweeperSession(session);

        return {
            token,
            text: renderMinesweeperText(session, cappedNotice),
            reply_markup: buildMinesweeperKeyboard(session)
        };
    }

    function toggleMinesweeperFlagMode(token, lang = defaultLang) {
        const session = getMinesweeperSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        if (session.status !== 'playing') {
            return {
                status: 'finished',
                text: renderMinesweeperText(session, t(session.lang, 'random_mines_finished')),
                reply_markup: buildMinesweeperKeyboard(session)
            };
        }
        session.flagMode = !session.flagMode;
        storeMinesweeperSession(session);
        return {
            status: 'ok',
            text: renderMinesweeperText(session),
            reply_markup: buildMinesweeperKeyboard(session)
        };
    }

    function replayMinesweeperGame(token, lang = defaultLang) {
        const session = getMinesweeperSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        minesweeperSessions.delete(token);
        const next = createMinesweeperGame(session.lang || lang, session.cols, session.rows);
        return { status: 'ok', ...next };
    }

    function handleMinesweeperPick(token, index, lang = defaultLang) {
        const session = getMinesweeperSession(token);
        if (!session) {
            return { status: 'expired' };
        }

        if (session.status !== 'playing') {
            return {
                status: 'finished',
                text: renderMinesweeperText(session, t(session.lang, 'random_mines_finished')),
                reply_markup: buildMinesweeperKeyboard(session)
            };
        }

        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.board.length) {
            return { status: 'invalid' };
        }

        const cell = session.board[idx];

        if (session.flagMode) {
            if (cell.revealed) {
                return {
                    status: 'duplicate',
                    text: renderMinesweeperText(session),
                    reply_markup: buildMinesweeperKeyboard(session)
                };
            }
            cell.flagged = !cell.flagged;
            session.flagsPlaced = Math.max(0, session.flagsPlaced + (cell.flagged ? 1 : -1));
            session.moves += 1;
            storeMinesweeperSession(session);
            return {
                status: cell.flagged ? 'flagged' : 'unflagged',
                text: renderMinesweeperText(session),
                reply_markup: buildMinesweeperKeyboard(session)
            };
        }

        if (cell.flagged) {
            return {
                status: 'flagged_blocked',
                text: renderMinesweeperText(session),
                reply_markup: buildMinesweeperKeyboard(session)
            };
        }

        if (cell.revealed) {
            return {
                status: 'duplicate',
                text: renderMinesweeperText(session),
                reply_markup: buildMinesweeperKeyboard(session)
            };
        }

        session.moves += 1;

        let statusText = '';
        let status = 'revealed';

        if (cell.hasMine) {
            cell.revealed = true;
            session.status = 'lost';
            status = 'lost';
            statusText = t(session.lang, 'random_mines_boom');
        } else {
            const newly = revealMinesweeperArea(session, idx);
            session.revealed += newly;
            const safeCells = session.rows * session.cols - session.mines;
            if (session.revealed >= safeCells) {
                session.status = 'won';
                status = 'won';
                statusText = t(session.lang, 'random_mines_win', { moves: session.moves });
            }
        }

        storeMinesweeperSession(session);

        return {
            status,
            moves: session.moves,
            text: renderMinesweeperText(session, statusText),
            reply_markup: buildMinesweeperKeyboard(session)
        };
    }

    function normalizeTreasureSize(rowsInput, colsInput) {
        const rowsParsed = Number.parseInt(rowsInput, 10);
        const colsParsed = Number.parseInt(colsInput, 10);
        let rows = Number.isFinite(rowsParsed) ? rowsParsed : TREASURE_DEFAULT_ROWS;
        let cols = Number.isFinite(colsParsed) ? colsParsed : TREASURE_DEFAULT_COLS;
        rows = Math.min(Math.max(rows, TREASURE_MIN_ROWS), TREASURE_MAX_ROWS);
        cols = Math.min(Math.max(cols, TREASURE_MIN_COLS), TREASURE_MAX_COLS);
        let capped = false;
        if (rows * cols > TREASURE_MAX_CELLS) {
            capped = true;
            rows = TREASURE_DEFAULT_ROWS;
            cols = TREASURE_DEFAULT_COLS;
        }
        return { rows, cols, capped };
    }

    function parseTreasureSizeInput(raw) {
        const cleaned = (raw || '').trim().toLowerCase();
        if (!cleaned) {
            return null;
        }
        const match = /^(\d{1,2})(?:\s*[xX]\s*(\d{1,2}))?$/.exec(cleaned);
        if (!match) {
            return null;
        }
        const a = Number.parseInt(match[1], 10);
        const b = match[2] ? Number.parseInt(match[2], 10) : null;
        const rows = Number.isFinite(a) ? a : null;
        const cols = Number.isFinite(b) ? b : a;
        if (!Number.isFinite(rows) || !Number.isFinite(cols)) {
            return null;
        }
        if (rows < TREASURE_MIN_ROWS || rows > TREASURE_MAX_ROWS || cols < TREASURE_MIN_COLS || cols > TREASURE_MAX_COLS || rows * cols > TREASURE_MAX_CELLS) {
            return null;
        }
        return { rows, cols };
    }

    function buildTreasureSizeKeyboard(lang = defaultLang) {
        const inline_keyboard = [];
        const sizeRow = TREASURE_PRESET_SIZES.map((size) => ({
            text: `${size.rows}x${size.cols}`,
            callback_data: `random|treasure_size|${size.rows}|${size.cols}`
        }));
        inline_keyboard.push(sizeRow);
        inline_keyboard.push([{ text: t(lang, 'random_treasure_custom_button'), callback_data: 'random|treasure_custom' }]);
        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'random|close' }]);
        return { inline_keyboard };
    }

    function storeTreasureSession(session) {
        treasureSessions.set(session.token, session);
    }

    function getTreasureSession(token) {
        const entry = treasureSessions.get(token);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.createdAt > TREASURE_TTL_MS) {
            treasureSessions.delete(token);
            return null;
        }
        return entry;
    }

    function pickUniqueIndices(count, total, exclude = new Set()) {
        const chosen = new Set();
        while (chosen.size < count && chosen.size + exclude.size < total) {
            const idx = Math.floor(Math.random() * total);
            if (exclude.has(idx) || chosen.has(idx)) {
                continue;
            }
            chosen.add(idx);
        }
        return chosen;
    }

    function manhattanDistance(idxA, idxB, cols) {
        const rA = Math.floor(idxA / cols);
        const cA = idxA % cols;
        const rB = Math.floor(idxB / cols);
        const cB = idxB % cols;
        return Math.abs(rA - rB) + Math.abs(cA - cB);
    }

    function buildTreasureKeyboard(session) {
        const inline_keyboard = [];
        for (let row = 0; row < session.rows; row += 1) {
            const buttons = [];
            for (let col = 0; col < session.cols; col += 1) {
                const idx = row * session.cols + col;
                const cell = session.board[idx] || '';
                let label = '⬜';
                if (cell === 'treasure') {
                    label = '💎';
                } else if (cell === 'radar') {
                    label = '📡';
                } else if (cell === 'trap') {
                    label = '💥';
                } else if (cell === 'miss') {
                    label = '✖️';
                }
                buttons.push({
                    text: label,
                    callback_data: `random|treasure_pick|${session.token}|${idx}`
                });
            }
            inline_keyboard.push(buttons);
        }
        return { inline_keyboard };
    }

    function formatTreasurePlayerMention(player, lang = defaultLang) {
        if (!player) {
            return escapeHtml(t(lang, 'random_gomoku_waiting'));
        }
        const label = escapeHtml(formatGomokuPlayerLabel(player, lang));
        if (player.id) {
            return `<a href="tg://user?id=${escapeHtml(player.id.toString())}">${label}</a>`;
        }
        return label;
    }

    function renderTreasureText(session, statusText = '') {
        const playerA = escapeHtml(formatGomokuPlayerLabel(session.playerA, session.lang));
        const playerB = escapeHtml(formatGomokuPlayerLabel(session.playerB, session.lang));
        const lines = [
            t(session.lang, 'random_treasure_title', { size: `${session.rows}x${session.cols}` }),
            t(session.lang, 'random_treasure_player_a', { player: playerA }),
            t(session.lang, 'random_treasure_player_b', { player: playerB }),
            t(session.lang, 'random_treasure_help')
        ];
        if (session.cappedNotice) {
            lines.push(session.cappedNotice);
        }
        if (statusText) {
            lines.push(statusText);
        } else if (session.status === 'won') {
            const winnerMention = formatTreasurePlayerMention(session.winner || session.playerA, session.lang);
            const winLine = `${t(session.lang, 'random_treasure_win', { moves: session.moves })} ${t(session.lang, 'random_treasure_effect_quote', { winner: winnerMention })}`;
            lines.push(winLine);
        }
        if (session.status === 'playing') {
            const turnPlayer = session.turn === 'A' ? playerA : playerB;
            lines.push(t(session.lang, 'random_treasure_turn', { player: turnPlayer }));
        }
        lines.push(t(session.lang, 'random_treasure_moves', { moves: session.moves }));
        return lines.join('\n');
    }

    function createTreasureGame(lang = defaultLang, sizeInput = null, creator = null, options = {}) {
        const { chatType = null } = options || {};
        const dims = normalizeTreasureSize(sizeInput?.rows, sizeInput?.cols);
        const token = createShortToken('treas');
        const total = dims.rows * dims.cols;
        const treasureIndex = Math.floor(Math.random() * total);
        const trapCount = Math.max(1, Math.floor(total / 18));
        const radarCount = Math.max(1, Math.floor(total / 16));
        const traps = pickUniqueIndices(trapCount, total, new Set([treasureIndex]));
        const radars = pickUniqueIndices(radarCount, total, new Set([treasureIndex, ...traps]));
        const board = Array.from({ length: total }, () => '');
        const autoBot = chatType === 'private';
        const playerA = creator
            ? {
                  id: creator.id?.toString() || creator.id,
                  first_name: creator.first_name,
                  last_name: creator.last_name,
                  username: creator.username
              }
            : null;
        const botProfile = autoBot
            ? { id: 'treasure-bot', first_name: t(lang || defaultLang, 'random_treasure_bot'), username: '' }
            : null;
        const session = {
            token,
            lang: lang || defaultLang,
            rows: dims.rows,
            cols: dims.cols,
            treasureIndex,
            traps,
            radars,
            board,
            moves: 0,
            status: 'playing',
            turn: 'A',
            playerA,
            playerB: botProfile,
            skipTurns: { A: 0, B: 0 },
            autoBot,
            botProfile,
            chatType,
            winner: null,
            cappedNotice: dims.capped ? t(lang || defaultLang, 'random_treasure_size_capped', { size: `${dims.rows}x${dims.cols}` }) : '',
            createdAt: Date.now()
        };
        storeTreasureSession(session);
        return {
            token,
            text: renderTreasureText(session),
            reply_markup: buildTreasureKeyboard(session),
            playerA: session.playerA,
            playerB: session.playerB
        };
    }

    function chooseTreasureBotMove(session) {
        const empties = session.board
            .map((v, idx) => (v ? null : idx))
            .filter((v) => v !== null);
        const safe = empties.filter((idx) => !session.traps.has(idx));
        const pool = safe.length ? safe : empties;
        if (!pool.length) {
            return null;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return pick;
    }

    function handleTreasurePick(token, index, user, lang = defaultLang) {
        const session = getTreasureSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        if (session.status === 'won') {
            return {
                status: 'finished',
                text: renderTreasureText(session),
                reply_markup: buildTreasureKeyboard(session)
            };
        }

        if (!session.skipTurns || typeof session.skipTurns !== 'object') {
            session.skipTurns = { A: 0, B: 0 };
        }

        const userId = user?.id?.toString() || null;
        const profile = user
            ? {
                  id: userId,
                  first_name: user.first_name,
                  last_name: user.last_name,
                  username: user.username
              }
            : null;
        if (!session.playerA) {
            session.playerA = profile;
        } else if (!session.playerB && userId && session.playerA?.id !== userId && !session.autoBot) {
            session.playerB = profile;
        }

        const actor = session.playerA?.id === userId ? 'A' : session.playerB?.id === userId ? 'B' : null;
        if (!actor) {
            return {
                status: 'not_player',
                text: renderTreasureText(session, t(session.lang, 'random_treasure_not_player')),
                reply_markup: buildTreasureKeyboard(session)
            };
        }
        if (session.turn !== actor) {
            return {
                status: 'not_turn',
                text: renderTreasureText(session, t(session.lang, 'random_treasure_not_turn')),
                reply_markup: buildTreasureKeyboard(session)
            };
        }
        if (session.skipTurns[actor] > 0) {
            session.skipTurns[actor] -= 1;
            session.turn = actor === 'A' ? 'B' : 'A';
            storeTreasureSession(session);
            return {
                status: 'skip',
                text: renderTreasureText(session, t(session.lang, 'random_treasure_skip')),
                reply_markup: buildTreasureKeyboard(session)
            };
        }

        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.board.length) {
            return { status: 'invalid' };
        }
        if (session.board[idx]) {
            return {
                status: 'duplicate',
                text: renderTreasureText(session, t(session.lang, 'random_treasure_already')),
                reply_markup: buildTreasureKeyboard(session)
            };
        }

        session.moves += 1;
        let status = 'miss';
        let statusText = t(session.lang, 'random_treasure_miss');

        if (idx === session.treasureIndex) {
            session.board[idx] = 'treasure';
            session.status = 'won';
            status = 'won';
            const winnerMention = formatTreasurePlayerMention(actor === 'A' ? session.playerA : session.playerB, session.lang);
            session.winner = actor === 'A' ? session.playerA : session.playerB;
            statusText = `${t(session.lang, 'random_treasure_win', { moves: session.moves })} ${t(session.lang, 'random_treasure_effect_quote', { winner: winnerMention })}`;
        } else if (session.radars.has(idx)) {
            session.board[idx] = 'radar';
            const distance = manhattanDistance(idx, session.treasureIndex, session.cols);
            status = 'radar';
            statusText = t(session.lang, 'random_treasure_radar', { distance });
        } else if (session.traps.has(idx)) {
            session.board[idx] = 'trap';
            session.skipTurns[actor] = 1;
            status = 'trap';
            statusText = t(session.lang, 'random_treasure_trap');
        } else {
            session.board[idx] = 'miss';
        }

        if (session.status === 'playing') {
            session.turn = actor === 'A' ? 'B' : 'A';
        }

        if (session.autoBot && session.status === 'playing' && session.turn === 'B') {
            if (session.skipTurns.B > 0) {
                session.skipTurns.B -= 1;
                session.turn = 'A';
                status = status === 'won' ? status : 'skip';
                statusText = statusText || t(session.lang, 'random_treasure_skip');
            } else {
                const botMove = chooseTreasureBotMove(session);
                if (botMove !== null) {
                    session.moves += 1;
                    if (botMove === session.treasureIndex) {
                        session.board[botMove] = 'treasure';
                        session.status = 'won';
                        status = 'won';
                        const botMention = formatTreasurePlayerMention(session.botProfile, session.lang);
                        session.winner = session.botProfile;
                        statusText = `${t(session.lang, 'random_treasure_bot_win')} ${t(session.lang, 'random_treasure_effect_quote', { winner: botMention })}`;
                    } else if (session.radars.has(botMove)) {
                        session.board[botMove] = 'radar';
                        const distance = manhattanDistance(botMove, session.treasureIndex, session.cols);
                        statusText = t(session.lang, 'random_treasure_radar', { distance });
                    } else if (session.traps.has(botMove)) {
                        session.board[botMove] = 'trap';
                        session.skipTurns.B = 1;
                        statusText = t(session.lang, 'random_treasure_trap');
                    } else {
                        session.board[botMove] = 'miss';
                    }
                    if (session.status === 'playing') {
                        session.turn = 'A';
                    }
                }
            }
        }

        storeTreasureSession(session);

        const opponent = actor === 'A' ? session.playerB : session.playerA;
        return {
            status,
            text: renderTreasureText(session, statusText),
            reply_markup: buildTreasureKeyboard(session),
            opponent
        };
    }

    function getSudokuBox(size) {
        if (size === 4) {
            return { boxRows: 2, boxCols: 2 };
        }
        if (size === 6) {
            return { boxRows: 2, boxCols: 3 };
        }
        return { boxRows: 3, boxCols: 3 };
    }

    function buildSudokuSolution(size) {
        const { boxRows, boxCols } = getSudokuBox(size);
        const rowGroupCount = size / boxRows;
        const colGroupCount = size / boxCols;
        const pattern = (row, col) => (boxCols * (row % boxRows) + Math.floor(row / boxRows) + col) % size;

        const rowGroups = shuffleArray([...Array(rowGroupCount).keys()]);
        const colGroups = shuffleArray([...Array(colGroupCount).keys()]);
        const rows = rowGroups.flatMap((group) => shuffleArray([...Array(boxRows).keys()].map((row) => group * boxRows + row)));
        const cols = colGroups.flatMap((group) => shuffleArray([...Array(boxCols).keys()].map((col) => group * boxCols + col)));
        const nums = shuffleArray([...Array(size).keys()]);

        const solution = [];
        rows.forEach((row) => {
            cols.forEach((col) => {
                solution.push(nums[pattern(row, col)] + 1);
            });
        });

        return { solution, boxRows, boxCols };
    }

    function buildSudokuPuzzle(solution, size) {
        const total = size * size;
        const puzzle = [...solution];
        let clueCount = size === 4 ? 8 : size === 6 ? 16 : 32;
        clueCount = Math.min(total - 4, Math.max(Math.floor(total * 0.4), clueCount));
        const blanks = Math.max(1, total - clueCount);
        const indices = shuffleArray([...Array(total).keys()]);
        for (let i = 0; i < blanks && i < indices.length; i += 1) {
            puzzle[indices[i]] = 0;
        }
        return puzzle;
    }

    function storeSudokuSession(session) {
        sudokuSessions.set(session.token, session);
    }

    function getSudokuSession(token) {
        const session = sudokuSessions.get(token);
        if (!session) {
            return null;
        }
        if (Date.now() - session.createdAt > SUDOKU_TTL_MS) {
            sudokuSessions.delete(token);
            return null;
        }
        return session;
    }

    function formatSudokuTimeLeft(session) {
        const expiresAt = session.expiresAt || (session.createdAt + SUDOKU_TTL_MS);
        const remaining = Math.max(0, expiresAt - Date.now());
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function formatSudokuDuration(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function renderSudokuText(session, statusText = '') {
        const total = session.size * session.size;
        const filled = session.values.filter((value) => Number.isInteger(value) && value > 0).length;
        const remaining = Math.max(0, total - filled);
        const lines = [
            t(session.lang, 'random_sudoku_title', { size: `${session.size}x${session.size}` }),
            t(session.lang, 'random_sudoku_progress', {
                filled,
                total,
                remaining,
                moves: session.moves,
                mistakes: session.mistakes
            })
        ];

        if (session.completed && session.finishedAt) {
            const duration = formatSudokuDuration(session.finishedAt - session.createdAt);
            lines.push(t(session.lang, 'random_sudoku_completed', { moves: session.moves, mistakes: session.mistakes, duration }));
        } else {
            lines.push(t(session.lang, 'random_sudoku_time_left', { time: formatSudokuTimeLeft(session) }));
            if (statusText) {
                lines.push(statusText);
            }
            if (Number.isInteger(session.selected)) {
                const row = Math.floor(session.selected / session.size) + 1;
                const col = (session.selected % session.size) + 1;
                lines.push(t(session.lang, 'random_sudoku_selected', { row, col }));
            }
            lines.push(t(session.lang, 'random_sudoku_instruction'));
        }

        return lines.filter(Boolean).join('\n');
    }

    function buildSudokuKeyboard(session) {
        const inline_keyboard = [];
        const selected = Number.isInteger(session.selected) ? session.selected : null;
        for (let row = 0; row < session.size; row += 1) {
            const buttons = [];
            for (let col = 0; col < session.size; col += 1) {
                const idx = row * session.size + col;
                const value = session.values[idx];
                const fixed = session.fixed[idx];
                let label = value ? value.toString() : '·';
                if (fixed) {
                    label = `🔒${label}`;
                }
                if (idx === selected) {
                    label = `[${label}]`;
                }
                buttons.push({
                    text: label,
                    callback_data: `random|sudoku_pick|${session.token}|${idx}`
                });
            }
            inline_keyboard.push(buttons);
        }

        const target = Number.isInteger(selected) ? selected : 'x';
        const perRow = session.size <= 4 ? session.size : 3;
        const numbers = Array.from({ length: session.size }, (_, idx) => idx + 1);
        for (let i = 0; i < numbers.length; i += perRow) {
            const row = numbers.slice(i, i + perRow).map((value) => ({
                text: value.toString(),
                callback_data: `random|sudoku_set|${session.token}|${target}|${value}`
            }));
            inline_keyboard.push(row);
        }

        inline_keyboard.push([
            {
                text: t(session.lang, 'random_sudoku_clear_button'),
                callback_data: `random|sudoku_clear|${session.token}|${target}`
            }
        ]);
        inline_keyboard.push([{ text: t(session.lang, 'random_back'), callback_data: 'random|back' }]);
        inline_keyboard.push([{ text: t(session.lang, 'help_button_close'), callback_data: 'random|close' }]);
        return { inline_keyboard };
    }

    function evaluateSudokuCompletion(session) {
        const solved = session.values.every((value, idx) => value === session.solution[idx]);
        if (solved) {
            session.completed = true;
            session.finishedAt = session.finishedAt || Date.now();
            return 'completed';
        }
        const filled = session.values.every((value) => Number.isInteger(value) && value > 0);
        if (filled) {
            return 'filled_wrong';
        }
        return 'playing';
    }

    function createSudokuGame(lang = defaultLang, sizeInput = SUDOKU_DEFAULT_SIZE) {
        const size = normalizeSudokuSize(sizeInput);
        const { solution, boxRows, boxCols } = buildSudokuSolution(size);
        const puzzle = buildSudokuPuzzle(solution, size);
        const token = createShortToken('sdk');
        const session = {
            token,
            lang: lang || defaultLang,
            size,
            boxRows,
            boxCols,
            solution,
            puzzle,
            values: [...puzzle],
            fixed: puzzle.map((cell) => Boolean(cell)),
            selected: null,
            moves: 0,
            mistakes: 0,
            createdAt: Date.now(),
            expiresAt: Date.now() + SUDOKU_TTL_MS,
            completed: false
        };
        storeSudokuSession(session);

        return {
            token,
            text: renderSudokuText(session),
            reply_markup: buildSudokuKeyboard(session)
        };
    }

    function handleSudokuPick(token, index, lang = defaultLang) {
        const session = getSudokuSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        if (session.completed) {
            return {
                status: 'completed',
                text: renderSudokuText(session, t(session.lang, 'random_sudoku_already_completed')),
                reply_markup: buildSudokuKeyboard(session)
            };
        }
        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.values.length) {
            return { status: 'invalid' };
        }
        if (session.fixed[idx]) {
            return {
                status: 'locked',
                text: renderSudokuText(session, t(session.lang, 'random_sudoku_locked_cell')),
                reply_markup: buildSudokuKeyboard(session)
            };
        }
        session.selected = idx;
        storeSudokuSession(session);
        const row = Math.floor(idx / session.size) + 1;
        const col = (idx % session.size) + 1;
        const statusText = t(session.lang, 'random_sudoku_selected', { row, col });
        return {
            status: 'selected',
            text: renderSudokuText(session, statusText),
            reply_markup: buildSudokuKeyboard(session)
        };
    }

    function handleSudokuSetNumber(token, index, value, lang = defaultLang) {
        const session = getSudokuSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        if (session.completed) {
            return {
                status: 'completed',
                text: renderSudokuText(session, t(session.lang, 'random_sudoku_already_completed')),
                reply_markup: buildSudokuKeyboard(session)
            };
        }
        if (index === undefined || index === null || index === 'x') {
            return { status: 'no_selection' };
        }
        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.values.length) {
            return { status: 'invalid' };
        }
        if (session.fixed[idx]) {
            return {
                status: 'locked',
                text: renderSudokuText(session, t(session.lang, 'random_sudoku_locked_cell')),
                reply_markup: buildSudokuKeyboard(session)
            };
        }
        const number = Number.parseInt(value, 10);
        if (!Number.isInteger(number) || number < 1 || number > session.size) {
            return { status: 'invalid_number' };
        }
        session.selected = idx;
        const previous = session.values[idx];
        if (previous !== number) {
            session.values[idx] = number;
            session.moves += 1;
            if (number !== session.solution[idx]) {
                session.mistakes += 1;
            }
        }
        const completion = evaluateSudokuCompletion(session);
        const row = Math.floor(idx / session.size) + 1;
        const col = (idx % session.size) + 1;
        let status = 'updated';
        let statusText = t(session.lang, 'random_sudoku_filled', { value: number, row, col });
        if (completion === 'completed') {
            status = 'completed';
            const duration = formatSudokuDuration((session.finishedAt || Date.now()) - session.createdAt);
            statusText = t(session.lang, 'random_sudoku_completed', {
                moves: session.moves,
                mistakes: session.mistakes,
                duration
            });
        } else if (completion === 'filled_wrong') {
            statusText = t(session.lang, 'random_sudoku_need_fix');
        }
        storeSudokuSession(session);
        return {
            status,
            text: renderSudokuText(session, statusText),
            reply_markup: buildSudokuKeyboard(session)
        };
    }

    function handleSudokuClear(token, index, lang = defaultLang) {
        const session = getSudokuSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        if (session.completed) {
            return {
                status: 'completed',
                text: renderSudokuText(session, t(session.lang, 'random_sudoku_already_completed')),
                reply_markup: buildSudokuKeyboard(session)
            };
        }
        if (index === undefined || index === null || index === 'x') {
            return { status: 'no_selection' };
        }
        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.values.length) {
            return { status: 'invalid' };
        }
        if (session.fixed[idx]) {
            return {
                status: 'locked',
                text: renderSudokuText(session, t(session.lang, 'random_sudoku_locked_cell')),
                reply_markup: buildSudokuKeyboard(session)
            };
        }
        const hadValue = session.values[idx];
        session.values[idx] = 0;
        session.selected = idx;
        if (hadValue) {
            session.moves += 1;
        }
        storeSudokuSession(session);
        const row = Math.floor(idx / session.size) + 1;
        const col = (idx % session.size) + 1;
        return {
            status: 'cleared',
            text: renderSudokuText(session, t(session.lang, 'random_sudoku_cleared', { row, col })),
            reply_markup: buildSudokuKeyboard(session)
        };
    }

    const GOMOKU_DEFAULT_COLS = 8;
    const GOMOKU_DEFAULT_ROWS = 8;
    const GOMOKU_DEFAULT_SIZE = { rows: GOMOKU_DEFAULT_ROWS, cols: GOMOKU_DEFAULT_COLS };
    const GOMOKU_MIN_ROWS = 5;
    const GOMOKU_MAX_ROWS = 12;
    const GOMOKU_MIN_COLS = 5;
    const GOMOKU_MAX_COLS = 8; // Telegram inline keyboard width cap
    const GOMOKU_MAX_CELLS = 100; // Telegram inline button limit safety
    const GOMOKU_TTL_MS = 20 * 60 * 1000;
    const gomokuSessions = new Map();

    function normalizeGomokuSize(rowsInput, colsInput) {
        const rowsParsed = Number.parseInt(rowsInput, 10);
        const colsParsed = Number.parseInt(colsInput, 10);
        let rows = Number.isFinite(rowsParsed) ? rowsParsed : GOMOKU_DEFAULT_ROWS;
        let cols = Number.isFinite(colsParsed) ? colsParsed : GOMOKU_DEFAULT_COLS;
        rows = Math.min(Math.max(rows, GOMOKU_MIN_ROWS), GOMOKU_MAX_ROWS);
        cols = Math.min(Math.max(cols, GOMOKU_MIN_COLS), GOMOKU_MAX_COLS);
        let capped = false;
        if (rows * cols > GOMOKU_MAX_CELLS) {
            rows = Math.min(Math.floor(GOMOKU_MAX_CELLS / cols), GOMOKU_MAX_ROWS);
            capped = true;
        }
        if (rows !== rowsParsed || cols !== colsParsed) {
            capped = capped || rows !== rowsParsed || cols !== colsParsed;
        }
        return { rows, cols, capped };
    }

    function parseGomokuSizeInput(raw) {
        const cleaned = (raw || '').trim().toLowerCase();
        if (!cleaned) {
            return null;
        }
        const match = /^(\d{1,2})(?:\s*[xX]\s*(\d{1,2}))?$/.exec(cleaned);
        if (!match) {
            return null;
        }
        const a = Number.parseInt(match[1], 10);
        const b = match[2] ? Number.parseInt(match[2], 10) : null;
        const cols = Number.isFinite(a) ? a : null;
        const rows = Number.isFinite(b) ? b : a;
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
            return null;
        }
        if (cols < GOMOKU_MIN_COLS || cols > GOMOKU_MAX_COLS || rows < GOMOKU_MIN_ROWS || rows > GOMOKU_MAX_ROWS || rows * cols > GOMOKU_MAX_CELLS) {
            return null;
        }
        return { rows, cols };
    }

    function getGomokuDifficultyLabel(lang = defaultLang, key = GOMOKU_DEFAULT_DIFFICULTY) {
        const found = GOMOKU_DIFFICULTIES.find((item) => item.key === key) || GOMOKU_DIFFICULTIES[0];
        return t(lang, found.labelKey);
    }

    function normalizeGomokuDifficulty(key) {
        const found = GOMOKU_DIFFICULTIES.find((item) => item.key === key);
        return found ? found.key : GOMOKU_DEFAULT_DIFFICULTY;
    }

    function getGomokuUserDifficulty(userId) {
        if (!userId) {
            return GOMOKU_DEFAULT_DIFFICULTY;
        }
        return gomokuPreferredDifficulty.get(userId.toString()) || GOMOKU_DEFAULT_DIFFICULTY;
    }

    function setGomokuUserDifficulty(userId, key) {
        if (!userId) {
            return GOMOKU_DEFAULT_DIFFICULTY;
        }
        const normalized = normalizeGomokuDifficulty(key);
        gomokuPreferredDifficulty.set(userId.toString(), normalized);
        return normalized;
    }

    function buildGomokuSizeKeyboard(lang = defaultLang, difficulty = GOMOKU_DEFAULT_DIFFICULTY) {
        const presets = [
            { cols: 8, rows: 8 },
            { cols: 8, rows: 9 },
            { cols: 8, rows: 10 },
            { cols: 8, rows: 11 },
            { cols: 8, rows: 12 }
        ];
        const inline_keyboard = [];
        const diffRow = GOMOKU_DIFFICULTIES.map((item) => ({
            text: item.key === difficulty ? `✅ ${t(lang, item.labelKey)}` : t(lang, item.labelKey),
            callback_data: `random|gomoku_level|${item.key}`
        }));
        inline_keyboard.push(diffRow);
        const row = [];
        presets.forEach((dim) => {
            row.push({
                text: `${dim.cols}x${dim.rows}`,
                callback_data: `random|gomoku_size|${dim.cols}|${dim.rows}`
            });
        });
        inline_keyboard.push(row);
        inline_keyboard.push([{ text: t(lang, 'random_gomoku_custom_button'), callback_data: 'random|gomoku_custom' }]);
        inline_keyboard.push([{ text: t(lang, 'random_back'), callback_data: 'random|back' }]);
        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'random|close' }]);
        return { inline_keyboard };
    }

    function formatGomokuPlayerLabel(player, lang = defaultLang) {
        if (!player) {
            return t(lang, 'random_gomoku_waiting');
        }
        const fullName = [player.first_name, player.last_name].filter(Boolean).join(' ') || player.username || 'N/A';
        return fullName;
    }

    function renderGomokuText(session, statusText = '') {
        const playerX = escapeHtml(formatGomokuPlayerLabel(session.playerX, session.lang));
        const playerO = escapeHtml(formatGomokuPlayerLabel(session.playerO, session.lang));
        const lines = [
            t(session.lang, 'random_gomoku_title', { size: `${session.cols}x${session.rows}` }),
            t(session.lang, 'random_gomoku_player_x', { player: playerX }),
            t(session.lang, 'random_gomoku_player_o', { player: playerO })
        ];
        if (session.autoBot) {
            const levelLabel = escapeHtml(getGomokuDifficultyLabel(session.lang, session.botDifficulty || GOMOKU_DEFAULT_DIFFICULTY));
            const botName = escapeHtml(session.botProfile?.first_name || t(session.lang, 'random_gomoku_bot'));
            lines.push(t(session.lang, 'random_gomoku_level_label', { level: levelLabel }));
            lines.push(t(session.lang, 'random_gomoku_bot_info', { bot: botName, level: levelLabel }));
        }
        if (session.cappedNotice) {
            lines.push(session.cappedNotice);
        }

        let statusLine = statusText;
        if (!statusLine) {
            if (session.status === 'won') {
                const winnerLabel = session.winnerName || (session.winnerSymbol === 'X' ? playerX : playerO);
                const symbol = session.winnerSymbol === 'X' ? '❌' : '⭕';
                statusLine = t(session.lang, 'random_gomoku_won', { player: winnerLabel, symbol });
            } else if (session.status === 'draw') {
                statusLine = t(session.lang, 'random_gomoku_draw');
            } else {
                const turnPlayer = session.turn === 'X' ? playerX : playerO;
                const symbol = session.turn === 'X' ? '❌' : '⭕';
                statusLine = t(session.lang, 'random_gomoku_turn', { player: turnPlayer, symbol });
            }
        }

        lines.push('', statusLine, t(session.lang, 'random_gomoku_moves', { moves: session.moves }));
        return lines.filter(Boolean).join('\n');
    }

    function buildGomokuKeyboard(session) {
        const inline_keyboard = [];
        for (let row = 0; row < session.rows; row += 1) {
            const buttons = [];
            for (let col = 0; col < session.cols; col += 1) {
                const idx = row * session.cols + col;
                const cell = session.board[idx];
                let label = '.';
                if (cell === 'X') {
                    label = '❌';
                } else if (cell === 'O') {
                    label = '⭕';
                }
                buttons.push({
                    text: label,
                    callback_data: `random|gomoku_pick|${session.token}|${idx}`
                });
            }
            inline_keyboard.push(buttons);
        }
        return { inline_keyboard };
    }

    function storeGomokuSession(session) {
        gomokuSessions.set(session.token, session);
    }

    function getGomokuSession(token) {
        const session = gomokuSessions.get(token);
        if (!session) {
            return null;
        }
        if (Date.now() - session.createdAt > GOMOKU_TTL_MS) {
            gomokuSessions.delete(token);
            return null;
        }
        return session;
    }

    function createGomokuGame(lang = defaultLang, sizeInput = GOMOKU_DEFAULT_SIZE, creator = null, options = {}) {
        const { chatType = null, botLabel = null, difficulty = GOMOKU_DEFAULT_DIFFICULTY } = options || {};
        const autoBot = chatType === 'private';
        const botName = botLabel || t(lang || defaultLang, 'random_gomoku_bot');
        const botProfile = autoBot
            ? { id: 'bot', first_name: botName, last_name: '', username: '' }
            : null;
        const sizeInputRows = options?.rowsOverride || sizeInput?.rows || sizeInput;
        const sizeInputCols = options?.colsOverride || sizeInput?.cols || GOMOKU_DEFAULT_COLS;
        const sizeInfo = normalizeGomokuSize(sizeInputRows, sizeInputCols);
        const token = createShortToken('gom');
        const playerProfile = creator
            ? {
                id: creator.id?.toString() || creator.id,
                first_name: creator.first_name,
                last_name: creator.last_name,
                username: creator.username
            }
            : null;
        const session = {
            token,
            lang: lang || defaultLang,
            board: Array.from({ length: sizeInfo.rows * sizeInfo.cols }, () => ''),
            rows: sizeInfo.rows,
            cols: sizeInfo.cols,
            playerX: playerProfile,
            playerO: botProfile,
            turn: 'X',
            moves: 0,
            status: 'playing',
            winnerSymbol: null,
            winnerName: null,
            autoBot,
            botProfile,
            botDifficulty: normalizeGomokuDifficulty(difficulty),
            cappedNotice: sizeInfo.capped ? t(lang || defaultLang, 'random_gomoku_size_capped', { size: `${sizeInfo.cols}x${sizeInfo.rows}` }) : '',
            createdAt: Date.now()
        };
        storeGomokuSession(session);
        return {
            token,
            text: renderGomokuText(session),
            reply_markup: buildGomokuKeyboard(session),
            playerX: session.playerX,
            playerO: session.playerO
        };
    }

    function checkGomokuWin(board, cols, rows, index, symbol) {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const directions = [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1]
        ];

        const countInDirection = (dx, dy) => {
            let r = row + dy;
            let c = col + dx;
            let count = 0;
            while (r >= 0 && r < rows && c >= 0 && c < cols) {
                if (board[r * cols + c] !== symbol) {
                    break;
                }
                count += 1;
                r += dy;
                c += dx;
            }
            return count;
        };

        return directions.some(([dx, dy]) => {
            const total = 1 + countInDirection(dx, dy) + countInDirection(-dx, -dy);
            return total >= 5;
        });
    }

    function hasGomokuWin(board, cols, rows, symbol) {
        const directions = [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1]
        ];
        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const idx = row * cols + col;
                if (board[idx] !== symbol) {
                    continue;
                }
                for (const [dx, dy] of directions) {
                    let count = 0;
                    let r = row;
                    let c = col;
                    while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === symbol) {
                        count += 1;
                        if (count >= 5) {
                            return true;
                        }
                        r += dy;
                        c += dx;
                    }
                }
            }
        }
        return false;
    }

    function getGomokuCandidateMoves(board, cols, rows) {
        const occupied = [];
        board.forEach((cell, idx) => {
            if (cell) {
                occupied.push(idx);
            }
        });
        if (!occupied.length) {
            const centerRow = Math.floor(rows / 2);
            const centerCol = Math.floor(cols / 2);
            return [centerRow * cols + centerCol];
        }
        const candidates = new Set();
        occupied.forEach((idx) => {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            for (let dr = -1; dr <= 1; dr += 1) {
                for (let dc = -1; dc <= 1; dc += 1) {
                    if (dr === 0 && dc === 0) {
                        continue;
                    }
                    const r = row + dr;
                    const c = col + dc;
                    if (r >= 0 && r < rows && c >= 0 && c < cols) {
                        const nIdx = r * cols + c;
                        if (!board[nIdx]) {
                            candidates.add(nIdx);
                        }
                    }
                }
            }
        });
        const centerRow = Math.floor(rows / 2);
        const centerCol = Math.floor(cols / 2);
        const ordered = Array.from(candidates).sort((a, b) => {
            const ar = Math.floor(a / cols) - centerRow;
            const ac = (a % cols) - centerCol;
            const br = Math.floor(b / cols) - centerRow;
            const bc = (b % cols) - centerCol;
            return (ar * ar + ac * ac) - (br * br + bc * bc);
        });
        return ordered.slice(0, 32);
    }

    function scoreRun(length, openEnds) {
        if (length >= 5) {
            return 1_000_000_000;
        }
        if (length === 4) {
            return openEnds === 2 ? 100_000 : 30_000;
        }
        if (length === 3) {
            return openEnds === 2 ? 5_000 : 800;
        }
        if (length === 2) {
            return openEnds === 2 ? 200 : 50;
        }
        if (length === 1) {
            return openEnds === 2 ? 20 : 5;
        }
        return 0;
    }

    function evaluateGomokuBoard(board, cols, rows, botSymbol = 'O', oppSymbol = 'X') {
        const directions = [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1]
        ];
        const evaluateForSymbol = (symbol) => {
            let score = 0;
            for (let row = 0; row < rows; row += 1) {
                for (let col = 0; col < cols; col += 1) {
                    const idx = row * cols + col;
                    if (board[idx] !== symbol) {
                        continue;
                    }
                    for (const [dx, dy] of directions) {
                        const prevRow = row - dy;
                        const prevCol = col - dx;
                        if (prevRow >= 0 && prevRow < rows && prevCol >= 0 && prevCol < cols && board[prevRow * cols + prevCol] === symbol) {
                            continue;
                        }
                        let length = 0;
                        let r = row;
                        let c = col;
                        while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === symbol) {
                            length += 1;
                            r += dy;
                            c += dx;
                        }
                        const nextRow = r;
                        const nextCol = c;
                        let openEnds = 0;
                        if (prevRow >= 0 && prevRow < rows && prevCol >= 0 && prevCol < cols && !board[prevRow * cols + prevCol]) {
                            openEnds += 1;
                        }
                        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols && !board[nextRow * cols + nextCol]) {
                            openEnds += 1;
                        }
                        score += scoreRun(length, openEnds);
                    }
                }
            }
            return score;
        };
        const botScore = evaluateForSymbol(botSymbol);
        const oppScore = evaluateForSymbol(oppSymbol);
        // center control bonus
        const centerRow = Math.floor(rows / 2);
        const centerCol = Math.floor(cols / 2);
        let centerScore = 0;
        board.forEach((cell, idx) => {
            if (!cell) return;
            const r = Math.floor(idx / cols) - centerRow;
            const c = (idx % cols) - centerCol;
            const dist = Math.abs(r) + Math.abs(c);
            const bonus = Math.max(0, 6 - dist);
            if (cell === botSymbol) {
                centerScore += bonus;
            } else if (cell === oppSymbol) {
                centerScore -= bonus;
            }
        });
        return botScore - oppScore + centerScore;
    }

    function minimaxGomoku(board, cols, rows, depth, maximizing, botSymbol, oppSymbol, alpha, beta, useAlphaBeta) {
        if (depth === 0 || hasGomokuWin(board, cols, rows, botSymbol) || hasGomokuWin(board, cols, rows, oppSymbol)) {
            return { score: evaluateGomokuBoard(board, cols, rows, botSymbol, oppSymbol), move: null };
        }
        const moves = getGomokuCandidateMoves(board, cols, rows);
        if (!moves.length) {
            return { score: 0, move: null };
        }
        let bestMove = null;
        if (maximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                board[move] = botSymbol;
                const result = minimaxGomoku(board, cols, rows, depth - 1, false, botSymbol, oppSymbol, alpha, beta, useAlphaBeta);
                board[move] = '';
                if (result.score > maxEval) {
                    maxEval = result.score;
                    bestMove = move;
                }
                alpha = Math.max(alpha, result.score);
                if (useAlphaBeta && beta <= alpha) {
                    break;
                }
            }
            return { score: maxEval, move: bestMove };
        }
        let minEval = Infinity;
        for (const move of moves) {
            board[move] = oppSymbol;
            const result = minimaxGomoku(board, cols, rows, depth - 1, true, botSymbol, oppSymbol, alpha, beta, useAlphaBeta);
            board[move] = '';
            if (result.score < minEval) {
                minEval = result.score;
                bestMove = move;
            }
            beta = Math.min(beta, result.score);
            if (useAlphaBeta && beta <= alpha) {
                break;
            }
        }
        return { score: minEval, move: bestMove };
    }

    function findImmediateMove(board, cols, rows, symbol) {
        const candidates = getGomokuCandidateMoves(board, cols, rows);
        for (const idx of candidates) {
            board[idx] = symbol;
            const win = hasGomokuWin(board, cols, rows, symbol);
            board[idx] = '';
            if (win) {
                return idx;
            }
        }
        return null;
    }

    function chooseGomokuBotMove(session) {
        const botSymbol = 'O';
        const oppSymbol = 'X';
        const difficulty = session.botDifficulty || GOMOKU_DEFAULT_DIFFICULTY;
        const candidates = getGomokuCandidateMoves(session.board, session.cols, session.rows);
        if (!candidates.length) {
            return null;
        }

        const winning = findImmediateMove(session.board, session.cols, session.rows, botSymbol);
        if (winning !== null) {
            return winning;
        }
        const blocking = findImmediateMove(session.board, session.cols, session.rows, oppSymbol);
        if (blocking !== null) {
            return blocking;
        }

        if (difficulty === 'easy') {
            let bestMove = candidates[0];
            let bestScore = -Infinity;
            candidates.forEach((idx) => {
                session.board[idx] = botSymbol;
                const score = evaluateGomokuBoard(session.board, session.cols, session.rows, botSymbol, oppSymbol);
                session.board[idx] = '';
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = idx;
                }
            });
            return bestMove;
        }

        const diffDef = GOMOKU_DIFFICULTIES.find((d) => d.key === difficulty) || GOMOKU_DIFFICULTIES[1];
        const sizeFactor = session.rows <= 8 ? 2 : session.rows <= 9 ? 1 : session.rows <= 10 ? 0 : -1;
        const depth = Math.max(1, Math.min((diffDef.baseDepth || 0) + sizeFactor, 4));
        const useAlphaBeta = diffDef.alphaBeta;
        const result = minimaxGomoku(session.board, session.cols, session.rows, depth, true, botSymbol, oppSymbol, -Infinity, Infinity, useAlphaBeta);
        if (result.move !== null && result.move !== undefined) {
            return result.move;
        }
        const fallbackIndex = Math.floor(Math.random() * candidates.length);
        return candidates[fallbackIndex];
    }

    function handleGomokuPick(token, index, user, lang = defaultLang) {
        const session = getGomokuSession(token);
        if (!session) {
            return { status: 'expired' };
        }
        if (session.status === 'won' || session.status === 'draw') {
            return {
                status: 'finished',
                text: renderGomokuText(session),
                reply_markup: buildGomokuKeyboard(session)
            };
        }
        const idx = Number.parseInt(index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= session.board.length) {
            return { status: 'invalid' };
        }

        const userId = user?.id?.toString() || null;
        const profile = user
            ? {
                id: userId,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username
            }
            : null;

        if (!session.playerX) {
            session.playerX = profile;
        }

        let userSymbol = session.playerX?.id === userId ? 'X' : session.playerO?.id === userId ? 'O' : null;
        if (!userSymbol && session.playerO === null) {
            session.playerO = profile;
            userSymbol = 'O';
        }

        if (session.autoBot && userSymbol !== 'X') {
            return {
                status: 'not_player',
                text: renderGomokuText(session),
                reply_markup: buildGomokuKeyboard(session)
            };
        }

        if (!userSymbol) {
            return {
                status: 'not_player',
                text: renderGomokuText(session),
                reply_markup: buildGomokuKeyboard(session)
            };
        }

        if (session.turn !== userSymbol) {
            return {
                status: 'not_turn',
                text: renderGomokuText(session),
                reply_markup: buildGomokuKeyboard(session)
            };
        }

        if (session.board[idx]) {
            return {
                status: 'occupied',
                text: renderGomokuText(session),
                reply_markup: buildGomokuKeyboard(session)
            };
        }

        session.board[idx] = userSymbol;
        session.moves += 1;

        let status = 'playing';
        let statusText = '';

        if (checkGomokuWin(session.board, session.cols, session.rows, idx, userSymbol)) {
            const winnerLabel = formatGomokuPlayerLabel(userSymbol === 'X' ? session.playerX : session.playerO, session.lang);
            session.status = 'won';
            session.winnerSymbol = userSymbol;
            session.winnerName = escapeHtml(winnerLabel);
            status = 'won';
            statusText = t(session.lang, 'random_gomoku_won', {
                player: escapeHtml(winnerLabel),
                symbol: userSymbol === 'X' ? '❌' : '⭕'
            });
        } else if (session.moves >= session.rows * session.cols) {
            session.status = 'draw';
            status = 'draw';
            statusText = t(session.lang, 'random_gomoku_draw');
        } else {
            session.turn = userSymbol === 'X' ? 'O' : 'X';

            if (session.autoBot && session.turn === 'O') {
                const botMove = chooseGomokuBotMove(session);
                if (botMove !== null) {
                    session.board[botMove] = 'O';
                    session.moves += 1;
                    if (checkGomokuWin(session.board, session.cols, session.rows, botMove, 'O')) {
                        const winnerLabel = formatGomokuPlayerLabel(session.botProfile, session.lang);
                        session.status = 'won';
                        session.winnerSymbol = 'O';
                        session.winnerName = escapeHtml(winnerLabel);
                        status = 'won';
                        statusText = t(session.lang, 'random_gomoku_won', { player: escapeHtml(winnerLabel), symbol: '⭕' });
                    } else if (session.moves >= session.rows * session.cols) {
                        session.status = 'draw';
                        status = 'draw';
                        statusText = t(session.lang, 'random_gomoku_draw');
                    } else {
                        session.turn = 'X';
                    }
                }
            }
        }

        storeGomokuSession(session);

        const opponent = userSymbol === 'X' ? session.playerO : session.playerX;
        return {
            status,
            text: renderGomokuText(session, statusText),
            reply_markup: buildGomokuKeyboard(session),
            opponent
        };
    }

    function createInitialChessBoard() {
        return [
            'bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR',
            'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP',
            null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null,
            'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP',
            'wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'
        ];
    }

    function formatChessSquare(index) {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const file = String.fromCharCode(97 + col);
        const rank = 8 - row;
        return `${file}${rank}`;
    }

    function chessCharWidth(ch) {
        const code = ch.codePointAt(0);
        if (code === undefined) return 0;
        if (
            code >= 0x1100
            && (
                code <= 0x115f
                || code === 0x2329
                || code === 0x232a
                || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
                || (code >= 0xac00 && code <= 0xd7a3)
                || (code >= 0xf900 && code <= 0xfaff)
                || (code >= 0xfe10 && code <= 0xfe19)
                || (code >= 0xfe30 && code <= 0xfe6f)
                || (code >= 0xff00 && code <= 0xff60)
                || (code >= 0xffe0 && code <= 0xffe6)
                || (code >= 0x1f300 && code <= 0x1f64f)
                || (code >= 0x1f900 && code <= 0x1f9ff)
                || (code >= 0x20000 && code <= 0x3fffd)
            )
        ) {
            return 2;
        }
        return 1;
    }

    function chessDisplayWidth(text) {
        let width = 0;
        for (const ch of String(text || '')) {
            width += chessCharWidth(ch);
        }
        return width;
    }

    function truncateChessText(text, limit) {
        const raw = String(text || '');
        if (!limit) return raw;
        const fullWidth = chessDisplayWidth(raw);
        if (fullWidth <= limit) return raw;
        const ellipsis = '...';
        const ellipsisWidth = chessDisplayWidth(ellipsis);
        if (limit <= ellipsisWidth) {
            let cut = '';
            let used = 0;
            for (const ch of raw) {
                const w = chessCharWidth(ch);
                if (used + w > limit) break;
                cut += ch;
                used += w;
                if (used >= limit) break;
            }
            return cut;
        }
        const allowed = limit - ellipsisWidth;
        let result = '';
        let used = 0;
        for (const ch of raw) {
            const w = chessCharWidth(ch);
            if (used + w > allowed) break;
            result += ch;
            used += w;
        }
        return `${result}${ellipsis}`;
    }

    function buildChessInfoTable(session) {
        const lang = session.lang;
        const COL_WIDTHS = [6, 18, 14];
        const headers = [
            t(lang, 'random_chess_table_color'),
            t(lang, 'random_chess_table_player'),
            t(lang, 'random_chess_table_captured')
        ];
        const capWhite = session.capturedWhite && session.capturedWhite.length ? session.capturedWhite.join(' ') : t(lang, 'random_chess_none');
        const capBlack = session.capturedBlack && session.capturedBlack.length ? session.capturedBlack.join(' ') : t(lang, 'random_chess_none');
        const rows = [
            [getChessColorLabel(lang, 'w'), formatChessPlayerName(session.playerWhite, { maxLength: null, escape: false }), capWhite],
            [getChessColorLabel(lang, 'b'), session.playerBlack ? formatChessPlayerName(session.playerBlack, { maxLength: null, escape: false }) : t(lang, 'random_chess_waiting_opponent'), capBlack]
        ];
        const colWidths = COL_WIDTHS;
        const pad = (text, width) => {
            const raw = String(text || '');
            const diff = width - chessDisplayWidth(raw);
            return diff > 0 ? raw + ' '.repeat(diff) : raw;
        };
        const buildBorder = (left, mid, right) => left + colWidths.map((w) => '═'.repeat(w + 2)).join(mid) + right;
        const lines = [];
        lines.push(buildBorder('╔', '╦', '╗'));
        lines.push(
            '║ ' +
            headers.map((col, idx) => pad(col, colWidths[idx])).join(' ║ ') +
            ' ║'
        );
        lines.push(buildBorder('╠', '╬', '╣'));
        rows.forEach((row, rowIdx) => {
            lines.push(
                '║ ' +
                row.map((col, idx) => pad(col, colWidths[idx])).join(' ║ ') +
                ' ║'
            );
            if (rowIdx === rows.length - 1) {
                lines.push(buildBorder('╚', '╩', '╝'));
            } else {
                lines.push(buildBorder('╠', '╬', '╣'));
            }
        });
        return `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
    }

    function resolveChessLangCode(lang) {
        const code = (lang || defaultLang || 'en').toLowerCase();
        if (CHESS_PIECE_LABELS[code]) return code;
        const short = code.split(/[-_]/)[0];
        return CHESS_PIECE_LABELS[short] ? short : 'en';
    }

    function describeChessPiece(lang, piece) {
        const type = piece?.[1];
        if (!type) return '?';
        const labels = CHESS_PIECE_LABELS[resolveChessLangCode(lang)];
        return labels[type] || type;
    }

    function getChessColorLabel(lang, color) {
        return color === 'w'
            ? t(lang, 'random_chess_color_white')
            : t(lang, 'random_chess_color_black');
    }

    function formatChessPlayerName(player, { maxLength = null, escape = true } = {}) {
        const base = [player?.first_name, player?.last_name].filter(Boolean).join(' ') || player?.username || 'N/A';
        const trimmed = maxLength ? truncateChessText(base, maxLength) : base;
        return escape ? escapeHtml(trimmed) : trimmed;
    }

    function formatChessPlayerLabel(player, { maxLength = null, escape = true } = {}) {
        const baseName = formatChessPlayerName(player, { maxLength: null, escape: false });
        const usernameRaw = player?.username ? `@${player.username}` : '';
        let labelRaw = usernameRaw ? `${baseName} (${usernameRaw})` : baseName;
        const trimmed = maxLength ? truncateChessText(labelRaw, maxLength) : labelRaw;
        return escape ? escapeHtml(trimmed) : trimmed;
    }

    function buildChessKeyboard(session) {
        const inline_keyboard = [];
        if (session.mode === 'pvp' && !session.playerBlack) {
            inline_keyboard.push([{
                text: t(session.lang, 'random_chess_join_button'),
                callback_data: `random|chess_join|${session.token}`
            }]);
        }
        for (let row = 0; row < 8; row += 1) {
            const buttons = [];
            for (let col = 0; col < 8; col += 1) {
                const idx = row * 8 + col;
                const piece = session.board[idx];
                const selected = session.pendingFrom === idx;
                const baseIcon = piece ? (CHESS_PIECE_SYMBOLS[piece] || '?') : '';
                const label = piece
                    ? (selected ? `[${baseIcon}]` : (CHESS_PIECE_ICONS[piece] || baseIcon || '?'))
                    : CHESS_PIECE_ICONS.empty;
                buttons.push({
                    text: label,
                    callback_data: `random|chess_pick|${session.token}|${idx}`
                });
            }
            inline_keyboard.push(buttons);
        }
        return { inline_keyboard };
    }

    function clearChessTurnTimer(session) {
        if (session?.turnTimer) {
            clearTimeout(session.turnTimer);
            session.turnTimer = null;
        }
    }

    function scheduleChessTurnTimer(session) {
        clearChessTurnTimer(session);
        if (!session || session.status !== 'playing') {
            return;
        }
        if (session.mode === 'pvp' && !session.playerBlack) {
            return;
        }
        if (!session.messageChatId || !session.messageId) {
            return;
        }
        const token = session.token;
        const expectedTurn = session.turn;
        const deadline = session.turnDeadline || (Date.now() + CHESS_TURN_MS);
        session.turnDeadline = deadline;
        session.turnTimer = setTimeout(async () => {
            const liveSession = getChessSession(token);
            if (!liveSession || liveSession.status !== 'playing') {
                return;
            }
            if (liveSession.turn !== expectedTurn) {
                return;
            }
            if (liveSession.turnDeadline && Date.now() < liveSession.turnDeadline - 250) {
                return;
            }
            const loserColor = liveSession.turn;
            const winnerColor = loserColor === 'w' ? 'b' : 'w';
            liveSession.status = winnerColor === 'w' ? 'white_won' : 'black_won';
            liveSession.lastMove = t(liveSession.lang, 'random_chess_timeout_forfeit', {
                color: getChessColorLabel(liveSession.lang, loserColor)
            });
            liveSession.pendingFrom = null;
            liveSession.turnDeadline = null;
            clearChessTurnTimer(liveSession);
            storeChessSession(liveSession);
            try {
                await bot.editMessageText(renderChessText(liveSession), {
                    chat_id: liveSession.messageChatId,
                    message_id: liveSession.messageId,
                    parse_mode: 'HTML',
                    reply_markup: buildChessKeyboard(liveSession)
                });
            } catch (error) {
                // ignore timeout edit errors
            }
        }, Math.max(0, deadline - Date.now() + 50));
    }

    function setChessMessageContext(token, chatId, messageId) {
        const session = getChessSession(token);
        if (!session) return false;
        session.messageChatId = chatId;
        session.messageId = messageId;
        if (session.status === 'playing') {
            if (!session.turnDeadline) {
                session.turnDeadline = Date.now() + CHESS_TURN_MS;
            }
            scheduleChessTurnTimer(session);
        }
        storeChessSession(session);
        return true;
    }

    function storeChessSession(session) {
        chessSessions.set(session.token, session);
    }

    function getChessSession(token) {
        const session = chessSessions.get(token);
        if (!session) {
            return null;
        }
        if (Date.now() - session.createdAt > CHESS_TTL_MS) {
            clearChessTurnTimer(session);
            chessSessions.delete(token);
            return null;
        }
        return session;
    }

    function generateSlidingMoves(board, index, color, deltas) {
        const moves = [];
        const startRow = Math.floor(index / 8);
        const startCol = index % 8;
        deltas.forEach(([dRow, dCol]) => {
            let row = startRow + dRow;
            let col = startCol + dCol;
            while (row >= 0 && row < 8 && col >= 0 && col < 8) {
                const idx = row * 8 + col;
                const target = board[idx];
                if (!target) {
                    moves.push(idx);
                } else {
                    if (target[0] !== color) {
                        moves.push(idx);
                    }
                    break;
                }
                row += dRow;
                col += dCol;
            }
        });
        return moves;
    }

    function generateKnightMoves(board, index, color) {
        const deltas = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        const row = Math.floor(index / 8);
        const col = index % 8;
        const moves = [];
        deltas.forEach(([dRow, dCol]) => {
            const r = row + dRow;
            const c = col + dCol;
            if (r < 0 || r >= 8 || c < 0 || c >= 8) {
                return;
            }
            const idx = r * 8 + c;
            const target = board[idx];
            if (!target || target[0] !== color) {
                moves.push(idx);
            }
        });
        return moves;
    }

    function generatePawnMoves(board, index, color) {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const dir = color === 'w' ? -1 : 1;
        const moves = [];
        const oneStepRow = row + dir;
        if (oneStepRow >= 0 && oneStepRow < 8) {
            const forwardIdx = oneStepRow * 8 + col;
            if (!board[forwardIdx]) {
                moves.push(forwardIdx);
                const startingRow = color === 'w' ? 6 : 1;
                const twoStepRow = row + dir * 2;
                const twoStepIdx = twoStepRow * 8 + col;
                if (row === startingRow && !board[twoStepIdx]) {
                    moves.push(twoStepIdx);
                }
            }
        }
        const captureCols = [col - 1, col + 1];
        captureCols.forEach((captureCol) => {
            const captureRow = row + dir;
            if (captureRow < 0 || captureRow >= 8 || captureCol < 0 || captureCol >= 8) {
                return;
            }
            const idx = captureRow * 8 + captureCol;
            const target = board[idx];
            if (target && target[0] !== color) {
                moves.push(idx);
            }
        });
        return moves;
    }

    function generateKingMoves(board, index, color) {
        const moves = [];
        const row = Math.floor(index / 8);
        const col = index % 8;
        for (let dRow = -1; dRow <= 1; dRow += 1) {
            for (let dCol = -1; dCol <= 1; dCol += 1) {
                if (dRow === 0 && dCol === 0) continue;
                const r = row + dRow;
                const c = col + dCol;
                if (r < 0 || r >= 8 || c < 0 || c >= 8) continue;
                const idx = r * 8 + c;
                const target = board[idx];
                if (!target || target[0] !== color) {
                    moves.push(idx);
                }
            }
        }
        return moves;
    }

    function listChessMoves(board, color) {
        const moves = [];
        for (let idx = 0; idx < board.length; idx += 1) {
            const piece = board[idx];
            if (!piece || piece[0] !== color) continue;
            const type = piece[1];
            let targets = [];
            if (type === 'P') {
                targets = generatePawnMoves(board, idx, color);
            } else if (type === 'N') {
                targets = generateKnightMoves(board, idx, color);
            } else if (type === 'B') {
                targets = generateSlidingMoves(board, idx, color, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
            } else if (type === 'R') {
                targets = generateSlidingMoves(board, idx, color, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
            } else if (type === 'Q') {
                targets = generateSlidingMoves(board, idx, color, [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);
            } else if (type === 'K') {
                targets = generateKingMoves(board, idx, color);
            }
            targets.forEach((to) => moves.push({ from: idx, to }));
        }
        return moves;
    }

    function isChessMoveLegal(board, from, to, color) {
        const piece = board[from];
        if (!piece || piece[0] !== color) {
            return false;
        }
        const legalMoves = listChessMoves(board, color);
        return legalMoves.some((move) => move.from === from && move.to === to);
    }

    function applyChessMove(board, from, to) {
        const next = board.slice();
        let piece = next[from];
        next[from] = null;
        const destRow = Math.floor(to / 8);
        if (piece === 'wP' && destRow === 0) {
            piece = 'wQ';
        } else if (piece === 'bP' && destRow === 7) {
            piece = 'bQ';
        }
        next[to] = piece;
        return next;
    }

    function renderChessText(session, statusText) {
        const capWhite = session.capturedWhite && session.capturedWhite.length ? session.capturedWhite.join(' ') : t(session.lang, 'random_chess_none');
        const capBlack = session.capturedBlack && session.capturedBlack.length ? session.capturedBlack.join(' ') : t(session.lang, 'random_chess_none');

        const lines = [
            `♟️ ${t(session.lang, 'random_chess_title')}`,
            buildChessInfoTable(session)
        ];
        if (session.lastMove) {
            lines.push(`<b>${t(session.lang, 'random_chess_last_move', { move: session.lastMove })}</b>`);
        }
        if (session.status === 'white_won') {
            lines.push('', t(session.lang, 'random_chess_win_white'));
        } else if (session.status === 'black_won') {
            lines.push('', t(session.lang, 'random_chess_win_black'));
        } else if (session.status === 'draw') {
            lines.push('', t(session.lang, 'random_chess_draw'));
        } else if (session.mode === 'pvp' && !session.playerBlack) {
            lines.push('', t(session.lang, 'random_chess_waiting_opponent'));
        } else {
            const playerLabel = session.turn === 'w' ? formatChessPlayerLabel(session.playerWhite) : formatChessPlayerLabel(session.playerBlack);
            const colorLabel = getChessColorLabel(session.lang, session.turn);
            lines.push('', `<b>${t(session.lang, 'random_chess_turn', { player: playerLabel, color: colorLabel })}</b>`);
            if (session.turnDeadline) {
                const remaining = Math.max(0, Math.ceil((session.turnDeadline - Date.now()) / 1000));
                lines.push(t(session.lang, 'random_chess_turn_timer', { seconds: remaining }));
            }
            if (session.pendingFrom !== null) {
                const piece = session.board[session.pendingFrom];
                const pieceName = describeChessPiece(session.lang, piece);
                const baseIcon = piece ? (CHESS_PIECE_SYMBOLS[piece] || '') : '';
                const pieceIcon = baseIcon ? `[${baseIcon}]` : (CHESS_PIECE_ICONS[piece] || '');
                lines.push(t(session.lang, 'random_chess_selected_piece', {
                    square: formatChessSquare(session.pendingFrom),
                    piece: pieceName,
                    icon: pieceIcon
                }));
            } else {
                lines.push(t(session.lang, 'random_chess_hint'));
            }
        }
        lines.push(
            '',
            t(session.lang, 'random_chess_player_white_info', { player: formatChessPlayerLabel(session.playerWhite) }),
            t(session.lang, 'random_chess_player_black_info', { player: session.playerBlack ? formatChessPlayerLabel(session.playerBlack) : t(session.lang, 'random_chess_waiting_opponent') })
        );
        return lines.join('\n');
    }

    function createChessGame(lang, player, options = {}) {
        const token = createShortToken('chess');
        const mode = options.mode || (options.chatType === 'private' ? 'pve' : 'pvp');
        const forcePvp = options.chatType === 'group' || options.chatType === 'supergroup';
        const resolvedMode = forcePvp ? 'pvp' : mode;
        const session = {
            token,
            lang: lang || defaultLang,
            board: createInitialChessBoard(),
            turn: 'w',
            status: 'playing',
            moveCount: 0,
            pendingFrom: null,
            lastMove: '',
            playerWhite: player ? { ...player, id: player.id?.toString() } : null,
            playerBlack: resolvedMode === 'pve' ? {
                id: 'bot',
                first_name: t(lang, 'random_chess_bot'),
                username: null,
                isBot: true
            } : null,
            capturedWhite: [],
            capturedBlack: [],
            mode: resolvedMode,
            chatType: options.chatType,
            createdAt: Date.now(),
            botProfile: bot?.me || null,
            turnDeadline: resolvedMode === 'pvp' ? null : Date.now() + CHESS_TURN_MS,
            turnTimer: null,
            messageChatId: null,
            messageId: null
        };
        storeChessSession(session);
        return {
            token,
            text: renderChessText(session),
            reply_markup: buildChessKeyboard(session)
        };
    }

    function joinChessGame(token, user) {
        const session = getChessSession(token);
        if (!session) {
            return { error: 'expired' };
        }
        if (session.mode !== 'pvp') {
            return { error: 'not_pvp' };
        }
        if (session.playerBlack) {
            if (session.playerBlack.id === user?.id?.toString()) {
                return { error: 'already_in', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
            }
            return { error: 'taken' };
        }
        if (session.playerWhite?.id === user?.id?.toString()) {
            return { error: 'already_in', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
        }
        session.playerBlack = { ...user, id: user?.id?.toString() };
        session.turnDeadline = Date.now() + CHESS_TURN_MS;
        scheduleChessTurnTimer(session);
        storeChessSession(session);
        return {
            status: 'joined',
            text: renderChessText(session),
            reply_markup: buildChessKeyboard(session)
        };
    }

    function selectBotMove(board, moves) {
        const captureMoves = moves.filter((move) => !!board[move.to]);
        if (captureMoves.length > 0) {
            return captureMoves[Math.floor(Math.random() * captureMoves.length)];
        }
        return moves[Math.floor(Math.random() * moves.length)];
    }

    function formatChessMoveText(boardBefore, from, to, actorLabel, lang, color) {
        const piece = boardBefore[from];
        const icon = CHESS_PIECE_ICONS[piece] || '';
        const pieceName = describeChessPiece(lang, piece);
        const captured = boardBefore[to];
        const capturedName = captured ? describeChessPiece(lang, captured) : null;
        const pieceIcon = CHESS_PIECE_ICONS[piece] || '';
        const capturedIcon = captured ? (CHESS_PIECE_ICONS[captured] || '') : '';
        const actorColorLabel = getChessColorLabel(lang, color);
        const actor = `${actorColorLabel} ${actorLabel}`.trim();
        const fromSquare = formatChessSquare(from);
        const toSquare = formatChessSquare(to);
        if (capturedName) {
            return t(lang, 'random_chess_move_capture', {
                actor,
                piece: pieceName,
                from: fromSquare,
                to: toSquare,
                captured: capturedName,
                icon: pieceIcon,
                captured_icon: capturedIcon
            });
        }
        return t(lang, 'random_chess_move_detail', {
            actor,
            piece: pieceName,
            from: fromSquare,
            to: toSquare,
            icon: pieceIcon
        });
    }

    function handleChessPick(token, user, toIndex) {
        const session = getChessSession(token);
        if (!session) {
            return { error: 'expired' };
        }
        if (session.status !== 'playing') {
            return {
                error: 'finished',
                text: renderChessText(session),
                reply_markup: buildChessKeyboard(session)
            };
        }
        const userId = user?.id?.toString();
        const isWhitePlayer = session.playerWhite?.id === userId;
        const isBlackPlayer = session.playerBlack?.id === userId;
        if (!isWhitePlayer && !isBlackPlayer) {
            return { error: 'not_player', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
        }
        const colorTurn = session.turn;
        const playerColor = isWhitePlayer ? 'w' : 'b';
        if (colorTurn !== playerColor) {
            return { error: 'not_turn', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
        }
        if (session.mode === 'pvp' && !session.playerBlack) {
            return { error: 'need_opponent', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
        }

        const target = session.board[toIndex];
        if (session.pendingFrom === null) {
            if (!target || target[0] !== playerColor) {
                return { error: 'select_piece', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
            }
            session.pendingFrom = toIndex;
            storeChessSession(session);
            return { status: 'select', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
        }

        const fromIndex = session.pendingFrom;
        if (!isChessMoveLegal(session.board, fromIndex, toIndex, playerColor)) {
            session.pendingFrom = null;
            storeChessSession(session);
            return { status: 'reselect', text: renderChessText(session), reply_markup: buildChessKeyboard(session) };
        }

        clearChessTurnTimer(session);
        const boardBeforePlayer = session.board;
        const boardAfterPlayer = applyChessMove(boardBeforePlayer, fromIndex, toIndex);
        session.board = boardAfterPlayer;
        session.pendingFrom = null;
        session.moveCount += 1;
        const actorLabel = formatChessPlayerLabel(playerColor === 'w' ? session.playerWhite : session.playerBlack);
        session.lastMove = formatChessMoveText(boardBeforePlayer, fromIndex, toIndex, actorLabel, session.lang, playerColor);
        const capturedPiece = boardBeforePlayer[toIndex];
        if (capturedPiece) {
            if (playerColor === 'w') {
                session.capturedWhite.unshift(CHESS_PIECE_ICONS[capturedPiece] || capturedPiece);
            } else {
                session.capturedBlack.unshift(CHESS_PIECE_ICONS[capturedPiece] || capturedPiece);
            }
        }

        const opponentColor = playerColor === 'w' ? 'b' : 'w';
        const opponentKing = opponentColor === 'w' ? 'wK' : 'bK';

        if (!session.board.includes(opponentKing)) {
            session.status = playerColor === 'w' ? 'white_won' : 'black_won';
        } else if (session.moveCount >= CHESS_MAX_MOVES) {
            session.status = 'draw';
        }

        if (session.status === 'playing') {
            session.turn = opponentColor;
            if (session.mode === 'pve' && opponentColor === 'b') {
                const botMoves = listChessMoves(session.board, 'b');
                if (!botMoves.length) {
                    session.status = 'draw';
                } else {
                    const botMove = selectBotMove(session.board, botMoves);
                    const boardBeforeBot = session.board;
                const boardAfterBot = applyChessMove(session.board, botMove.from, botMove.to);
                const capturedPiece = boardBeforeBot[botMove.to];
                if (capturedPiece) {
                session.capturedBlack.unshift(CHESS_PIECE_ICONS[capturedPiece] || capturedPiece);
                }
                const botMoveText = formatChessMoveText(boardBeforeBot, botMove.from, botMove.to, t(session.lang, 'random_chess_bot'), session.lang, 'b');
                session.board = boardAfterBot;
                    session.moveCount += 1;
                    session.lastMove = botMoveText;
                    if (!session.board.includes('wK')) {
                        session.status = 'black_won';
                    } else if (session.moveCount >= CHESS_MAX_MOVES) {
                        session.status = 'draw';
                    } else {
                        session.turn = 'w';
                    }
                }
            }
        }

        if (session.status === 'playing') {
            session.turnDeadline = Date.now() + CHESS_TURN_MS;
            scheduleChessTurnTimer(session);
        } else {
            session.turnDeadline = null;
            clearChessTurnTimer(session);
        }

        storeChessSession(session);

        let status = 'playing';
        let toast = null;
        if (session.status === 'white_won') {
            status = 'white_won';
            toast = t(session.lang, 'random_chess_win_white');
        } else if (session.status === 'black_won') {
            status = 'black_won';
            toast = t(session.lang, 'random_chess_win_black');
        } else if (session.status === 'draw') {
            status = 'draw';
            toast = t(session.lang, 'random_chess_draw');
        }

        return {
            status,
            text: renderChessText(session),
            reply_markup: buildChessKeyboard(session),
            toast
        };
    }

    function determineRpsResult(userChoiceKey) {
        const normalized = userChoiceKey?.toLowerCase();
        const userChoice = RANDOM_RPS_CHOICES.find((choice) => choice.key === normalized);
        if (!userChoice) {
            return null;
        }
        const botChoice = RANDOM_RPS_CHOICES[Math.floor(Math.random() * RANDOM_RPS_CHOICES.length)];
        let outcome = 'draw';
        if (userChoice.key !== botChoice.key) {
            outcome = userChoice.beats === botChoice.key ? 'win' : 'lose';
        }
        return { userChoice, botChoice, outcome };
    }

    async function updateRandomMenuMessage(message, lang, { resultText = null, replyMarkup = null } = {}) {
        const chatId = message?.chat?.id;
        const messageId = message?.message_id;
        if (!chatId || !messageId) {
            return;
        }

        const text = buildRandomMenuText(lang, resultText);
        const reply_markup = replyMarkup || buildRandomMenuKeyboard(lang);

        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup
        });
    }

    return {
        RANDOM_MENU_ACTIONS,
        RANDOM_MENU_COMMANDS,
        randomizeTextCase,
        storeRandomQuiz,
        getRandomQuiz,
        clearRandomQuiz,
        generateLongShortOutcome,
        getRandomInt,
        parseDiceNotation,
        rollDice,
        renderDieFaceArt,
        buildDiceArt,
        formatDiceDetail,
        formatRollContext,
        stripHtmlTags,
        buildRandomResultKeyboard,
        formatExecutionAudit,
        pickRandomFortune,
        buildRandomMenuKeyboard,
        buildRandomMenuText,
        buildRpsKeyboard,
        buildTruthKeyboard,
        buildFortuneKeyboard,
        buildQuizKeyboard,
        buildMemoryThemeKeyboard,
        getMemoryThemeLabel,
        parseMemorySizeInput,
        buildMemorySizeKeyboard,
        createMemoryGame,
        handleMemoryPick,
        buildMinesweeperSizeKeyboard,
        createMinesweeperGame,
        handleMinesweeperPick,
        toggleMinesweeperFlagMode,
        replayMinesweeperGame,
        parseSudokuSizeInput,
        buildSudokuSizeKeyboard,
        createSudokuGame,
        handleSudokuPick,
        handleSudokuSetNumber,
        handleSudokuClear,
        getGomokuUserDifficulty,
        setGomokuUserDifficulty,
        getGomokuDifficultyLabel,
        parseGomokuSizeInput,
        buildGomokuSizeKeyboard,
        createGomokuGame,
        handleGomokuPick,
        createChessGame,
        handleChessPick,
        joinChessGame,
        setChessMessageContext,
        parseTreasureSizeInput,
        buildTreasureSizeKeyboard,
        createTreasureGame,
        handleTreasurePick,
        determineRpsResult,
        updateRandomMenuMessage
    };
}

module.exports = { createRandomFeature };
