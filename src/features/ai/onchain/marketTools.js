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

    async get_recent_trades(args, context) {
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
            const lang = context?.lang || 'en';
            return formatRecentTradesResult(data, lang);
        } catch (error) {
            return `❌ Error fetching recent trades: ${error.msg || error.message}`;
        }
    },

    async get_signal_chains(args, context) {
        try {
            const data = await onchainos.getSignalChains();
            const lang = context?.lang || 'en';
            return formatSignalChainsResult(data, lang);
        } catch (error) {
            return `❌ Error fetching signal chains: ${error.msg || error.message}`;
        }
    },

    async get_signal_list(args, context) {
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
            const lang = context?.lang || 'en';
            // Get user timezone from group settings or default
            let timezone = 'Asia/Ho_Chi_Minh';
            try {
                const chatId = context?.chatId || context?.msg?.chat?.id;
                if (chatId) {
                    const { dbGet } = require('../../../../db/core');
                    const settings = await dbGet('SELECT timezone FROM checkin_group_settings WHERE chatId = ?', [String(chatId)]);
                    if (settings?.timezone) timezone = settings.timezone;
                }
            } catch (e) { /* non-critical, use default */ }
            const result = formatSignalListResult(data, lang, timezone);
            return {
                displayMessage: result.message,
                reply_markup: result.keyboard,
                action: true,
                success: true
            };
        } catch (error) {
            return { displayMessage: `❌ Error fetching signal list: ${error.msg || error.message}`, action: true, success: false };
        }
    },

    async calculate_profit_roi(args, context) {
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
            return formatProfitRoiResult(data, args.buyPrice, realTimePrice, lang);
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


    // ═══════════════════════════════════════════════════════
    // Meme Pump Scanner Tools
    // ═══════════════════════════════════════════════════════

    async get_meme_list(args, context) {
        try {
            const chainIndex = args.chainIndex || '501';
            const stage = args.stage || 'MIGRATED';
            const options = {};
            if (args.sortBy) options.sortBy = args.sortBy;
            if (args.minMarketCap) options.minMarketCap = args.minMarketCap;
            if (args.maxMarketCap) options.maxMarketCap = args.maxMarketCap;
            if (args.minVolume24h) options.minVolume24h = args.minVolume24h;
            if (args.minHolders) options.minHolders = args.minHolders;
            if (args.limit) options.limit = args.limit;
            const data = await onchainos.getMemePumpTokenList(chainIndex, stage, options);
            const lang = context?.lang || 'en';
            if (!data || !Array.isArray(data) || data.length === 0) {
                const noData = { vi: '📭 Không tìm thấy meme token nào.', en: '📭 No meme tokens found.', zh: '📭 未找到meme代币。', ko: '📭 밈 토큰을 찾을 수 없습니다.' };
                return noData[lang] || noData.en;
            }
            const stageEmoji = { 'NEW': '🆕', 'MIGRATING': '🔄', 'MIGRATED': '🚀' };
            const chainNames = { '501': 'Solana', '728126428': 'Tron' };
            const headerL = { vi: 'Meme Token Scanner', en: 'Meme Token Scanner', zh: 'Meme代币扫描', ko: '밈 토큰 스캐너' };
            let card = `${stageEmoji[stage] || '🔍'} <b>${headerL[lang] || headerL.en}</b> (${chainNames[chainIndex] || 'Chain #' + chainIndex})\n`;
            card += `📊 Stage: <code>${stage}</code> | Found: ${data.length}\n━━━━━━━━━━━━━━━━━━\n\n`;
            const items = data.slice(0, 15);
            for (let i = 0; i < items.length; i++) {
                const t = items[i];
                const sym = t.tokenSymbol || '?';
                const name = t.tokenName || sym;
                const mcap = Number(t.marketCap || 0);
                const vol = Number(t.volume24h || t.volumeUsd || 0);
                const holders = t.holderCount || t.holders || '?';
                const progress = t.progress ? (Number(t.progress) * 100).toFixed(1) + '%' : '';
                const mcapStr = mcap > 1e6 ? '$' + (mcap / 1e6).toFixed(2) + 'M' : mcap > 1e3 ? '$' + (mcap / 1e3).toFixed(1) + 'K' : '$' + mcap.toFixed(0);
                const volStr = vol > 1e6 ? '$' + (vol / 1e6).toFixed(2) + 'M' : vol > 1e3 ? '$' + (vol / 1e3).toFixed(1) + 'K' : '$' + vol.toFixed(0);
                card += `${i + 1}. <b>${sym}</b> — ${name}\n`;
                card += `   💰 MCap: ${mcapStr} | 📊 Vol: ${volStr}\n`;
                card += `   👥 Holders: ${holders}${progress ? ' | ⏳ ' + progress : ''}\n\n`;
            }
            if (data.length > 15) card += `<i>... +${data.length - 15} more</i>\n`;
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error fetching meme list: ${error.msg || error.message}`;
        }
    },

    async get_meme_detail(args, context) {
        try {
            const { chainIndex, tokenContractAddress } = args;
            const data = await onchainos.getMemePumpTokenDetails(chainIndex, tokenContractAddress);
            const lang = context?.lang || 'en';
            if (!data) {
                return lang === 'vi' ? '📭 Không tìm thấy chi tiết token.' : '📭 Token details not found.';
            }
            const d = Array.isArray(data) ? data[0] : data;
            const sym = d.tokenSymbol || '?';
            const name = d.tokenName || sym;
            const mcap = Number(d.marketCap || 0);
            const price = Number(d.price || 0);
            const holders = d.holderCount || d.holders || '?';
            const progress = d.progress ? (Number(d.progress) * 100).toFixed(1) + '%' : 'N/A';
            const creator = d.creatorAddress || d.devAddress || 'Unknown';
            const mcapStr = mcap > 1e6 ? '$' + (mcap / 1e6).toFixed(2) + 'M' : '$' + mcap.toFixed(0);
            const pStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price.toFixed(6);
            let card = `🎯 <b>Meme Token: ${sym}</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `📛 Name: ${name}\n`;
            card += `💰 Price: <code>$${pStr}</code>\n`;
            card += `📊 Market Cap: ${mcapStr}\n`;
            card += `👥 Holders: ${holders}\n`;
            card += `⏳ Progress: ${progress}\n`;
            card += `👨‍💻 Creator: <code>${creator.slice(0, 8)}...${creator.slice(-4)}</code>\n`;
            if (d.description) card += `\n📝 <i>${d.description.slice(0, 200)}</i>\n`;
            if (d.socialLinks || d.twitter || d.telegram || d.website) {
                card += '\n🔗 Links: ';
                if (d.twitter) card += `<a href="${d.twitter}">Twitter</a> `;
                if (d.telegram) card += `<a href="${d.telegram}">Telegram</a> `;
                if (d.website) card += `<a href="${d.website}">Website</a>`;
                card += '\n';
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_meme_dev_info(args, context) {
        try {
            const data = await onchainos.getMemePumpDevInfo(args.chainIndex, args.tokenContractAddress);
            const lang = context?.lang || 'en';
            if (!data) return lang === 'vi' ? '📭 Không tìm thấy thông tin dev.' : '📭 Dev info not found.';
            const d = Array.isArray(data) ? data[0] : data;
            const total = d.totalTokensCreated || d.tokenCount || 0;
            const rugs = d.rugPullCount || d.rugs || 0;
            const migrated = d.migratedCount || d.migrated || 0;
            const golden = d.goldenGemCount || d.golden || 0;
            const devAddr = d.devAddress || d.creator || 'Unknown';
            const riskLevel = rugs > 3 ? '🔴 HIGH RISK' : rugs > 0 ? '🟡 MEDIUM RISK' : '🟢 LOW RISK';
            let card = `👨‍💻 <b>Developer Analysis</b>\n━━━━━━━━━━━━━━━━━━\n`;
            card += `📍 Dev: <code>${devAddr.slice(0, 8)}...${devAddr.slice(-4)}</code>\n\n`;
            card += `📊 Total Tokens Created: <b>${total}</b>\n`;
            card += `🏆 Golden Gems: <b>${golden}</b>\n`;
            card += `✅ Migrated to DEX: <b>${migrated}</b>\n`;
            card += `⚠️ Rug Pulls: <b>${rugs}</b>\n\n`;
            card += `Risk Level: <b>${riskLevel}</b>\n`;
            if (rugs > 0) card += `\n🚨 <i>This developer has ${rugs} rug pull(s). Proceed with caution!</i>`;
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_similar_memes(args, context) {
        try {
            const data = await onchainos.getMemePumpSimilarTokens(args.chainIndex, args.tokenContractAddress);
            const lang = context?.lang || 'en';
            if (!data || !Array.isArray(data) || data.length === 0) {
                return lang === 'vi' ? '📭 Không tìm thấy token tương tự.' : '📭 No similar tokens found.';
            }
            let card = '🔄 <b>Similar Meme Tokens</b>\n━━━━━━━━━━━━━━━━━━\n\n';
            data.slice(0, 10).forEach((t, i) => {
                const sym = t.tokenSymbol || '?';
                const mcap = Number(t.marketCap || 0);
                const mcapStr = mcap > 1e6 ? '$' + (mcap / 1e6).toFixed(2) + 'M' : '$' + mcap.toFixed(0);
                card += `${i + 1}. <b>${sym}</b> — ${t.tokenName || sym} | MCap: ${mcapStr}\n`;
            });
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Portfolio PnL Tools
    // ═══════════════════════════════════════════════════════

    async get_portfolio_overview(args, context) {
        try {
            const timeFrame = args.timeFrame || '3';
            const data = await onchainos.getPortfolioOverview(args.chainIndex, args.walletAddress, timeFrame);
            const lang = context?.lang || 'en';
            if (!data) return lang === 'vi' ? '📭 Không tìm thấy dữ liệu portfolio.' : '📭 Portfolio data not found.';
            const d = Array.isArray(data) ? data[0] : data;
            const pnl = Number(d.totalPnl || d.pnl || 0);
            const winRate = Number(d.winRate || 0);
            const totalTrades = Number(d.totalTradeCount || d.txCount || 0);
            const totalBuy = Number(d.totalBuyAmount || d.buyCount || 0);
            const totalSell = Number(d.totalSellAmount || d.sellCount || 0);
            const timeLabels = { '1': '1D', '2': '3D', '3': '7D', '4': '1M', '5': '3M' };
            const addr = args.walletAddress;
            const pnlStr = pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2);
            const pnlIcon = pnl >= 0 ? '🟢' : '🔴';
            let card = `📊 <b>Portfolio Overview</b> (${timeLabels[timeFrame] || timeFrame})\n━━━━━━━━━━━━━━━━━━\n`;
            card += `👛 <code>${addr.slice(0, 8)}...${addr.slice(-4)}</code>\n\n`;
            card += `${pnlIcon} PnL: <b>${pnlStr}</b>\n`;
            card += `🎯 Win Rate: <b>${(winRate * 100).toFixed(1)}%</b>\n`;
            card += `📈 Total Trades: <b>${totalTrades}</b>\n`;
            card += `🟢 Buys: ${totalBuy} | 🔴 Sells: ${totalSell}\n`;
            if (d.topTokens && Array.isArray(d.topTokens)) {
                card += '\n🏆 Top Tokens:\n';
                d.topTokens.slice(0, 5).forEach((t, i) => {
                    const tPnl = Number(t.pnl || 0);
                    card += `  ${i + 1}. ${t.tokenSymbol || '?'}: ${tPnl >= 0 ? '+' : ''}$${tPnl.toFixed(2)}\n`;
                });
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_portfolio_pnl(args, context) {
        try {
            const options = {};
            if (args.limit) options.limit = args.limit;
            let data;
            if (args.tokenContractAddress) {
                data = await onchainos.getTokenLatestPnl(args.chainIndex, args.walletAddress, args.tokenContractAddress);
            } else {
                data = await onchainos.getRecentPnl(args.chainIndex, args.walletAddress, options);
            }
            const lang = context?.lang || 'en';
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không tìm thấy dữ liệu PnL.' : '📭 No PnL data found.';
            }
            const items = Array.isArray(data) ? data : [data];
            let card = '📊 <b>PnL Report</b>\n━━━━━━━━━━━━━━━━━━\n\n';
            items.slice(0, 20).forEach((t, i) => {
                const sym = t.tokenSymbol || '?';
                const pnl = Number(t.pnl || t.realizedPnl || 0);
                const unrealized = Number(t.unrealizedPnl || 0);
                const icon = pnl >= 0 ? '🟢' : '🔴';
                const pnlStr = pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2);
                card += `${i + 1}. ${icon} <b>${sym}</b>: ${pnlStr}`;
                if (unrealized !== 0) card += ` (Unrealized: $${unrealized.toFixed(2)})`;
                card += '\n';
            });
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_portfolio_dex_history(args, context) {
        try {
            const now = Date.now();
            const begin = String(now - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            const end = String(now);
            const options = {};
            if (args.type) options.type = args.type;
            if (args.limit) options.limit = args.limit;
            const data = await onchainos.getDexHistory(args.chainIndex, args.walletAddress, begin, end, options);
            const lang = context?.lang || 'en';
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không tìm thấy lịch sử DEX.' : '📭 No DEX history found.';
            }
            const items = Array.isArray(data) ? data : [data];
            const typeLabels = { '1': '🟢 BUY', '2': '🔴 SELL', '3': '📥 IN', '4': '📤 OUT' };
            let card = '📜 <b>DEX Transaction History</b>\n━━━━━━━━━━━━━━━━━━\n\n';
            items.slice(0, 15).forEach((tx, i) => {
                const type = typeLabels[tx.type] || tx.type || '?';
                const sym = tx.tokenSymbol || '?';
                const amount = Number(tx.amount || tx.tokenAmount || 0);
                const value = Number(tx.valueUsd || tx.usdValue || 0);
                const time = tx.time ? new Date(Number(tx.time)).toLocaleString('en-US', { hour12: false }) : '';
                card += `${i + 1}. ${type} <b>${sym}</b>: ${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ($${value.toFixed(2)})\n`;
                if (time) card += `   🕐 ${time}\n`;
            });
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Transaction History Tools
    // ═══════════════════════════════════════════════════════

    async get_tx_history(args, context) {
        try {
            const options = { chains: args.chains };
            if (args.limit) options.limit = args.limit;
            const data = await onchainos.getTransactionHistory(args.address, options);
            const lang = context?.lang || 'en';
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không tìm thấy lịch sử giao dịch.' : '📭 No transaction history found.';
            }
            const items = Array.isArray(data) ? data : [data];
            let card = '📜 <b>Transaction History</b>\n━━━━━━━━━━━━━━━━━━\n\n';
            items.slice(0, 15).forEach((tx, i) => {
                const hash = tx.txHash || tx.txhash || '?';
                const method = tx.methodLabel || tx.method || tx.txType || 'Transfer';
                const from = tx.from || '?';
                const to = tx.to || '?';
                const value = tx.amount || tx.value || '0';
                const time = tx.transactionTime ? new Date(Number(tx.transactionTime)).toLocaleString('en-US', { hour12: false }) : '';
                card += `${i + 1}. <b>${method}</b>\n`;
                card += `   📤 ${from.slice(0, 8)}... → 📥 ${to.slice(0, 8)}...\n`;
                if (Number(value) > 0) card += `   💰 ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 })}\n`;
                card += `   🔗 <code>${hash.slice(0, 12)}...</code>`;
                if (time) card += ` | 🕐 ${time}`;
                card += '\n\n';
            });
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_tx_detail(args, context) {
        try {
            const data = await onchainos.getTransactionDetail(args.chainIndex, args.txHash);
            const lang = context?.lang || 'en';
            if (!data) return lang === 'vi' ? '📭 Không tìm thấy giao dịch.' : '📭 Transaction not found.';
            const d = Array.isArray(data) ? data[0] : data;
            const hash = d.txHash || d.txhash || args.txHash;
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
            let card = '🔍 <b>Transaction Detail</b>\n━━━━━━━━━━━━━━━━━━\n\n';
            card += `⛓ Chain: ${chainNames[args.chainIndex] || 'Chain #' + args.chainIndex}\n`;
            card += `🔗 Hash: <code>${hash}</code>\n`;
            if (d.from) card += `📤 From: <code>${d.from}</code>\n`;
            if (d.to) card += `📥 To: <code>${d.to}</code>\n`;
            if (d.amount || d.value) card += `💰 Value: ${d.amount || d.value}\n`;
            if (d.gasUsed) card += `⛽ Gas Used: ${d.gasUsed}\n`;
            if (d.gasPrice) card += `⛽ Gas Price: ${d.gasPrice} Gwei\n`;
            if (d.txFee) card += `💸 Fee: ${d.txFee}\n`;
            if (d.state !== undefined) card += `✅ Status: ${d.state === '1' || d.state === 'success' ? '✅ Success' : '❌ Failed'}\n`;
            if (d.methodLabel) card += `📋 Method: ${d.methodLabel}\n`;
            if (d.tokenTransferDetails && d.tokenTransferDetails.length > 0) {
                card += '\n📦 Token Transfers:\n';
                d.tokenTransferDetails.slice(0, 5).forEach(t => {
                    card += `  • ${Number(t.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${t.symbol || '?'}\n`;
                });
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Token Advanced Audit Tools
    // ═══════════════════════════════════════════════════════

    async get_token_audit(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const data = await onchainos.getTokenAdvancedInfo(chainIndex, tokenAddress);
            const lang = context?.lang || 'en';
            if (!data) return lang === 'vi' ? '📭 Không tìm thấy dữ liệu audit.' : '📭 Audit data not found.';
            const d = Array.isArray(data) ? data[0] : data;
            const riskLevel = d.riskLevel || d.risk || 'UNKNOWN';
            const riskIcon = riskLevel === 'HIGH' ? '🔴' : riskLevel === 'MEDIUM' ? '🟡' : riskLevel === 'LOW' ? '🟢' : '⚪';
            let card = `🔒 <b>Token Audit Report</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
            card += `${riskIcon} Risk Level: <b>${riskLevel}</b>\n\n`;
            if (d.isHoneypot !== undefined) card += `🍯 Honeypot: <b>${d.isHoneypot ? '⚠️ YES' : '✅ NO'}</b>\n`;
            if (d.lpBurnPercent !== undefined) card += `🔥 LP Burned: <b>${(Number(d.lpBurnPercent) * 100).toFixed(1)}%</b>\n`;
            if (d.devHoldingPercent !== undefined) card += `👨‍💻 Dev Holding: <b>${(Number(d.devHoldingPercent) * 100).toFixed(1)}%</b>\n`;
            if (d.bundlePercent !== undefined) card += `📦 Bundle: <b>${(Number(d.bundlePercent) * 100).toFixed(1)}%</b>\n`;
            if (d.sniperPercent !== undefined) card += `🎯 Sniper: <b>${(Number(d.sniperPercent) * 100).toFixed(1)}%</b>\n`;
            if (d.devSold !== undefined) card += `💸 Dev Sold: <b>${d.devSold ? '⚠️ YES' : '✅ NO'}</b>\n`;
            if (d.tags && Array.isArray(d.tags) && d.tags.length > 0) {
                card += `\n🏷️ Tags: ${d.tags.join(', ')}\n`;
            }
            if (d.rugPullHistory && d.rugPullHistory > 0) {
                card += `\n🚨 <b>DEV RUG PULL HISTORY: ${d.rugPullHistory} times!</b>\n`;
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_token_liquidity_pools(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const data = await onchainos.getTokenLiquidityPool(chainIndex, tokenAddress);
            const lang = context?.lang || 'en';
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không tìm thấy liquidity pool.' : '📭 No liquidity pools found.';
            }
            const pools = Array.isArray(data) ? data : [data];
            let card = '💧 <b>Top Liquidity Pools</b>\n━━━━━━━━━━━━━━━━━━\n\n';
            pools.slice(0, 5).forEach((pool, i) => {
                const dex = pool.dexName || pool.protocolName || 'DEX';
                const tvl = Number(pool.liquidityUsd || pool.tvl || 0);
                const tvlStr = tvl > 1e6 ? '$' + (tvl / 1e6).toFixed(2) + 'M' : '$' + tvl.toFixed(0);
                const fee = pool.feeRate ? (Number(pool.feeRate) * 100).toFixed(2) + '%' : 'N/A';
                const pair = pool.pairName || pool.tokenPair || '';
                card += `${i + 1}. <b>${dex}</b>${pair ? ' (' + pair + ')' : ''}\n`;
                card += `   💰 TVL: ${tvlStr} | 💸 Fee: ${fee}\n\n`;
            });
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Smart Trade Activity
    // ═══════════════════════════════════════════════════════

    async get_smart_trades(args, context) {
        try {
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const options = { limit: args.limit || '50' };
            if (args.tagFilter) options.tagFilter = args.tagFilter;
            const data = await onchainos.getMarketTrades(chainIndex, tokenAddress, options);
            const lang = context?.lang || 'en';
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return lang === 'vi' ? '📭 Không tìm thấy giao dịch smart money.' : '📭 No smart trades found.';
            }
            const tagLabels = { '1': '👑 KOL', '2': '🛠️ Dev', '3': '🧠 Smart Money', '4': '🐋 Whale', '5': '🆕 New Wallet', '6': '⚠️ Suspicious', '7': '🎯 Sniper', '8': '🎣 Phishing', '9': '📦 Bundle' };
            const filterLabel = args.tagFilter ? tagLabels[args.tagFilter] || args.tagFilter : 'All';
            let card = `🔍 <b>Smart Trade Activity</b> (${filterLabel})\n━━━━━━━━━━━━━━━━━━\n\n`;
            const items = Array.isArray(data) ? data : [data];
            items.slice(0, 15).forEach((t, i) => {
                const type = t.type === 'buy' ? '🟢 BUY' : '🔴 SELL';
                const vol = Number(t.volume || t.tradeAmount || 0);
                const addr = t.traderAddress || t.walletAddress || '?';
                const tag = t.tag ? (tagLabels[t.tag] || t.tag) : '';
                const time = t.time ? new Date(Number(t.time)).toLocaleString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
                card += `${i + 1}. ${type} $${vol.toFixed(2)} ${tag}\n`;
                card += `   👤 <code>${addr.slice(0, 8)}...</code>${time ? ' | 🕐 ' + time : ''}\n\n`;
            });
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Idea #6: AI Deep Research
    // ═══════════════════════════════════════════════════════
    async deep_research_token(args, context) {
        try {
            let chainIndex = args.chainIndex || '196';
            let tokenAddress = args.tokenContractAddress;

            // Auto-resolve symbols
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }

            const lang = context?.lang || 'en';
            const { deepResearch, formatResearchReport } = require('../../../skills/onchain/researchPipeline');
            const report = await deepResearch(chainIndex, tokenAddress, { lang });
            const card = formatResearchReport(report, lang);

            return {
                displayMessage: card,
                action: true,
                success: true
            };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Idea #1: AI Auto Trading Agent
    // ═══════════════════════════════════════════════════════
    async manage_auto_trading(args, context) {
        try {
            const { manageAutoTrading } = require('../../autoTrading');
            return await manageAutoTrading(args, context);
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Idea #9: Cross-Chain Arbitrage Scanner
    // ═══════════════════════════════════════════════════════
    async scan_arbitrage(args, context) {
        try {
            const { scanArbitrage } = require('../../arbitrageScanner');
            return await scanArbitrage(args.tokenSymbol, args.chains, context);
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Idea #5: Copy Trading
    // ═══════════════════════════════════════════════════════
    async manage_copy_trading(args, context) {
        try {
            const copy = require('../../copyTrading');
            const action = (args.action || 'status').toLowerCase();
            switch (action) {
                case 'register':
                    return await copy.registerAsLeader(context.userId, args.walletAddress, context);
                case 'follow':
                    return await copy.followLeader(context.userId, args.leaderId, { maxCopyAmount: args.maxCopyAmount, ...context });
                case 'unfollow':
                    return await copy.unfollowLeader(context.userId, args.leaderId, context);
                case 'leaderboard':
                    return await copy.getLeaderboard(context);
                case 'my_followers':
                    return await copy.getFollowers(context.userId, context);
                case 'status':
                    return await copy.getFollowers(context.userId, context);
                default:
                    return `❌ Unknown action: ${action}. Use: register, follow, unfollow, leaderboard, my_followers, status`;
            }
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // Idea #7: Agent Marketplace
    // ═══════════════════════════════════════════════════════
    async browse_marketplace(args, context) {
        try {
            const mp = require('../../marketplace');
            const action = (args.action || 'list').toLowerCase();
            switch (action) {
                case 'list':
                    return await mp.listPlugins(args.category, context);
                case 'install':
                    return await mp.installPlugin(args.pluginId, context);
                case 'remove':
                    return await mp.uninstallPlugin(args.pluginId, context);
                case 'info': {
                    // No dedicated getPluginInfo — use listPlugins and filter
                    const all = await mp.listPlugins(null, context);
                    if (typeof all === 'string') return all;
                    return all;
                }
                default:
                    return `❌ Unknown action: ${action}. Use: list, install, remove, info`;
            }
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    // ═══════════════════════════════════════════════════════
    // New OnchainOS API Tool Handlers  
    // ═══════════════════════════════════════════════════════

    async get_hot_tokens(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.getHotTokens({ chainIndex: args.chainIndex || '', limit: args.limit || '20' });
            const list = Array.isArray(data) ? data : (data?.data || []);
            if (!list || list.length === 0) {
                return { vi: '📭 Không tìm thấy token hot.', en: '📭 No hot tokens found.' }[lang] || '📭 No hot tokens found.';
            }
            const headerL = { vi: '🔥 Token Đang Hot', en: '🔥 Hot Tokens', zh: '🔥 热门代币', ko: '🔥 인기 토큰' };
            const chainNames = { '1': 'ETH', '56': 'BSC', '196': 'XLayer', '501': 'SOL', '137': 'Polygon', '42161': 'Arb', '8453': 'Base' };
            let card = `${headerL[lang] || headerL.en}\n━━━━━━━━━━━━━━━━━━\n\n`;
            const fmtNum = (n) => n > 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n > 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + n.toFixed(0);
            for (let i = 0; i < Math.min(list.length, 20); i++) {
                const t = list[i];
                const price = Number(t.price || t.lastPrice || 0);
                const change = Number(t.priceChange24h || t.change24h || 0);
                const pStr = price < 0.01 ? price.toFixed(8) : price.toFixed(4);
                const changeIcon = change > 0 ? '🟢' : change < 0 ? '🔴' : '⚪';
                const chain = chainNames[t.chainIndex || t.chainId] || '';
                card += `${i + 1}. <b>${t.tokenSymbol || '?'}</b>${chain ? ' (' + chain + ')' : ''}\n`;
                card += `   💰 $${pStr} ${changeIcon} ${change >= 0 ? '+' : ''}${change.toFixed(1)}%\n`;
                if (Number(t.marketCap || 0) > 0) card += `   📊 MCap: ${fmtNum(t.marketCap)} | Vol: ${fmtNum(t.volume24h || 0)}\n`;
                card += '\n';
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_top_traders(args, context) {
        try {
            const lang = context?.lang || 'en';
            let chainIndex = args.chainIndex || '196';
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const data = await onchainos.getTopTrader(chainIndex, tokenAddress, { tagFilter: args.tagFilter });
            const list = Array.isArray(data) ? data : (data?.data || []);
            if (!list || list.length === 0) {
                return { vi: '📭 Không tìm thấy trader.', en: '📭 No top traders found.' }[lang] || '📭 No top traders found.';
            }
            const headerL = { vi: '🏆 Top Traders', en: '🏆 Top Traders', zh: '🏆 顶级交易者', ko: '🏆 탑 트레이더' };
            const tagMap = { '1': 'KOL', '2': 'Dev', '3': 'Smart Money', '4': 'Whale', '7': 'Sniper' };
            let card = `${headerL[lang] || headerL.en}\n━━━━━━━━━━━━━━━━━━\n\n`;
            const fmtNum = (n) => n > 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n > 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + n.toFixed(0);
            for (let i = 0; i < Math.min(list.length, 15); i++) {
                const t = list[i];
                const addr = t.traderAddress || t.address || '?';
                const pnl = Number(t.pnl || t.profitUsd || 0);
                const vol = Number(t.volumeUsd || t.tradeVolume || 0);
                const tag = t.tag ? tagMap[t.tag] || t.tag : '';
                const pnlIcon = pnl > 0 ? '🟢' : pnl < 0 ? '🔴' : '⚪';
                card += `${i + 1}. <code>${addr.slice(0, 6)}...${addr.slice(-4)}</code>${tag ? ' [' + tag + ']' : ''}\n`;
                card += `   ${pnlIcon} PnL: ${pnl >= 0 ? '+' : ''}${fmtNum(pnl)} | Vol: ${fmtNum(vol)}\n\n`;
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_address_tracker(args, context) {
        try {
            const lang = context?.lang || 'en';
            const data = await onchainos.getAddressTrackerActivities({
                chainIndex: args.chainIndex, trackerType: args.trackerType || '1', limit: args.limit || '20'
            });
            const list = Array.isArray(data) ? data : (data?.data || []);
            if (!list || list.length === 0) {
                return { vi: '📭 Không có hoạt động.', en: '📭 No recent activities.' }[lang] || '📭 No recent activities.';
            }
            const typeMap = { '1': '🧠 Smart Money', '2': '⭐ KOL', '3': '🐋 Whale', '4': '🎯 Sniper' };
            const headerType = typeMap[args.trackerType || '1'] || '🧠 Smart Money';
            let card = `${headerType} — ${lang === 'vi' ? 'Hoạt Động Gần Đây' : 'Recent Activity'}\n━━━━━━━━━━━━━━━━━━\n\n`;
            const chainNames = { '1': 'ETH', '56': 'BSC', '196': 'XLayer', '501': 'SOL', '137': 'Polygon', '42161': 'Arb', '8453': 'Base' };
            const fmtNum = (n) => n > 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n > 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + n.toFixed(0);
            for (let i = 0; i < Math.min(list.length, 15); i++) {
                const a = list[i];
                const action = String(a.action || a.type || 'BUY').toLowerCase();
                const actionIcon = action.includes('buy') ? '🟢' : '🔴';
                const addr = a.address || a.traderAddress || '?';
                const chain = chainNames[a.chainIndex] || '';
                card += `${actionIcon} <b>${a.tokenSymbol || '?'}</b>${chain ? ' (' + chain + ')' : ''} — ${fmtNum(Number(a.amountUsd || a.amount || 0))}\n`;
                card += `   👤 <code>${addr.slice(0, 6)}...${addr.slice(-4)}</code>\n\n`;
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_trader_leaderboard(args, context) {
        try {
            const lang = context?.lang || 'en';
            const chainIndex = args.chainIndex || '1';
            const data = await onchainos.getLeaderboardList({
                chainIndex, timeFrame: args.timeFrame || '2', traderType: args.traderType, sort: args.sort, limit: args.limit || '20'
            });
            const list = Array.isArray(data) ? data : (data?.data || []);
            if (!list || list.length === 0) {
                return { vi: '📭 Không có dữ liệu.', en: '📭 No leaderboard data.' }[lang] || '📭 No leaderboard data.';
            }
            const headerL = { vi: '🏆 Bảng Xếp Hạng Trader', en: '🏆 Trader Leaderboard', zh: '🏆 交易者排行榜', ko: '🏆 트레이더 리더보드' };
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
            const timeLabels = { '1': '24H', '2': '7D', '3': '30D', '4': '90D' };
            let card = `${headerL[lang] || headerL.en}\n⛓ ${chainNames[chainIndex] || 'Chain #' + chainIndex} | ⏱ ${timeLabels[args.timeFrame || '2'] || '7D'}\n━━━━━━━━━━━━━━━━━━\n\n`;
            const fmtNum = (n) => n > 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n > 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + n.toFixed(0);
            for (let i = 0; i < Math.min(list.length, 20); i++) {
                const t = list[i];
                const addr = t.traderAddress || t.address || '?';
                const pnl = Number(t.pnl || t.totalPnl || 0);
                const winRate = Number(t.winRate || 0);
                const txCount = Number(t.txCount || t.tradeCount || 0);
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;
                const pnlIcon = pnl > 0 ? '🟢' : '🔴';
                card += `${medal} <code>${addr.slice(0, 6)}...${addr.slice(-4)}</code>\n`;
                card += `   ${pnlIcon} PnL: ${pnl >= 0 ? '+' : ''}${fmtNum(pnl)}`;
                if (winRate > 0) card += ` | Win: ${(winRate * 100).toFixed(0)}%`;
                if (txCount > 0) card += ` | Txs: ${txCount}`;
                card += '\n\n';
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },

    async get_holder_cluster(args, context) {
        try {
            const lang = context?.lang || 'en';
            let chainIndex = args.chainIndex;
            let tokenAddress = args.tokenContractAddress;
            if (tokenAddress && !tokenAddress.startsWith('0x') && tokenAddress.length < 20) {
                const resolved = await autoResolveToken(tokenAddress, chainIndex);
                if (resolved.error) return resolved.error;
                chainIndex = resolved.chainIndex;
                tokenAddress = resolved.tokenAddress;
            }
            const mode = args.mode || 'overview';
            const headerL = { vi: '👥 Phân Tích Holder', en: '👥 Holder Analysis', zh: '👥 持有者分析', ko: '👥 보유자 분석' };
            let card = `${headerL[lang] || headerL.en}\n━━━━━━━━━━━━━━━━━━\n\n`;

            if (mode === 'overview') {
                const data = await onchainos.getClusterOverview(chainIndex, tokenAddress);
                const d = Array.isArray(data) ? data[0] : (data?.data || data || {});
                card += `📊 <b>Cluster Overview</b>\n`;
                if (d.clusterCount) card += `🔗 Clusters: ${d.clusterCount}\n`;
                if (d.totalHolders) card += `👥 Total Holders: ${d.totalHolders}\n`;
                if (d.top10HoldPercent) card += `🏆 Top 10 Hold: ${d.top10HoldPercent}%\n`;
            } else if (mode === 'top_holders') {
                const data = await onchainos.getClusterTopHolders(chainIndex, tokenAddress);
                const list = Array.isArray(data) ? data : (data?.data || []);
                card += `📊 <b>Top Holders</b>\n\n`;
                for (let i = 0; i < Math.min(list.length, 15); i++) {
                    const h = list[i];
                    const addr = h.holderAddress || h.address || '?';
                    const pct = Number(h.holdingPercent || h.percentage || 0);
                    const tag = h.tag || h.label || '';
                    card += `${i + 1}. <code>${addr.slice(0, 6)}...${addr.slice(-4)}</code> — ${(pct * 100).toFixed(2)}%${tag ? ' [' + tag + ']' : ''}\n`;
                }
            } else {
                const data = await onchainos.getClusterList(chainIndex, tokenAddress);
                const list = Array.isArray(data) ? data : (data?.data || []);
                card += `📊 <b>Holder Clusters</b>\n\n`;
                for (let i = 0; i < Math.min(list.length, 10); i++) {
                    const c = list[i];
                    card += `${i + 1}. Cluster: ${c.clusterName || 'Group ' + (i + 1)} — ${c.memberCount || '?'} wallets\n`;
                    if (c.holdingPercent) card += `   📊 Holding: ${(Number(c.holdingPercent) * 100).toFixed(2)}%\n`;
                }
            }
            return { displayMessage: card };
        } catch (error) {
            return `❌ Error: ${error.msg || error.message}`;
        }
    },
};

