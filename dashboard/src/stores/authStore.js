import { create } from 'zustand';

const API_BASE = '/api/dashboard';

// Token refresh timer
let _refreshTimer = null;

/** Decode JWT payload to get expiry */
function getTokenExpiry(token) {
    try {
        const [, body] = token.split('.');
        const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
        return payload.exp ? payload.exp * 1000 : null; // ms
    } catch { return null; }
}

/** Schedule auto-refresh 1 hour before JWT expires */
function scheduleTokenRefresh(token) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const expiry = getTokenExpiry(token);
    if (!expiry) return;
    const refreshIn = expiry - Date.now() - 3600_000; // 1 hour before
    if (refreshIn <= 0) {
        // Already close to expiry — refresh now
        setTimeout(() => useAuthStore.getState().refreshToken(), 1000);
    } else {
        _refreshTimer = setTimeout(() => useAuthStore.getState().refreshToken(), Math.min(refreshIn, 2147483647));
    }
}

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
                    scheduleTokenRefresh(data.token);
                    return;
                }
            } catch {
                localStorage.removeItem('xbot_dashboard_auth');
            }
        }

        // 2. Try Telegram Mini App auto-login (WebApp.initData)
        // Wait for lazy-loaded SDK (max 1.5s)
        let tgWebApp = window.Telegram?.WebApp;
        if (!tgWebApp && (window.location.search.includes('tgWebAppData') || navigator.userAgent.includes('Telegram'))) {
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 100));
                tgWebApp = window.Telegram?.WebApp;
                if (tgWebApp?.initData) break;
            }
        }
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
                    scheduleTokenRefresh(data.token);
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
            scheduleTokenRefresh(data.token);
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
            scheduleTokenRefresh(data.token);
            return data;
        } catch (err) {
            set({ error: err.message, loading: false });
            throw err;
        }
    },

    refreshToken: async () => {
        const token = get().token;
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                const stored = JSON.parse(localStorage.getItem('xbot_dashboard_auth') || '{}');
                stored.token = data.token;
                stored.role = data.role;
                localStorage.setItem('xbot_dashboard_auth', JSON.stringify(stored));
                set({ token: data.token, role: data.role });
                scheduleTokenRefresh(data.token);
            } else {
                // Token expired beyond repair → logout
                get().logout();
            }
        } catch {
            // Network error — try again later
            setTimeout(() => get().refreshToken(), 60_000);
        }
    },

    logout: () => {
        if (_refreshTimer) clearTimeout(_refreshTimer);
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
