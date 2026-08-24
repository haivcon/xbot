describe('execution-disabled runtime policy', () => {
    const original = process.env.EXECUTION_DISABLED;

    afterEach(() => {
        if (original === undefined) delete process.env.EXECUTION_DISABLED;
        else process.env.EXECUTION_DISABLED = original;
        jest.resetModules();
    });

    test.each([
        [undefined, true],
        ['', true],
        ['true', true],
        ['TRUE', true],
        ['false', false],
        ['FALSE', false],
        ['0', true],
        ['yes', true],
        ['garbage', true],
    ])('EXECUTION_DISABLED=%p yields disabled=%p', (value, expected) => {
        if (value === undefined) delete process.env.EXECUTION_DISABLED;
        else process.env.EXECUTION_DISABLED = value;
        const policy = require('../src/core/executionPolicy');
        expect(policy.isExecutionDisabled()).toBe(expected);
    });

    test('assertExecutionEnabled throws a stable non-secret error while disabled', () => {
        process.env.EXECUTION_DISABLED = 'true';
        const { assertExecutionEnabled, EXECUTION_DISABLED_CODE, EXECUTION_DISABLED_MESSAGE } = require('../src/core/executionPolicy');
        expect(assertExecutionEnabled).toThrow(EXECUTION_DISABLED_MESSAGE);
        try { assertExecutionEnabled(); } catch (error) {
            expect(error.code).toBe(EXECUTION_DISABLED_CODE);
            expect(error.status).toBe(503);
            expect(error.message).not.toMatch(/key|token|secret|wallet/i);
        }
    });

    test('guarded async operation makes zero side-effect calls while disabled', async () => {
        process.env.EXECUTION_DISABLED = 'true';
        const { guardExecution } = require('../src/core/executionPolicy');
        const sideEffect = jest.fn(async () => 'sent');
        const guarded = guardExecution(sideEffect);
        await expect(guarded()).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        expect(sideEffect).toHaveBeenCalledTimes(0);
    });

    test('guarded async operation runs only when explicitly enabled', async () => {
        process.env.EXECUTION_DISABLED = 'false';
        const { guardExecution } = require('../src/core/executionPolicy');
        const sideEffect = jest.fn(async () => 'sent');
        await expect(guardExecution(sideEffect)()).resolves.toBe('sent');
        expect(sideEffect).toHaveBeenCalledTimes(1);
    });
});
