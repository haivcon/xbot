'use strict';

const http = require('http');
const express = require('express');

process.env.PUBLIC_BASE_URL = 'https://xbot.xlayer.my';
process.env.ROUTER_URL = 'http://9router:20128';
process.env.ROUTER_SECRET = 'test-router-secret-material-that-is-exactly-long-enough-for-hmac-and-vault';
process.env.DASHBOARD_JWT_SECRET = 'test-dashboard-jwt-secret-that-is-stable-for-this-suite';

let mockCapturedState;
let mockExchangeWrites = 0;

jest.mock('../src/services/nineRouterTenantClient', () => {
    const actual = jest.requireActual('../src/services/nineRouterTenantClient');
    const tenantContext = jest.requireActual('../services/nine-router-sidecar/tenant-context.cjs');
    return {
        ...actual,
        requestForTenant: jest.fn(async input => {
            if (input.path.endsWith('/redirect-authorize')) {
                mockCapturedState = input.data.state;
                return { data: {
                    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(input.data.state)}`,
                    state: input.data.state,
                    codeVerifier: 'server-only-verifier'
                } };
            }
            if (input.path.endsWith('/redirect-exchange')) {
                mockExchangeWrites += 1;
                return { data: { success: true, connection: { id: 'connection-1', provider: 'antigravity' } } };
            }
            throw new Error('unexpected tenant request');
        })
    };
});

const { createJWT } = require('../src/server/dashboardAuth');
const { createDashboardRoutes } = require('../src/server/dashboardRoutes');
const { clearUsedNoncesForTests } = require('../services/nine-router-sidecar/tenant-context.cjs');

function request(server, { method = 'GET', path, token, body }) {
    const address = server.address();
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port: address.port, method, path,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, res => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: raw && String(res.headers['content-type'] || '').includes('json') ? JSON.parse(raw) : raw
            }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('production-like OAuth root HTTP and HMAC sidecar path', () => {
    let server;
    const token = createJWT({ userId: '10001', role: 'user' });

    beforeAll(done => {
        process.env.NODE_ENV = 'test';
        clearUsedNoncesForTests();
        const app = express();
        app.use(express.json());
        app.use('/api/dashboard', createDashboardRoutes());
        server = app.listen(0, '127.0.0.1', done);
    });

    afterEach(() => {
        mockCapturedState = undefined;
    });

    afterAll(done => {
        server.closeAllConnections?.();
        server.close(done);
    });

    test('requires dashboard auth and blocks unsafe providers at initiation', async () => {
        await expect(request(server, {
            method: 'POST', path: '/api/dashboard/ai/9router/oauth/antigravity/start', body: {}
        })).resolves.toMatchObject({ status: 401 });
        for (const provider of ['cline', 'kimchi', 'claude']) {
            await expect(request(server, {
                method: 'POST', path: `/api/dashboard/ai/9router/oauth/${provider}/start`, token, body: {}
            })).resolves.toMatchObject({ status: 400, body: { error: 'OAUTH_PROVIDER_UNAVAILABLE' } });
        }
    });

    test('starts, completes with fixed 303, polls status, and prevents replay/double write', async () => {
        const tenantClient = jest.requireActual('../src/services/nineRouterTenantClient');
        const tenantContext = jest.requireActual('../services/nine-router-sidecar/tenant-context.cjs');
        const hmacBody = tenantClient.serializeRequestBody({ probe: true });
        const hmacPath = '/api/oauth/antigravity/redirect-authorize';
        const hmacHeaders = tenantClient.createTenantHeaders({ tenantId: '10001', method: 'POST', path: hmacPath, body: hmacBody });
        expect(tenantContext.verifyTenantAssertion({ method: 'POST', url: hmacPath, headers: hmacHeaders, socket: { remoteAddress: '127.0.0.1' } }, Buffer.from(hmacBody))).toBe('10001');

        const started = await request(server, {
            method: 'POST', path: '/api/dashboard/ai/9router/oauth/antigravity/start', token,
            body: { returnTarget: 'https://evil.invalid/steal' }
        });
        expect(started).toMatchObject({ status: 200, body: { statusToken: expect.any(String) } });
        expect(started.headers['cache-control']).toContain('no-store');
        expect(JSON.stringify(started.body)).not.toMatch(/server-only-verifier|codeVerifier/);
        const publicAuthorizationUrl = new URL(started.body.authorizationUrl);
        expect(publicAuthorizationUrl.searchParams.get('state')).toBe(mockCapturedState);

        const callbackPath = `/api/dashboard/ai/9router/oauth/callback/antigravity?state=${encodeURIComponent(mockCapturedState)}&code=opaque-code`;
        const callback = await request(server, { path: callbackPath });
        expect(callback.status).toBe(303);
        expect(callback.headers.location).toBe('https://xbot.xlayer.my/xBot/?section=providers&oauth_result=connected');
        expect(callback.headers.location).not.toMatch(/opaque-code|state=|verifier/);
        expect(callback.headers['cache-control']).toContain('no-store');

        const status = await request(server, {
            path: `/api/dashboard/ai/9router/oauth/status/${encodeURIComponent(started.body.statusToken)}`, token
        });
        expect(status).toMatchObject({ status: 200, body: { status: 'connected', provider: 'antigravity' } });

        const replay = await request(server, { path: callbackPath });
        expect(replay.status).toBe(303);
        expect(replay.headers.location).toContain('oauth_result=invalid_state');
        expect(mockExchangeWrites).toBe(1);
    });
});
