const { getBot } = require('../../core/bot');

/**
 * Enforces a ban on a user for a given message.
 * Kicks the user and deletes the message.
 * @param {object} msg The message object from node-telegram-bot-api.
 */
async function enforceBanForMessage(msg) {
    const bot = getBot();
    if (!msg || !msg.chat || !msg.from) {
        console.error('Invalid message object for enforceBanForMessage');
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    await bot.kickChatMember(chatId, userId);
    await bot.deleteMessage(chatId, msg.message_id);
}

module.exports = { enforceBanForMessage };