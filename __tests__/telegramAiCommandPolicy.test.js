'use strict';

process.env.TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '123456:TEST_TOKEN_FOR_UNIT_TESTS';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const {
    resolveAiCommandPolicy,
    AI_VISIBLE_COMMANDS,
    AI_HIDDEN_COMMANDS
} = require('../src/core/aiCommandPolicy');
const {
    TELEGRAM_AI_COMMANDS,
    parseTelegramAiCommand
} = require('../src/services/aiChatContracts');
const { buildTelegramCommandSets, HELP_COMMAND_DETAILS, HELP_GROUP_DETAILS } = require('../src/config/constants');
const { createTelegramAiMenuHandlers } = require('../src/app/telegramAiMenuHandlers');
const { createAiApiHandlers } = require('../src/app/aiApiHandlers');
const { cancelCancellableAiState } = require('../src/core/aiCancellableState');
const { aiApiAddPrompts, customPersonaPrompts } = require('../src/core/state');
const { priceWizardStates } = require('../src/features/priceAlerts');

const translate = (lang, key) => `${lang}:${key}`;
const privateMessage = (text, id = 1) => ({ message_id: 7, text, chat: { id, type: 'private' }, from: { id } });
const groupMessage = (text, id = 1) => ({ message_id: 8, text, chat: { id: -10, type: 'group' }, from: { id } });
const makeBot = () => ({
    sendMessage: jest.fn(async (chatId, text, options) => ({ message_id: 20, chat: { id: chatId }, text, options })),
    editMessageText: jest.fn(async () => true),
    answerCallbackQuery: jest.fn(async () => true)
});

describe('authoritative Telegram AI command policy', () => {
    test.each([
        [{}, { chat9RouterUiEnabled: true, legacyApiUiEnabled: false, audioCompatEnabled: true, legacyPersonaEnabled: true }],
        [{ XBOT_TELEGRAM_CHAT_9R_UI: 'false', XBOT_LEGACY_AI_API_UI: 'true', XBOT_AI_AUDIO_COMPAT_ENABLED: 'false', XBOT_LEGACY_PERSONA_ENABLED: 'false' }, { chat9RouterUiEnabled: false, legacyApiUiEnabled: true, audioCompatEnabled: false, legacyPersonaEnabled: false }],
        [{ XBOT_TELEGRAM_CHAT_9R_UI: 'FALSE', XBOT_LEGACY_AI_API_UI: 'TRUE', XBOT_AI_AUDIO_COMPAT_ENABLED: 'FALSE' }, { chat9RouterUiEnabled: true, legacyApiUiEnabled: false, audioCompatEnabled: true, legacyPersonaEnabled: true }]
    ])('normalizes only exact feature flag values', (env, expected) => {
        expect(resolveAiCommandPolicy(env)).toEqual(expected);
    });

    test('visible and hidden registries are exact and help is global-only', () => {
        expect(AI_VISIBLE_COMMANDS).toEqual(['chat', 'new', 'model', 'stop', 'retry', 'history', 'status', 'providers']);
        expect(AI_HIDDEN_COMMANDS).toEqual(['ai', 'models', 'api', 'persona', 'personas', 'personality', 'aib', 'cancel']);
        expect(TELEGRAM_AI_COMMANDS.map(item => item.name)).toEqual(AI_VISIBLE_COMMANDS);
        expect(TELEGRAM_AI_COMMANDS.some(item => item.name === 'help')).toBe(false);
        for (const name of AI_HIDDEN_COMMANDS) expect(TELEGRAM_AI_COMMANDS.some(item => item.name === name)).toBe(false);
        expect(parseTelegramAiCommand('/ai hello')).toMatchObject({ name: 'chat', invokedAs: 'ai' });
        expect(parseTelegramAiCommand('/models')).toMatchObject({ name: 'model' });
        expect(parseTelegramAiCommand('/api')).toMatchObject({ name: 'api' });
        expect(parseTelegramAiCommand('/cancel')).toMatchObject({ name: 'cancel' });
        expect(parseTelegramAiCommand('/help')).toBeNull();
    });

    test.each([true, false])('command sets are unique, bounded, localized and feature-consistent (9Router=%s)', enabled => {
        for (const lang of ['en', 'vi']) {
            const sets = buildTelegramCommandSets(translate, lang, { ...resolveAiCommandPolicy({}), chat9RouterUiEnabled: enabled });
            for (const [scope, commands] of Object.entries(sets)) {
                const names = commands.map(item => item.command);
                expect(new Set(names).size).toBe(names.length);
                expect(commands.length).toBeLessThanOrEqual(100);
                expect(commands.every(item => item.description.length >= 1 && item.description.length <= 256)).toBe(true);
                for (const hidden of AI_HIDDEN_COMMANDS) expect(names).not.toContain(hidden);
                if (scope === 'all_private_chats' && enabled) expect(names.filter(name => AI_VISIBLE_COMMANDS.includes(name))).toEqual(AI_VISIBLE_COMMANDS);
                if (scope !== 'all_private_chats' || !enabled) expect(names.filter(name => AI_VISIBLE_COMMANDS.includes(name))).toEqual(names.includes('chat') ? ['chat'] : []);
            }
        }
        expect(HELP_COMMAND_DETAILS.api).toBeUndefined();
        expect(HELP_COMMAND_DETAILS.profile).toBeUndefined();
        expect(HELP_GROUP_DETAILS.onboarding.commands).not.toEqual(expect.arrayContaining(['api', 'profile']));
    });
});

