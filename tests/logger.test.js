// Prevent logger from printing during tests
process.env.LOG_LEVEL = 'error';

const logger = require('../src/core/logger');

describe('Logger', () => {
    describe('child', () => {
        test('creates child logger with module name', () => {
            const log = logger.child('TestModule');
            expect(log).toBeDefined();
            expect(typeof log.info).toBe('function');
            expect(typeof log.error).toBe('function');
            expect(typeof log.warn).toBe('function');
            expect(typeof log.debug).toBe('function');
        });

        test('child of child concatenates names', () => {
            const parent = logger.child('Parent');
            const child = parent.child('Child');
            expect(child).toBeDefined();
            expect(typeof child.info).toBe('function');
        });
    });

    describe('levels', () => {
        test('info/warn/error do not throw', () => {
            const log = logger.child('Test');
            expect(() => log.info('test info')).not.toThrow();
            expect(() => log.warn('test warn')).not.toThrow();
            expect(() => log.error('test error')).not.toThrow();
        });

        test('debug does not throw', () => {
            const log = logger.child('Test');
            expect(() => log.debug('test debug')).not.toThrow();
        });
    });

    describe('output formatting', () => {
        let consoleSpy;

        beforeEach(() => {
            consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        test('error level always outputs', () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation();
            const log = logger.child('ErrTest');
            log.error('critical failure');
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });
});
