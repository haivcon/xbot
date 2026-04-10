const crypto = require('crypto');
const logger = require('../core/logger');
const log = logger.child('Access');
const db = require('../../db.js');
const { t } = require('../core/i18n');
const { escapeHtml } = require('../utils/text');
const { formatCopyableValueHtml } = require('./utils/markdown');
const {
    BOT_OWNER_ID,
    ADDITIONAL_OWNER_USERNAME,
    DEVICE_TARGET_PREFIX,
    defaultLang,
    OWNER_COMMAND_LIMIT_KEY,
    DOREMON_COMMAND_LIMIT_KEY,
    ownerPasswordMaxAttempts
} = require('../config/env');
const {
    coOwnerIds,
    bannedUserIds,
    bannedDeviceIds,
    ownerPasswordAttempts,
    ownerPasswordPrompts,
    ownerActionStates
} = require('../core/state');

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

async function hydrateCoOwners() {
    try {
        const rows = await db.listCoOwners();
        coOwnerIds.clear();
        for (const row of rows || []) {
            if (row?.userId) {
                coOwnerIds.add(row.userId.toString());
            }
        }
    } catch (error) {
        log.child('Owner').error(`Failed to hydrate co-owners: ${error.message}`);
    }
}

async function hydrateBannedUsers() {
    try {
        const rows = await db.listBannedUsers();
        bannedUserIds.clear();
        for (const row of rows || []) {
            if (row?.userId) {
                bannedUserIds.add(row.userId.toString());
            }
        }
    } catch (error) {
        log.child('Ban').error(`Failed to hydrate banned users: ${error.message}`);
    }
}

async function hydrateBannedDevices() {
    try {
        const rows = await db.listBannedDevices();
        bannedDeviceIds.clear();
        for (const row of rows || []) {
            if (row?.deviceId) {
                bannedDeviceIds.add(row.deviceId.toString());
            }
        }
    } catch (error) {
        log.child('Ban').error(`Failed to hydrate banned devices: ${error.message}`);
    }
}

function buildDeviceTargetId(deviceId) {
    if (!deviceId) {
        return null;
    }
    const normalized = deviceId.toString().trim();
    return normalized ? `${DEVICE_TARGET_PREFIX}${normalized}` : null;
}

function isDeviceTarget(targetId) {
    return typeof targetId === 'string' && targetId.startsWith(DEVICE_TARGET_PREFIX);
}

function parseDevicePayload(raw) {
    if (!raw || typeof raw !== 'string') {
        return null;
    }

    const attempts = [];

    attempts.push(raw);

    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        if (decoded && decoded !== raw) {
            attempts.push(decoded);
        }
    } catch (error) {
        // ignore
    }

    try {
        const decodedUri = decodeURIComponent(raw);
        if (decodedUri && decodedUri !== raw) {
            attempts.push(decodedUri);
        }
    } catch (error) {
        // ignore
    }

    for (const candidate of attempts) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (error) {
            continue;
        }
    }

    return null;
}

function extractTelegramDeviceInfo(update) {
    const source = update?.message || update;
    const from = update?.from || source?.from || null;
    const rawPayload = source?.web_app_data?.data || null;
    const payload = parseDevicePayload(rawPayload);

    const platform = payload?.platform || payload?.os || payload?.osName || payload?.system || null;
    const model = payload?.model || payload?.deviceModel || payload?.device || null;
    const clientId = payload?.clientId || payload?.client_id || null;

    let deviceId = payload?.deviceId || payload?.device_id || clientId || null;
    if (!deviceId && (platform || model) && from?.id) {
        deviceId = crypto.createHash('sha256')
            .update([from.id, platform || '', model || '', clientId || ''].join('|'))
            .digest('hex');
    }

    if (!deviceId && from?.id) {
        deviceId = `unknown-${from.id}`;
    }

    return {
        deviceId: deviceId || null,
        clientId: null,
        platform: null,
        deviceType: null,
        osVersion: null,
        appVersion: null,
        model: null,
        serial: null,
        isMobile: null,
        rawInfo: null
    };
}

