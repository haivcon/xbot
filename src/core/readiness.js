'use strict';

const { UNKNOWN_RELEASE } = require('./releaseManifest');

const COMPONENTS = [
    ['database', 'database'],
    ['telegramIngress', 'telegram_ingress'],
    ['httpServer', 'http_server'],
    ['staticDashboard', 'static_dashboard']
];

function componentStatus(value) {
    if (value === true) return 'ok';
    if (value === false) return 'error';
    return 'unknown';
}

function normalizeNineRouter(value) {
    return ['ok', 'degraded', 'unknown'].includes(value) ? value : 'unknown';
}

function evaluateReadiness(state = {}) {
    const required = {};
    const reasons = [];
    for (const [key, reasonPrefix] of COMPONENTS) {
        const status = componentStatus(state[key]);
        required[key] = status;
        if (status !== 'ok') reasons.push(`${reasonPrefix}_${status}`);
    }

    let priceAlerts = 'disabled';
    if (state.priceAlertSchedulerEnabled) {
        priceAlerts = state.priceAlertSchedulerRunning ? 'running' : 'error';
        if (!state.priceAlertSchedulerRunning) reasons.push('price_alert_scheduler_not_running');
    }

    const release = state.release || { ...UNKNOWN_RELEASE };
    if (state.manifestRequired && release.gitSha === 'unknown') {
        reasons.push('release_manifest_unavailable');
    }

    return {
        status: reasons.length === 0 ? 'ready' : 'not_ready',
        required,
        optional: {
            priceAlerts,
            nineRouter: normalizeNineRouter(state.nineRouter)
        },
        reasons,
        release
    };
}

function createReadinessRuntime({ release = UNKNOWN_RELEASE, manifestRequired = false } = {}) {
    const state = {
        httpServer: undefined,
        database: undefined,
        telegramIngress: undefined,
        staticDashboard: undefined,
        priceAlertSchedulerEnabled: false,
        priceAlertSchedulerRunning: false,
        nineRouter: 'unknown',
        release,
        manifestRequired
    };
    return {
        evaluate(overrides = {}) { return evaluateReadiness({ ...state, ...overrides }); },
        getRelease() { return state.release; },
        markDatabaseReady() { state.database = true; },
        markDatabaseError() { state.database = false; },
        markTelegramIngressReady() { state.telegramIngress = true; },
        markTelegramIngressError() { state.telegramIngress = false; },
        markStaticDashboardReady() { state.staticDashboard = true; },
        markStaticDashboardError() { state.staticDashboard = false; },
        markHttpServerReady() { state.httpServer = true; },
        markHttpServerError() { state.httpServer = false; },
        markShuttingDown() { state.httpServer = false; },
        setNineRouter(status) { state.nineRouter = normalizeNineRouter(status); }
    };
}

function createControlHandlers({ runtime, getSchedulerStatus, getNineRouterStatus = () => 'unknown' }) {
    return {
        health(_req, res) {
            const scheduler = getSchedulerStatus();
            const schedulerHealthy = !scheduler.priceAlertSchedulerEnabled || scheduler.priceAlertSchedulerRunning;
            return res.json({
                status: schedulerHealthy ? 'ok' : 'degraded',
                ...scheduler,
                release: runtime.getRelease()
            });
        },
        ready(_req, res) {
            const readiness = runtime.evaluate({
                ...getSchedulerStatus(),
                nineRouter: getNineRouterStatus()
            });
            return res.status(readiness.status === 'ready' ? 200 : 503).json(readiness);
        }
    };
}

module.exports = { createControlHandlers, createReadinessRuntime, evaluateReadiness };
