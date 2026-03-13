/**
 * Explorer Links & Formatting Utilities for On-chain Commands
 */

// ─── Chain Config ─────────────────────────────────────
const CHAIN_MAP = {
    '1':     { slug: 'eth',      name: 'Ethereum',  symbol: 'ETH' },
    '56':    { slug: 'bsc',      name: 'BSC',       symbol: 'BNB' },
    '137':   { slug: 'polygon',  name: 'Polygon',   symbol: 'MATIC' },
    '196':   { slug: 'xlayer',   name: 'X Layer',   symbol: 'OKB' },
    '42161': { slug: 'arbitrum', name: 'Arbitrum',  symbol: 'ETH' },
    '8453':  { slug: 'base',     name: 'Base',      symbol: 'ETH' },
    '501':   { slug: 'sol',      name: 'Solana',    symbol: 'SOL' },
};

const SUPPORTED_CHAINS = Object.entries(CHAIN_MAP).map(([id, c]) => ({ id, ...c }));

function chainInfo(chainIndex) {
    return CHAIN_MAP[String(chainIndex)] || { slug: 'eth', name: `Chain #${chainIndex}`, symbol: '?' };
}

// ─── OKLink Explorer URLs ─────────────────────────────
const OKLINK_BASE = 'https://www.oklink.com';

function explorerTokenUrl(chainIndex, address) {
    const { slug } = chainInfo(chainIndex);
    return `${OKLINK_BASE}/${slug}/token/${address}`;
}

function explorerTxUrl(chainIndex, txHash) {
    const { slug } = chainInfo(chainIndex);
    return `${OKLINK_BASE}/${slug}/tx/${txHash}`;
}

function explorerAddressUrl(chainIndex, address) {
    const { slug } = chainInfo(chainIndex);
    return `${OKLINK_BASE}/${slug}/address/${address}`;
}

// ─── Number Formatting ────────────────────────────────
function fmtNum(n) {
    const v = Number(n || 0);
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    if (v >= 1) return '$' + v.toFixed(2);
    return '$' + v.toFixed(0);
}

function fmtPrice(p) {
    const v = Number(p || 0);
    if (v === 0) return '$0';
    if (v < 0.00001) return '$' + v.toFixed(12);
    if (v < 0.001) return '$' + v.toFixed(8);
    if (v < 0.01) return '$' + v.toFixed(6);
    if (v < 1) return '$' + v.toFixed(4);
    return '$' + v.toFixed(2);
}

function fmtPercent(p) {
    const v = Number(p || 0);
    if (v >= 10000) return (v / 1000).toFixed(0) + 'K%';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K%';
    return v.toFixed(2) + '%';
}

function fmtCompact(n) {
    const v = Number(n || 0);
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
}

// ─── Progress Bar ─────────────────────────────────────
function progressBar(percent, length = 10) {
    const p = Math.max(0, Math.min(100, Number(percent || 0)));
    const filled = Math.round(p / 100 * length);
    return '▓'.repeat(filled) + '░'.repeat(length - filled) + ` ${p.toFixed(1)}%`;
}

// ─── Relative Time ────────────────────────────────────
function relativeTime(timestamp) {
    if (!timestamp) return '';
    const ms = Number(timestamp);
    const diff = Date.now() - ms;
    if (diff < 0) return 'just now';
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

// ─── Risk Score (from meme tags) ──────────────────────
function riskScore(tags) {
    if (!tags) return { level: 'unknown', icon: '❓', label: 'Unknown', score: -1 };
    const bundlers = Number(tags.bundlersPercent || 0);
    const insiders = Number(tags.insidersPercent || 0);
    const snipers = Number(tags.snipersPercent || 0);
    const freshWallets = Number(tags.freshWalletsPercent || 0);
    const top10 = Number(tags.top10HoldingsPercent || 0);
    const devHoldings = Number(tags.devHoldingsPercent || 0);
    const phishing = Number(tags.suspectedPhishingWalletPercent || 0);

    let score = 0;
    if (bundlers > 5) score += 3; else if (bundlers > 1) score += 1;
    if (insiders > 10) score += 3; else if (insiders > 3) score += 1;
    if (snipers > 15) score += 2; else if (snipers > 5) score += 1;
    if (freshWallets > 30) score += 2; else if (freshWallets > 15) score += 1;
    if (top10 > 50) score += 3; else if (top10 > 30) score += 1;
    if (devHoldings > 10) score += 2; else if (devHoldings > 3) score += 1;
    if (phishing > 0) score += 3;

    if (score >= 6) return { level: 'high', icon: '🔴', label: 'HIGH RISK', score };
    if (score >= 3) return { level: 'medium', icon: '🟡', label: 'CAUTION', score };
    return { level: 'low', icon: '🟢', label: 'LOW RISK', score };
}

function riskTagsText(tags) {
    if (!tags) return '';
    const lines = [];
    const b = Number(tags.bundlersPercent || 0);
    const i = Number(tags.insidersPercent || 0);
    const s = Number(tags.snipersPercent || 0);
    const f = Number(tags.freshWalletsPercent || 0);
    const t = Number(tags.top10HoldingsPercent || 0);
    const d = Number(tags.devHoldingsPercent || 0);
    const p = Number(tags.suspectedPhishingWalletPercent || 0);

    if (b > 0) lines.push(`🤖 Bundlers: ${b.toFixed(2)}%`);
    if (i > 0) lines.push(`👤 Insiders: ${i.toFixed(2)}%`);
    if (s > 0) lines.push(`🎯 Snipers: ${s.toFixed(2)}%`);
    if (f > 0) lines.push(`🆕 Fresh Wallets: ${f.toFixed(2)}%`);
    if (t > 0) lines.push(`🐋 Top 10: ${t.toFixed(2)}%`);
    if (d > 0) lines.push(`👨‍💻 Dev Hold: ${d.toFixed(2)}%`);
    if (p > 0) lines.push(`⚠️ Phishing: ${p.toFixed(2)}%`);
    return lines.join('\n');
}

// ─── Buy/Sell Ratio ───────────────────────────────────
function buySellRatio(buys, sells) {
    const b = Number(buys || 0);
    const s = Number(sells || 0);
    const total = b + s;
    if (total === 0) return '—';
    const bPct = ((b / total) * 100).toFixed(0);
    return `🟢${fmtCompact(b)} (${bPct}%) / 🔴${fmtCompact(s)}`;
}

// ─── Truncate Address ─────────────────────────────────
function shortAddr(addr, head = 6, tail = 4) {
    if (!addr || addr.length < head + tail + 3) return addr || '?';
    return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

module.exports = {
    CHAIN_MAP,
    SUPPORTED_CHAINS,
    chainInfo,
    explorerTokenUrl,
    explorerTxUrl,
    explorerAddressUrl,
    fmtNum,
    fmtPrice,
    fmtPercent,
    fmtCompact,
    progressBar,
    relativeTime,
    riskScore,
    riskTagsText,
    buySellRatio,
    shortAddr,
};
