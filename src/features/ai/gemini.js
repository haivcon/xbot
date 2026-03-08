const { getLang, t } = require('../../i18n');
const { v4: uuidv4 } = require('uuid');
const { enforceOwnerCommandLimit } = require('../auth/utils');
const { ensureDeviceInfo, buildDeviceTargetId } = require('../../utils/device');
const db = require('../../db.js');
const { normalizeAiProvider, buildAiProviderMeta, purgeAiProviderSelections, aiProviderSelectionSessions } = require('../ai');
const { GEMINI_API_KEYS, GROQ_API_KEYS, OPENAI_API_KEYS, startVideoFileIds, AI_IMAGE_MAX_BYTES, AI_IMAGE_DOWNLOAD_TIMEOUT_MS, GEMINI_MODEL, OPENAI_MODEL, GROQ_MODEL, GROQ_VISION_MODEL, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_EDIT_MODEL, OPENAI_IMAGE_VARIATION_MODEL, AI_SERVER_KEY_DAILY_LIMIT } = require('../../config');
const { buildAiUsageKeyboard, sendAiIntroMedia } = require('../ai');
const { sendReply, buildThreadedOptions, splitTelegramMessageText, splitTelegramMarkdownV2Text } = require('../../utils/chat');
const { handleAiTtsCommand } = require('./tts');
const { detectImageAction, isQuotaOrRateLimitError, isOpenAiBillingError, isGeminiApiKeyExpired } = require('./utils');
const { extractAudioSourceFromMessage, downloadTelegramPhotoBuffer } = require('../../utils/chat');
const { convertImageToPngSquare, urlToGenerativePart, bufferToGenerativePart } = require('../../utils/image');
const { getGeminiClient, getGroqClient, getOpenAiClient, disableGeminiKey, disableUserGeminiKey, advanceUserGeminiKeyIndex, advanceGeminiKeyIndex, disableGroqKey, disableUserGroqKey, advanceUserGroqKeyIndex, advanceGroqKeyIndex, disableOpenAiKey, disableUserOpenAiKey, advanceUserOpenAiKeyIndex, advanceOpenAiKeyIndex, buildGroqMessageContent, extractGoogleCandidateText, setUserGeminiKeyIndex, setUserGroqKeyIndex, setUserOpenAiKeyIndex, userDisabledGeminiKeyIndices, disabledGeminiKeyIndices, userDisabledGroqKeyIndices, disabledGroqKeyIndices, userDisabledOpenAiKeyIndices, disabledOpenAiKeyIndices, geminiKeyIndex, groqKeyIndex, openAiKeyIndex, getUserGeminiKeyIndex, getUserGroqKeyIndex, getUserOpenAiKeyIndex } = require('./clients');
const { sanitizeSecrets: _sanitizeSecrets } = require('../../utils/format');
const sanitizeSecrets = typeof _sanitizeSecrets === 'function' ? _sanitizeSecrets : (str) => String(str || '');
const bot = require('../../core/bot');
const { buildCloseKeyboard } = require('../../utils/builders');
const { escapeMarkdownV2, convertMarkdownToTelegram } = require('../../app/utils/markdown');
const { ONCHAIN_TOOLS, executeToolCall, buildSystemInstruction } = require('./ai-onchain');
const { initSkills, registry: skillRegistry } = require('../../skills');

// Initialize skill engine on first load
// ── Initialize Skill Engine ──
try { initSkills(); } catch (e) { console.warn('[Gemini] Skill engine init skipped:', e.message); }

// Merge ONCHAIN_TOOLS (ai-onchain.js) with skill engine tools (scheduler/memory/security)
// The onchain skill adapter is disabled because ai-onchain.js has relative require() paths
// that break when loaded from src/skills/onchain/. So we load onchain tools directly.
const getActiveTools = () => {
    const allToolArrays = [...ONCHAIN_TOOLS]; // Start with onchain tools (17 tools)
    try {
        const skillTools = skillRegistry.getAllTools();
        if (skillTools && skillTools.length > 0) {
            // Merge skill tool declarations into a single functionDeclarations array
            for (const toolObj of skillTools) {
                if (toolObj?.functionDeclarations?.length > 0) {
                    allToolArrays.push(toolObj);
                }
            }
        }
    } catch (e) { /* skill engine not available, use onchain only */ }
    return allToolArrays;
};

