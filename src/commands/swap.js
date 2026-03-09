/**
 * /swap — Get swap quote via OnchainOS DEX Aggregator
 */
const { enforceBanForMessage, enforceOwnerCommandLimit } = require('../features/auth/utils');
const logger = require('../core/logger');
const log = logger.child('Swap');
const { getLang, t } = require('../../i18n');
const { sendReply } = require('../utils/chat');
const { buildCloseKeyboard } = require('../utils/builders');
const onchainos = require('../services/onchainos');
const bot = require('../core/bot');

module.exports = {
    command: /^\/swap(?:@[\w_]+)?(?:\s+(.+))?$/,
    handler: async (msg, match) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        if (await enforceOwnerCommandLimit(msg, 'swap')) {
            return;
        }

        const lang = await getLang(msg);
        const payload = (match[1] || '').trim();

        if (!payload) {
            await sendReply(msg, t(lang, 'swap_usage'), {
                parse_mode: 'Markdown',
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        // Parse: /swap <amount> <fromToken> <toToken> [chain]
        const parts = payload.split(/\s+/);
        if (parts.length < 3) {
            await sendReply(msg, t(lang, 'swap_usage'), {
                parse_mode: 'Markdown',
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        const amount = parts[0];
        const fromTokenKeyword = parts[1];
        const toTokenKeyword = parts[2];
        const chainIndex = parts[3] || '196'; // Default X Layer

        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            await sendReply(msg, t(lang, 'swap_invalid_amount'), {
                parse_mode: 'Markdown',
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        const statusMsg = await sendReply(msg, t(lang, 'swap_searching'), { parse_mode: 'Markdown' });

        try {
            // 1. Search for both tokens
            const [fromResults, toResults] = await Promise.all([
                resolveToken(fromTokenKeyword, chainIndex),
                resolveToken(toTokenKeyword, chainIndex)
            ]);

            if (!fromResults) {
                await editOrReply(msg, statusMsg, t(lang, 'swap_token_not_found', { token: fromTokenKeyword }), lang);
                return;
            }
            if (!toResults) {
                await editOrReply(msg, statusMsg, t(lang, 'swap_token_not_found', { token: toTokenKeyword }), lang);
                return;
            }

            // 2. Calculate amount in minimal units
            const decimals = Number(fromResults.decimals || 18);
            const amountInMinUnits = BigInt(Math.floor(Number(amount) * Math.pow(10, decimals))).toString();

            // 3. Get swap quote
            const quoteData = await onchainos.getSwapQuote({
                chainIndex,
                fromTokenAddress: fromResults.address,
                toTokenAddress: toResults.address,
                amount: amountInMinUnits
            });

            if (!quoteData || !Array.isArray(quoteData) || quoteData.length === 0) {
                await editOrReply(msg, statusMsg, t(lang, 'swap_no_route'), lang);
                return;
            }

            const quote = quoteData[0];
            const routerResult = quote.routerResult || {};
            const toDecimals = Number(toResults.decimals || 18);
            const receiveAmount = Number(routerResult.toTokenAmount || 0) / Math.pow(10, toDecimals);
            const priceImpact = Number(routerResult.priceImpactPercentage || 0);
            const estimatedGas = routerResult.estimateGasFee || 'N/A';

            // Build response
            const lines = [];
            lines.push(`🔄 *${t(lang, 'swap_quote_title')}*`);
            lines.push('');
            lines.push(`📤 ${t(lang, 'swap_from')}: *${amount} ${fromResults.symbol}*`);
            lines.push(`📥 ${t(lang, 'swap_to')}: *${receiveAmount < 0.01 ? receiveAmount.toFixed(8) : receiveAmount.toFixed(4)} ${toResults.symbol}*`);
            lines.push('');

            if (priceImpact > 0) {
                const impactEmoji = priceImpact > 5 ? '🔴' : priceImpact > 1 ? '🟡' : '🟢';
                lines.push(`${impactEmoji} ${t(lang, 'swap_price_impact')}: ${priceImpact.toFixed(2)}%`);
            }

            if (estimatedGas !== 'N/A') {
                lines.push(`⛽ ${t(lang, 'swap_gas')}: ${estimatedGas}`);
            }

            // DEX comparison
            const compareList = routerResult.quoteCompareList || [];
            if (compareList.length > 1) {
                lines.push(`\n📊 ${t(lang, 'swap_dex_comparison')}:`);
                for (const dex of compareList.slice(0, 5)) {
                    const dexReceive = Number(dex.receiveAmount || 0) / Math.pow(10, toDecimals);
                    lines.push(`  • ${dex.dexName || '?'}: ${dexReceive < 0.01 ? dexReceive.toFixed(8) : dexReceive.toFixed(4)} ${toResults.symbol}`);
                }
            }

            // Honeypot / risk warning
            if (quote.isHoneyPot || Number(quote.taxRate || 0) > 0) {
                lines.push('');
                lines.push(`⚠️ *${t(lang, 'swap_risk_warning')}*`);
                if (quote.isHoneyPot) {
                    lines.push(`🍯 ${t(lang, 'swap_honeypot_detected')}`);
                }
                if (Number(quote.taxRate || 0) > 0) {
                    lines.push(`💸 ${t(lang, 'swap_tax_rate')}: ${(Number(quote.taxRate) * 100).toFixed(1)}%`);
                }
            }

            lines.push(`\n_${t(lang, 'swap_note')}_`);

            const keyboard = {
                inline_keyboard: [
                    [{ text: '❌', callback_data: 'close' }]
                ]
            };

            await editOrReply(msg, statusMsg, lines.join('\n'), lang, keyboard);

        } catch (error) {
            log.error(`Error: ${error.message || error.msg}`);
            await editOrReply(msg, statusMsg, t(lang, 'swap_error'), lang);
        }
    }
};

/**
 * Resolve a token keyword to address + decimals + symbol
 */
async function resolveToken(keyword, chainIndex) {
    // Check if it's already an address
    if (/^0x[a-fA-F0-9]{40}$/.test(keyword)) {
        return { address: keyword.toLowerCase(), symbol: keyword.slice(0, 6), decimals: 18 };
    }

    // Native token shortcuts
    const nativeMap = {
        'eth': { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', decimals: 18 },
        'okb': { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'OKB', decimals: 18 },
        'bnb': { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB', decimals: 18 },
        'matic': { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'MATIC', decimals: 18 }
    };
    const lower = keyword.toLowerCase();
    if (nativeMap[lower]) {
        return nativeMap[lower];
    }

    // Search via OnchainOS
    try {
        const results = await onchainos.getTokenSearch(chainIndex, keyword);
        if (results && Array.isArray(results) && results.length > 0) {
            const best = results[0];
            return {
                address: (best.tokenContractAddress || '').toLowerCase(),
                symbol: best.tokenSymbol || keyword.toUpperCase(),
                decimals: Number(best.decimals || 18)
            };
        }
    } catch (error) {
        log.warn(`Token search failed for "${keyword}": ${error.message}`);
    }

    return null;
}

async function editOrReply(msg, statusMsg, text, lang, keyboard) {
    const replyMarkup = keyboard || buildCloseKeyboard(lang);
    try {
        await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: replyMarkup,
            disable_web_page_preview: true
        });
    } catch (editError) {
        await sendReply(msg, text, {
            parse_mode: 'Markdown',
            reply_markup: replyMarkup,
            disable_web_page_preview: true
        });
    }
}
