import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Users as UsersIcon, Link, File, AlertTriangle, Loader2, Save, X } from 'lucide-react';
import useToastStore from '@/stores/toastStore';
import api from '@/api/client';

const MUTE_DURATIONS = [
    { value: 300, label: '5m' },
    { value: 3600, label: '1h' },
    { value: 86400, label: '24h' },
    { value: 604800, label: '7d' },
    { value: 0, label: '∞' },
];

function timeAgo(ts, t) {
    if (!ts) return '—';
    const sec = Math.floor(Date.now() / 1000) - ts;
    if (sec < 60) return t?.('dashboard.groupDetail.timeJustNow') || 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}${t?.('dashboard.groupDetail.timeMin') || 'm ago'}`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}${t?.('dashboard.groupDetail.timeHour') || 'h ago'}`;
    return `${Math.floor(sec / 86400)}${t?.('dashboard.groupDetail.timeDay') || 'd ago'}`;
}

export default function ModerationTab({ group, detail }) {
    const { t } = useTranslation();
    const toast = useToastStore();
    
    const [modMembers, setModMembers] = useState([]);
    const [modLoading, setModLoading] = useState(false);
    const [modSearch, setModSearch] = useState('');
    const [modAction, setModAction] = useState(null); // { type, userId, firstName }
    const [modMuteDuration, setModMuteDuration] = useState(3600);
    const [modWarnReason, setModWarnReason] = useState('');
    const [modActing, setModActing] = useState(false);
    const [modWarnings, setModWarnings] = useState([]);
    const [modLocks, setModLocks] = useState({ lockLinks: false, lockFiles: false, antifloodLimit: 0 });
    const [modSavingLocks, setModSavingLocks] = useState(false);
    
    const [lastSynced, setLastSynced] = useState(null);
    const syncTimerRef = useRef(null);

    const loadModData = useCallback(async (showLoading = true) => {
        if (showLoading) setModLoading(true);
        try {
            const [membersRes, warningsRes] = await Promise.all([
                api.getUserGroupMembers(group.chatId).catch(() => ({ members: [] })),
                api.getGroupWarnings(group.chatId).catch(() => ({ warnings: [] })),
            ]);
            setModMembers(membersRes?.members || []);
            setModWarnings(warningsRes?.warnings || []);
            if (detail?.settings) {
                setModLocks({
                    lockLinks: !!detail.settings.lockLinks,
                    lockFiles: !!detail.settings.lockFiles,
                    antifloodLimit: detail.settings.antifloodLimit || 0,
                });
            }
            setLastSynced(Date.now());
        } catch { /* silent */ }
        if (showLoading) setModLoading(false);
    }, [group.chatId, detail]);

    useEffect(() => {
        loadModData(true);
        syncTimerRef.current = setInterval(() => loadModData(false), 30_000);
        return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current); };
    }, [loadModData]);

    const handleModAction = async () => {
        if (!modAction) return;
        setModActing(true);
        try {
            const { type, userId } = modAction;
            if (type === 'ban') await api.moderateBan(group.chatId, userId);
            else if (type === 'kick') await api.moderateKick(group.chatId, userId);
            else if (type === 'mute') await api.moderateMute(group.chatId, userId, modMuteDuration);
            else if (type === 'unmute') await api.moderateUnmute(group.chatId, userId);
            else if (type === 'warn') await api.moderateWarn(group.chatId, userId, modWarnReason);
            
            toast.success(t('dashboard.common.saved') || `${type} success!`);
            setModAction(null);
            setModWarnReason('');
            setLastSynced(Date.now());
            // Refresh warnings manually
            const res = await api.getGroupWarnings(group.chatId).catch(() => ({ warnings: [] }));
            if (res.warnings) setModWarnings(res.warnings);
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
        setModActing(false);
    };

    const saveModLocks = async () => {
        setModSavingLocks(true);
        try {
            await api.updateGroupLocks(group.chatId, modLocks);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            setLastSynced(Date.now());
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
        setModSavingLocks(false);
    };

    if (modLoading) {
        return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-red-400" /></div>;
    }

    return (
        <div className="space-y-4">
            {/* Sync indicator */}
            {lastSynced && (
                <div className="flex items-center gap-2 text-[10px] text-emerald-400/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ⚡ {t('dashboard.common.synced') || 'Synced with Telegram'} · {new Date(lastSynced).toLocaleTimeString()}
                    <span className="text-surface-200/30">· {t('dashboard.common.autoRefresh') || 'auto-refresh 30s'}</span>
                </div>
            )}

            {/* Lock & Antiflood Settings */}
            <div className="space-y-2">
                <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                    <Shield size={12} className="text-red-400" /> {t('dashboard.userGroups.modSettings') || 'Protection Settings'}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Link size={14} className={modLocks.lockLinks ? 'text-red-400' : 'text-surface-200/30'} />
                                <span className="text-xs text-surface-100">{t('dashboard.userGroups.lockLinks') || 'Lock Links'}</span>
                            </div>
                            <button onClick={() => setModLocks(p => ({ ...p, lockLinks: !p.lockLinks }))}
                                className={`w-9 h-4.5 rounded-full transition-all relative ${modLocks.lockLinks ? 'bg-red-500' : 'bg-surface-700'}`}>
                                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${modLocks.lockLinks ? 'left-[1.125rem]' : 'left-0.5'}`} />
                            </button>
                        </div>
                        <p className="text-[9px] text-surface-200/25 font-mono">/locklinks</p>
                    </div>
                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <File size={14} className={modLocks.lockFiles ? 'text-red-400' : 'text-surface-200/30'} />
                                <span className="text-xs text-surface-100">{t('dashboard.userGroups.lockFiles') || 'Lock Files'}</span>
                            </div>
                            <button onClick={() => setModLocks(p => ({ ...p, lockFiles: !p.lockFiles }))}
                                className={`w-9 h-4.5 rounded-full transition-all relative ${modLocks.lockFiles ? 'bg-red-500' : 'bg-surface-700'}`}>
                                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${modLocks.lockFiles ? 'left-[1.125rem]' : 'left-0.5'}`} />
                            </button>
                        </div>
                        <p className="text-[9px] text-surface-200/25 font-mono">/lockfiles</p>
                    </div>
                </div>
                <div className="p-3 bg-white/[0.02] rounded-xl">
                    <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.antiflood') || 'Anti-Flood Limit'} ({modLocks.antifloodLimit || 'Off'})</label>
                    <input type="range" min="0" max="20" value={modLocks.antifloodLimit} onChange={e => setModLocks(p => ({ ...p, antifloodLimit: Number(e.target.value) }))}
                        className="w-full accent-red-400" />
                    <p className="text-[9px] text-surface-200/25 mt-1 font-mono">/antiflood {modLocks.antifloodLimit || 0} — {t('dashboard.userGroups.antifloodHint')}</p>
                </div>
                <button onClick={saveModLocks} disabled={modSavingLocks} className="btn-primary !text-xs !px-3 !py-1.5 flex items-center gap-1">
                    {modSavingLocks ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {t('dashboard.common.save') || 'Save'}
                </button>
            </div>

            {/* Members */}
            <div className="space-y-2">
                <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                    <UsersIcon size={12} className="text-brand-400" /> {t('dashboard.userGroups.modMembers') || 'Admins & Members'}
                    <span className="text-[9px] text-surface-200/25 font-mono font-normal">/ban /kick /mute /unmute /warn</span>
                </h4>
                <input type="text" value={modSearch} onChange={e => setModSearch(e.target.value)}
                    placeholder={t('dashboard.userGroups.modSearchPlaceholder') || 'Search by name or ID...'}
                    className="input-field !py-1.5 !text-xs w-full" />
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    {modMembers
                        .filter(m => !m.isBot && (
                            !modSearch || m.firstName.toLowerCase().includes(modSearch.toLowerCase()) ||
                            m.username?.toLowerCase().includes(modSearch.toLowerCase()) ||
                            m.userId.includes(modSearch)
                        ))
                        .map(m => (
                            <div key={m.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/30 hover:bg-surface-800/50 transition-colors">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs text-surface-200/60 truncate">
                                        {m.firstName}{m.username ? ` @${m.username}` : ''}
                                    </span>
                                    {m.status === 'creator' || m.status === 'administrator' ? (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.status === 'creator' ? 'bg-amber-500/15 text-amber-400' : 'bg-brand-500/10 text-brand-400'}`}>
                                            {m.status}
                                        </span>
                                    ) : null}
                                </div>
                                {m.status !== 'creator' && (
                                    <div className="flex gap-1">
                                        {[{ type: 'warn', icon: '⚠️', tip: '/warn', label: t('dashboard.userGroups.modActionWarn') || 'Warn' }, { type: 'mute', icon: '🔇', tip: '/mute', label: t('dashboard.userGroups.modActionMute') || 'Mute' }, { type: 'kick', icon: '👢', tip: '/kick', label: t('dashboard.userGroups.modActionKick') || 'Kick' }, { type: 'ban', icon: '🔨', tip: '/ban', label: t('dashboard.userGroups.modActionBan') || 'Ban' }].map(a => (
                                            <button key={a.type} title={`${a.label} — Telegram: ${a.tip}`}
                                                onClick={() => setModAction({ type: a.type, userId: m.userId, firstName: m.firstName })}
                                                className="px-1.5 py-0.5 rounded text-[10px] hover:bg-white/10 transition-colors">
                                                {a.icon}
                                            </button>
                                        ))}
                                        <button title={`${t('dashboard.userGroups.modActionUnmute') || 'Unmute'} — Telegram: /unmute`} onClick={() => setModAction({ type: 'unmute', userId: m.userId, firstName: m.firstName })}
                                            className="px-1.5 py-0.5 rounded text-[10px] hover:bg-white/10 transition-colors">🔊</button>
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            </div>

            {/* Action Confirmation Dialog */}
            {modAction && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-red-400">
                        <AlertTriangle size={12} className="inline mr-1" />
                        {modAction.type.toUpperCase()} <b>{modAction.firstName}</b> ({modAction.userId})?
                    </p>
                    <p className="text-[9px] text-surface-200/25 font-mono">Telegram: /{modAction.type} {modAction.type === 'mute' ? '<duration>' : ''}</p>
                    {modAction.type === 'mute' && (
                        <div className="flex gap-1">
                            {MUTE_DURATIONS.map(d => (
                                <button key={d.value} onClick={() => setModMuteDuration(d.value)}
                                    className={`px-2 py-1 rounded text-[10px] ${modMuteDuration === d.value ? 'bg-red-500/20 text-red-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {modAction.type === 'warn' && (
                        <input value={modWarnReason} onChange={e => setModWarnReason(e.target.value)}
                            placeholder={t('dashboard.userGroups.modWarnReason') || 'Reason (optional)'} className="input-field !py-1.5 !text-xs w-full" />
                    )}
                    <div className="flex gap-2 mt-2">
                        <button onClick={handleModAction} disabled={modActing}
                            className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                            {modActing ? <Loader2 size={12} className="animate-spin" /> : null} {t('dashboard.common.confirm') || 'Confirm'}
                        </button>
                        <button onClick={() => setModAction(null)}
                            className="px-3 py-1.5 rounded-lg bg-surface-800/60 text-surface-200/50 text-xs">{t('dashboard.common.cancel') || 'Cancel'}</button>
                    </div>
                </div>
            )}

            {/* Recent Warnings */}
            {modWarnings.length > 0 && (
                <div className="space-y-1">
                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5 mt-4">
                        <AlertTriangle size={12} className="text-amber-400" /> {t('dashboard.userGroups.modWarnings') || 'Recent Warnings'}
                        <span className="text-[9px] text-surface-200/25 font-mono font-normal">/warn — auto-ban @ 3</span>
                    </h4>
                    {modWarnings.slice(0, 10).map(w => (
                        <div key={w.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-800/30 text-xs">
                            <span className="text-surface-200/50 font-mono">{w.userId}</span>
                            <span className="text-surface-200/40">{w.reason || '—'}</span>
                            <span className="text-[10px] text-surface-200/25">{timeAgo(w.createdAt, t)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
