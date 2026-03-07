const { getChainIcon } = require('../../features/chainIcons');

async function handleTokenCallback({
    bot,
    query,
    chatId,
    callbackLang,
    tokenWizardStates,
    collectTxhashChainEntries,
    buildTokenAddressPromptText,
    buildCloseKeyboard,
    buildHelpText,
    sendMessageRespectingThread,
    t,
    buildPaginatedChainKeyboard,
    preferChainIndex = null
}) {
    const data = query.data;
    if (!data || (!data.startsWith('token_') && data !== 'token_back')) {
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

    if (data === 'token_noop') {
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data === 'token_back') {
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

    if (data.startsWith('token_page:')) {
        const page = Number(data.split(':')[1] || '0');
        const userKey = query.from.id.toString();
        const currentState = tokenWizardStates.get(userKey) || {};
        const chainEntries = currentState.chainOptions || await collectTxhashChainEntries();
        const keyboard = buildPaginatedChainKeyboard(chainEntries, {
            t,
            lang: callbackLang,
            prefix: 'token',
            page,
            backCallbackData: 'token_back',
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

        tokenWizardStates.set(userKey, {
            ...currentState,
            chainOptions: keyboard.entries,
            chainPage: keyboard.page,
            chainPageCount: keyboard.pageCount
        });

        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data.startsWith('token_chain:')) {
        const userKey = query.from.id.toString();
        const rawIndex = data.split(':')[1];
        const selectedIndex = Number(rawIndex);

        const currentState = tokenWizardStates.get(userKey) || {};
        const chainEntries = currentState.chainOptions || await collectTxhashChainEntries();
        const chainEntry = chainEntries.find((entry) => Number(entry?.chainIndex) === Number(selectedIndex));

        if (!chainEntry) {
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'token_chain_missing'), show_alert: true });
            return true;
        }

        const chainLabel = chainEntry.chainShortName || chainEntry.chainName || `#${chainEntry.chainIndex}`;
        const promptText = buildTokenAddressPromptText(callbackLang, chainLabel, currentState.pendingAddress);
        const placeholder = t(callbackLang, 'token_help_placeholder');

        const targetChatId = currentState.chatId || chatId || query.from.id.toString();
        const prompt = await sendMessageRespectingThread(targetChatId, currentState.replyContextMessage || query.message, promptText, {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: placeholder
            },
            allow_sending_without_reply: true
        });

        tokenWizardStates.set(userKey, {
            stage: 'address',
            chatId: targetChatId.toString(),
            lang: callbackLang,
            pendingAddress: currentState.pendingAddress || null,
            replyContextMessage: currentState.replyContextMessage || query.message,
            promptMessageId: prompt?.message_id || null,
            chainIndex: chainEntry.chainIndex,
            chainLabel,
            chainOptions: chainEntries,
            chainEntry
        });

        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'token_chain_selected', { chain: chainLabel }) });
        return true;
    }

    return false;
}

module.exports = { handleTokenCallback };
