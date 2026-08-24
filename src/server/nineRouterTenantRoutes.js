'use strict';

const crypto = require('crypto');
const { Router } = require('express');
const logger = require('../core/logger');
const {
    isAllowedManagementPath,
    normalizeTenantId,
    requestForTenant,
    sanitizeProxyHeaders
} = require('../services/nineRouterTenantClient');

const log = logger.child('NineRouterTenantGateway');
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_LIMIT_BYTES = 256 * 1024;
const SECRET_BODY_LIMIT_BYTES = 20 * 1024;
const CSRF_TTL_MS = 5 * 60 * 1000;
const SECRET_RATE_LIMIT = 5;
const SECRET_RATE_WINDOW_MS = 60 * 1000;
const csrfTokens = new Map();
const actionBuckets = new Map();

function sessionBinding(req) {
    return crypto.createHash('sha256').update(String(req.headers.authorization || '')).digest('hex');
}

function sameOrigin(req) {
    const origin = String(req.headers.origin || '');
    if (!origin) return false;
    const allowed = new Set();
    try { allowed.add(new URL(String(process.env.PUBLIC_BASE_URL || '')).origin); } catch { /* not configured */ }
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || (req.secure ? 'https' : 'http');
    if (req.headers.host) allowed.add(`${protocol}://${req.headers.host}`);
    return allowed.has(origin);
}

function issueCsrf(req) {
    const value = crypto.randomBytes(32).toString('base64url');
    csrfTokens.set(crypto.createHash('sha256').update(value).digest('hex'), {
        tenantId: normalizeTenantId(req.dashboardUser?.userId),
        session: sessionBinding(req),
        expiresAt: Date.now() + CSRF_TTL_MS
    });
    return value;
}

function consumeCsrf(req) {
    const value = String(req.headers['x-csrf-token'] || '');
    if (!/^[A-Za-z0-9_-]{40,}$/.test(value)) return false;
    const key = crypto.createHash('sha256').update(value).digest('hex');
    const record = csrfTokens.get(key);
    csrfTokens.delete(key);
    return Boolean(record
        && record.expiresAt >= Date.now()
        && record.tenantId === normalizeTenantId(req.dashboardUser?.userId)
        && record.session === sessionBinding(req));
}

function actionRateAllowed(req, provider) {
    const key = `${normalizeTenantId(req.dashboardUser?.userId)}:${provider}`;
    const now = Date.now();
    let bucket = actionBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + SECRET_RATE_WINDOW_MS };
    bucket.count += 1;
    actionBuckets.set(key, bucket);
    return bucket.count <= SECRET_RATE_LIMIT;
}

function validActionBody(action, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    const keys = Object.keys(body);
    if (action === 'manual-secret') {
        if (keys.length !== 1 || keys[0] !== 'input') return false;
        if (typeof body.input === 'string') {
            return body.input.length > 0 && !/[\u0000-\u001f\u007f]/.test(body.input);
        }
        if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)) return false;
        return Object.values(body.input).every(value => typeof value === 'string' && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value));
    }
    if (action === 'free-enable' || action === 'service-probe') return keys.length === 0;
    if (action === 'start-proxy') {
        return keys.length === 1 && keys[0] === 'provider'
            && ['codex', 'antigravity', 'gemini-cli'].includes(body.provider);
    }
    if (action === 'stop-proxy') {
        return keys.length === 2 && keys.includes('provider') && keys.includes('state')
            && ['codex', 'antigravity', 'gemini-cli'].includes(body.provider)
            && /^[A-Za-z0-9_-]{20,128}$/.test(body.state);
    }
    return true;
}

