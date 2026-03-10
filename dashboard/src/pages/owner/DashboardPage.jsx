import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
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
} from 'lucide-react';

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
    const [health, setHealth] = useState(null);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAll = async () => {
        try {
            setLoading(true);
            const [h, o] = await Promise.allSettled([
                api.getHealth(),
                api.getOverview(),
            ]);
            if (h.status === 'fulfilled') setHealth(h.value);
            if (o.status === 'fulfilled') setOverview(o.value);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 15000);
        return () => clearInterval(interval);
    }, []);

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
                <button onClick={fetchAll} className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {t('dashboard.common.refresh')}
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>
            )}

            {/* Overview Stats (from /owner/overview) */}
            {overview && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

            {health && (
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

                    {/* Detail cards */}
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
                </>
            )}
        </div>
    );
}
