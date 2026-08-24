'use strict';

const {
  TELEGRAM_AI_COMMANDS,
  buildAuthoritativeCatalog,
  escapeTelegramHtml,
  splitTelegramHtml
} = require('../src/services/aiChatContracts');
const { TelegramCallbackStore } = require('../src/services/telegramCallbackStore');
const { AiConversationService } = require('../src/services/aiConversationService');
const { createTelegramAiMenuHandlers } = require('../src/app/telegramAiMenuHandlers');

describe('xBot Telegram Chat AI framework contracts', () => {
  test('canonical command registry contains focused commands and models alias', () => {
    expect(TELEGRAM_AI_COMMANDS.map(item => item.name)).toEqual([
      'new', 'model', 'stop', 'retry', 'history', 'status', 'providers', 'help'
    ]);
    expect(TELEGRAM_AI_COMMANDS.find(item => item.name === 'model').aliases).toContain('models');
  });

  test('catalog only exposes active connected provider models and healthy combos', () => {
    const catalog = buildAuthoritativeCatalog({
      providers: [
        { id: 'p1', name: 'Alpha', connected: true, status: 'active' },
        { id: 'p2', name: 'Beta', connected: false, status: 'disconnected' }
      ],
      models: [
        { id: 'p1/m1', providerId: 'p1', label: 'One' },
        { id: 'p2/private', providerId: 'p2', label: 'Private' }
      ],
      combos: [
        { id: 'combo/ok', name: 'Safe', models: ['p1/m1'] },
        { id: 'combo/stale', name: 'Stale', models: ['p2/private'] }
      ],
      selectedRoute: 'p2/private'
    });
    expect(catalog.models.map(item => item.id)).toEqual(['p1/m1']);
    expect(catalog.combos.map(item => item.id)).toEqual(['combo/ok']);
    expect(catalog.selectedRoute).toBe('p1/m1');
    expect(catalog.revision).toMatch(/^[a-f0-9]{12}$/);
  });

  test('Telegram output escapes HTML and chunks Unicode conservatively', () => {
    expect(escapeTelegramHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
    const chunks = splitTelegramHtml('😀'.repeat(20), 15);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('😀'.repeat(20));
    expect(chunks.every(chunk => Buffer.byteLength(chunk, 'utf8') <= 60)).toBe(true);
  });

  test('opaque callbacks are short, bound, expiring and mutation-idempotent', () => {
    let now = 1000;
    const store = new TelegramCallbackStore({ now: () => now, ttlMs: 100 });
    const callback = store.issue({ action: 'select', userId: '1', chatId: '2', messageId: '3', revision: 'r1', payload: { route: 'p/m' }, mutation: true });
    expect(Buffer.byteLength(callback)).toBeLessThanOrEqual(64);
    expect(callback).not.toContain('p/m');
    expect(store.consume(callback, { userId: '9', chatId: '2', messageId: '3', revision: 'r1' }).code).toBe('WRONG_USER');
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '3', revision: 'r2' }).code).toBe('STALE_REVISION');
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '3', revision: 'r1' }).ok).toBe(true);
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '3', revision: 'r1' }).code).toBe('DUPLICATE');
    const expiring = store.issue({ action: 'page', userId: '1', chatId: '2' });
    now = 1200;
    expect(store.consume(expiring, { userId: '1', chatId: '2' }).code).toBe('EXPIRED');
  });

  test('conversation lifecycle makes new idempotent, stop safe and retry bounded', async () => {
    const service = new AiConversationService({ idFactory: (() => { let n = 0; return () => `id${++n}`; })() });
    const first = await service.newConversation({ tenantId: '1', routeRef: 'p/m', idempotencyKey: 'same' });
    const duplicate = await service.newConversation({ tenantId: '1', routeRef: 'p/m', idempotencyKey: 'same' });
    expect(duplicate.id).toBe(first.id);
    const active = await service.beginGeneration({ tenantId: '1', conversationId: first.id, prompt: 'hello', routeRef: 'p/m', idempotencyKey: 'turn1' });
    expect((await service.stopGeneration({ tenantId: '1', generationId: active.id })).status).toBe('stopped');
    expect((await service.stopGeneration({ tenantId: '1', generationId: active.id })).status).toBe('stopped');
    const retry = await service.retryLatest({ tenantId: '1', conversationId: first.id });
    expect(retry).toMatchObject({ status: 'claimed', prompt: 'hello' });
    await expect(service.retryLatest({ tenantId: '1', conversationId: first.id })).rejects.toMatchObject({ code: 'NOT_RETRYABLE' });
    expect(await service.getConversation({ tenantId: '2', conversationId: first.id })).toBeNull();

    const restored = new AiConversationService({
      adapter: {
        getConversation: jest.fn(async () => ({ ...first, turns: [] }))
      }
    });
    expect((await restored.getConversation({ tenantId: '1', conversationId: first.id })).id).toBe(first.id);
    const restoredGeneration = await restored.beginGeneration({ tenantId: '1', conversationId: first.id, prompt: 'after restart' });
    expect(restoredGeneration.conversationId).toBe(first.id);
  });

  test('persistence failure does not duplicate turns when interruption is recorded', async () => {
    let failNextSave = false;
    const snapshots = [];
    const service = new AiConversationService({
      idFactory: (() => { let n = 0; return () => `persist${++n}`; })(),
      adapter: {
        saveConversation: jest.fn(async conversation => {
          if (failNextSave) { failNextSave = false; throw new Error('db unavailable'); }
          snapshots.push(JSON.parse(JSON.stringify(conversation)));
        })
      }
    });
    const conversation = await service.newConversation({ tenantId: '1', routeRef: 'p/m' });
    const generation = await service.beginGeneration({ tenantId: '1', conversationId: conversation.id, prompt: 'hello' });
    failNextSave = true;
    await expect(service.completeGeneration({ tenantId: '1', generationId: generation.id, text: 'partial' })).rejects.toThrow('db unavailable');
    await service.interruptGeneration({ tenantId: '1', generationId: generation.id, code: 'PERSISTENCE_FAILED' });
    const stored = await service.getConversation({ tenantId: '1', conversationId: conversation.id });
    expect(stored.turns).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'partial', status: 'interrupted' })
    ]);
    expect(snapshots.at(-1).turns).toHaveLength(2);
  });

  test('runtime commands persist new conversations and stop/retry the active generation', async () => {
    const saved = [];
    const adapter = {
      saveConversation: jest.fn(async conversation => saved.push({ ...conversation })),
      getConversation: jest.fn(async () => null),
      listConversations: jest.fn(async () => [])
    };
    const service = new AiConversationService({
      adapter,
      idFactory: (() => { let n = 0; return () => `runtime${++n}`; })()
    });
    const sent = [];
    const retried = [];
    const bot = {
      sendMessage: jest.fn(async (chatId, text, options) => { sent.push({ chatId, text, options }); return { message_id: 10, chat: { id: chatId } }; }),
      answerCallbackQuery: jest.fn(async () => {}),
      editMessageText: jest.fn(async () => {})
    };
    const handlers = createTelegramAiMenuHandlers({
      bot,
      getLang: async () => 'en',
      discoverCatalog: async () => buildAuthoritativeCatalog({
        providers: [{ id: 'owner-id', connected: true, status: 'active' }],
        models: [{ id: 'opaque-model', providerId: 'owner-id' }]
      }),
      conversationService: service,
      retryMessage: async (_msg, prompt, routeRef) => retried.push({ prompt, routeRef }),
      featureFlags: { telegramUi: true, groupLegacy: false }
    });
    const base = { chat: { id: 1, type: 'private' }, from: { id: 1 } };

    await handlers.handleCommand({ ...base, message_id: 1, text: '/new' });
    expect(adapter.saveConversation).toHaveBeenCalled();
    const context = await handlers.getChatContext('1');
    const active = await service.beginGeneration({ tenantId: '1', conversationId: context.conversationId, prompt: 'hello', routeRef: context.routeRef });
    await handlers.handleCommand({ ...base, message_id: 2, text: '/stop' });
    expect(active.abortController.signal.aborted).toBe(true);
    expect(service.getActiveGeneration({ tenantId: '1', conversationId: context.conversationId })).toBeNull();
    await handlers.handleCommand({ ...base, message_id: 3, text: '/retry' });
    expect(retried).toEqual([{ prompt: 'hello', routeRef: 'opaque-model' }]);
    expect(saved.at(-1).turns).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'hello' })]));
  });

  test('private command UX hides personal data in groups and renders canonical help', async () => {
    const sent = [];
    const bot = {
      sendMessage: jest.fn(async (chatId, text, options) => { sent.push({ chatId, text, options }); return { message_id: 10, chat: { id: chatId } }; }),
      answerCallbackQuery: jest.fn(async () => {}),
      editMessageText: jest.fn(async () => {})
    };
    const handlers = createTelegramAiMenuHandlers({
      bot,
      getLang: async () => 'en',
      discoverCatalog: async () => buildAuthoritativeCatalog({ providers: [], models: [], combos: [] }),
      dashboardLink: async () => 'https://xbot.example/xBot/',
      featureFlags: { telegramUi: true, groupLegacy: false }
    });
    expect(await handlers.handleCommand({ text: '/history', chat: { id: -1, type: 'group' }, from: { id: 1 } })).toBe(true);
    expect(sent[0].text).not.toMatch(/conversation ID|model ID|connected account/i);
    await handlers.handleCommand({ text: '/help', chat: { id: 1, type: 'private' }, from: { id: 1 } });
    for (const command of TELEGRAM_AI_COMMANDS) expect(sent.at(-1).text).toContain(`/${command.name}`);
  });
});

