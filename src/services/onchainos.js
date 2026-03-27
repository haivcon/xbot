/**
 * OnchainOS API Service Layer
 * Unified module for all OKX OnchainOS API calls:
 * Wallet Portfolio, DEX Market, DEX Token, DEX Swap, Onchain Gateway
 */
const crypto = require('crypto');
const logger = require('../core/logger');
const log = logger.child('Onchainos');
const {
    OKX_BASE_URL,
    OKX_API_KEY,
    OKX_SECRET_KEY,
    OKX_API_PASSPHRASE,
    OKX_API_PROJECT,
    OKX_FETCH_TIMEOUT,
    hasOkxCredentials,
    OKX_CHAIN_INDEX_FALLBACK,
    OKX_DEX_DEFAULT_MAX_RETRIES,
    OKX_DEX_DEFAULT_RETRY_DELAY_MS
} = require('../config');

// ─── Shared test API key (fallback for development/testing only) ───
const SANDBOX_API_KEY = '03f0b376-251c-4618-862e-ae92929e0416';
const SANDBOX_SECRET_KEY = '652ECE8FF13210065B0851FFDA9191F7';
const SANDBOX_PASSPHRASE = 'onchainOS#666';

function getCredentials() {
    if (hasOkxCredentials) {
        return {
            apiKey: OKX_API_KEY,
            secretKey: OKX_SECRET_KEY,
            passphrase: OKX_API_PASSPHRASE
        };
    }
    log.child('OKXWARNING').warn('Using SANDBOX API keys! Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE in .env for production.');
    return {
        apiKey: SANDBOX_API_KEY,
        secretKey: SANDBOX_SECRET_KEY,
        passphrase: SANDBOX_PASSPHRASE
    };
}

// ─── Core fetch with HMAC-SHA256 auth ───

/**
 * Authenticated fetch to OKX OnchainOS API
 * @param {'GET'|'POST'} method
 * @param {string} path - Full path including query string for GET (e.g. '/api/v6/dex/market/price')
 * @param {object} [body] - Request body for POST requests
 * @param {object} [options] - Extra options
 * @param {number} [options.timeout] - Timeout in ms
 * @param {number} [options.retries] - Number of retries on 429/5xx
 * @returns {Promise<any>} - Parsed `data` field from response
 */
async function okxFetch(method, path, body, options = {}) {
    const timeout = options.timeout || OKX_FETCH_TIMEOUT || 10000;
    const maxRetries = options.retries ?? OKX_DEX_DEFAULT_MAX_RETRIES ?? 2;
    const retryDelay = OKX_DEX_DEFAULT_RETRY_DELAY_MS || 400;

    const creds = getCredentials();
    const bodyStr = body ? JSON.stringify(body) : '';
    const url = `${OKX_BASE_URL}${path}`;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Create a fresh AbortController per attempt so retries are not pre-aborted
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const timestamp = new Date().toISOString();
            const signPayload = timestamp + method + path + bodyStr;
            const sign = crypto
                .createHmac('sha256', creds.secretKey)
                .update(signPayload)
                .digest('base64');

            const headers = {
                'OK-ACCESS-KEY': creds.apiKey,
                'OK-ACCESS-SIGN': sign,
                'OK-ACCESS-PASSPHRASE': creds.passphrase,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'Content-Type': 'application/json'
            };

            if (OKX_API_PROJECT) {
                headers['OK-ACCESS-PROJECT'] = OKX_API_PROJECT;
            }

            const fetchOptions = {
                method,
                headers,
                signal: controller.signal
            };
            if (body) {
                fetchOptions.body = bodyStr;
            }

            const res = await fetch(url, fetchOptions);

            if (res.status === 429) {
                lastError = { code: 'RATE_LIMITED', msg: 'Rate limited — retry with backoff', retryable: true };
                if (attempt < maxRetries) {
                    await sleep(retryDelay * (attempt + 1));
                    continue;
                }
                throw lastError;
            }

            if (res.status >= 500) {
                lastError = { code: `HTTP_${res.status}`, msg: `Server error ${res.status}`, retryable: true };
                if (attempt < maxRetries) {
                    await sleep(retryDelay * (attempt + 1));
                    continue;
                }
                throw lastError;
            }

            const json = await res.json();
            if (json.code !== '0') {
                throw { code: json.code, msg: json.msg || 'API error', retryable: false };
            }
            clearTimeout(timer);
            return json.data;

        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                if (attempt >= maxRetries) {
                    throw { code: 'TIMEOUT', msg: `Request timed out after ${timeout}ms`, retryable: true };
                }
                lastError = { code: 'TIMEOUT', msg: `Request timed out after ${timeout}ms`, retryable: true };
                await sleep(retryDelay * (attempt + 1));
                continue;
            }
            if (error.retryable === false || attempt >= maxRetries) {
                throw error;
            }
            lastError = error;
            await sleep(retryDelay * (attempt + 1));
        }
    }
    throw lastError || { code: 'UNKNOWN', msg: 'Unknown error after retries' };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helper: build query string and full path ───

