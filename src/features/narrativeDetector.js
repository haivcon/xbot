/**
 * #22 AI Narrative Detector — Detect trending crypto narratives
 * Features: keyword clustering, narrative scoring, trend timeline, portfolio alignment
 */
'use strict';

const log = { info: (...a) => console.log('[Narrative]', ...a) };

// ─── Known Narratives ───
const NARRATIVES = {
  ai: { name: 'AI & Machine Learning', keywords: ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'neural', 'llm', 'deeplearning'], emoji: '🤖' },
  rwa: { name: 'Real World Assets', keywords: ['rwa', 'real world', 'tokenized', 'treasury', 'bonds', 'real estate'], emoji: '🏦' },
  depin: { name: 'DePIN', keywords: ['depin', 'physical infrastructure', 'iot', 'sensor', 'network infrastructure'], emoji: '🌐' },
  gaming: { name: 'GameFi', keywords: ['gaming', 'gamefi', 'play to earn', 'p2e', 'metaverse', 'nft game'], emoji: '🎮' },
  defi: { name: 'DeFi 2.0', keywords: ['defi', 'yield', 'lending', 'liquidity', 'amm', 'dex', 'restaking'], emoji: '💰' },
  meme: { name: 'Meme Coins', keywords: ['meme', 'dog', 'cat', 'pepe', 'shiba', 'doge', 'pump'], emoji: '🐸' },
  l2: { name: 'Layer 2', keywords: ['l2', 'layer 2', 'rollup', 'zk', 'optimistic', 'scaling'], emoji: '⚡' },
  btc_eco: { name: 'Bitcoin Ecosystem', keywords: ['bitcoin', 'ordinals', 'brc20', 'runes', 'btc-fi', 'lightning'], emoji: '₿' },
  social: { name: 'SocialFi', keywords: ['socialfi', 'social', 'community', 'creator', 'fan token', 'lens'], emoji: '👥' },
  privacy: { name: 'Privacy', keywords: ['privacy', 'zero knowledge', 'zk', 'anonymous', 'mixer', 'confidential'], emoji: '🔒' }
};

// ─── Narrative Detection ───
function detectNarratives(text) {
  const lower = text.toLowerCase();
  const matches = [];
  for (const [id, narrative] of Object.entries(NARRATIVES)) {
    const hits = narrative.keywords.filter(kw => lower.includes(kw));
    if (hits.length > 0) {
      matches.push({ id, ...narrative, matchCount: hits.length, matchedKeywords: hits });
    }
  }
  return matches.sort((a, b) => b.matchCount - a.matchCount);
}

// ─── Narrative Trend Scoring ───
class NarrativeTrend {
  constructor() {
    this.history = []; // [{ narrative, score, timestamp }]
  }

  record(signals, timestamp = Date.now()) {
    const scores = {};
    for (const sig of signals) {
      const narratives = detectNarratives(sig.description || sig.tokenSymbol || '');
      for (const n of narratives) {
        if (!scores[n.id]) scores[n.id] = 0;
        scores[n.id] += (sig.amountUsd || 1);
      }
    }
    for (const [id, score] of Object.entries(scores)) {
      this.history.push({ narrative: id, score, timestamp });
    }
  }

  getTopNarratives(hours = 24, limit = 5) {
    const cutoff = Date.now() - (hours * 3600000);
    const recent = this.history.filter(h => h.timestamp > cutoff);
    const totals = {};
    for (const h of recent) {
      if (!totals[h.narrative]) totals[h.narrative] = 0;
      totals[h.narrative] += h.score;
    }
    return Object.entries(totals)
      .map(([id, score]) => ({ id, ...NARRATIVES[id], totalScore: score }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
  }

  // Check if portfolio aligns with trending narratives
  checkAlignment(portfolio, topNarratives) {
    const aligned = [];
    const missing = [];
    for (const n of topNarratives) {
      const hasToken = portfolio.some(t => {
        const narratives = detectNarratives(t.symbol + ' ' + (t.name || ''));
        return narratives.some(nt => nt.id === n.id);
      });
      if (hasToken) aligned.push(n);
      else missing.push(n);
    }
    return { aligned, missing, alignmentScore: topNarratives.length ? Math.round((aligned.length / topNarratives.length) * 100) : 0 };
  }
}

const narrativeTrend = new NarrativeTrend();

module.exports = {
  NARRATIVES,
  detectNarratives,
  NarrativeTrend,
  narrativeTrend
};
