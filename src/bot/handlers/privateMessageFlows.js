/**
 * Private DM message handlers - extracted from index.js
 * Contains: register wizard, txhash wizard, token wizard, contract wizard,
 * price wizard, secret messages, welcome admin state, checkin admin state input.
 */
const logger = require('../../core/logger');
const log = logger.child('PrivateMsg');

/**
 * Handle private chat message flows.
 * @returns {boolean} true if handled, false if not matched
 */
async function handlePrivateMessageFlows(msg, ctx, deps) {
    const {
        bot, t, db, sendReply, sendEphemeralMessage,
        sendMessageRespectingThread, buildCloseKeyboard,
        resolveNotificationLanguage, scheduleMessageDeletion,
        // register wizard
        registerWizardStates, parseRegisterPayload, sendWalletManagerMenu,
        shortenAddress, normalizeAddress,
        // txhash wizard
        txhashWizardStates, deliverTxhashDetail,
        // token wizard
        tokenWizardStates, deliverTokenDetail,
        // contract wizard
        contractWizardStates, buildContractLookupUrl, formatCopyableValueHtml, escapeHtml,
        // price wizard
        handlePriceWizardMessage,
        // secret messages
        pendingSecretMessages, sendAdminMenu,
        // welcome admin state
        welcomeAdminStates, parseQuestionWeightsInput,
        setWelcomeQuestionWeights, setWelcomeTimeLimit,
        setWelcomeAttemptLimit, setWelcomeTitleTemplate,
        // checkin admin state
        checkinAdminStates, setAdminDailyPoints, setCheckinTitleTemplate,
        setAdminSummaryWindow, setAdminQuestionWeights,
        setAdminScheduleSlots, setAdminSummaryScheduleSlots,
        parseScheduleTextInput,
        // api
        aiApiAddPrompts, handleAiApiSubmission
    } = deps;

    const { userId, lang } = ctx;
    const textOrCaption = (msg.text || msg.caption || '').trim();
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

            try {
                await sendWalletManagerMenu(userId, lang);
            } catch (err) {
                log.child('RegisterWizard').warn(`Failed to refresh wallet manager for ${userId}: ${err.message}`);
            }

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

    const handledPriceWizard = await handlePriceWizardMessage(msg, textOrCaption);
    if (handledPriceWizard) {
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
                        await bot.sendMessage(recipientId, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
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
                await bot.sendMessage(secretState.targetUserId, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_confirm'));
            }
        } catch (error) {
            log.child('Checkin').error(`Không th? chuy?n ti?p tin nh?n bí m?t: ${error.message}`);
            await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_error'), {}, 15000);
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
    return false;
}

module.exports = handlePrivateMessageFlows;
