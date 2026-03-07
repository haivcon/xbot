const fs = require('fs');
const path = require('path');
const {
    GEMINI_TTS_SAMPLE_RATE,
    GEMINI_TTS_CHANNELS,
    GEMINI_TTS_BIT_DEPTH
} = require('../../config/env');
const { helpMenuStates } = require('../../core/state');

function buildSyntheticCommandMessage(query) {
    const baseMessage = query.message || {};
    const synthetic = {
        chat: baseMessage.chat ? { ...baseMessage.chat } : null,
        from: query.from ? { ...query.from } : null,
        message_id: baseMessage.message_id,
        message_thread_id: baseMessage.message_thread_id
            ?? baseMessage.reply_to_message?.message_thread_id
            ?? null,
        reply_to_message: baseMessage.reply_to_message || null,
        date: Math.floor(Date.now() / 1000)
    };

    if (synthetic.chat && typeof synthetic.chat.id === 'number') {
        synthetic.chat.id = synthetic.chat.id.toString();
    }

    return synthetic;
}

function getHelpMessageStateKey(chatId, messageId) {
    if (!chatId || !messageId) {
        return null;
    }
    return `${chatId}:${messageId}`;
}

function saveHelpMessageState(chatId, messageId, state) {
    const key = getHelpMessageStateKey(chatId, messageId);
    if (!key) {
        return;
    }
    helpMenuStates.set(key, state);
}

function getHelpMessageState(chatId, messageId) {
    const key = getHelpMessageStateKey(chatId, messageId);
    return key ? helpMenuStates.get(key) : null;
}

function clearHelpMessageState(chatId, messageId) {
    const key = getHelpMessageStateKey(chatId, messageId);
    if (!key) {
        return;
    }
    helpMenuStates.delete(key);
}

function detectTelegramMessageType(message) {
    if (!message || typeof message !== 'object') {
        return 'unknown';
    }

    if (message.video) return 'video';
    if (message.animation) return 'animation';
    if (message.document) return 'document';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.video_note) return 'video_note';
    if (message.sticker) return 'sticker';
    if (Array.isArray(message.photo) && message.photo.length > 0) return 'photo';
    if (message.contact) return 'contact';
    if (message.location) return 'location';
    if (message.venue) return 'venue';
    if (message.poll) return 'poll';
    if (message.dice) return 'dice';
    if (message.game) return 'game';
    if (message.text) return 'text';

    return 'message';
}

function collectTelegramFileIds(message) {
    if (!message || typeof message !== 'object') {
        return [];
    }

    const fileIds = [];
    const addFile = (entry, type) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }

        const file_id = entry.file_id || entry.fileId || null;
        const file_unique_id = entry.file_unique_id || entry.fileUniqueId || null;
        if (file_id || file_unique_id) {
            fileIds.push({ type, file_id, file_unique_id });
        }

        if (entry.thumb) {
            addFile(entry.thumb, `${type}_thumb`);
        }
    };

    addFile(message.document, 'document');
    addFile(message.video, 'video');
    addFile(message.animation, 'animation');
    addFile(message.audio, 'audio');
    addFile(message.voice, 'voice');
    addFile(message.video_note, 'video_note');
    addFile(message.sticker, 'sticker');

    if (Array.isArray(message.photo)) {
        message.photo.forEach((entry) => addFile(entry, 'photo'));
    }

    return fileIds;
}

function extractAudioSourceFromMessage(message) {
    if (!message || typeof message !== 'object') {
        return null;
    }

    const primary = message.voice || message.audio || message.video_note || null;
    const replied = message.reply_to_message || null;
    const replyAudio = replied ? (replied.voice || replied.audio || replied.video_note || null) : null;

    const sourceMessage = primary ? message : replyAudio ? replied : null;
    const audio = primary || replyAudio || null;

    if (!sourceMessage || !audio) {
        return null;
    }

    return { audio, sourceMessage };
}

function resolveAudioFormatFromPath(filePath) {
    const ext = (path.extname(filePath || '') || '').replace(/^\./, '').toLowerCase();
    if (ext) {
        return ext;
    }
    return 'ogg';
}

function resolveAudioMimeType(format) {
    const normalized = (format || '').toLowerCase();
    const lookup = {
        ogg: 'audio/ogg',
        oga: 'audio/ogg',
        opus: 'audio/ogg',
        mp3: 'audio/mpeg',
        mpeg: 'audio/mpeg',
        wav: 'audio/wav',
        aac: 'audio/aac',
        m4a: 'audio/mp4',
        flac: 'audio/flac',
        aiff: 'audio/aiff'
    };

    return lookup[normalized] || 'audio/ogg';
}

function buildWaveBufferFromPcm(pcmBuffer, options = {}) {
    const channels = options.channels && options.channels > 0 ? options.channels : GEMINI_TTS_CHANNELS;
    const sampleRate = options.sampleRate && options.sampleRate > 0 ? options.sampleRate : GEMINI_TTS_SAMPLE_RATE;
    const bitDepth = options.bitDepth && options.bitDepth > 0 ? options.bitDepth : GEMINI_TTS_BIT_DEPTH;

    const blockAlign = channels * (bitDepth / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmBuffer.length;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM chunk size
    buffer.writeUInt16LE(1, 20); // audio format PCM
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmBuffer.copy(buffer, 44);

    return buffer;
}

async function writeWaveFileFromPcm(targetPath, pcmBuffer, options = {}) {
    const wavBuffer = buildWaveBufferFromPcm(pcmBuffer, options);
    await fs.promises.writeFile(targetPath, wavBuffer);
    return targetPath;
}

module.exports = {
    buildSyntheticCommandMessage,
    saveHelpMessageState,
    getHelpMessageState,
    clearHelpMessageState,
    detectTelegramMessageType,
    collectTelegramFileIds,
    extractAudioSourceFromMessage,
    resolveAudioFormatFromPath,
    resolveAudioMimeType,
    buildWaveBufferFromPcm,
    writeWaveFileFromPcm
};
