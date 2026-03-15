/**
 * Smart Order Executor — VWAP + DCA Strategies
 * Adapted from hummingbot's simple_vwap.py and DCAExecutor
 *
 * VWAP: Split large orders into smaller chunks over time to reduce market impact
 * DCA: Dollar Cost Averaging with multiple entry levels at different prices
 */
const logger = require('../core/logger');
const log = logger.child('SmartExecutor');

// Active VWAP/DCA executions (userId:planId -> execution state)
const activeExecutions = new Map();

// ═══════════════════════════════════════════════
// VWAP EXECUTOR
// Adapted from hummingbot simple_vwap.py
// ═══════════════════════════════════════════════

/**
 * VWAP order splitting — splits a large order into smaller chunks
 * executed over time to minimize market impact.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.planId
 * @param {string} params.chainIndex
 * @param {string} params.tokenAddress
 * @param {string} params.tokenSymbol
 * @param {number} params.totalAmountUsd — total USD to spend
 * @param {number} params.chunks — number of chunks (default: 3)
 * @param {number} params.intervalMs — delay between chunks in ms (default: 30000)
 * @param {string} params.action — 'buy' or 'sell'
 */
function startVwapExecution(params) {
    const {
        userId, planId, chainIndex, tokenAddress, tokenSymbol,
        totalAmountUsd, chunks = 3, intervalMs = 30000, action = 'buy'
    } = params;

    const chunkSize = totalAmountUsd / chunks;
    const executionId = `${userId}:${planId}`;

    if (activeExecutions.has(executionId)) {
        return { success: false, error: 'Execution already in progress' };
    }

    const state = {
        type: 'vwap',
        userId,
        planId,
        chainIndex,
        tokenAddress,
        tokenSymbol,
        action,
        totalAmountUsd,
        chunkSize,
        totalChunks: chunks,
        executedChunks: 0,
        intervalMs,
        executedAmountUsd: 0,
        weightedPriceSum: 0,
        vwapPrice: 0,
        status: 'running',
        startedAt: Date.now(),
        intervalHandle: null,
        results: []
    };

    // Execute chunks at intervals
    const executeChunk = async () => {
        if (state.executedChunks >= state.totalChunks || state.status === 'cancelled') {
            clearInterval(state.intervalHandle);
            state.status = state.executedChunks >= state.totalChunks ? 'completed' : 'cancelled';
            activeExecutions.delete(executionId);
            log.info(`VWAP ${state.status}: ${tokenSymbol} ${state.executedChunks}/${state.totalChunks} chunks, VWAP: $${state.vwapPrice.toPrecision(6)}`);

            // Update plan with final VWAP price
            try {
                const { dbRun } = require('../../db/core');
                await dbRun(
                    "UPDATE auto_trading_plans SET currentPrice = ?, executedPrice = ?, updatedAt = datetime('now') WHERE id = ?",
                    [state.vwapPrice, state.vwapPrice, planId]
                );
            } catch (e) { log.warn('VWAP final update error:', e.message); }
            return;
        }

        try {
            // BETA: Simulate price fetch and execution
            let currentPrice = 0;
            try {
                const onchainos = require('../services/onchainos');
                const data = await onchainos.getMarketPrice([{
                    chainIndex: chainIndex,
                    tokenContractAddress: tokenAddress
                }]);
                if (data && Array.isArray(data) && data[0]?.price) {
                    currentPrice = Number(data[0].price);
                }
            } catch (priceErr) {
                log.warn(`VWAP price fetch error chunk ${state.executedChunks + 1}:`, priceErr.message);
            }

            // Simulate execution
            const txHash = `0xvwap_${Date.now().toString(36)}_${planId}_${state.executedChunks}`;
            state.executedChunks++;
            state.executedAmountUsd += chunkSize;

            if (currentPrice > 0) {
                state.weightedPriceSum += currentPrice * chunkSize;
                state.vwapPrice = state.weightedPriceSum / state.executedAmountUsd;
            }

            state.results.push({
                chunk: state.executedChunks,
                amountUsd: chunkSize,
                price: currentPrice,
                txHash,
                timestamp: Date.now()
            });

            log.info(`VWAP chunk ${state.executedChunks}/${state.totalChunks}: ${tokenSymbol} $${chunkSize.toFixed(2)} @ $${currentPrice.toPrecision(6)}`);

            // Log to DB
            try {
                const { dbRun } = require('../../db/core');
                await dbRun(
                    'INSERT INTO auto_trading_log (userId, tokenAddress, tokenSymbol, chainIndex, action, amount, txHash, status) VALUES (?,?,?,?,?,?,?,?)',
                    [userId, tokenAddress, tokenSymbol, chainIndex, `${action}_vwap_${state.executedChunks}`, String(chunkSize), txHash, 'executed']
                );
            } catch (e) { log.warn('VWAP log error:', e.message); }

        } catch (err) {
            log.error(`VWAP chunk ${state.executedChunks + 1} error:`, err.message);
            state.results.push({ chunk: state.executedChunks + 1, error: err.message, timestamp: Date.now() });
        }
    };

    // Execute first chunk immediately, then at intervals
    executeChunk();
    state.intervalHandle = setInterval(executeChunk, intervalMs);
    activeExecutions.set(executionId, state);

    log.info(`Started VWAP: ${tokenSymbol} $${totalAmountUsd} in ${chunks} chunks every ${intervalMs / 1000}s`);

    return {
        success: true,
        executionId,
        type: 'vwap',
        totalAmountUsd,
        chunks,
        chunkSize,
        intervalMs
    };
}

