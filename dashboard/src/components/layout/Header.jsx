import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import useThemeStore from '@/stores/themeStore';
import useWsStore from '@/stores/wsStore';
import { Menu, LogOut, Bell, Sun, Moon, Wifi, WifiOff } from 'lucide-react';

export default function Header({ onMenuClick }) {
    const { t } = useTranslation();
    const { user, logout } = useAuthStore();
    const { theme, toggleTheme } = useThemeStore();
    const { connected } = useWsStore();

    return (
        <header className="h-16 bg-surface-850/80 dark:bg-surface-850/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 md:px-6 shrink-0 transition-colors duration-300"
            style={theme === 'light' ? { background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(226,232,240,0.6)' } : {}}
        >
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 rounded-xl hover:bg-white/5 dark:hover:bg-white/5 text-surface-200/70 dark:text-surface-200/70 transition-colors"
                >
                    <Menu size={20} />
                </button>
                <div className="hidden md:block">
                    <input
                        type="text"
                        placeholder={t('dashboard.header.search')}
                        className="input-field w-64 !py-2 !text-sm"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Real-time connection indicator */}
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03]" title={connected ? 'Real-time connected' : 'Offline'}>
                    {connected ? (
                        <>
                            <Wifi size={13} className="text-emerald-400" />
                            <span className="text-[10px] font-medium text-emerald-400/80">Live</span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={13} className="text-surface-200/30" />
                            <span className="text-[10px] font-medium text-surface-200/30">Offline</span>
                        </>
                    )}
                </div>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-xl hover:bg-white/5 dark:hover:bg-white/5 text-surface-200/50 dark:text-surface-200/50 transition-all duration-300"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                {/* Notification bell */}
                <button className="p-2.5 rounded-xl hover:bg-white/5 dark:hover:bg-white/5 text-surface-200/50 dark:text-surface-200/50 transition-colors relative">
                    <Bell size={18} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full animate-pulse-soft" />
                </button>

                {/* User avatar + logout */}
                <div className="flex items-center gap-2 ml-2">
                    {user?.photo_url ? (
                        <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                            {(user?.first_name || '?')[0]}
                        </div>
                    )}
                    <button
                        onClick={logout}
                        className="p-2 rounded-xl hover:bg-red-500/10 text-surface-200/50 hover:text-red-400 transition-colors"
                        title={t('dashboard.header.signOut')}
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </header>
    );
}