describe('AI menu policy behavior', () => {
    test('inline Help renders directly while slash /help is not consumed', async () => {
        const bot = makeBot();
        const handlers = createTelegramAiMenuHandlers({ bot, getLang: async () => 'en', featurePolicy: resolveAiCommandPolicy({}) });
        expect(await handlers.handleCommand(privateMessage('/help'))).toBe(false);
        await handlers.handleCommand(privateMessage('/chat'));
        const helpButton = bot.sendMessage.mock.calls.at(-1)[2].reply_markup.inline_keyboard.flat().find(button => button.text.includes('Help'));
        await handlers.handleCallback({ id: 'q', data: helpButton.callback_data, message: { message_id: 20, chat: { id: 1, type: 'private' } }, from: { id: 1 } });
        expect(bot.editMessageText.mock.calls.at(-1)[0]).toContain('/chat');
    });

    test('/api defaults to private deprecation/providers and groups disclose nothing', async () => {
        const bot = makeBot();
        const dashboardLink = jest.fn(async () => 'https://xbot.example/once');
        const discoverCatalog = jest.fn(async () => ({ providers: [], models: [], combos: [] }));
        const handlers = createTelegramAiMenuHandlers({ bot, getLang: async () => 'en', dashboardLink, discoverCatalog, featurePolicy: resolveAiCommandPolicy({}) });
        expect(await handlers.handleCommand(privateMessage('/api'))).toBe(true);
        expect(bot.sendMessage.mock.calls.at(-1)[1]).toMatch(/9Router/i);
        expect(bot.sendMessage.mock.calls.at(-1)[2].reply_markup.inline_keyboard.flat().find(button => button.url).url).toBe('https://xbot.example/once');
        await handlers.handleCommand(groupMessage('/api'));
        expect(discoverCatalog).not.toHaveBeenCalled();
        expect(bot.sendMessage.mock.calls.at(-1)[1]).not.toMatch(/provider|account|key|model/i);
    });

    test('audio compatibility off fails before prompt/provider execution', async () => {
        const bot = makeBot();
        const promptMessage = jest.fn();
        const handlers = createTelegramAiMenuHandlers({ bot, getLang: async () => 'en', promptMessage, featurePolicy: { ...resolveAiCommandPolicy({}), audioCompatEnabled: false } });
        await handlers.handleCommand(privateMessage('/chat tts hello'));
        await handlers.handleCommand({ ...privateMessage('/chat'), voice: { file_id: 'voice' } });
        expect(promptMessage).not.toHaveBeenCalled();
        expect(bot.sendMessage.mock.calls.map(call => call[1]).join(' ')).toMatch(/unavailable/i);
    });

    test('/cancel clears only matching private user/chat pending states and not generation/history', async () => {
        const bot = makeBot();
        const stopGeneration = jest.fn();
        const conversationService = { listConversations: jest.fn(async () => []), getConversation: jest.fn(async () => null), newConversation: jest.fn(async () => ({ id: 'c', turns: [] })), getActiveGeneration: jest.fn(), stopGeneration };
        const handlers = createTelegramAiMenuHandlers({ bot, getLang: async () => 'en', conversationService, featurePolicy: resolveAiCommandPolicy({}) });
        handlers.state.searchState.set('1:1', { chatId: '1', userId: '1', expiresAt: Date.now() + 1000 });
        handlers.state.searchState.set('2:2', { chatId: '2', userId: '2', expiresAt: Date.now() + 1000 });
        aiApiAddPrompts.set('1', { chatId: '1' }); customPersonaPrompts.set('1', { chatId: '1' }); priceWizardStates.set('1', { chatId: '1' });
        await handlers.handleCommand(privateMessage('/cancel'));
        expect(handlers.state.searchState.has('1:1')).toBe(false);
        expect(handlers.state.searchState.has('2:2')).toBe(true);
        expect(aiApiAddPrompts.has('1')).toBe(false); expect(customPersonaPrompts.has('1')).toBe(false); expect(priceWizardStates.has('1')).toBe(false);
        expect(stopGeneration).not.toHaveBeenCalled();
        expect(bot.sendMessage.mock.calls.at(-1)[1]).toMatch(/cancelled/i);
    });

    test('/cancel does not clear legacy state without an explicit chat binding', () => {
        aiApiAddPrompts.set('1', { provider: 'google' });
        customPersonaPrompts.set('1', { personaId: 'assistant' });
        priceWizardStates.set('1', { step: 'asset' });
        expect(cancelCancellableAiState({ userId: '1', chatId: '1', searchState: new Map() })).toBe(false);
        expect(aiApiAddPrompts.has('1')).toBe(true);
        expect(customPersonaPrompts.has('1')).toBe(true);
        expect(priceWizardStates.has('1')).toBe(true);
    });
});

