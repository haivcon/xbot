const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const logger = require('../core/logger');
const log = logger.child('Toptoken');
const { getLang, t } = require('../../i18n');
const { buildTopTokenSessionKey, updateTopTokenSession, buildTopTokenChainMenu } = require('../features/top-tokens');
const { sendReply } = require('../utils/chat');

module.exports = {
    command: /^\/toptoken(?:@[\w_]+)?$/,
    handler: async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'toptoken')) {
            return;
        }

        const lang = await getLang(msg);
        const sessionKey = buildTopTokenSessionKey(msg.chat?.id, msg.from?.id);
        updateTopTokenSession(sessionKey, { chainIndex: null, chainLabel: null, sortBy: null, timeFrame: null, lang });

        try {
            const menu = await buildTopTokenChainMenu(lang);
            await sendReply(msg, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
        } catch (error) {
            log.error(`Failed to start command: ${error.message}`);
            await sendReply(msg, t(lang, 'toptoken_error'), { parse_mode: 'Markdown' });
        }
    }
};