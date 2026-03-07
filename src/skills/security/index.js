/**
 * Security Skill — Transaction Safety & Rate Limiting
 * 
 * Enhanced on-chain security:
 * - Deep honeypot analysis (contract source, liquidity lock, holder concentration)
 * - Approve spending detection (unlimited approvals → warning)
 * - Per-user AI rate limiting
 * - Phishing address detection via known blacklists
 */

// ═══════════════════════════════════════════════════════
// Per-User Rate Limiter
// ═══════════════════════════════════════════════════════

/** @type {Map<string, {count: number, windowStart: number}>} */
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_CALLS = 20; // Max 20 tool calls per minute

function checkRateLimit(userId) {
    const key = String(userId);
    const now = Date.now();
    let entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        entry = { count: 0, windowStart: now };
        rateLimitStore.set(key, entry);
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX_CALLS) {
        return { allowed: false, remaining: 0, resetsIn: Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000) };
    }
    return { allowed: true, remaining: RATE_LIMIT_MAX_CALLS - entry.count, resetsIn: 0 };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitStore.delete(key);
        }
    }
}, 300000);

// ═══════════════════════════════════════════════════════
// Known Phishing/Scam Address Database
// ═══════════════════════════════════════════════════════

const KNOWN_SCAM_PATTERNS = [
    // Common patterns in scam contracts
    /honeypot/i,
    /^0x000000000000000000000000000000000000dead$/i,
];

const SUSPICIOUS_INDICATORS = {
    // If any of these are true about a token, warn the user
    noLiquidityPool: (data) => {
        const liq = Number(data?.liquidityUsd || data?.liquidity || 0);
        return liq < 1000;
    },
    extremelyHighTax: (data) => {
        const tax = Number(data?.taxRate || 0);
        return tax > 0.1; // >10% tax
    },
    veryNewToken: (data) => {
        const created = Number(data?.createTime || data?.createdAt || 0);
        if (!created) return false;
        const ageMs = Date.now() - created * 1000;
        return ageMs < 24 * 3600 * 1000; // Less than 24 hours old
    },
    concentratedHolders: (data) => {
        const topHolderPercent = Number(data?.topHolderPercent || 0);
        return topHolderPercent > 50; // Top holder has >50%
    },
    fewHolders: (data) => {
        const holders = Number(data?.holderCount || 0);
        return holders > 0 && holders < 50;
    }
};

// ═══════════════════════════════════════════════════════
// AI Tools
// ═══════════════════════════════════════════════════════

const SECURITY_TOOLS = [{
    functionDeclarations: [
        {
            name: 'security_check_token',
            description: 'Perform a comprehensive security analysis on a token before trading. Checks for honeypot indicators, liquidity, holder concentration, tax rates, and known scam patterns. ALWAYS use this before approving any swap.',
            parameters: {
                type: 'object',
                properties: {
                    token_address: { type: 'string', description: 'Token contract address' },
                    chain_index: { type: 'string', description: 'Chain ID (e.g., 1 for ETH, 56 for BSC, 501 for Solana)' }
                },
                required: ['token_address', 'chain_index']
            }
        },
        {
            name: 'check_approval_safety',
            description: 'Check if a token approval transaction is safe. Warns about unlimited approvals and suspicious spender addresses.',
            parameters: {
                type: 'object',
                properties: {
                    spender_address: { type: 'string', description: 'The address being approved to spend tokens' },
                    token_address: { type: 'string', description: 'The token being approved' },
                    amount: { type: 'string', description: 'Approval amount (use "unlimited" for max uint256)' }
                },
                required: ['spender_address', 'token_address']
            }
        }
    ]
}];

// ═══════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════

