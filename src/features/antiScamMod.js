/**
 * #19 Crypto Group Moderation AI — Anti-scam on-chain verification
 * Features: scam link detection, token verdict auto-reply, anti-shill monitoring
 */
'use strict';

const log = { info: (...a) => console.log('[AntiScam]', ...a) };

// ─── Scam Detection ───
const KNOWN_SCAM_DOMAINS = ['airdrop-claim.com', 'free-eth.io', 'metamask-verify.xyz', 'uniswap-bonus.org'];

function detectScamUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const urls = text.match(urlRegex) || [];
  const suspicious = [];

  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      const isKnownScam = KNOWN_SCAM_DOMAINS.some(d => domain.includes(d));
      const hasPhishingKeywords = /claim|airdrop|verify|connect-wallet|free-mint|bonus|reward/i.test(url);
      const hasFakeBrand = /metamask|uniswap|opensea|pancake|1inch/i.test(domain) && !domain.endsWith('.io') && !domain.endsWith('.app');

      if (isKnownScam || hasPhishingKeywords || hasFakeBrand) {
        suspicious.push({ url, domain, reasons: [
          isKnownScam && 'known_scam_domain',
          hasPhishingKeywords && 'phishing_keywords',
          hasFakeBrand && 'fake_brand_domain'
        ].filter(Boolean) });
      }
    } catch (e) { /* invalid URL */ }
  }

  return suspicious;
}

// ─── Token Mention Detection ───
function extractTokenMentions(text) {
  const cashtags = text.match(/\$([A-Z]{2,10})/g) || [];
  const addresses = text.match(/0x[a-fA-F0-9]{40}/g) || [];
  return {
    symbols: cashtags.map(t => t.replace('$', '')),
    addresses
  };
}

// ─── Anti-Shill Score ───
class ShillDetector {
  constructor() {
    this.userMentions = new Map(); // userId -> { token -> count, lastTime }
  }

  recordMention(userId, token) {
    if (!this.userMentions.has(userId)) this.userMentions.set(userId, {});
    const mentions = this.userMentions.get(userId);
    if (!mentions[token]) mentions[token] = { count: 0, firstSeen: Date.now() };
    mentions[token].count++;
    mentions[token].lastSeen = Date.now();
  }

  isShilling(userId, token, threshold = 5) {
    const mentions = this.userMentions.get(userId);
    if (!mentions || !mentions[token]) return false;
    const entry = mentions[token];
    const hours = (Date.now() - entry.firstSeen) / 3600000;
    return entry.count >= threshold && hours < 24;
  }

  getTopShillers(limit = 10) {
    const score = [];
    for (const [userId, mentions] of this.userMentions) {
      const maxCount = Math.max(...Object.values(mentions).map(m => m.count));
      score.push({ userId, maxMentions: maxCount });
    }
    return score.sort((a, b) => b.maxMentions - a.maxMentions).slice(0, limit);
  }
}

// ─── Quick Token Verdict ───
async function quickTokenVerdict(address, options = {}) {
  const { advancedInfoFn, devInfoFn, bundleInfoFn } = options;
  const warnings = [];
  let safe = true;

  if (advancedInfoFn) {
    try {
      const info = await advancedInfoFn(address);
      if (info.isHoneypot) { warnings.push('Honeypot ❌'); safe = false; }
      if ((info.buyTax || 0) > 10) warnings.push(`Buy tax ${info.buyTax}% ⚠️`);
      if ((info.sellTax || 0) > 10) warnings.push(`Sell tax ${info.sellTax}% ⚠️`);
    } catch (e) { /* skip */ }
  }

  if (devInfoFn) {
    try {
      const dev = await devInfoFn(address);
      if ((dev.rugCount || 0) > 0) { warnings.push(`Dev rug ${dev.rugCount}x ❌`); safe = false; }
      else warnings.push('Dev clean ✅');
    } catch (e) { /* skip */ }
  }

  if (bundleInfoFn) {
    try {
      const bundle = await bundleInfoFn(address);
      if ((bundle.bundlerPercent || 0) > 30) warnings.push(`Bundler ${bundle.bundlerPercent}% ⚠️`);
      else warnings.push(`Bundler ${bundle.bundlerPercent || 0}% ✅`);
    } catch (e) { /* skip */ }
  }

  return { safe, warnings, verdict: safe ? '✅ SAFE' : '❌ RISKY' };
}

const shillDetector = new ShillDetector();

module.exports = { detectScamUrls, extractTokenMentions, ShillDetector, shillDetector, quickTokenVerdict, KNOWN_SCAM_DOMAINS };
