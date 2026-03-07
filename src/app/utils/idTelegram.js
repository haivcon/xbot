function createIdTelegramHandler({
    bot,
    getLang,
    collectTelegramFileIds,
    sendIdTelegramDetails,
    idTelegramSessions,
    t,
    sendReply
}) {
    if (!bot || !getLang || !t || !sendReply || !collectTelegramFileIds || !sendIdTelegramDetails || !idTelegramSessions) {
        throw new Error('Missing dependencies for createIdTelegramHandler');
    }

    return async function handleIdTelegramCommand(msg, langOverride = null) {
        const lang = langOverride || (await getLang(msg));
        const userId = msg.from?.id?.toString() || null;
        const senderChatId = msg.sender_chat?.id?.toString() || null;
        const sessionKey = userId || (senderChatId ? `chat:${senderChatId}` : null);
        const chatId = msg.chat?.id;
        const chatIdStr = chatId ? chatId.toString() : null;
        const targetMessage = msg.reply_to_message || (collectTelegramFileIds(msg).length > 0 ? msg : null);

        if (targetMessage) {
            try {
                await sendIdTelegramDetails(targetMessage, msg, lang);
            } catch (error) {
                console.error(`[IdTelegram] Failed to send details: ${error.message}`);
            }
            return { status: 'details_sent' };
        }

        if (!sessionKey || !chatIdStr) {
            return { status: 'skipped' };
        }

        const existing = idTelegramSessions.get(sessionKey);
        if (existing?.promptMessageId && existing.chatId === chatIdStr) {
            try {
                await bot.deleteMessage(chatId, existing.promptMessageId);
            } catch (error) {
                // ignore cleanup errors
            }
        }

        const prompt = await sendReply(msg, t(lang, 'idtelegram_prompt'));
        idTelegramSessions.set(sessionKey, {
            chatId: chatIdStr,
            promptMessageId: prompt?.message_id || null,
            lang
        });

        return { status: 'prompt_sent' };
    };
}

module.exports = createIdTelegramHandler;
