'use strict';

const EXECUTION_DISABLED_CODE = 'EXECUTION_DISABLED';
const EXECUTION_DISABLED_MESSAGE = 'Execution is disabled by runtime policy.';
let priceAlertSchedulerRunning = false;

function isExecutionDisabled(value = process.env.EXECUTION_DISABLED) {
    return String(value ?? '').trim().toLowerCase() !== 'false';
}

function isPriceAlertSchedulerEnabled(value = process.env.PRICE_ALERT_SCHEDULER_ENABLED) {
    return String(value ?? '').trim().toLowerCase() === 'true';
}

function setPriceAlertSchedulerRunning(running) {
    priceAlertSchedulerRunning = Boolean(running);
}

function getPriceAlertSchedulerStatus() {
    return {
        priceAlertSchedulerEnabled: isPriceAlertSchedulerEnabled(),
        priceAlertSchedulerRunning,
    };
}

function createExecutionDisabledError() {
    const error = new Error(EXECUTION_DISABLED_MESSAGE);
    error.code = EXECUTION_DISABLED_CODE;
    error.status = 503;
    return error;
}

function assertExecutionEnabled() {
    if (isExecutionDisabled()) throw createExecutionDisabledError();
}

function guardExecution(operation) {
    return async function guardedExecution(...args) {
        assertExecutionEnabled();
        return operation.apply(this, args);
    };
}

function sendExecutionDisabled(res) {
    return res.status(503).json({
        error: EXECUTION_DISABLED_MESSAGE,
        code: EXECUTION_DISABLED_CODE,
    });
}

function getRuntimeCapabilities() {
    const executionEnabled = !isExecutionDisabled();
    return {
        telegramIngress: true,
        api: true,
        staticDashboard: true,
        execution: executionEnabled,
        autonomousActions: executionEnabled,
        ...getPriceAlertSchedulerStatus(),
    };
}

module.exports = {
    EXECUTION_DISABLED_CODE,
    EXECUTION_DISABLED_MESSAGE,
    isExecutionDisabled,
    isPriceAlertSchedulerEnabled,
    setPriceAlertSchedulerRunning,
    getPriceAlertSchedulerStatus,
    createExecutionDisabledError,
    assertExecutionEnabled,
    guardExecution,
    sendExecutionDisabled,
    getRuntimeCapabilities,
};
