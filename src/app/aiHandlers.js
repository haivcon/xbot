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


// Standalone registration functions — extracted to aiRegistrations.js
const {
  registerImportKeyCommand,
  registerTradingWalletCallbacks,
  _sendTradingWalletSubMenu,
  registerWalletHubCallbacks,
  registerSwapConfirmCallback,
  registerTokenSearchCallbacks,
  registerInlineQueryHandler,
  registerBatchTransferCallbacks
} = require('./aiRegistrations');


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

            // ════ Item #1: DCA SWAP EXECUTOR (CRITICAL) ════
          } else if (task.type === 'dca_swap') {
            const dcaLog = log.child('DCA');
            const p = task.params || {};
            try {
              const { dbGet: dcaDbGet, dbRun: dcaDbRun } = require('../../db/core');

              // Resolve wallet
              const tw = await dcaDbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [p.walletId, task.userId]);
              if (!tw) {
                dcaLog.error(`Wallet ${p.walletId} not found for user ${task.userId}. Disabling DCA ${task.id}.`);
                await dcaDbRun(`UPDATE ai_scheduled_tasks SET enabled = 0 WHERE id = ?`, [task.id]);
                await safeSend(targetChatId, `❌ DCA ${task.id}: Wallet not found. DCA disabled.`, { parse_mode: 'HTML' });
                return;
              }

              if (!global._decryptTradingKey) {
                dcaLog.error('Encryption not ready, skipping DCA');
                return;
              }

              const ethers = require('ethers');
              const onchainos = require('../services/onchainos');
              const { _getChainRpc, _getExplorerUrl } = require('../features/ai/onchain/helpers');
              const chainIndex = p.chainIndex || '196';
              const rpcUrl = _getChainRpc(chainIndex);
              const provider = new ethers.JsonRpcProvider(rpcUrl);

              // Item #9: Stop-loss / Take-profit price check
              if (p.stopLossPct || p.takeProfitPct) {
                try {
                  const priceData = await onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: p.toTokenAddress }]);
                  const currentPrice = Number(priceData?.[0]?.lastPrice || 0);
                  if (currentPrice > 0) {
                    if (!p.initialPrice) {
                      // Save initial price on first run
                      p.initialPrice = currentPrice;
                      await dcaDbRun(`UPDATE ai_scheduled_tasks SET params = ? WHERE id = ?`, [JSON.stringify(p), task.id]);
                      dcaLog.info(`DCA ${task.id}: Initial price saved: $${currentPrice}`);
                    } else {
                      const changePct = ((currentPrice - p.initialPrice) / p.initialPrice) * 100;
                      if (p.stopLossPct && changePct <= -p.stopLossPct) {
                        dcaLog.warn(`DCA ${task.id}: Stop-loss triggered (${changePct.toFixed(1)}% < -${p.stopLossPct}%). Disabling.`);
                        await dcaDbRun(`UPDATE ai_scheduled_tasks SET enabled = 0 WHERE id = ?`, [task.id]);
                        await safeSend(targetChatId,
                          `🛑 <b>DCA STOP-LOSS</b>\n━━━━━━━━━━━━━━━━━━\n` +
                          `🆔 <code>${task.id}</code>\n` +
                          `📉 Price: $${currentPrice.toFixed(6)} (${changePct.toFixed(1)}%)\n` +
                          `🛡️ Threshold: -${p.stopLossPct}%\n` +
                          `⛔ DCA auto-disabled.`,
                          { parse_mode: 'HTML' });
                        return;
                      }
                      if (p.takeProfitPct && changePct >= p.takeProfitPct) {
                        dcaLog.info(`DCA ${task.id}: Take-profit triggered (${changePct.toFixed(1)}% >= +${p.takeProfitPct}%). Disabling.`);
                        await dcaDbRun(`UPDATE ai_scheduled_tasks SET enabled = 0 WHERE id = ?`, [task.id]);
                        await safeSend(targetChatId,
                          `🎯 <b>DCA TAKE-PROFIT</b>\n━━━━━━━━━━━━━━━━━━\n` +
                          `🆔 <code>${task.id}</code>\n` +
                          `📈 Price: $${currentPrice.toFixed(6)} (+${changePct.toFixed(1)}%)\n` +
                          `🎯 Threshold: +${p.takeProfitPct}%\n` +
                          `✅ DCA auto-disabled. Target reached!`,
                          { parse_mode: 'HTML' });
                        return;
                      }
                    }
                  }
                } catch (priceErr) {
                  dcaLog.warn(`DCA ${task.id}: Price check failed:`, priceErr.message);
                }
              }

              // Execute the swap
              const privateKey = global._decryptTradingKey(tw.encryptedKey);
              const wallet = new ethers.Wallet(privateKey, provider);

              // Resolve decimals + amount to wei
              let fromDec = 18, toDec = 18, fromSym = p.fromSymbol || '?', toSym = p.toSymbol || '?';
              try {
                const basicInfo = await onchainos.getTokenBasicInfo([
                  { chainIndex, tokenContractAddress: p.fromTokenAddress },
                  { chainIndex, tokenContractAddress: p.toTokenAddress }
                ]);
                if (basicInfo?.length > 0) {
                  const f = basicInfo.find(t2 => t2.tokenContractAddress?.toLowerCase() === p.fromTokenAddress.toLowerCase());
                  const t3 = basicInfo.find(t2 => t2.tokenContractAddress?.toLowerCase() === p.toTokenAddress.toLowerCase());
                  if (f) { fromDec = Number(f.decimal || 18); fromSym = f.tokenSymbol || fromSym; }
                  if (t3) { toDec = Number(t3.decimal || 18); toSym = t3.tokenSymbol || toSym; }
                }
              } catch (e) { /* use defaults */ }

              const amountWei = ethers.parseUnits(String(p.amount), fromDec).toString();

              // Check balance first
              const isNative = p.fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
              let hasBalance = false;
              try {
                if (isNative) {
                  const bal = await provider.getBalance(tw.address);
                  hasBalance = bal > BigInt(amountWei);
                } else {
                  const erc20 = new ethers.Contract(p.fromTokenAddress, ["function balanceOf(address) view returns (uint256)"], provider);
                  const bal = await erc20.balanceOf(tw.address);
                  hasBalance = bal >= BigInt(amountWei);
                }
              } catch (e) { hasBalance = true; /* attempt swap anyway */ }

              if (!hasBalance) {
                dcaLog.warn(`DCA ${task.id}: Insufficient balance. Skipping.`);
                p.consecutiveFailures = (p.consecutiveFailures || 0) + 1;
                if (p.consecutiveFailures >= 3) {
                  await dcaDbRun(`UPDATE ai_scheduled_tasks SET enabled = 0, params = ? WHERE id = ?`, [JSON.stringify(p), task.id]);
                  await safeSend(targetChatId, `⚠️ DCA <code>${task.id}</code>: 3 consecutive failures (insufficient balance). DCA disabled.`, { parse_mode: 'HTML' });
                } else {
                  await dcaDbRun(`UPDATE ai_scheduled_tasks SET params = ? WHERE id = ?`, [JSON.stringify(p), task.id]);
                }
                return;
              }

              // Approve if ERC-20
              if (!isNative) {
                try {
                  const approveData = await onchainos.getApproveTransaction(chainIndex, p.fromTokenAddress, amountWei);
                  if (approveData?.[0]?.dexContractAddress) {
                    const spender = approveData[0].dexContractAddress;
                    const erc20Check = new ethers.Contract(p.fromTokenAddress, ["function allowance(address,address) view returns (uint256)"], provider);
                    const allowance = await erc20Check.allowance(tw.address, spender);
                    if (allowance < BigInt(amountWei)) {
                      const iface = new ethers.Interface(["function approve(address spender, uint256 amount) public returns (bool)"]);
                      const approveCalldata = iface.encodeFunctionData("approve", [spender, ethers.MaxUint256]);
                      const approveTx = await wallet.signTransaction({
                        to: p.fromTokenAddress, data: approveCalldata, value: 0n,
                        gasLimit: BigInt(approveData[0].gasLimit || '100000'), gasPrice: BigInt(approveData[0].gasPrice || '1000000000'),
                        nonce: await provider.getTransactionCount(wallet.address), chainId: parseInt(chainIndex)
                      });
                      await onchainos.broadcastTransaction(approveTx, chainIndex, tw.address);
                      dcaLog.info(`DCA ${task.id}: Approve sent, waiting 3s...`);
                      await new Promise(r => setTimeout(r, 3000));
                    }
                  }
                } catch (approveErr) {
                  dcaLog.warn(`DCA ${task.id}: Approve failed:`, approveErr.message);
                }
              }

              // Get swap TX and execute
              const txData = await onchainos.getSwapTransaction({
                chainIndex, fromTokenAddress: p.fromTokenAddress, toTokenAddress: p.toTokenAddress,
                amount: amountWei, userWalletAddress: tw.address, slippagePercent: '3'
              });
              const txRaw = Array.isArray(txData) ? txData[0] : txData;
              if (!txRaw?.tx) throw new Error('No swap tx data returned');

              const signedTx = await wallet.signTransaction({
                to: txRaw.tx.to, data: txRaw.tx.data, value: BigInt(txRaw.tx.value || '0'),
                gasLimit: BigInt(txRaw.tx.gas || txRaw.tx.gasLimit || '300000'),
                gasPrice: BigInt(txRaw.tx.gasPrice || '1000000000'),
                nonce: await provider.getTransactionCount(wallet.address),
                chainId: parseInt(chainIndex)
              });

              const broadcastResult = await onchainos.broadcastTransaction(signedTx, chainIndex, tw.address);
              const br = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
              const txHash = br?.txHash || br?.orderId || 'pending';

              // Parse swap amounts
              const router = txRaw.routerResult || {};
              const swapFromAmt = Number(router.fromTokenAmount || amountWei) / Math.pow(10, fromDec);
              const swapToAmt = Number(router.toTokenAmount || 0) / Math.pow(10, toDec);

              // Item #7: Log DCA history to wallet_tx_history
              try {
                let priceUsd = 0;
                try {
                  const pd = await onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: p.toTokenAddress }]);
                  priceUsd = Number(pd?.[0]?.lastPrice || 0);
                } catch (e) { /* no price */ }

                await dcaDbRun(
                  `INSERT INTO wallet_tx_history (userId, walletId, walletAddress, type, chainIndex, fromToken, toToken, fromAmount, toAmount, fromSymbol, toSymbol, priceUsd, txHash, createdAt)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                  [task.userId, parseInt(p.walletId), tw.address, 'dca_swap', chainIndex,
                  p.fromTokenAddress, p.toTokenAddress, String(swapFromAmt), String(swapToAmt),
                    fromSym, toSym, priceUsd, txHash, Math.floor(Date.now() / 1000)]
                );
              } catch (histErr) {
                dcaLog.warn(`DCA ${task.id}: History log failed:`, histErr.message);
              }

              // Reset consecutive failures on success
              p.consecutiveFailures = 0;
              await dcaDbRun(`UPDATE ai_scheduled_tasks SET params = ? WHERE id = ?`, [JSON.stringify(p), task.id]);

              // Item #6: Send DCA result notification via DM
              const explorerBase = _getExplorerUrl(chainIndex);
              await safeSend(targetChatId,
                `🔄 <b>DCA SWAP</b> ✅\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🆔 <code>${task.id}</code>\n` +
                `💱 <code>${swapFromAmt.toFixed(4)}</code> ${escapeHtml(fromSym)} ➔ <code>${swapToAmt.toFixed(4)}</code> ${escapeHtml(toSym)}\n` +
                `👛 <code>${tw.address.slice(0, 8)}...${tw.address.slice(-4)}</code>\n` +
                `🔗 <a href="${explorerBase}/tx/${txHash}">View TX</a>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🕐 ${fmtTime(Date.now())}`,
                { parse_mode: 'HTML' });

              dcaLog.info(`✅ DCA ${task.id} executed: ${swapFromAmt} ${fromSym} → ${swapToAmt} ${toSym}, txHash=${txHash}`);

            } catch (dcaErr) {
              dcaLog.error(`❌ DCA ${task.id} failed:`, dcaErr.message || dcaErr);
              // Track failures
              p.consecutiveFailures = (p.consecutiveFailures || 0) + 1;
              try {
                const { dbRun: dcaDbRun2 } = require('../../db/core');
                if (p.consecutiveFailures >= 3) {
                  await dcaDbRun2(`UPDATE ai_scheduled_tasks SET enabled = 0, params = ? WHERE id = ?`, [JSON.stringify(p), task.id]);
                  await safeSend(targetChatId,
                    `❌ <b>DCA FAILED</b>\n━━━━━━━━━━━━━━━━━━\n` +
                    `🆔 <code>${task.id}</code>\n` +
                    `⚠️ 3 consecutive failures. DCA disabled.\n` +
                    `📋 Error: ${escapeHtml((dcaErr.message || '').slice(0, 100))}`,
                    { parse_mode: 'HTML' });
                } else {
                  await dcaDbRun2(`UPDATE ai_scheduled_tasks SET params = ? WHERE id = ?`, [JSON.stringify(p), task.id]);
                  await safeSend(targetChatId,
                    `⚠️ <b>DCA SWAP FAILED</b>\n━━━━━━━━━━━━━━━━━━\n` +
                    `🆔 <code>${task.id}</code>\n` +
                    `📋 ${escapeHtml((dcaErr.message || '').slice(0, 100))}\n` +
                    `🔄 Will retry next cycle (${p.consecutiveFailures}/3 failures).`,
                    { parse_mode: 'HTML' });
                }
              } catch (e2) { dcaLog.error('Failed to update DCA failure state:', e2.message); }
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
  registerBatchTransferCallbacks(bot, getLang);
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
  // Function Tools — extracted to aiHandlers/aiFunctionTools.js
  const createFunctionTools = require('./aiHandlers/aiFunctionTools');
  const { getAvailableFunctions, executeFunctionCall, toolFunctionImplementations, hasExplicitHelpIntent, shouldExecuteFunction } = createFunctionTools({
    bot, db, t, getLang, sendReply, buildCloseKeyboard,
    deps, onchainToolArrays, executeOnchainToolCall,
    skillRegistry, Type,
    detectImageAction, AI_PERSONAS, getPersonaLabel, getPersonaStrings,
    getUserPersona, setUserPersona, buildPersonaKeyboard,
    getUserCustomPersona, promptCustomPersonaInput,
    clearUserSession,
    applyThreadId,
    getBotIntroductionDeclaration
  });

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

    // ── MULTI-ADDRESS CONTEXT HANDLER ──
    // When user provides multiple wallet addresses, help AI understand context
    const addressMatches = userPrompt.match(/0x[0-9a-fA-F]{40}/gi);
    if (addressMatches && addressMatches.length >= 2) {
      const uniqueAddresses = [...new Set(addressMatches.map(a => a.toLowerCase()))];
      if (uniqueAddresses.length >= 2) {
        const addrList = uniqueAddresses.map((a, i) => `  ${i + 1}. ${a}`).join('\n');
        
        // Detect user intent (includes [TRANSFER] marker from inline keyboard callback)
        const transferKeywords = /\[TRANSFER\]|chuyển|transfer|gửi|send|distribute|hàng loạt|hang loat|tới.*ví|to.*wallet|转账|보내|전송|перевод|kirim/i;
        const hasTransferIntent = transferKeywords.test(userPrompt);
        
        if (hasTransferIntent) {
          // TRANSFER INTENT: Force batch_transfer with explicit address list
          contents[contents.length - 1].parts.push({
            text: '\n[SYSTEM OVERRIDE — BATCH TRANSFER ROUTING (MANDATORY):\n' +
              'The user message contains ' + uniqueAddresses.length + ' destination wallet addresses.\n' +
              'You MUST call batch_transfer with these EXACT parameters:\n' +
              '- mode: "distribute"\n' +
              '- fromWalletId: "default" (for ALL entries)\n' +
              '- transfers array: create EXACTLY ' + uniqueAddresses.length + ' entries, one per address below:\n' +
              addrList + '\n' +
              'CRITICAL RULES:\n' +
              '1. Use EVERY address listed above - do NOT skip any\n' +
              '2. Do NOT fabricate or make up addresses - use ONLY the addresses from the user message\n' +
              '3. Do NOT call transfer_tokens - it only supports single transfers\n' +
              '4. Do NOT call check_wallet_balance_direct - that is for checking a single wallet\n' +
              '5. The amount per transfer = the amount the user specified]'
          });
          // Remove competing tools to guarantee correct routing
          const competingTools = ['check_wallet_balance_direct', 'check_wallet_balance', 'transfer_tokens', 'lookup_contract'];
          if (tools.length > 0 && tools[0].functionDeclarations) {
            const before = tools[0].functionDeclarations.length;
            tools[0].functionDeclarations = tools[0].functionDeclarations.filter(
              f => !competingTools.includes(f.name)
            );
            log.child('FnCall').info(`⚡ Batch transfer override: ${uniqueAddresses.length} addresses, removed ${before - tools[0].functionDeclarations.length} competing tools`);
          }
        } else {
          // NON-TRANSFER INTENT (swap, check, etc): provide context but let AI decide
          contents[contents.length - 1].parts.push({
            text: '\n[CONTEXT: The user message contains ' + uniqueAddresses.length + ' wallet addresses:\n' +
              addrList + '\n' +
              'Use the appropriate tool based on user intent. If they want to check balances, check each address. If they want to swap, handle accordingly.]'
          });
          log.child('FnCall').info(`⚡ Multi-address context: ${uniqueAddresses.length} addresses, non-transfer intent — AI decides`);
        }
      }
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
            // ── Auto-execute remaining multi-swaps after execute_swap ──
            // Improvement 6: Execution lock — prevent double "ok"
            if (resolvedFnName === 'execute_swap') {
              if (!global._swapExecutionLocks) global._swapExecutionLocks = new Set();
              if (global._swapExecutionLocks.has(userId)) {
                log.child('FnCall').warn('Double-ok blocked for user ' + userId);
                return; // silently ignore duplicate execution
              }
              global._swapExecutionLocks.add(userId);
              // Auto-release lock after 120s max
              setTimeout(() => { global._swapExecutionLocks?.delete(userId); }, 120000);
            }
            if (resolvedFnName === 'execute_swap' && global._pendingMultiSwaps?.has(userId)) {
              const swapQueue = global._pendingMultiSwaps.get(userId);
              // Remove the just-executed swap (first in queue)
              if (swapQueue.length > 0) swapQueue.shift();
              if (swapQueue.length > 0) {
                log.child('FnCall').info(`Multi-swap: ${swapQueue.length} remaining swaps in queue`);
                // Execute ALL remaining swaps directly (not via AI) — preserves language + handles 3+ pairs
                const tradingTools = require('../features/ai/onchain/tradingTools');
                const chatId = msg?.chat?.id;
                let botRef; try { botRef = require('../core/bot').bot; } catch(_){}
                // Detect user language for progress messages
                let uLang = 'vi';
                try {
                  const { getUserLanguage } = require('../../db/users');
                  const dbLang = await getUserLanguage(String(msg?.chat?.id || userId));
                  if (dbLang) uLang = dbLang;
                } catch(_){}
                const uLk = ['zh-Hans','zh-cn'].includes(uLang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(uLang) ? uLang : 'en');
                const progressLabels = {
                  en: { exec: 'Executing', of: 'of', done: 'BATCH SWAP COMPLETE', success: 'Success', fail: 'Failed' },
                  vi: { exec: 'Đang thực hiện', of: '/', done: 'HOÀN TẤT SWAP HÀNG LOẠT', success: 'Thành công', fail: 'Thất bại' },
                  zh: { exec: '执行中', of: '/', done: '批量兑换完成', success: '成功', fail: '失败' },
                  ko: { exec: '실행 중', of: '/', done: '배치 스왑 완료', success: '성공', fail: '실패' },
                  ru: { exec: 'Выполняется', of: 'из', done: 'ОБМЕН ЗАВЕРШЁН', success: 'Успех', fail: 'Ошибка' },
                  id: { exec: 'Mengeksekusi', of: '/', done: 'BATCH SWAP SELESAI', success: 'Berhasil', fail: 'Gagal' }
                };
                const pL = progressLabels[uLk] || progressLabels.en;
                const totalRemaining = swapQueue.length;
                const results = [];

                // Process remaining swaps sequentially
                setTimeout(async () => {
                  try {
                    const totalSwaps = totalRemaining + 1; // include already-executed first swap
                    let progressMsgId = null;
                    for (let i = 0; i < totalRemaining; i++) {
                      const nextSwap = swapQueue[0]; // always take first
                      if (!nextSwap) break;
                      // Send progress
                      if (botRef && chatId) {
                        try { const pm = await botRef.sendMessage(chatId, `⏳ ${pL.exec} swap ${i + 2} / ${totalSwaps}...`, { disable_notification: true }); progressMsgId = pm?.message_id; } catch(_){}
                      }
                      // Build context for execute_swap
                      const swapContext = { ...context, userId, chatId, msg, lang: uLang };
                      try {
                        const swapResult = await tradingTools.execute_swap({
                          chainIndex: nextSwap.chainIndex || '196',
                          fromTokenAddress: nextSwap.fromTokenAddress,
                          toTokenAddress: nextSwap.toTokenAddress,
                          amount: nextSwap.amount
                        }, swapContext);
                        const swapOk = swapResult?.success !== false; // receipt verification may set success=false
                        results.push({ swap: nextSwap, success: swapOk, result: swapResult });
                        log.child('FnCall').info(`Multi-swap ${i+2}/${totalSwaps}: ${swapOk ? 'success' : 'reverted'}`);
                        // Stop if swap reverted on-chain (Improvement #1)
                        if (!swapOk) {
                          if (progressMsgId && botRef && chatId) { try { await botRef.deleteMessage(chatId, progressMsgId); } catch(_){} progressMsgId = null; }
                          if (botRef && chatId && swapResult?.displayMessage) {
                            const sendOpts = { parse_mode: 'HTML', disable_web_page_preview: true }; if (swapResult.reply_markup) sendOpts.reply_markup = swapResult.reply_markup; try { await botRef.sendMessage(chatId, swapResult.displayMessage, sendOpts); } catch(_){}
                          }
                          break;
                        }
                        // Delete progress msg then show success
                        if (progressMsgId && botRef && chatId) { try { await botRef.deleteMessage(chatId, progressMsgId); } catch(_){} progressMsgId = null; }
                        if (botRef && chatId && swapResult?.displayMessage) {
                          const sendOpts = { parse_mode: 'HTML', disable_web_page_preview: true }; if (swapResult.reply_markup) sendOpts.reply_markup = swapResult.reply_markup; try { await botRef.sendMessage(chatId, swapResult.displayMessage, sendOpts); } catch(_){}
                        }
                      } catch (swapErr) {
                        results.push({ swap: nextSwap, success: false, error: swapErr.message });
                        log.child('FnCall').warn(`Multi-swap ${i+2}/${totalSwaps}: failed:`, swapErr.message);
                        // Delete progress + notify failure with retry hint
                        if (progressMsgId && botRef && chatId) { try { await botRef.deleteMessage(chatId, progressMsgId); } catch(_){} progressMsgId = null; }
                        if (botRef && chatId) {
                          const retryHints = { en: 'Possible causes: slippage, liquidity, or token limit.', vi: 'Nguyên nhân: trượt giá, thanh khoản, hoặc giới hạn token.', zh: '原因：滑点、流动性或代币限制。', ko: '원인: 슬리피지, 유동성 또는 토큰 제한.', ru: 'Причины: слиппейдж, ликвидность или лимит токена.', id: 'Penyebab: slippage, likuiditas, atau batas token.' };
                          const stopMsgs = { en: '⏹️ Remaining swaps stopped.', vi: '⏹️ Đã dừng các swap còn lại.', zh: '⏹️ 已停止剩余兑换。', ko: '⏹️ 나머지 스왑 중단.', ru: '⏹️ Остальные обмены остановлены.', id: '⏹️ Swap sisa dihentikan.' };
                          try { await botRef.sendMessage(chatId, `❌ Swap ${i+2}/${totalSwaps} ${pL.fail}\n⚠️ ${swapErr.message}\n💡 <i>${retryHints[uLk] || retryHints.en}</i>\n\n${stopMsgs[uLk] || stopMsgs.en}`, { parse_mode: 'HTML', disable_notification: true }); } catch(_){}
                        }
                        // Stop remaining swaps on failure (Improvement #1)
                        break;
                      }
                      swapQueue.shift(); // remove processed swap
                      // Brief pause between swaps
                      if (i < totalRemaining - 1) await new Promise(r => setTimeout(r, 5000)); // 5s to ensure previous tx is confirmed
                    }
                    // Final summary
                    if (botRef && chatId && results.length > 0) {
                      const successCount = results.filter(r => r.success).length;
                      const failCount = results.filter(r => !r.success).length;
                      let summary = `✅ <b>${pL.done}</b>\n━━━━━━━━━━━━━━━━━━\n`;
                      // +1 for first swap (handled by AI) — assume success since it passed receipt check before reaching here
                      summary += `📊 ${pL.success}: ${successCount + 1} | ${pL.fail}: ${failCount}\n`;
                      try { await botRef.sendMessage(chatId, summary, { parse_mode: 'HTML' }); } catch(_){}
                    }
                  } catch (batchErr) { log.child('FnCall').warn('Multi-swap batch failed:', batchErr.message); }
                  // Clean up
                  global._pendingMultiSwaps.delete(userId);
                   global._swapExecutionLocks?.delete(userId);
                  if (global._pendingMultiSwapTimers?.has(userId)) {
                    clearTimeout(global._pendingMultiSwapTimers.get(userId));
                    global._pendingMultiSwapTimers.delete(userId);
                  }
                }, 3000);
              } else {
                global._pendingMultiSwaps.delete(userId);
                   global._swapExecutionLocks?.delete(userId);
                if (global._pendingMultiSwapTimers?.has(userId)) {
                  clearTimeout(global._pendingMultiSwapTimers.get(userId));
                  global._pendingMultiSwapTimers.delete(userId);
                }
                // Release execution lock
                global._swapExecutionLocks?.delete(userId);
              }
            }

            log.child('FnCall').info(`✓ Function ${resolvedFnName} triggered command, returning`);
            // Save history BEFORE returning so context is preserved for next conversation
            await addToSessionHistory(userId, 'user', userPrompt);

            // For get_swap_quote: save the swap parameters so when user says "ok",
            // the AI can immediately call execute_swap with the correct args
            if (resolvedFnName === 'get_swap_quote') {
              const swapArgs = functionCall.args || {};
              // ── Store in pending multi-swap queue ──
              if (!global._pendingMultiSwaps) global._pendingMultiSwaps = new Map();
              if (!global._pendingMultiSwapTimers) global._pendingMultiSwapTimers = new Map();
              // TTL: Auto-clear queue after 5 minutes
              if (global._pendingMultiSwapTimers.has(userId)) clearTimeout(global._pendingMultiSwapTimers.get(userId));
              global._pendingMultiSwapTimers.set(userId, setTimeout(() => {
                global._pendingMultiSwaps.delete(userId);
                   global._swapExecutionLocks?.delete(userId);
                global._pendingMultiSwapTimers.delete(userId);
                log.child('FnCall').info(`Multi-swap queue expired for user ${userId}`);
              }, 300000));
              if (!global._pendingMultiSwaps.has(userId)) global._pendingMultiSwaps.set(userId, []);
              // Add this swap to the queue (avoid duplicates by toToken)
              const queue = global._pendingMultiSwaps.get(userId);
              const alreadyQueued = queue.some(q => q.toTokenAddress?.toLowerCase() === swapArgs.toTokenAddress?.toLowerCase() && q.fromTokenAddress?.toLowerCase() === swapArgs.fromTokenAddress?.toLowerCase() && q.amount === swapArgs.amount);
              if (!alreadyQueued) {
                queue.push({ ...swapArgs });
                log.child('FnCall').info(`Multi-swap queue for user ${userId}: ${queue.length} pending`);
              }

              // Build session history with ALL pending swaps
              let historyMsg;
              if (queue.length > 1) {
                const swapList = queue.map((q, i) => `  Swap ${i+1}: chainIndex="${q.chainIndex || '196'}", fromTokenAddress="${q.fromTokenAddress}", toTokenAddress="${q.toTokenAddress}", amount="${q.amount}"`).join('\n');
                historyMsg = `[System: ${queue.length} swap quotes were shown. When user says "ok"/"có"/"confirm", you MUST call execute_swap for the FIRST swap in the list below. The system will automatically execute the remaining swaps.\n${swapList}\nCall execute_swap with: chainIndex="${queue[0].chainIndex || '196'}", fromTokenAddress="${queue[0].fromTokenAddress}", toTokenAddress="${queue[0].toTokenAddress}", amount="${queue[0].amount}". Do NOT output this system text.]`;
              } else {
                historyMsg = `[System: A swap quote was shown to the user for swapping ${swapArgs.amount || '?'} ${swapArgs.fromTokenAddress || '?'} → ${swapArgs.toTokenAddress || '?'} on chain ${swapArgs.chainIndex || '196'}. ` +
                  `The quote is displayed and the user needs to confirm. ` +
                  `When the user says "ok"/"có"/"confirm", you MUST immediately call execute_swap with these exact parameters: ` +
                  `chainIndex="${swapArgs.chainIndex || '196'}", fromTokenAddress="${swapArgs.fromTokenAddress}", toTokenAddress="${swapArgs.toTokenAddress}", amount="${swapArgs.amount}". ` +
                  `Do NOT ask for additional confirmation. Do NOT output this system text.]`;
              }
              await addToSessionHistory(userId, 'model', historyMsg);

              // ── Multi-swap: check if original message has MORE swap lines ──
              try {
                const originalText = userPrompt || '';
                // Split by newlines and detect swap patterns
                const swapPatterns = /(?:đổi|swap|exchange|兑换|교환|обмен|tukar)\s+[\d.]+\s+\S+\s+(?:lấy|for|to|ra|sang|thành|换|으로|на|dengan)\s+\S+/gi;
                const swapLines = originalText.match(swapPatterns) || [];
                
                if (swapLines.length > 1) {
                  // Remove the first swap line (AI processes in order)
                  // NOTE: Can't filter by toToken because all swaps may target the same token (e.g., all→OKB)
                  const remainingLines = swapLines.slice(1);

                  if (remainingLines.length > 0) {
                    log.child('FnCall').info(`Multi-swap detected: ${swapLines.length} total, ${remainingLines.length} remaining. Processing next...`);
                    // Process remaining swaps by re-calling the AI handler with remaining text
                    const remainingText = remainingLines.join('\n');
                    const syntheticMsg = { ...msg, text: '/aib ' + remainingText };
                    // Use setTimeout to avoid stack overflow, process after current returns
                    // handleAiaCommand is in scope (same closure), no need for require
                    setTimeout(async () => {
                      try {
                        await handleAiaCommand(syntheticMsg);
                      } catch (e) { log.child('FnCall').warn('Multi-swap chain failed:', e.message); }
                    }, 2000);
                  }
                }
              } catch (multiSwapErr) {
                log.child('FnCall').warn('Multi-swap detection error:', multiSwapErr.message);
              }
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
    // ── Pre-processor: rewrite grouped swap patterns ──
    // Detects: "đổi 100 banmao / đổi 50 niuma / tất cả lấy okb"
    // Rewrites to: "đổi 100 banmao lấy okb\nđổi 50 niuma lấy okb"
    let processedPrompt = userPrompt;
    try {
      const lines = userPrompt.split(/\n/).map(l => l.trim()).filter(Boolean);
      // Find a "shared target" line like "tất cả lấy X" / "all to X" / "全部换X"
      const sharedTargetPattern = /^(?:tất cả|all|toàn bộ|全部|모두|все|semua)\s+(?:lấy|sang|thành|to|for|换|으로|на|ke)\s+(\S+)$/i;
      // Find "incomplete" swap lines like "đổi 100 banmao" (no target)
      const incompleteSwapPattern = /^(?:đổi|swap|exchange|兑换|교환|обмен|tukar)\s+[\d.]+\s+\S+$/i;
      const sharedTargetLine = lines.find(l => sharedTargetPattern.test(l));
      if (sharedTargetLine) {
        const targetMatch = sharedTargetLine.match(sharedTargetPattern);
        const sharedToken = targetMatch[1];
        const rewrittenLines = [];
        for (const line of lines) {
          if (sharedTargetPattern.test(line)) continue; // skip the "tất cả lấy X" line
          if (incompleteSwapPattern.test(line)) {
            // Add target: "đổi 100 banmao" → "đổi 100 banmao lấy okb"
            rewrittenLines.push(line + ' lấy ' + sharedToken);
          } else {
            rewrittenLines.push(line); // keep complete lines as-is
          }
        }
        if (rewrittenLines.length > 0) {
          processedPrompt = rewrittenLines.join('\n');
          log.child('FnCall').info('Grouped swap rewritten: ' + processedPrompt.replace(/\n/g, ' | '));
        }
      }
    } catch (preErr) { /* ignore pre-processing errors */ }
    await processAibRequest(msg, processedPrompt);
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
