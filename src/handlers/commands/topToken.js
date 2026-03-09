const { buildPaginatedChainKeyboard, sortChainsWithPriority } = require('../../features/chainMenu');
const logger = require('../../core/logger');
const log = logger.child('TopToken');
const { getChainIcon } = require('../../features/chainIcons');

function createTopTokenHelpers(deps) {
    const {
        TOPTOKEN_SESSION_TTL,
        OKX_CHAIN_INDEX,
        OKX_CHAIN_INDEX_FALLBACK,
        topTokenSessions,
        enforceOwnerCommandLimit,
        getLang,
        sendReply,
        t,
        escapeHtml,
        shortenAddress,
        formatUsdPrice,
        formatUsdCompact,
        ensureOkxChainDirectory,
        sortChainsForMenu,
        formatChainLabel,
        appendCloseButton,
        fetchOkxTopTokenList,
        resolveTopTokenChainEntry
    } = deps;

    function pruneTopTokenSessions() {
        const now = Date.now();
        for (const [key, value] of topTokenSessions.entries()) {
            if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) {
                topTokenSessions.delete(key);
            }
        }
    }

    function buildTopTokenSessionKey(chatId, userId) {
        return `${chatId || 'chat'}:${userId || 'user'}`;
    }

    function getTopTokenSession(sessionKey) {
        if (!sessionKey) {
            return null;
        }
        pruneTopTokenSessions();
        return topTokenSessions.get(sessionKey) || null;
    }

    function updateTopTokenSession(sessionKey, updates = {}) {
        if (!sessionKey) {
            return null;
        }
        pruneTopTokenSessions();
        const now = Date.now();
        const current = topTokenSessions.get(sessionKey) || {};
        const next = {
            ...current,
            ...updates,
            expiresAt: now + TOPTOKEN_SESSION_TTL
        };
        topTokenSessions.set(sessionKey, next);
        return next;
    }

    function clearTopTokenSession(sessionKey) {
        if (!sessionKey) {
            return;
        }
        topTokenSessions.delete(sessionKey);
    }

    function describeTopTokenSort(lang, sortBy) {
        const value = Number(sortBy);
        if (value === 2) {
            return t(lang, 'toptoken_button_price');
        }
        if (value === 5) {
            return t(lang, 'toptoken_button_volume');
        }
        if (value === 6) {
            return t(lang, 'toptoken_button_marketcap');
        }
        return t(lang, 'toptoken_button_price');
    }

    function describeTopTokenTimeframe(lang, timeFrame) {
        const value = Number(timeFrame);
        if (value === 1) {
            return t(lang, 'toptoken_time_5m');
        }
        if (value === 2) {
            return t(lang, 'toptoken_time_1h');
        }
        if (value === 3) {
            return t(lang, 'toptoken_time_4h');
        }
        return t(lang, 'toptoken_time_24h');
    }

    function formatNumber(value, options = {}) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return null;
        }
        const { maximumFractionDigits = 2, minimumFractionDigits = 0 } = options;
        try {
            return numeric.toLocaleString('en-US', { maximumFractionDigits, minimumFractionDigits });
        } catch (error) {
            return numeric.toFixed(Math.min(4, maximumFractionDigits));
        }
    }

    function formatPercent(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return null;
        }
        return `${numeric >= 0 ? '+' : '-'}${Math.abs(numeric).toFixed(2)}%`;
    }

    function dedupeTopTokenEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }

        const seen = new Set();
        const result = [];

        for (const entry of entries) {
            if (!entry) {
                continue;
            }
            const key =
                (entry.tokenAddress && typeof entry.tokenAddress === 'string' ? entry.tokenAddress.toLowerCase() : null)
                || (entry.symbol && entry.chainIndex ? `${String(entry.symbol).toLowerCase()}|${entry.chainIndex}` : null);

            if (key && seen.has(key)) {
                continue;
            }
            if (key) {
                seen.add(key);
            }
            result.push(entry);
        }

        return result;
    }

    function paginateTopTokens(entries, page = 0, pageSize = 8) {
        const safePageSize = Math.max(1, Math.min(20, Number(pageSize) || 8));
        const total = Array.isArray(entries) ? entries.length : 0;
        const totalPages = total > 0 ? Math.ceil(total / safePageSize) : 1;
        const safePage = Math.max(0, Math.min(Number(page) || 0, Math.max(totalPages - 1, 0)));
        const start = safePage * safePageSize;
        const slice = Array.isArray(entries) ? entries.slice(start, start + safePageSize) : [];

        return {
            page: safePage,
            totalPages,
            startRank: start,
            items: slice
        };
    }

    function formatTopTokenList(entries, lang, context = {}) {
        const chainLabel = context.chainLabel || '-';
        const sortLabel = context.sortLabel || describeTopTokenSort(lang, context.sortBy);
        const timeLabel = context.timeLabel || describeTopTokenTimeframe(lang, context.timeFrame);
        const page = Number.isFinite(context.page) ? context.page : 0;
        const totalPages = Number.isFinite(context.totalPages) ? context.totalPages : 1;
        const startRank = Number.isFinite(context.startRank) ? context.startRank : 0;

        let header = t(lang, 'toptoken_header', {
            chain: escapeHtml(chainLabel),
            sort: escapeHtml(sortLabel),
            time: escapeHtml(timeLabel)
        });
        if (totalPages > 1) {
            header = `${header} · ${page + 1}/${totalPages}`;
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return `${header}\n${t(lang, 'toptoken_no_data')}`;
        }

        const rows = entries.map((entry, idx) => {
            const rank = Number.isFinite(entry?.rank) ? entry.rank : startRank + idx + 1;
            const tokenLabel = entry?.symbol || entry?.name || (entry?.tokenAddress ? shortenAddress(entry.tokenAddress) : 'Token');
            const chainText = Number.isFinite(entry?.chainIndex) ? `#${entry.chainIndex}` : null;
            const priceText = Number.isFinite(entry?.priceUsd) ? formatUsdPrice(entry.priceUsd) : null;

            const changeRaw = Number(entry?.priceChange);
            const normalizedChange = Number.isFinite(changeRaw) ? (Math.abs(changeRaw) < 1 ? changeRaw * 100 : changeRaw) : null;
            const changeText = Number.isFinite(normalizedChange)
                ? `${normalizedChange >= 0 ? '▲' : '▼'} <b>${formatPercent(normalizedChange)}</b>`
                : null;

            const volumeText = formatNumber(entry?.volumeUsd);
            const marketCapText = formatNumber(entry?.marketCap);
            const liquidityText = formatNumber(entry?.liquidityUsd);

            const tradersText = formatNumber(entry?.uniqueTraders, { maximumFractionDigits: 0 });
            const holdersText = formatNumber(entry?.holderCount, { maximumFractionDigits: 0 });
            const txsText = formatNumber(entry?.txs, { maximumFractionDigits: 0 });
            const txsBuyText = formatNumber(entry?.txsBuy, { maximumFractionDigits: 0 });
            const txsSellText = formatNumber(entry?.txsSell, { maximumFractionDigits: 0 });
            const txBreakdown = txsBuyText || txsSellText ? ` (${txsBuyText || '0'}/${txsSellText || '0'})` : '';
            const tokenAddress = entry?.tokenAddress || entry?.contractAddress;

            const line1Parts = [`#${rank}`, `🪙 <b>${escapeHtml(tokenLabel)}</b>`];
            if (chainText) {
                line1Parts.push(escapeHtml(chainText));
            }
            const line1 = line1Parts.join(' · ');

            const line2Parts = [];
            if (priceText) {
                line2Parts.push(`💰 ${escapeHtml(priceText)}`);
            }
            if (changeText) {
                line2Parts.push(changeText);
            }
            const line2 = line2Parts.join(' · ');

            const line3Parts = [];
            if (marketCapText) {
                line3Parts.push(`🏦 MC <b>${marketCapText}</b>`);
            }
            if (liquidityText) {
                line3Parts.push(`💧 Liq <b>${liquidityText}</b>`);
            }
            if (volumeText) {
                line3Parts.push(`📊 Vol <b>${volumeText}</b>`);
            }
            const line3 = line3Parts.join(' · ');

            const line4Parts = [];
            if (tradersText) {
                line4Parts.push(`👥 Traders <b>${tradersText}</b>`);
            }
            if (holdersText) {
                line4Parts.push(`💎 Holders <b>${holdersText}</b>`);
            }
            if (txsText) {
                line4Parts.push(`🔁 Tx <b>${txsText}</b>${txBreakdown}`);
            }
            const line4 = line4Parts.join(' · ');

            const line5 = tokenAddress ? `📋 <code>${escapeHtml(tokenAddress)}</code>` : null;

            return [line1, line2, line3, line4, line5].filter(Boolean).join('\n');
        });

        return [header, ...rows].join('\n\n');
    }

    async function buildTopTokenChainMenu(lang, { page = 0 } = {}) {
        let chains = [];
        try {
            const directory = await ensureOkxChainDirectory();
            chains = Array.isArray(directory?.market) ? directory.market : [];
        } catch (error) {
            log.warn(`Failed to load chain directory: ${error.message}`);
        }

        const fallbackChainIndex = Number.isFinite(OKX_CHAIN_INDEX) ? OKX_CHAIN_INDEX : OKX_CHAIN_INDEX_FALLBACK;
        const fallbackChain = {
            chainIndex: fallbackChainIndex,
            chainId: fallbackChainIndex,
            chainShortName: 'xlayer',
            chainName: 'X Layer',
            aliases: ['xlayer']
        };

        const validChains = (Array.isArray(chains) ? chains : []).filter((entry) => Number.isFinite(entry?.chainIndex));
        if (!validChains.length) {
            validChains.push(fallbackChain);
        }

        const sorted = sortChainsWithPriority(validChains, {
            preferChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK,
            preferAliases: ['xlayer']
        });
        const keyboard = buildPaginatedChainKeyboard(sorted, {
            t,
            lang,
            prefix: 'toptoken',
            page,
            backCallbackData: null,
            closeCallbackData: 'ui_close',
            preferChainIndex: OKX_CHAIN_INDEX || OKX_CHAIN_INDEX_FALLBACK,
            formatLabel: (entry) => {
                const icon = getChainIcon(entry);
                const label = formatChainLabel(entry) || `#${entry.chainIndex}`;
                return `${icon} ${label}`.trim();
            },
            buildSelectCallback: (entry) => `toptoken_chain|${entry.chainIndex}`
        });

        return {
            text: t(lang, 'toptoken_chain_prompt'),
            replyMarkup: { inline_keyboard: keyboard.inline_keyboard }
        };
    }

    function buildTopTokenSortMenu(lang, context = {}) {
        const chainLabel = context.chainLabel || (Number.isFinite(context.chainIndex) ? `#${context.chainIndex}` : '-');
        const inline_keyboard = [
            [{ text: t(lang, 'toptoken_button_price'), callback_data: 'toptoken_sort|2' }],
            [{ text: t(lang, 'toptoken_button_volume'), callback_data: 'toptoken_sort|5' }],
            [{ text: t(lang, 'toptoken_button_marketcap'), callback_data: 'toptoken_sort|6' }]
        ];

        return {
            text: t(lang, 'toptoken_sort_prompt', { chain: chainLabel }),
            replyMarkup: appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'toptoken_restart' })
        };
    }

    function buildTopTokenTimeframeMenu(lang, context = {}) {
        const chainLabel = context.chainLabel || (Number.isFinite(context.chainIndex) ? `#${context.chainIndex}` : '-');
        const sortLabel = context.sortLabel || describeTopTokenSort(lang, context.sortBy);
        const inline_keyboard = [
            [
                { text: t(lang, 'toptoken_time_5m'), callback_data: 'toptoken_time|1' },
                { text: t(lang, 'toptoken_time_1h'), callback_data: 'toptoken_time|2' }
            ],
            [
                { text: t(lang, 'toptoken_time_4h'), callback_data: 'toptoken_time|3' },
                { text: t(lang, 'toptoken_time_24h'), callback_data: 'toptoken_time|4' }
            ]
        ];

        return {
            text: t(lang, 'toptoken_timeframe_prompt', { chain: chainLabel, sort: sortLabel }),
            replyMarkup: appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'toptoken_back_sort' })
        };
    }

    function buildTopTokenResultKeyboard(lang, { chainIndex, sortBy, timeFrame, page = 0, totalPages = 1 } = {}) {
        const inline_keyboard = [];

        if (totalPages > 1) {
            const prevPage = page > 0 ? page - 1 : null;
            const nextPage = page + 1 < totalPages ? page + 1 : null;
            inline_keyboard.push([
                { text: '◀️', callback_data: prevPage !== null ? `toptoken_result_page|${prevPage}` : 'toptoken_noop' },
                { text: `📄 ${page + 1}/${totalPages}`, callback_data: 'toptoken_noop' },
                { text: '▶️', callback_data: nextPage !== null ? `toptoken_result_page|${nextPage}` : 'toptoken_noop' }
            ]);
        }

        if (Number.isFinite(chainIndex) && Number.isFinite(sortBy) && Number.isFinite(timeFrame)) {
            inline_keyboard.push([
                {
                    text: t(lang, 'toptoken_action_refresh'),
                    callback_data: `toptoken_refresh|${chainIndex}|${sortBy}|${timeFrame}`
                }
            ]);
        }

        const baseMarkup = inline_keyboard.length ? { inline_keyboard } : null;
        return appendCloseButton(baseMarkup, lang, { backCallbackData: 'toptoken_back_time' });
    }

    async function renderTopTokenResults(lang, { chainIndex, sortBy, timeFrame }, options = {}) {
        const numericChain = Number.isFinite(Number(chainIndex)) ? Number(chainIndex) : OKX_CHAIN_INDEX_FALLBACK;
        const numericSort = Number.isFinite(Number(sortBy)) ? Number(sortBy) : 2;
        const numericTime = Number.isFinite(Number(timeFrame)) ? Number(timeFrame) : 4;
        const chainEntry = await resolveTopTokenChainEntry(numericChain);
        const chainLabel = formatChainLabel(chainEntry) || (Number.isFinite(numericChain) ? `#${numericChain}` : '-');
        const sortLabel = describeTopTokenSort(lang, numericSort);
        const timeLabel = describeTopTokenTimeframe(lang, numericTime);

        const sessionKey = options.sessionKey || null;
        const pageSize = Number.isFinite(options.pageSize) ? Math.max(1, options.pageSize) : 8;
        const requestedPage = Number.isFinite(options.page) ? options.page : 0;
        const forceRefresh = options.forceRefresh === true;

        const session = sessionKey ? getTopTokenSession(sessionKey) || {} : {};
        let entries = (!forceRefresh
            && Array.isArray(session.entries)
            && session.chainIndex === numericChain
            && session.sortBy === numericSort
            && session.timeFrame === numericTime)
            ? session.entries
            : null;

        try {
            if (!entries) {
                const fetched = await fetchOkxTopTokenList({ chains: [numericChain], sortBy: numericSort, timeFrame: numericTime });
                entries = dedupeTopTokenEntries(fetched);
            }

            const pagination = paginateTopTokens(entries, requestedPage, pageSize);

            if (sessionKey) {
                updateTopTokenSession(sessionKey, {
                    chainIndex: numericChain,
                    chainLabel,
                    sortBy: numericSort,
                    sortLabel,
                    timeFrame: numericTime,
                    timeLabel,
                    entries,
                    page: pagination.page
                });
            }

            const text = formatTopTokenList(pagination.items, lang, {
                chainLabel,
                sortLabel,
                timeLabel,
                sortBy: numericSort,
                timeFrame: numericTime,
                page: pagination.page,
                totalPages: pagination.totalPages,
                startRank: pagination.startRank
            });

            return {
                text,
                replyMarkup: buildTopTokenResultKeyboard(lang, {
                    chainIndex: numericChain,
                    sortBy: numericSort,
                    timeFrame: numericTime,
                    page: pagination.page,
                    totalPages: pagination.totalPages
                })
            };
        } catch (error) {
            log.error(`Failed to fetch ranking: ${error.message}`);
            if (sessionKey) {
                updateTopTokenSession(sessionKey, {
                    chainIndex: numericChain,
                    chainLabel,
                    sortBy: numericSort,
                    sortLabel,
                    timeFrame: numericTime,
                    timeLabel
                });
            }
            return {
                text: t(lang, 'toptoken_error'),
                replyMarkup: buildTopTokenResultKeyboard(lang, {
                    chainIndex: numericChain,
                    sortBy: numericSort,
                    timeFrame: numericTime,
                    page: 0,
                    totalPages: 1
                })
            };
        }
    }

    async function handleTopTokenCommand(msg) {
        if (await enforceOwnerCommandLimit(msg, 'toptoken')) {
            return;
        }

        const lang = await getLang(msg);
        const sessionKey = buildTopTokenSessionKey(msg.chat?.id, msg.from?.id);
        updateTopTokenSession(sessionKey, { chainIndex: null, chainLabel: null, sortBy: null, timeFrame: null, lang, entries: null, page: 0 });

        try {
            const menu = await buildTopTokenChainMenu(lang);
            await sendReply(msg, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
        } catch (error) {
            log.error(`Failed to start command: ${error.message}`);
            await sendReply(msg, t(lang, 'toptoken_error'), { parse_mode: 'Markdown' });
        }
    }

    return {
        buildTopTokenSessionKey,
        getTopTokenSession,
        updateTopTokenSession,
        clearTopTokenSession,
        describeTopTokenSort,
        describeTopTokenTimeframe,
        formatTopTokenList,
        buildTopTokenChainMenu,
        buildTopTokenSortMenu,
        buildTopTokenTimeframeMenu,
        buildTopTokenResultKeyboard,
        renderTopTokenResults,
        handleTopTokenCommand
    };
}

module.exports = createTopTokenHelpers;
