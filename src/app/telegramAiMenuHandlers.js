'use strict';

const {
  TELEGRAM_AI_COMMANDS,
  buildAuthoritativeCatalog,
  escapeTelegramHtml,
  resolveTelegramAiCommand
} = require('../services/aiChatContracts');
const { AiConversationService } = require('../services/aiConversationService');
const { TelegramCallbackStore } = require('../services/telegramCallbackStore');

const COPY = {
  en: {
    privateOnly: 'Chat AI setup and history are available in private chat only.',
    new: 'Fresh conversation ready.', current: 'Current route', noRoute: 'No connected 9Router model is available.',
    models: 'Choose an authoritative 9Router model or combo:', providers: 'Provider setup is handled securely in the dashboard. Never send credentials in chat.',
    stop: 'No active response to stop.', stopped: 'Response stopped. Partial output was preserved.',
    retry: 'No interrupted turn is available to retry.', history: 'No private conversations yet.',
    status: '9Router status', close: 'Close', stale: 'This menu is stale. Open it again.', selected: 'Route selected',
    help: 'xBot Chat AI commands'
  },
  vi: {
    privateOnly: 'Cài đặt và lịch sử Chat AI chỉ khả dụng trong trò chuyện riêng.',
    new: 'Cuộc trò chuyện mới đã sẵn sàng.', current: 'Định tuyến hiện tại', noRoute: 'Không có model 9Router đã kết nối.',
    models: 'Chọn model hoặc combo 9Router chính thức:', providers: 'Thiết lập nhà cung cấp an toàn trên dashboard. Không gửi thông tin đăng nhập trong chat.',
    stop: 'Không có phản hồi nào đang chạy.', stopped: 'Đã dừng phản hồi. Nội dung một phần được giữ lại.',
    retry: 'Không có lượt bị gián đoạn để thử lại.', history: 'Chưa có cuộc trò chuyện riêng.',
    status: 'Trạng thái 9Router', close: 'Đóng', stale: 'Menu này đã cũ. Hãy mở lại.', selected: 'Đã chọn định tuyến',
    help: 'Các lệnh xBot Chat AI'
  }
};

function flagsFromEnv() {
  return {
    telegramUi: process.env.XBOT_TELEGRAM_CHAT_9R_UI !== 'false',
    legacyMenu: process.env.XBOT_AI_LEGACY_MENU === 'true',
    groupLegacy: process.env.XBOT_AI_GROUP_LEGACY_ENABLED === 'true'
  };
}

