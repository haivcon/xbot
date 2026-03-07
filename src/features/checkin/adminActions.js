function createCheckinAdminActions({
    resolveNotificationLanguage,
    sanitizeWeightValue,
    db,
    t,
    showQuestionWeightMenu,
    sendEphemeralMessage
}) {
    async function setAdminQuestionWeights(chatId, adminId, weights, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const sanitized = {
            mathWeight: sanitizeWeightValue(weights.math, 0),
            physicsWeight: sanitizeWeightValue(weights.physics, 0),
            chemistryWeight: sanitizeWeightValue(weights.chemistry, 0),
            okxWeight: sanitizeWeightValue(weights.okx, 0),
            cryptoWeight: sanitizeWeightValue(weights.crypto, 0)
        };
        const total = Object.values(sanitized).reduce((sum, value) => sum + (Number(value) || 0), 0);
        if (total <= 0) {
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_weights_invalid'));
            return;
        }

        await db.updateCheckinGroup(chatId, sanitized);
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_weights_updated'));
        await showQuestionWeightMenu(adminId, chatId, { fallbackLang: lang });
    }

    function parseQuestionWeightsInput(rawText) {
        if (typeof rawText !== 'string') {
            return null;
        }
        const cleaned = rawText.replace(/%/g, '').toLowerCase();
        const values = {};
        const keys = ['math', 'physics', 'chemistry', 'okx', 'crypto'];

        for (const key of keys) {
            const regex = new RegExp(`${key}\\s*=?\\s*(-?\\d+(?:\\.\\d+)?)`);
            const match = cleaned.match(regex);
            if (match) {
                values[key] = Number(match[1]);
            }
        }

        if (Object.keys(values).length < keys.length) {
            const numericParts = cleaned.split(/[\s,;\/|]+/)
                .map((part) => Number(part))
                .filter((value) => Number.isFinite(value));
            if (numericParts.length >= keys.length) {
                keys.forEach((key, index) => {
                    values[key] = numericParts[index];
                });
            }
        }

        const weights = {};
        for (const key of keys) {
            const value = values[key];
            if (!Number.isFinite(value) || value < 0) {
                return null;
            }
            weights[key] = value;
        }
        if (keys.every((key) => weights[key] === 0)) {
            return null;
        }
        return weights;
    }

    return {
        setAdminQuestionWeights,
        parseQuestionWeightsInput
    };
}

module.exports = { createCheckinAdminActions };
