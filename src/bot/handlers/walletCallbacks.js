/**
 * Wallet callback handlers — extracted from index.js
 * Contains wallet_overview, wallet_chain, wallet_pick, wallet_dexp,
 * wallet_token_action, wallet_token_view, wallet_manage, walletmgr, wallet_remove.
 */
const logger = require('../../core/logger');
const log = logger.child('Wallet');

async function handleWalletCallback(query, ctx, deps) {
    const { bot, t, db, buildWalletBalanceTextInline, buildWalletChainMenu,
        buildWalletManagerMenu, buildWalletTokenActionResult,
        fetchLiveWalletTokens, fetchOkxBalanceSupportedChains,
        sendWalletTokenExtraTexts, startRegisterWizard,
        buildCloseKeyboard, appendCloseButton,
        resolveWalletChainCallback, resolveWalletTokenContext,
        normalizeAddressSafe, formatChainLabel, createWalletChainCallback,
        buildWalletTokenButtonRows, buildPortfolioEmbedUrl, shortenAddress,
        buildWalletTokenMenu, buildThreadedOptions, isTelegramMessageNotModifiedError,
        teardownWalletWatcher } = deps;

    const { queryId, chatId, callbackLang } = ctx;

    if (query.data === 'wallet_overview' || query.data.startsWith('wallet_chain_menu') || query.data.startsWith('wallet_chain_page')) {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const walletParam = query.data.startsWith('wallet_chain_menu')
            ? decodeURIComponent(query.data.split('|')[1] || '')
            : null;

        if (query.data.startsWith('wallet_chain_page|')) {
            const parts = query.data.split('|');
            const pageToken = parts[1] || '';
            const page = Number(parts[2] || '0');
            const resolved = resolveWalletChainCallback(pageToken);
            const targetWallet = resolved?.wallet || null;
            try {
                const menu = await buildWalletChainMenu(callbackLang, targetWallet || null, { page });
                const options = {
                    chat_id: chatId,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup
                };
                if (options.message_id) {
                    await bot.editMessageText(menu.text, options);
                } else {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                }
            } catch (error) {
                log.child('WalletChains').warn(`Failed to paginate chain menu: ${error.message}`);
            }
            await bot.answerCallbackQuery(queryId);
            return;
        }

        try {
            if (walletParam) {
                const menu = await buildWalletChainMenu(callbackLang, walletParam);
                const options = {
                    chat_id: chatId,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup
                };

                if (options.message_id) {
                    await bot.editMessageText(menu.text, options);
                } else {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                }
            } else {
                const menu = await buildWalletManagerMenu(callbackLang, chatId);
                const options = {
                    chat_id: chatId,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup
                };

                if (options.message_id) {
                    await bot.editMessageText(menu.text, options);
                } else {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                }
            }
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
        } catch (error) {
            log.child('WalletChains').error(`Failed to render wallet menu: ${error.message}`);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('wallet_pick|')) {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const wallet = decodeURIComponent(query.data.split('|')[1] || '');
        try {
            const menu = await buildWalletChainMenu(callbackLang, wallet);
            const options = {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'HTML',
                reply_markup: menu.replyMarkup
            };

            if (options.message_id) {
                await bot.editMessageText(menu.text, options);
            } else {
                await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
            }

            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
        } catch (error) {
            log.child('WalletPick').error(`Failed to render chains for ${wallet}: ${error.message}`);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('wallet_dexp|')) {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const parts = query.data.split('|');
        let targetWallet = null;
        let chainContext = null;
        let chainShort = null;
        let chainIndex = null;
        let page = 0;

        if (parts.length === 3) {
            const pageToken = parts[1] || null;
            page = Number(parts[2]) || 0;
            const resolved = pageToken ? resolveWalletChainCallback(pageToken) : null;
            if (resolved?.wallet) {
                targetWallet = normalizeAddressSafe(resolved.wallet) || resolved.wallet || null;
            }
            if (resolved?.chainContext) {
                chainContext = resolved.chainContext;
                chainShort = chainContext.chainShortName || null;
                chainIndex = Number.isFinite(chainContext.chainIndex)
                    ? chainContext.chainIndex
                    : Number.isFinite(chainContext.chainId)
                        ? chainContext.chainId
                        : null;
            }
        } else {
            const walletRaw = parts[1] ? decodeURIComponent(parts[1]) : null;
            const chainIndexRaw = parts[2];
            const chainShortRaw = parts[3];
            const pageRaw = parts[4];
            targetWallet = normalizeAddressSafe(walletRaw) || walletRaw || null;
            chainIndex = Number(chainIndexRaw);
            chainShort = chainShortRaw ? decodeURIComponent(chainShortRaw) : null;
            page = Number(pageRaw) || 0;
        }

        chainContext = chainContext || {
            chainIndex: Number.isFinite(chainIndex) ? chainIndex : 196,
            chainId: Number.isFinite(chainIndex) ? chainIndex : 196,
            chainShortName: chainShort || 'xlayer',
            aliases: chainShort ? [chainShort] : ['xlayer']
        };
        const chainLabel = formatChainLabel(chainContext);

        if (!targetWallet) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
            return;
        }

        try {
            const liveSnapshot = await fetchLiveWalletTokens(targetWallet, {
                chainContext,
                forceDex: true
            });

            const entries = [{
                address: targetWallet,
                tokens: Array.isArray(liveSnapshot.tokens) ? liveSnapshot.tokens : [],
                warning: liveSnapshot.warning,
                cached: false,
                totalUsd: Number.isFinite(liveSnapshot.totalUsd) ? liveSnapshot.totalUsd : null
            }];

            const pageSize = 3;
            const totalTokens = entries[0]?.tokens?.length || 0;
            const totalPages = Math.max(1, Math.ceil(totalTokens / pageSize));
            const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
            const pageTokens = (entries[0]?.tokens || []).slice(currentPage * pageSize, currentPage * pageSize + pageSize);

            const text = await buildWalletBalanceTextInline(callbackLang, entries, {
                chainLabel,
                page: currentPage
            });

            const chainRefreshToken = createWalletChainCallback(chainContext, targetWallet);
            const chainCallbackData = chainRefreshToken
                ? `wallet_chain|${chainRefreshToken}|${currentPage}`
                : null;
            const pageNavToken = createWalletChainCallback(chainContext, targetWallet);
            const tokenButtonRows = buildWalletTokenButtonRows(callbackLang, pageTokens, {
                wallet: targetWallet,
                chainContext,
                chainLabel,
                chainCallbackData
            });
            const navRow = [];
            const navToken = pageNavToken || chainRefreshToken;
            if (totalPages > 1 && navToken) {
                const prevPage = Math.max(0, currentPage - 1);
                const nextPage = Math.min(totalPages - 1, currentPage + 1);
                navRow.push({ text: '⬅️', callback_data: `wallet_dexp|${navToken}|${prevPage}` });
                navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: `wallet_dexp|${navToken}|${currentPage}` });
                navRow.push({ text: '➡️', callback_data: `wallet_dexp|${navToken}|${nextPage}` });
            }
            const portfolioRows = entries
                .map((entry) => ({ address: entry.address, url: buildPortfolioEmbedUrl(entry.address) }))
                .filter((row) => row.address && row.url)
                .map((row) => [{ text: t(callbackLang, 'wallet_action_portfolio', { wallet: shortenAddress(row.address) }), url: row.url }]);
            const backCallback = targetWallet ? `wallet_chain_menu|${encodeURIComponent(targetWallet)}` : 'wallet_overview';
            const combinedRows = [];
            if (navRow.length) {
                combinedRows.push(navRow);
            }
            if (tokenButtonRows.length > 0) {
                combinedRows.push(...tokenButtonRows);
            }
            if (portfolioRows.length > 0) {
                combinedRows.push(...portfolioRows);
            }
            const replyMarkup = appendCloseButton(
                combinedRows.length ? { inline_keyboard: combinedRows } : null,
                callbackLang,
                { backCallbackData: backCallback }
            );

            if (query.message?.message_id) {
                try {
                    await bot.editMessageText(text, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup
                    });
                } catch (error) {
                    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
                }
            } else {
                await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
            }

            await bot.answerCallbackQuery(queryId);
        } catch (error) {
            log.child('WalletDexPage').error(`Failed to paginate DEX assets: ${error.message}`);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('wallet_chain|')) {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const parts = query.data.split('|');
        const chainToken = parts[1] ? parts[1].trim() : null;
        const third = parts.length > 3 ? decodeURIComponent(parts[2]) : null;
        const fourth = parts.length > 3 ? decodeURIComponent(parts[3]) : null;
        const pageArg = parts.length === 3 ? (Number(parts[2]) || 0) : (Number(parts[4]) || 0);

        let chainShort = null;
        let targetWallet = null;
        let chainId = Number.isFinite(Number(chainToken)) ? Number(chainToken) : null;
        let chainEntry = null;

        if (chainToken && !Number.isFinite(chainId)) {
            const resolved = resolveWalletChainCallback(chainToken);
            if (resolved?.chainContext) {
                chainEntry = resolved.chainContext;
                chainId = Number.isFinite(chainEntry.chainId)
                    ? chainEntry.chainId
                    : Number.isFinite(chainEntry.chainIndex)
                        ? chainEntry.chainIndex
                        : chainId;
                chainShort = chainEntry.chainShortName || chainShort;
                targetWallet = targetWallet || resolved.wallet || null;
            }
        }

        if (fourth) {
            chainShort = third;
            targetWallet = normalizeAddressSafe(fourth) || fourth;
        } else if (third) {
            const maybeWallet = normalizeAddressSafe(third);
            if (maybeWallet) {
                targetWallet = maybeWallet;
            } else {
                chainShort = third;
            }
        }

        try {
            const chains = await fetchOkxBalanceSupportedChains();
            chainEntry = chainEntry || chains.find((entry) => Number(entry.chainId) === chainId
                || Number(entry.chainIndex) === chainId
                || (chainShort && entry.chainShortName === chainShort));
        } catch (error) {
            log.child('WalletChains').warn(`Failed to load chains for selection: ${error.message}`);
        }

        const chainContext = chainEntry || {
            chainId: Number.isFinite(chainId) ? chainId : 196,
            chainIndex: Number.isFinite(chainId) ? chainId : 196,
            chainShortName: chainEntry?.chainShortName || chainShort || 'xlayer',
            aliases: chainEntry?.aliases || (chainShort ? [chainShort] : ['xlayer'])
        };
        const chainLabel = formatChainLabel(chainContext) || 'X Layer (#196)';

        try {
            const normalizedWallet = normalizeAddressSafe(targetWallet) || targetWallet;
            const liveSnapshot = await fetchLiveWalletTokens(normalizedWallet, {
                chainContext,
                forceDex: true
            });

            const pageSize = 3;
            const entries = [{
                address: normalizedWallet,
                tokens: Array.isArray(liveSnapshot.tokens) ? liveSnapshot.tokens : [],
                warning: liveSnapshot.warning,
                cached: false,
                totalUsd: Number.isFinite(liveSnapshot.totalUsd) ? liveSnapshot.totalUsd : null
            }];

            const totalTokens = entries[0]?.tokens?.length || 0;
            const totalPages = Math.max(1, Math.ceil(totalTokens / pageSize));
            const currentPage = Math.min(Math.max(pageArg, 0), totalPages - 1);
            const pageTokens = (entries[0]?.tokens || []).slice(currentPage * pageSize, currentPage * pageSize + pageSize);

            const text = await buildWalletBalanceTextInline(callbackLang, entries, { chainLabel, page: currentPage });
            const chainRefreshToken = createWalletChainCallback(chainContext, normalizedWallet);
            const chainCallbackData = chainRefreshToken
                ? `wallet_chain|${chainRefreshToken}|${currentPage}`
                : null;
            const pageNavToken = createWalletChainCallback(chainContext, normalizedWallet);
            const tokenButtonRows = buildWalletTokenButtonRows(callbackLang, pageTokens, {
                wallet: normalizedWallet,
                chainContext,
                chainLabel,
                chainCallbackData
            });
            const navRow = [];
            const navToken = pageNavToken || chainRefreshToken;
            if (totalPages > 1 && navToken) {
                const prevPage = Math.max(0, currentPage - 1);
                const nextPage = Math.min(totalPages - 1, currentPage + 1);
                navRow.push({ text: '⬅️', callback_data: `wallet_dexp|${navToken}|${prevPage}` });
                navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: `wallet_dexp|${navToken}|${currentPage}` });
                navRow.push({ text: '➡️', callback_data: `wallet_dexp|${navToken}|${nextPage}` });
            }
            const portfolioRows = entries
                .map((entry) => ({ address: entry.address, url: buildPortfolioEmbedUrl(entry.address) }))
                .filter((row) => row.address && row.url)
                .map((row) => [{ text: t(callbackLang, 'wallet_action_portfolio', { wallet: shortenAddress(row.address) }), url: row.url }]);
            const backTarget = targetWallet || normalizedWallet;
            const backCallback = backTarget ? `wallet_chain_menu|${encodeURIComponent(backTarget)}` : 'wallet_overview';
            const combinedRows = [];
            if (navRow.length) {
                combinedRows.push(navRow);
            }
            if (tokenButtonRows.length > 0) {
                combinedRows.push(...tokenButtonRows);
            }
            if (portfolioRows.length > 0) {
                combinedRows.push(...portfolioRows);
            }
            const replyMarkup = appendCloseButton(
                combinedRows.length ? { inline_keyboard: combinedRows } : null,
                callbackLang,
                { backCallbackData: backCallback }
            );

            let rendered = false;
            if (query.message?.message_id) {
                try {
                    await bot.editMessageText(text, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup
                    });
                    rendered = true;
                } catch (editError) {
                    log.child('WalletChains').warn(`editMessageText failed, retrying with sendMessage: ${editError.message}`);
                }
            }

            if (!rendered) {
                await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
            }

            try {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
            } catch (ackError) {
                log.child('WalletChains').warn(`Callback ack failed: ${ackError.message}`);
            }
        } catch (error) {
            log.child('WalletChains').error(`Failed to render holdings for chain ${chainId}: ${error.message}`);
            const fallback = t(callbackLang, 'wallet_overview_wallet_no_token');
            const backTarget = targetWallet || null;
            const backCallback = backTarget ? `wallet_chain_menu|${encodeURIComponent(backTarget)}` : 'wallet_overview';
            try {
                await bot.sendMessage(chatId, fallback, { parse_mode: 'HTML', reply_markup: appendCloseButton(null, callbackLang, { backCallbackData: backCallback }) });
            } catch (sendError) {
                log.child('WalletChains').warn(`Fallback send failed: ${sendError.message}`);
            }
            try {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_chain_error'), show_alert: true });
            } catch (ackError) {
                log.child('WalletChains').warn(`Callback ack error after failure: ${ackError.message}`);
            }
        }
        return;
    }

    if (query.data.startsWith('wallet_token_action|')) {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }

        const parts = query.data.split('|');
        const tokenId = parts[1];
        const actionKey = parts[2];
        const context = resolveWalletTokenContext(tokenId, { extend: true });
        if (!context || !actionKey) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_token_action_error'), show_alert: true });
            return;
        }

        try {
            const actionResult = await buildWalletTokenActionResult(actionKey, context, callbackLang);
            const menu = buildWalletTokenMenu(context, callbackLang, { actionResult });
            const shouldSendNew = (menu.extraTexts && menu.extraTexts.length > 0) || (menu.text && menu.text.length > 1200);
            const sendOptions = buildThreadedOptions(query.message, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
            let rendered = false;

            if (!shouldSendNew && query.message?.message_id) {
                try {
                    await bot.editMessageText(menu.text, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup
                    });
                    rendered = true;
                } catch (editError) {
                    if (!isTelegramMessageNotModifiedError(editError)) {
                        throw editError;
                    }
                    rendered = true;
                }
            }

            if (!rendered) {
                const sent = await bot.sendMessage(chatId, menu.text, sendOptions);
                rendered = true;
                if (query.message?.message_id) {
                    bot.deleteMessage(chatId, query.message.message_id).catch(() => { });
                }
            }

            await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts, {
                source: query.message,
                replyMarkup: menu.replyMarkup
            });
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
        } catch (error) {
            log.child('WalletToken').error(`Failed to run ${actionKey}: ${error.message}`);
            const alertText = error.message === 'wallet_token_missing_contract'
                ? t(callbackLang, 'wallet_token_action_no_contract')
                : t(callbackLang, 'wallet_token_action_error');
            await bot.answerCallbackQuery(queryId, { text: alertText, show_alert: true });
        }
        return;
    }

    if (query.data.startsWith('wallet_token_view|')) {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }

        const tokenId = query.data.split('|')[1];
        const context = resolveWalletTokenContext(tokenId, { extend: true });
        if (!context) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_token_action_error'), show_alert: true });
            return;
        }

        const menu = buildWalletTokenMenu(context, callbackLang);
        const sendOptions = buildThreadedOptions(query.message, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });

        let rendered = false;
        if (query.message?.message_id) {
            try {
                await bot.editMessageText(menu.text, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup
                });
                rendered = true;
            } catch (editError) {
                // fall through to send new
            }
        }

        if (!rendered) {
            const sent = await bot.sendMessage(chatId, menu.text, sendOptions);
            rendered = true;
            if (query.message?.message_id) {
                bot.deleteMessage(chatId, query.message.message_id).catch(() => { });
            }
        }

        await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts, {
            source: query.message,
            replyMarkup: menu.replyMarkup
        });
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
        return;
    }

    if (query.data === 'wallet_manage') {
        if (!chatId) {
            await bot.answerCallbackQuery(queryId);
            return;
        }
        const menu = await buildWalletManagerMenu(callbackLang, chatId);
        const options = {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
            reply_markup: menu.replyMarkup || appendCloseButton(null, callbackLang, { backCallbackData: 'wallet_overview' })
        };

        try {
            if (options.message_id) {
                await bot.editMessageText(menu.text, options);
            } else {
                await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
            }
        } catch (error) {
            await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
        }
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_manage_opened') });
        return;
    }

    if (query.data?.startsWith('walletmgr|')) {
        const action = query.data.split('|')[1] || 'open';
        if (action === 'add') {
            try {
                await startRegisterWizard(query.from?.id?.toString(), callbackLang);
                await bot.answerCallbackQuery(queryId);
            } catch (error) {
                log.child('WalletMgr').warn(`Cannot start register wizard: ${error.message}`);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_dm_blocked'), show_alert: true });
            }
            return;
        }

        const menu = await buildWalletManagerMenu(callbackLang, chatId);
        const options = {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
            reply_markup: menu.replyMarkup || appendCloseButton(null, callbackLang, { backCallbackData: 'wallet_overview' })
        };
        try {
            if (options.message_id) {
                await bot.editMessageText(menu.text, options);
            } else {
                await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
            }
        } catch (error) {
            await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
        }
        await bot.answerCallbackQuery(queryId);
        return;
    }

    if (query.data.startsWith('wallet_remove|')) {
        if (!chatId || !query.message?.message_id) {
            await bot.answerCallbackQuery(queryId);
            return;
        }

        const [, scope, walletEncoded, tokenKeyEncoded] = query.data.split('|');
        const wallet = walletEncoded ? decodeURIComponent(walletEncoded) : null;
        const tokenKey = tokenKeyEncoded ? decodeURIComponent(tokenKeyEncoded) : null;
        let feedback = null;
        if (scope === 'all') {
            const existingWallets = await db.getWalletsForUser(chatId);
            await db.removeAllWalletsFromUser(chatId);
            for (const w of existingWallets) {
                const addr = normalizeAddressSafe(w?.address || w) || w?.address || w;
                if (addr) {
                    teardownWalletWatcher(addr);
                }
            }
            feedback = t(callbackLang, 'unregister_all_success');
        } else if (scope === 'wallet' && wallet) {
            await db.removeWalletFromUser(chatId, wallet);
            teardownWalletWatcher(wallet);
            feedback = t(callbackLang, 'unregister_wallet_removed', { wallet: shortenAddress(wallet) });
        } else if (scope === 'token' && wallet && tokenKey) {
            await db.removeWalletTokenRecord(chatId, wallet, tokenKey);
            feedback = t(callbackLang, 'unregister_token_removed', {
                wallet: shortenAddress(wallet),
                token: tokenKey.toUpperCase()
            });
        }

        const menu = await buildWalletManagerMenu(callbackLang, chatId);
        try {
            await bot.editMessageText(menu.text, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: menu.replyMarkup || undefined
            });
        } catch (error) {
            // ignore edit errors
        }

        await bot.answerCallbackQuery(queryId, { text: feedback || t(callbackLang, 'unregister_action_done') });
        return;
    }
}

module.exports = handleWalletCallback;
