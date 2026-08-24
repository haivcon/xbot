const crypto = require('crypto');

const {
    createTenantHeaders,
    normalizeInternalBaseUrl,
    normalizePath,
    normalizeTenantId,
    serializeRequestBody
} = require('../src/services/nineRouterTenantClient');
const {
    clearUsedNoncesForTests,
    getTenantId,
    runWithTenant,
    verifyTenantAssertion
} = require('../services/nine-router-sidecar/tenant-context.cjs');

const TENANT_SECRET = 'test-tenant-secret-that-is-at-least-32-characters';

function requestFromHeaders(headers, { method = 'GET', path = '/v1/models' } = {}) {
    return {
        method,
        url: path,
        headers,
        socket: { remoteAddress: '127.0.0.1' }
    };
}

describe('9Router tenant assertion isolation', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.ROUTER_SECRET = TENANT_SECRET;
        process.env.ROUTER_URL = 'http://9router:20128';
        clearUsedNoncesForTests();
    });

    afterAll(() => {
        delete process.env.ROUTER_SECRET;
        delete process.env.ROUTER_URL;
    });

    test('accepts only canonical Telegram tenant IDs and private sidecar URLs', () => {
        expect(normalizeTenantId(123456789)).toBe('123456789');
        expect(() => normalizeTenantId('../123')).toThrow(expect.objectContaining({ code: 'TENANT_INVALID' }));
        expect(() => normalizeTenantId('tenant-a')).toThrow(expect.objectContaining({ code: 'TENANT_INVALID' }));
        expect(normalizeInternalBaseUrl('http://nine-router:20127/')).toBe('http://nine-router:20127');
        expect(() => normalizeInternalBaseUrl('https://public.example/v1')).toThrow(
            expect.objectContaining({ code: 'ROUTER_URL_INVALID' })
        );
    });

    test.each([
        '/v1/../api/providers',
        '/v1/%2e%2e/api/providers',
        '/v1/%252e%252e/api/providers',
        '/v1\\models',
        '/v1/%E0%A4%A'
    ])('rejects traversal or ambiguous path %s', path => {
        expect(() => normalizePath(path)).toThrow(expect.objectContaining({ code: 'PATH_INVALID' }));
    });

    test('allows the read-only provider catalog and rejects unrelated sidecar APIs', () => {
        const { isAllowedManagementPath } = require('../src/services/nineRouterTenantClient');
        expect(isAllowedManagementPath('/api/providers/catalog')).toBe(true);
        expect(isAllowedManagementPath('/api/usage/stats')).toBe(true);
        expect(isAllowedManagementPath('/api/auth/status')).toBe(false);
        expect(isAllowedManagementPath('/api/settings/database')).toBe(false);
    });

    test('binds tenant, method, path and exact serialized body', () => {
        const data = { model: 'route/a', messages: [{ role: 'user', content: 'hello' }] };
        const body = serializeRequestBody(data);
        const headers = createTenantHeaders({
            tenantId: '10001',
            method: 'POST',
            path: '/v1/chat/completions',
            body
        });

        expect(headers['x-xbot-body-sha256']).toBe(
            crypto.createHash('sha256').update(body).digest('hex')
        );
        expect(verifyTenantAssertion(
            requestFromHeaders(headers, { method: 'POST', path: '/v1/chat/completions' }),
            Buffer.from(body)
        )).toBe('10001');
    });

    test('rejects assertion reuse, cross-tenant use, changed path and changed body', () => {
        const body = JSON.stringify({ model: 'route/a' });

        const replayHeaders = createTenantHeaders({
            tenantId: '10001',
            method: 'POST',
            path: '/v1/chat/completions',
            body
        });
        const replayRequest = requestFromHeaders(replayHeaders, {
            method: 'POST',
            path: '/v1/chat/completions'
        });
        expect(verifyTenantAssertion(replayRequest, Buffer.from(body))).toBe('10001');
        expect(() => verifyTenantAssertion(replayRequest, Buffer.from(body))).toThrow('Replayed tenant assertion');

        const tenantHeaders = createTenantHeaders({
            tenantId: '10001',
            method: 'POST',
            path: '/v1/chat/completions',
            body
        });
        expect(() => verifyTenantAssertion({
            ...requestFromHeaders(tenantHeaders, { method: 'POST', path: '/v1/chat/completions' }),
            headers: { ...tenantHeaders, 'x-xbot-tenant': '20002' }
        }, Buffer.from(body))).toThrow('Invalid tenant assertion');

        const pathHeaders = createTenantHeaders({
            tenantId: '10001',
            method: 'POST',
            path: '/v1/chat/completions',
            body
        });
        expect(() => verifyTenantAssertion(
            requestFromHeaders(pathHeaders, { method: 'POST', path: '/v1/models' }),
            Buffer.from(body)
        )).toThrow('Invalid tenant assertion');

        const bodyHeaders = createTenantHeaders({
            tenantId: '10001',
            method: 'POST',
            path: '/v1/chat/completions',
            body
        });
        expect(() => verifyTenantAssertion(
            requestFromHeaders(bodyHeaders, { method: 'POST', path: '/v1/chat/completions' }),
            Buffer.from('{"model":"route/b"}')
        )).toThrow('Tenant assertion body mismatch');
    });

    test('rejects expired assertions and public peers', () => {
        const bodyDigest = crypto.createHash('sha256').update('').digest('hex');
        const timestamp = Date.now() - 60_000;
        const nonce = crypto.randomBytes(16).toString('hex');
        const signature = crypto
            .createHmac('sha256', TENANT_SECRET)
            .update(`10001\n${timestamp}\n${nonce}\nGET\n/v1/models\n${bodyDigest}`)
            .digest('hex');
        const headers = {
            'x-xbot-tenant': '10001',
            'x-xbot-timestamp': String(timestamp),
            'x-xbot-nonce': nonce,
            'x-xbot-body-sha256': bodyDigest,
            'x-xbot-signature': signature
        };
        expect(() => verifyTenantAssertion(requestFromHeaders(headers), Buffer.alloc(0)))
            .toThrow('Expired tenant assertion');

        const validHeaders = createTenantHeaders({
            tenantId: '10001',
            method: 'GET',
            path: '/v1/models'
        });
        expect(() => verifyTenantAssertion({
            ...requestFromHeaders(validHeaders),
            socket: { remoteAddress: '203.0.113.5' }
        }, Buffer.alloc(0))).toThrow('restricted to private peers');
    });

    test('AsyncLocalStorage keeps concurrent tenant A/B contexts isolated', async () => {
        const seen = await Promise.all([
            runWithTenant('10001', async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return getTenantId();
            }),
            runWithTenant('20002', async () => {
                await new Promise(resolve => setTimeout(resolve, 1));
                return getTenantId();
            })
        ]);

        expect(seen).toEqual(['10001', '20002']);
    });

    test('concurrent header creation never leaks tenant or nonce', async () => {
        const headers = await Promise.all(
            Array.from({ length: 20 }, (_, index) => Promise.resolve(createTenantHeaders({
                tenantId: index % 2 === 0 ? '10001' : '20002',
                method: 'GET',
                path: '/v1/models'
            })))
        );

        expect(new Set(headers.map(item => item['x-xbot-nonce']))).toHaveProperty('size', 20);
        headers.forEach((item, index) => {
            expect(item['x-xbot-tenant']).toBe(index % 2 === 0 ? '10001' : '20002');
        });
    });
});