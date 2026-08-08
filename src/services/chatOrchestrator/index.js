'use strict';

const crypto = require('crypto');
const { parseOpenAiSse } = require('./sse');

function orchestrationError(code, message, status) {
    const error = new Error(message);
    error.code = code;
    if (status) error.status = status;
    return error;
}

function assertInternalUrl(value, name) {
    let url;
    try { url = new URL(value); } catch { throw orchestrationError('CONFIG_INVALID', `${name} must be a valid URL`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw orchestrationError('CONFIG_INVALID', `${name} is not a safe service URL`);
    }
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host === '::1' || host === '[::1]' ||
        /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || !host.includes('.') ||
        host.endsWith('.internal') || host.endsWith('.local');
    if (!privateHost) throw orchestrationError('CONFIG_INVALID', `${name} must target a private service`);
    return url.toString().replace(/\/$/, '');
}

function parseCostOptions(maxCostValue, modelCostsValue) {
    let modelCostsPerMillion = {};
    if (modelCostsValue !== undefined && modelCostsValue !== null && modelCostsValue !== '') {
        try {
            modelCostsPerMillion = typeof modelCostsValue === 'string' ? JSON.parse(modelCostsValue) : modelCostsValue;
        } catch {
            throw orchestrationError('CONFIG_INVALID', 'Model cost configuration must be valid JSON');
        }
    }
    if (!modelCostsPerMillion || Array.isArray(modelCostsPerMillion) || typeof modelCostsPerMillion !== 'object') {
        throw orchestrationError('CONFIG_INVALID', 'Model cost configuration must be an object');
    }
    for (const [model, cost] of Object.entries(modelCostsPerMillion)) {
        if (!model || !cost || typeof cost !== 'object' || Array.isArray(cost) ||
            !Number.isFinite(cost.input) || cost.input < 0 ||
            !Number.isFinite(cost.output) || cost.output < 0) {
            throw orchestrationError('CONFIG_INVALID', 'Every model cost must have non-negative numeric input and output prices');
        }
    }
    if (maxCostValue === undefined || maxCostValue === null || maxCostValue === '') {
        return { maxCostUsd: undefined, modelCostsPerMillion };
    }
    const maxCostUsd = Number(maxCostValue);
    if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0) {
        throw orchestrationError('CONFIG_INVALID', 'Cost ceiling must be a non-negative number');
    }
    return { maxCostUsd, modelCostsPerMillion };
}

