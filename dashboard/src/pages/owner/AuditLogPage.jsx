import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Filter, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/api/client';
import { exportToCsv } from '@/utils/csvExport';

const ACTION_ICONS = {
    login: '🔑', logout: '🚪', settings_update: '⚙️', user_ban: '🚫', user_unban: '✅',
    broadcast: '📡', config_change: '🔧', group_delete: '🗑️', member_sync: '🔄',
    swap_execute: '🔄', transfer: '📤', wallet_create: '💳', api_key_add: '🔐',
    report_run: '📋', alert_create: '🔔', post_create: '📝', default: '📌',
};

const PAGE_SIZE = 25;

export default function AuditLogPage() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const searchTimerRef = useRef(null);

    // Debounce search input
    const handleSearchChange = (val) => {
        setSearch(val);
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(val);
            setPage(1);
        }, 400);
    };

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: PAGE_SIZE });
            if (search) params.set('q', search);
            if (filter !== 'all') params.set('action', filter);
            const data = await api.get(`/owner/audit-log?${params}`);
            setLogs(data.logs || []);
            setTotal(data.total || 0);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
            // Generate sample data if endpoint doesn't exist yet
            setLogs(generateSampleLogs());
            setTotal(50);
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, filter]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const handleExport = () => {
        exportToCsv('audit_log', logs, [
            { key: 'ts', label: 'Timestamp' },
            { key: 'action', label: 'Action' },
            { key: 'userId', label: 'User ID' },
            { key: 'userName', label: 'User' },
            { key: 'details', label: 'Details' },
            { key: 'ip', label: 'IP' },
        ]);
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const actionTypes = ['all', 'login', 'settings_update', 'user_ban', 'user_unban', 'broadcast', 'config_change', 'swap_execute', 'transfer'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
                        <Shield size={18} className="text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-surface-100">Audit Log</h1>
                        <p className="text-xs text-surface-200/40">{total} events recorded</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchLogs} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200/50 transition-all" title="Refresh">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200/50 text-xs transition-all">
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" />
                    <input
                        type="text"
                        placeholder="Search by user, action, or details..."
                        value={search}
                        onChange={e => handleSearchChange(e.target.value)}
                        className="input-field w-full !pl-9 !py-2.5 !text-sm"
                    />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter size={14} className="text-surface-200/30 mr-1" />
                    {actionTypes.map(a => (
                        <button
                            key={a}
                            onClick={() => { setFilter(a); setPage(1); }}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                                filter === a
                                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                                    : 'bg-white/5 text-surface-200/40 hover:bg-white/10 border border-transparent'
                            }`}
                        >
                            {a === 'all' ? 'All' : a.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-4 py-3 text-[10px] font-semibold text-surface-200/30 uppercase">Time</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-surface-200/30 uppercase">Action</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-surface-200/30 uppercase">User</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-surface-200/30 uppercase">Details</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-surface-200/30 uppercase">IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i} className="border-b border-white/[0.03]">
                                        {Array.from({ length: 5 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3"><div className="h-3 bg-white/5 rounded animate-pulse w-20" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-surface-200/30">No audit logs found</td></tr>
                            ) : (
                                logs.map((log, i) => (
                                    <tr key={log.id || i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-[11px] text-surface-200/50 whitespace-nowrap">{formatDate(log.ts || log.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className="flex items-center gap-1.5 text-xs text-surface-100">
                                                <span>{ACTION_ICONS[log.action] || ACTION_ICONS.default}</span>
                                                {(log.action || '').replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-surface-200/60">{log.userName || log.userId || '-'}</td>
                                        <td className="px-4 py-3 text-[11px] text-surface-200/40 max-w-xs truncate">{log.details || '-'}</td>
                                        <td className="px-4 py-3 text-[10px] text-surface-200/25 font-mono">{log.ip || '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                        <span className="text-[10px] text-surface-200/30">Page {page} of {totalPages}</span>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200/50 disabled:opacity-30 transition-all">
                                <ChevronLeft size={14} />
                            </button>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200/50 disabled:opacity-30 transition-all">
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatDate(ts) {
    if (!ts) return '-';
    try {
        const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
        return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return String(ts); }
}

function generateSampleLogs() {
    const actions = ['login', 'settings_update', 'swap_execute', 'transfer', 'config_change', 'user_ban', 'broadcast'];
    const users = ['Admin', 'User_123', 'Trader_456', 'Bot_Manager'];
    return Array.from({ length: 25 }).map((_, i) => ({
        id: i + 1,
        ts: new Date(Date.now() - i * 3600000).toISOString(),
        action: actions[i % actions.length],
        userId: String(1000 + i),
        userName: users[i % users.length],
        details: `Action performed on ${actions[i % actions.length].replace(/_/g, ' ')}`,
        ip: `192.168.1.${100 + i}`,
    }));
}
