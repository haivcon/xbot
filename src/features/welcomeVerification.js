function createWelcomeVerification({
    t,
    defaultLang,
    escapeHtml,
    resolveGroupLanguage,
    resolveNotificationLanguage,
    pickQuestionType,
    generateCheckinChallenge,
    createShortToken,
    formatTemplateWithVariables,
    bot,
    scheduleMessageDeletion,
    getWelcomeVerificationSettings,
    WELCOME_QUEUE_INTERVAL_MS,
    WELCOME_QUEUE_MAX_PER_TICK,
    pendingWelcomeChallenges,
    welcomeUserIndex,
    sendMessageRespectingThread
}) {
    const welcomeVerificationQueue = [];
    let welcomeQueueTimer = null;

    // --- Cập nhật icon cho hành động ---
    function formatWelcomeActionLabel(action, lang) {
        if (action === 'ban') {
            return `🚫 ${t(lang, 'welcome_admin_action_ban')}`;
        }
        if (action === 'mute') {
            return `🔇 ${t(lang, 'welcome_admin_action_mute')}`;
        }
        return `👢 ${t(lang, 'welcome_admin_action_kick')}`;
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
        // Thêm chút style cho nút bấm (nếu cần thiết kế riêng)
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
        
        // Thêm icon vào lý do bị phạt
        const reasonText = reason === 'attempts'
            ? `🔢 ${t(lang, 'welcome_verify_reason_attempts')}`
            : `⏳ ${t(lang, 'welcome_verify_reason_timeout')}`;
            
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
                // Kick logic (Ban 60s rồi unban)
                await bot.banChatMember(challenge.chatId, challenge.userId, { until_date: Math.floor(Date.now() / 1000) + 60 });
                await bot.unbanChatMember(challenge.chatId, challenge.userId, { only_if_banned: true });
            }
        } catch (error) {
            console.error(`[WelcomeVerify] Failed to enforce ${action} for ${challenge.userId} in ${challenge.chatId}: ${error.message}`);
        }

        try {
            // Thêm icon cảnh báo vào tin nhắn thông báo phạt
            notice = await bot.sendMessage(challenge.chatId, `⚠️ ${t(lang, 'welcome_verify_failed', {
                user: challenge.displayName,
                action: actionLabel,
                reason: reasonText
            })}`, { disable_web_page_preview: true });
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
            await bot.answerCallbackQuery(query.id, { text: `❌ ${t(callbackLang, 'welcome_verify_error_expired')}`, show_alert: true });
            return;
        }

        if (challenge.userId !== query.from.id.toString()) {
            await bot.answerCallbackQuery(query.id, { text: `⛔ ${t(callbackLang, 'welcome_verify_error_wrong_user')}`, show_alert: true });
            return;
        }

        if (Date.now() >= challenge.expiresAt) {
            await bot.answerCallbackQuery(query.id, { text: `⌛ ${t(callbackLang, 'welcome_verify_error_expired')}`, show_alert: true });
            await handleWelcomeTimeout(token, 'timeout');
            return;
        }

        if (Number(answerIndex) === Number(challenge.correctIndex)) {
            clearWelcomeChallenge(token);
            let successMessage = null;
            try {
                await bot.answerCallbackQuery(query.id, { text: `✅ ${t(callbackLang, 'welcome_verify_correct')}` });
            } catch (_) {
                // ignore
            }
            try {
                successMessage = await bot.sendMessage(challenge.chatId, `🎉 ${t(challenge.lang, 'welcome_verify_success', { user: challenge.displayName })}`);
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
            await bot.answerCallbackQuery(query.id, { text: `🚫 ${t(callbackLang, 'welcome_verify_attempt_limit')}`, show_alert: true });
            await handleWelcomeTimeout(token, 'attempts');
            return;
        }

        await bot.answerCallbackQuery(query.id, {
            text: `⚠️ ${t(callbackLang, 'welcome_verify_incorrect', { remaining })}`,
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

        // --- CẬP NHẬT GIAO DIỆN HIỂN THỊ TẠI ĐÂY ---
        const lines = [
            `👋 <b>${escapeHtml(headerLine)}</b>`, // Thay ??? bằng icon vẫy tay
            '',
            `⏳ ${escapeHtml(timerLabel)}  |  🎫 ${escapeHtml(attemptLabel)}`, // Dòng thông số
            `⚖️ ${t(lang, 'welcome_verify_action') || 'Action'}: ${escapeHtml(actionLabel)}`, // Dòng hình phạt
            '',
            `🧩 <b>${escapeHtml(challenge.question)}</b>`, // Câu hỏi
            '',
            `👇 ${escapeHtml(t(lang, 'welcome_verify_cta'))}` // Hướng dẫn bấm nút
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

    return {
        formatWelcomeActionLabel,
        formatWelcomeTitleTemplate,
        buildWelcomeQuestionKeyboard,
        clearWelcomeChallenge,
        applyWelcomeEnforcement,
        handleWelcomeTimeout,
        handleWelcomeAnswer,
        sendWelcomeVerificationChallenge,
        startWelcomeQueueProcessor,
        enqueueWelcomeVerification
    };
}

module.exports = { createWelcomeVerification };