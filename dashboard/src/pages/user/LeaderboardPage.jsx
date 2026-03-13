import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { Trophy, Medal, Crown, RefreshCw, Star, Flame, Zap, Award } from 'lucide-react';

const RANK_BADGES = ['🥇', '🥈', '🥉'];
const RANK_COLORS = [
    'from-amber-500/30 to-yellow-500/30 border-amber-500/40 shadow-amber-500/10',
    'from-slate-400/20 to-slate-300/20 border-slate-400/30 shadow-slate-400/10',
    'from-amber-700/20 to-orange-600/20 border-amber-600/30 shadow-orange-600/10',
];

function PlayerAvatar({ name, rank }) {
    const colors = ['bg-brand-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500'];
    const bg = colors[rank % colors.length];
    return (
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
            {(name || '?')[0].toUpperCase()}
        </div>
    );
}

function WinRateBar({ wins, losses }) {
    const total = wins + losses;
    const rate = total > 0 ? (wins / total * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-brand-500 rounded-full transition-all duration-500"
                    style={{ width: `${rate}%` }} />
            </div>
            <span className="text-[9px] text-surface-200/40 tabular-nums">{rate.toFixed(0)}%</span>
        </div>
    );
}

export default function LeaderboardPage() {
    const { t } = useTranslation();
    const [data, setData] = useState([]);
    const [gameType, setGameType] = useState('sudoku');
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('all'); // 'all' | 'week' | 'month'

    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const result = await api.get(`/user/leaderboard?gameType=${gameType}`);
            setData(result.leaderboard || []);
        } catch { /* handled */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchLeaderboard(); }, [gameType]);

    const gameTypes = [
        { id: 'sudoku', label: '🧩 Sudoku' },
        { id: 'tictactoe', label: '❌ Tic-Tac-Toe' },
        { id: 'flipcard', label: '🃏 Flip Card' },
        { id: 'wordle', label: '📝 Wordle' },
    ];

    const periods = [
        { id: 'all', label: t('dashboard.leaderboard.allTime', 'All Time') },
        { id: 'week', label: t('dashboard.leaderboard.thisWeek', 'This Week') },
        { id: 'month', label: t('dashboard.leaderboard.thisMonth', 'This Month') },
    ];

    const getRankIcon = (index) => {
        if (index === 0) return <Crown size={18} className="text-amber-400 animate-pulse" />;
        if (index === 1) return <Medal size={18} className="text-slate-300" />;
        if (index === 2) return <Medal size={18} className="text-amber-600" />;
        return <span className="text-xs text-surface-200/40 w-5 text-center font-bold">{index + 1}</span>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/20 flex items-center justify-center">
                        <Trophy size={20} className="text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-surface-100">{t('dashboard.sidebar.leaderboard')}</h1>
                        <p className="text-xs text-surface-200/40">{data.length} players</p>
                    </div>
                </div>
                <button onClick={fetchLeaderboard} className="btn-secondary !py-2 !px-3">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-wrap bg-surface-800/50 rounded-xl p-1 gap-1">
                    {gameTypes.map(g => (
                        <button key={g.id} onClick={() => setGameType(g.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                gameType === g.id ? 'bg-brand-500/20 text-brand-400 shadow-sm' : 'text-surface-200/50 hover:text-surface-200'
                            }`}>
                            {g.label}
                        </button>
                    ))}
                </div>
                <div className="flex bg-surface-800/50 rounded-xl p-1 gap-1 ml-auto">
                    {periods.map(p => (
                        <button key={p.id} onClick={() => setPeriod(p.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                period === p.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-surface-200/50 hover:text-surface-200'
                            }`}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Podium (Top 3) */}
            {!loading && data.length >= 3 && (
                <div className="grid grid-cols-3 gap-3">
                    {[1, 0, 2].map(idx => {
                        const p = data[idx];
                        return (
                            <div key={idx} className={`glass-card p-4 text-center border transition-all hover:scale-[1.02] ${
                                idx === 0 ? 'ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/5' : ''
                            }`}>
                                <div className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${RANK_COLORS[idx]} border flex items-center justify-center text-2xl mb-2`}>
                                    {RANK_BADGES[idx]}
                                </div>
                                <PlayerAvatar name={p.userName} rank={idx} />
                                <p className="text-sm font-bold text-surface-100 mt-2 truncate">{p.userName || 'Unknown'}</p>
                                <p className="text-xl font-bold gradient-text mt-1">{p.score?.toLocaleString() || 0}</p>
                                <WinRateBar wins={p.wins || 0} losses={p.losses || 0} />
                                <p className="text-[10px] text-surface-200/30 mt-1">{p.gamesPlayed || 0} games</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Full List */}
            {loading ? (
                <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : data.length === 0 ? (
                <div className="glass-card p-8 text-center text-surface-200/40">
                    <Trophy size={40} className="mx-auto mb-3 text-surface-200/20" />
                    <p>{t('dashboard.common.noData')}</p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {data.map((player, i) => (
                        <div key={player.userId || i}
                            className={`glass-card p-4 flex items-center gap-4 border transition-all hover:bg-white/[0.02] ${
                                i < 3 ? `bg-gradient-to-r ${RANK_COLORS[i] || ''}` : 'border-white/5'
                            }`}>
                            <div className="w-8 flex items-center justify-center">{getRankIcon(i)}</div>
                            <PlayerAvatar name={player.userName} rank={i} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-surface-100 truncate">{player.userName || 'Unknown'}</p>
                                    {i < 3 && <Award size={12} className="text-amber-400" />}
                                    {player.streak > 3 && <span className="flex items-center gap-0.5 text-[9px] text-orange-400"><Flame size={10} />{player.streak}</span>}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-surface-200/40">{player.wins || 0}W / {player.losses || 0}L</span>
                                    <WinRateBar wins={player.wins || 0} losses={player.losses || 0} />
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold gradient-text tabular-nums">{player.score?.toLocaleString() || 0}</p>
                                <p className="text-[10px] text-surface-200/40">{player.gamesPlayed || 0} games</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
