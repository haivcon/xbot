import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import useToastStore from '@/stores/toastStore';
import {
    MessageSquare, Search, Settings, RefreshCw, Users as UsersIcon, X, Send,
    Shield, Trash2, Download, ChevronRight, Loader2,
    Bell, BellOff, FileText, Ban, Zap, Gamepad2, TrendingUp, Clock, Radio, History
} from 'lucide-react';

const LANG_FLAGS = { en: '🇺🇸', vi: '🇻🇳', zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺', id: '🇮🇩' };

function timeAgo(ts, t) {
    if (!ts) return '—';
    const sec = Math.floor(Date.now() / 1000) - ts;
    if (sec < 60) return t?.('dashboard.groupDetail.timeJustNow') || 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}${t?.('dashboard.groupDetail.timeMin') || 'm ago'}`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}${t?.('dashboard.groupDetail.timeHour') || 'h ago'}`;
    return `${Math.floor(sec / 86400)}${t?.('dashboard.groupDetail.timeDay') || 'd ago'}`;
}

/* ═══════════════════════════════════════════════
   Group Detail Modal
   ═══════════════════════════════════════════════ */
function GroupDetailModal({ group, onClose, onDelete, onRefresh }) {
    const { t } = useTranslation();
    const toast = useToastStore();
    const [tab, setTab] = useState('settings');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detail, setDetail] = useState(null);
    const [message, setMessage] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const [msgSent, setMsgSent] = useState(false);
    const [rulesText, setRulesText] = useState('');
    const [blacklistInput, setBlacklistInput] = useState('');
    const [blacklist, setBlacklist] = useState([]);
    const [toggles, setToggles] = useState({ enableAi: true, enableGames: true, enableAlerts: true });
    const [subEnabled, setSubEnabled] = useState(false);
    const [subLang, setSubLang] = useState('en');
    const [activityLogs, setActivityLogs] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);

    const loadDetail = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getGroupDetail(group.chatId);
            setDetail(data);
            setRulesText(data.rules || '');
            setBlacklist(data.blacklist || []);
            setToggles({
                enableAi: data.settings?.enableAi !== false,
                enableGames: data.settings?.enableGames !== false,
                enableAlerts: data.settings?.enableAlerts !== false,
            });
            setSubEnabled(!!data.subscription);
            setSubLang(data.subscription?.lang || 'en');
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setLoading(false);
    }, [group.chatId]);

    useEffect(() => { loadDetail(); }, [loadDetail]);

    useEffect(() => {
        if (tab === 'activity') {
            setActivityLoading(true);
            api.getGroupActivity(group.chatId).then(r => setActivityLogs(r?.logs || [])).catch(() => {}).finally(() => setActivityLoading(false));
        }
    }, [tab, group.chatId]);

    const saveSettings = async () => {
        setSaving(true);
        try {
            await api.updateGroupSettings(group.chatId, {
                settings: toggles,
                rules: rulesText,
                blacklist,
                subscription: subEnabled ? { lang: subLang, minStake: 0 } : null,
            });
            onRefresh();
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSaving(false);
    };

    const sendMsg = async () => {
        if (!message.trim()) return;
        setSendingMsg(true);
        try {
            await api.sendGroupMessage(group.chatId, message.trim());
            setMsgSent(true);
            setMessage('');
            setTimeout(() => setMsgSent(false), 3000);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSendingMsg(false);
    };

    const addBlacklistWord = () => {
        const word = blacklistInput.trim().toLowerCase();
        if (word && !blacklist.includes(word)) {
            setBlacklist([...blacklist, word]);
            setBlacklistInput('');
        }
    };

    const removeBlacklistWord = (word) => {
        setBlacklist(blacklist.filter(w => w !== word));
    };

    const handleDelete = async () => {
        if (!confirm(t('dashboard.groupDetail.deleteConfirm') || 'Delete this group? This cannot be undone.')) return;
        try {
            await api.deleteGroup(group.chatId);
            onDelete();
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const tabs = [
        { id: 'settings', icon: Settings, label: t('dashboard.groupDetail.settings') || 'Settings' },
        { id: 'rules', icon: FileText, label: t('dashboard.groupDetail.rules') || 'Rules' },
        { id: 'filters', icon: Ban, label: t('dashboard.groupDetail.filters') || 'Filters' },
        { id: 'subscription', icon: Bell, label: t('dashboard.groupDetail.subscription') || 'Subscription' },
        { id: 'message', icon: Send, label: t('dashboard.groupDetail.sendMessage') || 'Message' },
        { id: 'activity', icon: History, label: t('dashboard.groupDetail.activity') || 'Activity' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-fadeIn" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-surface-100 truncate">{group.title || 'Unknown'}</h2>
                        <p className="text-xs text-surface-200/40 font-mono mt-0.5">{group.chatId}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                        <span className="badge-info text-[10px]">{group.type || 'group'}</span>
                        {group.lang && <span className="text-xs">{LANG_FLAGS[group.lang] || group.lang}</span>}
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-surface-200/40">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-2 overflow-x-auto">
                    {tabs.map(tb => (
                        <button key={tb.id} onClick={() => setTab(tb.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${tab === tb.id
                                ? 'border-brand-400 text-brand-400'
                                : 'border-transparent text-surface-200/40 hover:text-surface-200'
                            }`}>
                            <tb.icon size={12} /> {tb.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-brand-400" />
                        </div>
                    ) : (
                        <>
                            {/* Settings Tab */}
                            {tab === 'settings' && (
                                <div className="space-y-4">
                                    <p className="text-xs text-surface-200/40">{t('dashboard.groupDetail.settingsDesc') || 'Toggle bot features for this group'}</p>
                                    {[
                                        { key: 'enableAi', icon: Zap, label: t('dashboard.groupDetail.featureAi') || 'AI Chat', color: 'text-brand-400' },
                                        { key: 'enableGames', icon: Gamepad2, label: t('dashboard.groupDetail.featureGames') || 'Mini Games', color: 'text-emerald-400' },
                                        { key: 'enableAlerts', icon: TrendingUp, label: t('dashboard.groupDetail.featureAlerts') || 'Price Alerts', color: 'text-amber-400' },
                                    ].map(feat => (
                                        <div key={feat.key} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <feat.icon size={16} className={feat.color} />
                                                <span className="text-sm text-surface-100">{feat.label}</span>
                                            </div>
                                            <button onClick={() => setToggles(prev => ({ ...prev, [feat.key]: !prev[feat.key] }))}
                                                className={`w-10 h-5 rounded-full transition-all relative ${toggles[feat.key] ? 'bg-brand-500' : 'bg-surface-700'}`}>
                                                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${toggles[feat.key] ? 'left-[1.375rem]' : 'left-0.5'}`} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Member Languages */}
                                    {detail?.memberLanguages?.length > 0 && (
                                        <div className="mt-4">
                                            <h4 className="text-xs font-semibold text-surface-200/50 mb-2">
                                                {t('dashboard.groupDetail.memberLangs') || 'Member Languages'}
                                            </h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(
                                                    detail.memberLanguages.reduce((acc, m) => {
                                                        acc[m.lang] = (acc[m.lang] || 0) + 1;
                                                        return acc;
                                                    }, {})
                                                ).map(([lang, count]) => (
                                                    <span key={lang} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.03] text-surface-200/50">
                                                        {LANG_FLAGS[lang] || lang} {count}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Rules Tab */}
                            {tab === 'rules' && (
                                <div className="space-y-3">
                                    <p className="text-xs text-surface-200/40">{t('dashboard.groupDetail.rulesDesc') || 'Set group rules displayed by the bot'}</p>
                                    <textarea
                                        value={rulesText}
                                        onChange={e => setRulesText(e.target.value)}
                                        placeholder={t('dashboard.groupDetail.rulesPlaceholder') || 'Enter group rules...'}
                                        className="input-field w-full h-40 !text-sm resize-none"
                                    />
                                </div>
                            )}

                            {/* Filters Tab */}
                            {tab === 'filters' && (
                                <div className="space-y-3">
                                    <p className="text-xs text-surface-200/40">{t('dashboard.groupDetail.filtersDesc') || 'Blacklisted keywords will be auto-deleted'}</p>
                                    <div className="flex gap-2">
                                        <input
                                            value={blacklistInput}
                                            onChange={e => setBlacklistInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addBlacklistWord()}
                                            placeholder={t('dashboard.groupDetail.addKeyword') || 'Add keyword...'}
                                            className="input-field flex-1 !text-sm !py-2"
                                        />
                                        <button onClick={addBlacklistWord} className="btn-primary !text-xs !px-3 !py-2">+</button>
                                    </div>
                                    {blacklist.length === 0 ? (
                                        <p className="text-xs text-surface-200/25 text-center py-4">{t('dashboard.groupDetail.noFilters') || 'No blacklisted keywords'}</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {blacklist.map(word => (
                                                <span key={word} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs">
                                                    {word}
                                                    <button onClick={() => removeBlacklistWord(word)} className="hover:text-red-300">
                                                        <X size={10} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Subscription Tab */}
                            {tab === 'subscription' && (
                                <div className="space-y-4">
                                    <p className="text-xs text-surface-200/40">{t('dashboard.groupDetail.subDesc') || 'Enable signal/alert subscriptions for this group'}</p>
                                    <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
                                        <div className="flex items-center gap-3">
                                            {subEnabled ? <Bell size={16} className="text-brand-400" /> : <BellOff size={16} className="text-surface-200/30" />}
                                            <span className="text-sm text-surface-100">{t('dashboard.groupDetail.subToggle') || 'Signal Subscription'}</span>
                                        </div>
                                        <button onClick={() => setSubEnabled(!subEnabled)}
                                            className={`w-10 h-5 rounded-full transition-all relative ${subEnabled ? 'bg-brand-500' : 'bg-surface-700'}`}>
                                            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${subEnabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                    {subEnabled && (
                                        <div className="p-3 bg-white/[0.02] rounded-xl">
                                            <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.groupDetail.subLang') || 'Language'}</label>
                                            <CustomSelect value={subLang} onChange={setSubLang} size="sm"
                                                options={Object.entries(LANG_FLAGS).map(([code, flag]) => ({ value: code, label: `${flag} ${code.toUpperCase()}` }))} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Message Tab */}
                            {tab === 'message' && (
                                <div className="space-y-3">
                                    <p className="text-xs text-surface-200/40">{t('dashboard.groupDetail.msgDesc') || 'Send a message to this group via the bot'}</p>
                                    <textarea
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        placeholder={t('dashboard.groupDetail.msgPlaceholder') || 'Type your message (HTML supported)...'}
                                        className="input-field w-full h-28 !text-sm resize-none"
                                    />
                                    <button onClick={sendMsg} disabled={sendingMsg || !message.trim()} className="btn-primary text-xs flex items-center gap-2 disabled:opacity-30">
                                        {sendingMsg ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                        {t('dashboard.groupDetail.sendBtn') || 'Send Message'}
                                    </button>
                                    <p className="text-[10px] text-surface-200/30 mt-1">
                                        Telegram: {'<b> <i> <u> <s> <code> <pre> <a> <blockquote>'} • h1-h6 → bold, p → newline
                                    </p>
                                    {msgSent && <p className="text-xs text-emerald-400">✅ {t('dashboard.groupDetail.msgSent') || 'Message sent!'}</p>}
                                </div>
                            )}

                            {/* Activity Tab */}
                            {tab === 'activity' && (
                                <div className="space-y-2">
                                    {activityLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 size={20} className="animate-spin text-brand-400" />
                                        </div>
                                    ) : activityLogs.length === 0 ? (
                                        <p className="text-xs text-surface-200/25 text-center py-8">{t('dashboard.common.noData') || 'No activity yet'}</p>
                                    ) : (
                                        activityLogs.map((log, i) => (
                                            <div key={log.id || i} className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-xl">
                                                <span className="text-sm shrink-0">
                                                    {{'settings_update':'⚙️','message_sent':'💬','group_deleted':'🗑️','member_sync':'🔄','broadcast':'📡'}[log.action] || '📌'}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-surface-100">{log.action?.replace(/_/g, ' ')}</p>
                                                    {log.details && <p className="text-[10px] text-surface-200/40 mt-0.5 truncate">{log.details}</p>}
                                                </div>
                                                <span className="text-[10px] text-surface-200/30 shrink-0">{timeAgo(log.createdAt, t)}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-between">
                    <button onClick={handleDelete} className="text-xs text-red-400/60 hover:text-red-400 flex items-center gap-1 transition-colors">
                        <Trash2 size={12} /> {t('dashboard.groupDetail.deleteGroup') || 'Delete Group'}
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn-secondary !text-xs !px-4 !py-2">
                            {t('dashboard.common.cancel') || 'Cancel'}
                        </button>
                        <button onClick={saveSettings} disabled={saving} className="btn-primary !text-xs !px-4 !py-2 flex items-center gap-1.5">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                            {t('dashboard.common.save') || 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════
   Group Card
   ═══════════════════════════════════════════════ */
function GroupCard({ group, onClick, onSync }) {
    const { t } = useTranslation();
    const [syncing, setSyncing] = useState(false);

    const handleSync = async (e) => {
        e.stopPropagation();
        setSyncing(true);
        await onSync(group.chatId);
        setSyncing(false);
    };

    return (
        <div onClick={onClick} className="glass-card-hover p-5 cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-surface-100 truncate">{group.title || 'Unknown'}</h3>
                    <p className="text-xs text-surface-200/40 font-mono mt-0.5">{group.chatId}</p>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                    <span className="badge-info text-[10px]">{group.type || 'group'}</span>
                    {group.subscription && <Bell size={10} className="text-brand-400" />}
                </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-surface-200/50">
                <button onClick={handleSync} className="flex items-center gap-1 hover:text-brand-400 transition-colors" title="Sync members">
                    {syncing ? <Loader2 size={12} className="animate-spin" /> : <UsersIcon size={12} />}
                    <span>{group.memberCount || '?'} {t('dashboard.groups.members')}</span>
                </button>
                {group.lang && <span>{LANG_FLAGS[group.lang] || group.lang}</span>}
                {group.hasRules && <FileText size={11} className="text-surface-200/25" title="Has rules" />}
                {group.hasBlacklist && <Ban size={11} className="text-surface-200/25" title="Has filters" />}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                <div className="flex items-center gap-1 text-[10px] text-surface-200/25">
                    <Clock size={10} />
                    {timeAgo(group.updatedAt, t)}
                </div>
                <ChevronRight size={14} className="text-surface-200/15 group-hover:text-brand-400 transition-colors" />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════
   Main Groups Page
   ═══════════════════════════════════════════════ */
export default function GroupsPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const toast = useToastStore();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(searchParams.get('q') || '');
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [syncingAll, setSyncingAll] = useState(false);
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [broadcastText, setBroadcastText] = useState('');
    const [broadcasting, setBroadcasting] = useState(false);
    const [broadcastResult, setBroadcastResult] = useState(null);

    const fetchGroups = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getGroups();
            setGroups(data.groups || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    const filtered = search
        ? groups.filter(g => (g.title || '').toLowerCase().includes(search.toLowerCase()) || (g.chatId || '').includes(search))
        : groups;

    const stats = {
        total: groups.length,
        totalMembers: groups.reduce((sum, g) => sum + (g.memberCount || 0), 0),
        active: groups.filter(g => g.updatedAt && (Math.floor(Date.now() / 1000) - g.updatedAt) < 7 * 86400).length,
        subscribed: groups.filter(g => g.subscription).length,
    };

    const handleSync = async (chatId) => {
        try {
            const result = await api.syncGroupMembers(chatId);
            setGroups(prev => prev.map(g => g.chatId === chatId ? { ...g, memberCount: result.memberCount } : g));
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const handleSyncAll = async () => {
        setSyncingAll(true);
        for (const g of groups) {
            await handleSync(g.chatId);
        }
        setSyncingAll(false);
    };

    // CSV export
    const exportCsv = () => {
        if (!groups.length) return;
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        const header = 'Title,ChatID,Type,Members,Subscription,Language,HasRules,LastActive';
        const rows = groups.map(g =>
            [
                esc(g.title), esc(g.chatId), esc(g.type),
                g.memberCount || '?',
                g.subscription ? 'Yes' : 'No',
                esc(g.lang || '-'),
                g.hasRules ? 'Yes' : 'No',
                esc(g.updatedAt ? new Date(g.updatedAt * 1000).toISOString() : '-'),
            ].join(',')
        );
        const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'groups_export.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                    <MessageSquare size={22} className="text-brand-400" />
                    {t('dashboard.groups.title')}
                </h1>
                <div className="flex gap-2">
                    <button onClick={exportCsv} disabled={!groups.length} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 disabled:opacity-30">
                        <Download size={12} /> CSV
                    </button>
                    <button onClick={() => setShowBroadcast(true)} disabled={!groups.length} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 disabled:opacity-30">
                        <Radio size={12} /> {t('dashboard.groupDetail.broadcast') || 'Broadcast'}
                    </button>
                    <button onClick={handleSyncAll} disabled={syncingAll} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 disabled:opacity-50">
                        {syncingAll ? <Loader2 size={12} className="animate-spin" /> : <UsersIcon size={12} />} {t('dashboard.groupDetail.syncAll') || 'Sync All'}
                    </button>
                    <button onClick={fetchGroups} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: t('dashboard.groups.total') || 'Total Groups', value: stats.total, icon: '💬', color: 'text-surface-100' },
                    { label: t('dashboard.groupDetail.totalMembers') || 'Total Members', value: stats.totalMembers || '?', icon: '👥', color: 'text-brand-400' },
                    { label: t('dashboard.groupDetail.activeGroups') || 'Active (7d)', value: stats.active, icon: '🟢', color: 'text-emerald-400' },
                    { label: t('dashboard.groupDetail.subscribed') || 'Subscribed', value: stats.subscribed, icon: '🔔', color: 'text-amber-400' },
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
                    <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <MessageSquare size={40} className="mx-auto text-surface-200/15 mb-4" />
                    <h2 className="text-lg font-semibold text-surface-100 mb-2">{t('dashboard.groups.noGroups')}</h2>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((g) => (
                        <GroupCard
                            key={g.chatId}
                            group={g}
                            onClick={() => setSelectedGroup(g)}
                            onSync={handleSync}
                        />
                    ))}
                </div>
            )}

            {/* Detail Modal */}
            {selectedGroup && (
                <GroupDetailModal
                    group={selectedGroup}
                    onClose={() => setSelectedGroup(null)}
                    onDelete={() => { setSelectedGroup(null); fetchGroups(); }}
                    onRefresh={fetchGroups}
                />
            )}

            {/* Broadcast Modal */}
            {showBroadcast && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-lg p-6 space-y-4 animate-fadeIn">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-surface-100 flex items-center gap-2">
                                <Radio size={18} className="text-brand-400" />
                                {t('dashboard.groupDetail.broadcast') || 'Broadcast'}
                            </h3>
                            <button onClick={() => { setShowBroadcast(false); setBroadcastResult(null); }} className="p-1 rounded-lg hover:bg-white/10 text-surface-200/50">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-surface-200/50">
                            {t('dashboard.groupDetail.broadcastDesc') || `Send a message to all ${groups.length} groups`}
                        </p>
                        <textarea
                            value={broadcastText}
                            onChange={(e) => setBroadcastText(e.target.value)}
                            placeholder={t('dashboard.groupDetail.msgPlaceholder') || 'Type message (HTML supported)...'}
                            className="input-field min-h-[120px] text-sm font-mono"
                            disabled={broadcasting}
                        />
                        {broadcastResult && (
                            <div className="text-sm p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                                ✅ {t('dashboard.groupDetail.broadcastDone') || 'Broadcast complete'}: {broadcastResult.sent}/{broadcastResult.total} {broadcastResult.failed > 0 ? `(${broadcastResult.failed} failed)` : ''}
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setShowBroadcast(false); setBroadcastResult(null); }} className="btn-secondary text-sm">
                                {t('dashboard.common.cancel') || 'Cancel'}
                            </button>
                            <button
                                onClick={async () => {
                                    if (!broadcastText.trim()) return;
                                    setBroadcasting(true);
                                    setBroadcastResult(null);
                                    try {
                                        const result = await api.broadcastMessage(broadcastText.trim());
                                        setBroadcastResult(result);
                                        setBroadcastText('');
                                        toast.success(`Broadcast sent to ${result.sent}/${result.total} groups`);
                                    } catch (e) {
                                        toast.error(e?.message || 'Broadcast failed');
                                    }
                                    setBroadcasting(false);
                                }}
                                disabled={broadcasting || !broadcastText.trim()}
                                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                {broadcasting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                {broadcasting ? (t('dashboard.groupDetail.sending') || 'Sending...') : (t('dashboard.groupDetail.sendBtn') || 'Send')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
