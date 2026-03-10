/**
 * Auto-Detection with Universal Pattern Matching + Smart Confirmation
 * 
 * SECURITY: Groups REQUIRE @mention - no keyword triggers to prevent spam
 * SMART: Shows confirmation before executing commands
 * PRIORITY: Skips auto-detection when user is replying to wizard prompt
 */

const { containsGamingKeyword, extractBotMention, parseGamingCommand, hasGamingIntent } = require('../../utils/gamingKeywords');
const logger = require('../../core/logger');
const log = logger.child('AutoDetect');
const { shouldSkipAutoDetection } = require('../../core/userInputState');
const { customPersonaPrompts } = require('../../core/state');
const {
    buildConfirmationKeyboard,
    buildConfirmationText,
    storePendingConfirmation,
    CONFIRMATION_TIMEOUT_MS
} = require('./confirmationHandler');

function registerAutoDetection(context) {
    const { bot, handleAiaCommand, handleAiCommand, handleCustomPersonaReply, handlePriceWizardMessage } = context;

    if (!handleAiaCommand) {
        log.child('AutoDetection').warn('handleAiaCommand not available - disabled');
        return;
    }

    // Store processed message IDs with timestamps to prevent infinite loops (TTL-based cleanup)
    const processedMessages = new Map();
    const PROCESSED_MSG_TTL_MS = 60000; // 60 seconds

    // Cleanup expired entries every 60s
    setInterval(() => {
        const cutoff = Date.now() - PROCESSED_MSG_TTL_MS;
        for (const [key, ts] of processedMessages) {
            if (ts < cutoff) processedMessages.delete(key);
        }
    }, PROCESSED_MSG_TTL_MS);

    bot.on('message', async (msg) => {
        try {
            // Prevent infinite loop - don't reprocess synthetic messages
            const msgKey = `${msg.chat.id}_${msg.message_id}`;
            if (processedMessages.has(msgKey)) {
                return;
            }

            // === PRIORITY 0: Check for price wizard message FIRST ===
            // This handles title/media/interval input in DM without triggering AI
            if (handlePriceWizardMessage && msg.chat?.type === 'private') {
                try {
                    const text = msg.text || msg.caption || '';
                    const handled = await handlePriceWizardMessage(msg, text);
                    if (handled) {
                        log.child('AutoDetection').info('⏸ Skipping - handled by price wizard');
                        return;
                    }
                } catch (e) {
                    log.child('AutoDetection').error('handlePriceWizardMessage error:', e.message);
                }
            }

            // === PRIORITY 1: Check for custom persona reply ===

            if (handleCustomPersonaReply && msg.reply_to_message) {
                try {
                    const handled = await handleCustomPersonaReply(msg);
                    if (handled) {
                        return;
                    }
                } catch (e) {
                    log.child('AutoDetection').error('handleCustomPersonaReply error:', e.message);
                }
            }

            const userId = msg.from?.id?.toString();
            const chatId = msg.chat?.id?.toString();

            // === SMART CHECK: Only skip if this message is a REPLY to a wizard prompt ===
            if (userId && shouldSkipAutoDetection(userId, chatId, msg)) {
                log.child('AutoDetection').info('⏸ Skipping - message is reply to wizard prompt');
                return;
            }


            const textOrCaption = (msg.text || msg.caption || '').trim();
            const chatType = msg.chat?.type || '';
            const hasAudioMedia = msg.voice || msg.audio || msg.video_note;

            // Skip bots and commands. Allow empty text if there's audio (voice messages)
            if (msg.from?.is_bot || textOrCaption.startsWith('/')) {
                return;
            }

            // Skip if no text AND no audio
            if (!textOrCaption && !hasAudioMedia) {
                return;
            }

            // ==============================================
            // PRIORITY: Auto-detect private keys in DMs
            // Securely import without needing /importkey command
            // ==============================================
            if (chatType === 'private' && textOrCaption) {
                // Match 64-char hex strings (with or without 0x prefix)
                const pkRegex = /\b(?:0x)?([0-9a-fA-F]{64})\b/g;
                const foundKeys = [];
                let m;
                while ((m = pkRegex.exec(textOrCaption)) !== null) {
                    foundKeys.push(m[0]);
                }

                if (foundKeys.length > 0) {
                    log.child('AutoDetection').info(`🔐 Detected ${foundKeys.length} potential private key(s) in DM`);
                    try {
                        const ethers = require('ethers');
                        const crypto = require('crypto');
                        const { dbGet, dbRun } = require('../../../db/core');
                        const ENCRYPT_KEY = (process.env.WALLET_ENCRYPT_SECRET || process.env.TELEGRAM_TOKEN || '').slice(0, 32).padEnd(32, '0');

                        function encryptKey(text) {
                            const iv = crypto.randomBytes(16);
                            const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
                            let encrypted = cipher.update(text, 'utf8', 'hex');
                            encrypted += cipher.final('hex');
                            return iv.toString('hex') + ':' + encrypted;
                        }

                        const botUserId = String(msg.from?.id || msg.chat.id);
                        const results = { imported: 0, duplicates: 0, invalid: 0 };

                        for (const rawKey of foundKeys) {
                            try {
                                const pk = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
                                const wallet = new ethers.Wallet(pk);
                                const address = wallet.address;

                                // Check for duplicate
                                const existing = await dbGet(
                                    'SELECT id FROM user_trading_wallets WHERE userId = ? AND address = ?',
                                    [botUserId, address]
                                );
                                if (existing) {
                                    results.duplicates++;
                                    continue;
                                }

                                const encryptedKey = encryptKey(pk);
                                const hasWallets = await dbGet(
                                    'SELECT id FROM user_trading_wallets WHERE userId = ? LIMIT 1',
                                    [botUserId]
                                );
                                const isDefault = hasWallets ? 0 : 1;
                                await dbRun(
                                    'INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                    [botUserId, null, address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]
                                );
                                results.imported++;
                            } catch (e) {
                                results.invalid++;
                            }
                        }

                        // Build response using localization
                        const { t, getLang } = context;
                        let lang = 'vi';
                        try { if (getLang) lang = await getLang(msg); } catch (_) { /* fallback vi */ }

                        const AUTO_DELETE_SECONDS = 30;

                        // Summary message
                        let summaryText = '';
                        if (t) {
                            const successStr = t(lang, 'ai_auto_import_success', {
                                success: results.imported,
                                duplicates: results.duplicates,
                                invalid: results.invalid
                            }) || `✅ Đã tự động import ${results.imported} ví. Trùng: ${results.duplicates}. Lỗi: ${results.invalid}.`;
                            const warnStr = t(lang, 'ai_auto_import_deleted_warning', {
                                seconds: AUTO_DELETE_SECONDS
                            }) || `⚠️ Tin nhắn chứa Private Key sẽ bị xóa sau ${AUTO_DELETE_SECONDS}s.`;
                            summaryText = `${successStr}\n\n${warnStr}`;
                        } else {
                            summaryText = `✅ Đã tự động import ${results.imported} ví. Trùng: ${results.duplicates}. Lỗi: ${results.invalid}.\n\n⚠️ Tin nhắn chứa Private Key sẽ bị xóa sau ${AUTO_DELETE_SECONDS}s.`;
                        }

                        await bot.sendMessage(msg.chat.id, summaryText, { parse_mode: 'HTML' });

                        // Schedule deletion of original message after 30 seconds
                        setTimeout(async () => {
                            try {
                                await bot.deleteMessage(msg.chat.id, msg.message_id);
                                log.child('AutoDetection').info(`🗑️ Deleted private key message ${msg.message_id}`);
                            } catch (delErr) {
                                log.child('AutoDetection').error('Could not delete key message:', delErr.message);
                            }
                        }, AUTO_DELETE_SECONDS * 1000);

                        log.child('AutoDetection').info(`🔐 Auto-import done: imported=${results.imported}, dup=${results.duplicates}, invalid=${results.invalid}`);
                        return; // Stop further processing
                    } catch (autoImportErr) {
                        log.child('AutoDetection').error('Auto-import error:', autoImportErr.message);
                        // Fall through to normal AI processing if auto-import fails
                    }
                }
            }

            const isPrivateChat = chatType === 'private';
            const isGroup = ['group', 'supergroup'].includes(chatType);

            let shouldTrigger = false;
            let extractedText = textOrCaption;

            if (isPrivateChat) {
                shouldTrigger = true;
            } else if (isGroup) {
                const botInfo = await bot.getMe();
                const mention = extractBotMention(textOrCaption, botInfo.username);

                // Enhanced logging for voice reply debugging
                if (hasAudioMedia) {
                    log.child('AutoDetection').info('Voice in group:', {
                        hasReply: !!msg.reply_to_message,
                        replyFromId: msg.reply_to_message?.from?.id,
                        botId: botInfo.id,
                        threadId: msg.message_thread_id,
                        isReplyToBot: msg.reply_to_message?.from?.id === botInfo.id
                    });
                }

                if (mention.isMention) {
                    shouldTrigger = true;
                    extractedText = mention.textAfterMention || textOrCaption;
                    log.child('AutoDetection').info('✓ @mention detected, text:', extractedText);
                }
                // NEW: Voice reply to bot's message - trigger AI
                else if (hasAudioMedia && msg.reply_to_message?.from?.id === botInfo.id) {
                    shouldTrigger = true;
                    log.child('AutoDetection').info('✓ Voice reply to bot detected');
                }
            }

            if (shouldTrigger && (extractedText.trim() || hasAudioMedia)) {
                // Mark as processed (with timestamp for TTL-based cleanup)
                processedMessages.set(msgKey, Date.now());

                // ==============================================
                // PRIORITY: Skip if message looks like a wallet address
                // Prevent 0x... and XKO... from matching dice patterns
                // ==============================================
                const walletAddressPattern = /^(0x[a-fA-F0-9]{40,})$|^(XKO[a-fA-F0-9]{38,})$/i;
                // Feature 9: Also detect Solana addresses (32-44 base58 chars, no 0x)
                const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                const looksLikeAddress = walletAddressPattern.test(extractedText.trim()) ||
                    /0x[a-fA-F0-9]{40}/.test(extractedText) ||
                    /XKO[a-fA-F0-9]{38}/.test(extractedText) ||
                    solanaPattern.test(extractedText.trim());

                if (looksLikeAddress) {
                    log.child('AutoDetection').info('✓ Wallet address detected, routing to AI');
                    const addressOnly = extractedText.trim().match(/(?:0x[a-fA-F0-9]{40,}|XKO[a-fA-F0-9]{38,}|[1-9A-HJ-NP-Za-km-z]{32,44})/)?.[0] || extractedText.trim();
                    const syntheticMsg = {
                        ...msg,
                        text: `/aib check wallet balance and assets of address ${addressOnly}`,
                        caption: undefined
                    };
                    await handleAiaCommand(syntheticMsg);
                    return;
                }

                // ==============================================
                // UNIVERSAL PATTERN DETECTION (ANY LANGUAGE)
                // ==============================================

                const diceMatch = extractedText.match(/\b(\d+)d(\d+)([+-]\d+)?(?:\s|$)/i);
                if (diceMatch) {
                    const commandText = `/roll ${diceMatch[0].trim()}`;
                    log.child('AutoDetection').info('✓ Universal dice pattern:', diceMatch[0]);

                    // Simulate command using processUpdate
                    const syntheticUpdate = {
                        update_id: Date.now(),
                        message: {
                            ...msg,
                            text: commandText,
                            entities: [{ type: 'bot_command', offset: 0, length: commandText.split(' ')[0].length }]
                        }
                    };
                    bot.processUpdate(syntheticUpdate);
                    return;
                }

                // ==============================================
                // KEYWORD-BASED ROUTING
                // ==============================================
                const gamingCmd = parseGamingCommand(extractedText);

                if (gamingCmd) {
                    log.child('AutoDetection').info('✓ Keyword match:', gamingCmd);

                    // === SMART CONFIRMATION ===
                    // Thay vì gọi command trực tiếp, hiện confirmation để user xác nhận
                    const { t, scheduleMessageDeletion, getLang } = context;

                    let lang = 'vi';
                    try {
                        if (getLang) {
                            lang = await getLang(msg);
                        }
                    } catch (e) {
                        // fallback to vi
                    }

                    const confirmText = buildConfirmationText(gamingCmd.command, extractedText, lang, t);
                    const confirmKeyboard = buildConfirmationKeyboard(
                        gamingCmd.command,
                        null,
                        gamingCmd.params,
                        lang,
                        t
                    );

                    try {
                        const confirmMsg = await bot.sendMessage(msg.chat.id, confirmText, {
                            parse_mode: 'HTML',
                            reply_markup: confirmKeyboard,
                            reply_to_message_id: msg.message_id,
                            message_thread_id: msg.message_thread_id || undefined
                        });

                        // Store pending confirmation
                        storePendingConfirmation(msg.chat.id, confirmMsg.message_id, msg);

                        // Auto-delete after timeout
                        if (scheduleMessageDeletion) {
                            scheduleMessageDeletion(msg.chat.id, confirmMsg.message_id, CONFIRMATION_TIMEOUT_MS);
                        } else {
                            // Fallback: delete after timeout
                            setTimeout(() => {
                                bot.deleteMessage(msg.chat.id, confirmMsg.message_id).catch(() => { });
                            }, CONFIRMATION_TIMEOUT_MS);
                        }

                        log.child('AutoDetection').info('✓ Sent confirmation for:', gamingCmd.command);
                    } catch (error) {
                        log.child('AutoDetection').error('Failed to send confirmation:', error.message);
                    }

                    return;
                }

                // ==============================================
                // FALLBACK TO AI
                // ==============================================
                const intentDetected = hasGamingIntent(extractedText);
                log.child('AutoDetection').info('✓', intentDetected ? 'Gaming intent' : 'General query', '- AI chat');

                // Check if message has photo or audio - route to native /ai command
                const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
                const hasAudio = msg.voice || msg.audio || msg.video_note;

                if (hasPhoto || hasAudio) {
                    // Route to native /ai command which handles images/audio properly
                    log.child('AutoDetection').info('✓ Media detected, routing to handleAiCommand');

                    if (!handleAiCommand) {
                        log.child('AutoDetection').warn('handleAiCommand not available for media');
                        return;
                    }

                    // Create synthetic message with proper text/caption for AI
                    // For photos: caption is used. For text: text is used.
                    // Set both to ensure /ai prefix is recognized
                    const aiCommandText = `/ai ${extractedText}`;
                    const syntheticMsg = {
                        ...msg,
                        text: hasPhoto ? undefined : aiCommandText,
                        caption: hasPhoto ? aiCommandText : undefined
                    };

                    await handleAiCommand(syntheticMsg);
                } else {
                    // Text-only messages go to function calling
                    const syntheticMsg = {
                        ...msg,
                        text: `/aib ${extractedText}`,
                        caption: undefined
                    };
                    await handleAiaCommand(syntheticMsg);
                }
            }
        } catch (error) {
            log.child('AutoDetection').error('Error:', error.message);
        }
    });

    log.child('AutoDetection').info('✓ Registered with @mention requirement for groups');
}

module.exports = { registerAutoDetection };
