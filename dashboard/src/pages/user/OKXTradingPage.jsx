import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import OKXSetupModal from '@/components/OKXSetupModal';
import useToastStore from '@/stores/toastStore';
import {
    BarChart3, TrendingUp, DollarSign, ShoppingCart, X as XIcon,
    RefreshCw, Loader2, ArrowUpRight, ArrowDownRight, Key,
    AlertTriangle, Shield, Settings, Clock, ExternalLink
} from 'lucide-react';

const POPULAR_PAIRS = [
    'BTC-USDT', 'ETH-USDT', 'OKB-USDT', 'SOL-USDT', 'XRP-USDT',
    'DOGE-USDT', 'ADA-USDT', 'AVAX-USDT', 'DOT-USDT', 'LINK-USDT'
];

function formatPrice(p) {
    const n = Number(p || 0);
    if (n === 0) return '—';
    return n < 1 ? n.toFixed(6) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(pct) {
    const n = Number(pct || 0);
    const color = n >= 0 ? 'text-emerald-400' : 'text-red-400';
    const icon = n >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />;
    return <span className={`flex items-center gap-0.5 ${color} text-xs font-medium`}>{icon}{Math.abs(n).toFixed(2)}%</span>;
}

/* ── Setup Required Prompt ── */
function SetupRequired({ onSetup }) {
    return (
        <div className="glass-card p-12 text-center animate-fadeIn">
            <Key size={48} className="mx-auto text-amber-400/40 mb-4" />
            <h2 className="text-lg font-bold text-surface-100 mb-2">Connect Your OKX Account</h2>
            <p className="text-sm text-surface-200/40 mb-6 max-w-md mx-auto">
                Set up your OKX API keys to trade spot pairs, view your account balance, manage orders, and run trading bots — all from this dashboard.
            </p>
            <button onClick={onSetup} className="btn-primary text-sm">
                <Key size={14} className="inline mr-1.5" /> Setup API Keys
            </button>
            <p className="text-[9px] text-surface-200/20 mt-3">
                Start with Demo mode for simulated trading, or connect Live for real trades.
            </p>
        </div>
    );
}

/* ── Account Balance Card ── */
function BalanceCard({ creds }) {
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.getOkxBalance();
                setBalance(data.data);
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
    }, []);

    const details = Array.isArray(balance) ? balance[0]?.details || [] : [];
    const totalEq = balance?.[0]?.totalEq || '0';

    return (
        <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <DollarSign size={14} className="text-emerald-400" />
                <h3 className="text-xs font-semibold text-surface-100">Account Balance</h3>
                {creds?.demo && <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/15 text-emerald-400">DEMO</span>}
            </div>
            {loading ? (
                <Loader2 size={16} className="animate-spin text-surface-200/30 mx-auto" />
            ) : (
                <>
                    <p className="text-2xl font-bold text-surface-100 mb-3">${formatPrice(totalEq)}</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {details.filter(d => Number(d.eq) > 0).map((d, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-surface-200/60 font-medium">{d.ccy}</span>
                                <div className="text-right">
                                    <span className="text-surface-100">{Number(d.cashBal || d.availBal || 0).toFixed(4)}</span>
                                    {Number(d.eqUsd) > 0 && <span className="text-surface-200/25 ml-1.5">${formatPrice(d.eqUsd)}</span>}
                                </div>
                            </div>
                        ))}
                        {details.filter(d => Number(d.eq) > 0).length === 0 && (
                            <p className="text-xs text-surface-200/25 text-center py-2">No balances</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

/* ── Ticker List ── */
function TickerList({ onSelect, selected }) {
    const [tickers, setTickers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const results = await Promise.all(
                    POPULAR_PAIRS.map(p => api.getOkxTicker(p).catch(() => null))
                );
                const valid = results.filter(r => r?.data?.length > 0).map(r => r.data[0]);
                setTickers(valid);
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="glass-card overflow-hidden">
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <TrendingUp size={14} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-surface-100">Market</h3>
            </div>
            {loading ? (
                <div className="p-6 flex justify-center"><Loader2 size={16} className="animate-spin text-surface-200/30" /></div>
            ) : (
                <div className="divide-y divide-white/5">
                    {tickers.map((t, i) => {
                        const isSelected = selected === t.instId;
                        const change = ((Number(t.last) - Number(t.open24h)) / Number(t.open24h) * 100) || 0;
                        return (
                            <button key={i} onClick={() => onSelect(t.instId)}
                                className={`w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-brand-500/5 border-l-2 border-brand-500' : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-surface-100">{t.instId}</p>
                                    <p className="text-[10px] text-surface-200/25">Vol: {Number(t.volCcy24h || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-surface-100">{formatPrice(t.last)}</p>
                                    {formatPct(change)}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── Order Form ── */
function OrderForm({ instId, hasKeys }) {
    const [side, setSide] = useState('buy');
    const [ordType, setOrdType] = useState('market');
    const [sz, setSz] = useState('');
    const [px, setPx] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const submit = async () => {
        if (!sz || Number(sz) <= 0) return;
        setLoading(true);
        setResult(null);
        setError(null);
        try {
            const params = { instId, side, ordType, sz, tgtCcy: 'quote_ccy' };
            if (ordType === 'limit' && px) params.px = px;
            const data = await api.placeOkxOrder(params);
            setResult(data);
            useToastStore.getState().success(`✓ Order ${side} ${instId} placed`);
        } catch (err) {
            setError(err.msg || err.message);
            useToastStore.getState().error(err.msg || err.message || 'Order failed');
        }
        setLoading(false);
    };

    if (!hasKeys) return null;

    return (
        <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <ShoppingCart size={14} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-surface-100">Place Order</h3>
                <span className="text-[9px] text-surface-200/25 ml-auto">{instId}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setSide('buy')}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors ${side === 'buy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-surface-800/40 text-surface-200/40 border border-white/5'}`}>
                    Buy
                </button>
                <button onClick={() => setSide('sell')}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors ${side === 'sell' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-surface-800/40 text-surface-200/40 border border-white/5'}`}>
                    Sell
                </button>
            </div>

            <div className="flex gap-2 mb-3">
                {['market', 'limit'].map(t => (
                    <button key={t} onClick={() => setOrdType(t)}
                        className={`px-3 py-1.5 rounded text-[10px] capitalize transition-colors ${ordType === t ? 'bg-brand-500/15 text-brand-400' : 'text-surface-200/30'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {ordType === 'limit' && (
                <div className="mb-3">
                    <label className="text-[9px] text-surface-200/30 uppercase mb-1 block">Price</label>
                    <input type="number" value={px} onChange={e => setPx(e.target.value)}
                        placeholder="Limit price" className="input-field text-xs py-2 w-full" />
                </div>
            )}

            <div className="mb-3">
                <label className="text-[9px] text-surface-200/30 uppercase mb-1 block">Amount (USDT)</label>
                <input type="number" value={sz} onChange={e => setSz(e.target.value)}
                    placeholder="e.g. 100" className="input-field text-xs py-2 w-full" />
                <div className="flex gap-1.5 mt-1.5">
                    {['10', '50', '100', '500'].map(v => (
                        <button key={v} onClick={() => setSz(v)}
                            className="px-2 py-0.5 rounded text-[9px] bg-surface-800/40 text-surface-200/30 hover:text-surface-200/60 border border-white/5 transition-colors">
                            ${v}
                        </button>
                    ))}
                </div>
            </div>

            <button onClick={submit} disabled={loading || !sz}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors ${side === 'buy'
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    }`}>
                {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> :
                    `${side === 'buy' ? 'Buy' : 'Sell'} ${instId?.split('-')[0] || ''}`}
            </button>

            {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
            {result?.data?.[0]?.ordId && (
                <p className="text-xs text-emerald-400 text-center mt-2">
                    ✓ Order placed: {result.data[0].ordId}
                </p>
            )}
        </div>
    );
}

/* ── Open Orders ── */
function OpenOrders({ hasKeys }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!hasKeys) return;
        try {
            const data = await api.getOkxOpenOrders('SPOT');
            setOrders(data.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, [hasKeys]);

    useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

    if (!hasKeys) return null;

    return (
        <div className="glass-card overflow-hidden">
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <Clock size={14} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-surface-100">Open Orders</h3>
                <span className="text-[9px] text-surface-200/20 ml-auto">{orders.length}</span>
            </div>
            {loading ? (
                <div className="p-6 flex justify-center"><Loader2 size={14} className="animate-spin text-surface-200/30" /></div>
            ) : orders.length === 0 ? (
                <div className="p-6 text-center text-xs text-surface-200/25">No open orders</div>
            ) : (
                <div className="divide-y divide-white/5">
                    {orders.map((o, i) => {
                        const isBuy = o.side === 'buy';
                        return (
                            <div key={i} className="px-3 py-2.5 flex items-center gap-3">
                                <span className={`text-[9px] font-bold uppercase ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {o.side}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-surface-100">{o.instId}</p>
                                    <p className="text-[10px] text-surface-200/25">{o.ordType} · {o.sz} @ {o.px || 'MKT'}</p>
                                </div>
                                <button onClick={async () => {
                                    try { await api.cancelOkxOrder(o.instId, o.ordId); load(); } catch { }
                                }} className="p-1 rounded hover:bg-red-500/10 text-surface-200/20 hover:text-red-400 transition-colors">
                                    <XIcon size={10} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── Main OKX Trading Page ── */
export default function OKXTradingPage() {
    const { t } = useTranslation();
    const [keyStatus, setKeyStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showSetup, setShowSetup] = useState(false);
    const [selectedPair, setSelectedPair] = useState('BTC-USDT');

    const checkKeys = useCallback(async () => {
        try {
            const data = await api.getOkxKeyStatus();
            setKeyStatus(data);
        } catch { setKeyStatus({ exists: false }); }
        setLoading(false);
    }, []);

    useEffect(() => { checkKeys(); }, [checkKeys]);

    const hasKeys = keyStatus?.exists;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-brand-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                        <BarChart3 size={22} className="text-brand-400" />
                        OKX Trading
                    </h1>
                    <p className="text-xs text-surface-200/40 mt-0.5">
                        {hasKeys
                            ? `${keyStatus.demo ? 'Demo' : 'Live'} · ${(keyStatus.site || 'global').toUpperCase()}`
                            : 'Not connected'}
                    </p>
                </div>
                <div className="flex gap-2">
                    {hasKeys && (
                        <button onClick={() => setShowSetup(true)} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                            <Settings size={12} /> Keys
                        </button>
                    )}
                </div>
            </div>

            {!hasKeys ? (
                <SetupRequired onSetup={() => setShowSetup(true)} />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    {/* Left: Ticker list */}
                    <div className="lg:col-span-1 space-y-4">
                        <TickerList onSelect={setSelectedPair} selected={selectedPair} />
                    </div>

                    {/* Center: Order form + Open orders */}
                    <div className="lg:col-span-1 space-y-4">
                        <OrderForm instId={selectedPair} hasKeys={hasKeys} />
                        <OpenOrders hasKeys={hasKeys} />
                    </div>

                    {/* Right: Balance */}
                    <div className="lg:col-span-2 space-y-4">
                        <BalanceCard creds={keyStatus} />
                    </div>
                </div>
            )}

            {/* Setup modal */}
            {showSetup && (
                <OKXSetupModal onClose={() => setShowSetup(false)} onSaved={checkKeys} />
            )}
        </div>
    );
}
