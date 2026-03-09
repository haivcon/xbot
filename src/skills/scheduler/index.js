/**
 * Scheduler Skill — Autonomous Cron Tasks for AI Agent
 * 
 * Allows the AI to schedule recurring tasks (price monitoring,
 * portfolio snapshots, alerts). Uses SQLite for persistent storage
 * so tasks survive bot restarts.
 */
const { dbRun, dbGet, dbAll } = require('../../../db/core');

const logger = require('../../core/logger');
const log = logger.child('Scheduler');
// ═══════════════════════════════════════════════════════
// Inline i18n for scheduler responses (vi/en/zh)
// ═══════════════════════════════════════════════════════
const SCHEDULER_I18N = {
    vi: {
        set_success: '⏰ Đã đặt nhắc nhở!',
        will_check: '🧠 Sẽ kiểm tra thông tin: "{prompt}"',
        will_remind: '💬 "{message}"',
        fire_at: '🕐 Sẽ nhắc lúc: {time} (sau {delay})',
        notify_dm: '📬 Thông báo: gửi tin nhắn riêng (DM)',
        task_id: '🆔 Task ID: `{id}`',
        auto_delete: '💡 Nhắc nhở sẽ tự hủy sau khi gửi xong.',
        seconds: 'giây',
        minutes: 'phút',
        price_watch_set: '✅ Đã lên lịch theo dõi giá!',
        token_label: '🪙 Token: {token}',
        cycle_label: '⏱ Chu kỳ: mỗi {interval} phút',
        threshold_label: '📊 Ngưỡng cảnh báo: ±{percent}%',
        first_check: '⏭ Kiểm tra đầu tiên: {time}',
        price_hint: '💡 Bot sẽ tự động cảnh báo khi giá thay đổi vượt ngưỡng.\nDùng "xem task" để xem danh sách hoặc "hủy task {id}" để dừng.',
        portfolio_set: '✅ Đã lên lịch snapshot portfolio!',
        wallet_label: '👛 Ví: {wallet}',
        hour_cycle: '⏱ Chu kỳ: mỗi {hours} giờ',
        first_snapshot: '⏭ Snapshot đầu tiên: {time}',
        portfolio_hint: '💡 Bot sẽ tự động ghi nhận giá trị ví và so sánh với lần trước.',
        no_tasks: '📋 Chưa có tác vụ nào đang chạy.',
        task_list_header: '📋 Danh sách tác vụ ({count}):',
        type_price: '📊 Theo dõi giá',
        type_portfolio: '💼 Snapshot',
        type_reminder: '⏰ Nhắc nhở',
        run_at: '⏭ Chạy lúc: {time}',
        cycle_min: '⏱ Chu kỳ: {min} phút',
        cancel_hint: '💡 Dùng "hủy task [ID]" để dừng tác vụ.',
        cancel_no_id: '❌ Vui lòng cung cấp Task ID cần hủy.',
        cancel_not_found: '❌ Không tìm thấy task `{id}` hoặc bạn không có quyền hủy task này.',
        cancel_success: '✅ Đã hủy task `{id}` thành công!',
        usage_guide: `━━ 📖 Hướng dẫn sử dụng ━━\n\n📊 **Theo dõi giá token:**\n• "Theo dõi giá OKB mỗi 15 phút"\n• "Cảnh báo nếu BTC thay đổi 5%"\n\n💼 **Snapshot portfolio:**\n• "Snapshot ví tôi mỗi 6 tiếng"\n\n⏰ **Nhắc nhở:**\n• "Nhắc tôi sau 30 phút check BANMAO"\n• "Nhắc tôi sau 1 tiếng"\n\n📋 **Quản lý task:**\n• "Xem danh sách task"\n• "Hủy task task_abc123"`,
        // Task executor messages
        exec_price_alert: 'CẢNH BÁO GIÁ',
        exec_change: 'Thay đổi',
        exec_prev_price: 'Giá trước',
        exec_watching: 'Theo dõi giá',
        exec_baseline: 'Đã lưu mốc ban đầu',
        exec_total: 'Tổng tài sản',
        exec_reminder_processing: 'AI đang xử lý yêu cầu hẹn giờ của bạn...',
        exec_reminder_static: 'Nhắc nhở tự động',
        exec_vol_24h: 'KL 24h',
        exec_cycle_min: 'chu kỳ {min} phút',
        exec_mcap: 'Vốn hóa',
        exec_holders: 'Holders',
    },
    en: {
        set_success: '⏰ Reminder set!',
        will_check: '🧠 Will check: "{prompt}"',
        will_remind: '💬 "{message}"',
        fire_at: '🕐 Fires at: {time} (in {delay})',
        notify_dm: '📬 Notification: private message (DM)',
        task_id: '🆔 Task ID: `{id}`',
        auto_delete: '💡 Reminder will self-delete after sending.',
        seconds: 'seconds',
        minutes: 'minutes',
        price_watch_set: '✅ Price watch scheduled!',
        token_label: '🪙 Token: {token}',
        cycle_label: '⏱ Cycle: every {interval} minutes',
        threshold_label: '📊 Alert threshold: ±{percent}%',
        first_check: '⏭ First check: {time}',
        price_hint: '💡 Bot will auto-alert when price exceeds threshold.\nUse "list tasks" to view or "cancel task {id}" to stop.',
        portfolio_set: '✅ Portfolio snapshot scheduled!',
        wallet_label: '👛 Wallet: {wallet}',
        hour_cycle: '⏱ Cycle: every {hours} hours',
        first_snapshot: '⏭ First snapshot: {time}',
        portfolio_hint: '💡 Bot will auto-record wallet value and compare with previous.',
        no_tasks: '📋 No active tasks.',
        task_list_header: '📋 Task list ({count}):',
        type_price: '📊 Price watch',
        type_portfolio: '💼 Snapshot',
        type_reminder: '⏰ Reminder',
        run_at: '⏭ Runs at: {time}',
        cycle_min: '⏱ Cycle: {min} min',
        cancel_hint: '💡 Use "cancel task [ID]" to stop a task.',
        cancel_no_id: '❌ Please provide the Task ID to cancel.',
        cancel_not_found: '❌ Task `{id}` not found or you don\'t have permission to cancel it.',
        cancel_success: '✅ Task `{id}` cancelled successfully!',
        usage_guide: `━━ 📖 Usage Guide ━━\n\n📊 **Price monitoring:**\n• "Watch OKB price every 15 min"\n• "Alert if BTC changes 5%"\n\n💼 **Portfolio snapshot:**\n• "Snapshot my wallet every 6 hours"\n\n⏰ **Reminders:**\n• "Remind me in 30 min to check BANMAO"\n• "Remind me in 1 hour"\n\n📋 **Management:**\n• "List tasks"\n• "Cancel task task_abc123"`,
        exec_price_alert: 'PRICE ALERT',
        exec_change: 'Change',
        exec_prev_price: 'Previous price',
        exec_watching: 'Watching price',
        exec_baseline: 'Baseline saved',
        exec_total: 'Total assets',
        exec_reminder_processing: 'AI is processing your scheduled request...',
        exec_reminder_static: 'Auto reminder',
        exec_vol_24h: 'Vol 24h',
        exec_cycle_min: '{min} min cycle',
        exec_mcap: 'MCap',
        exec_holders: 'Holders',
    },
    zh: {
        set_success: '⏰ 提醒已设置！',
        will_check: '🧠 将检查: "{prompt}"',
        will_remind: '💬 "{message}"',
        fire_at: '🕐 提醒时间: {time} ({delay}后)',
        notify_dm: '📬 通知方式: 私信 (DM)',
        task_id: '🆔 任务ID: `{id}`',
        auto_delete: '💡 提醒发送后将自动删除。',
        seconds: '秒',
        minutes: '分钟',
        price_watch_set: '✅ 价格监控已设置！',
        token_label: '🪙 代币: {token}',
        cycle_label: '⏱ 周期: 每 {interval} 分钟',
        threshold_label: '📊 警报阈值: ±{percent}%',
        first_check: '⏭ 首次检查: {time}',
        price_hint: '💡 价格超过阈值时自动提醒。\n使用 "查看任务" 查看或 "取消任务 {id}" 停止。',
        portfolio_set: '✅ 投资组合快照已设置！',
        wallet_label: '👛 钱包: {wallet}',
        hour_cycle: '⏱ 周期: 每 {hours} 小时',
        first_snapshot: '⏭ 首次快照: {time}',
        portfolio_hint: '💡 自动记录钱包价值并与上次比较。',
        no_tasks: '📋 没有活跃任务。',
        task_list_header: '📋 任务列表 ({count}):',
        type_price: '📊 价格监控',
        type_portfolio: '💼 快照',
        type_reminder: '⏰ 提醒',
        run_at: '⏭ 运行于: {time}',
        cycle_min: '⏱ 周期: {min} 分钟',
        cancel_hint: '💡 使用 "取消任务 [ID]" 停止任务。',
        cancel_no_id: '❌ 请提供要取消的任务ID。',
        cancel_not_found: '❌ 未找到任务 `{id}` 或您无权取消此任务。',
        cancel_success: '✅ 任务 `{id}` 已成功取消！',
        usage_guide: `━━ 📖 使用指南 ━━\n\n📊 **价格监控:**\n• "每15分钟监控OKB价格"\n• "BTC变化5%时提醒"\n\n💼 **投资组合快照:**\n• "每6小时快照我的钱包"\n\n⏰ **提醒:**\n• "30分钟后提醒我查看BANMAO"\n• "1小时后提醒我"\n\n📋 **管理:**\n• "查看任务列表"\n• "取消任务 task_abc123"`,
        exec_price_alert: '价格警报',
        exec_change: '变化',
        exec_prev_price: '上次价格',
        exec_watching: '监控价格',
        exec_baseline: '已保存基准线',
        exec_total: '总资产',
        exec_reminder_processing: 'AI正在处理您的定时请求...',
        exec_reminder_static: '自动提醒',
        exec_vol_24h: '24h成交量',
        exec_cycle_min: '{min}分钟周期',
        exec_mcap: '市值',
        exec_holders: '持有者',
    },
    ko: {
        set_success: '⏰ 알림 설정 완료!',
        will_check: '🧠 확인 예정: "{prompt}"',
        will_remind: '💬 "{message}"',
        fire_at: '🕐 알림 시간: {time} ({delay} 후)',
        notify_dm: '📬 알림: 개인 메시지 (DM)',
        task_id: '🆔 작업 ID: `{id}`',
        auto_delete: '💡 알림은 전송 후 자동 삭제됩니다.',
        seconds: '초',
        minutes: '분',
        price_watch_set: '✅ 가격 모니터링 예약 완료!',
        token_label: '🪙 토큰: {token}',
        cycle_label: '⏱ 주기: {interval}분마다',
        threshold_label: '📊 알림 임계값: ±{percent}%',
        first_check: '⏭ 첫 확인: {time}',
        price_hint: '💡 가격이 임계값을 초과하면 자동으로 알립니다.\n"작업 목록"으로 확인하거나 "작업 취소 {id}"로 중지하세요.',
        portfolio_set: '✅ 포트폴리오 스냅샷 예약 완료!',
        wallet_label: '👛 지갑: {wallet}',
        hour_cycle: '⏱ 주기: {hours}시간마다',
        first_snapshot: '⏭ 첫 스냅샷: {time}',
        portfolio_hint: '💡 지갑 가치를 자동으로 기록하고 이전과 비교합니다.',
        no_tasks: '📋 활성 작업이 없습니다.',
        task_list_header: '📋 작업 목록 ({count}):',
        type_price: '📊 가격 모니터링',
        type_portfolio: '💼 스냅샷',
        type_reminder: '⏰ 알림',
        run_at: '⏭ 실행 시간: {time}',
        cycle_min: '⏱ 주기: {min}분',
        cancel_hint: '💡 "작업 취소 [ID]"로 작업을 중지하세요.',
        cancel_no_id: '❌ 취소할 작업 ID를 입력하세요.',
        cancel_not_found: '❌ 작업 `{id}`을 찾을 수 없거나 취소 권한이 없습니다.',
        cancel_success: '✅ 작업 `{id}` 취소 완료!',
        usage_guide: `━━ 📖 사용 가이드 ━━\n\n📊 **가격 모니터링:**\n• "OKB 가격 15분마다 모니터링"\n• "BTC 5% 변동 시 알림"\n\n💼 **포트폴리오 스냅샷:**\n• "내 지갑 6시간마다 스냅샷"\n\n⏰ **알림:**\n• "30분 후 BANMAO 확인 알림"\n\n📋 **관리:**\n• "작업 목록"\n• "작업 취소 task_abc123"`,
        exec_price_alert: '가격 알림',
        exec_change: '변동',
        exec_prev_price: '이전 가격',
        exec_watching: '가격 모니터링',
        exec_baseline: '기준선 저장됨',
        exec_total: '총 자산',
        exec_reminder_processing: 'AI가 예약된 요청을 처리 중입니다...',
        exec_reminder_static: '자동 알림',
        exec_vol_24h: '24h 거래량',
        exec_cycle_min: '{min}분 주기',
        exec_mcap: '시가총액',
        exec_holders: '보유자',
    },
    ru: {
        set_success: '⏰ Напоминание установлено!',
        will_check: '🧠 Проверю: "{prompt}"',
        will_remind: '💬 "{message}"',
        fire_at: '🕐 Время: {time} (через {delay})',
        notify_dm: '📬 Уведомление: личное сообщение (ЛС)',
        task_id: '🆔 ID задачи: `{id}`',
        auto_delete: '💡 Напоминание удалится после отправки.',
        seconds: 'сек',
        minutes: 'мин',
        price_watch_set: '✅ Мониторинг цены запланирован!',
        token_label: '🪙 Токен: {token}',
        cycle_label: '⏱ Цикл: каждые {interval} мин',
        threshold_label: '📊 Порог оповещения: ±{percent}%',
        first_check: '⏭ Первая проверка: {time}',
        price_hint: '💡 Бот оповестит при превышении порога.\nИспользуйте "список задач" или "отменить задачу {id}".',
        portfolio_set: '✅ Снимок портфеля запланирован!',
        wallet_label: '👛 Кошелёк: {wallet}',
        hour_cycle: '⏱ Цикл: каждые {hours} ч',
        first_snapshot: '⏭ Первый снимок: {time}',
        portfolio_hint: '💡 Бот автоматически записывает стоимость кошелька.',
        no_tasks: '📋 Нет активных задач.',
        task_list_header: '📋 Список задач ({count}):',
        type_price: '📊 Мониторинг цены',
        type_portfolio: '💼 Снимок',
        type_reminder: '⏰ Напоминание',
        run_at: '⏭ Запуск: {time}',
        cycle_min: '⏱ Цикл: {min} мин',
        cancel_hint: '💡 "отменить задачу [ID]" для остановки.',
        cancel_no_id: '❌ Укажите ID задачи для отмены.',
        cancel_not_found: '❌ Задача `{id}` не найдена.',
        cancel_success: '✅ Задача `{id}` отменена!',
        usage_guide: `━━ 📖 Руководство ━━\n\n📊 **Мониторинг цены:**\n• "Следить за OKB каждые 15 мин"\n• "Алерт если BTC изменится на 5%"\n\n💼 **Снимок портфеля:**\n• "Снимок кошелька каждые 6 часов"\n\n⏰ **Напоминания:**\n• "Напомни через 30 мин проверить BANMAO"\n\n📋 **Управление:**\n• "Список задач"\n• "Отменить задачу task_abc123"`,
        exec_price_alert: 'ОПОВЕЩЕНИЕ О ЦЕНЕ',
        exec_change: 'Изменение',
        exec_prev_price: 'Предыд. цена',
        exec_watching: 'Мониторинг цены',
        exec_baseline: 'Базовая линия сохранена',
        exec_total: 'Общие активы',
        exec_reminder_processing: 'AI обрабатывает ваш запрос...',
        exec_reminder_static: 'Авто-напоминание',
        exec_vol_24h: 'Объём 24ч',
        exec_cycle_min: 'цикл {min} мин',
        exec_mcap: 'Капитализация',
        exec_holders: 'Холдеры',
    },
    id: {
        set_success: '⏰ Pengingat diatur!',
        will_check: '🧠 Akan memeriksa: "{prompt}"',
        will_remind: '💬 "{message}"',
        fire_at: '🕐 Waktu: {time} (dalam {delay})',
        notify_dm: '📬 Notifikasi: pesan pribadi (DM)',
        task_id: '🆔 ID Tugas: `{id}`',
        auto_delete: '💡 Pengingat akan dihapus otomatis setelah dikirim.',
        seconds: 'detik',
        minutes: 'menit',
        price_watch_set: '✅ Pemantauan harga dijadwalkan!',
        token_label: '🪙 Token: {token}',
        cycle_label: '⏱ Siklus: setiap {interval} menit',
        threshold_label: '📊 Ambang peringatan: ±{percent}%',
        first_check: '⏭ Pemeriksaan pertama: {time}',
        price_hint: '💡 Bot akan otomatis memberi tahu saat harga melebihi ambang.\nGunakan "daftar tugas" atau "batalkan tugas {id}".',
        portfolio_set: '✅ Snapshot portofolio dijadwalkan!',
        wallet_label: '👛 Dompet: {wallet}',
        hour_cycle: '⏱ Siklus: setiap {hours} jam',
        first_snapshot: '⏭ Snapshot pertama: {time}',
        portfolio_hint: '💡 Bot otomatis mencatat nilai dompet dan membandingkan.',
        no_tasks: '📋 Tidak ada tugas aktif.',
        task_list_header: '📋 Daftar tugas ({count}):',
        type_price: '📊 Pantau harga',
        type_portfolio: '💼 Snapshot',
        type_reminder: '⏰ Pengingat',
        run_at: '⏭ Berjalan: {time}',
        cycle_min: '⏱ Siklus: {min} menit',
        cancel_hint: '💡 "batalkan tugas [ID]" untuk menghentikan.',
        cancel_no_id: '❌ Berikan ID tugas untuk dibatalkan.',
        cancel_not_found: '❌ Tugas `{id}` tidak ditemukan.',
        cancel_success: '✅ Tugas `{id}` berhasil dibatalkan!',
        usage_guide: `━━ 📖 Panduan ━━\n\n📊 **Pantau harga:**\n• "Pantau harga OKB setiap 15 menit"\n• "Beri tahu jika BTC berubah 5%"\n\n💼 **Snapshot portofolio:**\n• "Snapshot dompet saya setiap 6 jam"\n\n⏰ **Pengingat:**\n• "Ingatkan saya dalam 30 menit cek BANMAO"\n\n📋 **Manajemen:**\n• "Daftar tugas"\n• "Batalkan tugas task_abc123"`,
        exec_price_alert: 'PERINGATAN HARGA',
        exec_change: 'Perubahan',
        exec_prev_price: 'Harga sebelumnya',
        exec_watching: 'Memantau harga',
        exec_baseline: 'Baseline tersimpan',
        exec_total: 'Total aset',
        exec_reminder_processing: 'AI sedang memproses permintaan Anda...',
        exec_reminder_static: 'Pengingat otomatis',
        exec_vol_24h: 'Vol 24j',
        exec_cycle_min: 'siklus {min} menit',
        exec_mcap: 'Kap. Pasar',
        exec_holders: 'Pemegang',
    }
};