describe('legacy API callback safety policy', () => {
    const deps = policy => {
        const bot = makeBot();
        const db = {
            listUserAiKeys: jest.fn(async () => [{ id: 'k1', provider: 'google', apiKey: 'INERT_TEST_API_KEY' }]),
            getUserAiProvider: jest.fn(async () => 'google'), getAiMemory: jest.fn(async () => null),
            getUserAiKey: jest.fn(async () => ({ id: 'k1', provider: 'google', apiKey: 'INERT_TEST_API_KEY' })),
            addUserAiKey: jest.fn(), deleteUserAiKey: jest.fn(), setUserAiProvider: jest.fn(), getTtsSettings: jest.fn()
        };
        const handlers = createAiApiHandlers({ t: (_lang, key) => key, bot, db, getLang: async () => 'en', buildCloseKeyboard: () => ({}), maskApiKey: () => 'masked', escapeHtml: String, featurePolicy: policy, dashboardLink: async () => 'https://xbot.example/once' });
        return { bot, db, handlers };
    };

    test('disabled callbacks render stale providers card with zero reads or mutations', async () => {
        const { bot, db, handlers } = deps(resolveAiCommandPolicy({}));
        for (const data of ['apihub|home', 'aiapi|open|google|0', 'aiapi|add|google|0', 'aiapi|del|google|k1|0', 'aiapi|copy|google|k1|0']) {
            expect(await handlers.handleLegacyCallback({ id: data, data, message: { message_id: 1, chat: { id: 1, type: 'private' } }, from: { id: 1 } }, 'en')).toBe(true);
        }
        expect(db.listUserAiKeys).not.toHaveBeenCalled(); expect(db.getUserAiKey).not.toHaveBeenCalled();
        expect(db.addUserAiKey).not.toHaveBeenCalled(); expect(db.deleteUserAiKey).not.toHaveBeenCalled(); expect(db.setUserAiProvider).not.toHaveBeenCalled();
        expect(JSON.stringify(bot.sendMessage.mock.calls)).not.toContain('RAW-SECRET');
    });

    test('disabled /api helper fails closed before credential reads', async () => {
        const { db, handlers } = deps(resolveAiCommandPolicy({}));
        await handlers.handleApiCommand(privateMessage('/api'));
        expect(db.listUserAiKeys).not.toHaveBeenCalled();
        expect(db.getUserAiProvider).not.toHaveBeenCalled();
    });

    test('raw key copy stays impossible even with legacy UI enabled', async () => {
        const { bot, db, handlers } = deps({ ...resolveAiCommandPolicy({}), legacyApiUiEnabled: true });
        await handlers.handleLegacyCallback({ id: 'copy', data: 'aiapi|copy|google|k1|0', message: { message_id: 1, chat: { id: 1, type: 'private' } }, from: { id: 1 } }, 'en');
        expect(db.getUserAiKey).not.toHaveBeenCalled();
        expect(JSON.stringify(bot.sendMessage.mock.calls)).not.toContain('RAW-SECRET');
        expect(JSON.stringify(bot.sendMessage.mock.calls)).toMatch(/server-side|Providers|dashboard/i);
    });
});

