import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import useWsStore from '@/stores/wsStore';
import useThemeStore from '@/stores/themeStore';
import useAuthStore from '@/stores/authStore';
import { SkeletonStatCards, SkeletonCard } from '@/components/Skeleton';

const AnalyticsSection = lazy(() => import('./AnalyticsPage'));
import {
    Activity,
    Database,
    HardDrive,
    Cpu,
    Clock,
    RefreshCw,
    Layers,
    Users,
    MessageSquare,
    Wifi,
    Zap,
    UserPlus,
    Terminal,
    History,
    Settings2,
    Eye,
    EyeOff,
    GripVertical,
    Wallet,
    Fuel,
    Bell,
    TrendingUp,
    Plus,
    Trash2,
    X,
    Calendar,
    Hash,
} from 'lucide-react';

const ACTION_ICONS = {
    settings_update: '⚙️',
    message_sent: '💬',
    group_deleted: '🗑️',
    member_sync: '🔄',
    broadcast: '📡',
};

function timeAgo(ts) {
    if (!ts) return '—';
    const sec = Math.floor(Date.now() / 1000) - ts;
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

/* ── #12 Sparkline SVG Component ── */
function Sparkline({ data = [], width = 60, height = 20, color = '#60a5fa' }) {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 2) - 1;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={width} height={height} className="inline-block ml-2 opacity-60">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function StatCard({ icon: Icon, label, value, sub, color = 'brand', sparkData }) {
    const colors = {
        brand: 'text-brand-400 bg-brand-500/10',
        emerald: 'text-emerald-400 bg-emerald-500/10',
        amber: 'text-amber-400 bg-amber-500/10',
        rose: 'text-rose-400 bg-rose-500/10',
        cyan: 'text-cyan-400 bg-cyan-500/10',
        purple: 'text-purple-400 bg-purple-500/10',
    };
    const sparkColors = {
        brand: '#818cf8', emerald: '#34d399', amber: '#fbbf24',
        rose: '#fb7185', cyan: '#22d3ee', purple: '#a78bfa',
    };
    return (
        <div className="stat-card">
            <div className="flex items-center gap-2.5 sm:gap-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${colors[color]}`}>
                    <Icon size={16} className="sm:hidden" />
                    <Icon size={20} className="hidden sm:block" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] sm:text-xs text-surface-200/50 font-medium truncate">{label}</p>
                    <div className="flex items-center">
                        <p className="text-base sm:text-xl font-bold text-surface-100 truncate">{value}</p>
                        {sparkData && <Sparkline data={sparkData} color={sparkColors[color] || '#60a5fa'} />}
                    </div>
                    {sub && <p className="text-[10px] sm:text-xs text-surface-200/40 mt-0.5 truncate">{sub}</p>}
                </div>
            </div>
        </div>
    );
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/* ── #14 Default Watchlist tokens ── */
const DEFAULT_WATCHLIST = [
    { name: 'Banmao', symbol: 'BANMAO', addr: '0x16d91d1615fc55b76d5f92365bd60c069b46ef78', logo: '/logos/banmao.png', color: 'text-amber-400' },
    { name: 'Niuma', symbol: 'NIUMA', addr: '0x87669801a1fad6dad9db70d27ac752f452989667', logo: '/logos/niuma.png', color: 'text-red-400' },
    { name: 'Xwizard', symbol: 'XWIZARD', addr: '0xdcc83b32b6b4e95a61951bfcc9d71967515c0fca', logo: '/logos/xwizard.png', color: 'text-purple-400' },
];

const WATCHLIST_STORAGE_KEY = 'dashboard_watchlist';

function getStoredWatchlist() {
    try {
        const s = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        return s ? JSON.parse(s) : DEFAULT_WATCHLIST;
    } catch { return DEFAULT_WATCHLIST; }
}

/* ── #1 + #14 Watchlist with AbortController + Customizable ── */
function WatchlistTokens({ tokens }) {
    const [prices, setPrices] = useState({});
    // Stable dependency key to prevent infinite re-renders when parent re-renders with a new tokens array reference
    const tokenKey = tokens.map(t => t.addr).join(',');
    useEffect(() => {
        if (!tokens.length) return;
        const controller = new AbortController();
        let iv;
        async function fetchPrices() {
            try {
                const body = tokens.map(t => ({ chainIndex: '196', tokenContractAddress: t.addr }));
                const json = await api.getTokenPrice(body);
                if (controller.signal.aborted) return; // #1: guard
                if (Array.isArray(json?.data)) {
                    const m = {};
                    for (const item of json.data) {
                        const a = (item.tokenContractAddress || '').toLowerCase();
                        m[a] = parseFloat(item.price);
                    }
                    setPrices(m);
                }
            } catch { /* ignore */ }
        }
        fetchPrices();
        iv = setInterval(fetchPrices, 30000);
        return () => { controller.abort(); clearInterval(iv); }; // #1: cleanup
    }, [tokenKey]);

    const fmtP = (p) => {
        if (!p) return '—';
        if (p < 1) {
            const s = p.toFixed(18);
            const match = s.match(/^0\.(0*)/);
            const lz = match ? match[1].length : 0;
            return '$' + s.slice(0, 2 + lz + 4);
        }
        return `$${(Math.floor(p * 100) / 100).toFixed(2)}`;
    };

    return (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {tokens.map(tk => {
                const p = prices[tk.addr.toLowerCase()];
                return (
                    <a key={tk.addr} href={`https://web3.okx.com/token/x-layer/${tk.addr}`} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 p-2 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all group/wl">
                        <img src={tk.logo} alt={tk.name} className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }} />
                        <div className="flex-1 min-w-0 text-center sm:text-left">
                            <p className="text-[11px] sm:text-sm font-semibold text-surface-100 truncate">{tk.name}</p>
                            <p className="text-[9px] sm:text-[10px] text-surface-200/40">{tk.symbol}</p>
                        </div>
                        <span className="text-[11px] sm:text-sm font-bold text-surface-100 tabular-nums">{fmtP(p)}</span>
                    </a>
                );
            })}
        </div>
    );
}

