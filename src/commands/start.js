const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { resolveLangCode } = require('../../i18n');
const db = require('../../db.js');
const { t } = require('../../i18n');
const { shortenAddress } = require('../../utils/web3');
const { sendReply, handleStartNoToken } = require('../../utils/chat');

module.exports = {
    command: /^\/start(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }

        const token = match[1];

        if (token) {
            if (await enforceOwnerCommandLimit(msg, 'start')) {
                return;
            }
            const chatId = msg.chat.id.toString();
            // Khi /start, luôn ưu tiên ngôn ngữ của thiết bị
            const lang = resolveLangCode(msg.from.language_code);
            const walletAddress = await db.getPendingWallet(token);
            if (walletAddress) {
                const result = await db.addWalletToUser(chatId, lang, walletAddress);
                await db.deletePendingToken(token);
                const messageKey = result?.added ? 'connect_success' : 'register_wallet_exists';
                const message = t(lang, messageKey, { walletAddress: walletAddress, wallet: shortenAddress(walletAddress) });
                sendReply(msg, message, { parse_mode: "Markdown" });
                console.log(`[BOT] Liên kết (DApp): ${walletAddress} -> ${chatId} (lang: ${lang})`);
            } else {
                const message = t(lang, 'connect_fail_token');
                sendReply(msg, message, { parse_mode: "Markdown" });
                console.log(`[BOT] Token không hợp lệ: ${token}`);
            }
        } else {
            await handleStartNoToken(msg);
        }
    }
};