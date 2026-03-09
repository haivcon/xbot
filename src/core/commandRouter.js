/**
 * Command Router - Central command execution middleware
 * Handles: parsing, permission checks, rate limiting, execution, suggestions
 */

const { commandRegistry } = require('./commandRegistry');
const logger = require('./logger');
const log = logger.child('CommandRouter');
const { t } = require('./i18n');

// Rate limiting state
const globalRateLimits = new Map(); // userId -> { count, resetTime }
const GLOBAL_RATE_LIMIT = 30; // commands per minute
const GLOBAL_RATE_WINDOW = 60000; // 1 minute

/**
 * Create command router middleware
 * @param {Object} deps Dependencies
 * @returns {Object} Router handlers
 */
function createCommandRouter(deps = {}) {
    const {
        bot,
        getLang,
        sendReply,
        isOwner,
        isCoOwner,
        isGroupAdmin
    } = deps;

    /**
     * Check global rate limit for user
     * @param {string} userId 
     * @param {boolean} bypass 
     * @returns {{ allowed: boolean, remainingMs: number }}
     */
    function checkGlobalRateLimit(userId, bypass = false) {
        if (bypass) return { allowed: true, remainingMs: 0 };

        const now = Date.now();
        const state = globalRateLimits.get(userId) || { count: 0, resetTime: now + GLOBAL_RATE_WINDOW };

        // Reset if window expired
        if (now > state.resetTime) {
            state.count = 0;
            state.resetTime = now + GLOBAL_RATE_WINDOW;
        }

        if (state.count >= GLOBAL_RATE_LIMIT) {
            return {
                allowed: false,
                remainingMs: state.resetTime - now
            };
        }

        state.count++;
        globalRateLimits.set(userId, state);
        return { allowed: true, remainingMs: 0 };
    }

    /**
     * Check if user has required permissions
     * @param {Object} msg 
     * @param {string[]} requiredPermissions 
     * @returns {Promise<boolean>}
     */
    async function checkPermissions(msg, requiredPermissions = ['user']) {
        const userId = msg.from?.id?.toString();
        const username = msg.from?.username || '';
        const chatType = msg.chat?.type;

        // Everyone has 'user' permission
        if (requiredPermissions.includes('user')) {
            return true;
        }

        // Check owner permission
        if (requiredPermissions.includes('owner')) {
            if (isOwner && isOwner(userId, username)) {
                return true;
            }
            if (isCoOwner && await isCoOwner(userId)) {
                return true;
            }
            return false;
        }

        // Check admin permission
        if (requiredPermissions.includes('admin')) {
            if (isOwner && isOwner(userId, username)) {
                return true;
            }
            if (chatType === 'private') {
                return true; // Admin in private = user
            }
            if (isGroupAdmin && await isGroupAdmin(msg.chat?.id, userId)) {
                return true;
            }
            return false;
        }

        return true;
    }

    /**
     * Format remaining cooldown time
     * @param {number} ms 
     * @returns {string}
     */
    function formatCooldown(ms) {
        const seconds = Math.ceil(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    }

    /**
     * Build suggestion message for unknown command
     * @param {string} input 
     * @param {string} lang 
     * @returns {string|null}
     */
    function buildSuggestionMessage(input, lang) {
        const suggestions = commandRegistry.findSimilar(input);

        if (suggestions.length === 0) {
            return null;
        }

        const suggestionList = suggestions
            .map(s => `/${s.command.name}`)
            .join(', ');

        return t(lang, 'command_unknown_suggestion', {
            input: `/${input}`,
            suggestions: suggestionList
        }) || `❓ Lệnh không tồn tại. Bạn có ý là: ${suggestionList}?`;
    }

    /**
     * Route and execute a command from message
     * @param {Object} msg Telegram message
     * @returns {Promise<{ handled: boolean, error?: string }>}
     */
    async function routeCommand(msg) {
        const text = (msg.text || msg.caption || '').trim();

        // Check if it's a command
        if (!text.startsWith('/')) {
            return { handled: false };
        }

        // Parse command and args
        const match = text.match(/^\/(\w+)(?:@[\w_]+)?(?:\s+(.*))?$/is);
        if (!match) {
            return { handled: false };
        }

        const commandName = match[1].toLowerCase();
        const argsText = match[2] || '';
        const args = argsText.split(/\s+/).filter(Boolean);

        // Get language
        const lang = getLang ? await getLang(msg) : 'vi';
        const userId = msg.from?.id?.toString();
        const chatType = msg.chat?.type;

        // Lookup command
        const command = commandRegistry.get(commandName);

        // Command not found - try suggestions
        if (!command) {
            const suggestion = buildSuggestionMessage(commandName, lang);
            if (suggestion && sendReply) {
                await sendReply(msg, suggestion);
            }
            return { handled: false, error: 'not_found' };
        }

        // Check group/private restrictions
        if (command.groupOnly && chatType === 'private') {
            const errorMsg = t(lang, 'command_group_only') || '⚠️ Lệnh này chỉ dùng được trong nhóm.';
            if (sendReply) await sendReply(msg, errorMsg);
            return { handled: true, error: 'group_only' };
        }

        if (command.privateOnly && chatType !== 'private') {
            const errorMsg = t(lang, 'command_private_only') || '⚠️ Lệnh này chỉ dùng được trong chat riêng.';
            if (sendReply) await sendReply(msg, errorMsg);
            return { handled: true, error: 'private_only' };
        }

        // Check permissions
        const hasPermission = await checkPermissions(msg, command.permissions);
        if (!hasPermission) {
            const errorMsg = t(lang, 'command_no_permission') || '🔒 Bạn không có quyền sử dụng lệnh này.';
            if (sendReply) await sendReply(msg, errorMsg);
            return { handled: true, error: 'no_permission' };
        }

        // Check VIP bypass for rate limits
        const username = msg.from?.username || '';
        const isVip = (isOwner && isOwner(userId, username)) ||
            (isCoOwner && await isCoOwner(userId));

        // Check global rate limit
        const globalLimit = checkGlobalRateLimit(userId, isVip);
        if (!globalLimit.allowed) {
            const errorMsg = t(lang, 'command_rate_limited', {
                time: formatCooldown(globalLimit.remainingMs)
            }) || `⏳ Bạn đang gửi lệnh quá nhanh. Vui lòng đợi ${formatCooldown(globalLimit.remainingMs)}.`;
            if (sendReply) await sendReply(msg, errorMsg);
            return { handled: true, error: 'rate_limited' };
        }

        // Check command-specific cooldown
        const cooldownCheck = commandRegistry.checkCooldown(userId, command.name, { bypass: isVip });
        if (!cooldownCheck.allowed) {
            const errorMsg = t(lang, 'command_cooldown', {
                time: formatCooldown(cooldownCheck.remainingMs)
            }) || `⏳ Vui lòng đợi ${formatCooldown(cooldownCheck.remainingMs)} trước khi dùng lại lệnh này.`;
            if (sendReply) await sendReply(msg, errorMsg);
            return { handled: true, error: 'cooldown' };
        }

        // Track recent command
        if (!msg._recentTracked) {
            commandRegistry.trackRecent(userId, command.name);
            msg._recentTracked = true;
        }

        // Execute command
        const startTime = Date.now();
        let hasError = false;

        try {
            await command.handler(msg, { args, argsText, lang, command });
        } catch (error) {
            hasError = true;
            log.error(`Error executing /${command.name}:`, error.message);

            const errorMsg = t(lang, 'command_execution_error') || '❌ Đã xảy ra lỗi khi thực thi lệnh.';
            if (sendReply) {
                try {
                    await sendReply(msg, errorMsg);
                } catch (e) {
                    // Ignore reply errors
                }
            }
        }

        // Record stats
        const executionTime = Date.now() - startTime;
        commandRegistry.recordStats(command.name, executionTime, hasError);

        return {
            handled: true,
            command: command.name,
            executionTime,
            error: hasError ? 'execution_error' : undefined
        };
    }

    /**
     * Get handler for direct use with bot.on('message')
     * @returns {Function}
     */
    function getMessageHandler() {
        return async (msg) => {
            const text = (msg.text || msg.caption || '').trim();
            if (text.startsWith('/')) {
                await routeCommand(msg);
            }
        };
    }

    return {
        routeCommand,
        checkPermissions,
        checkGlobalRateLimit,
        buildSuggestionMessage,
        getMessageHandler
    };
}

module.exports = {
    createCommandRouter,
    GLOBAL_RATE_LIMIT,
    GLOBAL_RATE_WINDOW
};
