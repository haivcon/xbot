async function handleTxhashCommand(deps, msg, explicitHash = null) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        startTxhashFlow
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'txhash')) {
        return;
    }
    const lang = await getLang(msg);
    const text = msg.text || '';
    const match = text.match(/^\/txhash(?:@[\w_]+)?(?:\s+([^\s]+))?/i);

    const txHash = explicitHash || (match ? match[1] : null);

    await startTxhashFlow({
        chatId: msg.chat.id,
        userId: msg.from?.id,
        lang,
        sourceMessage: msg,
        pendingHash: txHash || null
    });
}

module.exports = { handleTxhashCommand };
