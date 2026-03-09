const { ownerId } = require('../../../config');
const logger = require('../../core/logger');
const log = logger.child('Utils');
const { getBot } = require('../../core/bot');
const { getDeviceDetails } = require('../../utils/device');
const { enforceBanForMessage } = require('./enforceBan');

function isOwner(userId) {
    return userId.toString() === ownerId;
}

async function handleNewMember(msg) {
    const bot = getBot();
    const chatId = msg.chat.id;
    const newUser = msg.new_chat_member;

    const deviceDetails = await getDeviceDetails(newUser.id);
    if (deviceDetails.isBot) {
        await enforceBanForMessage({ ...msg, from: newUser });
        log.info(`Banned a bot: ${newUser.first_name} (ID: ${newUser.id})`);
    } else {
        const welcomeMessage = `Welcome, ${newUser.first_name}!`;
        bot.sendMessage(chatId, welcomeMessage);
    }
}

module.exports = {
    isOwner,
    handleNewMember,
};