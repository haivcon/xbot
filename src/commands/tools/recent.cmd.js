/**
 * Recent Commands - Shows user's recent command history with daily usage
 * File: src/commands/tools/recent.cmd.js
 */

const { commandRegistry } = require('../../core/commandRegistry');

module.exports = (deps) => {
    const { sendReply, t, buildCloseKeyboard } = deps;

    return {
        name: 'recent',
        aliases: ['history', 'r'],
        category: 'tools',
        permissions: ['user'],
        cooldown: 2000,
        usage: '/recent',
        descKey: 'help_command_recent',
        hidden: false,

        handler: async (msg, { lang }) => {
            const userId = msg.from?.id?.toString();
            const usageToday = commandRegistry.getUserDailyUsage(userId);
            if (!usageToday || usageToday.size === 0) {
                await sendReply(msg, t(lang, 'recent_commands_empty') || '📋 Chưa có lịch sử lệnh.', { reply_markup: buildCloseKeyboard ? buildCloseKeyboard(lang) : undefined });
                return;
            }

            const lines = [];

            // Daily usage summary
            const usageTitle = t(lang, 'recent_usage_today') || '📊 Today\'s command usage';
            lines.push(usageTitle);

            const usageEntries = Array.from(usageToday?.entries?.() || []).sort((a, b) => (b[1] || 0) - (a[1] || 0));
            usageEntries.forEach(([cmd, count], idx) => {
                lines.push(`${idx + 1}. /${cmd} (${count}x)`);
            });

            await sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard ? buildCloseKeyboard(lang) : undefined });
        }
    };
};
