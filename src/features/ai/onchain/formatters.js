const { t } = require('../../../core/i18n');

function formatPriceResult(data, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_price_no_data');
    }
    const lines = data.map((item) => {
        const price = Number(item.price || 0);
        return `${item.tokenSymbol || item.tokenContractAddress}: $${price < 0.01 ? price.toFixed(8) : price.toFixed(4)}`;
    });
    return `${t(lang, 'ai_price_header')}\n${lines.join('\n')}`;
}

function formatSearchResult(data, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_search_no_data');
    }
    const top5 = data.slice(0, 5);
    const lines = top5.map((token, i) => {
        const price = token.price ? `**$${Number(token.price) < 0.01 ? Number(token.price).toFixed(8) : Number(token.price).toFixed(4)}**` : 'N/A';
        const addr = token.tokenContractAddress || '';
        const chainIdx = token.chainIndex || '196';
        const okxChainMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'sol' };
        const chainPath = okxChainMap[String(chainIdx)] || 'bsc';
        const explorerUrl = addr ? `https://www.okx.com/web3/explorer/${chainPath}/token/${addr}` : '';
        const addrDisplay = explorerUrl ? `[${addr}](${explorerUrl})` : 'N/A';

        return `${i + 1}. 🪙 **${token.tokenSymbol || '?'}** (${token.tokenFullName || ''})\n   • ${t(lang, 'ai_search_chain')}: **${chainIdx}**\n   • ${t(lang, 'ai_search_price')}: ${price}\n   • ${t(lang, 'ai_search_ca')}: 📋 ${addrDisplay}`;
    });
    return `> IMPORTANT INSTRUCTION: Display this exact token list using the exact markdown layout. DO NOT summarize it or change the format.\n\n${t(lang, 'ai_search_header')}\n\n${lines.join('\n\n')}`;
}

function formatWalletResult(totalValue, balances, address, lang = 'en') {
    if (!totalValue || !totalValue.length) {
        return t(lang, 'ai_wallet_empty', { address: address });
    }
    const tv = Number(totalValue[0].totalValue || 0);
    const tokenList = balances && balances[0] && balances[0].tokenAssets ? balances[0].tokenAssets : (balances || []);

    const lines = [];
    if (Array.isArray(tokenList) && tokenList.length > 0) {
        const sorted = [...tokenList].sort((a, b) => Number(b.tokenPrice || 0) * Number(b.holdingAmount || b.balance || 0) - Number(a.tokenPrice || 0) * Number(a.holdingAmount || a.balance || 0));
        sorted.slice(0, 15).forEach((b, i) => {
            const val = Number(b.holdingAmount || b.balance || b.amount || 0);
            const sym = b.tokenSymbol || b.symbol || '?';
            const priceUsd = Number(b.tokenPrice || b.priceUsd || b.price || 0);
            const usd = priceUsd * val;

            const tokenAddr = b.tokenContractAddress || b.tokenAddress || '';
            const isRisk = b.isRiskToken ? t(lang, 'ai_wallet_risk_warn') : t(lang, 'ai_wallet_safe');

            const chainIdx = b.chainIndex || '196';
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };
            const chainName = chainNames[chainIdx] || `Chain #${chainIdx}`;
            const explorerBase = { '1': 'https://etherscan.io', '56': 'https://bscscan.com', '196': 'https://www.okx.com/web3/explorer/xlayer', '137': 'https://polygonscan.com', '42161': 'https://arbiscan.io', '8453': 'https://basescan.org' };
            const explorer = explorerBase[chainIdx] || explorerBase['196'];
            const safeAddrUrl = `[${sym}](${explorer}/token/${tokenAddr})`;
            lines.push(`${i + 1}. 🌕 **${safeAddrUrl}** — ${t(lang, 'ai_wallet_chain', { chainName, chainIdx })}`);
            lines.push(`📊 ${t(lang, 'ai_wallet_balance_label')} ${val.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${sym}`);
            lines.push(`💰 ${t(lang, 'ai_wallet_price_label')} $${priceUsd < 0.01 ? priceUsd.toFixed(8) : priceUsd.toFixed(4)}`);
            lines.push(`💵 ${t(lang, 'ai_wallet_value_label')} $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} [${isRisk}]`);
            lines.push('');
        });
    }

    const chainIdx = (balances && balances[0] && balances[0].chainIndex) || '196';
    const explorerBase = { '1': 'https://etherscan.io', '56': 'https://bscscan.com', '196': 'https://www.okx.com/web3/explorer/xlayer', '137': 'https://polygonscan.com', '42161': 'https://arbiscan.io', '8453': 'https://basescan.org' };
    const explorer = explorerBase[chainIdx] || explorerBase['196'];
    const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };
    const chainName = chainNames[chainIdx] || `Chain #${chainIdx}`;
    const safeAddr = `[${address}](${explorer}/address/${address})`;

    const now = new Date();
    const timeString = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now);

    return `> IMPORTANT INSTRUCTION: Display this wallet balance EXACTLY as provided below, using blockquotes. DO NOT summarize it.\n\n${t(lang, 'ai_wallet_dex_assets', { default: '💼 DEX Assets -' })}\n${t(lang, 'ai_wallet_time', { time: timeString, default: `⏰ Time: ${timeString}` })}\n${t(lang, 'ai_wallet_address_label', { default: '👛 Wallet:' })} ${safeAddr}\n${t(lang, 'ai_wallet_chain_label', { chainName, chainIdx, default: `Chain: ${chainName} (#${chainIdx})` })}\n${t(lang, 'ai_wallet_total_usd_label', { default: '💰 Total Value USD:' })} ${tv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n${lines.join('\n')}`;
}

