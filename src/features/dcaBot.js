/**
 * #16 Smart DCA Bot — AI-powered dollar cost averaging
 * Features: scheduled buys, smart multiplier, whale pressure detection, MA-based sizing
 */
'use strict';

const log = { info: (...a) => console.log('[DCABot]', ...a) };

// ─── DCA Strategy ───
class DCAStrategy {
  constructor(config) {
    this.userId = config.userId;
    this.token = config.token;
    this.baseAmount = config.baseAmount || 10; // USDT per buy
    this.interval = config.interval || 'daily'; // daily, weekly, hourly
    this.smartMode = config.smartMode !== false; // AI adjustments
    this.maxMultiplier = config.maxMultiplier || 3;
    this.minMultiplier = config.minMultiplier || 0.5;
    this.active = true;
    this.history = [];
    this.totalInvested = 0;
    this.totalTokens = 0;
    this.createdAt = Date.now();
  }

  /**
   * Calculate buy amount based on market conditions
   * @param {Object} market - { price, ma20, rsi, whaleSellPressure }
   * @returns {Object} - { amount, multiplier, reason }
   */
  calculateBuyAmount(market = {}) {
    if (!this.smartMode) return { amount: this.baseAmount, multiplier: 1, reason: 'Fixed DCA' };

    let multiplier = 1;
    const reasons = [];

    // Price below MA20 → buy more
    if (market.ma20 && market.price < market.ma20 * 0.95) {
      multiplier = 2;
      reasons.push('Price 5%+ below MA20 → 2x');
    } else if (market.ma20 && market.price > market.ma20 * 1.1) {
      multiplier = 0.5;
      reasons.push('Price 10%+ above MA20 → 0.5x');
    }

    // RSI oversold → buy more
    if (market.rsi && market.rsi < 30) {
      multiplier = Math.min(multiplier * 1.5, this.maxMultiplier);
      reasons.push(`RSI ${market.rsi} (oversold) → boost`);
    } else if (market.rsi && market.rsi > 70) {
      multiplier = Math.max(multiplier * 0.5, this.minMultiplier);
      reasons.push(`RSI ${market.rsi} (overbought) → reduce`);
    }

    // Whale selling pressure → pause (skip min clamp)
    if (market.whaleSellPressure) {
      return { amount: 0, multiplier: 0, reason: 'Whale sell pressure detected → PAUSE' };
    }

    multiplier = Math.max(this.minMultiplier, Math.min(this.maxMultiplier, multiplier));
    const amount = this.baseAmount * multiplier;
    return { amount: Math.round(amount * 100) / 100, multiplier, reason: reasons.join('; ') || 'Normal DCA' };
  }

  recordBuy(price, amount, tokensReceived) {
    this.totalInvested += amount;
    this.totalTokens += tokensReceived;
    this.history.push({ price, amount, tokensReceived, avgPrice: this.totalTokens ? this.totalInvested / this.totalTokens : 0, ts: Date.now() });
    return this.getStats();
  }

  getStats() {
    return {
      token: this.token,
      totalInvested: this.totalInvested,
      totalTokens: this.totalTokens,
      avgPrice: this.totalTokens ? this.totalInvested / this.totalTokens : 0,
      buyCount: this.history.length,
      active: this.active,
      interval: this.interval,
      smartMode: this.smartMode
    };
  }

  getIntervalMs() {
    const map = { hourly: 3600000, daily: 86400000, weekly: 604800000, '4h': 14400000, '12h': 43200000 };
    return map[this.interval] || 86400000;
  }
}

// ─── DCA Store ───
const dcaStrategies = new Map(); // userId -> Map(token -> DCAStrategy)

function createDCA(userId, config) {
  if (!dcaStrategies.has(userId)) dcaStrategies.set(userId, new Map());
  const strategy = new DCAStrategy({ ...config, userId });
  dcaStrategies.get(userId).set(config.token, strategy);
  log.info(`DCA created: ${userId} → ${config.token} $${config.baseAmount}/${config.interval}`);
  return strategy;
}

function getUserDCAs(userId) {
  return dcaStrategies.has(userId) ? [...dcaStrategies.get(userId).values()] : [];
}

function cancelDCA(userId, token) {
  const userDCAs = dcaStrategies.get(userId);
  if (userDCAs?.has(token)) { userDCAs.get(token).active = false; userDCAs.delete(token); return true; }
  return false;
}

module.exports = {
  DCAStrategy,
  dcaStrategies,
  createDCA,
  getUserDCAs,
  cancelDCA
};
