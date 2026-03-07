/**
 * AI Image Handler Helper Module
 * 
 * Provides shared utilities for AI image request handling.
 * Used by runOpenAiImageRequest and runGoogleImageRequest functions.
 */

/**
 * Validate and prepare image source for AI processing
 * @param {Object} options
 * @param {Array} options.photos - Array of photo objects from Telegram
 * @param {string} options.action - Image action ('generate', 'edit', 'analyze')
 * @param {Function} options.downloadTelegramPhotoBuffer - Download function
 * @param {Function} options.convertImageToPngSquare - Conversion function
 * @param {number} options.maxBytes - Maximum allowed image size in bytes
 * @returns {Object} { buffer, error, limitMb }
 */
async function prepareImageSource({
    photos,
    action,
    downloadTelegramPhotoBuffer,
    convertImageToPngSquare,
    maxBytes
}) {
    // Generate action doesn't need input image
    if (action === 'generate') {
        return { buffer: null, error: null };
    }

    const largestPhoto = Array.isArray(photos) && photos.length
        ? photos[photos.length - 1]
        : null;

    if (!largestPhoto) {
        return { buffer: null, error: 'no_photo' };
    }

    const download = await downloadTelegramPhotoBuffer(largestPhoto);

    if (download?.error === 'too_large') {
        return { buffer: null, error: 'too_large', limitMb: download.limitMb };
    }

    if (!download?.buffer) {
        return { buffer: null, error: 'download_failed' };
    }

    const pngBuffer = await convertImageToPngSquare(download.buffer);
    const maxMb = Math.max(1, Math.ceil(maxBytes / (1024 * 1024)));

    if (pngBuffer.length > maxBytes) {
        return { buffer: null, error: 'too_large', limitMb: maxMb };
    }

    return { buffer: pngBuffer, error: null };
}

/**
 * Build image generation caption for Telegram message
 * @param {Object} options
 * @param {Function} options.t - Translation function
 * @param {string} options.lang - Language code
 * @param {string} options.action - Image action
 * @param {string} options.prompt - Original prompt text
 * @param {Object} options.providerMeta - Provider metadata
 * @param {string} options.revisedPrompt - Optional revised prompt from AI
 * @returns {string} Formatted caption
 */
function buildImageCaption({
    t,
    lang,
    action,
    prompt,
    providerMeta,
    revisedPrompt = null
}) {
    const actionLabel = action === 'generate'
        ? t(lang, 'ai_image_action_generate')
        : action === 'edit'
            ? t(lang, 'ai_image_action_edit')
            : t(lang, 'ai_image_action_analyze');

    const parts = [
        t(lang, 'ai_image_caption_header', { provider: providerMeta.label }),
        `🎨 ${actionLabel}`
    ];

    if (revisedPrompt && revisedPrompt !== prompt) {
        parts.push(`✏️ ${t(lang, 'ai_image_revised')}: ${revisedPrompt.slice(0, 200)}${revisedPrompt.length > 200 ? '...' : ''}`);
    }

    return parts.join('\n');
}

/**
 * Determine the image action based on context
 * @param {string} action - Detected action ('generate', 'edit', 'variation', 'analyze')
 * @returns {Object} { requiresInput: boolean, outputsImage: boolean }
 */
function getImageActionContext(action) {
    const requiresInput = ['edit', 'variation', 'analyze'].includes(action);
    const outputsImage = ['generate', 'edit', 'variation'].includes(action);

    return { requiresInput, outputsImage };
}

/**
 * Build error message for image operation failure
 * @param {Object} options
 * @param {Function} options.t - Translation function
 * @param {string} options.lang - Language code
 * @param {Error} options.error - The error object
 * @param {Object} options.providerMeta - Provider metadata
 * @returns {string} Error message key
 */
function getImageErrorKey({ error, providerMeta }) {
    const message = error?.message || '';
    const status = error?.response?.status;

    if (status === 401 || status === 403) {
        return 'ai_provider_forbidden';
    }

    if (status === 429) {
        return 'ai_provider_quota';
    }

    if (/billing/i.test(message)) {
        return 'ai_provider_billing_limit';
    }

    if (/content.*policy/i.test(message) || /safety/i.test(message)) {
        return 'ai_image_content_policy';
    }

    return 'ai_error';
}

module.exports = {
    prepareImageSource,
    buildImageCaption,
    getImageActionContext,
    getImageErrorKey
};
