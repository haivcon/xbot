const path = require('path');

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

module.exports = {
    detectTelegramMessageType,
    collectTelegramFileIds,
    extractAudioSourceFromMessage,
    resolveAudioFormatFromPath,
    resolveAudioMimeType
};
