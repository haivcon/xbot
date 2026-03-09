/**
 * Lightweight structured logger for XBot.
 * No external dependencies. Supports log levels and module tags.
 * 
 * Usage:
 *   const { createLogger } = require('../utils/logger');
 *   const log = createLogger('ModuleName');
 *   log.debug('detail info');   // only shown when LOG_LEVEL=debug
 *   log.info('startup info');   // shown by default
 *   log.warn('warning');
 *   log.error('critical');
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

/**
 * Create a logger instance scoped to a module.
 * @param {string} module - Module name for log prefix
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 */
function createLogger(module) {
    const tag = `[${module}]`;

    return {
        debug(...args) {
            if (currentLevel <= LEVELS.debug) console.log(tag, ...args);
        },
        info(...args) {
            if (currentLevel <= LEVELS.info) console.log(tag, ...args);
        },
        warn(...args) {
            if (currentLevel <= LEVELS.warn) console.warn(tag, ...args);
        },
        error(...args) {
            if (currentLevel <= LEVELS.error) console.error(tag, ...args);
        }
    };
}

module.exports = { createLogger, LEVELS };
