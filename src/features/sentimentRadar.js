/**
 * #30 Social Sentiment Radar — Analyze social media sentiment for tokens
 * Features: sentiment scoring, trend detection, fear/greed index, keyword cloud
 */
'use strict';

const log = { info: (...a) => console.log('[SentimentRadar]', ...a) };

// ─── Sentiment Analysis ───
const POSITIVE_WORDS = ['bullish', 'moon', 'pump', 'buy', 'gem', 'ape', 'hold', 'diamond', 'green', 'profit', 'win', 'gain', 'launch', 'breakout', 'accumulate', 'undervalued'];
const NEGATIVE_WORDS = ['bearish', 'dump', 'sell', 'rug', 'scam', 'crash', 'red', 'loss', 'dead', 'ponzi', 'hack', 'exit', 'worthless', 'overvalued', 'bubble'];
const NEUTRAL_WORDS = ['hold', 'wait', 'watch', 'dyor', 'nfa', 'maybe', 'depends'];

function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let positive = 0, negative = 0, neutral = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.some(pw => word.includes(pw))) positive++;
    if (NEGATIVE_WORDS.some(nw => word.includes(nw))) negative++;
    if (NEUTRAL_WORDS.some(nw => word.includes(nw))) neutral++;
  }

  const total = positive + negative + neutral || 1;
  const score = ((positive - negative) / total) * 100; // -100 to +100

  let label;
  if (score > 30) label = 'BULLISH';
  else if (score > 10) label = 'SLIGHTLY_BULLISH';
  else if (score > -10) label = 'NEUTRAL';
  else if (score > -30) label = 'SLIGHTLY_BEARISH';
  else label = 'BEARISH';

  return { score: Math.round(score), label, positive, negative, neutral };
}

// ─── Fear & Greed Index ───
function calculateFearGreedIndex(data = {}) {
  const { priceChange24h = 0, volume24h = 0, avgVolume = 1, socialSentiment = 0, whaleActivity = 0 } = data;

  let index = 50;
  // Price momentum (30% weight)
  index += Math.min(15, Math.max(-15, priceChange24h * 3));
  // Volume momentum (25% weight)
  const volRatio = volume24h / (avgVolume || 1);
  index += Math.min(12, Math.max(-12, (volRatio - 1) * 12));
  // Social sentiment (25% weight)
  index += Math.min(12, Math.max(-12, socialSentiment / 8));
  // Whale activity (20% weight)
  index += Math.min(10, Math.max(-10, whaleActivity * 5));

  index = Math.max(0, Math.min(100, Math.round(index)));

  let label;
  if (index >= 80) label = 'Extreme Greed';
  else if (index >= 60) label = 'Greed';
  else if (index >= 40) label = 'Neutral';
  else if (index >= 20) label = 'Fear';
  else label = 'Extreme Fear';

  return { index, label, emoji: index >= 60 ? '🟢' : index >= 40 ? '🟡' : '🔴' };
}

// ─── Trend History ───
class SentimentHistory {
  constructor() {
    this.entries = []; // [{ token, score, label, source, timestamp }]
  }

  add(token, sentiment, source = 'manual') {
    this.entries.push({ token, ...sentiment, source, timestamp: Date.now() });
    // Keep last 1000 entries
    if (this.entries.length > 1000) this.entries = this.entries.slice(-1000);
  }

  getTokenSentiment(token, hours = 24) {
    const cutoff = Date.now() - (hours * 3600000);
    const relevant = this.entries.filter(e => e.token === token && e.timestamp > cutoff);
    if (!relevant.length) return null;
    const avgScore = relevant.reduce((sum, e) => sum + e.score, 0) / relevant.length;
    return {
      token,
      avgScore: Math.round(avgScore),
      samples: relevant.length,
      trend: relevant.length > 1 ? (relevant[relevant.length - 1].score - relevant[0].score > 0 ? 'IMPROVING' : 'DECLINING') : 'STABLE'
    };
  }

  getKeywordCloud(hours = 24) {
    const cutoff = Date.now() - (hours * 3600000);
    const freqs = {};
    for (const e of this.entries.filter(e => e.timestamp > cutoff)) {
      const words = [...POSITIVE_WORDS, ...NEGATIVE_WORDS].filter(w => e.label);
      for (const w of words) { freqs[w] = (freqs[w] || 0) + 1; }
    }
    return Object.entries(freqs).sort((a, b) => b[1] - a[1]).slice(0, 20);
  }
}

const sentimentHistory = new SentimentHistory();

module.exports = {
  analyzeSentiment,
  calculateFearGreedIndex,
  SentimentHistory,
  sentimentHistory,
  POSITIVE_WORDS,
  NEGATIVE_WORDS
};
