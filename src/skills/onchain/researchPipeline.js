/**
 * AI Research Pipeline — Deep token analysis orchestrator
 * Idea #6: Calls 8+ APIs in parallel, then AI synthesizes a verdict.
 */
const onchainos = require('../../services/onchainos');
const logger = require('../../core/logger');
const log = logger.child('Research');

/**
 * Run a deep research pipeline for a token.
 * @param {string} chainIndex - Chain ID
 * @param {string} tokenAddress - Token contract address (already resolved)
 * @param {object} [options] - { lang: 'en' }
 * @returns {object} Structured research report
 */
async function deepResearch(chainIndex, tokenAddress, options = {}) {
    const lang = options.lang || 'en';
    const startTime = Date.now();

    // ── Step 1: Parallel data collection ─────────────────────
    const [
        priceInfoRes,
        basicInfoRes,
        holdersRes,
        candlesRes,
        signalsRes,
        securityRes,
        auditRes,
        liquidityRes,
        smartTradesRes,
        recentTradesRes
    ] = await Promise.allSettled([
        onchainos.getTokenPriceInfo([{ chainIndex, tokenContractAddress: tokenAddress }]),
        onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: tokenAddress }]),
        onchainos.getTokenHolder(chainIndex, tokenAddress),
        onchainos.getMarketCandles(chainIndex, tokenAddress, { bar: '1H', limit: 48 }),
        onchainos.getSignalList(chainIndex, { tokenContractAddress: tokenAddress }),
        typeof onchainos.getTokenSecurity === 'function'
            ? onchainos.getTokenSecurity(chainIndex, tokenAddress) : Promise.resolve(null),
        typeof onchainos.getMemePumpTokenDetails === 'function'
            ? onchainos.getMemePumpTokenDetails(chainIndex, tokenAddress).catch(() => null) : Promise.resolve(null),
        typeof onchainos.getTokenLiquidity === 'function'
            ? onchainos.getTokenLiquidity(chainIndex, tokenAddress).catch(() => null) : Promise.resolve(null),
        typeof onchainos.getSmartTrades === 'function'
            ? onchainos.getSmartTrades(chainIndex, tokenAddress, { limit: '20' }).catch(() => null) : Promise.resolve(null),
        onchainos.getMarketTrades(chainIndex, tokenAddress, { limit: '20' }).catch(() => null)
    ]);

    const ok = (r) => r.status === 'fulfilled' ? r.value : null;
    const priceInfo = ok(priceInfoRes);
    const basicInfo = ok(basicInfoRes);
    const holders = ok(holdersRes);
    const candles = ok(candlesRes);
    const signals = ok(signalsRes);
    const security = ok(securityRes);
    const audit = ok(auditRes);
    const liquidity = ok(liquidityRes);
    const smartTrades = ok(smartTradesRes);
    const recentTrades = ok(recentTradesRes);

    // ── Step 2: Extract metrics ──────────────────────────────
    const price = extractPrice(priceInfo);
    const marketData = extractMarketData(priceInfo, basicInfo);
    const holderMetrics = extractHolderMetrics(holders);
    const technicalMetrics = extractTechnicalMetrics(candles);
    const signalMetrics = extractSignalMetrics(signals);
    const safetyMetrics = extractSafetyMetrics(security, audit);
    const liquidityMetrics = extractLiquidityMetrics(liquidity);
    const tradeActivity = extractTradeActivity(smartTrades, recentTrades);

    // ── Step 3: Calculate scores ─────────────────────────────
    const technicalScore = calculateTechnicalScore(technicalMetrics, marketData);
    const safetyScore = calculateSafetyScore(safetyMetrics, holderMetrics);
    const whaleInterest = calculateWhaleInterest(signalMetrics, tradeActivity);
    const overallScore = Math.round(technicalScore * 0.3 + safetyScore * 0.4 + (whaleInterest === 'HIGH' ? 80 : whaleInterest === 'MEDIUM' ? 50 : 20) * 0.3);

    // ── Step 4: Generate verdict ─────────────────────────────
    const verdict = generateVerdict(overallScore, safetyScore, technicalScore, whaleInterest, lang);

    const report = {
        symbol: marketData.symbol || '?',
        name: marketData.name || '?',
        chainIndex,
        tokenAddress,
        price,
        marketData,
        holderMetrics,
        technicalMetrics,
        signalMetrics,
        safetyMetrics,
        liquidityMetrics,
        tradeActivity,
        scores: { technical: technicalScore, safety: safetyScore, whaleInterest, overall: overallScore },
        verdict,
        elapsedMs: Date.now() - startTime
    };

    return report;
}

