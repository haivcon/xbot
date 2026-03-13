/**
 * Trade History Module — Portfolio P&L tracking
 * Records swap transactions for P&L analysis
 * File: db/tradeHistory.js
 */

const { dbRun, dbGet, dbAll } = require('./core');

// ─── Record a trade ───
async function recordTrade(userId, { chain = 'xlayer', fromToken, toToken, fromAmount, toAmount, priceUsd, txHash }) {
    await dbRun(
        `INSERT INTO trade_history (userId, chain, fromToken, toToken, fromAmount, toAmount, priceUsd, txHash, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(userId), chain, fromToken, toToken, String(fromAmount), String(toAmount), String(priceUsd || '0'), txHash || '', Date.now()]
    );
}

// ─── Get trade history for a user ───
async function getTradeHistory(userId, limit = 50) {
    return dbAll(
        'SELECT * FROM trade_history WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
        [String(userId), limit]
    );
}

// ─── Get trade history summary (grouped by token) ───
async function getTradeSummary(userId) {
    const trades = await getTradeHistory(userId, 500);
    const summary = {};
    for (const t of trades) {
        // Track buys (toToken) and sells (fromToken)
        if (t.toToken) {
            if (!summary[t.toToken]) summary[t.toToken] = { bought: 0, sold: 0, spent: 0, received: 0, trades: 0 };
            summary[t.toToken].bought += parseFloat(t.toAmount || 0);
            summary[t.toToken].spent += parseFloat(t.fromAmount || 0) * parseFloat(t.priceUsd || 0);
            summary[t.toToken].trades++;
        }
    }
    return summary;
}

module.exports = {
    recordTrade,
    getTradeHistory,
    getTradeSummary,
};
