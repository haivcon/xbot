import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import {
    ArrowLeftRight, TrendingUp, Fuel, Search, RefreshCw, Loader2,
    ArrowDown, Clock, ExternalLink, ArrowUpRight, ArrowDownRight, Zap,
    Star, StarOff, Settings, Bell, ChevronDown, Wallet, BarChart3,
    Activity, Info, X, Play, Pause, Trash2, Plus, Repeat,
    Copy, Check, Send, Download,
    History, PieChart, AlertTriangle
} from 'lucide-react';

const TransferHistorySection = lazy(() => import('./TransferHistoryPage'));
const TokenLookupSection = lazy(() => import('./TokenLookupPage'));
const MemeScannerSection = lazy(() => import('./MemeScannerPage'));

/* ═══════════════════════════════════════════
   Constants & Helpers
   ═══════════════════════════════════════════ */
const CHAINS = {
    '196': { name: 'X Layer', icon: '⬡', explorer: 'xlayer' },
    '1':   { name: 'Ethereum', icon: 'Ξ', explorer: 'eth' },
    '56':  { name: 'BSC', icon: '⬡', explorer: 'bsc' },
    '137': { name: 'Polygon', icon: '⬡', explorer: 'polygon' },
    '42161': { name: 'Arbitrum', icon: '⬡', explorer: 'arbitrum' },
    '8453': { name: 'Base', icon: '⬡', explorer: 'base' },
};

const EXPLORERS = {
    '196': 'https://www.okx.com/web3/explorer/xlayer',
    '1': 'https://etherscan.io',
    '56': 'https://bscscan.com',
    '137': 'https://polygonscan.com',
    '42161': 'https://arbiscan.io',
    '8453': 'https://basescan.org',
};
const getExplorerTxUrl = (chainIndex, txHash) => `${EXPLORERS[chainIndex] || EXPLORERS['196']}/tx/${txHash}`;

/* #5: Skeleton shimmer loader */
function Skeleton({ className = '', count = 1 }) {
    return (<>{Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />
    ))}</>);
}

/* #6: Global toast notification system */
function ToastNotification({ toast, onDismiss }) {
    if (!toast) return null;
    return createPortal(
        <div className={`fixed top-5 right-5 z-[9999] max-w-sm px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl text-sm font-medium flex items-center gap-2.5 animate-slideInRight ${toast.ok ? 'bg-emerald-500/15 border-emerald-500/20 text-emerald-300' : 'bg-red-500/15 border-red-500/20 text-red-300'}`}>
            {toast.ok ? <Check size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-red-400" />}
            <span className="flex-1">{toast.msg}</span>
            {toast.txHash && <a href={toast.txUrl} target="_blank" rel="noopener" className="text-brand-400 hover:underline text-xs flex items-center gap-0.5"><ExternalLink size={10} /> Tx</a>}
            <button onClick={onDismiss} className="text-surface-200/30 hover:text-surface-100"><X size={14} /></button>
        </div>,
        document.body
    );
}
function useToast() {
    const [toast, setToast] = useState(null);
    const timerRef = useRef(null);
    const show = useCallback((msg, ok = true, txHash = null, txUrl = '') => {
        clearTimeout(timerRef.current);
        setToast({ msg, ok, txHash, txUrl });
        timerRef.current = setTimeout(() => setToast(null), 5000);
    }, []);
    const dismiss = useCallback(() => { clearTimeout(timerRef.current); setToast(null); }, []);
    return { toast, show, dismiss };
}

/* #10: Swap success confetti burst */
const CONFETTI_COLORS = ['#34d399', '#818cf8', '#f59e0b', '#f472b6', '#22d3ee'];
const CONFETTI_PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
    left: `${30 + Math.random() * 40}%`,
    bg: CONFETTI_COLORS[i % 5],
    dur: `${0.6 + Math.random() * 0.5}s`,
    delay: `${i * 30}ms`,
    tx: `${(Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 60)}px`,
    ty: `-${60 + Math.random() * 80}px`,
}));
function SwapSuccessAnim({ active }) {
    if (!active) return null;
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            {CONFETTI_PARTICLES.map((p, i) => (
                <div key={i} className="absolute w-2 h-2 rounded-full" style={{
                    left: p.left, top: '40%', background: p.bg,
                    animation: `confetti-${i} ${p.dur} ease-out forwards`,
                    animationDelay: p.delay,
                }} />
            ))}
            <style>{CONFETTI_PARTICLES.map((p, i) => `
                @keyframes confetti-${i} {
                    0% { transform: translate(0, 0) scale(1); opacity: 1; }
                    100% { transform: translate(${p.tx}, ${p.ty}) scale(0); opacity: 0; }
                }
            `).join('') + `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slideInRight { animation: slideInRight 0.3s ease-out; }
            `}</style>
        </div>
    );
}

/* #2: Recent pairs helper (stored in localStorage) */
const RECENT_PAIRS_KEY = 'xbot_recent_swap_pairs';
function getRecentPairs() {
    try { return JSON.parse(localStorage.getItem(RECENT_PAIRS_KEY) || '[]').slice(0, 5); } catch { return []; }
}
function addRecentPair(from, to) {
    const key = `${from}→${to}`;
    const pairs = getRecentPairs().filter(p => p !== key);
    pairs.unshift(key);
    localStorage.setItem(RECENT_PAIRS_KEY, JSON.stringify(pairs.slice(0, 5)));
}

/* #12: CSV template download for batch transfer */
function downloadCsvTemplate() {
    const csv = 'walletId,toAddress,amount\n1,0x0000000000000000000000000000000000000000,0.01\n2,0x0000000000000000000000000000000000000001,0.02';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'batch_transfer_template.csv'; a.click();
    URL.revokeObjectURL(url);
}

