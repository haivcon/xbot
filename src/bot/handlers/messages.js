const { containsGamingKeyword, extractBotMention } = require('../../utils/gamingKeywords');
const logger = require('../../core/logger');
const log = logger.child('Messages');
const { shouldSkipAutoDetection } = require('../../core/userInputState');

function registerMessageHandlers(context) {
    const {
        bot, t, db, defaultLang,
        escapeHtml, sanitizeSecrets,
        getLang, resolveNotificationLanguage, resolveGroupLanguage,
        sendMessageRespectingThread, sendReply, sendEphemeralMessage,
        ensureDeviceInfo, enforceBanForMessage, ensureGroupProfile, getGroupSettings, upsertUserProfile,
        ensureFilterState,
        idTelegramSessions, sendIdTelegramDetails,
        registerWizardStates, parseRegisterPayload, addWalletToUser,
        txhashWizardStates, deliverTxhashDetail,
        tokenWizardStates, deliverTokenDetail,
        contractWizardStates, buildContractLookupUrl,
        checkinAdminStates, welcomeAdminStates, sendAdminMenu,
        setWelcomeQuestionWeights, parseQuestionWeightsInput, setWelcomeTimeLimit, setWelcomeAttemptLimit, setWelcomeTitleTemplate,
        setAdminDailyPoints, setCheckinTitleTemplate, setAdminSummaryWindow, setAdminQuestionWeights,
        parseScheduleTextInput, setAdminScheduleSlots, setAdminSummaryScheduleSlots,
        OWNER_PASSWORD, registerCoOwner, resetOwnerPasswordAttempts, recordOwnerPasswordFailure, ownerPasswordPrompts,
        handleAiCommand, handleApiCommand, handleAiaCommand,
        enqueueWelcomeVerification, shortenAddress, normalizeAddress, formatCopyableValueHtml,
        handleOwnerStateMessage, handleGoalTextInput, handleAiApiSubmission,
        adminBroadcastPrompts,
        rememberRmchatMessage,
        rmchatUserMessages,
        floodTrackers,
        filterSetupStates
    } = context;

    const stripDiacritics = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const profileVerbs = ['cap nhat', 'cập nhật', 'update', 'doi', 'đổi', 'thay doi', 'thay đổi', 'sua', 'sửa', 'chinh', 'chỉnh', 'set', 'luu', 'lưu', 'reset', 'edit', 'change'];
    const profileKeywords = ['profile', 'ho so', 'hồ sơ', 'thong tin ca nhan', 'thông tin cá nhân', 'thong tin', 'personal info', 'personal profile'];
    const profileFields = ['ten', 'tên', 'name', 'tuoi', 'tuổi', 'age', 'gioi tinh', 'giới tính', 'gender', 'ngay sinh', 'ngày sinh', 'sinh nhat', 'sinh nhật', 'birthday', 'birthdate', 'quoc tich', 'quốc tịch', 'nationality'];
    const profileOwnership = ['cua toi', 'của tôi', 'cua minh', 'của mình', 'my', 'toi muon', 'tôi muốn', 'minh muon', 'mình muốn', 'cho toi', 'cho tôi', 'cho minh', 'cho mình'];

    function shouldTriggerProfileIntent(text, { isPrivateChat, isGroup, botMentioned }) {
        const normalized = stripDiacritics(text).toLowerCase();
        if (!normalized || normalized.length > 240) return false;

        const ignorePhrases = ['profile picture', 'anh dai dien', 'ảnh đại diện', 'avatar'];
        if (ignorePhrases.some((phrase) => normalized.includes(phrase))) return false;

        const hasVerb = profileVerbs.some((verb) => normalized.includes(verb));
        if (!hasVerb) return false;

        const hasProfileWord = profileKeywords.some((word) => normalized.includes(word));
        const hasFieldWord = profileFields.some((word) => normalized.includes(word));
        const hasOwnership = profileOwnership.some((own) => normalized.includes(own)) || /\b(toi|minh|my)\b/.test(normalized);

        if (isGroup && !botMentioned && !isPrivateChat) {
            // In groups, require explicit mention to avoid accidental triggers
            return false;
        }

        return (hasProfileWord && (hasOwnership || hasFieldWord)) || (hasFieldWord && hasOwnership);
    }

    // ====================================================================
    // SMART AUTO-DETECTION FOR /AIB (Option 4 - Hybrid)
    // Helper function called at end of message handler
    // ====================================================================
    async function checkAutoDetection(msg) {
        try {
            // === SMART CHECK: Only skip if message is a REPLY to wizard prompt ===
            const userId = msg.from?.id?.toString();
            const chatId = msg.chat?.id?.toString();
            if (userId && shouldSkipAutoDetection(userId, chatId, msg)) {
                log.child('AutoAIB').info('⏸ Skipping - message is reply to wizard prompt');
                return;
            }

            const textOrCaption = (msg.text || msg.caption || '').trim();
            const chatType = msg.chat?.type || '';

            // Skip if message is from bot or already a command
            if (msg.from?.is_bot || textOrCaption.startsWith('/')) {
                return;
            }

            // Skip if no text
            if (!textOrCaption) {
                return;
            }


            const isPrivateChat = chatType === 'private';
            const isGroup = ['group', 'supergroup'].includes(chatType);

            let mention = { isMention: false, textAfterMention: null };
            if (isGroup) {
                try {
                    const botInfo = await bot.getMe();
                    mention = extractBotMention(textOrCaption, botInfo.username);
                } catch (error) {
                    log.child('AutoDetect').error('Failed to fetch bot info for mention detection:', error.message);
                }
            }

            let shouldTriggerAib = false;
            let extractedText = textOrCaption;

            log.child('AutoAIB').info('Checking message:', { text: textOrCaption, chatType, isPrivateChat, isGroup });

            if (shouldTriggerProfileIntent(textOrCaption, { isPrivateChat, isGroup, botMentioned: mention.isMention })) {
                const syntheticProfileMsg = {
                    ...msg,
                    text: `/profile ${textOrCaption}`.trim(),
                    caption: undefined,
                    entities: [{ type: 'bot_command', offset: 0, length: 8 }]
                };
                await bot.processUpdate({ update_id: Date.now(), message: syntheticProfileMsg });
                return;
            }

            if (isPrivateChat) {
                // DM: Trigger on all text (except commands)
                log.child('AutoAIB').info('Private chat - will trigger');
                shouldTriggerAib = true;
            } else if (isGroup) {
                // Groups: Check for @mention first
                if (mention.isMention) {
                    // Mentioned bot - trigger with text after mention
                    log.child('AutoAIB').info('Bot mentioned in group');
                    shouldTriggerAib = true;
                    extractedText = mention.textAfterMention || textOrCaption;
                } else if (containsGamingKeyword(textOrCaption)) {
                    // Gaming keyword detected - trigger
                    log.child('AutoAIB').info('Gaming keyword detected');
                    shouldTriggerAib = true;
                }
            }

            if (shouldTriggerAib && extractedText.trim()) {
                log.child('AutoAIB').info('Triggering with text:', extractedText);
                // Trigger /aib with extracted text via handleAiaCommand
                const { handleAiaCommand } = context;

                if (handleAiaCommand) {
                    // Check if the text looks like a wallet/contract address
                    const walletAddressPattern = /^(0x[a-fA-F0-9]{40,})$|^(XKO[a-fA-F0-9]{38,})$/i;
                    const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                    const trimmedText = extractedText.trim();
                    const looksLikeAddress = walletAddressPattern.test(trimmedText) ||
                        /0x[a-fA-F0-9]{40}/.test(trimmedText) ||
                        /XKO[a-fA-F0-9]{38}/.test(trimmedText) ||
                        solanaPattern.test(trimmedText);

                    let promptText = extractedText;
                    if (looksLikeAddress) {
                        const addressOnly = trimmedText.match(/(?:0x[a-fA-F0-9]{40,}|XKO[a-fA-F0-9]{38,}|[1-9A-HJ-NP-Za-km-z]{32,44})/)?.[0] || trimmedText;
                        promptText = `check wallet balance and assets of address ${addressOnly}`;
                        log.child('AutoAIB').info('✓ Wallet address detected, adding lookup hint');
                    }

                    const syntheticMsg = {
                        ...msg,
                        text: `/aib ${promptText}`,
                        caption: undefined
                    };
                    await handleAiaCommand(syntheticMsg);
                } else {
                    log.child('AutoAIB').warn('handleAiaCommand not available in context');
                }
            }
        } catch (error) {
            log.child('AutoAIB').error(`Error in auto-detection: ${error.message}`);
        }
    }

    bot.on('message', async (msg) => {
        const chatId = msg?.chat?.id;
        if (!chatId || !msg?.message_id) {
            return;
        }

        if (msg.from && !msg.from.is_bot) {
            rememberRmchatMessage(rmchatUserMessages, chatId, msg.message_id);
        }

        if (await handleGoalTextInput(msg)) {
            return;
        }

        const textOrCaption = (msg.text || msg.caption || '').trim();
        const userId = msg.from?.id?.toString();
        const senderChatId = msg.sender_chat?.id?.toString();
        const sessionKey = userId || (senderChatId ? `chat:${senderChatId}` : null);
        const chatType = msg.chat?.type || '';
        const chatIdStr = chatId ? chatId.toString() : null;
        const isDataTelegramCommand = /^\/dataTelegram(?:@[\w_]+)?/i.test(textOrCaption);
        const idSession = sessionKey ? idTelegramSessions.get(sessionKey) : null;

        if (
            idSession &&
            idSession.chatId === chatIdStr &&
            msg.message_id !== idSession.promptMessageId &&
            !isDataTelegramCommand
        ) {
            try {
                if (idSession.promptMessageId) {
                    await bot.deleteMessage(chatId, idSession.promptMessageId);
                }
            } catch (error) {
                // ignore cleanup errors
            }

            try {
                await sendIdTelegramDetails(msg, msg, idSession.lang || (await getLang(msg)));
            } catch (error) {
                log.child('IdTelegram').error(`Failed to deliver details: ${error.message}`);
            }

            idTelegramSessions.delete(sessionKey);
            return;
        }

        const pendingBroadcast = userId ? adminBroadcastPrompts.get(userId) : null;
        if (pendingBroadcast && msg.reply_to_message?.message_id === pendingBroadcast.promptId) {
            adminBroadcastPrompts.delete(userId);
            const lang = await getLang(msg);
            if (!(await isUserAdmin(pendingBroadcast.chatId, userId))) {
                await sendReply(msg, t(lang, 'owner_not_allowed'));
                return;
            }

            const content = textOrCaption;
            if (!content) {
                await sendReply(msg, t(lang, 'admin_broadcast_format_error'));
                return;
            }

            try {
            } finally {
                pendingSecretMessages.delete(userId);
            }

            if (secretState.chatId) {
                await sendAdminMenu(msg.from.id, secretState.chatId, { fallbackLang: lang });
            }
            return;
        }

        const welcomeState = welcomeAdminStates.get(userId);
        if (welcomeState) {
            const rawText = (msg.text || '').trim();
            if (!rawText) {
                await sendEphemeralMessage(userId, t(lang, 'checkin_error_input_invalid'));
                return;
            }

            if (welcomeState.type === 'weights_custom') {
                const parsed = parseQuestionWeightsInput(rawText);
                if (!parsed) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_admin_weights_invalid'));
                    return;
                }
                if (welcomeState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setWelcomeQuestionWeights(welcomeState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                welcomeAdminStates.delete(userId);
                return;
            }

            if (welcomeState.type === 'time') {
                const numeric = Number(rawText.replace(',', '.'));
                if (!Number.isFinite(numeric) || numeric <= 0) {
                    await sendEphemeralMessage(userId, t(lang, 'welcome_admin_time_invalid'));
                    return;
                }
                if (welcomeState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setWelcomeTimeLimit(welcomeState.chatId, msg.from.id, numeric, { fallbackLang: lang });
                welcomeAdminStates.delete(userId);
                return;
            }

            if (welcomeState.type === 'attempts') {
                const numeric = Number(rawText.replace(',', '.'));
                if (!Number.isFinite(numeric) || numeric < 1) {
                    await sendEphemeralMessage(userId, t(lang, 'welcome_admin_attempts_invalid'));
                    return;
                }
                if (welcomeState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setWelcomeAttemptLimit(welcomeState.chatId, msg.from.id, numeric, { fallbackLang: lang });
                welcomeAdminStates.delete(userId);
                return;
            }

            if (welcomeState.type === 'title') {
                if (welcomeState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, welcomeState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setWelcomeTitleTemplate(welcomeState.chatId, msg.from.id, rawText, { fallbackLang: lang });
                welcomeAdminStates.delete(userId);
                return;
            }
        }

        const adminState = checkinAdminStates.get(userId);
        if (adminState) {
            const rawText = (msg.text || '').trim();
            if (!rawText) {
                await sendEphemeralMessage(userId, t(lang, 'checkin_error_input_invalid'));
                return;
            }

            if (adminState.type === 'points_custom') {
                const normalized = Number(rawText.replace(',', '.'));
                if (!Number.isFinite(normalized) || normalized < 0) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_admin_points_invalid'));
                    return;
                }
                if (adminState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setAdminDailyPoints(adminState.chatId, msg.from.id, normalized, { fallbackLang: lang });
                checkinAdminStates.delete(userId);
                return;
            }

            if (adminState.type === 'title_custom') {
                if (adminState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setCheckinTitleTemplate(adminState.chatId, msg.from.id, rawText, { fallbackLang: lang });
                checkinAdminStates.delete(userId);
                return;
            }

            if (adminState.type === 'summary_custom') {
                const normalized = Number(rawText.replace(',', '.'));
                if (!Number.isFinite(normalized) || normalized <= 0) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_admin_summary_invalid'));
                    return;
                }
                if (adminState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setAdminSummaryWindow(adminState.chatId, msg.from.id, normalized, { fallbackLang: lang });
                checkinAdminStates.delete(userId);
                return;
            }

            if (adminState.type === 'weights_custom') {
                const parsed = parseQuestionWeightsInput(rawText);
                if (!parsed) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_admin_weights_invalid'));
                    return;
                }
                if (adminState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setAdminQuestionWeights(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                checkinAdminStates.delete(userId);
                return;
            }

            if (adminState.type === 'schedule_custom') {
                const parsed = parseScheduleTextInput(rawText);
                if (!parsed) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_admin_schedule_invalid'));
                    return;
                }
                if (adminState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setAdminScheduleSlots(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                checkinAdminStates.delete(userId);
                return;
            }

            if (adminState.type === 'summary_schedule_custom') {
                const parsed = parseScheduleTextInput(rawText);
                if (!parsed) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_admin_summary_schedule_invalid'));
                    return;
                }
                if (adminState.promptMessageId) {
                    try {
                        await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                await setAdminSummaryScheduleSlots(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                checkinAdminStates.delete(userId);
                return;
            }
        }

        if (!userId) {
            return;
        }

        if (chatType === 'private') {
            const lang = await resolveNotificationLanguage(userId, msg.from?.language_code);
            const apiPrompt = aiApiAddPrompts.get(userId);
            if (apiPrompt && msg.chat?.id?.toString() === userId && msg.reply_to_message?.message_id === apiPrompt.messageId) {
                await handleAiApiSubmission(msg, apiPrompt);
                return;
            }
            const registerState = registerWizardStates.get(userId);
            if (registerState && msg.chat?.id?.toString() === userId && msg.reply_to_message?.message_id === registerState.promptMessageId) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'register_help_invalid'));
                    return;
                }

                try {
                    const parsed = parseRegisterPayload(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'register_help_invalid'));
                        return;
                    }

                    const result = await db.addWalletToUser(userId, lang, parsed.wallet, { name: parsed.name });

                    if (registerState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, registerState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }

                    scheduleMessageDeletion(msg.chat.id, msg.message_id, 15000);
                    const effectiveName = parsed.name || result?.name;
                    const successKey = result?.added
                        ? (effectiveName ? 'register_help_success_wallet_named' : 'register_help_success_wallet')
                        : (result?.nameChanged ? 'register_wallet_renamed' : 'register_wallet_exists');
                    await sendEphemeralMessage(userId, t(lang, successKey, {
                        wallet: shortenAddress(parsed.wallet),
                        name: effectiveName
                    }), {}, 20000);
                    registerWizardStates.delete(userId);
                } catch (error) {
                    log.child('RegisterWizard').error(`Failed to save wallet for ${userId}: ${error.message}`);
                    await sendEphemeralMessage(userId, t(lang, 'register_help_error'));
                }
                return;
            }

            const txhashState = txhashWizardStates.get(userId);
            if (
                txhashState &&
                txhashState.stage === 'hash' &&
                msg.chat?.id?.toString() === txhashState.chatId &&
                msg.reply_to_message?.message_id === txhashState.promptMessageId
            ) {
                const rawHash = (msg.text || '').trim();
                const effectiveLang = txhashState.lang || lang;

                if (!rawHash) {
                    if (msg.chat.type === 'private') {
                        await sendEphemeralMessage(userId, t(effectiveLang, 'txhash_help_invalid'));
                    } else {
                        await sendMessageRespectingThread(txhashState.chatId, msg, t(effectiveLang, 'txhash_help_invalid'), {
                            reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'txhash_back' })
                        });
                    }
                    return;
                }

                if (!txhashState.chainIndex) {
                    await sendMessageRespectingThread(txhashState.chatId, msg, t(effectiveLang, 'txhash_chain_missing'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'txhash_back' })
                    });
                    return;
                }

                try {
                    await deliverTxhashDetail({
                        chatId: txhashState.chatId,
                        lang: effectiveLang,
                        txHash: rawHash,
                        chainIndex: txhashState.chainIndex,
                        replyContextMessage: txhashState.replyContextMessage || msg
                    });
                    txhashWizardStates.delete(userId);
                } catch (error) {
                    log.child('TxhashWizard').error(`Failed to handle txhash for ${userId}: ${error.message}`);
                    await sendReply(msg, t(effectiveLang, 'txhash_error'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'txhash_back' })
                    });
                }
                return;
            }

            const tokenState = tokenWizardStates.get(userId);
            if (
                tokenState &&
                tokenState.stage === 'address' &&
                msg.chat?.id?.toString() === tokenState.chatId &&
                msg.reply_to_message?.message_id === tokenState.promptMessageId
            ) {
                const rawAddress = (msg.text || '').trim();
                const effectiveLang = tokenState.lang || lang;

                if (!rawAddress) {
                    const keyboard = buildCloseKeyboard(effectiveLang, { backCallbackData: 'token_back' });
                    if (msg.chat.type === 'private') {
                        await sendEphemeralMessage(userId, t(effectiveLang, 'token_help_invalid'));
                    } else {
                        await sendMessageRespectingThread(tokenState.chatId, msg, t(effectiveLang, 'token_help_invalid'), { reply_markup: keyboard });
                    }
                    return;
                }

                if (!tokenState.chainIndex) {
                    await sendMessageRespectingThread(tokenState.chatId, msg, t(effectiveLang, 'token_chain_missing'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'token_back' })
                    });
                    return;
                }

                try {
                    await deliverTokenDetail({
                        chatId: tokenState.chatId,
                        lang: effectiveLang,
                        chainEntry: tokenState.chainEntry,
                        chainIndex: tokenState.chainIndex,
                        contractAddress: rawAddress,
                        replyContextMessage: tokenState.replyContextMessage || msg
                    });
                    tokenWizardStates.delete(userId);
                } catch (error) {
                    log.child('TokenWizard').error(`Failed to handle token for ${userId}: ${error.message}`);
                    await sendReply(msg, t(effectiveLang, 'token_error'), {
                        reply_markup: buildCloseKeyboard(effectiveLang, { backCallbackData: 'token_back' })
                    });
                }
                return;
            }

            const contractState = contractWizardStates.get(userId);
            if (
                contractState &&
                msg.chat?.id?.toString() === contractState.chatId &&
                msg.reply_to_message?.message_id === contractState.promptMessageId
            ) {
                const rawAddress = (msg.text || '').trim();
                const effectiveLang = contractState.lang || lang;

                if (!rawAddress) {
                    await sendMessageRespectingThread(contractState.chatId, msg, t(effectiveLang, 'contract_invalid'), {
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });
                    return;
                }

                const contractAddress = normalizeAddress(rawAddress);
                if (!contractAddress) {
                    await sendMessageRespectingThread(contractState.chatId, msg, t(effectiveLang, 'contract_invalid'), {
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });
                    return;
                }

                try {
                    if (contractState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, contractState.promptMessageId);
                        } catch (error) {
                            // ignore cleanup errors
                        }
                    }

                    const oklinkUrl = buildContractLookupUrl(contractAddress);
                    const addressLabel = formatCopyableValueHtml(contractAddress) || escapeHtml(contractAddress);
                    const linkLabel = `<a href="${oklinkUrl}">${escapeHtml(oklinkUrl)}</a>`;
                    const responseLines = [
                        t(effectiveLang, 'contract_result'),
                        t(effectiveLang, 'contract_result_address', { address: addressLabel }),
                        t(effectiveLang, 'contract_result_link', { link: linkLabel })
                    ];

                    await sendMessageRespectingThread(contractState.chatId, msg, responseLines.join('\n'), {
                        parse_mode: 'HTML',
                        disable_web_page_preview: false,
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });

                    contractWizardStates.delete(userId);
                } catch (error) {
                    log.child('ContractWizard').error(`Failed to respond for ${userId}: ${error.message}`);
                    await sendMessageRespectingThread(contractState.chatId, msg, t(effectiveLang, 'contract_invalid'), {
                        reply_markup: buildCloseKeyboard(effectiveLang)
                    });
                }
                return;
            }

            const secretState = pendingSecretMessages.get(userId);
            if (secretState) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_invalid'));
                    return;
                }

                const clipped = rawText.length > 500 ? rawText.slice(0, 500) : rawText;

                try {
                    if (secretState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, secretState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    const mode = secretState.mode || 'single';
                    if (mode === 'all') {
                        const uniqueRecipients = Array.from(new Set(Array.isArray(secretState.recipients) ? secretState.recipients : []));
                        let successCount = 0;
                        let failureCount = 0;
                        for (const recipientId of uniqueRecipients) {
                            if (!recipientId || recipientId === userId) {
                                continue;
                            }
                            try {
                                const targetLang = await resolveNotificationLanguage(recipientId);
                                await sendMessageRespectingThread(recipientId, msg, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                                successCount += 1;
                            } catch (error) {
                                failureCount += 1;
                            }
                        }
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_dm_all_result', {
                            success: successCount,
                            failed: failureCount
                        }));
                    } else {
                        const targetLang = await resolveNotificationLanguage(secretState.targetUserId);
                        await sendMessageRespectingThread(secretState.targetUserId, msg, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                        await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_confirm'));
                    }
                } catch (error) {
                    log.child('Checkin').error(`Khng th? chuy?n ti?p tin nh?n b m?t: ${error.message}`);
                    await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_error'), {}, 15000);
                } finally {
                    pendingSecretMessages.delete(userId);
                }

                if (secretState.chatId) {
                    await sendAdminMenu(msg.from.id, secretState.chatId, { fallbackLang: lang });
                }
                return;
            }

        }

        // Auto-detection: last check after all wizard states  
        await checkAutoDetection(msg);
    });

    // Note: Duplicate auto-detection handler removed - checkAutoDetection() already handles this

    function formatPollingError(error) {

        if (!error) {
            return 'Unknown polling error';
        }

        const parts = [];

        if (error.message) {
            parts.push(error.message);
        }

        if (error.code) {
            parts.push(`code=${error.code}`);
        }

        if (error.response?.statusCode) {
            parts.push(`status=${error.response.statusCode}`);
        }

        if (error.response?.body) {
            try {
                const bodyText = typeof error.response.body === 'string'
                    ? error.response.body
                    : JSON.stringify(error.response.body);
                parts.push(`body=${bodyText}`);
            } catch (_) {
                parts.push('body=[unreadable]');
            }
        }

        if (error instanceof AggregateError && Array.isArray(error.errors)) {
            const childErrors = error.errors
                .map((child) => (child?.message ? child.message : String(child)))
                .filter(Boolean);
            if (childErrors.length) {
                parts.push(`causes=${childErrors.join('; ')}`);
            }
        }

        if (error.stack) {
            parts.push(`stack=${error.stack}`);
        }

        return sanitizeSecrets(parts.join(' | ') || String(error));
    }
}

module.exports = { registerMessageHandlers };
