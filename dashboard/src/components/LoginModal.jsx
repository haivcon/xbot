import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import { X, Shield, User, Bot, Loader2 } from 'lucide-react';

export default function LoginModal({ open, onClose }) {
    const { t } = useTranslation();
    const { login, loading, error } = useAuthStore();
    const [localError, setLocalError] = useState(null);

    if (!open) return null;

    const handleLogin = async (role) => {
        setLocalError(null);
        const mockUser = {
            id: role === 'owner' ? 123456789 : 987654321,
            first_name: role === 'owner' ? 'Admin' : 'User',
            username: role === 'owner' ? 'xbot_admin' : 'xbot_user',
            auth_date: Math.floor(Date.now() / 1000),
            hash: 'dev_mode',
        };
        try {
            await login(mockUser);
            onClose();
        } catch (err) {
            setLocalError(err.message);
        }
    };

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
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
                            <Bot size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {t('dashboard.auth.loginBtn') || 'Login'}
                            </h2>
                            <p className="text-xs text-surface-200/50">
                                {t('dashboard.auth.loginHint') || 'Sign in to access the dashboard'}
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

                    {/* Login buttons */}
                    <div className="space-y-3">
                        <button
                            onClick={() => handleLogin('owner')}
                            disabled={loading}
                            className="w-full flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-brand-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all duration-300 hover:scale-[1.01] disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
                            <div className="text-left">
                                <p className="text-sm font-semibold">Login as Owner</p>
                                <p className="text-[10px] text-white/60">Full admin access</p>
                            </div>
                        </button>

                        <button
                            onClick={() => handleLogin('user')}
                            disabled={loading}
                            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white/5 border border-white/10 text-white rounded-xl font-semibold hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.01] disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <User size={18} />}
                            <div className="text-left">
                                <p className="text-sm font-semibold">Login as User</p>
                                <p className="text-[10px] text-surface-200/50">Profile & trading view</p>
                            </div>
                        </button>
                    </div>

                    {/* Telegram hint */}
                    <div className="mt-5 pt-4 border-t border-white/5">
                        <p className="text-[11px] text-surface-200/30 text-center">
                            💡 Type <code className="px-1 py-0.5 bg-white/5 rounded text-surface-200/50">/dashboard</code> in Telegram for auto-login
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
