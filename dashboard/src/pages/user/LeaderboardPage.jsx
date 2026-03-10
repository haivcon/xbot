import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { Trophy, Medal, Crown, RefreshCw } from 'lucide-react';

export default function LeaderboardPage() {
    const { t } = useTranslation();
    const [data, setData] = useState([]);
    const [gameType, setGameType] = useState('sudoku');
    const [loading, setLoading] = useState(true);

    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const result = await api.get(`/user/leaderboard?gameType=${gameType}`);
            setData(result.leaderboard || []);
        } catch { /* handled */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchLeaderboard(); }, [gameType]);

    const gameTypes = [
        { id: 'sudoku', label: 'Sudoku' },
        { id: 'tictactoe', label: 'Tic-Tac-Toe' },
        { id: 'flipcard', label: 'Flip Card' },
        { id: 'wordle', label: 'Wordle' },
    ];

    const getRankIcon = (index) => {
        if (index === 0) return <Crown size={16} className="text-amber-400" />;
        if (index === 1) return <Medal size={16} className="text-slate-300" />;
        if (index === 2) return <Medal size={16} className="text-amber-600" />;
        return <span className="text-xs text-surface-200/40 w-4 text-center">{index + 1}</span>;
    };

    const getRankBg = (index) => {
        if (index === 0) return 'bg-amber-500/5 border-amber-500/10';
        if (index === 1) return 'bg-slate-300/5 border-slate-300/10';
        if (index === 2) return 'bg-amber-600/5 border-amber-600/10';
        return 'border-white/5';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.leaderboard')}</h1>
                <button onClick={fetchLeaderboard} className="btn-secondary !py-2 !px-3">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Game filter */}
            <div className="flex flex-wrap bg-surface-800/50 rounded-xl p-1 w-fit gap-1">
                {gameTypes.map(g => (
                    <button
                        key={g.id}
                        onClick={() => setGameType(g.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${gameType === g.id ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                    >
                        {g.label}
                    </button>
                ))}
            </div>

            {/* Leaderboard */}
            {loading ? (
                <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : data.length === 0 ? (
                <div className="glass-card p-8 text-center text-surface-200/40">
                    <Trophy size={40} className="mx-auto mb-3 text-surface-200/20" />
                    <p>{t('dashboard.common.noData')}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {data.map((player, i) => (
                        <div key={player.userId || i} className={`glass-card p-4 flex items-center gap-4 border ${getRankBg(i)}`}>
                            <div className="w-8 flex items-center justify-center">{getRankIcon(i)}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-surface-100 truncate">{player.userName || 'Unknown'}</p>
                                <div className="flex items-center gap-3 text-xs text-surface-200/50 mt-0.5">
                                    <span>{player.wins || 0}W / {player.losses || 0}L</span>
                                    <span>{player.gamesPlayed || 0} games</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold gradient-text">{player.score?.toLocaleString() || 0}</p>
                                <p className="text-[10px] text-surface-200/40">score</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