// ═══════════════════════════════════════════════
// DCA EXECUTOR
// Adapted from hummingbot DCAExecutor
// ═══════════════════════════════════════════════

/**
 * DCA multi-level executor — sets up buy levels at different price dips
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.planId
 * @param {string} params.chainIndex
 * @param {string} params.tokenAddress
 * @param {string} params.tokenSymbol
 * @param {number} params.entryPrice — current/entry price
 * @param {number} params.totalAmountUsd
 * @param {Array<number>} params.levels — price dip percentages (e.g. [0, -3, -6, -10])
 * @param {Array<number>} params.weights — relative weight per level (e.g. [0.2, 0.3, 0.3, 0.2])
 * @param {number} params.checkIntervalMs — how often to check price (default: 60000)
 * @param {number} params.maxDurationMs — max execution time (default: 4h)
 */
function startDcaExecution(params) {
    const {
        userId, planId, chainIndex, tokenAddress, tokenSymbol,
        entryPrice, totalAmountUsd,
        levels = [0, -3, -6, -10],
        weights = [0.25, 0.25, 0.25, 0.25],
        checkIntervalMs = 60000,
        maxDurationMs = 4 * 60 * 60 * 1000
    } = params;

    const executionId = `${userId}:${planId}`;

    if (activeExecutions.has(executionId)) {
        return { success: false, error: 'Execution already in progress' };
    }

    // Create DCA levels
    const dcaLevels = levels.map((dip, i) => ({
        level: i + 1,
        priceTarget: entryPrice * (1 + dip / 100),
        amountUsd: totalAmountUsd * (weights[i] || 1 / levels.length),
        executed: false,
        txHash: null,
        executedAt: null,
        executedPrice: null
    }));

    const state = {
        type: 'dca',
        userId,
        planId,
        chainIndex,
        tokenAddress,
        tokenSymbol,
        entryPrice,
        totalAmountUsd,
        dcaLevels,
        executedLevels: 0,
        totalExecutedUsd: 0,
        avgEntryPrice: 0,
        weightedPriceSum: 0,
        status: 'running',
        startedAt: Date.now(),
        maxDurationMs,
        intervalHandle: null
    };

    const checkPriceAndExecute = async () => {
        // Time limit check
        if (Date.now() - state.startedAt > maxDurationMs) {
            clearInterval(state.intervalHandle);
            state.status = 'expired';
            activeExecutions.delete(executionId);
            log.info(`DCA expired: ${tokenSymbol} — ${state.executedLevels}/${dcaLevels.length} levels executed`);
            return;
        }

        if (state.status === 'cancelled') {
            clearInterval(state.intervalHandle);
            activeExecutions.delete(executionId);
            return;
        }

        // All levels executed
        if (state.executedLevels >= dcaLevels.length) {
            clearInterval(state.intervalHandle);
            state.status = 'completed';
            activeExecutions.delete(executionId);
            log.info(`DCA completed: ${tokenSymbol} avg entry $${state.avgEntryPrice.toPrecision(6)}`);
            return;
        }

        try {
            // Fetch current price
            let currentPrice = 0;
            try {
                const onchainos = require('../services/onchainos');
                const data = await onchainos.getMarketPrice([{
                    chainIndex: chainIndex,
                    tokenContractAddress: tokenAddress
                }]);
                if (data && Array.isArray(data) && data[0]?.price) {
                    currentPrice = Number(data[0].price);
                }
            } catch (priceErr) {
                return; // Skip this check if price fetch fails
            }

            if (currentPrice <= 0) return;

            // Check each unexecuted level
            for (const level of dcaLevels) {
                if (level.executed) continue;
                if (currentPrice <= level.priceTarget) {
                    // Execute this DCA level
                    level.executed = true;
                    level.executedPrice = currentPrice;
                    level.executedAt = Date.now();
                    level.txHash = `0xdca_${Date.now().toString(36)}_${planId}_L${level.level}`;

                    state.executedLevels++;
                    state.totalExecutedUsd += level.amountUsd;
                    state.weightedPriceSum += currentPrice * level.amountUsd;
                    state.avgEntryPrice = state.weightedPriceSum / state.totalExecutedUsd;

                    log.info(`DCA L${level.level}: ${tokenSymbol} $${level.amountUsd.toFixed(2)} @ $${currentPrice.toPrecision(6)} (target: $${level.priceTarget.toPrecision(6)})`);

                    // Log to DB
                    try {
                        const { dbRun } = require('../../db/core');
                        await dbRun(
                            'INSERT INTO auto_trading_log (userId, tokenAddress, tokenSymbol, chainIndex, action, amount, txHash, status) VALUES (?,?,?,?,?,?,?,?)',
                            [userId, tokenAddress, tokenSymbol, chainIndex, `buy_dca_L${level.level}`, String(level.amountUsd), level.txHash, 'executed']
                        );
                    } catch (e) { log.warn('DCA log error:', e.message); }
                }
            }
        } catch (err) {
            log.warn(`DCA check error:`, err.message);
        }
    };

    // Execute first check immediately
    checkPriceAndExecute();
    state.intervalHandle = setInterval(checkPriceAndExecute, checkIntervalMs);
    activeExecutions.set(executionId, state);

    log.info(`Started DCA: ${tokenSymbol} $${totalAmountUsd} in ${levels.length} levels at ${levels.join(',')}%`);

    return {
        success: true,
        executionId,
        type: 'dca',
        totalAmountUsd,
        levels: dcaLevels.map(l => ({
            level: l.level,
            priceTarget: l.priceTarget,
            amountUsd: l.amountUsd
        }))
    };
}

