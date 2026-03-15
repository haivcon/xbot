/**
 * Trade Execution Engine — Triple Barrier System
 * Adapted from hummingbot's PositionExecutor pattern
 *
 * Monitors active positions with 4 barriers:
 * 1. Stop-Loss: Close when price drops below threshold
 * 2. Take-Profit: Close when price rises above threshold
 * 3. Trailing Stop: Lock in profits with moving stop
 * 4. Time Limit: Auto-close after N hours
 *
 * Also tracks real-time PnL (unrealized/realized).
 */
const logger = require('../core/logger');
const log = logger.child('ExecutionEngine');

// Active positions being monitored (userId -> [positions])
const activePositions = new Map();

// Monitoring interval (one shared interval for all users)
let _monitorInterval = null;
const MONITOR_INTERVAL_MS = 30000; // 30 seconds

// ═══════════════════════════════════════════════
// DB INITIALIZATION
// ═══════════════════════════════════════════════

let _engineDbInit = false;

async function initEngineDB() {
    if (_engineDbInit) return;
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`CREATE TABLE IF NOT EXISTS auto_trading_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            planId INTEGER NOT NULL,
            tokenAddress TEXT NOT NULL,
            tokenSymbol TEXT,
            chainIndex TEXT,
            side TEXT DEFAULT 'buy',
            entryPrice REAL NOT NULL,
            currentPrice REAL,
            amountUsd REAL NOT NULL,
            amountToken REAL DEFAULT 0,
            stopLossPct REAL DEFAULT 15,
            takeProfitPct REAL DEFAULT 30,
            trailingStopEnabled INTEGER DEFAULT 0,
            trailingStopActivation REAL DEFAULT 5,
            trailingStopDelta REAL DEFAULT 2,
            trailingStopTrigger REAL,
            timeLimitHours REAL DEFAULT 0,
            status TEXT DEFAULT 'active',
            closeType TEXT,
            closePrice REAL,
            realizedPnlUsd REAL DEFAULT 0,
            realizedPnlPct REAL DEFAULT 0,
            txHashOpen TEXT,
            txHashClose TEXT,
            openedAt TEXT DEFAULT (datetime('now')),
            closedAt TEXT,
            lastCheckedAt TEXT
        )`);
        _engineDbInit = true;
    } catch (err) {
        log.error('initEngineDB error:', err.message);
    }
}

// ═══════════════════════════════════════════════
// POSITION MANAGEMENT
// ═══════════════════════════════════════════════

/**
 * Open a new position from an approved trade plan
 * Called by autoTrading.js after approvePlan()
 */