function buildGetPath(basePath, params) {
    const filtered = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            filtered[key] = String(value);
        }
    }
    const qs = new URLSearchParams(filtered).toString();
    return qs ? `${basePath}?${qs}` : basePath;
}

// ═══════════════════════════════════════════════════════
// Wallet Portfolio API  (/api/v6/dex/balance)
// ═══════════════════════════════════════════════════════

/**
 * Get total wallet value across chains
 * @param {string} address - Wallet address
 * @param {string} chains - Comma-separated chain IDs (e.g. '196,1,56')
 * @param {object} [options]
 * @param {string} [options.assetType] - '0'=all, '1'=tokens, '2'=DeFi
 */
async function getWalletTotalValue(address, chains, options = {}) {
    const path = buildGetPath('/api/v6/dex/balance/total-value-by-address', {
        address: address.toLowerCase(),
        chains,
        assetType: options.assetType
    });
    return okxFetch('GET', path);
}

/**
 * Get all token balances for a wallet
 * @param {string} address
 * @param {string} chains - Comma-separated chain IDs
 * @param {object} [options]
 * @param {string} [options.excludeRiskToken] - '0'=filter out (default), '1'=include
 */
async function getWalletBalances(address, chains, options = {}) {
    const path = buildGetPath('/api/v6/dex/balance/all-token-balances-by-address', {
        address: address.toLowerCase(),
        chains,
        excludeRiskToken: options.excludeRiskToken
    });
    return okxFetch('GET', path);
}

/**
 * Get specific token balances
 * @param {string} address
 * @param {Array<{chainIndex: string, tokenContractAddress: string}>} tokens
 */
async function getSpecificTokenBalances(address, tokens) {
    const path = '/api/v6/dex/balance/token-balances-by-address';
    return okxFetch('POST', path, {
        address: address.toLowerCase(),
        tokenContractAddresses: tokens
    });
}

// ═══════════════════════════════════════════════════════
// DEX Market API  (/api/v6/dex/market + /api/v6/dex/index)
// ═══════════════════════════════════════════════════════

/**
 * Get real-time token price (POST – body is JSON array)
 * @param {Array<{chainIndex: string, tokenContractAddress: string}>} tokens
 */
async function getMarketPrice(tokens) {
    return okxFetch('POST', '/api/v6/dex/market/price', tokens);
}

/**
 * Get candlestick / K-line data
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 * @param {object} [options]
 * @param {string} [options.bar] - '1m','5m','1H','1D' etc.
 * @param {number} [options.limit] - Max 299
 */
async function getMarketCandles(chainIndex, tokenContractAddress, options = {}) {
    const path = buildGetPath('/api/v6/dex/market/candles', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase(),
        bar: options.bar,
        limit: options.limit,
        after: options.after,
        before: options.before
    });
    return okxFetch('GET', path);
}

/**
 * Get recent trades for a token
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 * @param {object} [options]
 * @param {string} [options.limit] - Max 500, default 100
 * @param {string} [options.tagFilter] - 1=KOL, 2=Dev, 3=Smart Money, 4=Whale, 5=New Wallet, 6=Suspicious, 7=Sniper, 8=Phishing, 9=Bundle
 * @param {string} [options.walletAddressFilter] - Comma-separated addresses (max 10)
 * @param {string} [options.after] - Pagination cursor
 */
async function getMarketTrades(chainIndex, tokenContractAddress, options = {}) {
    const path = buildGetPath('/api/v6/dex/market/trades', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase(),
        limit: options.limit,
        tagFilter: options.tagFilter,
        walletAddressFilter: options.walletAddressFilter,
        after: options.after
    });
    return okxFetch('GET', path);
}

/**
 * Get supported chains for market signals
 */
async function getSignalChains() {
    return okxFetch('GET', '/api/v6/dex/market/signal/supported/chain');
}

/**
 * Get latest buy-direction token signals (smart money, whale, KOL)
 */