/* ── #14 Add Token Modal (Portal to escape stacking context) ── */
function AddTokenModal({ open, onClose, onAdd }) {
    const { t } = useTranslation();
    const [addr, setAddr] = useState('');
    const [name, setName] = useState('');
    const [symbol, setSymbol] = useState('');
    if (!open) return null;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={onClose}>
            <div className="bg-surface-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-surface-100">{t('dashboard.overview.addToken')}</h3>
                    <button onClick={onClose} className="text-surface-200/40 hover:text-surface-200/80"><X size={16} /></button>
                </div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={t('dashboard.overview.tokenNamePlaceholder')}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-surface-100 placeholder-surface-200/30 focus:outline-none focus:border-brand-500/50" />
                <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder={t('dashboard.overview.symbolPlaceholder')}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-surface-100 placeholder-surface-200/30 focus:outline-none focus:border-brand-500/50" />
                <input value={addr} onChange={e => setAddr(e.target.value)} placeholder={t('dashboard.overview.addrPlaceholder')}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-surface-100 placeholder-surface-200/30 focus:outline-none focus:border-brand-500/50 font-mono text-xs" />
                <button
                    onClick={() => {
                        if (!addr || !name || !symbol) return;
                        onAdd({ name, symbol, addr: addr.toLowerCase(), logo: '', color: 'text-brand-400' });
                        setAddr(''); setName(''); setSymbol('');
                        onClose();
                    }}
                    disabled={!addr || !name || !symbol}
                    className="w-full btn-primary !py-2.5 disabled:opacity-30"
                >
                    <Plus size={14} className="inline mr-1" /> {t('dashboard.overview.addToWatchlist')}
                </button>
            </div>
        </div>,
        document.body
    );
}

