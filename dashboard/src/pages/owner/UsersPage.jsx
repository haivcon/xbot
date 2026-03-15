import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import { Users, Search, ShieldX, Shield, Crown, RefreshCw, Download, CheckSquare, Wallet } from 'lucide-react';

export default function UsersPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [users, setUsers] = useState([]);
    const [bannedUsers, setBannedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(searchParams.get('q') || '');
    const [tab, setTab] = useState('all'); // 'all' | 'banned'
    const [selected, setSelected] = useState(new Set());

    const switchTab = (newTab) => {
        setTab(newTab);
        setSelected(new Set()); // clear selections on tab change
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [u, b] = await Promise.all([
                api.getUsers({ search }),
                api.getBannedUsers(),
            ]);
            setUsers(u.users || []);
            setBannedUsers(b.users || []);
        } catch {
            // error handled in api client
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredUsers = tab === 'banned' ? bannedUsers :
        (search ? users.filter(u =>
            (u.firstName || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.chatId || '').includes(search)
        ) : users);

    const handleBan = async (userId) => {
        if (!confirm(t('dashboard.common.confirm'))) return;
        await api.banUser(userId, 'Banned from dashboard');
        fetchData();
    };

    const handleUnban = async (userId) => {
        await api.unbanUser(userId);
        fetchData();
    };

    // Bulk actions
    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === filteredUsers.length) setSelected(new Set());
        else setSelected(new Set(filteredUsers.map(u => u.chatId || u.userId)));
    };

    const handleBulkBan = async () => {
        if (!selected.size || !confirm(t('dashboard.users.confirmBulkBan', { count: selected.size }))) return;
        for (const id of selected) {
            try { await api.banUser(id, 'Bulk banned from dashboard'); } catch {}
        }
        setSelected(new Set());
        fetchData();
    };

    const handleBulkUnban = async () => {
        if (!selected.size || !confirm(t('dashboard.users.confirmBulkUnban', { count: selected.size }))) return;
        for (const id of selected) {
            try { await api.unbanUser(id); } catch {}
        }
        setSelected(new Set());
        fetchData();
    };

    const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.users.title')}</h1>
                <div className="flex gap-2">
                    <button onClick={() => {
                        if (!users.length) return;
                        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
                        const header = 'Name,Username,UserID,Language,LastSeen,Status';
                        const rows = users.map(u =>
                            [
                                esc(u.firstName || u.username || '-'),
                                esc(u.username || '-'),
                                esc(u.chatId || u.userId),
                                esc(u.lang || 'en'),
                                esc(u.lastSeen ? new Date(u.lastSeen * 1000).toISOString() : '-'),
                                bannedUsers.some(b => b.userId === u.chatId) ? 'Banned' : 'Active',
                            ].join(',')
                        );
                        const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'users_export.csv'; a.click();
                        URL.revokeObjectURL(url);
                    }} disabled={!users.length} className="btn-secondary flex items-center gap-1.5 !py-2 !px-3.5 !text-sm disabled:opacity-30">
                        <Download size={14} /> CSV
                    </button>
                    <button onClick={fetchData} className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                            <Users size={20} className="text-brand-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.total')}</p>
                            <p className="text-2xl font-bold text-surface-100">{users.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <Shield size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.active')}</p>
                            <p className="text-2xl font-bold text-surface-100">{users.length - bannedUsers.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                            <ShieldX size={20} className="text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.banned')}</p>
                            <p className="text-2xl font-bold text-surface-100">{bannedUsers.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex bg-surface-800/50 rounded-xl p-1 self-start">
                    <button
                        onClick={() => switchTab('all')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                    >
                        {t('dashboard.users.active')} ({users.length})
                    </button>
                    <button
                        onClick={() => switchTab('banned')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'banned' ? 'bg-red-500/20 text-red-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                    >
                        {t('dashboard.users.banned')} ({bannedUsers.length})
                    </button>
                </div>
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('dashboard.users.searchPlaceholder')}
                        className="input-field !pl-10 !py-2 !text-sm"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-3 py-3 w-10">
                                    <input type="checkbox" checked={selected.size === filteredUsers.length && filteredUsers.length > 0}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-white/20 bg-white/5 accent-brand-500 cursor-pointer" />
                                </th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">ID</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Name</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.language')}</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.lastSeen')}</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.walletLimit', 'Wallet Limit')}</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-8 text-surface-200/40">{t('dashboard.common.loading')}</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-surface-200/40">{t('dashboard.users.noUsers')}</td></tr>
                            ) : (
                                filteredUsers.map((u) => {
                                    const uid = u.chatId || u.userId;
                                    return (
                                    <tr key={uid} className={`table-row ${selected.has(uid) ? 'bg-brand-500/[0.04]' : ''}`}>
                                        <td className="px-3 py-3">
                                            <input type="checkbox" checked={selected.has(uid)}
                                                onChange={() => toggleSelect(uid)}
                                                className="w-4 h-4 rounded border-white/20 bg-white/5 accent-brand-500 cursor-pointer" />
                                        </td>
                                        <td className="px-5 py-3 font-mono text-xs text-surface-200/60">{u.chatId || u.userId}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-surface-100 font-medium">{u.firstName || u.username || '—'}</span>
                                                {u.username && <span className="text-surface-200/40 text-xs">@{u.username}</span>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-surface-200/60">{u.lang || 'en'}</td>
                                        <td className="px-5 py-3 text-surface-200/60 text-xs">{formatDate(u.lastSeen)}</td>
                                        <td className="px-5 py-3 text-right">
                                            {tab !== 'banned' && (
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Wallet size={10} className="text-surface-200/30" />
                                                    <CustomSelect
                                                        value={u.walletLimit || 50}
                                                        onChange={async (val) => {
                                                            try {
                                                                await api.setUserWalletLimit(u.chatId || u.userId, parseInt(val, 10));
                                                                fetchData();
                                                            } catch {}
                                                        }}
                                                        size="sm"
                                                        className="w-20"
                                                        options={[50, 100, 200, 300, 500, 1000].map(n => ({ value: n, label: String(n) }))}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {tab === 'banned' ? (
                                                <button onClick={() => handleUnban(u.userId)} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
                                                    {t('dashboard.users.unban')}
                                                </button>
                                            ) : (
                                                <button onClick={() => handleBan(u.chatId)} className="text-xs text-red-400 hover:text-red-300 font-medium">
                                                    {t('dashboard.users.ban')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Floating Bulk Action Bar */}
            {selected.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s_ease] pointer-events-auto">
                    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface-800/95 border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl">
                        <CheckSquare size={16} className="text-brand-400" />
                        <span className="text-sm text-surface-100 font-medium">{t('dashboard.users.selectedCount', { count: selected.size })}</span>
                        <div className="w-px h-5 bg-white/10" />
                        {tab === 'banned' ? (
                            <button onClick={handleBulkUnban} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-all">
                                ✅ {t('dashboard.users.unbanAll', 'Unban All')}
                            </button>
                        ) : (
                            <button onClick={handleBulkBan} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-all">
                                🚫 {t('dashboard.users.banAll', 'Ban All')}
                            </button>
                        )}
                        <button onClick={() => setSelected(new Set())} className="px-2 py-1.5 rounded-lg text-surface-200/40 hover:text-surface-200/70 text-xs transition-all">
                            {t('dashboard.common.cancel', 'Cancel')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
