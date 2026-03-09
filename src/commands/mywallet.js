const { enforceOwnerCommandLimit } = require('../features/auth/utils');
const logger = require('../core/logger');
const log = logger.child('Mywallet');
const { getLang, t } = require('../../i18n');
const db = require('../../db.js');
const { sendReply } = require('../utils/chat');
const { buildWalletActionKeyboard, buildWalletSelectMenu } = require('../utils/builders');
const { handleRegisterCommand } = require('./register');

module.exports = {
    command: /^\/mywallet(?:@[\w_]+)?(?:\s|$)/,
    handler: async (msg) => {
        if (await enforceOwnerCommandLimit(msg, 'mywallet')) {
            return;
        }
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        try {
            const wallets = await db.getWalletsForUser(chatId);
            if (!Array.isArray(wallets) || wallets.length === 0) {
                await handleRegisterCommand(msg, null);
                return;
            }

            const menu = await buildWalletSelectMenu(lang, chatId, wallets);
            await sendReply(msg, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
        } catch (error) {
            log.error(`Failed to render wallet for ${chatId}: ${error.message}`);
            const fallback = t(lang, 'wallet_overview_error');
            await sendReply(msg, fallback, { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang) });
        }
    }
};