async function getSignalList(chainIndex, options = {}) {
    const payload = {
        chainIndex,
        walletType: options.walletType,
        minAmountUsd: options.minAmountUsd,
        maxAmountUsd: options.maxAmountUsd,
        minAddressCount: options.minAddressCount,
        maxAddressCount: options.maxAddressCount,
        tokenAddress: options.tokenContractAddress ? options.tokenContractAddress.toLowerCase() : undefined,
        minMarketCapUsd: options.minMarketCapUsd,
        maxMarketCapUsd: options.maxMarketCapUsd,
        minLiquidityUsd: options.minLiquidityUsd,
        maxLiquidityUsd: options.maxLiquidityUsd
    };
    // remove undefined
    const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
    return okxFetch('POST', '/api/v6/dex/market/signal/list', cleanPayload);
}

/**
 * Get historical candlestick data (long-range K-line)
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 * @param {object} [options]
 * @param {string} [options.bar] - '1m','5m','1H','1D' etc.
 * @param {number} [options.limit] - Max 299
 * @param {string} [options.after] - Pagination cursor (timestamp ms)
 * @param {string} [options.before] - Pagination cursor (timestamp ms)
 */
async function getHistoricalCandles(chainIndex, tokenContractAddress, options = {}) {
    const path = buildGetPath('/api/v6/dex/market/historical-candles', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase(),
        bar: options.bar,
        limit: options.limit,
        after: options.after,
        before: options.before
    });
    return okxFetch('GET', path);
}

/**
 * Get index price (aggregated from multiple sources)
 * @param {Array<{chainIndex: string, tokenContractAddress: string}>} tokens
 */
async function getIndexPrice(tokens) {
    return okxFetch('POST', '/api/v6/dex/index/current-price', tokens);
}

/**
 * Get historical index price
 */
async function getHistoricalIndexPrice(chainIndex, tokenContractAddress, options = {}) {
    const path = buildGetPath('/api/v6/dex/index/historical-price', {
        chainIndex,
        tokenContractAddress: tokenContractAddress ? tokenContractAddress.toLowerCase() : '',
        period: options.period,
        limit: options.limit,
        cursor: options.cursor,
        begin: options.begin,
        end: options.end
    });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// DEX Token API  (/api/v6/dex/market)
// ═══════════════════════════════════════════════════════

/**
 * Search token by name, symbol, or address
 * @param {string} chains - Comma-separated chain IDs
 * @param {string} search - Keyword
 */
async function getTokenSearch(chains, search) {
    const path = buildGetPath('/api/v6/dex/market/token/search', { chains, search });
    return okxFetch('GET', path);
}

/**
 * Get token basic info (batch)
 * @param {Array<{chainIndex: string, tokenContractAddress: string}>} tokens
 */
async function getTokenBasicInfo(tokens) {
    return okxFetch('POST', '/api/v6/dex/market/token/basic-info', tokens);
}

/**
 * Get token price info with market cap, liquidity, 24h change (batch)
 * @param {Array<{chainIndex: string, tokenContractAddress: string}>} tokens
 */
async function getTokenPriceInfo(tokens) {
    return okxFetch('POST', '/api/v6/dex/market/price-info', tokens);
}

/**
 * Get token top list / rankings
 * @param {string} chains
 * @param {string} sortBy - '2'=price change, '5'=volume, '6'=market cap
 * @param {string} timeFrame - '1'=5min, '2'=1h, '3'=4h, '4'=24h
 */
async function getTokenTopList(chains, sortBy, timeFrame) {
    const path = buildGetPath('/api/v6/dex/market/token/toplist', { chains, sortBy, timeFrame });
    return okxFetch('GET', path);
}

/**
 * Get token holder distribution (top 20)
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 */
async function getTokenHolder(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/token/holder', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase()
    });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// DEX Swap / Aggregator API  (/api/v6/dex/aggregator)
// ═══════════════════════════════════════════════════════

/**
 * Get swap quote
 * @param {object} params
 * @param {string} params.chainIndex
 * @param {string} params.fromTokenAddress
 * @param {string} params.toTokenAddress
 * @param {string} params.amount - In minimal units
 * @param {string} [params.swapMode] - 'exactIn' (default) or 'exactOut'
 */
async function getSwapQuote(params) {
    const path = buildGetPath('/api/v6/dex/aggregator/quote', {
        chainIndex: params.chainIndex,
        fromTokenAddress: params.fromTokenAddress.toLowerCase(),
        toTokenAddress: params.toTokenAddress.toLowerCase(),
        amount: params.amount,
        swapMode: params.swapMode || 'exactIn'
    });
    return okxFetch('GET', path);
}

/**
 * Get swap transaction data (calldata)
 * @param {object} params
 * @param {string} params.chainIndex
 * @param {string} params.fromTokenAddress
 * @param {string} params.toTokenAddress
 * @param {string} params.amount
 * @param {string} params.userWalletAddress
 * @param {string} [params.slippagePercent] - Default '1'
 */
