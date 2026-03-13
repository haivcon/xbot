import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Wallet, Loader2, RefreshCw, TrendingUp, TrendingDown, PieChart,
    Coins, DollarSign, BarChart3, ArrowUpRight, ExternalLink, ChevronRight,
} from 'lucide-react';

function formatUSD(n) {
    const num = Number(n || 0);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function formatAmount(n) {
    const num = Number(n || 0);
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    if (num < 0.001 && num > 0) return num.toFixed(6);
    return num.toFixed(2);
}

const GRADIENT_COLORS = [
    'from-brand-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-500',
    'from-blue-500 to-indigo-500',
    'from-rose-500 to-red-500',
];

export default function PortfolioPage() {
    const { t } = useTranslation();
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [portfolioData, setPortfolioData] = useState([]);
    const [expandedWallet, setExpandedWallet] = useState(null);

    const loadPortfolio = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const walletData = await api.request('/market/wallets');
            const walletList = walletData?.wallets || walletData || [];
            setWallets(walletList);

            // Load balances for each wallet in parallel
            const results = await Promise.allSettled(
                walletList.map(async (w) => {
                    try {
                        const id = w.id || w._id;
                        const data = await api.request(`/market/wallets/${id}/balance`);
                        return { wallet: w, balances: data };
                    } catch { return { wallet: w, balances: null }; }
                })
            );

            setPortfolioData(results.map(r => r.status === 'fulfilled' ? r.value : { wallet: {}, balances: null }));
        } catch (err) {
            console.error('Portfolio load failed:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

    // Calculate aggregate totals
    const totalValue = portfolioData.reduce((sum, pd) => {
        const val = Number(pd.balances?.totalValue || pd.balances?.total || 0);
        return sum + val;
    }, 0);

    // Collect all tokens across wallets
    const allTokens = [];
    portfolioData.forEach(pd => {
        const tokens = pd.balances?.tokens || pd.balances?.tokenAssets || [];
        tokens.forEach(tk => {
            const value = Number(tk.tokenPrice || tk.price || 0) * Number(tk.holdingAmount || tk.balance || tk.amount || 0);
            const existing = allTokens.find(t => t.symbol === (tk.tokenSymbol || tk.symbol));
            if (existing) {
                existing.value += value;
                existing.amount += Number(tk.holdingAmount || tk.balance || tk.amount || 0);
            } else {
                allTokens.push({
                    symbol: tk.tokenSymbol || tk.symbol || '?',
                    name: tk.tokenName || tk.name || '',
                    logo: tk.tokenLogoUrl || tk.logoUrl || '',
                    price: Number(tk.tokenPrice || tk.price || 0),
                    amount: Number(tk.holdingAmount || tk.balance || tk.amount || 0),
                    value,
                    change24h: Number(tk.priceChange24h || tk.change24h || 0),
                });
            }
        });
    });
    allTokens.sort((a, b) => b.value - a.value);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center space-y-3">
                    <Loader2 size={24} className="animate-spin text-brand-400 mx-auto" />
                    <p className="text-sm text-surface-200/40">{t('dashboard.portfolioPage.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-brand-500/20 border border-white/5 flex items-center justify-center">
                        <PieChart size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.portfolioPage.title')}</h1>
                        <p className="text-xs text-surface-200/40">{t('dashboard.portfolioPage.subtitle')}</p>
                    </div>
                </div>
                <button onClick={() => loadPortfolio(true)} disabled={refreshing}
                    className="p-2.5 rounded-xl bg-surface-800/60 border border-white/5 hover:border-white/10 text-surface-200/50 hover:text-brand-400 transition-all">
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Total Value Card */}
            <div className="glass-card p-6 bg-gradient-to-br from-brand-500/5 to-emerald-500/5">
                <p className="text-xs text-surface-200/40 uppercase tracking-widest font-semibold mb-1">{t('dashboard.portfolioPage.totalValue')}</p>
                <p className="text-3xl font-bold text-surface-100">{formatUSD(totalValue)}</p>
                <p className="text-xs text-surface-200/40 mt-1">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''} · {allTokens.length} token{allTokens.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Wallet Cards */}
            {portfolioData.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                        <Wallet size={16} className="text-brand-400" /> Wallets
                    </h2>
                    {portfolioData.map((pd, i) => {
                        const w = pd.wallet;
                        const addr = w.address || w.wallet || '';
                        const shortAddr = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '?';
                        const walletValue = Number(pd.balances?.totalValue || pd.balances?.total || 0);
                        const tokens = pd.balances?.tokens || pd.balances?.tokenAssets || [];
                        const isExpanded = expandedWallet === i;
                        const gradientClass = GRADIENT_COLORS[i % GRADIENT_COLORS.length];

                        return (
                            <div key={i} className="glass-card overflow-hidden">
                                <button onClick={() => setExpandedWallet(isExpanded ? null : i)}
                                    className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-white/3 transition-colors">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                        {(w.name || `W${i + 1}`)[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-surface-100">{w.name || `Wallet ${i + 1}`}</p>
                                        <p className="text-[10px] text-surface-200/30 font-mono">{shortAddr}</p>
                                    </div>
                                    <div className="text-right mr-2">
                                        <p className="text-sm font-bold text-surface-100">{formatUSD(walletValue)}</p>
                                        <p className="text-[10px] text-surface-200/30">{tokens.length} tokens</p>
                                    </div>
                                    <ChevronRight size={14} className={`text-surface-200/20 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </button>
                                {isExpanded && tokens.length > 0 && (
                                    <div className="border-t border-white/5 px-4 py-2 space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                                        {tokens.sort((a, b) => {
                                            const va = Number(a.tokenPrice || a.price || 0) * Number(a.holdingAmount || a.balance || a.amount || 0);
                                            const vb = Number(b.tokenPrice || b.price || 0) * Number(b.holdingAmount || b.balance || b.amount || 0);
                                            return vb - va;
                                        }).map((tk, j) => {
                                            const val = Number(tk.tokenPrice || tk.price || 0) * Number(tk.holdingAmount || tk.balance || tk.amount || 0);
                                            return (
                                                <div key={j} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/3 transition-colors">
                                                    {tk.tokenLogoUrl || tk.logoUrl ? (
                                                        <img src={tk.tokenLogoUrl || tk.logoUrl} alt="" className="w-6 h-6 rounded-full" onError={e => { e.target.style.display = 'none'; }} />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full bg-surface-700 flex items-center justify-center text-[10px] text-surface-200/40">
                                                            {(tk.tokenSymbol || tk.symbol || '?')[0]}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs font-semibold text-surface-100">{tk.tokenSymbol || tk.symbol}</span>
                                                        <span className="block text-[9px] text-surface-200/30">{formatAmount(tk.holdingAmount || tk.balance || tk.amount)}</span>
                                                    </div>
                                                    <span className="text-xs text-surface-200/60 font-mono">{formatUSD(val)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* All Holdings */}
            {allTokens.length > 0 && (
                <div className="glass-card p-5 space-y-3">
                    <h2 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                        <Coins size={16} className="text-amber-400" /> All Holdings
                    </h2>
                    <div className="divide-y divide-white/5">
                        {allTokens.slice(0, 20).map((tk, i) => (
                            <div key={i} className="flex items-center gap-3 py-2.5">
                                <span className="text-[10px] text-surface-200/20 w-5">{i + 1}</span>
                                {tk.logo ? (
                                    <img src={tk.logo} alt="" className="w-7 h-7 rounded-full" onError={e => { e.target.style.display = 'none'; }} />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500/20 to-brand-500/20 flex items-center justify-center text-[10px] text-purple-400 font-bold">
                                        {tk.symbol[0]}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-surface-100">{tk.symbol}</p>
                                    <p className="text-[10px] text-surface-200/30">{formatAmount(tk.amount)} @ ${tk.price < 0.01 ? tk.price.toFixed(6) : tk.price.toFixed(2)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-surface-100">{formatUSD(tk.value)}</p>
                                    {tk.change24h !== 0 && (
                                        <p className={`text-[10px] font-medium flex items-center gap-0.5 justify-end ${tk.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {tk.change24h >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                            {tk.change24h >= 0 ? '+' : ''}{tk.change24h.toFixed(2)}%
                                        </p>
                                    )}
                                </div>
                                {/* Portfolio allocation bar */}
                                {totalValue > 0 && (
                                    <div className="w-12 h-1.5 rounded-full bg-surface-800/60 overflow-hidden">
                                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500"
                                            style={{ width: `${Math.min(100, (tk.value / totalValue) * 100)}%` }} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {allTokens.length > 20 && (
                        <p className="text-[10px] text-surface-200/30 text-center">...and {allTokens.length - 20} more tokens</p>
                    )}
                </div>
            )}

            {/* Empty State */}
            {wallets.length === 0 && (
                <div className="glass-card p-12 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-brand-500/10 flex items-center justify-center mx-auto">
                        <Wallet size={28} className="text-emerald-400/50" />
                    </div>
                    <h3 className="text-sm font-semibold text-surface-200/60">{t('dashboard.portfolioPage.noWallets')}</h3>
                    <p className="text-[11px] text-surface-200/30 max-w-xs mx-auto">
                        {t('dashboard.portfolioPage.noWalletsHint')}
                    </p>
                </div>
            )}
        </div>
    );
}
