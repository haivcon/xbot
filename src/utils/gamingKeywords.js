/**
 * Gaming keywords for auto-detection across all supported languages
 */

const GAMING_KEYWORDS = [
    // Dice / Xúc xắc
    'dice', 'tung', 'xúc xắc', 'xuc xac', 'roll', '骰子', '주사위', 'костей', 'dadu',
    'd6', 'd20', '2d6', '3d6',

    // Rock Paper Scissors / Oẳn tù tì
    'rps', 'oẳn tù tì', 'oan tu ti', 'rock paper scissors', 'búa bao kéo', 'bua bao keo',
    'búa', 'bao', 'kéo', 'rock', 'paper', 'scissors',
    '石头剪刀布', '가위바위보', 'камень ножницы бумага', 'gunting batu kertas',

    // Random / Ngẫu nhiên
    'random', 'ngẫu nhiên', 'ngau nhien', 'số ngẫu nhiên', 'so ngau nhien',
    '随机', '랜덤', 'случайный', 'acak',

    // Long/Short
    'long', 'short', 'longshort', 'trade', 'leverage',

    // Choice / Lựa chọn
    'choice', 'chọn', 'chon', 'lựa chọn', 'lua chon', 'pick',
    '选择', '선택', 'выбор', 'pilih',

    // Fortune / Bói toán
    'fortune', 'bói', 'boi', 'bói toán', 'boi toan', '运势', '점', 'гадание', 'ramalan',

    // Quiz
    'quiz', 'câu hỏi', 'cau hoi', '问题', '퀴즈', 'викторина', 'kuis',

    // Memory game
    'memory', 'trí nhớ', 'tri nho', 'lật thẻ', 'lat the', '记忆', '메모리', 'память', 'memori',

    // Minesweeper / Dò mìn
    'mine', 'minesweeper', 'dò mìn', 'do min', '扫雷', '지뢰', 'сапер', 'ranjau',

    // Treasure / Kho báu
    'treasure', 'kho báu', 'kho bau', 'hunt', '宝藏', '보물', 'сокровище', 'harta',

    // Sudoku
    'sudoku', '数独', '스도쿠', 'судоку',

    // Gomoku / Cờ caro
    'gomoku', 'cờ caro', 'co caro', 'caro', '五子棋', '오목', 'гомоку',

    // Chess / Cờ vua
    'chess', 'cờ vua', 'co vua', '国际象棋', '체스', 'шахматы', 'catur',

    // General gaming words
    'chơi', 'choi', 'play', 'game', 'trò chơi', 'tro choi',
    '玩', '游戏', '놀이', '게임', 'играть', 'игра', 'main', 'permainan',

    // Bot identity questions
    'bạn là ai', 'ban la ai', 'who are you', 'what are you',
    '你是谁', '당신은 누구', 'кто ты', 'siapa kamu',
    'giới thiệu', 'gioi thieu', 'introduce', 'about you'
];

/**
 * Gaming intent keywords - 15+ languages
 */
const GAMING_INTENT_KEYWORDS = [
    'play', 'game', 'gaming', 'let\'s play',
    'chơi', 'trò chơi', 'choi', 'tro choi',
    '玩', '游戏', '玩游戏',
    '놀이', '게임', '놀다',
    'играть', 'игра', 'играем',
    'main', 'permainan', 'bermain',
    'jugar', 'juego', 'jugamos', 'partida',
    'giocare', 'gioco', 'giochiamo', 'partita',
    'jouer', 'jeu', 'jouons', 'partie',
    'jogar', 'jogo', 'jogamos', 'partida',
    'spielen', 'spiel', 'spielen wir',
    '遊ぶ', 'ゲーム', '遊びましょう',
    'لعب', 'लعبة',
    'खेलना', 'खेल',
    'เล่น', 'เกม'
];

