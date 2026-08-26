'use strict';

const {
  TELEGRAM_AI_COMMANDS,
  buildAuthoritativeCatalog,
  escapeTelegramHtml,
  parseTelegramAiCommand
} = require('../services/aiChatContracts');
const { AiConversationService } = require('../services/aiConversationService');
const { TelegramCallbackStore } = require('../services/telegramCallbackStore');

const COPY = {
  en: {
    privateOnly: 'Open Chat AI privately to protect your personal state.', openPrivate: 'Open private chat',
    center: 'Chat AI', conversation: 'Conversation', unnamed: 'New conversation', model: 'Model', provider: 'Provider', messages: 'Messages', state: 'State',
    notSelected: 'Not selected', staleRoute: 'stale / unavailable', idle: 'Idle', generating: 'Thinking / Responding', stopping: 'Stopping…', interrupted: 'Interrupted', retryable: 'Retry available', completed: 'Completed', error: 'Error',
    newChat: 'New chat', changeModel: 'Change model', history: 'History', status: 'Status', providers: 'Providers', help: 'Help', stop: 'Stop', retry: 'Retry',
    newReady: 'New conversation ready. Your previous chat remains in history.', noHistory: 'No private conversations yet.', historyTitle: 'Conversation history', resume: 'Resume', back: 'Back',
    modelsTitle: 'Choose a model', current: 'Current', recent: 'Recent', search: 'Search', cancel: 'Cancel', searchPrompt: 'Send a model, provider, alias, or capability to search.', noResults: 'No authoritative matches.',
    providerStatus: 'Providers', connected: 'connected', zeroModels: 'connected · 0 models', needsAction: 'needs action', unavailable: 'unavailable', discoveryError: 'discovery error', refresh: 'Refresh', secureSetup: 'Secure setup',
    helpIntro: 'Ask with /chat <prompt>. Personal models, providers, and history stay private.', modelsHelp: 'Models / providers', privacy: 'Privacy', allCommands: 'All commands',
    stale: 'This menu expired or was updated.', openMenu: 'Open new menu', selected: 'Model selected', stopped: 'Stopping. Partial output will be preserved.', noActive: 'No active response to stop.', noRetry: 'No retryable interrupted turn.',
    details: 'Conversation details'
  },
  vi: {
    privateOnly: 'Mở Chat AI riêng tư để bảo vệ trạng thái cá nhân.', openPrivate: 'Mở chat riêng',
    center: 'Chat AI', conversation: 'Cuộc trò chuyện', unnamed: 'Cuộc trò chuyện mới', model: 'Model', provider: 'Nhà cung cấp', messages: 'Tin nhắn', state: 'Trạng thái',
    notSelected: 'Chưa chọn', staleRoute: 'đã cũ / không khả dụng', idle: 'Sẵn sàng', generating: 'Đang suy nghĩ / phản hồi', stopping: 'Đang dừng…', interrupted: 'Bị gián đoạn', retryable: 'Có thể thử lại', completed: 'Đã hoàn tất', error: 'Lỗi',
    newChat: 'Chat mới', changeModel: 'Đổi model', history: 'Lịch sử', status: 'Trạng thái', providers: 'Nhà cung cấp', help: 'Trợ giúp', stop: 'Dừng', retry: 'Thử lại',
    newReady: 'Cuộc trò chuyện mới đã sẵn sàng. Chat trước vẫn còn trong lịch sử.', noHistory: 'Chưa có cuộc trò chuyện riêng.', historyTitle: 'Lịch sử trò chuyện', resume: 'Tiếp tục', back: 'Quay lại',
    modelsTitle: 'Chọn model', current: 'Hiện tại', recent: 'Gần đây', search: 'Tìm kiếm', cancel: 'Hủy', searchPrompt: 'Gửi tên model, nhà cung cấp, bí danh hoặc khả năng để tìm.', noResults: 'Không có kết quả chính thức.',
    providerStatus: 'Nhà cung cấp', connected: 'đã kết nối', zeroModels: 'đã kết nối · 0 model', needsAction: 'cần thao tác', unavailable: 'không khả dụng', discoveryError: 'lỗi khám phá', refresh: 'Làm mới', secureSetup: 'Thiết lập an toàn',
    helpIntro: 'Hỏi bằng /chat <nội dung>. Model, nhà cung cấp và lịch sử cá nhân luôn ở chat riêng.', modelsHelp: 'Model / nhà cung cấp', privacy: 'Riêng tư', allCommands: 'Tất cả lệnh',
    stale: 'Menu này đã hết hạn hoặc được cập nhật.', openMenu: 'Mở menu mới', selected: 'Đã chọn model', stopped: 'Đang dừng. Nội dung một phần sẽ được giữ lại.', noActive: 'Không có phản hồi đang chạy.', noRetry: 'Không có lượt gián đoạn để thử lại.',
    details: 'Chi tiết cuộc trò chuyện'
  }
};