async function openPosition(userId, plan, options = {}) {
    await initEngineDB();
    const { dbRun } = require('../../db/core');

    const entryPrice = plan.tokenPrice || plan.executedPrice || 0;
    const amountUsd = plan.modifiedAmountUsd || plan.suggestedAmountUsd || 5;
    const amountToken = entryPrice > 0 ? amountUsd / entryPrice : 0;
    const txHash = plan.txHash || `0x_unknown_${Date.now().toString(36)}_${plan.id}`;

    const result = await dbRun(
        `INSERT INTO auto_trading_positions 
        (userId, planId, tokenAddress, tokenSymbol, chainIndex, side, entryPrice, currentPrice, amountUsd, amountToken, stopLossPct, takeProfitPct, trailingStopEnabled, trailingStopActivation, trailingStopDelta, timeLimitHours, txHashOpen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            plan.id,
            plan.tokenAddress,
            plan.tokenSymbol || 'UNKNOWN',
            plan.chainIndex || '196',
            plan.action || 'buy',
            entryPrice,
            entryPrice, // currentPrice starts at entry
            amountUsd,
            amountToken,
            options.stopLossPct || plan.stopLossPct || 15,
            options.takeProfitPct || plan.targetPct || 30,
            options.trailingStopEnabled ? 1 : 0,
            options.trailingStopActivation || 5,
            options.trailingStopDelta || 2,
            options.timeLimitHours || 0,
            txHash
        ]
    );

    const positionId = result?.lastID;
    log.info(`Opened position #${positionId} for user ${userId}: ${plan.tokenSymbol} @ $${entryPrice}, $${amountUsd}`);

    // Add to in-memory tracking
    if (!activePositions.has(userId)) {
        activePositions.set(userId, []);
    }
    activePositions.get(userId).push({
        id: positionId,
        planId: plan.id,
        tokenAddress: plan.tokenAddress,
        tokenSymbol: plan.tokenSymbol,
        chainIndex: plan.chainIndex || '196',
        side: plan.action || 'buy',
        entryPrice,
        currentPrice: entryPrice,
        amountUsd,
        amountToken,
        stopLossPct: options.stopLossPct || plan.stopLossPct || 15,
        takeProfitPct: options.takeProfitPct || plan.targetPct || 30,
        trailingStopEnabled: !!options.trailingStopEnabled,
        trailingStopActivation: options.trailingStopActivation || 5,
        trailingStopDelta: options.trailingStopDelta || 2,
        trailingStopTrigger: null,
        timeLimitHours: options.timeLimitHours || 0,
        openedAt: Date.now()
    });

    // Ensure monitor is running
    startMonitor();

    return { positionId, txHash, entryPrice, amountUsd, amountToken };
}

/**
 * Close a position with a given close type
 */
async function closePosition(userId, positionId, closeType, closePrice) {
    await initEngineDB();
    const { dbRun, dbGet } = require('../../db/core');

    const pos = await dbGet('SELECT * FROM auto_trading_positions WHERE id = ? AND userId = ? AND status = ?', [positionId, userId, 'active']);
    if (!pos) return { success: false, error: 'Position not found or already closed' };

    const entryPrice = Number(pos.entryPrice);
    const finalClosePrice = closePrice || Number(pos.currentPrice) || entryPrice;
    const amountUsd = Number(pos.amountUsd);

    // Calculate realized PnL
    let pnlPct, pnlUsd;
    if (pos.side === 'buy') {
        pnlPct = entryPrice > 0 ? ((finalClosePrice - entryPrice) / entryPrice) * 100 : 0;
    } else {
        pnlPct = entryPrice > 0 ? ((entryPrice - finalClosePrice) / entryPrice) * 100 : 0;
    }
    pnlUsd = amountUsd * (pnlPct / 100);

    // Execute sell swap to close position
    let txHashClose = null;
    try {
        const { dbGet: dbGetClose } = require('../../db/core');
        const config = await dbGetClose('SELECT * FROM auto_trading_config WHERE userId = ?', [userId]);

        // Paper mode — skip real swap, use simulated txHash
        if (config?.paperMode) {
            txHashClose = `0xpaper_close_${Date.now().toString(36)}_${positionId}`;
            log.info(`[PAPER] Simulated close position #${positionId}: ${pos.tokenSymbol} PnL: $${pnlUsd.toFixed(2)}`);
        } else {
        const tw = config?.walletId
            ? await dbGetClose('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [config.walletId, userId])
            : await dbGetClose('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);

        if (tw && global._decryptTradingKey) {
            const onchainos = require('../services/onchainos');
            const ethers = require('ethers');
            const { _getChainRpc } = require('./ai/onchain/helpers');
            const chainIndex = pos.chainIndex || '196';
            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const privateKey = global._decryptTradingKey(tw.encryptedKey);
            const wallet = new ethers.Wallet(privateKey, provider);
            // Use CHAIN_ID_MAP for correct EVM chainId
            const { CHAIN_ID_MAP } = require('./autoTrading');
            const chainIdNum = (CHAIN_ID_MAP && CHAIN_ID_MAP[chainIndex]) || parseInt(chainIndex);

            // Get gas price from provider
            let gasPrice;
            try {
                const feeData = await provider.getFeeData();
                gasPrice = feeData.gasPrice || BigInt('1000000000');
            } catch { gasPrice = BigInt('1000000000'); }

            const nativeToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            // Sell: token → native
            const fromToken = pos.tokenAddress;
            const toToken = nativeToken;

            // Get token decimals and calculate amount
            const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromToken }]);
            const decimals = Number(basicInfo?.[0]?.decimal || 18);
            const tokenAmount = Number(pos.amountToken || 0);
            if (tokenAmount > 0) {
                const swapAmount = ethers.parseUnits(tokenAmount.toFixed(Math.min(decimals, 8)), decimals).toString();

                // ERC-20 approval
                try {
                    const approveData = await onchainos.getApproveTransaction(chainIndex, fromToken, swapAmount);
                    if (approveData?.[0]?.dexContractAddress) {
                        const approval = approveData[0];
                        const erc20Abi = ['function allowance(address,address) view returns (uint256)'];
                        const tokenContract = new ethers.Contract(fromToken, erc20Abi, provider);
                        let allowance = 0n;
                        try { allowance = await tokenContract.allowance(tw.address, approval.dexContractAddress); } catch {}
                        if (allowance < BigInt(swapAmount)) {
                            const iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
                            const approveCalldata = iface.encodeFunctionData('approve', [approval.dexContractAddress, ethers.MaxUint256]);
                            const approveTx = await wallet.signTransaction({
                                to: fromToken, data: approveCalldata, value: 0n,
                                gasLimit: BigInt(approval.gasLimit || '150000'),
                                gasPrice,
                                nonce: await provider.getTransactionCount(wallet.address, 'pending'),
                                chainId: chainIdNum
                            });
                            await onchainos.broadcastTransaction(approveTx, chainIndex, tw.address);
                            await new Promise(r => setTimeout(r, 8000)); // Wait for approval to confirm + nonce increment
                        }
                    }
                } catch (approveErr) {
                    log.warn(`Close position #${positionId} approve error:`, approveErr.message);
                }

                // Swap
                const quoteData = await onchainos.getSwapQuote({ chainIndex, fromTokenAddress: fromToken, toTokenAddress: toToken, amount: swapAmount });
                const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
                let slippage = Math.max(5, Math.ceil(Number(quote?.routerResult?.priceImpactPercentage || 0) + 2));
                slippage = Math.min(50, slippage);

                const txData = await onchainos.getSwapTransaction({
                    chainIndex, fromTokenAddress: fromToken, toTokenAddress: toToken, amount: swapAmount,
                    userWalletAddress: tw.address, slippagePercent: String(slippage)
                });
                const txRaw = Array.isArray(txData) ? txData[0] : txData;
                if (txRaw?.tx) {
                    const tx = txRaw.tx;
                    let gasLimit;
                    try {
                        const estimated = await provider.estimateGas({
                            from: tw.address, to: tx.to, data: tx.data, value: BigInt(tx.value || '0')
                        });
                        gasLimit = estimated * 130n / 100n; // 30% buffer
                    } catch {
                        gasLimit = BigInt(tx.gas || tx.gasLimit || '300000');
                    }
                    const signedTx = await wallet.signTransaction({
                        to: tx.to, data: tx.data, value: BigInt(tx.value || '0'),
                        gasLimit,
                        gasPrice,
                        nonce: await provider.getTransactionCount(wallet.address, 'pending'),
                        chainId: chainIdNum
                    });
                    const broadcastResult = await onchainos.broadcastTransaction(signedTx, chainIndex, tw.address);
                    const result = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
                    txHashClose = result?.txHash || result?.orderId || null;
                    log.info(`Close position #${positionId} sell tx: ${txHashClose}`);
                }
            }
        }
        } // close paperMode else
    } catch (sellErr) {
        log.warn(`Close position #${positionId} sell swap error:`, sellErr.message);
        // Non-fatal: position still gets marked as closed in DB
    }
    if (!txHashClose) txHashClose = `0xclose_manual_${Date.now().toString(36)}_${positionId}`;

    await dbRun(
        `UPDATE auto_trading_positions SET 
            status = 'closed', closeType = ?, closePrice = ?, realizedPnlUsd = ?, realizedPnlPct = ?, 
            txHashClose = ?, closedAt = datetime('now') WHERE id = ?`,
        [closeType, finalClosePrice, pnlUsd, pnlPct, txHashClose, positionId]
    );

    // Update the linked trade plan
    await dbRun(
        `UPDATE auto_trading_plans SET 
            status = 'closed', currentPrice = ?, pnlUsd = ?, pnlPct = ?, 
            closedAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?`,
        [finalClosePrice, pnlUsd, pnlPct, pos.planId]
    );

    // Update user's aggregate PnL
    await dbRun(
        `UPDATE auto_trading_config SET 
            totalPnlUsd = totalPnlUsd + ?, currentPnlUsd = currentPnlUsd + ?, 
            updatedAt = datetime('now') WHERE userId = ?`,
        [pnlUsd, pnlUsd, userId]
    );

    // Remove from in-memory tracking
    const userPositions = activePositions.get(userId);
    if (userPositions) {
        const idx = userPositions.findIndex(p => p.id === positionId);
        if (idx >= 0) userPositions.splice(idx, 1);
        if (userPositions.length === 0) activePositions.delete(userId);
    }

    log.info(`Closed position #${positionId} [${closeType}]: ${pos.tokenSymbol} PnL: $${pnlUsd.toFixed(2)} (${pnlPct.toFixed(1)}%)`);

    return { success: true, positionId, closeType, pnlUsd, pnlPct, closePrice: finalClosePrice };
}

