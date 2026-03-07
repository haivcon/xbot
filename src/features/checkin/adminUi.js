function createCheckinAdminUi({
    t,
    resolveNotificationLanguage,
    getGroupCheckinSettings,
    getWelcomeVerificationSettings,
    formatQuestionWeightPercentages,
    getQuestionWeights,
    QUESTION_WEIGHT_PRESETS,
    bot,
    formatWelcomeActionLabel,
    formatMarkdownTableBlock,
    HELP_TABLE_LAYOUT,
    escapeHtml,
    truncateLabel
}) {
    /**
     * Sanitize button text for Telegram inline keyboard.
     * Removes invalid UTF-8 characters, control characters, and ensures safe text.
     */
    function sanitizeButtonText(text) {
        if (typeof text !== 'string' || !text) {
            return '';
        }
        // Remove null bytes and control characters (except common whitespace)
        let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        // Replace unpaired surrogate characters
        sanitized = sanitized.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
        // Try to ensure valid UTF-8
        try {
            sanitized = Buffer.from(sanitized, 'utf8').toString('utf8');
        } catch (error) {
            // Fallback: remove non-ASCII if encoding fails
            sanitized = text.replace(/[^\x20-\x7E]/g, '');
        }
        return sanitized.trim() || text.trim();
    }

    function buildQuestionWeightKeyboard(chatId, lang) {
        const chatKey = chatId.toString();
        const inline_keyboard = QUESTION_WEIGHT_PRESETS.map((preset) => ([{
            text: sanitizeButtonText(t(lang, 'checkin_admin_weights_option', {
                math: `${preset.math}%`,
                physics: `${preset.physics}%`,
                chemistry: `${preset.chemistry}%`,
                okx: `${preset.okx}%`,
                crypto: `${preset.crypto}%`
            })),
            callback_data: `checkin_admin_weights_set|${chatKey}|${preset.math}|${preset.physics}|${preset.chemistry}|${preset.okx}|${preset.crypto}`
        }]));
        inline_keyboard.push([{ text: sanitizeButtonText(`✏️ ${t(lang, 'checkin_admin_button_custom')}`), callback_data: `checkin_admin_weights_custom|${chatKey}` }]);
        inline_keyboard.push([
            { text: sanitizeButtonText(`⬅️ ${t(lang, 'checkin_admin_button_back')}`), callback_data: `checkin_admin_back|${chatKey}` },
            { text: sanitizeButtonText(`✖️ ${t(lang, 'checkin_admin_button_close')}`), callback_data: `checkin_admin_close|${chatKey}` }
        ]);
        return { inline_keyboard };
    }

    async function showQuestionWeightMenu(adminId, chatId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const settings = await getGroupCheckinSettings(chatId);
        const weights = getQuestionWeights(settings);
        const percents = formatQuestionWeightPercentages(weights);
        const lines = [
            `⚖️ <b>${t(lang, 'checkin_admin_weights_title')}</b>`,
            t(lang, 'checkin_admin_weights_current', percents),
            '',
            `ℹ️ <i>${t(lang, 'checkin_admin_weights_hint')}</i>`
        ];
        await bot.sendMessage(adminId, lines.join('\n'), {
            reply_markup: buildQuestionWeightKeyboard(chatId, lang),
            parse_mode: 'HTML'
        });
    }

    function buildWelcomeAdminKeyboard(chatId, lang, settings) {
        const chatKey = chatId.toString();
        const statusIcon = settings.enabled ? '🟢' : '🔴';
        const toggleLabelRaw = settings.enabled ? t(lang, 'welcome_admin_disable') : t(lang, 'welcome_admin_enable');
        const toggleLabel = sanitizeButtonText(toggleLabelRaw.replace(/^[^\p{L}\p{N}]+/u, '').trim());

        const inline_keyboard = [];
        inline_keyboard.push([{
            text: sanitizeButtonText(`${statusIcon} ${toggleLabel}`),
            callback_data: `welcome_admin_toggle|${chatKey}`
        }]);
        inline_keyboard.push([
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_weights')), callback_data: `welcome_admin_weights|${chatKey}` },
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_time')), callback_data: `welcome_admin_time|${chatKey}` }
        ]);
        inline_keyboard.push([
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_attempts')), callback_data: `welcome_admin_attempts|${chatKey}` },
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_action')), callback_data: `welcome_admin_action|${chatKey}` }
        ]);
        inline_keyboard.push([
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_title')), callback_data: `welcome_admin_title|${chatKey}` },
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_topics')), callback_data: `welcome_admin_topics|${chatKey}` }
        ]);
        inline_keyboard.push([{ text: sanitizeButtonText(t(lang, 'help_button_close')), callback_data: `welcome_admin_close|${chatKey}` }]);
        return { inline_keyboard };
    }

    function buildWelcomeWeightKeyboard(chatId, lang) {
        const chatKey = chatId.toString();
        const inline_keyboard = QUESTION_WEIGHT_PRESETS.map((preset) => ([{
            text: sanitizeButtonText(t(lang, 'checkin_admin_weights_option', {
                math: `${preset.math}%`,
                physics: `${preset.physics}%`,
                chemistry: `${preset.chemistry}%`,
                okx: `${preset.okx}%`,
                crypto: `${preset.crypto}%`
            })),
            callback_data: `welcome_admin_weights_set|${chatKey}|${preset.math}|${preset.physics}|${preset.chemistry}|${preset.okx}|${preset.crypto}`
        }]));
        inline_keyboard.push([{ text: sanitizeButtonText(`✏️ ${t(lang, 'checkin_admin_button_custom')}`), callback_data: `welcome_admin_weights_custom|${chatKey}` }]);
        inline_keyboard.push([
            { text: sanitizeButtonText(t(lang, 'welcome_admin_button_back')), callback_data: `welcome_admin_back|${chatKey}` },
            { text: sanitizeButtonText(t(lang, 'help_button_close')), callback_data: `welcome_admin_close|${chatKey}` }
        ]);
        return { inline_keyboard };
    }

    async function showWelcomeWeightMenu(adminId, chatId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const settings = await getWelcomeVerificationSettings(chatId);
        const percents = formatQuestionWeightPercentages(getQuestionWeights(settings));
        const lines = [
            `⚖️ <b>${t(lang, 'welcome_admin_weights_title')}</b>`,
            t(lang, 'checkin_admin_weights_current', percents),
            '',
            `ℹ️ <i>${t(lang, 'welcome_admin_weights_hint')}</i>`
        ];
        const sent = await bot.sendMessage(adminId, lines.join('\n'), {
            reply_markup: buildWelcomeWeightKeyboard(chatId, lang),
            parse_mode: 'HTML'
        });
        if (sent?.message_id) {
            setTimeout(async () => {
                try {
                    await bot.deleteMessage(adminId, sent.message_id);
                } catch (error) {
                    // ignore auto-close errors
                }
            }, 60 * 1000);
        }
    }

    async function buildWelcomeAdminPayload(chatId, lang) {
        const settings = await getWelcomeVerificationSettings(chatId);
        const percents = formatQuestionWeightPercentages(getQuestionWeights(settings));
        const statusIcon = settings.enabled ? '🟢' : '🔴';
        const stripDecorations = (text) => {
            const noTags = typeof text === 'string' ? text.replace(/<[^>]*>/g, '') : '';
            return noTags.replace(/^[^\p{L}\p{N}]+/u, '').trim();
        };
        const headerLabel = escapeHtml(t(lang, 'help_table_command_header'));
        const headerValue = escapeHtml(t(lang, 'help_table_description_header'));
        const statusText = stripDecorations(t(lang, settings.enabled ? 'welcome_admin_status_on' : 'welcome_admin_status_off'));
        const timeText = stripDecorations(t(lang, 'welcome_admin_time', { seconds: settings.timeLimitSeconds }));
        const attemptsText = stripDecorations(t(lang, 'welcome_admin_attempts', { attempts: settings.maxAttempts }));
        const ratesText = stripDecorations(t(lang, 'welcome_admin_rates', percents));
        const tableLines = [
            `| ${headerLabel} | ${headerValue} |`,
            '| --- | --- |',
            `| ${escapeHtml(t(lang, 'welcome_admin_status_label'))} | ${escapeHtml(statusText)} |`,
            `| ${escapeHtml(t(lang, 'welcome_admin_rates_label'))} | ${escapeHtml(ratesText)} |`,
            `| ${escapeHtml(t(lang, 'welcome_admin_time_label'))} | ${escapeHtml(timeText)} |`,
            `| ${escapeHtml(t(lang, 'welcome_admin_attempts_label'))} | ${escapeHtml(attemptsText)} |`,
            `| ${escapeHtml(t(lang, 'welcome_admin_action_label'))} | ${escapeHtml(formatWelcomeActionLabel(settings.action, lang))} |`,
            `| ${escapeHtml(t(lang, 'welcome_admin_title_label'))} | ${escapeHtml(truncateLabel(settings.titleTemplate || t(lang, 'welcome_admin_title_default'), 72))} |`
        ];
        const formattedTable = formatMarkdownTableBlock(tableLines, HELP_TABLE_LAYOUT);

        const text = [
            `<b>${statusIcon} ${escapeHtml(t(lang, 'welcome_admin_title'))}</b>`,
            `<pre>${escapeHtml(formattedTable)}</pre>`,
            `<i>${escapeHtml(t(lang, 'welcome_admin_hint'))}</i>`
        ].join('\n\n');

        return {
            text,
            reply_markup: buildWelcomeAdminKeyboard(chatId, lang, settings)
        };
    }

    return {
        buildQuestionWeightKeyboard,
        showQuestionWeightMenu,
        buildWelcomeAdminKeyboard,
        buildWelcomeWeightKeyboard,
        showWelcomeWeightMenu,
        buildWelcomeAdminPayload
    };
}

module.exports = createCheckinAdminUi;
