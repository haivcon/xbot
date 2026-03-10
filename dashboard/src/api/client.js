import useAuthStore from '@/stores/authStore';

const API_BASE = '/api/dashboard';

class ApiClient {
    async request(path, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...useAuthStore.getState().getHeaders(),
            ...options.headers,
        };

        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
        });

        if (res.status === 401) {
            useAuthStore.getState().logout();
            window.location.href = '/';
            throw new Error('Unauthorized');
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Network error' }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        return res.json();
    }

    get(path) {
        return this.request(path);
    }

    post(path, body) {
        return this.request(path, { method: 'POST', body: JSON.stringify(body) });
    }

    put(path, body) {
        return this.request(path, { method: 'PUT', body: JSON.stringify(body) });
    }

    delete(path) {
        return this.request(path, { method: 'DELETE' });
    }

    // === Owner APIs ===
    getHealth() {
        return this.get('/health');
    }

    getUsers(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.get(`/owner/users${qs ? '?' + qs : ''}`);
    }

    banUser(userId, reason = '') {
        return this.post('/owner/users/ban', { userId, reason });
    }

    unbanUser(userId) {
        return this.post('/owner/users/unban', { userId });
    }

    getGroups(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.get(`/owner/groups${qs ? '?' + qs : ''}`);
    }

    getAnalytics(period = '7d') {
        return this.get(`/owner/analytics?period=${period}`);
    }

    getBannedUsers() {
        return this.get('/owner/users/banned');
    }

    getCoOwners() {
        return this.get('/owner/co-owners');
    }

    // === User APIs ===
    getProfile() {
        return this.get('/user/profile');
    }

    updatePreferences(prefs) {
        return this.put('/user/preferences', prefs);
    }

    getWallets() {
        return this.get('/user/wallets');
    }

    getTradingHistory(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.get(`/user/trading-history${qs ? '?' + qs : ''}`);
    }

    getFavorites() {
        return this.get('/user/favorites');
    }

    getStats() {
        return this.get('/user/stats');
    }
}

const api = new ApiClient();
export default api;
