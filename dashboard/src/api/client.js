import useAuthStore from '@/stores/authStore';
import config from '@/config';

const API_BASE = config.apiBase;

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

    getLeaderboard(gameType = 'sudoku') {
        return this.get(`/user/leaderboard?gameType=${gameType}`);
    }

    // === New Owner APIs ===
    getOverview() {
        return this.get('/owner/overview');
    }

    getRuntimeConfig() {
        return this.get('/owner/config/runtime');
    }

    getAlerts() {
        return this.get('/owner/alerts');
    }

    createAlert(data) {
        return this.post('/owner/alerts', data);
    }

    updateAlert(id, data) {
        return this.put(`/owner/alerts/${id}`, data);
    }

    deleteAlert(id) {
        return this.delete(`/owner/alerts/${id}`);
    }

    getPosts() {
        return this.get('/owner/posts');
    }

    createPost(data) {
        return this.post('/owner/posts', data);
    }

    updatePost(id, data) {
        return this.put(`/owner/posts/${id}`, data);
    }

    deletePost(id) {
        return this.delete(`/owner/posts/${id}`);
    }

    getAiKeys() {
        return this.get('/owner/config/ai-keys');
    }

    refreshToken() {
        return this.post('/auth/refresh');
    }
}

const api = new ApiClient();
export default api;
