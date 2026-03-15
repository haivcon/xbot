/**
 * #13 DeFi Yield Autopilot — Auto yield farming optimization
 * Features: pool scanning, APY comparison, auto-rebalance, impermanent loss guard
 */
'use strict';

const log = { info: (...a) => console.log('[YieldPilot]', ...a) };

class YieldPool {
  constructor(data) {
    this.protocol = data.protocol;
    this.pair = data.pair;
    this.chainId = data.chainId || 196;
    this.apy = data.apy || 0;
    this.tvl = data.tvl || 0;
    this.fee = data.fee || 0;
    this.riskLevel = data.riskLevel || 'medium';
    this.lastUpdated = Date.now();
  }
}

class YieldAutopilot {
  constructor(userId, config = {}) {
    this.userId = userId;
    this.amount = config.amount || 0;
    this.token = config.token || 'USDT';
    this.currentPool = null;
    this.active = false;
    this.history = [];
    this.totalEarned = 0;
    this.ilThreshold = config.ilThreshold || 5; // % impermanent loss before alert
    this.minApyDiff = config.minApyDiff || 1; // % APY difference to trigger rebalance
  }

  selectBestPool(pools) {
    const scored = pools.map(p => ({
      ...p,
      score: p.apy * (p.riskLevel === 'low' ? 1.2 : p.riskLevel === 'high' ? 0.7 : 1.0) * (p.tvl > 100000 ? 1.1 : 0.9)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0] || null;
  }

  shouldRebalance(newPool) {
    if (!this.currentPool) return true;
    return newPool && (newPool.apy - this.currentPool.apy) > this.minApyDiff;
  }

  rebalance(newPool) {
    if (this.currentPool) {
      this.history.push({ from: this.currentPool.protocol, to: newPool.protocol, apyDiff: newPool.apy - this.currentPool.apy, ts: Date.now() });
    }
    this.currentPool = newPool;
    log.info(`Rebalanced to ${newPool.protocol} (${newPool.apy}% APY)`);
  }

  checkImpermanentLoss(tokenPrices) {
    if (!this.currentPool || !this.currentPool.pair) return null;
    const [t0, t1] = this.currentPool.pair.split('/');
    const p0 = tokenPrices[t0], p1 = tokenPrices[t1];
    if (!p0 || !p1) return null;
    const ratio = p0.current / (p0.entry || p0.current);
    const il = 2 * Math.sqrt(ratio) / (1 + ratio) - 1;
    const ilPercent = Math.abs(il * 100);
    return {
      ilPercent: Math.round(ilPercent * 100) / 100,
      shouldWithdraw: ilPercent > this.ilThreshold,
      severity: ilPercent > 10 ? 'HIGH' : ilPercent > 5 ? 'MEDIUM' : 'LOW'
    };
  }

  getStats() {
    return {
      userId: this.userId,
      active: this.active,
      amount: this.amount,
      currentPool: this.currentPool,
      totalEarned: this.totalEarned,
      rebalanceCount: this.history.length
    };
  }
}

const autopilots = new Map();

function getOrCreateAutopilot(userId, config) {
  if (!autopilots.has(userId)) autopilots.set(userId, new YieldAutopilot(userId, config));
  return autopilots.get(userId);
}

module.exports = { YieldPool, YieldAutopilot, autopilots, getOrCreateAutopilot };
