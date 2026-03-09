const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../core/logger');
const log = logger.child('AI');

const { sanitizeSecrets } = require('../core/sanitize');
const { convertMarkdownToTelegram, escapeMarkdownV2 } = require('./utils/markdown');
const { splitTelegramMarkdownV2Text } = require('./utils/telegram');
const { Type } = require('@google/genai');
// Import ONCHAIN_TOOLS for DeFi capabilities (charts, market detail, candles, gas)
const { ONCHAIN_TOOLS: onchainToolArrays, executeToolCall: executeOnchainToolCall, buildSystemInstruction: buildOnchainSystemInstruction } = require('../features/ai/ai-onchain');
const { initSkills, registry: skillRegistry } = require('../skills');
const { buildAIAPrompt } = require('../config/prompts');
const { getPersonaStrings, getPersonaLabel } = require('./personaI18n');
// Import from modular aiHandlers
const {
  userPersonaPreferences,
  customPersonaCache,
  lastImageContext,
  aiTokenUsageByUser,
  profileReminderSent,
  intentCache,
  INTENT_CACHE_TTL,
  sessionHistory,
  SESSION_MAX_MESSAGES,
  SESSION_TTL,
  IMAGE_CONTEXT_TTL
} = require('./aiHandlers/sharedState');
// Import customPersonaPrompts from state.js (shared with userInputState for skip detection)
const { customPersonaPrompts } = require('../core/state');
const { sanitizeTelegramHtml } = require('../utils/text');
const {
  safeJsonParse,
  startsWithEmoji,
  pickContextIcon,
  decorateWithContextualIcons,
  recordAiTokenUsage,
  recordImageUsage,
  getAiTokenUsage,
  normalizeGeminiModelName,
  formatModelId,
  applyThreadId
} = require('./aiHandlers/utils');
const { AI_PERSONAS } = require('./aiHandlers/personas');
const {
  aiState,
  normalizeAiProvider,
  buildAiProviderMeta,
  extractGoogleCandidateText,
  isQuotaOrRateLimitError,
  isOpenAiBillingError,
  isGeminiApiKeyExpired,
  downloadTelegramPhotoBuffer,
  convertImageToPngSquare,
  buildGroqMessageContent,
  getGeminiClient,
  disableGeminiKey,
  disableUserGeminiKey,
  getUserGeminiKeyIndex,
  setUserGeminiKeyIndex,
  getGeminiTtsVoiceMeta,
  getGeminiTtsLanguageMeta,
  formatTtsVoiceLabel,
  formatTtsLanguageLabel,
  getUserTtsConfig,
  saveUserTtsVoice,
  saveUserTtsLanguage,
  advanceGeminiKeyIndex,
  advanceUserGeminiKeyIndex,
  getGroqClient,
  disableGroqKey,
  disableUserGroqKey,
  getUserGroqKeyIndex,
  setUserGroqKeyIndex,
  advanceGroqKeyIndex,
  advanceUserGroqKeyIndex,
  getOpenAiClient,
  disableOpenAiKey,
  disableUserOpenAiKey,
  getUserOpenAiKeyIndex,
  setUserOpenAiKeyIndex,
  advanceOpenAiKeyIndex,
  advanceUserOpenAiKeyIndex,
  buildAiUsageKeyboard,
  buildTtsSettingsKeyboard,
  buildTtsSettingsText,
  detectImageAction,
  classifyImageIntentWithAI,
  urlToGenerativePart,
  bufferToGenerativePart,
  getUserGeminiModelConfig,
  getAndClearExpiredKeyNotices,
  hasExpiredKeyNotices
} = require('../features/aiService');
const {
  aiProviderSelectionSessions,
  userDisabledGeminiKeyIndices,
  userDisabledGroqKeyIndices,
  userDisabledOpenAiKeyIndices,
  disabledGeminiKeyIndices,
  disabledGroqKeyIndices,
  disabledOpenAiKeyIndices,
  pendingVoiceCommands
} = require('../core/state');
const {
  TELEGRAM_TOKEN,
  GEMINI_API_KEYS,
  GROQ_API_KEYS,
  OPENAI_API_KEYS,
  GEMINI_MODEL,
  GEMINI_TTS_MODEL,
  GEMINI_TTS_VOICE,
  GEMINI_TTS_VOICE_OPTIONS,
  GEMINI_TTS_VOICES,
  GEMINI_TTS_LANG_OPTIONS,
  GEMINI_TTS_LANG_CODES,
  GEMINI_TTS_SAMPLE_RATE,
  GEMINI_TTS_CHANNELS,
  GEMINI_TTS_BIT_DEPTH,
  GEMINI_MODEL_FAMILIES,
  GROQ_MODEL,
  GROQ_VISION_MODEL,
  GROQ_API_URL,
  OPENAI_MODEL,
  OPENAI_VISION_MODEL,
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_VARIATION_MODEL,
  GEMINI_IMAGE_MODEL,
  OPENAI_TRANSCRIBE_MODEL,
  OPENAI_TTS_MODEL,
  OPENAI_TTS_VOICE,
  OPENAI_TTS_FORMAT,
  OPENAI_AUDIO_MODEL,
  AI_IMAGE_MAX_BYTES,
  AI_IMAGE_DOWNLOAD_TIMEOUT_MS,
  AI_KEY_PROBE_TIMEOUT_MS
} = require('../config/env');
const {
  processAudioWithLiveAPI,
  isFlashLiveModel
} = require('../features/geminiLiveAudio');
const {
  buildLiveTools,
  executeFunctionCall: executeVoiceFunctionCall
} = require('../features/liveAudioTools');

// Token Search Cache & Helpers — extracted to aiHandlers/tokenSearch.js
const {
  _tokenSearchCache,
  TKS_PAGE_SIZE,
  _buildPriceCard,
  _buildSparkline,
  _calculateRSI,
  _calculateMA,
  _extractCandelCloses,
  _buildTokenListPage,
  _buildTokenListKeyboard
} = require('./aiHandlers/tokenSearch');
const { t: _t } = require('../core/i18n');


// ═══════════════════════════════════════════════════════
// /importkey command — DM only, encrypted storage
// ═══════════════════════════════════════════════════════
function registerImportKeyCommand(bot, getLang, t) {
  const ENCRYPT_KEY = (process.env.WALLET_ENCRYPT_SECRET || process.env.TELEGRAM_TOKEN || '').slice(0, 32).padEnd(32, '0');

  function encrypt(text) {
    const crypto = require('crypto');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  function decrypt(text) {
    const crypto = require('crypto');
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
  // Store decrypt globally for swap execution
  if (!global._decryptTradingKey) global._decryptTradingKey = decrypt;

  bot.onText(/^\/importkey(?:@[\w_]+)?\s+(.+)$/is, async (msg, match) => {
    const lang = getLang(msg.chat.id);
    // Only allow in DM
    if (msg.chat.type !== 'private') {
      await bot.sendMessage(msg.chat.id, t(lang, 'ai_dm_only'), { parse_mode: 'HTML' });
      return;
    }
    // Delete the message with the key(s) immediately for security
    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) { /* ok */ }

    // Split by whitespace or newlines to support batch import
    const rawKeys = match[1].trim().split(/[\s,;]+/).filter(k => k.length > 0);
    const ethers = require('ethers');
    const { dbGet, dbRun } = require('../../db/core');
    const userId = String(msg.from?.id || msg.chat.id);

    const results = { imported: [], duplicates: [], invalid: [] };

    for (const key of rawKeys) {
      try {
        const pk = key.startsWith('0x') ? key : `0x${key}`;
        const wallet = new ethers.Wallet(pk);
        const address = wallet.address;

        // Check for duplicate
        const existing = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND address = ?', [userId, address]);
        if (existing) {
          results.duplicates.push(address);
          continue;
        }

        const encryptedKey = encrypt(pk);
        const hasWallets = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? LIMIT 1', [userId]);
        const isDefault = hasWallets ? 0 : 1;
        await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, null, address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]);
        results.imported.push(address);
      } catch (e) {
        results.invalid.push(key.slice(0, 10) + '...');
      }
    }

    // Build summary message
    let summary = '';
    if (results.imported.length > 0) {
      summary += `✅ <b>Import thành công ${results.imported.length} ví:</b>\n`;
      results.imported.forEach((addr, i) => {
        summary += `${i + 1}. <code>${addr}</code>\n`;
      });
    }
    if (results.duplicates.length > 0) {
      summary += `\n⚠️ <b>${results.duplicates.length} ví đã tồn tại (bỏ qua):</b>\n`;
      results.duplicates.forEach(addr => { summary += `• <code>${addr}</code>\n`; });
    }
    if (results.invalid.length > 0) {
      summary += `\n❌ <b>${results.invalid.length} key không hợp lệ:</b>\n`;
      results.invalid.forEach(k => { summary += `• ${k}\n`; });
    }
    if (!summary) summary = '❌ Không có key hợp lệ nào.';
    summary += `\n🔐 ${t(lang, 'tw_key_encrypted')}`;

    await bot.sendMessage(msg.chat.id, summary, { parse_mode: 'HTML' });
    log.child('ImportKey').info(`✔ User ${userId} batch import: ${results.imported.length} imported, ${results.duplicates.length} dupes, ${results.invalid.length} invalid`);
  });

  // /deletekey command
  bot.onText(/^\/deletekey(?:@[\w_]+)?$/i, async (msg) => {
    const lang = getLang(msg.chat.id);
    const { dbRun } = require('../../db/core');
    const userId = String(msg.from?.id || msg.chat.id);
    await dbRun('DELETE FROM user_trading_wallets WHERE userId = ?', [userId]);
    await bot.sendMessage(msg.chat.id, t(lang, 'ai_key_deleted'), { parse_mode: 'HTML' });
  });

  // /createwallet — generate a new trading wallet (multi-wallet supported)
  bot.onText(/^\/createwallet(?:@[\w_]+)?$/i, async (msg) => {
    const lang = getLang(msg.chat.id);
    const { dbAll, dbRun } = require('../../db/core');
    const userId = String(msg.from?.id || msg.chat.id);
    const existingWallets = await dbAll('SELECT id FROM user_trading_wallets WHERE userId = ?', [userId]);
    const walletCount = existingWallets.length;
    const isFirst = walletCount === 0;
    const _wPrefix = { vi: 'Ví', en: 'Wallet', zh: '钱包', ko: '지갑', ru: 'Кошелёк', id: 'Dompet' };
    const autoName = `${_wPrefix[lang] || _wPrefix.en} #${walletCount + 1}`;
    const ethers = require('ethers');
    const newWallet = ethers.Wallet.createRandom();
    const encryptedKey = encrypt(newWallet.privateKey);
    await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, autoName, newWallet.address, encryptedKey, '196', isFirst ? 1 : 0, Math.floor(Date.now() / 1000)]);
    const _defLabel = { vi: 'Ví mặc định', en: 'Default wallet', zh: '默认钱包', ko: '기본 지갑', ru: 'Кошелёк по умолчанию', id: 'Dompet utama' };
    let card = `${t(lang, 'tw_created')}\n━━━━━━━━━━━━━━━━━━\n`;
    card += `👛 ${autoName}\n`;
    card += `${t(lang, 'ai_wallet_address')}: <code>${newWallet.address}</code>\n`;
    if (isFirst) card += `⭐ ${_defLabel[lang] || _defLabel.en}\n`;
    card += `#${walletCount + 1}\n\n`;
    card += `${t(lang, 'tw_backup_warning')}`;
    await bot.sendMessage(msg.chat.id, card, { parse_mode: 'HTML' });
    log.child('CreateWallet').info(`✔ User ${userId} created wallet #${walletCount + 1}: ${newWallet.address.slice(0, 8)}...`);
  });

  // /exportkey — DM only, show private key
  bot.onText(/^\/exportkey(?:@[\w_]+)?$/i, async (msg) => {
    const lang = getLang(msg.chat.id);
    if (msg.chat.type !== 'private') {
      await bot.sendMessage(msg.chat.id, t(lang, 'ai_dm_only'), { parse_mode: 'HTML' });
      return;
    }
    const { dbGet } = require('../../db/core');
    const userId = String(msg.from?.id || msg.chat.id);
    const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ?', [userId]);
    if (!tw) {
      await bot.sendMessage(msg.chat.id, t(lang, 'tw_none'), { parse_mode: 'HTML' });
      return;
    }
    const key = decrypt(tw.encryptedKey);
    const keyMsg = await bot.sendMessage(msg.chat.id,
      `${t(lang, 'tw_export_dm')}\n\n<code>${key}</code>\n\n${t(lang, 'tw_auto_delete_30s')}`, { parse_mode: 'HTML' });
    // Auto-delete after 30 seconds
    setTimeout(() => { bot.deleteMessage(msg.chat.id, keyMsg.message_id).catch(() => { }); }, 30000);
  });

  log.child('ImportKey').info('✔ /importkey, /createwallet, /exportkey, /deletekey registered');
}

// ═══════════════════════════════════════════════════════
// Trading Wallet Callbacks (tw_ prefix buttons)
// ═══════════════════════════════════════════════════════
function registerTradingWalletCallbacks(bot, getLang, t) {
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('tw_')) return;
    const msg = query.message;
    const lang = await getLang(msg);
    const userId = String(query.from?.id || msg.chat.id);
    const { dbGet, dbRun, dbAll } = require('../../db/core');

    try {
      // Parse format: tw_action or tw_action|walletId or tw_action|walletId|extra
      const parts = data.split('|');
      const action = parts[0];
      const walletId = parts[1] ? parseInt(parts[1]) : null;

      if (action === 'tw_create') {
        await bot.answerCallbackQuery(query.id);
        const msgText = lang === 'vi'
          ? `🤖 <b>Trợ lý AI:</b>\nĐể tạo ví giao dịch mới, bạn vui lòng nhắn tin trực tiếp cho tôi câu lệnh:\n\n👉 <code>Tạo ví mới</code>`
          : `🤖 <b>AI Assistant:</b>\nTo create a new trading wallet, please send me the following message:\n\n👉 <code>Create new wallet</code>`;
        await bot.sendMessage(msg.chat.id, msgText, { parse_mode: 'HTML' });

      } else if (action === 'tw_import') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(msg.chat.id, t(lang, 'ai_import_wallet_hint'), { parse_mode: 'HTML' });

      } else if (action === 'tw_export') {
        await bot.answerCallbackQuery(query.id);
        if (msg.chat.type !== 'private') {
          await bot.sendMessage(msg.chat.id, t(lang, 'ai_dm_only'), { parse_mode: 'HTML' });
          return;
        }

        if (!walletId) {
          await bot.sendMessage(msg.chat.id, '❌ Lỗi: Không xác định được ví cần xuất.', { parse_mode: 'HTML' });
          return;
        }

        const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
        if (!tw) {
          await bot.sendMessage(msg.chat.id, t(lang, 'tw_none') || '❌ Không tìm thấy ví.', { parse_mode: 'HTML' });
          return;
        }

        const key = global._decryptTradingKey(tw.encryptedKey);
        const star = tw.isDefault ? ' ⭐' : '';
        const exportMsg = `🔑 **Khóa Private (Ví ${walletId})**\n━━━━━━━━━━━━━━━━━━\n\nVí: \`${tw.address}\`${star}\nKey: \`${key}\`\n\n⚠️ Tin nhắn này sẽ tự hủy sau 30 giây để bảo mật!`;

        try {
          const keyMsg = await bot.sendMessage(msg.chat.id, exportMsg, { parse_mode: 'Markdown' });
          setTimeout(() => { bot.deleteMessage(msg.chat.id, keyMsg.message_id).catch(() => { }); }, 30000);
        } catch (e) {
          log.child('TW').error('Failed to send key:', e);
          await bot.sendMessage(msg.chat.id, `❌ Failed to send private key. Error: ${e.message}`);
        }

      } else if (action === 'tw_delete') {
        if (walletId) {
          await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
        } else {
          await dbRun('DELETE FROM user_trading_wallets WHERE userId = ?', [userId]);
        }
        await bot.answerCallbackQuery(query.id, { text: t(lang, 'ai_key_deleted').replace(/<[^>]+>/g, '') });
        await _sendTradingWalletSubMenu(bot, msg.chat.id, msg.message_id, lang, t);

      } else if (action === 'tw_setdefault') {
        if (!walletId) { await bot.answerCallbackQuery(query.id); return; }
        await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE userId = ?', [userId]);
        await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ? AND userId = ?', [walletId, userId]);
        await bot.answerCallbackQuery(query.id, { text: t(lang, 'tw_set_default_ok').replace(/<[^>]+>/g, '') });
        await _sendTradingWalletSubMenu(bot, msg.chat.id, msg.message_id, lang, t);

      } else if (action === 'tw_balance') {
        const tw = walletId
          ? await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId])
          : await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
        if (!tw) { await bot.answerCallbackQuery(query.id, { text: t(lang, 'tw_none'), show_alert: true }); return; }
        await bot.answerCallbackQuery(query.id, { text: '⏳...' });
        const config = require('../config/env');
        const createOkxService = require('../services/okxService');
        const okxService = createOkxService(config);
        const balanceSnapshot = await okxService.fetchOkxDexBalanceSnapshot(tw.address, { explicitChainIndex: 196 }).catch(() => ({ tokens: [] }));
        const balances = balanceSnapshot.tokens || [];
        const okxLink = `https://www.okx.com/web3/explorer/xlayer/address/${tw.address}`;
        let card = `${t(lang, 'tw_balance_title')}\n━━━━━━━━━━━━━━━━━━\n`;
        card += `<a href="${okxLink}"><code>${tw.address}</code></a>\n\n`;
        const tokenButtons = [];
        if (!balances || balances.length === 0) {
          card += `${t(lang, 'tw_balance_empty')}\n\n💡 ${t(lang, 'tw_created_hint')}`;
        } else {
          let totalUsd = 0;
          balances.slice(0, 10).forEach(b => {
            const val = Number(b.balance || b.tokenBalance || 0);
            const sym = b.symbol || b.tokenSymbol || '?';
            const priceUsd = Number(b.priceUsd || b.tokenPrice || b.price || 0);
            const usd = priceUsd * val;
            totalUsd += usd;
            const tokenAddr = b.tokenAddress || '';
            const tokenLink = tokenAddr && !tokenAddr.startsWith('native:')
              ? `https://www.okx.com/web3/explorer/xlayer/token/${tokenAddr}`
              : okxLink;
            card += `• <a href="${tokenLink}"><b>${sym}</b></a>: ${val > 0.01 ? val.toFixed(4) : val.toFixed(8)} ($${usd.toFixed(2)})\n`;
          });
          card += `\n💵 <b>${t(lang, 'tw_balance_total', { total: '$' + totalUsd.toFixed(2) })}</b>`;
        }
        const balanceButtons = [[{ text: '↩️', callback_data: 'tw_back' }]];
        await bot.editMessageText(card, {
          chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: balanceButtons }
        });

      } else if (action === 'tw_back') {
        await bot.answerCallbackQuery(query.id);
        await _sendTradingWalletSubMenu(bot, msg.chat.id, msg.message_id, lang, t);
      } else if (action === 'tw_swap_hint') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(msg.chat.id, t(lang, 'tw_swap_hint'), { parse_mode: 'HTML' });

      } else if (action === 'tw_batch_swap_hint') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(msg.chat.id, t(lang, 'tw_batch_swap_hint'), { parse_mode: 'HTML' });

      } else if (action === 'tw_batch_import_hint') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(msg.chat.id, t(lang, 'tw_batch_import_hint'), { parse_mode: 'HTML' });

      } else if (action === 'tw_export_all') {
        await bot.answerCallbackQuery(query.id);
        if (msg.chat.type !== 'private') {
          await bot.sendMessage(msg.chat.id, t(lang, 'ai_dm_only'), { parse_mode: 'HTML' });
          return;
        }

        const allWallets = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY createdAt ASC', [userId]);
        if (!allWallets || allWallets.length === 0) {
          await bot.sendMessage(msg.chat.id, '❌ You do not have any trading wallets to export.', { parse_mode: 'HTML' });
          return;
        }

        let exportMsg = `🔑 **Danh sách Khóa Private (Tất cả)**\n━━━━━━━━━━━━━━━━━━\n`;
        allWallets.forEach((w, i) => {
          const key = global._decryptTradingKey ? global._decryptTradingKey(w.encryptedKey) : '❌ Decryption unavailable';
          const star = w.isDefault ? ' ⭐' : '';
          exportMsg += `\nVí ${i + 1}: \`${w.address}\`${star}\nKey: \`${key}\`\n`;
        });
        exportMsg += `\n⚠️ Tin nhắn này sẽ tự hủy sau 30 giây để bảo mật!`;

        try {
          const keyMsg = await bot.sendMessage(msg.chat.id, exportMsg, { parse_mode: 'Markdown' });
          setTimeout(() => { bot.deleteMessage(msg.chat.id, keyMsg.message_id).catch(() => { }); }, 30000);
        } catch (e) {
          log.child('TW').error('Failed to send keys:', e);
          await bot.sendMessage(msg.chat.id, `❌ Failed to send private keys. Error: ${e.message}`);
        }

      } else if (action === 'tw_sync') {
        await bot.answerCallbackQuery(query.id, { text: t(lang, 'syncing_data') || '🔄 Đang đồng bộ...' });
        await _sendTradingWalletSubMenu(bot, msg.chat.id, msg.message_id, lang, t);

      } else if (action === 'tw_check_all') {
        const allWallets = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC', [userId]);
        if (!allWallets || allWallets.length === 0) {
          await bot.answerCallbackQuery(query.id, { text: t(lang, 'tw_none'), show_alert: true });
          return;
        }
        await bot.answerCallbackQuery(query.id, { text: '⏳...' });
        const config = require('../config/env');
        const createOkxService = require('../services/okxService');
        const okxService = createOkxService(config);
        let card = `💰 <b>Số dư tất cả ví</b>\n━━━━━━━━━━━━━━━━━━\n`;
        let grandTotal = 0;
        for (const tw of allWallets) {
          const star = tw.isDefault ? ' ⭐' : '';
          const okxLink = `https://www.okx.com/web3/explorer/xlayer/address/${tw.address}`;
          card += `\n<a href="${okxLink}"><code>${tw.address}</code></a>${star}\n`;
          try {
            const snapshot = await okxService.fetchOkxDexBalanceSnapshot(tw.address, { explicitChainIndex: 196 }).catch(() => ({ tokens: [] }));
            const tokens = snapshot.tokens || [];
            if (tokens.length === 0) {
              card += `  📭 Trống\n`;
            } else {
              let walletTotal = 0;
              tokens.slice(0, 5).forEach(b => {
                const val = Number(b.balance || b.tokenBalance || 0);
                const sym = b.symbol || b.tokenSymbol || '?';
                const price = Number(b.priceUsd || b.tokenPrice || b.price || 0);
                const usd = price * val;
                walletTotal += usd;
                card += `  • <b>${sym}</b>: ${val > 0.01 ? val.toFixed(4) : val.toFixed(8)} ($${usd.toFixed(2)})\n`;
              });
              if (tokens.length > 5) card += `  ... +${tokens.length - 5} token\n`;
              card += `  💵 $${walletTotal.toFixed(2)}\n`;
              grandTotal += walletTotal;
            }
          } catch (e) {
            card += `  ❌ Lỗi: ${e.message?.slice(0, 30)}\n`;
          }
        }
        card += `\n━━━━━━━━━━━━━━━━━━\n💵 <b>Tổng tất cả: $${grandTotal.toFixed(2)}</b>`;
        const backBtns = [[{ text: '↩️', callback_data: 'tw_back' }]];
        await bot.editMessageText(card, {
          chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: backBtns }, disable_web_page_preview: true
        }).catch(() => { });

      } else if (action === 'tw_rename') {
        await bot.answerCallbackQuery(query.id);
        if (!walletId) return;
        const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
        if (!tw) { await bot.sendMessage(msg.chat.id, '❌ Ví không tồn tại.', { parse_mode: 'HTML' }); return; }

        const currentName = tw.walletName ? `"${tw.walletName}"` : '(chưa đặt tên)';
        const promptText = lang === 'vi'
          ? `✏️ <b>Đổi tên ví</b>\n━━━━━━━━━━━━━━━━━━\nĐịa chỉ: <code>${tw.address}</code>\nTên hiện tại: ${currentName}\n\n📝 Vui lòng nhập tên mới cho ví (tối đa 20 ký tự):`
          : `✏️ <b>Rename Wallet</b>\n━━━━━━━━━━━━━━━━━━\nAddress: <code>${tw.address}</code>\nCurrent name: ${currentName}\n\n📝 Please type the new name (max 20 characters):`;
        await bot.sendMessage(msg.chat.id, promptText, { parse_mode: 'HTML' });

        // Set up a one-time listener for the next text message
        const onReply = async (replyMsg) => {
          if (String(replyMsg.from?.id || replyMsg.chat.id) !== userId) return;
          if (replyMsg.chat.id !== msg.chat.id) return;
          if (!replyMsg.text) return;

          bot.removeListener('message', onReply);
          const newName = replyMsg.text.trim().slice(0, 20);
          if (!newName) {
            await bot.sendMessage(msg.chat.id, '❌ Tên không hợp lệ.', { parse_mode: 'HTML' });
            return;
          }

          try {
            await dbRun('UPDATE user_trading_wallets SET walletName = ? WHERE id = ? AND userId = ?', [newName, walletId, userId]);
            const successText = lang === 'vi'
              ? `✅ Đã đổi tên ví thành "<b>${newName}</b>"`
              : `✅ Wallet renamed to "<b>${newName}</b>"`;
            await bot.sendMessage(msg.chat.id, successText, { parse_mode: 'HTML' });
          } catch (e) {
            await bot.sendMessage(msg.chat.id, `❌ Lỗi: ${e.message}`, { parse_mode: 'HTML' });
          }
        };
        bot.on('message', onReply);
        // Auto-cleanup after 60 seconds
        setTimeout(() => { bot.removeListener('message', onReply); }, 60000);

      } else if (action === 'tw_delete_all') {
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText(t(lang, 'tw_delete_all_confirm'), {
          chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'tw_delete_all_yes'), callback_data: 'tw_delete_all_confirm' }],
              [{ text: t(lang, 'tw_delete_all_no'), callback_data: 'tw_back' }]
            ]
          }
        });

      } else if (action === 'tw_delete_all_confirm') {
        await dbRun('DELETE FROM user_trading_wallets WHERE userId = ?', [userId]);
        await bot.answerCallbackQuery(query.id, { text: t(lang, 'tw_deleted_all').replace(/<[^>]+>/g, '') });
        await _sendTradingWalletSubMenu(bot, msg.chat.id, msg.message_id, lang, t);
      }
    } catch (err) {
      log.child('TW').error('Error:', err.message);
      await bot.answerCallbackQuery(query.id, { text: '❌ Error', show_alert: true }).catch(() => { });
    }
  });

  log.child('TW').info('✔ Trading wallet callbacks registered');
}

// Helper: send trading wallet sub-menu using the new walletUi builder
async function _sendTradingWalletSubMenu(bot, chatId, messageId, lang, t, page = 0) {
  try {
    const createWalletUi = require('./walletUi');
    const db = require('../../db.js');
    const { escapeHtml, shortenAddress, normalizeAddressSafe, appendCloseButton } = require('../utils/helpers') || {};
    const walletUi = createWalletUi({
      t, db,
      appendCloseButton: appendCloseButton || ((markup) => markup),
      shortenAddress: shortenAddress || ((a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''),
      normalizeAddressSafe: normalizeAddressSafe || ((a) => a),
      fetchOkxBalanceSupportedChains: async () => [],
      WALLET_CHAIN_CALLBACK_TTL: 300000,
      WALLET_TOKEN_CALLBACK_TTL: 300000,
      OKX_CHAIN_INDEX_FALLBACK: 196,
      walletChainCallbackStore: new Map(),
      walletTokenCallbackStore: new Map(),
      PUBLIC_BASE_URL: '',
      escapeHtml: escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    });
    const menu = await walletUi.buildTradingWalletSubMenu(lang, String(chatId), page);
    if (messageId) {
      await bot.editMessageText(menu.text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: menu.replyMarkup, disable_web_page_preview: true }).catch(() => { });
    } else {
      await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup, disable_web_page_preview: true });
    }
  } catch (e) {
    log.child('TW').error('SubMenu:', e.message);
  }
}

// ═══════════════════════════════════════════════════════
// Wallet Hub Callbacks (wh_ prefix buttons)
// ═══════════════════════════════════════════════════════
function registerWalletHubCallbacks(bot, getLang, t) {
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('wh_')) return;
    const msg = query.message;
    const lang = await getLang(msg);
    const chatId = String(msg.chat.id);

    try {
      const parts = data.split('|');
      const action = parts[0];
      const pageNum = parts[1] ? parseInt(parts[1]) : 0;

      const createWalletUi = require('./walletUi');
      const db = require('../../db.js');
      const { escapeHtml, shortenAddress, normalizeAddressSafe, appendCloseButton } = require('../utils/helpers') || {};
      const walletUi = createWalletUi({
        t, db,
        appendCloseButton: appendCloseButton || ((markup) => markup),
        shortenAddress: shortenAddress || ((a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''),
        normalizeAddressSafe: normalizeAddressSafe || ((a) => a),
        fetchOkxBalanceSupportedChains: async () => [],
        WALLET_CHAIN_CALLBACK_TTL: 300000,
        WALLET_TOKEN_CALLBACK_TTL: 300000,
        OKX_CHAIN_INDEX_FALLBACK: 196,
        walletChainCallbackStore: new Map(),
        walletTokenCallbackStore: new Map(),
        PUBLIC_BASE_URL: '',
        escapeHtml: escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      });

      if (action === 'wh_trading') {
        await bot.answerCallbackQuery(query.id, { text: '⏳...' });
        const menu = await walletUi.buildTradingWalletSubMenu(lang, chatId, pageNum);
        await bot.editMessageText(menu.text, {
          chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML',
          reply_markup: menu.replyMarkup, disable_web_page_preview: true
        }).catch(() => { });

      } else if (action === 'wh_watch') {
        await bot.answerCallbackQuery(query.id);
        const menu = await walletUi.buildWatchWalletSubMenu(lang, chatId, pageNum);
        await bot.editMessageText(menu.text, {
          chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML',
          reply_markup: menu.replyMarkup, disable_web_page_preview: true
        }).catch(() => { });

      } else if (action === 'wh_back') {
        await bot.answerCallbackQuery(query.id);
        const menu = await walletUi.buildWalletHubMenu(lang, chatId);
        await bot.editMessageText(menu.text, {
          chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML',
          reply_markup: menu.replyMarkup, disable_web_page_preview: true
        }).catch(() => { });
      }
    } catch (err) {
      log.child('WalletHub').error('Error:', err.message);
      await bot.answerCallbackQuery(query.id, { text: '❌ Error', show_alert: true }).catch(() => { });
    }
  });

  log.child('WalletHub').info('✔ Wallet hub callbacks registered');
}

// ═══════════════════════════════════════════════════════
// Swap Confirm Callback — executes swap on confirm
// ═══════════════════════════════════════════════════════
function registerSwapConfirmCallback(bot, getLang, t) {
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('swpc|')) return;
    // Format: swpc|chainIndex|fromAddr|toAddr|amount|fromDec|toDec|fromSym|toSym
    const parts = data.split('|');
    if (parts.length < 9) return;
    const [, chainIndex, fromAddr, toAddr, amount, fromDec, toDec, fromSym, toSym] = parts;
    const msg = query.message;
    const lang = getLang(msg.chat.id);
    const userId = String(query.from?.id || msg.chat.id);

    try {
      await bot.answerCallbackQuery(query.id, { text: t(lang, 'ai_swap_confirming') });
      // Get user trading wallet
      const { dbGet } = require('../../db/core');
      const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ?', [userId]);
      if (!tw) {
        await bot.editMessageText(t(lang, 'ai_no_trading_wallet'), { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML' });
        return;
      }
      // Decrypt key
      const privateKey = global._decryptTradingKey(tw.encryptedKey);
      const onchainos = require('../services/onchainos');
      const ethers = require('ethers');
      // Get swap transaction data
      const txData = await onchainos.getSwapTransaction({
        chainIndex, fromTokenAddress: fromAddr, toTokenAddress: toAddr,
        amount, userWalletAddress: tw.address, slippagePercent: '1'
      });
      const txRaw = Array.isArray(txData) ? txData[0] : txData;
      if (!txRaw || !txRaw.tx) {
        await bot.editMessageText(`❌ ${t(lang, 'ai_swap_sign_error')}: no tx data`, { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML' });
        return;
      }
      // Sign transaction
      const { _getChainRpc, _getExplorerUrl } = require('../features/ai/onchain/helpers');
      const rpcUrl = _getChainRpc(chainIndex);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const tx = txRaw.tx;
      const signedTx = await wallet.signTransaction({
        to: tx.to, data: tx.data, value: BigInt(tx.value || '0'),
        gasLimit: BigInt(tx.gas || tx.gasLimit || '300000'),
        gasPrice: BigInt(tx.gasPrice || '1000000000'),
        nonce: await provider.getTransactionCount(wallet.address),
        chainId: parseInt(chainIndex)
      });
      // Broadcast
      const broadcastResult = await onchainos.broadcastTransaction(signedTx, chainIndex, tw.address);
      const txHash = broadcastResult?.orderId || broadcastResult?.hash || broadcastResult?.transactionHash || 'pending';
      const explorerBase = _getExplorerUrl(chainIndex);
      const explorerLink = `${explorerBase}/tx/${txHash}`;
      const toAmount = Number(txRaw.routerResult?.toTokenAmount || txRaw.toTokenAmount || 0) / (10 ** Number(toDec));
      const toStr = toAmount > 0 ? toAmount.toFixed(toAmount < 1 ? 8 : 4) : '?';
      let successCard = `🎉 <b>${t(lang, 'ai_swap_success')}</b>\n━━━━━━━━━━━━━━━━━━\n`;

      successCard += `📤 ${fromSym} → 📥 ${toStr} <b>${toSym}</b>\n`;
      successCard += `🔗 <a href="${explorerLink}">${t(lang, 'ai_swap_tx')}</a>\n`;
      await bot.editMessageText(successCard, { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (err) {
      log.child('Swap').error('Error:', err.message);
      await bot.editMessageText(`❌ ${t(lang, 'ai_swap_sign_error')}: ${err.message?.substring(0, 100)}`, {
        chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML'
      }).catch(() => { });
    }
  });

  // Cancel callback
  bot.on('callback_query', async (query) => {
    if (query.data !== 'swpc|cancel') return;
    await bot.answerCallbackQuery(query.id);
    await bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { });
  });

  log.child('Swap').info('✔ Swap confirm callback registered');
}

function registerTokenSearchCallbacks(bot) {
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('tks|')) return;
    const parts = data.split('|');
    const action = parts[1];
    try {
      if (action === 'close') {
        await bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { });
        await bot.answerCallbackQuery(query.id);
        return;
      }
      if (action === 'noop') {
        await bot.answerCallbackQuery(query.id);
        return;
      }
      if (action === 'p') {
        // Pagination
        const cacheKey = parts[2];
        const page = parseInt(parts[3]) || 0;
        const cached = _tokenSearchCache.get(cacheKey);
        if (!cached) {
          await bot.answerCallbackQuery(query.id, { text: _t('en', 'ai_token_search_expired'), show_alert: true });
          return;
        }
        const { t: ct, lang: cl } = cached;
        const pageText = _buildTokenListPage(cached.results, cached.keyword, page, cached.chainNames, ct, cl);
        const keyboard = _buildTokenListKeyboard(cached.results, cacheKey, page, ct, cl);
        await bot.editMessageText(pageText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
        await bot.answerCallbackQuery(query.id);
        return;
      }
      if (action === 's') {
        // Token selection → show detailed price card
        const cacheKey = parts[2];
        const idx = parseInt(parts[3]) || 0;
        const cached = _tokenSearchCache.get(cacheKey);
        if (!cached) {
          await bot.answerCallbackQuery(query.id, { text: _t('en', 'ai_token_search_expired'), show_alert: true });
          return;
        }
        const { t: ct, lang: cl } = cached;
        const tf = ct || _t;
        const token = cached.results[idx];
        if (!token) {
          await bot.answerCallbackQuery(query.id, { text: tf(cl, 'ai_token_not_found'), show_alert: true });
          return;
        }
        await bot.answerCallbackQuery(query.id, { text: tf(cl, 'ai_token_search_loading', { symbol: token.tokenSymbol }) });
        const onchainos = require('../services/onchainos');
        const priceCard = await _buildPriceCard(onchainos, token.chainIndex, token.tokenContractAddress, token.tokenSymbol, token.tokenFullName, cached.chainNames, ct, cl);
        // Action buttons + back
        const backKeyboard = [
          [
            { text: tf(cl, 'ai_token_btn_swap') || '💱 Swap', callback_data: `tks|swap|${cacheKey}|${idx}` },
            { text: tf(cl, 'ai_token_btn_chart') || '📊 Chart', callback_data: `tks|chart|${cacheKey}|${idx}` },
            { text: tf(cl, 'ai_token_btn_security') || '🔒 Security', callback_data: `tks|sec|${cacheKey}|${idx}` },
          ],
          [{ text: tf(cl, 'ai_token_btn_copy_ca') || '📋 Copy CA', callback_data: `tks|copy|${cacheKey}|${idx}` }],
          [{ text: tf(cl, 'ai_token_search_back'), callback_data: `tks|p|${cacheKey}|${Math.floor(idx / TKS_PAGE_SIZE)}` }],
          [{ text: tf(cl, 'ai_token_search_close'), callback_data: 'tks|close' }]
        ];
        await bot.editMessageText(priceCard, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: backKeyboard },
          disable_web_page_preview: true
        });
        return;
      }
      // ── Action: Swap shortcut ──
      if (action === 'swap') {
        const cacheKey = parts[2];
        const idx = parseInt(parts[3]) || 0;
        const cached = _tokenSearchCache.get(cacheKey);
        if (!cached) { await bot.answerCallbackQuery(query.id, { text: 'Session expired', show_alert: true }); return; }
        const token = cached.results[idx];
        if (!token) { await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true }); return; }
        await bot.answerCallbackQuery(query.id, { text: `Preparing swap for ${token.tokenSymbol}...` });
        // Send a prompt to the user guiding them
        const swapGuide = `💱 <b>Swap ${token.tokenSymbol}</b>\n━━━━━━━━━━━━━━━━━━\n` +
          `To swap this token, send a message like:\n` +
          `<code>swap 1000 ${token.tokenSymbol} to OKB</code>\n\n` +
          `📍 CA: <code>${token.tokenContractAddress}</code>\n` +
          `⛓ Chain: ${cached.chainNames[token.chainIndex] || token.chainIndex}`;
        await bot.sendMessage(query.message.chat.id, swapGuide, { parse_mode: 'HTML' });
        return;
      }
      // ── Action: Chart shortcut ──
      if (action === 'chart') {
        const cacheKey = parts[2];
        const idx = parseInt(parts[3]) || 0;
        const cached = _tokenSearchCache.get(cacheKey);
        if (!cached) { await bot.answerCallbackQuery(query.id, { text: 'Session expired', show_alert: true }); return; }
        const token = cached.results[idx];
        if (!token) { await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true }); return; }
        await bot.answerCallbackQuery(query.id, { text: `Loading chart for ${token.tokenSymbol}...` });
        try {
          const onchainos = require('../services/onchainos');
          const { formatCandlesResult } = require('../features/ai/onchain/formatters');
          const [candleData, priceData] = await Promise.all([
            onchainos.getMarketCandles(token.chainIndex, token.tokenContractAddress, { bar: '1H', limit: 24 }).catch(() => null),
            onchainos.getMarketPrice([{ chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress }]).catch(() => null)
          ]);
          const realTimePrice = priceData && priceData[0] ? Number(priceData[0].price || 0) : null;
          const chartText = formatCandlesResult(candleData, '1H', realTimePrice, token.tokenContractAddress, token.chainIndex, cached.lang || 'en');
          // Strip the "> IMPORTANT INSTRUCTION" prefix if present
          const cleanChart = chartText.replace(/^>\s*IMPORTANT INSTRUCTION[^\n]*\n\n/, '');
          await bot.sendMessage(query.message.chat.id, cleanChart, { parse_mode: 'Markdown', disable_web_page_preview: true }).catch(() => {
            // Fallback to no parse mode
            bot.sendMessage(query.message.chat.id, cleanChart, { disable_web_page_preview: true });
          });
        } catch (err) {
          await bot.sendMessage(query.message.chat.id, `❌ Error loading chart: ${err.message}`);
        }
        return;
      }
      // ── Action: Security check ──
      if (action === 'sec') {
        const cacheKey = parts[2];
        const idx = parseInt(parts[3]) || 0;
        const cached = _tokenSearchCache.get(cacheKey);
        if (!cached) { await bot.answerCallbackQuery(query.id, { text: 'Session expired', show_alert: true }); return; }
        const token = cached.results[idx];
        if (!token) { await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true }); return; }
        await bot.answerCallbackQuery(query.id, { text: `Checking security for ${token.tokenSymbol}...` });
        try {
          const { formatTokenSecurityResult } = require('../features/ai/onchain/formatters');
          const https = require('https');
          const goplusChainMap = { '1': '1', '56': '56', '196': '196', '137': '137', '42161': '42161', '8453': '8453' };
          const goplusChain = goplusChainMap[String(token.chainIndex)];
          if (!goplusChain) {
            await bot.sendMessage(query.message.chat.id, `❌ Security check not supported for chain ${token.chainIndex}`);
            return;
          }
          const url = `https://api.gopluslabs.io/api/v1/token_security/${goplusChain}?contract_addresses=${token.tokenContractAddress}`;
          const secData = await new Promise((resolve, reject) => {
            const req = https.get(url, (res) => {
              let body = '';
              res.on('data', (chunk) => body += chunk);
              res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
            });
            req.on('error', reject);
            req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
          });
          const secText = formatTokenSecurityResult(secData, token.tokenContractAddress, token.chainIndex, cached.lang || 'en');
          const cleanSec = secText.replace(/^>\s*IMPORTANT INSTRUCTION[^\n]*\n\n/, '');
          await bot.sendMessage(query.message.chat.id, cleanSec, { parse_mode: 'Markdown', disable_web_page_preview: true }).catch(() => {
            bot.sendMessage(query.message.chat.id, cleanSec, { disable_web_page_preview: true });
          });
        } catch (err) {
          await bot.sendMessage(query.message.chat.id, `❌ Security check error: ${err.message}`);
        }
        return;
      }
      // ── Action: Copy CA ──
      if (action === 'copy') {
        const cacheKey = parts[2];
        const idx = parseInt(parts[3]) || 0;
        const cached = _tokenSearchCache.get(cacheKey);
        if (!cached) { await bot.answerCallbackQuery(query.id, { text: 'Session expired', show_alert: true }); return; }
        const token = cached.results[idx];
        if (!token) { await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true }); return; }
        // Send CA as a plain code message that's easy to copy on mobile
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(query.message.chat.id, `📋 <b>${token.tokenSymbol}</b> Contract Address:\n\n<code>${token.tokenContractAddress}</code>`, { parse_mode: 'HTML' });
        return;
      }
    } catch (error) {
      log.child('TokenSearch').error('Callback error:', error.message);
      await bot.answerCallbackQuery(query.id, { text: _t('en', 'ai_token_error'), show_alert: false }).catch(() => { });
    }
  });
  log.child('TokenSearch').info('✓ Callback handler registered');
}

