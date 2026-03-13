/**
 * Scheduled Reports Runner
 * Checks for due reports every hour and executes them
 * File: src/features/scheduledReportsRunner.js
 */

const log = require('../core/logger').child('ReportsRunner');

let _started = false;
let _interval = null;

function startReportsRunner() {
    if (_started) return;
    _started = true;
    log.info('Starting scheduled reports runner (1h interval)');

    // Run every hour
    _interval = setInterval(() => runDueReports(), 3600_000);

    // First run after 60s startup delay
    setTimeout(() => runDueReports(), 60_000);
}

function stopReportsRunner() {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
    _started = false;
}

async function runDueReports() {
    try {
        const { getDueReports, markReportRun } = require('../../db/scheduledReports');
        const reports = await getDueReports();
        if (!reports || reports.length === 0) return;

        log.info(`Found ${reports.length} due report(s)`);

        for (const report of reports) {
            try {
                // Check if this report should run now based on frequency and time
                const now = new Date();
                const [hour, min] = (report.time || '09:00').split(':').map(Number);
                const currentHour = now.getHours();

                // Only run if we're within the scheduled hour window
                if (Math.abs(currentHour - hour) > 1) continue;

                // Check frequency
                if (report.frequency === 'weekly') {
                    const dayOfWeek = now.getDay(); // 0=Sunday
                    if (dayOfWeek !== 1) continue; // Only run on Monday
                }

                log.info(`Executing report #${report.id} (type: ${report.type}, freq: ${report.frequency}) for user ${report.userId}`);

                // Generate report content based on type
                let content = '';
                switch (report.type) {
                    case 'portfolio': {
                        const { getTradeHistory } = require('../../db/tradeHistory');
                        const trades = await getTradeHistory(report.userId, 20);
                        if (trades.length === 0) {
                            content = '📊 Portfolio Report: No trades recorded yet.';
                        } else {
                            content = `📊 Portfolio Report (${trades.length} recent trades)\n`;
                            for (const t of trades.slice(0, 5)) {
                                content += `• ${t.fromSymbol} → ${t.toSymbol} | ${t.fromAmount} | ${t.status} | ${t.createdAt}\n`;
                            }
                        }
                        break;
                    }
                    case 'signals':
                        content = '📡 Signal Report: Check latest signals at /signals command.';
                        break;
                    case 'price':
                        content = '💰 Price Report: Use /price command for latest token prices.';
                        break;
                    default:
                        content = `📋 Scheduled Report (${report.type}): Generated at ${now.toISOString()}`;
                }

                // Try to send via Telegram bot
                try {
                    const { bot } = require('../core/bot');
                    await bot.sendMessage(report.userId, content, { parse_mode: 'HTML', disable_web_page_preview: true });
                } catch (sendErr) {
                    log.warn(`Failed to send report #${report.id} to user ${report.userId}:`, sendErr.message);
                }

                // Mark as run
                await markReportRun(report.id);
                log.info(`Report #${report.id} executed successfully`);
            } catch (reportErr) {
                log.warn(`Report #${report.id} execution failed:`, reportErr.message);
            }
        }
    } catch (err) {
        log.warn('Reports runner error:', err.message);
    }
}

module.exports = { startReportsRunner, stopReportsRunner };
