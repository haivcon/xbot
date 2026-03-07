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
        return {
            inline_keyboard: [
                [{ text: `🆘🆘🆘   👉👉👉    ${t(lang, 'help_command_help')} (/help)  👈👈👈   🆘🆘🆘`, callback_data: 'start_help' }]
            ]
        };
    }

    async function handleStartNoToken(msg) {
        if (await enforceOwnerCommandLimit(msg, 'start')) {
            return;
        }
        const lang = await getLang(msg);
        const message = t(lang, 'welcome_generic');
        const reply_markup = buildStartHelpKeyboard(lang);
        const videoOptions = buildThreadedOptions(msg, { caption: message, parse_mode: 'Markdown', reply_markup });

        // Try sending each available video; on failure disable it and try next
        for (; ;) {
            const startVideo = pickStartVideo();
            if (!startVideo) {
                break;
            }

            try {
                await bot.sendVideo(msg.chat.id, startVideo, videoOptions);
                return;
            } catch (error) {
                console.error(`[Start] Failed to send intro video: ${error.message}`);
                disableStartVideo(startVideo, error);
            }
        }

        sendReply(msg, message, { parse_mode: 'Markdown', reply_markup });
    }

    return { handleStartNoToken };
}

module.exports = { createStartHandlers };
