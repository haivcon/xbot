'use strict';

const fs = require('fs');
const path = require('path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('P0 on-chain safety contracts', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
    delete global._batchTransferPending;
  });

  test('Agentic Wallet schemas omit force and service rejects supplied force', async () => {
    const declarations = read('src/features/ai/onchain/declarations.js');
    const awSection = declarations.slice(declarations.indexOf("name: 'aw_send'"), declarations.indexOf("name: 'aw_history'"));
    expect(awSection).not.toMatch(/\bforce\b/);

    process.env.EXECUTION_DISABLED = 'false';
    jest.doMock('../src/config', () => ({
      OKX_BASE_URL: 'https://example.invalid', OKX_FETCH_TIMEOUT: 10,
      hasOkxCredentials: true, OKX_DEX_DEFAULT_MAX_RETRIES: 0
    }));
    jest.doMock('../src/utils/okxKeyManager', () => ({
      getCredentials: () => ({ apiKey: 'x', secretKey: 'x', passphrase: 'x' }),
      rotate: jest.fn()
    }));
    global.fetch = jest.fn();
    const onchainos = require('../src/services/onchainos');
    await expect(onchainos.awSend({ force: true })).rejects.toMatchObject({ code: 'FORCE_NOT_ALLOWED' });
    await expect(onchainos.awContractCall({ force: false })).rejects.toMatchObject({ code: 'FORCE_NOT_ALLOWED' });
    await expect(onchainos.awSignMessage({ force: true })).rejects.toMatchObject({ code: 'FORCE_NOT_ALLOWED' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('Agentic Wallet writes/signing are execution-gated and confirming is structured pending approval', async () => {
    process.env.EXECUTION_DISABLED = 'true';
    const onchainos = {
      awSend: jest.fn(), awContractCall: jest.fn(), awSignMessage: jest.fn()
    };
    jest.doMock('../src/services/onchainos', () => onchainos);
    const tools = require('../src/features/ai/onchain/agenticWalletTools');
    for (const operation of [
      () => tools.aw_send({}, {}),
      () => tools.aw_contract_call({}, {}),
      () => tools.aw_sign_message({}, {})
    ]) {
      const result = await operation();
      expect(result).toMatchObject({ code: 'EXECUTION_DISABLED', success: false });
    }
    expect(onchainos.awSend).not.toHaveBeenCalled();
    expect(onchainos.awContractCall).not.toHaveBeenCalled();
    expect(onchainos.awSignMessage).not.toHaveBeenCalled();

    process.env.EXECUTION_DISABLED = 'false';
    jest.resetModules();
    onchainos.awSend.mockResolvedValue({ confirming: true, requestId: 'approval-1' });
    jest.doMock('../src/services/onchainos', () => onchainos);
    const enabledTools = require('../src/features/ai/onchain/agenticWalletTools');
    await expect(enabledTools.aw_send({ amount: '1' }, {})).resolves.toMatchObject({
      status: 'PENDING_APPROVAL', success: false,
      pendingApproval: { upstream: 'onchainos', operation: 'aw_send' }
    });
  });

  test('DCA live execution requires global, dedicated opt-in, and durable gateway readiness', () => {
    process.env.EXECUTION_DISABLED = 'false';
    delete process.env.DCA_LIVE_EXECUTION_ENABLED;
    delete process.env.DURABLE_INTENT_GATEWAY_READY;
    let policy = require('../src/core/executionPolicy');
    expect(() => policy.assertDcaExecutionEnabled()).toThrow(expect.objectContaining({ code: 'DCA_EXECUTION_DISABLED' }));

    process.env.DCA_LIVE_EXECUTION_ENABLED = 'true';
    jest.resetModules();
    policy = require('../src/core/executionPolicy');
    expect(() => policy.assertDcaExecutionEnabled()).toThrow(expect.objectContaining({ code: 'DURABLE_INTENT_GATEWAY_NOT_READY' }));

    process.env.DURABLE_INTENT_GATEWAY_READY = 'TRUE';
    jest.resetModules();
    policy = require('../src/core/executionPolicy');
    expect(() => policy.assertDcaExecutionEnabled()).toThrow(expect.objectContaining({ code: 'DURABLE_INTENT_GATEWAY_NOT_READY' }));

    process.env.DURABLE_INTENT_GATEWAY_READY = 'true';
    jest.resetModules();
    policy = require('../src/core/executionPolicy');
    expect(() => policy.assertDcaExecutionEnabled()).not.toThrow();

    const handlers = read('src/app/aiHandlers.js');
    const dcaSection = handlers.slice(handlers.indexOf("task.type === 'dca_swap'"), handlers.indexOf('// Get swap TX and execute'));
    expect(dcaSection).toMatch(/assertDcaExecutionEnabled\(\)/);
    expect(dcaSection).toMatch(/waitForTransaction\(approvalHash/);
    expect(dcaSection).not.toMatch(/setTimeout\(r, 3000\)/);
    expect(dcaSection).toMatch(/throw approveErr/);
  });

  test('batch confirmation denies timeout, send failure, wrong binding, expiry, and replay', () => {
    const walletTools = read('src/features/ai/onchain/walletTools.js');
    const confirmationStart = walletTools.indexOf('const batchId = `bt_');
    const confirmationEnd = walletTools.indexOf('// cancelMidBtnTexts hoisted', confirmationStart);
    const batchConfirmation = walletTools.slice(confirmationStart, confirmationEnd);
    expect(confirmationStart).toBeGreaterThanOrEqual(0);
    expect(confirmationEnd).toBeGreaterThan(confirmationStart);
    expect(batchConfirmation).toMatch(/confirmed !== 'confirm'/);
    expect(batchConfirmation).toMatch(/Confirmation unavailable; batch denied/);
    expect(batchConfirmation).not.toMatch(/auto-proceed|failed, proceeding/);

    const registrations = read('src/app/aiRegistrations.js');
    const batchCallback = registrations.slice(registrations.indexOf('function registerBatchTransferCallbacks'), registrations.indexOf('module.exports'));
    expect(batchCallback).toMatch(/query\.from.*pending\.userId/s);
    expect(batchCallback).toMatch(/query\.message.*pending\.chatId/s);
    expect(batchCallback).toMatch(/query\.message.*pending\.messageId/s);
    expect(batchCallback).toMatch(/Date\.now\(\) <= pending\.expiresAt/);
    expect(batchCallback).toMatch(/_batchTransferPending\.delete\(batchId\)/);

    const { TelegramCallbackStore } = require('../src/services/telegramCallbackStore');
    let now = 100;
    const store = new TelegramCallbackStore({ now: () => now, ttlMs: 50 });
    const callback = store.issue({ action: 'batch_confirm', userId: '1', chatId: '2', messageId: '3', revision: 'r1', mutation: true });
    expect(store.consume(callback, { userId: '9', chatId: '2', messageId: '3', revision: 'r1' }).code).toBe('WRONG_USER');
    expect(store.consume(callback, { userId: '1', chatId: '8', messageId: '3', revision: 'r1' }).code).toBe('WRONG_CHAT');
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '4', revision: 'r1' }).code).toBe('STALE_MESSAGE');
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '3', revision: 'r0' }).code).toBe('STALE_REVISION');
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '3', revision: 'r1' }).ok).toBe(true);
    expect(store.consume(callback, { userId: '1', chatId: '2', messageId: '3', revision: 'r1' }).code).toBe('DUPLICATE');
    const stale = store.issue({ action: 'batch_confirm', userId: '1', chatId: '2', messageId: '3', mutation: true });
    now = 200;
    expect(store.consume(stale, { userId: '1', chatId: '2', messageId: '3' }).code).toBe('EXPIRED');
  });

  test('batch callback dynamically denies wrong actor/chat/message, expiry, and replay', async () => {
    const handlers = [];
    const bot = {
      on: jest.fn((event, handler) => { if (event === 'callback_query') handlers.push(handler); }),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined)
    };
    const { registerBatchTransferCallbacks } = require('../src/app/aiRegistrations');
    registerBatchTransferCallbacks(bot, () => 'en');

    const resolve = jest.fn();
    const pending = { userId: '1', chatId: '2', messageId: '3', expiresAt: Date.now() + 10000, resolve };
    global._batchTransferPending = new Map([['bt1', pending]]);
    const dispatch = async overrides => {
      const query = {
        id: 'q1', data: 'batchconfirm|confirm_bt1', from: { id: 1 },
        message: { chat: { id: 2 }, message_id: 3 }, ...overrides
      };
      for (const handler of handlers) await handler(query);
    };

    await dispatch({ from: { id: 9 } });
    await dispatch({ message: { chat: { id: 8 }, message_id: 3 } });
    await dispatch({ message: { chat: { id: 2 }, message_id: 4 } });
    expect(resolve).not.toHaveBeenCalled();
    expect(global._batchTransferPending.has('bt1')).toBe(true);

    await dispatch({});
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('confirm');
    expect(global._batchTransferPending.has('bt1')).toBe(false);
    await dispatch({});
    expect(resolve).toHaveBeenCalledTimes(1);

    const staleResolve = jest.fn();
    global._batchTransferPending.set('bt1', { ...pending, expiresAt: Date.now() - 1, resolve: staleResolve });
    await dispatch({});
    expect(staleResolve).not.toHaveBeenCalled();
  });

  test('active approval writes use exact amounts and legacy Telegram swap execution is disabled', () => {
    const active = [
      read('src/features/ai/onchain/tradingTools.js'),
      read('src/features/ai/onchain/walletTools.js'),
      read('src/app/aiHandlers.js'),
      read('src/server/marketRoutes.js')
    ].join('\n');
    expect(active).not.toMatch(/ethers\.MaxUint256/);
    expect(active).not.toMatch(/Approve INFINITE|Approving INFINITE|infiniteApproveData/);

    const registrations = read('src/app/aiRegistrations.js');
    const legacy = registrations.slice(registrations.indexOf('function registerSwapConfirmCallback'), registrations.indexOf('function registerTokenSearchCallbacks'));
    expect(legacy).toMatch(/LEGACY_SWAP_CALLBACK_DISABLED/);
    expect(legacy).not.toMatch(/signTransaction|broadcastTransaction|getSwapTransaction/);
  });

  test('principal AI swap does not retry broadcast and receipt uncertainty is not success', () => {
    const trading = read('src/features/ai/onchain/tradingTools.js');
    const executeSwap = trading.slice(trading.indexOf('async execute_swap'), trading.indexOf('async batch_swap'));
    expect(executeSwap).not.toMatch(/AUTO-SWAP-BROADCAST/);
    expect(executeSwap).toMatch(/status:\s*'unknown'/);
    expect(executeSwap).toMatch(/PENDING RECONCILIATION|UNKNOWN/);
  });
});
