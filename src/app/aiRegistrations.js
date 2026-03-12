/**
 * Standalone registration functions — extracted from aiHandlers.js
 * Contains: registerImportKeyCommand, registerTradingWalletCallbacks,
 * _sendTradingWalletSubMenu, registerWalletHubCallbacks,
 * registerSwapConfirmCallback, registerTokenSearchCallbacks,
 * registerInlineQueryHandler.
 */
const logger = require('../core/logger');
const log = logger.child('AI:Registrations');

// Token Search imports (shared with aiHandlers.js)
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

// ═══════════════════════════════════════════════════════
// Batch Transfer Callbacks (batchconfirm| and batchretry|)
// ═══════════════════════════════════════════════════════
function registerBatchTransferCallbacks(bot, getLang) {
  // batchconfirm|confirm_xxx or batchconfirm|cancel_xxx
  bot.on('callback_query', async (query) => {
    const data = query.data || '';

    // ── #2: Swap quote inline confirm/cancel ──
    if (data.startsWith('swapquote|')) {
      const parts = data.split('|');
      const action = parts[1]; // confirm or cancel
      const qcId = parts[2];
      const params = global._pendingSwapQuoteConfirms?.get(qcId);
      try { await bot.answerCallbackQuery(query.id); } catch(_){}
      // Delete the quote message
      try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch(_){}
      if (action === 'confirm' && params) {
        global._pendingSwapQuoteConfirms.delete(qcId);
        // Build synthetic /aib message to trigger execute_swap
        const syntheticMsg = {
          chat: { id: params.chatId },
          from: { id: Number(params.userId) },
          text: '/aib ok'
        };
        // Trigger via processAibRequest-like flow
        try {
          const tradingTools = require('../features/ai/onchain/tradingTools');
          const chatId = params.chatId;
          let progressMsg;
          try { progressMsg = await bot.sendMessage(chatId, '⏳ Executing swap...', { disable_notification: true }); } catch(_){}
          const swapResult = await tradingTools.execute_swap({
            chainIndex: params.chainIndex,
            fromTokenAddress: params.fromTokenAddress,
            toTokenAddress: params.toTokenAddress,
            amount: params.amount
          }, { userId: params.userId, chatId: params.chatId, msg: syntheticMsg });
          if (progressMsg) { try { await bot.deleteMessage(chatId, progressMsg.message_id); } catch(_){} }
          if (swapResult?.displayMessage) {
            const sendOpts = { parse_mode: 'HTML', disable_web_page_preview: true };
            if (swapResult.reply_markup) sendOpts.reply_markup = swapResult.reply_markup;
            await bot.sendMessage(chatId, swapResult.displayMessage, sendOpts);
          }
        } catch (execErr) {
          try { await bot.sendMessage(params.chatId, '❌ Swap failed: ' + execErr.message); } catch(_){}
        }
      } else if (action === 'cancel') {
        global._pendingSwapQuoteConfirms?.delete(qcId);
        // Clean up multi-swap queue
        if (params?.userId && global._pendingMultiSwaps?.has(params.userId)) {
          global._pendingMultiSwaps.delete(params.userId);
        }
      }
      return;
    }

    // ── #4/#7: Swap action buttons (reverse/repeat) ──
    if (data.startsWith('swapaction|')) {
      const parts = data.split('|');
      const action = parts[1]; // reverse or repeat
      try { await bot.answerCallbackQuery(query.id); } catch(_){}
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      if (action === 'reverse') {
        // Reverse: swap from↔to
        const fromSnippet = parts[2] || '';
        const toSnippet = parts[3] || '';
        const chain = parts[4] || '196';
        // Build synthetic prompt for reversed swap
        const syntheticMsg = { chat: { id: chatId }, from: { id: userId }, text: '/aib swap from ' + toSnippet + ' to ' + fromSnippet + ' chainIndex ' + chain };
        try {
          const { handleAiaCommand } = require('./aiHandlers');
          if (handleAiaCommand) await handleAiaCommand(syntheticMsg);
        } catch(_){}
      } else if (action === 'repeat') {
        const fromSnippet = parts[2] || '';
        const toSnippet = parts[3] || '';
        const amt = parts[4] || '';
        const chain = parts[5] || '196';
        const syntheticMsg = { chat: { id: chatId }, from: { id: userId }, text: '/aib swap ' + amt + ' ' + fromSnippet + ' to ' + toSnippet + ' chainIndex ' + chain };
        try {
          const { handleAiaCommand } = require('./aiHandlers');
          if (handleAiaCommand) await handleAiaCommand(syntheticMsg);
        } catch(_){}
      }
      return;
    }

    // ── Swap confirmation handler (must be BEFORE batchconfirm guard) ──
    if (data.startsWith('swapconfirm|')) {
      const parts = data.split('|');
      const action = parts[1];
      const key = 'swapconfirm_' + action.replace(/^(yes|no)_/, '');
      if (global._pendingSwapConfirms && global._pendingSwapConfirms.has(key)) {
        const resolve = global._pendingSwapConfirms.get(key);
        global._pendingSwapConfirms.delete(key);
        resolve(action.startsWith('yes') ? 'confirm' : 'cancel');
      }
      try { await bot.answerCallbackQuery(query.id); } catch (_) {}
      return;
    }

    if (!data.startsWith('batchconfirm|')) return;

    const payload = data.slice('batchconfirm|'.length);
    const isConfirm = payload.startsWith('confirm_');
    const isCancel = payload.startsWith('cancel_');
    if (!isConfirm && !isCancel) return;

    const batchId = payload.replace(/^(confirm_|cancel_)/, '');
    const action = isConfirm ? 'confirm' : 'cancel';

    // Resolve pending confirmation promise
    const resolver = global._batchTransferPending?.get(batchId);
    if (resolver) {
      resolver(action);
    }

    // Set cancel signal for mid-batch abort
    if (isCancel && global._batchTransferCancel) {
      global._batchTransferCancel.set(batchId, true);
    }

    try { await bot.answerCallbackQuery(query.id); } catch (_) { }
    try { await bot.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => { }); } catch (_) { }
  });

  // batchretry|retry_xxx
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('batchretry|')) return;

    const retryId = data.slice('batchretry|'.length);
    const pending = global._batchRetryPending?.get(retryId);
    if (!pending) {
      const expiredTexts = {
        en: '⏰ Expired', vi: '⏰ Hết hạn', zh: '⏰ 已过期',
        ko: '⏰ 만료됨', ru: '⏰ Истекло', id: '⏰ Kedaluwarsa'
      };
      await bot.answerCallbackQuery(query.id, { text: expiredTexts.vi, show_alert: false });
      try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
      return;
    }

    global._batchRetryPending.delete(retryId);
    try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }

    const retryingTexts = {
      en: '🔄 Retrying failed transfers...',
      vi: '🔄 Đang thử lại các giao dịch thất bại...',
      zh: '🔄 正在重试失败的转账...',
      ko: '🔄 실패한 전송을 재시도합니다...',
      ru: '🔄 Повторяю неудачные переводы...',
      id: '🔄 Mengulangi transfer yang gagal...'
    };

    let lang = 'en';
    try {
      lang = await getLang(query.message);
    } catch (_) { }

    await bot.answerCallbackQuery(query.id, { text: retryingTexts[lang] || retryingTexts.en });

    // Re-execute batch_transfer with only failed transfers
    try {
      const walletTools = require('../features/ai/onchain/walletTools');
      const result = await walletTools.batch_transfer(pending.args, pending.context);
      const displayMsg = typeof result === 'string' ? result : result?.displayMessage;
      if (displayMsg) {
        await bot.sendMessage(query.message.chat.id, displayMsg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => { });
      }
    } catch (err) {
      log.child('BatchRetry').error('Retry failed:', err.message);
      await bot.sendMessage(query.message.chat.id, `❌ Retry error: ${err.message?.slice(0, 100)}`).catch(() => { });
    }
  });


  // batchsavetemplate|tpl_xxx — Save addresses from batch as template
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('batchsavetemplate|')) return;

    const tplId = data.slice('batchsavetemplate|'.length);
    const pending = global._batchSaveTemplatePending?.get(tplId);
    if (!pending) {
      await bot.answerCallbackQuery(query.id, { text: '⏰ Expired', show_alert: false });
      try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
      return;
    }

    global._batchSaveTemplatePending.delete(tplId);

    // Generate template name from timestamp
    const tplName = 'batch_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

    try {
      const { dbRun } = require('../../db/core');
      await dbRun(
        'INSERT OR REPLACE INTO wallet_templates (userId, name, addresses, createdAt) VALUES (?, ?, ?, ?)',
        [pending.userId, tplName, JSON.stringify(pending.addresses), Math.floor(Date.now() / 1000)]
      );

      let lang = 'en';
      try { lang = await getLang(query.message); } catch (_) { }
      const savedTexts = {
        en: `✅ Saved template "<b>${tplName}</b>" with ${pending.addresses.length} addresses.`,
        vi: `✅ Đã lưu template "<b>${tplName}</b>" với ${pending.addresses.length} địa chỉ.`,
        zh: `✅ 已保存模板 "<b>${tplName}</b>"，含 ${pending.addresses.length} 个地址。`,
        ko: `✅ 템플릿 "<b>${tplName}</b>" 저장 (${pending.addresses.length}개 주소).`,
        ru: `✅ Шаблон "<b>${tplName}</b>" сохранён (${pending.addresses.length} адресов).`,
        id: `✅ Template "<b>${tplName}</b>" disimpan dengan ${pending.addresses.length} alamat.`
      };
      const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');

      await bot.answerCallbackQuery(query.id, { text: '✅ Saved!' });
      await bot.editMessageText(savedTexts[lk] || savedTexts.en, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      }).catch(() => { });
    } catch (err) {
      log.child('BatchSaveTemplate').error('Save template error:', err.message);
      await bot.answerCallbackQuery(query.id, { text: '❌ Error saving template', show_alert: true });
    }
  });

  // csvbatch_transfer|csv_xxx or csvbatch_check|csv_xxx — Handle CSV file upload actions
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('csvbatch_')) return;

    const [action, csvId] = data.split('|');
    if (!csvId) return;

    if (action === 'csvbatch_cancel') {
      global._csvBatchPending?.delete(csvId);
      await bot.answerCallbackQuery(query.id);
      try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
      return;
    }

    const pending = global._csvBatchPending?.get(csvId);
    if (!pending) {
      await bot.answerCallbackQuery(query.id, { text: '⏰ Expired', show_alert: false });
      try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
      return;
    }

    global._csvBatchPending.delete(csvId);
    try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }

    const entries = pending.entries;
    const addrList = entries.map(e => e.address).join('\n');

    if (action === 'csvbatch_transfer') {
      const hasAmounts = entries.some(e => e.amount);
      let transferCmd;
      if (hasAmounts) {
        const transferDetails = entries.map(e => `${e.address} ${e.amount}`).join('\n');
        transferCmd = `batch transfer to these addresses with specified amounts:\n${transferDetails}`;
      } else {
        transferCmd = `batch transfer to these ${entries.length} addresses:\n${addrList}\nPlease ask me what token and amount to use.`;
      }
      // Create synthetic message for AI
      const syntheticMsg = {
        ...pending.msg,
        text: '/aib ' + transferCmd,
        caption: undefined,
        document: undefined
      };
      try {
        const { handleAiaCommand } = require('./aiHandlers');
        await handleAiaCommand(syntheticMsg);
      } catch (e) {
        log.child('CSVBatch').error('Transfer from CSV error:', e.message);
      }
    } else if (action === 'csvbatch_check') {
      const checkCmd = `check balances of these ${entries.length} wallets:\n${addrList}`;
      const syntheticMsg = {
        ...pending.msg,
        text: '/aib ' + checkCmd,
        caption: undefined,
        document: undefined
      };
      try {
        const { handleAiaCommand } = require('./aiHandlers');
        await handleAiaCommand(syntheticMsg);
      } catch (e) {
        log.child('CSVBatch').error('Check from CSV error:', e.message);
      }
    }

    await bot.answerCallbackQuery(query.id);
  });

  log.child('BatchTransfer').info('✔ Batch confirm + retry + save-template + CSV callbacks registered');
}

module.exports = {
  registerImportKeyCommand,
  registerTradingWalletCallbacks,
  _sendTradingWalletSubMenu,
  registerWalletHubCallbacks,
  registerSwapConfirmCallback,
  registerTokenSearchCallbacks,
  registerInlineQueryHandler,
  registerBatchTransferCallbacks
};