describe('runtime characterization', () => {
  test('index keeps one canonical legacy handler and wires unified Telegram AI before it', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');
    expect(source).toContain("require('./src/app/telegramAiMenuHandlers')");
    expect(source).toMatch(/handleTelegramAiCommand\(msg\)[\s\S]*?handleAiCommand\(msg\)/);
    expect(source).toContain('handleTelegramAiCallback(query)');
    expect(source.indexOf('enforceBanForCallback(query, callbackLang)')).toBeLessThan(source.indexOf('handleTelegramAiCallback(query)'));
    expect(source).not.toContain("model.id.split('/')[0]");
  });

  test('providers login carries only a semantic target and Chat AI consumes the provider deep link', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const chatSource = fs.readFileSync(path.join(root, 'dashboard/xBot/src/pages/user/ChatPage.jsx'), 'utf8');

    expect(indexSource).toMatch(/dashboardLink:\s*async\s*\(\{\s*userId,\s*section\s*\}\)/);
    expect(indexSource).toMatch(/target:\s*section\s*===\s*['"]providers['"]\s*\?\s*['"]providers['"]\s*:\s*undefined/);
    expect(chatSource).toMatch(/useSearchParams/);
    expect(chatSource).toMatch(/searchParams\.get\(['"]section['"]\)\s*===\s*['"]providers['"]/);
    expect(chatSource).toMatch(/useState\(providerDeepLink\)/);
    expect(chatSource).toMatch(/useState\(providerDeepLink\s*\?\s*['"]9router['"]\s*:\s*['"]model['"]\)/);
  });
});
