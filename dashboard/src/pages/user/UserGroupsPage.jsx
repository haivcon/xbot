import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import useToastStore from '@/stores/toastStore';
import {
    MessageSquare, Search, Settings, RefreshCw, Users as UsersIcon, X, Send,
    Shield, ChevronRight, Loader2, Bell, BellOff, FileText, Ban, Zap,
    Gamepad2, TrendingUp, Clock, Globe, CalendarCheck, UserCheck,
    Trophy, Target, BarChart3, Save, ChevronDown, AlertCircle,
    Volume2, VolumeX, Link, File, AlertTriangle, Plus, Trash2, Play,
    Hash, Timer, Tag,
} from 'lucide-react';

const LANG_FLAGS = { en: '🇺🇸', vi: '🇻🇳', zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺', id: '🇮🇩' };
const LANG_LABELS = { en: 'English', vi: 'Tiếng Việt', zh: '中文', ko: '한국어', ru: 'Русский', id: 'Indonesia' };
const WELCOME_ACTIONS = ['kick', 'ban', 'mute'];
const PA_CHAINS = [
    { chainIndex: '196', shortName: 'xlayer', label: 'X Layer' },
    { chainIndex: '1', shortName: 'eth', label: 'Ethereum' },
    { chainIndex: '56', shortName: 'bsc', label: 'BSC' },
    { chainIndex: '137', shortName: 'polygon', label: 'Polygon' },
    { chainIndex: '42161', shortName: 'arbitrum', label: 'Arbitrum' },
    { chainIndex: '8453', shortName: 'base', label: 'Base' },
    { chainIndex: '501', shortName: 'solana', label: 'Solana' },
];

function timeAgo(ts, t) {
    if (!ts) return '—';
    const sec = Math.floor(Date.now() / 1000) - ts;
    if (sec < 60) return t?.('dashboard.groupDetail.timeJustNow') || 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}${t?.('dashboard.groupDetail.timeMin') || 'm ago'}`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}${t?.('dashboard.groupDetail.timeHour') || 'h ago'}`;
    return `${Math.floor(sec / 86400)}${t?.('dashboard.groupDetail.timeDay') || 'd ago'}`;
}

const LB_MODES = [
    { id: 'streak', label: '🔥 Streak' },
    { id: 'total', label: '📊 Total' },
    { id: 'points', label: '⭐ Points' },
    { id: 'longest', label: '🏆 Longest' },
];

/* ═══════════════════════════════════════════════
   User Group Detail Modal
   ═══════════════════════════════════════════════ */
