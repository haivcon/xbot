/**
 * Technical Analysis Signal Generators
 * Adapted from hummingbot's directional trading controllers:
 * - Bollinger Bands (bollinger_v1.py)
 * - MACD + Bollinger Bands (macd_bb_v1.py)
 * - SuperTrend (supertrend_v1.py)
 *
 * Uses OKX OnchainOS candle API for OHLCV data.
 */
const logger = require('../core/logger');
const log = logger.child('TechSignals');

// Signal result cache (chainIndex:tokenAddress -> { signals, timestamp })
const signalCache = new Map();
const SIGNAL_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// ═══════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════

/** Simple Moving Average */
function sma(values, period) {
    if (values.length < period) return [];
    const result = [];
    for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        result.push(sum / period);
    }
    return result;
}

/** Exponential Moving Average */
function ema(values, period) {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    const result = [];
    // Start with SMA of first 'period' values
    let prev = 0;
    for (let i = 0; i < period; i++) prev += values[i];
    prev /= period;
    result.push(prev);
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        result.push(prev);
    }
    return result;
}

/** Standard Deviation */
function stdDev(values, period) {
    if (values.length < period) return [];
    const result = [];
    for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        const mean = sum / period;
        let variance = 0;
        for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
        result.push(Math.sqrt(variance / period));
    }
    return result;
}

/** True Range (for SuperTrend ATR) */
function trueRange(highs, lows, closes) {
    const tr = [];
    for (let i = 0; i < highs.length; i++) {
        if (i === 0) {
            tr.push(highs[i] - lows[i]);
        } else {
            tr.push(Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            ));
        }
    }
    return tr;
}

/** Average True Range using EMA */
function atr(highs, lows, closes, period) {
    const tr = trueRange(highs, lows, closes);
    return ema(tr, period);
}

// ═══════════════════════════════════════════════
// CANDLE DATA FETCHER
// ═══════════════════════════════════════════════

/**
 * Fetch OHLCV candles from OKX API
 * Returns: [{ ts, open, high, low, close, volume }, ...]
 */
async function fetchCandles(chainIndex, tokenAddress, bar = '1H', limit = 100) {
    try {
        const onchainos = require('../services/onchainos');
        const data = await onchainos.getMarketCandles(chainIndex, tokenAddress, { bar, limit });
        if (!data || !Array.isArray(data)) return [];

        // OKX returns: [[ts, open, high, low, close, volume], ...]
        // Sorted from newest to oldest — reverse for chrono order
        const candles = data
            .map(c => {
                const arr = Array.isArray(c) ? c : [c.ts, c.open, c.high, c.low, c.close, c.volume || c.vol];
                return {
                    ts: Number(arr[0]),
                    open: Number(arr[1]),
                    high: Number(arr[2]),
                    low: Number(arr[3]),
                    close: Number(arr[4]),
                    volume: Number(arr[5] || 0)
                };
            })
            .filter(c => c.close > 0)
            .reverse(); // chronological order (oldest first)

        return candles;
    } catch (err) {
        log.warn(`Candle fetch failed (${chainIndex}/${tokenAddress}):`, err.message || err.msg);
        return [];
    }
}

// ═══════════════════════════════════════════════
// SIGNAL: BOLLINGER BANDS
// Adapted from hummingbot bollinger_v1.py
// ═══════════════════════════════════════════════

/**
 * Bollinger Bands signal generator
 * - Buy: BBP < 0 (price below lower band)
 * - Sell: BBP > 1 (price above upper band)
 * - Neutral: 0 <= BBP <= 1
 *
 * @param {object} config
 * @param {number} config.bbLength - BB period (default: 20)
 * @param {number} config.bbStd - Standard deviation multiplier (default: 2.0)
 */
