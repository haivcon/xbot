/**
 * AI TTS Handler Helper Module
 * 
 * Provides shared utilities for AI Text-to-Speech handling.
 * Used by handleAiTtsCommand function.
 */

const path = require('path');
const fs = require('fs');

/**
 * Build TTS output file path
 * @param {string} userId - User ID
 * @param {string} format - Audio format (wav, mp3, etc.)
 * @param {string} tmpDir - Temporary directory path
 * @returns {string} Output file path
 */
function buildTtsOutputPath(userId, format = 'wav', tmpDir = null) {
    const dir = tmpDir || require('os').tmpdir();
    const timestamp = Date.now();
    const filename = `tts_${userId}_${timestamp}.${format}`;
    return path.join(dir, filename);
}

/**
 * Validate TTS input text
 * @param {string} text - Input text
 * @param {number} maxLength - Maximum allowed length (default: 4000)
 * @returns {Object} { valid, text, error }
 */
function validateTtsInput(text, maxLength = 4000) {
    if (!text || typeof text !== 'string') {
        return { valid: false, text: '', error: 'empty' };
    }

    const trimmed = text.trim();
    if (!trimmed) {
        return { valid: false, text: '', error: 'empty' };
    }

    if (trimmed.length > maxLength) {
        return {
            valid: true,
            text: trimmed.slice(0, maxLength),
            error: 'truncated'
        };
    }

    return { valid: true, text: trimmed, error: null };
}

/**
 * Clean up temporary TTS file
 * @param {string} filePath - Path to temporary file
 * @returns {Promise<boolean>} True if cleanup succeeded
 */
async function cleanupTtsFile(filePath) {
    if (!filePath) {
        return true;
    }

    try {
        await fs.promises.unlink(filePath);
        return true;
    } catch (error) {
        console.warn(`[TTS] Failed to cleanup temp file: ${error.message}`);
        return false;
    }
}

/**
 * Build TTS caption for Telegram audio message
 * @param {Object} options
 * @param {Function} options.t - Translation function
 * @param {string} options.lang - Language code
 * @param {string} options.voice - Voice name
 * @param {string} options.language - TTS language
 * @param {Function} options.formatVoiceLabel - Voice label formatter
 * @param {Function} options.formatLanguageLabel - Language label formatter
 * @returns {string} Caption text
 */
function buildTtsCaption({
    t,
    lang,
    voice,
    language,
    formatVoiceLabel,
    formatLanguageLabel
}) {
    const voiceLabel = formatVoiceLabel ? formatVoiceLabel(voice) : voice;
    const langLabel = formatLanguageLabel ? formatLanguageLabel(language, lang) : language;

    return t(lang, 'ai_tts_caption', { voice: voiceLabel, language: langLabel });
}

/**
 * Parse TTS command payload
 * @param {string} text - Full command text
 * @returns {Object} { command, payload }
 */
function parseTtsPayload(text) {
    if (!text || typeof text !== 'string') {
        return { command: '', payload: '' };
    }

    const parts = text.trim().split(/\s+/);
    const command = parts[0] || '';
    const payload = parts.slice(1).join(' ').trim();

    return { command, payload };
}

module.exports = {
    buildTtsOutputPath,
    validateTtsInput,
    cleanupTtsFile,
    buildTtsCaption,
    parseTtsPayload
};
