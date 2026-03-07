/**
 * AI AIB Command Helper Module
 * 
 * Provides shared utilities for /aib (AI with function calling) command.
 * Used by processAibRequest and related functions.
 */

/**
 * Permission levels for function calling
 */
const PERMISSION_LEVELS = {
    PUBLIC: 'public',       // Available to all users
    ADMIN: 'admin',         // Requires group admin
    OWNER: 'owner'          // Requires bot owner
};

/**
 * Check if user has required permission level
 * @param {string} requiredLevel - Required permission level
 * @param {Object} context - Context object with permission info
 * @returns {boolean} True if user has permission
 */
function hasPermission(requiredLevel, context) {
    const { isOwner = false, isAdmin = false } = context;

    switch (requiredLevel) {
        case PERMISSION_LEVELS.OWNER:
            return isOwner;
        case PERMISSION_LEVELS.ADMIN:
            return isAdmin || isOwner;
        case PERMISSION_LEVELS.PUBLIC:
        default:
            return true;
    }
}

/**
 * Filter available functions by user permission
 * @param {Array} allFunctions - All function declarations
 * @param {Object} context - Context with permission info
 * @returns {Array} Filtered functions
 */
function filterFunctionsByPermission(allFunctions, context) {
    if (!Array.isArray(allFunctions)) {
        return [];
    }

    return allFunctions.filter((fn) => {
        const requiredLevel = fn._permissionLevel || PERMISSION_LEVELS.PUBLIC;
        return hasPermission(requiredLevel, context);
    });
}

/**
 * Parse function call from AI response
 * @param {Object} candidate - AI response candidate
 * @returns {Object|null} Function call object or null
 */
function extractFunctionCall(candidate) {
    if (!candidate) {
        return null;
    }

    // Check for function call in parts
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
        if (part?.functionCall) {
            return {
                name: part.functionCall.name,
                args: part.functionCall.args || {}
            };
        }
    }

    return null;
}

/**
 * Build function call context for execution
 * @param {Object} options
 * @param {Object} options.msg - Telegram message
 * @param {string} options.lang - Language code
 * @param {Object} options.deps - Dependencies
 * @returns {Object} Execution context
 */
function buildExecutionContext({ msg, lang, deps = {} }) {
    return {
        chatId: msg.chat?.id,
        topicId: msg.message_thread_id,
        userId: msg.from?.id,
        username: msg.from?.username,
        firstName: msg.from?.first_name,
        lang,
        isPrivate: msg.chat?.type === 'private',
        isGroup: ['group', 'supergroup'].includes(msg.chat?.type),
        msg,
        ...deps
    };
}

/**
 * Format function result for AI to process
 * @param {string} functionName - Name of executed function
 * @param {*} result - Function result
 * @param {Error|null} error - Error if any
 * @returns {Object} Formatted result for AI
 */
function formatFunctionResult(functionName, result, error = null) {
    if (error) {
        return {
            name: functionName,
            response: {
                success: false,
                error: error.message || 'Unknown error'
            }
        };
    }

    return {
        name: functionName,
        response: {
            success: true,
            data: result
        }
    };
}

/**
 * Check if response indicates a help request
 * @param {string} text - User text
 * @returns {boolean} True if help request detected
 */
function isHelpRequest(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const lower = text.toLowerCase().trim();
    const helpPatterns = [
        /^help\b/,
        /^commands?\b/,
        /^what can you do/,
        /^show me what/,
        /^list.*commands/,
        /bạn.*làm.*được.*gì/,
        /có.*lệnh.*gì/,
        /hướng.*dẫn/
    ];

    return helpPatterns.some((pattern) => pattern.test(lower));
}

module.exports = {
    PERMISSION_LEVELS,
    hasPermission,
    filterFunctionsByPermission,
    extractFunctionCall,
    buildExecutionContext,
    formatFunctionResult,
    isHelpRequest
};
