/**
 * Smart Copy Tool Handlers
 * AI function calling handlers for Smart Copy Engine
 */
const logger = require('../../../core/logger');
const log = logger.child('SmartCopyTools');

module.exports = {
    /**
     * smart_copy — Manage smart copy-trading sessions
     */
    async smart_copy(args, context) {
        try {
            const smartCopy = require('../../smartCopyEngine');
            const lang = context?.lang || 'en';
            const action = (args.action || 'status').toLowerCase();
            const userId = String(context?.userId || context?.chatId || '');

            switch (action) {
                case 'start': {
                    const result = await smartCopy.startSession(userId, {
                        budgetUsd: args.budgetUsd,
                        maxPerTradeUsd: args.maxPerTradeUsd,
                        chainIndex: args.chainIndex || '196',
                        maxLeaders: args.maxLeaders || 5
                    });

                    if (!result.success) {
                        return `⚠️ ${result.error}`;
                    }

                    let card = `🐋 <b>Smart Copy Started!</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    card += `💰 Budget: $${result.budget}\n`;
                    card += `📊 Max per trade: $${result.maxPerTrade}\n`;
                    card += `👥 Tracking: ${result.trackedCount} leaders\n\n`;

                    card += `🏆 <b>Top Leaders</b>\n`;
                    for (const leader of (result.leaders || []).slice(0, 5)) {
                        card += `• <code>${leader.address.slice(0, 10)}...</code> — Score: ${leader.aiScore}% | Win: ${leader.winRate?.toFixed(1)}% | ${leader.tag}\n`;
                    }

                    card += `\n✅ Auto-copy is now active! I'll notify you when trades are copied.`;
                    return { displayMessage: card };
                }

                case 'stop': {
                    await smartCopy.stopSession(userId);
                    return { displayMessage: `🔴 <b>Smart Copy Stopped</b>\n━━━━━━━━━━━━━━━━━━\nCopy-trading session has been stopped.` };
                }

                case 'status': {
                    const status = await smartCopy.getSessionStatus(userId);
                    const stateEmoji = status.isActive ? '🟢' : '🔴';

                    let card = `🐋 <b>Smart Copy Status</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    card += `${stateEmoji} ${status.isActive ? 'Active' : 'Inactive'}${status.isPolling ? ' (Polling)' : ''}\n`;
                    card += `💰 Budget: $${status.budget} | Spent: $${status.spent?.toFixed(2)} | Left: $${status.remaining?.toFixed(2)}\n`;
                    card += `📋 Total copies: ${status.totalCopies}\n`;
                    card += `📈 PnL: $${status.totalPnl?.toFixed(2)}\n`;

                    if (status.recentTrades?.length > 0) {
                        card += `\n📋 <b>Recent Copy Trades</b>\n`;
                        for (const t of status.recentTrades.slice(0, 5)) {
                            const emoji = t.action === 'buy' ? '🟢' : '🔴';
                            card += `${emoji} ${t.tokenSymbol} $${Number(t.copyAmountUsd || 0).toFixed(2)} — from <code>${t.leaderAddress?.slice(0, 8)}...</code>\n`;
                        }
                    }

                    return { displayMessage: card };
                }

                case 'leaders':
                case 'leaderboard': {
                    const leaders = await smartCopy.getLeaderboard();
                    if (!leaders?.length) {
                        return lang === 'vi' ? '📭 Chưa có dữ liệu leaders. Thử bật Smart Copy để khám phá.' : '📭 No leaders data yet. Start Smart Copy to discover.';
                    }

                    let card = `🏆 <b>X Layer Top Traders</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    for (let i = 0; i < Math.min(leaders.length, 10); i++) {
                        const l = leaders[i];
                        const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;
                        card += `${medal} <code>${l.address.slice(0, 10)}...</code>\n`;
                        card += `   Score: ${l.aiScore}% | Win: ${l.winRate?.toFixed(1)}% | PnL: $${Number(l.totalPnlUsd || 0).toFixed(2)} | ${l.tag}\n`;
                    }

                    return { displayMessage: card };
                }

                case 'discover': {
                    const leaders = await smartCopy.discoverLeaders(args.chainIndex || '196');
                    if (!leaders?.length) {
                        return '📭 No traders found. Try again later.';
                    }
                    let card = `🔍 <b>Discovered ${leaders.length} Leaders on X Layer</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    for (const l of leaders.slice(0, 8)) {
                        card += `• <code>${l.address.slice(0, 10)}...</code> — ${l.tag} (Score: ${l.aiScore}%)\n`;
                    }
                    return { displayMessage: card };
                }

                default:
                    return '❓ Invalid action. Use: start, stop, status, leaders, discover';
            }
        } catch (err) {
            log.error('smart_copy error:', err);
            return `❌ Smart Copy error: ${err.message}`;
        }
    }
};
