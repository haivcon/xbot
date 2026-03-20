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
     * GET /trades?chainIndex=196&tokenContractAddress=0x...
     */
    router.get('/trades', async (req, res) => {
        try {
            const { chainIndex = '196', tokenContractAddress } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            const data = await onchainos.getMarketTrades(chainIndex, tokenContractAddress, {});
            res.json({ data: data || [] });
        } catch (err) {
            log.error('trades error:', err.msg || err.message);
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
     * List user's trading wallets + metadata
     */
    router.get('/wallets', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbAll, dbGet } = require('../../db/core');
            let wallets;
            try {
                wallets = await dbAll(
                    'SELECT id, walletName, address, chainIndex, isDefault, tags, lastExportedAt, createdAt FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC',
                    [userId]
                );
            } catch {
                // lastExportedAt column may not exist yet
                wallets = await dbAll(
                    'SELECT id, walletName, address, chainIndex, isDefault, tags, createdAt FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC',
                    [userId]
                );
            }
            let user = null;
            try { user = await dbGet('SELECT pinCode, walletLimit FROM users WHERE chatId = ?', [userId]); } catch { /* columns may not exist */ }
            res.json({
                wallets: wallets || [],
                walletCount: (wallets || []).length,
                walletLimit: user?.walletLimit || 50,
                hasPinCode: !!(user?.pinCode),
            });
        } catch (err) {
            log.error('wallets error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/create
     * Create a new trading wallet (syncs with bot watch wallets)
     */
    router.post('/wallets/create', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const ethers = require('ethers');
            const crypto = require('crypto');
            const { _getEncryptKey } = require('../features/ai/onchain/helpers');
            const { dbGet, dbRun } = require('../../db/core');
            const { addWalletToUser } = require('../../db/wallets');

            // Check wallet limit
            let userLimit = null;
            try { userLimit = await dbGet('SELECT walletLimit FROM users WHERE chatId = ?', [userId]); } catch {}
            const countCheck = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]);
            const limit = userLimit?.walletLimit || 50;
            if ((countCheck?.cnt || 0) >= limit) {
                return res.status(403).json({ error: `Wallet limit reached (${limit}). Contact bot owner to increase.`, walletLimit: limit });
            }

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

            // Sync: register as watch wallet on bot side
            try { await addWalletToUser(userId, 'en', newWallet.address, { name: walletName }); } catch (e) { log.warn('Watch wallet sync failed:', e.message); }

            res.json({
                success: true,
                wallet: { address: newWallet.address, name: walletName, isDefault: !!isDefault },
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
            const { dbGet, dbRun } = require('../../db/core');
            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });

            const chainIdx = req.query.chainIndex || tw.chainIndex || '196';
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
                    // Fetch real-time prices AND basic info (for logos) in parallel
                    const [priceInfos, basicInfos] = await Promise.all([
                        onchainos.getTokenPriceInfo(tokenReqs).catch(() => []),
                        onchainos.getTokenBasicInfo(tokenReqs).catch(() => [])
                    ]);
                    for (const b of tokenList) {
                        const addr = (b.tokenContractAddress || b.tokenAddress || '').toLowerCase();
                        // Merge price
                        const rtPrice = Array.isArray(priceInfos) && priceInfos.find(p => p.tokenContractAddress?.toLowerCase() === addr);
                        if (rtPrice && Number(rtPrice.price) > 0) {
                            b.tokenPrice = String(rtPrice.price);
                        }
                        // Merge logo from basicInfo
                        const basic = Array.isArray(basicInfos) && basicInfos.find(p => p.tokenContractAddress?.toLowerCase() === addr);
                        if (basic?.tokenLogoUrl || basic?.logoUrl) {
                            b.tokenLogoUrl = basic.tokenLogoUrl || basic.logoUrl;
                        }
                    }
                } catch { /* ignore */ }
            }

            const tvUsd = parseFloat(totalValue?.[0]?.totalValue || '0');

            // Save portfolio snapshot (throttle: max 1/hour)
            try {
                const nowSec = Math.floor(Date.now() / 1000);
                const lastSnap = await dbGet('SELECT snapshotAt FROM wallet_portfolio_snapshots WHERE userId = ? ORDER BY snapshotAt DESC LIMIT 1', [userId]);
                if (!lastSnap || nowSec - (lastSnap.snapshotAt || 0) > 3600) {
                    await dbRun('INSERT INTO wallet_portfolio_snapshots (userId, totalUsd, snapshotAt) VALUES (?, ?, ?)', [userId, tvUsd, nowSec]);
                }
            } catch { /* ignore snapshot errors */ }

            res.json({
                wallet: { id: tw.id, address: tw.address, name: tw.walletName, isDefault: !!tw.isDefault },
                totalValue: String(tvUsd),
                tokens: tokenList.map(b => ({
                    symbol: b.tokenSymbol || b.symbol || '?',
                    address: b.tokenContractAddress || b.tokenAddress || '',
                    balance: b.holdingAmount || b.balance || '0',
                    price: b.tokenPrice || b.price || '0',
                    logoUrl: b.tokenLogoUrl || b.logoUrl || b.logo || '',
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
     * DELETE /wallets/:id (syncs with bot watch wallets)
     */
    router.delete('/wallets/:id', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const { removeWalletFromUser } = require('../../db/wallets');
            const tw = await dbGet('SELECT id, address FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });
            await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            // Sync: remove from bot watch wallets
            try { await removeWalletFromUser(userId, tw.address); } catch (e) { log.warn('Watch wallet unsync failed:', e.message); }
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
            const tw = await dbGet('SELECT id, isDefault FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });
            
            // Toggle: if already default, unset it; otherwise set it as default
            if (tw.isDefault) {
                await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE id = ? AND userId = ?', [req.params.id, userId]);
                res.json({ ok: true, isDefault: false });
            } else {
                await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE userId = ?', [userId]);
                await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ? AND userId = ?', [req.params.id, userId]);
                res.json({ ok: true, isDefault: true });
            }
        } catch (err) {
            log.error('wallets/set-default error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/import
     * Bulk import wallets by private key (syncs with bot watch wallets)
     * Body: { keys: [{ key, name? }] }  OR legacy { privateKey, name? }
     */
    router.post('/wallets/import', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const ethers = require('ethers');
            const crypto = require('crypto');
            const { _getEncryptKey } = require('../features/ai/onchain/helpers');
            const { dbGet, dbRun } = require('../../db/core');
            const { addWalletToUser } = require('../../db/wallets');
            const ENCRYPT_KEY = _getEncryptKey();

            // Check wallet limit
            let user = null;
            try { user = await dbGet('SELECT walletLimit FROM users WHERE chatId = ?', [userId]); } catch {}
            let limitCount = null;
            try { limitCount = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]); } catch {}
            const walletLimit = user?.walletLimit || 50;

            // Support both single and bulk import
            let keysList = [];
            if (Array.isArray(req.body.keys) && req.body.keys.length > 0) {
                keysList = req.body.keys;
            } else if (req.body.privateKey) {
                keysList = [{ key: req.body.privateKey, name: req.body.name }];
            }
            if (keysList.length === 0) return res.status(400).json({ error: 'keys[] or privateKey required' });
            if (keysList.length > 50) return res.status(400).json({ error: 'Maximum 50 keys per import' });

            const results = { imported: [], duplicates: [], invalid: [] };

            for (const entry of keysList) {
                let pk = (typeof entry === 'string' ? entry : entry.key || '').trim();
                const entryName = typeof entry === 'object' ? (entry.name || '').trim() : '';
                if (!pk) { results.invalid.push({ key: '(empty)', error: 'Empty key' }); continue; }
                if (!pk.startsWith('0x')) pk = '0x' + pk;

                let wallet;
                try {
                    wallet = new ethers.Wallet(pk);
                } catch {
                    results.invalid.push({ key: pk.slice(0, 10) + '...', error: 'Invalid format' });
                    continue;
                }

                const existing = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND address = ?', [userId, wallet.address]);
                if (existing) {
                    results.duplicates.push({ address: wallet.address, name: entryName });
                    continue;
                }

                // Check limit per iteration
                const currentCount = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]);
                if ((currentCount?.cnt || 0) >= walletLimit) {
                    results.invalid.push({ key: pk.slice(0, 10) + '...', error: `Limit reached (${walletLimit})` });
                    continue;
                }

                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
                let encrypted = cipher.update(pk, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                const encryptedKey = iv.toString('hex') + ':' + encrypted;

                const hasWallets = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? LIMIT 1', [userId]);
                const isDefault = hasWallets ? 0 : 1;
                const countRow = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]);
                const walletName = entryName || `Imported #${(countRow?.cnt || 0) + 1}`;

                await dbRun(
                    'INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, walletName, wallet.address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]
                );

                // Sync: register as watch wallet on bot side
                try { await addWalletToUser(userId, 'en', wallet.address, { name: walletName }); } catch (e) { log.warn('Watch wallet sync:', e.message); }

                results.imported.push({ address: wallet.address, name: walletName, isDefault: !!isDefault });
            }

            log.info(`Bulk import: ${results.imported.length} imported, ${results.duplicates.length} duplicates, ${results.invalid.length} invalid by user ${userId}`);
            res.json({ success: true, results });
        } catch (err) {
            log.error('wallets/import error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * PUT /wallets/:id/rename (syncs with bot watch wallets)
     * Body: { name }
     */
    router.put('/wallets/:id/rename', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const { addWalletToUser } = require('../../db/wallets');
            const newName = (req.body.name || '').trim().replace(/[<>"'&]/g, '').slice(0, 30);
            if (!newName) return res.status(400).json({ error: 'name required' });
            const tw = await dbGet('SELECT id, address FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });
            await dbRun('UPDATE user_trading_wallets SET walletName = ? WHERE id = ? AND userId = ?', [newName, req.params.id, userId]);
            // Sync: update name in bot watch wallets
            try { await addWalletToUser(userId, 'en', tw.address, { name: newName }); } catch (e) { log.warn('Watch wallet rename sync:', e.message); }
            res.json({ ok: true, name: newName });
        } catch (err) {
            log.error('wallets/rename error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/:id/export-key
     * Returns the decrypted private key (rate-limited, PIN-protected, updates lastExportedAt)
     */
    const _exportKeyLimiter = new Map();
    router.post('/wallets/:id/export-key', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });

        // Rate limit: 10 exports per minute per user
        const now = Date.now();
        const limiter = _exportKeyLimiter.get(userId) || { count: 0, resetAt: now + 60000 };
        if (now > limiter.resetAt) { limiter.count = 0; limiter.resetAt = now + 60000; }
        limiter.count++;
        _exportKeyLimiter.set(userId, limiter);
        if (limiter.count > 30) {
            return res.status(429).json({ error: 'Too many export requests. Please wait 1 minute.' });
        }

        try {
            const crypto = require('crypto');
            const { dbGet, dbRun } = require('../../db/core');
            const { _getEncryptKey, _verifyPin } = require('../features/ai/onchain/helpers');

            // PIN check
            let user = null;
            try { user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]); } catch {}
            if (user?.pinCode) {
                const pin = req.body.pin || req.headers['x-pin'];
                if (!pin) return res.status(403).json({ error: 'PIN required', needPin: true });
                if (!_verifyPin(pin, user.pinCode, userId)) return res.status(403).json({ error: 'Invalid PIN', needPin: true });
            }

            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });

            const ENCRYPT_KEY = _getEncryptKey();
            const [ivHex, encrypted] = tw.encryptedKey.split(':');
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), Buffer.from(ivHex, 'hex'));
            let privateKey = decipher.update(encrypted, 'hex', 'utf8');
            privateKey += decipher.final('utf8');

            // Update lastExportedAt (non-blocking — column may not exist yet)
            try {
                await dbRun('UPDATE user_trading_wallets SET lastExportedAt = ? WHERE id = ?', [Math.floor(Date.now() / 1000), tw.id]);
            } catch { /* migration may not have run yet */ }

            log.info(`Key exported for wallet ${tw.address} by user ${userId}`);
            res.json({ privateKey, address: tw.address });
        } catch (err) {
            log.error('wallets/export-key error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/bulk-export
     * Bulk export private keys for multiple wallets in one request
     * Body: { walletIds: [id1, id2, ...] }
     */
    const _bulkExportLimiter = new Map();
    router.post('/wallets/bulk-export', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });

        // Rate limit: 1 bulk export per minute per user
        const now = Date.now();
        const limiter = _bulkExportLimiter.get(userId) || { count: 0, resetAt: now + 60000 };
        if (now > limiter.resetAt) { limiter.count = 0; limiter.resetAt = now + 60000; }
        limiter.count++;
        _bulkExportLimiter.set(userId, limiter);
        if (limiter.count > 3) {
            return res.status(429).json({ error: 'Too many export requests. Please wait 1 minute.' });
        }

        try {
            const crypto = require('crypto');
            const { dbGet, dbAll, dbRun } = require('../../db/core');
            const { _getEncryptKey, _verifyPin } = require('../features/ai/onchain/helpers');

            // PIN check
            let user = null;
            try { user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]); } catch {}
            if (user?.pinCode) {
                const pin = req.body.pin || req.headers['x-pin'];
                if (!pin) return res.status(403).json({ error: 'PIN required', needPin: true });
                if (!_verifyPin(pin, user.pinCode, userId)) return res.status(403).json({ error: 'Invalid PIN', needPin: true });
            }

            const walletIds = req.body.walletIds;
            if (!Array.isArray(walletIds) || walletIds.length === 0) {
                return res.status(400).json({ error: 'walletIds[] required' });
            }
            if (walletIds.length > 50) {
                return res.status(400).json({ error: 'Maximum 50 wallets per export' });
            }

            const ENCRYPT_KEY = _getEncryptKey();
            const results = [];
            const nowSec = Math.floor(Date.now() / 1000);

            for (const id of walletIds) {
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [id, userId]);
                if (!tw) { results.push({ id, error: 'Not found' }); continue; }

                try {
                    const [ivHex, encrypted] = tw.encryptedKey.split(':');
                    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), Buffer.from(ivHex, 'hex'));
                    let privateKey = decipher.update(encrypted, 'hex', 'utf8');
                    privateKey += decipher.final('utf8');
                    results.push({ id, privateKey, address: tw.address, name: tw.walletName || 'Wallet' });
                    try { await dbRun('UPDATE user_trading_wallets SET lastExportedAt = ? WHERE id = ?', [nowSec, tw.id]); } catch {}
                } catch (e) {
                    results.push({ id, error: 'Decryption failed' });
                }
            }

            log.info(`Bulk export: ${results.filter(r => r.privateKey).length}/${walletIds.length} keys by user ${userId}`);
            res.json({ results });
        } catch (err) {
            log.error('wallets/bulk-export error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    // PIN Endpoints
    // ════════════════════════════════════════

    /**
     * GET /wallets/pin/status
     */
    router.get('/wallets/pin/status', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet } = require('../../db/core');
            const user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]);
            res.json({ hasPin: !!(user?.pinCode) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/pin/set
     * Body: { newPin, currentPin? }
     */
    router.post('/wallets/pin/set', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const { _hashPin, _verifyPin } = require('../features/ai/onchain/helpers');
            const { newPin, currentPin } = req.body;

            if (!newPin || !/^\d{4,6}$/.test(newPin)) {
                return res.status(400).json({ error: 'PIN must be 4-6 digits' });
            }

            const user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]);
            if (user?.pinCode) {
                if (!currentPin) return res.status(403).json({ error: 'Current PIN required to change' });
                if (!_verifyPin(currentPin, user.pinCode, userId)) return res.status(403).json({ error: 'Current PIN incorrect' });
            }

            const hashed = _hashPin(newPin, userId);
            await dbRun('UPDATE users SET pinCode = ? WHERE chatId = ?', [hashed, userId]);
            log.info(`PIN set by user ${userId}`);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/pin/verify
     * Body: { pin }
     */
    router.post('/wallets/pin/verify', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet } = require('../../db/core');
            const { _verifyPin } = require('../features/ai/onchain/helpers');
            const user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]);
            if (!user?.pinCode) return res.json({ valid: true, noPin: true });
            const valid = _verifyPin(req.body.pin || '', user.pinCode, userId);
            res.json({ valid });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/pin/remove
     * Body: { currentPin }
     */
    router.post('/wallets/pin/remove', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const { _verifyPin } = require('../features/ai/onchain/helpers');
            const user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]);
            if (!user?.pinCode) return res.json({ ok: true });
            if (!_verifyPin(req.body.currentPin || '', user.pinCode, userId)) {
                return res.status(403).json({ error: 'PIN incorrect' });
            }
            await dbRun('UPDATE users SET pinCode = NULL WHERE chatId = ?', [userId]);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    // Tags Endpoint
    // ════════════════════════════════════════

    /**
     * PUT /wallets/:id/tags
     * Body: { tags: ['Trading', 'DCA'] }
     */
    router.put('/wallets/:id/tags', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbGet, dbRun } = require('../../db/core');
            const tw = await dbGet('SELECT id FROM user_trading_wallets WHERE id = ? AND userId = ?', [req.params.id, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });
            const tags = Array.isArray(req.body.tags) ? req.body.tags.slice(0, 5).map(t => String(t).replace(/[<>"'&]/g, '').slice(0, 20)) : [];
            await dbRun('UPDATE user_trading_wallets SET tags = ? WHERE id = ? AND userId = ?', [JSON.stringify(tags), req.params.id, userId]);
            res.json({ ok: true, tags });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    // Portfolio History
    // ════════════════════════════════════════

    /**
     * GET /wallets/portfolio-history?days=30
     */
    router.get('/wallets/portfolio-history', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbAll } = require('../../db/core');
            const days = Math.min(parseInt(req.query.days) || 30, 90);
            const since = Math.floor(Date.now() / 1000) - days * 86400;
            const snapshots = await dbAll(
                'SELECT totalUsd, snapshotAt FROM wallet_portfolio_snapshots WHERE userId = ? AND snapshotAt > ? ORDER BY snapshotAt ASC',
                [userId, since]
            );
            res.json({ snapshots: snapshots || [] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /wallets/portfolio-snapshot
     * Body: { totalUsd }
     */
    router.post('/wallets/portfolio-snapshot', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbRun, dbGet } = require('../../db/core');
            const totalUsd = parseFloat(req.body.totalUsd) || 0;
            // Rate limit: max 1 snapshot per hour
            const last = await dbGet(
                'SELECT snapshotAt FROM wallet_portfolio_snapshots WHERE userId = ? ORDER BY snapshotAt DESC LIMIT 1',
                [userId]
            );
            const now = Math.floor(Date.now() / 1000);
            if (last && now - last.snapshotAt < 3600) {
                return res.json({ ok: true, skipped: true });
            }
            await dbRun(
                'INSERT INTO wallet_portfolio_snapshots (userId, totalUsd, snapshotAt) VALUES (?, ?, ?)',
                [userId, totalUsd, now]
            );
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    // Admin: Wallet Limit
    // ════════════════════════════════════════

    /**
     * PUT /admin/users/:id/wallet-limit
     * Body: { limit: 100 }
     */
    router.put('/admin/users/:id/wallet-limit', async (req, res) => {
        if (!req.dashboardUser?.isOwner) return res.status(403).json({ error: 'Owner only' });
        try {
            const { dbRun } = require('../../db/core');
            const newLimit = parseInt(req.body.limit) || 50;
            if (newLimit < 1 || newLimit > 10000) return res.status(400).json({ error: 'Limit must be 1-10000' });
            await dbRun('UPDATE users SET walletLimit = ? WHERE chatId = ?', [newLimit, req.params.id]);
            log.info(`Wallet limit set to ${newLimit} for user ${req.params.id} by owner`);
            res.json({ ok: true, limit: newLimit });
        } catch (err) {
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

            log.info('swap/quote request:', { chainIndex, fromTokenAddress, toTokenAddress, amount, resolvedAmount });

            const data = await onchainos.getSwapQuote({
                chainIndex,
                fromTokenAddress: fromTokenAddress.toLowerCase(),
                toTokenAddress: toTokenAddress.toLowerCase(),
                amount: resolvedAmount
            });

            log.info('swap/quote response:', JSON.stringify(data)?.slice(0, 500));
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

    // ════════════════════════════════════════
    // Portfolio Endpoints
    // ════════════════════════════════════════

    /**
     * GET /portfolio/overview?walletAddress=0x...&chainIndex=196
     */
    router.get('/portfolio/overview', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId?.toString();
            if (!userId) return res.status(401).json({ error: 'Auth required' });
            let { walletAddress, chainIndex = '196' } = req.query;
            // Auto-resolve wallet if not provided
            if (!walletAddress) {
                const { dbGet } = require('../../db/core');
                const tw = await dbGet('SELECT address FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                if (!tw) return res.json({ data: null });
                walletAddress = tw.address;
            }
            const data = await onchainos.getPortfolioOverview(chainIndex, walletAddress);
            res.json({ data, walletAddress });
        } catch (err) {
            log.error('portfolio/overview error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /portfolio/pnl?walletAddress=0x...&chainIndex=196
     */
    router.get('/portfolio/pnl', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId?.toString();
            if (!userId) return res.status(401).json({ error: 'Auth required' });
            let { walletAddress, chainIndex = '196' } = req.query;
            if (!walletAddress) {
                const { dbGet } = require('../../db/core');
                const tw = await dbGet('SELECT address FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                if (!tw) return res.json({ data: null });
                walletAddress = tw.address;
            }
            const data = await onchainos.getRecentPnl(chainIndex, walletAddress);
            res.json({ data });
        } catch (err) {
            log.error('portfolio/pnl error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /portfolio/dex-history?walletAddress=0x...&chainIndex=196
     */
    router.get('/portfolio/dex-history', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId?.toString();
            if (!userId) return res.status(401).json({ error: 'Auth required' });
            let { walletAddress, chainIndex = '196', begin, end, type } = req.query;
            if (!walletAddress) {
                const { dbGet } = require('../../db/core');
                const tw = await dbGet('SELECT address FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                if (!tw) return res.json({ data: [] });
                walletAddress = tw.address;
            }
            // Default: last 30 days
            if (!begin) begin = String(Date.now() - 30 * 86400000);
            if (!end) end = String(Date.now());
            const data = await onchainos.getDexHistory(chainIndex, walletAddress, begin, end, { type, limit: '50' });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('portfolio/dex-history error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Token Advanced Endpoints
    // ════════════════════════════════════════

    /**
     * GET /token/top-traders?chainIndex=196&tokenContractAddress=0x...
     */
    router.get('/token/top-traders', async (req, res) => {
        try {
            const { chainIndex = '196', tokenContractAddress, tagFilter } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            const data = await onchainos.getTopTrader(chainIndex, tokenContractAddress, { tagFilter });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('token/top-traders error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /token/top-liquidity?chainIndex=196&tokenContractAddress=0x...
     */
    router.get('/token/top-liquidity', async (req, res) => {
        try {
            const { chainIndex = '196', tokenContractAddress } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            const data = await onchainos.getTokenLiquidityPool(chainIndex, tokenContractAddress);
            res.json({ data: data || [] });
        } catch (err) {
            log.error('token/top-liquidity error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Wallet Balance (AI Trader wallet selector)
    // ════════════════════════════════════════
    router.get('/wallet/balance', async (req, res) => {
        try {
            const { address, chains = '196' } = req.query;
            if (!address) return res.status(400).json({ error: 'address required' });
            const data = await onchainos.getWalletTotalValue(address, chains);
            const totalValue = Array.isArray(data) ? (data[0]?.totalValue || '0') : (data?.totalValue || '0');
            res.json({ totalValue });
        } catch (err) {
            log.error('wallet/balance error:', err.msg || err.message);
            res.json({ totalValue: '0' });
        }
    });

    // ════════════════════════════════════════
    // Token Search & Info (AI Trader Step 2)
    // ════════════════════════════════════════

    router.get('/wallet/tokens', async (req, res) => {
        try {
            const { address, chains = '196' } = req.query;
            if (!address) return res.status(400).json({ error: 'address required' });
            const data = await onchainos.getWalletBalances(address, chains, { excludeRiskToken: true });
            res.json({ tokens: data || [] });
        } catch (err) {
            log.error('wallet/tokens error:', err.msg || err.message);
            res.json({ tokens: [] });
        }
    });

    /**
     * GET /token/search?keyword=PEPE&chainIndex=1
     * Search tokens by name/symbol on a specific chain
     */
    router.get('/token/search', async (req, res) => {
        try {
            const { keyword, chainIndex, chains } = req.query;
            const chain = chainIndex || chains || '196';
            if (!keyword || keyword.length < 2) return res.status(400).json({ error: 'keyword required (min 2 chars)' });
            const data = await onchainos.getTokenSearch(chain, keyword);
            const tokens = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
            res.json({ tokens });
        } catch (err) {
            log.error('token/search error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * POST /token/info { address, chainIndex }
     * Get token basic info by contract address
     */
    router.post('/token/info', async (req, res) => {
        try {
            const { address, chainIndex = '196' } = req.body;
            if (!address) return res.status(400).json({ error: 'address required' });
            const data = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: address }]);
            const token = Array.isArray(data) && data.length > 0 ? data[0] : null;
            if (token) {
                res.json({ symbol: token.tokenSymbol, name: token.tokenName || token.tokenSymbol, address: token.tokenContractAddress, decimal: token.decimal, chainIndex });
            } else {
                res.json({ symbol: null });
            }
        } catch (err) {
            log.error('token/info error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // New OnchainOS API Endpoints
    // ════════════════════════════════════════

    /** GET /token/hot-tokens?chainIndex=1&limit=20 */
    router.get('/token/hot-tokens', async (req, res) => {
        try {
            const { chainIndex, limit = '20' } = req.query;
            const data = await onchainos.getHotTokens({ chainIndex, limit });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('token/hot-tokens error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /** GET /market/address-tracker?trackerType=1&chainIndex=1 */
    router.get('/market/address-tracker', async (req, res) => {
        try {
            const { trackerType = '1', chainIndex, limit = '20' } = req.query;
            const data = await onchainos.getAddressTrackerActivities({ trackerType, chainIndex, limit });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('market/address-tracker error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /** GET /market/leaderboard?chainIndex=1&timeFrame=2 */
    router.get('/market/leaderboard', async (req, res) => {
        try {
            const { chainIndex = '1', timeFrame = '2', traderType, sort, limit = '20' } = req.query;
            const data = await onchainos.getLeaderboardList({ chainIndex, timeFrame, traderType, sort, limit });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('market/leaderboard error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /** GET /market/leaderboard-chains */
    router.get('/market/leaderboard-chains', async (req, res) => {
        try {
            const data = await onchainos.getLeaderboardChains();
            res.json({ data: data || [] });
        } catch (err) {
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /** POST /security/token-scan — Body: { tokens: [{ chainId, contractAddress }] } */
    router.post('/security/token-scan', async (req, res) => {
        try {
            const { tokens } = req.body;
            if (!tokens || !Array.isArray(tokens)) return res.status(400).json({ error: 'tokens[] required' });
            const data = await onchainos.tokenScan(tokens);
            res.json({ data });
        } catch (err) {
            log.error('security/token-scan error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /** GET /token/cluster?chainIndex=1&tokenContractAddress=0x... */
    router.get('/token/cluster', async (req, res) => {
        try {
            const { chainIndex = '1', tokenContractAddress, mode = 'overview' } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            let data;
            if (mode === 'top_holders') data = await onchainos.getClusterTopHolders(chainIndex, tokenContractAddress);
            else if (mode === 'clusters') data = await onchainos.getClusterList(chainIndex, tokenContractAddress);
            else data = await onchainos.getClusterOverview(chainIndex, tokenContractAddress);
            res.json({ data: data || {} });
        } catch (err) {
            log.error('token/cluster error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /** GET /wallet/approvals?address=0x...&chains=1,56 */
    router.get('/wallet/approvals', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId?.toString();
            if (!userId) return res.status(401).json({ error: 'Auth required' });
            let { address, chains } = req.query;
            if (!address) {
                const { dbGet } = require('../../db/core');
                const tw = await dbGet('SELECT address FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                if (!tw) return res.json({ data: { approvalList: [] } });
                address = tw.address;
            }
            const data = await onchainos.getApprovals(address, { chains });
            res.json({ data, address });
        } catch (err) {
            log.error('wallet/approvals error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    /**
     * GET /memepump/list?chainIndex=196&stage=1
     */
    router.get('/memepump/list', async (req, res) => {
        try {
            const { chainIndex = '196', stage = '1', orderBy, direction } = req.query;
            const data = await onchainos.getMemePumpTokenList(chainIndex, stage, { orderBy, direction });
            res.json({ data: data || [] });
        } catch (err) {
            log.error('memepump/list error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });

    // ════════════════════════════════════════
    // Swap Execute Endpoint
    // ════════════════════════════════════════

    /**
     * POST /swap/execute
     * Body: { walletId, chainIndex, fromTokenAddress, toTokenAddress, amount, slippage }
     * Signs and broadcasts the swap transaction using the user's encrypted wallet key.
     */
    router.post('/swap/execute', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { walletId, chainIndex = '196', fromTokenAddress, toTokenAddress, amount, slippage = '1' } = req.body;
            if (!walletId || !fromTokenAddress || !toTokenAddress || !amount) {
                return res.status(400).json({ error: 'walletId, fromTokenAddress, toTokenAddress, amount required' });
            }

            const ethers = require('ethers');
            const cryptoNode = require('crypto');
            const { dbGet, dbRun } = require('../../db/core');
            const { _getEncryptKey, _getChainRpc } = require('../features/ai/onchain/helpers');

            // 1. Resolve wallet + decrypt key
            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });

            const ENCRYPT_KEY = _getEncryptKey();
            const [ivHex, encrypted] = tw.encryptedKey.split(':');
            const decipher = cryptoNode.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), Buffer.from(ivHex, 'hex'));
            let privateKey = decipher.update(encrypted, 'hex', 'utf8');
            privateKey += decipher.final('utf8');

            // 2. Resolve amount to minimal units
            let resolvedAmount = amount;
            try {
                const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                if (basicInfo?.length > 0) {
                    const decimals = Number(basicInfo[0].decimal || 18);
                    resolvedAmount = ethers.parseUnits(String(amount), decimals).toString();
                }
            } catch { /* use original */ }

            // 3. Approve (for ERC-20 tokens, not native)
            const isNative = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            if (!isNative) {
                try {
                    const approveData = await onchainos.getApproveTransaction(chainIndex, fromTokenAddress, resolvedAmount);
                    if (approveData?.data) {
                        const rpcUrl = _getChainRpc(chainIndex);
                        const provider = new ethers.JsonRpcProvider(rpcUrl);
                        const wallet = new ethers.Wallet(privateKey, provider);
                        const approveTx = await wallet.sendTransaction({
                            to: approveData.data.to || approveData.data[0]?.to,
                            data: approveData.data.data || approveData.data[0]?.data,
                            value: '0'
                        });
                        await approveTx.wait(1);
                    }
                } catch (approveErr) {
                    log.warn('Approve step failed (may already be approved):', approveErr.message);
                }
            }

            // 4. Get swap calldata
            const swapData = await onchainos.getSwapTransaction({
                chainIndex,
                fromTokenAddress: fromTokenAddress.toLowerCase(),
                toTokenAddress: toTokenAddress.toLowerCase(),
                amount: resolvedAmount,
                userWalletAddress: tw.address,
                slippagePercent: slippage
            });

            const txInfo = Array.isArray(swapData) ? swapData[0] : swapData;
            if (!txInfo?.tx) return res.status(400).json({ error: 'Failed to get swap transaction data' });

            // 5. Sign and broadcast
            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);

            const tx = await wallet.sendTransaction({
                to: txInfo.tx.to,
                data: txInfo.tx.data,
                value: txInfo.tx.value || '0',
                gasLimit: txInfo.tx.gas ? BigInt(txInfo.tx.gas) : undefined,
            });

            // 6. Record transaction
            try {
                await dbRun(
                    'INSERT INTO wallet_tx_history (userId, walletId, chainIndex, txHash, fromToken, toToken, amount, type, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [userId, walletId, chainIndex, tx.hash, fromTokenAddress, toTokenAddress, amount, 'swap', 'pending', Math.floor(Date.now() / 1000)]
                );
            } catch { /* ignore logging error */ }

            log.info(`Dashboard Swap executed: ${tx.hash} by user ${userId}`);
            res.json({ success: true, txHash: tx.hash });
        } catch (err) {
            log.error('swap/execute error:', err.msg || err.message);
            res.status(500).json({ error: err.msg || err.message });
        }
    });


    // ════════════════════════════════════════
    // Batch Swap — same pair, multiple wallets
    // ════════════════════════════════════════

    /**
     * POST /swap/batch
     * Body: { swaps: [{ walletId, amount }], chainIndex, fromTokenAddress, toTokenAddress, slippage }
     */
    router.post('/swap/batch', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { swaps, chainIndex = '196', fromTokenAddress, toTokenAddress, slippage = '1' } = req.body;
            if (!Array.isArray(swaps) || swaps.length === 0 || !fromTokenAddress || !toTokenAddress) {
                return res.status(400).json({ error: 'swaps[], fromTokenAddress, toTokenAddress required' });
            }

            const ethers = require('ethers');
            const cryptoNode = require('crypto');
            const { dbGet, dbRun } = require('../../db/core');
            const { _getEncryptKey, _getChainRpc } = require('../features/ai/onchain/helpers');
            const ENCRYPT_KEY = _getEncryptKey();
            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);

            const results = [];
            for (const swap of swaps) {
                try {
                    const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [swap.walletId, userId]);
                    if (!tw) { results.push({ walletId: swap.walletId, error: 'Wallet not found' }); continue; }

                    const [ivHex, encrypted] = tw.encryptedKey.split(':');
                    const decipher = cryptoNode.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), Buffer.from(ivHex, 'hex'));
                    let privateKey = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');

                    // Resolve amount
                    let resolvedAmount = swap.amount;
                    try {
                        const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                        if (basicInfo?.length > 0) {
                            resolvedAmount = ethers.parseUnits(String(swap.amount), Number(basicInfo[0].decimal || 18)).toString();
                        }
                    } catch { /* use original */ }

                    // Approve if ERC-20
                    const isNative = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                    if (!isNative) {
                        try {
                            const approveData = await onchainos.getApproveTransaction(chainIndex, fromTokenAddress, resolvedAmount);
                            if (approveData?.data) {
                                const wallet = new ethers.Wallet(privateKey, provider);
                                const approveTx = await wallet.sendTransaction({
                                    to: approveData.data.to || approveData.data[0]?.to,
                                    data: approveData.data.data || approveData.data[0]?.data, value: '0'
                                });
                                await approveTx.wait(1);
                            }
                        } catch (e) { log.warn('Batch approve skip:', e.message); }
                    }

                    // Get swap data + execute
                    const swapData = await onchainos.getSwapTransaction({
                        chainIndex, fromTokenAddress: fromTokenAddress.toLowerCase(), toTokenAddress: toTokenAddress.toLowerCase(),
                        amount: resolvedAmount, userWalletAddress: tw.address, slippagePercent: slippage
                    });
                    const txInfo = Array.isArray(swapData) ? swapData[0] : swapData;
                    if (!txInfo?.tx) { results.push({ walletId: swap.walletId, walletName: tw.name, error: 'No swap data' }); continue; }

                    const wallet = new ethers.Wallet(privateKey, provider);
                    const tx = await wallet.sendTransaction({
                        to: txInfo.tx.to, data: txInfo.tx.data, value: txInfo.tx.value || '0',
                        gasLimit: txInfo.tx.gas ? BigInt(txInfo.tx.gas) : undefined,
                    });

                    try {
                        await dbRun('INSERT INTO wallet_tx_history (userId, walletId, chainIndex, txHash, fromToken, toToken, amount, type, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
                            [userId, swap.walletId, chainIndex, tx.hash, fromTokenAddress, toTokenAddress, swap.amount, 'batch_swap', 'pending', Math.floor(Date.now() / 1000)]);
                    } catch { /* ignore */ }

                    results.push({ walletId: swap.walletId, walletName: tw.name, txHash: tx.hash });
                    log.info(`Batch swap TX: ${tx.hash} wallet=${tw.name}`);
                } catch (err) {
                    results.push({ walletId: swap.walletId, error: err.message });
                }
            }
            res.json({ results });
        } catch (err) {
            log.error('swap/batch error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });


    // ════════════════════════════════════════
    // Single Transfer (native / ERC-20)
    // ════════════════════════════════════════

    /**
     * POST /transfer/execute
     * Body: { walletId, chainIndex, toAddress, tokenAddress, amount }
     * tokenAddress = '0xeee...' or omitted for native token
     */
    router.post('/transfer/execute', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { walletId, chainIndex = '196', toAddress, tokenAddress, amount } = req.body;
            if (!walletId || !toAddress || !amount) return res.status(400).json({ error: 'walletId, toAddress, amount required' });

            const ethers = require('ethers');
            const cryptoNode = require('crypto');
            const { dbGet, dbRun } = require('../../db/core');
            const { _getEncryptKey, _getChainRpc } = require('../features/ai/onchain/helpers');

            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
            if (!tw) return res.status(404).json({ error: 'Wallet not found' });

            const ENCRYPT_KEY = _getEncryptKey();
            const [ivHex, encrypted] = tw.encryptedKey.split(':');
            const decipher = cryptoNode.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), Buffer.from(ivHex, 'hex'));
            let privateKey = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');

            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);

            const isNative = !tokenAddress || tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            let txHash;

            if (isNative) {
                const tx = await wallet.sendTransaction({ to: toAddress, value: ethers.parseEther(String(amount)) });
                txHash = tx.hash;
            } else {
                // ERC-20 transfer
                let decimals = 18;
                try {
                    const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: tokenAddress }]);
                    if (basicInfo?.length > 0) decimals = Number(basicInfo[0].decimal || 18);
                } catch { /* use 18 */ }
                const erc20 = new ethers.Contract(tokenAddress, ['function transfer(address to, uint256 amount) returns (bool)'], wallet);
                const tx = await erc20.transfer(toAddress, ethers.parseUnits(String(amount), decimals));
                txHash = tx.hash;
            }

            try {
                await dbRun('INSERT INTO wallet_tx_history (userId, walletId, chainIndex, txHash, fromToken, toToken, amount, type, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [userId, walletId, chainIndex, txHash, tokenAddress || 'native', toAddress, amount, 'transfer_out', 'pending', Math.floor(Date.now() / 1000)]);
            } catch { /* ignore */ }

            log.info(`Dashboard Transfer: ${txHash} by user ${userId}`);
            res.json({ success: true, txHash });
        } catch (err) {
            log.error('transfer/execute error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });


    // ════════════════════════════════════════
    // Batch Transfer
    // ════════════════════════════════════════

    /**
     * POST /transfer/batch
     * Body: { transfers: [{ walletId, toAddress, amount }], chainIndex, tokenAddress }
     */
    router.post('/transfer/batch', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { transfers, chainIndex = '196', tokenAddress } = req.body;
            if (!Array.isArray(transfers) || transfers.length === 0) return res.status(400).json({ error: 'transfers[] required' });

            const ethers = require('ethers');
            const cryptoNode = require('crypto');
            const { dbGet, dbRun } = require('../../db/core');
            const { _getEncryptKey, _getChainRpc } = require('../features/ai/onchain/helpers');
            const ENCRYPT_KEY = _getEncryptKey();
            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);

            const isNative = !tokenAddress || tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            let decimals = 18;
            if (!isNative) {
                try {
                    const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: tokenAddress }]);
                    if (basicInfo?.length > 0) decimals = Number(basicInfo[0].decimal || 18);
                } catch { /* use 18 */ }
            }

            const results = [];
            for (const tr of transfers) {
                try {
                    if (!tr.walletId || !tr.toAddress || !tr.amount) { results.push({ ...tr, error: 'Missing fields' }); continue; }

                    const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [tr.walletId, userId]);
                    if (!tw) { results.push({ ...tr, error: 'Wallet not found' }); continue; }

                    const [ivHex, encrypted] = tw.encryptedKey.split(':');
                    const decipher = cryptoNode.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), Buffer.from(ivHex, 'hex'));
                    let privateKey = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
                    const wallet = new ethers.Wallet(privateKey, provider);

                    let txHash;
                    if (isNative) {
                        const tx = await wallet.sendTransaction({ to: tr.toAddress, value: ethers.parseEther(String(tr.amount)) });
                        txHash = tx.hash;
                    } else {
                        const erc20 = new ethers.Contract(tokenAddress, ['function transfer(address to, uint256 amount) returns (bool)'], wallet);
                        const tx = await erc20.transfer(tr.toAddress, ethers.parseUnits(String(tr.amount), decimals));
                        txHash = tx.hash;
                    }

                    try {
                        await dbRun('INSERT INTO wallet_tx_history (userId, walletId, chainIndex, txHash, fromToken, toToken, amount, type, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
                            [userId, tr.walletId, chainIndex, txHash, tokenAddress || 'native', tr.toAddress, tr.amount, 'batch_transfer', 'pending', Math.floor(Date.now() / 1000)]);
                    } catch { /* ignore */ }

                    results.push({ walletId: tr.walletId, walletName: tw.name, toAddress: tr.toAddress, txHash });
                    log.info(`Batch transfer TX: ${txHash} wallet=${tw.name}`);
                } catch (err) {
                    results.push({ walletId: tr.walletId, toAddress: tr.toAddress, error: err.message });
                }
            }
            res.json({ results });
        } catch (err) {
            log.error('transfer/batch error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createMarketRoutes };
