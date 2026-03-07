/**
 * Shared State for AI Handlers
 * Contains Maps and caches used across all AI modules
 */

// User persona preferences cache (userId -> personaId)
const userPersonaPreferences = new Map();

// Custom persona cache (userId -> { name, prompt })
const customPersonaCache = new Map();

// Custom persona prompt input sessions (userId -> { chatId, messageId, timestamp })
const customPersonaPrompts = new Map();

// Last image context for AI conversations (userId -> { fileId, caption, date })
const lastImageContext = new Map();

// AI token usage tracking (userId -> { date, prompt, completion, total, images })
const aiTokenUsageByUser = new Map();

// Profile reminder tracking (userId -> YYYY-MM-DD)
const profileReminderSent = new Map();

// Intent classification cache
const intentCache = new Map();
const INTENT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Session history for conversations
const sessionHistory = new Map();
const SESSION_MAX_MESSAGES = 20;
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

// Image context settings
const IMAGE_CONTEXT_TTL = 15 * 60 * 1000; // 15 minutes

module.exports = {
    userPersonaPreferences,
    customPersonaCache,
    customPersonaPrompts,
    lastImageContext,
    aiTokenUsageByUser,
    profileReminderSent,
    intentCache,
    INTENT_CACHE_TTL,
    sessionHistory,
    SESSION_MAX_MESSAGES,
    SESSION_TTL,
    IMAGE_CONTEXT_TTL
};
