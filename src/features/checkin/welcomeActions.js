function createWelcomeAdminActions({
    resolveNotificationLanguage,
    sanitizeWeightValue,
    saveWelcomeVerificationSettings,
    sendWelcomeAdminMenu,
    sendEphemeralMessage,
    WELCOME_ENFORCEMENT_ACTIONS,
    formatWelcomeActionLabel,
    t
}) {
    async function setWelcomeQuestionWeights(chatId, adminId, weights, { fallbackLang } = {}) {
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

        await saveWelcomeVerificationSettings(chatId, sanitized);
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_weights_saved'));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang, editOnly: true });
    }

    async function setWelcomeTimeLimit(chatId, adminId, seconds, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const numeric = Number(seconds);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_time_invalid'));
            return;
        }

        const next = await saveWelcomeVerificationSettings(chatId, { timeLimitSeconds: Math.round(numeric) });
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_time_saved', { seconds: next.timeLimitSeconds }));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang, editOnly: true });
    }

    async function setWelcomeAttemptLimit(chatId, adminId, attempts, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const numeric = Number(attempts);
        if (!Number.isFinite(numeric) || numeric < 1) {
            await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_attempts_invalid'));
            return;
        }

        const next = await saveWelcomeVerificationSettings(chatId, { maxAttempts: Math.round(numeric) });
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_attempts_saved', { attempts: next.maxAttempts }));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang, editOnly: true });
    }

    async function setWelcomeTitleTemplate(chatId, adminId, template, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const normalized = (template || '').trim();
        if (!normalized) {
            await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_title_invalid'));
            return;
        }

        const clipped = normalized.slice(0, 180);
        await saveWelcomeVerificationSettings(chatId, { titleTemplate: clipped });
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_title_saved'));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang, editOnly: true });
    }

    async function resetWelcomeTitleTemplate(chatId, adminId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await saveWelcomeVerificationSettings(chatId, { titleTemplate: '' });
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_title_reset'));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang, editOnly: true });
    }

    async function setWelcomeAction(chatId, adminId, action, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const normalized = WELCOME_ENFORCEMENT_ACTIONS.includes(action) ? action : null;
        if (!normalized) {
            await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_action_invalid'));
            return;
        }
        await saveWelcomeVerificationSettings(chatId, { action: normalized });
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_action_saved', { action: formatWelcomeActionLabel(normalized, lang) }));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang, editOnly: true });
    }

    async function toggleWelcomeVerification(chatId, adminId, enabled, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await saveWelcomeVerificationSettings(chatId, { enabled: Boolean(enabled) });
        await sendEphemeralMessage(adminId, t(lang, enabled ? 'welcome_admin_enabled' : 'welcome_admin_disabled'));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    return {
        setWelcomeQuestionWeights,
        setWelcomeTimeLimit,
        setWelcomeAttemptLimit,
        setWelcomeTitleTemplate,
        resetWelcomeTitleTemplate,
        setWelcomeAction,
        toggleWelcomeVerification
    };
}

module.exports = { createWelcomeAdminActions };
