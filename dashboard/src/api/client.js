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

    // === AI Chat APIs ===
    sendChatMessage(message, conversationId = null) {
        return this.post('/ai/chat', { message, conversationId });
    }

    getChatHistory() {
        return this.get('/ai/history');
    }

    getChatMessages(conversationId) {
        return this.get(`/ai/history/${conversationId}`);
    }

    clearChat(conversationId) {
        return this.delete(`/ai/history/${conversationId}`);
    }

    clearAllChats() {
        return this.delete('/ai/history');
    }

    // === Market APIs ===
    getTokenPrice(tokens) { return this.post('/market/token/price', { tokens }); }
    searchToken(keyword, chains = '196') { return this.get(`/market/token/search?keyword=${encodeURIComponent(keyword)}&chains=${chains}`); }
    getTopTokens(chains = '196', sortBy = '2', timeFrame = '4') { return this.get(`/market/token/top?chains=${chains}&sortBy=${sortBy}&timeFrame=${timeFrame}`); }
    getTokenInfo(tokens) { return this.post('/market/token/info', { tokens }); }
    getTokenHolders(chainIndex, tokenContractAddress) { return this.get(`/market/token/holders?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}`); }
    getGasPrice(chainIndex = '196') { return this.get(`/market/gas?chainIndex=${chainIndex}`); }
    getCandles(chainIndex, tokenContractAddress, bar = '1H', limit = 24) { return this.get(`/market/candles?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}&bar=${bar}&limit=${limit}`); }
    getSignals(chainIndex = '196', walletType, minAmountUsd) { return this.post('/market/signals', { chainIndex, walletType, minAmountUsd }); }
    getSignalChains() { return this.get('/market/signals/chains'); }

    // === Wallet APIs ===
    getWallets() { return this.get('/market/wallets'); }
    createWallet(name) { return this.post('/market/wallets/create', { name }); }
    getWalletBalance(id) { return this.get(`/market/wallets/${id}/balance`); }
    deleteWallet(id) { return this.delete(`/market/wallets/${id}`); }
    setDefaultWallet(id) { return this.post(`/market/wallets/${id}/set-default`); }

    // === Swap APIs ===
    getSwapQuote(params) { return this.post('/market/swap/quote', params); }

    // === TX History ===
    getTxHistory(page = 1, limit = 20) { return this.get(`/market/tx-history?page=${page}&limit=${limit}`); }

    // === OKX CEX APIs ===
    getOkxKeyStatus() { return this.get('/okx/keys/status'); }
    saveOkxKeys(keys) { return this.post('/okx/keys', keys); }
    deleteOkxKeys() { return this.delete('/okx/keys'); }

    getOkxTicker(instId) { return this.get(`/okx/market/ticker?instId=${instId}`); }
    getOkxTickers(instType = 'SPOT') { return this.get(`/okx/market/tickers?instType=${instType}`); }
    getOkxOrderbook(instId, sz = '20') { return this.get(`/okx/market/orderbook?instId=${instId}&sz=${sz}`); }
    getOkxCandles(instId, bar = '1H', limit = '100') { return this.get(`/okx/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`); }
    getOkxFundingRate(instId) { return this.get(`/okx/market/funding-rate?instId=${instId}`); }
    getOkxInstruments(instType = 'SPOT') { return this.get(`/okx/market/instruments?instType=${instType}`); }

    getOkxBalance(ccy) { return this.get(`/okx/account/balance${ccy ? '?ccy=' + ccy : ''}`); }
    getOkxAssetBalance(ccy) { return this.get(`/okx/account/asset-balance${ccy ? '?ccy=' + ccy : ''}`); }
    getOkxPositions(instType) { return this.get(`/okx/account/positions${instType ? '?instType=' + instType : ''}`); }

    placeOkxOrder(params) { return this.post('/okx/spot/order', params); }
    cancelOkxOrder(instId, ordId) { return this.delete('/okx/spot/order', { instId, ordId }); }
    getOkxOpenOrders(instType) { return this.get(`/okx/spot/orders-open${instType ? '?instType=' + instType : ''}`); }
    getOkxOrderHistory(instType) { return this.get(`/okx/spot/orders-history${instType ? '?instType=' + instType : ''}`); }

    createOkxGridBot(params) { return this.post('/okx/bot/grid', params); }
    stopOkxGridBot(algoId, instId) { return this.delete('/okx/bot/grid', { algoId, instId }); }
    getOkxActiveGridBots() { return this.get('/okx/bot/grid/active'); }
    getOkxGridBotHistory() { return this.get('/okx/bot/grid/history'); }
}

const api = new ApiClient();
export default api;
