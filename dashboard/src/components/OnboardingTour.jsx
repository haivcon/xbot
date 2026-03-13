import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

/**
 * OnboardingTour — first-time user guide overlay.
 * Shows step-by-step tooltips highlighting key UI areas.
 */
const TOUR_STEPS = [
    {
        title: 'Welcome to your Dashboard! 🎉',
        desc: 'Let\'s take a quick tour of the key features.',
        icon: '👋',
    },
    {
        title: 'AI Chat',
        desc: 'Chat with AI to swap tokens, check prices, and manage your portfolio — all in natural language.',
        icon: '🤖',
        link: '/chat',
    },
    {
        title: 'Trading Wallets',
        desc: 'Create and manage non-custodial wallets. Your keys, your control.',
        icon: '💳',
        link: '/wallets',
    },
    {
        title: 'On-Chain Trading',
        desc: 'Swap tokens, set limit orders, DCA, and track your trade history.',
        icon: '📊',
        link: '/trading',
    },
    {
        title: 'Settings & API Keys',
        desc: 'Configure your AI model, language, and API keys for the best experience.',
        icon: '⚙️',
        link: '/settings',
    },
    {
        title: 'You\'re all set!',
        desc: 'Start by chatting with AI or creating your first trading wallet. Happy trading! 🚀',
        icon: '✅',
    },
];

export default function OnboardingTour() {
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const seen = localStorage.getItem('onboarding_done');
        if (!seen) {
            // Show after a short delay for smooth UX
            const timer = setTimeout(() => setVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const dismiss = useCallback(() => {
        setVisible(false);
        localStorage.setItem('onboarding_done', '1');
    }, []);

    const next = () => {
        if (step < TOUR_STEPS.length - 1) setStep(step + 1);
        else dismiss();
    };

    const prev = () => {
        if (step > 0) setStep(step - 1);
    };

    if (!visible) return null;

    const current = TOUR_STEPS[step];
    const isLast = step === TOUR_STEPS.length - 1;
    const isFirst = step === 0;
    const progress = ((step + 1) / TOUR_STEPS.length) * 100;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center animate-fadeIn">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

            {/* Card */}
            <div className="relative w-[90vw] max-w-md mx-auto">
                <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Progress bar */}
                    <div className="h-1 bg-white/5">
                        <div
                            className="h-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Close button */}
                    <button
                        onClick={dismiss}
                        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 text-surface-200/40 hover:text-surface-200/70 transition-colors z-10"
                    >
                        <X size={14} />
                    </button>

                    {/* Content */}
                    <div className="px-6 pt-8 pb-6 text-center">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20 flex items-center justify-center text-3xl mb-4">
                            {current.icon}
                        </div>
                        <h3 className="text-lg font-semibold text-surface-100 mb-2">{current.title}</h3>
                        <p className="text-sm text-surface-200/50 leading-relaxed max-w-xs mx-auto">{current.desc}</p>
                    </div>

                    {/* Step indicator dots */}
                    <div className="flex justify-center gap-1.5 pb-4">
                        {TOUR_STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setStep(i)}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                    i === step ? 'bg-brand-500 w-5' : i < step ? 'bg-brand-500/40' : 'bg-white/10'
                                }`}
                            />
                        ))}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between px-6 pb-5">
                        <button
                            onClick={dismiss}
                            className="text-xs text-surface-200/30 hover:text-surface-200/60 transition-colors"
                        >
                            Skip tour
                        </button>
                        <div className="flex items-center gap-2">
                            {!isFirst && (
                                <button
                                    onClick={prev}
                                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200/50 transition-all"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                            )}
                            <button
                                onClick={next}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-all text-sm font-medium"
                            >
                                {isLast ? (
                                    <><Sparkles size={14} /> Get Started</>
                                ) : (
                                    <>Next <ChevronRight size={14} /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
