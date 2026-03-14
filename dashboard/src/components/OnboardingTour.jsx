import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * OnboardingTour — first-time user guide overlay.
 * Fully i18n'd with step-by-step tooltips.
 */
export default function OnboardingTour() {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState(0);

    const TOUR_STEPS = [
        { title: t('dashboard.tour.welcomeTitle', 'Welcome to your Dashboard! 🎉'), desc: t('dashboard.tour.welcomeDesc', "Let's take a quick tour of the key features."), icon: '👋' },
        { title: t('dashboard.tour.chatTitle', 'AI Chat'), desc: t('dashboard.tour.chatDesc', 'Chat with AI to swap tokens, check prices, and manage your portfolio.'), icon: '🤖', link: '/chat' },
        { title: t('dashboard.tour.walletsTitle', 'Trading Wallets'), desc: t('dashboard.tour.walletsDesc', 'Create and manage non-custodial wallets. Your keys, your control.'), icon: '💳', link: '/wallets' },
        { title: t('dashboard.tour.tradingTitle', 'On-Chain Trading'), desc: t('dashboard.tour.tradingDesc', 'Swap tokens, set limit orders, DCA, and track your trade history.'), icon: '📊', link: '/trading' },
        { title: t('dashboard.tour.settingsTitle', 'Settings & API Keys'), desc: t('dashboard.tour.settingsDesc', 'Configure your AI model, language, and API keys.'), icon: '⚙️', link: '/settings' },
        { title: t('dashboard.tour.doneTitle', "You're all set!"), desc: t('dashboard.tour.doneDesc', 'Start by chatting with AI or creating your first wallet. Happy trading! 🚀'), icon: '✅' },
    ];

    useEffect(() => {
        const seen = localStorage.getItem('onboarding_done');
        if (!seen) {
            const timer = setTimeout(() => setVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const dismiss = useCallback(() => {
        setVisible(false);
        localStorage.setItem('onboarding_done', '1');
    }, []);

    const next = () => { if (step < TOUR_STEPS.length - 1) setStep(step + 1); else dismiss(); };
    const prev = () => { if (step > 0) setStep(step - 1); };

    if (!visible) return null;

    const current = TOUR_STEPS[step];
    const isLast = step === TOUR_STEPS.length - 1;
    const isFirst = step === 0;
    const progress = ((step + 1) / TOUR_STEPS.length) * 100;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center animate-fadeIn" role="dialog" aria-modal="true" aria-label="Onboarding Tour">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />
            <div className="relative w-[90vw] max-w-md mx-auto">
                <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                    <div className="h-1 bg-white/5">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                    <button onClick={dismiss} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 text-surface-200/40 hover:text-surface-200/70 transition-colors z-10" aria-label={t('dashboard.common.close', 'Close')}>
                        <X size={14} />
                    </button>
                    <div className="px-6 pt-8 pb-6 text-center">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20 flex items-center justify-center text-3xl mb-4">{current.icon}</div>
                        <h3 className="text-lg font-semibold text-surface-100 mb-2">{current.title}</h3>
                        <p className="text-sm text-surface-200/50 leading-relaxed max-w-xs mx-auto">{current.desc}</p>
                    </div>
                    <div className="flex justify-center gap-1.5 pb-4">
                        {TOUR_STEPS.map((_, i) => (
                            <button key={i} onClick={() => setStep(i)} className={`w-2 h-2 rounded-full transition-all duration-300 ${i === step ? 'bg-brand-500 w-5' : i < step ? 'bg-brand-500/40' : 'bg-white/10'}`} aria-label={`Step ${i + 1}`} />
                        ))}
                    </div>
                    <div className="flex items-center justify-between px-6 pb-5">
                        <button onClick={dismiss} className="text-xs text-surface-200/30 hover:text-surface-200/60 transition-colors">{t('dashboard.tour.skip', 'Skip tour')}</button>
                        <div className="flex items-center gap-2">
                            {!isFirst && (
                                <button onClick={prev} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200/50 transition-all" aria-label={t('dashboard.common.previous', 'Previous')}>
                                    <ChevronLeft size={16} />
                                </button>
                            )}
                            <button onClick={next} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-all text-sm font-medium">
                                {isLast ? (<><Sparkles size={14} /> {t('dashboard.tour.getStarted', 'Get Started')}</>) : (<>{t('dashboard.tour.next', 'Next')} <ChevronRight size={14} /></>)}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
