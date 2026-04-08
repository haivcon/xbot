import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import { X, Send, Loader2, Shield, Sparkles, ArrowRight } from 'lucide-react';

export default function LoginModal({ open, onClose }) {
    const { t } = useTranslation();
    const { login, loading, error } = useAuthStore();
    const [localError, setLocalError] = useState(null);
    const [botUsername, setBotUsername] = useState(null);
    const telegramWidgetRef = useRef(null);
    const [animateIn, setAnimateIn] = useState(false);

    // Animate in
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => setAnimateIn(true));
        } else {
            setAnimateIn(false);
        }
    }, [open]);

    // Fetch bot username with retry
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const fetchBotInfo = () => {
            fetch('/api/dashboard/bot-info')
                .then(r => r.json())
                .then(d => {
                    if (!cancelled && d.botUsername) setBotUsername(d.botUsername);
                })
                .catch(() => { });
        };
        fetchBotInfo();
        // Retry after 3s if not loaded
        const timer = setTimeout(fetchBotInfo, 3000);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [open]);

    // Handle Telegram Login Widget callback
    useEffect(() => {
        if (!open) return;
        window.onTelegramAuth = async (user) => {
            setLocalError(null);
            try {
                await login(user);
                onClose();
            } catch (err) {
                setLocalError(err.message);
            }
        };
        return () => { delete window.onTelegramAuth; };
    }, [open, login, onClose]);

    // Load Telegram Login Widget
    useEffect(() => {
        if (!open || !botUsername || !telegramWidgetRef.current) return;
        telegramWidgetRef.current.innerHTML = '';
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.async = true;
        script.setAttribute('data-telegram-login', botUsername);
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.setAttribute('data-request-access', 'write');
        script.setAttribute('data-radius', '12');
        telegramWidgetRef.current.appendChild(script);
    }, [open, botUsername]);

    if (!open) return null;

    const displayError = localError || error;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            {/* Backdrop with blur */}
            <div className={`absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300 ${
                animateIn ? 'opacity-100' : 'opacity-0'
            }`} />

            {/* Modal */}
            <div
                className={`relative w-full max-w-[420px] transition-all duration-500 ease-out ${
                    animateIn ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* Glow behind card */}
                <div className="absolute -inset-1 bg-gradient-to-br from-brand-500/20 via-transparent to-cyan-500/20 rounded-3xl blur-xl opacity-60" />

                <div className="relative bg-surface-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-surface-200/40 hover:text-white transition-all duration-200"
                    >
                        <X size={16} />
                    </button>

                    <div className="p-8">
                        {/* Header */}
                        <div className="flex items-center gap-4 mb-7">
                            <div className="relative">
                                <img src="/xbot-logo.png" alt="XBot" className="w-14 h-14 rounded-2xl shadow-xl shadow-brand-500/20 object-cover ring-1 ring-white/10" />
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-[3px] border-surface-900 flex items-center justify-center">
                                    <Sparkles size={8} className="text-white" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-0.5">
                                    {t('dashboard.auth.loginBtn') || 'Login with Telegram'}
                                </h2>
                                <p className="text-xs text-surface-200/40">
                                    {t('dashboard.auth.loginHint') || 'Sign in using your Telegram account'}
                                </p>
                            </div>
                        </div>

                        {/* Error */}
                        {displayError && (
                            <div className="mb-5 p-3.5 bg-red-500/8 border border-red-500/15 rounded-xl text-sm text-red-400 flex items-start gap-2.5 animate-[fadeIn_0.2s_ease]">
                                <span className="text-red-400 shrink-0 mt-0.5">⚠️</span>
                                <span className="leading-snug">{displayError}</span>
                            </div>
                        )}

                        {/* Telegram Login */}
                        <div className="space-y-4">
                            {/* Telegram Login Widget */}
                            {botUsername && (
                                <div ref={telegramWidgetRef} className="flex items-center justify-center min-h-[44px]" />
                            )}

                            {/* Open bot in Telegram button */}
                            <a
                                href={botUsername ? `https://t.me/${botUsername}?start=dashboard_login` : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`group w-full flex items-center justify-center gap-2.5 px-4 py-3.5 bg-[#2AABEE] text-white rounded-xl font-bold hover:bg-[#1E9AD6] transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-[#2AABEE]/20 no-underline text-sm ${!botUsername ? 'opacity-60 pointer-events-none' : ''}`}
                            >
                                {!botUsername ? (
                                    <Loader2 size={17} className="animate-spin" />
                                ) : (
                                    <Send size={17} />
                                )}
                                <span>{t('dashboard.auth.loginBtn') || 'Login with Telegram'}</span>
                                <ArrowRight size={15} className="opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100 transition-all" />
                            </a>

                            {/* Divider */}
                            <div className="flex items-center gap-4 py-1">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/[0.06]" />
                                <span className="text-[10px] text-surface-200/25 uppercase tracking-wider font-medium shrink-0">
                                    {t('dashboard.auth.autoLoginHint') || 'or type /dashboard in Telegram'}
                                </span>
                                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/[0.06]" />
                            </div>
                        </div>

                        {/* Trust signals */}
                        <div className="mt-6 pt-5 border-t border-white/[0.04]">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                    <Shield size={13} className="text-emerald-400" />
                                </div>
                                <p className="text-[11px] text-surface-200/35 leading-relaxed">
                                    {t('dashboard.auth.secureHint') || 'Your role (Owner/User) is verified via Telegram'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                                    <Sparkles size={13} className="text-brand-400" />
                                </div>
                                <p className="text-[11px] text-surface-200/35 leading-relaxed">
                                    Type <code className="px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md text-surface-200/50 text-[10px] font-mono">/dashboard</code> in Telegram for auto-login
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
