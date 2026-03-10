import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import config from '@/config';
import { ArrowUpDown, TrendingUp, TrendingDown, RefreshCw, ExternalLink } from 'lucide-react';

export default function TradingPage() {
    const { t } = useTranslation();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const data = await api.getTradingHistory({ limit: 50 });
            setHistory(data.history || []);
        } catch { /* handled */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchHistory(); }, []);

    const typeColors = {
        swap: 'badge-info',
        transfer: 'badge-success',
        batch_swap: 'badge-warning',
        batch_transfer: 'badge-danger',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.trading')}</h1>
                <button onClick={fetchHistory} className="btn-secondary !py-2 !px-3">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                            <ArrowUpDown size={20} className="text-brand-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">Total Txns</p>
                            <p className="text-2xl font-bold text-surface-100">{history.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <TrendingUp size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">Swaps</p>
                            <p className="text-2xl font-bold text-surface-100">{history.filter(h => h.type === 'swap').length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                            <TrendingDown size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">Transfers</p>
                            <p className="text-2xl font-bold text-surface-100">{history.filter(h => h.type === 'transfer').length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* History table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Type</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">From</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">To</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Amount</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Date</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">Tx</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-8 text-surface-200/40">{t('dashboard.common.loading')}</td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-surface-200/40">{t('dashboard.common.noData')}</td></tr>
                            ) : (
                                history.map((tx, i) => (
                                    <tr key={tx.id || i} className="table-row">
                                        <td className="px-5 py-3">
                                            <span className={typeColors[tx.type] || 'badge-info'}>{tx.type}</span>
                                        </td>
                                        <td className="px-5 py-3 text-surface-200/80 text-xs">{tx.fromSymbol || '—'}</td>
                                        <td className="px-5 py-3 text-surface-200/80 text-xs">{tx.toSymbol || '—'}</td>
                                        <td className="px-5 py-3 font-mono text-xs text-surface-100">
                                            {tx.fromAmount ? Number(tx.fromAmount).toFixed(4) : '—'}
                                            {tx.priceUsd ? <span className="text-surface-200/40 ml-1">(${tx.priceUsd.toFixed(2)})</span> : ''}
                                        </td>
                                        <td className="px-5 py-3 text-xs text-surface-200/50">
                                            {tx.createdAt ? new Date(tx.createdAt * 1000).toLocaleString() : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {tx.txHash ? (
                                                <a
                                                    href={`${config.explorerBaseUrl}/tx/${tx.txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1 inline-flex rounded hover:bg-white/5 text-brand-400 hover:text-brand-300 transition-colors"
                                                >
                                                    <ExternalLink size={12} />
                                                </a>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
