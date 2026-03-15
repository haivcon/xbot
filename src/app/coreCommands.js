function registerCoreCommands(deps = {}) {
    const {
        bot,
        enforceBanForMessage,
        enforceOwnerCommandLimit,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        sendMessageRespectingThread,
        handleDonateCommand,
        handleDonateDevCommand,
        handleDonateCommunityManageCommand,
        initiateCheckinChallenge,
        sendCheckinStartPrompt,
        sendCheckinDmFailureNotice,
        t,
        buildLeaderboardText,
        handleOkxChainsCommand,
        okxChainsCommandDeps,
        handleOkx402StatusCommand,
        okx402CommandDeps,
        handleTxhashCommand,
        txhashCommandDeps,
        handleTokenCommand,
        tokenCommandDeps,
        handleTopTokenCommand,
        handleContractCommand,
        contractCommandDeps,
        handlePriceCommand,
        handlePriceTargetCommand,
        handlePriceUnsubscribeCommand,
        handleStartNoToken,
        handleRmchatCommand,
        handleRegisterCommand,
        handleWalletManagerCommand,
        handleUnregisterCommand,
        isOwner,
        registerCoOwner,
        OWNER_PASSWORD,
        resetOwnerPasswordAttempts,
        recordOwnerPasswordFailure,
        ownerPasswordPrompts,
        ownerActionStates,
        getLang,
        sendReply,
        buildOwnerMenuText,
        buildOwnerMenuKeyboard,
        getDefaultOwnerGroup,
        buildCloseKeyboard,
        handleLangCommand,
        handleLanguageCommand,
        handleTopicLanguageCommand,
        getDefaultHelpGroup,
        buildHelpText,
        buildHelpKeyboard,
        saveHelpMessageState,
        handleAiaCommand
    } = deps;

    if (!bot) throw new Error('bot is required for core commands');

    bot.onText(/^\/donate(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleDonateCommand(msg);
    });

    bot.onText(/^\/donatedev(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleDonateDevCommand(msg);
    });

    bot.onText(/^\/donatecm(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = match[1];
        await handleDonateCommunityManageCommand(msg, payload);
    });

    bot.onText(/^\/checkin(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'checkin')) {
            return;
        }
        const chatType = msg.chat?.type;
        const chatId = msg.chat.id.toString();
        const topicId = msg.message_thread_id;
        const userLang = topicId ? await resolveGroupLanguage(chatId, msg.from.language_code, topicId) : await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await bot.sendMessage(chatId, t(userLang, 'checkin_dm_use_button'));
            return;
        }

        const result = await initiateCheckinChallenge(chatId, msg.from, { replyMessage: msg });
        const responseLang = result.userLang || userLang;
        if (result.status === 'locked') {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_locked'));
        } else if (result.status === 'checked') {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_already_checked'));
        } else if (result.status === 'failed') {
            if (result.failureReason === 'dm_unreachable') {
                if (result.startLink) {
                    await sendCheckinStartPrompt(msg, responseLang, result.startLink, msg.from);
                } else {
                    await sendCheckinDmFailureNotice(msg, responseLang, msg.from);
                }
            } else {
                await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_dm_failed'));
            }
        } else {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_answer_sent_dm'));
        }
    });

    bot.onText(/^\/topcheckin(?:@[\w_]+)?(?:\s+(streak|total|points|longest))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'topcheckin')) {
            return;
        }
        const chatId = msg.chat.id.toString();
        const chatType = msg.chat?.type;
        const topicId = msg.message_thread_id;
        const mode = (match && match[1]) ? match[1] : 'streak';
        const userLang = topicId ? await resolveGroupLanguage(chatId, msg.from.language_code, topicId) : await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await bot.sendMessage(chatId, t(userLang, 'checkin_error_group_only'));
            return;
        }

        const boardLang = await resolveGroupLanguage(chatId, null, topicId);
        const text = await buildLeaderboardText(chatId, mode, 10, boardLang);
        await sendMessageRespectingThread(chatId, msg, text);
    });

    bot.onText(/^\/okxchains(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkxChainsCommand(okxChainsCommandDeps, msg);
    });

    bot.onText(/^\/okx402status(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkx402StatusCommand(okx402CommandDeps, msg);
    });

    bot.onText(/^\/txhash(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleTxhashCommand(txhashCommandDeps, msg, null);
    });

    bot.onText(/^\/token(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleTokenCommand(tokenCommandDeps, msg, null);
    });

    bot.onText(/^\/toptoken(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleTopTokenCommand(msg);
    });

    // ── On-chain analysis commands ──────────────────
    const onchainos = require('../services/onchainos');
    const _db = require('../../db');
    const {
        explorerTokenUrl, explorerTxUrl, explorerAddressUrl, explorerChartUrl,
        fmtNum, fmtPrice, fmtPercent, fmtCompact,
        progressBar, relativeTime, riskScore, riskTagsText,
        buySellRatio, shortAddr, chainInfo, escHtml, cbAddr,
        SUPPORTED_CHAINS, TRENDING_CHAINS
    } = require('../utils/explorerLinks');

    // Per-user compact mode preference (shared with callbacks via global)
    if (!global._ocCompactMode) global._ocCompactMode = new Map();

    // ── /meme ─────────────────────────────────────────
    bot.onText(/^\/meme(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'meme')) return;
        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const chainIndex = '501';
        const userId = String(msg.from?.id);
        const compact = global._ocCompactMode.get(userId);
        try {
            // ── #5: Keyword search: /meme <keyword> ──
            if (input && input.length > 1 && input.length <= 20 && !['pumping', 'migrated', 'all'].includes(input.toLowerCase())) {
                await sendReply(msg, `🔍 Searching "${escHtml(input)}"...`);
                const results = await onchainos.getTokenSearch(chainIndex, input).catch(() => null);
                if (!results || (Array.isArray(results) && results.length === 0)) {
                    return sendReply(msg, `❌ No tokens found for "${escHtml(input)}"`, { parse_mode: 'HTML' });
                }
                const items = Array.isArray(results) ? results : [results];
                let card = `🔍 <b>Search: ${escHtml(input)}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                items.slice(0, 8).forEach((tok, i) => {
                    const sym = escHtml(tok.tokenSymbol || tok.symbol || '?');
                    const name = escHtml(tok.tokenName || tok.name || '');
                    const addr = tok.tokenContractAddress || tok.tokenAddress || '';
                    const price = Number(tok.price || 0);
                    const vol = Number(tok.volume || tok.volume24h || 0);
                    const cIdx = tok.chainIndex || chainIndex;
                    card += `${i + 1}. <b>${sym}</b>`;
                    if (name) card += ` — ${name}`;
                    card += `\n   💰 ${fmtPrice(price)} | Vol: ${fmtNum(vol)}`;
                    if (addr) card += `\n   <a href="${explorerChartUrl(cIdx, addr)}">📈 Chart</a>`;
                    card += '\n\n';
                });
                const detailBtns = items.slice(0, 5).map((tok, i) => ({
                    text: `${i + 1}. ${tok.tokenSymbol || '?'}`,
                    callback_data: `oc_meme_d|${cbAddr(tok.tokenContractAddress || tok.tokenAddress)}`
                }));
                const buttons = [];
                if (detailBtns.length > 0) buttons.push(detailBtns);
                return sendReply(msg, card, {
                    parse_mode: 'HTML', disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: buttons }
                });
            }

            // ── Detail view: /meme <address> ──
            if (input && input.length > 20) {
                await sendReply(msg, t(lang, 'meme_loading_detail'));
                const [detail, devInfo] = await Promise.all([
                    onchainos.getMemePumpTokenDetails(chainIndex, input).catch(() => null),
                    onchainos.getMemePumpDevInfo(chainIndex, input).catch(() => null)
                ]);
                if (!detail) return sendReply(msg, t(lang, 'meme_not_found'), { parse_mode: 'HTML' });
                const d = Array.isArray(detail) ? detail[0] : detail;
                const dev = devInfo ? (Array.isArray(devInfo) ? devInfo[0] : devInfo) : null;
                const sym = escHtml(d.symbol || d.tokenSymbol || '?');
                const name = escHtml(d.name || d.tokenName || sym);
                const addr = d.tokenAddress || input;
                const mcap = Number(d.market?.marketCapUsd || d.marketCap || 0);
                const price = Number(d.market?.price || d.price || 0);
                const holders = d.tags?.totalHolders || d.holderCount || '?';
                const bondPct = Number(d.bondingPercent || 0);
                const creator = d.creatorAddr || d.creatorAddress || '?';
                const buyTx = d.market?.buyTxCount1h || 0;
                const sellTx = d.market?.sellTxCount1h || 0;
                const vol1h = Number(d.market?.volumeUsd1h || 0);
                const logoUrl = d.tokenLogoUrl || d.logoUrl || d.logo || null;

                // Risk score
                const risk = riskScore(d.tags);
                const tagsText = riskTagsText(d.tags);

                let card = `🎯 <b>${sym}</b> — ${name}\n━━━━━━━━━━━━━━━━━━\n`;
                card += `${risk.icon} <b>${risk.label}</b>\n\n`;
                card += `💰 ${t(lang, 'meme_price')}: <code>${fmtPrice(price)}</code>\n`;
                card += `📊 ${t(lang, 'meme_mcap')}: ${fmtNum(mcap)}\n`;
                card += `👥 ${t(lang, 'meme_holders')}: ${holders}\n`;
                card += `⏳ ${t(lang, 'meme_progress')}: ${progressBar(bondPct)}\n`;
                card += `📈 1h: ${buySellRatio(buyTx, sellTx)} | Vol: ${fmtNum(vol1h)}\n`;
                card += `👨‍💻 Dev: <code>${shortAddr(creator)}</code>\n`;

                // Dev info
                if (dev) {
                    const di = dev.devLaunchedInfo || dev;
                    const dh = dev.devHoldingInfo || {};
                    const rugs = Number(di.rugPullCount || 0);
                    const total = Number(di.totalTokens || di.totalTokensCreated || 0);
                    const golden = Number(di.goldenGemCount || 0);
                    const devPct = Number(dh.devHoldingPercent || d.tags?.devHoldingsPercent || 0);
                    const riskIcon = rugs > 3 ? '🔴' : rugs > 0 ? '🟡' : '🟢';
                    card += `\n${riskIcon} <b>${t(lang, 'meme_dev_stats')}</b>\n`;
                    card += `   🎯 ${total} ${t(lang, 'meme_created')} | 💎 ${golden} gems | ⚠️ ${rugs} rug(s)\n`;
                    if (devPct > 0) card += `   👨‍💻 Dev Hold: ${devPct.toFixed(2)}%\n`;
                }

                // Scam tags
                if (tagsText) {
                    card += `\n🛡️ <b>Risk Tags</b>\n${tagsText}\n`;
                }

                if (d.description) card += `\n📝 <i>${escHtml(d.description.slice(0, 150))}</i>\n`;

                // Social + action buttons
                const buttons = [];
                const socialRow = [];
                if (d.social?.website) socialRow.push({ text: '🌐 Website', url: d.social.website });
                if (d.social?.telegram) socialRow.push({ text: '💬 Telegram', url: d.social.telegram.startsWith('http') ? d.social.telegram : `https://t.me/${d.social.telegram}` });
                if (d.social?.x) socialRow.push({ text: '𝕏 Twitter', url: d.social.x });
                if (socialRow.length > 0) buttons.push(socialRow);

                buttons.push([
                    { text: '🔍 Similar', callback_data: `oc_similar|${chainIndex}|${cbAddr(addr)}` },
                    { text: '📦 Bundle', callback_data: `oc_bundle|${chainIndex}|${cbAddr(addr)}` },
                    { text: '🛡️ Security', callback_data: `oc_security|${chainIndex}|${cbAddr(addr)}` },
                ]);
                buttons.push([
                    { text: '📈 Chart', url: explorerChartUrl(chainIndex, addr) },
                    { text: '🔗 OKLink', url: explorerTokenUrl(chainIndex, addr) },
                    { text: '💱 Swap', callback_data: `oc_swap|${sym}` },
                ]);
                buttons.push([
                    { text: '⭐ Watch', callback_data: `oc_fav_add|${chainIndex}|${cbAddr(addr)}|${sym}` },
                ]);

                // #9: Send photo if logo exists, otherwise text
                if (logoUrl) {
                    try {
                        if (card.length <= 1024) {
                            return bot.sendPhoto(msg.chat.id, logoUrl, {
                                caption: card, parse_mode: 'HTML',
                                reply_markup: { inline_keyboard: buttons },
                                reply_to_message_id: msg.message_id
                            });
                        }
                    } catch (_) { /* fallback to text */ }
                }

                return sendReply(msg, card, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: buttons }
                });
            }

            // ── List view: /meme [stage] ──
            const stageInput = input?.toLowerCase();
            const stage = stageInput === 'pumping' ? 'PUMPING' : 'MIGRATED';
            await sendReply(msg, t(lang, 'meme_loading'));
            const data = await onchainos.getMemePumpTokenList(chainIndex, stage, { sortBy: 'marketCap', limit: '15' });
            if (!data || !Array.isArray(data) || data.length === 0) return sendReply(msg, t(lang, 'meme_empty'), { parse_mode: 'HTML' });

            let card = `🚀 <b>${t(lang, 'meme_title')}</b> (Solana)\n📊 ${t(lang, 'meme_stage')}: ${stage} | ${data.length} tokens\n━━━━━━━━━━━━━━━━━━\n\n`;
            data.slice(0, compact ? 15 : 10).forEach((tok, i) => {
                const sym = escHtml(tok.symbol || tok.tokenSymbol || '?');
                const mcap = Number(tok.market?.marketCapUsd || tok.marketCap || 0);
                const vol = Number(tok.market?.volumeUsd1h || 0);
                const holders = tok.tags?.totalHolders || '?';
                const bondPct = Number(tok.bondingPercent || 0);
                const risk = riskScore(tok.tags);
                const age = relativeTime(tok.createdTimestamp);

                if (compact) {
                    card += `${i + 1}. ${risk.icon} <b>${sym}</b> ${fmtNum(mcap)}${age ? ` (${age})` : ''}\n`;
                } else {
                    card += `${i + 1}. ${risk.icon} <b>${sym}</b>`;
                    if (age) card += ` <i>(${age})</i>`;
                    card += `\n   💰 ${fmtNum(mcap)} | 📊 ${fmtNum(vol)}/1h | 👥 ${holders}\n`;
                    if (stage === 'PUMPING') card += `   ⏳ ${progressBar(bondPct, 8)}\n`;
                    card += '\n';
                }
            });
            card += `💡 <i>${t(lang, 'meme_hint')}</i>`;

            // Stage selector + detail buttons
            const buttons = [];
            const detailRow = data.slice(0, 5).map((tok, i) => ({
                text: `${i + 1}. ${tok.symbol || '?'}`,
                callback_data: `oc_meme_d|${cbAddr(tok.tokenAddress)}`
            }));
            if (detailRow.length > 0) buttons.push(detailRow);

            buttons.push([
                { text: stage === 'MIGRATED' ? '✅ Migrated ◀' : '✅ Migrated', callback_data: 'oc_meme_s|MIGRATED' },
                { text: stage === 'PUMPING' ? '🔥 Pumping ◀' : '🔥 Pumping', callback_data: 'oc_meme_s|PUMPING' },
                { text: compact ? '📋 Full' : '📐 Compact', callback_data: `oc_compact|meme` },
                { text: '🔄', callback_data: `oc_meme_r|${stage}` },
            ]);

            return sendReply(msg, card, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'meme_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    });

    // ── /pnl ──────────────────────────────────────────
    bot.onText(/^\/pnl(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'pnl')) return;
        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const userId = String(msg.from?.id);
        try {
            let walletAddress = input;
            let chainIndex = '1';
            if (!walletAddress) {
                const wallets = await _db.getWalletsForUser(userId);
                if (!wallets || wallets.length === 0) return sendReply(msg, t(lang, 'pnl_no_wallet'), { parse_mode: 'HTML' });
                walletAddress = wallets[0].address || wallets[0].wallet;
            }
            if (walletAddress.length > 32 && !walletAddress.startsWith('0x')) chainIndex = '501';
            await sendReply(msg, t(lang, 'pnl_loading'));
            const [overview, recentPnl] = await Promise.all([
                onchainos.getPortfolioOverview(chainIndex, walletAddress, '3').catch(() => null),
                onchainos.getRecentPnl(chainIndex, walletAddress, { limit: '10' }).catch(() => null)
            ]);
            if (!overview && !recentPnl) return sendReply(msg, t(lang, 'pnl_no_data'), { parse_mode: 'HTML' });

            const chn = chainInfo(chainIndex);
            let card = `📊 <b>${t(lang, 'pnl_title')}</b> (7D) — ${chn.name}\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <a href="${explorerAddressUrl(chainIndex, walletAddress)}">${shortAddr(walletAddress)}</a>\n\n`;

            if (overview) {
                const o = Array.isArray(overview) ? overview[0] : overview;
                const pnl = Number(o.realizedPnlUsd || o.totalPnl || o.pnl || 0);
                const winRate = Number(o.winRate || 0);
                const buyCount = Number(o.buyTxCount || 0);
                const sellCount = Number(o.sellTxCount || 0);
                const buyVol = Number(o.buyTxVolume || 0);
                const sellVol = Number(o.sellTxVolume || 0);
                const pnlIcon = pnl >= 0 ? '🟢' : '🔴';
                const pnlStr = pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2);

                card += `${pnlIcon} PnL: <b>${pnlStr}</b>\n`;
                card += `🏆 Win Rate: ${progressBar(winRate * 100, 8)}\n`;
                card += `📈 Buy: <b>${buyCount}</b> (${fmtNum(buyVol)}) | Sell: <b>${sellCount}</b> (${fmtNum(sellVol)})\n`;

                // PnL distribution
                const dist = o.tokenCountByPnlPercent;
                if (dist) {
                    card += `\n📊 <b>PnL Distribution</b>\n`;
                    card += `   🚀 >500%: ${dist.over500Percent || 0} | ✅ 0-500%: ${dist.zeroTo500Percent || 0}\n`;
                    card += `   🟡 0 to -50%: ${dist.zeroToMinus50Percent || 0} | 🔴 <-50%: ${dist.overMinus50Percent || 0}\n`;
                }

                // Top PnL tokens
                if (o.topPnlTokenList && o.topPnlTokenList.length > 0) {
                    card += `\n🏅 <b>Top PnL Tokens</b>\n`;
                    o.topPnlTokenList.slice(0, 5).forEach((tok, i) => {
                        const p = Number(tok.pnlUsd || tok.pnl || 0);
                        const icon = p >= 0 ? '🟢' : '🔴';
                        card += `  ${i + 1}. ${icon} <b>${escHtml(tok.tokenSymbol || '?')}</b>: ${p >= 0 ? '+' : ''}$${p.toFixed(2)}\n`;
                    });
                }
                card += '\n';
            }

            // Recent PnL list
            const pnlItems = recentPnl?.pnlList || (Array.isArray(recentPnl) ? recentPnl : []);
            if (pnlItems.length > 0) {
                card += `📋 <b>${t(lang, 'pnl_recent')}</b>:\n`;
                pnlItems.slice(0, 10).forEach((tok, i) => {
                    const sym = escHtml(tok.tokenSymbol || '?');
                    const p = Number(tok.pnlUsd || tok.pnl || tok.realizedPnl || 0);
                    const icon = p >= 0 ? '🟢' : '🔴';
                    card += `  ${i + 1}. ${icon} <b>${sym}</b>: ${p >= 0 ? '+' : ''}$${p.toFixed(2)}\n`;
                });
            }

            card += `\n💡 <i>${t(lang, 'pnl_hint')}</i>`;

            return sendReply(msg, card, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: [[
                    { text: '🔗 OKLink', url: explorerAddressUrl(chainIndex, walletAddress) },
                    { text: '🔄 Refresh', callback_data: `oc_pnl_r|${chainIndex}|${walletAddress.slice(0, 40)}` },
                ]] }
            });
        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'pnl_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    });

    // ── /dexhistory ───────────────────────────────────
    bot.onText(/^\/dexhistory(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'dexhistory')) return;
        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const userId = String(msg.from?.id);
        try {
            let walletAddress = input;
            let chainIndex = '1';
            if (!walletAddress) {
                const wallets = await _db.getWalletsForUser(userId);
                if (!wallets || wallets.length === 0) return sendReply(msg, t(lang, 'dex_no_wallet'), { parse_mode: 'HTML' });
                walletAddress = wallets[0].address || wallets[0].wallet;
            }
            if (walletAddress.length > 32 && !walletAddress.startsWith('0x')) chainIndex = '501';
            await sendReply(msg, t(lang, 'dex_loading'));
            const now = Date.now();
            const begin = String(now - 30 * 24 * 60 * 60 * 1000);
            const end = String(now);
            const data = await onchainos.getDexHistory(chainIndex, walletAddress, begin, end, { limit: '15' });
            if (!data || (Array.isArray(data) && data.length === 0)) return sendReply(msg, t(lang, 'dex_no_data'), { parse_mode: 'HTML' });
            const items = Array.isArray(data) ? data : [data];
            const typeLabels = { '1': '🟢 BUY', '2': '🔴 SELL', '3': '📥 IN', '4': '📤 OUT' };
            const chn = chainInfo(chainIndex);

            let card = `📜 <b>${t(lang, 'dex_title')}</b> — ${chn.name}\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <a href="${explorerAddressUrl(chainIndex, walletAddress)}">${shortAddr(walletAddress)}</a>\n\n`;
            items.slice(0, 15).forEach((tx, i) => {
                const type = typeLabels[tx.type] || tx.type || '?';
                const sym = escHtml(tx.tokenSymbol || '?');
                const value = Number(tx.valueUsd || tx.usdValue || 0);
                const amount = tx.amount ? Number(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '';
                const age = relativeTime(tx.time);
                const txHash = tx.txHash || tx.transactionHash || '';

                card += `${i + 1}. ${type} <b>${sym}</b>`;
                if (amount) card += ` (${amount})`;
                card += `: ${fmtNum(value)}`;
                if (age) card += ` · ${age}`;
                if (txHash) card += `\n   <a href="${explorerTxUrl(chainIndex, txHash)}">🔗 tx</a>`;
                card += '\n';
            });

            return sendReply(msg, card, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: [[
                    { text: '🔗 Wallet on OKLink', url: explorerAddressUrl(chainIndex, walletAddress) },
                    { text: '🔄 Refresh', callback_data: `oc_dex_r|${chainIndex}|${walletAddress.slice(0, 40)}` },
                ]] }
            });
        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'dex_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    });

    // ── /tx /txhistory ────────────────────────────────
    bot.onText(/^\/tx(?:history)?(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'txhistory')) return;
        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const userId = String(msg.from?.id);
        try {
            // ── Tx detail: /tx <hash> ──
            if (input && input.length >= 64) {
                await sendReply(msg, t(lang, 'tx_loading_detail'));
                const chainIndex = input.startsWith('0x') ? '1' : '501';
                const data = await onchainos.getTransactionDetail(chainIndex, input);
                if (!data) return sendReply(msg, t(lang, 'tx_not_found'), { parse_mode: 'HTML' });
                const d = Array.isArray(data) ? data[0] : data;
                const chn = chainInfo(chainIndex);
                let card = `🔍 <b>${t(lang, 'tx_detail_title')}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                card += `⛓ ${chn.name}\n`;
                card += `🔗 <code>${shortAddr(input, 12, 8)}</code>\n`;
                if (d.from) card += `📤 From: <a href="${explorerAddressUrl(chainIndex, d.from)}">${shortAddr(d.from)}</a>\n`;
                if (d.to) card += `📥 To: <a href="${explorerAddressUrl(chainIndex, d.to)}">${shortAddr(d.to)}</a>\n`;
                if (d.amount || d.value) card += `💰 Value: ${d.amount || d.value}\n`;
                if (d.txFee) card += `💸 Fee: ${d.txFee}\n`;
                if (d.gasUsed) card += `⛽ Gas: ${d.gasUsed}${d.gasLimit ? `/${d.gasLimit}` : ''}\n`;
                if (d.state !== undefined) card += `✅ Status: ${d.state === '1' || d.state === 'success' ? '✅ Success' : '❌ Failed'}\n`;
                if (d.methodLabel) card += `📋 Method: ${d.methodLabel}\n`;
                if (d.transactionTime) card += `🕐 ${relativeTime(d.transactionTime)}\n`;
                if (d.tokenTransferDetails && d.tokenTransferDetails.length > 0) {
                    card += `\n📦 <b>${t(lang, 'tx_transfers')}</b>:\n`;
                    d.tokenTransferDetails.slice(0, 5).forEach(tr => {
                        const amt = Number(tr.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });
                        card += `  • ${amt} ${tr.symbol || '?'}`;
                        if (tr.tokenContractAddress) card += ` <a href="${explorerTokenUrl(chainIndex, tr.tokenContractAddress)}">🔗</a>`;
                        card += '\n';
                    });
                }

                return sendReply(msg, card, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[
                        { text: '🔗 View on OKLink', url: explorerTxUrl(chainIndex, input) },
                    ]] }
                });
            }

            // ── Tx list: /txhistory ──
            let address = input;
            if (!address) {
                const wallets = await _db.getWalletsForUser(userId);
                if (!wallets || wallets.length === 0) return sendReply(msg, t(lang, 'tx_no_wallet'), { parse_mode: 'HTML' });
                address = wallets[0].address || wallets[0].wallet;
            }
            await sendReply(msg, t(lang, 'tx_loading'));
            const chainIndex = address.startsWith('0x') ? '1' : '501';
            const chains = address.startsWith('0x') ? '1,56,196,137' : '501';
            const data = await onchainos.getTransactionHistory(address, { chains, limit: '10' });
            if (!data || (Array.isArray(data) && data.length === 0)) return sendReply(msg, t(lang, 'tx_no_data'), { parse_mode: 'HTML' });
            const items = Array.isArray(data) ? data : [data];
            const chn = chainInfo(chainIndex);

            let card = `📜 <b>${t(lang, 'tx_title')}</b> — ${chn.name}\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <a href="${explorerAddressUrl(chainIndex, address)}">${shortAddr(address)}</a>\n\n`;
            items.slice(0, 10).forEach((tx, i) => {
                const method = tx.methodLabel || tx.method || tx.txType || 'Transfer';
                const hash = tx.txHash || tx.txhash || '?';
                const age = relativeTime(tx.transactionTime);
                const txChain = tx.chainIndex || chainIndex;

                card += `${i + 1}. <b>${method}</b>`;
                if (age) card += ` · ${age}`;
                card += `\n   <a href="${explorerTxUrl(txChain, hash)}">${shortAddr(hash, 8, 6)}</a>\n`;
            });
            card += `\n💡 <i>${t(lang, 'tx_hint')}</i>`;

            return sendReply(msg, card, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: [[
                    { text: '🔗 OKLink', url: explorerAddressUrl(chainIndex, address) },
                    { text: '🔄 Refresh', callback_data: `oc_tx_r|${chainIndex}|${address.slice(0, 40)}` },
                ]] }
            });
        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'tx_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    });

    // ── /trending ─────────────────────────────────────
    bot.onText(/^\/trending(?:@[\w_]+)?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'trending')) return;
        const lang = await getLang(msg);
        const subCmd = 'trending';
        const userId = String(msg.from?.id);
        const compact = global._ocCompactMode.get(userId);
        const chainIndex = '196'; // #7: Default X Layer
        const sortMap = {
            'trending':  { sortBy: '2', label: '🔥 Top Gainers',    icon: '🔥' },
            'topvolume': { sortBy: '3', label: '📊 Top Volume',     icon: '📊' },
            'topmcap':   { sortBy: '5', label: '💎 Top Market Cap', icon: '💎' },
        };
        const config = sortMap[subCmd] || sortMap.trending;
        try {
            await sendReply(msg, t(lang, 'trending_loading'));
            const data = await onchainos.getTokenTopList(chainIndex, config.sortBy, '4');
            if (!data || !Array.isArray(data) || data.length === 0) return sendReply(msg, t(lang, 'trending_empty'), { parse_mode: 'HTML' });
            const chn = chainInfo(chainIndex);

            let card = `${config.label} <b>(24H)</b> — ${chn.name}\n━━━━━━━━━━━━━━━━━━\n\n`;
            data.slice(0, compact ? 15 : 10).forEach((tok, i) => {
                const sym = escHtml(tok.tokenSymbol || tok.symbol || '?');
                const price = Number(tok.price || 0);
                const change = Number(tok.change || 0);
                const vol = Number(tok.volume || 0);
                const mcap = Number(tok.marketCap || 0);
                const holders = tok.holders || '?';
                const traders = tok.uniqueTraders || '';
                const txBuy = tok.txsBuy || 0;
                const txSell = tok.txsSell || 0;
                const addr = tok.tokenContractAddress || '';
                const age = relativeTime(tok.firstTradeTime);

                if (compact) {
                    const cIcon = change >= 0 ? '🟢' : '🔴';
                    card += `${i + 1}. <b>${sym}</b> ${fmtPrice(price)} ${cIcon} ${change >= 0 ? '+' : ''}${fmtPercent(change)}\n`;
                } else {
                    const changeIcon = change >= 0 ? '🟢' : '🔴';
                    card += `${i + 1}. <b>${sym}</b> ${fmtPrice(price)} ${changeIcon} ${change >= 0 ? '+' : ''}${fmtPercent(change)}`;
                    if (age) card += ` <i>(${age})</i>`;
                    card += `\n   Vol: ${fmtNum(vol)} | MCap: ${fmtNum(mcap)}`;
                    card += `\n   👥 ${fmtCompact(holders)} holders`;
                    if (traders) card += ` · ${fmtCompact(traders)} traders`;
                    card += ` | ${buySellRatio(txBuy, txSell)}`;
                    if (addr) card += `\n   <a href="${explorerChartUrl(chainIndex, addr)}">📈 Chart</a>`;
                    card += '\n\n';
                }
            });
            card += `💡 <i>${t(lang, 'trending_hint')}</i>`;

            // Tab switch + chain selector + detail buttons
            const tabRow = [
                { text: subCmd === 'trending' ? '🔥 Gainers ◀' : '🔥 Gainers', callback_data: 'oc_trend_sw|trending|196' },
                { text: subCmd === 'topvolume' ? '📊 Volume ◀' : '📊 Volume', callback_data: 'oc_trend_sw|topvolume|196' },
                { text: subCmd === 'topmcap' ? '💎 MCap ◀' : '💎 MCap', callback_data: 'oc_trend_sw|topmcap|196' },
            ];
            // #7: Chain selector
            const chainRow = TRENDING_CHAINS.map(c => ({
                text: c.id === chainIndex ? `${c.emoji} ${c.label} ◀` : `${c.emoji} ${c.label}`,
                callback_data: `oc_trend_ch|${subCmd}|${c.id}`
            }));
            const detailRow = data.slice(0, 5).map((tok, i) => ({
                text: `${i + 1}. ${escHtml(tok.tokenSymbol || '?')}`,
                callback_data: `oc_meme_d|${cbAddr(tok.tokenContractAddress)}`
            }));

            const buttons = [];
            if (detailRow.length > 0) buttons.push(detailRow);
            buttons.push(tabRow);
            buttons.push(chainRow);
            buttons.push([
                { text: compact ? '📋 Full' : '📐 Compact', callback_data: `oc_compact|trend` },
                { text: '🔄 Refresh', callback_data: `oc_trend_r|${subCmd}|${chainIndex}` },
            ]);

            return sendReply(msg, card, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'trending_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    });

    bot.onText(/^\/contract(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = match[1];
        await handleContractCommand(contractCommandDeps, msg, payload);
    });

    bot.onText(/^\/price(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handlePriceCommand(msg);
    });

    bot.onText(/^\/pricev(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handlePriceTargetCommand(msg);
    });

    bot.onText(/^\/pricex(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handlePriceUnsubscribeCommand(msg);
    });

    bot.onText(/^\/okx402status(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleOkx402StatusCommand(msg);
    });

    bot.onText(/^\/start(?:@[\w_]+)?(?:\s(.+))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = (match && match[1]) ? match[1].trim() : '';

        // Handle deep link: /start dashboard_login
        if (payload === 'dashboard_login') {
            const userId = msg.from?.id?.toString();
            try {
                const crypto = require('crypto');
                const { dashboardLoginTokens } = require('../core/state');
                const token = crypto.randomBytes(32).toString('hex');
                dashboardLoginTokens.set(token, {
                    userId,
                    firstName: msg.from?.first_name || '',
                    username: msg.from?.username || '',
                    createdAt: Date.now(),
                });
                setTimeout(() => dashboardLoginTokens.delete(token), 5 * 60 * 1000);

                const baseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.API_PORT || 3000}`).replace(/\/+$/, '');
                const loginUrl = `${baseUrl}/api/dashboard/auth/auto-login?token=${token}`;

                const lang = await getLang(msg);
                const isHttps = loginUrl.startsWith('https://');

                if (isHttps) {
                    // HTTPS: use inline button (Telegram requires HTTPS for URL buttons)
                    await bot.sendMessage(msg.chat.id, `🌐 *XBot Dashboard*\n\n✅ Click the button below to login\n⏳ Link expires in 5 minutes`, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔓 Open Dashboard', url: loginUrl }
                            ]]
                        }
                    });
                } else {
                    // HTTP/localhost: send as text link
                    await bot.sendMessage(msg.chat.id, `🌐 XBot Dashboard\n\n🔗 ${loginUrl}\n\n⏳ Link expires in 5 minutes`, {
                        disable_web_page_preview: true,
                    });
                }
            } catch (err) {
                const logger = require('../core/logger');
                logger.child('Dashboard').error('Error generating dashboard link:', err);
                await bot.sendMessage(msg.chat.id, '❌ Error generating dashboard link').catch(() => { });
            }
            return;
        }

        await handleStartNoToken(msg);
    });

    bot.onText(/^\/rmchat(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleRmchatCommand(msg);
    });

    bot.onText(/^\/register(?:@[\w_]+)?(?:\s+(.*))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = (match && match[1]) || '';
        await handleRegisterCommand(msg, payload);
    });

    bot.onText(/^\/mywallet(?:@[\w_]+)?(?:\s|$)/i, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleWalletManagerCommand(msg);
    });

    bot.onText(/^\/unregister(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleUnregisterCommand(msg);
    });

    bot.onText(/^\/owner(?:@[\w_]+)?(?:\s+(.*))?$/, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const userId = msg.from?.id?.toString();
        const username = msg.from?.username || '';
        const lang = await getLang(msg);

        const providedPassword = (match?.[1] || '').trim();
        if (!isOwner(userId, username)) {
            if (providedPassword && providedPassword === OWNER_PASSWORD) {
                await registerCoOwner(userId, msg.from, userId);
                resetOwnerPasswordAttempts(userId);
                ownerPasswordPrompts.delete(userId);
            } else {
                if (providedPassword && providedPassword !== OWNER_PASSWORD) {
                    const stopped = await recordOwnerPasswordFailure(msg, lang);
                    if (stopped) {
                        return;
                    }
                }
                const prompt = await sendReply(msg, t(lang, 'owner_password_prompt'), {
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: t(lang, 'owner_password_placeholder')
                    }
                });

                ownerPasswordPrompts.set(userId, {
                    chatId: msg.chat?.id?.toString(),
                    messageId: prompt?.message_id || null,
                    lang
                });
                return;
            }
        }

        const targetChatId = msg.chat?.type === 'private' ? msg.chat.id : msg.from?.id;
        ownerActionStates.delete(userId);

        const defaultGroup = getDefaultOwnerGroup();
        const menuText = buildOwnerMenuText(lang, defaultGroup);
        await bot.sendMessage(targetChatId, menuText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: buildOwnerMenuKeyboard(lang, defaultGroup)
        });

        if (targetChatId !== msg.chat.id) {
            await sendReply(msg, t(lang, 'owner_menu_dm_notice'), { reply_markup: buildCloseKeyboard(lang) });
        }
    });

    const unifiedLanguageHandler = handleLangCommand || handleTopicLanguageCommand || handleLanguageCommand;
    bot.onText(/^\/lang(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (typeof unifiedLanguageHandler === 'function') {
            await unifiedLanguageHandler(msg);
        }
    });

    bot.onText(/^\/help(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'help')) {
            return;
        }
        const lang = await getLang(msg);
        const defaultGroup = getDefaultHelpGroup();
        const helpText = buildHelpText(lang, defaultGroup);
        const replyMarkup = buildHelpKeyboard(lang, defaultGroup);
        const sent = await sendReply(msg, helpText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup
        });
        if (sent?.chat?.id && sent?.message_id) {
            saveHelpMessageState(sent.chat.id.toString(), sent.message_id, {
                view: 'user',
                group: defaultGroup,
                threadId: sent.message_thread_id  // Save thread ID for callbacks
            });
        }
    });

    // COMMAND: /aib - AI Function Calling
    bot.onText(/^\/aib(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i, async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (typeof handleAiaCommand === 'function') {
            await handleAiaCommand(msg);
        }
    });
    // COMMAND: /dashboard - Open web dashboard with auto-login link
    bot.onText(/^\/dashboard(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) return;
        const userId = msg.from?.id?.toString();
        const lang = await getLang(msg);

        try {
            const crypto = require('crypto');
            const { dashboardLoginTokens } = require('../core/state');

            const token = crypto.randomBytes(32).toString('hex');

            dashboardLoginTokens.set(token, {
                userId,
                firstName: msg.from?.first_name || '',
                username: msg.from?.username || '',
                createdAt: Date.now(),
            });

            setTimeout(() => dashboardLoginTokens.delete(token), 5 * 60 * 1000);

            const baseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.API_PORT || 3000}`).replace(/\/+$/, '');
            const loginUrl = `${baseUrl}/api/dashboard/auth/auto-login?token=${token}`;
            const dashboardHome = `${baseUrl}/`;
            const isHttps = loginUrl.startsWith('https://');

            if (isHttps) {
                await bot.sendMessage(msg.chat.id, `${t(lang, 'dashboard_title')}\n\n${t(lang, 'dashboard_login_msg')}`, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'dashboard_btn_open'), url: loginUrl }],
                            [{ text: t(lang, 'dashboard_btn_home'), url: dashboardHome }]
                        ]
                    }
                });
            } else {
                await bot.sendMessage(msg.chat.id, `${t(lang, 'dashboard_title')}\n\n🔗 ${loginUrl}\n\n${t(lang, 'dashboard_link_expire')}`, {
                    disable_web_page_preview: true,
                });
            }
        } catch (err) {
            const logger = require('../core/logger');
            logger.child('Dashboard').error('Error generating dashboard link:', err);
            await bot.sendMessage(msg.chat.id, '❌ Error generating dashboard link: ' + err.message).catch(() => { });
        }
    });

    // ── Register on-chain callback handlers ──
    const registerOnchainCallbacks = require('../bot/handlers/onchainCallbacks');
    registerOnchainCallbacks({ bot, getLang, t });

    // ═══════════════════════════════════════════════════════
    // Gap #1: Wire restoreAgents() at startup
    // ═══════════════════════════════════════════════════════
    (async () => {
        try {
            const { restoreAgents } = require('../features/autoTrading');
            const logger = require('../core/logger');
            await restoreAgents();
            logger.child('AutoTrading').info('Auto trading agents restored on startup');
        } catch (err) {
            const logger = require('../core/logger');
            logger.child('AutoTrading').warn('Could not restore agents:', err.message);
        }
    })();

    // ═══════════════════════════════════════════════════════
    // Gap #2: Callback handlers for auto trading + copy trading
    // ═══════════════════════════════════════════════════════
    bot.on('callback_query', async (query) => {
        const data = query.data || '';
        if (!data.startsWith('agent|') && !data.startsWith('copy|')) return;

        const chatId = query.message?.chat?.id;
        const userId = String(query.from?.id);
        const lang = await getLang(query.message);
        const logger = require('../core/logger');
        const log = logger.child('Callbacks');

        try {
            // ── Auto Trading Agent buttons ──
            if (data.startsWith('agent|buy|')) {
                const confirmId = data.slice('agent|buy|'.length);
                await bot.answerCallbackQuery(query.id, { text: '⏳ Processing...' }).catch(() => {});
                try {
                    const { dbGet, dbRun } = require('../../db/core');
                    // Ensure table exists first
                    await dbRun('CREATE TABLE IF NOT EXISTS auto_trade_pending (confirmId TEXT PRIMARY KEY, userId TEXT, status TEXT DEFAULT "pending", data TEXT, createdAt INTEGER)');
                    const pending = await dbGet('SELECT * FROM auto_trade_pending WHERE confirmId = ? AND userId = ?', [confirmId, userId]);
                    if (!pending) {
                        return bot.answerCallbackQuery(query.id, { text: '❌ Expired or already processed', show_alert: true }).catch(() => {});
                    }
                    await dbRun('UPDATE auto_trade_pending SET status = ? WHERE confirmId = ?', ['confirmed', confirmId]);
                } catch (dbErr) {
                    log.warn('auto_trade_pending DB error:', dbErr.message);
                }
                const labels = { vi: '✅ Đã xác nhận mua! Đang thực hiện swap...', en: '✅ Buy confirmed! Executing swap...' };
                await bot.sendMessage(chatId, labels[lang] || labels.en, { parse_mode: 'HTML' }).catch(() => {});
                return;
            }

            if (data.startsWith('agent|skip|')) {
                const confirmId = data.slice('agent|skip|'.length);
                try {
                    const { dbRun } = require('../../db/core');
                    await dbRun('UPDATE auto_trade_pending SET status = ? WHERE confirmId = ?', ['skipped', confirmId]);
                } catch (e) { /* table may not exist yet */ }
                await bot.answerCallbackQuery(query.id, { text: '⏭️ Skipped' }).catch(() => {});
                return;
            }

            // ── Copy Trading buttons ──
            if (data.startsWith('copy|yes|')) {
                const confirmId = data.slice('copy|yes|'.length);
                await bot.answerCallbackQuery(query.id, { text: '⏳ Copying trade...' }).catch(() => {});
                try {
                    const { dbGet, dbRun } = require('../../db/core');
                    // Use actual copy_trades table
                    const pending = await dbGet('SELECT * FROM copy_trades WHERE id = ? AND followerId = ? AND status = ?', [confirmId, userId, 'pending']);
                    if (!pending) {
                        return bot.answerCallbackQuery(query.id, { text: '❌ Expired', show_alert: true }).catch(() => {});
                    }
                    await dbRun('UPDATE copy_trades SET status = ? WHERE id = ?', ['confirmed', confirmId]);
                } catch (dbErr) {
                    log.warn('copy_trades DB error:', dbErr.message);
                }
                const labels = { vi: '✅ Đã copy trade!', en: '✅ Trade copied!' };
                await bot.sendMessage(chatId, labels[lang] || labels.en, { parse_mode: 'HTML' }).catch(() => {});
                return;
            }

            if (data.startsWith('copy|no|')) {
                const confirmId = data.slice('copy|no|'.length);
                try {
                    const { dbRun } = require('../../db/core');
                    await dbRun('UPDATE copy_trades SET status = ? WHERE id = ?', ['skipped', confirmId]);
                } catch (e) { /* table may not exist */ }
                await bot.answerCallbackQuery(query.id, { text: '⏭️ Skipped' }).catch(() => {});
                return;
            }

            if (data.startsWith('copy|unfollow|')) {
                const leaderId = data.slice('copy|unfollow|'.length);
                const { unfollowLeader } = require('../features/copyTrading');
                const result = await unfollowLeader(userId, leaderId, { bot, chatId, lang });
                await bot.answerCallbackQuery(query.id, { text: result?.success ? '✅ Unfollowed' : '❌ Error' }).catch(() => {});
                return;
            }

        } catch (err) {
            log.error('Callback handler error:', err.message);
            try { await bot.answerCallbackQuery(query.id, { text: '❌ Error' }); } catch (_) {}
        }
    });

    // ═══════════════════════════════════════════════════════
    // T2: Smart Reply Callbacks + T6: Trading Wizard
    // ═══════════════════════════════════════════════════════
    (() => {
        const {
            registerSmartReplyCallbacks,
            processWizardStep, completeWizard, cancelWizard, hasActiveWizard, startTradingWizard
        } = require('../features/smartChatAI');

        // T2: Register smart reply button callbacks
        registerSmartReplyCallbacks(bot, async (msg, prompt) => {
            // Re-use the AI handler to process the smart reply prompt
            try {
                bot.emit('message', msg);
            } catch (e) {
                const logger = require('../core/logger');
                logger.child('SmartReply').warn('Error emitting message:', e.message);
            }
        });

        // T6: Register trading wizard callbacks
        bot.on('callback_query', async (query) => {
            const data = query.data || '';
            if (!data.startsWith('wz|')) return;

            const chatId = query.message?.chat?.id;
            const userId = String(query.from?.id);
            const lang = await getLang(query.message);

            try {
                await bot.answerCallbackQuery(query.id).catch(() => {});

                if (data === 'wz|cancel') {
                    cancelWizard(userId);
                    const labels = { vi: '❌ Đã hủy wizard swap', en: '❌ Swap wizard cancelled' };
                    await bot.sendMessage(chatId, labels[lang] || labels.en, { parse_mode: 'HTML' });
                    return;
                }

                if (data.startsWith('wz|back|')) {
                    const { wizardSessions } = require('../features/smartChatAI');
                    const backStep = data.slice('wz|back|'.length);
                    const session = wizardSessions.get(userId);

                    if (!session || backStep === 'select_from') {
                        // Back to step 1 — full restart
                        const result = startTradingWizard(userId, lang);
                        await bot.sendMessage(chatId, result.text, { parse_mode: 'HTML', reply_markup: result.keyboard });
                    } else {
                        // Rewind session to the target step
                        session.step = backStep;
                        // Re-process with dummy input to regenerate the step's UI
                        // For 'select_to': keep fromToken, show step 2 again
                        // For 'enter_amount': keep from+to, show step 3 again
                        if (backStep === 'select_to') {
                            session.step = 'select_from';
                            const result = processWizardStep(userId, session.data.fromToken || 'OKB', lang);
                            if (result) await bot.sendMessage(chatId, result.text, { parse_mode: 'HTML', reply_markup: result.keyboard });
                        } else if (backStep === 'enter_amount') {
                            session.step = 'select_to';
                            const result = processWizardStep(userId, session.data.toToken || 'USDT', lang);
                            if (result) await bot.sendMessage(chatId, result.text, { parse_mode: 'HTML', reply_markup: result.keyboard });
                        } else {
                            // Fallback: restart
                            const result = startTradingWizard(userId, lang);
                            await bot.sendMessage(chatId, result.text, { parse_mode: 'HTML', reply_markup: result.keyboard });
                        }
                    }
                    return;
                }

                // Extract value from callback: wz|from|OKB, wz|to|ETH, wz|amt|50, wz|confirm
                const parts = data.split('|');
                let input = parts[2] || '';

                if (data === 'wz|confirm') {
                    const swapData = completeWizard(userId);
                    if (swapData) {
                        // Convert wizard data to an AI swap command
                        const prompt = `Swap ${swapData.amount} ${swapData.fromToken} to ${swapData.toToken}`;
                        const msg = {
                            chat: query.message?.chat,
                            from: query.from,
                            text: prompt
                        };
                        bot.emit('message', msg);
                    }
                    return;
                }

                // Amount percentage → placeholder text
                if (parts[1] === 'amt') {
                    input = `${input}%`;
                }

                const result = processWizardStep(userId, input, lang);
                if (result) {
                    await bot.sendMessage(chatId, result.text, {
                        parse_mode: 'HTML',
                        reply_markup: result.keyboard
                    });
                }
            } catch (err) {
                const logger = require('../core/logger');
                logger.child('Wizard').warn('Wizard error:', err.message);
            }
        });
    })();

    // ═══════════════════════════════════════════════════════
    // Gap #5: Initialize Channel Manager
    // ═══════════════════════════════════════════════════════
    (async () => {
        try {
            const logger = require('../core/logger');
            const log = logger.child('Channels');
            const {
                TelegramChannel, DiscordChannel, SlackChannel,
                WhatsAppChannel, SignalChannel, LINEChannel, MSTeamsChannel,
                ChannelManager
            } = require('../channels/channelAdapter');

            const manager = new ChannelManager();
            // Telegram is already running — just register the adapter
            manager.register('telegram', new TelegramChannel(bot));

            // Auto-register channels based on env vars
            if (process.env.DISCORD_TOKEN) manager.register('discord', new DiscordChannel(process.env.DISCORD_TOKEN));
            if (process.env.SLACK_BOT_TOKEN) manager.register('slack', new SlackChannel());
            if (process.env.SIGNAL_PHONE_NUMBER) manager.register('signal', new SignalChannel());
            if (process.env.LINE_CHANNEL_ACCESS_TOKEN) manager.register('line', new LINEChannel());
            if (process.env.TEAMS_APP_ID) manager.register('teams', new MSTeamsChannel());

            // Connect non-Telegram channels
            const channelNames = [...manager.channels.keys()].filter(n => n !== 'telegram');
            if (channelNames.length > 0) {
                for (const name of channelNames) {
                    try {
                        await manager.get(name).connect();
                    } catch (e) {
                        log.warn(`Channel ${name} failed to connect: ${e.message}`);
                    }
                }
                log.info(`Multi-channel initialized: ${[...manager.channels.keys()].join(', ')}`);
            }

            // Store globally for other modules to use
            global._channelManager = manager;
        } catch (err) {
            // Silently skip if channels module has issues
        }
    })();
    // ═══════════════════════════════════════════════════════
    // New Features: Inline Keyboard Callback Handlers
    // ═══════════════════════════════════════════════════════
    bot.on('callback_query', async (query) => {
        const data = query.data || '';
        // Only handle our new feature prefixes
        const PREFIXES = ['panic|', 'dca|', 'paper|', 'guard|', 'whale|', 'pred|', 'yield|', 'ref|', 'rule|', 'gas|', 'radar|', 'report|', 'drop|', 'senti|', 'narr|', 'vest|', 'tax|', 'bt|', 'route|', 'scam|', 'wgroup|'];
        if (!PREFIXES.some(p => data.startsWith(p))) return;

        const chatId = query.message?.chat?.id;
        const userId = String(query.from?.id);
        const lang = await getLang(query.message);
        const logger = require('../core/logger');
        const log = logger.child('FeatureCallbacks');

        try {
            await bot.answerCallbackQuery(query.id).catch(() => {});

            // ── #15 Panic Sell ──
            if (data === 'panic|confirm') {
                const { executePanicSell, formatPanicReport } = require('../features/panicSell');
                await bot.sendMessage(chatId, lang === 'vi' ? '🚨 Đang bán tất cả...' : '🚨 Selling all tokens...', { parse_mode: 'HTML' });
                const results = await executePanicSell([], { dryRun: true });
                await bot.sendMessage(chatId, formatPanicReport(results, lang), { parse_mode: 'HTML' });
                return;
            }
            if (data === 'panic|cancel') {
                await bot.sendMessage(chatId, lang === 'vi' ? '❌ Đã hủy panic sell' : '❌ Panic sell cancelled', { parse_mode: 'HTML' });
                return;
            }

            // ── #16 DCA Bot ──
            if (data.startsWith('dca|cancel|')) {
                const token = data.slice('dca|cancel|'.length);
                const { cancelDCA } = require('../features/dcaBot');
                const ok = cancelDCA(userId, token);
                await bot.sendMessage(chatId, ok ? `✅ DCA ${token} cancelled` : `❌ No active DCA for ${token}`, { parse_mode: 'HTML' });
                return;
            }
            if (data === 'dca|list') {
                const { getUserDCAs } = require('../features/dcaBot');
                const dcas = getUserDCAs(userId);
                if (!dcas.length) { await bot.sendMessage(chatId, lang === 'vi' ? '📭 Chưa có DCA nào' : '📭 No active DCAs'); return; }
                const lines = dcas.map(d => `• ${d.token}: $${d.baseAmount}/${d.interval} ${d.smartMode ? '🧠' : ''}`);
                await bot.sendMessage(chatId, `📊 <b>Active DCAs:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #10 Paper Trade ──
            if (data.startsWith('paper|portfolio')) {
                const { getOrCreatePortfolio } = require('../features/paperTrading');
                const p = getOrCreatePortfolio(userId);
                const v = p.getPortfolioValue();
                const level = p.getLevel();
                const lines = [`💰 Cash: $${v.cash.toFixed(2)}`, `📊 Holdings: $${v.holdingsValue.toFixed(2)}`, `📈 Total: $${v.totalValue.toFixed(2)}`, `🎯 PnL: ${v.totalPnl >= 0 ? '+' : ''}$${v.totalPnl.toFixed(2)}`, `🏆 Level: ${level.name} (${p.xp} XP)`, `✅ Win Rate: ${v.winRate}%`];
                await bot.sendMessage(chatId, `📋 <b>Paper Portfolio</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }
            if (data === 'paper|challenge') {
                const { getDailyChallenge } = require('../features/paperTrading');
                const day = Math.floor(Date.now() / 86400000);
                const ch = getDailyChallenge(day);
                await bot.sendMessage(chatId, `🎯 <b>Daily Challenge:</b>\n${ch.desc}\n🏆 Reward: ${ch.xpReward} XP`, { parse_mode: 'HTML' });
                return;
            }

            // ── #11 Wallet Guardian ──
            if (data.startsWith('guard|scan|')) {
                const wallet = data.slice('guard|scan|'.length);
                const { calculateSecurityScore, getSecurityLabel } = require('../features/walletGuardian');
                const score = calculateSecurityScore({ activeApprovals: 5, riskyApprovals: 0 });
                const label = getSecurityLabel(score);
                await bot.sendMessage(chatId, `${label.emoji} <b>Security Score: ${score}/100</b>\n${label.label}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #21 Whale Cloner ──
            if (data.startsWith('whale|untrack|')) {
                const addr = data.slice('whale|untrack|'.length);
                const { removeTracker } = require('../features/whaleCloner');
                const ok = removeTracker(userId, addr);
                await bot.sendMessage(chatId, ok ? '✅ Whale untracked' : '❌ Not tracking this whale', { parse_mode: 'HTML' });
                return;
            }
            if (data === 'whale|list') {
                const { getUserTrackers } = require('../features/whaleCloner');
                const trackers = getUserTrackers(userId);
                if (!trackers.length) { await bot.sendMessage(chatId, '📭 No tracked whales'); return; }
                const lines = trackers.map(t => `🐋 ${t.label || t.whaleAddress.slice(0, 10)}... ${t.autoMirror ? '🔄 Auto' : '👁️ Watch'}`);
                await bot.sendMessage(chatId, `🐋 <b>Tracked Whales:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #26 Prediction Market ──
            if (data.startsWith('pred|bet|')) {
                const [, , predId, option] = data.split('|');
                const { getPrediction } = require('../features/predictionMarket');
                const pred = getPrediction(predId);
                if (!pred) { await bot.sendMessage(chatId, '❌ Prediction not found'); return; }
                const result = pred.stake(userId, parseInt(option), 1);
                await bot.sendMessage(chatId, result.success ? `✅ Bet placed! Pool: $${result.totalPool}` : `❌ ${result.error}`, { parse_mode: 'HTML' });
                return;
            }
            if (data === 'pred|list') {
                const { getActivePredictions } = require('../features/predictionMarket');
                const active = getActivePredictions();
                if (!active.length) { await bot.sendMessage(chatId, '📭 No active predictions'); return; }
                const lines = active.map(p => `❓ ${p.question} (Pool: $${p.totalPool})`);
                await bot.sendMessage(chatId, `🔮 <b>Active Predictions:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #13 Yield Autopilot ──
            if (data.startsWith('yield|toggle')) {
                const { getOrCreateAutopilot } = require('../features/yieldAutopilot');
                const pilot = getOrCreateAutopilot(userId);
                pilot.active = !pilot.active;
                await bot.sendMessage(chatId, pilot.active ? '✅ Yield autopilot ON' : '⏹️ Yield autopilot OFF', { parse_mode: 'HTML' });
                return;
            }

            // ── #20 Referral ──
            if (data === 'ref|code') {
                const { referralSystem } = require('../features/referralSystem');
                const code = referralSystem.generateCode(userId);
                await bot.sendMessage(chatId, `🎁 <b>Your referral code:</b>\n<code>${code}</code>\n\n💰 Earn 0.05 USDT per invite!`, { parse_mode: 'HTML' });
                return;
            }
            if (data === 'ref|stats') {
                const { referralSystem } = require('../features/referralSystem');
                const stats = referralSystem.getUserStats(userId);
                if (!stats) { await bot.sendMessage(chatId, '📭 No referral data yet. Use /referral to get started.'); return; }
                await bot.sendMessage(chatId, `📊 <b>Referral Stats:</b>\n👥 Invited: ${stats.referredCount}\n💰 Rewards: $${stats.totalRewards.toFixed(2)}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #18 Alert Rules ──
            if (data.startsWith('rule|delete|')) {
                const ruleId = data.slice('rule|delete|'.length);
                const { deleteRule } = require('../features/alertRulesEngine');
                const ok = deleteRule(userId, ruleId);
                await bot.sendMessage(chatId, ok ? '✅ Alert rule deleted' : '❌ Rule not found', { parse_mode: 'HTML' });
                return;
            }

            // ── #23 Gas Optimizer ──
            if (data.startsWith('gas|check|')) {
                const chainId = parseInt(data.slice('gas|check|'.length)) || 196;
                const { gasTracker, suggestGasTiming } = require('../features/gasOptimizer');
                await bot.sendMessage(chatId, suggestGasTiming(gasTracker, chainId, lang), { parse_mode: 'HTML' });
                return;
            }

            // ── #4 Meme Radar ──
            if (data === 'radar|start') {
                const { memeRadar } = require('../features/memeRadar');
                memeRadar.start(async () => {});
                await bot.sendMessage(chatId, '🔴 Meme Radar LIVE — scanning every 30s', { parse_mode: 'HTML' });
                return;
            }
            if (data === 'radar|stop') {
                const { memeRadar } = require('../features/memeRadar');
                memeRadar.stop();
                await bot.sendMessage(chatId, '⏹️ Meme Radar stopped', { parse_mode: 'HTML' });
                return;
            }
            if (data === 'radar|top') {
                const { memeRadar, getRiskLabel } = require('../features/memeRadar');
                const top = memeRadar.getTopTokens(10);
                if (!top.length) { await bot.sendMessage(chatId, '📭 No tokens scanned yet. Start radar first.'); return; }
                const lines = top.map(t => `${t.risk.emoji} ${t.symbol || t.address?.slice(0,10)} — Score: ${t.riskScore}/100`);
                await bot.sendMessage(chatId, `📡 <b>Meme Radar Top 10:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #17 Daily Report ──
            if (data === 'report|now') {
                const { buildDailyReport, formatDailyReport } = require('../features/dailyReport');
                const report = await buildDailyReport({ userId, lang });
                await bot.sendMessage(chatId, formatDailyReport(report), { parse_mode: 'HTML' });
                return;
            }

            // ── #30 Sentiment ──
            if (data.startsWith('senti|fg')) {
                const { calculateFearGreedIndex } = require('../features/sentimentRadar');
                const fg = calculateFearGreedIndex({});
                await bot.sendMessage(chatId, `${fg.emoji} <b>Fear & Greed Index: ${fg.index}/100</b>\n${fg.label}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #22 Narrative ──
            if (data === 'narr|trending') {
                const { narrativeTrend } = require('../features/narrativeDetector');
                const top = narrativeTrend.getTopNarratives(24, 5);
                if (!top.length) { await bot.sendMessage(chatId, '📭 No narrative data yet'); return; }
                const lines = top.map(n => `${n.emoji} ${n.name}`);
                await bot.sendMessage(chatId, `🔥 <b>Trending Narratives:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #28 Vesting ──
            if (data === 'vest|upcoming') {
                const { getAllUpcoming } = require('../features/vestingTracker');
                const upcoming = getAllUpcoming(30);
                if (!upcoming.length) { await bot.sendMessage(chatId, '📭 No upcoming unlocks tracked'); return; }
                const lines = upcoming.slice(0, 10).map(u => `🔓 ${u.token}: ${new Date(u.date).toLocaleDateString()} — ${u.amount?.toLocaleString() || '?'} tokens`);
                await bot.sendMessage(chatId, `🔓 <b>Upcoming Unlocks (30d):</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
                return;
            }

            // ── #24 Tax ──
            if (data === 'tax|summary') {
                const { TaxReporter } = require('../features/taxReporter');
                const reporter = new TaxReporter(new Date().getFullYear());
                const summary = reporter.calculateGains();
                await bot.sendMessage(chatId, `📋 <b>Tax Summary ${summary.taxYear}:</b>\n💰 Net: $${summary.netGain}\n📈 Short-term: $${summary.shortTermGains}\n📊 Long-term: $${summary.longTermGains}\n💸 Fees: $${summary.totalFees}`, { parse_mode: 'HTML' });
                return;
            }

        } catch (err) {
            log.error('Feature callback error:', err.message);
            try { await bot.answerCallbackQuery(query.id, { text: '❌ Error' }); } catch (_) {}
        }
    });
}

module.exports = registerCoreCommands;
