import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import {
    Loader2, RefreshCw, TrendingUp, TrendingDown, BarChart3,
    Flame, DollarSign, Trophy, Search, ChevronDown,
} from 'lucide-react';

const TABS = [
    { key: 'trending', label: '🔥 Trending', sortBy: '2', icon: Flame },
    { key: 'volume', label: '📊 Volume', sortBy: '3', icon: BarChart3 },
    { key: 'marketcap', label: '💎 Market Cap', sortBy: '5', icon: DollarSign },
];

const CHAINS = [
    { value: '501', label: 'Solana' },
    { value: '1', label: 'Ethereum' },
    { value: '56', label: 'BSC' },
    { value: '8453', label: 'Base' },
    { value: '196', label: 'X Layer' },
];

const TIMEFRAMES = [
    { value: '1', label: '5m' },
    { value: '2', label: '1h' },
    { value: '3', label: '4h' },
    { value: '4', label: '24h' },
];

function formatUSD(n) {
    const num = Number(n || 0);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    if (num < 0.01 && num > 0) return `$${num.toFixed(6)}`;
    return `$${num.toFixed(2)}`;
}

export default function DiscoveryPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('trending');
    const [chain, setChain] = useState('501');
    const [timeFrame, setTimeFrame] = useState('4');
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);

    const currentTab = TABS.find(t => t.key === activeTab) || TABS[0];

    const loadTokens = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.request('/market/top-tokens', {
                params: { chains: chain, sortBy: currentTab.sortBy, timeFrame }
            });
            setTokens(data?.tokens || data || []);
        } catch (err) {
            console.error('Failed to load tokens:', err);
            setTokens([]);
        } finally {
            setLoading(false);
        }
    }, [chain, currentTab.sortBy, timeFrame]);

    useEffect(() => { loadTokens(); }, [loadTokens]);

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-white/5 flex items-center justify-center">
                        <Trophy size={20} className="text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-surface-100">🔍 Token Discovery</h1>
                        <p className="text-xs text-surface-200/40">Trending · Volume · Market Cap Rankings</p>
                    </div>
                </div>
                <button onClick={loadTokens} disabled={loading}
                    className="p-2.5 rounded-xl bg-surface-800/60 border border-white/5 hover:border-white/10 text-surface-200/50 hover:text-brand-400 transition-all">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-surface-800/40 rounded-xl border border-white/5">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-all ${activeTab === tab.key
                                ? 'bg-brand-500/20 text-brand-300 font-semibold shadow-sm'
                                : 'text-surface-200/50 hover:text-surface-200/80'}`}>
                            <Icon size={13} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[10px] text-surface-200/30 uppercase tracking-wider font-semibold">Chain:</span>
                {CHAINS.map(c => (
                    <button key={c.value} onClick={() => setChain(c.value)}
                        className={`px-2.5 py-1 text-[11px] rounded-lg border transition-all ${chain === c.value
                            ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 font-semibold'
                            : 'bg-surface-800/40 border-white/5 text-surface-200/40 hover:border-white/10'}`}>
                        {c.label}
                    </button>
                ))}
                <div className="w-px h-4 bg-white/10 mx-1" />
                <span className="text-[10px] text-surface-200/30 uppercase tracking-wider font-semibold">Time:</span>
                {TIMEFRAMES.map(tf => (
                    <button key={tf.value} onClick={() => setTimeFrame(tf.value)}
                        className={`px-2.5 py-1 text-[11px] rounded-lg border transition-all ${timeFrame === tf.value
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold'
                            : 'bg-surface-800/40 border-white/5 text-surface-200/40 hover:border-white/10'}`}>
                        {tf.label}
                    </button>
                ))}
            </div>

            {/* Token Table */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
            ) : tokens.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Search size={32} className="text-amber-400/30 mx-auto mb-3" />
                    <p className="text-sm text-surface-200/40">No tokens found for this filter</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-white/5 text-[10px] text-surface-200/30 uppercase tracking-wider font-semibold">
                        <span className="col-span-1">#</span>
                        <span className="col-span-3">Token</span>
                        <span className="col-span-2 text-right">Price</span>
                        <span className="col-span-2 text-right">24h</span>
                        <span className="col-span-2 text-right">Volume</span>
                        <span className="col-span-2 text-right">MCap</span>
                    </div>
                    {/* Rows */}
                    <div className="divide-y divide-white/3">
                        {tokens.slice(0, 50).map((tok, i) => {
                            const sym = tok.tokenSymbol || tok.symbol || '?';
                            const price = Number(tok.price || 0);
                            const change = Number(tok.priceChangePercent24H || tok.change24h || 0);
                            const vol = Number(tok.volume24H || tok.volume || 0);
                            const mcap = Number(tok.marketCap || 0);
                            const addr = tok.tokenContractAddress || tok.address || '';
                            const chainIdx = tok.chainIndex || tok.chainId || chain;

                            return (
                                <button key={i} onClick={() => navigate(`/token-lookup?chain=${chainIdx}&token=${addr}`)}
                                    className="grid grid-cols-12 gap-2 px-4 py-3 w-full text-left hover:bg-white/3 transition-colors group">
                                    <span className="col-span-1 text-[11px] text-surface-200/20 self-center">
                                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                                    </span>
                                    <div className="col-span-3 flex items-center gap-2 min-w-0 self-center">
                                        {tok.tokenLogoUrl || tok.logoUrl ? (
                                            <img src={tok.tokenLogoUrl || tok.logoUrl} alt="" className="w-7 h-7 rounded-full flex-shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                                        ) : (
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500/20 to-brand-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold flex-shrink-0">
                                                {sym[0]}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-surface-100 group-hover:text-brand-300 transition-colors truncate">{sym}</p>
                                            <p className="text-[9px] text-surface-200/20 truncate">{tok.tokenName || tok.name || ''}</p>
                                        </div>
                                    </div>
                                    <span className="col-span-2 text-right text-xs text-surface-200/70 self-center font-mono">
                                        {price < 0.01 ? `$${price.toFixed(6)}` : `$${price.toFixed(4)}`}
                                    </span>
                                    <span className={`col-span-2 text-right text-xs font-semibold self-center flex items-center justify-end gap-0.5 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                    </span>
                                    <span className="col-span-2 text-right text-xs text-surface-200/50 self-center">{formatUSD(vol)}</span>
                                    <span className="col-span-2 text-right text-xs text-surface-200/50 self-center">{formatUSD(mcap)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
