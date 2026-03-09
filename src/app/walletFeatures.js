const logger = require('../core/logger');
const log = logger.child('Wallet');

function createWalletFeatures({ t, escapeHtml, formatCopyableValueHtml, splitTelegramMessageText, buildThreadedOptions, normalizeAddressSafe, normalizeOkxConfigAddress, normalizeNumeric, shortenAddress, buildOkxPortfolioAnalysisUrl, registerWalletTokenContext, appendCloseButton, WALLET_TOKEN_BUTTON_LIMIT, WALLET_TOKEN_ACTIONS, WALLET_TOKEN_ACTION_LOOKUP, WALLET_TOKEN_CANDLE_DAY_SPAN, WALLET_TOKEN_CANDLE_RECENT_LIMIT, WALLET_TOKEN_CANDLE_RECENT_BAR, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS, WALLET_TOKEN_TX_HISTORY_LIMIT, WALLET_TOKEN_TRADE_LIMIT, WALLET_TOKEN_HOLDER_LIMIT, TOKEN_PRICE_CACHE_TTL, OKX_QUOTE_TOKEN_ADDRESS, OKX_BANMAO_TOKEN_ADDRESS, OKX_OKB_TOKEN_ADDRESSES, OKX_OKB_SYMBOL_KEYS, hasOkxCredentials, callOkxDexEndpoint, fetchOkxDexBalanceSnapshot, pickOkxNumeric, ensureOkxChainDirectory, resolveChainContextShortName, unwrapOkxData, unwrapOkxFirst, walletTokenActionCache, tokenPriceCache, loadWalletOverviewEntries, fetchTokenMarketSnapshot, formatTokenQuantity, resolveTopTokenChainEntry, buildWalletActionKeyboard, subtractDecimalStrings }) {
    const WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS = (() => {
        const value = Number(process.env.WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS || 15000);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 15000;
    })();
    const WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS = (() => {
        const value = Number(process.env.WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS || 120000);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 120000;
    })();
    const WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS = (() => {
        const value = Number(process.env.WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS || 60000);
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 60000;
    })();
    const WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES = (() => {
        const value = Number(process.env.WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES || 256);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 256;
    })();
    const OKX_DEX_DEFAULT_MAX_RETRIES = (() => {
        const value = Number(process.env.OKX_DEX_DEFAULT_MAX_RETRIES || 3);
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 3;
    })();
    const OKX_DEX_DEFAULT_RETRY_DELAY_MS = (() => {
        const value = Number(process.env.OKX_DEX_DEFAULT_RETRY_DELAY_MS || 1200);
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1200;
    })();
    const WALLET_TOKEN_HISTORY_MAX_PAGES = (() => {
        const value = Number(process.env.WALLET_TOKEN_HISTORY_MAX_PAGES || 4);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4;
    })();
    const WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES = (() => {
        const value = Number(process.env.WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES || 2);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
    })();
    const WALLET_TOKEN_HISTORY_FALLBACK_BAR = process.env.WALLET_TOKEN_HISTORY_FALLBACK_BAR || '1d';
    const WALLET_TOKEN_HISTORY_FALLBACK_LIMIT = (() => {
        const value = Number(process.env.WALLET_TOKEN_HISTORY_FALLBACK_LIMIT || 10);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
    })();
    const WALLET_TOKEN_HISTORY_DEFAULT_LIMIT = (() => {
        const value = Number(process.env.WALLET_TOKEN_HISTORY_DEFAULT_LIMIT || 30);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
    })();
    const WALLET_TOKEN_HISTORY_DEFAULT_PERIOD = process.env.WALLET_TOKEN_HISTORY_DEFAULT_PERIOD || '1d';
    const WALLET_TOKEN_HISTORY_MAX_LIMIT = (() => {
        const value = Number(process.env.WALLET_TOKEN_HISTORY_MAX_LIMIT || 200);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200;
    })();
    const WALLET_TOKEN_HISTORY_PERIOD_MS = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '60d': 60 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000
    };
    const WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP = {
        '30m': '30m',
        '1h': '1h',
        '12h': '1h',
        '1d': '1d',
        '7d': '1d',
        '30d': '1d',
        '60d': '1d',
        '90d': '1d'
    };
    const WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000
    };
    const OKX_CANDLE_BAR_MAP = {
        '1m': '1m',
        '3m': '3m',
        '5m': '5m',
        '15m': '15m',
        '30m': '30m',
        '1h': '1H',
        '1hour': '1H',
        '2h': '2H',
        '4h': '4H',
        '6h': '6H',
        '12h': '12H',
        '1d': '1D',
        '1day': '1D',
        '24h': '1D',
        '2d': '2D',
        '2day': '2D',
        '3d': '3D',
        '7d': '7D',
        '14d': '14D',
        '30d': '30D',
        '30day': '30D',
        '60d': '60D',
        '60day': '60D',
        '90d': '90D',
        '90day': '90D',
        '1w': '1W',
        '1mo': '1M',
        '1mth': '1M',
        '1month': '1M',
        '1mutc': '1Mutc',
        '3mutc': '3Mutc',
        '6hutc': '6Hutc',
        '12hutc': '12Hutc',
        '1dutc': '1Dutc',
        '1wutc': '1Wutc'
    };
    
    
    // --- KH?I T?O CÁC D?CH V? ---
    // db.init() s? du?c g?i trong hàm main()
    
    
    function buildContractLookupUrl(contractAddress) {
        return `https://www.oklink.com/multi-search#key=${contractAddress}`;
    }
    
    function maskApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.length <= 8) {
            return '••••';
        }
        const trimmed = apiKey.trim();
        return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
    }
    
    
    async function fetchDexOverviewForWallet(walletAddress, options = {}) {
        const normalized = normalizeAddressSafe(walletAddress);
        if (!normalized) {
            return { tokens: [], totalUsd: null };
        }
    
        try {
            const snapshot = await fetchOkxDexBalanceSnapshot(normalized, options);
            return { tokens: snapshot.tokens || [], totalUsd: snapshot.totalUsd ?? null };
        } catch (error) {
            log.child('WalletDex').warn(`Failed to fetch snapshot for ${shortenAddress(normalized)}: ${error.message}`);
            return { tokens: [], totalUsd: null };
        }
    }
    
    function formatDexChainLabel(entry, lang) {
        if (!entry) {
            return lang ? t(lang, 'wallet_balance_chain_unknown') : 'Unknown chain';
        }
    
        const chainShort = entry.chainShortName || entry.chainName || entry.chain;
        const chainIndex = Number.isFinite(entry.chainIndex)
            ? Number(entry.chainIndex)
            : Number.isFinite(entry.chainId)
                ? Number(entry.chainId)
                : Number.isFinite(entry.chain)
                    ? Number(entry.chain)
                    : null;
    
        if (chainShort && chainIndex) {
            return `${chainShort} (#${chainIndex})`;
        }
        if (chainShort) {
            return chainShort;
        }
        if (chainIndex) {
            return `#${chainIndex}`;
        }
        return lang ? t(lang, 'wallet_balance_chain_unknown') : 'Unknown chain';
    }
    
    function describeDexTokenValue(token, lang) {
        const symbol = token.symbol || token.tokenSymbol || token.tokenLabel || token.name || 'Token';
        const symbolLabel = String(symbol);
        const balanceValueRaw = token.amountText
            || token.balance
            || token.amount
            || token.rawBalance
            || token.available
            || token.currencyAmount
            || '0';
        const balanceValue = formatNumberValue(balanceValueRaw, { maximumFractionDigits: 6 });
        const balanceHtml = `${escapeHtml(String(balanceValue))} ${escapeHtml(symbolLabel)}`;

        const totalUsd = Number.isFinite(token.totalValueUsd)
            ? Number(token.totalValueUsd)
            : (Number.isFinite(Number(token.currencyAmount)) ? Number(token.currencyAmount) : null);
        const formattedTotalUsd = Number.isFinite(totalUsd) && totalUsd > 0
            ? formatFiatValue(totalUsd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : null;
        const unitPriceRaw = token.unitPriceText
            || (token.tokenPrice !== undefined && token.tokenPrice !== null ? String(token.tokenPrice) : null)
            || (Number.isFinite(token.unitPriceUsd) ? String(token.unitPriceUsd) : null);
        const unitPriceFormatted = formatNumberValue(unitPriceRaw, { maximumFractionDigits: 6 });
        const priceLabel = unitPriceRaw
            ? escapeHtml(`${unitPriceFormatted} USD/${symbolLabel}`)
            : escapeHtml(t(lang, 'wallet_dex_token_value_unknown'));

        const totalParts = [];
        if (token.totalValueExactText) {
            totalParts.push(`${formatNumberValue(token.totalValueExactText)} USD`);
        } else if (formattedTotalUsd) {
            totalParts.push(`${formattedTotalUsd} USD`);
        }
        if (token.valueText) {
            totalParts.push(formatNumberValue(token.valueText));
        }

        const totalLabel = totalParts.length > 0
            ? totalParts.map((part) => escapeHtml(part)).join(' / ')
            : escapeHtml(t(lang, 'wallet_dex_token_value_unknown'));
    
        return {
            symbolLabel,
            balanceHtml,
            priceLabel,
            totalLabel,
            unitPriceRaw,
            formattedTotalUsd
        };
    }
    
    function resolveTokenContractAddress(token) {
        if (!token || typeof token !== 'object') {
            return null;
        }
    
        const candidates = [
            token.tokenContractAddress,
            token.tokenAddress,
            token.contractAddress,
            token.token,
            token.address
        ];
    
        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }
            const normalized = normalizeAddressSafe(candidate);
            if (normalized) {
                return normalized;
            }
            if (typeof candidate === 'string' && candidate.startsWith('native:')) {
                return candidate;
            }
        }
    
        return null;
    }
    
    function buildWalletDexOverviewText(lang, walletAddress, overview, options = {}) {
        const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;
        const walletHtml = normalizedWallet
            ? formatCopyableValueHtml(normalizedWallet)
            : t(lang, 'wallet_balance_contract_unknown');
        const lines = [t(lang, 'wallet_dex_overview_title', { wallet: walletHtml })];
        lines.push(t(lang, 'wallet_dex_wallet_line', { wallet: walletHtml }));
    
        if (options.chainLabel) {
            lines.push(t(lang, 'wallet_balance_chain_line', { chain: escapeHtml(options.chainLabel) }));
        }
    
    const pageSize = 3;
    const rawTokens = Array.isArray(overview.tokens) ? overview.tokens : [];
    const derivedTotalUsd = rawTokens.reduce((sum, token) => {
        const candidate = Number(
            token?.totalUsd
            ?? token?.totalValueUsd
            ?? token?.currencyAmount
            ?? token?.valueUsd
            ?? token?.usdValue
        );
        return Number.isFinite(candidate) ? sum + candidate : sum;
    }, 0);
    const totalUsdValue = Number.isFinite(overview.totalUsd) ? overview.totalUsd : derivedTotalUsd;
    if (Number.isFinite(totalUsdValue)) {
        const formattedTotal = formatFiatValue(totalUsdValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (formattedTotal) {
            lines.push(t(lang, 'wallet_dex_total_value', { value: escapeHtml(formattedTotal) }));
        }
    }

    const totalPages = Math.max(1, Math.ceil(rawTokens.length / pageSize));
    const currentPage = Math.min(Math.max(Number(options.page) || 0, 0), totalPages - 1);
    const tokens = rawTokens.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
    if (tokens.length === 0) {
        lines.push(t(lang, 'wallet_dex_no_tokens'));
        appendPortfolioLinkAndHint(lines, lang, normalizedWallet, options.analysisUrl);
        return lines.join('\n');
    }
    
        tokens.forEach((token, idx) => {
            const meta = describeDexTokenValue(token, lang);
            const symbolLabel = meta.symbolLabel;
            const riskLabel = token.isRiskToken || token.riskToken || token.tokenRisk
                ? t(lang, 'wallet_dex_risk_yes')
                : t(lang, 'wallet_dex_risk_no');
    
            const contractRaw = token.tokenContractAddress
                || token.tokenAddress
                || token.contractAddress
                || token.token
                || null;
            const contractHtml = formatCopyableValueHtml(String(contractRaw || '').replace(/^native:/, ''))
                || t(lang, 'wallet_balance_contract_unknown');
    
            lines.push('');
            const tokenChainLabelRaw = formatDexChainLabel(token, lang);
            const tokenChainLabel = (!tokenChainLabelRaw || tokenChainLabelRaw === t(lang, 'wallet_balance_chain_unknown'))
                ? (options.chainLabel || tokenChainLabelRaw)
                : tokenChainLabelRaw;
    
        lines.push(t(lang, 'wallet_dex_token_header', {
            index: (currentPage * pageSize + idx + 1).toString(),
            symbol: escapeHtml(String(symbolLabel)),
            chain: escapeHtml(tokenChainLabel || '')
        }));
            lines.push(t(lang, 'wallet_dex_token_balance', { balance: meta.balanceHtml }));
            lines.push(t(lang, 'wallet_dex_token_value', { value: meta.priceLabel }));
            lines.push(t(lang, 'wallet_dex_token_total_value', { total: meta.totalLabel }));
            lines.push(t(lang, 'wallet_dex_token_contract', { contract: contractHtml }));
            lines.push(t(lang, 'wallet_dex_token_risk', { risk: escapeHtml(riskLabel) }));
        });
    
    if (totalPages > 1) {
        lines.push('');
        lines.push(t(lang, 'wallet_dex_page_label', { page: currentPage + 1, total: totalPages }));
    }

    appendPortfolioLinkAndHint(lines, lang, normalizedWallet, options.analysisUrl);
    return lines.join('\n');
    }
    
    function appendPortfolioLinkAndHint(lines, lang, walletAddress, customUrl) {
        const analysisUrl = customUrl || buildOkxPortfolioAnalysisUrl(walletAddress);
        lines.push('');
        if (analysisUrl) {
            lines.push(t(lang, 'wallet_dex_analysis_link', { url: escapeHtml(analysisUrl) }));
        }
        lines.push(t(lang, 'wallet_dex_copy_hint'));
    }
    
    function buildWalletTokenButtonRows(lang, tokens, options = {}) {
        if (!Array.isArray(tokens) || tokens.length === 0) {
            return [];
        }
    
        const normalizedWallet = normalizeAddressSafe(options.wallet) || options.wallet || null;
        const chainContext = options.chainContext || null;
        const chainLabel = options.chainLabel || (chainContext ? formatDexChainLabel(chainContext, lang) : null);
        const limit = Number.isFinite(options.maxButtons) ? Math.max(1, options.maxButtons) : WALLET_TOKEN_BUTTON_LIMIT;
        const rows = [];
        let currentRow = [];
    
        for (const token of tokens.slice(0, limit)) {
            if (!token) {
                continue;
            }
            const callbackId = registerWalletTokenContext({
                wallet: normalizedWallet,
                chainContext,
                chainLabel,
                chainCallbackData: options.chainCallbackData || null,
                token
            });
            if (!callbackId) {
                continue;
            }
    
            const meta = describeDexTokenValue(token, lang);
            const symbol = meta.symbolLabel || 'Token';
            const truncatedSymbol = symbol.length > 16 ? `${symbol.slice(0, 13)}` : symbol;
            currentRow.push({
                text: `🪙 ${truncatedSymbol}`,
                callback_data: `wallet_token_view|${callbackId}`
            });
    
            if (currentRow.length === 2) {
                rows.push(currentRow);
                currentRow = [];
            }
        }
    
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }
    
        return rows;
    }
    
    function buildWalletTokenMenu(context, lang, options = {}) {
        const token = context?.token || {};
        const meta = describeDexTokenValue(token, lang);
        const walletHtml = context?.wallet
            ? formatCopyableValueHtml(context.wallet)
            : t(lang, 'wallet_balance_contract_unknown');
        const chainLabel = context?.chainLabel || formatDexChainLabel(context?.chainContext || token, lang);
        const contractAddress = resolveTokenContractAddress(token);
        const contractHtml = contractAddress
            ? formatCopyableValueHtml(contractAddress)
            : t(lang, 'wallet_balance_contract_unknown');

        const actionResult = options.actionResult;

        // Holder view: send only holder details, without the full token header
        if (actionResult?.actionKey === 'holder') {
            const holderLines = [];
            const metrics = Array.isArray(actionResult.metrics) ? actionResult.metrics : [];
            const entries = Array.isArray(actionResult.listEntries) ? actionResult.listEntries : [];

            if (actionResult.listLabel) {
                holderLines.push(escapeHtml(String(actionResult.listLabel)));
            } else if (actionResult.actionLabel) {
                holderLines.push(escapeHtml(String(actionResult.actionLabel)));
            }

            metrics.forEach((metric) => {
                if (!metric || metric.value === undefined || metric.value === null) return;
                holderLines.push(`${escapeHtml(String(metric.label))}: ${escapeHtml(String(metric.value))}`);
            });

            if (entries.length > 0) {
                if (holderLines.length > 0) {
                    holderLines.push('');
                }
                entries.forEach((entry) => holderLines.push(`- ${String(entry)}`));
            } else if (metrics.length === 0) {
                holderLines.push(t(lang, 'wallet_token_action_result_empty'));
            }

            const holderText = holderLines.filter(Boolean).join('\n').trim();
            return {
                text: holderText,
                replyMarkup: buildWalletTokenActionKeyboard(context, lang),
                extraTexts: []
            };
        }

        const lines = [
            t(lang, 'wallet_token_menu_title', { symbol: escapeHtml(meta.symbolLabel || 'Token') }),
            t(lang, 'wallet_dex_wallet_line', { wallet: walletHtml }),
            t(lang, 'wallet_balance_chain_line', { chain: escapeHtml(chainLabel) }),
            t(lang, 'wallet_dex_token_balance', { balance: meta.balanceHtml }),
            t(lang, 'wallet_dex_token_value', { value: meta.priceLabel }),
            t(lang, 'wallet_dex_token_total_value', { total: meta.totalLabel }),
            t(lang, 'wallet_dex_token_contract', { contract: contractHtml }),
            '',
            t(lang, 'wallet_token_menu_hint')
        ];

        if (actionResult) {
            lines.push('');
            lines.push(t(lang, 'wallet_token_action_result_title', {
                symbol: escapeHtml(meta.symbolLabel || 'Token'),
                action: escapeHtml(actionResult.actionLabel || '')
            }));

            const metrics = Array.isArray(actionResult.metrics) ? actionResult.metrics : [];
            metrics.forEach((metric) => {
                if (!metric || !metric.label || metric.value === undefined || metric.value === null) {
                    return;
                }
                lines.push(t(lang, 'wallet_token_action_metric_line', {
                    label: `- ${escapeHtml(String(metric.label))}`,
                    value: escapeHtml(String(metric.value))
                }));
            });

            const entries = Array.isArray(actionResult.listEntries) ? actionResult.listEntries : [];
            if (entries.length > 0) {
                lines.push('');
                const listLabel = actionResult.listLabel || actionResult.actionLabel || '';
                if (listLabel) {
                    lines.push(t(lang, 'wallet_token_action_list_header', { label: escapeHtml(listLabel) }));
                }
                entries.forEach((entry) => {
                    lines.push(`- ${String(entry)}`);
                });
            } else if (metrics.length === 0) {
                lines.push(t(lang, 'wallet_token_action_result_empty'));
            }
        }

        const text = lines.join('\n');
        const chunks = splitTelegramMessageText(text);
        const primaryText = chunks.shift() || '';

        return {
            text: primaryText,
            replyMarkup: buildWalletTokenActionKeyboard(context, lang),
            extraTexts: chunks
        };
    }

