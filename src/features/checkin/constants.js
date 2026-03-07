const CHECKIN_MAX_ATTEMPTS = 3;
const CHECKIN_SCIENCE_PROBABILITY = Math.min(
    Math.max(Number(process.env.CHECKIN_SCIENCE_PROBABILITY ?? 0.5), 0),
    1
);
const CHECKIN_SCHEDULER_INTERVAL = 45 * 1000;
const CHECKIN_DEFAULT_TIME = '08:00';
const CHECKIN_DEFAULT_TIMEZONE = 'UTC';
const ADMIN_DETAIL_BULLET = '• '; // Đã sửa từ ký tự lỗi
const CHECKIN_GOAL_PRESETS = [
    'checkin_goal_preset_learn',
    'checkin_goal_preset_task',
    'checkin_goal_preset_workout',
    'checkin_goal_preset_rest',
    'checkin_goal_preset_help'
];

const SCIENCE_CATEGORY_KEYS = ['physics', 'chemistry', 'okx', 'crypto'];
const QUESTION_TYPE_KEYS = ['math', ...SCIENCE_CATEGORY_KEYS];

const DEFAULT_QUESTION_WEIGHTS = (() => {
    if (Object.prototype.hasOwnProperty.call(process.env, 'CHECKIN_SCIENCE_PROBABILITY')) {
        const mathShare = Math.max(1 - CHECKIN_SCIENCE_PROBABILITY, 0);
        const scienceShare = Math.max(CHECKIN_SCIENCE_PROBABILITY, 0);
        if (mathShare + scienceShare > 0) {
            const sharedScience = SCIENCE_CATEGORY_KEYS.length > 0
                ? scienceShare / SCIENCE_CATEGORY_KEYS.length
                : scienceShare;
            return {
                math: mathShare,
                physics: sharedScience,
                chemistry: sharedScience,
                okx: sharedScience,
                crypto: sharedScience
            };
        }
    }
    return { math: 2, physics: 1, chemistry: 1, okx: 1, crypto: 1 };
})();

const QUESTION_WEIGHT_PRESETS = [
    { math: 40, physics: 15, chemistry: 15, okx: 15, crypto: 15 },
    { math: 34, physics: 22, chemistry: 22, okx: 11, crypto: 11 },
    { math: 30, physics: 20, chemistry: 20, okx: 15, crypto: 15 },
    { math: 25, physics: 25, chemistry: 25, okx: 12.5, crypto: 12.5 },
    { math: 50, physics: 15, chemistry: 15, okx: 10, crypto: 10 }
];

const CHECKIN_SCHEDULE_MAX_SLOTS = 6;
const CHECKIN_ADMIN_SUMMARY_MAX_ROWS = 30;
const CHECKIN_SCHEDULE_PRESETS = [
    { labelKey: 'checkin_admin_button_schedule_once', slots: ['08:00'] },
    { labelKey: 'checkin_admin_button_schedule_twice', slots: ['08:00', '20:00'] },
    { labelKey: 'checkin_admin_button_schedule_thrice', slots: ['07:00', '12:00', '21:00'] }
];
const CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT = 15;
const LEADERBOARD_MODE_CONFIG = [
    { key: 'streak', labelKey: 'checkin_admin_leaderboard_mode_streak' },
    { key: 'points', labelKey: 'checkin_admin_leaderboard_mode_points' },
    { key: 'total', labelKey: 'checkin_admin_leaderboard_mode_total' },
    { key: 'longest', labelKey: 'checkin_admin_leaderboard_mode_longest' }
];
const SUMMARY_DEFAULT_TIME = '21:00';
const SUMMARY_SCHEDULE_PRESETS = [
    { labelKey: 'checkin_admin_button_summary_schedule_once', slots: ['21:00'] },
    { labelKey: 'checkin_admin_button_summary_schedule_twice', slots: ['12:00', '21:00'] },
    { labelKey: 'checkin_admin_button_summary_schedule_thrice', slots: ['09:00', '15:00', '21:30'] }
];
const SUMMARY_BROADCAST_MAX_ROWS = 5;
const CHECKIN_ADMIN_DM_MAX_RECIPIENTS = 50;
const CHECKIN_ADMIN_PAGE_SIZE = 10;
const CHECKIN_ADMIN_EXPORT_FORMATS = ['csv', 'json'];
const WELCOME_VERIFICATION_DEFAULTS = {
    enabled: false,
    timeLimitSeconds: 60,
    maxAttempts: 3,
    action: 'kick',
    mathWeight: DEFAULT_QUESTION_WEIGHTS.math,
    physicsWeight: DEFAULT_QUESTION_WEIGHTS.physics,
    chemistryWeight: DEFAULT_QUESTION_WEIGHTS.chemistry,
    okxWeight: DEFAULT_QUESTION_WEIGHTS.okx,
    cryptoWeight: DEFAULT_QUESTION_WEIGHTS.crypto,
    titleTemplate: ''
};
const WELCOME_ENFORCEMENT_ACTIONS = ['kick', 'mute', 'ban'];
const WELCOME_QUEUE_INTERVAL_MS = 200;
const WELCOME_QUEUE_MAX_PER_TICK = 2;

