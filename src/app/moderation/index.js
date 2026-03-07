const db = require('../../../db.js');
const { bot } = require('../../core/bot');
const {
    groupAdminSettings,
    adminChatIndex,
    warnHistory,
    filterConfigs,
    filterCacheHydrated,
    muteTimers
} = require('../../core/state');
const {
    WELCOME_VERIFICATION_DEFAULTS,
    WELCOME_ENFORCEMENT_ACTIONS,
    sanitizeWeightValue
} = require('../../features/checkin/constants');

function getGroupSettings(chatId) {
    const key = chatId.toString();
    if (!groupAdminSettings.has(key)) {
        groupAdminSettings.set(key, {
            welcomeMessage: null,
            welcomeAutoDeleteSeconds: 0,
            warnLimit: 3,
            warnAction: 'ban',
            linkLock: { enabled: false, action: 'warn', allowlist: new Set() },
            fileLocks: { photos: false, videos: false, stickers: false, documents: false },
            flood: { enabled: false, limit: 5, windowSeconds: 10, action: 'mute' },
            rulesText: '',
            bannedUsers: new Set(),
            muteAll: false
        });
    }
    return groupAdminSettings.get(key);
}

async function getWelcomeVerificationSettings(chatId) {
    const botSettings = await db.getGroupBotSettings(chatId.toString());
    const saved = botSettings?.welcomeVerification || {};
    const merged = {
        ...WELCOME_VERIFICATION_DEFAULTS,
        ...saved
    };

    const weights = {
        mathWeight: sanitizeWeightValue(merged.mathWeight, WELCOME_VERIFICATION_DEFAULTS.mathWeight),
        physicsWeight: sanitizeWeightValue(merged.physicsWeight, WELCOME_VERIFICATION_DEFAULTS.physicsWeight),
        chemistryWeight: sanitizeWeightValue(merged.chemistryWeight, WELCOME_VERIFICATION_DEFAULTS.chemistryWeight),
        okxWeight: sanitizeWeightValue(merged.okxWeight, WELCOME_VERIFICATION_DEFAULTS.okxWeight),
        cryptoWeight: sanitizeWeightValue(merged.cryptoWeight, WELCOME_VERIFICATION_DEFAULTS.cryptoWeight)
    };

    const action = WELCOME_ENFORCEMENT_ACTIONS.includes(merged.action)
        ? merged.action
        : WELCOME_VERIFICATION_DEFAULTS.action;

    return {
        ...merged,
        ...weights,
        action,
        titleTemplate: typeof merged.titleTemplate === 'string' ? merged.titleTemplate : '',
        enabled: Boolean(merged.enabled),
        timeLimitSeconds: Number.isFinite(Number(merged.timeLimitSeconds))
            ? Math.max(5, Math.round(Number(merged.timeLimitSeconds)))
            : WELCOME_VERIFICATION_DEFAULTS.timeLimitSeconds,
        maxAttempts: Number.isFinite(Number(merged.maxAttempts))
            ? Math.max(1, Math.round(Number(merged.maxAttempts)))
            : WELCOME_VERIFICATION_DEFAULTS.maxAttempts
    };
}

async function saveWelcomeVerificationSettings(chatId, updates = {}) {
    const current = await getWelcomeVerificationSettings(chatId);
    const next = { ...current, ...updates };
    await db.updateGroupBotSettings(chatId, { welcomeVerification: next });
    return next;
}

function rememberAdminChat(userId, chat) {
    if (!userId || !chat?.id || ['group', 'supergroup'].indexOf(chat.type) === -1) {
        return;
    }

    const existing = adminChatIndex.get(userId) || new Map();
    const label = chat.title || chat.username || chat.id.toString();
    existing.set(chat.id.toString(), { title: label, type: chat.type });
    adminChatIndex.set(userId, existing);
}

function getWarnState(chatId) {
    const key = chatId.toString();
    if (!warnHistory.has(key)) {
        warnHistory.set(key, new Map());
    }
    return warnHistory.get(key);
}

function getFilterState(chatId) {
    const key = chatId.toString();
    if (!filterConfigs.has(key)) {
        filterConfigs.set(key, new Map());
    }
    return filterConfigs.get(key);
}

async function ensureFilterState(chatId) {
    const key = chatId.toString();
    if (filterCacheHydrated.has(key)) {
        return getFilterState(chatId);
    }

    try {
        const rows = await db.listFilters(key);
        const state = getFilterState(key);
        state.clear();
        for (const row of rows || []) {
            if (!row.keyword) {
                continue;
            }
            state.set(row.keyword.toLowerCase(), {
                text: row.responseText || '',
                entities: Array.isArray(row.entities) ? row.entities : []
            });
        }
    } catch (error) {
        console.error(`[Filters] Failed to hydrate filters for ${key}: ${error.message}`);
    }

    filterCacheHydrated.add(key);
    return getFilterState(key);
}

