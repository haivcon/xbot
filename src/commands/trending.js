const onchainos = require('../../services/onchainos');
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');

module.exports = {
    command: /^\/(trending|topvolume|topmcap)(?:@[\w_]+)?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'trending')) return;

        const lang = await getLang(msg);
        const subCmd = match?.[1] || 'trending';

        // Map subcmd to API parameters
        const sortMap = {
            'trending': { sortBy: '2', label: '🔥 Top Gainers', timeFrame: '4' },      // priceChangePercent24H
            'topvolume': { sortBy: '3', label: '📊 Top Volume', timeFrame: '4' },      // volume24H
            'topmcap': { sortBy: '5', label: '💎 Top Market Cap', timeFrame: '4' }     // marketCap
        };
        const config = sortMap[subCmd] || sortMap.trending;

        try {
            await sendReply(msg, t(lang, 'trending_loading'));
            const chains = '501'; // Default Solana
            const data = await onchainos.getTokenTopList(chains, config.sortBy, config.timeFrame);

            if (!data || !Array.isArray(data) || data.length === 0) {
                return sendReply(msg, t(lang, 'trending_empty'), { parse_mode: 'HTML' });
            }

            let card = `${config.label} <b>(24H)</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

            data.slice(0, 15).forEach((tok, i) => {
                const sym = tok.tokenSymbol || '?';
                const price = Number(tok.price || 0);
                const change = Number(tok.priceChangePercent24H || tok.change24h || 0);
                const vol = Number(tok.volume24H || tok.volume || 0);
                const mcap = Number(tok.marketCap || 0);
                const pStr = price < 0.01 ? price.toFixed(8) : price.toFixed(4);
                const changeIcon = change >= 0 ? '🟢' : '🔴';
                const changeStr = change >= 0 ? '+' + change.toFixed(2) + '%' : change.toFixed(2) + '%';
                const volStr = vol > 1e6 ? '$' + (vol / 1e6).toFixed(2) + 'M' : vol > 1e3 ? '$' + (vol / 1e3).toFixed(1) + 'K' : '$' + vol.toFixed(0);
                const mcapStr = mcap > 1e9 ? '$' + (mcap / 1e9).toFixed(2) + 'B' : mcap > 1e6 ? '$' + (mcap / 1e6).toFixed(2) + 'M' : mcap > 1e3 ? '$' + (mcap / 1e3).toFixed(1) + 'K' : '$' + mcap.toFixed(0);

                card += `${i + 1}. <b>${sym}</b> $${pStr} ${changeIcon} ${changeStr}\n`;
                card += `   Vol: ${volStr} | MCap: ${mcapStr}\n\n`;
            });

            card += `\n💡 <i>${t(lang, 'trending_hint')}</i>`;
            return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });

        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'trending_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    }
};
