/**
 * x402 Micropayment Service — Idea #2
 * Wraps x402 API for pay-per-use premium features
 *
 * Fixes: C3 (recipient validation), W6 (retry), W7 (init once)
 */
const logger = require('../core/logger');
const log = logger.child('x402');
const axios = require('axios');

const X402_BASE_URL = process.env.X402_API_URL || 'https://x402-xlayer.okx.com';
const DEFAULT_CHAIN = '196'; // X Layer
const DEFAULT_CURRENCY = 'USDT';
const MAX_RETRIES = 3;

let _dbInitialized = false;

/**
 * Initialize DB tables once
 */
async function _initDB() {
    if (_dbInitialized) return;
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`CREATE TABLE IF NOT EXISTS premium_usage (
            userId TEXT, featureId TEXT, usageDate TEXT, count INTEGER DEFAULT 0,
            PRIMARY KEY (userId, featureId, usageDate)
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS premium_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT, featureId TEXT, amount REAL, currency TEXT,
            txHash TEXT, chainIndex TEXT, status TEXT DEFAULT 'confirmed',
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        _dbInitialized = true;
    } catch (err) {
        log.error('x402 DB init error:', err.message);
    }
}

/**
 * Retry wrapper for API calls
 */
async function _withRetry(fn, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            const delay = Math.pow(2, i) * 1000; // Exponential backoff
            log.warn(`x402 API retry ${i + 1}/${retries} after ${delay}ms:`, err.message);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

/**
 * Get validated recipient address (C3 fix)
 */
function _getRecipientAddress(override) {
    const addr = override || process.env.X402_RECIPIENT_ADDRESS || '';
    if (!addr) {
        log.warn('X402_RECIPIENT_ADDRESS not configured. Payment features will be skipped.');
        return null;
    }
    // Basic address format validation
    if (!addr.startsWith('0x') || addr.length !== 42) {
        log.error(`Invalid X402_RECIPIENT_ADDRESS format: ${addr}`);
        return null;
    }
    return addr;
}

/**
 * Create a payment requirement for a premium feature
 */
async function createPaymentRequirement(featureId, amount, options = {}) {
    const recipient = _getRecipientAddress(options.recipient);
    if (!recipient) {
        return { error: 'Payment recipient not configured. Contact admin.' };
    }
    return {
        featureId,
        amount: String(amount),
        currency: options.currency || DEFAULT_CURRENCY,
        chainIndex: options.chainIndex || DEFAULT_CHAIN,
        recipient,
        expiresAt: Date.now() + (options.ttlMs || 300000), // 5min default
        memo: `XBot Premium: ${featureId}`
    };
}

/**
 * Verify a payment transaction (with retry — W6 fix)
 */
async function verifyPayment(txHash, paymentReq) {
    try {
        const response = await _withRetry(() =>
            axios.post(`${X402_BASE_URL}/verify`, {
                txHash,
                expectedAmount: paymentReq.amount,
                expectedRecipient: paymentReq.recipient,
                chainIndex: paymentReq.chainIndex,
                currency: paymentReq.currency
            }, { timeout: 15000 })
        );

        return { verified: response.data?.verified || false, data: response.data };
    } catch (err) {
        log.error('x402 verify error after retries:', err.message);
        return { verified: false, error: err.message };
    }
}

/**
 * Settle a payment (finalize, with retry — W6 fix)
 */
async function settlePayment(txHash, chainIndex) {
    try {
        const response = await _withRetry(() =>
            axios.post(`${X402_BASE_URL}/settle`, {
                txHash,
                chainIndex: chainIndex || DEFAULT_CHAIN
            }, { timeout: 15000 })
        );
        return { settled: true, data: response.data };
    } catch (err) {
        log.error('x402 settle error after retries:', err.message);
        return { settled: false, error: err.message };
    }
}

/**
 * Get supported payment networks
 */
async function getSupportedNetworks() {
    try {
        const response = await axios.get(`${X402_BASE_URL}/networks`, { timeout: 10000 });
        return response.data || [];
    } catch (err) {
        return [
            { chainIndex: '196', name: 'X Layer', currency: 'USDT', gasSubsidy: true },
            { chainIndex: '1', name: 'Ethereum', currency: 'USDT', gasSubsidy: false }
        ];
    }
}

// ═══════════════════════════════════════════════════════
// Premium Feature Pricing
// ═══════════════════════════════════════════════════════

const PREMIUM_FEATURES = {
    'deep_research': { price: 0.1, description: 'Deep AI Research Report', freePerDay: 3 },
    'auto_trading': { price: 1.0, description: 'AI Auto Trading Agent (daily)', freePerDay: 0 },
    'arbitrage_scan': { price: 0.05, description: 'Cross-Chain Arbitrage Scan', freePerDay: 5 },
    'copy_trading': { price: 0.5, description: 'Copy Trading Subscription (daily)', freePerDay: 0 },
    'voice_trading': { price: 0.02, description: 'Voice Trading Command', freePerDay: 10 },
    'marketplace_plugin': { price: 0, description: 'Marketplace Plugin', freePerDay: 999 }
};

/**
 * Check if user needs to pay for a feature or has free uses remaining
 * W7 fix: DB initialized once instead of every call
 */
async function checkFeatureAccess(userId, featureId) {
    const feature = PREMIUM_FEATURES[featureId];
    if (!feature) return { allowed: true, reason: 'free' };
    if (feature.freePerDay >= 999) return { allowed: true, reason: 'free' };

    try {
        await _initDB();
        const { dbGet, dbRun } = require('../../db/core');

        const today = new Date().toISOString().slice(0, 10);
        const usage = await dbGet('SELECT count FROM premium_usage WHERE userId = ? AND featureId = ? AND usageDate = ?', [userId, featureId, today]);
        const usedCount = usage?.count || 0;

        if (usedCount < feature.freePerDay) {
            // Free use remaining
            await dbRun(`INSERT OR REPLACE INTO premium_usage (userId, featureId, usageDate, count) VALUES (?, ?, ?, ?)`,
                [userId, featureId, today, usedCount + 1]);
            return { allowed: true, reason: 'free', remaining: feature.freePerDay - usedCount - 1 };
        }

        // Needs payment
        return { allowed: false, reason: 'payment_required', price: feature.price, currency: DEFAULT_CURRENCY, description: feature.description };
    } catch (err) {
        log.warn('Feature access check error, allowing:', err.message);
        return { allowed: true, reason: 'error_fallback' };
    }
}

/**
 * Record a premium payment
 */
async function recordPayment(userId, featureId, amount, txHash) {
    try {
        await _initDB();
        const { dbRun } = require('../../db/core');
        await dbRun('INSERT INTO premium_payments (userId, featureId, amount, currency, txHash, chainIndex) VALUES (?,?,?,?,?,?)',
            [userId, featureId, amount, DEFAULT_CURRENCY, txHash, DEFAULT_CHAIN]);
    } catch (err) {
        log.error('Record payment error:', err.message);
    }
}

module.exports = {
    createPaymentRequirement, verifyPayment, settlePayment,
    getSupportedNetworks, checkFeatureAccess, recordPayment,
    PREMIUM_FEATURES
};
