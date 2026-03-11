const onchainos = require('../../../services/onchainos');
const logger = require('../../../core/logger');
const log = logger.child('WalletTools');
const fs = require('fs');
const path = require('path');
const { formatPriceResult, formatSearchResult, formatWalletResult, formatSwapQuoteResult, formatTopTokensResult, formatRecentTradesResult, formatSignalChainsResult, formatSignalListResult, formatProfitRoiResult, formatHolderResult, formatGasResult, formatTokenInfoResult, formatCandlesResult, formatTokenMarketDetail, formatSwapExecutionResult, formatSimulationResult, formatLargeNumber } = require('./formatters');
const { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken, rpcRetry, createNonceManager } = require('./helpers');
const db = require('../../../../db.js');

module.exports = {
    async get_wallet_balance(args, context) {
        try {
            const chains = args.chains || '196';
            const [totalValue, balances] = await Promise.all([
                onchainos.getWalletTotalValue(args.address, chains).catch(() => null),
                onchainos.getWalletBalances(args.address, chains).catch(() => null)
            ]);

            // Fetch real-time market prices to override stale balance snapshot prices
            try {
                const tokenList = (balances && Array.isArray(balances) && balances.length > 0) ? (balances[0]?.tokenAssets || balances) : [];
                if (tokenList.length > 0) {
                    const tokenReqs = tokenList.map(b => ({
                        chainIndex: b.chainIndex || chains.split(',')[0] || '196',
                        tokenContractAddress: b.tokenContractAddress || b.tokenAddress
                    }));
                    const priceInfos = await onchainos.getTokenPriceInfo(tokenReqs).catch(() => []);
                    log.child('AIADebugWallet').info(`Real-time prices fetched for ${tokenList.length} tokens. Found:`, priceInfos);
                    let newTotal = 0;
                    if (Array.isArray(priceInfos) && priceInfos.length > 0) {
                        for (const b of tokenList) {
                            const addr = b.tokenContractAddress || b.tokenAddress;
                            const rtPrice = priceInfos.find(p => p.tokenContractAddress?.toLowerCase() === addr?.toLowerCase());
                            if (rtPrice && Number(rtPrice.price) > 0) {
                                log.child('AIADebugWallet').info(`Overriding stale price for ${addr}: ${b.tokenPrice} -> ${rtPrice.price}`);
                                b.tokenPrice = String(rtPrice.price);
                            }
                            newTotal += Number(b.tokenPrice || 0) * Number(b.holdingAmount || b.balance || 0);
                        }
                        if (totalValue && Array.isArray(totalValue) && totalValue.length > 0 && newTotal > 0) {
                            totalValue[0].totalValue = String(newTotal);
                        }
                    }
                }
            } catch (e) {
                // Ignore real-time price errors, fallback to snapshot prices
            }

            const lang = context?.lang || 'en';
            return formatWalletResult(totalValue, balances, args.address, lang);
        } catch (error) {
            return `❌ Error fetching wallet: ${error.msg || error.message}`;
        }
    },

    async manage_trading_wallet(args, context) {
        const { dbGet, dbRun, dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Cannot identify user. Please use the /mywallet command instead.';
        const action = (args.action || '').toLowerCase();

        if (action === 'create') {
            try {
                const ethers = require('ethers');
                const crypto = require('crypto');
                const ENCRYPT_KEY = _getEncryptKey();
                const newWallet = ethers.Wallet.createRandom();
                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
                let encrypted = cipher.update(newWallet.privateKey, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                const encryptedKey = iv.toString('hex') + ':' + encrypted;
                const existing = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? LIMIT 1', [userId]);
                const isDefault = existing ? 0 : 1;
                const countRow = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]);

                // ── i18n for wallet creation ──
                const _wcI18n = {
                    wallet_prefix: { vi: 'Ví', en: 'Wallet', zh: '钱包', ko: '지갑', ru: 'Кошелёк', id: 'Dompet' },
                    created_ok: { vi: '✅ Ví giao dịch mới đã được tạo thành công!', en: '✅ New trading wallet created successfully!', zh: '✅ 新交易钱包创建成功！', ko: '✅ 새 거래 지갑이 생성되었습니다!', ru: '✅ Новый торговый кошелёк успешно создан!', id: '✅ Dompet trading baru berhasil dibuat!' },
                    address_label: { vi: 'Địa chỉ', en: 'Address', zh: '地址', ko: '주소', ru: 'Адрес', id: 'Alamat' },
                    pk_sent: { vi: 'Khoá Private đã được gửi vào tin nhắn riêng tư của bạn (tự xoá sau 30 giây). Vui lòng kiểm tra DM.', en: 'The private key has been sent to your Direct Messages securely (auto-delete in 30s). Please check your DM.', zh: '私钥已安全发送到您的私信（30秒后自动删除），请查收 DM。', ko: '개인 키가 DM으로 안전하게 전송되었습니다 (30초 후 자동 삭제). DM을 확인하세요.', ru: 'Приватный ключ отправлен в личные сообщения (автоудаление через 30 сек). Проверьте ЛС.', id: 'Private key telah dikirim ke DM Anda dengan aman (otomatis terhapus dalam 30 detik). Cek DM Anda.' },
                    pk_fail: { vi: 'Cảnh báo: Không thể gửi khoá Private qua DM. Hãy dùng lệnh /mywallet để xuất thủ công.', en: 'Note: Could not send private key to your DM. Please use /mywallet to export it manually.', zh: '注意：无法将私钥发送至私信。请使用 /mywallet 手动导出。', ko: '참고: 개인 키를 DM으로 전송하지 못했습니다. /mywallet 을 사용하여 직접 내보내세요.', ru: 'Примечание: Не удалось отправить ключ в ЛС. Используйте /mywallet для ручного экспорта.', id: 'Catatan: Tidak bisa mengirim private key ke DM. Gunakan /mywallet untuk mengekspornya.' },
                    err_create: { vi: '❌ Lỗi khi tạo ví:', en: '❌ Error creating wallet:', zh: '❌ 创建钱包时出错：', ko: '❌ 지갑 생성 오류:', ru: '❌ Ошибка при создании кошелька:', id: '❌ Gagal membuat dompet:' },
                };
                const lang = context?.lang || 'en';
                const _wc = (key) => (_wcI18n[key] || {})[lang] || (_wcI18n[key] || {}).en || key;
                const walletPrefix = _wc('wallet_prefix');
                const autoName = `${walletPrefix} ${(countRow?.cnt || 0) + 1}`;
                await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, autoName, newWallet.address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]);

                let dmSent = false;
                if (context && context.bot && context.msg) {
                    try {
                        const dbModule = require('../../../../db.js');
                        await dbModule.addWalletToUser(userId, lang, newWallet.address, { name: autoName });

                        // Send the private key directly to DM (localized)
                        const keyMsgI18n = {
                            title: { vi: '👛 Ví mới được tạo', en: '👛 New wallet created', zh: '👛 新钱包已创建', ko: '👛 새 지갑 생성됨', ru: '👛 Новый кошелёк создан', id: '👛 Dompet baru dibuat' },
                            addrLbl: { vi: 'Địa chỉ', en: 'Address', zh: '地址', ko: '주소', ru: 'Адрес', id: 'Alamat' },
                            pkLbl: { vi: 'Khoá Private', en: 'Private Key', zh: '私钥', ko: '개인 키', ru: 'Приватный ключ', id: 'Private Key' },
                            warn: { vi: '⚠️ Tin nhắn này sẽ tự hủy sau 30 giây để bảo mật!', en: '⚠️ This message will auto-delete in 30 seconds for security!', zh: '⚠️ 此消息将在 30 秒后自动删除以保障安全！', ko: '⚠️ 이 메시지는 30초 후 보안을 위해 자동 삭제됩니다!', ru: '⚠️ Это сообщение автоматически удалится через 30 секунд!', id: '⚠️ Pesan ini akan otomatis terhapus dalam 30 detik demi keamanan!' },
                        };
                        const _km = (key) => (keyMsgI18n[key] || {})[lang] || (keyMsgI18n[key] || {}).en || key;
                        const keyMsg = `👛 **${_km('title')}**\n━━━━━━━━━━━━━━━━━━\n${_km('addrLbl')}: \`${newWallet.address}\`\n${_km('pkLbl')}: \`${newWallet.privateKey}\`\n\n${_km('warn')}`;
                        const sent = await context.bot.sendMessage(userId, keyMsg, { parse_mode: 'Markdown' });
                        setTimeout(() => { context.bot.deleteMessage(userId, sent.message_id).catch(() => { }); }, 30000);
                        dmSent = true;
                    } catch (e) {
                        log.child('AUTOWATCH').error('Failed to register watch wallet or send DM:', e);
                    }

                    try {
                        const syntheticUpdate = {
                            update_id: Date.now(),
                            message: {
                                ...context.msg,
                                text: '/mywallet',
                                entities: [{ type: 'bot_command', offset: 0, length: 9 }]
                            }
                        };
                        context.bot.processUpdate(syntheticUpdate);
                    } catch (e) { log.child('AUTOPOPUP').error('Failed to trigger /mywallet:', e); }
                }

                if (dmSent) {
                    return {
                        success: true,
                        action: true,
                        displayMessage: `${_wc('created_ok')}\n${_wc('address_label')}: ${newWallet.address}\n\n${_wc('pk_sent')}`
                    };
                } else {
                    return {
                        success: true,
                        action: true,
                        displayMessage: `${_wc('created_ok')}\n${_wc('address_label')}: ${newWallet.address}\n\n⚠️ ${_wc('pk_fail')}`
                    };
                }
            } catch (error) {
                return { success: false, action: true, displayMessage: `${_wc('err_create')} ${error.message}` };
            }
        } else if (action === 'delete') {
            try {
                const wId = args.walletId ? parseInt(args.walletId) : null;
                if (wId) {
                    const tw = await dbGet('SELECT address FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId]);
                    if (!tw) return { success: false, action: true, displayMessage: '❌ Wallet not found.' };
                    await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId]);
                    return { success: true, action: true, displayMessage: `✅ Wallet ${tw.address} deleted.` };
                } else {
                    const tw = await dbGet('SELECT id, address FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                    if (!tw) return { success: false, action: true, displayMessage: '❌ No default wallet found.' };
                    await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [tw.id, userId]);
                    return { success: true, action: true, displayMessage: `✅ Default wallet ${tw.address} deleted.` };
                }
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Error deleting wallet: ${error.message}` };
            }
        } else if (action === 'set_default') {
            try {
                const wId = args.walletId ? parseInt(args.walletId) : null;
                if (!wId) return { success: false, action: true, displayMessage: '❌ Please specify a walletId. Use list_trading_wallets first to see wallet IDs.' };
                const tw = await dbGet('SELECT address FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId]);
                if (!tw) return { success: false, action: true, displayMessage: '❌ Wallet not found.' };
                await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE userId = ?', [userId]);
                await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ? AND userId = ?', [wId, userId]);
                return { success: true, action: true, displayMessage: `⭐ Wallet ${tw.address} set as default.` };
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Error setting default: ${error.message}` };
            }
        } else if (action === 'import') {
            if (!args.privateKeys) return { success: false, action: true, displayMessage: '❌ Vui lòng cung cấp private key(s). Ví dụ: "import ví 0xabc... 0xdef..."' };
            try {
                const ethers = require('ethers');
                const crypto = require('crypto');
                const ENCRYPT_KEY = _getEncryptKey();
                const rawKeys = args.privateKeys.trim().split(/[\s,;]+/).filter(k => k.length > 0);
                const results = { imported: [], duplicates: [], invalid: [] };

                for (const key of rawKeys) {
                    try {
                        const pk = key.startsWith('0x') ? key : `0x${key}`;
                        const wallet = new ethers.Wallet(pk);
                        const existing = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND address = ?', [userId, wallet.address]);
                        if (existing) { results.duplicates.push(wallet.address); continue; }
                        const iv = crypto.randomBytes(16);
                        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
                        let encrypted = cipher.update(pk, 'utf8', 'hex');
                        encrypted += cipher.final('hex');
                        const encryptedKey = iv.toString('hex') + ':' + encrypted;
                        const hasWallets = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? LIMIT 1', [userId]);
                        const isDefault = hasWallets ? 0 : 1;
                        const countRow2 = await dbGet('SELECT COUNT(*) as cnt FROM user_trading_wallets WHERE userId = ?', [userId]);
                        const importName = `Ví ${(countRow2?.cnt || 0) + 1}`;
                        await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [userId, importName, wallet.address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]);
                        results.imported.push(wallet.address);
                    } catch (e) {
                        results.invalid.push(key.slice(0, 10) + '...');
                    }
                }

                let summary = '';
                if (results.imported.length > 0) {
                    summary += `✅ Import thành công ${results.imported.length} ví:\n`;
                    results.imported.forEach((a, i) => { summary += `${i + 1}. ${a}\n`; });
                }
                if (results.duplicates.length > 0) summary += `\n⚠️ ${results.duplicates.length} ví đã tồn tại (bỏ qua)\n`;
                if (results.invalid.length > 0) summary += `\n❌ ${results.invalid.length} key không hợp lệ\n`;
                if (!summary) summary = '❌ Không có key hợp lệ nào.';
                return { success: true, action: true, displayMessage: summary };
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Error importing wallets: ${error.message}` };
            }
        } else if (action === 'export') {
            try {
                const { dbGet, dbAll } = require('../../../../db/core');

                // Fetch user to check PIN code
                const user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]);
                const storedPin = user ? user.pinCode : null;
                // Key export proceeds immediately.

                const allWallets = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY createdAt ASC', [userId]);
                if (!allWallets || allWallets.length === 0) {
                    return { success: false, action: true, displayMessage: '❌ You do not have any trading wallets to export.' };
                }

                if (context && context.bot && context.msg) {
                    const lang = context.lang || 'vi';
                    let exportMsg = `🔑 **Danh sách Khóa Private (AI Export)**\n━━━━━━━━━━━━━━━━━━\n`;
                    allWallets.forEach((w, i) => {
                        const key = global._decryptTradingKey ? global._decryptTradingKey(w.encryptedKey) : '❌ Decryption unavailable';
                        const star = w.isDefault ? ' ⭐' : '';
                        exportMsg += `\nVí ${i + 1}: \`${w.address}\`${star}\nKey: \`${key}\`\n`;
                    });
                    exportMsg += `\n⚠️ Tin nhắn này sẽ tự hủy sau 30 giây để bảo mật!`;

                    try {
                        const keyMsg = await context.bot.sendMessage(userId, exportMsg, { parse_mode: 'Markdown' });
                        setTimeout(() => { context.bot.deleteMessage(userId, keyMsg.message_id).catch(() => { }); }, 30000);
                        return { success: true, action: true, displayMessage: `✅ Successfully exported ${allWallets.length} wallet keys.\n\nThe private keys have been securely sent to your Direct Messages (they will auto-delete in 30s). Please tell the user to check their DMs.` };
                    } catch (e) {
                        return { success: false, action: true, displayMessage: `❌ Failed to send private keys to DM. Error: ${e.message}. Please instruct the user to use the /mywallet command directly.` };
                    }
                }
                return { success: false, action: true, displayMessage: '❌ Bot context is required to securely export keys via DM.' };
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Error exporting wallets: ${error.message}` };
            }
        } else if (action === 'rename') {
            try {
                const wId = args.walletId ? parseInt(args.walletId) : null;
                const newName = (args.walletName || '').trim().slice(0, 20);
                if (!newName) return { success: false, action: true, displayMessage: '❌ Vui lòng cung cấp tên mới cho ví (tối đa 20 ký tự).' };
                if (!wId) return { success: false, action: true, displayMessage: '❌ Vui lòng cung cấp ID ví cần đổi tên.' };
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId]);
                if (!tw) return { success: false, action: true, displayMessage: '❌ Không tìm thấy ví.' };
                await dbRun('UPDATE user_trading_wallets SET walletName = ? WHERE id = ? AND userId = ?', [newName, wId, userId]);
                return { success: true, action: true, displayMessage: `✅ Đã đổi tên ví thành "${newName}" (${tw.address.slice(0, 8)}...${tw.address.slice(-4)}).` };
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Lỗi đổi tên ví: ${error.message}` };
            }
        } else if (action === 'tag') {
            try {
                const wId = args.walletId ? parseInt(args.walletId) : null;
                if (!wId) return { success: false, action: true, displayMessage: '❌ Cần cung cấp walletId.' };
                const newTags = (args.tags || '').trim();
                if (!newTags) return { success: false, action: true, displayMessage: '❌ Cần cung cấp tags (ví dụ: "trading,airdrop").' };
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId]);
                if (!tw) return { success: false, action: true, displayMessage: '❌ Không tìm thấy ví.' };
                await dbRun('UPDATE user_trading_wallets SET tags = ? WHERE id = ? AND userId = ?', [newTags, wId, userId]);
                return { success: true, action: true, displayMessage: `✅ Đã gắn tags "${newTags}" cho ví ${tw.address.slice(0, 8)}...` };
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Lỗi gắn tag: ${error.message}` };
            }
        }
        return { success: false, action: true, displayMessage: `❌ Unknown action "${action}". Supported: create, delete, set_default, import, export, rename, tag.` };
    },

    async set_wallet_pin(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';

        try {
            const { dbGet, dbRun } = require('../../../../db/core');
            const user = await dbGet('SELECT pinCode FROM users WHERE chatId = ?', [userId]);

            if (!args.new_pin || !/^\d{4}$/.test(args.new_pin)) {
                return '❌ Mã PIN phải bao gồm đúng 4 chữ số (ví dụ: "1234").';
            }

            if (user && user.pinCode) {
                if (!args.current_pin) {
                    return '🔒 Bạn đã có mã PIN. Vui lòng cung cấp mã PIN hiện tại để đổi mã mới.';
                }
                if (!_verifyPin(args.current_pin, user.pinCode, userId)) {
                    return '❌ Mã PIN hiện tại không chính xác.';
                }
            }

            const hashedPin = _hashPin(args.new_pin, userId);
            await dbRun('UPDATE users SET pinCode = ? WHERE chatId = ?', [hashedPin, userId]);
            return '✅ Đã thiết lập mã PIN bảo mật thành công cho ví giao dịch.';
        } catch (error) {
            return `❌ Lỗi khi thiết lập mã PIN: ${error.message}`;
        }
    },

    async get_trading_wallet_balance(args, context) {
        const { dbGet } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Cannot identify user.';
        try {
            const wId = args.walletId ? parseInt(args.walletId) : null;
            const tw = wId
                ? await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId])
                : await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
            if (!tw) return '❌ No trading wallet found. Create one first with manage_trading_wallet.';
            const config = require('../../../config/env');
            const createOkxService = require('../../../services/okxService');
            const okxService = createOkxService(config);
            const chainIdx = tw.chainIndex || '196';
            const snapshot = await okxService.fetchOkxDexBalanceSnapshot(tw.address, { explicitChainIndex: parseInt(chainIdx) }).catch(() => ({ tokens: [] }));
            const balances = snapshot.tokens || [];
            if (!balances.length) return `Wallet ${tw.address} (${tw.isDefault ? 'default' : ''}):\n📭 Empty wallet (0 tokens). Fund this wallet with OKB/USDT to start trading.`;

            // Fetch real-time market prices to override stale balance snapshot prices
            try {
                const tokenReqs = balances.map(b => ({
                    chainIndex: '196',
                    tokenContractAddress: b.tokenAddress
                }));
                const priceInfos = await onchainos.getTokenPriceInfo(tokenReqs).catch(() => []);
                log.child('AIADebug').info(`Real-time prices fetched for ${balances.length} tokens. Found:`, priceInfos);
                if (Array.isArray(priceInfos) && priceInfos.length > 0) {
                    for (const b of balances) {
                        const rtPrice = priceInfos.find(p => p.tokenContractAddress?.toLowerCase() === b.tokenAddress?.toLowerCase());
                        if (rtPrice && Number(rtPrice.price) > 0) {
                            log.child('AIADebug').info(`Overriding stale price for ${b.symbol}: ${b.priceUsd} -> ${rtPrice.price}`);
                            b.priceUsd = Number(rtPrice.price);
                        }
                    }
                }
            } catch (e) {
                log.child('AIADebug').error('Failed to fetch real-time prices:', e);
            }

            // Detect user's prompt language
            const userText = (context?.msg?.text || context?.msg?.caption || '').toLowerCase();
            let lang = context?.lang || 'en';
            if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/.test(userText)) lang = 'vi';
            else if (/[\u4e00-\u9fa5]/.test(userText)) lang = 'zh';
            else if (/[\uac00-\ud7af]/.test(userText)) lang = 'ko';
            else if (/[а-яА-ЯёЁ]/.test(userText)) lang = 'ru';
            else if (/\b(saya|kamu|di|ke|dari|untuk|bisa|tidak|ya|halo|tolong|ada|berapa|saldo|dompet|transfer|kirim)\b/.test(userText)) lang = 'id';

            let titleLabel = 'DEX Assets';
            let timeLabel = 'Time:';
            let walletLabel = 'Wallet:';
            let chainLabel = 'Chain:';
            let totalUsdLabel = 'Total USD Value:';
            let balanceLabel = 'Balance:';
            let priceLabel = 'Price:';
            let valueLabel = 'Value:';
            let riskSafe = 'Safe';
            let riskWarning = 'Risk Warning';
            let emptyMsg = `Wallet ${tw.address} (${tw.isDefault ? 'default' : ''}):\n📭 Empty wallet (0 tokens). Fund this wallet with OKB/USDT to start trading.`;

            if (lang === 'vi') {
                titleLabel = 'Tài sản DEX';
                timeLabel = 'Thời gian:';
                walletLabel = 'Ví:';
                chainLabel = 'Mạng lưới:';
                totalUsdLabel = 'Tổng giá trị (USD):';
                balanceLabel = 'Số dư:';
                priceLabel = 'Giá:';
                valueLabel = 'Trị giá:';
                riskSafe = 'An toàn';
                riskWarning = 'Cảnh báo rủi ro';
                emptyMsg = `Ví ${tw.address} (${tw.isDefault ? 'mặc định' : ''}):\n📭 Ví rỗng (0 token). Hãy nạp OKB/USDT để bắt đầu giao dịch.`;
            } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
                titleLabel = '去中心化资产';
                timeLabel = '时间:';
                walletLabel = '钱包:';
                chainLabel = '网络:';
                totalUsdLabel = '总价值 (USD):';
                balanceLabel = '余额:';
                priceLabel = '价格:';
                valueLabel = '价值:';
                riskSafe = '安全';
                riskWarning = '风险警告';
                emptyMsg = `钱包 ${tw.address} (${tw.isDefault ? '默认' : ''}):\n📭 钱包为空 (0 个代币). 请充值 OKB/USDT 开始交易.`;
            }

            if (!balances.length) return { success: true, action: true, displayMessage: emptyMsg };

            let totalUsd = 0;
            const lines = [];
            balances.slice(0, 15).forEach((b, i) => {
                const val = Number(b.balance || b.amount || b.tokenBalance || 0);
                const sym = b.symbol || b.tokenSymbol || '?';
                const priceUsd = Number(b.priceUsd || b.tokenPrice || b.price || 0);
                const usd = priceUsd * val;
                totalUsd += usd;
                const tokenAddr = b.tokenAddress || '';
                const isRisk = b.isRiskToken ? riskWarning : riskSafe;

                const explorerUrl = _getExplorerUrl(chainIdx);
                const safeAddrUrl = `<a href="${explorerUrl}/token/${tokenAddr}">${sym}</a>`;
                const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
                const chainName = chainNames[chainIdx] || `Chain #${chainIdx}`;
                lines.push(`&gt; ${i + 1}. 🌕 <b>${safeAddrUrl}</b> — ${chainName} (#${chainIdx})`);
                lines.push(`&gt; 📊 ${balanceLabel} ${val.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${sym}`);
                lines.push(`&gt; 💰 ${priceLabel} $${priceUsd < 0.01 ? priceUsd.toFixed(8) : priceUsd.toFixed(4)}`);
                lines.push(`&gt; 💵 ${valueLabel} $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} [${isRisk}]`);
                lines.push(`&gt;`);
            });
            const explorerUrl = _getExplorerUrl(chainIdx);
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
            const chainName = chainNames[chainIdx] || `Chain #${chainIdx}`;
            const safeAddr = `<a href="${explorerUrl}/address/${tw.address}">${tw.address}</a>`;

            const now = new Date();
            const timeString = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(now);

            const defaultStr = tw.isDefault ? `(ID ${tw.id} ⭐)` : `(ID ${tw.id})`;
            const localizedHeader = lang === 'vi' ? 'Chi tiết tài sản ví:' : (lang === 'zh' || lang === 'zh-Hans' ? '钱包资产详情:' : 'Wallet Asset Details:');

            const report = `<b>${localizedHeader}</b> ${defaultStr}\n` +
                `<code>${tw.address}</code>\n` +
                `&gt; 💼 <b>${titleLabel} -</b>\n` +
                `&gt; ⏰ ${timeLabel} ${timeString} (GMT+7)\n` +
                `&gt; 👛 ${walletLabel} ${safeAddr}\n` +
                `&gt; 🌐 ${chainLabel} ${chainName} (#${chainIdx})\n` +
                `&gt; 💰 <b>${totalUsdLabel} $${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>\n` +
                `&gt;\n` + lines.join('\n');

            return { success: true, action: true, displayMessage: report };
        } catch (error) {
            return `❌ Error fetching balance: ${error.message}`;
        }
    },

    async list_trading_wallets(args, context) {
        const { dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Cannot identify user.';
        try {
            const wallets = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, createdAt ASC', [userId]);
            if (!wallets || wallets.length === 0) return '📭 No trading wallets. Use manage_trading_wallet with action "create" to create one.';
            const lines = wallets.map((w, i) => {
                const star = w.isDefault ? ' ⭐ (default)' : '';
                const name = w.walletName ? ` "${w.walletName}"` : '';
                const date = new Date(w.createdAt * 1000).toLocaleDateString();
                return `${i + 1}. ID:${w.id}${name} — ${w.address}${star} (created ${date})`;
            });
            return `> IMPORTANT INSTRUCTION: Present this list of trading wallets naturally to the user in their language.\n\n` + lines.join('\n');
        } catch (error) {
            return `❌ Error listing wallets: ${error.message}`;
        }
    },

    async get_specific_token_balances(args) {
        try {
            const data = await onchainos.getSpecificTokenBalances(args.address, args.tokens);
            if (!data || !Array.isArray(data) || data.length === 0) return 'No token balances found.';
            const lines = data.map((b, i) => {
                const sym = b.tokenSymbol || b.symbol || '?';
                const bal = Number(b.balance || b.holdingAmount || 0);
                const price = Number(b.tokenPrice || b.price || 0);
                const usd = bal * price;
                return `${i + 1}. ${sym}: ${bal.toLocaleString('en-US', { maximumFractionDigits: 6 })} ($${usd.toFixed(2)})`;
            });
            return `💰 Token Balances for ${args.address.slice(0, 8)}...:\n\n${lines.join('\n')}`;
        } catch (error) {
            return `❌ Error fetching specific balances: ${error.msg || error.message}`;
        }
    },

    async transfer_tokens(args, context) {
        const { dbGet, dbRun } = require('../../../../db/core');
        const ethers = require('ethers');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';
        if (!global._decryptTradingKey) return '❌ Hệ thống chưa sẵn sàng để ký giao dịch.';
        try {
            const wId = parseInt(args.walletId);
            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [wId, userId]);
            if (!tw) return '❌ Không tìm thấy ví.';
            let chainIndex = args.chainIndex || '196';
            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const privateKey = global._decryptTradingKey(tw.encryptedKey);
            const wallet = new ethers.Wallet(privateKey, provider);
            let rawToAddr = (args.toAddress || '').trim();
            // Auto-correct XKO prefix → 0x (AI sometimes generates XKO from X Layer context)
            if (rawToAddr.startsWith('XKO') || rawToAddr.startsWith('xko')) {
                rawToAddr = '0x' + rawToAddr.slice(3);
            }
            if (!rawToAddr || !ethers.isAddress(rawToAddr)) {
                return { displayMessage: `❌ Địa chỉ đích không hợp lệ: <code>${rawToAddr ? rawToAddr.slice(0, 20) + '...' : '(trống)'}</code>`, action: true, success: false };
            }
            const toAddr = rawToAddr.toLowerCase();

            // Self-transfer guard
            if (wallet.address.toLowerCase() === toAddr) {
                return { displayMessage: '❌ Không thể chuyển token cho chính ví của bạn.', action: true, success: false };
            }

            let tokenAddr = args.tokenAddress ? args.tokenAddress.trim() : 'native';
            // Auto-correct XKO prefix → 0x for tokenAddress too
            if (tokenAddr.startsWith('XKO') || tokenAddr.startsWith('xko')) {
                tokenAddr = '0x' + tokenAddr.slice(3);
            }
            tokenAddr = tokenAddr.toLowerCase();

            if (tokenAddr && !tokenAddr.startsWith('0x') && tokenAddr.length < 20 && tokenAddr !== 'native') {
                const { autoResolveToken } = require('./helpers');
                const resolved = await autoResolveToken(tokenAddr, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error, action: true, success: false };
                tokenAddr = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }

            const isNative = !tokenAddr || tokenAddr === 'native' || tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

            // Correct native chain symbol mapping
            const chainNativeSymbol = { '1': 'ETH', '56': 'BNB', '196': 'OKB', '137': 'POL', '42161': 'ETH', '8453': 'ETH', '501': 'SOL' };

            let txHash, gasUsed = '0', gasFeeEth = '0';
            let balBeforeSrc = '0', balBeforeDst = '0', balAfterSrc = '0', balAfterDst = '0';
            const symbol = args.symbol || (isNative ? (chainNativeSymbol[chainIndex] || 'ETH') : 'Token');

            let actualAmount = String(args.amount || '0');

            log.child('TRANSFER').info(`Starting: user=${userId}, wallet=${tw.address}, to=${toAddr}, token=${tokenAddr}, amount=${actualAmount}`);

            if (isNative) {
                const rawBalance = await provider.getBalance(wallet.address);
                balBeforeSrc = ethers.formatEther(rawBalance);
                balBeforeDst = ethers.formatEther(await provider.getBalance(toAddr));

                const feeData = await provider.getFeeData();

                // Support "max"/"all" amount
                if (actualAmount.toLowerCase() === 'max' || actualAmount.toLowerCase() === 'all') {
                    // Dynamic gas estimation
                    let estimatedGas;
                    try {
                        estimatedGas = await provider.estimateGas({ from: wallet.address, to: toAddr, value: rawBalance / 2n });
                    } catch (e) { estimatedGas = 21000n; }
                    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits('1', 'gwei');
                    const gasCost = (estimatedGas * 120n / 100n) * gasPrice; // 20% buffer
                    const maxValue = rawBalance - gasCost;
                    if (maxValue <= 0n) {
                        return { displayMessage: `❌ Số dư không đủ để trả phí gas. Số dư: ${ethers.formatEther(rawBalance)} ${symbol}`, action: true, success: false };
                    }
                    actualAmount = ethers.formatEther(maxValue);
                }

                // Balance pre-check
                const amountWei = ethers.parseEther(actualAmount);
                if (amountWei > rawBalance) {
                    return { displayMessage: `❌ Số dư không đủ: ${Number(balBeforeSrc).toFixed(4)} ${symbol}`, action: true, success: false };
                }

                const txOptions = { to: toAddr, value: amountWei };
                if (feeData.maxFeePerGas) {
                    // EIP-1559 supported
                    txOptions.maxFeePerGas = feeData.maxFeePerGas;
                    txOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
                } else if (feeData.gasPrice) {
                    txOptions.gasPrice = feeData.gasPrice;
                }
                // Enhancement #1: Retry for RPC failures
                const tx = await rpcRetry(() => wallet.sendTransaction(txOptions), 3, 'TRANSFER');
                // Receipt retry: fallback to provider.waitForTransaction if tx.wait() fails
                let receipt;
                try {
                    receipt = await tx.wait();
                } catch (waitErr) {
                    log.child('TRANSFER').warn(`tx.wait() failed for ${tx.hash}, retrying via provider...`);
                    receipt = await provider.waitForTransaction(tx.hash, 1, 60000);
                }

                txHash = receipt.hash;
                gasUsed = receipt.gasUsed?.toString() || '0';
                if (receipt.gasUsed && receipt.gasPrice) {
                    gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                }
                // Revert detection: TX mined but failed on-chain
                if (receipt.status === 0) {
                    return { displayMessage: `❌ TX đã mine nhưng revert on-chain. Gas đã mất: ${gasFeeEth} native. Hash: <code>${txHash}</code>`, action: true, success: false };
                }

                balAfterSrc = ethers.formatEther(await provider.getBalance(wallet.address));
                balAfterDst = ethers.formatEther(await provider.getBalance(toAddr));

            } else {
                const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function balanceOf(address account) view returns (uint256)'];
                const contract = new ethers.Contract(tokenAddr, erc20Abi, wallet);

                let decimals = 18;
                try {
                    decimals = await contract.decimals();
                } catch (decErr) {
                    log.child('TRANSFER').error('Could not fetch decimals, falling back to 18:', decErr.message);
                }

                let rawBalance;
                try {
                    rawBalance = await contract.balanceOf(wallet.address);
                    balBeforeSrc = ethers.formatUnits(rawBalance, decimals);
                    balBeforeDst = ethers.formatUnits(await contract.balanceOf(toAddr), decimals);
                } catch (balErr) {
                    return `❌ Lỗi: Không thể lấy số dư. Có thể địa chỉ token (${tokenAddr}) không hợp lệ trên mạng lưới này.`;
                }

                // Support "max"/"all" amount for ERC-20
                if (actualAmount.toLowerCase() === 'max' || actualAmount.toLowerCase() === 'all') {
                    if (rawBalance === 0n) {
                        return { displayMessage: `❌ Số dư token = 0 ${symbol}`, action: true, success: false };
                    }
                    actualAmount = ethers.formatUnits(rawBalance, decimals);
                }

                // Balance pre-check
                const amountWei = ethers.parseUnits(actualAmount, decimals);
                if (amountWei > rawBalance) {
                    return { displayMessage: `❌ Số dư không đủ: ${Number(balBeforeSrc).toFixed(4)} ${symbol}`, action: true, success: false };
                }

                const tx = await rpcRetry(() => contract.transfer(toAddr, amountWei), 3, 'TRANSFER-ERC20');
                // Receipt retry for ERC-20
                let receipt;
                try {
                    receipt = await tx.wait();
                } catch (waitErr) {
                    log.child('TRANSFER').warn(`tx.wait() failed for ${tx.hash}, retrying via provider...`);
                    receipt = await provider.waitForTransaction(tx.hash, 1, 60000);
                }

                txHash = receipt.hash;
                gasUsed = receipt.gasUsed?.toString() || '0';
                if (receipt.gasUsed && receipt.gasPrice) {
                    gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                }

                balAfterSrc = ethers.formatUnits(await contract.balanceOf(wallet.address), decimals);
                balAfterDst = ethers.formatUnits(await contract.balanceOf(toAddr), decimals);
                // Revert detection for ERC-20
                if (receipt.status === 0) {
                    return { displayMessage: `❌ TX đã mine nhưng revert on-chain. Gas đã mất: ${gasFeeEth} native. Hash: <code>${txHash}</code>`, action: true, success: false };
                }
            }

            // Record tx history
            try {
                await dbRun('INSERT INTO wallet_tx_history (userId, walletId, walletAddress, type, chainIndex, fromToken, toToken, fromAmount, toAmount, fromSymbol, toSymbol, txHash, gasUsed, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [userId, wId, tw.address, 'transfer_out', chainIndex, tokenAddr, toAddr, actualAmount, actualAmount, symbol, symbol, txHash, gasUsed, Math.floor(Date.now() / 1000)]);
            } catch (dbErr) { log.child('TRANSFER').error('DB log error:', dbErr.message); }

            const explorer = _getExplorerUrl(chainIndex);
            log.child('TRANSFER').info(`Success: tx=${txHash}`);

            // Use user's DB-stored language preference (reliable even for short prompts like "ok")
            let lang = context?.lang || 'en';
            try {
                const { getLang } = require('../../../app/language');
                if (context?.msg) lang = await getLang(context.msg);
            } catch (e) { /* fallback to context.lang */ }
            let title = 'TRANSFER SUCCESS';
            let fromLabel = 'From:';
            let toLabel = 'To:';
            let networkLabel = 'Network:';
            let gasLabel = 'Gas Fee:';
            let detailsLabel = 'ASSET DETAILS:';
            let senderLabel = 'Sender:';
            let receiverLabel = 'Receiver:';
            let amountLabel = 'Amount:';
            let linkLabel = 'View on Explorer';

            if (lang === 'vi') {
                title = 'GIAO DỊCH THÀNH CÔNG';
                fromLabel = 'Từ ví:';
                toLabel = 'Đến ví:';
                networkLabel = 'Mạng lưới:';
                gasLabel = 'Phí Gas:';
                detailsLabel = 'CHI TIẾT TÀI SẢN:';
                senderLabel = 'Ví gửi:';
                receiverLabel = 'Ví nhận:';
                amountLabel = 'Lượng chuyển:';
                linkLabel = 'Xem trên Explorer';
            } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
                title = '转账成功';
                fromLabel = '转出钱包:';
                toLabel = '转入钱包:';
                networkLabel = '网络:';
                gasLabel = 'Gas 费用:';
                detailsLabel = '资产详情:';
                senderLabel = '发送方:';
                receiverLabel = '接收方:';
                amountLabel = '转账金额:';
                linkLabel = '在区块链浏览器上查看';
            }

            // Format beautiful standard output (Telegram HTML friendly)
            const report = `🟢 <b>${title}</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📤 <b>${fromLabel}</b> <code>${tw.address}</code>\n` +
                `📥 <b>${toLabel}</b> <code>${toAddr}</code>\n` +
                `🌐 <b>${networkLabel}</b> ID ${chainIndex}\n` +
                `⛽ <b>${gasLabel}</b> ${Number(gasFeeEth).toFixed(6)} native\n\n` +
                `<b>${detailsLabel}</b>\n` +
                `➖ ${senderLabel} ${Number(balBeforeSrc).toFixed(2)} → ${Number(balAfterSrc).toFixed(2)} ${symbol}\n` +
                `➕ ${receiverLabel} ${Number(balBeforeDst).toFixed(2)} → ${Number(balAfterDst).toFixed(2)} ${symbol}\n` +
                `💰 ${amountLabel} <b>${actualAmount} ${symbol}</b>\n\n` +
                `🔗 <a href="${explorer}/tx/${txHash}">${linkLabel}</a>`;

            return { success: true, action: true, displayMessage: report };
        } catch (error) {
            log.child('TRANSFER').error('Error:', error.message);
            let errLang = context?.lang || 'en';
            try {
                const { getLang } = require('../../../app/language');
                if (context?.msg) errLang = await getLang(context.msg);
            } catch (e) { /* fallback */ }
            const errorMsg = errLang === 'vi' ? 'Lỗi chuyển token:' : (errLang === 'zh' || errLang === 'zh-cn' ? '转账失败:' : 'Token transfer error:');
            return { success: false, action: true, displayMessage: `❌ ${errorMsg} ${error.message?.slice(0, 150)}` };
        }
    },

    async batch_transfer(args, context) {
        const { dbGet, dbRun, dbAll } = require('../../../../db/core');
        const ethers = require('ethers');
        const userId = context?.userId;
        if (!userId) {
            const noUserTexts = { en: 'Cannot identify user.', vi: 'Không xác định được người dùng.', zh: '无法识别用户。', ko: '사용자를 확인할 수 없습니다.', ru: 'Не удалось определить пользователя.', id: 'Tidak dapat mengidentifikasi pengguna.' };
            const errLk = context?.lang || 'en';
            return `❌ ${noUserTexts[errLk] || noUserTexts.en}`;
        }
        if (!global._decryptTradingKey) {
            const notReadyTexts = { en: 'System not ready to sign transactions.', vi: 'Hệ thống chưa sẵn sàng để ký giao dịch.', zh: '系统尚未准备好签署交易。', ko: '시스템이 거래 서명 준비가 되지 않았습니다.', ru: 'Система не готова подписывать транзакции.', id: 'Sistem belum siap untuk menandatangani transaksi.' };
            const errLk = context?.lang || 'en';
            return `❌ ${notReadyTexts[errLk] || notReadyTexts.en}`;
        }

        // #2: Batch size limit to prevent runaway execution
        const MAX_BATCH_SIZE = 50;
        let transfers = args.transfers || [];
        if (transfers.length === 0) return '❌ Danh sách chuyển trống.';
        if (transfers.length > MAX_BATCH_SIZE) {
            return { displayMessage: `❌ Batch quá lớn: ${transfers.length} items. Tối đa ${MAX_BATCH_SIZE} transfers mỗi lần.`, action: true, success: false };
        }
        const chainIndex = args.chainIndex || '196';
        const rpcUrl = _getChainRpc(chainIndex);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        let tokenAddr = args.tokenAddress ? args.tokenAddress.trim() : 'native';
        // Auto-correct XKO prefix → 0x for tokenAddress too
        if (tokenAddr.startsWith('XKO') || tokenAddr.startsWith('xko')) {
            tokenAddr = '0x' + tokenAddr.slice(3);
        }
        tokenAddr = tokenAddr.toLowerCase();

        if (tokenAddr && !tokenAddr.startsWith('0x') && tokenAddr.length < 20 && tokenAddr !== 'native') {
            const { autoResolveToken } = require('./helpers');
            const resolved = await autoResolveToken(tokenAddr, chainIndex);
            if (resolved.error) return { displayMessage: resolved.error, action: true, success: false };
            tokenAddr = resolved.tokenAddress;
        }

        const isNative = !tokenAddr || tokenAddr === 'native' || tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

        // #4: Correct native chain symbol mapping
        const chainNativeSymbol = { '1': 'ETH', '56': 'BNB', '196': 'OKB', '137': 'POL', '42161': 'ETH', '8453': 'ETH', '501': 'SOL' };

        // Resolve ERC-20 symbol early so reports show real name (e.g. "BANMAO") instead of "Token"
        let symbol = args.symbol || (isNative ? (chainNativeSymbol[chainIndex] || 'ETH') : 'Token');
        let tokenDecimals = 18;
        if (!isNative && tokenAddr) {
            try {
                const erc20Meta = new ethers.Contract(tokenAddr, ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'], provider);
                const [resolvedSymbol, resolvedDecimals] = await Promise.all([
                    erc20Meta.symbol().catch(() => symbol),
                    erc20Meta.decimals().catch(() => 18)
                ]);
                symbol = resolvedSymbol || symbol;
                tokenDecimals = Number(resolvedDecimals);
            } catch (e) {
                log.child('BATCHTRANSFER').warn('Could not resolve token metadata:', e.message);
            }
        }

        const results = [];
        let totalGasEth = 0;
        let totalSent = 0; // #5: Track total tokens sent

        // Resolve language early for progress messages
        let lang = context?.lang || 'en';
        try {
            const { getLang } = require('../../../app/language');
            if (context?.msg) lang = await getLang(context.msg);
        } catch (e) { /* fallback */ }

        const progressTexts = {
            en: 'Processing batch transfer',
            vi: 'Đang xử lý chuyển tiền hàng loạt',
            zh: '正在处理批量转账',
            ko: '일괄 전송 처리 중',
            ru: 'Обработка массовой отправки',
            id: 'Memproses transfer massal'
        };
        const invalidAddrTexts = {
            en: 'Invalid address',
            vi: 'Địa chỉ không hợp lệ',
            zh: '无效地址',
            ko: '잘못된 주소',
            ru: 'Неверный адрес',
            id: 'Alamat tidak valid'
        };
        const emptyText = { en: '(empty)', vi: '(trống)', zh: '(空)', ko: '(비어있음)', ru: '(пусто)', id: '(kosong)' };
        const walletNotFoundTexts = { en: 'Wallet does not exist', vi: 'Ví không tồn tại', zh: '钱包不存在', ko: '지갑이 존재하지 않습니다', ru: 'Кошелёк не найден', id: 'Dompet tidak ada' };
        const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');

        // Detect duplicate destination addresses (likely user error)
        const destAddrs = transfers.map(t => (t.toAddress || '').trim().toLowerCase()).filter(Boolean);
        const duplicates = destAddrs.filter((addr, i) => destAddrs.indexOf(addr) !== i);
        if (duplicates.length > 0) {
            const uniqueDups = [...new Set(duplicates)];
            const dupWarnTexts = {
                en: 'Duplicate destination addresses detected',
                vi: 'Phát hiện địa chỉ đích bị trùng lặp',
                zh: '检测到重复的目标地址',
                ko: '중복된 대상 주소가 감지되었습니다',
                ru: 'Обнаружены дублирующиеся адреса',
                id: 'Alamat tujuan duplikat terdeteksi'
            };
            log.child('BATCHTRANSFER').warn(`Duplicate addresses: ${uniqueDups.join(', ')}`);
            results.push({
                wallet: '⚠️',
                to: uniqueDups.join(', '),
                status: `⚠️ ${dupWarnTexts[lk]}: ${uniqueDups.length} addr(s)`,
                amount: '-'
            });
        }

        // Pre-validate all destination addresses
        for (const t of transfers) {
            // Auto-correct XKO prefix → 0x
            if (t.toAddress && (t.toAddress.startsWith('XKO') || t.toAddress.startsWith('xko'))) {
                t.toAddress = '0x' + t.toAddress.slice(3);
            }
            const addr = (t.toAddress || '').trim();
            if (!addr || !ethers.isAddress(addr)) {
                results.push({
                    wallet: `#${t.fromWalletId}`,
                    to: addr || emptyText[lk],
                    status: `❌ ${invalidAddrTexts[lk]}: ${addr || emptyText[lk]}`,
                    amount: t.amount
                });
            }
        }
        // Filter out invalid transfers
        const validTransfers = transfers.filter(t => {
            const addr = (t.toAddress || '').trim();
            return addr && ethers.isAddress(addr);
        });

        // Progress notification helper for large batches
        let bot = null;
        const chatId = context?.chatId || context?.msg?.chat?.id;
        try { bot = require('../../../core/bot'); } catch (e) { /* no bot available */ }

        // ── Inline Confirm + Cancel Mechanism ──
        // Pending batch confirmations stored globally for callback_query handler
        if (!global._batchTransferPending) global._batchTransferPending = new Map();
        if (!global._batchTransferCancel) global._batchTransferCancel = new Map();

        const batchId = `bt_${userId}_${Date.now()}`;
        const cancelledTexts = {
            en: 'Batch transfer cancelled by user.',
            vi: 'Chuyển tiền hàng loạt đã bị hủy bởi người dùng.',
            zh: '批量转账已被用户取消。',
            ko: '일괄 전송이 사용자에 의해 취소되었습니다.',
            ru: 'Массовая отправка отменена пользователем.',
            id: 'Transfer massal dibatalkan oleh pengguna.'
        };

        if (validTransfers.length > 5 && bot && chatId) {
            const totalAmount = validTransfers.reduce((sum, t) => {
                const a = String(t.amount || '0').toLowerCase();
                return (a === 'max' || a === 'all') ? sum : sum + Number(a || 0);
            }, 0);

            // #5: Pre-batch gas estimation
            let gasEstimateStr = '';
            try {
                const feeData = await provider.getFeeData();
                const gasPerTx = isNative ? 21000n : 65000n;
                const totalGas = gasPerTx * BigInt(validTransfers.length);
                const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits('1', 'gwei');
                const totalGasCost = totalGas * gasPrice * 130n / 100n;
                const gasCostStr = Number(ethers.formatEther(totalGasCost)).toFixed(6);
                const firstWalletId = validTransfers[0]?.fromWalletId;
                const firstCached = await getCachedWallet(firstWalletId);
                if (firstCached) {
                    const nativeBal = await provider.getBalance(firstCached.wallet.address);
                    const gasWarnTexts = { en: '⚠️ Insufficient gas!', vi: '⚠️ Không đủ gas!', zh: '⚠️ Gas不足!', ko: '⚠️ 가스 부족!', ru: '⚠️ Недостаточно газа!', id: '⚠️ Gas không đủ!' };
                    if (nativeBal < totalGasCost) {
                        gasEstimateStr = `\n${gasWarnTexts[lk] || gasWarnTexts.en} (${gasCostStr} native)`;
                    } else {
                        gasEstimateStr = `\n⛽ Est. gas: ~${gasCostStr} native`;
                    }
                }
            } catch (e) { /* gas estimation is best-effort */ }

            const confirmTexts = {
                en: `📋 <b>Batch Transfer Confirmation</b>\n━━━━━━━━━━━━━━━━━━\n📊 ${validTransfers.length} transfers\n🪙 Token: <b>${symbol}</b>\n🌐 Chain: #${chainIndex}\n💰 Est. Total: ~${totalAmount.toFixed(4)} ${symbol}${gasEstimateStr}\n\n⬇️ Press to confirm or cancel:`,
                vi: `📋 <b>Xác nhận chuyển tiền hàng loạt</b>\n━━━━━━━━━━━━━━━━━━\n📊 ${validTransfers.length} giao dịch\n🪙 Token: <b>${symbol}</b>\n🌐 Chain: #${chainIndex}\n💰 Ước tính: ~${totalAmount.toFixed(4)} ${symbol}${gasEstimateStr}\n\n⬇️ Nhấn để xác nhận hoặc hủy:`,
                zh: `📋 <b>确认批量转账</b>\n━━━━━━━━━━━━━━━━━━\n📊 ${validTransfers.length} 笔交易\n🪙 代币: <b>${symbol}</b>\n🌐 链: #${chainIndex}\n💰 预估: ~${totalAmount.toFixed(4)} ${symbol}${gasEstimateStr}\n\n⬇️ 按下确认或取消:`,
                ko: `📋 <b>일괄 전송 확인</b>\n━━━━━━━━━━━━━━━━━━\n📊 ${validTransfers.length}건\n🪙 토큰: <b>${symbol}</b>\n🌐 체인: #${chainIndex}\n💰 예상: ~${totalAmount.toFixed(4)} ${symbol}${gasEstimateStr}\n\n⬇️ 확인 또는 취소:`,
                ru: `📋 <b>Подтверждение массовой отправки</b>\n━━━━━━━━━━━━━━━━━━\n📊 ${validTransfers.length} транзакций\n🪙 Токен: <b>${symbol}</b>\n🌐 Сеть: #${chainIndex}\n💰 Оценка: ~${totalAmount.toFixed(4)} ${symbol}${gasEstimateStr}\n\n⬇️ Нажмите для подтверждения или отмены:`,
                id: `📋 <b>Konfirmasi Transfer Massal</b>\n━━━━━━━━━━━━━━━━━━\n📊 ${validTransfers.length} transaksi\n🪙 Token: <b>${symbol}</b>\n🌐 Chain: #${chainIndex}\n💰 Estimasi: ~${totalAmount.toFixed(4)} ${symbol}${gasEstimateStr}\n\n⬇️ Tekan untuk konfirmasi atau batal:`
            };
            const btnTexts = {
                en: { confirm: '✅ Confirm', cancel: '❌ Cancel' },
                vi: { confirm: '✅ Xác nhận', cancel: '❌ Hủy bỏ' },
                zh: { confirm: '✅ 确认', cancel: '❌ 取消' },
                ko: { confirm: '✅ 확인', cancel: '❌ 취소' },
                ru: { confirm: '✅ Подтвердить', cancel: '❌ Отменить' },
                id: { confirm: '✅ Konfirmasi', cancel: '❌ Batal' }
            };
            const btns = btnTexts[lk] || btnTexts.en;

            try {
                // Send confirmation with inline buttons
                await bot.sendMessage(chatId, confirmTexts[lk] || confirmTexts.en, {
                    parse_mode: 'HTML',
                    disable_notification: true,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: btns.confirm, callback_data: `batchconfirm|confirm_${batchId}` },
                            { text: btns.cancel, callback_data: `batchconfirm|cancel_${batchId}` }
                        ]]
                    }
                });

                // Wait for confirmation (60s timeout, auto-proceed)
                const confirmed = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        global._batchTransferPending.delete(batchId);
                        resolve('timeout');
                    }, 60000);
                    global._batchTransferPending.set(batchId, (action) => {
                        clearTimeout(timeout);
                        global._batchTransferPending.delete(batchId);
                        resolve(action);
                    });
                });

                if (confirmed === 'cancel') {
                    return { displayMessage: `❌ ${cancelledTexts[lk] || cancelledTexts.en}`, action: true, success: false };
                }
                // 'confirm' or 'timeout' → proceed
                // Send a small cancel button that stays visible during execution
                const cancelMidBtnTexts = {
                    en: '⛔ Cancel Batch', vi: '⛔ Hủy Batch',
                    zh: '⛔ 取消批量', ko: '⛔ 배치 취소',
                    ru: '⛔ Отменить', id: '⛔ Batalkan'
                };
                const runningTexts = {
                    en: '🔄 Batch running...', vi: '🔄 Đang chạy batch...',
                    zh: '🔄 批量执行中...', ko: '🔄 배치 실행중...',
                    ru: '🔄 Выполнение...', id: '🔄 Batch berjalan...'
                };
                try {
                    await bot.sendMessage(chatId, runningTexts[lk] || runningTexts.en, {
                        disable_notification: true,
                        reply_markup: { inline_keyboard: [[
                            { text: cancelMidBtnTexts[lk] || cancelMidBtnTexts.en, callback_data: `batchconfirm|cancel_${batchId}` }
                        ]] }
                    });
                } catch (e) { /* ignore */ }
            } catch (e) {
                // If button send fails, just proceed
                log.child('BATCHTRANSFER').warn('Confirm button send failed, proceeding:', e.message);
            }
        }

        // cancelMidBtnTexts hoisted for use in both confirm block and progress bar
        const cancelMidBtnTexts = {
            en: '⛔ Stop Batch', vi: '⛔ Dừng Batch',
            zh: '⛔ 停止批量', ko: '⛔ 배치 중지',
            ru: '⛔ Остановить', id: '⛔ Hentikan'
        };
        let processedCount = 0;
        let progressMsgId = null; // Track progress bar message for editing
        const batchStartTime = Date.now();

        // 🚀 Send immediate "Starting batch" message so user sees progress right away
        if (bot && chatId && validTransfers.length > 0) {
            const startTexts = {
                en: `🚀 <b>Starting batch transfer...</b>\n📊 ${validTransfers.length} transfers | 🪙 ${symbol}\n[░░░░░░░░░░] 0/${validTransfers.length}`,
                vi: `🚀 <b>Bắt đầu chuyển hàng loạt...</b>\n📊 ${validTransfers.length} giao dịch | 🪙 ${symbol}\n[░░░░░░░░░░] 0/${validTransfers.length}`,
                zh: `🚀 <b>开始批量转账...</b>\n📊 ${validTransfers.length} 笔 | 🪙 ${symbol}\n[░░░░░░░░░░] 0/${validTransfers.length}`,
                ko: `🚀 <b>일괄 전송 시작...</b>\n📊 ${validTransfers.length}건 | 🪙 ${symbol}\n[░░░░░░░░░░] 0/${validTransfers.length}`,
                ru: `🚀 <b>Начало массовой отправки...</b>\n📊 ${validTransfers.length} транзакций | 🪙 ${symbol}\n[░░░░░░░░░░] 0/${validTransfers.length}`,
                id: `🚀 <b>Memulai transfer massal...</b>\n📊 ${validTransfers.length} transaksi | 🪙 ${symbol}\n[░░░░░░░░░░] 0/${validTransfers.length}`
            };
            try {
                const startMsg = await bot.sendMessage(chatId, startTexts[lk] || startTexts.en, {
                    parse_mode: 'HTML',
                    disable_notification: true,
                    reply_markup: validTransfers.length > 3 ? { inline_keyboard: [[
                        { text: cancelMidBtnTexts[lk] || cancelMidBtnTexts.en, callback_data: `batchconfirm|cancel_${batchId}` }
                    ]] } : undefined
                });
                if (startMsg) progressMsgId = startMsg.message_id;
            } catch (e) { /* ignore */ }
        }

