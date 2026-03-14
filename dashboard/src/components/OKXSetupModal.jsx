import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Key, Eye, EyeOff, Shield, AlertTriangle, Loader2, Check, X, ExternalLink
} from 'lucide-react';

/**
 * OKX API Key Setup Modal
 * Guided wizard for entering and verifying OKX API credentials.
 */
export default function OKXSetupModal({ onClose, onSaved }) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [apiKey, setApiKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [demo, setDemo] = useState(true);
    const [site, setSite] = useState('global');
    const [showSecret, setShowSecret] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSave = async () => {
        if (!apiKey || !secretKey || !passphrase) {
            setError('All fields are required');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await api.saveOkxKeys({ apiKey, secretKey, passphrase, demo, site });
            onSaved?.();
            onClose();
        } catch (err) {
            setError(err.detail || err.message || 'Verification failed');
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                            <Key size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-surface-100">OKX API Setup</h3>
                            <p className="text-[10px] text-surface-200/40">Keys are encrypted & stored securely</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/30">
                        <X size={16} />
                    </button>
                </div>

                {step === 1 ? (
                    /* Step 1: Profile selection */
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-surface-800/40 border border-white/5">
                            <h4 className="text-sm font-semibold text-surface-100 mb-3">Trading Mode</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setDemo(true)}
                                    className={`p-3 rounded-xl border text-left transition-all ${demo
                                            ? 'border-emerald-500/30 bg-emerald-500/5'
                                            : 'border-white/5 hover:border-white/10'
                                        }`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Shield size={14} className="text-emerald-400" />
                                        <span className="text-xs font-semibold text-surface-100">Demo</span>
                                    </div>
                                    <p className="text-[10px] text-surface-200/40">Simulated trading, zero risk</p>
                                </button>
                                <button
                                    onClick={() => setDemo(false)}
                                    className={`p-3 rounded-xl border text-left transition-all ${!demo
                                            ? 'border-amber-500/30 bg-amber-500/5'
                                            : 'border-white/5 hover:border-white/10'
                                        }`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertTriangle size={14} className="text-amber-400" />
                                        <span className="text-xs font-semibold text-surface-100">Live</span>
                                    </div>
                                    <p className="text-[10px] text-surface-200/40">Real funds, real trades</p>
                                </button>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-surface-800/40 border border-white/5">
                            <h4 className="text-sm font-semibold text-surface-100 mb-3">Site Region</h4>
                            <select value={site} onChange={e => setSite(e.target.value)}
                                className="bg-surface-700/60 border border-white/5 rounded-lg px-3 py-2 text-xs text-surface-100 w-full">
                                <option value="global">Global (www.okx.com)</option>
                                <option value="eea">EEA (my.okx.com)</option>
                                <option value="us">US (app.okx.com)</option>
                            </select>
                        </div>

                        <button onClick={() => setStep(2)} className="btn-primary w-full text-sm">
                            Continue
                        </button>

                        <a href="https://www.okx.com/account/my-api" target="_blank" rel="noopener"
                            className="flex items-center justify-center gap-1.5 text-[10px] text-brand-400 hover:underline">
                            <ExternalLink size={10} /> {t('dashboard.okxSetup.getApiKeys', 'Get API keys from OKX')}
                        </a>
                    </div>
                ) : (
                    /* Step 2: Enter credentials */
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${demo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {demo ? 'DEMO MODE' : 'LIVE MODE'}
                            </span>
                            <span className="text-[9px] text-surface-200/25">{site.toUpperCase()}</span>
                        </div>

                        <div>
                            <label className="text-[10px] text-surface-200/40 uppercase tracking-wider mb-1 block">API Key</label>
                            <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
                                placeholder="Enter your OKX API Key"
                                className="input-field text-xs py-2.5 w-full font-mono" />
                        </div>

                        <div>
                            <label className="text-[10px] text-surface-200/40 uppercase tracking-wider mb-1 block">Secret Key</label>
                            <div className="relative">
                                <input
                                    type={showSecret ? 'text' : 'password'}
                                    value={secretKey}
                                    onChange={e => setSecretKey(e.target.value)}
                                    placeholder="Enter your Secret Key"
                                    className="input-field text-xs py-2.5 w-full font-mono pr-8" />
                                <button onClick={() => setShowSecret(!showSecret)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-200/30 hover:text-surface-200/60">
                                    {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] text-surface-200/40 uppercase tracking-wider mb-1 block">Passphrase</label>
                            <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)}
                                placeholder="Enter your Passphrase"
                                className="input-field text-xs py-2.5 w-full font-mono" />
                        </div>

                        {!demo && (
                            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                                <p className="text-[10px] text-red-400/80 flex items-start gap-1.5">
                                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                    <span><strong>{t('dashboard.okxSetup.liveMode', 'Live mode')}:</strong> {t('dashboard.okxSetup.liveModeWarning', 'Trades will use real funds. We recommend using a sub-account API key with only Trade permission. Never enable Withdrawal.')}</span>
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                <p className="text-xs text-red-400">{error}</p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="btn-secondary flex-1 text-sm">Back</button>
                            <button onClick={handleSave} disabled={loading}
                                className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                Verify & Save
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