const KNOWN_TOKENS = {
    '196': {
        'OKB':     { addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', icon: '◆', decimals: 18 },
        'USDT':    { addr: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', icon: '₮', decimals: 18 },
        'WETH':    { addr: '0x5a77f1443d16ee5761d310e38b7a0bba64702958', icon: 'Ξ', decimals: 18 },
        'BANMAO':  { addr: '0x16d91d1615fc55b76d5f92365bd60c069b46ef78', icon: '🐱', decimals: 18 },
        'NIUMA':   { addr: '0x87669801a1fad6dad9db70d27ac752f452989667', icon: '🐂', decimals: 18 },
        'XWIZARD': { addr: '0xdcc83b32b6b4e95a61951bfcc9d71967515c0fca', icon: '🧙', decimals: 18 },
    },
    '1': {
        'ETH':  { addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', icon: 'Ξ', decimals: 18 },
        'USDT': { addr: '0xdac17f958d2ee523a2206206994597c13d831ec7', icon: '₮', decimals: 6 },
        'USDC': { addr: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', icon: '◉', decimals: 6 },
    },
    '56': {
        'BNB':  { addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', icon: '⬡', decimals: 18 },
        'USDT': { addr: '0x55d398326f99059ff775485246999027b3197955', icon: '₮', decimals: 18 },
    },
};

/* Reusable token icon — renders <img> if logoUrl available, emoji fallback */
function TokenIcon({ token, size = 20, className = '' }) {
    const [imgErr, setImgErr] = useState(false);
    if (token?.logoUrl && !imgErr) {
        return <img src={token.logoUrl} alt="" width={size} height={size} className={`rounded-full object-cover ${className}`} onError={() => setImgErr(true)} />;
    }
    return <span className={className} style={{ fontSize: size * 0.7 }}>{token?.icon || '🪙'}</span>;
}

function formatPrice(p) {
    const n = Number(p || 0);
    if (n === 0) return '$0.00';
    return n < 0.01 ? `$${n.toFixed(8)}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatChange(pct) {
    const n = Number(pct || 0);
    const color = n >= 0 ? 'text-emerald-400' : 'text-red-400';
    const icon = n >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />;
    return <span className={`flex items-center gap-0.5 ${color} text-xs font-medium`}>{icon}{Math.abs(n).toFixed(2)}%</span>;
}

function formatLargeNum(n) {
    const v = Number(n || 0);
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(2)}`;
}

/* Mini sparkline from array of numbers */
function Sparkline({ data, color = '#818cf8', width = 80, height = 28 }) {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
    const isUp = data[data.length - 1] >= data[0];
    const c = isUp ? '#34d399' : '#f87171';
    return (
        <svg width={width} height={height} className="flex-shrink-0">
            <polyline points={points} fill="none" stroke={color || c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/* ─── Animated count-up ─── */
function CountUp({ value, decimals = 4, duration = 600 }) {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef(null);
    const displayRef = useRef(0);
    displayRef.current = display;
    useEffect(() => {
        const target = Number(value || 0);
        const start = displayRef.current;
        const startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(start + (target - start) * eased);
            if (progress < 1) rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [value]);
    return <span>{display < 0.01 && display > 0 ? display.toFixed(8) : display.toFixed(decimals)}</span>;
}

/* ─── Confetti burst ─── */
function ConfettiBurst({ active }) {
    if (!active) return null;
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
            {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="absolute w-1.5 h-1.5 rounded-full animate-confetti"
                    style={{
                        left: `${30 + Math.random() * 40}%`,
                        top: '50%',
                        backgroundColor: ['#fbbf24', '#818cf8', '#34d399', '#f87171', '#60a5fa'][i % 5],
                        animationDelay: `${Math.random() * 0.3}s`,
                        animationDuration: `${0.6 + Math.random() * 0.4}s`,
                    }}
                />
            ))}
        </div>
    );
}

/* ─── useFavorites hook ─── */
function useFavorites() {
    const [favs, setFavs] = useState(() => {
        try { return JSON.parse(localStorage.getItem('trading_favs') || '[]'); }
        catch { return []; }
    });
    const toggle = (sym) => {
        setFavs(prev => {
            const next = prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym];
            localStorage.setItem('trading_favs', JSON.stringify(next));
            return next;
        });
    };
    return { favs, toggle, isFav: (sym) => favs.includes(sym) };
}


/* ═══════════════════════════════════════════
   Gas Widget
   ═══════════════════════════════════════════ */
function GasWidget({ chainIndex }) {
    const { t } = useTranslation();
    const [gas, setGas] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.getGasPrice(chainIndex);
                setGas(data.data);
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
        const timer = setInterval(load, 30000);
        return () => clearInterval(timer);
    }, [chainIndex]);

    if (loading) return (
        <div className="glass-card p-4 flex items-center gap-3">
            <Loader2 size={14} className="animate-spin text-surface-200/30" />
            <span className="text-xs text-surface-200/30">{t('dashboard.trading.loadingGas', 'Loading gas...')}</span>
        </div>
    );

    const gasData = Array.isArray(gas) ? gas[0] : gas;
    const gasPrice = gasData?.gasPrice || gasData?.normalGasPrice || '—';
    const unit = gasData?.unit || 'Gwei';

    return (
        <div className="glass-card p-4 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-2xl" />
            <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Fuel size={13} className="text-amber-400" />
                </div>
                <h3 className="text-xs font-bold text-surface-100">{t('dashboard.trading.gasPrice', 'Gas Price')}</h3>
                <span className="text-[9px] text-surface-200/25 ml-auto">{CHAINS[chainIndex]?.name || 'Chain'}</span>
            </div>
            <div className="flex items-end gap-1.5">
                <span className="text-2xl font-bold text-surface-100">{gasPrice}</span>
                <span className="text-xs text-surface-200/40 mb-1">{unit}</span>
            </div>
        </div>
    );
}


/* ═══════════════════════════════════════════
   Token Info Card (#11)
   ═══════════════════════════════════════════ */
function TokenInfoCard({ chainIndex, tokenAddress, symbol }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return;
        setLoading(true);
        api.getTokenInfo([{ chainIndex, tokenContractAddress: tokenAddress }])
            .then(res => {
                const data = Array.isArray(res.data) ? res.data : (res.priceInfo || []);
                if (data[0]) setInfo(data[0]);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [chainIndex, tokenAddress]);

    if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;
    if (loading) return <div className="glass-card p-3"><Loader2 size={12} className="animate-spin text-surface-200/30 mx-auto" /></div>;
    if (!info) return null;

    return (
        <div className="glass-card p-3 relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-cyan-500 to-blue-500 rounded-t-2xl" />
            <div className="flex items-center gap-2 mb-2">
                <Info size={11} className="text-cyan-400" />
                <span className="text-[10px] font-bold text-surface-100">{symbol || info.tokenSymbol}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {info.marketCap && <div><span className="text-[8px] text-surface-200/30 uppercase">MCap</span><p className="text-[11px] font-semibold text-surface-100">{formatLargeNum(info.marketCap)}</p></div>}
                {info.liquidity && <div><span className="text-[8px] text-surface-200/30 uppercase">Liq</span><p className="text-[11px] font-semibold text-surface-100">{formatLargeNum(info.liquidity)}</p></div>}
                {info.volume24h && <div><span className="text-[8px] text-surface-200/30 uppercase">24h Vol</span><p className="text-[11px] font-semibold text-surface-100">{formatLargeNum(info.volume24h)}</p></div>}
                {info.priceChange24H !== undefined && <div><span className="text-[8px] text-surface-200/30 uppercase">24h Δ</span><p className="text-[11px] font-semibold">{formatChange(info.priceChange24H)}</p></div>}
            </div>
        </div>
    );
}


/* ═══════════════════════════════════════════
   Mini Price Chart (#2)
   ═══════════════════════════════════════════ */
function MiniPriceChart({ chainIndex, tokenAddress, symbol }) {
    const { t } = useTranslation();
    const [candles, setCandles] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') { setCandles([]); return; }
        setLoading(true);
        api.getCandles(chainIndex, tokenAddress, '1D', 7)
            .then(res => {
                const data = res.data || [];
                const closes = data.map(c => Number(c.close || c[4] || 0)).filter(v => v > 0);
                setCandles(closes.reverse());
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [chainIndex, tokenAddress]);

    if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;

    return (
        <div className="glass-card p-3 relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-purple-500 to-indigo-500 rounded-t-2xl" />
            <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={11} className="text-purple-400" />
                <span className="text-[10px] font-bold text-surface-100">{symbol} — 7D Chart</span>
            </div>
            {loading ? (
                <div className="h-10 flex items-center justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : candles.length >= 2 ? (
                <div className="flex items-center justify-center py-1">
                    <Sparkline data={candles} width={200} height={40} color={candles[candles.length - 1] >= candles[0] ? '#34d399' : '#f87171'} />
                </div>
            ) : (
                <p className="text-[10px] text-surface-200/25 text-center py-2">{t('dashboard.trading.noChartData', 'No chart data')}</p>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Recent Trades (#7)
   ═══════════════════════════════════════════ */
function RecentTrades({ chainIndex, tokenAddress }) {
    const { t } = useTranslation();
    const [trades, setTrades] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') { setTrades([]); return; }
        setLoading(true);
        api.getMarketTrades(chainIndex, tokenAddress)
            .then(res => setTrades((res.data || []).slice(0, 8)))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [chainIndex, tokenAddress]);

    if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-emerald-500 to-teal-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Activity size={11} className="text-emerald-400" />
                <h4 className="text-[10px] font-bold text-surface-100">{t('dashboard.trading.recentTrades', 'Recent Trades')}</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : trades.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">{t('dashboard.trading.noTrades', 'No trades')}</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {trades.map((trade, i) => {
                        const isBuy = trade.type === 'buy';
                        const time = new Date(Number(trade.time || Date.now())).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        return (
                            <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-[10px]">
                                <span className={`w-8 font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
                                <span className="text-surface-200/40 flex-1">{time}</span>
                                <span className="text-surface-100">{formatPrice(trade.price)}</span>
                                <span className="text-surface-200/30 w-16 text-right">${Number(trade.volume || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Wallet Dropdown — Premium custom select with balances
   ═══════════════════════════════════════════ */
function WalletDropdown({ wallets = [], value, onChange, accentColor = 'violet', chainIndex = '196' }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [balances, setBalances] = useState({}); // { [walletId]: { totalValue, tokens } }
    const [loadingBal, setLoadingBal] = useState({});
    const [showTokens, setShowTokens] = useState(false);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    const selected = wallets.find(w => String(w.id) === String(value)) || null;
    const colorMap = { violet: 'text-violet-400', cyan: 'text-cyan-400', brand: 'text-brand-400' };
    const bgMap = { violet: 'bg-violet-500/15', cyan: 'bg-cyan-500/15', brand: 'bg-brand-500/15' };
    const accentText = colorMap[accentColor] || colorMap.violet;
    const accentBg = bgMap[accentColor] || bgMap.violet;

    // Use refs to avoid stale closures in fetchBalance
    const balancesRef = useRef(balances);
    balancesRef.current = balances;
    const loadingRef = useRef(loadingBal);
    loadingRef.current = loadingBal;

    // Reset cache when chainIndex changes
    const prevChain = useRef(chainIndex);
    useEffect(() => {
        if (prevChain.current !== chainIndex) {
            setBalances({}); setLoadingBal({});
            prevChain.current = chainIndex;
        }
    }, [chainIndex]);

    // Fetch balance for a wallet
    const fetchBalance = useCallback(async (wId) => {
        if (balancesRef.current[wId] || loadingRef.current[wId]) return;
        setLoadingBal(p => ({ ...p, [wId]: true }));
        try {
            const res = await api.getWalletBalance(wId);
            setBalances(p => ({ ...p, [wId]: { totalValue: res.totalValue || '0', tokens: res.tokens || [] } }));
        } catch { setBalances(p => ({ ...p, [wId]: { totalValue: '0', tokens: [] } })); }
        setLoadingBal(p => ({ ...p, [wId]: false }));
    }, []);

    // Fetch balance for selected wallet
    useEffect(() => { if (value) fetchBalance(value); }, [value, chainIndex, fetchBalance]);

    // Fetch all wallet balances when dropdown opens
    useEffect(() => { if (open) wallets.forEach(w => fetchBalance(w.id)); }, [open, fetchBalance]);

    // Position dropdown + reposition on scroll/resize
    const updatePos = useCallback(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
    }, []);
    useEffect(() => {
        if (!open) return;
        updatePos();
        window.addEventListener('scroll', updatePos, true);
        window.addEventListener('resize', updatePos);
        return () => { window.removeEventListener('scroll', updatePos, true); window.removeEventListener('resize', updatePos); };
    }, [open, updatePos]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const formatUsd = (v) => {
        const n = Number(v);
        if (isNaN(n) || n === 0) return '$0.00';
        if (n < 0.01) return `$${n.toFixed(6)}`;
        if (n < 1) return `$${n.toFixed(4)}`;
        if (n < 1000) return `$${n.toFixed(2)}`;
        return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const formatQty = (v) => {
        const n = Number(v);
        if (isNaN(n) || n === 0) return '0';
        if (n < 0.0001) return n.toFixed(8);
        if (n < 1) return n.toFixed(6);
        if (n < 1000) return n.toFixed(4);
        return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
    };

    const selectedBal = selected ? balances[selected.id] : null;

    const dropdownPanel = open ? createPortal(
        <div
            ref={panelRef}
            className="fixed z-[9999] bg-surface-800/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fadeIn"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 280) }}
        >
            <div className="px-3 py-2 border-b border-white/5">
                <p className="text-[9px] text-surface-200/30 uppercase tracking-widest font-semibold">{t('dashboard.trading.selectWallet', 'Select Wallet')}</p>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
                {wallets.map(w => {
                    const wb = balances[w.id];
                    const isSelected = String(w.id) === String(value);
                    return (
                        <button
                            key={w.id}
                            onClick={() => { onChange(String(w.id)); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all ${isSelected ? `${accentBg} ${accentText} font-bold` : 'text-surface-200/70 hover:bg-white/[0.05] hover:text-surface-100'}`}
                        >
                            <div className={`w-7 h-7 rounded-lg ${isSelected ? accentBg : 'bg-surface-700/60'} flex items-center justify-center flex-shrink-0`}>
                                <Wallet size={12} className={isSelected ? accentText : 'text-surface-200/30'} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold truncate">{w.name || `Wallet ${w.id}`}</div>
                                <div className="text-[9px] font-mono text-surface-200/25">{w.address?.slice(0, 8)}...{w.address?.slice(-6)}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                {loadingBal[w.id] ? (
                                    <Loader2 size={10} className="animate-spin text-surface-200/20" />
                                ) : wb ? (
                                    <span className="text-[10px] font-semibold text-emerald-400">{formatUsd(wb.totalValue)}</span>
                                ) : (
                                    <span className="text-[10px] text-surface-200/15">—</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
            {wallets.length === 0 && (
                <div className="px-3 py-4 text-center">
                    <p className="text-xs text-surface-200/30">{t('dashboard.trading.noWallets', 'No wallets')}</p>
                    <a href="#/wallets" className="text-xs text-brand-400 hover:text-brand-300 font-semibold">{t('dashboard.trading.createWallet', 'Create Wallet →')}</a>
                </div>
            )}
        </div>,
        document.body
    ) : null;

    return (
        <div className="mb-3">
            {/* Trigger */}
            <button
                ref={triggerRef}
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-900/50 border transition-all cursor-pointer ${open ? 'border-white/[0.15] shadow-lg shadow-black/20' : 'border-white/[0.06] hover:border-white/[0.1]'}`}
            >
                <div className={`w-7 h-7 rounded-lg ${accentBg} flex items-center justify-center flex-shrink-0`}>
                    <Wallet size={13} className={accentText} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-xs font-semibold text-surface-100 truncate">
                        {selected ? (selected.name || `Wallet ${selected.id}`) : 'Select wallet'}
                    </div>
                    {selected && (
                        <div className="text-[9px] font-mono text-surface-200/25">{selected.address?.slice(0, 8)}...{selected.address?.slice(-6)}</div>
                    )}
                </div>
                {selectedBal && (
                    <span className="text-xs font-bold text-emerald-400 flex-shrink-0">{formatUsd(selectedBal.totalValue)}</span>
                )}
                <ChevronDown size={13} className={`text-surface-200/30 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>
            {dropdownPanel}

            {/* Token balances of selected wallet */}
            {selected && selectedBal && selectedBal.tokens.length > 0 && (
                <div className="mt-1.5">
                    <button onClick={() => setShowTokens(!showTokens)} className="text-[9px] text-surface-200/25 hover:text-surface-200/50 transition-colors flex items-center gap-1">
                        <ChevronDown size={9} className={`transition-transform ${showTokens ? 'rotate-180' : ''}`} />
                        {showTokens ? t('dashboard.tradingUx.hideBalances', 'Hide balances') : t('dashboard.tradingUx.showBalances', 'Show balances')} ({selectedBal.tokens.filter(tk => Number(tk.balance) > 0).length} {t('dashboard.tradingUx.tokens', 'tokens')})
                    </button>
                    {showTokens && (
                        <div className="mt-1 rounded-lg bg-surface-900/40 border border-white/[0.04] max-h-[120px] overflow-y-auto">
                            {selectedBal.tokens.filter(tk => Number(tk.balance) > 0).map((tk, i) => (
                                <div key={i} className="flex items-center justify-between px-2.5 py-1.5 text-[10px] border-b border-white/[0.02] last:border-0">
                                    <span className="text-surface-200/50 font-medium">{tk.symbol}</span>
                                    <div className="text-right">
                                        <span className="text-surface-100 font-mono">{formatQty(tk.balance)}</span>
                                        <span className="text-surface-200/30 ml-1.5">{formatUsd(Number(tk.balance) * Number(tk.price))}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Swap Quote Widget — Premium v3 (All features)
   ═══════════════════════════════════════════ */
function SwapQuoteWidget({ chainIndex, onTokenSelect, wallets = [], selectedWallet = null, onSwapToken }) {
    const { t } = useTranslation();
    const [searchParams] = useState(() => new URLSearchParams(window.location.search));
    const knownTokens = KNOWN_TOKENS[chainIndex] || KNOWN_TOKENS['196'];
    const [customTokens, setCustomTokens] = useState({});
    const tokens = useMemo(() => ({ ...knownTokens, ...customTokens }), [knownTokens, customTokens]);

    const resolveToParam = () => {
        const toParam = searchParams.get('to')?.toLowerCase();
        if (!toParam) return Object.keys(tokens)[1] || 'USDT';
        for (const [sym, info] of Object.entries(tokens)) {
            if (info.addr.toLowerCase() === toParam || sym.toLowerCase() === toParam) return sym;
        }
        return Object.keys(tokens)[1] || 'USDT';
    };

    const defaultFrom = Object.keys(tokens)[0] || 'OKB';
    const [fromSymbol, setFromSymbol] = useState(defaultFrom);
    const [toSymbol, setToSymbol] = useState(resolveToParam);
    const [amount, setAmount] = useState('1');
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [openFrom, setOpenFrom] = useState(false);
    const [openTo, setOpenTo] = useState(false);
    const [slippage, setSlippage] = useState('1');
    const [showSlippage, setShowSlippage] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchTarget, setSearchTarget] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const { favs, toggle: toggleFav, isFav } = useFavorites();
    const [swapMode, setSwapMode] = useState('single'); // single | batch
    const [swapWalletId, setSwapWalletId] = useState(selectedWallet?.id ? String(selectedWallet.id) : '');
    useEffect(() => { if (selectedWallet) setSwapWalletId(String(selectedWallet.id)); }, [selectedWallet]);
    const [batchSelectedWallets, setBatchSelectedWallets] = useState({});
    const [batchAmount, setBatchAmount] = useState('1');
    const [batchSameAmount, setBatchSameAmount] = useState(true);
    const [batchAmounts, setBatchAmounts] = useState({});
    const [batchExecuting, setBatchExecuting] = useState(false);
    const [batchResults, setBatchResults] = useState([]);
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
    const [batchShowConfirm, setBatchShowConfirm] = useState(false);
    const [batchWalletBalances, setBatchWalletBalances] = useState({}); // {walletId: {balance, logoUrl}}
    // Batch quote state
    const [batchQuote, setBatchQuote] = useState(null);
    const [batchQuoteLoading, setBatchQuoteLoading] = useState(false);
    const [batchQuoteError, setBatchQuoteError] = useState(null);
    // U1: Wallet balance for selected token
    const [walletBalance, setWalletBalance] = useState(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [walletTokens, setWalletTokens] = useState([]); // all tokens from selected wallet
    const showToast = onSwapToken; // onSwapToken is actually the main page's showToast
    // U2: Auto-refresh quote
    const [quoteCountdown, setQuoteCountdown] = useState(0);
    const quoteTimerRef = useRef(null);
    const countdownRef = useRef(null);
    // U5: AbortController for search
    const searchAbortRef = useRef(null);
    const batchSelectedCount = wallets.filter(w => batchSelectedWallets[w.id]).length;
    const batchSelectAll = () => {
        const allSel = wallets.every(w => batchSelectedWallets[w.id]);
        const next = {}; wallets.forEach(w => { next[w.id] = !allSel; }); setBatchSelectedWallets(next);
    };
    const handleBatchSwap = async () => {
        if (batchSelectedCount === 0) return;
        setBatchExecuting(true); setBatchResults([]); setBatchProgress({ done: 0, total: batchSelectedCount });
        const selectedList = wallets.filter(w => batchSelectedWallets[w.id]);
        const results = [];
        for (let i = 0; i < selectedList.length; i++) {
            const w = selectedList[i];
            const amt = batchSameAmount ? batchAmount : (batchAmounts[w.id] || batchAmount);
            try {
                const res = await api.executeSwap({
                    walletId: w.id, chainIndex,
                    fromTokenAddress: tokens[fromSymbol].addr,
                    toTokenAddress: tokens[toSymbol].addr,
                    amount: amt, slippage
                });
                results.push({ walletId: w.id, walletName: w.name || `Wallet ${w.id}`, txHash: res.txHash, amount: amt });
            } catch (err) {
                results.push({ walletId: w.id, walletName: w.name || `Wallet ${w.id}`, error: err.message, amount: amt });
            }
            setBatchProgress({ done: i + 1, total: selectedList.length });
            setBatchResults([...results]);
        }
        setBatchExecuting(false);
        setBatchShowConfirm(false);
        // Toast summary
        const ok = results.filter(r => r.txHash).length;
        const fail = results.length - ok;
        if (showToast) showToast(ok > 0 && fail === 0 ? 'success' : ok > 0 ? 'warning' : 'error',
            `Batch Swap: ${ok}/${results.length} ${t('dashboard.tradingUx.success', 'success')}${fail > 0 ? `, ${fail} ${t('dashboard.tradingUx.failed', 'failed')}` : ''}`);
    };

    // Get quote for batch swap (uses the batch amount for a single representative quote)
    const getBatchQuote = useCallback(async () => {
        const amt = batchAmount;
        if (!amt || Number(amt) <= 0) return;
        const from = tokens[fromSymbol];
        const to = tokens[toSymbol];
        if (!from || !to) { setBatchQuoteError('Unknown token'); return; }
        if (fromSymbol === toSymbol) { setBatchQuoteError('Same token'); return; }
        setBatchQuoteLoading(true);
        setBatchQuoteError(null);
        setBatchQuote(null);
        try {
            const res = await api.getSwapQuote({ chainIndex, fromTokenAddress: from.addr, toTokenAddress: to.addr, amount: amt, slippage });
            const raw = res.data || res;
            const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : [raw]);
            const q = arr[0] || raw;
            setBatchQuote(q);
        } catch (err) { setBatchQuoteError(err.message || 'Quote failed'); }
        setBatchQuoteLoading(false);
    }, [batchAmount, fromSymbol, toSymbol, chainIndex, slippage, tokens]);

    // Clear batch quote when tokens or amount changes
    useEffect(() => { setBatchQuote(null); setBatchQuoteError(null); }, [fromSymbol, toSymbol, batchAmount, slippage]);

    // Fetch balance for each selected wallet (for batch display)
    useEffect(() => {
        const selected = wallets.filter(w => batchSelectedWallets[w.id]);
        if (selected.length === 0 || swapMode !== 'batch') return;
        selected.forEach(w => {
            if (batchWalletBalances[w.id]) return; // already fetched
            api.getWalletBalance(w.id).then(res => {
                const balances = res.tokens || [];
                const sym = fromSymbol.toUpperCase();
                const match = balances.find(b => (b.symbol || b.tokenSymbol || '').toUpperCase() === sym);
                setBatchWalletBalances(prev => ({ ...prev, [w.id]: { balance: match ? Number(match.balance || 0) : 0, logoUrl: match?.logoUrl || '' } }));
            }).catch(() => {});
        });
    }, [batchSelectedWallets, fromSymbol, swapMode]);
    // Clear batch balances when FROM changes
    useEffect(() => { setBatchWalletBalances({}); }, [fromSymbol]);

    // Notify parent of selected TO token
    useEffect(() => { onTokenSelect?.(toSymbol, tokens[toSymbol]?.addr); }, [toSymbol]);

    // U5: Token search with AbortController
    useEffect(() => {
        if (searchQuery.length < 2) { setSearchResults([]); return; }
        const timer = setTimeout(async () => {
            // Cancel previous request
            if (searchAbortRef.current) searchAbortRef.current.abort();
            const controller = new AbortController();
            searchAbortRef.current = controller;
            setSearching(true);
            try {
                const res = await api.searchToken(searchQuery, chainIndex);
                if (!controller.signal.aborted) {
                    setSearchResults((res.data || []).slice(0, 8));
                }
            } catch {
                if (!controller.signal.aborted) setSearchResults([]);
            }
            if (!controller.signal.aborted) setSearching(false);
        }, 300);
        return () => { clearTimeout(timer); if (searchAbortRef.current) searchAbortRef.current.abort(); };
    }, [searchQuery, chainIndex]);

    // U1: Fetch wallet balance when wallet or fromSymbol changes
    useEffect(() => {
        const wId = swapWalletId;
        if (!wId) { setWalletBalance(null); return; }
        setBalanceLoading(true);
        api.getWalletBalance(wId)
            .then(res => {
                const balances = res.tokens || res.balances || res.tokenAssets || [];
                setWalletTokens(balances); // store all tokens for chips

                // Sync logos from API into customTokens so dropdown shows real icons
                const logoUpdates = {};
                balances.forEach(b => {
                    const sym = (b.symbol || b.tokenSymbol || '').toUpperCase();
                    const logo = b.tokenLogoUrl || b.logoUrl || b.logo || '';
                    const addr = (b.tokenContractAddress || b.address || '').toLowerCase();
                    if (sym && logo) {
                        // Update existing known token or create new entry
                        const knownEntry = knownTokens[sym];
                        logoUpdates[sym] = {
                            addr: knownEntry?.addr || addr,
                            icon: knownEntry?.icon || '🪙',
                            decimals: knownEntry?.decimals || Number(b.decimals || 18),
                            logoUrl: logo,
                        };
                    }
                });
                if (Object.keys(logoUpdates).length > 0) {
                    setCustomTokens(prev => ({ ...logoUpdates, ...prev, ...logoUpdates }));
                }

                const tokenAddr = tokens[fromSymbol]?.addr?.toLowerCase();
                const isNative = tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                const match = balances.find(b => {
                    const bAddr = (b.tokenContractAddress || b.address || '').toLowerCase();
                    if (isNative) return bAddr === '' || bAddr === tokenAddr || b.tokenSymbol?.toUpperCase() === fromSymbol.toUpperCase() || b.symbol?.toUpperCase() === fromSymbol.toUpperCase();
                    return bAddr === tokenAddr || b.tokenSymbol?.toUpperCase() === fromSymbol.toUpperCase() || b.symbol?.toUpperCase() === fromSymbol.toUpperCase();
                });
                setWalletBalance(match ? Number(match.balance || match.holdingAmount || 0) : 0);
            })
            .catch(() => setWalletBalance(null))
            .finally(() => setBalanceLoading(false));
    }, [swapWalletId, fromSymbol, chainIndex]);

    const getQuote = useCallback(async () => {
        if (!amount || Number(amount) <= 0) return;
        const from = tokens[fromSymbol];
        const to = tokens[toSymbol];
        if (!from || !to) { setError('Unknown token'); return; }
        if (fromSymbol === toSymbol) { setError('Same token'); return; }
        setLoading(true);
        setError(null);
        setQuote(null);
        try {
            const res = await api.getSwapQuote({ chainIndex, fromTokenAddress: from.addr, toTokenAddress: to.addr, amount, slippage });
            console.log('[QUOTE] raw API response:', JSON.stringify(res).slice(0, 500));
            // Unwrap: backend returns {data: okxResponse}, OKX returns {code, data: [quote]}
            const raw = res.data || res;
            const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : [raw]);
            const q = arr[0] || raw;
            console.log('[QUOTE] parsed quote:', JSON.stringify(q).slice(0, 500));
            console.log('[QUOTE] routerResult:', q?.routerResult ? 'exists' : 'MISSING', 'toTokenAmount:', q?.routerResult?.toTokenAmount);
            setQuote(q);
            addRecentPair(fromSymbol, toSymbol); // #2
            // U2: Start auto-refresh countdown
            startQuoteRefresh();
        } catch (err) { setError(err.message || 'Quote failed'); }
        setLoading(false);
    }, [amount, fromSymbol, toSymbol, chainIndex, slippage, tokens]);

    // #7: Keyboard shortcuts (only when not focused on inputs)
    useEffect(() => {
        const handleKey = (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                getQuote();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [getQuote]);

    // U2: Auto-refresh quote every 15s
    const QUOTE_REFRESH_INTERVAL = 15;
    const startQuoteRefresh = useCallback(() => {
        clearInterval(quoteTimerRef.current);
        clearInterval(countdownRef.current);
        setQuoteCountdown(QUOTE_REFRESH_INTERVAL);
        countdownRef.current = setInterval(() => {
            setQuoteCountdown(prev => {
                if (prev <= 1) { clearInterval(countdownRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
        quoteTimerRef.current = setTimeout(() => {
            // Auto-refresh
            getQuote();
        }, QUOTE_REFRESH_INTERVAL * 1000);
    }, []);
    // Clear timers on unmount or when switching tokens
    useEffect(() => {
        return () => { clearTimeout(quoteTimerRef.current); clearInterval(countdownRef.current); };
    }, [fromSymbol, toSymbol, amount]);

    const adjustAmount = (delta) => {
        const n = Math.max(0, Number(amount || 0) + delta);
        setAmount(String(n));
    };

    // OKX v6 returns flat structure (no routerResult wrapper), v5 had routerResult nesting
    const routerResult = quote?.routerResult || quote;
    const toAmount = quote ? (Number(routerResult?.toTokenAmount || 0) / Math.pow(10, Number(routerResult?.toToken?.decimal || 18))) : null;
    const priceImpact = routerResult?.priceImpactPercentage || routerResult?.priceImpactPercent;
    const gasEstimate = routerResult?.estimateGasFee || quote?.estimateGasFee;
    const dexRoutes = routerResult?.quoteCompareList || quote?.quoteCompareList || routerResult?.dexRouterList || [];

    // Token list for dropdown — wallet tokens first (with balance + logo), then remaining known tokens
    const getTokenList = (exclude) => {
        const list = [];
        const added = new Set();

        // 1. Favorites first (from wallet tokens if available)
        const favTokens = favs.filter(f => tokens[f] && f !== exclude);
        favTokens.forEach(sym => {
            const wt = walletTokens.find(t => (t.symbol || t.tokenSymbol || '').toUpperCase() === sym.toUpperCase());
            list.push({ sym, ...tokens[sym], isFav: true, walletBalance: wt ? Number(wt.balance || 0) : null, walletLogoUrl: wt?.logoUrl || '' });
            added.add(sym.toUpperCase());
        });

        // 2. Wallet tokens (non-favorites, non-zero balance) — these are the PRIMARY items
        if (walletTokens.length > 0) {
            walletTokens
                .filter(wt => Number(wt.balance || 0) > 0)
                .forEach(wt => {
                    const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                    if (sym === exclude?.toUpperCase() || added.has(sym)) return;
                    const knownEntry = tokens[sym];
                    list.push({
                        sym,
                        addr: knownEntry?.addr || (wt.tokenContractAddress || wt.address || '').toLowerCase(),
                        icon: knownEntry?.icon || '🪙',
                        decimals: knownEntry?.decimals || Number(wt.decimals || 18),
                        logoUrl: wt.logoUrl || knownEntry?.logoUrl || '',
                        isFav: false,
                        walletBalance: Number(wt.balance || 0),
                        walletLogoUrl: wt.logoUrl || '',
                    });
                    added.add(sym);
                });
        }

        // 3. Remaining known tokens not yet added (for TO selector or tokens with 0 balance)
        Object.entries(tokens).filter(([k]) => k !== exclude && !added.has(k.toUpperCase())).forEach(([sym, info]) => {
            list.push({ sym, ...info, isFav: false, walletBalance: null, walletLogoUrl: '' });
        });

        return list;
    };

    /* Custom Token Dropdown with Search (#1) + Favorites (#9) — Portal-based */
    const TokenDropdown = ({ value, onChange, open, setOpen, exclude, label }) => {
        const list = getTokenList(exclude);
        const triggerRef = useRef(null);
        const dropdownRef = useRef(null);
        const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

        useEffect(() => {
            if (open && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
            }
        }, [open]);

        // Close on outside click
        useEffect(() => {
            if (!open) return;
            const handler = (e) => {
                if (triggerRef.current?.contains(e.target)) return;
                if (dropdownRef.current?.contains(e.target)) return;
                setOpen(false);
                setSearchQuery('');
            };
            document.addEventListener('mousedown', handler);
            return () => document.removeEventListener('mousedown', handler);
        }, [open]);

        const dropdownPanel = open ? createPortal(
            <div
                ref={dropdownRef}
                className="fixed z-[9999] bg-surface-800/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fadeIn max-h-[280px] overflow-y-auto"
                style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
                {/* Search input */}
                <div className="p-2 border-b border-white/5">
                    <div className="flex items-center gap-2 bg-surface-900/60 rounded-lg px-2.5 py-1.5">
                        <Search size={11} className="text-surface-200/30" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setSearchTarget(label === 'From' ? 'from' : 'to'); }}
                            className="flex-1 bg-transparent text-xs text-surface-100 outline-none placeholder:text-surface-200/20"
                            placeholder="Search tokens..."
                            autoFocus
                        />
                        {searching && <Loader2 size={10} className="animate-spin text-surface-200/30" />}
                    </div>
                </div>
                {/* Token list — wallet tokens with balance + logo */}
                {list.map(({ sym, icon, isFav: f, walletBalance, walletLogoUrl, logoUrl: entryLogo }) => {
                    const logo = walletLogoUrl || entryLogo || tokens[sym]?.logoUrl || '';
                    return (
                    <button
                        key={sym}
                        onClick={() => { onChange(sym); setOpen(false); setSearchQuery(''); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all ${
                            sym === value ? 'bg-brand-500/15 text-brand-400 font-bold' : 'text-surface-200/70 hover:bg-white/[0.05] hover:text-surface-100'
                        }`}
                    >
                        {f && <Star size={10} className="text-amber-400 fill-amber-400" />}
                        <span className="text-base">
                            {logo ? <img src={logo} alt="" width={18} height={18} className="rounded-full object-cover inline" onError={e => { e.target.style.display = 'none'; }} /> : <TokenIcon token={tokens[sym]} size={18} />}
                        </span>
                        <span className="font-medium flex-1 text-left">{sym}</span>
                        {walletBalance != null && walletBalance > 0 && (
                            <span className="text-[9px] text-surface-200/30 font-mono">{parseFloat(Number(walletBalance).toFixed(4))}</span>
                        )}
                        <button onClick={e => { e.stopPropagation(); toggleFav(sym); }} className="p-0.5 hover:text-amber-400 transition-colors">
                            {isFav(sym) ? <Star size={10} className="text-amber-400 fill-amber-400" /> : <StarOff size={10} className="text-surface-200/20" />}
                        </button>
                    </button>
                    );
                })}
                {/* Search results */}
                {searchResults.length > 0 && (
                    <>
                        <div className="px-3 py-1.5 text-[9px] text-surface-200/20 uppercase border-t border-white/5">{t('dashboard.trading.searchResults', 'Search Results')}</div>
                        {searchResults.map((t, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    const sym = t.tokenSymbol || '?';
                                    if (!tokens[sym]) {
                                        setCustomTokens(prev => ({ ...prev, [sym]: { addr: t.tokenContractAddress, icon: '🪙', decimals: Number(t.decimals || 18), logoUrl: t.tokenLogoUrl || t.logoUrl || '' } }));
                                    }
                                    onChange(sym);
                                    setOpen(false);
                                    setSearchQuery('');
                                    setSearchResults([]);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-200/60 hover:bg-white/[0.05] hover:text-surface-100 transition-all"
                            >
                                <span>{t.tokenLogoUrl ? <img src={t.tokenLogoUrl} alt="" width={16} height={16} className="rounded-full inline" /> : '🪙'}</span>
                                <div className="flex-1 text-left">
                                    <span className="font-medium">{t.tokenSymbol || '?'}</span>
                                    <span className="text-[9px] text-surface-200/20 ml-1.5">{t.tokenFullName}</span>
                                </div>
                                <span className="text-[9px] text-surface-200/15 font-mono">{(t.tokenContractAddress || '').slice(0, 6)}...{(t.tokenContractAddress || '').slice(-4)}</span>
                            </button>
                        ))}
                    </>
                )}
            </div>,
            document.body
        ) : null;

        return (
            <div className="relative">
                <label className="text-[9px] text-surface-200/30 uppercase tracking-widest mb-1.5 block font-semibold">{label}</label>
                <button
                    ref={triggerRef}
                    onClick={() => setOpen(!open)}
                    className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] text-surface-100 text-sm font-semibold transition-all w-full"
                >
                    <span className="text-lg"><TokenIcon token={tokens[value]} size={22} /></span>
                    <span className="flex-1 text-left font-bold">{value}</span>
                    <ChevronDown size={14} className={`text-surface-200/30 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {dropdownPanel}
            </div>
        );
    };

    return (
        <div className="glass-card p-5 relative">
            <ConfettiBurst active={showConfetti} />
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-500 via-purple-500 to-cyan-500 rounded-t-2xl" />

            <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center">
                    <ArrowLeftRight size={15} className="text-brand-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100 flex-1">{t('dashboard.tradingUx.swap', 'Swap')}</h3>
                <button onClick={() => setShowSlippage(!showSlippage)} className={`p-1.5 rounded-lg transition-all ${showSlippage ? 'bg-brand-500/15 text-brand-400' : 'text-surface-200/30 hover:text-surface-200/60'}`}>
                    <Settings size={14} />
                </button>
            </div>

            {/* Single / Batch tab */}
            <div className="flex rounded-lg bg-surface-800/60 p-0.5 mb-4">
                {[['single', `🔄 ${t('dashboard.tradingUx.single', 'Single')}`], ['batch', `🔶 ${t('dashboard.tradingUx.batch', 'Batch')} (${wallets.length})`]].map(([key, label]) => (
                    <button key={key} onClick={() => setSwapMode(key)}
                        className={`flex-1 py-1.5 text-[10px] font-semibold rounded-md transition-all ${swapMode === key ? 'bg-surface-700 text-surface-100 shadow-sm' : 'text-surface-200/30 hover:text-surface-200/50'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {swapMode === 'single' ? (<>
            {/* Slippage panel (#5) */}
            {showSlippage && (
                <div className="mb-4 p-3 rounded-xl bg-surface-900/60 border border-white/[0.06] animate-fadeIn">
                    <p className="text-[9px] text-surface-200/30 uppercase tracking-widest mb-2 font-semibold">{t('dashboard.tradingUx.slippageTolerance', 'Slippage Tolerance')}</p>
                    <div className="flex gap-1.5">
                        {['0.5', '1', '3'].map(v => (
                            <button key={v} onClick={() => setSlippage(v)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${slippage === v ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-surface-800/60 text-surface-200/40 border border-white/[0.06] hover:text-surface-200/70'}`}>
                                {v}%
                            </button>
                        ))}
                        <input type="number" value={!['0.5', '1', '3'].includes(slippage) ? slippage : ''} onChange={e => setSlippage(e.target.value || '1')}
                            className="flex-1 bg-surface-800/60 border border-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-surface-100 text-center outline-none placeholder:text-surface-200/20 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder={t('dashboard.tradingUx.customPct', 'Custom %')} />
                    </div>
                    {/* #4: Slippage warning */}
                    {Number(slippage) < 0.1 && <p className="text-[9px] text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle size={9} /> {t('dashboard.tradingUx.slippageLow', 'Slippage too low — transaction may fail')}</p>}
                    {Number(slippage) > 5 && <p className="text-[9px] text-red-400 mt-1 flex items-center gap-1"><AlertTriangle size={9} /> {t('dashboard.tradingUx.slippageHigh', 'High slippage — risk of front-running')}</p>}
                </div>
            )}

            {/* Wallet selector */}
            <WalletDropdown wallets={wallets} value={swapWalletId} onChange={setSwapWalletId} accentColor="violet" chainIndex={chainIndex} />

            <div className="space-y-3">
                {/* FROM */}
                <div>
                    <TokenDropdown value={fromSymbol} onChange={setFromSymbol} open={openFrom} setOpen={(v) => { setOpenFrom(v); setOpenTo(false); }} exclude={toSymbol} label="From" />
                    <div className="flex gap-2 mt-1.5">
                        <div className="flex-1 flex items-center bg-surface-800/80 border border-white/[0.08] rounded-xl overflow-hidden">
                            <button onClick={() => adjustAmount(-1)} className="px-3 py-3 text-surface-200/30 hover:text-surface-100 hover:bg-white/[0.06] transition-colors text-lg font-bold border-r border-white/[0.04]">−</button>
                            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-surface-100 font-bold text-center outline-none py-3 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0" />
                            <button onClick={() => adjustAmount(1)} className="px-3 py-3 text-surface-200/30 hover:text-surface-100 hover:bg-white/[0.06] transition-colors text-lg font-bold border-l border-white/[0.04]">+</button>
                        </div>
                    </div>
                    {/* Quick presets \u2014 U1: use wallet balance */}
                    <div className="flex gap-1 mt-1.5">
                        {[{ label: '25%', val: 0.25 }, { label: '50%', val: 0.5 }, { label: '75%', val: 0.75 }, { label: 'MAX', val: 1 }].map(p => (
                            <button key={p.label} onClick={() => {
                                if (walletBalance != null && walletBalance > 0) {
                                    setAmount(String(+(walletBalance * p.val).toFixed(8)));
                                } else {
                                    const current = Number(amount || 0);
                                    if (current > 0) setAmount(String(+(current * p.val).toFixed(8)));
                                }
                            }}
                                className="flex-1 py-1 rounded-lg text-[9px] font-bold text-surface-200/30 bg-surface-800/40 border border-white/[0.04] hover:text-brand-400 hover:border-brand-500/20 transition-all">
                                {p.label}
                            </button>
                        ))}
                    </div>
                    {/* U1: Show wallet balance + token chips */}
                    {swapWalletId && (
                        <>
                        <div className="flex items-center justify-end mt-1 text-[9px]">
                            {balanceLoading ? (
                                <span className="text-surface-200/20">{t('dashboard.tradingUx.loadingBalance', 'Loading balance...')}</span>
                            ) : walletBalance != null ? (
                                <span className="text-surface-200/30">{t('dashboard.tradingUx.available', 'Available')}: <b className="text-surface-200/60">{walletBalance > 0 ? parseFloat(Number(walletBalance).toFixed(4)) : '0'}</b> {fromSymbol}</span>
                            ) : null}
                        </div>
                        {/* Wallet token chips: show all tokens in wallet for quick select */}
                        {(() => {
                            const wBal = walletTokens;
                            if (!wBal || wBal.length === 0) return null;
                            return (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {wBal.filter(tk => Number(tk.balance || 0) > 0).map((tk, i) => {
                                        const sym = (tk.symbol || tk.tokenSymbol || '?').toUpperCase();
                                        const isActive = sym === fromSymbol.toUpperCase();
                                        const logo = tk.tokenLogoUrl || tk.logoUrl || tk.logo || null;
                                        const bal = parseFloat(Number(tk.balance || 0).toFixed(4));
                                        return (
                                            <button key={i} onClick={() => {
                                                // Auto-register token if not in known/custom tokens
                                                let match = Object.entries(tokens).find(([k]) => k.toUpperCase() === sym);
                                                if (!match) {
                                                    const addr = (tk.tokenContractAddress || tk.address || '').toLowerCase();
                                                    setCustomTokens(prev => ({ ...prev, [sym]: { addr, icon: '🪙', decimals: Number(tk.decimals || 18), logoUrl: logo || '' } }));
                                                    setFromSymbol(sym);
                                                } else {
                                                    setFromSymbol(match[0]);
                                                }
                                            }}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] border transition-all ${isActive
                                                    ? 'bg-brand-500/15 border-brand-500/25 text-brand-400 font-bold'
                                                    : 'bg-surface-800/40 border-white/[0.04] text-surface-200/40 hover:text-brand-400 hover:border-brand-500/15'}`}
                                            >
                                                {logo ? <img src={logo} alt="" className="w-3 h-3 rounded-full" /> : null}
                                                <span>{sym}</span>
                                                <span className="text-surface-200/20 font-mono">{bal}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        </>
                    )}
                </div>

                <div className="flex justify-center">
                    <button onClick={() => { setFromSymbol(toSymbol); setToSymbol(fromSymbol); }}
                        className="w-9 h-9 rounded-full bg-surface-800/80 border border-white/[0.08] flex items-center justify-center hover:bg-brand-500/15 hover:border-brand-500/30 hover:rotate-180 transition-all duration-300 shadow-lg">
                        <ArrowDown size={14} className="text-surface-200/40" />
                    </button>
                </div>

                {/* TO */}
                <TokenDropdown value={toSymbol} onChange={setToSymbol} open={openTo} setOpen={(v) => { setOpenTo(v); setOpenFrom(false); }} exclude={fromSymbol} label="To" />

                {/* #2: Recent pairs */}
                {getRecentPairs().length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] text-surface-200/20 uppercase tracking-wider">{t('dashboard.tradingUx.recentPairs', 'Recent')}:</span>
                        {getRecentPairs().map(pair => {
                            const [f, to] = pair.split('→');
                            return (<button key={pair} onClick={() => { setFromSymbol(f); setToSymbol(to); }} className="px-2 py-0.5 rounded-md text-[9px] bg-surface-800/50 border border-white/[0.05] text-surface-200/40 hover:text-brand-400 hover:border-brand-500/20 transition-all">{pair}</button>);
                        })}
                    </div>
                )}

                <button onClick={getQuote} disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.02] active:scale-95 transition-all duration-200 disabled:opacity-50">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    {t('dashboard.tradingUx.getQuote', 'Get Quote')}
                </button>
                {/* #7: Keyboard shortcut hint */}
                <p className="text-[8px] text-surface-200/15 text-center">{t('dashboard.tradingUx.kbdQuote', 'Press Enter to Get Quote')}</p>

                {error && <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg py-2 border border-red-500/20">{error}</p>}

                {/* Quote result with animation (#12) */}
                {toAmount !== null && (
                    <div className="bg-surface-900/60 rounded-xl p-4 border border-white/[0.06] space-y-2.5 animate-fadeIn">
                        <div className="flex justify-between text-xs">
                            <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.youGet', 'You Get')}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-surface-100 font-bold text-sm">
                                    <CountUp value={toAmount} decimals={6} /> {routerResult?.toTokenSymbol || toSymbol}
                                </span>
                                {/* U2: Auto-refresh countdown */}
                                {quoteCountdown > 0 && (
                                    <span className="text-[9px] text-surface-200/25 flex items-center gap-1" title="Auto-refresh">
                                        <RefreshCw size={9} className="animate-spin" style={{ animationDuration: '3s' }} />
                                        {quoteCountdown}s
                                    </span>
                                )}
                            </div>
                        </div>
                        {priceImpact && (
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.priceImpact', 'Price Impact')}</span>
                                <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold ${Number(priceImpact) <= 1 ? 'text-emerald-400' : Number(priceImpact) <= 3 ? 'text-amber-400' : 'text-red-400'}`}>{Number(priceImpact).toFixed(2)}%</span>
                                    <span className={`text-[8px] ${Number(priceImpact) <= 1 ? 'text-emerald-400/50' : Number(priceImpact) <= 3 ? 'text-amber-400/50' : 'text-red-400/50'}`}>
                                        {Number(priceImpact) <= 1 ? t('dashboard.tradingUx.priceImpactLow', 'Low') : Number(priceImpact) <= 3 ? t('dashboard.tradingUx.priceImpactMed', 'Moderate') : t('dashboard.tradingUx.priceImpactHigh', 'High!')}
                                    </span>
                                </div>
                            </div>
                        )}
                        {/* Gas estimate (#10) */}
                        {gasEstimate && (
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.estGas', 'Est. Gas')}</span>
                                <span className="text-surface-200/50">{Number(gasEstimate) > 1e6 ? `${(Number(gasEstimate) * 1e-9).toFixed(4)} Gwei` : gasEstimate}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-xs">
                            <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.slippage', 'Slippage')}</span>
                            <span className="text-surface-200/50">{slippage}%</span>
                        </div>

                        {/* Route comparison (#6) */}
                        {dexRoutes.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                <p className="text-[9px] text-surface-200/25 uppercase tracking-widest mb-1.5 font-semibold">{t('dashboard.tradingUx.dexRoutes', 'DEX Routes')}</p>
                                {dexRoutes.slice(0, 4).map((r, i) => {
                                    const receiveAmt = Number(r.receiveAmount || 0) / Math.pow(10, Number(routerResult?.toToken?.decimal || 18));
                                    return (
                                        <div key={i} className="flex justify-between text-[10px] py-0.5">
                                            <span className={`font-medium ${i === 0 ? 'text-emerald-400' : 'text-surface-200/40'}`}>
                                                {i === 0 && '★ '}{r.dexName}
                                            </span>
                                            <span className="text-surface-200/50">{receiveAmt.toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Execute Swap Button */}
                        <ExecuteSwapButton
                            chainIndex={chainIndex}
                            fromTokenAddress={tokens[fromSymbol]?.addr}
                            toTokenAddress={tokens[toSymbol]?.addr}
                            amount={amount}
                            slippage={slippage}
                            wallets={wallets}
                            selectedWallet={wallets.find(w => String(w.id) === String(swapWalletId)) || null}
                            showToast={showToast}
                            fromSymbol={fromSymbol}
                            toSymbol={routerResult?.toTokenSymbol || toSymbol}
                            expectedOutput={toAmount}
                        />
                    </div>
                )}
            </div>
            </>) : (
            /* ═══ Batch Swap Mode ═══ */
            <div className="space-y-3">
                {/* Token pair — with logos (P1) */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] text-surface-200/25 mb-0.5 block">{t('dashboard.tradingUx.from', 'FROM')}</label>
                        <div className="flex flex-wrap gap-1">
                            {(walletTokens.length > 0
                                ? walletTokens.filter(wt => Number(wt.balance || 0) > 0).map(wt => {
                                    const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                                    const logo = wt.logoUrl || tokens[sym]?.logoUrl || '';
                                    return (
                                        <button key={sym} onClick={() => setFromSymbol(sym)}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${fromSymbol === sym ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-surface-800/60 text-surface-200/50 border border-white/[0.06] hover:border-white/[0.12]'}`}>
                                            {logo ? <img src={logo} alt="" width={12} height={12} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{tokens[sym]?.icon || '🪙'}</span>}
                                            {sym}
                                        </button>
                                    );
                                })
                                : Object.keys(tokens).map(s => (
                                    <button key={s} onClick={() => setFromSymbol(s)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${fromSymbol === s ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-surface-800/60 text-surface-200/50 border border-white/[0.06] hover:border-white/[0.12]'}`}>
                                        {tokens[s]?.logoUrl ? <img src={tokens[s].logoUrl} alt="" width={12} height={12} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{tokens[s]?.icon || '🪙'}</span>}
                                        {s}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] text-surface-200/25 mb-0.5 block">{t('dashboard.tradingUx.to', 'TO')}</label>
                        <div className="flex flex-wrap gap-1">
                            {(walletTokens.length > 0
                                ? [...walletTokens.filter(wt => Number(wt.balance || 0) > 0), ...Object.entries(tokens).filter(([sym]) => !walletTokens.some(wt => (wt.symbol || '').toUpperCase() === sym)).map(([sym, info]) => ({ symbol: sym, logoUrl: info.logoUrl }))]
                                    .filter(wt => (wt.symbol || wt.tokenSymbol || '?').toUpperCase() !== fromSymbol)
                                    .map((wt, i) => {
                                        const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                                        const logo = wt.logoUrl || tokens[sym]?.logoUrl || '';
                                        return (
                                            <button key={`${sym}-${i}`} onClick={() => setToSymbol(sym)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${toSymbol === sym ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-surface-800/60 text-surface-200/50 border border-white/[0.06] hover:border-white/[0.12]'}`}>
                                                {logo ? <img src={logo} alt="" width={12} height={12} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{tokens[sym]?.icon || '🪙'}</span>}
                                                {sym}
                                            </button>
                                        );
                                    })
                                : Object.keys(tokens).filter(s => s !== fromSymbol).map(s => (
                                    <button key={s} onClick={() => setToSymbol(s)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${toSymbol === s ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-surface-800/60 text-surface-200/50 border border-white/[0.06] hover:border-white/[0.12]'}`}>
                                        {tokens[s]?.logoUrl ? <img src={tokens[s].logoUrl} alt="" width={12} height={12} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{tokens[s]?.icon || '🪙'}</span>}
                                        {s}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
                {/* Amount + Slippage (P7 i18n) */}
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <label className="text-[9px] text-surface-200/25">{t('dashboard.tradingUx.amountPerWallet', 'Amount per wallet')}</label>
                            <button onClick={() => setBatchSameAmount(!batchSameAmount)} className="text-[8px] text-brand-400 hover:text-brand-300">
                                {batchSameAmount ? t('dashboard.tradingUx.customEach', 'Custom each ↗') : t('dashboard.tradingUx.sameForAll', 'Same for all ↗')}
                            </button>
                        </div>
                        {batchSameAmount && (
                            <input type="number" value={batchAmount} onChange={e => setBatchAmount(e.target.value)}
                                className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder={t('dashboard.tradingUx.amount', 'Amount')} />
                        )}
                    </div>
                    <div className="w-16">
                        <label className="text-[9px] text-surface-200/25 mb-0.5 block">{t('dashboard.tradingUx.slipPct', 'Slip %')}</label>
                        <input type="number" value={slippage} onChange={e => setSlippage(e.target.value)}
                            className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                </div>
                {/* Wallet checkboxes with balance (P2) */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-surface-200/25">{t('dashboard.tradingUx.selectWallets', 'Select wallets')} ({batchSelectedCount}/{wallets.length})</span>
                        <button onClick={batchSelectAll} className="text-[8px] text-brand-400 hover:text-brand-300">
                            {wallets.every(w => batchSelectedWallets[w.id]) ? t('dashboard.tradingUx.deselectAll', 'Deselect All') : t('dashboard.tradingUx.selectAll', 'Select All')}
                        </button>
                    </div>
                    <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
                        {wallets.map(w => {
                            const wb = batchWalletBalances[w.id];
                            return (
                            <label key={w.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${batchSelectedWallets[w.id] ? 'bg-orange-500/10 border-orange-500/20 text-surface-100' : 'bg-surface-800/40 border-white/[0.04] text-surface-200/40 hover:border-white/[0.08]'}`}>
                                <input type="checkbox" checked={!!batchSelectedWallets[w.id]} onChange={() => setBatchSelectedWallets(p => ({ ...p, [w.id]: !p[w.id] }))} className="w-3 h-3 rounded accent-orange-500" />
                                <Wallet size={10} className={batchSelectedWallets[w.id] ? 'text-orange-400' : 'text-surface-200/20'} />
                                <span className="flex-1 truncate">{w.name || `Wallet ${w.id}`}</span>
                                {/* Per-wallet balance overview */}
                                {wb !== undefined && (
                                    <span className={`text-[8px] font-mono ${Number(wb?.balance || 0) > 0 ? 'text-surface-200/30' : 'text-red-400/60 font-medium'}`}>
                                        {Number(wb?.balance || 0) > 0 ? `${parseFloat(Number(wb.balance).toFixed(4))} ${fromSymbol}` : t('dashboard.tradingUx.noTokenBalance', '0 Bal ⚠️')}
                                    </span>
                                )}
                                <span className="text-[9px] font-mono text-surface-200/20">{w.address?.slice(0, 6)}...{w.address?.slice(-4)}</span>
                                {!batchSameAmount && batchSelectedWallets[w.id] && (
                                    <div className="relative">
                                    <input type="number" value={batchAmounts[w.id] || ''} onChange={e => setBatchAmounts(p => ({ ...p, [w.id]: e.target.value }))}
                                        placeholder={batchAmount} onClick={e => e.stopPropagation()}
                                        className={`w-16 bg-surface-800/80 border rounded px-1 py-0.5 text-[10px] text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${Number(batchAmounts[w.id] || batchAmount || 0) > Number(wb?.balance || 0) ? 'border-red-500/40 bg-red-500/10' : 'border-white/[0.08]'}`} />
                                    {Number(batchAmounts[w.id] || batchAmount || 0) > Number(wb?.balance || 0) && (
                                        <div className="absolute -top-[14px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] text-red-400 bg-red-500/10 px-1 rounded border border-red-500/20">{t('dashboard.tradingUx.insufficientFunds', 'Insufficient')}</div>
                                    )}
                                    </div>
                                )}
                            </label>
                            );
                        })}
                    </div>
                </div>

                {/* ═══ Get Quote Button ═══ */}
                <button onClick={getBatchQuote} disabled={batchQuoteLoading || batchSelectedCount === 0 || !batchAmount}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.02] active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
                    {batchQuoteLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    {t('dashboard.tradingUx.getQuote', 'Get Quote')} — {batchSelectedCount} {t('dashboard.tradingUx.wallets', 'wallets')}
                </button>

                {batchQuoteError && <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg py-2 border border-red-500/20">{batchQuoteError}</p>}

                {/* ═══ Quote Result Display ═══ */}
                {(() => {
                    if (!batchQuote) return null;
                    const bqRouter = batchQuote?.routerResult || batchQuote;
                    const bqToAmount = Number(bqRouter?.toTokenAmount || 0) / Math.pow(10, Number(bqRouter?.toToken?.decimal || 18));
                    const bqPriceImpact = bqRouter?.priceImpactPercentage || bqRouter?.priceImpactPercent;
                    const bqGas = bqRouter?.estimateGasFee || batchQuote?.estimateGasFee;
                    const bqDexRoutes = bqRouter?.quoteCompareList || batchQuote?.quoteCompareList || bqRouter?.dexRouterList || [];
                    const totalEstOutput = batchSameAmount ? bqToAmount * batchSelectedCount : bqToAmount;
                    if (bqToAmount <= 0) return null;
                    return (
                        <div className="bg-surface-900/60 rounded-xl p-4 border border-white/[0.06] space-y-2.5 animate-fadeIn">
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.youGet', 'You Get')} / {t('dashboard.tradingUx.wallet', 'wallet')}</span>
                                <span className="text-surface-100 font-bold text-sm"><CountUp value={bqToAmount} decimals={6} /> {bqRouter?.toTokenSymbol || bqRouter?.toToken?.tokenSymbol || toSymbol}</span>
                            </div>
                            {batchSameAmount && batchSelectedCount > 1 && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-surface-200/40 font-medium">🔢 {t('dashboard.tradingUx.totalEstOutput', 'Total est. output')} (×{batchSelectedCount})</span>
                                    <span className="text-emerald-400 font-bold text-sm"><CountUp value={totalEstOutput} decimals={6} /> {bqRouter?.toTokenSymbol || bqRouter?.toToken?.tokenSymbol || toSymbol}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.rate', 'Rate')}</span>
                                <span className="text-surface-200/50">1 {fromSymbol} ≈ {(bqToAmount / Number(batchAmount || 1)).toFixed(6)} {bqRouter?.toTokenSymbol || toSymbol}</span>
                            </div>
                            {bqPriceImpact && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.priceImpact', 'Price Impact')}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className={`font-semibold ${Number(bqPriceImpact) <= 1 ? 'text-emerald-400' : Number(bqPriceImpact) <= 3 ? 'text-amber-400' : 'text-red-400'}`}>{Number(bqPriceImpact).toFixed(2)}%</span>
                                        <span className={`text-[8px] ${Number(bqPriceImpact) <= 1 ? 'text-emerald-400/50' : Number(bqPriceImpact) <= 3 ? 'text-amber-400/50' : 'text-red-400/50'}`}>
                                            {Number(bqPriceImpact) <= 1 ? t('dashboard.tradingUx.priceImpactLow', 'Low') : Number(bqPriceImpact) <= 3 ? t('dashboard.tradingUx.priceImpactMed', 'Moderate') : t('dashboard.tradingUx.priceImpactHigh', 'High!')}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {bqGas && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.estGas', 'Est. Gas')}</span>
                                    <span className="text-surface-200/50">{Number(bqGas) > 1e6 ? `${(Number(bqGas) * 1e-9).toFixed(4)} Gwei` : bqGas}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">{t('dashboard.tradingUx.slippage', 'Slippage')}</span>
                                <span className="text-surface-200/50">{slippage}%</span>
                            </div>
                            {bqDexRoutes.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                    <p className="text-[9px] text-surface-200/25 uppercase tracking-widest mb-1.5 font-semibold">{t('dashboard.tradingUx.dexRoutes', 'DEX Routes')}</p>
                                    {bqDexRoutes.slice(0, 4).map((r, i) => {
                                        const receiveAmt = Number(r.receiveAmount || 0) / Math.pow(10, Number(bqRouter?.toToken?.decimal || 18));
                                        return (
                                            <div key={i} className="flex justify-between text-[10px] py-0.5">
                                                <span className={`font-medium ${i === 0 ? 'text-emerald-400' : 'text-surface-200/40'}`}>
                                                    {i === 0 && '★ '}{r.dexName}
                                                </span>
                                                <span className="text-surface-200/50">{receiveAmt.toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Confirmation dialog (P3) */}
                {batchShowConfirm ? (
                    <div className="space-y-2 animate-fadeIn bg-surface-900/60 rounded-xl p-3 border border-white/[0.06]">
                        <p className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold"><AlertTriangle size={11} /> {t('dashboard.tradingUx.confirmBatchSwap', 'Confirm batch swap:')}</p>
                        <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.pair', 'Pair')}</span><span className="text-surface-100 font-bold">{fromSymbol} → {toSymbol}</span></div>
                            <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.wallets', 'Wallets')}</span><span className="text-surface-100">{batchSelectedCount}</span></div>
                            <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.amountEach', 'Amount each')}</span><span className="text-surface-100">{batchSameAmount ? `${batchAmount} ${fromSymbol}` : t('dashboard.tradingUx.custom', 'Custom')}</span></div>
                            <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.totalAmount', 'Total')}</span><span className="text-surface-100 font-bold">{batchSameAmount ? `${(Number(batchAmount) * batchSelectedCount).toFixed(4)} ${fromSymbol}` : t('dashboard.tradingUx.varies', 'Varies')}</span></div>
                            <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.slipPct', 'Slippage')}</span><span className="text-surface-100">{slippage}%</span></div>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={() => setBatchShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-surface-800/60 border border-white/[0.08] text-xs text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                            <button onClick={handleBatchSwap} disabled={batchExecuting}
                                className="flex-1 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold hover:shadow-orange-500/25 transition-all disabled:opacity-40">
                                {batchExecuting ? <Loader2 size={12} className="animate-spin mx-auto" /> : `✅ ${t('dashboard.tradingUx.confirmExecute', 'Confirm Execute')}`}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setBatchShowConfirm(true)} disabled={batchExecuting || batchSelectedCount === 0 || !batchAmount || !batchQuote}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-lg hover:shadow-orange-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5">
                        <Zap size={12} /> {t('dashboard.tradingUx.batchSwap', 'Batch Swap')} ({batchSelectedCount} {t('dashboard.tradingUx.wallets', 'wallets')})
                    </button>
                )}

                {/* Progress bar (P4) */}
                {batchExecuting && batchProgress.total > 0 && (
                    <div>
                        <div className="flex justify-between text-[9px] text-surface-200/30 mb-0.5">
                            <span>{t('dashboard.tradingUx.swapping', 'Swapping')}...</span>
                            <span>{batchProgress.done}/{batchProgress.total}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-surface-800/60 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-300" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
                        </div>
                    </div>
                )}

                {/* Results */}
                {batchResults.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-[9px] text-surface-200/30 font-semibold">{t('dashboard.tradingUx.results', 'Results')}: {batchResults.filter(r => r.txHash).length}/{batchResults.length} ✓</p>
                        {batchResults.map((r, i) => (
                            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] ${r.txHash ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                                {r.txHash ? <Check size={10} className="text-emerald-400" /> : <AlertTriangle size={10} className="text-red-400" />}
                                <span className="flex-1 truncate text-surface-100">{r.walletName || `Wallet ${r.walletId}`}</span>
                                {r.amount && <span className="text-[8px] text-surface-200/30 font-mono">{r.amount} {fromSymbol}</span>}
                                {r.txHash ? (
                                    <a href={getExplorerTxUrl(chainIndex, r.txHash)} target="_blank" rel="noopener"
                                        className="text-brand-400 font-mono hover:text-brand-300">{r.txHash.slice(0, 10)}... <ExternalLink size={9} className="inline" /></a>
                                ) : <span className="text-red-400 truncate max-w-[150px]">{r.error}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Top Tokens List — Premium (#14)
   ═══════════════════════════════════════════ */
function TopTokensList({ chainIndex, onSelectToken }) {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('2');
    const [timeFrame, setTimeFrame] = useState('4');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getTopTokens(chainIndex, sortBy, timeFrame);
            // Fetch candles for sparklines
            const list = data.data || [];
            setTokens(list);
            // Fetch sparkline data in background
            Promise.allSettled(
                list.slice(0, 10).map(async (t, idx) => {
                    if (!t.tokenContractAddress) return;
                    try {
                        const candles = await api.getCandles(chainIndex, t.tokenContractAddress, '1H', 24);
                        const closes = (candles.data || []).map(c => Number(c.close || c[4] || 0)).filter(v => v > 0).reverse();
                        setTokens(prev => prev.map((p, i) => i === idx ? { ...p, sparkData: closes } : p));
                    } catch {}
                })
            );
        } catch { /* ignore */ }
        setLoading(false);
    }, [chainIndex, sortBy, timeFrame]);

    useEffect(() => { load(); }, [load]);

    const sortOptions = [
        { value: '2', label: 'Price Δ' },
        { value: '5', label: 'Volume' },
        { value: '6', label: 'MCap' },
    ];
    const timeOptions = [
        { value: '1', label: '5m' },
        { value: '2', label: '1h' },
        { value: '3', label: '4h' },
        { value: '4', label: '24h' },
    ];

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-500 to-emerald-500 rounded-t-2xl" />
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                    <TrendingUp size={14} className="text-brand-400" />
                    Top Tokens
                </h3>
                <div className="flex gap-0.5">
                    {sortOptions.map(o => (
                        <button key={o.value} onClick={() => setSortBy(o.value)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${sortBy === o.value
                                ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                                : 'text-surface-200/25 hover:text-surface-200/50 border border-transparent'
                            }`}>
                            {o.label}
                        </button>
                    ))}
                    <span className="w-px bg-white/5 mx-1" />
                    {timeOptions.map(o => (
                        <button key={o.value} onClick={() => setTimeFrame(o.value)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${timeFrame === o.value
                                ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                                : 'text-surface-200/25 hover:text-surface-200/50 border border-transparent'
                            }`}>
                            {o.label}
                        </button>
                    ))}
                    <button onClick={load} className="ml-1 p-1 rounded-lg text-surface-200/20 hover:text-brand-400 transition-colors">
                        <RefreshCw size={11} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-surface-200/30" /></div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {tokens.slice(0, 15).map((token, i) => {
                        const price = Number(token.price || 0);
                        const change = Number(token.priceChangePercentage24H || token.change24h || 0);
                        const volume = Number(token.volume24H || token.volume || 0);
                        const marketCap = Number(token.marketCap || 0);

                        return (
                            <div key={i}
                                onClick={() => onSelectToken?.(token.tokenSymbol, token.tokenContractAddress)}
                                className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer group">
                                <span className="text-[10px] text-surface-200/15 w-4 text-right font-semibold">{i + 1}</span>
                                <div className="w-7 h-7 rounded-full bg-surface-700/60 border border-white/5 flex items-center justify-center text-[10px] font-bold text-surface-200/60 group-hover:border-brand-500/30 transition-colors">
                                    {(token.tokenSymbol || '?').slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-surface-100">{token.tokenSymbol || '?'}</p>
                                    <p className="text-[10px] text-surface-200/20 truncate">{token.tokenFullName || ''}</p>
                                </div>
                                {/* Sparkline (#14) */}
                                {token.sparkData && <Sparkline data={token.sparkData} width={60} height={24} color={change >= 0 ? '#34d399' : '#f87171'} />}
                                <div className="text-right">
                                    <p className="text-xs text-surface-100 font-semibold">{formatPrice(price)}</p>
                                    {formatChange(change)}
                                </div>
                                <div className="text-right hidden md:block w-20">
                                    <p className="text-[10px] text-surface-200/30">{formatLargeNum(volume)}</p>
                                    {marketCap > 0 && <p className="text-[10px] text-surface-200/20">{formatLargeNum(marketCap)}</p>}
                                </div>
                                <ArrowLeftRight size={11} className="text-surface-200/10 group-hover:text-brand-400 transition-colors hidden md:block" />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   TX History Widget
   ═══════════════════════════════════════════ */
function TxHistory({ chainIndex }) {
    const { t } = useTranslation();
    const [txs, setTxs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.getTxHistory(1, 10);
                setTxs(data.transactions || []);
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
    }, []);

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-2xl" />
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
                <Clock size={14} className="text-blue-400" />
                <h3 className="text-xs font-bold text-surface-100">{t('dashboard.trading.recentTransactions', 'Recent Transactions')}</h3>
            </div>
            {loading ? (
                <div className="p-8 flex justify-center"><Loader2 size={16} className="animate-spin text-surface-200/30" /></div>
            ) : txs.length === 0 ? (
                <div className="p-8 text-center text-xs text-surface-200/20">{t('dashboard.trading.noTransactions', 'No transactions yet')}</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {txs.map((tx, i) => {
                        const isSwap = tx.type?.includes('swap');
                        const date = tx.createdAt ? new Date(tx.createdAt * 1000).toLocaleString() : '—';
                        const fromAmt = tx.fromAmount != null ? String(tx.fromAmount) : '—';
                        const toAmt = tx.toAmount != null ? String(tx.toAmount) : '';
                        const rate = tx.fromAmount && tx.toAmount && Number(tx.fromAmount) > 0
                            ? String(Number(tx.toAmount) / Number(tx.fromAmount))
                            : null;
                        return (
                            <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isSwap ? 'bg-brand-500/15' : 'bg-emerald-500/15'}`}>
                                    {isSwap ? <ArrowLeftRight size={12} className="text-brand-400" /> : <ArrowUpRight size={12} className="text-emerald-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-surface-100 capitalize">{tx.type?.replace(/_/g, ' ') || 'Transaction'}</p>
                                    {isSwap && tx.fromSymbol && tx.toSymbol && (
                                        <p className="text-[10px] text-brand-400/60 font-semibold">{tx.fromSymbol} → {tx.toSymbol}</p>
                                    )}
                                    <p className="text-[10px] text-surface-200/20">{date}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-xs text-surface-100 font-mono">{fromAmt} <span className="text-surface-200/40">{tx.fromSymbol || ''}</span></p>
                                    {toAmt && <p className="text-[10px] text-emerald-400 font-mono">→ {toAmt} <span className="text-emerald-400/50">{tx.toSymbol || ''}</span></p>}
                                    {rate && <p className="text-[8px] text-surface-200/20 font-mono">1 {tx.fromSymbol} = {rate} {tx.toSymbol}</p>}
                                </div>
                                {tx.txHash && (
                                    <a href={getExplorerTxUrl(chainIndex, tx.txHash)} target="_blank" rel="noopener"
                                        className="text-surface-200/15 hover:text-brand-400 transition-colors">
                                        <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Chain Selector (#13)
   ═══════════════════════════════════════════ */
function ChainSelector({ selected, onChange }) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const dropdownRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });

    useEffect(() => {
        if (open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (dropdownRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const dropdownPanel = open ? createPortal(
        <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-surface-800/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/40 overflow-hidden animate-fadeIn min-w-[160px]"
            style={{ top: pos.top, right: pos.right }}
        >
            {Object.entries(CHAINS).map(([id, chain]) => (
                <button key={id} onClick={() => { onChange(id); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all ${
                        id === selected ? 'bg-brand-500/15 text-brand-400 font-bold' : 'text-surface-200/60 hover:bg-white/[0.05] hover:text-surface-100'
                    }`}>
                    <span>{chain.icon}</span>
                    <span className="font-medium">{chain.name}</span>
                    {id === selected && <span className="ml-auto text-brand-400">✓</span>}
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div className="relative">
            <button ref={triggerRef} onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] text-surface-100 text-xs font-semibold transition-all">
                <span className="text-sm">{CHAINS[selected]?.icon}</span>
                <span>{CHAINS[selected]?.name}</span>
                <ChevronDown size={12} className={`text-surface-200/30 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {dropdownPanel}
        </div>
    );
}


/* ═══════════════════════════════════════════
   DCA Widget — Auto Buy/Sell on Schedule (Premium)
   ═══════════════════════════════════════════ */
function DcaWidget({ chainIndex, wallets: sharedWallets = [] }) {
    const { t } = useTranslation();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [wallets, setWallets] = useState(sharedWallets);
    const [showConfirm, setShowConfirm] = useState(false);
    const [expandedTask, setExpandedTask] = useState(null);
    const knownTokens = KNOWN_TOKENS[chainIndex] || KNOWN_TOKENS['196'];
    const [walletTokens, setWalletTokens] = useState([]);
    const [walletBalance, setWalletBalance] = useState(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    // To-token selector state
    const [showToTokenSelector, setShowToTokenSelector] = useState(false);
    const [toTokenSearch, setToTokenSearch] = useState('');
    const [toTokenSearchResults, setToTokenSearchResults] = useState([]);
    const [toTokenSearching, setToTokenSearching] = useState(false);
    const toTokenSearchTimeout = useRef(null);
    // Delete confirm, Edit, Duplicate states
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [editForm, setEditForm] = useState({ amount: '', interval: '', stopLossPct: '', takeProfitPct: '' });
    const [editSaving, setEditSaving] = useState(false);

    const [form, setForm] = useState({
        walletId: '', fromTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toTokenAddress: '',
        fromSymbol: 'OKB', toSymbol: '', amount: '', interval: '86400000',
        stopLossPct: '', takeProfitPct: ''
    });

    const INTERVALS = [
        { label: t('dashboard.dca.5min', '5 min'), ms: 300000, short: '5m' },
        { label: t('dashboard.dca.15min', '15 min'), ms: 900000, short: '15m' },
        { label: t('dashboard.dca.1hour', '1 hour'), ms: 3600000, short: '1h' },
        { label: t('dashboard.dca.4hours', '4 hours'), ms: 14400000, short: '4h' },
        { label: t('dashboard.dca.24hours', '24 hours'), ms: 86400000, short: '24h' },
        { label: t('dashboard.dca.7days', '7 days'), ms: 604800000, short: '7d' },
    ];
    const INTERVALS_SHORT = { 300000: '5m', 900000: '15m', 3600000: '1h', 14400000: '4h', 86400000: '24h', 604800000: '7d' };

    const loadTasks = async () => {
        try {
            const res = await api.getDcaTasks();
            setTasks(res.tasks || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { loadTasks(); }, []);
    useEffect(() => { setWallets(sharedWallets); }, [sharedWallets]);

    // Fetch wallet balance when wallet changes
    useEffect(() => {
        const wId = form.walletId;
        if (!wId) { setWalletBalance(null); setWalletTokens([]); return; }
        setBalanceLoading(true);
        api.getWalletBalance(wId)
            .then(res => {
                const balances = res.tokens || res.balances || res.tokenAssets || [];
                setWalletTokens(balances);
                const sym = form.fromSymbol.toUpperCase();
                const match = balances.find(b => (b.symbol || b.tokenSymbol || '').toUpperCase() === sym);
                setWalletBalance(match ? Number(match.balance || match.holdingAmount || 0) : 0);
            })
            .catch(() => setWalletBalance(null))
            .finally(() => setBalanceLoading(false));
    }, [form.walletId, form.fromSymbol, chainIndex]);

    // Debounced token search
    const handleToTokenSearchChange = useCallback((val) => {
        setToTokenSearch(val);
        if (toTokenSearchTimeout.current) clearTimeout(toTokenSearchTimeout.current);
        if (!val.trim() || val.trim().length < 2) { setToTokenSearchResults([]); return; }
        toTokenSearchTimeout.current = setTimeout(async () => {
            setToTokenSearching(true);
            try {
                const data = await api.searchToken(val.trim(), String(chainIndex));
                setToTokenSearchResults(data?.data || data?.tokens || data || []);
            } catch { setToTokenSearchResults([]); }
            setToTokenSearching(false);
        }, 400);
    }, [chainIndex]);

    const selectToToken = (addr, sym, logo) => {
        setForm(f => ({ ...f, toTokenAddress: addr, toSymbol: sym }));
        setShowToTokenSelector(false);
        setToTokenSearch('');
        setToTokenSearchResults([]);
    };

    const handleCreate = async () => {
        if (!form.walletId || !form.toTokenAddress || !form.amount) return;
        setCreating(true);
        try {
            await api.createDca({
                walletId: form.walletId, chainIndex,
                fromTokenAddress: form.fromTokenAddress, toTokenAddress: form.toTokenAddress,
                fromSymbol: form.fromSymbol, toSymbol: form.toSymbol || '?',
                amount: form.amount, intervalMs: Number(form.interval),
                stopLossPct: form.stopLossPct || undefined,
                takeProfitPct: form.takeProfitPct || undefined,
            });
            setShowForm(false);
            setShowConfirm(false);
            setForm(f => ({ ...f, amount: '', toTokenAddress: '', toSymbol: '' }));
            setCreateError(null);
            loadTasks();
        } catch (err) { setCreateError(err.message); setShowConfirm(false); }
        setCreating(false);
    };

    const handleAction = async (id, action) => {
        try {
            if (action === 'delete') { await api.deleteDca(id); }
            else { await api.updateDca(id, { action }); }
            loadTasks();
        } catch { /* ignore */ }
    };

    // Delete with confirmation
    const handleDelete = async (id) => {
        try { await api.deleteDca(id); setDeleteConfirmId(null); loadTasks(); } catch { /* ignore */ }
    };

    // Duplicate schedule → prefill form
    const handleDuplicate = (task) => {
        setForm(f => ({
            ...f,
            walletId: String(task.walletId || ''),
            fromTokenAddress: task.fromTokenAddress || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            fromSymbol: task.fromSymbol || 'OKB',
            toTokenAddress: task.toTokenAddress || '',
            toSymbol: task.toSymbol || '',
            amount: String(task.amount || ''),
            interval: String(task.intervalMs || '86400000'),
            stopLossPct: task.stopLossPct ? String(task.stopLossPct) : '',
            takeProfitPct: task.takeProfitPct ? String(task.takeProfitPct) : '',
        }));
        setShowForm(true);
        setExpandedTask(null);
    };

    // Start editing a task
    const startEdit = (task) => {
        setEditingTask(task.id);
        setEditForm({
            amount: String(task.amount || ''),
            interval: String(task.intervalMs || '86400000'),
            stopLossPct: task.stopLossPct ? String(task.stopLossPct) : '',
            takeProfitPct: task.takeProfitPct ? String(task.takeProfitPct) : '',
        });
    };

    // Save edit
    const handleEditSave = async (taskId) => {
        setEditSaving(true);
        try {
            await api.editDca(taskId, {
                amount: editForm.amount,
                intervalMs: Number(editForm.interval),
                stopLossPct: editForm.stopLossPct || null,
                takeProfitPct: editForm.takeProfitPct || null,
            });
            setEditingTask(null);
            loadTasks();
        } catch { /* ignore */ }
        setEditSaving(false);
    };

    const fmtInterval = (ms) => {
        if (INTERVALS_SHORT[ms]) return INTERVALS_SHORT[ms];
        const h = ms / 3600000;
        return h >= 24 ? `${(h / 24).toFixed(0)}d` : `${h.toFixed(0)}h`;
    };

    // Quick presets
    const QUICK_PRESETS = [
        { label: `OKB → USDT ${t('dashboard.dca.daily', 'daily')}`, from: 'OKB', fromAddr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', to: 'USDT', toAddr: (knownTokens['USDT']?.address || ''), interval: '86400000', amount: '0.1' },
        { label: `OKB → ETH ${t('dashboard.dca.weekly', 'weekly')}`, from: 'OKB', fromAddr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', to: 'ETH', toAddr: (knownTokens['ETH']?.address || ''), interval: '604800000', amount: '0.5' },
    ].filter(p => p.toAddr); // only show if we know the address

    const applyPreset = (preset) => {
        setForm(f => ({
            ...f,
            fromSymbol: preset.from,
            fromTokenAddress: preset.fromAddr,
            toTokenAddress: preset.toAddr,
            toSymbol: preset.to,
            amount: preset.amount,
            interval: preset.interval,
        }));
        setShowForm(true);
    };

    // Estimated cost
    const estimatedCost = useMemo(() => {
        if (!form.amount || !form.interval) return null;
        const amt = Number(form.amount);
        if (!amt || amt <= 0) return null;
        const ms = Number(form.interval);
        const perWeek = (604800000 / ms) * amt;
        const perMonth = perWeek * 4.33;
        return { perWeek: perWeek.toFixed(4), perMonth: perMonth.toFixed(2) };
    }, [form.amount, form.interval]);

    const selectedWallet = wallets.find(w => String(w.id) === String(form.walletId));
    const selectedInterval = INTERVALS.find(i => String(i.ms) === String(form.interval));
    const canSubmit = form.walletId && form.toTokenAddress && form.amount && Number(form.amount) > 0;
    const activeCount = tasks.filter(tk => tk.status === 'active').length;

    return (
        <div className="glass-card p-5 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 rounded-t-2xl" />

            {/* ─── Header — matches Swap/Transfer ─── */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
                    <Repeat size={15} className="text-violet-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-surface-100">{t('dashboard.tradingUx.dcaAutoSwap', 'DCA — Auto Swap')}</h3>
                    {activeCount > 0 && (
                        <p className="text-[9px] text-emerald-400/70">{activeCount} {t('dashboard.dca.activeSchedules', 'active schedule(s)')}</p>
                    )}
                </div>
                <button onClick={() => { setShowForm(!showForm); setShowConfirm(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all ${showForm
                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                        : 'bg-surface-800/60 text-surface-200/40 hover:text-violet-400 hover:bg-violet-500/10 border border-white/[0.06]'
                    }`}>
                    {showForm ? <><X size={11} /> {t('dashboard.common.cancel', 'Cancel')}</> : <><Plus size={11} /> {t('dashboard.dca.newSchedule', 'New')}</>}
                </button>
            </div>

            {/* ─── Create Form ─── */}
            {showForm && (
                <div className="space-y-3 animate-fadeIn mb-4">
                    {/* Wallet selector — reuse WalletDropdown */}
                    <WalletDropdown wallets={wallets} value={form.walletId} onChange={(id) => setForm(f => ({ ...f, walletId: id }))} accentColor="violet" chainIndex={chainIndex} />

                    {/* From token chips — like Swap/Transfer */}
                    {walletTokens.length > 0 && (
                        <div>
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">{t('dashboard.dca.fromToken', 'FROM TOKEN')}</label>
                            <div className="flex flex-wrap gap-1.5">
                                {walletTokens.filter(wt => Number(wt.balance || 0) > 0).map((wt, i) => {
                                    const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                                    const logo = wt.logoUrl || wt.tokenLogoUrl || '';
                                    const bal = Number(wt.balance || 0);
                                    const isActive = form.fromSymbol === sym;
                                    const addr = wt.tokenContractAddress || wt.address || '';
                                    return (
                                        <button key={i} onClick={() => setForm(f => ({
                                            ...f, fromSymbol: sym,
                                            fromTokenAddress: addr || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                                        }))} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-medium transition-all ${
                                            isActive ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-surface-800/40 text-surface-200/40 border border-white/[0.06] hover:border-white/[0.12]'
                                        }`}>
                                            {logo ? <img src={logo} alt="" width={12} height={12} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{knownTokens[sym]?.icon || '🪙'}</span>}
                                            <span>{sym}</span>
                                            <span className="text-surface-200/20">{parseFloat(bal.toFixed(4))}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Available balance */}
                            {form.walletId && walletBalance != null && (
                                <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[9px] text-surface-200/30">
                                        {t('dashboard.tradingUx.available', 'Available')}: {balanceLoading ? '...' : parseFloat(Number(walletBalance).toFixed(4))} {form.fromSymbol}
                                    </span>
                                    {walletBalance > 0 && (
                                        <button onClick={() => setForm(f => ({ ...f, amount: String(walletBalance) }))} className="text-[9px] text-brand-400 font-bold hover:text-brand-300 transition-colors">MAX</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── To Token Selector (wallet tokens + search) ─── */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">{t('dashboard.dca.toToken', 'TO TOKEN')}</label>
                        <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                            {/* Selected token display / manual input */}
                            <div className="flex items-center gap-2">
                                {form.toSymbol ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-sm font-bold text-surface-100">{form.toSymbol}</span>
                                        <span className="text-[9px] text-surface-200/25 font-mono truncate">{form.toTokenAddress.slice(0, 10)}...{form.toTokenAddress.slice(-6)}</span>
                                        <button onClick={() => { setForm(f => ({ ...f, toTokenAddress: '', toSymbol: '' })); setShowToTokenSelector(true); }}
                                            className="ml-auto text-surface-200/30 hover:text-red-400 transition-colors p-0.5"><X size={12} /></button>
                                    </div>
                                ) : (
                                    <input type="text" value={form.toTokenAddress}
                                        placeholder={t('dashboard.dca.toTokenPlaceholder', '0x... or search by name')}
                                        onChange={e => setForm(f => ({ ...f, toTokenAddress: e.target.value }))}
                                        onFocus={() => setShowToTokenSelector(true)}
                                        className="w-full bg-transparent text-sm text-surface-100 font-mono outline-none placeholder:text-surface-200/15" />
                                )}
                                <button onClick={() => setShowToTokenSelector(!showToTokenSelector)}
                                    className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${showToTokenSelector ? 'bg-violet-500/15 text-violet-400' : 'text-surface-200/25 hover:text-violet-400'}`}>
                                    <Search size={13} />
                                </button>
                            </div>

                            {/* Token selector dropdown */}
                            {showToTokenSelector && (
                                <div className="mt-3 space-y-2 animate-fadeIn">
                                    {/* Search input */}
                                    <div className="flex items-center gap-2 bg-surface-800/80 rounded-xl px-3 py-2 border border-white/[0.06]">
                                        <Search size={12} className="text-surface-200/25 flex-shrink-0" />
                                        <input type="text" value={toTokenSearch}
                                            onChange={e => handleToTokenSearchChange(e.target.value)}
                                            placeholder={t('dashboard.dca.searchToken', 'Search token name or symbol...')}
                                            className="w-full bg-transparent text-xs text-surface-100 outline-none placeholder:text-surface-200/20" />
                                        {toTokenSearching && <Loader2 size={12} className="animate-spin text-violet-400 flex-shrink-0" />}
                                    </div>

                                    {/* Wallet tokens section */}
                                    {walletTokens.length > 0 && !toTokenSearch && (
                                        <div>
                                            <p className="text-[9px] text-surface-200/25 uppercase tracking-wider font-semibold mb-1">{t('dashboard.dca.walletTokens', 'Wallet Tokens')}</p>
                                            <div className="max-h-[140px] overflow-y-auto space-y-0.5 rounded-lg">
                                                {walletTokens.filter(wt => {
                                                    const sym = (wt.symbol || wt.tokenSymbol || '').toUpperCase();
                                                    return sym !== form.fromSymbol; // exclude the FROM token
                                                }).map((wt, i) => {
                                                    const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                                                    const logo = wt.logoUrl || wt.tokenLogoUrl || '';
                                                    const addr = wt.tokenContractAddress || wt.address || '';
                                                    const bal = Number(wt.balance || 0);
                                                    const isSelected = form.toTokenAddress === addr;
                                                    return (
                                                        <button key={i} onClick={() => selectToToken(addr, sym)}
                                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${isSelected
                                                                ? 'bg-violet-500/15 text-violet-400 font-bold'
                                                                : 'text-surface-200/60 hover:bg-white/[0.04] hover:text-surface-100'
                                                            }`}>
                                                            {logo ? <img src={logo} alt="" width={18} height={18} className="rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                                                                : <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center text-[8px]">{sym[0]}</div>}
                                                            <span className="font-semibold flex-1 text-left">{sym}</span>
                                                            {bal > 0 && <span className="text-[9px] text-surface-200/25 font-mono">{parseFloat(bal.toFixed(4))}</span>}
                                                            {isSelected && <Check size={12} className="text-violet-400" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Search results */}
                                    {toTokenSearch && toTokenSearchResults.length > 0 && (
                                        <div>
                                            <p className="text-[9px] text-surface-200/25 uppercase tracking-wider font-semibold mb-1">{t('dashboard.dca.searchResults', 'Search Results')}</p>
                                            <div className="max-h-[180px] overflow-y-auto space-y-0.5 rounded-lg">
                                                {toTokenSearchResults.slice(0, 15).map((tkn, i) => {
                                                    const sym = (tkn.tokenSymbol || tkn.symbol || '?').toUpperCase();
                                                    const name = tkn.tokenName || tkn.name || '';
                                                    const addr = tkn.tokenContractAddress || tkn.address || '';
                                                    const logo = tkn.logoUrl || tkn.tokenLogoUrl || '';
                                                    return (
                                                        <button key={i} onClick={() => selectToToken(addr, sym)}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-surface-200/60 hover:bg-white/[0.04] hover:text-surface-100 transition-all">
                                                            {logo ? <img src={logo} alt="" width={18} height={18} className="rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                                                                : <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center text-[8px]">{sym[0]}</div>}
                                                            <div className="flex-1 text-left min-w-0">
                                                                <span className="font-semibold">{sym}</span>
                                                                {name && <span className="text-surface-200/30 ml-1.5">{name}</span>}
                                                                <p className="text-[9px] text-surface-200/15 font-mono truncate">{addr}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* No results */}
                                    {toTokenSearch && !toTokenSearching && toTokenSearchResults.length === 0 && toTokenSearch.length >= 2 && (
                                        <p className="text-[10px] text-surface-200/20 text-center py-2">{t('dashboard.dca.noResults', 'No tokens found. You can paste contract address above.')}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Amount + Interval row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">{t('dashboard.tradingUx.amount', 'Amount')}</label>
                            <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                                <input type="number" value={form.amount} placeholder="0.1" onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full bg-transparent text-lg font-bold text-surface-100 outline-none placeholder:text-surface-200/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <span className="text-[9px] text-surface-200/25 mt-0.5 block">{form.fromSymbol} {t('dashboard.dca.perSwap', 'per swap')}</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">{t('dashboard.tradingUx.interval', 'Interval')}</label>
                            <div className="grid grid-cols-3 gap-1">
                                {INTERVALS.map(i => {
                                    const isSelected = String(i.ms) === String(form.interval);
                                    return (
                                        <button key={i.ms} onClick={() => setForm(f => ({ ...f, interval: String(i.ms) }))}
                                            className={`py-2 rounded-lg text-[10px] font-semibold transition-all ${isSelected
                                                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                                : 'bg-surface-800/60 text-surface-200/40 border border-white/[0.06] hover:border-white/[0.12]'
                                            }`}>
                                            {i.short}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Stop Loss / Take Profit — collapsible */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold flex items-center gap-1">
                                <ArrowDownRight size={9} className="text-red-400" /> {t('dashboard.tradingUx.stopLoss', 'Stop Loss %')}
                            </label>
                            <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                                <input type="number" value={form.stopLossPct} placeholder="10" onChange={e => setForm(f => ({ ...f, stopLossPct: e.target.value }))}
                                    className="w-full bg-transparent text-sm font-semibold text-surface-100 outline-none placeholder:text-surface-200/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold flex items-center gap-1">
                                <ArrowUpRight size={9} className="text-emerald-400" /> {t('dashboard.tradingUx.takeProfit', 'Take Profit %')}
                            </label>
                            <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                                <input type="number" value={form.takeProfitPct} placeholder="50" onChange={e => setForm(f => ({ ...f, takeProfitPct: e.target.value }))}
                                    className="w-full bg-transparent text-sm font-semibold text-surface-100 outline-none placeholder:text-surface-200/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                        </div>
                    </div>

                    {/* #2 Estimated Cost */}
                    {estimatedCost && (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-violet-500/5 border border-violet-500/10 animate-fadeIn">
                            <BarChart3 size={12} className="text-violet-400/60 flex-shrink-0" />
                            <span className="text-[10px] text-surface-200/40">
                                {t('dashboard.dca.estimatedCost', 'Est. cost')}:
                                <span className="text-surface-100 font-semibold ml-1">~{estimatedCost.perWeek} {form.fromSymbol}/{t('dashboard.dca.week', 'week')}</span>
                                <span className="text-surface-200/20 mx-1">•</span>
                                <span className="text-surface-100 font-semibold">~{estimatedCost.perMonth} {form.fromSymbol}/{t('dashboard.dca.month', 'month')}</span>
                            </span>
                        </div>
                    )}

                    {/* #1 Quick Presets */}
                    {QUICK_PRESETS.length > 0 && !form.toTokenAddress && (
                        <div>
                            <p className="text-[9px] text-surface-200/25 uppercase tracking-wider font-semibold mb-1.5">{t('dashboard.dca.quickPresets', 'Quick Presets')}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {QUICK_PRESETS.map((p, i) => (
                                    <button key={i} onClick={() => applyPreset(p)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-surface-800/40 text-surface-200/50 border border-white/[0.06] hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/10 transition-all">
                                        <Zap size={9} className="text-amber-400" /> {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Confirmation step — like Transfer widget */}
                    {showConfirm ? (
                        <div className="space-y-2 animate-fadeIn bg-surface-900/60 rounded-xl p-3 border border-white/[0.06]">
                            <p className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold"><AlertTriangle size={11} /> {t('dashboard.dca.confirmCreate', 'Confirm DCA schedule:')}</p>
                            <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.wallet', 'Wallet')}</span><span className="text-surface-100 font-mono">{selectedWallet?.name || `Wallet ${form.walletId}`}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.dca.pair', 'Pair')}</span><span className="text-surface-100 font-bold">{form.fromSymbol} → {form.toSymbol || form.toTokenAddress.slice(0, 8) + '...'}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.trading.amount', 'Amount')}</span><span className="text-surface-100 font-bold">{form.amount} {form.fromSymbol}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.interval', 'Interval')}</span><span className="text-surface-100">{selectedInterval?.label || '24h'}</span></div>
                                {estimatedCost && (
                                    <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.dca.estimatedCost', 'Est. cost')}</span><span className="text-violet-400 font-semibold">~{estimatedCost.perWeek} {form.fromSymbol}/{t('dashboard.dca.week', 'week')}</span></div>
                                )}
                                {form.stopLossPct && <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.stopLoss', 'Stop Loss')}</span><span className="text-red-400">-{form.stopLossPct}%</span></div>}
                                {form.takeProfitPct && <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.takeProfit', 'Take Profit')}</span><span className="text-emerald-400">+{form.takeProfitPct}%</span></div>}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-surface-800/60 border border-white/[0.08] text-xs text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                                <button onClick={handleCreate} disabled={creating}
                                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-bold hover:shadow-violet-500/25 transition-all disabled:opacity-40">
                                    {creating ? <Loader2 size={12} className="animate-spin mx-auto" /> : `✅ ${t('dashboard.dca.confirmStart', 'Start DCA')}`}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => canSubmit ? setShowConfirm(true) : null} disabled={!canSubmit}
                            className="w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <Repeat size={14} /> {t('dashboard.dca.createSchedule', 'Create DCA Schedule')}
                        </button>
                    )}

                    {createError && (
                        <div className="px-3 py-2 rounded-xl text-xs bg-red-500/10 border border-red-500/15 text-red-400 flex items-center gap-1.5">
                            <AlertTriangle size={11} /> {createError}
                            <button onClick={() => setCreateError(null)} className="ml-auto text-red-300 hover:text-red-200"><X size={10} /></button>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Schedule List ─── */}
            {loading ? (
                <div className="p-6 flex justify-center"><Loader2 size={16} className="animate-spin text-surface-200/30" /></div>
            ) : tasks.length === 0 && !showForm ? (
                <div className="text-center py-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 flex items-center justify-center mx-auto mb-3">
                        <Repeat size={24} className="text-violet-400/30" />
                    </div>
                    <p className="text-xs text-surface-200/30 font-medium">{t('dashboard.trading.noDcaSchedules', 'No DCA schedules yet')}</p>
                    <p className="text-[10px] text-surface-200/15 mt-1 mb-3">{t('dashboard.dca.emptyHint', 'Automate your buys at regular intervals')}</p>
                    <button onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500/15 text-violet-400 text-xs font-semibold hover:bg-violet-500/25 transition-all border border-violet-500/20">
                        <Plus size={12} /> {t('dashboard.dca.newSchedule', 'New Schedule')}
                    </button>
                </div>
            ) : tasks.length > 0 ? (
                <div className={`divide-y divide-white/[0.03] ${showForm ? 'border-t border-white/5' : ''}`}>
                    {tasks.map(task => {
                        const isActive = task.status === 'active';
                        const isPaused = task.status === 'paused';
                        const isExpanded = expandedTask === task.id;
                        const isEditing = editingTask === task.id;
                        const isDeleteConfirm = deleteConfirmId === task.id;
                        const nextRun = task.nextRunAt ? new Date(task.nextRunAt).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                        return (
                            <div key={task.id} className="group">
                                <div className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400 shadow-lg shadow-emerald-400/30' : isPaused ? 'bg-amber-400' : 'bg-surface-200/20'}`}>
                                        {isActive && <div className="w-full h-full rounded-full bg-emerald-400 animate-ping" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-surface-100 flex items-center gap-1.5">
                                            {task.fromSymbol} → {task.toSymbol}
                                            <span className="text-[9px] text-surface-200/25 bg-surface-800/60 px-1.5 py-0.5 rounded-md">{fmtInterval(task.intervalMs)}</span>
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-emerald-500/15 text-emerald-400' : isPaused ? 'bg-amber-500/15 text-amber-400' : 'bg-surface-200/10 text-surface-200/30'}`}>
                                                {isActive ? `● ${t('dashboard.dca.statusActive', 'ACTIVE')}` : isPaused ? `◼ ${t('dashboard.dca.statusPaused', 'PAUSED')}` : `● ${t('dashboard.dca.statusStopped', 'STOPPED')}`}
                                            </span>
                                        </p>
                                        <p className="text-[10px] text-surface-200/30">
                                            {task.amount} {task.fromSymbol} {t('dashboard.dca.perSwap', 'per swap')}
                                            {isActive && <span className="text-emerald-400/60 ml-1">• {t('dashboard.dca.next', 'Next')}: {nextRun}</span>}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                        {isActive && (
                                            <button onClick={(e) => { e.stopPropagation(); handleAction(task.id, 'pause'); }} className="p-1.5 rounded-lg hover:bg-amber-500/15 text-surface-200/30 hover:text-amber-400 transition-all" title={t('dashboard.dca.pause', 'Pause')}>
                                                <Pause size={12} />
                                            </button>
                                        )}
                                        {isPaused && (
                                            <button onClick={(e) => { e.stopPropagation(); handleAction(task.id, 'resume'); }} className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-surface-200/30 hover:text-emerald-400 transition-all" title={t('dashboard.dca.resume', 'Resume')}>
                                                <Play size={12} />
                                            </button>
                                        )}
                                        {/* #6 Edit button */}
                                        <button onClick={(e) => { e.stopPropagation(); startEdit(task); setExpandedTask(task.id); }} className="p-1.5 rounded-lg hover:bg-violet-500/15 text-surface-200/30 hover:text-violet-400 transition-all" title={t('dashboard.dca.edit', 'Edit')}>
                                            <Settings size={12} />
                                        </button>
                                        {/* #5 Duplicate button */}
                                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(task); }} className="p-1.5 rounded-lg hover:bg-blue-500/15 text-surface-200/30 hover:text-blue-400 transition-all" title={t('dashboard.dca.duplicate', 'Duplicate')}>
                                            <Copy size={12} />
                                        </button>
                                        {/* #3 Delete with confirmation */}
                                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(isDeleteConfirm ? null : task.id); }}
                                            className={`p-1.5 rounded-lg transition-all ${isDeleteConfirm ? 'bg-red-500/20 text-red-400' : 'hover:bg-red-500/15 text-surface-200/30 hover:text-red-400'}`}
                                            title={t('dashboard.dca.delete', 'Delete')}>
                                            <Trash2 size={12} />
                                        </button>
                                        <ChevronDown size={12} className={`text-surface-200/20 transition-transform mt-1.5 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>

                                {/* #3 Delete confirmation inline */}
                                {isDeleteConfirm && (
                                    <div className="px-4 pb-2 animate-fadeIn">
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/15">
                                            <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />
                                            <span className="text-[10px] text-red-400 flex-1">{t('dashboard.dca.deleteConfirmMsg', 'Delete this schedule? This cannot be undone.')}</span>
                                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-surface-800/60 text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-colors">{t('dashboard.dca.confirmDelete', 'Delete')}</button>
                                        </div>
                                    </div>
                                )}

                                {/* Expanded details */}
                                {isExpanded && !isDeleteConfirm && (
                                    <div className="px-4 pb-3 animate-fadeIn">
                                        <div className="bg-surface-900/40 rounded-xl p-3 space-y-1.5 text-[10px]">
                                            <div className="flex justify-between"><span className="text-surface-200/30">{t('dashboard.dca.chain', 'Chain')}</span><span className="text-surface-100">{CHAINS[task.chainIndex]?.name || task.chainIndex}</span></div>

                                            {/* #4 Last swap result */}
                                            {task.lastResult && (
                                                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg ${task.lastResult === 'success' ? 'bg-emerald-500/10 border border-emerald-500/10' : 'bg-red-500/10 border border-red-500/10'}`}>
                                                    {task.lastResult === 'success'
                                                        ? <Check size={10} className="text-emerald-400" />
                                                        : <X size={10} className="text-red-400" />}
                                                    <span className={task.lastResult === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                                                        {task.lastResult === 'success' ? t('dashboard.dca.lastSwapSuccess', 'Last swap succeeded') : t('dashboard.dca.lastSwapFailed', 'Last swap failed')}
                                                    </span>
                                                    {task.lastResultPrice && <span className="ml-auto text-surface-200/30">{t('dashboard.dca.atPrice', 'at')} {task.lastResultPrice}</span>}
                                                </div>
                                            )}

                                            {(task.executionCount > 0 || task.totalVolume) && (
                                                <>
                                                    <div className="flex justify-between"><span className="text-surface-200/30">{t('dashboard.dca.executions', 'Executions')}</span><span className="text-surface-100 font-semibold">{task.executionCount || 0}</span></div>
                                                    {task.totalVolume && <div className="flex justify-between"><span className="text-surface-200/30">{t('dashboard.dca.totalVolume', 'Total Volume')}</span><span className="text-surface-100">{Number(task.totalVolume).toFixed(4)} {task.fromSymbol}</span></div>}
                                                    {task.lastExecutedAt && <div className="flex justify-between"><span className="text-surface-200/30">{t('dashboard.dca.lastRun', 'Last Run')}</span><span className="text-surface-100">{new Date(task.lastExecutedAt).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>}
                                                </>
                                            )}
                                            {task.stopLossPct && <div className="flex justify-between"><span className="text-surface-200/30">{t('dashboard.tradingUx.stopLoss', 'Stop Loss')}</span><span className="text-red-400 font-semibold">-{task.stopLossPct}%</span></div>}
                                            {task.takeProfitPct && <div className="flex justify-between"><span className="text-surface-200/30">{t('dashboard.tradingUx.takeProfit', 'Take Profit')}</span><span className="text-emerald-400 font-semibold">+{task.takeProfitPct}%</span></div>}

                                            {/* #6 Inline Edit Form */}
                                            {isEditing && (
                                                <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-2 animate-fadeIn">
                                                    <p className="text-[9px] text-violet-400 font-semibold uppercase tracking-wider">{t('dashboard.dca.editSchedule', 'Edit Schedule')}</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] text-surface-200/25 mb-0.5 block">{t('dashboard.tradingUx.amount', 'Amount')}</label>
                                                            <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                                                                className="w-full bg-surface-800/60 rounded-lg px-2.5 py-1.5 text-xs text-surface-100 outline-none border border-white/[0.08] focus:border-violet-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-surface-200/25 mb-0.5 block">{t('dashboard.tradingUx.interval', 'Interval')}</label>
                                                            <div className="grid grid-cols-3 gap-0.5">
                                                                {INTERVALS.map(itv => (
                                                                    <button key={itv.ms} onClick={() => setEditForm(f => ({ ...f, interval: String(itv.ms) }))}
                                                                        className={`py-1 rounded text-[8px] font-semibold transition-all ${String(itv.ms) === editForm.interval
                                                                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                                                            : 'bg-surface-800/40 text-surface-200/30 border border-white/[0.04] hover:border-white/[0.1]'}`}>
                                                                        {itv.short}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] text-surface-200/25 mb-0.5 block flex items-center gap-0.5"><ArrowDownRight size={7} className="text-red-400" /> SL %</label>
                                                            <input type="number" value={editForm.stopLossPct} placeholder="—" onChange={e => setEditForm(f => ({ ...f, stopLossPct: e.target.value }))}
                                                                className="w-full bg-surface-800/60 rounded-lg px-2.5 py-1.5 text-xs text-surface-100 outline-none border border-white/[0.08] focus:border-red-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-surface-200/25 mb-0.5 block flex items-center gap-0.5"><ArrowUpRight size={7} className="text-emerald-400" /> TP %</label>
                                                            <input type="number" value={editForm.takeProfitPct} placeholder="—" onChange={e => setEditForm(f => ({ ...f, takeProfitPct: e.target.value }))}
                                                                className="w-full bg-surface-800/60 rounded-lg px-2.5 py-1.5 text-xs text-surface-100 outline-none border border-white/[0.08] focus:border-emerald-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setEditingTask(null)} className="flex-1 py-1.5 rounded-lg bg-surface-800/60 border border-white/[0.06] text-[10px] text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                                                        <button onClick={() => handleEditSave(task.id)} disabled={editSaving}
                                                            className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[10px] font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-1">
                                                            {editSaving ? <Loader2 size={10} className="animate-spin" /> : <><Check size={10} /> {t('dashboard.dca.saveChanges', 'Save')}</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}


/* (HotTokensCard, SmartMoneySignals, LeaderboardMini, BatchSwapWidget removed — use Discovery, Token Lookup, Leaderboard pages) */


/* ═══════════════════════════════════════════
   Transfer Widget — Single & Batch
   ═══════════════════════════════════════════ */
function TransferWidget({ chainIndex, wallets = [], selectedWallet = null, showToast = null }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('single');
    const knownTokens = KNOWN_TOKENS[chainIndex] || KNOWN_TOKENS['196'];
    const [customTokens, setCustomTokens] = useState({});
    const tokens = useMemo(() => ({ ...knownTokens, ...customTokens }), [knownTokens, customTokens]);
    const tokenList = Object.keys(tokens);
    const [sWalletId, setSWalletId] = useState(selectedWallet?.id ? String(selectedWallet.id) : '');
    const [sTo, setSTo] = useState('');
    const [sToken, setSToken] = useState(tokenList[0] || 'OKB');
    const [sAmount, setSAmount] = useState('');
    const [sExecuting, setSExecuting] = useState(false);
    const [sResult, setSResult] = useState(null);
    const [sShowConfirm, setSShowConfirm] = useState(false);
    const [bRows, setBRows] = useState([{ walletId: '', toAddress: '', amount: '' }]);
    const [bToken, setBToken] = useState(tokenList[0] || 'OKB');
    const [bExecuting, setBExecuting] = useState(false);
    const [bResults, setBResults] = useState([]);
    const [bProgress, setBProgress] = useState({ done: 0, total: 0 });
    const [csvInput, setCsvInput] = useState('');
    const [bShowConfirm, setBShowConfirm] = useState(false);
    const [bSameAmount, setBSameAmount] = useState(true);
    const [bGlobalAmount, setBGlobalAmount] = useState('');
    // Wallet balance + tokens (like swap)
    const [walletTokens, setWalletTokens] = useState([]);
    const [walletBalance, setWalletBalance] = useState(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [openTokenSelect, setOpenTokenSelect] = useState(false);

    useEffect(() => { if (selectedWallet) setSWalletId(String(selectedWallet.id)); }, [selectedWallet]);

    // Fetch wallet balance & tokens when wallet changes
    useEffect(() => {
        const wId = sWalletId;
        if (!wId) { setWalletBalance(null); setWalletTokens([]); return; }
        setBalanceLoading(true);
        api.getWalletBalance(wId)
            .then(res => {
                const balances = res.tokens || res.balances || res.tokenAssets || [];
                setWalletTokens(balances);
                // Sync logos into customTokens
                const logoUpdates = {};
                balances.forEach(b => {
                    const sym = (b.symbol || b.tokenSymbol || '').toUpperCase();
                    const logo = b.logoUrl || b.tokenLogoUrl || '';
                    const addr = (b.tokenContractAddress || b.address || '').toLowerCase();
                    if (sym && logo) {
                        const known = knownTokens[sym];
                        logoUpdates[sym] = {
                            addr: known?.addr || addr,
                            icon: known?.icon || '🪙',
                            decimals: known?.decimals || Number(b.decimals || 18),
                            logoUrl: logo,
                        };
                    }
                });
                if (Object.keys(logoUpdates).length > 0) {
                    setCustomTokens(prev => ({ ...logoUpdates, ...prev, ...logoUpdates }));
                }
                // Find balance for selected token
                const tokenAddr = tokens[sToken]?.addr?.toLowerCase();
                const isNative = tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                const match = balances.find(b => {
                    const bAddr = (b.tokenContractAddress || b.address || '').toLowerCase();
                    if (isNative) return bAddr === '' || bAddr === tokenAddr || (b.symbol || b.tokenSymbol || '').toUpperCase() === sToken.toUpperCase();
                    return bAddr === tokenAddr || (b.symbol || b.tokenSymbol || '').toUpperCase() === sToken.toUpperCase();
                });
                setWalletBalance(match ? Number(match.balance || match.holdingAmount || 0) : 0);
            })
            .catch(() => setWalletBalance(null))
            .finally(() => setBalanceLoading(false));
    }, [sWalletId, sToken, chainIndex]);

    // Address validation
    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);
    const addressError = sTo && !isValidAddress(sTo);

    const handleSingleTransfer = async () => {
        if (!sWalletId || !sTo || !sAmount || !isValidAddress(sTo)) return;
        setSExecuting(true); setSResult(null);
        try {
            const tokenInfo = tokens[sToken];
            const isNative = tokenInfo?.addr?.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            const res = await api.executeTransfer({
                walletId: sWalletId, chainIndex, toAddress: sTo,
                tokenAddress: isNative ? undefined : tokenInfo?.addr, amount: sAmount
            });
            setSResult({ success: true, txHash: res.txHash });
        } catch (err) { setSResult({ success: false, error: err.message }); }
        setSExecuting(false);
        setSShowConfirm(false);
    };

    const addBatchRow = () => setBRows(r => [...r, { walletId: selectedWallet?.id || '', toAddress: '', amount: '' }]);
    const removeBatchRow = (i) => setBRows(r => r.filter((_, idx) => idx !== i));
    const updateBatchRow = (i, field, val) => setBRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

    const parseCsv = () => {
        if (!sWalletId) return;
        const lines = csvInput.trim().split('\n').filter(l => l.trim());
        const rows = lines.map(l => {
            const parts = l.split(/[,;\t]+/).map(s => s.trim());
            return { toAddress: parts[0] || '', amount: bSameAmount ? bGlobalAmount : (parts[1] || '') };
        }).filter(r => r.toAddress);
        if (rows.length) { setBRows(rows); setCsvInput(''); }
    };

    const handleBatchTransfer = async () => {
        if (!sWalletId) return;
        const validRows = bRows.filter(r => r.toAddress && (bSameAmount ? bGlobalAmount : r.amount));
        if (validRows.length === 0) return;
        setBExecuting(true); setBResults([]); setBProgress({ done: 0, total: validRows.length });
        const tokenInfo = tokens[bToken];
        const isNative = tokenInfo?.addr?.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const results = [];
        for (let i = 0; i < validRows.length; i++) {
            const row = validRows[i];
            const amt = bSameAmount ? bGlobalAmount : row.amount;
            try {
                const res = await api.executeTransfer({
                    walletId: sWalletId, chainIndex, toAddress: row.toAddress,
                    tokenAddress: isNative ? undefined : tokenInfo?.addr, amount: amt
                });
                results.push({ txHash: res.txHash, toAddress: row.toAddress, walletName: senderWallet?.name || `W${sWalletId}`, amount: amt });
            } catch (err) {
                results.push({ error: err.message, toAddress: row.toAddress });
            }
            setBProgress({ done: i + 1, total: validRows.length });
            setBResults([...results]);
        }
        setBExecuting(false);
        setBShowConfirm(false);
        // Toast summary
        const ok = results.filter(r => r.txHash).length;
        const fail = results.length - ok;
        if (showToast) showToast(ok > 0 && fail === 0 ? 'success' : ok > 0 ? 'warning' : 'error',
            `Batch Transfer: ${ok}/${results.length} ${t('dashboard.tradingUx.success', 'success')}${fail > 0 ? `, ${fail} ${t('dashboard.tradingUx.failed', 'failed')}` : ''}`);
    };

    const senderWallet = wallets.find(w => String(w.id) === String(sWalletId));

    return (
        <div className="glass-card p-5 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-t-2xl" />

            {/* Header — matches Swap */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                    <Send size={15} className="text-cyan-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100 flex-1">{t('dashboard.tradingUx.transfer', 'Transfer')}</h3>
            </div>

            {/* Single / Batch tab — matches Swap tab */}
            <div className="flex rounded-lg bg-surface-800/60 p-0.5 mb-4">
                {[['single', `📤 ${t('dashboard.trading.single', 'Single')}`], ['batch', `📦 ${t('dashboard.trading.batch', 'Batch')}`]].map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex-1 py-1.5 text-[10px] font-semibold rounded-md transition-all ${tab === key ? 'bg-surface-700 text-surface-100 shadow-sm' : 'text-surface-200/30 hover:text-surface-200/50'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {wallets.length === 0 ? (
                <div className="text-center py-6">
                    <Wallet size={24} className="text-surface-200/15 mx-auto mb-2" />
                    <p className="text-xs text-surface-200/30 mb-2">{t('dashboard.trading.noWallets', 'No wallets connected')}</p>
                    <a href="#wallets" className="text-xs text-brand-400 hover:text-brand-300 font-semibold">{t('dashboard.trading.createWallet', 'Create Wallet')} →</a>
                </div>
            ) : tab === 'single' ? (
                <div className="space-y-3">
                    {/* Wallet selector */}
                    <WalletDropdown wallets={wallets} value={sWalletId} onChange={setSWalletId} accentColor="cyan" chainIndex={chainIndex} />

                    {/* TO address */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">TO</label>
                        <div className={`bg-surface-900/60 rounded-2xl border p-3 transition-colors ${addressError ? 'border-red-500/40' : 'border-white/[0.08]'}`}>
                            <input value={sTo} onChange={e => setSTo(e.target.value)} placeholder="0x..."
                                className="w-full bg-transparent text-sm text-surface-100 font-mono outline-none placeholder:text-surface-200/15" />
                        </div>
                        {addressError && (
                            <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> {t('dashboard.trading.invalidAddress', 'Invalid address format (must be 0x + 40 hex chars)')}</p>
                        )}
                    </div>

                    {/* Token selector — wallet tokens with logos (like swap) */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">{t('dashboard.tradingUx.token', 'TOKEN')}</label>
                        <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                            {/* Token button + amount input */}
                            <div className="flex items-center gap-3">
                                <button onClick={() => setOpenTokenSelect(!openTokenSelect)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] text-surface-100 text-sm font-semibold transition-all min-w-[120px]">
                                    {(() => { const wt = walletTokens.find(t => (t.symbol || '').toUpperCase() === sToken.toUpperCase()); const logo = wt?.logoUrl || tokens[sToken]?.logoUrl || ''; return logo ? <img src={logo} alt="" width={18} height={18} className="rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} /> : <span style={{ fontSize: 14 }}>{tokens[sToken]?.icon || '🪙'}</span>; })()}
                                    <span>{sToken}</span>
                                    <ChevronDown size={12} className="text-surface-200/30 ml-auto" />
                                </button>
                                <input type="number" value={sAmount} onChange={e => setSAmount(e.target.value)} placeholder="0.0"
                                    className="flex-1 bg-transparent text-right text-xl font-bold text-surface-100 outline-none placeholder:text-surface-200/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                            {/* Available balance + MAX */}
                            {sWalletId && walletBalance != null && (
                                <div className="flex items-center justify-end gap-2 mt-2">
                                    <span className="text-[9px] text-surface-200/30">
                                        {t('dashboard.tradingUx.available', 'Available')}: {balanceLoading ? '...' : parseFloat(Number(walletBalance).toFixed(4))} {sToken}
                                    </span>
                                    {walletBalance > 0 && (
                                        <button onClick={() => setSAmount(String(walletBalance))} className="text-[9px] text-brand-400 font-bold hover:text-brand-300 transition-colors">MAX</button>
                                    )}
                                </div>
                            )}
                            {/* Token dropdown */}
                            {openTokenSelect && (
                                <div className="mt-2 bg-surface-800/95 border border-white/[0.1] rounded-xl overflow-hidden max-h-[220px] overflow-y-auto animate-fadeIn">
                                    {/* Wallet tokens first */}
                                    {walletTokens.filter(wt => Number(wt.balance || 0) > 0).map((wt, i) => {
                                        const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                                        const logo = wt.logoUrl || tokens[sym]?.logoUrl || '';
                                        const bal = Number(wt.balance || 0);
                                        return (
                                            <button key={`w-${i}`} onClick={() => {
                                                // Auto-register if unknown
                                                if (!tokens[sym]) {
                                                    setCustomTokens(prev => ({ ...prev, [sym]: { addr: (wt.tokenContractAddress || wt.address || '').toLowerCase(), icon: '🪙', decimals: Number(wt.decimals || 18), logoUrl: logo } }));
                                                }
                                                setSToken(sym); setOpenTokenSelect(false);
                                            }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all ${sym === sToken ? 'bg-brand-500/15 text-brand-400 font-bold' : 'text-surface-200/70 hover:bg-white/[0.05]'}`}>
                                                {logo ? <img src={logo} alt="" width={18} height={18} className="rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} /> : <span style={{ fontSize: 14 }}>{tokens[sym]?.icon || '🪙'}</span>}
                                                <span className="font-medium flex-1 text-left">{sym}</span>
                                                <span className="text-[9px] text-surface-200/30 font-mono">{parseFloat(bal.toFixed(4))}</span>
                                            </button>
                                        );
                                    })}
                                    {/* Known tokens not in wallet */}
                                    {Object.entries(tokens).filter(([sym]) => !walletTokens.some(wt => (wt.symbol || wt.tokenSymbol || '').toUpperCase() === sym.toUpperCase())).map(([sym, info]) => (
                                        <button key={sym} onClick={() => { setSToken(sym); setOpenTokenSelect(false); }}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all ${sym === sToken ? 'bg-brand-500/15 text-brand-400 font-bold' : 'text-surface-200/40 hover:bg-white/[0.05]'}`}>
                                            {info.logoUrl ? <img src={info.logoUrl} alt="" width={18} height={18} className="rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} /> : <span style={{ fontSize: 14 }}>{info.icon || '🪙'}</span>}
                                            <span className="font-medium flex-1 text-left">{sym}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Wallet token chips */}
                        {walletTokens.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {walletTokens.filter(t => Number(t.balance || 0) > 0).map((tk, i) => {
                                    const sym = (tk.symbol || tk.tokenSymbol || '?').toUpperCase();
                                    const logo = tk.logoUrl || tokens[sym]?.logoUrl || '';
                                    const isActive = sToken === sym;
                                    return (
                                        <button key={i} onClick={() => {
                                            if (!tokens[sym]) {
                                                setCustomTokens(prev => ({ ...prev, [sym]: { addr: (tk.tokenContractAddress || tk.address || '').toLowerCase(), icon: '🪙', decimals: Number(tk.decimals || 18), logoUrl: logo } }));
                                            }
                                            setSToken(sym);
                                        }} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium transition-all ${
                                            isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-surface-800/40 text-surface-200/40 border border-white/[0.06] hover:border-white/[0.12]'
                                        }`}>
                                            {logo ? <img src={logo} alt="" width={12} height={12} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{tokens[sym]?.icon || '🪙'}</span>}
                                            <span>{sym}</span>
                                            <span className="text-surface-200/20">{parseFloat(Number(tk.balance || 0).toFixed(4))}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Confirmation step */}
                    {sShowConfirm ? (
                        <div className="space-y-2 animate-fadeIn bg-surface-900/60 rounded-xl p-3 border border-white/[0.06]">
                            <p className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold"><AlertTriangle size={11} /> {t('dashboard.trading.confirmTransfer', 'Confirm transfer details:')}</p>
                            <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.trading.from', 'From')}</span><span className="text-surface-100 font-mono">{senderWallet?.name || `Wallet ${sWalletId}`}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.to', 'To')}</span><span className="text-surface-100 font-mono">{sTo.slice(0, 10)}...{sTo.slice(-6)}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.trading.amount', 'Amount')}</span><span className="text-surface-100 font-bold">{sAmount} {sToken}</span></div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => setSShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-surface-800/60 border border-white/[0.08] text-xs text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                                <button onClick={handleSingleTransfer} disabled={sExecuting}
                                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold hover:shadow-cyan-500/25 transition-all disabled:opacity-40">
                                    {sExecuting ? <Loader2 size={12} className="animate-spin mx-auto" /> : `✅ ${t('dashboard.trading.confirmSend', 'Confirm Send')}`}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setSShowConfirm(true)} disabled={!sWalletId || !sTo || !sAmount || addressError}
                            className="w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <Send size={14} /> {t('dashboard.tradingUx.transfer', 'Transfer')}
                        </button>
                    )}

                    {/* Result */}
                    {sResult && (
                        <div className={`px-3 py-2 rounded-xl text-xs ${sResult.success ? 'bg-emerald-500/10 border border-emerald-500/15 text-emerald-400' : 'bg-red-500/10 border border-red-500/15 text-red-400'}`}>
                            {sResult.success ? (<>✓ <a href={getExplorerTxUrl(chainIndex, sResult.txHash)} target="_blank" rel="noopener" className="text-brand-400 font-mono">{sResult.txHash.slice(0, 20)}... <ExternalLink size={9} className="inline" /></a></>) : `✗ ${sResult.error}`}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Wallet selector for batch (same as single) */}
                    <WalletDropdown wallets={wallets} value={sWalletId} onChange={setSWalletId} accentColor="cyan" chainIndex={chainIndex} />

                    {/* Token for all — with wallet logos */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">{t('dashboard.tradingUx.token', 'TOKEN')}</label>
                        <div className="flex flex-wrap gap-1.5">
                            {(walletTokens.length > 0
                                ? walletTokens.filter(wt => Number(wt.balance || 0) > 0).map(wt => {
                                    const sym = (wt.symbol || wt.tokenSymbol || '?').toUpperCase();
                                    const logo = wt.logoUrl || tokens[sym]?.logoUrl || '';
                                    const isActive = bToken === sym;
                                    return (
                                        <button key={sym} onClick={() => {
                                            if (!tokens[sym]) {
                                                setCustomTokens(prev => ({ ...prev, [sym]: { addr: (wt.tokenContractAddress || wt.address || '').toLowerCase(), icon: '🪙', decimals: Number(wt.decimals || 18), logoUrl: logo } }));
                                            }
                                            setBToken(sym);
                                        }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-surface-800/60 text-surface-200/50 border border-white/[0.08] hover:border-white/[0.15]'
                                        }`}>
                                            {logo ? <img src={logo} alt="" width={14} height={14} className="rounded-full" onError={e => { e.target.style.display = 'none'; }} /> : <span>{tokens[sym]?.icon || '🪙'}</span>}
                                            {sym}
                                        </button>
                                    );
                                })
                                : tokenList.map(sym => (
                                    <button key={sym} onClick={() => setBToken(sym)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            bToken === sym ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-surface-800/60 text-surface-200/50 border border-white/[0.08] hover:border-white/[0.15]'
                                        }`}>
                                        <span>{tokens[sym]?.icon || '🪙'}</span> {sym}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Amount for all (like batch swap) */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider font-semibold">{t('dashboard.tradingUx.amount', 'Amount')}</label>
                            <button onClick={() => setBSameAmount(!bSameAmount)} className="text-[8px] text-brand-400 hover:text-brand-300">
                                {bSameAmount ? t('dashboard.tradingUx.customEach', 'Custom each ↗') : t('dashboard.tradingUx.sameForAll', 'Same for all ↗')}
                            </button>
                        </div>
                        {bSameAmount && (
                            <input type="number" value={bGlobalAmount} onChange={e => {
                                setBGlobalAmount(e.target.value);
                                // Auto-fill all rows
                                setBRows(prev => prev.map(r => ({ ...r, amount: e.target.value })));
                            }}
                                className="w-full bg-surface-900/60 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-surface-100 outline-none placeholder:text-surface-200/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder={`${t('dashboard.tradingUx.amountPerRecipient', 'Amount per recipient')} (${bToken})`} />
                        )}
                    </div>

                    {/* CSV paste */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider font-semibold">{t('dashboard.trading.pasteCsv', 'Paste CSV (address, amount)')}</label>
                            <div className="flex items-center gap-2">
                                <button onClick={downloadCsvTemplate} className="text-[9px] text-surface-200/25 hover:text-brand-400 transition-colors flex items-center gap-0.5" title={t('dashboard.tradingUx.csvTemplate', 'Download CSV Template')}>
                                    <Download size={9} /> {t('dashboard.tradingUx.csvTemplate', 'Template')}
                                </button>
                                <button onClick={parseCsv} disabled={!csvInput.trim() || !sWalletId} className="text-[9px] text-brand-400 hover:text-brand-300 disabled:opacity-30 font-semibold">{t('dashboard.trading.parse', 'Parse')} ↗</button>
                            </div>
                        </div>
                        {!sWalletId && csvInput.trim() && (
                            <p className="text-[9px] text-amber-400 mb-1 flex items-center gap-1"><AlertTriangle size={9} /> {t('dashboard.trading.selectWalletFirst', 'Select a wallet first')}</p>
                        )}
                        <textarea value={csvInput} onChange={e => setCsvInput(e.target.value)} rows={2}
                            className="w-full bg-surface-900/60 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-surface-100 font-mono outline-none resize-none placeholder:text-surface-200/15"
                            placeholder={"0x1234...,1.5\n0x5678...,2.0"} />
                    </div>

                    {/* Rows */}
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {bRows.map((row, i) => (
                            <div key={i} className="flex gap-1.5 items-center">
                                <input value={row.toAddress} onChange={e => updateBatchRow(i, 'toAddress', e.target.value)} placeholder="0x..."
                                    className={`flex-1 min-w-0 bg-surface-900/60 border rounded-lg px-2 py-2 text-[10px] text-surface-100 font-mono outline-none placeholder:text-surface-200/15 ${row.toAddress && !isValidAddress(row.toAddress) ? 'border-red-500/40' : 'border-white/[0.08]'}`} />
                                {!bSameAmount && (
                                    <input type="number" value={row.amount} onChange={e => updateBatchRow(i, 'amount', e.target.value)} placeholder="Amt"
                                        className="w-20 bg-surface-900/60 border border-white/[0.08] rounded-lg px-2 py-2 text-[10px] text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                )}
                                <button onClick={() => removeBatchRow(i)} className="text-surface-200/20 hover:text-red-400 transition-colors p-1"><X size={12} /></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={addBatchRow} className="w-full py-2 rounded-xl border border-dashed border-white/[0.1] text-[10px] text-surface-200/30 hover:text-surface-100 hover:border-white/[0.2] transition-colors flex items-center justify-center gap-1">
                        <Plus size={10} /> {t('dashboard.trading.addRow', 'Add Row')}
                    </button>

                    {/* Execute batch — with confirmation (P3) */}
                    {bShowConfirm ? (
                        <div className="space-y-2 animate-fadeIn bg-surface-900/60 rounded-xl p-3 border border-white/[0.06]">
                            <p className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold"><AlertTriangle size={11} /> {t('dashboard.tradingUx.confirmBatchTransfer', 'Confirm batch transfer:')}</p>
                            <div className="space-y-1 text-[10px]">
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.fromWallet', 'From Wallet')}</span><span className="text-surface-100 font-bold">{senderWallet?.name || `W${sWalletId}`}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.token', 'Token')}</span><span className="text-surface-100 font-bold">{bToken}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.recipients', 'Recipients')}</span><span className="text-surface-100">{bRows.filter(r => r.toAddress && (bSameAmount ? bGlobalAmount : r.amount)).length}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{t('dashboard.tradingUx.totalAmount', 'Total')}</span><span className="text-surface-100 font-bold">{bSameAmount ? (Number(bGlobalAmount || 0) * bRows.filter(r => r.toAddress).length).toFixed(4) : bRows.filter(r => r.amount).reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(4)} {bToken}</span></div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => setBShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-surface-800/60 border border-white/[0.08] text-xs text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                                <button onClick={handleBatchTransfer} disabled={bExecuting}
                                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold hover:shadow-cyan-500/25 transition-all disabled:opacity-40">
                                    {bExecuting ? <Loader2 size={12} className="animate-spin mx-auto" /> : `✅ ${t('dashboard.tradingUx.confirmExecute', 'Confirm Execute')}`}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setBShowConfirm(true)} disabled={bExecuting || !sWalletId || bRows.filter(r => r.toAddress && (bSameAmount ? bGlobalAmount : r.amount)).length === 0}
                            className="w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <Send size={14} /> {t('dashboard.trading.batchTransfer', 'Batch Transfer')} ({bRows.filter(r => r.toAddress && (bSameAmount ? bGlobalAmount : r.amount)).length} txns)
                        </button>
                    )}
                    {/* U3: Progress bar */}
                    {bExecuting && bProgress.total > 0 && (
                        <div className="w-full h-1.5 rounded-full bg-surface-800/60 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300" style={{ width: `${(bProgress.done / bProgress.total) * 100}%` }} />
                        </div>
                    )}

                    {/* Results */}
                    {bResults.length > 0 && (
                        <div className="space-y-1.5 mt-1">
                            <p className="text-[10px] text-surface-200/30 font-semibold">{t('dashboard.trading.results', 'Results')}:</p>
                            {bResults.map((r, i) => (
                                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${r.txHash ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                                    {r.txHash ? <Check size={11} className="text-emerald-400" /> : <AlertTriangle size={11} className="text-red-400" />}
                                    <span className="truncate flex-1 text-surface-100">{r.walletName || r.toAddress?.slice(0, 10)}</span>
                                    {r.txHash ? (
                                        <a href={getExplorerTxUrl(chainIndex, r.txHash)} target="_blank" rel="noopener"
                                            className="text-brand-400 font-mono hover:text-brand-300">{r.txHash.slice(0, 10)}... <ExternalLink size={9} className="inline" /></a>
                                    ) : <span className="text-red-400 truncate max-w-[150px]">{r.error}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Execute Swap Button
   ═══════════════════════════════════════════ */
function ExecuteSwapButton({ chainIndex, fromTokenAddress, toTokenAddress, amount, slippage, wallets: sharedWallets = [], selectedWallet: sharedSelectedWallet = null, showToast, fromSymbol = '', toSymbol = '', expectedOutput = null }) {
    const { t } = useTranslation();
    const [executing, setExecuting] = useState(false);
    const [result, setResult] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const selectedWallet = sharedSelectedWallet;

    const handleExecute = async () => {
        if (!selectedWallet) return;
        setExecuting(true);
        setResult(null);
        try {
            const res = await api.executeSwap({
                walletId: selectedWallet.id, chainIndex, fromTokenAddress, toTokenAddress, amount, slippage
            });
            setResult({ success: true, txHash: res.txHash });
            if (showToast) showToast(t('dashboard.tradingUx.toastSwapOk', 'Swap Successful!') + ` ${amount} ${fromSymbol} → ${toSymbol}`, true, res.txHash, getExplorerTxUrl(chainIndex, res.txHash));
        } catch (err) {
            setResult({ success: false, error: err.message });
            if (showToast) showToast(t('dashboard.tradingUx.toastSwapFail', 'Swap Failed') + `: ${err.message}`, false);
        }
        setExecuting(false);
        setShowConfirm(false);
    };

    if (!sharedWallets.length) return (
        <a href="#/wallets" className="mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold hover:bg-amber-500/15 transition-colors">
            <Wallet size={11} /> {t('dashboard.trading.createWalletPrompt', 'Create a wallet to execute swaps')} →
        </a>
    );

    return (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
            {result && (
                <div className={`mb-2 px-3 py-2 rounded-lg text-xs ${result.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {result.success ? (
                        <span>✅ TX: <a href={getExplorerTxUrl(chainIndex, result.txHash)} target="_blank" rel="noopener" className="underline">{result.txHash?.slice(0, 12)}...</a></span>
                    ) : <span>❌ {result.error}</span>}
                </div>
            )}
            {showConfirm ? (
                <div className="space-y-2 animate-fadeIn">
                    <p className="text-[10px] text-amber-400 flex items-center gap-1"><AlertTriangle size={11} /> {t('dashboard.tradingUx.confirmSwapDetails', 'Confirm swap details')}</p>
                    {/* Swap summary: FROM → TO with full precision */}
                    <div className="bg-surface-800/60 rounded-lg border border-white/[0.06] p-2.5 space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-surface-200/40">{t('dashboard.tradingUx.from', 'From')}</span>
                            <span className="text-surface-100 font-mono font-bold">{amount} {fromSymbol}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-surface-200/40">{t('dashboard.tradingUx.to', 'To')}</span>
                            <span className="text-emerald-400 font-mono font-bold">{expectedOutput != null ? String(expectedOutput) : '—'} {toSymbol}</span>
                        </div>
                        {expectedOutput > 0 && Number(amount) > 0 && (
                            <div className="flex justify-between text-[10px]">
                                <span className="text-surface-200/40">{t('dashboard.tradingUx.rate', 'Rate')}</span>
                                <span className="text-surface-200/50 font-mono">1 {fromSymbol} = {String(expectedOutput / Number(amount))} {toSymbol}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-[10px]">
                            <span className="text-surface-200/40">{t('dashboard.tradingUx.slippage', 'Slippage')}</span>
                            <span className="text-surface-200/50">{slippage}%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-800/60 border border-white/[0.06]">
                        <Wallet size={11} className="text-violet-400" />
                        <span className="text-[10px] text-surface-100 font-mono flex-1">{selectedWallet?.name || selectedWallet?.address?.slice(0, 10) + '...' + selectedWallet?.address?.slice(-6)}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-surface-800/60 border border-white/[0.08] text-xs text-surface-200/50 hover:text-surface-100 transition-colors">{t('dashboard.common.cancel', 'Cancel')}</button>
                        <button onClick={handleExecute} disabled={executing}
                            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold hover:shadow-emerald-500/25 transition-all disabled:opacity-40">
                            {executing ? <Loader2 size={12} className="animate-spin mx-auto" /> : `✅ ${t('dashboard.tradingUx.confirmSwap', 'Confirm Swap')}`}
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setShowConfirm(true)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold shadow-lg hover:shadow-emerald-500/25 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Send size={13} /> {t('dashboard.trading.executeSwap', 'Execute Swap')}
                </button>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Candlestick Chart — Premium v2
   ═══════════════════════════════════════════ */
function CandlestickChart({ chainIndex, tokenAddress, symbol }) {
    const { t } = useTranslation();
    const [candles, setCandles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [bar, setBar] = useState('1H');
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const svgRef = useRef(null);
    const BARS = ['5m', '15m', '1H', '4H', '1D'];
    const limits = { '5m': 24, '15m': 24, '1H': 24, '4H': 24, '1D': 24 };

    useEffect(() => {
        if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') { setCandles([]); return; }
        setLoading(true);
        api.getCandles(chainIndex, tokenAddress, bar, limits[bar] || 48)
            .then(res => {
                const data = (res.data || []).map(c => {
                    const arr = Array.isArray(c) ? c : [c.ts || c.time, c.open, c.high, c.low, c.close, c.volume];
                    return { t: Number(arr[0]), o: Number(arr[1]), h: Number(arr[2]), l: Number(arr[3]), c: Number(arr[4]), v: Number(arr[5] || 0) };
                }).filter(c => c.h > 0).reverse();
                setCandles(data);
            }).catch(() => {}).finally(() => setLoading(false));
    }, [chainIndex, tokenAddress, bar]);

    if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;

    // Chart dimensions
    const PRICE_AXIS_W = 16;
    const chartW = 100;
    const totalW = chartW + PRICE_AXIS_W;
    const candleAreaH = 180;
    const volumeAreaH = 40;
    const chartH = candleAreaH + volumeAreaH;

    const maxH = candles.length ? Math.max(...candles.map(c => c.h)) : 0;
    const minL = candles.length ? Math.min(...candles.map(c => c.l)) : 0;
    const pricePad = (maxH - minL) * 0.05 || 0.0001;
    const priceMax = maxH + pricePad;
    const priceMin = minL - pricePad;
    const priceRange = priceMax - priceMin || 1;
    const maxVol = candles.length ? Math.max(...candles.map(c => c.v)) : 1;
    const barW = candles.length > 0 ? chartW / candles.length : 2;

    const priceToY = (p) => ((priceMax - p) / priceRange) * candleAreaH;
    const volToH = (v) => maxVol > 0 ? (v / maxVol) * (volumeAreaH * 0.8) : 0;

    // Grid lines (5 levels)
    const gridLevels = Array.from({ length: 5 }, (_, i) => priceMin + (priceRange * (i + 0.5)) / 5);

    // Current price info
    const lastCandle = candles[candles.length - 1];
    const firstCandle = candles[0];
    const priceChange = lastCandle && firstCandle ? ((lastCandle.c - firstCandle.o) / firstCandle.o) * 100 : 0;
    const hovered = hoveredIdx !== null ? candles[hoveredIdx] : null;

    // Close-price line path
    const closePath = candles.length >= 2
        ? candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${i * barW + barW / 2},${priceToY(c.c)}`).join(' ')
        : '';
    const gradientPath = closePath
        ? `${closePath} L${(candles.length - 1) * barW + barW / 2},${candleAreaH} L${barW / 2},${candleAreaH} Z`
        : '';

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 via-indigo-500 to-violet-500 rounded-t-2xl" />
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <BarChart3 size={14} className="text-purple-400" />
                <span className="text-xs font-bold text-surface-100">{symbol}</span>
                {lastCandle && (
                    <>
                        <span className="text-sm font-bold text-surface-100 ml-1">{formatPrice(lastCandle.c)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priceChange >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                        </span>
                    </>
                )}
                <div className="flex-1" />
                <div className="flex bg-surface-800/60 rounded-lg p-0.5 border border-white/[0.06]">
                    {BARS.map(b => (
                        <button key={b} onClick={() => setBar(b)}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${b === bar ? 'bg-purple-500/25 text-purple-400 shadow-sm' : 'text-surface-200/30 hover:text-surface-200/60'}`}>
                            {b}
                        </button>
                    ))}
                </div>
            </div>

            {/* OHLCV Tooltip */}
            <div className="px-4 py-1.5 flex gap-4 text-[10px] min-h-[24px] border-b border-white/[0.03]">
                {hovered ? (
                    <>
                        <span className="text-surface-200/30">
                            {new Date(hovered.t).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-surface-200/40">O <b className="text-surface-100">{formatPrice(hovered.o)}</b></span>
                        <span className="text-surface-200/40">H <b className="text-emerald-400">{formatPrice(hovered.h)}</b></span>
                        <span className="text-surface-200/40">L <b className="text-red-400">{formatPrice(hovered.l)}</b></span>
                        <span className="text-surface-200/40">C <b className="text-surface-100">{formatPrice(hovered.c)}</b></span>
                        <span className="text-surface-200/40">V <b className="text-blue-400">{formatLargeNum(hovered.v)}</b></span>
                    </>
                ) : (
                    <span className="text-surface-200/15 text-[9px]">{t('dashboard.trading.hoverChart', 'Hover over chart for OHLCV data')}</span>
                )}
            </div>

            {/* Chart Area */}
            <div className="pb-2">
                {loading ? (
                    <div className="h-[260px] flex items-center justify-center"><Loader2 size={16} className="animate-spin text-surface-200/20" /></div>
                ) : candles.length < 2 ? (
                    <div className="h-[260px] flex items-center justify-center text-[11px] text-surface-200/20">{t('dashboard.trading.noChartDataAvailable', 'No chart data available')}</div>
                ) : (
                    <div className="relative flex">
                        {/* SVG Chart — candles only, no text */}
                        <div className="flex-1 min-w-0">
                            <svg ref={svgRef} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" className="w-full h-[260px] block" onMouseLeave={() => setHoveredIdx(null)}
                                style={{ cursor: hoveredIdx !== null ? 'crosshair' : 'default' }}>
                                <defs>
                                    <linearGradient id="closeGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={priceChange >= 0 ? '#34d399' : '#f87171'} stopOpacity="0.15" />
                                        <stop offset="100%" stopColor={priceChange >= 0 ? '#34d399' : '#f87171'} stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {/* Grid lines */}
                                {gridLevels.map((price, i) => {
                                    const y = priceToY(price);
                                    return <line key={i} x1={0} y1={y} x2={chartW} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={0.3} />;
                                })}

                                {/* Volume separator line */}
                                <line x1={0} y1={candleAreaH} x2={chartW} y2={candleAreaH} stroke="rgba(255,255,255,0.06)" strokeWidth={0.3} />

                                {/* Gradient fill under close line */}
                                {gradientPath && <path d={gradientPath} fill="url(#closeGrad)" />}

                                {/* Close price line */}
                                {closePath && <path d={closePath} fill="none" stroke={priceChange >= 0 ? '#34d399' : '#f87171'} strokeWidth={0.4} strokeOpacity={0.3} />}

                                {/* Volume bars */}
                                {candles.map((c, i) => {
                                    const x = i * barW + barW * 0.025;
                                    const w = barW * 0.95;
                                    const h = volToH(c.v);
                                    const isGreen = c.c >= c.o;
                                    return (
                                        <rect key={`v${i}`} x={x} y={candleAreaH + volumeAreaH - h} width={w} height={h}
                                            fill={isGreen ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'} rx={0.3} />
                                    );
                                })}

                                {/* Candle bodies + wicks */}
                                {candles.map((c, i) => {
                                    const x = i * barW + barW * 0.025;
                                    const w = barW * 0.95;
                                    const isGreen = c.c >= c.o;
                                    const bodyTop = priceToY(Math.max(c.o, c.c));
                                    const bodyBot = priceToY(Math.min(c.o, c.c));
                                    const wickTop = priceToY(c.h);
                                    const wickBot = priceToY(c.l);
                                    const color = isGreen ? '#34d399' : '#f87171';
                                    const bodyH = Math.max(bodyBot - bodyTop, 1.5);
                                    return (
                                        <g key={i}>
                                            <line x1={x + w / 2} y1={wickTop} x2={x + w / 2} y2={wickBot} stroke={color} strokeWidth={1.0} />
                                            <rect x={x} y={bodyTop} width={w} height={bodyH} fill={color} rx={0.4}
                                                stroke={color} strokeWidth={0.2} opacity={isGreen ? 0.95 : 0.9} />
                                        </g>
                                    );
                                })}

                                {/* Hover hit areas */}
                                {candles.map((c, i) => (
                                    <rect key={`hit${i}`} x={i * barW} y={0} width={barW} height={chartH}
                                        fill="transparent" onMouseEnter={() => setHoveredIdx(i)} />
                                ))}

                                {/* Crosshair on hover */}
                                {hovered && hoveredIdx !== null && (
                                    <>
                                        <line x1={hoveredIdx * barW + barW / 2} y1={0} x2={hoveredIdx * barW + barW / 2} y2={chartH}
                                            stroke="rgba(255,255,255,0.15)" strokeWidth={0.3} strokeDasharray="1,1" />
                                        <line x1={0} y1={priceToY(hovered.c)} x2={chartW} y2={priceToY(hovered.c)}
                                            stroke="rgba(255,255,255,0.15)" strokeWidth={0.3} strokeDasharray="1,1" />
                                    </>
                                )}

                                {/* Current price line */}
                                {lastCandle && (
                                    <line x1={0} y1={priceToY(lastCandle.c)} x2={chartW} y2={priceToY(lastCandle.c)}
                                        stroke={priceChange >= 0 ? '#34d399' : '#f87171'} strokeWidth={0.3} strokeDasharray="0.8,0.8" strokeOpacity={0.5} />
                                )}
                            </svg>
                        </div>

                        {/* Price Axis — HTML overlay (won't be stretched) */}
                        <div className="w-[60px] flex-shrink-0 relative h-[260px]">
                            {gridLevels.map((price, i) => {
                                const pct = ((priceMax - price) / priceRange) * (candleAreaH / chartH) * 100;
                                return (
                                    <span key={i} className="absolute right-1 text-[9px] text-surface-200/25 font-mono leading-none"
                                        style={{ top: `${pct}%`, transform: 'translateY(-50%)' }}>
                                        {formatPrice(price)}
                                    </span>
                                );
                            })}
                            {/* Hover price tag */}
                            {hovered && hoveredIdx !== null && (() => {
                                const pct = ((priceMax - hovered.c) / priceRange) * (candleAreaH / chartH) * 100;
                                return (
                                    <span className="absolute right-1 text-[9px] font-mono font-bold leading-none px-1 py-0.5 rounded"
                                        style={{
                                            top: `${pct}%`, transform: 'translateY(-50%)',
                                            background: hovered.c >= hovered.o ? '#34d399' : '#f87171', color: '#fff'
                                        }}>
                                        {formatPrice(hovered.c)}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


/* ═══════════════════════════════════════════
   Portfolio Card
   ═══════════════════════════════════════════ */
function PortfolioCard({ chainIndex, walletAddress }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [pnl, setPnl] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!walletAddress) { setData(null); setPnl([]); setLoading(false); return; }
        setLoading(true);
        Promise.all([
            api.getPortfolio(chainIndex, walletAddress).catch(() => ({ data: null })),
            api.getRecentPnl(chainIndex, walletAddress).catch(() => ({ data: [] }))
        ]).then(([pRes, pnlRes]) => {
            setData(pRes.data);
            setPnl(Array.isArray(pnlRes.data) ? pnlRes.data.slice(0, 7) : []);
        }).finally(() => setLoading(false));
    }, [chainIndex, walletAddress]);

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <PieChart size={12} className="text-blue-400" />
                <h4 className="text-[11px] font-bold text-surface-100">{t('dashboard.trading.portfolioOverview', 'Portfolio Overview')}</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : !data ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">{t('dashboard.trading.connectWalletToView', 'Connect wallet to view')}</div>
            ) : (
                <div className="p-3 space-y-2">
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-surface-100">${Number(data.totalValue || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        {data.pnlPercentage && (
                            <span className={`text-xs font-bold ${Number(data.pnlPercentage) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(data.pnlPercentage) >= 0 ? '+' : ''}{Number(data.pnlPercentage).toFixed(2)}%
                            </span>
                        )}
                    </div>
                    {pnl.length >= 2 && (
                        <div className="flex items-center justify-center">
                            <Sparkline data={pnl.map(p => Number(p.pnl || p.totalPnl || 0))} width={180} height={30}
                                color={Number(pnl[pnl.length - 1]?.pnl || 0) >= Number(pnl[0]?.pnl || 0) ? '#34d399' : '#f87171'} />
                        </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-center">
                        {[{ label: '24h PnL', val: data.pnl24h }, { label: '7d PnL', val: data.pnl7d }, { label: 'Tokens', val: data.tokenCount }].map((item, i) => (
                            <div key={i}>
                                <p className="text-[8px] text-surface-200/30 uppercase">{item.label}</p>
                                <p className="text-[11px] font-semibold text-surface-100">{item.val != null ? (typeof item.val === 'number' || !isNaN(item.val) ? formatLargeNum(item.val) : item.val) : '—'}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}


/* (TopTradersCard, TopLiquidityCard, MemepumpCard removed — use Token Lookup + Meme Scanner pages) */


/* ═══════════════════════════════════════════
   DEX History Card
   ═══════════════════════════════════════════ */
function DexHistoryCard({ chainIndex, walletAddress }) {
    const { t } = useTranslation();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!walletAddress) { setHistory([]); setLoading(false); return; }
        setLoading(true);
        api.getDexHistory(chainIndex, walletAddress)
            .then(res => setHistory((res.data || []).slice(0, 10)))
            .catch(() => {}).finally(() => setLoading(false));
    }, [chainIndex, walletAddress]);

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-indigo-500 to-violet-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <History size={12} className="text-indigo-400" />
                <h4 className="text-[11px] font-bold text-surface-100">DEX History</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : history.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">{t('dashboard.trading.noDexHistory', 'No DEX history')}</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {history.map((tx, i) => {
                        const time = tx.transactionTime ? new Date(Number(tx.transactionTime)).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                        const isBuy = (tx.tradeDirection || tx.type || '').toLowerCase() === 'buy';
                        return (
                            <div key={i} className="px-3 py-2 flex items-center gap-2 hover:bg-white/[0.02] transition-colors">
                                <span className={`text-[9px] font-bold w-8 ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isBuy ? 'BUY' : 'SELL'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-surface-100 font-semibold truncate">
                                        {tx.fromTokenSymbol || '?'} → {tx.toTokenSymbol || '?'}
                                    </p>
                                    <p className="text-[8px] text-surface-200/25">{time}</p>
                                </div>
                                <span className="text-[9px] text-surface-200/40">${Number(tx.amountUsd || tx.totalValueUsd || 0).toLocaleString()}</span>
                                {tx.txHash && (
                                    <a href={getExplorerTxUrl(chainIndex, tx.txHash)} target="_blank" rel="noopener"
                                        className="text-surface-200/15 hover:text-brand-400 transition-colors">
                                        <ExternalLink size={9} />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Tab config
   ═══════════════════════════════════════════ */
const TABS = [
    { key: 'trade',   icon: ArrowLeftRight, label: 'dashboard.trading.tabTrade' },
    { key: 'market',  icon: TrendingUp,     label: 'dashboard.trading.tabMarket' },
    { key: 'history', icon: History,         label: 'dashboard.trading.tabHistory' },
    { key: 'lookup',  icon: Search,         label: 'dashboard.trading.tabLookup' },
    { key: 'meme',    icon: Zap,            label: 'dashboard.trading.tabMeme' },
];


/* ═══════════════════════════════════════════
   Main TradingPage — 3 Tab Layout
   ═══════════════════════════════════════════ */
export default function TradingPage() {
    const { t } = useTranslation();
    const [chainIndex, setChainIndex] = useState('196');
    const [selectedToken, setSelectedToken] = useState({ sym: null, addr: null });
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [activeTab, setActiveTab] = useState(() => {
        try { return localStorage.getItem('trading_tab') || 'trade'; }
        catch { return 'trade'; }
    });
    // #6: Toast notification
    const { toast, show: showToast, dismiss: dismissToast } = useToast();

    const switchTab = (key) => {
        setActiveTab(key);
        try { localStorage.setItem('trading_tab', key); } catch {}
    };

    // Shared wallet fetch — single API call for all components
    useEffect(() => {
        api.getWallets().then(res => {
            const wl = res.wallets || [];
            setWallets(wl);
            const def = wl.find(w => w.isDefault) || wl[0];
            if (def) setSelectedWallet(def);
        }).catch(() => {});
    }, []);

    const handleTokenSelect = (sym, addr) => {
        setSelectedToken({ sym, addr });
    };

    const handleTopTokenClick = (sym, addr) => {
        // #1: 1-click swap — switch to trade tab + set token
        setSelectedToken({ sym, addr });
        setActiveTab('trade');
    };

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* ═══════ Header ═══════ */}
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                    <ArrowLeftRight size={22} className="text-brand-400" />
                    {t('dashboard.sidebar.trading') || 'DEX Trading'}
                </h1>
                <ChainSelector selected={chainIndex} onChange={setChainIndex} />
            </div>

            {/* ═══════ Tab Bar ═══════ */}
            <div className="flex rounded-xl bg-surface-800/60 p-1 border border-white/[0.06]">
                {TABS.map(({ key, icon: Icon, label }) => (
                    <button
                        key={key}
                        onClick={() => switchTab(key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            activeTab === key
                                ? 'bg-brand-500/15 text-brand-400 shadow-sm border border-brand-500/20'
                                : 'text-surface-200/40 hover:text-surface-200/70 border border-transparent'
                        }`}
                    >
                        <Icon size={14} />
                        {t(label, key.charAt(0).toUpperCase() + key.slice(1))}
                    </button>
                ))}
            </div>

            {/* ═══════ Tab 1: Trade ═══════ */}
            {activeTab === 'trade' && (
                <div className="space-y-4">
                    {/* #8: Onboarding card when no wallets */}
                    {wallets.length === 0 && (
                        <div className="glass-card p-6 text-center space-y-4">
                            <div className="text-3xl">🚀</div>
                            <h3 className="text-lg font-bold text-surface-100">{t('dashboard.tradingUx.onboardTitle', 'Get Started')}</h3>
                            <p className="text-xs text-surface-200/40">{t('dashboard.tradingUx.onboardDesc', 'Follow these steps to make your first swap')}</p>
                            <div className="flex justify-center gap-6">
                                {[{ n: 1, k: 'onboardStep1', d: 'Create a wallet', icon: '💼' }, { n: 2, k: 'onboardStep2', d: 'Select a token pair', icon: '🔄' }, { n: 3, k: 'onboardStep3', d: 'Enter amount & swap!', icon: '⚡' }].map(s => (
                                    <div key={s.n} className="flex flex-col items-center gap-1.5">
                                        <div className="w-10 h-10 rounded-full bg-brand-500/15 flex items-center justify-center text-lg">{s.icon}</div>
                                        <span className="text-[10px] text-surface-200/40">{t(`dashboard.tradingUx.${s.k}`, s.d)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Swap + Transfer */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <SwapQuoteWidget chainIndex={chainIndex} onTokenSelect={handleTokenSelect} wallets={wallets} selectedWallet={selectedWallet} onSwapToken={showToast} />
                        <TransferWidget chainIndex={chainIndex} wallets={wallets} selectedWallet={selectedWallet} showToast={showToast} />
                    </div>

                    {/* DCA */}
                    <DcaWidget chainIndex={chainIndex} wallets={wallets} />

                    {/* Chart + Token Info + Gas */}
                    <CandlestickChart chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <TokenInfoCard chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />
                        <GasWidget chainIndex={chainIndex} />
                    </div>
                </div>
            )}

            {/* ═══════ Tab 2: Market ═══════ */}
            {activeTab === 'market' && (
                <div className="space-y-4">
                    <TopTokensList chainIndex={chainIndex} onSelectToken={handleTopTokenClick} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <RecentTrades chainIndex={chainIndex} tokenAddress={selectedToken.addr} />
                        <PortfolioCard chainIndex={chainIndex} walletAddress={selectedWallet?.address} />
                    </div>

                    <MiniPriceChart chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />
                </div>
            )}

            {/* ═══════ Tab 3: History ═══════ */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    <TxHistory chainIndex={chainIndex} />

                    <DexHistoryCard chainIndex={chainIndex} walletAddress={selectedWallet?.address} />

                    <div className="border-t border-white/5 pt-4">
                        <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>}>
                            <TransferHistorySection />
                        </Suspense>
                    </div>
                </div>
            )}

            {/* ═══════ Tab 4: Token Lookup ═══════ */}
            {activeTab === 'lookup' && (
                <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>}>
                    <TokenLookupSection />
                </Suspense>
            )}

            {/* ═══════ Tab 5: Meme Scanner ═══════ */}
            {activeTab === 'meme' && (
                <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>}>
                    <MemeScannerSection />
                </Suspense>
            )}

            {/* #6: Global toast */}
            <ToastNotification toast={toast} onDismiss={dismissToast} />
        </div>
    );
}
