const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const { buildDonateMessage, buildDonateKeyboard } = require('../utils/builders');

module.exports = {
    command: /^\/donatedev(?:@[\w_]+)?$/,
    handler: async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'donatedev')) {
            return;
        }
        const lang = await getLang(msg);
        const text = buildDonateMessage(lang, { variant: 'developer' });
        await sendReply(msg, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: buildDonateKeyboard(lang)
        });
    }
};