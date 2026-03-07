function createCheckinSummary({
    db,
    bot,
    t,
    escapeHtml,
    resolveGroupLanguage,
    buildAdminUserIdLink,
    resolveMemberProfile,
    getSummaryWindowBounds,
    formatDateForTimezone,
    getGroupCheckinSettings,
    CHECKIN_DEFAULT_TIMEZONE,
    sendMessageRespectingThread
}) {
    async function buildSummaryAnnouncementText(chatId, settings, lang, limit) {
        const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
        if (!startDate || !endDate || startDate > endDate) {
            return null;
        }

        const records = await db.getCheckinsInRange(chatId, startDate, endDate);
        if (!records || records.length === 0) {
            return null;
        }

        const summaryMap = new Map();
        for (const record of records) {
            const userKey = record.userId.toString();
            const stats = summaryMap.get(userKey) || { days: 0, points: 0 };
            stats.days += 1;
            stats.points += Number(record.pointsAwarded || 0);
            summaryMap.set(userKey, stats);
        }

        if (summaryMap.size === 0) {
            return null;
        }

        const sortedEntries = Array.from(summaryMap.entries())
            .sort((a, b) => {
                if (b[1].days !== a[1].days) {
                    return b[1].days - a[1].days;
                }
                if (b[1].points !== a[1].points) {
                    return b[1].points - a[1].points;
                }
                return Number(a[0]) - Number(b[0]);
            })
            .slice(0, limit);

        const profileCache = new Map();
        const lines = [
            `<b>${t(lang, 'checkin_summary_broadcast_header', { days: Math.max(rangeDays, 1), start: startDate, end: endDate, members: summaryMap.size })}</b>`
        ];

        for (let index = 0; index < sortedEntries.length; index += 1) {
            const [userId, stats] = sortedEntries[index];
            const profile = await resolveMemberProfile(chatId, userId, lang, profileCache);
            const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
            const safeId = buildAdminUserIdLink(userId);
            lines.push(t(lang, 'checkin_summary_broadcast_line', {
                rank: index + 1,
                name: safeName,
                id: safeId,
                days: stats.days,
                points: stats.points
            }));
        }

        lines.push('', escapeHtml(t(lang, 'checkin_summary_broadcast_footer')));
        return lines.join('\n').trim();
    }

    async function sendSummaryAnnouncement(chatId, { sourceMessage = null, triggeredBy = 'auto', limit } = {}) {
        const settings = await getGroupCheckinSettings(chatId);
        const lang = await resolveGroupLanguage(chatId);
        const summaryText = await buildSummaryAnnouncementText(chatId, settings, lang, limit);
        if (!summaryText) {
            return false;
        }

        const options = { parse_mode: 'HTML' };
        try {
            if (sourceMessage) {
                await sendMessageRespectingThread(chatId, sourceMessage, summaryText, options);
            } else {
                await bot.sendMessage(chatId, summaryText, options);
            }
            console.log(`[Checkin] Sent summary announcement to ${chatId} (${triggeredBy}).`);
            return true;
        } catch (error) {
            console.error(`[Checkin] Failed to send summary announcement to ${chatId}: ${error.message}`);
            return false;
        }
    }

    return {
        buildSummaryAnnouncementText,
        sendSummaryAnnouncement
    };
}

module.exports = createCheckinSummary;
