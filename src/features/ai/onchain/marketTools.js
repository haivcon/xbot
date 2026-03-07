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
            const resolvedTokens = [];
            for (const token of args.tokens) {
                // If address looks like a symbol (not 0x...) and not native placeholder
                if (!token.tokenContractAddress.toLowerCase().startsWith('0x') && token.tokenContractAddress.length < 10) {
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
            const data = await onchainos.getTokenSearch(chains, args.keyword);
            const lang = context?.lang || 'en';
            return formatSearchResult(data, lang);
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
            const [data, priceData] = await Promise.all([
                onchainos.getMarketCandles(chainIndex, tokenAddress, { bar, limit }),
                onchainos.getMarketPrice([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => null)
            ]);
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

    async get_trade_history(args) {
        try {
            const data = await onchainos.getMarketTrades(
                args.chainIndex,
                args.tokenContractAddress.toLowerCase(),
                { limit: args.limit || '20' }
            );
            if (!data || !Array.isArray(data) || data.length === 0) {
                return '📭 Không tìm thấy lịch sử giao dịch cho token này.';
            }
            const lines = data.slice(0, 10).map((t, i) => {
                const type = t.type === 'buy' ? '🟢 MUA' : '🔴 BÁN';
                const price = Number(t.price || 0);
                const vol = Number(t.volume || 0);
                const time = t.time ? new Date(Number(t.time)).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A';
                const tokens = (t.changedTokenInfo || []).map(tk => `${Number(tk.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tk.tokenSymbol}`).join(', ');
                return `${i + 1}. ${type} | $${price < 0.01 ? price.toFixed(8) : price.toFixed(4)} | Vol: $${vol.toFixed(2)}\n> ${tokens}\n> ${time} | ${t.dexName || 'DEX'}`;
            });
            return `📊 Lịch sử giao dịch gần đây:\n\n${lines.join('\n\n')}`;
        } catch (error) {
            return `❌ Lỗi lấy lịch sử giao dịch: ${error.msg || error.message}`;
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

};