function bollingerSignal(candles, config = {}) {
    const bbLength = config.bbLength || 20;
    const bbStd = config.bbStd || 2.0;
    const closes = candles.map(c => c.close);

    if (closes.length < bbLength + 5) return null;

    const smaArr = sma(closes, bbLength);
    const stdArr = stdDev(closes, bbLength);

    const lastIdx = smaArr.length - 1;
    const mid = smaArr[lastIdx];
    const std = stdArr[lastIdx];
    const upper = mid + bbStd * std;
    const lower = mid - bbStd * std;
    const lastClose = closes[closes.length - 1];

    // Bollinger Band Percentage (BBP)
    const bbp = std > 0 ? (lastClose - lower) / (upper - lower) : 0.5;

    let signal = 0; // -1 = sell, 0 = neutral, 1 = buy
    let strength = 0;

    if (bbp < 0) {
        signal = 1; // Buy — price below lower band
        strength = Math.min(100, Math.abs(bbp) * 50);
    } else if (bbp > 1) {
        signal = -1; // Sell — price above upper band
        strength = Math.min(100, (bbp - 1) * 50);
    }

    return {
        type: 'bollinger',
        label: '📊 Bollinger Bands',
        signal,
        strength: Math.round(strength),
        bbp: Number(bbp.toFixed(4)),
        upper: Number(upper.toPrecision(6)),
        lower: Number(lower.toPrecision(6)),
        mid: Number(mid.toPrecision(6)),
        reason: signal === 1
            ? `Price below lower BB (BBP: ${bbp.toFixed(2)})`
            : signal === -1
                ? `Price above upper BB (BBP: ${bbp.toFixed(2)})`
                : `Price within bands (BBP: ${bbp.toFixed(2)})`
    };
}

// ═══════════════════════════════════════════════
// SIGNAL: MACD + BOLLINGER BANDS COMBO
// Adapted from hummingbot macd_bb_v1.py
// ═══════════════════════════════════════════════

/**
 * MACD + Bollinger Bands combo signal
 * - Buy: BBP < threshold AND MACD histogram > 0 AND MACD < 0
 * - Sell: BBP > (1-threshold) AND MACD histogram < 0 AND MACD > 0
 *
 * @param {object} config
 * @param {number} config.bbLength - 20
 * @param {number} config.bbStd - 2.0
 * @param {number} config.macdFast - 12
 * @param {number} config.macdSlow - 26
 * @param {number} config.macdSignal - 9
 * @param {number} config.bbThreshold - 0.2 (lower quintile)
 */
function macdBBSignal(candles, config = {}) {
    const bbLength = config.bbLength || 20;
    const bbStd = config.bbStd || 2.0;
    const macdFast = config.macdFast || 12;
    const macdSlow = config.macdSlow || 26;
    const macdSignalPeriod = config.macdSignal || 9;
    const bbThreshold = config.bbThreshold || 0.2;

    const closes = candles.map(c => c.close);
    const minLength = Math.max(bbLength, macdSlow + macdSignalPeriod) + 5;
    if (closes.length < minLength) return null;

    // Calculate Bollinger
    const smaArr = sma(closes, bbLength);
    const stdArr = stdDev(closes, bbLength);
    const lastSmaIdx = smaArr.length - 1;
    const mid = smaArr[lastSmaIdx];
    const std = stdArr[lastSmaIdx];
    const upper = mid + bbStd * std;
    const lower = mid - bbStd * std;
    const lastClose = closes[closes.length - 1];
    const bbp = std > 0 ? (lastClose - lower) / (upper - lower) : 0.5;

    // Calculate MACD
    const emaFast = ema(closes, macdFast);
    const emaSlow = ema(closes, macdSlow);

    // Align arrays — EMA fast starts at index (macdFast-1), slow at (macdSlow-1)
    const offset = macdSlow - macdFast;
    const macdLine = [];
    for (let i = 0; i < emaSlow.length; i++) {
        macdLine.push(emaFast[i + offset] - emaSlow[i]);
    }

    const signalLine = ema(macdLine, macdSignalPeriod);
    const histogramOffset = macdSignalPeriod - 1;
    const lastHistIdx = signalLine.length - 1;
    const lastMacdLine = macdLine[macdLine.length - 1];
    const histogram = lastHistIdx >= 0 ? macdLine[histogramOffset + lastHistIdx] - signalLine[lastHistIdx] : 0;

    let signal = 0;
    let strength = 0;

    // Buy: BBP < threshold AND histogram > 0 AND MACD < 0
    if (bbp < bbThreshold && histogram > 0 && lastMacdLine < 0) {
        signal = 1;
        strength = Math.min(100, (bbThreshold - bbp) * 200 + Math.abs(histogram) * 10000);
    }
    // Sell: BBP > (1-threshold) AND histogram < 0 AND MACD > 0
    else if (bbp > (1 - bbThreshold) && histogram < 0 && lastMacdLine > 0) {
        signal = -1;
        strength = Math.min(100, (bbp - (1 - bbThreshold)) * 200 + Math.abs(histogram) * 10000);
    }

    return {
        type: 'macd_bb',
        label: '📈 MACD+BB',
        signal,
        strength: Math.round(strength),
        bbp: Number(bbp.toFixed(4)),
        macd: Number(lastMacdLine.toPrecision(4)),
        histogram: Number(histogram.toPrecision(4)),
        reason: signal === 1
            ? `Buy zone: BBP ${bbp.toFixed(2)} < ${bbThreshold}, MACD hist positive`
            : signal === -1
                ? `Sell zone: BBP ${bbp.toFixed(2)} > ${1 - bbThreshold}, MACD hist negative`
                : `No clear signal (BBP: ${bbp.toFixed(2)}, MACD: ${lastMacdLine.toPrecision(3)})`
    };
}

