'use strict';

const crypto = require('crypto');
const { normalizeTenantId } = require('./nineRouterTenantClient');

const DEFAULT_RETURN_TARGET = '/xBot/?section=providers';
const CALLBACK_PATH_PREFIX = '/api/dashboard/ai/9router/oauth/callback/';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RATE_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_STARTS = 5;

function oauthError(code, message, statusCode = 400) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    return error;
}

function normalizePublicOrigin(value) {
    let url;
    try { url = new URL(String(value || '')); } catch {
        throw oauthError('OAUTH_ORIGIN_CONFIG_INVALID', 'OAuth public origin must be a valid HTTPS URL', 503);
    }
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host === '::1' || /^127\./.test(host)
        || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        || !host.includes('.');
    if (url.protocol !== 'https:') throw oauthError('OAUTH_ORIGIN_CONFIG_INVALID', 'OAuth public origin must use HTTPS', 503);
    if (url.username || url.password || privateHost) throw oauthError('OAUTH_ORIGIN_CONFIG_INVALID', 'OAuth public origin must be public and credential-free', 503);
    return url.origin;
}

function safeReturnTarget(value) {
    const candidate = String(value || '');
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return DEFAULT_RETURN_TARGET;
    try {
        const parsed = new URL(candidate, 'https://return.invalid');
        if (parsed.origin !== 'https://return.invalid' || parsed.pathname !== '/xBot/') return DEFAULT_RETURN_TARGET;
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return DEFAULT_RETURN_TARGET;
    }
}