function sanitizeWeightValue(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return Math.max(fallback, 0);
    }
    return numeric;
}

function formatTemplateWithVariables(template, replacements = {}) {
    if (!template || typeof template !== 'string') {
        return '';
    }

    const map = new Map(Object.entries(replacements));
    return template.replace(/<([^>]+)>/g, (_, key) => {
        const normalized = key.trim().toLowerCase();
        return map.get(normalized) ?? `<${key}>`;
    });
}

function getQuestionWeights(settings = null) {
    const fallback = DEFAULT_QUESTION_WEIGHTS;
    const weights = {
        math: sanitizeWeightValue(settings?.mathWeight, fallback.math),
        physics: sanitizeWeightValue(settings?.physicsWeight, fallback.physics),
        chemistry: sanitizeWeightValue(settings?.chemistryWeight, fallback.chemistry),
        okx: sanitizeWeightValue(settings?.okxWeight, fallback.okx),
        crypto: sanitizeWeightValue(settings?.cryptoWeight, fallback.crypto)
    };
    const total = QUESTION_TYPE_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
    if (total <= 0) {
        return { ...DEFAULT_QUESTION_WEIGHTS };
    }
    return weights;
}

function pickQuestionType(settings = null) {
    const weights = getQuestionWeights(settings);
    const total = QUESTION_TYPE_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
    if (total <= 0) {
        return 'math';
    }
    const roll = Math.random() * total;
    let accumulator = 0;
    for (const key of QUESTION_TYPE_KEYS) {
        accumulator += weights[key] || 0;
        if (roll < accumulator) {
            return key;
        }
    }
    return QUESTION_TYPE_KEYS[QUESTION_TYPE_KEYS.length - 1] || 'math';
}

function formatQuestionWeightPercentages(weights) {
    const total = QUESTION_TYPE_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
    if (total <= 0) {
        const zero = {};
        QUESTION_TYPE_KEYS.forEach((key) => { zero[key] = '0%'; });
        return zero;
    }
    const toPercent = (value) => `${Math.round((value / total) * 1000) / 10}%`;
    const percents = {};
    QUESTION_TYPE_KEYS.forEach((key) => { percents[key] = toPercent(weights[key]); });
    return percents;
}

function normalizeTimeSlot(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return null;
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        return null;
    }

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function sanitizeScheduleSlots(values = []) {
    const normalized = new Set();
    for (const value of values) {
        const slot = normalizeTimeSlot(value);
        if (slot) {
            normalized.add(slot);
        }
    }
    return Array.from(normalized);
}

function parseScheduleTextInput(text) {
    if (typeof text !== 'string') {
        return null;
    }

    const parts = text.split(/[\s,;]+/).map((part) => normalizeTimeSlot(part)).filter(Boolean);
    const unique = Array.from(new Set(parts));
    if (!unique.length) {
        return null;
    }

    return unique.slice(0, CHECKIN_SCHEDULE_MAX_SLOTS);
}

function getScheduleSlots(settings = null) {
    const slots = sanitizeScheduleSlots(settings?.autoMessageTimes || []);
    return slots.length ? slots : [CHECKIN_DEFAULT_TIME];
}

function getSummaryScheduleSlots(settings = null) {
    const slots = sanitizeScheduleSlots(settings?.summaryMessageTimes || []);
    return slots.length ? slots : [SUMMARY_DEFAULT_TIME];
}

module.exports = {
    ADMIN_DETAIL_BULLET,
    CHECKIN_ADMIN_DM_MAX_RECIPIENTS,
    CHECKIN_ADMIN_EXPORT_FORMATS,
    CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT,
    CHECKIN_ADMIN_PAGE_SIZE,
    CHECKIN_ADMIN_SUMMARY_MAX_ROWS,
    CHECKIN_DEFAULT_TIME,
    CHECKIN_DEFAULT_TIMEZONE,
    CHECKIN_GOAL_PRESETS,
    CHECKIN_MAX_ATTEMPTS,
    CHECKIN_SCHEDULE_MAX_SLOTS,
    CHECKIN_SCHEDULE_PRESETS,
    CHECKIN_SCIENCE_PROBABILITY,
    CHECKIN_SCHEDULER_INTERVAL,
    DEFAULT_QUESTION_WEIGHTS,
    LEADERBOARD_MODE_CONFIG,
    QUESTION_TYPE_KEYS,
    QUESTION_WEIGHT_PRESETS,
    SCIENCE_CATEGORY_KEYS,
    SUMMARY_BROADCAST_MAX_ROWS,
    SUMMARY_DEFAULT_TIME,
    SUMMARY_SCHEDULE_PRESETS,
    WELCOME_ENFORCEMENT_ACTIONS,
    WELCOME_QUEUE_INTERVAL_MS,
    WELCOME_QUEUE_MAX_PER_TICK,
    WELCOME_VERIFICATION_DEFAULTS,
    formatQuestionWeightPercentages,
    formatTemplateWithVariables,
    getQuestionWeights,
    getScheduleSlots,
    getSummaryScheduleSlots,
    normalizeTimeSlot,
    parseScheduleTextInput,
    pickQuestionType,
    sanitizeScheduleSlots,
    sanitizeWeightValue
};