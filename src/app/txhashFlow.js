const { appendCloseButton } = require('../features/ui');
const logger = require('../core/logger');
const log = logger.child('TxhashFlow');
const { buildPaginatedChainKeyboard, sortChainsWithPriority } = require('../features/chainMenu');
const { getChainIcon } = require('../features/chainIcons');

function createTxhashFlow({
    fetchOkxTxhashDetail,
    collectTxhashChainEntries,
    sendMessageRespectingThread,
    sendReply,
    buildCloseKeyboard,
    splitTelegramMessageText,
    formatTxhashDetail,
    txhashWizardStates,
    t,
    bot,
    preferChainIndex = null
}) {
    function buildTxhashChainKeyboard(lang, chainEntries = [], page = 0) {
        const keyboard = buildPaginatedChainKeyboard(chainEntries, {
            t,
            lang,
            prefix: 'txhash',
            page,
            backCallbackData: 'txhash_back',
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

    async function deliverTxhashDetail({ chatId, lang, txHash, chainIndex, replyContextMessage = null }) {
        if (!chatId) {
            return;
        }

        try {
            const detail = await fetchOkxTxhashDetail(txHash, { chainIndex });
            if (!detail) {
                await sendMessageRespectingThread(chatId, replyContextMessage, t(lang, 'txhash_error'), {
                    reply_markup: buildCloseKeyboard(lang, { backCallbackData: 'txhash_back' })
                });
                return;
            }

            const formatted = formatTxhashDetail(detail, lang, {});
            const chunks = splitTelegramMessageText(formatted);
            const replyMarkup = buildCloseKeyboard(lang, { backCallbackData: 'txhash_back' });

            for (const chunk of chunks) {
                await sendMessageRespectingThread(chatId, replyContextMessage, chunk, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                });
            }
        } catch (error) {
            log.child('Txhash').error(`Failed to fetch txhash ${txHash}: ${error.message}`);
            await sendMessageRespectingThread(chatId, replyContextMessage, t(lang, 'txhash_error'), {
                reply_markup: buildCloseKeyboard(lang, { backCallbackData: 'txhash_back' })
            });
        }
    }

    function buildTxhashHashPromptText(lang, chainLabel, pendingHash = null) {
        const lines = [t(lang, 'txhash_hash_prompt', { chain: chainLabel })];
        if (pendingHash) {
            lines.push('', t(lang, 'txhash_hash_prefill', { hash: pendingHash }));
        }
        return lines.join('\n');
    }

    async function startTxhashFlow({ chatId, userId, lang, sourceMessage = null, pendingHash = null } = {}) {
        const targetChatId = sourceMessage?.chat?.id ?? chatId;
        const userKey = userId ? userId.toString() : targetChatId?.toString();
        if (!targetChatId || !userKey) {
            return;
        }

        let chainEntries;
        try {
            chainEntries = await collectTxhashChainEntries();
        } catch (error) {
            log.child('Txhash').error(`Failed to load chain directory: ${error.message}`);
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
        const keyboard = buildTxhashChainKeyboard(lang, sortedChains, 0);
        const promptText = t(lang, 'txhash_chain_prompt');
        const message = sourceMessage
            ? await sendReply(sourceMessage, promptText, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard.reply_markup })
            : await bot.sendMessage(targetChatId, promptText, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard.reply_markup });

        txhashWizardStates.set(userKey, {
            stage: 'chain',
            chatId: targetChatId.toString(),
            lang,
            pendingHash: pendingHash || null,
            replyContextMessage: sourceMessage,
            promptMessageId: message?.message_id || null,
            chainOptions: keyboard.entries,
            chainPage: keyboard.page,
            chainPageCount: keyboard.pageCount
        });
    }

    return {
        deliverTxhashDetail,
        buildTxhashHashPromptText,
        startTxhashFlow
    };
}

module.exports = { createTxhashFlow };
