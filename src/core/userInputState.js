/**
 * Centralized User Input State Checker
 * 
 * Kiểm tra xem user có đang trong một wizard/input flow không.
 * Được sử dụng bởi auto-detection handlers để tránh xung đột khi
 * user đang nhập thông tin (địa chỉ ví, hợp đồng, token, v.v.)
 * 
 * UPDATED LOGIC:
 * - Chỉ block auto-detection nếu wizard state còn hạn (< 5 phút)
 * - Wizard states hết hạn sẽ bị xóa tự động
 * - hasActiveWizardForMessage() kiểm tra cả reply context
 */

const {
    tokenWizardStates,
    txhashWizardStates,
    registerWizardStates,
    contractWizardStates,
    idTelegramSessions,
    checkinAdminStates,
    welcomeAdminStates,
    aiApiAddPrompts,
    filterSetupStates,
    pendingSecretMessages,
    adminBroadcastPrompts,
    customPersonaPrompts
} = require('./state');

// Wizard state expiration time (5 minutes)
const WIZARD_EXPIRATION_MS = 5 * 60 * 1000;

// Import external wizard states
let priceWizardStatesCache = null;

// Note: customPersonaPrompts is now imported directly from state.js

function getPriceWizardStates() {
    // Always try to get fresh reference if cache is empty or invalid
    if (!priceWizardStatesCache || priceWizardStatesCache.size === undefined) {
        try {
            const priceAlerts = require('../features/priceAlerts');
            if (priceAlerts.priceWizardStates && priceAlerts.priceWizardStates instanceof Map) {
                priceWizardStatesCache = priceAlerts.priceWizardStates;
            }
        } catch (error) {
            // priceAlerts may not be loaded yet - return empty Map but don't cache
            return new Map();
        }
    }
    return priceWizardStatesCache || new Map();
}

/**
 * Get all wizard state maps for checking
 * @returns {Array<{map: Map, type: string}>}
 */
function getWizardChecks() {
    return [
        // Core wizard states from state.js
        { map: tokenWizardStates, type: 'token_wizard' },
        { map: txhashWizardStates, type: 'txhash_wizard' },
        { map: registerWizardStates, type: 'register_wizard' },
        { map: contractWizardStates, type: 'contract_wizard' },
        { map: idTelegramSessions, type: 'id_telegram' },
        { map: checkinAdminStates, type: 'checkin_admin' },
        { map: welcomeAdminStates, type: 'welcome_admin' },
        { map: aiApiAddPrompts, type: 'ai_api_add' },
        { map: filterSetupStates, type: 'filter_setup' },
        { map: pendingSecretMessages, type: 'secret_message' },
        { map: adminBroadcastPrompts, type: 'admin_broadcast' },
        { map: customPersonaPrompts, type: 'custom_persona' },
        // External wizard states
        { map: getPriceWizardStates(), type: 'price_wizard' }
    ];
}

/**
 * Check if a wizard state is expired
 * @param {object} state - The wizard state object
 * @returns {boolean} - True if expired
 */
function isWizardExpired(state) {
    if (!state) return true;

    const createdAt = state.createdAt || state.timestamp || state.ts;
    if (!createdAt) {
        // No timestamp - assume not expired (conservative)
        return false;
    }

    return Date.now() - createdAt > WIZARD_EXPIRATION_MS;
}

/**
 * Check if user has an active wizard/input session
 * @param {string} userId - User ID to check
 * @param {string} chatId - Chat ID (optional, for chat-specific wizards)
 * @returns {{ active: boolean, type: string|null, state: object|null }}
 */
function getUserInputState(userId, chatId = null) {
    if (!userId) {
        return { active: false, type: null, state: null };
    }

    const userIdStr = userId.toString();
    const chatIdStr = chatId ? chatId.toString() : null;

    // DEBUG: Check customPersonaPrompts directly
    const cpState = customPersonaPrompts.get(userIdStr);
    console.log('[getUserInputState] Check:', { userId: userIdStr, customPersonaPromptsSize: customPersonaPrompts.size, hasState: !!cpState });

    const wizardChecks = getWizardChecks();

    for (const { map, type } of wizardChecks) {
        if (!map || typeof map.get !== 'function') {
            continue; // Skip if map is not valid
        }

        const state = map.get(userIdStr);
        if (state) {
            // Debug log for custom_persona
            if (type === 'custom_persona') {
                console.log('[UserInputState] Found custom_persona:', {
                    userId: userIdStr,
                    stateChatId: state.chatId,
                    msgChatId: chatIdStr,
                    messageId: state.messageId,
                    timestamp: state.timestamp
                });
            }

            // Check if wizard is expired
            if (isWizardExpired(state)) {
                // Clean up expired state
                map.delete(userIdStr);
                console.log(`[UserInputState] Cleaned up expired ${type} for user ${userIdStr}`);
                continue;
            }

            // Additional chat match check for chat-specific wizards
            // Some wizards are DM-only, some are chat-specific
            if (state.chatId && chatIdStr && state.chatId !== chatIdStr) {
                console.log(`[UserInputState] ${type} chat mismatch: state=${state.chatId} msg=${chatIdStr}`);
                continue; // Different chat, not blocking this message
            }
            return { active: true, type, state };
        }
    }

    return { active: false, type: null, state: null };
}

