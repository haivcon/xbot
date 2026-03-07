/**
 * Scheduler Skill — Autonomous Cron Tasks for AI Agent
 * 
 * Allows the AI to schedule recurring tasks (price monitoring,
 * portfolio snapshots, alerts). Uses SQLite for persistent storage
 * so tasks survive bot restarts.
 */
const { dbRun, dbGet, dbAll } = require('../../../db/core');

// ═══════════════════════════════════════════════════════
// SQLite-backed Scheduled Tasks
// ═══════════════════════════════════════════════════════

let _tickInterval = null;

function generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function addScheduledTask({ userId, chatId, type, intervalMs, params = {}, lang = 'vi' }) {
    const id = generateTaskId();
    const now = Date.now();
    const clampedInterval = Math.max(intervalMs, 60000); // Minimum 1 minute
    const nextRunAt = now + clampedInterval;
    await dbRun(
        `INSERT INTO ai_scheduled_tasks (id, userId, chatId, type, intervalMs, nextRunAt, params, enabled, lang, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, String(userId), String(chatId), type, clampedInterval, nextRunAt, JSON.stringify(params), lang, now]
    );
    console.log(`[Scheduler] ➕ addScheduledTask: id=${id}, type=${type}, chatId=${chatId}, userId=${userId}, nextRunAt=${new Date(nextRunAt).toISOString()}`);
    return { id, userId, chatId, type, intervalMs: clampedInterval, nextRunAt, params, enabled: true, lang, createdAt: now };
}

async function removeScheduledTask(taskId) {
    const result = await dbRun(`DELETE FROM ai_scheduled_tasks WHERE id = ?`, [taskId]);
    return result.changes > 0;
}

async function getTasksForUser(userId) {
    const rows = await dbAll(`SELECT * FROM ai_scheduled_tasks WHERE userId = ? AND enabled = 1`, [String(userId)]);
    return rows.map(parseTaskRow);
}

async function getTasksForChat(chatId) {
    const rows = await dbAll(`SELECT * FROM ai_scheduled_tasks WHERE chatId = ? AND enabled = 1`, [String(chatId)]);
    return rows.map(parseTaskRow);
}

function parseTaskRow(row) {
    return {
        ...row,
        params: safeJsonParse(row.params, {}),
        enabled: row.enabled === 1
    };
}

function safeJsonParse(text, fallback) {
    if (!text) return fallback;
    try { return JSON.parse(text); } catch { return fallback; }
}

// ═══════════════════════════════════════════════════════
// Scheduler Tick — Runs every 30 seconds
// ═══════════════════════════════════════════════════════

/** @type {function|null} External callback for task execution */
let _onTaskDue = null;

function setTaskExecutor(callback) {
    _onTaskDue = callback;
    console.log('[Scheduler] ✅ Task executor SET, type:', typeof callback);
}

async function schedulerTick() {
    const now = Date.now();
    try {
        // Get all due tasks from SQLite
        const dueTasks = await dbAll(
            `SELECT * FROM ai_scheduled_tasks WHERE nextRunAt <= ? AND enabled = 1`,
            [now]
        );

        if (dueTasks.length === 0) return;

        console.log(`[Scheduler] Tick: ${dueTasks.length} tasks due, executor: ${typeof _onTaskDue}`);

        for (const row of dueTasks) {
            const task = parseTaskRow(row);
            console.log(`[Scheduler] 🔥 FIRING task ${task.id} (${task.type}), chatId: ${task.chatId}, userId: ${task.userId}`);

            try {
                if (_onTaskDue) {
                    await _onTaskDue(task);
                    console.log(`[Scheduler] ✅ Task ${task.id} executed successfully`);
                } else {
                    console.log(`[Scheduler] ⚠️ No executor set, skipping task ${task.id}`);
                }
            } catch (error) {
                console.error(`[Scheduler] ❌ Task ${task.id} (${task.type}) failed:`, error.message);
            }

            // Update next run time or delete if one-shot
            if (task.params?.oneShot) {
                await dbRun(`DELETE FROM ai_scheduled_tasks WHERE id = ?`, [task.id]);
                console.log(`[Scheduler] 🗑️ Deleted one-shot task ${task.id}`);
            } else {
                const nextRunAt = now + task.intervalMs;
                await dbRun(
                    `UPDATE ai_scheduled_tasks SET nextRunAt = ?, lastPrice = ?, lastTotalUsd = ? WHERE id = ?`,
                    [nextRunAt, task.lastPrice || null, task.lastTotalUsd || null, task.id]
                );
            }
        }
    } catch (error) {
        console.error(`[Scheduler] ❌ Tick error:`, error.message);
    }
}

function startScheduler() {
    if (_tickInterval) return;
    _tickInterval = setInterval(schedulerTick, 30000); // Every 30 seconds
    console.log('[Scheduler] ⏰ Started autonomous scheduler (30s tick)');
}

function stopScheduler() {
    if (_tickInterval) {
        clearInterval(_tickInterval);
        _tickInterval = null;
    }
}

// ═══════════════════════════════════════════════════════
// AI Tools — Allow AI to manage scheduled tasks
// ═══════════════════════════════════════════════════════

const SCHEDULER_TOOLS = [{
    functionDeclarations: [
        {
            name: 'schedule_price_watch',
            description: 'Schedule automatic price monitoring for a token. The bot will check the price at regular intervals and notify if significant changes occur. Notifications will be sent as DM (private message).',
            parameters: {
                type: 'object',
                properties: {
                    token: { type: 'string', description: 'Token symbol or contract address to monitor' },
                    chain_index: { type: 'string', description: 'Chain ID (e.g., 196 for X Layer, 1 for ETH, 56 for BSC)' },
                    interval_minutes: { type: 'number', description: 'Check interval in minutes (min: 5, default: 30)' },
                    threshold_percent: { type: 'number', description: 'Alert threshold: notify if price changes by this percent (default: 5)' }
                },
                required: ['token']
            }
        },
        {
            name: 'schedule_portfolio_snapshot',
            description: 'Schedule automatic portfolio value snapshots. The bot will record your wallet total value at regular intervals for tracking gains/losses.',
            parameters: {
                type: 'object',
                properties: {
                    wallet_address: { type: 'string', description: 'Wallet address to monitor' },
                    chain_index: { type: 'string', description: 'Chain ID (default: 196 for X Layer)' },
                    interval_hours: { type: 'number', description: 'Snapshot interval in hours (min: 1, default: 6)' }
                },
                required: ['wallet_address']
            }
        },
        {
            name: 'set_reminder',
            description: 'Set a custom AI reminder that will be sent as a private message (DM) at the specified time.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Reminder message' },
                    delay_minutes: { type: 'number', description: 'Send reminder after this many minutes from now (min: 1)' }
                },
                required: ['message', 'delay_minutes']
            }
        },
        {
            name: 'list_scheduled_tasks',
            description: 'List all active scheduled tasks (price watches, snapshots, reminders) for the current user.',
            parameters: { type: 'object', properties: {} }
        },
        {
            name: 'cancel_scheduled_task',
            description: 'Cancel a specific scheduled task by its ID.',
            parameters: {
                type: 'object',
                properties: {
                    task_id: { type: 'string', description: 'The task ID to cancel (format: task_xxx)' }
                },
                required: ['task_id']
            }
        }
    ]
}];

// ═══════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════

const schedulerHandlers = {
    async schedule_price_watch(args, context) {
        const intervalMs = Math.max((args.interval_minutes || 30), 5) * 60 * 1000;
        const lang = context?.lang || 'vi';
        const task = await addScheduledTask({
            userId: context?.userId,
            chatId: context?.chatId,
            type: 'price_watch',
            intervalMs,
            lang,
            params: {
                token: args.token,
                chainIndex: args.chain_index || '196',
                thresholdPercent: args.threshold_percent || 5,
                lastPrice: null
            }
        });
        const nextRun = new Date(task.nextRunAt);
        const pad = n => String(n).padStart(2, '0');
        const utc7 = new Date(nextRun.getTime() + 7 * 3600000);
        const nextStr = `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
        return `✅ Đã lên lịch theo dõi giá!\n━━━━━━━━━━━━━━━━━━\n🪙 Token: ${args.token}\n⏱ Chu kỳ: mỗi ${Math.round(intervalMs / 60000)} phút\n📊 Ngưỡng cảnh báo: ±${args.threshold_percent || 5}%\n⏭ Kiểm tra đầu tiên: ${nextStr}\n📬 Thông báo: gửi tin nhắn riêng (DM)\n🆔 Task ID: \`${task.id}\`\n\n💡 Bot sẽ tự động cảnh báo khi giá thay đổi vượt ngưỡng.\nDùng "xem task" để xem danh sách hoặc "hủy task ${task.id}" để dừng.`;
    },

    async schedule_portfolio_snapshot(args, context) {
        const intervalMs = Math.max((args.interval_hours || 6), 1) * 3600 * 1000;
        const lang = context?.lang || 'vi';
        const task = await addScheduledTask({
            userId: context?.userId,
            chatId: context?.chatId,
            type: 'portfolio_snapshot',
            intervalMs,
            lang,
            params: {
                walletAddress: args.wallet_address,
                chainIndex: args.chain_index || '196',
                snapshots: []
            }
        });
        const nextRun = new Date(task.nextRunAt);
        const pad = n => String(n).padStart(2, '0');
        const utc7 = new Date(nextRun.getTime() + 7 * 3600000);
        const nextStr = `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
        return `✅ Đã lên lịch snapshot portfolio!\n━━━━━━━━━━━━━━━━━━\n👛 Ví: ${args.wallet_address.slice(0, 6)}...${args.wallet_address.slice(-4)}\n⏱ Chu kỳ: mỗi ${Math.round(intervalMs / 3600000)} giờ\n⏭ Snapshot đầu tiên: ${nextStr}\n📬 Thông báo: gửi tin nhắn riêng (DM)\n🆔 Task ID: \`${task.id}\`\n\n💡 Bot sẽ tự động ghi nhận giá trị ví và so sánh với lần trước.`;
    },

    async set_reminder(args, context) {
        // Allow decimals for minutes (e.g. 0.166 mins = 10s) 
        // We will default to 5 mins if not provided, but allow down to 10 seconds.
        const providedDelay = parseFloat(args.delay_minutes);
        const delayMs = Math.max((isNaN(providedDelay) ? 5 : providedDelay), 10 / 60) * 60 * 1000;
        const lang = context?.lang || 'vi';
        const task = await addScheduledTask({
            userId: context?.userId,
            chatId: context?.userId, // DM: send to userId (private chat)
            type: 'custom_reminder',
            intervalMs: delayMs,
            lang,
            params: {
                message: args.message,
                oneShot: true
            }
        });
        const fireAt = new Date(Date.now() + delayMs);
        const pad = n => String(n).padStart(2, '0');
        const utc7 = new Date(fireAt.getTime() + 7 * 3600000);
        const fireStr = `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())}:${pad(utc7.getUTCSeconds())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
        return `⏰ Đã đặt nhắc nhở!\n━━━━━━━━━━━━━━━━━━\n💬 "${args.message}"\n🕐 Sẽ nhắc lúc: ${fireStr} (sau ${args.delay_minutes < 1 ? '1' : args.delay_minutes} phút)\n📬 Thông báo: gửi tin nhắn riêng (DM)\n🆔 Task ID: \`${task.id}\`\n\n💡 Nhắc nhở sẽ tự hủy sau khi gửi xong.`;
    },

    async list_scheduled_tasks(args, context) {
        const tasks = await getTasksForUser(context?.userId);
        if (tasks.length === 0) {
            return `📋 Chưa có tác vụ nào đang chạy.\n\n━━ 📖 Hướng dẫn sử dụng ━━\n\n📊 **Theo dõi giá token:**\n• "Theo dõi giá OKB mỗi 15 phút"\n• "Watch ETH price every 30 min"\n• "Cảnh báo nếu BTC thay đổi 5%"\n\n💼 **Snapshot portfolio:**\n• "Snapshot ví tôi mỗi 6 tiếng"\n• "Theo dõi ví 0x1234... mỗi 2h"\n\n⏰ **Nhắc nhở:**\n• "Nhắc tôi sau 30 phút check BANMAO"\n• "Nhắc tôi sau 1 tiếng"\n• "Remind me in 10 min"\n\n📋 **Quản lý task:**\n• "Xem danh sách task"\n• "Hủy task task_abc123"`;
        }

        const pad = n => String(n).padStart(2, '0');
        const lines = [`📋 Danh sách tác vụ (${tasks.length}):\n`];
        for (const task of tasks) {
            const nextRun = new Date(task.nextRunAt);
            const utc7 = new Date(nextRun.getTime() + 7 * 3600000);
            const nextStr = `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
            const typeLabel = task.type === 'price_watch' ? '📊 Theo dõi giá'
                : task.type === 'portfolio_snapshot' ? '💼 Snapshot'
                    : '⏰ Nhắc nhở';
            lines.push(`${typeLabel}\n  🆔 [ID] \`${task.id}\`\n  ⏭ Chạy lúc: ${nextStr}\n  ⏱ Chu kỳ: ${Math.round(task.intervalMs / 60000)} phút\n`);
        }
        lines.push(`💡 Dùng "hủy task [ID]" để dừng tác vụ.`);
        return lines.join('\n');
    },

    async cancel_scheduled_task(args, context) {
        const taskId = args.task_id;
        if (!taskId) return '❌ Vui lòng cung cấp Task ID cần hủy.';
        const task = await dbGet(`SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ?`, [taskId, String(context?.userId)]);
        if (!task) return `❌ Không tìm thấy task \`${taskId}\` hoặc bạn không có quyền hủy task này.`;
        await removeScheduledTask(taskId);
        return `✅ Đã hủy task \`${taskId}\` thành công!`;
    }
};

