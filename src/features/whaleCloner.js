/**
 * #21 Whale Wallet Cloner — Mirror whale wallet strategies
 * Features: wallet tracking, trade mirroring, proportional sizing, PnL comparison
 */
'use strict';

const log = { info: (...a) => console.log('[WhaleCloner]', ...a) };

class WhaleTracker {
  constructor(config) {
    this.userId = config.userId;
    this.whaleAddress = config.whaleAddress;
    this.label = config.label || 'Unknown Whale';
    this.autoMirror = config.autoMirror || false;
    this.maxPerTrade = config.maxPerTrade || 50; // Max USD per mirrored trade
    this.proportional = config.proportional !== false; // Scale by wallet size ratio
    this.trackedTrades = [];
    this.mirroredTrades = [];
    this.active = true;
    this.createdAt = Date.now();
  }

  recordWhaleTrade(trade) {
    this.trackedTrades.push({ ...trade, detectedAt: Date.now() });
    return trade;
  }

  calculateMirrorAmount(whaleAmountUsd, userBalanceUsd, whaleBalanceUsd) {
    if (!this.proportional) return Math.min(this.maxPerTrade, whaleAmountUsd);
    const ratio = userBalanceUsd / (whaleBalanceUsd || 1);
    const proportionalAmount = whaleAmountUsd * ratio;
    return Math.min(this.maxPerTrade, Math.max(1, proportionalAmount));
  }

  recordMirror(trade) {
    this.mirroredTrades.push({ ...trade, mirroredAt: Date.now() });
  }

  getStats() {
    const whalePnl = this.trackedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const myPnl = this.mirroredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    return {
      whaleAddress: this.whaleAddress,
      label: this.label,
      whaleTrades: this.trackedTrades.length,
      mirroredTrades: this.mirroredTrades.length,
      whalePnl,
      myPnl,
      copyAccuracy: this.trackedTrades.length ? Math.round((this.mirroredTrades.length / this.trackedTrades.length) * 100) : 0
    };
  }
}

// ─── Store ───
const whaleTrackers = new Map(); // userId -> WhaleTracker[]

function addWhaleTracker(userId, config) {
  if (!whaleTrackers.has(userId)) whaleTrackers.set(userId, []);
  const tracker = new WhaleTracker({ ...config, userId });
  whaleTrackers.get(userId).push(tracker);
  log.info(`Tracking whale ${config.whaleAddress} for ${userId}`);
  return tracker;
}

function getUserTrackers(userId) {
  return (whaleTrackers.get(userId) || []).filter(t => t.active);
}

function removeTracker(userId, whaleAddress) {
  const trackers = whaleTrackers.get(userId);
  if (!trackers) return false;
  const idx = trackers.findIndex(t => t.whaleAddress === whaleAddress);
  if (idx >= 0) { trackers[idx].active = false; trackers.splice(idx, 1); return true; }
  return false;
}

module.exports = {
  WhaleTracker,
  whaleTrackers,
  addWhaleTracker,
  getUserTrackers,
  removeTracker
};
