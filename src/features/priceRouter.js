/**
 * #14 CEX-DEX Price Bridge — Smart routing between centralized and decentralized exchanges
 * Features: multi-venue price comparison, fee calculation, best route recommendation
 */
'use strict';

const log = { info: (...a) => console.log('[PriceRouter]', ...a) };

// ─── Price Comparison ───
async function comparePrices(token, amount, options = {}) {
  const { cexPriceFn, dexQuoteFn, chains = [196, 1, 56] } = options;
  const results = [];

  // CEX price
  if (cexPriceFn) {
    try {
      const cexData = await cexPriceFn(token, amount);
      results.push({
        venue: 'OKX CEX',
        type: 'cex',
        price: cexData.price,
        fee: cexData.fee || amount * 0.001,
        gas: 0,
        total: (cexData.price * amount) + (cexData.fee || amount * 0.001),
        perUnit: cexData.price
      });
    } catch (e) { log.info('CEX price unavailable:', e.message); }
  }

  // DEX prices on each chain
  if (dexQuoteFn) {
    for (const chainId of chains) {
      try {
        const dexData = await dexQuoteFn(token, amount, chainId);
        const chainNames = { 196: 'X Layer', 1: 'Ethereum', 56: 'BSC', 501: 'Solana', 137: 'Polygon' };
        results.push({
          venue: `${chainNames[chainId] || `Chain ${chainId}`} DEX`,
          type: 'dex',
          chainId,
          price: dexData.price,
          fee: dexData.fee || 0,
          gas: dexData.gasUsd || 0,
          total: (dexData.price * amount) + (dexData.fee || 0) + (dexData.gasUsd || 0),
          perUnit: dexData.price,
          priceImpact: dexData.priceImpact || 0
        });
      } catch (e) { /* chain not available */ }
    }
  }

  // Sort by total cost (ascending = cheapest first)
  results.sort((a, b) => a.total - b.total);

  const best = results[0];
  const savings = results.length > 1 ? results[results.length - 1].total - best.total : 0;

  return { routes: results, bestRoute: best, savings, token, amount };
}

// ─── Format Report ───
function formatPriceComparison(result, lang = 'en') {
  const isVi = lang === 'vi';
  const lines = [isVi ? `📊 <b>So sánh giá ${result.token}</b>` : `📊 <b>Price Comparison: ${result.token}</b>`, ''];

  for (let i = 0; i < result.routes.length; i++) {
    const r = result.routes[i];
    const badge = i === 0 ? ' ✅ BEST' : '';
    lines.push(`${i === 0 ? '🏆' : '•'} <b>${r.venue}</b>: $${r.perUnit.toFixed(4)}${badge}`);
    lines.push(`  Fee: $${r.fee.toFixed(4)} | Gas: $${r.gas.toFixed(4)} | Total: $${r.total.toFixed(4)}`);
  }

  if (result.savings > 0.001) {
    lines.push('');
    lines.push(`💰 ${isVi ? 'Tiết kiệm' : 'Savings'}: $${result.savings.toFixed(4)}`);
  }

  return lines.join('\n');
}

module.exports = {
  comparePrices,
  formatPriceComparison
};
