import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    ArrowLeftRight, TrendingUp, Fuel, Search, RefreshCw, Loader2,
    ArrowDown, Clock, ExternalLink, ArrowUpRight, ArrowDownRight, Zap,
    Star, StarOff, Settings, Bell, ChevronDown, Wallet, BarChart3,
    Activity, Info, Layers, X
} from 'lucide-react';

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
    const ref = useRef(null);
    useEffect(() => {
        const target = Number(value || 0);
        const start = display;
        const startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(start + (target - start) * eased);
            if (progress < 1) ref.current = requestAnimationFrame(animate);
        };
        ref.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(ref.current);
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
            <span className="text-xs text-surface-200/30">Loading gas...</span>
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
                <h3 className="text-xs font-bold text-surface-100">Gas Price</h3>
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
                <p className="text-[10px] text-surface-200/25 text-center py-2">No chart data</p>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Recent Trades (#7)
   ═══════════════════════════════════════════ */
function RecentTrades({ chainIndex, tokenAddress }) {
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
                <h4 className="text-[10px] font-bold text-surface-100">Recent Trades</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : trades.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No trades</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {trades.map((t, i) => {
                        const isBuy = t.type === 'buy';
                        const time = new Date(Number(t.time || Date.now())).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        return (
                            <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-[10px]">
                                <span className={`w-8 font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
                                <span className="text-surface-200/40 flex-1">{time}</span>
                                <span className="text-surface-100">{formatPrice(t.price)}</span>
                                <span className="text-surface-200/30 w-16 text-right">${Number(t.volume || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Swap Quote Widget — Premium v3 (All features)
   ═══════════════════════════════════════════ */
function SwapQuoteWidget({ chainIndex, onTokenSelect }) {
    const [searchParams] = useState(() => new URLSearchParams(window.location.search));
    const tokens = KNOWN_TOKENS[chainIndex] || KNOWN_TOKENS['196'];

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
    const [walletBalance, setWalletBalance] = useState(null);

    // Notify parent of selected TO token
    useEffect(() => { onTokenSelect?.(toSymbol, tokens[toSymbol]?.addr); }, [toSymbol]);

    // Wallet balance (#4)
    useEffect(() => {
        api.getWallets().then(res => {
            const wallets = res.wallets || [];
            const defaultW = wallets.find(w => w.isDefault) || wallets[0];
            if (defaultW) {
                api.getWalletBalance(defaultW.id).then(bal => setWalletBalance(bal)).catch(() => {});
            }
        }).catch(() => {});
    }, []);

    // Token search (#1)
    useEffect(() => {
        if (searchQuery.length < 2) { setSearchResults([]); return; }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.searchToken(searchQuery, chainIndex);
                setSearchResults((res.data || []).slice(0, 8));
            } catch { setSearchResults([]); }
            setSearching(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, chainIndex]);

    const getQuote = async () => {
        if (!amount || Number(amount) <= 0) return;
        const from = tokens[fromSymbol];
        const to = tokens[toSymbol];
        if (!from || !to) { setError('Unknown token'); return; }
        if (fromSymbol === toSymbol) { setError('Same token'); return; }
        setLoading(true);
        setError(null);
        setQuote(null);
        try {
            const data = await api.getSwapQuote({ chainIndex, fromTokenAddress: from.addr, toTokenAddress: to.addr, amount, slippage });
            const q = Array.isArray(data.data) ? data.data[0] : data.data;
            setQuote(q);
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 1000);
        } catch (err) { setError(err.message || 'Quote failed'); }
        setLoading(false);
    };

    const adjustAmount = (delta) => {
        const n = Math.max(0, Number(amount || 0) + delta);
        setAmount(String(n));
    };

    const routerResult = quote?.routerResult;
    const toAmount = routerResult ? (Number(routerResult.toTokenAmount || 0) / Math.pow(10, Number(routerResult.toToken?.decimal || 18))) : null;
    const priceImpact = routerResult?.priceImpactPercentage;
    const gasEstimate = routerResult?.estimateGasFee || quote?.estimateGasFee;
    const dexRoutes = routerResult?.quoteCompareList || quote?.quoteCompareList || [];

    // Token list for dropdown - favorites first, then known, then search results
    const getTokenList = (exclude) => {
        const list = [];
        const favTokens = favs.filter(f => tokens[f] && f !== exclude);
        favTokens.forEach(sym => list.push({ sym, ...tokens[sym], isFav: true }));
        Object.entries(tokens).filter(([k]) => k !== exclude && !favs.includes(k)).forEach(([sym, info]) => list.push({ sym, ...info, isFav: false }));
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
                {/* Known tokens */}
                {list.map(({ sym, icon, isFav: f }) => (
                    <button
                        key={sym}
                        onClick={() => { onChange(sym); setOpen(false); setSearchQuery(''); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all ${
                            sym === value ? 'bg-brand-500/15 text-brand-400 font-bold' : 'text-surface-200/70 hover:bg-white/[0.05] hover:text-surface-100'
                        }`}
                    >
                        {f && <Star size={10} className="text-amber-400 fill-amber-400" />}
                        <span className="text-base">{icon}</span>
                        <span className="font-medium flex-1 text-left">{sym}</span>
                        <button onClick={e => { e.stopPropagation(); toggleFav(sym); }} className="p-0.5 hover:text-amber-400 transition-colors">
                            {isFav(sym) ? <Star size={10} className="text-amber-400 fill-amber-400" /> : <StarOff size={10} className="text-surface-200/20" />}
                        </button>
                    </button>
                ))}
                {/* Search results */}
                {searchResults.length > 0 && (
                    <>
                        <div className="px-3 py-1.5 text-[9px] text-surface-200/20 uppercase border-t border-white/5">Search Results</div>
                        {searchResults.map((t, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    const sym = t.tokenSymbol || '?';
                                    if (!tokens[sym]) {
                                        tokens[sym] = { addr: t.tokenContractAddress, icon: '🪙', decimals: Number(t.decimals || 18) };
                                    }
                                    onChange(sym);
                                    setOpen(false);
                                    setSearchQuery('');
                                    setSearchResults([]);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-200/60 hover:bg-white/[0.05] hover:text-surface-100 transition-all"
                            >
                                <span>🪙</span>
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
                    <span className="text-lg">{tokens[value]?.icon || '?'}</span>
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

            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center">
                    <ArrowLeftRight size={15} className="text-brand-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100 flex-1">Quick Swap Quote</h3>
                {/* Slippage settings (#5) */}
                <button onClick={() => setShowSlippage(!showSlippage)} className={`p-1.5 rounded-lg transition-all ${showSlippage ? 'bg-brand-500/15 text-brand-400' : 'text-surface-200/30 hover:text-surface-200/60'}`}>
                    <Settings size={14} />
                </button>
                {/* Price alert (#8) */}
                <button className="p-1.5 rounded-lg text-surface-200/30 hover:text-amber-400 transition-all" title="Set Price Alert">
                    <Bell size={14} />
                </button>
            </div>

            {/* Slippage panel (#5) */}
            {showSlippage && (
                <div className="mb-4 p-3 rounded-xl bg-surface-900/60 border border-white/[0.06] animate-fadeIn">
                    <p className="text-[9px] text-surface-200/30 uppercase tracking-widest mb-2 font-semibold">Slippage Tolerance</p>
                    <div className="flex gap-1.5">
                        {['0.5', '1', '3'].map(v => (
                            <button key={v} onClick={() => setSlippage(v)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${slippage === v ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-surface-800/60 text-surface-200/40 border border-white/[0.06] hover:text-surface-200/70'}`}>
                                {v}%
                            </button>
                        ))}
                        <input type="number" value={!['0.5', '1', '3'].includes(slippage) ? slippage : ''} onChange={e => setSlippage(e.target.value || '1')}
                            className="flex-1 bg-surface-800/60 border border-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-surface-100 text-center outline-none placeholder:text-surface-200/20 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Custom %" />
                    </div>
                </div>
            )}

            {/* Wallet balance (#4) */}
            {walletBalance && (
                <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-900/40 border border-white/[0.04]">
                    <Wallet size={11} className="text-surface-200/30" />
                    <span className="text-[10px] text-surface-200/40 flex-1">Wallet</span>
                    <span className="text-[10px] font-semibold text-surface-100">
                        {walletBalance.address ? `${walletBalance.address.slice(0, 6)}...${walletBalance.address.slice(-4)}` : 'Connected'}
                    </span>
                </div>
            )}

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
                    {/* Quick presets (#3) */}
                    <div className="flex gap-1 mt-1.5">
                        {[{ label: '25%', val: 0.25 }, { label: '50%', val: 0.5 }, { label: '75%', val: 0.75 }, { label: 'MAX', val: 1 }].map(p => (
                            <button key={p.label} onClick={() => setAmount(String(Number(amount || 1) * p.val || p.val))}
                                className="flex-1 py-1 rounded-lg text-[9px] font-bold text-surface-200/30 bg-surface-800/40 border border-white/[0.04] hover:text-brand-400 hover:border-brand-500/20 transition-all">
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-center">
                    <button onClick={() => { setFromSymbol(toSymbol); setToSymbol(fromSymbol); }}
                        className="w-9 h-9 rounded-full bg-surface-800/80 border border-white/[0.08] flex items-center justify-center hover:bg-brand-500/15 hover:border-brand-500/30 hover:rotate-180 transition-all duration-300 shadow-lg">
                        <ArrowDown size={14} className="text-surface-200/40" />
                    </button>
                </div>

                {/* TO */}
                <TokenDropdown value={toSymbol} onChange={setToSymbol} open={openTo} setOpen={(v) => { setOpenTo(v); setOpenFrom(false); }} exclude={fromSymbol} label="To" />

                <button onClick={getQuote} disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.02] active:scale-95 transition-all duration-200 disabled:opacity-50">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    Get Quote
                </button>

                {error && <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg py-2 border border-red-500/20">{error}</p>}

                {/* Quote result with animation (#12) */}
                {toAmount !== null && (
                    <div className="bg-surface-900/60 rounded-xl p-4 border border-white/[0.06] space-y-2.5 animate-fadeIn">
                        <div className="flex justify-between text-xs">
                            <span className="text-surface-200/40 font-medium">You Get</span>
                            <span className="text-surface-100 font-bold text-sm">
                                <CountUp value={toAmount} decimals={6} /> {routerResult?.toTokenSymbol || toSymbol}
                            </span>
                        </div>
                        {priceImpact && (
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">Price Impact</span>
                                <span className={`font-semibold ${Number(priceImpact) > 5 ? 'text-red-400' : 'text-emerald-400'}`}>{Number(priceImpact).toFixed(2)}%</span>
                            </div>
                        )}
                        {/* Gas estimate (#10) */}
                        {gasEstimate && (
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">Est. Gas</span>
                                <span className="text-surface-200/50">{Number(gasEstimate) > 1e6 ? `${(Number(gasEstimate) * 1e-9).toFixed(4)} Gwei` : gasEstimate}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-xs">
                            <span className="text-surface-200/40 font-medium">Slippage</span>
                            <span className="text-surface-200/50">{slippage}%</span>
                        </div>

                        {/* Route comparison (#6) */}
                        {dexRoutes.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                <p className="text-[9px] text-surface-200/25 uppercase tracking-widest mb-1.5 font-semibold">DEX Routes</p>
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
                    </div>
                )}
            </div>
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
function TxHistory() {
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
                <h3 className="text-xs font-bold text-surface-100">Recent Transactions</h3>
            </div>
            {loading ? (
                <div className="p-8 flex justify-center"><Loader2 size={16} className="animate-spin text-surface-200/30" /></div>
            ) : txs.length === 0 ? (
                <div className="p-8 text-center text-xs text-surface-200/20">No transactions yet</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {txs.map((tx, i) => {
                        const isSwap = tx.type?.includes('swap');
                        const date = tx.createdAt ? new Date(tx.createdAt * 1000).toLocaleString() : '—';
                        return (
                            <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isSwap ? 'bg-brand-500/15' : 'bg-emerald-500/15'}`}>
                                    {isSwap ? <ArrowLeftRight size={12} className="text-brand-400" /> : <ArrowUpRight size={12} className="text-emerald-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-surface-100 capitalize">{tx.type?.replace(/_/g, ' ') || 'Transaction'}</p>
                                    <p className="text-[10px] text-surface-200/20">{date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-surface-100">{tx.fromAmount || '—'} {tx.fromSymbol || ''}</p>
                                    {tx.toAmount && <p className="text-[10px] text-surface-200/30">→ {tx.toAmount} {tx.toSymbol || ''}</p>}
                                </div>
                                {tx.txHash && (
                                    <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${tx.txHash}`} target="_blank" rel="noopener"
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
   Main TradingPage
   ═══════════════════════════════════════════ */
export default function TradingPage() {
    const { t } = useTranslation();
    const [chainIndex, setChainIndex] = useState('196');
    const [selectedToken, setSelectedToken] = useState({ sym: null, addr: null });

    const handleTokenSelect = (sym, addr) => {
        setSelectedToken({ sym, addr });
    };

    const handleTopTokenClick = (sym, addr) => {
        // Dynamically add if not in known tokens
        const tokens = KNOWN_TOKENS[chainIndex] || {};
        if (sym && addr && !tokens[sym]) {
            tokens[sym] = { addr, icon: '🪙', decimals: 18 };
        }
        setSelectedToken({ sym, addr });
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                    <ArrowLeftRight size={22} className="text-brand-400" />
                    {t('dashboard.sidebar.trading') || 'Trading'}
                </h1>
                <ChainSelector selected={chainIndex} onChange={setChainIndex} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column: Swap + Info Cards */}
                <div className="space-y-3">
                    <SwapQuoteWidget chainIndex={chainIndex} onTokenSelect={handleTokenSelect} />
                    <TokenInfoCard chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />
                    <MiniPriceChart chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />
                    <GasWidget chainIndex={chainIndex} />
                </div>

                {/* Right Column: Top Tokens + Trades + TX */}
                <div className="lg:col-span-2 space-y-3">
                    <TopTokensList chainIndex={chainIndex} onSelectToken={handleTopTokenClick} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <RecentTrades chainIndex={chainIndex} tokenAddress={selectedToken.addr} />
                        <TxHistory />
                    </div>
                </div>
            </div>
        </div>
    );
}
