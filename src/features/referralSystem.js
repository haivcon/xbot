/**
 * #20 Referral & Rewards System — Viral growth with crypto rewards
 * Features: referral links, reward tracking, leaderboard, x402 micro-payments
 */
'use strict';

const log = { info: (...a) => console.log('[Referral]', ...a) };

class ReferralSystem {
  constructor() {
    this.referrals = new Map(); // userId -> { code, referredBy, referredUsers[], rewards }
  }

  generateCode(userId) {
    const code = `ref_${userId.toString().slice(-6)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!this.referrals.has(userId)) {
      this.referrals.set(userId, { userId, code, referredBy: null, referredUsers: [], totalRewards: 0, createdAt: Date.now() });
    }
    this.referrals.get(userId).code = code;
    return code;
  }

  registerReferral(newUserId, referrerCode) {
    const referrer = [...this.referrals.values()].find(r => r.code === referrerCode);
    if (!referrer) return { success: false, error: 'Invalid referral code' };
    if (referrer.userId === newUserId) return { success: false, error: 'Cannot refer yourself' };
    if (referrer.referredUsers.includes(newUserId)) return { success: false, error: 'Already referred' };

    referrer.referredUsers.push(newUserId);
    if (!this.referrals.has(newUserId)) {
      this.referrals.set(newUserId, { userId: newUserId, code: null, referredBy: referrer.userId, referredUsers: [], totalRewards: 0, createdAt: Date.now() });
    } else {
      this.referrals.get(newUserId).referredBy = referrer.userId;
    }

    // Rewards
    const referrerReward = 0.05; // USDT
    const newUserReward = 0.05;
    referrer.totalRewards += referrerReward;
    this.referrals.get(newUserId).totalRewards += newUserReward;

    log.info(`Referral: ${newUserId} joined via ${referrer.userId}`);
    return { success: true, referrerReward, newUserReward, referrerUserId: referrer.userId };
  }

  recordFirstTrade(userId) {
    const data = this.referrals.get(userId);
    if (!data?.referredBy) return null;
    const referrer = this.referrals.get(data.referredBy);
    if (!referrer) return null;

    const bonus = 0.10;
    referrer.totalRewards += bonus;
    data.totalRewards += bonus;
    return { referrerBonus: bonus, userBonus: bonus, referrerId: data.referredBy };
  }

  getLeaderboard(limit = 10) {
    return [...this.referrals.values()]
      .sort((a, b) => b.referredUsers.length - a.referredUsers.length)
      .slice(0, limit)
      .map(r => ({ userId: r.userId, referrals: r.referredUsers.length, rewards: r.totalRewards }));
  }

  getUserStats(userId) {
    const data = this.referrals.get(userId);
    if (!data) return null;
    return {
      code: data.code,
      referredCount: data.referredUsers.length,
      totalRewards: data.totalRewards,
      referredBy: data.referredBy
    };
  }
}

const referralSystem = new ReferralSystem();

module.exports = { ReferralSystem, referralSystem };
