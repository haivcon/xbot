const logger = require('../../core/logger');
const log = logger.child('CheckinSvc');

function createCheckinService(deps) {
    const {
        db,
        bot,
        t,
        escapeHtml,
        resolveLangCode,
        resolveNotificationLanguage,
        resolveGroupLanguage,
        buildBotStartLink,
        sendMessageRespectingThread,
        scheduleMessageDeletion,
        sendEphemeralMessage,
        appendCloseButton,
        formatTemplateWithVariables,
        buildCheckinKeyboard,
        buildStartBotButton,
        buildEmotionKeyboard,
        buildGoalKeyboard,
        sanitizeGoalInput,
        createShortToken,
        generateCheckinChallenge,
        pickQuestionType,
        normalizeAddressSafe,
        CHECKIN_MAX_ATTEMPTS,
        CHECKIN_DEFAULT_TIMEZONE,
        CHECKIN_DEFAULT_TIME,
        SUMMARY_BROADCAST_MAX_ROWS,
        normalizeDateInput,
        subtractDaysFromDate,
        formatDateForTimezone,
        formatTimeForTimezone,
        calculateInclusiveDayDiff,
        getSummaryScheduleSlots,
        getScheduleSlots,
        CHECKIN_GOAL_PRESETS,
        pendingCheckinChallenges,
        pendingEmotionPrompts,
        pendingGoalInputs,
        pendingWelcomeChallenges,
        welcomeUserIndex,
        WELCOME_QUEUE_INTERVAL_MS,
        WELCOME_QUEUE_MAX_PER_TICK
    } = deps;

    let welcomeQueueTimer = null;
    const welcomeVerificationQueue = [];

    async function sendSummaryAnnouncement(chatId, { sourceMessage = null, triggeredBy = 'auto' } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveGroupLanguage(chatId);
        const summaryText = await buildSummaryAnnouncementText(chatId, settings, lang);
        if (!summaryText) {
            return false;
        }

        const options = { parse_mode: 'HTML' };

        try {
            if (sourceMessage) {
                await sendMessageRespectingThread(chatId, sourceMessage, summaryText, options);
            } else {
                await bot.sendMessage(chatId, summaryText, options);
            }
            log.child('Checkin').info(`Sent summary announcement to ${chatId} (${triggeredBy}).`);
            return true;
        } catch (error) {
            log.child('Checkin').error(`Failed to send summary announcement to ${chatId}: ${error.message}`);
            return false;
        }
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
            log.child('Checkin').warn(`Unable to send DM to ${userId}: ${error.message}`);

            return {
                status: 'failed',
                userLang,
                failureReason: 'dm_unreachable',
                startLink: buildBotStartLink('checkin')
            };
        }
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
            log.child('Checkin').warn(`Failed to get wallet for ${userId}: ${error.message}`);
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
            lang: userLang,
            timezone,
            streak,
            totalPoints,
            messageId: null
        });

        const goalToken = createShortToken('goal');
        pendingGoalInputs.set(goalToken, {
            chatId,
            userId,
            date: today,
            lang: userLang,
            timezone,
            messageId: null
        });

        const replyMarkup = buildEmotionKeyboard(userLang, emotionToken);
        const groupMessage = [
            t(userLang, 'checkin_success_group', {
                user: buildUserMentionText(challenge, userId, userLang),
                points,
                streak,
                totalPoints
            }),
            walletNote
        ].join('\n');

        try {
            const sent = await sendMessageRespectingThread(chatId, challenge.sourceMessage, groupMessage, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
            pendingEmotionPrompts.get(emotionToken).messageId = sent?.message_id || null;
        } catch (error) {
            log.child('Checkin').error(`Unable to notify group ${chatId}: ${error.message}`);
        }

        const userMessage = [
            t(userLang, 'checkin_dm_result', {
                points,
                streak,
                total: result?.totalCheckins || 1,
                longest: result?.longestStreak || streak
            }),
            walletNote
        ].join('\n');

        try {
            const emotionPrompt = await bot.sendMessage(userId, t(userLang, 'checkin_dm_emotion'), {
                reply_markup: replyMarkup
            });
            pendingEmotionPrompts.get(emotionToken).dmMessageId = emotionPrompt?.message_id || null;

            const goalPrompt = await bot.sendMessage(userId, t(userLang, 'checkin_dm_goal'), {
                reply_markup: buildGoalKeyboard(userLang, goalToken)
            });
            pendingGoalInputs.get(goalToken).dmMessageId = goalPrompt?.message_id || null;

            await bot.sendMessage(userId, userMessage);
        } catch (error) {
            log.child('Checkin').warn(`Unable to DM result to ${userId}: ${error.message}`);
        }

        pendingCheckinChallenges.delete(token);
    }

    function buildUserMentionText(challenge, userId, userLang) {
        const displayName = challenge?.displayName || userId;
        return challenge?.username
            ? `@${challenge.username}`
            : (displayName ? t(userLang, 'checkin_dm_user', { user: displayName }) : '');
    }

    async function handleCheckinAnswerCallback(query, token, answerIndexRaw) {
        const userId = query.from?.id?.toString();
        const chatId = query.message?.chat?.id?.toString();
        const lang = await resolveNotificationLanguage(userId);
        const challenge = pendingCheckinChallenges.get(token);

        if (!challenge || !userId || !chatId || challenge.userId !== userId) {
            await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid'), show_alert: true });
            return;
        }

        const answerIndex = Number(answerIndexRaw);
        if (!Number.isInteger(answerIndex)) {
            await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid'), show_alert: true });
            return;
        }

        const correct = answerIndex === challenge.correctIndex;
        if (!correct) {
            const attempts = await db.incrementCheckinAttempt(challenge.chatId, challenge.userId, challenge.date, CHECKIN_MAX_ATTEMPTS);
            const remaining = Math.max(CHECKIN_MAX_ATTEMPTS - attempts.attempts, 0);
            if (remaining <= 0) {
                await db.lockCheckinAttempt(challenge.chatId, challenge.userId, challenge.date);
                pendingCheckinChallenges.delete(token);
                await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_locked'), show_alert: true });
                return;
            }

            await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong', { remaining }), show_alert: true });
            const nextType = challenge.questionType || pickQuestionType(challenge.settings);
            const newChallenge = generateCheckinChallenge(lang, nextType, challenge.settings);
            challenge.correctIndex = newChallenge.correctIndex;
            challenge.questionType = newChallenge.type || nextType || 'math';
            challenge.options = newChallenge.options;
            const inline_keyboard = newChallenge.options.map((option) => ([{
                text: option.text,
                callback_data: `checkin_answer|${token}|${option.index}`
            }]));
            await bot.editMessageText(newChallenge.question, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                reply_markup: { inline_keyboard }
            });
            return;
        }

        await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_success'), show_alert: true });
        await concludeCheckinSuccess(token, challenge);
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
                    log.child('WelcomeVerify').error(`Failed to send challenge: ${error.message}`);
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

    // Placeholder: leave welcome challenge helpers as-is in index for now.
    return {
        sendSummaryAnnouncement,
        ensureUserCanCheckin,
        initiateCheckinChallenge,
        concludeCheckinSuccess,
        handleCheckinAnswerCallback,
        sendCheckinDmFailureNotice,
        enqueueWelcomeVerification
    };
}

module.exports = createCheckinService;
