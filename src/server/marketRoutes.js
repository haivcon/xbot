/**
 * Market & Onchain REST Routes for Web Dashboard
 * Provides direct API access to market data, wallet management, and swap functionality.
 * File: src/server/marketRoutes.js
 */

const { Router } = require('express');
const logger = require('../core/logger');
const log = logger.child('MarketAPI');
const onchainos = require('../services/onchainos');

function createMarketRoutes() {
    const router = Router();

    // ════════════════════════════════════════
    // Market Data Endpoints
    // ════════════════════════════════════════

    /**
     * POST /token/price
     * Body: { tokens: [{ chainIndex, tokenContractAddress }] }
     */
    router.post('/token/price', async (req, res) => {
        try {
            const { tokens } = req.body;
            if (!tokens?.length) return res.status(400).json({ error: 'tokens array required' });
            const data = await onchainos.getMarketPrice(tokens);
            res.json({ data });
        } catch (err) {
            log.error('token/price error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /token/search?chains=196&keyword=BANMAO
     */
    router.get('/token/search', async (req, res) => {
        try {
            const { chains = '196', keyword } = req.query;
            if (!keyword) return res.status(400).json({ error: 'keyword required' });
            const data = await onchainos.getTokenSearch(chains, keyword);
            res.json({ data: data || [] });
        } catch (err) {
            log.error('token/search error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /token/top?chains=196&sortBy=2&timeFrame=4
     */
    router.get('/token/top', async (req, res) => {
        try {
            const { chains = '196', sortBy = '2', timeFrame = '4' } = req.query;
            const data = await onchainos.getTokenTopList(chains, sortBy, timeFrame);
            res.json({ data: data || [] });
        } catch (err) {
            log.error('token/top error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * POST /token/info
     * Body: { tokens: [{ chainIndex, tokenContractAddress }] }
     */
    router.post('/token/info', async (req, res) => {
        try {
            const { tokens } = req.body;
            if (!tokens?.length) return res.status(400).json({ error: 'tokens array required' });
            const [priceInfo, basicInfo] = await Promise.all([
                onchainos.getTokenPriceInfo(tokens).catch(() => null),
                onchainos.getTokenBasicInfo(tokens).catch(() => null)
            ]);
            res.json({ priceInfo: priceInfo || [], basicInfo: basicInfo || [] });
        } catch (err) {
            log.error('token/info error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /token/holders?chainIndex=196&tokenContractAddress=0x...
     */
    router.get('/token/holders', async (req, res) => {
        try {
            const { chainIndex = '196', tokenContractAddress } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            // Fetch holder list + basicInfo (for totalHolder) in parallel
            const [holderData, basicInfo] = await Promise.all([
                onchainos.getTokenHolder(chainIndex, tokenContractAddress).catch(() => []),
                onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress }]).catch(() => null)
            ]);
            const totalHolder = basicInfo?.[0]?.totalHolder || basicInfo?.[0]?.holderCount || null;
            res.json({ data: holderData || [], totalHolder: totalHolder ? Number(totalHolder) : null });
        } catch (err) {
            log.error('token/holders error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /gas?chainIndex=196
     */
    router.get('/gas', async (req, res) => {
        try {
            const { chainIndex = '196' } = req.query;
            const data = await onchainos.getGasPrice(chainIndex);
            res.json({ data });
        } catch (err) {
            log.error('gas error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /candles?chainIndex=196&tokenContractAddress=0x...&bar=1H&limit=24
     */
    router.get('/candles', async (req, res) => {
        try {
            const { chainIndex = '196', tokenContractAddress, bar = '1H', limit = '24' } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            const data = await onchainos.getMarketCandles(chainIndex, tokenContractAddress, { bar, limit: parseInt(limit) });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('candles error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * POST /signals
     * Body: { chainIndex, walletType?, minAmountUsd? }
     */
    router.post('/signals', async (req, res) => {
        try {
            const { chainIndex = '196', walletType, minAmountUsd } = req.body;
            const data = await onchainos.getSignalList(chainIndex, { walletType, minAmountUsd });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('signals error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /signals/chains
     */
    router.get('/signals/chains', async (req, res) => {
        try {
            const data = await onchainos.getSignalChains();
            res.json({ data: data || [] });
        } catch (err) {
            log.error('signals/chains error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Wallet Endpoints
    // ════════════════════════════════════════

    /**
     * GET /wallets
     * List user's trading wallets
     */
    router.get('/wallets', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbAll } = require('../../db/core');
            const wallets = await dbAll(
                'SELECT id, walletName, address, chainIndex, isDefault, tags, createdAt FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC',
                [userId]
            );
            res.json({ wallets: wallets || [] });
        } catch (err) {
            log.error('wallets error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/create
     * Create a new trading wallet
     */
    router.post('/wallets/create', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const ethers = require('ethers');
            const crypto = require('crypto');
            const { _getEncryptKey } = require('../features/ai/onchain/helpers');
            const { dbGet, dbRun } = require('../../db/core');

            const ENCRYPT_KEY = _getEncryptKey();
            const newWallet = ethers.Wallet.createRandom();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
            let encrypted = cipher.update(newWallet.privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const encryptedKey = iv.toString('hex') + ':' + encrypted;

            const existing = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? LIMIT 1', [userId]);
            const isDefault = existing ? 0 : 1;
            const countRow = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]);
            const walletName = req.body.name || `Wallet ${(countRow?.cnt || 0) + 1}`;

            await dbRun(
                'INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, walletName, newWallet.address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]
            );

            res.json({
                success: true,
                wallet: {
                    address: newWallet.address,
                    name: walletName,
                    isDefault: !!isDefault
                },
                // Private key returned only once — frontend must display it securely
                privateKey: newWallet.privateKey
            });
        } catch (err) {
            log.error('wallets/create error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /wallets/:id/balance
     * Get wallet balance via OKX
     */
    router.get('/wallets/:id/balance', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet } = require('../../db/core');
            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });

            const chainIdx = tw.chainIndex || '196';
            const [totalValue, balances] = await Promise.all([
                onchainos.getWalletTotalValue(tw.address, chainIdx).catch(() => null),
                onchainos.getWalletBalances(tw.address, chainIdx).catch(() => null)
            ]);

            // Enhance with real-time prices
            let tokenList = [];
            if (balances && Array.isArray(balances) && balances.length > 0) {
                tokenList = balances[0]?.tokenAssets || balances;
                try {
                    const tokenReqs = tokenList.map(b => ({
                        chainIndex: b.chainIndex || chainIdx,
                        tokenContractAddress: b.tokenContractAddress || b.tokenAddress
                    }));
                    const priceInfos = await onchainos.getTokenPriceInfo(tokenReqs).catch(() => []);
                    if (Array.isArray(priceInfos) && priceInfos.length > 0) {
                        for (const b of tokenList) {
                            const addr = b.tokenContractAddress || b.tokenAddress;
                            const rtPrice = priceInfos.find(p => p.tokenContractAddress?.toLowerCase() === addr?.toLowerCase());
                            if (rtPrice && Number(rtPrice.price) > 0) {
                                b.tokenPrice = String(rtPrice.price);
                            }
                        }
                    }
                } catch { /* ignore */ }
            }

            res.json({
                wallet: { id: tw.id, address: tw.address, name: tw.walletName, isDefault: !!tw.isDefault },
                totalValue: totalValue?.[0]?.totalValue || '0',
                tokens: tokenList.map(b => ({
                    symbol: b.tokenSymbol || b.symbol || '?',
                    address: b.tokenContractAddress || b.tokenAddress || '',
                    balance: b.holdingAmount || b.balance || '0',
                    price: b.tokenPrice || b.price || '0',
                    chainIndex: b.chainIndex || chainIdx,
                    isRisk: !!b.isRiskToken
                }))
            });
        } catch (err) {
            log.error('wallets/balance error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * DELETE /wallets/:id
     */
    router.delete('/wallets/:id', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const tw = await dbGet('SELECT id FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });
            await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            res.json({ ok: true });
        } catch (err) {
            log.error('wallets/delete error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/:id/set-default
     */
    router.post('/wallets/:id/set-default', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const tw = await dbGet('SELECT id FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });
            await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE userId = ?', [userId]);
            await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ? AND userId = ?', [req.params.id, userId]);
            res.json({ ok: true });
        } catch (err) {
            log.error('wallets/set-default error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    // Swap Endpoints
    // ════════════════════════════════════════

    /**
     * POST /swap/quote
     * Body: { chainIndex, fromTokenAddress, toTokenAddress, amount }
     */
    router.post('/swap/quote', async (req, res) => {
        try {
            const { chainIndex = '196', fromTokenAddress, toTokenAddress, amount } = req.body;
            if (!fromTokenAddress || !toTokenAddress || !amount) {
                return res.status(400).json({ error: 'fromTokenAddress, toTokenAddress, amount required' });
            }

            // Auto-resolve token decimals
            let resolvedAmount = amount;
            try {
                const ethers = require('ethers');
                const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                if (basicInfo?.length > 0) {
                    const decimals = Number(basicInfo[0].decimal || 18);
                    if (!String(amount).includes('e+') && !String(amount).includes('00000000')) {
                        resolvedAmount = ethers.parseUnits(String(amount), decimals).toString();
                    }
                }
            } catch { /* use original amount */ }

            const data = await onchainos.getSwapQuote({
                chainIndex,
                fromTokenAddress: fromTokenAddress.toLowerCase(),
                toTokenAddress: toTokenAddress.toLowerCase(),
                amount: resolvedAmount
            });

            res.json({ data });
        } catch (err) {
            log.error('swap/quote error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message, code: err.code });
        }
    });

    /**
     * GET /tx-history?page=1&limit=20
     * Transaction history for the authenticated user
     */
    router.get('/tx-history', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbAll } = require('../../db/core');
            const limit = Math.min(parseInt(req.query.limit) || 20, 100);
            const offset = ((parseInt(req.query.page) || 1) - 1) * limit;
            const txs = await dbAll(
                'SELECT * FROM wallet_tx_history WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?',
                [userId, limit, offset]
            );
            res.json({ transactions: txs || [] });
        } catch (err) {
            log.error('tx-history error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createMarketRoutes };
