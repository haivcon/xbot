/**
 * #15 Emergency Panic Button — Sell ALL tokens to stablecoin in one command
 * Features: batch scan, honeypot filter, parallel sell, recovery report
 */
'use strict';

const log = { info: (...a) => console.log('[PanicSell]', ...a), warn: (...a) => console.warn('[PanicSell]', ...a) };

const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP'];
const NATIVE_TOKENS = ['ETH', 'BNB', 'OKB', 'MATIC', 'SOL', 'AVAX'];

// ─── Panic Sell Engine ───
async function executePanicSell(walletTokens, options = {}) {
  const {
    targetStable = 'USDT',
    keepNativeForGas = true,
    minValueUsd = 0.10,
    dryRun = false,
    swapFn = null,     // async (fromToken, toToken, amount) => { txHash, amountOut }
    honeypotCheckFn = null // async (tokenAddress) => boolean
  } = options;

  const results = { sold: [], failed: [], skipped: [], totalRecovered: 0, startTime: Date.now() };

  // Filter out stablecoins and native tokens (for gas)
  const tokensToSell = walletTokens.filter(token => {
    const sym = (token.symbol || '').toUpperCase();
    if (STABLECOINS.includes(sym)) { results.skipped.push({ ...token, reason: 'stablecoin' }); return false; }
    if (keepNativeForGas && NATIVE_TOKENS.includes(sym)) { results.skipped.push({ ...token, reason: 'native (gas)' }); return false; }
    if ((token.valueUsd || 0) < minValueUsd) { results.skipped.push({ ...token, reason: 'dust (<$0.10)' }); return false; }
    return true;
  });

  for (const token of tokensToSell) {
    try {
      // Honeypot check
      if (honeypotCheckFn && token.address) {
        const isHoneypot = await honeypotCheckFn(token.address);
        if (isHoneypot) {
          results.failed.push({ ...token, error: 'honeypot detected' });
          continue;
        }
      }

      if (dryRun) {
        results.sold.push({ ...token, txHash: 'DRY_RUN', amountOut: token.valueUsd || 0 });
        results.totalRecovered += (token.valueUsd || 0);
        continue;
      }

      // Execute swap
      if (swapFn) {
        const result = await swapFn(token.symbol, targetStable, token.balance || token.amount);
        results.sold.push({ ...token, txHash: result.txHash, amountOut: result.amountOut || 0 });
        results.totalRecovered += (result.amountOut || 0);
      }
    } catch (err) {
      results.failed.push({ ...token, error: err.message });
    }
  }

  results.duration = Date.now() - results.startTime;
  return results;
}

// ─── Format Report ───
function formatPanicReport(results, lang = 'en') {
  const isVi = lang === 'vi';
  const lines = [isVi ? '🚨 <b>CHẾ ĐỘ KHẨN CẤP — BÁO CÁO</b>' : '🚨 <b>EMERGENCY MODE — REPORT</b>', ''];

  for (const t of results.sold) {
    lines.push(`✅ ${t.balance || ''} $${t.symbol} → ${(t.amountOut || 0).toFixed(2)} USDT`);
  }
  for (const t of results.failed) {
    lines.push(`❌ $${t.symbol} — ${t.error}`);
  }
  for (const t of results.skipped) {
    lines.push(`⏭️ $${t.symbol} — ${t.reason}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push(`💰 ${isVi ? 'Tổng thu hồi' : 'Total recovered'}: <b>${results.totalRecovered.toFixed(2)} USDT</b>`);
  lines.push(`⏱️ ${isVi ? 'Thời gian' : 'Duration'}: ${(results.duration / 1000).toFixed(1)}s`);

  return lines.join('\n');
}

module.exports = {
  executePanicSell,
  formatPanicReport,
  STABLECOINS,
  NATIVE_TOKENS
};
