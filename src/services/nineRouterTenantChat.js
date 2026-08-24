'use strict';

const crypto = require('crypto');
const { NINEROUTER_MODEL } = require('../config/env');
const { createChatOrchestrator } = require('./chatOrchestrator');
const { createNineRouterConnection } = require('./nineRouterConnection');
const {
    createTenantHeaders,
    getConfig,
    normalizeTenantId
} = require('./nineRouterTenantClient');

const defaultOrchestrators = new Map();

function canonicalTenantIdentity(userId) {
    const tenantId = normalizeTenantId(userId);
    return Object.freeze({ tenantId, userId: tenantId });
}

function getTenantApiRoot() {
    return `${getConfig().baseUrl}/v1`;
}

function buildTenantHeaders(identity, request) {
    const canonical = canonicalTenantIdentity(identity?.userId);
    return createTenantHeaders({
        tenantId: canonical.tenantId,
        method: request.method,
        path: request.path,
        body: request.body
    });
}

function createTenantDiscoveryConnection(options = {}) {
    return createNineRouterConnection({
        baseUrl: options.baseUrl || getTenantApiRoot(),
        buildHeaders: options.buildHeaders || ((identity, request) => buildTenantHeaders(identity, {
            ...request,
            path: `/v1${request.path}`
        })),
        allowedModels: options.allowedModels || [],
        allowDynamicModels: true,
        timeoutMs: options.timeoutMs || 5000,
        fetchImpl: options.fetchImpl
    });
}

async function discoverTenantModels({ userId, signal, connection } = {}) {
    const identity = canonicalTenantIdentity(userId);
    const discovery = await (connection || createTenantDiscoveryConnection()).discover(identity, { signal });
    return {
        ...discovery,
        identity,
        modelIds: discovery.models.map(model => model.id)
    };
}

function selectTenantModel(discovery, requestedModel) {
    const modelIds = Array.isArray(discovery?.modelIds)
        ? discovery.modelIds
        : (discovery?.models || []).map(model => model.id);
    const requested = String(requestedModel || '').trim();
    const configured = String(NINEROUTER_MODEL || '').trim();
    const selected = requested || (configured && modelIds.includes(configured) ? configured : '') || modelIds[0] || '';

    if (!selected) {
        const error = new Error('No model is available for this tenant');
        error.code = 'NO_ALLOWED_MODELS';
        error.status = 503;
        throw error;
    }
    if (!modelIds.includes(selected)) {
        const error = new Error('Requested model is not available for this tenant');
        error.code = 'MODEL_NOT_ALLOWED';
        error.status = 400;
        throw error;
    }
    return selected;
}

function createTenantChatOrchestrator(options = {}) {
    return createChatOrchestrator({
        ...options,
        baseUrl: options.baseUrl || getTenantApiRoot(),
        buildHeaders: options.buildHeaders || buildTenantHeaders
    });
}

function getDefaultOrchestrator(allowedModels, options = {}) {
    const normalizedModels = [...new Set(allowedModels.map(String).filter(Boolean))].sort();
    const key = normalizedModels.join('\n');
    if (!defaultOrchestrators.has(key)) {
        defaultOrchestrators.set(key, createTenantChatOrchestrator({
            allowedModels: normalizedModels,
            timeoutMs: options.timeoutMs || 60_000,
            maxConcurrentPerTenant: options.maxConcurrentPerTenant || 2,
            rateLimitPerMinute: options.rateLimitPerMinute || 15,
            maxInputTokens: options.maxInputTokens || 25_000,
            maxOutputTokens: options.maxOutputTokens || 8192,
            circuitFailureThreshold: options.circuitFailureThreshold || 5,
            circuitResetMs: options.circuitResetMs || 30_000,
            fetchImpl: options.fetchImpl
        }));
    }
    return defaultOrchestrators.get(key);
}

async function completeTenantChat({
    userId,
    messages,
    model,
    requestId,
    signal,
    onEvent,
    connection,
    orchestrator,
    orchestratorOptions
} = {}) {
    const discovery = await discoverTenantModels({ userId, signal, connection });
    const selectedModel = selectTenantModel(discovery, model);
    const activeOrchestrator = orchestrator
        || getDefaultOrchestrator(discovery.modelIds, orchestratorOptions);
    const stableRequestId = String(requestId || crypto.randomUUID());

    const result = await activeOrchestrator.streamChat({
        ...discovery.identity,
        model: selectedModel,
        messages,
        requestId: stableRequestId
    }, {
        signal,
        onEvent: onEvent || (() => {})
    });

    return {
        ...result,
        model: selectedModel,
        provider: '9router',
        identity: discovery.identity
    };
}

function classifyTenantChatError(error) {
    const code = String(error?.code || '');
    const status = Number(error?.status || error?.response?.status || 0);
    if (code === 'CLIENT_ABORTED') return 'CLIENT_ABORTED';
    if (code === 'UPSTREAM_TIMEOUT' || code === 'UPSTREAM_ABORTED') return 'UPSTREAM_TIMEOUT';
    if (code === 'MODEL_NOT_ALLOWED') return 'MODEL_NOT_ALLOWED';
    if (code === 'NO_ALLOWED_MODELS' || code === 'NO_ALLOWED_MODELS') return 'NO_ALLOWED_MODELS';
    if (status === 429 || code === 'TENANT_RATE_LIMIT') return 'QUOTA_EXHAUSTED';
    if (status === 401 || status === 403 || code === 'DISCOVERY_UPSTREAM_ERROR') {
        return status === 401 || status === 403 ? 'TENANT_NOT_CONFIGURED' : 'SIDECAR_UNAVAILABLE';
    }
    return 'SIDECAR_UNAVAILABLE';
}

function clearTenantChatCachesForTests() {
    if (process.env.NODE_ENV === 'test') defaultOrchestrators.clear();
}

module.exports = {
    buildTenantHeaders,
    canonicalTenantIdentity,
    classifyTenantChatError,
    clearTenantChatCachesForTests,
    completeTenantChat,
    createTenantChatOrchestrator,
    createTenantDiscoveryConnection,
    discoverTenantModels,
    getTenantApiRoot,
    selectTenantModel
};