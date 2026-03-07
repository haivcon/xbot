const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const db = require('../../db.js');
const { sendReply } = require('../utils/chat');
const { buildWalletActionKeyboard, buildCloseKeyboard } = require('../utils/builders');
const { shortenAddress, normalizeAddressSafe } = require('../utils/web3');
const { buildPortfolioEmbedUrl, parseRegisterPayload } = require('../utils/payload');

module.exports = {
    command: /^\/register(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = match[1];
        if (await enforceOwnerCommandLimit(msg, 'register')) {
            return;
        }
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        if (!payload || !payload.trim()) {
            await sendReply(msg, t(lang, 'register_usage'), { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang) });
            return;
        }

        const parsed = parseRegisterPayload(payload);
        if (!parsed) {
            await sendReply(msg, t(lang, 'register_usage'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        try {
            const result = await db.addWalletToUser(chatId, lang, parsed.wallet, { name: parsed.name });

            const walletLabel = shortenAddress(parsed.wallet);
            const effectiveName = parsed.name || result?.name;
            const messageKey = result?.added
                ? (effectiveName ? 'register_wallet_saved_named' : 'register_wallet_saved')
                : (result?.nameChanged ? 'register_wallet_renamed' : 'register_wallet_exists');
            const message = t(lang, messageKey, { wallet: walletLabel, name: effectiveName });
            const portfolioLinks = [{ address: parsed.wallet, url: buildPortfolioEmbedUrl(parsed.wallet) }];
            await sendReply(msg, message, { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang, portfolioLinks) });
            console.log(`[BOT] Đăng ký ${shortenAddress(parsed.wallet)} -> ${chatId} (tokens: auto-detect)`);
        } catch (error) {
            console.error(`[Register] Failed to save token for ${chatId}: ${error.message}`);
            await sendReply(msg, t(lang, 'register_help_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        }
    }
};