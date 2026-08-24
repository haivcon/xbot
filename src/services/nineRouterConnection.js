const net = require('net');

class NineRouterConnectionError extends Error {
    constructor(code, message, status = 500) {
        super(message);
        this.name = 'NineRouterConnectionError';
        this.code = code;
        this.status = status;
    }
}

function assertInternalUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new NineRouterConnectionError('INVALID_SERVICE_URL', '9Router service URL is invalid');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new NineRouterConnectionError('INVALID_SERVICE_URL', '9Router service URL is invalid');
    }
    const hostname = url.hostname.toLowerCase();
    const privateIpv4 = address => {
        const parts = address.split('.').map(Number);
        return parts[0] === 10 || parts[0] === 127 ||
            (parts[0] === 169 && parts[1] === 254) ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168);
    };
    const privateIpv6 = hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:');
    const isPrivate = hostname === 'localhost' ||
        (net.isIP(hostname) === 4 && privateIpv4(hostname)) ||
        (net.isIP(hostname) === 6 && privateIpv6) ||
        hostname.endsWith('.internal') || hostname.endsWith('.local');
    if (!isPrivate) {
        throw new NineRouterConnectionError('PUBLIC_SERVICE_URL_FORBIDDEN', '9Router must use a private service URL');
    }
    return url;
}

function normalizeBaseUrl(value) {
    const url = assertInternalUrl(value);
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString().replace(/\/$/, '');
}

function createLinkedAbortSignal(callerSignal, timeoutMs) {
    const controller = new AbortController();
    let cause = null;
    const abortFromCaller = () => {
        cause = 'client';
        controller.abort(new NineRouterConnectionError('CLIENT_ABORTED', 'Request cancelled by client', 499));
    };
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => {
        cause = 'timeout';
        controller.abort(new NineRouterConnectionError('DISCOVERY_TIMEOUT', '9Router discovery timed out', 504));
    }, timeoutMs);
    return {
        signal: controller.signal,
        cause: () => cause,
        cleanup() {
            clearTimeout(timer);
            callerSignal?.removeEventListener('abort', abortFromCaller);
        }
    };
}

function normalizeModel(raw, allowedModels) {
    if (!raw || typeof raw.id !== 'string' || !allowedModels.has(raw.id)) return null;
    const kind = String(raw.kind || raw.type || '').toLowerCase();
    if (kind && !['chat', 'text', 'language', 'llm'].includes(kind)) return null;
    const upstreamId = String(raw.owned_by || raw.provider || raw.upstream || raw.id.split('/')[0] || 'unknown');
    return {
        id: raw.id,
        label: String(raw.name || raw.label || raw.id),
        provider: '9router',
        upstream: { id: upstreamId, label: upstreamId },
        capabilities: raw.capabilities && typeof raw.capabilities === 'object' ? raw.capabilities : {},
        contextLength: Number(raw.contextLength || raw.context_window || raw.contextWindow || 0) || null,
        maxOutputTokens: Number(raw.maxOutputTokens || raw.max_output_tokens || 0) || null,
        pricing: raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : null,
        category: String(raw.category || raw.kind || raw.type || 'llm')
    };
}

function checkNineRouterReadiness(options = {}) {
    try {
        normalizeBaseUrl(options.baseUrl || process.env.ROUTER_URL || '');
        const serviceCredential = String(options.serviceCredential || '').trim();
        if (!serviceCredential && typeof options.buildHeaders !== 'function') {
            throw new NineRouterConnectionError('SERVICE_CREDENTIAL_REQUIRED', '9Router service credential is required');
        }
        const allowedModels = (options.allowedModels || []).map(String).filter(Boolean);
        if (!allowedModels.length && options.allowDynamicModels !== true) {
            throw new NineRouterConnectionError('MODEL_ALLOWLIST_REQUIRED', '9Router model allowlist is required');
        }
        return { ready: true, provider: '9router' };
    } catch {
        return { ready: false, provider: '9router', code: 'CONFIG_INVALID' };
    }
}

function createNineRouterConnection(options = {}) {
    const fetchImpl = options.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new NineRouterConnectionError('FETCH_REQUIRED', 'A fetch implementation is required');
    }
    const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.ROUTER_URL || '');
    const serviceCredential = String(options.serviceCredential || '').trim();
    const buildHeaders = options.buildHeaders;
    if (!serviceCredential && typeof buildHeaders !== 'function') {
        throw new NineRouterConnectionError('SERVICE_CREDENTIAL_REQUIRED', '9Router service credential is required', 503);
    }
    const allowedModels = new Set((options.allowedModels || []).map(String).filter(Boolean));
    const allowDynamicModels = options.allowDynamicModels === true;
    if (!allowedModels.size && !allowDynamicModels) {
        throw new NineRouterConnectionError('MODEL_ALLOWLIST_REQUIRED', '9Router model allowlist is required', 503);
    }
    const timeoutMs = Math.max(100, Number(options.timeoutMs || 5000));

    async function discover(identity, requestOptions = {}) {
        if (!identity?.tenantId || !identity?.userId) {
            throw new NineRouterConnectionError('IDENTITY_REQUIRED', 'Tenant and user identity are required', 400);
        }
        const linked = createLinkedAbortSignal(requestOptions.signal, timeoutMs);
        try {
            const headers = {
                Accept: 'application/json',
                ...(serviceCredential ? { Authorization: `Bearer ${serviceCredential}` } : {}),
                ...(typeof buildHeaders === 'function'
                    ? buildHeaders(identity, { method: 'GET', path: '/models' })
                    : {})
            };
            const response = await fetchImpl(`${baseUrl}/models`, {
                method: 'GET',
                headers,
                signal: linked.signal
            });
            if (!response.ok) {
                throw new NineRouterConnectionError('DISCOVERY_UPSTREAM_ERROR', '9Router discovery failed', response.status || 502);
            }
            let payload;
            try { payload = await response.json(); } catch {
                throw new NineRouterConnectionError('DISCOVERY_INVALID', '9Router returned invalid discovery data', 502);
            }
            if (!Array.isArray(payload?.data)) {
                throw new NineRouterConnectionError('DISCOVERY_INVALID', '9Router returned invalid discovery data', 502);
            }
            const effectiveAllowedModels = allowDynamicModels
                ? new Set(payload.data.map(item => item?.id).filter(Boolean))
                : allowedModels;
            const models = payload.data.map(item => normalizeModel(item, effectiveAllowedModels)).filter(Boolean);
            if (!models.length) {
                throw new NineRouterConnectionError('NO_ALLOWED_MODELS', '9Router returned no allowlisted chat models', 503);
            }
            const upstreams = [];
            const seen = new Set();
            for (const model of models) {
                if (!seen.has(model.upstream.id)) {
                    seen.add(model.upstream.id);
                    upstreams.push(model.upstream);
                }
            }
            return { provider: { id: '9router', label: '9Router' }, models, upstreams };
        } catch (error) {
            if (error instanceof NineRouterConnectionError) throw error;
            if (linked.cause() === 'client') {
                throw new NineRouterConnectionError('CLIENT_ABORTED', 'Request cancelled by client', 499);
            }
            if (linked.cause() === 'timeout') {
                throw new NineRouterConnectionError('DISCOVERY_TIMEOUT', '9Router discovery timed out', 504);
            }
            throw new NineRouterConnectionError('DISCOVERY_UNAVAILABLE', '9Router discovery unavailable', 502);
        } finally {
            linked.cleanup();
        }
    }

    return { discover };
}

module.exports = { createNineRouterConnection, checkNineRouterReadiness, NineRouterConnectionError };
