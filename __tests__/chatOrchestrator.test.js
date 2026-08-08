const { createChatOrchestrator, parseCostOptions } = require('../src/services/chatOrchestrator');
const { createToolPolicy, MemoryApprovalStore, MemoryIdempotencyStore } = require('../src/services/chatOrchestrator/policy');
const { parseOpenAiSse } = require('../src/services/chatOrchestrator/sse');

function sseResponse(parts, status = 200) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            for (const part of parts) controller.enqueue(encoder.encode(part));
            controller.close();
        }
    });
    return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

const baseInput = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    model: 'route-safe',
    messages: [{ role: 'user', content: 'hello' }]
};

describe('OpenAI-compatible SSE parser', () => {
    test('handles split data frames and [DONE]', async () => {
        const chunks = [];
        const response = sseResponse([
            'data: {"choices":[{"delta":{"content":"hel',
            'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n',
            'data: [DONE]\n\n'
        ]);
        const result = await parseOpenAiSse(response, { onChunk: chunk => chunks.push(chunk) });
        expect(chunks).toHaveLength(2);
        expect(result.done).toBe(true);
    });

    test('rejects a stream that closes without [DONE]', async () => {
        await expect(parseOpenAiSse(sseResponse(['data: {"choices":[]}\n\n']))).rejects.toMatchObject({ code: 'UPSTREAM_STREAM_INCOMPLETE' });
    });
});

