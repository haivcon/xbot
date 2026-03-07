async function handleOkxChainsCommand(deps, msg) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        fetchOkxSupportedChains,
        sendReply,
        buildCloseKeyboard,
        t
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'okxchains')) {
        return;
    }
    const lang = await getLang(msg);
    try {
        const directory = await fetchOkxSupportedChains();
        if (!directory) {
            sendReply(msg, t(lang, 'okxchains_error'), { parse_mode: 'Markdown' });
            return;
        }

        const aggregatorLines = (directory.aggregator || []).slice(0, 20);
        const marketLines = (directory.market || []).slice(0, 20);
        const balanceLines = (directory.balance || []).slice(0, 20);

        const lines = [
            t(lang, 'okxchains_title'),
            t(lang, 'okxchains_aggregator_heading'),
            aggregatorLines.length > 0 ? aggregatorLines.map((line) => `• ${line}`).join('\n') : t(lang, 'okxchains_no_data'),
            '',
            t(lang, 'okxchains_market_heading'),
            marketLines.length > 0 ? marketLines.map((line) => `• ${line}`).join('\n') : t(lang, 'okxchains_no_data'),
            '',
            t(lang, 'okxchains_balance_heading'),
            balanceLines.length > 0 ? balanceLines.map((line) => `• ${line}`).join('\n') : t(lang, 'okxchains_no_data')
        ];

        sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
    } catch (error) {
        console.error(`[OkxChains] Failed to load supported chains: ${error.message}`);
        sendReply(msg, t(lang, 'okxchains_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
    }
}

module.exports = { handleOkxChainsCommand };
