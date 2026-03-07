/**
 * CommandRegistry - Unified Command System Core
 * Central registry for all bot commands with features:
 * - Command registration and lookup
 * - Alias support
 * - Fuzzy matching for suggestions
 * - Auto-generate help
 * - Rate limiting support
 * - Analytics tracking
 */

const { t } = require('./i18n');

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
        Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[b.length][a.length];
}

class CommandRegistry {
    constructor() {
        this.commands = new Map();      // name -> command config
        this.aliases = new Map();       // alias -> canonical name
        this.categories = new Map();    // category -> [commands]
        this.cooldowns = new Map();     // `${userId}:${cmd}` -> lastTime
        this.recentCommands = new Map(); // userId -> [recent commands]
        this.stats = new Map();         // command -> { calls, errors, totalTime }
        this.dailyUsage = new Map();    // userId -> { yyyy-mm-dd: Map<command, count> }
    }

    /**
     * Register a command
     * @param {Object} config Command configuration
     * @returns {CommandRegistry} this for chaining
     */
    register(config) {
        const {
            name,
            aliases = [],
            category = 'general',
            permissions = ['user'],
            cooldown = 0,
            usage = `/${name}`,
            descKey = `help_command_${name}`,
            handler,
            hidden = false,
            groupOnly = false,
            privateOnly = false
        } = config;

        if (!name || typeof name !== 'string') {
            throw new Error('Command name is required');
        }
        if (typeof handler !== 'function') {
            throw new Error(`Handler for command "${name}" must be a function`);
        }

        const normalizedName = name.toLowerCase();

        const command = {
            name: normalizedName,
            aliases: aliases.map(a => a.toLowerCase()),
            category,
            permissions,
            cooldown,
            usage,
            descKey,
            handler,
            hidden,
            groupOnly,
            privateOnly,
            registeredAt: Date.now()
        };

        // Register command
        this.commands.set(normalizedName, command);

        // Register aliases
        for (const alias of command.aliases) {
            this.aliases.set(alias, normalizedName);
        }

        // Add to category
        if (!this.categories.has(category)) {
            this.categories.set(category, new Set());
        }
        this.categories.get(category).add(normalizedName);

        // Initialize stats
        this.stats.set(normalizedName, { calls: 0, errors: 0, totalTime: 0 });

        return this;
    }

