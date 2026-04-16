import { useState, useEffect, useCallback } from 'react';
import useAuthStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Play, Square, Search, Copy, Check, TrendingUp, Award, Clock } from 'lucide-react';

const API = '/api/dashboard';

export default function SmartCopyPage() {
    const { token } = useAuthStore();
    const { t } = useTranslation();
    const ns = 'smartCopyPage';
    const [status, setStatus] = useState(null);
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState('');
    const [budget, setBudget] = useState(50);
    const [copiedIndex, setCopiedIndex] = useState(null);

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const fetchData = useCallback(async () => {
        try {
            const [sRes, lRes] = await Promise.all([
                fetch(`${API}/smart-copy/status`, { headers }),
                fetch(`${API}/smart-copy/leaders`, { headers })
            ]);
            if (sRes.ok) setStatus(await sRes.json());
            if (lRes.ok) { const d = await lRes.json(); setLeaders(d.leaders || []); }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [token]);

    useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, [fetchData]);

    const doAction = async (endpoint, body = {}) => {
        setActionLoading(endpoint);
        try {
            await fetch(`${API}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
            await fetchData();
        } catch (e) { console.error(e); }
        setActionLoading('');
    };

    const handleCopy = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (loading) return <div className="p-8 text-center text-surface-200/50">{t(`${ns}.loading`, 'Loading...')}</div>;

    const isActive = status?.isActive;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in-up">
            <div className="mb-8">
                <style dangerouslySetInnerHTML={{__html: `
                    /* Rainbow glow effect for Smart Copy */
                    .smart-copy-glow {
                        position: relative;
                    }
                    .smart-copy-glow::before {
                        content: '';
                        position: absolute;
                        top: -2px; left: -2px; right: -2px; bottom: -2px;
                        background: linear-gradient(45deg, #FF0080, #7928CA, #0070F3, #00DFD8, #FF0080);
                        background-size: 300% 300%;
                        z-index: -1;
                        filter: blur(8px);
                        opacity: 0.15;
                        animation: shift-gradient 4s ease infinite;
                        border-radius: 24px;
                    }
                    @keyframes shift-gradient {
                        0% { background-position: 0% 50% }
                        50% { background-position: 100% 50% }
                        100% { background-position: 0% 50% }
                    }
                `}} />
                <h1 className="text-2xl md:text-3xl font-extrabold text-surface-100 flex items-center gap-3">
                    <span className="text-3xl">🐋</span> 
                    <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
                        {t(`${ns}.title`, 'Smart Copy-Trader')}
                    </span>
                </h1>
                <p className="mt-2 text-sm text-surface-200/60 max-w-2xl">
                    {t(`${ns}.subtitle`, 'Zero-click AI copy-trading — automatically follows top whale & Smart Money traders on X Layer')}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
                {/* ═══ SESSION STATUS ═══ */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                    <div className="glass-card p-6 flex-1 smart-copy-glow overflow-hidden relative">
                        {isActive && (
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-cyan-400"></div>
                        )}
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-surface-100 flex items-center gap-2">
                                <TrendingUp size={20} className="text-brand-400" />
                                {t(`${ns}.copySession`, 'Copy Session')}
                            </h2>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                isActive ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-surface-200/5 text-surface-200/40'
                            }`}>
                                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                                {!isActive && <span className="w-1.5 h-1.5 rounded-full bg-surface-200/30"></span>}
                                {isActive ? t(`${ns}.active`, 'Active') : t(`${ns}.inactive`, 'Inactive')}
                            </span>
                        </div>

                        {isActive && status?.session && (
                            <div className="animate-fade-in">
                                {/* Budget bar */}
                                <div className="mb-6 bg-surface-900/40 rounded-xl p-4 ring-1 ring-white/5">
                                    <div className="flex justify-between text-xs font-semibold mb-2">
                                        <span className="text-surface-200/60 uppercase tracking-wide">{t(`${ns}.budgetUsed`, 'Budget Used')}</span>
                                        <span className="text-surface-100">${Number(status.spent || 0).toFixed(2)} <span className="text-surface-200/40">/ ${Number(status.budget || 0).toFixed(2)}</span></span>
                                    </div>
                                    <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
                                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400 transition-all duration-1000 ease-out"
                                             style={{ width: `${Math.min(100, (status.spent / Math.max(1, status.budget)) * 100)}%` }} />
                                    </div>
                                </div>

                                {/* Stats grid */}
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div className="bg-surface-800/50 rounded-xl p-4 ring-1 ring-white/5 hover:bg-surface-800 transition-colors">
                                        <div className="text-[11px] font-semibold text-surface-200/40 uppercase tracking-widest mb-1">{t(`${ns}.totalCopies`, 'Total Copies')}</div>
                                        <div className="text-2xl font-black text-surface-100">{status.totalCopies || 0}</div>
                                    </div>
                                    <div className="bg-surface-800/50 rounded-xl p-4 ring-1 ring-white/5 hover:bg-surface-800 transition-colors">
                                        <div className="text-[11px] font-semibold text-surface-200/40 uppercase tracking-widest mb-1">{t(`${ns}.pnl`, 'PnL')}</div>
                                        <div className={`text-2xl font-black ${(status.totalPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            ${Number(status.totalPnl || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="bg-surface-800/50 rounded-xl p-3 px-4 ring-1 ring-white/5">
                                        <div className="text-[10px] font-semibold text-surface-200/40 uppercase mb-0.5">{t(`${ns}.remaining`, 'Remaining')}</div>
                                        <div className="text-sm font-bold text-surface-100">${Number(status.remaining || 0).toFixed(2)}</div>
                                    </div>
                                    <div className="bg-surface-800/50 rounded-xl p-3 px-4 ring-1 ring-white/5">
                                        <div className="text-[10px] font-semibold text-surface-200/40 uppercase mb-0.5">{t(`${ns}.polling`, 'Polling')}</div>
                                        <div className={`text-sm font-bold ${status.isPolling ? 'text-cyan-400' : 'text-surface-200/40'}`}>
                                            {status.isPolling ? t(`${ns}.pollingActive`, 'Active') : t(`${ns}.pollingPaused`, 'Paused')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Controls */}
                        {!isActive ? (
                            <div className="mt-auto animate-fade-in-up">
                                <label className="block text-xs font-bold text-surface-200/60 uppercase tracking-wider mb-2">
                                    {t(`${ns}.setBudgetLabel`, 'Budget (USDT):')}
                                </label>
                                <div className="relative mb-6">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-200/40 font-bold">$</span>
                                    <input 
                                        type="number" 
                                        value={budget} 
                                        onChange={e => setBudget(Number(e.target.value))} 
                                        min={5} 
                                        max={10000}
                                        className="w-full bg-surface-900/50 text-surface-100 text-lg font-bold rounded-xl py-3 pl-8 pr-4 outline-none ring-1 ring-white/10 focus:ring-brand-500/50 transition-all hover:bg-surface-800/50"
                                    />
                                </div>
                                <button 
                                    onClick={() => doAction('smart-copy/start', { budgetUsd: budget })} 
                                    disabled={!!actionLoading}
                                    className="w-full group relative flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-brand-500 to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <Play size={18} fill="currentColor" className="relative z-10" />
                                    <span className="relative z-10">{actionLoading === 'smart-copy/start' ? t(`${ns}.btnStarting`, 'Starting...') : t(`${ns}.btnStart`, 'Start Auto Copy')}</span>
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => doAction('smart-copy/stop')} 
                                disabled={!!actionLoading}
                                className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 border border-rose-500/40 text-rose-400 font-bold rounded-xl hover:bg-rose-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                                <Square size={16} fill="currentColor" />
                                <span>{actionLoading === 'smart-copy/stop' ? t(`${ns}.btnStopping`, 'Stopping...') : t(`${ns}.btnStop`, 'Stop Copy Session')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ═══ TOP LEADERS ═══ */}
                <div className="lg:col-span-7">
                    <div className="glass-card p-6 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-surface-100 flex items-center gap-2">
                                <Award size={20} className="text-amber-400" />
                                {t(`${ns}.topTraders`, 'Top Traders')}
                            </h2>
                            <button 
                                onClick={() => doAction('smart-copy/discover')} 
                                disabled={!!actionLoading}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-surface-100 transition-colors disabled:opacity-50"
                            >
                                <Search size={14} className={actionLoading === 'smart-copy/discover' ? 'animate-spin' : ''} />
                                {actionLoading === 'smart-copy/discover' ? '...' : t(`${ns}.btnDiscover`, 'Discover')}
                            </button>
                        </div>

                        {leaders.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface-900/30 rounded-2xl border border-dashed border-white/10">
                                <Search size={32} className="text-surface-200/20 mb-4" />
                                <p className="text-sm text-surface-200/50 max-w-[250px]">
                                    {t(`${ns}.noLeaders`, 'No leaders discovered yet. Click "Discover" to find top traders on X Layer.')}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar max-h-[380px]">
                                {leaders.slice(0, 10).map((l, i) => {
                                    const isTop3 = i < 3;
                                    const medalIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
                                    
                                    return (
                                        <div key={i} className="group flex items-center gap-4 p-4 bg-surface-800/40 rounded-xl ring-1 ring-white/5 hover:bg-surface-800 hover:ring-white/10 transition-all duration-300">
                                            <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold shadow-inner ${isTop3 ? 'bg-surface-900 ring-1 ring-white/10 text-lg' : 'bg-surface-900/50 text-surface-200/50 text-xs'}`}>
                                                {medalIcon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-mono text-sm font-bold text-surface-100" title={l.address}>
                                                        {l.address?.slice(0, 6)}...{l.address?.slice(-4)}
                                                    </span>
                                                    <button 
                                                        onClick={() => handleCopy(l.address, `leader-${i}`)}
                                                        className="text-surface-200/30 hover:text-cyan-400 transition-colors"
                                                    >
                                                        {copiedIndex === `leader-${i}` ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-surface-200/60 font-medium">
                                                    <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-surface-200/80">{l.tag}</span>
                                                    <span>{t(`${ns}.leaderWin`, 'Win')}: <span className="text-surface-100">{Number(l.winRate || 0).toFixed(1)}%</span></span>
                                                    <span>{t(`${ns}.leaderPnl`, 'PnL')}: <span className={`${(l.totalPnlUsd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${Number(l.totalPnlUsd || 0).toFixed(0)}</span></span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-surface-200/40 uppercase font-bold mb-1 tracking-wider">Score</span>
                                                <div className={`px-2.5 py-1 rounded-lg text-xs font-black shadow-inner ${
                                                    l.aiScore > 70 ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' : 
                                                    l.aiScore > 40 ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20' : 
                                                    'bg-surface-200/10 text-surface-200/60'
                                                }`}>
                                                    {l.aiScore}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ RECENT COPY TRADES ═══ */}
            {status?.recentTrades?.length > 0 && (
                <div className="glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <h3 className="text-lg font-bold text-surface-100 flex items-center gap-2 mb-6">
                        <Clock size={20} className="text-purple-400" />
                        {t(`${ns}.recentCopyTrades`, 'Recent Copy Trades')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {status.recentTrades.map((tItem, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 bg-surface-900/40 rounded-xl ring-1 ring-white/5">
                                <div className={`flex items-center justify-center w-10 h-10 rounded-full bg-white/5 ${tItem.action === 'buy' ? 'text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'text-rose-400 shadow-[0_0_15px_rgba(244,67,54,0.15)]'}`}>
                                    <span className="text-xl">{tItem.action === 'buy' ? '🟢' : '🔴'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-bold text-surface-100">${tItem.tokenSymbol}</span>
                                        <span className="font-mono text-[13px] font-bold text-surface-100">${Number(tItem.copyAmountUsd || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[11px] text-surface-200/50">
                                        <span className="truncate">
                                            {t(`${ns}.buyFrom`, 'From')}: <span className="font-mono px-1 py-0.5 rounded bg-white/5 text-surface-200/70">{tItem.leaderAddress?.slice(0, 6)}...</span> ({tItem.leaderTag})
                                        </span>
                                        <span className="flex-shrink-0 text-[10px] tabular-nums bg-white/5 px-1.5 py-0.5 rounded">{tItem.createdAt.split(' ')[1] || tItem.createdAt}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
