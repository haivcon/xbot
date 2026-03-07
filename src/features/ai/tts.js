const { getLang, t } = require('../../i18n');
const { GEMINI_API_KEYS } = require('../../config');
const { buildAiUsageKeyboard, buildTtsSettingsKeyboard, buildTtsSettingsText, formatTtsLanguageLabel, formatTtsVoiceLabel, getUserTtsConfig, synthesizeGeminiSpeech } = require('./utils');
const { sendReply, buildThreadedOptions } = require('../../utils/chat');
const { normalizeAiProvider } = require('./index');
const db = require('../../db.js');
const { userDisabledGeminiKeyIndices, getUserGeminiKeyIndex, getGeminiClient, setUserGeminiKeyIndex, geminiKeyIndex, disableUserGeminiKey, disableGeminiKey, advanceUserGeminiKeyIndex, advanceGeminiKeyIndex } = require('./clients');
const { downloadTelegramFile, resolveAudioMimeType } = require('../../utils/chat');
const { extractGoogleCandidateText } = require('./gemini');
const { sanitizeSecrets } = require('../../utils/format');
const bot = require('../../core/bot');
const path = require('path');

async function handleAiTtsCommand({ msg, lang, payload = '', audioSource = null }) {
    const userId = msg.from?.id?.toString();
    const settings = getUserTtsConfig(userId);
    const replyText = (msg.reply_to_message?.text || msg.reply_to_message?.caption || '').trim();
    let finalText = (payload || '').trim() || replyText;

    const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
    const googleUserKeys = userApiKeys.filter((entry) => normalizeAiProvider(entry.provider) === 'google').map((entry) => entry.apiKey).filter(Boolean);
    const serverKeys = GEMINI_API_KEYS;

    if (!serverKeys.length && !googleUserKeys.length) {
        await sendReply(msg, t(lang, 'ai_missing_api_key'), {
            parse_mode: 'Markdown',
            reply_markup: buildAiUsageKeyboard(lang)
        });
        return;
    }

    if (!finalText && !audioSource) {
        const panelText = buildTtsSettingsText(lang, settings);
        await sendReply(msg, panelText, {
            reply_markup: buildTtsSettingsKeyboard(lang, settings)
        });
        return;
    }

    await sendReply(msg, t(lang, 'ai_tts_generating'));
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
        userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }

    if (googleUserKeys.length) {
        responsePools.push({ type: 'user', keys: googleUserKeys, disabledSet: userDisabledSet });
    } else if (serverKeys.length) {
        responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }

    let ttsPath = null;
    let lastError = null;

    for (const pool of responsePools) {
        if (!pool.keys.length) {
            continue;
        }

        const maxAttempts = pool.keys.length;
        const disabledSet = pool.disabledSet || new Set();
        const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : geminiKeyIndex;

        for (let attempt = 0; attempt < maxAttempts && !ttsPath; attempt += 1) {
            const keyIndex = (startIndex + attempt) % pool.keys.length;
            if (disabledSet.has(keyIndex)) {
                continue;
            }

            const clientInfo = getGeminiClient(keyIndex, pool.keys);
            if (!clientInfo?.client) {
                lastError = new Error('Missing Gemini client');
                break;
            }

            let downloadInfo = null;
            let uploadedFile = null;

            try {
                if (!finalText && audioSource) {
                    downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-tts-audio');
                    const mimeType = resolveAudioMimeType(downloadInfo.format);
                    uploadedFile = await clientInfo.client.files.upload({
                        file: downloadInfo.filePath,
                        config: { mimeType, displayName: path.basename(downloadInfo.filePath) }
                    });

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

                    finalText = extractGoogleCandidateText(transcriptResponse) || '';
                }

                if (!finalText) {
                    throw new Error('Missing TTS text');
                }

                ttsPath = await synthesizeGeminiSpeech(clientInfo.client, finalText, settings);

                if (pool.type === 'user') {
                    setUserGeminiKeyIndex(userId, clientInfo.index);
                } else {
                    geminiKeyIndex = clientInfo.index;
                }
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
                console.error(`[AI] Gemini TTS failed with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
            } finally {
                if (downloadInfo?.filePath) {
                    try {
                        await fs.promises.unlink(downloadInfo.filePath);
                    } catch (cleanupError) {
                        console.warn(`[AI] Failed to clean TTS audio temp file: ${cleanupError.message}`);
                    }
                }
                if (uploadedFile?.name) {
                    try {
                        await clientInfo.client.files.delete({ name: uploadedFile.name });
                    } catch (cleanupError) {
                        console.warn(`[AI] Failed to delete Gemini TTS upload: ${cleanupError.message}`);
                    }
                }
            }
        }

        if (ttsPath) {
            break;
        }
    }

    if (!ttsPath || !finalText) {
        console.warn(`[AI] TTS failed: ${lastError ? lastError.message : 'no output'}`);
        await sendReply(msg, t(lang, 'ai_tts_missing_text'), { reply_markup: buildTtsSettingsKeyboard(lang, settings) });
        return;
    }

    const langLabel = formatTtsLanguageLabel(settings.language, lang);
    const voiceOptions = buildThreadedOptions(msg, {
        caption: t(lang, 'ai_tts_caption', { voice: formatTtsVoiceLabel(settings.voice), language: langLabel })
    });
    try {
        await bot.sendAudio(msg.chat.id, ttsPath, voiceOptions, {
            filename: path.basename(ttsPath),
            contentType: 'audio/wav'
        });
    } catch (error) {
        console.warn(`[AI] Failed to send Gemini TTS audio: ${sanitizeSecrets(error.message)}`);
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
    } finally {
        try {
            await fs.promises.unlink(ttsPath);
        } catch (cleanupError) {
            console.warn(`[AI] Failed to clean Gemini TTS file: ${cleanupError.message}`);
        }
    }
}

module.exports = {
    handleAiTtsCommand
}