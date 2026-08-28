'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const SHA = '0123456789abcdef0123456789abcdef01234567';
const BUILT_AT = '2026-08-28T12:34:56.000Z';
const UNKNOWN_RELEASE = {
    gitSha: 'unknown', shortSha: 'unknown', builtAt: 'unknown', manifestVersion: 'unknown'
};

function healthyState(overrides = {}) {
    return {
        httpServer: true,
        database: true,
        telegramIngress: true,
        staticDashboard: true,
        priceAlertSchedulerEnabled: false,
        priceAlertSchedulerRunning: false,
        nineRouter: 'degraded',
        release: UNKNOWN_RELEASE,
        manifestRequired: false,
        ...overrides
    };
}

function mockResponse() {
    const response = { statusCode: 200, body: null };
    response.status = jest.fn(code => { response.statusCode = code; return response; });
    response.json = jest.fn(body => { response.body = body; return response; });
    return response;
}

describe('truthful readiness and health contracts', () => {
    test('healthy required state is ready with typed non-secret structure', () => {
        const { evaluateReadiness } = require('../src/core/readiness');
        expect(evaluateReadiness(healthyState())).toEqual({
            status: 'ready',
            required: {
                database: 'ok', telegramIngress: 'ok', httpServer: 'ok', staticDashboard: 'ok'
            },
            optional: { priceAlerts: 'disabled', nineRouter: 'degraded' },
            reasons: [],
            release: UNKNOWN_RELEASE
        });
    });

    test.each([
        ['database', undefined, 'database_unknown'],
        ['database', false, 'database_error'],
        ['telegramIngress', undefined, 'telegram_ingress_unknown'],
        ['telegramIngress', false, 'telegram_ingress_error'],
        ['httpServer', undefined, 'http_server_unknown'],
        ['httpServer', false, 'http_server_error'],
        ['staticDashboard', undefined, 'static_dashboard_unknown'],
        ['staticDashboard', false, 'static_dashboard_error']
    ])('%s=%s returns not_ready with allowlisted reason', (component, value, reason) => {
        const { evaluateReadiness } = require('../src/core/readiness');
        const result = evaluateReadiness(healthyState({ [component]: value }));
        expect(result.status).toBe('not_ready');
        expect(result.reasons).toEqual([reason]);
        expect(JSON.stringify(result)).not.toMatch(/secret|token|password|C:\\|\/home\/|https?:\/\//i);
    });

    test('reasons use deterministic component order', () => {
        const { evaluateReadiness } = require('../src/core/readiness');
        expect(evaluateReadiness(healthyState({
            httpServer: false, database: undefined, telegramIngress: false, staticDashboard: undefined
        })).reasons).toEqual([
            'database_unknown', 'telegram_ingress_error', 'http_server_error', 'static_dashboard_unknown'
        ]);
    });

    test('optional 9Router degradation does not fail readiness', () => {
        const { evaluateReadiness } = require('../src/core/readiness');
        expect(evaluateReadiness(healthyState({ nineRouter: 'degraded' }))).toMatchObject({
            status: 'ready', optional: { nineRouter: 'degraded' }, reasons: []
        });
    });

    test.each([
        [{ priceAlertSchedulerEnabled: false, priceAlertSchedulerRunning: false }, 'ready', 'disabled', []],
        [{ priceAlertSchedulerEnabled: true, priceAlertSchedulerRunning: false }, 'not_ready', 'error', ['price_alert_scheduler_not_running']],
        [{ priceAlertSchedulerEnabled: true, priceAlertSchedulerRunning: true }, 'ready', 'running', []]
    ])('price scheduler rule %#', (scheduler, status, priceAlerts, reasons) => {
        const { evaluateReadiness } = require('../src/core/readiness');
        expect(evaluateReadiness(healthyState(scheduler))).toMatchObject({ status, optional: { priceAlerts }, reasons });
    });

    test('production wrapper requires a manifest while preserving safe execution flags', () => {
        const source = fs.readFileSync(path.join(__dirname, '../safe-wrapper.js'), 'utf8');
        expect(source).toContain("process.env.EXECUTION_DISABLED = 'true';");
        expect(source).toContain("process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';");
        expect(source).toContain("process.env.JOB_QUEUE_CONCURRENCY = '1';");
        expect(source).toContain("process.env.RELEASE_MANIFEST_REQUIRED = 'true';");
        expect(source).toContain("require('./index.js');");
    });

    test('required manifest fails closed until a valid manifest summary is available', () => {
        const { evaluateReadiness } = require('../src/core/readiness');
        const { summarizeManifest } = require('../src/core/releaseManifest');
        expect(evaluateReadiness(healthyState()).status).toBe('ready');
        const unavailable = evaluateReadiness(healthyState({ manifestRequired: true }));
        expect(unavailable).toMatchObject({
            status: 'not_ready', reasons: ['release_manifest_unavailable']
        });
        const release = summarizeManifest({ manifestVersion: 1, gitSha: SHA, builtAt: BUILT_AT });
        expect(evaluateReadiness(healthyState({ manifestRequired: true, release }))).toMatchObject({
            status: 'ready', reasons: [], release
        });
        expect(JSON.stringify(unavailable)).not.toMatch(/C:\\|\/home\/|https?:\/\/|error|path/i);
    });

    test('runtime transitions before init, after startup, and shutdown', () => {
        const { createReadinessRuntime } = require('../src/core/readiness');
        const runtime = createReadinessRuntime({ release: UNKNOWN_RELEASE });
        expect(runtime.evaluate().status).toBe('not_ready');
        runtime.markDatabaseReady();
        runtime.markTelegramIngressReady();
        runtime.markStaticDashboardReady();
        runtime.markHttpServerReady();
        expect(runtime.evaluate().status).toBe('ready');
        runtime.markShuttingDown();
        expect(runtime.evaluate()).toMatchObject({ status: 'not_ready', reasons: ['http_server_error'] });
    });

    test('HTTP handlers return health 200 and readiness 200/503 without raw diagnostics', () => {
        const { createControlHandlers } = require('../src/core/readiness');
        const runtime = {
            evaluate: jest.fn()
                .mockReturnValueOnce({ ...healthyState(), status: 'not_ready', reasons: ['database_unknown'] })
                .mockReturnValueOnce({ ...healthyState(), status: 'ready', reasons: [] }),
            getRelease: () => ({ gitSha: SHA, shortSha: SHA.slice(0, 7), builtAt: BUILT_AT, manifestVersion: 1 })
        };
        const scheduler = () => ({ priceAlertSchedulerEnabled: true, priceAlertSchedulerRunning: true });
        const { health, ready } = createControlHandlers({ runtime, getSchedulerStatus: scheduler });
        const first = mockResponse();
        ready({}, first);
        expect(first.status).toHaveBeenCalledWith(503);
        const second = mockResponse();
        ready({}, second);
        expect(second.status).toHaveBeenCalledWith(200);
        const healthResponse = mockResponse();
        health({}, healthResponse);
        expect(healthResponse.statusCode).toBe(200);
        expect(healthResponse.body).toEqual({
            status: 'ok',
            priceAlertSchedulerEnabled: true,
            priceAlertSchedulerRunning: true,
            release: { gitSha: SHA, shortSha: SHA.slice(0, 7), builtAt: BUILT_AT, manifestVersion: 1 }
        });
    });
});

describe('deterministic non-secret release manifest', () => {
    test('same inputs produce exact sorted schema and sorted allowlisted hashes', () => {
        const { buildReleaseManifest, stableStringify } = require('../scripts/generate-release-manifest');
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbot-manifest-'));
        fs.writeFileSync(path.join(rootDir, 'safe-wrapper.js'), 'safe');
        fs.writeFileSync(path.join(rootDir, 'package-lock.json'), '{}');
        fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
        const input = { rootDir, gitSha: SHA, builtAt: BUILT_AT, nodeVersion: 'v22.18.0', packageVersion: '1.2.3' };
        const first = buildReleaseManifest(input);
        const second = buildReleaseManifest(input);
        expect(stableStringify(first)).toBe(stableStringify(second));
        expect(first).toEqual({
            manifestVersion: 1,
            gitSha: SHA,
            builtAt: BUILT_AT,
            nodeVersion: 'v22.18.0',
            packageVersion: '1.2.3',
            hashes: {
                'package-lock.json': expect.stringMatching(/^[a-f0-9]{64}$/),
                'safe-wrapper.js': expect.stringMatching(/^[a-f0-9]{64}$/)
            }
        });
        expect(Object.keys(JSON.parse(stableStringify(first)))).toEqual([
            'builtAt', 'gitSha', 'hashes', 'manifestVersion', 'nodeVersion', 'packageVersion'
        ]);
        expect(Object.keys(JSON.parse(stableStringify(first)).hashes)).toEqual([
            'package-lock.json', 'safe-wrapper.js'
        ]);
    });

    test.each([
        [{ gitSha: 'short', builtAt: BUILT_AT }, /git sha/i],
        [{ gitSha: SHA, builtAt: 'yesterday' }, /builtAt/i],
        [{ gitSha: SHA }, /builtAt/i]
    ])('invalid required manifest input rejects %#', (input, message) => {
        const { buildReleaseManifest } = require('../scripts/generate-release-manifest');
        expect(() => buildReleaseManifest({ rootDir: process.cwd(), nodeVersion: 'v22.0.0', packageVersion: '1.0.0', ...input }))
            .toThrow(message);
    });

    test('manifest contains no prohibited keys recursively', () => {
        const source = fs.readFileSync(path.join(__dirname, '../scripts/generate-release-manifest.js'), 'utf8');
        expect(source).not.toMatch(/process\.env|execSync|git rev-parse|hostname|username|token|credential/i);
    });

    test('runtime loader safely returns unknown for missing or malformed manifests', () => {
        const { loadReleaseManifest } = require('../src/core/releaseManifest');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbot-release-'));
        expect(loadReleaseManifest(path.join(dir, 'missing.json'))).toEqual(UNKNOWN_RELEASE);
        const malformed = path.join(dir, 'release-manifest.json');
        fs.writeFileSync(malformed, '{bad');
        expect(loadReleaseManifest(malformed)).toEqual(UNKNOWN_RELEASE);
    });

    test('startup records database ready only after a successful SQLite quick_check', () => {
        const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
        const init = source.indexOf('await db.init()');
        const quickCheck = source.indexOf("await db.dbGet('PRAGMA quick_check')", init);
        const ready = source.indexOf('readinessRuntime.markDatabaseReady()', init);
        expect(quickCheck).toBeGreaterThan(init);
        expect(ready).toBeGreaterThan(quickCheck);
    });
});

describe('GitHub Actions CI contract', () => {
    test('workflow is structurally bounded and runs canonical gates once', () => {
        const workflowPath = path.join(__dirname, '../.github/workflows/ci.yml');
        const source = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(source);
        const trigger = workflow.on || workflow.true;
        expect(trigger).toHaveProperty('pull_request');
        expect(trigger.push.branches).toContain('main');
        expect(workflow.permissions).toEqual({ contents: 'read' });
        expect(workflow.concurrency['cancel-in-progress']).toBe(true);
        const steps = Object.values(workflow.jobs).flatMap(job => job.steps || []);
        const runs = steps.map(step => step.run).filter(Boolean).join('\n');
        expect(steps.some(step => /^actions\/checkout@(v\d+|[a-f0-9]{40})$/.test(step.uses))).toBe(true);
        expect(steps.some(step => /^actions\/setup-node@(v\d+|[a-f0-9]{40})$/.test(step.uses))).toBe(true);
        expect(runs.match(/^npm ci$/gm)).toHaveLength(1);
        expect(runs.match(/npm test -- --runInBand --no-coverage/g)).toHaveLength(1);
        expect(runs.match(/npm --prefix dashboard run build/g)).toHaveLength(1);
        expect(runs).toMatch(/release:manifest/);
        expect(runs).toMatch(/syntax|validate/i);
        expect(source).not.toMatch(/deploy|ssh|telegram|ROUTER_SECRET|TELEGRAM_TOKEN|secrets\./i);
    });
});