// ═══════════════════════════════════════════════
// SIGNAL: SUPERTREND
// Adapted from hummingbot supertrend_v1.py
// ═══════════════════════════════════════════════

/**
 * SuperTrend signal
 * - Buy: price above SuperTrend (uptrend) and close to trend line
 * - Sell: price below SuperTrend (downtrend) and close to trend line
 *
 * @param {object} config
 * @param {number} config.atrLength - ATR period (default: 14)
 * @param {number} config.atrMultiplier - Multiplier (default: 3.0)
 * @param {number} config.distanceThreshold - Max distance % to trigger signal (default: 5)
 */
function superTrendSignal(candles, config = {}) {
    const atrLength = config.atrLength || 14;
    const atrMultiplier = config.atrMultiplier || 3.0;
    const distanceThreshold = config.distanceThreshold || 5;

    if (candles.length < atrLength + 5) return null;

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    // Calculate ATR
    const atrValues = atr(highs, lows, closes, atrLength);
    if (atrValues.length === 0) return null;

    // SuperTrend calculation
    const offset = candles.length - atrValues.length;
    let superTrend = 0;
    let direction = 1; // 1 = uptrend, -1 = downtrend
    let upperBand, lowerBand, prevUpper = Infinity, prevLower = -Infinity;

    for (let i = 0; i < atrValues.length; i++) {
        const idx = i + offset;
        const hl2 = (highs[idx] + lows[idx]) / 2;
        upperBand = hl2 + atrMultiplier * atrValues[i];
        lowerBand = hl2 - atrMultiplier * atrValues[i];

        // Ratchet bands
        if (i > 0) {
            if (lowerBand > prevLower || closes[idx - 1] < prevLower) {
                // keep lowerBand
            } else {
                lowerBand = prevLower;
            }
            if (upperBand < prevUpper || closes[idx - 1] > prevUpper) {
                // keep upperBand
            } else {
                upperBand = prevUpper;
            }
        }

        // Direction
        if (i === 0) {
            direction = closes[idx] > upperBand ? 1 : -1;
        } else {
            if (direction === -1 && closes[idx] > prevUpper) direction = 1;
            else if (direction === 1 && closes[idx] < prevLower) direction = -1;
        }

        superTrend = direction === 1 ? lowerBand : upperBand;
        prevUpper = upperBand;
        prevLower = lowerBand;
    }

    const lastClose = closes[closes.length - 1];
    const distancePct = superTrend > 0 ? Math.abs((lastClose - superTrend) / superTrend) * 100 : 0;

    let signal = 0;
    let strength = 0;

    // Buy when uptrend and price is close to the SuperTrend line
    if (direction === 1 && distancePct <= distanceThreshold) {
        signal = 1;
        strength = Math.min(100, (distanceThreshold - distancePct) / distanceThreshold * 80);
    }
    // Sell when downtrend and price is close to the SuperTrend line
    else if (direction === -1 && distancePct <= distanceThreshold) {
        signal = -1;
        strength = Math.min(100, (distanceThreshold - distancePct) / distanceThreshold * 80);
    }

    return {
        type: 'supertrend',
        label: '🔄 SuperTrend',
        signal,
        strength: Math.round(strength),
        direction, // 1 = uptrend, -1 = downtrend
        superTrend: Number(superTrend.toPrecision(6)),
        distancePct: Number(distancePct.toFixed(2)),
        reason: direction === 1
            ? `Uptrend — price ${distancePct.toFixed(1)}% from SuperTrend`
            : `Downtrend — price ${distancePct.toFixed(1)}% from SuperTrend`
    };
}

