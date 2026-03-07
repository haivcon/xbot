const { enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang } = require('../../i18n');
const db = require('../../db.js');
const { sendReply } = require('../utils/chat');
const { buildDonateMessage, buildDonateKeyboard } = require('../utils/builders');

module.exports = {
    command: /^\/donate(?:@[\w_]+)?$/,
    handler: async (msg) => {
        if (await enforceOwnerCommandLimit(msg, 'donate')) {
            return;
        }
        const lang = await getLang(msg);
        const chatId = msg.chat?.id?.toString();
        const groupSettings = chatId ? await db.getGroupBotSettings(chatId) : null;
        const text = buildDonateMessage(lang, { groupSettings });
        await sendReply(msg, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: buildDonateKeyboard(lang)
        });
    }
};