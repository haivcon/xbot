const { extractThreadId } = require('./utils/telegram');

const logger = require('../core/logger');
const log = logger.child('Admin');
const ADMIN_COMMAND_CARDS = [
    { key: 'admin', usageKeys: [] },
    { key: 'admin_info', usageKeys: ['admin_help_info_usage_reply', 'admin_help_info_usage_buttons'] },
    { key: 'admin_ban', usageKeys: ['admin_help_ban_usage_target', 'admin_help_ban_usage_unban'] },
    { key: 'admin_kick', usageKeys: ['admin_help_kick_usage_target', 'admin_help_kick_usage_rejoin'] },
    { key: 'admin_mute', usageKeys: ['admin_help_mute_usage_duration', 'admin_help_mute_usage_override'] },
    { key: 'admin_unmute', usageKeys: ['admin_help_unmute_usage_target', 'admin_help_unmute_usage_reset'] },
    { key: 'admin_muteall', usageKeys: ['admin_help_muteall_usage_enable'] },
    { key: 'admin_unmuteall', usageKeys: ['admin_help_unmuteall_usage_restore'] },
    { key: 'admin_warn', usageKeys: ['admin_help_warn_usage_reason', 'admin_help_warn_usage_limit'] },
    { key: 'admin_warnings', usageKeys: ['admin_help_warnings_usage_review'] },
    { key: 'admin_welcome', usageKeys: ['admin_help_welcome_usage_set', 'admin_help_welcome_usage_cleanup'] },
    { key: 'admin_delete', usageKeys: ['admin_help_delete_usage_single', 'admin_help_delete_usage_bulk'] },
    { key: 'admin_lock_links', usageKeys: ['admin_help_lock_links_usage_guard', 'admin_help_lock_links_usage_allow'] },
    { key: 'admin_lock_files', usageKeys: ['admin_help_lock_files_usage_guard', 'admin_help_lock_files_usage_allow'] },
    { key: 'admin_antiflood', usageKeys: ['admin_help_antiflood_usage_config', 'admin_help_antiflood_usage_toggle'] },
    { key: 'admin_rules', usageKeys: ['admin_help_rules_usage_set', 'admin_help_rules_usage_share'] },
    { key: 'admin_filter', usageKeys: ['admin_help_filter_usage_setup', 'admin_help_filter_usage_trigger'] },
    { key: 'admin_filters', usageKeys: ['admin_help_filters_usage_list', 'admin_help_filters_usage_copy'] },
    { key: 'admin_filterx', usageKeys: ['admin_help_filterx_usage'] }
];

const ADMIN_CATEGORIES = [
    {
        key: 'members',
        labelKey: 'admin_category_members',
        commands: ['admin_info', 'admin_ban', 'admin_kick', 'admin_mute', 'admin_unmute', 'admin_warn', 'admin_warnings', 'admin_muteall', 'admin_unmuteall']
    },
    {
        key: 'protection',
        labelKey: 'admin_category_protection',
        commands: ['admin_lock_links', 'admin_lock_files', 'admin_antiflood', 'admin_delete', 'admin_filter', 'admin_filters', 'admin_filterx']
    },
    {
        key: 'setup',
        labelKey: 'admin_category_setup',
        commands: ['admin_info', 'admin_rules', 'admin_welcome', 'admin']
    }
];

