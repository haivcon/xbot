const onchainos = require('../services/onchainos');
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const db = require('../../db');

module.exports = {
    command: /^\/tx(?:history)?(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'txhistory')) return;

        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const userId = String(msg.from?.id);

        try {
            // Check if input looks like a tx hash (64+ hex chars)
            if (input && input.length >= 64) {
                // Transaction detail by hash
                await sendReply(msg, t(lang, 'tx_loading_detail'));
                const chainIndex = input.startsWith('0x') ? '1' : '501'; // EVM or Solana
                const data = await onchainos.getTransactionDetail(chainIndex, input);

                if (!data) {
                    return sendReply(msg, t(lang, 'tx_not_found'), { parse_mode: 'HTML' });
                }

                const d = Array.isArray(data) ? data[0] : data;
                const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };

                let card = `🔍 <b>${t(lang, 'tx_detail_title')}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                card += `⛓ ${chainNames[chainIndex] || 'Chain #' + chainIndex}\n`;
                card += `🔗 <code>${input.slice(0, 16)}...${input.slice(-8)}</code>\n`;
                if (d.from) card += `📤 From: <code>${d.from.slice(0, 10)}...${d.from.slice(-4)}</code>\n`;
                if (d.to) card += `📥 To: <code>${d.to.slice(0, 10)}...${d.to.slice(-4)}</code>\n`;
                if (d.amount || d.value) card += `💰 Value: ${d.amount || d.value}\n`;
                if (d.txFee) card += `💸 Fee: ${d.txFee}\n`;
                if (d.state !== undefined) card += `✅ Status: ${d.state === '1' || d.state === 'success' ? '✅ Success' : '❌ Failed'}\n`;
                if (d.methodLabel) card += `📋 Method: ${d.methodLabel}\n`;

                if (d.tokenTransferDetails && d.tokenTransferDetails.length > 0) {
                    card += `\n📦 ${t(lang, 'tx_transfers')}:\n`;
                    d.tokenTransferDetails.slice(0, 5).forEach(tr => {
                        card += `  • ${Number(tr.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tr.symbol || '?'}\n`;
                    });
                }

                return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });
            }

            // Address or default → transaction history
            let address = input;
            if (!address) {
                const wallets = await db.getWalletsForUser(userId);
                if (!wallets || wallets.length === 0) {
                    return sendReply(msg, t(lang, 'tx_no_wallet'), { parse_mode: 'HTML' });
                }
                address = wallets[0].address || wallets[0].wallet;
            }

            await sendReply(msg, t(lang, 'tx_loading'));
            const chains = address.startsWith('0x') ? '1,56,196,137' : '501';
            const data = await onchainos.getTransactionHistory(address, { chains, limit: '10' });

            if (!data || (Array.isArray(data) && data.length === 0)) {
                return sendReply(msg, t(lang, 'tx_no_data'), { parse_mode: 'HTML' });
            }

            const items = Array.isArray(data) ? data : [data];
            let card = `📜 <b>${t(lang, 'tx_title')}</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <code>${address.slice(0, 8)}...${address.slice(-4)}</code>\n\n`;

            items.slice(0, 10).forEach((tx, i) => {
                const method = tx.methodLabel || tx.method || tx.txType || 'Transfer';
                const hash = tx.txHash || tx.txhash || '?';
                const time = tx.transactionTime ? new Date(Number(tx.transactionTime)).toLocaleString('en-US', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                card += `${i + 1}. <b>${method}</b>\n`;
                card += `   🔗 <code>${hash.slice(0, 12)}...</code>`;
                if (time) card += ` | 🕐 ${time}`;
                card += '\n';
            });

            card += `\n💡 <i>${t(lang, 'tx_hint')}</i>`;
            return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });

        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'tx_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    }
};
