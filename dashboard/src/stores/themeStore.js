import { create } from 'zustand';

const useThemeStore = create((set) => ({
    theme: localStorage.getItem('xbot_dashboard_theme') || 'dark',

    setTheme: (theme) => {
        localStorage.setItem('xbot_dashboard_theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        set({ theme });
    },

    toggleTheme: () => {
        set((state) => {
            const next = state.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('xbot_dashboard_theme', next);
            if (next === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            return { theme: next };
        });
    },

    initTheme: () => {
        const stored = localStorage.getItem('xbot_dashboard_theme');
        const theme = stored || 'dark';
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        set({ theme });
    },
}));

export default useThemeStore;
