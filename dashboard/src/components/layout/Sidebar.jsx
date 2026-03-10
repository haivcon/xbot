import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import config from '@/config';
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
    Globe,
    LogOut,
    ChevronDown,
    Check,
    ArrowLeftRight,
} from 'lucide-react';

const LANGUAGES = [
    { code: 'en', flag: '🇺🇸', label: 'English' },
    { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
    { code: 'zh', flag: '🇨🇳', label: '中文' },
    { code: 'ko', flag: '🇰🇷', label: '한국어' },
    { code: 'ru', flag: '🇷🇺', label: 'Русский' },
    { code: 'id', flag: '🇮🇩', label: 'Indonesia' },
];

function LanguageDropdown() {
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const currentLang = i18n.language?.substring(0, 2) || 'en';
    const current = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl text-sm text-surface-200 hover:bg-white/[0.06] hover:border-white/10 transition-all"
            >
                <Globe size={15} className="text-surface-200/50" />
                <span className="text-base">{current.flag}</span>
                <span className="flex-1 text-left text-sm">{current.label}</span>
                <ChevronDown size={14} className={`text-surface-200/40 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-800 border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-[fadeIn_0.15s_ease]">
                    {LANGUAGES.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors
                                ${lang.code === currentLang
                                    ? 'bg-brand-500/10 text-brand-400'
                                    : 'text-surface-200 hover:bg-white/5'
                                }`}
                        >
                            <span className="text-base">{lang.flag}</span>
                            <span className="flex-1 text-left">{lang.label}</span>
                            {lang.code === currentLang && <Check size={14} className="text-brand-400" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Sidebar({ open, onClose }) {
    const { t } = useTranslation();
    const { isOwner, isOwnerView, user, logout, toggleViewMode, viewMode } = useAuthStore();
    const location = useLocation();

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
        { to: '/chat', icon: Bot, label: t('dashboard.sidebar.aiChat') || 'AI Chat', highlight: true },
        { to: '/profile', icon: User, label: t('dashboard.sidebar.profile') },
        { to: '/wallets', icon: Wallet, label: t('dashboard.sidebar.wallets') },
        { to: '/trading', icon: BarChart3, label: t('dashboard.sidebar.trading') },
        { to: '/okx-trading', icon: BarChart3, label: t('dashboard.sidebar.okxTrading') || 'OKX Trading' },
        { to: '/leaderboard', icon: Trophy, label: t('dashboard.sidebar.leaderboard') },
        { to: '/settings', icon: Settings, label: t('dashboard.sidebar.settings') },
    ];

    const navItems = isOwnerView() ? [...ownerLinks, { divider: true }, ...userLinks] : userLinks;

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
                        <h1 className="text-sm font-bold text-surface-100">{config.appName}</h1>
                        <span className="text-[10px] font-medium text-surface-200/50 uppercase tracking-wider">{config.appTagline}</span>
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
                    {isOwner() && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {user?.username && (
                                <span className="text-[10px] text-surface-200/40">@{user.username}</span>
                            )}
                            {isOwnerView() ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                                    <Crown size={10} /> {t('dashboard.auth.ownerBadge') || 'Owner'}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-400 bg-brand-400/10 px-1.5 py-0.5 rounded-md">
                                    {t('dashboard.auth.userBadge') || 'User'}
                                </span>
                            )}
                        </div>
                    )}
                    {!isOwner() && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {user?.username && (
                                <span className="text-[10px] text-surface-200/40">@{user.username}</span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-400 bg-brand-400/10 px-1.5 py-0.5 rounded-md">
                                {t('dashboard.auth.userBadge') || 'User'}
                            </span>
                        </div>
                    )}
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

            {/* Bottom section: View Toggle + Language + Logout */}
            <div className="px-4 py-3 border-t border-white/5 space-y-2">
                {/* View Mode Toggle — only for owners */}
                {isOwner() && (
                    <button
                        onClick={toggleViewMode}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl text-sm hover:bg-white/[0.06] hover:border-white/10 transition-all group"
                    >
                        <ArrowLeftRight size={15} className="text-surface-200/50 group-hover:text-brand-400 transition-colors" />
                        <span className="flex-1 text-left text-sm text-surface-200">
                            {isOwnerView()
                                ? (t('dashboard.common.switchToUser') || 'Switch to User')
                                : (t('dashboard.common.switchToOwner') || 'Switch to Owner')}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            isOwnerView()
                                ? 'text-amber-400 bg-amber-400/10'
                                : 'text-brand-400 bg-brand-400/10'
                        }`}>
                            {isOwnerView() ? '👑' : '👤'}
                        </span>
                    </button>
                )}
                <LanguageDropdown />
                <button
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-colors"
                >
                    <LogOut size={15} />
                    <span>{t('dashboard.common.logout') || 'Logout'}</span>
                </button>
            </div>
        </aside>
    );
}