// ═══════════════════════════════════════════════
// COMBINED SIGNAL SCANNER
// ═══════════════════════════════════════════════

/**
 * Run all technical signals for a token
 * Returns combined score and individual signals
 */
async function analyzeToken(chainIndex, tokenAddress, bar = '1H') {
    const cacheKey = `${chainIndex}:${tokenAddress}:${bar}`;
    const cached = signalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SIGNAL_CACHE_TTL) {
        return cached.result;
    }

    const candles = await fetchCandles(chainIndex, tokenAddress, bar, 100);
    if (!candles || candles.length < 30) {
        return { score: 0, signals: [], error: 'Insufficient candle data' };
    }

    const signals = [];
    const bb = bollingerSignal(candles);
    if (bb) signals.push(bb);

    const macdBB = macdBBSignal(candles);
    if (macdBB) signals.push(macdBB);

    const st = superTrendSignal(candles);
    if (st) signals.push(st);

    // Combined score: weighted average of buy signals
    let totalWeight = 0;
    let weightedScore = 0;

    for (const s of signals) {
        const weight = s.type === 'macd_bb' ? 2 : 1; // MACD+BB gets double weight (most reliable combo)
        if (s.signal === 1) {
            weightedScore += s.strength * weight;
            totalWeight += 100 * weight;
        } else if (s.signal === -1) {
            weightedScore -= s.strength * weight;
            totalWeight += 100 * weight;
        } else {
            totalWeight += 100 * weight;
        }
    }

    // Normalize to 0-100 scale where 50 = neutral, >50 = buy signal, <50 = sell signal
    const normalizedScore = totalWeight > 0 ? 50 + (weightedScore / totalWeight) * 50 : 50;
    const overallSignal = normalizedScore >= 60 ? 1 : normalizedScore <= 40 ? -1 : 0;

    const result = {
        score: Math.round(normalizedScore),
        signal: overallSignal,
        buySignals: signals.filter(s => s.signal === 1).length,
        sellSignals: signals.filter(s => s.signal === -1).length,
        signals,
        candleCount: candles.length,
        bar,
        lastPrice: candles[candles.length - 1]?.close || 0
    };

    signalCache.set(cacheKey, { result, timestamp: Date.now() });

    // Cleanup old cache entries
    for (const [k, v] of signalCache.entries()) {
        if (Date.now() - v.timestamp > SIGNAL_CACHE_TTL * 3) signalCache.delete(k);
    }

    return result;
}

/**
 * Get a text summary of technical signals for a token
 * Used by chatRoutes for dashboard display
 */
async function getSignalSummary(chainIndex, tokenAddress) {
    const analysis = await analyzeToken(chainIndex, tokenAddress, '1H');
    if (analysis.error) return { text: analysis.error, score: 0 };

    const parts = [];
    for (const s of analysis.signals) {
        const icon = s.signal === 1 ? '🟢' : s.signal === -1 ? '🔴' : '⚪';
        parts.push(`${icon} ${s.label}: ${s.reason} (${s.strength}%)`);
    }

    return {
        text: parts.join('\n'),
        score: analysis.score,
        signal: analysis.signal,
        signals: analysis.signals
    };
}

module.exports = {
    // Individual signal generators (also exported for testing)
    bollingerSignal,
    macdBBSignal,
    superTrendSignal,
    // Main API
    analyzeToken,
    getSignalSummary,
    fetchCandles,
    // Math helpers (exported for testing)
    sma, ema, stdDev, atr,
};
