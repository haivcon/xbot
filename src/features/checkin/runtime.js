function createCheckinRuntime(deps) {
    const {
        t,
        defaultLang,
        escapeHtml,
        formatCopyableValueHtml,
        formatMarkdownTableBlock,
        HELP_TABLE_LAYOUT,
        buildBotStartLink,
        sendMessageRespectingThread,
        buildUserMention,
        scheduleMessageDeletion,
        sendEphemeralMessage,
        appendCloseButton,
        buildCloseKeyboard,
        buildAdminProfileLink,
        buildAdminUserIdLink,
        buildEmotionKeyboard,
        buildGoalKeyboard,
        sanitizeGoalInput,
        createShortToken,
        generateCheckinChallenge,
        createCheckinScheduler,
        normalizeAddressSafe,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        resolveLangCode,
        isGroupAdminFlexible,
        getLang,
        db,
        bot,
        CHECKIN_MAX_ATTEMPTS,
        CHECKIN_DEFAULT_TIMEZONE,
        CHECKIN_DEFAULT_TIME,
        ADMIN_DETAIL_BULLET,
        CHECKIN_GOAL_PRESETS,
        SCIENCE_TEMPLATES,
        SCIENCE_ENTRIES,
        SCIENCE_CATEGORY_KEYS,
        QUESTION_TYPE_KEYS,
        DEFAULT_QUESTION_WEIGHTS,
        QUESTION_WEIGHT_PRESETS,
        CHECKIN_SCHEDULE_MAX_SLOTS,
        CHECKIN_ADMIN_SUMMARY_MAX_ROWS,
        CHECKIN_ADMIN_PAGE_SIZE,
        CHECKIN_ADMIN_EXPORT_FORMATS,
        CHECKIN_SCHEDULE_PRESETS,
        CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT,
        LEADERBOARD_MODE_CONFIG,
        CHECKIN_SCHEDULER_INTERVAL,
        SUMMARY_DEFAULT_TIME,
        SUMMARY_SCHEDULE_PRESETS,
        SUMMARY_BROADCAST_MAX_ROWS,
        CHECKIN_ADMIN_DM_MAX_RECIPIENTS,
        WELCOME_ENFORCEMENT_ACTIONS,
        WELCOME_QUEUE_INTERVAL_MS,
        WELCOME_QUEUE_MAX_PER_TICK,
        sanitizeWeightValue,
        formatTemplateWithVariables: formatTemplateWithVars,
        getQuestionWeights,
        pickQuestionType: pickQuestionTypeFn,
        formatQuestionWeightPercentages,
        normalizeTimeSlot,
        listFeatureTopics,
        sanitizeScheduleSlots,
        parseScheduleTextInput,
        getScheduleSlots,
        getSummaryScheduleSlots,
        getWelcomeVerificationSettings,
        saveWelcomeVerificationSettings,
        pendingCheckinChallenges,
        pendingEmotionPrompts,
        pendingGoalInputs,
        pendingWelcomeChallenges,
        checkinAdminStates,
        checkinAdminMenus,
        adminHubSessions,
        welcomeAdminMenus,
        welcomeUserIndex,
        randomFortunes,
        resolveScienceLang,
        getScienceEntriesByType,
        getScienceTemplate,
        renderScienceQuestion,
        buildScienceOptionTexts,
        shuffleArray,
        generateMathChallenge,
        generateScienceChallenge,
        ADMIN_MENU_SECTION_CONFIG,
        isGroupAdmin,
        filterGroupProfiles,
        sendReply,
        buildWelcomeAdminPayload: initialBuildWelcomeAdminPayload
    } = deps;
    const formatTemplateWithVariables = formatTemplateWithVars;
    const pickQuestionType = pickQuestionTypeFn;
    let buildWelcomeAdminPayload = initialBuildWelcomeAdminPayload;
    const ADMIN_HUB_AUTO_CLOSE_MS = 60000;
    const MAX_CHECKIN_TARGETS_PER_RUN = 11;

    function buildTopicLink(chatId, topicId) {
        if (!chatId || topicId === null || topicId === undefined || topicId === 'main') {
            return null;
        }
        const chatStr = chatId.toString();
        const numeric = chatStr.startsWith('-100') ? chatStr.slice(4) : chatStr.replace(/^-/, '');
        if (!numeric) {
            return null;
        }
        return `https://t.me/c/${numeric}/${topicId}`;
    }

    async function buildFeatureTopicsView(featureKey, chatId, lang, config) {
        const chatKey = chatId.toString();
        const topics = await listFeatureTopics(chatKey, featureKey);
        const inline_keyboard = [];
        const lines = [
            t(lang, config.titleKey),
            '',
            t(lang, config.hintKey, { addCmd: config.addCmd, removeCmd: config.removeCmd })
        ];

        const selected = new Set();
        (topics || []).forEach((entry) => {
            const key = entry.topicId === undefined || entry.topicId === null || entry.topicId === 'main'
                ? 'main'
                : entry.topicId.toString();
            selected.add(key);
        });
        if (selected.size === 0) {
            selected.add('main');
        }

        const topicMeta = new Map();
        const registerTopic = async (rawTopicId) => {
            const topicKey = rawTopicId === undefined || rawTopicId === null || rawTopicId === 'main'
                ? 'main'
                : rawTopicId.toString();
            if (topicMeta.has(topicKey)) {
                return;
            }
            let label = topicKey === 'main' ? t(lang, 'price_topic_main') : topicKey;
            try {
                if (topicKey !== 'main') {
                    const topic = await bot.getForumTopic(chatKey, Number(topicKey));
                    if (topic?.name) {
                        label = topic.name;
                    }
                }
            } catch (error) {
                // ignore topic lookup errors
            }
            const link = buildTopicLink(chatKey, topicKey);
            topicMeta.set(topicKey, { label, link });
        };

        await registerTopic('main');
        for (const entry of topics || []) {
            await registerTopic(entry.topicId);
        }

        const topicKeys = Array.from(topicMeta.keys()).sort((a, b) => {
            if (a === 'main') return -1;
            if (b === 'main') return 1;
            return a.localeCompare(b);
        });

        if (topicKeys.length === 0) {
            lines.push('', t(lang, 'price_menu_empty'));
        }

        for (const key of topicKeys) {
            const meta = topicMeta.get(key);
            const isOn = selected.has(key);
            const linkText = meta.link ? ` - <a href="${escapeHtml(meta.link)}">${escapeHtml(t(lang, 'price_topic_link'))}</a>` : '';
            lines.push(`- ${escapeHtml(meta.label)}${linkText}`);
            inline_keyboard.push([{ text: `${isOn ? '🟢' : '⚪'} ${meta.label}`, callback_data: `feature_topic_toggle|${featureKey}|${chatKey}|${key}` }]);
        }

        const backLabel = config.backLabelKey ? t(lang, config.backLabelKey) : t(lang, 'checkin_admin_button_back');
        const closeLabel = config.closeLabelKey ? t(lang, config.closeLabelKey) : t(lang, 'checkin_admin_button_close');
        inline_keyboard.push([
            { text: backLabel, callback_data: config.backCallback(chatKey) },
            { text: closeLabel, callback_data: config.closeCallback(chatKey) }
        ]);

        return { text: lines.filter(Boolean).join('\n'), reply_markup: { inline_keyboard } };
    }

    async function presentCheckinTopics(adminId, chatId, { fallbackLang, messageContext = null } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const payload = await buildFeatureTopicsView('checkin', chatId, lang, {
            titleKey: 'checkin_topics_title',
            hintKey: 'checkin_topics_hint',
            addCmd: '/checkinv',
            removeCmd: '/checkinx',
            backCallback: (chatKey) => `checkin_admin_back|${chatKey}`,
            closeCallback: (chatKey) => `checkin_admin_close|${chatKey}`,
            backLabelKey: 'checkin_admin_button_back',
            closeLabelKey: 'checkin_admin_button_close'
        });
        const options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: payload.reply_markup
        };

        if (messageContext?.chat?.id && messageContext?.message_id) {
            try {
                await bot.editMessageText(payload.text, {
                    chat_id: messageContext.chat.id,
                    message_id: messageContext.message_id,
                    ...options
                });
                return;
            } catch (error) {
                // fall through to send new message
            }
        }

        await bot.sendMessage(adminId, payload.text, options);
    }

    async function presentWelcomeTopics(adminId, chatId, { fallbackLang, messageContext = null } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const payload = await buildFeatureTopicsView('welcome', chatId, lang, {
            titleKey: 'welcome_topics_title',
            hintKey: 'welcome_topics_hint',
            addCmd: '/welcomev',
            removeCmd: '/welcomex',
            backCallback: (chatKey) => `welcome_admin_back|${chatKey}`,
            closeCallback: (chatKey) => `welcome_admin_close|${chatKey}`,
            backLabelKey: 'welcome_admin_button_back',
            closeLabelKey: 'welcome_admin_button_close'
        });
        const options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: payload.reply_markup
        };

        if (messageContext?.chat?.id && messageContext?.message_id) {
            try {
                await bot.editMessageText(payload.text, {
                    chat_id: messageContext.chat.id,
                    message_id: messageContext.message_id,
                    ...options
                });
                return;
            } catch (error) {
                // fallback to sending new message
            }
        }

        await bot.sendMessage(adminId, payload.text, options);
    }

    function formatDateForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, date = new Date()) {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            return formatter.format(date);
        } catch (error) {
            console.warn(`[Checkin] Không thể format ngày cho timezone ${timezone}: ${error.message}`);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }

    function formatTimeForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, date = new Date()) {
        try {
            const formatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            return formatter.format(date);
        } catch (error) {
            console.warn(`[Checkin] Không thể format giờ cho timezone ${timezone}: ${error.message}`);
            const hours = String(date.getUTCHours()).padStart(2, '0');
            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    }

    function formatDateTimeForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, timestampSeconds = null) {
        const date = timestampSeconds ? new Date(timestampSeconds * 1000) : new Date();
        const dateStr = formatDateForTimezone(timezone, date);
        const timeStr = formatTimeForTimezone(timezone, date);
        return `${dateStr} ${timeStr}`;
    }

    function subtractDaysFromDate(dateStr, days) {
        if (typeof dateStr !== 'string') {
            return null;
        }

        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return null;
        }

        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const delta = Math.max(0, Number(days) || 0);
        const date = new Date(Date.UTC(year, month, day));
        date.setUTCDate(date.getUTCDate() - delta);
        const nextYear = date.getUTCFullYear();
        const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
        const nextDay = String(date.getUTCDate()).padStart(2, '0');
        return `${nextYear}-${nextMonth}-${nextDay}`;
    }

    function normalizeDateInput(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return null;
        }

        return trimmed;
    }

    function pickLaterDateString(valueA, valueB) {
        if (!valueA) {
            return valueB || null;
        }
        if (!valueB) {
            return valueA;
        }
        return valueA >= valueB ? valueA : valueB;
    }

    function calculateInclusiveDayDiff(start, end) {
        if (!start || !end) {
            return 0;
        }

        const startDate = new Date(`${start}T00:00:00Z`);
        const endDate = new Date(`${end}T00:00:00Z`);
        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        return diffDays >= 0 ? diffDays + 1 : 0;
    }

    function getSummaryPeriodStart(settings) {
        const normalized = normalizeDateInput(settings?.summaryPeriodStart);
        return normalized || null;
    }

    function getSummaryWindowBounds(settings) {
        const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const configuredDays = Math.max(Number(settings?.summaryWindow) || 1, 1);
        const endDate = formatDateForTimezone(timezone);
        const rollingStart = subtractDaysFromDate(endDate, configuredDays - 1) || endDate;
        const periodStart = getSummaryPeriodStart(settings);
        const startDate = pickLaterDateString(rollingStart, periodStart) || rollingStart;
        return {
            startDate,
            endDate,
            periodStart,
            configuredDays,
            rangeDays: calculateInclusiveDayDiff(startDate, endDate)
        };
    }

    const SCIENCE_LANGUAGE_SET = new Set(Object.values(SCIENCE_TEMPLATES).flatMap((template) => Object.keys(template || {})));

    const welcomeVerificationQueue = [];
    let welcomeQueueTimer = null;

    function formatWelcomeActionLabel(action, lang) {
        if (action === 'ban') {
            return t(lang, 'welcome_admin_action_ban');
        }
        if (action === 'mute') {
            return t(lang, 'welcome_admin_action_mute');
        }
        return t(lang, 'welcome_admin_action_kick');
    }

    function formatCheckinTitleTemplate(template, lang, { user, points, time, timezone } = {}) {
        const fallback = t(lang, 'checkin_dm_intro');
        const filled = formatTemplateWithVariables(template, {
            username: user,
            user,
            points,
            time,
            timezone
        }).trim();

        return filled || fallback;
    }

    function formatWelcomeTitleTemplate(template, lang, { user, seconds, attempts, action } = {}) {
        const fallback = t(lang, 'welcome_verify_header', { user });
        const filled = formatTemplateWithVariables(template, {
            username: user,
            user,
            giay: seconds,
            seconds,
            attempts,
            luot: attempts,
            action
        }).trim();

        return filled || fallback;
    }

    function buildWelcomeQuestionKeyboard(token, challenge) {
        const inline_keyboard = challenge.options.map((option) => ([{
            text: option.text,
            callback_data: `welcome_answer|${token}|${option.index}`
        }]));
        return { inline_keyboard };
    }

    function clearWelcomeChallenge(token) {
        const challenge = pendingWelcomeChallenges.get(token);
        if (!challenge) {
            return;
        }
        if (challenge.timer) {
            clearTimeout(challenge.timer);
        }
        pendingWelcomeChallenges.delete(token);
        welcomeUserIndex.delete(`${challenge.chatId}:${challenge.userId}`);
    }

    async function applyWelcomeEnforcement(challenge, reason = 'timeout') {
        const action = challenge.action || 'kick';
        const lang = challenge.lang || defaultLang;
        const reasonText = reason === 'attempts'
            ? t(lang, 'welcome_verify_reason_attempts')
            : t(lang, 'welcome_verify_reason_timeout');
        const actionLabel = formatWelcomeActionLabel(action, lang);

        let notice = null;

        try {
            if (action === 'ban') {
                await bot.banChatMember(challenge.chatId, challenge.userId, { revoke_messages: true });
            } else if (action === 'mute') {
                await bot.restrictChatMember(challenge.chatId, challenge.userId, {
                    permissions: { can_send_messages: false },
                    until_date: Math.floor(Date.now() / 1000) + 3600
                });
            } else {
                await bot.banChatMember(challenge.chatId, challenge.userId, { until_date: Math.floor(Date.now() / 1000) + 60 });
                await bot.unbanChatMember(challenge.chatId, challenge.userId, { only_if_banned: true });
            }
        } catch (error) {
            console.error(`[WelcomeVerify] Failed to enforce ${action} for ${challenge.userId} in ${challenge.chatId}: ${error.message}`);
        }

        try {
            notice = await bot.sendMessage(challenge.chatId, t(lang, 'welcome_verify_failed', {
                user: challenge.displayName,
                action: actionLabel,
                reason: reasonText
            }), { disable_web_page_preview: true });
        } catch (error) {
            console.warn(`[WelcomeVerify] Unable to send enforcement notice: ${error.message}`);
        }

        return notice;
    }

    async function handleWelcomeTimeout(token, reason = 'timeout') {
        const challenge = pendingWelcomeChallenges.get(token);
        if (!challenge) {
            return;
        }
        const notice = await applyWelcomeEnforcement(challenge, reason);
        clearWelcomeChallenge(token);

        if (challenge.messageId) {
            scheduleMessageDeletion(challenge.chatId, challenge.messageId, 10000);
        }
        if (notice?.chat?.id && notice?.message_id) {
            scheduleMessageDeletion(notice.chat.id, notice.message_id, 10000);
        }
    }

    async function handleWelcomeAnswer(query, token, answerIndex) {
        const callbackLang = await resolveNotificationLanguage(query.from.id, query.from.language_code);
        const challenge = pendingWelcomeChallenges.get(token);

        if (!challenge) {
            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'welcome_verify_error_expired'), show_alert: true });
            return;
        }

        if (challenge.userId !== query.from.id.toString()) {
            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'welcome_verify_error_wrong_user'), show_alert: true });
            return;
        }

        if (Date.now() >= challenge.expiresAt) {
            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'welcome_verify_error_expired'), show_alert: true });
            await handleWelcomeTimeout(token, 'timeout');
            return;
        }

        if (Number(answerIndex) === Number(challenge.correctIndex)) {
            clearWelcomeChallenge(token);
            let successMessage = null;
            try {
                await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'welcome_verify_correct') });
            } catch (_) {
                // ignore
            }
            try {
                successMessage = await bot.sendMessage(challenge.chatId, t(challenge.lang, 'welcome_verify_success', { user: challenge.displayName }));
            } catch (error) {
                console.warn(`[WelcomeVerify] Unable to send success message: ${error.message}`);
            }

            if (challenge.messageId) {
                scheduleMessageDeletion(challenge.chatId, challenge.messageId, 10000);
            }
            if (successMessage?.chat?.id && successMessage?.message_id) {
                scheduleMessageDeletion(successMessage.chat.id, successMessage.message_id, 10000);
            }
            return;
        }

        challenge.attempts += 1;
        pendingWelcomeChallenges.set(token, challenge);

        const remaining = Math.max(challenge.maxAttempts - challenge.attempts, 0);
        if (remaining <= 0) {
            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'welcome_verify_attempt_limit'), show_alert: true });
            await handleWelcomeTimeout(token, 'attempts');
            return;
        }

        await bot.answerCallbackQuery(query.id, {
            text: t(callbackLang, 'welcome_verify_incorrect', { remaining }),
            show_alert: true
        });
    }

    async function sendWelcomeVerificationChallenge(task) {
        const chatId = task.chatId.toString();
        const settings = task.settings || await getWelcomeVerificationSettings(chatId);
        if (!settings.enabled) {
            return;
        }

        const userId = task.member?.id?.toString();
        if (!userId) {
            return;
        }

        const userKey = `${chatId}:${userId}`;
        if (welcomeUserIndex.has(userKey)) {
            return;
        }

        const lang = await resolveGroupLanguage(chatId);
        const questionType = pickQuestionType(settings);
        const challenge = generateCheckinChallenge(lang, questionType, settings);
        const token = createShortToken('wlc');
        const expiresAt = Date.now() + (settings.timeLimitSeconds * 1000);
        const displayName = task.member.username
            ? `@${task.member.username}`
            : (task.member.first_name || task.member.last_name || 'member');

        const timerLabel = t(lang, 'welcome_verify_timer', { seconds: settings.timeLimitSeconds });
        const attemptLabel = t(lang, 'welcome_verify_attempts', { attempts: settings.maxAttempts });
        const actionLabel = formatWelcomeActionLabel(settings.action, lang);
        const headerLine = formatWelcomeTitleTemplate(settings.titleTemplate, lang, {
            user: displayName,
            seconds: settings.timeLimitSeconds,
            attempts: settings.maxAttempts,
            action: actionLabel
        });
        const lines = [
            // Header (Tiêu đề bảo mật) -> 🛡️
            `🛡️ <b>${escapeHtml(headerLine)}</b>`,

            // Thông tin: Thời gian ⏱️ • Lần thử 🔢 • Hành động ⚡
            `⏱️ ${escapeHtml(timerLabel)} • 🔢 ${escapeHtml(attemptLabel)} • ⚡ ${escapeHtml(actionLabel)}`,
            '',
            // Câu hỏi (Question) -> 🧩
            `🧩 <b>${escapeHtml(challenge.question)}</b>`,
            '',
            // Kêu gọi hành động (CTA) -> 👇
            `👇 ${escapeHtml(t(lang, 'welcome_verify_cta'))}`
        ];

        const options = {
            reply_markup: buildWelcomeQuestionKeyboard(token, challenge),
            disable_notification: true,
            parse_mode: 'HTML'
        };

        const sent = await sendMessageRespectingThread(chatId, task.sourceMessage, lines.join('\n'), options);
        const timer = setTimeout(() => handleWelcomeTimeout(token, 'timeout'), settings.timeLimitSeconds * 1000);
        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        pendingWelcomeChallenges.set(token, {
            chatId,
            userId,
            messageId: sent?.message_id || null,
            correctIndex: challenge.correctIndex,
            attempts: 0,
            maxAttempts: settings.maxAttempts,
            expiresAt,
            action: settings.action,
            lang,
            displayName,
            timer
        });
        welcomeUserIndex.set(userKey, token);
    }

    function startWelcomeQueueProcessor() {
        if (welcomeQueueTimer) {
            return;
        }

        const tick = async () => {
            let processed = 0;
            while (processed < WELCOME_QUEUE_MAX_PER_TICK && welcomeVerificationQueue.length > 0) {
                const task = welcomeVerificationQueue.shift();
                processed += 1;
                try {
                    await sendWelcomeVerificationChallenge(task);
                } catch (error) {
                    console.error(`[WelcomeVerify] Failed to send challenge: ${error.message}`);
                }
            }

            if (welcomeVerificationQueue.length === 0 && welcomeQueueTimer) {
                clearInterval(welcomeQueueTimer);
                welcomeQueueTimer = null;
            }
        };

        tick();
        welcomeQueueTimer = setInterval(tick, WELCOME_QUEUE_INTERVAL_MS);
        if (typeof welcomeQueueTimer.unref === 'function') {
            welcomeQueueTimer.unref();
        }
    }

    function enqueueWelcomeVerification(task) {
        welcomeVerificationQueue.push(task);
        startWelcomeQueueProcessor();
    }

    async function getGroupCheckinSettings(chatId) {
        const chatKey = chatId.toString();
        try {
            const settings = await db.getCheckinGroup(chatKey);
            return {
                ...settings,
                promptTemplate: typeof settings.promptTemplate === 'string' ? settings.promptTemplate : ''
            };
        } catch (error) {
            console.warn(`[Checkin] Không thể đọc cấu hình nhóm ${chatKey}: ${error.message}`);
            return {
                chatId: chatKey,
                checkinTime: CHECKIN_DEFAULT_TIME,
                timezone: CHECKIN_DEFAULT_TIMEZONE,
                autoMessageEnabled: 1,
                dailyPoints: 10,
                summaryWindow: 7,
                lastAutoMessageDate: null,
                autoMessageTimes: [CHECKIN_DEFAULT_TIME],
                summaryMessageEnabled: 0,
                summaryMessageTimes: [],
                promptTemplate: ''
            };
        }
    }

    function getLeaderboardPeriodStart(settings) {
        const normalized = normalizeDateInput(settings?.leaderboardPeriodStart);
        if (normalized) {
            return normalized;
        }

        const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const today = formatDateForTimezone(timezone);
        const days = Math.max(Number(settings?.summaryWindow) || 1, 1);
        return subtractDaysFromDate(today, days - 1) || today;
    }

    function buildCheckinKeyboard(chatId, lang) {
        const chatKey = chatId.toString();
        return {
            inline_keyboard: [
                [{ text: t(lang, 'checkin_button_start'), callback_data: `checkin_start|${chatKey}` }],
                [{ text: t(lang, 'checkin_button_leaderboard'), callback_data: `checkin_leaderboard|${chatKey}` }],
                [{ text: t(lang, 'checkin_button_admin_menu'), callback_data: `checkin_admin|${chatKey}` }]
            ]
        };
    }

    function buildStartBotButton(lang, startLink) {
        if (!startLink) {
            return null;
        }

        return {
            inline_keyboard: [[{ text: t(lang, 'checkin_button_open_bot'), url: startLink }]]
        };
    }

    async function sendCheckinStartPrompt(sourceMessage, lang, startLink, user) {
        if (!sourceMessage?.chat?.id || !startLink) {
            return;
        }

        const isGroupChat = ['group', 'supergroup'].includes(sourceMessage.chat.type);
        const options = {
            reply_markup: buildStartBotButton(lang, startLink),
            disable_notification: true
        };

        let text = '❓';

        if (!isGroupChat) {
            const mention = buildUserMention(user);
            text = t(lang, 'checkin_dm_failure_start', { user: mention.text });
            if (mention.parseMode) {
                options.parse_mode = mention.parseMode;
            }
        }

        const sent = await sendMessageRespectingThread(sourceMessage.chat.id, sourceMessage, text, options);
        scheduleMessageDeletion(sourceMessage.chat.id, sent.message_id, isGroupChat ? 10000 : 20000);
    }

    async function answerCheckinStartPrompt(query, lang, startLink) {
        const response = {
            text: t(lang, 'checkin_dm_failure_start_alert'),
            show_alert: true
        };

        if (startLink) {
            response.url = startLink;
        }

        await bot.answerCallbackQuery(query.id, response);
    }

    async function sendCheckinDmFailureNotice(sourceMessage, lang, user) {
        if (!sourceMessage) {
            return;
        }

        const mention = buildUserMention(user);
        const baseText = t(lang, 'checkin_error_dm_failed');
        const messageText = mention.parseMode === 'HTML'
            ? `${mention.text}\n${escapeHtml(baseText)}`
            : `${mention.text}\n${baseText}`;
        const options = mention.parseMode === 'HTML' ? { parse_mode: 'HTML' } : {};
        const sent = await sendMessageRespectingThread(sourceMessage.chat.id, sourceMessage, messageText, options);
        scheduleMessageDeletion(sourceMessage.chat.id, sent.message_id, 20000);
    }

    async function sendCheckinAnnouncement(chatId, { sourceMessage = null, triggeredBy = 'auto' } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const today = formatDateForTimezone(timezone);
        const topicTargets = await listFeatureTopics(chatId, 'checkin');
        const targets = [];

        if (topicTargets && topicTargets.length > 0) {
            for (const entry of topicTargets) {
                const topicId = entry.topicId === undefined || entry.topicId === null || entry.topicId === 'main'
                    ? null
                    : entry.topicId;
                const key = topicId === null ? 'main' : topicId.toString();
                if (!targets.find((t) => t.key === key)) {
                    targets.push({ key, topicId });
                }
            }
        } else {
            targets.push({ key: 'main', topicId: null });
        }

        const limitedTargets = targets.slice(0, MAX_CHECKIN_TARGETS_PER_RUN);

        try {
            let sentCount = 0;
            for (const target of limitedTargets) {
                const threadId = target.topicId === null ? null : Number(target.topicId) || target.topicId;
                const lang = await resolveGroupLanguage(chatId, defaultLang, target.topicId);
                const promptText = t(lang, 'checkin_dm_intro');
                const options = {
                    reply_markup: buildCheckinKeyboard(chatId, lang),
                    message_thread_id: threadId || undefined
                };

                if (sourceMessage) {
                    await sendMessageRespectingThread(chatId, sourceMessage, promptText, options);
                } else {
                    await bot.sendMessage(chatId, promptText, options);
                }
                sentCount += 1;
            }

            await db.updateAutoMessageDate(chatId, today);
            console.log(`[Checkin] Sent check-in announcement to ${chatId} (${triggeredBy}) targets=${sentCount}.`);
        } catch (error) {
            console.error(`[Checkin] Failed to send announcement to ${chatId}: ${error.message}`);
        }
    }

    async function buildSummaryAnnouncementText(chatId, settings, lang, { page = 0, pageSize = CHECKIN_ADMIN_PAGE_SIZE } = {}) {
        const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
        if (!startDate || !endDate || startDate > endDate) {
            return null;
        }

        const records = await db.getCheckinsInRange(chatId, startDate, endDate);
        if (!records || records.length === 0) {
            return null;
        }

        const summaryMap = new Map();
        for (const record of records) {
            const userKey = record.userId.toString();
            const stats = summaryMap.get(userKey) || { days: 0, points: 0 };
            stats.days += 1;
            stats.points += Number(record.pointsAwarded || 0);
            summaryMap.set(userKey, stats);
        }

        if (summaryMap.size === 0) {
            return null;
        }

        const allSortedEntries = Array.from(summaryMap.entries())
            .sort((a, b) => {
                if (b[1].days !== a[1].days) {
                    return b[1].days - a[1].days;
                }
                if (b[1].points !== a[1].points) {
                    return b[1].points - a[1].points;
                }
                return Number(a[0]) - Number(b[0]);
            });

        const effectivePageSize = (pageSize && pageSize > 0) ? pageSize : 10;
        const totalPages = Math.max(1, Math.ceil(allSortedEntries.length / effectivePageSize));
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
        const pageEntries = allSortedEntries.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize);

        const profileCache = new Map();
        const lines = [
            `<b>${t(lang, 'checkin_summary_broadcast_header', { days: Math.max(rangeDays, 1), start: startDate, end: endDate, members: summaryMap.size })}</b>`,
            t(lang, 'checkin_admin_list_count', { count: allSortedEntries.length, showing: pageEntries.length }),
            ''
        ];

        const baseRank = currentPage * effectivePageSize;
        for (let index = 0; index < pageEntries.length; index += 1) {
            const [userId, stats] = pageEntries[index];
            const profile = await resolveMemberProfile(chatId, userId, lang, profileCache);
            const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;

            // Single line with all info: rank, name, days, points, ID
            lines.push(t(lang, 'checkin_summary_broadcast_line', {
                rank: baseRank + index + 1,
                name: safeName,
                id: userId,
                days: stats.days,
                points: stats.points
            }));
        }

        lines.push(escapeHtml(t(lang, 'checkin_summary_broadcast_footer')));

        return {
            text: lines.join('\n').trim(),
            totalMembers: summaryMap.size,
            totalPages,
            currentPage
        };
    }

    async function sendSummaryAnnouncement(chatId, { sourceMessage = null, triggeredBy = 'auto', page = 0, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const topicTargets = await listFeatureTopics(chatId, 'checkin');
        const targets = [];
        if (topicTargets && topicTargets.length > 0) {
            for (const entry of topicTargets) {
                const topicId = entry.topicId === undefined || entry.topicId === null || entry.topicId === 'main'
                    ? null
                    : entry.topicId;
                const key = topicId === null ? 'main' : topicId.toString();
                if (!targets.find((t) => t.key === key)) {
                    targets.push({ key, topicId });
                }
            }
        } else {
            targets.push({ key: 'main', topicId: null });
        }

        const limitedTargets = targets.slice(0, MAX_CHECKIN_TARGETS_PER_RUN);
        let sentAny = false;

        for (const target of limitedTargets) {
            const threadId = target.topicId === null ? null : Number(target.topicId) || target.topicId;
            const lang = await resolveGroupLanguage(chatId, defaultLang, target.topicId);
            const summaryResult = await buildSummaryAnnouncementText(chatId, settings, lang, { page });
            if (!summaryResult || !summaryResult.text) {
                continue;
            }

            const inline_keyboard = [];

            // Add pagination buttons if there are multiple pages
            if (summaryResult.totalPages > 1) {
                inline_keyboard.push(buildPaginationNavRow('checkin_broadcast', chatId, summaryResult.currentPage, summaryResult.totalPages, lang));
            }

            // Add export buttons if there are members
            if (summaryResult.totalMembers > 0) {
                inline_keyboard.push(buildExportButtons(chatId, lang));
            }

            const options = {
                parse_mode: 'HTML',
                message_thread_id: threadId || undefined
            };

            if (inline_keyboard.length > 0) {
                options.reply_markup = { inline_keyboard };
            }

            try {
                // If messageContext is provided, edit the existing message
                if (messageContext?.message_id) {
                    await bot.editMessageText(summaryResult.text, {
                        chat_id: messageContext.chat?.id || chatId,
                        message_id: messageContext.message_id,
                        ...options
                    });
                    sentAny = true;
                } else if (sourceMessage) {
                    await sendMessageRespectingThread(chatId, sourceMessage, summaryResult.text, options);
                    sentAny = true;
                } else {
                    await bot.sendMessage(chatId, summaryResult.text, options);
                    sentAny = true;
                }
            } catch (error) {
                console.error(`[Checkin] Failed to send summary announcement to ${chatId} topic=${threadId || 'main'}: ${error.message}`);
            }
        }

        if (sentAny) {
            console.log(`[Checkin] Sent summary announcement to ${chatId} (${triggeredBy}).`);
        }
        return sentAny;
    }

    async function ensureUserCanCheckin(chatId, userId, settings) {
        const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const today = formatDateForTimezone(timezone);
        const attempt = await db.getCheckinAttempt(chatId, userId, today);
        if (attempt && Number(attempt.locked) === 1) {
            return { allowed: false, reason: 'locked', attempts: attempt.attempts, date: today };
        }

        const record = await db.getCheckinRecord(chatId, userId, today);
        if (record) {
            return { allowed: false, reason: 'checked', record, date: today };
        }

        return { allowed: true, date: today, attempts: attempt?.attempts || 0 };
    }

    async function initiateCheckinChallenge(chatId, user, { replyMessage = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const userId = user.id.toString();
        const userLang = await resolveNotificationLanguage(userId, user.language_code);
        const check = await ensureUserCanCheckin(chatId, userId, settings);

        if (!check.allowed) {
            if (check.reason === 'locked') {
                return { status: 'locked', userLang };
            }

            if (check.reason === 'checked') {
                return { status: 'checked', userLang };
            }
        }

        const questionType = pickQuestionType(settings);
        const challenge = generateCheckinChallenge(userLang, questionType, settings);
        const token = createShortToken('chk');
        pendingCheckinChallenges.set(token, {
            chatId: chatId.toString(),
            userId,
            timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE,
            date: check.date,
            attempts: check.attempts || 0,
            correctIndex: challenge.correctIndex,
            questionType: challenge.type || questionType || 'math',
            settings,
            sourceMessage: replyMessage ? { chatId: replyMessage.chat?.id, messageId: replyMessage.message_id } : null
        });

        const inline_keyboard = challenge.options.map((option) => ([{
            text: option.text,
            callback_data: `checkin_answer|${token}|${option.index}`
        }]));

        const displayName = user.username
            ? `@${user.username}`
            : (user.first_name || user.last_name || userId);
        const introLine = formatCheckinTitleTemplate(settings.promptTemplate, userLang, {
            user: displayName,
            points: settings.dailyPoints,
            time: settings.checkinTime || CHECKIN_DEFAULT_TIME,
            timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
        });
        const dmText = [
            introLine,
            '',
            challenge.question,
            '',
            t(userLang, 'checkin_dm_choose_option')
        ].join('\n');

        try {
            await bot.sendMessage(userId, dmText, { reply_markup: { inline_keyboard } });
            return { status: 'sent', userLang };
        } catch (error) {
            pendingCheckinChallenges.delete(token);
            console.warn(`[Checkin] Unable to send DM to ${userId}: ${error.message}`);

            return {
                status: 'failed',
                userLang,
                failureReason: 'dm_unreachable',
                startLink: buildBotStartLink('checkin')
            };
        }
    }

    async function concludeCheckinSuccess(token, challenge) {
        const userId = challenge.userId;
        const chatId = challenge.chatId;
        const settings = challenge.settings || await getGroupCheckinSettings(chatId);
        const timezone = challenge.timezone || settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const today = challenge.date || formatDateForTimezone(timezone);
        const userLang = await resolveNotificationLanguage(userId);

        let walletAddress = null;
        try {
            const wallets = await db.getWalletsForUser(userId);
            if (Array.isArray(wallets) && wallets.length > 0) {
                const topWallet = wallets[0];
                walletAddress = normalizeAddressSafe(topWallet?.address || topWallet) || topWallet?.address || topWallet;
            }
        } catch (error) {
            console.warn(`[Checkin] Không thể lấy ví cho ${userId}: ${error.message}`);
        }

        const points = Number(settings.dailyPoints || 0) || 0;
        const result = await db.completeCheckin({
            chatId,
            userId,
            checkinDate: today,
            walletAddress,
            pointsAwarded: points
        });

        const streak = result?.streak || 1;
        const totalPoints = result?.totalPoints || points;
        const walletNote = walletAddress
            ? t(userLang, 'checkin_success_wallet_note', { wallet: walletAddress })
            : t(userLang, 'checkin_success_wallet_missing');

        const emotionToken = createShortToken('emo');
        pendingEmotionPrompts.set(emotionToken, {
            chatId,
            userId,
            date: today,
            stage: 'emotion'
        });

        const successMessage = [
            t(userLang, 'checkin_success_title'),
            t(userLang, 'checkin_success_streak', { streak }),
            t(userLang, 'checkin_success_total_points', { totalPoints }),
            walletNote,
            '',
            t(userLang, 'checkin_emotion_prompt')
        ].join('\n');

        await bot.sendMessage(userId, successMessage, {
            reply_markup: buildEmotionKeyboard(userLang, emotionToken),
            parse_mode: 'Markdown'
        });

        pendingCheckinChallenges.delete(token);
    }

    async function handleCheckinAnswerCallback(query, token, answerIndexRaw) {
        const userId = query.from.id.toString();
        const lang = await resolveNotificationLanguage(userId, query.from.language_code);
        const challenge = pendingCheckinChallenges.get(token);
        if (!challenge) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_question_expired'), show_alert: true });
            return;
        }

        if (userId !== challenge.userId) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong_user'), show_alert: true });
            return;
        }

        const answerIndex = Number(answerIndexRaw);
        if (!Number.isInteger(answerIndex)) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid_choice'), show_alert: true });
            return;
        }

        if (answerIndex === challenge.correctIndex) {
            await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_correct') });
            try {
                await concludeCheckinSuccess(token, challenge);
            } catch (error) {
                console.error(`[Checkin] Failed to record check-in: ${error.message}`);
                await bot.sendMessage(userId, t(lang, 'checkin_error_record_failed'));
                pendingCheckinChallenges.delete(token);
            }
            return;
        }

        const attempts = await db.incrementCheckinAttempt(challenge.chatId, userId, challenge.date, CHECKIN_MAX_ATTEMPTS);
        challenge.attempts = attempts.attempts;
        const remaining = Math.max(CHECKIN_MAX_ATTEMPTS - attempts.attempts, 0);

        if (attempts.locked) {
            await db.markMemberLocked(challenge.chatId, userId, challenge.date);
            pendingCheckinChallenges.delete(token);
            await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_attempts_locked'), show_alert: true });
            await bot.sendMessage(userId, t(lang, 'checkin_dm_locked'));
            return;
        }

        await bot.answerCallbackQuery(query.id, {
            text: t(lang, 'checkin_alert_attempts_remaining', { remaining }),
            show_alert: true
        });

        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        } catch (error) {
            // ignore edit errors
        }

        const nextType = challenge.questionType || pickQuestionType(challenge.settings);
        const newChallenge = generateCheckinChallenge(lang, nextType, challenge.settings);
        challenge.correctIndex = newChallenge.correctIndex;
        challenge.questionType = newChallenge.type || nextType || 'math';
        const inline_keyboard = newChallenge.options.map((option) => ([{
            text: option.text,
            callback_data: `checkin_answer|${token}|${option.index}`
        }]));

        const retryText = [
            t(lang, 'checkin_dm_retry_intro'),
            '',
            newChallenge.question,
            '',
            t(lang, 'checkin_dm_choose_option')
        ].join('\n');

        await bot.sendMessage(userId, retryText, { reply_markup: { inline_keyboard } });
    }

    async function handleEmotionCallback(query, token, emoji, { skip = false } = {}) {
        const prompt = pendingEmotionPrompts.get(token);
        const userId = query.from.id.toString();
        const lang = await resolveNotificationLanguage(userId, query.from.language_code);

        if (!prompt) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_session_expired'), show_alert: true });
            return;
        }

        if (userId !== prompt.userId) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong_user_button'), show_alert: true });
            return;
        }

        if (!skip) {
            const decoded = decodeURIComponent(emoji || '');
            if (!decoded) {
                bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid_emotion'), show_alert: true });
                return;
            }

            try {
                await db.updateCheckinFeedback(prompt.chatId, prompt.userId, prompt.date, { emotion: decoded });
            } catch (error) {
                console.error(`[Checkin] Unable to save emotion: ${error.message}`);
                bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_save_emotion'), show_alert: true });
                return;
            }
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_emotion_saved') });
        } else {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_emotion_skipped') });
        }

        pendingEmotionPrompts.set(token, { ...prompt, stage: 'goal' });
        await bot.sendMessage(prompt.userId, t(lang, 'checkin_dm_goal_prompt'), {
            reply_markup: buildGoalKeyboard(lang, token)
        });
    }

    async function handleGoalCallback(query, token, action, value = null) {
        const prompt = pendingEmotionPrompts.get(token);
        const userId = query.from.id.toString();
        const lang = await resolveNotificationLanguage(userId, query.from.language_code);

        if (!prompt) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_session_expired'), show_alert: true });
            return;
        }

        if (userId !== prompt.userId) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong_user_button'), show_alert: true });
            return;
        }

        if (prompt.stage !== 'goal') {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_goal_stage'), show_alert: true });
            return;
        }

        if (action === 'choose') {
            // value is a numeric index into CHECKIN_GOAL_PRESETS
            const presetIndex = Number(value);
            const presetKey = CHECKIN_GOAL_PRESETS[presetIndex];
            const decoded = presetKey ? t(lang, presetKey) : decodeURIComponent(value || '');
            try {
                await db.updateCheckinFeedback(prompt.chatId, prompt.userId, prompt.date, { goal: decoded });
                bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_goal_saved') });
                await bot.sendMessage(prompt.userId, t(lang, 'checkin_dm_goal_success'));
                pendingEmotionPrompts.delete(token);
            } catch (error) {
                console.error(`[Checkin] Unable to save preset goal: ${error.message}`);
                bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_goal_save'), show_alert: true });
            }
            return;
        }

        if (action === 'skip') {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_goal_skipped') });
            await bot.sendMessage(prompt.userId, t(lang, 'checkin_dm_goal_skip'));
            pendingEmotionPrompts.delete(token);
            return;
        }

        if (action === 'custom') {
            pendingGoalInputs.set(prompt.userId, { chatId: prompt.chatId, date: prompt.date, token });
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_goal_custom_prompt') });
            await bot.sendMessage(prompt.userId, t(lang, 'checkin_goal_custom_dm'));
            return;
        }

        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid_choice'), show_alert: true });
    }

    async function handleGoalTextInput(msg) {
        const userId = msg.from?.id?.toString();
        if (!userId) {
            return false;
        }

        const pending = pendingGoalInputs.get(userId);
        if (!pending) {
            return false;
        }

        const lang = await resolveNotificationLanguage(userId, msg.from?.language_code);
        const goalText = sanitizeGoalInput(msg.text || '');
        if (!goalText) {
            await bot.sendMessage(userId, t(lang, 'checkin_error_goal_invalid'));
            return true;
        }

        try {
            await db.updateCheckinFeedback(pending.chatId, userId, pending.date, { goal: goalText });
            await bot.sendMessage(userId, t(lang, 'checkin_alert_goal_saved'));
            pendingEmotionPrompts.delete(pending.token);
        } catch (error) {
            console.error(`[Checkin] Unable to save custom goal: ${error.message}`);
            await bot.sendMessage(userId, t(lang, 'checkin_error_goal_save'));
        } finally {
            pendingGoalInputs.delete(userId);
        }

        return true;
    }

    async function buildLeaderboardText(chatId, mode = 'streak', limit = 10, langOverride = null) {
        const settings = await getGroupCheckinSettings(chatId);
        const periodStart = getLeaderboardPeriodStart(settings);
        const rows = await db.getTopCheckins(chatId, limit, mode, periodStart);
        const lang = langOverride ? resolveLangCode(langOverride) : await resolveGroupLanguage(chatId);

        if (!rows || rows.length === 0) {
            return t(lang, 'checkin_leaderboard_empty');
        }

        let headerKey = 'checkin_leaderboard_header_current';
        if (mode === 'points') {
            headerKey = 'checkin_leaderboard_header_points';
        } else if (mode === 'total') {
            headerKey = 'checkin_leaderboard_header_total';
        } else if (mode === 'longest') {
            headerKey = 'checkin_leaderboard_header_longest';
        }

        const lines = [t(lang, headerKey), ''];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rank = i + 1;
            let displayName = t(lang, 'checkin_leaderboard_fallback_name', { userId: row.userId });
            try {
                const member = await bot.getChatMember(chatId, row.userId);
                if (member?.user) {
                    if (member.user.username) {
                        displayName = `@${member.user.username}`;
                    } else if (member.user.first_name || member.user.last_name) {
                        displayName = `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim();
                    }
                }
            } catch (error) {
                // ignore fetch errors
            }

            let statText = '';
            if (mode === 'points') {
                statText = t(lang, 'checkin_leaderboard_stat_points', { value: row.totalPoints });
            } else if (mode === 'total') {
                statText = t(lang, 'checkin_leaderboard_stat_total', { value: row.totalCheckins });
            } else if (mode === 'longest') {
                statText = t(lang, 'checkin_leaderboard_stat_longest', { value: row.longestStreak });
            } else {
                statText = t(lang, 'checkin_leaderboard_stat_current', { value: row.streak });
            }

            lines.push(`${rank}. ${displayName} • ${statText}`);
        }

        lines.push('', t(lang, 'checkin_leaderboard_footer_time', { time: settings.checkinTime || CHECKIN_DEFAULT_TIME }));
        lines.push(t(lang, 'checkin_leaderboard_footer_period', { start: periodStart }));
        return lines.join('\n');
    }

    async function getAdminHubGroups(adminId) {
        const results = new Map();

        async function maybeAdd(chatId, labelHint) {
            if (!chatId) {
                return;
            }

            const key = chatId.toString();
            if (results.has(key)) {
                return;
            }

            const isAdmin = await isGroupAdminFlexible(chatId, adminId);
            if (!isAdmin) {
                return;
            }

            let title = labelHint || chatId.toString();
            let link = null;
            let memberCount = null;
            try {
                const chat = await bot.getChat(chatId);
                if (chat?.title) {
                    title = chat.title;
                } else if (chat?.username) {
                    title = `@${chat.username}`;
                }
                if (chat?.invite_link) {
                    link = chat.invite_link;
                } else if (chat?.username) {
                    link = `https://t.me/${chat.username}`;
                }
            } catch (error) {
                // ignore title lookup errors
            }

            try {
                const count = await bot.getChatMemberCount(chatId);
                if (Number.isFinite(count)) {
                    memberCount = count;
                }
            } catch (error) {
                // ignore member count lookup errors
            }

            results.set(key, { chatId, title, link, memberCount });
        }

        try {
            const profiles = filterGroupProfiles(await db.listGroupProfiles());
            for (const profile of profiles) {
                await maybeAdd(profile.chatId, profile.title || profile.username);
            }
        } catch (error) {
            console.error(`[AdminHub] Failed to load group profiles: ${error.message}`);
        }

        try {
            const checkinGroups = await db.listCheckinGroups();
            for (const entry of checkinGroups || []) {
                if (!entry?.chatId) {
                    continue;
                }
                await maybeAdd(entry.chatId, entry.title);
            }
        } catch (error) {
            console.error(`[AdminHub] Failed to load check-in groups: ${error.message}`);
        }

        return Array.from(results.values()).sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    }

    function buildAdminHubText(lang, groups) {
        const stripTags = (text) => (typeof text === 'string' ? text.replace(/<[^>]*>/g, '') : '');
        const lines = [
            `<b>${escapeHtml(t(lang, 'admin_hub_title'))}</b>`,
            `<i>${escapeHtml(t(lang, 'admin_hub_hint'))}</i>`
        ];

        if (!groups || groups.length === 0) {
            lines.push('', escapeHtml(t(lang, 'admin_hub_empty')));
            return lines.filter(Boolean).join('\n');
        }

        const headerLabel = escapeHtml(t(lang, 'help_table_command_header'));
        const headerValue = escapeHtml(t(lang, 'help_table_description_header'));
        const tableSource = [
            `| ${headerLabel} | ${headerValue} |`,
            '| --- | --- |',
            ...groups.map((group, index) => {
                const safeTitle = truncateLabel(group.title || group.chatId.toString(), 40);
                const safeId = group.chatId.toString();
                const members = Number.isFinite(group.memberCount) ? group.memberCount : t(lang, 'owner_group_unknown_count');
                const linkLabel = group.link ? group.link : t(lang, 'admin_group_info_no_link');
                const idText = stripTags(t(lang, 'admin_group_info_id', { id: safeId }));
                const memberText = stripTags(t(lang, 'admin_group_info_members', { count: members }));
                const value = `${escapeHtml(idText)} • ${escapeHtml(memberText)} • ${escapeHtml(linkLabel)}`;
                const title = escapeHtml(t(lang, 'admin_hub_group_line', { index: String(index + 1), title: safeTitle }));
                return `| ${title} | ${value} |`;
            })
        ];
        const formatted = formatMarkdownTableBlock(tableSource, HELP_TABLE_LAYOUT);
        lines.push(`<pre>${escapeHtml(formatted)}</pre>`);

        return lines.filter(Boolean).join('\n');
    }

    /**
     * Sanitize and truncate text for use in inline keyboard buttons.
     * Removes invalid UTF-8 characters, control characters, and ensures
     * the text is safe for Telegram API.
     */
    function truncateLabel(text, max = 32) {
        if (typeof text !== 'string') {
            return '';
        }
        // Remove null bytes and control characters (except common whitespace)
        let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        // Replace unpaired surrogate characters with replacement char
        sanitized = sanitized.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
        // Ensure text is valid UTF-8 by encoding and decoding
        try {
            sanitized = Buffer.from(sanitized, 'utf8').toString('utf8');
        } catch (error) {
            // If encoding fails, remove all non-ASCII characters as fallback
            sanitized = text.replace(/[^\x20-\x7E]/g, '');
        }
        // Trim and ensure non-empty
        sanitized = sanitized.trim();
        if (!sanitized) {
            return '';
        }
        if (sanitized.length <= max) {
            return sanitized;
        }
        return `${sanitized.slice(0, max - 1)}…`;
    }

    function buildAdminHubKeyboard(lang, groups) {
        const inline_keyboard = [];

        if (groups && groups.length > 0) {
            const buttons = groups.map((group) => ({
                text: truncateLabel(t(lang, 'admin_hub_button_manage', { title: truncateLabel(group.title || group.chatId.toString(), 24) }), 48),
                callback_data: `admin_hub_open|${group.chatId}`
            }));
            for (let i = 0; i < buttons.length; i += 2) {
                inline_keyboard.push(buttons.slice(i, i + 2));
            }
        }

        inline_keyboard.push([
            { text: truncateLabel(t(lang, 'admin_hub_refresh'), 32), callback_data: 'admin_hub_refresh' },
            { text: truncateLabel(t(lang, 'admin_hub_close'), 32), callback_data: 'admin_hub_close' }
        ]);

        return { inline_keyboard };
    }

    async function openAdminHub(adminId, { forceRefresh = false, fallbackLang, mode = 'checkin' } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const groups = await getAdminHubGroups(adminId);
        const text = buildAdminHubText(lang, groups);
        const replyMarkup = buildAdminHubKeyboard(lang, groups);

        const existing = adminHubSessions.get(adminId);
        if (existing && !forceRefresh) {
            try {
                await bot.editMessageText(text, {
                    chat_id: adminId,
                    message_id: existing.messageId,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                adminHubSessions.set(adminId, { messageId: existing.messageId, mode });
                scheduleMessageDeletion(adminId, existing.messageId, ADMIN_HUB_AUTO_CLOSE_MS);
                return { messageId: existing.messageId, groups };
            } catch (error) {
                try {
                    await bot.deleteMessage(adminId, existing.messageId);
                } catch (deleteError) {
                    // ignore cleanup errors
                }
            }
        }

        const message = await bot.sendMessage(adminId, text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
        adminHubSessions.set(adminId, { messageId: message.message_id, mode });
        scheduleMessageDeletion(adminId, message.message_id, ADMIN_HUB_AUTO_CLOSE_MS);
        return { messageId: message.message_id, groups };
    }

    function resolveAdminMenuView(view) {
        if (!view || view === 'home') {
            return 'home';
        }
        return ADMIN_MENU_SECTION_CONFIG[view] ? view : 'home';
    }

    function buildAdminMenuKeyboard(chatId, lang, view = 'home', settings = null) {
        const chatKey = chatId.toString();
        const resolvedView = resolveAdminMenuView(view);

        if (resolvedView === 'home') {
            const inline_keyboard = [];
            const buttonForSection = (sectionKey) => {
                const config = ADMIN_MENU_SECTION_CONFIG[sectionKey];
                if (!config) return null;
                return {
                    text: truncateLabel(t(lang, config.labelKey), 48),
                    callback_data: `checkin_admin_menu|${chatKey}|${sectionKey}`
                };
            };

            if (settings) {
                const isEnabled = Number(settings.autoMessageEnabled) === 1;
                const toggleLabel = isEnabled
                    ? t(lang, 'checkin_admin_disable_daily')
                    : t(lang, 'checkin_admin_enable_daily');
                inline_keyboard.push([{ text: truncateLabel(toggleLabel, 48), callback_data: `checkin_admin_toggle_auto|${chatKey}` }]);
            }

            // New 2x2 grid layout
            const sectionOrder = [
                ['lists', 'announcements'],
                ['leaderboard', 'settings']
            ];

            sectionOrder.forEach((pair) => {
                const row = [];
                pair.forEach((sectionKey) => {
                    const button = buttonForSection(sectionKey);
                    if (button) {
                        row.push(button);
                    }
                });
                if (row.length) {
                    inline_keyboard.push(row);
                }
            });

            // Control row: Toggle refresh, Hub, Close
            inline_keyboard.push([
                { text: '🔄', callback_data: `checkin_admin_refresh|${chatKey}` },
                { text: truncateLabel(t(lang, 'admin_hub_button_home'), 32), callback_data: 'admin_hub_from_menu' },
                { text: '❌', callback_data: `checkin_admin_close|${chatKey}` }
            ]);
            return { inline_keyboard };
        }

        const section = ADMIN_MENU_SECTION_CONFIG[resolvedView];
        const inline_keyboard = [];
        for (let i = 0; i < section.actions.length; i += 2) {
            const row = [];
            for (let j = i; j < i + 2 && j < section.actions.length; j++) {
                const action = section.actions[j];
                row.push({ text: truncateLabel(t(lang, action.labelKey), 48), callback_data: action.callback(chatKey) });
            }
            inline_keyboard.push(row);
        }

        inline_keyboard.push([
            { text: truncateLabel(t(lang, 'checkin_admin_button_back'), 32), callback_data: `checkin_admin_menu|${chatKey}|home` },
            { text: truncateLabel(t(lang, 'admin_hub_button_home'), 32), callback_data: 'admin_hub_from_menu' }
        ]);
        inline_keyboard.push([
            { text: truncateLabel(t(lang, 'checkin_admin_button_refresh'), 32), callback_data: `checkin_admin_refresh|${chatKey}` },
            { text: truncateLabel(t(lang, 'checkin_admin_button_close'), 32), callback_data: `checkin_admin_close|${chatKey}` }
        ]);

        return { inline_keyboard };
    }

    function formatWalletPreview(wallet) {
        if (!wallet || typeof wallet !== 'string') {
            return null;
        }

        const trimmed = wallet.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed.length <= 12) {
            return trimmed;
        }

        return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
    }

    async function resolveMemberProfile(chatId, userId, lang, cache = null) {
        const cacheKey = userId.toString();
        if (cache && cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }

        let displayName = t(lang, 'checkin_leaderboard_fallback_name', { userId });
        let username = null;
        let fullName = null;

        try {
            const member = await bot.getChatMember(chatId, userId);
            if (member?.user) {
                if (member.user.username) {
                    username = `@${member.user.username}`;
                }

                if (member.user.first_name || member.user.last_name) {
                    fullName = `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim();
                }

                if (fullName) {
                    displayName = fullName;
                } else if (username) {
                    displayName = username;
                }
            }
        } catch (error) {
            // ignore member lookup failures
        }

        const profile = {
            displayName,
            username,
            fullName,
            link: buildAdminProfileLink(userId, displayName)
        };
        if (cache) {
            cache.set(cacheKey, profile);
        }
        return profile;
    }

    async function closeAdminMenu(adminId) {
        const current = checkinAdminMenus.get(adminId);
        if (!current) {
            return;
        }

        try {
            await bot.deleteMessage(adminId, current.messageId);
        } catch (error) {
            // ignore deletion errors
        }

        checkinAdminMenus.delete(adminId);
    }

    async function sendAdminMenu(adminId, chatId, { fallbackLang, view, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        // Prefer messageContext message_id over session
        const currentSession = messageContext?.message_id
            ? { chatId, messageId: messageContext.message_id, view: view || 'home' }
            : checkinAdminMenus.get(adminId);
        const resolvedView = resolveAdminMenuView(view || currentSession?.view);
        const weightPercents = formatQuestionWeightPercentages(getQuestionWeights(settings));
        const scheduleSlots = getScheduleSlots(settings);
        const scheduleText = scheduleSlots.length ? scheduleSlots.join(', ') : '-';
        const summarySlots = getSummaryScheduleSlots(settings);
        const isCheckinEnabled = Number(settings.autoMessageEnabled) === 1;
        const summaryText = summarySlots.length ? summarySlots.join(', ') : '-';
        const titlePreview = settings.promptTemplate ? settings.promptTemplate : t(lang, 'checkin_dm_intro');

        const sanitizeTableCell = (value, max = 96) => {
            const compact = (value || '-').toString().replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
            return truncateLabel(compact, max);
        };

        const toTableRow = (rawLine) => {
            if (!rawLine || typeof rawLine !== 'string') {
                return null;
            }
            const colonIndex = (() => {
                const standard = rawLine.indexOf(':');
                const fullWidth = rawLine.indexOf('：');
                if (standard === -1) return fullWidth;
                if (fullWidth === -1) return standard;
                return Math.min(standard, fullWidth);
            })();
            if (colonIndex === -1) {
                return null;
            }
            const label = rawLine.slice(0, colonIndex).trim();
            const value = rawLine.slice(colonIndex + 1).trim();
            if (!label) {
                return null;
            }
            return {
                label: sanitizeTableCell(label, 48),
                value: sanitizeTableCell(value, 120)
            };
        };

        const summaryLine = summarySlots.length > 0
            ? t(lang, 'checkin_admin_menu_line_summary_schedule', {
                count: summarySlots.length,
                times: summaryText,
                timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
            })
            : t(lang, 'checkin_admin_menu_line_summary_schedule_disabled', {
                timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
            });

        const baseRows = [
            t(lang, 'checkin_admin_menu_line_status', {
                status: isCheckinEnabled ? t(lang, 'checkin_admin_status_on') : t(lang, 'checkin_admin_status_off')
            }),
            t(lang, 'checkin_admin_menu_line_time', { time: settings.checkinTime || CHECKIN_DEFAULT_TIME }),
            t(lang, 'checkin_admin_menu_line_schedule', {
                count: scheduleSlots.length,
                times: scheduleText,
                timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
            }),
            summaryLine,
            t(lang, 'checkin_admin_menu_line_points', { points: settings.dailyPoints || 0 }),
            t(lang, 'checkin_admin_menu_line_summary', { days: settings.summaryWindow || 7 }),
            t(lang, 'checkin_admin_menu_line_question_mix', weightPercents),
            t(lang, 'checkin_admin_title_preview', { title: truncateLabel(titlePreview, 64) }),
            t(lang, 'checkin_admin_menu_line_leaderboard', { start: getLeaderboardPeriodStart(settings) })
        ];

        const tableRows = baseRows
            .map((line) => toTableRow(line))
            .filter(Boolean);

        const headerLabel = sanitizeTableCell(t(lang, 'help_table_command_header'), 48);
        const headerValue = sanitizeTableCell(t(lang, 'help_table_description_header'), 48);
        const tableSource = [
            `| ${headerLabel} | ${headerValue} |`,
            '| --- | --- |',
            ...tableRows.map((row) => `| ${row.label} | ${row.value || '-'} |`)
        ];
        const formattedTable = formatMarkdownTableBlock(tableSource, HELP_TABLE_LAYOUT);
        const section = ADMIN_MENU_SECTION_CONFIG[resolvedView];
        const textLines = [
            `<b>${escapeHtml(t(lang, 'checkin_admin_menu_header'))}</b>`,
            `<pre>${escapeHtml(formattedTable)}</pre>`
        ];

        if (resolvedView === 'home') {
            textLines.push(escapeHtml(t(lang, 'checkin_admin_menu_choose_action')));
        } else {
            const hintKey = section?.hintKey;
            if (hintKey) {
                textLines.push(escapeHtml(t(lang, hintKey)));
            }
        }

        const messageText = textLines.filter(Boolean).join('\n\n');
        const payload = {
            parse_mode: 'HTML',
            reply_markup: buildAdminMenuKeyboard(chatId, lang, resolvedView, settings)
        };

        const session = currentSession;
        if (session) {
            try {
                await bot.editMessageText(messageText, {
                    chat_id: adminId,
                    message_id: session.messageId,
                    parse_mode: payload.parse_mode,
                    reply_markup: payload.reply_markup
                });
                checkinAdminMenus.set(adminId, { chatId, messageId: session.messageId, view: resolvedView });
                return session.messageId;
            } catch (error) {
                try {
                    await bot.deleteMessage(adminId, session.messageId);
                } catch (deleteError) {
                    // ignore
                }
            }
        }

        const message = await bot.sendMessage(adminId, messageText, payload);
        checkinAdminMenus.set(adminId, { chatId, messageId: message.message_id, view: resolvedView });
        return message.message_id;
    }

    function buildLeaderboardModeKeyboard(chatId, lang, activeMode = 'streak') {
        const chatKey = chatId.toString();
        const inline_keyboard = [];
        const modeButtons = LEADERBOARD_MODE_CONFIG.map((entry) => ({
            text: entry.key === activeMode ? `✅ ${t(lang, entry.labelKey)}` : t(lang, entry.labelKey),
            callback_data: `checkin_admin_leaderboard_mode|${chatKey}|${entry.key}`
        }));

        for (let i = 0; i < modeButtons.length; i += 2) {
            inline_keyboard.push(modeButtons.slice(i, i + 2));
        }

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_leaderboard_manage'), callback_data: `checkin_admin_leaderboard_members|${chatKey}` }
        ]);
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_leaderboard_reset'), callback_data: `checkin_admin_leaderboard_reset|${chatKey}` }
        ]);
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatKey}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
        ]);

        return { inline_keyboard };
    }

    async function presentAdminLeaderboardView(adminId, chatId, { fallbackLang, mode = 'streak', messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const periodStart = getLeaderboardPeriodStart(settings);
        const leaderboardText = await buildLeaderboardText(chatId, mode, 10, lang);
        const lines = [
            `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_title'))}</b>`,
            escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
            '',
            `<pre>${escapeHtml(leaderboardText)}</pre>`
        ];

        const messageText = lines.join('\n');
        const payload = {
            parse_mode: 'HTML',
            reply_markup: buildLeaderboardModeKeyboard(chatId, lang, mode)
        };

        if (messageContext?.message_id) {
            try {
                await bot.editMessageText(messageText, {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            } catch (error) {
                // If edit fails, send new message
            }
        }

        await bot.sendMessage(adminId, messageText, payload);
    }

    async function presentAdminLeaderboardManageList(adminId, chatId, { fallbackLang, page = 0, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const periodStart = getLeaderboardPeriodStart(settings);
        const allRows = await db.getTopCheckins(chatId, CHECKIN_ADMIN_SUMMARY_MAX_ROWS, 'points', periodStart);

        if (!allRows || allRows.length === 0) {
            await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_manage_empty'), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            });
            return;
        }

        // Pagination logic
        const totalPages = Math.ceil(allRows.length / CHECKIN_ADMIN_PAGE_SIZE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const startIndex = currentPage * CHECKIN_ADMIN_PAGE_SIZE;
        const rows = allRows.slice(startIndex, startIndex + CHECKIN_ADMIN_PAGE_SIZE);

        const profileCache = new Map();
        const lines = [
            `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_manage_title'))}</b>`,
            escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
            escapeHtml(t(lang, 'checkin_admin_list_count', { count: allRows.length, showing: rows.length })),
            '',
            escapeHtml(t(lang, 'checkin_admin_leaderboard_manage_hint'))
        ];

        const buttons = [];
        for (let i = 0; i < rows.length; i++) {
            const entry = rows[i];
            const rank = startIndex + i + 1;
            const profile = await resolveMemberProfile(chatId, entry.userId, lang, profileCache);
            const profileLink = profile.link || escapeHtml(profile.displayName);
            lines.push('', `${rank}. <b>${profileLink}</b>`);
            lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_points', { points: entry.totalPoints || 0 }))}`);
            lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_days', { count: entry.totalCheckins || 0 }))}`);
            lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_streak', { streak: entry.streak || 0 }))}`);
            lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_longest', { streak: entry.longestStreak || 0 }))}`);
            buttons.push({
                text: truncateLabel(`${rank}. ${profile.displayName}`, 48),
                callback_data: `checkin_admin_leaderboard_member|${chatId}|${entry.userId}`
            });
        }

        const inline_keyboard = [];
        for (let i = 0; i < buttons.length; i += 2) {
            inline_keyboard.push(buttons.slice(i, i + 2));
        }

        // Add pagination row if needed
        if (totalPages > 1) {
            inline_keyboard.push(buildPaginationNavRow('checkin_leaderboard_page', chatId, currentPage, totalPages, lang));
        }

        // Add export buttons
        inline_keyboard.push(buildExportButtons(chatId, lang));

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        const messageText = lines.join('\n');
        const messageOptions = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        };

        // Edit existing message or send new one
        if (messageContext?.chat?.id && messageContext?.message_id) {
            try {
                await bot.editMessageText(messageText, {
                    chat_id: messageContext.chat.id,
                    message_id: messageContext.message_id,
                    ...messageOptions
                });
            } catch (error) {
                if (!error.message?.includes('message is not modified')) {
                    await bot.sendMessage(adminId, messageText, messageOptions);
                }
            }
        } else {
            await bot.sendMessage(adminId, messageText, messageOptions);
        }
    }

    function buildLeaderboardHistoryLines(records, lang, timezone) {
        if (!Array.isArray(records) || records.length === 0) {
            return [t(lang, 'checkin_admin_leaderboard_member_history_empty')];
        }

        return [...records]
            .slice(-CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT)
            .reverse()
            .map((record) => {
                const timestamp = Number(record.updatedAt || record.createdAt || 0);
                return t(lang, 'checkin_admin_leaderboard_member_history_line', {
                    date: record.checkinDate,
                    time: formatDateTimeForTimezone(timezone, timestamp),
                    points: Number(record.pointsAwarded || 0)
                });
            });
    }

    async function presentAdminLeaderboardMemberDetail(adminId, chatId, targetUserId, { fallbackLang, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const periodStart = getLeaderboardPeriodStart(settings);
        const stats = await db.getMemberLeaderboardStats(chatId, targetUserId, periodStart);

        if (!stats || !stats.entries || stats.entries.length === 0) {
            const emptyPayload = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            };
            if (messageContext?.message_id) {
                try {
                    await bot.editMessageText(t(lang, 'checkin_admin_leaderboard_member_history_empty'), {
                        chat_id: messageContext.chat?.id || adminId,
                        message_id: messageContext.message_id,
                        ...emptyPayload
                    });
                    return;
                } catch (error) { /* fallback to send */ }
            }
            await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_member_history_empty'), emptyPayload);
            return;
        }

        const profile = await resolveMemberProfile(chatId, targetUserId, lang);
        const profileLink = profile.link || escapeHtml(profile.displayName);
        const idLink = buildAdminUserIdLink(targetUserId);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const lines = [
            `<b>${t(lang, 'checkin_admin_leaderboard_member_title', { name: profileLink, id: idLink })}</b>`,
            escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
            `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_points', { points: stats.totalPoints || 0 }))}`,
            `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_days', { count: stats.totalCheckins || 0 }))}`,
            `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_streak', { streak: stats.streak || 0 }))}`,
            `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_longest', { streak: stats.longestStreak || 0 }))}`,
            `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_answers_line', { count: stats.totalCheckins || 0 }))}`,
            '',
            `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_history_header'))}</b>`
        ];

        const historyLines = buildLeaderboardHistoryLines(stats.entries, lang, timezone);
        lines.push(...historyLines.map((line) => escapeHtml(line)));

        const inline_keyboard = [
            [{ text: t(lang, 'checkin_admin_leaderboard_remove_button'), callback_data: `checkin_admin_leaderboard_remove|${chatId}|${targetUserId}` }],
            [
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
            ]
        ];

        const messageText = lines.join('\n');
        const payload = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        };

        if (messageContext?.message_id) {
            try {
                await bot.editMessageText(messageText, {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            } catch (error) { /* fallback to send */ }
        }

        await bot.sendMessage(adminId, messageText, payload);
    }

    async function promptLeaderboardReset(adminId, chatId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const periodStart = getLeaderboardPeriodStart(settings);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const chatKey = chatId.toString();
        const lines = [
            `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_reset_title'))}</b>`,
            escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
            '',
            escapeHtml(t(lang, 'checkin_admin_leaderboard_reset_hint', { timezone }))
        ];

        const inline_keyboard = [
            [{ text: t(lang, 'checkin_admin_leaderboard_reset_confirm'), callback_data: `checkin_admin_leaderboard_reset_confirm|${chatKey}` }],
            [
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatKey}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
            ]
        ];

        await bot.sendMessage(adminId, lines.join('\n'), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        });
    }

    async function confirmLeaderboardReset(adminId, chatId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const today = formatDateForTimezone(timezone);
        await db.setLeaderboardPeriodStart(chatId, today, timezone);
        await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_reset_done', { start: today }), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
    }

    async function confirmLeaderboardRemoval(adminId, chatId, targetUserId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const periodStart = getLeaderboardPeriodStart(settings);
        await db.clearMemberLeaderboardEntries(chatId, targetUserId, periodStart);
        await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_remove_done', { id: targetUserId, start: periodStart }), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
    }

    // ========= PAGINATION HELPER =========
    function buildPaginationNavRow(prefix, chatId, currentPage, totalPages, lang) {
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({ text: '⬅️', callback_data: `${prefix}_page|${chatId}|${currentPage - 1}` });
        }
        if (totalPages > 1) {
            navRow.push({ text: t(lang, 'checkin_admin_page_indicator', { page: currentPage + 1, total: totalPages }), callback_data: 'noop' });
        }
        if (currentPage < totalPages - 1) {
            navRow.push({ text: '➡️', callback_data: `${prefix}_page|${chatId}|${currentPage + 1}` });
        }
        return navRow;
    }

    function buildExportButtons(chatId, lang) {
        return [
            { text: t(lang, 'checkin_admin_export_csv'), callback_data: `checkin_export|${chatId}|csv` },
            { text: t(lang, 'checkin_admin_export_json'), callback_data: `checkin_export|${chatId}|json` }
        ];
    }

    async function sendTodayCheckinList(chatId, adminId, { fallbackLang, page = 0, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        const records = await db.getCheckinsForDate(chatId, today);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const profileCache = new Map();

        if (!records || records.length === 0) {
            const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_today_empty'), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            });
            scheduleMessageDeletion(adminId, message.message_id, 15000);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(records.length / CHECKIN_ADMIN_PAGE_SIZE));
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
        const pageRecords = records.slice(currentPage * CHECKIN_ADMIN_PAGE_SIZE, (currentPage + 1) * CHECKIN_ADMIN_PAGE_SIZE);

        const lines = [
            t(lang, 'checkin_admin_today_header'),
            t(lang, 'checkin_admin_list_count', { count: records.length, showing: pageRecords.length }),
            ''
        ];

        for (const record of pageRecords) {
            const profile = await resolveMemberProfile(chatId, record.userId, lang, profileCache);
            const memberSummary = await db.getCheckinMemberSummary(chatId, record.userId);
            const safeId = buildAdminUserIdLink(record.userId);
            const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
            const entryLines = [
                t(lang, 'checkin_admin_today_member_line', {
                    name: safeName,
                    id: safeId
                })
            ];

            if (profile.username && profile.username !== profile.displayName) {
                entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_username_line', {
                    username: `<code>${escapeHtml(profile.username)}</code>`
                })}`);
            }

            if (profile.fullName && profile.fullName !== profile.displayName) {
                entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_fullname_line', {
                    fullName: `<i>${escapeHtml(profile.fullName)}</i>`
                })}`);
            }

            const walletText = record.walletAddress
                ? t(lang, 'checkin_admin_today_wallet', { wallet: `<code>${escapeHtml(record.walletAddress)}</code>` })
                : t(lang, 'checkin_admin_today_wallet', { wallet: `<i>${escapeHtml(t(lang, 'checkin_admin_wallet_unknown'))}</i>` });
            entryLines.push(`${ADMIN_DETAIL_BULLET}${walletText}`);

            const pointsValue = Number.isFinite(Number(record.pointsAwarded))
                ? Number(record.pointsAwarded)
                : 0;
            entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_points', { points: pointsValue }))}`);

            const totalPointsValue = Number.isFinite(Number(memberSummary?.totalPoints))
                ? Number(memberSummary.totalPoints)
                : pointsValue;
            entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_total_points', { points: totalPointsValue }))}`);

            if (record.emotion) {
                entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_emotion', { emotion: record.emotion }))}`);
            }

            if (record.goal) {
                entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_goal', { goal: record.goal }))}`);
            }

            lines.push(entryLines.join('\n'));
            lines.push('');
        }

        const inline_keyboard = [];

        // Pagination navigation
        if (totalPages > 1) {
            inline_keyboard.push(buildPaginationNavRow('checkin_today', chatId, currentPage, totalPages, lang));
        }

        // Export buttons
        inline_keyboard.push(buildExportButtons(chatId, lang));

        // Back/Close buttons
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        const payload = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        };

        if (messageContext?.message_id) {
            try {
                await bot.editMessageText(lines.join('\n').trim(), {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            } catch (error) {
                // If edit fails, send new message
            }
        }

        const message = await bot.sendMessage(adminId, lines.join('\n').trim(), payload);
        scheduleMessageDeletion(adminId, message.message_id, 120000);
    }

    async function promptAdminSummaryReset(chatId, adminId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const periodStart = getSummaryPeriodStart(settings);
        const lines = [
            `<b>${escapeHtml(t(lang, 'checkin_admin_summary_reset_title'))}</b>`,
            escapeHtml(t(lang, 'checkin_admin_summary_reset_hint', {
                days: Math.max(rangeDays, 1),
                start: startDate || '—',
                end: endDate || '—',
                timezone
            }))
        ];
        if (periodStart) {
            lines.push('', escapeHtml(t(lang, 'checkin_admin_summary_reset_period_note', { reset: periodStart })));
        }

        const inline_keyboard = [
            [
                { text: t(lang, 'checkin_admin_button_summary_reset_confirm'), callback_data: `checkin_admin_summary_reset_confirm|${chatId}` },
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` }
            ],
            [{ text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }]
        ];

        await bot.sendMessage(adminId, lines.join('\n'), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        });
    }

    async function executeAdminSummaryReset(chatId, adminId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const today = formatDateForTimezone(timezone);
        await db.setSummaryPeriodStart(chatId, today, timezone);
        await db.resetSummaryMessageLogs(chatId);
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_reset_success', { start: today }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'members' });
    }

    async function sendSummaryWindowCheckinList(chatId, adminId, { fallbackLang, page = 0, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
        if (!startDate || !endDate || startDate > endDate) {
            await bot.sendMessage(adminId, t(lang, 'checkin_admin_summary_window_empty', { days: settings.summaryWindow || 7 }), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            });
            return;
        }

        const records = await db.getCheckinsInRange(chatId, startDate, endDate);
        const profileCache = new Map();

        if (!records || records.length === 0) {
            const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_summary_window_empty', { days: Math.max(rangeDays, 1) }), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            });
            scheduleMessageDeletion(adminId, message.message_id, 15000);
            return;
        }

        const summaryMap = new Map();
        for (const record of records) {
            const userKey = record.userId.toString();
            const stats = summaryMap.get(userKey) || { days: 0, points: 0, wallet: null };
            stats.days += 1;
            stats.points += Number(record.pointsAwarded || 0);
            if (record.walletAddress && !stats.wallet) {
                stats.wallet = record.walletAddress;
            }
            summaryMap.set(userKey, stats);
        }

        const allSortedEntries = Array.from(summaryMap.entries())
            .sort((a, b) => {
                if (b[1].days !== a[1].days) {
                    return b[1].days - a[1].days;
                }
                if (b[1].points !== a[1].points) {
                    return b[1].points - a[1].points;
                }
                return Number(a[0]) - Number(b[0]);
            });

        const effectivePageSize = (CHECKIN_ADMIN_PAGE_SIZE && CHECKIN_ADMIN_PAGE_SIZE > 0) ? CHECKIN_ADMIN_PAGE_SIZE : 10;
        const totalPages = Math.max(1, Math.ceil(allSortedEntries.length / effectivePageSize));
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
        const pageEntries = allSortedEntries.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize);

        const lines = [
            t(lang, 'checkin_admin_summary_window_header', {
                days: Math.max(rangeDays, 1),
                start: startDate,
                end: endDate,
                members: summaryMap.size
            }),
            t(lang, 'checkin_admin_list_count', { count: allSortedEntries.length, showing: pageEntries.length }),
            ''
        ];

        const baseRank = currentPage * effectivePageSize;
        for (let index = 0; index < pageEntries.length; index += 1) {
            const [userId, stats] = pageEntries[index];
            const profile = await resolveMemberProfile(chatId, userId, lang, profileCache);
            const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;

            // Single line with all info: rank, name, days, points, ID (same as broadcast)
            lines.push(t(lang, 'checkin_summary_broadcast_line', {
                rank: baseRank + index + 1,
                name: safeName,
                id: userId,
                days: stats.days,
                points: stats.points
            }));
        }

        const inline_keyboard = [];

        // Pagination navigation
        if (totalPages > 1) {
            inline_keyboard.push(buildPaginationNavRow('checkin_summary', chatId, currentPage, totalPages, lang));
        }

        // Export buttons
        inline_keyboard.push(buildExportButtons(chatId, lang));

        // Back/Close buttons
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        const payload = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        };

        if (messageContext?.message_id) {
            try {
                await bot.editMessageText(lines.join('\n').trim(), {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            } catch (error) {
                // If edit fails, send new message
            }
        }

        const message = await bot.sendMessage(adminId, lines.join('\n').trim(), payload);
        scheduleMessageDeletion(adminId, message.message_id, 120000);
    }

    async function promptAdminForRemoval(chatId, adminId, { fallbackLang, page = 0, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        const records = await db.getCheckinsForDate(chatId, today);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const profileCache = new Map();

        if (!records || records.length === 0) {
            const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_remove_empty'), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            });
            scheduleMessageDeletion(adminId, message.message_id, 15000);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(records.length / CHECKIN_ADMIN_PAGE_SIZE));
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
        const pageRecords = records.slice(currentPage * CHECKIN_ADMIN_PAGE_SIZE, (currentPage + 1) * CHECKIN_ADMIN_PAGE_SIZE);

        const inline_keyboard = [];
        const lines = [
            t(lang, 'checkin_admin_remove_prompt'),
            t(lang, 'checkin_admin_list_count', { count: records.length, showing: pageRecords.length }),
            ''
        ];

        for (const record of pageRecords) {
            const profile = await resolveMemberProfile(chatId, record.userId, lang, profileCache);
            const walletPreview = formatWalletPreview(record.walletAddress)
                || t(lang, 'checkin_admin_wallet_unknown');
            const safeId = buildAdminUserIdLink(record.userId);
            const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
            const walletDisplay = record.walletAddress
                ? t(lang, 'checkin_admin_today_wallet', { wallet: `<code>${escapeHtml(record.walletAddress)}</code>` })
                : t(lang, 'checkin_admin_today_wallet', { wallet: `<i>${escapeHtml(t(lang, 'checkin_admin_wallet_unknown'))}</i>` });
            const pointsValue = Number.isFinite(Number(record.pointsAwarded))
                ? Number(record.pointsAwarded)
                : 0;
            const memberSummary = await db.getCheckinMemberSummary(chatId, record.userId);
            const totalPointsValue = Number.isFinite(Number(memberSummary?.totalPoints))
                ? Number(memberSummary.totalPoints)
                : pointsValue;

            const entryLines = [
                t(lang, 'checkin_admin_today_member_line', {
                    name: safeName,
                    id: safeId
                })
            ];

            if (profile.username && profile.username !== profile.displayName) {
                entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_username_line', {
                    username: `<code>${escapeHtml(profile.username)}</code>`
                })}`);
            }

            if (profile.fullName && profile.fullName !== profile.displayName) {
                entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_fullname_line', {
                    fullName: `<i>${escapeHtml(profile.fullName)}</i>`
                })}`);
            }

            entryLines.push(`${ADMIN_DETAIL_BULLET}${walletDisplay}`);
            entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_points', { points: pointsValue }))}`);
            entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_total_points', { points: totalPointsValue }))}`);

            lines.push(entryLines.join('\n'));
            lines.push('');

            const buttonLabelRaw = t(lang, 'checkin_admin_remove_option_detail', {
                user: profile.displayName,
                wallet: walletPreview,
                id: record.userId
            });
            inline_keyboard.push([{
                text: truncateLabel(buttonLabelRaw, 64),
                callback_data: `checkin_admin_remove_confirm|${chatId}|${record.userId}`
            }]);
        }

        // Pagination navigation
        if (totalPages > 1) {
            inline_keyboard.push(buildPaginationNavRow('checkin_remove', chatId, currentPage, totalPages, lang));
        }

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        const payload = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        };

        if (messageContext?.message_id) {
            try {
                await bot.editMessageText(lines.join('\n').trim(), {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            } catch (error) {
                // If edit fails, send new message
            }
        }

        await bot.sendMessage(adminId, lines.join('\n').trim(), payload);
    }

    async function promptAdminUnlock(chatId, adminId, { fallbackLang, page = 0, messageContext = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        const locked = await db.getLockedMembers(chatId, today);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const profileCache = new Map();

        if (!locked || locked.length === 0) {
            const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_unlock_empty'), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ]]
                }
            });
            scheduleMessageDeletion(adminId, message.message_id, 15000);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(locked.length / CHECKIN_ADMIN_PAGE_SIZE));
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
        const pageEntries = locked.slice(currentPage * CHECKIN_ADMIN_PAGE_SIZE, (currentPage + 1) * CHECKIN_ADMIN_PAGE_SIZE);

        const inline_keyboard = [];
        const lines = [
            escapeHtml(t(lang, 'checkin_admin_unlock_prompt')),
            t(lang, 'checkin_admin_list_count', { count: locked.length, showing: pageEntries.length }),
            ''
        ];

        const baseIndex = currentPage * CHECKIN_ADMIN_PAGE_SIZE;
        for (let index = 0; index < pageEntries.length; index += 1) {
            const entry = pageEntries[index];
            const profile = await resolveMemberProfile(chatId, entry.userId, lang, profileCache);
            const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
            const safeId = buildAdminUserIdLink(entry.userId);
            lines.push(t(lang, 'checkin_admin_unlock_list_line', {
                index: baseIndex + index + 1,
                name: safeName,
                id: safeId
            }));
            inline_keyboard.push([{
                text: t(lang, 'checkin_admin_unlock_option', { name: profile.displayName, id: entry.userId }),
                callback_data: `checkin_admin_unlock_confirm|${chatId}|${entry.userId}`
            }]);
        }

        // Pagination navigation
        if (totalPages > 1) {
            inline_keyboard.push(buildPaginationNavRow('checkin_unlock', chatId, currentPage, totalPages, lang));
        }

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        const payload = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        };

        if (messageContext?.message_id) {
            try {
                await bot.editMessageText(lines.join('\n').trim(), {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            } catch (error) {
                // If edit fails, send new message
            }
        }

        await bot.sendMessage(adminId, lines.join('\n').trim(), payload);
    }

    async function promptAdminSecretMessage(chatId, adminId, { fallbackLang, page = 0, message = null } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        const records = await db.getCheckinsForDate(chatId, today);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const profileCache = new Map();
        const pageSize = 10;
        const uniqueRecipients = Array.isArray(records)
            ? Array.from(new Set(records.map((record) => record.userId.toString())))
            : [];
        const totalPages = Math.max(1, Math.ceil(uniqueRecipients.length / pageSize));

        const renderPage = async ({ page = 0, messageContext = null } = {}) => {
            if (!records || records.length === 0) {
                const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_dm_empty'), {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                        ]]
                    }
                });
                scheduleMessageDeletion(adminId, message.message_id, 15000);
                return;
            }

            const normalizedPage = Math.min(Math.max(page, 0), totalPages - 1);
            const inline_keyboard = [];
            const broadcastCount = Math.min(uniqueRecipients.length, CHECKIN_ADMIN_DM_MAX_RECIPIENTS);

            if (broadcastCount > 0) {
                inline_keyboard.push([
                    {
                        text: t(lang, 'checkin_admin_dm_option_all', { count: broadcastCount }),
                        callback_data: `checkin_admin_dm_all|${chatId}`
                    }
                ]);
            }

            const recipientSlice = uniqueRecipients.slice(normalizedPage * pageSize, (normalizedPage + 1) * pageSize);
            for (const userId of recipientSlice) {
                const profile = await resolveMemberProfile(chatId, userId, lang, profileCache);
                inline_keyboard.push([{
                    text: t(lang, 'checkin_admin_dm_option', { name: profile.displayName, id: userId }),
                    callback_data: `checkin_admin_dm_target|${chatId}|${userId}`
                }]);
            }

            if (totalPages > 1) {
                const navRow = [];
                if (normalizedPage > 0) {
                    navRow.push({ text: '⬅️', callback_data: `checkin_admin_dm_page|${chatId}|${normalizedPage - 1}` });
                }
                navRow.push({ text: `📄 ${normalizedPage + 1}/${totalPages}`, callback_data: 'noop' });
                if (normalizedPage < totalPages - 1) {
                    navRow.push({ text: '➡️', callback_data: `checkin_admin_dm_page|${chatId}|${normalizedPage + 1}` });
                }
                inline_keyboard.push(navRow);
            }

            inline_keyboard.push([
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
            ]);

            const messageLines = [t(lang, 'checkin_admin_dm_prompt')];
            if (uniqueRecipients.length > CHECKIN_ADMIN_DM_MAX_RECIPIENTS) {
                messageLines.push('', t(lang, 'checkin_admin_dm_all_limit_note', { count: CHECKIN_ADMIN_DM_MAX_RECIPIENTS }));
            }
            if (totalPages > 1) {
                messageLines.push('', `📄 Trang ${normalizedPage + 1}/${totalPages}`);
            }

            const payload = {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard }
            };

            if (messageContext?.message_id) {
                await bot.editMessageText(messageLines.join('\n'), {
                    chat_id: messageContext.chat?.id || adminId,
                    message_id: messageContext.message_id,
                    ...payload
                });
                return;
            }

            await bot.sendMessage(adminId, messageLines.join('\n'), payload);
        };

        await renderPage({ page, messageContext: message });
    }

    const { startCheckinScheduler } = createCheckinScheduler({
        db,
        getScheduleSlots,
        getSummaryScheduleSlots,
        sendCheckinAnnouncement,
        sendSummaryAnnouncement,
        calculateInclusiveDayDiff,
        formatDateForTimezone,
        formatTimeForTimezone,
        CHECKIN_SCHEDULER_INTERVAL,
        CHECKIN_DEFAULT_TIMEZONE
    });

    async function promptAdminPoints(chatId, adminId, { fallbackLang } = {}) {
        const options = [5, 10, 20, 30];
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const inline_keyboard = options.map((value) => ([{
            text: t(lang, 'checkin_admin_points_option', { value }),
            callback_data: `checkin_admin_points_set|${chatId}|${value}`
        }]));
        inline_keyboard.push([{ text: t(lang, 'checkin_admin_button_custom'), callback_data: `checkin_admin_points_custom|${chatId}` }]);

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        await bot.sendMessage(adminId, t(lang, 'checkin_admin_points_title'), {
            reply_markup: { inline_keyboard }
        });
    }

    async function promptAdminSummaryWindow(chatId, adminId, { fallbackLang } = {}) {
        const options = [7, 14, 30];
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const inline_keyboard = options.map((value) => ([{
            text: t(lang, 'checkin_admin_summary_option', { value }),
            callback_data: `checkin_admin_summary_set|${chatId}|${value}`
        }]));
        inline_keyboard.push([{ text: t(lang, 'checkin_admin_button_custom'), callback_data: `checkin_admin_summary_custom|${chatId}` }]);

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        await bot.sendMessage(adminId, t(lang, 'checkin_admin_summary_title'), {
            reply_markup: { inline_keyboard }
        });
    }

    async function promptAdminSchedule(chatId, adminId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const slots = getScheduleSlots(settings);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const lines = [
            t(lang, 'checkin_admin_schedule_title'),
            '',
            t(lang, 'checkin_admin_schedule_timezone', { timezone }),
            slots.length > 0
                ? `${t(lang, 'checkin_admin_schedule_current', { count: slots.length })}\n${slots.map((slot, idx) => `${idx + 1}. ${slot}`).join('\n')}`
                : t(lang, 'checkin_admin_schedule_none'),
            '',
            t(lang, 'checkin_admin_schedule_hint')
        ];

        const inline_keyboard = CHECKIN_SCHEDULE_PRESETS.map((preset) => ([{
            text: t(lang, preset.labelKey),
            callback_data: `checkin_admin_schedule_preset|${chatId}|${preset.slots.join(',')}`
        }]));

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_schedule_custom'), callback_data: `checkin_admin_schedule_custom|${chatId}` },
            { text: t(lang, 'checkin_admin_button_schedule_clear'), callback_data: `checkin_admin_schedule_clear|${chatId}` }
        ]);

        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        await bot.sendMessage(adminId, lines.join('\n'), { reply_markup: { inline_keyboard } });
    }

    async function setAdminScheduleSlots(chatId, adminId, slots, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const sanitized = sanitizeScheduleSlots(slots);
        if (sanitized.length === 0) {
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_schedule_invalid'));
            return;
        }

        await db.updateCheckinGroup(chatId, {
            autoMessageTimes: sanitized,
            checkinTime: sanitized[0]
        });

        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_schedule_updated', {
            count: sanitized.length,
            times: sanitized.join(', ')
        }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
    }

    async function resetAdminScheduleSlots(chatId, adminId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const settings = await getGroupCheckinSettings(chatId);
        const fallbackSlot = normalizeTimeSlot(settings.checkinTime) || CHECKIN_DEFAULT_TIME;
        await db.updateCheckinGroup(chatId, {
            autoMessageTimes: [fallbackSlot],
            checkinTime: fallbackSlot
        });
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_schedule_cleared', { time: fallbackSlot }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
    }

    async function promptAdminSummarySchedule(chatId, adminId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const enabled = Number(settings.summaryMessageEnabled) === 1;
        const slots = enabled ? getSummaryScheduleSlots(settings) : [];
        const timesList = slots.map((slot, index) => `${index + 1}. ${slot}`).join('\n');
        const statusLine = enabled && slots.length > 0
            ? t(lang, 'checkin_admin_summary_schedule_current', { count: slots.length, times: timesList })
            : t(lang, 'checkin_admin_summary_schedule_none');
        const usingAutoFallback = enabled && (!Array.isArray(settings.summaryMessageTimes) || settings.summaryMessageTimes.length === 0);
        const lines = [
            t(lang, 'checkin_admin_summary_schedule_title'),
            t(lang, 'checkin_admin_summary_schedule_hint', { timezone }),
            '',
            statusLine
        ];
        if (usingAutoFallback && slots.length > 0) {
            lines.push('', t(lang, 'checkin_admin_summary_schedule_auto_note', { count: slots.length }));
        }
        const inline_keyboard = SUMMARY_SCHEDULE_PRESETS.map((preset) => ([{
            text: t(lang, preset.labelKey),
            callback_data: `checkin_admin_summary_schedule_preset|${chatId}|${preset.slots.join(',')}`
        }]));
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_summary_schedule_reset'), callback_data: `checkin_admin_summary_schedule_reset|${chatId}` }
        ]);
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_summary_schedule_sync'), callback_data: `checkin_admin_summary_schedule_sync|${chatId}` }
        ]);
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_summary_schedule_custom'), callback_data: `checkin_admin_summary_schedule_custom|${chatId}` },
            { text: t(lang, 'checkin_admin_button_summary_schedule_disable'), callback_data: `checkin_admin_summary_schedule_disable|${chatId}` }
        ]);
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]);

        await bot.sendMessage(adminId, lines.join('\n'), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard }
        });
    }

    async function setAdminSummaryScheduleSlots(chatId, adminId, slots, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const sanitized = sanitizeScheduleSlots(slots);
        if (sanitized.length === 0) {
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_invalid'));
            return;
        }

        await db.updateCheckinGroup(chatId, {
            summaryMessageTimes: sanitized,
            summaryMessageEnabled: 1
        });
        await db.resetSummaryMessageLogs(chatId);

        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_updated', {
            count: sanitized.length,
            times: sanitized.join(', ')
        }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
    }

    async function disableAdminSummarySchedule(chatId, adminId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await db.updateCheckinGroup(chatId, {
            summaryMessageTimes: [],
            summaryMessageEnabled: 0
        });
        await db.resetSummaryMessageLogs(chatId);
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_disabled_alert'));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
    }

    async function resetAdminSummarySchedule(chatId, adminId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const slots = getScheduleSlots(settings);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await db.updateCheckinGroup(chatId, {
            summaryMessageTimes: slots,
            summaryMessageEnabled: 1
        });
        await db.resetSummaryMessageLogs(chatId);
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_reset_success', {
            count: slots.length,
            times: slots.join(', ')
        }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
    }

    async function syncAdminSummaryScheduleWithAuto(chatId, adminId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const slots = getScheduleSlots(settings);
        await db.updateCheckinGroup(chatId, {
            summaryMessageTimes: [],
            summaryMessageEnabled: 1
        });
        await db.resetSummaryMessageLogs(chatId);
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_sync_success', {
            count: slots.length,
            times: slots.join(', ')
        }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
    }

    async function executeAdminRemoval(chatId, adminId, targetUserId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        const adminLang = await resolveNotificationLanguage(adminId, fallbackLang);
        const record = await db.getCheckinRecord(chatId, targetUserId, today);
        if (!record) {
            await sendEphemeralMessage(adminId, t(adminLang, 'checkin_admin_remove_missing'));
            return;
        }

        const success = await db.removeCheckinRecord(chatId, targetUserId, today);
        if (!success) {
            await sendEphemeralMessage(adminId, t(adminLang, 'checkin_admin_remove_missing'));
            return;
        }

        const profile = await resolveMemberProfile(chatId, targetUserId, adminLang);
        const walletLabel = record.walletAddress
            ? `<code>${escapeHtml(record.walletAddress)}</code>`
            : `<i>${escapeHtml(t(adminLang, 'checkin_admin_wallet_unknown'))}</i>`;
        const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const idLabel = buildAdminUserIdLink(targetUserId);

        await sendEphemeralMessage(
            adminId,
            t(adminLang, 'checkin_admin_remove_success', {
                user: userLabel,
                id: idLabel,
                wallet: walletLabel
            }),
            { parse_mode: 'HTML' }
        );
        try {
            const userLang = await resolveNotificationLanguage(targetUserId);
            await bot.sendMessage(targetUserId, t(userLang, 'checkin_dm_removed'));
        } catch (error) {
            // ignore DM failures
        }

        await sendAdminMenu(adminId, chatId, { fallbackLang: adminLang });
    }

    async function executeAdminUnlock(chatId, adminId, targetUserId, { fallbackLang } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
        await db.unlockMemberCheckin(chatId, targetUserId);
        await db.clearDailyAttempts(chatId, targetUserId, today);
        const adminLang = await resolveNotificationLanguage(adminId, fallbackLang);
        const profile = await resolveMemberProfile(chatId, targetUserId, adminLang);
        const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const idLabel = buildAdminUserIdLink(targetUserId);
        await sendEphemeralMessage(adminId, t(adminLang, 'checkin_admin_unlock_success', {
            user: userLabel,
            id: idLabel
        }), { parse_mode: 'HTML' });
        try {
            const userLang = await resolveNotificationLanguage(targetUserId);
            await bot.sendMessage(targetUserId, t(userLang, 'checkin_dm_unlocked'));
        } catch (error) {
            // ignore DM failures
        }

        await sendAdminMenu(adminId, chatId, { fallbackLang: adminLang });
    }

    async function setAdminDailyPoints(chatId, adminId, value, { fallbackLang } = {}) {
        const numeric = Number(value);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        if (!Number.isFinite(numeric) || numeric < 0) {
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_points_invalid'));
            return;
        }

        await db.updateCheckinGroup(chatId, { dailyPoints: numeric });
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_points_updated', { value: numeric }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    async function setCheckinTitleTemplate(chatId, adminId, template, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const normalized = (template || '').trim();
        if (!normalized) {
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_title_invalid'));
            return;
        }

        const clipped = normalized.slice(0, 200);
        await db.updateCheckinGroup(chatId, { promptTemplate: clipped });
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_title_saved'));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    async function resetCheckinTitleTemplate(chatId, adminId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await db.updateCheckinGroup(chatId, { promptTemplate: '' });
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_title_reset'));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    async function promptCheckinTitleTemplate(chatId, adminId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const defaultTitle = t(lang, 'checkin_dm_intro');
        const example = t(lang, 'checkin_admin_title_example');
        const promptText = t(lang, 'checkin_admin_title_prompt', { default: defaultTitle, example });
        const promptMessage = await bot.sendMessage(adminId, promptText, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                    ],
                    [{ text: t(lang, 'checkin_admin_button_title_reset'), callback_data: `checkin_admin_title_reset|${chatId}` }],
                    [{ text: t(lang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${chatId}` }]
                ]
            }
        });

        checkinAdminStates.set(adminId.toString(), {
            type: 'title_custom',
            chatId,
            promptMessageId: promptMessage.message_id
        });
    }

    async function setAdminSummaryWindow(chatId, adminId, value, { fallbackLang } = {}) {
        const numeric = Number(value);
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_invalid'));
            return;
        }

        await db.updateCheckinGroup(chatId, { summaryWindow: Math.round(numeric) });
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_updated', { value: Math.round(numeric) }));
        await sendAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    async function sendWelcomeAdminMenu(targetChatId, configChatId, { fallbackLang, replyMessage = null, editOnly = false } = {}) {
        const lang = await resolveNotificationLanguage(targetChatId, fallbackLang);
        if (typeof buildWelcomeAdminPayload !== 'function') {
            throw new Error('buildWelcomeAdminPayload is not configured');
        }
        const payload = await buildWelcomeAdminPayload(configChatId, lang);
        const options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: payload.reply_markup
        };
        const existing = welcomeAdminMenus.get(targetChatId);
        if (existing?.messageId) {
            try {
                await bot.editMessageText(payload.text, {
                    chat_id: targetChatId,
                    message_id: existing.messageId,
                    ...options
                });
                welcomeAdminMenus.set(targetChatId, { messageId: existing.messageId, chatId: configChatId });
                return existing.messageId;
            } catch (error) {
                welcomeAdminMenus.delete(targetChatId);
            }
        }

        if (editOnly) {
            return null;
        }

        if (replyMessage?.message_id) {
            options.reply_to_message_id = replyMessage.message_id;
            options.allow_sending_without_reply = true;
        }
        const sent = await bot.sendMessage(targetChatId, payload.text, options);
        if (sent?.message_id) {
            welcomeAdminMenus.set(targetChatId, { messageId: sent.message_id, chatId: configChatId });
            return sent.message_id;
        }
        return null;
    }

    function setWelcomeAdminPayloadBuilder(builder) {
        buildWelcomeAdminPayload = builder;
    }

    async function launchWelcomeAdminFlow({ actorId, chatId, chatType, lang, replyMessage = null, notifyInChat = true } = {}) {
        if (!actorId) {
            return { status: 'invalid_actor' };
        }

        if (chatType === 'private') {
            try {
                await openAdminHub(actorId, { fallbackLang: lang, mode: 'welcome' });
                return { status: 'dm_opened' };
            } catch (error) {
                console.error(`[WelcomeAdmin] Failed to open hub for ${actorId}: ${error.message}`);
                return { status: 'error', error };
            }
        }

        if (!['group', 'supergroup'].includes(chatType || '')) {
            return { status: 'invalid_chat' };
        }

        const isAdminUser = await isGroupAdmin(chatId, actorId);
        if (!isAdminUser) {
            return { status: 'forbidden' };
        }

        try {
            await db.ensureCheckinGroup(chatId.toString());
        } catch (error) {
            console.error(`[WelcomeAdmin] Failed to register group ${chatId}: ${error.message}`);
        }

        try {
            await openAdminHub(actorId, { fallbackLang: lang, mode: 'welcome' });
            await sendWelcomeAdminMenu(actorId, chatId, { fallbackLang: lang });
            if (notifyInChat && replyMessage) {
                await sendReply(replyMessage, t(lang, 'welcome_admin_dm_notice'));
            }
            return { status: 'opened' };
        } catch (error) {
            console.error(`[WelcomeAdmin] Failed to open menu for ${actorId} in ${chatId}: ${error.message}`);
            return { status: 'error', error };
        }
    }

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
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
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
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
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
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
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
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    async function resetWelcomeTitleTemplate(chatId, adminId, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await saveWelcomeVerificationSettings(chatId, { titleTemplate: '' });
        await sendEphemeralMessage(adminId, t(lang, 'welcome_admin_title_reset'));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
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
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    async function toggleWelcomeVerification(chatId, adminId, enabled, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        await saveWelcomeVerificationSettings(chatId, { enabled: Boolean(enabled) });
        await sendEphemeralMessage(adminId, t(lang, enabled ? 'welcome_admin_enabled' : 'welcome_admin_disabled'));
        await sendWelcomeAdminMenu(adminId, chatId, { fallbackLang: lang });
    }

    // ==========================================================
    // ?? PH?N 1: API SERVER
    // ==========================================================
    // ========================================================== // ?? PHẦN 2: LOGIC BOT TELEGRAM (ĐÃ SỬA LẠI LOGIC NGÔN NGỮ)
    // ==========================================================

    // ===== EXPORT FUNCTIONS =====
    async function generateCheckinExportData(chatId) {
        const settings = await getGroupCheckinSettings(chatId);
        const periodStart = getLeaderboardPeriodStart(settings);
        const { startDate, endDate } = getSummaryWindowBounds(settings);

        // Get all checkin records in the summary window
        const records = await db.getCheckinsInRange(chatId, startDate, endDate);
        if (!records || records.length === 0) {
            return { records: [], summary: [] };
        }

        // Build summary per user
        const summaryMap = new Map();
        for (const record of records) {
            const userKey = record.userId.toString();
            const stats = summaryMap.get(userKey) || {
                userId: record.userId,
                days: 0,
                points: 0,
                wallet: null,
                lastCheckin: null
            };
            stats.days += 1;
            stats.points += Number(record.pointsAwarded || 0);
            if (record.walletAddress && !stats.wallet) {
                stats.wallet = record.walletAddress;
            }
            if (!stats.lastCheckin || record.checkinDate > stats.lastCheckin) {
                stats.lastCheckin = record.checkinDate;
            }
            summaryMap.set(userKey, stats);
        }

        // Get member stats from DB
        const membersWithStats = [];
        for (const [userId, stats] of summaryMap) {
            const memberSummary = await db.getCheckinMemberSummary(chatId, userId);
            membersWithStats.push({
                userId,
                walletAddress: stats.wallet || '',
                checkinDays: stats.days,
                periodPoints: stats.points,
                totalPoints: memberSummary?.totalPoints || stats.points,
                streak: memberSummary?.streak || 0,
                longestStreak: memberSummary?.longestStreak || 0,
                totalCheckins: memberSummary?.totalCheckins || stats.days,
                lastCheckin: stats.lastCheckin
            });
        }

        // Sort by total points descending
        membersWithStats.sort((a, b) => b.periodPoints - a.periodPoints);

        return {
            settings: {
                chatId,
                timezone: settings.timezone,
                summaryWindow: settings.summaryWindow,
                periodStart,
                exportDate: new Date().toISOString()
            },
            summary: membersWithStats,
            totalMembers: membersWithStats.length,
            totalRecords: records.length
        };
    }

    function formatExportCSV(data) {
        const header = 'Rank,User ID,Wallet Address,Check-in Days,Period Points,Total Points,Current Streak,Longest Streak,Last Check-in\n';
        const rows = data.summary.map((m, index) =>
            `${index + 1},"${m.userId}","${m.walletAddress}",${m.checkinDays},${m.periodPoints},${m.totalPoints},${m.streak},${m.longestStreak},"${m.lastCheckin || ''}"`
        ).join('\n');
        return header + rows;
    }

    function formatExportJSON(data) {
        return JSON.stringify(data, null, 2);
    }

    async function handleExportRequest(chatId, adminId, format, { fallbackLang } = {}) {
        const lang = await resolveNotificationLanguage(adminId, fallbackLang);

        try {
            const data = await generateCheckinExportData(chatId);

            if (!data.summary || data.summary.length === 0) {
                await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_export_empty'));
                return;
            }

            let content, filename, mimeType;
            if (format === 'csv') {
                content = Buffer.from(formatExportCSV(data), 'utf-8');
                filename = `checkin_export_${chatId}_${Date.now()}.csv`;
                mimeType = 'text/csv';
            } else {
                content = Buffer.from(formatExportJSON(data), 'utf-8');
                filename = `checkin_export_${chatId}_${Date.now()}.json`;
                mimeType = 'application/json';
            }

            await bot.sendDocument(adminId, content, {
                caption: t(lang, 'checkin_admin_export_success', {
                    count: data.summary.length,
                    format: format.toUpperCase()
                })
            }, {
                filename,
                contentType: mimeType
            });
        } catch (error) {
            console.error(`[Checkin Export] Error exporting data: ${error.message}`);
            await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_export_error'));
        }
    }

    // ===== HÀM HELPER MỚI (SỬA LẠI) =====
    // Lấy ngôn ngữ ĐÃ LƯU của user, nếu không có thì set ngôn ngữ mặc định
    return {
        answerCheckinStartPrompt,
        buildAdminHubKeyboard,
        buildAdminHubText,
        buildAdminMenuKeyboard,
        buildCheckinKeyboard,
        buildLeaderboardHistoryLines,
        buildLeaderboardModeKeyboard,
        buildLeaderboardText,
        buildStartBotButton,
        buildWelcomeQuestionKeyboard,
        calculateInclusiveDayDiff,
        clearWelcomeChallenge,
        closeAdminMenu,
        confirmLeaderboardRemoval,
        confirmLeaderboardReset,
        disableAdminSummarySchedule,
        enqueueWelcomeVerification,
        executeAdminRemoval,
        executeAdminSummaryReset,
        executeAdminUnlock,
        formatCheckinTitleTemplate,
        formatDateForTimezone,
        formatDateTimeForTimezone,
        formatTimeForTimezone,
        formatWalletPreview,
        formatWelcomeActionLabel,
        formatWelcomeTitleTemplate,
        getGroupCheckinSettings,
        getLeaderboardPeriodStart,
        getSummaryPeriodStart,
        getSummaryWindowBounds,
        getWelcomeVerificationSettings,
        handleCheckinAnswerCallback,
        handleEmotionCallback,
        handleExportRequest,
        handleGoalCallback,
        handleGoalTextInput,
        handleWelcomeAnswer,
        initiateCheckinChallenge,
        launchWelcomeAdminFlow,
        normalizeDateInput,
        openAdminHub,
        pickLaterDateString,
        presentAdminLeaderboardManageList,
        presentAdminLeaderboardMemberDetail,
        presentAdminLeaderboardView,
        promptAdminForRemoval,
        promptAdminPoints,
        promptAdminSchedule,
        promptAdminSecretMessage,
        promptAdminSummaryReset,
        promptAdminSummarySchedule,
        promptAdminSummaryWindow,
        promptAdminUnlock,
        promptCheckinTitleTemplate,
        promptLeaderboardReset,
        resetAdminScheduleSlots,
        resetAdminSummarySchedule,
        resetCheckinTitleTemplate,
        resetWelcomeTitleTemplate,
        resolveAdminMenuView,
        resolveMemberProfile,
        saveWelcomeVerificationSettings,
        sendAdminMenu,
        sendCheckinAnnouncement,
        sendCheckinDmFailureNotice,
        sendCheckinStartPrompt,
        sendSummaryAnnouncement,
        sendSummaryWindowCheckinList,
        sendTodayCheckinList,
        sendWelcomeAdminMenu,
        presentCheckinTopics,
        presentWelcomeTopics,
        setWelcomeAdminPayloadBuilder,
        setAdminDailyPoints,
        setAdminScheduleSlots,
        setAdminSummaryScheduleSlots,
        setAdminSummaryWindow,
        setCheckinTitleTemplate,
        setWelcomeAction,
        setWelcomeAttemptLimit,
        setWelcomeQuestionWeights,
        setWelcomeTimeLimit,
        setWelcomeTitleTemplate,
        startCheckinScheduler,
        startWelcomeQueueProcessor,
        subtractDaysFromDate,
        syncAdminSummaryScheduleWithAuto,
        toggleWelcomeVerification,
        truncateLabel
    };
}

module.exports = { createCheckinRuntime };
