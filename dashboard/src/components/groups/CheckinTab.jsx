import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Target, Clock, BarChart3, Zap, Settings, Trophy, Loader2, Save } from 'lucide-react';
import useToastStore from '@/stores/toastStore';
import api from '@/api/client';

// LB_MODES moved inside component for i18n

export default function CheckinTab({ group, onRefresh }) {
    const { t } = useTranslation();
    const toast = useToastStore();

    const LB_MODES = [
        { id: 'streak', label: '🔥 ' + (t('dashboard.checkinPage.streak') || 'Streak') },
        { id: 'monthly', label: '📅 ' + (t('dashboard.checkinPage.monthly') || 'Month') },
        { id: 'alltime', label: '🏆 ' + (t('dashboard.checkinPage.allTime') || 'All-Time') },
    ];
    
    const [checkinSettings, setCheckinSettings] = useState(null);
    const [checkinLoading, setCheckinLoading] = useState(true);
    const [editingCheckin, setEditingCheckin] = useState(null);
    const [savingCheckin, setSavingCheckin] = useState(false);
    
    const [leaderboard, setLeaderboard] = useState([]);
    const [lbMode, setLbMode] = useState('streak');
    const [lbLoading, setLbLoading] = useState(false);

    const loadCheckin = useCallback(async () => {
        setCheckinLoading(true);
        try {
            // Because of our backend patch, this works for both Users and Owners
            const data = await api.getUserGroupCheckin(group.chatId);
            setCheckinSettings(data?.settings || {});
        } catch {
            setCheckinSettings({});
        } finally {
            setCheckinLoading(false);
        }
    }, [group.chatId]);

    const loadLeaderboard = useCallback(async (mode = lbMode) => {
        setLbLoading(true);
        try {
            const data = await api.getUserGroupCheckinLeaderboard(group.chatId, mode);
            setLeaderboard(data?.leaderboard || []);
        } catch {
            setLeaderboard([]);
        } finally {
            setLbLoading(false);
        }
    }, [group.chatId, lbMode]);

    useEffect(() => {
        loadCheckin();
        loadLeaderboard();
    }, [loadCheckin, loadLeaderboard]);

    const saveCheckinSettings = async () => {
        setSavingCheckin(true);
        try {
            const updated = await api.updateUserGroupCheckin(group.chatId, {
                ...editingCheckin,
                dailyPoints: Number(editingCheckin.dailyPoints),
                summaryWindow: Number(editingCheckin.summaryWindow)
            });
            setCheckinSettings(updated?.settings || editingCheckin);
            setEditingCheckin(null);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            if (onRefresh) onRefresh();
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
        setSavingCheckin(false);
    };

    if (checkinLoading) {
        return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-emerald-400" /></div>;
    }

    if (!checkinSettings?.chatId) {
        return (
            <div className="text-center py-8 space-y-2">
                <AlertCircle size={28} className="text-surface-200/20 mx-auto" />
                <p className="text-sm text-surface-200/40">{t('dashboard.userGroups.checkinNotEnabled') || 'Check-in not enabled for this group. Use /checkinadmin in the group to set up.'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Checkin Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-800/30">
                    <Target size={12} className="text-surface-200/30 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[9px] text-surface-200/30 uppercase">{t('dashboard.checkinPage.points') || 'Points'}</p>
                        <p className="text-xs text-surface-200/70 font-medium">{checkinSettings.dailyPoints}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-800/30">
                    <Clock size={12} className="text-surface-200/30 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[9px] text-surface-200/30 uppercase">{t('dashboard.checkinPage.timezone') || 'Timezone'}</p>
                        <p className="text-xs text-surface-200/70 font-medium truncate">{checkinSettings.timezone}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-800/30">
                    <BarChart3 size={12} className="text-surface-200/30 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[9px] text-surface-200/30 uppercase">{t('dashboard.checkinPage.summaryWindow') || 'Window'}</p>
                        <p className="text-xs text-surface-200/70 font-medium">{checkinSettings.summaryWindow}d</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-800/30">
                    <Zap size={12} className="text-surface-200/30 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[9px] text-surface-200/30 uppercase">{t('dashboard.checkinPage.autoMessage') || 'Auto'}</p>
                        <p className="text-xs text-surface-200/70 font-medium">{checkinSettings.autoMessageEnabled ? '✅' : '❌'}</p>
                    </div>
                </div>
            </div>

            {/* Quick Edit */}
            {editingCheckin ? (
                <div className="bg-surface-800/40 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-surface-200/40 uppercase">{t('dashboard.checkinPage.dailyPoints') || 'Daily Points'}</label>
                            <input type="number" value={editingCheckin.dailyPoints}
                                onChange={e => setEditingCheckin(p => ({ ...p, dailyPoints: e.target.value }))}
                                className="w-full bg-surface-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-surface-100" />
                        </div>
                        <div>
                            <label className="text-[10px] text-surface-200/40 uppercase">{t('dashboard.checkinPage.summaryWindow') || 'Summary Window'}</label>
                            <input type="number" value={editingCheckin.summaryWindow}
                                onChange={e => setEditingCheckin(p => ({ ...p, summaryWindow: e.target.value }))}
                                className="w-full bg-surface-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-surface-100" />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-2">
                        <label className="text-xs text-surface-200/50">{t('dashboard.checkinPage.autoMessage') || 'Auto Message'}</label>
                        <button onClick={() => setEditingCheckin(p => ({ ...p, autoMessageEnabled: !p.autoMessageEnabled }))}
                            className={`w-10 h-5 rounded-full transition-all relative ${editingCheckin.autoMessageEnabled ? 'bg-emerald-500' : 'bg-surface-700'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${editingCheckin.autoMessageEnabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={saveCheckinSettings} disabled={savingCheckin}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow disabled:opacity-50 flex items-center gap-1">
                            {savingCheckin ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {t('dashboard.common.save') || 'Save'}
                        </button>
                        <button onClick={() => setEditingCheckin(null)}
                            className="px-3 py-1.5 rounded-lg bg-surface-800/60 text-surface-200/50 text-xs hover:text-surface-100">{t('dashboard.common.cancel') || 'Cancel'}</button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setEditingCheckin({
                    dailyPoints: checkinSettings.dailyPoints ?? 10,
                    timezone: checkinSettings.timezone || 'Asia/Ho_Chi_Minh',
                    summaryWindow: checkinSettings.summaryWindow ?? 7,
                    autoMessageEnabled: !!checkinSettings.autoMessageEnabled,
                })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800/40 text-xs text-surface-200/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                    <Settings size={12} /> {t('dashboard.checkinPage.editSettings') || 'Edit Settings'}
                </button>
            )}

            {/* Leaderboard */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                        <Trophy size={12} className="text-amber-400" /> {t('dashboard.checkinPage.leaderboard') || 'Leaderboard'}
                    </h4>
                    <div className="flex gap-1">
                        {LB_MODES.map(m => (
                            <button key={m.id} onClick={() => { setLbMode(m.id); loadLeaderboard(m.id); }}
                                className={`px-2 py-1 rounded-md text-[10px] transition-all ${lbMode === m.id ? 'bg-amber-500/15 text-amber-400' : 'text-surface-200/30 hover:bg-white/5'}`}>
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
                {lbLoading ? (
                    <div className="py-4 flex justify-center"><Loader2 size={14} className="animate-spin text-amber-400" /></div>
                ) : leaderboard.length === 0 ? (
                    <p className="text-xs text-surface-200/30 text-center py-3">{t('dashboard.checkinPage.noData') || 'Click a mode to load'}</p>
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
    );
}
