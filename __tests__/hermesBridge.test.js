const { createXBotAgentClient } = require('../src/services/xbot-agent/client');

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function sseResponse(text) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); }
    }), { headers: { 'content-type': 'text/event-stream' } });
}

describe('xBot agent service client Runs contract', () => {
    test('uses the official create, approval, events, and stop routes with signed tenant context', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'started' }, 202))
            .mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', choice: 'once', resolved: 1 }))
            .mockResolvedValueOnce(sseResponse([
                'data: {"event":"message.delta","run_id":"run-1","delta":"hi"}\n\n',
                'data: {"event":"approval.request","run_id":"run-1","command":"do thing","choices":["once","deny"]}\n\n',
                'data: {"event":"run.completed","run_id":"run-1","output":"hi","usage":{"total_tokens":2}}\n\n',
                ': stream closed\n\n'
            ].join('')))
            .mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'stopping' }));
        const client = createXBotAgentClient({
            baseUrl: 'http://127.0.0.1:8000',
            serviceToken: 'xbot-secret',
            contextSecret: 'context-secret',
            fetchImpl
        });
        const context = { tenantId: 'tenant-a', userId: 'user-a' };
        const created = await client.createRun({
            ...context,
            messages: [
                { role: 'user', content: 'earlier' },
                { role: 'assistant', content: 'answer' },
                { role: 'user', content: 'hello' }
            ],
            instructions: 'Be concise',
            model: 'model-a',
            requestId: 'request-1'
        });
        await client.approveRun({ ...context, runId: created.run_id, choice: 'once', requestId: 'request-2' });
        const events = [];
        const streamed = await client.streamRun({ ...context, runId: created.run_id, onEvent: event => events.push(event) });
        await client.cancelRun({ ...context, runId: created.run_id, requestId: 'request-3' });

        expect(created).toEqual({ run_id: 'run-1', status: 'started' });
        expect(created.runId).toBe('run-1');
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
            input: [
                { role: 'user', content: 'earlier' },
                { role: 'assistant', content: 'answer' },
                { role: 'user', content: 'hello' }
            ],
            instructions: 'Be concise',
            model: 'model-a'
        });
        expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
            'http://127.0.0.1:8000/v1/runs',
            'http://127.0.0.1:8000/v1/runs/run-1/approval',
            'http://127.0.0.1:8000/v1/runs/run-1/events',
            'http://127.0.0.1:8000/v1/runs/run-1/stop'
        ]);
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ choice: 'once' });
        expect(events).toEqual([
            { type: 'text-delta', text: 'hi' },
            { type: 'approval-required', runId: 'run-1', command: 'do thing', choices: ['once', 'deny'] },
            { type: 'completed', runId: 'run-1', output: 'hi', usage: { total_tokens: 2 } }
        ]);
        expect(streamed).toEqual({ completed: true, runId: 'run-1' });
        for (const [, init] of fetchImpl.mock.calls) {
            expect(init.headers.Authorization).toBe('Bearer xbot-secret');
            expect(init.headers['X-XBot-Context']).toBeTruthy();
            expect(init.headers['X-XBot-Signature']).toMatch(/^[a-f0-9]{64}$/);
            expect(JSON.stringify(init)).not.toContain('context-secret');
        }
        expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe('request-1');
        expect(fetchImpl.mock.calls[1][1].headers['Idempotency-Key']).toBe('request-2');
        expect(fetchImpl.mock.calls[3][1].headers['Idempotency-Key']).toBe('request-3');
    });

    test('accepts explicit official input and history without undefined optional fields', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'started' }, 202));
        const client = createXBotAgentClient({ baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign', fetchImpl });
        await client.createRun({
            tenantId: 'tenant-a', userId: 'user-a', requestId: 'request-1',
            input: 'hello', conversationHistory: [{ role: 'user', content: 'before' }]
        });
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
            input: 'hello', conversation_history: [{ role: 'user', content: 'before' }]
        });
    });

    test('does not report success when the official stream closes without a terminal event', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'started' }, 202))
            .mockResolvedValueOnce(sseResponse('data: {"event":"message.delta","run_id":"run-1","delta":"partial"}\n\n'));
        const client = createXBotAgentClient({ baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign', fetchImpl });
        await client.createRun({ tenantId: 'tenant-a', userId: 'user-a', input: 'hello', requestId: 'request-1' });
        await expect(client.streamRun({ tenantId: 'tenant-a', userId: 'user-a', runId: 'run-1' }))
            .rejects.toMatchObject({ code: 'XBOT_STREAM_INCOMPLETE' });
    });

    test('maps failed and cancelled terminal events without leaking upstream failure details', async () => {
        const failedFetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ run_id: 'run-failed', status: 'started' }, 202))
            .mockResolvedValueOnce(sseResponse('data: {"event":"run.failed","run_id":"run-failed","error":"secret traceback"}\n\n'));
        const failedClient = createXBotAgentClient({ baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign', fetchImpl: failedFetch });
        await failedClient.createRun({ tenantId: 'tenant-a', userId: 'user-a', input: 'hello', requestId: 'request-1' });
        await expect(failedClient.streamRun({ tenantId: 'tenant-a', userId: 'user-a', runId: 'run-failed' }))
            .rejects.toMatchObject({ code: 'XBOT_RUN_FAILED', message: 'xBot agent run failed' });

        const cancelledFetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ run_id: 'run-cancelled', status: 'started' }, 202))
            .mockResolvedValueOnce(sseResponse('data: {"event":"run.cancelled","run_id":"run-cancelled"}\n\n'));
        const cancelledClient = createXBotAgentClient({ baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign', fetchImpl: cancelledFetch });
        await cancelledClient.createRun({ tenantId: 'tenant-a', userId: 'user-a', input: 'hello', requestId: 'request-2' });
        const events = [];
        await expect(cancelledClient.streamRun({ tenantId: 'tenant-a', userId: 'user-a', runId: 'run-cancelled', onEvent: event => events.push(event) }))
            .resolves.toEqual({ completed: false, cancelled: true, runId: 'run-cancelled' });
        expect(events).toEqual([{ type: 'cancelled', runId: 'run-cancelled' }]);
    });

    test('propagates caller aborts and enforces request timeouts with sanitized errors', async () => {
        const pendingFetch = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
            const abort = () => reject(new DOMException('upstream details', 'AbortError'));
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
        }));
        const context = { tenantId: 'tenant-a', userId: 'user-a', input: 'hello', requestId: 'request-1' };

        const timeoutClient = createXBotAgentClient({
            baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign',
            fetchImpl: pendingFetch, timeoutMs: 5
        });
        await expect(timeoutClient.createRun(context)).rejects.toMatchObject({
            code: 'XBOT_TIMEOUT', message: 'xBot agent request timed out'
        });

        const controller = new AbortController();
        controller.abort();
        const abortClient = createXBotAgentClient({
            baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign',
            fetchImpl: pendingFetch, timeoutMs: 1000
        });
        await expect(abortClient.createRun(context, { signal: controller.signal })).rejects.toMatchObject({
            code: 'CLIENT_ABORTED', message: 'Client cancelled the request'
        });
    });

    test('prevents a different tenant from accessing a known run before making a request', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'started' }, 202));
        const client = createXBotAgentClient({ baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign', fetchImpl });
        await client.createRun({ tenantId: 'tenant-a', userId: 'user-a', input: 'hello', requestId: 'request-1' });
        await expect(client.cancelRun({ tenantId: 'tenant-b', userId: 'user-a', runId: 'run-1', requestId: 'request-2' })).rejects.toMatchObject({ code: 'RUN_TENANT_MISMATCH' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('requires stable request IDs and sanitizes upstream errors', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response('secret internal traceback', { status: 500 }));
        const client = createXBotAgentClient({ baseUrl: 'http://127.0.0.1:8000', serviceToken: 'secret', contextSecret: 'sign', fetchImpl });
        await expect(client.createRun({ tenantId: 'tenant-a', userId: 'user-a', input: 'hello' })).rejects.toMatchObject({ code: 'REQUEST_ID_REQUIRED' });
        await expect(client.createRun({ tenantId: 'tenant-a', userId: 'user-a', input: 'hello', requestId: 'request-1' })).rejects.toMatchObject({ code: 'XBOT_UPSTREAM_ERROR', status: 500 });
    });
});