/**
 * #29 Multi-Wallet Strategy Manager — Manage multiple wallets with different strategies
 * Features: wallet grouping, strategy assignment, aggregate PnL, allocation rebalancing
 */
'use strict';

const log = { info: (...a) => console.log('[MultiWallet]', ...a) };

// ─── Strategy Types ───
const WALLET_STRATEGIES = {
  hodl: { name: 'HODL', description: 'Long-term holding, no active trading' },
  dca: { name: 'DCA', description: 'Dollar cost averaging into target tokens' },
  sniper: { name: 'Sniper', description: 'Quick in/out meme trading' },
  yield: { name: 'Yield', description: 'Liquidity provision and farming' },
  arbitrage: { name: 'Arbitrage', description: 'Cross-chain arbitrage operations' },
  reserve: { name: 'Reserve', description: 'Emergency fund, stablecoins only' }
};

// ─── Wallet Group ───
class WalletGroup {
  constructor(userId, config) {
    this.userId = userId;
    this.name = config.name;
    this.strategy = config.strategy || 'hodl';
    this.walletIds = config.walletIds || [];
    this.targetAllocation = config.targetAllocation || {}; // { ETH: 50, OKB: 30, USDT: 20 }
    this.maxRiskPercent = config.maxRiskPercent || 10;
    this.createdAt = Date.now();
  }

  addWallet(walletId) {
    if (!this.walletIds.includes(walletId)) this.walletIds.push(walletId);
  }

  removeWallet(walletId) {
    this.walletIds = this.walletIds.filter(id => id !== walletId);
  }

  needsRebalance(currentAllocation) {
    const drift = [];
    for (const [token, target] of Object.entries(this.targetAllocation)) {
      const current = currentAllocation[token] || 0;
      const diff = Math.abs(current - target);
      if (diff > 5) drift.push({ token, target, current, diff });
    }
    return drift;
  }
}

// ─── Strategy Manager ───
class StrategyManager {
  constructor() {
    this.groups = new Map(); // userId -> Map(groupName -> WalletGroup)
  }

  createGroup(userId, config) {
    if (!this.groups.has(userId)) this.groups.set(userId, new Map());
    const group = new WalletGroup(userId, config);
    this.groups.get(userId).set(config.name, group);
    log.info(`Group "${config.name}" created for ${userId} with strategy ${config.strategy}`);
    return group;
  }

  getUserGroups(userId) {
    return this.groups.has(userId) ? [...this.groups.get(userId).values()] : [];
  }

  getGroup(userId, name) {
    return this.groups.get(userId)?.get(name);
  }

  deleteGroup(userId, name) {
    return this.groups.get(userId)?.delete(name) || false;
  }

  getAggregateStats(userId) {
    const groups = this.getUserGroups(userId);
    return {
      totalGroups: groups.length,
      totalWallets: groups.reduce((sum, g) => sum + g.walletIds.length, 0),
      strategies: groups.map(g => ({ name: g.name, strategy: g.strategy, wallets: g.walletIds.length }))
    };
  }
}

const strategyManager = new StrategyManager();

module.exports = {
  WALLET_STRATEGIES,
  WalletGroup,
  StrategyManager,
  strategyManager
};
