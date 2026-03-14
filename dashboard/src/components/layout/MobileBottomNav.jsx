import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, MessageSquare, Wallet, BarChart3, Sparkles } from 'lucide-react';

/**
 * MobileBottomNav — fixed bottom tab bar for mobile devices.
 * Shows 5 core navigation items. Hides on chat page (full-screen).
 */
export default function MobileBottomNav() {
    const { t } = useTranslation();
    const location = useLocation();

    // Hide on chat page (full-screen experience)
    if (location.pathname === '/chat' || location.pathname.startsWith('/chat/')) return null;

    const tabs = [
        { to: '/overview', icon: LayoutDashboard, label: t('dashboard.sidebar.home', 'Home') },
        { to: '/my-space', icon: Sparkles, label: t('dashboard.sidebar.mySpace', 'Space') },
        { to: '/chat', icon: MessageSquare, label: t('dashboard.sidebar.aiChat', 'Chat') },
        { to: '/wallets', icon: Wallet, label: t('dashboard.sidebar.wallets', 'Wallets') },
        { to: '/trading', icon: BarChart3, label: t('dashboard.sidebar.dexTrading', 'Trade') },
    ];

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-surface-800/95 backdrop-blur-xl border-t border-white/5 safe-area-bottom"
            role="navigation"
            aria-label="Mobile navigation"
        >
            <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-1">
                {tabs.map(({ to, icon: Icon, label }) => {
                    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
                    return (
                        <NavLink
                            key={to}
                            to={to}
                            className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1.5 rounded-xl transition-all duration-200 ${
                                isActive
                                    ? 'text-brand-400'
                                    : 'text-surface-200/40 hover:text-surface-200/60'
                            }`}
                            aria-label={label}
                        >
                            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                            <span className={`text-[10px] leading-tight truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                                {label}
                            </span>
                            {isActive && (
                                <div className="absolute bottom-1 w-5 h-0.5 rounded-full bg-brand-400" />
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