function hasGamingIntent(text) {
    if (!text || typeof text !== 'string') return false;
    const lowerText = text.toLowerCase().trim();
    return GAMING_INTENT_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

function containsGamingKeyword(text) {
    if (!text || typeof text !== 'string') return false;
    const lowerText = text.toLowerCase().trim();
    return GAMING_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Extract @mention from group message
 * FIXED: Correct regex escaping for whitespace
 */
function extractBotMention(text, botUsername) {
    if (!text || !botUsername) return { isMention: false, textAfterMention: '' };

    // Normalize bot username (remove @ if present)
    const normalizedUsername = botUsername.replace(/^@/, '');

    // Match @BotName anywhere in text - FIXED regex
    const mentionPattern = new RegExp(`@${normalizedUsername}\\s*(.*)`, 'i');
    const match = text.match(mentionPattern);

    if (match) {
        return {
            isMention: true,
            textAfterMention: match[1].trim()
        };
    }

    return { isMention: false, textAfterMention: '' };
}

/**
 * Command patterns for routing to native handlers
 */
const COMMAND_PATTERNS = {
    roll: {
        keywords: ['tung', 'xúc xắc', 'xuc xac', 'roll', 'dice', '骰子', '주사위', 'костей', 'dadu',
            // Czech
            'hod', 'kostkou', 'kostka',
            // Italian
            'dado', 'dadi', 'lanciare', 'gioca dadi',
            // Spanish
            'lanzar', 'dados', 'tirar dados',
            // French
            'dé', 'dés', 'lancer',
            // Portuguese  
            'jogar dados',
            // German
            'würfel', 'werfen'],
        paramExtractor: (text) => {
            const diceMatch = text.match(/(\d+)d(\d+)([+-]\d+)?/i);
            if (diceMatch) return diceMatch[0];

            const simpleMatch = text.match(/(\d+)\s*(viên|con|dice|die|viên xúc xắc)/i);
            if (simpleMatch && simpleMatch[1]) {
                return `${parseInt(simpleMatch[1])}d6`;
            }

            return '1d6';
        }
    },

    rps: {
        keywords: ['rps', 'oẳn tù tì', 'oan tu ti', 'rock paper scissors', 'búa bao kéo', 'bua bao keo', '石头剪刀布', '가위바위보'],
        paramExtractor: (text) => {
            const lower = text.toLowerCase();

            // Vietnamese
            if (lower.includes('búa') || lower.includes('bua') || lower.includes('đá') || lower.includes('da')) return 'rock';
            if (lower.includes('bao') || lower.includes('giấy') || lower.includes('giay')) return 'paper';
            if (lower.includes('kéo') || lower.includes('keo')) return 'scissors';

            // English
            if (lower.includes('rock')) return 'rock';
            if (lower.includes('paper')) return 'paper';
            if (lower.includes('scissors')) return 'scissors';

            // Chinese
            if (lower.includes('石头')) return 'rock';
            if (lower.includes('布')) return 'paper';
            if (lower.includes('剪刀')) return 'scissors';

            // Korean
            if (lower.includes('바위')) return 'rock';
            if (lower.includes('보')) return 'paper';
            if (lower.includes('가위')) return 'scissors';

            // Russian
            if (lower.includes('камень')) return 'rock';
            if (lower.includes('бумага')) return 'paper';
            if (lower.includes('ножницы')) return 'scissors';

            // Indonesian
            if (lower.includes('batu')) return 'rock';
            if (lower.includes('kertas')) return 'paper';
            if (lower.includes('gunting')) return 'scissors';

            return null;
        }
    },

    gomoku: {
        keywords: ['caro', 'cờ caro', 'co caro', 'gomoku', '五子棋', '오목'],
        paramExtractor: () => null
    },

    rand: {
        keywords: ['random', 'ngẫu nhiên', 'ngau nhien', 'số ngẫu nhiên'],
        paramExtractor: (text) => {
            const rangeMatch = text.match(/(\d+)\s*[-đến到to]\s*(\d+)/i);
            return rangeMatch ? `${rangeMatch[1]} ${rangeMatch[2]}` : null;
        }
    },

    long: {
        keywords: ['long', 'short', 'longshort', 'leverage', 'trade'],
        paramExtractor: (text) => {
            const leverageMatch = text.match(/(\d+)x/i);
            return leverageMatch ? leverageMatch[1] : null;
        }
    },

    td: {
        keywords: ['truth', 'dare', 'sự thật', 'thử thách', 'thach'],
        paramExtractor: () => null
    },

    doremon: {
        keywords: ['doremon', 'doraemon', 'bói', 'fortune', 'chủ đề'],
        paramExtractor: () => null
    },

    mines: {
        keywords: ['mine', 'minesweeper', 'dò mìn', 'do min'],
        paramExtractor: (text) => {
            const sizeMatch = text.match(/(\d+)x(\d+)/i);
            return sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : null;
        }
    },

    memory: {
        keywords: ['memory', 'trí nhớ', 'lật thẻ', 'lat the'],
        paramExtractor: (text) => {
            const sizeMatch = text.match(/(\d+)x(\d+)/i);
            return sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : null;
        }
    },

    sudoku: {
        keywords: ['sudoku', 'số độc'],
        paramExtractor: (text) => {
            const lower = text.toLowerCase();
            if (lower.includes('easy') || lower.includes('dễ')) return '4';
            if (lower.includes('hard') || lower.includes('khó')) return '9';
            return null;
        }
    },

    chess: {
        keywords: ['chess', 'cờ vua', 'co vua'],
        paramExtractor: () => null
    },

    treasure: {
        keywords: ['treasure', 'kho báu', 'tìm', 'hunt'],
        paramExtractor: (text) => {
            const sizeMatch = text.match(/(\d+)x(\d+)/i);
            return sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : null;
        }
    }
};

function parseGamingCommand(text) {
    if (!text || typeof text !== 'string') return null;

    const lower = text.toLowerCase().trim();

    // PRIORITY: Extract dice notation FIRST (universal pattern)
    const diceMatch = text.match(/(\d+)d(\d+)([+-]\d+)?/i);
    if (diceMatch) {
        return { command: 'roll', params: diceMatch[0] };
    }

    // Check for simple number + intent
    const numberMatch = text.match(/^(\d+)\s/);
    if (numberMatch && hasGamingIntent(text)) {
        return { command: 'roll', params: `${numberMatch[1]}d6` };
    }

    // Check command patterns
    for (const [cmdName, config] of Object.entries(COMMAND_PATTERNS)) {
        const hasKeyword = config.keywords.some(kw => lower.includes(kw.toLowerCase()));

        if (hasKeyword) {
            const params = config.paramExtractor(text);
            return { command: cmdName, params };
        }
    }

    return null;
}

module.exports = {
    GAMING_KEYWORDS,
    containsGamingKeyword,
    extractBotMention,
    parseGamingCommand,
    hasGamingIntent
};
