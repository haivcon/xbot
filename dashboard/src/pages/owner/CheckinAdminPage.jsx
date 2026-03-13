import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    CalendarCheck, Users, Settings, Trophy, Loader2, RefreshCw,
    ChevronDown, ChevronRight, Clock, Target, Zap, BarChart3,
    AlertCircle, CheckCircle, Save,
} from 'lucide-react';

const MODES = [
    { id: 'streak', label: '🔥 Streak' },
    { id: 'total', label: '📊 Total' },
    { id: 'points', label: '⭐ Points' },
    { id: 'longest', label: '🏆 Longest' },
];

export default function CheckinAdminPage() {
    const { t } = useTranslation();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [lbMode, setLbMode] = useState('streak');
    const [lbLoading, setLbLoading] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [saving, setSaving] = useState(false);

    const loadGroups = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.request('/owner/checkin/groups');
            setGroups(data?.groups || []);
        } catch (err) {
            console.error('Failed to load checkin groups:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    const toggleExpand = async (chatId) => {
        if (expanded === chatId) {
            setExpanded(null);
            setLeaderboard([]);
            return;
        }
        setExpanded(chatId);
        await loadLeaderboard(chatId, lbMode);
    };

    const loadLeaderboard = async (chatId, mode) => {
        setLbLoading(true);
        try {
            const data = await api.request(`/owner/checkin/leaderboard/${encodeURIComponent(chatId)}?mode=${mode}&limit=20`);
            setLeaderboard(data?.leaderboard || []);
        } catch (err) {
            console.error('Failed to load leaderboard:', err);
            setLeaderboard([]);
        } finally {
            setLbLoading(false);
        }
    };

    const startEdit = (group) => {
        setEditingGroup({
            chatId: group.chatId,
            dailyPoints: group.dailyPoints ?? 10,
            timezone: group.timezone || 'Asia/Ho_Chi_Minh',
            summaryWindow: group.summaryWindow ?? 7,
            autoMessageEnabled: group.autoMessageEnabled ?? 1,
        });
    };

    const saveGroupSettings = async () => {
        if (!editingGroup) return;
        setSaving(true);
        try {
            await api.request(`/owner/checkin/groups/${encodeURIComponent(editingGroup.chatId)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    dailyPoints: Number(editingGroup.dailyPoints),
                    timezone: editingGroup.timezone,
                    summaryWindow: Number(editingGroup.summaryWindow),
                    autoMessageEnabled: editingGroup.autoMessageEnabled ? 1 : 0,
                }),
            });
            setEditingGroup(null);
            await loadGroups();
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-white/5 flex items-center justify-center">
                        <CalendarCheck size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.checkinPage.title')}</h1>
                        <p className="text-xs text-surface-200/40">{t('dashboard.checkinPage.subtitle')}</p>
                    </div>
                </div>
                <button onClick={loadGroups} className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-surface-100 transition-colors">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={Users} label={t('dashboard.checkinPage.groups')} value={groups.length} color="text-blue-400" bg="bg-blue-400/10" />
                <StatCard icon={Zap} label={t('dashboard.checkinPage.autoMessageOn')} value={groups.filter(g => g.autoMessageEnabled).length} color="text-emerald-400" bg="bg-emerald-400/10" />
                <StatCard icon={Clock} label={t('dashboard.checkinPage.summaryEnabled')} value={groups.filter(g => g.summaryMessageEnabled).length} color="text-amber-400" bg="bg-amber-400/10" />
            </div>

            {/* Groups List */}
            {loading ? (
                <div className="glass-card p-8 flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin text-emerald-400" />
                    <span className="text-sm text-surface-200/40">{t('dashboard.checkinPage.loadingGroups')}</span>
                </div>
            ) : groups.length === 0 ? (
                <div className="glass-card p-8 text-center space-y-2">
                    <AlertCircle size={28} className="text-surface-200/20 mx-auto" />
                    <p className="text-sm text-surface-200/40">{t('dashboard.checkinPage.noGroups')}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {groups.map(group => (
                        <div key={group.chatId} className="glass-card overflow-visible">
                            {/* Group Header */}
                            <button onClick={() => toggleExpand(group.chatId)}
                                className="w-full text-left p-4 flex items-center justify-between hover:bg-white/3 transition-colors rounded-2xl">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-2 h-2 rounded-full ${group.autoMessageEnabled ? 'bg-emerald-400' : 'bg-surface-200/20'}`} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-surface-100 font-mono truncate">{group.chatId}</p>
                                        <div className="flex gap-3 text-[10px] text-surface-200/40 mt-0.5">
                                            <span>🕐 {group.timezone}</span>
                                            <span>⭐ {group.dailyPoints}pts</span>
                                            <span>📅 {group.summaryWindow}d window</span>
                                        </div>
                                    </div>
                                </div>
                                {expanded === group.chatId ? <ChevronDown size={16} className="text-surface-200/30" /> : <ChevronRight size={16} className="text-surface-200/30" />}
                            </button>

                            {/* Expanded Detail */}
                            {expanded === group.chatId && (
                                <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-3">
                                    {/* Settings */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <InfoPill icon={Target} label={t('dashboard.checkinPage.points')} value={group.dailyPoints} />
                                        <InfoPill icon={Clock} label={t('dashboard.checkinPage.timezone')} value={group.timezone} />
                                        <InfoPill icon={BarChart3} label={t('dashboard.checkinPage.summaryWindow')} value={`${group.summaryWindow}d`} />
                                        <InfoPill icon={CheckCircle} label={t('dashboard.checkinPage.autoMessage')} value={group.autoMessageEnabled ? t('dashboard.checkinPage.on') : t('dashboard.checkinPage.off')} />
                                    </div>

                                    {/* Quick Edit */}
                                    {editingGroup?.chatId === group.chatId ? (
                                        <div className="bg-surface-800/40 rounded-xl p-3 space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-surface-200/40 uppercase">{t('dashboard.checkinPage.dailyPoints')}</label>
                                                    <input type="number" value={editingGroup.dailyPoints}
                                                        onChange={e => setEditingGroup(p => ({ ...p, dailyPoints: e.target.value }))}
                                                        className="w-full bg-surface-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-surface-100" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-surface-200/40 uppercase">{t('dashboard.checkinPage.summaryWindow')}</label>
                                                    <input type="number" value={editingGroup.summaryWindow}
                                                        onChange={e => setEditingGroup(p => ({ ...p, summaryWindow: e.target.value }))}
                                                        className="w-full bg-surface-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-surface-100" />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={saveGroupSettings} disabled={saving}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow disabled:opacity-50 flex items-center gap-1">
                                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {t('dashboard.common.save')}
                                                </button>
                                                <button onClick={() => setEditingGroup(null)}
                                                    className="px-3 py-1.5 rounded-lg bg-surface-800/60 text-surface-200/50 text-xs hover:text-surface-100">{t('dashboard.common.cancel')}</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => startEdit(group)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800/40 text-xs text-surface-200/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                                            <Settings size={12} /> {t('dashboard.checkinPage.editSettings')}
                                        </button>
                                    )}

                                    {/* Leaderboard */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                                                <Trophy size={12} className="text-amber-400" /> {t('dashboard.checkinPage.leaderboard')}
                                            </h4>
                                            <div className="flex gap-1">
                                                {MODES.map(m => (
                                                    <button key={m.id} onClick={() => { setLbMode(m.id); loadLeaderboard(group.chatId, m.id); }}
                                                        className={`px-2 py-1 rounded-md text-[10px] transition-all ${lbMode === m.id ? 'bg-amber-500/15 text-amber-400' : 'text-surface-200/30 hover:bg-white/5'}`}>
                                                        {m.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {lbLoading ? (
                                            <div className="py-4 flex justify-center"><Loader2 size={14} className="animate-spin text-amber-400" /></div>
                                        ) : leaderboard.length === 0 ? (
                                            <p className="text-xs text-surface-200/30 text-center py-3">{t('dashboard.checkinPage.noData')}</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {leaderboard.slice(0, 10).map((entry, i) => (
                                                    <div key={entry.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/30 hover:bg-surface-800/50 transition-colors">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] w-5 text-center font-bold ${i < 3 ? 'text-amber-400' : 'text-surface-200/30'}`}>
                                                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                                                            </span>
                                                            <span className="text-xs text-surface-200/60 font-mono">{entry.userId}</span>
                                                        </div>
                                                        <div className="flex gap-3 text-[10px] text-surface-200/40">
                                                            <span>🔥{entry.streak || 0}</span>
                                                            <span>📊{entry.totalCheckins || 0}</span>
                                                            <span>⭐{entry.totalPoints || 0}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color, bg }) {
    return (
        <div className="glass-card p-3 space-y-1.5">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={14} className={color} />
            </div>
            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-bold text-surface-100">{value}</p>
        </div>
    );
}

function InfoPill({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-800/30">
            <Icon size={12} className="text-surface-200/30 flex-shrink-0" />
            <div className="min-w-0">
                <p className="text-[9px] text-surface-200/30 uppercase">{label}</p>
                <p className="text-xs text-surface-200/70 font-medium truncate">{String(value)}</p>
            </div>
        </div>
    );
}
