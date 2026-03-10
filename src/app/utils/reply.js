const { buildThreadedOptions } = require('./telegram');
const { retryTelegramCall } = require('../../utils/retry');

function createReplyHelpers(bot) {
    if (!bot) {
        throw new Error('createReplyHelpers requires a Telegram bot instance');
    }

    function sendMessageRespectingThread(chatId, sourceMessage, text, options = {}) {
        const messageOptions = buildThreadedOptions(sourceMessage, { ...options });
        return retryTelegramCall(
            () => bot.sendMessage(chatId, text, messageOptions),
            { maxRetries: 3, label: 'sendMessage' }
        );
    }

    function sendReply(sourceMessage, text, options = {}) {
        if (!sourceMessage || !sourceMessage.chat) {
            throw new Error('sendReply requires a message with chat information');
        }
        const targetChatId = sourceMessage.ownerRedirectId || sourceMessage.chat.id;
        return sendMessageRespectingThread(targetChatId, sourceMessage, text, options);
    }

    return {
        sendMessageRespectingThread,
        sendReply
    };
}

module.exports = { createReplyHelpers };
