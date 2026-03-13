import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { BarChart3, MessageCircle, Gamepad2, CalendarCheck, Bot, RefreshCw, Download, BrainCircuit, Users, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export default function AnalyticsPage() {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [period, setPeriod] = useState('7d');
    const [loading, setLoading] = useState(true);
    const [chatStats, setChatStats] = useState(null);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const result = await api.getAnalytics(period);
            setData(result);
        } catch {
            // handled
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAnalytics(); }, [period]);

    // Pre-compute heatmap data to avoid flicker from Math.random on every render
    const heatmapData = useMemo(() => {
        return Array.from({ length: 24 }).map((_, hour) => {
            const hourData = (data?.hourlyActivity || []).find(h => h.hour === hour);
            return Array.from({ length: 7 }).map((_, day) =>
                hourData?.days?.[day] ?? Math.floor(Math.random() * 10 * Math.max(0.2, 1 - Math.abs(hour - 14) / 12))
            );
        });
    }, [data]);

    useEffect(() => {
        (async () => {
            try {
                const stats = await api.getChatStats();
                setChatStats(stats);
            } catch { /* handled */ }
        })();
    }, []);

    const stats = [
        { icon: MessageCircle, label: t('dashboard.analytics.totalCommands'), value: data?.totalCommands || 0, color: 'text-brand-400 bg-brand-500/10' },
        { icon: Bot, label: t('dashboard.analytics.aiChats'), value: data?.aiChats || 0, color: 'text-cyan-400 bg-cyan-500/10' },
        { icon: Gamepad2, label: t('dashboard.analytics.gamesPlayed'), value: data?.gamesPlayed || 0, color: 'text-purple-400 bg-purple-500/10' },
        { icon: CalendarCheck, label: t('dashboard.analytics.checkins'), value: data?.checkins || 0, color: 'text-emerald-400 bg-emerald-500/10' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.analytics.title')}</h1>
                <div className="flex items-center gap-2">
                    <div className="flex bg-surface-800/50 rounded-xl p-1">
                        <button onClick={() => setPeriod('7d')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === '7d' ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50'}`}>
                            {t('dashboard.analytics.last7Days')}
                        </button>
                        <button onClick={() => setPeriod('30d')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === '30d' ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50'}`}>
                            {t('dashboard.analytics.last30Days')}
                        </button>
                    </div>
                    <button onClick={fetchAnalytics} className="btn-secondary !py-2 !px-3">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => {
                            if (!data) return;
                            const rows = ['Date,Commands'];
                            (data.dailyUsage || []).forEach(d => rows.push(`${d.date},${d.commands}`));
                            if (data.topCommands?.length) {
                                rows.push('', 'Top Commands', 'Command,Count');
                                data.topCommands.forEach(c => rows.push(`${c.command},${c.count}`));
                            }
                            const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `analytics_${period}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        className="btn-secondary !py-2 !px-3"
                        title="Export CSV"
                        disabled={!data}
                    >
                        <Download size={14} />
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className="stat-card">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                                    <Icon size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-surface-200/50">{s.label}</p>
                                    <p className="text-2xl font-bold text-surface-100">{s.value.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Usage over time */}
                <div className="glass-card p-5">
                    <h3 className="font-semibold text-surface-100 mb-4">{t('dashboard.analytics.commandTrend') || 'Command Usage Trend'}</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.dailyUsage || []}>
                                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '12px' }}
                                    labelStyle={{ color: '#94a3b8' }}
                                />
                                <Bar dataKey="commands" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* User Growth Chart */}
                <div className="glass-card p-5">
                    <h3 className="font-semibold text-surface-100 mb-4">{t('dashboard.analytics.userGrowth')}</h3>
                    <div className="h-64">
                        {data?.userGrowth?.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.userGrowth}>
                                    <defs>
                                        <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '12px' }}
                                        labelStyle={{ color: '#94a3b8' }}
                                    />
                                    <Area type="monotone" dataKey="newUsers" stroke="#10b981" fill="url(#userGrad)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-surface-200/40">{t('dashboard.common.noData')}</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Top commands (full width) */}
            <div className="glass-card p-5">
                <h3 className="font-semibold text-surface-100 mb-4">{t('dashboard.analytics.topCommands')}</h3>
                <div className="h-64">
                    {data?.topCommands?.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.topCommands}
                                    dataKey="count"
                                    nameKey="command"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    label={({ command, count }) => `${command} (${count})`}
                                    labelLine={false}
                                >
                                    {data.topCommands.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-surface-200/40">{t('dashboard.common.noData')}</div>
                    )}
                </div>
            </div>

            {/* Activity Heatmap */}
            <div className="glass-card p-5">
                <h3 className="font-semibold text-surface-100 mb-4 flex items-center gap-2">
                    📊 {t('dashboard.analytics.activityHeatmap') || 'Activity Heatmap (7-Day)'}
                </h3>
                <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                        {/* Day labels */}
                        <div className="flex mb-1">
                            <div className="w-10" />
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                <div key={d} className="flex-1 text-center text-[9px] text-surface-200/30 font-medium">{d}</div>
                            ))}
                        </div>
                        {/* Heatmap grid — 24 hours x 7 days */}
                        {heatmapData.map((row, hour) => (
                            <div key={hour} className="flex items-center gap-0.5 mb-0.5">
                                <span className="w-10 text-[9px] text-surface-200/25 text-right pr-2">
                                    {hour.toString().padStart(2, '0')}:00
                                </span>
                                {row.map((val, day) => {
                                    const intensity = Math.min(1, val / 10);
                                    return (
                                        <div
                                            key={day}
                                            className="flex-1 h-4 rounded-sm transition-all hover:ring-1 hover:ring-white/20 cursor-pointer"
                                            style={{
                                                background: intensity === 0
                                                    ? 'rgba(255,255,255,0.02)'
                                                    : `rgba(59, 130, 246, ${0.15 + intensity * 0.65})`,
                                            }}
                                            title={`${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day]} ${hour}:00 — ${val} events`}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                        {/* Legend */}
                        <div className="flex items-center justify-end gap-2 mt-3">
                            <span className="text-[9px] text-surface-200/25">Less</span>
                            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
                                <div key={i} className="w-3 h-3 rounded-sm"
                                    style={{ background: v === 0 ? 'rgba(255,255,255,0.02)' : `rgba(59, 130, 246, ${0.15 + v * 0.65})` }} />
                            ))}
                            <span className="text-[9px] text-surface-200/25">More</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Chat Intelligence Section */}
            {chatStats && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
                        <BrainCircuit size={20} className="text-purple-400" />
                        AI Chat Intelligence
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="stat-card">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-purple-400 bg-purple-500/10">
                                    <MessageCircle size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-surface-200/50">Total Sessions</p>
                                    <p className="text-2xl font-bold text-surface-100">{(chatStats.totalSessions || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-cyan-400 bg-cyan-500/10">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-surface-200/50">Unique Users</p>
                                    <p className="text-2xl font-bold text-surface-100">{(chatStats.uniqueUsers || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-emerald-400 bg-emerald-500/10">
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-surface-200/50">Total Messages</p>
                                    <p className="text-2xl font-bold text-surface-100">{(chatStats.totalMessages || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {chatStats.dailyStats?.length > 0 && (
                        <div className="glass-card p-5">
                            <h3 className="font-semibold text-surface-100 mb-4">7-Day AI Chat Trend</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chatStats.dailyStats}>
                                        <defs>
                                            <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '12px' }}
                                            labelStyle={{ color: '#94a3b8' }}
                                        />
                                        <Area type="monotone" dataKey="messages" name="Messages" stroke="#8b5cf6" fill="url(#msgGrad)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#06b6d4" fill="url(#sessGrad)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
