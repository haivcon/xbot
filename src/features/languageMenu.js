const { chunkInlineButtons } = require('../utils/helpers');
const { formatMarkdownTableBlock } = require('../app/utils/markdown');
const { HELP_TABLE_LAYOUT } = require('../config/constants');

const LANGUAGE_OPTIONS = [
    { code: 'vi', flag: '🇻🇳', nativeName: 'Tiếng Việt', vibe: '✨' },
    { code: 'zh', flag: '🇨🇳', nativeName: '中文', vibe: '🌟' },
    { code: 'en', flag: '🇺🇸', nativeName: 'English', vibe: '🚀' },
    { code: 'id', flag: '🇮🇩', nativeName: 'Bahasa Indonesia', vibe: '🎯' },
    { code: 'ko', flag: '🇰🇷', nativeName: '한국어', vibe: '🎵' },
    { code: 'ru', flag: '🇷🇺', nativeName: 'Русский', vibe: '🎯' }
];

function findLanguageOption(code) {
    return (
        LANGUAGE_OPTIONS.find((option) => option.code === code) ||
        LANGUAGE_OPTIONS.find((option) => option.code === 'en') ||
        LANGUAGE_OPTIONS[0]
    );
}

function buildLanguageMenuText({ t, lang, currentLang, isGroupChat = false, autoCloseSeconds = null }) {
    const current = findLanguageOption(currentLang);
    const headerLabel = t(lang, 'help_table_command_header');
    const headerValue = t(lang, 'help_table_description_header');
    const tableSource = [
        `| ${headerLabel} | ${headerValue} |`,
        '| --- | --- |',
        `| ${t(lang, 'select_language_current')} | ${current.flag} ${current.nativeName} |`,
        `| ${t(lang, 'select_language_scope')} | ${isGroupChat ? t(lang, 'select_group_language') : t(lang, 'select_language')} |`,
        autoCloseSeconds !== null
            ? `| ${t(lang, 'select_language_autoclose')} | ${autoCloseSeconds}s |`
            : null
    ].filter(Boolean);
    const formattedTable = formatMarkdownTableBlock(tableSource, HELP_TABLE_LAYOUT);

    return ['🌐 Language studio', `<pre>${formattedTable}</pre>`].join('\n\n');
}

function buildLanguageKeyboard({ t, lang, currentLang, includeClose = true }) {
    const buttons = LANGUAGE_OPTIONS.map((option) => {
        const isCurrent = option.code === currentLang;
        const badge = isCurrent ? '✅ ' : '';
        return {
            text: `${badge}${option.flag} ${option.nativeName}`,
            callback_data: `lang_${option.code}`
        };
    });

    const inline_keyboard = chunkInlineButtons(buttons, 2);
    if (includeClose) {
        inline_keyboard.push([{ text: `✖️ ${t(lang, 'action_close')}`, callback_data: 'lang_close' }]);
    }

    return { inline_keyboard };
}

function buildLanguageKeyboardWithPrefix(options = {}) {
    const { prefix = 'lang' } = options;
    if (!prefix || prefix === 'lang') {
        return buildLanguageKeyboard(options);
    }
    const base = buildLanguageKeyboard(options);
    base.inline_keyboard = (base.inline_keyboard || []).map((row) =>
        row.map((btn) => ({
            ...btn,
            callback_data: typeof btn.callback_data === 'string'
                ? btn.callback_data.replace(/^lang_/, `${prefix}_`)
                : btn.callback_data
        }))
    );
    return base;
}

module.exports = {
    LANGUAGE_OPTIONS,
    findLanguageOption,
    buildLanguageMenuText,
    buildLanguageKeyboard,
    buildLanguageKeyboardWithPrefix
};
