'use strict';

const crypto = require('crypto');
const { AI_VISIBLE_COMMANDS } = require('../core/aiCommandPolicy');

const TELEGRAM_AI_COMMANDS = Object.freeze([
  { name: 'chat', aliases: ['ai'], description: { en: 'Open Chat AI or send a prompt', vi: 'Mở Chat AI hoặc gửi câu hỏi' } },
  { name: 'new', aliases: [], description: { en: 'Start a fresh conversation', vi: 'Bắt đầu cuộc trò chuyện mới' } },
  { name: 'model', aliases: ['models'], description: { en: 'Choose an available model', vi: 'Chọn model khả dụng' } },
  { name: 'stop', aliases: [], description: { en: 'Stop the active response', vi: 'Dừng phản hồi đang chạy' } },
  { name: 'retry', aliases: [], description: { en: 'Retry an interrupted turn', vi: 'Thử lại lượt bị gián đoạn' } },
  { name: 'history', aliases: [], description: { en: 'Browse private chat history', vi: 'Xem lịch sử trò chuyện riêng' } },
  { name: 'status', aliases: [], description: { en: 'Show Chat AI status', vi: 'Xem trạng thái Chat AI' } },
  { name: 'providers', aliases: [], description: { en: 'Show 9Router providers', vi: 'Xem nhà cung cấp 9Router' } }
]);

if (TELEGRAM_AI_COMMANDS.some((item, index) => item.name !== AI_VISIBLE_COMMANDS[index])) {
  throw new Error('Telegram AI command policy mismatch');
}

const COMMAND_BY_NAME = new Map();
for (const command of TELEGRAM_AI_COMMANDS) {
  COMMAND_BY_NAME.set(command.name, command);
  for (const alias of command.aliases) COMMAND_BY_NAME.set(alias, command);
}
COMMAND_BY_NAME.set('api', { name: 'api', aliases: [], description: { en: '', vi: '' } });
COMMAND_BY_NAME.set('cancel', { name: 'cancel', aliases: [], description: { en: '', vi: '' } });

function parseTelegramAiCommand(text) {
  const match = String(text || '').trim().match(/^\/([a-z]+)(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  const command = COMMAND_BY_NAME.get(match[1].toLowerCase());
  return command ? { ...command, invokedAs: match[1].toLowerCase(), prompt: String(match[2] || '').trim() } : null;
}

function resolveTelegramAiCommand(text) {
  const parsed = parseTelegramAiCommand(text);
  return parsed ? COMMAND_BY_NAME.get(parsed.name) : null;
}

function stableRevision(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function buildAuthoritativeCatalog({ providers = [], models = [], combos = [], selectedRoute = '', recentRoutes = [], error = '' } = {}) {
  const normalizedProviders = providers.map(provider => ({ ...provider, id: String(provider.id || '') })).filter(provider => provider.id);
  const routable = normalizedProviders.filter(provider => provider.connected === true && provider.routable !== false && !['error', 'unavailable', 'disconnected', 'needs_action'].includes(String(provider.status || '').toLowerCase()));
  const routableIds = new Set(routable.map(provider => provider.id));
  const allowedModels = models.filter(model => routableIds.has(String(model.providerId || model.provider || '').split('/')[0])).map(model => ({ ...model, id: String(model.id || '') })).filter(model => model.id);
  const modelIds = new Set(allowedModels.map(model => model.id));
  const allowedCombos = combos.filter(combo => Array.isArray(combo.models) && combo.models.length > 0 && combo.models.every(id => modelIds.has(String(id)))).map(combo => ({ ...combo, id: String(combo.id || '') }));
  const routeIds = new Set([...modelIds, ...allowedCombos.map(combo => combo.id)]);
  const requestedRoute = String(selectedRoute || '');
  const normalized = {
    providers: normalizedProviders,
    models: allowedModels,
    combos: allowedCombos,
    selectedRoute: requestedRoute,
    selectionState: !requestedRoute ? 'not_selected' : routeIds.has(requestedRoute) ? 'available' : 'stale',
    recentRoutes: [...new Set((recentRoutes || []).map(String))].filter(id => routeIds.has(id)),
    error: String(error || '')
  };
  return Object.freeze({ ...normalized, revision: stableRevision(normalized) });
}

function escapeTelegramHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function splitTelegramHtml(value, maxChars = 3500) {
  const text = String(value ?? '');
  const limit = Math.max(1, Math.min(4000, Number(maxChars) || 3500));
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let index = limit;
    while (index > 0 && /[\uDC00-\uDFFF]/.test(rest[index])) index -= 1;
    const window = rest.slice(0, index);
    const boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '));
    if (boundary >= Math.floor(limit * 0.55)) index = boundary + 1;
    chunks.push(rest.slice(0, index));
    rest = rest.slice(index);
  }
  if (rest || chunks.length === 0) chunks.push(rest);
  return chunks;
}

module.exports = { TELEGRAM_AI_COMMANDS, buildAuthoritativeCatalog, escapeTelegramHtml, parseTelegramAiCommand, resolveTelegramAiCommand, splitTelegramHtml, stableRevision };
