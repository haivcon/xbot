const ethers = require('ethers');

const {
    XLAYER_RPC_URL,
    XLAYER_WS_URLS,
    WALLET_RPC_HEALTH_TIMEOUT,
    ERC20_TRANSFER_TOPIC
} = require('../config/env');
const { normalizeAddressSafe } = require('../utils/helpers');
const { walletWatchers } = require('../core/state');

let xlayerProvider = null;
let xlayerWebsocketProvider = null;

try {
    if (XLAYER_RPC_URL) {
        xlayerProvider = new ethers.JsonRpcProvider(XLAYER_RPC_URL);
    }
} catch (error) {
    console.error(`[RPC] Khong the khoi tao RPC Xlayer: ${error.message}`);
    xlayerProvider = null;
}

function mapWithConcurrency(items, limit, mapper) {
    const tasks = Math.max(1, Math.min(limit || 1, items.length || 0));
    const results = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) {
                return;
            }

            try {
                results[index] = await mapper(items[index], index);
            } catch (error) {
                results[index] = undefined;
            }
        }
    };

    const pool = [];
    for (let i = 0; i < tasks; i += 1) {
        pool.push(runWorker());
    }

    return Promise.all(pool).then(() => results);
}

async function isProviderHealthy(provider, timeoutMs = WALLET_RPC_HEALTH_TIMEOUT) {
    if (!provider || typeof provider.getBlockNumber !== 'function') {
        return false;
    }

    try {
        await Promise.race([
            provider.getBlockNumber(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('rpc_health_timeout')), timeoutMs))
        ]);
        return true;
    } catch (error) {
        console.warn(`[RPC] Provider health check failed: ${error.message}`);
        return false;
    }
}

function getXlayerProvider() {
    return xlayerProvider;
}

function createXlayerWebsocketProvider() {
    if (!XLAYER_WS_URLS.length) {
        return null;
    }

    for (const url of XLAYER_WS_URLS) {
        try {
            const provider = new ethers.WebSocketProvider(url);
            provider.on('error', (error) => {
                console.warn(`[WSS] Loi ket noi WebSocket ${url}: ${error.message}`);
            });
            console.log(`[WSS] Da ket noi toi ${url}`);
            return provider;
        } catch (error) {
            console.warn(`[WSS] Khong the ket noi ${url}: ${error.message}`);
        }
    }

    return null;
}

function getXlayerWebsocketProvider() {
    if (xlayerWebsocketProvider) {
        return xlayerWebsocketProvider;
    }

    xlayerWebsocketProvider = createXlayerWebsocketProvider();
    return xlayerWebsocketProvider;
}

function teardownWalletWatcher(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress);
    const watcher = normalized ? walletWatchers.get(normalized) : null;
    if (!watcher) {
        return;
    }

    if (watcher.provider && watcher.subscriptions) {
        for (const { filter, handler } of watcher.subscriptions) {
            try {
                watcher.provider.off(filter, handler);
            } catch (error) {
                // ignore detach errors
            }
        }
    }

    walletWatchers.delete(normalized);
}

function ensureWalletWatcher(walletAddress, seedTokenAddresses = []) {
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return null;
    }

    let watcher = walletWatchers.get(normalizedWallet);
    if (watcher) {
        for (const token of seedTokenAddresses) {
            const normalized = normalizeAddressSafe(token);
            if (normalized) {
                watcher.tokens.add(normalized.toLowerCase());
            }
        }
        return watcher;
    }

    const provider = getXlayerWebsocketProvider() || getXlayerProvider();
    const tokens = new Set();
    for (const token of seedTokenAddresses) {
        const normalized = normalizeAddressSafe(token);
        if (normalized) {
            tokens.add(normalized.toLowerCase());
        }
    }

    const subscriptions = [];
    const topicWallet = (() => {
        try {
            return ethers.zeroPadValue(normalizedWallet, 32);
        } catch (error) {
            return null;
        }
    })();

    const handler = (log) => {
        if (!log || !log.address) {
            return;
        }
        tokens.add(log.address.toLowerCase());
    };

    if (provider && topicWallet) {
        const incomingFilter = { topics: [ERC20_TRANSFER_TOPIC, null, topicWallet] };
        const outgoingFilter = { topics: [ERC20_TRANSFER_TOPIC, topicWallet] };
        try {
            provider.on(incomingFilter, handler);
            subscriptions.push({ filter: incomingFilter, handler });
        } catch (error) {
            console.warn(`[WSS] Khong the dang ky incoming logs cho ${normalizedWallet}: ${error.message}`);
        }
        try {
            provider.on(outgoingFilter, handler);
            subscriptions.push({ filter: outgoingFilter, handler });
        } catch (error) {
            console.warn(`[WSS] Khong the dang ky outgoing logs cho ${normalizedWallet}: ${error.message}`);
        }
    }

    watcher = { wallet: normalizedWallet, tokens, provider, subscriptions };
    walletWatchers.set(normalizedWallet, watcher);
    return watcher;
}

function seedWalletWatcher(walletAddress, tokenAddresses = []) {
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return null;
    }

    let watcher = walletWatchers.get(normalizedWallet);
    if (!watcher) {
        watcher = ensureWalletWatcher(normalizedWallet, tokenAddresses);
    } else {
        for (const tokenAddress of tokenAddresses) {
            const normalizedToken = normalizeAddressSafe(tokenAddress);
            if (normalizedToken) {
                watcher.tokens.add(normalizedToken.toLowerCase());
            }
        }
    }

    return watcher;
}

module.exports = {
    mapWithConcurrency,
    isProviderHealthy,
    getXlayerProvider,
    getXlayerWebsocketProvider,
    teardownWalletWatcher,
    ensureWalletWatcher,
    seedWalletWatcher
};
