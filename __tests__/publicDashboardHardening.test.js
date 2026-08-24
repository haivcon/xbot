'use strict';

const http = require('http');
const express = require('express');

function request(server, { method = 'GET', path = '/', headers = {}, body }) {
    const address = server.address();
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: address.port,
            method,
            path,
            headers: {
                ...headers,
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, res => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

describe('public dashboard HTTP hardening', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        process.env.PUBLIC_BASE_URL = 'https://xbot.xlayer.my';
        process.env.CORS_ALLOWED_ORIGINS = 'https://xbot.xlayer.my,http://127.0.0.1:5173';
        process.env.TRUST_PROXY = 'loopback';
        process.env.DASHBOARD_JWT_SECRET = 'test-only-dashboard-secret';
        process.env.EXECUTION_DISABLED = 'true';
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('defaults production bind to loopback and accepts explicit HOST', () => {
        const { getApiHost } = require('../src/server/apiServer');
        delete process.env.HOST;
        expect(getApiHost()).toBe('127.0.0.1');
        process.env.HOST = '127.0.0.1';
        expect(getApiHost()).toBe('127.0.0.1');
    });

    test('CORS allows configured origin, rejects unlisted origin, and permits no-Origin clients', async () => {
        const { createCorsMiddleware } = require('../src/server/apiServer');
        const app = express();
        app.use(createCorsMiddleware());
        app.get('/probe', (_req, res) => res.json({ ok: true }));
        const server = await listen(app);
        try {
            const allowed = await request(server, { path: '/probe', headers: { Origin: 'https://xbot.xlayer.my' } });
            expect(allowed.status).toBe(200);
            expect(allowed.headers['access-control-allow-origin']).toBe('https://xbot.xlayer.my');

            const denied = await request(server, { path: '/probe', headers: { Origin: 'https://evil.example' } });
            expect(denied.status).toBe(403);
            expect(denied.headers['access-control-allow-origin']).toBeUndefined();

            const serverClient = await request(server, { path: '/probe' });
            expect(serverClient.status).toBe(200);
            expect(serverClient.headers['access-control-allow-origin']).toBeUndefined();
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('security headers and CSP support current Telegram/font assets; HSTS requires trusted HTTPS', async () => {
        const { localOnly, securityHeaders, trustLoopbackProxy } = require('../src/server/apiServer');
        const app = express();
        app.set('trust proxy', trustLoopbackProxy);
        app.use(securityHeaders);
        app.get('/probe', (_req, res) => res.json({ ok: true }));
        const server = await listen(app);
        try {
            const plain = await request(server, { path: '/probe' });
            expect(plain.headers['x-content-type-options']).toBe('nosniff');
            expect(plain.headers['x-frame-options']).toBe('DENY');
            expect(plain.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
            expect(plain.headers['permissions-policy']).toContain('camera=()');
            expect(plain.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline' https://telegram.org");
            expect(plain.headers['content-security-policy']).toContain('frame-src https://oauth.telegram.org https://telegram.org');
            expect(plain.headers['content-security-policy']).toContain('https://fonts.googleapis.com');
            expect(plain.headers['content-security-policy']).toContain("connect-src 'self' wss://xbot.xlayer.my ws://127.0.0.1:5173");
            expect(plain.headers['content-security-policy']).not.toContain("connect-src 'self' https: wss:");
            expect(plain.headers['strict-transport-security']).toBeUndefined();

            const forwarded = await request(server, { path: '/probe', headers: { 'X-Forwarded-Proto': 'https' } });
            expect(forwarded.headers['strict-transport-security']).toContain('max-age=31536000');
            expect(trustLoopbackProxy('203.0.113.9')).toBe(false);
            const denied = { status: jest.fn(() => denied), end: jest.fn() };
            localOnly({ socket: { remoteAddress: '203.0.113.9' } }, denied, jest.fn());
            expect(denied.status).toHaveBeenCalledWith(404);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
});

describe('dashboard public metadata, auth hygiene, and owner boundary', () => {
    const originalEnv = { ...process.env };
    let server;

    beforeAll(async () => {
        process.env.DASHBOARD_JWT_SECRET = 'test-only-dashboard-secret';
        process.env.BOT_USERNAME = 'xbot_test_bot';
        process.env.PUBLIC_BASE_URL = 'https://xbot.xlayer.my';
        process.env.CORS_ALLOWED_ORIGINS = 'https://xbot.xlayer.my';
        process.env.EXECUTION_DISABLED = 'true';
        jest.resetModules();
        const { createDashboardRoutes } = require('../src/server/dashboardRoutes');
        const app = express();
        app.use(express.json());
        app.use('/api/dashboard', createDashboardRoutes());
        server = await listen(app);
    });

    afterAll(async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        process.env = originalEnv;
    });

    test('public health and bot-info expose only probe/login fields', async () => {
        const health = await request(server, { path: '/api/dashboard/health' });
        expect(health.status).toBe(200);
        expect(JSON.parse(health.raw)).toEqual({ status: expect.stringMatching(/^(ok|degraded)$/) });

        const info = await request(server, { path: '/api/dashboard/bot-info' });
        expect(info.status).toBe(200);
        expect(JSON.parse(info.raw)).toEqual({ botUsername: 'xbot_test_bot' });
    });

    test('every owner route rejects a non-owner JWT at the router boundary', async () => {
        const { createJWT } = require('../src/server/dashboardAuth');
        const { createDashboardRoutes } = require('../src/server/dashboardRoutes');
        const router = createDashboardRoutes();
        const ownerRoutes = router.stack
            .filter(layer => layer.route?.path?.startsWith('/owner'))
            .flatMap(layer => Object.keys(layer.route.methods).map(method => ({ method: method.toUpperCase(), path: layer.route.path })));
        expect(ownerRoutes.length).toBeGreaterThan(35);
        expect(ownerRoutes).toContainEqual({ method: 'GET', path: '/owner/analytics/stats' });

        const token = createJWT({ userId: 'member-a', role: 'user' });
        for (const route of ownerRoutes) {
            const concretePath = route.path.replace(/:([A-Za-z0-9_]+)/g, 'test');
            const response = await request(server, {
                method: route.method,
                path: `/api/dashboard${concretePath}`,
                headers: { Authorization: `Bearer ${token}` },
                body: ['POST', 'PUT', 'PATCH'].includes(route.method) ? {} : undefined
            });
            expect({ route, status: response.status }).toEqual({ route, status: 403 });
        }
    });

    test('auto-login consumes a short-lived token and removes it from URL/history', async () => {
        const { dashboardLoginTokens } = require('../src/core/state');
        const token = 'test-one-time-login-token';
        dashboardLoginTokens.set(token, { userId: '123', firstName: 'Test', username: 'test', createdAt: Date.now() });
        const first = await request(server, { path: `/api/dashboard/auth/auto-login?token=${token}` });
        expect(first.status).toBe(200);
        expect(first.headers['cache-control']).toBe('no-store');
        expect(first.headers['referrer-policy']).toBe('no-referrer');
        expect(first.raw).toContain("history.replaceState(null, '', '/api/dashboard/auth/auto-login')");
        expect(first.raw).toContain("window.location.replace('/xBot/')");
        expect(first.raw).not.toContain('window.location.href');
        expect(dashboardLoginTokens.has(token)).toBe(false);

        const second = await request(server, { path: `/api/dashboard/auth/auto-login?token=${token}` });
        expect(second.status).toBe(401);
        expect(second.headers['cache-control']).toBe('no-store');
    });

    test('safe mode remains fail-closed', () => {
        const { isExecutionDisabled } = require('../src/core/executionPolicy');
        expect(isExecutionDisabled()).toBe(true);
    });

    test('WebSocket authentication rejects missing tokens and preserves JWT role', () => {
        const { authenticateWebSocketRequest } = require('../src/server/apiServer');
        const { createJWT } = require('../src/server/dashboardAuth');
        expect(authenticateWebSocketRequest({ headers: {} })).toBeNull();
        const token = createJWT({ userId: 'member-a', role: 'user' });
        expect(authenticateWebSocketRequest({ headers: {
            origin: 'https://xbot.xlayer.my',
            'sec-websocket-protocol': `xbot-auth, ${token}`
        } }))
            .toMatchObject({ userId: 'member-a', role: 'user' });
        expect(authenticateWebSocketRequest({ headers: {
            origin: 'https://evil.example',
            'sec-websocket-protocol': `xbot-auth, ${token}`
        } })).toBeNull();
    });
});
