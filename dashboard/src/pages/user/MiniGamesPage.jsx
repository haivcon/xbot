import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
    Hand, Sparkles, HelpCircle, TrendingUp, TrendingDown,
    Shuffle, Cookie, Gamepad2, RotateCcw, Trophy, ArrowLeft,
} from 'lucide-react';

const GAME_LIST = [
    { id: 'dice', icon: '🎲', label: 'Dice', desc: 'Roll the dice', color: 'from-blue-500 to-cyan-500' },
    { id: 'rps', icon: '✊', label: 'Rock Paper Scissors', desc: 'Classic hand game', color: 'from-purple-500 to-pink-500' },
    { id: 'fortune', icon: '🔮', label: 'Fortune', desc: 'Get your fortune told', color: 'from-amber-500 to-orange-500' },
    { id: 'longshort', icon: '📊', label: 'Long / Short', desc: 'Random trading signal', color: 'from-emerald-500 to-teal-500' },
    { id: 'quiz', icon: '🧠', label: 'Math Quiz', desc: 'Test your math skills', color: 'from-rose-500 to-red-500' },
    { id: 'coin', icon: '🪙', label: 'Coin Flip', desc: 'Heads or tails', color: 'from-yellow-500 to-amber-500' },
];

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const RPS_OPTIONS = [
    { value: 'rock', icon: '🪨', label: 'Rock' },
    { value: 'paper', icon: '📄', label: 'Paper' },
    { value: 'scissors', icon: '✂️', label: 'Scissors' },
];

const FORTUNES = [
    "Good luck will come your way soon ✨",
    "A pleasant surprise is in store for you 🎁",
    "Your hard work will pay off 💪",
    "An exciting opportunity is coming 🚀",
    "Trust your instincts 🧭",
    "A new friendship will bring joy 🤝",
    "Your creativity will flourish 🎨",
    "Patience will bring rewards ⏳",
    "A great journey awaits you 🌍",
    "Success is on the horizon 🌅",
    "The stars align in your favor 🌟",
    "A windfall may be approaching 💰",
];

