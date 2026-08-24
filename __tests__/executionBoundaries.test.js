describe('execution-disabled boundaries', () => {
    const original = process.env.EXECUTION_DISABLED;

    beforeEach(() => {
        process.env.EXECUTION_DISABLED = 'true';
        jest.resetModules();
        jest.clearAllMocks();
    });

    afterAll(() => {
        if (original === undefined) delete process.env.EXECUTION_DISABLED;
        else process.env.EXECUTION_DISABLED = original;
    });

    test('OnchainOS paid/execution requests make zero fetch calls', async () => {
        jest.doMock('../src/utils/okxKeyManager', () => ({
            hasCredentials: () => true,
            getCredentials: () => ({ apiKey: 'x', secretKey: 'x', passphrase: 'x' }),
            getAllCredentials: () => [{ apiKey: 'x', secretKey: 'x', passphrase: 'x' }],
            markRateLimited: jest.fn(),
        }));
        const axios = require('axios');
        jest.spyOn(axios, 'request').mockResolvedValue({ data: {} });
        jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
        const onchainos = require('../src/services/onchainos');

        await expect(onchainos.getSwapTransaction({})).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        await expect(onchainos.getApproveTransaction('196', '0x1', '1')).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        await expect(onchainos.broadcastTransaction('0xsigned', '196', '0x1')).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        expect(axios.request).toHaveBeenCalledTimes(0);
        expect(axios.post).toHaveBeenCalledTimes(0);
    });

    test('OKX live trade functions make zero HTTP calls', async () => {
        const axios = require('axios');
        jest.spyOn(axios, 'request').mockResolvedValue({ data: {} });
        const okx = require('../src/services/okxCex');
        const creds = { apiKey: 'x', secretKey: 'x', passphrase: 'x' };
        for (const operation of [
            () => okx.placeOrder(creds, {}),
            () => okx.cancelOrder(creds, 'BTC-USDT', '1'),
            () => okx.createGridOrder(creds, {}),
            () => okx.stopGridOrder(creds, '1', 'BTC-USDT', 'grid'),
        ]) await expect(operation()).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        expect(axios.request).toHaveBeenCalledTimes(0);
    });

    test('x402 paid calls make zero HTTP calls', async () => {
        const axios = require('axios');
        jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
        const x402 = require('../src/services/x402PaymentService');
        for (const operation of [
            () => x402.createPaymentRequirement('premium_ai', 1),
            () => x402.verifyPayment('0xtx', {}),
            () => x402.settlePayment('0xtx', '196'),
        ]) await expect(operation()).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        expect(axios.post).toHaveBeenCalledTimes(0);
    });

    test('autonomous scheduler start functions schedule zero timers', () => {
        const interval = jest.spyOn(global, 'setInterval');
        const timeout = jest.spyOn(global, 'setTimeout');
        const swapPollers = require('../src/features/ai/onchain/swapPollers');
        const reports = require('../src/features/scheduledReportsRunner');

        expect(swapPollers.startSwapPollers()).toBe(false);
        expect(reports.startReportsRunner()).toBe(false);
        expect(interval).toHaveBeenCalledTimes(0);
        expect(timeout).toHaveBeenCalledTimes(0);
        interval.mockRestore(); timeout.mockRestore();
    });

    test('check-in scheduler makes zero DB, announcement, and timer calls', async () => {
        const interval = jest.spyOn(global, 'setInterval');
        const db = { listCheckinGroups: jest.fn() };
        const sendCheckinAnnouncement = jest.fn();
        const createCheckinScheduler = require('../src/features/checkin/scheduler');
        const scheduler = createCheckinScheduler({
            db,
            getScheduleSlots: jest.fn(),
            getSummaryScheduleSlots: jest.fn(),
            sendCheckinAnnouncement,
            sendSummaryAnnouncement: jest.fn(),
            calculateInclusiveDayDiff: jest.fn(),
            formatDateForTimezone: jest.fn(),
            formatTimeForTimezone: jest.fn(),
            CHECKIN_SCHEDULER_INTERVAL: 1000,
            CHECKIN_DEFAULT_TIMEZONE: 'UTC',
        });

        expect(scheduler.startCheckinScheduler()).toBe(false);
        await expect(scheduler.runCheckinSchedulerTick()).rejects.toMatchObject({ code: 'EXECUTION_DISABLED' });
        expect(db.listCheckinGroups).toHaveBeenCalledTimes(0);
        expect(sendCheckinAnnouncement).toHaveBeenCalledTimes(0);
        expect(interval).toHaveBeenCalledTimes(0);
        interval.mockRestore();
    });

    test('safe capabilities preserve ingress/API/dashboard while disabling execution', () => {
        const { getRuntimeCapabilities } = require('../src/core/executionPolicy');
        expect(getRuntimeCapabilities()).toEqual({
            telegramIngress: true,
            api: true,
            staticDashboard: true,
            execution: false,
            autonomousActions: false,
        });
    });
});
