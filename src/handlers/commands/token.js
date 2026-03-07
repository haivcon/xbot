async function handleTokenCommand(deps, msg, explicitAddress = null) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        startTokenFlow
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'token')) {
        return;
    }
    const lang = await getLang(msg);
    const text = msg.text || '';
    const match = text.match(/^\/token(?:@[\w_]+)?(?:\s+([^\s]+))?/i);

    const contractAddress = explicitAddress || (match ? match[1] : null);

    await startTokenFlow({
        chatId: msg.chat.id,
        userId: msg.from?.id,
        lang,
        sourceMessage: msg,
        pendingAddress: contractAddress || null
    });
}

module.exports = { handleTokenCommand };