async function getSwapTransaction(params) {
    const path = buildGetPath('/api/v6/dex/aggregator/swap', {
        chainIndex: params.chainIndex,
        fromTokenAddress: params.fromTokenAddress.toLowerCase(),
        toTokenAddress: params.toTokenAddress.toLowerCase(),
        amount: params.amount,
        userWalletAddress: params.userWalletAddress.toLowerCase(),
        slippagePercent: params.slippagePercent || '1',
        swapMode: params.swapMode || 'exactIn'
    });
    return okxFetch('GET', path);
}

/**
 * Get ERC-20 token approval transaction data
 */
async function getApproveTransaction(chainIndex, tokenContractAddress, approveAmount) {
    const path = buildGetPath('/api/v6/dex/aggregator/approve-transaction', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase(),
        approveAmount
    });
    return okxFetch('GET', path);
}

/**
 * Get available liquidity pools on a chain
 */
async function getLiquidity(chainIndex) {
    const path = buildGetPath('/api/v6/dex/aggregator/get-liquidity', { chainIndex });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Onchain Gateway API  (/api/v6/dex/pre-transaction + post-transaction)
// ═══════════════════════════════════════════════════════

/**
 * Get current gas price for a chain
 */
async function getGasPrice(chainIndex) {
    const path = buildGetPath('/api/v6/dex/pre-transaction/gas-price', { chainIndex });
    return okxFetch('GET', path);
}

/**
 * Estimate gas limit for a transaction
 */
async function estimateGasLimit(params) {
    return okxFetch('POST', '/api/v6/dex/pre-transaction/gas-limit', {
        chainIndex: params.chainIndex,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        txAmount: params.txAmount || '0',
        extJson: params.extJson || {}
    });
}

/**
 * Simulate a transaction to check if it will succeed
 */
async function simulateTransaction(params) {
    return okxFetch('POST', '/api/v6/dex/pre-transaction/simulate', {
        chainIndex: params.chainIndex,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        txAmount: params.txAmount || '0',
        extJson: params.extJson || {}
    });
}

/**
 * Broadcast a signed transaction
 */
async function broadcastTransaction(signedTx, chainIndex, address) {
    return okxFetch('POST', '/api/v6/dex/pre-transaction/broadcast-transaction', {
        signedTx,
        chainIndex,
        address
    });
}

/**
 * Track broadcast order status
 */
async function getOrderStatus(address, chainIndex, options = {}) {
    const path = buildGetPath('/api/v6/dex/post-transaction/orders', {
        address,
        chainIndex,
        orderId: options.orderId,
        txStatus: options.txStatus,
        limit: options.limit
    });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Meme Pump Scanner API  (/api/v6/dex/market/memepump)
// ═══════════════════════════════════════════════════════

async function getMemePumpChains() {
    return okxFetch('GET', '/api/v6/dex/market/memepump/supported/chainsProtocol');
}

async function getMemePumpTokenList(chainIndex, stage, options = {}) {
    const params = { chainIndex, stage, ...options };
    const cleanParams = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const path = buildGetPath('/api/v6/dex/market/memepump/tokenList', cleanParams);
    return okxFetch('GET', path);
}

async function getMemePumpTokenDetails(chainIndex, tokenContractAddress, walletAddress) {
    const path = buildGetPath('/api/v6/dex/market/memepump/tokenDetails', { chainIndex, tokenContractAddress, walletAddress });
    return okxFetch('GET', path);
}

async function getMemePumpDevInfo(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/memepump/tokenDevInfo', { chainIndex, tokenContractAddress });
    return okxFetch('GET', path);
}

async function getMemePumpSimilarTokens(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/memepump/similarToken', { chainIndex, tokenContractAddress });
    return okxFetch('GET', path);
}

async function getMemePumpBundleInfo(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/memepump/tokenBundleInfo', { chainIndex, tokenContractAddress });
    return okxFetch('GET', path);
}

async function getMemePumpApedWallets(chainIndex, tokenContractAddress, walletAddress) {
    const path = buildGetPath('/api/v6/dex/market/memepump/apedWallet', { chainIndex, tokenContractAddress, walletAddress });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Portfolio API  (/api/v6/dex/market/portfolio)
// ═══════════════════════════════════════════════════════

async function getPortfolioOverview(chainIndex, walletAddress, timeFrame) {
    const path = buildGetPath('/api/v6/dex/market/portfolio/overview', { chainIndex, walletAddress, timeFrame });
    return okxFetch('GET', path);
}

async function getRecentPnl(chainIndex, walletAddress, options = {}) {
    const path = buildGetPath('/api/v6/dex/market/portfolio/recent-pnl', { chainIndex, walletAddress, cursor: options.cursor, limit: options.limit });
    return okxFetch('GET', path);
}

async function getTokenLatestPnl(chainIndex, walletAddress, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/portfolio/token/latest-pnl', { chainIndex, walletAddress, tokenContractAddress });
    return okxFetch('GET', path);
}

async function getDexHistory(chainIndex, walletAddress, begin, end, options = {}) {
    const path = buildGetPath('/api/v6/dex/market/portfolio/dex-history', {
        chainIndex, walletAddress, begin, end,
        tokenContractAddress: options.tokenContractAddress, type: options.type,
        cursor: options.cursor, limit: options.limit
    });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Transaction History API  (/api/v6/dex/post-transaction)
// ═══════════════════════════════════════════════════════

async function getTransactionHistory(address, options = {}) {
    const path = buildGetPath('/api/v6/dex/post-transaction/transactions-by-address', {
        address, chains: options.chains, tokenContractAddress: options.tokenContractAddress,
        begin: options.begin, end: options.end, cursor: options.cursor, limit: options.limit
    });
    return okxFetch('GET', path);
}

async function getTransactionDetail(chainIndex, txHash, itype) {
    const path = buildGetPath('/api/v6/dex/post-transaction/transaction-detail-by-txhash', { chainIndex, txHash, itype });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Token Advanced API  (/api/v6/dex/market/token)
// ═══════════════════════════════════════════════════════

async function getTokenAdvancedInfo(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/token/advanced-info', { chainIndex, tokenContractAddress });
    return okxFetch('GET', path);
}

async function getTokenLiquidityPool(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/token/top-liquidity', { chainIndex, tokenContractAddress });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Security API  (/api/v6/dex/security)
// ═══════════════════════════════════════════════════════

/**
 * Scan tokens for honeypot / risk detection
 * @param {Array<{chainId: string, contractAddress: string}>} tokenList - max 50
 */
async function tokenScan(tokenList) {
    return okxFetch('POST', '/api/v6/dex/security/token-scan', { tokenList });
}

/**
 * Scan a DApp/URL for phishing
 * @param {string} domain - Full URL or domain
 */
async function dappScan(domain) {
    const path = buildGetPath('/api/v6/dex/security/dapp-scan', { domain });
    return okxFetch('GET', path);
}

/**
 * Transaction pre-execution security scan (EVM + Solana)
 * @param {object} params
 * @param {string} params.chainIndex
 * @param {string} params.fromAddress
 * @param {string} [params.toAddress]
 * @param {string} params.data - Calldata (hex) for EVM
 * @param {string} [params.value] - Value in wei (hex or decimal)
 * @param {string} [params.gas]
 * @param {string} [params.gasPrice]
 * @param {string} [params.encoding] - 'base58'|'base64' for Solana
 * @param {string} [params.transactions] - Comma-separated tx payloads for Solana
 */
async function txScan(params) {
    const payload = {
        chainIndex: params.chainIndex,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        inputData: params.data,
        txAmount: params.value,
        gas: params.gas,
        gasPrice: params.gasPrice,
        encoding: params.encoding,
        transactions: params.transactions
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v6/dex/security/tx-scan', clean);
}

/**
 * Message signature security scan (EVM only)
 * @param {object} params
 * @param {string} params.chainIndex
 * @param {string} params.fromAddress
 * @param {string} params.sigMethod - 'personal_sign'|'eth_sign'|'eth_signTypedData'|'eth_signTypedData_v3'|'eth_signTypedData_v4'
 * @param {string} params.message - Message or EIP-712 typed data JSON
 */
async function sigScan(params) {
    return okxFetch('POST', '/api/v6/dex/security/sig-scan', {
        chainIndex: params.chainIndex,
        fromAddress: params.fromAddress,
        sigMethod: params.sigMethod,
        message: params.message
    });
}

/**
 * Query token approvals / Permit2 authorizations (EVM only)
 * @param {string} address - Wallet address
 * @param {object} [options]
 * @param {string} [options.chains] - Comma-separated chain IDs
 * @param {string} [options.limit]
 * @param {string} [options.cursor]
 */
async function getApprovals(address, options = {}) {
    const path = buildGetPath('/api/v6/dex/security/approvals', {
        address: address.toLowerCase(),
        chainIndexes: options.chains,
        limit: options.limit,
        cursor: options.cursor
    });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Token Hot / Top-Trader / Cluster API
// ═══════════════════════════════════════════════════════

/**
 * Get hot token list (trending score or X/Twitter mentions)
 * @param {object} [options]
 * @param {string} [options.rankingType] - '4'=trending score, '5'=X mentions
 * @param {string} [options.chainIndex]
 * @param {string} [options.rankBy] - Sort field (1-15)
 * @param {string} [options.timeFrame] - '1'=5min, '2'=1h, '3'=4h, '4'=24h
 */
async function getHotTokens(options = {}) {
    const clean = Object.fromEntries(Object.entries({
        rankingType: options.rankingType || '4',
        chainIndex: options.chainIndex,
        rankBy: options.rankBy,
        timeFrame: options.timeFrame,
        riskFilter: options.riskFilter,
        stableTokenFilter: options.stableTokenFilter,
        projectId: options.projectId,
        priceChangeMin: options.priceChangeMin,
        priceChangeMax: options.priceChangeMax,
        volumeMin: options.volumeMin,
        volumeMax: options.volumeMax,
        marketCapMin: options.marketCapMin,
        marketCapMax: options.marketCapMax,
        liquidityMin: options.liquidityMin,
        liquidityMax: options.liquidityMax,
        holdersMin: options.holdersMin,
        holdersMax: options.holdersMax,
        inflowMin: options.inflowMin,
        inflowMax: options.inflowMax,
        isLpBurnt: options.isLpBurnt,
        isMint: options.isMint,
        isFreeze: options.isFreeze
    }).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const path = buildGetPath('/api/v6/dex/market/token/hotTokenList', clean);
    return okxFetch('GET', path);
}

/**
 * Get top traders / profit addresses for a token
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 * @param {object} [options]
 * @param {string} [options.tagFilter] - 1=KOL,2=Dev,3=SmartMoney,4=Whale,5=Fresh,6=Insider,7=Sniper,8=Phishing,9=Bundler
 */
async function getTopTrader(chainIndex, tokenContractAddress, options = {}) {
    const path = buildGetPath('/api/v6/dex/market/token/topTrader', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase(),
        tagFilter: options.tagFilter
    });
    return okxFetch('GET', path);
}

/**
 * Get holder cluster concentration overview
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 */
async function getClusterOverview(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/token/cluster/overview', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase()
    });
    return okxFetch('GET', path);
}

/**
 * Get top 10/50/100 holder overview
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 * @param {string} rangeFilter - '1'=top10, '2'=top50, '3'=top100
 */
async function getClusterTopHolders(chainIndex, tokenContractAddress, rangeFilter) {
    const path = buildGetPath('/api/v6/dex/market/token/cluster/topHolders', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase(),
        rangeFilter
    });
    return okxFetch('GET', path);
}

/**
 * Get holder cluster list (groups of top 300 holders)
 * @param {string} chainIndex
 * @param {string} tokenContractAddress
 */
async function getClusterList(chainIndex, tokenContractAddress) {
    const path = buildGetPath('/api/v6/dex/market/token/cluster/list', {
        chainIndex,
        tokenContractAddress: tokenContractAddress.toLowerCase()
    });
    return okxFetch('GET', path);
}

/**
 * Get chains supported by holder cluster analysis
 */
async function getClusterSupportedChains() {
    return okxFetch('GET', '/api/v6/dex/market/token/cluster/supported/chain');
}

// ═══════════════════════════════════════════════════════
// Address Tracker API  (/api/v6/dex/market/tracker)
// ═══════════════════════════════════════════════════════

/**
 * Get latest DEX activities for tracked addresses (smart money, KOL, custom)
 * @param {object} params
 * @param {string} params.trackerType - '1'=smart_money, '2'=kol, '3'=multi_address
 * @param {string} [params.walletAddress] - Required for multi_address, comma-separated (max 20)
 * @param {string} [params.tradeType] - '0'=all, '1'=buy, '2'=sell
 * @param {string} [params.chainIndex]
 */
async function getAddressTrackerActivities(params) {
    const clean = Object.fromEntries(Object.entries({
        trackerType: params.trackerType,
        walletAddress: params.walletAddress,
        tradeType: params.tradeType,
        chainIndex: params.chainIndex,
        minVolume: params.minVolume,
        maxVolume: params.maxVolume,
        minHolders: params.minHolders,
        minMarketCap: params.minMarketCap,
        maxMarketCap: params.maxMarketCap,
        minLiquidity: params.minLiquidity,
        maxLiquidity: params.maxLiquidity
    }).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const path = buildGetPath('/api/v6/dex/market/tracker/address-activities', clean);
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// DeFi Invest API  (/api/v5/defi)
// ═══════════════════════════════════════════════════════

async function defiSearch(params = {}) {
    const payload = {
        tokenSymbol: params.tokenSymbol,
        platformName: params.platformName,
        chainIndex: params.chainIndex,
        productGroup: params.productGroup || 'SINGLE_EARN',
        pageNum: params.pageNum || 1
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/defi/explore/product/list', clean);
}

async function defiDetail(investmentId) {
    const path = buildGetPath('/api/v5/defi/explore/product/detail', { investmentId });
    return okxFetch('GET', path);
}

async function defiPrepare(investmentId) {
    const path = buildGetPath('/api/v5/defi/invest/pre-transaction-info', { investmentId });
    return okxFetch('GET', path);
}

async function defiDeposit(params) {
    const payload = {
        investmentId: params.investmentId,
        address: params.address,
        userInputList: params.userInputList,
        slippage: params.slippage || '0.01',
        tokenId: params.tokenId,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/defi/invest/transaction-data', clean);
}

async function defiRedeem(params) {
    const payload = {
        investmentId: params.investmentId,
        address: params.address,
        chainIndex: params.chainIndex,
        ratio: params.ratio,
        userInputList: params.userInputList,
        tokenId: params.tokenId,
        slippage: params.slippage || '0.01'
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/defi/invest/redeem-data', clean);
}

async function defiClaim(params) {
    const payload = {
        address: params.address,
        rewardType: params.rewardType,
        investmentId: params.investmentId,
        analysisPlatformId: params.analysisPlatformId,
        chainIndex: params.chainIndex,
        tokenId: params.tokenId,
        expectOutputList: params.expectOutputList
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/defi/invest/claim-data', clean);
}

async function defiCalculateEntry(params) {
    const payload = {
        investmentId: params.investmentId,
        address: params.address,
        inputToken: params.inputToken,
        inputAmount: params.inputAmount,
        tokenDecimal: params.tokenDecimal,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/defi/invest/calculate-entry', clean);
}

// ═══════════════════════════════════════════════════════
// DeFi Portfolio API  (/api/v5/defi/user)
// ═══════════════════════════════════════════════════════

async function defiPositions(address, chains) {
    const path = buildGetPath('/api/v5/defi/user/asset-overview', {
        address: address.toLowerCase(),
        chains
    });
    return okxFetch('GET', path);
}

async function defiPositionDetail(address, chainIndex, analysisPlatformId) {
    const path = buildGetPath('/api/v5/defi/user/investment/asset-detail', {
        address: address.toLowerCase(),
        chainIndex,
        analysisPlatformId
    });
    return okxFetch('GET', path);
}

// ═══════════════════════════════════════════════════════
// Agentic Wallet API  (/api/v5/waas)
// ═══════════════════════════════════════════════════════

async function awLogin(email, locale) {
    const payload = {};
    if (email) payload.email = email;
    if (locale) payload.locale = locale;
    return okxFetch('POST', '/api/v5/waas/wallet/login', payload);
}

async function awVerifyOtp(otp) {
    return okxFetch('POST', '/api/v5/waas/wallet/verify', { otp });
}

async function awGetStatus() {
    return okxFetch('GET', '/api/v5/waas/wallet/status');
}

async function awGetBalance(options = {}) {
    const params = {};
    if (options.all) params.all = 'true';
    if (options.chainIndex) params.chainIndex = options.chainIndex;
    if (options.tokenAddress) params.tokenAddress = options.tokenAddress;
    const path = buildGetPath('/api/v5/waas/wallet/balance', params);
    return okxFetch('GET', path);
}

async function awSend(params) {
    const payload = {
        amount: params.amount,
        toAddress: params.toAddress,
        chainIndex: params.chainIndex,
        fromAddress: params.fromAddress,
        contractToken: params.contractToken,
        force: params.force
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/waas/wallet/send', clean);
}

async function awContractCall(params) {
    const payload = {
        toAddress: params.toAddress,
        chainIndex: params.chainIndex,
        amount: params.amount || '0',
        inputData: params.inputData,
        unsignedTx: params.unsignedTx,
        gasLimit: params.gasLimit,
        fromAddress: params.fromAddress,
        mevProtection: params.mevProtection,
        force: params.force
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v5/waas/wallet/contract-call', clean);
}

async function awGetHistory(params = {}) {
    const clean = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const path = buildGetPath('/api/v5/waas/wallet/history', clean);
    return okxFetch('GET', path);
}

async function awSignMessage(params) {
    const payload = {
        chainIndex: params.chainIndex,
        message: params.message,
        fromAddress: params.fromAddress,
        type: params.type || 'personal'
    };
    return okxFetch('POST', '/api/v5/waas/wallet/sign-message', payload);
}

/**
 * Get chains supported by portfolio PnL endpoints
 */
async function getPortfolioSupportedChains() {
    return okxFetch('GET', '/api/v6/dex/market/portfolio/supported/chain');
}

// ═══════════════════════════════════════════════════════
// Leaderboard API  (/api/v6/dex/market/leaderboard)
// ═══════════════════════════════════════════════════════

/**
 * Get chains supported by leaderboard
 */
async function getLeaderboardChains() {
    return okxFetch('GET', '/api/v6/dex/market/leaderboard/supported/chain');
}

/**
 * Get top trader leaderboard
 * @param {object} params
 * @param {string} params.chainIndex
 * @param {string} params.timeFrame - '1'=1D, '2'=3D, '3'=7D, '4'=1M, '5'=3M
 * @param {string} params.sortBy - '1'=PnL, '2'=WinRate, '3'=TxNum, '4'=Volume, '5'=ROI
 * @param {string} [params.walletType] - 'sniper','dev','fresh','pump','smartMoney','influencer'
 */
async function getLeaderboardList(params) {
    const clean = Object.fromEntries(Object.entries({
        chainIndex: params.chainIndex,
        timeFrame: params.timeFrame,
        sortBy: params.sortBy,
        walletType: params.walletType,
        minRealizedPnlUsd: params.minRealizedPnlUsd,
        maxRealizedPnlUsd: params.maxRealizedPnlUsd,
        minWinRatePercent: params.minWinRatePercent,
        maxWinRatePercent: params.maxWinRatePercent,
        minTxs: params.minTxs,
        maxTxs: params.maxTxs,
        minTxVolume: params.minTxVolume,
        maxTxVolume: params.maxTxVolume
    }).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return okxFetch('POST', '/api/v6/dex/market/leaderboard/list', clean);
}

// ═══════════════════════════════════════════════════════
// Convenience helpers
// ═══════════════════════════════════════════════════════

const DEFAULT_CHAINS = String(OKX_CHAIN_INDEX_FALLBACK || 196);

/**
 * Get $BANMAO price on X Layer (convenience)
 */
async function getBanmaoPrice() {
    const { OKX_BANMAO_TOKEN_ADDRESS } = require('../config');
    return getMarketPrice([{
        chainIndex: String(OKX_CHAIN_INDEX_FALLBACK || 196),
        tokenContractAddress: OKX_BANMAO_TOKEN_ADDRESS.toLowerCase()
    }]);
}

module.exports = {
    okxFetch,
    // Wallet
    getWalletTotalValue,
    getWalletBalances,
    getSpecificTokenBalances,
    // Market
    getMarketPrice,
    getMarketCandles,
    getHistoricalCandles,
    getMarketTrades,
    getSignalChains,
    getSignalList,
    getIndexPrice,
    getHistoricalIndexPrice,
    // Token
    getTokenSearch,
    getTokenBasicInfo,
    getTokenPriceInfo,
    getTokenTopList,
    getTokenHolder,
    getTokenAdvancedInfo,
    getTokenLiquidityPool,
    getHotTokens,
    getTopTrader,
    // Token Cluster
    getClusterOverview,
    getClusterTopHolders,
    getClusterList,
    getClusterSupportedChains,
    // Meme Pump Scanner
    getMemePumpChains,
    getMemePumpTokenList,
    getMemePumpTokenDetails,
    getMemePumpDevInfo,
    getMemePumpSimilarTokens,
    getMemePumpBundleInfo,
    getMemePumpApedWallets,
    // Portfolio
    getPortfolioOverview,
    getPortfolioSupportedChains,
    getRecentPnl,
    getTokenLatestPnl,
    getDexHistory,
    // Address Tracker
    getAddressTrackerActivities,
    // Leaderboard
    getLeaderboardChains,
    getLeaderboardList,
    // Transaction History
    getTransactionHistory,
    getTransactionDetail,
    // Swap
    getSwapQuote,
    getSwapTransaction,
    getApproveTransaction,
    getLiquidity,
    // Onchain Gateway
    getGasPrice,
    estimateGasLimit,
    simulateTransaction,
    broadcastTransaction,
    getOrderStatus,
    // Security
    tokenScan,
    dappScan,
    txScan,
    sigScan,
    getApprovals,
    // DeFi Invest
    defiSearch,
    defiDetail,
    defiPrepare,
    defiDeposit,
    defiRedeem,
    defiClaim,
    defiCalculateEntry,
    // DeFi Portfolio
    defiPositions,
    defiPositionDetail,
    // Agentic Wallet
    awLogin,
    awVerifyOtp,
    awGetStatus,
    awGetBalance,
    awSend,
    awContractCall,
    awGetHistory,
    awSignMessage,
    // Helpers
    getBanmaoPrice,
    DEFAULT_CHAINS
};