function formatSwapQuoteResult(data, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        let title = 'SWAP QUOTE ERROR';
        let notFound = 'No swap route found for this pair on DEX.';
        let hint = 'Please check the token address or try a different amount.';

        if (lang === 'vi') {
            title = 'LỖI BÁO GIÁ SWAP';
            notFound = 'Không tìm thấy tuyến swap nào cho cặp token này trên DEX.';
            hint = 'Vui lòng kiểm tra lại địa chỉ token hoặc thử với số lượng khác.';
        } else if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-cn') {
            title = '兑换报价错误';
            notFound = '未在 DEX 上找到此代币对的兑换路线。';
            hint = '请检查代币地址或尝试使用其他数量。';
        }

        return {
            displayMessage: `❌ <b>${title}</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `${notFound}\n\n` +
                `<i>${hint}</i>`
        };
    }
    const quote = data[0];
    const routerResult = quote.routerResult || {};

    // Token symbols - try multiple paths
    const fromToken = routerResult.fromTokenSymbol || quote.fromTokenSymbol || routerResult.fromToken?.tokenSymbol || '?';
    const toToken = routerResult.toTokenSymbol || quote.toTokenSymbol || routerResult.toToken?.tokenSymbol || '?';

    // Amounts in minimal units
    const fromAmountRaw = routerResult.fromTokenAmount || quote.fromTokenAmount || '0';
    const toAmountRaw = routerResult.toTokenAmount || quote.toTokenAmount || '0';

    // Decimals for human-readable conversion
    const fromDecimals = Number(routerResult.fromToken?.decimal || quote.fromToken?.decimal || 18);
    const toDecimals = Number(routerResult.toToken?.decimal || quote.toToken?.decimal || 18);
    const fromAmountHuman = (Number(fromAmountRaw) / Math.pow(10, fromDecimals)).toLocaleString('en-US', { maximumFractionDigits: 6 });
    const toAmountHuman = (Number(toAmountRaw) / Math.pow(10, toDecimals)).toLocaleString('en-US', { maximumFractionDigits: 6 });

    // Token prices
    const fromPrice = Number(routerResult.fromToken?.tokenUnitPrice || quote.fromToken?.tokenUnitPrice || 0);
    const toPrice = Number(routerResult.toToken?.tokenUnitPrice || quote.toToken?.tokenUnitPrice || 0);

    const priceImpact = routerResult.priceImpactPercentage || quote.priceImpactPercentage || 'N/A';
    const estimatedGas = routerResult.estimateGasFee || quote.estimateGasFee || 'N/A';
    const tradeFee = quote.tradeFee || routerResult.tradeFee || 'N/A';

    const impactNum = parseFloat(priceImpact);
    const priceImpactFormatted = !isNaN(impactNum) ? `${impactNum}%` : 'N/A';

    const dexRoutes = (routerResult.quoteCompareList || quote.quoteCompareList || []).slice(0, 3).map((r) => {
        const receiveHuman = (Number(r.receiveAmount || 0) / Math.pow(10, toDecimals)).toLocaleString('en-US', { maximumFractionDigits: 6 });
        return `  • ${r.dexName}: ${receiveHuman} ${toToken}`;
    }).join('\n');

    // ── Safety Warnings (Honeypot + Tax Rate) ──
    const warnings = [];
    const fromTokenData = routerResult.fromToken || quote.fromToken || {};
    const toTokenData = routerResult.toToken || quote.toToken || {};
    let honeyWarning1 = '🚨 HONEYPOT DETECTED: Destination token has honeypot risks! You might NOT be able to sell later. DO NOT PROCEED!';
    let honeyWarning2 = '⚠️ WARNING: Source token flagged as potential honeypot.';
    let buyTaxLabel = '⚠️ Buy tax:';
    let sellTaxLabel = '⚠️ Sell tax:';
    let impactWarning = '⚠️ HIGH PRICE IMPACT:';
    let impactSugg = '— consider splitting the trade.';
    let warnPrefix = 'Cảnh báo:';

    let titleStr = 'SWAP QUOTE';
    let routeStr = 'Route:';
    let priceStr = 'Price';
    let impactStr = 'Price Impact:';
    let estGasStr = 'Est. Gas:';
    let feeStr = 'Trade Fee:';
    let confirmStr = 'Confirm swap? Reply "ok" or "yes" to proceed.';
    let compStr = 'DEX Comparison:';

    if (lang === 'vi') {
        honeyWarning1 = '🚨 HONEYPOT DETECTED: Token đích có dấu hiệu honeypot! Bạn có thể KHÔNG bán được sau khi mua. KHÔNG nên tiếp tục!';
        honeyWarning2 = '⚠️ CẢNH BÁO: Token nguồn bị đánh dấu là honeypot tiềm năng.';
        buyTaxLabel = '⚠️ Thuế mua:';
        sellTaxLabel = '⚠️ Thuế bán:';
        impactWarning = '⚠️ PRICE IMPACT CAO:';
        impactSugg = '— nên chia nhỏ giao dịch.';
        warnPrefix = 'Cảnh báo:';
        titleStr = 'BÁO GIÁ SWAP';
        routeStr = 'Lộ trình:';
        priceStr = 'Giá';
        impactStr = 'Price Impact:';
        estGasStr = 'Phí Gas (ước tính):';
        feeStr = 'Phí Giao dịch:';
        confirmStr = 'Xác nhận swap? Trả lời "ok" hoặc "có" để tiếp tục.';
        compStr = 'So sánh DEX:';
    } else if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-Hans') {
        honeyWarning1 = '🚨 蜜罐警告：目标代币有貔貅盘（蜜罐）特征！您购买后可能无法卖出。切勿继续操作！';
        honeyWarning2 = '⚠️ 警告：源代币被标记为潜在蜜罐。';
        buyTaxLabel = '⚠️ 买入税:';
        sellTaxLabel = '⚠️ 卖出税:';
        impactWarning = '⚠️ 价格滑点极高:';
        impactSugg = '— 建议拆分交易。';
        warnPrefix = '警告：';
        titleStr = '兑换报价';
        routeStr = '兑换路线:';
        priceStr = '价格';
        impactStr = '价格滑点:';
        estGasStr = '预估 Gas:';
        feeStr = '交易手续费:';
        confirmStr = '确认兑换？回复“ok”或“是”以继续。';
        compStr = 'DEX 比较:';
    }

    if (toTokenData.isHoneyPot === true || toTokenData.isHoneyPot === 'true') {
        warnings.push(honeyWarning1);
    }
    if (fromTokenData.isHoneyPot === true || fromTokenData.isHoneyPot === 'true') {
        warnings.push(honeyWarning2);
    }
    const toTax = Number(toTokenData.taxRate || 0);
    const fromTax = Number(fromTokenData.taxRate || 0);
    if (toTax > 0) {
        warnings.push(`${buyTaxLabel} ${(toTax * 100).toFixed(1)}% (${toToken})`);
    }
    if (fromTax > 0) {
        warnings.push(`${sellTaxLabel} ${(fromTax * 100).toFixed(1)}% (${fromToken})`);
    }
    if (!isNaN(impactNum) && impactNum > 5) {
        warnings.push(`${impactWarning} ${priceImpactFormatted} ${impactSugg}`);
    }

    const warningBlock = warnings.length > 0 ? `\n\n⚠️ ${warnPrefix}\n${warnings.join('\n')}` : '';

    const routesText = dexRoutes ? `\n\n📊 <b>${compStr}</b>\n${dexRoutes}` : '';
    const warningText = warnings.length > 0 ? `\n\n⚠️ <b>${warnPrefix}</b>\n${warnings.map(w => `• ${w}`).join('\n')}` : '';

    return {
        displayMessage: `💱 <b>${titleStr}</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🔄 <b>${routeStr}</b> <code>${fromAmountHuman}</code> ${fromToken} ➔ <code>${toAmountHuman}</code> ${toToken}\n` +
            `📈 <b>${priceStr} ${fromToken}:</b> $${fromPrice < 0.01 ? fromPrice.toFixed(8) : fromPrice.toFixed(4)}\n` +
            `📉 <b>${priceStr} ${toToken}:</b> $${toPrice < 0.01 ? toPrice.toFixed(8) : toPrice.toFixed(4)}\n` +
            `📉 <b>${impactStr}</b> ${priceImpactFormatted}\n` +
            `⛽ <b>${estGasStr}</b> ${estimatedGas}\n` +
            `💵 <b>${feeStr}</b> $${tradeFee}` +
            `${routesText}${warningText}\n\n` +
            `⚡ <i>${confirmStr}</i>`
    };
}

function formatTopTokensResult(data, requestedChains = '196', lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_top_no_data');
    }
    const top10 = data.slice(0, 10);
    const cards = top10.map((tItem, i) => {
        const price = Number(tItem.price || 0);
        const priceStr = price < 0.01 ? price.toFixed(8) : price.toFixed(4);

        const change = Number(tItem.priceChange24H || tItem.priceChange || tItem.change || 0);
        const arrow = change >= 0 ? '📈' : '📉';
        const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

        // Line 1: Rank + Symbol
        const parts = [`#${i + 1} 🪙 ${tItem.tokenSymbol || '?'} (${tItem.tokenFullName || ''})`];
        // Line 2: Price + Change
        parts.push(`💰 **$${priceStr}** ${arrow} **${changeStr}**`);
        // Line 3: Market metrics
        const metrics = [];
        if (tItem.marketCap) metrics.push(`🏦 ${t(lang, 'ai_top_mc_label')} **$${formatLargeNumber(tItem.marketCap)}**`);
        if (tItem.volumeUsd || tItem.volume24h) metrics.push(`📊 ${t(lang, 'ai_top_vol_label')} **$${formatLargeNumber(tItem.volumeUsd || tItem.volume24h)}**`);
        if (tItem.liquidityUsd || tItem.liquidity) metrics.push(`💧 ${t(lang, 'ai_top_liq_label')} **$${formatLargeNumber(tItem.liquidityUsd || tItem.liquidity)}**`);
        if (metrics.length > 0) parts.push(metrics.join(' · '));
        // Line 4: Activity metrics
        const activity = [];
        if (tItem.uniqueTraders) activity.push(`👥 ${t(lang, 'ai_top_traders_label')} **${formatLargeNumber(tItem.uniqueTraders)}**`);
        if (tItem.holderCount) activity.push(`💎 ${t(lang, 'ai_top_holders_label')} **${formatLargeNumber(tItem.holderCount)}**`);
        if (tItem.txs) {
            const buyStr = tItem.txsBuy ? tItem.txsBuy : '?';
            const sellStr = tItem.txsSell ? tItem.txsSell : '?';
            activity.push(`🔁 ${t(lang, 'ai_top_tx_label')} **${tItem.txs}** (${buyStr}/${sellStr})`);
        }
        if (activity.length > 0) parts.push(activity.join(' · '));

        // Line 5: Contract address
        const addr = tItem.tokenContractAddress || tItem.tokenAddress || tItem.contractAddress;
        if (addr) {
            const chainIdx = tItem.chainIndex || requestedChains.split(',')[0] || '196';
            const okxChainMap = {
                '196': 'xlayer',
                '1': 'eth',
                '56': 'bsc',
                '42161': 'arbitrum',
                '8453': 'base',
                '137': 'polygon',
                '501': 'sol'
            };
            const chainPath = okxChainMap[String(chainIdx)] || 'bsc';
            const explorerUrl = `https://www.okx.com/web3/explorer/${chainPath}/token/${addr}`;
            parts.push(`📋 [${addr}](${explorerUrl})`);
        }

        return parts.join('\n');
    });

    const warningText = `\n\n${t(lang, 'ai_top_warning')}`;
    return `> IMPORTANT INSTRUCTION: Display this exact token list using the exact markdown layout. DO NOT summarize it or change the format. Display the full list with line breaks.\n\n${t(lang, 'ai_top_header', { count: top10.length })}\n\n${cards.join('\n\n')}${warningText}`;
}