function createChatOrchestrator(options = {}) {
    const fetchImpl = options.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') throw orchestrationError('CONFIG_INVALID', 'fetch is unavailable');
    const baseUrl = assertInternalUrl(options.baseUrl, '9Router URL');
    const credential = options.serviceCredential;
    const buildHeaders = options.buildHeaders;
    if (!String(credential || '').trim() && typeof buildHeaders !== 'function') {
        throw orchestrationError('CONFIG_INVALID', '9Router service credential or tenant header factory is required');
    }
    const allowedModels = new Set(options.allowedModels || []);
    const timeoutMs = Math.max(1, options.timeoutMs || 60_000);
    const maxConcurrent = Math.max(1, options.maxConcurrentPerTenant || 2);
    const rateLimitPerMinute = Math.max(1, options.rateLimitPerMinute || 60);
    const circuitFailureThreshold = Math.max(1, options.circuitFailureThreshold || 5);
    const circuitResetMs = Math.max(1, options.circuitResetMs || 30_000);
    const maxMessages = Math.max(1, options.maxMessages || 40);
    const maxInputChars = Math.max(1, options.maxInputChars || 100_000);
    const maxInputTokens = Math.max(1, options.maxInputTokens || 25_000);
    const maxOutputTokens = Math.max(1, options.maxOutputTokens || 8192);
    const costOptions = parseCostOptions(options.maxCostUsd, options.modelCostsPerMillion);
    const maxCostUsd = costOptions.maxCostUsd === undefined ? Infinity : costOptions.maxCostUsd;
    const modelCosts = costOptions.modelCostsPerMillion;
    const tools = Array.isArray(options.tools) ? options.tools : [];
    const allowedToolNames = new Set(tools.map(tool => tool?.function?.name).filter(Boolean));
    const executeTool = options.executeTool;
    const toolPolicy = options.toolPolicy;
    const maxToolRounds = Math.max(1, options.maxToolRounds || 8);
    const maxToolResultChars = Math.max(1, options.maxToolResultChars || 32_000);
    const activeByTenant = new Map();
    const tenantRates = new Map();
    const pendingAgentApprovals = new Map();
    let circuitFailures = 0;
    let circuitOpenedAt = 0;

    function checkRateLimit(tenantId) {
        const now = Date.now();
        let rate = tenantRates.get(tenantId);
        if (!rate || now >= rate.resetAt) rate = { count: 0, resetAt: now + 60_000 };
        rate.count += 1;
        tenantRates.set(tenantId, rate);
        if (rate.count > rateLimitPerMinute) throw orchestrationError('TENANT_RATE_LIMIT', 'Tenant request limit reached');
    }

    function checkCircuit() {
        if (!circuitOpenedAt) return;
        if (Date.now() - circuitOpenedAt >= circuitResetMs) {
            circuitOpenedAt = 0;
            circuitFailures = 0;
            return;
        }
        throw orchestrationError('CIRCUIT_OPEN', 'AI service is temporarily unavailable');
    }

    async function streamNineRouter(input, hooks) {
        checkCircuit();
        const controller = new AbortController();
        const idempotencySeed = `${input.tenantId}:${input.userId}:${input.requestId || crypto.randomUUID()}`;
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const abortFromCaller = () => controller.abort();
        hooks.signal?.addEventListener('abort', abortFromCaller, { once: true });
        const messages = input.messages.map(message => ({ ...message }));
        let finalText = '';
        let finalUsage = null;
        try {
            for (let round = 0; round < maxToolRounds; round += 1) {
                let roundText = '';
                let roundUsage = null;
                const pendingToolCalls = [];
                const upstreamIdempotencyKey = crypto.createHash('sha256')
                    .update(`${idempotencySeed}:${round}`)
                    .digest('hex');
                const requestPath = `${new URL(baseUrl).pathname.replace(/\/$/, '')}/chat/completions` || '/chat/completions';
                const requestBody = JSON.stringify({
                    model: input.model,
                    messages,
                    tools: tools.length ? tools : undefined,
                    stream: true,
                    stream_options: { include_usage: true },
                    max_tokens: maxOutputTokens
                });
                const headers = {
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                    ...(credential ? { Authorization: 'Bearer ' + credential } : {}),
                    ...(typeof buildHeaders === 'function'
                        ? buildHeaders(input, { method: 'POST', path: requestPath, body: requestBody })
                        : {}),
                    'Idempotency-Key': upstreamIdempotencyKey
                };
                const response = await fetchImpl(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers,
                    body: requestBody,
                    signal: controller.signal
                });
                if (!response.ok) throw orchestrationError('UPSTREAM_ERROR', '9Router request failed', response.status);
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.toLowerCase().includes('text/event-stream')) {
                    throw orchestrationError('UPSTREAM_STREAM_INVALID', '9Router did not return an SSE stream');
                }
                await parseOpenAiSse(response, {
                    maxBytes: options.maxOutputBytes,
                    onChunk: async chunk => {
                        if (chunk?.usage && typeof chunk.usage === 'object') {
                            roundUsage = {
                                prompt_tokens: Math.max(0, Number(chunk.usage.prompt_tokens) || 0),
                                completion_tokens: Math.max(0, Number(chunk.usage.completion_tokens) || 0),
                                total_tokens: Math.max(0, Number(chunk.usage.total_tokens) || 0)
                            };
                        }
                        const delta = chunk?.choices?.[0]?.delta;
                        if (typeof delta?.content === 'string' && delta.content) {
                            roundText += delta.content;
                            await hooks.onEvent({ type: 'text-delta', data: { text: delta.content } });
                        }
                        for (const fragment of (delta?.tool_calls || [])) {
                            const index = Number.isInteger(fragment.index) ? fragment.index : 0;
                            if (!pendingToolCalls[index]) pendingToolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                            const call = pendingToolCalls[index];
                            if (fragment.id) call.id = fragment.id;
                            if (fragment.type) call.type = fragment.type;
                            if (fragment.function?.name) call.function.name += fragment.function.name;
                            if (fragment.function?.arguments) call.function.arguments += fragment.function.arguments;
                        }
                    }
                });

                if (roundUsage) {
                    finalUsage = finalUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                    finalUsage.prompt_tokens += roundUsage.prompt_tokens;
                    finalUsage.completion_tokens += roundUsage.completion_tokens;
                    finalUsage.total_tokens += roundUsage.total_tokens;
                }
                const toolCalls = pendingToolCalls.filter(call => call?.function?.name);
                if (toolCalls.length === 0) {
                    finalText = roundText;
                    if (finalUsage) await hooks.onEvent({ type: 'usage', data: finalUsage });
                    await hooks.onEvent({ type: 'done', data: { engine: '9router' } });
                    circuitFailures = 0;
                    return { completed: true, text: finalText, engine: '9router', usage: finalUsage };
                }
                if (typeof executeTool !== 'function') throw orchestrationError('TOOL_EXECUTOR_REQUIRED', 'A tool executor is required for model tool calls');
                messages.push({ role: 'assistant', content: roundText || null, tool_calls: toolCalls });
                for (const call of toolCalls) {
                    if (!call.id || !allowedToolNames.has(call.function.name)) {
                        throw orchestrationError('TOOL_NOT_ALLOWED', 'Model requested an unavailable tool');
                    }
                    let args;
                    try { args = JSON.parse(call.function.arguments || '{}'); } catch { throw orchestrationError('TOOL_ARGS_INVALID', 'Model returned invalid tool arguments'); }
                    await hooks.onEvent({ type: 'tool-start', data: { name: call.function.name, args } });
                    const envelope = {
                        tenantId: input.tenantId,
                        userId: input.userId,
                        runId: input.requestId,
                        toolCallId: call.id,
                        toolName: call.function.name,
                        args,
                        idempotencyKey: `${input.requestId || 'chat'}:${call.id}`
                    };
                    const result = toolPolicy
                        ? await toolPolicy.execute(envelope, (toolArgs, policyEnvelope) => executeTool({ ...policyEnvelope, args: toolArgs }))
                        : await executeTool(envelope);
                    const content = (typeof result === 'string' ? result : JSON.stringify(result)).slice(0, maxToolResultChars);
                    await hooks.onEvent({ type: 'tool-result', data: { name: call.function.name, result: content } });
                    messages.push({ role: 'tool', tool_call_id: call.id, content });
                }
            }
            throw orchestrationError('TOOL_ROUND_LIMIT', 'AI tool round limit exceeded');
        } catch (error) {
            if (timedOut) throw orchestrationError('UPSTREAM_TIMEOUT', '9Router timed out');
            if (hooks.signal?.aborted) throw orchestrationError('CLIENT_ABORTED', 'Client cancelled the request');
            if (error?.name === 'AbortError') throw orchestrationError('UPSTREAM_ABORTED', '9Router request was aborted');
            if (String(error?.code || '').startsWith('UPSTREAM_')) {
                circuitFailures += 1;
                if (circuitFailures >= circuitFailureThreshold) circuitOpenedAt = Date.now();
            }
            throw error;
        } finally {
            clearTimeout(timer);
            hooks.signal?.removeEventListener('abort', abortFromCaller);
        }
    }

    async function streamXBotAgent(input, hooks) {
        const run = await options.hermesClient.createRun({
            tenantId: input.tenantId,
            userId: input.userId,
            messages: input.messages,
            model: input.model,
            requestId: input.requestId
        }, { signal: hooks.signal });
        let text = '';
        try {
            const result = await options.hermesClient.streamRun({
                tenantId: input.tenantId,
                userId: input.userId,
                runId: run.runId,
                signal: hooks.signal,
                onEvent: async event => {
                    if (event.type === 'text-delta' && typeof event.text === 'string') text += event.text;
                    if (event.type === 'approval-required' && event.runId === run.runId && Array.isArray(event.choices)) {
                        pendingAgentApprovals.set(run.runId, {
                            tenantId: String(input.tenantId),
                            userId: String(input.userId),
                            choices: new Set(event.choices.filter(choice => ['once', 'session', 'always', 'deny'].includes(choice))),
                            requestId: crypto.randomUUID(),
                            approving: false
                        });
                    }
                    if (event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled') {
                        pendingAgentApprovals.delete(run.runId);
                    }
                    await hooks.onEvent({ type: event.type, data: event });
                }
            });
            if (!result?.completed) {
                return { ...result, completed: false, text, engine: 'xbot-agent', runId: run.runId };
            }
        } catch (error) {
            // Once xBot agent has accepted a run, never fall back to a second engine:
            // the run may still be executing even when its event stream fails.
            if (typeof options.hermesClient.cancelRun === 'function') {
                await options.hermesClient.cancelRun({
                    tenantId: input.tenantId,
                    userId: input.userId,
                    runId: run.runId,
                    requestId: crypto.randomUUID()
                }).catch(() => {});
            }
            error.agentRunCreated = true;
            throw error;
        } finally {
            pendingAgentApprovals.delete(run.runId);
        }
        await hooks.onEvent({ type: 'done', data: { engine: 'xbot-agent', runId: run.runId } });
        return { completed: true, text, engine: 'xbot-agent', runId: run.runId };
    }

    async function approveAgentRun(input, hooks = {}) {
        if (!input?.tenantId || !input?.userId) throw orchestrationError('IDENTITY_REQUIRED', 'Tenant and user identity are required');
        if (!input?.runId) throw orchestrationError('RUN_ID_REQUIRED', 'xBot agent run ID is required');
        const pending = pendingAgentApprovals.get(input.runId);
        if (!pending) throw orchestrationError('APPROVAL_NOT_PENDING', 'No approval is pending for this xBot agent run');
        if (pending.tenantId !== String(input.tenantId) || pending.userId !== String(input.userId)) {
            throw orchestrationError('RUN_TENANT_MISMATCH', 'Run does not belong to this tenant and user');
        }
        if (!pending.choices.has(input.choice)) {
            throw orchestrationError('APPROVAL_CHOICE_INVALID', 'xBot agent approval choice is invalid');
        }
        if (pending.approving) throw orchestrationError('APPROVAL_IN_PROGRESS', 'xBot agent approval is already being submitted');
        if (!options.hermesEnabled || typeof options.hermesClient?.approveRun !== 'function') {
            throw orchestrationError('XBOT_AGENT_DISABLED', 'xBot Agent is not enabled');
        }
        pending.approving = true;
        try {
            const result = await options.hermesClient.approveRun({ ...input, requestId: pending.requestId }, { signal: hooks.signal });
            pendingAgentApprovals.delete(input.runId);
            return result;
        } catch (error) {
            pending.approving = false;
            throw error;
        }
    }

    async function streamChat(input, hooks = {}) {
        if (!input?.tenantId || !input?.userId) throw orchestrationError('IDENTITY_REQUIRED', 'Tenant and user identity are required');
        if (!allowedModels.has(input.model)) throw orchestrationError('MODEL_NOT_ALLOWED', 'Requested model is not allowed');
        if (!Array.isArray(input.messages) || input.messages.length > maxMessages) throw orchestrationError('INPUT_LIMIT', 'Message limit exceeded');
        const inputChars = input.messages.reduce((sum, message) => sum + String(message?.content || '').length, 0);
        if (inputChars > maxInputChars) throw orchestrationError('INPUT_LIMIT', 'Input size limit exceeded');
        // Conservative provider-independent estimate. It is a hard admission ceiling,
        // not billing telemetry; final usage must come from the provider when present.
        const estimatedInputTokens = Math.ceil(inputChars / 4);
        if (estimatedInputTokens > maxInputTokens) throw orchestrationError('TOKEN_LIMIT', 'Input token limit exceeded');
        const cost = modelCosts[input.model];
        if (Number.isFinite(maxCostUsd) && !cost) {
            throw orchestrationError('COST_MODEL_REQUIRED', 'Model pricing is required when a cost ceiling is enabled');
        }
        if (cost) {
            const projectedCost = (estimatedInputTokens * Number(cost.input || 0) + maxOutputTokens * Number(cost.output || 0)) / 1_000_000;
            if (projectedCost > maxCostUsd) throw orchestrationError('COST_LIMIT', 'Projected request cost exceeds policy');
        }
        checkRateLimit(input.tenantId);
        const current = activeByTenant.get(input.tenantId) || 0;
        if (current >= maxConcurrent) throw orchestrationError('TENANT_CONCURRENCY_LIMIT', 'Tenant concurrency limit reached');
        activeByTenant.set(input.tenantId, current + 1);
        const normalizedHooks = { signal: hooks.signal, onEvent: hooks.onEvent || (() => {}) };
        try {
            if (options.hermesEnabled && options.hermesClient) {
                let emitted = false;
                const agentHooks = {
                    signal: normalizedHooks.signal,
                    onEvent: async event => {
                        emitted = true;
                        await normalizedHooks.onEvent(event);
                    }
                };
                try {
                    return await streamXBotAgent(input, agentHooks);
                } catch (error) {
                    if (emitted || error?.agentRunCreated || error?.code === 'CLIENT_ABORTED') throw error;
                    const fallbackCodes = new Set([
                        'XBOT_UPSTREAM_ERROR',
                        'XBOT_TIMEOUT',
                        'XBOT_STREAM_INVALID',
                        'XBOT_STREAM_INCOMPLETE'
                    ]);
                    if (!fallbackCodes.has(error?.code)) throw error;
                }
            }
            return await streamNineRouter(input, normalizedHooks);
        } finally {
            const remaining = (activeByTenant.get(input.tenantId) || 1) - 1;
            if (remaining <= 0) activeByTenant.delete(input.tenantId);
            else activeByTenant.set(input.tenantId, remaining);
        }
    }

    return { streamChat, approveAgentRun };
}

module.exports = { createChatOrchestrator, orchestrationError, assertInternalUrl, parseCostOptions };
