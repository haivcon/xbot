function createRmchatHandlers({ t, db, purgeRmchatMessages, rmchatBotMessages, rmchatUserMessages }) {
    async function executeRmchatAction({ chatId, lang, scope }) {
        if (!chatId) {
            return t(lang, 'rmchat_error');
        }

        let botRemoved = 0;
        let userRemoved = 0;
        let dataWiped = false;

        if (scope === 'bot' || scope === 'all') {
            botRemoved = await purgeRmchatMessages(rmchatBotMessages, chatId);
        }

        if (scope === 'user' || scope === 'all') {
            userRemoved = await purgeRmchatMessages(rmchatUserMessages, chatId);
        }

        if (scope === 'all') {
            try {
                await db.wipeChatFootprint(chatId.toString());
                dataWiped = true;
            } catch (error) {
                console.error(`[Rmchat] Failed to wipe data for ${chatId}: ${error.message}`);
            }
        }

        if (botRemoved === 0 && userRemoved === 0 && !dataWiped) {
            return t(lang, 'rmchat_no_messages');
        }

        return t(lang, 'rmchat_result', {
            botCount: botRemoved,
            userCount: userRemoved,
            dataWiped: dataWiped ? t(lang, 'rmchat_data_yes') : t(lang, 'rmchat_data_no')
        });
    }

    return { executeRmchatAction };
}

module.exports = { createRmchatHandlers };
