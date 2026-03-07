const { v4: uuidv4 } = require('uuid');
const bot = require('../../core/bot');
const { t_ } = require('../../../i18n');
const { handleWalletTokenCallback } = require('../../callbacks/wallet');

// Placeholder function. I will implement this later.
async function displayTopTokens(message, lang) {
    console.log('displayTopTokens called with:', message, lang);
}

const topTokenSessions = new Map();

function t(lang_code, key, variables = {}) {
    return t_(lang_code, key, variables);
}

async function handleTopTokensApi(req, res) {
    const { session: sessionId, action, chain, token } = req.query;
    if (!sessionId || !topTokenSessions.has(sessionId)) {
        return res.status(400).json({ error: 'Invalid or expired session' });
    }

    const session = topTokenSessions.get(sessionId);
    const { chatId, messageId, lang } = session;

    if (action === 'close') {
        topTokenSessions.delete(sessionId);
        await bot.deleteMessage(chatId, messageId).catch(() => {});
        return res.json({ success: true, message: 'Session closed' });
    }

    if (action === 'reload') {
        const message = await bot.sendMessage(chatId, t(lang, 'toptoken_reloading'), {
            reply_to_message_id: messageId
        });
        await bot.deleteMessage(chatId, messageId).catch(() => {});
        await displayTopTokens(message, lang);
        return res.json({ success: true, message: 'Reloading' });
    }

    if (action === 'view' && chain && token) {
        const callbackQuery = {
            id: uuidv4(),
            from: { id: session.userId, language_code: lang },
            message: { chat: { id: chatId }, message_id: messageId },
            data: `wallet|token|${chain}|${token}`
        };
        await handleWalletTokenCallback(callbackQuery);
        return res.json({ success: true, message: 'Viewing token' });
    }

    res.status(400).json({ error: 'Invalid action' });
}

module.exports = {
    handleTopTokensApi,
    topTokenSessions
}