function schedulerT(lang, key, params = {}) {
    const l = SCHEDULER_I18N[lang] || SCHEDULER_I18N['vi'];
    let text = l[key] || SCHEDULER_I18N['vi'][key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return text;
}

// ═══════════════════════════════════════════════════════
// Reliable language detection (from DB, not prompt)
// ═══════════════════════════════════════════════════════
async function getReliableLang(context) {
    try {
        const { getLang } = require('../../../app/language');
        if (context?.msg) {
            return await getLang(context.msg) || context?.lang || 'vi';
        }
    } catch (e) { /* fallback */ }
    return context?.lang || 'vi';
}

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
    const clampedInterval = Math.max(intervalMs, 10000); // Minimum 10 seconds (down from 1 min)
    const nextRunAt = now + clampedInterval;
    await dbRun(
        `INSERT INTO ai_scheduled_tasks (id, userId, chatId, type, intervalMs, nextRunAt, params, enabled, lang, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, String(userId), String(chatId), type, clampedInterval, nextRunAt, JSON.stringify(params), lang, now]
    );
    log.info(`➕ addScheduledTask: id=${id}, type=${type}, chatId=${chatId}, userId=${userId}, lang=${lang}, nextRunAt=${new Date(nextRunAt).toISOString()}`);
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
// Scheduler Tick — Runs every 10 seconds
// ═══════════════════════════════════════════════════════

/** @type {function|null} External callback for task execution */
let _onTaskDue = null;

function setTaskExecutor(callback) {
    _onTaskDue = callback;
    log.info('✅ Task executor SET, type:', typeof callback);
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

        log.info(`Tick: ${dueTasks.length} tasks due, executor: ${typeof _onTaskDue}`);

        for (const row of dueTasks) {
            const task = parseTaskRow(row);
            log.info(`🔥 FIRING task ${task.id} (${task.type}), chatId: ${task.chatId}, userId: ${task.userId}, lang: ${task.lang}`);

            try {
                if (_onTaskDue) {
                    await _onTaskDue(task);
                    log.info(`✅ Task ${task.id} executed successfully`);
                } else {
                    log.info(`⚠️ No executor set, skipping task ${task.id}`);
                }
            } catch (error) {
                log.error(`❌ Task ${task.id} (${task.type}) failed:`, error.message);
            }

            // Update next run time or delete if one-shot
            if (task.params?.oneShot) {
                await dbRun(`DELETE FROM ai_scheduled_tasks WHERE id = ?`, [task.id]);
                log.info(`🗑️ Deleted one-shot task ${task.id}`);
            } else {
                const nextRunAt = now + task.intervalMs;
                await dbRun(
                    `UPDATE ai_scheduled_tasks SET nextRunAt = ?, lastPrice = ?, lastTotalUsd = ? WHERE id = ?`,
                    [nextRunAt, task.lastPrice || null, task.lastTotalUsd || null, task.id]
                );
            }
        }
    } catch (error) {
        log.error(`❌ Tick error:`, error.message);
    }
}

function startScheduler() {
    if (_tickInterval) return;
    _tickInterval = setInterval(schedulerTick, 10000); // Every 10 seconds
    log.info('⏰ Started autonomous scheduler (10s tick)');
}

function stopScheduler() {
    if (_tickInterval) {
        clearInterval(_tickInterval);
        _tickInterval = null;
    }
}

// ═══════════════════════════════════════════════════════
// Utility: format time as UTC+7
// ═══════════════════════════════════════════════════════
function fmtTimeUTC7(timestamp) {
    const pad = n => String(n).padStart(2, '0');
    const utc7 = new Date((timestamp || Date.now()) + 7 * 3600000);
    return `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())}:${pad(utc7.getUTCSeconds())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
}

