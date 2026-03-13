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
            const { chainIndex = '196', tokenContractAddress } = req.query;
            if (!tokenContractAddress) return res.status(400).json({ error: 'tokenContractAddress required' });
            const { okxFetch } = onchainos;
            // Build path manually for top-trader endpoint
            const qs = new URLSearchParams({ chainIndex, tokenContractAddress }).toString();
            const data = await okxFetch('GET', `/api/v6/dex/market/token/top-trader?${qs}`);
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
            const { _getEncryptKey, _getRpcUrl } = require('../features/ai/onchain/helpers');

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
                        const rpcUrl = _getRpcUrl(chainIndex);
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
            const rpcUrl = _getRpcUrl(chainIndex);
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
