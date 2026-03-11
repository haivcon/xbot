import { create } from 'zustand';
import { getTelegramColorScheme, getTgWebApp } from '@/utils/telegram';

const useThemeStore = create((set) => ({
    theme: localStorage.getItem('xbot_dashboard_theme') || 'dark',

    setTheme: (theme) => {
        localStorage.setItem('xbot_dashboard_theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        // Update Mini App header colors
        const tg = getTgWebApp();
        if (tg) {
            try { tg.setHeaderColor(theme === 'dark' ? '#0f172a' : '#f8fafc'); } catch { /* ignore */ }
            try { tg.setBackgroundColor(theme === 'dark' ? '#0f172a' : '#f8fafc'); } catch { /* ignore */ }
        }
        set({ theme });
    },

    toggleTheme: () => {
        const current = useThemeStore.getState().theme;
        const next = current === 'dark' ? 'light' : 'dark';
        useThemeStore.getState().setTheme(next);
    },

    initTheme: () => {
        const stored = localStorage.getItem('xbot_dashboard_theme');
        // #4: Auto-sync with Telegram's theme on first visit (no stored preference)
        const tgScheme = getTelegramColorScheme();
        const theme = stored || (tgScheme === 'light' ? 'light' : 'dark');

        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        // Set Mini App header colors to match
        const tg = getTgWebApp();
        if (tg) {
            try { tg.setHeaderColor(theme === 'dark' ? '#0f172a' : '#f8fafc'); } catch { /* ignore */ }
            try { tg.setBackgroundColor(theme === 'dark' ? '#0f172a' : '#f8fafc'); } catch { /* ignore */ }
        }
        set({ theme });
    },
}));

export default useThemeStore;

