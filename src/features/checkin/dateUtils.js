const logger = require('../../core/logger');
const log = logger.child('DateUtils');

function createCheckinDateUtils({ CHECKIN_DEFAULT_TIMEZONE }) {
    function formatDateForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, date = new Date()) {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            return formatter.format(date);
        } catch (error) {
            log.child('Checkin').warn(`Khong the format ngay cho timezone ${timezone}: ${error.message}`);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }

    function formatTimeForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, date = new Date()) {
        try {
            const formatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            return formatter.format(date);
        } catch (error) {
            log.child('Checkin').warn(`Khong the format gio cho timezone ${timezone}: ${error.message}`);
            const hours = String(date.getUTCHours()).padStart(2, '0');
            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    }

    function formatDateTimeForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, timestampSeconds = null) {
        const date = timestampSeconds ? new Date(timestampSeconds * 1000) : new Date();
        const dateStr = formatDateForTimezone(timezone, date);
        const timeStr = formatTimeForTimezone(timezone, date);
        return `${dateStr} ${timeStr}`;
    }

    function subtractDaysFromDate(dateStr, days) {
        if (typeof dateStr !== 'string') {
            return null;
        }

        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return null;
        }

        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const delta = Math.max(0, Number(days) || 0);
        const date = new Date(Date.UTC(year, month, day));
        date.setUTCDate(date.getUTCDate() - delta);
        const nextYear = date.getUTCFullYear();
        const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
        const nextDay = String(date.getUTCDate()).padStart(2, '0');
        return `${nextYear}-${nextMonth}-${nextDay}`;
    }

    function normalizeDateInput(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return null;
        }

        return trimmed;
    }

    function pickLaterDateString(valueA, valueB) {
        if (!valueA) {
            return valueB || null;
        }
        if (!valueB) {
            return valueA;
        }
        return valueA >= valueB ? valueA : valueB;
    }

    function calculateInclusiveDayDiff(start, end) {
        if (!start || !end) {
            return 0;
        }

        const startDate = new Date(`${start}T00:00:00Z`);
        const endDate = new Date(`${end}T00:00:00Z`);
        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        return diffDays >= 0 ? diffDays + 1 : 0;
    }

    function getSummaryPeriodStart(settings) {
        const normalized = normalizeDateInput(settings?.summaryPeriodStart);
        return normalized || null;
    }

    function getSummaryWindowBounds(settings) {
        const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const configuredDays = Math.max(Number(settings?.summaryWindow) || 1, 1);
        const endDate = formatDateForTimezone(timezone);
        const rollingStart = subtractDaysFromDate(endDate, configuredDays - 1) || endDate;
        const periodStart = getSummaryPeriodStart(settings);
        const startDate = pickLaterDateString(rollingStart, periodStart) || rollingStart;
        return {
            startDate,
            endDate,
            periodStart,
            configuredDays,
            rangeDays: calculateInclusiveDayDiff(startDate, endDate)
        };
    }

    return {
        formatDateForTimezone,
        formatTimeForTimezone,
        formatDateTimeForTimezone,
        subtractDaysFromDate,
        normalizeDateInput,
        pickLaterDateString,
        calculateInclusiveDayDiff,
        getSummaryPeriodStart,
        getSummaryWindowBounds
    };
}

module.exports = { createCheckinDateUtils };
