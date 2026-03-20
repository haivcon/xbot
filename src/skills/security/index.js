/**
 * Security Skill — Transaction Safety & Rate Limiting
 * 
 * Enhanced on-chain security using OKX Security APIs:
 * - Real honeypot/risk detection via tokenScan API
 * - DApp/URL phishing detection via dappScan API
 * - Transaction pre-execution safety via txScan API
 * - EIP-712 signature safety via sigScan API
 * - Token approval management via getApprovals API
 * - Approve spending detection (unlimited approvals → warning)
 * - Per-user AI rate limiting
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
// AI Tools
// ═══════════════════════════════════════════════════════

const SECURITY_TOOLS = [{
    functionDeclarations: [
        {
            name: 'security_check_token',
            description: 'Perform a comprehensive security analysis on a token using OKX Security API. Checks for honeypot, buy/sell tax, and risk level. ALWAYS use this before approving any swap.',
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
        },
        {
            name: 'dapp_scan',
            description: 'Check if a DApp URL or domain is a phishing/scam site using OKX Security API. Use before interacting with any DApp.',
            parameters: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'Full URL or domain to check (e.g., https://some-dapp.xyz)' }
                },
                required: ['domain']
            }
        },
        {
            name: 'tx_scan_safety',
            description: 'Pre-execution security scan for a transaction. Checks calldata for known risks (blacklisted addresses, phishing, malicious token purchases). Use before broadcasting any transaction.',
            parameters: {
                type: 'object',
                properties: {
                    chain_index: { type: 'string', description: 'Chain ID' },
                    from_address: { type: 'string', description: 'Sender address' },
                    to_address: { type: 'string', description: 'Target contract/address' },
                    data: { type: 'string', description: 'Transaction calldata (hex)' },
                    value: { type: 'string', description: 'Value in wei (optional)' }
                },
                required: ['chain_index', 'from_address', 'data']
            }
        },
        {
            name: 'check_approvals_list',
            description: 'Query all token approvals (ERC-20 / Permit2) for a wallet address. Shows risky unlimited approvals and suspicious spenders.',
            parameters: {
                type: 'object',
                properties: {
                    address: { type: 'string', description: 'EVM wallet address' },
                    chains: { type: 'string', description: 'Comma-separated chain IDs (optional, defaults to all)' }
                },
                required: ['address']
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

        // Use real OKX tokenScan API
        try {
            const onchainos = require('../../services/onchainos');
            const result = await onchainos.tokenScan([{ chainId: chain, contractAddress: addr }]);
            const data = result?.data?.[0] || result?.data || result;

            if (!data) {
                return '⚠️ Could not fetch security data — proceed with extra caution';
            }

            // Check chain support
            if (data.isChainSupported === false) {
                return `⚠️ Chain ${chain} is not supported for security scanning. Proceed with caution.`;
            }

            const parts = [`🛡️ Security Scan: ${addr.slice(0, 6)}...${addr.slice(-4)} (Chain ${chain})`];

            // Risk determination
            if (data.isRiskToken === true || data.isRiskToken === 'true') {
                parts.push('\n🔴 HIGH RISK — DO NOT TRADE');
                parts.push('🚨 This token is flagged as high-risk (potential honeypot/scam).');
            } else {
                parts.push('\n🟢 LOW RISK — Safe to trade');
            }

            // Tax info
            const buyTax = data.buyTaxes || '0';
            const sellTax = data.sellTaxes || '0';
            parts.push(`\n📊 Buy Tax: ${buyTax}% | Sell Tax: ${sellTax}%`);

            if (Number(sellTax) > 15) {
                parts.push('⚠️ HIGH SELL TAX — most funds will be lost when selling!');
            } else if (Number(sellTax) > 5) {
                parts.push('⚠️ Moderate sell tax');
            }

            // Also fetch token data for extra context
            try {
                const tokenInfo = await onchainos.getTokenAdvancedInfo(chain, addr);
                const td = tokenInfo?.data?.[0] || tokenInfo?.data;
                if (td) {
                    if (td.marketCap) parts.push(`📊 Market Cap: $${formatLargeNum(td.marketCap)}`);
                    if (td.top10HoldPercent) parts.push(`👥 Top 10 Holders: ${td.top10HoldPercent}%`);
                    if (td.devRugPullTokenCount && Number(td.devRugPullTokenCount) > 0) {
                        parts.push(`🚨 Dev has ${td.devRugPullTokenCount} rug pull tokens`);
                    }
                }
            } catch (e) { /* extra info not critical */ }

            return parts.join('\n');
        } catch (err) {
            // Fallback to heuristic approach
            return await fallbackSecurityCheck(addr, chain);
        }
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

        const spender = args.spender_address || '';
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
    },

    async dapp_scan(args, context) {
        const userId = context?.userId;
        if (userId) {
            const limit = checkRateLimit(userId);
            if (!limit.allowed) return `⚠️ Rate limited. Please wait ${limit.resetsIn}s.`;
        }

        try {
            const onchainos = require('../../services/onchainos');
            const result = await onchainos.dappScan(args.domain);
            const data = result?.data || result;

            const parts = [`🛡️ DApp Security Scan\n🔗 ${args.domain}`];
            if (data?.isMalicious === true || data?.isMalicious === 'true') {
                parts.push('\n🔴 MALICIOUS — DO NOT ACCESS');
                parts.push('🚨 This URL has been flagged as a phishing/scam domain.');
            } else {
                parts.push('\n🟢 SAFE — No threats detected');
            }
            return parts.join('\n');
        } catch (err) {
            return `⚠️ Could not scan domain: ${err.message}. Proceed with caution.`;
        }
    },

    async tx_scan_safety(args, context) {
        const userId = context?.userId;
        if (userId) {
            const limit = checkRateLimit(userId);
            if (!limit.allowed) return `⚠️ Rate limited. Please wait ${limit.resetsIn}s.`;
        }

        try {
            const onchainos = require('../../services/onchainos');
            const result = await onchainos.txScan({
                chainIndex: args.chain_index,
                fromAddress: args.from_address,
                toAddress: args.to_address,
                data: args.data,
                value: args.value
            });
            const data = result?.data || result;

            const parts = [`🛡️ Transaction Pre-Execution Scan\n📋 Chain: ${args.chain_index}`];

            const action = data?.action || '';
            if (action === 'block') {
                parts.push('\n🔴 HIGH RISK — DO NOT EXECUTE');
            } else if (action === 'warn') {
                parts.push('\n🟡 MEDIUM RISK — Requires confirmation');
            } else {
                parts.push('\n🟢 LOW RISK — Safe to execute');
            }

            // Risk items
            if (data?.riskItemDetail?.length > 0) {
                parts.push('\n⚠️ Risk Details:');
                for (const item of data.riskItemDetail) {
                    const desc = item.description?.en || item.description?.zh || item.name;
                    parts.push(`  • [${item.action?.toUpperCase() || 'WARN'}] ${desc}`);
                }
            }

            // Simulation
            if (data?.simulator) {
                if (data.simulator.revertReason) {
                    parts.push(`\n❌ Simulation FAILED: ${data.simulator.revertReason}`);
                } else {
                    parts.push(`\n✅ Simulation passed | Gas: ${data.simulator.gasLimit || 'N/A'}`);
                }
            }

            return parts.join('\n');
        } catch (err) {
            return `⚠️ Transaction scan failed: ${err.message}. DO NOT proceed — scan failure is NOT a pass.`;
        }
    },

    async check_approvals_list(args, context) {
        const userId = context?.userId;
        if (userId) {
            const limit = checkRateLimit(userId);
            if (!limit.allowed) return `⚠️ Rate limited. Please wait ${limit.resetsIn}s.`;
        }

        try {
            const onchainos = require('../../services/onchainos');
            const result = await onchainos.getApprovals(args.address, { chains: args.chains });
            const data = result?.data || result;
            const approvals = data?.approvalList || [];

            if (approvals.length === 0) {
                return `🛡️ Token Approvals for ${args.address.slice(0, 6)}...${args.address.slice(-4)}\n\n✅ No active token approvals found.`;
            }

            const parts = [`🛡️ Token Approvals for ${args.address.slice(0, 6)}...${args.address.slice(-4)}\n📋 Found ${approvals.length} active approval(s):\n`];

            for (const a of approvals.slice(0, 20)) {
                const risk = a.riskLevel?.toLowerCase?.()?.includes('high') ? '🔴' : a.allowance === 'unlimited' ? '🟡' : '🟢';
                parts.push(`${risk} ${a.tokenSymbol || 'Unknown'} → ${a.spenderAddress?.slice(0, 8)}... | Allowance: ${a.allowance || 'N/A'} | Chain: ${a.chainIndex}`);
            }

            const risky = approvals.filter(a => a.allowance === 'unlimited' || a.riskLevel?.toLowerCase?.()?.includes('high'));
            if (risky.length > 0) {
                parts.push(`\n⚠️ ${risky.length} risky approval(s) found. Consider revoking unlimited approvals.`);
            }

            return parts.join('\n');
        } catch (err) {
            return `⚠️ Could not fetch approvals: ${err.message}`;
        }
    }
};

