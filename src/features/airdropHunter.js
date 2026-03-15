/**
 * #27 Airdrop Hunter — Automated airdrop discovery and tracking
 * Features: eligibility checker, activity scoring, airdrop database, claim reminders
 */
'use strict';

const log = { info: (...a) => console.log('[AirdropHunter]', ...a) };

// ─── Activity Score ───
function calculateActivityScore(walletData) {
  let score = 0;
  const { txCount = 0, uniqueProtocols = 0, uniqueChains = 0, bridgeCount = 0, swapCount = 0, nftCount = 0, walletAge = 0 } = walletData;

  if (txCount > 100) score += 20; else if (txCount > 50) score += 15; else if (txCount > 10) score += 10;
  if (uniqueProtocols > 10) score += 15; else if (uniqueProtocols > 5) score += 10; else if (uniqueProtocols > 2) score += 5;
  if (uniqueChains > 3) score += 10; else if (uniqueChains > 1) score += 5;
  if (bridgeCount > 5) score += 10; else if (bridgeCount > 0) score += 5;
  if (swapCount > 50) score += 10; else if (swapCount > 10) score += 5;
  if (nftCount > 0) score += 5;
  if (walletAge > 365) score += 15; else if (walletAge > 180) score += 10; else if (walletAge > 30) score += 5;

  return Math.min(100, score);
}

function getActivityLabel(score) {
  if (score >= 80) return { label: 'Power User', emoji: '⭐⭐⭐' };
  if (score >= 50) return { label: 'Active User', emoji: '⭐⭐' };
  if (score >= 20) return { label: 'Casual User', emoji: '⭐' };
  return { label: 'Newcomer', emoji: '🆕' };
}

// ─── Airdrop Database ───
class AirdropTracker {
  constructor() {
    this.airdrops = new Map(); // id -> airdrop data
    this.userClaims = new Map(); // userId -> [airdropId]
  }

  addAirdrop(data) {
    const id = data.id || `drop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.airdrops.set(id, {
      id,
      name: data.name,
      protocol: data.protocol,
      chain: data.chain,
      estimatedValue: data.estimatedValue || 'Unknown',
      deadline: data.deadline,
      requirements: data.requirements || [],
      status: data.status || 'active',
      addedAt: Date.now()
    });
    return id;
  }

  getActiveAirdrops() {
    return [...this.airdrops.values()].filter(a => a.status === 'active' && (!a.deadline || new Date(a.deadline) > new Date()));
  }

  checkEligibility(userId, walletData) {
    const score = calculateActivityScore(walletData);
    const eligible = this.getActiveAirdrops().filter(airdrop => {
      return airdrop.requirements.every(req => {
        if (req.type === 'min_tx' && walletData.txCount >= req.value) return true;
        if (req.type === 'min_chains' && walletData.uniqueChains >= req.value) return true;
        if (req.type === 'min_age' && walletData.walletAge >= req.value) return true;
        if (req.type === 'has_nft' && walletData.nftCount > 0) return true;
        return false;
      });
    });
    return { score, activity: getActivityLabel(score), eligible, total: this.getActiveAirdrops().length };
  }

  recordClaim(userId, airdropId) {
    if (!this.userClaims.has(userId)) this.userClaims.set(userId, []);
    this.userClaims.get(userId).push(airdropId);
  }
}

const airdropTracker = new AirdropTracker();

module.exports = { calculateActivityScore, getActivityLabel, AirdropTracker, airdropTracker };