describe('runtime wiring contracts', () => {
    test('startup registers generic fallback plus en/vi commands once per scope', async () => {
        const source = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
        const start = source.indexOf('async function registerBaseCommands()');
        expect(start).toBeGreaterThan(-1);
        let depth = 0;
        let end = -1;
        for (let index = source.indexOf('{', start); index < source.length; index += 1) {
            if (source[index] === '{') depth += 1;
            if (source[index] === '}') depth -= 1;
            if (depth === 0) { end = index + 1; break; }
        }
        const bot = { setMyCommands: jest.fn().mockResolvedValue(undefined) };
        const runnable = new Function(
            'fs', 'path', '__dirname', 'resolveLangCode', 'buildTelegramCommandSets', 't',
            'aiCommandPolicy', 'bot', 'delay', 'log', 'defaultLang',
            `return (${source.slice(start, end).replace('async function registerBaseCommands', 'async function')});`
        )(
            { readdirSync: () => ['en.json', 'vi.json'] }, path, ROOT, value => value,
            buildTelegramCommandSets, translate, resolveAiCommandPolicy({}), bot,
            async () => {}, { warn: jest.fn(), error: jest.fn() }, 'vi'
        );
        await runnable();

        expect(bot.setMyCommands).toHaveBeenCalledTimes(12);
        const calls = bot.setMyCommands.mock.calls;
        const generic = calls.filter(([, options]) => !Object.hasOwn(options, 'language_code'));
        const localized = calls.filter(([, options]) => Object.hasOwn(options, 'language_code'));
        expect(generic).toHaveLength(4);
        expect(localized).toHaveLength(8);
        expect(localized.map(([, options]) => options.language_code).sort()).toEqual([
            'en', 'en', 'en', 'en', 'vi', 'vi', 'vi', 'vi'
        ]);
        expect(new Set(calls.map(([, options]) => `${options.scope.type}:${options.language_code || '<generic>'}`)).size).toBe(12);
        for (const [commands, options] of generic) {
            const vietnamese = localized.find(([, localizedOptions]) => (
                localizedOptions.scope.type === options.scope.type && localizedOptions.language_code === 'vi'
            ));
            expect(commands).toEqual(vietnamese[0]);
        }

        const byGenericScope = Object.fromEntries(generic.map(([commands, options]) => [
            options.scope.type,
            commands.map(item => item.command)
        ]));
        expect(byGenericScope.all_private_chats).toEqual(expect.arrayContaining([
            'chat', 'new', 'model', 'stop', 'retry', 'history', 'status', 'providers', 'help'
        ]));
        for (const hidden of AI_HIDDEN_COMMANDS) expect(byGenericScope.all_private_chats).not.toContain(hidden);
        expect(byGenericScope.all_group_chats).not.toEqual(expect.arrayContaining(['pricev', 'pricex']));
        expect(byGenericScope.all_chat_administrators).toEqual(expect.arrayContaining(['price', 'pricev', 'pricex']));
        expect(calls.flatMap(([commands]) => commands).every(item => item.description.length >= 3 && item.description.length <= 256)).toBe(true);
    });

    test('index uses shared policy guards and contains no raw API key Telegram copy', () => {
        const source = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
        expect(source).toContain("require('./src/core/aiCommandPolicy')");
        expect(source).toContain('handleLegacyCallback(query');
        expect(source).not.toContain('<code>${escapeHtml(keyEntry.apiKey)}</code>');
        expect(source).not.toMatch(/XBOT_AI_LEGACY_MENU/);
        expect(source).toMatch(/persona[\s\S]*?chatType\s*!==\s*['"]private['"]/);
        expect(source).toMatch(/\/api[\s\S]*?chatType\s*!==\s*['"]private['"]/);
        expect(source.indexOf('handleLegacyCallback(query, callbackLang)')).toBeLessThan(source.indexOf("query.data?.startsWith('apihub|')"));
        for (const prefix of ['ttssettings', 'ttsvoice', 'ttslang']) {
            const branch = source.indexOf(`query.data?.startsWith('${prefix}|')`);
            const guard = source.indexOf('if (!aiCommandPolicy.audioCompatEnabled)', branch);
            expect(branch).toBeGreaterThan(-1);
            expect(guard).toBeGreaterThan(branch);
            expect(guard - branch).toBeLessThan(300);
        }
    });
});

afterEach(() => {
    aiApiAddPrompts.clear();
    customPersonaPrompts.clear();
    priceWizardStates.clear();
});