/**
 * Check if user has ANY active input session
 * Quick check for auto-detection handlers
 * 
 * @param {string} userId - User ID to check
 * @param {string} chatId - Chat ID (optional)
 * @returns {boolean} - True if user has an active wizard
 */
function hasActiveWizard(userId, chatId = null) {
    return getUserInputState(userId, chatId).active;
}

/**
 * SMART CHECK: Check if message should be blocked for a specific wizard
 * Only blocks if:
 * 1. User has an active wizard in this chat
 * 2. AND message is a reply to the wizard's prompt message
 * 
 * Regular messages (not replies) will NOT be blocked even if wizard is active.
 * This allows users to continue chatting while having an open wizard.
 * 
 * @param {string} userId - User ID
 * @param {string} chatId - Chat ID
 * @param {object} msg - Telegram message object
 * @returns {boolean} - True if this specific message should skip auto-detection
 */
function shouldSkipAutoDetection(userId, chatId, msg) {
    if (!userId || !chatId) {
        return false;
    }

    const inputState = getUserInputState(userId, chatId);
    // Debug: Log if custom_persona state exists
    if (inputState.type === 'custom_persona') {
        console.log('[SkipDetection] custom_persona state found:', {
            active: inputState.active,
            chatId,
            stateMessageId: inputState.state?.messageId,
            replyToId: msg?.reply_to_message?.message_id
        });
    }

    if (!inputState.active) {
        return false;
    }

    const state = inputState.state;
    const promptMessageId = state?.promptMessageId || state?.messageId;

    // SPECIAL CASE: In private chat (DM), price_wizard uses time-based detection
    // Skip auto-detection for ALL messages in DM when price_wizard is active (within 5 min window)
    const isPrivateChat = msg?.chat?.type === 'private';
    if (isPrivateChat && inputState.type === 'price_wizard') {
        console.log('[SkipDetection] ✓ DM + price_wizard active - skipping auto-detection');
        return true;
    }

    // If wizard has a promptMessageId, only block if message is a REPLY to that prompt
    if (promptMessageId) {
        const replyToId = msg?.reply_to_message?.message_id;
        console.log('[SkipDetection] Checking reply match:', { promptMessageId, replyToId, match: replyToId === promptMessageId });
        if (replyToId && replyToId === promptMessageId) {
            // This is a reply to the wizard prompt - let wizard handler process it
            return true;
        }
        // Not a reply to prompt - allow auto-detection
        return false;
    }

    // Wizard has no promptMessageId - use legacy behavior (block all)
    // This is for wizards that don't use force_reply
    return true;
}

/**
 * Clear all wizard states for a user (used when user cancels or completes)
 * @param {string} userId - User ID
 */
function clearUserWizardStates(userId) {
    if (!userId) return;

    const userIdStr = userId.toString();
    const wizardChecks = getWizardChecks();

    for (const { map, type } of wizardChecks) {
        if (map && typeof map.delete === 'function' && map.has(userIdStr)) {
            map.delete(userIdStr);
            console.log(`[UserInputState] Cleared ${type} for user ${userIdStr}`);
        }
    }
}

/**
 * Get descriptive label for wizard type
 * Used for logging and debugging
 * 
 * @param {string} type - Wizard type from getUserInputState
 * @returns {string} - Human-readable label
 */
function getWizardLabel(type) {
    const labels = {
        token_wizard: 'Token Lookup',
        txhash_wizard: 'Transaction Hash Lookup',
        register_wizard: 'Wallet Registration',
        contract_wizard: 'Contract Lookup',
        id_telegram: 'ID Telegram',
        checkin_admin: 'Checkin Admin',
        welcome_admin: 'Welcome Admin',
        ai_api_add: 'AI API Key',
        filter_setup: 'Filter Setup',
        secret_message: 'Secret Message',
        admin_broadcast: 'Admin Broadcast',
        custom_persona: 'Custom Persona',
        price_wizard: 'Price Alert'
    };
    return labels[type] || type;
}

module.exports = {
    getUserInputState,
    hasActiveWizard,
    shouldSkipAutoDetection,
    clearUserWizardStates,
    getWizardLabel,
    WIZARD_EXPIRATION_MS
};