function flagsFromEnv() {
  return { telegramUi: process.env.XBOT_TELEGRAM_CHAT_9R_UI !== 'false', legacyMenu: process.env.XBOT_AI_LEGACY_MENU === 'true', groupLegacy: process.env.XBOT_AI_GROUP_LEGACY_ENABLED === 'true' };
}

function createTelegramAiMenuHandlers({
  bot,
  getLang = async msg => msg?.from?.language_code,
  discoverCatalog = async () => buildAuthoritativeCatalog(),
  dashboardLink = async () => '/xBot/?section=providers',
  conversationService = new AiConversationService(),
  retryMessage = null,
  promptMessage = null,
  callbackStore = new TelegramCallbackStore(),
  botUsername = '',
  featureFlags = flagsFromEnv(),
  now = Date.now
} = {}) {
  const currentConversation = new Map();
  const currentRoute = new Map();
  const catalogByTenant = new Map();
  const lifecycle = new Map();
  const searchState = new Map();
  const SEARCH_TTL_MS = 2 * 60 * 1000;

  const language = async subject => String(await getLang(subject) || subject?.from?.language_code || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en';
  const tenantOf = subject => String(subject?.from?.id || '');
  const chatOf = subject => String(subject?.chat?.id || subject?.message?.chat?.id || '');
  const isPrivate = subject => (subject?.chat?.type || subject?.message?.chat?.type) === 'private';
  const text = (lang, key) => COPY[lang]?.[key] || COPY.en[key] || key;
  const buttonText = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60);

  function issue(action, subject, revision = '', payload = {}, mutation = false) {
    return callbackStore.issue({ action, userId: tenantOf(subject), chatId: chatOf(subject), revision, payload, mutation });
  }

  function bindKeyboard(keyboard, messageId) {
    for (const row of keyboard || []) for (const button of row) if (button.callback_data) callbackStore.bindMessage(button.callback_data, messageId);
  }

  async function send(msg, body, options = {}) {
    const sent = await bot.sendMessage(msg.chat.id, body, { parse_mode: 'HTML', disable_web_page_preview: true, ...options });
    bindKeyboard(options.reply_markup?.inline_keyboard, sent?.message_id);
    return sent;
  }

  function editFailureIsReplaceable(error) {
    return /message is not modified|message to edit not found|message can't be edited|message_id_invalid|query is too old/i.test(String(error?.response?.body?.description || error?.message || ''));
  }

  async function editOrReplace(subject, body, options = {}) {
    const chatId = subject.message?.chat?.id || subject.chat?.id;
    const messageId = subject.message?.message_id || subject.message_id;
    try {
      await bot.editMessageText(body, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', disable_web_page_preview: true, ...options });
      bindKeyboard(options.reply_markup?.inline_keyboard, messageId);
      return { message_id: messageId, chat: { id: chatId } };
    } catch (error) {
      if (!editFailureIsReplaceable(error)) throw error;
      return send({ chat: { id: chatId } }, body, options);
    }
  }

  async function loadCatalog(tenantId) {
    try {
      const raw = await discoverCatalog(tenantId);
      const catalog = raw?.revision ? raw : buildAuthoritativeCatalog(raw || {});
      catalogByTenant.set(tenantId, catalog);
      if (!currentRoute.has(tenantId)) currentRoute.set(tenantId, catalog.selectedRoute || '');
      return catalog;
    } catch (error) {
      const catalog = buildAuthoritativeCatalog({ error: 'DISCOVERY_ERROR', selectedRoute: currentRoute.get(tenantId) || '' });
      catalogByTenant.set(tenantId, catalog);
      return catalog;
    }
  }

  async function ensureConversation(tenantId, key = '') {
    let id = currentConversation.get(tenantId);
    if (id && await conversationService.getConversation({ tenantId, conversationId: id })) return id;
    const persisted = await conversationService.listConversations({ tenantId, limit: 1 });
    if (persisted[0]?.id) {
      const restored = await conversationService.resumeConversation({ tenantId, conversationId: persisted[0].id });
      currentConversation.set(tenantId, restored.id);
      if (restored.routeRef) currentRoute.set(tenantId, restored.routeRef);
      return restored.id;
    }
    const created = await conversationService.newConversation({ tenantId, routeRef: currentRoute.get(tenantId) || '', idempotencyKey: key });
    currentConversation.set(tenantId, created.id);
    return created.id;
  }

  async function currentConversationData(tenantId) {
    const id = await ensureConversation(tenantId);
    return conversationService.getConversation({ tenantId, conversationId: id });
  }

  async function getChatContext(tenantId) {
    const normalizedTenant = String(tenantId || '');
    if (!normalizedTenant) return null;
    const conversationId = await ensureConversation(normalizedTenant);
    return { tenantId: normalizedTenant, conversationId, routeRef: currentRoute.get(normalizedTenant) || '' };
  }

  function routeMeta(catalog, routeRef) {
    const route = [...catalog.models, ...catalog.combos].find(item => item.id === routeRef);
    const provider = route ? catalog.providers.find(item => item.id === String(route.providerId || route.provider || '').split('/')[0]) : null;
    return { route, provider };
  }

  function controlKeyboard(subject, lang, status, revision) {
    const action = (label, name) => ({ text: label, callback_data: issue(name, subject, revision, {}, ['new', 'stop', 'retry'].includes(name)) });
    if (status === 'generating') return [[action(`⏹ ${text(lang, 'stop')}`, 'stop')]];
    if (status === 'stopping') return [[action(`⏳ ${text(lang, 'stopping')}`, 'refresh_center')]];
    const rows = [];
    if (['interrupted', 'retryable'].includes(status)) rows.push([action(`↻ ${text(lang, 'retry')}`, 'retry'), action(`＋ ${text(lang, 'newChat')}`, 'new')]);
    else rows.push([action(`＋ ${text(lang, 'newChat')}`, 'new'), action(`🧠 ${text(lang, 'changeModel')}`, 'models')]);
    if (['interrupted', 'retryable', 'error'].includes(status)) rows.push([action(`🧠 ${text(lang, 'changeModel')}`, 'models'), action(`🕘 ${text(lang, 'history')}`, 'history')]);
    else rows.push([action(`🕘 ${text(lang, 'history')}`, 'history'), action(`📊 ${text(lang, 'status')}`, 'status')]);
    if (!['interrupted', 'retryable', 'error', 'completed'].includes(status)) rows.push([action(`🔌 ${text(lang, 'providers')}`, 'providers'), action(`❔ ${text(lang, 'help')}`, 'help')]);
    else if (status !== 'completed') rows.push([action(`📊 ${text(lang, 'status')}`, 'status')]);
    return rows;
  }

  async function showControlCenter(msg, lang, edit = false) {
    const tenantId = tenantOf(msg);
    const catalog = await loadCatalog(tenantId);
    const conversation = await currentConversationData(tenantId);
    const active = conversation?.id ? conversationService.getActiveGeneration({ tenantId, conversationId: conversation.id }) : null;
    const latest = conversation?.id ? conversationService.getLatestGeneration?.({ tenantId, conversationId: conversation.id }) : null;
    const state = lifecycle.get(tenantId) || (active ? { status: 'generating' } : latest ? { status: latest.status, retryable: latest.retryable } : { status: 'idle' });
    const status = state.retryable && ['stopped', 'interrupted'].includes(state.status) ? 'retryable' : (state.status || 'idle');
    const routeRef = currentRoute.get(tenantId) || catalog.selectedRoute || '';
    const meta = routeMeta(catalog, routeRef);
    const routeState = !routeRef ? text(lang, 'notSelected') : meta.route ? (meta.route.label || meta.route.name || meta.route.id) : `${routeRef} · ${text(lang, 'staleRoute')}`;
    const providerState = meta.provider ? `${meta.provider.name || meta.provider.id} · ${text(lang, 'connected')}` : (catalog.error ? text(lang, 'discoveryError') : '—');
    const count = Array.isArray(conversation?.turns) ? conversation.turns.length : null;
    const body = `<b>🤖 ${escapeTelegramHtml(text(lang, 'center'))}</b>\n` +
      `<b>${escapeTelegramHtml(text(lang, 'conversation'))}:</b> ${escapeTelegramHtml(conversation?.title || text(lang, 'unnamed'))}\n` +
      `<b>${escapeTelegramHtml(text(lang, 'model'))}:</b> ${escapeTelegramHtml(routeState)}\n` +
      `<b>${escapeTelegramHtml(text(lang, 'provider'))}:</b> ${escapeTelegramHtml(providerState)}\n` +
      (count == null ? '' : `<b>${escapeTelegramHtml(text(lang, 'messages'))}:</b> ${count}\n`) +
      `<b>${escapeTelegramHtml(text(lang, 'state'))}:</b> ${escapeTelegramHtml(text(lang, status))}`;
    const options = { reply_markup: { inline_keyboard: controlKeyboard(msg, lang, status, catalog.revision) } };
    return edit ? editOrReplace(msg, body, options) : send(msg, body, options);
  }

  function providerCount(catalog, providerId) {
    return catalog.models.filter(model => String(model.providerId || model.provider || '').split('/')[0] === providerId).length;
  }

  async function showModelMenu(msg, lang, providerId = '', page = 0, edit = false, routesOverride = null) {
    const tenantId = tenantOf(msg);
    const catalog = catalogByTenant.get(tenantId) || await loadCatalog(tenantId);
    let body;
    let buttons = [];
    if (!providerId && !routesOverride) {
      body = `<b>🧠 ${escapeTelegramHtml(text(lang, 'modelsTitle'))}</b>\n<b>${escapeTelegramHtml(text(lang, 'current'))}:</b> ${escapeTelegramHtml(currentRoute.get(tenantId) || text(lang, 'notSelected'))}`;
      if (catalog.recentRoutes.length) body += `\n<b>${escapeTelegramHtml(text(lang, 'recent'))}:</b> ${catalog.recentRoutes.map(escapeTelegramHtml).join(', ')}`;
      for (const provider of catalog.providers) {
        const count = providerCount(catalog, provider.id);
        const status = provider.connected !== true ? text(lang, 'unavailable') : provider.routable === false ? text(lang, 'needsAction') : count ? String(count) : text(lang, 'zeroModels');
        buttons.push([{ text: buttonText(`${provider.name || provider.id} (${status})`), callback_data: issue('provider_models', msg, catalog.revision, { providerId: provider.id }) }]);
      }
      buttons.push([{ text: `🔎 ${text(lang, 'search')}`, callback_data: issue('search', msg, catalog.revision) }, { text: `‹ ${text(lang, 'back')}`, callback_data: issue('center', msg, catalog.revision) }]);
    } else {
      const routes = routesOverride || catalog.models.filter(model => String(model.providerId || model.provider || '').split('/')[0] === providerId);
      const pageSize = 8;
      const maxPage = Math.max(0, Math.ceil(routes.length / pageSize) - 1);
      const currentPage = Math.max(0, Math.min(maxPage, Number(page) || 0));
      body = `<b>🧠 ${escapeTelegramHtml(text(lang, 'modelsTitle'))}</b>\n${escapeTelegramHtml(routesOverride ? text(lang, 'search') : (catalog.providers.find(item => item.id === providerId)?.name || providerId))}`;
      if (routesOverride && routes.length) body += `\n\n${routes.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(route => `• ${escapeTelegramHtml(route.label || route.name || route.id)}`).join('\n')}`;
      buttons = routes.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(route => [{
        text: buttonText(`${route.id === currentRoute.get(tenantId) ? '✓ ' : ''}${route.label || route.name || route.id}`),
        callback_data: issue('select', msg, catalog.revision, { route: route.id }, true)
      }]);
      if (!routes.length) body += `\n\n${escapeTelegramHtml(text(lang, 'noResults'))}`;
      if (maxPage > 0) buttons.push([
        ...(currentPage > 0 ? [{ text: '‹', callback_data: issue('provider_models', msg, catalog.revision, { providerId, page: currentPage - 1 }) }] : []),
        { text: `${currentPage + 1}/${maxPage + 1}`, callback_data: issue('provider_models', msg, catalog.revision, { providerId, page: currentPage }) },
        ...(currentPage < maxPage ? [{ text: '›', callback_data: issue('provider_models', msg, catalog.revision, { providerId, page: currentPage + 1 }) }] : [])
      ]);
      buttons.push([{ text: `‹ ${text(lang, 'back')}`, callback_data: issue('models', msg, catalog.revision) }]);
    }
    const options = { reply_markup: { inline_keyboard: buttons } };
    return edit ? editOrReplace(msg, body, options) : send(msg, body, options);
  }

  async function showHistory(msg, lang, page = 0, edit = false) {
    const tenantId = tenantOf(msg);
    const items = await conversationService.listConversations({ tenantId, limit: 50 });
    const pageSize = 8;
    const maxPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
    const currentPage = Math.max(0, Math.min(maxPage, Number(page) || 0));
    const buttons = items.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(item => [{ text: buttonText(item.title || item.id), callback_data: issue('history_open', msg, '', { conversationId: item.id }) }]);
    if (maxPage > 0) buttons.push([{ text: '‹', callback_data: issue('history', msg, '', { page: Math.max(0, currentPage - 1) }) }, { text: `${currentPage + 1}/${maxPage + 1}`, callback_data: issue('history', msg, '', { page: currentPage }) }, { text: '›', callback_data: issue('history', msg, '', { page: Math.min(maxPage, currentPage + 1) }) }]);
    buttons.push([{ text: `‹ ${text(lang, 'back')}`, callback_data: issue('center', msg) }]);
    const body = `<b>🕘 ${escapeTelegramHtml(text(lang, 'historyTitle'))}</b>\n\n${items.length ? `${items.length} ${escapeTelegramHtml(text(lang, 'conversation').toLowerCase())}` : escapeTelegramHtml(text(lang, 'noHistory'))}`;
    const options = { reply_markup: { inline_keyboard: buttons } };
    return edit ? editOrReplace(msg, body, options) : send(msg, body, options);
  }

  async function showHistoryDetails(msg, lang, conversationId) {
    const tenantId = tenantOf(msg);
    const item = await conversationService.getConversation({ tenantId, conversationId });
    if (!item) return showHistory(msg, lang, 0, true);
    const count = Array.isArray(item.turns) ? item.turns.length : null;
    const body = `<b>${escapeTelegramHtml(text(lang, 'details'))}</b>\n${escapeTelegramHtml(item.title || text(lang, 'unnamed'))}` +
      (count == null ? '' : `\n<b>${escapeTelegramHtml(text(lang, 'messages'))}:</b> ${count}`) +
      (item.routeRef ? `\n<b>${escapeTelegramHtml(text(lang, 'model'))}:</b> ${escapeTelegramHtml(item.routeRef)}` : '');
    return editOrReplace(msg, body, { reply_markup: { inline_keyboard: [[{ text: `▶ ${text(lang, 'resume')}`, callback_data: issue('history_resume', msg, '', { conversationId }, true) }], [{ text: `‹ ${text(lang, 'back')}`, callback_data: issue('history', msg) }]] } });
  }

  async function showProviders(msg, lang, edit = false) {
    const tenantId = tenantOf(msg);
    const catalog = await loadCatalog(tenantId);
    const lines = catalog.providers.map(provider => {
      const count = providerCount(catalog, provider.id);
      let status = provider.connected !== true ? text(lang, 'unavailable') : provider.routable === false ? text(lang, 'needsAction') : count ? `${text(lang, 'connected')} · ${count}` : text(lang, 'zeroModels');
      if (String(provider.status).toLowerCase() === 'error') status = text(lang, 'discoveryError');
      return `• ${escapeTelegramHtml(provider.name || provider.id)} — ${escapeTelegramHtml(status)}`;
    });
    if (catalog.error) lines.push(`• ${escapeTelegramHtml(text(lang, 'discoveryError'))}`);
    const url = await dashboardLink({ userId: tenantId, chatId: chatOf(msg), section: 'providers' });
    const keyboard = [[{ text: `🔐 ${text(lang, 'secureSetup')}`, url }], [{ text: `↻ ${text(lang, 'refresh')}`, callback_data: issue('providers', msg, catalog.revision) }, { text: `‹ ${text(lang, 'back')}`, callback_data: issue('center', msg, catalog.revision) }]];
    const body = `<b>🔌 ${escapeTelegramHtml(text(lang, 'providerStatus'))}</b>\n\n${lines.join('\n') || escapeTelegramHtml(text(lang, 'unavailable'))}`;
    return edit ? editOrReplace(msg, body, { reply_markup: { inline_keyboard: keyboard } }) : send(msg, body, { reply_markup: { inline_keyboard: keyboard } });
  }

  async function showStatus(msg, lang, edit = false) {
    const tenantId = tenantOf(msg);
    const catalog = await loadCatalog(tenantId);
    const conversation = await currentConversationData(tenantId);
    const active = conversation?.id && conversationService.getActiveGeneration({ tenantId, conversationId: conversation.id });
    const route = currentRoute.get(tenantId) || catalog.selectedRoute || '';
    const routeState = routeMeta(catalog, route).route ? route : route ? `${route} · ${text(lang, 'staleRoute')}` : text(lang, 'notSelected');
    const connected = catalog.providers.filter(item => item.connected === true && item.routable !== false).length;
    const body = `<b>📊 ${escapeTelegramHtml(text(lang, 'status'))}</b>\n${connected}/${catalog.providers.length} ${escapeTelegramHtml(text(lang, 'provider').toLowerCase())} · ${catalog.models.length} model\n<b>${escapeTelegramHtml(text(lang, 'model'))}:</b> ${escapeTelegramHtml(routeState)}\n<b>${escapeTelegramHtml(text(lang, 'conversation'))}:</b> ${escapeTelegramHtml(conversation ? text(lang, 'connected') : text(lang, 'notSelected'))}\n<b>${escapeTelegramHtml(text(lang, 'state'))}:</b> ${escapeTelegramHtml(active ? text(lang, 'generating') : text(lang, lifecycle.get(tenantId)?.status || 'idle'))}`;
    const keyboard = [[{ text: `↻ ${text(lang, 'refresh')}`, callback_data: issue('status', msg, catalog.revision) }, { text: `‹ ${text(lang, 'back')}`, callback_data: issue('center', msg, catalog.revision) }]];
    return edit ? editOrReplace(msg, body, { reply_markup: { inline_keyboard: keyboard } }) : send(msg, body, { reply_markup: { inline_keyboard: keyboard } });
  }

  async function showHelp(msg, lang, all = false, edit = false) {
    const body = all
      ? `<b>${escapeTelegramHtml(text(lang, 'allCommands'))}</b>\n\n${TELEGRAM_AI_COMMANDS.map(item => `<code>/${item.name}</code> — ${escapeTelegramHtml(item.description[lang] || item.description.en)}`).join('\n')}`
      : `<b>❔ ${escapeTelegramHtml(text(lang, 'help'))}</b>\n\n${escapeTelegramHtml(text(lang, 'helpIntro'))}`;
    const keyboard = all ? [[{ text: `‹ ${text(lang, 'back')}`, callback_data: issue('help', msg) }]] : [
      [{ text: '💬 Chat', callback_data: issue('center', msg) }, { text: `🧠 ${text(lang, 'modelsHelp')}`, callback_data: issue('models', msg) }],
      [{ text: `🕘 ${text(lang, 'history')}`, callback_data: issue('history', msg) }, { text: `🔒 ${text(lang, 'privacy')}`, callback_data: issue('privacy', msg) }],
      [{ text: `📋 ${text(lang, 'allCommands')}`, callback_data: issue('help_all', msg) }]
    ];
    return edit ? editOrReplace(msg, body, { reply_markup: { inline_keyboard: keyboard } }) : send(msg, body, { reply_markup: { inline_keyboard: keyboard } });
  }

  async function createNew(msg, lang, edit = false) {
    const tenantId = tenantOf(msg);
    const catalog = await loadCatalog(tenantId);
    const created = await conversationService.newConversation({ tenantId, routeRef: currentRoute.get(tenantId) || catalog.selectedRoute || '', idempotencyKey: `telegram:${msg.message_id || now()}` });
    currentConversation.set(tenantId, created.id);
    lifecycle.set(tenantId, { status: 'idle', retryable: false });
    const options = { reply_markup: { inline_keyboard: [[{ text: `💬 ${text(lang, 'center')}`, callback_data: issue('center', msg, catalog.revision) }, { text: `🕘 ${text(lang, 'history')}`, callback_data: issue('history', msg, catalog.revision) }]] } };
    return edit ? editOrReplace(msg, escapeTelegramHtml(text(lang, 'newReady')), options) : send(msg, escapeTelegramHtml(text(lang, 'newReady')), options);
  }

  async function handleCommand(msg) {
    if (!featureFlags.telegramUi) return false;
    const sourceText = (Array.isArray(msg?.photo) && msg.photo.length && msg.caption) ? msg.caption : (msg?.text || msg?.caption);
    const command = parseTelegramAiCommand(sourceText);
    if (!command) return false;
    const lang = await language(msg);
    if (command.name === 'chat' && (command.prompt || msg.photo?.length || msg.audio || msg.voice || msg.document)) {
      if (typeof promptMessage !== 'function') return false;
      const legacyText = `/ai${command.prompt ? ` ${command.prompt}` : ''}`;
      const legacy = { ...msg, text: legacyText, caption: msg.caption ? legacyText : msg.caption };
      await promptMessage(legacy);
      return true;
    }
    if (!isPrivate(msg)) {
      if (featureFlags.groupLegacy && command.name === 'chat') return false;
      const keyboard = botUsername && /^[A-Za-z0-9_]{5,32}$/.test(botUsername) ? [[{ text: `🔒 ${text(lang, 'openPrivate')}`, url: `https://t.me/${botUsername}?start=chat` }]] : [];
      await send(msg, escapeTelegramHtml(text(lang, 'privateOnly')), { reply_markup: { inline_keyboard: keyboard } });
      return true;
    }
    if (command.name === 'chat') await showControlCenter(msg, lang);
    else if (command.name === 'new') await createNew(msg, lang);
    else if (command.name === 'model') await showModelMenu(msg, lang);
    else if (command.name === 'providers') await showProviders(msg, lang);
    else if (command.name === 'status') await showStatus(msg, lang);
    else if (command.name === 'history') await showHistory(msg, lang);
    else if (command.name === 'help') await showHelp(msg, lang);
    else if (command.name === 'stop') {
      const tenantId = tenantOf(msg); const conversationId = currentConversation.get(tenantId); const active = conversationId && conversationService.getActiveGeneration({ tenantId, conversationId });
      if (!active) await send(msg, escapeTelegramHtml(text(lang, 'noActive')));
      else { lifecycle.set(tenantId, { status: 'stopping', retryable: false }); await send(msg, escapeTelegramHtml(text(lang, 'stopping'))); await conversationService.stopGeneration({ tenantId, generationId: active.id }); lifecycle.set(tenantId, { status: 'interrupted', retryable: true }); }
    } else if (command.name === 'retry') await retry(msg, lang);
    return true;
  }

  async function retry(msg, lang) {
    const tenantId = tenantOf(msg); const conversationId = await ensureConversation(tenantId);
    try {
      const claimed = await conversationService.retryLatest({ tenantId, conversationId });
      if (typeof retryMessage !== 'function') throw new Error('Retry unavailable');
      if (claimed.routeRef) currentRoute.set(tenantId, claimed.routeRef);
      lifecycle.set(tenantId, { status: 'generating', retryable: false });
      await retryMessage(msg, claimed.prompt, claimed.routeRef);
    } catch { await send({ chat: { id: msg.message?.chat?.id || msg.chat?.id } }, escapeTelegramHtml(text(lang, 'noRetry'))); }
  }

  async function handleText(msg) {
    if (!isPrivate(msg)) return false;
    const tenantId = tenantOf(msg);
    const pending = searchState.get(tenantId);
    if (!pending) return false;
    if (now() > pending.expiresAt) { searchState.delete(tenantId); return false; }
    const query = String(msg.text || '').trim().toLowerCase().slice(0, 100);
    if (!query) return true;
    searchState.delete(tenantId);
    const catalog = await loadCatalog(tenantId);
    const terms = query.split(/\s+/).filter(Boolean);
    const results = catalog.models.filter(model => {
      const provider = catalog.providers.find(item => item.id === String(model.providerId || model.provider || '').split('/')[0]);
      const haystack = [model.id, model.label, model.name, provider?.id, provider?.name, ...(model.aliases || []), ...(model.capabilities || [])].filter(Boolean).join(' ').toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
    const subject = { ...msg, message: { message_id: pending.messageId, chat: { id: pending.chatId, type: 'private' } } };
    await showModelMenu(subject, await language(msg), '__search__', 0, true, results);
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
      const refresh = issue('center', query);
      await editOrReplace(query, `<b>${escapeTelegramHtml(text(lang, 'stale'))}</b>`, { reply_markup: { inline_keyboard: [[{ text: `↻ ${text(lang, 'openMenu')}`, callback_data: refresh }]] } });
      return true;
    }
    const { action, payload } = result.entry;
    if (action !== 'select') await bot.answerCallbackQuery(query.id);
    if (action === 'center' || action === 'refresh_center') await showControlCenter(query, lang, true);
    else if (action === 'models') await showModelMenu(query, lang, '', 0, true);
    else if (action === 'provider_models') await showModelMenu(query, lang, payload?.providerId || '', payload?.page || 0, true);
    else if (action === 'search') {
      searchState.set(tenantId, { chatId: query.message.chat.id, messageId: query.message.message_id, expiresAt: now() + SEARCH_TTL_MS });
      await editOrReplace(query, escapeTelegramHtml(text(lang, 'searchPrompt')), { reply_markup: { inline_keyboard: [[{ text: text(lang, 'cancel'), callback_data: issue('models', query, catalog?.revision) }]] } });
    } else if (action === 'select') {
      const fresh = await loadCatalog(tenantId);
      if (fresh.revision !== result.entry.revision || !fresh.models.some(item => item.id === payload?.route)) return handleStaleSelection(query, lang);
      currentRoute.set(tenantId, payload.route);
      const conversationId = await ensureConversation(tenantId);
      await conversationService.selectConversation?.({ tenantId, conversationId, routeRef: payload.route });
      await bot.answerCallbackQuery(query.id, { text: text(lang, 'selected') });
      await showControlCenter(query, lang, true);
    } else if (action === 'new') await createNew(query, lang, true);
    else if (action === 'history') await showHistory(query, lang, payload?.page || 0, true);
    else if (action === 'history_open') await showHistoryDetails(query, lang, payload?.conversationId);
    else if (action === 'history_resume') {
      const item = await conversationService.resumeConversation({ tenantId, conversationId: payload?.conversationId });
      currentConversation.set(tenantId, item.id); currentRoute.set(tenantId, item.routeRef || ''); lifecycle.set(tenantId, { status: 'idle' }); await showControlCenter(query, lang, true);
    } else if (action === 'status') await showStatus(query, lang, true);
    else if (action === 'providers') await showProviders(query, lang, true);
    else if (action === 'help') await showHelp(query, lang, false, true);
    else if (action === 'help_all') await showHelp(query, lang, true, true);
    else if (action === 'privacy') await editOrReplace(query, escapeTelegramHtml(text(lang, 'privateOnly')), { reply_markup: { inline_keyboard: [[{ text: `‹ ${text(lang, 'back')}`, callback_data: issue('help', query) }]] } });
    else if (action === 'stop') {
      const conversationId = currentConversation.get(tenantId); const active = conversationId && conversationService.getActiveGeneration({ tenantId, conversationId });
      if (active) { lifecycle.set(tenantId, { status: 'stopping' }); await showControlCenter(query, lang, true); await conversationService.stopGeneration({ tenantId, generationId: active.id }); lifecycle.set(tenantId, { status: 'interrupted', retryable: true }); }
    } else if (action === 'retry') await retry(query, lang);
    return true;
  }

  async function handleStaleSelection(query, lang) {
    await bot.answerCallbackQuery(query.id, { text: text(lang, 'stale'), show_alert: true }).catch(() => {});
    return editOrReplace(query, escapeTelegramHtml(text(lang, 'stale')), { reply_markup: { inline_keyboard: [[{ text: `↻ ${text(lang, 'openMenu')}`, callback_data: issue('center', query) }]] } });
  }

  return {
    commandRegistry: TELEGRAM_AI_COMMANDS,
    getChatContext,
    handleCallback,
    handleCommand,
    handleText,
    showControlCenter,
    showModelMenu,
    state: { catalogByTenant, currentConversation, currentRoute, lifecycle, searchState }
  };
}

module.exports = { COPY, createTelegramAiMenuHandlers, flagsFromEnv };
