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

        const timeout = options.timeout || 30000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const res = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers,
                signal: controller.signal,
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
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
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

    delete(path, body) {
        return this.request(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) });
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

    getGroupDetail(chatId) {
        return this.get(`/owner/groups/${encodeURIComponent(chatId)}`);
    }

    updateGroupSettings(chatId, data) {
        return this.put(`/owner/groups/${encodeURIComponent(chatId)}/settings`, data);
    }

    sendGroupMessage(chatId, text) {
        return this.post(`/owner/groups/${encodeURIComponent(chatId)}/message`, { text });
    }

    deleteGroup(chatId) {
        return this.delete(`/owner/groups/${encodeURIComponent(chatId)}`);
    }

    syncGroupMembers(chatId) {
        return this.post(`/owner/groups/${encodeURIComponent(chatId)}/sync`);
    }

    broadcastMessage(text) {
        return this.post('/owner/groups/broadcast', { text });
    }

    getGroupActivity(chatId, limit = 50) {
        return this.get(`/owner/groups/${encodeURIComponent(chatId)}/activity?limit=${limit}`);
    }

    getRecentActivity(limit = 20) {
        return this.get(`/owner/activity/recent?limit=${limit}`);
    }

    getAnalytics(period = '7d') {
        return this.get(`/owner/analytics?period=${period}`);
    }

    getChatStats() {
        return this.get('/owner/analytics/stats');
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

    // (wallet methods via /market/wallets below)

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

    getUserOverview() {
        return this.get('/user/overview');
    }

    getRuntimeConfig() {
        return this.get('/owner/config/runtime');
    }

    getOwnerSettings() {
        return this.get('/owner/config/settings');
    }

    updateOwnerSettings(data) {
        return this.put('/owner/config/settings', data);
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
        return this.request('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message, conversationId }),
            timeout: 120000, // 2 min for multi-round tool execution
        });
    }

    getChatHistory() {
        return this.get('/ai/history');
    }

    compareChat(message, modelA, modelB) {
        return this.request('/ai/chat/compare', {
            method: 'POST',
            body: JSON.stringify({ message, modelA, modelB }),
            timeout: 120000,
        });
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

    // SSE streaming chat
    async streamChatMessage(message, conversationId, { onTextDelta, onToolStart, onToolResult, onDone, onError, image, model, userApiKey, signal } = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...useAuthStore.getState().getHeaders(),
        };
        const body = { message, conversationId };
        if (image) body.image = image;
        if (model) body.model = model;
        if (userApiKey) body.userApiKey = userApiKey;

        const res = await fetch(`${API_BASE}/ai/chat/stream`, {
            method: 'POST', headers, body: JSON.stringify(body), signal,
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = ''; // MUST persist across chunk reads

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.replace('\r', '');
                if (trimmed.startsWith('event: ')) {
                    currentEvent = trimmed.slice(7).trim();
                } else if (trimmed.startsWith('data: ') && currentEvent) {
                    try {
                        const data = JSON.parse(trimmed.slice(6));
                        if (currentEvent === 'text-delta') onTextDelta?.(data.text);
                        else if (currentEvent === 'tool-start') onToolStart?.(data);
                        else if (currentEvent === 'tool-result') onToolResult?.(data);
                        else if (currentEvent === 'done') onDone?.(data);
                        else if (currentEvent === 'error') onError?.(data);
                    } catch {}
                    currentEvent = '';
                } else if (trimmed === '') {
                    currentEvent = '';
                }
            }
        }
    }

    // === Market APIs ===
    getTokenPrice(tokens) { return this.post('/market/token/price', { tokens }); }
    searchToken(keyword, chains = '196') { return this.get(`/market/token/search?keyword=${encodeURIComponent(keyword)}&chains=${chains}`); }
    getTopTokens(chains = '196', sortBy = '2', timeFrame = '4') { return this.get(`/market/token/top?chains=${chains}&sortBy=${sortBy}&timeFrame=${timeFrame}`); }
    getTokenInfo(tokens) { return this.post('/market/token/info', { tokens }); }
    getTokenHolders(chainIndex, tokenContractAddress) { return this.get(`/market/token/holders?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}`); }
    getGasPrice(chainIndex = '196') { return this.get(`/market/gas?chainIndex=${chainIndex}`); }
    getCandles(chainIndex, tokenContractAddress, bar = '1H', limit = 24) { return this.get(`/market/candles?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}&bar=${bar}&limit=${limit}`); }
    getMarketTrades(chainIndex, tokenContractAddress) { return this.get(`/market/trades?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}`); }
    getSignals(chainIndex = '196', walletType, minAmountUsd) { return this.post('/market/signals', { chainIndex, walletType, minAmountUsd }); }
    getSignalChains() { return this.get('/market/signals/chains'); }

    // === Wallet APIs ===
    getWallets() { return this.get('/market/wallets'); }
    createWallet(name) { return this.post('/market/wallets/create', { name }); }
    importWallet(keys) { return this.post('/market/wallets/import', { keys }); }
    getWalletBalance(id) { return this.get(`/market/wallets/${id}/balance`); }
    deleteWallet(id) { return this.delete(`/market/wallets/${id}`); }
    setDefaultWallet(id) { return this.post(`/market/wallets/${id}/set-default`); }
    renameWallet(id, name) { return this.put(`/market/wallets/${id}/rename`, { name }); }
    exportWalletKey(id, pin) { return this.post(`/market/wallets/${id}/export-key`, { pin }); }
    updateWalletTags(id, tags) { return this.put(`/market/wallets/${id}/tags`, { tags }); }
    // PIN
    getPinStatus() { return this.get('/market/wallets/pin/status'); }
    setPin(newPin, currentPin) { return this.post('/market/wallets/pin/set', { newPin, currentPin }); }
    verifyPin(pin) { return this.post('/market/wallets/pin/verify', { pin }); }
    removePin(currentPin) { return this.post('/market/wallets/pin/remove', { currentPin }); }
    // Portfolio
    getPortfolioHistory(days = 30) { return this.get(`/market/wallets/portfolio-history?days=${days}`); }
    // Admin
    setUserWalletLimit(userId, limit) { return this.put(`/market/admin/users/${userId}/wallet-limit`, { limit }); }

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

    // === DCA APIs ===
    getDcaTasks() { return this.get('/user/dca'); }
    createDca(data) { return this.post('/user/dca', data); }
    updateDca(id, data) { return this.request(`/user/dca/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
    deleteDca(id) { return this.delete(`/user/dca/${encodeURIComponent(id)}`); }

    // === Extended Market APIs ===
    getHotTokens(chainIndex = '196') { return this.get(`/market/token/top?chains=${chainIndex}&sortBy=2&timeFrame=4`); }
    getMarketPrice(chainIndex, tokenAddr) { return this.post('/market/token/price', { tokens: [{ chainIndex, tokenContractAddress: tokenAddr }] }); }

    // === Portfolio APIs ===
    getPortfolio(chainIndex = '196', walletAddress) { return this.get(`/market/portfolio/overview?chainIndex=${chainIndex}${walletAddress ? '&walletAddress=' + walletAddress : ''}`); }
    getRecentPnl(chainIndex = '196', walletAddress) { return this.get(`/market/portfolio/pnl?chainIndex=${chainIndex}${walletAddress ? '&walletAddress=' + walletAddress : ''}`); }
    getDexHistory(chainIndex = '196', walletAddress) { return this.get(`/market/portfolio/dex-history?chainIndex=${chainIndex}${walletAddress ? '&walletAddress=' + walletAddress : ''}`); }

    // === Token Advanced APIs ===
    getTopTraders(chainIndex = '196', tokenContractAddress) { return this.get(`/market/token/top-traders?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}`); }
    getTopLiquidity(chainIndex = '196', tokenContractAddress) { return this.get(`/market/token/top-liquidity?chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}`); }

    // === Memepump APIs ===
    getMemepumpList(chainIndex = '196', stage = '1') { return this.get(`/market/memepump/list?chainIndex=${chainIndex}&stage=${stage}`); }

    // === Swap Execute ===
    executeSwap(data) { return this.post('/market/swap/execute', data); }
    batchSwap(data) { return this.post('/market/swap/batch', data); }

    // === Transfer ===
    executeTransfer(data) { return this.post('/market/transfer/execute', data); }
    batchTransfer(data) { return this.post('/market/transfer/batch', data); }

    // === Social Hub APIs ===
    getMyProfile() { return this.get('/social/profile'); }
    getUserProfile(userId) { return this.get(`/social/profile/${userId}`); }
    updateProfile(data) { return this.put('/social/profile', data); }
    getPosts(tab = 'newest', limit = 20, offset = 0, community = '') { return this.get(`/social/posts?tab=${tab}&limit=${limit}&offset=${offset}${community ? '&community=' + community : ''}`); }
    createPost(data) { return this.post('/social/posts', data); }
    deletePost(id) { return this.delete(`/social/posts/${id}`); }
    toggleLike(postId) { return this.post(`/social/posts/${postId}/like`); }
    getComments(postId) { return this.get(`/social/posts/${postId}/comments`); }
    addComment(postId, data) { return this.post(`/social/posts/${postId}/comments`, data); }
    toggleFollow(userId) { return this.post(`/social/follow/${userId}`); }
    getNotifications(limit = 30) { return this.get(`/social/notifications?limit=${limit}`); }
    markNotificationsRead() { return this.post('/social/notifications/read'); }
    getLeaderboard() { return this.get('/social/leaderboard'); }
    recordTip(data) { return this.post('/social/tips', data); }
    getConversations() { return this.get('/social/messages/conversations'); }
    getMessages(userId, limit = 50) { return this.get(`/social/messages/${userId}?limit=${limit}`); }
    sendMessage(userId, data) { return this.post(`/social/messages/${userId}`, data); }
    getUnreadDMs() { return this.get('/social/messages/unread'); }
    getPost(id) { return this.get(`/social/posts/${id}`); }
}

const api = new ApiClient();
export default api;