function formatRecentTradesResult(data) {
    if (!data || !Array.isArray(data) || data.length === 0) return 'No recent trades available.';
    const trades = data.slice(0, 15);
    const lines = trades.map(t => {
        const type = t.type === 'buy' ? '🟢 MUA' : '🔴 BÁN';
        const price = Number(t.price || 0);
        const vol = Number(t.volume || 0);
        const time = new Date(Number(t.time || Date.now())).toLocaleTimeString('vi-VN');
        const dex = t.dexName || '?';
        const pStr = price < 0.01 ? price.toFixed(6) : price.toFixed(4);
        return `[${time}] ${type} trên ${dex}: $${vol.toLocaleString('en-US', { maximumFractionDigits: 0 })} ở giá $${pStr}`;
    });
    return `📊 Giao dịch gần đây (15 lệnh mới nhất):\n\n${lines.join('\n')}`;
}

function formatSignalChainsResult(data) {
    if (!data || !Array.isArray(data) || data.length === 0) return 'No signal chains available.';
    const lines = data.map(c => `- ${c.chainName} (ID: ${c.chainIndex})`);
    return `🔗 Các mạng hỗ trợ Smart Money Signals:\n\n${lines.join('\n')}`;
}

function formatSignalListResult(data) {
    if (!data || !Array.isArray(data) || data.length === 0) return 'Hiện không có tín hiệu Smart Money nào phù hợp.';
    const signals = data.slice(0, 10);
    const lines = signals.map((s, i) => {
        const type = s.walletType === 'SMART_MONEY' ? '🧠 Smart Money' : s.walletType === 'WHALE' ? '🐋 Cá mập' : '🗣️ KOL/Influencer';
        const sym = s.token?.symbol || '?';
        const amount = Number(s.amountUsd || 0);
        const price = Number(s.price || 0);
        const pStr = price < 0.01 ? price.toFixed(6) : price.toFixed(4);
        const addr = s.token?.tokenAddress || '';
        return `${i + 1}. **${sym}**: ${type} vừa mua $${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ở giá $${pStr}\n   > Token: ${addr}`;
    });
    return `> IMPORTANT INSTRUCTION: Display this exactly.\n\n${t(lang, 'ai_signal_latest_header', { default: '🚨 Latest On-chain Signals:' })}\n\n${lines.join('\n\n')}`;
}

