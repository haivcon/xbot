/**
 * On-chain Callback Handlers
 * Handles all inline keyboard callbacks for meme/trending/pnl/dex/tx commands
 * Pattern: bot.on('callback_query') with prefix filtering (same as autoDetection.js)
 */
module.exports = function registerOnchainCallbacks({ bot, getLang, t }) {
    const onchainos = require('../../services/onchainos');
    const {
        explorerTokenUrl, fmtNum, fmtPrice, fmtPercent, fmtCompact,
        progressBar, relativeTime, riskScore, riskTagsText,
        buySellRatio, shortAddr, chainInfo
    } = require('../../utils/explorerLinks');

    bot.on('callback_query', async (query) => {
        try {
            const data = query.data || '';
            if (!data.startsWith('oc_')) return;

            const lang = await getLang(query.message);
            const chatId = query.message.chat.id;
            const msgId = query.message.message_id;

            // ── Meme detail ──
            if (data.startsWith('oc_meme_d|')) {
                const addr = data.slice('oc_meme_d|'.length);
                if (!addr) return;
                const chainIndex = '501';
                await bot.answerCallbackQuery(query.id, { text: '🔍...' }).catch(() => {});
                const [detail, devInfo] = await Promise.all([
                    onchainos.getMemePumpTokenDetails(chainIndex, addr).catch(() => null),
                    onchainos.getMemePumpDevInfo(chainIndex, addr).catch(() => null)
                ]);
                if (!detail) return bot.answerCallbackQuery(query.id, { text: '❌ Not found', show_alert: true }).catch(() => {});
                const d = Array.isArray(detail) ? detail[0] : detail;
                const dev = devInfo ? (Array.isArray(devInfo) ? devInfo[0] : devInfo) : null;
                const sym = d.symbol || d.tokenSymbol || '?';
                const name = d.name || d.tokenName || sym;
                const tokenAddr = d.tokenAddress || addr;
                const mcap = Number(d.market?.marketCapUsd || 0);
                const price = Number(d.market?.price || 0);
                const holders = d.tags?.totalHolders || '?';
                const bondPct = Number(d.bondingPercent || 0);
                const creator = d.creatorAddr || d.creatorAddress || '?';
                const buyTx = d.market?.buyTxCount1h || 0;
                const sellTx = d.market?.sellTxCount1h || 0;
                const vol1h = Number(d.market?.volumeUsd1h || 0);
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

                if (dev) {
                    const di = dev.devLaunchedInfo || dev;
                    const dh = dev.devHoldingInfo || {};
                    const rugs = Number(di.rugPullCount || 0);
                    const total = Number(di.totalTokens || 0);
                    const golden = Number(di.goldenGemCount || 0);
                    const devPct = Number(dh.devHoldingPercent || d.tags?.devHoldingsPercent || 0);
                    const rIcon = rugs > 3 ? '🔴' : rugs > 0 ? '🟡' : '🟢';
                    card += `\n${rIcon} <b>${t(lang, 'meme_dev_stats')}</b>\n`;
                    card += `   🎯 ${total} ${t(lang, 'meme_created')} | 💎 ${golden} gems | ⚠️ ${rugs} rug(s)\n`;
                    if (devPct > 0) card += `   👨‍💻 Dev Hold: ${devPct.toFixed(2)}%\n`;
                }
                if (tagsText) card += `\n🛡️ <b>Risk Tags</b>\n${tagsText}\n`;
                if (d.description) card += `\n📝 <i>${d.description.slice(0, 150)}</i>\n`;

                const buttons = [];
                const socialRow = [];
                if (d.social?.website) socialRow.push({ text: '🌐 Web', url: d.social.website });
                if (d.social?.telegram) socialRow.push({ text: '💬 TG', url: d.social.telegram.startsWith('http') ? d.social.telegram : `https://t.me/${d.social.telegram}` });
                if (d.social?.x) socialRow.push({ text: '𝕏', url: d.social.x });
                if (socialRow.length > 0) buttons.push(socialRow);
                buttons.push([
                    { text: '🔍 Similar', callback_data: `oc_similar|501|${tokenAddr.slice(0, 40)}` },
                    { text: '📦 Bundle', callback_data: `oc_bundle|501|${tokenAddr.slice(0, 40)}` },
                ]);
                buttons.push([
                    { text: '🔗 OKLink', url: explorerTokenUrl('501', tokenAddr) },
                    { text: '💱 Swap', callback_data: `oc_swap|${sym}` },
                ]);

                await bot.sendMessage(chatId, card, {
                    parse_mode: 'HTML', disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: buttons }
                });
                return;
            }

            // ── Meme stage switch / refresh ──
            if (data.startsWith('oc_meme_s|') || data.startsWith('oc_meme_r|')) {
                const stage = data.split('|')[1] || 'MIGRATED';
                const chainIndex = '501';
                await bot.answerCallbackQuery(query.id, { text: `Loading ${stage}...` }).catch(() => {});
                const mData = await onchainos.getMemePumpTokenList(chainIndex, stage, { sortBy: 'marketCap', limit: '15' });
                if (!mData || !Array.isArray(mData) || mData.length === 0) {
                    return bot.editMessageText(t(lang, 'meme_empty'), { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
                }
                let card = `🚀 <b>${t(lang, 'meme_title')}</b> (Solana)\n📊 ${t(lang, 'meme_stage')}: ${stage} | ${mData.length} tokens\n━━━━━━━━━━━━━━━━━━\n\n`;
                mData.slice(0, 10).forEach((tok, i) => {
                    const sym = tok.symbol || tok.tokenSymbol || '?';
                    const mcap = Number(tok.market?.marketCapUsd || 0);
                    const vol = Number(tok.market?.volumeUsd1h || 0);
                    const holders = tok.tags?.totalHolders || '?';
                    const bondPct = Number(tok.bondingPercent || 0);
                    const risk = riskScore(tok.tags);
                    const age = relativeTime(tok.createdTimestamp);
                    card += `${i + 1}. ${risk.icon} <b>${sym}</b>`;
                    if (age) card += ` <i>(${age})</i>`;
                    card += `\n   💰 ${fmtNum(mcap)} | 📊 ${fmtNum(vol)}/1h | 👥 ${holders}\n`;
                    if (stage === 'PUMPING') card += `   ⏳ ${progressBar(bondPct, 8)}\n`;
                    card += '\n';
                });
                card += `💡 <i>${t(lang, 'meme_hint')}</i>`;
                const buttons = [];
                const detailRow = mData.slice(0, 5).map((tok, i) => ({
                    text: `${i + 1}. ${tok.symbol || '?'}`, callback_data: `oc_meme_d|${tok.tokenAddress?.slice(0, 40) || ''}`
                }));
                if (detailRow.length > 0) buttons.push(detailRow);
                buttons.push([
                    { text: stage === 'MIGRATED' ? '✅ Migrated ◀' : '✅ Migrated', callback_data: 'oc_meme_s|MIGRATED' },
                    { text: stage === 'PUMPING' ? '🔥 Pumping ◀' : '🔥 Pumping', callback_data: 'oc_meme_s|PUMPING' },
                    { text: '🔄', callback_data: `oc_meme_r|${stage}` },
                ]);
                await bot.editMessageText(card, {
                    chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
                    disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons }
                }).catch(() => {});
                return;
            }

            // ── Similar tokens ──
            if (data.startsWith('oc_similar|')) {
                const parts = data.slice('oc_similar|'.length).split('|');
                const chainIndex = parts[0] || '501';
                const addr = parts[1];
                if (!addr) return;
                await bot.answerCallbackQuery(query.id, { text: '🔍 Loading...' }).catch(() => {});
                const sData = await onchainos.getMemePumpSimilarTokens(chainIndex, addr).catch(() => null);
                if (!sData || (Array.isArray(sData) && sData.length === 0)) {
                    return bot.answerCallbackQuery(query.id, { text: '📭 No similar tokens', show_alert: true }).catch(() => {});
                }
                const items = Array.isArray(sData) ? sData : [sData];
                let card = `🔍 <b>Similar Tokens</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                items.slice(0, 8).forEach((tok, i) => {
                    const sym = tok.symbol || tok.tokenSymbol || '?';
                    const mcap = Number(tok.market?.marketCapUsd || tok.marketCap || 0);
                    const holders = tok.tags?.totalHolders || tok.holders || '?';
                    const tAddr = tok.tokenAddress || tok.tokenContractAddress || '';
                    card += `${i + 1}. <b>${sym}</b> | MCap: ${fmtNum(mcap)} | 👥 ${holders}`;
                    if (tAddr) card += `\n   <a href="${explorerTokenUrl(chainIndex, tAddr)}">🔗 OKLink</a>`;
                    card += '\n\n';
                });
                await bot.sendMessage(chatId, card, { parse_mode: 'HTML', disable_web_page_preview: true });
                return;
            }

            // ── Bundle info ──
            if (data.startsWith('oc_bundle|')) {
                const parts = data.slice('oc_bundle|'.length).split('|');
                const chainIndex = parts[0] || '501';
                const addr = parts[1];
                if (!addr) return;
                await bot.answerCallbackQuery(query.id, { text: '📦 Loading...' }).catch(() => {});
                const bData = await onchainos.getMemePumpBundleInfo(chainIndex, addr).catch(() => null);
                if (!bData) return bot.answerCallbackQuery(query.id, { text: '📭 No bundle data', show_alert: true }).catch(() => {});
                const d = Array.isArray(bData) ? bData[0] : bData;
                const raw = JSON.stringify(d, null, 2).slice(0, 700).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
                await bot.sendMessage(chatId, `📦 <b>Bundle Analysis</b>\n━━━━━━━━━━━━━━━━━━\n<pre>${raw}</pre>`, {
                    parse_mode: 'HTML', disable_web_page_preview: true
                });
                return;
            }

            // ── Security redirect ──
            if (data.startsWith('oc_security|')) {
                const addr = data.split('|')[2] || '';
                await bot.answerCallbackQuery(query.id, { text: '🛡️' }).catch(() => {});
                await bot.sendMessage(chatId, `🛡️ To check token security:\n<code>/ai check security ${addr}</code>`, { parse_mode: 'HTML' });
                return;
            }

            // ── Swap redirect ──
            if (data.startsWith('oc_swap|')) {
                const sym = data.slice('oc_swap|'.length);
                await bot.answerCallbackQuery(query.id, { text: '💱' }).catch(() => {});
                await bot.sendMessage(chatId, `💱 To swap:\n<code>/swap [amount] SOL ${sym}</code>`, { parse_mode: 'HTML' });
                return;
            }

            // ── Trending switch / refresh ──
            if (data.startsWith('oc_trend_sw|') || data.startsWith('oc_trend_r|')) {
                const subCmd = data.split('|')[1] || 'trending';
                const chainIndex = '501';
                const sortMap = {
                    'trending':  { sortBy: '2', label: '🔥 Top Gainers' },
                    'topvolume': { sortBy: '3', label: '📊 Top Volume' },
                    'topmcap':   { sortBy: '5', label: '💎 Top Market Cap' },
                };
                const config = sortMap[subCmd] || sortMap.trending;
                await bot.answerCallbackQuery(query.id, { text: `Loading...` }).catch(() => {});
                const tData = await onchainos.getTokenTopList(chainIndex, config.sortBy, '4');
                if (!tData || !Array.isArray(tData) || tData.length === 0) {
                    return bot.editMessageText(t(lang, 'trending_empty'), { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
                }
                const chn = chainInfo(chainIndex);
                let card = `${config.label} <b>(24H)</b> — ${chn.name}\n━━━━━━━━━━━━━━━━━━\n\n`;
                tData.slice(0, 10).forEach((tok, i) => {
                    const sym = tok.tokenSymbol || '?';
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
                    const cIcon = change >= 0 ? '🟢' : '🔴';
                    card += `${i + 1}. <b>${sym}</b> ${fmtPrice(price)} ${cIcon} ${change >= 0 ? '+' : ''}${fmtPercent(change)}`;
                    if (age) card += ` <i>(${age})</i>`;
                    card += `\n   Vol: ${fmtNum(vol)} | MCap: ${fmtNum(mcap)}`;
                    card += `\n   👥 ${fmtCompact(holders)} holders`;
                    if (traders) card += ` · ${fmtCompact(traders)} traders`;
                    card += ` | ${buySellRatio(txBuy, txSell)}`;
                    if (addr) card += `\n   <a href="${explorerTokenUrl(chainIndex, addr)}">🔗 OKLink</a>`;
                    card += '\n\n';
                });
                card += `💡 <i>${t(lang, 'trending_hint')}</i>`;
                const tabRow = [
                    { text: subCmd === 'trending' ? '🔥 Gainers ◀' : '🔥 Gainers', callback_data: 'oc_trend_sw|trending' },
                    { text: subCmd === 'topvolume' ? '📊 Volume ◀' : '📊 Volume', callback_data: 'oc_trend_sw|topvolume' },
                    { text: subCmd === 'topmcap' ? '💎 MCap ◀' : '💎 MCap', callback_data: 'oc_trend_sw|topmcap' },
                ];
                const detailRow = tData.slice(0, 5).map((tok, i) => ({
                    text: `${i + 1}. ${tok.tokenSymbol || '?'}`,
                    callback_data: `oc_meme_d|${(tok.tokenContractAddress || '').slice(0, 40)}`
                }));
                const buttons = [];
                if (detailRow.length > 0) buttons.push(detailRow);
                buttons.push(tabRow);
                buttons.push([{ text: '🔄 Refresh', callback_data: `oc_trend_r|${subCmd}|${chainIndex}` }]);
                await bot.editMessageText(card, {
                    chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
                    disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons }
                }).catch(() => {});
                return;
            }

            // ── Simple refresh hints ──
            if (data.startsWith('oc_pnl_r|') || data.startsWith('oc_dex_r|') || data.startsWith('oc_tx_r|')) {
                const cmdHints = { 'oc_pnl_r': '/pnl', 'oc_dex_r': '/dexhistory', 'oc_tx_r': '/txhistory' };
                const prefix = data.split('|')[0];
                await bot.answerCallbackQuery(query.id, { text: `🔄 Use ${cmdHints[prefix] || '/help'} to refresh` }).catch(() => {});
                return;
            }

        } catch (err) {
            try { await bot.answerCallbackQuery(query.id, { text: '❌ Error' }); } catch (_) {}
        }
    });
};