/* ── #8 Retry helper ── */
async function fetchWithRetry(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

export default function DashboardPage() {
    const { t } = useTranslation();
    const { isOwnerView, user } = useAuthStore();
    const ownerMode = isOwnerView();
    const [health, setHealth] = useState(null);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
    const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
    const wsNotifications = useWsStore((s) => s.notifications);
    const wsLastEvent = useWsStore((s) => s.lastEvent);

    // #7: Last updated timestamp
    const [lastUpdated, setLastUpdated] = useState(null);
    const [lastUpdatedAgo, setLastUpdatedAgo] = useState('');

    useEffect(() => {
        if (!lastUpdated) return;
        const tick = () => {
            const sec = Math.floor((Date.now() - lastUpdated) / 1000);
            if (sec < 5) setLastUpdatedAgo('just now');
            else if (sec < 60) setLastUpdatedAgo(`${sec}s ago`);
            else setLastUpdatedAgo(`${Math.floor(sec / 60)}m ago`);
        };
        tick();
        const iv = setInterval(tick, 10000);
        return () => clearInterval(iv);
    }, [lastUpdated]);

    // #6: Personal stats for users
    const [personalStats, setPersonalStats] = useState(null);

    // #12: Sparkline data history
    const gasHistory = useRef([]);
    const portfolioHistory = useRef([]);
    const memHistory = useRef([]);

    // #5: Widget customization with user-scoped key
    const widgetKey = `dashboard_widgets_${user?.id || 'anon'}`;
    const DEFAULT_WIDGETS = [
        { id: 'live', label: t('dashboard.overview.widgetLiveStats'), visible: true },
        { id: 'overview', label: t('dashboard.overview.widgetOverview'), visible: true },
        { id: 'status', label: t('dashboard.overview.widgetSystem'), visible: true },
        { id: 'health', label: t('dashboard.overview.widgetHealth'), visible: true },
        { id: 'activity', label: t('dashboard.overview.widgetActivity'), visible: true },
    ];
    const [widgets, setWidgets] = useState(() => {
        try {
            const saved = localStorage.getItem(widgetKey);
            return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
        } catch { return DEFAULT_WIDGETS; }
    });
    const saveWidgets = (w) => { setWidgets(w); localStorage.setItem(widgetKey, JSON.stringify(w)); };
    const toggleWidget = (id) => saveWidgets(widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
    const moveWidget = (idx, dir) => {
        const arr = [...widgets];
        const target = idx + dir;
        if (target < 0 || target >= arr.length) return;
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        saveWidgets(arr);
    };
    const isVisible = (id) => widgets.find(w => w.id === id)?.visible !== false;

    // #9: Click-outside close for widget settings
    const widgetSettingsRef = useRef(null);
    useEffect(() => {
        if (!widgetSettingsOpen) return;
        const handle = (e) => {
            if (widgetSettingsRef.current && !widgetSettingsRef.current.contains(e.target)) {
                setWidgetSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [widgetSettingsOpen]);

    // #2: Fetch guard to prevent spam
    const isFetching = useRef(false);

    // #8: fetchAll with retry
    const fetchAll = useCallback(async () => {
        if (isFetching.current) return; // #2: guard
        isFetching.current = true;
        try {
            setLoading(true);
            await fetchWithRetry(async () => {
                const promises = [
                    api.getHealth(),
                    ownerMode ? api.getOverview() : api.getUserOverview(),
                ];
                if (ownerMode) promises.push(api.getRecentActivity(10));
                const results = await Promise.allSettled(promises);
                if (results[0].status === 'fulfilled') setHealth(results[0].value);
                if (results[1].status === 'fulfilled') {
                    setOverview(results[1].value);
                    // #12: Track memory sparkline
                    const mem = results[1].value?.memory?.heapUsed;
                    if (mem != null) {
                        memHistory.current = [...memHistory.current, mem].slice(-7);
                    }
                }
                if (ownerMode && results[2]?.status === 'fulfilled') setRecentActivity(results[2].value?.logs || []);
                // if all fulfilled but no data to show, at least one must have succeeded
                if (results.every(r => r.status === 'rejected')) {
                    throw results[0].reason || new Error('All requests failed');
                }
            });
            setError(null);
            setLastUpdated(Date.now()); // #7
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
            isFetching.current = false;
        }
    }, [ownerMode]);

    // #3 + #4: Live stats with wallet cap + alerts guard
    const MAX_WALLET_BALANCE_CALLS = 5;
    const [liveStats, setLiveStats] = useState({ portfolio: null, gasPrice: null, alertsCount: null });
    useEffect(() => {
        const controller = new AbortController();
        async function fetchLive() {
            if (controller.signal.aborted) return;
            try {
                const baseCalls = [
                    api.getWallets(),
                    api.getGasPrice(),
                ];
                // #4: Only call getAlerts if owner
                if (ownerMode) baseCalls.push(api.getAlerts());
                const results = await Promise.allSettled(baseCalls);
                if (controller.signal.aborted) return;

                const wallets = results[0].status === 'fulfilled' ? (results[0].value?.wallets || []) : [];
                // #3: Cap wallet balance calls
                let totalUsd = 0;
                if (wallets.length > 0) {
                    const walletsToFetch = wallets.slice(0, MAX_WALLET_BALANCE_CALLS);
                    const balResults = await Promise.allSettled(
                        walletsToFetch.map(w => api.getWalletBalance(w.id))
                    );
                    if (controller.signal.aborted) return;
                    for (const r of balResults) {
                        if (r.status === 'fulfilled') {
                            const tokens = r.value?.data?.tokenAssets || [];
                            for (const tk of tokens) {
                                totalUsd += parseFloat(tk.tokenPrice || 0) * parseFloat(tk.holdingAmount || 0);
                            }
                        }
                    }
                }
                const gwei = results[1].status === 'fulfilled' ? parseFloat(results[1].value?.data?.[0]?.gasPrice || 0) : null;
                // #4: alerts only for owner
                const alerts = (ownerMode && results[2]?.status === 'fulfilled') ? (results[2].value?.alerts || []) : [];

                // #12: Track sparkline history
                if (gwei != null) gasHistory.current = [...gasHistory.current, gwei].slice(-7);
                portfolioHistory.current = [...portfolioHistory.current, totalUsd].slice(-7);

                if (!controller.signal.aborted) {
                    setLiveStats({
                        portfolio: totalUsd,
                        gasPrice: gwei,
                        alertsCount: ownerMode ? alerts.filter(a => a.enabled !== false).length : null,
                    });
                }
            } catch { /* ignore */ }
        }
        fetchLive();
        const iv = setInterval(fetchLive, 60000);
        return () => { controller.abort(); clearInterval(iv); };
    }, [ownerMode]);

    // #6: Fetch personal stats for non-owner users
    useEffect(() => {
        if (ownerMode) { setPersonalStats(null); return; }
        let cancelled = false;
        async function fetchPersonal() {
            try {
                const [statsRes, profileRes] = await Promise.allSettled([
                    api.getStats(),
                    api.getProfile(),
                ]);
                if (cancelled) return;
                const stats = statsRes.status === 'fulfilled' ? statsRes.value : {};
                const profile = profileRes.status === 'fulfilled' ? profileRes.value : {};
                const firstSeen = profile.user?.firstSeen;
                const daysSinceJoin = firstSeen ? Math.floor((Date.now() / 1000 - firstSeen) / 86400) : null;
                setPersonalStats({
                    totalCommands: stats.totalCommands || 0,
                    daysSinceJoin,
                    walletCount: stats.walletCount || 0,
                });
            } catch { /* ignore */ }
        }
        fetchPersonal();
        return () => { cancelled = true; };
    }, [ownerMode]);

    // #13: Listen for WS live_stats events (server pushes memory data every 30s)
    useEffect(() => {
        if (wsLastEvent?.type === 'live_stats') {
            const d = wsLastEvent.data;
            if (d?.heapUsed != null) {
                memHistory.current = [...memHistory.current, d.heapUsed].slice(-7);
            }
        }
    }, [wsLastEvent]);

    // Initial fetch + fallback polling every 30s
    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 30000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    // WS-driven auto-refresh: re-fetch when new WS events arrive
    useEffect(() => {
        if (wsLastEvent && wsLastEvent.type === 'group_activity') {
            const overviewCall = ownerMode ? api.getOverview() : api.getUserOverview();
            const promises = [overviewCall];
            if (ownerMode) promises.push(api.getRecentActivity(10));
            Promise.allSettled(promises).then((results) => {
                if (results[0].status === 'fulfilled') setOverview(results[0].value);
                if (ownerMode && results[1]?.status === 'fulfilled') setRecentActivity(results[1].value?.logs || []);
                setLastUpdated(Date.now()); // #7
            });
        }
    }, [wsLastEvent, ownerMode]);

    // Merge WS real-time notifications as top items in activity feed
    const mergedActivity = (() => {
        const wsItems = wsNotifications.slice(0, 5).map(n => ({
            id: n.id,
            action: n.action,
            details: n.details,
            chatId: n.chatId,
            createdAt: n.ts,
            _live: true,
        }));
        const existing = recentActivity.filter(
            a => !wsItems.some(w => w.createdAt === a.createdAt && w.action === a.action)
        );
        return [...wsItems, ...existing].slice(0, 10);
    })();

    // #14: Customizable watchlist state
    const [watchlist, setWatchlist] = useState(getStoredWatchlist);
    const [watchlistModified, setWatchlistModified] = useState(() => {
        try { return localStorage.getItem(WATCHLIST_STORAGE_KEY) != null; } catch { return false; }
    });
    const [showAddToken, setShowAddToken] = useState(false);
    const saveWatchlist = (next) => {
        setWatchlist(next);
        setWatchlistModified(true);
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
    };
    const addToken = (tk) => saveWatchlist([...watchlist, tk]);
    const removeToken = (addr) => saveWatchlist(watchlist.filter(t => t.addr.toLowerCase() !== addr.toLowerCase()));
    const resetWatchlist = () => {
        setWatchlist(DEFAULT_WATCHLIST);
        setWatchlistModified(false);
        localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    };

    if (loading && !health) {
        return (
            <div className="space-y-6">
                <SkeletonStatCards count={4} />
                <div className="grid grid-cols-2 md:grid-cols-2 gap-2.5 sm:gap-4">
                    <SkeletonCard lines={3} />
                    <SkeletonCard lines={3} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* #11: Subtle refresh indicator */}
            {loading && health && (
                <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-brand-500/20 overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: '30%', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.status.title')}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-surface-200/50">
                            {health?.now ? new Date(health.now).toLocaleString() : ''}
                        </p>
                        {/* #7: Auto-refresh indicator */}
                        {lastUpdatedAgo && (
                            <span className="text-[10px] text-surface-200/30 flex items-center gap-1">
                                <RefreshCw size={9} className="opacity-50" /> {lastUpdatedAgo}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* #9: Widget settings with click-outside */}
                    <div className="relative" ref={widgetSettingsRef}>
                        <button onClick={() => setWidgetSettingsOpen(!widgetSettingsOpen)}
                            className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                            <Settings2 size={14} />
                        </button>
                        {widgetSettingsOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-surface-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-[fadeIn_0.15s_ease]">
                                <div className="px-3 py-2 border-b border-white/5 text-xs font-medium text-surface-200/50">{t('dashboard.overview.customizeWidgets')}</div>
                                {widgets.map((w, i) => (
                                    <div key={w.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors">
                                        <div className="flex flex-col gap-0.5">
                                            <button onClick={() => moveWidget(i, -1)} disabled={i === 0}
                                                className="text-surface-200/20 hover:text-surface-200/50 disabled:opacity-20 transition-colors"><GripVertical size={10} /></button>
                                        </div>
                                        <button onClick={() => toggleWidget(w.id)}
                                            className={`p-1 rounded transition-colors ${w.visible ? 'text-brand-400' : 'text-surface-200/20'}`}>
                                            {w.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                                        </button>
                                        <span className={`text-xs flex-1 ${w.visible ? 'text-surface-100' : 'text-surface-200/30'}`}>{w.label}</span>
                                    </div>
                                ))}
                                <div className="px-3 py-2 border-t border-white/5">
                                    <button onClick={() => saveWidgets(DEFAULT_WIDGETS)} className="text-[10px] text-surface-200/30 hover:text-brand-400 transition-colors">{t('dashboard.overview.resetDefault')}</button>
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={fetchAll} className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        {t('dashboard.common.refresh')}
                    </button>
                </div>
            </div>

            {/* ── Live Stats Widget ── */}
            {isVisible('live') && (
                <div className={`grid items-start gap-2.5 sm:gap-4 ${ownerMode ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
                    <div className="glass-card p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                            <Wallet size={18} className="text-brand-400 sm:hidden" />
                            <Wallet size={22} className="text-brand-400 hidden sm:block" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] sm:text-xs text-surface-200/50 font-medium truncate">{t('dashboard.liveStats.portfolio') || 'Portfolio Value'}</p>
                            <div className="flex items-center">
                                <p className="text-lg sm:text-2xl font-bold text-surface-100 tabular-nums truncate">
                                    {liveStats.portfolio !== null ? `$${Math.floor(liveStats.portfolio * 100) / 100}` : '—'}
                                </p>
                                <Sparkline data={portfolioHistory.current} color="#818cf8" />
                            </div>
                        </div>
                    </div>
                    <div className="glass-card p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/10 flex items-center justify-center">
                            <Fuel size={18} className="text-amber-400 sm:hidden" />
                            <Fuel size={22} className="text-amber-400 hidden sm:block" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] sm:text-xs text-surface-200/50 font-medium truncate">{t('dashboard.liveStats.gasPrice') || 'Gas Price'}</p>
                            <div className="flex items-center">
                                <p className="text-lg sm:text-2xl font-bold text-surface-100 tabular-nums truncate">
                                    {liveStats.gasPrice !== null ? `${liveStats.gasPrice < 0.01 ? liveStats.gasPrice.toFixed(4) : liveStats.gasPrice.toFixed(2)} Gwei` : '—'}
                                </p>
                                <Sparkline data={gasHistory.current} color="#fbbf24" />
                            </div>
                        </div>
                    </div>
                    {/* #4: Only show alerts card for owner */}
                    {ownerMode && (
                    <div className="glass-card p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                            <Bell size={18} className="text-cyan-400 sm:hidden" />
                            <Bell size={22} className="text-cyan-400 hidden sm:block" />
                        </div>
                        <div>
                            <p className="text-[10px] sm:text-xs text-surface-200/50 font-medium">{t('dashboard.liveStats.activeAlerts') || 'Active Alerts'}</p>
                            <p className="text-lg sm:text-2xl font-bold text-surface-100 tabular-nums">
                                {liveStats.alertsCount !== null ? liveStats.alertsCount : '—'}
                            </p>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {/* ── Token Watchlist Widget (#14: Customizable) ── */}
            {isVisible('live') && liveStats.portfolio !== null && (
                <div className="glass-card p-3 sm:p-5">
                    <div className="flex items-center justify-between mb-2 sm:mb-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <TrendingUp size={16} className="text-emerald-400" />
                            <h3 className="text-sm sm:text-base font-semibold text-surface-100">{t('dashboard.liveStats.watchlist') || 'Token Watchlist'}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-surface-200/30">X Layer</span>
                            <button onClick={() => setShowAddToken(true)}
                                className="text-surface-200/30 hover:text-brand-400 transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
                                title="Add token">
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                    <WatchlistTokens tokens={watchlist} />
                    {/* Remove buttons under each token */}
                    {watchlist.length > 0 && (
                        <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-2 sm:mt-3">
                            {watchlist.map(tk => (
                                <button key={tk.addr} onClick={() => removeToken(tk.addr)}
                                    className="inline-flex items-center gap-1 text-[10px] text-surface-200/25 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/5 transition-colors">
                                    <Trash2 size={9} /> {tk.symbol}
                                </button>
                            ))}
                            {watchlistModified && (
                                <button onClick={resetWatchlist}
                                    className="text-[10px] text-surface-200/20 hover:text-brand-400 px-2 py-1 rounded-lg hover:bg-white/[0.03] transition-colors">
                                    {t('dashboard.overview.reset')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>
            )}

            {/* Overview Stats */}
            {overview && isVisible('overview') && (
                <div className={`grid items-start grid-cols-2 gap-2.5 sm:gap-4 ${ownerMode ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
                    {/* Owner-only stats */}
                    {ownerMode && (
                    <StatCard
                        icon={Users}
                        label={t('dashboard.users.total')}
                        value={overview.totalUsers}
                        sub={`${overview.activeUsers} ${t('dashboard.users.active').toLowerCase()}`}
                        color="brand"
                    />
                    )}
                    {ownerMode && (
                    <StatCard
                        icon={MessageSquare}
                        label={t('dashboard.groups.total')}
                        value={overview.totalGroups}
                        color="purple"
                    />
                    )}
                    {ownerMode && (
                    <StatCard
                        icon={UserPlus}
                        label={t('dashboard.overview.newToday') || 'New Today'}
                        value={overview.newUsersToday || 0}
                        sub={`${overview.newUsersWeek || 0} ${t('dashboard.overview.thisWeek')}`}
                        color="emerald"
                    />
                    )}
                    {ownerMode && (
                    <StatCard
                        icon={Terminal}
                        label={t('dashboard.overview.commandsToday') || 'Commands Today'}
                        value={overview.commandsToday || 0}
                        color="cyan"
                    />
                    )}
                    {/* #6: Personal stats for non-owner users */}
                    {!ownerMode && personalStats && (
                    <>
                        <StatCard icon={Hash} label={t('dashboard.overview.commandsUsed')} value={personalStats.totalCommands} color="cyan" />
                        <StatCard icon={Calendar} label={t('dashboard.overview.memberSince')} value={personalStats.daysSinceJoin != null ? `${personalStats.daysSinceJoin}d` : '—'} color="emerald" />
                    </>
                    )}
                    {/* Shared stats */}
                    <StatCard
                        icon={Wifi}
                        label={t('dashboard.overview.telegramApi')}
                        value={overview.telegramLatencyMs >= 0 ? `${overview.telegramLatencyMs}ms` : '—'}
                        color={overview.telegramLatencyMs > 500 ? 'rose' : 'emerald'}
                    />
                </div>
            )}

            {health && isVisible('status') && (
                <>
                    {/* Status indicator */}
                    <div className="glass-card p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
                        <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${health.status === 'ok' ? 'bg-emerald-500 animate-pulse-soft' : 'bg-amber-500'}`} />
                        <span className="text-base sm:text-lg font-semibold text-surface-100">
                            {health.status === 'ok' ? t('dashboard.status.online') : t('dashboard.status.degraded')}
                        </span>
                        <span className="badge-info ml-auto">v{health.version || '?'}</span>
                    </div>

                    {/* System stats grid */}
                    <div className="grid items-start grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                        <StatCard
                            icon={Clock}
                            label={t('dashboard.status.uptime')}
                            value={formatUptime(overview?.uptimeSeconds || health.uptimeSeconds)}
                            color="emerald"
                        />
                        <StatCard
                            icon={HardDrive}
                            label={t('dashboard.status.rss')}
                            value={health.memory?.rss || '?'}
                            color="cyan"
                        />
                        <StatCard
                            icon={Cpu}
                            label={t('dashboard.status.heap')}
                            value={health.memory?.heapUsed || '?'}
                            sub={`/ ${health.memory?.heapTotal || '?'}`}
                            color="amber"
                        />
                        <StatCard
                            icon={Activity}
                            label={t('dashboard.status.eventLoop')}
                            value={`${health.eventLoopLagMs || 0}ms`}
                            color={health.eventLoopLagMs > 50 ? 'rose' : 'emerald'}
                        />
                    </div>

                    {/* Detail cards + Activity Feed */}
                    {isVisible('health') && (
                    <div className="grid items-start grid-cols-2 md:grid-cols-2 gap-2.5 sm:gap-4">
                        {/* Database */}
                        <div className="glass-card p-3 sm:p-5">
                            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                                <Database size={18} className="text-brand-400" />
                                <h3 className="font-semibold text-surface-100">{t('dashboard.status.database')}</h3>
                                <span className={`ml-auto ${health.db === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                                    {health.db === 'ok' ? t('dashboard.status.ok') : t('dashboard.status.error')}
                                </span>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-surface-200/60">
                                    <span>{t('dashboard.status.node')}</span>
                                    <span className="font-mono text-surface-200">{overview?.nodeVersion || health.node}</span>
                                </div>
                            </div>
                        </div>

                        {/* Queue */}
                        <div className="glass-card p-3 sm:p-5">
                            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                                <Layers size={18} className="text-cyan-400" />
                                <h3 className="font-semibold text-surface-100">{t('dashboard.status.queue')}</h3>
                                <span className="badge-info ml-auto">{health.queue?.mode || 'memory'}</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-surface-200/60">
                                    <span>{t('dashboard.status.inFlight')}</span>
                                    <span className="font-mono text-surface-200">{health.inFlight}</span>
                                </div>
                                <div className="flex justify-between text-surface-200/60">
                                    <span>{t('dashboard.overview.rateLimit')}</span>
                                    <span className="font-mono text-surface-200">{health.rateLimitMax}/min</span>
                                </div>
                                <div className="flex justify-between text-surface-200/60">
                                    <span>{t('dashboard.overview.ipBuckets')}</span>
                                    <span className="font-mono text-surface-200">{health.requestBuckets}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Recent Activity Feed — owner only */}
                    {ownerMode && isVisible('activity') && (
                    <div className="glass-card p-3 sm:p-5">
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                            <History size={18} className="text-purple-400" />
                            <h3 className="font-semibold text-surface-100">{t('dashboard.overview.recentActivity') || 'Recent Activity'}</h3>
                        </div>
                        {mergedActivity.length === 0 ? (
                            <p className="text-xs text-surface-200/25 text-center py-6">{t('dashboard.common.noData') || 'No activity yet'}</p>
                        ) : (
                            <div className="space-y-1.5">
                                {mergedActivity.map((log, i) => (
                                    <div key={log.id || i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                                        log._live ? 'bg-brand-500/5 border border-brand-500/10' : 'bg-white/[0.02] hover:bg-white/[0.04]'
                                    }`}>
                                        <span className="text-sm shrink-0">{ACTION_ICONS[log.action] || '📌'}</span>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-medium text-surface-100">{log.action?.replace(/_/g, ' ')}</span>
                                            {log.details && <span className="text-[10px] text-surface-200/40 ml-2 truncate">{log.details}</span>}
                                        </div>
                                        {log._live && <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 font-medium">{t('dashboard.overview.live')}</span>}
                                        <span className="text-[10px] text-surface-200/30 shrink-0">{timeAgo(log.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    )}
                </>
            )}

            {/* ── Analytics Section (embedded) ── */}
            <div className="border-t border-white/5 pt-6 mt-2">
                <Suspense fallback={<SkeletonCard lines={4} />}>
                    <AnalyticsSection />
                </Suspense>
            </div>

            {/* #14: Add Token Modal — rendered at root level to avoid stacking context issues */}
            <AddTokenModal open={showAddToken} onClose={() => setShowAddToken(false)} onAdd={addToken} />
        </div>
    );
}