function formatProfitRoiResult(data, explicitBuyPrice, realTimePrice) {
    if (!data || !Array.isArray(data) || data.length === 0) return 'Không có dữ liệu lịch sử để tính toán.';
    const candles = data.reverse();
    const closes = candles.map(c => Number(c.close || c[4] || 0)).filter(v => v > 0);
    if (closes.length === 0) return 'Không có giá lịch sử hợp lệ.';

    // Newest is at the end
    const latestClose = closes[closes.length - 1];
    const currentPrice = realTimePrice || latestClose;
    const oldestClose = closes[0];

    const buyPrice = explicitBuyPrice || oldestClose;
    const roi = ((currentPrice - buyPrice) / buyPrice * 100).toFixed(2);

    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const distAth = ((currentPrice - high) / high * 100).toFixed(2);

    const cStr = currentPrice < 0.01 ? currentPrice.toFixed(8) : currentPrice.toFixed(4);
    const bStr = buyPrice < 0.01 ? buyPrice.toFixed(8) : buyPrice.toFixed(4);
    const athStr = high < 0.01 ? high.toFixed(8) : high.toFixed(4);

    return `> IMPORTANT INSTRUCTION: Use these figures to explain the calculation to the user in their language.\n\n` +
        `📈 Phân tích Lợi nhuận & ROI:\n` +
        `- Giá mua tham chiếu: $${bStr}\n` +
        `- Giá hiện tại: $${cStr}\n` +
        `- Lợi nhuận (ROI): ${roi >= 0 ? '+' : ''}${roi}%\n` +
        `- Đỉnh cao nhất (ATH): $${athStr} (cách đỉnh ${distAth}%)\n` +
        (roi < 0 ? `- Cần tăng ${((buyPrice - currentPrice) / currentPrice * 100).toFixed(2)}% từ giá này để hòa vốn.` : '');
}

