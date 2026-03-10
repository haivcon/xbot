import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import api from '@/api/client';
import { User, Trophy, MessageCircle, Gamepad2, CalendarCheck, ImageIcon, Sparkles, TrendingUp } from 'lucide-react';

export default function ProfilePage() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getStats()
            .then(setStats)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const statItems = [
        { icon: Sparkles, label: 'XP', value: stats?.totalXP || 0, color: 'text-amber-400 bg-amber-500/10' },
        { icon: CalendarCheck, label: t('dashboard.analytics.checkins'), value: stats?.checkinCount || 0, color: 'text-emerald-400 bg-emerald-500/10' },
        { icon: Gamepad2, label: t('dashboard.analytics.gamesPlayed'), value: stats?.gamesPlayed || 0, color: 'text-purple-400 bg-purple-500/10' },
        { icon: Trophy, label: 'Wins', value: stats?.gamesWon || 0, color: 'text-cyan-400 bg-cyan-500/10' },
        { icon: MessageCircle, label: t('dashboard.analytics.aiChats'), value: stats?.aiChats || 0, color: 'text-brand-400 bg-brand-500/10' },
        { icon: ImageIcon, label: 'Images', value: stats?.imagesGenerated || 0, color: 'text-pink-400 bg-pink-500/10' },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.profile')}</h1>

            {/* Profile card */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-5">
                    {user?.photo_url ? (
                        <img src={user.photo_url} alt="" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-brand-500/30" />
                    ) : (
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                            {(user?.first_name || '?')[0]}
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl font-bold text-surface-100">{user?.first_name} {user?.last_name || ''}</h2>
                        {user?.username && <p className="text-sm text-surface-200/50">@{user.username}</p>}
                        <div className="flex items-center gap-2 mt-2">
                            <span className="badge-info">ID: {user?.id}</span>
                            {stats?.totalXP > 0 && (
                                <span className="badge-success flex items-center gap-1">
                                    <TrendingUp size={10} /> {stats.totalXP} XP
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats grid */}
            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {statItems.map((s) => {
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
            )}
        </div>
    );
}
