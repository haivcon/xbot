const onchainos = require('../services/onchainos');
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const db = require('../../db');

module.exports = {
    command: /^\/pnl(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'pnl')) return;

        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const userId = String(msg.from?.id);

        try {
            // Get user's first wallet for default chain/address
            let walletAddress = input;
            let chainIndex = '1'; // default Ethereum

            if (!walletAddress) {
                const wallets = await db.getWalletsForUser(userId);
                if (!wallets || wallets.length === 0) {
                    return sendReply(msg, t(lang, 'pnl_no_wallet'), { parse_mode: 'HTML' });
                }
                walletAddress = wallets[0].address || wallets[0].wallet;
            }

            // Detect chain from address format
            if (walletAddress.length > 32 && !walletAddress.startsWith('0x')) {
                chainIndex = '501'; // Solana
            }

            await sendReply(msg, t(lang, 'pnl_loading'));

            const [overview, recentPnl] = await Promise.all([
                onchainos.getPortfolioOverview(chainIndex, walletAddress, '3').catch(() => null),
                onchainos.getRecentPnl(chainIndex, walletAddress, { limit: '10' }).catch(() => null)
            ]);

            if (!overview && !recentPnl) {
                return sendReply(msg, t(lang, 'pnl_no_data'), { parse_mode: 'HTML' });
            }

            let card = `📊 <b>${t(lang, 'pnl_title')}</b> (7D)\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <code>${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}</code>\n\n`;

            if (overview) {
                const o = Array.isArray(overview) ? overview[0] : overview;
                const pnl = Number(o.totalPnl || o.pnl || 0);
                const winRate = Number(o.winRate || 0);
                const trades = Number(o.totalTradeCount || o.txCount || 0);
                const pnlIcon = pnl >= 0 ? '🟢' : '🔴';
                const pnlStr = pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2);
                card += `${pnlIcon} PnL: <b>${pnlStr}</b>\n`;
                card += `🎯 Win Rate: <b>${(winRate * 100).toFixed(1)}%</b>\n`;
                card += `📈 Trades: <b>${trades}</b>\n\n`;
            }

            if (recentPnl && Array.isArray(recentPnl) && recentPnl.length > 0) {
                card += `📋 <b>${t(lang, 'pnl_recent')}</b>:\n`;
                recentPnl.slice(0, 10).forEach((tok, i) => {
                    const sym = tok.tokenSymbol || '?';
                    const p = Number(tok.pnl || tok.realizedPnl || 0);
                    const icon = p >= 0 ? '🟢' : '🔴';
                    card += `  ${i + 1}. ${icon} <b>${sym}</b>: ${p >= 0 ? '+' : ''}$${p.toFixed(2)}\n`;
                });
            }

            card += `\n💡 <i>${t(lang, 'pnl_hint')}</i>`;
            return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });

        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'pnl_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    }
};
