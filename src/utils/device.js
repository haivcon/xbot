const crypto = require('crypto');
const db = require('../../db.js');
const { DEVICE_TARGET_PREFIX } = require('../config');

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
            console.warn(`[Device] Failed to persist device ${info.deviceId}: ${error.message}`);
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

function buildDeviceTargetId(deviceId) {
    if (!deviceId) {
        return null;
    }
    const normalized = deviceId.toString().trim();
    return normalized ? `${DEVICE_TARGET_PREFIX}${normalized}` : null;
}

module.exports = {
    ensureDeviceInfo,
    buildDeviceTargetId
}