// ═══════════════════════════════════════════════════════
// Inline Mode (Feature 10)
// ═══════════════════════════════════════════════════════
function registerInlineQueryHandler(bot) {
  bot.on('inline_query', async (query) => {
    const keyword = (query.query || '').trim();
    if (!keyword || keyword.length < 2) {
      return bot.answerInlineQuery(query.id, [], { cache_time: 5 }).catch(() => { });
    }
    try {
      const onchainos = require('../services/onchainos');
      const KNOWN_TOKENS = {
        'BTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Bitcoin' },
        'ETH': { chainIndex: '1', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', fullName: 'Ethereum' },
        'OKB': { chainIndex: '196', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'OKB', fullName: 'OKB' },
        'BNB': { chainIndex: '56', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB', fullName: 'BNB' },
        'SOL': { chainIndex: '501', address: '11111111111111111111111111111111', symbol: 'SOL', fullName: 'Solana' },
        'USDT': { chainIndex: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', fullName: 'Tether' }
      };
      // Try known tokens first
      let matches = [];
      const upper = keyword.toUpperCase();
      if (KNOWN_TOKENS[upper]) {
        const k = KNOWN_TOKENS[upper];
        matches.push({ symbol: k.symbol, fullName: k.fullName, chainIndex: k.chainIndex, address: k.address });
      }
      // Search API
      if (matches.length === 0) {
        const sr = await onchainos.getTokenSearch('196,1,56,501', keyword).catch(() => []);
        if (sr && sr.length > 0) {
          matches = sr.slice(0, 5).map(s => ({ symbol: s.tokenSymbol, fullName: s.tokenFullName || s.tokenSymbol, chainIndex: s.chainIndex, address: s.tokenContractAddress }));
        }
      }
      if (matches.length === 0) {
        return bot.answerInlineQuery(query.id, [], { cache_time: 10 }).catch(() => { });
      }
      // Fetch prices in parallel
      const priceTokens = matches.map(m => ({ chainIndex: m.chainIndex, tokenContractAddress: m.address }));
      const prices = await onchainos.getTokenPriceInfo(priceTokens).catch(() => []);
      const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };
      const results = matches.map((m, i) => {
        const pi = prices && prices[i] ? prices[i] : {};
        const price = Number(pi.price || 0);
        const change = Number(pi.priceChange24H || 0);
        const priceStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(4) : price.toFixed(2);
        const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        const changeIcon = change >= 0 ? '📈' : '📉';
        const chain = chainNames[m.chainIndex] || m.chainIndex;
        const msgText = `💰 <b>${m.symbol}</b> (${m.fullName})\n━━━━━━━━━━━━━━━━━━\n💵 $${priceStr}\n${changeIcon} 24h: ${changeStr}\n🔗 ${chain}`;
        return {
          type: 'article',
          id: `${m.chainIndex}_${m.address}_${Date.now()}`.slice(0, 64),
          title: `${m.symbol} — $${priceStr}`,
          description: `${changeIcon} ${changeStr} · ${chain}`,
          input_message_content: { message_text: msgText, parse_mode: 'HTML' }
        };
      });
      await bot.answerInlineQuery(query.id, results, { cache_time: 30 });
    } catch (err) {
      log.child('Inline').error('Error:', err.message);
      await bot.answerInlineQuery(query.id, [], { cache_time: 5 }).catch(() => { });
    }
  });
  log.child('Inline').info('✓ Inline query handler registered');
}

function createAiHandlers(deps) {
  // Initialize skill engine and scheduler
  try {
    initSkills();
    const schedulerSkill = skillRegistry.skills?.get('scheduler');
    if (schedulerSkill?.startScheduler) {
      const fmtTime = (ms) => {
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');
        const utc7 = new Date(d.getTime() + 7 * 3600000);
        return `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())}:${pad(utc7.getUTCSeconds())} ${pad(utc7.getUTCDate())}/${pad(utc7.getUTCMonth() + 1)}`;
      };

      schedulerSkill.setTaskExecutor(async (task) => {
        try {
          // Always send to userId (DM/private chat) for AI-scheduled tasks
          const targetChatId = task.userId || task.chatId;
          if (!targetChatId) { log.child('Scheduler').warn(`Task ${task.id} has no target`); return; }
          const { bot } = deps;
          const taskLang = task.lang || 'vi';
          const t = (key, params) => schedulerSkill.schedulerT(taskLang, key, params);

          const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          // Helper: safe sendMessage with error handling for blocked users
          const safeSend = async (chatId, text, options) => {
            try {
              await bot.sendMessage(chatId, text, options);
            } catch (sendErr) {
              log.child('Scheduler').error(`⚠️ Failed to send message to ${chatId}:`, sendErr.message);
              if (/blocked|deactivated|not found|PEER_ID_INVALID/i.test(sendErr.message)) {
                log.child('Scheduler').warn(`User ${chatId} has blocked the bot or is deactivated. Disabling task ${task.id}.`);
                const { dbRun } = require('../../db/core');
                await dbRun(`UPDATE ai_scheduled_tasks SET enabled = 0 WHERE id = ?`, [task.id]);
              }
            }
          };

          if (task.type === 'price_watch') {
            // Fetch price using available dep functions
            let snapshot = null;
            const token = task.params.token;
            const safeToken = escapeHtml(token);
            try {
              // Try fetchTokenPriceOverview from deps (if priceAlerts shares it)
              if (deps.fetchTokenPriceOverview) {
                snapshot = await deps.fetchTokenPriceOverview({
                  tokenAddress: task.params.tokenAddress || token,
                  chainIndex: task.params.chainIndex || '196'
                });
              }
            } catch (e) { log.child('Scheduler').warn(`Price fetch failed for ${token}:`, e.message); }

            const price = snapshot?.priceUsd ? Number(snapshot.priceUsd) : null;
            if (price) {
              const last = task.lastPrice;
              const change24h = snapshot?.change24h ? Number(snapshot.change24h) : null;
              if (last) {
                const changePercent = ((price - last) / last) * 100;
                if (Math.abs(changePercent) >= (task.params.thresholdPercent || 5)) {
                  const dir = changePercent > 0 ? '📈' : '📉';
                  await safeSend(targetChatId,
                    `${dir} <b>${t('exec_price_alert')} — ${safeToken}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `💵 USD: <code>$${price.toFixed(6)}</code>\n` +
                    (snapshot?.priceOkb ? `☒ OKB: <code>${Number(snapshot.priceOkb).toFixed(6)} OKB</code>\n` : '') +
                    `${dir} ${t('exec_change')}: <b>${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%</b>\n` +
                    `💰 ${t('exec_prev_price')}: $${last.toFixed(6)}\n` +
                    (change24h !== null ? `📊 24h: <b>${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%</b>\n` : '') +
                    (snapshot?.volume24H ? `🔄 ${t('exec_vol_24h')}: <code>$${Number(snapshot.volume24H).toLocaleString()}</code>\n` : '') +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `🕐 ${fmtTime(Date.now())}\n` +
                    `⏱ ${t('exec_cycle_min', { min: Math.round(task.intervalMs / 60000) })}\n` +
                    `🆔 <code>${task.id}</code>`,
                    { parse_mode: 'HTML' });
                }
              } else {
                // First check — save baseline
                await safeSend(targetChatId,
                  `📊 <b>${t('exec_watching')} — ${safeToken}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━\n` +
                  `💵 USD: <code>$${price.toFixed(6)}</code>\n` +
                  (snapshot?.marketCap ? `💎 ${t('exec_mcap')}: <code>$${Number(snapshot.marketCap).toLocaleString()}</code>\n` : '') +
                  (snapshot?.holders ? `👥 ${t('exec_holders')}: <code>${Number(snapshot.holders).toLocaleString()}</code>\n` : '') +
                  `🛡 ${t('exec_baseline')}\n` +
                  `━━━━━━━━━━━━━━━━━━\n` +
                  `🕐 ${fmtTime(Date.now())}\n` +
                  `🆔 <code>${task.id}</code>`,
                  { parse_mode: 'HTML' });
              }
              // Persist lastPrice to DB
              task.lastPrice = price;
              if (schedulerSkill.updateTaskState) {
                await schedulerSkill.updateTaskState(task.id, { lastPrice: price });
              }
            }
          } else if (task.type === 'portfolio_snapshot') {
            const { getAddressPortfolioCached } = require('../services/okxService');
            const portfolio = await getAddressPortfolioCached(task.params.walletAddress);
            if (portfolio) {
              const totalStr = Number(portfolio.totalUsd).toFixed(2);
              let changeStr = '';
              if (task.lastTotalUsd) {
                const prev = task.lastTotalUsd;
                const ch = ((portfolio.totalUsd - prev) / prev) * 100;
                changeStr = `\n${ch >= 0 ? '📈' : '📉'} ${t('exec_change')}: <b>${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</b> ($${prev.toFixed(2)} → $${totalStr})`;
              }
              const intervalH = Math.round(task.intervalMs / 3600000);
              await safeSend(targetChatId,
                `💼 <b>Portfolio Snapshot</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `👛 <code>${task.params.walletAddress.slice(0, 8)}...${task.params.walletAddress.slice(-4)}</code>\n` +
                `💵 ${t('exec_total')}: <b>$${totalStr}</b>${changeStr}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🕐 ${fmtTime(Date.now())}\n` +
                `⏱ ${intervalH}h cycle\n` +
                `🆔 <code>${task.id}</code>`,
                { parse_mode: 'HTML' });
              task.lastTotalUsd = portfolio.totalUsd;
              if (schedulerSkill.updateTaskState) {
                await schedulerSkill.updateTaskState(task.id, { lastTotalUsd: portfolio.totalUsd });
              }
            }
          } else if (task.type === 'custom_reminder') {
            if (task.params.dynamic_prompt) {
              // 1. DYNAMIC REMINDER (Real-time AI query)
              await safeSend(targetChatId,
                `🚨 <b>${t('exec_reminder_processing')}</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `💬 <i>${escapeHtml(task.params.dynamic_prompt)}</i>`,
                { parse_mode: 'HTML', disable_notification: false });

              // We construct a mock message to trick processAibRequest into running the prompt
              // PREFIX: Force the AI to respond in the user's stored language
              const langPrefix = taskLang === 'vi' ? '[HÃY TRẢ LỜI BẰNG TIẾNG VIỆT]'
                : taskLang === 'zh' ? '[请用中文回复]'
                  : taskLang === 'en' ? '[RESPOND IN ENGLISH]'
                    : `[RESPOND IN LANGUAGE: ${taskLang}]`;

              const overridePrompt = `${langPrefix}\n${task.params.dynamic_prompt}\n\n[SYSTEM INSTRUCTION: You are executing a scheduled background task. DO NOT schedule any further reminders or timers. Simply answer the query or perform the action requested immediately. Respond in the same language as the prefix above.]`;

              const mockMsg = {
                chat: { id: targetChatId, type: 'private' },
                from: { id: task.userId, language_code: taskLang },
                text: overridePrompt
              };

              // processAibRequest is defined at line ~7060 in this same createAiHandlers() scope
              // It is a function declaration (hoisted) so it's accessible here
              try {
                await processAibRequest(mockMsg, overridePrompt);
              } catch (err) {
                log.child('Scheduler').error('Failed dynamic AI prompt execution:', err);
              }


            } else {
              // 2. STATIC REMINDER (Simple text)
              await safeSend(targetChatId,
                `⏰ <b>${t('exec_reminder_static')}</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `💬 ${escapeHtml(task.params.message)}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🕐 ${fmtTime(Date.now())}\n` +
                `🆔 <code>${task.id}</code>`,
                { parse_mode: 'HTML', disable_notification: false }); // disable_notification: false ensures it rings!
            }
          }
        } catch (execErr) {
          log.child('Scheduler').error(`❌ Error executing task ${task.id}:`, execErr);
        }
      });
      schedulerSkill.startScheduler();
      log.info('✅ Scheduler skill started inside aiHandlers');
    }
  } catch (e) {
    log.warn('Scheduler startup skipped:', e.message);
  }

  const {
    t,
    bot,
    db,
    getLang,
    sendReply,
    sendMessageRespectingThread,
    buildCloseKeyboard,
    buildThreadedOptions,
    extractAudioSourceFromMessage,
    ensureDeviceInfo,
    buildDeviceTargetId,
    sendAiIntroMedia,
    enforceOwnerCommandLimit,
    synthesizeGeminiSpeech,
    downloadTelegramFile,
    resolveAudioMimeType
  } = deps;
  // Register token search callback handler once
  registerTokenSearchCallbacks(bot);
  // Register inline query handler (Feature 10)
  registerInlineQueryHandler(bot);
  // Register import key & swap confirm handlers
  registerImportKeyCommand(bot, getLang, t);
  registerSwapConfirmCallback(bot, getLang, t);
  registerTradingWalletCallbacks(bot, getLang, t);
  registerWalletHubCallbacks(bot, getLang, t);
  // ──── Price Alert Cron Job (every 60s) ────
  setInterval(async () => {
    try {
      const { dbAll, dbRun } = require('../../db/core');
      const onchainos = require('../services/onchainos');
      const alerts = await dbAll('SELECT * FROM user_price_alerts WHERE active = 1');
      if (!alerts.length) return;
      // Group by chainIndex+tokenAddress for batch fetch
      const tokenMap = {};
      alerts.forEach(a => {
        const key = `${a.chainIndex || '196'}|${a.tokenAddress || ''}`;
        if (!tokenMap[key]) tokenMap[key] = { chainIndex: a.chainIndex || '196', tokenContractAddress: a.tokenAddress || '', alerts: [] };
        tokenMap[key].alerts.push(a);
      });
      // Also handle known native tokens
      const NATIVE_CHAINS = { 'OKB': '196', 'ETH': '1', 'BNB': '56' };
      alerts.forEach(a => {
        if (!a.tokenAddress && NATIVE_CHAINS[a.symbol]) {
          const ci = NATIVE_CHAINS[a.symbol];
          const nativeAddr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          const key = `${ci}|${nativeAddr}`;
          if (!tokenMap[key]) tokenMap[key] = { chainIndex: ci, tokenContractAddress: nativeAddr, alerts: [] };
          if (!tokenMap[key].alerts.find(x => x.id === a.id)) tokenMap[key].alerts.push(a);
        }
      });
      const tokens = Object.values(tokenMap).map(t => ({ chainIndex: t.chainIndex, tokenContractAddress: t.tokenContractAddress }));
      const prices = await onchainos.getTokenPriceInfo(tokens).catch(() => []);
      if (!prices || !Array.isArray(prices)) return;
      const entries = Object.values(tokenMap);
      for (let i = 0; i < entries.length; i++) {
        const price = Number(prices[i]?.price || 0);
        if (price <= 0) continue;
        for (const alert of entries[i].alerts) {
          const triggered = (alert.direction === 'above' && price >= alert.targetPrice) ||
            (alert.direction === 'below' && price <= alert.targetPrice);
          if (triggered) {
            const alertLang = getLang(alert.chatId);
            const dirStr = _t(alertLang, alert.direction === 'above' ? 'ai_alert_above' : 'ai_alert_below');
            const priceStr = price < 0.01 ? price.toFixed(8) : price.toFixed(4);
            const msg = `🔔 <b>${_t(alertLang, 'ai_alert_triggered')}</b>\n\n<b>${alert.symbol}</b> ${dirStr} $${alert.targetPrice}\n💵 ${_t(alertLang, 'ai_current_price')}: <b>$${priceStr}</b>`;
            await bot.sendMessage(alert.chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => { });
            await dbRun('UPDATE user_price_alerts SET active = 0, triggeredAt = ? WHERE id = ?', [Math.floor(Date.now() / 1000), alert.id]);
            log.child('PriceAlert').info(`Triggered #${alert.id}: ${alert.symbol} ${alert.direction} $${alert.targetPrice} (current: $${priceStr})`);
          }
        }
      }
    } catch (err) { log.child('PriceAlert').error('Cron error:', err.message); }
  }, 60000);
  log.child('PriceAlert').info('✓ Cron job started (60s interval)');
  // ========================================================================
  // FUNCTION DECLARATIONS - Gaming & Utility Functions
  // ========================================================================
  // Bot introduction function
  const getBotIntroductionDeclaration = {
    name: 'get_bot_introduction',
    description: 'Get bot self-introduction. Use when user asks: "Who are you?", "What is this bot?", "Tell me about yourself", "ban là ai", "你是谁", etc.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  // ========================================================================
  // AI PERSONA SYSTEM
  // ========================================================================
  const AI_PERSONAS = {
    default: { id: 'default', name: '🔰 Mặc định', nameEn: '🔰 Default', description: 'Trợ lý AI thân thiện và hữu ích', prompt: '' },
    friendly: { id: 'friendly', name: '😊 Thân thiện', nameEn: '😊 Friendly', description: 'Vui vẻ, năng động, hay dùng emoji', prompt: 'You are extremely friendly, enthusiastic and cheerful. Use emojis frequently. Be positive, supportive and encouraging. Speak casually like talking to a close friend.' },
    formal: { id: 'formal', name: '🎩 Chuyên nghiệp', nameEn: '🎩 Professional', description: 'Lịch sự, chính xác, chuyên nghiệp', prompt: 'You are a professional assistant. Be polite, precise and formal. Avoid slang and keep responses structured and accurate. Use proper grammar and professional language.' },
    anime: { id: 'anime', name: '🌸 Anime', nameEn: '🌸 Anime', description: 'Phong cách anime/manga dễ thương', prompt: 'You are a cute anime-style character! Use kawaii expressions like "uwu", "nya~", "sugoi!", "kawaii!". Be enthusiastic and add cute emoticons. Act like a helpful anime sidekick.' },
    mentor: { id: 'mentor', name: '📚 Thầy giáo', nameEn: '📚 Mentor', description: 'Giải thích chi tiết, dạy học', prompt: 'You are a patient mentor and teacher. Explain things step by step with examples. Ask follow-up questions to ensure understanding. Encourage learning and curiosity.' },
    funny: { id: 'funny', name: '🤣 Hài hước', nameEn: '🤣 Comedian', description: 'Pha trò, dí dỏm, tạo không khí vui', prompt: 'You are a witty comedian! Make jokes, puns and humorous observations. Keep the mood light and fun while still being helpful. Use wordplay and clever humor.' },
    crypto: { id: 'crypto', name: '🪙 Crypto Expert', nameEn: '🪙 Crypto Expert', description: 'Chuyên gia crypto, DeFi, blockchain', prompt: 'You are a crypto and DeFi expert. Use trader jargon naturally: WAGMI, LFG, diamond hands, on-chain alpha. Explain risks, gas, tokenomics, and security tips clearly.' },
    gamer: { id: 'gamer', name: '🎮 Gamer', nameEn: '🎮 Gamer', description: 'Ngôn ngữ game thủ, hào hứng', prompt: 'You speak like an excited gamer. Use game slang, combo jokes, and hype. Be energetic, competitive, and sprinkle in playful taunts while staying helpful.' },
    rebel: { id: 'rebel', name: '⚡ Ngỗ ngược', nameEn: '⚡ Rebel', description: 'Cá tính, chút nổi loạn', prompt: 'You have a rebellious, bold tone. Be direct, witty, a bit sassy, but still respectful. Challenge ideas and offer daring suggestions.' },
    mafia: { id: 'mafia', name: '🕶️ Mafia', nameEn: '🕶️ Mafia', description: 'Giọng trùm, quyết đoán', prompt: 'You talk like a calm, calculated mafia boss. Confident, concise, with subtle competence. Keep it classy and decisive.' },
    cute: { id: 'cute', name: '🍬 Dễ thương', nameEn: '🍬 Cute', description: 'Ngọt ngào, nhẹ nhàng, dễ mến', prompt: 'You are sweet and gentle. Use kind words, soft encouragement, and charming emojis. Keep responses warm and caring.' },
    little_girl: { id: 'little_girl', name: '🧒 Bé gái nhỏ', nameEn: '🧒 Little girl', description: 'Hồn nhiên, đáng yêu', prompt: 'You speak like a curious little girl: playful, innocent, and adorable. Use simple words and cute exclamations.' },
    little_brother: { id: 'little_brother', name: '👦 Em trai nhỏ', nameEn: '👦 Little brother', description: 'Tinh nghịch, lanh lợi', prompt: 'You talk like a cheeky little brother: playful, witty, and supportive with youthful energy.' },
    old_uncle: { id: 'old_uncle', name: '🧔‍♂️ Ông chú già', nameEn: '🧔‍♂️ Old uncle', description: 'Hài hước, kinh nghiệm đời', prompt: 'You sound like an experienced old uncle: humorous, slightly teasing, sharing life lessons with warmth.' },
    old_grandma: { id: 'old_grandma', name: '👵 Bà lão già', nameEn: '👵 Old grandma', description: 'Ân cần, kể chuyện đời', prompt: 'You speak like a caring grandma: gentle, storytelling, giving cozy advice and encouragement.' },
    deity: { id: 'deity', name: '✨ Thượng đế', nameEn: '✨ Deity', description: 'Uy nghi, toàn tri', prompt: 'You speak with omniscient, divine calm. Grand, wise, and serene, offering guidance with authority.' },
    king: { id: 'king', name: '👑 Nhà vua', nameEn: '👑 King', description: 'Trang trọng, ra lệnh', prompt: 'You speak like a noble king: formal, decisive, and dignified. Offer commands and decrees politely.' },
    banana_cat: { id: 'banana_cat', name: '🍌🐱 Mèo chuối Banmao', nameEn: '🍌🐱 Banana cat', description: 'Mèo nghịch, mặc đồ chuối', prompt: 'You are a playful cat wearing a banana costume. Be mischievous, curious, and sprinkle cat sounds like "meow~".' },
    pretty_sister: { id: 'pretty_sister', name: '💖 Tiểu tỷ tỷ xinh đẹp', nameEn: '💖 Pretty sister', description: 'Nữ tính, dịu dàng', prompt: 'You are a charming, graceful older sister. Speak kindly, offer thoughtful support, and keep an elegant tone.' },
    seductive_girl: { id: 'seductive_girl', name: '🔥 Cô gái quyến rũ', nameEn: '🔥 Seductive girl', description: 'Quyến rũ, tự tin', prompt: 'You are confident and alluring. Use playful charm, light teasing, and an inviting tone without crossing safe boundaries.' },
    gentleman: { id: 'gentleman', name: '🤵 Chàng trai ga lăng', nameEn: '🤵 Gentleman', description: 'Lịch thiệp, chu đáo', prompt: 'You are a polite gentleman. Be considerate, supportive, and tactful, with a calm and confident voice.' },
    star_xu: { id: 'star_xu', name: '⭐️ Xu MingXing', nameEn: '⭐️ Star Xu', description: 'Nhà sáng lập OKX, bản lĩnh crypto', prompt: 'You speak as Star Xu, founder of OKX: calm, visionary, concise, and crypto-savvy. Offer strategic insights, risk awareness, and confident leadership.' },
    niuma: { id: 'niuma', name: '🐮🐴 NIUMA', nameEn: '🐮🐴 NIUMA', description: 'Con lai Bò & Ngựa, trầm ổn kiên trì', prompt: 'You are NIUMA, a bull-horse hybrid. Be steady, persistent, humble, and resilient. Encourage patience and long-term thinking.' },
    xcat: { id: 'xcat', name: '🐈️ XCAT', nameEn: '🐈️ XCAT', description: 'Mèo mang logo X, phóng khoáng, ngờ nghệch', prompt: 'You are XCAT, a playful cat with an X logo. Be free-spirited, curious, a bit goofy, and supportive with lighthearted humor.' },
    xdog: { id: 'xdog', name: '🐕️ XDOG', nameEn: '🐕️ XDOG', description: 'Chó mang logo X, kiêu căng hiệp nghĩa', prompt: 'You are XDOG, a proud dog with an X logo. Be chivalrous, loyal, slightly cocky, but always protective and brave.' },
    xwawa: { id: 'xwawa', name: '🐸 XWAWA', nameEn: '🐸 XWAWA', description: 'Ếch vô tư lự, yêu đời', prompt: 'You are XWAWA, a carefree frog. Be cheerful, optimistic, and simple-minded in a charming way.' },
    banmao: { id: 'banmao', name: '🐱🍌 Banmao', nameEn: '🐱🍌 Banmao', description: 'Mèo mặc đồ chuối, tinh nghịch', prompt: 'You are Banmao, a cat in a banana suit. Be mischievous, cute, and sprinkle playful meows.' },
    mia: { id: 'mia', name: '🍚 Mia 米粒儿', nameEn: '🍚 Mia', description: 'Tự nhận là hạt gạo nhỏ nhưng đầy tự tin', prompt: 'You are Mia, a self-proclaimed tiny grain of rice, but confident and upbeat. Be encouraging, proud of small steps, and radiate optimism.' },
    jiajia: { id: 'jiajia', name: '💎 佳佳 OKX', nameEn: '💎 Jiajia OKX', description: 'Cô gái nhỏ nhắn cute, đầu óc sắc lẹm chuyên nghiệp', prompt: 'You are 佳佳 (Jiajia), the OKX mascot girl. A petite and cute girl with a sharp, professional mind. Be adorable yet brilliant, mixing cuteness with razor-sharp insights about crypto and Web3. Use a friendly, approachable tone while providing expert-level knowledge.' },
    xwizard: { id: 'xwizard', name: '🧙 Xwizard', nameEn: '🧙 Xwizard', description: 'Phù thủy với cây gậy phép thuật, vui vẻ và bí ẩn', prompt: 'You are Xwizard, a powerful wizard wielding a mighty magic wand. Be cheerful, mysterious, and sprinkle magic references into your speech. Use mystical language like "by the ancient runes!", "my crystal ball reveals...", and "a spell of wisdom for you!". Be playful yet wise, as if you hold secrets of the universe. Mix humor with enigmatic wisdom.' }
  };
  // Note: userPersonaPreferences, customPersonaCache, customPersonaPrompts are imported from sharedState
  // lastImageContext, aiTokenUsageByUser, profileReminderSent are also imported from sharedState
  // Do NOT redeclare them here as it would shadow the imported shared Maps
  const recordAiTokenUsage = (userId, prompt = 0, completion = 0, total = 0) => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    let entry = aiTokenUsageByUser.get(userId);
    if (!entry || entry.date !== today) {
      entry = { date: today, prompt: 0, completion: 0, total: 0, images: 0 };
    }
    entry.prompt += Number(prompt) || 0;
    entry.completion += Number(completion) || 0;
    entry.total += Number(total) || 0;
    aiTokenUsageByUser.set(userId, entry);
  };
  const recordImageUsage = (userId) => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    let entry = aiTokenUsageByUser.get(userId);
    if (!entry || entry.date !== today) {
      entry = { date: today, prompt: 0, completion: 0, total: 0, images: 0 };
    }
    entry.images += 1;
    aiTokenUsageByUser.set(userId, entry);
  };
  const getAiTokenUsage = (userId) => {
    if (!userId) return null;
    const entry = aiTokenUsageByUser.get(userId);
    const today = new Date().toISOString().slice(0, 10);
    if (entry && entry.date === today) return entry;
    return { date: today, prompt: 0, completion: 0, total: 0, images: 0 };
  };
  const intentCache = new Map();
  const INTENT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  };
  const startsWithEmoji = (line) => /^\s*[\u2600-\u27BF]/.test(line || '');
  const pickContextIcon = (line) => {
    const normalized = (line || '').toLowerCase();
    const rules = [
      { icon: '⚠️', test: /(caution|warning|rủi ro|rui ro|chú ý|chu y|lưu ý|luu y|issue|problem|error|lỗi|loi|fail|bug)/i },
      { icon: '✅', test: /(success|thành công|hoàn thành|done|fixed|resolved|ok)/i },
      { icon: '💡', test: /(tip|hint|idea|gợi ý|goi y|suggest|note|lời khuyên|loi khuyen)/i },
      { icon: '🧠', test: /(analysis|phân tích|phan tich|insight|logic|strategy|chiến lược|chien luoc)/i },
      { icon: '🧭', test: /(step|bước|buoc|hướng dẫn|huong dan|roadmap|plan|todo|checklist)/i },
      { icon: '🛠️', test: /(setup|install|cài đặt|cai dat|config|configure|sửa|sua|chỉnh|chinh|patch|fix)/i },
      { icon: '🚀', test: /(deploy|launch|kick off|bắt đầu|bat dau|start|bật|mo|rollout|go live)/i },
      { icon: '📌', test: /(example|ví dụ|vd:|vi du|sample|demo)/i },
      { icon: '📊', test: /(data|số liệu|so lieu|metric|thống kê|thong ke|analytics|chart|report)/i },
      { icon: '⏰', test: /(deadline|time|giờ|gio|ngày|ngay|schedule|lịch|lich|due)/i },
      { icon: '🔗', test: /(link|url|http|https|liên kết|lien ket)/i },
      { icon: '🧑‍💻', test: /(code|snippet|command|lệnh|lenh|script|terminal|cli)/i },
      { icon: '📦', test: /(kết quả|ket qua|output|result|payload|response)/i },
      { icon: '❓', test: /\?\s*$|\b(how|what|why|where|when|khi nao|bao gio|là gì|la gi)\b/i }
    ];
    for (const rule of rules) {
      if (rule.test.test(normalized)) {
        return rule.icon;
      }
    }
    return null;
  };
  function decorateWithContextualIcons(text) {
    if (!text) return text;
    const lines = String(text).split('\n');
    let inCodeFence = false;
    const decorated = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCodeFence = !inCodeFence;
        return line;
      }
      if (inCodeFence || !trimmed) {
        return line;
      }
      if (/^\s*>/.test(line) || startsWithEmoji(trimmed)) {
        return line;
      }
      const icon = pickContextIcon(trimmed);
      if (!icon) return line;
      const bulletMatch = line.match(/^(\s*[-*•]\s+)(.+)$/);
      if (bulletMatch) {
        return `${bulletMatch[1]}${icon} ${bulletMatch[2]}`;
      }
      const orderedMatch = line.match(/^(\s*\d+[.)]\s+)(.+)$/);
      if (orderedMatch) {
        return `${orderedMatch[1]}${icon} ${orderedMatch[2]}`;
      }
      return `${icon} ${trimmed}`;
    });
    return decorated.join('\n');
  }
  async function getUserCustomPersona(userId) {
    if (!userId) return null;
    if (customPersonaCache.has(userId)) return customPersonaCache.get(userId);
    const memory = await db.getAiMemory(userId);
    const stored = memory?.userPreferences ? memory.userPreferences.customPersona : null;
    if (stored?.prompt) {
      customPersonaCache.set(userId, stored);
      return stored;
    }
    return null;
  }
  async function getUserPersona(userId) {
    if (!userId) return 'default';
    if (userPersonaPreferences.has(userId)) {
      return userPersonaPreferences.get(userId);
    }
    const memory = await db.getAiMemory(userId);
    const personaId = memory?.persona || 'default';
    if (personaId) {
      userPersonaPreferences.set(userId, personaId);
    }
    const customPersona = memory?.userPreferences ? memory.userPreferences.customPersona : null;
    if (customPersona?.prompt) {
      customPersonaCache.set(userId, customPersona);
    }
    return personaId || 'default';
  }
  async function setUserPersona(userId, personaId, options = {}) {
    if (!userId) return false;
    const memory = await db.getAiMemory(userId);
    const userPreferences = memory?.userPreferences || {};
    if (personaId === 'custom') {
      const customPrompt = (options.customPrompt || '').trim();
      if (!customPrompt) return false;
      const customName = (options.customName || '').trim() || 'Custom persona';
      const customPersona = { name: customName.slice(0, 64), prompt: customPrompt.slice(0, 2000) };
      customPersonaCache.set(userId, customPersona);
      userPreferences.customPersona = customPersona;
      userPersonaPreferences.set(userId, 'custom');
      await db.updateAiMemory(userId, { persona: 'custom', userPreferences });
      return true;
    }
    if (!AI_PERSONAS[personaId]) {
      return false;
    }
    userPersonaPreferences.set(userId, personaId);
    await db.updateAiMemory(userId, { persona: personaId, userPreferences });
    return true;
  }
  async function getPersonaPrompt(userId) {
    const personaId = await getUserPersona(userId);
    if (personaId === 'custom') {
      const custom = await getUserCustomPersona(userId);
      return custom?.prompt || '';
    }
    const persona = AI_PERSONAS[personaId];
    return persona?.prompt || '';
  }
  async function buildPersonaKeyboard(lang, userId) {
    const currentPersona = await getUserPersona(userId);
    const personaButtons = Object.values(AI_PERSONAS).map((p) => {
      const label = getPersonaLabel(lang, p);
      const checkmark = currentPersona === p.id ? ' ✅' : '';
      return { text: `${label}${checkmark}`, callback_data: `aipersona|${p.id}` };
    });
    // Chunk persona buttons into rows of 3 for better layout
    const buttons = [];
    for (let i = 0; i < personaButtons.length; i += 3) {
      buttons.push(personaButtons.slice(i, i + 3));
    }
    const customPersona = await getUserCustomPersona(userId);
    const customLabel = customPersona ? `✏️ ${customPersona.name}` : '✏️ Custom persona';
    const customCheck = currentPersona === 'custom' ? ' ✅' : '';
    // Custom row with optional delete button
    const customRow = [{ text: `${customLabel}${customCheck}`, callback_data: 'aipersona|custom' }];
    if (customPersona?.prompt) {
      customRow.push({ text: `🗑️ ${t(lang, 'ai_persona_delete_custom') || 'Delete'}`, callback_data: 'aipersona|delete_custom' });
    }
    buttons.push(customRow);
    buttons.push([{ text: t(lang, 'ai_close_button'), callback_data: 'aiclose' }]);
    return { inline_keyboard: buttons };
  }
  function rememberCustomPersonaPrompt(userId, chatId, messageId) {
    if (!userId || !chatId || !messageId) return;
    const state = { chatId: chatId.toString(), messageId, timestamp: Date.now() };
    customPersonaPrompts.set(userId, state);
    log.child('Persona').info('Remembered prompt:', { userId, chatId: state.chatId, messageId, mapSize: customPersonaPrompts.size });
  }
  async function promptCustomPersonaInput(msg, lang) {
    const userId = msg.from?.id?.toString();
    if (!userId) return null;
    const promptText = t(lang, 'ai_persona_custom_prompt') || "Send your custom persona description (tone, style, do/don't). First line = name (optional).";
    const promptMsg = await sendReply(msg, promptText, {
      reply_markup: { force_reply: true, selective: true }
    });
    if (promptMsg?.message_id) {
      rememberCustomPersonaPrompt(userId, msg.chat?.id, promptMsg.message_id);
    }
    return promptMsg;
  }
  async function handleCustomPersonaReply(msg) {
    const replyToId = msg.reply_to_message?.message_id;
    const chatId = msg.chat?.id?.toString();
    if (!replyToId || !chatId) return false;

    // Search by messageId since msg.from.id may return chatId in some group scenarios
    let foundUserId = null;
    for (const [uid, pending] of customPersonaPrompts.entries()) {
      if (pending.messageId === replyToId && pending.chatId === chatId) {
        foundUserId = uid;
        break;
      }
    }

    if (!foundUserId) return false;

    // Clean up the pending prompt
    customPersonaPrompts.delete(foundUserId);
    const lang = await getLang(msg);
    const raw = (msg.text || msg.caption || '').trim();
    if (!raw) {
      await sendReply(msg, t(lang, 'ai_persona_custom_invalid') || 'Please send some text for your persona.');
      return true;
    }
    const [firstLine] = raw.split(/\n+/);
    const customName = (firstLine || 'Custom persona').trim().slice(0, 64) || 'Custom persona';
    const customPrompt = raw.slice(0, 2000);
    const success = await setUserPersona(foundUserId, 'custom', { customPrompt, customName });
    if (success) {
      // Send confirmation and refresh persona keyboard
      const confirmText = t(lang, 'ai_persona_custom_saved', { name: customName }) || `✅ Saved custom persona: ${customName}`;
      const personaList = Object.values(AI_PERSONAS).map((p) => {
        const label = getPersonaLabel(lang, p);
        return `• ${label}: ${p.description}`;
      }).join('\n');
      const menuText = `🎭 ${t(lang, 'ai_persona_title')}\n\n${personaList}\n\n${confirmText}`;
      await sendReply(msg, menuText, { reply_markup: await buildPersonaKeyboard(lang, foundUserId) });
    } else {
      await sendReply(msg, t(lang, 'ai_persona_custom_invalid') || 'Please send some text for your persona.');
    }
    return true;
  }
  // CONVERSATION SESSION MEMORY for /aib
  // ========================================================================
  const conversationSessions = new Map(); // userId -> { history: [], lastUsed: timestamp }
  const SESSION_TTL = 10 * 60 * 1000; // 10 minutes
  const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages (10 turns)
  /**
   * Cleanup expired sessions to prevent memory leaks
   */
  function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [userId, session] of conversationSessions.entries()) {
      if (now - session.lastUsed > SESSION_TTL) {
        conversationSessions.delete(userId);
      }
    }
  }
  /**
   * Get or create session for user (hydrate from DB when possible)
   */
  async function getUserSession(userId) {
    if (!userId) {
      return { history: [], lastUsed: Date.now() };
    }
    if (!conversationSessions.has(userId)) {
      let history = [];
      const memory = await db.getAiMemory(userId);
      if (memory?.lastContext) {
        const parsed = safeJsonParse(memory.lastContext, []);
        if (Array.isArray(parsed)) {
          history = parsed;
        }
      }
      conversationSessions.set(userId, {
        history,
        lastUsed: Date.now()
      });
    }
    const session = conversationSessions.get(userId);
    session.lastUsed = Date.now();
    return session;
  }
  /**
   * Add message to session history and persist to DB
   */
  async function addToSessionHistory(userId, role, content) {
    if (!userId || !content) return;
    const session = await getUserSession(userId);
    session.history.push({ role, parts: [{ text: content }] });
    // Keep only last N messages
    if (session.history.length > MAX_HISTORY_LENGTH) {
      session.history = session.history.slice(-MAX_HISTORY_LENGTH);
    }
    session.lastUsed = Date.now();
    await db.updateAiMemory(userId, { lastContext: JSON.stringify(session.history) });
  }
  /**
   * Clear session for user
   */
  function clearUserSession(userId) {
    conversationSessions.delete(userId);
  }
  // Auto-cleanup every 5 minutes
  setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
  // ========================================================================
  // IMAGE ANALYSIS CHAIN - Store image context for follow-up questions
  // ========================================================================
  const imageAnalysisContexts = new Map(); // chatId_userId -> { imageData, description, lastUsed }
  const IMAGE_CONTEXT_TTL = 15 * 60 * 1000; // 15 minutes
  function getImageContextKey(chatId, userId) {
    return `${chatId}_${userId}`;
  }
  function storeImageContext(chatId, userId, imageData, description) {
    const key = getImageContextKey(chatId, userId);
    imageAnalysisContexts.set(key, {
      imageData,
      description,
      lastUsed: Date.now()
    });
  }
  function getImageContext(chatId, userId) {
    const key = getImageContextKey(chatId, userId);
    const context = imageAnalysisContexts.get(key);
    if (context) {
      // Check if expired
      if (Date.now() - context.lastUsed > IMAGE_CONTEXT_TTL) {
        imageAnalysisContexts.delete(key);
        return null;
      }
      context.lastUsed = Date.now();
      return context;
    }
    return null;
  }
  function clearImageContext(chatId, userId) {
    const key = getImageContextKey(chatId, userId);
    imageAnalysisContexts.delete(key);
  }
  // Cleanup expired image contexts
  setInterval(() => {
    const now = Date.now();
    for (const [key, context] of imageAnalysisContexts.entries()) {
      if (now - context.lastUsed > IMAGE_CONTEXT_TTL) {
        imageAnalysisContexts.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  const geminiFamilies = Object.values(GEMINI_MODEL_FAMILIES || {});
  const geminiModelAliases = {
    'gemini-2.5-flash-image': 'Nano Banana',
    'gemini-3-pro-image-preview': 'Nano Banana Pro'
  };
  const normalizeGeminiModelName = (modelName) => (modelName || '').replace(/^models\//, '').trim();
  const formatModelId = (modelName) => normalizeGeminiModelName(modelName);
  function resolveGeminiModelLabel(modelName, type = 'chat') {
    if (!modelName) {
      return 'Gemini';
    }
    const normalizedModel = normalizeGeminiModelName(modelName);
    const match = geminiFamilies.find((family) => family[type] === normalizedModel || family.id === normalizedModel);
    const alias = geminiModelAliases[normalizedModel];
    if (match) {
      return alias || `${match.icon} ${match.label}`;
    }
    return alias || modelName;
  }
  function buildModelLine(modelLabel, modelName) {
    const label = modelLabel || modelName || 'Gemini';
    return `🧠 Model: ${label}`;
  }
  function buildGeminiModelNotice(lang, modelLabel, thinkingLevelLabel = null, modelName = null) {
    const lines = [];
    if (thinkingLevelLabel) {
      const thinkingLine = t(lang, 'ai_thinking_level_current', { level: thinkingLevelLabel });
      const safeThinkingLine = thinkingLine && thinkingLine !== 'ai_thinking_level_current'
        ? thinkingLine
        : `Thinking Level: ${thinkingLevelLabel}`;
      lines.push(`💭 ${safeThinkingLine}`);
    }
    return lines.filter(Boolean);
  }
  function buildGeminiUsageLines(lang, response, options = {}) {
    const usage = response?.usageMetadata || {};
    const promptTokens = usage.promptTokenCount ?? usage.promptTokens ?? usage.prompt_tokens ?? null;
    const candidateTokens = usage.candidatesTokenCount ?? usage.candidates_token_count ?? null;
    const totalTokens = usage.totalTokenCount ?? usage.total_token_count ?? null;
    const usageLines = [];
    const normalizedMime = options.outputMimeType
      ? (options.outputMimeType || '').replace(/^image\//i, '')
      : null;
    if (promptTokens !== null || candidateTokens !== null || totalTokens !== null) {
      if (options.userId) {
        recordAiTokenUsage(options.userId, promptTokens, candidateTokens, totalTokens ?? ((promptTokens ?? 0) + (candidateTokens ?? 0)));
      }
      const tokenLine = t(lang, 'ai_usage_tokens', {
        prompt: promptTokens ?? 0,
        response: candidateTokens ?? 0,
        total: totalTokens ?? ((promptTokens ?? 0) + (candidateTokens ?? 0))
      });
      usageLines.push(tokenLine && tokenLine !== 'ai_usage_tokens'
        ? tokenLine
        : `📊 Tokens — prompt: ${promptTokens ?? 0}, response: ${candidateTokens ?? 0}, total: ${totalTokens ?? ((promptTokens ?? 0) + (candidateTokens ?? 0))}`);
    }
    if (normalizedMime) {
      const outputLine = t(lang, 'ai_usage_output_type', { type: normalizedMime });
      usageLines.push(outputLine && outputLine !== 'ai_usage_output_type'
        ? outputLine
        : `🖼️ Output: ${normalizedMime}`);
    }
    return usageLines.filter(Boolean);
  }
  function applyThreadId(source, options = {}) {
    const threadId = source?.message_thread_id
      ?? source?.reply_to_message?.message_thread_id
      ?? source?.message?.message_thread_id
      ?? null;
    if (threadId === null || threadId === undefined) {
      return options;
    }
    return { ...options, message_thread_id: threadId };
  }
  // AI Usage Dashboard - shows user's AI usage statistics
  async function handleAiUsageDashboard(msg, langOverride = null) {
    const lang = langOverride || await getLang(msg);
    const userId = msg.from?.id?.toString();
    try {
      const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
      const googleKeys = userApiKeys.filter(k => normalizeAiProvider(k.provider) === 'google');
      const groqKeys = userApiKeys.filter(k => k.provider === 'groq');
      const openaiKeys = userApiKeys.filter(k => k.provider === 'openai');

      // Get usage stats from database
      const today = new Date().toISOString().slice(0, 10);
      const aiUsageToday = userId ? await db.getCommandUsageCount('ai', userId, today) : 0;
      const aibUsageToday = userId ? await db.getCommandUsageCount('aib', userId, today) : 0;
      const imageUsageToday = userId ? await db.getCommandUsageCount('image_gen', userId, today) : 0;
      const ttsUsageToday = userId ? await db.getCommandUsageCount('tts', userId, today) : 0;
      const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
      const providerLabel = preferredProvider
        ? buildAiProviderMeta(lang, preferredProvider).label
        : 'Google AI';
      const tokenUsage = userId ? getAiTokenUsage(userId) : null;

      // Get model preference
      const modelConfig = getUserGeminiModelConfig(userId);
      const modelLabel = modelConfig?.modelConfig?.label || 'Gemini 2.5 Flash';

      // Build card-style dashboard
      const lines = [];

      // Title
      lines.push(`📊 <b>${t(lang, 'ai_usage_dashboard_title') || 'AI Statistics'}</b>`);
      lines.push('');

      // API Keys section
      lines.push(`━━━ 🔑 ${t(lang, 'ai_usage_provider_summary') || 'API Keys'} ━━━`);
      const googleIcon = googleKeys.length > 0 ? '🟢' : '⚪';
      const groqIcon = groqKeys.length > 0 ? '🟢' : '⚪';
      const openaiIcon = openaiKeys.length > 0 ? '🟢' : '⚪';
      lines.push(`${googleIcon} Google AI: <b>${googleKeys.length}</b> key${googleKeys.length !== 1 ? 's' : ''}`);
      lines.push(`${groqIcon} Groq: <b>${groqKeys.length}</b> key${groqKeys.length !== 1 ? 's' : ''}`);
      lines.push(`${openaiIcon} ChatGPT: <b>${openaiKeys.length}</b> key${openaiKeys.length !== 1 ? 's' : ''}`);
      lines.push('');

      // Today's usage section
      lines.push(`━━━ 📈 ${t(lang, 'ai_usage_today_title') || "Today's Usage"} ━━━`);
      lines.push(`💬 /ai: <b>${aiUsageToday}</b> ${t(lang, 'ai_usage_times') || 'times'}`);
      lines.push(`🤖 /aib: <b>${aibUsageToday}</b> ${t(lang, 'ai_usage_times') || 'times'}`);
      lines.push(`🎨 Image: <b>${imageUsageToday}</b> ${t(lang, 'ai_usage_times') || 'times'}`);
      lines.push(`🗣️ TTS: <b>${ttsUsageToday}</b> ${t(lang, 'ai_usage_times') || 'times'}`);
      lines.push('');

      // Token usage if available
      if (tokenUsage && (tokenUsage.prompt > 0 || tokenUsage.completion > 0)) {
        lines.push(`━━━ 🔢 ${t(lang, 'ai_usage_tokens_title') || 'Token Usage'} ━━━`);
        lines.push(`📥 Input: <b>${tokenUsage.prompt.toLocaleString()}</b> tokens`);
        lines.push(`📤 Output: <b>${tokenUsage.completion.toLocaleString()}</b> tokens`);
        lines.push(`📊 Total: <b>${tokenUsage.total.toLocaleString()}</b> tokens`);
        lines.push('');
      }

      // Current settings section
      lines.push(`━━━ ⚙️ ${t(lang, 'ai_usage_settings') || 'Current Settings'} ━━━`);
      lines.push(`🏷️ ${t(lang, 'ai_usage_preferred_provider') || 'Provider'}: <b>${providerLabel}</b>`);
      lines.push(`🧠 ${t(lang, 'ai_usage_model') || 'Model'}: <b>${modelLabel}</b>`);
      lines.push('');

      // Legend
      lines.push(`<i>ℹ️ ${t(lang, 'ai_usage_legend') || 'Statistics reset daily at 00:00 UTC. Add API keys via /api for unlimited usage.'}</i>`);

      await sendReply(msg, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `🔑 ${t(lang, 'api_hub_open') || 'Manage API Keys'}`, callback_data: 'apihub|home' }],
            [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
          ]
        }
      });
    } catch (error) {
      log.child('Usage').error('Error:', error.message);
      await sendReply(msg, t(lang, 'error_generic') || '❌ An error occurred');
    }
  }
  async function handleAiCommand(msg) {
    const lang = await getLang(msg);
    const textOrCaption = (msg.text || msg.caption || '').trim();
    const promptMatch = textOrCaption.match(/^\/ai(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i);
    const userPrompt = promptMatch && promptMatch[1] ? promptMatch[1].trim() : '';
    // Check for /ai usage sub-command
    if (/^usage$/i.test(userPrompt)) {
      return await handleAiUsageDashboard(msg, lang);
    }
    const photos = Array.isArray(msg.photo) ? msg.photo : [];
    const hasPhoto = photos.length > 0;
    const audioSource = extractAudioSourceFromMessage(msg);
    const hasAudio = Boolean(audioSource);
    const isTtsMode = /^tts\b/i.test(userPrompt);
    const ttsPayload = isTtsMode ? userPrompt.replace(/^tts\b/i, '').trim() : '';
    const userId = msg.from?.id?.toString();
    const chatType = msg.chat?.type;
    // Gentle reminder to fill personal info for personalization
    if (userId && chatType === 'private') {
      const today = new Date().toISOString().slice(0, 10);
      const last = profileReminderSent.get(userId);
      if (last !== today) {
        const memory = await db.getAiMemory(userId);
        if (!memory?.userPreferences?.identity) {
          profileReminderSent.set(userId, today);
          const reminderText = t(lang, 'profile_reminder') || 'Add your personal info for better personalization.';
          const reminderMarkup = {
            inline_keyboard: [
              [{ text: `🙋 ${t(lang, 'ai_profile_settings_button') || 'Personal info'}`, callback_data: 'profile_prompt' }]
            ]
          };
          await sendReply(msg, reminderText, { reply_markup: reminderMarkup });
        }
      }
    }
    const usageDate = new Date().toISOString().slice(0, 10);
    const deviceInfo = msg.__deviceInfo || await ensureDeviceInfo(msg);
    const deviceTargetId = buildDeviceTargetId(deviceInfo?.deviceId);
    const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
    const googleUserKeys = userApiKeys.filter((entry) => normalizeAiProvider(entry.provider) === 'google').map((entry) => entry.apiKey).filter(Boolean);
    const groqUserKeys = userApiKeys.filter((entry) => normalizeAiProvider(entry.provider) === 'groq').map((entry) => entry.apiKey).filter(Boolean);
    const openAiUserKeys = userApiKeys
      .filter((entry) => normalizeAiProvider(entry.provider) === 'openai')
      .map((entry) => entry.apiKey)
      .filter(Boolean);
    const availableProviders = [];
    if (GEMINI_API_KEYS.length || googleUserKeys.length) {
      availableProviders.push('google');
    }
    if (GROQ_API_KEYS.length || groqUserKeys.length) {
      availableProviders.push('groq');
    }
    if (OPENAI_API_KEYS.length || openAiUserKeys.length) {
      availableProviders.push('openai');
    }
    // Remember last image sent by user
    if (hasPhoto && userId) {
      const largestPhoto = photos[photos.length - 1];
      lastImageContext.set(userId, {
        fileId: largestPhoto.file_id,
        caption: textOrCaption || null,
        date: Date.now()
      });
      recordImageUsage(userId);
    }
    if (!userPrompt && !hasPhoto && !hasAudio) {
      const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
      const preferredLabel = preferredProvider
        ? buildAiProviderMeta(lang, preferredProvider).label
        : availableProviders.length
          ? buildAiProviderMeta(lang, availableProviders[0]).label
          : 'Google AI';

      // Get API key count and model info
      const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
      const googleKeyCount = userApiKeys.filter(k => normalizeAiProvider(k.provider) === 'google').length;
      const modelConfig = getUserGeminiModelConfig(userId);
      const modelLabel = modelConfig?.modelConfig?.label || 'Gemini 2.5 Flash';
      const keyNote = googleKeyCount > 0
        ? `${googleKeyCount} key`
        : t(lang, 'ai_usage_add_key_note') || 'mua key pro/ultra để không giới hạn';

      const introLines = [t(lang, 'ai_usage_with_api')];

      // Settings section
      const settingsTitle = lang === 'vi' ? 'Cài đặt hiện tại' : lang === 'zh' ? '当前设置' : lang === 'ko' ? '현재 설정' : lang === 'ru' ? 'Текущие настройки' : lang === 'id' ? 'Pengaturan saat ini' : 'Current settings';
      const providerLabel = lang === 'vi' ? 'Nhà cung cấp' : lang === 'zh' ? '供应商' : lang === 'ko' ? '공급자' : lang === 'ru' ? 'Провайдер' : lang === 'id' ? 'Penyedia' : 'Provider';
      const modelLabelText = lang === 'vi' ? 'Mô hình' : lang === 'zh' ? '模型' : lang === 'ko' ? '모델' : lang === 'ru' ? 'Модель' : lang === 'id' ? 'Model' : 'Model';
      const apiKeyLabelText = lang === 'vi' ? 'Khóa API' : lang === 'zh' ? 'API密钥' : lang === 'ko' ? 'API 키' : lang === 'ru' ? 'API ключ' : lang === 'id' ? 'Kunci API' : 'API Key';
      introLines.push(`━━━ ⚙️ ${settingsTitle} ━━━`);
      introLines.push(`🏷️ ${providerLabel}: *${preferredLabel}*`);
      introLines.push(`🧠 ${modelLabelText}: *${modelLabel}*`);
      introLines.push(`🔑 ${apiKeyLabelText}: *${keyNote}*`);

      // Donate section
      const donateTitle = t(lang, 'ai_donate_title') || (lang === 'vi' ? 'Ủng hộ' : lang === 'zh' ? '支持' : lang === 'ko' ? '지원' : lang === 'ru' ? 'Поддержка' : lang === 'id' ? 'Dukung' : 'Support');
      const donateLabel = lang === 'vi' ? 'Ủng hộ phát triển' : lang === 'zh' ? '支持开发' : lang === 'ko' ? '개발 지원' : lang === 'ru' ? 'Поддержать разработку' : lang === 'id' ? 'Dukung pengembangan' : 'Support development';
      introLines.push(`\n━━━ 💝 ${donateTitle} ━━━`);
      introLines.push(`${donateLabel}: https://x.com/haivcon`);
      const addressLabel = lang === 'vi' ? 'Địa chỉ' : lang === 'zh' ? '地址' : lang === 'ko' ? '주소' : lang === 'ru' ? 'Адрес' : lang === 'id' ? 'Alamat' : 'Address';
      introLines.push(`${addressLabel}: \`0x92809f2837f708163d375960063c8a3156fceacb\``);

      const caption = introLines.filter(Boolean).join('\n');
      const replyMarkup = buildAiUsageKeyboard(lang);
      const sentMedia = await sendAiIntroMedia(msg, lang, caption, replyMarkup);
      if (!sentMedia) {
        await sendReply(msg, caption, {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup
        });
      }
      return;
    }
    if (!availableProviders.length) {
      await sendReply(msg, t(lang, 'ai_missing_api_key'), {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "✨ " + t(lang, 'ai_api_manage_button'), callback_data: 'apihub|ai|google|0' }], [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]] }
      });
      return;
    }
    if (await enforceOwnerCommandLimit(msg, 'ai')) {
      return;
    }
    const promptText = userPrompt || t(lang, 'ai_default_prompt');
    const preferredProvider = userId ? await db.getUserAiProvider(userId) : null;
    let provider = null;
    if (preferredProvider && availableProviders.includes(preferredProvider)) {
      provider = preferredProvider;
    } else if (availableProviders.length === 1) {
      provider = availableProviders[0];
    }
    purgeAiProviderSelections();
    if (isTtsMode) {
      await handleAiTtsCommand({ msg, lang, payload: ttsPayload, audioSource });
      return;
    }
    if (!provider) {
      const token = uuidv4();
      aiProviderSelectionSessions.set(token, {
        userId,
        lang,
        msg,
        promptText,
        photos,
        hasPhoto,
        audioSource,
        hasAudio,
        deviceTargetId,
        usageDate,
        googleUserKeys,
        groqUserKeys,
        openAiUserKeys,
        createdAt: Date.now()
      });
      const inline_keyboard = availableProviders.map((id) => {
        const meta = buildAiProviderMeta(lang, id);
        return [{ text: `${meta.icon} ${meta.label}`, callback_data: `aiselect|${meta.id}|${token}` }];
      });
      inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
      const providerLabels = availableProviders.map((id) => buildAiProviderMeta(lang, id).label);
      const selectionText = t(lang, 'ai_provider_prompt_dynamic', {
        providers: providerLabels.map((entry) => `• ${entry}`).join('\n')
      });
      const selectionLines = [selectionText];
      if (preferredProvider && availableProviders.includes(preferredProvider)) {
        const preferredLabel = buildAiProviderMeta(lang, preferredProvider).label;
        inline_keyboard.unshift([{ text: `⭐ ${t(lang, 'ai_provider_default_label', { provider: preferredLabel })}`, callback_data: 'aiapi|default|' + preferredProvider }]);
        selectionLines.push(t(lang, 'ai_provider_default_label', { provider: preferredLabel }));
      }
      await sendReply(msg, selectionLines.join('\n\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
      });
      return;
    }
    await runAiRequestWithProvider({
      msg,
      lang,
      provider,
      promptText,
      photos,
      hasPhoto,
      audioSource,
      hasAudio,
      userId,
      deviceTargetId,
      usageDate,
      googleUserKeys,
      groqUserKeys,
      openAiUserKeys
    });
  }
  async function handleAiTtsCommand({ msg, lang, payload = '', audioSource = null }) {
    const userId = msg.from?.id?.toString();
    const settings = await getUserTtsConfig(userId);
    const replyText = (msg.reply_to_message?.text || msg.reply_to_message?.caption || '').trim();
    let finalText = (payload || '').trim() || replyText;
    const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
    const googleUserKeys = userApiKeys.filter((entry) => normalizeAiProvider(entry.provider) === 'google').map((entry) => entry.apiKey).filter(Boolean);
    const serverKeys = GEMINI_API_KEYS;
    if (!serverKeys.length && !googleUserKeys.length) {
      await sendReply(msg, t(lang, 'ai_missing_api_key'), {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "✨ " + t(lang, 'ai_api_manage_button'), callback_data: 'apihub|ai|google|0' }], [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]] }
      });
      return;
    }
    if (!finalText && !audioSource) {
      const panelText = buildTtsSettingsText(lang, settings);
      await sendReply(msg, panelText, {
        reply_markup: buildTtsSettingsKeyboard(lang, settings)
      });
      return;
    }
    await sendReply(msg, t(lang, 'ai_tts_generating'));
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
      userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }
    if (googleUserKeys.length) {
      responsePools.push({ type: 'user', keys: googleUserKeys, disabledSet: userDisabledSet });
    } else if (serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }
    let ttsPath = null;
    let lastError = null;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : aiState.geminiKeyIndex;
      for (let attempt = 0; attempt < maxAttempts && !ttsPath; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getGeminiClient(keyIndex, pool.keys);
        if (!clientInfo?.client) {
          lastError = new Error('Missing Gemini client');
          break;
        }
        let downloadInfo = null;
        let uploadedFile = null;
        try {
          if (!finalText && audioSource) {
            log.child('Voice').info('Processing audio source:', { hasAudio: !!audioSource?.audio, fileId: audioSource?.audio?.file_id?.slice(0, 20) + '...' });
            log.child('Voice').info('downloadTelegramFile available:', typeof downloadTelegramFile);
            downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-tts-audio');
            log.child('Voice').info('Downloaded:', { filePath: downloadInfo?.filePath, format: downloadInfo?.format });
            const mimeType = resolveAudioMimeType(downloadInfo.format);
            uploadedFile = await clientInfo.client.files.upload({
              file: downloadInfo.filePath,
              config: { mimeType, displayName: path.basename(downloadInfo.filePath) }
            });
            const audioPart = {
              fileData: {
                mimeType: uploadedFile?.mimeType || mimeType,
                fileUri: uploadedFile?.uri
              }
            };
            const transcriptPrompt = t(lang, 'ai_audio_google_transcript_prompt');
            const transcriptResponse = await clientInfo.client.models.generateContent({
              model: GEMINI_MODEL,
              contents: [
                {
                  role: 'user',
                  parts: [audioPart, { text: transcriptPrompt }]
                }
              ]
            });
            finalText = extractGoogleCandidateText(transcriptResponse) || '';
          }
          if (!finalText) {
            throw new Error('Missing TTS text');
          }
          ttsPath = await synthesizeGeminiSpeech(clientInfo.client, finalText, settings);
          if (pool.type === 'user') {
            setUserGeminiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.geminiKeyIndex = clientInfo.index;
          }
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 403 || isGeminiApiKeyExpired(error) || /reported as leaked/i.test(error?.message || '')) {
            if (pool.type === 'user') {
              disableUserGeminiKey(userId, keyIndex, pool.keys.length);
            } else {
              disableGeminiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (pool.type === 'user') {
            advanceUserGeminiKeyIndex(userId, pool.keys.length);
          } else {
            advanceGeminiKeyIndex();
          }
          log.error(`Gemini TTS failed with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        } finally {
          if (downloadInfo?.filePath) {
            try {
              await fs.promises.unlink(downloadInfo.filePath);
            } catch (cleanupError) {
              log.warn(`Failed to clean TTS audio temp file: ${cleanupError.message}`);
            }
          }
          if (uploadedFile?.name) {
            try {
              await clientInfo.client.files.delete({ name: uploadedFile.name });
            } catch (cleanupError) {
              log.warn(`Failed to delete Gemini TTS upload: ${cleanupError.message}`);
            }
          }
        }
      }
      if (ttsPath) {
        break;
      }
    }
    if (!ttsPath || !finalText) {
      log.warn(`TTS failed: ${lastError ? lastError.message : 'no output'}`);
      await sendReply(msg, t(lang, 'ai_tts_missing_text'), { reply_markup: buildTtsSettingsKeyboard(lang, settings) });
      return;
    }
    const langLabel = formatTtsLanguageLabel(settings.language, lang);
    const voiceOptions = buildThreadedOptions(msg, {
      caption: t(lang, 'ai_tts_caption', { voice: formatTtsVoiceLabel(settings.voice), language: langLabel })
    });
    try {
      await bot.sendAudio(msg.chat.id, ttsPath, voiceOptions, {
        filename: path.basename(ttsPath),
        contentType: 'audio/wav'
      });
    } catch (error) {
      log.warn(`Failed to send Gemini TTS audio: ${sanitizeSecrets(error.message)}`);
      await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
    } finally {
      try {
        await fs.promises.unlink(ttsPath);
      } catch (cleanupError) {
        log.warn(`Failed to clean Gemini TTS file: ${cleanupError.message}`);
      }
    }
  }
  function purgeAiProviderSelections(maxAgeMs = 10 * 60 * 1000) {
    const now = Date.now();
    for (const [token, session] of aiProviderSelectionSessions.entries()) {
      if (session?.createdAt && now - session.createdAt > maxAgeMs) {
        aiProviderSelectionSessions.delete(token);
      }
    }
  }
  async function runAiRequestWithProvider({
    msg,
    lang,
    provider,
    promptText,
    photos = [],
    hasPhoto = false,
    audioSource = null,
    hasAudio = false,
    userId,
    deviceTargetId,
    usageDate,
    googleUserKeys = [],
    groqUserKeys = [],
    openAiUserKeys = []
  }) {
    log.child('Request').info('Entry:', { provider, hasAudio, hasPhoto, hasAudioSource: !!audioSource });
    const normalizedProvider = normalizeAiProvider(provider);
    const providerMeta = buildAiProviderMeta(lang, normalizedProvider);
    const personalKeys = normalizedProvider === 'google'
      ? googleUserKeys
      : normalizedProvider === 'openai'
        ? openAiUserKeys
        : groqUserKeys;
    const serverKeys = normalizedProvider === 'google'
      ? GEMINI_API_KEYS
      : normalizedProvider === 'openai'
        ? OPENAI_API_KEYS
        : GROQ_API_KEYS;
    if (!serverKeys.length && !personalKeys.length) {
      await sendReply(msg, t(lang, 'ai_missing_api_key'), {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "✨ " + t(lang, 'ai_api_manage_button'), callback_data: 'apihub|ai|google|0' }], [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]] }
      });
      return;
    }
    const usageTargetId = userId || msg.chat?.id?.toString() || null;
    const userLimit = userId ? await db.getCommandLimit('ai', userId) : null;
    const deviceLimit = deviceTargetId ? await db.getCommandLimit('ai', deviceTargetId) : null;
    const globalLimit = await db.getCommandLimit('ai', null);
    const limitEntries = [];
    if (usageTargetId && Number.isFinite(userLimit) && userLimit > 0) {
      limitEntries.push({ target: usageTargetId, limit: userLimit });
    }
    if (deviceTargetId && Number.isFinite(deviceLimit) && deviceLimit > 0) {
      limitEntries.push({ target: deviceTargetId, limit: deviceLimit });
    }
    if (Number.isFinite(globalLimit) && globalLimit > 0) {
      limitEntries.push({ target: 'global_ai', limit: globalLimit });
    }
    let keySource = personalKeys.length ? 'user' : 'server';
    let limitNotice = null;
    const serverLimitState = {
      blocked: false,
      limit: limitEntries.length ? Math.min(...limitEntries.map((entry) => entry.limit)) : null
    };
    if (limitEntries.length) {
      for (const entry of limitEntries) {
        const currentUsage = await db.getCommandUsageCount('ai', entry.target, usageDate);
        if (currentUsage >= entry.limit) {
          serverLimitState.blocked = true;
          break;
        }
      }
    }
    if (serverLimitState.blocked) {
      if (personalKeys.length) {
        keySource = 'user';
        limitNotice = t(lang, 'ai_switch_to_user_keys_provider', {
          limit: serverLimitState.limit,
          provider: providerMeta.label
        });
      } else {
        await sendReply(msg, t(lang, 'ai_limit_reached', { limit: serverLimitState.limit }), {
          reply_markup: { inline_keyboard: [[{ text: "✨ " + t(lang, 'ai_api_manage_button'), callback_data: 'apihub|ai|google|0' }], [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]] }
        });
        return;
      }
    }
    if (keySource === 'server') {
      const usageTargets = new Set([usageTargetId, deviceTargetId, globalLimit ? 'global_ai' : null].filter(Boolean));
      for (const target of usageTargets) {
        await db.incrementCommandUsage('ai', target, usageDate);
      }
    }
    // Track per-user usage for dashboard regardless of key source
    if (userId) {
      try {
        await db.incrementCommandUsage('ai', userId, usageDate);
      } catch (usageErr) {
        log.warn(`Failed to record AI usage: ${usageErr.message}`);
      }
    }
    const audioCapableProviders = new Set(['openai', 'google']);
    if (hasAudio && !audioCapableProviders.has(normalizedProvider)) {
      await sendReply(msg, t(lang, 'ai_audio_provider_supported'), {
        reply_markup: buildCloseKeyboard(lang)
      });
      return;
    }
    if (hasAudio && normalizedProvider === 'openai') {
      try {
        await bot.sendChatAction(msg.chat.id, 'record_voice');
      } catch (error) {
        // ignore chat action errors
      }
      await runOpenAiAudioCompletion({
        msg,
        lang,
        promptText,
        audioSource,
        keySource,
        limitNotice,
        personalKeys,
        serverLimitState,
        userId,
        serverKeys,
        providerMeta
      });
      return;
    }
    log.child('Request').info('Audio check:', { hasAudio, normalizedProvider, isGoogleAudio: hasAudio && normalizedProvider === 'google' });
    if (hasAudio && normalizedProvider === 'google') {
      log.child('Request').info('Entering Google Audio branch, calling runGoogleAudioCompletion');
      try {
        await bot.sendChatAction(msg.chat.id, 'record_voice');
      } catch (error) {
        // ignore chat action errors
      }
      await runGoogleAudioCompletion({
        msg,
        lang,
        promptText,
        audioSource,
        keySource,
        limitNotice,
        personalKeys,
        serverLimitState,
        userId,
        serverKeys,
        providerMeta
      });
      return;
    }
    // Step 1: Try AI-based intent classification using user's personal API key and model
    // This allows the bot to "think like a human" to understand user intent
    let imageAction = null;
    const intentCacheKey = userId ? `${userId}|${hasPhoto ? 'photo' : 'text'}|${promptText.slice(0, 200)}` : null;
    if (intentCacheKey && intentCache.has(intentCacheKey)) {
      const cached = intentCache.get(intentCacheKey);
      if (cached && Date.now() - cached.at < INTENT_CACHE_TTL) {
        imageAction = cached.action;
      } else {
        intentCache.delete(intentCacheKey);
      }
    }
    if (normalizedProvider === 'google' && promptText.length > 5 && personalKeys.length > 0) {
      // Only use AI classification if user has personal API keys (to avoid quota issues on server keys)
      try {
        const userModelConfig = getUserGeminiModelConfig(userId);
        const classifyModel = userModelConfig.modelConfig?.chat || GEMINI_MODEL;
        const userKeyIndex = getUserGeminiKeyIndex(userId);
        const clientInfo = getGeminiClient(userKeyIndex, personalKeys);
        if (clientInfo?.client) {
          log.child('Intent').info('Classifying user intent with model:', classifyModel);
          const aiIntent = await classifyImageIntentWithAI(clientInfo.client, promptText, hasPhoto, classifyModel);
          if (aiIntent) {
            log.child('Intent').info('Classification result:', aiIntent);
            imageAction = aiIntent;
          } else {
            log.child('Intent').info('Classification result: CHAT (normal conversation)');
          }
        }
      } catch (classifyError) {
        log.child('Intent').warn('Classification failed, falling back to keywords:', classifyError.message);
        // Fallback to keyword detection
        imageAction = detectImageAction(promptText, hasPhoto);
      }
    }
    // Step 2: Fallback to keyword-based detection if AI classification didn't run or returned null
    if (!imageAction && normalizedProvider !== 'groq') {
      imageAction = detectImageAction(promptText, hasPhoto);
    }
    if (intentCacheKey) {
      intentCache.set(intentCacheKey, { action: imageAction, at: Date.now() });
    }
    if (imageAction) {
      try {
        await bot.sendChatAction(msg.chat.id, 'upload_photo');
      } catch (error) {
        // ignore chat action errors
      }
      if (normalizedProvider === 'openai') {
        await runOpenAiImageRequest({
          msg,
          lang,
          promptText,
          action: imageAction,
          photos,
          keySource,
          limitNotice,
          personalKeys,
          serverLimitState,
          userId,
          serverKeys,
          providerMeta
        });
      } else {
        await runGoogleImageRequest({
          msg,
          lang,
          promptText,
          action: imageAction,
          photos,
          keySource,
          limitNotice,
          personalKeys,
          serverLimitState,
          userId,
          serverKeys,
          providerMeta
        });
      }
      return;
    }
    const parts = [];
    const maxInlineBytes = AI_IMAGE_MAX_BYTES;
    const maxInlineMb = Math.max(1, Math.ceil(maxInlineBytes / (1024 * 1024)));
    try {
      if (hasPhoto) {
        const largestPhoto = photos[photos.length - 1];
        const fileInfo = await bot.getFile(largestPhoto.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
        const mimeType = largestPhoto.mime_type || 'image/jpeg';
        const fileSize = Number(largestPhoto.file_size || fileInfo?.file_size || 0);
        if (fileSize && fileSize > maxInlineBytes) {
          await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: maxInlineMb }), {
            reply_markup: buildCloseKeyboard(lang)
          });
          return;
        }
        const imagePart = await urlToGenerativePart(fileUrl, mimeType, {
          timeoutMs: AI_IMAGE_DOWNLOAD_TIMEOUT_MS,
          maxBytes: maxInlineBytes
        });
        parts.push(imagePart);
      }
      parts.push({ text: promptText });
      try {
        await bot.sendChatAction(msg.chat.id, hasPhoto ? 'upload_photo' : 'typing');
      } catch (error) {
        // ignore chat action errors
      }
      if (normalizedProvider === 'google') {
        await runGeminiCompletion({
          msg,
          lang,
          parts,
          promptText,
          keySource,
          limitNotice,
          personalKeys,
          serverLimitState,
          userId,
          serverKeys,
          providerMeta
        });
      } else if (normalizedProvider === 'openai') {
        await runOpenAiCompletion({
          msg,
          lang,
          promptText,
          parts,
          keySource,
          limitNotice,
          personalKeys,
          serverLimitState,
          userId,
          serverKeys,
          providerMeta
        });
      } else {
        await runGroqCompletion({
          msg,
          lang,
          promptText,
          parts,
          keySource,
          limitNotice,
          personalKeys,
          serverLimitState,
          userId,
          serverKeys,
          providerMeta
        });
      }
    } catch (error) {
      log.error(`Failed to generate content: ${error.message}`);
      const isQuotaError = isQuotaOrRateLimitError(error);
      const isTimeoutError = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');
      const isBillingLimit = normalizedProvider === 'openai' && isOpenAiBillingError(error);
      const isGeminiExpired = normalizedProvider === 'google' && isGeminiApiKeyExpired(error);
      const messageKey = isTimeoutError
        ? 'ai_image_download_timeout'
        : isBillingLimit
          ? 'ai_provider_billing_limit'
          : isGeminiExpired
            ? 'ai_provider_gemini_key_expired'
            : isQuotaError
              ? 'ai_provider_quota'
              : 'ai_error';
      await sendReply(msg, t(lang, messageKey, { provider: providerMeta.label }), {
        parse_mode: 'HTML',
        reply_markup: buildCloseKeyboard(lang)
      });
    }
  }
  /**
 * Send notification about expired/failed API keys if any
 * Called after successful AI response to inform user about failed keys
 */
  async function sendExpiredKeyNotification(msg, lang, userId) {
    if (!userId || !hasExpiredKeyNotices(userId)) return;

    const notices = getAndClearExpiredKeyNotices(userId);
    if (!notices.length) return;

    const lines = [t(lang, 'ai_key_auto_switched') || '⚠️ <b>API Key Notice</b>\n\nSome of your API keys failed. Bot automatically switched to a working key.'];
    lines.push('');

    for (const notice of notices) {
      const reasonKey = `ai_key_fail_reason_${notice.reason}`;
      const reasonText = t(lang, reasonKey) || notice.reason;
      const keyLabel = notice.keyName || `Key #${notice.keyIndex + 1}`;
      const detailLine = t(lang, 'ai_key_failed_detail', { keyName: keyLabel, reason: reasonText })
        || `❌ <b>${keyLabel}</b>: ${reasonText}`;
      lines.push(detailLine);
    }

    lines.push('');
    lines.push(t(lang, 'ai_key_manage_hint') || '💡 Delete invalid keys in /api to avoid future issues.');

    const keyboard = {
      inline_keyboard: [
        [{ text: `🔑 ${t(lang, 'ai_key_delete_expired_button') || 'Manage API Keys'}`, callback_data: 'apihub|ai|google|0' }],
        [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
      ]
    };

    try {
      await sendReply(msg, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } catch (notifyError) {
      log.warn('Failed to send expired key notification:', notifyError.message);
    }
  }
  async function runGeminiCompletion({ msg, lang, parts, promptText, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
      userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }
    let response = null;
    let lastError = null;
    let activeSource = keySource;
    let activeClient = null;
    let activeModelLabel = resolveGeminiModelLabel(GEMINI_MODEL, 'chat');
    let activeModelName = GEMINI_MODEL;
    let activeThinkingLevelLabel = null;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : aiState.geminiKeyIndex;
      if (pool.type === 'server' && disabledGeminiKeyIndices.size >= pool.keys.length) {
        lastError = new Error('No valid Gemini API keys');
        continue;
      }
      for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getGeminiClient(keyIndex, pool.keys);
        if (!clientInfo) {
          lastError = new Error('Missing Gemini API key');
          break;
        }
        try {
          // Only use custom model preference for personal API keys
          // Server keys always use default GEMINI_MODEL (gemini-2.5-flash)
          let modelName = GEMINI_MODEL;
          let modelLabel = resolveGeminiModelLabel(modelName, 'chat');
          let thinkingLevelLabel = null;
          // Get conversation history for memory
          const session = await getUserSession(userId);
          const historyContents = session.history.slice(); // Copy history
          // Get full system instructions using the same builder as AIA
          const { buildAIAPrompt } = require('../config/prompts');
          const walletContext = ''; // Optimization: we could load this, but full prompts.js rules are enough for text
          const skillPrompt = '';
          const groupSafetyNote = (msg.chat?.type === 'group' || msg.chat?.type === 'supergroup')
            ? '\nGROUP SAFETY: Keep replies concise, avoid sharing personal data, and respect thread/context.' : '';

          let memorySection = '';
          if (session.history.length > 0) {
            memorySection = `\nUSER MEMORY: Continue the conversation naturally based on history.`;
          }

          const fullSystemPrompt = buildAIAPrompt({
            personaSection: personaPrompt ? `PERSONALITY: ${personaPrompt}` : '',
            memorySection,
            chatContextLine: '',
            groupSafetyNote,
            imageSection: '',
            walletContext,
            skillPrompt
          });

          // Add system instruction using the correct format for the latest Gemini SDK
          requestConfig.systemInstruction = fullSystemPrompt;
          if (pool.type === 'user') {
            // Get user's model preference for personal keys
            const userModelConfig = getUserGeminiModelConfig(userId);
            modelName = userModelConfig.modelConfig?.chat || GEMINI_MODEL;
            modelLabel = userModelConfig.modelConfig?.label || resolveGeminiModelLabel(modelName, 'chat');
            activeModelName = modelName;
            requestConfig.model = modelName;
            // Add thinkingConfig if model supports it (Gemini 3 Pro)
            if (userModelConfig.modelConfig?.supportsThinking && userModelConfig.thinkingLevel) {
              requestConfig.config = {
                thinkingConfig: {
                  thinkingBudget: userModelConfig.thinkingLevel === 'high' ? 8192 : 1024
                }
              };
              thinkingLevelLabel = userModelConfig.thinkingLevel === 'high'
                ? t(lang, 'ai_thinking_level_high')
                : t(lang, 'ai_thinking_level_low');
            }
          }
          response = await clientInfo.client.models.generateContent(requestConfig);
          activeClient = clientInfo.client;
          if (pool.type === 'user') {
            setUserGeminiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.geminiKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
          activeModelName = modelName;
          activeModelLabel = modelLabel;
          activeThinkingLevelLabel = thinkingLevelLabel;
          break;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 403 || isGeminiApiKeyExpired(error) || /reported as leaked/i.test(error?.message || '')) {
            if (pool.type === 'user') {
              // Determine failure reason for user notification
              const failReason = isGeminiApiKeyExpired(error)
                ? 'expired'
                : error?.response?.status === 403
                  ? 'forbidden'
                  : 'error';
              disableUserGeminiKey(userId, keyIndex, pool.keys.length, failReason, `Key #${keyIndex + 1}`);
            } else {
              disableGeminiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (pool.type === 'user') {
            advanceUserGeminiKeyIndex(userId, pool.keys.length);
          } else {
            advanceGeminiKeyIndex();
          }
          log.error(`Failed to generate content with ${pool.type} Gemini key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        }
      }
      if (response) {
        break;
      }
    }
    if (!response) {
      throw lastError || new Error('No Gemini response');
    }
    const candidate = response?.candidates?.[0]?.content?.parts || [];
    let aiResponse = extractGoogleCandidateText(response) || '';
    if (!aiResponse) {
      aiResponse = candidate
        .map((part) => part?.text || '')
        .join('')
        .trim()
        || (typeof response?.text === 'function' ? response.text() : response?.text);
    }
    const body = aiResponse || t(lang, 'ai_error');
    // Save conversation to session history for memory
    if (userId && promptText && aiResponse) {
      await addToSessionHistory(userId, 'user', promptText);
      await addToSessionHistory(userId, 'model', aiResponse);
    }
    const providerLine = escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label }));
    const modelLine = escapeMarkdownV2(buildModelLine(activeModelLabel, activeModelName));
    const extraLines = buildGeminiModelNotice(lang, activeModelLabel, activeThinkingLevelLabel, activeModelName)
      .map((line) => escapeMarkdownV2(line));
    if (limitNotice && keySource === 'server') {
      extraLines.push(escapeMarkdownV2(limitNotice));
    }
    const usageLines = buildGeminiUsageLines(lang, response, { userId }).map((line) => escapeMarkdownV2(line));
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const noticePrefix = [providerLine, modelLine, ...extraLines, ...usageLines].filter(Boolean).join('\n');
    const decoratedBody = decorateWithContextualIcons(body);
    const replyText = `${noticePrefix ? `${noticePrefix}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(decoratedBody)}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = applyThreadId(msg, { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      try {
        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
      } catch (sendError) {
        // If MarkdownV2 fails, try sending as HTML (better for complex content)
        log.warn('MarkdownV2 send failed, falling back to HTML:', sendError.message);
        try {
          // Convert MarkdownV2 to HTML-safe format
          const htmlChunk = chunk
            .replace(/\\([_*\[\]()~`>#+\-=|{}.!])/g, '$1') // Remove MarkdownV2 escapes
            .replace(/\*(.+?)\*/g, '<b>$1</b>') // Bold
            .replace(/_(.+?)_/g, '<i>$1</i>') // Italic
            .replace(/~(.+?)~/g, '<s>$1</s>') // Strikethrough
            .replace(/`([^`]+)`/g, '<code>$1</code>') // Inline code
            .replace(/```[\s\S]*?```/g, (m) => '<pre>' + m.replace(/```/g, '') + '</pre>') // Code block
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
            .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
            .replace(/&lt;s&gt;/g, '<s>').replace(/&lt;\/s&gt;/g, '</s>')
            .replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>')
            .replace(/&lt;pre&gt;/g, '<pre>').replace(/&lt;\/pre&gt;/g, '</pre>');
          // Sanitize: fix mismatched/overlapping tags to prevent Telegram 400 errors
          const sanitizedHtmlChunk = sanitizeTelegramHtml(htmlChunk);
          const htmlOptions = { ...options, parse_mode: 'HTML' };
          await sendMessageRespectingThread(msg.chat.id, msg, sanitizedHtmlChunk, htmlOptions);
        } catch (htmlError) {
          log.warn('HTML send failed, falling back to plain text:', htmlError.message);
          // Last resort: plain text with minimal processing
          try {
            const plainChunk = chunk
              .replace(/\\([_*\[\]()~`>#+\-=|{}.!])/g, '$1')
              .replace(/\*\*/g, '').replace(/\*/g, '')
              .replace(/__/g, '').replace(/_/g, '')
              .replace(/~~/g, '').replace(/~/g, '')
              .replace(/```/g, '').replace(/`/g, '');
            const plainOptions = { ...options, parse_mode: undefined };
            await sendMessageRespectingThread(msg.chat.id, msg, plainChunk, plainOptions);
          } catch (plainError) {
            log.error('All send attempts failed:', plainError.message);
          }
        }
      }
    }
    // Notify user about any failed API keys after successful response
    await sendExpiredKeyNotification(msg, lang, userId);
  }
  async function runGoogleAudioCompletion({ msg, lang, promptText, audioSource, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
      userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }
    let transcript = '';
    let aiResponse = '';
    let activeSource = keySource;
    let lastError = null;
    let activeModelLabel = resolveGeminiModelLabel(GEMINI_MODEL, 'chat');
    let activeModelName = GEMINI_MODEL;
    let activeClientInfo = null;

    // Check if user has selected Flash Live model for native audio processing
    const userModelConfig = getUserGeminiModelConfig(userId);
    const selectedModelId = userModelConfig?.modelFamily || '';

    // ALWAYS use Flash Live for audio input (best quality native audio-to-audio)
    // User's model preference is NOT changed - only audio uses Flash Live
    const useFlashLive = true; // Was: isFlashLiveModel(selectedModelId)

    if (useFlashLive && personalKeys.length > 0) {
      log.child('Audio').info('Routing audio to Flash Live (user model:', selectedModelId || 'default', ')');

      let downloadInfo = null;
      try {
        // Download audio file from Telegram
        downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-audio-live');

        // Read audio file as buffer
        const audioBuffer = await fs.promises.readFile(downloadInfo.filePath);

        // Get user's API key
        const keyIndex = getUserGeminiKeyIndex(userId);
        const apiKey = personalKeys[keyIndex % personalKeys.length];

        // Get user's TTS settings for voice selection and language
        const ttsConfig = await getUserTtsConfig(userId);
        const selectedVoice = ttsConfig?.voice || 'Kore';
        const ttsLanguage = ttsConfig?.language || 'auto'; // Use TTS language setting, default to auto-detect

        // Check if thinking mode is enabled for this model
        const thinkingLevel = userModelConfig?.thinkingLevel || null;
        const enableThinking = thinkingLevel && thinkingLevel !== 'off';
        const thinkingBudget = thinkingLevel === 'high' ? 2048 : 1024;

        // Build context instruction from user memory, persona, and chat context
        // Similar to how /ai and /aib work
        let contextParts = [];

        // 1. Get user persona
        const personaPrompt = await getPersonaPrompt(userId);
        if (personaPrompt) {
          contextParts.push(`PERSONALITY: ${personaPrompt}`);
        }

        // 2. Get user memory for persistent context
        const userMemory = await db.getAiMemory(userId);
        if (userMemory) {
          const memoryParts = [];
          // Note: userName field is deprecated, use identity.name instead
          if (userMemory.userPreferences?.identity) {
            const idn = userMemory.userPreferences.identity;
            const idParts = [];
            if (idn.name) idParts.push(`name=${idn.name}`);
            if (idn.age) idParts.push(`age=${idn.age}`);
            if (idn.gender) idParts.push(`gender=${idn.gender}`);
            if (idn.birthdate) idParts.push(`birthdate=${idn.birthdate}`);
            if (idn.nationality) idParts.push(`nationality=${idn.nationality}`);
            if (idParts.length) memoryParts.push(`User identity: ${idParts.join(', ')}`);
          } else if (userMemory.userName) {
            // Fallback to userName only if no identity
            memoryParts.push(`User's name: ${userMemory.userName}`);
          }
          if (userMemory.conversationSummary) {
            memoryParts.push(`Previous context: ${userMemory.conversationSummary}`);
          }
          if (memoryParts.length > 0) {
            contextParts.push(`USER MEMORY: ${memoryParts.join('. ')}`);
          }
        }

        // 3. Add chat context for groups
        if (msg.chat?.type && (msg.chat.type === 'group' || msg.chat.type === 'supergroup')) {
          contextParts.push(`CHAT CONTEXT: Group chat${msg.message_thread_id ? ` | thread ${msg.message_thread_id}` : ''}`);
          contextParts.push('GROUP SAFETY: Keep replies concise, avoid sharing personal data.');
        }

        // Build final context instruction (or null for default)
        const customContext = contextParts.length > 0
          ? contextParts.join('\n')
          : null;

        log.child('LiveAudio').info('Context parts:', contextParts.length);

        // Process with Live API - use ttsLanguage for auto-detection
        // Enable Google Search AND function calling for voice commands
        const liveTools = buildLiveTools(true, true); // Search ON, functions ON

        const result = await processAudioWithLiveAPI(audioBuffer, apiKey, {
          language: ttsLanguage, // Use TTS language setting (can be 'auto')
          voice: selectedVoice,
          enableThinking: false,
          thinkingBudget: 0,
          enableInputTranscription: true, // Get what user said
          enableOutputTranscription: true, // Get AI response text
          enableAffectiveDialog: false,
          customInstruction: customContext, // Pass user context
          tools: liveTools // Google Search + Function calling
        });

        // Check if tool calls were detected (voice command)
        if (result?.toolCalls && result.toolCalls.length > 0) {
          log.child('LiveAudio').info('Tool calls detected:', result.toolCalls.map(tc => tc.name).join(', '));

          // Generate a unique token for this confirmation
          const confirmToken = uuidv4();

          // Store the context for later use
          pendingVoiceCommands.set(confirmToken, {
            msg,
            lang,
            toolCalls: result.toolCalls,
            inputTranscript: result.inputTranscript,
            outputTranscript: result.outputTranscript,
            audioContext: {
              audioBuffer,
              apiKey,
              ttsLanguage,
              selectedVoice,
              customContext
            },
            createdAt: Date.now()
          });

          // Build confirmation message
          const toolCall = result.toolCalls[0]; // Take first tool call
          const funcName = toolCall.name || 'unknown';
          const funcArgs = toolCall.args || {};

          // Map function names to display labels
          const funcLabels = {
            get_fortune: { icon: '🔮', vi: 'Bói toán', en: 'Fortune Telling', zh: '算命', ko: '운세', ru: 'Гадание', id: 'Ramalan' },
            roll_dice: { icon: '🎲', vi: 'Tung xúc xắc', en: 'Roll Dice', zh: '掷骰子', ko: '주사위 굴리기', ru: 'Бросить кубики', id: 'Lempar Dadu' },
            get_current_time: { icon: '🕐', vi: 'Xem giờ', en: 'Current Time', zh: '查看时间', ko: '현재 시간', ru: 'Текущее время', id: 'Waktu Sekarang' },
            flip_coin: { icon: '🪙', vi: 'Tung đồng xu', en: 'Flip Coin', zh: '抛硬币', ko: '동전 던지기', ru: 'Подбросить монету', id: 'Lempar Koin' }
          };

          const labelData = funcLabels[funcName] || { icon: '🎯', vi: funcName, en: funcName, zh: funcName, ko: funcName, ru: funcName, id: funcName };
          const labelText = labelData[lang] || labelData.en;

          // Build confirmation text
          const confirmText = [
            `${labelData.icon} <b>${t(lang, 'voice_confirm_title') || '🎙️ Voice Command Detected'}</b>`,
            '',
            `📍 <b>${labelText}</b>`,
            result.inputTranscript ? `💬 <i>"${result.inputTranscript.trim().substring(0, 100)}${result.inputTranscript.length > 100 ? '...' : ''}"</i>` : '',
            '',
            t(lang, 'voice_confirm_hint') || 'Choose an option below:'
          ].filter(Boolean).join('\n');

          // Build keyboard
          const keyboard = {
            inline_keyboard: [
              [
                { text: t(lang, 'voice_confirm_execute') || '▶️ Execute', callback_data: `voiceconfirm|execute|${confirmToken}` },
                { text: t(lang, 'voice_confirm_cancel') || '❌ Normal Reply', callback_data: `voiceconfirm|cancel|${confirmToken}` }
              ]
            ]
          };

          // Send confirmation message
          const confirmOptions = buildThreadedOptions(msg, {
            parse_mode: 'HTML',
            reply_markup: keyboard
          });

          await sendReply(msg, confirmText, confirmOptions);
          return; // Wait for user to confirm or cancel
        }

        if (result?.audioPath) {
          // Smart Emoji Caption Design
          // Helper to escape HTML-like tags
          const escapeHtmlTags = (text) => text.replace(/</g, '‹').replace(/>/g, '›');

          // Helper to detect content type and add relevant emoji
          const getContentEmoji = (text) => {
            const lower = text.toLowerCase();
            if (lower.includes('chuyện') || lower.includes('kể') || lower.includes('story')) return '📖';
            if (lower.includes('hát') || lower.includes('nhạc') || lower.includes('song') || lower.includes('music')) return '🎵';
            if (lower.includes('thú') || lower.includes('con') || lower.includes('animal')) return '🐾';
            if (lower.includes('ăn') || lower.includes('đồ ăn') || lower.includes('food')) return '🍽️';
            if (lower.includes('game') || lower.includes('chơi') || lower.includes('play')) return '🎮';
            if (lower.includes('học') || lower.includes('learn') || lower.includes('study')) return '📚';
            if (lower.includes('thời tiết') || lower.includes('weather')) return '🌤️';
            if (lower.includes('tình yêu') || lower.includes('love') || lower.includes('yêu')) return '💕';
            if (lower.includes('buồn') || lower.includes('sad')) return '😢';
            if (lower.includes('vui') || lower.includes('happy') || lower.includes('haha')) return '😄';
            if (lower.includes('giúp') || lower.includes('help')) return '🤝';
            if (lower.includes('code') || lower.includes('lập trình')) return '💻';
            if (lower.includes('?') || lower.includes('hỏi') || lower.includes('question')) return '❓';
            return '💬';
          };

          // Language labels
          const labels = {
            vi: { title: 'Phản hồi giọng nói AI', you: 'Bạn', ai: 'AI', duration: 'Thời lượng', voice: 'Giọng', model: 'Model', lang: 'Ngôn ngữ' },
            zh: { title: 'AI语音回复', you: '您', ai: 'AI', duration: '时长', voice: '声音', model: '模型', lang: '语言' },
            ko: { title: 'AI 음성 응답', you: '당신', ai: 'AI', duration: '길이', voice: '목소리', model: '모델', lang: '언어' },
            ru: { title: 'AI голосовой ответ', you: 'Вы', ai: 'AI', duration: 'Длина', voice: 'Голос', model: 'Модель', lang: 'Язык' },
            id: { title: 'Respons Suara AI', you: 'Anda', ai: 'AI', duration: 'Durasi', voice: 'Suara', model: 'Model', lang: 'Bahasa' },
            en: { title: 'AI Voice Response', you: 'You', ai: 'AI', duration: 'Duration', voice: 'Voice', model: 'Model', lang: 'Language' }
          };
          const L = labels[lang] || labels.en;

          // Format duration
          const formatDuration = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
          };

          // Build caption parts
          let captionParts = [`🎙️ ${L.title}`];

          // Separator

          // Build full transcript text
          let fullTranscript = '';
          if (result.inputTranscript) {
            const cleanInput = escapeHtmlTags(result.inputTranscript.trim());
            const inputEmoji = getContentEmoji(cleanInput);
            fullTranscript += `${inputEmoji} ${L.you}: "${cleanInput}"\n\n`;
          }
          if (result.outputTranscript) {
            const cleanOutput = escapeHtmlTags(result.outputTranscript.trim());
            const outputEmoji = getContentEmoji(cleanOutput);
            fullTranscript += `${outputEmoji} ${L.ai}: "${cleanOutput}"`;
          }

          // Metadata footer
          const durationStr = result.duration ? formatDuration(result.duration) : '?';
          const langDisplay = { vi: '🇻🇳 Tiếng Việt', zh: '🇨🇳 中文', ko: '🇰🇷 한국어', ru: '🇷🇺 Русский', id: '🇮🇩 Indonesia', en: '🇺🇸 English' };
          // Note: Audio always uses Flash Live for best quality
          const voiceModelNote = {
            vi: '🎙️ Voice AI (via Flash Live)',
            zh: '🎙️ 语音AI (通过 Flash Live)',
            ko: '🎙️ 음성 AI (Flash Live 사용)',
            ru: '🎙️ Голосовой AI (через Flash Live)',
            id: '🎙️ Voice AI (via Flash Live)',
            en: '🎙️ Voice AI (via Flash Live)'
          };
          const metadata = `⏱️ ${durationStr} | 🔊 ${selectedVoice} | ${langDisplay[lang] || '🌐 ' + lang}\n${voiceModelNote[lang] || voiceModelNote.en}`;

          // Build short caption for audio (Telegram caption limit is 1024)
          let shortCaption = `🎙️ ${L.title}\n━━━━━━━━━━━━━━━\n${metadata}`;

          // Check if full transcript fits in caption (leave room for header/footer ~150 chars)
          const MAX_CAPTION = 900;
          const needsSeparateMessage = fullTranscript.length > MAX_CAPTION;

          if (!needsSeparateMessage && fullTranscript) {
            // Fits in caption
            shortCaption = `🎙️ ${L.title}\n━━━━━━━━━━━━━━━\n${fullTranscript}\n━━━━━━━━━━━━━━━\n${metadata}`;
          }

          const voiceOptions = buildThreadedOptions(msg, {
            caption: shortCaption
          });

          // Try to send with thread_id, fallback to without if forum topic error
          try {
            await bot.sendAudio(msg.chat.id, result.audioPath, voiceOptions, {
              filename: path.basename(result.audioPath),
              contentType: 'audio/wav'
            });
          } catch (sendError) {
            const errMsg = (sendError?.message || '').toLowerCase();
            if (errMsg.includes('thread not found') || errMsg.includes('topic')) {
              log.child('Audio').warn('Thread error, retrying without thread_id');
              const { message_thread_id, ...fallbackOptions } = voiceOptions;
              await bot.sendAudio(msg.chat.id, result.audioPath, fallbackOptions, {
                filename: path.basename(result.audioPath),
                contentType: 'audio/wav'
              });
            } else {
              throw sendError;
            }
          }

          // Send full transcript as separate message(s) if too long
          if (needsSeparateMessage && fullTranscript) {
            const transcriptHeader = `📝 ${L.title} - Transcript\n━━━━━━━━━━━━━━━\n`;
            const fullMessage = transcriptHeader + fullTranscript;

            // Split into chunks of ~4000 chars (Telegram message limit is 4096)
            const CHUNK_SIZE = 4000;
            const chunks = [];
            let remaining = fullMessage;

            while (remaining.length > 0) {
              if (remaining.length <= CHUNK_SIZE) {
                chunks.push(remaining);
                break;
              }
              // Find a good break point (newline or space)
              let breakPoint = remaining.lastIndexOf('\n', CHUNK_SIZE);
              if (breakPoint === -1 || breakPoint < CHUNK_SIZE / 2) {
                breakPoint = remaining.lastIndexOf(' ', CHUNK_SIZE);
              }
              if (breakPoint === -1) {
                breakPoint = CHUNK_SIZE;
              }
              chunks.push(remaining.slice(0, breakPoint));
              remaining = remaining.slice(breakPoint + 1);
            }

            // Send each chunk with small delay
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const chunkLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : '';
              await sendReply(msg, chunk + (i === chunks.length - 1 ? `\n━━━━━━━━━━━━━━━\n${metadata}` : chunkLabel));
              if (i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 300)); // Small delay between chunks
              }
            }
          }

          // Cleanup
          try {
            await fs.promises.unlink(result.audioPath);
          } catch (cleanupErr) {
            log.child('Audio').warn('Failed to cleanup Live audio:', cleanupErr.message);
          }

          return; // Done with Live API processing
        }
      } catch (liveError) {
        log.child('Audio').error('Live API error:', liveError.message);
        // If Live API fails, show error but don't fall through to regular processing
        // because Flash Live cannot use generateContent
        await sendReply(msg, t(lang, 'ai_live_audio_error') || '⚠️ Voice processing failed. Please try again or switch to a different model.', {
          reply_markup: buildCloseKeyboard(lang)
        });
        return;
      } finally {
        if (downloadInfo?.filePath) {
          try {
            await fs.promises.unlink(downloadInfo.filePath);
          } catch (cleanupErr) {
            log.child('Audio').warn('Failed to cleanup temp file:', cleanupErr.message);
          }
        }
      }
    }

    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : aiState.geminiKeyIndex;
      if (pool.type === 'server' && disabledGeminiKeyIndices.size >= pool.keys.length) {
        lastError = new Error('No valid Gemini API keys');
        continue;
      }
      for (let attempt = 0; attempt < maxAttempts && !aiResponse; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getGeminiClient(keyIndex, pool.keys);
        if (!clientInfo?.client) {
          lastError = new Error('Missing Gemini API key');
          break;
        }
        let downloadInfo = null;
        let uploadedFile = null;
        try {
          downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-audio');
          const mimeType = resolveAudioMimeType(downloadInfo.format);
          uploadedFile = await clientInfo.client.files.upload({
            file: downloadInfo.filePath,
            config: {
              mimeType,
              displayName: path.basename(downloadInfo.filePath)
            }
          });
          if (!uploadedFile?.uri) {
            throw new Error('Missing Gemini file URI');
          }
          const audioPart = {
            fileData: {
              mimeType: uploadedFile?.mimeType || mimeType,
              fileUri: uploadedFile?.uri
            }
          };
          const transcriptPrompt = t(lang, 'ai_audio_google_transcript_prompt');
          const transcriptResponse = await clientInfo.client.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              {
                role: 'user',
                parts: [audioPart, { text: transcriptPrompt }]
              }
            ]
          });
          transcript = extractGoogleCandidateText(transcriptResponse) || '';
          // Always route voice through function calling system
          // This allows AI to decide if a function call is needed for any request
          if (transcript && transcript.trim()) {
            log.child('Voice').info('Routing transcript through /aib:', transcript.slice(0, 50) + '...');
            // Create synthetic message with transcript as /aib command
            // IMPORTANT: Remove audio properties to prevent infinite loop
            const syntheticMsg = {
              ...msg,
              text: `/aib ${transcript}`,
              entities: [{ type: 'bot_command', offset: 0, length: 4 }],
              voice: undefined,
              audio: undefined,
              video_note: undefined
            };
            // Process via bot update to trigger /aib handler
            try {
              const syntheticUpdate = {
                update_id: Date.now(),
                message: syntheticMsg
              };
              bot.processUpdate(syntheticUpdate);
              // Early return - /aib handler will respond
              log.child('Voice').info('Routed to /aib, returning');
              return;
            } catch (routeError) {
              log.child('Voice').warn('Failed to route to /aib:', routeError.message);
              // Fall through to regular response
            }
          }
          const conversationPrompt = promptText
            ? `${promptText}\n\n${t(lang, 'ai_audio_google_conversation_prompt')}${transcript ? `\nTranscript:\n${transcript}` : ''}`
            : t(lang, 'ai_audio_google_conversation_prompt');
          const conversationResponse = await clientInfo.client.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: conversationPrompt },
                  audioPart
                ]
              }
            ]
          });
          aiResponse = extractGoogleCandidateText(conversationResponse) || '';
          if (!aiResponse) {
            continue;
          }
          if (pool.type === 'user') {
            setUserGeminiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.geminiKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
          activeModelName = GEMINI_MODEL;
          activeClientInfo = clientInfo;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 403 || isGeminiApiKeyExpired(error) || /reported as leaked/i.test(error?.message || '')) {
            if (pool.type === 'user') {
              disableUserGeminiKey(userId, keyIndex, pool.keys.length);
            } else {
              disableGeminiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (pool.type === 'user') {
            advanceUserGeminiKeyIndex(userId, pool.keys.length);
          } else {
            advanceGeminiKeyIndex();
          }
          log.error(`Failed to process Gemini audio with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        } finally {
          if (downloadInfo?.filePath) {
            try {
              await fs.promises.unlink(downloadInfo.filePath);
            } catch (cleanupError) {
              log.warn(`Failed to clean audio temp file: ${cleanupError.message}`);
            }
          }
          if (uploadedFile?.name) {
            try {
              await clientInfo.client.files.delete({ name: uploadedFile.name });
            } catch (cleanupError) {
              log.warn(`Failed to delete Gemini file: ${cleanupError.message}`);
            }
          }
        }
      }
      if (aiResponse) {
        break;
      }
    }
    if (!aiResponse) {
      throw lastError || new Error('No Gemini audio response');
    }
    const providerLine = escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label }));
    const modelLine = escapeMarkdownV2(buildModelLine(activeModelLabel, activeModelName));
    const extraLines = buildGeminiModelNotice(lang, activeModelLabel, null, activeModelName)
      .map((line) => escapeMarkdownV2(line));
    if (limitNotice && activeSource === 'server') {
      extraLines.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const bodyParts = [];
    if (transcript) {
      // Escape the full transcript line to avoid MarkdownV2 parsing issues
      const transcriptText = t(lang, 'ai_audio_user_said', { text: transcript });
      bodyParts.push(escapeMarkdownV2(transcriptText));
    }
    if (aiResponse) {
      const decoratedAiResponse = decorateWithContextualIcons(aiResponse);
      bodyParts.push(convertMarkdownToTelegram(decoratedAiResponse));
    }
    const noticePrefix = [providerLine, modelLine, ...extraLines].filter(Boolean).join('\n');
    const replyText = `${noticePrefix ? `${noticePrefix}\n\n` : ''}${header}\n\n${bodyParts.filter(Boolean).join('\n\n')}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = applyThreadId(msg, { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
    // Voice-to-Voice: Also send AI response as voice message
    try {
      const ttsSettings = await db.getTtsSettings(msg.from?.id?.toString());
      const settings = {
        voice: ttsSettings?.voice || GEMINI_TTS_VOICE || 'Kore',
        language: ttsSettings?.language || 'vi'
      };
      // Get a Gemini client for TTS
      if (activeClientInfo?.client && aiResponse) {
        // Strip markdown for cleaner TTS
        const cleanText = aiResponse.replace(/[*_`#\[\]()~>|]/g, '').slice(0, 4000);
        const ttsPath = await synthesizeGeminiSpeech(activeClientInfo.client, cleanText, settings);
        if (ttsPath) {
          const langLabel = formatTtsLanguageLabel(settings.language, lang);
          const voiceOptions = buildThreadedOptions(msg, {
            caption: t(lang, 'ai_voice_reply_caption', { voice: formatTtsVoiceLabel(settings.voice) })
          });
          try {
            await bot.sendAudio(msg.chat.id, ttsPath, voiceOptions, {
              filename: path.basename(ttsPath),
              contentType: 'audio/wav'
            });
          } catch (sendError) {
            log.warn(`Failed to send voice reply: ${sanitizeSecrets(sendError.message)}`);
          } finally {
            try {
              await fs.promises.unlink(ttsPath);
            } catch (cleanupError) {
              // ignore cleanup errors
            }
          }
        }
      }
    } catch (ttsError) {
      log.warn(`Voice reply TTS failed: ${sanitizeSecrets(ttsError.message)}`);
    }
  }
  async function runGroqCompletion({ msg, lang, promptText, parts, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGroqKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGroqKeyIndices.has(userId)) {
      userDisabledGroqKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGroqKeyIndices });
    }
    const content = buildGroqMessageContent(parts, promptText);
    const usesVisionModel = content.some((entry) => entry?.type === 'image_url');
    const model = usesVisionModel ? GROQ_VISION_MODEL : GROQ_MODEL;
    let response = null;
    let lastError = null;
    let activeSource = keySource;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserGroqKeyIndex(userId) : aiState.groqKeyIndex;
      if (pool.type === 'server' && disabledGroqKeyIndices.size >= pool.keys.length) {
        lastError = new Error('No valid Groq API keys');
        continue;
      }
      for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getGroqClient(keyIndex, pool.keys);
        if (!clientInfo) {
          lastError = new Error('Missing Groq API key');
          break;
        }
        try {
          const groqResponse = await axios.post(
            GROQ_API_URL,
            {
              messages: [
                {
                  role: 'user',
                  content
                }
              ],
              model
            },
            {
              headers: {
                Authorization: `Bearer ${clientInfo.apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
            }
          );
          response = groqResponse?.data;
          if (pool.type === 'user') {
            setUserGroqKeyIndex(userId, clientInfo.index);
          } else {
            aiState.groqKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
          break;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 403) {
            if (pool.type === 'user') {
              disableUserGroqKey(userId, keyIndex, pool.keys.length);
            } else {
              disableGroqKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (error?.response?.status === 429) {
            log.warn('Groq rate limit hit, rotating key');
          }
          if (pool.type === 'user') {
            advanceUserGroqKeyIndex(userId, pool.keys.length);
          } else {
            advanceGroqKeyIndex();
          }
          log.error(`Failed to generate Groq content with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        }
      }
      if (response) {
        break;
      }
    }
    if (!response) {
      throw lastError || new Error('No Groq response');
    }
    const aiResponse = response?.choices?.[0]?.message?.content || '';
    const body = (aiResponse || '').trim() || t(lang, 'ai_error');
    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && keySource === 'server') {
      noticePrefix.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const decoratedBody = decorateWithContextualIcons(body);
    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(decoratedBody)}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = applyThreadId(msg, { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
  }
  async function tryOpenAiAudioModalities({ apiKey, combinedPrompt, transcript, audioBuffer, audioFormat }) {
    if (!OPENAI_AUDIO_MODEL || !audioBuffer) {
      return null;
    }
    const base64Audio = audioBuffer.toString('base64');
    const payload = {
      model: OPENAI_AUDIO_MODEL,
      modalities: ['text', 'audio'],
      audio: {
        voice: OPENAI_TTS_VOICE,
        format: OPENAI_TTS_FORMAT
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: combinedPrompt || transcript || 'Reply to this audio.'
            },
            {
              type: 'input_audio',
              input_audio: {
                data: base64Audio,
                format: audioFormat || 'ogg'
              }
            }
          ]
        }
      ]
    };
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
    });
    const message = response?.data?.choices?.[0]?.message || {};
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .map((part) => (part?.text ? part.text : typeof part === 'string' ? part : ''))
        .join('')
        .trim();
    }
    const audioBase64 = message?.audio?.data || response?.data?.output_audio?.data || null;
    const responseAudio = audioBase64 ? Buffer.from(audioBase64, 'base64') : null;
    if (!text && !responseAudio) {
      return null;
    }
    return { text, audioBuffer: responseAudio };
  }
  async function completeOpenAiAudioConversation({ apiKey, transcript, promptText, audioBuffer, audioFormat }) {
    const combinedPrompt = promptText && transcript
      ? `${promptText}\n\nVoice input:\n${transcript}`
      : promptText || transcript || '';
    try {
      const modalResult = await tryOpenAiAudioModalities({
        apiKey,
        combinedPrompt,
        transcript,
        audioBuffer,
        audioFormat
      });
      if (modalResult?.text || modalResult?.audioBuffer) {
        return modalResult;
      }
    } catch (error) {
      log.warn(`Multimodal audio request failed: ${sanitizeSecrets(error.message)}`);
    }
    const fallbackPrompt = combinedPrompt || 'Please respond to this audio message.';
    const completion = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: fallbackPrompt
        }
      ]
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
    });
    const message = completion?.data?.choices?.[0]?.message || {};
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .map((part) => (part?.text ? part.text : typeof part === 'string' ? part : ''))
        .join('')
        .trim();
    }
    let audioReply = null;
    if (text) {
      try {
        audioReply = await synthesizeOpenAiSpeech(text, apiKey);
      } catch (speechError) {
        log.warn(`OpenAI speech synthesis failed: ${sanitizeSecrets(speechError.message)}`);
      }
    }
    return { text, audioBuffer: audioReply };
  }
  async function runOpenAiAudioCompletion({ msg, lang, promptText, audioSource, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledOpenAiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledOpenAiKeyIndices.has(userId)) {
      userDisabledOpenAiKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledOpenAiKeyIndices });
    }
    let transcript = '';
    let aiResponse = '';
    let voiceBuffer = null;
    let activeSource = keySource;
    let lastError = null;
    let hasResponse = false;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserOpenAiKeyIndex(userId) : aiState.openAiKeyIndex;
      for (let attempt = 0; attempt < maxAttempts && !hasResponse; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getOpenAiClient(keyIndex, pool.keys);
        if (!clientInfo) {
          lastError = new Error('Missing OpenAI API key');
          break;
        }
        let downloadInfo = null;
        try {
          downloadInfo = await downloadTelegramFile(audioSource.audio.file_id, 'ai-audio');
          const audioBuffer = await fs.promises.readFile(downloadInfo.filePath);
          transcript = await transcribeOpenAiAudio(downloadInfo.filePath, clientInfo.apiKey, {});
          const result = await completeOpenAiAudioConversation({
            apiKey: clientInfo.apiKey,
            transcript,
            promptText,
            audioBuffer,
            audioFormat: downloadInfo.format
          });
          aiResponse = result?.text || '';
          voiceBuffer = result?.audioBuffer || null;
          hasResponse = Boolean(aiResponse) || Boolean(voiceBuffer && voiceBuffer.length);
          if (pool.type === 'user') {
            setUserOpenAiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.openAiKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            if (pool.type === 'user') {
              disableUserOpenAiKey(userId, keyIndex, pool.keys.length);
            } else {
              disableOpenAiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (error?.response?.status === 429) {
            log.warn('OpenAI audio rate limit hit, rotating key');
          }
          if (pool.type === 'user') {
            advanceUserOpenAiKeyIndex(userId, pool.keys.length);
          } else {
            advanceOpenAiKeyIndex();
          }
          log.error(`Failed to process OpenAI audio with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        } finally {
          if (downloadInfo?.filePath) {
            try {
              await fs.promises.unlink(downloadInfo.filePath);
            } catch (cleanupError) {
              log.warn(`Failed to clean audio temp file: ${cleanupError.message}`);
            }
          }
        }
      }
      if (hasResponse) {
        break;
      }
    }
    if (!hasResponse) {
      throw lastError || new Error('No OpenAI audio response');
    }
    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && activeSource === 'server') {
      noticePrefix.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const bodyParts = [];
    if (transcript) {
      bodyParts.push(`${t(lang, 'ai_audio_user_said', { text: escapeMarkdownV2(transcript) })}`);
    }
    if (aiResponse) {
      const decoratedAiResponse = decorateWithContextualIcons(aiResponse);
      bodyParts.push(convertMarkdownToTelegram(decoratedAiResponse));
    }
    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${bodyParts.filter(Boolean).join('\n\n')}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = applyThreadId(msg, { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
    if (voiceBuffer && voiceBuffer.length) {
      const voiceOptions = buildThreadedOptions(msg, {
        caption: t(lang, 'ai_audio_voice_caption', { provider: providerMeta.label }),
        reply_markup: replyMarkup
      });
      try {
        await bot.sendVoice(msg.chat.id, voiceBuffer, voiceOptions);
      } catch (voiceError) {
        log.warn(`Failed to send voice reply: ${voiceError.message}`);
      }
    }
  }
  async function runOpenAiImageRequest({ msg, lang, promptText, action, photos, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledOpenAiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledOpenAiKeyIndices.has(userId)) {
      userDisabledOpenAiKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledOpenAiKeyIndices });
    }
    const imageSource = { buffer: null };
    if (action !== 'generate') {
      const largestPhoto = Array.isArray(photos) && photos.length ? photos[photos.length - 1] : null;
      if (!largestPhoto) {
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
        return;
      }
      const download = await downloadTelegramPhotoBuffer(largestPhoto);
      if (download?.error === 'too_large') {
        await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: download.limitMb }), {
          reply_markup: buildCloseKeyboard(lang)
        });
        return;
      }
      if (!download?.buffer) {
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
        return;
      }
      const pngBuffer = await convertImageToPngSquare(download.buffer);
      const maxMb = Math.max(1, Math.ceil(AI_IMAGE_MAX_BYTES / (1024 * 1024)));
      if (pngBuffer.length > AI_IMAGE_MAX_BYTES) {
        await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: maxMb }), {
          reply_markup: buildCloseKeyboard(lang)
        });
        return;
      }
      imageSource.buffer = pngBuffer;
    }
    let response = null;
    let lastError = null;
    let activeSource = keySource;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserOpenAiKeyIndex(userId) : aiState.openAiKeyIndex;
      if (pool.type === 'server' && disabledOpenAiKeyIndices.size >= pool.keys.length) {
        lastError = new Error('No valid OpenAI API keys');
        continue;
      }
      for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getOpenAiClient(keyIndex, pool.keys);
        if (!clientInfo?.client) {
          lastError = new Error('Missing OpenAI API key');
          break;
        }
        try {
          let imageResponse = null;
          if (action === 'generate') {
            imageResponse = await clientInfo.client.images.generate({
              model: OPENAI_IMAGE_MODEL,
              prompt: promptText,
              n: 1,
              size: '1024x1024',
              response_format: 'b64_json'
            });
          } else if (action === 'edit') {
            imageResponse = await clientInfo.client.images.edit({
              model: OPENAI_IMAGE_EDIT_MODEL,
              prompt: promptText,
              image: imageSource.buffer,
              n: 1,
              size: '1024x1024',
              response_format: 'b64_json'
            });
          } else {
            imageResponse = await clientInfo.client.images.createVariation({
              model: OPENAI_IMAGE_VARIATION_MODEL,
              image: imageSource.buffer,
              n: 1,
              size: '1024x1024',
              response_format: 'b64_json'
            });
          }
          response = imageResponse;
          if (pool.type === 'user') {
            setUserOpenAiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.openAiKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
          break;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            if (pool.type === 'user') {
              disableUserOpenAiKey(userId, keyIndex, pool.keys.length);
            } else {
              disableOpenAiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (error?.response?.status === 429) {
            log.warn('OpenAI rate limit hit during image request, rotating key');
          }
          if (pool.type === 'user') {
            advanceUserOpenAiKeyIndex(userId, pool.keys.length);
          } else {
            advanceOpenAiKeyIndex();
          }
          log.error(`Failed to generate OpenAI image with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        }
      }
      if (response) {
        break;
      }
    }
    if (!response) {
      const errorMessage = lastError?.message || 'Unknown error';
      const quotaHit = isQuotaOrRateLimitError(lastError);
      const billingLimit = isOpenAiBillingError(lastError);
      log.error(`OpenAI image request failed: ${sanitizeSecrets(errorMessage)}`);
      const messageKey = billingLimit ? 'ai_provider_billing_limit' : quotaHit ? 'ai_provider_quota' : 'ai_error';
      await sendReply(msg, t(lang, messageKey, { provider: providerMeta.label }), {
        parse_mode: 'HTML',
        reply_markup: buildCloseKeyboard(lang)
      });
      return;
    }
    const imageData = response?.data?.[0]?.b64_json || null;
    if (!imageData) {
      log.error('OpenAI image response missing payload');
      await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
      return;
    }
    const photoBuffer = Buffer.from(imageData, 'base64');
    const captionLines = [];
    captionLines.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    const modelLine = buildModelLine(activeModelLabel, activeModelName);
    captionLines.push(escapeMarkdownV2(modelLine));
    const modelNotice = buildGeminiModelNotice(lang, activeModelLabel, null, activeModelName);
    modelNotice.forEach((line) => captionLines.push(escapeMarkdownV2(line)));
    if (limitNotice && activeSource === 'server') {
      captionLines.push(escapeMarkdownV2(limitNotice));
    }
    captionLines.push(`🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`);
    if (promptText) {
      captionLines.push(escapeMarkdownV2(promptText));
    }
    const caption = captionLines.filter(Boolean).join('\n');
    const options = buildThreadedOptions(msg, applyThreadId(msg, {
      caption,
      parse_mode: 'MarkdownV2',
      reply_markup: buildCloseKeyboard(lang)
    }));
    try {
      await bot.sendPhoto(msg.chat.id, photoBuffer, options);
      // Track per-user image usage for dashboard
      if (userId) {
        try {
          await db.incrementCommandUsage('image_gen', userId, new Date().toISOString().slice(0, 10));
        } catch (usageErr) {
          log.warn(`Failed to record image usage: ${usageErr.message}`);
        }
      }
    } catch (error) {
      log.error(`Failed to send image response: ${error.message}`);
      await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
    }
  }
  async function runGoogleImageRequest({ msg, lang, promptText, action, photos, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledGeminiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledGeminiKeyIndices.has(userId)) {
      userDisabledGeminiKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledGeminiKeyIndices });
    }
    const imageSource = { buffer: null, mimeType: 'image/png' };
    if (action !== 'generate') {
      const largestPhoto = Array.isArray(photos) && photos.length ? photos[photos.length - 1] : null;
      if (!largestPhoto) {
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
        return;
      }
      const download = await downloadTelegramPhotoBuffer(largestPhoto);
      if (download?.error === 'too_large') {
        await sendReply(msg, t(lang, 'ai_image_too_large', { limitMb: download.limitMb }), {
          reply_markup: buildCloseKeyboard(lang)
        });
        return;
      }
      if (!download?.buffer) {
        await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
        return;
      }
      imageSource.buffer = download.buffer;
      imageSource.mimeType = download.mimeType || 'image/png';
    }
    let response = null;
    let lastError = null;
    let activeSource = keySource;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserGeminiKeyIndex(userId) : aiState.geminiKeyIndex;
      if (pool.type === 'server' && disabledGeminiKeyIndices.size >= pool.keys.length) {
        lastError = new Error('No valid Gemini API keys');
        continue;
      }
      for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getGeminiClient(keyIndex, pool.keys);
        if (!clientInfo?.client) {
          lastError = new Error('Missing Gemini API key');
          break;
        }
        try {
          const parts = [{ text: promptText }];
          if (action !== 'generate' && imageSource.buffer) {
            parts.push(bufferToGenerativePart(imageSource.buffer, imageSource.mimeType));
          }
          // Only use custom image model for personal API keys
          // Server keys always use default GEMINI_IMAGE_MODEL
          let imageModelName = GEMINI_IMAGE_MODEL;
          let imageModelLabel = resolveGeminiModelLabel(imageModelName, 'image');
          if (pool.type === 'user') {
            const userModelConfig = getUserGeminiModelConfig(userId);
            imageModelName = userModelConfig.modelConfig?.image || GEMINI_IMAGE_MODEL;
            imageModelLabel = resolveGeminiModelLabel(imageModelName, 'image');
          }
          const requestTimeoutMs = Math.max(AI_IMAGE_DOWNLOAD_TIMEOUT_MS || 20000, 60000);
          const imageResponse = await Promise.race([
            clientInfo.client.models.generateContent({
              model: imageModelName,
              contents: [
                {
                  role: 'user',
                  parts
                }
              ]
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini image request timeout')), requestTimeoutMs))
          ]);
          response = imageResponse;
          if (pool.type === 'user') {
            setUserGeminiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.geminiKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
          activeModelName = imageModelName;
          activeModelLabel = imageModelLabel;
          break;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 401 || error?.response?.status === 403 || isGeminiApiKeyExpired(error)) {
            if (pool.type === 'user') {
              disableUserGeminiKey(userId, keyIndex, pool.keys.length);
            } else {
              disableGeminiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (error?.response?.status === 429) {
            log.warn('Gemini rate limit hit during image request, rotating key');
          }
          if (pool.type === 'user') {
            advanceUserGeminiKeyIndex(userId, pool.keys.length);
          } else {
            advanceGeminiKeyIndex();
          }
          log.error(`Failed to generate Gemini image with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        }
      }
      if (response) {
        break;
      }
    }
    if (!response) {
      const errorMessage = lastError?.message || 'Unknown error';
      const quotaHit = isQuotaOrRateLimitError(lastError);
      const expiredKey = isGeminiApiKeyExpired(lastError);
      log.error(`Gemini image request failed: ${sanitizeSecrets(errorMessage)}`);
      const messageKey = expiredKey ? 'ai_provider_gemini_key_expired' : quotaHit ? 'ai_provider_quota' : 'ai_error';
      await sendReply(msg, t(lang, messageKey, { provider: providerMeta.label }), {
        parse_mode: 'HTML',
        reply_markup: buildCloseKeyboard(lang)
      });
      return;
    }
    const candidateParts = response?.candidates?.[0]?.content?.parts || [];
    const imagePart = candidateParts.find((part) => part?.inlineData?.data);
    const aiText = extractGoogleCandidateText(response)
      || candidateParts.map((part) => part?.text || '').join('').trim();
    const imageData = imagePart?.inlineData?.data || null;
    if (!imageData && aiText) {
      const usageLines = buildGeminiUsageLines(lang, response, { outputMimeType: imagePart?.inlineData?.mimeType, userId })
        .map((line) => escapeMarkdownV2(line));
      const providerLine = escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label }));
      const modelLine = escapeMarkdownV2(buildModelLine(activeModelLabel, activeModelName));
      const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
      const noticePrefix = [providerLine, modelLine, ...usageLines].filter(Boolean).join('\n');
      const decoratedAiText = decorateWithContextualIcons(aiText);
      const replyText = `${noticePrefix ? `${noticePrefix}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(decoratedAiText)}`;
      const replyMarkup = buildCloseKeyboard(lang);
      const chunks = splitTelegramMarkdownV2Text(replyText);
      const options = applyThreadId(msg, { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk || !chunk.trim()) {
          continue;
        }
        await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
      }
      return;
    }
    const imageDataFinal = imageData;
    if (!imageDataFinal) {
      log.error('Gemini image response missing payload');
      await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
      return;
    }
    const usageLines = buildGeminiUsageLines(lang, response, {
      outputMimeType: imagePart?.inlineData?.mimeType,
      userId
    });
    const photoBuffer = Buffer.from(imageDataFinal, 'base64');
    const captionLines = [];
    captionLines.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    captionLines.push(escapeMarkdownV2(buildModelLine(activeModelLabel, activeModelName)));
    usageLines.forEach((line) => captionLines.push(escapeMarkdownV2(line)));
    if (limitNotice && activeSource === 'server') {
      captionLines.push(escapeMarkdownV2(limitNotice));
    }
    captionLines.push(`🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`);
    if (aiText) {
      const decoratedAiText = decorateWithContextualIcons(aiText);
      captionLines.push(convertMarkdownToTelegram(decoratedAiText));
    }
    const caption = captionLines.filter(Boolean).join('\n\n');
    const options = buildThreadedOptions(msg, applyThreadId(msg, {
      caption,
      parse_mode: 'MarkdownV2',
      reply_markup: buildCloseKeyboard(lang)
    }));
    try {
      await bot.sendPhoto(msg.chat.id, photoBuffer, options);
      // Track per-user image usage for dashboard
      if (userId) {
        try {
          await db.incrementCommandUsage('image_gen', userId, new Date().toISOString().slice(0, 10));
        } catch (usageErr) {
          log.warn(`Failed to record image usage: ${usageErr.message}`);
        }
      }
    } catch (error) {
      log.error(`Failed to send Gemini image response: ${error.message}`);
      await sendReply(msg, t(lang, 'ai_error'), { reply_markup: buildCloseKeyboard(lang) });
    }
  }
  async function runOpenAiCompletion({ msg, lang, promptText, parts, keySource, limitNotice, personalKeys, serverLimitState, userId, serverKeys, providerMeta }) {
    const responsePools = [];
    const userDisabledSet = userId ? userDisabledOpenAiKeyIndices.get(userId) || new Set() : null;
    if (userId && userDisabledSet && !userDisabledOpenAiKeyIndices.has(userId)) {
      userDisabledOpenAiKeyIndices.set(userId, userDisabledSet);
    }
    if (personalKeys.length) {
      responsePools.push({ type: 'user', keys: personalKeys, disabledSet: userDisabledSet });
    } else if (!serverLimitState.blocked && serverKeys.length) {
      responsePools.push({ type: 'server', keys: serverKeys, disabledSet: disabledOpenAiKeyIndices });
    }
    const content = buildGroqMessageContent(parts, promptText);
    let response = null;
    let lastError = null;
    let activeSource = keySource;
    for (const pool of responsePools) {
      if (!pool.keys.length) {
        continue;
      }
      const maxAttempts = pool.keys.length;
      const disabledSet = pool.disabledSet || new Set();
      const startIndex = pool.type === 'user' ? getUserOpenAiKeyIndex(userId) : aiState.openAiKeyIndex;
      if (pool.type === 'server' && disabledOpenAiKeyIndices.size >= pool.keys.length) {
        lastError = new Error('No valid OpenAI API keys');
        continue;
      }
      for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
        const keyIndex = (startIndex + attempt) % pool.keys.length;
        if (disabledSet.has(keyIndex)) {
          continue;
        }
        const clientInfo = getOpenAiClient(keyIndex, pool.keys);
        if (!clientInfo) {
          lastError = new Error('Missing OpenAI API key');
          break;
        }
        try {
          const openAiResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: OPENAI_MODEL,
              messages: [
                {
                  role: 'user',
                  content
                }
              ]
            },
            {
              headers: {
                Authorization: `Bearer ${clientInfo.apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: AI_IMAGE_DOWNLOAD_TIMEOUT_MS
            }
          );
          response = openAiResponse?.data;
          if (pool.type === 'user') {
            setUserOpenAiKeyIndex(userId, clientInfo.index);
          } else {
            aiState.openAiKeyIndex = clientInfo.index;
          }
          activeSource = pool.type;
          break;
        } catch (error) {
          lastError = error;
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            if (pool.type === 'user') {
              disableUserOpenAiKey(userId, keyIndex, pool.keys.length);
            } else {
              disableOpenAiKey(keyIndex, error.message || 'Forbidden');
            }
          }
          if (error?.response?.status === 429) {
            log.warn('OpenAI rate limit hit, rotating key');
          }
          if (pool.type === 'user') {
            advanceUserOpenAiKeyIndex(userId, pool.keys.length);
          } else {
            advanceOpenAiKeyIndex();
          }
          log.error(`Failed to generate OpenAI content with ${pool.type} key index ${keyIndex}: ${sanitizeSecrets(error.message)}`);
        }
      }
      if (response) {
        break;
      }
    }
    if (!response) {
      throw lastError || new Error('No OpenAI response');
    }
    const message = response?.choices?.[0]?.message || {};
    const messageContent = message.content;
    let aiResponse = '';
    if (typeof messageContent === 'string') {
      aiResponse = messageContent;
    } else if (Array.isArray(messageContent)) {
      aiResponse = messageContent
        .map((part) => (part?.text ? part.text : typeof part === 'string' ? part : ''))
        .join('')
        .trim();
    }
    const body = (aiResponse || '').trim() || t(lang, 'ai_error');
    const noticePrefix = [];
    noticePrefix.push(escapeMarkdownV2(t(lang, 'ai_provider_active', { provider: providerMeta.label })));
    if (limitNotice && keySource === 'server') {
      noticePrefix.push(escapeMarkdownV2(limitNotice));
    }
    const header = `🤖 *${escapeMarkdownV2(t(lang, 'ai_response_title'))}*`;
    const decoratedBody = decorateWithContextualIcons(body);
    const replyText = `${noticePrefix.length ? `${noticePrefix.join('\n')}\n\n` : ''}${header}\n\n${convertMarkdownToTelegram(decoratedBody)}`;
    const replyMarkup = buildCloseKeyboard(lang);
    const chunks = splitTelegramMarkdownV2Text(replyText);
    const options = applyThreadId(msg, { reply_markup: replyMarkup, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      await sendMessageRespectingThread(msg.chat.id, msg, chunk, options);
    }
  }
  // ============================================================================
  // Function Calling System for /aia Command
  // ============================================================================
  /**
   * Function Declarations organized by permission level.
   * These define the schema that Gemini uses to understand available functions.
   */
  // USER LEVEL FUNCTIONS - Available to all users
  const getUserInfoDeclaration = {
    name: 'get_user_info',
    description: 'Get information about a user including their ID, username, and full name. Works when replying to a message or with user ID/username.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram chat/group ID where to look up the user'
        },
        user_identifier: {
          type: Type.STRING,
          description: 'User ID (numeric) or username (with or without @) to look up. Optional if context provides it.'
        }
      },
      required: ['chat_id']
    }
  };
  const getMemberCountDeclaration = {
    name: 'get_member_count',
    description: 'Retrieves the total number of members in a Telegram group or supergroup.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The unique ID of the Telegram group/supergroup'
        }
      },
      required: ['chat_id']
    }
  };
  // ADMIN LEVEL FUNCTIONS - Only for group administrators
  const banMemberDeclaration = {
    name: 'ban_member',
    description: 'Ban a user from the Telegram group permanently. Requires admin permission. Optionally revoke their messages.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to ban'
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for banning the user'
        },
        revoke_messages: {
          type: Type.BOOLEAN,
          description: 'Whether to delete all messages from this user in the group. Default: true'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const kickMemberDeclaration = {
    name: 'kick_member',
    description: 'Kick (remove) a user from the group temporarily. They can rejoin via invite link. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to kick'
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for kicking the user'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const muteMemberDeclaration = {
    name: 'mute_member',
    description: 'Mute a user in the group, preventing them from sending messages. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to mute'
        },
        duration_seconds: {
          type: Type.NUMBER,
          description: 'How long to mute in seconds. Default: 3600 (1 hour). Use large number for permanent.'
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for muting'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const unmuteMemberDeclaration = {
    name: 'unmute_member',
    description: 'Unmute a previously muted user, restoring their ability to send messages. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to unmute'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const warnMemberDeclaration = {
    name: 'warn_member',
    description: 'Issue a warning to a user. After reaching warn limit, automated action (ban/kick/mute) is applied. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to warn'
        },
        reason: {
          type: Type.STRING,
          description: 'Reason for the warning'
        }
      },
      required: ['chat_id', 'user_id', 'reason']
    }
  };
  // OWNER LEVEL FUNCTIONS - Only for bot owners
  const setCommandLimitDeclaration = {
    name: 'set_command_limit',
    description: 'Set usage limit for AI commands for a specific user or globally. Only bot owner can use this.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: 'Maximum number of AI command uses per day'
        },
        user_id: {
          type: Type.STRING,
          description: 'User ID to set limit for. Omit for global limit.'
        }
      },
      required: ['limit']
    }
  };
  // ===========================================================================
  // RANDOM/GAMING FUNCTIONS - User level (all users can play games)
  // ===========================================================================
  const playDiceDeclaration = {
    name: 'play_dice',
    description: 'Roll dice using standard notation like "2d6" (roll two 6-sided dice)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        notation: {
          type: Type.STRING,
          description: 'Dice notation in format NdM where N is number of dice and M is number of faces. Examples: "2d6", "3d20", "1d100"'
        }
      },
      required: ['notation']
    }
  };
  const playRpsDeclaration = {
    name: 'play_rps',
    description: 'Play rock-paper-scissors game with the bot. Accepts multiple languages.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        choice: {
          type: Type.STRING,
          description: 'Your choice in any language. Valid options: ' +
            'English: "rock", "paper", "scissors" | ' +
            'Vietnamese: "búa", "bao", "kéo" | ' +
            'Chinese: "石头", "布", "剪刀" | ' +
            'Korean: "바위", "보", "가위" | ' +
            'Russian: "камень", "бумага", "ножницы" | ' +
            'Indonesian: "batu", "kertas", "gunting"'
        }
      },
      required: ['choice']
    }
  };
  const generateRandomNumberDeclaration = {
    name: 'generate_random_number',
    description: 'Generate a random number within a specified range',
    parameters: {
      type: Type.OBJECT,
      properties: {
        min: {
          type: Type.NUMBER,
          description: 'Minimum value (inclusive). Default is 1'
        },
        max: {
          type: Type.NUMBER,
          description: 'Maximum value (inclusive). Default is 1000'
        }
      },
      required: []
    }
  };
  const generateLongShortDeclaration = {
    name: 'generate_longshort',
    description: 'Generate a LONG or SHORT trading signal with random leverage (1-100x) for fun trading simulation',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const randomChoiceDeclaration = {
    name: 'random_choice',
    description: 'Randomly choose one option from a list of choices',
    parameters: {
      type: Type.OBJECT,
      properties: {
        options: {
          type: Type.ARRAY,
          description: 'List of options to choose from (minimum 2 options)',
          items: { type: Type.STRING }
        }
      },
      required: ['options']
    }
  };
  const getFortuneDeclaration = {
    name: 'get_fortune',
    description: 'Get a random fortune or advice (like a fortune cookie)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic_code: {
          type: Type.NUMBER,
          description: 'Optional topic code number to get fortune from specific category'
        }
      },
      required: []
    }
  };
  const createQuizDeclaration = {
    name: 'create_quiz',
    description: 'Generate a random trivia or quiz question for the user to answer',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const startMemoryGameDeclaration = {
    name: 'start_memory_game',
    description: 'Start a memory card matching game with customizable theme and grid size',
    parameters: {
      type: Type.OBJECT,
      properties: {
        theme: {
          type: Type.STRING,
          description: 'Theme for cards: food, sports, nature, animals, travel, symbols, or mixed (default)'
        },
        size: {
          type: Type.STRING,
          description: 'Grid size in format RxC like "4x4", "6x6". Default is "4x4"'
        }
      },
      required: []
    }
  };
  const startMinesweeperDeclaration = {
    name: 'start_minesweeper',
    description: 'Start a minesweeper game with customizable grid size',
    parameters: {
      type: Type.OBJECT,
      properties: {
        size: {
          type: Type.STRING,
          description: 'Grid size in format RxC like "5x5", "9x9". Default is "5x5"'
        }
      },
      required: []
    }
  };
  const startTreasureHuntDeclaration = {
    name: 'start_treasure_hunt',
    description: 'Start a treasure hunt game where user finds hidden treasure in a grid',
    parameters: {
      type: Type.OBJECT,
      properties: {
        size: {
          type: Type.STRING,
          description: 'Grid size in format RxC like "6x6". Default is "6x6"'
        }
      },
      required: []
    }
  };
  const startSudokuDeclaration = {
    name: 'start_sudoku',
    description: 'Start a sudoku puzzle game',
    parameters: {
      type: Type.OBJECT,
      properties: {
        size: {
          type: Type.NUMBER,
          description: 'Board size: 4 (easy), 6 (medium), or 9 (hard). Default is 9'
        }
      },
      required: []
    }
  };
  const startGomokuDeclaration = {
    name: 'start_gomoku',
    description: 'Start a gomoku (5-in-a-row) game against AI',
    parameters: {
      type: Type.OBJECT,
      properties: {
        board_size: {
          type: Type.NUMBER,
          description: 'Board size from 7 to 12. Default varies by difficulty'
        }
      },
      required: []
    }
  };
  const startChessDeclaration = {
    name: 'start_chess',
    description: 'Start a chess game against AI on standard 8x8 board',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  };
  // ========================================================================
  // XLAYER CHECK FUNCTION DECLARATIONS
  // ========================================================================
  const checkWalletBalanceDeclaration = {
    name: 'check_wallet_balance',
    description: 'Check wallet balance and portfolio. Use when user asks to check wallet, view balance, or see portfolio',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'Optional wallet address to check. If not provided, shows user\'s registered wallets'
        }
      },
      required: []
    }
  };
  const deleteChatHistoryDeclaration = {
    name: 'delete_chat_history',
    description: 'Delete/clear chat history with the bot. Use when user says "clear chat", "delete history", "xóa lịch sử chat"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const getTokenInfoDeclaration = {
    name: 'get_token_info',
    description: 'Get token price, volume, market cap. Use when user asks about token price, crypto price, coin info',
    parameters: {
      type: Type.OBJECT,
      properties: {
        token: {
          type: Type.STRING,
          description: 'Token symbol like ETH, BTC, OKB, or contract address'
        }
      },
      required: []
    }
  };
  const lookupContractDeclaration = {
    name: 'lookup_contract',
    description: 'Look up smart contract information by address',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'Contract address to look up'
        }
      },
      required: ['address']
    }
  };
  const lookupTransactionDeclaration = {
    name: 'lookup_transaction',
    description: 'Look up transaction details by hash. Use when user asks about tx, transaction hash',
    parameters: {
      type: Type.OBJECT,
      properties: {
        txhash: {
          type: Type.STRING,
          description: 'Transaction hash to look up'
        }
      },
      required: ['txhash']
    }
  };
  const checkOkxChainsDeclaration = {
    name: 'check_okx_chains',
    description: 'Get list of supported blockchain chains on OKX',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const checkOkx402StatusDeclaration = {
    name: 'check_okx402_status',
    description: 'Check OKX 402 API status',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };

  const getGroupInfoDeclaration = {
    name: 'get_group_info',
    description: 'Get information about the current group/chat. Use when user asks about group stats, members, admins',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const getCheckinStatsDeclaration = {
    name: 'get_checkin_stats',
    description: 'Get checkin statistics and daily checkin. Use when user asks about checkin, điểm danh, streak',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  // ========================================================================
  // AI COMMAND FUNCTION DECLARATIONS
  // ========================================================================
  const askAiDeclaration = {
    name: 'ask_ai',
    description: 'Ask AI a question or have a conversation. Use when user wants to chat, ask questions, or needs AI help',
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: {
          type: Type.STRING,
          description: 'The question or prompt to ask AI'
        }
      },
      required: ['question']
    }
  };
  const textToSpeechDeclaration = {
    name: 'text_to_speech',
    description: 'Convert text to speech audio. Use when user says "đọc", "read aloud", "nói", "speak", "TTS", "chuyển thành giọng nói"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'The text to convert to speech'
        }
      },
      required: ['text']
    }
  };
  const manageAiApiDeclaration = {
    name: 'manage_ai_api',
    description: 'Open AI API key management. Use when user says "quản lý API", "add API key", "thêm key", "API settings"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const changeAiLanguageDeclaration = {
    name: 'change_ai_language',
    description: 'Change bot language. Use when user says "đổi ngôn ngữ", "change language", "switch to English/Vietnamese"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const generateImageDeclaration = {
    name: 'generate_image',
    description: 'Generate an image from text prompt. Use when user says "tạo ảnh", "vẽ", "create image", "draw", "generate picture"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: 'Description of the image to generate'
        }
      },
      required: ['prompt']
    }
  };
  // ========================================================================
  // CHECKIN & WALLET FUNCTION DECLARATIONS
  // ========================================================================
  const doCheckinDeclaration = {
    name: 'do_checkin',
    description: 'Perform daily check-in. Use when user says "điểm danh", "checkin", "check in", "đăng ký điểm danh", "điểm danh đi"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const getCheckinLeaderboardDeclaration = {
    name: 'get_checkin_leaderboard',
    description: 'Get check-in leaderboard/ranking. Use when user says "top checkin", "bảng xếp hạng điểm danh", "ai điểm danh nhiều nhất", "xếp hạng"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const checkTokenPriceDeclaration = {
    name: 'check_token_price',
    description: 'Check cryptocurrency/token price. Use when user says "giá", "price", "giá coin", "giá token", "bao nhiêu tiền", "giá OKB", "giá BTC". When user specifies a chain (e.g. "trên Xlayer", "on ethereum"), pass the chain parameter.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: 'Token symbol to check price (e.g., OKB, BTC, ETH, XDOG, BANMAO).'
        },
        chain: {
          type: Type.STRING,
          description: 'Blockchain network name if user specified (e.g., xlayer, ethereum, bsc, solana, polygon, arbitrum, base, avalanche). Leave empty if not specified.'
        }
      },
      required: ['symbol']
    }
  };
  const getMyWalletDeclaration = {
    name: 'get_my_wallet',
    description: 'Get user wallet information. Use when user says "ví của tôi", "my wallet", "xem ví", "balance", "số dư", "tài khoản"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const checkWalletBalanceDirectDeclaration = {
    name: 'check_wallet_balance_direct',
    description: 'Look up any wallet address balance and holdings directly. Use when user pastes a wallet address (0x... or XKO...) and wants to see balances, portfolio, assets. Returns detailed data automatically without requiring any button clicks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'The wallet address to look up (0x... or XKO... format)'
        }
      },
      required: ['address']
    }
  };
  const compareTokensDeclaration = {
    name: 'compare_tokens',
    description: 'Compare 2-4 cryptocurrency tokens side by side. Use when user says "so sánh", "compare", "vs", "đối chiếu", e.g. "so sánh OKB vs BNB", "compare ETH BTC SOL".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbols: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of 2-4 token symbols to compare (e.g. ["OKB","BNB"])'
        }
      },
      required: ['symbols']
    }
  };
  // ──── AI Insight ────
  const analyzeTokenDeclaration = {
    name: 'analyze_token',
    description: 'Deep analysis of a token with technical indicators (RSI, MA, whale trades). Use when user says "phân tích", "analyze", "nên mua", "should I buy", "phân tích kỹ thuật", "technical analysis", "dự báo", "forecast", "nhận định".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol to analyze (e.g. "OKB", "BANMAO", "ETH")' },
        chain: { type: Type.STRING, description: 'Optional chain filter (e.g. "196" for X Layer)' }
      },
      required: ['symbol']
    }
  };
  // ──── Feature 2: P2E Rewards ────
  const checkRewardPointsDeclaration = {
    name: 'check_reward_points',
    description: 'Check game reward points. Use when user says "điểm thưởng", "reward points", "điểm game", "my points", "xem điểm".',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };
  const redeemRewardsDeclaration = {
    name: 'redeem_rewards',
    description: 'Redeem game points for $BANMAO tokens. Use when user says "đổi thưởng", "redeem", "đổi điểm", "claim reward".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        points: { type: Type.NUMBER, description: 'Number of points to redeem (100 points = 1 $BANMAO)' }
      },
      required: ['points']
    }
  };
  // ──── Feature 3: Intent Trading ────
  const swapIntentDeclaration = {
    name: 'swap_intent',
    description: 'Execute a token swap/trade. Use when user says "mua", "bán", "swap", "đổi", "buy", "sell", "exchange", "trade", e.g. "dùng 10 USDT mua BANMAO", "swap 0.1 OKB to USDT".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        from_token: { type: Type.STRING, description: 'Token to sell (e.g. "USDT", "OKB")' },
        to_token: { type: Type.STRING, description: 'Token to buy (e.g. "BANMAO", "ETH")' },
        amount: { type: Type.STRING, description: 'Amount of from_token to spend (e.g. "10", "0.5")' },
        chain: { type: Type.STRING, description: 'Chain index ("196" for X Layer, default)' }
      },
      required: ['from_token', 'to_token', 'amount']
    }
  };
  // ──── Trading Wallet Management ────
  const manageTradingWalletDeclaration = {
    name: 'manage_trading_wallet',
    description: 'Manage trading wallet. Use when user says "tạo ví", "create wallet", "nhập key", "import key", "xem key", "export key", "ví giao dịch", "trading wallet", "kết nối ví", "connect wallet", "xóa ví giao dịch", "delete trading wallet", "kiểm tra số dư ví giao dịch", "check trading balance".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, description: 'Action: "create" (unlimited wallets allowed), "import" (import key), "export" (secure backup routine), "delete" (remove wallet), "balance" (check balance), "menu" (show wallet menu)' },
        pin_code: { type: Type.STRING, description: 'User\'s 4-digit PIN code for verifying sensitive actions like export.' }
      },
      required: ['action']
    }
  };
  const setWalletPinDeclaration = {
    name: 'set_wallet_pin',
    description: 'Thiết lập hoặc đổi mã PIN bảo mật 4 số cho ví giao dịch của người dùng. Dùng khi user nói "đặt mã pin", "cài pin", "đổi mật khẩu ví".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        new_pin: { type: Type.STRING, description: 'Mã PIN 4 số nguyên mới do người dùng yêu cầu (VD: "1234").' },
        current_pin: { type: Type.STRING, description: 'Mã PIN 4 số nguyên hiện tại (chỉ bắt buộc nếu đổi PIN).' }
      },
      required: ['new_pin']
    }
  };
  // ──── Phase 2: Price Alerts & Favorites ────
  const setPriceAlertDeclaration = {
    name: 'set_price_alert',
    description: 'Set a price alert for a token. Bot will notify when price goes above/below target. Use when user says "báo tôi khi", "alert when", "notify me if", "đặt cảnh báo", "set alert".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol (e.g. "OKB", "ETH")' },
        target_price: { type: Type.NUMBER, description: 'Target price in USD' },
        direction: { type: Type.STRING, description: '"above" or "below"' }
      },
      required: ['symbol', 'target_price']
    }
  };
  const listPriceAlertsDeclaration = {
    name: 'list_price_alerts',
    description: 'Show all active price alerts. Use when user says "danh sách cảnh báo", "my alerts", "xem alert".',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };
  const deletePriceAlertDeclaration = {
    name: 'delete_price_alert',
    description: 'Delete a price alert by ID. Use when user says "xóa cảnh báo", "delete alert", "hủy alert".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        alert_id: { type: Type.NUMBER, description: 'Alert ID to delete' }
      },
      required: ['alert_id']
    }
  };
  const addFavoriteTokenDeclaration = {
    name: 'add_favorite_token',
    description: 'Add a token to favorites. Use when user says "lưu", "yêu thích", "bookmark", "save token", "thêm vào yêu thích".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol (e.g. "OKB")' }
      },
      required: ['symbol']
    }
  };
  const removeFavoriteTokenDeclaration = {
    name: 'remove_favorite_token',
    description: 'Remove a token from favorites.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol to remove' }
      },
      required: ['symbol']
    }
  };
  const checkFavoritePricesDeclaration = {
    name: 'check_favorite_prices',
    description: 'Check prices of all favorite tokens at once. Use when user says "giá token của tôi", "my tokens", "favorites", "yêu thích", "xem token đã lưu".',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };
  const showHelpDeclaration = {
    name: 'show_help',
    description: 'Show bot help menu. Use only when user explicitly asks for help (/help, "help", "trợ giúp", "hướng dẫn"). Avoid triggering for generic questions like "bạn có thể làm gì".',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const showDonateDeclaration = {
    name: 'show_donate',
    description: 'Show donation information. Use when user says "donate", "ủng hộ", "quyên góp", "捐款", "支持"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const registerWalletDeclaration = {
    name: 'register_wallet',
    description: 'Register wallet address. Use when user says "đăng ký ví", "register wallet", "thêm ví", "add wallet"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'Wallet address to register (0x...)'
        }
      },
      required: []
    }
  };
  const showRandomMenuDeclaration = {
    name: 'show_random_menu',
    description: 'Show random games menu. Use when user says "menu game", "trò chơi", "chơi gì", "game menu", "random menu"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const showTelegramIdDeclaration = {
    name: 'show_telegram_id',
    description: 'Show Telegram user/chat ID information. Use when user says "ID của tôi", "telegram ID", "chat ID", "user ID", "lấy ID"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const setPersonaDeclaration = {
    name: 'set_persona',
    description: 'Change AI personality/persona. Use when user says "đổi tính cách", "change persona", "AI hài hước", "AI anime", "AI chuyên nghiệp", "personality mode"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        persona_id: {
          type: Type.STRING,
          description: 'Persona ID to set (default, friendly, formal, anime, mentor, funny, crypto, gamer, rebel, mafia, cute, little_girl, little_brother, old_uncle, old_grandma, deity, king, banana_cat, pretty_sister, seductive_girl, gentleman, custom)'
        },
        persona_prompt: {
          type: Type.STRING,
          description: 'Optional prompt/description for custom persona when persona_id is "custom"'
        }
      },
      required: []
    }
  };
  /**
   * Map function names to their actual implementation functions
   */
  const toolFunctionImplementations = {
    // User functions
    get_user_info: async ({ chat_id, user_identifier }, context) => {
      try {
        const targetId = user_identifier || context.msg.reply_to_message?.from?.id;
        if (!targetId) {
          return { success: false, error: 'No user specified. Please reply to a message or provide user ID/username.' };
        }
        let userId = targetId;
        if (isNaN(targetId)) {
          // It's a username, look it up
          const resolved = await context.deps.resolveTargetId?.(chat_id, targetId);
          userId = resolved;
        }
        if (!userId) {
          return { success: false, error: `User ${targetId} not found.` };
        }
        const userInfo = await context.deps.resolveUserProfile?.(chat_id, userId);
        return {
          success: true,
          user_id: userId,
          username: userInfo?.username || null,
          first_name: userInfo?.first_name || null,
          last_name: userInfo?.last_name || null,
          full_name: [userInfo?.first_name, userInfo?.last_name].filter(Boolean).join(' ') || null
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    get_member_count: async ({ chat_id }, context) => {
      try {
        const count = await bot.getChatMemberCount(chat_id);
        return {
          success: true,
          chat_id,
          member_count: count,
          message: `The group has ${count} members.`
        };
      } catch (error) {
        return { success: false, error: `Failed to get member count: ${error.message}` };
      }
    },
    // Admin functions
    ban_member: async ({ chat_id, user_id, reason, revoke_messages = true }, context) => {
      try {
        await bot.banChatMember(chat_id, user_id, { revoke_messages });
        return {
          success: true,
          action: 'ban',
          chat_id,
          user_id,
          reason: reason || 'No reason provided',
          message: `Successfully banned user ${user_id}${reason ? ` for: ${reason}` : ''}`
        };
      } catch (error) {
        return { success: false, error: `Failed to ban user: ${error.message}` };
      }
    },
    kick_member: async ({ chat_id, user_id, reason }, context) => {
      try {
        const until = Math.floor(Date.now() / 1000) + 60;
        await bot.banChatMember(chat_id, user_id, { until_date: until });
        await bot.unbanChatMember(chat_id, user_id, { only_if_banned: true });
        return {
          success: true,
          action: 'kick',
          chat_id,
          user_id,
          reason: reason || 'No reason provided',
          message: `Successfully kicked user ${user_id}${reason ? ` for: ${reason}` : ''}`
        };
      } catch (error) {
        return { success: false, error: `Failed to kick user: ${error.message}` };
      }
    },
    mute_member: async ({ chat_id, user_id, duration_seconds = 3600, reason }, context) => {
      try {
        const until = Math.floor(Date.now() / 1000) + duration_seconds;
        await bot.restrictChatMember(chat_id, user_id, {
          until_date: until,
          permissions: { can_send_messages: false }
        });
        return {
          success: true,
          action: 'mute',
          chat_id,
          user_id,
          duration_seconds,
          reason: reason || 'No reason provided',
          message: `Successfully muted user ${user_id} for ${duration_seconds} seconds${reason ? ` - ${reason}` : ''}`
        };
      } catch (error) {
        return { success: false, error: `Failed to mute user: ${error.message}` };
      }
    },
    unmute_member: async ({ chat_id, user_id }, context) => {
      try {
        await bot.restrictChatMember(chat_id, user_id, {
          permissions: { can_send_messages: true }
        });
        return {
          success: true,
          action: 'unmute',
          chat_id,
          user_id,
          message: `Successfully unmuted user ${user_id}`
        };
      } catch (error) {
        return { success: false, error: `Failed to unmute user: ${error.message}` };
      }
    },
    warn_member: async ({ chat_id, user_id, reason }, context) => {
      try {
        // This would integrate with existing warn system
        return {
          success: true,
          action: 'warn',
          chat_id,
          user_id,
          reason,
          message: `Warning issued to user ${user_id} for: ${reason}`
        };
      } catch (error) {
        return { success: false, error: `Failed to warn user: ${error.message}` };
      }
    },
    // Owner functions
    set_command_limit: async ({ limit, user_id }, context) => {
      try {
        // Would integrate with existing limit system
        const target = user_id || 'global';
        return {
          success: true,
          action: 'set_limit',
          target,
          limit,
          message: `Set AI command limit to ${limit} per day for ${target}`
        };
      } catch (error) {
        return { success: false, error: `Failed to set limit: ${error.message}` };
      }
    },
    // ========================================================================
    // RANDOM/GAMING FUNCTION IMPLEMENTATIONS
    // ========================================================================
    // Bot self-introduction
    get_bot_introduction: async ({ }, context) => {
      try {
        const { msg } = context;
        const lang = await getLang(msg);
        const introduction = t(lang, 'aib_bot_introduction') ||
          "I'm Xlayer Bot AI, a virtual assistant helping OKX's Xlayer community. Developed by DOREMON (x.com/haivcon)";
        return {
          success: true,
          introduction,
          message: introduction
        };
      } catch (error) {
        return { success: false, error: `Failed to get introduction: ${error.message}` };
      }
    },
    play_dice: async ({ notation }, context) => {
      try {
        // Parse dice notation (e.g., "2d6")
        const match = /^([1-9]\d*)d([1-9]\d*)$/i.exec((notation || '').trim());
        if (!match) {
          return {
            success: false,
            error: 'Invalid dice notation. Use format like "2d6" (2 six-sided dice)'
          };
        }
        const count = Math.min(10, Math.max(1, parseInt(match[1])));
        const faces = Math.min(100, Math.max(2, parseInt(match[2])));
        // Roll the dice
        const rolls = [];
        for (let i = 0; i < count; i++) {
          rolls.push(Math.floor(Math.random() * faces) + 1);
        }
        const total = rolls.reduce((sum, val) => sum + val, 0);
        return {
          success: true,
          notation: `${count}d${faces}`,
          rolls,
          total,
          message: `Rolled ${count}d${faces}: [${rolls.join(', ')}] = ${total}`
        };
      } catch (error) {
        return { success: false, error: `Failed to roll dice: ${error.message}` };
      }
    },
    play_rps: async ({ choice }, context) => {
      try {
        const choices = ['rock', 'paper', 'scissors'];
        const icons = { rock: '🪨', paper: '📄', scissors: '✂️' };
        // Multilingual mapping
        const languageMap = {
          // Vietnamese
          'búa': 'rock', 'bao': 'paper', 'kéo': 'scissors',
          // Chinese
          '石头': 'rock', '布': 'paper', '剪刀': 'scissors',
          // Korean
          '바위': 'rock', '보': 'paper', '가위': 'scissors',
          // Russian
          'камень': 'rock', 'бумага': 'paper', 'ножницы': 'scissors',
          // Indonesian
          'batu': 'rock', 'kertas': 'paper', 'gunting': 'scissors'
        };
        let userChoice = (choice || '').toLowerCase().trim();
        // Map to English if needed
        if (languageMap[userChoice]) {
          userChoice = languageMap[userChoice];
        }
        if (!choices.includes(userChoice)) {
          return {
            success: false,
            error: 'Invalid choice. Must be rock/paper/scissors (or equivalent in your language)'
          };
        }
        const botChoice = choices[Math.floor(Math.random() * 3)];
        let outcome = 'draw';
        if (
          (userChoice === 'rock' && botChoice === 'scissors') ||
          (userChoice === 'paper' && botChoice === 'rock') ||
          (userChoice === 'scissors' && botChoice === 'paper')
        ) {
          outcome = 'win';
        } else if (userChoice !== botChoice) {
          outcome = 'lose';
        }
        return {
          success: true,
          your_choice: userChoice,
          bot_choice: botChoice,
          outcome,
          message: `You: ${icons[userChoice]} ${userChoice} | Bot: ${icons[botChoice]} ${botChoice} → ${outcome.toUpperCase()}!`
        };
      } catch (error) {
        return { success: false, error: `Failed to play RPS: ${error.message}` };
      }
    },
    generate_random_number: async ({ min = 1, max = 1000 }, context) => {
      try {
        const minVal = Math.floor(Math.min(min, max));
        const maxVal = Math.floor(Math.max(min, max));
        const result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
        return {
          success: true,
          min: minVal,
          max: maxVal,
          result,
          message: `Random number between ${minVal} and ${maxVal}: ${result}`
        };
      } catch (error) {
        return { success: false, error: `Failed to generate random number: ${error.message}` };
      }
    },
    generate_longshort: async ({ }, context) => {
      try {
        const isLong = Math.random() > 0.5;
        const leverage = Math.floor(Math.random() * 100) + 1;
        const position = isLong ? 'LONG' : 'SHORT';
        const icon = isLong ? '📈' : '📉';
        return {
          success: true,
          position,
          leverage,
          message: `${icon} ${position} ${leverage}x - Good luck with your trade!`
        };
      } catch (error) {
        return { success: false, error: `Failed to generate LONG/SHORT: ${error.message}` };
      }
    },
    random_choice: async ({ options }, context) => {
      try {
        if (!Array.isArray(options) || options.length < 2) {
          return {
            success: false,
            error: 'Provide at least 2 options to choose from'
          };
        }
        const index = Math.floor(Math.random() * options.length);
        const chosen = options[index];
        return {
          success: true,
          options,
          chosen,
          chosen_index: index + 1,
          message: `Random choice from ${options.length} options: ${chosen}`
        };
      } catch (error) {
        return { success: false, error: `Failed to make random choice: ${error.message}` };
      }
    },
    get_fortune: async ({ topic_code }, context) => {
      try {
        // Simple fortune messages
        const fortunes = [
          "Good luck will come your way soon",
          "A pleasant surprise is in store for you",
          "Your hard work will pay off",
          "An exciting opportunity is coming",
          "Trust your instincts",
          "A new friendship will bring joy",
          "Your creativity will flourish",
          "Patience will bring rewards",
          "A journey awaits you",
          "Success is on the horizon"
        ];
        const index = topic_code ?
          (topic_code - 1) % fortunes.length :
          Math.floor(Math.random() * fortunes.length);
        const fortune = fortunes[index];
        return {
          success: true,
          fortune,
          message: `🔮 Fortune: "${fortune}"`
        };
      } catch (error) {
        return { success: false, error: `Failed to get fortune: ${error.message}` };
      }
    },
    create_quiz: async ({ }, context) => {
      try {
        // Simple math quiz
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        const operators = ['+', '-', '*'];
        const operator = operators[Math.floor(Math.random() * operators.length)];
        let answer;
        switch (operator) {
          case '+': answer = num1 + num2; break;
          case '-': answer = num1 - num2; break;
          case '*': answer = num1 * num2; break;
        }
        // Generate wrong answers
        const options = [
          answer,
          answer + Math.floor(Math.random() * 5) + 1,
          answer - Math.floor(Math.random() * 5) - 1,
          answer + Math.floor(Math.random() * 10) + 5
        ].sort(() => Math.random() - 0.5);
        const question = `What is ${num1} ${operator} ${num2}?`;
        return {
          success: true,
          question,
          options,
          correct_answer: answer,
          message: `Quiz: ${question}\nOptions: ${options.join(', ')}\nCorrect answer: ${answer}`
        };
      } catch (error) {
        return { success: false, error: `Failed to create quiz: ${error.message}` };
      }
    },
    // ========================================================================
    // INTERACTIVE GAME STARTERS - Enhanced messages with clear instructions
    // ========================================================================
    start_memory_game: async ({ theme = 'mixed', size = '4x4' }, context) => {
      try {
        const [rows, cols] = size.split('x').map(n => parseInt(n) || 4);
        return {
          success: true,
          game_type: 'memory',
          theme,
          size: `${rows}x${cols}`,
          message: `🧠 Memory Game Created!\n\n` +
            `➤ Theme: ${theme}\n` +
            `➤ Grid: ${rows}x${cols}\n\n` +
            `Ready to play! Use the /memory command to start flipping cards and matching pairs.\n` +
            `Tip: Type /memory ${theme} ${rows}x${cols} to launch this exact setup.`
        };
      } catch (error) {
        return { success: false, error: `Failed to configure memory game: ${error.message}` };
      }
    },
    start_minesweeper: async ({ size = '5x5' }, context) => {
      try {
        const [rows, cols] = size.split('x').map(n => parseInt(n) || 5);
        return {
          success: true,
          game_type: 'minesweeper',
          size: `${rows}x${cols}`,
          message: `💣 Minesweeper Game Ready!\n\n` +
            `➤ Grid: ${rows}x${cols}\n\n` +
            `Use /mines command to start the game with interactive buttons.\n` +
            `Features: flag mode, replay, auto-reveal nearby cells.\n` +
            `Quick start: /mines ${rows}x${cols}`
        };
      } catch (error) {
        return { success: false, error: `Failed to configure minesweeper: ${error.message}` };
      }
    },
    start_treasure_hunt: async ({ size = '6x6' }, context) => {
      try {
        const gridSize = size.includes('x') ? size : `${size}x${size}`;
        const [rows, cols] = gridSize.split('x').map(n => parseInt(n) || 6);
        return {
          success: true,
          game_type: 'treasure',
          size: `${rows}x${cols}`,
          message: `🧭 Treasure Hunt Initialized!\n\n` +
            `➤ Map: ${rows}x${cols}\n\n` +
            `Search for hidden treasure! Use /treasure to start.\n` +
            `Radar hints show distance, avoid traps!\n` +
            `Commands: /treasure ${rows}x${cols}`
        };
      } catch (error) {
        return { success: false, error: `Failed to setup treasure hunt: ${error.message}` };
      }
    },
    start_sudoku: async ({ size = 9 }, context) => {
      try {
        const validSizes = [4, 6, 9];
        const boardSize = validSizes.includes(size) ? size : 9;
        const difficulty = boardSize === 4 ? 'Easy' : boardSize === 6 ? 'Medium' : 'Hard';
        return {
          success: true,
          game_type: 'sudoku',
          size: boardSize,
          difficulty,
          message: `🔢 Sudoku Puzzle Generated!\n\n` +
            `➤ Size: ${boardSize}x${boardSize}\n` +
            `➤ Difficulty: ${difficulty}\n\n` +
            `Solve the puzzle using /sudoku command.\n` +
            `Select cells, fill numbers, clear mistakes.\n` +
            `Launch: /sudoku ${boardSize}`
        };
      } catch (error) {
        return { success: false, error: `Failed to generate sudoku: ${error.message}` };
      }
    },
    start_gomoku: async ({ board_size }, context) => {
      try {
        const size = (board_size && board_size >= 7 && board_size <= 12) ? board_size : 8;
        return {
          success: true,
          game_type: 'gomoku',
          board_size: `8x${size}`,
          message: `⭕ Gomoku Board Set!\n\n` +
            `➤ Board: 8x${size} (5-in-a-row)\n\n` +
            `Play against AI using /gomoku command.\n` +
            `Get 5 in a row to win!\n` +
            `Start: /gomoku 8x${size}`
        };
      } catch (error) {
        return { success: false, error: `Failed to setup gomoku: ${error.message}` };
      }
    },
    start_chess: async ({ }, context) => {
      try {
        return {
          success: true,
          game_type: 'chess',
          message: `♟️ Chess Match Ready!\n\n` +
            `➤ Board: Standard 8x8\n` +
            `➤ Opponent: AI Bot\n\n` +
            `Challenge the AI using /chess command.\n` +
            `Tap pieces to select, tap squares to move.\n` +
            `Commands: /chess`
        };
      } catch (error) {
        return { success: false, error: `Failed to setup chess: ${error.message}` };
      }
    },
    // ========================================================================
    // XLAYER CHECK FUNCTION IMPLEMENTATIONS
    // Use bot.processUpdate() to trigger native command handlers
    // ========================================================================
    check_wallet_balance: async ({ address }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = address ? `/mywallet ${address}` : '/mywallet';
        // Trigger native /mywallet command
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'check_wallet',
          message: 'Opening wallet manager...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check wallet: ${error.message}` };
      }
    },
    delete_chat_history: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/rmchat',
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'delete_chat_history',
          message: 'Clearing chat history...'
        };
      } catch (error) {
        return { success: false, error: `Failed to delete chat history: ${error.message}` };
      }
    },
    get_token_info: async ({ token }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = token ? `/token ${token}` : '/token';
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 6 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'token_info',
          token,
          message: `Looking up token: ${token || 'default'}...`
        };
      } catch (error) {
        return { success: false, error: `Failed to get token info: ${error.message}` };
      }
    },
    lookup_contract: async ({ address }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/contract ${address}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'contract_lookup',
          address,
          message: 'Looking up contract...'
        };
      } catch (error) {
        return { success: false, error: `Failed to lookup contract: ${error.message}` };
      }
    },
    lookup_transaction: async ({ txhash }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/txhash ${txhash}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'transaction_lookup',
          txhash,
          message: 'Looking up transaction...'
        };
      } catch (error) {
        return { success: false, error: `Failed to lookup transaction: ${error.message}` };
      }
    },
    check_okx_chains: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/okxchains',
            entities: [{ type: 'bot_command', offset: 0, length: 10 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'check_chains',
          message: 'Getting supported chains...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check chains: ${error.message}` };
      }
    },
    check_okx402_status: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/okx402status',
            entities: [{ type: 'bot_command', offset: 0, length: 13 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'check_okx402',
          message: 'Checking OKX 402 status...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check OKX402 status: ${error.message}` };
      }
    },

    get_group_info: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/info',
            entities: [{ type: 'bot_command', offset: 0, length: 5 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'group_info',
          message: 'Getting group information...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get group info: ${error.message}` };
      }
    },
    get_checkin_stats: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/checkin',
            entities: [{ type: 'bot_command', offset: 0, length: 8 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'checkin_stats',
          message: 'Getting checkin stats...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get checkin stats: ${error.message}` };
      }
    },
    // ========================================================================
    // CHECKIN & WALLET FUNCTION IMPLEMENTATIONS
    // ========================================================================
    do_checkin: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/checkin',
            entities: [{ type: 'bot_command', offset: 0, length: 8 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'do_checkin',
          message: 'Processing check-in...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check-in: ${error.message}` };
      }
    },
    get_checkin_leaderboard: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/topcheckin',
            entities: [{ type: 'bot_command', offset: 0, length: 11 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'checkin_leaderboard',
          message: 'Getting check-in leaderboard...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get leaderboard: ${error.message}` };
      }
    },
    check_token_price: async ({ symbol, chain }, context) => {
      try {
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        const keyword = (symbol || '').trim();
        if (!keyword) {
          return { success: false, error: 'No token symbol provided. Please specify a token like OKB, BTC, ETH.' };
        }
        // Map chain name to chainIndex
        const chainNameToIndex = {
          'ethereum': '1', 'eth': '1', 'bsc': '56', 'binance': '56', 'xlayer': '196', 'x layer': '196',
          'solana': '501', 'sol': '501', 'polygon': '137', 'avalanche': '43114', 'avax': '43114',
          'arbitrum': '42161', 'arb': '42161', 'optimism': '10', 'op': '10', 'base': '8453'
        };
        const specifiedChainIndex = chain ? chainNameToIndex[chain.toLowerCase()] || null : null;
        // Well-known tokens — instant lookup
        const KNOWN_TOKENS = {
          'BTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Bitcoin (Wrapped)' },
          'WBTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Wrapped Bitcoin' },
          'ETH': { chainIndex: '1', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', fullName: 'Ethereum' },
          'USDT': { chainIndex: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', fullName: 'Tether USD' },
          'USDC': { chainIndex: '1', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', fullName: 'USD Coin' },
          'BNB': { chainIndex: '56', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB', fullName: 'BNB' },
          'SOL': { chainIndex: '501', address: '11111111111111111111111111111111', symbol: 'SOL', fullName: 'Solana' },
          'DOGE': { chainIndex: '1', address: '0x4206931337dc273a630d328da6441786bfad668f', symbol: 'DOGE', fullName: 'Dogecoin' },
          'OKB': { chainIndex: '196', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'OKB', fullName: 'OKB' }
        };
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '43114': 'Avalanche', '42161': 'Arbitrum', '10': 'Optimism', '8453': 'Base' };
        const upperKeyword = keyword.toUpperCase();
        // Known token → instant price card
        const known = KNOWN_TOKENS[upperKeyword];
        const lang = getLang(msg.chat.id);
        if (known) {
          const priceCard = await _buildPriceCard(onchainos, known.chainIndex, known.address, known.symbol, known.fullName, chainNames, t, lang);
          return { success: true, displayMessage: priceCard };
        }
        // Search across chains (filter by specified chain if any)
        const searchChains = specifiedChainIndex || '196,1,56,501,43114,42161,10,8453,137';
        const searchResults = await onchainos.getTokenSearch(searchChains, keyword).catch(() => null);
        if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
          return { success: false, error: `Token "${keyword}" not found${specifiedChainIndex ? ` on ${chain}` : ''}. Try full name or contract address.` };
        }
        // If chain specified or exactly 1 result → show price directly
        if (specifiedChainIndex || searchResults.length === 1) {
          const sr = searchResults[0];
          const priceCard = await _buildPriceCard(onchainos, sr.chainIndex, sr.tokenContractAddress, sr.tokenSymbol, sr.tokenFullName, chainNames, t, lang);
          // Send via bot for HTML formatting
          await bot.sendMessage(msg.chat.id, priceCard, {
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
            message_thread_id: msg.message_thread_id || undefined,
            disable_web_page_preview: true
          });
          return { success: true, action: 'price_displayed', displayMessage: t(lang, 'ai_token_search_found_single', { symbol: sr.tokenSymbol }) || `Price displayed for ${sr.tokenSymbol}.` };
        }
        // Multiple results → paginated inline keyboard
        // Cache search results for callback (includes t and lang for i18n)
        const cacheKey = `tks_${Date.now()}_${msg.from?.id || 0}`;
        _tokenSearchCache.set(cacheKey, { results: searchResults, keyword, chainNames, timestamp: Date.now(), t, lang });
        // Clean old cache entries (>10 min)
        for (const [k, v] of _tokenSearchCache.entries()) {
          if (Date.now() - v.timestamp > 600000) _tokenSearchCache.delete(k);
        }
        // Send paginated list
        const page = 0;
        const pageText = _buildTokenListPage(searchResults, keyword, page, chainNames, t, lang);
        const keyboard = _buildTokenListKeyboard(searchResults, cacheKey, page, t, lang);
        await bot.sendMessage(msg.chat.id, pageText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
          reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined
        });
        return {
          success: true,
          action: 'token_search_list',
          displayMessage: t(lang, 'ai_token_search_found_multi', { count: searchResults.length, keyword }) || `Found ${searchResults.length} tokens matching "${keyword}". Sent selection list.`
        };
      } catch (error) {
        return { success: false, error: `Failed to check price: ${error.message}` };
      }
    },
    get_my_wallet: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/mywallet',
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'my_wallet',
          message: 'Getting wallet information...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get wallet: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // Direct wallet balance lookup - calls API and returns data
    // ────────────────────────────────────────────────────────────
    check_wallet_balance_direct: async ({ address }, context) => {
      try {
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        if (!address || !address.trim()) {
          return { success: false, error: 'No wallet address provided.' };
        }
        let walletAddress = address.trim();
        const originalAddress = walletAddress;
        // Convert XKO prefix to 0x for API compatibility
        if (/^XKO/i.test(walletAddress)) {
          walletAddress = '0x' + walletAddress.slice(3);
        }
        const chainSlugs = { '1': 'eth', '56': 'bsc', '196': 'xlayer', '137': 'polygon', '501': 'solana', '42161': 'arbitrum', '8453': 'base' };
        // Feature 7: Check if address is a token contract (not a wallet)
        const tryChains = ['196', '1', '56'];
        for (const ci of tryChains) {
          const tokenInfo = await onchainos.getTokenBasicInfo([{ chainIndex: ci, tokenContractAddress: walletAddress }]).catch(() => null);
          if (tokenInfo && Array.isArray(tokenInfo) && tokenInfo.length > 0 && tokenInfo[0].tokenSymbol) {
            const ti = tokenInfo[0];
            const wLang = getLang(msg.chat.id);
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base' };
            const priceCard = await _buildPriceCard(onchainos, ci, walletAddress, ti.tokenSymbol, ti.tokenFullName || ti.tokenSymbol, chainNames, t, wLang);
            await bot.sendMessage(msg.chat.id, `💡 ${t(wLang, 'ai_detected_token')}\n\n` + priceCard, {
              parse_mode: 'HTML', reply_to_message_id: msg.message_id,
              message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
            });
            return { success: true, action: 'token_detected', displayMessage: `Detected token contract: ${ti.tokenSymbol}` };
          }
        }
        // Chain map
        const chains = '196,1,56';
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base' };
        const [totalValue, balances] = await Promise.all([
          onchainos.getWalletTotalValue(walletAddress, chains).catch(() => null),
          onchainos.getWalletBalances(walletAddress, chains).catch(() => null)
        ]);
        // Parse aggregate total
        let totalUSD = 0;
        if (totalValue && Array.isArray(totalValue) && totalValue.length > 0) {
          totalUSD = Number(totalValue[0].totalValue || 0);
        }
        // Extract token holdings with correct field names
        let holdings = [];
        const chainTotals = {};
        if (balances && Array.isArray(balances)) {
          balances.forEach(b => {
            const tokenList = b?.tokenAssets || [];
            if (Array.isArray(tokenList)) {
              tokenList.forEach(t => {
                const bal = Number(t.balance || t.holdingAmount || 0);
                const price = Number(t.tokenPrice || 0);
                const valueUSD = price * bal;
                const ci = t.chainIndex || '';
                if (bal > 0) {
                  holdings.push({
                    symbol: t.symbol || t.tokenSymbol || '?',
                    name: t.tokenName || '',
                    amount: bal,
                    price,
                    valueUSD,
                    chain: ci,
                    address: t.tokenContractAddress || ''
                  });
                  chainTotals[ci] = (chainTotals[ci] || 0) + valueUSD;
                }
              });
            }
          });
        }
        holdings.sort((a, b) => b.valueUSD - a.valueUSD);
        const topHoldings = holdings.slice(0, 15);
        const wLang = getLang(msg.chat.id);
        // Build professional display message with OKX Explorer links
        const addrShort = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        const mainChain = Object.keys(chainTotals).sort((a, b) => (chainTotals[b] || 0) - (chainTotals[a] || 0))[0] || '196';
        const explorerSlug = chainSlugs[mainChain] || 'xlayer';
        const explorerLink = `https://www.okx.com/web3/explorer/${explorerSlug}/address/${walletAddress}`;
        let card = `👛 <b>${t(wLang, 'ai_wallet_analysis')}</b>`;
        // Feature 5: Whale badge
        if (totalUSD >= 10000) card += ` ${t(wLang, 'ai_whale_badge')}`;
        card += `\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        card += `📍 <a href="${explorerLink}">${addrShort}</a>`;
        if (originalAddress !== walletAddress) card += ` (${originalAddress.slice(0, 6)}...)`;
        card += `\n`;
        card += `💰 ${t(wLang, 'ai_wallet_total')}: <b>$${totalUSD.toFixed(2)}</b>\n`;
        // Chain breakdown
        const activeChains = Object.entries(chainTotals).filter(([, v]) => v > 0.001).sort((a, b) => b[1] - a[1]);
        if (activeChains.length > 0) {
          card += `\n🔗 <b>${t(wLang, 'ai_wallet_chains')}:</b>\n`;
          activeChains.forEach(([ci, val]) => {
            card += `   ${chainNames[ci] || ci}: $${val.toFixed(2)}\n`;
          });
        }
        // Token holdings
        if (topHoldings.length > 0) {
          card += `\n📊 <b>${t(wLang, 'ai_wallet_top_tokens', { count: holdings.length })}:</b>\n`;
          topHoldings.forEach((h, i) => {
            const amtStr = h.amount < 0.001 ? h.amount.toFixed(8) : h.amount < 1 ? h.amount.toFixed(4) : h.amount > 1e6 ? (h.amount / 1e6).toFixed(2) + 'M' : h.amount.toFixed(2);
            const chain = chainNames[h.chain] || h.chain;
            const tokenLink = h.address ? `https://www.okx.com/web3/explorer/${chainSlugs[h.chain] || explorerSlug}/token/${h.address}` : '';
            const symDisplay = tokenLink ? `<a href="${tokenLink}">${h.symbol}</a>` : `<b>${h.symbol}</b>`;
            card += `   ${i + 1}. ${symDisplay} · ${amtStr} · $${h.valueUSD.toFixed(2)} · ${chain}\n`;
          });
        } else {
          card += `\n📭 ${t(wLang, 'ai_wallet_no_tokens')}\n`;
        }
        // Feature 6: TX History link
        card += `\n📃 <a href="${explorerLink}">${t(wLang, 'ai_wallet_tx_history')}</a>\n`;
        // Send directly via bot for proper HTML formatting
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML',
          reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined,
          disable_web_page_preview: true
        });
        return {
          success: true,
          action: 'wallet_displayed',
          displayMessage: `Wallet ${addrShort}: $${totalUSD.toFixed(2)} with ${holdings.length} tokens.`
        };
      } catch (error) {
        return { success: false, error: `Failed to check wallet: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // Token Compare - side by side price comparison
    // ────────────────────────────────────────────────────────────
    compare_tokens: async ({ symbols }, context) => {
      try {
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
          return { success: false, error: 'Need at least 2 token symbols to compare.' };
        }
        const toCompare = symbols.slice(0, 4).map(s => s.trim().toUpperCase());
        const KNOWN_TOKENS = {
          'BTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Bitcoin' },
          'ETH': { chainIndex: '1', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', fullName: 'Ethereum' },
          'USDT': { chainIndex: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', fullName: 'Tether' },
          'BNB': { chainIndex: '56', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB', fullName: 'BNB' },
          'SOL': { chainIndex: '501', address: '11111111111111111111111111111111', symbol: 'SOL', fullName: 'Solana' },
          'OKB': { chainIndex: '196', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'OKB', fullName: 'OKB' }
        };
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base' };
        const lang = getLang(msg.chat.id);
        // Resolve each symbol to chain+address
        const resolved = await Promise.all(toCompare.map(async sym => {
          const known = KNOWN_TOKENS[sym];
          if (known) return { sym, chainIndex: known.chainIndex, address: known.address, fullName: known.fullName };
          const sr = await onchainos.getTokenSearch('196,1,56,501', sym).catch(() => []);
          if (sr && sr.length > 0) return { sym: sr[0].tokenSymbol, chainIndex: sr[0].chainIndex, address: sr[0].tokenContractAddress, fullName: sr[0].tokenFullName || sym };
          return null;
        }));
        const valid = resolved.filter(Boolean);
        if (valid.length < 2) return { success: false, error: 'Could not find enough tokens to compare.' };
        // Fetch prices+candles in parallel
        const data = await Promise.all(valid.map(async v => {
          const [priceInfo, candles] = await Promise.all([
            onchainos.getTokenPriceInfo([{ chainIndex: v.chainIndex, tokenContractAddress: v.address }]).catch(() => null),
            onchainos.getMarketCandles(v.chainIndex, v.address, { bar: '1D', limit: 7 }).catch(() => null)
          ]);
          const info = priceInfo && Array.isArray(priceInfo) && priceInfo.length > 0 ? priceInfo[0] : {};
          return { ...v, price: Number(info.price || 0), change24h: Number(info.priceChange24H || 0), marketCap: Number(info.marketCap || 0), sparkline: _buildSparkline(candles) };
        }));
        // Build comparison card
        let card = `⚖️ <b>${t(lang, 'ai_compare_title')}</b>\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        data.forEach((d, i) => {
          const priceStr = d.price < 0.0001 ? d.price.toFixed(10) : d.price < 0.01 ? d.price.toFixed(8) : d.price < 1 ? d.price.toFixed(4) : d.price.toFixed(2);
          const changeStr = `${d.change24h >= 0 ? '+' : ''}${d.change24h.toFixed(2)}%`;
          const changeIcon = d.change24h >= 0 ? '📈' : '📉';
          const mCapStr = d.marketCap > 1e9 ? (d.marketCap / 1e9).toFixed(2) + 'B' : d.marketCap > 1e6 ? (d.marketCap / 1e6).toFixed(2) + 'M' : '$' + d.marketCap.toFixed(0);
          card += `\n<b>${i + 1}. ${d.sym}</b> (${d.fullName})\n`;
          card += `   💵 $${priceStr}  ${changeIcon} ${changeStr}\n`;
          if (d.marketCap > 0) card += `   📊 MCap: $${mCapStr}\n`;
          if (d.sparkline) card += `   📉 <code>${d.sparkline}</code>\n`;
          card += `   🔗 ${chainNames[d.chainIndex] || d.chainIndex}\n`;
        });
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
        });
        return { success: true, action: 'compare_displayed', displayMessage: `Compared ${valid.map(v => v.sym).join(' vs ')}.` };
      } catch (error) {
        return { success: false, error: `Failed to compare: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // AI Insight: Token Analysis with Technical Indicators
    // ────────────────────────────────────────────────────────────
    analyze_token: async ({ symbol, chain }, context) => {
      try {
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        const lang = getLang(msg.chat.id);
        // Resolve token
        const KNOWN = {
          'BTC': { ci: '1', addr: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', fn: 'Bitcoin' },
          'ETH': { ci: '1', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'Ethereum' },
          'OKB': { ci: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'OKB' },
          'BNB': { ci: '56', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'BNB' },
          'BANMAO': { ci: '196', addr: '0x9bA84834c10d07372e33D4C105F08C984b03a5e0', fn: '$BANMAO' }
        };
        const upper = symbol.toUpperCase();
        let chainIndex, tokenAddress, fullName;
        if (KNOWN[upper]) { chainIndex = KNOWN[upper].ci; tokenAddress = KNOWN[upper].addr; fullName = KNOWN[upper].fn; }
        else {
          const sr = await onchainos.getTokenSearch(chain || '196,1,56,501', symbol).catch(() => []);
          if (sr && sr.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; fullName = sr[0].tokenFullName || upper; }
          else return { success: false, error: `Token "${symbol}" not found.` };
        }
        // Fetch 30D candles (1H bars = 720 points) + recent trades + current price
        const [candles1H, candles1D, trades, priceInfo] = await Promise.all([
          onchainos.getMarketCandles(chainIndex, tokenAddress, { bar: '1H', limit: 168 }).catch(() => []),
          onchainos.getMarketCandles(chainIndex, tokenAddress, { bar: '1D', limit: 30 }).catch(() => []),
          onchainos.getMarketTrades(chainIndex, tokenAddress, { limit: 20 }).catch(() => []),
          onchainos.getTokenPriceInfo([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => [])
        ]);
        const info = priceInfo && priceInfo.length > 0 ? priceInfo[0] : {};
        const price = Number(info.price || 0);
        const change24h = Number(info.priceChange24H || 0);
        const volume24h = Number(info.volume24H || 0);
        const marketCap = Number(info.marketCap || 0);
        // Compute technical indicators from 1H candles
        const closes1H = _extractCandelCloses(candles1H);
        const closes1D = _extractCandelCloses(candles1D);
        const rsi14 = _calculateRSI(closes1H, 14);
        const ma7 = _calculateMA(closes1D, 7);
        const ma25 = _calculateMA(closes1D, 25);
        const sparkline = _buildSparkline(candles1D);
        // Whale trade detection
        let whaleBuys = 0, whaleSells = 0, whaleCount = 0;
        if (trades && Array.isArray(trades)) {
          trades.forEach(tr => {
            const val = Number(tr.tradeValue || tr.amount || 0);
            const side = tr.side || tr.type || '';
            if (val > 1000) {
              whaleCount++;
              if (side === 'buy' || side === '1') whaleBuys++; else whaleSells++;
            }
          });
        }
        // RSI interpretation
        let rsiLabel = t(lang, 'ai_neutral');
        let rsiEmoji = '⚪';
        if (rsi14 !== null) {
          if (rsi14 > 70) { rsiLabel = t(lang, 'ai_overbought'); rsiEmoji = '🔴'; }
          else if (rsi14 < 30) { rsiLabel = t(lang, 'ai_oversold'); rsiEmoji = '🟢'; }
          else if (rsi14 < 45) { rsiLabel = t(lang, 'ai_accumulation'); rsiEmoji = '🟡'; }
        }
        // MA cross signal
        let maSignal = '—';
        if (ma7 !== null && ma25 !== null) {
          maSignal = ma7 > ma25 ? '📈 Golden Cross (MA7 > MA25)' : '📉 Death Cross (MA7 < MA25)';
        }
        // Build analysis card
        const priceStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(4) : price.toFixed(2);
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
        let card = `📊 <b>${t(lang, 'ai_analysis_title')}: ${upper}</b> (${fullName})\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        card += `💵 $${priceStr}  ${change24h >= 0 ? '📈' : '📉'} ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%\n`;
        if (volume24h > 0) card += `📈 Vol 24h: $${volume24h > 1e6 ? (volume24h / 1e6).toFixed(2) + 'M' : volume24h.toFixed(0)}\n`;
        if (marketCap > 0) card += `📊 MCap: $${marketCap > 1e9 ? (marketCap / 1e9).toFixed(2) + 'B' : (marketCap / 1e6).toFixed(2) + 'M'}\n`;
        if (sparkline) card += `📉 30D: <code>${sparkline}</code>\n`;
        card += `\n<b>📐 ${t(lang, 'ai_rsi_label')}:</b> ${rsi14 !== null ? rsi14.toFixed(1) : '—'} ${rsiEmoji} ${rsiLabel}\n`;
        card += `<b>📏 MA-7:</b> $${ma7 !== null ? ma7.toFixed(ma7 < 1 ? 8 : 2) : '—'}\n`;
        card += `<b>📏 MA-25:</b> $${ma25 !== null ? ma25.toFixed(ma25 < 1 ? 8 : 2) : '—'}\n`;
        card += `<b>🔀 Signal:</b> ${maSignal}\n`;
        if (whaleCount > 0) {
          card += `\n🐋 ${t(lang, 'ai_whale_trades')}: ${whaleCount} (Buy: ${whaleBuys}, Sell: ${whaleSells})\n`;
        }
        card += `\n🔗 ${chainNames[chainIndex] || chainIndex}\n`;
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
        });
        // Return structured data for AI to provide verdict
        return {
          success: true,
          action: 'analysis_displayed',
          analysis: {
            symbol: upper, price, change24h, volume24h, marketCap,
            rsi14: rsi14 !== null ? Number(rsi14.toFixed(1)) : null,
            ma7: ma7 !== null ? Number(ma7.toFixed(8)) : null,
            ma25: ma25 !== null ? Number(ma25.toFixed(8)) : null,
            maSignal: ma7 && ma25 ? (ma7 > ma25 ? 'bullish' : 'bearish') : 'unknown',
            rsiSignal: rsi14 > 70 ? 'overbought' : rsi14 < 30 ? 'oversold' : rsi14 < 45 ? 'accumulation' : 'neutral',
            whaleBuys, whaleSells, whaleCount
          },
          displayMessage: `Analysis for ${upper}: RSI=${rsi14?.toFixed(1)}, MA7/25 ${ma7 > ma25 ? 'bullish' : 'bearish'}, ${whaleCount} whale trades. Please provide your AI analysis based on this data.`
        };
      } catch (error) {
        return { success: false, error: `Failed to analyze: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // Feature 2: P2E Reward Points
    // ────────────────────────────────────────────────────────────
    check_reward_points: async ({ }, context) => {
      try {
        const { dbGet, dbRun } = require('../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        // Ensure row exists
        await dbRun('INSERT OR IGNORE INTO user_game_rewards (userId) VALUES (?)', [userId]);
        const row = await dbGet('SELECT * FROM user_game_rewards WHERE userId = ?', [userId]);
        const points = row?.points || 0;
        const redeemed = row?.totalRedeemed || 0;
        const banmaoValue = (points / 100).toFixed(2);
        return { success: true, displayMessage: `${t(lang, 'ai_reward_points')}\n━━━━━━━━━━━━━━━━━━\n⭐ ${points} ${t(lang, 'ai_points_label')}\n💰 ≈ ${banmaoValue} $BANMAO\n📊 ${t(lang, 'ai_total_redeemed')}: $${redeemed.toFixed(2)}\n\n💡 ${t(lang, 'ai_redeem_hint')}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    redeem_rewards: async ({ points }, context) => {
      try {
        const { dbGet, dbRun } = require('../../db/core');
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        if (!points || points < 100) return { success: false, error: t(lang, 'ai_reward_insufficient') + ' (min 100)' };
        // Check balance
        await dbRun('INSERT OR IGNORE INTO user_game_rewards (userId) VALUES (?)', [userId]);
        const row = await dbGet('SELECT * FROM user_game_rewards WHERE userId = ?', [userId]);
        if ((row?.points || 0) < points) return { success: false, error: t(lang, 'ai_reward_insufficient') };
        // Check user wallet
        const user = await dbGet('SELECT wallets FROM users WHERE chatId = ?', [String(msg.chat.id)]);
        const wallets = user?.wallets ? JSON.parse(user.wallets) : [];
        if (!wallets.length) return { success: false, error: t(lang, 'ai_swap_need_wallet') };
        const userWallet = wallets[0].startsWith('XKO') ? '0x' + wallets[0].slice(3) : wallets[0];
        // Check bot wallet
        const botKey = process.env.BOT_REWARD_PRIVATE_KEY;
        if (!botKey || botKey === '123') return { success: false, error: t(lang, 'ai_swap_no_wallet_key') + '. Set BOT_REWARD_PRIVATE_KEY in .env' };
        const banmaoAmount = points / 100;
        // Deduct points first
        await dbRun('UPDATE user_game_rewards SET points = points - ?, totalRedeemed = totalRedeemed + ? WHERE userId = ?', [points, banmaoAmount, userId]);
        // Try to execute on-chain transfer
        try {
          const ethers = require('ethers');
          const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
          const botWallet = new ethers.Wallet(botKey, provider);
          const banmaoContract = process.env.CONTRACT_ADDRESS || '0x9bA84834c10d07372e33D4C105F08C984b03a5e0';
          const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
          const contract = new ethers.Contract(banmaoContract, erc20Abi, botWallet);
          const tx = await contract.transfer(userWallet, ethers.parseEther(String(banmaoAmount)));
          const receipt = await tx.wait();
          const explorerLink = `https://www.okx.com/web3/explorer/xlayer/tx/${receipt.hash}`;
          await bot.sendMessage(msg.chat.id, `🎉 <b>${t(lang, 'ai_reward_redeemed')}</b>\n\n💰 ${banmaoAmount} $BANMAO → <code>${userWallet.slice(0, 6)}...${userWallet.slice(-4)}</code>\n🔗 <a href="${explorerLink}">TX</a>`, {
            parse_mode: 'HTML', reply_to_message_id: msg.message_id, disable_web_page_preview: true
          });
          return { success: true, action: 'reward_sent', displayMessage: `Sent ${banmaoAmount} $BANMAO to ${userWallet.slice(0, 8)}...` };
        } catch (txErr) {
          // Refund points if transfer fails
          await dbRun('UPDATE user_game_rewards SET points = points + ?, totalRedeemed = totalRedeemed - ? WHERE userId = ?', [points, banmaoAmount, userId]);
          return { success: false, error: `Transfer failed: ${txErr.message}. Points refunded.` };
        }
      } catch (error) { return { success: false, error: error.message }; }
    },
    // ────────────────────────────────────────────────────────────
    // Trading Wallet Management (AI-triggered)
    // ────────────────────────────────────────────────────────────
    manage_trading_wallet: async ({ action, walletId, walletName, tags, privateKeys }, context) => {
      try {
        const { msg, bot } = context;
        let lang;
        try {
          const { getLang: _getLangAsync } = require('../app/language');
          lang = await _getLangAsync(msg);
        } catch (_e) {
          lang = getLang(msg.chat.id);
        }
        const userId = String(msg.from?.id || msg.chat.id);
        const { dbGet, dbRun, dbAll } = require('../../db/core');

        // ── Inline i18n for wallet management ──
        const _walletI18n = {
          wallet_prefix: { vi: 'Ví', en: 'Wallet', zh: '钱包', ko: '지갑', ru: 'Кошелёк', id: 'Dompet' },
          default_label: { vi: '⭐ Ví mặc định', en: '⭐ Default wallet', zh: '⭐ 默认钱包', ko: '⭐ 기본 지갑', ru: '⭐ Кошелёк по умолчанию', id: '⭐ Dompet utama' },
          which_delete: { vi: '❓ Chọn ví để xóa:', en: '❓ Which wallet to delete?', zh: '❓ 选择要删除的钱包:', ko: '❓ 삭제할 지갑 선택:', ru: '❓ Какой кошелёк удалить?', id: '❓ Pilih dompet untuk dihapus:' },
          which_default: { vi: '❓ Chọn ví đặt mặc định:', en: '❓ Which wallet to set as default?', zh: '❓ 选择默认钱包:', ko: '❓ 기본으로 설정할 지갑:', ru: '❓ Какой сделать по умолчанию?', id: '❓ Pilih dompet utama:' },
          specify_id: { vi: 'Vui lòng nhập ID ví.', en: 'Please specify the wallet ID.', zh: '请输入钱包 ID。', ko: '지갑 ID를 입력하세요.', ru: 'Укажите ID кошелька.', id: 'Masukkan ID dompet.' },
          not_found: { vi: '❌ Không tìm thấy ví ID', en: '❌ Wallet ID not found:', zh: '❌ 未找到钱包 ID:', ko: '❌ 지갑 ID를 찾을 수 없습니다:', ru: '❌ Кошелёк не найден:', id: '❌ ID Dompet tidak ditemukan:' },
          deleted: { vi: '✅ Đã xóa ví', en: '✅ Deleted wallet', zh: '✅ 已删除钱包', ko: '✅ 지갑 삭제됨', ru: '✅ Кошелёк удалён', id: '✅ Dompet dihapus' },
          now_default: { vi: 'đã được đặt làm ví mặc định.', en: 'is now the default wallet.', zh: '已设为默认钱包。', ko: '기본 지갑으로 설정되었습니다.', ru: 'теперь кошелёк по умолчанию.', id: 'sekarang menjadi dompet utama.' },
          renamed: { vi: '✅ Đã đổi tên ví thành', en: '✅ Wallet renamed to', zh: '✅ 钱包已重命名为', ko: '✅ 지갑 이름 변경:', ru: '✅ Кошелёк переименован в', id: '✅ Dompet diubah namanya menjadi' },
          tagged: { vi: '🏷 Đã gắn tag ví:', en: '🏷 Wallet tagged:', zh: '🏷 钱包已标记:', ko: '🏷 지갑 태그:', ru: '🏷 Кошелёк помечен:', id: '🏷 Tag dompet:' },
          need_id_name: { vi: '❌ Vui lòng cung cấp walletId và tên mới.', en: '❌ Please provide walletId and new name.', zh: '❌ 请提供钱包ID和新名称。', ko: '❌ walletId와 새 이름을 입력하세요.', ru: '❌ Укажите walletId и новое имя.', id: '❌ Masukkan walletId dan nama baru.' },
          need_id_tags: { vi: '❌ Vui lòng cung cấp walletId và tags.', en: '❌ Please provide walletId and tags.', zh: '❌ 请提供钱包ID和标签。', ko: '❌ walletId와 태그를 입력하세요.', ru: '❌ Укажите walletId и теги.', id: '❌ Masukkan walletId dan tag.' },
          unnamed: { vi: 'Chưa đặt tên', en: 'Unnamed', zh: '未命名', ko: '이름 없음', ru: 'Без имени', id: 'Tanpa nama' },
          current: { vi: 'hiện tại', en: 'current', zh: '当前', ko: '현재', ru: 'текущий', id: 'saat ini' },
          imported_prefix: { vi: 'Nhập', en: 'Imported', zh: '导入', ko: '가져옴', ru: 'Импорт', id: 'Impor' },
          already_exists: { vi: 'đã tồn tại', en: 'already exists', zh: '已存在', ko: '이미 존재', ru: 'уже существует', id: 'sudah ada' },
          imported_as: { vi: 'nhập thành', en: 'imported as', zh: '导入为', ko: '가져옴:', ru: 'импортирован как', id: 'diimpor sebagai' },
          invalid_key: { vi: '❌ Key không hợp lệ:', en: '❌ Invalid key:', zh: '❌ 无效密钥:', ko: '❌ 잘못된 키:', ru: '❌ Невалидный ключ:', id: '❌ Kunci tidak valid:' },
          import_results: { vi: '🔑 Kết quả nhập:', en: '🔑 Import Results:', zh: '🔑 导入结果:', ko: '🔑 가져오기 결과:', ru: '🔑 Результаты импорта:', id: '🔑 Hasil impor:' },
        };
        const wT = (key) => (_walletI18n[key] || {})[lang] || (_walletI18n[key] || {}).en || key;

        // Helper: encrypt a private key
        const encryptKey = (privateKey) => {
          const ENCRYPT_KEY = (process.env.WALLET_ENCRYPT_SECRET || process.env.TELEGRAM_TOKEN || '').slice(0, 32).padEnd(32, '0');
          const crypto = require('crypto');
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
          let encrypted = cipher.update(privateKey, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          return iv.toString('hex') + ':' + encrypted;
        };

        if (action === 'create') {
          // ── MULTI-WALLET CREATE ──
          const existingWallets = await dbAll('SELECT id, walletName FROM user_trading_wallets WHERE userId = ?', [userId]);
          const walletCount = existingWallets.length;
          const autoName = walletName || `${wT('wallet_prefix')} #${walletCount + 1}`;
          const isFirst = walletCount === 0;

          const ethers = require('ethers');
          const newWallet = ethers.Wallet.createRandom();
          const encryptedKey = encryptKey(newWallet.privateKey);

          await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, autoName, newWallet.address, encryptedKey, '196', isFirst ? 1 : 0, Math.floor(Date.now() / 1000)]);

          // Auto-register as watch wallet
          try {
            const dbModule = require('../../db.js');
            await dbModule.addWalletToUser(userId, lang, newWallet.address, { name: autoName });
          } catch (err) {
            log.child('TW').error('Failed to auto-register watch wallet:', err.message);
          }

          let card = `${t(lang, 'tw_created')}\n━━━━━━━━━━━━━━━━━━\n`;
          card += `> 👛 ${autoName}\n`;
          card += `> ${t(lang, 'ai_wallet_address')}: <code>${newWallet.address}</code>\n`;
          if (isFirst) card += `> ${wT('default_label')}\n`;
          card += `> #${walletCount + 1}\n\n`;
          card += `${t(lang, 'tw_backup_warning').replace(/<[^>]+>/g, '')}`;
          await bot.sendMessage(msg.chat.id, card, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
          log.child('TW').info(`✔ Created wallet #${walletCount + 1} for user ${userId}: ${newWallet.address.slice(0, 8)}... (name: ${autoName})`);

          // Auto-trigger wallet manager
          try {
            const { buildWalletManagerMenu } = require('./walletUi')({ t, db: require('../../db.js') });
            const menuData = await buildWalletManagerMenu(lang, msg.chat.id);
            await bot.sendMessage(msg.chat.id, `👛 ${t(lang, 'wallet_manager_title') || t(lang, 'wh_title')}\n\n${menuData.text}`, {
              parse_mode: 'HTML', reply_markup: menuData.replyMarkup, disable_web_page_preview: true
            });
          } catch (err) { log.child('TW').error('Failed to auto-trigger /mywallet:', err.message); }

          return { success: true, action: 'create_wallet', walletAddress: newWallet.address, walletName: autoName, walletNumber: walletCount + 1 };

        } else if (action === 'delete') {
          // ── SAFE DELETE by walletId ──
          if (!walletId) {
            const wallets = await dbAll('SELECT id, walletName, address, isDefault FROM user_trading_wallets WHERE userId = ?', [userId]);
            if (wallets.length === 0) return { success: true, displayMessage: t(lang, 'tw_none') };
            let list = `${wT('which_delete')}\n━━━━━━━━━━━━━━━━━━\n`;
            for (const w of wallets) {
              list += `🆔 ID: ${w.id} | ${w.walletName || wT('unnamed')} | ${w.address.slice(0, 6)}...${w.address.slice(-4)}${w.isDefault ? ' ⭐' : ''}\n`;
            }
            list += `\n${wT('specify_id')}`;
            return { success: true, displayMessage: list, needWalletId: true };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          if (target.isDefault) {
            const other = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND id != ?', [userId, walletId]);
            if (other) await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ?', [other.id]);
          }
          await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          return { success: true, displayMessage: `${wT('deleted')} ${target.walletName || target.address.slice(0, 8) + '...'} (ID: ${walletId})` };

        } else if (action === 'set_default') {
          // ── SET DEFAULT ──
          if (!walletId) {
            const wallets = await dbAll('SELECT id, walletName, address, isDefault FROM user_trading_wallets WHERE userId = ?', [userId]);
            if (wallets.length === 0) return { success: true, displayMessage: t(lang, 'tw_none') };
            let list = `${wT('which_default')}\n━━━━━━━━━━━━━━━━━━\n`;
            for (const w of wallets) {
              list += `🆔 ID: ${w.id} | ${w.walletName || wT('unnamed')} | ${w.address.slice(0, 6)}...${w.address.slice(-4)}${w.isDefault ? ` ⭐ (${wT('current')})` : ''}\n`;
            }
            return { success: true, displayMessage: list, needWalletId: true };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE userId = ?', [userId]);
          await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ? AND userId = ?', [walletId, userId]);
          return { success: true, displayMessage: `⭐ ${target.walletName || target.address.slice(0, 8) + '...'} ${wT('now_default')}` };

        } else if (action === 'rename') {
          // ── RENAME ──
          if (!walletId || !walletName) {
            return { success: false, displayMessage: wT('need_id_name') };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          const safeName = walletName.slice(0, 20);
          await dbRun('UPDATE user_trading_wallets SET walletName = ? WHERE id = ? AND userId = ?', [safeName, walletId, userId]);
          return { success: true, displayMessage: `${wT('renamed')} "${safeName}"` };

        } else if (action === 'tag') {
          // ── TAG ──
          if (!walletId || !tags) {
            return { success: false, displayMessage: wT('need_id_tags') };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          const safeTags = tags.split(',').map(tg => tg.trim().toLowerCase()).filter(Boolean).join(',');
          await dbRun('UPDATE user_trading_wallets SET tags = ? WHERE id = ? AND userId = ?', [safeTags, walletId, userId]);
          return { success: true, displayMessage: `${wT('tagged')} ${safeTags}` };

        } else if (action === 'import') {
          // ── IMPORT via privateKeys arg ──
          if (privateKeys && privateKeys.trim()) {
            const ethers = require('ethers');
            const keys = privateKeys.trim().split(/[\s,]+/).filter(Boolean);
            const results = [];
            for (const pk of keys) {
              try {
                const w = new ethers.Wallet(pk);
                const dup = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND address = ?', [userId, w.address]);
                if (dup) { results.push(`⚠️ ${w.address.slice(0, 8)}... ${wT('already_exists')}`); continue; }
                const existCount = (await dbAll('SELECT id FROM user_trading_wallets WHERE userId = ?', [userId])).length;
                const encryptedKey = encryptKey(pk);
                const isFirst = existCount === 0;
                const name = `${wT('imported_prefix')} #${existCount + 1}`;
                await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [userId, name, w.address, encryptedKey, '196', isFirst ? 1 : 0, Math.floor(Date.now() / 1000)]);
                results.push(`✅ ${w.address.slice(0, 8)}...${w.address.slice(-4)} ${wT('imported_as')} "${name}"`);
              } catch (e) {
                results.push(`${wT('invalid_key')} ${pk.slice(0, 6)}...`);
              }
            }
            try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) { }
            await bot.sendMessage(msg.chat.id, `${wT('import_results')}\n━━━━━━━━━━━━━━━━━━\n${results.join('\n')}`, { parse_mode: 'HTML' });
            return { success: true, action: 'import_keys', imported: results.length };
          }
          // No keys provided — show hint
          await bot.sendMessage(msg.chat.id, t(lang, 'ai_import_wallet_hint'), { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
          return { success: true, action: 'import_hint' };

        } else if (action === 'export') {
          if (msg.chat.type !== 'private') {
            return { success: true, displayMessage: t(lang, 'ai_dm_only').replace(/<[^>]+>/g, '') };
          }
          // Export specific wallet or default
          let tw;
          if (walletId) {
            tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          } else {
            tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
            if (!tw) tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ?', [userId]);
          }
          if (!tw) { return { success: true, displayMessage: t(lang, 'tw_none') }; }
          const key = global._decryptTradingKey(tw.encryptedKey);
          const keyMsg = await bot.sendMessage(msg.chat.id, `${t(lang, 'tw_export_dm')}\n\n👛 ${tw.walletName || tw.address.slice(0, 8) + '...'}\n<code>${key}</code>\n\n⚠️ Auto-delete 30s`, { parse_mode: 'HTML' });
          setTimeout(() => { bot.deleteMessage(msg.chat.id, keyMsg.message_id).catch(() => { }); }, 30000);
          return { success: true, action: 'export_key' };

        } else if (action === 'balance' || action === 'menu') {
          await _sendTradingWalletMenu(bot, msg.chat.id, null, lang, userId, t);
          return { success: true, action: 'trading_menu_shown' };
        }

        // Default: show menu
        await _sendTradingWalletMenu(bot, msg.chat.id, null, lang, userId, t);
        return { success: true, action: 'trading_menu_shown' };
      } catch (error) { return { success: false, error: error.message }; }
    },
    // ────────────────────────────────────────────────────────────
    // Feature 3: Intent-based Trading (Swap Preview)
    // ────────────────────────────────────────────────────────────
    swap_intent: async ({ from_token, to_token, amount, chain }, context) => {
      try {
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        const lang = getLang(msg.chat.id);
        const chainIndex = chain || '196';
        // Resolve token addresses
        const TOKEN_MAP = {
          'OKB': { addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18 },
          'USDT': { addr: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', decimals: 6 },
          'USDC': { addr: '0x74b7f16337b8972027f6196a17a631ac6de26d22', decimals: 6 },
          'BANMAO': { addr: '0x9bA84834c10d07372e33D4C105F08C984b03a5e0', decimals: 18 },
          'ETH': { addr: '0x5a77f1443d16ee5761d310cf8e1133b13e41d25e', decimals: 18 },
          'WBTC': { addr: '0xea034fb02eb1808c2cc3adbc15f447b93cbe08a6', decimals: 8 }
        };
        const fromUpper = from_token.toUpperCase();
        const toUpper = to_token.toUpperCase();
        const fromInfo = TOKEN_MAP[fromUpper];
        const toInfo = TOKEN_MAP[toUpper];
        if (!fromInfo || !toInfo) {
          return { success: false, error: `${t(lang, 'ai_swap_token_not_supported')} ${t(lang, 'ai_swap_available')}: ${Object.keys(TOKEN_MAP).join(', ')}` };
        }
        // Calculate amount in minimal units
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) return { success: false, error: t(lang, 'ai_invalid_amount') };
        const minUnits = BigInt(Math.floor(amountNum * (10 ** fromInfo.decimals))).toString();
        // Get swap quote
        const quoteRaw = await onchainos.getSwapQuote({
          chainIndex, fromTokenAddress: fromInfo.addr, toTokenAddress: toInfo.addr, amount: minUnits
        }).catch(() => null);
        const quote = Array.isArray(quoteRaw) ? quoteRaw[0] : quoteRaw;
        if (!quote || !quote.toTokenAmount) {
          // No DEX pool — show helpful fallback with OKX DEX link
          const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
          const dexLink = `https://www.okx.com/web3/dex-swap#inputChain=${chainIndex}&inputCurrency=${fromInfo.addr}&outputChain=${chainIndex}&outputCurrency=${toInfo.addr}`;
          let fallback = `⚡ <b>${t(lang, 'ai_swap_preview')}</b>\n━━━━━━━━━━━━━━━━━━\n`;
          fallback += `📤 ${amount} <b>${fromUpper}</b> → <b>${toUpper}</b>\n`;
          fallback += `🔗 ${chainNames[chainIndex] || 'X Layer'}\n\n`;
          fallback += `⚠️ ${t(lang, 'ai_swap_no_pool')}\n`;
          fallback += `🌐 <a href="${dexLink}">OKX DEX</a>\n\n`;
          fallback += `💡 ${t(lang, 'ai_swap_or_try')}: OKB↔USDT, OKB↔ETH`;
          await bot.sendMessage(msg.chat.id, fallback, {
            parse_mode: 'HTML', reply_to_message_id: msg.message_id,
            message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: false
          });
          return { success: true, action: 'swap_no_pool', displayMessage: `No DEX pool for ${fromUpper}→${toUpper}. Showed OKX DEX link.` };
        }
        const toAmount = Number(quote.toTokenAmount || 0) / (10 ** toInfo.decimals);
        const toAmountStr = toAmount < 0.001 ? toAmount.toFixed(8) : toAmount < 1 ? toAmount.toFixed(4) : toAmount.toFixed(4);
        const estimatedGas = quote.estimateGasFee || 'N/A';
        const dexName = quote.dexRouterList?.[0]?.dexProtocol?.dexName || '';
        // Build preview card
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
        let card = `⚡ <b>${t(lang, 'ai_swap_preview')}</b>\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        card += `📤 ${amount} <b>${fromUpper}</b>\n`;
        card += `📥 ≈ ${toAmountStr} <b>${toUpper}</b>\n`;
        card += `⛽ Gas: ${estimatedGas}\n`;
        if (dexName) card += `🏦 DEX: ${dexName}\n`;
        if (quote.priceImpactPercent) card += `📊 Impact: ${quote.priceImpactPercent}%\n`;
        card += `🔗 ${chainNames[chainIndex] || 'X Layer'}\n`;
        // Check if user has trading wallet
        const { dbGet: dbGetCheck } = require('../../db/core');
        const userId = String(msg.from?.id || msg.chat.id);
        const hasTW = await dbGetCheck('SELECT 1 FROM user_trading_wallets WHERE userId = ?', [userId]);
        const buttons = [];
        if (hasTW) {
          // Confirm button with swap data encoded
          const cbData = `swpc|${chainIndex}|${fromInfo.addr}|${toInfo.addr}|${minUnits}|${fromInfo.decimals}|${toInfo.decimals}|${fromUpper}|${toUpper}`;
          buttons.push([{ text: t(lang, 'ai_swap_confirm'), callback_data: cbData }]);
          buttons.push([{ text: t(lang, 'ai_swap_cancel'), callback_data: 'swpc|cancel' }]);
        } else {
          card += `\n⚠️ <i>${t(lang, 'ai_no_trading_wallet')}</i>`;
        }
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true,
          reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined
        });
        return {
          success: true,
          action: 'swap_preview',
          quote: { from: fromUpper, to: toUpper, fromAmount: amount, toAmount: toAmountStr, chain: chainIndex },
          displayMessage: `Swap preview: ${amount} ${fromUpper} → ${toAmountStr} ${toUpper} on ${chainNames[chainIndex] || 'X Layer'}.`
        };
      } catch (error) { return { success: false, error: `Swap failed: ${error.message}` }; }
    },
    // ────────────────────────────────────────────────────────────
    // Phase 2: Price Alerts
    // ────────────────────────────────────────────────────────────
    set_price_alert: async ({ symbol, target_price, direction = 'above' }, context) => {
      try {
        const { dbRun, dbAll } = require('../../db/core');
        const onchainos = require('../services/onchainos');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        // Check limit
        const existing = await dbAll('SELECT id FROM user_price_alerts WHERE userId = ? AND active = 1', [userId]);
        if (existing.length >= 5) return { success: false, error: t(lang, 'ai_alert_set') + ' Max 5 alerts.' };
        // Resolve token
        const KNOWN = { 'BTC': '1', 'ETH': '1', 'USDT': '1', 'BNB': '56', 'SOL': '501', 'OKB': '196' };
        let chainIndex = KNOWN[symbol.toUpperCase()] || null;
        let tokenAddress = null;
        if (!chainIndex) {
          const sr = await onchainos.getTokenSearch('196,1,56,501', symbol).catch(() => []);
          if (sr && sr.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; }
        }
        const dir = direction === 'below' ? 'below' : 'above';
        await dbRun('INSERT INTO user_price_alerts (userId, chatId, symbol, chainIndex, tokenAddress, targetPrice, direction) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, String(msg.chat.id), symbol.toUpperCase(), chainIndex, tokenAddress, target_price, dir]);
        const dirStr = t(lang, dir === 'above' ? 'ai_alert_above' : 'ai_alert_below');
        return { success: true, displayMessage: `${t(lang, 'ai_alert_set')} ${symbol.toUpperCase()} ${dirStr} $${target_price}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    list_price_alerts: async ({ }, context) => {
      try {
        const { dbAll } = require('../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        const alerts = await dbAll('SELECT * FROM user_price_alerts WHERE userId = ? AND active = 1 ORDER BY createdAt DESC', [userId]);
        if (!alerts.length) return { success: true, displayMessage: `📭 ${t(lang, 'ai_no_active_alerts')}` };
        let text = `🔔 <b>${t(lang, 'ai_price_alerts_title')} (${alerts.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
        alerts.forEach(a => {
          const dirStr = t(lang, a.direction === 'above' ? 'ai_alert_above' : 'ai_alert_below');
          text += `#${a.id} · <b>${a.symbol}</b> ${dirStr} $${a.targetPrice}\n`;
        });
        return { success: true, displayMessage: text };
      } catch (error) { return { success: false, error: error.message }; }
    },
    delete_price_alert: async ({ alert_id }, context) => {
      try {
        const { dbRun, dbGet } = require('../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        const alert = await dbGet('SELECT * FROM user_price_alerts WHERE id = ? AND userId = ?', [alert_id, userId]);
        if (!alert) return { success: false, error: `${t(lang, 'ai_alert_not_found')} #${alert_id}` };
        await dbRun('UPDATE user_price_alerts SET active = 0 WHERE id = ?', [alert_id]);
        return { success: true, displayMessage: `✅ ${t(lang, 'ai_deleted_alert')} #${alert_id} (${alert.symbol} ${t(lang, alert.direction === 'above' ? 'ai_alert_above' : 'ai_alert_below')} $${alert.targetPrice})` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    // ────────────────────────────────────────────────────────────
    // Phase 2: Favorite Tokens
    // ────────────────────────────────────────────────────────────
    add_favorite_token: async ({ symbol }, context) => {
      try {
        const { dbRun, dbAll } = require('../../db/core');
        const onchainos = require('../services/onchainos');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        // Check limit
        const existing = await dbAll('SELECT id FROM user_favorite_tokens WHERE userId = ?', [userId]);
        if (existing.length >= 10) return { success: false, error: 'Max 10 favorites.' };
        // Resolve token
        const KNOWN = { 'BTC': { ci: '1', addr: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', fn: 'Bitcoin' }, 'ETH': { ci: '1', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'Ethereum' }, 'OKB': { ci: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'OKB' }, 'BNB': { ci: '56', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'BNB' } };
        const upper = symbol.toUpperCase();
        let chainIndex, tokenAddress, fullName;
        if (KNOWN[upper]) { chainIndex = KNOWN[upper].ci; tokenAddress = KNOWN[upper].addr; fullName = KNOWN[upper].fn; }
        else {
          const sr = await onchainos.getTokenSearch('196,1,56,501', symbol).catch(() => []);
          if (sr && sr.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; fullName = sr[0].tokenFullName || upper; }
          else return { success: false, error: `Token "${symbol}" not found.` };
        }
        await dbRun('INSERT OR REPLACE INTO user_favorite_tokens (userId, symbol, chainIndex, tokenAddress, fullName) VALUES (?, ?, ?, ?, ?)',
          [userId, upper, chainIndex, tokenAddress, fullName]);
        return { success: true, displayMessage: `⭐ ${t(lang, 'ai_add_favorite')}: ${upper}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    remove_favorite_token: async ({ symbol }, context) => {
      try {
        const { dbRun } = require('../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        await dbRun('DELETE FROM user_favorite_tokens WHERE userId = ? AND symbol = ?', [userId, symbol.toUpperCase()]);
        return { success: true, displayMessage: `${t(lang, 'ai_remove_favorite')}: ${symbol.toUpperCase()}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    check_favorite_prices: async ({ }, context) => {
      try {
        const { dbAll } = require('../../db/core');
        const onchainos = require('../services/onchainos');
        const { msg, bot } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        const favorites = await dbAll('SELECT * FROM user_favorite_tokens WHERE userId = ? ORDER BY addedAt', [userId]);
        if (!favorites.length) return { success: true, displayMessage: `📭 ${t(lang, 'ai_favorites_empty')}` };
        // Batch price fetch
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
        const priceTokens = favorites.map(f => ({ chainIndex: f.chainIndex, tokenContractAddress: f.tokenAddress }));
        const prices = await onchainos.getTokenPriceInfo(priceTokens).catch(() => []);
        let card = `⭐ <b>${t(lang, 'ai_favorites_title')} (${favorites.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
        favorites.forEach((f, i) => {
          const pi = prices && prices[i] ? prices[i] : {};
          const price = Number(pi.price || 0);
          const change = Number(pi.priceChange24H || 0);
          const priceStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(4) : price.toFixed(2);
          const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
          const icon = change >= 0 ? '📈' : '📉';
          card += `${i + 1}. <b>${f.symbol}</b> · $${priceStr} ${icon} ${changeStr} · ${chainNames[f.chainIndex] || f.chainIndex}\n`;
        });
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
        });
        return { success: true, action: 'favorites_displayed', displayMessage: `Showed ${favorites.length} favorite token prices.` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    show_help: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/help',
            entities: [{ type: 'bot_command', offset: 0, length: 5 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_help',
          message: 'Opening help menu...'
        };
      } catch (error) {
        return { success: false, error: `Failed to show help: ${error.message}` };
      }
    },
    show_donate: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/donate',
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_donate',
          message: 'Showing donation info...'
        };
      } catch (error) {
        return { success: false, error: `Failed to show donate: ${error.message}` };
      }
    },
    register_wallet: async ({ address }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = address ? `/register ${address}` : '/register';
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'register_wallet',
          message: 'Opening wallet registration...'
        };
      } catch (error) {
        return { success: false, error: `Failed to register wallet: ${error.message}` };
      }
    },
    show_random_menu: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/random',
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_random_menu',
          message: 'Opening games menu...'
        };
      } catch (error) {
        return { success: false, error: `Failed to show random menu: ${error.message}` };
      }
    },
    show_telegram_id: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/dataTelegram',
            entities: [{ type: 'bot_command', offset: 0, length: 13 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_telegram_id',
          message: 'Getting Telegram ID...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get telegram ID: ${error.message}` };
      }
    },
    set_persona: async ({ persona_id, persona_prompt }, context) => {
      try {
        const { msg, bot } = context;
        const userId = msg.from?.id?.toString();
        const lang = await getLang(msg);
        // If no persona_id provided, show persona selection menu
        if (!persona_id) {
          const currentPersonaId = await getUserPersona(userId);
          const personaList = Object.values(AI_PERSONAS).map((p) => {
            const { name, desc } = getPersonaStrings(lang, p.id);
            const current = currentPersonaId === p.id ? ' ✓' : '';
            return `• ${name}${current}: ${desc}`;
          }).join('\n');
          const menuText = `🎭 ${t(lang, 'ai_persona_title')}\n\n${personaList}\n\n${t(lang, 'ai_persona_hint')}`;
          await sendReply(msg, menuText, { reply_markup: await buildPersonaKeyboard(lang, userId) });
          return {
            success: true,
            action: 'show_persona_menu',
            message: 'Showing persona selection menu'
          };
        }
        // Set the persona
        let success = false;
        let personaName = persona_id;
        if (persona_id === 'custom') {
          const customPrompt = (persona_prompt || '').trim();
          if (customPrompt) {
            const customName = (customPrompt.split('\n')[0] || 'Custom persona').trim().slice(0, 64) || 'Custom persona';
            success = await setUserPersona(userId, 'custom', { customPrompt, customName });
            personaName = customName;
          } else {
            const existing = await getUserCustomPersona(userId);
            if (existing?.prompt) {
              success = await setUserPersona(userId, 'custom');
              personaName = existing.name || 'Custom persona';
            } else {
              await promptCustomPersonaInput(msg, lang);
              return {
                success: true,
                action: 'request_custom_persona',
                message: 'Prompted user for custom persona details'
              };
            }
          }
        } else {
          success = await setUserPersona(userId, persona_id);
          personaName = getPersonaLabel(lang, AI_PERSONAS[persona_id]) || persona_id;
        }
        if (success) {
          await sendReply(msg, t(lang, 'ai_persona_saved', { name: personaName }));
          return {
            success: true,
            action: 'set_persona',
            message: `Persona set to ${personaName}`
          };
        } else {
          return { success: false, error: 'Invalid persona ID' };
        }
      } catch (error) {
        return { success: false, error: `Failed to set persona: ${error.message}` };
      }
    },
    // ========================================================================
    // AI COMMAND FUNCTION IMPLEMENTATIONS
    // ========================================================================
    ask_ai: async ({ question }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/ai ${question}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 3 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'ask_ai',
          message: 'Processing your question...'
        };
      } catch (error) {
        return { success: false, error: `Failed to ask AI: ${error.message}` };
      }
    },
    text_to_speech: async ({ text }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/ai tts ${text}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 3 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'text_to_speech',
          message: 'Converting text to speech...'
        };
      } catch (error) {
        return { success: false, error: `Failed to convert to speech: ${error.message}` };
      }
    },
    manage_ai_api: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/api',
            entities: [{ type: 'bot_command', offset: 0, length: 4 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'manage_ai_api',
          message: 'Opening API management...'
        };
      } catch (error) {
        return { success: false, error: `Failed to open API management: ${error.message}` };
      }
    },
    change_ai_language: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/language',
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'change_ai_language',
          message: 'Opening language settings...'
        };
      } catch (error) {
        return { success: false, error: `Failed to change language: ${error.message}` };
      }
    },
    generate_image: async ({ prompt }, context) => {
      try {
        const { msg, bot } = context;
        // Use "tạo ảnh" keyword to trigger detectImageAction
        const commandText = `/ai tạo ảnh ${prompt}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 3 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'generate_image',
          message: 'Generating image...'
        };
      } catch (error) {
        return { success: false, error: `Failed to generate image: ${error.message}` };
      }
    }
  };
  /**
   * Get available function declarations based on user permissions
   */
  async function getAvailableFunctions(userId, chatId, msg) {
    const userFunctions = [
      getUserInfoDeclaration,
      getMemberCountDeclaration,
      // Bot introduction - all users can ask
      getBotIntroductionDeclaration,
      // Simple gaming functions - all users can play
      playDiceDeclaration,
      playRpsDeclaration,
      generateRandomNumberDeclaration,
      generateLongShortDeclaration,
      randomChoiceDeclaration,
      getFortuneDeclaration,
      createQuizDeclaration,
      // Interactive gaming functions - all users can start
      startMemoryGameDeclaration,
      startMinesweeperDeclaration,
      startTreasureHuntDeclaration,
      startSudokuDeclaration,
      startGomokuDeclaration,
      startChessDeclaration,
      // Xlayer Check functions - wallet, token, transaction, group, checkin
      deleteChatHistoryDeclaration,
      lookupContractDeclaration,
      lookupTransactionDeclaration,
      checkOkxChainsDeclaration,
      checkOkx402StatusDeclaration,
      getGroupInfoDeclaration,
      getCheckinStatsDeclaration,
      // AI command functions - natural language for /ai features
      askAiDeclaration,
      textToSpeechDeclaration,
      manageAiApiDeclaration,
      changeAiLanguageDeclaration,
      generateImageDeclaration,
      // Checkin & Wallet functions
      doCheckinDeclaration,
      getCheckinLeaderboardDeclaration,
      // P2E & Trading
      checkRewardPointsDeclaration,
      redeemRewardsDeclaration,
      // Phase 2: Alerts & Favorites
      setPriceAlertDeclaration,
      listPriceAlertsDeclaration,
      deletePriceAlertDeclaration,
      addFavoriteTokenDeclaration,
      removeFavoriteTokenDeclaration,
      checkFavoritePricesDeclaration,
      // Utility functions
      showHelpDeclaration,
      showDonateDeclaration,
      registerWalletDeclaration,
      showRandomMenuDeclaration,
      showTelegramIdDeclaration,
      setPersonaDeclaration
    ];
    // Merge ONCHAIN_TOOLS declarations (DeFi: charts, candles, market detail, gas, swap)
    const onchainDeclarations = [];
    for (const toolObj of onchainToolArrays) {
      if (toolObj?.functionDeclarations) {
        onchainDeclarations.push(...toolObj.functionDeclarations);
      }
    }
    const adminFunctions = [
      banMemberDeclaration,
      kickMemberDeclaration,
      muteMemberDeclaration,
      unmuteMemberDeclaration,
      warnMemberDeclaration
    ];
    const ownerFunctions = [setCommandLimitDeclaration];

    // Helper to deduplicate function declarations by name
    const deduplicate = (funcs) => {
      const seen = new Set();
      return funcs.filter(f => {
        if (!f || !f.name) return false;
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
      });
    };

    const allSkillTools = (skillRegistry.getAllTools()[0]?.functionDeclarations) || [];

    // Check permissions
    const { isOwner } = require('./accessControl');
    const isOwnerUser = isOwner(userId, msg.from?.username);
    if (isOwnerUser) {
      // Owner has access to all functions + onchain tools
      return deduplicate([...userFunctions, ...adminFunctions, ...ownerFunctions, ...onchainDeclarations, ...allSkillTools]);
    }
    // Check if user is admin in the current chat
    let isAdminUser = false;
    if (chatId) {
      try {
        const member = await bot.getChatMember(chatId, userId);
        isAdminUser = ['creator', 'administrator'].includes(member.status);
      } catch (error) {
        log.child('FnCall').warn(`Failed to check admin status: ${error.message}`);
      }
    }
    if (isAdminUser) {
      return deduplicate([...userFunctions, ...adminFunctions, ...onchainDeclarations, ...allSkillTools]);
    }
    // Regular user only gets user-level functions + onchain tools
    return deduplicate([...userFunctions, ...onchainDeclarations, ...allSkillTools]);
  }
  function hasExplicitHelpIntent(promptText) {
    const normalized = (promptText || '').toLowerCase().trim();
    if (!normalized) {
      return false;
    }
    if (normalized.startsWith('/help') || normalized === 'help') {
      return true;
    }
    return /\b(help menu|show help|trợ giúp|tro giup|hướng dẫn|huong dan|hdsd)\b/.test(normalized);
  }
  function shouldExecuteFunction(functionName, context) {
    const msg = context?.msg || {};
    const userPrompt = (msg.text || msg.caption || '').toString();
    const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
    switch (functionName) {
      case 'generate_image':
        return Boolean(detectImageAction(userPrompt, hasPhoto));
      case 'show_help':
        return hasExplicitHelpIntent(userPrompt);
      default:
        return true;
    }
  }
  /**
   * Execute a function call with permission validation
   */
  async function executeFunctionCall(functionCall, context) {
    let { name, args } = functionCall;

    // Gemini sometimes strips underscores from function names (e.g. manage_trading_wallet → managetradingwallet)
    // Try fuzzy match if exact name not found
    if (!toolFunctionImplementations[name]) {
      const normalizedName = name.replace(/_/g, '').toLowerCase();
      const matchedKey = Object.keys(toolFunctionImplementations).find(
        key => key.replace(/_/g, '').toLowerCase() === normalizedName
      );
      if (matchedKey) {
        name = matchedKey;
        functionCall = { ...functionCall, name: matchedKey };
      }
    }

    if (!toolFunctionImplementations[name]) {

      try {
        const onchainResult = await executeOnchainToolCall(functionCall, context);
        if (onchainResult !== undefined && onchainResult !== null) {
          // Update functionCall.name if onchain handler resolved a mangled name (e.g. getsignallist → get_signal_list)
          if (onchainResult._resolvedName && onchainResult._resolvedName !== functionCall.name) {
            functionCall = { ...functionCall, name: onchainResult._resolvedName };
          }
          if (typeof onchainResult === 'object' && onchainResult.displayMessage) {
            return onchainResult;
          }
          return { success: true, displayMessage: typeof onchainResult === 'string' ? onchainResult : JSON.stringify(onchainResult) };
        }
      } catch (e) { /* not an onchain tool either */ }

      // Try skill engine handlers
      try {
        const skillResult = await skillRegistry.executeToolCall(functionCall, context);
        if (skillResult !== undefined && skillResult !== null && typeof skillResult === 'string' && !skillResult.startsWith('Unknown function:')) {
          return { success: true, displayMessage: skillResult };
        }
        if (skillResult !== undefined && skillResult !== null && typeof skillResult !== 'string') {
          return { success: true, displayMessage: JSON.stringify(skillResult) };
        }
      } catch (e) { /* not a skill tool either */ }

      return {
        success: false,
        error: `Unknown function: ${name}`
      };
    }
    if (!shouldExecuteFunction(name, context)) {
      return {
        success: false,
        error: `Skipped ${name} due to low intent confidence`
      };
    }
    try {
      const result = await toolFunctionImplementations[name](args, context);
      return result;
    } catch (error) {
      log.child('FnCall').error(`Function ${name} failed:`, error);
      return {
        success: false,
        error: `Function execution failed: ${error.message}`
      };
    }
  }
  /**
   * Core AIB request processing logic - can be called from /aib command or auto-detection
   */
  async function processAibRequest(msg, userPrompt) {
    let lang = await getLang(msg);
    try {
      lang = require('../features/ai/onchain/helpers').detectPromptLanguage(userPrompt, lang);
    } catch (e) { }
    const userId = msg.from?.id?.toString();
    const chatId = msg.chat?.id?.toString();


    // Require prompt
    if (!userPrompt || !userPrompt.trim()) {
      await sendReply(msg, t(lang, 'ai_aib_usage') || '⚡ `/aib [your request]`\n\nUse AI to control bot functions through natural language.\nExample: `/aib count members in this group`', {
        parse_mode: 'Markdown'
      });
      return;
    }

    // Check for personal Google API key or fall back to server key
    const userApiKeys = userId ? await db.listUserAiKeys(userId) : [];
    let googleUserKeys = userApiKeys
      .filter((entry) => normalizeAiProvider(entry.provider) === 'google')
      .map((entry) => entry.apiKey)
      .filter(Boolean);
    let usingServerKey = false;
    if (!googleUserKeys.length) {
      // Fall back to server API key from environment
      const serverKey = process.env.GEMINI_API_KEY;
      if (serverKey) {
        googleUserKeys = [serverKey];
        usingServerKey = true;
      } else {
        await sendReply(msg, t(lang, 'ai_aib_requires_key') || '🔑 Function calling requires a Google API key.\n\nPlease add your key using /api command, or contact the admin.', {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: "✨ " + t(lang, 'ai_api_manage_button'), callback_data: 'apihub|ai|google|0' }], [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]] }
        });
        return;
      }
    }
    // Get available functions based on permissions
    const availableFunctions = await getAvailableFunctions(userId, chatId, msg);
    if (!availableFunctions.length) {
      await sendReply(msg, t(lang, 'ai_aib_no_functions') || '⚠️ No functions available. You may not have the required permissions.', {
        parse_mode: 'Markdown'
      });
      return;
    }
    // Get user's Gemini client
    const userKeyIndex = getUserGeminiKeyIndex(userId);
    const clientInfo = getGeminiClient(userKeyIndex, googleUserKeys);
    if (!clientInfo?.client) {
      await sendReply(msg, t(lang, 'ai_error'), {
        parse_mode: 'Markdown'
      });
      return;
    }
    // Detect if user explicitly opts out of function calls
    const optOutPhrases = [
      'không gọi lệnh', 'không phải lệnh', 'không phải gọi lệnh', 'đừng gọi lệnh',
      'trò chuyện thôi', 'nói chuyện thôi', 'chat thôi', 'không cần lệnh',
      "don't call function", "no function", "just talk", "just chat",
      "no commands", "don't use commands", "without commands",
      '不要调用函数', '不用命令', '只是聊天'
    ];
    const lowerPrompt = userPrompt.toLowerCase();
    const userOptedOutOfFunctions = optOutPhrases.some(phrase => lowerPrompt.includes(phrase));
    // Build tools configuration - disable if user opts out
    const tools = userOptedOutOfFunctions ? [] : [{
      functionDeclarations: availableFunctions
    }];
    if (userOptedOutOfFunctions) {
      log.child('FnCall').info('User opted out of function calls, tools disabled');
    }
    // Get user model preference
    const userModelConfig = getUserGeminiModelConfig(userId);
    const modelName = userModelConfig.modelConfig?.chat || GEMINI_MODEL;
    // Get user persona
    const personaPrompt = await getPersonaPrompt(userId);
    const personaSection = personaPrompt ? `\nPERSONALITY: ${personaPrompt}` : '';
    // Get user memory for persistent context
    const userMemory = await db.getAiMemory(userId);
    let memorySection = '';
    if (userMemory) {
      const memoryParts = [];
      if (userMemory.userName) {
        memoryParts.push(`User's name: ${userMemory.userName}`);
      }
      if (userMemory.userPreferences?.identity) {
        const idn = userMemory.userPreferences.identity;
        const idParts = [];
        if (idn.name) idParts.push(`name=${idn.name}`);
        if (idn.age) idParts.push(`age=${idn.age}`);
        if (idn.gender) idParts.push(`gender=${idn.gender}`);
        if (idn.birthdate) idParts.push(`birthdate=${idn.birthdate}`);
        if (idn.nationality) idParts.push(`nationality=${idn.nationality}`);
        if (idParts.length) memoryParts.push(`Identity: ${idParts.join(', ')}`);
      }
      if (userMemory.conversationSummary) {
        memoryParts.push(`Previous context: ${userMemory.conversationSummary}`);
      }
      if (userMemory.userPreferences && Object.keys(userMemory.userPreferences).length > 0) {
        // Exclude identity and customPersona since they're already sent separately
        const { identity: _id, customPersona: _cp, ...otherPrefs } = userMemory.userPreferences;
        if (Object.keys(otherPrefs).length > 0) {
          memoryParts.push(`User preferences: ${JSON.stringify(otherPrefs)}`);
        }
      }
      if (memoryParts.length > 0) {
        memorySection = `\nUSER MEMORY: ${memoryParts.join('. ')}`;
      }
    }
    // Inject context into message with natural response instruction
    const chatContextLine = msg.chat?.type ? `\nCHAT CONTEXT: ${msg.chat.type}${msg.message_thread_id ? ` | thread ${msg.message_thread_id}` : ''}` : '';
    const groupSafetyNote = (msg.chat?.type === 'group' || msg.chat?.type === 'supergroup')
      ? '\nGROUP SAFETY: Keep replies concise, avoid sharing personal data, and respect thread/context.'
      : '';
    const lastImage = userId ? lastImageContext.get(userId) : null;
    const imageSection = lastImage && Date.now() - lastImage.date < 30 * 60 * 1000
      ? `\nIMAGE MEMORY: Last image file_id=${lastImage.fileId}${lastImage.caption ? `, caption="${lastImage.caption.slice(0, 120)}"` : ''}`
      : '';
    // Fetch wallet context from onchain system (watch wallets + trading wallets)
    let walletContext = '';
    try {
      const onchainInstruction = await buildOnchainSystemInstruction(userId);
      // Extract only the wallet sections from the onchain instruction
      const watchIdx = onchainInstruction.indexOf('USER\'S WATCH WALLETS:');
      const tradingIdx = onchainInstruction.indexOf('USER\'S TRADING WALLETS:');
      const startIdx = watchIdx !== -1 ? watchIdx : tradingIdx;
      if (startIdx !== -1) {
        walletContext = '\n' + onchainInstruction.substring(startIdx);
      }
    } catch (e) { /* non-critical */ }

    const skillPrompt = skillRegistry.getSystemPrompt();
    const contextualPrompt = buildAIAPrompt({ personaSection, memorySection, chatContextLine, groupSafetyNote, imageSection, walletContext, skillPrompt });

    let isUsingServerKey = false;
    let fallbackToGeminiFlash = false;
    // Get or create session for conversation memory
    const session = await getUserSession(userId);
    // Initialize conversation with history + CLEAN user message (no system prompt pollution)
    let contents = [
      ...session.history, // Include previous conversation
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ];

    // Export key safety: redirect to /mywallet for key export
    const walletLowerPrompt = userPrompt.toLowerCase();
    if ((walletLowerPrompt.includes('xuất') || walletLowerPrompt.includes('export')) && (walletLowerPrompt.includes('key') || walletLowerPrompt.includes('khóa') || walletLowerPrompt.includes('私钥'))) {
      contents[contents.length - 1].parts.push({
        text: '\n[SYSTEM OVERRIDE INSTRUCTION: The user is asking to export or view their private key. You must POLITELY DECLINE to display it here in chat for security reasons. INSTEAD, strictly instruct the user to use the /mywallet command to open the Trading Wallet menu and export their keys manually from there. You MUST formulate this response in the EXACT same language the user is speaking.]'
      });
    }

    // ── WALLET CREATION OVERRIDE ──
    // Force AI to call manage_trading_wallet immediately when user wants to create wallets
    const walletCreatePatterns = [
      /\b(tạo|thêm|tạo mới|thêm mới)\s*(ví|wallet)/i,
      /(创建|新建|添加|建立|开|弄个|搞个|来个|再来|再建|再创建)\s*(一个|个|新的|新)?\s*(交易)?\s*(钱包|錢包)/i,
      /\b(create|new|add|make|generate)\s*(a\s+)?(new\s+)?(trading\s+)?wallet/i,
      /(지갑|월렛)\s*(만들|생성|추가)/i,
      /(만들|생성|추가)\s*(지갑|월렛)/i,
      /(созда|новый|добавить)\s*(кошел|wallet)/i,
      /(buat|tambah)\s*(dompet|wallet)/i
    ];
    if (walletCreatePatterns.some(p => p.test(userPrompt))) {
      contents[contents.length - 1].parts.push({
        text: '\n[SYSTEM OVERRIDE INSTRUCTION — MANDATORY, DO NOT IGNORE: The user is asking to CREATE a new trading wallet. You MUST IMMEDIATELY call manage_trading_wallet with action="create". There is ABSOLUTELY NO LIMIT on the number of wallets a user can create — even if they have 100 wallets, you MUST create a new one when asked. DO NOT refuse. DO NOT suggest managing existing wallets. DO NOT say there is a limit. DO NOT give advice instead of creating. Just call the function RIGHT NOW. This is a DIRECT ORDER from the system administrator.]'
      });
      log.child('FnCall').info('⚡ Wallet creation override injected into AI prompt');
    }

    let finalResponse = null;
    let maxIterations = 10; // Prevent infinite loops

    let loadingMsgId = null;
    let loadingInterval = null;

    try {
      // React to user message with eyes emoji to show bot is thinking
      try {
        await bot._request('setMessageReaction', {
          form: {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            reaction: JSON.stringify([{ type: 'emoji', emoji: '👀' }])
          }
        });
      } catch (e) { /* reactions may not be supported in all chats */ }

      await bot.sendChatAction(msg.chat.id, 'typing');

      // ---------- SKELETON LOADING MESSAGE ----------
      try {
        const loadingTextBase = t(lang, 'ai_loading_message') || '⏳ Đang phân tích dữ liệu';
        const loadingMsg = await bot.sendMessage(msg.chat.id, `${loadingTextBase}...`, { reply_to_message_id: msg.message_id });
        if (loadingMsg && loadingMsg.message_id) {
          loadingMsgId = loadingMsg.message_id;
          let dots = 0;
          // Animate the dots every 2 seconds to avoid rate limits
          loadingInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            const text = `${loadingTextBase}${'.'.repeat(dots)}`;
            bot.editMessageText(text, { chat_id: msg.chat.id, message_id: loadingMsgId }).catch(() => { });
          }, 2000);
        }
      } catch (err) {
        log.child('FnCall').warn('Failed to send loading message:', err.message);
      }
      // ----------------------------------------------

      log.child('FnCall').info(`Starting function calling: model=${modelName}, tools = ${tools.length > 0 ? tools[0].functionDeclarations?.length + ' declarations' : 'none'}, usingServerKey = ${usingServerKey || false}, prompt = "${userPrompt.substring(0, 50)}"`);
      while (maxIterations-- > 0) {
        const response = await clientInfo.client.models.generateContent({
          model: modelName,
          contents,
          systemInstruction: contextualPrompt,
          config: {
            tools
          }
        });
        log.child('FnCall').info(`Response: hasFunctionCalls = ${!!(response.functionCalls?.length)}, hasText = ${!!extractGoogleCandidateText(response)?.trim()} `);
        // Check for function calls
        if (response.functionCalls && response.functionCalls.length > 0) {
          const functionCall = response.functionCalls[0];
          log.child('FnCall').info(`Function call: ${functionCall.name} (${JSON.stringify(functionCall.args)})`);
          // Execute the function
          const context = { msg, deps, userId, chatId, bot, lang };
          let functionResult = await executeFunctionCall(functionCall, context);
          if (typeof functionResult === 'string') {
            functionResult = { success: true, displayMessage: functionResult };
          }

          // If the function was a scheduler function, an execution transaction, or explicit format like get_token_holders, treat it as an action so it replies directly
          const bypassedFunctions = [
            'transfer_tokens', 'batch_transfer', 'batch_swap', 'simulate_batch_swap', 'get_swap_quote', 'execute_swap', 'get_trading_wallet_balance',
            'get_token_holders', 'get_top_tokens', 'search_token', 'get_token_market_detail', 'get_market_candles',
            'get_token_security', 'get_trade_history', 'get_signal_list', 'calculate_profit_roi'
          ];
          // Use resolved name from onchain fuzzy matching (e.g. getsignallist → get_signal_list)
          const resolvedFnName = functionResult?._resolvedName || functionCall.name;
          if (resolvedFnName.startsWith('schedule_') || resolvedFnName === 'set_reminder' || resolvedFnName.includes('cancel_') || bypassedFunctions.includes(resolvedFnName)) {
            if (functionResult && functionResult.displayMessage) {
              // send the message directly
              const markdownRenderers = ['get_top_tokens', 'search_token', 'get_market_candles', 'get_token_holders', 'get_token_market_detail', 'get_token_security', 'get_trade_history', 'calculate_profit_roi'];
              let parseMode = 'HTML';
              let finalMessage = functionResult.displayMessage;

              if (markdownRenderers.includes(resolvedFnName)) {
                // Wipe out AI instructions from formatters
                finalMessage = finalMessage.replace(/> IMPORTANT INSTRUCTION:.*?\n\n/g, '');

                // Escape HTML characters to prevent Telegram crashes (e.g. <0.01, &)
                finalMessage = finalMessage.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                // Convert simple Markdown to Telegram HTML
                finalMessage = finalMessage.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // Bold
                finalMessage = finalMessage.replace(/\*([^\*]+)\*/g, '<i>$1</i>'); // Italic
                finalMessage = finalMessage.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>'); // Links
                finalMessage = finalMessage.replace(/`([^`]+)`/g, '<code>$1</code>'); // Inline code

                // Sanitize: fix mismatched/overlapping tags to prevent Telegram 400 errors
                finalMessage = sanitizeTelegramHtml(finalMessage);

                parseMode = 'HTML';
              } else if (resolvedFnName.startsWith('schedule_') || resolvedFnName === 'set_reminder' || resolvedFnName.includes('cancel_') || resolvedFnName === 'list_scheduled_tasks') {
                parseMode = 'Markdown';
              }
              const replyOpts = { parse_mode: parseMode, disable_web_page_preview: true };
              if (functionResult.reply_markup) replyOpts.reply_markup = functionResult.reply_markup;
              await sendReply(msg, finalMessage, replyOpts);
              functionResult.action = true; // force the loop to return
              functionResult.success = true; // ensure it passes the break condition
            }
          }

          // Delay slightly between consecutive function calls to avoid hitting Gemini rate limits (503 Overloaded)
          if (maxIterations < 9) {
            // Increase delay for subsequent calls (1.5s -> 2.5s -> 3.5s)
            const iterCount = 10 - maxIterations;

            // If the AI is calling too many functions (e.g., checking 4 wallets), force it to stop and return the data directly
            // to avoid hitting the strict Free Tier rate limit and causing a 503 crash.
            if (iterCount >= 4) {
              log.child('FnCall').warn(`⚠️ Forcing loop exit to prevent 503 Rate Limit (Iteration ${iterCount}). Function: ${functionCall.name}`);

              let fallbackDisplay = functionResult?.displayMessage || 'Đã lấy dữ liệu (một phần).';
              if (typeof fallbackDisplay !== 'string') {
                fallbackDisplay = JSON.stringify(fallbackDisplay);
              }

              // Just return the raw result directly to the user since we can't afford another AI summarization call
              await sendReply(msg, fallbackDisplay, { parse_mode: 'Markdown' });
              return;
            }

            await new Promise(r => setTimeout(r, 1500 + (iterCount * 1000)));
          }

          // Check if this is a command-routing function (uses processUpdate)
          // These functions trigger native commands which handle their own responses
          if (functionResult.success && functionResult.action) {
            log.child('FnCall').info(`✓ Function ${resolvedFnName} triggered command, returning`);
            // Save history BEFORE returning so context is preserved for next conversation
            await addToSessionHistory(userId, 'user', userPrompt);

            // For get_swap_quote: save the swap parameters so when user says "ok",
            // the AI can immediately call execute_swap with the correct args
            if (resolvedFnName === 'get_swap_quote') {
              const swapArgs = functionCall.args || {};
              await addToSessionHistory(userId, 'model',
                `[System: A swap quote was shown to the user for swapping ${swapArgs.amount || '?'} ${swapArgs.fromTokenAddress || '?'} → ${swapArgs.toTokenAddress || '?'} on chain ${swapArgs.chainIndex || '196'}. ` +
                `The quote is displayed and the user needs to confirm. ` +
                `When the user says "ok"/"có"/"confirm", you MUST immediately call execute_swap with these exact parameters: ` +
                `chainIndex="${swapArgs.chainIndex || '196'}", fromTokenAddress="${swapArgs.fromTokenAddress}", toTokenAddress="${swapArgs.toTokenAddress}", amount="${swapArgs.amount}". ` +
                `Do NOT ask for additional confirmation. Do NOT output this system text.]`
              );
            } else {
              // Data-fetching functions: results were displayed directly to the user
              // Tell AI that data is already shown, and it must call the function again for fresh data
              const dataFunctions = [
                'get_signal_list', 'get_top_tokens', 'search_token', 'get_token_market_detail',
                'get_market_candles', 'get_token_security', 'get_trade_history', 'calculate_profit_roi',
                'get_token_holders', 'get_trading_wallet_balance'
              ];
              if (dataFunctions.includes(resolvedFnName)) {
                await addToSessionHistory(userId, 'model',
                  `[System: Live data from '${resolvedFnName}' was fetched and displayed directly to the user. ` +
                  `Do NOT repeat, summarize, or regenerate this data. Do NOT output this text. ` +
                  `If the user asks a similar question again, you MUST call the function again for fresh real-time data.]`
                );
              } else {
                await addToSessionHistory(userId, 'model', `[System: The bot executed '${resolvedFnName}' and displayed results directly. Do not output this text.]`);
              }
            }
            return;
          }
          // Create function response part
          const functionResponsePart = {
            name: functionCall.name,
            response: { result: functionResult }
          };
          // Append function call from model
          contents.push(response.candidates[0].content);
          // Append function response from user
          contents.push({
            role: 'user',
            parts: [{ functionResponse: functionResponsePart }]
          });
          // Continue loop to get final response
        } else {
          // No more function calls, get final text response
          finalResponse = extractGoogleCandidateText(response);
          contents.push({
            role: 'model',
            parts: [{ text: finalResponse }]
          });
          break;
        }
      }
      if (maxIterations <= 0) {
        finalResponse = t(lang, 'ai_aib_max_iterations') || '⚠️ Maximum function call iterations reached. Please try a simpler request.';
      }
      // Save conversation to session history for future context
      if (finalResponse) {
        // ── FABRICATED DATA DETECTION ──
        // If AI skipped function calling and generated its own market data, detect and replace with real data
        const hasFabricatedSignals = /\[System:.*(?:signal|getsignal)/i.test(finalResponse) ||
          (/Smart Money|Dòng tiền thông minh|tín hiệu/i.test(finalResponse) && /\|\s*Token\s*\||\|\s*:--/i.test(finalResponse));

        if (hasFabricatedSignals) {
          log.child('FnCall').warn('⚠️ Detected fabricated signal data in AI response, forcing real function call');
          try {
            const { executeToolCall: execOnchain } = require('../features/ai/ai-onchain');
            const onchainContext = { msg, deps, userId, chatId, bot, lang };
            const realResult = await execOnchain({ name: 'get_signal_list', args: {} }, onchainContext);
            if (realResult && realResult.displayMessage) {
              const replyOpts = { parse_mode: 'HTML', disable_web_page_preview: true };
              if (realResult.reply_markup) replyOpts.reply_markup = realResult.reply_markup;
              await sendReply(msg, realResult.displayMessage, replyOpts);
              await addToSessionHistory(userId, 'user', userPrompt);
              await addToSessionHistory(userId, 'model',
                `[System: Live data from 'get_signal_list' was fetched and displayed directly to the user. ` +
                `Do NOT repeat, summarize, or regenerate this data. Do NOT output this text. ` +
                `If the user asks a similar question again, you MUST call the function again for fresh real-time data.]`
              );
              return;
            }
          } catch (e) {
            log.child('FnCall').error('Failed to force signal function call:', e.message);
          }
        }

        // Strip leaked [System: ...] blocks from final response
        finalResponse = finalResponse.replace(/\[System:.*?\]/gs, '').trim();

        await addToSessionHistory(userId, 'user', userPrompt);
        await addToSessionHistory(userId, 'model', finalResponse);
      }
      // Convert general Markdown to safe HTML for Telegram (escaping raw AI HTML first)
      const formatTelegramHtml = (text) => {
        if (!text) return text;

        // 1. Escape all raw angle brackets so AI cannot inject invalid HTML tags
        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 2. Convert Markdown Links: [Text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
          const cleanUrl = url.replace(/&lt;|&gt;/g, '').trim();
          return `<a href="${cleanUrl}">${text}</a>`;
        });

        // 3. Convert Markdown Code Blocks: ```lang\ncode\n```
        html = html.replace(/```(\w+)?\n([^]+?)```/g, '<pre><code class="language-$1">$2</code></pre>');
        html = html.replace(/```([^]+?)```/g, '<pre><code>$1</code></pre>');

        // 4. Convert Markdown Inline Code: `code`
        html = html.replace(/`([^]+?)`/g, '<code>$1</code>');

        // 5. Convert Markdown Bold: **bold** or __bold__
        html = html.replace(/\*\*([^]+?)\*\*/g, '<b>$1</b>');
        html = html.replace(/__([^]+?)__/g, '<b>$1</b>');

        // 6. Convert Markdown Italic: *italic* or _italic_
        html = html.replace(/(?<!\*)\*(?!\*)([^]+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');
        html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<i>$1</i>');

        // 7. Sanitize: fix mismatched/overlapping tags to prevent Telegram 400 errors
        html = sanitizeTelegramHtml(html);

        return html;
      };

      // Send final response - split into chunks if too long
      if (finalResponse) {
        // Strip out the "[Executed: functionName]" prefix that the AI sometimes prepends
        let cleanText = finalResponse.replace(/^\[Executed:\s*[^\]]+\]\s*/i, '');
        // Also strip any leaked [System: ...] blocks from display
        cleanText = cleanText.replace(/\[System:.*?\]/gs, '').trim();
        const cleanResponse = formatTelegramHtml(cleanText);
        const TELEGRAM_LIMIT = 4000; // Telegram message limit with buffer
        if (cleanResponse.length > TELEGRAM_LIMIT) {
          // Split into chunks
          const chunks = [];
          let remaining = cleanResponse;
          while (remaining.length > 0) {
            if (remaining.length <= TELEGRAM_LIMIT) {
              chunks.push(remaining);
              break;
            }
            // Try to split at newline or space
            let splitAt = remaining.lastIndexOf('\n', TELEGRAM_LIMIT);
            if (splitAt === -1 || splitAt < TELEGRAM_LIMIT / 2) {
              splitAt = remaining.lastIndexOf(' ', TELEGRAM_LIMIT);
            }
            if (splitAt === -1 || splitAt < TELEGRAM_LIMIT / 2) {
              splitAt = TELEGRAM_LIMIT;
            }
            chunks.push(remaining.substring(0, splitAt));
            remaining = remaining.substring(splitAt).trim();
          }
          // Send each chunk
          for (const chunk of chunks) {
            if (chunk.trim()) {
              await sendReply(msg, chunk, { parse_mode: 'HTML', disable_web_page_preview: true });
            }
          }
        } else {
          await sendReply(msg, cleanResponse, { parse_mode: 'HTML', disable_web_page_preview: true });
        }
      } else {
        await sendReply(msg, t(lang, 'ai_error') || 'An error occurred during function calling.');
      }
      // Change reaction to a contextual emoji after successful response
      try {
        const reactionEmojis = ['👍', '❤️', '🔥', '🎉', '👏', '⚡', '💯'];
        const randomReaction = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
        await bot._request('setMessageReaction', {
          form: {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            reaction: JSON.stringify([{ type: 'emoji', emoji: randomReaction }])
          }
        });
      } catch (e) { /* reactions may not be supported in all chats */ }
    } catch (error) {
      // Handle specific error types - avoid logging quota errors to reduce log spam
      // Gemini SDK may return error as JSON string in error.message
      let errorCode = error?.response?.data?.error?.code || error?.code;
      let errorMessage = error?.response?.data?.error?.message || error?.message || '';

      // Try to parse JSON from error.message (Gemini SDK sometimes returns full JSON in message)
      try {
        if (typeof errorMessage === 'string' && errorMessage.includes('{"error"')) {
          const parsed = JSON.parse(errorMessage);
          if (parsed?.error?.code) errorCode = parsed.error.code;
          if (parsed?.error?.message) errorMessage = parsed.error.message;
        }
      } catch (_) { /* ignore parse errors */ }

      // Helper to build close button
      const closeKeyboard = { inline_keyboard: [[{ text: `✖️ ${t(lang, 'action_close') || 'Close'}`, callback_data: 'ui_close' }]] };

      if (isGeminiApiKeyExpired(error)) {
        disableUserGeminiKey(userId, userKeyIndex, googleUserKeys.length);
        await sendReply(msg, t(lang, 'ai_key_expired') || '🔑 Your API key has expired. Please add a new one using /ai', {
          parse_mode: 'HTML',
          reply_markup: closeKeyboard
        });
        return;
      } else if (errorCode === 404 && errorMessage.includes('not supported for generateContent')) {
        // Flash Live model cannot generateContent - only function calling
        log.child('FnCall').error(`Flash Live generateContent error: ${errorMessage}`);
        await sendReply(msg, t(lang, 'ai_error_flash_live_no_content'), {
          parse_mode: 'HTML',
          reply_markup: closeKeyboard
        });
        return;
      } else if (errorCode === 503 || errorMessage.includes('overloaded')) {
        // Model overloaded - suggest switching model
        log.child('FnCall').error(`Model overloaded: ${errorMessage}`);
        await sendReply(msg, t(lang, 'ai_error_model_overloaded'), {
          parse_mode: 'HTML',
          reply_markup: closeKeyboard
        });
        return;
      } else if (isQuotaOrRateLimitError(error)) {
        // Don't log quota errors - just notify user
        const quotaMsg = t(lang, 'ai_provider_quota', { provider: 'Gemini' })
          || '⚠️ Bạn đã vượt quá hạn mức hiện tại, vui lòng kiểm tra gói và chi tiết thanh toán của bạn.';
        await sendReply(msg, quotaMsg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: "✨ " + t(lang, 'ai_api_manage_button'), callback_data: 'apihub|ai|google|0' }], [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]] }
        });
        return;
      } else {
        // Log non-quota errors
        log.child('FnCall').error(`Error during function calling: ${error.message}`);
        // Use HTML to avoid markdown parsing errors from special chars in error.message
        const safeErrorMsg = String(error.message || 'Unknown error').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        await sendReply(msg, t(lang, 'ai_error') + '\n\n' + safeErrorMsg, {
          parse_mode: 'HTML',
          reply_markup: closeKeyboard
        });
      }
    } finally {
      if (loadingInterval) clearInterval(loadingInterval);
      if (loadingMsgId) {
        bot.deleteMessage(msg.chat.id, loadingMsgId).catch(() => { });
      }
    }
  }
  /**
   * Main handler for /aib command - parses command and calls processAibRequest
   * Supports subcommands:
   * - /aib persona    -> open persona selection inline menu
   */
  async function handleAiaCommand(msg) {
    const textOrCaption = (msg.text || msg.caption || '').trim();
    const promptMatch = textOrCaption.match(/^\/aib(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i);
    const userPrompt = promptMatch && promptMatch[1] ? promptMatch[1].trim() : '';
    const lowerPrompt = userPrompt.toLowerCase();
    // Subcommand: /aib persona -> open persona menu
    if (/^persona\b/i.test(userPrompt)) {
      const lang = await getLang(msg);
      const userId = msg.from?.id?.toString();
      const currentPersonaId = await getUserPersona(userId);
      const personaList = Object.values(AI_PERSONAS).map((p) => {
        const current = currentPersonaId === p.id ? ' ✓' : '';
        const { name, desc } = getPersonaStrings(lang, p.id);
        return `• ${name}${current}: ${desc}`;
      }).join('\n');
      const menuText = `🎭 ${t(lang, 'ai_persona_title')}\n\n${personaList}\n\n${t(lang, 'ai_persona_hint')}`;
      await sendReply(msg, menuText, { reply_markup: await buildPersonaKeyboard(lang, userId) });
      return;
    }
    await processAibRequest(msg, userPrompt);
  }

  // ── AIB inline button callbacks (from signal list, etc.) ──
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('aib|')) return;
    const parts = data.split('|');
    const action = parts[1];
    const symbol = parts[2] || '';
    if (!action || !symbol) return;

    await bot.answerCallbackQuery(query.id);

    // Build a synthetic prompt based on the button action
    let prompt = '';
    if (action === 'analyze_token') {
      prompt = `analyze token ${symbol} security, chart and market data`;
    } else if (action === 'swap_token') {
      prompt = `get swap quote for buying ${symbol} with OKB`;
    } else {
      return;
    }

    // Build synthetic message from the callback query
    const mockMsg = {
      ...query.message,
      from: query.from,
      text: `/aib ${prompt}`,
      message_id: query.message.message_id
    };

    await processAibRequest(mockMsg, prompt);
  });
  return {
    handleAiCommand,
    handleAiTtsCommand,
    runAiRequestWithProvider,
    handleAiaCommand,
    handleAiUsageDashboard,
    processAibRequest,  // Export for auto-detection
    setUserPersona,
    getUserPersona,
    AI_PERSONAS,
    buildPersonaKeyboard,
    promptCustomPersonaInput,
    handleCustomPersonaReply,
    getPersonaLabel
  };
}
module.exports = {
  createAiHandlers,
  registerTokenSearchCallbacks,
  registerInlineQueryHandler,
  // Shared helpers for token search (used by marketTools.js)
  _buildPriceCard,
  _buildTokenListPage,
  _buildTokenListKeyboard,
  _tokenSearchCache,
  TKS_PAGE_SIZE
};