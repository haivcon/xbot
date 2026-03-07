const { getChainIcon } = require('../../features/chainIcons');

async function handleTxhashCallback({
    bot,
    query,
    chatId,
    callbackLang,
    txhashWizardStates,
    collectTxhashChainEntries,
    buildTxhashHashPromptText,
    buildCloseKeyboard,
    buildHelpText,
    sendMessageRespectingThread,
    t,
    buildPaginatedChainKeyboard,
    preferChainIndex = null
}) {
    const data = query.data;
    if (!data || (!data.startsWith('txhash_') && data !== 'txhash_back')) {
        return false;
    }

    const formatLabel = (entry) => {
        const icon = getChainIcon(entry);
        const name = entry?.chainShortName || entry?.chainName || `#${entry?.chainIndex ?? ''}`;
        const id = Number.isFinite(entry?.chainIndex) ? entry.chainIndex : entry?.chainId;
        const idPart = Number.isFinite(id) ? ` (#${id})` : '';
        return `${icon} ${name}${idPart}`.trim();
    };

    const queryId = query.id;

    if (data === 'txhash_noop') {
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data === 'txhash_back') {
        await bot.answerCallbackQuery(queryId);
        if (chatId) {
            const helpText = buildHelpText(callbackLang);
            await bot.sendMessage(chatId, helpText, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: buildCloseKeyboard(callbackLang)
            });
        }
        return true;
    }

    if (data.startsWith('txhash_page:')) {
        const page = Number(data.split(':')[1] || '0');
        const userKey = query.from.id.toString();
        const currentState = txhashWizardStates.get(userKey) || {};
        const chainEntries = currentState.chainOptions || await collectTxhashChainEntries();
        const keyboard = buildPaginatedChainKeyboard(chainEntries, {
            t,
            lang: callbackLang,
            prefix: 'txhash',
            page,
            backCallbackData: 'txhash_back',
            preferChainIndex,
            formatLabel
        });

        try {
            await bot.editMessageReplyMarkup(
                { inline_keyboard: keyboard.inline_keyboard },
                { chat_id: query.message?.chat?.id, message_id: query.message?.message_id }
            );
        } catch (error) {
            // ignore edit failures
        }

        txhashWizardStates.set(userKey, {
            ...currentState,
            chainOptions: keyboard.entries,
            chainPage: keyboard.page,
            chainPageCount: keyboard.pageCount
        });

        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data.startsWith('txhash_chain:')) {
        const userKey = query.from.id.toString();
        const rawIndex = data.split(':')[1];
        const selectedIndex = Number(rawIndex);

        const currentState = txhashWizardStates.get(userKey) || {};
        const chainEntries = currentState.chainOptions || await collectTxhashChainEntries();
        const chainEntry = chainEntries.find((entry) => Number(entry?.chainIndex) === Number(selectedIndex));

        if (!chainEntry) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'txhash_chain_missing'), show_alert: true });
            return true;
        }

        const chainLabel = chainEntry.chainShortName || chainEntry.chainName || `#${chainEntry.chainIndex}`;
        const promptText = buildTxhashHashPromptText(callbackLang, chainLabel, currentState.pendingHash);
        const placeholder = t(callbackLang, 'txhash_help_placeholder');

        const targetChatId = currentState.chatId || chatId || query.from.id.toString();
        const prompt = await sendMessageRespectingThread(targetChatId, currentState.replyContextMessage || query.message, promptText, {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: placeholder
            },
            allow_sending_without_reply: true
        });

        txhashWizardStates.set(userKey, {
            stage: 'hash',
            chatId: targetChatId.toString(),
            lang: callbackLang,
            pendingHash: currentState.pendingHash || null,
            replyContextMessage: currentState.replyContextMessage || query.message,
            promptMessageId: prompt?.message_id || null,
            chainIndex: chainEntry.chainIndex,
            chainLabel,
            chainOptions: chainEntries
        });

        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'txhash_chain_selected', { chain: chainLabel }) });
        return true;
    }

    return false;
}

module.exports = { handleTxhashCallback };