// ═══════════════════════════════════════════════════════
// Skill Export
// ═══════════════════════════════════════════════════════

const SCHEDULER_SYSTEM_PROMPT = `
[STRICT MANDATE FOR SCHEDULER TOOLS]
If the user asks to "nhắc", "theo dõi", "giám sát", "cảnh báo", "watch", "monitor", "track", "remind", or "schedule":
1. You MUST immediately CALL the relevant scheduler tool (schedule_price_watch, set_reminder, etc.).
2. You MUST NOT just reply with text explaining what you can do.
3. You MUST NOT copy these instructions into your response.
4. Tell the user you have scheduled it successfully, and provide the task ID.`;

module.exports = {
    name: 'scheduler',
    description: 'Autonomous task scheduler — price watches, portfolio snapshots, reminders',
    enabled: true,
    tools: SCHEDULER_TOOLS,
    handlers: schedulerHandlers,
    systemPrompt: SCHEDULER_SYSTEM_PROMPT,

    // Expose internals for integration
    startScheduler,
    stopScheduler,
    setTaskExecutor,
    getTasksForUser,
    getTasksForChat,
    addScheduledTask,
    removeScheduledTask,
    // DB update helper for task executor
    async updateTaskState(taskId, updates) {
        const sets = [];
        const vals = [];
        if (updates.lastPrice !== undefined) { sets.push('lastPrice = ?'); vals.push(updates.lastPrice); }
        if (updates.lastTotalUsd !== undefined) { sets.push('lastTotalUsd = ?'); vals.push(updates.lastTotalUsd); }
        if (sets.length === 0) return;
        vals.push(taskId);
        await dbRun(`UPDATE ai_scheduled_tasks SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
};
