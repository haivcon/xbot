/**
 * Core Database Module
 * Provides database connection, helpers, and shared utilities
 * File: db/core.js
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const ethers = require('ethers');

// Database connection
const db = new sqlite3.Database('banmao.db', (err) => {
    if (err) {
        console.error("LỖI KHỞI TẠO DB:", err.message);
        process.exit(1);
    }
    console.log("Cơ sở dữ liệu SQLite đã kết nối.");
});

// --- Promisified Database Helpers ---
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// --- Constants ---
const DEFAULT_QUOTE_TARGETS = ['USDT', 'OKB'];
const FILTERS_TABLE = 'group_filters';
const PRICE_ALERT_DEFAULT_INTERVAL = 300; // seconds
const PRICE_ALERT_MIN_INTERVAL = 30; // seconds
const PRICE_ALERT_MAX_INTERVAL = 24 * 60 * 60; // seconds

// --- Utility Functions ---
function safeJsonParse(text, fallback) {
    if (!text) return fallback;
    try {
        const parsed = JSON.parse(text);
        return parsed ?? fallback;
    } catch (error) {
        return fallback;
    }
}

function normalizeWalletAddressSafe(address) {
    if (!address) return null;
    try {
        return ethers.getAddress(address);
    } catch (error) {
        return null;
    }
}

function normalizeTokenKey(token) {
    if (!token) return null;
    return token.toString().trim().toLowerCase();
}

function normalizePriceIntervalSeconds(value, fallback = PRICE_ALERT_DEFAULT_INTERVAL) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.min(Math.max(Math.floor(numeric), PRICE_ALERT_MIN_INTERVAL), PRICE_ALERT_MAX_INTERVAL);
}

function sanitizeTimeSlot(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function normalizeAutoMessageTimes(value, fallbackTime = '08:00') {
    let rawList = [];
    if (Array.isArray(value)) {
        rawList = value;
    } else if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            rawList = Array.isArray(parsed) ? parsed : value.split(',');
        } catch (error) {
            rawList = value.split(',');
        }
    }
    const seen = new Set();
    const normalized = [];
    for (const entry of rawList) {
        const slot = sanitizeTimeSlot(entry);
        if (!slot || seen.has(slot)) continue;
        seen.add(slot);
        normalized.push(slot);
    }
    if (normalized.length === 0) {
        const fallbackSlot = sanitizeTimeSlot(fallbackTime) || '08:00';
        return fallbackSlot ? [fallbackSlot] : [];
    }
    return normalized.sort();
}

function normalizeSummaryMessageTimes(value) {
    let rawList = [];
    if (Array.isArray(value)) {
        rawList = value;
    } else if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            rawList = Array.isArray(parsed) ? parsed : value.split(',');
        } catch (error) {
            rawList = value.split(',');
        }
    }
    const seen = new Set();
    const normalized = [];
    for (const entry of rawList) {
        const slot = sanitizeTimeSlot(entry);
        if (!slot || seen.has(slot)) continue;
        seen.add(slot);
        normalized.push(slot);
    }
    return normalized.sort();
}

// --- Date Utilities ---
function getTodayDateString(timezone = 'UTC') {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return formatter.format(new Date());
    } catch (error) {
        console.warn(`[Checkin] Không thể format ngày với timezone ${timezone}: ${error.message}`);
    }
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function normalizeDateString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    return trimmed;
}

function compareDateStrings(dateA, dateB) {
    const normalizedA = normalizeDateString(dateA);
    const normalizedB = normalizeDateString(dateB);
    if (!normalizedA || !normalizedB) return null;
    if (normalizedA === normalizedB) return 0;
    return normalizedA < normalizedB ? -1 : 1;
}

function getPreviousDate(dateStr) {
    const normalized = normalizeDateString(dateStr);
    if (!normalized) return null;
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// --- Checkin Defaults ---
const CHECKIN_DEFAULTS = {
    checkinTime: '08:00',
    timezone: 'UTC',
    autoMessageEnabled: 1,
    dailyPoints: 10,
    summaryWindow: 7,
    summaryPeriodStart: null,
    mathWeight: 2,
    physicsWeight: 1,
    chemistryWeight: 1,
    okxWeight: 1,
    cryptoWeight: 1,
    autoMessageTimes: ['08:00'],
    summaryMessageEnabled: 0,
    summaryMessageTimes: [],
    leaderboardPeriodStart: null,
    promptTemplate: ''
};

function resolveLeaderboardPeriodStart(value, timezone = CHECKIN_DEFAULTS.timezone) {
    const normalized = normalizeDateString(value);
    return normalized || getTodayDateString(timezone || CHECKIN_DEFAULTS.timezone);
}

function resolveSummaryPeriodStart(value) {
    return normalizeDateString(value) || null;
}

/**
 * Normalize chatId/userId to clean string without .0 suffix
 * Prevents duplicate records from float vs string mismatch
 */
function normalizeTargetId(id) {
    if (id === null || id === undefined) return null;
    return String(id).replace(/\.0$/, '');
}

module.exports = {
    // Database
    db,
    dbRun,
    dbGet,
    dbAll,

    // Constants
    DEFAULT_QUOTE_TARGETS,
    FILTERS_TABLE,
    PRICE_ALERT_DEFAULT_INTERVAL,
    PRICE_ALERT_MIN_INTERVAL,
    PRICE_ALERT_MAX_INTERVAL,
    CHECKIN_DEFAULTS,

    // Utilities
    safeJsonParse,
    normalizeWalletAddressSafe,
    normalizeTokenKey,
    normalizePriceIntervalSeconds,
    sanitizeTimeSlot,
    normalizeAutoMessageTimes,
    normalizeSummaryMessageTimes,

    // Date utilities
    getTodayDateString,
    normalizeDateString,
    compareDateStrings,
    getPreviousDate,
    resolveLeaderboardPeriodStart,
    resolveSummaryPeriodStart,

    // ID utilities
    normalizeTargetId
};
