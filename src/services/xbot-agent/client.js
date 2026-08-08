'use strict';

const crypto = require('crypto');

function clientError(code, message, status) {
    const error = new Error(message);
    error.code = code;
    if (status) error.status = status;
    return error;
}

function assertInternalUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw clientError('XBOT_CONFIG_INVALID', 'xBot agent URL must be valid'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw clientError('XBOT_CONFIG_INVALID', 'xBot agent URL must be a safe service URL');
    }
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host === '::1' || host === '[::1]' ||
        /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || !host.includes('.') ||
        host.endsWith('.internal') || host.endsWith('.local');
    if (!privateHost) throw clientError('XBOT_CONFIG_INVALID', 'xBot agent URL must target a private service');
    return url.toString().replace(/\/$/, '');
}

function createXBotAgentClient(options = {}) {
    const baseUrl = assertInternalUrl(options.baseUrl);
    const serviceToken = options.serviceToken;
    const contextSecret = options.contextSecret;
    const fetchImpl = options.fetchImpl || global.fetch;
    const timeoutMs = Math.max(1, options.timeoutMs || 60_000);
    const maxStreamBytes = Math.max(1, options.maxStreamBytes || 2 * 1024 * 1024);
    // A production deployment may inject a durable tenant-scoped Map-compatible
    // store. Unknown run IDs are denied rather than claimed by the first caller.
    const runOwners = options.runStore || new Map();
    if (!serviceToken || !contextSecret) throw clientError('XBOT_CONFIG_INVALID', 'xBot agent service credentials are required');
    if (typeof fetchImpl !== 'function') throw clientError('XBOT_CONFIG_INVALID', 'fetch is unavailable');

    function identity(input) {
        if (!input?.tenantId || !input?.userId) throw clientError('IDENTITY_REQUIRED', 'Tenant and user identity are required');
        return { tenantId: String(input.tenantId), userId: String(input.userId) };
    }

    function assertRunOwner(runId, owner) {
        if (!runId) throw clientError('RUN_ID_REQUIRED', 'Run ID is required');
        const known = runOwners.get(runId);
        if (!known) throw clientError('RUN_NOT_FOUND_LOCAL', 'Run is not mapped to this service instance');
        if (known.tenantId !== owner.tenantId || known.userId !== owner.userId) {
            throw clientError('RUN_TENANT_MISMATCH', 'Run does not belong to this tenant and user');
        }
    }

    function headers(owner, requestId, runId) {
        const signedContext = { ...owner, issuedAt: Date.now() };
        if (requestId) signedContext.requestId = requestId;
        if (runId) signedContext.runId = runId;
        const context = Buffer.from(JSON.stringify(signedContext)).toString('base64url');
        const signature = crypto.createHmac('sha256', contextSecret).update(context).digest('hex');
        const result = {
            Authorization: 'Bearer ' + serviceToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-XBot-Context': context,
            'X-XBot-Signature': signature
        };
        if (requestId) result['Idempotency-Key'] = requestId;
        return result;
    }

    function requireRequestId(requestId) {
        if (!requestId || typeof requestId !== 'string') throw clientError('REQUEST_ID_REQUIRED', 'A stable request ID is required');
    }

    function linkedController(signal) {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const callerAbort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener('abort', callerAbort, { once: true });
        return {
            controller,
            didTimeOut: () => timedOut,
            cleanup() {
                clearTimeout(timer);
                signal?.removeEventListener('abort', callerAbort);
            }
        };
    }

    function normalizeTransportError(error, state, signal, stream = false) {
        if (state.didTimeOut()) return clientError('XBOT_TIMEOUT', stream ? 'xBot agent stream timed out' : 'xBot agent request timed out');
        if (signal?.aborted) return clientError('CLIENT_ABORTED', 'Client cancelled the request');
        if (error?.code && (error.code.startsWith('XBOT_') || error.code === 'CLIENT_ABORTED')) return error;
        return clientError('XBOT_UPSTREAM_ERROR', 'xBot agent request failed');
    }

    async function request(path, init, signal) {
        const state = linkedController(signal);
        try {
            const response = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: state.controller.signal });
            if (!response.ok) throw clientError('XBOT_UPSTREAM_ERROR', 'xBot agent request failed', response.status);
            try {
                return await response.json();
            } catch (error) {
                if (state.didTimeOut() || signal?.aborted) throw error;
                throw clientError('XBOT_RESPONSE_INVALID', 'xBot agent returned invalid JSON');
            }
        } catch (error) {
            throw normalizeTransportError(error, state, signal);
        } finally {
            state.cleanup();
        }
    }

    function createPayload(input) {
        let runInput = input.input;
        let conversationHistory = input.conversationHistory ?? input.conversation_history;
        if (runInput === undefined && Array.isArray(input.messages) && input.messages.length) {
            // xBot agent accepts a message array as `input` and derives prior turns
            // itself, including multi-part content. Do not translate it into a
            // different, xBot-specific request shape.
            runInput = input.messages;
        }
        if (runInput === undefined || runInput === null || runInput === '') {
            throw clientError('XBOT_INPUT_REQUIRED', 'xBot agent run input is required');
        }
        const payload = { input: runInput };
        if (conversationHistory !== undefined) payload.conversation_history = conversationHistory;
        if (input.instructions !== undefined) payload.instructions = input.instructions;
        if (input.model !== undefined) payload.model = input.model;
        return payload;
    }

    async function createRun(input, requestOptions = {}) {
        const owner = identity(input);
        requireRequestId(input.requestId);
        const data = await request('/v1/runs', {
            method: 'POST',
            headers: headers(owner, input.requestId),
            body: JSON.stringify(createPayload(input))
        }, requestOptions.signal);
        if (!data?.run_id || typeof data.run_id !== 'string' || !data.status) {
            throw clientError('XBOT_RESPONSE_INVALID', 'xBot agent response is missing run metadata');
        }
        runOwners.set(data.run_id, owner);
        // Keep the wire-contract field enumerable while supporting the existing
        // orchestrator's internal camelCase access during migration.
        Object.defineProperty(data, 'runId', { value: data.run_id, enumerable: false });
        return data;
    }

    async function approveRun(input, requestOptions = {}) {
        const owner = identity(input);
        requireRequestId(input.requestId);
        assertRunOwner(input.runId, owner);
        if (!input.choice || typeof input.choice !== 'string') {
            throw clientError('APPROVAL_CHOICE_REQUIRED', 'An approval choice is required');
        }
        return request(`/v1/runs/${encodeURIComponent(input.runId)}/approval`, {
            method: 'POST',
            headers: headers(owner, input.requestId, input.runId),
            body: JSON.stringify({ choice: input.choice })
        }, requestOptions.signal);
    }

    function normalizeEvent(event, runId) {
        switch (event?.event) {
        case 'message.delta':
            return typeof event.delta === 'string' ? { type: 'text-delta', text: event.delta } : null;
        case 'approval.request': {
            const normalized = { type: 'approval-required', runId };
            if (event.command !== undefined) normalized.command = event.command;
            if (Array.isArray(event.choices)) normalized.choices = event.choices;
            return normalized;
        }
        case 'run.completed': {
            const normalized = { type: 'completed', runId };
            if (event.output !== undefined) normalized.output = event.output;
            if (event.usage !== undefined) normalized.usage = event.usage;
            return normalized;
        }
        case 'run.failed':
            return { type: 'failed', runId };
        case 'run.cancelled':
            return { type: 'cancelled', runId };
        default:
            return null;
        }
    }

    async function consumeRunEvents(response, runId, onEvent) {
        if (!response?.body || typeof response.body.getReader !== 'function') {
            throw clientError('XBOT_STREAM_INVALID', 'xBot agent did not return a readable SSE stream');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let bytes = 0;
        let terminal;

        async function processFrame(frame) {
            const data = frame.split(/\r?\n/)
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n');
            if (!data) return;
            let upstreamEvent;
            try { upstreamEvent = JSON.parse(data); } catch {
                throw clientError('XBOT_STREAM_INVALID', 'xBot agent returned malformed SSE data');
            }
            const event = normalizeEvent(upstreamEvent, runId);
            if (event) await onEvent(event);
            if (upstreamEvent?.event === 'run.completed') terminal = 'completed';
            else if (upstreamEvent?.event === 'run.failed') terminal = 'failed';
            else if (upstreamEvent?.event === 'run.cancelled') terminal = 'cancelled';
        }

        try {
            while (!terminal) {
                const part = await reader.read();
                if (part.done) break;
                bytes += part.value.byteLength;
                if (bytes > maxStreamBytes) throw clientError('XBOT_STREAM_TOO_LARGE', 'xBot agent stream exceeded its size limit');
                buffer += decoder.decode(part.value, { stream: true });
                const frames = buffer.split(/\r?\n\r?\n/);
                buffer = frames.pop() || '';
                for (const frame of frames) {
                    await processFrame(frame);
                    if (terminal) break;
                }
            }
            buffer += decoder.decode();
            if (!terminal && buffer.trim()) await processFrame(buffer);
        } finally {
            if (terminal) await reader.cancel().catch(() => {});
            reader.releaseLock();
        }

        if (!terminal) throw clientError('XBOT_STREAM_INCOMPLETE', 'xBot agent stream closed before a terminal run event');
        if (terminal === 'failed') throw clientError('XBOT_RUN_FAILED', 'xBot agent run failed');
        if (terminal === 'cancelled') return { completed: false, cancelled: true, runId };
        return { completed: true, runId };
    }

    async function streamRun(input) {
        const owner = identity(input);
        assertRunOwner(input.runId, owner);
        const state = linkedController(input.signal);
        try {
            const response = await fetchImpl(`${baseUrl}/v1/runs/${encodeURIComponent(input.runId)}/events`, {
                method: 'GET',
                headers: { ...headers(owner, undefined, input.runId), Accept: 'text/event-stream' },
                signal: state.controller.signal
            });
            if (!response.ok) throw clientError('XBOT_UPSTREAM_ERROR', 'xBot agent request failed', response.status);
            if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream')) {
                throw clientError('XBOT_STREAM_INVALID', 'xBot agent did not return an SSE stream');
            }
            return await consumeRunEvents(response, input.runId, input.onEvent || (() => {}));
        } catch (error) {
            throw normalizeTransportError(error, state, input.signal, true);
        } finally {
            state.cleanup();
        }
    }

    async function cancelRun(input, requestOptions = {}) {
        const owner = identity(input);
        requireRequestId(input.requestId);
        assertRunOwner(input.runId, owner);
        return request(`/v1/runs/${encodeURIComponent(input.runId)}/stop`, {
            method: 'POST',
            headers: headers(owner, input.requestId, input.runId),
            body: '{}'
        }, requestOptions.signal);
    }

    return { createRun, approveRun, streamRun, cancelRun };
}

module.exports = { createXBotAgentClient };