// ═══════════════════════════════════════════════════════
// Metric Extractors
// ═══════════════════════════════════════════════════════

function extractPrice(priceInfo) {
    if (!priceInfo || !Array.isArray(priceInfo) || priceInfo.length === 0) return 0;
    return Number(priceInfo[0].price || 0);
}

function extractMarketData(priceInfo, basicInfo) {
    const pi = Array.isArray(priceInfo) && priceInfo[0] ? priceInfo[0] : {};
    const bi = Array.isArray(basicInfo) && basicInfo[0] ? basicInfo[0] : {};
    return {
        symbol: pi.tokenSymbol || bi.tokenSymbol || '?',
        name: pi.tokenFullName || bi.tokenName || '?',
        price: Number(pi.price || 0),
        marketCap: Number(pi.marketCap || bi.marketCap || 0),
        volume24h: Number(pi.volume24h || bi.volume24h || 0),
        change24h: Number(pi.priceChange24h || pi.change24h || 0),
        liquidity: Number(pi.liquidity || bi.liquidity || 0),
        circulatingSupply: Number(pi.circSupply || bi.circSupply || 0)
    };
}

function extractHolderMetrics(holders) {
    if (!holders) return { totalHolders: 0, top10Pct: 0, top1Pct: 0 };
    const holderList = Array.isArray(holders) ? holders : (holders.holderList || holders.holders || []);
    const totalHolders = holders.holderCount || holderList.length || 0;
    let top10Pct = 0, top1Pct = 0;
    if (holderList.length > 0) {
        top1Pct = Number(holderList[0]?.holdingPercent || holderList[0]?.percentage || 0) * 100;
        top10Pct = holderList.slice(0, 10).reduce((sum, h) => sum + Number(h.holdingPercent || h.percentage || 0) * 100, 0);
    }
    return { totalHolders, top10Pct: Math.round(top10Pct * 100) / 100, top1Pct: Math.round(top1Pct * 100) / 100 };
}

function extractTechnicalMetrics(candles) {
    if (!candles || !Array.isArray(candles) || candles.length < 3) {
        return { trend: 'UNKNOWN', rsi: 50, change1h: 0, change24h: 0, volatility: 0 };
    }
    const closes = candles.map(c => Number(c.close || c[4] || 0)).filter(v => v > 0);
    if (closes.length < 3) return { trend: 'UNKNOWN', rsi: 50, change1h: 0, change24h: 0, volatility: 0 };

    const latest = closes[closes.length - 1];
    const prev1h = closes[closes.length - 2] || latest;
    const prev24h = closes[0] || latest;

    const change1h = ((latest - prev1h) / prev1h) * 100;
    const change24h = ((latest - prev24h) / prev24h) * 100;

    // Simple RSI calculation (14-period)
    const rsi = calculateRSI(closes, 14);

    // Volatility (std deviation of returns)
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;

    const trend = change24h > 5 ? 'BULLISH' : change24h < -5 ? 'BEARISH' : 'SIDEWAYS';

    return { trend, rsi: Math.round(rsi), change1h: Math.round(change1h * 100) / 100, change24h: Math.round(change24h * 100) / 100, volatility: Math.round(volatility * 100) / 100 };
}