function formatHolderResult(data, chainIndex, totalSupply, tokenAddress, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_holder_no_data');
    }

    const okxChainMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'sol' };
    const chainPath = okxChainMap[String(chainIndex)] || 'bsc';

    const maxItems = Math.min(data.length, 10);
    const topHolders = data.slice(0, maxItems);

    const ts = Number(totalSupply);
    const hasSupply = !isNaN(ts) && ts > 0;

    const lines = topHolders.map((h, i) => {
        const addr = h.holderWalletAddress || h.holderAddress || t(lang, 'ai_holder_unknown');
        const amt = Number(h.holdAmount || h.amount || 0);
        const amtStr = amt >= 1e6 ? `${(amt / 1e6).toFixed(2)}M` : amt >= 1e3 ? `${(amt / 1e3).toFixed(2)}K` : amt.toLocaleString();

        const explorerUrl = `https://www.okx.com/web3/explorer/${chainPath}/address/${addr}`;

        let pctStr = '';
        if (hasSupply) {
            const pct = (amt / ts) * 100;
            pctStr = ` **(${pct < 0.01 ? '<0.01' : pct.toFixed(2)}%)**`;
        }

        return `${i + 1}. [${addr}](${explorerUrl})\n   └ ${t(lang, 'ai_holder_quantity')} **${amtStr}** token${pctStr}`;
    });

    const tokenLink = tokenAddress ? `\n${t(lang, 'ai_holder_contract')} [${tokenAddress}](https://www.okx.com/web3/explorer/${chainPath}/token/${tokenAddress})` : '';

    return `${t(lang, 'ai_holder_header')}${tokenLink}\n\n` +
        `${lines.join('\n\n')}\n\n` +
        `${t(lang, 'ai_holder_warning')}`;
}

function formatGasResult(data, chainIndex) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return 'No gas data available.';
    }
    const gas = data[0];
    const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana' };
    const chainName = chainNames[chainIndex] || `Chain ${chainIndex}`;
    const parts = [`Gas Price (${chainName}):`];
    if (gas.gasPrice) {
        parts.push(`Normal: ${gas.gasPrice} Gwei`);
    }
    if (gas.suggestGasPrice) {
        parts.push(`Suggested: ${gas.suggestGasPrice} Gwei`);
    }
    if (gas.maxFeePerGas) {
        parts.push(`Max Fee (EIP-1559): ${gas.maxFeePerGas} Gwei`);
    }
    if (gas.baseFee) {
        parts.push(`Base Fee: ${gas.baseFee} Gwei`);
    }
    return parts.join('\n');
}

function formatTokenInfoResult(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return 'No token info available.';
    }
    const lines = data.map((t) => {
        const parts = [`${t.tokenSymbol || '?'} (${t.tokenFullName || ''})`];
        if (t.price) parts.push(`Price: $${Number(t.price) < 0.01 ? Number(t.price).toFixed(8) : Number(t.price).toFixed(4)}`);
        if (t.marketCap) parts.push(`Market Cap: $${Number(t.marketCap).toLocaleString()}`);
        if (t.totalSupply) parts.push(`Total Supply: ${Number(t.totalSupply).toLocaleString()}`);
        if (t.volume24h) parts.push(`24h Volume: $${Number(t.volume24h).toLocaleString()}`);
        if (t.priceChange24H) parts.push(`24h Change: ${Number(t.priceChange24H) >= 0 ? '+' : ''}${Number(t.priceChange24H).toFixed(2)}%`);
        if (t.liquidity) parts.push(`Liquidity: $${Number(t.liquidity).toLocaleString()}`);
        return parts.join('\n');
    });
    return lines.join('\n\n');
}

// ═══════════════════════════════════════════════════════
// New Formatters — Phase 2 AI Agent Upgrade
// ═══════════════════════════════════════════════════════

