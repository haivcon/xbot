/**
 * #11 Wallet Security Guardian — Real-time wallet protection
 * Features: approval scanner, anomaly detection, security scoring, auto-revoke
 */
'use strict';

const log = { info: (...a) => console.log('[WalletGuard]', ...a), warn: (...a) => console.warn('[WalletGuard]', ...a) };

// ─── Approval Scanner ───
class ApprovalScanner {
  constructor() {
    this.approvals = new Map(); // walletAddress -> [{ spender, token, amount, timestamp }]
  }

  addApproval(wallet, approval) {
    if (!this.approvals.has(wallet)) this.approvals.set(wallet, []);
    this.approvals.get(wallet).push({ ...approval, scannedAt: Date.now() });
  }

  getRiskyApprovals(wallet) {
    const all = this.approvals.get(wallet) || [];
    return all.filter(a =>
      a.amount === 'unlimited' ||
      a.isUnverifiedContract ||
      (Date.now() - a.timestamp > 30 * 86400000) // Older than 30 days
    );
  }

  getApprovalCount(wallet) {
    return (this.approvals.get(wallet) || []).length;
  }
}

// ─── Anomaly Detection ───
function detectAnomalies(transactions, wallet) {
  const anomalies = [];
  for (const tx of transactions) {
    // Large unexpected transfer
    if (tx.type === 'transfer' && tx.from === wallet && tx.valueUsd > 500 && !tx.isUserInitiated) {
      anomalies.push({ type: 'large_transfer', severity: 'HIGH', tx, message: `Unexpected transfer of $${tx.valueUsd}` });
    }
    // Unlimited approval
    if (tx.type === 'approve' && tx.amount === 'unlimited') {
      anomalies.push({ type: 'unlimited_approve', severity: 'MEDIUM', tx, message: `Unlimited approval to ${tx.spender}` });
    }
    // Interaction with known scam
    if (tx.isKnownScam) {
      anomalies.push({ type: 'scam_interaction', severity: 'CRITICAL', tx, message: `Interaction with flagged address` });
    }
  }
  return anomalies;
}

// ─── Security Score ───
function calculateSecurityScore(walletData) {
  let score = 100;
  const { activeApprovals = 0, riskyApprovals = 0, hasBackup = false, age = 0, anomalyCount = 0 } = walletData;

  if (activeApprovals > 10) score -= 15;
  if (riskyApprovals > 0) score -= (riskyApprovals * 10);
  if (!hasBackup) score -= 5;
  if (anomalyCount > 0) score -= (anomalyCount * 15);
  if (age < 7 * 86400000) score -= 10; // New wallet

  return Math.max(0, Math.min(100, score));
}

function getSecurityLabel(score) {
  if (score >= 80) return { emoji: '🟢', label: 'SECURE' };
  if (score >= 50) return { emoji: '🟡', label: 'MODERATE RISK' };
  return { emoji: '🔴', label: 'HIGH RISK' };
}

// Severity ranking for proper comparison
const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

// ─── Pre-Swap Safety Check ───
async function preSwapCheck(tokenAddress, options = {}) {
  const { advancedInfoFn, bundleInfoFn, devInfoFn } = options;
  const risks = [];

  if (advancedInfoFn) {
    try {
      const info = await advancedInfoFn(tokenAddress);
      if (info.isHoneypot) risks.push({ type: 'honeypot', severity: 'CRITICAL', detail: 'Token is a honeypot' });
      if ((info.buyTax || 0) > 10) risks.push({ type: 'high_tax', severity: 'HIGH', detail: `Buy tax: ${info.buyTax}%` });
      if ((info.sellTax || 0) > 10) risks.push({ type: 'high_tax', severity: 'HIGH', detail: `Sell tax: ${info.sellTax}%` });
    } catch (e) { log.warn('preSwapCheck advancedInfo error:', e.message); }
  }

  if (bundleInfoFn) {
    try {
      const bundle = await bundleInfoFn(tokenAddress);
      if ((bundle.bundlerPercent || 0) > 30) risks.push({ type: 'bundler', severity: 'MEDIUM', detail: `Bundler: ${bundle.bundlerPercent}%` });
    } catch (e) { log.warn('preSwapCheck bundleInfo error:', e.message); }
  }

  if (devInfoFn) {
    try {
      const dev = await devInfoFn(tokenAddress);
      if ((dev.rugCount || 0) > 0) risks.push({ type: 'dev_rug', severity: 'CRITICAL', detail: `Dev rug count: ${dev.rugCount}` });
    } catch (e) { log.warn('preSwapCheck devInfo error:', e.message); }
  }

  // Determine highest severity by ranking, not by first element
  let highestSeverity = 'NONE';
  for (const r of risks) {
    if ((SEVERITY_RANK[r.severity] || 0) > (SEVERITY_RANK[highestSeverity] || 0)) {
      highestSeverity = r.severity;
    }
  }

  return { safe: risks.length === 0, risks, highestSeverity };
}

const approvalScanner = new ApprovalScanner();

module.exports = {
  ApprovalScanner,
  approvalScanner,
  detectAnomalies,
  calculateSecurityScore,
  getSecurityLabel,
  preSwapCheck
};
