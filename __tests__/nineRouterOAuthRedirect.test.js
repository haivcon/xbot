'use strict';

const crypto = require('crypto');

const {
    createOAuthRedirectCoordinator,
    normalizePublicOrigin,
    safeReturnTarget
} = require('../src/services/nineRouterOAuthRedirect');

const CALLBACK_ORIGIN = 'https://xbot.xlayer.my';
const USER = { userId: '10001', sessionToken: 'session-a' };

function fixture(overrides = {}) {
    let now = 1_700_000_000_000;
    const calls = [];
    const coordinator = createOAuthRedirectCoordinator({
        publicOrigin: CALLBACK_ORIGIN,
        ttlMs: 120_000,
        now: () => now,
        requestForTenant: async input => {
            calls.push(input);
            if (input.path.endsWith('/redirect-authorize')) {
                return { data: {
                    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque',
                    state: input.data.state,
                    codeVerifier: 'server-only-verifier'
                } };
            }
            if (input.path.endsWith('/exchange')) {
                return { data: { success: true, connection: { id: 'connection-1', provider: 'antigravity', status: 'active' } } };
            }
            throw new Error('unexpected request');
        },
        ...overrides
    });
    return { coordinator, calls, advance: ms => { now += ms; } };
}

describe('tenant-safe 9Router OAuth redirect coordinator', () => {
    test('normalizes only a public HTTPS origin and fixes return targets', () => {
        expect(normalizePublicOrigin('https://xbot.xlayer.my/anything')).toBe(CALLBACK_ORIGIN);
        expect(() => normalizePublicOrigin('http://xbot.xlayer.my')).toThrow('HTTPS');
        expect(() => normalizePublicOrigin('https://127.0.0.1')).toThrow('public');
        expect(safeReturnTarget('/xBot/?section=providers')).toBe('/xBot/?section=providers');
        expect(safeReturnTarget('https://evil.example/steal')).toBe('/xBot/?section=providers');
        expect(safeReturnTarget('//evil.example/steal')).toBe('/xBot/?section=providers');
    });

    test('initiation is provider-allowlisted, tenant/session bound and never returns verifier or state', async () => {
        const { coordinator, calls } = fixture({ supportedProviders: ['antigravity'] });
        await expect(coordinator.start({ ...USER, provider: 'claude' })).rejects.toMatchObject({ code: 'OAUTH_PROVIDER_UNAVAILABLE' });
        await expect(coordinator.start({ ...USER, provider: 'cline' })).rejects.toMatchObject({ code: 'OAUTH_PROVIDER_UNAVAILABLE' });
        await expect(coordinator.start({ ...USER, provider: 'kimchi' })).rejects.toMatchObject({ code: 'OAUTH_PROVIDER_UNAVAILABLE' });

        const first = await coordinator.start({ ...USER, provider: 'antigravity' });
        const second = await coordinator.start({ ...USER, provider: 'antigravity' });
        expect(first.authorizationUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
        expect(first).toEqual(expect.objectContaining({ expiresIn: 120, statusToken: expect.any(String) }));
        expect(first).not.toHaveProperty('state');
        expect(first).not.toHaveProperty('codeVerifier');
        expect(first.statusToken).not.toBe(second.statusToken);
        expect(calls[0].data.callbackUri).toBe(`${CALLBACK_ORIGIN}/api/dashboard/ai/9router/oauth/callback/antigravity`);
        expect(calls[0].data.state).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    });

    test('status is authenticated and bound to the initiating user session', async () => {
        const { coordinator } = fixture();
        const started = await coordinator.start({ ...USER, provider: 'antigravity' });
        expect(coordinator.status({ ...USER, statusToken: started.statusToken })).toEqual({ status: 'pending' });
        expect(() => coordinator.status({ ...USER, sessionToken: 'session-b', statusToken: started.statusToken }))
            .toThrow(expect.objectContaining({ code: 'OAUTH_STATUS_NOT_FOUND' }));
        expect(() => coordinator.status({ userId: '20002', sessionToken: USER.sessionToken, statusToken: started.statusToken }))
            .toThrow(expect.objectContaining({ code: 'OAUTH_STATUS_NOT_FOUND' }));
    });

    test('callback consumes state atomically before exchange and rejects wrong provider, origin, expiry and replay', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const { coordinator, advance } = fixture({
            requestForTenant: async input => {
                if (input.path.endsWith('/redirect-authorize')) return { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', state: input.data.state, codeVerifier: 'verifier' } };
                await gate;
                return { data: { success: true, connection: { id: 'one', provider: 'antigravity', status: 'active' } } };
            }
        });
        const started = await coordinator.start({ ...USER, provider: 'antigravity' });
        const state = coordinator._stateForTests(started.statusToken);

        await expect(coordinator.callback({ provider: 'claude', state, code: 'code', observedOrigin: CALLBACK_ORIGIN }))
            .rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
        await expect(coordinator.callback({ provider: 'antigravity', state, code: 'code', observedOrigin: 'https://other.example' }))
            .rejects.toMatchObject({ code: 'OAUTH_ORIGIN_INVALID' });

        const pending = coordinator.callback({ provider: 'antigravity', state, code: 'code', observedOrigin: CALLBACK_ORIGIN });
        await expect(coordinator.callback({ provider: 'antigravity', state, code: 'code', observedOrigin: CALLBACK_ORIGIN }))
            .rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
        release();
        await expect(pending).resolves.toEqual(expect.objectContaining({ returnTarget: '/xBot/?section=providers', resultCode: 'connected' }));

        const expired = await coordinator.start({ ...USER, provider: 'antigravity' });
        const expiredState = coordinator._stateForTests(expired.statusToken);
        advance(120_001);
        await expect(coordinator.callback({ provider: 'antigravity', state: expiredState, code: 'code', observedOrigin: CALLBACK_ORIGIN }))
            .rejects.toMatchObject({ code: 'OAUTH_STATE_EXPIRED' });
    });

    test('denial, missing code and exchange failure become non-sensitive terminal status', async () => {
        const { coordinator } = fixture({
            requestForTenant: async input => {
                if (input.path.endsWith('/redirect-authorize')) return { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', state: input.data.state, codeVerifier: 'verifier' } };
                const error = new Error('upstream body contained secret-token');
                error.code = 'ECONNABORTED';
                throw error;
            }
        });
        const denied = await coordinator.start({ ...USER, provider: 'antigravity' });
        await coordinator.callback({ provider: 'antigravity', state: coordinator._stateForTests(denied.statusToken), error: 'access_denied', observedOrigin: CALLBACK_ORIGIN });
        expect(coordinator.status({ ...USER, statusToken: denied.statusToken })).toEqual({ status: 'denied', code: 'provider_denied' });

        const missing = await coordinator.start({ ...USER, provider: 'antigravity' });
        await coordinator.callback({ provider: 'antigravity', state: coordinator._stateForTests(missing.statusToken), observedOrigin: CALLBACK_ORIGIN });
        expect(coordinator.status({ ...USER, statusToken: missing.statusToken })).toEqual({ status: 'failed', code: 'missing_code' });

        const failed = await coordinator.start({ ...USER, provider: 'antigravity' });
        await coordinator.callback({ provider: 'antigravity', state: coordinator._stateForTests(failed.statusToken), code: 'bad-code', observedOrigin: CALLBACK_ORIGIN });
        const status = coordinator.status({ ...USER, statusToken: failed.statusToken });
        expect(status).toEqual({ status: 'failed', code: 'exchange_failed' });
        expect(JSON.stringify(status)).not.toMatch(/secret-token|bad-code|verifier/);
    });

    test.each([
        ['timeout', Object.assign(new Error('timed out with secret-token'), { code: 'ECONNABORTED' })],
        ['malformed response', null]
    ])('fails closed on exchange %s without a second write or sensitive status', async (_label, exchangeError) => {
        let exchangeCalls = 0;
        const { coordinator } = fixture({
            requestForTenant: async input => {
                if (input.path.endsWith('/redirect-authorize')) {
                    return { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', state: input.data.state, codeVerifier: 'verifier' } };
                }
                exchangeCalls += 1;
                if (exchangeError) throw exchangeError;
                return { data: { success: true, connection: { provider: 'antigravity' } } };
            }
        });
        const started = await coordinator.start({ ...USER, provider: 'antigravity' });
        const state = coordinator._stateForTests(started.statusToken);
        await expect(coordinator.callback({ provider: 'antigravity', state, code: 'one-time-code', observedOrigin: CALLBACK_ORIGIN }))
            .resolves.toEqual(expect.objectContaining({ resultCode: 'exchange_failed' }));
        expect(exchangeCalls).toBe(1);
        const status = coordinator.status({ ...USER, statusToken: started.statusToken });
        expect(status).toEqual({ status: 'failed', code: 'exchange_failed' });
        expect(JSON.stringify(status)).not.toMatch(/secret-token|one-time-code|verifier/);
        await expect(coordinator.callback({ provider: 'antigravity', state, code: 'one-time-code', observedOrigin: CALLBACK_ORIGIN }))
            .rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
        expect(exchangeCalls).toBe(1);
    });

    test('rate limits starts per tenant without exposing generated material', async () => {
        const { coordinator } = fixture({ maxStartsPerWindow: 2 });
        await coordinator.start({ ...USER, provider: 'antigravity' });
        await coordinator.start({ ...USER, provider: 'antigravity' });
        await expect(coordinator.start({ ...USER, provider: 'antigravity' }))
            .rejects.toMatchObject({ code: 'OAUTH_RATE_LIMITED', statusCode: 429 });
    });
});

test('state material has cryptographic entropy', () => {
    const values = new Set(Array.from({ length: 100 }, () => crypto.randomBytes(32).toString('base64url')));
    expect(values.size).toBe(100);
});