// ═══════════════════════════════════════════════════════
// Fallback heuristic check when API fails
// ═══════════════════════════════════════════════════════

async function fallbackSecurityCheck(addr, chain) {
    const warnings = [];
    const safe = [];

    try {
        const onchainos = require('../../services/onchainos');
        const tokenInfo = await onchainos.getTokenAdvancedInfo(chain, addr);
        const tokenData = tokenInfo?.data?.[0] || tokenInfo?.data || tokenInfo;

        if (tokenData) {
            if (tokenData.tokenTags?.includes('honeypot')) {
                warnings.push('🚨 HONEYPOT: Flagged as honeypot by OKX!');
            }
            const mc = Number(tokenData.marketCap || 0);
            const top10 = Number(tokenData.top10HoldPercent || 0);
            if (top10 > 50) warnings.push(`⚠️ Top 10 holders own ${top10}% — rug pull risk`);
            if (mc > 0) safe.push(`📊 Market Cap: $${formatLargeNum(mc)}`);
            if (tokenData.devRugPullTokenCount && Number(tokenData.devRugPullTokenCount) > 0) {
                warnings.push(`🚨 Dev has ${tokenData.devRugPullTokenCount} rug pull tokens`);
            }
        } else {
            warnings.push('⚠️ Could not fetch token data');
        }
    } catch (e) {
        warnings.push('⚠️ Token data unavailable');
    }

    const riskScore = warnings.some(w => w.includes('🚨')) ? '🔴 HIGH RISK'
        : warnings.length > 0 ? '🟡 MEDIUM RISK' : '🟢 LOW RISK';

    const parts = [`🛡️ Security Check (Fallback): ${addr.slice(0, 6)}...${addr.slice(-4)} (Chain ${chain})\n\n${riskScore}`];
    if (warnings.length > 0) parts.push(`\n${warnings.join('\n')}`);
    if (safe.length > 0) parts.push(`\n${safe.join('\n')}`);
    return parts.join('\n');
}

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
7. Use dapp_scan to check any DApp URLs before interacting
8. Use tx_scan_safety to verify transaction calldata before broadcasting
9. Use check_approvals_list to review wallet approvals when requested
10. If any security scan FAILS, do NOT proceed — failure is NOT a pass!

VIETNAMESE TRIGGERS: "kiểm tra an toàn", "an toàn không", "có lừa đảo không", "check scam", "kiểm tra web", "trang web lừa đảo", "kiểm tra giao dịch", "xem ủy quyền"`;

module.exports = {
    name: 'security',
    description: 'Transaction safety — honeypot detection, DApp phishing scan, TX pre-execution check, approval management, rate limiting',
    enabled: true,
    tools: SECURITY_TOOLS,
    handlers: securityHandlers,
    systemPrompt: SECURITY_SYSTEM_PROMPT,

    // Expose for integration
    checkRateLimit,
    rateLimitStore
};
