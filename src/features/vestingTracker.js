/**
 * #28 Token Unlock & Vesting Tracker — Track token unlock schedules
 * Features: add vesting schedules, countdown alerts, supply impact analysis
 */
'use strict';

const log = { info: (...a) => console.log('[VestingTracker]', ...a) };

class VestingSchedule {
  constructor(config) {
    this.token = config.token;
    this.totalLocked = config.totalLocked || 0;
    this.unlocks = config.unlocks || []; // [{ date, amount, type, cliff }]
    this.addedBy = config.userId;
    this.createdAt = Date.now();
  }

  getUpcomingUnlocks(days = 30) {
    const cutoff = Date.now() + (days * 86400000);
    return this.unlocks
      .filter(u => new Date(u.date).getTime() > Date.now() && new Date(u.date).getTime() <= cutoff)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  getNextUnlock() {
    const upcoming = this.unlocks
      .filter(u => new Date(u.date).getTime() > Date.now())
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming[0] || null;
  }

  getUnlockImpact(totalSupply) {
    const next = this.getNextUnlock();
    if (!next || !totalSupply) return null;
    const impactPercent = (next.amount / totalSupply) * 100;
    return {
      ...next,
      impactPercent: Math.round(impactPercent * 100) / 100,
      severity: impactPercent > 5 ? 'HIGH' : impactPercent > 2 ? 'MEDIUM' : 'LOW',
      daysUntil: Math.ceil((new Date(next.date).getTime() - Date.now()) / 86400000)
    };
  }

  getTotalUnlocked() {
    return this.unlocks
      .filter(u => new Date(u.date).getTime() <= Date.now())
      .reduce((sum, u) => sum + u.amount, 0);
  }

  getPercentUnlocked() {
    if (!this.totalLocked) return 0;
    return Math.round((this.getTotalUnlocked() / this.totalLocked) * 100);
  }
}

// ─── Store ───
const vestingSchedules = new Map(); // token -> VestingSchedule

function addVesting(config) {
  const schedule = new VestingSchedule(config);
  vestingSchedules.set(config.token, schedule);
  log.info(`Vesting schedule added for ${config.token}`);
  return schedule;
}

function getVesting(token) {
  return vestingSchedules.get(token);
}

function getAllUpcoming(days = 7) {
  const results = [];
  for (const [token, schedule] of vestingSchedules) {
    const upcoming = schedule.getUpcomingUnlocks(days);
    for (const u of upcoming) results.push({ token, ...u });
  }
  return results.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function formatVestingReport(token, schedule, totalSupply, lang = 'en') {
  const isVi = lang === 'vi';
  const impact = schedule.getUnlockImpact(totalSupply);
  const lines = [
    `🔓 <b>${token} ${isVi ? 'Lịch Unlock' : 'Unlock Schedule'}</b>`,
    `📊 ${isVi ? 'Đã unlock' : 'Unlocked'}: ${schedule.getPercentUnlocked()}%`,
    ''
  ];

  if (impact) {
    const emoji = impact.severity === 'HIGH' ? '🔴' : impact.severity === 'MEDIUM' ? '🟡' : '🟢';
    lines.push(`${emoji} ${isVi ? 'Unlock tiếp theo' : 'Next unlock'}: ${impact.daysUntil} ${isVi ? 'ngày nữa' : 'days'}`);
    lines.push(`💰 ${isVi ? 'Số lượng' : 'Amount'}: ${impact.amount.toLocaleString()} (${impact.impactPercent}% supply)`);
    lines.push(`⚠️ ${isVi ? 'Tác động' : 'Impact'}: ${impact.severity}`);
  } else {
    lines.push(isVi ? '✅ Không có unlock sắp tới' : '✅ No upcoming unlocks');
  }

  return lines.join('\n');
}

module.exports = {
  VestingSchedule,
  vestingSchedules,
  addVesting,
  getVesting,
  getAllUpcoming,
  formatVestingReport
};
