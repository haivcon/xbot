/**
 * AI OnchainOS Integration — Function Calling Layer
 *
 * (REFACTORED: Implementations moved to src/features/ai/onchain/)
 */
const { ONCHAIN_COMMON_RULES } = require('../../config/prompts');
const { ONCHAIN_TOOLS } = require('./onchain/declarations');

const walletTools = require('./onchain/walletTools');
const tradingTools = require('./onchain/tradingTools');
const marketTools = require('./onchain/marketTools');

const toolHandlers = {
    ...walletTools,
    ...tradingTools,
    ...marketTools
};

// ═══════════════════════════════════════════════════════
// Core Function: Execute a tool call from Gemini
// ═══════════════════════════════════════════════════════

async function executeToolCall(functionCall, context) {
    const handler = toolHandlers[functionCall.name];
    if (!handler) {
        return `Unknown function: ${functionCall.name}`;
    }
    try {
        return await handler(functionCall.args || {}, context);
    } catch (error) {
        console.error(`[AI-Onchain] Tool execution error for ${functionCall.name}:`, error);
        return `Error executing ${functionCall.name}: ${error.message || 'Unknown error'}`;
    }
}

// ═══════════════════════════════════════════════════════
// System Prompt for OnchainOS-aware AI
// ═══════════════════════════════════════════════════════

const ONCHAIN_SYSTEM_INSTRUCTION = `You are an AI-powered Web3 assistant and autonomous agent integrated with OKX OnchainOS. You can access real-time blockchain data and execute on-chain actions through function calls.

CORE CAPABILITIES:
- Check token prices across 100+ chains (use get_token_price)
- Search tokens by name/symbol (use search_token to find contract addresses first)
- Check wallet balances and portfolio (use get_wallet_balance for watch wallets)
- Get swap quotes for token exchanges (use get_swap_quote)
- Execute token swaps (use execute_swap after user confirms quote)
- Find trending/top tokens (use get_top_tokens)
- Analyze token holder distribution (use get_token_holders)
- Check gas prices (use get_gas_price)
- Get detailed token metadata (use get_token_info)

ADVANCED CAPABILITIES:
- Technical analysis with K-line charts (use get_market_candles for price charts, RSI, support/resistance)
- Deep market analysis with 24h change, volume, liquidity (use get_token_market_detail)
- Transaction simulation to check if tx will succeed (use simulate_transaction before broadcasting)
- Full swap execution with calldata generation (use execute_swap)
- Weather information for any city (use get_weather)

TRADING WALLET COMMANDS:
- Create a new trading wallet (use manage_trading_wallet with action "create")
- Delete a trading wallet (use manage_trading_wallet with action "delete", optionally with walletId)
- Set default wallet for auto-swap (use manage_trading_wallet with action "set_default" with walletId)
- Check trading wallet balance/portfolio (use get_trading_wallet_balance, optionally with walletId)
- List all trading wallets with IDs and addresses (use list_trading_wallets)

SWAP EXECUTION FLOW:
1. User asks to swap → use search_token to find addresses
2. Check balance with get_wallet_balance or get_trading_wallet_balance
3. Get quote with get_swap_quote (check honeypot & tax warnings!)
4. If user confirms, use execute_swap to generate transaction
5. Optionally use simulate_transaction to verify tx will succeed
6. User signs with their private key

SAFETY RULES:
- ALWAYS check honeypot warnings from swap quotes — if isHoneyPot is true, BLOCK the trade
- ALWAYS warn about high price impact (>5%) or tax rates
- ALWAYS simulate transactions before suggesting broadcast for large amounts
- When suggesting swaps, recommend X Layer (low gas) unless user specifies a chain

IMPORTANT RULES:
1. ALWAYS use search_token first if you don't know a token's contract address
2. Common native token address for EVM chains: 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
3. Solana native SOL address: 11111111111111111111111111111111 (NOT wSOL)
4. Common chain IDs: Ethereum=1, BSC=56, X Layer=196, Polygon=137, Avalanche=43114, Solana=501, Base=8453, Arbitrum=42161
5. When showing prices, use appropriate decimal places (8 for micro-cap, 2-4 for larger tokens)
6. For swap quotes, you need token addresses — search first if needed
7. Present data conversationally with market context and actionable insights
8. When users mention "my wallet", "ví của tôi", "ví giao dịch" — use get_trading_wallet_balance
9. NEVER fabricate data — only present data from function call results
10. Amounts for swap/execute must be in MINIMAL UNITS (e.g. 1 USDT with 6 decimals = "1000000")
11. Understand Vietnamese commands: "tạo ví" = create wallet, "xóa ví" = delete wallet, "số dư" = balance, "đặt mặc định" = set default, "thời tiết" = weather, "biểu đồ" = chart
12. For private key operations — always advise using /exportkey or /importkey commands in DM for security
13. When showing technical analysis, include trend direction, RSI interpretation, and actionable suggestion
14. CRITICAL SWAP RULE: "amount" in get_swap_quote/execute_swap ALWAYS means "Quantity of fromTokenAddress to SELL". If a user says "buy 1000 BANMAO using OKB", do NOT pass 1000. You MUST ask the user "Bạn muốn dùng bao nhiêu OKB để mua tính theo số dư?" OR you can estimate the OKB cost using get_token_price first, then set the amount to that estimated OKB cost.
${ONCHAIN_COMMON_RULES}`;

/**
 * Build the system instruction with optional user context
 * @param {string} chatId - Telegram chat ID for fetching linked wallet
 * @returns {string}
 */
async function buildSystemInstruction(chatId) {
    let walletContext = '';
    if (chatId) {
        try {
            const wallets = await db.getWalletsForUser(chatId);
            if (wallets && wallets.length > 0) {
                const walletList = wallets.map((w) => w.address || w.wallet).filter(Boolean);
                if (walletList.length > 0) {
                    walletContext = `\n\nUSER'S WATCH WALLETS:\n${walletList.map((a) => `- ${a}`).join('\n')}\nWhen the user asks about a specific address balance, use these addresses with get_wallet_balance.`;
                }
            }
        } catch (error) {
            // Non-critical, proceed without wallet context
        }
        // Also inject trading wallet context
        try {
            const { dbAll } = require('../../../db/core');
            const tradingWallets = await dbAll('SELECT id, address, isDefault, walletName FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC', [String(chatId)]);
            if (tradingWallets && tradingWallets.length > 0) {
                const twList = tradingWallets.map((w) => {
                    const star = w.isDefault ? ' (DEFAULT ⭐)' : '';
                    const name = w.walletName ? ` "${w.walletName}"` : '';
                    return `- ID:${w.id}${name} ${w.address}${star}`;
                }).join('\n');
                walletContext += `\n\nUSER'S TRADING WALLETS:\n${twList}\nWhen the user asks about "my wallet", "ví giao dịch", "số dư", use get_trading_wallet_balance. For wallet management, use manage_trading_wallet with the appropriate walletId.`;
            }
        } catch (error) {
            // Non-critical
        }
    }
    return ONCHAIN_SYSTEM_INSTRUCTION + walletContext;
}

module.exports = {
    ONCHAIN_TOOLS,
    ONCHAIN_SYSTEM_INSTRUCTION,
    executeToolCall,
    buildSystemInstruction,
    toolHandlers
};
