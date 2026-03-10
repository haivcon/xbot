/**
 * OKX CEX REST Routes for Web Dashboard
 * Provides market data, trading, account, and bot management via OKX API.
 * File: src/server/okxRoutes.js
 */

const { Router } = require('express');
const logger = require('../core/logger');
const log = logger.child('OKXRoutes');
const okx = require('../services/okxCex');

function createOkxRoutes() {
    const router = Router();

    // ════════════════════════════════════════
    // API Key Management
    // ════════════════════════════════════════

    /**
     * GET /keys/status — Check if user has OKX keys configured
     */
    router.get('/keys/status', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const status = await okx.hasUserOkxKeys(userId);
            res.json(status);
        } catch (err) {
            log.error('keys/status error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /keys — Save/update OKX API keys
     * Body: { apiKey, secretKey, passphrase, demo?, site? }
     */
    router.post('/keys', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { apiKey, secretKey, passphrase, demo = true, site = 'global' } = req.body;
            if (!apiKey || !secretKey || !passphrase) {
                return res.status(400).json({ error: 'apiKey, secretKey, passphrase required' });
            }

            // Verify keys work by fetching account balance
            try {
                const creds = { apiKey, secretKey, passphrase, demo, site };
                await okx.getAccountBalance(creds);
            } catch (err) {
                return res.status(400).json({
                    error: 'Key verification failed',
                    detail: err.msg || err.message
                });
            }

            await okx.saveUserOkxKeys(userId, { apiKey, secretKey, passphrase, demo, site });
            res.json({ ok: true, demo, site });
        } catch (err) {
            log.error('keys/save error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * DELETE /keys — Remove OKX API keys
     */
    router.delete('/keys', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            await okx.deleteUserOkxKeys(userId);
            res.json({ ok: true });
        } catch (err) {
            log.error('keys/delete error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    // Middleware: resolve user credentials for private endpoints
    // ════════════════════════════════════════
    async function requireOkxKeys(req, res, next) {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const creds = await okx.getUserOkxCredentials(userId);
            if (!creds) return res.status(403).json({ error: 'OKX API keys not configured', setup: true });
            req.okxCreds = creds;
            next();
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // ════════════════════════════════════════
    // Market Data (Public — no auth required)
    // ════════════════════════════════════════

    /**
     * GET /market/ticker?instId=BTC-USDT
     */
    router.get('/market/ticker', async (req, res) => {
        try {
            const { instId } = req.query;
            if (!instId) return res.status(400).json({ error: 'instId required' });
            const data = await okx.getTicker(instId);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /market/tickers?instType=SPOT
     */
    router.get('/market/tickers', async (req, res) => {
        try {
            const { instType = 'SPOT' } = req.query;
            const data = await okx.getTickers(instType);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /market/orderbook?instId=BTC-USDT&sz=20
     */
    router.get('/market/orderbook', async (req, res) => {
        try {
            const { instId, sz = '20' } = req.query;
            if (!instId) return res.status(400).json({ error: 'instId required' });
            const data = await okx.getOrderBook(instId, sz);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /market/candles?instId=BTC-USDT&bar=1H&limit=100
     */
    router.get('/market/candles', async (req, res) => {
        try {
            const { instId, bar = '1H', limit = '100' } = req.query;
            if (!instId) return res.status(400).json({ error: 'instId required' });
            const data = await okx.getCandles(instId, bar, limit);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /market/funding-rate?instId=BTC-USDT-SWAP
     */
    router.get('/market/funding-rate', async (req, res) => {
        try {
            const { instId } = req.query;
            if (!instId) return res.status(400).json({ error: 'instId required' });
            const data = await okx.getFundingRate(instId);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /market/instruments?instType=SPOT
     */
    router.get('/market/instruments', async (req, res) => {
        try {
            const { instType = 'SPOT', instId } = req.query;
            const data = await okx.getInstruments(instType, instId);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Account (Private — requires OKX keys)
    // ════════════════════════════════════════

    /**
     * GET /account/balance?ccy=USDT
     */
    router.get('/account/balance', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getAccountBalance(req.okxCreds, req.query.ccy);
            res.json({ data, demo: req.okxCreds.demo });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /account/asset-balance
     */
    router.get('/account/asset-balance', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getAssetBalance(req.okxCreds, req.query.ccy);
            res.json({ data, demo: req.okxCreds.demo });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /account/positions?instType=SWAP
     */
    router.get('/account/positions', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getPositions(req.okxCreds, req.query.instType);
            res.json({ data, demo: req.okxCreds.demo });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Spot Trading (Private)
    // ════════════════════════════════════════

    /**
     * POST /spot/order
     * Body: { instId, side, ordType, sz, px?, tgtCcy? }
     */
    router.post('/spot/order', requireOkxKeys, async (req, res) => {
        try {
            const { instId, side, ordType, sz, px, tgtCcy } = req.body;
            if (!instId || !side || !ordType || !sz) {
                return res.status(400).json({ error: 'instId, side, ordType, sz required' });
            }
            const data = await okx.placeOrder(req.okxCreds, { instId, side, ordType, sz, px, tgtCcy });
            res.json({ data, demo: req.okxCreds.demo });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message, code: err.code });
        }
    });

    /**
     * DELETE /spot/order
     * Body: { instId, ordId }
     */
    router.delete('/spot/order', requireOkxKeys, async (req, res) => {
        try {
            const { instId, ordId } = req.body;
            if (!instId || !ordId) return res.status(400).json({ error: 'instId, ordId required' });
            const data = await okx.cancelOrder(req.okxCreds, instId, ordId);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /spot/orders-open?instType=SPOT&instId=BTC-USDT
     */
    router.get('/spot/orders-open', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getOpenOrders(req.okxCreds, req.query.instType, req.query.instId);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /spot/orders-history?instType=SPOT&limit=50
     */
    router.get('/spot/orders-history', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getOrderHistory(req.okxCreds, req.query.instType, req.query.limit);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Grid Bot (Private)
    // ════════════════════════════════════════

    /**
     * POST /bot/grid
     * Body: { instId, maxPx, minPx, gridNum, quoteSz, algoOrdType? }
     */
    router.post('/bot/grid', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.createGridOrder(req.okxCreds, req.body);
            res.json({ data, demo: req.okxCreds.demo });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message, code: err.code });
        }
    });

    /**
     * DELETE /bot/grid
     * Body: { algoId, instId }
     */
    router.delete('/bot/grid', requireOkxKeys, async (req, res) => {
        try {
            const { algoId, instId, algoOrdType } = req.body;
            const data = await okx.stopGridOrder(req.okxCreds, algoId, instId, algoOrdType);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /bot/grid/active
     */
    router.get('/bot/grid/active', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getGridOrders(req.okxCreds, req.query.algoOrdType);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /bot/grid/history
     */
    router.get('/bot/grid/history', requireOkxKeys, async (req, res) => {
        try {
            const data = await okx.getGridOrderHistory(req.okxCreds, req.query.algoOrdType);
            res.json({ data });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    return router;
}

module.exports = { createOkxRoutes };
