function registerAdminCommands({
    bot,
    enforceBanForMessage,
    handleAdminCommand,
    launchWelcomeAdminFlow,
    getLang,
    sendReply,
    t
}) {
    if (!bot || !enforceBanForMessage || !handleAdminCommand || !launchWelcomeAdminFlow || !getLang || !sendReply || !t) {
        throw new Error('Missing dependencies for admin commands');
    }

    bot.onText(/^\/checkinadmin(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleAdminCommand(msg);
    });

    bot.onText(/^\/welcomeadmin(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const chatType = msg.chat?.type;
        const lang = await getLang(msg);
        const result = await launchWelcomeAdminFlow({
            actorId: msg.from?.id,
            chatId: msg.chat?.id,
            chatType,
            lang,
            replyMessage: msg
        });

        if (result.status === 'invalid_chat') {
            await sendReply(msg, t(lang, 'welcome_admin_group_only'));
            return;
        }
        if (result.status === 'forbidden') {
            await sendReply(msg, t(lang, 'welcome_admin_no_permission'));
            return;
        }
        if (result.status === 'error') {
            await sendReply(msg, t(lang, 'welcome_admin_dm_error'));
            return;
        }
        if (result.status === 'dm_opened' && chatType === 'private') {
            await sendReply(msg, t(lang, 'welcome_admin_menu_opening'));
        }
    });
}

module.exports = registerAdminCommands;