async function recordDeviceInfo(update) {
    if (!update) {
        return null;
    }

    const info = extractTelegramDeviceInfo(update);
    if (info?.deviceId && update?.from?.id) {
        try {
            await db.upsertUserDevice(update.from.id, info);
        } catch (error) {
            log.child('Device').warn(`Failed to persist device ${info.deviceId}: ${error.message}`);
        }
    }

    if (update) {
        update.__deviceInfo = info;
    }

    return info;
}

async function ensureDeviceInfo(update) {
    if (!update) {
        return null;
    }
    if (update.__deviceInfo) {
        return update.__deviceInfo;
    }
    return recordDeviceInfo(update);
}

async function loadDevicesForUsers(userIds = []) {
    const unique = Array.from(new Set((userIds || []).map((id) => id?.toString()).filter(Boolean)));
    const result = new Map();

    for (const id of unique) {
        try {
            const devices = await db.listUserDevices(id);
            result.set(id, devices || []);
        } catch (error) {
            log.child('Device').warn(`Failed to load devices for ${id}: ${error.message}`);
            result.set(id, []);
        }
    }

    return result;
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
        log.child('Owner').error(`Failed to persist co-owner ${userId}: ${error.message}`);
    }

    coOwnerIds.add(userId.toString());
}

async function revokeCoOwner(userId) {
    if (!userId) {
        return;
    }
    try {
        await db.removeCoOwner(userId);
        coOwnerIds.delete(userId.toString());
    } catch (error) {
        log.child('Owner').error(`Failed to revoke co-owner ${userId}: ${error.message}`);
    }
}

async function banUser(userId, fromInfo = {}, addedBy = null, deviceInfo = null) {
    if (!userId || isOwner(userId, fromInfo?.username)) {
        return;
    }
    const fullName = [fromInfo.first_name, fromInfo.last_name].filter(Boolean).join(' ') || fromInfo.fullName;
    try {
        await db.addBannedUser(userId, {
            username: fromInfo.username,
            fullName: fullName || null,
            addedBy: addedBy || null
        });
        bannedUserIds.add(userId.toString());

        const deviceCandidates = [];
        if (deviceInfo?.deviceId) {
            deviceCandidates.push(deviceInfo);
        }

        try {
            const knownDevices = await db.listUserDevices(userId);
            for (const device of knownDevices || []) {
                deviceCandidates.push(device);
            }
        } catch (error) {
            log.child('Ban').warn(`Unable to load devices for user ${userId}: ${error.message}`);
        }

        for (const device of deviceCandidates) {
            if (!device?.deviceId) {
                continue;
            }
            try {
                await db.addBannedDevice(device.deviceId, {
                    userId: userId.toString(),
                    addedBy: addedBy || null
                });
                bannedDeviceIds.add(device.deviceId.toString());
            } catch (error) {
                log.child('Ban').warn(`Failed to ban device ${device.deviceId}: ${error.message}`);
            }
        }
    } catch (error) {
        log.child('Ban').error(`Failed to ban user ${userId}: ${error.message}`);
    }
}

async function unbanUser(userId) {
    if (!userId) {
        return;
    }
    try {
        await db.removeBannedUser(userId);
        bannedUserIds.delete(userId.toString());

        try {
            const knownDevices = await db.listUserDevices(userId);
            for (const device of knownDevices || []) {
                if (!device?.deviceId) {
                    continue;
                }
                await db.removeBannedDevice(device.deviceId);
                bannedDeviceIds.delete(device.deviceId.toString());
            }
        } catch (error) {
            log.child('Ban').warn(`Unable to unban devices for user ${userId}: ${error.message}`);
        }
    } catch (error) {
        log.child('Ban').error(`Failed to unban user ${userId}: ${error.message}`);
    }
}

function buildBanNotice(lang, userInfo = {}) {
    const fullName = [userInfo.first_name, userInfo.last_name, userInfo.fullName]
        .filter(Boolean)
        .join(' ') || userInfo.name || t(lang, 'owner_user_unknown');
    const username = userInfo.username ? `@${escapeHtml(userInfo.username)}` : t(lang, 'owner_banned_unknown_username');
    const idLabel = formatCopyableValueHtml(userInfo.id || userInfo.userId || userInfo.chatId) || escapeHtml(userInfo.id || userInfo.userId || userInfo.chatId || '');

    return t(lang, 'owner_banned_notice', {
        fullName: escapeHtml(fullName),
        telegramId: idLabel,
        username,
        contact: 'x.com/haivcon_X'
    });
}