export default function MiniGamesPage() {
    const { t } = useTranslation();
    const [activeGame, setActiveGame] = useState(null);
    const [result, setResult] = useState(null);
    const [animating, setAnimating] = useState(false);
    const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0, games: 0 });

    const playGame = useCallback((game, params = {}) => {
        setAnimating(true);
        setResult(null);
        setTimeout(() => {
            let res;
            switch (game) {
                case 'dice': {
                    const count = params.count || 2;
                    const faces = params.faces || 6;
                    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * faces) + 1);
                    const total = rolls.reduce((s, v) => s + v, 0);
                    res = { type: 'dice', rolls, total, faces };
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
                    setStats(s => ({
                        ...s,
                        games: s.games + 1,
                        wins: s.wins + (outcome === 'win' ? 1 : 0),
                        losses: s.losses + (outcome === 'lose' ? 1 : 0),
                        draws: s.draws + (outcome === 'draw' ? 1 : 0),
                    }));
                    break;
                }
                case 'fortune': {
                    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
                    res = { type: 'fortune', fortune };
                    break;
                }
                case 'longshort': {
                    const isLong = Math.random() > 0.5;
                    const leverage = Math.floor(Math.random() * 100) + 1;
                    res = { type: 'longshort', position: isLong ? 'LONG' : 'SHORT', leverage, icon: isLong ? '📈' : '📉' };
                    break;
                }
                case 'quiz': {
                    const num1 = Math.floor(Math.random() * 20) + 1;
                    const num2 = Math.floor(Math.random() * 20) + 1;
                    const ops = ['+', '-', '×'];
                    const op = ops[Math.floor(Math.random() * ops.length)];
                    let answer;
                    switch (op) {
                        case '+': answer = num1 + num2; break;
                        case '-': answer = num1 - num2; break;
                        case '×': answer = num1 * num2; break;
                    }
                    const options = [answer, answer + Math.floor(Math.random() * 5) + 1, answer - Math.floor(Math.random() * 5) - 1, answer + Math.floor(Math.random() * 10) + 5]
                        .sort(() => Math.random() - 0.5);
                    res = { type: 'quiz', question: `${num1} ${op} ${num2} = ?`, options, answer, answered: false };
                    break;
                }
                case 'coin': {
                    const side = Math.random() > 0.5 ? 'heads' : 'tails';
                    res = { type: 'coin', side };
                    break;
                }
            }
            setResult(res);
            setAnimating(false);
        }, 600);
    }, []);

    const answerQuiz = (choice) => {
        if (!result || result.answered) return;
        setResult(prev => ({ ...prev, answered: true, userAnswer: choice, correct: choice === prev.answer }));
        setStats(s => ({ ...s, games: s.games + 1, wins: s.wins + (choice === result.answer ? 1 : 0), losses: s.losses + (choice !== result.answer ? 1 : 0) }));
    };

    const rpsIcons = { rock: '🪨', paper: '📄', scissors: '✂️' };

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
                        <span className="text-emerald-400"><Trophy size={10} className="inline" /> {stats.wins}W</span>
                        <span className="text-red-400">{stats.losses}L</span>
                        <span className="text-surface-200/40">{stats.draws}D</span>
                    </div>
                )}
            </div>

            {/* Game Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {GAME_LIST.map(game => (
                    <button key={game.id} onClick={() => { setActiveGame(game.id); setResult(null); }}
                        className={`glass-card p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] group ${
                            activeGame === game.id ? 'ring-2 ring-brand-500/40' : ''
                        }`}>
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-lg mb-2 group-hover:shadow-lg transition-shadow`}>
                            {game.icon}
                        </div>
                        <p className="text-sm font-semibold text-surface-100">{game.label}</p>
                        <p className="text-[10px] text-surface-200/40 mt-0.5">{game.desc}</p>
                    </button>
                ))}
            </div>

            {/* Active Game Area */}
            {activeGame && (
                <div className="glass-card p-6 space-y-4">
                    {/* Back to game list */}
                    <button onClick={() => { setActiveGame(null); setResult(null); }}
                        className="flex items-center gap-1.5 text-xs text-surface-200/40 hover:text-brand-400 transition-colors mb-2">
                        <ArrowLeft size={14} /> {t('dashboard.mySpace.back')}
                    </button>
                    {/* Dice */}
                    {activeGame === 'dice' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🎲 Roll the Dice</h3>
                            {result?.type === 'dice' && !animating ? (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex justify-center gap-4">
                                        {result.rolls.map((r, i) => {
                                            const DiceIcon = result.faces <= 6 ? DICE_ICONS[r - 1] : null;
                                            return (
                                                <div key={i} className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                                                    {DiceIcon ? <DiceIcon size={32} className="text-blue-400" /> : <span className="text-2xl font-bold text-blue-400">{r}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-lg font-bold text-surface-100">Total: {result.total}</p>
                                </div>
                            ) : animating ? (
                                <div className="flex justify-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-surface-800/60 animate-pulse flex items-center justify-center">
                                        <Shuffle size={24} className="text-surface-200/30 animate-spin" />
                                    </div>
                                    <div className="w-16 h-16 rounded-2xl bg-surface-800/60 animate-pulse flex items-center justify-center" style={{ animationDelay: '150ms' }}>
                                        <Shuffle size={24} className="text-surface-200/30 animate-spin" />
                                    </div>
                                </div>
                            ) : null}
                            <button onClick={() => playGame('dice')} disabled={animating}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50">
                                    {animating ? <Shuffle size={14} className="inline animate-spin mr-1" /> : <RotateCcw size={14} className="inline mr-1" />}
                                    {result ? 'Roll Again' : 'Roll Dice'}
                            </button>
                        </div>
                    )}

                    {/* Rock Paper Scissors */}
                    {activeGame === 'rps' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">✊ Rock Paper Scissors</h3>
                            {result?.type === 'rps' && !animating ? (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex items-center justify-center gap-6">
                                        <div className="text-center">
                                            <p className="text-4xl">{rpsIcons[result.userChoice]}</p>
                                            <p className="text-[10px] text-surface-200/40 mt-1">You</p>
                                        </div>
                                        <span className="text-lg font-bold text-surface-200/20">VS</span>
                                        <div className="text-center">
                                            <p className="text-4xl">{rpsIcons[result.botChoice]}</p>
                                            <p className="text-[10px] text-surface-200/40 mt-1">Bot</p>
                                        </div>
                                    </div>
                                    <p className={`text-lg font-bold ${
                                        result.outcome === 'win' ? 'text-emerald-400' : result.outcome === 'lose' ? 'text-red-400' : 'text-amber-400'
                                    }`}>
                                        {result.outcome === 'win' ? '🎉 You Win!' : result.outcome === 'lose' ? '😔 You Lose!' : '🤝 Draw!'}
                                    </p>
                                </div>
                            ) : animating ? (
                                <div className="flex justify-center">
                                    <div className="w-20 h-20 rounded-full bg-surface-800/60 animate-pulse flex items-center justify-center">
                                        <Shuffle size={28} className="text-surface-200/30 animate-spin" />
                                    </div>
                                </div>
                            ) : null}
                            <div className="flex justify-center gap-3">
                                {RPS_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => playGame('rps', { choice: opt.value })} disabled={animating}
                                        className="px-5 py-3 rounded-xl bg-surface-800/60 border border-white/5 hover:border-purple-500/30 hover:bg-purple-500/10 text-surface-100 transition-all disabled:opacity-50 flex flex-col items-center gap-1">
                                        <span className="text-2xl">{opt.icon}</span>
                                        <span className="text-[10px] text-surface-200/50">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fortune */}
                    {activeGame === 'fortune' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🔮 Fortune Teller</h3>
                            {result?.type === 'fortune' && !animating ? (
                                <div className="animate-in fade-in">
                                    <div className="bg-gradient-to-br from-amber-500/5 to-purple-500/5 border border-amber-500/10 rounded-2xl px-6 py-5">
                                        <p className="text-lg font-medium text-surface-100 italic">"{result.fortune}"</p>
                                    </div>
                                </div>
                            ) : animating ? (
                                <div className="h-20 flex items-center justify-center">
                                    <span className="text-4xl animate-pulse">🔮</span>
                                </div>
                            ) : null}
                            <button onClick={() => playGame('fortune')} disabled={animating}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all disabled:opacity-50">
                                {result ? '🔮 Ask Again' : '🔮 Tell My Fortune'}
                            </button>
                        </div>
                    )}

                    {/* Long/Short */}
                    {activeGame === 'longshort' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">📊 Long / Short Generator</h3>
                            {result?.type === 'longshort' && !animating ? (
                                <div className="animate-in fade-in space-y-2">
                                    <p className="text-5xl">{result.icon}</p>
                                    <p className={`text-2xl font-black ${result.position === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {result.position}
                                    </p>
                                    <p className="text-lg font-bold text-surface-200/70">{result.leverage}x Leverage</p>
                                </div>
                            ) : animating ? (
                                <div className="flex justify-center gap-4">
                                    <TrendingUp size={32} className="text-emerald-400/30 animate-pulse" />
                                    <TrendingDown size={32} className="text-red-400/30 animate-pulse" />
                                </div>
                            ) : null}
                            <button onClick={() => playGame('longshort')} disabled={animating}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50">
                                {result ? '🔄 Generate Again' : '📊 Generate Signal'}
                            </button>
                            <p className="text-[9px] text-surface-200/25">⚠️ For entertainment only, not financial advice</p>
                        </div>
                    )}

                    {/* Quiz */}
                    {activeGame === 'quiz' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🧠 Math Quiz</h3>
                            {result?.type === 'quiz' && !animating ? (
                                <div className="animate-in fade-in space-y-3">
                                    <p className="text-2xl font-bold text-surface-100">{result.question}</p>
                                    <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                                        {result.options.map((opt, i) => (
                                            <button key={i} onClick={() => answerQuiz(opt)} disabled={result.answered}
                                                className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                                                    result.answered
                                                        ? opt === result.answer
                                                            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                                                            : opt === result.userAnswer
                                                                ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                                                                : 'bg-surface-800/30 border border-transparent text-surface-200/30'
                                                        : 'bg-surface-800/60 border border-white/5 hover:border-purple-500/30 hover:bg-purple-500/10 text-surface-100'
                                                }`}>
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                    {result.answered && (
                                        <p className={`text-sm font-bold ${result.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {result.correct ? '✅ Correct!' : `❌ Wrong! Answer: ${result.answer}`}
                                        </p>
                                    )}
                                </div>
                            ) : animating ? (
                                <div className="h-20 flex items-center justify-center">
                                    <HelpCircle size={32} className="text-surface-200/30 animate-pulse" />
                                </div>
                            ) : null}
                            <button onClick={() => playGame('quiz')} disabled={animating}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 text-white text-sm font-semibold shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50">
                                {result?.answered || !result ? '🧠 New Question' : 'Answer first!'}
                            </button>
                        </div>
                    )}

                    {/* Coin Flip */}
                    {activeGame === 'coin' && (
                        <div className="text-center space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">🪙 Coin Flip</h3>
                            {result?.type === 'coin' && !animating ? (
                                <div className="animate-in fade-in space-y-2">
                                    <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center text-4xl font-bold border-4 ${
                                        result.side === 'heads' ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'bg-gray-500/20 border-gray-400/30 text-gray-300'
                                    }`}>
                                        {result.side === 'heads' ? 'H' : 'T'}
                                    </div>
                                    <p className="text-lg font-bold text-surface-100 capitalize">{result.side}!</p>
                                </div>
                            ) : animating ? (
                                <div className="h-24 flex items-center justify-center">
                                    <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500/20 animate-spin flex items-center justify-center">
                                        <span className="text-2xl">🪙</span>
                                    </div>
                                </div>
                            ) : null}
                            <button onClick={() => playGame('coin')} disabled={animating}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white text-sm font-semibold shadow-lg shadow-yellow-500/25 transition-all disabled:opacity-50">
                                {result ? '🪙 Flip Again' : '🪙 Flip Coin'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {!activeGame && (
                <div className="glass-card p-8 text-center space-y-2">
                    <p className="text-4xl">🎮</p>
                    <p className="text-sm text-surface-200/60">Select a game above to start playing!</p>
                    <p className="text-[10px] text-surface-200/30">Your scores sync with the leaderboard</p>
                </div>
            )}
        </div>
    );
}