async function sendWalletTokenExtraTexts(botInstance, chatId, extraTexts, options = {}) {
        if (!botInstance || !chatId || !Array.isArray(extraTexts) || extraTexts.length === 0) {
            return;
        }
    
        const { source = null, replyMarkup = null } = options;
    
        for (const chunk of extraTexts) {
            const text = typeof chunk === 'string' ? chunk : '';
            if (!text || !text.trim()) {
                continue;
            }
            try {
                const messageOptions = buildThreadedOptions(source, { parse_mode: 'HTML' });
                if (replyMarkup) {
                    messageOptions.reply_markup = replyMarkup;
                }
                await botInstance.sendMessage(chatId, text, messageOptions);
            } catch (error) {
                log.child('WalletToken').warn(`Failed to send extra chunk: ${error.message}`);
                break;
            }
        }
    }
    
    function buildWalletTokenActionKeyboard(context, lang) {
        const rows = [];
        const tokenId = context?.tokenCallbackId;
    
        if (tokenId) {
            let currentRow = [];
            for (const action of WALLET_TOKEN_ACTIONS) {
                currentRow.push({
                    text: t(lang, action.labelKey),
                    callback_data: `wallet_token_action|${tokenId}|${action.key}`
                });
                if (currentRow.length === 2) {
                    rows.push(currentRow);
                    currentRow = [];
                }
            }
            if (currentRow.length > 0) {
                rows.push(currentRow);
            }
    
        }
    
        if (context?.chainCallbackData) {
            rows.push([{ text: t(lang, 'wallet_token_back_to_assets'), callback_data: context.chainCallbackData }]);
        }
    
        rows.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
        return { inline_keyboard: rows };
    }
    
    async function buildWalletTokenActionResult(actionKey, context, lang) {
        const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
        if (!config) {
            throw new Error('wallet_token_action_unknown');
        }
    
        const payload = await fetchWalletTokenActionPayload(actionKey, context);
        return normalizeWalletTokenActionResult(actionKey, payload, lang, context);
    }
    
    async function fetchWalletTokenActionPayload(actionKey, context) {
        const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
        if (!config) {
            throw new Error('wallet_token_action_unknown');
        }
    
        const tokenAddress = resolveTokenContractAddress(context?.token);
        if (!tokenAddress) {
            throw new Error('wallet_token_missing_contract');
        }
    
        const baseQuery = buildOkxTokenQueryFromContext(context);
        const query = { ...baseQuery };
    
        let handler = null;
        switch (actionKey) {
            case 'historical_price': {
                applyWalletTokenHistoricalPriceWindow(query);
                handler = () => fetchWalletTokenHistoricalPricePayload(query, config);
                break;
            }
            case 'price_info': {
                const historyQuery = buildOkxTokenQueryFromContext(context);
                applyWalletTokenPriceInfoHistoryWindow(historyQuery);
                handler = async () => {
                    const [priceInfoPayload, historyPayload] = await Promise.all([
                        callOkxDexEndpoint(config.path, query, {
                            method: config.method || 'GET',
                            auth: hasOkxCredentials,
                            allowFallback: true,
                            bodyType: config.bodyType
                        }),
                        fetchWalletTokenHistoricalPricePayload(historyQuery, {
                            path: '/api/v6/dex/index/historical-price',
                            method: 'GET'
                        })
                    ]);
    
                    return { priceInfo: priceInfoPayload, history: historyPayload };
                };
                break;
            }
            case 'candles':
                query.bar = normalizeOkxCandleBar(query.bar, WALLET_TOKEN_CANDLE_RECENT_BAR) || WALLET_TOKEN_CANDLE_RECENT_BAR;
                query.limit = Math.min(WALLET_TOKEN_CANDLE_RECENT_LIMIT, query.limit || WALLET_TOKEN_CANDLE_RECENT_LIMIT);
                break;
            case 'historical_candles':
                query.bar = normalizeOkxCandleBar(query.bar, '1Dutc') || '1Dutc';
                query.limit = Math.min(WALLET_TOKEN_CANDLE_DAY_SPAN, query.limit || WALLET_TOKEN_CANDLE_DAY_SPAN);
                break;
            case 'latest_price':
                query.limit = Math.min(WALLET_TOKEN_TRADE_LIMIT, query.limit || WALLET_TOKEN_TRADE_LIMIT);
                break;
            case 'wallet_history': {
                const walletAddress = context?.wallet;
                if (!walletAddress) {
                    throw new Error('wallet_token_missing_wallet');
                }
    
                query.address = query.address || walletAddress;
                query.tokenContractAddress = query.tokenContractAddress || tokenAddress;
    
                const chainFilter = query.chainIndex ?? query.chainId ?? query.chainShortName;
                if (chainFilter !== undefined && chainFilter !== null) {
                    query.chains = chainFilter;
                }
    
                query.limit = Math.min(WALLET_TOKEN_TX_HISTORY_LIMIT, query.limit || WALLET_TOKEN_TX_HISTORY_LIMIT);
                break;
            }
            case 'price_info':
                if (query.limit === undefined || query.limit === null) {
                    delete query.limit;
                }
                break;
            case 'holder':
                query.limit = Math.min(WALLET_TOKEN_HOLDER_LIMIT, query.limit || WALLET_TOKEN_HOLDER_LIMIT);
                break;
            default:
                break;
        }
    
        if (!handler) {
            handler = () => callOkxDexEndpoint(config.path, query, {
                method: config.method || 'GET',
                auth: hasOkxCredentials,
                allowFallback: true,
                bodyType: config.bodyType
            });
        }
    
        const cacheKey = buildWalletTokenActionCacheKey(actionKey, context, query);
        const cacheTtl = resolveWalletTokenActionCacheTtl(actionKey);
        const cacheEntry = cacheKey ? getWalletTokenActionCacheEntry(cacheKey) : null;
        const cachedValue = cacheEntry && !cacheEntry.expired ? cacheEntry.value : null;
        const staleCacheValue = cacheEntry && cacheEntry.expired ? cacheEntry.value : null;
    
        if (cachedValue) {
            return cachedValue;
        }
    
        try {
            const payload = await handler();
            if (cacheKey && cacheTtl > 0 && payload) {
                setWalletTokenActionCacheEntry(cacheKey, payload, cacheTtl);
            }
            return payload;
        } catch (error) {
            if (staleCacheValue) {
                return staleCacheValue;
            }
            throw error;
        }
    }
    
    async function fetchWalletTokenHistoricalPricePayload(query, config) {
        const combinedEntries = [];
        let cursor = query.cursor !== undefined ? query.cursor : null;
        let lastPayload = null;
        let lastFlattenedEntries = null;
        let lastUniquePriceCount = 0;
        const normalizedTargetPeriod = normalizeWalletTokenHistoryPeriod('1d');
    
        for (let page = 0; page < WALLET_TOKEN_HISTORY_MAX_PAGES; page += 1) {
            const requestQuery = { ...query };
            if (cursor !== undefined && cursor !== null && String(cursor).trim()) {
                requestQuery.cursor = cursor;
            } else {
                delete requestQuery.cursor;
            }
    
            const payload = await callOkxDexEndpoint(config.path, requestQuery, {
                method: config.method || 'GET',
                auth: hasOkxCredentials,
                allowFallback: true,
                bodyType: config.bodyType
            });
    
            lastPayload = payload;
            const pageEntries = unwrapOkxData(payload) || [];
            if (pageEntries.length === 0) {
                break;
            }
    
            combinedEntries.push(...pageEntries);
    
            const flattenedEntries = expandWalletTokenHistoryEntries(combinedEntries);
            const resampledEntries = resampleWalletTokenHistoryEntries(flattenedEntries, normalizedTargetPeriod);
            const uniquePriceCount = countDistinctWalletTokenHistoryPrices(resampledEntries);
            lastFlattenedEntries = resampledEntries;
            lastUniquePriceCount = uniquePriceCount;
            const nextCursor = extractOkxPayloadCursor(payload);
    
            if (uniquePriceCount >= WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES || !nextCursor || nextCursor === cursor) {
                break;
            }
    
            cursor = nextCursor;
        }
    
        const flattenedEntries = lastFlattenedEntries
            || resampleWalletTokenHistoryEntries(expandWalletTokenHistoryEntries(combinedEntries), normalizedTargetPeriod);
        const uniquePriceCount = lastUniquePriceCount || countDistinctWalletTokenHistoryPrices(flattenedEntries);
    
        if (flattenedEntries.length === 0 || uniquePriceCount < WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES) {
            const fallbackPayload = await fetchWalletTokenHistoricalPriceFallback(query, normalizedTargetPeriod);
            if (fallbackPayload) {
                return fallbackPayload;
            }
        }
    
        if (flattenedEntries.length > 0) {
            return { data: flattenedEntries };
        }
    
        return lastPayload || { data: [] };
    }
    
    function getWalletTokenHistoryWindowDays() {
        return Math.max(1, normalizeWalletTokenHistoryLimit(WALLET_TOKEN_HISTORY_DEFAULT_LIMIT));
    }
    
    function applyWalletTokenHistoricalPriceWindow(query) {
        if (!query) {
            return;
        }
    
        const dailyMs = WALLET_TOKEN_HISTORY_PERIOD_MS['1d'] || 24 * 60 * 60 * 1000;
        const limit = getWalletTokenHistoryWindowDays();
        const now = Date.now();
        const alignedEnd = Math.floor(now / dailyMs) * dailyMs;
        const begin = Math.max(0, alignedEnd - limit * dailyMs);
    
        query.period = '1d';
        query.limit = limit;
        query.begin = String(begin);
        query.end = String(alignedEnd);
        if ('cursor' in query) {
            delete query.cursor;
        }
    }
    
    function applyWalletTokenPriceInfoHistoryWindow(query) {
        if (!query) {
            return;
        }
    
        const dailyMs = WALLET_TOKEN_HISTORY_PERIOD_MS['1d'] || 24 * 60 * 60 * 1000;
        const limit = Math.max(1, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS);
        const now = Date.now();
        const alignedEnd = Math.floor(now / dailyMs) * dailyMs;
        const begin = Math.max(0, alignedEnd - limit * dailyMs);
    
        query.period = '1d';
        query.limit = limit;
        query.begin = String(begin);
        query.end = String(alignedEnd);
        if ('cursor' in query) {
            delete query.cursor;
        }
    }
    
    async function fetchWalletTokenHistoricalPriceFallback(query, targetPeriod) {
        const fallbackQuery = buildWalletTokenHistoricalPriceFallbackQuery(query);
        const barVariants = buildOkxCandleBarFallbackVariants(fallbackQuery.bar);
    
        for (const barVariant of barVariants) {
            const attemptQuery = { ...fallbackQuery };
            if (barVariant) {
                attemptQuery.bar = barVariant;
            } else {
                delete attemptQuery.bar;
            }
    
            try {
                const payload = await callOkxDexEndpoint('/api/v6/dex/market/historical-candles', attemptQuery, {
                    method: 'POST',
                    auth: hasOkxCredentials,
                    allowFallback: true
                });
    
                const entries = unwrapOkxData(payload) || [];
                const normalizedEntries = convertWalletTokenCandlesToHistoryEntries(entries);
                const resampledEntries = resampleWalletTokenHistoryEntries(normalizedEntries, targetPeriod);
                if (resampledEntries.length === 0) {
                    continue;
                }
    
                return { data: resampledEntries };
            } catch (error) {
                if (!isOkxBarParameterError(error)) {
                    log.child('WalletToken').warn(`Failed to fetch historical price fallback: ${error.message}`);
                    return null;
                }
    
                log.child('WalletToken').warn(`Candle fallback rejected bar "${attemptQuery.bar}": ${error.message}`);
            }
        }
    
        log.child('WalletToken').warn('Candle fallback exhausted all bar variants without data');
        return null;
    }
    
    function buildWalletTokenHistoricalPriceFallbackQuery(query) {
        const fallback = { ...query };
        delete fallback.cursor;
        delete fallback.begin;
        delete fallback.end;
        delete fallback.period;
        if (!fallback.bar) {
            fallback.bar = WALLET_TOKEN_HISTORY_FALLBACK_BAR;
        }
        const normalizedBar = normalizeOkxCandleBar(fallback.bar, WALLET_TOKEN_HISTORY_FALLBACK_BAR);
        if (normalizedBar) {
            fallback.bar = normalizedBar;
        }
        if (!fallback.limit) {
            fallback.limit = WALLET_TOKEN_HISTORY_FALLBACK_LIMIT;
        }
        return fallback;
    }
    
    function buildOkxCandleBarFallbackVariants(bar) {
        const variants = [];
        const addVariant = (value) => {
            if (!value) {
                return;
            }
            const normalized = String(value).trim();
            if (!normalized) {
                return;
            }
            if (!variants.includes(normalized)) {
                variants.push(normalized);
            }
        };
    
        const preferred = normalizeOkxCandleBar(bar, WALLET_TOKEN_HISTORY_FALLBACK_BAR)
            || WALLET_TOKEN_HISTORY_FALLBACK_BAR
            || null;
        if (preferred) {
            addVariant(preferred);
            addVariant(preferred.toUpperCase());
            addVariant(preferred.toLowerCase());
    
            const match = preferred.match(/^(\d+)([A-Za-z]+)/);
            if (match) {
                const [, amount, unit] = match;
                const lowerUnit = unit.toLowerCase();
                if (lowerUnit === 'd') {
                    addVariant(`${amount}day`);
                    addVariant(`${amount}Day`);
                    addVariant(`${amount}DAY`);
                }
                if (lowerUnit === 'h') {
                    addVariant(`${amount}hour`);
                    addVariant(`${amount}Hour`);
                }
            }
        }
    
        if (!variants.includes(null)) {
            variants.push(null);
        }
    
        return variants;
    }
    
    function isOkxBarParameterError(error) {
        if (!error || !error.message) {
            return false;
        }
    
        const message = String(error.message).toLowerCase();
        return message.includes('parameter bar error');
    }
    
    function normalizeWalletTokenHistoryLimit(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return Math.min(WALLET_TOKEN_HISTORY_DEFAULT_LIMIT, WALLET_TOKEN_HISTORY_MAX_LIMIT);
        }
        return Math.min(Math.floor(numeric), WALLET_TOKEN_HISTORY_MAX_LIMIT);
    }
    
    function normalizeWalletTokenHistoryPeriod(value) {
        const fallback = WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]
            ? WALLET_TOKEN_HISTORY_DEFAULT_PERIOD
            : '1d';
        if (value === undefined || value === null) {
            return fallback;
        }
        const text = String(value).trim();
        if (!text) {
            return fallback;
        }
        if (WALLET_TOKEN_HISTORY_PERIOD_MS[text]) {
            return text;
        }
        return fallback;
    }
    
    function resolveWalletTokenHistoryRequestPeriod(period) {
        const normalized = normalizeWalletTokenHistoryPeriod(period);
        if (WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[normalized]) {
            return WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[normalized];
        }
        if (WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[normalized]) {
            return normalized;
        }
        return WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]
            || WALLET_TOKEN_HISTORY_DEFAULT_PERIOD
            || '1d';
    }
    
    function getWalletTokenHistoryBucketMs(period) {
        if (period && WALLET_TOKEN_HISTORY_PERIOD_MS[period]) {
            return WALLET_TOKEN_HISTORY_PERIOD_MS[period];
        }
        if (WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]) {
            return WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD];
        }
        return null;
    }
    
    function getWalletTokenHistoryRequestPeriodMs(period) {
        if (period && WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[period]) {
            return WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[period];
        }
        return null;
    }
    
    function normalizeOkxCandleBar(value, fallback = null) {
        const normalizeValue = (input) => {
            if (input === undefined || input === null) {
                return null;
            }
            const key = String(input).trim().toLowerCase();
            if (!key) {
                return null;
            }
            return OKX_CANDLE_BAR_MAP[key] || null;
        };
    
        return normalizeValue(value) || normalizeValue(fallback);
    }
    
    function convertWalletTokenCandlesToHistoryEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }
    
        return entries
            .map((row) => normalizeWalletTokenCandleHistoryEntry(row))
            .filter(Boolean);
    }
    
    function normalizeWalletTokenCandleHistoryEntry(row) {
        if (!row) {
            return null;
        }
    
        let timestamp = null;
        let price = null;
    
        if (Array.isArray(row)) {
            timestamp = row.length > 0 ? row[0] : null;
            const closeValue = row.length > 4 ? row[4] : row[1];
            if (closeValue !== undefined && closeValue !== null) {
                price = String(closeValue).trim();
            }
        } else if (typeof row === 'object') {
            timestamp = row.ts ?? row.timestamp ?? row.time ?? row.date ?? null;
            const closeValue = row.close ?? row.c ?? row.price ?? row.avgPrice;
            if (closeValue !== undefined && closeValue !== null) {
                price = String(closeValue).trim();
            }
        }
    
        if ((timestamp === undefined || timestamp === null) || !price) {
            return null;
        }
    
        return { time: timestamp, price, close: price };
    }
    
    function buildOkxTokenQueryFromContext(context, overrides = {}) {
        const query = { ...overrides };
        const chainContext = context?.chainContext || {};
        const token = context?.token || {};
        const tokenAddress = resolveTokenContractAddress(token);
    
        if (tokenAddress) {
            query.tokenAddress = query.tokenAddress || tokenAddress;
            query.tokenContractAddress = query.tokenContractAddress || tokenAddress;
            query.contractAddress = query.contractAddress || tokenAddress;
            query.baseTokenAddress = query.baseTokenAddress || tokenAddress;
            query.fromTokenAddress = query.fromTokenAddress || tokenAddress;
        }
    
        const chainIndex = Number.isFinite(token?.chainIndex)
            ? Number(token.chainIndex)
            : Number.isFinite(chainContext?.chainIndex)
                ? Number(chainContext.chainIndex)
                : null;
        const chainId = Number.isFinite(token?.chainId)
            ? Number(token.chainId)
            : Number.isFinite(chainContext?.chainId)
                ? Number(chainContext.chainId)
                : chainIndex;
    
        if (Number.isFinite(chainIndex) && !Number.isFinite(query.chainIndex)) {
            query.chainIndex = chainIndex;
        }
        if (Number.isFinite(chainId) && !Number.isFinite(query.chainId)) {
            query.chainId = chainId;
        }
    
        const chainShortName = resolveChainContextShortName(chainContext) || chainContext.chainShortName;
        if (chainShortName && !query.chainShortName) {
            query.chainShortName = chainShortName;
        }
    
        if (context?.wallet && !query.walletAddress) {
            query.walletAddress = context.wallet;
        }
    
        if (OKX_QUOTE_TOKEN_ADDRESS) {
            query.quoteTokenAddress = query.quoteTokenAddress || OKX_QUOTE_TOKEN_ADDRESS;
            query.toTokenAddress = query.toTokenAddress || OKX_QUOTE_TOKEN_ADDRESS;
        }
    
        return query;
    }
    
    function resolveWalletTokenActionCacheTtl(actionKey) {
        switch (actionKey) {
            case 'historical_price':
            case 'historical_candles':
                return WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS;
            default:
                return WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS;
        }
    }
    
    function buildWalletTokenActionCacheKey(actionKey, context, query = null) {
        if (!actionKey) {
            return null;
        }
    
        const chainContext = context?.chainContext || {};
        const tokenAddress = resolveTokenContractAddress(context?.token) || context?.token?.address;
        const normalizedToken = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : '';
        const normalizedQuery = normalizeWalletTokenCacheQuery(query);
    
        try {
            return JSON.stringify({
                actionKey,
                token: normalizedToken,
                chain: chainContext.chainIndex ?? chainContext.chainId ?? chainContext.chainShortName ?? '',
                wallet: context?.wallet || '',
                query: normalizedQuery
            });
        } catch (error) {
            return null;
        }
    }
    
    function normalizeWalletTokenCacheQuery(query) {
        if (!query || typeof query !== 'object') {
            return null;
        }
    
        const entries = Object.entries(query)
            .filter(([_, value]) => value !== undefined && value !== null)
            .sort(([a], [b]) => a.localeCompare(b));
    
        return entries.reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
    }
    
    function getWalletTokenActionCacheEntry(cacheKey) {
        if (!cacheKey || !walletTokenActionCache.has(cacheKey)) {
            return null;
        }
    
        const entry = walletTokenActionCache.get(cacheKey);
        if (!entry) {
            walletTokenActionCache.delete(cacheKey);
            return null;
        }
    
        const now = Date.now();
        const expired = typeof entry.expiresAt === 'number' && entry.expiresAt <= now;
    
        return {
            value: cloneJsonValue(entry.value),
            expired
        };
    }
    
    function setWalletTokenActionCacheEntry(cacheKey, payload, ttlMs) {
        if (!cacheKey || !payload || !Number.isFinite(ttlMs) || ttlMs <= 0) {
            return;
        }
    
        pruneWalletTokenActionCache();
    
        walletTokenActionCache.set(cacheKey, {
            value: cloneJsonValue(payload),
            expiresAt: Date.now() + ttlMs
        });
    }
    
    function pruneWalletTokenActionCache() {
        const now = Date.now();
    
        for (const [cacheKey, entry] of walletTokenActionCache.entries()) {
            if (!entry) {
                walletTokenActionCache.delete(cacheKey);
                continue;
            }
    
            const expiresAt = typeof entry.expiresAt === 'number' ? entry.expiresAt : 0;
            if (expiresAt && expiresAt + WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS < now) {
                walletTokenActionCache.delete(cacheKey);
            }
        }
    
        while (walletTokenActionCache.size > WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES) {
            const oldestKey = walletTokenActionCache.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            walletTokenActionCache.delete(oldestKey);
        }
    }
    
    function cloneJsonValue(value) {
        if (value === undefined || value === null) {
            return value;
        }
        if (typeof value !== 'object') {
            return value;
        }
    
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }
    
    function isTelegramMessageNotModifiedError(error) {
        if (!error) {
            return false;
        }
    
        const description = error?.response?.body?.description || error?.message || '';
        return typeof description === 'string'
            ? description.toLowerCase().includes('message is not modified')
            : false;
    }
    
    function extractOkxPayloadCursor(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }
    
        const candidates = [];
        if (payload.cursor !== undefined && payload.cursor !== null) {
            candidates.push(payload.cursor);
        }
        if (payload.nextCursor !== undefined && payload.nextCursor !== null) {
            candidates.push(payload.nextCursor);
        }
    
        const directData = payload.data;
        if (Array.isArray(directData)) {
            for (const entry of directData) {
                if (entry && entry.cursor !== undefined && entry.cursor !== null) {
                    candidates.push(entry.cursor);
                    break;
                }
            }
        } else if (directData && typeof directData === 'object') {
            if (directData.cursor !== undefined && directData.cursor !== null) {
                candidates.push(directData.cursor);
            }
            if (Array.isArray(directData.data)) {
                for (const entry of directData.data) {
                    if (entry && entry.cursor !== undefined && entry.cursor !== null) {
                        candidates.push(entry.cursor);
                        break;
                    }
                }
            }
        }
    
        for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) {
                continue;
            }
            const normalized = String(candidate).trim();
            if (normalized) {
                return normalized;
            }
        }
    
        return null;
    }
    
    function normalizeWalletTokenActionResult(actionKey, payload, lang, context = null) {
        const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
        const actionLabel = config ? t(lang, config.labelKey) : actionKey;
        const result = {
            actionLabel,
            actionKey,
            metrics: [],
            listEntries: [],
            listLabel: null
        };
    
        const entries = unwrapOkxData(payload) || [];
        const primaryEntry = unwrapOkxFirst(payload) || (entries.length > 0 ? entries[0] : null);
        switch (actionKey) {
            case 'current_price': {
                result.metrics.push(...buildWalletTokenPriceMetrics(primaryEntry, actionKey));
                break;
            }
            case 'price_info': {
                const priceInfoEntry = unwrapOkxFirst(payload?.priceInfo) || primaryEntry;
                result.metrics.push(...buildWalletTokenPriceInfoMetrics(priceInfoEntry));
    
                const historyEntries = expandWalletTokenHistoryEntries(unwrapOkxData(payload?.history) || entries);
                const sortedHistory = sortWalletTokenHistoryEntries(historyEntries);
                const dailyLimit = Math.max(1, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS);
                const formattedHistory = [];
    
                for (let i = 0; i < sortedHistory.length && formattedHistory.length < dailyLimit; i += 1) {
                    const row = sortedHistory[i];
                    const prev = i + 1 < sortedHistory.length ? sortedHistory[i + 1] : null;
                    const formatted = formatWalletTokenHistoryEntry(row, prev, lang);
                    if (formatted) {
                        formattedHistory.push(formatted);
                    }
                }
    
                result.listEntries = formattedHistory;
                if (result.listEntries.length > 0) {
                    result.listLabel = t(lang, 'wallet_token_action_price_info_history_label', {
                        days: WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS
                    }) || actionLabel;
                }
                break;
            }
            case 'historical_price': {
                const historyEntries = expandWalletTokenHistoryEntries(entries);
                const sortedHistoryEntries = sortWalletTokenHistoryEntries(historyEntries);
                const formattedEntries = [];
                const historyDays = getWalletTokenHistoryWindowDays();
                const maxHistoryEntries = Math.max(1, Math.min(historyDays, sortedHistoryEntries.length));
    
                for (let i = 0; i < sortedHistoryEntries.length && formattedEntries.length < maxHistoryEntries; i += 1) {
                    const row = sortedHistoryEntries[i];
                    const previousRow = i + 1 < sortedHistoryEntries.length ? sortedHistoryEntries[i + 1] : null;
                    const formatted = formatWalletTokenHistoryEntry(row, previousRow, lang);
                    if (formatted) {
                        formattedEntries.push(formatted);
                    }
                }
    
                result.listEntries = formattedEntries;
                const historyLabel = t(lang, 'wallet_token_action_history_last_days', { days: historyDays }) || actionLabel;
                result.listLabel = historyLabel;
                break;
            }
            case 'candles': {
                const candleInsights = buildWalletTokenCandleInsights(entries, lang, {
                    windowLabel: t(lang, 'wallet_token_action_candles_label_recent', { hours: 24 }),
                    defaultWindowLabel: '24h'
                });
                result.listEntries = candleInsights.entries;
                result.listLabel = candleInsights.label || actionLabel;
                break;
            }
            case 'historical_candles': {
                const candleInsights = buildWalletTokenCandleInsights(entries, lang, {
                    windowLabel: t(lang, 'wallet_token_action_historical_candles_label', {
                        days: WALLET_TOKEN_CANDLE_DAY_SPAN
                    }),
                    defaultWindowLabel: `${WALLET_TOKEN_CANDLE_DAY_SPAN}D`
                });
                result.listEntries = candleInsights.entries;
                result.listLabel = candleInsights.label || actionLabel;
                break;
            }
            case 'token_info': {
                if (primaryEntry) {
                    const name = primaryEntry.name || primaryEntry.tokenName;
                    const symbol = primaryEntry.symbol || primaryEntry.tokenSymbol;
                    if (name || symbol) {
                        result.metrics.push({ label: '🪙 Token', value: [name, symbol].filter(Boolean).join(' / ') });
                    }
                    const decimals = pickOkxNumeric(primaryEntry, ['decimals', 'decimal', 'tokenDecimal']);
                    if (Number.isFinite(decimals)) {
                        result.metrics.push({ label: '🔢 Decimals', value: decimals });
                    }
                    const supply = pickOkxNumeric(primaryEntry, ['supply', 'totalSupply', 'circulatingSupply']);
                    if (Number.isFinite(supply)) {
                        result.metrics.push({ label: '🔄 Supply', value: supply });
                    }
                    const holders = pickOkxNumeric(primaryEntry, ['holderCount', 'holders']);
                    if (Number.isFinite(holders)) {
                        result.metrics.push({ label: '👥 Holders', value: holders });
                    }
                    const website = primaryEntry.website || primaryEntry.site;
                    if (website) {
                        result.metrics.push({ label: '🌐 Website', value: website });
                    }
                }
                result.listEntries = buildWalletTokenTokenInfoEntries(primaryEntry);
                if (result.listEntries.length > 0) {
                    result.listLabel = t(lang, 'wallet_token_action_token_info_list_label') || actionLabel;
                }
                break;
            }
            case 'latest_price': {
                const formattedTrades = [];
                const maxTrades = Math.min(WALLET_TOKEN_TRADE_LIMIT, entries.length);
                for (let i = 0; i < maxTrades; i += 1) {
                    const entry = entries[i];
                    const formatted = formatWalletTokenTradeEntry(entry, i);
                    if (formatted) {
                        formattedTrades.push(formatted);
                    }
                }
                result.listEntries = formattedTrades;
                result.listLabel = t(lang, 'wallet_token_action_latest_price_list_label', {
                    count: WALLET_TOKEN_TRADE_LIMIT
                }) || actionLabel;
                if (result.listEntries.length === 0) {
                    const fallbackEntry = formatWalletTokenTradeEntry(primaryEntry, 0);
                    if (fallbackEntry) {
                        result.listEntries.push(fallbackEntry);
                    }
                }
                break;
            }
            case 'wallet_history': {
                const walletAddress = context?.wallet || null;
                const tokenAddress = resolveTokenContractAddress(context?.token) || null;
                const tokenSymbol = describeDexTokenValue(context?.token || {}, lang).symbolLabel || primaryEntry?.symbol;
    
                const historyEntries = collectWalletHistoryEntries(payload, tokenAddress);
                const { entries: limitedEntries, buyStats, sellStats } = summarizeWalletHistoryEntries(
                    historyEntries,
                    walletAddress,
                    tokenSymbol
                );
    
                result.metrics.push({
                    label: t(lang, 'wallet_token_action_wallet_history_metric_buys'),
                    value: t(lang, 'wallet_token_action_wallet_history_metric_value', {
                        count: buyStats.count,
                        total: buyStats.total,
                        symbol: tokenSymbol || 'TOKEN'
                    })
                });
    
                result.metrics.push({
                    label: t(lang, 'wallet_token_action_wallet_history_metric_sells'),
                    value: t(lang, 'wallet_token_action_wallet_history_metric_value', {
                        count: sellStats.count,
                        total: sellStats.total,
                        symbol: tokenSymbol || 'TOKEN'
                    })
                });
    
                result.listEntries = limitedEntries.map((entry, index) =>
                    formatWalletHistoryEntry(entry, walletAddress, tokenSymbol, index)
                );
                if (result.listEntries.length > 0) {
                    result.listLabel = t(lang, 'wallet_token_action_wallet_history_list_label', {
                        count: result.listEntries.length
                    }) || actionLabel;
                }
                break;
            }
            case 'holder': {
                const total = pickOkxNumeric(primaryEntry || payload?.data || {}, ['holderCount', 'holders', 'total']);
                if (Number.isFinite(total)) {
                    result.metrics.push({ label: 'Total holders', value: formatNumberValue(total, { maximumFractionDigits: 0 }) });
                }
                const formattedHolders = [];
                const holderLimit = Math.min(WALLET_TOKEN_HOLDER_LIMIT, entries.length);
                for (let i = 0; i < holderLimit; i += 1) {
                    const entry = entries[i];
                    const formatted = formatWalletTokenHolderEntry(entry, i);
                    if (formatted) {
                        formattedHolders.push(formatted);
                    }
                }
                result.listEntries = formattedHolders;
                result.listLabel = t(lang, 'wallet_token_action_holder_list_label', {
                    count: WALLET_TOKEN_HOLDER_LIMIT
                }) || actionLabel;
                break;
            }
            default:
                break;
        }

        return result;
    }

    function extractOkxPriceValue(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const numeric = pickOkxNumeric(entry, ['price', 'indexPrice', 'latestPrice', 'last', 'lastPrice']);
        if (Number.isFinite(numeric)) {
            return numeric;
        }

        const fallback = entry.price ?? entry.indexPrice ?? entry.latestPrice ?? entry.last ?? entry.lastPrice;
        if (fallback === undefined || fallback === null) {
            return null;
        }
        return fallback;
    }

    function buildWalletTokenPriceMetrics(entry, actionKey) {
        const metrics = [];
        if (!entry) {
            return metrics;
        }
    
        const price = extractOkxPriceValue(entry);
        if (price !== null && price !== undefined) {
            metrics.push({ label: '💵 Price', value: `${price} USD` });
        }
    
        const changeAbs = pickOkxNumeric(entry, ['usdChange24h', 'change24h', 'change', 'priceChange']);
        if (Number.isFinite(changeAbs)) {
            metrics.push({ label: 'Δ Change (24h)', value: changeAbs });
        }
    
        const changePercent = pickOkxNumeric(entry, ['changeRate', 'changePercent', 'change24hPercent', 'percentChange', 'changePct']);
        if (Number.isFinite(changePercent)) {
            metrics.push({ label: '📈 Change %', value: `${changePercent}%` });
        }
    
        const volume = pickOkxNumeric(entry, ['volume24h', 'usdVolume24h', 'turnover24h', 'volume']);
        if (Number.isFinite(volume)) {
            metrics.push({ label: '📊 Volume 24h', value: volume });
        }
    
        if (actionKey === 'price_info') {
            const high24h = pickOkxNumeric(entry, ['high24h', 'priceHigh24h', 'highestPrice24h', 'high']);
            if (Number.isFinite(high24h)) {
                metrics.push({ label: '🔼 24h High', value: high24h });
            }
            const low24h = pickOkxNumeric(entry, ['low24h', 'priceLow24h', 'lowestPrice24h', 'low']);
            if (Number.isFinite(low24h)) {
                metricspush({ label: '🔽 24h Low', value: low24h });
            }
            const volume30d = pickOkxNumeric(entry, ['volume30d', 'usdVolume30d', 'thirtyDayVolume', 'volume30Days', 'turnover30d']);
            if (Number.isFinite(volume30d)) {
                metrics.push({ label: '📊 Volume (30d)', value: volume30d });
            }
        }
    
        const liquidity = pickOkxNumeric(entry, ['liquidity', 'liquidityUsd', 'usdLiquidity']);
        if (Number.isFinite(liquidity)) {
            metrics.push({ label: '💧 Liquidity', value: liquidity });
        }
    
        const marketCap = pickOkxNumeric(entry, ['marketCap', 'marketCapUsd', 'fdvUsd', 'fullyDilutedMarketCap']);
        if (Number.isFinite(marketCap)) {
            metrics.push({ label: '🏦 Market cap', value: marketCap });
        }
    
        const timestamp = entry.ts || entry.timestamp || entry.time;
        const timestampLabel = formatWalletTokenTimestamp(timestamp);
        if (timestampLabel) {
            metrics.push({ label: '🕒 Timestamp', value: timestampLabel });
        }
    
        const source = entry.source || entry.market || entry.venue;
        if (source) {
            metrics.push({ label: '🔗 Source', value: source });
        }
    
        return metrics;
    }
    
    function buildWalletTokenPriceInfoMetrics(entry) {
        const metrics = [];
        if (!entry) {
            return metrics;
        }
    
        const timestamp = entry.time || entry.ts || entry.timestamp;
        const label = formatWalletTokenTimestamp(timestamp);
        if (label) {
            metrics.push({ label: '🕒 Time', value: label });
        }
    
        const price = entry.price || entry.latestPrice;
        if (price !== undefined && price !== null) {
            metrics.push({ label: '💵 Price', value: `${price} USD` });
        }
    
        const marketCap = pickOkxNumeric(entry, ['marketCap']);
        if (Number.isFinite(marketCap)) {
            metrics.push({ label: '🏦 Market cap', value: marketCap });
        }
    
        if (entry.minPrice !== undefined && entry.minPrice !== null) {
            metrics.push({ label: '🔽 24h Low', value: entry.minPrice });
        }
    
        if (entry.maxPrice !== undefined && entry.maxPrice !== null) {
            metrics.push({ label: '🔼 24h High', value: entry.maxPrice });
        }
    
        const tradeNum = pickOkxNumeric(entry, ['tradeNum']);
        if (Number.isFinite(tradeNum)) {
            metrics.push({ label: '?? Trades (24h)', value: tradeNum });
        }
    
        const changeKeys = [
            ['priceChange5M', 'priceChange5m'],
            ['priceChange1H', 'priceChange1h'],
            ['priceChange4H', 'priceChange4h'],
            ['priceChange24H', 'priceChange24h']
        ];
        for (const pair of changeKeys) {
            for (const key of pair) {
                if (entry[key] !== undefined && entry[key] !== null) {
                    metrics.push({ label: `Δ ${key.replace('priceChange', '')}`, value: `${entry[key]}%` });
                    break;
                }
            }
        }
    
        const volumeKeys = [
            ['volume5M', 'volume5m'],
            ['volume1H', 'volume1h'],
            ['volume4H', 'volume4h'],
            ['volume24H', 'volume24h']
        ];
        for (const pair of volumeKeys) {
            for (const key of pair) {
                const volume = pickOkxNumeric(entry, [key]);
                if (Number.isFinite(volume)) {
                    metrics.push({ label: `📊 ${key.replace('volume', 'Vol ')}`, value: volume });
                    break;
                }
            }
        }
    
        const txKeys = [
            ['txs5M', 'txs5m'],
            ['txs1H', 'txs1h'],
            ['txs4H', 'txs4h'],
            ['txs24H', 'txs24h']
        ];
        for (const pair of txKeys) {
            for (const key of pair) {
                const txs = pickOkxNumeric(entry, [key]);
                if (Number.isFinite(txs)) {
                    metrics.push({ label: `🔄 ${key.replace('txs', 'Txs ')}`, value: txs });
                    break;
                }
            }
        }
    
        const circSupply = pickOkxNumeric(entry, ['circSupply', 'circulatingSupply']);
        if (Number.isFinite(circSupply)) {
            metrics.push({ label: '🔄 Circulating supply', value: circSupply });
        }
    
        const liquidity = pickOkxNumeric(entry, ['liquidity']);
        if (Number.isFinite(liquidity)) {
            metrics.push({ label: '💧 Liquidity', value: liquidity });
        }
    
        const holders = pickOkxNumeric(entry, ['holders', 'holderCount']);
        if (Number.isFinite(holders)) {
            metrics.push({ label: '👥 Holders', value: holders });
        }
    
        return metrics;
    }
    
    function formatWalletTokenTimestamp(value) {
        if (value === undefined || value === null) {
            return null;
        }
    
        let numeric = null;
        if (typeof value === 'number') {
            numeric = value;
        } else if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^-?\d+$/.test(trimmed)) {
                numeric = Number(trimmed);
            } else {
                return trimmed;
            }
        } else {
            return null;
        }
    
        const ms = numeric > 1e12 ? numeric : numeric * 1000;
        if (!Number.isFinite(ms)) {
            return null;
        }
        return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    }
    
    function expandWalletTokenHistoryEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }
    
        const result = [];
        for (const entry of entries) {
            if (!entry) {
                continue;
            }
    
            if (Array.isArray(entry.prices)) {
                for (const priceRow of entry.prices) {
                    if (priceRow) {
                        result.push(priceRow);
                    }
                }
                continue;
            }
    
            result.push(entry);
        }
    
        return result;
    }
    
    function resampleWalletTokenHistoryEntries(entries, targetPeriod) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }
    
        const normalizedTarget = normalizeWalletTokenHistoryPeriod(targetPeriod);
        const bucketMs = getWalletTokenHistoryBucketMs(normalizedTarget);
        const requestPeriod = resolveWalletTokenHistoryRequestPeriod(normalizedTarget);
        const requestPeriodMs = getWalletTokenHistoryRequestPeriodMs(requestPeriod);
    
        if (!bucketMs || !requestPeriodMs || bucketMs <= requestPeriodMs) {
            return entries.slice();
        }
    
        const buckets = new Map();
        for (const entry of entries) {
            const timestamp = getWalletTokenHistoryTimestampValue(entry);
            if (!Number.isFinite(timestamp)) {
                continue;
            }
            const bucketKey = Math.floor(timestamp / bucketMs);
            const existing = buckets.get(bucketKey);
            if (!existing || timestamp > existing.timestamp) {
                buckets.set(bucketKey, { entry, timestamp });
            }
        }
    
        const aggregated = [];
        for (const value of buckets.values()) {
            if (value?.entry) {
                aggregated.push(value.entry);
            }
        }
    
        return aggregated;
    }
    
    function sortWalletTokenHistoryEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }
    
        return entries
            .slice()
            .sort((a, b) => {
                const timestampA = getWalletTokenHistoryTimestampValue(a);
                const timestampB = getWalletTokenHistoryTimestampValue(b);
    
                if (timestampA === null && timestampB === null) {
                    return 0;
                }
                if (timestampA === null) {
                    return 1;
                }
                if (timestampB === null) {
                    return -1;
                }
    
                return timestampB - timestampA;
            });
    }
    
    function getWalletTokenHistoryTimestampRaw(row) {
        if (!row) {
            return null;
        }
    
        if (Array.isArray(row)) {
            return row.length > 0 ? row[0] : null;
        }
    
        return row.ts ?? row.timestamp ?? row.time ?? row.date ?? null;
    }
    
    function getWalletTokenHistoryTimestampValue(row) {
        const raw = getWalletTokenHistoryTimestampRaw(row);
        if (raw === undefined || raw === null) {
            return null;
        }
    
        if (typeof raw === 'number') {
            return Number.isFinite(raw) ? raw : null;
        }
    
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) {
                return null;
            }
    
            const numeric = Number(trimmed);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
    
            const parsed = Date.parse(trimmed);
            return Number.isFinite(parsed) ? parsed : null;
        }
    
        return null;
    }
    
    function getWalletTokenHistoryPriceText(row) {
        if (!row) {
            return null;
        }
    
        if (Array.isArray(row)) {
            const candidate = row[1] ?? row[2];
            if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
                return String(candidate).trim();
            }
        }
    
        const fields = ['price', 'value', 'indexPrice', 'close', 'avgPrice'];
        for (const field of fields) {
            if (row[field] !== undefined && row[field] !== null) {
                const text = String(row[field]).trim();
                if (text) {
                    return text;
                }
            }
        }
    
        return null;
    }
    
    function countDistinctWalletTokenHistoryPrices(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return 0;
        }
    
        const seen = new Set();
        for (const entry of entries) {
            const priceText = getWalletTokenHistoryPriceText(entry);
            if (priceText !== null) {
                seen.add(priceText);
            }
        }
    
        return seen.size;
    }
    
    function formatWalletTokenHistoryEntry(row, previousRow, lang) {
        if (!row) {
            return null;
        }
    
        const timestampRaw = getWalletTokenHistoryTimestampRaw(row);
        const label = formatWalletTokenTimestamp(timestampRaw) || timestampRaw;
        const priceText = getWalletTokenHistoryPriceText(row);
    
        if (!label && priceText === null) {
            return null;
        }
    
        let deltaSuffix = '';
        if (previousRow) {
            const previousPriceText = getWalletTokenHistoryPriceText(previousRow);
            if (priceText !== null && previousPriceText !== null) {
                const deltaValue = subtractDecimalStrings(priceText, previousPriceText);
                if (deltaValue !== null) {
                    let normalizedDelta = deltaValue;
                    if (!normalizedDelta.startsWith('-') && normalizedDelta !== '0') {
                        normalizedDelta = `+${normalizedDelta}`;
                    }
                    const deltaLabel = t(lang || defaultLang, 'wallet_token_action_history_delta', { delta: normalizedDelta });
                    if (deltaLabel) {
                        deltaSuffix = ` (${deltaLabel})`;
                    }
                }
            }
        }
    
        const priceDisplay = priceText !== null ? priceText : '';
        return label ? `${label}: ${priceDisplay}${deltaSuffix}` : `${priceDisplay}${deltaSuffix}`;
    }
    
    function formatWalletTokenPriceInfoEntry(row, index = 0) {
        if (!row) {
            return null;
        }
    
        const timestamp = row.time || row.ts || row.timestamp;
        const label = formatWalletTokenTimestamp(timestamp) || 'Snapshot';
        const price = row.price || row.latestPrice;
        const marketCap = pickOkxNumeric(row, ['marketCap']);
        const volume24h = pickOkxNumeric(row, ['volume24H', 'volume24h']);
        const liquidity = pickOkxNumeric(row, ['liquidity']);
        const holders = pickOkxNumeric(row, ['holders', 'holderCount']);
    
        const parts = [];
        if (price !== undefined && price !== null) {
            parts.push(`Price ${price} USD`);
        }
        if (Number.isFinite(marketCap)) {
            parts.push(`MC ${marketCap}`);
        }
        if (Number.isFinite(volume24h)) {
            parts.push(`Vol24h ${volume24h}`);
        }
        if (Number.isFinite(liquidity)) {
            parts.push(`Liq ${liquidity}`);
        }
        if (Number.isFinite(holders)) {
            parts.push(`Holders ${holders}`);
        }
    
        return `${index + 1}. ${label}${parts.length > 0 ? `  ${parts.join(' | ')}` : ''}`;
    }
    
    function buildWalletTokenCandleInsights(entries, lang, options = {}) {
        const { windowLabel, defaultWindowLabel } = options;
        const normalizedCandles = normalizeWalletTokenCandles(entries);
        const analysis = analyzeWalletTokenCandles(normalizedCandles);
    
        if (!analysis || normalizedCandles.length === 0) {
            return { entries: [], label: windowLabel || defaultWindowLabel };
        }
    
        const label = (windowLabel || defaultWindowLabel || '').trim();
        const summary = formatWalletTokenCandleSummary(normalizedCandles, analysis, lang, label);
        const detail = formatWalletTokenCandleDetailLines(analysis, lang);
    
        return {
            entries: [summary, ...detail].filter(Boolean),
            label,
        };
    }
    
    function normalizeWalletTokenCandles(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }
    
        const normalized = [];
    
        for (const row of entries) {
            if (!row) {
                continue;
            }
    
            let timestamp;
            let open;
            let high;
            let low;
            let close;
            let volume;
    
            if (Array.isArray(row)) {
                [timestamp, open, high, low, close, volume] = row;
            } else {
                timestamp = row.ts || row.timestamp || row.time;
                open = row.open || row.o;
                high = row.high || row.h;
                low = row.low || row.l;
                close = row.close || row.c;
                volume = row.volume || row.v;
            }
    
            if (timestamp === undefined || timestamp === null) {
                continue;
            }
    
            normalized.push({
                time: timestamp,
                open: Number(open),
                high: Number(high),
                low: Number(low),
                close: Number(close),
                volume: Number(volume),
            });
        }
    
        return normalized.filter((row) => Number.isFinite(row.open) && Number.isFinite(row.close));
    }
    
    function analyzeWalletTokenCandles(candles) {
        if (!Array.isArray(candles) || candles.length === 0) {
            return null;
        }
    
        const sorted = [...candles].sort((a, b) => (b.time || 0) - (a.time || 0));
        const newest = sorted[0];
        const oldest = sorted[sorted.length - 1];
    
        const startPrice = oldest.open;
        const finalPrice = newest.close;
    
        const stats = sorted.reduce(
            (acc, candle) => {
                acc.overallHigh = Math.max(acc.overallHigh, candle.high);
                acc.overallLow = Math.min(acc.overallLow, candle.low);
                acc.totalVolume += Number.isFinite(candle.volume) ? candle.volume : 0;
    
                if (Number.isFinite(candle.volume) && candle.volume > acc.maxVolume.volume) {
                    acc.maxVolume = { volume: candle.volume, time: candle.time };
                }
    
                return acc;
            },
            {
                overallHigh: -Infinity,
                overallLow: Infinity,
                totalVolume: 0,
                maxVolume: { volume: 0, time: null },
            }
        );
    
        const netChange = finalPrice - startPrice;
        const percentChange = startPrice !== 0 ? (netChange / startPrice) * 100 : 0;
    
        return {
            startPrice,
            finalPrice,
            netChange,
            percentChange,
            ...stats,
        };
    }
    
    function formatWalletTokenCandleSummary(candles, analysis, lang, windowLabel = '') {
        const trend = describeWalletTokenCandleTrend(analysis.percentChange, lang);
        const start = formatCandleNumber(analysis.startPrice);
        const end = formatCandleNumber(analysis.finalPrice);
        const pct = formatPercent(analysis.percentChange);
        const label = windowLabel ? ` (${windowLabel})` : '';
    
        return [
            t(lang, 'wallet_token_action_candles_summary_title', { window: windowLabel || 'Candle' }) ||
                `?? Candle analysis${label}`,
            t(lang, 'wallet_token_action_candles_summary_change', {
                start,
                end,
                percent: pct,
                trend,
            }) || `?? O?C: ${start} ? ${end} (${pct})  ${trend}`,
        ]
            .filter(Boolean)
            .join('\n');
    }
    
    function formatWalletTokenCandleDetailLines(analysis, lang) {
        if (!analysis) {
            return [];
        }
    
        const low = formatCandleNumber(analysis.overallLow);
        const high = formatCandleNumber(analysis.overallHigh);
        const totalVolume = formatCandleVolume(analysis.totalVolume);
        const maxVolume = formatCandleVolume(analysis.maxVolume.volume);
        const maxVolumeTime = formatWalletTokenTimestamp(analysis.maxVolume.time) || '';
    
        const rangeLine =
            t(lang, 'wallet_token_action_candles_summary_range', { low, high }) || `?? Range: L ${low} / H ${high}`;
        const volumeLine =
            t(lang, 'wallet_token_action_candles_summary_volume', {
                total: totalVolume,
                peak: maxVolume,
                time: maxVolumeTime,
            }) || `?? Vol: ${totalVolume} | Peak ${maxVolume} @ ${maxVolumeTime}`;
    
        const insightLine = t(lang, 'wallet_token_action_candles_summary_support', { low, high });
    
        return [rangeLine, volumeLine, insightLine].filter(Boolean);
    }
    
    function describeWalletTokenCandleTrend(percentChange, lang) {
        if (!Number.isFinite(percentChange)) {
            return '';
        }
    
        const pct = formatPercent(percentChange);
        if (percentChange >= 5) {
            return t(lang, 'wallet_token_action_candles_summary_trend_strong_up', { percent: pct }) ||
                `?? Strong upside (${pct})`;
        }
        if (percentChange <= -5) {
            return t(lang, 'wallet_token_action_candles_summary_trend_strong_down', { percent: pct }) ||
                `?? Heavy sell-off (${pct})`;
        }
        if (percentChange > 0) {
            return t(lang, 'wallet_token_action_candles_summary_trend_up', { percent: pct }) || `?? Mild rise (${pct})`;
        }
        return t(lang, 'wallet_token_action_candles_summary_trend_down', { percent: pct }) || `?? Slight dip (${pct})`;
    }
    
    function formatCandleNumber(value, decimals = 8) {
        if (!Number.isFinite(value)) {
            return '';
        }
        return Number(value).toFixed(decimals);
    }
    
    function formatPercent(value) {
        if (!Number.isFinite(value)) {
            return '0.00%';
        }
        return `${value.toFixed(2)}%`;
    }
    
    function formatCandleVolume(value) {
        if (!Number.isFinite(value)) {
            return '';
        }
        return new Intl.NumberFormat('en-US').format(Math.round(value));
    }
    
    function buildWalletTokenTokenInfoEntries(entry) {
        if (!entry || typeof entry !== 'object') {
            return [];
        }
    
        return Object.keys(entry)
            .sort()
            .map((key) => {
                const value = formatWalletTokenTokenInfoValue(entry[key]);
                if (value === null) {
                    return null;
                }
                return `${key}: ${value}`;
            })
            .filter(Boolean);
    }
    
    function formatWalletTokenTokenInfoValue(value) {
        if (value === undefined) {
            return null;
        }
        if (value === null) {
            return '';
        }
        if (typeof value === 'object') {
            try {
                const serialized = JSON.stringify(value);
                if (serialized.length > 300) {
                    return `${serialized.slice(0, 297)}`;
                }
                return serialized;
            } catch (error) {
                return String(value);
            }
        }
        return String(value);
    }
    
    function formatWalletTokenHolderEntry(row, index = 0) {
        if (!row) {
            return null;
        }
        const address =
            row.address || row.walletAddress || row.holderAddress || row.holderWalletAddress;
        const normalizedAddress = normalizeAddressSafe(address) || address;
        const addressHtml = normalizedAddress ? formatCopyableValueHtml(normalizedAddress) : null;
        const amount = row.amount || row.balance || row.quantity || row.holdAmount || row.holding;
        const percent = pickOkxNumeric(row, ['percentage', 'percent', 'ratio', 'share']);
        const usdValue = pickOkxNumeric(row, ['usdValue', 'valueUsd', 'holdingValueUsd', 'usd']);
        const parts = [];
        const rank = index + 1;

        const header = addressHtml ? `#${rank} - ${addressHtml}` : `#${rank} - Wallet`;
        parts.push(header);

        if (amount !== undefined && amount !== null) {
            const amountLabel = formatNumberValue(amount, { maximumFractionDigits: 6 });
            parts.push(`Hold: <b>${escapeHtml(String(amountLabel))}</b>`);
        }
        if (Number.isFinite(percent)) {
            const percentLabel = formatNumberValue(percent, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            parts.push(`Share: ${percentLabel}%`);
        }
        if (Number.isFinite(usdValue)) {
            const usdLabel = formatFiatValue(usdValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || usdValue;
            parts.push(`USD: ${escapeHtml(String(usdLabel))}`);
        }

        return parts.join(' | ');
    }

function formatWalletTokenTradeEntry(row, index = 0) {
        if (!row) {
            return null;
        }
    
        let timestamp;
        let price;
        let amount;
        let side;
        let maker;
        let taker;
        let volume;
        let dexName;
        let txHashUrl;
    
        if (Array.isArray(row)) {
            [timestamp, price, amount, side] = row;
        } else {
            timestamp = row.ts || row.timestamp || row.time;
            price = row.price || row.fillPrice || row.tradePrice;
            amount = row.amount || row.size || row.qty || row.quantity;
            side = row.side || row.direction || row.type;
            volume = row.volume;
            dexName = row.dexName || row.dex;
            txHashUrl = row.txHashUrl || row.txUrl;
            maker = row.maker
                || row.makerAddress
                || row.buyerAddress
                || row.buyer
                || row.from
                || row.fromAddress
                || row.addressFrom
                || row.traderAddress
                || row.userAddress;
            taker = row.taker
                || row.takerAddress
                || row.sellerAddress
                || row.seller
                || row.to
                || row.toAddress
                || row.addressTo
                || row.counterpartyAddress;
        }
    
        const label = formatWalletTokenTimestamp(timestamp) || timestamp || 'Trade';
        const sideLabel = side ? String(side).toUpperCase() : null;
        const detailParts = [];
        if (sideLabel) {
            detailParts.push(sideLabel);
        }
        if (dexName) {
            detailParts.push(`DEX ${dexName}`);
        }
        if (amount !== undefined && amount !== null) {
            detailParts.push(`Amount ${amount}`);
        }
        if (price !== undefined && price !== null) {
            detailParts.push(`Price ${price}`);
        }
        if (volume !== undefined && volume !== null) {
            detailParts.push(`USD ${volume}`);
        }
    
        const normalizedMaker = normalizeAddressSafe(maker) || maker;
        const normalizedTaker = normalizeAddressSafe(taker) || taker;
        const makerHtml = normalizedMaker ? formatCopyableValueHtml(normalizedMaker) : null;
        const takerHtml = normalizedTaker ? formatCopyableValueHtml(normalizedTaker) : null;
        const addressParts = [];
        if (makerHtml) {
            addressParts.push(`?? From: ${makerHtml}`);
        }
        if (takerHtml) {
            addressParts.push(`?? To: ${takerHtml}`);
        }
    
        const txHash = row.txHash || row.transactionHash || row.hash || row.txid;
    
        const changed = row.changedTokenInfo || row.changedTokenInfos;
        const changeLines = [];
        if (Array.isArray(changed)) {
            for (const info of changed) {
                if (!info) continue;
                const symbol = info.tokenSymbol || info.symbol;
                const infoAmount = info.amount;
                const infoAddress = info.tokenContractAddress;
                const parts = [];
                if (symbol) parts.push(symbol);
                if (infoAmount !== undefined && infoAmount !== null) {
                    parts.push(`Amt ${infoAmount}`);
                }
                if (infoAddress) {
                    const contractHtml = formatCopyableValueHtml(infoAddress) || infoAddress;
                    parts.push(`Contract ${contractHtml}`);
                }
                if (parts.length > 0) {
                    changeLines.push(`    ${parts.join(' | ')}`);
                }
            }
        }
    
        const lines = [];
        lines.push(''.repeat(28));
        const header = detailParts.length > 0 ? ` ─ ${detailParts.join(' | ')}` : '';
        lines.push(`• Trade #${index + 1}: ${label}${header}`);
        if (addressParts.length > 0) {
            lines.push(addressParts.join(' / '));
        }
        if (txHashUrl) {
            lines.push(`• Tx: ${formatCopyableValueHtml(txHashUrl) || txHashUrl}`);
        } else if (txHash) {
            lines.push(`• Tx: ${formatCopyableValueHtml(txHash) || txHash}`);
        }
        if (changeLines.length > 0) {
            lines.push(...changeLines.map((line) => line.replace('•', '•')));
        }
    
        return lines.join('\n');
    }
    
    function collectWalletHistoryEntries(payload, tokenAddress) {
        const rawEntries = unwrapOkxData(payload) || [];
        const tokenLower = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : null;
        const result = [];
    
        for (const group of rawEntries) {
            if (!group) {
                continue;
            }
    
            const transactions = Array.isArray(group.transactionList)
                ? group.transactionList
                : Array.isArray(group.transactions)
                    ? group.transactions
                    : Array.isArray(group.transaction_list)
                        ? group.transaction_list
                        : null;
    
            if (Array.isArray(transactions)) {
                for (const tx of transactions) {
                    if (!tx) continue;
                    if (tokenLower && tx.tokenContractAddress && tx.tokenContractAddress.toLowerCase() !== tokenLower) {
                        continue;
                    }
                    result.push(tx);
                }
                continue;
            }
    
            if (group.txHash) {
                if (tokenLower && group.tokenContractAddress && group.tokenContractAddress.toLowerCase() !== tokenLower) {
                    continue;
                }
                result.push(group);
            }
        }
    
        return result;
    }
    
    function summarizeWalletHistoryEntries(entries, walletAddress, tokenSymbol) {
        const walletLower = typeof walletAddress === 'string' ? walletAddress.toLowerCase() : null;
        const sorted = [...entries].sort((a, b) => {
            const aTime = Number(a?.txTime || a?.timestamp || a?.time || 0);
            const bTime = Number(b?.txTime || b?.timestamp || b?.time || 0);
            return Number.isFinite(bTime) && Number.isFinite(aTime) ? bTime - aTime : 0;
        });
    
        const limited = sorted.slice(0, WALLET_TOKEN_TX_HISTORY_LIMIT);
        const buyStats = { count: 0, total: 0 };
        const sellStats = { count: 0, total: 0 };
    
        for (const entry of limited) {
            const direction = classifyWalletHistoryDirection(entry, walletLower);
            const amount = resolveWalletHistoryAmount(entry, walletLower);
    
            if (direction === 'buy') {
                buyStats.count += 1;
                if (Number.isFinite(amount)) {
                    buyStats.total += amount;
                }
            } else if (direction === 'sell') {
                sellStats.count += 1;
                if (Number.isFinite(amount)) {
                    sellStats.total += amount;
                }
            }
        }
    
        return { entries: limited, buyStats, sellStats, tokenSymbol };
    }
    
    function classifyWalletHistoryDirection(entry, walletLower) {
        if (!entry || !walletLower) {
            return null;
        }
    
        const fromAddrs = Array.isArray(entry.from)
            ? entry.from.map((item) => item?.address?.toLowerCase()).filter(Boolean)
            : [];
        const toAddrs = Array.isArray(entry.to)
            ? entry.to.map((item) => item?.address?.toLowerCase()).filter(Boolean)
            : [];
    
        if (toAddrs.includes(walletLower)) {
            return 'buy';
        }
        if (fromAddrs.includes(walletLower)) {
            return 'sell';
        }
    
        return null;
    }
    
    function resolveWalletHistoryAmount(entry, walletLower) {
        if (!entry) {
            return null;
        }
    
        const direct = normalizeNumeric(entry.amount);
        if (Number.isFinite(direct)) {
            return direct;
        }
    
        const findAmount = (rows = []) => {
            for (const row of rows) {
                if (!row || !row.address) continue;
                const isMatch = walletLower ? row.address.toLowerCase() === walletLower : true;
                if (!isMatch) continue;
                const numeric = normalizeNumeric(row.amount);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
            return null;
        };
    
        const toAmount = findAmount(entry.to);
        if (Number.isFinite(toAmount)) {
            return toAmount;
        }
    
        const fromAmount = findAmount(entry.from);
        if (Number.isFinite(fromAmount)) {
            return fromAmount;
        }
    
        return null;
    }
    
    function formatWalletHistoryEntry(entry, walletAddress, tokenSymbol, index = 0) {
        if (!entry) {
            return null;
        }
    
        const walletLower = typeof walletAddress === 'string' ? walletAddress.toLowerCase() : null;
        const direction = classifyWalletHistoryDirection(entry, walletLower);
        const amount = resolveWalletHistoryAmount(entry, walletLower);
        const amountLabel = amount !== null && amount !== undefined
            ? `${amount} ${tokenSymbol || entry.symbol || ''}`.trim()
            : '';
    
        const fromAddrs = Array.isArray(entry.from) ? entry.from.map((item) => item?.address).filter(Boolean) : [entry.from].filter(Boolean);
        const toAddrs = Array.isArray(entry.to) ? entry.to.map((item) => item?.address).filter(Boolean) : [entry.to].filter(Boolean);
        const txHash = entry.txHash || entry.txhash || entry.hash;
        const txFee = entry.txFee || entry.fee;
        const status = entry.txStatus || entry.status || '';
        const timestampLabel = formatWalletTokenTimestamp(entry.txTime || entry.timestamp || entry.time) || 'Tx';
    
        const lines = [];
        lines.push(''.repeat(28));
        const prefix = direction === 'buy' ? '🟢 Buy' : direction === 'sell' ? '🔴 Sell' : '🔄 Tx';
        lines.push(`${prefix} #${index + 1} ─ ${timestampLabel}`);
        lines.push(`• ${escapeHtml(amountLabel)}`);
        lines.push(`• Status: ${escapeHtml(String(status))}`);
        if (txFee !== undefined && txFee !== null && txFee !== '') {
            lines.push(`⛽ Fee: ${escapeHtml(String(txFee))}`);
        }
    
        if (fromAddrs.length > 0) {
            const formatted = fromAddrs.map((addr) => formatCopyableValueHtml(addr) || escapeHtml(addr));
            lines.push(`• From: ${formatted.join(', ')}`);
        }
    
        if (toAddrs.length > 0) {
            const formatted = toAddrs.map((addr) => formatCopyableValueHtml(addr) || escapeHtml(addr));
            lines.push(`• To: ${formatted.join(', ')}`);
        }
    
        if (txHash) {
            lines.push(`• Tx: ${formatCopyableValueHtml(txHash) || escapeHtml(txHash)}`);
        }
    
        return lines.join('\n');
    }
    
    function formatTxhashDetail(detail, lang, options = {}) {
        const lines = [];
        const mainAddress = resolveTxhashPrimaryAddress(detail, options.mainAddress);
        const mainLower = mainAddress ? mainAddress.toLowerCase() : null;
        const txHash = detail.txhash || detail.txHash || detail.hash || '';
        const chain = detail.chainIndex ?? detail.chainId ?? '';
        const status = normalizeTxStatusText(detail.txStatus);
        const amount = detail.amount !== undefined && detail.amount !== null ? detail.amount : '0';
        const symbol = detail.symbol || 'TOKEN';
        const amountLabel = `${amount} ${symbol}`.trim();
        const gasLimit = detail.gasLimit || detail.gas || null;
        const gasUsed = detail.gasUsed || null;
        const gasPrice = detail.gasPrice || null;
        const fee = detail.txFee || detail.fee || null;
        const methodId = detail.methodId || null;
        const tokenTransfers = Array.isArray(detail.tokenTransferDetails) ? detail.tokenTransferDetails : [];
        const internalTransfers = Array.isArray(detail.internalTransactionDetails)
            ? detail.internalTransactionDetails
            : [];
    
        const computedFee = deriveTxFeeLabel(fee, gasUsed, gasPrice);
        const tokenTransferInsight = summarizeTokenTransfers(tokenTransfers, mainLower, internalTransfers, symbol);
        const primaryAction = buildTxhashActionSummary(tokenTransferInsight, lang);
    
        lines.push(t(lang, 'txhash_title'));
        lines.push(t(lang, 'txhash_hash_line', { hash: formatCopyableValueHtml(txHash) || escapeHtml(txHash) }));
        lines.push(t(lang, 'txhash_summary_line', {
            chain: escapeHtml(String(chain)),
            status: escapeHtml(status),
            amount: escapeHtml(amountLabel)
        }));
    
        if (mainAddress) {
            lines.push(t(lang, 'txhash_insight_wallet', {
                wallet: formatCopyableValueHtml(mainAddress) || escapeHtml(mainAddress)
            }));
        } else {
            lines.push(t(lang, 'txhash_insight_no_wallet'));
        }
    
        lines.push('', t(lang, 'txhash_action_title'));
        lines.push(primaryAction);
        lines.push(t(lang, 'txhash_insight_buy', {
            summary: formatTxhashTotals(tokenTransferInsight.buys, lang)
        }));
        lines.push(t(lang, 'txhash_insight_sell', {
            summary: formatTxhashTotals(tokenTransferInsight.sells, lang)
        }));
    
        const hasFeeBlock = fee || computedFee || gasUsed || gasPrice || methodId || detail.l1OriginHash;
        if (hasFeeBlock) {
            lines.push('', t(lang, 'txhash_fee_header'));
            if (fee || computedFee) {
                lines.push(t(lang, 'txhash_fee_line', { fee: escapeHtml(String(fee || computedFee)) }));
            }
            if (gasUsed || gasPrice || gasLimit) {
                lines.push(t(lang, 'txhash_gas_line', {
                    limit: gasLimit ? escapeHtml(String(gasLimit)) : '',
                    used: gasUsed ? escapeHtml(String(gasUsed)) : '',
                    price: gasPrice ? escapeHtml(String(gasPrice)) : ''
                }));
            }
            if (methodId) {
                lines.push(t(lang, 'txhash_method_line', { method: escapeHtml(String(methodId)) }));
            }
            if (detail.l1OriginHash) {
                lines.push(t(lang, 'txhash_l1_hash', {
                    hash: formatCopyableValueHtml(detail.l1OriginHash) || escapeHtml(String(detail.l1OriginHash))
                }));
            }
        }
    
        lines.push('', t(lang, 'txhash_token_header'));
        const tokenDetails = formatTokenTransferDetails(detail.tokenTransferDetails, lang);
        if (tokenDetails.length > 0) {
            lines.push(...tokenDetails);
        } else {
            lines.push(t(lang, 'txhash_token_none'));
        }
    
        lines.push('', t(lang, 'txhash_lookup_hint'));
    
        return lines.join('\n');
    }
    
    function resolveTxhashPrimaryAddress(detail, providedAddress) {
        const normalizedProvided = normalizeAddressSafe(providedAddress);
        if (normalizedProvided) {
            return normalizedProvided;
        }
    
        if (Array.isArray(detail.fromDetails)) {
            for (const row of detail.fromDetails) {
                if (!row || row.isContract) continue;
                const normalized = normalizeAddressSafe(row.address);
                if (normalized) {
                    return normalized;
                }
            }
        }
    
        if (Array.isArray(detail.tokenTransferDetails)) {
            for (const row of detail.tokenTransferDetails) {
                if (!row || row.isFromContract) continue;
                const normalized = normalizeAddressSafe(row.from);
                if (normalized) {
                    return normalized;
                }
            }
        }
    
        const counts = new Map();
        const bump = (address, weight = 1) => {
            const normalized = normalizeAddressSafe(address);
            if (!normalized) return;
            const current = counts.get(normalized) || 0;
            counts.set(normalized, current + weight);
        };
    
        const maybeWeigh = (address, isContract, weight = 1) => bump(address, isContract ? weight * 0.5 : weight);
    
        if (Array.isArray(detail.fromDetails)) {
            for (const row of detail.fromDetails) {
                if (!row) continue;
                maybeWeigh(row.address, row.isContract, 2);
            }
        }
    
        if (Array.isArray(detail.tokenTransferDetails)) {
            for (const row of detail.tokenTransferDetails) {
                if (!row) continue;
                maybeWeigh(row.from, row.isFromContract, 1.5);
                maybeWeigh(row.to, row.isToContract);
            }
        }
    
        if (Array.isArray(detail.toDetails)) {
            for (const row of detail.toDetails) {
                if (!row) continue;
                maybeWeigh(row.address, row.isContract);
            }
        }
    
        let bestAddress = null;
        let bestScore = 0;
        for (const [address, score] of counts.entries()) {
            if (score > bestScore) {
                bestAddress = address;
                bestScore = score;
            }
        }
    
        return bestAddress;
    }
    
    function buildTxhashActionSummary(tokenTransferInsight, lang) {
        const pickTopToken = (map) => {
            if (!map || !(map instanceof Map) || map.size === 0) return null;
            let best = null;
            for (const [symbol, bucket] of map.entries()) {
                if (!best) {
                    best = { symbol, bucket };
                    continue;
                }
                const bestValue = best.bucket.hasNumeric ? best.bucket.totalNumeric : best.bucket.count;
                const currentValue = bucket.hasNumeric ? bucket.totalNumeric : bucket.count;
                if (currentValue > bestValue) {
                    best = { symbol, bucket };
                }
            }
            if (!best) return null;
            const amountText = best.bucket.hasNumeric
                ? formatTokenQuantity(best.bucket.totalNumeric, { maximumFractionDigits: 8 })
                : best.bucket.raw.join(' + ');
            return { symbol: best.symbol, amount: amountText };
        };
    
        const topSell = pickTopToken(tokenTransferInsight?.sells);
        const topBuy = pickTopToken(tokenTransferInsight?.buys);
    
        if (topSell && topBuy) {
            return t(lang, 'txhash_action_swap', {
                sell: `${topSell.amount} ${topSell.symbol}`.trim(),
                buy: `${topBuy.amount} ${topBuy.symbol}`.trim()
            });
        }
    
        if (topSell) {
            return t(lang, 'txhash_action_sell', { sell: `${topSell.amount} ${topSell.symbol}`.trim() });
        }
    
        if (topBuy) {
            return t(lang, 'txhash_action_buy', { buy: `${topBuy.amount} ${topBuy.symbol}`.trim() });
        }
    
        return t(lang, 'txhash_action_none');
    }
    
    function normalizeTxStatusText(status) {
        if (status === 1 || status === '1' || status === 'pending') {
            return 'pending';
        }
        if (status === 2 || status === '2' || status === 'success') {
            return 'success';
        }
        if (status === 3 || status === '3' || status === 'fail' || status === 'failed') {
            return 'fail';
        }
        return status ? String(status) : '';
    }
    
    function deriveTxFeeLabel(fee, gasUsed, gasPrice) {
        if (fee !== undefined && fee !== null && fee !== '') {
            return String(fee);
        }
    
        const gasUsedNumeric = normalizeNumeric(gasUsed);
        const gasPriceNumeric = normalizeNumeric(gasPrice);
    
        if (Number.isFinite(gasUsedNumeric) && Number.isFinite(gasPriceNumeric)) {
            const total = gasUsedNumeric * gasPriceNumeric;
            if (Number.isFinite(total)) {
                return formatTokenQuantity(total, { maximumFractionDigits: 8 });
            }
        }
    
        return null;
    }
    
    function summarizeTokenTransfers(entries, mainLower, internalEntries = [], nativeSymbol = 'TOKEN') {
        const result = {
            buys: new Map(),
            sells: new Map(),
            buyCount: 0,
            sellCount: 0,
            otherCount: 0
        };
    
        const addToBucket = (symbol, amountValue, bucketKey) => {
            const amountText = amountValue !== undefined && amountValue !== null ? String(amountValue) : '';
            const amountNumeric = normalizeNumeric(amountValue);
            const bucket = result[bucketKey].get(symbol) || {
                count: 0,
                totalNumeric: 0,
                hasNumeric: false,
                raw: []
            };
    
            bucket.count += 1;
            bucket.raw.push(amountText);
            if (Number.isFinite(amountNumeric)) {
                bucket.totalNumeric += amountNumeric;
                bucket.hasNumeric = true;
            }
    
            result[bucketKey].set(symbol, bucket);
        };
    
        if (Array.isArray(entries)) {
            for (const row of entries) {
                if (!row) continue;
                const fromLower = row.from ? row.from.toLowerCase() : null;
                const toLower = row.to ? row.to.toLowerCase() : null;
                const symbol = (row.symbol || row.tokenSymbol || 'TOKEN').toUpperCase();
                let bucketKey = null;
    
                if (mainLower && toLower === mainLower) {
                    bucketKey = 'buys';
                    result.buyCount += 1;
                } else if (mainLower && fromLower === mainLower) {
                    bucketKey = 'sells';
                    result.sellCount += 1;
                } else {
                    result.otherCount += 1;
                }
    
                if (!bucketKey) {
                    continue;
                }
    
                addToBucket(symbol, row.amount, bucketKey);
            }
        }
    
        if (Array.isArray(internalEntries)) {
            const nativeKey = (nativeSymbol || 'NATIVE').toUpperCase();
            for (const row of internalEntries) {
                if (!row) continue;
                const fromLower = row.from ? row.from.toLowerCase() : null;
                const toLower = row.to ? row.to.toLowerCase() : null;
                let bucketKey = null;
    
                if (mainLower && toLower === mainLower) {
                    bucketKey = 'buys';
                    result.buyCount += 1;
                } else if (mainLower && fromLower === mainLower) {
                    bucketKey = 'sells';
                    result.sellCount += 1;
                } else {
                    result.otherCount += 1;
                }
    
                if (!bucketKey) {
                    continue;
                }
    
                addToBucket(nativeKey, row.amount, bucketKey);
            }
        }
    
        return result;
    }
    
    function formatTxhashTotals(map, lang) {
        const parts = [];
        for (const [symbol, bucket] of map.entries()) {
            const amount = bucket.hasNumeric
                ? `${formatTokenQuantity(bucket.totalNumeric, { maximumFractionDigits: 8 })} ${symbol}`
                : `${bucket.raw.join(' + ')} ${symbol}`;
            const count = t(lang, 'txhash_insight_count_suffix', { count: bucket.count });
            parts.push(`${amount} ${count}`);
        }
        return parts.length > 0 ? parts.join('  ') : t(lang, 'txhash_insight_none');
    }
    
    function formatTxAddressDetails(entries, icon, lang) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }
    
        return entries.map((row, index) => {
            if (!row) return null;
            const parts = [];
            const address = row.address ? formatCopyableValueHtml(row.address) || escapeHtml(row.address) : '';
            const amount = row.amount !== undefined && row.amount !== null ? escapeHtml(String(row.amount)) : null;
            const contractFlag = row.isContract ? t(lang, 'txhash_contract_flag') : '';
            parts.push(`${icon} #${index + 1}  ${address} ${contractFlag}`.trim());
            if (amount) {
                parts.push(t(lang, 'txhash_amount_line', { amount }));
            }
            if (row.vinIndex || row.preVoutIndex || row.voutIndex) {
                const vin = row.vinIndex ? `vin ${escapeHtml(String(row.vinIndex))}` : null;
                const pre = row.preVoutIndex ? `pre ${escapeHtml(String(row.preVoutIndex))}` : null;
                const vout = row.voutIndex ? `vout ${escapeHtml(String(row.voutIndex))}` : null;
                const meta = [vin, pre, vout].filter(Boolean).join(' | ');
                if (meta) {
                    parts.push(meta);
                }
            }
            if (row.txhash) {
                parts.push(`• ${formatCopyableValueHtml(row.txhash) || escapeHtml(String(row.txhash))}`);
            }
            return parts.join('\n');
        }).filter(Boolean);
    }
    
    function formatInternalTxDetails(entries, lang) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }
    
        return entries.map((row, index) => {
            if (!row) return null;
            const from = row.from ? formatCopyableValueHtml(row.from) || escapeHtml(row.from) : '';
            const to = row.to ? formatCopyableValueHtml(row.to) || escapeHtml(row.to) : '';
            const amount = row.amount !== undefined && row.amount !== null ? escapeHtml(String(row.amount)) : '';
            const status = normalizeTxStatusText(row.txStatus);
            const fromFlag = row.isFromContract ? t(lang, 'txhash_contract_flag') : '';
            const toFlag = row.isToContract ? t(lang, 'txhash_contract_flag') : '';
            return `• #${index + 1} ─ ${from}${fromFlag} → ${to}${toFlag} | ${amount} | ${status}`;
        }).filter(Boolean);
    }
    
    function formatTokenTransferDetails(entries, lang) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }
    
        return entries.map((row, index) => {
            if (!row) return null;
            const from = row.from ? formatCopyableValueHtml(row.from) || escapeHtml(row.from) : '';
            const to = row.to ? formatCopyableValueHtml(row.to) || escapeHtml(row.to) : '';
            const amount = row.amount !== undefined && row.amount !== null ? escapeHtml(String(row.amount)) : '';
            const symbol = escapeHtml(row.symbol || row.tokenSymbol || 'TOKEN');
            const amountLabel = `${amount} ${symbol}`.trim();
            const fromFlag = row.isFromContract ? t(lang, 'txhash_contract_flag') : '';
            const toFlag = row.isToContract ? t(lang, 'txhash_contract_flag') : '';
            const tokenContract = row.tokenContractAddress
                ? formatCopyableValueHtml(row.tokenContractAddress) || escapeHtml(String(row.tokenContractAddress))
                : null;
    
            const lines = [];
            lines.push(`• #${index + 1} ─ ${symbol}`.trim());
            lines.push(`• ${t(lang, 'txhash_from_label', { address: `${from}${fromFlag}` })}`);
            lines.push(`• ${t(lang, 'txhash_to_label', { address: `${to}${toFlag}` })}`);
            lines.push(`• ${t(lang, 'txhash_amount_token_line', { amount: amountLabel })}`);
            if (tokenContract) {
                lines.push(`• ${t(lang, 'txhash_token_contract_line', { contract: tokenContract })}`);
            }
            return lines.join('\n');
        }).filter(Boolean);
    }
    
    function resolveKnownTokenAddress(tokenKey) {
        if (!tokenKey) {
            return null;
        }
        const key = tokenKey.toLowerCase();
        if (key === 'banmao' && OKX_BANMAO_TOKEN_ADDRESS) {
            return OKX_BANMAO_TOKEN_ADDRESS;
        }
        if (OKX_OKB_SYMBOL_KEYS.includes(key) && OKX_OKB_TOKEN_ADDRESSES.length > 0) {
            return normalizeOkxConfigAddress(OKX_OKB_TOKEN_ADDRESSES[0]);
        }
        return null;
    }
    
    function resolveRegisteredTokenAddress(tokenRecord) {
        if (!tokenRecord || typeof tokenRecord !== 'object') {
            return null;
        }
        if (tokenRecord.tokenAddress) {
            return normalizeOkxConfigAddress(tokenRecord.tokenAddress) || tokenRecord.tokenAddress;
        }
        return resolveKnownTokenAddress(tokenRecord.tokenKey);
    }
    
    function formatFiatValue(value, options = {}) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return null;
        }
        const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
            ? options.minimumFractionDigits
            : 2;
        const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
            ? options.maximumFractionDigits
            : Math.max(minimumFractionDigits, 2);
        return numeric.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits });
    }

    function formatNumberValue(value, options = {}) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return value;
        }
        const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
            ? options.maximumFractionDigits
            : 6;
        const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
            ? options.minimumFractionDigits
            : 0;
        return numeric.toLocaleString('en-US', {
            minimumFractionDigits,
            maximumFractionDigits
        });
    }
    
    async function getTokenPriceInfo(tokenAddress, tokenKey) {
        const normalized = normalizeOkxConfigAddress(tokenAddress) || tokenAddress;
        if (!normalized) {
            return null;
        }
    
        const cacheKey = normalized.toLowerCase();
        const now = Date.now();
        const cached = tokenPriceCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.value;
        }
    
        try {
            const snapshot = await fetchTokenMarketSnapshot({ tokenAddress: normalized });
            const value = snapshot
                ? {
                    priceUsd: Number.isFinite(snapshot.price) ? Number(snapshot.price) : null,
                    priceOkb: Number.isFinite(snapshot.priceOkb) ? Number(snapshot.priceOkb) : null,
                    okbUsd: Number.isFinite(snapshot.okbUsd) ? Number(snapshot.okbUsd) : null,
                    source: snapshot.source || 'OKX'
                }
                : null;
            tokenPriceCache.set(cacheKey, { value, expiresAt: now + TOKEN_PRICE_CACHE_TTL });
            return value;
        } catch (error) {
            log.child('WalletPrice').warn(`Failed to load price for ${tokenKey || tokenAddress}: ${error.message}`);
            tokenPriceCache.set(cacheKey, { value: null, expiresAt: now + 30 * 1000 });
            return null;
        }
    }
    
    async function buildUnregisterMenu(lang, chatId) {
        const entries = await loadWalletOverviewEntries(chatId);
        if (!entries || entries.length === 0) {
            return {
                text: t(lang, 'unregister_empty'),
                replyMarkup: null
            };
        }
    
        const lines = [t(lang, 'unregister_header')];
        const inline_keyboard = [];
        for (const entry of entries) {
            const walletAddr = entry.address;
            const shortAddr = shortenAddress(walletAddr);
            const label = entry.name ? `${entry.name}  ${shortAddr}` : shortAddr;
            inline_keyboard.push([{ text: `🗑️ ${label}`, callback_data: `wallet_remove|wallet|${walletAddr}` }]);
        }
        inline_keyboard.push([{ text: `🔥🔥 ${t(lang, 'unregister_all')} 🔥🔥`, callback_data: 'wallet_remove|all' }]);
    
        const replyMarkup = appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'wallet_overview' });
    
        return {
            text: lines.join('\n'),
            replyMarkup
        };
    }
    
    function parseRegisterPayload(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            return null;
        }
    
        const trimmed = rawText.trim();
        if (!trimmed) {
            return null;
        }
    
        const parts = trimmed.split(/\s+/);
        if (parts.length < 1) {
            return null;
        }
    
        const wallet = normalizeAddressSafe(parts.shift());
        if (!wallet) {
            return null;
        }
    
        const name = parts.join(' ').trim();
    
        return { wallet, name: name || null, tokens: [] };
    }
    
    

    return {
        buildContractLookupUrl,
        maskApiKey,
        fetchDexOverviewForWallet,
        formatDexChainLabel,
        describeDexTokenValue,
        resolveTokenContractAddress,
        buildWalletDexOverviewText,
        appendPortfolioLinkAndHint,
        buildWalletTokenButtonRows,
        buildWalletTokenMenu,
        sendWalletTokenExtraTexts,
        buildWalletTokenActionKeyboard,
        buildWalletTokenActionResult,
        fetchWalletTokenActionPayload,
        fetchWalletTokenHistoricalPricePayload,
        getWalletTokenHistoryWindowDays,
        applyWalletTokenHistoricalPriceWindow,
        applyWalletTokenPriceInfoHistoryWindow,
        fetchWalletTokenHistoricalPriceFallback,
        buildWalletTokenHistoricalPriceFallbackQuery,
        buildOkxCandleBarFallbackVariants,
        isOkxBarParameterError,
        normalizeWalletTokenHistoryLimit,
        normalizeWalletTokenHistoryPeriod,
        resolveWalletTokenHistoryRequestPeriod,
        getWalletTokenHistoryBucketMs,
        getWalletTokenHistoryRequestPeriodMs,
        normalizeOkxCandleBar,
        convertWalletTokenCandlesToHistoryEntries,
        normalizeWalletTokenCandleHistoryEntry,
        buildOkxTokenQueryFromContext,
        resolveWalletTokenActionCacheTtl,
        buildWalletTokenActionCacheKey,
        normalizeWalletTokenCacheQuery,
        getWalletTokenActionCacheEntry,
        setWalletTokenActionCacheEntry,
        pruneWalletTokenActionCache,
        cloneJsonValue,
        isTelegramMessageNotModifiedError,
        extractOkxPayloadCursor,
        normalizeWalletTokenActionResult,
        buildWalletTokenPriceMetrics,
        buildWalletTokenPriceInfoMetrics,
        formatWalletTokenTimestamp,
        expandWalletTokenHistoryEntries,
        resampleWalletTokenHistoryEntries,
        sortWalletTokenHistoryEntries,
        getWalletTokenHistoryTimestampRaw,
        getWalletTokenHistoryTimestampValue,
        getWalletTokenHistoryPriceText,
        countDistinctWalletTokenHistoryPrices,
        formatWalletTokenHistoryEntry,
        formatWalletTokenPriceInfoEntry,
        buildWalletTokenCandleInsights,
        normalizeWalletTokenCandles,
        analyzeWalletTokenCandles,
        formatWalletTokenCandleSummary,
        formatWalletTokenCandleDetailLines,
        describeWalletTokenCandleTrend,
        formatCandleNumber,
        formatPercent,
        formatCandleVolume,
        buildWalletTokenTokenInfoEntries,
        formatWalletTokenTokenInfoValue,
        formatWalletTokenHolderEntry,
        formatWalletTokenTradeEntry,
        collectWalletHistoryEntries,
        summarizeWalletHistoryEntries,
        classifyWalletHistoryDirection,
        resolveWalletHistoryAmount,
        formatWalletHistoryEntry,
        formatTxhashDetail,
        resolveTxhashPrimaryAddress,
        buildTxhashActionSummary,
        normalizeTxStatusText,
        deriveTxFeeLabel,
        summarizeTokenTransfers,
        formatTxhashTotals,
        formatTxAddressDetails,
        formatInternalTxDetails,
        formatTokenTransferDetails,
        resolveKnownTokenAddress,
        resolveRegisteredTokenAddress,
        formatFiatValue,
        getTokenPriceInfo,
        buildUnregisterMenu,
        parseRegisterPayload
    };
}

module.exports = { createWalletFeatures };