describe('Chat orchestrator', () => {
    test('parses cost policy config and rejects malformed or negative pricing', () => {
        expect(parseCostOptions('0.1', '{"route-safe":{"input":1,"output":2}}')).toEqual({
            maxCostUsd: 0.1,
            modelCostsPerMillion: { 'route-safe': { input: 1, output: 2 } }
        });
        expect(() => parseCostOptions('-1', '{}')).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }));
        expect(() => parseCostOptions('1', 'not-json')).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }));
        expect(() => parseCostOptions('1', '{"route-safe":{"input":-1,"output":2}}')).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }));
    });

    test('uses service auth, allowlisted model, and relays deltas without exposing credentials', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
            'data: [DONE]\n\n'
        ]));
        const events = [];
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['route-safe'],
            timeoutMs: 1000
        });

        const result = await orchestrator.streamChat(baseInput, { onEvent: event => events.push(event) });

        expect(result).toMatchObject({ completed: true, text: 'hello', engine: '9router' });
        expect(events).toEqual([
            { type: 'text-delta', data: { text: 'hello' } },
            { type: 'done', data: { engine: '9router' } }
        ]);
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer service-secret');
        expect(init.headers['Idempotency-Key']).toMatch(/^[a-f0-9]{64}$/);
        expect(init.body).not.toContain('service-secret');
    });

    test('returns final OpenAI usage and emits it only after the provider completes', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n',
            'data: [DONE]\n\n'
        ]));
        const events = [];
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['route-safe']
        });

        const result = await orchestrator.streamChat(baseInput, { onEvent: event => events.push(event) });

        expect(result).toMatchObject({
            completed: true,
            usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
        });
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
        expect(events).toEqual([
            { type: 'text-delta', data: { text: 'hello' } },
            { type: 'usage', data: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } },
            { type: 'done', data: { engine: '9router' } }
        ]);
    });

    test('uses stable per-round opaque idempotency keys across a tool loop', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_balance","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n'
            ]))
            .mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n']));
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['route-safe'],
            tools: [{ type: 'function', function: { name: 'read_balance', parameters: { type: 'object' } } }],
            executeTool: jest.fn().mockResolvedValue({ balance: 1 })
        });

        await orchestrator.streamChat({ ...baseInput, requestId: 'browser-visible-request' }, { onEvent: jest.fn() });

        const keys = fetchImpl.mock.calls.map(([, init]) => init.headers['Idempotency-Key']);
        expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
        expect(keys[1]).toMatch(/^[a-f0-9]{64}$/);
        expect(keys[1]).not.toBe(keys[0]);
        expect(keys[0]).not.toContain('browser-visible-request');
    });

    test('aggregates provider usage across bounded tool rounds', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_balance","arguments":"{}"}}]}}]}\n\n',
                'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n',
                'data: [DONE]\n\n'
            ]))
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"content":"done"}}]}\n\n',
                'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n',
                'data: [DONE]\n\n'
            ]));
        const events = [];
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['route-safe'],
            tools: [{ type: 'function', function: { name: 'read_balance', parameters: { type: 'object' } } }],
            executeTool: jest.fn().mockResolvedValue({ balance: 1 })
        });

        const result = await orchestrator.streamChat(baseInput, { onEvent: event => events.push(event) });

        expect(result.usage).toEqual({ prompt_tokens: 13, completion_tokens: 3, total_tokens: 16 });
        expect(events.filter(event => event.type === 'usage')).toEqual([
            { type: 'usage', data: { prompt_tokens: 13, completion_tokens: 3, total_tokens: 16 } }
        ]);
    });

    test('fails closed when the server-owned 9Router credential is missing', () => {
        expect(() => createChatOrchestrator({
            fetchImpl: jest.fn(),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: '',
            allowedModels: ['route-safe']
        })).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }));
    });

    test('executes a bounded 9Router tool loop and reports done only after the final model turn', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"read_balance","arguments":"{\\"asset\\":\\"US"}}]}}]}\n\n',
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"DT\\"}"}}]}}]}\n\ndata: [DONE]\n\n'
            ]))
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"content":"Balance: 10 USDT"}}]}\n\ndata: [DONE]\n\n'
            ]));
        const executeTool = jest.fn().mockResolvedValue({ balance: 10, asset: 'USDT' });
        const events = [];
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            tools: [{ type: 'function', function: { name: 'read_balance', parameters: { type: 'object' } } }],
            executeTool,
            maxToolRounds: 3
        });

        const result = await orchestrator.streamChat(baseInput, { onEvent: event => events.push(event) });

        expect(result).toMatchObject({ completed: true, text: 'Balance: 10 USDT', engine: '9router' });
        expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a', userId: 'user-a', toolCallId: 'call-1',
            toolName: 'read_balance', args: { asset: 'USDT' }
        }));
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
        expect(secondBody.messages.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [expect.objectContaining({ id: 'call-1' })] });
        expect(secondBody.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call-1' });
        expect(events.filter(event => event.type === 'done')).toEqual([{ type: 'done', data: { engine: '9router' } }]);
    });

    test('routes model tool calls through policy and never executes high-risk work without approval', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-pay","function":{"name":"transfer","arguments":"{\\"amount\\":1}"}}]}}]}\n\n',
                'data: [DONE]\n\n'
            ]))
            .mockResolvedValueOnce(sseResponse([
                'data: {"choices":[{"delta":{"content":"Approval is required."}}]}\n\n',
                'data: [DONE]\n\n'
            ]));
        const executor = jest.fn().mockResolvedValue({ tx: 'must-not-run' });
        const policy = createToolPolicy({ tools: { transfer: { risk: 'high' } } });
        const orchestrator = createChatOrchestrator({
            baseUrl: 'http://127.0.0.1:4000/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['model-a'],
            fetchImpl,
            tools: [{ type: 'function', function: { name: 'transfer', parameters: { type: 'object' } } }],
            executeTool: executor,
            toolPolicy: policy
        });

        const result = await orchestrator.streamChat({
            tenantId: 'tenant-a', userId: 'user-a', requestId: 'request-risk', model: 'model-a',
            messages: [{ role: 'user', content: 'send funds' }]
        }, { onEvent: jest.fn() });

        expect(result.text).toBe('Approval is required.');
        expect(executor).not.toHaveBeenCalled();
        const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
        expect(JSON.parse(secondBody.messages.at(-1).content)).toMatchObject({ status: 'approval_required' });
    });

    test('rejects unallowlisted models, missing tenant identity, and public service URLs before fetch', async () => {
        const fetchImpl = jest.fn();
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe']
        });
        await expect(orchestrator.streamChat({ ...baseInput, model: 'other' })).rejects.toMatchObject({ code: 'MODEL_NOT_ALLOWED' });
        await expect(orchestrator.streamChat({ ...baseInput, tenantId: '' })).rejects.toMatchObject({ code: 'IDENTITY_REQUIRED' });
        expect(() => createChatOrchestrator({
            fetchImpl,
            baseUrl: 'https://public.example.com/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe']
        })).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }));
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('enforces token and projected cost ceilings before fetch', async () => {
        const fetchImpl = jest.fn();
        const tokenLimited = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            maxInputTokens: 1
        });
        await expect(tokenLimited.streamChat(baseInput)).rejects.toMatchObject({ code: 'TOKEN_LIMIT' });

        const costLimited = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            maxInputTokens: 100,
            maxOutputTokens: 1000,
            maxCostUsd: 0.001,
            modelCostsPerMillion: { 'route-safe': { input: 1, output: 10 } }
        });
        await expect(costLimited.streamChat(baseInput)).rejects.toMatchObject({ code: 'COST_LIMIT' });

        const unknownCost = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            maxCostUsd: 1,
            modelCostsPerMillion: {}
        });
        await expect(unknownCost.streamChat(baseInput)).rejects.toMatchObject({ code: 'COST_MODEL_REQUIRED' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('enforces per-tenant concurrency without blocking another tenant', async () => {
        let release;
        const held = new Promise(resolve => { release = resolve; });
        const fetchImpl = jest.fn(async () => { await held; return sseResponse(['data: [DONE]\n\n']); });
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            maxConcurrentPerTenant: 1
        });
        const first = orchestrator.streamChat(baseInput);
        await new Promise(resolve => setImmediate(resolve));
        await expect(orchestrator.streamChat(baseInput)).rejects.toMatchObject({ code: 'TENANT_CONCURRENCY_LIMIT' });
        const other = orchestrator.streamChat({ ...baseInput, tenantId: 'tenant-b' });
        release();
        await Promise.all([first, other]);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('propagates caller abort and applies timeout', async () => {
        const fetchImpl = jest.fn((url, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        }));
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            timeoutMs: 20
        });
        await expect(orchestrator.streamChat(baseInput)).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });

        const controller = new AbortController();
        const pending = orchestrator.streamChat(baseInput, { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ code: 'CLIENT_ABORTED' });
    });

    test('falls back from xBot agent only before output starts', async () => {
        const hermesClient = {
            createRun: jest.fn().mockRejectedValue(Object.assign(new Error('offline'), { code: 'XBOT_UPSTREAM_ERROR' }))
        };
        const fetchImpl = jest.fn().mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"fallback"}}]}\n\n',
            'data: [DONE]\n\n'
        ]));
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            hermesEnabled: true,
            hermesClient
        });
        await expect(orchestrator.streamChat({ ...baseInput, requestId: 'request-1' })).resolves.toMatchObject({ completed: true, engine: '9router' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('never falls back after xBot agent created a run, even when its stream emitted nothing', async () => {
        const hermesClient = {
            createRun: jest.fn().mockResolvedValue({ runId: 'run-1' }),
            streamRun: jest.fn().mockRejectedValue(
                Object.assign(new Error('stream closed'), { code: 'XBOT_STREAM_INCOMPLETE' })
            ),
            cancelRun: jest.fn().mockResolvedValue({ status: 'stopping' })
        };
        const fetchImpl = jest.fn();
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            hermesEnabled: true,
            hermesClient
        });

        await expect(orchestrator.streamChat({ ...baseInput, requestId: 'request-1' }))
            .rejects.toMatchObject({ code: 'XBOT_STREAM_INCOMPLETE' });
        expect(hermesClient.cancelRun).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1', requestId: expect.any(String)
        }));
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('resumes only a pending xBot agent choice bound to the tenant and run', async () => {
        let releaseStream;
        const streamHeld = new Promise(resolve => { releaseStream = resolve; });
        const hermesClient = {
            createRun: jest.fn().mockResolvedValue({ runId: 'run-1' }),
            streamRun: jest.fn(async ({ onEvent }) => {
                await onEvent({ type: 'approval-required', runId: 'run-1', command: 'do thing', choices: ['once', 'deny'] });
                await streamHeld;
                await onEvent({ type: 'completed', runId: 'run-1' });
                return { completed: true, runId: 'run-1' };
            }),
            approveRun: jest.fn(async () => {
                releaseStream();
                return { status: 'running' };
            })
        };
        const orchestrator = createChatOrchestrator({
            fetchImpl: jest.fn(),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            hermesEnabled: true,
            hermesClient
        });
        const running = orchestrator.streamChat({ ...baseInput, requestId: 'request-1' }, { onEvent: jest.fn() });
        await new Promise(resolve => setImmediate(resolve));

        await expect(orchestrator.approveAgentRun({
            tenantId: 'tenant-b', userId: 'user-a', runId: 'run-1',
            choice: 'once', requestId: 'approval-cross-tenant'
        })).rejects.toMatchObject({ code: 'RUN_TENANT_MISMATCH' });
        await expect(orchestrator.approveAgentRun({
            tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1',
            choice: 'always', requestId: 'approval-unoffered'
        })).rejects.toMatchObject({ code: 'APPROVAL_CHOICE_INVALID' });
        await expect(orchestrator.approveAgentRun({
            tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1',
            choice: 'once', requestId: 'approval-1'
        })).resolves.toEqual({ status: 'running' });
        await running;
        expect(hermesClient.approveRun).toHaveBeenCalledTimes(1);
    });

    test('does not fallback or report done after xBot agent emitted partial output', async () => {
        const events = [];
        const hermesClient = {
            createRun: jest.fn().mockResolvedValue({ runId: 'run-1' }),
            streamRun: jest.fn(async ({ onEvent }) => {
                await onEvent({ type: 'text-delta', text: 'partial' });
                throw Object.assign(new Error('stream failed'), { code: 'XBOT_UPSTREAM_ERROR' });
            })
        };
        const fetchImpl = jest.fn();
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            hermesEnabled: true,
            hermesClient
        });
        await expect(orchestrator.streamChat({ ...baseInput, requestId: 'request-1' }, { onEvent: e => events.push(e) })).rejects.toMatchObject({ code: 'XBOT_UPSTREAM_ERROR' });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(events.some(e => e.type === 'done')).toBe(false);
    });

    test('does not report a cancelled xBot agent run as completed', async () => {
        const events = [];
        const hermesClient = {
            createRun: jest.fn().mockResolvedValue({ runId: 'run-1' }),
            streamRun: jest.fn(async ({ onEvent }) => {
                await onEvent({ type: 'cancelled', runId: 'run-1' });
                return { completed: false, cancelled: true, runId: 'run-1' };
            })
        };
        const orchestrator = createChatOrchestrator({
            fetchImpl: jest.fn(),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            hermesEnabled: true,
            hermesClient
        });

        await expect(orchestrator.streamChat({ ...baseInput, requestId: 'request-1' }, { onEvent: event => events.push(event) }))
            .resolves.toEqual({ completed: false, cancelled: true, text: '', engine: 'xbot-agent', runId: 'run-1' });
        expect(events.some(event => event.type === 'done')).toBe(false);
    });

    test('stops the Hermes run when the caller aborts its event stream', async () => {
        const hermesClient = {
            createRun: jest.fn().mockResolvedValue({ runId: 'run-1' }),
            streamRun: jest.fn(({ signal }) => new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'CLIENT_ABORTED' })), { once: true });
            })),
            cancelRun: jest.fn().mockResolvedValue({ status: 'stopping' })
        };
        const orchestrator = createChatOrchestrator({
            fetchImpl: jest.fn(),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            hermesEnabled: true,
            hermesClient
        });
        const controller = new AbortController();
        const running = orchestrator.streamChat(
            { ...baseInput, requestId: 'request-1' },
            { signal: controller.signal }
        );
        await new Promise(resolve => setImmediate(resolve));
        controller.abort();

        await expect(running).rejects.toMatchObject({ code: 'CLIENT_ABORTED' });
        expect(hermesClient.cancelRun).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1', requestId: expect.any(String)
        }));
    });

    test('opens its circuit after repeated upstream errors and enforces tenant request ceilings', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response('', { status: 503 }));
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            circuitFailureThreshold: 2,
            rateLimitPerMinute: 2
        });
        await expect(orchestrator.streamChat(baseInput)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
        await expect(orchestrator.streamChat(baseInput)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
        await expect(orchestrator.streamChat({ ...baseInput, tenantId: 'tenant-b' })).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);

        const healthy = createChatOrchestrator({
            fetchImpl: jest.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n'])),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe'],
            rateLimitPerMinute: 1
        });
        await healthy.streamChat(baseInput);
        await expect(healthy.streamChat(baseInput)).rejects.toMatchObject({ code: 'TENANT_RATE_LIMIT' });
    });

    test('reports upstream errors without fake completion', async () => {
        const events = [];
        const orchestrator = createChatOrchestrator({
            fetchImpl: jest.fn().mockResolvedValue(new Response('contains private diagnostics', { status: 503 })),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe']
        });
        await expect(orchestrator.streamChat(baseInput, { onEvent: e => events.push(e) })).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 503 });
        expect(events.some(e => e.type === 'done')).toBe(false);
    });

    test('does not retry after 9Router accepted a stream that ended incompletely', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
        ]));
        const events = [];
        const orchestrator = createChatOrchestrator({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['route-safe']
        });

        await expect(orchestrator.streamChat(baseInput, { onEvent: event => events.push(event) }))
            .rejects.toMatchObject({ code: 'UPSTREAM_STREAM_INCOMPLETE' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(events).toContainEqual({ type: 'text-delta', data: { text: 'partial' } });
        expect(events.some(event => event.type === 'done')).toBe(false);
    });
});