function fmtTimeShortUTC7(timestamp) {
    const pad = n => String(n).padStart(2, '0');
    const utc7 = new Date(timestamp + 7 * 3600000);
    return `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
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
            description: 'Set a custom AI reminder that will be sent as a private message (DM) at the specified time. IMPORTANT: The dynamic_prompt MUST be written in the SAME language the user is speaking. If user speaks Vietnamese, write in Vietnamese. If Chinese, write in Chinese. If English, write in English. Never translate the user\'s request to a different language.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Reminder message if it is just a simple text alert' },
                    delay_minutes: { type: 'number', description: 'Send reminder after this many minutes from now (min: 0.16)' },
                    dynamic_prompt: { type: 'string', description: 'If the user asks the AI to fetch a price, run an analysis, or check data in the future, put their EXACT request here IN THE SAME LANGUAGE the user used. Do NOT translate to another language.' }
                },
                required: ['delay_minutes']
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
        const lang = await getReliableLang(context);
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
        const nextStr = fmtTimeShortUTC7(task.nextRunAt);
        const t = (key, params) => schedulerT(lang, key, params);
        return [
            t('price_watch_set'),
            '━━━━━━━━━━━━━━━━━━',
            t('token_label', { token: args.token }),
            t('cycle_label', { interval: Math.round(intervalMs / 60000) }),
            t('threshold_label', { percent: args.threshold_percent || 5 }),
            t('first_check', { time: nextStr }),
            t('notify_dm'),
            t('task_id', { id: task.id }),
            '',
            t('price_hint', { id: task.id })
        ].join('\n');
    },

    async schedule_portfolio_snapshot(args, context) {
        const intervalMs = Math.max((args.interval_hours || 6), 1) * 3600 * 1000;
        const lang = await getReliableLang(context);
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
        const nextStr = fmtTimeShortUTC7(task.nextRunAt);
        const t = (key, params) => schedulerT(lang, key, params);
        return [
            t('portfolio_set'),
            '━━━━━━━━━━━━━━━━━━',
            t('wallet_label', { wallet: `${args.wallet_address.slice(0, 6)}...${args.wallet_address.slice(-4)}` }),
            t('hour_cycle', { hours: Math.round(intervalMs / 3600000) }),
            t('first_snapshot', { time: nextStr }),
            t('notify_dm'),
            t('task_id', { id: task.id }),
            '',
            t('portfolio_hint')
        ].join('\n');
    },

    async set_reminder(args, context) {
        // Allow decimals for minutes (e.g. 0.166 mins = 10s) 
        // We will default to 5 mins if not provided, but allow down to 10 seconds.
        const providedDelay = parseFloat(args.delay_minutes);
        const delayMs = Math.max((isNaN(providedDelay) ? 5 : providedDelay), 10 / 60) * 60 * 1000;
        const lang = await getReliableLang(context);

        const message = args.message || '';
        const dynamicPrompt = args.dynamic_prompt || '';

        const task = await addScheduledTask({
            userId: context?.userId,
            chatId: context?.userId, // DM: send to userId (private chat)
            type: 'custom_reminder',
            intervalMs: delayMs,
            lang,
            params: {
                message: message,
                dynamic_prompt: dynamicPrompt,
                oneShot: true
            }
        });

        const fireAt = Date.now() + delayMs;
        const fireStr = fmtTimeUTC7(fireAt);

        const t = (key, params) => schedulerT(lang, key, params);
        const delayStr = args.delay_minutes < 1
            ? `${(args.delay_minutes * 60).toFixed(0)} ${t('seconds')}`
            : `${args.delay_minutes} ${t('minutes')}`;

        const typeNote = dynamicPrompt
            ? t('will_check', { prompt: dynamicPrompt })
            : t('will_remind', { message: message });

        return [
            t('set_success'),
            '━━━━━━━━━━━━━━━━━━',
            typeNote,
            t('fire_at', { time: fireStr, delay: delayStr }),
            t('notify_dm'),
            t('task_id', { id: task.id }),
            '',
            t('auto_delete')
        ].join('\n');
    },

    async list_scheduled_tasks(args, context) {
        const lang = await getReliableLang(context);
        const t = (key, params) => schedulerT(lang, key, params);
        const tasks = await getTasksForUser(context?.userId);
        if (tasks.length === 0) {
            return t('no_tasks') + '\n\n' + t('usage_guide');
        }

        const lines = [t('task_list_header', { count: tasks.length }), ''];
        for (const task of tasks) {
            const nextStr = fmtTimeShortUTC7(task.nextRunAt);
            const typeLabel = task.type === 'price_watch' ? t('type_price')
                : task.type === 'portfolio_snapshot' ? t('type_portfolio')
                    : t('type_reminder');
            lines.push(`${typeLabel}\n  🆔 [ID] \`${task.id}\`\n  ${t('run_at', { time: nextStr })}\n  ${t('cycle_min', { min: Math.round(task.intervalMs / 60000) })}\n`);
        }
        lines.push(t('cancel_hint'));
        return lines.join('\n');
    },

    async cancel_scheduled_task(args, context) {
        const lang = await getReliableLang(context);
        const t = (key, params) => schedulerT(lang, key, params);
        const taskId = args.task_id;
        if (!taskId) return t('cancel_no_id');
        const task = await dbGet(`SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ?`, [taskId, String(context?.userId)]);
        if (!task) return t('cancel_not_found', { id: taskId });
        await removeScheduledTask(taskId);
        return t('cancel_success', { id: taskId });
    }
};

// ═══════════════════════════════════════════════════════
// Skill Export
// ═══════════════════════════════════════════════════════

const SCHEDULER_SYSTEM_PROMPT = `
[STRICT MANDATE FOR SCHEDULER TOOLS]
If the user asks to "nhắc", "theo dõi", "giám sát", "cảnh báo", "watch", "monitor", "track", "remind", "schedule", "提醒", "监控":
1. You MUST immediately CALL the relevant scheduler tool (schedule_price_watch, set_reminder, etc.).
2. You MUST NOT just reply with text explaining what you can do.
3. You MUST NOT copy these instructions into your response.
4. Tell the user you have scheduled it successfully, and provide the task ID.
5. CRITICAL: When setting dynamic_prompt, keep the prompt in the SAME language the user is speaking. DO NOT translate.`;

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
    schedulerT,
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