function calculateRSI(closes, period) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    // W2 fix: if no price movement at all, return neutral RSI
    if (gains === 0 && losses === 0) return 50;
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function extractSignalMetrics(signals) {
    if (!signals || !Array.isArray(signals) || signals.length === 0) {
        return { smartMoneyCount: 0, whaleCount: 0, kolCount: 0, totalUsd: 0, direction: 'NONE' };
    }
    let smartMoneyCount = 0, whaleCount = 0, kolCount = 0, totalUsd = 0;
    for (const sig of signals) {
        const type = String(sig.walletType || sig.type || '');
        const amount = Number(sig.amountUsd || sig.amount || 0);
        if (type === '1' || type === 'smart_money') smartMoneyCount++;
        else if (type === '3' || type === 'whale') whaleCount++;
        else if (type === '2' || type === 'kol') kolCount++;
        totalUsd += amount;
    }
    const direction = (smartMoneyCount + whaleCount) > 2 ? 'ACCUMULATING' : 'NONE';
    return { smartMoneyCount, whaleCount, kolCount, totalUsd, direction };
}

function extractSafetyMetrics(security, audit) {
    const result = { isHoneypot: false, canSell: true, buyTax: 0, sellTax: 0, isOpenSource: false, hasProxy: false, rugRisk: 'LOW', devRugCount: 0, lpBurnPct: 0 };

    if (security && Array.isArray(security) && security.length > 0) {
        const sec = security[0];
        result.isHoneypot = sec.isHoneypot === '1' || sec.is_honeypot === '1';
        result.canSell = !(sec.cannotSell === '1' || sec.cannot_sell === '1');
        result.buyTax = Number(sec.buyTax || sec.buy_tax || 0) * 100;
        result.sellTax = Number(sec.sellTax || sec.sell_tax || 0) * 100;
        result.isOpenSource = sec.isOpenSource === '1' || sec.is_open_source === '1';
        result.hasProxy = sec.isProxy === '1' || sec.is_proxy === '1';
    }

    if (audit && typeof audit === 'object') {
        const a = Array.isArray(audit) ? audit[0] : audit;
        if (a) {
            result.devRugCount = Number(a.rugPullCount || a.rugs || 0);
            result.lpBurnPct = Number(a.lpBurnPercent || a.lpBurn || 0);
            if (result.devRugCount > 3) result.rugRisk = 'HIGH';
            else if (result.devRugCount > 0) result.rugRisk = 'MEDIUM';
        }
    }

    return result;
}

function extractLiquidityMetrics(liquidity) {
    if (!liquidity || !Array.isArray(liquidity) || liquidity.length === 0) {
        return { totalTvl: 0, poolCount: 0, topDex: 'N/A' };
    }
    const totalTvl = liquidity.reduce((sum, p) => sum + Number(p.liquidityUsd || p.tvl || 0), 0);
    return { totalTvl, poolCount: liquidity.length, topDex: liquidity[0]?.dexName || 'N/A' };
}

function extractTradeActivity(smartTrades, recentTrades) {
    const smart = Array.isArray(smartTrades) ? smartTrades : [];
    const recent = Array.isArray(recentTrades) ? recentTrades : [];
    const buys = recent.filter(t => t.type === 'buy' || t.side === 'buy').length;
    const sells = recent.filter(t => t.type === 'sell' || t.side === 'sell').length;
    return {
        smartTradeCount: smart.length,
        recentBuys: buys,
        recentSells: sells,
        buyRatio: buys + sells > 0 ? Math.round(buys / (buys + sells) * 100) : 50
    };
}

// ═══════════════════════════════════════════════════════
// Score Calculators
// ═══════════════════════════════════════════════════════

function calculateTechnicalScore(tech, market) {
    let score = 50; // Start neutral
    // RSI
    if (tech.rsi > 30 && tech.rsi < 70) score += 10; // Healthy range
    else if (tech.rsi <= 30) score += 5; // Oversold (potential buy)
    else score -= 10; // Overbought
    // Trend
    if (tech.trend === 'BULLISH') score += 15;
    else if (tech.trend === 'BEARISH') score -= 15;
    // Volume
    if (market.volume24h > 100000) score += 10;
    else if (market.volume24h > 10000) score += 5;
    // Liquidity
    if (market.liquidity > 100000) score += 10;
    else if (market.liquidity < 10000) score -= 15;
    // Volatility penalty
    if (tech.volatility > 20) score -= 10;

    return Math.max(0, Math.min(100, score));
}

