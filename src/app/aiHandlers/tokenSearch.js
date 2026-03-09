/**
 * Token Search Cache & Helpers
 * Extracted from aiHandlers.js — used by check_token_price tool and token search callbacks.
 */
const { t: _t } = require('../../core/i18n');

// ═══════════════════════════════════════════════════════
// Token Search Cache
// ═══════════════════════════════════════════════════════
const _tokenSearchCache = new Map();
const TKS_PAGE_SIZE = 5;

// Active TTL cleanup for token search cache (every 2 min, remove entries > 10 min)
const _tksCleanupInterval = setInterval(() => {
    const cutoff = Date.now() - 600000;
    for (const [k, v] of _tokenSearchCache.entries()) {
        if ((v.timestamp || 0) < cutoff) _tokenSearchCache.delete(k);
    }
}, 120000);
if (typeof _tksCleanupInterval.unref === 'function') _tksCleanupInterval.unref();

// ═══════════════════════════════════════════════════════
// Price Card Builder
// ═══════════════════════════════════════════════════════
async function _buildPriceCard(onchainos, chainIndex, tokenAddress, tokenSymbol, tokenFullName, chainNames, t, lang) {
    const tf = t || _t;
    const l = lang || 'en';
    const [priceInfo, candleData] = await Promise.all([
        onchainos.getTokenPriceInfo([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => null),
        onchainos.getMarketCandles(chainIndex, tokenAddress, { bar: '1D', limit: 7 }).catch(() => null)
    ]);
    const info = priceInfo && Array.isArray(priceInfo) && priceInfo.length > 0 ? priceInfo[0] : null;
    const price = Number(info?.price || 0);
    const change24h = Number(info?.priceChange24H || 0);
    const marketCap = Number(info?.marketCap || 0);
    const volume24h = Number(info?.volume24H || 0);
    const liquidity = Number(info?.liquidity || 0);
    const priceStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(4) : price.toFixed(2);
    const changeIcon = change24h >= 0 ? '📈' : '📉';
    const changeStr = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
    const addrShort = tokenAddress ? `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}` : '';
    let card = `💰 <b>${tokenSymbol}</b> (${tokenFullName})\n`;
    card += `━━━━━━━━━━━━━━━━━━\n`;
    card += `💵 ${tf(l, 'ai_price_label')}: <b>$${priceStr}</b>\n`;
    card += `${changeIcon} 24h: <b>${changeStr}</b>\n`;
    if (marketCap > 0) card += `📊 MCap: $${marketCap > 1e9 ? (marketCap / 1e9).toFixed(2) + 'B' : (marketCap / 1e6).toFixed(2) + 'M'}\n`;
    if (volume24h > 0) card += `📈 Vol: $${volume24h > 1e9 ? (volume24h / 1e9).toFixed(2) + 'B' : (volume24h / 1e6).toFixed(2) + 'M'}\n`;
    if (liquidity > 0) card += `💧 Liq: $${liquidity > 1e6 ? (liquidity / 1e6).toFixed(2) + 'M' : liquidity.toFixed(0)}\n`;
    // Mini chart sparkline (7D)
    const sparkline = _buildSparkline(candleData);
    if (sparkline) card += `📉 ${tf(l, 'ai_chart_7d')}: <code>${sparkline}</code>\n`;
    const chainSlugs = { '1': 'eth', '56': 'bsc', '196': 'xlayer', '137': 'polygon', '501': 'solana', '42161': 'arbitrum', '8453': 'base', '43114': 'avalanche', '10': 'optimism' };
    const slug = chainSlugs[chainIndex] || 'xlayer';
    card += `🔗 ${chainNames[chainIndex] || 'Chain ' + chainIndex}`;
    if (tokenAddress && tokenAddress !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        const explorerUrl = `https://www.okx.com/web3/explorer/${slug}/token/${tokenAddress}`;
        card += ` · <a href="${explorerUrl}">${addrShort}</a>`;
    }
    return card;
}

// ═══════════════════════════════════════════════════════
// Sparkline & Technical Analysis Helpers
// ═══════════════════════════════════════════════════════
function _buildSparkline(candleData) {
    if (!candleData || !Array.isArray(candleData) || candleData.length < 2) return null;
    const blocks = '▁▂▃▄▅▆▇█';
    const closes = candleData.map(c => Number(Array.isArray(c) ? c[4] : c.close || c.c || 0)).filter(v => v > 0);
    if (closes.length < 2) return null;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    return closes.map(v => blocks[Math.min(7, Math.floor(((v - min) / range) * 7))]).join('');
}

function _calculateRSI(closes, period = 14) {
    if (!closes || closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function _calculateMA(closes, period) {
    if (!closes || closes.length < period) return null;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function _extractCandelCloses(candleData) {
    if (!candleData || !Array.isArray(candleData)) return [];
    return candleData.map(c => Number(Array.isArray(c) ? c[4] : c.close || c.c || 0)).filter(v => v > 0);
}

// ═══════════════════════════════════════════════════════
// Token List Page & Keyboard Builders
// ═══════════════════════════════════════════════════════
function _buildTokenListPage(results, keyword, page, chainNames, t, lang) {
    const tf = t || _t;
    const l = lang || 'en';
    const totalPages = Math.ceil(results.length / TKS_PAGE_SIZE);
    const start = page * TKS_PAGE_SIZE;
    const pageItems = results.slice(start, start + TKS_PAGE_SIZE);
    let text = `🔍 <b>${tf(l, 'ai_token_search_title', { count: results.length, keyword: keyword.toUpperCase() })}</b> (${page + 1}/${totalPages})\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    pageItems.forEach((tk, i) => {
        const idx = start + i + 1;
        const price = Number(tk.price || 0);
        const priceStr = price < 0.0001 ? '$' + price.toFixed(10) : price < 0.01 ? '$' + price.toFixed(8) : price < 1 ? '$' + price.toFixed(4) : '$' + price.toFixed(2);
        const chain = chainNames[tk.chainIndex] || tk.chainIndex || '?';
        const addr = tk.tokenContractAddress ? `${tk.tokenContractAddress.slice(0, 6)}...${tk.tokenContractAddress.slice(-4)}` : '';
        const vol = tk.volume24H ? ` · Vol: $${Number(tk.volume24H) > 1e6 ? (Number(tk.volume24H) / 1e6).toFixed(1) + 'M' : Number(tk.volume24H).toFixed(0)}` : '';
        text += `\n<b>${idx}.</b> ${tk.tokenSymbol || '?'} (${tk.tokenFullName || ''})\n`;
        text += `   🔗 ${chain} · ${priceStr}${vol}\n`;
        text += `   📍 <code>${addr}</code>\n`;
    });
    text += `\n💡 <i>${tf(l, 'ai_token_search_hint')}</i>`;
    return text;
}

function _buildTokenListKeyboard(results, cacheKey, page, t, lang) {
    const tf = t || _t;
    const l = lang || 'en';
    const totalPages = Math.ceil(results.length / TKS_PAGE_SIZE);
    const start = page * TKS_PAGE_SIZE;
    const pageItems = results.slice(start, start + TKS_PAGE_SIZE);
    const keyboard = [];
    // Token selection buttons (2 per row)
    const row = [];
    pageItems.forEach((tk, i) => {
        const idx = start + i;
        const label = `${idx + 1}. ${tk.tokenSymbol || '?'}`;
        row.push({ text: label, callback_data: `tks|s|${cacheKey}|${idx}` });
        if (row.length === 2 || i === pageItems.length - 1) {
            keyboard.push([...row]);
            row.length = 0;
        }
    });
    // Action buttons for first result on page (quick actions)
    const firstIdx = start;
    const actionRow = [
        { text: tf(l, 'ai_token_btn_swap') || '💱 Swap', callback_data: `tks|swap|${cacheKey}|${firstIdx}` },
        { text: tf(l, 'ai_token_btn_chart') || '📊 Chart', callback_data: `tks|chart|${cacheKey}|${firstIdx}` },
        { text: tf(l, 'ai_token_btn_security') || '🔒 Security', callback_data: `tks|sec|${cacheKey}|${firstIdx}` },
    ];
    keyboard.push(actionRow);
    // Pagination row
    const navRow = [];
    if (page > 0) navRow.push({ text: tf(l, 'ai_token_search_prev'), callback_data: `tks|p|${cacheKey}|${page - 1}` });
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'tks|noop' });
    if (page < totalPages - 1) navRow.push({ text: tf(l, 'ai_token_search_next'), callback_data: `tks|p|${cacheKey}|${page + 1}` });
    keyboard.push(navRow);
    keyboard.push([{ text: tf(l, 'ai_token_search_close'), callback_data: 'tks|close' }]);
    return keyboard;
}

module.exports = {
    _tokenSearchCache,
    TKS_PAGE_SIZE,
    _buildPriceCard,
    _buildSparkline,
    _calculateRSI,
    _calculateMA,
    _extractCandelCloses,
    _buildTokenListPage,
    _buildTokenListKeyboard
};
