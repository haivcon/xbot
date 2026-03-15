import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import { X, Bot, Send, Loader2 } from 'lucide-react';

export default function LoginModal({ open, onClose }) {
    const { t } = useTranslation();
    const { login, loading, error } = useAuthStore();
    const [localError, setLocalError] = useState(null);
    const [botUsername, setBotUsername] = useState(null);
    const telegramWidgetRef = useRef(null);

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
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div
                className="relative w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-[fadeIn_0.2s_ease]"
                onClick={e => e.stopPropagation()}
            >
                {/* Decorative gradient */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 via-cyan-500 to-purple-500" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-surface-200/50 hover:text-white transition-colors"
                >
                    <X size={18} />
                </button>

                <div className="p-8">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <img src="/xbot-logo.png" alt="XBot" className="w-11 h-11 rounded-xl shadow-lg shadow-brand-500/25 object-cover" />
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {t('dashboard.auth.loginBtn') || 'Login with Telegram'}
                            </h2>
                            <p className="text-xs text-surface-200/50">
                                {t('dashboard.auth.loginHint') || 'Sign in using your Telegram account'}
                            </p>
                        </div>
                    </div>

                    {/* Error */}
                    {displayError && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-start gap-2">
                            <span className="text-red-400 shrink-0">⚠️</span>
                            {displayError}
                        </div>
                    )}

                    {/* Telegram Login */}
                    <div className="space-y-4">
                        {/* Telegram Login Widget */}
                        {botUsername && (
                            <div ref={telegramWidgetRef} className="flex items-center justify-center min-h-[44px]" />
                        )}

                        {/* Open bot in Telegram button — always shown */}
                        <a
                            href={botUsername ? `https://t.me/${botUsername}?start=dashboard_login` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-[#2AABEE] text-white rounded-xl font-semibold hover:bg-[#229ED9] transition-all duration-300 hover:scale-[1.01] no-underline text-sm ${!botUsername ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            {!botUsername ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Send size={16} />
                            )}
                            {t('dashboard.auth.loginBtn') || 'Login with Telegram'}
                        </a>

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-white/5" />
                            <span className="text-[10px] text-surface-200/30 uppercase tracking-wider">
                                {t('dashboard.auth.autoLoginHint') || 'or type /dashboard in Telegram'}
                            </span>
                            <div className="flex-1 h-px bg-white/5" />
                        </div>
                    </div>

                    {/* Hint */}
                    <div className="mt-5 pt-4 border-t border-white/5">
                        <p className="text-[11px] text-surface-200/30 text-center">
                            🔒 {t('dashboard.auth.secureHint') || 'Your role (Owner/User) is verified via Telegram'}
                        </p>
                        <p className="text-[11px] text-surface-200/30 text-center mt-1">
                            💡 Type <code className="px-1 py-0.5 bg-white/5 rounded text-surface-200/50">/dashboard</code> in Telegram for auto-login
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
