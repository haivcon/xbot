const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const { buildHelpText, buildHelpKeyboard, saveHelpMessageState, getDefaultHelpGroup } = require('../features/help');

module.exports = {
    command: /^\/help(?:@[\w_]+)?(?:\s|$)/,
    handler: async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'help')) {
            return;
        }
        const lang = await getLang(msg);
        const defaultGroup = getDefaultHelpGroup();
        const helpText = buildHelpText(lang, defaultGroup);
        const replyMarkup = buildHelpKeyboard(lang, defaultGroup);
        const sent = await sendReply(msg, helpText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup
        });
        if (sent?.chat?.id && sent?.message_id) {
            saveHelpMessageState(sent.chat.id.toString(), sent.message_id, { view: 'user', group: defaultGroup });
        }
    }
};