function createHelpFeature({
    t,
    escapeHtml,
    formatCommandLabel,
    formatMarkdownTableBlock,
    HELP_COMMAND_DETAILS,
    HELP_GROUP_DETAILS,
    HELP_USER_SECTIONS,
    HELP_TABLE_LAYOUT,
    DEVELOPER_DONATION_ADDRESS,
    COMMUNITY_WALLET_ADDRESS,
    db
}) {
    function buildHelpGroupCard(lang, groupKey) {
        const detail = HELP_GROUP_DETAILS[groupKey];
        if (!detail) {
            return '';
        }

        const title = t(lang, detail.titleKey);
        const desc = detail.descKey ? t(lang, detail.descKey) : '';
        const lines = [`${detail.icon} <b>${escapeHtml(title)}</b>`];

        if (desc) {
            lines.push(`<i>${escapeHtml(desc)}</i>`);
        }

        const baseCommands = (detail.commands || []).filter((key) => HELP_COMMAND_DETAILS[key]);
        const commands = detail === HELP_GROUP_DETAILS.xlayer_check
            ? Array.from(new Set([...baseCommands, 'txhash'].filter((key) => HELP_COMMAND_DETAILS[key])))
            : baseCommands;
        const headerCommand = t(lang, 'help_table_command_header');
        const headerDesc = t(lang, 'help_table_description_header');

        const tableSource = [`| ${headerCommand} | ${headerDesc} |`, '| --- | --- |'];
        commands.forEach((key) => {
            const command = HELP_COMMAND_DETAILS[key];
            // Telegram renders emoji inside <pre> with inconsistent widths, which breaks column alignment.
            // Use plain command text (no icon) inside the code-block table to keep borders straight.
            const label = command?.command ? command.command : '';
            const description = command?.descKey ? t(lang, command.descKey) : '';
            tableSource.push(`| ${label} | ${description || '-'} |`);
        });

        const formattedTable = formatMarkdownTableBlock(tableSource, HELP_TABLE_LAYOUT);

        lines.push('<pre>');
        lines.push(escapeHtml(formattedTable));
        lines.push('</pre>');

        return lines.filter(Boolean).join('\n');
    }

    function resolveHelpGroups() {
        return HELP_USER_SECTIONS.flatMap((section) => (section.groups || []).filter((key) => Boolean(HELP_GROUP_DETAILS[key])));
    }

    function getDefaultHelpGroup() {
        const groups = resolveHelpGroups();
        return groups.length > 0 ? groups[0] : null;
    }

    function buildHelpText(lang, activeGroup = null) {
        const sections = HELP_USER_SECTIONS;
        const validGroups = resolveHelpGroups();
        const selectedGroup = activeGroup && validGroups.includes(activeGroup)
            ? activeGroup
            : (validGroups[0] || null);

        const lines = [];

        lines.push(t(lang, 'help_header'));
        lines.push(`<i>${escapeHtml(t(lang, 'help_menu_hint'))}</i>`);

        if (selectedGroup) {
            const owningSection = sections.find((section) => (section.groups || []).includes(selectedGroup));
            if (owningSection?.titleKey) {
                lines.push('');
                lines.push(`<b>${escapeHtml(t(lang, owningSection.titleKey))}</b>`);
            }

            const card = buildHelpGroupCard(lang, selectedGroup);
            if (card) {
                lines.push(card);
            }
        }

        return lines.filter(Boolean).join('\n');
    }

    function buildHelpKeyboard(lang, selectedGroup = null) {
        const sections = HELP_USER_SECTIONS;
        const validGroups = resolveHelpGroups();
        const activeGroup = validGroups.includes(selectedGroup) ? selectedGroup : (validGroups[0] || null);
        const inline_keyboard = [];

        const groupButtons = [];
        for (const section of sections) {
            for (const groupKey of section.groups || []) {
                const detail = HELP_GROUP_DETAILS[groupKey];
                if (!detail) {
                    continue;
                }
                const title = t(lang, detail.titleKey);
                const isActive = groupKey === activeGroup;
                const prefix = isActive ? '👀' : '•';
                groupButtons.push({ text: `${prefix} ${detail.icon} ${title}`, callback_data: `help_group|${groupKey}` });
            }
        }

        for (let i = 0; i < groupButtons.length; i += 2) {
            inline_keyboard.push(groupButtons.slice(i, i + 2));
        }

        const activeDetail = activeGroup ? HELP_GROUP_DETAILS[activeGroup] : null;
        let commands = activeDetail ? (activeDetail.commands || []).filter((key) => HELP_COMMAND_DETAILS[key]) : [];
        if (activeGroup === 'xlayer_check' && HELP_COMMAND_DETAILS.txhash && !commands.includes('txhash')) {
            commands = [...commands, 'txhash'];
        }
        if (commands.length > 0) {
            inline_keyboard.push([{ text: `${t(lang, 'help_child_command_hint')}`, callback_data: 'help_separator' }]);
            for (let i = 0; i < commands.length; i += 2) {
                const row = [];
                for (let j = i; j < Math.min(i + 2, commands.length); j += 1) {
                    const key = commands[j];
                    const detail = HELP_COMMAND_DETAILS[key];
                    if (!detail) {
                        continue;
                    }
                    const label = formatCommandLabel(detail.command, { icon: detail.icon, context: 'plain' });
                    row.push({ text: label, callback_data: `help_cmd|${key}` });
                }
                if (row.length > 0) {
                    inline_keyboard.push(row);
                }
            }
        }

        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]);
        return { inline_keyboard };
    }

    function buildDonateMessage(lang, { variant = 'community', groupSettings = null } = {}) {
        const lines = [];
        lines.push(`💝 <b>${escapeHtml(t(lang, 'donate_title'))}</b>`);
        lines.push(`<i>${escapeHtml(t(lang, 'donate_description'))}</i>`);

        lines.push('');
        lines.push(`🤝 <i>${escapeHtml(t(lang, 'donate_support_cta'))}</i>`);
        lines.push('');
        const label = t(lang, 'donate_developer_wallet_label');
        lines.push(`💳 <b>${escapeHtml(label)}</b>`);
        lines.push(`<code>${escapeHtml(DEVELOPER_DONATION_ADDRESS)}</code>`);
        lines.push(`ℹ️ <i>${escapeHtml(t(lang, 'donate_developer_wallet_desc'))}</i>`);
        lines.push(`⚠️ <i>${escapeHtml(t(lang, 'donate_developer_wallet_warning'))}</i>`);
        lines.push('', `🙏 <i>${escapeHtml(t(lang, 'donate_footer'))}</i>`);
        return lines.filter(Boolean).join('\n');
    }

    function buildDonateKeyboard(lang) {
        const inline_keyboard = [[{ text: t(lang, 'help_button_close'), callback_data: 'donate_cmd|close' }]];
        return { inline_keyboard };
    }

    async function buildCommunityDonationBroadcastText(lang, chatId) {
        const settings = chatId ? await db.getGroupBotSettings(chatId) : null;
        const donation = settings?.donation || {};
        const address = donation.address || COMMUNITY_WALLET_ADDRESS;
        const note = donation.note || t(lang, 'donatecm_default_note');

        return t(lang, 'donatecm_broadcast_message', {
            address: escapeHtml(address),
            note: escapeHtml(note)
        });
    }

    return {
        buildHelpGroupCard,
        buildHelpText,
        buildHelpKeyboard,
        buildDonateMessage,
        buildDonateKeyboard,
        buildCommunityDonationBroadcastText,
        resolveHelpGroups,
        getDefaultHelpGroup
    };
}

module.exports = createHelpFeature;
