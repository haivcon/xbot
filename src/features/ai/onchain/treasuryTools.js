/**
 * Treasury Governor Tool Handlers
 * AI function calling handlers for the Treasury Governor feature.
 * Exposes manage_treasury and treasury_status tools to the AI chat system.
 */
const logger = require('../../../core/logger');
const log = logger.child('TreasuryTools');

module.exports = {
    /**
     * manage_treasury — Full treasury management
     */
    async manage_treasury(args, context) {
        try {
            const treasury = require('../../treasuryGovernor');
            const lang = context?.lang || 'en';
            const action = (args.action || '').toLowerCase();
            const { BOT_OWNER_ID } = require('../../../config');
            const userId = String(context?.userId || '');

            // Only bot owner can start/stop/config the governor
            const isOwner = userId === String(BOT_OWNER_ID);

            switch (action) {
                case 'status': {
                    const status = await treasury.getStatus();
                    const stateEmoji = status.isRunning ? '🟢' : '🔴';
                    const modeLabel = status.config.mode === 'paper' ? '📝 Paper' : '🔴 LIVE';
                    let card = `🏦 <b>Treasury Governor</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    card += `${stateEmoji} State: <b>${status.state}</b> (${status.isRunning ? 'Running' : 'Stopped'})\n`;
                    card += `📋 Mode: ${modeLabel}\n`;
                    card += `🔑 Wallet: <code>${status.config.treasuryWallet?.slice(0, 10)}...${status.config.treasuryWallet?.slice(-4)}</code>\n`;
                    card += `⚙️ Risk: ${status.config.riskLevel} | Max: ${status.config.maxActionPct}%\n`;
                    card += `📊 Today: ${status.dailyActions} actions\n\n`;

                    // Stats
                    if (status.stats) {
                        card += `📈 <b>Statistics</b>\n`;
                        card += `• Total actions: ${status.stats.totalActions || 0}\n`;
                        card += `• Executed: ${status.stats.executedActions || 0}\n`;
                        card += `• Buy volume: $${Number(status.stats.totalBuyUsd || 0).toFixed(2)}\n`;
                        card += `• Sell volume: $${Number(status.stats.totalSellUsd || 0).toFixed(2)}\n`;
                        card += `• Total PnL: $${Number(status.stats.totalPnl || 0).toFixed(2)}\n\n`;
                    }

                    // Last cycle
                    if (status.lastCycle) {
                        const ago = Math.round((Date.now() - status.lastCycle.timestamp) / 60000);
                        card += `🕐 Last cycle: ${ago}min ago\n`;
                        card += `📌 Decision: ${status.lastCycle.decision?.action} (conf: ${status.lastCycle.decision?.confidence}%)\n`;
                    }

                    // Recent actions
                    if (status.recentActions?.length > 0) {
                        card += `\n📋 <b>Recent Actions</b>\n`;
                        for (const a of status.recentActions.slice(0, 5)) {
                            const emoji = a.action === 'BUY' ? '🟢' : a.action === 'SELL' ? '🔴' : '⏸️';
                            card += `${emoji} ${a.action} $${Number(a.amountUsd || 0).toFixed(2)} — ${a.reason?.slice(0, 60) || '?'}\n`;
                        }
                    }

                    return { displayMessage: card };
                }

                case 'start': {
                    if (!isOwner) return '❌ Only the bot owner can start the Treasury Governor.';
                    const config = await treasury.getConfig();
                    if (args.mode) await treasury.updateConfig({ mode: args.mode });
                    if (args.notifyGroupId) await treasury.updateConfig({ notifyGroupId: args.notifyGroupId });
                    await treasury.updateConfig({ enabled: 1 });
                    const result = await treasury.startGovernor();
                    if (result.success) {
                        return { displayMessage: `🟢 <b>Treasury Governor Started</b>\n━━━━━━━━━━━━━━━━━━\n📋 Mode: ${args.mode || config?.mode || 'paper'}\n⏱ Cycle: every 5 minutes\n🔔 Reports: ${args.notifyGroupId ? 'Enabled' : 'Disabled'}` };
                    }
                    return `⚠️ ${result.reason}`;
                }

                case 'stop': {
                    if (!isOwner) return '❌ Only the bot owner can stop the Treasury Governor.';
                    treasury.stopGovernor();
                    await treasury.updateConfig({ enabled: 0 });
                    return { displayMessage: `🔴 <b>Treasury Governor Stopped</b>\n━━━━━━━━━━━━━━━━━━\nThe governor will no longer make autonomous decisions.` };
                }

                case 'config': {
                    if (!isOwner) return '❌ Only the bot owner can configure the Treasury Governor.';
                    const updates = {};
                    if (args.mode) updates.mode = args.mode;
                    if (args.notifyGroupId) updates.notifyGroupId = args.notifyGroupId;
                    if (args.maxActionPct) updates.maxActionPct = Math.min(10, Math.max(1, Number(args.maxActionPct)));
                    if (args.riskLevel) updates.riskLevel = args.riskLevel;
                    await treasury.updateConfig(updates);
                    const newConfig = await treasury.getConfig();
                    return { displayMessage: `⚙️ <b>Treasury Config Updated</b>\n━━━━━━━━━━━━━━━━━━\n📋 Mode: ${newConfig?.mode}\n⚙️ Risk: ${newConfig?.riskLevel}\n📊 Max action: ${newConfig?.maxActionPct}%\n🔔 Notify: ${newConfig?.notifyGroupId || 'none'}` };
                }

                case 'history': {
                    const status = await treasury.getStatus();
                    if (!status.recentActions?.length) {
                        return lang === 'vi' ? '📭 Chưa có hành động nào.' : '📭 No treasury actions yet.';
                    }
                    let card = `📋 <b>Treasury Action History</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    for (const a of status.recentActions) {
                        const emoji = a.action === 'BUY' ? '🟢' : a.action === 'SELL' ? '🔴' : a.action === 'ADD_LP' ? '🌊' : '⏸️';
                        const modeTag = a.mode === 'paper' ? ' 📝' : '';
                        card += `${emoji} <b>${a.action}</b>${modeTag} — $${Number(a.amountUsd || 0).toFixed(2)}\n`;
                        card += `   📊 Score: ${a.aiScore || 0}% | ${a.status}\n`;
                        card += `   💬 ${a.reason?.slice(0, 80) || '?'}\n`;
                        card += `   🕐 ${a.createdAt}\n\n`;
                    }
                    return { displayMessage: card };
                }

                case 'run_cycle': {
                    if (!isOwner) return '❌ Only the bot owner can manually trigger a cycle.';
                    await treasury.runCycle();
                    const status = await treasury.getStatus();
                    if (status.lastCycle) {
                        return { displayMessage: `🔄 <b>Manual Cycle Complete</b>\n━━━━━━━━━━━━━━━━━━\n📌 Decision: ${status.lastCycle.decision?.action}\n📊 Confidence: ${status.lastCycle.decision?.confidence}%\n💬 ${status.lastCycle.decision?.reason}` };
                    }
                    return '✅ Cycle completed.';
                }

                default:
                    return lang === 'vi'
                        ? '❓ Action không hợp lệ. Dùng: status, start, stop, config, history, run_cycle'
                        : '❓ Invalid action. Use: status, start, stop, config, history, run_cycle';
            }
        } catch (err) {
            log.error('manage_treasury error:', err);
            return `❌ Treasury error: ${err.message}`;
        }
    },

    /**
     * treasury_status — Quick status check (alias)
     */
    async treasury_status(args, context) {
        return module.exports.manage_treasury({ action: 'status' }, context);
    }
};
