async function handleContractCommand(deps, msg, payload) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        normalizeAddress,
        contractWizardStates,
        sendReply,
        buildCloseKeyboard,
        buildContractLookupUrl,
        formatCopyableValueHtml,
        escapeHtml,
        t,
        bot
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'contract')) {
        return;
    }
    const lang = await getLang(msg);
    const rawPayload = (payload || '').trim();
    const chatId = msg.chat?.id?.toString();
    const userId = msg.from?.id?.toString();
    const userKey = userId || chatId;

    if (!rawPayload) {
        if (userKey) {
            const existing = contractWizardStates.get(userKey);
            if (existing?.promptMessageId && existing.chatId === chatId) {
                try {
                    await bot.deleteMessage(chatId, existing.promptMessageId);
                } catch (_) {
                    // ignore cleanup errors
                }
            }

            const promptText = t(lang, 'contract_help_prompt');
            const placeholder = t(lang, 'contract_help_placeholder');
            const sent = await sendReply(msg, promptText, {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: placeholder
                }
            });

            if (sent?.message_id) {
                contractWizardStates.set(userKey, { promptMessageId: sent.message_id, chatId, lang });
            }
            return;
        }

        await sendReply(msg, t(lang, 'contract_usage'), { reply_markup: buildCloseKeyboard(lang) });
        return;
    }

    const parts = rawPayload.split(/\s+/);
    const contractAddress = normalizeAddress(parts[0]);

    if (userKey) {
        contractWizardStates.delete(userKey);
    }

    if (!contractAddress) {
        await sendReply(msg, t(lang, 'contract_invalid'), { reply_markup: buildCloseKeyboard(lang) });
        return;
    }

    const oklinkUrl = buildContractLookupUrl(contractAddress);
    const addressLabel = formatCopyableValueHtml(contractAddress) || escapeHtml(contractAddress);
    const linkLabel = `<a href="${oklinkUrl}">${escapeHtml(oklinkUrl)}</a>`;
    const responseLines = [
        t(lang, 'contract_result'),
        t(lang, 'contract_result_address', { address: addressLabel }),
        t(lang, 'contract_result_link', { link: linkLabel })
    ];

    await sendReply(msg, responseLines.join('\n'), {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: buildCloseKeyboard(lang)
    });
}

module.exports = { handleContractCommand };
