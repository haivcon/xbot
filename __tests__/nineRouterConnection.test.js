const { createNineRouterConnection } = require('../src/services/nineRouterConnection');
const { checkNineRouterReadiness } = require('../src/services/nineRouterConnection');

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

describe('9Router connection discovery', () => {
    test('reports readiness only for a private URL with a server-owned credential', () => {
        expect(checkNineRouterReadiness({
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['route-safe']
        })).toEqual({ ready: true, provider: '9router' });
        expect(checkNineRouterReadiness({
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: '',
            allowedModels: ['route-safe']
        })).toEqual({ ready: false, provider: '9router', code: 'CONFIG_INVALID' });
        expect(checkNineRouterReadiness({
            baseUrl: 'https://public.example/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['route-safe']
        })).toEqual({ ready: false, provider: '9router', code: 'CONFIG_INVALID' });
    });

    test('discovers allowlisted chat models and exposes upstream metadata without credentials', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
            object: 'list',
            data: [
                { id: 'claude/sonnet', object: 'model', owned_by: 'claude', capabilities: { tools: true }, context_window: 200000, max_output_tokens: 8192, pricing: { input: 3 }, category: 'llm' },
                { id: 'codex/gpt-5', object: 'model', owned_by: 'codex' },
                { id: 'antigravity/gemini', object: 'model', owned_by: 'antigravity' },
                { id: 'image/flux', object: 'model', owned_by: 'image', kind: 'image' },
                { id: 'not-allowed', object: 'model', owned_by: 'other' },
            ]
        }));
        const connection = createNineRouterConnection({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'service-secret',
            allowedModels: ['claude/sonnet', 'codex/gpt-5', 'antigravity/gemini']
        });

        const result = await connection.discover({ tenantId: 'tenant-a', userId: 'user-a' });

        expect(result).toEqual({
            provider: { id: '9router', label: '9Router' },
            models: [
                expect.objectContaining({ id: 'claude/sonnet', provider: '9router', upstream: { id: 'claude', label: 'claude' } }),
                expect.objectContaining({ id: 'codex/gpt-5', provider: '9router', upstream: { id: 'codex', label: 'codex' } }),
                expect.objectContaining({ id: 'antigravity/gemini', provider: '9router', upstream: { id: 'antigravity', label: 'antigravity' } }),
            ],
            upstreams: [
                { id: 'claude', label: 'claude' },
                { id: 'codex', label: 'codex' },
                { id: 'antigravity', label: 'antigravity' },
            ]
        });
        expect(result.models[0]).toEqual(expect.objectContaining({
            contextLength: 200000,
            maxOutputTokens: 8192,
            pricing: { input: 3 },
            category: 'llm',
            capabilities: { tools: true }
        }));
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer service-secret');
        expect(JSON.stringify(result)).not.toContain('service-secret');
        expect(JSON.stringify(result)).not.toMatch(/apiKey|accessToken|refreshToken/i);
    });

    test('fails closed when the server-owned service credential is missing', () => {
        expect(() => createNineRouterConnection({
            fetchImpl: jest.fn(),
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: '',
            allowedModels: ['safe/model']
        })).toThrow(expect.objectContaining({ code: 'SERVICE_CREDENTIAL_REQUIRED' }));
    });

    test('fails closed on missing identity, invalid payload, and upstream errors', async () => {
        const fetchImpl = jest.fn();
        const connection = createNineRouterConnection({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['safe/model']
        });
        await expect(connection.discover({ tenantId: '', userId: 'user-a' }))
            .rejects.toMatchObject({ code: 'IDENTITY_REQUIRED' });
        expect(fetchImpl).not.toHaveBeenCalled();

        fetchImpl.mockResolvedValueOnce(jsonResponse({ data: 'not-an-array' }));
        await expect(connection.discover({ tenantId: 'tenant-a', userId: 'user-a' }))
            .rejects.toMatchObject({ code: 'DISCOVERY_INVALID' });

        fetchImpl.mockResolvedValueOnce(jsonResponse({ error: 'private diagnostics' }, 503));
        await expect(connection.discover({ tenantId: 'tenant-a', userId: 'user-a' }))
            .rejects.toMatchObject({ code: 'DISCOVERY_UPSTREAM_ERROR', status: 503 });
    });

    test('propagates caller cancellation to discovery without retrying', async () => {
        const fetchImpl = jest.fn((url, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        }));
        const connection = createNineRouterConnection({
            fetchImpl,
            baseUrl: 'http://127.0.0.1:20128/v1',
            serviceCredential: 'secret',
            allowedModels: ['safe/model'],
            timeoutMs: 1000
        });
        const controller = new AbortController();
        const pending = connection.discover({ tenantId: 'tenant-a', userId: 'user-a' }, { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ code: 'CLIENT_ABORTED' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
