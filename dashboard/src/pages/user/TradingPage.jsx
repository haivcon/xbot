import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    ArrowLeftRight, TrendingUp, Fuel, Search, RefreshCw, Loader2,
    ArrowDown, Clock, ExternalLink, ArrowUpRight, ArrowDownRight, Zap
} from 'lucide-react';

const CHAIN_NAMES = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };

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
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
}

/* ── Gas Widget ── */
function GasWidget() {
    const [gas, setGas] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.getGasPrice('196');
                setGas(data.data);
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
        const timer = setInterval(load, 30000);
        return () => clearInterval(timer);
    }, []);

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
        <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
                <Fuel size={14} className="text-amber-400" />
                <h3 className="text-xs font-semibold text-surface-100">Gas Price</h3>
                <span className="text-[9px] text-surface-200/25 ml-auto">X Layer</span>
            </div>
            <div className="flex items-end gap-1.5">
                <span className="text-2xl font-bold text-surface-100">{gasPrice}</span>
                <span className="text-xs text-surface-200/40 mb-1">{unit}</span>
            </div>
        </div>
    );
}

/* ── Top Tokens List ── */
function TopTokensList() {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('2');
    const [timeFrame, setTimeFrame] = useState('4');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getTopTokens('196', sortBy, timeFrame);
            setTokens(data.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, [sortBy, timeFrame]);

    useEffect(() => { load(); }, [load]);

    const sortOptions = [
        { value: '2', label: 'Price Δ' },
        { value: '5', label: 'Volume' },
        { value: '6', label: 'Market Cap' },
    ];
    const timeOptions = [
        { value: '1', label: '5m' },
        { value: '2', label: '1h' },
        { value: '3', label: '4h' },
        { value: '4', label: '24h' },
    ];

    return (
        <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
                    <TrendingUp size={14} className="text-brand-400" />
                    Top Tokens
                </h3>
                <div className="flex gap-1">
                    {sortOptions.map(o => (
                        <button key={o.value}
                            onClick={() => setSortBy(o.value)}
                            className={`px-2 py-1 rounded text-[10px] transition-colors ${sortBy === o.value
                                    ? 'bg-brand-500/15 text-brand-400'
                                    : 'text-surface-200/30 hover:text-surface-200/60'
                                }`}>
                            {o.label}
                        </button>
                    ))}
                    <span className="w-px bg-white/5 mx-1" />
                    {timeOptions.map(o => (
                        <button key={o.value}
                            onClick={() => setTimeFrame(o.value)}
                            className={`px-2 py-1 rounded text-[10px] transition-colors ${timeFrame === o.value
                                    ? 'bg-brand-500/15 text-brand-400'
                                    : 'text-surface-200/30 hover:text-surface-200/60'
                                }`}>
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-surface-200/30" /></div>
            ) : (
                <div className="divide-y divide-white/5">
                    {tokens.slice(0, 15).map((token, i) => {
                        const price = Number(token.price || 0);
                        const change = Number(token.priceChangePercentage24H || token.change24h || 0);
                        const volume = Number(token.volume24H || token.volume || 0);
                        const marketCap = Number(token.marketCap || 0);

                        return (
                            <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                                <span className="text-[10px] text-surface-200/20 w-4 text-right">{i + 1}</span>
                                <div className="w-7 h-7 rounded-full bg-surface-700/60 border border-white/5 flex items-center justify-center text-[10px] font-bold text-surface-200/60">
                                    {(token.tokenSymbol || '?').slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-surface-100">{token.tokenSymbol || '?'}</p>
                                    <p className="text-[10px] text-surface-200/25 truncate">{token.tokenFullName || ''}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-surface-100">{formatPrice(price)}</p>
                                    {formatChange(change)}
                                </div>
                                <div className="text-right hidden md:block w-20">
                                    <p className="text-[10px] text-surface-200/40">Vol: {formatLargeNum(volume)}</p>
                                    {marketCap > 0 && <p className="text-[10px] text-surface-200/25">MC: {formatLargeNum(marketCap)}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── Swap Quote Widget — Premium v2 ── */
function SwapQuoteWidget() {
    const [searchParams] = useState(() => new URLSearchParams(window.location.search));
    const TOKENS = {
        'OKB':     { chain: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', color: '#000', icon: '◆' },
        'USDT':    { chain: '196', addr: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', color: '#26a17b', icon: '₮' },
        'WETH':    { chain: '196', addr: '0x5a77f1443d16ee5761d310e38b7a0bba64702958', color: '#627eea', icon: 'Ξ' },
        'BANMAO':  { chain: '196', addr: '0x16d91d1615fc55b76d5f92365bd60c069b46ef78', color: '#f59e0b', icon: '🐱' },
        'NIUMA':   { chain: '196', addr: '0x87669801a1fad6dad9db70d27ac752f452989667', color: '#ef4444', icon: '🐂' },
        'XWIZARD': { chain: '196', addr: '0xdcc83b32b6b4e95a61951bfcc9d71967515c0fca', color: '#8b5cf6', icon: '🧙' },
    };

    // Resolve ?to= URL param to a token symbol
    const resolveToParam = () => {
        const toParam = searchParams.get('to')?.toLowerCase();
        if (!toParam) return 'USDT';
        for (const [sym, info] of Object.entries(TOKENS)) {
            if (info.addr.toLowerCase() === toParam || sym.toLowerCase() === toParam) return sym;
        }
        return 'USDT';
    };

    const [fromSymbol, setFromSymbol] = useState('OKB');
    const [toSymbol, setToSymbol] = useState(resolveToParam);
    const [amount, setAmount] = useState('1');
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [openFrom, setOpenFrom] = useState(false);
    const [openTo, setOpenTo] = useState(false);

    const getQuote = async () => {
        if (!amount || Number(amount) <= 0) return;
        const from = TOKENS[fromSymbol];
        const to = TOKENS[toSymbol];
        if (!from || !to) { setError('Unknown token'); return; }
        if (fromSymbol === toSymbol) { setError('Same token'); return; }

        setLoading(true);
        setError(null);
        setQuote(null);
        try {
            const data = await api.getSwapQuote({
                chainIndex: '196',
                fromTokenAddress: from.addr,
                toTokenAddress: to.addr,
                amount
            });
            const q = Array.isArray(data.data) ? data.data[0] : data.data;
            setQuote(q);
        } catch (err) {
            setError(err.message || 'Quote failed');
        }
        setLoading(false);
    };

    const routerResult = quote?.routerResult;
    const toAmount = routerResult ? (Number(routerResult.toTokenAmount || 0) / Math.pow(10, Number(routerResult.toToken?.decimal || 18))).toFixed(6) : null;
    const priceImpact = routerResult?.priceImpactPercentage;

    const adjustAmount = (delta) => {
        const n = Math.max(0, Number(amount || 0) + delta);
        setAmount(String(n));
    };

    /* Custom Token Dropdown */
    const TokenDropdown = ({ value, onChange, open, setOpen, exclude }) => (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-800/80 border border-white/[0.08] hover:border-white/[0.15] text-surface-100 text-sm font-semibold transition-all w-full min-w-[120px]"
            >
                <span className="text-base">{TOKENS[value]?.icon}</span>
                <span className="flex-1 text-left">{value}</span>
                <svg className={`w-3 h-3 text-surface-200/40 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-surface-800/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/40 overflow-hidden animate-fadeIn">
                    {Object.entries(TOKENS).filter(([k]) => k !== exclude).map(([sym, info]) => (
                        <button
                            key={sym}
                            onClick={() => { onChange(sym); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all ${
                                sym === value
                                    ? 'bg-brand-500/15 text-brand-400 font-bold'
                                    : 'text-surface-200/70 hover:bg-white/[0.06] hover:text-surface-100'
                            }`}
                        >
                            <span className="text-base">{info.icon}</span>
                            <span className="font-medium">{sym}</span>
                            {sym === value && <span className="ml-auto text-brand-400">✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="glass-card p-5 relative overflow-hidden">
            {/* Gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-500 via-purple-500 to-cyan-500" />

            <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center">
                    <ArrowLeftRight size={15} className="text-brand-400" />
                </div>
                <h3 className="text-sm font-bold text-surface-100">Quick Swap Quote</h3>
            </div>

            <div className="space-y-3">
                {/* FROM */}
                <div>
                    <label className="text-[9px] text-surface-200/30 uppercase tracking-widest mb-1.5 block font-semibold">From</label>
                    <div className="flex gap-2">
                        <TokenDropdown value={fromSymbol} onChange={setFromSymbol} open={openFrom} setOpen={(v) => { setOpenFrom(v); setOpenTo(false); }} exclude={toSymbol} />
                        <div className="flex-1 flex items-center gap-0 bg-surface-800/80 border border-white/[0.08] rounded-xl overflow-hidden">
                            <button onClick={() => adjustAmount(-1)} className="px-2.5 py-2.5 text-surface-200/40 hover:text-surface-100 hover:bg-white/[0.06] transition-colors text-lg font-bold">−</button>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-surface-100 font-semibold text-center outline-none py-2.5 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0"
                            />
                            <button onClick={() => adjustAmount(1)} className="px-2.5 py-2.5 text-surface-200/40 hover:text-surface-100 hover:bg-white/[0.06] transition-colors text-lg font-bold">+</button>
                        </div>
                    </div>
                </div>

                {/* Swap direction button */}
                <div className="flex justify-center">
                    <button onClick={() => { setFromSymbol(toSymbol); setToSymbol(fromSymbol); }}
                        className="w-9 h-9 rounded-full bg-surface-800/80 border border-white/[0.08] flex items-center justify-center hover:bg-brand-500/15 hover:border-brand-500/30 hover:rotate-180 transition-all duration-300">
                        <ArrowDown size={14} className="text-surface-200/40" />
                    </button>
                </div>

                {/* TO */}
                <div>
                    <label className="text-[9px] text-surface-200/30 uppercase tracking-widest mb-1.5 block font-semibold">To</label>
                    <TokenDropdown value={toSymbol} onChange={setToSymbol} open={openTo} setOpen={(v) => { setOpenTo(v); setOpenFrom(false); }} exclude={fromSymbol} />
                </div>

                <button onClick={getQuote} disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.02] active:scale-95 transition-all duration-200 disabled:opacity-50">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    Get Quote
                </button>

                {error && <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg py-2 border border-red-500/20">{error}</p>}

                {toAmount && (
                    <div className="bg-surface-900/60 rounded-xl p-4 border border-white/[0.06] space-y-2.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-surface-200/40 font-medium">You Get</span>
                            <span className="text-surface-100 font-bold text-sm">{Number(toAmount).toLocaleString('en-US', { maximumFractionDigits: 6 })} {routerResult?.toTokenSymbol || toSymbol}</span>
                        </div>
                        {priceImpact && (
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40 font-medium">Price Impact</span>
                                <span className={`font-semibold ${Number(priceImpact) > 5 ? 'text-red-400' : 'text-emerald-400'}`}>{Number(priceImpact).toFixed(2)}%</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── TX History Widget ── */
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
        <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
                <Clock size={14} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-surface-100">Recent Transactions</h3>
            </div>
            {loading ? (
                <div className="p-8 flex justify-center"><Loader2 size={16} className="animate-spin text-surface-200/30" /></div>
            ) : txs.length === 0 ? (
                <div className="p-8 text-center text-xs text-surface-200/25">No transactions yet</div>
            ) : (
                <div className="divide-y divide-white/5">
                    {txs.map((tx, i) => {
                        const isSwap = tx.type?.includes('swap');
                        const isTransfer = tx.type?.includes('transfer');
                        const date = tx.createdAt ? new Date(tx.createdAt * 1000).toLocaleString() : '—';

                        return (
                            <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isSwap ? 'bg-brand-500/15' : 'bg-emerald-500/15'}`}>
                                    {isSwap ? <ArrowLeftRight size={12} className="text-brand-400" /> : <ArrowUpRight size={12} className="text-emerald-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-surface-100 capitalize">{tx.type?.replace(/_/g, ' ') || 'Transaction'}</p>
                                    <p className="text-[10px] text-surface-200/25">{date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-surface-100">{tx.fromAmount || '—'} {tx.fromSymbol || ''}</p>
                                    {tx.toAmount && <p className="text-[10px] text-surface-200/40">→ {tx.toAmount} {tx.toSymbol || ''}</p>}
                                </div>
                                {tx.txHash && (
                                    <a href={`https://www.okx.com/web3/explorer/xlayer/tx/${tx.txHash}`} target="_blank" rel="noopener"
                                        className="text-surface-200/20 hover:text-brand-400 transition-colors">
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

/* ── Main TradingPage ── */
export default function TradingPage() {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                <ArrowLeftRight size={22} className="text-brand-400" />
                {t('dashboard.sidebar.trading') || 'Trading'}
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: Swap + Gas */}
                <div className="space-y-4">
                    <SwapQuoteWidget />
                    <GasWidget />
                </div>

                {/* Right: Top tokens + TX history */}
                <div className="lg:col-span-2 space-y-4">
                    <TopTokensList />
                    <TxHistory />
                </div>
            </div>
        </div>
    );
}
