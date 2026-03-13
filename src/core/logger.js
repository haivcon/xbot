/**
 * Structured Logger — lightweight, zero-dependency logger
 * Supports: debug, info, warn, error levels
 * Output: text (default) or JSON (set LOG_FORMAT=json)
 *
 * Usage:
 *   const logger = require('./logger');
 *   const log = logger.child('ModuleName');
 *   log.info('Something happened');
 *   log.error('Oops', err);
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_LABELS = { debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR' };
const LEVEL_ICONS = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' };

const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
const isJson = (process.env.LOG_FORMAT || '').toLowerCase() === 'json';

function formatTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatMessage(level, module, msg, extra) {
    if (isJson) {
        const obj = {
            ts: new Date().toISOString(),
            level,
            module: module || undefined,
            msg
        };
        if (extra !== undefined) {
            if (extra instanceof Error) {
                obj.error = { message: extra.message, stack: extra.stack };
            } else if (typeof extra === 'object') {
                obj.data = extra;
            } else {
                obj.data = extra;
            }
        }
        return JSON.stringify(obj);
    }

    // Text format: [timestamp] [LEVEL] [module] message
    const ts = formatTimestamp();
    const prefix = module ? `[${module}]` : '';
    const icon = LEVEL_ICONS[level] || '';
    let line = `${ts} ${icon} ${LEVEL_LABELS[level]} ${prefix} ${msg}`;

    if (extra !== undefined) {
        if (extra instanceof Error) {
            line += ` — ${extra.message}`;
        } else if (typeof extra === 'object') {
            try { line += ` ${JSON.stringify(extra)}`; } catch { /* ignore circular */ }
        } else {
            line += ` ${extra}`;
        }
    }
    return line;
}

function createLogger(module) {
    const log = {};

    for (const [level, priority] of Object.entries(LOG_LEVELS)) {
        log[level] = (msg, extra) => {
            if (priority < currentLevel) return;
            const formatted = formatMessage(level, module, msg, extra);
            if (level === 'error') {
                console.error(formatted);
            } else if (level === 'warn') {
                console.warn(formatted);
            } else {
                console.log(formatted);
            }
        };
    }

    // Create a child logger with a sub-module name
    log.child = (subModule) => {
        const fullName = module ? `${module}:${subModule}` : subModule;
        return createLogger(fullName);
    };

    return log;
}

// Root logger (no module)
const rootLogger = createLogger(null);

// Request-scoped logger: creates a logger that includes requestId
rootLogger.withReqId = (reqId) => {
    const scoped = createLogger(null);
    const wrap = (origFn, level) => (msg, extra) => {
        origFn(`[${reqId}] ${msg}`, extra);
    };
    for (const level of Object.keys(LOG_LEVELS)) {
        scoped[level] = wrap(scoped[level], level);
    }
    return scoped;
};

// Factory: logger.child('Bot') -> scoped logger
module.exports = rootLogger;
module.exports.child = rootLogger.child;
module.exports.createLogger = createLogger;