function createTelegramAiMenuHandlers({
  bot,
  getLang = async msg => msg?.from?.language_code,
  discoverCatalog = async () => buildAuthoritativeCatalog(),
  dashboardLink = async () => '/xBot/?section=providers',
  conversationService = new AiConversationService(),
  retryMessage = null,
  callbackStore = new TelegramCallbackStore(),
  featureFlags = flagsFromEnv()
} = {}) {
  const currentConversation = new Map();
  const currentRoute = new Map();
  const catalogByTenant = new Map();

  const language = async subject => String(await getLang(subject) || subject?.from?.language_code || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en';
  const tenantOf = subject => String(subject?.from?.id || '');
  const chatOf = subject => String(subject?.chat?.id || subject?.message?.chat?.id || '');
  const isPrivate = subject => (subject?.chat?.type || subject?.message?.chat?.type) === 'private';
  const text = (lang, key) => COPY[lang]?.[key] || COPY.en[key] || key;

  async function send(msg, body, options = {}) {
    return bot.sendMessage(msg.chat.id, body, { parse_mode: 'HTML', disable_web_page_preview: true, ...options });
  }

  async function loadCatalog(tenantId) {
    const raw = await discoverCatalog(tenantId);
    const catalog = raw?.revision ? raw : buildAuthoritativeCatalog(raw || {});
    catalogByTenant.set(tenantId, catalog);
    if (!currentRoute.get(tenantId) || ![...catalog.models, ...catalog.combos].some(item => item.id === currentRoute.get(tenantId))) {
      currentRoute.set(tenantId, catalog.selectedRoute || '');
    }
    return catalog;
  }

  async function ensureConversation(tenantId, key = '') {
    let id = currentConversation.get(tenantId);
    if (id && await conversationService.getConversation({ tenantId, conversationId: id })) return id;
    const created = await conversationService.newConversation({ tenantId, routeRef: currentRoute.get(tenantId) || '', idempotencyKey: key });
    currentConversation.set(tenantId, created.id);
    return created.id;
  }

  async function getChatContext(tenantId) {
    const normalizedTenant = String(tenantId || '');
    if (!normalizedTenant) return null;
    const conversationId = await ensureConversation(normalizedTenant);
    return {
      tenantId: normalizedTenant,
      conversationId,
      routeRef: currentRoute.get(normalizedTenant) || ''
    };
  }

  async function showModelMenu(msg, lang, page = 0) {
    const tenantId = tenantOf(msg);
    const catalog = await loadCatalog(tenantId);
    const routes = [...catalog.models.map(item => ({ ...item, kind: 'model' })), ...catalog.combos.map(item => ({ ...item, kind: 'combo' }))];
    if (!routes.length) {
      const url = await dashboardLink({ userId: tenantId, chatId: chatOf(msg), section: 'providers' });
      return send(msg, text(lang, 'noRoute'), { reply_markup: { inline_keyboard: [[{ text: '⚙️ 9Router', url }]] } });
    }
    const pageSize = 12;
    const maxPage = Math.max(0, Math.ceil(routes.length / pageSize) - 1);
    const currentPage = Math.max(0, Math.min(maxPage, Number(page) || 0));
    const buttons = routes.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(route => [{
      text: `${route.id === currentRoute.get(tenantId) ? '✓ ' : ''}${route.name || route.label || route.id}`.slice(0, 60),
      callback_data: callbackStore.issue({ action: 'select', userId: tenantId, chatId: chatOf(msg), revision: catalog.revision, payload: { route: route.id }, mutation: true })
    }]);
    if (maxPage > 0) {
      buttons.push([
        ...(currentPage > 0 ? [{ text: '‹', callback_data: callbackStore.issue({ action: 'page', userId: tenantId, chatId: chatOf(msg), revision: catalog.revision, payload: { page: currentPage - 1 } }) }] : []),
        { text: `${currentPage + 1}/${maxPage + 1}`, callback_data: callbackStore.issue({ action: 'page', userId: tenantId, chatId: chatOf(msg), revision: catalog.revision, payload: { page: currentPage } }) },
        ...(currentPage < maxPage ? [{ text: '›', callback_data: callbackStore.issue({ action: 'page', userId: tenantId, chatId: chatOf(msg), revision: catalog.revision, payload: { page: currentPage + 1 } }) }] : [])
      ]);
    }
    buttons.push([{ text: text(lang, 'close'), callback_data: callbackStore.issue({ action: 'close', userId: tenantId, chatId: chatOf(msg) }) }]);
    const sent = await send(msg, `${escapeTelegramHtml(text(lang, 'models'))}\n\n<b>${escapeTelegramHtml(text(lang, 'current'))}:</b> <code>${escapeTelegramHtml(currentRoute.get(tenantId) || '—')}</code>`, { reply_markup: { inline_keyboard: buttons } });
    for (const row of buttons) for (const button of row) callbackStore.bindMessage(button.callback_data, sent.message_id);
    return sent;
  }

  async function handleCommand(msg) {
    if (!featureFlags.telegramUi) return false;
    const command = resolveTelegramAiCommand(msg?.text || msg?.caption);
    if (!command) return false;
    const lang = await language(msg);
    if (!isPrivate(msg)) {
      if (featureFlags.groupLegacy) return false;
      await send(msg, text(lang, 'privateOnly'));
      return true;
    }
    const tenantId = tenantOf(msg);
    if (command.name === 'help') {
      const lines = TELEGRAM_AI_COMMANDS.map(item => `<code>/${item.name}</code> — ${escapeTelegramHtml(item.description[lang] || item.description.en)}`);
      await send(msg, `<b>${escapeTelegramHtml(text(lang, 'help'))}</b>\n\n${lines.join('\n')}`);
    } else if (command.name === 'new') {
      const catalog = await loadCatalog(tenantId);
      const created = await conversationService.newConversation({ tenantId, routeRef: currentRoute.get(tenantId) || catalog.selectedRoute, idempotencyKey: `telegram:${msg.message_id || Date.now()}` });
      currentConversation.set(tenantId, created.id);
      await send(msg, `${escapeTelegramHtml(text(lang, 'new'))}\n<b>${escapeTelegramHtml(text(lang, 'current'))}:</b> <code>${escapeTelegramHtml(created.routeRef || '—')}</code>`);
    } else if (command.name === 'model') {
      await showModelMenu(msg, lang);
    } else if (command.name === 'providers') {
      const url = await dashboardLink({ userId: tenantId, chatId: chatOf(msg), section: 'providers' });
      await send(msg, escapeTelegramHtml(text(lang, 'providers')), { reply_markup: { inline_keyboard: [[{ text: '⚙️ 9Router', url }]] } });
    } else if (command.name === 'status') {
      const catalog = await loadCatalog(tenantId);
      await send(msg, `<b>${escapeTelegramHtml(text(lang, 'status'))}</b>\n${catalog.providers.length} provider(s) · ${catalog.models.length} model(s) · ${catalog.combos.length} combo(s)\n<b>${escapeTelegramHtml(text(lang, 'current'))}:</b> <code>${escapeTelegramHtml(currentRoute.get(tenantId) || '—')}</code>\nQuota: unavailable`);
    } else if (command.name === 'history') {
      const conversations = await conversationService.listConversations({ tenantId, limit: 10 });
      await send(msg, conversations.length ? conversations.map((item, index) => `${index + 1}. <code>${escapeTelegramHtml(item.id)}</code>`).join('\n') : text(lang, 'history'));
    } else if (command.name === 'stop') {
      const conversationId = currentConversation.get(tenantId);
      const active = conversationId && conversationService.getActiveGeneration({ tenantId, conversationId });
      if (!active) await send(msg, text(lang, 'stop'));
      else { await conversationService.stopGeneration({ tenantId, generationId: active.id }); await send(msg, text(lang, 'stopped')); }
    } else if (command.name === 'retry') {
      const conversationId = await ensureConversation(tenantId);
      try {
        const retry = await conversationService.retryLatest({ tenantId, conversationId });
        if (typeof retryMessage !== 'function') throw new Error('Retry unavailable');
        if (retry.routeRef) currentRoute.set(tenantId, retry.routeRef);
        await send(msg, '↻');
        await retryMessage(msg, retry.prompt, retry.routeRef);
      }
      catch { await send(msg, text(lang, 'retry')); }
    }
    return true;
  }

  async function handleCallback(query) {
    if (!featureFlags.telegramUi || !String(query?.data || '').startsWith('xa1:')) return false;
    const lang = await language(query);
    const tenantId = tenantOf(query);
    const catalog = catalogByTenant.get(tenantId);
    const result = callbackStore.consume(query.data, { userId: tenantId, chatId: chatOf(query), messageId: query.message?.message_id, revision: catalog?.revision });
    if (!result.ok) {
      await bot.answerCallbackQuery(query.id, { text: text(lang, 'stale'), show_alert: result.code === 'WRONG_USER' });
      return true;
    }
    const { action, payload } = result.entry;
    if (action === 'select') {
      const fresh = await loadCatalog(tenantId);
      if (fresh.revision !== result.entry.revision || ![...fresh.models, ...fresh.combos].some(item => item.id === payload?.route)) {
        await bot.answerCallbackQuery(query.id, { text: text(lang, 'stale'), show_alert: true });
        return true;
      }
      currentRoute.set(tenantId, payload.route);
      await bot.answerCallbackQuery(query.id, { text: text(lang, 'selected') });
      await bot.editMessageText(`${escapeTelegramHtml(text(lang, 'selected'))}: <code>${escapeTelegramHtml(payload.route)}</code>`, { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'HTML' });
    } else if (action === 'close') {
      await bot.answerCallbackQuery(query.id);
      await bot.editMessageText('✓', { chat_id: query.message.chat.id, message_id: query.message.message_id });
    } else if (action === 'page') {
      await bot.answerCallbackQuery(query.id);
      await showModelMenu({ ...query.message, from: query.from }, lang, payload?.page);
    }
    return true;
  }

  return {
    commandRegistry: TELEGRAM_AI_COMMANDS,
    getChatContext,
    handleCallback,
    handleCommand,
    showModelMenu,
    state: { currentConversation, currentRoute }
  };
}

module.exports = { COPY, createTelegramAiMenuHandlers, flagsFromEnv };
