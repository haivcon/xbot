const onchainos = require('../services/onchainos');
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');

module.exports = {
    command: /^\/meme(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) return;
        if (await enforceOwnerCommandLimit(msg, 'meme')) return;

        const lang = await getLang(msg);
        const input = match?.[1]?.trim();
        const chainIndex = '501'; // default: Solana/PumpFun

        try {
            if (input && (input.length > 20 || input.startsWith('0x'))) {
                // User passed a token address → show detail + dev info
                const loading = await sendReply(msg, t(lang, 'meme_loading_detail'));
                const [detail, devInfo] = await Promise.all([
                    onchainos.getMemePumpTokenDetails(chainIndex, input).catch(() => null),
                    onchainos.getMemePumpDevInfo(chainIndex, input).catch(() => null)
                ]);

                if (!detail) {
                    return sendReply(msg, t(lang, 'meme_not_found'), { parse_mode: 'HTML' });
                }

                const d = Array.isArray(detail) ? detail[0] : detail;
                const dev = devInfo ? (Array.isArray(devInfo) ? devInfo[0] : devInfo) : null;
                const sym = d.tokenSymbol || '?';
                const name = d.tokenName || sym;
                const mcap = Number(d.marketCap || 0);
                const price = Number(d.price || 0);
                const holders = d.holderCount || d.holders || '?';
                const progress = d.progress ? (Number(d.progress) * 100).toFixed(1) + '%' : 'N/A';
                const creator = d.creatorAddress || d.devAddress || '?';
                const mcapStr = mcap > 1e6 ? '$' + (mcap / 1e6).toFixed(2) + 'M' : '$' + mcap.toFixed(0);
                const pStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price.toFixed(6);

                let card = `🎯 <b>${sym}</b> — ${name}\n━━━━━━━━━━━━━━━━━━\n`;
                card += `💰 ${t(lang, 'meme_price')}: <code>$${pStr}</code>\n`;
                card += `📊 ${t(lang, 'meme_mcap')}: ${mcapStr}\n`;
                card += `👥 ${t(lang, 'meme_holders')}: ${holders}\n`;
                card += `⏳ ${t(lang, 'meme_progress')}: ${progress}\n`;
                card += `👨‍💻 Dev: <code>${creator.slice(0, 8)}...${creator.slice(-4)}</code>\n`;

                if (dev) {
                    const rugs = dev.rugPullCount || dev.rugs || 0;
                    const total = dev.totalTokensCreated || dev.tokenCount || 0;
                    const riskIcon = rugs > 3 ? '🔴' : rugs > 0 ? '🟡' : '🟢';
                    card += `\n${riskIcon} <b>${t(lang, 'meme_dev_stats')}</b>: ${total} ${t(lang, 'meme_created')}, ⚠️ ${rugs} rug(s)\n`;
                }

                if (d.description) card += `\n📝 <i>${d.description.slice(0, 200)}</i>\n`;

                return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });
            }

            // No input → show trending meme list (MIGRATED defaults)
            const loading = await sendReply(msg, t(lang, 'meme_loading'));
            const data = await onchainos.getMemePumpTokenList(chainIndex, 'MIGRATED', { sortBy: 'marketCap', limit: '15' });

            if (!data || !Array.isArray(data) || data.length === 0) {
                return sendReply(msg, t(lang, 'meme_empty'), { parse_mode: 'HTML' });
            }

            let card = `🚀 <b>${t(lang, 'meme_title')}</b> (Solana/PumpFun)\n`;
            card += `📊 ${t(lang, 'meme_stage')}: MIGRATED | ${data.length} tokens\n━━━━━━━━━━━━━━━━━━\n\n`;

            data.slice(0, 15).forEach((tok, i) => {
                const sym = tok.tokenSymbol || '?';
                const mcap = Number(tok.marketCap || 0);
                const vol = Number(tok.volume24h || tok.volumeUsd || 0);
                const holders = tok.holderCount || tok.holders || '?';
                const mcapStr = mcap > 1e6 ? '$' + (mcap / 1e6).toFixed(2) + 'M' : mcap > 1e3 ? '$' + (mcap / 1e3).toFixed(1) + 'K' : '$' + mcap.toFixed(0);
                const volStr = vol > 1e6 ? '$' + (vol / 1e6).toFixed(2) + 'M' : vol > 1e3 ? '$' + (vol / 1e3).toFixed(1) + 'K' : '$' + vol.toFixed(0);
                card += `${i + 1}. <b>${sym}</b>\n   💰 MCap: ${mcapStr} | 📊 Vol: ${volStr} | 👥 ${holders}\n\n`;
            });

            card += `\n💡 <i>${t(lang, 'meme_hint')}</i>`;
            return sendReply(msg, card, { parse_mode: 'HTML', disable_web_page_preview: true });

        } catch (error) {
            return sendReply(msg, `❌ ${t(lang, 'meme_error')}: ${error.message}`, { parse_mode: 'HTML' });
        }
    }
};
