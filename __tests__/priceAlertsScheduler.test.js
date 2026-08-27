'use strict';

const createPriceAlerts = require('../src/features/priceAlerts');

function makeDeps(overrides = {}) {
    const bot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
        sendPhoto: jest.fn().mockResolvedValue({ message_id: 2 }),
        sendVideo: jest.fn().mockResolvedValue({ message_id: 3 }),
        answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    };
    return {
        t: (_lang, key, vars = {}) => `${key}${vars.topic ? `:${vars.topic}` : ''}`,
        defaultLang: 'en',
        getLang: jest.fn().mockResolvedValue('en'),
        escapeHtml: value => String(value),
        bot,
        delay: jest.fn().mockResolvedValue(undefined),
        shortenAddress: value => value,
        sendReply: jest.fn().mockResolvedValue(undefined),
        sendMessageRespectingThread: jest.fn().mockResolvedValue(undefined),
        buildCloseKeyboard: jest.fn(() => ({})),
        buildPaginatedChainKeyboard: jest.fn(),
        sortChainsWithPriority: value => value,
        getChainIcon: jest.fn(() => ''),
        collectTxhashChainEntries: jest.fn().mockResolvedValue([]),
        resolveGroupLanguage: jest.fn().mockResolvedValue('en'),
        resolveTopicLanguage: jest.fn().mockResolvedValue('en'),
        resolveNotificationLanguage: jest.fn().mockResolvedValue('en'),
        isGroupAdmin: jest.fn().mockResolvedValue(true),
        openAdminHub: jest.fn().mockResolvedValue(undefined),
        adminHubSessions: new Map(),
        formatMarkdownTableBlock: lines => lines.join('\n'),
        HELP_TABLE_LAYOUT: {},
        listPriceAlertTokens: jest.fn().mockResolvedValue([]),
        getPriceAlertToken: jest.fn(),
        upsertPriceAlertToken: jest.fn(),
        updatePriceAlertToken: jest.fn(),
        deletePriceAlertToken: jest.fn(),
        listDuePriceAlertTokens: jest.fn().mockResolvedValue([]),
        recordPriceAlertRun: jest.fn().mockResolvedValue(undefined),
        addFeatureTopic: jest.fn().mockResolvedValue(undefined),
        listFeatureTopics: jest.fn().mockResolvedValue([]),
        removeFeatureTopic: jest.fn(),
        listPriceAlertTokenTopics: jest.fn().mockResolvedValue([]),
        setPriceAlertTokenTopic: jest.fn(),
        setPriceAlertTarget: jest.fn().mockResolvedValue(undefined),
        getPriceAlertTarget: jest.fn().mockResolvedValue(null),
        fetchTokenPriceOverview: jest.fn().mockResolvedValue({ priceUsd: 1, fetchedAt: 1 }),
        addPriceAlertMedia: jest.fn(),
        listPriceAlertMedia: jest.fn().mockResolvedValue([]),
        deletePriceAlertMedia: jest.fn(),
        deleteAllPriceAlertMedia: jest.fn(),
        countPriceAlertMedia: jest.fn().mockResolvedValue(0),
        addPriceAlertTitle: jest.fn(),
        listPriceAlertTitles: jest.fn().mockResolvedValue([]),
        deletePriceAlertTitle: jest.fn(),
        deleteAllPriceAlertTitles: jest.fn(),
        countPriceAlertTitles: jest.fn().mockResolvedValue(0),
        PRICE_ALERT_DEFAULT_INTERVAL: 60,
        PRICE_ALERT_POLL_INTERVAL_MS: 1000,
        PRICE_ALERT_MAX_PER_TICK: 10,
        PRICE_ALERT_RATE_LIMIT_MS: 0,
        PRICE_ALERT_RETRY_COOLDOWN_MS: 30000,
        ...overrides,
    };
}

const token = { id: 7, chatId: '-1001', tokenAddress: '0xabc', intervalSeconds: 60, enabled: 1 };

