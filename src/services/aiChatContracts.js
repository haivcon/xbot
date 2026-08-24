'use strict';

const crypto = require('crypto');

const TELEGRAM_AI_COMMANDS = Object.freeze([
  { name: 'new', aliases: [], description: { en: 'Start a fresh conversation', vi: 'Bắt đầu cuộc trò chuyện mới' } },
  { name: 'model', aliases: ['models'], description: { en: 'Choose the 9Router route', vi: 'Chọn định tuyến 9Router' } },
  { name: 'stop', aliases: [], description: { en: 'Stop the active response', vi: 'Dừng phản hồi đang chạy' } },
  { name: 'retry', aliases: [], description: { en: 'Retry an interrupted turn', vi: 'Thử lại lượt bị gián đoạn' } },
  { name: 'history', aliases: [], description: { en: 'Browse private chat history', vi: 'Xem lịch sử trò chuyện riêng' } },
  { name: 'status', aliases: [], description: { en: 'Show route and connection status', vi: 'Xem trạng thái định tuyến và kết nối' } },
  { name: 'providers', aliases: [], description: { en: 'Open secure provider setup', vi: 'Mở cài đặt nhà cung cấp an toàn' } },
  { name: 'help', aliases: [], description: { en: 'Show Chat AI commands', vi: 'Xem lệnh Chat AI' } }
]);

const COMMAND_BY_NAME = new Map();
for (const command of TELEGRAM_AI_COMMANDS) {
  COMMAND_BY_NAME.set(command.name, command);
  for (const alias of command.aliases) COMMAND_BY_NAME.set(alias, command);
}

function resolveTelegramAiCommand(text) {
  const match = String(text || '').trim().match(/^\/([a-z]+)(?:@[\w_]+)?(?:\s|$)/i);
  return match ? COMMAND_BY_NAME.get(match[1].toLowerCase()) || null : null;
}

function stableRevision(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function buildAuthoritativeCatalog({ providers = [], models = [], combos = [], selectedRoute = '' } = {}) {
  const connected = providers.filter(provider => provider?.connected === true && !['error', 'unavailable', 'disconnected'].includes(String(provider.status || '').toLowerCase()));
  const connectedIds = new Set(connected.map(provider => String(provider.id)));
  const allowedModels = models.filter(model => connectedIds.has(String(model.providerId || model.provider || '').split('/')[0]));
  const modelIds = new Set(allowedModels.map(model => String(model.id)));
  const allowedCombos = combos.filter(combo => Array.isArray(combo.models) && combo.models.length > 0 && combo.models.every(id => modelIds.has(String(id))));
  const routeIds = new Set([...modelIds, ...allowedCombos.map(combo => String(combo.id))]);
  const normalized = {
    providers: connected.map(provider => ({ ...provider })),
    models: allowedModels.map(model => ({ ...model })),
    combos: allowedCombos.map(combo => ({ ...combo })),
    selectedRoute: routeIds.has(String(selectedRoute)) ? String(selectedRoute) : (allowedModels[0]?.id || allowedCombos[0]?.id || '')
  };
  return Object.freeze({ ...normalized, revision: stableRevision(normalized) });
}

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

module.exports = {
  TELEGRAM_AI_COMMANDS,
  buildAuthoritativeCatalog,
  escapeTelegramHtml,
  resolveTelegramAiCommand,
  splitTelegramHtml,
  stableRevision
};
