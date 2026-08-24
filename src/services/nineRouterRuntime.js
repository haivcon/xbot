'use strict';

function runtimeError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function nonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function createNineRouterRuntime(options = {}) {
    const featureEnabled = options.enabled === true;
    let connected = featureEnabled && options.connected === true;
    let connectedAt = connected ? Date.now() : null;
    let modelCount = 0;
    let upstreamCount = 0;
    let lifecycleGeneration = 0;
    const activeControllers = new Set();
    const probeControllers = new Set();
    const usage = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    function assertConnected() {
        if (!featureEnabled) throw runtimeError('FEATURE_DISABLED', '9Router integration is disabled');
        if (!connected) throw runtimeError('CONNECTION_DISABLED', '9Router connection is disconnected');
    }

    function getStatus(extra = {}) {
        return {
            provider: '9router',
            featureEnabled,
            configured: extra.configured === true,
            connected,
            code: !featureEnabled ? 'FEATURE_DISABLED' : connected ? 'CONNECTED' : 'DISCONNECTED',
            connectedAt,
            modelCount,
            upstreamCount,
            activeRequests: activeControllers.size,
            usage: { ...usage }
        };
    }

    async function connect({ probe } = {}) {
        if (!featureEnabled) throw runtimeError('FEATURE_DISABLED', '9Router integration is disabled');
        if (typeof probe !== 'function') throw runtimeError('PROBE_REQUIRED', 'A 9Router discovery probe is required');
        for (const controller of probeControllers) {
            if (!controller.signal.aborted) {
                controller.abort(runtimeError('CONNECTION_SUPERSEDED', 'A newer 9Router connection probe started'));
            }
        }
        const generation = ++lifecycleGeneration;
        const probeController = new AbortController();
        activeControllers.add(probeController);
        probeControllers.add(probeController);
        let discovery;
        try {
            discovery = await probe({ signal: probeController.signal });
        } catch (error) {
            if (probeController.signal.aborted && probeController.signal.reason?.code) {
                throw probeController.signal.reason;
            }
            throw error;
        } finally {
            activeControllers.delete(probeController);
            probeControllers.delete(probeController);
        }
        if (generation !== lifecycleGeneration) {
            if (probeController.signal.reason?.code) throw probeController.signal.reason;
            throw runtimeError('CONNECTION_SUPERSEDED', 'A newer 9Router connection probe completed first');
        }
        if (!Array.isArray(discovery?.models) || discovery.models.length === 0) {
            throw runtimeError('DISCOVERY_INVALID', '9Router returned no usable models');
        }
        connected = true;
        connectedAt = Date.now();
        modelCount = discovery.models.length;
        upstreamCount = Array.isArray(discovery.upstreams) ? discovery.upstreams.length : 0;
        return getStatus({ configured: true });
    }

    function disconnect() {
        lifecycleGeneration += 1;
        connected = false;
        connectedAt = null;
        let cancelledRequests = 0;
        for (const controller of activeControllers) {
            if (!controller.signal.aborted) {
                cancelledRequests += 1;
                controller.abort(runtimeError('CONNECTION_DISABLED', '9Router connection was disconnected'));
            }
        }
        activeControllers.clear();
        probeControllers.clear();
        return { ...getStatus(), cancelledRequests };
    }

    function register(controller) {
        assertConnected();
        if (!controller || typeof controller.abort !== 'function' || !controller.signal) {
            throw runtimeError('CONTROLLER_INVALID', 'An AbortController is required');
        }
        activeControllers.add(controller);
        let registered = true;
        return () => {
            if (!registered) return;
            registered = false;
            activeControllers.delete(controller);
        };
    }

    function recordUsage(providerUsage = {}) {
        usage.requests += 1;
        usage.promptTokens += nonNegativeInteger(providerUsage.prompt_tokens);
        usage.completionTokens += nonNegativeInteger(providerUsage.completion_tokens);
        usage.totalTokens += nonNegativeInteger(providerUsage.total_tokens);
        return { ...usage };
    }

    return { assertConnected, connect, disconnect, getStatus, recordUsage, register };
}

const nineRouterRuntime = createNineRouterRuntime({
    enabled: String(process.env.ROUTER_ENABLED || '').toLowerCase() === 'true'
});

module.exports = { createNineRouterRuntime, nineRouterRuntime, runtimeError };
