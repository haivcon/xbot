'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { createJWT } = require('../src/server/dashboardAuth');

const ROOT = path.join(__dirname, '..');
const TEST_TOKEN = 'test-telegram-token-redacted';

function mockResponse({ status = 200, headers = {}, json, chunks }) {
    const bodyChunks = chunks === undefined && json !== undefined ? [JSON.stringify(json)] : (chunks || []);
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => headers[String(name).toLowerCase()] || null },
        body: {
            async *[Symbol.asyncIterator]() {
                for (const chunk of bodyChunks) yield Buffer.from(chunk);
            }
        }
    };
}

function request(server, { token, query = '' } = {}) {
    const address = server.address();
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port: address.port,
            path: `/api/dashboard/user/avatar${query}`,
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
    });
}

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

describe('tenant-bound Telegram dashboard avatar', () => {
    let createTelegramAvatarService;
    let createDashboardRoutes;

    beforeAll(() => {
        ({ createTelegramAvatarService } = require('../src/services/telegramAvatar'));
        ({ createDashboardRoutes } = require('../src/server/dashboardRoutes'));
    });

    test('requires dashboard auth and derives only the authenticated principal', async () => {
        const seen = [];
        const avatarService = { getAvatar: jest.fn(async userId => { seen.push(String(userId)); return { bytes: Buffer.from([1]), mime: 'image/png' }; }) };
        const app = express();
        app.use('/api/dashboard', createDashboardRoutes({ avatarService }));
        const server = await listen(app);
        try {
            expect((await request(server)).status).toBe(401);
            const token = createJWT({ userId: 'principal-only', role: 'user' });
            const result = await request(server, { token, query: '?userId=attacker' });
            expect(result.status).toBe(200);
            expect(seen).toEqual(['principal-only']);
        } finally { await new Promise(resolve => server.close(resolve)); }
    });

    test('redacts unexpected service errors at the HTTP boundary', async () => {
        const avatarService = { getAvatar: async () => { throw Object.assign(new Error('sensitive'), { code: 'LEAKED_INTERNAL_DETAIL', statusCode: 418 }); } };
        const app = express();
        app.use('/api/dashboard', createDashboardRoutes({ avatarService }));
        const server = await listen(app);
        try {
            const result = await request(server, { token: createJWT({ userId: 'bound-user', role: 'user' }) });
            expect(result.status).toBe(502);
            expect(JSON.parse(result.body.toString())).toEqual({ code: 'AVATAR_UPSTREAM_FAILED' });
            expect(result.body.toString()).not.toMatch(/LEAKED|sensitive|bound-user/);
        } finally { await new Promise(resolve => server.close(resolve)); }
    });

    test('returns reviewed image bytes and hardened headers', async () => {
        const calls = [];
        const fetchImpl = jest.fn(async (url, options) => {
            calls.push({ url, options });
            if (calls.length === 1) return mockResponse({ json: { ok: true, result: { photos: [[{ file_id: 'small', width: 20, height: 20 }, { file_id: 'largest', width: 100, height: 100 }]] } } });
            if (calls.length === 2) return mockResponse({ json: { ok: true, result: { file_path: 'photos/avatar.jpg' } } });
            return mockResponse({ headers: { 'content-type': 'image/jpeg', 'content-length': '4' }, chunks: [[0xff, 0xd8], [0xff, 0xd9]] });
        });
        const service = createTelegramAvatarService({ token: TEST_TOKEN, fetchImpl, timeoutMs: 1000, maxBytes: 8 });
        const avatarService = { getAvatar: userId => service.getAvatar(userId) };
        const app = express();
        app.use('/api/dashboard', createDashboardRoutes({ avatarService }));
        const server = await listen(app);
        try {
            const result = await request(server, { token: createJWT({ userId: 'bound-user', role: 'user' }) });
            expect(result.status).toBe(200);
            expect(result.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
            expect(result.headers['content-type']).toMatch(/^image\/jpeg/);
            expect(result.headers['x-content-type-options']).toBe('nosniff');
            expect(result.headers['cache-control']).toBe('no-store');
            expect(calls).toHaveLength(3);
            expect(calls.every(call => call.options.redirect === 'error' && call.options.signal)).toBe(true);
            expect(calls[0].url).toContain('getUserProfilePhotos');
            expect(calls[0].url).toContain('user_id=bound-user');
            expect(calls[1].url).toContain('file_id=largest');
            expect(calls[2].url).toMatch(/^https:\/\/api\.telegram\.org\/file\/bot/);
        } finally { await new Promise(resolve => server.close(resolve)); }
    });

    test.each([
        ['missing token', { token: null }, 503, 'AVATAR_SERVICE_UNAVAILABLE'],
        ['no photo', { token: TEST_TOKEN, fetchImpl: async () => mockResponse({ json: { ok: true, result: { photos: [] } } }) }, 404, 'AVATAR_NOT_AVAILABLE'],
        ['Telegram non-2xx', { token: TEST_TOKEN, fetchImpl: async () => mockResponse({ status: 500, json: {} }) }, 502, 'AVATAR_UPSTREAM_FAILED'],
    ])('%s is typed and redacted', async (_name, options, expectedStatus, expectedCode) => {
        const service = createTelegramAvatarService(options);
        await expect(service.getAvatar('private-user')).rejects.toMatchObject({ statusCode: expectedStatus, code: expectedCode });
        try { await service.getAvatar('private-user'); } catch (error) {
            expect(JSON.stringify({ code: error.code, message: error.message })).not.toMatch(/private-user|test-telegram-token|api\.telegram\.org|file_id|file_path/i);
        }
    });

    test('rejects malformed metadata, unsupported MIME, declared and streamed oversize, and timeout', async () => {
        const scenarios = [
            [async () => mockResponse({ json: { ok: true, result: { photos: [[{ file_id: 'x' }]] } } }), 'AVATAR_UPSTREAM_MALFORMED'],
            [jest.fn()
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { photos: [[{ file_id: 'x', width: 1, height: 1 }]] } } }))
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { file_path: '../secret' } } })), 'AVATAR_UPSTREAM_MALFORMED'],
            [jest.fn()
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { photos: [[{ file_id: 'x', width: 1, height: 1 }]] } } }))
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { file_path: 'photos/x.svg' } } }))
                .mockResolvedValueOnce(mockResponse({ headers: { 'content-type': 'image/svg+xml' }, chunks: ['x'] })), 'AVATAR_UNSUPPORTED_MEDIA'],
            [jest.fn()
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { photos: [[{ file_id: 'x', width: 1, height: 1 }]] } } }))
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { file_path: 'photos/x.jpg' } } }))
                .mockResolvedValueOnce(mockResponse({ headers: { 'content-type': 'image/jpeg', 'content-length': '9' }, chunks: [] })), 'AVATAR_TOO_LARGE'],
            [jest.fn()
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { photos: [[{ file_id: 'x', width: 1, height: 1 }]] } } }))
                .mockResolvedValueOnce(mockResponse({ json: { ok: true, result: { file_path: 'photos/x.jpg' } } }))
                .mockResolvedValueOnce(mockResponse({ headers: { 'content-type': 'image/jpeg' }, chunks: [Buffer.from([0xff, 0xd8, 0xff, 1, 2]), Buffer.from([3, 4, 5, 6])] })), 'AVATAR_TOO_LARGE'],
            [async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('secret upstream timeout'), { name: 'AbortError' })))), 'AVATAR_UPSTREAM_TIMEOUT'],
        ];
        for (const [fetchImpl, code] of scenarios) {
            const service = createTelegramAvatarService({ token: TEST_TOKEN, fetchImpl, maxBytes: 8, timeoutMs: 5 });
            await expect(service.getAvatar('private-user')).rejects.toMatchObject({ code });
        }
    });

    test('frontend uses one authenticated first-party loader with deterministic fallback and lifecycle cleanup at every auth-user site', () => {
        const avatarPath = path.join(ROOT, 'dashboard/xBot/src/components/UserAvatar.jsx');
        const avatar = fs.readFileSync(avatarPath, 'utf8');
        expect(avatar).toMatch(/Authorization/);
        expect(avatar).toMatch(/\/user\/avatar/);
        expect(avatar).toMatch(/URL\.createObjectURL/);
        expect(avatar).toMatch(/URL\.revokeObjectURL/);
        expect(avatar).toMatch(/finally\(\(\) => \{\s*if \(entry\.refs === 0\) revokeEntry/);
        expect(avatar).toMatch(/onError/);
        expect(avatar).not.toMatch(/photo_url|[?&](?:token|userId)=/);
        const sites = [
            'components/layout/Header.jsx', 'components/layout/Sidebar.jsx',
            'pages/user/ChatPage.jsx', 'pages/user/CommunityPage.jsx', 'pages/user/ProfilePage.jsx'
        ];
        for (const relative of sites) {
            const source = fs.readFileSync(path.join(ROOT, 'dashboard/xBot/src', relative), 'utf8');
            expect(source).toMatch(/<UserAvatar\b/);
            expect(source).not.toMatch(/user\?\.photo_url|user\.photo_url/);
        }
        const store = fs.readFileSync(path.join(ROOT, 'dashboard/xBot/src/stores/authStore.js'), 'utf8');
        expect(store).toMatch(/xbot:auth-changed/);
    });
});
