/**
 * /gas — Check gas prices via OnchainOS Gateway API
 */
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const { buildCloseKeyboard } = require('../utils/builders');
const onchainos = require('../services/onchainos');
const bot = require('../core/bot');

const CHAIN_CONFIGS = [
    { index: '196', name: 'X Layer', emoji: '🔷' },
    { index: '1', name: 'Ethereum', emoji: '💎' },
    { index: '56', name: 'BSC', emoji: '🟡' },
    { index: '137', name: 'Polygon', emoji: '🟣' },
    { index: '43114', name: 'Avalanche', emoji: '🔺' }
];

module.exports = {
    command: /^\/gas(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'gas')) {
            return;
        }

        const lang = await getLang(msg);
        const chainParam = (match[1] || '').trim().toLowerCase();

        // Resolve chain by name
        let targetChains = CHAIN_CONFIGS;
        if (chainParam) {
            const found = CHAIN_CONFIGS.find((c) =>
                c.name.toLowerCase() === chainParam ||
                c.index === chainParam ||
                c.name.toLowerCase().startsWith(chainParam)
            );
            if (found) {
                targetChains = [found];
            }
        }

        const statusMsg = await sendReply(msg, t(lang, 'gas_loading'), { parse_mode: 'Markdown' });

        try {
            // Fetch gas for all target chains in parallel
            const results = await Promise.allSettled(
                targetChains.map(async (chain) => {
                    const data = await onchainos.getGasPrice(chain.index);
                    return { chain, data };
                })
            );

            const lines = [];
            lines.push(`⛽ *${t(lang, 'gas_title')}*`);
            lines.push('');

            for (const result of results) {
                if (result.status !== 'fulfilled' || !result.value.data) {
                    continue;
                }
                const { chain, data } = result.value;
                if (!data || !Array.isArray(data) || data.length === 0) {
                    continue;
                }

                const gas = data[0];
                lines.push(`${chain.emoji} *${chain.name}* (Chain ${chain.index})`);

                if (gas.gasPrice) {
                    lines.push(`  📊 Normal: ${gas.gasPrice} Gwei`);
                }
                if (gas.suggestGasPrice) {
                    lines.push(`  🚀 Fast: ${gas.suggestGasPrice} Gwei`);
                }
                if (gas.maxFeePerGas) {
                    lines.push(`  ⚡ Max Fee: ${gas.maxFeePerGas} Gwei`);
                }
                if (gas.baseFee) {
                    lines.push(`  📋 Base Fee: ${gas.baseFee} Gwei`);
                }
                lines.push('');
            }

            if (lines.length <= 2) {
                lines.push(`_${t(lang, 'gas_no_data')}_`);
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `🔄 ${t(lang, 'gas_refresh')}`, callback_data: 'gas_refresh' },
                        { text: '❌', callback_data: 'close' }
                    ]
                ]
            };

            try {
                await bot.editMessageText(lines.join('\n'), {
                    chat_id: msg.chat.id,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (editError) {
                await sendReply(msg, lines.join('\n'), {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

        } catch (error) {
            console.error(`[Gas] Error: ${error.message || error.msg}`);
            try {
                await bot.editMessageText(t(lang, 'gas_error'), {
                    chat_id: msg.chat.id,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: buildCloseKeyboard(lang)
                });
            } catch (editError) {
                await sendReply(msg, t(lang, 'gas_error'), {
                    parse_mode: 'Markdown',
                    reply_markup: buildCloseKeyboard(lang)
                });
            }
        }
    }
};
