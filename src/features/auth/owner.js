const { OWNER_PASSWORD, BOT_OWNER_ID, defaultLang, ADDITIONAL_OWNER_USERNAME, coOwnerIds } = require('../../config');
const db = require('../../../db.js');
const bot = require('../../core/bot');
const { t_ } = require('../../../i18n');

const ownerPasswordPrompts = new Map();
const ownerPasswordAttempts = new Map();

function t(lang_code, key, variables = {}) {
    return t_(lang_code, key, variables);
}

function isOwner(userId, username) {
    if (!userId) {
        return false;
    }

    if (BOT_OWNER_ID && userId.toString() === BOT_OWNER_ID) {
        return true;
    }

    if (username && username.toLowerCase() === ADDITIONAL_OWNER_USERNAME) {
        return true;
    }

    return coOwnerIds.has(userId.toString());
}

function hasOwnerOverride(msg) {
    const executorId = msg?.ownerExecutorId;
    if (!executorId) {
        return false;
    }
    return isOwner(executorId.toString(), msg?.ownerExecutorUsername);
}

async function registerCoOwner(userId, fromInfo = {}, addedBy = null) {
    if (!userId) {
        return;
    }

    const fullName = [fromInfo.first_name, fromInfo.last_name].filter(Boolean).join(' ') || fromInfo.fullName;
    const payload = {
        username: fromInfo.username,
        fullName: fullName || null,
        addedBy: addedBy || BOT_OWNER_ID || null
    };

    try {
        await db.addCoOwner(userId, payload);
    } catch (error) {
        console.error(`[Owner] Failed to persist co-owner ${userId}: ${error.message}`);
    }

    // This was not in the original code, but it seems logical to add the new co-owner to the in-memory set
    coOwnerIds.add(userId.toString()); 
}

function resetOwnerPasswordAttempts(userId) {
    if (!userId) {
        return;
    }
    ownerPasswordAttempts.delete(userId.toString());
}

function verifyOwner(session, password) {
    if (!session || !ownerPasswordPrompts.has(session)) {
        return { error: 'Invalid or expired session' };
    }
    if (password !== OWNER_PASSWORD) {
        return { error: 'Incorrect password' };
    }

    const { userId, fromInfo } = ownerPasswordPrompts.get(session);
    registerCoOwner(userId, fromInfo, BOT_OWNER_ID);
    ownerPasswordPrompts.delete(session);
    resetOwnerPasswordAttempts(userId);

    const lang = fromInfo.language_code || defaultLang;
    bot.sendMessage(userId, t(lang, 'owner_password_success'));

    return { success: true };
}

module.exports = {
    verifyOwner,
    ownerPasswordPrompts,
    isOwner,
    hasOwnerOverride
}
