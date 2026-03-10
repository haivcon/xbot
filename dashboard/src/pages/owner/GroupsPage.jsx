import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { MessageSquare, Search, Settings, RefreshCw, Users as UsersIcon } from 'lucide-react';

export default function GroupsPage() {
    const { t } = useTranslation();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const data = await api.getGroups({ search });
            setGroups(data.groups || []);
        } catch {
            // handled
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGroups(); }, []);

    const filtered = search
        ? groups.filter(g => (g.title || '').toLowerCase().includes(search.toLowerCase()) || (g.chatId || '').includes(search))
        : groups;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.groups.title')}</h1>
                <button onClick={fetchGroups} className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Stats */}
            <div className="stat-card inline-flex">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                        <MessageSquare size={20} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-xs text-surface-200/50">{t('dashboard.groups.total')}</p>
                        <p className="text-2xl font-bold text-surface-100">{groups.length}</p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('dashboard.groups.searchPlaceholder')}
                    className="input-field !pl-10 !py-2 !text-sm"
                />
            </div>

            {/* Groups grid */}
            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card p-8 text-center text-surface-200/40">{t('dashboard.groups.noGroups')}</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((g) => (
                        <div key={g.chatId} className="glass-card-hover p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-surface-100 truncate">{g.title || 'Unknown'}</h3>
                                    <p className="text-xs text-surface-200/40 font-mono mt-0.5">{g.chatId}</p>
                                </div>
                                <span className="badge-info text-[10px]">{g.type || 'group'}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-surface-200/50">
                                <div className="flex items-center gap-1">
                                    <UsersIcon size={12} />
                                    <span>{g.memberCount || '?'} {t('dashboard.groups.members')}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Settings size={12} />
                                    <span>{t('dashboard.groups.settings')}</span>
                                </div>
                            </div>
                            {g.lang && (
                                <div className="mt-3">
                                    <span className="badge-info text-[10px]">{g.lang}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
