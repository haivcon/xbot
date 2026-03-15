/**
 * #23 Gas Fee Optimizer — Optimal gas timing and estimation
 * Features: gas price tracking, optimal timing, cost prediction, EIP-1559 support
 */
'use strict';

const log = { info: (...a) => console.log('[GasOptimizer]', ...a) };

class GasTracker {
  constructor() {
    this.history = []; // [{ chainId, gasPrice, baseFee, timestamp }]
    this.maxHistory = 1440; // 24h of per-minute data
  }

  record(chainId, gasData) {
    this.history.push({ chainId, ...gasData, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history = this.history.slice(-this.maxHistory);
  }

  getAverage(chainId, hours = 1) {
    const cutoff = Date.now() - (hours * 3600000);
    const relevant = this.history.filter(h => h.chainId === chainId && h.timestamp > cutoff);
    if (!relevant.length) return null;
    const avgGas = relevant.reduce((sum, h) => sum + (h.gasPrice || 0), 0) / relevant.length;
    return { avgGwei: Math.round(avgGas * 100) / 100, samples: relevant.length };
  }

  isLowGasNow(chainId) {
    const avg24h = this.getAverage(chainId, 24);
    const current = this.history.filter(h => h.chainId === chainId).slice(-1)[0];
    if (!avg24h || !current) return null;
    return {
      isLow: current.gasPrice < avg24h.avgGwei * 0.8,
      currentGwei: current.gasPrice,
      avg24hGwei: avg24h.avgGwei,
      savingsPercent: Math.round((1 - current.gasPrice / avg24h.avgGwei) * 100)
    };
  }

  getBestWindow(chainId, hours = 24) {
    const cutoff = Date.now() - (hours * 3600000);
    const relevant = this.history.filter(h => h.chainId === chainId && h.timestamp > cutoff);
    if (relevant.length < 10) return null;

    // Group by hour of day
    const hourlyAvg = {};
    for (const h of relevant) {
      const hour = new Date(h.timestamp).getHours();
      if (!hourlyAvg[hour]) hourlyAvg[hour] = { total: 0, count: 0 };
      hourlyAvg[hour].total += h.gasPrice;
      hourlyAvg[hour].count++;
    }

    const hours24 = Object.entries(hourlyAvg).map(([h, data]) => ({
      hour: parseInt(h),
      avgGwei: Math.round((data.total / data.count) * 100) / 100
    })).sort((a, b) => a.avgGwei - b.avgGwei);

    return { cheapest: hours24[0], expensive: hours24[hours24.length - 1], allHours: hours24 };
  }
}

// ─── Cost Estimator ───
function estimateGasCost(gasLimit, gasPriceGwei, ethPriceUsd) {
  const gasEth = (gasLimit * gasPriceGwei) / 1e9;
  const gasUsd = gasEth * ethPriceUsd;
  return { gasEth: Math.round(gasEth * 1e8) / 1e8, gasUsd: Math.round(gasUsd * 100) / 100 };
}

// ─── Optimal Timing Suggestion ───
function suggestGasTiming(tracker, chainId, lang = 'en') {
  const isVi = lang === 'vi';
  const window = tracker.getBestWindow(chainId);
  const lowNow = tracker.isLowGasNow(chainId);

  if (!window) return isVi ? '⛽ Chưa đủ dữ liệu gas' : '⛽ Insufficient gas data';

  if (lowNow?.isLow) {
    return `🟢 ${isVi ? 'Gas THẤP! Giao dịch ngay' : 'Gas LOW! Trade now'} (${lowNow.currentGwei} Gwei, ${lowNow.savingsPercent}% ${isVi ? 'rẻ hơn TB' : 'below avg'})`;
  }

  return `⏰ ${isVi ? 'Thời điểm gas rẻ nhất' : 'Cheapest gas at'}: ${window.cheapest.hour}:00 (${window.cheapest.avgGwei} Gwei)`;
}

const gasTracker = new GasTracker();

module.exports = { GasTracker, gasTracker, estimateGasCost, suggestGasTiming };
