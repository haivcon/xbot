import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, Clock, Hash } from 'lucide-react';

export default function AlertsPage() {
    const { t } = useTranslation();
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newToken, setNewToken] = useState({ tokenAddress: '', tokenLabel: '', intervalSeconds: 300 });

    const fetchAlerts = async () => {
        try {
            setLoading(true);
            const data = await api.get('/owner/alerts');
            setAlerts(data.alerts || []);
        } catch { /* handled */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchAlerts(); }, []);

    const handleAdd = async () => {
        if (!newToken.tokenAddress || !newToken.tokenLabel) return;
        await api.post('/owner/alerts', newToken);
        setNewToken({ tokenAddress: '', tokenLabel: '', intervalSeconds: 300 });
        setShowAdd(false);
        fetchAlerts();
    };

    const handleToggle = async (alert) => {
        await api.put(`/owner/alerts/${alert.id}`, { enabled: !alert.enabled });
        fetchAlerts();
    };

    const handleDelete = async (id) => {
        if (!confirm(t('dashboard.common.confirm'))) return;
        await api.delete(`/owner/alerts/${id}`);
        fetchAlerts();
    };

    const formatInterval = (s) => {
        if (s >= 3600) return `${Math.floor(s / 3600)}h`;
        return `${Math.floor(s / 60)}m`;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.alerts')}</h1>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2 !py-2 !text-sm">
                        <Plus size={14} /> {t('dashboard.common.create')}
                    </button>
                    <button onClick={fetchAlerts} className="btn-secondary !py-2 !px-3">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Add form */}
            {showAdd && (
                <div className="glass-card p-5 space-y-4 animate-fade-in">
                    <h3 className="font-semibold text-surface-100">Add Price Alert Token</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">Token Label</label>
                            <input
                                value={newToken.tokenLabel}
                                onChange={e => setNewToken(p => ({ ...p, tokenLabel: e.target.value }))}
                                placeholder="e.g. BTC"
                                className="input-field !py-2 !text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">Token Address (CA)</label>
                            <input
                                value={newToken.tokenAddress}
                                onChange={e => setNewToken(p => ({ ...p, tokenAddress: e.target.value }))}
                                placeholder="0x..."
                                className="input-field !py-2 !text-sm font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">Interval (seconds)</label>
                            <select
                                value={newToken.intervalSeconds}
                                onChange={e => setNewToken(p => ({ ...p, intervalSeconds: Number(e.target.value) }))}
                                className="input-field !py-2 !text-sm"
                            >
                                <option value={60}>1 min</option>
                                <option value={300}>5 min</option>
                                <option value={600}>10 min</option>
                                <option value={1800}>30 min</option>
                                <option value={3600}>1 hour</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleAdd} className="btn-primary !py-2 !text-sm">{t('dashboard.common.save')}</button>
                        <button onClick={() => setShowAdd(false)} className="btn-secondary !py-2 !text-sm">{t('dashboard.common.cancel')}</button>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="flex gap-4">
                <div className="stat-card flex-1">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                            <Bell size={20} className="text-brand-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">Total Alerts</p>
                            <p className="text-2xl font-bold text-surface-100">{alerts.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card flex-1">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <ToggleRight size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.common.enabled')}</p>
                            <p className="text-2xl font-bold text-surface-100">{alerts.filter(a => a.enabled).length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Alerts list */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Token</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Address</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium"><Clock size={14} className="inline" /> Interval</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Status</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-8 text-surface-200/40">{t('dashboard.common.loading')}</td></tr>
                            ) : alerts.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-surface-200/40">{t('dashboard.common.noData')}</td></tr>
                            ) : (
                                alerts.map(a => (
                                    <tr key={a.id} className="table-row">
                                        <td className="px-5 py-3">
                                            <span className="font-semibold text-surface-100">{a.tokenLabel || a.tokenSymbol || '?'}</span>
                                        </td>
                                        <td className="px-5 py-3 font-mono text-xs text-surface-200/60 max-w-[200px] truncate">{a.tokenAddress}</td>
                                        <td className="px-5 py-3 text-surface-200/60">{formatInterval(a.intervalSeconds)}</td>
                                        <td className="px-5 py-3">
                                            <button onClick={() => handleToggle(a)} className="transition-colors">
                                                {a.enabled ? (
                                                    <span className="badge-success">{t('dashboard.common.enabled')}</span>
                                                ) : (
                                                    <span className="badge-danger">{t('dashboard.common.disabled')}</span>
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-200/40 hover:text-red-400 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
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
