const logger = require('../core/logger');
const log = logger.child('StartHandlers');

function createStartHandlers({
    bot,
    t,
    getLang,
    buildThreadedOptions,
    sendReply,
    enforceOwnerCommandLimit,
    pickStartVideo,
    disableStartVideo,
    sendAiIntroMedia
}) {
    function buildStartHelpKeyboard(lang) {
        const keyboard = [
            [{ text: `🆘🆘🆘   👉👉👉    ${t(lang, 'help_command_help')} (/help)  👈👈👈   🆘🆘🆘`, callback_data: 'start_help' }]
        ];

        // Add dashboard web button if PUBLIC_BASE_URL is set and is HTTPS
        const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
        if (baseUrl && baseUrl.startsWith('https://')) {
            keyboard.push([{ text: t(lang, 'dashboard_btn_home'), url: baseUrl + '/' }]);
        }

        return { inline_keyboard: keyboard };
    }

    async function handleStartNoToken(msg) {
        if (await enforceOwnerCommandLimit(msg, 'start')) {
            return;
        }
        const lang = await getLang(msg);
        let message = t(lang, 'welcome_generic');

        // Append dashboard hint if web dashboard is available
        const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
        if (baseUrl && baseUrl.startsWith('https://')) {
            message += `\n\n${t(lang, 'dashboard_start_hint')}`;
        }

        const reply_markup = buildStartHelpKeyboard(lang);
        const videoOptions = buildThreadedOptions(msg, { caption: message, parse_mode: 'Markdown', reply_markup });

        // Try sending each available video; on failure disable it and try next
        for (; ;) {
            const startVideo = pickStartVideo();
            if (!startVideo) {
                break;
            }

            try {
                const p = bot.sendVideo(msg.chat.id, startVideo, videoOptions);
                p.catch(() => { }); // suppress request-promise duplicate rejection
                await p;
                return;
            } catch (error) {
                log.child('Start').error(`Failed to send intro video: ${error.message}`);
                disableStartVideo(startVideo, error);
            }
        }

        sendReply(msg, message, { parse_mode: 'Markdown', reply_markup });
    }

    return { handleStartNoToken };
}

module.exports = { createStartHandlers };
