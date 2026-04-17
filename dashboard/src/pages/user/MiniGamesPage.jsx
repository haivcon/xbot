import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
    Shuffle, Gamepad2, RotateCcw, Trophy, ArrowLeft,
    HelpCircle, TrendingUp, TrendingDown
} from 'lucide-react';

/* ── Constants ── */
const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const RPS_OPTIONS = [
    { value: 'rock', icon: '🪨', label: '✊' },
    { value: 'paper', icon: '📄', label: '✋' },
    { value: 'scissors', icon: '✂️', label: '✌️' },
];
import { FORTUNES_DATA } from './fortunesData';
const MEMORY_ICONS = ['🍉', '🍌', '🍎', '🍇', '🍓', '🍒', '🥥', '🥭'];
const CHESS_INIT = [
    '♜','♞','♝','♛','♚','♝','♞','♜',
    '♟','♟','♟','♟','♟','♟','♟','♟',
    '','','','','','','','',
    '','','','','','','','',
    '','','','','','','','',
    '','','','','','','','',
    '♙','♙','♙','♙','♙','♙','♙','♙',
    '♖','♘','♗','♕','♔','♗','♘','♖',
];
const WHITE_PIECES = new Set(['♙','♖','♘','♗','♕','♔']);
const BLACK_PIECES = new Set(['♟','♜','♞','♝','♛','♚']);
function pieceColor(p) { return WHITE_PIECES.has(p) ? 'w' : BLACK_PIECES.has(p) ? 'b' : null; }
function getChessMoves(board, from) {
    const p = board[from]; if (!p) return [];
    const color = pieceColor(p);
    const r = Math.floor(from / 8), c = from % 8;
    const moves = [];
    const addIf = (tr, tc) => { if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return false; const ti = tr * 8 + tc; const tp = board[ti]; if (pieceColor(tp) === color) return false; moves.push(ti); return !tp; };
    const slide = (dr, dc) => { for (let d = 1; d < 8; d++) { if (!addIf(r + dr * d, c + dc * d)) break; } };
    if (p === '♙') { // white pawn
        if (r > 0 && !board[(r-1)*8+c]) { moves.push((r-1)*8+c); if (r === 6 && !board[(r-2)*8+c]) moves.push((r-2)*8+c); }
        if (r > 0 && c > 0 && pieceColor(board[(r-1)*8+c-1]) === 'b') moves.push((r-1)*8+c-1);
        if (r > 0 && c < 7 && pieceColor(board[(r-1)*8+c+1]) === 'b') moves.push((r-1)*8+c+1);
    } else if (p === '♟') { // black pawn
        if (r < 7 && !board[(r+1)*8+c]) { moves.push((r+1)*8+c); if (r === 1 && !board[(r+2)*8+c]) moves.push((r+2)*8+c); }
        if (r < 7 && c > 0 && pieceColor(board[(r+1)*8+c-1]) === 'w') moves.push((r+1)*8+c-1);
        if (r < 7 && c < 7 && pieceColor(board[(r+1)*8+c+1]) === 'w') moves.push((r+1)*8+c+1);
    } else if (p === '♘' || p === '♞') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => addIf(r+dr, c+dc));
    } else if (p === '♗' || p === '♝') { slide(1,1); slide(1,-1); slide(-1,1); slide(-1,-1); }
    else if (p === '♖' || p === '♜') { slide(1,0); slide(-1,0); slide(0,1); slide(0,-1); }
    else if (p === '♕' || p === '♛') { slide(1,0); slide(-1,0); slide(0,1); slide(0,-1); slide(1,1); slide(1,-1); slide(-1,1); slide(-1,-1); }
    else if (p === '♔' || p === '♚') { [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => addIf(r+dr, c+dc)); }
    return moves;
}
function chessBotMove(board) {
    const pieces = board.map((p, i) => pieceColor(p) === 'b' ? i : -1).filter(i => i >= 0);
    // Prioritize captures, especially king
    let bestFrom = -1, bestTo = -1, bestScore = -1;
    for (const from of pieces) {
        const mvs = getChessMoves(board, from);
        for (const to of mvs) {
            let score = 1;
            const target = board[to];
            if (target === '♔') score = 1000;
            else if (target === '♕') score = 90;
            else if (target === '♖') score = 50;
            else if (target === '♗' || target === '♘') score = 30;
            else if (target === '♙') score = 10;
            score += Math.random() * 5; // randomness
            if (score > bestScore) { bestScore = score; bestFrom = from; bestTo = to; }
        }
    }
    return { from: bestFrom, to: bestTo };
}

/* ── Helpers ── */
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getMineNeighbors(idx, rows, cols) {
    const r = Math.floor(idx / cols), c = idx % cols, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
    return out;
}

function floodReveal(board, idx, rows, cols, visited = new Set()) {
    if (visited.has(idx)) return;
    visited.add(idx);
    const cell = board[idx];
    if (cell.revealed || cell.hasMine) return;
    cell.revealed = true;
    if (cell.adjacent === 0) {
        getMineNeighbors(idx, rows, cols).forEach(n => floodReveal(board, n, rows, cols, visited));
    }
}

function checkGomokuWin(board, idx, size) {
    const player = board[idx];
    if (!player) return false;
    const r = Math.floor(idx / size), c = idx % size;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
        let count = 1;
        for (let d = 1; d < 5; d++) { const nr = r+dr*d, nc = c+dc*d; if (nr>=0&&nr<size&&nc>=0&&nc<size&&board[nr*size+nc]===player) count++; else break; }
        for (let d = 1; d < 5; d++) { const nr = r-dr*d, nc = c-dc*d; if (nr>=0&&nr<size&&nc>=0&&nc<size&&board[nr*size+nc]===player) count++; else break; }
        if (count >= 5) return true;
    }
    return false;
}

