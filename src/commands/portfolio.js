/**
 * /portfolio — View wallet portfolio via OnchainOS Wallet API
 */
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const logger = require('../core/logger');
const log = logger.child('Portfolio');
const { getLang, t } = require('../../i18n');
const db = require('../../db.js');
const { sendReply, buildThreadedOptions } = require('../utils/chat');
const { buildCloseKeyboard } = require('../utils/builders');
const { shortenAddress } = require('../utils/web3');
const onchainos = require('../services/onchainos');
const bot = require('../core/bot');

module.exports = {
    command: /^\/portfolio(?:@[\w_]+)?(?:\s+(0x[a-fA-F0-9]{40}))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'portfolio')) {
            return;
        }

        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        let address = match[1] || null;

        // If no address provided, try to get from linked wallets
        if (!address) {
            try {
                const wallets = await db.getWalletsForUser(chatId);
                if (wallets && wallets.length > 0) {
                    address = wallets[0].address || wallets[0].wallet;
                }
            } catch (error) {
                log.error(`Failed to get wallets for ${chatId}: ${error.message}`);
            }
        }

        if (!address) {
            await sendReply(msg, t(lang, 'portfolio_no_wallet'), {
                parse_mode: 'Markdown',
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        const statusMsg = await sendReply(msg, t(lang, 'portfolio_loading'), { parse_mode: 'Markdown' });

        try {
            const chains = '196'; // X Layer by default
            const [totalValueData, balancesData] = await Promise.all([
                onchainos.getWalletTotalValue(address, chains).catch(() => null),
                onchainos.getWalletBalances(address, chains).catch(() => null)
            ]);

            const shortAddr = shortenAddress(address);
            const parts = [];
            parts.push(`💼 *${t(lang, 'portfolio_title')}*`);
            parts.push(`📍 ${t(lang, 'portfolio_address')}: \`${shortAddr}\``);

            // Total value
            if (totalValueData && Array.isArray(totalValueData) && totalValueData.length > 0) {
                const totalValue = Number(totalValueData[0]?.totalValue || 0);
                parts.push(`\n💰 ${t(lang, 'portfolio_total_value')}: *$${totalValue.toFixed(2)}*`);
            }

            // Token balances
            if (balancesData && Array.isArray(balancesData) && balancesData.length > 0) {
                const tokenAssets = balancesData[0]?.tokenAssets || [];
                if (tokenAssets.length > 0) {
                    const sorted = [...tokenAssets]
                        .map((token) => ({
                            ...token,
                            usdValue: Number(token.tokenPrice || 0) * Number(token.holdingAmount || 0)
                        }))
                        .sort((a, b) => b.usdValue - a.usdValue);

                    const top10 = sorted.slice(0, 10);
                    parts.push(`\n📊 ${t(lang, 'portfolio_holdings')}:`);
                    for (const token of top10) {
                        const symbol = token.tokenSymbol || '?';
                        const amount = Number(token.holdingAmount || 0);
                        const price = Number(token.tokenPrice || 0);
                        const value = token.usdValue;
                        const amountStr = amount < 1 ? amount.toFixed(6) : amount < 1000 ? amount.toFixed(4) : amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
                        parts.push(`  • *${symbol}*: ${amountStr} ($${value.toFixed(2)})`);
                    }

                    if (sorted.length > 10) {
                        parts.push(`  _...${t(lang, 'portfolio_more_tokens', { count: sorted.length - 10 })}_`);
                    }
                } else {
                    parts.push(`\n_${t(lang, 'portfolio_no_tokens')}_`);
                }
            }

            // Inline keyboard
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `🔄 ${t(lang, 'portfolio_refresh')}`, callback_data: `portfolio_refresh:${address}` },
                        { text: '❌', callback_data: 'close' }
                    ]
                ]
            };

            const replyText = parts.join('\n');

            // Edit the loading message
            try {
                await bot.editMessageText(replyText, {
                    chat_id: msg.chat.id,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    disable_web_page_preview: true
                });
            } catch (editError) {
                await sendReply(msg, replyText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    disable_web_page_preview: true
                });
            }

        } catch (error) {
            log.error(`Error for ${address}: ${error.message || error.msg}`);
            try {
                await bot.editMessageText(t(lang, 'portfolio_error'), {
                    chat_id: msg.chat.id,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: buildCloseKeyboard(lang)
                });
            } catch (editError) {
                await sendReply(msg, t(lang, 'portfolio_error'), {
                    parse_mode: 'Markdown',
                    reply_markup: buildCloseKeyboard(lang)
                });
            }
        }
    }
};