function calculateSafetyScore(safety, holder) {
    let score = 100;
    // W3 fix: Reduce honeypot penalty for very new tokens (GoPlus false positives)
    // If no holder data available, the token is likely very new
    const isVeryNewToken = holder.totalHolders < 10;
    if (safety.isHoneypot) score -= isVeryNewToken ? 40 : 80; // Reduced for new tokens
    if (!safety.canSell) score -= isVeryNewToken ? 30 : 60;
    if (safety.buyTax > 10) score -= 20;
    if (safety.sellTax > 10) score -= 20;
    if (safety.hasProxy) score -= 10;
    if (!safety.isOpenSource) score -= 5;
    if (safety.rugRisk === 'HIGH') score -= 40;
    else if (safety.rugRisk === 'MEDIUM') score -= 15;
    // Holder concentration
    if (holder.top10Pct > 80) score -= 20;
    else if (holder.top10Pct > 60) score -= 10;
    if (holder.totalHolders < 50 && holder.totalHolders > 0) score -= 10;

    return Math.max(0, Math.min(100, score));
}

function calculateWhaleInterest(signalMetrics, tradeActivity) {
    const total = signalMetrics.smartMoneyCount + signalMetrics.whaleCount;
    if (total >= 5 || signalMetrics.totalUsd > 100000) return 'HIGH';
    if (total >= 2 || signalMetrics.totalUsd > 10000) return 'MEDIUM';
    return 'LOW';
}

// ═══════════════════════════════════════════════════════
// Verdict Generator
// ═══════════════════════════════════════════════════════

function generateVerdict(overall, safety, technical, whaleInterest, lang) {
    const labels = {
        en: { strongBuy: '🟢 STRONG BUY', buy: '🟢 BUY', hold: '🟡 HOLD / WATCH', avoid: '🔴 AVOID', scam: '🚫 SCAM / DANGEROUS' },
        vi: { strongBuy: '🟢 NÊN MUA MẠNH', buy: '🟢 NÊN MUA', hold: '🟡 THEO DÕI', avoid: '🔴 NÊN TRÁNH', scam: '🚫 SCAM / NGUY HIỂM' },
        zh: { strongBuy: '🟢 强烈买入', buy: '🟢 建议买入', hold: '🟡 观望', avoid: '🔴 建议回避', scam: '🚫 诈骗/危险' },
        ko: { strongBuy: '🟢 강력 매수', buy: '🟢 매수', hold: '🟡 관망', avoid: '🔴 회피', scam: '🚫 스캠/위험' }
    };
    const l = labels[lang] || labels.en;

    if (safety < 20) return l.scam;
    if (safety < 40) return l.avoid;
    if (overall >= 75 && whaleInterest === 'HIGH') return l.strongBuy;
    if (overall >= 60) return l.buy;
    if (overall >= 40) return l.hold;
    return l.avoid;
}

// ═══════════════════════════════════════════════════════
// Format for Telegram
// ═══════════════════════════════════════════════════════

