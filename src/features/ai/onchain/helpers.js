const onchainos = require('../../../services/onchainos');
const CHAIN_RPC_MAP = {
    '196': 'https://rpc.xlayer.tech',
    '1': 'https://eth.llamarpc.com',
    '56': 'https://bsc-dataseed1.binance.org',
    '42161': 'https://arb1.arbitrum.io/rpc',
    '8453': 'https://mainnet.base.org',
    '137': 'https://polygon-rpc.com',
    '501': 'https://api.mainnet-beta.solana.com',
};
const CHAIN_EXPLORER_MAP = {
    '196': 'https://www.okx.com/web3/explorer/xlayer',
    '1': 'https://etherscan.io',
    '56': 'https://bscscan.com',
    '42161': 'https://arbiscan.io',
    '8453': 'https://basescan.org',
    '137': 'https://polygonscan.com',
    '501': 'https://solscan.io',
};
function _getChainRpc(chainIndex) {
    return CHAIN_RPC_MAP[String(chainIndex)] || CHAIN_RPC_MAP['196'];
}
function _getExplorerUrl(chainIndex) {
    return CHAIN_EXPLORER_MAP[String(chainIndex)] || CHAIN_EXPLORER_MAP['196'];
}

// ═══════════════════════════════════════════════════════
// Security helpers
// ═══════════════════════════════════════════════════════
const crypto = require('crypto');

function _getEncryptKey() {
    const secret = process.env.WALLET_ENCRYPT_SECRET || process.env.TELEGRAM_TOKEN || '';
    return secret.slice(0, 32).padEnd(32, '0');
}

function _hashPin(pin, salt) {
    return crypto.createHash('sha256').update(pin + ':' + salt).digest('hex');
}

function _verifyPin(inputPin, storedPin, salt) {
    // Backward compatible: if stored PIN is 4 digits (plaintext), compare directly
    if (/^\d{4}$/.test(storedPin)) {
        return inputPin === storedPin;
    }
    // Otherwise compare hashes
    return _hashPin(inputPin, salt) === storedPin;
}
async function autoResolveToken(symbolOrAddress, chainIndex) {
    try {
        const chains = chainIndex || '196';
        const data = await onchainos.getTokenSearch(chains, symbolOrAddress);
        if (!data || !Array.isArray(data) || data.length === 0) {
            return { error: `❌ Token "${symbolOrAddress}" not found. Please provide a valid contract address or try a different search term.` };
        }
        // Pick the best match by prioritizing verified tokens and high liquidity/volume
        data.sort((a, b) => {
            const aVerified = (a.isVerified || a.verified || a.verifiedStatus || false) ? 1 : 0;
            const bVerified = (b.isVerified || b.verified || b.verifiedStatus || false) ? 1 : 0;
            if (aVerified !== bVerified) return bVerified - aVerified;

            const aScore = parseFloat(a.liquidityUsd || a.liquidity || a.marketCap || a.volume || 0);
            const bScore = parseFloat(b.liquidityUsd || b.liquidity || b.marketCap || b.volume || 0);
            return bScore - aScore;
        });
        const best = data[0];
        const resolvedAddress = best.tokenContractAddress;
        const resolvedChain = best.chainIndex || chains;

        // Advisory: verify the contract actually exists on-chain (log warning if not, but don't block)
        try {
            const ethers = require('ethers');
            const rpcUrl = _getChainRpc(resolvedChain);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const code = await provider.getCode(resolvedAddress);
            if (!code || code === '0x' || code === '0x0') {
                console.warn(`[autoResolveToken] ⚠️ Address ${resolvedAddress} has no bytecode on chain ${resolvedChain} — may be EOA or not yet deployed. Continuing anyway.`);
            }
        } catch (verifyErr) {
            console.warn(`[autoResolveToken] Contract verification skipped:`, verifyErr.message);
        }

        return {
            chainIndex: resolvedChain,
            tokenAddress: resolvedAddress
        };
    } catch (error) {
        return { error: `❌ Could not resolve token "${symbolOrAddress}": ${error.message}` };
    }
}
function detectPromptLanguage(userText, defaultLang = 'en') {
    if (!userText) return defaultLang;
    if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/.test(userText)) return 'vi';
    if (/[\u4e00-\u9fa5]/.test(userText)) return 'zh';
    if (/[\uac00-\ud7af]/.test(userText)) return 'ko';
    if (/[а-яА-ЯёЁ]/.test(userText)) return 'ru';
    if (/\b(saya|kamu|di|ke|dari|untuk|bisa|tidak|ya|halo|tolong|ada|berapa|saldo|dompet|transfer|kirim)\b/.test(userText)) return 'id';
    return defaultLang;
}

// ═══════════════════════════════════════════════════════
// Enhancement #1: RPC Retry with exponential backoff
// ═══════════════════════════════════════════════════════
async function rpcRetry(fn, maxAttempts = 3, label = 'RPC') {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const isRetryable = /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|502|503|504|rate limit|overloaded/i.test(err.message || '');
            if (!isRetryable || attempt === maxAttempts) throw err;
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s (max 5s)
            console.warn(`[${label}] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

// ═══════════════════════════════════════════════════════
// Enhancement #2: Nonce Manager for batch operations
// ═══════════════════════════════════════════════════════
function createNonceManager(provider) {
    const nonceCache = new Map(); // address → next nonce
    return {
        async getNonce(address) {
            if (!nonceCache.has(address)) {
                const currentNonce = await provider.getTransactionCount(address, 'pending');
                nonceCache.set(address, currentNonce);
                return currentNonce;
            }
            const next = nonceCache.get(address);
            nonceCache.set(address, next + 1);
            return next;
        },
        reset(address) {
            nonceCache.delete(address);
        }
    };
}

// ═══════════════════════════════════════════════════════
// Enhancement #3: Balance pre-check
// ═══════════════════════════════════════════════════════
async function checkTokenBalance(provider, walletAddress, tokenAddress, requiredAmount, chainIndex) {
    const ethers = require('ethers');
    const isNative = !tokenAddress || tokenAddress === 'native' || tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    if (isNative) {
        const balance = await provider.getBalance(walletAddress);
        if (balance < BigInt(requiredAmount)) {
            const balHuman = ethers.formatEther(balance);
            const reqHuman = ethers.formatEther(BigInt(requiredAmount));
            return { sufficient: false, balance: balHuman, required: reqHuman, symbol: 'native' };
        }
        return { sufficient: true };
    } else {
        const erc20 = new ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)'], provider);
        const balance = await erc20.balanceOf(walletAddress);
        if (balance < BigInt(requiredAmount)) {
            let decimals = 18, symbol = 'Token';
            try { decimals = await erc20.decimals(); } catch (e) { }
            try { symbol = await erc20.symbol(); } catch (e) { }
            const balHuman = ethers.formatUnits(balance, decimals);
            const reqHuman = ethers.formatUnits(BigInt(requiredAmount), decimals);
            return { sufficient: false, balance: balHuman, required: reqHuman, symbol };
        }
        return { sufficient: true };
    }
}

module.exports = { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken, detectPromptLanguage, rpcRetry, createNonceManager, checkTokenBalance };
