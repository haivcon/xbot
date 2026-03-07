const fs = require('fs');
const path = require('path');
const os = require('os');

function createAiAudio({
    bot,
    axios,
    TELEGRAM_TOKEN,
    AI_IMAGE_DOWNLOAD_TIMEOUT_MS,
    resolveAudioFormatFromPath,
    sanitizeSecrets,
    writeWaveFileFromPcm,
    GEMINI_TTS_MODEL,
    GEMINI_TTS_VOICE,
    GEMINI_TTS_VOICES,
    GEMINI_TTS_SAMPLE_RATE,
    GEMINI_TTS_CHANNELS,
    GEMINI_TTS_BIT_DEPTH,
    OPENAI_TRANSCRIBE_MODEL,
    OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE,
    OPENAI_TTS_FORMAT
}) {
    async function downloadTelegramFile(fileId, prefix = 'ai-audio') {
        if (!fileId) {
            throw new Error('Missing Telegram file ID');
        }

        const fileInfo = await bot.getFile(fileId);
        const filePath = fileInfo?.file_path;
        if (!filePath) {
            throw new Error('Missing Telegram file path');
        }

        const extension = path.extname(filePath) || '.ogg';
        const tempPath = path.join(os.tmpdir(), `${prefix}-${Date.now()}${extension}`);
        const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
        const writer = fs.createWriteStream(tempPath);

        const response = await axios.get(downloadUrl, { responseType: 'stream', timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS });
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        return { filePath: tempPath, format: resolveAudioFormatFromPath(extension) };
    }

    async function synthesizeGeminiSpeech(client, text, { voice = GEMINI_TTS_VOICE, language = 'auto' } = {}) {
        if (!client || !text || !GEMINI_TTS_MODEL) {
            return null;
        }

        const speechConfig = {
            voiceConfig: {
                prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE }
            }
        };

        if (voice && GEMINI_TTS_VOICES.includes(voice)) {
            speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName = voice;
        }

        if (language && language !== 'auto') {
            speechConfig.languageCode = language;
        }

        try {
            const response = await client.models.generateContent({
                model: GEMINI_TTS_MODEL,
                contents: [
                    {
                        role: 'user',
                        parts: [{ text }]
                    }
                ],
                config: {
                    responseModalities: ['AUDIO'],
                    speechConfig
                }
            });

            const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
                ? response.candidates[0].content.parts
                : [];
            const inlineData = parts
                .map((part) => part?.inlineData?.data || '')
                .find((entry) => entry && typeof entry === 'string');

            if (!inlineData) {
                return null;
            }

            const pcmBuffer = Buffer.from(inlineData, 'base64');
            const tempPath = path.join(os.tmpdir(), `gemini-tts-${Date.now()}.wav`);
            await writeWaveFileFromPcm(tempPath, pcmBuffer, {
                sampleRate: GEMINI_TTS_SAMPLE_RATE,
                channels: GEMINI_TTS_CHANNELS,
                bitDepth: GEMINI_TTS_BIT_DEPTH
            });
            return tempPath;
        } catch (error) {
            console.warn(`[AI] Gemini TTS failed: ${sanitizeSecrets(error.message)}`);
            return null;
        }
    }

    async function transcribeOpenAiAudio(filePath, apiKey, { model = OPENAI_TRANSCRIBE_MODEL } = {}) {
        if (!apiKey) {
            throw new Error('Missing OpenAI API key');
        }

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        formData.append('model', model);
        formData.append('response_format', 'text');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AI_IMAGE_DOWNLOAD_TIMEOUT_MS);

        try {
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`
                },
                body: formData,
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Transcription failed (${response.status}): ${errorText}`);
            }

            const text = await response.text();
            return text || '';
        } finally {
            clearTimeout(timeout);
        }
    }

    async function synthesizeOpenAiSpeech(text, apiKey, { voice = OPENAI_TTS_VOICE, format = OPENAI_TTS_FORMAT } = {}) {
        if (!apiKey) {
            throw new Error('Missing OpenAI API key');
        }

        const payload = {
            model: OPENAI_TTS_MODEL,
            voice,
            input: text,
            format
        };

        const response = await axios.post('https://api.openai.com/v1/audio/speech', payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
        });

        return Buffer.from(response?.data || '');
    }

    return {
        downloadTelegramFile,
        synthesizeGeminiSpeech,
        transcribeOpenAiAudio,
        synthesizeOpenAiSpeech
    };
}

module.exports = { createAiAudio };
