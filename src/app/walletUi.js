const crypto = require('crypto');
const { buildPaginatedChainKeyboard, sortChainsWithPriority } = require('../features/chainMenu');
const { getChainIcon } = require('../features/chainIcons');

function createWalletUi({
    t,
    db,
    appendCloseButton,
    shortenAddress,
    normalizeAddressSafe,
    fetchOkxBalanceSupportedChains,
    WALLET_CHAIN_CALLBACK_TTL,
    WALLET_TOKEN_CALLBACK_TTL,
    OKX_CHAIN_INDEX_FALLBACK,
    preferredChainIndex = null,
    walletChainCallbackStore,
    walletTokenCallbackStore,
    PUBLIC_BASE_URL,
    escapeHtml
}) {
    function buildWalletActionKeyboard(lang, portfolioLinks = [], options = {}) {
        const extraRows = [];
        for (const link of portfolioLinks) {
            if (!link?.url || !link.address) {
                continue;
            }
            extraRows.push([
                {
                    text: t(lang, 'wallet_action_portfolio', { wallet: shortenAddress(link.address) }),
                    url: link.url
                }
            ]);
        }

        const inline_keyboard = [
            [{ text: t(lang, 'wallet_action_view'), callback_data: 'wallet_overview' }],
            [{ text: t(lang, 'wallet_action_manage'), callback_data: 'wallet_manage' }],
            [{ text: t(lang, 'tw_title'), callback_data: 'tw_back' }],
            ...extraRows
        ];

        if (options.includeClose !== false) {
            inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
        }

        return { inline_keyboard };
    }

    function sortChainsForMenu(chains) {
        if (!Array.isArray(chains)) {
            return [];
        }
        const isXlayer = (entry) => {
            if (!entry) return false;
            if (Number(entry.chainId) === 196 || Number(entry.chainIndex) === 196) {
                return true;
            }
            const aliases = entry.aliases || [];
            return aliases.some((alias) => typeof alias === 'string' && alias.toLowerCase().includes('xlayer'));
        };

        return [...chains].sort((a, b) => {
            const aX = isXlayer(a);
            const bX = isXlayer(b);
            if (aX !== bX) {
                return aX ? -1 : 1;
            }
            const aId = Number.isFinite(a?.chainId) ? a.chainId : Number.isFinite(a?.chainIndex) ? a.chainIndex : Infinity;
            const bId = Number.isFinite(b?.chainId) ? b.chainId : Number.isFinite(b?.chainIndex) ? b.chainIndex : Infinity;
            return aId - bId;
        });
    }

    function pruneWalletChainCallbacks() {
        const now = Date.now();
        for (const [key, value] of walletChainCallbackStore.entries()) {
            if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) {
                walletChainCallbackStore.delete(key);
            }
        }
    }

    function createWalletChainCallback(entry, walletAddress) {
        pruneWalletChainCallbacks();
        const token = crypto.randomBytes(4).toString('hex');
        const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;

        const chainId = Number.isFinite(entry?.chainId)
            ? Number(entry.chainId)
            : Number.isFinite(entry?.chainIndex)
                ? Number(entry.chainIndex)
                : OKX_CHAIN_INDEX_FALLBACK;

        const chainContext = {
            chainId,
            chainIndex: Number.isFinite(entry?.chainIndex) ? Number(entry.chainIndex) : chainId,
            chainShortName: entry?.chainShortName || null,
            chainName: entry?.chainName || null,
            aliases: Array.isArray(entry?.aliases) ? entry.aliases : null
        };

        walletChainCallbackStore.set(token, {
            wallet: normalizedWallet,
            chainContext,
            expiresAt: Date.now() + WALLET_CHAIN_CALLBACK_TTL
        });

        return token;
    }

    function createWalletChainPageToken(walletAddress) {
        pruneWalletChainCallbacks();
        const token = crypto.randomBytes(4).toString('hex');
        const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;
        walletChainCallbackStore.set(token, {
            wallet: normalizedWallet,
            expiresAt: Date.now() + WALLET_CHAIN_CALLBACK_TTL,
            type: 'page'
        });
        return token;
    }

    function resolveWalletChainCallback(token) {
        pruneWalletChainCallbacks();
        const value = walletChainCallbackStore.get(token);
        if (!value) {
            return null;
        }
        if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
            walletChainCallbackStore.delete(token);
            return null;
        }
        walletChainCallbackStore.delete(token);
        return value;
    }

    function pruneWalletTokenCallbacks() {
        const now = Date.now();
        for (const [key, entry] of walletTokenCallbackStore.entries()) {
            if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
                walletTokenCallbackStore.delete(key);
            }
        }
    }

    function registerWalletTokenContext(context) {
        if (!context) {
            return null;
        }

        pruneWalletTokenCallbacks();
        const token = crypto.randomBytes(4).toString('hex');
        const now = Date.now();
        const storedContext = {
            ...context,
            tokenCallbackId: token
        };
        walletTokenCallbackStore.set(token, {
            context: storedContext,
            expiresAt: now + WALLET_TOKEN_CALLBACK_TTL
        });
        return token;
    }

    function resolveWalletTokenContext(token, { extend = false } = {}) {
        if (!token) {
            return null;
        }

        pruneWalletTokenCallbacks();
        const entry = walletTokenCallbackStore.get(token);
        if (!entry) {
            return null;
        }

        if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
            walletTokenCallbackStore.delete(token);
            return null;
        }

        if (extend) {
            entry.expiresAt = Date.now() + WALLET_TOKEN_CALLBACK_TTL;
        }

        if (entry.context && !entry.context.tokenCallbackId) {
            entry.context.tokenCallbackId = token;
        }

        return entry.context;
    }

    async function buildWalletChainMenu(lang, walletAddress, { page = 0 } = {}) {
        let chains = [];
        try {
            chains = await fetchOkxBalanceSupportedChains();
        } catch (error) {
            console.warn(`[WalletChains] Failed to load supported chains: ${error.message}`);
        }

        const xlayerEntry = { chainId: 196, chainIndex: 196, chainShortName: 'xlayer', chainName: 'X Layer', aliases: ['xlayer'] };
        const hasXlayer = Array.isArray(chains)
            && chains.some((entry) => {
                if (!entry) return false;
                if (Number(entry.chainId) === 196 || Number(entry.chainIndex) === 196) return true;
                const aliases = entry.aliases || [];
                return aliases.some((alias) => typeof alias === 'string' && alias.toLowerCase().includes('xlayer'));
            });

        if (!hasXlayer) {
            chains = Array.isArray(chains) && chains.length > 0 ? [xlayerEntry, ...chains] : [xlayerEntry];
        }

        if (!Array.isArray(chains) || chains.length === 0) {
            chains = [xlayerEntry];
        }

        const sorted = sortChainsWithPriority(sortChainsForMenu(chains), {
            preferChainIndex: preferredChainIndex || OKX_CHAIN_INDEX_FALLBACK,
            preferAliases: ['xlayer']
        });

        const keyboard = buildPaginatedChainKeyboard(sorted, {
            t,
            lang,
            prefix: 'wallet_chain_menu',
            page,
            backCallbackData: 'wallet_overview',
            closeCallbackData: 'ui_close',
            preferChainIndex: preferredChainIndex || OKX_CHAIN_INDEX_FALLBACK,
            formatLabel: (entry) => {
                const icon = getChainIcon(entry);
                const label = formatChainLabel(entry) || 'Chain';
                return `${icon} ${label}`.trim();
            },
            buildSelectCallback: (entry) => {
                const callbackToken = createWalletChainCallback(entry, walletAddress);
                return `wallet_chain|${callbackToken}`;
            }
        });

        const inline_keyboard = keyboard.inline_keyboard.map((row) =>
            row.map((btn) => {
                if (btn.callback_data && btn.callback_data.startsWith('wallet_chain_menu_page:')) {
                    const pageValue = btn.callback_data.split(':')[1] || '0';
                    const pageToken = createWalletChainPageToken(walletAddress);
                    return { ...btn, callback_data: `wallet_chain_page|${pageToken}|${pageValue}` };
                }
                if (btn.callback_data === 'wallet_chain_menu_noop') {
                    return { ...btn, callback_data: 'wallet_chain_menu_noop' };
                }
                return btn;
            })
        );

        const contextLine = walletAddress
            ? t(lang, 'wallet_balance_wallet', {
                index: '1',
                wallet: escapeHtml(shortenAddress(walletAddress)),
                fullWallet: escapeHtml(walletAddress)
            })
            : null;
        const lines = [t(lang, 'wallet_chain_prompt')];
        if (contextLine) {
            lines.push(contextLine);
        }

        return {
            text: lines.join('\n'),
            replyMarkup: { inline_keyboard },
            chains: sorted
        };
    }

    async function buildWalletSelectMenu(lang, chatId, walletsOverride = null) {
        const wallets = Array.isArray(walletsOverride) ? walletsOverride : await db.getWalletsForUser(chatId);


        const lines = [];
        const inline_keyboard = [];

        if (!Array.isArray(wallets) || wallets.length === 0) {
            lines.push(t(lang, 'mywallet_not_linked'));
        } else {
            lines.push(t(lang, 'mywallet_list_header', { count: wallets.length.toString() }));
            lines.push(t(lang, 'mywallet_list_footer'));
            for (const wallet of wallets) {
                const normalized = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
                const shortAddr = shortenAddress(normalized);
                const nameLabel = typeof wallet?.name === 'string' && wallet.name.trim() ? `${wallet.name.trim()} - ` : '';
                inline_keyboard.push([{ text: `👛 ${nameLabel}${shortAddr}`, callback_data: `wallet_pick|${normalized}` }]);
            }
        }

        // ━━ Trading Wallet Section ━━
        let twList = [];
        try {
            const { dbAll } = require('../../db/core');
            twList = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC', [chatId]) || [];
        } catch (e) { /* ok */ }
        lines.push('');
        lines.push(`━━ ${t(lang, 'tw_title')} ━━`);
        if (twList.length > 0) {
            twList.forEach((w, i) => {
                const star = w.isDefault ? ' ⭐' : '';
                const name = w.walletName ? `${w.walletName} • ` : '';
                const okxLink = `https://www.okx.com/web3/explorer/xlayer/address/${w.address}`;
                lines.push(`${i + 1}. ${name}<a href="${okxLink}"><code>${escapeHtml(w.address)}</code></a>${star}`);
                inline_keyboard.push([
                    { text: `💰 #${i + 1}`, callback_data: `tw_balance|${w.id}` },
                    { text: `🔑 #${i + 1}`, callback_data: `tw_export|${w.id}` },
                    { text: `🗑️ #${i + 1}`, callback_data: `tw_delete|${w.id}` }
                ]);
            });
        } else {
            lines.push(`📭 ${t(lang, 'tw_none')}`);
        }
        inline_keyboard.push([
            { text: t(lang, 'tw_btn_create'), callback_data: 'tw_create' },
            { text: t(lang, 'tw_btn_import'), callback_data: 'tw_import' }
        ]);
        inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

        return {
            text: lines.join('\n'),
            replyMarkup: { inline_keyboard }
        };
    }

    // ═══════════════════════════════════════════════════════
    // HUB MENU — Clean 3-button entry point
    // ═══════════════════════════════════════════════════════
    async function buildWalletHubMenu(lang, chatId) {
        const wallets = await db.getWalletsForUser(chatId);
        const watchCount = Array.isArray(wallets) ? wallets.length : 0;

        let twCount = 0;
        try {
            const { dbGet } = require('../../db/core');
            const row = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [String(chatId)]);
            twCount = row?.cnt || 0;
        } catch (e) { /* ok */ }

        const lines = [
            `🏦 <b>${t(lang, 'wh_title')}</b>`,
            `━━━━━━━━━━━━━━━━━━`,
            `💼 ${t(lang, 'wh_summary_trading', { count: String(twCount) })}`,
            `👁️ ${t(lang, 'wh_summary_watch', { count: String(watchCount) })}`,
            ``,
            `💡 <i>${t(lang, 'wh_tip')}</i>`
        ];

        const inline_keyboard = [
            [{ text: `💼 ${t(lang, 'wh_btn_trading')} (${twCount})`, callback_data: 'wh_trading|0' }],
            [{ text: `👁️ ${t(lang, 'wh_btn_watch')} (${watchCount})`, callback_data: 'wh_watch|0' }],
            [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
        ];

        return {
            text: lines.join('\n'),
            replyMarkup: { inline_keyboard }
        };
    }

    // Keep backward compat — old callers can still use this name
    async function buildWalletManagerMenu(lang, chatId) {
        return buildWalletHubMenu(lang, chatId);
    }

    // ═══════════════════════════════════════════════════════
    // TRADING WALLET SUB-MENU — Paginated with inline balance
    // ═══════════════════════════════════════════════════════
    const TW_PAGE_SIZE = 3;

    async function buildTradingWalletSubMenu(lang, chatId, page = 0) {
        const { dbAll } = require('../../db/core');
        const allWallets = await dbAll(
            'SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC',
            [String(chatId)]
        ) || [];

        const totalPages = Math.max(1, Math.ceil(allWallets.length / TW_PAGE_SIZE));
        const currentPage = Math.min(Math.max(0, page), totalPages - 1);
        const start = currentPage * TW_PAGE_SIZE;
        const pageWallets = allWallets.slice(start, start + TW_PAGE_SIZE);

        const lines = [
            `💼 <b>${t(lang, 'wh_trading_title')}</b>`,
            `━━━━━━━━━━━━━━━━━━`
        ];

        const buttons = [];

        if (allWallets.length === 0) {
            lines.push(`📭 ${t(lang, 'tw_none')}`);
        } else {
            // Fetch balances for page wallets
            let okxService = null;
            try {
                const config = require('../config/env');
                const createOkxService = require('../services/okxService');
                okxService = createOkxService(config);
            } catch (e) { /* ok */ }

            for (let idx = 0; idx < pageWallets.length; idx++) {
                const w = pageWallets[idx];
                const globalIdx = start + idx + 1;
                const star = w.isDefault ? ' ⭐' : '';
                const name = w.walletName ? ` "${w.walletName}"` : '';
                const okxLink = `https://www.okx.com/web3/explorer/xlayer/address/${w.address}`;

                // Wallet header
                lines.push(`<b>${globalIdx}.</b>${name}${star}`);
                lines.push(`<a href="${okxLink}"><code>${escapeHtml(w.address)}</code></a>`);

                // Inline balance
                if (okxService) {
                    try {
                        const snapshot = await okxService.fetchOkxDexBalanceSnapshot(w.address, { explicitChainIndex: 196 }).catch(() => ({ tokens: [] }));
                        const tokens = snapshot.tokens || [];
                        if (tokens.length === 0) {
                            lines.push(`   💰 $0.00`);
                        } else {
                            let walletTotal = 0;
                            const sortedTokens = tokens
                                .map(b => {
                                    const val = Number(b.balance || b.tokenBalance || 0);
                                    const sym = b.symbol || b.tokenSymbol || '?';
                                    const price = Number(b.priceUsd || b.tokenPrice || b.price || 0);
                                    const usd = price * val;
                                    return { sym, val, usd };
                                })
                                .filter(t => t.usd >= 0.01 || t.val > 0)
                                .sort((a, b) => b.usd - a.usd);

                            walletTotal = sortedTokens.reduce((sum, t) => sum + t.usd, 0);
                            lines.push(`   💰 <b>$${walletTotal.toFixed(2)}</b>`);

                            const topTokens = sortedTokens.slice(0, 5);
                            if (topTokens.length > 0) {
                                topTokens.forEach(t => {
                                    const valStr = t.val > 0.01 ? t.val.toFixed(2) : t.val.toFixed(6);
                                    lines.push(`   ├ <b>${t.sym}</b>: ${valStr} ($${t.usd.toFixed(2)})`);
                                });
                                if (sortedTokens.length > 5) {
                                    lines.push(`   └ <i>+${sortedTokens.length - 5} tokens khác...</i>`);
                                }
                            }
                        }
                    } catch (e) {
                        lines.push(`   💰 —`);
                    }
                }
                lines.push('');

                // Per-wallet action rows
                const strIdx = String(globalIdx);
                const row1 = [
                    { text: t(lang, 'wh_btn_short_balance', { idx: strIdx }) || `💰 #${globalIdx}`, callback_data: `tw_balance|${w.id}` },
                    { text: t(lang, 'wh_btn_short_export', { idx: strIdx }) || `🔑 #${globalIdx}`, callback_data: `tw_export|${w.id}` },
                    { text: `✏️ #${globalIdx}`, callback_data: `tw_rename|${w.id}` }
                ];
                const row2 = [];
                if (!w.isDefault) {
                    row2.push({ text: t(lang, 'wh_btn_short_default', { idx: strIdx }) || `⭐ #${globalIdx}`, callback_data: `tw_setdefault|${w.id}` });
                }
                row2.push({ text: t(lang, 'wh_btn_short_delete', { idx: strIdx }) || `🗑️ #${globalIdx}`, callback_data: `tw_delete|${w.id}` });

                buttons.push(row1);
                if (row2.length > 0) buttons.push(row2);
            }

            // Pagination
            if (totalPages > 1) {
                lines.push(`📄 ${t(lang, 'wh_page_info', { current: String(currentPage + 1), total: String(totalPages) })}`);
                const navRow = [];
                if (currentPage > 0) {
                    navRow.push({ text: '⬅️', callback_data: `wh_trading|${currentPage - 1}` });
                }
                navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
                if (currentPage < totalPages - 1) {
                    navRow.push({ text: '➡️', callback_data: `wh_trading|${currentPage + 1}` });
                }
                buttons.push(navRow);
            }

            lines.push(`${t(lang, 'tw_multi_hint')}`);
        }

        // ── Bulk actions ──
        if (allWallets.length > 0) {
            buttons.push([
                { text: t(lang, 'tw_btn_check_all_balance'), callback_data: 'tw_check_all' },
                { text: t(lang, 'tw_btn_export_all'), callback_data: 'tw_export_all' }
            ]);
        }

        // ── Management ──
        buttons.push([
            { text: t(lang, 'tw_btn_create'), callback_data: 'tw_create' },
            { text: t(lang, 'tw_btn_import'), callback_data: 'tw_import' }
        ]);
        if (allWallets.length > 0) {
            buttons.push([
                { text: t(lang, 'tw_btn_delete_all'), callback_data: 'tw_delete_all' }
            ]);
        }

        // ── Back to hub ──
        buttons.push([{ text: `↩️ ${t(lang, 'wh_btn_back')}`, callback_data: 'wh_back' }]);

        return {
            text: lines.filter(l => l !== undefined).join('\n'),
            replyMarkup: { inline_keyboard: buttons }
        };
    }

    // ═══════════════════════════════════════════════════════
    // WATCH WALLET SUB-MENU — Paginated
    // ═══════════════════════════════════════════════════════
    const WW_PAGE_SIZE = 3;

    async function buildWatchWalletSubMenu(lang, chatId, page = 0) {
        const wallets = await db.getWalletsForUser(chatId);
        const allWallets = Array.isArray(wallets) ? wallets : [];

        const totalPages = Math.max(1, Math.ceil(allWallets.length / WW_PAGE_SIZE));
        const currentPage = Math.min(Math.max(0, page), totalPages - 1);
        const start = currentPage * WW_PAGE_SIZE;
        const pageWallets = allWallets.slice(start, start + WW_PAGE_SIZE);

        const lines = [
            `👁️ <b>${t(lang, 'wh_watch_title')}</b>`,
            `━━━━━━━━━━━━━━━━━━`
        ];

        const buttons = [];

        if (allWallets.length === 0) {
            lines.push(`📭 ${t(lang, 'mywallet_not_linked')}`);
        } else {
            for (let idx = 0; idx < pageWallets.length; idx++) {
                const wallet = pageWallets[idx];
                const globalIdx = start + idx + 1;
                const normalized = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
                const shortAddr = shortenAddress(normalized);
                const nameLabel = typeof wallet?.name === 'string' && wallet.name.trim() ? ` "${wallet.name.trim()}"` : '';
                const okxLink = `https://www.okx.com/web3/explorer/xlayer/address/${normalized}`;

                lines.push(`<b>${globalIdx}.</b>${nameLabel}`);
                lines.push(`<a href="${okxLink}"><code>${escapeHtml(normalized)}</code></a>`);
                lines.push('');

                buttons.push([
                    { text: `👁️ ${t(lang, 'wh_btn_view')} #${globalIdx}`, callback_data: `wallet_pick|${encodeURIComponent(normalized)}` },
                    { text: `🗑️ ${t(lang, 'wh_btn_remove')} #${globalIdx}`, callback_data: `wallet_remove|wallet|${encodeURIComponent(normalized)}` }
                ]);
            }

            // Pagination
            if (totalPages > 1) {
                lines.push(`📄 ${t(lang, 'wh_page_info', { current: String(currentPage + 1), total: String(totalPages) })}`);
                const navRow = [];
                if (currentPage > 0) {
                    navRow.push({ text: '⬅️', callback_data: `wh_watch|${currentPage - 1}` });
                }
                navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
                if (currentPage < totalPages - 1) {
                    navRow.push({ text: '➡️', callback_data: `wh_watch|${currentPage + 1}` });
                }
                buttons.push(navRow);
            }
        }

        // ── Actions ──
        buttons.push([{ text: `➕ ${t(lang, 'wh_btn_add_watch')}`, callback_data: 'walletmgr|add' }]);
        if (allWallets.length > 1) {
            buttons.push([{ text: `🔥 ${t(lang, 'unregister_all')} 🔥`, callback_data: 'wallet_remove|all' }]);
        }

        // ── Back to hub ──
        buttons.push([{ text: `↩️ ${t(lang, 'wh_btn_back')}`, callback_data: 'wh_back' }]);

        return {
            text: lines.filter(l => l !== undefined).join('\n'),
            replyMarkup: { inline_keyboard: buttons }
        };
    }

    function buildPortfolioEmbedUrl(walletAddress) {
        const normalized = normalizeAddressSafe(walletAddress) || walletAddress;
        const base = PUBLIC_BASE_URL.replace(/\/$/, '');
        if (!base || base.includes('localhost') || base.startsWith('http://127.')) {
            return null;
        }
        if (!/^https?:\/\//i.test(base)) {
            return null;
        }
        return `${base}/webview/portfolio/${encodeURIComponent(normalized)}`;
    }

    function buildOkxPortfolioAnalysisUrl(walletAddress) {
        const normalized = normalizeAddressSafe(walletAddress);
        if (!normalized) {
            return null;
        }
        return `https://web3.okx.com/portfolio/${encodeURIComponent(normalized)}/analysis`;
    }

    function formatChainLabel(entry) {
        if (!entry) {
            return null;
        }
        const pieces = [];
        if (entry.chainName) {
            pieces.push(entry.chainName);
        }
        if (entry.chainShortName && entry.chainShortName !== entry.chainName) {
            pieces.push(entry.chainShortName);
        }
        const label = pieces.length > 0 ? pieces.join(' / ') : (entry.chainShortName || entry.chainName || null);
        const id = entry.chainId || entry.chainIndex;
        if (label && Number.isFinite(id)) {
            return `${label} (#${id})`;
        }
        return label || (Number.isFinite(id) ? `#${id}` : null);
    }

    return {
        buildWalletActionKeyboard,
        sortChainsForMenu,
        createWalletChainCallback,
        resolveWalletChainCallback,
        registerWalletTokenContext,
        resolveWalletTokenContext,
        buildWalletChainMenu,
        buildWalletSelectMenu,
        buildWalletManagerMenu,
        buildWalletHubMenu,
        buildTradingWalletSubMenu,
        buildWatchWalletSubMenu,
        buildPortfolioEmbedUrl,
        buildOkxPortfolioAnalysisUrl,
        formatChainLabel
    };
}

module.exports = createWalletUi;