// ═══════════════════════════════════════════════
// BARRIER CONTROL (adapted from hummingbot)
// ═══════════════════════════════════════════════

/**
 * Check all barriers for a position — core logic from hummingbot's PositionExecutor.control_barriers
 */
function checkBarriers(position) {
    const entryPrice = Number(position.entryPrice);
    const currentPrice = Number(position.currentPrice);
    if (!entryPrice || !currentPrice) return null;

    // Calculate PnL %
    let pnlPct;
    if (position.side === 'buy') {
        pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
        pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    // 1. Stop-Loss barrier
    if (position.stopLossPct && pnlPct <= -position.stopLossPct) {
        return { type: 'STOP_LOSS', pnlPct };
    }

    // 2. Take-Profit barrier
    if (position.takeProfitPct && pnlPct >= position.takeProfitPct) {
        return { type: 'TAKE_PROFIT', pnlPct };
    }

    // 3. Trailing Stop barrier (adapted from hummingbot PositionExecutor.control_trailing_stop)
    if (position.trailingStopEnabled) {
        const activationPct = position.trailingStopActivation || 5;
        const trailingDelta = position.trailingStopDelta || 2;

        if (!position.trailingStopTrigger) {
            // Not yet activated — check if PnL exceeds activation threshold
            if (pnlPct > activationPct) {
                position.trailingStopTrigger = pnlPct - trailingDelta;
                log.info(`Trailing stop activated for position #${position.id}: trigger at ${position.trailingStopTrigger.toFixed(2)}%`);
            }
        } else {
            // Already activated — check if PnL dropped below trigger
            if (pnlPct < position.trailingStopTrigger) {
                return { type: 'TRAILING_STOP', pnlPct, trigger: position.trailingStopTrigger };
            }
            // Ratchet up: if PnL went higher, move trigger up
            const newTrigger = pnlPct - trailingDelta;
            if (newTrigger > position.trailingStopTrigger) {
                position.trailingStopTrigger = newTrigger;
            }
        }
    }

    // 4. Time Limit barrier
    if (position.timeLimitHours && position.timeLimitHours > 0) {
        const openedAt = position.openedAt || Date.now();
        const elapsed = (Date.now() - openedAt) / (1000 * 60 * 60);
        if (elapsed >= position.timeLimitHours) {
            return { type: 'TIME_LIMIT', pnlPct, elapsedHours: elapsed };
        }
    }

    return null; // No barrier triggered
}

// ═══════════════════════════════════════════════
// PRICE MONITORING
// ═══════════════════════════════════════════════

/**
 * Fetch current price for a token on a chain
 */
async function fetchCurrentPrice(chainIndex, tokenAddress) {
    try {
        const onchainos = require('../services/onchainos');
        const data = await onchainos.getTokenPrice(chainIndex, tokenAddress);
        if (data && data.price) return Number(data.price);
        if (data && Array.isArray(data) && data[0]?.price) return Number(data[0].price);
        return null;
    } catch (err) {
        log.warn(`Price fetch failed for ${tokenAddress}:`, err.message);
        return null;
    }
}

/**
 * Main monitoring loop — checks all active positions
 */
async function monitorPositions() {
    const { dbRun } = require('../../db/core');

    for (const [userId, positions] of activePositions.entries()) {
        for (const pos of [...positions]) { // copy array since we may modify it
            try {
                // Fetch fresh price
                const price = await fetchCurrentPrice(pos.chainIndex, pos.tokenAddress);
                if (price !== null && price > 0) {
                    pos.currentPrice = price;

                    // Update in DB periodically
                    await dbRun(
                        'UPDATE auto_trading_positions SET currentPrice = ?, lastCheckedAt = datetime(\'now\') WHERE id = ?',
                        [price, pos.id]
                    );
                }

                // Check barriers
                const trigger = checkBarriers(pos);
                if (trigger) {
                    log.info(`Barrier triggered for position #${pos.id}: ${trigger.type} (PnL: ${trigger.pnlPct.toFixed(2)}%)`);
                    await closePosition(userId, pos.id, trigger.type, pos.currentPrice);
                }

                // Update trailing stop trigger in DB if changed
                if (pos.trailingStopEnabled && pos.trailingStopTrigger !== null) {
                    await dbRun(
                        'UPDATE auto_trading_positions SET trailingStopTrigger = ? WHERE id = ?',
                        [pos.trailingStopTrigger, pos.id]
                    );
                }
            } catch (err) {
                log.warn(`Monitor error for position #${pos.id}:`, err.message);
            }
        }
    }
}

/**
 * Start the shared monitoring interval
 */
function startMonitor() {
    if (_monitorInterval) return;
    _monitorInterval = setInterval(monitorPositions, MONITOR_INTERVAL_MS);
    log.info('Position monitor started (every 30s)');
}

/**
 * Stop the shared monitoring interval
 */
function stopMonitor() {
    if (_monitorInterval) {
        clearInterval(_monitorInterval);
        _monitorInterval = null;
        log.info('Position monitor stopped');
    }
}

// ═══════════════════════════════════════════════
// RESTORE & QUERY
// ═══════════════════════════════════════════════

/**
 * Restore active positions from DB on startup
 */
async function restorePositions() {
    await initEngineDB();
    try {
        const { dbAll } = require('../../db/core');
        const rows = await dbAll("SELECT * FROM auto_trading_positions WHERE status = 'active'");
        if (!rows || rows.length === 0) return;

        for (const row of rows) {
            const userId = row.userId;
            if (!activePositions.has(userId)) {
                activePositions.set(userId, []);
            }
            activePositions.get(userId).push({
                id: row.id,
                planId: row.planId,
                tokenAddress: row.tokenAddress,
                tokenSymbol: row.tokenSymbol,
                chainIndex: row.chainIndex,
                side: row.side,
                entryPrice: Number(row.entryPrice),
                currentPrice: Number(row.currentPrice || row.entryPrice),
                amountUsd: Number(row.amountUsd),
                amountToken: Number(row.amountToken || 0),
                stopLossPct: Number(row.stopLossPct || 15),
                takeProfitPct: Number(row.takeProfitPct || 30),
                trailingStopEnabled: !!row.trailingStopEnabled,
                trailingStopActivation: Number(row.trailingStopActivation || 5),
                trailingStopDelta: Number(row.trailingStopDelta || 2),
                trailingStopTrigger: row.trailingStopTrigger ? Number(row.trailingStopTrigger) : null,
                timeLimitHours: Number(row.timeLimitHours || 0),
                openedAt: row.openedAt ? new Date(row.openedAt + 'Z').getTime() : Date.now()
            });
        }

        if (activePositions.size > 0) {
            startMonitor();
            log.info(`Restored ${rows.length} active positions for ${activePositions.size} users`);
        }
    } catch (err) {
        log.warn('restorePositions error:', err.message);
    }
}

/**
 * Get active positions for a user (for dashboard API)
 */
async function getActivePositions(userId) {
    await initEngineDB();
    const { dbAll } = require('../../db/core');
    const positions = await dbAll(
        'SELECT * FROM auto_trading_positions WHERE userId = ? ORDER BY openedAt DESC',
        [userId]
    );

    return (positions || []).map(p => {
        const entryPrice = Number(p.entryPrice);
        const currentPrice = Number(p.currentPrice || entryPrice);
        const amountUsd = Number(p.amountUsd);
        let pnlPct = 0;
        if (p.side === 'buy' && entryPrice > 0) {
            pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else if (p.side === 'sell' && entryPrice > 0) {
            pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;
        }
        const unrealizedPnlUsd = amountUsd * (pnlPct / 100);

        return {
            ...p,
            unrealizedPnlUsd: p.status === 'active' ? unrealizedPnlUsd : Number(p.realizedPnlUsd || 0),
            unrealizedPnlPct: p.status === 'active' ? pnlPct : Number(p.realizedPnlPct || 0),
        };
    });
}

/**
 * Manually close a position (user action from dashboard)
 */
async function manualClosePosition(userId, positionId) {
    return closePosition(userId, positionId, 'MANUAL');
}

module.exports = {
    initEngineDB,
    openPosition,
    closePosition,
    manualClosePosition,
    getActivePositions,
    restorePositions,
    startMonitor,
    stopMonitor,
    checkBarriers, // exported for testing
};