function safeErrorPayload(error) {
    const upstreamStatus = Number(error?.response?.status) || Number(error?.statusCode) || 502;
    const status = upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502;
    const upstreamCode = String(error?.response?.data?.code || '');
    const typedCode = /^[A-Z][A-Z0-9_]{2,63}$/.test(upstreamCode) ? upstreamCode : '';
    if (typedCode) {
        const typedMessage = typedCode === 'UPSTREAM_SERVICE_ENDED'
            ? 'The reviewed upstream service has ended'
            : 'Provider action failed';
        return { status, body: { error: typedMessage, code: typedCode } };
    }
    const category = status === 401 || status === 403
        ? 'NINEROUTER_NOT_CONFIGURED'
        : status === 429
            ? 'NINEROUTER_QUOTA_EXHAUSTED'
            : status === 408 || status === 504 || error?.code === 'ECONNABORTED'
                ? 'NINEROUTER_TIMEOUT'
                : 'NINEROUTER_UNAVAILABLE';
    const message = category === 'NINEROUTER_NOT_CONFIGURED'
        ? 'AI provider configuration is required'
        : category === 'NINEROUTER_QUOTA_EXHAUSTED'
            ? 'AI provider quota is currently unavailable'
            : category === 'NINEROUTER_TIMEOUT'
                ? 'AI provider request timed out'
                : 'AI provider service is temporarily unavailable';
    return { status, body: { error: message, code: category } };
}

function createNineRouterTenantRoutes() {
    const router = Router();

    router.get('/csrf', (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ csrfToken: issueCsrf(req), expiresIn: Math.floor(CSRF_TTL_MS / 1000) });
    });

    router.use((req, res, next) => {
        const contentLength = Number(req.headers['content-length'] || 0);
        if (contentLength > BODY_LIMIT_BYTES) {
            return res.status(413).json({ error: 'Request body is too large' });
        }
        if (!METHODS.has(req.method)) {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return next();
    });

    router.all('/*', async (req, res) => {
        try {
            const tenantId = normalizeTenantId(req.dashboardUser?.userId);
            const upstreamPath = `/api/${String(req.params[0] || '').replace(/^\/+/, '')}`;
            if (!isAllowedManagementPath(upstreamPath)) {
                return res.status(404).json({ error: '9Router endpoint is not available' });
            }

            const protectedMatch = upstreamPath.match(/^\/api\/oauth\/([A-Za-z0-9._~-]+)\/(manual-start|manual-complete|manual-secret|free-enable|service-probe)$/)
                || upstreamPath.match(/^\/api\/providers\/oauth\/(start-proxy|stop-proxy)$/);
            const protectedAction = Boolean(protectedMatch);
            if (protectedAction && (!sameOrigin(req) || !consumeCsrf(req))) {
                return res.status(403).json({ error: 'CSRF validation failed', code: 'CSRF_INVALID' });
            }
            if (protectedMatch) {
                const genericProxyAction = upstreamPath.startsWith('/api/providers/oauth/');
                const provider = genericProxyAction ? String(req.body?.provider || '') : protectedMatch[1];
                const action = genericProxyAction ? protectedMatch[1] : protectedMatch[2];
                if (Object.keys(req.query || {}).length || !validActionBody(action, req.body)) {
                    return res.status(400).json({ error: 'Invalid provider action request', code: 'PROVIDER_ACTION_INVALID' });
                }
                const contentLength = Number(req.headers['content-length'] || 0);
                if (contentLength > SECRET_BODY_LIMIT_BYTES || Buffer.byteLength(JSON.stringify(req.body || {})) > SECRET_BODY_LIMIT_BYTES) {
                    return res.status(413).json({ error: 'Credential import body is too large', code: 'IMPORT_TOO_LARGE' });
                }
                if (!actionRateAllowed(req, provider)) {
                    res.setHeader('Retry-After', '60');
                    return res.status(429).json({ error: 'Too many provider action attempts', code: 'PROVIDER_ACTION_RATE_LIMITED' });
                }
            }

            const response = await requestForTenant({
                tenantId,
                method: req.method,
                path: upstreamPath,
                query: req.query,
                data: ['GET', 'DELETE'].includes(req.method) ? undefined : req.body,
                signal: req.signal,
                management: true,
                timeoutMs: Number(process.env.NINEROUTER_MANAGEMENT_TIMEOUT_MS || 60_000)
            });

            const headers = sanitizeProxyHeaders(response.headers);
            for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
            res.setHeader('Cache-Control', headers['cache-control'] || 'no-store');
            return res.status(response.status).json(response.data);
        } catch (error) {
            const safe = safeErrorPayload(error);
            log.warn(`Tenant management request failed: ${error?.code || error?.response?.status || 'unknown'}`);
            return res.status(safe.status).json(safe.body);
        }
    });

    return router;
}

function resetTenantActionSecurityStateForTests() {
    csrfTokens.clear();
    actionBuckets.clear();
}

module.exports = { createNineRouterTenantRoutes, resetTenantActionSecurityStateForTests };