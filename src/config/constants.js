// Centralized constants for commands, help layout, and check-in helpers (UTF-8, emoji friendly for Markdown V2).

const CHECKIN_EMOTIONS = ['😀', '😃', '😄', '😁', '😊', '😍'];

const HELP_COMMAND_DETAILS = {
    start: { command: '/start', icon: '🚀', descKey: 'help_command_start' },
    datatelegram: { command: '/dataTelegram', icon: '🗂️', descKey: 'help_command_idtelegram' },
    ai: { command: '/ai', icon: '🤖', descKey: 'help_command_ai' },
    api: { command: '/api', icon: '🔑', descKey: 'help_command_api' },
    register: { command: '/register', icon: '📝', descKey: 'help_command_register' },
    mywallet: { command: '/mywallet', icon: '👛', descKey: 'help_command_mywallet' },
    unregister: { command: '/unregister', icon: '🗑️', descKey: 'help_command_unregister' },
    rmchat: { command: '/rmchat', icon: '🧹', descKey: 'help_command_rmchat' },
    donate: { command: '/donate', icon: '❤️', descKey: 'help_command_donate' },
    donatedev: { command: '/donatedev', icon: '🛠️', descKey: 'help_command_donatedev' },
    donatecm: { command: '/donatecm', icon: '🤝', descKey: 'help_command_donatecm' },
    rand: { command: '/rand', icon: '🎲', descKey: 'help_command_rand' },
    random: { command: '/random', icon: '🌀', descKey: 'help_command_random' },
    rps: { command: '/rps', icon: '✊', descKey: 'help_command_rps' },
    roll: { command: '/roll', icon: '🎯', descKey: 'help_command_roll' },
    td: { command: '/td', icon: '🧠', descKey: 'help_command_td' },
    doremon: { command: '/doremon', icon: '🐱', descKey: 'help_command_doremon' },
    okxchains: { command: '/okxchains', icon: '🛰️', descKey: 'help_command_okxchains' },
    okx402status: { command: '/okx402status', icon: '🛰️', descKey: 'help_command_okx402status' },
    toptoken: { command: '/toptoken', icon: '📈', descKey: 'help_command_toptoken' },
    txhash: { command: '/txhash', icon: '🧾', descKey: 'help_command_txhash' },
    contract: { command: '/contract', icon: '📜', descKey: 'help_command_contract' },
    token: { command: '/token', icon: '🪙', descKey: 'help_command_token' },
    lang: { command: '/lang', icon: '🌐', descKey: 'help_command_lang' },
    help: { command: '/help', icon: '🆘', descKey: 'help_command_help' },
    price: { command: '/price', icon: '💹', descKey: 'help_command_price' },
    checkin: { command: '/checkin', icon: '✅', descKey: 'help_command_checkin' },
    topcheckin: { command: '/topcheckin', icon: '🏆', descKey: 'help_command_topcheckin' },
    checkinadmin: { command: '/checkinadmin', icon: '🛡️', descKey: 'help_command_checkin_admin' },
    welcomeadmin: { command: '/welcomeadmin', icon: '🙋', descKey: 'help_command_welcome_admin' },
    admin: { command: '/admin', icon: '🧰', descKey: 'help_command_admin' },
    admin_ban: { command: '/ban', icon: '🚫', descKey: 'help_command_admin_ban' },
    admin_kick: { command: '/kick', icon: '🦵', descKey: 'help_command_admin_kick' },
    admin_mute: { command: '/mute', icon: '🤐', descKey: 'help_command_admin_mute' },
    admin_unmute: { command: '/unmute', icon: '🔊', descKey: 'help_command_admin_unmute' },
    admin_muteall: { command: '/muteall', icon: '🔇', descKey: 'help_command_admin_muteall' },
    admin_unmuteall: { command: '/unmuteall', icon: '🔈', descKey: 'help_command_admin_unmuteall' },
    admin_warn: { command: '/warn', icon: '⚠️', descKey: 'help_command_admin_warn' },
    admin_warnings: { command: '/warnings', icon: '📋', descKey: 'help_command_admin_warnings' },
    admin_welcome: { command: '/welcome', icon: '🎉', descKey: 'help_command_admin_welcome' },
    admin_delete: { command: '/del', icon: '🗑️', descKey: 'help_command_admin_delete' },
    admin_lock_links: { command: '/lock links', icon: '🔗', descKey: 'help_command_admin_lock_links' },
    admin_lock_files: { command: '/lock files', icon: '📁', descKey: 'help_command_admin_lock_files' },
    admin_antiflood: { command: '/antiflood', icon: '🚧', descKey: 'help_command_admin_antiflood' },
    admin_rules: { command: '/rules', icon: '📜', descKey: 'help_command_admin_rules' },
    admin_info: { command: '/info', icon: 'ℹ️', descKey: 'help_command_admin_info' },
    admin_filter: { command: '/filter', icon: '🚫', descKey: 'help_command_admin_filter' },
    admin_filters: { command: '/filters', icon: '🧰', descKey: 'help_command_admin_filters' },
    admin_filterx: { command: '/filterx', icon: '??', descKey: 'help_command_admin_filterx' },
    profile: { command: '/profile', icon: '🙋', descKey: 'help_command_profile' },
    ping: { command: '/ping', icon: '🏓', descKey: 'help_command_ping' },
    recent: { command: '/recent', icon: '📋', descKey: 'help_command_recent' },
    meme: { command: '/meme', icon: '🎯', descKey: 'help_command_meme' },
    pnl: { command: '/pnl', icon: '📊', descKey: 'help_command_pnl' },
    dexhistory: { command: '/dexhistory', icon: '📜', descKey: 'help_command_dexhistory' },
    txhistory: { command: '/txhistory', icon: '🔍', descKey: 'help_command_txhistory' },
    trending: { command: '/trending', icon: '🔥', descKey: 'help_command_trending' }
};

