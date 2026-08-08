'use strict';

const { recordAuditEntry } = require('../../skills/audit-log');

const ACTIONS = new Set([
    'request_started', 'routing_decision', 'tool_started', 'tool_completed',
    'approval_submitted', 'request_completed', 'request_cancelled', 'request_failed'
]);
const ENGINES = new Set(['9router', 'xbot-agent', 'unknown']);
const OUTCOMES = new Set(['started', 'completed', 'cancelled', 'failed', 'fallback', 'unknown']);

function bounded(value, fallback, max = 128) {
    const candidate = String(value || '')
        .replace(/[^A-Za-z0-9_.:-]/g, '_')
        .replace(/^[._]+/, '')
        .slice(0, max);
    return candidate || fallback;
}

function recordChatAudit(event = {}) {
    const action = ACTIONS.has(event.action) ? event.action : 'request_failed';
    const engine = ENGINES.has(event.engine) ? event.engine : 'unknown';
    const outcome = OUTCOMES.has(event.outcome) ? event.outcome : 'unknown';
    recordAuditEntry({
        tenantId: bounded(event.tenantId, 'unknown'),
        userId: bounded(event.userId, 'unknown'),
        requestId: bounded(event.requestId, 'unknown'),
        action,
        engine,
        tool: bounded(event.tool, 'none'),
        outcome,
        code: bounded(String(event.code || 'OK').toUpperCase(), 'UNKNOWN', 64)
    });
}

module.exports = { recordChatAudit };