describe('dedicated price alert scheduler', () => {
    const originalFlag = process.env.PRICE_ALERT_SCHEDULER_ENABLED;
    const originalExecution = process.env.EXECUTION_DISABLED;

    afterEach(() => {
        if (originalFlag === undefined) delete process.env.PRICE_ALERT_SCHEDULER_ENABLED;
        else process.env.PRICE_ALERT_SCHEDULER_ENABLED = originalFlag;
        if (originalExecution === undefined) delete process.env.EXECUTION_DISABLED;
        else process.env.EXECUTION_DISABLED = originalExecution;
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    test.each([[undefined, false], ['', false], ['true', true], [' TRUE ', true], ['false', false], ['1', false], ['yes', false]])(
        'PRICE_ALERT_SCHEDULER_ENABLED=%p yields enabled=%p', (value, expected) => {
            if (value === undefined) delete process.env.PRICE_ALERT_SCHEDULER_ENABLED;
            else process.env.PRICE_ALERT_SCHEDULER_ENABLED = value;
            process.env.EXECUTION_DISABLED = 'true';
            const policy = require('../src/core/executionPolicy');
            expect(policy.isPriceAlertSchedulerEnabled()).toBe(expected);
            expect(policy.isExecutionDisabled()).toBe(true);
            expect(policy.getRuntimeCapabilities()).toMatchObject({ execution: false, autonomousActions: false });
        });

    test('starts immediately with dedicated flag despite global execution disable and reports running', async () => {
        jest.useFakeTimers();
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';
        process.env.EXECUTION_DISABLED = 'true';
        const deps = makeDeps();
        const alerts = createPriceAlerts(deps);
        expect(alerts.startPriceAlertScheduler()).toBe(true);
        await Promise.resolve();
        expect(deps.listDuePriceAlertTokens).toHaveBeenCalledTimes(1);
        expect(alerts.getPriceAlertSchedulerStatus()).toEqual({ priceAlertSchedulerEnabled: true, priceAlertSchedulerRunning: true });
    });

    test('disabled startup creates no timer and tick recheck blocks DB and network', async () => {
        const interval = jest.spyOn(global, 'setInterval');
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'false';
        const deps = makeDeps();
        const alerts = createPriceAlerts(deps);
        expect(alerts.startPriceAlertScheduler()).toBe(false);
        await alerts.runPriceSchedulerTick();
        expect(interval).not.toHaveBeenCalled();
        expect(deps.listDuePriceAlertTokens).not.toHaveBeenCalled();
        expect(deps.fetchTokenPriceOverview).not.toHaveBeenCalled();
    });

    test('per-tick recheck stops DB/network after runtime flag changes', async () => {
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';
        const deps = makeDeps({ listDuePriceAlertTokens: jest.fn().mockResolvedValue([token]) });
        const alerts = createPriceAlerts(deps);
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'false';
        await alerts.runPriceSchedulerTick();
        expect(deps.listDuePriceAlertTokens).not.toHaveBeenCalled();
        expect(deps.fetchTokenPriceOverview).not.toHaveBeenCalled();
    });

    test('/pricev persists current topic and acknowledgement states binding is not token activation', async () => {
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'false';
        const deps = makeDeps();
        const alerts = createPriceAlerts(deps);
        const msg = { chat: { id: -1001, type: 'supergroup' }, from: { id: 9 }, message_thread_id: 42 };
        await alerts.handlePriceTargetCommand(msg);
        expect(deps.addFeatureTopic).toHaveBeenCalledWith(-1001, 'price', '42');
        expect(deps.setPriceAlertTarget).toHaveBeenCalledWith(-1001, 42);
        expect(deps.sendReply.mock.calls[0][1]).toContain('price_target_saved_topic');
        expect(deps.sendReply.mock.calls[0][1]).toContain('price_target_saved_not_active');
        expect(deps.sendReply.mock.calls[0][1]).toContain('price_scheduler_disabled');
    });

    test('isolates malformed and failed topics, sends later text/photo/video with numeric thread ids, and advances once on any success', async () => {
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';
        const topics = [{ topicId: 'bad' }, { topicId: '11' }, { topicId: '12' }];
        const deps = makeDeps({
            listDuePriceAlertTokens: jest.fn().mockResolvedValue([token]),
            listFeatureTopics: jest.fn().mockResolvedValue(topics),
        });
        deps.bot.sendMessage.mockRejectedValueOnce(new Error('telegram fail')).mockResolvedValueOnce({ message_id: 2 });
        const alerts = createPriceAlerts(deps);
        await alerts.runPriceSchedulerTick();
        expect(deps.bot.sendMessage).toHaveBeenCalledTimes(2);
        expect(deps.bot.sendMessage.mock.calls[0][2].message_thread_id).toBe(11);
        expect(deps.bot.sendMessage.mock.calls[1][2].message_thread_id).toBe(12);
        expect(deps.recordPriceAlertRun).toHaveBeenCalledTimes(1);

        deps.listPriceAlertMedia.mockResolvedValueOnce([{ mediaType: 'photo', fileId: 'photo-id' }]);
        await alerts.sendPriceAlertNow(token);
        expect(deps.bot.sendPhoto.mock.calls[0][2].message_thread_id).toBe(11);
        deps.listPriceAlertMedia.mockResolvedValueOnce([{ mediaType: 'video', fileId: 'video-id' }]);
        await alerts.sendPriceAlertNow(token);
        expect(deps.bot.sendVideo.mock.calls[0][2].message_thread_id).toBe(11);
    });

    test('zero targets, zero successes, and upstream failure never advance; cooldown prevents hot loop', async () => {
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';
        const deps = makeDeps({ listDuePriceAlertTokens: jest.fn().mockResolvedValue([token]) });
        const alerts = createPriceAlerts(deps);
        await alerts.runPriceSchedulerTick();
        await alerts.runPriceSchedulerTick();
        expect(deps.fetchTokenPriceOverview).not.toHaveBeenCalled();
        expect(deps.recordPriceAlertRun).not.toHaveBeenCalled();

        const failingDeps = makeDeps({
            listDuePriceAlertTokens: jest.fn().mockResolvedValue([token]),
            listFeatureTopics: jest.fn().mockResolvedValue([{ topicId: '11' }]),
            fetchTokenPriceOverview: jest.fn().mockRejectedValue(new Error('upstream fail')),
        });
        const failing = createPriceAlerts(failingDeps);
        await failing.runPriceSchedulerTick();
        expect(failingDeps.recordPriceAlertRun).not.toHaveBeenCalled();
    });

    test('aggregate logs redact identifiers and content', async () => {
        process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';
        const logger = require('../src/core/logger');
        const error = jest.spyOn(logger.child('PriceAlert'), 'error').mockImplementation(() => {});
        const deps = makeDeps({
            listDuePriceAlertTokens: jest.fn().mockResolvedValue([token]),
            listFeatureTopics: jest.fn().mockResolvedValue([{ topicId: '11' }]),
        });
        deps.bot.sendMessage.mockRejectedValue(new Error('contains-secret-content'));
        await createPriceAlerts(deps).runPriceSchedulerTick();
        const output = error.mock.calls.flat().join(' ');
        expect(output).not.toContain('0xabc');
        expect(output).not.toContain('-1001');
        expect(output).not.toContain('11');
        expect(output).not.toContain('contains-secret-content');
    });
});

describe('database scheduling semantics', () => {
    test('60-second interval advances nextRunAt by exactly 60000 milliseconds', async () => {
        const dbRun = jest.fn().mockResolvedValue({ changes: 1 });
        const dbGet = jest.fn().mockResolvedValue({ id: 7, chatId: '-1001', tokenAddress: '0xabc', intervalSeconds: 60, enabled: 1 });
        jest.resetModules();
        jest.doMock('../db/core', () => ({
            dbRun,
            dbGet,
            dbAll: jest.fn(),
            normalizePriceIntervalSeconds: value => Number(value),
            PRICE_ALERT_DEFAULT_INTERVAL: 300,
        }));
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const dbAlerts = require('../db/priceAlerts');
        await dbAlerts.recordPriceAlertRun(7, 60);
        expect(dbRun).toHaveBeenCalledWith(expect.stringContaining('nextRunAt = ?'), [1000, 61000, 1000, 7]);
        jest.dontMock('../db/core');
        jest.restoreAllMocks();
    });
});

describe('command and wrapper contracts', () => {
    test('safe wrapper enables only the read-only price scheduler', () => {
        const fs = require('fs');
        const source = fs.readFileSync(require.resolve('../safe-wrapper'), 'utf8');
        expect(source).toContain("process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true'");
        expect(source).toContain("process.env.EXECUTION_DISABLED = 'true'");
    });

    test('Telegram command sets expose price mutations only to group administrators', async () => {
        const { buildTelegramCommandSets } = require('../src/config/constants');
        const sets = buildTelegramCommandSets((_lang, key) => key, 'en');
        const setMyCommands = jest.fn().mockResolvedValue(undefined);
        for (const [type, commands] of Object.entries(sets)) await setMyCommands(commands, { scope: { type } });
        const adminCall = setMyCommands.mock.calls.find(([, options]) => options.scope.type === 'all_chat_administrators');
        expect(adminCall[0].map(item => item.command)).toEqual(expect.arrayContaining(['price', 'pricev', 'pricex']));
        expect(sets.all_private_chats.map(item => item.command)).not.toEqual(expect.arrayContaining(['pricev', 'pricex']));
        expect(sets.all_group_chats.map(item => item.command)).not.toEqual(expect.arrayContaining(['pricev', 'pricex']));
    });

    test('/pricev parser is bare-only so appended arguments fall through to unknown-command handling', () => {
        const fs = require('fs');
        const source = fs.readFileSync(require.resolve('../src/app/coreCommands'), 'utf8');
        expect(source).toContain("/^\\/pricev(?:@[\\w_]+)?$/");
        expect(source).not.toContain("/^\\/pricev(?:@[\\w_]+)?(?:\\s+");
    });
});
