import { useState, useRef, useEffect, useMemo } from 'react';
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
    History,
    Sun,
    Moon,
    Shield,
    Search,
    PieChart,
    Gamepad2,
    Brain,
    CalendarCheck,
    Zap,
    Compass,
    ChevronRight,
    Sparkles,
    TrendingUp,
    Building2,
    Cat,
    Copy,
} from 'lucide-react';
import useThemeStore from '@/stores/themeStore';

const LANGUAGES = [
    { code: 'en', flag: '🇺🇸', label: 'English' },
    { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
    { code: 'zh', flag: '🇨🇳', label: '中文' },
    { code: 'ko', flag: '🇰🇷', label: '한국어' },
    { code: 'ru', flag: '🇷🇺', label: 'Русский' },
    { code: 'id', flag: '🇮🇩', label: 'Indonesia' },
];

const STORAGE_KEY = 'xbot_sidebar_collapsed';

function getCollapsedState() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function setCollapsedState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* noop */ }
}

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

function SidebarGroup({ groupKey, label, icon: GroupIcon, items, collapsed, onToggle, onClose, currentPath }) {
    const hasActiveChild = items.some(item => {
        if (item.to === '/') return currentPath === '/';
        return currentPath.startsWith(item.to);
    });

    // Auto-expand when a child is active
    useEffect(() => {
        if (hasActiveChild && collapsed) {
            onToggle();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPath]);

    return (
        <div className="mb-1">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider text-surface-200/40 hover:text-surface-200/60 hover:bg-white/[0.03] transition-all group"
            >
                <ChevronRight
                    size={12}
                    className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
                />
                {GroupIcon && <GroupIcon size={13} className="opacity-50" />}
                <span className="flex-1 text-left">{label}</span>
                <span className={`text-[10px] font-normal tabular-nums px-1.5 py-0.5 rounded-md transition-colors ${
                    hasActiveChild ? 'text-brand-400 bg-brand-400/10' : 'text-surface-200/25 bg-white/[0.03]'
                }`}>{items.length}</span>
            </button>

            <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    collapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
                }`}
            >
                <div className="space-y-0.5 mt-0.5 ml-1">
                    {items.map((item) => {
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
                                {item.badge && (
                                    <span className="ml-auto px-1.5 py-0 text-[9px] font-bold bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 uppercase">{item.badge}</span>
                                )}
                            </NavLink>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function Sidebar({ open, onClose }) {
    const { t } = useTranslation();
    const { isOwner, isOwnerView, user, logout, toggleViewMode, viewMode } = useAuthStore();
    const { theme, toggleTheme } = useThemeStore();
    const location = useLocation();

    const [collapsedGroups, setCollapsedGroups] = useState(getCollapsedState);

    const toggleGroup = (key) => {
        setCollapsedGroups(prev => {
            const next = { ...prev, [key]: !prev[key] };
            setCollapsedState(next);
            return next;
        });
    };

    const ownerGroups = useMemo(() => [
        {
            key: 'admin',
            label: t('dashboard.sidebar.groupAdmin') || 'Administration',
            icon: LayoutDashboard,
            items: [
                { to: '/', icon: LayoutDashboard, label: t('dashboard.sidebar.home') },
                { to: '/users', icon: Users, label: t('dashboard.sidebar.users') },
                { to: '/groups', icon: MessageSquare, label: t('dashboard.sidebar.groups') },
                { to: '/alerts', icon: Bell, label: t('dashboard.sidebar.alerts') },
                { to: '/posts', icon: CalendarClock, label: t('dashboard.sidebar.posts') },
            ],
        },
        {
            key: 'config',
            label: t('dashboard.sidebar.groupConfig') || 'Configuration',
            icon: Settings,
            items: [
                { to: '/config', icon: Settings, label: t('dashboard.sidebar.config') },
                { to: '/audit-log', icon: Shield, label: t('dashboard.sidebar.auditLog') || 'Audit Log' },
                { to: '/checkin-admin', icon: CalendarCheck, label: t('dashboard.sidebar.checkinAdmin') || 'Check-in Admin' },
            ],
        },
    ], [t]);

    const userGroups = useMemo(() => [
        {
            key: 'ai',
            label: t('dashboard.sidebar.groupAI') || 'AI & Chat',
            icon: Bot,
            items: [
                { to: '/chat', icon: Bot, label: t('dashboard.sidebar.aiChat') || 'AI Chat' },
                { to: '/ai-trader', icon: TrendingUp, label: t('dashboard.sidebar.aiTrader') || 'AI Trader', badge: 'β' },
                { to: '/treasury', icon: Building2, label: 'Treasury & Pet', badge: '★' },
                { to: '/smart-copy', icon: Copy, label: 'Smart Copy', badge: '★' },
            ],
        },
        {
            key: 'finance',
            label: t('dashboard.sidebar.groupFinance') || 'Assets & Trading',
            icon: Wallet,
            items: [
                { to: '/my-space', icon: Sparkles, label: t('dashboard.sidebar.mySpace') || 'My Space' },
                { to: '/wallets', icon: Wallet, label: t('dashboard.sidebar.wallets') },
                { to: '/trading', icon: BarChart3, label: t('dashboard.sidebar.dexTrading') || 'DEX Trading' },
                { to: '/okx-trading', icon: BarChart3, label: t('dashboard.sidebar.okxTrading') || 'OKX Trading' },
            ],
        },
        {
            key: 'explore',
            label: t('dashboard.sidebar.groupExplore') || 'Explore',
            icon: Compass,
            items: [
                { to: '/overview', icon: LayoutDashboard, label: t('dashboard.sidebar.home') },
                { to: '/discovery', icon: Compass, label: t('dashboard.sidebar.discovery') },
                { to: '/leaderboard', icon: Trophy, label: t('dashboard.sidebar.leaderboard') },
                { to: '/alerts', icon: Bell, label: t('dashboard.sidebar.alerts') },
            ],
        },
        {
            key: 'community',
            label: t('dashboard.sidebar.groupCommunity') || 'Community & Fun',
            icon: Gamepad2,
            items: [
                { to: '/my-groups', icon: MessageSquare, label: t('dashboard.sidebar.myGroups') || 'My Groups' },
                { to: '/games', icon: Gamepad2, label: t('dashboard.sidebar.games') || 'Mini Games' },
                { to: '/settings', icon: Settings, label: t('dashboard.sidebar.settings') },
            ],
        },
    ], [t]);

    const groups = isOwnerView()
        ? [...ownerGroups, ...userGroups]
        : userGroups;

    return (
        <aside
            className={`
                fixed lg:static inset-y-0 left-0 z-50
                w-72 border-r flex flex-col transition-all duration-300
                ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                bg-surface-850 dark:bg-surface-850 border-white/5 dark:border-white/5
            `}
            style={theme !== 'dark' ? { background: '#fff', borderColor: 'rgba(226,232,240,0.6)' } : {}}
        >
            {/* Logo area */}
            <div className="flex items-center justify-between h-16 px-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <img src="/xbot-logo.png" alt="XBot" className="w-9 h-9 rounded-xl shadow-lg shadow-brand-500/25 object-cover" />
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

            {/* Navigation — grouped */}
            <nav className="flex-1 overflow-auto px-3 py-3 space-y-0.5">
                {groups.map((group, i) => (
                    <div key={group.key}>
                        {/* Divider between owner and user groups */}
                        {isOwnerView() && i === ownerGroups.length && (
                            <div className="my-2 h-px bg-white/5" />
                        )}
                        <SidebarGroup
                            groupKey={group.key}
                            label={group.label}
                            icon={group.icon}
                            items={group.items}
                            collapsed={!!collapsedGroups[group.key]}
                            onToggle={() => toggleGroup(group.key)}
                            onClose={onClose}
                            currentPath={location.pathname}
                        />
                    </div>
                ))}
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
                <div className="flex gap-2">
                    <LanguageDropdown />
                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center w-11 h-11 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.06] hover:border-white/10 transition-all"
                        title={theme === 'dark' ? t('dashboard.header.lightMode') : t('dashboard.header.darkMode')}
                    >
                        {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-brand-400" />}
                    </button>
                </div>
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
