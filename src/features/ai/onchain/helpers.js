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
        // Pick the best match (first result)
        const best = data[0];
        return {
            chainIndex: best.chainIndex || chains,
            tokenAddress: best.tokenContractAddress
        };
    } catch (error) {
        return { error: `❌ Could not resolve token "${symbolOrAddress}": ${error.message}` };
    }
}
module.exports = { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken };
