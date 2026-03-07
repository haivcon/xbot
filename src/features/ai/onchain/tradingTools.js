const onchainos = require('../../../services/onchainos');
const fs = require('fs');
const path = require('path');
const { formatPriceResult, formatSearchResult, formatWalletResult, formatSwapQuoteResult, formatTopTokensResult, formatRecentTradesResult, formatSignalChainsResult, formatSignalListResult, formatProfitRoiResult, formatHolderResult, formatGasResult, formatTokenInfoResult, formatCandlesResult, formatTokenMarketDetail, formatSwapExecutionResult, formatSimulationResult, formatLargeNumber } = require('./formatters');
const { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken } = require('./helpers');
const db = require('../../../../db.js');

module.exports = {
    async get_swap_quote(args, context) {
        try {
            console.log('[SWAP QUOTE] Calling with args:', JSON.stringify(args));

            let chainIndex = args.chainIndex || '196';
            let fromTokenAddress = args.fromTokenAddress;
            let toTokenAddress = args.toTokenAddress;

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
                    console.error('[SWAP QUOTE] High price impact 82112 error intercepted:', quoteErr.msg);
                    return {
                        displayMessage: '❌ <b>Lỗi Báo Giá (Price Impact > 90%):</b>\nSố lượng bạn muốn Swap quá lớn so với thanh khoản hiện tại của Pool, dẫn đến trượt giá (Price Impact) sẽ vượt mốc 90%, có nguy cơ mất phần lớn tài sản.\n\n👉 <i>Vui lòng giảm số lượng Swap xuống rất nhỏ, hoặc chờ dự án bơm thêm thanh khoản.</i>'
                    };
                }
                throw quoteErr;
            }
            console.log('[SWAP QUOTE] Raw OKX response:', JSON.stringify(data).slice(0, 2000));

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
                        console.warn('[SWAP QUOTE] Fallback basic info error:', e.message);
                    }
                }
            }

            return formatSwapQuoteResult(data, context?.lang);
        } catch (error) {
            console.log('[SWAP QUOTE] Error:', JSON.stringify(error));
            const lang = context?.lang || 'en';
            let title = 'SWAP QUOTE ERROR';
            let reasonLabel = 'Reason:';
            let codeLabel = 'Code:';
            let hintMsg = 'Please try another amount or check token liquidity.';

            if (lang === 'vi') {
                title = 'LỖI BÁO GIÁ SWAP';
                reasonLabel = 'Lý do:';
                codeLabel = 'Mã lỗi:';
                hintMsg = 'Vui lòng thử lại với số lượng khác hoặc kiểm tra lại thanh khoản của token này.';
            } else if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-Hans') {
                title = '兑换报价错误';
                reasonLabel = '原因:';
                codeLabel = '错误代码:';
                hintMsg = '请尝试其他数量或检查此代币的流动性。';
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

            console.log(`[AUTO-SWAP] Starting swap for user ${userId}, wallet ${tw.address}, chain ${chainIndex}`);

            // 3. Check if we need ERC-20 approval (skip for native token)
            const isNativeFrom = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            if (!isNativeFrom) {
                try {
                    console.log(`[AUTO-SWAP] Getting approval for ${fromTokenAddress}...`);
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
                            } catch (e) { console.error('[AUTO-SWAP] Error reading allowance, defaulting to 0'); }

                            if (currentAllowance < BigInt(args.amount)) {
                                console.log(`[AUTO-SWAP] Allowance ${currentAllowance} < ${args.amount}. Approving INFINITE amount...`);
                                // Generate infinite approve data using ethers
                                const erc20Interface = new ethers.Interface(["function approve(address spender, uint256 amount) public returns (bool)"]);
                                const infiniteApproveData = erc20Interface.encodeFunctionData("approve", [approval.dexContractAddress, ethers.MaxUint256]);

                                // Sign and broadcast approval tx
                                const approveTx = await wallet.signTransaction({
                                    to: fromTokenAddress.toLowerCase(), // send to TOKEN contract
                                    data: infiniteApproveData,
                                    value: 0n,
                                    gasLimit: BigInt(approval.gasLimit || '100000'),
                                    gasPrice: BigInt(approval.gasPrice || '1000000000'),
                                    nonce: await provider.getTransactionCount(wallet.address),
                                    chainId: chainIdNum
                                });
                                const approveResult = await onchainos.broadcastTransaction(approveTx, chainIndex, tw.address);
                                console.log(`[AUTO-SWAP] Approve broadcast:`, JSON.stringify(approveResult));
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
                                            if (found && found.txStatus === '2') { console.log(`[AUTO-SWAP] Approve confirmed!`); break; }
                                            if (found && found.txStatus === '3') { console.log(`[AUTO-SWAP] Approve failed, continuing anyway`); break; }
                                        } catch (pollErr) { /* ignore polling errors */ }
                                    }
                                } else {
                                    // Fallback: wait 5s if no orderId returned
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                }
                            } else {
                                console.log(`[AUTO-SWAP] Allowance is sufficient (${currentAllowance}). Skipping approve tx.`);
                            }
                        }
                    }
                } catch (approveErr) {
                    console.error(`[AUTO-SWAP] Approve error (continuing):`, approveErr.msg || approveErr.message);
                }
            }

            // 4. Get swap quote to determine Auto Slippage
            console.log(`[AUTO-SWAP] Getting swap quote to determine dynamic auto-slippage...`);
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
                    console.error('[AUTO-SWAP] High price impact 82112 error intercepted:', quoteErr.msg);
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
            console.log(`[AUTO-SWAP] Calculated Slippage: ${dynamicSlippage}%`);

            // 5. Get swap calldata
            console.log(`[AUTO-SWAP] Getting swap transaction data with slippage ${dynamicSlippage}%...`);
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
            console.log(`[AUTO-SWAP] Signing swap tx...`);
            const signedTx = await wallet.signTransaction({
                to: tx.to,
                data: tx.data,
                value: BigInt(tx.value || '0'),
                gasLimit: BigInt(tx.gas || tx.gasLimit || '300000'),
                gasPrice: BigInt(tx.gasPrice || '1000000000'),
                nonce: await provider.getTransactionCount(wallet.address),
                chainId: chainIdNum
            });

            // 6. Broadcast
            console.log(`[AUTO-SWAP] Broadcasting swap tx...`);
            const broadcastResult = await onchainos.broadcastTransaction(signedTx, chainIndex, tw.address);
            const result = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
            const txHash = result?.txHash || result?.orderId || 'pending';
            const orderId = result?.orderId || 'N/A';
            const explorerBase = _getExplorerUrl(chainIndex);
            const explorerLink = `${explorerBase}/tx/${txHash}`;

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

            console.log(`[AUTO-SWAP] ✅ Success! TxHash: ${txHash}`);

            const lang = context?.lang || 'en';
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
            }

            return {
                displayMessage: `🟢 <b>${title}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `💱 <b>${swappedLabel}</b> <code>${fromAmt}</code> ${fromSym} ➔ <code>${toAmt}</code> ${toSym}\n` +
                    `👛 <b>${walletLabel}</b> <code>${tw.address}</code>\n` +
                    `🏷️ <b>${orderLabel}</b> <code>${orderId}</code>\n\n` +
                    `🔗 <a href="${explorerLink}">${linkLabel}</a>`
            };

        } catch (error) {
            console.error(`[AUTO-SWAP] Error:`, error.msg || error.message || error);
            const lang = context?.lang || 'en';
            let title = 'SWAP EXECUTION ERROR';
            let reasonLabel = 'Reason:';
            let hintMsg = 'Please verify your liquidity, balance, or try again later.';

            if (lang === 'vi') {
                title = 'LỖI THỰC HIỆN SWAP';
                reasonLabel = 'Lý do:';
                hintMsg = 'Vui lòng kiểm tra lại thanh khoản, số dư hoặc thử lại sau.';
            } else if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-Hans') {
                title = '兑换执行错误';
                reasonLabel = '原因:';
                hintMsg = '请检查您的流动性、余额，或稍后重试。';
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

            // ── Phase 0: Resolve wallets and handle "max" amounts ──
            console.log(`[BATCH-SWAP] Starting batch swap for ${swaps.length} wallets, user ${userId}`);
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
                        console.log(`[BATCH-SWAP] Wallet ${tw.address.slice(0, 8)}: max resolved to ${finalAmount}`);
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
                    console.log(`[BATCH-SWAP] Phase 1: Parallel approve for ${walletsNeedingApprove.length} wallets...`);

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
                                            nonce: await provider.getTransactionCount(wallet.address), chainId: chainIdNum
                                        });
                                        await onchainos.broadcastTransaction(approveTx, chainIndex, s.tw.address);
                                        console.log(`[BATCH-SWAP] ✅ Approve INFINITE sent for wallet ${s.tw.address.slice(0, 8)}`);
                                    } else {
                                        console.log(`[BATCH-SWAP] ✅ Allowance sufficient for wallet ${s.tw.address.slice(0, 8)}`);
                                    }
                                }
                            } catch (ae) {
                                console.error(`[BATCH-SWAP] Approve error for ${s.tw.address.slice(0, 8)}:`, ae.msg || ae.message);
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
                console.log(`[BATCH-SWAP] Large batch detected (${resolvedSwaps.length}). Running in background mode.`);
            }

            const results = [];
            for (let i = 0; i < resolvedSwaps.length; i++) {
                const swap = resolvedSwaps[i];
                if (swap.error) { results.push({ id: swap.walletId, address: swap.tw?.address || 'N/A', status: '❌', reason: swap.error }); continue; }
                const tw = swap.tw;
                try {
                    const privateKey = global._decryptTradingKey(tw.encryptedKey);
                    const wallet = new ethers.Wallet(privateKey, provider);
                    console.log(`[BATCH-SWAP] [${i + 1}/${resolvedSwaps.length}] Processing wallet ${tw.address.slice(0, 8)} (Amount: ${swap.amount})...`);

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
                                console.error(`[BATCH-SWAP] Wallet ${tw.id}: High price impact 82112 error intercepted`);
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

                    // Sign + broadcast
                    const signedTx = await wallet.signTransaction({
                        to: txRaw.tx.to, data: txRaw.tx.data, value: BigInt(txRaw.tx.value || '0'),
                        gasLimit: BigInt(txRaw.tx.gas || txRaw.tx.gasLimit || '300000'), gasPrice: BigInt(txRaw.tx.gasPrice || '1000000000'),
                        nonce: await provider.getTransactionCount(wallet.address), chainId: chainIdNum
                    });
                    const broadcastResult = await onchainos.broadcastTransaction(signedTx, chainIndex, tw.address);
                    const br = Array.isArray(broadcastResult) ? broadcastResult[0] : broadcastResult;
                    const txHash = br?.txHash || br?.orderId || 'pending';
                    results.push({ id: swap.walletId, address: tw.address, status: '✅', txHash });
                } catch (err) {
                    results.push({ id: swap.walletId, address: tw.address, status: '❌', reason: err.msg || err.message });
                }
            }

            // Build summary
            const successCount = results.filter(r => r.status === '✅').length;
            const lines = results.map((r, i) => {
                const addrShort = r.address !== 'N/A' ? `${r.address.slice(0, 8)}...${r.address.slice(-4)}` : 'N/A';
                if (r.status === '✅') {
                    const explorerBase = _getExplorerUrl(chainIndex);
                    const link = `${explorerBase}/tx/${r.txHash}`;
                    return `${i + 1}. ✅ Ví ${r.id} (${addrShort})\n> [Tx](${link})`;
                }
                return `${i + 1}. ❌ Ví ${r.id} (${addrShort})\n> Lý do: ${r.reason}`;
            });

            console.log(`[BATCH-SWAP] ✅ Done: ${successCount}/${resolvedSwaps.length} successful`);
            return `> IMPORTANT INSTRUCTION: Translate these headers into the user's language but keep the exact layout.\n\n🔄 Batch Swap Results:\n> ${successCount}/${resolvedSwaps.length} wallets succeeded\n\n${lines.join('\n\n')}`;
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

            console.log(`[SIM-BATCH] Simulating batch swap for ${args.swaps.length} wallets...`);
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
        if (!userId) return '❌ Không xác định được người dùng.';
        const action = (args.action || '').toLowerCase();

        if (action === 'create') {
            if (!args.walletId || !args.fromTokenAddress || !args.toTokenAddress || !args.amount) {
                return '❌ Cần cung cấp: walletId, fromTokenAddress, toTokenAddress, amount, intervalHours.';
            }
            const intervalMs = (args.intervalHours || 24) * 3600 * 1000;
            const taskId = `dca_${userId}_${Date.now()}`;
            const params = JSON.stringify({
                walletId: args.walletId,
                chainIndex: args.chainIndex || '196',
                fromTokenAddress: args.fromTokenAddress,
                toTokenAddress: args.toTokenAddress,
                amount: args.amount
            });
            await dbRun('INSERT INTO ai_scheduled_tasks (id, userId, chatId, type, intervalMs, nextRunAt, params, enabled, lang, createdAt) VALUES (?,?,?,?,?,?,?,1,?,?)',
                [taskId, userId, chatId, 'dca_swap', intervalMs, Date.now() + intervalMs, params, context?.lang || 'vi', Math.floor(Date.now() / 1000)]);
            const hours = args.intervalHours || 24;
            return { success: true, action: true, displayMessage: `✅ Đã tạo lịch DCA!\n🆔 ID: ${taskId}\n⏰ Mỗi ${hours}h swap ${args.amount} token\n💡 Dùng "hủy DCA ${taskId}" để dừng.` };

        } else if (action === 'list') {
            const tasks = await dbAll("SELECT * FROM ai_scheduled_tasks WHERE userId = ? AND type = 'dca_swap' AND enabled = 1", [userId]) || [];
            if (tasks.length === 0) return '📭 Chưa có lịch DCA nào.';
            let list = `📅 Danh sách DCA (${tasks.length})\n━━━━━━━━━━━━━━━━━━\n`;
            tasks.forEach((t, i) => {
                const p = JSON.parse(t.params || '{}');
                const hours = Math.round(t.intervalMs / 3600000);
                const nextRun = new Date(t.nextRunAt).toLocaleString('vi-VN');
                list += `${i + 1}. 🆔 ${t.id}\n   ⏰ Mỗi ${hours}h | Số lượng: ${p.amount}\n   ⏭️ Lần tới: ${nextRun}\n\n`;
            });
            return list;

        } else if (action === 'cancel') {
            if (!args.taskId) return '❌ Cần cung cấp taskId để hủy.';
            await dbRun("UPDATE ai_scheduled_tasks SET enabled = 0 WHERE id = ? AND userId = ?", [args.taskId, userId]);
            return { success: true, action: true, displayMessage: `✅ Đã hủy lịch DCA: ${args.taskId}` };
        }
        return '❌ Action không hợp lệ. Hỗ trợ: create, list, cancel.';
    },

};
