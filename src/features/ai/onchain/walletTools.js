const onchainos = require('../../../services/onchainos');
const fs = require('fs');
const path = require('path');
const { formatPriceResult, formatSearchResult, formatWalletResult, formatSwapQuoteResult, formatTopTokensResult, formatRecentTradesResult, formatSignalChainsResult, formatSignalListResult, formatProfitRoiResult, formatHolderResult, formatGasResult, formatTokenInfoResult, formatCandlesResult, formatTokenMarketDetail, formatSwapExecutionResult, formatSimulationResult, formatLargeNumber } = require('./formatters');
const { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken } = require('./helpers');
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
                    console.log(`[AIA Debug Wallet] Real-time prices fetched for ${tokenList.length} tokens. Found:`, priceInfos);
                    let newTotal = 0;
                    if (Array.isArray(priceInfos) && priceInfos.length > 0) {
                        for (const b of tokenList) {
                            const addr = b.tokenContractAddress || b.tokenAddress;
                            const rtPrice = priceInfos.find(p => p.tokenContractAddress?.toLowerCase() === addr?.toLowerCase());
                            if (rtPrice && Number(rtPrice.price) > 0) {
                                console.log(`[AIA Debug Wallet] Overriding stale price for ${addr}: ${b.tokenPrice} -> ${rtPrice.price}`);
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
                const autoName = `Ví ${(countRow?.cnt || 0) + 1}`;
                await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, autoName, newWallet.address, encryptedKey, '196', isDefault, Math.floor(Date.now() / 1000)]);

                let dmSent = false;
                if (context && context.bot && context.msg) {
                    try {
                        const dbModule = require('../../../../db.js');
                        // Use english or vietnamese depending on context if available, otherwise fallback
                        const lang = context.lang || 'vi';
                        await dbModule.addWalletToUser(userId, lang, newWallet.address, { name: 'Ví AI' });

                        // Send the private key directly to DM
                        const keyMsg = `👛 **Ví mới được tạo**\n━━━━━━━━━━━━━━━━━━\nĐịa chỉ: \`${newWallet.address}\`\nKhóa Private: \`${newWallet.privateKey}\`\n\n⚠️ Tin nhắn này sẽ tự hủy sau 30 giây để bảo mật!`;
                        const sent = await context.bot.sendMessage(userId, keyMsg, { parse_mode: 'Markdown' });
                        setTimeout(() => { context.bot.deleteMessage(userId, sent.message_id).catch(() => { }); }, 30000);
                        dmSent = true;
                    } catch (e) {
                        console.error('[AUTO-WATCH] Failed to register watch wallet or send DM:', e);
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
                    } catch (e) { console.error('[AUTO-POPUP] Failed to trigger /mywallet:', e); }
                }

                if (dmSent) {
                    return {
                        success: true,
                        action: true,
                        displayMessage: `✅ Trading wallet created successfully!\nAddress: ${newWallet.address}\n\nThe private key has been sent to your Direct Messages securely (it will auto-delete in 30s). Please check your DM.`
                    };
                } else {
                    return {
                        success: true,
                        action: true,
                        displayMessage: `✅ Trading wallet created! Address: ${newWallet.address}\n\n⚠️ Note: Could not send private key to your DM via bot. Please use the 'manage_trading_wallet' tool with 'export' action to view it.`
                    };
                }
            } catch (error) {
                return { success: false, action: true, displayMessage: `❌ Error creating wallet: ${error.message}` };
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
                console.log(`[AIA Debug] Real-time prices fetched for ${balances.length} tokens. Found:`, priceInfos);
                if (Array.isArray(priceInfos) && priceInfos.length > 0) {
                    for (const b of balances) {
                        const rtPrice = priceInfos.find(p => p.tokenContractAddress?.toLowerCase() === b.tokenAddress?.toLowerCase());
                        if (rtPrice && Number(rtPrice.price) > 0) {
                            console.log(`[AIA Debug] Overriding stale price for ${b.symbol}: ${b.priceUsd} -> ${rtPrice.price}`);
                            b.priceUsd = Number(rtPrice.price);
                        }
                    }
                }
            } catch (e) {
                console.error('[AIA Debug] Failed to fetch real-time prices:', e);
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
            const toAddr = args.toAddress.toLowerCase();
            let tokenAddr = args.tokenAddress ? args.tokenAddress.toLowerCase() : 'native';

            if (tokenAddr && !tokenAddr.startsWith('0x') && tokenAddr.length < 20 && tokenAddr !== 'native') {
                const { autoResolveToken } = require('./helpers');
                const resolved = await autoResolveToken(tokenAddr, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error, action: true, success: false };
                tokenAddr = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }

            const isNative = !tokenAddr || tokenAddr === 'native' || tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

            let txHash, gasUsed = '0', gasFeeEth = '0';
            let balBeforeSrc = '0', balBeforeDst = '0', balAfterSrc = '0', balAfterDst = '0';
            const symbol = args.symbol || (isNative ? (chainIndex === '196' ? 'OKB' : 'ETH') : 'Token');

            console.log(`[TRANSFER] Starting: user=${userId}, wallet=${tw.address}, to=${toAddr}, token=${tokenAddr}, amount=${args.amount}`);

            if (isNative) {
                balBeforeSrc = ethers.formatEther(await provider.getBalance(wallet.address));
                balBeforeDst = ethers.formatEther(await provider.getBalance(toAddr));

                const amountWei = ethers.parseEther(args.amount);
                const tx = await wallet.sendTransaction({ to: toAddr, value: amountWei });
                const receipt = await tx.wait();

                txHash = receipt.hash;
                gasUsed = receipt.gasUsed?.toString() || '0';
                if (receipt.gasUsed && receipt.gasPrice) {
                    gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
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
                    console.error('[TRANSFER] Could not fetch decimals, falling back to 18:', decErr.message);
                }

                try {
                    balBeforeSrc = ethers.formatUnits(await contract.balanceOf(wallet.address), decimals);
                    balBeforeDst = ethers.formatUnits(await contract.balanceOf(toAddr), decimals);
                } catch (balErr) {
                    return `❌ Lỗi: Không thể lấy số dư. Có thể địa chỉ token (${tokenAddr}) không hợp lệ trên mạng lưới này.`;
                }

                const amountWei = ethers.parseUnits(args.amount, decimals);
                const tx = await contract.transfer(toAddr, amountWei);
                const receipt = await tx.wait();

                txHash = receipt.hash;
                gasUsed = receipt.gasUsed?.toString() || '0';
                if (receipt.gasUsed && receipt.gasPrice) {
                    gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                }

                balAfterSrc = ethers.formatUnits(await contract.balanceOf(wallet.address), decimals);
                balAfterDst = ethers.formatUnits(await contract.balanceOf(toAddr), decimals);
            }

            // Record tx history
            try {
                await dbRun('INSERT INTO wallet_tx_history (userId, walletId, walletAddress, type, chainIndex, fromToken, toToken, fromAmount, toAmount, fromSymbol, toSymbol, txHash, gasUsed, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [userId, wId, tw.address, 'transfer_out', chainIndex, tokenAddr, tokenAddr, args.amount, args.amount, symbol, symbol, txHash, gasUsed, Math.floor(Date.now() / 1000)]);
            } catch (dbErr) { console.error('[TRANSFER] DB log error:', dbErr.message); }

            const explorer = _getExplorerUrl(chainIndex);
            console.log(`[TRANSFER] Success: tx=${txHash}`);

            // Detect user's prompt language dynamically
            const userText = (context?.msg?.text || context?.msg?.caption || '').toLowerCase();
            let lang = context?.lang || 'en';
            if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/.test(userText)) lang = 'vi';
            else if (/[\u4e00-\u9fa5]/.test(userText)) lang = 'zh';
            else if (/[\uac00-\ud7af]/.test(userText)) lang = 'ko';
            else if (/[а-яА-ЯёЁ]/.test(userText)) lang = 'ru';
            else if (/\b(saya|kamu|di|ke|dari|untuk|bisa|tidak|ya|halo|tolong|ada|berapa|saldo|dompet|transfer|kirim)\b/.test(userText)) lang = 'id';
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
                `💰 ${amountLabel} <b>${args.amount} ${symbol}</b>\n\n` +
                `🔗 <a href="${explorer}/tx/${txHash}">${linkLabel}</a>`;

            return { success: true, action: true, displayMessage: report };
        } catch (error) {
            console.error('[TRANSFER] Error:', error.message);
            const lang = context?.lang || 'en';
            const errorMsg = lang === 'vi' ? 'Lỗi chuyển token:' : (lang === 'zh' || lang === 'zh-cn' ? '转账失败:' : 'Token transfer error:');
            return { success: false, action: true, displayMessage: `❌ ${errorMsg} ${error.message?.slice(0, 150)}` };
        }
    },

    async batch_transfer(args, context) {
        const { dbGet, dbRun, dbAll } = require('../../../../db/core');
        const ethers = require('ethers');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';
        if (!global._decryptTradingKey) return '❌ Hệ thống chưa sẵn sàng để ký giao dịch.';
        const transfers = args.transfers || [];
        if (transfers.length === 0) return '❌ Danh sách chuyển trống.';
        const chainIndex = args.chainIndex || '196';
        const rpcUrl = _getChainRpc(chainIndex);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        let tokenAddr = args.tokenAddress ? args.tokenAddress.toLowerCase() : 'native';

        if (tokenAddr && !tokenAddr.startsWith('0x') && tokenAddr.length < 20 && tokenAddr !== 'native') {
            const { autoResolveToken } = require('./helpers');
            const resolved = await autoResolveToken(tokenAddr, chainIndex);
            if (resolved.error) return { displayMessage: resolved.error, action: true, success: false };
            tokenAddr = resolved.tokenAddress;
        }

        const isNative = !tokenAddr || tokenAddr === 'native' || tokenAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const symbol = args.symbol || (isNative ? (chainIndex === '196' ? 'OKB' : 'ETH') : 'Token');
        const results = [];

        let totalGasEth = 0;

        for (const t of transfers) {
            try {
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [parseInt(t.fromWalletId), userId]);
                if (!tw) { results.push({ wallet: t.fromWalletId, status: '❌ Ví không tồn tại' }); continue; }
                const privateKey = global._decryptTradingKey(tw.encryptedKey);
                const wallet = new ethers.Wallet(privateKey, provider);
                const destAddr = t.toAddress.toLowerCase();
                let txHash, balBeforeSrc = '0', balAfterSrc = '0', gasFeeEth = '0';

                if (isNative) {
                    balBeforeSrc = ethers.formatEther(await provider.getBalance(wallet.address));
                    const tx = await wallet.sendTransaction({ to: destAddr, value: ethers.parseEther(t.amount) });
                    const receipt = await tx.wait();
                    txHash = receipt.hash;
                    if (receipt.gasUsed && receipt.gasPrice) gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                    balAfterSrc = ethers.formatEther(await provider.getBalance(wallet.address));
                } else {
                    const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)', 'function decimals() view returns (uint8)', 'function balanceOf(address account) view returns (uint256)'];
                    const contract = new ethers.Contract(tokenAddr, erc20Abi, wallet);

                    let decimals = 18;
                    try {
                        decimals = await contract.decimals();
                    } catch (decErr) {
                        console.error('[BATCH_TRANSFER] Could not fetch decimals, falling back to 18:', decErr.message);
                    }

                    balBeforeSrc = ethers.formatUnits(await contract.balanceOf(wallet.address), decimals);
                    const tx = await contract.transfer(destAddr, ethers.parseUnits(t.amount, decimals));
                    const receipt = await tx.wait();
                    txHash = receipt.hash;
                    if (receipt.gasUsed && receipt.gasPrice) gasFeeEth = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
                    balAfterSrc = ethers.formatUnits(await contract.balanceOf(wallet.address), decimals);
                }

                totalGasEth += Number(gasFeeEth);

                try {
                    await dbRun('INSERT INTO wallet_tx_history (userId, walletId, walletAddress, type, chainIndex, fromToken, fromAmount, fromSymbol, txHash, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
                        [userId, parseInt(t.fromWalletId), tw.address, 'transfer_out', chainIndex, tokenAddr, t.amount, symbol, txHash, Math.floor(Date.now() / 1000)]);
                } catch (dbErr) { console.error('[BATCH_TRANSFER] DB log error:', dbErr.message); }
                results.push({
                    wallet: `#${t.fromWalletId}`,
                    to: destAddr.slice(0, 8) + '...',
                    amount: t.amount,
                    status: '✅',
                    txHash: txHash,
                    balBefore: Number(balBeforeSrc).toFixed(2),
                    balAfter: Number(balAfterSrc).toFixed(2)
                });
            } catch (e) {
                console.error(`[BATCH_TRANSFER] Error wallet ${t.fromWalletId}:`, e.message);
                results.push({ wallet: `#${t.fromWalletId}`, status: `❌ ${e.message?.slice(0, 40)}` });
            }
        }

        const successCount = results.filter(r => r.status === '✅').length;

        const userText = (context?.msg?.text || context?.msg?.caption || '').toLowerCase();
        let lang = context?.lang || 'en';
        if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/.test(userText)) lang = 'vi';
        else if (/[\u4e00-\u9fa5]/.test(userText)) lang = 'zh';
        else if (/[\uac00-\ud7af]/.test(userText)) lang = 'ko';
        else if (/[а-яА-ЯёЁ]/.test(userText)) lang = 'ru';
        else if (/\b(saya|kamu|di|ke|dari|untuk|bisa|tidak|ya|halo|tolong|ada|berapa|saldo|dompet|transfer|kirim)\b/.test(userText)) lang = 'id';

        let headerLabel = 'BATCH TRANSFER RESULTS:';
        let successStr = 'success';
        let gasLabel = 'Total Gas Fee:';
        let walletLabel = 'Wallet';
        let amountLabel = 'Sent:';
        let balanceLabel = 'Balance:';
        let linkLabel = 'Details';
        let failLabel = 'Failed';

        if (lang === 'vi') {
            headerLabel = 'KẾT QUẢ BATCH TRANSFER:';
            successStr = 'thành công';
            gasLabel = 'Tổng phí Gas:';
            walletLabel = 'Ví';
            amountLabel = 'Chuyển:';
            balanceLabel = 'Số dư:';
            linkLabel = 'Chi tiết TX';
            failLabel = 'Thất bại';
        } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
            headerLabel = '批量转账结果:';
            successStr = '成功';
            gasLabel = '总 Gas 费用:';
            walletLabel = '钱包';
            amountLabel = '转账:';
            balanceLabel = '余额:';
            linkLabel = '交易详情';
            failLabel = '失败';
        }

        let report = `📦 <b>${headerLabel}</b> ${successCount}/${results.length} ${successStr}\n` +
            `⛽ <b>${gasLabel}</b> ${totalGasEth.toFixed(6)} native\n━━━━━━━━━━━━━━━━━━\n\n`;

        results.forEach(r => {
            if (r.status === '✅') {
                report += `✅ <b>${walletLabel} ${r.wallet} →</b> <code>${r.to}</code>\n` +
                    `   ${amountLabel} <b>${r.amount} ${symbol}</b>\n` +
                    `   ${balanceLabel} ${r.balBefore} → ${r.balAfter}\n` +
                    `   🔗 <a href="${_getExplorerUrl(chainIndex)}/tx/${r.txHash}">${linkLabel}</a>\n\n`;
            } else {
                report += `❌ ${walletLabel} ${r.wallet}: ${failLabel} (${r.status})\n\n`;
            }
        });

        return { success: true, action: true, displayMessage: report.trim() };
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

            console.log(`[MULTI-BALANCE] Omni-chain scan: ${chainIds.length} chains, ${wallets.length} wallets`);
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
                    console.error(`[MULTI-BALANCE] Chain ${chainIndex} failed:`, e.message);
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
