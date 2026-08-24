'use strict';

const crypto = require('crypto');
const axios = require('axios');

const ALLOWED_MANAGEMENT_PATHS = [
    /^\/api\/providers(?:\/[A-Za-z0-9._~-]+(?:\/(?:models|test|test-models))?)?$/,
    /^\/api\/providers\/(?:catalog|client|validate|test-batch)$/,
    /^\/api\/providers\/oauth\/(?:start-proxy|poll-status|stop-proxy)$/,
    /^\/api\/provider-nodes(?:\/[A-Za-z0-9._~-]+)?$/,
    /^\/api\/provider-nodes\/validate$/,
    /^\/api\/oauth\/[A-Za-z0-9._~-]+\/(?:authorize|exchange|redirect-authorize|redirect-exchange|device-code|poll|manual-code|manual-start|manual-complete|manual-secret|free-enable|service-probe|poll-status|start-proxy|stop-proxy)$/,
    /^\/api\/combos(?:\/[A-Za-z0-9._~-]+)?$/,
    /^\/api\/usage(?:\/(?:chart|stats|providers|request-details|logs))?$/,
    /^\/api\/usage\/[A-Za-z0-9._~-]+(?:\/codex-reset-credits)?$/,
    /^\/api\/models(?:\/(?:alias|custom|disabled|availability|test))?$/,
    /^\/api\/settings$/
];

function normalizeInternalBaseUrl(value) {
    let url;
    try {
        url = new URL(String(value || ''));
    } catch {
        const error = new Error('ROUTER_URL must be a valid URL');
        error.code = 'ROUTER_URL_INVALID';
        throw error;
    }
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host === '::1' || host === '[::1]'
        || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || !host.includes('.')
        || host.endsWith('.internal') || host.endsWith('.local');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !privateHost) {
        const error = new Error('ROUTER_URL must target a private service');
        error.code = 'ROUTER_URL_INVALID';
        throw error;
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
}

function getConfig() {
    const baseUrl = normalizeInternalBaseUrl(process.env.ROUTER_URL || 'http://9router:20128');
    const secret = String(process.env.ROUTER_SECRET || '');
    if (secret.length < 32) {
        const error = new Error('ROUTER_SECRET must contain at least 32 characters');
        error.code = 'ROUTER_SECRET_INVALID';
        throw error;
    }
    return { baseUrl, secret };
}

function normalizeTenantId(value) {
    const tenantId = String(value || '');
    if (!/^\d{1,24}$/.test(tenantId)) {
        const error = new Error('A valid Telegram tenant is required');
        error.code = 'TENANT_INVALID';
        throw error;
    }
    return tenantId;
}

function normalizePath(value) {
    const path = `/${String(value || '').replace(/^\/+/, '')}`.split('?')[0];
    if (path.includes('\\') || path.includes('\0')) {
        const error = new Error('Invalid 9Router path');
        error.code = 'PATH_INVALID';
        throw error;
    }
    let decoded = path;
    for (let index = 0; index < 3; index += 1) {
        let next;
        try {
            next = decodeURIComponent(decoded);
        } catch {
            const error = new Error('Invalid 9Router path');
            error.code = 'PATH_INVALID';
            throw error;
        }
        if (next === decoded) break;
        decoded = next;
    }
    if (decoded.split('/').some(segment => segment === '..' || segment === '.')) {
        const error = new Error('Invalid 9Router path');
        error.code = 'PATH_INVALID';
        throw error;
    }
    return path;
}

function serializeRequestBody(data) {
    if (data === undefined || data === null) return '';
    if (Buffer.isBuffer(data)) return data;
    if (typeof data === 'string') return data;
    return JSON.stringify(data);
}

function createTenantHeaders({ tenantId, method, path, body }) {
    const { secret } = getConfig();
    const normalizedTenant = normalizeTenantId(tenantId);
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const normalizedPath = normalizePath(path);
    const serializedBody = serializeRequestBody(body);
    const bodyDigest = crypto.createHash('sha256').update(serializedBody).digest('hex');
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${normalizedTenant}\n${timestamp}\n${nonce}\n${normalizedMethod}\n${normalizedPath}\n${bodyDigest}`)
        .digest('hex');

    return {
        'x-xbot-tenant': normalizedTenant,
        'x-xbot-timestamp': String(timestamp),
        'x-xbot-nonce': nonce,
        'x-xbot-body-sha256': bodyDigest,
        'x-xbot-signature': signature
    };
}

function isAllowedManagementPath(path) {
    const normalized = normalizePath(path);
    return ALLOWED_MANAGEMENT_PATHS.some(pattern => pattern.test(normalized));
}

async function requestForTenant({
    tenantId,
    method = 'GET',
    path,
    query,
    data,
    signal,
    responseType = 'json',
    timeoutMs = 60_000,
    management = false
}) {
    const normalizedPath = normalizePath(path);
    if (management && !isAllowedManagementPath(normalizedPath)) {
        const error = new Error('9Router management endpoint is not allowed');
        error.code = 'ENDPOINT_NOT_ALLOWED';
        throw error;
    }
    const normalizedMethod = String(method).toUpperCase();
    const serializedData = data === undefined ? undefined : serializeRequestBody(data);
    const { baseUrl } = getConfig();
    return axios.request({
        url: `${baseUrl}${normalizedPath}`,
        method: normalizedMethod,
        params: query,
        data: serializedData,
        transformRequest: [(value) => value],
        signal,
        responseType,
        timeout: timeoutMs,
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
        headers: {
            ...createTenantHeaders({
                tenantId,
                method: normalizedMethod,
                path: normalizedPath,
                body: serializedData
            }),
            'content-type': 'application/json',
            accept: responseType === 'stream' ? 'text/event-stream' : 'application/json'
        }
    });
}

function sanitizeProxyHeaders(headers = {}) {
    const allowed = {};
    for (const name of ['content-type', 'cache-control', 'retry-after', 'location']) {
        if (headers[name]) allowed[name] = headers[name];
    }
    return allowed;
}

module.exports = {
    createTenantHeaders,
    getConfig,
    isAllowedManagementPath,
    normalizeInternalBaseUrl,
    normalizePath,
    normalizeTenantId,
    requestForTenant,
    sanitizeProxyHeaders,
    serializeRequestBody
};