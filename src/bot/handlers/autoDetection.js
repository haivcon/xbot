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
                // Cache for dashboard bot-info endpoint
                if (botInfo.username && !global._botUsername) {
                    global._botUsername = botInfo.username;
                }
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
                // SMART MULTI-ADDRESS ROUTING
                // Clear intent → pass to AI directly
                // Ambiguous intent → show inline keyboard for user to choose
                // ==============================================
                const multiAddrMatches = extractedText.match(/0x[0-9a-fA-F]{40}/gi);
                const hasMultipleAddresses = multiAddrMatches && multiAddrMatches.length >= 2;

                if (hasMultipleAddresses) {
                    const uniqueAddrs = [...new Set(multiAddrMatches.map(a => a.toLowerCase()))];
                    const addrCount = uniqueAddrs.length;

                    // Check for clear intent keywords
                    const transferIntent = /chuyển|transfer|gửi|send|distribute|hàng loạt|tới.*ví|to.*wallet|转账|보내|전송|перевод|kirim/i;
                    const swapIntent = /swap|đổi|exchange|trade|mua|bán|buy|sell|交换|스왑|обмен|tukar/i;
                    const checkIntent = /kiểm tra|check|xem|balance|số dư|tài sản|portfolio|查看|余额|확인|잔액|проверить|баланс|periksa|saldo/i;

                    if (transferIntent.test(extractedText) || swapIntent.test(extractedText) || checkIntent.test(extractedText)) {
                        // Clear intent detected → pass original message to AI
                        log.child('AutoDetection').info(`✓ Multi-address (${addrCount}) with clear intent, passing to AI`);
                    } else {
                        // Ambiguous intent → show inline keyboard
                        log.child('AutoDetection').info(`✓ Multi-address (${addrCount}) with ambiguous intent, showing action picker`);

                        const { t, getLang } = context;
                        let lang = 'vi';
                        try { if (getLang) lang = await getLang(msg); } catch (_) { /* fallback */ }
                        const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');

                        // Store pending multi-address data
                        if (!global._multiAddrPending) global._multiAddrPending = new Map();
                        const pendingId = `ma_${userId}_${Date.now()}`;
                        global._multiAddrPending.set(pendingId, {
                            addresses: uniqueAddrs,
                            originalText: extractedText,
                            msg: { ...msg },
                            createdAt: Date.now()
                        });

                        // Auto-cleanup after 5 minutes
                        setTimeout(() => { global._multiAddrPending.delete(pendingId); }, 5 * 60 * 1000);

                        const headerTexts = {
                            en: `📋 <b>Multiple Wallets Detected</b>\n━━━━━━━━━━━━━━━━━━\nI found <b>${addrCount}</b> wallet addresses in your message.\nWhat would you like to do?`,
                            vi: `📋 <b>Phát hiện nhiều ví</b>\n━━━━━━━━━━━━━━━━━━\nTôi phát hiện <b>${addrCount}</b> địa chỉ ví trong tin nhắn.\nBạn muốn làm gì?`,
                            zh: `📋 <b>检测到多个钱包</b>\n━━━━━━━━━━━━━━━━━━\n在您的消息中发现了 <b>${addrCount}</b> 个钱包地址。\n您想执行什么操作？`,
                            ko: `📋 <b>다수 지갑 감지</b>\n━━━━━━━━━━━━━━━━━━\n메시지에서 <b>${addrCount}</b>개의 지갑 주소를 발견했습니다.\n원하시는 작업을 선택해주세요:`,
                            ru: `📋 <b>Обнаружено несколько кошельков</b>\n━━━━━━━━━━━━━━━━━━\nОбнаружено <b>${addrCount}</b> адресов кошельков.\nЧто вы хотите сделать?`,
                            id: `📋 <b>Beberapa Dompet Terdeteksi</b>\n━━━━━━━━━━━━━━━━━━\nDitemukan <b>${addrCount}</b> alamat dompet di pesan Anda.\nApa yang ingin Anda lakukan?`
                        };

                        const btnTexts = {
                            en: { transfer: '📤 Transfer tokens', check: '💰 Check balances', cancel: '❌ Cancel' },
                            vi: { transfer: '📤 Chuyển token', check: '💰 Kiểm tra số dư', cancel: '❌ Hủy' },
                            zh: { transfer: '📤 转账代币', check: '💰 查看余额', cancel: '❌ 取消' },
                            ko: { transfer: '📤 토큰 전송', check: '💰 잔액 확인', cancel: '❌ 취소' },
                            ru: { transfer: '📤 Перевод токенов', check: '💰 Проверить балансы', cancel: '❌ Отмена' },
                            id: { transfer: '📤 Transfer token', check: '💰 Cek saldo', cancel: '❌ Batal' }
                        };
                        const btns = btnTexts[lk] || btnTexts.en;

                        try {
                            await bot.sendMessage(msg.chat.id, headerTexts[lk] || headerTexts.en, {
                                parse_mode: 'HTML',
                                reply_to_message_id: msg.message_id,
                                message_thread_id: msg.message_thread_id || undefined,
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: btns.transfer, callback_data: `multiaddr_transfer|${pendingId}` },
                                            { text: btns.check, callback_data: `multiaddr_check|${pendingId}` }
                                        ],
                                        [
                                            { text: btns.cancel, callback_data: `multiaddr_cancel|${pendingId}` }
                                        ]
                                    ]
                                }
                            });
                        } catch (kbErr) {
                            log.child('AutoDetection').error('Failed to send multi-address picker:', kbErr.message);
                        }
                        return;
                    }
                } else {
                    const walletAddressPattern = /^(0x[a-fA-F0-9]{40,})$|^(XKO[a-fA-F0-9]{38,})$/i;
                    const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                    const looksLikeAddress = walletAddressPattern.test(extractedText.trim()) ||
                        /0x[a-fA-F0-9]{40}/.test(extractedText) ||
                        /XKO[a-fA-F0-9]{38}/.test(extractedText) ||
                        solanaPattern.test(extractedText.trim());

                    if (looksLikeAddress) {
                        log.child('AutoDetection').info('✓ Single wallet address detected, routing to balance check');
                        const addressOnly = extractedText.trim().match(/(?:0x[a-fA-F0-9]{40,}|XKO[a-fA-F0-9]{38,}|[1-9A-HJ-NP-Za-km-z]{32,44})/)?.[0] || extractedText.trim();
                        const syntheticMsg = {
                            ...msg,
                            text: `/aib check wallet balance and assets of address ${addressOnly}`,
                            caption: undefined
                        };
                        await handleAiaCommand(syntheticMsg);
                        return;
                    }
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

    // ── Multi-Address Action Callback Handler ──
    bot.on('callback_query', async (query) => {
        try {
            const data = query.data || '';
            if (!data.startsWith('multiaddr_')) return;

            const [action, pendingId] = data.split('|');
            if (!pendingId) return;

            const pending = global._multiAddrPending?.get(pendingId);
            if (!pending) {
                await bot.answerCallbackQuery(query.id, { text: '⏰ Expired / Hết hạn', show_alert: false });
                try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
                return;
            }

            // Cleanup
            global._multiAddrPending.delete(pendingId);

            // Delete the picker keyboard message
            try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }

            if (action === 'multiaddr_cancel') {
                const cancelTexts = {
                    en: '✅ Cancelled', vi: '✅ Đã hủy', zh: '✅ 已取消',
                    ko: '✅ 취소됨', ru: '✅ Отменено', id: '✅ Dibatalkan'
                };
                await bot.answerCallbackQuery(query.id, { text: cancelTexts.vi, show_alert: false });
                return;
            }

            await bot.answerCallbackQuery(query.id);

            // Build synthetic message with intent prefix
            const addrList = pending.addresses.join(' ');
            let intentPrefix = '';

            if (action === 'multiaddr_transfer') {
                intentPrefix = `transfer tokens to these ${pending.addresses.length} wallets: `;
            } else if (action === 'multiaddr_check') {
                intentPrefix = `check balance and assets of these ${pending.addresses.length} wallets: `;
            }

            const syntheticMsg = {
                ...pending.msg,
                text: `/aib ${intentPrefix}${pending.originalText}`,
                caption: undefined
            };

            log.child('AutoDetection').info(`✓ Multi-address callback: ${action}, ${pending.addresses.length} addresses`);
            await handleAiaCommand(syntheticMsg);

        } catch (err) {
            log.child('AutoDetection').error('Multi-address callback error:', err.message);
        }
    });

    log.child('AutoDetection').info('✓ Registered with @mention requirement for groups');
}

module.exports = { registerAutoDetection };
