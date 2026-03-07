function createTelegramDebugHelpers({
    detectTelegramMessageType,
    collectTelegramFileIds,
    sendMessageRespectingThread,
    t,
    defaultLang,
    escapeHtml
}) {
    function sanitizeTelegramMessage(message) {
        try {
            return JSON.parse(JSON.stringify(message, (key, value) => {
                if (value === undefined) {
                    return undefined;
                }
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                return value;
            }));
        } catch (error) {
            console.warn(`[IdTelegram] Failed to sanitize message: ${error.message}`);
            return { error: 'sanitize_failed' };
        }
    }

    function buildIdTelegramPayload(message) {
        const type = detectTelegramMessageType(message);
        const file_ids = collectTelegramFileIds(message);

        return {
            type,
            file_ids,
            message: sanitizeTelegramMessage(message)
        };
    }

    async function sendIdTelegramDetails(targetMessage, replyContext, lang) {
        if (!targetMessage || !replyContext) {
            return null;
        }

        const payload = buildIdTelegramPayload(targetMessage);
        const text = t(lang || defaultLang, 'idtelegram_result_header', { type: payload.type || 'message' });
        const serialized = JSON.stringify(payload, null, 2);
        const body = `${text}\n<pre>${escapeHtml(serialized)}</pre>`;

        return sendMessageRespectingThread(replyContext.chat.id, replyContext, body, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    }

    function buildUserMention(user) {
        if (!user) {
            return { text: 'user', parseMode: null };
        }

        if (user.username) {
            return { text: `@${user.username}`, parseMode: null };
        }

        const displayName = escapeHtml(user.first_name || user.last_name || 'user');
        return {
            text: `<a href="tg://user?id=${user.id}">${displayName}</a>`,
            parseMode: 'HTML'
        };
    }

    function buildAdminProfileLink(userId, displayName) {
        const safeName = escapeHtml(displayName || userId?.toString() || 'user');
        const safeId = encodeURIComponent(userId?.toString() || '');
        return `<a href="tg://user?id=${safeId}">${safeName}</a>`;
    }

    function buildAdminUserIdLink(userId) {
        const safeIdText = escapeHtml(userId?.toString() || '0');
        const safeId = encodeURIComponent(userId?.toString() || '');
        return `<a href="tg://user?id=${safeId}"><code>${safeIdText}</code></a>`;
    }

    return {
        sanitizeTelegramMessage,
        buildIdTelegramPayload,
        sendIdTelegramDetails,
        buildUserMention,
        buildAdminProfileLink,
        buildAdminUserIdLink
    };
}

module.exports = { createTelegramDebugHelpers };