// Route tool calls: check skill engine first, then fallback to onchain handlers
const executeActiveToolCall = async (functionCall, context) => {
    // Check if skill engine has this tool registered
    try {
        if (skillRegistry.toolToSkill && skillRegistry.toolToSkill.has(functionCall.name)) {
            return await skillRegistry.executeToolCall(functionCall, context);
        }
    } catch (e) { /* not a skill engine tool or error */ }
    // Fallback to onchain tool handlers
    return await executeToolCall(functionCall, context);
};

// ─── Server Key Daily Quota Tracking ───
const serverKeyDailyUsage = new Map(); // userId -> { date: 'yyyy-mm-dd', count: N }

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getServerKeyUsage(userId) {
    const today = getTodayKey();
    const entry = serverKeyDailyUsage.get(String(userId));
    if (!entry || entry.date !== today) {
        return 0;
    }
    return entry.count;
}

function incrementServerKeyUsage(userId) {
    const today = getTodayKey();
    const uid = String(userId);
    const entry = serverKeyDailyUsage.get(uid);
    if (!entry || entry.date !== today) {
        serverKeyDailyUsage.set(uid, { date: today, count: 1 });
    } else {
        entry.count += 1;
    }
}

async function runGeminiCompletion({ msg, lang, parts, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
        userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            return {
                text: null,
                error: `⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`,
                keySource: 'server',
                quotaExceeded: true
            };
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }

    let response = null;
    let lastError = null;
    let activeSource = keySource;
    let activeClient = null;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : geminiKeyIndex;

        if (pool.type === 'server' && disabledGeminiKeyIndices.size >= pool.keys.length) {
            lastError = new Error('No valid Gemini API keys');
            continue;
        }

        for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getGeminiClient(keyIndex, pool.keys);
            if (!clientInfo) {
                lastError = new Error('Missing Gemini API key');
                break;
            }

            try {
                // Build system instruction with user's wallet context
                const chatId = msg.chat?.id?.toString();
                const systemInstruction = await buildSystemInstruction(chatId).catch(() => null);

                response = await clientInfo.client.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts
                        }
                    ],
                    config: {
                        tools: getActiveTools(),
                        ...(systemInstruction ? { systemInstruction } : {})
                    }
                });

                // Handle function calling: multi-turn loop
                let maxToolTurns = 3;
                while (maxToolTurns > 0) {
                    const candidateParts = response?.candidates?.[0]?.content?.parts || [];
                    const functionCalls = candidateParts.filter((p) => p.functionCall);
                    if (functionCalls.length === 0) {
                        break;
                    }

                    // Execute all function calls
                    const functionResponses = [];
                    const forcedMessages = [];
                    console.log(`[DEBUG Gemini] Executing ${functionCalls.length} tool calls...`);
                    for (const part of functionCalls) {
                        const result = await executeActiveToolCall(part.functionCall, { userId, chatId });
                        console.log(`[DEBUG Gemini] Tool executed: ${part.functionCall.name}, returned type: ${typeof result}, has_displayMessage: ${!!(result && result.displayMessage)}`);
                        if (result && result.displayMessage) {
                            forcedMessages.push(result.displayMessage);
                        }
                        functionResponses.push({
                            functionResponse: {
                                name: part.functionCall.name,
                                response: { result: typeof result === 'string' ? result : JSON.stringify(result) }
                            }
                        });
                    }

                    if (forcedMessages.length > 0) {
                        // Forcefully terminate the LLM generation loop entirely, bypassing any rewriting
                        response = {
                            candidates: [{
                                content: {
                                    parts: [{ text: forcedMessages.join('\n\n---\n\n') }]
                                }
                            }]
                        };
                        break;
                    }

                    // Send results back to Gemini for final response
                    response = await clientInfo.client.models.generateContent({
                        model: GEMINI_MODEL,
                        contents: [
                            { role: 'user', parts },
                            { role: 'model', parts: candidateParts },
                            { role: 'user', parts: functionResponses }
                        ],
                        config: {
                            tools: getActiveTools(),
                            ...(systemInstruction ? { systemInstruction } : {})
                        }
                    });

                    maxToolTurns -= 1;
                }

                activeClient = clientInfo.client;
                if (pool.type === 'user') {
                    setUserGeminiKeyIndex(userId, clientInfo.index);
                } else {
                    geminiKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
                break;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 403 || isGeminiApiKeyExpired(error) || /reported as leaked/i.test(error?.message || '')) {
                    if (pool.type === 'user') {
                        disableUserGeminiKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableGeminiKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (pool.type === 'user') {
                    advanceUserGeminiKeyIndex(userId, pool.keys.length);
                } else {
                    advanceGeminiKeyIndex();
                }
                console.error(`[AI] Failed to generate content with ${pool.type} Gemini key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            }
        }

        if (response) {
            break;
        }
    }

    if (!response) {
        throw lastError || new Error('No Gemini response');
    }

    const candidate = response?.candidates?.[0]?.content?.parts || [];
    const aiResponse = candidate
        .map((part) => part?.text || '')
        .join('')
        .trim()
        || (typeof response?.text === 'function' ? response.text() : response?.text);
    const body = aiResponse || t(lang, 'ai_error');
    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && keySource === 'server') {
        noticePrefix.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(body)}`;

    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true };

    for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk || !chunk.trim()) {
            continue;
        }

        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }

}

