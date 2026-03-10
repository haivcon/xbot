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

/* ── Swap Quote Widget ── */
function SwapQuoteWidget() {
    const [fromSymbol, setFromSymbol] = useState('OKB');
    const [toSymbol, setToSymbol] = useState('USDT');
    const [amount, setAmount] = useState('1');
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Known token addresses for quick access
    const TOKENS = {
        'OKB': { chain: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
        'USDT': { chain: '196', addr: '0x1e4a5963abfd975d8c9021ce480b42188849d41d' },
        'WETH': { chain: '196', addr: '0x5a77f1443d16ee5761d310e38b7a0bba64702958' },
    };

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

    return (
        <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-4">
                <ArrowLeftRight size={14} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-surface-100">Quick Swap Quote</h3>
            </div>

            <div className="space-y-3">
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[9px] text-surface-200/30 uppercase mb-1 block">From</label>
                        <div className="flex gap-2">
                            <select value={fromSymbol} onChange={e => setFromSymbol(e.target.value)}
                                className="bg-surface-800/60 border border-white/5 rounded-lg px-2 py-2 text-xs text-surface-100 w-20">
                                {Object.keys(TOKENS).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                                className="input-field text-xs py-2 flex-1" placeholder="Amount" />
                        </div>
                    </div>
                </div>

                <div className="flex justify-center">
                    <button onClick={() => { setFromSymbol(toSymbol); setToSymbol(fromSymbol); }}
                        className="w-7 h-7 rounded-full bg-surface-800/60 border border-white/5 flex items-center justify-center hover:bg-white/5 transition-colors">
                        <ArrowDown size={12} className="text-surface-200/40" />
                    </button>
                </div>

                <div>
                    <label className="text-[9px] text-surface-200/30 uppercase mb-1 block">To</label>
                    <select value={toSymbol} onChange={e => setToSymbol(e.target.value)}
                        className="bg-surface-800/60 border border-white/5 rounded-lg px-2 py-2 text-xs text-surface-100 w-full">
                        {Object.keys(TOKENS).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <button onClick={getQuote} disabled={loading}
                    className="btn-primary w-full text-xs flex items-center justify-center gap-2 py-2">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    Get Quote
                </button>

                {error && <p className="text-xs text-red-400 text-center">{error}</p>}

                {toAmount && (
                    <div className="bg-surface-800/40 rounded-xl p-3 border border-white/5 space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-surface-200/40">You Get</span>
                            <span className="text-surface-100 font-semibold">{Number(toAmount).toLocaleString('en-US', { maximumFractionDigits: 6 })} {routerResult?.toTokenSymbol || toSymbol}</span>
                        </div>
                        {priceImpact && (
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-200/40">Price Impact</span>
                                <span className={`${Number(priceImpact) > 5 ? 'text-red-400' : 'text-emerald-400'}`}>{Number(priceImpact).toFixed(2)}%</span>
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
