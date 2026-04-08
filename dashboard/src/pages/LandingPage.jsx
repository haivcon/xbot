import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Globe, Shield, Sparkles, BarChart3, Wallet, LogIn, ChevronRight, Zap, ArrowRight, Terminal, Brain, TrendingUp, MessageSquare, Sun, Moon, Loader2 } from 'lucide-react';
import config from '@/config';
import LanguageSelector from '@/components/LanguageSelector';
import useThemeStore from '@/stores/themeStore';

/* ── Animated counter ── */
function AnimatedNumber({ target, duration = 1200, suffix = '' }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (target == null || target === 0) { setVal(0); return; }
        let start = 0;
        const step = Math.max(1, Math.ceil(target / (duration / 16)));
        const iv = setInterval(() => {
            start += step;
            if (start >= target) { setVal(target); clearInterval(iv); }
            else setVal(start);
        }, 16);
        return () => clearInterval(iv);
    }, [target, duration]);
    return <span>{val.toLocaleString()}{suffix}</span>;
}

/* ── Floating orb component ── */
function FloatingOrb({ className, delay = 0 }) {
    return (
        <div
            className={`absolute rounded-full pointer-events-none ${className}`}
            style={{ animation: `float ${8 + delay}s ease-in-out infinite ${delay}s` }}
        />
    );
}

