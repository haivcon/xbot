const logger = require('../../core/logger');
const log = logger.child('Scheduler');

function createCheckinScheduler({
    db,
    getScheduleSlots,
    getSummaryScheduleSlots,
    sendCheckinAnnouncement,
    sendSummaryAnnouncement,
    calculateInclusiveDayDiff,
    formatDateForTimezone,
    formatTimeForTimezone,
    CHECKIN_SCHEDULER_INTERVAL,
    CHECKIN_DEFAULT_TIMEZONE
}) {
    let checkinSchedulerTimer = null;
    let isRunning = false;

    async function runCheckinSchedulerTick() {
        if (isRunning) {
            return;
        }

        isRunning = true;

        try {
            let groups = [];
            try {
                groups = await db.listCheckinGroups();
            } catch (error) {
                log.child('Checkin').error(`Khong the tai danh sach nhom: ${error.message}`);
                return;
            }

            if (!groups || groups.length === 0) {
                return;
            }

            const now = new Date();
            for (const group of groups) {
                if (!group || Number(group.autoMessageEnabled) !== 1) {
                    continue;
                }

                const timezone = group.timezone || CHECKIN_DEFAULT_TIMEZONE;
                const currentTime = formatTimeForTimezone(timezone, now);
                const today = formatDateForTimezone(timezone, now);
                const slots = getScheduleSlots(group);

                for (const slot of slots) {
                    if (currentTime !== slot) {
                        continue;
                    }

                    const claimed = await db.recordAutoMessageLog(group.chatId, today, slot);
                    if (!claimed) {
                        continue;
                    }

                    await sendCheckinAnnouncement(group.chatId, { triggeredBy: 'auto' });
                }

                if (Number(group.summaryMessageEnabled) === 1) {
                    const summarySlots = getSummaryScheduleSlots(group);
                    if (summarySlots.length > 0) {
                        for (const slot of summarySlots) {
                            if (currentTime !== slot) {
                                continue;
                            }

                            const claimedSummary = await db.recordSummaryMessageLog(group.chatId, today, slot);
                            if (!claimedSummary) {
                                continue;
                            }

                            await sendSummaryAnnouncement(group.chatId, { triggeredBy: 'auto' });
                        }
                    }
                }

                const summaryStart = group.summaryPeriodStart || today;
                if (!group.summaryPeriodStart) {
                    await db.setSummaryPeriodStart(group.chatId, summaryStart, timezone);
                } else {
                    const windowDays = Math.max(Number(group.summaryWindow) || 1, 1);
                    const elapsed = calculateInclusiveDayDiff(summaryStart, today);
                    if (elapsed >= windowDays) {
                        const claimedWindow = await db.recordSummaryMessageLog(group.chatId, today, currentTime);
                        if (claimedWindow) {
                            const sent = await sendSummaryAnnouncement(group.chatId, { triggeredBy: 'auto-window' });
                            if (sent) {
                                await db.setSummaryPeriodStart(group.chatId, today, timezone);
                                await db.setLeaderboardPeriodStart(group.chatId, today, timezone);
                            }
                        }
                    }
                }
            }
        } finally {
            isRunning = false;
        }
    }

    function startCheckinScheduler() {
        if (checkinSchedulerTimer) {
            clearInterval(checkinSchedulerTimer);
            checkinSchedulerTimer = null;
        }

        const tick = () => {
            runCheckinSchedulerTick().catch((error) => {
                log.child('Checkin').error(`Tick loi: ${error.message}`);
            });
        };

        tick();
        checkinSchedulerTimer = setInterval(tick, CHECKIN_SCHEDULER_INTERVAL);
        if (typeof checkinSchedulerTimer.unref === 'function') {
            checkinSchedulerTimer.unref();
        }
    }

    return {
        startCheckinScheduler,
        runCheckinSchedulerTick
    };
}

module.exports = createCheckinScheduler;
