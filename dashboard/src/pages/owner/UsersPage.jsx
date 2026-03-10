import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { Users, Search, ShieldX, Shield, Crown, RefreshCw } from 'lucide-react';

export default function UsersPage() {
    const { t } = useTranslation();
    const [users, setUsers] = useState([]);
    const [bannedUsers, setBannedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('all'); // 'all' | 'banned'

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

    const formatDate = (ts) => ts ? new Date(ts).toLocaleDateString() : '—';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.users.title')}</h1>
                <button onClick={fetchData} className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
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
                        onClick={() => setTab('all')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                    >
                        {t('dashboard.users.active')} ({users.length})
                    </button>
                    <button
                        onClick={() => setTab('banned')}
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
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">ID</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Name</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.language')}</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.lastSeen')}</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-8 text-surface-200/40">{t('dashboard.common.loading')}</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-surface-200/40">{t('dashboard.users.noUsers')}</td></tr>
                            ) : (
                                filteredUsers.map((u) => (
                                    <tr key={u.chatId || u.userId} className="table-row">
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
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
