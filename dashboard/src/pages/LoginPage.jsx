import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import { Bot, Globe, Shield, Sparkles, Send } from 'lucide-react';

export default function LoginPage() {
    const { t, i18n } = useTranslation();
    const { login, loading, error } = useAuthStore();
    const telegramWidgetRef = useRef(null);
    const [botUsername, setBotUsername] = useState(null);
    const [widgetLoaded, setWidgetLoaded] = useState(false);

    // Fetch bot username from backend
    useEffect(() => {
        fetch('/api/dashboard/bot-info')
            .then(r => r.json())
            .then(d => setBotUsername(d.botUsername))
            .catch(() => { });
    }, []);

    // Handle Telegram Login callback
    useEffect(() => {
        // Define global callback for Telegram Widget
        window.onTelegramAuth = async (user) => {
            try {
                await login(user);
            } catch {
                // error is set in store
            }
        };
        return () => { delete window.onTelegramAuth; };
    }, [login]);

    // Load Telegram Login Widget script
    useEffect(() => {
        if (!botUsername || !telegramWidgetRef.current) return;

        // Clear previous widget
        telegramWidgetRef.current.innerHTML = '';

        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.async = true;
        script.setAttribute('data-telegram-login', botUsername);
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.setAttribute('data-request-access', 'write');
        script.setAttribute('data-radius', '12');
        script.onload = () => setWidgetLoaded(true);
        telegramWidgetRef.current.appendChild(script);
    }, [botUsername]);

    // Dev mode: simulate login
    const handleDevLogin = (role) => {
        const mockUser = {
            id: role === 'owner' ? 123456789 : 987654321,
            first_name: role === 'owner' ? 'Admin' : 'User',
            username: role === 'owner' ? 'xbot_admin' : 'xbot_user',
            auth_date: Math.floor(Date.now() / 1000),
            hash: 'dev_mode',
        };
        login(mockUser);
    };

    const features = [
        { icon: Shield, title: 'Role-Based Access', desc: 'Owner & User dashboards' },
        { icon: Globe, title: '6 Languages', desc: 'EN, VI, ZH, KO, RU, ID' },
        { icon: Sparkles, title: 'Real-time', desc: 'Live bot monitoring' },
    ];

    return (
        <div className="min-h-screen bg-surface-900 flex">
            {/* Left decorative panel */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-surface-900 via-brand-950/30 to-surface-900 items-center justify-center p-12 relative overflow-hidden">
                {/* Decorative orbs */}
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-500/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px]" />

                <div className="relative z-10 max-w-lg">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-2xl shadow-brand-500/30 mb-8">
                        <Bot size={40} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-extrabold text-white mb-4 leading-tight">
                        {t('dashboard.auth.title')}
                    </h1>
                    <p className="text-lg text-surface-200/60 mb-10">
                        {t('dashboard.auth.subtitle')}
                    </p>
                    <div className="space-y-5">
                        {features.map((f, i) => {
                            const Icon = f.icon;
                            return (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                                        <Icon size={18} className="text-brand-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-surface-100">{f.title}</p>
                                        <p className="text-xs text-surface-200/50">{f.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right login panel */}
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-sm">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-8">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
                            <Bot size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">{t('dashboard.auth.title')}</h1>
                            <p className="text-xs text-surface-200/50">{t('dashboard.auth.subtitle')}</p>
                        </div>
                    </div>

                    <div className="glass-card p-8">
                        <h2 className="text-xl font-bold text-surface-100 mb-2">
                            {t('dashboard.auth.loginBtn')}
                        </h2>
                        <p className="text-sm text-surface-200/50 mb-6">
                            {t('dashboard.auth.loginHint')}
                        </p>

                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        {/* ===== Telegram Login Widget ===== */}
                        <div className="space-y-4">
                            {/* Real Telegram Widget */}
                            <div ref={telegramWidgetRef} className="flex items-center justify-center min-h-[44px]">
                                {!botUsername && (
                                    <div className="flex items-center gap-2 text-surface-200/40 text-sm">
                                        <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                        Loading...
                                    </div>
                                )}
                            </div>

                            {/* Manual Telegram link button (fallback) */}
                            {botUsername && (
                                <a
                                    href={`https://t.me/${botUsername}?start=dashboard_login`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-primary w-full flex items-center justify-center gap-2 text-center no-underline"
                                >
                                    <Send size={16} />
                                    {t('dashboard.auth.loginBtn')}
                                </a>
                            )}

                            {/* Divider */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-white/5" />
                                <span className="text-[10px] text-surface-200/30 uppercase tracking-wider">or</span>
                                <div className="flex-1 h-px bg-white/5" />
                            </div>

                            {/* Dev mode buttons — always show for now */}
                            <div className="space-y-2">
                                <p className="text-xs text-surface-200/30 text-center uppercase tracking-wider">Quick Login (Dev)</p>
                                <button
                                    onClick={() => handleDevLogin('owner')}
                                    disabled={loading}
                                    className="btn-primary w-full flex items-center justify-center gap-2 !text-sm"
                                >
                                    <Shield size={14} />
                                    Login as Owner
                                </button>
                                <button
                                    onClick={() => handleDevLogin('user')}
                                    disabled={loading}
                                    className="btn-secondary w-full flex items-center justify-center gap-2 !text-sm"
                                >
                                    Login as User
                                </button>
                            </div>
                        </div>

                        {/* Language selector */}
                        <div className="mt-6 pt-4 border-t border-white/5">
                            <select
                                value={i18n.language?.substring(0, 2) || 'en'}
                                onChange={(e) => i18n.changeLanguage(e.target.value)}
                                className="w-full px-3 py-2 bg-surface-800/50 border border-white/5 rounded-xl text-sm text-surface-200 focus:outline-none cursor-pointer"
                            >
                                <option value="en">🇺🇸 English</option>
                                <option value="vi">🇻🇳 Tiếng Việt</option>
                                <option value="zh">🇨🇳 中文</option>
                                <option value="ko">🇰🇷 한국어</option>
                                <option value="ru">🇷🇺 Русский</option>
                                <option value="id">🇮🇩 Indonesia</option>
                            </select>
                        </div>
                    </div>

                    <p className="text-xs text-surface-200/30 text-center mt-6">
                        XBot Dashboard v1.0 • Powered by Telegram
                    </p>
                </div>
            </div>
        </div>
    );
}