function createAdminHandlers({
    bot,
    t,
    db,
    getLang,
    defaultLang,
    resolveNotificationLanguage,
    resolveGroupLanguage,
    isGroupAdmin,
    isUserAdmin, // Added from second block
    enforceOwnerCommandLimit,
    sendReply,
    openAdminHub,
    sendAdminMenu,
    normalizeAddressSafe,
    shortenAddress,
    escapeHtml,
    // Helper utils specific to this module
    parseDurationText, // Assuming this exists or is passed in
    HELP_COMMAND_DETAILS,
    formatCommandLabel,
    hasOwnerOverride,
    rememberAdminChat
}) {

    const adminCommandContexts = new Map();

    // --- Helper Functions ---

    function resolveCommandTarget(msg, explicitArg) {
        if (msg.reply_to_message?.from?.id) {
            const targetUser = msg.reply_to_message.from;
            return {
                id: targetUser.id,
                name: targetUser.first_name || targetUser.username || String(targetUser.id)
            };
        }
        if (explicitArg && /^\d+$/.test(explicitArg)) {
            return { id: Number(explicitArg), name: explicitArg };
        }
        return null;
    }

    function sanitizeInlineKeyboard(keyboard, { fallbackText = '?' } = {}) {
        if (!keyboard?.inline_keyboard) return keyboard;
        const inline_keyboard = [];
        const allowedKeys = new Set(['text', 'callback_data', 'url', 'switch_inline_query', 'switch_inline_query_current_chat', 'web_app']);

        for (const row of keyboard.inline_keyboard) {
            const buttons = [];
            for (const button of row || []) {
                if (!button) continue;
                const text = typeof button.text === 'string' ? button.text : fallbackText;
                const safeButton = { text };
                for (const key of Object.keys(button)) {
                    if (allowedKeys.has(key) && button[key] !== undefined) {
                        safeButton[key] = button[key];
                    }
                }
                if (safeButton.callback_data && safeButton.callback_data.length > 64) {
                    safeButton.callback_data = safeButton.callback_data.slice(0, 64);
                }
                buttons.push(safeButton);
            }
            if (buttons.length) inline_keyboard.push(buttons);
        }
        return { inline_keyboard };
    }

    function cloneInlineKeyboard(keyboard, { fallbackText = '?' } = {}) {
        if (!keyboard?.inline_keyboard) {
            return { inline_keyboard: [[{ text: fallbackText, callback_data: 'help_close' }]] };
        }
        const sanitized = sanitizeInlineKeyboard(keyboard, { fallbackText });
        return {
            inline_keyboard: sanitized.inline_keyboard.map((row) => row.map((button) => ({ ...button })))
        };
    }

    function buildCategoryKeyboard(lang, targetChatId, activeCategory) {
        const inline_keyboard = [];
        const fallbackText = t(lang || defaultLang, 'help_button_close') || 'Close';

        if (!activeCategory) {
            ADMIN_CATEGORIES.forEach((cat) => {
                const label = t(lang || defaultLang, cat.labelKey) || t(defaultLang, cat.labelKey) || cat.labelKey;
                inline_keyboard.push([
                    { text: label, callback_data: `admin_cat|${cat.key}|${targetChatId}` }
                ]);
            });
        } else {
            const category = ADMIN_CATEGORIES.find((cat) => cat.key === activeCategory);
            if (category) {
                const buttons = category.commands.map((key) => {
                    const entry = HELP_COMMAND_DETAILS[key];
                    const label = entry
                        ? formatCommandLabel(entry.command, { icon: entry.icon, context: 'plain' })
                        : key;
                    return { text: label, callback_data: `help_cmd|${key}|${targetChatId}` };
                });
                for (let i = 0; i < buttons.length; i += 2) {
                    inline_keyboard.push(buttons.slice(i, i + 2));
                }
                inline_keyboard.push([{ text: '⬅️ Quay lại', callback_data: `admin_cat|root|${targetChatId}` }]);
            }
        }

        inline_keyboard.push([{ text: fallbackText, callback_data: 'help_close' }]);
        return { inline_keyboard };
    }

    function buildCategoryDescription(lang, categoryKey) {
        const category = ADMIN_CATEGORIES.find((cat) => cat.key === categoryKey);
        if (!category) {
            return '';
        }
        const label = t(lang, category.labelKey) || t(defaultLang, category.labelKey) || category.labelKey;
        const lines = [escapeHtml(label), ''];
        category.commands.forEach((key) => {
            const entry = HELP_COMMAND_DETAILS[key];
            const command = entry ? escapeHtml(entry.command) : key;
            const icon = entry?.icon || '•';
            const desc = entry?.descKey ? escapeHtml(t(lang, entry.descKey)) : '';
            lines.push(`${icon} <b>${command}</b>${desc ? ` — ${desc}` : ''}`);
        });
        return lines.join('\n');
    }

    async function sendSafeInlineKeyboardMessage(chatId, text, keyboard, options = {}, lang) {
        const fallbackText = t(lang || defaultLang, 'help_button_close') || '?';
        const replyMarkup = (() => {
            const cloned = cloneInlineKeyboard(keyboard, { fallbackText });
            if (cloned?.inline_keyboard?.length) return cloned;
            return { inline_keyboard: [[{ text: fallbackText, callback_data: 'help_close' }]] };
        })();

        const payload = { ...options, reply_markup: replyMarkup };
        try {
            await bot.sendMessage(chatId, text, payload);
            return true;
        } catch (error) {
            // Fallback logic for keyboard errors
            const description = error?.response?.body?.description || '';
            if (/parse reply keyboard markup JSON object/i.test(description)) {
                const fallbackMarkup = JSON.stringify({
                    inline_keyboard: [[{ text: fallbackText, callback_data: 'help_close' }]]
                });
                await bot.sendMessage(chatId, text, { ...options, reply_markup: fallbackMarkup });
                return true;
            }
            throw error;
        }
    }

    function buildAdminCommandRows(lang, { targetChatId } = {}) {
        const rows = [];
        for (let i = 0; i < ADMIN_COMMAND_CARDS.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, ADMIN_COMMAND_CARDS.length); j += 1) {
                const card = ADMIN_COMMAND_CARDS[j];
                const entry = HELP_COMMAND_DETAILS[card.key];
                if (!entry) continue;
                const label = formatCommandLabel(entry.command, { icon: entry.icon, context: 'plain' });
                const callback = card.key === 'admin_warnings'
                    ? 'admin_action|warnings'
                    : `help_cmd|${card.key}${targetChatId ? `|${targetChatId}` : ''}`;
                row.push({ text: label, callback_data: callback });
            }
            if (row.length) rows.push(row);
        }
        return rows;
    }

    function buildAdminCommandDetail(lang, key) {
        const card = ADMIN_COMMAND_CARDS.find((entry) => entry.key === key);
        const detail = HELP_COMMAND_DETAILS[key];
        if (!card || !detail) return null;

        const parts = [];
        const header = `<b>${detail.icon} ${escapeHtml(detail.command)}</b>`;
        const description = escapeHtml(t(lang, card.descKey || detail.descKey));
        parts.push(header);
        if (description) parts.push(description);

        const usages = (card.usageKeys || [])
            .map((usageKey) => t(lang, usageKey))
            .filter(Boolean)
            .map((text) => `🔹 ${escapeHtml(text)}`); // Changed bullet to icon
        if (usages.length) {
            parts.push('', ...usages);
        }

        return {
            text: parts.filter(Boolean).join('\n'),
            reply_markup: { inline_keyboard: [[{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]] }
        };
    }

    // --- Main Action Handlers ---

    async function handleAdminActionCommand(msg, rawArgs) {
        const lang = await getLang(msg);
        const chatType = msg.chat.type;
        if (!['group', 'supergroup'].includes(chatType)) {
            await sendReply(msg, t(lang, 'admin_action_group_only'));
            return;
        }

        const chatId = msg.chat.id.toString();
        const adminId = msg.from?.id;
        if (!adminId) return;

        const isAdmin = await isGroupAdmin(chatId, adminId);
        if (!isAdmin) {
            await sendReply(msg, t(lang, 'admin_action_no_permission'));
            return;
        }

        const args = (rawArgs || '').trim();
        if (!args) {
            await sendReply(msg, t(lang, 'admin_action_missing_args'));
            return;
        }

        const [action, ...restParts] = args.split(/\s+/);
        const command = action.toLowerCase();
        const rest = [...restParts];
        const defaultReplyOptions = { reply_to_message_id: msg.message_id, allow_sending_without_reply: true };

        const sendFeedback = async (text) => {
            if (text) {
                await bot.sendMessage(chatId, text, { ...defaultReplyOptions, parse_mode: 'Markdown' });
            }
        };

        try {
            switch (command) {
                case 'mute': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    if (!target) {
                        await sendFeedback('🔇 ' + t(lang, 'admin_mute_invalid'));
                        break;
                    }
                    const durationArg = rest.shift();
                    const seconds = parseDurationText ? parseDurationText(durationArg) : (parseInt(durationArg) || 600);
                    const untilDate = Math.floor(Date.now() / 1000) + seconds;
                    // ... permissions object ...
                    const permissions = { can_send_messages: false, can_send_media_messages: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false, can_change_info: false, can_invite_users: false, can_pin_messages: false };
                    await bot.restrictChatMember(chatId, target.id, { permissions, until_date: untilDate });
                    await sendFeedback('🔇 ' + t(lang, 'admin_mute_success', {
                        user: target.name,
                        minutes: Math.ceil(seconds / 60).toString()
                    }));
                    break;
                }
                case 'warn': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    if (!target) {
                        await sendFeedback('⚠️ ' + t(lang, 'admin_warn_invalid'));
                        break;
                    }
                    const reason = rest.join(' ') || t(lang, 'admin_warn_default_reason');
                    await db.addWarning({
                        chatId,
                        targetUserId: target.id,
                        targetUsername: msg.reply_to_message?.from?.username || null,
                        reason,
                        createdBy: adminId
                    });
                    const warnings = await db.getWarnings(chatId, target.id);
                    await sendFeedback('⚠️ ' + t(lang, 'admin_warn_success', {
                        user: target.name,
                        count: warnings.length.toString(),
                        reason
                    }));
                    break;
                }
                case 'warnings': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    if (!target) {
                        await sendFeedback(t(lang, 'admin_warn_invalid'));
                        break;
                    }
                    const warnings = await db.getWarnings(chatId, target.id);
                    if (!warnings.length) {
                        await sendFeedback('✅ ' + t(lang, 'admin_warnings_none', { user: target.name }));
                        break;
                    }
                    const lines = warnings.map((warning, index) => {
                        const time = new Date(Number(warning.createdAt || 0)).toLocaleString();
                        return `${index + 1}. 🔸 ${warning.reason || '—'} (${time})`;
                    });
                    await sendFeedback(['📜 ' + t(lang, 'admin_warnings_header', { user: target.name }), ...lines].join('\n'));
                    break;
                }
                case 'purge': {
                    let count = parseInt(rest.shift(), 10);
                    if (!Number.isFinite(count) || count <= 0) count = 10;
                    count = Math.min(count, 100);
                    let deleted = 0;
                    const baseId = msg.reply_to_message?.message_id ?? msg.message_id;
                    for (let i = 0; i < count; i += 1) {
                        const targetMessageId = baseId - i - (msg.reply_to_message ? 0 : 1);
                        if (targetMessageId <= 0) break;
                        try {
                            await bot.deleteMessage(chatId, targetMessageId);
                            deleted += 1;
                        } catch (error) { break; }
                    }
                    try { await bot.deleteMessage(chatId, msg.message_id); } catch (error) { /* ignore */ }
                    await sendFeedback('🗑️ ' + t(lang, 'admin_purge_done', { count: deleted.toString() }));
                    break;
                }
                case 'set_captcha': {
                    const nextState = (rest.shift() || '').toLowerCase() === 'on';
                    await db.updateGroupBotSettings(chatId, { captchaEnabled: nextState });
                    await sendFeedback('🧩 ' + t(lang, 'admin_captcha_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'set_rules': {
                    const text = rest.join(' ') || msg.reply_to_message?.text;
                    if (!text) {
                        await sendFeedback('❓ ' + t(lang, 'admin_rules_missing'));
                        break;
                    }
                    await db.setGroupRules(chatId, text, adminId);
                    await sendFeedback('📜 ' + t(lang, 'admin_rules_updated'));
                    break;
                }
                case 'add_blacklist': {
                    const word = rest.join(' ');
                    if (!word) {
                        await sendFeedback('❓ ' + t(lang, 'admin_blacklist_missing'));
                        break;
                    }
                    await db.addBlacklistWord(chatId, word);
                    await sendFeedback('🚫 ' + t(lang, 'admin_blacklist_added', { word }));
                    break;
                }
                case 'remove_blacklist': {
                    const word = rest.join(' ');
                    if (!word) {
                        await sendFeedback('❓ ' + t(lang, 'admin_blacklist_missing'));
                        break;
                    }
                    await db.removeBlacklistWord(chatId, word);
                    await sendFeedback('✅ ' + t(lang, 'admin_blacklist_removed', { word }));
                    break;
                }
                case 'set_xp': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    const amountArg = rest.shift();
                    if (!target || !amountArg || !Number.isFinite(Number(amountArg))) {
                        await sendFeedback(t(lang, 'admin_set_xp_invalid'));
                        break;
                    }
                    await db.setMemberXp(chatId, target.id, Number(amountArg));
                    await sendFeedback('✨ ' + t(lang, 'admin_set_xp_success', {
                        user: target.name,
                        amount: amountArg
                    }));
                    break;
                }
                case 'update_info': {
                    await db.updateGroupBotSettings(chatId, { infoRefreshedAt: Date.now() });
                    await sendFeedback('🔄 ' + t(lang, 'admin_update_info_done'));
                    break;
                }
                case 'status': {
                    const settings = await db.getGroupBotSettings(chatId);
                    // Added icons to status lines
                    const lines = [
                        `📊 ${t(lang, 'admin_status_header', { chat: msg.chat.title || chatId })}`,
                        `🧩 ${t(lang, 'admin_status_line', { label: 'Captcha', value: settings.captchaEnabled ? 'ON' : 'OFF' })}`,
                        `🤖 ${t(lang, 'admin_status_line', { label: 'Predict', value: settings.predictEnabled ? 'ON' : 'OFF' })}`,
                        `✨ ${t(lang, 'admin_status_line', { label: 'XP React', value: settings.xpReactEnabled ? 'ON' : 'OFF' })}`,
                        `🐋 ${t(lang, 'admin_status_line', { label: 'Whale Alerts', value: settings.whaleWatchEnabled ? 'ON' : 'OFF' })}`,
                        `🕵️ ${t(lang, 'admin_status_line', { label: 'Tracked Wallets', value: (settings.trackedWallets?.length || 0).toString() })}`
                    ];
                    await sendFeedback(lines.join('\n'));
                    break;
                }
                case 'toggle_predict': {
                    const desired = (rest.shift() || '').toLowerCase();
                    const settings = await db.getGroupBotSettings(chatId);
                    let nextState = !settings.predictEnabled;
                    if (desired === 'on') nextState = true;
                    else if (desired === 'off') nextState = false;
                    await db.updateGroupBotSettings(chatId, { predictEnabled: nextState });
                    await sendFeedback('🔮 ' + t(lang, 'admin_predict_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'set_xp_react': {
                    const nextState = (rest.shift() || '').toLowerCase() === 'on';
                    await db.updateGroupBotSettings(chatId, { xpReactEnabled: nextState });
                    await sendFeedback('✨ ' + t(lang, 'admin_xp_react_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'whale': {
                    const desired = (rest.shift() || '').toLowerCase();
                    const settings = await db.getGroupBotSettings(chatId);
                    let nextState = !settings.whaleWatchEnabled;
                    if (desired === 'on') nextState = true;
                    else if (desired === 'off') nextState = false;
                    await db.updateGroupBotSettings(chatId, { whaleWatchEnabled: nextState });
                    await sendFeedback('🐋 ' + t(lang, 'admin_whale_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'draw': {
                    const prize = rest.shift();
                    const rules = rest.join(' ');
                    if (!prize) {
                        await sendFeedback(t(lang, 'admin_draw_invalid'));
                        break;
                    }
                    const candidates = await db.getTopCheckins(chatId, 50, 'points');
                    if (!candidates.length) {
                        await sendFeedback(t(lang, 'admin_draw_no_candidates'));
                        break;
                    }
                    const winner = candidates[Math.floor(Math.random() * candidates.length)];
                    await sendFeedback('🎉 ' + t(lang, 'admin_draw_result', { prize, winner: winner.userId, rules: rules || '—' }));
                    break;
                }
                case 'review_memes': {
                    const memes = await db.getPendingMemes(chatId);
                    if (!memes.length) {
                        await sendFeedback('📭 ' + t(lang, 'admin_review_memes_empty'));
                        break;
                    }
                    const lines = memes.map((meme) => `#${meme.id} - ${meme.content.slice(0, 80)}`);
                    await sendFeedback(['🖼️ ' + t(lang, 'admin_review_memes_header'), ...lines].join('\n'));
                    break;
                }
                case 'approve':
                case 'reject': {
                    const memeId = rest.shift();
                    if (!memeId) {
                        await sendFeedback(t(lang, 'admin_meme_invalid'));
                        break;
                    }
                    const status = command === 'approve' ? 'approved' : 'rejected';
                    const icon = status === 'approved' ? '✅' : '❌';
                    await db.updateMemeStatus(memeId, status);
                    await sendFeedback(`${icon} ` + t(lang, 'admin_review_memes_updated', { id: memeId, status }));
                    break;
                }
                case 'announce': {
                    const announcement = rest.join(' ') || msg.reply_to_message?.text;
                    if (!announcement) {
                        await sendFeedback(t(lang, 'admin_announce_missing'));
                        break;
                    }
                    await bot.sendMessage(chatId, t(lang, 'admin_announce_prefix', { message: announcement }), { allow_sending_without_reply: true });
                    await sendFeedback('📢 ' + t(lang, 'admin_announce_sent'));
                    break;
                }
                case 'track': {
                    const address = rest.shift();
                    const label = rest.join(' ') || 'Tracked Wallet';
                    const normalized = normalizeAddressSafe(address);
                    if (!normalized) {
                        await sendFeedback(t(lang, 'admin_track_invalid'));
                        break;
                    }
                    const settings = await db.getGroupBotSettings(chatId);
                    const list = Array.isArray(settings.trackedWallets) ? settings.trackedWallets : [];
                    const nextList = list.filter((entry) => entry.address?.toLowerCase() !== normalized.toLowerCase());
                    nextList.push({ address: normalized, name: label });
                    await db.updateGroupBotSettings(chatId, { trackedWallets: nextList });
                    await sendFeedback('🕵️ ' + t(lang, 'admin_track_added', { wallet: shortenAddress(normalized), name: label }));
                    break;
                }
                default:
                    await sendFeedback('❓ ' + t(lang, 'admin_action_unknown'));
                    break;
            }
        } catch (error) {
            log.child('AdminCommand').error(`Failed to execute ${command}: ${error.message}`);
            await sendFeedback('❌ ' + t(lang, 'admin_action_error'));
        }
    }

    // --- Admin Panel Display ---


    async function sendModerationAdminPanel(adminId, targetChatId, { fallbackLang, deliverToChatId, category = null, editMessage, threadId = null } = {}) {
        if (!adminId || !targetChatId) return { status: 'invalid' };

        const lang = await resolveNotificationLanguage(adminId, fallbackLang);
        const isAdminUserResult = await isUserAdmin(targetChatId, adminId);
        if (!isAdminUserResult) return { status: 'forbidden', lang };

        rememberAdminChat(adminId, { id: targetChatId, type: 'group' });

        let chatInfo = null;
        let adminList = [];
        let memberCount = '-';

        try { chatInfo = await bot.getChat(targetChatId); } catch (e) { log.child('AdminPanel').warn(`getChat failed: ${e.message}`); }
        try { adminList = await bot.getChatAdministrators(targetChatId); } catch (e) { log.child('AdminPanel').warn(`getChatAdmins failed: ${e.message}`); }
        try { memberCount = await bot.getChatMemberCount(targetChatId); } catch (e) { log.child('AdminPanel').warn(`getChatMemberCount failed: ${e.message}`); }

        const rawLink = chatInfo?.invite_link || (chatInfo?.username ? `https://t.me/${chatInfo.username}` : t(lang, 'admin_group_info_no_link'));
        const link = /^https?:\/\//i.test(rawLink || '') ? `<a href="${escapeHtml(rawLink)}">${escapeHtml(rawLink)}</a>` : escapeHtml(rawLink);

        const admins = (adminList || []).map((admin) => {
            const roleIcon = admin.status === 'creator' ? '👑' : '🛡️';
            const roleKey = admin.status === 'creator' ? 'admin_group_info_role_owner' : 'admin_group_info_role_admin';
            const roleLabel = t(lang, roleKey);
            const adminUserId = escapeHtml(admin.user?.id?.toString() || '');
            const name = escapeHtml(admin.user?.first_name || admin.user?.username || adminUserId || '');
            const username = admin.user?.username ? ` (@${escapeHtml(admin.user.username)})` : '';
            return `${roleIcon} ${roleLabel}: <b>${name}</b>${username} | ID: <code>${adminUserId}</code>`;
        });

        const groupTitle = escapeHtml(chatInfo?.title || chatInfo?.username || targetChatId);

        const infoLines = [
            `📛 <b>${groupTitle}</b>`,
            `🆔 <b>${t(lang, 'admin_group_info_label_id') || 'ID'}:</b> <code>${escapeHtml(targetChatId)}</code>`,
            `👥 <b>${t(lang, 'admin_group_info_label_members') || 'Members'}:</b> ${memberCount || '-'}`,
            `🔗 <b>${t(lang, 'admin_group_info_label_link') || 'Link'}:</b> ${link}`
        ];

        if (admins.length) {
            const adminsLabel = t(lang, 'admin_group_info_label_admins') || `Admins (${admins.length})`;
            infoLines.push('', `🛠️ <b>${adminsLabel}</b>`);
            infoLines.push(...admins);
        }

        if (category) {
            const descBlock = buildCategoryDescription(lang, category);
            if (descBlock) {
                infoLines.push('', descBlock);
            }
        }

        adminCommandContexts.set(adminId, targetChatId);

        const categoryKeyboard = buildCategoryKeyboard(lang, targetChatId, category);
        const fallbackText = t(lang, 'help_button_close') || 'Close';
        const replyMarkup = cloneInlineKeyboard({
            inline_keyboard: [
                [{ text: t(lang, 'admin_group_button_admin') || 'Admin', callback_data: `admin_cat|root|${targetChatId}` }],
                [{ text: t(lang, 'admin_group_button_broadcast_group') || 'Broadcast Group', callback_data: `admin_broadcast|${targetChatId}|group` }],
                [{ text: t(lang, 'admin_group_button_broadcast_direct') || 'Broadcast DM', callback_data: `admin_broadcast|${targetChatId}|direct` }],
                ...(category ? [] : [[{ text: t(lang, 'help_child_command_hint') || 'Commands', callback_data: 'help_separator' }]]),
                ...categoryKeyboard.inline_keyboard
            ]
        }, { fallbackText });

        const destinationChatId = deliverToChatId || adminId;
        const textBlock = infoLines.join('\n');

        const effectiveThreadId = threadId ?? extractThreadId(editMessage);

        if (editMessage?.message_id && editMessage?.chat?.id) {
            try {
                await bot.editMessageText(textBlock, {
                    chat_id: editMessage.chat.id,
                    message_id: editMessage.message_id,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                });
                return { status: 'updated', lang };
            } catch (error) {
                const description = error?.response?.body?.description || error?.message || '';
                if (/message is not modified/i.test(description)) {
                    return { status: 'updated', lang };
                }
                log.child('AdminPanel').error(`Failed to edit panel: ${error.message}`);
                // Fallback: send a fresh panel in the same chat/thread
                try {
                    await sendSafeInlineKeyboardMessage(deliverToChatId || editMessage.chat.id, textBlock, replyMarkup, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        ...(effectiveThreadId !== null && effectiveThreadId !== undefined ? { message_thread_id: effectiveThreadId } : {})
                    }, lang);
                    return { status: 'sent', lang };
                } catch (fallbackError) {
                    log.child('AdminPanel').error(`Fallback send failed: ${fallbackError.message}`);
                    return { status: 'error', lang };
                }
            }
        }

        try {
            await sendSafeInlineKeyboardMessage(destinationChatId, textBlock, replyMarkup, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...(effectiveThreadId !== null && effectiveThreadId !== undefined ? { message_thread_id: effectiveThreadId } : {})
            }, lang);
            return { status: 'sent', lang };
        } catch (error) {
            const statusCode = error?.response?.statusCode;
            const status = statusCode === 403 ? 'dm_blocked' : 'error';
            log.child('AdminPanel').error(`Failed to send panel: ${error.message}`);
            return { status, lang };
        }
    }
    // --- Help Menu Launcher ---

    async function launchAdminHelpMenu({ actorId, chat, lang, replyMessage } = {}) {
        const chatId = chat?.id;
        const chatType = chat?.type;
        if (!actorId || !chatId || !chatType) return { status: 'invalid' };

        const fallbackLang = lang;
        if (chatType === 'private') {
            try {
                await openAdminHub(actorId, { fallbackLang, mode: 'moderation' });
                return { status: 'dm_opened' };
            } catch (error) {
                return { status: 'error' };
            }
        }

        const isGroupChat = ['group', 'supergroup'].includes(chatType);
        const replyLang = isGroupChat ? await resolveGroupLanguage(chatId, defaultLang) : await getLang(replyMessage);
        if (!isGroupChat) return { status: 'invalid_chat' };

        const isAdmin = await isUserAdmin(chatId, actorId);
        if (!isAdmin) {
            if (replyMessage?.message_id) {
                await bot.sendMessage(chatId, t(replyLang, 'owner_not_allowed'), { reply_to_message_id: replyMessage.message_id, allow_sending_without_reply: true });
            }
            return { status: 'forbidden' };
        }

        rememberAdminChat(actorId, chat);
        try { await db.ensureCheckinGroup(chatId.toString()); } catch (error) { }

        try {
            const panelResult = await sendModerationAdminPanel(actorId, chatId, {
                fallbackLang,
                deliverToChatId: chatId,
                threadId: extractThreadId(replyMessage),
                editMessage: replyMessage
            });
            if (panelResult.status === 'dm_blocked') return { status: 'error' };
            return { status: panelResult.status };
        } catch (error) {
            return { status: 'error' };
        }
    }

    async function handleAdminCommand(msg, { targetChatId } = {}) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const chatType = msg.chat.type;
        const userLang = await getLang(msg);

        if (!userId) return;
        if (await enforceOwnerCommandLimit(msg, 'checkinadmin')) return;

        if (chatType === 'private') {
            const lang = await resolveNotificationLanguage(userId, userLang);
            if (!targetChatId) {
                try { await openAdminHub(userId, { fallbackLang: lang }); } catch (error) { await sendReply(msg, t(lang, 'checkin_admin_command_error')); }
                return;
            }
            const isAdminUser = await isGroupAdmin(targetChatId, userId);
            if (!isAdminUser) {
                await sendReply(msg, t(lang, 'checkin_admin_menu_no_permission'));
                return;
            }
            try {
                adminCommandContexts.set(userId, targetChatId);
                await openAdminHub(userId, { fallbackLang: lang });
                await sendAdminMenu(userId, targetChatId, { fallbackLang: lang });
                await sendReply(msg, t(lang, 'checkin_admin_menu_opening'));
            } catch (error) {
                await sendReply(msg, t(lang, 'checkin_admin_command_error'));
            }
            return;
        }

        const isGroupChat = ['group', 'supergroup'].includes(chatType);
        const replyLang = isGroupChat ? await resolveGroupLanguage(chatId, defaultLang) : await getLang(msg);

        if (!isGroupChat) {
            await sendReply(msg, t(replyLang, 'checkin_admin_command_group_only'));
            return;
        }

        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await bot.sendMessage(chatId, t(replyLang, 'checkin_admin_menu_no_permission'), { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
            return;
        }

        try { await db.ensureCheckinGroup(chatId.toString()); } catch (error) { }

        try {
            await openAdminHub(userId, { fallbackLang: userLang });
            await sendAdminMenu(userId, chatId, { fallbackLang: userLang });
            await bot.sendMessage(chatId, t(replyLang, 'checkin_admin_command_dm_notice'), { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
        } catch (error) {
            const statusCode = error?.response?.statusCode;
            const errorKey = statusCode === 403 ? 'checkin_admin_command_dm_error' : 'checkin_admin_command_error';
            await bot.sendMessage(chatId, t(replyLang, errorKey), { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
        }
    }

    // --- Context Utils ---

    function getAdminTargetChatId(msg) {
        return msg?._adminTargetChatId || msg?.chat?.id;
    }

    function getAdminContextChatId(userId) {
        return userId ? (adminCommandContexts.get(userId) || null) : null;
    }

    function clearAdminContext(userId) {
        if (userId) adminCommandContexts.delete(userId);
    }

    async function ensureAdminOrOwner(msg, { allowPrivateHelp = false } = {}) {
        const chat = msg.chat;
        const chatId = chat?.id;
        const userId = msg.from?.id;
        if (!chatId || !userId) return false;

        if (hasOwnerOverride(msg)) {
            msg._adminTargetChatId = msg._adminTargetChatId || chatId;
            rememberAdminChat(msg.ownerExecutorId, chat);
            return true;
        }

        if (chat.type === 'private') {
            const targetChatId = adminCommandContexts.get(userId);
            if (targetChatId) {
                const isAdmin = await isUserAdmin(targetChatId, userId);
                if (isAdmin) {
                    msg._adminTargetChatId = targetChatId;
                    rememberAdminChat(userId, { id: targetChatId, type: 'group' });
                    return true;
                }
            }
            if (allowPrivateHelp) return true;
            await sendReply(msg, t(await getLang(msg), 'admin_dm_prompt'));
            return false;
        }

        if (await isUserAdmin(chatId, userId)) {
            rememberAdminChat(userId, chat);
            return true;
        }
        await sendReply(msg, t(await getLang(msg), 'owner_not_allowed'));
        return false;
    }

    return {
        handleAdminActionCommand,
        handleAdminCommand,
        ensureAdminOrOwner,
        getAdminTargetChatId,
        sendModerationAdminPanel,
        launchAdminHelpMenu,
        buildAdminCommandDetail,
        getAdminContextChatId,
        clearAdminContext
    };
}

module.exports = { createAdminHandlers };