export default function LandingPage({ onLogin }) {
    const { t } = useTranslation();
    const { theme, toggleTheme } = useThemeStore();
    const [scrollY, setScrollY] = useState(0);
    const [mounted, setMounted] = useState(false);

    // ── Real-time stats from API ──
    const [liveStats, setLiveStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Fetch real-time data from public endpoints
    useEffect(() => {
        let cancelled = false;
        async function fetchStats() {
            try {
                // Try health endpoint (public, no auth required)
                const healthRes = await fetch('/api/dashboard/health').then(r => r.ok ? r.json() : null).catch(() => null);
                // Try bot-info endpoint (already confirmed public)
                const botInfoRes = await fetch('/api/dashboard/bot-info').then(r => r.ok ? r.json() : null).catch(() => null);

                if (cancelled) return;

                if (healthRes || botInfoRes) {
                    setLiveStats({
                        status: healthRes?.status || 'unknown',
                        uptime: healthRes?.uptimeSeconds || null,
                        memory: healthRes?.memory?.rss || null,
                        heapUsed: healthRes?.memory?.heapUsed || null,
                        eventLoopLag: healthRes?.eventLoopLagMs || null,
                        db: healthRes?.db || null,
                        version: healthRes?.version || null,
                        node: healthRes?.node || null,
                        botUsername: botInfoRes?.botUsername || null,
                    });
                }
            } catch { /* ignore */ }
            if (!cancelled) setStatsLoading(false);
        }
        fetchStats();
        // Refresh every 30s for real-time
        const iv = setInterval(fetchStats, 30000);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    // Format uptime
    const formatUptime = (seconds) => {
        if (!seconds) return '—';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const features = [
        { icon: Shield, title: t('dashboard.landing.featAccess'), desc: t('dashboard.landing.featAccessDesc'), gradient: 'from-blue-500 to-indigo-600', glow: 'shadow-blue-500/20' },
        { icon: BarChart3, title: t('dashboard.landing.featAnalytics'), desc: t('dashboard.landing.featAnalyticsDesc'), gradient: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/20' },
        { icon: Wallet, title: t('dashboard.landing.featWallets'), desc: t('dashboard.landing.featWalletsDesc'), gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/20' },
        { icon: Globe, title: t('dashboard.landing.featLanguages'), desc: t('dashboard.landing.featLanguagesDesc'), gradient: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/20' },
        { icon: Brain, title: t('dashboard.landing.featAI'), desc: t('dashboard.landing.featAIDesc'), gradient: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/20' },
        { icon: Zap, title: t('dashboard.landing.featRealtime'), desc: t('dashboard.landing.featRealtimeDesc'), gradient: 'from-cyan-500 to-blue-600', glow: 'shadow-cyan-500/20' },
    ];

    const highlights = [
        { icon: TrendingUp, label: 'DEX Trading', value: 'On-chain' },
        { icon: Bot, label: 'AI Chat', value: 'GPT-4o' },
        { icon: MessageSquare, label: 'Groups', value: 'Multi' },
        { icon: Terminal, label: 'Commands', value: '100+' },
    ];

    const pages = [
        // Owner Pages
        { name: t('dashboard.sidebar.home') || 'Dashboard', desc: t('dashboard.landing.pageDashboardDesc'), owner: true },
        { name: t('dashboard.sidebar.users') || 'Users', desc: t('dashboard.landing.pageUsersDesc'), owner: true },
        { name: t('dashboard.sidebar.groups') || 'Groups', desc: t('dashboard.landing.pageGroupsDesc'), owner: true },
        { name: t('dashboard.sidebar.alerts') || 'Alerts', desc: t('dashboard.landing.pageAlertsDesc'), owner: true },
        { name: t('dashboard.sidebar.posts') || 'Scheduled Posts', desc: t('dashboard.landing.pagePostsDesc'), owner: true },
        { name: t('dashboard.sidebar.config') || 'Bot Config', desc: t('dashboard.landing.pageConfigDesc'), owner: true },
        { name: t('dashboard.sidebar.auditLog') || 'Audit Log', desc: t('dashboard.landing.pageAuditLogDesc'), owner: true },
        { name: t('dashboard.sidebar.checkinAdmin') || 'Check-in Admin', desc: t('dashboard.landing.pageCheckinAdminDesc'), owner: true },

        // User Pages
        { name: t('dashboard.sidebar.aiChat') || 'AI Chat', desc: t('dashboard.landing.pageAiChatDesc'), owner: false },
        { name: t('dashboard.sidebar.aiMemory') || 'AI Memory', desc: t('dashboard.landing.pageAiMemoryDesc'), owner: false },
        { name: t('dashboard.sidebar.aiTrader') || 'AI Trader', desc: t('dashboard.landing.pageAiTraderDesc'), owner: false },
        { name: 'Treasury & Pet', desc: t('dashboard.landing.pageTreasuryDesc'), owner: false },
        { name: 'Smart Copy', desc: t('dashboard.landing.pageSmartCopyDesc'), owner: false },
        { name: t('dashboard.sidebar.mySpace') || 'My Space', desc: t('dashboard.landing.pageMySpaceDesc'), owner: false },
        { name: t('dashboard.sidebar.wallets') || 'Wallets', desc: t('dashboard.landing.pageWalletsDesc'), owner: false },
        { name: t('dashboard.sidebar.dexTrading') || 'DEX Trading', desc: t('dashboard.landing.pageTradingDesc'), owner: false },
        { name: t('dashboard.sidebar.okxTrading') || 'OKX Trading', desc: t('dashboard.landing.pageOkxTradingDesc'), owner: false },
        { name: t('dashboard.sidebar.discovery') || 'Discovery', desc: t('dashboard.landing.pageDiscoveryDesc'), owner: false },
        { name: t('dashboard.sidebar.leaderboard') || 'Leaderboard', desc: t('dashboard.landing.pageLeaderboardDesc'), owner: false },
        { name: t('dashboard.sidebar.myGroups') || 'My Groups', desc: t('dashboard.landing.pageMyGroupsDesc'), owner: false },
        { name: t('dashboard.sidebar.games') || 'Mini Games', desc: t('dashboard.landing.pageGamesDesc'), owner: false },
        { name: t('dashboard.sidebar.settings') || 'Settings', desc: t('dashboard.landing.pageSettingsDesc'), owner: false },
    ];

    const isDark = theme === 'dark';

    // Real-time stat cards data
    const statCards = liveStats ? [
        {
            label: t('dashboard.status.title'),
            value: liveStats.status === 'ok' ? t('dashboard.status.online') : (liveStats.status || '—'),
            color: liveStats.status === 'ok' ? 'emerald' : 'amber',
            dot: liveStats.status === 'ok',
        },
        {
            label: t('dashboard.status.uptime'),
            value: formatUptime(liveStats.uptime),
            color: 'brand',
        },
        {
            label: t('dashboard.status.memory'),
            value: liveStats.memory || '—',
            color: 'cyan',
        },
        {
            label: t('dashboard.status.eventLoop'),
            value: liveStats.eventLoopLag != null ? `${liveStats.eventLoopLag}ms` : '—',
            color: (liveStats.eventLoopLag || 0) > 50 ? 'rose' : 'emerald',
        },
    ] : null;

    return (
        <div className={`min-h-screen relative overflow-hidden ${isDark ? 'bg-surface-900' : 'bg-surface-50'}`}>
            {/* ── Animated Background ── */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-[0.02]"
                    style={{ backgroundImage: `linear-gradient(${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px)`, backgroundSize: '60px 60px' }}
                />
                {/* Floating orbs */}
                <FloatingOrb className={`w-[500px] h-[500px] ${isDark ? 'bg-brand-500/[0.07]' : 'bg-brand-500/[0.05]'} blur-[120px] -top-20 -left-20`} delay={0} />
                <FloatingOrb className={`w-[600px] h-[600px] ${isDark ? 'bg-purple-500/[0.05]' : 'bg-purple-500/[0.04]'} blur-[150px] top-1/3 -right-40`} delay={2} />
                <FloatingOrb className={`w-[400px] h-[400px] ${isDark ? 'bg-cyan-500/[0.06]' : 'bg-cyan-500/[0.04]'} blur-[100px] bottom-20 left-1/3`} delay={4} />
                <FloatingOrb className={`w-[300px] h-[300px] ${isDark ? 'bg-emerald-500/[0.04]' : 'bg-emerald-500/[0.03]'} blur-[80px] top-2/3 right-1/4`} delay={6} />
            </div>

            {/* ── Header (Glassmorphism) ── */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
                scrollY > 50
                    ? isDark
                        ? 'bg-surface-900/80 backdrop-blur-2xl border-b border-white/5 shadow-xl shadow-black/20'
                        : 'bg-white/80 backdrop-blur-2xl border-b border-black/5 shadow-xl shadow-black/5'
                    : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto flex items-center justify-between px-6 md:px-10 py-4">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img src="/xbot-logo.png" alt="XBot" className="w-10 h-10 rounded-xl shadow-lg shadow-brand-500/30 object-cover ring-1 ring-white/10" />
                            {liveStats?.status === 'ok' && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-surface-900 animate-pulse" />
                            )}
                        </div>
                        <div>
                            <span className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-surface-900'}`}>{config.appName}</span>
                            <span className={`hidden sm:inline text-xs ml-2 font-medium ${isDark ? 'text-surface-200/30' : 'text-surface-700/40'}`}>{config.appTagline}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Theme toggle */}
                        <button
                            onClick={toggleTheme}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-300 ${
                                isDark
                                    ? 'bg-white/[0.06] border-white/10 text-surface-200 hover:bg-white/[0.12] hover:text-amber-400'
                                    : 'bg-black/[0.04] border-black/10 text-surface-700 hover:bg-black/[0.08] hover:text-indigo-600'
                            }`}
                            title={isDark ? t('dashboard.header.lightMode') : t('dashboard.header.darkMode')}
                        >
                            {isDark ? <Sun size={16} /> : <Moon size={16} />}
                        </button>

                        <LanguageSelector variant="landing" />

                        <button
                            onClick={onLogin}
                            className={`group relative flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl shadow-lg transition-all duration-300 hover:scale-[1.03] overflow-hidden ${
                                isDark
                                    ? 'bg-white text-surface-900 shadow-white/10 hover:shadow-white/20'
                                    : 'bg-surface-900 text-white shadow-black/10 hover:shadow-black/20'
                            }`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <LogIn size={16} className="relative z-10 group-hover:text-white transition-colors" />
                            <span className="relative z-10 group-hover:text-white transition-colors">{t('dashboard.auth.loginBtn')}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Hero Section ── */}
            <section className="relative z-10 pt-32 pb-8 md:pt-40 md:pb-16">
                <div className="max-w-7xl mx-auto px-6 md:px-10">
                    <div className="text-center max-w-3xl mx-auto">
                        {/* Badge */}
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold mb-8 transition-all duration-700 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                        } bg-gradient-to-r from-brand-500/10 to-cyan-500/10 border-brand-500/20 text-brand-400`}>
                            <Sparkles size={13} className="animate-pulse" />
                            {t('dashboard.landing.badge')}
                            {liveStats?.status === 'ok' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        </div>

                        {/* Title */}
                        <h1 className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] mb-6 transition-all duration-700 delay-100 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                        }`}>
                            <span className={isDark ? 'text-white' : 'text-surface-900'}>{config.appName}</span>
                            <br />
                            <span className="bg-gradient-to-r from-brand-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                                {config.appTagline}
                            </span>
                        </h1>

                        {/* Subtitle */}
                        <p className={`text-base sm:text-lg mb-10 max-w-xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                        } ${isDark ? 'text-surface-200/50' : 'text-surface-700/60'}`}>
                            {t('dashboard.auth.subtitle')}
                        </p>

                        {/* CTA Buttons */}
                        <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 transition-all duration-700 delay-300 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                        }`}>
                            <button
                                onClick={onLogin}
                                className="group relative flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-brand-500 to-cyan-500 text-white font-bold rounded-2xl shadow-2xl shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 hover:scale-[1.03] text-base overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <LogIn size={20} className="relative z-10" />
                                <span className="relative z-10">{t('dashboard.auth.loginBtn')}</span>
                                <ArrowRight size={18} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                            </button>
                            {liveStats?.botUsername && (
                                <a
                                    href={`https://t.me/${liveStats.botUsername}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 px-6 py-3.5 border font-semibold rounded-2xl transition-all duration-300 text-sm no-underline ${
                                        isDark
                                            ? 'bg-white/[0.04] border-white/10 text-surface-200/80 hover:bg-white/[0.08] hover:border-white/20 hover:text-white'
                                            : 'bg-black/[0.03] border-black/10 text-surface-700/80 hover:bg-black/[0.06] hover:border-black/20 hover:text-surface-900'
                                    }`}
                                >
                                    <Bot size={18} />
                                    @{liveStats.botUsername}
                                </a>
                            )}
                        </div>
                    </div>

                    {/* ── Highlight Pills ── */}
                    <div className={`flex flex-wrap items-center justify-center gap-3 mb-8 transition-all duration-700 delay-[400ms] ${
                        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                    }`}>
                        {highlights.map((h, i) => {
                            const Icon = h.icon;
                            return (
                                <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full border backdrop-blur-sm transition-all duration-300 group cursor-default ${
                                    isDark
                                        ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
                                        : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.04] hover:border-black/[0.12]'
                                }`}>
                                    <Icon size={15} className="text-brand-400 group-hover:text-cyan-400 transition-colors" />
                                    <span className={`text-xs font-semibold ${isDark ? 'text-surface-200/70' : 'text-surface-700/70'}`}>{h.label}</span>
                                    <span className="text-[10px] font-bold text-brand-400 bg-brand-400/10 px-2 py-0.5 rounded-md">{h.value}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Live System Status (Real-time data) ── */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 pb-20">
                <div className={`relative transition-all duration-1000 delay-500 ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}>
                    {/* Glow behind */}
                    <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 via-purple-500/5 to-transparent rounded-3xl blur-3xl" />

                    <div className={`relative rounded-2xl border overflow-hidden shadow-2xl ${
                        isDark
                            ? 'border-white/[0.08] bg-white/[0.02] backdrop-blur-sm shadow-black/30'
                            : 'border-black/[0.06] bg-white/60 backdrop-blur-sm shadow-black/5'
                    }`}>
                        {/* Browser chrome */}
                        <div className={`flex items-center gap-2 px-4 py-3 border-b ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-black/5 bg-black/[0.02]'}`}>
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                            </div>
                            <div className="flex-1 flex justify-center">
                                <div className={`px-4 py-1 rounded-lg border text-[11px] font-mono ${
                                    isDark ? 'bg-white/[0.04] border-white/5 text-surface-200/30' : 'bg-black/[0.03] border-black/5 text-surface-700/30'
                                }`}>
                                    {liveStats?.botUsername ? `${liveStats.botUsername}.xbot.app` : 'dashboard.xbot.app'}
                                </div>
                            </div>
                            {/* Live indicator */}
                            <div className="flex items-center gap-1.5">
                                {statsLoading ? (
                                    <Loader2 size={12} className="animate-spin text-surface-200/30" />
                                ) : liveStats?.status === 'ok' ? (
                                    <>
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400/60' : 'text-emerald-600/60'}`}>Live</span>
                                    </>
                                ) : (
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>offline</span>
                                )}
                            </div>
                        </div>

                        {/* Real-time stats */}
                        <div className="p-6 md:p-8">
                            {statsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-brand-400" />
                                    <span className={`ml-3 text-sm ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>{t('dashboard.common.loading')}</span>
                                </div>
                            ) : statCards ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                        {statCards.map((s, i) => (
                                            <div key={i} className={`p-4 rounded-xl border ${
                                                isDark ? 'bg-white/[0.03] border-white/5' : 'bg-black/[0.02] border-black/5'
                                            }`}>
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <p className={`text-[10px] font-medium ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>{s.label}</p>
                                                    {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                                </div>
                                                <p className={`text-xl font-bold tabular-nums text-${s.color}-400`}>
                                                    {s.value}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Additional info row */}
                                    <div className={`flex flex-wrap items-center gap-4 text-[11px] ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>
                                        {liveStats?.version && (
                                            <span className="flex items-center gap-1.5">
                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${isDark ? 'bg-white/[0.04]' : 'bg-black/[0.04]'}`}>v{liveStats.version}</span>
                                            </span>
                                        )}
                                        {liveStats?.node && (
                                            <span className="flex items-center gap-1.5">
                                                Node.js <span className="font-mono">{liveStats.node}</span>
                                            </span>
                                        )}
                                        {liveStats?.db && (
                                            <span className="flex items-center gap-1.5">
                                                DB: <span className={liveStats.db === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>{liveStats.db === 'ok' ? '✓ OK' : '✗ Error'}</span>
                                            </span>
                                        )}
                                        {liveStats?.heapUsed && (
                                            <span className="flex items-center gap-1.5">
                                                Heap: <span className="font-mono">{liveStats.heapUsed}</span>
                                            </span>
                                        )}
                                        <span className="ml-auto flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                                            Auto-refresh 30s
                                        </span>
                                    </div>
                                </>
                            ) : (
                                /* Fallback when API is not reachable */
                                <div className={`text-center py-12 ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>
                                    <Bot size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">{t('dashboard.auth.loginHint')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Features Grid (Bento) ── */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 py-20">
                <div className="text-center mb-12">
                    <h2 className="text-sm font-bold text-brand-400 uppercase tracking-[0.2em] mb-3">{t('dashboard.landing.featuresTitle')}</h2>
                    <p className={`text-2xl md:text-3xl font-bold ${isDark ? 'text-white' : 'text-surface-900'}`}>{t('dashboard.landing.featuresSubtitle') || 'Everything you need in one place'}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {features.map((f, i) => {
                        const Icon = f.icon;
                        return (
                            <div key={i}
                                className={`group relative p-6 rounded-2xl border transition-all duration-500 cursor-default overflow-hidden ${
                                    isDark
                                        ? 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]'
                                        : 'bg-white/60 border-black/[0.06] hover:bg-white/80 hover:border-black/[0.12]'
                                } ${i === 0 ? 'sm:col-span-2 lg:col-span-1' : ''}`}
                            >
                                {/* Hover glow */}
                                <div className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${f.gradient} rounded-full blur-[60px] opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />

                                <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-4 shadow-lg ${f.glow} group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}>
                                    <Icon size={22} className="text-white" />
                                </div>
                                <h3 className={`relative text-base font-bold mb-1.5 transition-colors ${isDark ? 'text-white' : 'text-surface-900'}`}>{f.title}</h3>
                                <p className={`relative text-sm leading-relaxed transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-surface-200/60' : 'text-surface-700/50 group-hover:text-surface-700/70'}`}>{f.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── Pages Preview ── */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 py-16">
                <div className="text-center mb-12">
                    <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-[0.2em] mb-3">{t('dashboard.landing.pagesTitle')}</h2>
                    <p className={`text-2xl md:text-3xl font-bold ${isDark ? 'text-white' : 'text-surface-900'}`}>{t('dashboard.landing.pagesSubtitle') || 'Powerful control panels'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Owner Card */}
                    <div className={`relative p-6 rounded-2xl border overflow-hidden group ${
                        isDark ? 'bg-gradient-to-b from-white/[0.03] to-transparent border-white/[0.06]' : 'bg-gradient-to-b from-white/80 to-white/40 border-black/[0.06]'
                    }`}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
                        <div className="flex items-center gap-2.5 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                                <Shield size={16} className="text-brand-400" />
                            </div>
                            <h3 className="text-sm font-bold text-brand-400 uppercase tracking-wider">{t('dashboard.landing.ownerSection')}</h3>
                            <span className={`ml-auto text-[10px] font-medium ${isDark ? 'text-surface-200/20' : 'text-surface-700/30'}`}>
                                {pages.filter(p => p.owner).length} {t('dashboard.landing.pagesCount') || 'pages'}
                            </span>
                        </div>
                        <div className="space-y-1">
                            {pages.filter(p => p.owner).map((p, i) => (
                                <button
                                    key={i} onClick={onLogin}
                                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all duration-200 group/item text-left ${
                                        isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-black/[0.03]'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-sm font-semibold transition-colors ${isDark ? 'text-surface-200/80 group-hover/item:text-white' : 'text-surface-700/80 group-hover/item:text-surface-900'}`}>{p.name}</p>
                                        <p className={`text-[11px] transition-colors ${isDark ? 'text-surface-200/30 group-hover/item:text-surface-200/50' : 'text-surface-700/30 group-hover/item:text-surface-700/50'}`}>{p.desc}</p>
                                    </div>
                                    <ChevronRight size={14} className={`${isDark ? 'text-surface-200/10' : 'text-surface-700/10'} group-hover/item:text-brand-400 group-hover/item:translate-x-0.5 transition-all`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* User Card */}
                    <div className={`relative p-6 rounded-2xl border overflow-hidden group ${
                        isDark ? 'bg-gradient-to-b from-white/[0.03] to-transparent border-white/[0.06]' : 'bg-gradient-to-b from-white/80 to-white/40 border-black/[0.06]'
                    }`}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
                        <div className="flex items-center gap-2.5 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                <Bot size={16} className="text-cyan-400" />
                            </div>
                            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">{t('dashboard.landing.userSection')}</h3>
                            <span className={`ml-auto text-[10px] font-medium ${isDark ? 'text-surface-200/20' : 'text-surface-700/30'}`}>
                                {pages.filter(p => !p.owner).length} {t('dashboard.landing.pagesCount') || 'pages'}
                            </span>
                        </div>
                        <div className="space-y-1">
                            {pages.filter(p => !p.owner).map((p, i) => (
                                <button
                                    key={i} onClick={onLogin}
                                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all duration-200 group/item text-left ${
                                        isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-black/[0.03]'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-sm font-semibold transition-colors ${isDark ? 'text-surface-200/80 group-hover/item:text-white' : 'text-surface-700/80 group-hover/item:text-surface-900'}`}>{p.name}</p>
                                        <p className={`text-[11px] transition-colors ${isDark ? 'text-surface-200/30 group-hover/item:text-surface-200/50' : 'text-surface-700/30 group-hover/item:text-surface-700/50'}`}>{p.desc}</p>
                                    </div>
                                    <ChevronRight size={14} className={`${isDark ? 'text-surface-200/10' : 'text-surface-700/10'} group-hover/item:text-cyan-400 group-hover/item:translate-x-0.5 transition-all`} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Bottom CTA ── */}
            <section className="relative z-10 max-w-4xl mx-auto px-6 md:px-10 py-20">
                <div className={`relative rounded-3xl border p-10 md:p-14 text-center overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-r from-brand-500/10 via-purple-500/10 to-cyan-500/10 border-white/[0.08]'
                        : 'bg-gradient-to-r from-brand-500/5 via-purple-500/5 to-cyan-500/5 border-black/[0.06]'
                }`}>
                    <div className="absolute top-0 left-0 w-32 h-32 bg-brand-500/10 rounded-full blur-[60px]" />
                    <div className="absolute bottom-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-[60px]" />

                    <h2 className={`relative text-2xl md:text-3xl font-bold mb-3 ${isDark ? 'text-white' : 'text-surface-900'}`}>
                        Ready to get started?
                    </h2>
                    <p className={`relative text-sm mb-8 max-w-md mx-auto ${isDark ? 'text-surface-200/50' : 'text-surface-700/60'}`}>
                        {t('dashboard.auth.loginHint') || 'Sign in with your Telegram account to access the dashboard'}
                    </p>
                    <button
                        onClick={onLogin}
                        className={`relative inline-flex items-center gap-2 px-8 py-3.5 font-bold rounded-2xl shadow-xl hover:scale-[1.03] transition-all duration-300 text-base ${
                            isDark
                                ? 'bg-white text-surface-900 shadow-white/10 hover:shadow-white/20'
                                : 'bg-surface-900 text-white shadow-black/10 hover:shadow-black/20'
                        }`}
                    >
                        <LogIn size={18} />
                        {t('dashboard.auth.loginBtn')}
                        <ArrowRight size={16} />
                    </button>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className={`relative z-10 border-t ${isDark ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>
                <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
                    {/* Top row — Brand + Social links */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                        {/* Brand */}
                        <div className="flex items-center gap-3">
                            <img src="/xbot-logo.png" alt="XBot" className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-brand-500/10 ring-1 ring-white/5" />
                            <div>
                                <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-surface-900'}`}>{config.appName}</p>
                                <p className={`text-[11px] ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>{config.appTagline}</p>
                            </div>
                        </div>

                        {/* Social Links */}
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                            {/* Telegram Dev */}
                            <a href={`https://t.me/${config.devTelegram?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20' : 'bg-black/[0.02] border-black/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20'
                               }`}
                               title={`Dev: ${config.devTelegram}`}
                            >
                                <svg className="w-4 h-4 text-surface-200/40 group-hover:text-[#2AABEE] transition-colors" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                </svg>
                                <span className={`text-[11px] group-hover:text-[#2AABEE] transition-colors font-medium ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>{config.devTelegram}</span>
                            </a>

                            {/* X Dev */}
                            <a href={`https://x.com/${config.devTwitter?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]' : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.06] hover:border-black/[0.12]'
                               }`}
                               title={`Dev: ${config.devTwitter}`}
                            >
                                <svg className={`w-3.5 h-3.5 transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                <span className={`text-[11px] transition-colors font-medium ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`}>{config.devTwitter}</span>
                            </a>

                            {/* Telegram Bot */}
                            <a href={`https://t.me/${config.botTelegram?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20' : 'bg-black/[0.02] border-black/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20'
                               }`}
                               title={`Bot: ${config.botTelegram}`}
                            >
                                <svg className="w-4 h-4 text-surface-200/40 group-hover:text-[#2AABEE] transition-colors" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                </svg>
                                <span className={`text-[11px] group-hover:text-[#2AABEE] transition-colors font-medium ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>Bot</span>
                            </a>

                            {/* X Bot */}
                            <a href={`https://x.com/${config.botTwitter?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]' : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.06] hover:border-black/[0.12]'
                               }`}
                               title={`Bot X: ${config.botTwitter}`}
                            >
                                <svg className={`w-3.5 h-3.5 transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                <span className={`text-[11px] transition-colors font-medium ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`}>Bot</span>
                            </a>

                            {/* GitHub */}
                            <a href={config.githubRepo} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]' : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.06] hover:border-black/[0.12]'
                               }`}
                               title={`GitHub: ${config.githubRepo.replace('https://github.com/', '')}`}
                            >
                                <svg className={`w-4 h-4 transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                                </svg>
                                <span className={`text-[11px] transition-colors font-medium ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`}>Source Code</span>
                            </a>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className={`h-px bg-gradient-to-r from-transparent to-transparent mb-6 ${isDark ? 'via-white/[0.06]' : 'via-black/[0.06]'}`} />

                    {/* Bottom row — Credits & Version */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className={`flex items-center gap-2 text-[11px] ${isDark ? 'text-surface-200/25' : 'text-surface-700/30'}`}>
                            <span>Dev:</span>
                            <span className={`font-bold tracking-wider ${isDark ? 'text-surface-200/40' : 'text-surface-700/50'}`}>{config.devName}</span>
                            <span className={isDark ? 'text-surface-200/10' : 'text-surface-700/15'}>•</span>
                            <span>{config.footerText}</span>
                        </div>
                        <div className={`flex items-center gap-2 text-[10px] font-mono ${isDark ? 'text-surface-200/20' : 'text-surface-700/25'}`}>
                            <span>v{config.appVersion}</span>
                            {config.buildTime && (
                                <>
                                    <span className={isDark ? 'text-surface-200/10' : 'text-surface-700/15'}>•</span>
                                    <span>build {new Date(config.buildTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </footer>

            {/* ── CSS Animations ── */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -20px) scale(1.05); }
                    66% { transform: translate(-20px, 15px) scale(0.95); }
                }
            `}</style>
        </div>
    );
}
