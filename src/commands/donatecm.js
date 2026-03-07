const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const { getLang, t } = require('../../i18n');
const db = require('../../db.js');
const { sendReply } = require('../utils/chat');
const { buildCloseKeyboard } = require('../utils/builders');
const { normalizeAddressSafe } = require('../utils/web3');
const { COMMUNITY_WALLET_ADDRESS } = require('../config');
const { isGroupAdmin } = require('../features/auth/utils');
const { escapeHtml } = require('../utils/format');
const bot = require('../core/bot');

module.exports = {
    command: /^\/donatecm(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const payload = match[1];
        if (await enforceOwnerCommandLimit(msg, 'donatecm')) {
            return;
        }
        const lang = await getLang(msg);
        const chatId = msg.chat?.id?.toString();
        const userId = msg.from?.id;
        const chatType = msg.chat?.type;

        if (!['group', 'supergroup'].includes(chatType)) {
            await sendReply(msg, t(lang, 'donatecm_group_only'), { parse_mode: 'HTML', reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        if (!chatId || !userId) {
            return;
        }

        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await bot.sendMessage(chatId, t(lang, 'donatecm_no_permission'), {
                reply_to_message_id: msg.message_id,
                allow_sending_without_reply: true
            });
            return;
        }

        const args = (payload || '').trim();
        if (!args) {
            const settings = await db.getGroupBotSettings(chatId);
            const donation = settings.donation || {};
            const address = donation.address || COMMUNITY_WALLET_ADDRESS;
            const note = donation.note || t(lang, 'donatecm_default_note');
            const text = t(lang, 'donatecm_overview', {
                address: escapeHtml(address),
                note: escapeHtml(note)
            });
            const inline_keyboard = [
                [{ text: t(lang, 'donatecm_broadcast_button'), callback_data: 'donatecm_broadcast' }],
                [{ text: t(lang, 'help_button_close'), callback_data: 'donate_cmd|close' }]
            ];
            await sendReply(msg, text, { parse_mode: 'HTML', reply_markup: { inline_keyboard } });
            return;
        }

        const [addressRaw, ...noteParts] = args.split(/\s+/);
        const normalized = normalizeAddressSafe(addressRaw);
        if (!normalized) {
            await sendReply(msg, t(lang, 'donatecm_invalid_wallet'), {
                parse_mode: 'HTML',
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        const note = noteParts.join(' ').trim();
        await db.updateGroupBotSettings(chatId, { donation: { address: normalized, note } });
        await sendReply(msg, t(lang, 'donatecm_updated', { address: normalized, note: note || t(lang, 'donatecm_default_note') }), {
            parse_mode: 'HTML',
            reply_markup: buildCloseKeyboard(lang)
        });
    }
};