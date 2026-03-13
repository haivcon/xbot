/**
 * Trade History Module — Portfolio P&L tracking
 * Uses the unified swap_history table (single source of truth)
 * File: db/tradeHistory.js
 */

const { dbRun, dbGet, dbAll } = require('./core');

// ─── Ensure priceUsd column exists (migration-safe) ───
let _migrated = false;
async function ensurePriceColumn() {
    if (_migrated) return;
    try {
        await dbRun(`ALTER TABLE swap_history ADD COLUMN priceUsd TEXT DEFAULT '0'`);
    } catch (_) { /* column already exists */ }
    _migrated = true;
}

// ─── Get trade history for a user ───
async function getTradeHistory(userId, limit = 50) {
    await ensurePriceColumn();
    return dbAll(
        'SELECT * FROM swap_history WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
        [String(userId), limit]
    );
}

// ─── Get trade history summary (grouped by token) ───
async function getTradeSummary(userId) {
    const trades = await getTradeHistory(userId, 500);
    const summary = {};
    for (const t of trades) {
        if (t.status === 'reverted') continue; // skip failed swaps
        const key = t.toToken || t.toSymbol;
        if (!key) continue;
        if (!summary[key]) summary[key] = { symbol: t.toSymbol || '?', bought: 0, sold: 0, spent: 0, received: 0, trades: 0 };
        summary[key].bought += parseFloat(t.toAmount || 0);
        summary[key].spent += parseFloat(t.fromAmount || 0) * parseFloat(t.priceUsd || 0);
        summary[key].trades++;
    }
    return summary;
}

module.exports = {
    ensurePriceColumn,
    getTradeHistory,
    getTradeSummary,
};
