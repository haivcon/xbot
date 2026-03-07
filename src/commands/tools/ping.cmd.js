/**
 * Ping Command - Sample command demonstrating the new command system
 * File: src/commands/tools/ping.cmd.js
 */

module.exports = (deps) => {
    const { sendReply } = deps;

    return {
        name: 'ping',
        aliases: ['p'],
        category: 'tools',
        permissions: ['user'],
        cooldown: 1000, // 1 second cooldown
        usage: '/ping',
        descKey: 'help_command_ping',
        hidden: false,

        handler: async (msg, { lang }) => {
            const start = Date.now();
            const sent = await sendReply(msg, '🏓 Pong!');

            const latency = Date.now() - start;
            const text = `🏓 Pong! (${latency}ms)`;

            try {
                await deps.bot.editMessageText(text, {
                    chat_id: sent.chat.id,
                    message_id: sent.message_id
                });
            } catch (e) {
                // Ignore edit errors
            }
        }
    };
};
