/**
 * DeFi Invest & Portfolio Tool Handlers
 * Handles AI function calls for DeFi product discovery, investment, and portfolio tracking
 */
const onchainos = require('../../../services/onchainos');
const logger = require('../../../core/logger');
const log = logger.child('DefiTools');
const { CHAIN_NAMES, formatUsd, formatApy } = require('./helpers');


module.exports = {
    // ── DeFi Search ──
    async defi_search(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.defiSearch({
                tokenSymbol: args.token,
                platformName: args.platform,
                chainIndex: args.chainIndex,
                productGroup: args.productGroup || 'SINGLE_EARN',
                pageNum: args.pageNum
            });
            log.debug('defi_search response shape:', JSON.stringify(data)?.slice(0, 300));

            if (!data || (!data.list && !Array.isArray(data))) {
                const noData = { vi: '📭 Không tìm thấy sản phẩm DeFi nào.', en: '📭 No DeFi products found.', zh: '📭 未找到DeFi产品。' };
                return noData[lang] || noData.en;
            }

            const list = data.list || data;
            const total = data.total || list.length;
            const headerL = { vi: 'Sản phẩm DeFi', en: 'DeFi Products', zh: 'DeFi产品' };
            const groupL = { 'SINGLE_EARN': '💰 Earn', 'DEX_POOL': '💧 LP Pool', 'LENDING': '🏦 Lending' };
            const group = args.productGroup || 'SINGLE_EARN';

            let card = `${groupL[group] || '🔍'} <b>${headerL[lang] || headerL.en}</b>\n`;
            card += `📊 Found: ${total} | Group: <code>${group}</code>\n━━━━━━━━━━━━━━━━━━\n\n`;

            const items = (Array.isArray(list) ? list : []).slice(0, 15);
            for (let i = 0; i < items.length; i++) {
                const p = items[i];
                const chain = CHAIN_NAMES[p.chainIndex] || `Chain #${p.chainIndex}`;
                card += `${i + 1}. <b>${p.name || p.investmentName || '?'}</b>\n`;
                card += `   🏛 ${p.platformName || '?'} | ⛓ ${chain}\n`;
                card += `   📈 APY: <code>${formatApy(p.rate)}</code> | 🔒 TVL: ${formatUsd(p.tvl)}\n`;
                card += `   🔑 ID: <code>${p.investmentId}</code>\n\n`;
            }
            if (total > 15) card += `<i>... +${total - 15} more (use pageNum to paginate)</i>\n`;

            const hintL = {
                vi: '\n💡 Dùng "chi tiết DeFi ID:xxx" để xem chi tiết sản phẩm.',
                en: '\n💡 Use "DeFi detail ID:xxx" to view product details.',
                zh: '\n💡 使用"DeFi详情 ID:xxx"查看产品详情。'
            };
            card += hintL[lang] || hintL.en;
            return { displayMessage: card };
        } catch (error) {
            log.error('defi_search error:', error);
            return `❌ Error searching DeFi products: ${error.msg || error.message}`;
        }
    },

    // ── DeFi Detail ──
    async defi_detail(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.defiDetail(args.investmentId);
            if (!data) return lang === 'vi' ? '📭 Không tìm thấy sản phẩm.' : '📭 Product not found.';

            const d = Array.isArray(data) ? data[0] : data;
            const chain = CHAIN_NAMES[d.chainIndex] || `Chain #${d.chainIndex}`;
            const investTypes = { 1: 'Save', 2: 'Pool', 3: 'Farm', 4: 'Vaults', 5: 'Stake', 6: 'Borrow', 7: 'Staking', 8: 'Locked' };

            let card = `🏦 <b>DeFi Product Detail</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `📛 <b>${d.investmentName || d.name || '?'}</b>\n`;
            card += `🏛 Protocol: ${d.platformName || '?'}\n`;
            card += `⛓ Chain: ${chain} (#${d.chainIndex})\n`;
            card += `📈 APY: <code>${formatApy(d.rate)}</code>\n`;
            card += `🔒 TVL: ${formatUsd(d.tvl)}\n`;
            card += `📊 Type: ${investTypes[d.investType] || d.investType || '?'}\n`;

            if (d.hasBonus) card += `🎁 Bonus rewards available\n`;
            if (d.isSupportClaim) card += `✅ Claim supported\n`;
            if (d.isInvestable === false) card += `⚠️ Not accepting new deposits\n`;

            if (d.underlyingToken && d.underlyingToken.length > 0) {
                card += `\n🪙 <b>Underlying Tokens:</b>\n`;
                for (const t of d.underlyingToken) {
                    card += `   • ${t.tokenSymbol} (<code>${t.tokenAddress?.slice(0, 10)}...</code>)\n`;
                }
            }

            if (d.rateDetails && d.rateDetails.length > 0) {
                card += `\n📊 <b>APY Breakdown:</b>\n`;
                for (const r of d.rateDetails) {
                    card += `   • ${r.tokenSymbol || r.title}: ${formatApy(r.rate)}\n`;
                }
            }

            card += `\n🔑 Investment ID: <code>${d.investmentId}</code>`;
            return { displayMessage: card };
        } catch (error) {
            log.error('defi_detail error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── DeFi Deposit ──
    async defi_deposit(args, context) {
        try {
            const lang = context?.lang || 'en';

            // Generate deposit calldata
            const data = await onchainos.defiDeposit({
                investmentId: args.investmentId,
                address: args.address,
                userInputList: args.userInputList,
                slippage: args.slippage,
                tokenId: args.tokenId,
                tickLower: args.tickLower,
                tickUpper: args.tickUpper
            });
            log.debug('defi_deposit response shape:', JSON.stringify(data)?.slice(0, 300));

            if (!data || !data.dataList || data.dataList.length === 0) {
                return lang === 'vi' ? '❌ Không tạo được calldata deposit.' : '❌ Failed to generate deposit calldata.';
            }

            const steps = data.dataList;
            let card = `✅ <b>DeFi Deposit Calldata Ready</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `📦 Steps: ${steps.length}\n\n`;

            for (let i = 0; i < steps.length; i++) {
                const s = steps[i];
                card += `<b>Step ${i + 1}:</b> ${s.callDataType}\n`;
                card += `   From: <code>${s.from?.slice(0, 10)}...</code>\n`;
                card += `   To: <code>${s.to?.slice(0, 10)}...</code>\n`;
                card += `   Data: <code>${s.serializedData?.slice(0, 20)}...</code>\n\n`;
            }

            const warnL = {
                vi: '⚠️ Ký và broadcast từng bước theo thứ tự. Nếu bước nào lỗi, DỪNG lại.',
                en: '⚠️ Sign and broadcast each step in order. If any step fails, STOP.',
                zh: '⚠️ 按顺序签名并广播每个步骤。任何步骤失败则停止。'
            };
            card += warnL[lang] || warnL.en;
            return { displayMessage: card, _calldataSteps: steps };
        } catch (error) {
            log.error('defi_deposit error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── DeFi Redeem ──
    async defi_redeem(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.defiRedeem({
                investmentId: args.investmentId,
                address: args.address,
                chainIndex: args.chainIndex,
                ratio: args.ratio,
                userInputList: args.userInputList,
                tokenId: args.tokenId,
                slippage: args.slippage
            });

            if (!data || !data.dataList || data.dataList.length === 0) {
                return lang === 'vi' ? '❌ Không tạo được calldata redeem.' : '❌ Failed to generate redeem calldata.';
            }

            const steps = data.dataList;
            let card = `✅ <b>DeFi Redeem Calldata Ready</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `📦 Steps: ${steps.length} | Ratio: ${args.ratio ? (Number(args.ratio) * 100) + '%' : 'Partial'}\n\n`;

            for (let i = 0; i < steps.length; i++) {
                const s = steps[i];
                card += `<b>Step ${i + 1}:</b> ${s.callDataType}\n`;
                card += `   To: <code>${s.to?.slice(0, 10)}...</code>\n\n`;
            }
            return { displayMessage: card, _calldataSteps: steps };
        } catch (error) {
            log.error('defi_redeem error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── DeFi Claim ──
    async defi_claim(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.defiClaim({
                address: args.address,
                rewardType: args.rewardType,
                investmentId: args.investmentId,
                analysisPlatformId: args.platformId,
                chainIndex: args.chainIndex,
                tokenId: args.tokenId,
                expectOutputList: args.expectOutputList
            });

            if (!data || !data.dataList || data.dataList.length === 0) {
                return lang === 'vi' ? '❌ Không tạo được calldata claim.' : '❌ Failed to generate claim calldata.';
            }

            let card = `🎁 <b>DeFi Claim Calldata Ready</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `📦 Steps: ${data.dataList.length} | Type: ${args.rewardType}\n\n`;
            for (let i = 0; i < data.dataList.length; i++) {
                card += `<b>Step ${i + 1}:</b> ${data.dataList[i].callDataType}\n`;
            }
            return { displayMessage: card, _calldataSteps: data.dataList };
        } catch (error) {
            log.error('defi_claim error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── DeFi Positions ──
    async defi_positions(args, context) {
        try {
            const lang = context?.lang || 'en';
            const address = args.address;
            const chains = args.chains || '1,56,196,137,42161,8453,501';
            const data = await onchainos.defiPositions(address, chains);

            if (!data || (Array.isArray(data) && data.length === 0)) {
                const noPos = { vi: '📭 Không tìm thấy vị thế DeFi nào.', en: '📭 No DeFi positions found.', zh: '📭 未找到DeFi持仓。' };
                return noPos[lang] || noPos.en;
            }

            const platforms = Array.isArray(data) ? data : [data];
            const totalValue = platforms.reduce((sum, p) => sum + Number(p.totalValue || 0), 0);

            let card = `📊 <b>DeFi Portfolio Overview</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <code>${address.slice(0, 8)}...${address.slice(-4)}</code>\n`;
            card += `💰 Total Value: <b>${formatUsd(totalValue)}</b>\n\n`;

            for (const p of platforms.slice(0, 20)) {
                const chain = CHAIN_NAMES[p.chainIndex] || `Chain #${p.chainIndex}`;
                const pnlIcon = Number(p.profitValue || 0) >= 0 ? '🟢' : '🔴';
                card += `🏛 <b>${p.platformName || '?'}</b> (${chain})\n`;
                card += `   💰 Value: ${formatUsd(p.totalValue)} | ${pnlIcon} PnL: ${formatUsd(p.profitValue)}\n`;
                card += `   🔑 Platform ID: <code>${p.analysisPlatformId}</code>\n\n`;
            }

            const hintL = {
                vi: '💡 Dùng "chi tiết vị thế DeFi platform:xxx chain:yyy" để xem chi tiết.',
                en: '💡 Use "DeFi position detail platform:xxx chain:yyy" for details.',
                zh: '💡 使用"DeFi持仓详情 platform:xxx chain:yyy"查看详情。'
            };
            card += hintL[lang] || hintL.en;
            return { displayMessage: card };
        } catch (error) {
            log.error('defi_positions error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ── DeFi Position Detail ──
    async defi_position_detail(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.defiPositionDetail(args.address, args.chainIndex, args.platformId);

            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không tìm thấy chi tiết vị thế.' : '📭 No position details found.';
            }

            const positions = Array.isArray(data) ? data : [data];
            const chain = CHAIN_NAMES[args.chainIndex] || `Chain #${args.chainIndex}`;
            const investTypes = { '1': 'Save', '2': 'Pool', '3': 'Farm', '4': 'Vaults', '5': 'Stake', '6': 'Borrow', '7': 'Staking' };

            let card = `📋 <b>DeFi Position Detail</b> (${chain})\n━━━━━━━━━━━━━━━━━━\n\n`;

            for (const pos of positions.slice(0, 10)) {
                const type = investTypes[pos.investType] || pos.investType || '?';
                card += `📌 <b>${pos.investmentName || '?'}</b> [${type}]\n`;
                card += `   💰 Value: ${formatUsd(pos.coinUsdValue)} | Amount: ${pos.coinAmount || '?'} ${pos.tokenSymbol || ''}\n`;
                card += `   📈 APY: <code>${formatApy(pos.apy)}</code>\n`;

                if (pos.healthRate) card += `   ❤️ Health Rate: <code>${pos.healthRate}</code>\n`;
                if (pos.earnedTokenList && pos.earnedTokenList.length > 0) {
                    card += `   🎁 Pending rewards:\n`;
                    for (const r of pos.earnedTokenList) {
                        card += `      • ${r.coinAmount || '?'} ${r.tokenSymbol || '?'}\n`;
                    }
                }
                card += `   🔑 ID: <code>${pos.investmentId}</code>\n\n`;
            }
            return { displayMessage: card };
        } catch (error) {
            log.error('defi_position_detail error:', error);
            return `❌ Error: ${error.msg || error.message}`;
        }
    }
};
