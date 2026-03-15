/**
 * #10 Gamified Trading Academy — Paper trading + level system + challenges
 * Features: virtual portfolio, real-time prices, XP/levels, daily challenges
 */
'use strict';

const log = { info: (...a) => console.log('[PaperTrading]', ...a) };

// ─── Level System ───
const LEVELS = [
  { min: 0, name: 'Rookie', maxRealTrade: 0 },
  { min: 100, name: 'Beginner', maxRealTrade: 0 },
  { min: 500, name: 'Junior Trader', maxRealTrade: 10 },
  { min: 1500, name: 'Trader', maxRealTrade: 50 },
  { min: 3000, name: 'Pro Trader', maxRealTrade: 500 },
  { min: 5000, name: 'Expert', maxRealTrade: Infinity },
  { min: 10000, name: 'Signal Master', maxRealTrade: Infinity }
];

function getLevel(xp) {
  let level = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.min) level = l; }
  return level;
}

// ─── Paper Portfolio ───
class PaperPortfolio {
  constructor(userId, initialBalance = 10000) {
    this.userId = userId;
    this.cash = initialBalance;
    this.holdings = {}; // { symbol: { amount, avgPrice } }
    this.trades = [];
    this.xp = 0;
    this.createdAt = Date.now();
  }

  buy(symbol, amount, price) {
    const cost = amount * price;
    if (cost > this.cash) return { success: false, error: 'Insufficient funds' };
    this.cash -= cost;
    if (!this.holdings[symbol]) this.holdings[symbol] = { amount: 0, avgPrice: 0, totalCost: 0 };
    const h = this.holdings[symbol];
    h.totalCost += cost;
    h.amount += amount;
    h.avgPrice = h.amount ? h.totalCost / h.amount : 0;
    const trade = { type: 'BUY', symbol, amount, price, cost, ts: Date.now() };
    this.trades.push(trade);
    this.xp += 10;
    return { success: true, trade };
  }

  sell(symbol, amount, price) {
    const h = this.holdings[symbol];
    if (!h || h.amount < amount) return { success: false, error: 'Insufficient holdings' };
    const revenue = amount * price;
    const costBasis = h.avgPrice * amount;
    const pnl = revenue - costBasis;
    h.amount -= amount;
    h.totalCost = h.avgPrice * h.amount;
    this.cash += revenue;
    if (h.amount <= 0) delete this.holdings[symbol];
    const trade = { type: 'SELL', symbol, amount, price, revenue, pnl, ts: Date.now() };
    this.trades.push(trade);
    this.xp += (pnl > 0 ? 25 : 10);
    return { success: true, trade, pnl };
  }

  getPortfolioValue(currentPrices = {}) {
    let holdingsValue = 0;
    const positions = [];
    for (const [symbol, h] of Object.entries(this.holdings)) {
      const currentPrice = currentPrices[symbol] || h.avgPrice;
      const value = h.amount * currentPrice;
      const pnl = value - (h.avgPrice * h.amount);
      holdingsValue += value;
      positions.push({ symbol, amount: h.amount, avgPrice: h.avgPrice, currentPrice, value, pnl });
    }
    return {
      cash: this.cash,
      holdingsValue,
      totalValue: this.cash + holdingsValue,
      positions,
      totalPnl: (this.cash + holdingsValue) - 10000,
      winRate: this._calcWinRate()
    };
  }

  _calcWinRate() {
    const sells = this.trades.filter(t => t.type === 'SELL');
    if (!sells.length) return 0;
    const wins = sells.filter(t => t.pnl > 0).length;
    return Math.round((wins / sells.length) * 100);
  }

  getLevel() { return getLevel(this.xp); }
}

// ─── Daily Challenges ───
const CHALLENGE_TEMPLATES = [
  { id: 'find_smart_money', desc: 'Find 3 tokens with Smart Money buys in the last 6h', xpReward: 50, type: 'signal' },
  { id: 'analyze_meme', desc: 'Analyze 5 meme tokens and assign safety scores', xpReward: 75, type: 'research' },
  { id: 'profitable_trade', desc: 'Make a paper trade that profits at least 5%', xpReward: 100, type: 'trade' },
  { id: 'diversify', desc: 'Hold at least 5 different tokens', xpReward: 40, type: 'portfolio' },
  { id: 'whale_watch', desc: 'Identify 2 tokens whales are accumulating', xpReward: 60, type: 'signal' }
];

function getDailyChallenge(dayIndex) {
  return CHALLENGE_TEMPLATES[dayIndex % CHALLENGE_TEMPLATES.length];
}

// ─── Portfolio Store ───
const portfolios = new Map();

function getOrCreatePortfolio(userId) {
  if (!portfolios.has(userId)) portfolios.set(userId, new PaperPortfolio(userId));
  return portfolios.get(userId);
}

module.exports = {
  PaperPortfolio,
  LEVELS,
  getLevel,
  getDailyChallenge,
  CHALLENGE_TEMPLATES,
  portfolios,
  getOrCreatePortfolio
};
