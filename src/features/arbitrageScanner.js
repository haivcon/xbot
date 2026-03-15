/**
 * Cross-Chain Arbitrage Scanner — Idea #9
 * Scans price differences across chains for the same token
 */
// W8 NOTE: MULTI_CHAIN_TOKENS addresses are static snapshots.
// Production should use a token registry or API to resolve addresses dynamically.
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('Arbitrage');

const CHAIN_MAP = {
    '1': { name: 'Ethereum', symbol: 'ETH', native: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    '56': { name: 'BSC', symbol: 'BNB', native: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    '196': { name: 'X Layer', symbol: 'OKB', native: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    '137': { name: 'Polygon', symbol: 'MATIC', native: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    '42161': { name: 'Arbitrum', symbol: 'ETH', native: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    '8453': { name: 'Base', symbol: 'ETH', native: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }
};

// Common tokens with addresses on multiple chains
const MULTI_CHAIN_TOKENS = {
    'ETH': {
        '1': '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        '42161': '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        '8453': '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        '56': '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // WETH on BSC
        '137': '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' // WETH on Polygon
    },
    'USDT': {
        '1': '0xdac17f958d2ee523a2206206994597c13d831ec7',
        '56': '0x55d398326f99059ff775485246999027b3197955',
        '196': '0x1e4a5963abfd975d8c9021ce480b42188849d41d',
        '137': '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        '42161': '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'
    },
    'USDC': {
        '1': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        '56': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
        '137': '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
        '42161': '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        '8453': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    },
    'WBTC': {
        '1': '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        '56': '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
        '137': '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
        '42161': '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'
    }
};

/**
 * Scan for arbitrage opportunities across chains
 */
async function scanArbitrage(tokenSymbol, chains, context) {
    const lang = context?.lang || 'en';
    const symbol = tokenSymbol.toUpperCase();
    const targetChains = chains ? chains.split(',').map(c => c.trim()) : Object.keys(CHAIN_MAP);

    // Get token addresses for each chain
    const tokenAddresses = MULTI_CHAIN_TOKENS[symbol];
    if (!tokenAddresses) {
        // Try to search for the token on each chain
        const searchResults = {};
        const searchPromises = targetChains.map(async (chainId) => {
            try {
                const results = await onchainos.getTokenSearch(chainId, symbol);
                if (results && results.length > 0) {
                    searchResults[chainId] = results[0].tokenContractAddress;
                }
            } catch (e) { /* skip chain */ }
        });
        await Promise.allSettled(searchPromises);

        if (Object.keys(searchResults).length < 2) {
            return {
                displayMessage: lang === 'vi'
                    ? `❌ Token <code>${symbol}</code> không tìm thấy trên đủ chains để so sánh.`
                    : `❌ Token <code>${symbol}</code> not found on enough chains for comparison.`
            };
        }

        return await _compareAndFormat(searchResults, symbol, lang);
    }

    // Filter to only requested chains that have this token
    const relevantChains = {};
    for (const chainId of targetChains) {
        if (tokenAddresses[chainId]) {
            relevantChains[chainId] = tokenAddresses[chainId];
        }
    }

    if (Object.keys(relevantChains).length < 2) {
        return {
            displayMessage: lang === 'vi'
                ? `❌ <code>${symbol}</code> chỉ có trên 1 chain trong danh sách.`
                : `❌ <code>${symbol}</code> is only available on 1 chain in the selected list.`
        };
    }

    return await _compareAndFormat(relevantChains, symbol, lang);
}

/**
 * Compare prices across chains and format output
 */
async function _compareAndFormat(chainAddresses, symbol, lang) {
    // Fetch prices in parallel — use getTokenPriceInfo (guaranteed to exist)
    const pricePromises = Object.entries(chainAddresses).map(async ([chainId, addr]) => {
        try {
            const priceFn = typeof onchainos.getMarketPrice === 'function'
                ? onchainos.getMarketPrice
                : onchainos.getTokenPriceInfo;
            const data = await priceFn([{ chainIndex: chainId, tokenContractAddress: addr }]);
            const price = data && data[0] ? Number(data[0].price || 0) : 0;
            return { chainId, address: addr, price };
        } catch (e) {
            return { chainId, address: addr, price: 0 };
        }
    });

    const prices = (await Promise.allSettled(pricePromises))
        .filter(r => r.status === 'fulfilled' && r.value.price > 0)
        .map(r => r.value);

    if (prices.length < 2) {
        return { displayMessage: lang === 'vi' ? '❌ Không đủ dữ liệu giá.' : '❌ Not enough price data.' };
    }

    // Fetch gas prices in parallel
    const gasPromises = prices.map(async (p) => {
        try {
            const gas = await onchainos.getGasPrice(p.chainId);
            const gasUsd = gas && gas[0] ? Number(gas[0].gasUsd || gas[0].maxFee || 0) : 0;
            return { ...p, gasUsd };
        } catch (e) {
            return { ...p, gasUsd: 0 };
        }
    });

    const results = (await Promise.allSettled(gasPromises)).map(r => r.status === 'fulfilled' ? r.value : { ...prices[0], gasUsd: 0 });

    // Sort by price (lowest first)
    results.sort((a, b) => a.price - b.price);

    const cheapest = results[0];
    const expensive = results[results.length - 1];
    const spread = ((expensive.price - cheapest.price) / cheapest.price) * 100;
    const grossProfit = expensive.price - cheapest.price;
    const estimatedGas = cheapest.gasUsd + expensive.gasUsd;
    const netProfit = grossProfit - estimatedGas;
    const profitable = netProfit > 0;

    // Format output
    const headers = { en: 'CROSS-CHAIN ARBITRAGE SCAN', vi: 'QUÉT CHÊNH LỆCH GIÁ XUYÊN CHUỖI' };
    const profitIcon = profitable ? '💰' : '⚠️';
    const profitL = { en: profitable ? 'PROFIT OPPORTUNITY' : 'NO PROFIT (gas > spread)', vi: profitable ? 'CƠ HỘI LỜI' : 'KHÔNG LỜI (gas > chênh lệch)' };

    let card = `🔄 <b>${headers[lang] || headers.en}: ${symbol}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

    for (const r of results) {
        const chain = CHAIN_MAP[r.chainId] || { name: `Chain #${r.chainId}` };
        const isMin = r.chainId === cheapest.chainId;
        const isMax = r.chainId === expensive.chainId;
        const tag = isMin ? ' 🟢 BUY' : isMax ? ' 🔴 SELL' : '';
        const pStr = r.price < 0.01 ? r.price.toFixed(8) : r.price.toFixed(4);
        card += `⛓ <b>${chain.name}</b>${tag}\n`;
        card += `   💲 Price: <code>$${pStr}</code>\n`;
        card += `   ⛽ Gas: ~$${r.gasUsd.toFixed(4)}\n\n`;
    }

    card += `━━━━━━━━━━━━━━━━━━\n`;
    card += `📊 <b>Spread:</b> <code>${spread.toFixed(4)}%</code>\n`;
    card += `💲 <b>Gross:</b> <code>$${grossProfit.toFixed(6)}/token</code>\n`;
    card += `⛽ <b>Est. Gas:</b> <code>$${estimatedGas.toFixed(4)}</code>\n`;
    card += `${profitIcon} <b>${profitL[lang] || profitL.en}</b>`;
    if (profitable) {
        card += `\n💰 <b>Net:</b> <code>$${netProfit.toFixed(6)}/token</code>`;
    }
    // W9 fix: Add bridge cost disclaimer
    const bridgeWarning = {
        en: '\n\n⚠️ <i>Note: Bridge fees not included. Actual profit may be lower.</i>',
        vi: '\n\n⚠️ <i>Lưu ý: Chưa tính phí bridge. Lợi nhuận thực tế có thể thấp hơn.</i>'
    };
    card += bridgeWarning[lang] || bridgeWarning.en;

    return { displayMessage: card, data: { results, spread, grossProfit, netProfit, profitable } };
}

module.exports = { scanArbitrage, MULTI_CHAIN_TOKENS, CHAIN_MAP };
