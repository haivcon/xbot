/**
 * Swap Pollers — Limit Order Executor + Price Compare Notifier
 * Runs every 5 minutes via setInterval
 */
const log = require('../../../core/logger');

let _pollerStarted = false;

function startSwapPollers() {
    if (_pollerStarted) return;
    _pollerStarted = true;
    log.child('SwapPoller').info('Starting swap pollers (5m interval)');

    setInterval(async () => {
        try { await checkLimitOrders(); } catch (e) { log.child('SwapPoller').warn('Limit order check error:', e.message); }
        try { await checkPriceCompares(); } catch (e) { log.child('SwapPoller').warn('Price compare check error:', e.message); }
    }, 300000); // 5 minutes

    // Run once immediately after 30s startup delay
    setTimeout(async () => {
        try { await checkLimitOrders(); } catch(_) {}
        try { await checkPriceCompares(); } catch(_) {}
    }, 30000);
}

async function checkLimitOrders() {
    const { dbAll, dbRun } = require('../../../db/core');
    try {
        await dbRun("CREATE TABLE IF NOT EXISTS swap_limit_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, chatId TEXT, fromToken TEXT, toToken TEXT, fromSymbol TEXT, toSymbol TEXT, amount TEXT, targetPrice REAL, chainIndex TEXT DEFAULT '196', status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')))");
    } catch(_) { return; }
    
    const orders = await dbAll("SELECT * FROM swap_limit_orders WHERE status = 'active'");
    if (!orders || orders.length === 0) return;

    const onchainos = require('onchainos');
    let bot; try { bot = require('../../../core/bot').bot; } catch(_) { return; }

    for (const order of orders) {
        try {
            const priceData = await onchainos.getTokenPrice([{ chainIndex: order.chainIndex || '196', tokenContractAddress: order.toToken }]);
            const currentPrice = Number(priceData?.[0]?.price || priceData?.[0]?.tokenUnitPrice || 0);
            if (currentPrice <= 0) continue;

            const target = Number(order.targetPrice);
            // Execute if price reached target (either direction)
            const shouldExecute = currentPrice >= target;
            if (!shouldExecute) continue;

            log.child('SwapPoller').info(`Limit order #${order.id} triggered: ${order.fromSymbol} ➔ ${order.toSymbol} at $${currentPrice} (target $${target})`);

            // Mark as executing
            await dbRun("UPDATE swap_limit_orders SET status = 'executing' WHERE id = ?", [order.id]);

            // Execute the swap
            const tradingTools = require('./tradingTools');
            const result = await tradingTools.execute_swap({
                fromTokenAddress: order.fromToken,
                toTokenAddress: order.toToken,
                amount: order.amount,
                chainIndex: order.chainIndex || '196'
            }, { userId: order.userId, chatId: order.chatId });

            const success = result?.success !== false;
            await dbRun("UPDATE swap_limit_orders SET status = ? WHERE id = ?", [success ? 'executed' : 'failed', order.id]);

            if (bot && order.chatId) {
                let lang = 'en';
                try { const { getUserLanguage: gL } = require('../../../db/users'); const dl = await gL(String(order.userId)); if (dl) lang = dl; } catch(_) {}
                const lk = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
                const titles = { en: 'LIMIT ORDER EXECUTED', vi: 'LỆNH GIỚI HẠN ĐÃ THỰC HIỆN', zh: '限价单已执行', ko: '지정가 주문 실행됨', ru: 'ЛИМИТНЫЙ ОРДЕР ВЫПОЛНЕН', id: 'LIMIT ORDER DIEKSEKUSI' };
                let notifMsg = `📌 <b>${titles[lk]}</b>\n${order.fromSymbol} ➔ ${order.toSymbol}\n🎯 $${currentPrice} (target $${target})`;
                if (result?.displayMessage) notifMsg += '\n\n' + result.displayMessage;
                try { await bot.sendMessage(order.chatId, notifMsg, { parse_mode: 'HTML', disable_web_page_preview: true }); } catch(_) {}
            }
        } catch (orderErr) {
            log.child('SwapPoller').warn(`Limit order #${order.id} error:`, orderErr.message);
            try { const { dbRun: dR } = require('../../../db/core'); await dR("UPDATE swap_limit_orders SET status = 'error' WHERE id = ?", [order.id]); } catch(_) {}
        }
    }
}

async function checkPriceCompares() {
    const { dbAll, dbRun } = require('../../db/core');
    try {
        await dbRun("CREATE TABLE IF NOT EXISTS swap_price_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, chatId TEXT, tokenAddress TEXT, tokenSymbol TEXT, priceAtSwap REAL, chainIndex TEXT, checkAfter TEXT, status TEXT DEFAULT 'pending')");
    } catch(_) { return; }

    const now = new Date().toISOString();
    const checks = await dbAll("SELECT * FROM swap_price_checks WHERE status = 'pending' AND checkAfter <= ?", [now]);
    if (!checks || checks.length === 0) return;

    const onchainos = require('onchainos');
    let bot; try { bot = require('../../core/bot').bot; } catch(_) { return; }

    for (const check of checks) {
        try {
            await dbRun("UPDATE swap_price_checks SET status = 'done' WHERE id = ?", [check.id]);
            const priceData = await onchainos.getTokenPrice([{ chainIndex: check.chainIndex || '196', tokenContractAddress: check.tokenAddress }]);
            const newPrice = Number(priceData?.[0]?.price || priceData?.[0]?.tokenUnitPrice || 0);
            const oldPrice = Number(check.priceAtSwap || 0);
            if (newPrice <= 0 || oldPrice <= 0) continue;

            const change = ((newPrice - oldPrice) / oldPrice * 100).toFixed(2);
            const arrow = change >= 0 ? '📈' : '📉';

            let lang = 'en';
            try { const { getUserLanguage: gP } = require('../../../db/users'); const dp = await gP(String(check.userId)); if (dp) lang = dp; } catch(_) {}
            const lk = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
            const msgs = {
                en: `${arrow} <b>Price Update</b> (1h after swap)\n${check.tokenSymbol}: $${newPrice < 0.01 ? newPrice.toFixed(8) : newPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change}%)`,
                vi: `${arrow} <b>Cập nhật giá</b> (1h sau swap)\n${check.tokenSymbol}: $${newPrice < 0.01 ? newPrice.toFixed(8) : newPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change}%)`,
                zh: `${arrow} <b>价格变化</b>（兑换1小时后）\n${check.tokenSymbol}: $${newPrice < 0.01 ? newPrice.toFixed(8) : newPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change}%)`,
                ko: `${arrow} <b>가격 변동</b> (스왑 1시간 후)\n${check.tokenSymbol}: $${newPrice < 0.01 ? newPrice.toFixed(8) : newPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change}%)`,
                ru: `${arrow} <b>Изменение цены</b> (1ч после обмена)\n${check.tokenSymbol}: $${newPrice < 0.01 ? newPrice.toFixed(8) : newPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change}%)`,
                id: `${arrow} <b>Update Harga</b> (1j setelah swap)\n${check.tokenSymbol}: $${newPrice < 0.01 ? newPrice.toFixed(8) : newPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change}%)`
            };

            if (bot && check.chatId) {
                try { await bot.sendMessage(check.chatId, msgs[lk] || msgs.en, { parse_mode: 'HTML', disable_notification: true }); } catch(_) {}
            }
        } catch(_) {}
    }
}

module.exports = { startSwapPollers, checkLimitOrders, checkPriceCompares };