    /**
     * Get command by name or alias
     * @param {string} nameOrAlias 
     * @returns {Object|null}
     */
    get(nameOrAlias) {
        const normalized = (nameOrAlias || '').toLowerCase().replace(/^\//, '');

        // Direct lookup
        if (this.commands.has(normalized)) {
            return this.commands.get(normalized);
        }

        // Alias lookup
        if (this.aliases.has(normalized)) {
            const canonicalName = this.aliases.get(normalized);
            return this.commands.get(canonicalName);
        }

        return null;
    }

    /**
     * Check if command exists
     * @param {string} nameOrAlias 
     * @returns {boolean}
     */
    has(nameOrAlias) {
        return this.get(nameOrAlias) !== null;
    }

    /**
     * List all commands, optionally filtered by category
     * @param {string} category 
     * @returns {Object[]}
     */
    list(category = null) {
        if (category) {
            const names = this.categories.get(category) || new Set();
            return Array.from(names).map(name => this.commands.get(name)).filter(Boolean);
        }
        return Array.from(this.commands.values());
    }

    /**
     * Find similar commands (for "Did you mean...?" suggestions)
     * @param {string} input 
     * @param {number} maxDistance Max Levenshtein distance (default: 2)
     * @returns {Object[]} Array of {command, distance}
     */
    findSimilar(input, maxDistance = 2) {
        const normalized = (input || '').toLowerCase().replace(/^\//, '');
        const results = [];

        for (const [name, command] of this.commands) {
            if (command.hidden) continue;

            const distance = levenshteinDistance(normalized, name);
            if (distance <= maxDistance && distance > 0) {
                results.push({ command, distance });
            }

            // Also check aliases
            for (const alias of command.aliases) {
                const aliasDistance = levenshteinDistance(normalized, alias);
                if (aliasDistance <= maxDistance && aliasDistance > 0) {
                    results.push({ command, distance: aliasDistance });
                    break;
                }
            }
        }

        // Sort by distance (closest first) and remove duplicates
        const seen = new Set();
        return results
            .sort((a, b) => a.distance - b.distance)
            .filter(r => {
                if (seen.has(r.command.name)) return false;
                seen.add(r.command.name);
                return true;
            })
            .slice(0, 3); // Top 3 suggestions
    }

    /**
     * Check and apply cooldown
     * @param {string} userId 
     * @param {string} commandName 
     * @param {Object} options { bypass: boolean }
     * @returns {{ allowed: boolean, remainingMs: number }}
     */
    checkCooldown(userId, commandName, options = {}) {
        if (options.bypass) {
            return { allowed: true, remainingMs: 0 };
        }

        const command = this.get(commandName);
        if (!command || command.cooldown <= 0) {
            return { allowed: true, remainingMs: 0 };
        }

        const key = `${userId}:${command.name}`;
        const lastTime = this.cooldowns.get(key) || 0;
        const now = Date.now();
        const elapsed = now - lastTime;

        if (elapsed < command.cooldown) {
            return {
                allowed: false,
                remainingMs: command.cooldown - elapsed
            };
        }

        this.cooldowns.set(key, now);
        return { allowed: true, remainingMs: 0 };
    }

    /**
     * Track recent command for user
     * @param {string} userId 
     * @param {string} commandName 
     */
    trackRecent(userId, commandName) {
        if (!userId || !commandName) return;

        const normalized = commandName.toLowerCase();
        const todayKey = this._getDayKey();

        // Track daily usage counts
        let userUsage = this.dailyUsage.get(userId);
        if (!userUsage) {
            userUsage = new Map();
            this.dailyUsage.set(userId, userUsage);
        }
        let dayUsage = userUsage.get(todayKey);
        if (!dayUsage) {
            dayUsage = new Map();
            userUsage.set(todayKey, dayUsage);
        }
        dayUsage.set(normalized, (dayUsage.get(normalized) || 0) + 1);

        const recent = this.recentCommands.get(userId) || [];

        // Remove if already exists
        const filtered = recent.filter(c => c !== normalized);
        // Add to front
        filtered.unshift(normalized);
        // Keep only last 5
        this.recentCommands.set(userId, filtered.slice(0, 5));
    }

    /**
     * Get recent commands for user
     * @param {string} userId 
     * @returns {string[]}
     */
    getRecent(userId) {
        return this.recentCommands.get(userId) || [];
    }

    /**
     * Get today's usage counts for a user (per command)
     * @param {string} userId 
     * @param {Date|string} date optional date or yyyy-mm-dd
     * @returns {Map<string, number>}
     */
    getUserDailyUsage(userId, date = new Date()) {
        if (!userId) return new Map();
        const dayKey = typeof date === 'string' ? date : this._getDayKey(date);
        const userUsage = this.dailyUsage.get(userId);
        if (!userUsage) return new Map();
        return userUsage.get(dayKey) || new Map();
    }

    /**
     * Record command execution stats
     * @param {string} commandName 
     * @param {number} executionTimeMs 
     * @param {boolean} hasError 
     */
    recordStats(commandName, executionTimeMs, hasError = false) {
        const stats = this.stats.get(commandName);
        if (!stats) return;

        stats.calls++;
        stats.totalTime += executionTimeMs;
        if (hasError) stats.errors++;
    }

    /**
     * Get command statistics
     * @param {string} commandName 
     * @returns {Object}
     */
    getStats(commandName) {
        const stats = this.stats.get(commandName);
        if (!stats) return null;

        return {
            ...stats,
            avgTime: stats.calls > 0 ? Math.round(stats.totalTime / stats.calls) : 0,
            errorRate: stats.calls > 0 ? (stats.errors / stats.calls * 100).toFixed(1) : 0
        };
    }

    /**
     * Get all statistics
     * @returns {Object[]}
     */
    getAllStats() {
        return Array.from(this.stats.entries()).map(([name, stats]) => ({
            name,
            ...stats,
            avgTime: stats.calls > 0 ? Math.round(stats.totalTime / stats.calls) : 0,
            errorRate: stats.calls > 0 ? (stats.errors / stats.calls * 100).toFixed(1) : 0
        }));
    }

    /**
     * Generate help menu data for a category or all
     * @param {string} lang 
     * @param {string} category 
     * @returns {Object[]}
     */
    generateHelp(lang, category = null) {
        const commands = this.list(category);

        return commands
            .filter(cmd => !cmd.hidden)
            .map(cmd => ({
                name: cmd.name,
                usage: cmd.usage,
                description: t(lang, cmd.descKey) || cmd.usage,
                category: cmd.category,
                aliases: cmd.aliases
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get all categories
     * @returns {string[]}
     */
    getCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * Get command count
     * @returns {number}
     */
    get size() {
        return this.commands.size;
    }

    /**
     * Clear all cooldowns (for testing or reset)
     */
    clearCooldowns() {
        this.cooldowns.clear();
    }

    /**
     * Clear all stats (for testing or reset)
     */
    clearStats() {
        for (const stats of this.stats.values()) {
            stats.calls = 0;
            stats.errors = 0;
            stats.totalTime = 0;
        }
    }

    _getDayKey(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        const y = d.getFullYear();
        const m = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}

// Singleton instance
const commandRegistry = new CommandRegistry();

module.exports = {
    CommandRegistry,
    commandRegistry,
    levenshteinDistance
};
