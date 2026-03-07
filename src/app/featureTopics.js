function createFeatureTopicsHandlers({
    t,
    defaultLang,
    resolveGroupLanguage,
    isGroupAdmin,
    sendReply,
    db,
    presentCheckinTopics,
    presentWelcomeTopics,
    bot
}) {
    const normalizeTopicKey = (topicId) => {
        if (topicId === undefined || topicId === null || topicId === 'main' || topicId === '') {
            return null;
        }
        return topicId;
    };

    const formatTopicLabel = (lang, topicId) => {
        return topicId === null ? t(lang, 'price_topic_main') : topicId.toString();
    };

    const handleCommand = async (msg, feature, action) => {
        const chatId = msg.chat?.id;
        const chatType = msg.chat?.type;
        const userId = msg.from?.id;
        const topicId = Object.prototype.hasOwnProperty.call(msg, 'message_thread_id') ? msg.message_thread_id : null;
        if (!chatId || !userId || !['group', 'supergroup'].includes(chatType || '')) {
            return;
        }

        const lang = await resolveGroupLanguage(chatId, defaultLang, topicId);
        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await sendReply(msg, t(lang, 'checkin_admin_error_no_permission'));
            return;
        }

        const topicKey = normalizeTopicKey(topicId);
        const topicLabel = formatTopicLabel(lang, topicKey);

        if (action === 'add') {
            await db.addFeatureTopic(chatId, feature, topicKey);
            const key = feature === 'welcome' ? 'welcome_topic_saved' : 'checkin_topic_saved';
            await sendReply(msg, t(lang, key, { topic: topicLabel }));
        } else {
            const removed = await db.removeFeatureTopic(chatId, feature, topicKey);
            const key = feature === 'welcome'
                ? (removed ? 'welcome_topic_removed' : 'welcome_topic_not_found')
                : (removed ? 'checkin_topic_removed' : 'checkin_topic_not_found');
            await sendReply(msg, t(lang, key, { topic: topicLabel }));
        }
    };

    const handleCallback = async ({ query, callbackLang, chatId }) => {
        const data = query.data || '';
        if (!data.startsWith('feature_topic_')) {
            return false;
        }

        const parts = data.split('|');
        const action = parts[0];
        const featureKey = parts[1];
        const targetChatId = (parts[2] || chatId || '').toString();
        const topicIdRaw = parts[3];
        const topicId = normalizeTopicKey(topicIdRaw);

        if (!featureKey || !targetChatId) {
            await bot.answerCallbackQuery(query.id);
            return true;
        }

        const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
        if (!isAdminUser) {
            const noPermissionKey = featureKey === 'welcome'
                ? 'welcome_admin_no_permission'
                : 'checkin_admin_error_no_permission';
            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, noPermissionKey), show_alert: true });
            return true;
        }

        const label = formatTopicLabel(callbackLang, topicId);

        if (action === 'feature_topic_toggle') {
            const existing = await db.listFeatureTopics(targetChatId, featureKey);
            const normalizedKey = topicId === null ? 'main' : topicId.toString();
            const hasTopic = (existing || []).some((entry) => {
                const entryKey = normalizeTopicKey(entry.topicId);
                const key = entryKey === null ? 'main' : entryKey.toString();
                return key === normalizedKey;
            });

            if (hasTopic) {
                await db.removeFeatureTopic(targetChatId, featureKey, topicId);
                const removedKey = featureKey === 'welcome' ? 'welcome_topic_removed' : 'checkin_topic_removed';
                await bot.answerCallbackQuery(query.id, { text: t(callbackLang, removedKey, { topic: label }) });
            } else {
                await db.addFeatureTopic(targetChatId, featureKey, topicId);
                const savedKey = featureKey === 'welcome' ? 'welcome_topic_saved' : 'checkin_topic_saved';
                await bot.answerCallbackQuery(query.id, { text: t(callbackLang, savedKey, { topic: label }) });
            }
        } else if (action === 'feature_topic_remove') {
            const removed = await db.removeFeatureTopic(targetChatId, featureKey, topicId);
            const removedKey = featureKey === 'welcome' ? 'welcome_topic_removed' : 'checkin_topic_removed';
            const notFoundKey = featureKey === 'welcome' ? 'welcome_topic_not_found' : 'checkin_topic_not_found';
            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, removed ? removedKey : notFoundKey) });
        } else {
            return false;
        }

        if (featureKey === 'checkin') {
            await presentCheckinTopics(query.from.id, targetChatId, { fallbackLang: callbackLang, messageContext: query.message });
        } else if (featureKey === 'welcome') {
            await presentWelcomeTopics(query.from.id, targetChatId, { fallbackLang: callbackLang, messageContext: query.message });
        }

        return true;
    };

    return {
        handleCommand,
        handleCallback
    };
}

module.exports = createFeatureTopicsHandlers;
