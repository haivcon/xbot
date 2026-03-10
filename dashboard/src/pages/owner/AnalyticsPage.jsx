import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { BarChart3, MessageCircle, Gamepad2, CalendarCheck, Bot, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export default function AnalyticsPage() {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [period, setPeriod] = useState('7d');
    const [loading, setLoading] = useState(true);

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
                    <h3 className="font-semibold text-surface-100 mb-4">{t('dashboard.analytics.userGrowth')}</h3>
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

                {/* Top commands */}
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
            </div>
        </div>
    );
}
