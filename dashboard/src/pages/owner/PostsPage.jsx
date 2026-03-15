import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import { CalendarClock, Plus, Trash2, RefreshCw, Play, Pause, Edit3, X, Check } from 'lucide-react';

export default function PostsPage() {
    const { t } = useTranslation();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ content: '', scheduleTime: '08:00', repeatType: 'daily', timezone: 'Asia/Ho_Chi_Minh', chatId: '' });

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const data = await api.get('/owner/posts');
            setPosts(data.posts || []);
        } catch { /* handled */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchPosts(); }, []);

    const handleSave = async () => {
        if (!form.content || !form.chatId) return;
        if (editId) {
            await api.put(`/owner/posts/${editId}`, form);
        } else {
            await api.post('/owner/posts', form);
        }
        setForm({ content: '', scheduleTime: '08:00', repeatType: 'daily', timezone: 'Asia/Ho_Chi_Minh', chatId: '' });
        setShowAdd(false);
        setEditId(null);
        fetchPosts();
    };

    const handleEdit = (p) => {
        setForm({ content: p.content, scheduleTime: p.scheduleTime, repeatType: p.repeatType, timezone: p.timezone || 'UTC', chatId: p.chatId });
        setEditId(p.id);
        setShowAdd(true);
    };

    const handleToggle = async (p) => {
        await api.put(`/owner/posts/${p.id}`, { enabled: !p.enabled });
        fetchPosts();
    };

    const handleDelete = async (id) => {
        if (!confirm(t('dashboard.common.confirm'))) return;
        await api.delete(`/owner/posts/${id}`);
        fetchPosts();
    };

    const repeatLabels = { none: t('dashboard.postsPage.once', 'Once'), daily: t('dashboard.postsPage.daily', 'Daily'), weekly: t('dashboard.postsPage.weekly', 'Weekly'), monthly: t('dashboard.postsPage.monthly', 'Monthly') };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.posts')}</h1>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm({ content: '', scheduleTime: '08:00', repeatType: 'daily', timezone: 'Asia/Ho_Chi_Minh', chatId: '' }); }} className="btn-primary flex items-center gap-2 !py-2 !text-sm">
                        <Plus size={14} /> {t('dashboard.common.create')}
                    </button>
                    <button onClick={fetchPosts} className="btn-secondary !py-2 !px-3">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Add/Edit form */}
            {showAdd && (
                <div className="glass-card p-5 space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-surface-100">{editId ? t('dashboard.common.edit') : t('dashboard.common.create')}</h3>
                        <button onClick={() => { setShowAdd(false); setEditId(null); }} className="p-1 text-surface-200/40 hover:text-surface-200">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">{t('dashboard.postsPage.chatId', 'Group/Chat ID')}</label>
                            <input value={form.chatId} onChange={e => setForm(p => ({ ...p, chatId: e.target.value }))} placeholder="-100123456789" className="input-field !py-2 !text-sm font-mono" />
                        </div>
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">{t('dashboard.postsPage.scheduleTime', 'Schedule Time')}</label>
                            <input type="time" value={form.scheduleTime} onChange={e => setForm(p => ({ ...p, scheduleTime: e.target.value }))} className="input-field !py-2 !text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">{t('dashboard.postsPage.repeat', 'Repeat')}</label>
                            <CustomSelect value={form.repeatType} onChange={(val) => setForm(p => ({ ...p, repeatType: val }))} size="sm"
                                options={[
                                    { value: 'none', label: t('dashboard.postsPage.once', 'Once') },
                                    { value: 'daily', label: t('dashboard.postsPage.daily', 'Daily') },
                                    { value: 'weekly', label: t('dashboard.postsPage.weekly', 'Weekly') },
                                    { value: 'monthly', label: t('dashboard.postsPage.monthly', 'Monthly') },
                                ]} />
                        </div>
                        <div>
                            <label className="text-xs text-surface-200/50 mb-1 block">{t('dashboard.postsPage.timezone', 'Timezone')}</label>
                            <CustomSelect value={form.timezone} onChange={(val) => setForm(p => ({ ...p, timezone: val }))} size="sm"
                                options={[
                                    { value: 'Asia/Ho_Chi_Minh', label: 'Vietnam (UTC+7)' },
                                    { value: 'Asia/Shanghai', label: 'China (UTC+8)' },
                                    { value: 'Asia/Seoul', label: 'Korea (UTC+9)' },
                                    { value: 'Asia/Jakarta', label: 'Indonesia (UTC+7)' },
                                    { value: 'Europe/Moscow', label: 'Moscow (UTC+3)' },
                                    { value: 'UTC', label: 'UTC' },
                                ]} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-surface-200/50 mb-1 block">{t('dashboard.postsPage.content', 'Content')}</label>
                        <textarea
                            value={form.content}
                            onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                            placeholder={t('dashboard.postsPage.contentPlaceholder', 'Message content (supports HTML)')}
                            rows={4}
                            className="input-field !py-2 !text-sm resize-y"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="btn-primary !py-2 !text-sm flex items-center gap-1">
                            <Check size={14} /> {t('dashboard.common.save')}
                        </button>
                        <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn-secondary !py-2 !text-sm">{t('dashboard.common.cancel')}</button>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="stat-card inline-flex">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                        <CalendarClock size={20} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-xs text-surface-200/50">{t('dashboard.postsPage.totalPosts', 'Total Posts')}</p>
                        <p className="text-2xl font-bold text-surface-100">{posts.length}</p>
                    </div>
                </div>
            </div>

            {/* Posts list */}
            {loading ? (
                <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : posts.length === 0 ? (
                <div className="glass-card p-8 text-center text-surface-200/40">{t('dashboard.common.noData')}</div>
            ) : (
                <div className="space-y-3">
                    {posts.map(p => (
                        <div key={p.id} className="glass-card-hover p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-mono text-xs text-surface-200/40">{p.chatId}</span>
                                        <span className={p.enabled ? 'badge-success' : 'badge-danger'}>
                                            {p.enabled ? t('dashboard.common.enabled') : t('dashboard.common.disabled')}
                                        </span>
                                        <span className="badge-info text-[10px]">{repeatLabels[p.repeatType] || p.repeatType}</span>
                                        <span className="text-xs text-surface-200/40">⏰ {p.scheduleTime}</span>
                                    </div>
                                    <p className="text-sm text-surface-200/80 line-clamp-2 whitespace-pre-wrap">{p.content}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleToggle(p)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-surface-200 transition-colors">
                                        {p.enabled ? <Pause size={14} /> : <Play size={14} />}
                                    </button>
                                    <button onClick={() => handleEdit(p)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors">
                                        <Edit3 size={14} />
                                    </button>
                                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-200/40 hover:text-red-400 transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
