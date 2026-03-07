const { ethers } = require('ethers');

function createWalletOverview({
    db,
    normalizeAddressSafe,
    shortenAddress,
    mapWithConcurrency,
    WALLET_BALANCE_CONCURRENCY,
    fetchOkxDexWalletHoldings,
    formatBigIntValue,
    decimalToRawBigInt,
    multiplyDecimalStrings
}) {
    async function fetchLiveWalletTokens(walletAddress, options = {}) {
        const { chainContext = null } = options;
        const normalizedWallet = normalizeAddressSafe(walletAddress);
        if (!normalizedWallet) {
            return { tokens: [], warning: 'wallet_invalid' };
        }

        let dexSnapshot;
        try {
            dexSnapshot = await fetchOkxDexWalletHoldings(normalizedWallet, { chainContext });
        } catch (error) {
            console.warn(`[DexHoldings] Failed to load live balances for ${shortenAddress(normalizedWallet)}: ${error.message}`);
            return { tokens: [], warning: 'wallet_error' };
        }

        const mappedTokens = await mapWithConcurrency(dexSnapshot.tokens || [], WALLET_BALANCE_CONCURRENCY, async (holding) => {
            const decimals = Number.isFinite(holding.decimals) ? holding.decimals : 18;
            let amountText = null;
            let numericAmount = null;
            let amountExactText = null;

            const rawCandidate = holding.amountRaw ?? holding.rawBalance ?? null;
            if (rawCandidate !== null && rawCandidate !== undefined) {
                try {
                    const bigIntValue = typeof rawCandidate === 'bigint' ? rawCandidate : BigInt(rawCandidate);
                    amountText = formatBigIntValue(bigIntValue, decimals, {
                        maximumFractionDigits: Math.min(6, Math.max(2, decimals))
                    });
                    numericAmount = Number(ethers.formatUnits(bigIntValue, decimals));
                    amountExactText = ethers.formatUnits(bigIntValue, decimals);
                } catch (error) {
                    // ignore raw formatting errors
                }
            }

            if (!amountText && (holding.balance !== undefined || holding.coinAmount !== undefined || holding.amount !== undefined)) {
                const fallbackAmount = holding.balance ?? holding.coinAmount ?? holding.amount;
                if (fallbackAmount !== undefined && fallbackAmount !== null) {
                    amountText = String(fallbackAmount);
                }
                const numericFallback = Number(fallbackAmount);
                if (!Number.isFinite(numericAmount) && Number.isFinite(numericFallback)) {
                    numericAmount = numericFallback;
                }
                if (!numericAmount && Number.isFinite(decimals)) {
                    const raw = decimalToRawBigInt(fallbackAmount, decimals);
                    if (raw !== null) {
                        try {
                            numericAmount = Number(ethers.formatUnits(raw, decimals));
                        } catch (error) {
                            // ignore
                        }
                    }
                }
            }

            if (!amountText) {
                amountText = String(rawCandidate ?? holding.balance ?? holding.coinAmount ?? '0');
            }

            if (!amountExactText && amountText) {
                amountExactText = String(rawCandidate ?? holding.balance ?? holding.coinAmount ?? amountText);
            }

            const unitPriceText = holding.tokenPrice !== undefined && holding.tokenPrice !== null
                ? String(holding.tokenPrice)
                : null;
            const unitPriceUsd = Number.isFinite(Number(unitPriceText)) ? Number(unitPriceText) : null;

            let totalValueUsd = Number.isFinite(Number(holding.currencyAmount)) ? Number(holding.currencyAmount) : null;
            if ((!Number.isFinite(totalValueUsd) || totalValueUsd === null) && Number.isFinite(numericAmount) && Number.isFinite(unitPriceUsd)) {
                totalValueUsd = numericAmount * unitPriceUsd;
            }

            const totalValueExactText = amountExactText && unitPriceText
                ? multiplyDecimalStrings(amountExactText, unitPriceText)
                : null;

            return {
                tokenAddress: holding.tokenAddress,
                tokenLabel: holding.symbol || holding.name || 'Token',
                symbol: holding.symbol || holding.tokenSymbol || holding.tokenLabel || holding.name || null,
                amountText,
                valueText: null,
                chainIndex: holding.chainIndex,
                walletAddress: holding.walletAddress || normalizedWallet,
                isRiskToken: holding.isRiskToken === true,
                unitPriceUsd: Number.isFinite(unitPriceUsd) ? unitPriceUsd : null,
                unitPriceText,
                totalValueUsd: Number.isFinite(totalValueUsd) ? totalValueUsd : null,
                currencyAmount: Number.isFinite(Number(holding.currencyAmount)) ? Number(holding.currencyAmount) : null,
                totalValueExactText: totalValueExactText || null
            };
        });

        const filtered = mappedTokens.filter(Boolean);

        const fallbackTokens = [];
        if (filtered.length === 0 && Array.isArray(dexSnapshot.tokens) && dexSnapshot.tokens.length > 0) {
            for (const raw of dexSnapshot.tokens) {
                if (!raw) continue;
                const amountText = raw.balance ?? raw.coinAmount ?? raw.amount ?? raw.rawBalance ?? '0';
                const amountExactText = raw.amountRaw !== undefined && raw.amountRaw !== null && Number.isFinite(raw.decimals)
                    ? ethers.formatUnits(raw.amountRaw, raw.decimals)
                    : String(amountText);
                const tokenLabel = raw.symbol || raw.tokenSymbol || raw.tokenName || raw.name || 'Token';
                const chainIndex = raw.chainIndex || raw.chainId || raw.chain || raw.chain_id;
                const walletAddr = raw.address || raw.walletAddress || normalizedWallet;
                const numericAmount = Number(raw.balance ?? raw.coinAmount ?? raw.amount ?? raw.rawBalance ?? raw.amountRaw ?? 0);
                const unitPriceText = raw.tokenPrice !== undefined && raw.tokenPrice !== null ? String(raw.tokenPrice) : null;
                const unitPriceUsd = Number.isFinite(Number(unitPriceText)) ? Number(unitPriceText) : null;
                const totalValueUsd = Number.isFinite(numericAmount) && Number.isFinite(unitPriceUsd)
                    ? numericAmount * unitPriceUsd
                    : null;
                const totalValueExactText = amountExactText && unitPriceText
                    ? multiplyDecimalStrings(amountExactText, unitPriceText)
                    : null;
                fallbackTokens.push({
                    tokenAddress: raw.tokenAddress || raw.tokenContractAddress || null,
                    tokenLabel,
                    symbol: raw.symbol || raw.tokenSymbol || raw.tokenName || raw.name || null,
                    amountText: String(amountText),
                    valueText: null,
                    chainIndex,
                    walletAddress: walletAddr,
                    isRiskToken: Boolean(raw.isRiskToken),
                    unitPriceUsd: Number.isFinite(unitPriceUsd) ? unitPriceUsd : null,
                    unitPriceText,
                    totalValueUsd: Number.isFinite(totalValueUsd) ? totalValueUsd : null,
                    currencyAmount: Number.isFinite(Number(raw.currencyAmount)) ? Number(raw.currencyAmount) : null,
                    totalValueExactText: totalValueExactText || null
                });
            }
        }

        return {
            tokens: filtered.length > 0 ? filtered : fallbackTokens,
            warning: null,
            totalUsd: Number.isFinite(dexSnapshot?.totalUsd) ? dexSnapshot.totalUsd : null
        };
    }

    async function loadWalletOverviewEntries(chatId, options = {}) {
        let wallets = await db.getWalletsForUser(chatId);
        if (options.targetWallet) {
            const target = normalizeAddressSafe(options.targetWallet) || options.targetWallet;
            wallets = wallets.filter((wallet) => {
                const address = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
                return address && address.toLowerCase() === (target || '').toLowerCase();
            });
            if (wallets.length === 0 && target) {
                wallets = [{ address: target, name: null }];
            }
        }

        const results = [];
        for (const wallet of wallets) {
            const normalized = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
            const displayName = typeof wallet?.name === 'string' && wallet.name.trim() ? wallet.name.trim() : null;
            let tokens = [];
            let warning = null;
            let cached = false;
            let totalUsd = null;

            try {
                const live = await fetchLiveWalletTokens(normalized, {
                    chatId,
                    chainContext: options.chainContext,
                    forceDex: true
                });
                tokens = live?.tokens || [];
                warning = live?.warning || null;
                totalUsd = Number.isFinite(live?.totalUsd) ? live.totalUsd : null;

                if (tokens.length > 0) {
                    await db.saveWalletHoldingsCache(chatId, normalized, tokens);
                } else if (!options.forceLive) {
                    const cachedSnapshot = await db.getWalletHoldingsCache(chatId, normalized);
                    if (Array.isArray(cachedSnapshot.tokens) && cachedSnapshot.tokens.length > 0) {
                        tokens = cachedSnapshot.tokens;
                        cached = true;
                        warning = warning || 'wallet_cached';
                    } else if (!warning) {
                        warning = 'wallet_overview_wallet_no_token';
                    }
                }
            } catch (error) {
                warning = error?.code || 'wallet_error';
                console.warn(`[WalletOverview] Failed to load ${normalized}: ${error.message}`);
            }

            results.push({ address: normalized, name: displayName, tokens, warning, cached, totalUsd });
        }

        return results;
    }

    return {
        loadWalletOverviewEntries,
        fetchLiveWalletTokens
    };
}

module.exports = { createWalletOverview };
