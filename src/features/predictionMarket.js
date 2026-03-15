/**
 * #26 Prediction Market — Community-driven crypto predictions
 * Features: create predictions, stake positions, resolve outcomes, leaderboard
 */
'use strict';

const log = { info: (...a) => console.log('[Prediction]', ...a) };

class Prediction {
  constructor(config) {
    this.id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.creator = config.creator;
    this.question = config.question;
    this.options = config.options || ['Yes', 'No'];
    this.endTime = config.endTime || Date.now() + 86400000; // 24h default
    this.resolved = false;
    this.winningOption = null;
    this.stakes = {}; // optionIndex -> [{ userId, amount }]
    this.totalPool = 0;
    this.createdAt = Date.now();

    for (let i = 0; i < this.options.length; i++) this.stakes[i] = [];
  }

  stake(userId, optionIndex, amount) {
    if (this.resolved) return { success: false, error: 'Already resolved' };
    if (Date.now() > this.endTime) return { success: false, error: 'Betting closed' };
    if (!this.stakes[optionIndex]) return { success: false, error: 'Invalid option' };

    this.stakes[optionIndex].push({ userId, amount, ts: Date.now() });
    this.totalPool += amount;
    return { success: true, totalPool: this.totalPool };
  }

  resolve(winningOptionIndex) {
    if (this.resolved) return null;
    this.resolved = true;
    this.winningOption = winningOptionIndex;
    this.resolvedAt = Date.now();

    const winners = this.stakes[winningOptionIndex] || [];
    const winnerPool = winners.reduce((sum, s) => sum + s.amount, 0);
    const payouts = [];

    for (const winner of winners) {
      const share = winner.amount / (winnerPool || 1);
      const payout = share * this.totalPool * 0.95; // 5% platform fee
      payouts.push({ userId: winner.userId, staked: winner.amount, payout: Math.round(payout * 100) / 100 });
    }

    return { winningOption: this.options[winningOptionIndex], payouts, totalPool: this.totalPool };
  }

  getOdds() {
    const odds = {};
    for (const [idx, stakes] of Object.entries(this.stakes)) {
      const total = stakes.reduce((sum, s) => sum + s.amount, 0);
      odds[this.options[idx]] = { staked: total, percent: this.totalPool ? Math.round((total / this.totalPool) * 100) : 0 };
    }
    return odds;
  }

  isExpired() { return Date.now() > this.endTime && !this.resolved; }
}

const predictions = new Map();

function createPrediction(config) {
  const pred = new Prediction(config);
  predictions.set(pred.id, pred);
  return pred;
}

function getActivePredictions() {
  return [...predictions.values()].filter(p => !p.resolved && Date.now() <= p.endTime);
}

function getPrediction(id) { return predictions.get(id); }

module.exports = { Prediction, predictions, createPrediction, getActivePredictions, getPrediction };
