import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import useThemeStore from '@/stores/themeStore';
import useWsStore from '@/stores/wsStore';
import api from '@/api/client';
import { Menu, LogOut, Bell, Sun, Moon, Wifi, WifiOff, X, Volume2, VolumeX, Search, Fuel, Gauge } from 'lucide-react';

const ACTION_LABELS = {
    settings_update: '⚙️',
    message_sent: '💬',
    group_deleted: '🗑️',
    member_sync: '🔄',
    broadcast: '📡',
};

const SEARCH_TARGETS = [
    { label: 'Users', path: '/owner/users', icon: '👤' },
    { label: 'Groups', path: '/owner/groups', icon: '💬' },
];

function timeAgo(ts) {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function Header({ onMenuClick }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const { theme, toggleTheme } = useThemeStore();
    const { connected, notifications, unreadCount, markAllRead, soundEnabled, toggleSound } = useWsStore();
    const [bellOpen, setBellOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const bellRef = useRef(null);
    const searchRef = useRef(null);
    const isLight = theme === 'light';

    // Gas price
    const [gasPrice, setGasPrice] = useState(null);
    useEffect(() => {
        const fetchGas = async () => {
            try {
                const res = await api.getGasPrice();
                const gwei = res?.data?.[0]?.gasPrice;
                if (gwei) setGasPrice(parseFloat(gwei));
            } catch { /* ignore */ }
        };
        fetchGas();
        const iv = setInterval(fetchGas, 60000);
        return () => clearInterval(iv);
    }, []);

    // Rate limit (#11)
    const [rateLimit, setRateLimit] = useState(null);
    useEffect(() => {
        const fetchRL = async () => {
            try {
                const h = await api.getHealth();
                if (h?.inFlight != null && h?.rateLimitMax) {
                    setRateLimit({ current: h.inFlight, max: h.rateLimitMax });
                }
            } catch { /* ignore */ }
        };
        fetchRL();
        const iv = setInterval(fetchRL, 30000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        const close = (e) => {
            if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
            if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const handleBellClick = () => {
        setBellOpen(!bellOpen);
        if (!bellOpen) markAllRead();
    };

    const handleSearch = (path) => {
        if (searchQuery.trim()) {
            navigate(`${path}?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
            setSearchOpen(false);
        }
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            handleSearch('/owner/users');
        }
        if (e.key === 'Escape') {
            setSearchOpen(false);
        }
    };

    return (
        <header className="h-16 bg-surface-850/80 dark:bg-surface-850/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 md:px-6 shrink-0 transition-colors duration-300"
            style={isLight ? { background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(226,232,240,0.6)' } : {}}
        >
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 rounded-xl hover:bg-white/5 dark:hover:bg-white/5 text-surface-200/70 dark:text-surface-200/70 transition-colors"
                >
                    <Menu size={20} />
                </button>
                {/* Search with dropdown */}
                <div ref={searchRef} className="hidden md:block relative">
                    <div className="relative">
                        <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-surface-200/30'}`} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(!!e.target.value); }}
                            onFocus={() => searchQuery && setSearchOpen(true)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder={t('dashboard.header.search')}
                            className="input-field w-64 !py-2 !text-sm !pl-9"
                        />
                    </div>
                    {searchOpen && searchQuery.trim() && (
                        <div className={`absolute left-0 top-full mt-1.5 w-64 rounded-xl shadow-xl overflow-hidden z-50 ${
                            isLight ? 'bg-white border border-slate-200' : 'bg-surface-800 border border-white/10'
                        }`}>
                            <div className={`px-3 py-2 text-[10px] font-medium ${isLight ? 'text-slate-400' : 'text-surface-200/30'}`}>
                                {t('dashboard.header.searchIn') || 'Search in...'}
                            </div>
                            {SEARCH_TARGETS.map((target) => (
                                <button
                                    key={target.path}
                                    onClick={() => handleSearch(target.path)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors ${
                                        isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-white/5 text-surface-100'
                                    }`}
                                >
                                    <span>{target.icon}</span>
                                    <span>{target.label}</span>
                                    <span className={`ml-auto text-[10px] ${isLight ? 'text-slate-400' : 'text-surface-200/30'}`}>
                                        "{searchQuery.trim()}"
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
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

                {/* Gas price pill */}
                {gasPrice !== null && (
                    <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 text-amber-400'}`} title="X Layer Gas Price">
                        <Fuel size={13} />
                        <span className="text-[10px] font-bold tabular-nums">{gasPrice < 0.01 ? gasPrice.toFixed(4) : gasPrice.toFixed(2)}</span>
                        <span className="text-[9px] opacity-60">Gwei</span>
                    </div>
                )}

                {/* Rate limit pill (#11) */}
                {rateLimit && (
                    <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                        rateLimit.current / rateLimit.max > 0.8 ? (isLight ? 'bg-red-50 text-red-600' : 'bg-red-500/10 text-red-400') :
                        rateLimit.current / rateLimit.max > 0.5 ? (isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 text-amber-400') :
                        (isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 text-emerald-400')
                    }`} title={`API: ${rateLimit.current}/${rateLimit.max} req/min`}>
                        <Gauge size={13} />
                        <span className="text-[10px] font-bold tabular-nums">{rateLimit.current}/{rateLimit.max}</span>
                    </div>
                )}

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-xl hover:bg-white/5 dark:hover:bg-white/5 text-surface-200/50 dark:text-surface-200/50 transition-all duration-300"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                {/* Notification bell */}
                <div ref={bellRef} className="relative">
                    <button
                        onClick={handleBellClick}
                        className="p-2.5 rounded-xl hover:bg-white/5 dark:hover:bg-white/5 text-surface-200/50 dark:text-surface-200/50 transition-colors relative"
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-brand-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-pulse-soft">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {bellOpen && (
                        <div className={`absolute right-0 top-full mt-2 w-80 max-h-96 rounded-xl shadow-2xl overflow-hidden z-50 animate-fadeIn ${
                            isLight 
                                ? 'bg-white border border-slate-200 shadow-slate-200/50' 
                                : 'bg-surface-800 border border-white/10 shadow-black/40'
                        }`}>
                            <div className={`flex items-center justify-between px-4 py-3 border-b ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
                                <h4 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-surface-100'}`}>
                                    {t('dashboard.header.notifications') || 'Notifications'}
                                </h4>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={toggleSound}
                                        className={`p-1 rounded ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-surface-200/40'}`}
                                        title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                                    >
                                        {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                                    </button>
                                    <button onClick={() => setBellOpen(false)} className={`p-1 rounded ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-surface-200/40'}`}>
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-auto max-h-72">
                                {notifications.length === 0 ? (
                                    <div className={`px-4 py-8 text-center text-xs ${isLight ? 'text-slate-400' : 'text-surface-200/40'}`}>
                                        {t('dashboard.common.noData') || 'No notifications yet'}
                                    </div>
                                ) : (
                                    notifications.map((n) => (
                                        <div key={n.id} className={`px-4 py-3 border-b transition-colors ${
                                            isLight 
                                                ? 'border-slate-100 hover:bg-slate-50' 
                                                : 'border-white/5 hover:bg-white/[0.02]'
                                        }`}>
                                            <div className="flex items-start gap-2">
                                                <span className="text-base shrink-0">{ACTION_LABELS[n.action] || '📌'}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-medium truncate ${isLight ? 'text-slate-700' : 'text-surface-100'}`}>
                                                        {n.action?.replace(/_/g, ' ')}
                                                    </p>
                                                    <p className={`text-[10px] truncate mt-0.5 ${isLight ? 'text-slate-400' : 'text-surface-200/50'}`}>
                                                        {n.details || n.chatId}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] shrink-0 ${isLight ? 'text-slate-300' : 'text-surface-200/30'}`}>{timeAgo(n.ts)}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

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
