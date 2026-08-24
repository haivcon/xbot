'use strict';

const EXECUTION_DISABLED_CODE = 'EXECUTION_DISABLED';
const EXECUTION_DISABLED_MESSAGE = 'Execution is disabled by runtime policy.';

function isExecutionDisabled(value = process.env.EXECUTION_DISABLED) {
    return String(value ?? '').trim().toLowerCase() !== 'false';
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
    };
}

module.exports = {
    EXECUTION_DISABLED_CODE,
    EXECUTION_DISABLED_MESSAGE,
    isExecutionDisabled,
    createExecutionDisabledError,
    assertExecutionEnabled,
    guardExecution,
    sendExecutionDisabled,
    getRuntimeCapabilities,
};
