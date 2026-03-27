/**
 * Agentic Wallet Tool Handlers
 * TEE-based wallet (email+OTP auth) — coexists with existing non-custodial wallets
 * All tools use 'aw_' prefix to avoid conflicts
 */
const onchainos = require('../../../services/onchainos');
const logger = require('../../../core/logger');
const log = logger.child('AgenticWallet');
const { CHAIN_NAMES } = require('./helpers');


module.exports = {
    // ── Login (email OTP or silent) ──
    async aw_login(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awLogin(args.email, args.locale || (lang === 'vi' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'en-US'));

            if (args.email) {
                // OTP flow — email sent
                const card = lang === 'vi'
                    ? `📧 <b>OTP đã gửi</b>\n━━━━━━━━━━━━━━━━━━\nMã OTP đã được gửi đến <code>${args.email}</code>.\nVui lòng kiểm tra email và cung cấp mã 6 chữ số để xác thực.`
                    : `📧 <b>OTP Sent</b>\n━━━━━━━━━━━━━━━━━━\nOTP code sent to <code>${args.email}</code>.\nPlease check your email and provide the 6-digit code to verify.`;
                return { displayMessage: card };
            }

            // Silent login
            if (data && data.accountId) {
                const card = lang === 'vi'
                    ? `✅ <b>Đăng nhập thành công</b>\n━━━━━━━━━━━━━━━━━━\n👤 Account: ${data.accountName || data.accountId}\n🔑 ID: <code>${data.accountId}</code>`
                    : `✅ <b>Login Successful</b>\n━━━━━━━━━━━━━━━━━━\n👤 Account: ${data.accountName || data.accountId}\n🔑 ID: <code>${data.accountId}</code>`;
                return { displayMessage: card };
            }
            return { displayMessage: '✅ Login initiated.' };
        } catch (error) {
            log.error('aw_login error:', error);
            return `❌ Login failed: ${error.msg || error.message}`;
        }
    },

    // ── Verify OTP ──
    async aw_verify_otp(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awVerifyOtp(args.otp);

            if (data && data.accountId) {
                const card = lang === 'vi'
                    ? `✅ <b>Xác thực thành công</b>\n━━━━━━━━━━━━━━━━━━\n👤 Account: ${data.accountName || '?'}\n🔑 ID: <code>${data.accountId}</code>\n\n💡 Giờ bạn có thể dùng "aw balance" để xem số dư.`
                    : `✅ <b>Verification Successful</b>\n━━━━━━━━━━━━━━━━━━\n👤 Account: ${data.accountName || '?'}\n🔑 ID: <code>${data.accountId}</code>\n\n💡 You can now use "aw balance" to check your balance.`;
                return { displayMessage: card };
            }
            return `❌ Verification failed. Please check the OTP code.`;
        } catch (error) {
            log.error('aw_verify_otp error:', error);
            return `❌ OTP verification failed: ${error.msg || error.message}`;
        }
    },

    // ── Balance ──
    async aw_balance(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awGetBalance({
                all: args.all,
                chainIndex: args.chainIndex,
                tokenAddress: args.tokenAddress
            });

            if (!data) {
                return lang === 'vi' ? '📭 Không lấy được số dư. Kiểm tra đã đăng nhập chưa.' : '📭 Could not fetch balance. Check login status.';
            }

            // Handle different response scenarios
            if (data.accounts && Array.isArray(data.accounts)) {
                // Account overview
                let card = `💼 <b>Agentic Wallet Overview</b>\n━━━━━━━━━━━━━━━━━━\n`;
                card += `💰 Total: <b>$${Number(data.totalValueUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n\n`;
                for (const acc of data.accounts) {
                    const active = acc.isActive ? ' ⭐' : '';
                    card += `👤 <b>${acc.accountName || acc.accountId}</b>${active}\n`;
                    card += `   💰 $${Number(acc.totalValueUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
                    if (acc.evmAddress) card += `   EVM: <code>${acc.evmAddress.slice(0, 10)}...${acc.evmAddress.slice(-4)}</code>\n`;
                    if (acc.solAddress) card += `   SOL: <code>${acc.solAddress.slice(0, 8)}...${acc.solAddress.slice(-4)}</code>\n`;
                    card += `\n`;
                }
                return { displayMessage: card };
            }

            if (data.details && Array.isArray(data.details)) {
                // Chain-filtered or token-specific balance
                let card = `💰 <b>Agentic Wallet Balance</b>\n━━━━━━━━━━━━━━━━━━\n`;
                if (data.totalValueUsd) card += `Total: <b>$${Number(data.totalValueUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n\n`;
                for (const group of data.details) {
                    const tokens = group.tokenAssets || [];
                    for (const t of tokens.slice(0, 20)) {
                        const chain = CHAIN_NAMES[t.chainIndex] || `#${t.chainIndex}`;
                        const usdVal = Number(t.usdValue || 0);
                        card += `• <b>${t.symbol || '?'}</b> (${chain}): ${Number(t.balance || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
                        if (usdVal > 0) card += ` ($${usdVal.toFixed(2)})`;
                        card += `\n`;
                    }
                }
                return { displayMessage: card };
            }

            // Raw data fallback
            return { displayMessage: `💰 <b>Balance:</b>\n<pre>${JSON.stringify(data, null, 2).slice(0, 2000)}</pre>` };
        } catch (error) {
            log.error('aw_balance error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── Send ──
    async aw_send(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awSend({
                amount: args.amount,
                toAddress: args.toAddress,
                chainIndex: args.chainIndex,
                fromAddress: args.fromAddress,
                contractToken: args.contractToken,
                force: args.force
            });

            if (data && data.txHash) {
                const chain = CHAIN_NAMES[args.chainIndex] || `Chain #${args.chainIndex}`;
                const card = `✅ <b>Transaction Sent</b>\n━━━━━━━━━━━━━━━━━━\n⛓ ${chain}\n📤 To: <code>${(args.toAddress || '').slice(0, 10)}...${(args.toAddress || '').slice(-4)}</code>\n💰 Amount: <code>${args.amount}</code>\n🔗 TX: <code>${data.txHash}</code>`;
                return { displayMessage: card };
            }

            // Confirmation required
            if (data && data.confirming) {
                return { displayMessage: lang === 'vi' ? '⏳ Giao dịch cần xác nhận. Vui lòng xác nhận để tiếp tục.' : '⏳ Transaction requires confirmation. Please confirm to proceed.' };
            }
            return `❌ Send failed. Unexpected response.`;
        } catch (error) {
            log.error('aw_send error:', error);
            return `❌ Send failed: ${error.msg || error.message}`;
        }
    },

    // ── Contract Call ──
    async aw_contract_call(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awContractCall({
                toAddress: args.toAddress,
                chainIndex: args.chainIndex,
                amount: args.amount,
                inputData: args.inputData,
                unsignedTx: args.unsignedTx,
                gasLimit: args.gasLimit,
                fromAddress: args.fromAddress,
                mevProtection: args.mevProtection,
                force: args.force
            });

            if (data && data.txHash) {
                const chain = CHAIN_NAMES[args.chainIndex] || `Chain #${args.chainIndex}`;
                const card = `✅ <b>Contract Call Executed</b>\n━━━━━━━━━━━━━━━━━━\n⛓ ${chain}\n📋 Contract: <code>${(args.toAddress || '').slice(0, 10)}...${(args.toAddress || '').slice(-4)}</code>\n🔗 TX: <code>${data.txHash}</code>`;
                return { displayMessage: card };
            }
            return `❌ Contract call failed. Unexpected response.`;
        } catch (error) {
            log.error('aw_contract_call error:', error);
            return `❌ Contract call failed: ${error.msg || error.message}`;
        }
    },

    // ── History ──
    async aw_history(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awGetHistory({
                chainIndex: args.chainIndex,
                limit: args.limit || '10',
                cursor: args.cursor,
                txHash: args.txHash,
                address: args.address
            });

            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không có lịch sử giao dịch.' : '📭 No transaction history.';
            }

            // Detail mode (specific tx)
            if (args.txHash) {
                const tx = Array.isArray(data) ? data[0] : data;
                let card = `📋 <b>Transaction Detail</b>\n━━━━━━━━━━━━━━━━━━\n`;
                card += `🔗 Hash: <code>${tx.txHash || '?'}</code>\n`;
                card += `📊 Status: ${tx.txStatus === '1' ? '✅ Success' : tx.txStatus === '2' ? '❌ Failed' : '⏳ Pending'}\n`;
                card += `📤 ${tx.direction || '?'}: ${tx.coinAmount || '?'} ${tx.coinSymbol || '?'}\n`;
                card += `⛓ ${tx.chainSymbol || '?'} | ⛽ Gas: ${tx.serviceCharge || '?'}\n`;
                if (tx.explorerUrl) card += `🔗 <a href="${tx.explorerUrl}">Explorer</a>\n`;
                return { displayMessage: card };
            }

            // List mode
            const list = Array.isArray(data) ? data : (data.orderList ? [data] : []);
            let card = `📋 <b>Agentic Wallet History</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

            for (const group of list) {
                const orders = group.orderList || [];
                for (const tx of orders.slice(0, 10)) {
                    const status = tx.txStatus === '1' ? '✅' : tx.txStatus === '2' ? '❌' : '⏳';
                    const dir = tx.direction === 'send' ? '📤' : '📥';
                    const time = tx.txTime ? new Date(Number(tx.txTime)).toLocaleString('en-US', { hour12: false }) : '?';
                    card += `${status} ${dir} ${tx.coinAmount || '?'} ${tx.coinSymbol || '?'} (${tx.chainSymbol || '?'})\n`;
                    card += `   ${time} | <code>${(tx.txHash || '?').slice(0, 12)}...</code>\n\n`;
                }
            }
            return { displayMessage: card };
        } catch (error) {
            log.error('aw_history error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── Sign Message ──
    async aw_sign_message(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.awSignMessage({
                chainIndex: args.chainIndex,
                message: args.message,
                fromAddress: args.fromAddress,
                type: args.type || 'personal'
            });

            if (data && data.signature) {
                const card = `✍️ <b>Message Signed</b>\n━━━━━━━━━━━━━━━━━━\n📝 Type: ${args.type || 'personal'}\n🔑 Signature:\n<code>${data.signature}</code>`;
                return { displayMessage: card };
            }
            return `❌ Sign message failed. Unexpected response.`;
        } catch (error) {
            log.error('aw_sign_message error:', error);
            return `❌ Sign failed: ${error.msg || error.message}`;
        }
    }
};
