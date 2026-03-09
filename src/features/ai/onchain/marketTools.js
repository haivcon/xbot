const onchainos = require('../../../services/onchainos');
const fs = require('fs');
const path = require('path');
const { formatPriceResult, formatSearchResult, formatWalletResult, formatSwapQuoteResult, formatTopTokensResult, formatRecentTradesResult, formatSignalChainsResult, formatSignalListResult, formatProfitRoiResult, formatHolderResult, formatGasResult, formatTokenInfoResult, formatCandlesResult, formatTokenMarketDetail, formatSwapExecutionResult, formatSimulationResult, formatLargeNumber, formatTokenSecurityResult } = require('./formatters');
const { CHAIN_RPC_MAP, CHAIN_EXPLORER_MAP, _getChainRpc, _getExplorerUrl, _getEncryptKey, _hashPin, _verifyPin, autoResolveToken } = require('./helpers');
const db = require('../../../../db.js');

module.exports = {
    async get_token_price(args, context) {
        try {
            // Auto-resolve any symbols to contract addresses before fetching price
            const KNOWN_TOKENS = {
                'BTC': { chainIndex: '1', addr: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' },
                'WBTC': { chainIndex: '1', addr: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' },
                'ETH': { chainIndex: '1', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
                'USDT': { chainIndex: '1', addr: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
                'USDC': { chainIndex: '1', addr: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
                'BNB': { chainIndex: '56', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
                'SOL': { chainIndex: '501', addr: '11111111111111111111111111111111' },
                'OKB': { chainIndex: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
            };
            const resolvedTokens = [];
            for (const token of args.tokens) {
                const upper = (token.tokenContractAddress || '').toUpperCase();
                // Check KNOWN_TOKENS first for common symbols
                if (KNOWN_TOKENS[upper]) {
                    resolvedTokens.push({
                        chainIndex: KNOWN_TOKENS[upper].chainIndex,
                        tokenContractAddress: KNOWN_TOKENS[upper].addr
                    });
                } else if (!token.tokenContractAddress.toLowerCase().startsWith('0x') && token.tokenContractAddress.length < 10) {
                    const resolved = await autoResolveToken(token.tokenContractAddress, token.chainIndex);
                    if (resolved.error) {
                        return resolved.error;
                    }
                    resolvedTokens.push({
                        chainIndex: resolved.chainIndex,
                        tokenContractAddress: resolved.tokenAddress
                    });
                } else {
                    resolvedTokens.push(token);
                }
            }

            const data = await onchainos.getMarketPrice(resolvedTokens);
            const lang = context?.lang || 'en';
            return formatPriceResult(data, lang);
        } catch (error) {
            return `❌ Error fetching price: ${error.msg || error.message}`;
        }
    },

    async search_token(args, context) {
        try {
            const chains = args.chains || '196';
            const keyword = (args.keyword || '').trim();
            const lang = context?.lang || 'en';
            const { msg, bot } = context;

            if (!keyword) {
                return { success: false, error: 'No keyword provided.' };
            }

            const data = await onchainos.getTokenSearch(chains, keyword);
            if (!data || !Array.isArray(data) || data.length === 0) {
                return formatSearchResult([], lang);
            }

            // Import shared helpers from aiHandlers
            const { _buildPriceCard, _buildTokenListPage, _buildTokenListKeyboard, _tokenSearchCache, TKS_PAGE_SIZE } = require('../../../app/aiHandlers');
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '43114': 'Avalanche', '42161': 'Arbitrum', '10': 'Optimism', '8453': 'Base' };
            const { t } = require('../../../core/i18n');

            if (data.length === 1) {
                // Single result → detailed price card
                const sr = data[0];
                const priceCard = await _buildPriceCard(onchainos, sr.chainIndex, sr.tokenContractAddress, sr.tokenSymbol, sr.tokenFullName, chainNames, t, lang);
                const cacheKey = `tks_${Date.now()}_${msg.from?.id || 0}`;
                _tokenSearchCache.set(cacheKey, { results: data, keyword, chainNames, timestamp: Date.now(), t, lang });
                const keyboard = [
                    [
                        { text: t(lang, 'ai_token_btn_swap') || '💱 Swap', callback_data: `tks|swap|${cacheKey}|0` },
                        { text: t(lang, 'ai_token_btn_chart') || '📊 Chart', callback_data: `tks|chart|${cacheKey}|0` },
                        { text: t(lang, 'ai_token_btn_security') || '🔒 Security', callback_data: `tks|sec|${cacheKey}|0` },
                    ],
                    [{ text: t(lang, 'ai_token_btn_copy_ca') || '📋 Copy CA', callback_data: `tks|copy|${cacheKey}|0` }],
                    [{ text: t(lang, 'ai_token_search_close') || '✖️ Close', callback_data: 'tks|close' }]
                ];
                await bot.sendMessage(msg.chat.id, priceCard, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: keyboard },
                    reply_to_message_id: msg.message_id,
                    message_thread_id: msg.message_thread_id || undefined,
                    disable_web_page_preview: true
                });
                return { success: true, action: 'search_displayed', displayMessage: t(lang, 'ai_token_search_found_single', { symbol: sr.tokenSymbol }) || `Price displayed for ${sr.tokenSymbol}.` };
            }

            // Multiple results → paginated list with inline keyboard
            const cacheKey = `tks_${Date.now()}_${msg.from?.id || 0}`;
            _tokenSearchCache.set(cacheKey, { results: data, keyword, chainNames, timestamp: Date.now(), t, lang });
            // Clean old cache (>10 min)
            for (const [k, v] of _tokenSearchCache.entries()) {
                if (Date.now() - v.timestamp > 600000) _tokenSearchCache.delete(k);
            }
            const page = 0;
            const pageText = _buildTokenListPage(data, keyword, page, chainNames, t, lang);
            const keyboard = _buildTokenListKeyboard(data, cacheKey, page, t, lang);
            await bot.sendMessage(msg.chat.id, pageText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
                reply_to_message_id: msg.message_id,
                message_thread_id: msg.message_thread_id || undefined
            });
            return {
                success: true,
                action: 'search_displayed',
                displayMessage: t(lang, 'ai_token_search_found_multi', { count: data.length, keyword }) || `Found ${data.length} tokens matching "${keyword}". Selection list displayed.`
            };
        } catch (error) {
            return `❌ Error searching token: ${error.msg || error.message}`;
        }
    },


    async get_top_tokens(args, context) {
        try {
            const chains = args.chains || '196';
            const sortBy = args.sortBy || '2';
            const timeFrame = args.timeFrame || '4';
            const data = await onchainos.getTokenTopList(chains, sortBy, timeFrame);
            const lang = context?.lang || 'en';
            return formatTopTokensResult(data, chains, lang);
        } catch (error) {
            return `❌ Error fetching top tokens: ${error.msg || error.message}`;
        }
    },

    async get_token_holders(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            // Auto-resolve: if input looks like a symbol (not a contract address), search first
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const [data, priceInfoRes] = await Promise.all([
                onchainos.getTokenHolder(chainIndex, tokenAddress),
                onchainos.getTokenPriceInfo([{ chainIndex, tokenContractAddress: tokenAddress }])
            ].map(p => p.catch(e => null))); // Catch errors so one doesn't kill the other

            let totalSupply = null;
            if (priceInfoRes && Array.isArray(priceInfoRes) && priceInfoRes.length > 0) {
                totalSupply = priceInfoRes[0].circSupply;
            }

            const lang = context?.lang || 'en';
            const finalOutput = formatHolderResult(data, chainIndex, totalSupply, tokenAddress, lang);
            return {
                displayMessage: finalOutput
            };
        } catch (error) {
            return `❌ Error fetching holders: ${error.msg || error.message}`;
        }
    },

    async get_gas_price(args) {
        try {
            const chainIndex = args.chainIndex || '196';
            const data = await onchainos.getGasPrice(chainIndex);
            return formatGasResult(data, chainIndex);
        } catch (error) {
            return `❌ Error fetching gas: ${error.msg || error.message}`;
        }
    },

    async get_token_info(args) {
        try {
            const data = await onchainos.getTokenPriceInfo(args.tokens);
            return formatTokenInfoResult(data);
        } catch (error) {
            return `❌ Error fetching token info: ${error.msg || error.message}`;
        }
    },

    async get_market_candles(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            // Auto-resolve: if input looks like a symbol (not a contract address), search first
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const bar = args.bar || '1H';
            const limit = parseInt(args.limit || '24');
            let data, priceData;
            try {
                [data, priceData] = await Promise.all([
                    onchainos.getMarketCandles(chainIndex, tokenAddress, { bar, limit }),
                    onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => null)
                ]);
            } catch (candleErr) {
                // Fallback: if candle data unavailable (micro-cap tokens), show price + basic info instead
                const lang = context?.lang || 'en';
                const noChartL = {
                    vi: '📉 <b>Không có dữ liệu biểu đồ</b>\n━━━━━━━━━━━━━━━━━━\nToken này chưa có đủ hoạt động giao dịch để tạo biểu đồ K-line.',
                    en: '📉 <b>No Chart Data Available</b>\n━━━━━━━━━━━━━━━━━━\nThis token doesn\'t have enough trading activity for K-line charts.',
                    zh: '📉 <b>无图表数据</b>\n━━━━━━━━━━━━━━━━━━\n此代币交易活动不足，无法生成K线图。',
                    ko: '📉 <b>차트 데이터 없음</b>\n━━━━━━━━━━━━━━━━━━\n이 토큰은 K-line 차트를 생성할 충분한 거래 활동이 없습니다.'
                };
                let fallbackMsg = noChartL[lang] || noChartL.en;
                // Try to get at least the current price
                try {
                    const priceInfo = await onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: tokenAddress }]);
                    if (priceInfo && priceInfo[0]) {
                        const p = Number(priceInfo[0].price || 0);
                        const sym = priceInfo[0].tokenSymbol || tokenAddress.slice(0, 8);
                        const pStr = p < 0.01 ? p.toFixed(8) : p.toFixed(4);
                        const priceLabel = lang === 'vi' ? 'Giá hiện tại' : lang === 'zh' ? '当前价格' : 'Current Price';
                        fallbackMsg += `\n\n💰 <b>${priceLabel}:</b> <code>$${pStr}</code> (${sym})`;
                    }
                } catch (e) { /* ignore */ }
                const hintL = {
                    vi: '\n\n💡 <i>Thử dùng "phân tích token BANMAO" để xem thông tin chi tiết khác.</i>',
                    en: '\n\n💡 <i>Try "analyze token BANMAO" for other available market details.</i>',
                    zh: '\n\n💡 <i>尝试"分析代币BANMAO"获取其他市场详情。</i>',
                    ko: '\n\n💡 <i>"BANMAO 토큰 분석"을 시도하여 다른 시장 세부 정보를 확인하세요.</i>'
                };
                fallbackMsg += hintL[lang] || hintL.en;
                return { displayMessage: fallbackMsg };
            }
            const realTimePrice = priceData && priceData[0] ? Number(priceData[0].price || 0) : null;
            const lang = context?.lang || 'en';
            return formatCandlesResult(data, bar, realTimePrice, tokenAddress, chainIndex, lang);
        } catch (error) {
            return `❌ Error fetching candles: ${error.msg || error.message}`;
        }
    },


    async get_token_market_detail(args, context) {
        try {
            // Auto-resolve tokens if they look like symbols
            let tokens = args.tokens;
            if (Array.isArray(tokens)) {
                const resolved = [];
                for (const t of tokens) {
                    if (t.tokenContractAddress && !t.tokenContractAddress.startsWith('0x') && t.tokenContractAddress.length < 20) {
                        const r = await autoResolveToken(t.tokenContractAddress, t.chainIndex);
                        if (r.error) return r.error;
                        resolved.push({ chainIndex: r.chainIndex, tokenContractAddress: r.tokenAddress });
                    } else {
                        resolved.push(t);
                    }
                }
                tokens = resolved;
            }
            const [priceInfo, basicInfo] = await Promise.all([
                onchainos.getTokenPriceInfo(tokens).catch(() => null),
                onchainos.getTokenBasicInfo(tokens).catch(() => null)
            ]);
            const lang = context?.lang || 'en';

            // If both primary APIs returned empty, try getMarketPrice as fallback
            const hasPrice = priceInfo && Array.isArray(priceInfo) && priceInfo.length > 0;
            const hasBasic = basicInfo && Array.isArray(basicInfo) && basicInfo.length > 0;

            if (!hasPrice && !hasBasic) {
                // Fallback: use getMarketPrice which works for more tokens
                try {
                    const marketPrice = await onchainos.getMarketPrice(tokens);
                    if (marketPrice && Array.isArray(marketPrice) && marketPrice.length > 0) {
                        const mp = marketPrice[0];
                        const price = Number(mp.price || 0);
                        const sym = mp.tokenSymbol || '?';
                        const pStr = price < 0.01 ? price.toFixed(8) : price.toFixed(4);
                        const addr = tokens[0]?.tokenContractAddress || '';
                        const chainIdx = tokens[0]?.chainIndex || '196';
                        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };
                        const chainName = chainNames[chainIdx] || `Chain #${chainIdx}`;
                        const okxChainMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'sol' };
                        const chainPath = okxChainMap[String(chainIdx)] || 'bsc';
                        const explorerUrl = addr ? `https://www.okx.com/web3/explorer/${chainPath}/token/${addr}` : '';

                        const titleL = { vi: 'Thông tin Token', en: 'Token Info', zh: '代币信息', ko: '토큰 정보' };
                        const priceL = { vi: 'Giá hiện tại', en: 'Current Price', zh: '当前价格', ko: '현재가격' };
                        const chainL = { vi: 'Mạng', en: 'Chain', zh: '链', ko: '체인' };
                        const contractL = { vi: 'Hợp đồng', en: 'Contract', zh: '合约', ko: '컨트랙트' };
                        const noteL = {
                            vi: 'Token này chưa được lập chỉ mục đầy đủ. Dữ liệu chi tiết (market cap, volume, liquidity) chưa có trên hệ thống on-chain.',
                            en: 'This token is not fully indexed yet. Detailed data (market cap, volume, liquidity) is not available on-chain.',
                            zh: '此代币尚未完全索引。链上暂无详细数据（市值、成交量、流动性）。',
                            ko: '이 토큰은 아직 완전히 인덱싱되지 않았습니다. 온체인에서 상세 데이터를 사용할 수 없습니다.'
                        };

                        let card = `🪙 <b>${titleL[lang] || titleL.en}: ${sym}</b>\n━━━━━━━━━━━━━━━━━━\n`;
                        card += `💰 <b>${priceL[lang] || priceL.en}:</b> <code>$${pStr}</code>\n`;
                        card += `⛓ <b>${chainL[lang] || chainL.en}:</b> ${chainName} (#${chainIdx})\n`;
                        if (addr) card += `📋 <b>${contractL[lang] || contractL.en}:</b>\n<code>${addr}</code>\n`;
                        if (explorerUrl) card += `🔗 <a href="${explorerUrl}">Explorer</a>\n`;
                        card += `\n⚠️ <i>${noteL[lang] || noteL.en}</i>`;
                        return { displayMessage: card };
                    }
                } catch (e) { /* ignore fallback error */ }
            }

            return formatTokenMarketDetail(priceInfo, basicInfo, lang);
        } catch (error) {
            return `❌ Error fetching market detail: ${error.msg || error.message}`;
        }
    },


    async get_index_price(args) {
        try {
            const data = await onchainos.getIndexPrice(args.tokens);
            if (!data || !Array.isArray(data) || data.length === 0) return 'No index price data available.';
            const lines = data.map(t => {
                const price = Number(t.price || 0);
                return `${t.tokenSymbol || t.tokenContractAddress}: $${price < 0.01 ? price.toFixed(8) : price.toFixed(4)} (Index)`;
            });
            return `📊 Index Prices (aggregated):\n${lines.join('\n')}`;
        } catch (error) {
            return `❌ Error fetching index price: ${error.msg || error.message}`;
        }
    },

    async get_historical_index_price(args) {
        try {
            const data = await onchainos.getHistoricalIndexPrice(
                args.chainIndex, args.tokenContractAddress,
                { period: args.period || '1H', limit: args.limit || '24' }
            );
            if (!data || !Array.isArray(data) || data.length === 0) return 'No historical index price data.';
            const prices = data.map(d => Number(d.price || d[1] || 0)).filter(v => v > 0);
            if (prices.length === 0) return 'No valid price data.';
            const latest = prices[prices.length - 1];
            const oldest = prices[0];
            const change = ((latest - oldest) / oldest * 100).toFixed(2);
            return `📈 Historical Index Price (${args.period || '1H'}, ${data.length} points):\nLatest: $${latest < 0.01 ? latest.toFixed(8) : latest.toFixed(4)}\nChange: ${change >= 0 ? '+' : ''}${change}%\nHigh: $${Math.max(...prices).toFixed(4)}\nLow: $${Math.min(...prices).toFixed(4)}`;
        } catch (error) {
            return `❌ Error fetching historical index price: ${error.msg || error.message}`;
        }
    },

    async estimate_gas_limit(args) {
        try {
            const data = await onchainos.estimateGasLimit({
                chainIndex: args.chainIndex,
                fromAddress: args.fromAddress,
                toAddress: args.toAddress,
                txAmount: args.txAmount || '0'
            });
            if (!data || !Array.isArray(data) || data.length === 0) return 'Could not estimate gas limit.';
            const est = data[0];
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
            return `⛽ Gas Limit Estimate (${chainNames[args.chainIndex] || 'Chain ' + args.chainIndex}):\nGas Limit: ${est.gasLimit || est.gas || 'N/A'}\nGas Price: ${est.gasPrice || 'N/A'} Gwei`;
        } catch (error) {
            return `❌ Error estimating gas: ${error.msg || error.message}`;
        }
    },

    async get_liquidity(args) {
        try {
            const data = await onchainos.getLiquidity(args.chainIndex);
            if (!data || !Array.isArray(data) || data.length === 0) return 'No liquidity pools found.';
            const top10 = data.slice(0, 10);
            const lines = top10.map((pool, i) => {
                const parts = [`${i + 1}. ${pool.dexName || pool.name || 'Unknown DEX'}`];
                if (pool.liquidityUsd) parts.push(`TVL: $${Number(pool.liquidityUsd).toLocaleString()}`);
                if (pool.pairCount) parts.push(`Pairs: ${pool.pairCount}`);
                return parts.join(' | ');
            });
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
            return `💧 Liquidity Pools (${chainNames[args.chainIndex] || 'Chain ' + args.chainIndex}):\n\n${lines.join('\n')}`;
        } catch (error) {
            return `❌ Error fetching liquidity: ${error.msg || error.message}`;
        }
    },

    async get_historical_candles(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const [data, priceData] = await Promise.all([
                onchainos.getHistoricalCandles(chainIndex, tokenAddress, { bar: args.bar || '1D', limit: args.limit || '30' }),
                onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => null)
            ]);
            const realTimePrice = priceData && priceData[0] ? Number(priceData[0].price || 0) : null;
            const lang = context?.lang || 'en';
            return formatCandlesResult(data, args.bar || '1D', realTimePrice, tokenAddress, chainIndex, lang);
        } catch (error) {
            return `❌ Error fetching historical candles: ${error.msg || error.message}`;
        }
    },

    async get_recent_trades(args) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const data = await onchainos.getMarketTrades(chainIndex, tokenAddress, { limit: args.limit || '50' });
            return formatRecentTradesResult(data);
        } catch (error) {
            return `❌ Error fetching recent trades: ${error.msg || error.message}`;
        }
    },

    async get_signal_chains() {
        try {
            const data = await onchainos.getSignalChains();
            return formatSignalChainsResult(data);
        } catch (error) {
            return `❌ Error fetching signal chains: ${error.msg || error.message}`;
        }
    },

    async get_signal_list(args) {
        try {
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, args.chainIndex);
                if (!resolved.error) tokenAddress = resolved.tokenAddress;
            }
            const data = await onchainos.getSignalList(args.chainIndex, {
                walletType: args.walletType,
                minAmountUsd: args.minAmountUsd,
                tokenContractAddress: tokenAddress
            });
            return formatSignalListResult(data);
        } catch (error) {
            return `❌ Error fetching signal list: ${error.msg || error.message}`;
        }
    },

    async calculate_profit_roi(args) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const [data, priceData] = await Promise.all([
                onchainos.getHistoricalCandles(chainIndex, tokenAddress, { bar: args.bar || '1D', limit: args.limit || '30' }),
                onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => null)
            ]);
            const realTimePrice = priceData && priceData[0] ? Number(priceData[0].price || 0) : null;
            return formatProfitRoiResult(data, args.buyPrice, realTimePrice);
        } catch (error) {
            return `❌ Error calculating profit/ROI: ${error.msg || error.message}`;
        }
    },

    async get_weather(args) {
        try {
            const https = require('https');
            const location = encodeURIComponent(args.location);
            const format = args.forecast === '3day' ? '' : '?format=%l:+%c+%t+(feels+like+%f),+%w+wind,+%h+humidity,+%p+precip';
            const url = `https://wttr.in/${location}${format}`;
            const data = await new Promise((resolve, reject) => {
                const req = https.get(url, { headers: { 'User-Agent': 'curl/7.68.0' }, timeout: 8000 }, (res) => {
                    let body = '';
                    res.on('data', (chunk) => { body += chunk; });
                    res.on('end', () => resolve(body));
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            });
            if (!data || data.includes('Unknown location')) {
                return `❌ Location "${args.location}" not found. Try a city name like "Hanoi" or "London".`;
            }
            // For 3day forecast, truncate to reasonable length
            if (args.forecast === '3day') {
                return `Weather Forecast for ${args.location}:\n${data.slice(0, 1500)}`;
            }
            return `Weather: ${data.trim()}`;
        } catch (error) {
            return `❌ Error fetching weather: ${error.message}`;
        }
    },

    async get_trade_history(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.getMarketTrades(
                args.chainIndex,
                args.tokenContractAddress.toLowerCase(),
                { limit: args.limit || '20' }
            );
            if (!data || !Array.isArray(data) || data.length === 0) {
                const noData = { vi: '📭 Không tìm thấy lịch sử giao dịch cho token này.', en: '📭 No trade history found for this token.', zh: '📭 未找到该代币的交易记录。', ko: '📭 이 토큰의 거래 내역을 찾을 수 없습니다.' };
                return noData[lang] || noData.en;
            }
            const buyLabel = { vi: '🟢 MUA', en: '🟢 BUY', zh: '🟢 买入', ko: '🟢 매수' };
            const sellLabel = { vi: '🔴 BÁN', en: '🔴 SELL', zh: '🔴 卖出', ko: '🔴 매도' };
            const headerLabel = { vi: '📊 Lịch sử giao dịch gần đây', en: '📊 Recent Trade History', zh: '📊 最近交易记录', ko: '📊 최근 거래 내역' };
            const lines = data.slice(0, 10).map((t, i) => {
                const type = t.type === 'buy' ? (buyLabel[lang] || buyLabel.en) : (sellLabel[lang] || sellLabel.en);
                const price = Number(t.price || 0);
                const vol = Number(t.volume || 0);
                const time = t.time ? new Date(Number(t.time)).toLocaleString('en-US', { timeZone: 'UTC', hour12: false }) : 'N/A';
                const tokens = (t.changedTokenInfo || []).map(tk => `${Number(tk.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tk.tokenSymbol}`).join(', ');
                return `${i + 1}. ${type} | $${price < 0.01 ? price.toFixed(8) : price.toFixed(4)} | Vol: $${vol.toFixed(2)}\n> ${tokens}\n> ${time} | ${t.dexName || 'DEX'}`;
            });
            return `${headerLabel[lang] || headerLabel.en}:\n\n${lines.join('\n\n')}`;
        } catch (error) {
            return `❌ Error fetching trade history: ${error.msg || error.message}`;
        }
    },

    async get_token_security(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;

            // Auto-resolve token symbols to addresses if necessary
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }

            // Map OKX chainIndex to GoPlus chain id (They are identical for EVM)
            const goplusChainMap = { '1': '1', '56': '56', '196': '196', '137': '137', '42161': '42161', '8453': '8453' };
            const goplusChain = goplusChainMap[String(chainIndex)];

            if (!goplusChain) {
                return `❌ Không hỗ trợ kiểm tra mã độc trên chain ID ${chainIndex}. API GoPlus hiện chỉ hỗ trợ các EVM chain (ETH, BSC, X Layer, Polygon, Base, Arbitrum).`;
            }

            const https = require('https');
            const url = `https://api.gopluslabs.io/api/v1/token_security/${goplusChain}?contract_addresses=${tokenAddress}`;

            const data = await new Promise((resolve, reject) => {
                const req = https.get(url, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error('Invalid JSON from GoPlus API'));
                        }
                    });
                });
                req.on('error', reject);
                req.setTimeout(8000, () => { req.destroy(); reject(new Error('GoPlus API Timeout')); });
            });

            // Hand over to formatter
            const lang = context?.lang || 'en';
            return formatTokenSecurityResult(data, tokenAddress, chainIndex, lang);
        } catch (error) {
            return `❌ Lỗi khi kiểm tra bảo mật: ${error.message}`;
        }
    },

    async check_approval_safety(args, context) {
        try {
            const { dbGet } = require('../../../../db/core');
            const https = require('https');
            const userId = context?.userId;
            const lang = context?.lang || 'en';
            let chainIndex = args.chainIndex || '196';
            let walletAddress = args.walletAddress;

            // If no wallet provided, use user's default trading wallet
            if (!walletAddress && userId) {
                const tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
                if (tw) walletAddress = tw.address;
            }
            if (!walletAddress) {
                return lang === 'vi'
                    ? '❌ Không tìm thấy địa chỉ ví. Vui lòng cung cấp địa chỉ ví hoặc tạo ví trading trước.'
                    : '❌ No wallet address found. Please provide a wallet address or create a trading wallet first.';
            }

            // GoPlus token approval security API
            const goplusChainMap = { '1': '1', '56': '56', '196': '196', '137': '137', '42161': '42161', '8453': '8453' };
            const goplusChain = goplusChainMap[String(chainIndex)];
            if (!goplusChain) {
                return lang === 'vi'
                    ? `❌ Không hỗ trợ kiểm tra approval trên chain ID ${chainIndex}. Chỉ hỗ trợ EVM chains.`
                    : `❌ Approval safety check not supported on chain ${chainIndex}. Only EVM chains supported.`;
            }

            const url = `https://api.gopluslabs.io/api/v2/token_approval_security/${goplusChain}?addresses=${walletAddress}`;
            const data = await new Promise((resolve, reject) => {
                const req = https.get(url, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
                });
                req.on('error', reject);
                req.setTimeout(10000, () => { req.destroy(); reject(new Error('GoPlus API Timeout')); });
            });

            if (!data || data.code !== 1 || !data.result) {
                return lang === 'vi'
                    ? '❌ Không lấy được dữ liệu approval. API GoPlus có thể đang bận.'
                    : '❌ Could not fetch approval data. GoPlus API may be busy.';
            }

            const approvals = data.result;
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base' };
            const chainName = chainNames[chainIndex] || `Chain #${chainIndex}`;

            // Extract token approvals
            const tokenApprovals = approvals.token_list || [];
            if (tokenApprovals.length === 0) {
                const noApprovals = lang === 'vi'
                    ? `🟢 <b>Không có approval nào</b>\n━━━━━━━━━━━━━━━━━━\nVí <code>${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}</code> trên ${chainName} không có token approval nào. Tuyệt vời — ví rất an toàn!`
                    : `🟢 <b>No Approvals Found</b>\n━━━━━━━━━━━━━━━━━━\nWallet <code>${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}</code> on ${chainName} has no token approvals. Great — wallet is very safe!`;
                return { displayMessage: noApprovals };
            }

            // Analyze each approval
            let riskyCount = 0;
            let safeCount = 0;
            const lines = [];
            for (const token of tokenApprovals.slice(0, 10)) {
                const symbol = token.token_symbol || '?';
                const spenders = token.approved_list || [];
                for (const spender of spenders.slice(0, 3)) {
                    const isUnlimited = spender.approved_amount === 'unlimited' || Number(spender.approved_amount || 0) > 1e30;
                    const isRisky = spender.address_risk || spender.is_contract === 0;
                    const riskIcon = isRisky ? '🔴' : isUnlimited ? '🟡' : '🟢';
                    if (isRisky) riskyCount++;
                    else safeCount++;

                    const spenderAddr = spender.approved_spender ? `${spender.approved_spender.slice(0, 8)}...${spender.approved_spender.slice(-4)}` : '?';
                    const amountStr = isUnlimited ? '∞ UNLIMITED' : Number(spender.approved_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
                    lines.push(`${riskIcon} <b>${symbol}</b> → <code>${spenderAddr}</code>\n   Amount: <code>${amountStr}</code>${isRisky ? ' ⚠️ RISKY SPENDER' : ''}`);
                }
            }

            const overallIcon = riskyCount > 0 ? '🔴' : safeCount > 3 ? '🟡' : '🟢';
            const headerLabel = lang === 'vi' ? 'Kiểm tra Approval' : 'Approval Safety Check';
            const walletLabel = lang === 'vi' ? 'Ví' : 'Wallet';
            const summaryLabel = lang === 'vi' ? 'Tóm tắt' : 'Summary';
            const revokeHint = lang === 'vi'
                ? '💡 Để thu hồi approval nguy hiểm, dùng <a href="https://revoke.cash">revoke.cash</a>'
                : '💡 To revoke risky approvals, use <a href="https://revoke.cash">revoke.cash</a>';

            let card = `${overallIcon} <b>${headerLabel}</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <b>${walletLabel}:</b> <code>${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}</code>\n`;
            card += `⛓ ${chainName}\n\n`;
            card += lines.join('\n\n') + '\n\n';
            card += `📊 <b>${summaryLabel}:</b> ${riskyCount > 0 ? `🔴 ${riskyCount} risky` : ''}${riskyCount > 0 && safeCount > 0 ? ' · ' : ''}${safeCount > 0 ? `🟢 ${safeCount} safe` : ''}\n`;
            card += revokeHint;

            return { displayMessage: card };
        } catch (error) {
            return `❌ Error checking approval safety: ${error.message}`;
        }
    },

};
