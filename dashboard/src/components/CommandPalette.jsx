import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Search, LayoutDashboard, MessageSquare, Wallet, BarChart3, Settings, Bell,
    Trophy, Gamepad2, Users, Sparkles, Zap, Compass, X
} from 'lucide-react';

const ICON_MAP = {
    '/overview': LayoutDashboard, '/chat': MessageSquare, '/wallets': Wallet,
    '/trading': BarChart3, '/okx-trading': BarChart3, '/settings': Settings,
    '/alerts': Bell, '/leaderboard': Trophy, '/games': Gamepad2,
    '/users': Users, '/my-space': Sparkles, '/meme-scanner': Zap,
    '/discovery': Compass, '/token-lookup': Search,
};

export default function CommandPalette({ open, onClose }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');

    const pages = useMemo(() => [
        { path: '/chat', label: t('dashboard.sidebar.aiChat', 'AI Chat'), keywords: 'ai chat bot' },
        { path: '/overview', label: t('dashboard.sidebar.home', 'Dashboard'), keywords: 'dashboard overview home' },
        { path: '/wallets', label: t('dashboard.sidebar.wallets', 'Wallets'), keywords: 'wallet crypto' },
        { path: '/trading', label: t('dashboard.sidebar.dexTrading', 'DEX Trading'), keywords: 'trading dex swap' },
        { path: '/okx-trading', label: t('dashboard.sidebar.okxTrading', 'OKX Trading'), keywords: 'okx exchange' },
        { path: '/my-space', label: t('dashboard.sidebar.mySpace', 'My Space'), keywords: 'community space profile' },
        { path: '/token-lookup', label: t('dashboard.sidebar.tokenLookup', 'Token Lookup'), keywords: 'token search lookup' },
        { path: '/meme-scanner', label: t('dashboard.sidebar.memeScanner', 'Meme Scanner'), keywords: 'meme scanner' },
        { path: '/discovery', label: t('dashboard.sidebar.discovery', 'Discovery'), keywords: 'discover explore' },
        { path: '/leaderboard', label: t('dashboard.sidebar.leaderboard', 'Leaderboard'), keywords: 'rank leaderboard top' },
        { path: '/alerts', label: t('dashboard.sidebar.alerts', 'Alerts'), keywords: 'alerts price notification' },
        { path: '/games', label: t('dashboard.sidebar.games', 'Mini Games'), keywords: 'games fun play' },
        { path: '/settings', label: t('dashboard.sidebar.settings', 'Settings'), keywords: 'settings config preference' },
        { path: '/portfolio', label: t('dashboard.sidebar.portfolio', 'Portfolio'), keywords: 'portfolio balance' },
        { path: '/ai-memory', label: t('dashboard.sidebar.aiMemory', 'AI Memory'), keywords: 'ai memory' },
    ], [t]);

    const filtered = useMemo(() => {
        if (!query.trim()) return pages;
        const q = query.toLowerCase();
        return pages.filter(p => p.label.toLowerCase().includes(q) || p.keywords.includes(q));
    }, [query, pages]);

    const [selected, setSelected] = useState(0);

    useEffect(() => { setSelected(0); }, [query]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && filtered[selected]) { navigate(filtered[selected].path); onClose(); }
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, filtered, selected, navigate, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[20vh]" role="dialog" aria-modal="true" aria-label="Command Palette">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-[90vw] max-w-lg bg-surface-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-[fadeIn_0.15s_ease]">
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                    <Search size={18} className="text-surface-200/40 shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('dashboard.common.searchPages', 'Search pages...')}
                        className="flex-1 bg-transparent text-surface-100 placeholder:text-surface-200/30 outline-none text-sm"
                        aria-label="Search pages"
                    />
                    <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] text-surface-200/30 bg-white/5 border border-white/10 rounded font-mono">ESC</kbd>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-surface-200/40 lg:hidden" aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                {/* Results */}
                <div className="max-h-72 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                        <p className="text-center text-surface-200/30 text-xs py-8">{t('dashboard.common.noResults', 'No results found')}</p>
                    ) : (
                        filtered.map((page, i) => {
                            const Icon = ICON_MAP[page.path] || LayoutDashboard;
                            return (
                                <button
                                    key={page.path}
                                    onClick={() => { navigate(page.path); onClose(); }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                        i === selected ? 'bg-brand-500/10 text-brand-400' : 'text-surface-200/70 hover:bg-white/5'
                                    }`}
                                    onMouseEnter={() => setSelected(i)}
                                >
                                    <Icon size={16} className="shrink-0 opacity-60" />
                                    <span className="flex-1 text-left">{page.label}</span>
                                    {i === selected && <span className="text-[10px] text-surface-200/30">↵</span>}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-4 px-4 py-2 border-t border-white/5 text-[10px] text-surface-200/25">
                    <span>↑↓ {t('dashboard.common.navigate', 'Navigate')}</span>
                    <span>↵ {t('dashboard.common.open', 'Open')}</span>
                    <span>ESC {t('dashboard.common.close', 'Close')}</span>
                </div>
            </div>
        </div>
    );
}
