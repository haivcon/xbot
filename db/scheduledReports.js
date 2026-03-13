/**
 * Scheduled Reports Module
 * Manages user-configured recurring reports
 * File: db/scheduledReports.js
 */

const { dbRun, dbGet, dbAll } = require('./core');

// ─── Create a scheduled report ───
async function createScheduledReport(userId, type, frequency, time = '09:00') {
    await dbRun(
        `INSERT INTO scheduled_reports (userId, type, frequency, time, active, createdAt)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [String(userId), type, frequency, time, Date.now()]
    );
}

// ─── Get all active reports for a user ───
async function getUserReports(userId) {
    return dbAll(
        'SELECT * FROM scheduled_reports WHERE userId = ? AND active = 1',
        [String(userId)]
    );
}

// ─── Get all due reports (for the runner) ───
async function getDueReports() {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    return dbAll(
        `SELECT * FROM scheduled_reports WHERE active = 1 AND (lastRun IS NULL OR lastRun < ?)`,
        [hourAgo]
    );
}

// ─── Mark report as run ───
async function markReportRun(reportId) {
    await dbRun(
        'UPDATE scheduled_reports SET lastRun = ? WHERE id = ?',
        [Date.now(), reportId]
    );
}

// ─── Deactivate a report ───
async function deactivateReport(reportId, userId) {
    await dbRun(
        'UPDATE scheduled_reports SET active = 0 WHERE id = ? AND userId = ?',
        [reportId, String(userId)]
    );
}

module.exports = {
    createScheduledReport,
    getUserReports,
    getDueReports,
    markReportRun,
    deactivateReport,
};
