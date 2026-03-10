/**
 * Web Chat Tool Executor
 * Provides additional tool declarations + implementations for the web chat
 * that mirror Telegram bot capabilities. These tools do NOT depend on
 * Telegram's bot / msg objects and work purely with DB + OnchainOS API.
 *
 * File: src/server/webToolExecutor.js
 */

const logger = require('../core/logger');
const log = logger.child('WebTools');
const { _buildSparkline, _calculateRSI, _calculateMA, _extractCandelCloses } = require('../app/aiHandlers/tokenSearch');

// ═══════════════════════════════════════════════════════════
//  Shared helpers
// ═══════════════════════════════════════════════════════════
const KNOWN_TOKENS = {
    'BTC':    { chainIndex: '1',   address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', fullName: 'Bitcoin' },
    'ETH':    { chainIndex: '1',   address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fullName: 'Ethereum' },
    'USDT':   { chainIndex: '1',   address: '0xdac17f958d2ee523a2206206994597c13d831ec7', fullName: 'Tether' },
    'BNB':    { chainIndex: '56',  address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fullName: 'BNB' },
    'SOL':    { chainIndex: '501', address: '11111111111111111111111111111111',            fullName: 'Solana' },
    'OKB':    { chainIndex: '196', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fullName: 'OKB' },
    'BANMAO': { chainIndex: '196', address: '0x9bA84834c10d07372e33D4C105F08C984b03a5e0', fullName: '$BANMAO' },
};
const CHAIN_NAMES = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base', '43114': 'Avalanche' };
const KNOWN_CHAIN = { 'BTC': '1', 'ETH': '1', 'USDT': '1', 'BNB': '56', 'SOL': '501', 'OKB': '196' };

async function resolveToken(onchainos, symbolStr, explicitChain) {
    const upper = symbolStr.toUpperCase();
    const known = KNOWN_TOKENS[upper];
    if (known) return { symbol: upper, chainIndex: known.chainIndex, address: known.address, fullName: known.fullName };
    const sr = await onchainos.getTokenSearch(explicitChain || '196,1,56,501', symbolStr).catch(() => []);
    if (sr && sr.length > 0) return { symbol: sr[0].tokenSymbol, chainIndex: sr[0].chainIndex, address: sr[0].tokenContractAddress, fullName: sr[0].tokenFullName || upper };
    return null;
}

function fmtPrice(p) { return p < 0.0001 ? p.toFixed(10) : p < 0.01 ? p.toFixed(8) : p < 1 ? p.toFixed(4) : p.toFixed(2); }
function fmtCap(v) { return v > 1e9 ? (v / 1e9).toFixed(2) + 'B' : v > 1e6 ? (v / 1e6).toFixed(2) + 'M' : '$' + v.toFixed(0); }
function fmtChange(c) { return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`; }

// ═══════════════════════════════════════════════════════════
//  Web Tool Declarations (Gemini function calling schema)
// ═══════════════════════════════════════════════════════════
const WEB_TOOL_DECLARATIONS = [
    // ── Token Analysis ──
    {
        name: 'analyze_token',
        description: 'Deep analysis of a token with technical indicators (RSI, MA, whale trades). Use when user says "analyze", "should I buy", "technical analysis", "forecast", "phân tích".',
        parameters: { type: 'OBJECT', properties: {
            symbol: { type: 'STRING', description: 'Token symbol (e.g. "OKB", "ETH")' },
            chain: { type: 'STRING', description: 'Optional chain filter (e.g. "196" for X Layer)' }
        }, required: ['symbol'] }
    },
    {
        name: 'compare_tokens',
        description: 'Compare 2-4 cryptocurrency tokens side by side. Use when user says "compare", "vs", "so sánh".',
        parameters: { type: 'OBJECT', properties: {
            symbols: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Array of 2-4 token symbols to compare' }
        }, required: ['symbols'] }
    },
    // ── Wallet Lookup ──
    {
        name: 'check_wallet_balance_direct',
        description: 'Look up any wallet address balance and holdings directly. Use when user pastes a wallet 0x address.',
        parameters: { type: 'OBJECT', properties: {
            address: { type: 'STRING', description: 'The wallet address to look up (0x... format)' }
        }, required: ['address'] }
    },
    // ── Contract & Tx Lookup ──
    {
        name: 'lookup_contract',
        description: 'Look up smart contract information by address.',
        parameters: { type: 'OBJECT', properties: {
            address: { type: 'STRING', description: 'Contract address to look up' }
        }, required: ['address'] }
    },
    {
        name: 'lookup_transaction',
        description: 'Look up transaction details by hash.',
        parameters: { type: 'OBJECT', properties: {
            txhash: { type: 'STRING', description: 'Transaction hash to look up' }
        }, required: ['txhash'] }
    },
    // ── Price Alerts ──
    {
        name: 'set_price_alert',
        description: 'Set a price alert for a token. Bot will notify when price crosses target. Use when user says "alert when", "notify me if", "set alert", "đặt cảnh báo".',
        parameters: { type: 'OBJECT', properties: {
            symbol: { type: 'STRING', description: 'Token symbol (e.g. "OKB", "ETH")' },
            target_price: { type: 'NUMBER', description: 'Target price in USD' },
            direction: { type: 'STRING', description: '"above" or "below"' }
        }, required: ['symbol', 'target_price'] }
    },
    {
        name: 'list_price_alerts',
        description: 'Show all active price alerts.',
        parameters: { type: 'OBJECT', properties: {}, required: [] }
    },
    {
        name: 'delete_price_alert',
        description: 'Delete a price alert by ID.',
        parameters: { type: 'OBJECT', properties: {
            alert_id: { type: 'NUMBER', description: 'Alert ID to delete' }
        }, required: ['alert_id'] }
    },
    // ── Favorite Tokens ──
    {
        name: 'add_favorite_token',
        description: 'Add a token to favorites. Use when user says "save", "favorite", "bookmark", "yêu thích", "lưu".',
        parameters: { type: 'OBJECT', properties: {
            symbol: { type: 'STRING', description: 'Token symbol (e.g. "OKB")' }
        }, required: ['symbol'] }
    },
    {
        name: 'remove_favorite_token',
        description: 'Remove a token from favorites.',
        parameters: { type: 'OBJECT', properties: {
            symbol: { type: 'STRING', description: 'Token symbol to remove' }
        }, required: ['symbol'] }
    },
    {
        name: 'check_favorite_prices',
        description: 'Check prices of all favorite tokens at once. Use when user says "my tokens", "favorites", "yêu thích".',
        parameters: { type: 'OBJECT', properties: {}, required: [] }
    },
    // ── Session ──
    {
        name: 'delete_chat_history',
        description: 'Clear this chat session. Use when user says "clear chat", "delete history", "xóa lịch sử".',
        parameters: { type: 'OBJECT', properties: {}, required: [] }
    },
];

// ═══════════════════════════════════════════════════════════
//  Web Tool Implementations
// ═══════════════════════════════════════════════════════════
const webToolImplementations = {

    // ── analyze_token ──────────────────────────────────────
    analyze_token: async ({ symbol, chain }, context) => {
        try {
            const onchainos = require('../app/services/onchainos');
            const resolved = await resolveToken(onchainos, symbol, chain);
            if (!resolved) return { success: false, error: `Token "${symbol}" not found.` };
            const { chainIndex, address, fullName } = resolved;
            const upper = resolved.symbol;

            const [candles1H, candles1D, trades, priceInfo] = await Promise.all([
                onchainos.getMarketCandles(chainIndex, address, { bar: '1H', limit: 168 }).catch(() => []),
                onchainos.getMarketCandles(chainIndex, address, { bar: '1D', limit: 30 }).catch(() => []),
                onchainos.getMarketTrades(chainIndex, address, { limit: 20 }).catch(() => []),
                onchainos.getTokenPriceInfo([{ chainIndex, tokenContractAddress: address }]).catch(() => [])
            ]);

            const info = priceInfo?.length > 0 ? priceInfo[0] : {};
            const price = Number(info.price || 0);
            const change24h = Number(info.priceChange24H || 0);
            const volume24h = Number(info.volume24H || 0);
            const marketCap = Number(info.marketCap || 0);

            const closes1H = _extractCandelCloses(candles1H);
            const closes1D = _extractCandelCloses(candles1D);
            const rsi14 = _calculateRSI(closes1H, 14);
            const ma7 = _calculateMA(closes1D, 7);
            const ma25 = _calculateMA(closes1D, 25);
            const sparkline = _buildSparkline(candles1D);

            let whaleBuys = 0, whaleSells = 0, whaleCount = 0;
            if (Array.isArray(trades)) {
                trades.forEach(tr => {
                    const val = Number(tr.tradeValue || tr.amount || 0);
                    const side = tr.side || tr.type || '';
                    if (val > 1000) { whaleCount++; if (side === 'buy' || side === '1') whaleBuys++; else whaleSells++; }
                });
            }

            return {
                success: true,
                analysis: {
                    symbol: upper, fullName,
                    chain: CHAIN_NAMES[chainIndex] || chainIndex,
                    price: `$${fmtPrice(price)}`,
                    change24h: fmtChange(change24h),
                    volume24h: volume24h > 0 ? `$${fmtCap(volume24h)}` : null,
                    marketCap: marketCap > 0 ? `$${fmtCap(marketCap)}` : null,
                    sparkline30D: sparkline || null,
                    rsi14: rsi14 !== null ? Number(rsi14.toFixed(1)) : null,
                    rsiSignal: rsi14 > 70 ? 'overbought' : rsi14 < 30 ? 'oversold' : rsi14 < 45 ? 'accumulation' : 'neutral',
                    ma7: ma7 !== null ? Number(ma7.toFixed(8)) : null,
                    ma25: ma25 !== null ? Number(ma25.toFixed(8)) : null,
                    maSignal: ma7 && ma25 ? (ma7 > ma25 ? 'bullish (Golden Cross)' : 'bearish (Death Cross)') : 'unknown',
                    whaleTrades: { total: whaleCount, buys: whaleBuys, sells: whaleSells }
                },
                displayMessage: `Analysis for ${upper}: Price $${fmtPrice(price)}, RSI=${rsi14?.toFixed(1) ?? '—'}, MA7/25 ${ma7 > ma25 ? 'bullish' : 'bearish'}, ${whaleCount} whale trades. Please provide your AI analysis verdict.`
            };
        } catch (err) { return { success: false, error: `Analyze failed: ${err.message}` }; }
    },

    // ── compare_tokens ─────────────────────────────────────
    compare_tokens: async ({ symbols }, context) => {
        try {
            const onchainos = require('../app/services/onchainos');
            if (!symbols || !Array.isArray(symbols) || symbols.length < 2) return { success: false, error: 'Need at least 2 token symbols.' };
            const toCompare = symbols.slice(0, 4).map(s => s.trim().toUpperCase());

            const resolved = await Promise.all(toCompare.map(sym => resolveToken(onchainos, sym)));
            const valid = resolved.filter(Boolean);
            if (valid.length < 2) return { success: false, error: 'Could not find enough tokens to compare.' };

            const data = await Promise.all(valid.map(async v => {
                const [priceInfo, candles] = await Promise.all([
                    onchainos.getTokenPriceInfo([{ chainIndex: v.chainIndex, tokenContractAddress: v.address }]).catch(() => null),
                    onchainos.getMarketCandles(v.chainIndex, v.address, { bar: '1D', limit: 7 }).catch(() => null)
                ]);
                const info = priceInfo && Array.isArray(priceInfo) && priceInfo.length > 0 ? priceInfo[0] : {};
                return {
                    symbol: v.symbol, fullName: v.fullName,
                    chain: CHAIN_NAMES[v.chainIndex] || v.chainIndex,
                    price: Number(info.price || 0),
                    change24h: Number(info.priceChange24H || 0),
                    marketCap: Number(info.marketCap || 0),
                    sparkline: _buildSparkline(candles)
                };
            }));

            return {
                success: true,
                comparison: data.map(d => ({
                    symbol: d.symbol, fullName: d.fullName, chain: d.chain,
                    price: `$${fmtPrice(d.price)}`,
                    change24h: fmtChange(d.change24h),
                    marketCap: d.marketCap > 0 ? `$${fmtCap(d.marketCap)}` : null,
                    sparkline7D: d.sparkline || null
                })),
                displayMessage: `Compared ${valid.map(v => v.symbol).join(' vs ')}.`
            };
        } catch (err) { return { success: false, error: `Compare failed: ${err.message}` }; }
    },

    // ── check_wallet_balance_direct ────────────────────────
    check_wallet_balance_direct: async ({ address }, context) => {
        try {
            const onchainos = require('../app/services/onchainos');
            const balances = await onchainos.getAllTokenBalances(address, '196,1,56,501').catch(() => null);
            if (!balances || !balances.tokenAssets || balances.tokenAssets.length === 0) {
                return { success: true, displayMessage: `Wallet ${address.slice(0, 8)}...${address.slice(-4)}: No tokens found or empty wallet.` };
            }
            const tokens = balances.tokenAssets
                .filter(t => Number(t.balance || 0) > 0)
                .sort((a, b) => Number(b.tokenPrice || 0) * Number(b.balance || 0) - Number(a.tokenPrice || 0) * Number(a.balance || 0))
                .slice(0, 20);
            const total = tokens.reduce((s, t) => s + Number(t.tokenPrice || 0) * Number(t.balance || 0), 0);
            return {
                success: true,
                wallet: {
                    address: address,
                    totalValueUSD: `$${total.toFixed(2)}`,
                    tokenCount: tokens.length,
                    holdings: tokens.map(t => ({
                        symbol: t.symbol, chain: CHAIN_NAMES[t.chainIndex] || t.chainIndex,
                        balance: t.balance,
                        valueUSD: `$${(Number(t.tokenPrice || 0) * Number(t.balance || 0)).toFixed(2)}`
                    }))
                }
            };
        } catch (err) { return { success: false, error: `Wallet lookup failed: ${err.message}` }; }
    },

    // ── lookup_contract ────────────────────────────────────
    lookup_contract: async ({ address }, context) => {
        try {
            const onchainos = require('../app/services/onchainos');
            const info = await onchainos.getTokenInfo('196', address).catch(() => null);
            if (!info) return { success: false, error: `Contract ${address} not found.` };
            return { success: true, contract: info };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── lookup_transaction ─────────────────────────────────
    lookup_transaction: async ({ txhash }, context) => {
        try {
            const onchainos = require('../app/services/onchainos');
            const info = await onchainos.getTransactionDetails?.('196', txhash).catch(() => null);
            if (!info) return { success: true, displayMessage: `Transaction ${txhash.slice(0, 10)}... — use a block explorer for full details: https://www.okx.com/web3/explorer/xlayer/tx/${txhash}` };
            return { success: true, transaction: info };
        } catch (err) { return { success: true, displayMessage: `View transaction: https://www.okx.com/web3/explorer/xlayer/tx/${txhash}` }; }
    },

    // ── set_price_alert ────────────────────────────────────
    set_price_alert: async ({ symbol, target_price, direction = 'above' }, context) => {
        try {
            const { dbRun, dbAll } = require('../../db/core');
            const onchainos = require('../app/services/onchainos');
            const userId = context.userId;
            const existing = await dbAll('SELECT id FROM user_price_alerts WHERE userId = ? AND active = 1', [userId]);
            if (existing.length >= 5) return { success: false, error: 'Max 5 active alerts allowed.' };
            let chainIndex = KNOWN_CHAIN[symbol.toUpperCase()] || null;
            let tokenAddress = null;
            if (!chainIndex) {
                const sr = await onchainos.getTokenSearch('196,1,56,501', symbol).catch(() => []);
                if (sr?.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; }
            }
            const dir = direction === 'below' ? 'below' : 'above';
            await dbRun('INSERT INTO user_price_alerts (userId, chatId, symbol, chainIndex, tokenAddress, targetPrice, direction) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, userId, symbol.toUpperCase(), chainIndex, tokenAddress, target_price, dir]);
            return { success: true, displayMessage: `🔔 Alert set: ${symbol.toUpperCase()} ${dir} $${target_price}` };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── list_price_alerts ──────────────────────────────────
    list_price_alerts: async ({}, context) => {
        try {
            const { dbAll } = require('../../db/core');
            const userId = context.userId;
            const alerts = await dbAll('SELECT * FROM user_price_alerts WHERE userId = ? AND active = 1 ORDER BY createdAt DESC', [userId]);
            if (!alerts.length) return { success: true, displayMessage: 'No active price alerts.' };
            return {
                success: true,
                alerts: alerts.map(a => ({ id: a.id, symbol: a.symbol, direction: a.direction, targetPrice: a.targetPrice })),
                displayMessage: `${alerts.length} active alerts: ${alerts.map(a => `#${a.id} ${a.symbol} ${a.direction} $${a.targetPrice}`).join(', ')}`
            };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── delete_price_alert ─────────────────────────────────
    delete_price_alert: async ({ alert_id }, context) => {
        try {
            const { dbRun, dbGet } = require('../../db/core');
            const userId = context.userId;
            const alert = await dbGet('SELECT * FROM user_price_alerts WHERE id = ? AND userId = ?', [alert_id, userId]);
            if (!alert) return { success: false, error: `Alert #${alert_id} not found.` };
            await dbRun('UPDATE user_price_alerts SET active = 0 WHERE id = ?', [alert_id]);
            return { success: true, displayMessage: `✅ Deleted alert #${alert_id} (${alert.symbol} ${alert.direction} $${alert.targetPrice})` };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── add_favorite_token ─────────────────────────────────
    add_favorite_token: async ({ symbol }, context) => {
        try {
            const { dbRun, dbAll } = require('../../db/core');
            const onchainos = require('../app/services/onchainos');
            const userId = context.userId;
            const existing = await dbAll('SELECT id FROM user_favorite_tokens WHERE userId = ?', [userId]);
            if (existing.length >= 10) return { success: false, error: 'Max 10 favorites.' };
            const resolved = await resolveToken(onchainos, symbol);
            if (!resolved) return { success: false, error: `Token "${symbol}" not found.` };
            await dbRun('INSERT OR REPLACE INTO user_favorite_tokens (userId, symbol, chainIndex, tokenAddress, fullName) VALUES (?, ?, ?, ?, ?)',
                [userId, resolved.symbol, resolved.chainIndex, resolved.address, resolved.fullName]);
            return { success: true, displayMessage: `⭐ Added ${resolved.symbol} to favorites.` };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── remove_favorite_token ──────────────────────────────
    remove_favorite_token: async ({ symbol }, context) => {
        try {
            const { dbRun } = require('../../db/core');
            await dbRun('DELETE FROM user_favorite_tokens WHERE userId = ? AND symbol = ?', [context.userId, symbol.toUpperCase()]);
            return { success: true, displayMessage: `Removed ${symbol.toUpperCase()} from favorites.` };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── check_favorite_prices ──────────────────────────────
    check_favorite_prices: async ({}, context) => {
        try {
            const { dbAll } = require('../../db/core');
            const onchainos = require('../app/services/onchainos');
            const userId = context.userId;
            const favorites = await dbAll('SELECT * FROM user_favorite_tokens WHERE userId = ? ORDER BY addedAt', [userId]);
            if (!favorites.length) return { success: true, displayMessage: 'No favorite tokens saved yet.' };
            const priceTokens = favorites.map(f => ({ chainIndex: f.chainIndex, tokenContractAddress: f.tokenAddress }));
            const prices = await onchainos.getTokenPriceInfo(priceTokens).catch(() => []);
            return {
                success: true,
                favorites: favorites.map((f, i) => {
                    const pi = prices?.[i] || {};
                    return {
                        symbol: f.symbol, chain: CHAIN_NAMES[f.chainIndex] || f.chainIndex,
                        price: `$${fmtPrice(Number(pi.price || 0))}`,
                        change24h: fmtChange(Number(pi.priceChange24H || 0))
                    };
                }),
                displayMessage: `${favorites.length} favorite tokens with current prices.`
            };
        } catch (err) { return { success: false, error: err.message }; }
    },

    // ── delete_chat_history ────────────────────────────────
    delete_chat_history: async ({}, context) => {
        // Handled by chatRoutes.js directly (clears session)
        return { success: true, action: 'clear_session', displayMessage: 'Chat history cleared. Starting fresh conversation.' };
    },
};

// ═══════════════════════════════════════════════════════════
//  Execute a web tool call
// ═══════════════════════════════════════════════════════════
async function executeWebToolCall(functionCall, context) {
    const fn = webToolImplementations[functionCall.name];
    if (!fn) return undefined; // Not a web tool — let onchain handler try
    log.info(`[WebTool] Executing: ${functionCall.name}(${JSON.stringify(functionCall.args || {}).substring(0, 200)})`);
    return fn(functionCall.args || {}, context);
}

module.exports = {
    WEB_TOOL_DECLARATIONS,
    executeWebToolCall,
};
