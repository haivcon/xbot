const logger = require('../../core/logger');
const log = logger.child('Okx402');

async function handleOkx402StatusCommand(deps, msg) {
    const {
        enforceOwnerCommandLimit,
        getLang,
        fetchOkx402Supported,
        sendReply,
        buildCloseKeyboard,
        t
    } = deps;

    if (await enforceOwnerCommandLimit(msg, 'okx402status')) {
        return;
    }
    const lang = await getLang(msg);
    try {
        const supported = await fetchOkx402Supported();
        const lines = [
            t(lang, 'okx402_title'),
            supported && supported.length > 0
                ? t(lang, 'okx402_supported', { chains: supported.join(', ') })
                : t(lang, 'okx402_not_supported')
        ];
        sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
    } catch (error) {
        log.error(`Failed to check x402 support: ${error.message}`);
        sendReply(msg, t(lang, 'okx402_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
    }
}

module.exports = { handleOkx402StatusCommand };
