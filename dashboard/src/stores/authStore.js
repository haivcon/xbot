import { create } from 'zustand';

const API_BASE = '/api/dashboard';

const useAuthStore = create((set, get) => ({
    user: null,
    token: null,
    role: null, // 'owner' | 'user'
    viewMode: null, // 'owner' | 'user' — for owners to toggle view
    loading: true,
    error: null,

    init: async () => {
        // 1. Try to restore from localStorage
        const stored = localStorage.getItem('xbot_dashboard_auth');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.token) {
                    set({ user: data.user, token: data.token, role: data.role, viewMode: data.role, loading: false });
                    return;
                }
            } catch {
                localStorage.removeItem('xbot_dashboard_auth');
            }
        }

        // 2. Try Telegram Mini App auto-login (WebApp.initData)
        const tgWebApp = window.Telegram?.WebApp;
        if (tgWebApp?.initData) {
            try {
                // Expand Mini App to full height + set theme
                try { tgWebApp.expand(); } catch { /* ignore */ }
                try { tgWebApp.setHeaderColor('#0f172a'); } catch { /* ignore */ }
                try { tgWebApp.setBackgroundColor('#0f172a'); } catch { /* ignore */ }

                const res = await fetch(`${API_BASE}/auth/webapp-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tgWebApp.initData }),
                });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('xbot_dashboard_auth', JSON.stringify(data));
                    set({ user: data.user, token: data.token, role: data.role, viewMode: data.role, loading: false });
                    try { tgWebApp.ready(); } catch { /* ignore */ }
                    return;
                }
            } catch (err) {
                console.warn('WebApp auto-login failed:', err);
            }
        }

        // 3. No auth available — show login screen
        set({ loading: false });
    },

    login: async (telegramData) => {
        set({ loading: true, error: null });
        try {
            const res = await fetch(`${API_BASE}/auth/telegram-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(telegramData),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Login failed');
            }
            const data = await res.json();
            localStorage.setItem('xbot_dashboard_auth', JSON.stringify(data));
            set({ user: data.user, token: data.token, role: data.role, viewMode: data.role, loading: false });
            return data;
        } catch (err) {
            set({ error: err.message, loading: false });
            throw err;
        }
    },

    loginWithWebApp: async (initData) => {
        set({ loading: true, error: null });
        try {
            const res = await fetch(`${API_BASE}/auth/webapp-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'WebApp login failed');
            }
            const data = await res.json();
            localStorage.setItem('xbot_dashboard_auth', JSON.stringify(data));
            set({ user: data.user, token: data.token, role: data.role, viewMode: data.role, loading: false });
            return data;
        } catch (err) {
            set({ error: err.message, loading: false });
            throw err;
        }
    },

    logout: () => {
        localStorage.removeItem('xbot_dashboard_auth');
        set({ user: null, token: null, role: null, viewMode: null, error: null });
    },

    isOwner: () => get().role === 'owner',
    isOwnerView: () => get().viewMode === 'owner',
    isAuthenticated: () => !!get().token,

    toggleViewMode: () => {
        if (get().role !== 'owner') return; // Only owners can toggle
        set({ viewMode: get().viewMode === 'owner' ? 'user' : 'owner' });
    },

    getHeaders: () => {
        const token = get().token;
        return token ? { Authorization: `Bearer ${token}` } : {};
    },
}));

export default useAuthStore;
