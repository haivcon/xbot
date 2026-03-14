import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';

const LANGUAGES = [
    { code: 'en', flag: '🇺🇸', label: 'English' },
    { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
    { code: 'zh', flag: '🇨🇳', label: '中文' },
    { code: 'ko', flag: '🇰🇷', label: '한국어' },
    { code: 'ru', flag: '🇷🇺', label: 'Русский' },
    { code: 'id', flag: '🇮🇩', label: 'Indonesia' },
];

/**
 * Reusable language selector dropdown.
 * @param {'header'|'landing'|'sidebar'} variant — style variant
 */
export default function LanguageSelector({ variant = 'header' }) {
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const currentLang = i18n.language?.substring(0, 2) || 'en';
    const current = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

    useEffect(() => {
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    // ─── Style variants ─────────────────────────────────────────────
    const isLanding = variant === 'landing';
    const isSidebar = variant === 'sidebar';

    const btnClass = isSidebar
        ? 'w-full flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl text-sm text-surface-200 hover:bg-white/[0.06] hover:border-white/10 transition-all'
        : isLanding
            ? 'flex items-center gap-2 px-3 py-2 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-surface-200 hover:bg-white/[0.1] hover:border-white/20 transition-all backdrop-blur-sm'
            : 'flex items-center gap-2 px-3 py-2 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-surface-200 hover:bg-white/[0.1] hover:border-white/20 transition-all backdrop-blur-sm';

    const dropdownPosition = isSidebar
        ? 'absolute bottom-full left-0 right-0 mb-1'
        : 'absolute top-full right-0 mt-1.5 w-48';

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={btnClass}
            >
                {isSidebar && <Globe size={15} className="text-surface-200/50" />}
                <span className="text-base leading-none">{current.flag}</span>
                <span className={`${isSidebar ? 'flex-1 text-left' : ''} text-sm`}>{current.label}</span>
                <ChevronDown size={14} className={`text-surface-200/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className={`${dropdownPosition} bg-surface-800 border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-[fadeIn_0.15s_ease]`}>
                    {LANGUAGES.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors
                                ${lang.code === currentLang
                                    ? 'bg-brand-500/10 text-brand-400'
                                    : 'text-surface-200 hover:bg-white/5'
                                }`}
                        >
                            <span className="text-base leading-none">{lang.flag}</span>
                            <span className="flex-1 text-left">{lang.label}</span>
                            {lang.code === currentLang && <Check size={14} className="text-brand-400" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export { LANGUAGES };