function gomokuBotMove(board, size) {
    // Simple AI: block player wins, or build own streaks
    const empty = board.map((v, i) => v === null ? i : -1).filter(v => v >= 0);
    if (!empty.length) return -1;
    // Check if bot can win
    for (const idx of empty) { board[idx] = 'O'; if (checkGomokuWin(board, idx, size)) { board[idx] = null; return idx; } board[idx] = null; }
    // Check if must block player
    for (const idx of empty) { board[idx] = 'X'; if (checkGomokuWin(board, idx, size)) { board[idx] = null; return idx; } board[idx] = null; }
    // Play near existing pieces
    const scored = empty.map(idx => {
        const r = Math.floor(idx / size), c = idx % size;
        let score = 0;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            const nr = r+dr, nc = c+dc;
            if (nr>=0&&nr<size&&nc>=0&&nc<size) { if (board[nr*size+nc]==='O') score += 3; else if (board[nr*size+nc]==='X') score += 2; }
        }
        // Prefer center
        score += Math.max(0, 4 - Math.abs(r - Math.floor(size/2))) + Math.max(0, 4 - Math.abs(c - Math.floor(size/2)));
        return { idx, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].idx;
}

function generateSudoku(size) {
    const grid = Array(size * size).fill(0);
    const boxR = size === 4 ? 2 : size === 6 ? 2 : 3;
    const boxC = size === 4 ? 2 : size === 6 ? 3 : 3;
    // Fill diagonal boxes first then solve
    function isValid(g, pos, num) {
        const r = Math.floor(pos / size), c = pos % size;
        for (let i = 0; i < size; i++) { if (g[r * size + i] === num || g[i * size + c] === num) return false; }
        const br = Math.floor(r / boxR) * boxR, bc = Math.floor(c / boxC) * boxC;
        for (let i = br; i < br + boxR; i++) for (let j = bc; j < bc + boxC; j++) if (g[i * size + j] === num) return false;
        return true;
    }
    function solve(g, pos) {
        if (pos >= size * size) return true;
        if (g[pos] !== 0) return solve(g, pos + 1);
        const nums = shuffle(Array.from({ length: size }, (_, i) => i + 1));
        for (const n of nums) { if (isValid(g, pos, n)) { g[pos] = n; if (solve(g, pos + 1)) return true; g[pos] = 0; } }
        return false;
    }
    solve(grid, 0);
    // Remove cells for puzzle
    const removeCount = size === 4 ? 8 : size === 6 ? 18 : 45;
    const solution = [...grid];
    const indices = shuffle(Array.from({ length: size * size }, (_, i) => i));
    for (let i = 0; i < removeCount && i < indices.length; i++) grid[indices[i]] = 0;
    return { grid, solution, size };
}

/* ── Main Component ── */
export default function MiniGamesPage() {
    const { t, i18n } = useTranslation();
    const [activeGame, setActiveGame] = useState(null);
    const [result, setResult] = useState(null);
    const [animating, setAnimating] = useState(false);
    const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0, games: 0 });
    const memoryTimerRef = useRef(null);

    const GAME_LIST = [
        { id: 'dice', icon: '🎲', label: t('dashboard.miniGamesPage.dice'), desc: t('dashboard.miniGamesPage.diceDesc'), color: 'from-blue-500 to-cyan-500' },
        { id: 'rps', icon: '✊', label: t('dashboard.miniGamesPage.rps'), desc: t('dashboard.miniGamesPage.rpsDesc'), color: 'from-purple-500 to-pink-500' },
        { id: 'fortune', icon: '🔮', label: t('dashboard.miniGamesPage.fortune'), desc: t('dashboard.miniGamesPage.fortuneDesc'), color: 'from-amber-500 to-orange-500' },
        { id: 'longshort', icon: '📊', label: t('dashboard.miniGamesPage.longshort'), desc: t('dashboard.miniGamesPage.longshortDesc'), color: 'from-emerald-500 to-teal-500' },
        { id: 'quiz', icon: '🧠', label: t('dashboard.miniGamesPage.quiz'), desc: t('dashboard.miniGamesPage.quizDesc'), color: 'from-rose-500 to-red-500' },
        { id: 'coin', icon: '🪙', label: t('dashboard.miniGamesPage.coin'), desc: t('dashboard.miniGamesPage.coinDesc'), color: 'from-yellow-500 to-amber-500' },
        { id: 'memory', icon: '🃏', label: t('dashboard.miniGamesPage.memory'), desc: t('dashboard.miniGamesPage.memoryDesc'), color: 'from-indigo-500 to-blue-500' },
        { id: 'mines', icon: '💣', label: t('dashboard.miniGamesPage.mines'), desc: t('dashboard.miniGamesPage.minesDesc'), color: 'from-red-600 to-orange-600' },
        { id: 'treasure', icon: '📦', label: t('dashboard.miniGamesPage.treasure'), desc: t('dashboard.miniGamesPage.treasureDesc'), color: 'from-yellow-600 to-orange-500' },
        { id: 'gomoku', icon: '⚪', label: t('dashboard.miniGamesPage.gomoku'), desc: t('dashboard.miniGamesPage.gomokuDesc'), color: 'from-slate-600 to-slate-800' },
        { id: 'sudoku', icon: '🔢', label: t('dashboard.miniGamesPage.sudoku'), desc: t('dashboard.miniGamesPage.sudokuDesc'), color: 'from-sky-500 to-blue-500' },
        { id: 'chess', icon: '♟️', label: t('dashboard.miniGamesPage.chess'), desc: t('dashboard.miniGamesPage.chessDesc'), color: 'from-zinc-400 to-zinc-600' },
        { id: 'randNumber', icon: '💯', label: t('dashboard.miniGamesPage.randNumber'), desc: t('dashboard.miniGamesPage.randNumberDesc'), color: 'from-cyan-500 to-teal-500' },
        { id: 'randChoice', icon: '🎯', label: t('dashboard.miniGamesPage.randChoice'), desc: t('dashboard.miniGamesPage.randChoiceDesc'), color: 'from-fuchsia-500 to-pink-500' },
    ];

    /* ── Instant game initializers (no setTimeout wrapper) ── */
    const initGame = useCallback((game) => {
        setResult(null);
        setAnimating(false);
        switch (game) {
            case 'memory': {
                const deck = shuffle([...MEMORY_ICONS, ...MEMORY_ICONS]);
                setResult({ type: 'memory', cards: deck.map((icon, i) => ({ id: i, icon, flipped: false, matched: false })), flippedCount: 0, first: null, moves: 0, won: false });
                break;
            }
            case 'mines': {
                const rows = 8, cols = 8, mineCount = Math.floor(rows * cols * 0.18);
                const board = Array.from({ length: rows * cols }, (_, i) => ({ id: i, hasMine: false, adjacent: 0, revealed: false }));
                const indices = shuffle([...board.keys()]);
                for (let i = 0; i < mineCount; i++) board[indices[i]].hasMine = true;
                for (let i = 0; i < board.length; i++) {
                    if (!board[i].hasMine) board[i].adjacent = getMineNeighbors(i, rows, cols).reduce((c, n) => c + (board[n].hasMine ? 1 : 0), 0);
                }
                setResult({ type: 'mines', board, rows, cols, mineCount, gameOver: false, won: false, moves: 0 });
                break;
            }
            case 'treasure': {
                const total = 9, treasureIdx = Math.floor(Math.random() * total);
                setResult({ type: 'treasure', chests: Array(total).fill(0).map((_, i) => ({ id: i, opened: false, hasTreasure: i === treasureIdx })), gameOver: false, won: false, tries: 0, maxTries: 3 });
                break;
            }
            case 'gomoku': {
                const size = 15;
                setResult({ type: 'gomoku', board: Array(size * size).fill(null), size, userTurn: true, winner: null, lastMove: -1 });
                break;
            }
            case 'sudoku': {
                const puzzle = generateSudoku(9);
                const userGrid = [...puzzle.grid];
                setResult({ type: 'sudoku', ...puzzle, userGrid, selectedCell: -1, completed: false, errors: 0 });
                break;
            }
            case 'chess': {
                setResult({ type: 'chess', board: [...CHESS_INIT], turn: 'w', selectedPiece: -1, validMoves: [], status: 'playing', moveCount: 0, lastMove: [-1,-1], message: '' });
                break;
            }
        }
    }, []);

    /* ── Quick games with animation ── */
    const playQuick = useCallback((game, params = {}) => {
        setAnimating(true);
        setTimeout(() => {
            let res;
            switch (game) {
                case 'dice': {
                    const count = params.count || 2, faces = params.faces || 6;
                    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * faces) + 1);
                    res = { type: 'dice', rolls, total: rolls.reduce((s, v) => s + v, 0), faces };
                    break;
                }
                case 'rps': {
                    const choices = ['rock', 'paper', 'scissors'];
                    const botChoice = choices[Math.floor(Math.random() * 3)];
                    const userChoice = params.choice;
                    let outcome = 'draw';
                    if ((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) outcome = 'win';
                    else if (userChoice !== botChoice) outcome = 'lose';
                    res = { type: 'rps', userChoice, botChoice, outcome };
                    setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + (outcome === 'win' ? 1 : 0), losses: s.losses + (outcome === 'lose' ? 1 : 0), draws: s.draws + (outcome === 'draw' ? 1 : 0) }));
                    break;
                }
                case 'fortune': {
                    const currentLang = (i18n.language || 'en').toLowerCase();
                    const lang = currentLang.startsWith('vi') ? 'vi' : 'en';
                    const topic = FORTUNES_DATA[Math.floor(Math.random() * FORTUNES_DATA.length)];
                    const pool = topic[lang] || topic.en;
                    const text = pool ? pool[Math.floor(Math.random() * pool.length)] : 'Good luck will come your way soon ✨';
                    res = { type: 'fortune', icon: topic.icon, fortune: text };
                    break;
                }
                case 'longshort': {
                    const isLong = Math.random() > 0.5;
                    res = { type: 'longshort', position: isLong ? 'LONG' : 'SHORT', leverage: Math.floor(Math.random() * 100) + 1, icon: isLong ? '📈' : '📉' };
                    break;
                }
                case 'quiz': {
                    const n1 = Math.floor(Math.random() * 20) + 1, n2 = Math.floor(Math.random() * 20) + 1;
                    const ops = ['+', '-', '×'], op = ops[Math.floor(Math.random() * 3)];
                    const answer = op === '+' ? n1 + n2 : op === '-' ? n1 - n2 : n1 * n2;
                    const opts = shuffle([answer, answer + Math.floor(Math.random() * 5) + 1, answer - Math.floor(Math.random() * 5) - 1, answer + Math.floor(Math.random() * 10) + 5]);
                    res = { type: 'quiz', question: `${n1} ${op} ${n2} = ?`, options: opts, answer, answered: false };
                    break;
                }
                case 'coin': { res = { type: 'coin', side: Math.random() > 0.5 ? 'heads' : 'tails' }; break; }
                case 'randNumber': {
                    const min = params.min || 1, max = params.max || 100;
                    res = { type: 'randNumber', min, max, value: Math.floor(Math.random() * (max - min + 1)) + min };
                    break;
                }
                case 'randChoice': {
                    const opts = params.options || ['🍎 Apple', '🍌 Banana', '🍉 Watermelon'];
                    res = { type: 'randChoice', options: opts, value: opts[Math.floor(Math.random() * opts.length)] };
                    break;
                }
            }
            setResult(res);
            setAnimating(false);
        }, 500);
    }, [i18n.language]);

    /* ── Interactive game handlers ── */
    const answerQuiz = (choice) => {
        if (!result || result.answered) return;
        const correct = choice === result.answer;
        setResult(prev => ({ ...prev, answered: true, userAnswer: choice, correct }));
        setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + (correct ? 1 : 0), losses: s.losses + (correct ? 0 : 1) }));
    };

    const flipMemory = (index) => {
        if (!result || result.type !== 'memory' || result.won) return;
        if (memoryTimerRef.current) return; // wait for mismatch reset
        const cards = result.cards.map(c => ({ ...c }));
        if (cards[index].flipped || cards[index].matched) return;

        cards[index].flipped = true;
        const flippedNow = cards.filter(c => c.flipped && !c.matched);

        if (flippedNow.length === 2) {
            const [a, b] = flippedNow;
            const newMoves = result.moves + 1;
            if (a.icon === b.icon) {
                cards[a.id].matched = true;
                cards[b.id].matched = true;
                const won = cards.every(c => c.matched);
                if (won) setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + 1 }));
                setResult(prev => ({ ...prev, cards, moves: newMoves, won }));
            } else {
                setResult(prev => ({ ...prev, cards, moves: newMoves }));
                memoryTimerRef.current = setTimeout(() => {
                    setResult(prev => {
                        if (!prev) return prev;
                        const reset = prev.cards.map(c => ({ ...c, flipped: c.matched ? true : false }));
                        return { ...prev, cards: reset };
                    });
                    memoryTimerRef.current = null;
                }, 800);
            }
        } else {
            setResult(prev => ({ ...prev, cards }));
        }
    };

    const revealMine = (index) => {
        setResult(prev => {
            if (!prev || prev.type !== 'mines' || prev.gameOver) return prev;
            const board = prev.board.map(c => ({ ...c }));
            if (board[index].revealed) return prev;

            if (board[index].hasMine) {
                board.forEach(c => c.revealed = true);
                setStats(s => ({ ...s, games: s.games + 1, losses: s.losses + 1 }));
                return { ...prev, board, gameOver: true, won: false, moves: prev.moves + 1 };
            }

            floodReveal(board, index, prev.rows, prev.cols);
            const safeCount = board.filter(c => !c.hasMine).length;
            const revealedCount = board.filter(c => c.revealed).length;
            const won = revealedCount >= safeCount;
            if (won) {
                board.forEach(c => c.revealed = true);
                setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + 1 }));
            }
            return { ...prev, board, gameOver: won, won, moves: prev.moves + 1 };
        });
    };

    const revealTreasure = (index) => {
        setResult(prev => {
            if (!prev || prev.type !== 'treasure' || prev.gameOver) return prev;
            const chests = prev.chests.map(c => ({ ...c }));
            if (chests[index].opened) return prev;
            chests[index].opened = true;
            const tries = prev.tries + 1;
            const won = chests[index].hasTreasure;
            const gameOver = won || tries >= prev.maxTries;
            if (gameOver) {
                chests.forEach(c => c.opened = true);
                setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + (won ? 1 : 0), losses: s.losses + (won ? 0 : 1) }));
            }
            return { ...prev, chests, tries, gameOver, won };
        });
    };

    const playGomoku = (index) => {
        setResult(prev => {
            if (!prev || prev.type !== 'gomoku' || prev.winner || !prev.userTurn || prev.board[index]) return prev;
            const board = [...prev.board];
            board[index] = 'X';
            if (checkGomokuWin(board, index, prev.size)) {
                setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + 1 }));
                return { ...prev, board, winner: 'X', lastMove: index };
            }
            // Bot move
            const botIdx = gomokuBotMove(board, prev.size);
            if (botIdx >= 0) {
                board[botIdx] = 'O';
                if (checkGomokuWin(board, botIdx, prev.size)) {
                    setStats(s => ({ ...s, games: s.games + 1, losses: s.losses + 1 }));
                    return { ...prev, board, winner: 'O', lastMove: botIdx };
                }
            }
            return { ...prev, board, lastMove: botIdx >= 0 ? botIdx : index };
        });
    };

    const handleSudokuInput = (cellIdx, num) => {
        setResult(prev => {
            if (!prev || prev.completed) return prev;
            if (prev.grid[cellIdx] !== 0) return prev; // preset cell
            const userGrid = [...prev.userGrid];
            userGrid[cellIdx] = num;
            const isCorrect = num === prev.solution[cellIdx];
            const errors = prev.errors + (isCorrect ? 0 : 1);
            const completed = userGrid.every((v, i) => v === prev.solution[i]);
            if (completed) setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + 1 }));
            return { ...prev, userGrid, errors, completed, selectedCell: -1 };
        });
    };

    const rpsIcons = { rock: '🪨', paper: '📄', scissors: '✂️' };

    const selectGame = (id) => {
        if (memoryTimerRef.current) { clearTimeout(memoryTimerRef.current); memoryTimerRef.current = null; }
        setActiveGame(id);
        setResult(null);
        setAnimating(false);
    };

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/5 flex items-center justify-center">
                        <Gamepad2 size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.miniGamesPage.title')}</h1>
                        <p className="text-xs text-surface-200/40">{t('dashboard.miniGamesPage.subtitle')}</p>
                    </div>
                </div>
                {stats.games > 0 && (
                    <div className="flex gap-3 text-[10px]">
                        <span className="text-emerald-400"><Trophy size={10} className="inline" /> {stats.wins}{t('dashboard.miniGamesPage.wins')}</span>
                        <span className="text-red-400">{stats.losses}{t('dashboard.miniGamesPage.losses')}</span>
                        <span className="text-surface-200/40">{stats.draws}{t('dashboard.miniGamesPage.draws')}</span>
                    </div>
                )}
            </div>

            {/* Game Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 sm:grid-cols-3 gap-3">
                {GAME_LIST.map(game => (
                    <button key={game.id} onClick={() => selectGame(game.id)}
                        className={`glass-card p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] group ${activeGame === game.id ? 'ring-2 ring-brand-500/40' : ''}`}>
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-sm mb-2 group-hover:shadow-lg transition-shadow`}>
                            {game.icon}
                        </div>
                        <p className="text-sm font-semibold text-surface-100">{game.label}</p>
                        <p className="text-[10px] text-surface-200/40 mt-0.5 line-clamp-1">{game.desc}</p>
                    </button>
                ))}
            </div>

            {/* Active Game Area */}
            {activeGame && (
                <div className="glass-card p-6 space-y-4">
                    <button onClick={() => selectGame(null)} className="flex items-center gap-1.5 text-xs text-surface-200/40 hover:text-brand-400 transition-colors mb-2">
                        <ArrowLeft size={14} /> {t('dashboard.miniGamesPage.back')}
                    </button>

                    {/* ═══ DICE ═══ */}
                    {activeGame === 'dice' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🎲 {t('dashboard.miniGamesPage.dice')}</h3>
                            {result?.type === 'dice' && !animating && (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex justify-center gap-4">
                                        {result.rolls.map((r, i) => {
                                            const D = result.faces <= 6 ? DICE_ICONS[r - 1] : null;
                                            return (<div key={i} className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                                                {D ? <D size={32} className="text-blue-400" /> : <span className="text-2xl font-bold text-blue-400">{r}</span>}
                                            </div>);
                                        })}
                                    </div>
                                    <p className="text-lg font-bold text-surface-100">{t('dashboard.miniGamesPage.total')}: {result.total}</p>
                                </div>
                            )}
                            {animating && <div className="flex justify-center gap-4">{[0,1].map(i => <div key={i} className="w-16 h-16 rounded-2xl bg-surface-800/60 animate-pulse flex items-center justify-center"><Shuffle size={24} className="text-surface-200/30 animate-spin" /></div>)}</div>}
                            <button onClick={() => playQuick('dice')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50">
                                <RotateCcw size={14} className="inline mr-1" />
                                {result ? t('dashboard.miniGamesPage.rollAgain') : t('dashboard.miniGamesPage.rollDice')}
                            </button>
                        </div>
                    )}

                    {/* ═══ RPS ═══ */}
                    {activeGame === 'rps' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">✊ {t('dashboard.miniGamesPage.rps')}</h3>
                            {result?.type === 'rps' && !animating && (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex items-center justify-center gap-6">
                                        <div className="text-center"><p className="text-4xl">{rpsIcons[result.userChoice]}</p><p className="text-[10px] text-surface-200/40 mt-1">{t('dashboard.miniGamesPage.you')}</p></div>
                                        <span className="text-lg font-bold text-surface-200/20">VS</span>
                                        <div className="text-center"><p className="text-4xl">{rpsIcons[result.botChoice]}</p><p className="text-[10px] text-surface-200/40 mt-1">{t('dashboard.miniGamesPage.bot')}</p></div>
                                    </div>
                                    <p className={`text-lg font-bold ${result.outcome === 'win' ? 'text-emerald-400' : result.outcome === 'lose' ? 'text-red-400' : 'text-amber-400'}`}>
                                        {result.outcome === 'win' ? '🎉 ' + t('dashboard.miniGamesPage.youWin') : result.outcome === 'lose' ? '😔 ' + t('dashboard.miniGamesPage.youLose') : '🤝 ' + t('dashboard.miniGamesPage.draw')}
                                    </p>
                                </div>
                            )}
                            {animating && <div className="flex justify-center"><div className="w-20 h-20 rounded-full bg-surface-800/60 animate-pulse flex items-center justify-center"><Shuffle size={28} className="text-surface-200/30 animate-spin" /></div></div>}
                            <div className="flex justify-center gap-3">
                                {RPS_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => playQuick('rps', { choice: opt.value })} disabled={animating}
                                        className="px-5 py-3 rounded-xl bg-surface-800/60 border border-white/5 hover:bg-purple-500/10 text-surface-100 disabled:opacity-50 flex flex-col items-center transition-all hover:scale-105">
                                        <span className="text-2xl">{opt.icon}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══ FORTUNE ═══ */}
                    {activeGame === 'fortune' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🔮 {t('dashboard.miniGamesPage.fortune')}</h3>
                            {result?.type === 'fortune' && !animating && (
                                <div className="animate-in fade-in">
                                    <div className="bg-gradient-to-br from-amber-500/5 to-purple-500/5 border border-amber-500/10 rounded-2xl px-6 py-5 flex flex-col items-center gap-3">
                                        {result.icon && <span className="text-4xl">{result.icon}</span>}
                                        <p className="text-[15px] font-medium text-surface-100 italic text-center">"{result.fortune}"</p>
                                    </div>
                                </div>
                            )}
                            {animating && <div className="h-20 flex flex-col items-center justify-center gap-2"><span className="text-4xl animate-pulse">🔮</span></div>}
                            <button onClick={() => playQuick('fortune')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50">
                                {result ? t('dashboard.miniGamesPage.askAgain') : t('dashboard.miniGamesPage.tellFortune')}
                            </button>
                        </div>
                    )}

                    {/* ═══ LONG/SHORT ═══ */}
                    {activeGame === 'longshort' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">📊 {t('dashboard.miniGamesPage.longshort')}</h3>
                            {result?.type === 'longshort' && !animating && (
                                <div className="animate-in fade-in space-y-2">
                                    <p className="text-5xl">{result.icon}</p>
                                    <p className={`text-2xl font-black ${result.position === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>{result.position}</p>
                                    <p className="text-lg font-bold text-surface-200/70">{result.leverage}x {t('dashboard.miniGamesPage.leverage')}</p>
                                </div>
                            )}
                            {animating && <div className="flex justify-center gap-4"><TrendingUp size={32} className="text-emerald-400/30 animate-pulse" /><TrendingDown size={32} className="text-red-400/30 animate-pulse" /></div>}
                            <button onClick={() => playQuick('longshort')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50">
                                {result ? t('dashboard.miniGamesPage.genAgain') : t('dashboard.miniGamesPage.genSignal')}
                            </button>
                        </div>
                    )}

                    {/* ═══ COIN ═══ */}
                    {activeGame === 'coin' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🪙 {t('dashboard.miniGamesPage.coin')}</h3>
                            {result?.type === 'coin' && !animating && (
                                <div className="animate-in fade-in space-y-2">
                                    <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center text-4xl font-bold border-4 ${result.side === 'heads' ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'bg-gray-500/20 border-gray-400/30 text-gray-300'}`}>
                                        {result.side === 'heads' ? 'H' : 'T'}
                                    </div>
                                    <p className="text-lg font-bold text-surface-100 capitalize">{t(`dashboard.miniGamesPage.${result.side}`)}!</p>
                                </div>
                            )}
                            {animating && <div className="h-24 flex items-center justify-center"><div className="w-16 h-16 rounded-full bg-yellow-500/20 animate-spin flex items-center justify-center"><span className="text-2xl">🪙</span></div></div>}
                            <button onClick={() => playQuick('coin')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50">
                                {result ? t('dashboard.miniGamesPage.flipAgain') : t('dashboard.miniGamesPage.flipCoin')}
                            </button>
                        </div>
                    )}

                    {/* ═══ QUIZ ═══ */}
                    {activeGame === 'quiz' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🧠 {t('dashboard.miniGamesPage.quiz')}</h3>
                            {result?.type === 'quiz' && !animating && (
                                <div className="animate-in fade-in space-y-3">
                                    <p className="text-2xl font-bold text-surface-100">{result.question}</p>
                                    <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                                        {result.options.map((opt, i) => (
                                            <button key={i} onClick={() => answerQuiz(opt)} disabled={result.answered}
                                                className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${result.answered ? (opt === result.answer ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : opt === result.userAnswer ? 'bg-red-500/20 border border-red-500/30 text-red-400' : 'bg-surface-800/30 text-surface-200/30') : 'bg-surface-800/60 border border-white/5 hover:bg-purple-500/10 text-surface-100'}`}>
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                    {result.answered && <p className={`text-sm font-bold ${result.correct ? 'text-emerald-400' : 'text-red-400'}`}>{result.correct ? '✅ ' + t('dashboard.miniGamesPage.correct') : '❌ ' + t('dashboard.miniGamesPage.wrong') + result.answer}</p>}
                                </div>
                            )}
                            {animating && <div className="h-20 flex items-center justify-center"><HelpCircle size={32} className="text-surface-200/30 animate-pulse" /></div>}
                            <button onClick={() => playQuick('quiz')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50">
                                {result?.answered || !result ? t('dashboard.miniGamesPage.newQuestion') : t('dashboard.miniGamesPage.answerFirst')}
                            </button>
                        </div>
                    )}

                    {/* ═══ MEMORY ═══ */}
                    {activeGame === 'memory' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🃏 {t('dashboard.miniGamesPage.memory')}</h3>
                            {!result && <button onClick={() => initGame('memory')} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-sm font-semibold shadow-lg">Start</button>}
                            {result?.type === 'memory' && (
                                <div className="max-w-[280px] mx-auto space-y-3">
                                    <p className="text-[11px] text-surface-200/50">Moves: {result.moves} | Pairs: {result.cards.filter(c => c.matched).length / 2}/{MEMORY_ICONS.length}</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        {result.cards.map((c, i) => (
                                            <button key={i} onClick={() => flipMemory(i)}
                                                className={`aspect-square text-2xl flex items-center justify-center rounded-xl transition-all duration-300 ${c.matched ? 'bg-emerald-500/20 border border-emerald-500/30 scale-95' : c.flipped ? 'bg-indigo-500/20 border border-indigo-500/40' : 'bg-surface-800 border border-white/5 hover:bg-surface-700 cursor-pointer shadow-inner shadow-black/50'}`}>
                                                <span className={`transition-all duration-300 ${c.flipped || c.matched ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>{c.icon}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {result.won && <><p className="text-emerald-400 font-bold animate-pulse">🎉 {t('dashboard.miniGamesPage.youWin')} ({result.moves} moves)</p>
                                        <button onClick={() => initGame('memory')} className="text-sm text-brand-400 font-bold hover:underline">Play Again</button></>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ MINESWEEPER ═══ */}
                    {activeGame === 'mines' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">💣 {t('dashboard.miniGamesPage.mines')}</h3>
                            {!result && <button onClick={() => initGame('mines')} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 text-white text-sm font-semibold shadow-lg">Start</button>}
                            {result?.type === 'mines' && (
                                <div className="max-w-[320px] mx-auto space-y-3">
                                    <p className="text-[11px] text-surface-200/50">💣 {result.mineCount} mines | Moves: {result.moves}</p>
                                    <div className="grid grid-cols-8 gap-[2px] p-2 bg-surface-900 rounded-xl border border-white/5">
                                        {result.board.map((c, i) => (
                                            <button key={i} onClick={() => revealMine(i)} disabled={result.gameOver}
                                                className={`aspect-square flex items-center justify-center rounded-sm transition-all text-xs font-bold ${c.revealed ? (c.hasMine ? 'bg-red-500/50 text-white' : c.adjacent > 0 ? 'bg-white/10 text-sky-400' : 'bg-white/5 text-surface-200/20') : 'bg-surface-700 hover:bg-surface-600 cursor-pointer shadow-sm border-t border-white/10 active:scale-90'}`}>
                                                {c.revealed ? (c.hasMine ? '💣' : c.adjacent > 0 ? c.adjacent : '·') : ''}
                                            </button>
                                        ))}
                                    </div>
                                    {result.won && <p className="text-emerald-400 font-bold">🎉 {t('dashboard.miniGamesPage.youWin')}</p>}
                                    {result.gameOver && !result.won && <p className="text-red-400 font-bold">💥 BOOM! {t('dashboard.miniGamesPage.youLose')}</p>}
                                    {result.gameOver && <button onClick={() => initGame('mines')} className="px-4 py-2 mt-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm transition-all">Play Again</button>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ TREASURE HUNT ═══ */}
                    {activeGame === 'treasure' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">📦 {t('dashboard.miniGamesPage.treasure')}</h3>
                            {!result && <button onClick={() => initGame('treasure')} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-yellow-600 to-orange-500 text-white text-sm font-semibold shadow-lg">Start Hunt</button>}
                            {result?.type === 'treasure' && (
                                <div className="max-w-[220px] mx-auto space-y-3">
                                    <p className="text-[11px] text-surface-200/50">Tries: {result.tries}/{result.maxTries}</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {result.chests.map((c, i) => (
                                            <button key={i} onClick={() => revealTreasure(i)} disabled={result.gameOver || c.opened}
                                                className={`aspect-square text-3xl flex items-center justify-center rounded-xl transition-all duration-300 ${c.opened ? (c.hasTreasure ? 'bg-yellow-500/20 shadow-yellow-500/50 shadow-lg scale-110' : 'bg-surface-900 border-dashed border border-white/10 scale-95 opacity-60') : 'bg-surface-800 hover:bg-surface-700 border border-t-white/10 border-b-black/50 cursor-pointer shadow-md active:scale-90 hover:scale-105'}`}>
                                                {c.opened ? (c.hasTreasure ? '💎' : '💨') : '📦'}
                                            </button>
                                        ))}
                                    </div>
                                    {result.won && <p className="text-emerald-400 font-bold animate-bounce mt-4">🎉 {t('dashboard.miniGamesPage.youWin')}</p>}
                                    {result.gameOver && !result.won && <p className="text-red-400 font-bold">{t('dashboard.miniGamesPage.youLose')}</p>}
                                    {result.gameOver && <button onClick={() => initGame('treasure')} className="px-4 py-2 mt-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm">Play Again</button>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ GOMOKU ═══ */}
                    {activeGame === 'gomoku' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">⚪ {t('dashboard.miniGamesPage.gomoku')}</h3>
                            {!result && <button onClick={() => initGame('gomoku')} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-slate-600 to-slate-800 text-white text-sm font-semibold shadow-lg">Start Gomoku</button>}
                            {result?.type === 'gomoku' && (
                                <div className="space-y-3">
                                    <p className="text-[11px] text-surface-200/50">{result.winner ? (result.winner === 'X' ? '🎉 ' + t('dashboard.miniGamesPage.youWin') : '🤖 ' + t('dashboard.miniGamesPage.youLose')) : '⚫ You (X) vs 🤖 Bot (O)'}</p>
                                    <div className="p-1 bg-yellow-900/40 rounded-xl border border-yellow-700/30 max-w-[360px] mx-auto shadow-inner overflow-auto" style={{ maxHeight: '400px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${result.size}, 22px)`, gap: '0px', justifyContent: 'center' }}>
                                            {result.board.map((cell, i) => (
                                                <button key={i} onClick={() => playGomoku(i)} disabled={!!result.winner || !!cell}
                                                    style={{ width: 22, height: 22 }}
                                                    className={`flex items-center justify-center border border-yellow-700/40 transition-all ${i === result.lastMove ? 'bg-yellow-600/40' : 'bg-yellow-800/60 hover:bg-yellow-700/60'} ${cell ? '' : 'cursor-pointer'}`}>
                                                    {cell === 'X' ? <span className="w-3.5 h-3.5 rounded-full bg-slate-900 shadow-md"></span> : cell === 'O' ? <span className="w-3.5 h-3.5 rounded-full bg-white shadow-md"></span> : null}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {result.winner && <button onClick={() => initGame('gomoku')} className="px-4 py-2 mt-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm">Play Again</button>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ SUDOKU ═══ */}
                    {activeGame === 'sudoku' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🔢 {t('dashboard.miniGamesPage.sudoku')}</h3>
                            {!result && <button onClick={() => initGame('sudoku')} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold shadow-lg">Start Sudoku</button>}
                            {result?.type === 'sudoku' && (
                                <div className="max-w-[340px] mx-auto space-y-3">
                                    <p className="text-[11px] text-surface-200/50">{result.completed ? '🎉 ' + t('dashboard.miniGamesPage.correct') : `Errors: ${result.errors}`}</p>
                                    <div className="grid grid-cols-9 gap-0 border-2 border-white/30 rounded-lg overflow-hidden">
                                        {result.userGrid.map((val, i) => {
                                            const r = Math.floor(i / 9), c = i % 9;
                                            const isPreset = result.grid[i] !== 0;
                                            const isWrong = val !== 0 && val !== result.solution[i];
                                            const isSelected = result.selectedCell === i;
                                            return (
                                                <button key={i} onClick={() => !isPreset && !result.completed && setResult(prev => ({ ...prev, selectedCell: i === prev.selectedCell ? -1 : i }))}
                                                    className={`aspect-square flex items-center justify-center text-sm font-bold transition-all
                                                        ${isPreset ? 'text-surface-100' : isWrong ? 'text-red-400 bg-red-500/10' : val ? 'text-sky-400' : 'text-transparent'}
                                                        ${isSelected ? 'bg-brand-500/20 ring-2 ring-brand-500/50' : 'bg-surface-800 hover:bg-surface-700'}
                                                        ${c % 3 === 2 && c < 8 ? 'border-r-2 border-r-white/30' : 'border-r border-r-white/5'}
                                                        ${r % 3 === 2 && r < 8 ? 'border-b-2 border-b-white/30' : 'border-b border-b-white/5'}
                                                    `}>
                                                    {val || '·'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {result.selectedCell >= 0 && !result.completed && (
                                        <div className="flex flex-wrap justify-center gap-1 mt-2">
                                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                                <button key={n} onClick={() => handleSudokuInput(result.selectedCell, n)}
                                                    className="w-8 h-8 rounded-lg bg-surface-800 border border-white/10 text-sm font-bold text-sky-400 hover:bg-brand-500/20 transition-all hover:scale-110">
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {result.completed && <button onClick={() => initGame('sudoku')} className="px-4 py-2 mt-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm">Play Again</button>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ CHESS ═══ */}
                    {activeGame === 'chess' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">♟️ {t('dashboard.miniGamesPage.chess')}</h3>
                            {!result && <button onClick={() => initGame('chess')} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-zinc-500 to-zinc-700 text-white text-sm font-semibold shadow-lg">Start Game</button>}
                            {result?.type === 'chess' && (
                                <div className="max-w-[320px] mx-auto space-y-3">
                                    <p className="text-[11px] text-surface-200/50">
                                        {result.status !== 'playing' ? result.message : result.turn === 'w' ? '⚪ Your turn (White)' : '⚫ Bot thinking...'}
                                    </p>
                                    <div className="grid grid-cols-8 border-4 border-surface-700 rounded-sm overflow-hidden">
                                        {result.board.map((piece, i) => {
                                            const row = Math.floor(i / 8), col = i % 8;
                                            const isDark = (row + col) % 2 === 1;
                                            const isSelected = result.selectedPiece === i;
                                            const isValidTarget = result.validMoves.includes(i);
                                            const isLastMove = result.lastMove.includes(i);
                                            const isWhite = pieceColor(piece) === 'w';
                                            return (
                                                <button key={i} onClick={() => {
                                                    if (result.status !== 'playing' || result.turn !== 'w') return;
                                                    // If clicking a valid move target, execute the move
                                                    if (isValidTarget) {
                                                        setResult(prev => {
                                                            const b = [...prev.board];
                                                            const captured = b[i];
                                                            b[i] = b[prev.selectedPiece];
                                                            b[prev.selectedPiece] = '';
                                                            // Pawn promotion
                                                            if (b[i] === '♙' && row === 0) b[i] = '♕';
                                                            if (captured === '♚') return { ...prev, board: b, status: 'won', message: '🎉 You win! King captured!', selectedPiece: -1, validMoves: [], lastMove: [prev.selectedPiece, i] };
                                                            // Bot plays after small delay
                                                            setTimeout(() => {
                                                                setResult(prev2 => {
                                                                    if (!prev2 || prev2.status !== 'playing') return prev2;
                                                                    const b2 = [...prev2.board];
                                                                    const bot = chessBotMove(b2);
                                                                    if (bot.from < 0) return { ...prev2, status: 'won', message: '🎉 Bot has no moves!', turn: 'w' };
                                                                    const cap = b2[bot.to];
                                                                    b2[bot.to] = b2[bot.from];
                                                                    b2[bot.from] = '';
                                                                    if (b2[bot.to] === '♟' && Math.floor(bot.to / 8) === 7) b2[bot.to] = '♛';
                                                                    if (cap === '♔') return { ...prev2, board: b2, status: 'lost', message: '😔 Bot captured your King!', selectedPiece: -1, validMoves: [], lastMove: [bot.from, bot.to] };
                                                                    return { ...prev2, board: b2, turn: 'w', selectedPiece: -1, validMoves: [], moveCount: prev2.moveCount + 1, lastMove: [bot.from, bot.to], message: '' };
                                                                });
                                                            }, 400);
                                                            return { ...prev, board: b, turn: 'b', selectedPiece: -1, validMoves: [], moveCount: prev.moveCount + 1, lastMove: [prev.selectedPiece, i], message: '' };
                                                        });
                                                    } else if (isWhite && piece) {
                                                        // Select own piece
                                                        const mvs = getChessMoves(result.board, i);
                                                        setResult(prev => ({ ...prev, selectedPiece: prev.selectedPiece === i ? -1 : i, validMoves: prev.selectedPiece === i ? [] : mvs }));
                                                    } else {
                                                        setResult(prev => ({ ...prev, selectedPiece: -1, validMoves: [] }));
                                                    }
                                                }}
                                                className={`aspect-square flex items-center justify-center text-2xl transition-all cursor-pointer
                                                    ${isDark ? 'bg-emerald-900/60' : 'bg-emerald-100/80'}
                                                    ${isSelected ? 'ring-2 ring-inset ring-yellow-400 bg-yellow-500/30' : ''}
                                                    ${isValidTarget ? (piece ? 'ring-2 ring-inset ring-red-400 bg-red-500/20' : 'ring-2 ring-inset ring-blue-400 bg-blue-500/20') : ''}
                                                    ${isLastMove ? 'bg-amber-500/20' : ''}
                                                `}>
                                                    <span className="drop-shadow-xl">{piece}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {result.status !== 'playing' && (
                                        <div className="space-y-2">
                                            <p className={`text-sm font-bold ${result.status === 'won' ? 'text-emerald-400' : 'text-red-400'}`}>{result.message}</p>
                                            <button onClick={() => initGame('chess')} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm">Play Again</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ RANDOM NUMBER ═══ */}
                    {activeGame === 'randNumber' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">💯 {t('dashboard.miniGamesPage.randNumber')}</h3>
                            <button onClick={() => playQuick('randNumber')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-semibold shadow-lg">Generate (1-100)</button>
                            {result?.type === 'randNumber' && !animating && (
                                <div className="p-6 bg-surface-900 rounded-2xl animate-in zoom-in mt-4 shadow-inner">
                                    <p className="text-6xl font-black text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">{result.value}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ RANDOM CHOICE ═══ */}
                    {activeGame === 'randChoice' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🎯 {t('dashboard.miniGamesPage.randChoice')}</h3>
                            <button onClick={() => playQuick('randChoice')} disabled={animating} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-sm font-semibold shadow-lg">Pick Random</button>
                            {result?.type === 'randChoice' && !animating && (
                                <div className="p-6 bg-surface-900 rounded-2xl animate-in zoom-in mt-4 border border-fuchsia-500/20 shadow-[0_0_20px_rgba(217,70,239,0.15)]">
                                    <p className="text-3xl font-black text-fuchsia-400">{result.value}</p>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}

            {/* Empty state */}
            {!activeGame && (
                <div className="glass-card p-8 text-center space-y-2 border border-white/[0.04]">
                    <p className="text-4xl mb-3">🎮</p>
                    <p className="text-sm text-surface-200/60 font-medium">{t('dashboard.miniGamesPage.emptyDesc')}</p>
                    <p className="text-[10px] text-surface-200/30 uppercase tracking-widest">{t('dashboard.miniGamesPage.emptyHint')}</p>
                </div>
            )}
        </div>
    );
}
