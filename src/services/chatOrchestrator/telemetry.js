'use strict';

const state = { requests: 0, active: 0, outcomes: new Map() };
const ENGINES = new Set(['9router', 'xbot-agent']);
const OUTCOMES = new Set(['completed', 'failed', 'cancelled']);

function normalize(value, allowed, fallback) {
    const candidate = String(value || '').toLowerCase();
    return allowed.has(candidate) ? candidate : fallback;
}

function normalizeCode(value) {
    const candidate = String(value || 'ok').toUpperCase();
    return /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : 'UNKNOWN';
}

function beginChatRequest() {
    state.requests += 1;
    state.active += 1;
    let ended = false;
    return () => {
        if (ended) return;
        ended = true;
        state.active = Math.max(0, state.active - 1);
    };
}

function recordChatOutcome({ engine, outcome, code }) {
    const key = [normalize(engine, ENGINES, 'unknown'), normalize(outcome, OUTCOMES, 'failed'), normalizeCode(code)].join(':');
    state.outcomes.set(key, (state.outcomes.get(key) || 0) + 1);
}

function snapshotChatTelemetry() {
    return { requests: state.requests, active: state.active, outcomes: Object.fromEntries(state.outcomes) };
}

function renderChatMetrics() {
    const lines = [
        '# HELP chat_ai_requests_total Total admitted Chat AI requests',
        '# TYPE chat_ai_requests_total counter',
        `chat_ai_requests_total ${state.requests}`,
        '# HELP chat_ai_requests_active Current admitted Chat AI requests',
        '# TYPE chat_ai_requests_active gauge',
        `chat_ai_requests_active ${state.active}`,
        '# HELP chat_ai_outcomes_total Chat AI terminal outcomes',
        '# TYPE chat_ai_outcomes_total counter'
    ];
    for (const [key, count] of state.outcomes) {
        const [engine, outcome, code] = key.split(':');
        lines.push(`chat_ai_outcomes_total{engine="${engine}",outcome="${outcome}",code="${code}"} ${count}`);
    }
    return lines.join('\n');
}

function resetChatTelemetry() {
    state.requests = 0;
    state.active = 0;
    state.outcomes.clear();
}

module.exports = { beginChatRequest, recordChatOutcome, snapshotChatTelemetry, renderChatMetrics, resetChatTelemetry };