function formatCandlesResult(data, bar, realTimePrice, tokenAddress, chainIndex, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_chart_no_data');
    }
    // OKX API returns candles in DESCENDING order (newest first) — reverse to ascending
    const candles = data.slice(0, 100).reverse();
    const closes = candles.map((c) => Number(c.close || c[4] || 0)).filter((v) => v > 0);
    if (closes.length === 0) return t(lang, 'ai_chart_invalid');

    // Now closes[0] = oldest, closes[length-1] = newest (correct)
    const latestClose = closes[closes.length - 1];
    const displayPrice = realTimePrice || latestClose;
    const oldest = closes[0];
    const change = ((displayPrice - oldest) / oldest * 100).toFixed(2);
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const avg = (closes.reduce((s, v) => s + v, 0) / closes.length);

    // Simple RSI calculation (14-period)
    let rsi = 'N/A';
    if (closes.length >= 15) {
        let gains = 0, losses = 0;
        for (let i = closes.length - 14; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14;
        rsi = avgLoss === 0 ? '100' : (100 - (100 / (1 + avgGain / avgLoss))).toFixed(1);
    }

    // Advanced TA: EMA calculation helper
    const calcEma = (data, period) => {
        const k = 2 / (period + 1);
        let emaVal = data[0];
        for (let i = 1; i < data.length; i++) {
            emaVal = (data[i] * k) + (emaVal * (1 - k));
        }
        return emaVal;
    };

    let ema12 = 'N/A', ema26 = 'N/A', macdStr = 'N/A', bbStr = 'N/A', supportResistStr = '';
    if (closes.length >= 26) {
        ema12 = calcEma(closes, 12);
        ema26 = calcEma(closes, 26);
        const macd = ema12 - ema26;
        macdStr = `${macd > 0 ? '+' : ''}${macd.toPrecision(3)} (${macd > 0 ? t(lang, 'ai_chart_buy_signal') : t(lang, 'ai_chart_sell_signal')})`;

        // Bollinger Bands (20 SMA)
        const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - sma20, 2), 0) / 20;
        const stddev = Math.sqrt(variance);
        const upperBB = sma20 + (2 * stddev);
        const lowerBB = Math.max(0, sma20 - (2 * stddev));

        const bbU = upperBB < 0.01 ? upperBB.toFixed(6) : upperBB.toFixed(2);
        const bbL = lowerBB < 0.01 ? lowerBB.toFixed(6) : lowerBB.toFixed(2);
        bbStr = `${t(lang, 'ai_chart_bb_upper')} $${bbU} | ${t(lang, 'ai_chart_bb_lower')} $${bbL}`;
        if (displayPrice > upperBB) bbStr += ` (${t(lang, 'ai_chart_overbought')})`;
        else if (displayPrice < lowerBB) bbStr += ` (${t(lang, 'ai_chart_oversold')})`;
    }

    // Support / Resistance simplistic estimation
    if (closes.length >= 20) {
        const sorted = [...closes].sort();
        const support = sorted[Math.floor(sorted.length * 0.1)]; // 10th percentile
        const resistance = sorted[Math.floor(sorted.length * 0.9)]; // 90th percentile
        const suppS = support < 0.01 ? support.toFixed(6) : support.toFixed(2);
        const resS = resistance < 0.01 ? resistance.toFixed(6) : resistance.toFixed(2);
        supportResistStr = `🧱 ${t(lang, 'ai_chart_support')}: $${suppS} | 🛡️ ${t(lang, 'ai_chart_resistance')}: $${resS}\n`;
    }

    // Mini sparkline
    const sparkChars = '▁▂▃▄▅▆▇█';
    const sparkMin = Math.min(...closes);
    const sparkMax = Math.max(...closes);
    const sparkRange = sparkMax - sparkMin || 1;
    const sparkline = closes.slice(-20).map((v) => sparkChars[Math.min(7, Math.floor((v - sparkMin) / sparkRange * 7))]).join('');

    const priceStr = displayPrice < 0.01 ? displayPrice.toFixed(8) : displayPrice.toFixed(2);

    // Attempt to extract coin name from the data or fallback to generic
    const targetTokenSymbol = data[0]?.targetTokenSymbol || 'Hệ sinh thái';
    const isSmallCap = displayPrice < 0.01;

    // Explorer URL Construction
    let explorerUrlDisplay = '';
    if (tokenAddress) {
        const chainIdx = chainIndex || '196';
        const okxChainMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'sol' };
        const chainPath = okxChainMap[String(chainIdx)] || 'bsc';
        const explorerUrl = `https://www.okx.com/web3/explorer/${chainPath}/token/${tokenAddress}`;
        explorerUrlDisplay = `CA: 📋 [${tokenAddress}](${explorerUrl})\n`;
    }

    const warningText = isSmallCap && tokenAddress ? `\n\n${t(lang, 'ai_chart_risk_microcap', { address: tokenAddress })}` : '';
    let statusText = '';
    if (rsi !== 'N/A') {
        const rsiVal = Number(rsi);
        if (rsiVal > 70) statusText = t(lang, 'ai_chart_rsi_status', { status: t(lang, 'ai_chart_overbought') });
        else if (rsiVal < 30) statusText = t(lang, 'ai_chart_rsi_status', { status: t(lang, 'ai_chart_oversold') });
        else statusText = t(lang, 'ai_chart_rsi_status', { status: t(lang, 'ai_chart_neutral') });
    }

    let rsiStatePhrase = '';
    if (rsi !== 'N/A') {
        const rsiVal = Number(rsi);
        if (rsiVal > 70) rsiStatePhrase = t(lang, 'ai_chart_rsi_overbought_state');
        else if (rsiVal < 30) rsiStatePhrase = t(lang, 'ai_chart_rsi_oversold_state');
        else rsiStatePhrase = t(lang, 'ai_chart_rsi_neutral_state');
    }

    return `> IMPORTANT INSTRUCTION: Display this chart analysis EXACTLY as provided below. Use the EXACT markdown layout shown here. DO NOT calculate or invent your own prices or text.\n\n` +
        t(lang, 'ai_chart_header', { bar: bar, count: candles.length }) +
        t(lang, 'ai_chart_tech_chart', { bar: bar, count: candles.length }) + '\n' +
        `${sparkline}\n\n` +
        t(lang, 'ai_chart_market_data') + '\n' +
        `${t(lang, 'ai_chart_current_price')} **$${priceStr}**\n` +
        `${t(lang, 'ai_chart_change', { bar: bar })} **${change >= 0 ? '+' : ''}${change}%**\n` +
        `${t(lang, 'ai_chart_high', { bar: bar })} **$${high < 0.01 ? high.toFixed(8) : high.toFixed(2)}**\n` +
        `${t(lang, 'ai_chart_low', { bar: bar })} **$${low < 0.01 ? low.toFixed(8) : low.toFixed(2)}**\n` +
        explorerUrlDisplay +
        `${t(lang, 'ai_chart_key_levels')}\n` +
        `   🛡️ ${t(lang, 'ai_chart_support')}: **$${supportResistStr.match(/:\s\$([0-9.]+)/)?.[1] || 'N/A'}**\n` +
        `   🧱 ${t(lang, 'ai_chart_resistance')}: **$${supportResistStr.match(/\|\s.*?:\s\$([0-9.]+)/)?.[1] || 'N/A'}**\n` +
        `\n${t(lang, 'ai_chart_deep_analysis')}\n` +
        `**RSI (14): ${rsi}** ${statusText ? `*${statusText}*` : ''}\n` +
        `${t(lang, 'ai_chart_rsi_detail', { state: rsiStatePhrase })}\n\n` +
        `**${t(lang, 'ai_chart_macd')}** ${macdStr !== 'N/A' ? `**${macdStr}**` : t(lang, 'ai_chart_no_data_range')}\n` +
        `**${t(lang, 'ai_chart_bb')}** ${bbStr !== 'N/A' ? `**${bbStr}**` : t(lang, 'ai_chart_no_data_range')}\n` +
        `${warningText}`;
}

