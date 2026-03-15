/**
 * #4 Meme Sniper Intelligence — Real-time meme token radar
 * Features: live feed scanning, risk scoring, 1-click snipe, signal heatmap
 */
'use strict';

const log = { info: (...a) => console.log('[MemeRadar]', ...a), warn: (...a) => console.warn('[MemeRadar]', ...a) };

// ─── Risk Scoring ───
function calculateMemeRiskScore(tokenData) {
  let score = 50;
  if (tokenData.devRugCount > 0) score -= 40;
  if (tokenData.bundlerPercent > 30) score -= 30;
  if (tokenData.top10HolderPercent > 50) score -= 20;
  if (tokenData.smartMoneyBuys > 0) score += 15;
  if (tokenData.whaleBuys > 0) score += 15;
  if (tokenData.liquidityUsd > 10000) score += 10;
  if (tokenData.holderCount > 100) score += 10;
  if (tokenData.isHoneypot) score -= 50;
  return Math.max(0, Math.min(100, score));
}

function getRiskLabel(score) {
  if (score >= 70) return { emoji: '🟢', label: 'LOW RISK' };
  if (score >= 40) return { emoji: '🟡', label: 'MEDIUM RISK' };
  return { emoji: '🔴', label: 'HIGH RISK' };
}

// ─── Token Scanner ───
class MemeRadar {
  constructor(options = {}) {
    this.scanInterval = options.scanInterval || 30000; // 30s default
    this.minLiquidity = options.minLiquidity || 1000;
    this.maxAge = options.maxAge || 3600000; // 1h
    this.trackedTokens = new Map();
    this.alerts = [];
    this._timer = null;
  }

  addToken(token) {
    const score = calculateMemeRiskScore(token);
    const risk = getRiskLabel(score);
    const entry = { ...token, riskScore: score, risk, addedAt: Date.now() };
    this.trackedTokens.set(token.address || token.symbol, entry);
    // Prune stale entries to prevent unbounded memory growth
    if (this.trackedTokens.size > 200) this.cleanup();
    return entry;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.trackedTokens.entries()) {
      if (now - entry.addedAt > this.maxAge) this.trackedTokens.delete(key);
    }
  }

  getTopTokens(limit = 20, sortBy = 'riskScore') {
    const tokens = [...this.trackedTokens.values()];
    tokens.sort((a, b) => b[sortBy] - a[sortBy]);
    return tokens.slice(0, limit);
  }

  getSnipeCandidates(criteria = {}) {
    const { maxMarketCap = 500000, minLiquidity = 5000, minScore = 60 } = criteria;
    return [...this.trackedTokens.values()].filter(t =>
      t.riskScore >= minScore &&
      (t.marketCap || 0) <= maxMarketCap &&
      (t.liquidityUsd || 0) >= minLiquidity
    );
  }

  // Signal heatmap data: group by token × time
  buildHeatmapData(signals = []) {
    const heatmap = {};
    for (const sig of signals) {
      const key = sig.tokenSymbol || sig.tokenAddress;
      if (!heatmap[key]) heatmap[key] = { token: key, smartMoney: 0, whale: 0, kol: 0, total: 0 };
      if (sig.type === 1) heatmap[key].smartMoney++;
      if (sig.type === 2) heatmap[key].kol++;
      if (sig.type === 3) heatmap[key].whale++;
      heatmap[key].total++;
    }
    return Object.values(heatmap).sort((a, b) => b.total - a.total);
  }

  start(scanFn) {
    if (this._timer) return;
    this._timer = setInterval(async () => {
      try { await scanFn(this); } catch (e) { log.warn('Scan error:', e.message); }
    }, this.scanInterval);
    log.info(`Radar started, scanning every ${this.scanInterval / 1000}s`);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    log.info('Radar stopped');
  }

  clear() { this.trackedTokens.clear(); }
}

// ─── Singleton ───
const memeRadar = new MemeRadar();

module.exports = {
  MemeRadar,
  memeRadar,
  calculateMemeRiskScore,
  getRiskLabel
};
