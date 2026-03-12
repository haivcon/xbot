const onchainos = require('../../../services/onchainos');
const logger = require('../../../core/logger');
const log = logger.child('Trading');
const fs = require('fs');
const path = require('path');
const { formatPriceResult, formatSearchResult, formatWalletResult, formatSwapQuoteResult, formatTopTokensResult, formatRecentTradesResult, formatSignalChainsResult, formatSignalListResult, formatProfitRoiResult, formatHolderResult, formatGasResult, formatTokenInfoResult, formatCandlesResult, formatTokenMarketDetail, formatSwapExecutionResult, formatSimulationResult, formatLargeNumber } = require('./formatters');
const { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken, rpcRetry, createNonceManager, checkTokenBalance } = require('./helpers');
const db = require('../../../../db.js');

module.exports = {
    async get_swap_quote(args, context) {
        try {
            log.child('SWAPQUOTE').info('Calling with args:', JSON.stringify(args));

            let chainIndex = args.chainIndex || '196';
            let fromTokenAddress = args.fromTokenAddress;
            let toTokenAddress = args.toTokenAddress;

            if (!fromTokenAddress || !toTokenAddress) {
                return { displayMessage: '> IMPORTANT INSTRUCTION: Display this swap quote error naturally to the user in their language.\n\n❌ **Quote Error:** Missing from/to token address. Please specify both tokens.' };
            }

            // Auto-resolve tokens if they are just symbols
            if (fromTokenAddress && !fromTokenAddress.startsWith('0x') && fromTokenAddress.length < 20) {
                const resolved = await autoResolveToken(fromTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                fromTokenAddress = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }
            if (toTokenAddress && !toTokenAddress.startsWith('0x') && toTokenAddress.length < 20) {
                const resolved = await autoResolveToken(toTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                toTokenAddress = resolved.tokenAddress;
            }

            // --- Phase 4 Proactive Security Check ---
            const isNativeTo = toTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            if (!isNativeTo && typeof onchainos.getTokenSecurity === 'function') {
                try {
                    const secData = await onchainos.getTokenSecurity(chainIndex, toTokenAddress);
                    if (secData && secData.length > 0) {
                        const sec = secData[0];
                        const isHoneypot = sec.isHoneypot === '1' || sec.is_honeypot === '1' || sec.is_honeypot === true;
                        const cannotBuy = sec.cannotBuy === '1' || sec.cannot_buy === '1';
                        const cannotSell = sec.cannotSell === '1' || sec.cannot_sell === '1';
                        const buyTax = Number(sec.buyTax || sec.buy_tax || '0');
                        const sellTax = Number(sec.sellTax || sec.sell_tax || '0');

                        if (isHoneypot || buyTax > 0.1 || sellTax > 0.1 || cannotBuy || cannotSell) {
                            const lang = context?.lang || 'en';
                            const alertMsg = lang === 'vi'
                                ? `🚨 **CẢNH BÁO SCAM / RỦI RO CAO** 🚨\nToken đích (\`${toTokenAddress}\`) có dấu hiệu nguy hiểm:\n\n`
                                : `🚨 **HIGH RISK / SCAM ALERT** 🚨\nTarget token (\`${toTokenAddress}\`) has dangerous flags:\n\n`;

                            let reasons = [];
                            if (isHoneypot) reasons.push(lang === 'vi' ? '🍯 Là Honeypot (Mã độc cấm bán)' : '🍯 Is a Honeypot (Malicious contract)');
                            if (cannotBuy) reasons.push(lang === 'vi' ? '❌ Mã bị khóa chức năng mua' : '❌ Cannot buy');
                            if (cannotSell) reasons.push(lang === 'vi' ? '❌ Mã bị khóa chức năng bán' : '❌ Cannot sell');
                            if (buyTax > 0.1) reasons.push((lang === 'vi' ? `💸 Phí mua siêu cao: ` : `💸 Massive Buy Tax: `) + (buyTax * 100).toFixed(2) + '%');
                            if (sellTax > 0.1) reasons.push((lang === 'vi' ? `💸 Phí bán siêu cao: ` : `💸 Massive Sell Tax: `) + (sellTax * 100).toFixed(2) + '%');

                            const advice = lang === 'vi'
                                ? `\n⛔ **Hệ thống AI từ chối báo giá swap để bảo vệ tài sản của bạn.**`
                                : `\n⛔ **AI system refused to quote this swap to protect your assets.**`;

                            return { displayMessage: alertMsg + reasons.map(r => `> ${r}`).join('\n') + advice };
                        }
                    }
                } catch (secErr) {
                    log.child('SWAPQUOTE').warn('Security check failed, skipping:', secErr.message);
                }
            }

            // ----------------------------------------

            // --- Phase 5 Auto-Decimal Resolution ---
            let originalAmount = args.amount;
            if (originalAmount && !originalAmount.includes('00000000') && !originalAmount.includes('e+') && originalAmount.length < 16) {
                try {
                    const ethers = require('ethers');
                    const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                    if (basicInfo && basicInfo.length > 0) {
                        const resolvedDecimals = Number(basicInfo[0].decimal || 18);
                        // Use ethers.parseUnits for precision-safe conversion (handles any amount size)
                        args.amount = ethers.parseUnits(String(originalAmount), resolvedDecimals).toString();

                        log.child('SWAPQUOTE').info(`Auto-converted amount ${originalAmount} to ${args.amount} wei based on ${resolvedDecimals} decimals`);
                    }
                } catch (e) { log.child('SWAPQUOTE').error('Failed auto-decimal:', e.message); }
            }
            // ----------------------------------------

            // ── #4: Balance pre-check before quote (soft warning) ──
            try {
                const userIdBal = context?.userId;
                if (userIdBal && args.amount) {
                    const { dbAll: bpDbAll } = require('../../../../db/core');
                    const userWallets = await bpDbAll('SELECT * FROM user_trading_wallets WHERE userId = ?', [String(userIdBal)]);
                    if (userWallets && userWallets.length > 0) {
                        const defWallet = userWallets.find(w => w.isDefault) || userWallets[0];
                        if (defWallet) {
                            try {
                                const balData = await onchainos.getWalletBalance(defWallet.address, chainIndex);
                                if (balData && Array.isArray(balData) && balData.length > 0) {
                                    const assets = balData[0]?.tokenAssets || balData;
                                    const fAddr = fromTokenAddress.toLowerCase();
                                    const isNat = ['okb','eth','bnb','matic','avax'].includes(fAddr);
                                    const match = isNat
                                        ? assets.find(a => (a.tokenSymbol||'').toLowerCase() === fAddr)
                                        : assets.find(a => (a.tokenContractAddress||'').toLowerCase() === fAddr);
                                    if (match) {
                                        const holdAmt = Number(match.holdingAmount || match.balance || 0);
                                        const reqAmt = Number(originalAmount || args.amount);
                                        if (reqAmt > 0 && holdAmt < reqAmt) {
                                            const sym = match.tokenSymbol || fAddr;
                                            const chatIdBal = context?.chatId || context?.msg?.chat?.id;
                                            if (chatIdBal) {
                                                let bBot; try { bBot = require('../../../core/bot').bot; } catch(_){}
                                                if (bBot) {
                                                let bpLang = 'en';
                                                try { const { getUserLanguage: gBpL } = require('../../../../db/users'); const dbl = await gBpL(String(userIdBal)); if (dbl) bpLang = dbl; } catch(_){}
                                                const bpLk = ['zh-Hans','zh-cn'].includes(bpLang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(bpLang) ? bpLang : 'en');
                                                const bpTexts = {
                                                    en: `⚠️ <b>Low Balance</b>\nWallet <code>${defWallet.address.slice(0,8)}...</code>: ${holdAmt} ${sym} (need ${reqAmt})`,
                                                    vi: `⚠️ <b>Số dư thấp</b>\nVí <code>${defWallet.address.slice(0,8)}...</code>: ${holdAmt} ${sym} (cần ${reqAmt})`,
                                                    zh: `⚠️ <b>余额不足</b>\n钱包 <code>${defWallet.address.slice(0,8)}...</code>: ${holdAmt} ${sym} (需要 ${reqAmt})`,
                                                    ko: `⚠️ <b>잔액 부족</b>\n지갑 <code>${defWallet.address.slice(0,8)}...</code>: ${holdAmt} ${sym} (필요 ${reqAmt})`,
                                                    ru: `⚠️ <b>Низкий баланс</b>\nКошелёк <code>${defWallet.address.slice(0,8)}...</code>: ${holdAmt} ${sym} (нужно ${reqAmt})`,
                                                    id: `⚠️ <b>Saldo Rendah</b>\nDompet <code>${defWallet.address.slice(0,8)}...</code>: ${holdAmt} ${sym} (butuh ${reqAmt})`
                                                };
                                                await bBot.sendMessage(chatIdBal, bpTexts[bpLk] || bpTexts.en, { parse_mode: 'HTML', disable_notification: true });
                                            }
                                            }
                                        }
                                    }
                                }
                            } catch (_) {}
                        }
                    }
                }
            } catch (bpErr) { log.child('SWAPQUOTE').warn('Balance pre-check:', bpErr.message); }

            let data;
            try {
                data = await onchainos.getSwapQuote({
                    chainIndex: chainIndex,
                    fromTokenAddress: fromTokenAddress,
                    toTokenAddress: toTokenAddress,
                    amount: args.amount
                });
            } catch (quoteErr) {
                // Handle OKX 82112 Error: "value difference from this transaction's quote route is higher than 90%"
                if (quoteErr.code === '82112' || (quoteErr.msg && quoteErr.msg.includes('value difference'))) {
                    log.child('SWAPQUOTE').error('High price impact 82112 error intercepted:', quoteErr.msg);
                    return {
                        displayMessage: '❌ <b>Lỗi Báo Giá (Price Impact > 90%):</b>\nSố lượng bạn muốn Swap quá lớn so với thanh khoản hiện tại của Pool, dẫn đến trượt giá (Price Impact) sẽ vượt mốc 90%, có nguy cơ mất phần lớn tài sản.\n\n👉 <i>Vui lòng giảm số lượng Swap xuống rất nhỏ, hoặc chờ dự án bơm thêm thanh khoản.</i>'
                    };
                }
                throw quoteErr;
            }
            log.child('SWAPQUOTE').info('Raw OKX response:', JSON.stringify(data).slice(0, 2000));

            // Fallback to fetch missing token symbols and decimals
            if (data && Array.isArray(data) && data.length > 0) {
                const quote = data[0];
                const router = quote.routerResult || {};
                if (!router.fromTokenSymbol || !router.toTokenSymbol || !router.fromToken?.decimal || !router.toToken?.decimal) {
                    try {
                        const basicInfo = await onchainos.getTokenBasicInfo([
                            { chainIndex, tokenContractAddress: fromTokenAddress },
                            { chainIndex, tokenContractAddress: toTokenAddress }
                        ]);
                        if (basicInfo && basicInfo.length > 0) {
                            const info1 = basicInfo.find(t => t.tokenContractAddress.toLowerCase() === fromTokenAddress.toLowerCase());
                            const info2 = basicInfo.find(t => t.tokenContractAddress.toLowerCase() === toTokenAddress.toLowerCase());

                            if (info1) {
                                router.fromTokenSymbol = router.fromTokenSymbol || info1.tokenSymbol;
                                router.fromToken = router.fromToken || {};
                                router.fromToken.decimal = router.fromToken.decimal || info1.decimal;
                                router.fromToken.tokenUnitPrice = router.fromToken.tokenUnitPrice || info1.tokenPrice;
                            }
                            if (info2) {
                                router.toTokenSymbol = router.toTokenSymbol || info2.tokenSymbol;
                                router.toToken = router.toToken || {};
                                router.toToken.decimal = router.toToken.decimal || info2.decimal;
                                router.toToken.tokenUnitPrice = router.toToken.tokenUnitPrice || info2.tokenPrice;
                            }
                            quote.routerResult = router;
                        }
                    } catch (e) {
                        log.child('SWAPQUOTE').warn('Fallback basic info error:', e.message);
                    }
                }
            }

            // Enhancement #5: Log swap quote to DB for history tracking
            try {
                const quoteRouter = (Array.isArray(data) ? data[0] : data)?.routerResult || {};
                const { dbRun } = require('../../../../db/core');
                await dbRun(`CREATE TABLE IF NOT EXISTS swap_quote_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId TEXT, chainIndex TEXT, fromToken TEXT, toToken TEXT,
                    fromSymbol TEXT, toSymbol TEXT, amount TEXT, quoteAmount TEXT,
                    priceImpact TEXT, createdAt INTEGER
                )`);
                await dbRun('INSERT INTO swap_quote_history (userId, chainIndex, fromToken, toToken, fromSymbol, toSymbol, amount, quoteAmount, priceImpact, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [context?.userId, chainIndex, fromTokenAddress, toTokenAddress, quoteRouter.fromTokenSymbol || '?', quoteRouter.toTokenSymbol || '?', args.amount, quoteRouter.toTokenAmount || '0', quoteRouter.priceImpactPercentage || '0', Math.floor(Date.now() / 1000)]);
            } catch (dbErr) { log.child('SWAPQUOTE').warn('History log failed:', dbErr.message); }

            // ── #2: Multi-swap combined indicator ──
            const quoteResult = formatSwapQuoteResult(data, context?.lang);
            const msUserId = context?.userId;
            if (msUserId && global._pendingMultiSwaps?.has(msUserId)) {
                const qSize = global._pendingMultiSwaps.get(msUserId).length + 1; // +1: current swap not yet queued
                if (qSize > 1) {
                    const msI = {
                        en: `\n\n📋 <b>[${qSize} swaps queued]</b> — Reply "ok" to execute all.`,
                        vi: `\n\n📋 <b>[${qSize} swap đang chờ]</b> — Trả lời "ok" để thực hiện tất cả.`,
                        zh: `\n\n📋 <b>[${qSize} 笔兑换排队中]</b> — 回复"ok"执行全部。`,
                        ko: `\n\n📋 <b>[${qSize} 스왑 대기 중]</b> — "ok" 입력하여 모두 실행.`,
                        ru: `\n\n📋 <b>[${qSize} обменов в очереди]</b> — "ok" для выполнения.`,
                        id: `\n\n📋 <b>[${qSize} swap antrian]</b> — Balas "ok" untuk eksekusi.`
                    };
                    let ql = context?.lang || 'en';
                    try { const { getUserLanguage: gUL4a } = require('../../../../db/users'); const dl4a = await gUL4a(String(context?.chatId || context?.msg?.chat?.id || context?.userId)); if (dl4a) ql = dl4a; } catch(_) {}
                    const qlk = ['zh-Hans','zh-cn'].includes(ql) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(ql) ? ql : 'en');
                    if (quoteResult.displayMessage) quoteResult.displayMessage += msI[qlk] || msI.en;
                }
            }
            return quoteResult;
        } catch (error) {
            const lang = context?.lang || 'en';
            // Use DB language for reliable detection
            let errLang = lang;
            try {
                const { getUserLanguage: gUL4b } = require('../../../../db/users');
                const dl4b = await gUL4b(String(context?.chatId || context?.msg?.chat?.id || context?.userId)); if (dl4b) errLang = dl4b;
            } catch (e) { /* fallback */ }
            let title = 'SWAP QUOTE ERROR';
            let reasonLabel = 'Reason:';
            let codeLabel = 'Code:';
            let hintMsg = 'Please try another amount or check token liquidity.';

            if (errLang === 'vi') {
                title = 'LỖI BÁO GIÁ SWAP';
                reasonLabel = 'Lý do:';
                codeLabel = 'Mã lỗi:';
                hintMsg = 'Vui lòng thử lại với số lượng khác hoặc kiểm tra lại thanh khoản của token này.';
            } else if (errLang === 'zh' || errLang === 'zh-cn' || errLang === 'zh-Hans') {
                title = '兑换报价错误';
                reasonLabel = '原因:';
                codeLabel = '错误代码:';
                hintMsg = '请尝试其他数量或检查此代币的流动性。';
                        } else if (errLang === 'ko') {
                title = '스왑 견적 오류';
                reasonLabel = '원인:';
                codeLabel = '오류 코드:';
                hintMsg = '다른 수량을 시도하거나 토큰 유동성을 확인하세요.';
            } else if (errLang === 'ru') {
                title = 'ОШИБКА КОТИРОВКИ';
                reasonLabel = 'Причина:';
                codeLabel = 'Код ошибки:';
                hintMsg = 'Попробуйте другую сумму или проверьте ликвидность.';
            } else if (errLang === 'id') {
                title = 'ERROR KUOTASI SWAP';
                reasonLabel = 'Alasan:';
                codeLabel = 'Kode error:';
                hintMsg = 'Coba jumlah lain atau periksa likuiditas token.';
}

            return {
                displayMessage: `❌ <b>${title}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `<b>${reasonLabel}</b> ${error.msg || error.message}\n` +
                    `<b>${codeLabel}</b> ${error.code || 'N/A'}\n\n` +
                    `<i>${hintMsg}</i>`
            };
        }
    },

    async execute_swap(args, context) {
        const { dbGet } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';

        try {
            // 1. Get trading wallet
            const tw = args.walletId
                ? await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [parseInt(args.walletId), userId])
                : await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
            if (!tw) return '❌ Không tìm thấy ví trading. Tạo ví bằng manage_trading_wallet trước.';

            // 2. Decrypt private key + dynamic RPC
            if (!global._decryptTradingKey) return '❌ Hệ thống chưa sẵn sàng để ký giao dịch.';
            const privateKey = global._decryptTradingKey(tw.encryptedKey);
            const ethers = require('ethers');
            let chainIndex = args.chainIndex || '196';
            const chainIdNum = parseInt(chainIndex);

            let fromTokenAddress = args.fromTokenAddress;
            let toTokenAddress = args.toTokenAddress;

            if (!fromTokenAddress || !toTokenAddress || (!args.amount && args.amount !== 0)) {
                return { displayMessage: '> IMPORTANT INSTRUCTION: Display this swap execution error naturally to the user in their language.\n\n❌ **Swap Error:** Missing from/to token address or swap amount. Please verify your command.' };
            }

            if (fromTokenAddress && !fromTokenAddress.startsWith('0x') && fromTokenAddress.length < 20) {
                const resolved = await autoResolveToken(fromTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                fromTokenAddress = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }
            if (toTokenAddress && !toTokenAddress.startsWith('0x') && toTokenAddress.length < 20) {
                const resolved = await autoResolveToken(toTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                toTokenAddress = resolved.tokenAddress;
            }

            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);

            log.child('AUTOSWAP').info(`Starting swap for user ${userId}, wallet ${tw.address}, chain ${chainIndex}`);

            // 3. Check if we need ERC-20 approval (skip for native token)
            const isNativeFrom = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            if (!isNativeFrom) {
                try {
                    log.child('AUTOSWAP').info(`Getting approval for ${fromTokenAddress}...`);
                    const approveData = await onchainos.getApproveTransaction(
                        chainIndex,
                        fromTokenAddress.toLowerCase(),
                        args.amount
                    );
                    if (approveData && Array.isArray(approveData) && approveData.length > 0) {
                        const approval = approveData[0];
                        if (approval.data && approval.data !== '0x' && approval.dexContractAddress) {
                            // Check against the actual chain allowance
                            const erc20AllowanceAbi = ["function allowance(address owner, address spender) view returns (uint256)"];
                            const tokenContract = new ethers.Contract(fromTokenAddress.toLowerCase(), erc20AllowanceAbi, provider);
                            let currentAllowance = 0n;
                            try {
                                currentAllowance = await tokenContract.allowance(tw.address, approval.dexContractAddress);
                            } catch (e) { log.child('AUTOSWAP').error('Error reading allowance, defaulting to 0'); }

                            if (currentAllowance < BigInt(args.amount)) {
                                log.child('AUTOSWAP').info(`Allowance ${currentAllowance} < ${args.amount}. Approving INFINITE amount...`);
                                // Generate infinite approve data using ethers
                                const erc20Interface = new ethers.Interface(["function approve(address spender, uint256 amount) public returns (bool)"]);
                                const infiniteApproveData = erc20Interface.encodeFunctionData("approve", [approval.dexContractAddress, ethers.MaxUint256]);

                                // Sign and broadcast approval tx
                                const approveTx = await wallet.signTransaction({
                                    to: fromTokenAddress.toLowerCase(), // send to TOKEN contract
                                    data: infiniteApproveData,
                                    value: 0n,
                                    gasLimit: BigInt(approval.gasLimit || '150000'), // Increased from 100k for complex tokens
                                    gasPrice: BigInt(approval.gasPrice || '1000000000'),
                                    nonce: await provider.getTransactionCount(wallet.address, 'pending'),
                                    chainId: chainIdNum
                                });
                                const approveResult = await onchainos.broadcastTransaction(approveTx, chainIndex, tw.address);
                                log.child('AUTOSWAP').info(`Approve broadcast:`, JSON.stringify(approveResult));
                                // Poll for approval confirmation (max 30s)
                                const approveOrderId = (Array.isArray(approveResult) ? approveResult[0] : approveResult)?.orderId;
                                if (approveOrderId) {
                                    for (let i = 0; i < 10; i++) {
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        try {
                                            const status = await onchainos.getOrderStatus(tw.address, chainIndex, { orderId: approveOrderId });
                                            const order = Array.isArray(status) ? status[0] : status;
                                            const orders = order?.orders || [];
                                            const found = orders.find(o => o.orderId === approveOrderId);
                                            if (found && found.txStatus === '2') { log.child('AUTOSWAP').info(`Approve confirmed!`); break; }
                                            if (found && found.txStatus === '3') { log.child('AUTOSWAP').info(`Approve failed, continuing anyway`); break; }
                                        } catch (pollErr) { /* ignore polling errors */ }
                                    }
                                } else {
                                    // Fallback: wait 5s if no orderId returned
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                }
                            } else {
                                log.child('AUTOSWAP').info(`Allowance is sufficient (${currentAllowance}). Skipping approve tx.`);
                            }
                        }
                    }
                } catch (approveErr) {
                    log.child('AUTOSWAP').error('Approve error:', approveErr.msg || approveErr.message);
                    // Block swap if approve failed — tx will revert anyway
                    let apLang = context?.lang || 'en';
                    try { const { getUserLanguage: gApL } = require('../../../../db/users'); const dal = await gApL(String(context?.chatId || context?.msg?.chat?.id || userId)); if (dal) apLang = dal; } catch(_){}
                    const apLk = ['zh-Hans','zh-cn'].includes(apLang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(apLang) ? apLang : 'en');
                    const apTitles = { en: 'APPROVE FAILED', vi: 'PHÊ DUYỆT THẤT BẠI', zh: '授权失败', ko: '승인 실패', ru: 'ОШИБКА ОДОБРЕНИЯ', id: 'APPROVE GAGAL' };
                    const apReasons = { en: 'Token approval failed. Swap cannot proceed.', vi: 'Phê duyệt token thất bại. Không thể tiếp tục swap.', zh: '代币授权失败，无法执行兑换。', ko: '토큰 승인 실패. 스왑 불가.', ru: 'Ошибка одобрения токена. Обмен невозможен.', id: 'Persetujuan token gagal. Swap tidak bisa dilanjutkan.' };
                    return { displayMessage: `❌ <b>${apTitles[apLk]||apTitles.en}</b>\n━━━━━━━━━━━━━━━━━━\n⚠️ ${apReasons[apLk]||apReasons.en}\n💡 <i>${approveErr.msg||approveErr.message}</i>`, action: true, success: false };
                }
            }

            // 4. Get swap quote to determine Auto Slippage
            log.child('AUTOSWAP').info(`Getting swap quote to determine dynamic auto-slippage...`);

            // --- Phase 5 Auto-Decimal Resolution for execution ---
            let originalAmount = args.amount;
            if (originalAmount && !originalAmount.includes('00000000') && !originalAmount.includes('e+') && originalAmount.length < 16) {
                try {
                    const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                    if (basicInfo && basicInfo.length > 0) {
                        const resolvedDecimals = Number(basicInfo[0].decimal || 18);
                        // Use ethers.parseUnits for precision-safe conversion
                        args.amount = ethers.parseUnits(String(originalAmount), resolvedDecimals).toString();
                        log.child('AUTOSWAP').info(`Auto-converted amount ${originalAmount} to ${args.amount} wei based on ${resolvedDecimals} decimals`);
                    }
                } catch (e) { log.child('AUTOSWAP').error('Failed auto-decimal:', e.message); }
            }
            // ----------------------------------------

            let quoteData;
            try {
                quoteData = await onchainos.getSwapQuote({
                    chainIndex,
                    fromTokenAddress: fromTokenAddress,
                    toTokenAddress: toTokenAddress,
                    amount: args.amount
                });
            } catch (quoteErr) {
                if (quoteErr.code === '82112' || (quoteErr.msg && quoteErr.msg.includes('value difference'))) {
                    log.child('AUTOSWAP').error('High price impact 82112 error intercepted:', quoteErr.msg);
                    return { displayMessage: '❌ <b>Lỗi Swap (Price Impact > 90%):</b>\nSố lượng bạn muốn Swap quá lớn so với mức thanh khoản siêu bé của Pool này. Hệ thống OKX đã chặn lệnh để bảo vệ bạn khỏi việc mất hơn 90% tài sản do trượt giá.\n\n👉 <i>Vui lòng Swap từng lượng nhỏ hơn rất nhiều.</i>' };
                }
                throw quoteErr;
            }
            const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;

            // Calculate dynamic slippage
            let dynamicSlippage = Number(args.slippagePercent || '0');
            if (quote?.routerResult?.priceImpactPercentage) {
                const impact = Number(quote.routerResult.priceImpactPercentage);
                // Auto slippage formula: Base impact + 2% buffer + floor of 3%
                const suggestedSlippage = Math.max(3, Math.ceil(impact + 2));
                if (suggestedSlippage > dynamicSlippage) {
                    dynamicSlippage = suggestedSlippage;
                }
            } else if (dynamicSlippage === 0) {
                dynamicSlippage = 10; // Aggressive fallback for unknowns
            }

            // Cap slippage at 50% max to prevent sandwich attacks
            dynamicSlippage = Math.min(50, dynamicSlippage);
            log.child('AUTOSWAP').info(`Calculated Slippage: ${dynamicSlippage}%`);

            // ── #3: High slippage warning (>15%) ──
            if (dynamicSlippage > 15) {
                try {
                    const slipChatId = context?.chatId || context?.msg?.chat?.id;
                    if (slipChatId) {
                        let slipBot; try { slipBot = require('../../../core/bot').bot; } catch(_){}
                        if (slipBot) {
                            let slipLang = context?.lang || 'en';
                            try { const { getUserLanguage: gUL4c } = require('../../../../db/users'); const dl4c = await gUL4c(String(context?.chatId || context?.msg?.chat?.id || userId)); if (dl4c) slipLang = dl4c; } catch(_){}
                            const slk = ['zh-Hans','zh-cn'].includes(slipLang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(slipLang) ? slipLang : 'en');
                            const slipTexts = {
                                en: `⚠️ <b>HIGH SLIPPAGE</b>\n📊 ${dynamicSlippage}% — You may lose up to ${dynamicSlippage}% of value.`,
                                vi: `⚠️ <b>TRƯỢT GIÁ CAO</b>\n📊 ${dynamicSlippage}% — Có thể mất đến ${dynamicSlippage}% giá trị.`,
                                zh: `⚠️ <b>高滑点</b>\n📊 ${dynamicSlippage}% — 可能损失 ${dynamicSlippage}% 价值。`,
                                ko: `⚠️ <b>높은 슬리페지</b>\n📊 ${dynamicSlippage}% — 최대 ${dynamicSlippage}% 손실 가능.`,
                                ru: `⚠️ <b>ВЫСОКИЙ СЛИППЕЙДЖ</b>\n📊 ${dynamicSlippage}% — Потеря до ${dynamicSlippage}%.`,
                                id: `⚠️ <b>SLIPPAGE TINGGI</b>\n📊 ${dynamicSlippage}% — Kehilangan hingga ${dynamicSlippage}%.`
                            };
                            await slipBot.sendMessage(slipChatId, slipTexts[slk] || slipTexts.en, { parse_mode: 'HTML', disable_notification: true });
                        }
                    }
                } catch (slipErr) { log.child('AUTOSWAP').warn('Slippage warn:', slipErr.message); }
            }

            // ── Large Swap Confirmation (>$50 estimated value) ──
            try {
                const chatId = context?.chatId || context?.msg?.chat?.id;
                if (chatId && quote?.routerResult) {
                    let usdValue = 0;
                    try {
                        const fromTokenPrice = Number(quote.routerResult.fromToken?.tokenUnitPrice || 0);
                        const fromAmount = Number(originalAmount || args.amount);
                        usdValue = fromTokenPrice * fromAmount;
                        if (usdValue > 1e10) {
                            const dec = Number(quote.routerResult.fromToken?.decimal || 18);
                            usdValue = fromTokenPrice * (fromAmount / Math.pow(10, dec));
                        }
                    } catch (_) {}
                    if (usdValue > 50) {
                        let confirmBot;
                        try { confirmBot = require('../../../core/bot').bot; } catch (_) {}
                        if (confirmBot) {
                            let lang = context?.lang || 'en';
                            try { const { getUserLanguage: gUL5c } = require('../../../../db/users'); const dl5c = await gUL5c(String(context?.chatId || context?.msg?.chat?.id || userId)); if (dl5c) lang = dl5c; } catch (_) {}
                            const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');
                            const confirmTexts = {
                                en: `⚠️ <b>Large Swap Confirmation</b>\n━━━━━━━━━━━━━━━━━━\n💱 <b>Amount:</b> <code>${originalAmount}</code> ${quote.routerResult.fromTokenSymbol || '?'}\n💰 <b>Est. Value:</b> ~$${usdValue.toFixed(2)}\n📊 <b>Slippage:</b> ${dynamicSlippage}%\n\n<i>Confirm?</i>`,
                                vi: `⚠️ <b>Xác Nhận Swap Lớn</b>\n━━━━━━━━━━━━━━━━━━\n💱 <b>Số lượng:</b> <code>${originalAmount}</code> ${quote.routerResult.fromTokenSymbol || '?'}\n💰 <b>Giá trị:</b> ~$${usdValue.toFixed(2)}\n📊 <b>Trượt giá:</b> ${dynamicSlippage}%\n\n<i>Xác nhận?</i>`,
                                zh: `⚠️ <b>大额兑换确认</b>\n━━━━━━━━━━━━━━━━━━\n💱 <b>数量:</b> <code>${originalAmount}</code> ${quote.routerResult.fromTokenSymbol || '?'}\n💰 <b>估值:</b> ~$${usdValue.toFixed(2)}\n📊 <b>滑点:</b> ${dynamicSlippage}%\n\n<i>确认?</i>`,
                                ko: `⚠️ <b>대량 스왑 확인</b>\n━━━━━━━━━━━━━━━━━━\n💱 <b>수량:</b> <code>${originalAmount}</code> ${quote.routerResult.fromTokenSymbol || '?'}\n💰 <b>가치:</b> ~$${usdValue.toFixed(2)}\n📊 <b>슬리페지:</b> ${dynamicSlippage}%\n\n<i>확인?</i>`,
                                ru: `⚠️ <b>Подтверждение обмена</b>\n━━━━━━━━━━━━━━━━━━\n💱 <b>Сумма:</b> <code>${originalAmount}</code> ${quote.routerResult.fromTokenSymbol || '?'}\n💰 <b>Стоимость:</b> ~$${usdValue.toFixed(2)}\n📊 <b>Слиппейдж:</b> ${dynamicSlippage}%\n\n<i>Подтвердить?</i>`,
                                id: `⚠️ <b>Konfirmasi Swap Besar</b>\n━━━━━━━━━━━━━━━━━━\n💱 <b>Jumlah:</b> <code>${originalAmount}</code> ${quote.routerResult.fromTokenSymbol || '?'}\n💰 <b>Estimasi:</b> ~$${usdValue.toFixed(2)}\n📊 <b>Slippage:</b> ${dynamicSlippage}%\n\n<i>Konfirmasi?</i>`
                            };
                            const btnTexts = { en: ['✅ Confirm', '❌ Cancel'], vi: ['✅ Xác nhận', '❌ Hủy'], zh: ['✅ 确认', '❌ 取消'], ko: ['✅ 확인', '❌ 취소'], ru: ['✅ Да', '❌ Отмена'], id: ['✅ Konfirmasi', '❌ Batal'] };
                            const swapConfirmId = `swapconfirm_${userId}_${Date.now()}`;
                            try {
                                const confirmMsg = await confirmBot.sendMessage(chatId, confirmTexts[lk] || confirmTexts.en, {
                                    parse_mode: 'HTML',
                                    reply_markup: { inline_keyboard: [[ { text: (btnTexts[lk] || btnTexts.en)[0], callback_data: `swapconfirm|yes_${swapConfirmId}` }, { text: (btnTexts[lk] || btnTexts.en)[1], callback_data: `swapconfirm|no_${swapConfirmId}` } ]] }
                                });
                                const confirmed = await new Promise(resolve => {
                                    const key = `swapconfirm_${swapConfirmId}`;
                                    if (!global._pendingSwapConfirms) global._pendingSwapConfirms = new Map();
                                    global._pendingSwapConfirms.set(key, resolve);
                                    setTimeout(() => { if (global._pendingSwapConfirms.has(key)) { global._pendingSwapConfirms.delete(key); resolve('timeout'); } }, 60000);
                                });
                                try { await confirmBot.deleteMessage(chatId, confirmMsg.message_id); } catch (_) {}
                                if (confirmed === 'cancel') {
                                    const cancelTexts = { en: 'Swap cancelled.', vi: 'Đã hủy swap.', zh: '已取消。', ko: '취소됨.', ru: 'Отменён.', id: 'Dibatalkan.' };
                                    return { displayMessage: `❌ ${cancelTexts[lk] || cancelTexts.en}`, action: true, success: false };
                                }
                            } catch (confirmErr) { log.child('AUTOSWAP').warn('Swap confirm failed, proceeding:', confirmErr.message); }
                        }
                    }
                }
            } catch (confirmSetupErr) { log.child('AUTOSWAP').warn('Swap confirm error, proceeding:', confirmSetupErr.message); }

            // Enhancement #3: Balance pre-check before calling OKX API
            try {
                const balCheck = await checkTokenBalance(provider, tw.address, fromTokenAddress, args.amount, chainIndex);
                if (!balCheck.sufficient) {
                    const lang = context?.lang || 'en';
                    let msg;
                    if (lang === 'vi') {
                        msg = `❌ <b>SỐ DƯ KHÔNG ĐỦ</b>\n━━━━━━━━━━━━━━━━━━\n💰 Số dư hiện tại: <code>${balCheck.balance}</code> ${balCheck.symbol}\n📊 Cần: <code>${balCheck.required}</code> ${balCheck.symbol}\n\n<i>Vui lòng nạp thêm token hoặc giảm số lượng swap.</i>`;
                    } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
                        msg = `❌ <b>余额不足</b>\n━━━━━━━━━━━━━━━━━━\n💰 当前余额: <code>${balCheck.balance}</code> ${balCheck.symbol}\n📊 需要: <code>${balCheck.required}</code> ${balCheck.symbol}\n\n<i>请充值代币或减少兑换数量。</i>`;
                    } else if (lang === 'ko') {
                        msg = `❌ <b>잔액 부족</b>\n━━━━━━━━━━━━━━━━━━\n💰 현재: <code>${balCheck.balance}</code> ${balCheck.symbol}\n📊 필요: <code>${balCheck.required}</code> ${balCheck.symbol}\n\n<i>토큰을 더 입금하거나 스왑 수량을 줄이세요.</i>`;
                    } else if (lang === 'ru') {
                        msg = `❌ <b>НЕДОСТАТОЧНЫЙ БАЛАНС</b>\n━━━━━━━━━━━━━━━━━━\n💰 Текущий: <code>${balCheck.balance}</code> ${balCheck.symbol}\n📊 Необходимо: <code>${balCheck.required}</code> ${balCheck.symbol}\n\n<i>Пополните баланс или уменьшите сумму обмена.</i>`;
                    } else if (lang === 'id') {
                        msg = `❌ <b>SALDO TIDAK CUKUP</b>\n━━━━━━━━━━━━━━━━━━\n💰 Saat ini: <code>${balCheck.balance}</code> ${balCheck.symbol}\n📊 Dibutuhkan: <code>${balCheck.required}</code> ${balCheck.symbol}\n\n<i>Silakan deposit lebih banyak token atau kurangi jumlah swap.</i>`;
                    } else {
                        msg = `❌ <b>INSUFFICIENT BALANCE</b>\n━━━━━━━━━━━━━━━━━━\n💰 Current: <code>${balCheck.balance}</code> ${balCheck.symbol}\n📊 Required: <code>${balCheck.required}</code> ${balCheck.symbol}\n\n<i>Please deposit more tokens or reduce swap amount.</i>`;
                    }
                    return { displayMessage: msg };
                }
            } catch (balErr) {
                log.child('AUTOSWAP').warn('Balance pre-check skipped:', balErr.message);
            }

            // 5. Get swap calldata
            log.child('AUTOSWAP').info(`Getting swap transaction data with slippage ${dynamicSlippage}%...`);
            const txData = await onchainos.getSwapTransaction({
                chainIndex,
                fromTokenAddress: fromTokenAddress,
                toTokenAddress: toTokenAddress,
                amount: args.amount,
                userWalletAddress: tw.address,
                slippagePercent: String(dynamicSlippage)
            });

            const txRaw = Array.isArray(txData) ? txData[0] : txData;
            if (!txRaw || !txRaw.tx) {
                return { displayMessage: '> IMPORTANT INSTRUCTION: Display this swap execution error naturally to the user in their language.\n\n❌ **Swap Error:**\nInsufficient Liquidity or Slippage too high. Please try a smaller amount.' };
            }

            // 5. Sign the swap transaction
            const tx = txRaw.tx;
            log.child('AUTOSWAP').info(`Signing swap tx...`);
            const signedTx = await wallet.signTransaction({
                to: tx.to,
                data: tx.data,
                value: BigInt(tx.value || '0'),
                gasLimit: BigInt(tx.gas || tx.gasLimit || '300000'),
                gasPrice: BigInt(tx.gasPrice || '1000000000'),
                nonce: await provider.getTransactionCount(wallet.address, 'pending'),
                chainId: chainIdNum
            });

            // 6. Broadcast (with retry for RPC failures)
            log.child('AUTOSWAP').info(`Broadcasting swap tx...`);
            const broadcastResult = await rpcRetry(
                () => onchainos.broadcastTransaction(signedTx, chainIndex, tw.address),
                3, 'AUTO-SWAP-BROADCAST'
            );
            const result = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
            const txHash = result?.txHash || result?.orderId || 'pending';
            const orderId = result?.orderId || 'N/A';
            const explorerBase = _getExplorerUrl(chainIndex);
            const explorerLink = `${explorerBase}/tx/${txHash}`;

            // 6b. Verify transaction receipt on-chain
            let txConfirmed = true;
            if (txHash && txHash !== 'pending') {
                try {
                    log.child('AUTOSWAP').info('Waiting for tx receipt...');
                    const receipt = await provider.waitForTransaction(txHash, 1, 30000); // 1 confirmation, 30s timeout
                    if (receipt && receipt.status === 0) {
                        txConfirmed = false;
                        log.child('AUTOSWAP').warn('❌ Transaction REVERTED on-chain: ' + txHash);
                        // Return failure with explorer link
                        let lang = context?.lang || 'en';
                        try { const { getUserLanguage: gUL } = require('../../../../db/users'); const dl = await gUL(String(context?.chatId || context?.msg?.chat?.id || userId)); if (dl) lang = dl; } catch(_){}
                        const failTitles = { en: 'SWAP FAILED', vi: 'SWAP THẤT BẠI', zh: '兑换失败', ko: '스왑 실패', ru: 'ОБМЕН НЕ УДАЛСЯ', id: 'SWAP GAGAL' };
                        const failReasons = { en: 'Transaction reverted on-chain', vi: 'Giao dịch bị revert trên blockchain', zh: '交易在链上回滚', ko: '트랜잭션 되돌림', ru: 'Транзакция отменена', id: 'Transaksi gagal on-chain' };
                        const failHints = { en: 'Possible causes: slippage too low, insufficient liquidity, or token restrictions.', vi: 'Nguyên nhân: slippage thấp, thanh khoản không đủ, hoặc token bị hạn chế.', zh: '可能原因：滑点过低、流动性不足或代币限制。', ko: '원인: 슬리피지 부족, 유동성 부족, 또는 토큰 제한.', ru: 'Причины: низкий слиппейдж, недостаточная ликвидность или ограничения токена.', id: 'Penyebab: slippage rendah, likuiditas kurang, atau batasan token.' };
                        const lk = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
                        return {
                            displayMessage: `❌ <b>${failTitles[lk] || failTitles.en}</b>\n━━━━━━━━━━━━━━━━━━\n⚠️ ${failReasons[lk] || failReasons.en}\n💡 <i>${failHints[lk] || failHints.en}</i>\n\n🔗 <a href="${explorerLink}">TxHash: ${txHash.slice(0,18)}...</a>`,
                            action: true, success: false
                        };
                    } else {
                        log.child('AUTOSWAP').info('✅ Transaction confirmed on-chain!');
                    }
                } catch (receiptErr) {
                    // Timeout or error — log but don't block (tx might still be pending)
                    log.child('AUTOSWAP').warn('Receipt check timeout/error (tx may still be pending):', receiptErr.message);
                }
            }

            // 7. Parse result amounts
            const routerResult = txRaw.routerResult || {};
            let fromSym = routerResult.fromTokenSymbol;
            let toSym = routerResult.toTokenSymbol;
            let fromDec = Number(routerResult.fromToken?.decimal);
            let toDec = Number(routerResult.toToken?.decimal);

            // Fetch missing symbols/decimals dynamically
            if (!fromSym || !toSym || isNaN(fromDec) || isNaN(toDec) || fromDec === 0 || toDec === 0) {
                try {
                    const basicInfo = await onchainos.getTokenBasicInfo([
                        { chainIndex, tokenContractAddress: fromTokenAddress },
                        { chainIndex, tokenContractAddress: toTokenAddress }
                    ]);
                    if (basicInfo && basicInfo.length > 0) {
                        const info1 = basicInfo.find(t => t.tokenContractAddress.toLowerCase() === fromTokenAddress.toLowerCase());
                        const info2 = basicInfo.find(t => t.tokenContractAddress.toLowerCase() === toTokenAddress.toLowerCase());
                        if (!fromSym && info1) fromSym = info1.tokenSymbol;
                        if (!toSym && info2) toSym = info2.tokenSymbol;
                        if ((isNaN(fromDec) || fromDec === 0) && info1) fromDec = Number(info1.decimal || 18);
                        if ((isNaN(toDec) || toDec === 0) && info2) toDec = Number(info2.decimal || 18);
                    }
                } catch (e) {
                    // Ignore, fallback to defaults
                }
            }

            fromSym = fromSym || '?';
            toSym = toSym || '?';
            fromDec = isNaN(fromDec) || fromDec === 0 ? 18 : fromDec;
            toDec = isNaN(toDec) || toDec === 0 ? 18 : toDec;

            const fromAmt = (Number(routerResult.fromTokenAmount || args.amount) / Math.pow(10, fromDec)).toLocaleString('en-US', { maximumFractionDigits: 6 });
            const toAmt = (Number(routerResult.toTokenAmount || 0) / Math.pow(10, toDec)).toLocaleString('en-US', { maximumFractionDigits: 6 });

            // Log moved after receipt check
            log.child('AUTOSWAP').info(`${txConfirmed ? '✅ Success' : '❌ Reverted'}! TxHash: ${txHash}`);
            // ── Save swap to history (with status) ──
            try {
                const { dbRun } = require('../../../../db/core');
                await dbRun(`CREATE TABLE IF NOT EXISTS swap_history (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, walletAddress TEXT, chainIndex TEXT, fromToken TEXT, toToken TEXT, fromSymbol TEXT, toSymbol TEXT, fromAmount TEXT, toAmount TEXT, txHash TEXT, orderId TEXT, slippage REAL, status TEXT DEFAULT 'success', createdAt TEXT DEFAULT (datetime('now')))`);
                await dbRun('INSERT INTO swap_history (userId,walletAddress,chainIndex,fromToken,toToken,fromSymbol,toSymbol,fromAmount,toAmount,txHash,orderId,slippage,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [String(userId), tw.address, chainIndex, fromTokenAddress, toTokenAddress, fromSym||'?', toSym||'?', String(originalAmount||args.amount), String(routerResult.toTokenAmount||'0'), txHash, orderId, dynamicSlippage, txConfirmed ? 'success' : 'reverted']);
            } catch (dbErr) { log.child('AUTOSWAP').warn('Swap history save failed:', dbErr.message); }


            // Use the user's actual DB-stored language preference (not prompt-detected lang which fails on "ok")
            let lang = context?.lang || 'en';
            try {
                const { getUserLanguage: getULang } = require('../../../../db/users');
                const chatKey = String(context?.chatId || context?.msg?.chat?.id || userId);
                const dbL = await getULang(chatKey);
                if (dbL) lang = dbL;
            } catch (e) { /* fallback to context.lang */ }
            let title = 'SWAP SUCCESS';
            let swappedLabel = 'Swapped:';
            let walletLabel = 'Wallet:';
            let orderLabel = 'Order ID:';
            let linkLabel = 'View on Explorer';

            if (lang === 'vi') {
                title = 'SWAP THÀNH CÔNG';
                swappedLabel = 'Đã đổi:';
                walletLabel = 'Ví:';
                orderLabel = 'Order ID:';
                linkLabel = 'Xem trên Explorer';
            } else if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-Hans') {
                title = '兑换成功';
                swappedLabel = '已兑换:';
                walletLabel = '钱包:';
                orderLabel = '订单 ID:';
                linkLabel = '在区块浏览中查看';
                        } else if (lang === 'ko') {
                title = '스왑 성공';
                swappedLabel = '교환:';
                walletLabel = '지갑:';
                orderLabel = '주문 ID:';
                linkLabel = '탐색기에서 보기';
            } else if (lang === 'ru') {
                title = 'ОБМЕН ВЫПОЛНЕН';
                swappedLabel = 'Обмен:';
                walletLabel = 'Кошелёк:';
                orderLabel = 'ID ордера:';
                linkLabel = 'Посмотреть в обозревателе';
            } else if (lang === 'id') {
                title = 'SWAP BERHASIL';
                swappedLabel = 'Ditukar:';
                walletLabel = 'Dompet:';
                orderLabel = 'ID Pesanan:';
                linkLabel = 'Lihat di Explorer';
}

            // Calculate USD value for display
            let usdLine = '';
            try {
                const fromPrice = Number(routerResult.fromToken?.tokenUnitPrice || 0);
                const toPrice = Number(routerResult.toToken?.tokenUnitPrice || 0);
                const fromUsd = Number(routerResult.fromTokenAmount || args.amount) / Math.pow(10, fromDec) * fromPrice;
                const toUsd = Number(routerResult.toTokenAmount || 0) / Math.pow(10, toDec) * toPrice;
                const displayUsd = toUsd > 0 ? toUsd : fromUsd;
                if (displayUsd > 0.001) {
                    const usdLabels = { en: 'Value', vi: 'Giá trị', zh: '价值', ko: '가치', ru: 'Стоимость', id: 'Nilai' };
                    const lk3 = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
                    usdLine = `\n💰 <b>${usdLabels[lk3] || usdLabels.en}:</b> ~${displayUsd.toFixed(displayUsd < 1 ? 6 : 2)}`;
                }
            } catch(_) {}
            return {
                action: true, success: txConfirmed,
                displayMessage: `🟢 <b>${title}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `💱 <b>${swappedLabel}</b> <code>${fromAmt}</code> ${fromSym} ➔ <code>${toAmt}</code> ${toSym}${usdLine}\n` +
                    `👛 <b>${walletLabel}</b> <code>${tw.address}</code>\n` +
                    `🏷️ <b>${orderLabel}</b> <code>${orderId}</code>\n\n` +
                    `🔗 <a href="${explorerLink}">${linkLabel}</a>`
            };

        } catch (error) {
            log.child('AUTOSWAP').error(`Error:`, error.msg || error.message || error);
            const lang2 = context?.lang || 'en';
            let title = 'SWAP EXECUTION ERROR';
            let reasonLabel = 'Reason:';
            let hintMsg = 'Please verify your liquidity, balance, or try again later.';

            if (lang2 === 'vi') {
                title = 'LỖI THỰC HIỆN SWAP';
                reasonLabel = 'Lý do:';
                hintMsg = 'Vui lòng kiểm tra lại thanh khoản, số dư hoặc thử lại sau.';
            } else if (lang2 === 'zh' || lang2 === 'zh-cn' || lang2 === 'zh-Hans') {
                title = '兑换执行错误';
                reasonLabel = '原因:';
                hintMsg = '请检查您的流动性、余额，或稍后重试。';
                        } else if (lang2 === 'ko') {
                title = '스왑 실행 오류';
                reasonLabel = '원인:';
                hintMsg = '유동성, 잔액을 확인하거나 나중에 다시 시도하세요.';
            } else if (lang2 === 'ru') {
                title = 'ОШИБКА ОБМЕНА';
                reasonLabel = 'Причина:';
                hintMsg = 'Проверьте ликвидность, баланс или попробуйте позже.';
            } else if (lang2 === 'id') {
                title = 'ERROR EKSEKUSI SWAP';
                reasonLabel = 'Alasan:';
                hintMsg = 'Periksa likuiditas, saldo, atau coba lagi nanti.';
}

            return {
                displayMessage: `❌ <b>${title}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `<b>${reasonLabel}</b> ${error.msg || error.message || 'Unknown error'}\n\n` +
                    `<i>${hintMsg}</i>`
            };
        }
    },

    async batch_swap(args, context) {
        const { dbGet } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';

        try {
            if (!args.swaps || args.swaps.length === 0) {
                return '❌ Vui lòng cung cấp danh sách ví và số lượng cần swap (swaps array).';
            }

            const swaps = args.swaps;
            if (swaps.length === 1) return '⚠️ Chỉ có 1 ví. Dùng execute_swap thay vì batch_swap.';

            if (!global._decryptTradingKey) return '❌ Hệ thống chưa sẵn sàng.';
            const ethers = require('ethers');
            let chainIndex = args.chainIndex || '196';
            const chainIdNum = parseInt(chainIndex);

            let fromTokenAddress = args.fromTokenAddress;
            let toTokenAddress = args.toTokenAddress;

            if (!fromTokenAddress || !toTokenAddress) {
                return '❌ Vui lòng cung cấp cả token gốc và token đích để tiến hành batch swap.';
            }

            if (fromTokenAddress && !fromTokenAddress.startsWith('0x') && fromTokenAddress.length < 20) {
                const resolved = await autoResolveToken(fromTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                fromTokenAddress = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }
            if (toTokenAddress && !toTokenAddress.startsWith('0x') && toTokenAddress.length < 20) {
                const resolved = await autoResolveToken(toTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                toTokenAddress = resolved.tokenAddress;
            }

            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const isNativeFrom = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

            // ── Phase 0: Auto-Decimal Resolution ──
            try {
                const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                if (basicInfo && basicInfo.length > 0) {
                    const resolvedDecimals = Number(basicInfo[0].decimal || 18);
                    for (let s of swaps) {
                        if (String(s.amount).toLowerCase() !== 'max' && !String(s.amount).includes('e+') && !String(s.amount).includes('00000000')) {
                            const oldAmt = s.amount;
                            s.amount = ethers.parseUnits(String(s.amount), resolvedDecimals).toString();
                            log.child('BATCHSWAP').info(`Auto-converted ${oldAmt} to ${s.amount} wei based on ${resolvedDecimals} decimals`);
                        }
                    }
                }
            } catch (e) {
                log.child('BATCHSWAP').error('Failed auto-decimal:', e.message);
            }

            // ── Phase 1: Resolve wallets and handle "max" amounts ──
            log.child('BATCHSWAP').info(`Starting batch swap for ${swaps.length} wallets, user ${userId}`);
            const resolvedSwaps = [];
            for (const swap of swaps) {
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [swap.walletId, userId]);
                if (!tw) { resolvedSwaps.push({ ...swap, tw: null, error: `Ví ID ${swap.walletId} không tồn tại.` }); continue; }

                let finalAmount = swap.amount;
                // ── Upgrade #2: Gas Reservation for "max" swaps ──
                if (String(swap.amount).toLowerCase() === 'max') {
                    try {
                        if (isNativeFrom) {
                            // Native token: subtract gas reserve
                            const balance = await provider.getBalance(tw.address);
                            const gasPrice = (await provider.getFeeData()).gasPrice || 1000000000n;
                            const gasReserve = gasPrice * 300000n; // reserve enough for swap tx
                            const swapAmount = balance - gasReserve;
                            if (swapAmount <= 0n) {
                                resolvedSwaps.push({ ...swap, tw, error: 'Số dư không đủ để trả phí gas.' });
                                continue;
                            }
                            finalAmount = swapAmount.toString();
                        } else {
                            // ERC-20: use full balance
                            const erc20 = new ethers.Contract(fromTokenAddress.toLowerCase(), ["function balanceOf(address) view returns (uint256)"], provider);
                            const balance = await erc20.balanceOf(tw.address);
                            if (balance === 0n) {
                                resolvedSwaps.push({ ...swap, tw, error: 'Số dư token = 0.' });
                                continue;
                            }
                            finalAmount = balance.toString();
                        }
                        log.child('BATCHSWAP').info(`Wallet ${tw.address.slice(0, 8)}: max resolved to ${finalAmount}`);
                    } catch (e) {
                        resolvedSwaps.push({ ...swap, tw, error: `Lỗi đọc số dư: ${e.message}` });
                        continue;
                    }
                }
                resolvedSwaps.push({ ...swap, tw, amount: finalAmount });
            }

            // ── Upgrade #1: Parallel Approve ──
            if (!isNativeFrom) {
                const walletsNeedingApprove = resolvedSwaps.filter(s => s.tw && !s.error);
                if (walletsNeedingApprove.length > 0) {
                    log.child('BATCHSWAP').info(`Phase 1: Parallel approve for ${walletsNeedingApprove.length} wallets...`);

                    // Check allowances in parallel via RPC
                    const erc20AllowanceAbi = ["function allowance(address owner, address spender) view returns (uint256)"];
                    const tokenContract = new ethers.Contract(fromTokenAddress.toLowerCase(), erc20AllowanceAbi, provider);

                    // Get the first approve data to find the spender (DEX router)
                    let dexRouter = null;
                    try {
                        const firstApproveData = await onchainos.getApproveTransaction(chainIndex, fromTokenAddress.toLowerCase(), walletsNeedingApprove[0].amount);
                        dexRouter = firstApproveData?.[0]?.dexContractAddress;
                    } catch (e) { /* will fall back to sequential */ }

                    if (dexRouter) {
                        // Check which wallets need approval
                        const allowanceChecks = await Promise.all(walletsNeedingApprove.map(async (s) => {
                            try {
                                const allowance = await tokenContract.allowance(s.tw.address, dexRouter);
                                return { walletId: s.walletId, needsApprove: allowance < BigInt(s.amount) };
                            } catch { return { walletId: s.walletId, needsApprove: true }; }
                        }));

                        // Send approvals in parallel (no 5-second waits!)
                        const approvalPromises = allowanceChecks.filter(a => a.needsApprove).map(async (a) => {
                            const s = walletsNeedingApprove.find(sw => sw.walletId === a.walletId);
                            try {
                                const privateKey = global._decryptTradingKey(s.tw.encryptedKey);
                                const wallet = new ethers.Wallet(privateKey, provider);
                                const approveData = await onchainos.getApproveTransaction(chainIndex, fromTokenAddress.toLowerCase(), s.amount);
                                if (approveData?.[0]?.dexContractAddress) {
                                    const spender = approveData[0].dexContractAddress;
                                    let currentAllowance = 0n;
                                    try { currentAllowance = await tokenContract.allowance(s.tw.address, spender); } catch (e) { }

                                    if (currentAllowance < BigInt(s.amount)) {
                                        const erc20Interface = new ethers.Interface(["function approve(address spender, uint256 amount) public returns (bool)"]);
                                        const infiniteApproveData = erc20Interface.encodeFunctionData("approve", [spender, ethers.MaxUint256]);
                                        const approveTx = await wallet.signTransaction({
                                            to: fromTokenAddress.toLowerCase(), data: infiniteApproveData, value: 0n,
                                            gasLimit: BigInt(approveData[0].gasLimit || '100000'), gasPrice: BigInt(approveData[0].gasPrice || '1000000000'),
                                            nonce: await provider.getTransactionCount(wallet.address, 'pending'), chainId: chainIdNum
                                        });
                                        await onchainos.broadcastTransaction(approveTx, chainIndex, s.tw.address);
                                        log.child('BATCHSWAP').info(`✅ Approve INFINITE sent for wallet ${s.tw.address.slice(0, 8)}`);
                                    } else {
                                        log.child('BATCHSWAP').info(`✅ Allowance sufficient for wallet ${s.tw.address.slice(0, 8)}`);
                                    }
                                }
                            } catch (ae) {
                                log.child('BATCHSWAP').error(`Approve error for ${s.tw.address.slice(0, 8)}:`, ae.msg || ae.message);
                            }
                        });
                        await Promise.all(approvalPromises);
                        // Wait a brief moment for approvals to propagate
                        if (approvalPromises.length > 0) await new Promise(r => setTimeout(r, 3000));
                    }
                }
            }

            // ── Upgrade #4: Background Jobs — run swap loop, collect results ──
            const isLargeBatch = resolvedSwaps.length > 5;
            if (isLargeBatch) {
                log.child('BATCHSWAP').info(`Large batch detected (${resolvedSwaps.length}). Running in background mode.`);
            }

            const results = [];
            // Enhancement #2: Shared nonce manager across all wallets in this batch
            const nonceManager = createNonceManager(provider);

            // Progress notification helper for large batches
            let bot = null;
            const chatId = context?.chatId || context?.msg?.chat?.id;

            // Resolve language early for progress messages
            let lang = context?.lang || 'en';
            try {
                const { getLang } = require('../../../app/language');
                if (context?.msg) lang = await getLang(context.msg);
            } catch (e) { /* fallback */ }
            const progressTexts = {
                en: 'Processing batch swap',
                vi: 'Đang xử lý swap hàng loạt',
                zh: '正在处理批量兑换',
                ko: '일괄 스왑 처리 중',
                ru: 'Обработка пакетного обмена',
                id: 'Memproses swap massal'
            };
            const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');
            // Pre-resolve token symbols and decimals for the report
            let fromSym = '?', toSym = '?', fromDec = 18, toDec = 18;
            try {
                const basicInfo = await onchainos.getTokenBasicInfo([
                    { chainIndex, tokenContractAddress: fromTokenAddress },
                    { chainIndex, tokenContractAddress: toTokenAddress }
                ]);
                if (basicInfo && basicInfo.length > 0) {
                    const info1 = basicInfo.find(t => t.tokenContractAddress?.toLowerCase() === fromTokenAddress.toLowerCase());
                    const info2 = basicInfo.find(t => t.tokenContractAddress?.toLowerCase() === toTokenAddress.toLowerCase());
                    if (info1) { fromSym = info1.tokenSymbol || '?'; fromDec = Number(info1.decimal || 18); }
                    if (info2) { toSym = info2.tokenSymbol || '?'; toDec = Number(info2.decimal || 18); }
                }
            } catch (e) { log.child('BATCHSWAP').warn('Token info pre-resolve failed:', e.message); }

            if (chatId) {
                try { bot = require('../../../core/bot').bot; } catch (e) { /* no bot available */ }
            }
            let progressMsgId = null; // batch swap progress
            const batchStartTime = Date.now();
            for (let i = 0; i < resolvedSwaps.length; i++) {
                const swap = resolvedSwaps[i];
                if (swap.error) { results.push({ id: swap.walletId, address: swap.tw?.address || 'N/A', status: '❌', reason: swap.error }); continue; }
                const tw = swap.tw;
                try {
                    const privateKey = global._decryptTradingKey(tw.encryptedKey);
                    const wallet = new ethers.Wallet(privateKey, provider);
                    log.child('BATCHSWAP').info(`[${i + 1}/${resolvedSwaps.length}] Processing wallet ${tw.address.slice(0, 8)} (Amount: ${swap.amount})...`);

                    // Get dynamic slippage
                    let dynamicSlippage = Number(args.slippagePercent || '0');
                    if (swap.amount && swap.amount > 0) {
                        try {
                            const quoteData = await onchainos.getSwapQuote({
                                chainIndex, fromTokenAddress, toTokenAddress, amount: swap.amount
                            });
                            const impact = Number((Array.isArray(quoteData) ? quoteData[0] : quoteData)?.routerResult?.priceImpactPercentage || 0);
                            const suggestedSlippage = Math.max(3, Math.ceil(impact + 2));
                            if (suggestedSlippage > dynamicSlippage) dynamicSlippage = suggestedSlippage;
                        } catch (quoteErr) {
                            if (quoteErr.code === '82112' || (quoteErr.msg && quoteErr.msg.includes('value difference'))) {
                                log.child('BATCHSWAP').error(`Wallet ${tw.id}: High price impact 82112 error intercepted`);
                                results.push({ id: swap.walletId, address: tw.address, status: '❌', reason: 'Price Impact > 90% (Thanh khoản siêu nhỏ)' });
                                continue;
                            }
                        }
                    }
                    if (dynamicSlippage === 0) dynamicSlippage = 10;
                    dynamicSlippage = Math.min(50, dynamicSlippage);

                    // Get swap tx
                    const txData = await onchainos.getSwapTransaction({
                        chainIndex, fromTokenAddress: fromTokenAddress, toTokenAddress: toTokenAddress,
                        amount: swap.amount, userWalletAddress: tw.address, slippagePercent: String(dynamicSlippage)
                    });
                    const txRaw = Array.isArray(txData) ? txData[0] : txData;
                    if (!txRaw?.tx) { results.push({ id: swap.walletId, address: tw.address, status: '❌', reason: 'No tx data' }); continue; }

                    // Sign + broadcast (using shared nonce manager)
                    const signedTx = await wallet.signTransaction({
                        to: txRaw.tx.to, data: txRaw.tx.data, value: BigInt(txRaw.tx.value || '0'),
                        gasLimit: BigInt(txRaw.tx.gas || txRaw.tx.gasLimit || '300000'), gasPrice: BigInt(txRaw.tx.gasPrice || '1000000000'),
                        nonce: await nonceManager.getNonce(wallet.address), chainId: chainIdNum
                    });
                    // Enhancement #1: Retry broadcast
                    const broadcastResult = await rpcRetry(
                        () => onchainos.broadcastTransaction(signedTx, chainIndex, tw.address),
                        3, 'BATCH-SWAP-BROADCAST'
                    );
                    const br = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
                    const txHash = br?.txHash || br?.orderId || 'pending';

                    // Extract swap amounts from routerResult for detailed report
                    const router = txRaw.routerResult || {};
                    const rFromSym = router.fromTokenSymbol || fromSym;
                    const rToSym = router.toTokenSymbol || toSym;
                    const rFromDec = Number(router.fromToken?.decimal || fromDec);
                    const rToDec = Number(router.toToken?.decimal || toDec);
                    const swapFromAmt = Number(router.fromTokenAmount || swap.amount) / Math.pow(10, rFromDec);
                    const swapToAmt = Number(router.toTokenAmount || 0) / Math.pow(10, rToDec);

                    results.push({
                        id: swap.walletId, address: tw.address, status: '✅', txHash,
                        fromAmt: swapFromAmt, toAmt: swapToAmt,
                        fromSym: rFromSym, toSym: rToSym,
                        slippage: dynamicSlippage
                    });
                } catch (err) {
                    // ── Auto-retry for network errors ──
                    const errMsg = err.msg || err.message || '';
                    const isNetworkError = /ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|socket hang up|network|timeout|EFATAL/i.test(errMsg);
                    if (isNetworkError && !swap._retried) {
                        log.child('BATCHSWAP').warn(`Network error wallet ${tw.address.slice(0, 8)}, retrying in 3s`);
                        swap._retried = true;
                        i--;
                        await new Promise(r => setTimeout(r, 3000));
                    } else {
                        results.push({ id: swap.walletId, address: tw.address, status: '❌', reason: errMsg.slice(0, 80) });
                    }
                }
                // Send progress update for large batches
                // ── Visual progress bar (edit in-place) ──
                if (bot && chatId) {
                    const total = resolvedSwaps.length;
                    const done = i + 1;
                    const pct = Math.round(done / total * 100);
                    const filled = Math.round(done / total * 10);
                    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                    const elapsed = Math.round((Date.now() - batchStartTime) / 1000);
                    const eFmt = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
                    const barMsg = `📊 ${progressTexts[lk] || progressTexts.en}\n[${bar}] ${done}/${total} (${pct}%) | ⏱ ${eFmt}`;
                    try {
                        if (!progressMsgId) {
                            const pmsg = await bot.sendMessage(chatId, barMsg, { parse_mode: 'HTML', disable_notification: true });
                            if (pmsg) progressMsgId = pmsg.message_id;
                        } else {
                            await bot.editMessageText(barMsg, { chat_id: chatId, message_id: progressMsgId, parse_mode: 'HTML' }).catch(() => {});
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            const successCount = results.filter(r => r.status === '✅').length;

            // ── Edit progress to "Complete" then auto-delete ──
            if (progressMsgId && bot && chatId) {
                const elapsedFinal = Math.round((Date.now() - batchStartTime) / 1000);
                const eFmtF = elapsedFinal >= 60 ? `${Math.floor(elapsedFinal / 60)}m${elapsedFinal % 60}s` : `${elapsedFinal}s`;
                const doneTexts = {
                    en: `✅ <b>Batch Swap Complete!</b> ${successCount}/${resolvedSwaps.length} done | ⏱ ${eFmtF}`,
                    vi: `✅ <b>Batch Swap hoàn thành!</b> ${successCount}/${resolvedSwaps.length} xong | ⏱ ${eFmtF}`,
                    zh: `✅ <b>批量兑换完成!</b> ${successCount}/${resolvedSwaps.length} 完成 | ⏱ ${eFmtF}`,
                    ko: `✅ <b>배치 스왑 완료!</b> ${successCount}/${resolvedSwaps.length} 완료 | ⏱ ${eFmtF}`,
                    ru: `✅ <b>Обмен завершён!</b> ${successCount}/${resolvedSwaps.length} выполнено | ⏱ ${eFmtF}`,
                    id: `✅ <b>Batch Swap Selesai!</b> ${successCount}/${resolvedSwaps.length} selesai | ⏱ ${eFmtF}`
                };
                try { await bot.editMessageText(doneTexts[lk] || doneTexts.en, { chat_id: chatId, message_id: progressMsgId, parse_mode: 'HTML' }).catch(() => {}); setTimeout(() => { bot.deleteMessage(chatId, progressMsgId).catch(() => {}); }, 5000); } catch (_) { try { bot.deleteMessage(chatId, progressMsgId).catch(() => {}); } catch (__) {} }
            }

            // ── CSV Export ──
            if (results.length >= 3 && bot && chatId) {
                try {
                    const csvHeader = 'Wallet ID,Address,Status,From Amount,From Token,To Amount,To Token,Slippage%,Tx Hash';
                    const csvRows = results.map(r => `${r.id},${r.address},${r.status === '✅' ? 'Success' : 'Failed'},${r.fromAmt?.toFixed(6) || ''},${r.fromSym || ''},${r.toAmt?.toFixed(6) || ''},${r.toSym || ''},${r.slippage || ''},${r.txHash || r.reason || ''}`);
                    const csvContent = csvHeader + '\n' + csvRows.join('\n');
                    const tmpDir = path.join(process.cwd(), 'tmp');
                    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
                    const csvPath = path.join(tmpDir, `batch_swap_${userId}_${Date.now()}.csv`);
                    fs.writeFileSync(csvPath, csvContent, 'utf8');
                    await bot.sendDocument(chatId, csvPath, { caption: `📊 Batch Swap CSV — ${results.length} wallets`, disable_notification: true });
                    setTimeout(() => { try { fs.unlinkSync(csvPath); } catch (_) {} }, 30000);
                } catch (csvErr) { log.child('BATCHSWAP').warn('CSV export failed:', csvErr.message); }
            }

            // Build summary
            
            // Localized labels
            let headerLabel = 'BATCH SWAP RESULTS';
            let successStr = 'success';
            let walletLabel = 'Wallet';
            let reasonLabel = 'Reason:';
            let linkLabel = 'View Tx';
            let failLabel = 'Failed';
            let swappedLabel = 'Swapped:';
            let slippageLabel = 'Slippage:';
            let pairLabel = 'Pair:';
            let networkLabel = 'Network:';
            let timeLabel = 'Time:';

            if (lang === 'vi') {
                headerLabel = 'KẾT QUẢ BATCH SWAP';
                successStr = 'thành công';
                walletLabel = 'Ví';
                reasonLabel = 'Lý do:';
                linkLabel = 'Xem TX';
                failLabel = 'Thất bại';
                swappedLabel = 'Đã đổi:';
                slippageLabel = 'Trượt giá:';
                pairLabel = 'Cặp:';
                networkLabel = 'Mạng:';
                timeLabel = 'Thời gian:';
            } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
                headerLabel = '批量兑换结果';
                successStr = '成功';
                walletLabel = '钱包';
                reasonLabel = '原因:';
                linkLabel = '查看交易';
                failLabel = '失败';
                swappedLabel = '已兑换:';
                slippageLabel = '滑点:';
                pairLabel = '交易对:';
                networkLabel = '网络:';
                timeLabel = '时间:';
            } else if (lang === 'ko') {
                headerLabel = '일괄 스왑 결과';
                successStr = '성공';
                walletLabel = '지갑';
                reasonLabel = '사유:';
                linkLabel = 'Tx 확인';
                failLabel = '실패';
                swappedLabel = '교환:';
                slippageLabel = '슬리페지:';
                pairLabel = '페어:';
                networkLabel = '네트워크:';
                timeLabel = '시간:';
            } else if (lang === 'ru') {
                headerLabel = 'РЕЗУЛЬТАТЫ BATCH SWAP';
                successStr = 'успешно';
                walletLabel = 'Кошелёк';
                reasonLabel = 'Причина:';
                linkLabel = 'Посмотреть Tx';
                failLabel = 'Ошибка';
                swappedLabel = 'Обмен:';
                slippageLabel = 'Слиппейдж:';
                pairLabel = 'Пара:';
                networkLabel = 'Сеть:';
                timeLabel = 'Время:';
            } else if (lang === 'id') {
                headerLabel = 'HASIL BATCH SWAP';
                successStr = 'berhasil';
                walletLabel = 'Dompet';
                reasonLabel = 'Alasan:';
                linkLabel = 'Lihat Tx';
                failLabel = 'Gagal';
                swappedLabel = 'Ditukar:';
                slippageLabel = 'Slippage:';
                pairLabel = 'Pasangan:';
                networkLabel = 'Jaringan:';
                timeLabel = 'Waktu:';
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

            const header = `🔄 <b>${headerLabel}</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📊 <b>${successCount}/${resolvedSwaps.length}</b> ${successStr}\n` +
                `💱 ${pairLabel} <b>${fromSym} ➡ ${toSym}</b>\n` +
                `🌐 ${networkLabel} ${chainName} (#${chainIndex})\n` +
                `⏰ ${timeLabel} ${timeString} (GMT+7)\n` +
                `━━━━━━━━━━━━━━━━━━`;

            // Build per-wallet result blocks
            const walletBlocks = [];
            results.forEach((r, i) => {
                const addrShort = r.address !== 'N/A' ? `${r.address.slice(0, 8)}...${r.address.slice(-4)}` : 'N/A';
                if (r.status === '✅') {
                    const fromStr = r.fromAmt?.toLocaleString('en-US', { maximumFractionDigits: 6 }) || '?';
                    const toStr = r.toAmt?.toLocaleString('en-US', { maximumFractionDigits: 6 }) || '?';
                    walletBlocks.push(
                        `✅ <b>${walletLabel} ${r.id}</b> (<code>${addrShort}</code>)\n` +
                        `   💱 ${swappedLabel} <code>${fromStr}</code> ${r.fromSym} ➡ <code>${toStr}</code> ${r.toSym}\n` +
                        `   ⚙️ ${slippageLabel} ${r.slippage}%\n` +
                        `   🔗 <a href="${explorerBase}/tx/${r.txHash}">${linkLabel}</a>`
                    );
                } else {
                    walletBlocks.push(
                        `❌ <b>${walletLabel} ${r.id}</b> (<code>${addrShort}</code>): ${failLabel}\n` +
                        `   ${reasonLabel} ${r.reason}`
                    );
                }
            });

            log.child('BATCHSWAP').info(`✅ Done: ${successCount}/${resolvedSwaps.length} successful`);

            // Telegram message limit: split if report is too long
            const TG_LIMIT = 4000;
            const fullReport = header + '\n\n' + walletBlocks.join('\n\n');
            if (fullReport.length <= TG_LIMIT) {
                return { success: true, action: true, displayMessage: fullReport.trim() };
            }

            // Split: send header + groups of wallet blocks as separate messages
            let bot2 = null;
            const chatId2 = context?.chatId || context?.msg?.chat?.id;
            try { bot2 = require('../../../core/bot').bot; } catch (e) { /* no bot */ }

            if (bot2 && chatId2) {
                try { await bot2.sendMessage(chatId2, header, { parse_mode: 'HTML', disable_notification: true }).catch(() => { }); } catch (e) { /* ignore */ }

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
                return { success: true, action: true, displayMessage: `🔄 ${headerLabel}: ${successCount}/${resolvedSwaps.length} ${successStr} ✅` };
            }

            // Fallback: return truncated report
            return { success: true, action: true, displayMessage: (header + '\n\n' + walletBlocks.slice(0, 10).join('\n\n')).trim() };
        } catch (error) {
            return `❌ Batch swap error: ${error.msg || error.message}`;
        }
    },

    async simulate_batch_swap(args, context) {
        const { dbGet } = require('../../../../db/core');
        const userId = context?.userId;
        if (!userId) return '❌ Không xác định được người dùng.';

        try {
            if (!args.swaps || args.swaps.length === 0) return '❌ Vui lòng cung cấp danh sách ví (swaps array).';

            const ethers = require('ethers');
            let chainIndex = args.chainIndex || '196';

            let fromTokenAddress = args.fromTokenAddress;
            let toTokenAddress = args.toTokenAddress;

            if (!fromTokenAddress || !toTokenAddress) {
                return '❌ Vui lòng cung cấp token gốc và token đích cho tính năng mô phỏng batch swap.';
            }

            if (fromTokenAddress && !fromTokenAddress.startsWith('0x') && fromTokenAddress.length < 20) {
                const resolved = await autoResolveToken(fromTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                fromTokenAddress = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }
            if (toTokenAddress && !toTokenAddress.startsWith('0x') && toTokenAddress.length < 20) {
                const resolved = await autoResolveToken(toTokenAddress, chainIndex);
                if (resolved.error) return { displayMessage: resolved.error };
                toTokenAddress = resolved.tokenAddress;
            }

            const rpcUrl = _getChainRpc(chainIndex);
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const isNativeFrom = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

            // ── Phase 0: Auto-Decimal Resolution ──
            try {
                const basicInfo = await onchainos.getTokenBasicInfo([{ chainIndex, tokenContractAddress: fromTokenAddress }]);
                if (basicInfo && basicInfo.length > 0) {
                    const resolvedDecimals = Number(basicInfo[0].decimal || 18);
                    for (let s of args.swaps) {
                        if (String(s.amount).toLowerCase() !== 'max' && !String(s.amount).includes('e+') && Number(s.amount) < 1e9) {
                            const oldAmt = s.amount;
                            s.amount = (Number(s.amount) * Math.pow(10, resolvedDecimals)).toLocaleString('fullwide', { useGrouping: false }).split('.')[0];
                            log.child('SIMBATCH').info(`Auto-converted ${oldAmt} to ${s.amount} wei based on ${resolvedDecimals} decimals`);
                        }
                    }
                }
            } catch (e) {
                log.child('SIMBATCH').error('Failed auto-decimal:', e.message);
            }

            log.child('SIMBATCH').info(`Simulating batch swap for ${args.swaps.length} wallets...`);
            const simResults = [];
            let totalGasEstimate = 0n;

            for (const swap of args.swaps) {
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [swap.walletId, userId]);
                if (!tw) { simResults.push({ id: swap.walletId, status: '❌', reason: 'Ví không tồn tại' }); continue; }

                try {
                    // Get a swap quote to check feasibility
                    let quoteData;
                    try {
                        quoteData = await onchainos.getSwapQuote({
                            chainIndex, fromTokenAddress: fromTokenAddress, toTokenAddress: toTokenAddress,
                            amount: swap.amount, slippagePercent: args.slippagePercent || '1'
                        });
                    } catch (quoteErr) {
                        if (quoteErr.code === '82112' || (quoteErr.msg && quoteErr.msg.includes('value difference'))) {
                            simResults.push({ id: swap.walletId, address: tw.address, status: '❌', reason: 'Cảnh báo: Price Impact > 90% (Thanh khoản quá yếu)' });
                            continue;
                        }
                        throw quoteErr;
                    }
                    const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
                    if (!quote?.routerResult) { simResults.push({ id: swap.walletId, address: tw.address, status: '⚠️', reason: 'Không tìm thấy tuyến swap' }); continue; }

                    const router = quote.routerResult;
                    const gasEstimate = BigInt(router.estimateGasFee || '300000');
                    totalGasEstimate += gasEstimate;
                    const priceImpact = Number(router.priceImpactPercentage || 0);

                    // Check balance
                    let hasEnoughBalance = true;
                    if (isNativeFrom) {
                        const balance = await provider.getBalance(tw.address);
                        hasEnoughBalance = balance >= BigInt(swap.amount) + gasEstimate;
                    } else {
                        const erc20 = new ethers.Contract(fromTokenAddress.toLowerCase(), ["function balanceOf(address) view returns (uint256)"], provider);
                        const balance = await erc20.balanceOf(tw.address);
                        hasEnoughBalance = balance >= BigInt(swap.amount);
                    }

                    const fromDec = Number(router.fromToken?.decimal || 18);
                    const toDec = Number(router.toToken?.decimal || 18);
                    const fromAmt = (Number(router.fromTokenAmount || swap.amount) / Math.pow(10, fromDec)).toLocaleString('en-US', { maximumFractionDigits: 6 });
                    const toAmt = (Number(router.toTokenAmount || 0) / Math.pow(10, toDec)).toLocaleString('en-US', { maximumFractionDigits: 6 });

                    let warnings = [];
                    if (!hasEnoughBalance) warnings.push('⚠️ Số dư không đủ');
                    if (priceImpact > 5) warnings.push(`🔴 Price Impact cao: ${priceImpact.toFixed(2)}%`);
                    else if (priceImpact > 2) warnings.push(`🟡 Price Impact: ${priceImpact.toFixed(2)}%`);

                    simResults.push({
                        id: swap.walletId, address: tw.address,
                        status: hasEnoughBalance ? '✅' : '⚠️',
                        fromAmt, toAmt,
                        fromSym: router.fromTokenSymbol || '?',
                        toSym: router.toTokenSymbol || '?',
                        gasEstimate: gasEstimate.toString(),
                        priceImpact,
                        warnings
                    });
                } catch (err) {
                    simResults.push({ id: swap.walletId, address: tw?.address || 'N/A', status: '❌', reason: err.msg || err.message });
                }
            }

            // Format summary
            const okCount = simResults.filter(r => r.status === '✅').length;
            const warnCount = simResults.filter(r => r.status === '⚠️').length;
            const failCount = simResults.filter(r => r.status === '❌').length;

            const lines = simResults.map((r, i) => {
                const addrShort = r.address ? `${r.address.slice(0, 8)}...${r.address.slice(-4)}` : 'N/A';
                if (r.reason) return `${i + 1}. ${r.status} Ví ${r.id} (${addrShort})\n> ${r.reason}`;
                const warnStr = r.warnings?.length > 0 ? `\n> ${r.warnings.join(' | ')}` : '';
                return `${i + 1}. ${r.status} Ví ${r.id} (${addrShort})\n> ${r.fromAmt} ${r.fromSym} → ${r.toAmt} ${r.toSym}${warnStr}`;
            });

            return `> IMPORTANT INSTRUCTION: Display this simulation report to the user in their native language.\n\n🧪 **Batch Swap Simulation:**\n> ✅ ${okCount} ready | ⚠️ ${warnCount} warnings | ❌ ${failCount} errors\n> Total Estimated Gas: **${totalGasEstimate.toString()}**\n\n${lines.join('\n\n')}\n\nAsk the user if they want to confirm and proceed with the swap.`;
        } catch (error) {
            return `❌ Simulation error: ${error.msg || error.message}`;
        }
    },

    async simulate_transaction(args, context) {
        try {
            const data = await onchainos.simulateTransaction({
                chainIndex: args.chainIndex,
                fromAddress: args.fromAddress,
                toAddress: args.toAddress,
                txAmount: args.txAmount || '0',
                extJson: args.inputData ? { inputData: args.inputData } : undefined
            });
            const lang = context?.lang || 'en';
            return formatSimulationResult(data, lang);
        } catch (error) {
            return `❌ Error simulating transaction: ${error.msg || error.message}`;
        }
    },


    async broadcast_transaction(args) {
        try {
            const data = await onchainos.broadcastTransaction(
                args.signedTx,
                args.chainIndex,
                args.address
            );
            if (!data || !Array.isArray(data) || data.length === 0) {
                return '❌ Broadcast thất bại. Kiểm tra lại giao dịch đã ký.';
            }
            const result = data[0];
            return `✅ Giao dịch đã được broadcast!\n> Order ID: ${result.orderId || 'N/A'}\n> Tx Hash: ${result.txHash || 'N/A'}\n\nDùng get_order_status để theo dõi trạng thái giao dịch.`;
        } catch (error) {
            return `❌ Lỗi broadcast: ${error.msg || error.message}`;
        }
    },

    async get_order_status(args) {
        try {
            const data = await onchainos.getOrderStatus(
                args.address,
                args.chainIndex,
                { orderId: args.orderId }
            );
            if (!data || !Array.isArray(data) || data.length === 0) {
                return '📭 Không tìm thấy giao dịch nào.';
            }
            const orders = data[0].orders || [];
            if (orders.length === 0) {
                return '📭 Không tìm thấy giao dịch nào cho ví này.';
            }
            const statusMap = { '1': '⏳ Đang chờ', '2': '✅ Thành công', '3': '❌ Thất bại' };
            const lines = orders.slice(0, 5).map((o, i) => {
                const status = statusMap[o.txStatus] || `❓ ${o.txStatus}`;
                return `${i + 1}. ${status}\n> Order: ${o.orderId}\n> Tx: ${o.txHash || 'N/A'}\n> Chain: ${o.chainIndex}${o.failReason ? `\n> Lý do: ${o.failReason}` : ''}`;
            });
            return `📋 Trạng thái giao dịch:\n\n${lines.join('\n\n')}`;
        } catch (error) {
            return `❌ Lỗi kiểm tra trạng thái: ${error.msg || error.message}`;
        }
    },

    async schedule_dca(args, context) {
        const { dbGet, dbRun, dbAll } = require('../../../../db/core');
        const userId = context?.userId;
        const chatId = context?.chatId || userId;
        if (!userId) return '❌ User not identified.';
        const action = (args.action || '').toLowerCase();

        // ── i18n (Item #2) ──
        const lang = context?.lang || 'vi';
        const DCA_I18N = {
            vi: {
                need_params: '❌ Cần cung cấp: walletId, fromTokenAddress, toTokenAddress, amount.',
                wallet_not_found: '❌ Ví ID {id} không tồn tại hoặc không thuộc bạn.',
                token_resolve_fail: '❌ Không tìm thấy token: {token}. Hãy thử contract address.',
                max_limit: '❌ Đã đạt giới hạn {max} lịch DCA. Hãy hủy bớt trước khi tạo mới.',
                created: '✅ Đã tạo lịch DCA!',
                task_id: '🆔 ID: {id}',
                interval: '⏰ Chu kỳ: mỗi {interval}',
                amount: '💰 Mỗi lần: {amount} {from} → {to}',
                chain: '🌐 Mạng: {chain}',
                wallet: '👛 Ví: {wallet}',
                next_run: '⏭️ Lần tới: {time}',
                stop_loss: '🛡️ Stop-loss: -{pct}%',
                take_profit: '🎯 Take-profit: +{pct}%',
                hint: '💡 Dùng "hủy DCA {id}" để dừng, "tạm dừng DCA {id}" để pause.',
                no_tasks: '📭 Chưa có lịch DCA nào.',
                list_header: '📅 Danh sách DCA ({count})',
                paused: '⏸️ Tạm dừng',
                active: '▶️ Đang chạy',
                cancel_need_id: '❌ Cần cung cấp taskId để hủy.',
                cancel_not_found: '❌ Không tìm thấy task {id}.',
                cancelled: '✅ Đã hủy lịch DCA: {id}',
                paused_ok: '⏸️ Đã tạm dừng DCA: {id}',
                resumed_ok: '▶️ Đã tiếp tục DCA: {id}',
                dashboard_header: '📊 DCA Dashboard',
                total_invested: '💸 Tổng đã đầu tư: {amount} {symbol}',
                total_received: '📈 Tổng nhận: {amount} {symbol}',
                swaps_done: '🔄 Số lần swap: {count}',
                avg_price: '📐 Giá TB: ${price}',
                no_history: '📭 Chưa có lịch sử DCA.',
                invalid_action: '❌ Action không hợp lệ. Hỗ trợ: create, list, cancel, pause, resume, dashboard.',
                hours: '{n}h', daily: 'hàng ngày', weekly: 'hàng tuần', monthly: 'hàng tháng', hourly: 'hàng giờ'
            },
            en: {
                need_params: '❌ Required: walletId, fromTokenAddress, toTokenAddress, amount.',
                wallet_not_found: '❌ Wallet ID {id} not found or not yours.',
                token_resolve_fail: '❌ Token not found: {token}. Try using contract address.',
                max_limit: '❌ Reached limit of {max} DCA schedules. Cancel some first.',
                created: '✅ DCA schedule created!',
                task_id: '🆔 ID: {id}',
                interval: '⏰ Interval: every {interval}',
                amount: '💰 Per swap: {amount} {from} → {to}',
                chain: '🌐 Chain: {chain}',
                wallet: '👛 Wallet: {wallet}',
                next_run: '⏭️ Next: {time}',
                stop_loss: '🛡️ Stop-loss: -{pct}%',
                take_profit: '🎯 Take-profit: +{pct}%',
                hint: '💡 Say "cancel DCA {id}" to stop, "pause DCA {id}" to pause.',
                no_tasks: '📭 No DCA schedules.',
                list_header: '📅 DCA Schedules ({count})',
                paused: '⏸️ Paused',
                active: '▶️ Active',
                cancel_need_id: '❌ Please provide taskId to cancel.',
                cancel_not_found: '❌ Task {id} not found.',
                cancelled: '✅ DCA cancelled: {id}',
                paused_ok: '⏸️ DCA paused: {id}',
                resumed_ok: '▶️ DCA resumed: {id}',
                dashboard_header: '📊 DCA Dashboard',
                total_invested: '💸 Total invested: {amount} {symbol}',
                total_received: '📈 Total received: {amount} {symbol}',
                swaps_done: '🔄 Swaps done: {count}',
                avg_price: '📐 Avg price: ${price}',
                no_history: '📭 No DCA history yet.',
                invalid_action: '❌ Invalid action. Supported: create, list, cancel, pause, resume, dashboard.',
                hours: '{n}h', daily: 'daily', weekly: 'weekly', monthly: 'monthly', hourly: 'hourly'
            },
            zh: {
                need_params: '❌ 需要: walletId, fromTokenAddress, toTokenAddress, amount。',
                wallet_not_found: '❌ 钱包 ID {id} 不存在或不属于您。',
                token_resolve_fail: '❌ 未找到代币: {token}。请尝试合约地址。',
                max_limit: '❌ 已达 {max} 个 DCA 上限。请先取消一些。',
                created: '✅ DCA 计划已创建！',
                task_id: '🆔 ID: {id}', interval: '⏰ 周期: 每 {interval}',
                amount: '💰 每次: {amount} {from} → {to}', chain: '🌐 链: {chain}',
                wallet: '👛 钱包: {wallet}', next_run: '⏭️ 下次: {time}',
                stop_loss: '🛡️ 止损: -{pct}%', take_profit: '🎯 止盈: +{pct}%',
                hint: '💡 说 "取消 DCA {id}" 停止, "暂停 DCA {id}" 暂停。',
                no_tasks: '📭 没有 DCA 计划。', list_header: '📅 DCA 计划 ({count})',
                paused: '⏸️ 已暂停', active: '▶️ 运行中',
                cancel_need_id: '❌ 请提供 taskId。', cancel_not_found: '❌ 未找到任务 {id}。',
                cancelled: '✅ DCA 已取消: {id}', paused_ok: '⏸️ DCA 已暂停: {id}', resumed_ok: '▶️ DCA 已恢复: {id}',
                dashboard_header: '📊 DCA 报表', total_invested: '💸 总投入: {amount} {symbol}',
                total_received: '📈 总收到: {amount} {symbol}', swaps_done: '🔄 交易次数: {count}',
                avg_price: '📐 均价: ${price}', no_history: '📭 暂无 DCA 记录。',
                invalid_action: '❌ 操作无效。支持: create, list, cancel, pause, resume, dashboard。',
                hours: '{n}小时', daily: '每天', weekly: '每周', monthly: '每月', hourly: '每小时'
            },
            ko: {
                need_params: '❌ 필수: walletId, fromTokenAddress, toTokenAddress, amount.',
                wallet_not_found: '❌ 지갑 ID {id}를 찾을 수 없습니다.',
                token_resolve_fail: '❌ 토큰 미발견: {token}.',
                max_limit: '❌ DCA 한도 {max}개 도달. 먼저 일부를 취소하세요.',
                created: '✅ DCA 일정 생성됨!',
                task_id: '🆔 ID: {id}', interval: '⏰ 주기: {interval}마다',
                amount: '💰 회당: {amount} {from} → {to}', chain: '🌐 체인: {chain}',
                wallet: '👛 지갑: {wallet}', next_run: '⏭️ 다음: {time}',
                stop_loss: '🛡️ 손절: -{pct}%', take_profit: '🎯 익절: +{pct}%',
                hint: '💡 "DCA 취소 {id}" or "DCA 일시중지 {id}".',
                no_tasks: '📭 DCA 일정 없음.', list_header: '📅 DCA 일정 ({count})',
                paused: '⏸️ 일시중지', active: '▶️ 활성',
                cancel_need_id: '❌ taskId 필요.', cancel_not_found: '❌ 작업 {id} 미발견.',
                cancelled: '✅ DCA 취소됨: {id}', paused_ok: '⏸️ DCA 일시중지: {id}', resumed_ok: '▶️ DCA 재개: {id}',
                dashboard_header: '📊 DCA 대시보드', total_invested: '💸 총 투자: {amount} {symbol}',
                total_received: '📈 총 수령: {amount} {symbol}', swaps_done: '🔄 스왑 횟수: {count}',
                avg_price: '📐 평균가: ${price}', no_history: '📭 DCA 기록 없음.',
                invalid_action: '❌ 잘못된 작업. 지원: create, list, cancel, pause, resume, dashboard.',
                hours: '{n}시간', daily: '매일', weekly: '매주', monthly: '매월', hourly: '매시간'
            },
            ru: {
                need_params: '❌ Требуется: walletId, fromTokenAddress, toTokenAddress, amount.',
                wallet_not_found: '❌ Кошелёк ID {id} не найден.',
                token_resolve_fail: '❌ Токен не найден: {token}.',
                max_limit: '❌ Достигнут лимит {max} DCA. Отмените часть.',
                created: '✅ DCA расписание создано!',
                task_id: '🆔 ID: {id}', interval: '⏰ Интервал: каждые {interval}',
                amount: '💰 За раз: {amount} {from} → {to}', chain: '🌐 Сеть: {chain}',
                wallet: '👛 Кошелёк: {wallet}', next_run: '⏭️ След.: {time}',
                stop_loss: '🛡️ Стоп-лосс: -{pct}%', take_profit: '🎯 Тейк-профит: +{pct}%',
                hint: '💡 «отменить DCA {id}» или «пауза DCA {id}».',
                no_tasks: '📭 Нет DCA расписаний.', list_header: '📅 DCA расписания ({count})',
                paused: '⏸️ Пауза', active: '▶️ Активно',
                cancel_need_id: '❌ Укажите taskId.', cancel_not_found: '❌ Задача {id} не найдена.',
                cancelled: '✅ DCA отменено: {id}', paused_ok: '⏸️ DCA приостановлено: {id}', resumed_ok: '▶️ DCA возобновлено: {id}',
                dashboard_header: '📊 DCA Отчёт', total_invested: '💸 Всего вложено: {amount} {symbol}',
                total_received: '📈 Всего получено: {amount} {symbol}', swaps_done: '🔄 Свопов: {count}',
                avg_price: '📐 Ср. цена: ${price}', no_history: '📭 История DCA пуста.',
                invalid_action: '❌ Неверное действие. Поддерживается: create, list, cancel, pause, resume, dashboard.',
                hours: '{n}ч', daily: 'ежедневно', weekly: 'еженедельно', monthly: 'ежемесячно', hourly: 'ежечасно'
            },
            id: {
                need_params: '❌ Diperlukan: walletId, fromTokenAddress, toTokenAddress, amount.',
                wallet_not_found: '❌ Dompet ID {id} tidak ditemukan.',
                token_resolve_fail: '❌ Token tidak ditemukan: {token}.',
                max_limit: '❌ Batas {max} DCA tercapai. Batalkan beberapa dulu.',
                created: '✅ Jadwal DCA dibuat!',
                task_id: '🆔 ID: {id}', interval: '⏰ Siklus: setiap {interval}',
                amount: '💰 Per swap: {amount} {from} → {to}', chain: '🌐 Chain: {chain}',
                wallet: '👛 Dompet: {wallet}', next_run: '⏭️ Berikutnya: {time}',
                stop_loss: '🛡️ Stop-loss: -{pct}%', take_profit: '🎯 Take-profit: +{pct}%',
                hint: '💡 "batalkan DCA {id}" atau "jeda DCA {id}".',
                no_tasks: '📭 Tidak ada jadwal DCA.', list_header: '📅 Jadwal DCA ({count})',
                paused: '⏸️ Dijeda', active: '▶️ Aktif',
                cancel_need_id: '❌ Berikan taskId.', cancel_not_found: '❌ Tugas {id} tidak ditemukan.',
                cancelled: '✅ DCA dibatalkan: {id}', paused_ok: '⏸️ DCA dijeda: {id}', resumed_ok: '▶️ DCA dilanjutkan: {id}',
                dashboard_header: '📊 DCA Dashboard', total_invested: '💸 Total investasi: {amount} {symbol}',
                total_received: '📈 Total diterima: {amount} {symbol}', swaps_done: '🔄 Jumlah swap: {count}',
                avg_price: '📐 Harga rata-rata: ${price}', no_history: '📭 Belum ada riwayat DCA.',
                invalid_action: '❌ Aksi tidak valid. Didukung: create, list, cancel, pause, resume, dashboard.',
                hours: '{n} jam', daily: 'harian', weekly: 'mingguan', monthly: 'bulanan', hourly: 'per jam'
            }
        };
        const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');
        const i = DCA_I18N[lk] || DCA_I18N.en;
        const fmt = (tpl, params = {}) => { let s = tpl; for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v); return s; };
        const MAX_DCA_PER_USER = 5;
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };

        // ── Item #11: Flexible interval presets ──
        const resolveInterval = (args) => {
            const preset = (args.interval || '').toLowerCase();
            if (preset === 'hourly') return { ms: 3600000, label: i.hourly };
            if (preset === 'daily') return { ms: 86400000, label: i.daily };
            if (preset === 'weekly') return { ms: 604800000, label: i.weekly };
            if (preset === 'monthly') return { ms: 2592000000, label: i.monthly };
            const hours = Number(args.intervalHours) || 24;
            return { ms: hours * 3600000, label: fmt(i.hours, { n: hours }) };
        };

        // ════════════ CREATE ════════════
        if (action === 'create') {
            if (!args.walletId || !args.fromTokenAddress || !args.toTokenAddress || !args.amount) {
                return i.need_params;
            }

            // Item #4: Validate wallet ownership
            const wallet = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [args.walletId, userId]);
            if (!wallet) return fmt(i.wallet_not_found, { id: args.walletId });

            // Item #12: Multi-chain
            let chainIndex = args.chainIndex || '196';

            // Item #5: Resolve token symbols to contract addresses
            let fromAddr = args.fromTokenAddress;
            let toAddr = args.toTokenAddress;
            let fromSym = fromAddr, toSym = toAddr;
            if (!fromAddr.startsWith('0x') && fromAddr.length < 20) {
                const resolved = await autoResolveToken(fromAddr, chainIndex);
                if (resolved.error) return fmt(i.token_resolve_fail, { token: fromAddr });
                fromSym = fromAddr; fromAddr = resolved.tokenAddress;
                chainIndex = resolved.chainIndex || chainIndex;
            }
            if (!toAddr.startsWith('0x') && toAddr.length < 20) {
                const resolved = await autoResolveToken(toAddr, chainIndex);
                if (resolved.error) return fmt(i.token_resolve_fail, { token: toAddr });
                toSym = toAddr; toAddr = resolved.tokenAddress;
            }

            // Fetch token symbols for display
            try {
                const info = await onchainos.getTokenBasicInfo([
                    { chainIndex, tokenContractAddress: fromAddr },
                    { chainIndex, tokenContractAddress: toAddr }
                ]);
                if (info?.length > 0) {
                    const f = info.find(t => t.tokenContractAddress?.toLowerCase() === fromAddr.toLowerCase());
                    const t2 = info.find(t => t.tokenContractAddress?.toLowerCase() === toAddr.toLowerCase());
                    if (f) fromSym = f.tokenSymbol || fromSym;
                    if (t2) toSym = t2.tokenSymbol || toSym;
                }
            } catch (e) { /* use original symbols */ }

            // Item #3: Max DCA tasks limit
            const existing = await dbAll("SELECT id FROM ai_scheduled_tasks WHERE userId = ? AND type = 'dca_swap' AND enabled = 1", [userId]) || [];
            if (existing.length >= MAX_DCA_PER_USER) {
                return fmt(i.max_limit, { max: MAX_DCA_PER_USER });
            }

            const { ms: intervalMs, label: intervalLabel } = resolveInterval(args);
            const taskId = `dca_${userId}_${Date.now()}`;
            const params = JSON.stringify({
                walletId: args.walletId,
                chainIndex,
                fromTokenAddress: fromAddr,
                toTokenAddress: toAddr,
                fromSymbol: fromSym,
                toSymbol: toSym,
                amount: args.amount,
                // Item #9: Stop-loss / Take-profit
                stopLossPct: args.stopLossPct ? Number(args.stopLossPct) : null,
                takeProfitPct: args.takeProfitPct ? Number(args.takeProfitPct) : null,
                initialPrice: null, // will be set on first execution
                consecutiveFailures: 0
            });
            await dbRun('INSERT INTO ai_scheduled_tasks (id, userId, chatId, type, intervalMs, nextRunAt, params, enabled, lang, createdAt) VALUES (?,?,?,?,?,?,?,1,?,?)',
                [taskId, userId, chatId, 'dca_swap', intervalMs, Date.now() + intervalMs, params, lang, Math.floor(Date.now() / 1000)]);

            const walletShort = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
            const nextTime = new Date(Date.now() + intervalMs).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
            const lines = [
                i.created, '━━━━━━━━━━━━━━━━━━',
                fmt(i.task_id, { id: taskId }),
                fmt(i.interval, { interval: intervalLabel }),
                fmt(i.amount, { amount: args.amount, from: fromSym, to: toSym }),
                fmt(i.chain, { chain: chainNames[chainIndex] || `#${chainIndex}` }),
                fmt(i.wallet, { wallet: walletShort }),
                fmt(i.next_run, { time: nextTime }),
            ];
            if (args.stopLossPct) lines.push(fmt(i.stop_loss, { pct: args.stopLossPct }));
            if (args.takeProfitPct) lines.push(fmt(i.take_profit, { pct: args.takeProfitPct }));
            lines.push('', fmt(i.hint, { id: taskId }));
            return { success: true, action: true, displayMessage: lines.join('\n') };

            // ════════════ LIST ════════════
        } else if (action === 'list') {
            const tasks = await dbAll("SELECT * FROM ai_scheduled_tasks WHERE userId = ? AND type = 'dca_swap'", [userId]) || [];
            const activeTasks = tasks.filter(t => t.enabled === 1);
            const pausedTasks = tasks.filter(t => t.enabled === 2);
            const allTasks = [...activeTasks, ...pausedTasks];
            if (allTasks.length === 0) return i.no_tasks;

            let list = fmt(i.list_header, { count: allTasks.length }) + '\n━━━━━━━━━━━━━━━━━━\n';
            allTasks.forEach((t, idx) => {
                const p = JSON.parse(t.params || '{}');
                const hours = Math.round(t.intervalMs / 3600000);
                const status = t.enabled === 2 ? i.paused : i.active;
                const nextRun = t.enabled === 1 ? new Date(t.nextRunAt).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
                list += `${idx + 1}. ${status} 🆔 ${t.id}\n` +
                    `   💰 ${p.amount} ${p.fromSymbol || '?'} → ${p.toSymbol || '?'}\n` +
                    `   ⏰ ${fmt(i.hours, { n: hours })} | 🌐 ${chainNames[p.chainIndex] || p.chainIndex}\n` +
                    `   ⏭️ ${nextRun}\n\n`;
            });
            return list;

            // ════════════ CANCEL ════════════
        } else if (action === 'cancel') {
            if (!args.taskId) return i.cancel_need_id;
            const task = await dbGet("SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ?", [args.taskId, userId]);
            if (!task) return fmt(i.cancel_not_found, { id: args.taskId });
            await dbRun("DELETE FROM ai_scheduled_tasks WHERE id = ? AND userId = ?", [args.taskId, userId]);
            return { success: true, action: true, displayMessage: fmt(i.cancelled, { id: args.taskId }) };

            // ════════════ PAUSE (Item #8) ════════════
        } else if (action === 'pause') {
            if (!args.taskId) return i.cancel_need_id;
            const task = await dbGet("SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ? AND type = 'dca_swap'", [args.taskId, userId]);
            if (!task) return fmt(i.cancel_not_found, { id: args.taskId });
            await dbRun("UPDATE ai_scheduled_tasks SET enabled = 2 WHERE id = ?", [args.taskId]); // 2 = paused
            return { success: true, action: true, displayMessage: fmt(i.paused_ok, { id: args.taskId }) };

            // ════════════ RESUME (Item #8) ════════════
        } else if (action === 'resume') {
            if (!args.taskId) return i.cancel_need_id;
            const task = await dbGet("SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ? AND type = 'dca_swap'", [args.taskId, userId]);
            if (!task) return fmt(i.cancel_not_found, { id: args.taskId });
            await dbRun("UPDATE ai_scheduled_tasks SET enabled = 1, nextRunAt = ? WHERE id = ?", [Date.now() + task.intervalMs, args.taskId]);
            return { success: true, action: true, displayMessage: fmt(i.resumed_ok, { id: args.taskId }) };

            // ════════════ DASHBOARD (Item #10) ════════════
        } else if (action === 'dashboard') {
            const history = await dbAll(
                "SELECT * FROM wallet_tx_history WHERE userId = ? AND type = 'dca_swap' ORDER BY createdAt DESC LIMIT 100",
                [userId]
            ) || [];
            if (history.length === 0) return i.no_history;

            // Aggregate stats
            const stats = {};
            history.forEach(tx => {
                const key = `${tx.fromSymbol}→${tx.toSymbol}`;
                if (!stats[key]) stats[key] = { from: tx.fromSymbol, to: tx.toSymbol, totalFrom: 0, totalTo: 0, count: 0, totalUsd: 0 };
                stats[key].totalFrom += Number(tx.fromAmount || 0);
                stats[key].totalTo += Number(tx.toAmount || 0);
                stats[key].totalUsd += Number(tx.priceUsd || 0) * Number(tx.toAmount || 0);
                stats[key].count++;
            });

            let report = i.dashboard_header + '\n━━━━━━━━━━━━━━━━━━\n';
            for (const [pair, s] of Object.entries(stats)) {
                const avgPrice = s.totalTo > 0 ? (s.totalUsd / s.totalTo) : 0;
                report += `\n💱 ${pair}\n`;
                report += fmt(i.total_invested, { amount: s.totalFrom.toFixed(4), symbol: s.from }) + '\n';
                report += fmt(i.total_received, { amount: s.totalTo.toFixed(4), symbol: s.to }) + '\n';
                report += fmt(i.swaps_done, { count: s.count }) + '\n';
                if (avgPrice > 0) report += fmt(i.avg_price, { price: avgPrice.toFixed(6) }) + '\n';
            }
            return report;
        }

        return i.invalid_action;
    },


    async get_swap_history(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ User not identified.';
        try {
            const { dbAll, dbRun } = require('../../../../db/core');
            await dbRun('CREATE TABLE IF NOT EXISTS swap_history (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, walletAddress TEXT, chainIndex TEXT, fromToken TEXT, toToken TEXT, fromSymbol TEXT, toSymbol TEXT, fromAmount TEXT, toAmount TEXT, txHash TEXT, orderId TEXT, slippage REAL, createdAt TEXT DEFAULT (datetime(\'now\')))');
            const limit = parseInt(args.limit) || 10;
            const rows = await dbAll('SELECT * FROM swap_history WHERE userId = ? ORDER BY id DESC LIMIT ?', [String(userId), limit]);
            if (!rows || rows.length === 0) return { displayMessage: '📭 No swap history found.' };
            let lang = context?.lang || 'en';
            try { const { getLang } = require('../../../app/language'); if (context?.msg) lang = await getLang(context.msg); } catch (_) {}
            const lk = ['zh-Hans', 'zh-cn'].includes(lang) ? 'zh' : (['en', 'vi', 'zh', 'ko', 'ru', 'id'].includes(lang) ? lang : 'en');
            const titles = { en: 'SWAP HISTORY', vi: 'LỊCH SỬ SWAP', zh: '兑换历史', ko: '스왑 내역', ru: 'ИСТОРИЯ ОБМЕНОВ', id: 'RIWAYAT SWAP' };
            const chainNames = { '1': 'ETH', '56': 'BSC', '196': 'XLayer', '137': 'Polygon', '42161': 'Arb', '8453': 'Base' };
            let msg = `📋 <b>${titles[lk] || titles.en}</b> (Last ${rows.length})\n━━━━━━━━━━━━━━━━━━\n\n`;
            rows.forEach((r, i) => {
                const chain = chainNames[r.chainIndex] || r.chainIndex;
                const explorerBase = _getExplorerUrl(r.chainIndex || '196');
                const timeStr = r.createdAt ? new Date(r.createdAt + 'Z').toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?';
                const addrShort = r.walletAddress ? `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}` : '?';
                msg += `<b>${i + 1}.</b> 💱 <code>${r.fromSymbol}</code> ➡ <code>${r.toSymbol}</code> | ${chain}\n   👛 <code>${addrShort}</code> | ⏰ ${timeStr}\n`;
                if (r.txHash && r.txHash !== 'pending') msg += `   🔗 <a href="${explorerBase}/tx/${r.txHash}">Tx</a>\n`;
                msg += '\n';
            });
            return { displayMessage: msg.trim() };
        } catch (err) { return `❌ Error: ${err.message}`; }
    },

    // ── #6: Favorite Token Pairs ──
    async save_favorite_pair(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ User not identified.';
        try {
            const { dbRun } = require('../../../../db/core');
            await dbRun(`CREATE TABLE IF NOT EXISTS favorite_pairs (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, pairName TEXT, fromToken TEXT, toToken TEXT, chainIndex TEXT DEFAULT '196', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(userId, fromToken, toToken))`);
            const name = args.pairName || `${args.fromToken || '?'}/${args.toToken || '?'}`;
            await dbRun('INSERT OR REPLACE INTO favorite_pairs (userId, pairName, fromToken, toToken, chainIndex) VALUES (?,?,?,?,?)',
                [String(userId), name, args.fromToken || '', args.toToken || '', args.chainIndex || '196']);
            const saveTexts = { en: 'Saved', vi: 'Đã lưu', zh: '已收藏', ko: '저장됨', ru: 'Сохранено', id: 'Tersimpan' };
            let lang = context?.lang || 'en';
            try { const { getLang } = require('../../../app/language'); if (context?.msg) lang = await getLang(context.msg); } catch(_){}
            const lk = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
            return { displayMessage: `⭐ ${saveTexts[lk] || saveTexts.en}: <b>${name}</b>` };
        } catch (err) { return `❌ Error: ${err.message}`; }
    },

    async list_favorite_pairs(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ User not identified.';
        try {
            const { dbAll, dbRun } = require('../../../../db/core');
            await dbRun(`CREATE TABLE IF NOT EXISTS favorite_pairs (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, pairName TEXT, fromToken TEXT, toToken TEXT, chainIndex TEXT DEFAULT '196', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(userId, fromToken, toToken))`);
            const rows = await dbAll('SELECT * FROM favorite_pairs WHERE userId = ? ORDER BY id DESC', [String(userId)]);
            if (!rows || rows.length === 0) return { displayMessage: '📭 No favorite pairs saved.' };
            let lang = context?.lang || 'en';
            try { const { getLang } = require('../../../app/language'); if (context?.msg) lang = await getLang(context.msg); } catch(_){}
            const titles = { en: 'FAVORITE PAIRS', vi: 'CẶP YÊU THÍCH', zh: '收藏交易对', ko: '즐겨찾기', ru: 'ИЗБРАННЫЕ', id: 'FAVORIT' };
            const lk = ['zh-Hans','zh-cn'].includes(lang) ? 'zh' : (['en','vi','zh','ko','ru','id'].includes(lang) ? lang : 'en');
            let msg = `⭐ <b>${titles[lk] || titles.en}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
            rows.forEach((r, i) => {
                msg += `<b>${i+1}.</b> 💱 <code>${r.pairName}</code>\n   From: <code>${r.fromToken}</code> → To: <code>${r.toToken}</code>\n\n`;
            });
            return { displayMessage: msg.trim() };
        } catch (err) { return `❌ Error: ${err.message}`; }
    },
};
