import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    ArrowLeftRight, TrendingUp, Fuel, Search, RefreshCw, Loader2,
    ArrowDown, Clock, ExternalLink, ArrowUpRight, ArrowDownRight, Zap,
    Star, StarOff, Settings, Bell, ChevronDown, Wallet, BarChart3,
    Activity, Info, Layers, X, Play, Pause, Trash2, Plus, Repeat,
    Flame, Trophy, Droplets, Radio, Copy, Check, Shield, Rocket,
    History, DollarSign, Users, PieChart, AlertTriangle, Eye, Send
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
   Wallet Dropdown — Premium custom select with balances
   ═══════════════════════════════════════════ */
function WalletDropdown({ wallets = [], value, onChange, accentColor = 'violet', chainIndex = '196' }) {
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
                <p className="text-[9px] text-surface-200/30 uppercase tracking-widest font-semibold">Select Wallet</p>
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
                    <p className="text-xs text-surface-200/30">No wallets</p>
                    <a href="#/wallets" className="text-xs text-brand-400 hover:text-brand-300 font-semibold">Create Wallet →</a>
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
                        {showTokens ? 'Hide' : 'Show'} balances ({selectedBal.tokens.filter(t => Number(t.balance) > 0).length} tokens)
                    </button>
                    {showTokens && (
                        <div className="mt-1 rounded-lg bg-surface-900/40 border border-white/[0.04] max-h-[120px] overflow-y-auto">
                            {selectedBal.tokens.filter(t => Number(t.balance) > 0).map((t, i) => (
                                <div key={i} className="flex items-center justify-between px-2.5 py-1.5 text-[10px] border-b border-white/[0.02] last:border-0">
                                    <span className="text-surface-200/50 font-medium">{t.symbol}</span>
                                    <div className="text-right">
                                        <span className="text-surface-100 font-mono">{formatQty(t.balance)}</span>
                                        <span className="text-surface-200/30 ml-1.5">{formatUsd(Number(t.balance) * Number(t.price))}</span>
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
function SwapQuoteWidget({ chainIndex, onTokenSelect, wallets = [], selectedWallet = null }) {
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
    const [swapMode, setSwapMode] = useState('single'); // single | batch
    const [swapWalletId, setSwapWalletId] = useState(selectedWallet?.id ? String(selectedWallet.id) : '');
    useEffect(() => { if (selectedWallet) setSwapWalletId(String(selectedWallet.id)); }, [selectedWallet]);
    const [batchSelectedWallets, setBatchSelectedWallets] = useState({});
    const [batchAmount, setBatchAmount] = useState('1');
    const [batchSameAmount, setBatchSameAmount] = useState(true);
    const [batchAmounts, setBatchAmounts] = useState({});
    const [batchExecuting, setBatchExecuting] = useState(false);
    const [batchResults, setBatchResults] = useState([]);
    const batchSelectedCount = wallets.filter(w => batchSelectedWallets[w.id]).length;
    const batchSelectAll = () => {
        const allSel = wallets.every(w => batchSelectedWallets[w.id]);
        const next = {}; wallets.forEach(w => { next[w.id] = !allSel; }); setBatchSelectedWallets(next);
    };
    const handleBatchSwap = async () => {
        if (batchSelectedCount === 0) return;
        setBatchExecuting(true); setBatchResults([]);
        try {
            const swaps = wallets.filter(w => batchSelectedWallets[w.id]).map(w => ({ walletId: w.id, amount: batchSameAmount ? batchAmount : (batchAmounts[w.id] || batchAmount) }));
            const res = await api.batchSwap({ swaps, chainIndex, fromTokenAddress: tokens[fromSymbol].addr, toTokenAddress: tokens[toSymbol].addr, slippage });
            setBatchResults(res.results || []);
        } catch (err) { setBatchResults([{ error: err.message }]); }
        setBatchExecuting(false);
    };

    // Notify parent of selected TO token
    useEffect(() => { onTokenSelect?.(toSymbol, tokens[toSymbol]?.addr); }, [toSymbol]);

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

            <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center">
                    <ArrowLeftRight size={15} className="text-brand-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100 flex-1">Swap</h3>
                <button onClick={() => setShowSlippage(!showSlippage)} className={`p-1.5 rounded-lg transition-all ${showSlippage ? 'bg-brand-500/15 text-brand-400' : 'text-surface-200/30 hover:text-surface-200/60'}`}>
                    <Settings size={14} />
                </button>
                <button onClick={() => {
                    const price = prompt('Set alert price (USD):');
                    if (price && !isNaN(price)) alert(`✅ Price alert set at $${price} for ${toSymbol}`);
                }} className="p-1.5 rounded-lg text-surface-200/30 hover:text-amber-400 transition-all" title="Set Price Alert">
                    <Bell size={14} />
                </button>
            </div>

            {/* Single / Batch tab */}
            <div className="flex rounded-lg bg-surface-800/60 p-0.5 mb-4">
                {[['single', '🔄 Single'], ['batch', '🔶 Batch (' + wallets.length + ')']].map(([key, label]) => (
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

                        {/* Execute Swap Button */}
                        <ExecuteSwapButton
                            chainIndex={chainIndex}
                            fromTokenAddress={tokens[fromSymbol]?.addr}
                            toTokenAddress={tokens[toSymbol]?.addr}
                            amount={amount}
                            slippage={slippage}
                            wallets={wallets}
                            selectedWallet={wallets.find(w => String(w.id) === String(swapWalletId)) || null}
                        />
                    </div>
                )}
            </div>
            </>) : (
            /* ═══ Batch Swap Mode ═══ */
            <div className="space-y-3">
                {/* Token pair — reuses same fromSymbol/toSymbol */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] text-surface-200/25 mb-0.5 block">FROM</label>
                        <select value={fromSymbol} onChange={e => setFromSymbol(e.target.value)}
                            className="styled-select-sm">
                            {Object.keys(tokens).map(s => <option key={s} value={s}>{tokens[s].icon} {s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] text-surface-200/25 mb-0.5 block">TO</label>
                        <select value={toSymbol} onChange={e => setToSymbol(e.target.value)}
                            className="styled-select-sm">
                            {Object.keys(tokens).filter(s => s !== fromSymbol).map(s => <option key={s} value={s}>{tokens[s].icon} {s}</option>)}
                        </select>
                    </div>
                </div>
                {/* Amount + Slippage */}
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <label className="text-[9px] text-surface-200/25">Amount per wallet</label>
                            <button onClick={() => setBatchSameAmount(!batchSameAmount)} className="text-[8px] text-brand-400 hover:text-brand-300">
                                {batchSameAmount ? 'Custom each ↗' : 'Same for all ↗'}
                            </button>
                        </div>
                        {batchSameAmount && (
                            <input type="number" value={batchAmount} onChange={e => setBatchAmount(e.target.value)}
                                className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Amount" />
                        )}
                    </div>
                    <div className="w-16">
                        <label className="text-[9px] text-surface-200/25 mb-0.5 block">Slip %</label>
                        <input type="number" value={slippage} onChange={e => setSlippage(e.target.value)}
                            className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                </div>
                {/* Wallet checkboxes */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-surface-200/25">Select wallets ({batchSelectedCount}/{wallets.length})</span>
                        <button onClick={batchSelectAll} className="text-[8px] text-brand-400 hover:text-brand-300">
                            {wallets.every(w => batchSelectedWallets[w.id]) ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                    <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
                        {wallets.map(w => (
                            <label key={w.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${batchSelectedWallets[w.id] ? 'bg-orange-500/10 border-orange-500/20 text-surface-100' : 'bg-surface-800/40 border-white/[0.04] text-surface-200/40 hover:border-white/[0.08]'}`}>
                                <input type="checkbox" checked={!!batchSelectedWallets[w.id]} onChange={() => setBatchSelectedWallets(p => ({ ...p, [w.id]: !p[w.id] }))} className="w-3 h-3 rounded accent-orange-500" />
                                <Wallet size={10} className={batchSelectedWallets[w.id] ? 'text-orange-400' : 'text-surface-200/20'} />
                                <span className="flex-1 truncate">{w.name || `Wallet ${w.id}`}</span>
                                <span className="text-[9px] font-mono text-surface-200/20">{w.address?.slice(0, 6)}...{w.address?.slice(-4)}</span>
                                {!batchSameAmount && batchSelectedWallets[w.id] && (
                                    <input type="number" value={batchAmounts[w.id] || ''} onChange={e => setBatchAmounts(p => ({ ...p, [w.id]: e.target.value }))}
                                        placeholder={batchAmount} onClick={e => e.stopPropagation()}
                                        className="w-16 bg-surface-800/80 border border-white/[0.08] rounded px-1 py-0.5 text-[10px] text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                )}
                            </label>
                        ))}
                    </div>
                </div>
                {/* Execute */}
                <button onClick={handleBatchSwap} disabled={batchExecuting || batchSelectedCount === 0}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-lg hover:shadow-orange-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5">
                    {batchExecuting ? <><Loader2 size={12} className="animate-spin" /> Swapping {batchSelectedCount} wallets...</> : <><Zap size={12} /> Batch Swap ({batchSelectedCount} wallets)</>}
                </button>
                {/* Results */}
                {batchResults.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-[9px] text-surface-200/30 font-semibold">Results:</p>
                        {batchResults.map((r, i) => (
                            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] ${r.txHash ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                                {r.txHash ? <Check size={10} className="text-emerald-400" /> : <AlertTriangle size={10} className="text-red-400" />}
                                <span className="flex-1 truncate text-surface-100">{r.walletName || `Wallet ${r.walletId}`}</span>
                                {r.txHash ? (
                                    <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${r.txHash}`} target="_blank" rel="noopener"
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
   DCA Widget — Auto Buy/Sell on Schedule
   ═══════════════════════════════════════════ */
function DcaWidget({ chainIndex, wallets: sharedWallets = [] }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [wallets, setWallets] = useState(sharedWallets);
    const [openWalletDd, setOpenWalletDd] = useState(false);
    const [openIntervalDd, setOpenIntervalDd] = useState(false);
    const walletTriggerRef = useRef(null);
    const walletDropRef = useRef(null);
    const intervalTriggerRef = useRef(null);
    const intervalDropRef = useRef(null);
    const [walletDdPos, setWalletDdPos] = useState({ top: 0, left: 0, width: 0 });
    const [intervalDdPos, setIntervalDdPos] = useState({ top: 0, left: 0, width: 0 });
    const [form, setForm] = useState({
        walletId: '', fromTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toTokenAddress: '',
        fromSymbol: 'OKB', toSymbol: '', amount: '', interval: '86400000',
        stopLossPct: '', takeProfitPct: ''
    });
    const INTERVALS = [
        { label: '5 min', ms: 300000 }, { label: '15 min', ms: 900000 },
        { label: '1 hour', ms: 3600000 }, { label: '4 hours', ms: 14400000 },
        { label: '24 hours', ms: 86400000 }, { label: '7 days', ms: 604800000 }
    ];
    const INTERVALS_SHORT = { 300000: '5m', 900000: '15m', 3600000: '1h', 14400000: '4h', 86400000: '24h', 604800000: '7d' };

    // Position calculation for dropdown portals
    useEffect(() => {
        if (openWalletDd && walletTriggerRef.current) {
            const r = walletTriggerRef.current.getBoundingClientRect();
            setWalletDdPos({ top: r.bottom + 4, left: r.left, width: r.width });
        }
    }, [openWalletDd]);
    useEffect(() => {
        if (openIntervalDd && intervalTriggerRef.current) {
            const r = intervalTriggerRef.current.getBoundingClientRect();
            setIntervalDdPos({ top: r.bottom + 4, left: r.left, width: r.width });
        }
    }, [openIntervalDd]);

    // Close on outside click
    useEffect(() => {
        if (!openWalletDd && !openIntervalDd) return;
        const handler = (e) => {
            if (openWalletDd && !walletTriggerRef.current?.contains(e.target) && !walletDropRef.current?.contains(e.target)) setOpenWalletDd(false);
            if (openIntervalDd && !intervalTriggerRef.current?.contains(e.target) && !intervalDropRef.current?.contains(e.target)) setOpenIntervalDd(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openWalletDd, openIntervalDd]);

    const loadTasks = async () => {
        try {
            const res = await api.getDcaTasks();
            setTasks(res.tasks || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { loadTasks(); }, []);
    useEffect(() => { setWallets(sharedWallets); }, [sharedWallets]);

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
            setForm(f => ({ ...f, amount: '', toTokenAddress: '', toSymbol: '' }));
            loadTasks();
        } catch (err) { alert(err.message); }
        setCreating(false);
    };

    const handleAction = async (id, action) => {
        try {
            if (action === 'delete') { await api.deleteDca(id); }
            else { await api.updateDca(id, { action }); }
            loadTasks();
        } catch { /* ignore */ }
    };

    const fmtInterval = (ms) => {
        if (INTERVALS_SHORT[ms]) return INTERVALS_SHORT[ms];
        const h = ms / 3600000;
        return h >= 24 ? `${(h / 24).toFixed(0)}d` : `${h.toFixed(0)}h`;
    };

    // Selected wallet display text
    const selectedWallet = wallets.find(w => String(w.id) === String(form.walletId));
    const walletDisplayText = selectedWallet
        ? `#${selectedWallet.id} ${selectedWallet.name || selectedWallet.address?.slice(0, 6) + '...' + selectedWallet.address?.slice(-4)}`
        : 'Select wallet...';

    // Selected interval display
    const selectedInterval = INTERVALS.find(i => String(i.ms) === String(form.interval));
    const intervalDisplayText = selectedInterval ? selectedInterval.label : '24 hours';

    // Wallet dropdown portal
    const walletDropdown = openWalletDd ? createPortal(
        <div ref={walletDropRef}
            className="fixed z-[9999] bg-surface-800/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fadeIn max-h-[240px] overflow-y-auto"
            style={{ top: walletDdPos.top, left: walletDdPos.left, width: Math.max(walletDdPos.width, 220) }}>
            {wallets.length === 0 ? (
                <div className="px-3 py-4 text-[10px] text-surface-200/30 text-center">No wallets found</div>
            ) : wallets.map(w => {
                const isSelected = String(w.id) === String(form.walletId);
                const addrShort = w.address ? `${w.address.slice(0, 6)}...${w.address.slice(-4)}` : '';
                return (
                    <button key={w.id}
                        onClick={() => { setForm(f => ({ ...f, walletId: String(w.id) })); setOpenWalletDd(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-all ${isSelected
                            ? 'bg-violet-500/15 text-violet-400 font-bold'
                            : 'text-surface-200/60 hover:bg-white/[0.05] hover:text-surface-100'
                        }`}>
                        <Wallet size={12} className={isSelected ? 'text-violet-400' : 'text-surface-200/25'} />
                        <div className="flex-1 text-left min-w-0">
                            <span className="font-semibold">#{w.id}</span>
                            {w.name && <span className="ml-1 text-surface-200/40">{w.name}</span>}
                            <p className="text-[9px] text-surface-200/20 font-mono truncate">{addrShort}</p>
                        </div>
                        {isSelected && <span className="text-violet-400 text-sm">✓</span>}
                    </button>
                );
            })}
        </div>,
        document.body
    ) : null;

    // Interval dropdown portal
    const intervalDropdown = openIntervalDd ? createPortal(
        <div ref={intervalDropRef}
            className="fixed z-[9999] bg-surface-800/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fadeIn"
            style={{ top: intervalDdPos.top, left: intervalDdPos.left, width: Math.max(intervalDdPos.width, 160) }}>
            {INTERVALS.map(i => {
                const isSelected = String(i.ms) === String(form.interval);
                return (
                    <button key={i.ms}
                        onClick={() => { setForm(f => ({ ...f, interval: String(i.ms) })); setOpenIntervalDd(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-all ${isSelected
                            ? 'bg-violet-500/15 text-violet-400 font-bold'
                            : 'text-surface-200/60 hover:bg-white/[0.05] hover:text-surface-100'
                        }`}>
                        <Clock size={11} className={isSelected ? 'text-violet-400' : 'text-surface-200/25'} />
                        <span className="flex-1 text-left font-medium">{i.label}</span>
                        {isSelected && <span className="text-violet-400 text-sm">✓</span>}
                    </button>
                );
            })}
        </div>,
        document.body
    ) : null;

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 rounded-t-2xl" />
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <Repeat size={13} className="text-violet-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100 flex-1">DCA — Auto Swap</h3>
                <button onClick={() => setShowForm(!showForm)}
                    className={`p-1.5 rounded-lg transition-all ${showForm ? 'bg-violet-500/15 text-violet-400' : 'text-surface-200/30 hover:text-violet-400'}`}>
                    {showForm ? <X size={14} /> : <Plus size={14} />}
                </button>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className="p-4 border-b border-white/5 space-y-3 animate-fadeIn bg-surface-900/30">
                    <div className="grid grid-cols-2 gap-2">
                        {/* Custom Wallet Dropdown */}
                        <div>
                            <label className="text-[9px] text-surface-200/30 uppercase tracking-widest block mb-1.5 font-semibold">Wallet</label>
                            <button ref={walletTriggerRef}
                                onClick={() => { setOpenWalletDd(!openWalletDd); setOpenIntervalDd(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-800/80 border transition-all text-left ${openWalletDd
                                    ? 'border-violet-500/40 shadow-sm shadow-violet-500/10'
                                    : 'border-white/[0.08] hover:border-white/[0.15]'
                                }`}>
                                <Wallet size={12} className={form.walletId ? 'text-violet-400' : 'text-surface-200/25'} />
                                <span className={`flex-1 text-xs truncate ${form.walletId ? 'text-surface-100 font-semibold' : 'text-surface-200/30'}`}>
                                    {walletDisplayText}
                                </span>
                                <ChevronDown size={12} className={`text-surface-200/30 transition-transform ${openWalletDd ? 'rotate-180' : ''}`} />
                            </button>
                            {walletDropdown}
                        </div>
                        {/* Custom Interval Dropdown */}
                        <div>
                            <label className="text-[9px] text-surface-200/30 uppercase tracking-widest block mb-1.5 font-semibold">Interval</label>
                            <button ref={intervalTriggerRef}
                                onClick={() => { setOpenIntervalDd(!openIntervalDd); setOpenWalletDd(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-800/80 border transition-all text-left ${openIntervalDd
                                    ? 'border-violet-500/40 shadow-sm shadow-violet-500/10'
                                    : 'border-white/[0.08] hover:border-white/[0.15]'
                                }`}>
                                <Clock size={12} className="text-violet-400" />
                                <span className="flex-1 text-xs text-surface-100 font-semibold">{intervalDisplayText}</span>
                                <ChevronDown size={12} className={`text-surface-200/30 transition-transform ${openIntervalDd ? 'rotate-180' : ''}`} />
                            </button>
                            {intervalDropdown}
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] text-surface-200/30 uppercase tracking-widest block mb-1.5 font-semibold">To Token (Contract Address)</label>
                        <input type="text" value={form.toTokenAddress} placeholder="0x..." onChange={e => setForm(f => ({ ...f, toTokenAddress: e.target.value }))}
                            className="w-full bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] focus:border-violet-500/40 rounded-xl px-3 py-2.5 text-xs text-surface-100 outline-none font-mono transition-colors" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[9px] text-surface-200/30 uppercase tracking-widest block mb-1.5 font-semibold">Amount</label>
                            <input type="number" value={form.amount} placeholder="0.1" onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] focus:border-violet-500/40 rounded-xl px-3 py-2.5 text-xs text-surface-100 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                        <div>
                            <label className="text-[9px] text-surface-200/30 uppercase tracking-widest block mb-1.5 font-semibold">Stop Loss %</label>
                            <input type="number" value={form.stopLossPct} placeholder="10" onChange={e => setForm(f => ({ ...f, stopLossPct: e.target.value }))}
                                className="w-full bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] focus:border-violet-500/40 rounded-xl px-3 py-2.5 text-xs text-surface-100 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                        <div>
                            <label className="text-[9px] text-surface-200/30 uppercase tracking-widest block mb-1.5 font-semibold">Take Profit %</label>
                            <input type="number" value={form.takeProfitPct} placeholder="50" onChange={e => setForm(f => ({ ...f, takeProfitPct: e.target.value }))}
                                className="w-full bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] focus:border-violet-500/40 rounded-xl px-3 py-2.5 text-xs text-surface-100 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.walletId || !form.toTokenAddress || !form.amount}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-bold shadow-lg hover:shadow-violet-500/25 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-40">
                        {creating ? <Loader2 size={14} className="animate-spin mx-auto" /> : '🔄 Create DCA Schedule'}
                    </button>
                </div>
            )}

            {/* Task List */}
            {loading ? (
                <div className="p-6 flex justify-center"><Loader2 size={16} className="animate-spin text-surface-200/30" /></div>
            ) : tasks.length === 0 ? (
                <div className="p-6 text-center">
                    <Repeat size={24} className="text-surface-200/10 mx-auto mb-2" />
                    <p className="text-xs text-surface-200/20">No DCA schedules yet</p>
                    <p className="text-[10px] text-surface-200/15 mt-1">Click + to create your first auto-swap</p>
                </div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {tasks.map(task => {
                        const isActive = task.status === 'active';
                        const isPaused = task.status === 'paused';
                        const nextRun = task.nextRunAt ? new Date(task.nextRunAt).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                        return (
                            <div key={task.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-surface-200/20'}`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-surface-100">
                                        {task.fromSymbol} → {task.toSymbol}
                                        <span className="text-[9px] text-surface-200/25 ml-1.5">{fmtInterval(task.intervalMs)}</span>
                                    </p>
                                    <p className="text-[10px] text-surface-200/30">
                                        {task.amount} per swap • Chain {CHAINS[task.chainIndex]?.name || task.chainIndex}
                                        {isActive && <span className="text-emerald-400/60 ml-1">• Next: {nextRun}</span>}
                                    </p>
                                    {(task.stopLossPct || task.takeProfitPct) && (
                                        <p className="text-[9px] text-surface-200/20">
                                            {task.stopLossPct && <span className="text-red-400/60">SL: -{task.stopLossPct}%</span>}
                                            {task.stopLossPct && task.takeProfitPct && ' • '}
                                            {task.takeProfitPct && <span className="text-emerald-400/60">TP: +{task.takeProfitPct}%</span>}
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {isActive && (
                                        <button onClick={() => handleAction(task.id, 'pause')} className="p-1.5 rounded-lg hover:bg-amber-500/15 text-surface-200/30 hover:text-amber-400 transition-all" title="Pause">
                                            <Pause size={12} />
                                        </button>
                                    )}
                                    {isPaused && (
                                        <button onClick={() => handleAction(task.id, 'resume')} className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-surface-200/30 hover:text-emerald-400 transition-all" title="Resume">
                                            <Play size={12} />
                                        </button>
                                    )}
                                    <button onClick={() => handleAction(task.id, 'delete')} className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-200/30 hover:text-red-400 transition-all" title="Cancel">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Hot Tokens Card
   ═══════════════════════════════════════════ */
function HotTokensCard({ chainIndex, onSelectToken }) {
    const [hotTokens, setHotTokens] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getHotTokens(chainIndex)
            .then(res => setHotTokens((res.data || []).slice(0, 5)))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [chainIndex]);

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Flame size={13} className="text-orange-400" />
                <h4 className="text-[11px] font-bold text-surface-100">Hot Tokens 🔥</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : hotTokens.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No data</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {hotTokens.map((t, i) => {
                        const change = Number(t.priceChangePercentage24H || t.change24h || 0);
                        return (
                            <div key={i} onClick={() => onSelectToken?.(t.tokenSymbol, t.tokenContractAddress)}
                                className="px-3 py-2 flex items-center gap-2 hover:bg-white/[0.03] transition-colors cursor-pointer">
                                <span className="text-[9px] text-surface-200/20 w-3 font-bold">{i + 1}</span>
                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center text-[8px] font-bold text-orange-300">
                                    {(t.tokenSymbol || '?').slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-surface-100 truncate">{t.tokenSymbol}</p>
                                </div>
                                <span className="text-[10px] text-surface-100 font-medium">{formatPrice(t.price)}</span>
                                {formatChange(change)}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Smart Money Signals
   ═══════════════════════════════════════════ */
function SmartMoneySignals({ chainIndex }) {
    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getSignals(chainIndex)
            .then(res => setSignals((res.data || []).slice(0, 6)))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [chainIndex]);

    const [copiedAddr, setCopiedAddr] = useState(null);
    const handleCopy = (addr) => {
        navigator.clipboard.writeText(addr);
        setCopiedAddr(addr);
        setTimeout(() => setCopiedAddr(null), 1500);
    };

    const typeColors = {
        smart_money: 'bg-emerald-500/15 text-emerald-400',
        whale: 'bg-blue-500/15 text-blue-400',
        kol: 'bg-amber-500/15 text-amber-400',
    };
    const typeLabels = { smart_money: '🧠 Smart', whale: '🐋 Whale', kol: '⭐ KOL' };

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Radio size={12} className="text-emerald-400" />
                <h4 className="text-[11px] font-bold text-surface-100">Smart Money Signals</h4>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : signals.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No signals available</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {signals.map((s, i) => {
                        const walletAddr = s.walletAddress || s.makerAddress || '';
                        const sigType = (s.walletType || s.type || 'smart_money').toLowerCase().replace(' ', '_');
                        return (
                            <div key={i} className="px-3 py-2 hover:bg-white/[0.02] transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${typeColors[sigType] || typeColors.smart_money}`}>
                                        {typeLabels[sigType] || '📡 Signal'}
                                    </span>
                                    <span className="text-[10px] font-semibold text-surface-100">{s.tokenSymbol || '?'}</span>
                                    <span className={`text-[9px] font-bold ml-auto ${s.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {(s.action || s.tradeDirection || 'buy').toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {walletAddr && (
                                        <>
                                            <span className="text-[9px] text-surface-200/25 font-mono">{walletAddr.slice(0, 6)}...{walletAddr.slice(-4)}</span>
                                            <button onClick={() => handleCopy(walletAddr)} className="text-surface-200/20 hover:text-brand-400 transition-colors">
                                                {copiedAddr === walletAddr ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                                            </button>
                                        </>
                                    )}
                                    {s.amountUsd && <span className="text-[9px] text-surface-200/30 ml-auto">${Number(s.amountUsd).toLocaleString()}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Leaderboard Mini
   ═══════════════════════════════════════════ */
function LeaderboardMini({ chainIndex }) {
    const [traders, setTraders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Use top tokens endpoint as proxy for leaderboard data
        setLoading(true);
        api.getTopTokens(chainIndex, '2', '4')
            .then(res => {
                const data = (res.data || []).slice(0, 5);
                const leaderboard = data.map((t, i) => ({
                    rank: i + 1,
                    symbol: t.tokenSymbol || '?',
                    pnl: Number(t.priceChangePercentage24H || 0),
                    volume: Number(t.volume24H || 0),
                    price: Number(t.price || 0),
                }));
                setTraders(leaderboard);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [chainIndex]);

    const badges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-amber-500 to-yellow-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Trophy size={12} className="text-amber-400" />
                <h4 className="text-[11px] font-bold text-surface-100">Top Performers</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : traders.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No data</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {traders.map((t, i) => (
                        <div key={i} className="px-3 py-2 flex items-center gap-2">
                            <span className="text-sm">{badges[i] || ''}</span>
                            <span className="text-[10px] font-bold text-surface-100 flex-1">{t.symbol}</span>
                            <span className="text-[10px] font-medium text-surface-100">{formatPrice(t.price)}</span>
                            {formatChange(t.pnl)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Batch Swap Widget — same pair, multi-wallet
   ═══════════════════════════════════════════ */
function BatchSwapWidget({ chainIndex, wallets = [] }) {
    const [expanded, setExpanded] = useState(false);
    const [selectedWallets, setSelectedWallets] = useState({});
    const [amount, setAmount] = useState('1');
    const [sameAmount, setSameAmount] = useState(true);
    const [amounts, setAmounts] = useState({});
    const [fromSymbol, setFromSymbol] = useState('OKB');
    const [toSymbol, setToSymbol] = useState('USDT');
    const [slippage, setSlippage] = useState('1');
    const [executing, setExecuting] = useState(false);
    const [results, setResults] = useState([]);
    const tokens = KNOWN_TOKENS[chainIndex] || KNOWN_TOKENS['196'];
    const tokenList = Object.keys(tokens);

    const toggleWallet = (id) => setSelectedWallets(p => ({ ...p, [id]: !p[id] }));
    const selectAll = () => {
        const allSelected = wallets.every(w => selectedWallets[w.id]);
        const next = {};
        wallets.forEach(w => { next[w.id] = !allSelected; });
        setSelectedWallets(next);
    };
    const selectedCount = wallets.filter(w => selectedWallets[w.id]).length;

    const handleBatchSwap = async () => {
        if (selectedCount === 0 || !tokens[fromSymbol] || !tokens[toSymbol]) return;
        setExecuting(true); setResults([]);
        try {
            const swaps = wallets.filter(w => selectedWallets[w.id]).map(w => ({
                walletId: w.id, amount: sameAmount ? amount : (amounts[w.id] || amount),
            }));
            const res = await api.batchSwap({
                swaps, chainIndex, fromTokenAddress: tokens[fromSymbol].addr,
                toTokenAddress: tokens[toSymbol].addr, slippage
            });
            setResults(res.results || []);
        } catch (err) { setResults([{ error: err.message }]); }
        setExecuting(false);
    };

    if (wallets.length < 2) return null;

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-2xl" />
            <button onClick={() => setExpanded(!expanded)}
                className="w-full p-3 flex items-center gap-2 text-left hover:bg-white/[0.02] transition-colors">
                <Layers size={13} className="text-orange-400" />
                <h4 className="text-[11px] font-bold text-surface-100 flex-1">Batch Swap</h4>
                <span className="text-[9px] text-surface-200/30 mr-1">{wallets.length} wallets</span>
                <ChevronDown size={12} className={`text-surface-200/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
                <div className="px-3 pb-3 space-y-2.5">
                    {/* Token pair */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[9px] text-surface-200/25 mb-0.5 block">FROM</label>
                            <select value={fromSymbol} onChange={e => setFromSymbol(e.target.value)}
                                className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 outline-none">
                                {tokenList.map(s => <option key={s} value={s}>{tokens[s].icon} {s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] text-surface-200/25 mb-0.5 block">TO</label>
                            <select value={toSymbol} onChange={e => setToSymbol(e.target.value)}
                                className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 outline-none">
                                {tokenList.filter(s => s !== fromSymbol).map(s => <option key={s} value={s}>{tokens[s].icon} {s}</option>)}
                            </select>
                        </div>
                    </div>
                    {/* Amount + slippage */}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5">
                                <label className="text-[9px] text-surface-200/25">Amount per wallet</label>
                                <button onClick={() => setSameAmount(!sameAmount)} className="text-[8px] text-brand-400 hover:text-brand-300">
                                    {sameAmount ? 'Custom each ↗' : 'Same for all ↗'}
                                </button>
                            </div>
                            {sameAmount && (
                                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                                    className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Amount" />
                            )}
                        </div>
                        <div className="w-16">
                            <label className="text-[9px] text-surface-200/25 mb-0.5 block">Slip %</label>
                            <input type="number" value={slippage} onChange={e => setSlippage(e.target.value)}
                                className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                    </div>
                    {/* Wallet checkboxes */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-surface-200/25">Select wallets ({selectedCount}/{wallets.length})</span>
                            <button onClick={selectAll} className="text-[8px] text-brand-400 hover:text-brand-300">
                                {wallets.every(w => selectedWallets[w.id]) ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                            {wallets.map(w => (
                                <label key={w.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${selectedWallets[w.id] ? 'bg-orange-500/10 border-orange-500/20 text-surface-100' : 'bg-surface-800/40 border-white/[0.04] text-surface-200/40 hover:border-white/[0.08]'}`}>
                                    <input type="checkbox" checked={!!selectedWallets[w.id]} onChange={() => toggleWallet(w.id)} className="w-3 h-3 rounded accent-orange-500" />
                                    <Wallet size={10} className={selectedWallets[w.id] ? 'text-orange-400' : 'text-surface-200/20'} />
                                    <span className="flex-1 truncate">{w.name || `Wallet ${w.id}`}</span>
                                    <span className="text-[9px] font-mono text-surface-200/20">{w.address?.slice(0, 6)}...{w.address?.slice(-4)}</span>
                                    {!sameAmount && selectedWallets[w.id] && (
                                        <input type="number" value={amounts[w.id] || ''} onChange={e => setAmounts(p => ({ ...p, [w.id]: e.target.value }))}
                                            placeholder={amount} onClick={e => e.stopPropagation()}
                                            className="w-16 bg-surface-800/80 border border-white/[0.08] rounded px-1 py-0.5 text-[10px] text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>
                    {/* Execute */}
                    <button onClick={handleBatchSwap} disabled={executing || selectedCount === 0}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-lg hover:shadow-orange-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5">
                        {executing ? <><Loader2 size={12} className="animate-spin" /> Swapping {selectedCount} wallets...</> : <><Zap size={12} /> Batch Swap ({selectedCount} wallets)</>}
                    </button>
                    {/* Results */}
                    {results.length > 0 && (
                        <div className="space-y-1 mt-2">
                            <p className="text-[9px] text-surface-200/30 font-semibold">Results:</p>
                            {results.map((r, i) => (
                                <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] ${r.txHash ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                                    {r.txHash ? <Check size={10} className="text-emerald-400" /> : <AlertTriangle size={10} className="text-red-400" />}
                                    <span className="flex-1 truncate text-surface-100">{r.walletName || `Wallet ${r.walletId}`}</span>
                                    {r.txHash ? (
                                        <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${r.txHash}`} target="_blank" rel="noopener"
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
   Transfer Widget — Single & Batch
   ═══════════════════════════════════════════ */
function TransferWidget({ chainIndex, wallets = [], selectedWallet = null }) {
    const [tab, setTab] = useState('single');
    const tokens = KNOWN_TOKENS[chainIndex] || KNOWN_TOKENS['196'];
    const tokenList = Object.keys(tokens);
    const [sWalletId, setSWalletId] = useState(selectedWallet?.id ? String(selectedWallet.id) : '');
    const [sTo, setSTo] = useState('');
    const [sToken, setSToken] = useState(tokenList[0] || 'OKB');
    const [sAmount, setSAmount] = useState('');
    const [sExecuting, setSExecuting] = useState(false);
    const [sResult, setSResult] = useState(null);
    const [bRows, setBRows] = useState([{ walletId: '', toAddress: '', amount: '' }]);
    const [bToken, setBToken] = useState(tokenList[0] || 'OKB');
    const [bExecuting, setBExecuting] = useState(false);
    const [bResults, setBResults] = useState([]);
    const [csvInput, setCsvInput] = useState('');

    useEffect(() => { if (selectedWallet) setSWalletId(String(selectedWallet.id)); }, [selectedWallet]);

    const handleSingleTransfer = async () => {
        if (!sWalletId || !sTo || !sAmount) return;
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
    };

    const addBatchRow = () => setBRows(r => [...r, { walletId: selectedWallet?.id || '', toAddress: '', amount: '' }]);
    const removeBatchRow = (i) => setBRows(r => r.filter((_, idx) => idx !== i));
    const updateBatchRow = (i, field, val) => setBRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

    const parseCsv = () => {
        const lines = csvInput.trim().split('\n').filter(l => l.trim());
        const rows = lines.map(l => {
            const parts = l.split(/[,;\t]+/).map(s => s.trim());
            return { walletId: selectedWallet?.id || '', toAddress: parts[0] || '', amount: parts[1] || '' };
        }).filter(r => r.toAddress);
        if (rows.length) { setBRows(rows); setCsvInput(''); }
    };

    const handleBatchTransfer = async () => {
        const validRows = bRows.filter(r => r.walletId && r.toAddress && r.amount);
        if (validRows.length === 0) return;
        setBExecuting(true); setBResults([]);
        try {
            const tokenInfo = tokens[bToken];
            const isNative = tokenInfo?.addr?.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            const res = await api.batchTransfer({
                transfers: validRows, chainIndex,
                tokenAddress: isNative ? undefined : tokenInfo?.addr
            });
            setBResults(res.results || []);
        } catch (err) { setBResults([{ error: err.message }]); }
        setBExecuting(false);
    };

    return (
        <div className="glass-card p-5 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-t-2xl" />

            {/* Header — matches Swap */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                    <Send size={15} className="text-cyan-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100 flex-1">Transfer</h3>
            </div>

            {/* Single / Batch tab — matches Swap tab */}
            <div className="flex rounded-lg bg-surface-800/60 p-0.5 mb-4">
                {[['single', '📤 Single'], ['batch', '📦 Batch']].map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex-1 py-1.5 text-[10px] font-semibold rounded-md transition-all ${tab === key ? 'bg-surface-700 text-surface-100 shadow-sm' : 'text-surface-200/30 hover:text-surface-200/50'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {wallets.length === 0 ? (
                <div className="text-center py-6">
                    <Wallet size={24} className="text-surface-200/15 mx-auto mb-2" />
                    <p className="text-xs text-surface-200/30 mb-2">No wallets connected</p>
                    <a href="#wallets" className="text-xs text-brand-400 hover:text-brand-300 font-semibold">Create Wallet →</a>
                </div>
            ) : tab === 'single' ? (
                <div className="space-y-3">
                    {/* Wallet selector */}
                    <WalletDropdown wallets={wallets} value={sWalletId} onChange={setSWalletId} accentColor="cyan" chainIndex={chainIndex} />

                    {/* TO address */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">TO</label>
                        <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                            <input value={sTo} onChange={e => setSTo(e.target.value)} placeholder="0x..."
                                className="w-full bg-transparent text-sm text-surface-100 font-mono outline-none placeholder:text-surface-200/15" />
                        </div>
                    </div>

                    {/* Token selector — matches Swap style */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">TOKEN</label>
                        <div className="bg-surface-900/60 rounded-2xl border border-white/[0.08] p-3">
                            <div className="flex items-center gap-3">
                                <select value={sToken} onChange={e => setSToken(e.target.value)}
                                    className="styled-select w-auto min-w-[120px]">
                                    {tokenList.map(s => <option key={s} value={s}>{tokens[s].icon} {s}</option>)}
                                </select>
                                <input type="number" value={sAmount} onChange={e => setSAmount(e.target.value)} placeholder="0.0"
                                    className="flex-1 bg-transparent text-right text-xl font-bold text-surface-100 outline-none placeholder:text-surface-200/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                        </div>
                    </div>

                    {/* Execute */}
                    <button onClick={handleSingleTransfer} disabled={sExecuting || !sWalletId || !sTo || !sAmount}
                        className="w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                        {sExecuting ? <><Loader2 size={14} className="animate-spin" /> Sending...</> : <><Send size={14} /> Transfer</>}
                    </button>

                    {/* Result */}
                    {sResult && (
                        <div className={`px-3 py-2 rounded-xl text-xs ${sResult.success ? 'bg-emerald-500/10 border border-emerald-500/15 text-emerald-400' : 'bg-red-500/10 border border-red-500/15 text-red-400'}`}>
                            {sResult.success ? (<>✓ <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${sResult.txHash}`} target="_blank" rel="noopener" className="text-brand-400 font-mono">{sResult.txHash.slice(0, 20)}... <ExternalLink size={9} className="inline" /></a></>) : `✗ ${sResult.error}`}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Token for all */}
                    <div>
                        <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1.5 block font-semibold">TOKEN</label>
                        <select value={bToken} onChange={e => setBToken(e.target.value)}
                            className="styled-select">
                            {tokenList.map(s => <option key={s} value={s}>{tokens[s].icon} {s}</option>)}
                        </select>
                    </div>

                    {/* CSV paste */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-surface-200/30 uppercase tracking-wider font-semibold">Paste CSV (address, amount)</label>
                            <button onClick={parseCsv} disabled={!csvInput.trim()} className="text-[9px] text-brand-400 hover:text-brand-300 disabled:opacity-30 font-semibold">Parse ↗</button>
                        </div>
                        <textarea value={csvInput} onChange={e => setCsvInput(e.target.value)} rows={2}
                            className="w-full bg-surface-900/60 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-surface-100 font-mono outline-none resize-none placeholder:text-surface-200/15"
                            placeholder={"0x1234...,1.5\n0x5678...,2.0"} />
                    </div>

                    {/* Rows */}
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {bRows.map((row, i) => (
                            <div key={i} className="flex gap-1.5 items-center">
                                <select value={row.walletId} onChange={e => updateBatchRow(i, 'walletId', e.target.value)}
                                    className="styled-select-xs w-28">
                                    <option value="">Wallet...</option>
                                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name || `W${w.id}`}</option>)}
                                </select>
                                <input value={row.toAddress} onChange={e => updateBatchRow(i, 'toAddress', e.target.value)} placeholder="0x..."
                                    className="flex-1 min-w-0 bg-surface-900/60 border border-white/[0.08] rounded-lg px-2 py-2 text-[10px] text-surface-100 font-mono outline-none placeholder:text-surface-200/15" />
                                <input type="number" value={row.amount} onChange={e => updateBatchRow(i, 'amount', e.target.value)} placeholder="Amt"
                                    className="w-20 bg-surface-900/60 border border-white/[0.08] rounded-lg px-2 py-2 text-[10px] text-surface-100 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <button onClick={() => removeBatchRow(i)} className="text-surface-200/20 hover:text-red-400 transition-colors p-1"><X size={12} /></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={addBatchRow} className="w-full py-2 rounded-xl border border-dashed border-white/[0.1] text-[10px] text-surface-200/30 hover:text-surface-100 hover:border-white/[0.2] transition-colors flex items-center justify-center gap-1">
                        <Plus size={10} /> Add Row
                    </button>

                    {/* Execute batch */}
                    <button onClick={handleBatchTransfer} disabled={bExecuting || bRows.filter(r => r.walletId && r.toAddress && r.amount).length === 0}
                        className="w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                        {bExecuting ? <><Loader2 size={14} className="animate-spin" /> Transferring...</> : <><Send size={14} /> Batch Transfer ({bRows.filter(r => r.walletId && r.toAddress && r.amount).length} txns)</>}
                    </button>

                    {/* Results */}
                    {bResults.length > 0 && (
                        <div className="space-y-1.5 mt-1">
                            <p className="text-[10px] text-surface-200/30 font-semibold">Results:</p>
                            {bResults.map((r, i) => (
                                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${r.txHash ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                                    {r.txHash ? <Check size={11} className="text-emerald-400" /> : <AlertTriangle size={11} className="text-red-400" />}
                                    <span className="truncate flex-1 text-surface-100">{r.walletName || r.toAddress?.slice(0, 10)}</span>
                                    {r.txHash ? (
                                        <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${r.txHash}`} target="_blank" rel="noopener"
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
function ExecuteSwapButton({ chainIndex, fromTokenAddress, toTokenAddress, amount, slippage, wallets: sharedWallets = [], selectedWallet: sharedSelectedWallet = null }) {
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
        } catch (err) {
            setResult({ success: false, error: err.message });
        }
        setExecuting(false);
        setShowConfirm(false);
    };

    if (!sharedWallets.length) return (
        <a href="#/wallets" className="mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold hover:bg-amber-500/15 transition-colors">
            <Wallet size={11} /> Create a wallet to execute swaps →
        </a>
    );

    return (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
            {result && (
                <div className={`mb-2 px-3 py-2 rounded-lg text-xs ${result.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {result.success ? (
                        <span>✅ TX: <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${result.txHash}`} target="_blank" rel="noopener" className="underline">{result.txHash?.slice(0, 12)}...</a></span>
                    ) : <span>❌ {result.error}</span>}
                </div>
            )}
            {showConfirm ? (
                <div className="space-y-2 animate-fadeIn">
                    <p className="text-[10px] text-amber-400 flex items-center gap-1"><AlertTriangle size={11} /> Confirm swap from wallet:</p>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-800/60 border border-white/[0.06]">
                        <Wallet size={11} className="text-violet-400" />
                        <span className="text-[10px] text-surface-100 font-mono flex-1">{selectedWallet?.address?.slice(0, 10)}...{selectedWallet?.address?.slice(-6)}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-surface-800/60 border border-white/[0.08] text-xs text-surface-200/50 hover:text-surface-100 transition-colors">Cancel</button>
                        <button onClick={handleExecute} disabled={executing}
                            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold hover:shadow-emerald-500/25 transition-all disabled:opacity-40">
                            {executing ? <Loader2 size={12} className="animate-spin mx-auto" /> : '✅ Confirm Swap'}
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setShowConfirm(true)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold shadow-lg hover:shadow-emerald-500/25 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Send size={13} /> Execute Swap
                </button>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Candlestick Chart — Premium v2
   ═══════════════════════════════════════════ */
function CandlestickChart({ chainIndex, tokenAddress, symbol }) {
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
                    <span className="text-surface-200/15 text-[9px]">Hover over chart for OHLCV data</span>
                )}
            </div>

            {/* Chart Area */}
            <div className="pb-2">
                {loading ? (
                    <div className="h-[260px] flex items-center justify-center"><Loader2 size={16} className="animate-spin text-surface-200/20" /></div>
                ) : candles.length < 2 ? (
                    <div className="h-[260px] flex items-center justify-center text-[11px] text-surface-200/20">No chart data available</div>
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
                <h4 className="text-[11px] font-bold text-surface-100">Portfolio Overview</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : !data ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">Connect wallet to view</div>
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


/* ═══════════════════════════════════════════
   Top Traders Card
   ═══════════════════════════════════════════ */
function TopTradersCard({ chainIndex, tokenAddress }) {
    const [traders, setTraders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [copiedAddr, setCopiedAddr] = useState(null);

    useEffect(() => {
        if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') { setTraders([]); return; }
        setLoading(true);
        api.getTopTraders(chainIndex, tokenAddress)
            .then(res => setTraders((res.data || []).slice(0, 8)))
            .catch(() => {}).finally(() => setLoading(false));
    }, [chainIndex, tokenAddress]);

    if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;

    const handleCopy = (addr) => { navigator.clipboard.writeText(addr); setCopiedAddr(addr); setTimeout(() => setCopiedAddr(null), 1500); };

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Users size={12} className="text-orange-400" />
                <h4 className="text-[11px] font-bold text-surface-100">Top Traders</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : traders.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No trader data</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {traders.map((tr, i) => {
                        const addr = tr.traderAddress || tr.walletAddress || '';
                        return (
                            <div key={i} className="px-3 py-2 flex items-center gap-2 hover:bg-white/[0.02] transition-colors">
                                <span className={`text-[9px] font-bold w-8 ${tr.tradeDirection === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {(tr.tradeDirection || 'buy').toUpperCase()}
                                </span>
                                <span className="text-[9px] text-surface-200/30 font-mono flex-1 truncate">{addr.slice(0, 8)}...{addr.slice(-4)}</span>
                                <button onClick={() => handleCopy(addr)} className="text-surface-200/20 hover:text-brand-400 transition-colors">
                                    {copiedAddr === addr ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                                </button>
                                <span className="text-[9px] text-surface-200/40">${Number(tr.amountUsd || tr.tradeAmountUsd || 0).toLocaleString()}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Top Liquidity Pools Card
   ═══════════════════════════════════════════ */
function TopLiquidityCard({ chainIndex, tokenAddress }) {
    const [pools, setPools] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') { setPools([]); return; }
        setLoading(true);
        api.getTopLiquidity(chainIndex, tokenAddress)
            .then(res => setPools((res.data || []).slice(0, 5)))
            .catch(() => {}).finally(() => setLoading(false));
    }, [chainIndex, tokenAddress]);

    if (!tokenAddress || tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-cyan-500 to-teal-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Droplets size={12} className="text-cyan-400" />
                <h4 className="text-[11px] font-bold text-surface-100">Liquidity Pools</h4>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : pools.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No pool data</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {pools.map((p, i) => (
                        <div key={i} className="px-3 py-2 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-surface-100 flex-1">{p.tokenPairSymbol || p.pairSymbol || `Pool ${i + 1}`}</span>
                                <span className="text-[9px] text-surface-200/40">{p.dexName || ''}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[9px] text-surface-200/30">TVL: <b className="text-surface-100">{formatLargeNum(p.liquidity || p.tvl || 0)}</b></span>
                                {p.volume24h && <span className="text-[9px] text-surface-200/30">Vol: <b className="text-surface-100">{formatLargeNum(p.volume24h)}</b></span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   Memepump / Token Sniper Card
   ═══════════════════════════════════════════ */
function MemepumpCard({ chainIndex, onSelectToken }) {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getMemepumpList(chainIndex)
            .then(res => setTokens((res.data || []).slice(0, 8)))
            .catch(() => {}).finally(() => setLoading(false));
    }, [chainIndex]);

    return (
        <div className="glass-card relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-pink-500 via-rose-500 to-red-500 rounded-t-2xl" />
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Rocket size={12} className="text-pink-400" />
                <h4 className="text-[11px] font-bold text-surface-100">Token Sniper</h4>
                <span className="ml-auto text-[8px] text-pink-400/60 font-bold uppercase">Live</span>
            </div>
            {loading ? (
                <div className="p-4 flex justify-center"><Loader2 size={12} className="animate-spin text-surface-200/30" /></div>
            ) : tokens.length === 0 ? (
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No new tokens</div>
            ) : (
                <div className="divide-y divide-white/[0.03]">
                    {tokens.map((t, i) => (
                        <div key={i} className="px-3 py-2 flex items-center gap-2 hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => onSelectToken?.(t.tokenSymbol, t.tokenContractAddress)}>
                            {t.tokenLogoUrl ? (
                                <img src={t.tokenLogoUrl} alt="" className="w-5 h-5 rounded-full" />
                            ) : (
                                <span className="w-5 h-5 rounded-full bg-pink-500/15 flex items-center justify-center text-[8px]">🚀</span>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-surface-100 truncate">{t.tokenSymbol || '?'}</p>
                                <p className="text-[8px] text-surface-200/25 truncate">{t.tokenName || ''}</p>
                            </div>
                            {t.progress != null && (
                                <div className="w-12">
                                    <div className="h-1 rounded-full bg-surface-800/60 overflow-hidden">
                                        <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500" style={{ width: `${Math.min(Number(t.progress || 0) * 100, 100)}%` }} />
                                    </div>
                                    <p className="text-[7px] text-surface-200/20 text-center mt-0.5">{(Number(t.progress || 0) * 100).toFixed(0)}%</p>
                                </div>
                            )}
                            {t.marketCap && <span className="text-[9px] text-surface-200/30">{formatLargeNum(t.marketCap)}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════════════════════════
   DEX History Card
   ═══════════════════════════════════════════ */
function DexHistoryCard({ chainIndex, walletAddress }) {
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
                <div className="p-4 text-[10px] text-surface-200/25 text-center">No DEX history</div>
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
                                    <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${tx.txHash}`} target="_blank" rel="noopener"
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
   Main TradingPage
   ═══════════════════════════════════════════ */
export default function TradingPage() {
    const { t } = useTranslation();
    const [chainIndex, setChainIndex] = useState('196');
    const [selectedToken, setSelectedToken] = useState({ sym: null, addr: null });
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState(null);

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

            {/* ═══════ HERO: Swap + Transfer ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SwapQuoteWidget chainIndex={chainIndex} onTokenSelect={handleTokenSelect} wallets={wallets} selectedWallet={selectedWallet} />
                <TransferWidget chainIndex={chainIndex} wallets={wallets} selectedWallet={selectedWallet} />
            </div>

            {/* ═══════ DCA ═══════ */}
            <DcaWidget chainIndex={chainIndex} wallets={wallets} />

            {/* ═══════ Chart ═══════ */}
            <CandlestickChart chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />

            {/* ═══════ Market Data ═══════ */}
            <TopTokensList chainIndex={chainIndex} onSelectToken={handleTopTokenClick} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SmartMoneySignals chainIndex={chainIndex} />
                <HotTokensCard chainIndex={chainIndex} onSelectToken={handleTopTokenClick} />
                <LeaderboardMini chainIndex={chainIndex} />
            </div>

            {/* ═══════ Portfolio + Token Info ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PortfolioCard chainIndex={chainIndex} walletAddress={selectedWallet?.address} />
                <TokenInfoCard chainIndex={chainIndex} tokenAddress={selectedToken.addr} symbol={selectedToken.sym} />
            </div>

            {/* ═══════ Traders + Liquidity ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TopTradersCard chainIndex={chainIndex} tokenAddress={selectedToken.addr} />
                <TopLiquidityCard chainIndex={chainIndex} tokenAddress={selectedToken.addr} />
            </div>

            {/* ═══════ Memepump + DEX History ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MemepumpCard chainIndex={chainIndex} onSelectToken={handleTopTokenClick} />
                <DexHistoryCard chainIndex={chainIndex} walletAddress={selectedWallet?.address} />
            </div>

            {/* ═══════ Trades + TX + Gas ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <RecentTrades chainIndex={chainIndex} tokenAddress={selectedToken.addr} />
                <TxHistory />
                <GasWidget chainIndex={chainIndex} />
            </div>

            {/* Mobile Bottom Sheet Swap */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-900/95 backdrop-blur-xl border-t border-white/[0.08] px-4 py-3 flex items-center gap-3 safe-area-bottom">
                <Wallet size={16} className="text-brand-400" />
                <span className="text-xs text-surface-100 font-semibold flex-1">Quick Trade</span>
                <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-xs font-bold shadow-lg">
                    <ArrowUpRight size={14} />
                </button>
            </div>
        </div>
    );
}
