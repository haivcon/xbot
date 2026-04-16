import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import CheckinTab from '@/components/groups/CheckinTab';
import WelcomeTab from '@/components/groups/WelcomeTab';
import ModerationTab from '@/components/groups/ModerationTab';
import PriceAlertsTab from '@/components/groups/PriceAlertsTab';
import LanguageTab from '@/components/groups/LanguageTab';
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
    const [paMedia, setPaMedia] = useState([]);
    const [paMediaInput, setPaMediaInput] = useState('');
    const [paMediaToken, setPaMediaToken] = useState(null);

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

    // Synced with Telegram bot INTERVAL_OPTIONS (priceAlerts.js line 67)
    const INTERVAL_OPTIONS = [
        { value: 60, label: '1m' },
        { value: 120, label: '2m' },
        { value: 300, label: '5m' },
        { value: 600, label: '10m' },
        { value: 1800, label: '30m' },
        { value: 3600, label: '1h' },
        { value: 7200, label: '2h' },
        { value: 18000, label: '5h' },
        { value: 43200, label: '12h' },
        { value: 86400, label: '24h' },
    ];

    const addPriceAlertToken = async () => {
        if (!paForm.tokenAddress.trim()) return;
        setPaAdding(true);
        try {
            await api.addPriceAlert(group.chatId, paForm);
            toast.success(t('dashboard.userGroups.tokenAdded') || 'Token added!');
            setPaForm({ tokenAddress: '', tokenLabel: '', intervalSeconds: 3600, chainIndex: '196', chainShortName: 'xlayer' });
            const r = await api.getPriceAlerts(group.chatId);
            setPaTokens(r?.tokens || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
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
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setPaSaving(false);
    };

    const deletePaToken = async (tokenId) => {
        try {
            await api.deletePriceAlert(group.chatId, tokenId);
            toast.success(t('dashboard.userGroups.tokenDeleted') || 'Token deleted!');
            setPaTokens(prev => prev.filter(tk => tk.id !== tokenId));
            if (paSelectedToken === tokenId) { setPaSelectedToken(null); setPaTitles([]); }
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const sendNow = async (tokenId) => {
        try {
            await api.sendPriceAlertNow(group.chatId, tokenId);
            toast.success(t('dashboard.userGroups.alertSent') || 'Alert sent!');
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
            toast.success(t('dashboard.userGroups.titleAdded') || 'Title added!');
            setPaTitleInput('');
            const r = await api.getPriceAlertTitles(group.chatId, paSelectedToken);
            setPaTitles(r?.titles || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const deleteTitle = async (titleId) => {
        try {
            await api.deletePriceAlertTitle(group.chatId, titleId);
            toast.success(t('dashboard.userGroups.titleDeleted') || 'Title deleted!');
            setPaTitles(prev => prev.filter(tl => tl.id !== titleId));
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const loadMedia = async (tokenId) => {
        setPaMediaToken(tokenId);
        try {
            const r = await api.getPriceAlertMedia(group.chatId, tokenId);
            setPaMedia(r?.media || []);
        } catch { setPaMedia([]); }
    };

    const addMedia = async () => {
        if (!paMediaInput.trim() || !paMediaToken) return;
        try {
            await api.addPriceAlertMedia(group.chatId, paMediaToken, 'photo', paMediaInput.trim());
            toast.success(t('dashboard.userGroups.mediaAdded') || 'Media added!');
            setPaMediaInput('');
            const r = await api.getPriceAlertMedia(group.chatId, paMediaToken);
            setPaMedia(r?.media || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const deleteMedia = async (mediaId) => {
        try {
            await api.deletePriceAlertMedia(group.chatId, mediaId);
            toast.success(t('dashboard.userGroups.mediaDeleted') || 'Media deleted!');
            setPaMedia(prev => prev.filter(m => m.id !== mediaId));
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
            <div className="bg-surface-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-fadeIn" onClick={e => e.stopPropagation()}>
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
                <div className="flex flex-wrap gap-y-1 border-b border-white/5 px-2">
                    {tabs.map(tb => (
                        <button key={tb.id} onClick={() => setTab(tb.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === tb.id
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
                            {tab === 'checkin' && <CheckinTab group={group} onRefresh={onRefresh} />}

                            {/* Welcome Tab */}
                            {tab === 'welcome' && <WelcomeTab group={group} onRefresh={onRefresh} />}

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
                            {tab === 'moderation' && <ModerationTab group={group} detail={detail} />}

                            {/* Price Alerts Tab */}
                            {tab === 'pricealerts' && <PriceAlertsTab group={group} />}
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
