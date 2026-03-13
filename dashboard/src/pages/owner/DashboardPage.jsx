import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import useWsStore from '@/stores/wsStore';
import useThemeStore from '@/stores/themeStore';
import { SkeletonStatCards, SkeletonCard } from '@/components/Skeleton';
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

function StatCard({ icon: Icon, label, value, sub, color = 'brand' }) {
    const colors = {
        brand: 'text-brand-400 bg-brand-500/10',
        emerald: 'text-emerald-400 bg-emerald-500/10',
        amber: 'text-amber-400 bg-amber-500/10',
        rose: 'text-rose-400 bg-rose-500/10',
        cyan: 'text-cyan-400 bg-cyan-500/10',
        purple: 'text-purple-400 bg-purple-500/10',
    };
    return (
        <div className="stat-card">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
                    <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-surface-200/50 font-medium">{label}</p>
                    <p className="text-xl font-bold text-surface-100 truncate">{value}</p>
                    {sub && <p className="text-xs text-surface-200/40 mt-0.5">{sub}</p>}
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

export default function DashboardPage() {
    const { t } = useTranslation();
    const { theme } = useThemeStore();
    const isLight = theme === 'light';
    const [health, setHealth] = useState(null);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
    const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
    const wsNotifications = useWsStore((s) => s.notifications);
    const wsLastEvent = useWsStore((s) => s.lastEvent);

    // Widget customization
    const DEFAULT_WIDGETS = [
        { id: 'live', label: 'Live Stats', visible: true },
        { id: 'overview', label: 'Overview Stats', visible: true },
        { id: 'status', label: 'System Status', visible: true },
        { id: 'health', label: 'Health Details', visible: true },
        { id: 'activity', label: 'Activity Feed', visible: true },
    ];
    const [widgets, setWidgets] = useState(() => {
        try {
            const saved = localStorage.getItem('dashboard_widgets');
            return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
        } catch { return DEFAULT_WIDGETS; }
    });
    const saveWidgets = (w) => { setWidgets(w); localStorage.setItem('dashboard_widgets', JSON.stringify(w)); };
    const toggleWidget = (id) => saveWidgets(widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
    const moveWidget = (idx, dir) => {
        const arr = [...widgets];
        const target = idx + dir;
        if (target < 0 || target >= arr.length) return;
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        saveWidgets(arr);
    };
    const isVisible = (id) => widgets.find(w => w.id === id)?.visible !== false;

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const [h, o, act] = await Promise.allSettled([
                api.getHealth(),
                api.getOverview(),
                api.getRecentActivity(10),
            ]);
            if (h.status === 'fulfilled') setHealth(h.value);
            if (o.status === 'fulfilled') setOverview(o.value);
            if (act.status === 'fulfilled') setRecentActivity(act.value?.logs || []);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Live stats: portfolio, gas, alerts
    const [liveStats, setLiveStats] = useState({ portfolio: null, gasPrice: null, alertsCount: null });
    useEffect(() => {
        async function fetchLive() {
            try {
                const [walRes, gasRes, alertsRes] = await Promise.allSettled([
                    api.getWallets(),
                    api.getGasPrice(),
                    api.getAlerts(),
                ]);
                const wallets = walRes.status === 'fulfilled' ? (walRes.value?.wallets || []) : [];
                // Sum balances from wallets
                let totalUsd = 0;
                if (wallets.length > 0) {
                    const balResults = await Promise.allSettled(
                        wallets.map(w => api.getWalletBalance(w.id))
                    );
                    for (const r of balResults) {
                        if (r.status === 'fulfilled') {
                            const tokens = r.value?.data?.tokenAssets || [];
                            for (const tk of tokens) {
                                totalUsd += parseFloat(tk.tokenPrice || 0) * parseFloat(tk.holdingAmount || 0);
                            }
                        }
                    }
                }
                const gwei = gasRes.status === 'fulfilled' ? parseFloat(gasRes.value?.data?.[0]?.gasPrice || 0) : null;
                const alerts = alertsRes.status === 'fulfilled' ? (alertsRes.value?.alerts || []) : [];
                setLiveStats({
                    portfolio: totalUsd,
                    gasPrice: gwei,
                    alertsCount: alerts.filter(a => a.enabled !== false).length,
                });
            } catch { /* ignore */ }
        }
        fetchLive();
        const iv = setInterval(fetchLive, 60000);
        return () => clearInterval(iv);
    }, []);

    // Initial fetch + fallback polling every 30s
    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 30000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    // WS-driven auto-refresh: re-fetch when new WS events arrive
    useEffect(() => {
        if (wsLastEvent && wsLastEvent.type === 'group_activity') {
            // Lightweight: just refresh overview stats + activity, not full health
            Promise.allSettled([api.getOverview(), api.getRecentActivity(10)]).then(([o, act]) => {
                if (o.status === 'fulfilled') setOverview(o.value);
                if (act.status === 'fulfilled') setRecentActivity(act.value?.logs || []);
            });
        }
    }, [wsLastEvent]);

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

    if (loading && !health) {
        return (
            <div className="space-y-6">
                <SkeletonStatCards count={4} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SkeletonCard lines={3} />
                    <SkeletonCard lines={3} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.status.title')}</h1>
                    <p className="text-sm text-surface-200/50 mt-1">
                        {health?.now ? new Date(health.now).toLocaleString() : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Widget settings */}
                    <div className="relative">
                        <button onClick={() => setWidgetSettingsOpen(!widgetSettingsOpen)}
                            className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                            <Settings2 size={14} />
                        </button>
                        {widgetSettingsOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-surface-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-[fadeIn_0.15s_ease]">
                                <div className="px-3 py-2 border-b border-white/5 text-xs font-medium text-surface-200/50">Customize Widgets</div>
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
                                    <button onClick={() => saveWidgets(DEFAULT_WIDGETS)} className="text-[10px] text-surface-200/30 hover:text-brand-400 transition-colors">Reset to default</button>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="glass-card p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                            <Wallet size={22} className="text-brand-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50 font-medium">{t('dashboard.liveStats.portfolio') || 'Portfolio Value'}</p>
                            <p className="text-2xl font-bold text-surface-100 tabular-nums">
                                {liveStats.portfolio !== null ? `$${Math.floor(liveStats.portfolio * 100) / 100}` : '—'}
                            </p>
                        </div>
                    </div>
                    <div className="glass-card p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                            <Fuel size={22} className="text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50 font-medium">{t('dashboard.liveStats.gasPrice') || 'Gas Price'}</p>
                            <p className="text-2xl font-bold text-surface-100 tabular-nums">
                                {liveStats.gasPrice !== null ? `${liveStats.gasPrice < 0.01 ? liveStats.gasPrice.toFixed(4) : liveStats.gasPrice.toFixed(2)} Gwei` : '—'}
                            </p>
                        </div>
                    </div>
                    <div className="glass-card p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                            <Bell size={22} className="text-cyan-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50 font-medium">{t('dashboard.liveStats.activeAlerts') || 'Active Alerts'}</p>
                            <p className="text-2xl font-bold text-surface-100 tabular-nums">
                                {liveStats.alertsCount !== null ? liveStats.alertsCount : '—'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>
            )}

            {/* Overview Stats (from /owner/overview) */}
            {overview && isVisible('overview') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    <StatCard
                        icon={Users}
                        label={t('dashboard.users.total')}
                        value={overview.totalUsers}
                        sub={`${overview.activeUsers} ${t('dashboard.users.active').toLowerCase()}`}
                        color="brand"
                    />
                    <StatCard
                        icon={MessageSquare}
                        label={t('dashboard.groups.total')}
                        value={overview.totalGroups}
                        color="purple"
                    />
                    <StatCard
                        icon={UserPlus}
                        label={t('dashboard.overview.newToday') || 'New Today'}
                        value={overview.newUsersToday || 0}
                        sub={`${overview.newUsersWeek || 0} this week`}
                        color="emerald"
                    />
                    <StatCard
                        icon={Terminal}
                        label={t('dashboard.overview.commandsToday') || 'Commands Today'}
                        value={overview.commandsToday || 0}
                        color="cyan"
                    />
                    <StatCard
                        icon={Wifi}
                        label="Telegram API"
                        value={overview.telegramLatencyMs >= 0 ? `${overview.telegramLatencyMs}ms` : '—'}
                        color={overview.telegramLatencyMs > 500 ? 'rose' : 'emerald'}
                    />
                    <StatCard
                        icon={Zap}
                        label={t('dashboard.status.memory')}
                        value={`${overview.memory?.heapUsed || '?'} MB`}
                        sub={`/ ${overview.memory?.heapTotal || '?'} MB`}
                        color="amber"
                    />
                </div>
            )}

            {health && isVisible('status') && (
                <>
                    {/* Status indicator */}
                    <div className="glass-card p-5 flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${health.status === 'ok' ? 'bg-emerald-500 animate-pulse-soft' : 'bg-amber-500'}`} />
                        <span className="text-lg font-semibold text-surface-100">
                            {health.status === 'ok' ? t('dashboard.status.online') : t('dashboard.status.degraded')}
                        </span>
                        <span className="badge-info ml-auto">v{health.version || '?'}</span>
                    </div>

                    {/* System stats grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Database */}
                        <div className="glass-card p-5">
                            <div className="flex items-center gap-3 mb-4">
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
                        <div className="glass-card p-5">
                            <div className="flex items-center gap-3 mb-4">
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
                                    <span>Rate Limit</span>
                                    <span className="font-mono text-surface-200">{health.rateLimitMax}/min</span>
                                </div>
                                <div className="flex justify-between text-surface-200/60">
                                    <span>IP Buckets</span>
                                    <span className="font-mono text-surface-200">{health.requestBuckets}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Recent Activity Feed */}
                    {isVisible('activity') && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-3 mb-4">
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
                                        {log._live && <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 font-medium">LIVE</span>}
                                        <span className="text-[10px] text-surface-200/30 shrink-0">{timeAgo(log.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    )}
                </>
            )}
        </div>
    );
}
