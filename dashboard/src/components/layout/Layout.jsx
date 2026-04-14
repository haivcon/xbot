import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import useThemeStore from '@/stores/themeStore';
import useWsStore from '@/stores/wsStore';
import OnboardingTour from '@/components/OnboardingTour';
import CommandPalette from '@/components/CommandPalette';
import useKeyboardShortcuts from '@/utils/useKeyboardShortcuts';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { theme } = useThemeStore();
    const { connect, disconnect } = useWsStore();
    const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/');

    // Global keyboard shortcuts
    const handleCommandPalette = useCallback(() => setPaletteOpen(true), []);
    const handleFocusChat = useCallback(() => {
        const chatInput = document.querySelector('#chat-input');
        if (chatInput) chatInput.focus();
        else navigate('/chat');
    }, [navigate]);
    useKeyboardShortcuts({
        onCommandPalette: handleCommandPalette,
        onFocusChat: handleFocusChat,
    });

    // Auto-connect WebSocket on mount
    useEffect(() => {
        connect();
        return () => disconnect();
    }, []);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div className={`flex h-[100dvh] overflow-hidden transition-colors duration-300 ${theme === 'light' ? 'bg-slate-50' : 'bg-surface-900'}`}>
            {/* Onboarding Tour for first-time users */}
            <OnboardingTour />

            {/* Command Palette (Ctrl+K) */}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-200"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Header — hidden on mobile when on full-screen chat */}
                {!isChatRoute && <Header onMenuClick={() => setSidebarOpen(true)} />}
                <main className={`flex-1 min-h-0 transition-colors duration-300 ${
                    isChatRoute ? 'overflow-hidden' : 'p-4 md:p-6 lg:p-8 overflow-auto pb-20 lg:pb-8'
                } ${theme === 'light' ? 'bg-slate-50' : ''}`}>
                    {isChatRoute ? (
                        <Outlet context={{ setGlobalSidebarOpen: setSidebarOpen }} />
                    ) : (
                        <div key={location.pathname} className="max-w-7xl mx-auto page-enter">
                            <Outlet context={{ setGlobalSidebarOpen: setSidebarOpen }} />
                        </div>
                    )}
                </main>
            </div>

            {/* Mobile bottom navigation */}
            <MobileBottomNav />
        </div>
    );
}