function formatTokenMarketDetail(priceInfo, basicInfo, lang = 'en') {
    const tokens = priceInfo || basicInfo || [];
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return t(lang, 'ai_detail_no_data');
    }
    // Merge priceInfo and basicInfo by tokenContractAddress
    const basicMap = new Map();
    if (basicInfo && Array.isArray(basicInfo)) {
        basicInfo.forEach((b) => basicMap.set(`${b.chainIndex}_${b.tokenContractAddress}`, b));
    }
    const lines = tokens.map((tItem) => {
        const basic = basicMap.get(`${tItem.chainIndex}_${tItem.tokenContractAddress}`) || {};
        const parts = [t(lang, 'ai_detail_header', { symbol: tItem.tokenSymbol || basic.tokenSymbol || '?', name: tItem.tokenFullName || basic.tokenFullName || '' })];

        if (tItem.price) parts.push(`${t(lang, 'ai_detail_price')} **$${Number(tItem.price) < 0.01 ? Number(tItem.price).toFixed(8) : Number(tItem.price).toFixed(4)}**`);
        if (tItem.priceChange24H) {
            const ch = Number(tItem.priceChange24H);
            parts.push(`${t(lang, 'ai_detail_change')} **${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%**`);
        }
        if (tItem.marketCap) parts.push(`${t(lang, 'ai_detail_mc')} **$${formatLargeNumber(tItem.marketCap)}**`);
        if (tItem.volume24h) parts.push(`${t(lang, 'ai_detail_vol')} **$${formatLargeNumber(tItem.volume24h)}**`);
        if (tItem.liquidity) parts.push(`${t(lang, 'ai_detail_liq')} **$${formatLargeNumber(tItem.liquidity)}**`);
        if (tItem.totalSupply) parts.push(`${t(lang, 'ai_detail_supply')} **${formatLargeNumber(tItem.totalSupply)}**`);

        // Explorer URL Construction
        const addr = tItem.tokenContractAddress || basic.tokenContractAddress || '';
        if (addr) {
            const chainIdx = tItem.chainIndex || basic.chainIndex || '196';
            const okxChainMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'sol' };
            const chainPath = okxChainMap[String(chainIdx)] || 'bsc';
            const explorerUrl = `https://www.okx.com/web3/explorer/${chainPath}/token/${addr}`;
            parts.push(`${t(lang, 'ai_detail_ca')} [${addr}](${explorerUrl})`);
        }

        if (basic.website) parts.push(`\n🌐 Website: ${basic.website}`);
        if (basic.socialLinks) {
            const social = typeof basic.socialLinks === 'string' ? JSON.parse(basic.socialLinks) : basic.socialLinks;
            if (social?.twitter) parts.push(`🐦 Twitter: ${social.twitter}`);
        }
        return parts.join('\n');
    });
    return `> IMPORTANT INSTRUCTION: Display this exact token market detail using the exact markdown layout. DO NOT summarize it or change the format.\n\n${lines.join('\n\n---\n\n')}`;
}

function formatSwapExecutionResult(data, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_swap_exec_fail_gen');
    }
    const swap = data[0];
    const tx = swap.tx || {};
    const routerResult = swap.routerResult || {};
    const fromToken = routerResult.fromTokenSymbol || '?';
    const toToken = routerResult.toTokenSymbol || '?';

    const parts = [t(lang, 'ai_swap_exec_ready', { from: fromToken, to: toToken })];
    if (tx.minReceiveAmount) parts.push(`${t(lang, 'ai_swap_exec_min_recv')} ${tx.minReceiveAmount}`);
    if (tx.gas) parts.push(`${t(lang, 'ai_swap_exec_gas_limit')} ${tx.gas}`);
    if (tx.gasPrice) parts.push(`${t(lang, 'ai_swap_exec_gas_price')} ${tx.gasPrice}`);
    if (tx.slippagePercent) parts.push(`${t(lang, 'ai_swap_exec_slippage')} ${tx.slippagePercent}%`);
    parts.push('');
    parts.push(t(lang, 'ai_swap_exec_warn_sign'));
    parts.push(t(lang, 'ai_swap_exec_warn_use'));
    parts.push(t(lang, 'ai_swap_exec_confirm'));

    return parts.join('\n');
}

function formatSimulationResult(data, lang = 'en') {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return t(lang, 'ai_sim_fail_empty');
    }
    const sim = data[0];
    const success = sim.success === true || sim.success === 'true' || sim.simulationStatus === 'success';
    if (success) {
        const parts = [t(lang, 'ai_sim_success')];
        if (sim.gasUsed) parts.push(`${t(lang, 'ai_sim_gas_used')} ${sim.gasUsed}`);
        if (sim.gasLimit) parts.push(`${t(lang, 'ai_sim_gas_limit')} ${sim.gasLimit}`);
        parts.push(t(lang, 'ai_sim_success_desc'));
        return parts.join('\n');
    } else {
        const parts = [t(lang, 'ai_sim_failed')];
        if (sim.errorMessage || sim.revertReason) {
            parts.push(`${t(lang, 'ai_sim_reason')} ${sim.errorMessage || sim.revertReason}`);
        }
        parts.push(t(lang, 'ai_sim_fail_desc'));
        return parts.join('\n');
    }
}