function formatResearchReport(report, lang = 'en') {
    const { symbol, scores, verdict, price, marketData, holderMetrics, technicalMetrics, signalMetrics, safetyMetrics, liquidityMetrics, tradeActivity, elapsedMs } = report;
    const p = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price.toFixed(4);
    const fmtNum = (n) => n > 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n > 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n.toFixed(0);

    const headers = {
        en: 'AI DEEP RESEARCH', vi: 'PHÂN TÍCH SÂU AI', zh: 'AI深度研究', ko: 'AI 심층 분석'
    };
    const techL = { en: 'Technical', vi: 'Kỹ thuật', zh: '技术面', ko: '기술적' };
    const safeL = { en: 'Safety', vi: 'An toàn', zh: '安全性', ko: '안전성' };
    const whaleL = { en: 'Whale Interest', vi: 'Cá voi', zh: '鲸鱼兴趣', ko: '고래 관심' };
    const overallL = { en: 'Overall', vi: 'Tổng', zh: '综合', ko: '종합' };
    const verdictL = { en: 'AI Verdict', vi: 'Kết luận AI', zh: 'AI结论', ko: 'AI 결론' };
    const trendEmoji = { BULLISH: '📈', BEARISH: '📉', SIDEWAYS: '➡️', UNKNOWN: '❓' };
    const l = (obj) => obj[lang] || obj.en;

    const scoreBar = (score) => {
        const filled = Math.round(score / 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/100`;
    };

    let card = `🔬 <b>${l(headers)}: ${symbol}</b>\n━━━━━━━━━━━━━━━━━━\n`;
    card += `💰 <b>Price:</b> <code>$${p}</code>\n`;
    card += `📊 MCap: ${fmtNum(marketData.marketCap)} | Vol: ${fmtNum(marketData.volume24h)}\n`;
    card += `💧 Liq: ${fmtNum(marketData.liquidity)} | ${liquidityMetrics.poolCount} pools\n`;
    card += `👥 Holders: ${holderMetrics.totalHolders.toLocaleString()} | Top10: ${holderMetrics.top10Pct}%\n`;
    card += `\n`;

    // Technical
    card += `${trendEmoji[technicalMetrics.trend] || '❓'} <b>${l(techL)}:</b> ${scoreBar(scores.technical)}\n`;
    card += `   RSI: ${technicalMetrics.rsi} | 1h: ${technicalMetrics.change1h > 0 ? '+' : ''}${technicalMetrics.change1h}% | 24h: ${technicalMetrics.change24h > 0 ? '+' : ''}${technicalMetrics.change24h}%\n\n`;

    // Safety
    const safeIcon = scores.safety >= 70 ? '🟢' : scores.safety >= 40 ? '🟡' : '🔴';
    card += `${safeIcon} <b>${l(safeL)}:</b> ${scoreBar(scores.safety)}\n`;
    if (safetyMetrics.isHoneypot) card += `   🍯 HONEYPOT DETECTED!\n`;
    if (!safetyMetrics.canSell) card += `   ❌ Cannot sell!\n`;
    if (safetyMetrics.buyTax > 5) card += `   💸 Buy tax: ${safetyMetrics.buyTax.toFixed(1)}%\n`;
    if (safetyMetrics.sellTax > 5) card += `   💸 Sell tax: ${safetyMetrics.sellTax.toFixed(1)}%\n`;
    if (safetyMetrics.devRugCount > 0) card += `   ⚠️ Dev rug history: ${safetyMetrics.devRugCount} rugs\n`;
    card += `\n`;

    // Whale Interest
    const whaleIcon = scores.whaleInterest === 'HIGH' ? '🐋' : scores.whaleInterest === 'MEDIUM' ? '🐳' : '🐟';
    card += `${whaleIcon} <b>${l(whaleL)}:</b> ${scores.whaleInterest}\n`;
    if (signalMetrics.smartMoneyCount > 0) card += `   🧠 Smart Money: ${signalMetrics.smartMoneyCount} buys\n`;
    if (signalMetrics.whaleCount > 0) card += `   🐋 Whales: ${signalMetrics.whaleCount} buys\n`;
    if (signalMetrics.kolCount > 0) card += `   ⭐ KOLs: ${signalMetrics.kolCount} buys\n`;
    card += `   📊 Buy ratio: ${tradeActivity.buyRatio}%\n\n`;

    // Overall + Verdict
    card += `📊 <b>${l(overallL)}:</b> ${scoreBar(scores.overall)}\n`;
    card += `🎯 <b>${l(verdictL)}:</b> ${verdict}\n\n`;
    card += `<i>⏱️ ${(elapsedMs / 1000).toFixed(1)}s | 10 APIs analyzed</i>`;

    return card;
}

module.exports = { deepResearch, formatResearchReport };
