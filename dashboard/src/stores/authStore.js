import { create } from 'zustand';

const API_BASE = '/api/dashboard';

const useAuthStore = create((set, get) => ({
    user: null,
    token: null,
    role: null, // 'owner' | 'user'
    viewMode: null, // 'owner' | 'user' — for owners to toggle view
    loading: true,
    error: null,

    init: () => {
        const stored = localStorage.getItem('xbot_dashboard_auth');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                set({ user: data.user, token: data.token, role: data.role, viewMode: data.role, loading: false });
            } catch {
                localStorage.removeItem('xbot_dashboard_auth');
                set({ loading: false });
            }
        } else {
            set({ loading: false });
        }
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
