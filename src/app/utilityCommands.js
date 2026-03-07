const createIdTelegramHandler = require('./utils/idTelegram');

function registerUtilityCommands({
    bot,
    enforceBanForMessage,
    ensureAdminOrOwner,
    getLang,
    launchAdminHelpMenu,
    parseTargetFromCommand,
    resolveTargetId,
    resolveUserProfile,
    sendReply,
    t,
    sendIdTelegramDetails,
    collectTelegramFileIds,
    idTelegramSessions,
    handleIdTelegramCommand: providedHandleIdTelegramCommand
}) {
    if (!bot) throw new Error('bot is required for utility commands');

    const handleIdTelegramCommand =
        providedHandleIdTelegramCommand ||
        createIdTelegramHandler({
            bot,
            getLang,
            collectTelegramFileIds,
            sendIdTelegramDetails,
            idTelegramSessions,
            t,
            sendReply
        });

    bot.onText(/^\/dataTelegram(?:@[\w_]+)?$/i, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        await handleIdTelegramCommand(msg);
    });

    bot.onText(/^\/admin(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }
        const lang = await getLang(msg);
        await launchAdminHelpMenu({
            actorId: msg.from?.id,
            chat: msg.chat,
            lang,
            replyMessage: msg
        });
    });

    bot.onText(/^\/id(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const targetChatId = msg.chat?.id?.toString();
        const target = parseTargetFromCommand(msg, msg.text || '') || { id: targetChatId, name: msg.chat?.title };
        const resolved = await resolveTargetId(targetChatId, target);
        if (!resolved) {
            await sendReply(msg, t(lang, 'help_action_not_available'));
            return;
        }

        const profile = await resolveUserProfile(targetChatId, resolved);
        const lines = [`ID: ${resolved}`];
        if (profile?.username) {
            lines.push(`Username: @${profile.username}`);
        }
        if (profile?.first_name || profile?.last_name) {
            const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
            if (name) {
                lines.push(`Name: ${name}`);
            }
        }

        await sendReply(msg, lines.join('\n'));
    });
}

module.exports = registerUtilityCommands;
