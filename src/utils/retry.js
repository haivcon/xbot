const logger = require('../core/logger');
const log = logger.child('Retry');

/**
 * Retry utility for Telegram API calls that may fail due to transient network issues.
 * Implements exponential backoff with jitter.
 */

/**
 * Retry a function call with exponential backoff.
 * Only retries on EFATAL/AggregateError (transient network issues).
 * @param {Function} fn - Async function to call
 * @param {object} [opts] - Options
 * @param {number} [opts.maxRetries=3] - Maximum retry attempts
 * @param {number} [opts.baseDelay=1000] - Base delay in ms (doubles each retry)
 * @param {string} [opts.label=''] - Label for logging
 * @returns {Promise<*>} Result of the function call
 */
async function retryTelegramCall(fn, { maxRetries = 3, baseDelay = 1000, label = '' } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const msg = String(err?.message || err || '');
            const isTransient = msg.includes('EFATAL') ||
                msg.includes('AggregateError') ||
                msg.includes('ETIMEDOUT') ||
                msg.includes('ECONNRESET') ||
                msg.includes('ECONNREFUSED') ||
                msg.includes('ENOTFOUND') ||
                msg.includes('socket hang up');

            if (!isTransient || attempt >= maxRetries) {
                throw err;
            }

            // Exponential backoff with jitter
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
            if (label) {
                log.warn(`${label} attempt ${attempt + 1}/${maxRetries} failed (${msg.substring(0, 80)}), retrying in ${Math.round(delay)}ms`);
            }
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

module.exports = { retryTelegramCall };