const HELP_GROUP_DETAILS = {
    onboarding: {
        icon: '🚀',
        titleKey: 'help_group_onboarding_title',
        descKey: 'help_group_onboarding_desc',
        commands: ['start', 'help', 'lang', 'ai', 'api', 'profile']
    },
    xlayer_check: {
        icon: '🔎',
        titleKey: 'help_group_xlayer_check_title',
        descKey: 'help_group_xlayer_check_desc',
        commands: ['mywallet', 'rmchat', 'okxchains', 'okx402status', 'txhash', 'toptoken', 'token', 'contract', 'meme', 'pnl', 'dexhistory', 'txhistory', 'trending']
    },
    tools: {
        icon: '🛠️',
        titleKey: 'help_group_tools_title',
        descKey: 'help_group_tools_desc',
        commands: ['random', 'datatelegram', 'donate', 'ping', 'recent']
    },
    checkin: {
        icon: '🫂',
        titleKey: 'help_group_checkin_title',
        descKey: 'help_group_checkin_desc',
        commands: ['checkinadmin', 'welcomeadmin', 'admin', 'price']
    }
};

const HELP_USER_SECTIONS = [
    {
        titleKey: 'help_section_general_title',
        groups: ['onboarding', 'xlayer_check', 'tools']
    },
    {
        titleKey: null,
        groups: ['checkin']
    }
];

const HELP_TABLE_LAYOUT = {
    maxWidth: 72,
    targetWidth: 68,
    maxColumnWidth: 32,
    minColumnWidth: 10,
    borderStyle: 'unicode'
};

const ADMIN_MENU_SECTION_CONFIG = {
    lists: {
        labelKey: 'checkin_admin_section_lists_button',
        hintKey: 'checkin_admin_section_lists_hint',
        actions: [
            { labelKey: 'checkin_admin_button_today_list', callback: (chatKey) => `checkin_admin_list|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_window', callback: (chatKey) => `checkin_admin_summary_window|${chatKey}` },
            { labelKey: 'checkin_admin_button_remove', callback: (chatKey) => `checkin_admin_remove|${chatKey}` },
            { labelKey: 'checkin_admin_button_unlock', callback: (chatKey) => `checkin_admin_unlock|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_reset', callback: (chatKey) => `checkin_admin_summary_reset|${chatKey}` }
        ]
    },
    announcements: {
        labelKey: 'checkin_admin_section_announcements_button',
        hintKey: 'checkin_admin_section_announcements_hint',
        actions: [
            { labelKey: 'checkin_admin_button_broadcast', callback: (chatKey) => `checkin_admin_broadcast|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_broadcast', callback: (chatKey) => `checkin_admin_summary_broadcast|${chatKey}` },
            { labelKey: 'checkin_admin_button_secret_message', callback: (chatKey) => `checkin_admin_dm|${chatKey}` },
            { labelKey: 'checkin_admin_button_title', callback: (chatKey) => `checkin_admin_title|${chatKey}` }
        ]
    },
    leaderboard: {
        labelKey: 'checkin_admin_section_leaderboard_button',
        hintKey: 'checkin_admin_section_leaderboard_hint',
        actions: [
            { labelKey: 'checkin_admin_button_leaderboard_view', callback: (chatKey) => `checkin_admin_leaderboard_view|${chatKey}` },
            { labelKey: 'checkin_admin_button_leaderboard_manage', callback: (chatKey) => `checkin_admin_leaderboard_members|${chatKey}` },
            { labelKey: 'checkin_admin_button_leaderboard_reset', callback: (chatKey) => `checkin_admin_leaderboard_reset|${chatKey}` }
        ]
    },
    settings: {
        labelKey: 'checkin_admin_section_settings_button',
        hintKey: 'checkin_admin_section_settings_hint',
        actions: [
            { labelKey: 'checkin_admin_button_points', callback: (chatKey) => `checkin_admin_points|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary', callback: (chatKey) => `checkin_admin_summary|${chatKey}` },
            { labelKey: 'checkin_admin_button_question_mix', callback: (chatKey) => `checkin_admin_weights|${chatKey}` },
            { labelKey: 'checkin_admin_button_schedule', callback: (chatKey) => `checkin_admin_schedule|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_schedule', callback: (chatKey) => `checkin_admin_summary_schedule|${chatKey}` },
            { labelKey: 'checkin_admin_button_topics', callback: (chatKey) => `checkin_admin_topics|${chatKey}` }
        ]
    }
};

module.exports = {
    ADMIN_MENU_SECTION_CONFIG,
    CHECKIN_EMOTIONS,
    HELP_COMMAND_DETAILS,
    HELP_GROUP_DETAILS,
    HELP_TABLE_LAYOUT,
    HELP_USER_SECTIONS
};






