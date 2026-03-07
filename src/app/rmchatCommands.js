function createRmchatCommands({ t, getLang, sendReply, scheduleMessageDeletion }) {
    function buildRmchatKeyboard(lang) {
        return {
            inline_keyboard: [
                [{ text: `🤖 ${t(lang, 'rmchat_option_bot')}`, callback_data: 'rmchat:bot' }],
                [{ text: `👤 ${t(lang, 'rmchat_option_user')}`, callback_data: 'rmchat:user' }],
                [{ text: `🧹 ${t(lang, 'rmchat_option_all')}`, callback_data: 'rmchat:all' }],
                [{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]
            ]
        };
    }

    function buildRmchatText(lang) {
        return [
            t(lang, 'rmchat_title'),
            t(lang, 'rmchat_intro'),
            '',
            t(lang, 'rmchat_option_bot'),
            t(lang, 'rmchat_option_user'),
            t(lang, 'rmchat_option_all')
        ]
            .filter(Boolean)
            .join('\n');
    }

    async function handleRmchatCommand(msg) {
        const chatId = msg?.chat?.id;
        if (!chatId) {
            return;
        }
        const lang = await getLang(msg);
        const text = buildRmchatText(lang);
        const replyMarkup = buildRmchatKeyboard(lang);
        const response = await sendReply(msg, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup
        });

        if (response?.chat?.type === 'private' && response?.chat?.id && response?.message_id) {
            scheduleMessageDeletion(response.chat.id, response.message_id, 20000);
        }
    }

    return {
        handleRmchatCommand,
        buildRmchatKeyboard,
        buildRmchatText
    };
}

module.exports = createRmchatCommands;