function UserGroupDetailModal({ group, onClose, onRefresh }) {
    const { t } = useTranslation();
    const toast = useToastStore();
    const [tab, setTab] = useState('settings');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detail, setDetail] = useState(null);

    // Settings state
    const [toggles, setToggles] = useState({ enableAi: true, enableGames: true, enableAlerts: true });
    const [rulesText, setRulesText] = useState('');
    const [blacklistInput, setBlacklistInput] = useState('');
    const [blacklist, setBlacklist] = useState([]);

    // Message state
    const [message, setMessage] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const [msgSent, setMsgSent] = useState(false);

    // Checkin state
    const [checkinSettings, setCheckinSettings] = useState(null);
    const [checkinLoading, setCheckinLoading] = useState(false);
    const [editingCheckin, setEditingCheckin] = useState(null);
    const [savingCheckin, setSavingCheckin] = useState(false);
    const [leaderboard, setLeaderboard] = useState([]);
    const [lbMode, setLbMode] = useState('streak');
    const [lbLoading, setLbLoading] = useState(false);

    // Welcome state
    const [welcome, setWelcome] = useState({ enabled: false, timeLimitSeconds: 60, maxAttempts: 3, action: 'kick', questionWeights: { math: 50, physics: 0, chemistry: 0, okx: 25, crypto: 25 }, titleTemplate: '' });
    const [welcomeLoading, setWelcomeLoading] = useState(false);
    const [savingWelcome, setSavingWelcome] = useState(false);
    const prevWelcomeRef = useRef(null);

    // Language state
    const [groupLang, setGroupLang] = useState('en');
    const [savingLang, setSavingLang] = useState(false);

    // Subscription state
    const [subEnabled, setSubEnabled] = useState(false);
    const [subLang, setSubLang] = useState('en');

    // Moderation state
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

    // Price Alerts state
    const [paTokens, setPaTokens] = useState([]);
    const [paTarget, setPaTarget] = useState(null);
    const [paLoading, setPaLoading] = useState(false);
    const [paAdding, setPaAdding] = useState(false);
    const [paForm, setPaForm] = useState({ tokenAddress: '', tokenLabel: '', intervalSeconds: 3600, chainIndex: '196', chainShortName: 'xlayer' });
    const [paEditing, setPaEditing] = useState(null);
    const [paSaving, setPaSaving] = useState(false);
    const [paTitles, setPaTitles] = useState([]);
    const [paTitleInput, setPaTitleInput] = useState('');
    const [paSelectedToken, setPaSelectedToken] = useState(null);

    // Auto-sync state — keeps dashboard in sync with Telegram commands
    const [lastSynced, setLastSynced] = useState(null);
    const syncTimerRef = useRef(null);

    const loadDetail = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getUserGroupDetail(group.chatId);
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
            setGroupLang(data.groupLanguage || data.settings?.groupLanguage || 'en');
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setLoading(false);
    }, [group.chatId]);

    useEffect(() => { loadDetail(); }, [loadDetail]);

    // Load checkin when tab changes
    useEffect(() => {
        if (tab === 'checkin') {
            setCheckinLoading(true);
            api.getUserGroupCheckin(group.chatId)
                .then(r => { setCheckinSettings(r?.settings || {}); })
                .catch(() => setCheckinSettings({}))
                .finally(() => setCheckinLoading(false));
        }
    }, [tab, group.chatId]);

    // Reusable welcome loader for auto-sync
    const loadWelcomeData = useCallback(async (showLoading = true) => {
        if (showLoading) setWelcomeLoading(true);
        try {
            const r = await api.getUserGroupWelcome(group.chatId);
            setWelcome(prev => {
                const data = r || { enabled: false, timeLimitSeconds: 60, maxAttempts: 3, action: 'kick', questionWeights: { math: 50, physics: 0, chemistry: 0, okx: 25, crypto: 25 }, titleTemplate: '' };
                return { ...data, _preview: prev._preview };
            });
            setLastSynced(Date.now());
        } catch { /* silent */ }
        if (showLoading) setWelcomeLoading(false);
    }, [group.chatId]);

    // Load welcome when tab changes
    useEffect(() => {
        if (tab === 'welcome') loadWelcomeData(true);
    }, [tab, group.chatId]);

    // Reusable loaders for auto-sync
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

    const loadPaData = useCallback(async (showLoading = true) => {
        if (showLoading) setPaLoading(true);
        try {
            const r = await api.getPriceAlerts(group.chatId);
            setPaTokens(r?.tokens || []);
            setPaTarget(r?.target || null);
            setLastSynced(Date.now());
        } catch { /* silent */ }
        if (showLoading) setPaLoading(false);
    }, [group.chatId]);

    // Load moderation data when tab changes
    useEffect(() => {
        if (tab === 'moderation') loadModData(true);
    }, [tab, group.chatId, detail]);

    // Load price alerts when tab changes
    useEffect(() => {
        if (tab === 'pricealerts') loadPaData(true);
    }, [tab, group.chatId]);

    // Auto-sync: poll every 30s when on moderation, pricealerts, or welcome tab
    useEffect(() => {
        if (syncTimerRef.current) clearInterval(syncTimerRef.current);
        if (tab === 'moderation') {
            syncTimerRef.current = setInterval(() => loadModData(false), 30_000);
        } else if (tab === 'pricealerts') {
            syncTimerRef.current = setInterval(() => loadPaData(false), 30_000);
        } else if (tab === 'welcome') {
            syncTimerRef.current = setInterval(() => loadWelcomeData(false), 30_000);
        }
        return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current); };
    }, [tab, loadModData, loadPaData, loadWelcomeData]);

    const saveSettings = async () => {
        setSaving(true);
        try {
            await api.updateUserGroupSettings(group.chatId, {
                settings: toggles,
                rules: rulesText,
                blacklist,
                subscription: subEnabled ? { lang: subLang, minStake: 0 } : null,
            });
            toast.success(t('dashboard.common.saved') || 'Saved!');
            onRefresh();
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSaving(false);
    };

    const sendMsg = async () => {
        if (!message.trim()) return;
        setSendingMsg(true);
        try {
            await api.sendUserGroupMessage(group.chatId, message.trim());
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

    const saveCheckinSettings = async () => {
        if (!editingCheckin) return;
        setSavingCheckin(true);
        try {
            await api.updateUserGroupCheckin(group.chatId, {
                dailyPoints: Number(editingCheckin.dailyPoints),
                timezone: editingCheckin.timezone,
                summaryWindow: Number(editingCheckin.summaryWindow),
                autoMessageEnabled: editingCheckin.autoMessageEnabled ? 1 : 0,
            });
            setEditingCheckin(null);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            // Reload
            const r = await api.getUserGroupCheckin(group.chatId);
            setCheckinSettings(r?.settings || {});
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSavingCheckin(false);
    };

    const loadLeaderboard = async (mode) => {
        setLbLoading(true);
        try {
            const r = await api.getUserGroupCheckinLeaderboard(group.chatId, mode);
            setLeaderboard(r?.leaderboard || []);
        } catch { setLeaderboard([]); }
        setLbLoading(false);
    };

    const saveWelcomeSettings = async () => {
        setSavingWelcome(true);
        const prev = JSON.parse(JSON.stringify(welcome));
        try {
            const { _preview, stats, ...payload } = welcome;
            await api.updateUserGroupWelcome(group.chatId, payload);
            prevWelcomeRef.current = prev;
            toast.success(
                <span>{t('dashboard.common.saved') || 'Saved!'} <button onClick={() => {
                    if (prevWelcomeRef.current) {
                        const restore = prevWelcomeRef.current;
                        setWelcome(restore);
                        const { _preview: _p, stats: _s, ...restorePayload } = restore;
                        api.updateUserGroupWelcome(group.chatId, restorePayload).catch(() => {});
                        toast.success(t('dashboard.userGroups.undone') || 'Undone!');
                        prevWelcomeRef.current = null;
                    }
                }} className="underline ml-1 opacity-70 hover:opacity-100">↩ Undo</button></span>,
                5000
            );
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSavingWelcome(false);
    };

    const saveLanguage = async () => {
        setSavingLang(true);
        try {
            await api.updateUserGroupLanguage(group.chatId, groupLang);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            onRefresh();
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSavingLang(false);
    };

    const tabs = [
        { id: 'settings', icon: Settings, label: t('dashboard.groupDetail.settings') || 'Settings' },
        { id: 'checkin', icon: CalendarCheck, label: t('dashboard.userGroups.checkin') || 'Check-in' },
        { id: 'welcome', icon: UserCheck, label: t('dashboard.userGroups.welcome') || 'Welcome' },
        { id: 'language', icon: Globe, label: t('dashboard.userGroups.language') || 'Language' },
        { id: 'subscription', icon: Bell, label: t('dashboard.groupDetail.subscription') || 'Signals' },
        { id: 'moderation', icon: Shield, label: t('dashboard.userGroups.moderation') || 'Moderation' },
        { id: 'pricealerts', icon: TrendingUp, label: t('dashboard.userGroups.priceAlerts') || 'Price Alerts' },
        { id: 'message', icon: Send, label: t('dashboard.groupDetail.sendMessage') || 'Message' },
    ];

    const INTERVAL_OPTIONS = [
        { value: 60, label: '1m' },
        { value: 300, label: '5m' },
        { value: 900, label: '15m' },
        { value: 1800, label: '30m' },
        { value: 3600, label: '1h' },
        { value: 7200, label: '2h' },
        { value: 14400, label: '4h' },
        { value: 28800, label: '8h' },
        { value: 43200, label: '12h' },
        { value: 86400, label: '24h' },
    ];

    const addPriceAlertToken = async () => {
        if (!paForm.tokenAddress.trim()) return;
        setPaAdding(true);
        try {
            await api.addPriceAlert(group.chatId, paForm);
            toast.success(t('dashboard.common.saved') || 'Token added!');
            setPaForm({ tokenAddress: '', tokenLabel: '', intervalSeconds: 3600, chainIndex: '196', chainShortName: 'xlayer' });
            const r = await api.getPriceAlerts(group.chatId);
            setPaTokens(r?.tokens || []);
        } catch (e) { toast.error(e?.message || 'Failed to add'); }
        setPaAdding(false);
    };

    const updatePaToken = async (tokenId, patch) => {
        setPaSaving(true);
        try {
            await api.updatePriceAlert(group.chatId, tokenId, patch);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            setPaEditing(null);
            const r = await api.getPriceAlerts(group.chatId);
            setPaTokens(r?.tokens || []);
        } catch (e) { toast.error(e?.message || 'Failed'); }
        setPaSaving(false);
    };

    const deletePaToken = async (tokenId) => {
        try {
            await api.deletePriceAlert(group.chatId, tokenId);
            toast.success(t('dashboard.common.saved') || 'Deleted!');
            setPaTokens(prev => prev.filter(tk => tk.id !== tokenId));
            if (paSelectedToken === tokenId) { setPaSelectedToken(null); setPaTitles([]); }
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const sendNow = async (tokenId) => {
        try {
            await api.sendPriceAlertNow(group.chatId, tokenId);
            toast.success(t('dashboard.common.saved') || 'Alert queued!');
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const loadTitles = async (tokenId) => {
        setPaSelectedToken(tokenId);
        try {
            const r = await api.getPriceAlertTitles(group.chatId, tokenId);
            setPaTitles(r?.titles || []);
        } catch { setPaTitles([]); }
    };

    const addTitle = async () => {
        if (!paTitleInput.trim() || !paSelectedToken) return;
        try {
            await api.addPriceAlertTitle(group.chatId, paSelectedToken, paTitleInput.trim());
            setPaTitleInput('');
            const r = await api.getPriceAlertTitles(group.chatId, paSelectedToken);
            setPaTitles(r?.titles || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const deleteTitle = async (titleId) => {
        try {
            await api.deletePriceAlertTitle(group.chatId, titleId);
            setPaTitles(prev => prev.filter(tl => tl.id !== titleId));
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const MUTE_DURATIONS = [
        { value: 300, label: '5m' },
        { value: 3600, label: '1h' },
        { value: 86400, label: '24h' },
        { value: 604800, label: '7d' },
        { value: 0, label: '∞' },
    ];

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
            // Refresh warnings
            api.getGroupWarnings(group.chatId).then(r => setModWarnings(r?.warnings || [])).catch(() => {});
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setModActing(false);
    };

    const saveModLocks = async () => {
        setModSavingLocks(true);
        try {
            await api.updateGroupLocks(group.chatId, modLocks);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            setLastSynced(Date.now());
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setModSavingLocks(false);
    };

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

                                    {/* Rules */}
                                    <div className="mt-4">
                                        <label className="text-xs font-semibold text-surface-200/50 mb-1.5 block">{t('dashboard.groupDetail.rules') || 'Rules'}</label>
                                        <textarea value={rulesText} onChange={e => setRulesText(e.target.value)}
                                            placeholder={t('dashboard.groupDetail.rulesPlaceholder') || 'Enter group rules...'}
                                            className="input-field w-full h-24 !text-sm resize-none" />
                                    </div>

                                    {/* Blacklist */}
                                    <div>
                                        <label className="text-xs font-semibold text-surface-200/50 mb-1.5 block">{t('dashboard.groupDetail.filters') || 'Blacklist'}</label>
                                        <div className="flex gap-2">
                                            <input value={blacklistInput} onChange={e => setBlacklistInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && addBlacklistWord()}
                                                placeholder={t('dashboard.groupDetail.addKeyword') || 'Add keyword...'} className="input-field flex-1 !text-sm !py-2" />
                                            <button onClick={addBlacklistWord} className="btn-primary !text-xs !px-3 !py-2">+</button>
                                        </div>
                                        {blacklist.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {blacklist.map(word => (
                                                    <span key={word} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs">
                                                        {word}
                                                        <button onClick={() => setBlacklist(blacklist.filter(w => w !== word))} className="hover:text-red-300"><X size={10} /></button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Checkin Tab */}
                            {tab === 'checkin' && (
                                <div className="space-y-4">
                                    {checkinLoading ? (
                                        <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-emerald-400" /></div>
                                    ) : !checkinSettings?.chatId ? (
                                        <div className="text-center py-8 space-y-2">
                                            <AlertCircle size={28} className="text-surface-200/20 mx-auto" />
                                            <p className="text-sm text-surface-200/40">{t('dashboard.userGroups.checkinNotEnabled') || 'Check-in not enabled for this group. Use /checkinadmin in the group to set up.'}</p>
                                        </div>
                                    ) : (
                                        <>
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
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Welcome Tab */}
                            {tab === 'welcome' && (
                                <div className="space-y-4">
                                    {welcomeLoading ? (
                                        <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
                                    ) : (
                                        <>
                                            {lastSynced && (
                                                <div className="flex items-center gap-2 text-[10px] text-emerald-400/70 -mb-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                    ⚡ Synced with Telegram · {new Date(lastSynced).toLocaleTimeString()}
                                                    <span className="text-surface-200/30">· auto-refresh 30s</span>
                                                </div>
                                            )}
                                            <p className="text-xs text-surface-200/40">{t('dashboard.userGroups.welcomeDesc') || 'Configure new member verification (anti-bot protection)'}</p>
                                            <p className="text-[9px] text-surface-200/25 font-mono -mt-2">{t('dashboard.userGroups.welcomeHint')}</p>

                                            {/* Enable toggle */}
                                            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <UserCheck size={16} className={welcome.enabled ? 'text-emerald-400' : 'text-surface-200/30'} />
                                                    <span className="text-sm text-surface-100">{t('dashboard.userGroups.welcomeEnabled') || 'Enable Welcome Verification'}</span>
                                                </div>
                                                <button onClick={() => setWelcome(prev => ({ ...prev, enabled: !prev.enabled }))}
                                                    className={`w-10 h-5 rounded-full transition-all relative ${welcome.enabled ? 'bg-emerald-500' : 'bg-surface-700'}`}>
                                                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${welcome.enabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-surface-200/25 font-mono -mt-2">Telegram: /welcome → toggle</p>

                                            {welcome.enabled && (() => {
                                                const QUESTION_TYPES = [
                                                    { key: 'math', label: t('dashboard.userGroups.questionMath') || '🧮 Math', emoji: '🧮', color: '#3b82f6', diff: 1 },
                                                    { key: 'physics', label: t('dashboard.userGroups.questionPhysics') || '🔬 Physics', emoji: '🔬', color: '#8b5cf6', diff: 2 },
                                                    { key: 'chemistry', label: t('dashboard.userGroups.questionChemistry') || '⚗️ Chemistry', emoji: '⚗️', color: '#10b981', diff: 2 },
                                                    { key: 'okx', label: t('dashboard.userGroups.questionOkx') || '💱 OKX/DeFi', emoji: '💱', color: '#f59e0b', diff: 3 },
                                                    { key: 'crypto', label: t('dashboard.userGroups.questionCrypto') || '₿ Crypto', emoji: '₿', color: '#ef4444', diff: 3 },
                                                ];
                                                const PRESETS = [
                                                    { id: 'mathOnly', label: '🎯 Math Only', w: { math: 100, physics: 0, chemistry: 0, okx: 0, crypto: 0 } },
                                                    { id: 'crypto', label: '💰 Crypto Focus', w: { math: 20, physics: 0, chemistry: 0, okx: 40, crypto: 40 } },
                                                    { id: 'academic', label: '📚 Academic', w: { math: 40, physics: 30, chemistry: 30, okx: 0, crypto: 0 } },
                                                    { id: 'balanced', label: '⚖️ Balanced', w: { math: 20, physics: 20, chemistry: 20, okx: 20, crypto: 20 } },
                                                ];
                                                const TEMPLATE_VARS = [
                                                    { var: '{group}', desc: t('dashboard.userGroups.varGroup') || 'Group name' },
                                                    { var: '{user}', desc: t('dashboard.userGroups.varUser') || 'Member name' },
                                                    { var: '{time}', desc: t('dashboard.userGroups.varTime') || 'Time limit' },
                                                    { var: '{attempts}', desc: t('dashboard.userGroups.varAttempts') || 'Max attempts' },
                                                ];
                                                const w = welcome.questionWeights || {};
                                                const totalW = Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);
                                                const activeTypes = QUESTION_TYPES.filter(q => (w[q.key] || 0) > 0);
                                                const avgDiff = activeTypes.length > 0
                                                    ? activeTypes.reduce((s, q) => s + q.diff * (w[q.key] || 0), 0) / (totalW || 1) : 0;
                                                const diffLabel = avgDiff <= 1.3 ? { text: 'Easy', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' }
                                                    : avgDiff <= 2.2 ? { text: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' }
                                                    : { text: 'Hard', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' };

                                                const generatePreview = () => {
                                                    const pool = activeTypes.length > 0 ? activeTypes : [QUESTION_TYPES[0]];
                                                    const pick = pool[Math.floor(Math.random() * pool.length)];
                                                    const samples = {
                                                        math: () => { const a = Math.floor(Math.random()*50)+1, b = Math.floor(Math.random()*50)+1; return { q: `${a} + ${b} = ?`, a: `${a+b}` }; },
                                                        physics: () => { const m = Math.floor(Math.random()*10)+1; return { q: `F = m×a. If m=${m}kg, a=10m/s², F = ?`, a: `${m*10}N` }; },
                                                        chemistry: () => { const els = [['H₂O','Water'],['NaCl','Salt'],['CO₂','Carbon dioxide']]; const e = els[Math.floor(Math.random()*els.length)]; return { q: `What is ${e[0]}?`, a: e[1] }; },
                                                        okx: () => ({ q: 'What does DEX stand for?', a: 'Decentralized Exchange' }),
                                                        crypto: () => ({ q: 'What is the max supply of Bitcoin?', a: '21 million' }),
                                                    };
                                                    const s = (samples[pick.key] || samples.math)();
                                                    return { type: pick.label, question: s.q, answer: s.a };
                                                };

                                                return (
                                                <div className="space-y-3">
                                                    {/* Time limit */}
                                                    <div className="p-3 bg-white/[0.02] rounded-xl">
                                                        <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.timeLimit') || 'Time Limit (seconds)'}</label>
                                                        <input type="number" min="15" max="300" value={welcome.timeLimitSeconds}
                                                            onChange={e => setWelcome(prev => ({ ...prev, timeLimitSeconds: Number(e.target.value) }))}
                                                            onBlur={e => { const v = Math.max(15, Math.min(300, Number(e.target.value) || 60)); setWelcome(prev => ({ ...prev, timeLimitSeconds: v })); }}
                                                            className="input-field !py-2 !text-sm w-full" />
                                                    </div>

                                                    {/* Max attempts */}
                                                    <div className="p-3 bg-white/[0.02] rounded-xl">
                                                        <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.maxAttempts') || 'Max Attempts'}</label>
                                                        <input type="number" min="1" max="10" value={welcome.maxAttempts}
                                                            onChange={e => setWelcome(prev => ({ ...prev, maxAttempts: Number(e.target.value) }))}
                                                            onBlur={e => { const v = Math.max(1, Math.min(10, Number(e.target.value) || 3)); setWelcome(prev => ({ ...prev, maxAttempts: v })); }}
                                                            className="input-field !py-2 !text-sm w-full" />
                                                    </div>

                                                    {/* Enforcement action */}
                                                    <div className="p-3 bg-white/[0.02] rounded-xl">
                                                        <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.action') || 'Fail Action'}</label>
                                                        <div className="flex gap-2">
                                                            {WELCOME_ACTIONS.map(action => (
                                                                <button key={action} onClick={() => setWelcome(prev => ({ ...prev, action }))}
                                                                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${welcome.action === action
                                                                        ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                                                                        : 'bg-surface-800/30 text-surface-200/50 border border-transparent hover:bg-white/5'}`}>
                                                                    {action === 'kick' ? '👢 Kick' : action === 'ban' ? '🔨 Ban' : '🔇 Mute'}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* ── #4: Verification Stats ── */}
                                                    {welcome.stats && (
                                                        <div className="p-3 bg-white/[0.02] rounded-xl">
                                                            <label className="text-xs text-surface-200/40 block mb-2">{t('dashboard.userGroups.verifyStats') || '📊 Verification Stats'}</label>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {[
                                                                    { label: t('dashboard.userGroups.statTotal') || 'Total', value: welcome.stats.total || 0, color: 'text-brand-400' },
                                                                    { label: t('dashboard.userGroups.statPassed') || 'Passed', value: welcome.stats.passed || 0, color: 'text-emerald-400' },
                                                                    { label: t('dashboard.userGroups.statFailed') || 'Failed', value: welcome.stats.failed || 0, color: 'text-red-400' },
                                                                ].map(s => (
                                                                    <div key={s.label} className="text-center p-2 rounded-lg bg-white/[0.02]">
                                                                        <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                                                                        <p className="text-[9px] text-surface-200/30 uppercase">{s.label}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {welcome.stats.total > 0 && (
                                                                <div className="mt-2 h-1.5 rounded-full bg-surface-700 overflow-hidden flex">
                                                                    <div className="bg-emerald-400 transition-all" style={{ width: `${(welcome.stats.passed / welcome.stats.total) * 100}%` }} />
                                                                    <div className="bg-red-400 transition-all" style={{ width: `${(welcome.stats.failed / welcome.stats.total) * 100}%` }} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* ── Question Weights with #2 Presets, #8 Difficulty, #9 Bar Chart ── */}
                                                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-xs text-surface-200/40">{t('dashboard.userGroups.questionWeights') || 'Question Types'}</label>
                                                                {/* #8: Difficulty badge */}
                                                                {totalW > 0 && (
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${diffLabel.bg} ${diffLabel.color}`}>
                                                                        {diffLabel.text}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[9px] text-surface-200/25 font-mono">Telegram: /welcome → weights</span>
                                                        </div>

                                                        {/* #2: Quick Presets */}
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {PRESETS.map(p => {
                                                                const isActive = QUESTION_TYPES.every(q => (w[q.key] || 0) === (p.w[q.key] || 0));
                                                                return (
                                                                    <button key={p.id}
                                                                        onClick={() => setWelcome(prev => ({ ...prev, questionWeights: { ...p.w } }))}
                                                                        className={`text-[10px] px-2 py-1 rounded-lg transition-all border ${isActive
                                                                            ? 'bg-brand-500/15 text-brand-400 border-brand-500/30'
                                                                            : 'bg-white/[0.02] text-surface-200/40 border-transparent hover:bg-white/5 hover:text-surface-200/60'}`}>
                                                                        {p.label}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* #9: Stacked bar chart */}
                                                        {totalW > 0 && (
                                                            <div className="h-3 rounded-full overflow-hidden flex bg-surface-700/50" title="Weight distribution">
                                                                {QUESTION_TYPES.map(q => {
                                                                    const pct = ((w[q.key] || 0) / totalW) * 100;
                                                                    if (pct <= 0) return null;
                                                                    return (
                                                                        <div key={q.key} className="transition-all relative group"
                                                                            style={{ width: `${pct}%`, backgroundColor: q.color }}
                                                                            title={`${q.emoji} ${Math.round(pct)}%`}>
                                                                            {pct > 12 && (
                                                                                <span className="absolute inset-0 flex items-center justify-center text-[7px] text-white font-bold">
                                                                                    {q.emoji}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {totalW <= 0 && (
                                                            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                                                <AlertTriangle size={12} className="text-red-400 shrink-0" />
                                                                <span className="text-[10px] text-red-400">{t('dashboard.userGroups.weightZeroWarn') || '⚠ All weights are 0 — verification questions will not be generated!'}</span>
                                                            </div>
                                                        )}

                                                        {/* Sliders */}
                                                        {QUESTION_TYPES.map(q => {
                                                            const pct = totalW > 0 ? Math.round(((w[q.key] || 0) / totalW) * 100) : 0;
                                                            return (
                                                                <div key={q.key} className="flex items-center gap-2">
                                                                    <span className="text-[10px] text-surface-100 w-24 truncate">{q.label}</span>
                                                                    <div className="flex-1 relative">
                                                                        <input type="range" min="0" max="100" value={w[q.key] || 0}
                                                                            onChange={e => setWelcome(prev => ({ ...prev, questionWeights: { ...prev.questionWeights, [q.key]: Number(e.target.value) } }))}
                                                                            className="w-full h-1" style={{ accentColor: q.color }} />
                                                                    </div>
                                                                    <span className={`text-[10px] font-mono w-8 text-right ${totalW <= 0 ? 'text-red-400' : ''}`}
                                                                        style={{ color: totalW > 0 ? q.color : undefined }}>{pct}%</span>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* #1: Preview question button */}
                                                        <button
                                                            onClick={() => {
                                                                const p = generatePreview();
                                                                setWelcome(prev => ({ ...prev, _preview: p }));
                                                            }}
                                                            className="w-full py-2 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all flex items-center justify-center gap-1.5">
                                                            👁 {t('dashboard.userGroups.previewQuestion') || 'Preview Sample Question'}
                                                        </button>
                                                        {welcome._preview && (
                                                            <div className="p-2.5 rounded-lg bg-brand-500/5 border border-brand-500/15 space-y-1 animate-fadeIn">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[9px] text-brand-400/60 font-mono">{welcome._preview.type}</span>
                                                                    <button onClick={() => setWelcome(prev => { const { _preview, ...rest } = prev; return rest; })}
                                                                        className="text-surface-200/30 hover:text-surface-200/60"><X size={10} /></button>
                                                                </div>
                                                                <p className="text-xs text-surface-100 font-medium">❓ {welcome._preview.question}</p>
                                                                <p className="text-[10px] text-emerald-400">✅ {welcome._preview.answer}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ── Title Template with #5 Variables, #3 Message Preview ── */}
                                                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-xs text-surface-200/40">{t('dashboard.userGroups.titleTemplate') || 'Verification Title'}</label>
                                                            <span className="text-[9px] text-surface-200/25 font-mono">Telegram: /welcome → title</span>
                                                        </div>
                                                        <p className="text-[9px] text-surface-200/25">{t('dashboard.userGroups.titleTemplateDesc')}</p>
                                                        <input type="text" maxLength={180} value={welcome.titleTemplate || ''}
                                                            onChange={e => setWelcome(prev => ({ ...prev, titleTemplate: e.target.value }))}
                                                            placeholder={t('dashboard.userGroups.titleTemplatePlaceholder') || 'e.g. Welcome to {group}! Solve to enter...'}
                                                            className="input-field !py-2 !text-xs w-full" />
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] text-surface-200/25">{(welcome.titleTemplate || '').length}/180</span>
                                                            {welcome.titleTemplate && (
                                                                <button onClick={() => {
                                                                    if (window.confirm(t('dashboard.userGroups.titleTemplateResetConfirm') || 'Reset title to default?')) {
                                                                        setWelcome(prev => ({ ...prev, titleTemplate: '' }));
                                                                    }
                                                                }}
                                                                    className="text-[9px] text-red-400/60 hover:text-red-400">
                                                                    {t('dashboard.userGroups.titleTemplateReset') || 'Reset to default'}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* #5: Template variables */}
                                                        <div className="flex flex-wrap gap-1">
                                                            {TEMPLATE_VARS.map(v => (
                                                                <button key={v.var} title={v.desc}
                                                                    onClick={() => {
                                                                        setWelcome(prev => ({ ...prev, titleTemplate: (prev.titleTemplate || '') + v.var }));
                                                                    }}
                                                                    className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400/70 hover:text-brand-400 hover:bg-brand-500/20 transition-all font-mono border border-brand-500/10">
                                                                    {v.var}
                                                                </button>
                                                            ))}
                                                            <span className="text-[8px] text-surface-200/20 self-center ml-1">{t('dashboard.userGroups.clickToInsert') || 'click to insert'}</span>
                                                        </div>

                                                        {/* #3: Live message preview */}
                                                        {welcome.titleTemplate && (
                                                            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1">
                                                                <span className="text-[8px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.userGroups.livePreview') || 'Live Preview'}</span>
                                                                <p className="text-xs text-surface-100">
                                                                    {(welcome.titleTemplate || '')
                                                                        .replace(/\{group\}/g, group.title || 'My Group')
                                                                        .replace(/\{user\}/g, 'John')
                                                                        .replace(/\{time\}/g, `${welcome.timeLimitSeconds}s`)
                                                                        .replace(/\{attempts\}/g, String(welcome.maxAttempts))}
                                                                </p>
                                                                <p className="text-[9px] text-surface-200/25 italic">❓ {t('dashboard.userGroups.previewHintInline') || 'Click "Preview" above to see a sample question here'}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ── #10: Export / Import Settings ── */}
                                                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-2">
                                                        <label className="text-xs text-surface-200/40">{t('dashboard.userGroups.exportImport') || '📋 Export / Import'}</label>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => {
                                                                try {
                                                                    const { _preview, stats, ...exportData } = welcome;
                                                                    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
                                                                        .then(() => toast.success(t('dashboard.userGroups.exportCopied') || 'Settings copied to clipboard!'))
                                                                        .catch(() => toast.error('Clipboard access denied'));
                                                                } catch (err) { toast.error(err.message); }
                                                            }}
                                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.03] text-surface-200/50 border border-transparent hover:bg-white/5 transition-all">
                                                                📤 {t('dashboard.userGroups.exportBtn') || 'Export'}
                                                            </button>
                                                            <button onClick={() => {
                                                                navigator.clipboard.readText().then(text => {
                                                                    try {
                                                                        const data = JSON.parse(text);
                                                                        if (typeof data.enabled !== 'boolean') throw new Error('Invalid');
                                                                        const ALLOWED = ['enabled', 'timeLimitSeconds', 'maxAttempts', 'action', 'questionWeights', 'titleTemplate'];
                                                                        const safe = {};
                                                                        for (const k of ALLOWED) { if (k in data) safe[k] = data[k]; }
                                                                        if (safe.action && !['kick', 'ban', 'mute'].includes(safe.action)) delete safe.action;
                                                                        setWelcome(prev => ({ ...prev, ...safe }));
                                                                        toast.success(t('dashboard.userGroups.importSuccess') || 'Settings imported!');
                                                                    } catch { toast.error(t('dashboard.userGroups.importError') || 'Invalid settings JSON in clipboard'); }
                                                                }).catch(() => toast.error(t('dashboard.userGroups.importError') || 'Cannot read clipboard'));
                                                            }}
                                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.03] text-surface-200/50 border border-transparent hover:bg-white/5 transition-all">
                                                                📥 {t('dashboard.userGroups.importBtn') || 'Import'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                );
                                            })()}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Language Tab */}
                            {tab === 'language' && (
                                <div className="space-y-4">
                                    <p className="text-xs text-surface-200/40">{t('dashboard.userGroups.langDesc') || 'Set the language for bot responses in this group'}</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {Object.entries(LANG_FLAGS).map(([code, flag]) => (
                                            <button key={code} onClick={() => setGroupLang(code)}
                                                className={`flex items-center gap-2.5 p-3 rounded-xl transition-all ${groupLang === code
                                                    ? 'bg-brand-500/15 border border-brand-500/30 text-brand-400'
                                                    : 'bg-white/[0.02] border border-transparent text-surface-200/60 hover:bg-white/5'}`}>
                                                <span className="text-lg">{flag}</span>
                                                <span className="text-sm font-medium">{LANG_LABELS[code]}</span>
                                            </button>
                                        ))}
                                    </div>
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
                                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                                        placeholder={t('dashboard.groupDetail.msgPlaceholder') || 'Type your message (HTML supported)...'}
                                        className="input-field w-full h-28 !text-sm resize-none" />
                                    <button onClick={sendMsg} disabled={sendingMsg || !message.trim()} className="btn-primary text-xs flex items-center gap-2 disabled:opacity-30">
                                        {sendingMsg ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                        {t('dashboard.groupDetail.sendBtn') || 'Send Message'}
                                    </button>
                                    <p className="text-[10px] text-surface-200/30 mt-1">
                                        Telegram: {'<b> <i> <u> <s> <code> <pre> <a> <blockquote>'}
                                    </p>
                                    {msgSent && <p className="text-xs text-emerald-400">✅ {t('dashboard.groupDetail.msgSent') || 'Message sent!'}</p>}
                                </div>
                            )}

                            {/* Moderation Tab */}
                            {tab === 'moderation' && (
                                <div className="space-y-4">
                                    {/* Sync indicator */}
                                    {lastSynced && (
                                        <div className="flex items-center gap-2 text-[10px] text-emerald-400/70">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            ⚡ Synced with Telegram · {new Date(lastSynced).toLocaleTimeString()}
                                            <span className="text-surface-200/30">· auto-refresh 30s</span>
                                        </div>
                                    )}
                                    {modLoading ? (
                                        <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-red-400" /></div>
                                    ) : (
                                        <>
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
                                                            m.username.toLowerCase().includes(modSearch.toLowerCase()) ||
                                                            m.userId.includes(modSearch)
                                                        ))
                                                        .map(m => (
                                                            <div key={m.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/30 hover:bg-surface-800/50 transition-colors">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="text-xs text-surface-200/60 truncate">
                                                                        {m.firstName}{m.username ? ` @${m.username}` : ''}
                                                                    </span>
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.status === 'creator' ? 'bg-amber-500/15 text-amber-400' : 'bg-brand-500/10 text-brand-400'}`}>
                                                                        {m.status}
                                                                    </span>
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
                                                            placeholder="Reason (optional)" className="input-field !py-1.5 !text-xs w-full" />
                                                    )}
                                                    <div className="flex gap-2">
                                                        <button onClick={handleModAction} disabled={modActing}
                                                            className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                                                            {modActing ? <Loader2 size={12} className="animate-spin" /> : null} Confirm
                                                        </button>
                                                        <button onClick={() => setModAction(null)}
                                                            className="px-3 py-1.5 rounded-lg bg-surface-800/60 text-surface-200/50 text-xs">Cancel</button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Recent Warnings */}
                                            {modWarnings.length > 0 && (
                                                <div className="space-y-1">
                                                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
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
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Price Alerts Tab */}
                            {tab === 'pricealerts' && (
                                <div className="space-y-4">
                                    {paLoading ? (
                                        <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-amber-400" /></div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-surface-200/40">{t('dashboard.userGroups.priceAlertsDesc') || 'Manage automated price alerts for this group (max 3 tokens).'}</p>
                                                {lastSynced && (
                                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400/70 whitespace-nowrap">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        ⚡ {new Date(lastSynced).toLocaleTimeString()}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-surface-200/25 -mt-2">{t('dashboard.userGroups.priceAlertsHint')}</p>

                                            {/* Token List */}
                                            {paTokens.length > 0 ? (
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                                                        <TrendingUp size={12} className="text-emerald-400" /> {t('dashboard.userGroups.priceAlerts')} ({paTokens.length}/3)
                                                        <span className="text-[9px] text-surface-200/25 font-mono font-normal">/listtokens</span>
                                                    </h4>
                                                    {paTokens.map(tk => (
                                                        <div key={tk.id} className={`p-3 rounded-xl border transition-all ${tk.enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.02] border-white/5'}`}>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <TrendingUp size={14} className={tk.enabled ? 'text-emerald-400' : 'text-surface-200/30'} />
                                                                    <span className="text-sm font-semibold text-surface-100 truncate">{tk.tokenLabel || tk.tokenAddress.slice(0, 10) + '...'}</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40">{tk.chainShortName || 'xlayer'}</span>
                                                                </div>
                                                                <button onClick={() => updatePaToken(tk.id, { enabled: !tk.enabled })}
                                                                    className={`w-9 h-4.5 rounded-full transition-all relative ${tk.enabled ? 'bg-emerald-500' : 'bg-surface-700'}`}>
                                                                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${tk.enabled ? 'left-[1.125rem]' : 'left-0.5'}`} />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40 flex items-center gap-1">
                                                                    <Timer size={9} /> {INTERVAL_OPTIONS.find(o => o.value === tk.intervalSeconds)?.label || `${tk.intervalSeconds}s`}
                                                                </span>
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40 flex items-center gap-1">
                                                                    <Tag size={9} /> {tk.titleCount || 0} titles
                                                                </span>
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40 flex items-center gap-1">
                                                                    📷 {tk.mediaCount || 0} media
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-surface-200/30 font-mono truncate mb-2">{tk.tokenAddress}</p>
                                                            <div className="flex gap-1">
                                                                <button onClick={() => setPaEditing(paEditing === tk.id ? null : tk.id)} title="Edit token label & interval"
                                                                    className="px-2 py-1 rounded text-[10px] bg-brand-500/10 text-brand-400 hover:bg-brand-500/20">✏️ {t('dashboard.userGroups.editToken')}</button>
                                                                <button onClick={() => loadTitles(tk.id)} title={t('dashboard.userGroups.titlesHint')}
                                                                    className="px-2 py-1 rounded text-[10px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">📝 {t('dashboard.userGroups.manageTitles')}</button>
                                                                <button onClick={() => sendNow(tk.id)} title="Trigger immediate price alert — updates nextRunAt"
                                                                    className="px-2 py-1 rounded text-[10px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-0.5">
                                                                    <Play size={9} /> {t('dashboard.userGroups.sendNow')}
                                                                </button>
                                                                <button onClick={() => deletePaToken(tk.id)} title="Telegram: /rmtoken — Remove this token"
                                                                    className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center gap-0.5">
                                                                    <Trash2 size={9} /> {t('dashboard.userGroups.deleteToken')}
                                                                </button>
                                                            </div>

                                                            {/* Edit Form */}
                                                            {paEditing === tk.id && (
                                                                <div className="mt-2 p-2 bg-surface-800/40 rounded-lg space-y-2">
                                                                    <div>
                                                                        <label className="text-[10px] text-surface-200/40">Label</label>
                                                                        <input defaultValue={tk.tokenLabel || ''} id={`pa-label-${tk.id}`}
                                                                            className="input-field !py-1 !text-xs w-full" />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] text-surface-200/40">Interval</label>
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {INTERVAL_OPTIONS.map(opt => (
                                                                                <button key={opt.value} id={`pa-int-${tk.id}-${opt.value}`}
                                                                                    onClick={() => {
                                                                                        document.querySelectorAll(`[id^="pa-int-${tk.id}-"]`).forEach(b => b.classList.remove('!bg-brand-500/20', '!text-brand-400'));
                                                                                        document.getElementById(`pa-int-${tk.id}-${opt.value}`)?.classList.add('!bg-brand-500/20', '!text-brand-400');
                                                                                    }}
                                                                                    className={`px-2 py-1 rounded text-[10px] ${tk.intervalSeconds === opt.value ? '!bg-brand-500/20 !text-brand-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                                                                    {opt.label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={() => {
                                                                        const label = document.getElementById(`pa-label-${tk.id}`)?.value;
                                                                        const activeInt = document.querySelector(`[id^="pa-int-${tk.id}-"].\\!bg-brand-500\\/20`);
                                                                        const interval = activeInt ? Number(activeInt.id.split('-').pop()) : tk.intervalSeconds;
                                                                        updatePaToken(tk.id, { tokenLabel: label, intervalSeconds: interval });
                                                                    }} disabled={paSaving}
                                                                        className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                                                                        {paSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-surface-200/30 text-center py-4">{t('dashboard.userGroups.noPriceAlerts') || 'No price alerts configured. Add a token below.'}</p>
                                            )}

                                            {/* Add Token Form */}
                                            {paTokens.length < 3 && (
                                                <div className="bg-surface-800/30 rounded-xl p-3 space-y-2">
                                                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                                                        <Plus size={12} className="text-emerald-400" /> {t('dashboard.userGroups.addToken') || 'Add Token'}
                                                        <span className="text-[9px] text-surface-200/25 font-mono font-normal">/addtoken {'<address>'}</span>
                                                    </h4>
                                                    <input value={paForm.tokenAddress} onChange={e => setPaForm(p => ({ ...p, tokenAddress: e.target.value }))}
                                                        placeholder={t('dashboard.userGroups.tokenAddress') || 'Token contract address'} className="input-field !py-1.5 !text-xs w-full" />
                                                    <input value={paForm.tokenLabel} onChange={e => setPaForm(p => ({ ...p, tokenLabel: e.target.value }))}
                                                        placeholder={t('dashboard.userGroups.tokenLabel') || 'Label (e.g. BANMAO)'} className="input-field !py-1.5 !text-xs w-full" />
                                                    <div>
                                                        <label className="text-[10px] text-surface-200/40 mb-1 block">Interval</label>
                                                        <div className="flex flex-wrap gap-1">
                                                            {INTERVAL_OPTIONS.map(opt => (
                                                                <button key={opt.value} onClick={() => setPaForm(p => ({ ...p, intervalSeconds: opt.value }))}
                                                                    className={`px-2 py-1 rounded text-[10px] ${paForm.intervalSeconds === opt.value ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                                                    {opt.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {/* Chain Selector */}
                                                    <div>
                                                        <label className="text-[10px] text-surface-200/40 mb-1 block">{t('dashboard.userGroups.chain') || 'Chain'}</label>
                                                        <div className="flex flex-wrap gap-1">
                                                            {PA_CHAINS.map(ch => (
                                                                <button key={ch.chainIndex} onClick={() => setPaForm(p => ({ ...p, chainIndex: ch.chainIndex, chainShortName: ch.shortName }))}
                                                                    className={`px-2 py-1 rounded text-[10px] ${paForm.chainIndex === ch.chainIndex ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                                                    {ch.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <button onClick={addPriceAlertToken} disabled={paAdding || !paForm.tokenAddress.trim()}
                                                        className="btn-primary !text-xs !px-3 !py-1.5 flex items-center gap-1 disabled:opacity-30">
                                                        {paAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add Token
                                                    </button>
                                                </div>
                                            )}

                                            {/* Custom Titles Manager */}
                                            {paSelectedToken && (
                                                <div className="bg-surface-800/30 rounded-xl p-3 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                                                            <Tag size={12} className="text-amber-400" /> {t('dashboard.userGroups.manageTitles')} (#{paSelectedToken})
                                                            <span className="text-[9px] text-surface-200/25 font-mono font-normal">/title</span>
                                                        </h4>
                                                        <button onClick={() => { setPaSelectedToken(null); setPaTitles([]); }}
                                                            className="text-surface-200/30 hover:text-surface-200"><X size={12} /></button>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input value={paTitleInput} onChange={e => setPaTitleInput(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && addTitle()}
                                                            placeholder="Enter custom title..." className="input-field !py-1.5 !text-xs flex-1" />
                                                        <button onClick={addTitle} className="btn-primary !text-xs !px-2 !py-1.5">+</button>
                                                    </div>
                                                    {paTitles.length > 0 && (
                                                        <div className="space-y-1 max-h-32 overflow-y-auto">
                                                            {paTitles.map(title => (
                                                                <div key={title.id} className="flex items-center justify-between px-2 py-1 rounded bg-surface-800/30 text-xs">
                                                                    <span className="text-surface-200/60 truncate">{title.title}</span>
                                                                    <button onClick={() => deleteTitle(title.id)} className="text-red-400/50 hover:text-red-400"><X size={10} /></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <p className="text-[10px] text-surface-200/25">{paTitles.length}/44 titles — {t('dashboard.userGroups.titlesHint')}</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-end">
                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn-secondary !text-xs !px-4 !py-2">
                            {t('dashboard.common.cancel') || 'Cancel'}
                        </button>
                        {tab === 'welcome' && (
                            <button onClick={saveWelcomeSettings} disabled={savingWelcome} className="btn-primary !text-xs !px-4 !py-2 flex items-center gap-1.5">
                                {savingWelcome ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                                {t('dashboard.common.save') || 'Save'}
                            </button>
                        )}
                        {tab === 'language' && (
                            <button onClick={saveLanguage} disabled={savingLang} className="btn-primary !text-xs !px-4 !py-2 flex items-center gap-1.5">
                                {savingLang ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                                {t('dashboard.common.save') || 'Save'}
                            </button>
                        )}
                        {(tab === 'settings' || tab === 'subscription') && (
                            <button onClick={saveSettings} disabled={saving} className="btn-primary !text-xs !px-4 !py-2 flex items-center gap-1.5">
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                                {t('dashboard.common.save') || 'Save'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════
   Group Card
   ═══════════════════════════════════════════════ */
function UserGroupCard({ group, onClick, onSync }) {
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
                    <span>{group.memberCount || '?'} {t('dashboard.groups.members') || 'Members'}</span>
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
   Main User Groups Page
   ═══════════════════════════════════════════════ */
export default function UserGroupsPage() {
    const { t } = useTranslation();
    const toast = useToastStore();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState(null);

    const fetchGroups = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getUserGroups();
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
    };

    const handleSync = async (chatId) => {
        try {
            const result = await api.syncUserGroupMembers(chatId);
            setGroups(prev => prev.map(g => g.chatId === chatId ? { ...g, memberCount: result.memberCount } : g));
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                    <MessageSquare size={22} className="text-brand-400" />
                    {t('dashboard.userGroups.title') || 'My Groups'}
                </h1>
                <button onClick={fetchGroups} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                    { label: t('dashboard.userGroups.totalGroups') || 'My Groups', value: stats.total, icon: '💬', color: 'text-surface-100' },
                    { label: t('dashboard.groupDetail.totalMembers') || 'Total Members', value: stats.totalMembers || '?', icon: '👥', color: 'text-brand-400' },
                    { label: t('dashboard.groupDetail.activeGroups') || 'Active (7d)', value: stats.active, icon: '🟢', color: 'text-emerald-400' },
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
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('dashboard.groups.searchPlaceholder') || 'Search groups...'}
                    className="input-field !pl-10 !py-2 !text-sm" />
            </div>

            {/* Info note */}
            <div className="text-xs text-surface-200/30 bg-brand-500/5 border border-brand-500/10 rounded-xl p-3 flex items-start gap-2">
                <Shield size={14} className="text-brand-400/50 flex-shrink-0 mt-0.5" />
                <span>{t('dashboard.userGroups.info') || 'Only groups where you are an admin and the bot is active are shown here.'}</span>
            </div>

            {/* Groups grid */}
            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <MessageSquare size={40} className="mx-auto text-surface-200/15 mb-4" />
                    <h2 className="text-lg font-semibold text-surface-100 mb-2">{t('dashboard.userGroups.noGroups') || 'No groups found'}</h2>
                    <p className="text-sm text-surface-200/40">{t('dashboard.userGroups.noGroupsHint') || 'Add the bot to a group as admin to manage it here.'}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((g) => (
                        <UserGroupCard key={g.chatId} group={g} onClick={() => setSelectedGroup(g)} onSync={handleSync} />
                    ))}
                </div>
            )}

            {/* Detail Modal */}
            {selectedGroup && (
                <UserGroupDetailModal
                    group={selectedGroup}
                    onClose={() => setSelectedGroup(null)}
                    onRefresh={fetchGroups}
                />
            )}
        </div>
    );
}