// #3: Wallet cache to avoid repeated DB queries and key decryption
        const walletCache = new Map();
        async function getCachedWallet(walletId) {
            // Resolve "default" or invalid walletId to user's actual default wallet
            let resolvedId = walletId;
            if (String(walletId).toLowerCase() === 'default' || !walletId || isNaN(parseInt(walletId))) {
                const defaultWallet = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                if (!defaultWallet) {
                    const firstWallet = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? ORDER BY createdAt ASC LIMIT 1', [userId]);
                    if (!firstWallet) return null;
                    resolvedId = firstWallet.id;
                } else {
                    resolvedId = defaultWallet.id;
                }
            } else {
                resolvedId = parseInt(walletId);
            }
            if (walletCache.has(resolvedId)) return walletCache.get(resolvedId);
            const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [resolvedId, userId]);
            if (!tw) return null;
            const privateKey = global._decryptTradingKey(tw.encryptedKey);
            const wallet = new ethers.Wallet(privateKey, provider);
            const cached = { tw, wallet };
            walletCache.set(resolvedId, cached);
            return cached;
        }

        const selfTransferTexts = {
            en: 'Cannot transfer to own wallet',
            vi: 'Không thể chuyển cho chính ví mình',
            zh: '不能转账给自己的钱包',
            ko: '자신의 지갑으로 전송할 수 없습니다',
            ru: 'Нельзя переводить на свой кошелёк',
            id: 'Tidak bisa transfer ke dompet sendiri'
        };
        const insufficientTexts = {
            en: 'Insufficient balance',
            vi: 'Số dư không đủ',
            zh: '余额不足',
            ko: '잔액 부족',
            ru: 'Недостаточный баланс',
            id: 'Saldo tidak cukup'
        };
        const revertTexts = {
            en: 'TX mined but reverted on-chain',
            vi: 'TX đã mine nhưng revert on-chain',
            zh: '交易已打包但链上回滚',
            ko: 'TX가 채굴되었지만 온체인에서 되돌림',
            ru: 'TX добыта, но откатилась на чейне',
            id: 'TX sudah dimining tapi revert on-chain'
        };

        // #2: Whitelist check — warn if destination addresses are not whitelisted
        const whitelistedAddrs = new Set();
        try {
            const whitelist = await dbAll('SELECT address FROM wallet_whitelist WHERE userId = ?', [userId]);
            whitelist.forEach(w => whitelistedAddrs.add(w.address.toLowerCase()));
        } catch (e) { /* whitelist table may not exist yet */ }

        if (whitelistedAddrs.size > 0) {
            const nonWhitelisted = validTransfers.filter(t => !whitelistedAddrs.has((t.toAddress || '').trim().toLowerCase()));
            if (nonWhitelisted.length > 0) {
                const warnTexts = {
                    en: 'addresses not in whitelist',
                    vi: 'địa chỉ không trong whitelist',
                    zh: '地址不在白名单中',
                    ko: '화이트리스트에 없는 주소',
                    ru: 'адреса не в белом списке',
                    id: 'alamat tidak ada di whitelist'
                };
                results.push({
                    wallet: '⚠️',
                    to: `${nonWhitelisted.length} addr(s)`,
                    status: `⚠️ ${nonWhitelisted.length} ${warnTexts[lk] || warnTexts.en}`,
                    amount: '-'
                });
                log.child('BATCHTRANSFER').warn(`${nonWhitelisted.length} destination addresses not in whitelist`);
            }
        }

        for (const t of validTransfers) {
            try {
                // Cancel signal check — stop if user cancelled mid-batch
                if (global._batchTransferCancel?.get(batchId)) {
                    const cancelMidTexts = {
                        en: 'Cancelled mid-batch',
                        vi: 'Đã hủy giữa chừng',
                        zh: '已中途取消',
                        ko: '중간에 취소됨',
                        ru: 'Отменено на полпути',
                        id: 'Dibatalkan di tengah proses'
                    };
                    results.push({ wallet: '⛔', to: '-', amount: '-', status: `⛔ ${cancelMidTexts[lk] || cancelMidTexts.en} (${processedCount}/${validTransfers.length})` });
                    global._batchTransferCancel.delete(batchId);
                    break;
                }

                // #3: Use cached wallet objects
                const cachedWallet = await getCachedWallet(t.fromWalletId);
                if (!cachedWallet) { results.push({ wallet: t.fromWalletId, status: `❌ ${walletNotFoundTexts[lk]}` }); continue; }
                const { tw, wallet } = cachedWallet;
                const destAddr = t.toAddress.trim().toLowerCase();

                // Self-transfer guard
                if (wallet.address.toLowerCase() === destAddr) {
                    results.push({
                        wallet: `#${t.fromWalletId}`,
                        to: destAddr,
                        amount: t.amount,
                        status: `❌ ${selfTransferTexts[lk]}`
                    });
                    continue;
                }

                let txHash, balBeforeSrc = '0', balAfterSrc = '0', gasFeeEth = '0';
                let actualAmount = String(t.amount || '0');

                if (isNative) {
                    const rawBalance = await provider.getBalance(wallet.address);
                    balBeforeSrc = ethers.formatEther(rawBalance);

                    // Support "max" amount: transfer entire balance minus gas reserve
                    const feeData = await provider.getFeeData();
                    if (actualAmount.toLowerCase() === 'max' || actualAmount.toLowerCase() === 'all') {
                        // #2: Dynamic gas estimation
                        let estimatedGas;
                        try {
                            estimatedGas = await provider.estimateGas({ from: wallet.address, to: destAddr, value: rawBalance / 2n });
                        } catch (e) { estimatedGas = 21000n; }
                        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits('1', 'gwei');
                        const gasCost = (estimatedGas * 120n / 100n) * gasPrice; // 20% buffer
                        const maxValue = rawBalance - gasCost;
                        if (maxValue <= 0n) {
                            results.push({
                                wallet: `#${t.fromWalletId}`,
                                to: destAddr,
                                amount: 'max',
                                status: `❌ ${insufficientTexts[lk]} (gas)`
                            });
                            continue;
                        }
                        actualAmount = ethers.formatEther(maxValue);
                    }

                    // Balance pre-check
                    const amountWei = ethers.parseEther(actualAmount);
                    if (amountWei > rawBalance) {
                        results.push({
                            wallet: `#${t.fromWalletId}`,
                            to: destAddr,
                            amount: actualAmount,
                            status: `❌ ${insufficientTexts[lk]}: ${Number(balBeforeSrc).toFixed(4)} ${symbol}`
                        });
                        continue;
                    }

                    const txOpts = { to: destAddr, value: amountWei };
                    if (feeData.maxFeePerGas) {
                        txOpts.maxFeePerGas = feeData.maxFeePerGas;
                        txOpts.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
                    } else if (feeData.gasPrice) {
                        txOpts.gasPrice = feeData.gasPrice;
                    }
                    const tx = await rpcRetry(() => wallet.sendTransaction(txOpts), 3, 'BATCH-TRANSFER');
                    // #3: Receipt retry — if tx.wait() fails, fallback to provider.waitForTransaction
                    let receipt;
                    try {
                        receipt = await tx.wait();
                    } catch (waitErr) {
                        log.child('BATCHTRANSFER').warn(`tx.wait() failed for ${tx.hash}, retrying via provider...`);
                        receipt = await provider.waitForTransaction(tx.hash, 1, 60000);
                    }
                    txHash = receipt.hash;
                    if (receipt.gasUsed && receipt.gasPrice) gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                    // Revert detection
                    if (receipt.status === 0) {
                        results.push({
                            wallet: `#${t.fromWalletId}`,
                            to: destAddr,
                            amount: actualAmount,
                            status: `❌ ${revertTexts[lk]}`,
                            txHash: txHash
                        });
                        totalGasEth += Number(gasFeeEth);
                        continue;
                    }
                    balAfterSrc = ethers.formatEther(await provider.getBalance(wallet.address));
                } else {
                    const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)', 'function decimals() view returns (uint8)', 'function balanceOf(address account) view returns (uint256)'];
                    const contract = new ethers.Contract(tokenAddr, erc20Abi, wallet);
                    const decimals = tokenDecimals;

                    const rawBalance = await contract.balanceOf(wallet.address);
                    balBeforeSrc = ethers.formatUnits(rawBalance, decimals);

                    // Support "max" amount for ERC-20
                    if (actualAmount.toLowerCase() === 'max' || actualAmount.toLowerCase() === 'all') {
                        if (rawBalance === 0n) {
                            results.push({
                                wallet: `#${t.fromWalletId}`,
                                to: destAddr,
                                amount: 'max',
                                status: `❌ ${insufficientTexts[lk]}: 0 ${symbol}`
                            });
                            continue;
                        }
                        actualAmount = ethers.formatUnits(rawBalance, decimals);
                    }

                    // Balance pre-check
                    const amountWei = ethers.parseUnits(actualAmount, decimals);
                    if (amountWei > rawBalance) {
                        results.push({
                            wallet: `#${t.fromWalletId}`,
                            to: destAddr,
                            amount: actualAmount,
                            status: `❌ ${insufficientTexts[lk]}: ${Number(balBeforeSrc).toFixed(4)} ${symbol}`
                        });
                        continue;
                    }

                    const tx = await rpcRetry(() => contract.transfer(destAddr, amountWei), 3, 'BATCH-TRANSFER-ERC20');
                    // #3: Receipt retry for ERC-20
                    let receipt;
                    try {
                        receipt = await tx.wait();
                    } catch (waitErr) {
                        log.child('BATCHTRANSFER').warn(`tx.wait() failed for ${tx.hash}, retrying via provider...`);
                        receipt = await provider.waitForTransaction(tx.hash, 1, 60000);
                    }
                    txHash = receipt.hash;
                    if (receipt.gasUsed && receipt.gasPrice) gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                    // Revert detection for ERC-20
                    if (receipt.status === 0) {
                        results.push({
                            wallet: `#${t.fromWalletId}`,
                            to: destAddr,
                            amount: actualAmount,
                            status: `❌ ${revertTexts[lk]}`,
                            txHash: txHash
                        });
                        totalGasEth += Number(gasFeeEth);
                        continue;
                    }
                    balAfterSrc = ethers.formatUnits(await contract.balanceOf(wallet.address), decimals);
                }

                totalGasEth += Number(gasFeeEth);
                totalSent += Number(actualAmount); // #5

                // #8: Include toAddress in DB history
                try {
                    await dbRun('INSERT INTO wallet_tx_history (userId, walletId, walletAddress, type, chainIndex, fromToken, toToken, fromAmount, toAmount, fromSymbol, toSymbol, txHash, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        [userId, parseInt(t.fromWalletId), tw.address, 'transfer_out', chainIndex, tokenAddr, destAddr, actualAmount, actualAmount, symbol, symbol, txHash, Math.floor(Date.now() / 1000)]);
                } catch (dbErr) { log.child('BATCHTRANSFER').error('DB log error:', dbErr.message); }
                results.push({
                    wallet: `#${t.fromWalletId}`,
                    to: destAddr,
                    amount: actualAmount,
                    status: '✅',
                    txHash: txHash,
                    gas: gasFeeEth,
                    balBefore: Number(balBeforeSrc).toFixed(2),
                    balAfter: Number(balAfterSrc).toFixed(2)
                });
            } catch (e) {
                const isNetworkErr = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|rate.limit|nonce|replacement|underpriced|timeout|502|503|429/i.test(e.message);
                if (isNetworkErr && !(t._retryCount >= 2)) {
                    t._retryCount = (t._retryCount || 0) + 1;
                    const retryDelay = t._retryCount * 2000;
                    log.child('BATCHTRANSFER').warn(`Network error wallet ${t.fromWalletId}, auto-retry #${t._retryCount} in ${retryDelay}ms: ${e.message?.slice(0, 60)}`);
                    await new Promise(r => setTimeout(r, retryDelay));
                    validTransfers.push({ ...t, _retryCount: t._retryCount });
                } else {
                    log.child('BATCHTRANSFER').error(`Error wallet ${t.fromWalletId} → ${t.toAddress}:`, e.message);
                    const destShort = t.toAddress ? ((t.toAddress || "?")) : '?';
                    results.push({
                        wallet: `#${t.fromWalletId}`,
                        to: destShort,
                        amount: t.amount,
                        status: `❌ ${e.message?.slice(0, 60)}${t._retryCount ? ` (after ${t._retryCount} retries)` : ''}`
                    });
                }
            }
            // Visual progress bar for large batches
            processedCount += 1;
            if (bot && chatId && validTransfers.length > 3) {
                const total = validTransfers.length;
                const pct = processedCount / total;
                const barLen = 10;
                const filled = Math.round(pct * barLen);
                const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
                const successSoFar = results.filter(r => r.status === '✅').length;
                const failSoFar = processedCount - successSoFar - (results.filter(r => r.status?.startsWith('⚠️')).length);
                const barTexts = {
                    en: `⏳ <b>Batch Transfer</b>\n[${bar}] ${processedCount}/${total}\n✅ ${successSoFar} ${failSoFar > 0 ? `❌ ${failSoFar}` : ''}`,
                    vi: `⏳ <b>Chuyển hàng loạt</b>\n[${bar}] ${processedCount}/${total}\n✅ ${successSoFar} ${failSoFar > 0 ? `❌ ${failSoFar}` : ''}`,
                    zh: `⏳ <b>批量转账</b>\n[${bar}] ${processedCount}/${total}\n✅ ${successSoFar} ${failSoFar > 0 ? `❌ ${failSoFar}` : ''}`,
                    ko: `⏳ <b>일괄 전송</b>\n[${bar}] ${processedCount}/${total}\n✅ ${successSoFar} ${failSoFar > 0 ? `❌ ${failSoFar}` : ''}`,
                    ru: `⏳ <b>Массовая отправка</b>\n[${bar}] ${processedCount}/${total}\n✅ ${successSoFar} ${failSoFar > 0 ? `❌ ${failSoFar}` : ''}`,
                    id: `⏳ <b>Transfer Massal</b>\n[${bar}] ${processedCount}/${total}\n✅ ${successSoFar} ${failSoFar > 0 ? `❌ ${failSoFar}` : ''}`
                };
                const shouldUpdate = processedCount === 1 || processedCount % 3 === 0 || processedCount === total;
                if (shouldUpdate) {
                    try {
                        if (progressMsgId) {
                            const elapsed = Math.round((Date.now() - batchStartTime) / 1000);
                            const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
                            const barMsg = (barTexts[lk] || barTexts.en) + `\n⏱ ${elapsedStr}`;
                            await bot.editMessageText(barMsg, { chat_id: chatId, message_id: progressMsgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: cancelMidBtnTexts[lk] || cancelMidBtnTexts.en, callback_data: `batchconfirm|cancel_${batchId}` }]] } }).catch(() => { });
                        } else {
                            const elapsed0 = Math.round((Date.now() - batchStartTime) / 1000);
                            const barMsg0 = (barTexts[lk] || barTexts.en) + `\n⏱ ${elapsed0}s`;
                            const pmsg = await bot.sendMessage(chatId, barMsg0, { parse_mode: 'HTML', disable_notification: true, reply_markup: { inline_keyboard: [[{ text: cancelMidBtnTexts[lk] || cancelMidBtnTexts.en, callback_data: `batchconfirm|cancel_${batchId}` }]] } });
                            if (pmsg) progressMsgId = pmsg.message_id;
                        }
                    } catch (e) { /* ignore progress errors */ }
                }
            }

            // #7: Rate limit delay between TXs to avoid RPC throttling
            if (processedCount < validTransfers.length) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Clear wallet cache
        walletCache.clear();

        const successCount = results.filter(r => r.status === '✅').length;

        let headerLabel = 'BATCH TRANSFER RESULTS';
        let successStr = 'success';
        let gasLabel = 'Total Gas Fee:';
        let totalSentLabel = 'Total Sent:';
        let walletLabel = 'Wallet';
        let amountLabel = 'Sent:';
        let balanceLabel = 'Balance:';
        let linkLabel = 'Details';
        let failLabel = 'Failed';
        let tokenLabel = 'Token:';
        let networkLabel = 'Network:';
        let timeLabel = 'Time:';
        let toLabel = 'To:';

        if (lang === 'vi') {
            headerLabel = 'KẾT QUẢ CHUYỂN TIỀN HÀNG LOẠT';
            successStr = 'thành công';
            gasLabel = 'Tổng phí Gas:';
            totalSentLabel = 'Tổng đã chuyển:';
            walletLabel = 'Ví';
            amountLabel = 'Chuyển:';
            balanceLabel = 'Số dư:';
            linkLabel = 'Xem TX';
            failLabel = 'Thất bại';
            tokenLabel = 'Token:';
            networkLabel = 'Mạng:';
            timeLabel = 'Thời gian:';
            toLabel = 'Đến:';
        } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
            headerLabel = '批量转账结果';
            successStr = '成功';
            gasLabel = '总 Gas 费用:';
            totalSentLabel = '总转账:';
            walletLabel = '钱包';
            amountLabel = '转账:';
            balanceLabel = '余额:';
            linkLabel = '查看交易';
            failLabel = '失败';
            tokenLabel = '代币:';
            networkLabel = '网络:';
            timeLabel = '时间:';
            toLabel = '至:';
        } else if (lang === 'ko') {
            headerLabel = '일괄 전송 결과';
            successStr = '성공';
            gasLabel = '총 가스 비용:';
            totalSentLabel = '총 전송:';
            walletLabel = '지갑';
            amountLabel = '전송:';
            balanceLabel = '잔액:';
            linkLabel = 'Tx 확인';
            failLabel = '실패';
            tokenLabel = '토큰:';
            networkLabel = '네트워크:';
            timeLabel = '시간:';
            toLabel = '수신:';
        } else if (lang === 'ru') {
            headerLabel = 'РЕЗУЛЬТАТЫ МАССОВОЙ ОТПРАВКИ';
            successStr = 'успешно';
            gasLabel = 'Общая комиссия:';
            totalSentLabel = 'Всего отправлено:';
            walletLabel = 'Кошелёк';
            amountLabel = 'Отправлено:';
            balanceLabel = 'Баланс:';
            linkLabel = 'Посмотреть Tx';
            failLabel = 'Ошибка';
            tokenLabel = 'Токен:';
            networkLabel = 'Сеть:';
            timeLabel = 'Время:';
            toLabel = 'Кому:';
        } else if (lang === 'id') {
            headerLabel = 'HASIL TRANSFER MASSAL';
            successStr = 'berhasil';
            gasLabel = 'Total Biaya Gas:';
            totalSentLabel = 'Total Terkirim:';
            walletLabel = 'Dompet';
            amountLabel = 'Terkirim:';
            balanceLabel = 'Saldo:';
            linkLabel = 'Lihat Tx';
            failLabel = 'Gagal';
            tokenLabel = 'Token:';
            networkLabel = 'Jaringan:';
            timeLabel = 'Waktu:';
            toLabel = 'Ke:';
        }

        const explorerBase = _getExplorerUrl(chainIndex);
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
        const chainName = chainNames[chainIndex] || `Chain #${chainIndex}`;
        const now = new Date();
        const timeString = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).format(now);


        const elapsedTotal = Math.round((Date.now() - batchStartTime) / 1000);
        const elapsedFmt = elapsedTotal >= 60 ? `${Math.floor(elapsedTotal / 60)}m${elapsedTotal % 60}s` : `${elapsedTotal}s`;
        const successRate = results.length > 0 ? Math.round((successCount / results.length) * 100) : 0;
        const rateEmoji = successRate === 100 ? '🟢' : successRate >= 80 ? '🟡' : '🔴';
        const elapsedLabels = { en: 'Duration:', vi: 'Thời lượng:', zh: '耗时:', ko: '소요시간:', ru: 'Длительность:', id: 'Durasi:' };
        const rateLabels = { en: 'Success rate:', vi: 'Tỉ lệ:', zh: '成功率:', ko: '성공률:', ru: 'Успех:', id: 'Tingkat sukses:' };
        const header = `📦 <b>${headerLabel}</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📊 <b>${successCount}/${results.length}</b> ${successStr}\n` +
            `${rateEmoji} ${rateLabels[lk] || rateLabels.en} <b>${successRate}%</b>\n` +
            `🪙 ${tokenLabel} <b>${symbol}</b>\n` +
            `🌐 ${networkLabel} ${chainName} (#${chainIndex})\n` +
            `💰 <b>${totalSentLabel}</b> ${totalSent.toFixed(6)} ${symbol}\n` +
            `⛽ <b>${gasLabel}</b> ${totalGasEth.toFixed(6)} native\n` +
            `⏱ ${elapsedLabels[lk] || elapsedLabels.en} ${elapsedFmt}\n` +
            `⏰ ${timeLabel} ${timeString} (GMT+7)\n` +
            `━━━━━━━━━━━━━━━━━━`;

        // #8: Load whitelist labels for address book display
        const addrLabels = new Map();
        try {
            const wl = await dbAll('SELECT address, label FROM wallet_whitelist WHERE userId = ?', [userId]);
            wl.forEach(w => { if (w.label) addrLabels.set(w.address.toLowerCase(), w.label); });
        } catch (e) { /* whitelist labels optional */ }

        // Build per-wallet result blocks
        const walletBlocks = [];
        results.forEach(r => {
            if (r.status === '✅') {
                walletBlocks.push(
                    `✅ <b>${walletLabel} ${r.wallet}</b>\n` +
                    `   ${toLabel} <a href="${explorerBase}/address/${r.to}">${r.to}</a>\n` +
                    `   ${amountLabel} <b>${r.amount} ${symbol}</b>\n` +
                    `   ${balanceLabel} ${r.balBefore} → ${r.balAfter}\n` +
                    `   🔗 <a href="${explorerBase}/tx/${r.txHash}">${linkLabel}</a>`
                );
            } else {
                const failDest = r.to ? ` → <a href="${explorerBase}/address/${r.to}">${r.to}</a>` : '';
                const failAmount = r.amount ? ` (${r.amount} ${symbol})` : '';
                walletBlocks.push(
                    `❌ <b>${walletLabel} ${r.wallet}</b>${failDest}${failAmount}: ${failLabel}\n` +
                    `   ${r.status}`
                );
            }
        });

        // Telegram message limit: split if report is too long
        const TG_LIMIT = 4000;
        const fullReport = header + '\n\n' + walletBlocks.join('\n\n');

        // ── CSV Export ──
        if (bot && chatId && results.length > 0) {
            try {
                const fs = require('fs');
                const path = require('path');
                const os = require('os');
                const csvPath = path.join(os.tmpdir(), `batch_transfer_${userId}_${Date.now()}.csv`);
                const csvHeader = 'Wallet,To,Amount,Status,TxHash,Gas,BalBefore,BalAfter';
                const csvRows = results.map(r => {
                    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
                    return [esc(r.wallet), esc(r.to), esc(r.amount), esc(r.status), esc(r.txHash || '-'), esc(r.gas || '-'), esc(r.balBefore || '-'), esc(r.balAfter || '-')].join(',');
                });
                fs.writeFileSync(csvPath, csvHeader + '\n' + csvRows.join('\n'), 'utf-8');
                const csvCaptionTexts = {
                    en: `📊 Batch Transfer Report - ${results.length} items`,
                    vi: `📊 Báo cáo chuyển tiền hàng loạt - ${results.length} giao dịch`,
                    zh: `📊 批量转账报告 - ${results.length} 笔`,
                    ko: `📊 일괄 전송 보고서 - ${results.length}건`,
                    ru: `📊 Отчёт массовой отправки - ${results.length} операций`,
                    id: `📊 Laporan Transfer Massal - ${results.length} transaksi`
                };
                await (bot.bot || bot).sendDocument(chatId, csvPath, { caption: csvCaptionTexts[lk] || csvCaptionTexts.en, disable_notification: true });
                try { fs.unlinkSync(csvPath); } catch (e) { /* cleanup */ }
            } catch (csvErr) {
                log.child('BATCHTRANSFER').warn('CSV export failed:', csvErr.message);
            }
        }

        // ── #10: Completion notification for long batches ──
        const totalElapsed = Math.round((Date.now() - batchStartTime) / 1000);
        if (totalElapsed > 30 && bot && chatId) {
            const doneTexts = {
                en: `🔔 <b>Batch Complete!</b>\n✅ ${successCount}/${results.length} transfers done in ${elapsedFmt}.`,
                vi: `🔔 <b>Batch Hoàn Thành!</b>\n✅ ${successCount}/${results.length} giao dịch hoàn tất trong ${elapsedFmt}.`,
                zh: `🔔 <b>批量完成!</b>\n✅ ${successCount}/${results.length} 笔转账完成, 耗时 ${elapsedFmt}.`,
                ko: `🔔 <b>배치 완료!</b>\n✅ ${successCount}/${results.length}건 전송 완료 (${elapsedFmt}).`,
                ru: `🔔 <b>Пакет завершён!</b>\n✅ ${successCount}/${results.length} транзакций за ${elapsedFmt}.`,
                id: `🔔 <b>Batch Selesai!</b>\n✅ ${successCount}/${results.length} transfer selesai dalam ${elapsedFmt}.`
            };
            try {
                await bot.sendMessage(chatId, doneTexts[lk] || doneTexts.en, { parse_mode: 'HTML', disable_notification: false });
            } catch (e) { /* push notification is best-effort */ }
        }

        // ── Delete progress bar message ──
        if (progressMsgId && bot && chatId) {
            try { await bot.deleteMessage(chatId, progressMsgId).catch(() => { }); } catch (_) { }
        }

        // ── Retry Failed Transfers ──
        const failedTransfers = [];
        results.forEach((r, i) => {
            if (r.status && r.status !== '✅' && !r.status.startsWith('⚠️') && r.to && r.amount) {
                const origTransfer = validTransfers.find(t => (t.toAddress || '').trim().toLowerCase() === (r.to || '').toLowerCase());
                if (origTransfer) failedTransfers.push(origTransfer);
            }
        });

        if (failedTransfers.length > 0 && bot && chatId) {
            if (!global._batchRetryPending) global._batchRetryPending = new Map();
            const retryId = `retry_${userId}_${Date.now()}`;
            global._batchRetryPending.set(retryId, {
                transfers: failedTransfers,
                args: { ...args, transfers: failedTransfers },
                context,
                createdAt: Date.now()
            });
            setTimeout(() => { global._batchRetryPending.delete(retryId); }, 5 * 60 * 1000);

            const retryBtnTexts = {
                en: `🔄 Retry ${failedTransfers.length} failed`,
                vi: `🔄 Thử lại ${failedTransfers.length} thất bại`,
                zh: `🔄 重试 ${failedTransfers.length} 笔失败`,
                ko: `🔄 실패 ${failedTransfers.length}건 재시도`,
                ru: `🔄 Повторить ${failedTransfers.length} ошибок`,
                id: `🔄 Ulangi ${failedTransfers.length} gagal`
            };
            try {
                await bot.sendMessage(chatId, retryBtnTexts[lk] || retryBtnTexts.en, {
                    disable_notification: true,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: retryBtnTexts[lk] || retryBtnTexts.en, callback_data: `batchretry|${retryId}` }
                        ]]
                    }
                });
            } catch (e) { /* ignore */ }
        }

        // ── #4: Auto-save template prompt ──
        const uniqueDestAddrs = [...new Set(results.filter(r => r.status === '✅').map(r => r.to).filter(Boolean))];
        if (uniqueDestAddrs.length >= 3 && bot && chatId) {
            if (!global._batchSaveTemplatePending) global._batchSaveTemplatePending = new Map();
            const tplId = `tpl_${userId}_${Date.now()}`;
            global._batchSaveTemplatePending.set(tplId, {
                addresses: uniqueDestAddrs,
                userId,
                createdAt: Date.now()
            });
            setTimeout(() => { global._batchSaveTemplatePending.delete(tplId); }, 5 * 60 * 1000);

            const saveTplTexts = {
                en: `💾 Save these ${uniqueDestAddrs.length} addresses as a template?`,
                vi: `💾 Lưu ${uniqueDestAddrs.length} địa chỉ này thành template?`,
                zh: `💾 将这 ${uniqueDestAddrs.length} 个地址保存为模板？`,
                ko: `💾 이 ${uniqueDestAddrs.length}개 주소를 템플릿으로 저장?`,
                ru: `💾 Сохранить ${uniqueDestAddrs.length} адресов как шаблон?`,
                id: `💾 Simpan ${uniqueDestAddrs.length} alamat sebagai template?`
            };
            const saveBtnTexts = {
                en: '💾 Save Template', vi: '💾 Lưu Template',
                zh: '💾 保存模板', ko: '💾 템플릿 저장',
                ru: '💾 Сохранить шаблон', id: '💾 Simpan Template'
            };
            try {
                await bot.sendMessage(chatId, saveTplTexts[lk] || saveTplTexts.en, {
                    disable_notification: true,
                    reply_markup: { inline_keyboard: [[
                        { text: saveBtnTexts[lk] || saveBtnTexts.en, callback_data: `batchsavetemplate|${tplId}` }
                    ]] }
                });
            } catch (e) { /* template prompt is best-effort */ }
        }

        if (fullReport.length <= TG_LIMIT) {
            return { success: true, action: true, displayMessage: fullReport.trim() };
        }

        // Split: send header + groups of wallet blocks as separate messages
        let bot2 = null;
        const chatId2 = context?.chatId || context?.msg?.chat?.id;
        try { bot2 = require('../../../core/bot'); } catch (e) { /* no bot */ }

        if (bot2 && chatId2) {
            // Send header first
            try { await bot2.sendMessage(chatId2, header, { parse_mode: 'HTML', disable_notification: true }).catch(() => { }); } catch (e) { /* ignore */ }

            // Send wallet blocks in chunks
            let chunk = '';
            for (let i = 0; i < walletBlocks.length; i++) {
                const block = walletBlocks[i];
                if (chunk.length + block.length + 2 > TG_LIMIT) {
                    try { await bot2.sendMessage(chatId2, chunk.trim(), { parse_mode: 'HTML', disable_notification: true }).catch(() => { }); } catch (e) { /* ignore */ }
                    chunk = '';
                }
                chunk += block + '\n\n';
            }
            if (chunk.trim()) {
                try { await bot2.sendMessage(chatId2, chunk.trim(), { parse_mode: 'HTML', disable_notification: true }).catch(() => { }); } catch (e) { /* ignore */ }
            }
            return { success: true, action: true, displayMessage: `📦 ${headerLabel}: ${successCount}/${results.length} ${successStr} ✅` };
        }

        // Fallback: return truncated report
        return { success: true, action: true, displayMessage: (header + '\n\n' + walletBlocks.slice(0, 10).join('\n\n')).trim() };
    },


    // ═══════════════════════════════════════════════════════
    // #9: Transfer History Dashboard
    // ═══════════════════════════════════════════════════════
    async get_transfer_history(args, context) {
        const { dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ User not identified.';
        try {
            const lang = context?.lang || 'en';
            const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');
            const limit = Math.min(parseInt(args.limit) || 20, 100);
            const period = args.period || '30d';
            let since = 0;
            if (period === '7d') since = Math.floor(Date.now() / 1000) - 7 * 86400;
            else if (period === '30d') since = Math.floor(Date.now() / 1000) - 30 * 86400;

            const rows = await dbAll(
                `SELECT * FROM wallet_tx_history WHERE userId = ? AND type IN ('transfer_out', 'batch_transfer') AND createdAt >= ? ORDER BY createdAt DESC LIMIT ?`,
                [userId, since, limit]
            );

            if (!rows || rows.length === 0) {
                const emptyTexts = {
                    en: '📭 No transfers found in this period.',
                    vi: '📭 Không tìm thấy giao dịch nào trong khoảng thời gian này.',
                    zh: '📭 该期间未找到转账记录。',
                    ko: '📭 해당 기간에 전송 기록이 없습니다.',
                    ru: '📭 Переводов за этот период не найдено.',
                    id: '📭 Tidak ada transfer ditemukan dalam periode ini.'
                };
                return emptyTexts[lk] || emptyTexts.en;
            }

            const headerTexts = {
                en: 'TRANSFER HISTORY', vi: 'LỊCH SỬ CHUYỂN TIỀN',
                zh: '转账历史', ko: '전송 기록',
                ru: 'ИСТОРИЯ ПЕРЕВОДОВ', id: 'RIWAYAT TRANSFER'
            };
            const totalLabel = { en: 'Total:', vi: 'Tổng:', zh: '总计:', ko: '합계:', ru: 'Итого:', id: 'Total:' };
            const periodLabels = { en: 'Period:', vi: 'Khoảng:', zh: '期间:', ko: '기간:', ru: 'Период:', id: 'Periode:' };

            // Group by date
            const byDate = {};
            let totalAmount = 0;
            for (const r of rows) {
                const dt = new Date(r.createdAt * 1000);
                const dateKey = dt.toISOString().split('T')[0];
                if (!byDate[dateKey]) byDate[dateKey] = [];
                byDate[dateKey].push(r);
                totalAmount += Number(r.fromAmount || 0);
            }

            const explorerBase = _getExplorerUrl(rows[0]?.chainIndex || '196');
            let report = `📋 <b>${headerTexts[lk] || headerTexts.en}</b>\n`;
            report += `━━━━━━━━━━━━━━━━━━\n`;
            report += `${periodLabels[lk] || periodLabels.en} <b>${period}</b> | ${totalLabel[lk] || totalLabel.en} <b>${rows.length}</b> txs\n\n`;

            for (const [date, txs] of Object.entries(byDate)) {
                const dayTotal = txs.reduce((s, t) => s + Number(t.fromAmount || 0), 0);
                report += `📅 <b>${date}</b> (${txs.length} txs, ~${dayTotal.toFixed(2)} ${txs[0]?.fromSymbol || ''})\n`;
                for (const tx of txs.slice(0, 5)) {
                    const toShort = tx.toToken ? `${tx.toToken.slice(0, 6)}...${tx.toToken.slice(-4)}` : '?';
                    const txLink = tx.txHash ? `<a href="${explorerBase}/tx/${tx.txHash}">🔗</a>` : '';
                    report += `  → ${toShort} | ${Number(tx.fromAmount || 0).toFixed(4)} ${tx.fromSymbol || ''} ${txLink}\n`;
                }
                if (txs.length > 5) report += `  ... +${txs.length - 5} more\n`;
                report += '\n';
            }

            report += `━━━━━━━━━━━━━━━━━━\n`;
            report += `💰 ${totalLabel[lk] || totalLabel.en} ${totalAmount.toFixed(4)} tokens across ${rows.length} transfers`;

            return { displayMessage: report.trim(), action: true, success: true };
        } catch (e) {
            return `❌ Error: ${e.message}`;
        }
    },
    async get_wallet_pnl(args, context) {
        const { dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';
        try {
            const period = args.period || '30d';
            let since = 0;
            if (period === '7d') since = Math.floor(Date.now() / 1000) - 7 * 86400;
            else if (period === '30d') since = Math.floor(Date.now() / 1000) - 30 * 86400;

            let query = 'SELECT * FROM wallet_tx_history WHERE userId = ? AND createdAt >= ?';
            const params = [userId, since];
            if (args.walletId) { query += ' AND walletId = ?'; params.push(parseInt(args.walletId)); }
            query += ' ORDER BY createdAt DESC LIMIT 100';
            const history = await dbAll(query, params) || [];

            if (history.length === 0) return '📊 Chưa có lịch sử giao dịch nào trong khoảng thời gian này.';

            // Aggregate PnL by type
            const stats = { swap: 0, transfer_in: 0, transfer_out: 0, total: history.length };
            history.forEach(tx => { stats[tx.type] = (stats[tx.type] || 0) + 1; });

            let report = `📊 PnL Report (${period})\n━━━━━━━━━━━━━━━━━━\n`;
            report += `📋 Tổng giao dịch: ${stats.total}\n`;
            report += `🔄 Swap: ${stats.swap || 0} | 📤 Chuyển ra: ${stats.transfer_out || 0} | 📥 Nhận: ${stats.transfer_in || 0}\n\n`;
            report += `📜 Lịch sử gần nhất:\n`;
            history.slice(0, 15).forEach((tx, i) => {
                const date = new Date(tx.createdAt * 1000).toLocaleDateString('vi-VN');
                const icon = tx.type === 'swap' ? '🔄' : tx.type === 'transfer_out' ? '📤' : '📥';
                report += `${i + 1}. ${icon} ${date} | ${tx.fromSymbol || '?'}→${tx.toSymbol || '?'} | ${tx.fromAmount || '?'}\n`;
            });
            if (history.length > 15) report += `... +${history.length - 15} giao dịch khác\n`;
            return report;
        } catch (error) {
            return `❌ Lỗi lấy PnL: ${error.message}`;
        }
    },

    async manage_whitelist(args, context) {
        const { dbGet, dbRun, dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';
        const action = (args.action || '').toLowerCase();

        if (action === 'add') {
            if (!args.address) return '❌ Cần cung cấp địa chỉ ví.';
            const label = (args.label || '').trim().slice(0, 30) || null;
            try {
                await dbRun('INSERT OR REPLACE INTO wallet_whitelist (userId, address, label, createdAt) VALUES (?,?,?,?)',
                    [userId, args.address.toLowerCase(), label, Math.floor(Date.now() / 1000)]);
                return { success: true, action: true, displayMessage: `✅ Đã thêm địa chỉ tin cậy: ${args.address.slice(0, 8)}...${args.address.slice(-4)}${label ? ` (${label})` : ''}` };
            } catch (e) {
                return `❌ Lỗi: ${e.message}`;
            }

        } else if (action === 'remove') {
            if (!args.address) return '❌ Cần cung cấp địa chỉ để xóa.';
            await dbRun('DELETE FROM wallet_whitelist WHERE userId = ? AND address = ?', [userId, args.address.toLowerCase()]);
            return { success: true, action: true, displayMessage: `✅ Đã xóa khỏi whitelist: ${args.address.slice(0, 8)}...` };

        } else if (action === 'list') {
            const list = await dbAll('SELECT * FROM wallet_whitelist WHERE userId = ? ORDER BY createdAt DESC', [userId]) || [];
            if (list.length === 0) return '📭 Chưa có địa chỉ tin cậy nào.';
            let report = `🛡️ Whitelist (${list.length})\n━━━━━━━━━━━━━━━━━━\n`;
            list.forEach((w, i) => {
                report += `${i + 1}. ${w.label || 'Không tên'}: ${w.address}\n`;
            });
            return report;
        }
        return '❌ Action không hợp lệ. Hỗ trợ: add, remove, list.';
    },

    async manage_wallet_template(args, context) {
        const { dbGet, dbRun, dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '\u274c Cannot identify user.';
        const action = (args.action || '').toLowerCase();
        let lang = context?.lang || 'en';
        try { const { getLang } = require('../../../app/language'); if (context?.msg) lang = await getLang(context.msg); } catch (e) { }
        const lk = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
        const noName = {en:'Template name required.',vi:'C\u1ea7n t\u00ean template.',zh:'\u9700\u8981\u6a21\u677f\u540d\u79f0\u3002',ko:'\ud15c\ud50c\ub9bf\uba85 \ud544\uc694.',ru:'\u041d\u0443\u0436\u043d\u043e \u0438\u043c\u044f \u0448\u0430\u0431\u043b\u043e\u043d\u0430.',id:'Nama template diperlukan.'};
        const noAddr = {en:'Addresses required.',vi:'C\u1ea7n \u0111\u1ecba ch\u1ec9.',zh:'\u9700\u8981\u5730\u5740\u3002',ko:'\uc8fc\uc18c \ud544\uc694.',ru:'\u041d\u0443\u0436\u043d\u044b \u0430\u0434\u0440\u0435\u0441\u0430.',id:'Alamat diperlukan.'};
        if (action === 'save') {
            if (!args.name) return '\u274c ' + noName[lk];
            if (!args.addresses || args.addresses.length === 0) return '\u274c ' + noAddr[lk];
            const name = args.name.trim().slice(0, 30);
            const now = Math.floor(Date.now() / 1000);
            await dbRun('INSERT OR REPLACE INTO wallet_templates (userId,name,addresses,createdAt,updatedAt) VALUES (?,?,?,?,?)',
                [userId, name, JSON.stringify(args.addresses), now, now]);
            const ok = {en:'\u2705 Template "'+name+'" saved ('+args.addresses.length+' addr).',vi:'\u2705 Template "'+name+'" \u0111\u00e3 l\u01b0u ('+args.addresses.length+' \u0111\u1ecba ch\u1ec9).',zh:'\u2705 \u6a21\u677f"'+name+'"\u5df2\u4fdd\u5b58('+args.addresses.length+'\u4e2a\u5730\u5740)\u3002',ko:'\u2705 \ud15c\ud50c\ub9bf "'+name+'" \uc800\uc7a5 ('+args.addresses.length+'\uac1c).',ru:'\u2705 \u0428\u0430\u0431\u043b\u043e\u043d "'+name+'" \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d ('+args.addresses.length+' \u0430\u0434\u0440).',id:'\u2705 Template "'+name+'" disimpan ('+args.addresses.length+' alamat).'};
            return { success: true, action: true, displayMessage: ok[lk] };
        } else if (action === 'list') {
            const rows = await dbAll('SELECT * FROM wallet_templates WHERE userId = ? ORDER BY updatedAt DESC', [userId]) || [];
            if (!rows.length) { const em = {en:'\ud83d\udced No templates.',vi:'\ud83d\udced Ch\u01b0a c\u00f3 template.',zh:'\ud83d\udced \u65e0\u6a21\u677f\u3002',ko:'\ud83d\udced \ud15c\ud50c\ub9bf \uc5c6\uc74c.',ru:'\ud83d\udced \u041d\u0435\u0442 \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432.',id:'\ud83d\udced Belum ada template.'}; return em[lk]; }
            const hdr = {en:'Wallet Templates',vi:'Template V\u00ed',zh:'\u94b1\u5305\u6a21\u677f',ko:'\uc9c0\uac11 \ud15c\ud50c\ub9bf',ru:'\u0428\u0430\u0431\u043b\u043e\u043d\u044b',id:'Template Dompet'};
            const aL = {en:'addr',vi:'\u0111\u1ecba ch\u1ec9',zh:'\u5730\u5740',ko:'\uc8fc\uc18c',ru:'\u0430\u0434\u0440',id:'alamat'};
            let rpt = '\ud83d\udccb <b>'+hdr[lk]+'</b> ('+rows.length+')\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
            rows.forEach((r, i) => { const a = JSON.parse(r.addresses||'[]'); rpt += (i+1)+'. <b>'+r.name+'</b> \u2014 '+a.length+' '+aL[lk]+'\n'; });
            return { success: true, action: true, displayMessage: rpt };
        } else if (action === 'load') {
            if (!args.name) return '\u274c ' + noName[lk];
            const tpl = await dbGet('SELECT * FROM wallet_templates WHERE userId = ? AND name = ?', [userId, args.name.trim()]);
            if (!tpl) { const nf = {en:'Template not found.',vi:'Kh\u00f4ng t\u00ecm th\u1ea5y template.',zh:'\u6a21\u677f\u672a\u627e\u5230\u3002',ko:'\ud15c\ud50c\ub9bf \uc5c6\uc74c.',ru:'\u0428\u0430\u0431\u043b\u043e\u043d \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.',id:'Template tidak ditemukan.'}; return '\u274c ' + nf[lk]; }
            const addrs = JSON.parse(tpl.addresses||'[]');
            const ld = {en:'Loaded',vi:'\u0110\u00e3 t\u1ea3i',zh:'\u5df2\u52a0\u8f7d',ko:'\ub85c\ub4dc\ub428',ru:'\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043d',id:'Dimuat'};
            let rpt = '\ud83d\udccb <b>'+ld[lk]+': '+tpl.name+'</b>\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
            addrs.forEach((a, i) => { rpt += (i+1)+'. <code>'+a+'</code>\n'; });
            return { success: true, addresses: addrs, displayMessage: rpt, action: true };
        } else if (action === 'delete') {
            if (!args.name) return '\u274c ' + noName[lk];
            await dbRun('DELETE FROM wallet_templates WHERE userId = ? AND name = ?', [userId, args.name.trim()]);
            const del = {en:'\u2705 Deleted "'+args.name+'".',vi:'\u2705 \u0110\u00e3 x\u00f3a "'+args.name+'".',zh:'\u2705 \u5df2\u5220\u9664"'+args.name+'"\u3002',ko:'\u2705 "'+args.name+'" \uc0ad\uc81c\ub428.',ru:'\u2705 "'+args.name+'" \u0443\u0434\u0430\u043b\u0451\u043d.',id:'\u2705 "'+args.name+'" dihapus.'};
            return { success: true, action: true, displayMessage: del[lk] };
        }
        const inv = {en:'Invalid action. Use: save, list, load, delete.',vi:'Action kh\u00f4ng h\u1ee3p l\u1ec7. D\u00f9ng: save, list, load, delete.',zh:'\u65e0\u6548\u64cd\u4f5c\u3002\u7528: save, list, load, delete\u3002',ko:'\uc798\ubabb\ub41c \uc791\uc5c5. \uc0ac\uc6a9: save, list, load, delete.',ru:'\u041d\u0435\u0432\u0435\u0440\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435: save, list, load, delete.',id:'Aksi tidak valid. Gunakan: save, list, load, delete.'};
        return '\u274c ' + inv[lk];
    },

        async export_wallet_data(args, context) {
        const { dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';
        const format = (args.format || 'csv').toLowerCase();
        const exportType = (args.type || 'all').toLowerCase();

        try {
            let data = {};

            if (exportType === 'wallets' || exportType === 'all') {
                data.wallets = await dbAll('SELECT id, walletName, address, chainIndex, isDefault, tags, createdAt FROM user_trading_wallets WHERE userId = ? ORDER BY createdAt ASC', [userId]) || [];
            }
            if (exportType === 'history' || exportType === 'pnl' || exportType === 'all') {
                data.history = await dbAll('SELECT * FROM wallet_tx_history WHERE userId = ? ORDER BY createdAt DESC LIMIT 500', [userId]) || [];
            }
            if (exportType === 'whitelist' || exportType === 'all') {
                data.whitelist = await dbAll('SELECT * FROM wallet_whitelist WHERE userId = ? ORDER BY createdAt DESC', [userId]) || [];
            }

            let fileContent, fileName, mimeType;

            if (format === 'json') {
                fileContent = JSON.stringify(data, null, 2);
                fileName = `wallet_export_${exportType}_${Date.now()}.json`;
                mimeType = 'application/json';
            } else {
                // CSV format
                let csv = '';
                if (data.wallets) {
                    csv += 'WALLETS\nID,Name,Address,Chain,Default,Tags,CreatedAt\n';
                    data.wallets.forEach(w => {
                        csv += `${w.id},"${w.walletName || ''}",${w.address},${w.chainIndex},${w.isDefault},"${w.tags || ''}",${w.createdAt}\n`;
                    });
                }
                if (data.history) {
                    csv += '\nTRANSACTION HISTORY\nID,WalletID,Type,Chain,FromToken,ToToken,FromAmount,ToAmount,FromSymbol,ToSymbol,TxHash,CreatedAt\n';
                    data.history.forEach(h => {
                        csv += `${h.id},${h.walletId},${h.type},${h.chainIndex},${h.fromToken || ''},${h.toToken || ''},${h.fromAmount || ''},${h.toAmount || ''},${h.fromSymbol || ''},${h.toSymbol || ''},${h.txHash || ''},${h.createdAt}\n`;
                    });
                }
                if (data.whitelist) {
                    csv += '\nWHITELIST\nID,Address,Label,CreatedAt\n';
                    data.whitelist.forEach(w => {
                        csv += `${w.id},${w.address},"${w.label || ''}",${w.createdAt}\n`;
                    });
                }
                fileContent = csv;
                fileName = `wallet_export_${exportType}_${Date.now()}.csv`;
                mimeType = 'text/csv';
            }

            // Send as Telegram document
            if (context && context.bot) {
                const fs = require('fs');
                const path = require('path');
                const tmpPath = path.join(require('os').tmpdir(), fileName);
                fs.writeFileSync(tmpPath, fileContent, 'utf8');
                await context.bot.sendDocument(context.chatId || userId, tmpPath, { caption: `📥 Export: ${exportType} (${format.toUpperCase()})` });
                fs.unlinkSync(tmpPath);
                return { success: true, action: true, displayMessage: `✅ Đã gửi file ${fileName} qua Telegram.` };
            }
            return { success: true, action: true, displayMessage: `✅ Dữ liệu đã sẵn sàng (${Object.keys(data).map(k => `${k}: ${data[k].length}`).join(', ')}).` };
        } catch (error) {
            return `❌ Lỗi export: ${error.message}`;
        }
    },

    async filter_wallets_by_tag(args, context) {
        const { dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';
        const tag = (args.tag || '').trim().toLowerCase().replace('#', '');
        if (!tag) return '❌ Cần cung cấp tag để lọc.';
        try {
            const all = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY createdAt ASC', [userId]) || [];
            const filtered = all.filter(w => {
                const tags = (w.tags || '').toLowerCase().split(',').map(t => t.trim().replace('#', ''));
                return tags.includes(tag);
            });
            if (filtered.length === 0) return `📭 Không có ví nào với tag "${tag}".`;
            let report = `🏷️ Ví với tag "#${tag}" (${filtered.length})\n━━━━━━━━━━━━━━━━━━\n`;
            filtered.forEach((w, i) => {
                const name = w.walletName ? ` "${w.walletName}"` : '';
                const star = w.isDefault ? ' ⭐' : '';
                report += `${i + 1}. ID:${w.id}${name}${star}\n   ${w.address}\n   Tags: ${w.tags || 'none'}\n`;
            });
            return report;
        } catch (error) {
            return `❌ Lỗi: ${error.message}`;
        }
    },

    async check_multi_wallet_balances(args, context) {
        const { dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';

        try {
            const wallets = await dbAll('SELECT * FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, id ASC', [userId]);
            if (!wallets || wallets.length === 0) return '❌ Không tìm thấy ví trading nào.';

            const ethers = require('ethers');
            const chainIds = (args.chainIndex || '196').split(',').map(c => c.trim()).filter(Boolean);
            const tokenAddr = args.tokenAddress.toLowerCase();
            const isNative = tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };
            const chainSymbols = { '1': 'ETH', '56': 'BNB', '196': 'OKB', '137': 'POL', '42161': 'ETH', '8453': 'ETH' };

            const erc20Abi = [
                "function balanceOf(address owner) view returns (uint256)",
                "function decimals() view returns (uint8)",
                "function symbol() view returns (string)"
            ];

            log.child('MULTIBALANCE').info(`Omni-chain scan: ${chainIds.length} chains, ${wallets.length} wallets`);
            const allResults = [];

            // Scan each chain in parallel
            const chainPromises = chainIds.map(async (chainIndex) => {
                try {
                    const rpcUrl = _getChainRpc(chainIndex);
                    const provider = new ethers.JsonRpcProvider(rpcUrl);
                    let contract = null;
                    let decimals = 18;
                    let symbol = isNative ? (chainSymbols[chainIndex] || 'NATIVE') : 'Token';

                    if (!isNative) {
                        contract = new ethers.Contract(tokenAddr, erc20Abi, provider);
                        try {
                            [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);
                        } catch (e) {
                            // Token might not exist on this chain
                            return [];
                        }
                    }

                    // Query all wallets in parallel on this chain
                    const walletResults = await Promise.all(wallets.map(async (tw) => {
                        try {
                            const rawBalance = isNative
                                ? await provider.getBalance(tw.address)
                                : await contract.balanceOf(tw.address);
                            if (rawBalance === 0n) return null; // skip zero balances for omni-chain
                            const formattedBalance = ethers.formatUnits(rawBalance, decimals);
                            return {
                                id: tw.id, address: tw.address, name: tw.walletName, isDefault: tw.isDefault,
                                rawBalance: rawBalance.toString(), formattedBalance: Number(formattedBalance),
                                symbol, decimals: Number(decimals), chainIndex, chainName: chainNames[chainIndex] || `Chain #${chainIndex}`
                            };
                        } catch { return null; }
                    }));
                    return walletResults.filter(Boolean);
                } catch (e) {
                    log.child('MULTIBALANCE').error(`Chain ${chainIndex} failed:`, e.message);
                    return [];
                }
            });

            const chainResults = await Promise.all(chainPromises);
            for (const results of chainResults) allResults.push(...results);

            if (allResults.length === 0) {
                return `📭 Không tìm thấy số dư nào cho token này trên ${chainIds.length > 1 ? 'toàn bộ ' + chainIds.length + ' mạng' : 'mạng ' + (chainNames[chainIds[0]] || chainIds[0])}.`;
            }

            // Group by chain if multi-chain
            const isMultiChain = chainIds.length > 1;
            let lines;
            if (isMultiChain) {
                const grouped = {};
                for (const b of allResults) {
                    if (!grouped[b.chainIndex]) grouped[b.chainIndex] = [];
                    grouped[b.chainIndex].push(b);
                }
                lines = Object.entries(grouped).map(([chain, items]) => {
                    const chainLabel = chainNames[chain] || `Chain #${chain}`;
                    const itemLines = items.map(b => {
                        const isDef = b.isDefault ? ' ⭐' : '';
                        const title = `Ví ${b.id}${b.name ? ` "${b.name}"` : ''}${isDef}`;
                        const balStr = b.formattedBalance.toLocaleString('en-US', { maximumFractionDigits: 6 });
                        return `  - **${title}**: **${balStr} ${b.symbol}** (Wei: \`${b.rawBalance}\`)`;
                    });
                    return `🔗 **${chainLabel}:**\n${itemLines.join('\n')}`;
                });
            } else {
                lines = allResults.map(b => {
                    const isDef = b.isDefault ? ' ⭐' : '';
                    const title = `Ví ${b.id}${b.name ? ` "${b.name}"` : ''}${isDef}`;
                    const balStr = b.formattedBalance.toLocaleString('en-US', { maximumFractionDigits: 6 });
                    return `- **${title}**\n  Địa chỉ: \`${b.address}\`\n  Số dư: **${balStr} ${b.symbol}**\n  Original Wei: \`${b.rawBalance}\``;
                });
            }

            const tokenLabel = allResults[0]?.symbol || 'Token';
            const chainLabel = isMultiChain ? `${chainIds.length} mạng` : (chainNames[chainIds[0]] || chainIds[0]);
            return `> IMPORTANT INSTRUCTION: Display this exact list to the user in their language so they can choose which wallets to use.\n\n📊 **Balance Summary for ${tokenLabel} (${chainLabel}):**\n\n${lines.join('\n\n')}`;
        } catch (error) {
            return `❌ Lỗi kiểm tra số dư: ${error.msg || error.message}`;
        }
    },

};