// ═══════════════════════════════════════════════
// MANAGEMENT
// ═══════════════════════════════════════════════

/**
 * Cancel an active execution
 */
function cancelExecution(userId, planId) {
    const executionId = `${userId}:${planId}`;
    const exec = activeExecutions.get(executionId);
    if (!exec) return { success: false, error: 'No active execution found' };

    exec.status = 'cancelled';
    if (exec.intervalHandle) clearInterval(exec.intervalHandle);
    activeExecutions.delete(executionId);
    log.info(`Cancelled ${exec.type} execution for ${exec.tokenSymbol}`);

    return { success: true, type: exec.type, executedChunks: exec.executedChunks || exec.executedLevels || 0 };
}

/**
 * Get status of an active execution
 */
function getExecutionStatus(userId, planId) {
    const executionId = `${userId}:${planId}`;
    const exec = activeExecutions.get(executionId);
    if (!exec) return null;

    if (exec.type === 'vwap') {
        return {
            type: 'vwap',
            status: exec.status,
            tokenSymbol: exec.tokenSymbol,
            totalAmountUsd: exec.totalAmountUsd,
            executedAmountUsd: exec.executedAmountUsd,
            executedChunks: exec.executedChunks,
            totalChunks: exec.totalChunks,
            vwapPrice: exec.vwapPrice,
            elapsed: Date.now() - exec.startedAt,
            results: exec.results
        };
    }

    if (exec.type === 'dca') {
        return {
            type: 'dca',
            status: exec.status,
            tokenSymbol: exec.tokenSymbol,
            totalAmountUsd: exec.totalAmountUsd,
            totalExecutedUsd: exec.totalExecutedUsd,
            executedLevels: exec.executedLevels,
            totalLevels: exec.dcaLevels.length,
            avgEntryPrice: exec.avgEntryPrice,
            levels: exec.dcaLevels.map(l => ({
                level: l.level,
                priceTarget: l.priceTarget,
                amountUsd: l.amountUsd,
                executed: l.executed,
                executedPrice: l.executedPrice
            })),
            elapsed: Date.now() - exec.startedAt
        };
    }

    return null;
}

/**
 * List all active executions for a user
 */
function listActiveExecutions(userId) {
    const results = [];
    for (const [key, exec] of activeExecutions.entries()) {
        if (exec.userId === userId) {
            results.push(getExecutionStatus(exec.userId, exec.planId));
        }
    }
    return results;
}

module.exports = {
    startVwapExecution,
    startDcaExecution,
    cancelExecution,
    getExecutionStatus,
    listActiveExecutions,
};
