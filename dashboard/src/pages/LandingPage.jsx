import { useTranslation } from 'react-i18next';
import { Bot, Globe, Shield, Sparkles, BarChart3, Wallet, LogIn, ChevronRight } from 'lucide-react';
import config from '@/config';

export default function LandingPage({ onLogin }) {
    const { t, i18n } = useTranslation();

    const features = [
        { icon: Shield, title: 'Role-Based Access', desc: 'Owner & User dashboards', color: 'from-blue-500 to-cyan-500' },
        { icon: BarChart3, title: 'Analytics', desc: 'Real-time stats & charts', color: 'from-purple-500 to-pink-500' },
        { icon: Wallet, title: 'Wallet Management', desc: 'Secure wallet overview', color: 'from-emerald-500 to-teal-500' },
        { icon: Globe, title: '6 Languages', desc: 'EN, VI, ZH, KO, RU, ID', color: 'from-orange-500 to-amber-500' },
        { icon: Sparkles, title: 'AI Integration', desc: 'Smart bot control', color: 'from-rose-500 to-red-500' },
        { icon: Bot, title: 'Real-time', desc: 'Live bot monitoring', color: 'from-indigo-500 to-blue-500' },
    ];

    const pages = [
        { name: 'Dashboard', desc: 'Bot health & metrics', owner: true },
        { name: 'Users', desc: 'User management', owner: true },
        { name: 'Groups', desc: 'Group management', owner: true },
        { name: 'Analytics', desc: 'Usage statistics', owner: true },
        { name: 'Alerts', desc: 'Price alerts', owner: true },
        { name: 'Config', desc: 'Bot configuration', owner: true },
        { name: 'Profile', desc: 'Your profile & stats', owner: false },
        { name: 'Settings', desc: 'Preferences', owner: false },
        { name: 'Wallets', desc: 'Wallet overview', owner: false },
        { name: 'Trading', desc: 'Trade history', owner: false },
        { name: 'Leaderboard', desc: 'Top players', owner: false },
    ];

    return (
        <div className="min-h-screen bg-surface-900 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/8 rounded-full blur-[150px]" />
            <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/6 rounded-full blur-[180px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/4 rounded-full blur-[200px]" />

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
                        <Bot size={20} className="text-white" />
                    </div>
                    <span className="text-lg font-bold text-white tracking-tight">{config.appName}</span>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={i18n.language?.substring(0, 2) || 'en'}
                        onChange={(e) => i18n.changeLanguage(e.target.value)}
                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-surface-200 focus:outline-none cursor-pointer"
                    >
                        <option value="en">🇺🇸 EN</option>
                        <option value="vi">🇻🇳 VI</option>
                        <option value="zh">🇨🇳 ZH</option>
                        <option value="ko">🇰🇷 KO</option>
                        <option value="ru">🇷🇺 RU</option>
                        <option value="id">🇮🇩 ID</option>
                    </select>
                    <button
                        onClick={onLogin}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-brand-500 to-cyan-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 hover:scale-[1.02]"
                    >
                        <LogIn size={16} />
                        {t('dashboard.auth.loginBtn') || 'Login'}
                    </button>
                </div>
            </header>

            {/* Hero */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-16 pb-12">
                <div className="text-center max-w-2xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs text-brand-400 font-medium mb-6">
                        <Sparkles size={12} />
                        Telegram Bot Dashboard
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-4">
                        {t('dashboard.auth.title') || `${config.appName} ${config.appTagline}`}
                    </h1>
                    <p className="text-lg text-surface-200/60 mb-8">
                        {t('dashboard.auth.subtitle') || 'Manage your bot with a powerful web interface'}
                    </p>
                    <button
                        onClick={onLogin}
                        className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-brand-500 to-cyan-500 text-white font-bold rounded-2xl shadow-2xl shadow-brand-500/30 hover:shadow-brand-500/50 transition-all duration-300 hover:scale-[1.03] text-base"
                    >
                        <LogIn size={18} />
                        {t('dashboard.auth.loginBtn') || 'Get Started'}
                        <ChevronRight size={16} />
                    </button>
                </div>
            </section>

            {/* Features Grid */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 py-12">
                <h2 className="text-sm font-semibold text-surface-200/40 uppercase tracking-widest text-center mb-8">Features</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {features.map((f, i) => {
                        const Icon = f.icon;
                        return (
                            <div key={i} className="group p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] transition-all duration-300">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                                    <Icon size={18} className="text-white" />
                                </div>
                                <p className="text-sm font-semibold text-white mb-1">{f.title}</p>
                                <p className="text-xs text-surface-200/40">{f.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Pages Preview */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 py-12">
                <h2 className="text-sm font-semibold text-surface-200/40 uppercase tracking-widest text-center mb-8">Dashboard Pages</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Owner pages */}
                    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-center gap-2 mb-4">
                            <Shield size={16} className="text-brand-400" />
                            <h3 className="text-sm font-bold text-brand-400 uppercase tracking-wider">Owner</h3>
                        </div>
                        <div className="space-y-2">
                            {pages.filter(p => p.owner).map((p, i) => (
                                <button
                                    key={i} onClick={onLogin}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group text-left"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-surface-100">{p.name}</p>
                                        <p className="text-[11px] text-surface-200/40">{p.desc}</p>
                                    </div>
                                    <ChevronRight size={14} className="text-surface-200/20 group-hover:text-brand-400 transition-colors" />
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* User pages */}
                    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-center gap-2 mb-4">
                            <Bot size={16} className="text-cyan-400" />
                            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">User</h3>
                        </div>
                        <div className="space-y-2">
                            {pages.filter(p => !p.owner).map((p, i) => (
                                <button
                                    key={i} onClick={onLogin}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group text-left"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-surface-100">{p.name}</p>
                                        <p className="text-[11px] text-surface-200/40">{p.desc}</p>
                                    </div>
                                    <ChevronRight size={14} className="text-surface-200/20 group-hover:text-cyan-400 transition-colors" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 text-center py-8 border-t border-white/5">
                <p className="text-xs text-surface-200/25">{config.appName} {config.appTagline} v{config.appVersion} • {config.footerText}</p>
            </footer>
        </div>
    );
}
