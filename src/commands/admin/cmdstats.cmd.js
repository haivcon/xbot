/**
 * Command Stats - Shows command usage statistics (owner only)
 * File: src/commands/admin/cmdstats.cmd.js
 */

const { commandRegistry } = require('../../core/commandRegistry');

module.exports = (deps) => {
    const { sendReply, t } = deps;

    return {
        name: 'cmdstats',
        aliases: ['commandstats', 'cstats'],
        category: 'admin',
        permissions: ['owner'],
        cooldown: 5000,
        usage: '/cmdstats [command]',
        descKey: 'help_command_cmdstats',
        hidden: true, // Hidden from /help, owner-only

        handler: async (msg, { args, lang }) => {
            const targetCommand = args[0];

            if (targetCommand) {
                // Show stats for specific command
                const stats = commandRegistry.getStats(targetCommand);
                if (!stats) {
                    await sendReply(msg, `❌ Command /${targetCommand} not found.`);
                    return;
                }

                const lines = [
                    `📊 **Stats for /${targetCommand}:**`,
                    `• Calls: ${stats.calls}`,
                    `• Errors: ${stats.errors} (${stats.errorRate}%)`,
                    `• Avg Time: ${stats.avgTime}ms`,
                    `• Total Time: ${stats.totalTime}ms`
                ];
                await sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown' });
                return;
            }

            // Show all command stats
            const allStats = commandRegistry.getAllStats()
                .filter(s => s.calls > 0)
                .sort((a, b) => b.calls - a.calls)
                .slice(0, 20);

            if (allStats.length === 0) {
                await sendReply(msg, '📊 No command usage recorded yet.');
                return;
            }

            const lines = [
                `📊 **Top Commands (by usage):**`,
                '',
                ...allStats.map((s, i) =>
                    `${i + 1}. /${s.name}: ${s.calls} calls, ${s.avgTime}ms avg`
                )
            ];

            await sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown' });
        }
    };
};
