const { createCallbackRouter } = require('../src/bot/handlers/callbackRouter');

describe('CallbackRouter', () => {
    let router;

    beforeEach(() => {
        router = createCallbackRouter();
    });

    describe('exact match', () => {
        test('matches exact route', () => {
            const handler = jest.fn();
            router.on('ui_close', handler);
            const result = router.match('ui_close');
            expect(result).not.toBeNull();
            expect(result.handler).toBe(handler);
            expect(result.params).toBe('ui_close');
        });

        test('returns null for unregistered route', () => {
            expect(router.match('unknown')).toBeNull();
        });

        test('returns null for null/undefined', () => {
            expect(router.match(null)).toBeNull();
            expect(router.match(undefined)).toBeNull();
            expect(router.match('')).toBeNull();
        });
    });

    describe('prefix match', () => {
        test('matches prefix and extracts params', () => {
            const handler = jest.fn();
            router.onPrefix('checkin_admin_', handler);
            const result = router.match('checkin_admin_settings|123');
            expect(result).not.toBeNull();
            expect(result.handler).toBe(handler);
            expect(result.params).toBe('settings|123');
        });

        test('longest prefix wins', () => {
            const shortHandler = jest.fn();
            const longHandler = jest.fn();
            router.onPrefix('admin_', shortHandler);
            router.onPrefix('admin_hub_', longHandler);
            const result = router.match('admin_hub_open|123');
            expect(result.handler).toBe(longHandler);
            expect(result.params).toBe('open|123');
        });

        test('short prefix matches when long does not', () => {
            const shortHandler = jest.fn();
            const longHandler = jest.fn();
            router.onPrefix('admin_', shortHandler);
            router.onPrefix('admin_hub_', longHandler);
            const result = router.match('admin_settings|456');
            expect(result.handler).toBe(shortHandler);
            expect(result.params).toBe('settings|456');
        });
    });

    describe('priority: exact > prefix', () => {
        test('exact match takes priority over prefix', () => {
            const exactHandler = jest.fn();
            const prefixHandler = jest.fn();
            router.on('help_close', exactHandler);
            router.onPrefix('help_', prefixHandler);
            const result = router.match('help_close');
            expect(result.handler).toBe(exactHandler);
        });
    });

    describe('stats', () => {
        test('reports correct counts', () => {
            router.on('a', jest.fn());
            router.on('b', jest.fn());
            router.onPrefix('c_', jest.fn());
            expect(router.stats()).toEqual({ exact: 2, prefix: 1, total: 3 });
        });

        test('starts at 0', () => {
            expect(router.stats()).toEqual({ exact: 0, prefix: 0, total: 0 });
        });
    });
});
