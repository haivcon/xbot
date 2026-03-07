/**
 * Smart Confirmation Handler
 * Hiển thị xác nhận trước khi gọi hàm từ auto-detection
 * 
 * Flow: Keyword match → Show confirmation → User chọn → Execute
 */

const CONFIRMATION_TIMEOUT_MS = 30000; // 30 seconds
const pendingConfirmations = new Map();

/**
 * Cấu hình các command với tùy chọn variants
 */
const COMMAND_VARIANTS = {
    roll: {
        labelKey: 'random_action_dice',
        icon: '🎲',
        variants: [
            { label: '1d6', params: '1d6' },
            { label: '2d6', params: '2d6' },
            { label: '1d20', params: '1d20' },
            { label: '3d6', params: '3d6' }
        ],
        descKey: 'confirm_roll_desc'
    },
    rps: {
        labelKey: 'random_action_rps',
        icon: '✊',
        variants: [
            { labelKey: 'random_rps_rock', label: '🪨', params: 'rock' },
            { labelKey: 'random_rps_paper', label: '📄', params: 'paper' },
            { labelKey: 'random_rps_scissors', label: '✂️', params: 'scissors' }
        ],
        descKey: 'confirm_rps_desc'
    },
    gomoku: {
        labelKey: 'random_action_gomoku',
        icon: '⚫',
        variants: null,
        descKey: 'confirm_gomoku_desc'
    },
    rand: {
        labelKey: 'random_action_number',
        icon: '🔢',
        variants: [
            { label: '1-100', params: '1 100' },
            { label: '1-1000', params: '1 1000' },
            { label: '1-10', params: '1 10' }
        ],
        descKey: 'confirm_rand_desc'
    },
    long: {
        labelKey: 'random_action_longshort',
        icon: '📈',
        variants: [
            { label: '10x', params: '10' },
            { label: '50x', params: '50' },
            { label: '100x', params: '100' }
        ],
        descKey: 'confirm_long_desc'
    },
    td: {
        labelKey: 'random_action_truth',
        icon: '🎭',
        variants: null,
        descKey: 'confirm_td_desc'
    },
    doremon: {
        labelKey: 'random_action_fortune',
        icon: '🔮',
        variants: null,
        descKey: 'confirm_fortune_desc'
    },
    mines: {
        labelKey: 'random_action_mines',
        icon: '💣',
        variants: [
            { label: '5x5', params: '5x5' },
            { label: '8x8', params: '8x8' },
            { label: '10x10', params: '10x10' }
        ],
        descKey: 'confirm_mines_desc'
    },
    memory: {
        labelKey: 'random_action_memory',
        icon: '🧠',
        variants: [
            { label: '3x4', params: '3x4' },
            { label: '4x4', params: '4x4' },
            { label: '4x5', params: '4x5' }
        ],
        descKey: 'confirm_memory_desc'
    },
    sudoku: {
        labelKey: 'random_action_sudoku',
        icon: '🔢',
        variants: [
            { labelKey: 'confirm_sudoku_easy', label: '4×4', params: '4' },
            { labelKey: 'confirm_sudoku_hard', label: '9×9', params: '9' }
        ],
        descKey: 'confirm_sudoku_desc'
    },
    chess: {
        labelKey: 'random_action_chess',
        icon: '♟️',
        variants: null,
        descKey: 'confirm_chess_desc'
    },
    treasure: {
        labelKey: 'random_action_treasure',
        icon: '🏴‍☠️',
        variants: [
            { label: '5x5', params: '5x5' },
            { label: '7x7', params: '7x7' },
            { label: '10x10', params: '10x10' }
        ],
        descKey: 'confirm_treasure_desc'
    }
};

/**
 * Build inline keyboard cho confirmation
 */
