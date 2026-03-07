async function handleDonateCommand(deps, msg) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        db,
        t,
        buildDonateMessage,
        buildDonateKeyboard,
        sendReply,
        COMMUNITY_WALLET_ADDRESS
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'donate')) {
        return;
    }
    const lang = await getLang(msg);
    const chatId = msg.chat?.id?.toString();
    const groupSettings = chatId ? await db.getGroupBotSettings(chatId) : null;
    const text = buildDonateMessage(lang, { groupSettings, COMMUNITY_WALLET_ADDRESS });
    await sendReply(msg, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildDonateKeyboard(lang)
    });
}

async function handleDonateDevCommand(deps, msg) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        t,
        sendReply,
        buildDonateMessage,
        buildDonateKeyboard
    } = deps;

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

async function handleDonateCommunityManageCommand(deps, msg, payload) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        t,
        db,
        isGroupAdmin,
        COMMUNITY_WALLET_ADDRESS,
        escapeHtml,
        buildCloseKeyboard,
        bot,
        normalizeAddressSafe
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'donatecm')) {
        return;
    }
    const lang = await getLang(msg);
    const chatId = msg.chat?.id?.toString();
    const userId = msg.from?.id;
    const chatType = msg.chat?.type;

    if (!['group', 'supergroup'].includes(chatType)) {
        await bot.sendMessage(msg.chat.id, t(lang, 'donatecm_group_only'), { parse_mode: 'HTML', reply_markup: buildCloseKeyboard(lang) });
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
            [{ text: t(lang, 'donatecm_clear_button'), callback_data: 'donatecm_clear' }],
            [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
        ];
        await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard },
            reply_to_message_id: msg.message_id,
            allow_sending_without_reply: true
        });
        return;
    }

    const [addressRaw, ...noteParts] = args.split(/\s+/);
    const normalized = normalizeAddressSafe(addressRaw);
    if (!normalized) {
        await bot.sendMessage(chatId, t(lang, 'donatecm_invalid_wallet'), {
            parse_mode: 'HTML',
            reply_markup: buildCloseKeyboard(lang)
        });
        return;
    }

    const note = noteParts.join(' ').trim();
    await db.updateGroupBotSettings(chatId, { donation: { address: normalized, note } });
    await bot.sendMessage(chatId, t(lang, 'donatecm_updated', { address: normalized, note: note || t(lang, 'donatecm_default_note') }), {
        parse_mode: 'HTML',
        reply_markup: buildCloseKeyboard(lang)
    });
}

module.exports = {
    handleDonateCommand,
    handleDonateDevCommand,
    handleDonateCommunityManageCommand
};