function formatLargeNumber(num) {
    const n = Number(num);
    if (isNaN(n)) return String(num);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
    return n.toLocaleString();
}
function formatTokenSecurityResult(data, tokenAddress, chainIndex, lang = 'en') {
    if (!data || data.code !== 1 || !data.result) {
        return t(lang, 'ai_sec_error');
    }

    const addrKey = Object.keys(data.result)[0];
    const tokenData = data.result[addrKey];

    if (!tokenData) {
        return t(lang, 'ai_sec_no_risks');
    }

    const tokenName = tokenData.token_name || t(lang, 'ai_sec_unknown');
    const tokenSymbol = tokenData.token_symbol || '???';
    const isHoneypot = tokenData.is_honeypot === "1";
    const isOpenSource = tokenData.is_open_source === "1";
    const isProxy = tokenData.is_proxy === "1";
    const mintable = tokenData.is_mintable === "1";
    const canTakeBack = tokenData.can_take_back_ownership === "1";

    const formatTax = (taxRaw) => {
        if (taxRaw === "") return "0%";
        if (taxRaw === undefined || taxRaw === null) return t(lang, 'ai_sec_unknown');
        const num = parseFloat(taxRaw);
        if (isNaN(num)) return t(lang, 'ai_sec_unknown');
        // To remove trailing .0 if present, e.g. 5.0% -> 5%
        return `${Number((num * 100).toFixed(2))}%`;
    };

    const buyTax = formatTax(tokenData.buy_tax);
    const sellTax = formatTax(tokenData.sell_tax);
    const holderCount = tokenData.holder_count ? formatLargeNumber(tokenData.holder_count) : t(lang, 'ai_sec_updating');

    let securityScore = 100;
    let warnings = [];

    if (isHoneypot) { securityScore -= 100; warnings.push(t(lang, 'ai_sec_honey_detected')); }
    if (!isOpenSource) { securityScore -= 30; warnings.push(t(lang, 'ai_sec_closed_source')); }
    if (isProxy) { securityScore -= 20; warnings.push(t(lang, 'ai_sec_proxy')); }
    if (mintable) { securityScore -= 20; warnings.push(t(lang, 'ai_sec_mintable')); }
    if (canTakeBack) { securityScore -= 20; warnings.push(t(lang, 'ai_sec_take_back')); }
    if (tokenData.buy_tax && parseFloat(tokenData.buy_tax) > 0.1) { securityScore -= 10; warnings.push(t(lang, 'ai_sec_buy_tax_high', { tax: buyTax })); }
    if (tokenData.sell_tax && parseFloat(tokenData.sell_tax) > 0.1) { securityScore -= 10; warnings.push(t(lang, 'ai_sec_sell_tax_high', { tax: sellTax })); }

    if (securityScore < 0) securityScore = 0;

    const scoreEmoji = securityScore >= 80 ? '🟢' : securityScore >= 50 ? '🟡' : '🔴';

    const okxChainMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'sol' };
    const chainPath = okxChainMap[String(chainIndex)] || 'bsc';
    const explorerUrl = `https://www.okx.com/web3/explorer/${chainPath}/token/${addrKey}`;
    const explorerUrlDisplay = `CA: 📋 [${addrKey}](${explorerUrl})\n`;

    return `> IMPORTANT INSTRUCTION: Display this security analysis EXACTLY as provided below. DO NOT summarize it.\n\n` +
        `${t(lang, 'ai_sec_header')}\n` +
        `${t(lang, 'ai_sec_token')} **${tokenName} (${tokenSymbol})**\n${explorerUrlDisplay}\n` +
        `${t(lang, 'ai_sec_score')} ${scoreEmoji} **${securityScore}/100**\n` +
        `---\n\n` +
        `${t(lang, 'ai_sec_contract_params')}\n` +
        `${t(lang, 'ai_sec_verified')} **${isOpenSource ? t(lang, 'ai_sec_yes') : t(lang, 'ai_sec_no')}**\n` +
        `${t(lang, 'ai_sec_buy_tax')} **${buyTax}**\n` +
        `${t(lang, 'ai_sec_sell_tax')} **${sellTax}**\n` +
        `${t(lang, 'ai_sec_holders')} **${holderCount}**\n\n` +
        `${t(lang, 'ai_sec_risk_analysis')}\n` +
        `${warnings.length > 0 ? warnings.join('\n') : t(lang, 'ai_sec_safe_temp')}\n\n` +
        `${t(lang, 'ai_sec_disclaimer')}`;
}

module.exports = {
    formatPriceResult,
    formatSearchResult,
    formatWalletResult,
    formatSwapQuoteResult,
    formatTopTokensResult,
    formatRecentTradesResult,
    formatSignalChainsResult,
    formatSignalListResult,
    formatProfitRoiResult,
    formatHolderResult,
    formatGasResult,
    formatTokenInfoResult,
    formatCandlesResult,
    formatTokenMarketDetail,
    formatSwapExecutionResult,
    formatSimulationResult,
    formatLargeNumber,
    formatTokenSecurityResult
};
