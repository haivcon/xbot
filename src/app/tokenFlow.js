const { appendCloseButton } = require('../features/ui');
const logger = require('../core/logger');
const log = logger.child('TokenFlow');
const { buildPaginatedChainKeyboard, sortChainsWithPriority } = require('../features/chainMenu');
const { getChainIcon } = require('../features/chainIcons');

function createTokenFlow({
    normalizeAddressSafe,
    sendMessageRespectingThread,
    t,
    buildCloseKeyboard,
    formatDexChainLabel,
    fetchWalletTokenActionPayload,
    unwrapOkxFirst,
    pickOkxNumeric,
    normalizeWalletTokenActionResult,
    registerWalletTokenContext,
    buildWalletTokenMenu,
    sendWalletTokenExtraTexts,
    sendReply,
    bot,
    collectTxhashChainEntries,
    tokenWizardStates,
    preferChainIndex = null
}) {
    function buildTokenChainKeyboard(lang, chainEntries = [], page = 0) {
        const keyboard = buildPaginatedChainKeyboard(chainEntries, {
            t,
            lang,
            prefix: 'token',
            page,
            backCallbackData: 'token_back',
            preferChainIndex,
            formatLabel: (entry) => {
                const icon = getChainIcon(entry);
                const name = entry?.chainShortName || entry?.chainName || `#${entry?.chainIndex ?? ''}`;
                return `${icon} ${name}`.trim();
            }
        });
        return {
            reply_markup: { inline_keyboard: keyboard.inline_keyboard },
            page: keyboard.page,
            pageCount: keyboard.pageCount,
            entries: keyboard.entries
        };
    }

    async function deliverTokenDetail({ chatId, lang, chainEntry = null, chainIndex = null, contractAddress, replyContextMessage = null }) {
        const normalizedAddress = normalizeAddressSafe(contractAddress) || contractAddress;
        if (!normalizedAddress) {
            await sendMessageRespectingThread(chatId, replyContextMessage || null, t(lang, 'token_help_invalid'), {
                reply_markup: buildCloseKeyboard(lang, { backCallbackData: 'token_back' })
            });
            return;
        }

        const resolvedChainIndex = Number.isFinite(chainEntry?.chainIndex)
            ? Number(chainEntry.chainIndex)
            : Number.isFinite(chainIndex)
                ? Number(chainIndex)
                : null;

        const chainContext = chainEntry
            ? {
                chainIndex: resolvedChainIndex,
                chainId: Number.isFinite(chainEntry.chainId) ? Number(chainEntry.chainId) : resolvedChainIndex,
                chainShortName: chainEntry.chainShortName || null,
                chainName: chainEntry.chainName || null,
                aliases: Array.isArray(chainEntry.aliases) ? chainEntry.aliases : null
            }
            : {
                chainIndex: resolvedChainIndex,
                chainId: resolvedChainIndex,
                chainShortName: null,
                chainName: null
            };

        const baseContext = {
            chainContext,
            chainLabel: formatDexChainLabel(chainContext, lang),
            token: {
                tokenAddress: normalizedAddress,
                tokenContractAddress: normalizedAddress,
                contractAddress: normalizedAddress,
                chainIndex: resolvedChainIndex,
                chainId: chainContext.chainId
            }
        };

        let tokenMeta = {};
        let actionResult = null;

        try {
            const payload = await fetchWalletTokenActionPayload('token_info', baseContext);
            const primaryEntry = unwrapOkxFirst(payload);
            if (primaryEntry) {
                tokenMeta = {
                    name: primaryEntry.name || primaryEntry.tokenName || null,
                    symbol: primaryEntry.symbol || primaryEntry.tokenSymbol || null,
                    decimals: pickOkxNumeric(primaryEntry, ['decimals', 'decimal', 'tokenDecimal']) || null
                };
            }
            const enhancedContext = { ...baseContext, token: { ...baseContext.token, ...tokenMeta } };
            actionResult = normalizeWalletTokenActionResult('token_info', payload, lang, enhancedContext);
            Object.assign(baseContext.token, tokenMeta);
        } catch (error) {
            log.child('Token').error(`Failed to fetch token info for ${normalizedAddress}: ${error.message}`);
        }

        const tokenCallbackId = registerWalletTokenContext(baseContext);
        const contextWithCallback = { ...baseContext, tokenCallbackId };
        const menu = buildWalletTokenMenu(contextWithCallback, lang, { actionResult });

        const message = await sendMessageRespectingThread(chatId, replyContextMessage || null, menu.text, {
            parse_mode: 'HTML',
            reply_markup: menu.replyMarkup
        });

        if (menu.extraTexts && menu.extraTexts.length > 0) {
            await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts, { source: replyContextMessage || message });
        }
    }

    function buildTokenAddressPromptText(lang, chainLabel, pendingAddress = null) {
        const lines = [t(lang, 'token_address_prompt', { chain: chainLabel })];
        if (pendingAddress) {
            lines.push('', t(lang, 'token_address_prefill', { address: pendingAddress }));
        }
        return lines.join('\n');
    }

    async function startTokenFlow({ chatId, userId, lang, sourceMessage = null, pendingAddress = null } = {}) {
        const targetChatId = sourceMessage?.chat?.id ?? chatId;
        const userKey = userId ? userId.toString() : targetChatId?.toString();
        if (!targetChatId || !userKey) {
            return;
        }

        let chainEntries;
        try {
            chainEntries = await collectTxhashChainEntries();
        } catch (error) {
            log.child('Token').error(`Failed to load chain directory: ${error.message}`);
        }

        if (!Array.isArray(chainEntries) || chainEntries.length === 0) {
            const fallbackIndex = Number.isFinite(preferChainIndex) ? Number(preferChainIndex) : 196;
            chainEntries = [{
                chainIndex: fallbackIndex,
                chainId: fallbackIndex,
                chainShortName: 'xlayer',
                chainName: 'X Layer',
                aliases: ['xlayer']
            }];
        }

        const sortedChains = sortChainsWithPriority(chainEntries, { preferChainIndex, preferAliases: ['xlayer'] });
        const keyboard = buildTokenChainKeyboard(lang, sortedChains, 0);
        const promptText = t(lang, 'token_chain_prompt');
        const message = sourceMessage
            ? await sendReply(sourceMessage, promptText, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard.reply_markup })
            : await bot.sendMessage(targetChatId, promptText, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard.reply_markup });

        tokenWizardStates.set(userKey, {
            stage: 'chain',
            chatId: targetChatId.toString(),
            lang,
            pendingAddress: pendingAddress || null,
            replyContextMessage: sourceMessage,
            promptMessageId: message?.message_id || null,
            chainOptions: keyboard.entries,
            chainPage: keyboard.page,
            chainPageCount: keyboard.pageCount
        });
    }

    return {
        deliverTokenDetail,
        buildTokenAddressPromptText,
        startTokenFlow
    };
}

module.exports = { createTokenFlow };