async function runGoogleAudioCompletion({ msg, lang, promptText, audioSource, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
        userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            throw new Error(`⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`);
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }

    let transcript = '';
    let aiResponse = '';
    let activeSource = keySource;
    let lastError = null;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : geminiKeyIndex;

        if (pool.type === 'server' && disabledGeminiKeyIndices.size >= pool.keys.length) {
            lastError = new Error('No valid Gemini API keys');
            continue;
        }

        for (let attempt = 0; attempt < maxAttempts && !aiResponse; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getGeminiClient(keyIndex, pool.keys);
            if (!clientInfo?.client) {
                lastError = new Error('Missing Gemini API key');
                break;
            }

            let downloadInfo = null;
            let uploadedFile = null;

            try {
                downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-audio');
                const mimeType = resolveAudioMimeType(downloadInfo.format);

                uploadedFile = await clientInfo.client.files.upload({
                    file: downloadInfo.filePath,
                    config: {
                        mimeType,
                        displayName: path.basename(downloadInfo.filePath)
                    }
                });

                if (!uploadedFile?.uri) {
                    throw new Error('Missing Gemini file URI');
                }

                const audioPart = {
                    fileData: {
                        mimeType: uploadedFile?.mimeType || mimeType,
                        fileUri: uploadedFile?.uri
                    }
                };

                const transcriptPrompt = t(lang, 'ai_audio_google_transcript_prompt');
                const transcriptResponse = await clientInfo.client.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts: [audioPart, { text: transcriptPrompt }]
                        }
                    ]
                });

                transcript = extractGoogleCandidateText(transcriptResponse) || '';
                const conversationPrompt = promptText
                    ? `${promptText}\n\n${t(lang, 'ai_audio_google_conversation_prompt')}${transcript ? `\nTranscript:\n${transcript}` : ''}`
                    : t(lang, 'ai_audio_google_conversation_prompt');

                const conversationResponse = await clientInfo.client.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: conversationPrompt },
                                audioPart
                            ]
                        }
                    ]
                });

                aiResponse = extractGoogleCandidateText(conversationResponse) || '';

                if (!aiResponse) {
                    continue;
                }

                if (pool.type === 'user') {
                    setUserGeminiKeyIndex(userId, clientInfo.index);
                } else {
                    geminiKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 403 || isGeminiApiKeyExpired(error) || /reported as leaked/i.test(error?.message || '')) {
                    if (pool.type === 'user') {
                        disableUserGeminiKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableGeminiKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (pool.type === 'user') {
                    advanceUserGeminiKeyIndex(userId, pool.keys.length);
                } else {
                    advanceGeminiKeyIndex();
                }
                console.error(`[AI] Failed to process Gemini audio with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            } finally {
                if (downloadInfo?.filePath) {
                    try {
                        await fs.promises.unlink(downloadInfo.filePath);
                    } catch (cleanupError) {
                        console.warn(`[AI] Failed to clean audio temp file: ${cleanupError.message}`);
                    }
                }
                if (uploadedFile?.name) {
                    try {
                        await clientInfo.client.files.delete({ name: uploadedFile.name });
                    } catch (cleanupError) {
                        console.warn(`[AI] Failed to delete Gemini file: ${cleanupError.message}`);
                    }
                }
            }
        }

        if (aiResponse) {
            break;
        }
    }

    if (!aiResponse) {
        throw lastError || new Error('No Gemini audio response');
    }

    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && activeSource === 'server') {
        noticePrefix.push(escapeMarkdownV2(limitNotice));
    }

    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const bodyParts = [];
    if (transcript) {
        bodyParts.push(`${t(lang, 'ai_audio_user_said', { text: escapeMarkdownV2(transcript) })}`);
    }
    if (aiResponse) {
        bodyParts.push(convertMarkdownToTelegram(aiResponse));
    }

    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${bodyParts.filter(Boolean).join('\n\n')}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true };

    for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk || !chunk.trim()) {
            continue;
        }

        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }

}

async function runGoogleImageRequest({ msg, lang, promptText, action, photos, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
        userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            throw new Error(`⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`);
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }

    const imageSource = { buffer: null, mimeType: 'image/png' };
    if (action !== 'generate') {
        const largestPhoto = Array.isArray(photos) && photos.length ? photos[photos.length - 1] : null;
        if (!largestPhoto) {
            await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const download = await downloadTelegramPhotoBuffer(largestPhoto);
        if (download?.error === 'too_large') {
            await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: download.limitMb }), {
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        if (!download?.buffer) {
            await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        imageSource.buffer = download.buffer;
        imageSource.mimeType = download.mimeType || 'image/png';
    }

    let response = null;
    let lastError = null;
    let activeSource = keySource;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : geminiKeyIndex;

        if (pool.type === 'server' && disabledGeminiKeyIndices.size >= pool.keys.length) {
            lastError = new Error('No valid Gemini API keys');
            continue;
        }

        for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getGeminiClient(keyIndex, pool.keys);
            if (!clientInfo?.client) {
                lastError = new Error('Missing Gemini API key');
                break;
            }

            try {
                const parts = [{ text: promptText }];
                if (action !== 'generate' && imageSource.buffer) {
                    parts.push(bufferToGenerativePart(imageSource.buffer, imageSource.mimeType));
                }

                const imageResponse = await clientInfo.client.models.generateContent({
                    model: GEMINI_IMAGE_MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts
                        }
                    ]
                });

                response = imageResponse;
                if (pool.type === 'user') {
                    setUserGeminiKeyIndex(userId, clientInfo.index);
                } else {
                    geminiKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
                break;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 401 || error?.response?.status === 403 || isGeminiApiKeyExpired(error)) {
                    if (pool.type === 'user') {
                        disableUserGeminiKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableGeminiKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (error?.response?.status === 429) {
                    console.warn('[AI] Gemini rate limit hit during image request, rotating key');
                }
                if (pool.type === 'user') {
                    advanceUserGeminiKeyIndex(userId, pool.keys.length);
                } else {
                    advanceGeminiKeyIndex();
                }
                console.error(`[AI] Failed to generate Gemini image with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            }
        }

        if (response) {
            break;
        }
    }

    if (!response) {
        const errorMessage = lastError?.message || 'Unknown error';
        const quotaHit = isQuotaOrRateLimitError(lastError);
        const expiredKey = isGeminiApiKeyExpired(lastError);
        console.error(`[AI] Gemini image request failed: ${sanitizeSecrets(errorMessage)}`);
        const messageKey = expiredKey ? 'ai_provider_gemini_key_expired' : quotaHit ? 'ai_provider_quota' : 'ai_error';
        await sendReply(msg, t(lang, messageKey, { provider: providerMeta.label }), {
            reply_markup: buildCloseKeyboard(lang)
        });
        return;
    }

    const imagePart = response?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data);
    const imageData = imagePart?.inlineData?.data || null;
    if (!imageData) {
        console.error('[AI] Gemini image response missing payload');
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
        return;
    }

    const photoBuffer = Buffer.from(imageData, 'base64');
    const captionLines = [];
    captionLines.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && activeSource === 'server') {
        captionLines.push(escapeMarkdownV2(limitNotice));
    }
    captionLines.push(`🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`);
    if (promptText) {
        captionLines.push(escapeMarkdownV2(promptText));
    }

    const caption = captionLines.filter(Boolean).join('\n\n');
    const options = buildThreadedOptions(msg, {
        caption,
        parse_mode: 'MarkdownV2',
        reply_markup: buildCloseKeyboard(lang)
    });

    try {
        await bot.sendPhoto(msg.chat.id, photoBuffer, options);
    } catch (error) {
        console.error(`[AI] Failed to send Gemini image response: ${error.message}`);
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
    }
}