describe('Tool policy', () => {
    test('high-risk calls require tenant-bound approval and execute once per idempotency key', async () => {
        const approvals = new MemoryApprovalStore();
        const idempotency = new MemoryIdempotencyStore();
        const policy = createToolPolicy({
            tools: { transfer: { risk: 'high' } },
            approvalStore: approvals,
            idempotencyStore: idempotency
        });
        const envelope = { tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1', toolCallId: 'call-1', toolName: 'transfer', args: { amount: 1 }, idempotencyKey: 'idem-1' };
        await expect(policy.execute(envelope, jest.fn())).resolves.toMatchObject({ status: 'approval_required' });

        const approvalToken = approvals.issue(envelope, 1000);
        const executor = jest.fn().mockResolvedValue({ tx: 'dry-run' });
        await expect(policy.execute({ ...envelope, approvalToken }, executor)).resolves.toEqual({ status: 'executed', result: { tx: 'dry-run' } });
        await expect(policy.execute({ ...envelope, approvalToken }, executor)).resolves.toMatchObject({ status: 'duplicate' });
        expect(executor).toHaveBeenCalledTimes(1);

        const crossTenant = { ...envelope, tenantId: 'tenant-b', idempotencyKey: 'idem-2', approvalToken };
        await expect(policy.execute(crossTenant, executor)).resolves.toMatchObject({ status: 'approval_required' });
        expect(executor).toHaveBeenCalledTimes(1);
    });

    test('binds idempotency keys to exact arguments and joins concurrent duplicate execution', async () => {
        const policy = createToolPolicy({ tools: { lookup: { risk: 'low' } } });
        const envelope = { tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1', toolCallId: 'call-1', toolName: 'lookup', args: { token: 'A' }, idempotencyKey: 'idem-1' };
        let finish;
        const executor = jest.fn(() => new Promise(resolve => { finish = resolve; }));

        const first = policy.execute(envelope, executor);
        const duplicate = policy.execute(envelope, executor);
        await Promise.resolve();
        finish({ value: 1 });

        await expect(first).resolves.toEqual({ status: 'executed', result: { value: 1 } });
        await expect(duplicate).resolves.toEqual({ status: 'duplicate', result: { value: 1 } });
        await expect(policy.execute({ ...envelope, args: { token: 'B' } }, executor))
            .resolves.toEqual({ status: 'denied', reason: 'idempotency_conflict' });
        expect(executor).toHaveBeenCalledTimes(1);
    });
});