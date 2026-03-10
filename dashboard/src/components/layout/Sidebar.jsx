import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import {
    LayoutDashboard,
    Users,
    MessageSquare,
    Bell,
    CalendarClock,
    BarChart3,
    Settings,
    User,
    Wallet,
    X,
    Bot,
    Trophy,
    Crown,
} from 'lucide-react';

const LANG_FLAGS = {
    en: '🇺🇸',
    vi: '🇻🇳',
    zh: '🇨🇳',
    ko: '🇰🇷',
    ru: '🇷🇺',
    id: '🇮🇩',
};

const LANG_LABELS = {
    en: 'English',
    vi: 'Tiếng Việt',
    zh: '中文',
    ko: '한국어',
    ru: 'Русский',
    id: 'Indonesia',
};

export default function Sidebar({ open, onClose }) {
    const { t, i18n } = useTranslation();
    const { isOwner, user, role } = useAuthStore();
    const location = useLocation();

    const handleLangChange = (e) => {
        i18n.changeLanguage(e.target.value);
    };

    const ownerLinks = [
        { to: '/', icon: LayoutDashboard, label: t('dashboard.sidebar.home') },
        { to: '/users', icon: Users, label: t('dashboard.sidebar.users') },
        { to: '/groups', icon: MessageSquare, label: t('dashboard.sidebar.groups') },
        { to: '/alerts', icon: Bell, label: t('dashboard.sidebar.alerts') },
        { to: '/posts', icon: CalendarClock, label: t('dashboard.sidebar.posts') },
        { to: '/analytics', icon: BarChart3, label: t('dashboard.sidebar.analytics') },
        { to: '/config', icon: Settings, label: t('dashboard.sidebar.config') },
    ];

    const userLinks = [
        { to: '/profile', icon: User, label: t('dashboard.sidebar.profile') },
        { to: '/wallets', icon: Wallet, label: t('dashboard.sidebar.wallets') },
        { to: '/trading', icon: BarChart3, label: t('dashboard.sidebar.trading') },
        { to: '/leaderboard', icon: Trophy, label: t('dashboard.sidebar.leaderboard') },
        { to: '/settings', icon: Settings, label: t('dashboard.sidebar.settings') },
    ];

    const navItems = isOwner() ? [...ownerLinks, { divider: true }, ...userLinks] : userLinks;

    return (
        <aside
            className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 border-r flex flex-col transition-all duration-300
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        bg-surface-850 dark:bg-surface-850 border-white/5 dark:border-white/5
      `}
            style={document.documentElement.classList.contains('dark') ? {} : { background: '#fff', borderColor: 'rgba(226,232,240,0.6)' }}
        >
            {/* Logo area */}
            <div className="flex items-center justify-between h-16 px-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
                        <Bot size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-surface-100">XBot</h1>
                        <span className="text-[10px] font-medium text-surface-200/50 uppercase tracking-wider">Dashboard</span>
                    </div>
                </div>
                <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50">
                    <X size={18} />
                </button>
            </div>

            {/* User info */}
            <div className="px-4 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    {user?.photo_url ? (
                        <img src={user.photo_url} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-brand-500/30" />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                            {(user?.first_name || '?')[0]}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-surface-100 truncate">{user?.first_name || 'User'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {isOwner() ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                                    <Crown size={10} /> {t('dashboard.auth.ownerBadge')}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-400 bg-brand-400/10 px-1.5 py-0.5 rounded-md">
                                    {t('dashboard.auth.userBadge')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-auto px-3 py-4 space-y-1">
                {navItems.map((item, i) => {
                    if (item.divider) {
                        return <div key={`div-${i}`} className="my-3 h-px bg-white/5" />;
                    }
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            onClick={onClose}
                            className={({ isActive }) => isActive ? 'sidebar-link-active' : 'sidebar-link'}
                        >
                            <Icon size={18} />
                            <span>{item.label}</span>
                        </NavLink>
                    );
                })}
            </nav>

            {/* Language selector */}
            <div className="px-4 py-3 border-t border-white/5">
                <select
                    value={i18n.language?.substring(0, 2) || 'en'}
                    onChange={handleLangChange}
                    className="w-full px-3 py-2 bg-surface-800/80 border border-white/5 rounded-xl text-sm text-surface-200
                     focus:outline-none focus:border-brand-500/30 cursor-pointer appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
                >
                    {Object.entries(LANG_FLAGS).map(([code, flag]) => (
                        <option key={code} value={code}>
                            {flag} {LANG_LABELS[code]}
                        </option>
                    ))}
                </select>
            </div>
        </aside>
    );
}
