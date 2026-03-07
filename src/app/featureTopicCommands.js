function registerFeatureTopicCommands({ bot, enforceBanForMessage, featureTopics }) {
    if (!bot || !featureTopics) {
        throw new Error('featureTopics dependencies missing');
    }

    bot.onText(/^\/checkinv(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await featureTopics.handleCommand(msg, 'checkin', 'add');
    });

    bot.onText(/^\/checkinx(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await featureTopics.handleCommand(msg, 'checkin', 'remove');
    });

    bot.onText(/^\/welcomev(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await featureTopics.handleCommand(msg, 'welcome', 'add');
    });

    bot.onText(/^\/welcomex(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await featureTopics.handleCommand(msg, 'welcome', 'remove');
    });
}

module.exports = registerFeatureTopicCommands;
