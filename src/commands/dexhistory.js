const onchainos = require('../../services/onchainos');
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const db = require('../../../db');

module.exports = {
    command: /^\/dexhistory(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'dexhistory')) return;

        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const userId = String(msg.from?.id);

        try {
            let walletAddress = input;
            let chainIndex = '1';

            if (!walletAddress) {
                const wallets = await db.getWalletsForUser(userId);
                if (!wallets || wallets.length === 0) {
                    return sendReply(msg, t(lang, 'dex_no_wallet'), { parse_mode: 'HTML' });
                }
                walletAddress = wallets[0].address || wallets[0].wallet;
            }

            if (walletAddress.length > 32 && !walletAddress.startsWith('0x')) {
                chainIndex = '501';
            }

            await sendReply(msg, t(lang, 'dex_loading'));

            const now = Date.now();
            const begin = String(now - 30 * 24 * 60 * 60 * 1000);
            const end = String(now);
            const data = await onchainos.getDexHistory(chainIndex, walletAddress, begin, end, { limit: '15' });

            if (!data || (Array.isArray(data) && data.length === 0)) {
                return sendReply(msg, t(lang, 'dex_no_data'), { parse_mode: 'HTML' });
            }

            const items = Array.isArray(data) ? data : [data];
            const typeLabels = { '1': '🟢 BUY', '2': '🔴 SELL', '3': '📥 IN', '4': '📤 OUT' };

            let card = `📜 <b>${t(lang, 'dex_title')}</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <code>${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}</code>\n\n`;

            items.slice(0, 15).forEach((tx, i) => {
                const type = typeLabels[tx.type] || tx.type || '?';
                const sym = tx.tokenSymbol || '?';
                const value = Number(tx.valueUsd || tx.usdValue || 0);
                const time = tx.time ? new Date(Number(tx.time)).toLocaleString('en-US', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                card += `${i + 1}. ${type} <b>${sym}</b>: $${value.toFixed(2)}`;
                if (time) card += ` | 🕐 ${time}`;
                card += '\n';
            });

            return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });

        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'dex_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    }
};