module.exports = {
    isOwner,
    hasOwnerOverride,
    hydrateCoOwners,
    hydrateBannedUsers,
    hydrateBannedDevices,
    buildDeviceTargetId,
    isDeviceTarget,
    parseDevicePayload,
    extractTelegramDeviceInfo,
    recordDeviceInfo,
    ensureDeviceInfo,
    loadDevicesForUsers,
    registerCoOwner,
    revokeCoOwner,
    banUser,
    unbanUser,
    buildBanNotice
};

function createAccessControlHandlers({
    bot,
    getLang,
    sendReply,
    buildCloseKeyboard,
    resolveNotificationLanguage
}) {
    async function enforceBanForMessage(msg) {
        const userId = msg?.from?.id?.toString();
        if (!userId || isOwner(userId, msg.from?.username) || hasOwnerOverride(msg)) {
            return false;
        }

        if (msg.__banHandled) {
            return true;
        }

        const deviceInfo = await ensureDeviceInfo(msg);
        const deviceId = deviceInfo?.deviceId;

        const isBanned = bannedUserIds.has(userId) || await db.isUserBanned(userId);
        const isDeviceBanned = deviceId && (bannedDeviceIds.has(deviceId) || await db.isDeviceBanned(deviceId));
        if (!isBanned && !isDeviceBanned) {
            return false;
        }

        bannedUserIds.add(userId);
        if (deviceId) {
            bannedDeviceIds.add(deviceId);
        }
        const lang = await getLang(msg);
        const notice = buildBanNotice(lang, {
            id: userId,
            username: msg.from?.username,
            first_name: msg.from?.first_name,
            last_name: msg.from?.last_name,
            fullName: msg.from ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() : ''
        });
        await sendReply(msg, notice, { reply_markup: buildCloseKeyboard(lang), parse_mode: 'HTML' });
        msg.__banHandled = true;
        return true;
    }

    async function enforceBanForCallback(query, langHint) {
        const userId = query?.from?.id?.toString();
        if (!userId || isOwner(userId, query.from?.username)) {
            return false;
        }

        const deviceInfo = await ensureDeviceInfo(query);
        const deviceId = deviceInfo?.deviceId;

        const isBanned = bannedUserIds.has(userId) || await db.isUserBanned(userId);
        const isDeviceBanned = deviceId && (bannedDeviceIds.has(deviceId) || await db.isDeviceBanned(deviceId));
        if (!isBanned && !isDeviceBanned) {
            return false;
        }

        bannedUserIds.add(userId);
        if (deviceId) {
            bannedDeviceIds.add(deviceId);
        }
        const lang = langHint || (query.message ? await getLang(query.message) : await resolveNotificationLanguage(userId, defaultLang));
        const notice = buildBanNotice(lang, {
            id: userId,
            username: query.from?.username,
            first_name: query.from?.first_name,
            last_name: query.from?.last_name,
            fullName: query.from ? `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim() : ''
        });

        try {
            await bot.answerCallbackQuery(query.id, { text: notice, show_alert: true });
        } catch (error) {
            // ignored, stale callbacks handled elsewhere
        }

        if (query.message?.chat?.id) {
            try {
                await sendReply(query.message, notice, { reply_markup: buildCloseKeyboard(lang), parse_mode: 'HTML' });
            } catch (error) {
                // ignore reply errors for banned users
            }
        }

        return true;
    }

    function resetOwnerPasswordAttempts(userId) {
        if (!userId) {
            return;
        }
        ownerPasswordAttempts.delete(userId.toString());
    }

    async function recordOwnerPasswordFailure(msg, lang) {
        const userId = msg?.from?.id?.toString();
        if (!userId || isOwner(userId, msg.from?.username)) {
            return false;
        }

        const next = (ownerPasswordAttempts.get(userId) || 0) + 1;
        ownerPasswordAttempts.set(userId, next);

        if (next > ownerPasswordMaxAttempts) {
            const deviceInfo = msg?.__deviceInfo || await ensureDeviceInfo(msg);
            await banUser(userId, msg.from, msg.from?.id?.toString(), deviceInfo);
            await sendReply(msg, t(lang, 'owner_password_banned'), { reply_markup: buildCloseKeyboard(lang) });
            ownerPasswordPrompts.delete(userId);
            return true;
        }

        return false;
    }

    function clearOwnerAction(userId) {
        if (!userId) {
            return;
        }
        ownerActionStates.delete(userId.toString());
    }

    async function enforceOwnerCommandLimit(msg, commandKey) {
        const userId = msg?.from?.id?.toString();
        const username = msg?.from?.username || '';

        if (!userId || isOwner(userId, username) || hasOwnerOverride(msg)) {
            return false;
        }

        const lang = await getLang(msg);
        const today = new Date().toISOString().slice(0, 10);
        const deviceInfo = await ensureDeviceInfo(msg);
        const deviceTargetId = buildDeviceTargetId(deviceInfo?.deviceId);
        const userLimit = await db.getCommandLimit(OWNER_COMMAND_LIMIT_KEY, userId);
        const deviceLimit = deviceTargetId ? await db.getCommandLimit(OWNER_COMMAND_LIMIT_KEY, deviceTargetId) : null;
        const globalLimit = await db.getCommandLimit(OWNER_COMMAND_LIMIT_KEY, null);
        const limitEntries = [
            { target: userId, limit: userLimit },
            { target: deviceTargetId, limit: deviceLimit },
            { target: userId, limit: globalLimit }
        ].filter((entry) => entry.target && Number.isFinite(entry.limit) && entry.limit > 0);

        if (limitEntries.length) {
            const effectiveLimit = Math.min(...limitEntries.map((entry) => entry.limit));
            for (const entry of limitEntries) {
                const current = await db.getCommandUsageCount(OWNER_COMMAND_LIMIT_KEY, entry.target, today);
                if (current >= entry.limit) {
                    await sendReply(msg, t(lang, 'owner_command_limit_reached', { limit: effectiveLimit }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                    return true;
                }
            }
        }

        const usageTargets = new Set([userId, deviceTargetId].filter(Boolean));
        for (const target of usageTargets) {
            await db.incrementCommandUsage(OWNER_COMMAND_LIMIT_KEY, target, today);
            if (commandKey) {
                await db.incrementCommandUsage(commandKey, target, today);
            }
        }

        if (commandKey && msg?.chat?.id) {
            await db.incrementGroupCommandUsage(commandKey, msg.chat.id.toString(), today);
        }

        return false;
    }

    async function enforceDoremonLimit(msg, langOverride = null) {
        const userId = msg?.from?.id?.toString();
        const chatId = msg?.chat?.id;

        if (!userId || !chatId) {
            return false;
        }

        const lang = langOverride || (await getLang(msg));
        const today = new Date().toISOString().slice(0, 10);
        const userLimit = await db.getCommandLimit(DOREMON_COMMAND_LIMIT_KEY, userId);
        const globalLimit = await db.getCommandLimit(DOREMON_COMMAND_LIMIT_KEY, null);
        const limitValue = Number.isFinite(userLimit) ? userLimit : globalLimit;

        if (!Number.isFinite(limitValue) || limitValue <= 0) {
            await db.incrementCommandUsage(DOREMON_COMMAND_LIMIT_KEY, userId, today);
            return false;
        }

        const current = await db.getCommandUsageCount(DOREMON_COMMAND_LIMIT_KEY, userId, today);
        if (current >= limitValue) {
            await bot.sendMessage(chatId, t(lang, 'random_fortune_limit_reached', { limit: limitValue }), {
                reply_markup: buildCloseKeyboard(lang)
            });
            return true;
        }

        await db.incrementCommandUsage(DOREMON_COMMAND_LIMIT_KEY, userId, today);
        return false;
    }

    return {
        enforceBanForMessage,
        enforceBanForCallback,
        resetOwnerPasswordAttempts,
        recordOwnerPasswordFailure,
        clearOwnerAction,
        enforceOwnerCommandLimit,
        enforceDoremonLimit
    };
}

module.exports.createAccessControlHandlers = createAccessControlHandlers;