function sessionBinding(value) {
    const token = String(value || '');
    if (!token) throw oauthError('OAUTH_SESSION_REQUIRED', 'An authenticated dashboard session is required', 401);
    return crypto.createHash('sha256').update(token).digest('base64url');
}

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function timingSafeEqualText(a, b) {
    const left = Buffer.from(String(a || ''));
    const right = Buffer.from(String(b || ''));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createOAuthRedirectCoordinator(options = {}) {
    const publicOrigin = normalizePublicOrigin(options.publicOrigin);
    const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
    const now = options.now || Date.now;
    const requestForTenant = options.requestForTenant;
    const maxStartsPerWindow = Number(options.maxStartsPerWindow || DEFAULT_MAX_STARTS);
    const rateWindowMs = Number(options.rateWindowMs || DEFAULT_RATE_WINDOW_MS);
    const supportedProviders = new Set(options.supportedProviders || ['antigravity']);
    if (typeof requestForTenant !== 'function') throw new TypeError('requestForTenant is required');

    const recordsByState = new Map();
    const statesByStatus = new Map();
    const rateBuckets = new Map();

    function reap() {
        const current = now();
        for (const [state, record] of recordsByState) {
            if (record.expiresAt + ttlMs < current) {
                recordsByState.delete(state);
                statesByStatus.delete(record.statusToken);
            }
        }
    }

    function rateLimit(tenantId) {
        const current = now();
        let bucket = rateBuckets.get(tenantId);
        if (!bucket || current >= bucket.resetAt) bucket = { count: 0, resetAt: current + rateWindowMs };
        bucket.count += 1;
        rateBuckets.set(tenantId, bucket);
        if (bucket.count > maxStartsPerWindow) throw oauthError('OAUTH_RATE_LIMITED', 'Too many OAuth attempts', 429);
    }

    async function start({ userId, sessionToken, provider, returnTarget }) {
        reap();
        const tenantId = normalizeTenantId(userId);
        const binding = sessionBinding(sessionToken);
        const normalizedProvider = String(provider || '').toLowerCase();
        if (!supportedProviders.has(normalizedProvider)) {
            throw oauthError('OAUTH_PROVIDER_UNAVAILABLE', 'Provider does not support secure public redirect authentication', 400);
        }
        rateLimit(tenantId);
        const state = randomToken();
        const statusToken = randomToken();
        const callbackUri = `${publicOrigin}${CALLBACK_PATH_PREFIX}${encodeURIComponent(normalizedProvider)}`;
        let response;
        try {
            response = await requestForTenant({
                tenantId,
                method: 'POST',
                path: `/api/oauth/${encodeURIComponent(normalizedProvider)}/redirect-authorize`,
                data: { callbackUri, state },
                management: true,
                timeoutMs: 15_000
            });
        } catch (error) {
            if (error?.response?.status === 409 || error?.code === 'OAUTH_CONFIGURATION_REQUIRED') {
                throw oauthError('OAUTH_CONFIGURATION_REQUIRED', 'Provider OAuth configuration is required', 409);
            }
            if (error?.response?.status === 404 || error?.response?.status === 400) {
                throw oauthError('OAUTH_PROVIDER_UNAVAILABLE', 'Provider does not support secure public redirect authentication', 400);
            }
            throw oauthError('OAUTH_START_FAILED', 'Provider sign-in could not be started', 502);
        }
        const data = response?.data || {};
        if (!data.authorizationUrl || !data.codeVerifier || !timingSafeEqualText(data.state, state)) {
            throw oauthError('OAUTH_START_FAILED', 'Provider returned invalid authorization metadata', 502);
        }
        const record = {
            state,
            statusToken,
            tenantId,
            sessionBinding: binding,
            provider: normalizedProvider,
            callbackUri,
            returnTarget: safeReturnTarget(returnTarget),
            codeVerifier: data.codeVerifier,
            createdAt: now(),
            expiresAt: now() + ttlMs,
            consumed: false,
            terminal: { status: 'pending' }
        };
        recordsByState.set(state, record);
        statesByStatus.set(statusToken, state);
        return { authorizationUrl: data.authorizationUrl, statusToken, expiresIn: Math.floor(ttlMs / 1000) };
    }

    function status({ userId, sessionToken, statusToken }) {
        reap();
        const tenantId = normalizeTenantId(userId);
        const binding = sessionBinding(sessionToken);
        const state = statesByStatus.get(String(statusToken || ''));
        const record = state ? recordsByState.get(state) : null;
        if (!record || record.tenantId !== tenantId || !timingSafeEqualText(record.sessionBinding, binding)) {
            throw oauthError('OAUTH_STATUS_NOT_FOUND', 'OAuth status was not found', 404);
        }
        return { ...record.terminal };
    }

    async function callback({ provider, state, code, error, observedOrigin }) {
        reap();
        const normalizedProvider = String(provider || '').toLowerCase();
        const record = recordsByState.get(String(state || ''));
        if (!record || record.consumed || record.provider !== normalizedProvider) {
            throw oauthError('OAUTH_STATE_INVALID', 'OAuth state is invalid or already used', 400);
        }
        if (now() > record.expiresAt) {
            record.consumed = true;
            record.terminal = { status: 'expired', code: 'state_expired' };
            throw oauthError('OAUTH_STATE_EXPIRED', 'OAuth state expired', 400);
        }
        if (String(observedOrigin || '') !== publicOrigin) {
            throw oauthError('OAUTH_ORIGIN_INVALID', 'OAuth callback origin is invalid', 400);
        }

        // Consume synchronously before any asynchronous exchange so concurrent replays fail.
        record.consumed = true;
        if (error) {
            record.terminal = { status: 'denied', code: 'provider_denied' };
            return { returnTarget: record.returnTarget, resultCode: 'provider_denied' };
        }
        if (!code) {
            record.terminal = { status: 'failed', code: 'missing_code' };
            return { returnTarget: record.returnTarget, resultCode: 'missing_code' };
        }
        try {
            const response = await requestForTenant({
                tenantId: record.tenantId,
                method: 'POST',
                path: `/api/oauth/${encodeURIComponent(record.provider)}/redirect-exchange`,
                data: {
                    code: String(code),
                    state: record.state,
                    callbackUri: record.callbackUri,
                    codeVerifier: record.codeVerifier
                },
                management: true,
                timeoutMs: 20_000
            });
            const connection = response?.data?.connection;
            if (!response?.data?.success || !connection?.id || connection.provider !== record.provider) {
                throw new Error('invalid exchange response');
            }
            record.codeVerifier = undefined;
            record.terminal = { status: 'connected', provider: record.provider };
            return { returnTarget: record.returnTarget, resultCode: 'connected' };
        } catch {
            record.codeVerifier = undefined;
            record.terminal = { status: 'failed', code: 'exchange_failed' };
            return { returnTarget: record.returnTarget, resultCode: 'exchange_failed' };
        }
    }

    return {
        start,
        status,
        callback,
        _stateForTests(statusToken) { return statesByStatus.get(statusToken); }
    };
}

module.exports = {
    CALLBACK_PATH_PREFIX,
    DEFAULT_RETURN_TARGET,
    createOAuthRedirectCoordinator,
    normalizePublicOrigin,
    safeReturnTarget
};