async function runGroqCompletion({ msg, lang, promptText, parts, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGroqKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGroqKeyIndices.has(userId)) {
        userDisabledGroqKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            throw new Error(`⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`);
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGroqKeyIndices });
    }

    const content = buildGroqMessageContent(parts, promptText);
    const usesVisionModel = content.some((entry) => entry?.type === 'image_url');
    const model = usesVisionModel ? GROQ_VISION_MODEL : GROQ_MODEL;
    let response = null;
    let lastError = null;
    let activeSource = keySource;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserGroqKeyIndex(userId) : groqKeyIndex;

        if (pool.type === 'server' && disabledGroqKeyIndices.size >= pool.keys.length) {
            lastError = new Error('No valid Groq API keys');
            continue;
        }

        for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getGroqClient(keyIndex, pool.keys);
            if (!clientInfo) {
                lastError = new Error('Missing Groq API key');
                break;
            }

            try {
                const groqResponse = await axios.post(
                    GROQ_API_URL,
                    {
                        messages: [
                            {
                                role: 'user',
                                content
                            }
                        ],
                        model
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${clientInfo.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
                    }
                );
                response = groqResponse?.data;
                if (pool.type === 'user') {
                    setUserGroqKeyIndex(userId, clientInfo.index);
                } else {
                    groqKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
                break;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 403) {
                    if (pool.type === 'user') {
                        disableUserGroqKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableGroqKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (error?.response?.status === 429) {
                    console.warn('[AI] Groq rate limit hit, rotating key');
                }
                if (pool.type === 'user') {
                    advanceUserGroqKeyIndex(userId, pool.keys.length);
                } else {
                    advanceGroqKeyIndex();
                }
                console.error(`[AI] Failed to generate Groq content with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            }
        }

        if (response) {
            break;
        }
    }

    if (!response) {
        throw lastError || new Error('No Groq response');
    }

    const aiResponse = response?.choices?.[0]?.message?.content || '';
    const body = (aiResponse || '').trim() || t(lang, 'ai_error');
    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && keySource === 'server') {
        noticePrefix.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(body)}`;

    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true };

    for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk || !chunk.trim()) {
            continue;
        }

        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
}

async function runOpenAiAudioCompletion({ msg, lang, promptText, audioSource, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledOpenAiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledOpenAiKeyIndices.has(userId)) {
        userDisabledOpenAiKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            throw new Error(`⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`);
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledOpenAiKeyIndices });
    }

    let transcript = '';
    let aiResponse = '';
    let voiceBuffer = null;
    let activeSource = keySource;
    let lastError = null;
    let hasResponse = false;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserOpenAiKeyIndex(userId) : openAiKeyIndex;

        for (let attempt = 0; attempt < maxAttempts && !hasResponse; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getOpenAiClient(keyIndex, pool.keys);
            if (!clientInfo) {
                lastError = new Error('Missing OpenAI API key');
                break;
            }

            let downloadInfo = null;
            try {
                downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-audio');
                const audioBuffer = await fs.promises.readFile(downloadInfo.filePath);
                transcript = await transcribeOpenAiAudio(downloadInfo.filePath, clientInfo.apiKey, {});

                const result = await completeOpenAiAudioConversation({
                    apiKey: clientInfo.apiKey,
                    transcript,
                    promptText,
                    audioBuffer,
                    audioFormat: downloadInfo.format
                });

                aiResponse = result?.text || '';
                voiceBuffer = result?.audioBuffer || null;
                hasResponse = Boolean(aiResponse) || Boolean(voiceBuffer && voiceBuffer.length);

                if (pool.type === 'user') {
                    setUserOpenAiKeyIndex(userId, clientInfo.index);
                } else {
                    openAiKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 401 || error?.response?.status === 403) {
                    if (pool.type === 'user') {
                        disableUserOpenAiKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableOpenAiKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (error?.response?.status === 429) {
                    console.warn('[AI] OpenAI audio rate limit hit, rotating key');
                }
                if (pool.type === 'user') {
                    advanceUserOpenAiKeyIndex(userId, pool.keys.length);
                } else {
                    advanceOpenAiKeyIndex();
                }
                console.error(`[AI] Failed to process OpenAI audio with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            } finally {
                if (downloadInfo?.filePath) {
                    try {
                        await fs.promises.unlink(downloadInfo.filePath);
                    } catch (cleanupError) {
                        console.warn(`[AI] Failed to clean audio temp file: ${cleanupError.message}`);
                    }
                }
            }
        }

        if (hasResponse) {
            break;
        }
    }

    if (!hasResponse) {
        throw lastError || new Error('No OpenAI audio response');
    }

    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && activeSource === 'server') {
        noticePrefix.push(escapeMarkdownV2(limitNotice));
    }

    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const bodyParts = [];
    if (transcript) {
        bodyParts.push(`${t(lang, 'ai_audio_user_said', { text: escapeMarkdownV2(transcript) })}`);
    }
    if (aiResponse) {
        bodyParts.push(convertMarkdownToTelegram(aiResponse));
    }

    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${bodyParts.filter(Boolean).join('\n\n')}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true };

    for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk || !chunk.trim()) {
            continue;
        }

        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }

    if (voiceBuffer && voiceBuffer.length) {
        const voiceOptions = buildThreadedOptions(msg, {
            caption: t(lang, 'ai_audio_voice_caption', { provider: providerMeta.label }),
            reply_markup: replyMarkup
        });

        try {
            await bot.sendVoice(msg.chat.id, voiceBuffer, voiceOptions);
        } catch (voiceError) {
            console.warn(`[AI] Failed to send voice reply: ${voiceError.message}`);
        }
    }
}

async function runOpenAiCompletion({ msg, lang, promptText, parts, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledOpenAiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledOpenAiKeyIndices.has(userId)) {
        userDisabledOpenAiKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            throw new Error(`⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`);
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledOpenAiKeyIndices });
    }

    const content = buildGroqMessageContent(parts, promptText);
    let response = null;
    let lastError = null;
    let activeSource = keySource;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserOpenAiKeyIndex(userId) : openAiKeyIndex;

        if (pool.type === 'server' && disabledOpenAiKeyIndices.size >= pool.keys.length) {
            lastError = new Error('No valid OpenAI API keys');
            continue;
        }

        for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getOpenAiClient(keyIndex, pool.keys);
            if (!clientInfo) {
                lastError = new Error('Missing OpenAI API key');
                break;
            }

            try {
                const openAiResponse = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: OPENAI_MODEL,
                        messages: [
                            {
                                role: 'user',
                                content
                            }
                        ]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${clientInfo.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
                    }
                );
                response = openAiResponse?.data;
                if (pool.type === 'user') {
                    setUserOpenAiKeyIndex(userId, clientInfo.index);
                } else {
                    openAiKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
                break;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 401 || error?.response?.status === 403) {
                    if (pool.type === 'user') {
                        disableUserOpenAiKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableOpenAiKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (error?.response?.status === 429) {
                    console.warn('[AI] OpenAI rate limit hit, rotating key');
                }
                if (pool.type === 'user') {
                    advanceUserOpenAiKeyIndex(userId, pool.keys.length);
                } else {
                    advanceOpenAiKeyIndex();
                }
                console.error(`[AI] Failed to generate OpenAI content with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            }
        }

        if (response) {
            break;
        }
    }

    if (!response) {
        throw lastError || new Error('No OpenAI response');
    }

    const message = response?.choices?.[0]?.message || {};
    const messageContent = message.content;
    let aiResponse = '';
    if (typeof messageContent === 'string') {
        aiResponse = messageContent;
    } else if (Array.isArray(messageContent)) {
        aiResponse = messageContent
            .map((part) => (part?.text ? part.text : typeof part === 'string' ? part : ''))
            .join('')
            .trim();
    }

    const body = (aiResponse || '').trim() || t(lang, 'ai_error');
    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && keySource === 'server') {
        noticePrefix.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(body)}`;

    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true };

    for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk || !chunk.trim()) {
            continue;
        }

        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
}

async function runOpenAiImageRequest({ msg, lang, promptText, action, photos, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledOpenAiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledOpenAiKeyIndices.has(userId)) {
        userDisabledOpenAiKeyIndices.set(userId, userDisabledSet);
    }

    if (personalKeys.length) {
        responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
        // Check daily quota for server key usage
        const dailyUsed = userId ? getServerKeyUsage(userId) : 0;
        if (AI_SERVER_KEY_DAILY_LIMIT > 0 && dailyUsed >= AI_SERVER_KEY_DAILY_LIMIT) {
            throw new Error(`⚠️ Bạn đã dùng hết ${AI_SERVER_KEY_DAILY_LIMIT} lượt AI miễn phí hôm nay.\n\n💡 Thêm API key riêng của bạn để dùng không giới hạn:\n/ai apikey <your_gemini_api_key>\n\n🔄 Hạn mức sẽ reset vào 00:00 UTC.`);
        }
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledOpenAiKeyIndices });
    }

    const imageSource = { buffer: null };
    if (action !== 'generate') {
        const largestPhoto = Array.isArray(photos) && photos.length ? photos[photos.length - 1] : null;
        if (!largestPhoto) {
            await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const download = await downloadTelegramPhotoBuffer(largestPhoto);
        if (download?.error === 'too_large') {
            await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: download.limitMb }), {
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        if (!download?.buffer) {
            await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const pngBuffer = await convertImageToPngSquare(download.buffer);
        const maxMb = Math.max(1, Math.ceil(AI_IMAGE_MAX_BYTES / (1024 * 1024)));
        if (pngBuffer.length > AI_IMAGE_MAX_BYTES) {
            await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: maxMb }), {
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        imageSource.buffer = pngBuffer;
    }

    let response = null;
    let lastError = null;
    let activeSource = keySource;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserOpenAiKeyIndex(userId) : openAiKeyIndex;

        if (pool.type === 'server' && disabledOpenAiKeyIndices.size >= pool.keys.length) {
            lastError = new Error('No valid OpenAI API keys');
            continue;
        }

        for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getOpenAiClient(keyIndex, pool.keys);
            if (!clientInfo?.client) {
                lastError = new Error('Missing OpenAI API key');
                break;
            }

            try {
                let imageResponse = null;
                if (action === 'generate') {
                    imageResponse = await clientInfo.client.images.generate({
                        model: OPENAI_IMAGE_MODEL,
                        prompt: promptText,
                        n: 1,
                        size: '1024x1024',
                        response_format: 'b64_json'
                    });
                } else if (action === 'edit') {
                    imageResponse = await clientInfo.client.images.edit({
                        model: OPENAI_IMAGE_EDIT_MODEL,
                        prompt: promptText,
                        image: imageSource.buffer,
                        n: 1,
                        size: '1024x1024',
                        response_format: 'b64_json'
                    });
                } else {
                    imageResponse = await clientInfo.client.images.createVariation({
                        model: OPENAI_IMAGE_VARIATION_MODEL,
                        image: imageSource.buffer,
                        n: 1,
                        size: '1024x1024',
                        response_format: 'b64_json'
                    });
                }

                response = imageResponse;
                if (pool.type === 'user') {
                    setUserOpenAiKeyIndex(userId, clientInfo.index);
                } else {
                    openAiKeyIndex = clientInfo.index;
                    // Track server key usage for daily quota
                    if (userId) {
                        incrementServerKeyUsage(userId);
                    }
                }
                activeSource = pool.type;
                break;
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 401 || error?.response?.status === 403) {
                    if (pool.type === 'user') {
                        disableUserOpenAiKey(userId, keyIndex, pool.keys.length);
                    } else {
                        disableOpenAiKey(keyIndex, error.message || 'Forbidden');
                    }
                }
                if (error?.response?.status === 429) {
                    console.warn('[AI] OpenAI rate limit hit during image request, rotating key');
                }
                if (pool.type === 'user') {
                    advanceUserOpenAiKeyIndex(userId, pool.keys.length);
                } else {
                    advanceOpenAiKeyIndex();
                }
                console.error(`[AI] Failed to generate OpenAI image with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            }
        }

        if (response) {
            break;
        }
    }

    if (!response) {
        const errorMessage = lastError?.message || 'Unknown error';
        const quotaHit = isQuotaOrRateLimitError(lastError);
        const billingLimit = isOpenAiBillingError(lastError);
        console.error(`[AI] OpenAI image request failed: ${sanitizeSecrets(errorMessage)}`);
        const messageKey = billingLimit ? 'ai_provider_billing_limit' : quotaHit ? 'ai_provider_quota' : 'ai_error';
        await sendReply(msg, t(lang, messageKey, { provider: providerMeta.label }), {
            reply_markup: buildCloseKeyboard(lang)
        });
        return;
    }

    const imageData = response?.data?.[0]?.b64_json || null;
    if (!imageData) {
        console.error('[AI] OpenAI image response missing payload');
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
        return;
    }

    const photoBuffer = Buffer.from(imageData, 'base64');
    const captionLines = [];
    captionLines.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && activeSource === 'server') {
        captionLines.push(escapeMarkdownV2(limitNotice));
    }
    captionLines.push(`🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`);
    if (promptText) {
        captionLines.push(escapeMarkdownV2(promptText));
    }

    const caption = captionLines.filter(Boolean).join('\n\n');
    const options = buildThreadedOptions(msg, {
        caption,
        parse_mode: 'MarkdownV2',
        reply_markup: buildCloseKeyboard(lang)
    });

    try {
        await bot.sendPhoto(msg.chat.id, photoBuffer, options);
    } catch (error) {
        console.error(`[AI] Failed to send image response: ${error.message}`);
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
    }
}

module.exports = {
    runGeminiCompletion,
    runGoogleAudioCompletion,
    runGoogleImageRequest,
    runGroqCompletion,
    runOpenAiAudioCompletion,
    runOpenAiCompletion,
    runOpenAiImageRequest
}