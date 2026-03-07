/**
 * AI Sessions Module
 * Handles user session history and image context
 */

const {
    sessionHistory,
    SESSION_MAX_MESSAGES,
    SESSION_TTL,
    lastImageContext,
    IMAGE_CONTEXT_TTL
} = require('./sharedState');

/**
 * Create session handlers with deps injection
 */
function createSessionHandlers(deps) {
    const { db } = deps;

    /**
     * Cleanup expired sessions to prevent memory leaks
     */
    function cleanupExpiredSessions() {
        const now = Date.now();
        for (const [userId, session] of sessionHistory.entries()) {
            if (now - session.lastActivity > SESSION_TTL) {
                sessionHistory.delete(userId);
            }
        }
    }

    /**
     * Get or create session for user (hydrate from DB when possible)
     */
    async function getUserSession(userId) {
        if (!userId) return { messages: [], lastActivity: Date.now() };
        if (sessionHistory.has(userId)) {
            const session = sessionHistory.get(userId);
            session.lastActivity = Date.now();
            return session;
        }
        // Hydrate from DB
        let messages = [];
        try {
            const memory = await db.getAiMemory(userId);
            if (memory?.conversationHistory && Array.isArray(memory.conversationHistory)) {
                messages = memory.conversationHistory.slice(-SESSION_MAX_MESSAGES);
            }
        } catch (e) {
            console.error('[Session] Failed to hydrate session from DB:', e.message);
        }
        const session = { messages, lastActivity: Date.now() };
        sessionHistory.set(userId, session);
        return session;
    }

    /**
     * Add message to session history and persist to DB
     */
    async function addToSessionHistory(userId, role, content) {
        if (!userId) return;
        const session = await getUserSession(userId);
        session.messages.push({ role, content, timestamp: Date.now() });
        if (session.messages.length > SESSION_MAX_MESSAGES) {
            session.messages = session.messages.slice(-SESSION_MAX_MESSAGES);
        }
        session.lastActivity = Date.now();
        sessionHistory.set(userId, session);
        // Persist to DB
        try {
            await db.updateAiMemory(userId, { conversationHistory: session.messages });
        } catch (e) {
            console.error('[Session] Failed to persist session to DB:', e.message);
        }
    }

    /**
     * Clear session for user
     */
    async function clearUserSession(userId) {
        if (!userId) return;
        sessionHistory.delete(userId);
        try {
            await db.updateAiMemory(userId, { conversationHistory: [] });
        } catch (e) {
            console.error('[Session] Failed to clear session in DB:', e.message);
        }
    }

    /**
     * Get image context key
     */
    function getImageContextKey(chatId, userId) {
        return `${chatId}:${userId}`;
    }

    /**
     * Store image context for follow-up questions
     */
    function storeImageContext(chatId, userId, imageData, description) {
        const key = getImageContextKey(chatId, userId);
        lastImageContext.set(key, {
            imageData,
            description,
            timestamp: Date.now()
        });
    }

    /**
     * Get image context if still valid
     */
    function getImageContext(chatId, userId) {
        const key = getImageContextKey(chatId, userId);
        const context = lastImageContext.get(key);
        if (!context) return null;
        if (Date.now() - context.timestamp > IMAGE_CONTEXT_TTL) {
            lastImageContext.delete(key);
            return null;
        }
        return context;
    }

    /**
     * Clear image context
     */
    function clearImageContext(chatId, userId) {
        const key = getImageContextKey(chatId, userId);
        lastImageContext.delete(key);
    }

    // Run cleanup periodically
    setInterval(cleanupExpiredSessions, 5 * 60 * 1000); // Every 5 minutes

    return {
        getUserSession,
        addToSessionHistory,
        clearUserSession,
        cleanupExpiredSessions,
        getImageContextKey,
        storeImageContext,
        getImageContext,
        clearImageContext
    };
}

module.exports = { createSessionHandlers };