function buildConfirmationKeyboard(command, variants, suggestedParams, lang, t) {
    const keyboard = [];
    const config = COMMAND_VARIANTS[command];

    if (!config) {
        // Fallback for commands without config
        const startText = t ? t(lang, 'confirm_start') : 'Start';
        const cancelText = t ? t(lang, 'confirm_cancel') : 'Cancel';
        keyboard.push([
            { text: `▶️ ${startText}`, callback_data: `autoconfirm|${command}|${suggestedParams || ''}` },
            { text: `❌ ${cancelText}`, callback_data: 'autoconfirm|cancel' }
        ]);
        return { inline_keyboard: keyboard };
    }

    // If variants exist, display options
    if (config.variants && config.variants.length > 0) {
        const variantRow = [];
        for (const variant of config.variants.slice(0, 4)) { // Max 4 variants per row
            // Use i18n key if available, fallback to static label
            const variantLabel = variant.labelKey && t ? t(lang, variant.labelKey) : variant.label;
            variantRow.push({
                text: `${config.icon} ${variantLabel}`,
                callback_data: `autoconfirm|${command}|${variant.params}`
            });
        }
        keyboard.push(variantRow);

        // Nếu user đã có params từ text, thêm option đó
        if (suggestedParams && !config.variants.some(v => v.params === suggestedParams)) {
            keyboard.push([{
                text: `⚡ ${suggestedParams}`,
                callback_data: `autoconfirm|${command}|${suggestedParams}`
            }]);
        }
    } else {
        // No variants, just Start button
        const startText = t ? t(lang, 'confirm_start') : 'Start';
        keyboard.push([{
            text: `▶️ ${startText}`,
            callback_data: `autoconfirm|${command}|${suggestedParams || ''}`
        }]);
    }

    // Add Cancel button
    const cancelText = t ? t(lang, 'confirm_cancel') : 'Cancel';
    keyboard.push([{
        text: `❌ ${cancelText}`,
        callback_data: 'autoconfirm|cancel'
    }]);

    return { inline_keyboard: keyboard };
}

/**
 * Build confirmation text
 */
function buildConfirmationText(command, detectedText, lang, t) {
    const config = COMMAND_VARIANTS[command];
    // Use i18n key for label if available
    const label = (config?.labelKey && t) ? `${config.icon} ${t(lang, config.labelKey)}` : (config?.label || command);
    const icon = config?.icon || '🎯';

    // Use i18n translations, fallback to English
    const title = t ? t(lang, 'confirm_title') : 'You want to:';
    const hint = t ? t(lang, 'confirm_hint') : 'Choose an option or press Cancel';

    return `${icon} <b>${title}</b>\n\n` +
        `📍 <b>${label}</b>\n` +
        `💬 <i>"${detectedText.substring(0, 50)}${detectedText.length > 50 ? '...' : ''}"</i>\n\n` +
        `${hint}`;
}

/**
 * Store pending confirmation (để xử lý callback)
 */
function storePendingConfirmation(chatId, messageId, originalMsg) {
    const key = `${chatId}:${messageId}`;
    pendingConfirmations.set(key, {
        originalMsg,
        createdAt: Date.now()
    });

    // Auto cleanup sau timeout
    setTimeout(() => {
        pendingConfirmations.delete(key);
    }, CONFIRMATION_TIMEOUT_MS + 5000);
}

/**
 * Get pending confirmation
 */
function getPendingConfirmation(chatId, messageId) {
    const key = `${chatId}:${messageId}`;
    return pendingConfirmations.get(key);
}

/**
 * Clear pending confirmation
 */
function clearPendingConfirmation(chatId, messageId) {
    const key = `${chatId}:${messageId}`;
    pendingConfirmations.delete(key);
}

/**
 * Cleanup expired confirmations
 */
function cleanupExpiredConfirmations() {
    const now = Date.now();
    for (const [key, value] of pendingConfirmations.entries()) {
        if (now - value.createdAt > CONFIRMATION_TIMEOUT_MS) {
            pendingConfirmations.delete(key);
        }
    }
}

// Cleanup mỗi phút
setInterval(cleanupExpiredConfirmations, 60000);

module.exports = {
    COMMAND_VARIANTS,
    CONFIRMATION_TIMEOUT_MS,
    buildConfirmationKeyboard,
    buildConfirmationText,
    storePendingConfirmation,
    getPendingConfirmation,
    clearPendingConfirmation,
    cleanupExpiredConfirmations
};
