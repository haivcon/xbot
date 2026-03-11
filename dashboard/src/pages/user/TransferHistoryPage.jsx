import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    History, ArrowUpRight, ArrowDownLeft, RefreshCw, ExternalLink,
    Loader2, ChevronLeft, ChevronRight, Download, Filter, ArrowRightLeft
} from 'lucide-react';

const CHAIN_NAMES = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
const EXPLORERS = {
    '196': 'https://www.okx.com/web3/explorer/xlayer',
    '1': 'https://etherscan.io',
    '56': 'https://bscscan.com',
    '137': 'https://polygonscan.com',
    '42161': 'https://arbiscan.io',
    '8453': 'https://basescan.org'
};

const TYPE_CONFIG = {
    transfer_out: { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Sent' },
    transfer_in: { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Received' },
    swap: { icon: ArrowRightLeft, color: 'text-brand-400', bg: 'bg-brand-500/10', label: 'Swap' },
};

function shortAddr(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) +
        ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ── Transaction Row ── */
function TxRow({ tx }) {
    const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.swap;
    const Icon = cfg.icon;
    const explorer = EXPLORERS[tx.chainIndex] || EXPLORERS['196'];
    const chainName = CHAIN_NAMES[tx.chainIndex] || `#${tx.chainIndex}`;

    // Smart symbol: if stored as "?" or "Token", use contract short address instead
    const resolveSymbol = (sym, tokenAddr) => {
        if (!sym || sym === '?' || sym === 'Token') {
            return tokenAddr ? shortAddr(tokenAddr) : 'Unknown';
        }
        return sym;
    };
    const displaySymbol = resolveSymbol(tx.fromSymbol, tx.fromToken);

    // Smart amount formatting: avoid unnecessary decimals
    const fmtAmount = (val) => {
        const n = Number(val || 0);
        if (n === 0) return '0';
        if (Number.isInteger(n)) return n.toLocaleString();
        return n % 1 === 0 ? n.toLocaleString() : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    };

    // For transfers, toToken is actually the destination wallet address
    const isTransfer = tx.type === 'transfer_out' || tx.type === 'transfer_in';
    const destAddr = isTransfer ? tx.toToken : null;
    const isDestAddress = destAddr && destAddr.startsWith('0x') && destAddr.length === 42;

    return (
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group">
            {/* Icon */}
            <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={cfg.color} />
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[9px] text-surface-200/25 px-1.5 py-0.5 rounded bg-white/[0.03]">{chainName}</span>
                    {tx.gasUsed && (
                        <span className="text-[9px] text-surface-200/20" title="Gas used">⛽ {Number(tx.gasUsed).toLocaleString()}</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-surface-200/50">
                        {fmtAmount(tx.fromAmount)} {displaySymbol}
                    </span>
                    {isDestAddress && (
                        <>
                            <span className="text-[10px] text-surface-200/20">→</span>
                            <a
                                href={`${explorer}/address/${destAddr}`}
                                target="_blank"
                                rel="noopener"
                                className="text-[11px] text-brand-400/60 hover:text-brand-400 transition-colors"
                                title={destAddr}
                            >
                                {shortAddr(destAddr)}
                            </a>
                        </>
                    )}
                    {!isTransfer && tx.toSymbol && tx.toSymbol !== tx.fromSymbol && (
                        <>
                            <span className="text-[10px] text-surface-200/20">→</span>
                            <span className="text-[11px] text-surface-200/50">
                                {fmtAmount(tx.toAmount)} {resolveSymbol(tx.toSymbol, tx.toToken)}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Amount + Date */}
            <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-surface-100">
                    {tx.type === 'transfer_out' ? '-' : tx.type === 'transfer_in' ? '+' : ''}
                    {fmtAmount(tx.fromAmount)}
                    <span className="text-surface-200/40 text-xs ml-1">{displaySymbol}</span>
                </p>
                <p className="text-[10px] text-surface-200/30">{formatDate(tx.createdAt)}</p>
            </div>

            {/* Explorer link */}
            {tx.txHash && (
                <a
                    href={`${explorer}/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener"
                    className="p-1.5 rounded-lg text-surface-200/15 hover:text-brand-400 hover:bg-brand-500/10 transition-all opacity-0 group-hover:opacity-100"
                    title="View on explorer"
                >
                    <ExternalLink size={12} />
                </a>
            )}
        </div>
    );
}

/* ── Filter Bar ── */
function FilterBar({ filter, onFilterChange }) {
    const { t } = useTranslation();
    const types = [
        { key: 'all', label: t('dashboard.history.all') || 'All' },
        { key: 'transfer_out', label: t('dashboard.history.sent') || 'Sent' },
        { key: 'transfer_in', label: t('dashboard.history.received') || 'Received' },
        { key: 'swap', label: t('dashboard.history.swap') || 'Swap' },
    ];

    return (
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-xl p-1">
            {types.map(tp => (
                <button
                    key={tp.key}
                    onClick={() => onFilterChange(tp.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === tp.key
                        ? 'bg-brand-500/15 text-brand-400 shadow-sm'
                        : 'text-surface-200/50 hover:text-surface-200 hover:bg-white/5'
                        }`}
                >
                    {tp.label}
                </button>
            ))}
        </div>
    );
}

/* ── Main Page ── */
export default function TransferHistoryPage() {
    const { t } = useTranslation();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState('all');
    const LIMIT = 20;

    const loadHistory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getTxHistory(page, LIMIT);
            setTransactions(data.transactions || []);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [page]);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    const filtered = filter === 'all' ? transactions : transactions.filter(tx => tx.type === filter);

    // CSV export
    const exportCsv = () => {
        if (!filtered.length) return;
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        const header = 'Date,Type,From,To,Amount,Symbol,Chain,TxHash';
        const rows = filtered.map(tx =>
            [
                esc(formatDate(tx.createdAt)),
                esc(tx.type),
                esc(tx.fromSymbol),
                esc(tx.toSymbol),
                esc(tx.fromAmount),
                esc(tx.fromSymbol),
                esc(CHAIN_NAMES[tx.chainIndex] || tx.chainIndex),
                esc(tx.txHash || '-')
            ].join(',')
        );
        const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transfer_history_page${page}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const stats = {
        total: transactions.length,
        sent: transactions.filter(tx => tx.type === 'transfer_out').length,
        received: transactions.filter(tx => tx.type === 'transfer_in').length,
        swaps: transactions.filter(tx => tx.type === 'swap').length,
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                        <History size={22} className="text-brand-400" />
                        {t('dashboard.sidebar.history') || 'Transfer History'}
                    </h1>
                    <p className="text-xs text-surface-200/40 mt-0.5">
                        {t('dashboard.history.subtitle') || 'View all your on-chain transactions'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={exportCsv} disabled={!filtered.length} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 disabled:opacity-30">
                        <Download size={12} /> CSV
                    </button>
                    <button onClick={loadHistory} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                        <RefreshCw size={12} /> {t('dashboard.common.refresh') || 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: t('dashboard.history.total') || 'Total', value: stats.total, color: 'text-surface-100', icon: '📊' },
                    { label: t('dashboard.history.sent') || 'Sent', value: stats.sent, color: 'text-red-400', icon: '📤' },
                    { label: t('dashboard.history.received') || 'Received', value: stats.received, color: 'text-emerald-400', icon: '📥' },
                    { label: t('dashboard.history.swap') || 'Swaps', value: stats.swaps, color: 'text-brand-400', icon: '🔄' },
                ].map((s, i) => (
                    <div key={i} className="glass-card p-3.5 flex items-center gap-3">
                        <span className="text-xl">{s.icon}</span>
                        <div>
                            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-[10px] text-surface-200/40 uppercase tracking-wider">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter + Table */}
            <div className="glass-card overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-surface-200/30" />
                        <FilterBar filter={filter} onFilterChange={setFilter} />
                    </div>
                    <span className="text-[10px] text-surface-200/25">{filtered.length} {t('dashboard.history.items') || 'items'}</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-brand-400" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center">
                        <History size={40} className="mx-auto text-surface-200/15 mb-4" />
                        <h2 className="text-lg font-semibold text-surface-100 mb-2">
                            {t('dashboard.history.empty') || 'No transactions yet'}
                        </h2>
                        <p className="text-sm text-surface-200/40 max-w-sm mx-auto">
                            {t('dashboard.history.emptyHint') || 'Your transfer and swap history will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.03]">
                        {filtered.map((tx, i) => (
                            <TxRow key={tx.id || i} tx={tx} />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {transactions.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="btn-secondary text-xs flex items-center gap-1 px-3 py-1.5 disabled:opacity-20"
                        >
                            <ChevronLeft size={12} /> {t('dashboard.common.prev') || 'Prev'}
                        </button>
                        <span className="text-xs text-surface-200/40">
                            {t('dashboard.common.page') || 'Page'} {page}
                        </span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={transactions.length < LIMIT}
                            className="btn-secondary text-xs flex items-center gap-1 px-3 py-1.5 disabled:opacity-20"
                        >
                            {t('dashboard.common.next') || 'Next'} <ChevronRight size={12} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