function stripFilterPrefix(text, keyword) {
    if (!text || typeof text !== 'string' || !keyword) {
        return text;
    }
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^\\s*\\/filter(?:@[\\w_]+)?\\s+${escaped}\\b\\s*`, 'i');
    const cleaned = text.replace(pattern, '').replace(/^\\s+/, '');
    return cleaned || text.trim();
}

function normalizeFilterResponse(raw, keyword) {
    if (typeof raw !== 'string') {
        return raw;
    }
    const stripped = stripFilterPrefix(raw, keyword);
    return stripped || raw;
}

async function isGroupAdmin(chatId, userId) {
    try {
        const p = bot.getChatMember(chatId, userId);
        p.catch(() => {}); // suppress request-promise duplicate rejection
        const member = await p;
        if (!member) {
            return false;
        }
        return ['creator', 'administrator'].includes(member.status);
    } catch (error) {
        console.warn(`[Checkin] Kh�ng th? ki?m tra quy?n admin c?a ${userId} trong ${chatId}: ${error.message}`);
        return false;
    }
}

async function isGroupAdminFlexible(chatId, userId) {
    let isAdmin = await isGroupAdmin(chatId, userId);
    if (isAdmin) {
        return true;
    }

    try {
        const p = bot.getChatAdministrators(chatId);
        p.catch(() => {}); // suppress request-promise duplicate rejection
        const admins = await p;
        return Array.isArray(admins)
            ? admins.some((admin) => admin?.user?.id?.toString() === userId?.toString())
            : false;
    } catch (error) {
        console.warn(`[Checkin] Fallback admin lookup failed for ${userId} in ${chatId}: ${error.message}`);
        return false;
    }
}

async function isUserAdmin(chatId, userId) {
    return isGroupAdminFlexible(chatId, userId);
}

function parseDuration(text) {
    if (!text || typeof text !== 'string') {
        return 600;
    }

    const trimmed = text.trim();
    const match = trimmed.match(/^(\\d+)([smhd])?$/i);
    if (!match) {
        return 600;
    }

    const value = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();

    if (!Number.isFinite(value) || value <= 0) {
        return 600;
    }

    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] || 1);
}

function buildMuteKey(chatId, userId) {
    return `${chatId}:${userId}`;
}

function clearScheduledUnmute(chatId, userId) {
    const key = buildMuteKey(chatId, userId);
    const existing = muteTimers.get(key);
    if (existing) {
        clearTimeout(existing);
        muteTimers.delete(key);
    }
}

function scheduleAutomaticUnmute(chatId, userId, seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return;
    }
    const key = buildMuteKey(chatId, userId);
    clearScheduledUnmute(chatId, userId);

    const handle = setTimeout(() => {
        bot.restrictChatMember(chatId, userId, { permissions: { can_send_messages: true } }).catch(() => { });
        muteTimers.delete(key);
    }, seconds * 1000);

    if (typeof handle.unref === 'function') {
        handle.unref();
    }

    muteTimers.set(key, handle);
}

function parseTargetFromCommand(msg, text) {
    const chatId = msg.chat?.id;
    if (!chatId) {
        return null;
    }

    if (msg.reply_to_message?.from?.id) {
        return { id: msg.reply_to_message.from.id, name: msg.reply_to_message.from.first_name || '' };
    }

    const parts = text.split(/\\s+/).filter(Boolean);
    if (parts.length < 2) {
        return null;
    }

    const target = parts[1];
    if (target.startsWith('@')) {
        return { username: target.substring(1) };
    }

    const numeric = Number(target);
    if (Number.isFinite(numeric)) {
        return { id: numeric };
    }

    return null;
}

async function resolveTargetId(chatId, target) {
    if (!target) {
        return null;
    }
    if (target.id) {
        return target.id;
    }
    if (target.username) {
        try {
            const member = await bot.getChatMember(chatId, target.username);
            return member?.user?.id || null;
        } catch (error) {
            return null;
        }
    }
    return null;
}

async function resolveUserProfile(chatId, userId) {
    try {
        const member = await bot.getChatMember(chatId, userId);
        return member?.user || null;
    } catch (error) {
        return null;
    }
}

async function applyWarnAction(chatId, userId, action) {
    const until = Math.floor(Date.now() / 1000) + 3600;
    switch (action) {
        case 'ban':
            await bot.banChatMember(chatId, userId, { revoke_messages: true });
            break;
        case 'kick':
            await bot.banChatMember(chatId, userId, { until_date: Math.floor(Date.now() / 1000) + 60 });
            await bot.unbanChatMember(chatId, userId, { only_if_banned: true });
            break;
        case 'mute':
            await bot.restrictChatMember(chatId, userId, { until_date: until, permissions: { can_send_messages: false } });
            break;
        default:
            break;
    }
}

module.exports = {
    getGroupSettings,
    getWelcomeVerificationSettings,
    saveWelcomeVerificationSettings,
    rememberAdminChat,
    getWarnState,
    getFilterState,
    ensureFilterState,
    stripFilterPrefix,
    normalizeFilterResponse,
    isUserAdmin,
    isGroupAdmin,
    isGroupAdminFlexible,
    parseDuration,
    buildMuteKey,
    clearScheduledUnmute,
    scheduleAutomaticUnmute,
    parseTargetFromCommand,
    resolveTargetId,
    resolveUserProfile,
    applyWarnAction
};