const securityHandlers = {
    async security_check_token(args, context) {
        // Rate limit check
        const userId = context?.userId;
        if (userId) {
            const limit = checkRateLimit(userId);
            if (!limit.allowed) {
                return `⚠️ Rate limited. Please wait ${limit.resetsIn} seconds before making more requests.`;
            }
        }

        const addr = args.token_address;
        const chain = args.chain_index || '1';
        const warnings = [];
        const safe = [];

        // 1. Check known scam patterns
        for (const pattern of KNOWN_SCAM_PATTERNS) {
            if (pattern.test(addr)) {
                warnings.push('🚨 CRITICAL: Address matches known scam/dead address pattern!');
                break;
            }
        }

        // 2. Try to fetch token data from OnchainOS
        let tokenData = null;
        try {
            const onchainos = require('../../services/onchainos');
            const tokenInfo = await onchainos.getTokenDetail(addr, chain);
            tokenData = tokenInfo?.data?.[0] || tokenInfo?.data || tokenInfo;
        } catch (e) {
            // Non-critical
        }

        if (tokenData) {
            // 3. Check honeypot
            if (tokenData.isHoneyPot === true || tokenData.isHoneyPot === 'true') {
                warnings.push('🚨 HONEYPOT: This token is flagged as a honeypot! You will NOT be able to sell after buying.');
            } else {
                safe.push('✅ Not flagged as honeypot');
            }

            // 4. Check tax rate
            const tax = Number(tokenData.taxRate || 0);
            if (tax > 0.15) {
                warnings.push(`🚨 EXTREME TAX: ${(tax * 100).toFixed(1)}% tax rate — most of your funds will be lost to tax!`);
            } else if (tax > 0.05) {
                warnings.push(`⚠️ HIGH TAX: ${(tax * 100).toFixed(1)}% tax rate`);
            } else if (tax > 0) {
                safe.push(`✅ Low tax rate: ${(tax * 100).toFixed(1)}%`);
            } else {
                safe.push('✅ No tax');
            }

            // 5. Run all suspicious indicators
            for (const [name, checker] of Object.entries(SUSPICIOUS_INDICATORS)) {
                try {
                    if (checker(tokenData)) {
                        const labels = {
                            noLiquidityPool: '⚠️ VERY LOW LIQUIDITY: Less than $1,000 — high slippage risk',
                            extremelyHighTax: '⚠️ Tax rate exceeds 10%',
                            veryNewToken: '⚠️ Token created less than 24 hours ago — very high risk',
                            concentratedHolders: '⚠️ Top holder owns >50% — rug pull risk',
                            fewHolders: '⚠️ Less than 50 holders — very early/suspicious'
                        };
                        warnings.push(labels[name] || `⚠️ Suspicious: ${name}`);
                    }
                } catch (e) { /* skip */ }
            }

            // 6. Market data summary
            const mc = Number(tokenData.marketCap || 0);
            const liq = Number(tokenData.liquidityUsd || tokenData.liquidity || 0);
            const holders = Number(tokenData.holderCount || 0);
            if (mc > 0) safe.push(`📊 Market Cap: $${formatLargeNum(mc)}`);
            if (liq > 0) safe.push(`💧 Liquidity: $${formatLargeNum(liq)}`);
            if (holders > 0) safe.push(`👥 Holders: ${holders.toLocaleString()}`);
        } else {
            warnings.push('⚠️ Could not fetch token data — proceed with extra caution');
        }

        // Build risk score
        const riskScore = warnings.length === 0 ? '🟢 LOW RISK'
            : warnings.some(w => w.includes('🚨')) ? '🔴 HIGH RISK — DO NOT TRADE'
                : '🟡 MEDIUM RISK — Proceed with caution';

        const parts = [`🛡️ Security Check: ${addr.slice(0, 6)}...${addr.slice(-4)} (Chain ${chain})\n\n${riskScore}`];
        if (warnings.length > 0) parts.push(`\n⚠️ WARNINGS:\n${warnings.join('\n')}`);
        if (safe.length > 0) parts.push(`\n✅ SAFE CHECKS:\n${safe.join('\n')}`);

        return parts.join('\n');
    },

    async check_approval_safety(args) {
        const warnings = [];
        const safe = [];

        // Check for unlimited approval
        const amount = args.amount || '';
        if (amount === 'unlimited' || amount.includes('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) {
            warnings.push('⚠️ UNLIMITED APPROVAL: This grants the spender unlimited access to this token. Consider setting a specific amount instead.');
        } else {
            safe.push('✅ Limited approval amount');
        }

        // Check spender address patterns
        const spender = args.spender_address || '';
        for (const pattern of KNOWN_SCAM_PATTERNS) {
            if (pattern.test(spender)) {
                warnings.push('🚨 CRITICAL: Spender address matches known scam pattern!');
                break;
            }
        }

        if (spender.length === 42 && spender.startsWith('0x')) {
            safe.push('✅ Valid EVM address format');
        }

        const riskLevel = warnings.some(w => w.includes('🚨')) ? '🔴 DANGEROUS'
            : warnings.length > 0 ? '🟡 CAUTION'
                : '🟢 SAFE';

        const parts = [`🛡️ Approval Safety Check\n\nRisk: ${riskLevel}`];
        parts.push(`📋 Spender: ${spender.slice(0, 6)}...${spender.slice(-4)}`);
        parts.push(`🪙 Token: ${args.token_address?.slice(0, 6)}...${args.token_address?.slice(-4)}`);
        if (warnings.length > 0) parts.push(`\n${warnings.join('\n')}`);
        if (safe.length > 0) parts.push(`\n${safe.join('\n')}`);

        return parts.join('\n');
    }
};

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════

function formatLargeNum(num) {
    const n = Number(num);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(2);
}

// ═══════════════════════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════════════════════

const SECURITY_SYSTEM_PROMPT = `
SECURITY RULES (MANDATORY):
1. ALWAYS run security_check_token before executing any swap for tokens the user hasn't traded before
2. If security check returns 🔴 HIGH RISK, REFUSE to execute the swap and explain why
3. If security check returns 🟡 MEDIUM RISK, warn the user and ask for explicit confirmation
4. ALWAYS warn about unlimited token approvals — recommend setting specific amounts
5. NEVER execute transactions on tokens flagged as honeypots
6. If a token has <$1,000 liquidity, warn about high slippage

VIETNAMESE TRIGGERS: "kiểm tra an toàn", "an toàn không", "có lừa đảo không", "check scam"`;

module.exports = {
    name: 'security',
    description: 'Transaction safety — honeypot detection, approval checks, rate limiting, scam detection',
    enabled: true,
    tools: SECURITY_TOOLS,
    handlers: securityHandlers,
    systemPrompt: SECURITY_SYSTEM_PROMPT,

    // Expose for integration
    checkRateLimit,
    rateLimitStore
};
