const { t } = require('../../i18n');
const { escapeHtml } = require('../../utils/format');
const { formatCommandLabel, formatMarkdownTableBlock } = require('../../utils/format');
const { HELP_COMMAND_DETAILS, HELP_GROUP_DETAILS, HELP_USER_SECTIONS, HELP_TABLE_LAYOUT } = require('../../config');

const helpMenuStates = new Map();

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
        const label = command?.command
            ? formatCommandLabel(command.command, { icon: command.icon, context: 'code' })
            : '';
        const description = command?.descKey ? t(lang, command.descKey) : '';
        tableSource.push(`| ${label} | ${description || '-'} |`);
    });

    const formattedTable = formatMarkdownTableBlock(tableSource, HELP_TABLE_LAYOUT);

    lines.push('<pre>');
    lines.push(escapeHtml(formattedTable));
    lines.push('</pre>');

    return lines.filter(Boolean).join('\n');
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
            const prefix = isActive ? '👇️' : '•';
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

function getHelpMessageStateKey(chatId, messageId) {
    if (!chatId || !messageId) {
        return null;
    }
    return `${chatId}:${messageId}`;
}

function saveHelpMessageState(chatId, messageId, state) {
    const key = getHelpMessageStateKey(chatId, messageId);
    if (!key) {
        return;
    }
    helpMenuStates.set(key, state);
}

function getHelpMessageState(chatId, messageId) {
    const key = getHelpMessageStateKey(chatId, messageId);
    return key ? helpMenuStates.get(key) : null;
}

function clearHelpMessageState(chatId, messageId) {
    const key = getHelpMessageStateKey(chatId, messageId);
    if (!key) {
        return;
    }
    helpMenuStates.delete(key);
}

function resolveHelpGroups() {
    return HELP_USER_SECTIONS.flatMap((section) => (section.groups || []).filter((key) => Boolean(HELP_GROUP_DETAILS[key])));
}

function getDefaultHelpGroup() {
    const groups = resolveHelpGroups();
    return groups.length > 0 ? groups[0] : null;
}

module.exports = {
    buildHelpText,
    buildHelpKeyboard,
    saveHelpMessageState,
    getHelpMessageState,
    clearHelpMessageState,
    getDefaultHelpGroup
}