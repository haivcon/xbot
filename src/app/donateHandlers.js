const { normalizeAddressSafe } = require('../utils/helpers');

function createDonateHandlers({
    bot,
    t,
    db,
    getLang,
    sendReply,
    buildDonateMessage,
    buildDonateKeyboard,
    buildCloseKeyboard,
    COMMUNITY_WALLET_ADDRESS,
    isGroupAdmin,
    escapeHtml,
    enforceOwnerCommandLimit
}) {
    async function handleDonateCommand(msg) {
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

    async function handleDonateDevCommand(msg) {
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

    async function handleDonateCommunityManageCommand(msg, payload) {
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

    return {
        handleDonateCommand,
        handleDonateDevCommand,
        handleDonateCommunityManageCommand
    };
}

module.exports = { createDonateHandlers };
