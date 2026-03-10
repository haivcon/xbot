const logger = require('../core/logger');
const log = logger.child('ModerationCommands');

function registerModerationCommands(deps = {}) {
    const {
        bot,
        enforceBanForMessage,
        ensureAdminOrOwner,
        getAdminTargetChatId,
        parseTargetFromCommand,
        resolveTargetId,
        getGroupSettings,
        parseDuration,
        clearScheduledUnmute,
        scheduleAutomaticUnmute,
        getWarnState,
        applyWarnAction,
        getLang,
        t,
        resolveGroupLanguage,
        defaultLang,
        isGroupAdmin,
        db,
        openAdminHub,
        sendWelcomeAdminMenu,
        sendReply,
        ensureFilterState,
        getFilterState,
        normalizeFilterResponse,
        filterSetupStates,
        escapeHtml,
        resolveUserProfile
    } = deps;

    if (!bot) throw new Error('bot is required for moderation commands');

    bot.onText(/^\/ban(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Không tìm thấy người dùng để cấm.');
            return;
        }

        const settings = getGroupSettings(targetChatId);
        settings.bannedUsers.add(userId);
        await bot.banChatMember(targetChatId, userId, { revoke_messages: true });
        await sendReply(msg, `Đã cấm ${userId}.`);
    });

    bot.onText(/^\/unban(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Không tìm thấy người dùng để gỡ cấm.');
            return;
        }

        const settings = getGroupSettings(targetChatId);
        settings.bannedUsers.delete(userId);
        await bot.unbanChatMember(targetChatId, userId, { only_if_banned: true });
        await sendReply(msg, `Đã gỡ cấm ${userId}.`);
    });

    bot.onText(/^\/unbanall(?:@[\w_]+)?(?:\s*)$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        for (const userId of settings.bannedUsers) {
            await bot.unbanChatMember(targetChatId, userId, { only_if_banned: true }); // eslint-disable-line no-await-in-loop
        }
        settings.bannedUsers.clear();
        await sendReply(msg, 'Đã gỡ cấm cho tất cả người dùng đã bị cấm bởi bot.');
    });

    bot.onText(/^\/kick(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Không tìm thấy người dùng để đuổi.');
            return;
        }

        await bot.banChatMember(targetChatId, userId, { until_date: Math.floor(Date.now() / 1000) + 60 });
        await bot.unbanChatMember(targetChatId, userId, { only_if_banned: true });
        await sendReply(msg, `Đã đuổi ${userId}.`);
    });

    bot.onText(/^\/muteall(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.muteAll = true;
        await bot.setChatPermissions(targetChatId, { can_send_messages: false });
        await sendReply(msg, 'Đã tắt quyền gửi tin nhắn của mọi thành viên.');
    });

    bot.onText(/^\/unmuteall(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.muteAll = false;
        await bot.setChatPermissions(targetChatId, { can_send_messages: true });
        await sendReply(msg, 'Đã mở lại quyền gửi tin nhắn cho mọi thành viên.');
    });

    bot.onText(/^\/mute(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const parts = (msg.text || '').split(/\s+/).filter(Boolean);
        const duration = parseDuration(parts[2] || parts[1]);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const targetChatId = getAdminTargetChatId(msg);
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Không tìm thấy người dùng để cấm nói.');
            return;
        }

        const until = Math.floor(Date.now() / 1000) + duration;
        clearScheduledUnmute(targetChatId, userId);
        await bot.restrictChatMember(targetChatId, userId, { until_date: until, permissions: { can_send_messages: false } });
        scheduleAutomaticUnmute(targetChatId, userId, duration);
        await sendReply(msg, `Đã cấm nói ${userId} trong ${duration} giây.`);
    });

    bot.onText(/^\/unmute(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, 'Không tìm thấy người dùng để gỡ cấm nói.');
            return;
        }

        clearScheduledUnmute(targetChatId, userId);
        await bot.restrictChatMember(targetChatId, userId, { permissions: { can_send_messages: true } });
        await sendReply(msg, `Đã gỡ cấm nói ${userId}.`);
    });

    bot.onText(/^\/warn(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }

        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, t(lang, 'help_action_not_available'));
            return;
        }

        const reason = (msg.text || '').split(/\s+/).slice(1).join(' ').trim() || 'No reason provided';
        const warnState = getWarnState(targetChatId);
        const current = warnState.get(userId) || { count: 0, reasons: [] };
        current.count += 1;
        current.reasons.push(reason);
        warnState.set(userId, current);

        const settings = getGroupSettings(targetChatId);
        await sendReply(msg, `Người dùng ${userId} đã bị cảnh cáo (${current.count}/${settings.warnLimit}) vì ${reason}.`);
        if (current.count >= settings.warnLimit) {
            await applyWarnAction(targetChatId, userId, settings.warnAction);
            await sendReply(msg, `Đã áp dụng hình phạt ${settings.warnAction} cho ${userId}.`);
        }
    });

    bot.onText(/^\/warnings(?:@[\w_]+)?(?:\s+.+)?$/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const target = parseTargetFromCommand(msg, msg.text || '');
        const warnState = getWarnState(targetChatId);
        if (target) {
            const userId = await resolveTargetId(targetChatId, target);
            const entry = userId ? warnState.get(userId) : null;
            if (!entry) {
                await sendReply(msg, 'Không có cảnh cáo.');
                return;
            }
            await sendReply(msg, `Cảnh cáo cho ${userId}: ${entry.count}\n${entry.reasons.join('\n')}`);
            return;
        }

        if (!warnState.size) {
            await sendReply(msg, 'Chưa có cảnh cáo nào.');
            return;
        }

        const lines = [];
        for (const [userId, entry] of warnState.entries()) {
            lines.push(`${userId}: ${entry.count}`);
        }
        await sendReply(msg, lines.join('\n'));
    });

    bot.onText(/^\/setwarnlimit(?:@[\w_]+)?\s+(\d+)(?:\s+(\w+))?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const limit = Number(match[1]);
        const action = (match[2] || 'ban').toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.warnLimit = Number.isFinite(limit) && limit > 0 ? limit : settings.warnLimit;
        settings.warnAction = ['ban', 'kick', 'mute'].includes(action) ? action : settings.warnAction;
        await sendReply(msg, `Đã đặt giới hạn cảnh cáo ${settings.warnLimit} và hình phạt ${settings.warnAction}.`);
    });

    bot.onText(/^\/setwelcome(?:@[\w_]+)?\s+([\s\S]+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.welcomeMessage = match[1];
        await sendReply(msg, 'Đã lưu lời chào mời.');
    });

    bot.onText(/^\/welcome(?:@[\w_]+)?$/, async (msg) => {
        if (await enforceBanForMessage(msg)) {
            return;
        }

        const userId = msg.from?.id;
        const chatId = msg.chat?.id;
        const chatType = msg.chat?.type;
        const fallbackLang = msg.from?.language_code;

        if (!userId) {
            return;
        }

        if (chatType === 'private') {
            const lang = await getLang(msg);
            try {
                await openAdminHub(userId, { fallbackLang: lang, mode: 'welcome' });
            } catch (error) {
                log.child('WelcomeCommand').error(`Failed to open hub in DM for ${userId}: ${error.message}`);
                await sendReply(msg, t(lang, 'welcome_admin_dm_error'));
            }
            return;
        }

        const isGroupChat = ['group', 'supergroup'].includes(chatType || '');
        const replyLang = isGroupChat
            ? await resolveGroupLanguage(chatId, defaultLang)
            : await getLang(msg);

        if (!isGroupChat) {
            await sendReply(msg, t(replyLang, 'welcome_admin_group_only'));
            return;
        }

        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await sendReply(msg, t(replyLang, 'welcome_admin_no_permission'));
            return;
        }

        try {
            await db.ensureCheckinGroup(chatId.toString());
        } catch (error) {
            log.child('WelcomeCommand').error(`Failed to register group ${chatId}: ${error.message}`);
        }

        try {
            await openAdminHub(userId, { fallbackLang, mode: 'welcome' });
            await sendWelcomeAdminMenu(userId, chatId, { fallbackLang: replyLang });
            await sendReply(msg, t(replyLang, 'welcome_admin_dm_notice'));
        } catch (error) {
            log.child('WelcomeCommand').error(`Failed to send welcome admin menu for ${userId} in ${chatId}: ${error.message}`);
            await sendReply(msg, t(replyLang, 'welcome_admin_dm_error'));
        }
    });

    bot.onText(/^\/del(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const replyId = msg.reply_to_message?.message_id;
        if (!replyId) {
            await sendReply(msg, 'Hãy reply vào tin nhắn cần xóa.');
            return;
        }
        await bot.deleteMessage(msg.chat.id, replyId).catch(() => { });
        await bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => { });
    });

    bot.onText(/^\/dela(?:@[\w_]+)?(?:\s+(\d+))?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const replyId = msg.reply_to_message?.message_id;
        if (!replyId) {
            await sendReply(msg, 'Hay reply vao tin nhan goc de xoa hang loat.');
            return;
        }
        const count = Number(match[1] || '0') || 0;
        const total = count > 0 ? count : 50;
        for (let i = 0; i < total; i += 1) {
            const id = replyId + i;
            await bot.deleteMessage(msg.chat.id, id).catch(() => { });
        }
        await bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => { });
    });

    bot.onText(/^\/info(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const chatType = msg.chat?.type;
        const chatId = msg.chat?.id;
        const targetChatId = chatId || getAdminTargetChatId(msg);
        const rawText = msg.text || '';
        const tokens = rawText.split(/\s+/).filter(Boolean);
        const inTopic = Object.prototype.hasOwnProperty.call(msg, 'message_thread_id') && msg.message_thread_id !== undefined && msg.message_thread_id !== null;
        const targetFromArgs = tokens.length >= 2 ? parseTargetFromCommand(msg, rawText) : null;
        const replyTo = msg.reply_to_message;
        const replyIsTopicMessage = replyTo?.is_topic_message;
        const replyIsBot = replyTo?.from?.is_bot;
        const targetFromReply = replyTo?.from?.id && !replyIsTopicMessage && !replyIsBot
            ? { id: replyTo.from.id }
            : null;
        // In topics, only consider explicit args; ignore reply auto-target to avoid topic header/user bleed-through.
        const hasExplicitTarget = tokens.length >= 2 ? Boolean(targetFromArgs) : (!inTopic && Boolean(targetFromReply));
        const target = hasExplicitTarget ? (targetFromArgs || targetFromReply) : null;

        // Group info view when no explicit target/reply
        if (!hasExplicitTarget && ['group', 'supergroup'].includes(chatType || '')) {
            const chatIdStr = targetChatId?.toString();
            try {
                const topicId = Object.prototype.hasOwnProperty.call(msg, 'message_thread_id')
                    ? msg.message_thread_id
                    : (msg.reply_to_message?.message_thread_id ?? null);
                const chatInfo = await bot.getChat(targetChatId);
                let memberCount = '-';
                try {
                    memberCount = await bot.getChatMemberCount(targetChatId);
                } catch (err) {
                    try { memberCount = await bot.getChatMembersCount(targetChatId); } catch (e) { memberCount = '-'; }
                }
                const adminList = await bot.getChatAdministrators(targetChatId).catch(() => []);
                const linkRaw = chatInfo?.invite_link || (chatInfo?.username ? `https://t.me/${chatInfo.username}` : '');
                const link = linkRaw
                    ? (/^https?:\/\//i.test(linkRaw) ? `<a href="${escapeHtml(linkRaw)}">${escapeHtml(linkRaw)}</a>` : escapeHtml(linkRaw))
                    : t(lang, 'admin_group_info_no_link') || 'N/A';

                const admins = (adminList || []).map((admin) => {
                    const roleIcon = admin.status === 'creator' ? '👑' : '🛡️';
                    const name = escapeHtml(admin.user?.first_name || admin.user?.username || admin.user?.id?.toString() || '');
                    const username = admin.user?.username ? ` (@${escapeHtml(admin.user.username)})` : '';
                    const idLabel = admin.user?.id ? ` | ID: <code>${escapeHtml(admin.user.id.toString())}</code>` : '';
                    return `${roleIcon} ${name}${username}${idLabel}`;
                });

                let topicLine = null;
                let topicLinkLine = null;
                if (topicId !== null && topicId !== undefined) {
                    let topicTitle = '';
                    if (typeof bot.getForumTopic === 'function') {
                        try {
                            const topic = await bot.getForumTopic(targetChatId, topicId);
                            topicTitle = topic?.name || '';
                        } catch (err) {
                            // ignore fetch topic errors
                        }
                    }
                    topicLine = topicTitle
                        ? `🧵 <b>${escapeHtml(t(lang, 'admin_group_info_label_topic') || 'Topic')}:</b> ${escapeHtml(topicTitle)} (#${topicId})`
                        : `🧵 <b>${escapeHtml(t(lang, 'admin_group_info_label_topic') || 'Topic')}:</b> #${topicId}`;

                    // Build topic link if possible
                    const topicLink = (() => {
                        if (chatInfo?.username) {
                            return `https://t.me/${chatInfo.username}/${topicId}`;
                        }
                        const idStr = chatIdStr || '';
                        if (idStr.startsWith('-100')) {
                            return `https://t.me/c/${idStr.slice(4)}/${topicId}`;
                        }
                        return null;
                    })();
                    if (topicLink) {
                        topicLinkLine = `🔗 <b>${escapeHtml(t(lang, 'admin_group_info_label_topic_link') || 'Topic link')}:</b> <a href="${escapeHtml(topicLink)}">${escapeHtml(t(lang, 'admin_group_info_open') || 'Open')}</a>`;
                    }
                }

                const infoLines = [
                    `📛 <b>${escapeHtml(chatInfo?.title || chatIdStr || 'Group')}</b>`,
                    `🆔 <b>${escapeHtml(t(lang, 'admin_group_info_label_id') || 'ID')}:</b> <code>${escapeHtml(chatIdStr || '')}</code>`,
                    `🔗 <b>${escapeHtml(t(lang, 'admin_group_info_label_link') || 'Link')}:</b> ${link}`,
                    `👥 <b>${escapeHtml(t(lang, 'admin_group_info_label_members') || 'Members')}:</b> ${memberCount}`
                ];
                if (topicLine) {
                    infoLines.push(topicLine);
                }
                if (topicLinkLine) {
                    infoLines.push(topicLinkLine);
                }
                if (admins.length) {
                    const adminsLabel = escapeHtml(t(lang, 'admin_group_info_label_admins') || 'Admins');
                    infoLines.push('', `🛠️ <b>${adminsLabel}</b>`, ...admins);
                }

                const replyMarkup = {
                    inline_keyboard: [
                        [{ text: t(lang, 'admin_group_button_admin') || 'Admin', callback_data: `admin_cat|root|${chatIdStr}` }],
                        [{ text: t(lang, 'help_button_close') || 'Close', callback_data: 'help_close' }]
                    ]
                };

                const options = {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                };
                if (topicId !== null && topicId !== undefined) {
                    options.message_thread_id = topicId;
                }

                await sendReply(msg, infoLines.join('\n'), options);
            } catch (error) {
                await sendReply(msg, t(lang, 'help_action_failed'));
            }
            return;
        }

        // User info view
        const userId = await resolveTargetId(targetChatId, target);
        if (!userId) {
            await sendReply(msg, t(lang, 'help_action_not_available'));
            return;
        }

        const warnState = getWarnState(targetChatId);
        const warnings = warnState.get(userId) || { count: 0 };
        const profile = await resolveUserProfile(targetChatId, userId);
        const lines = [];
        const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
        if (name) {
            lines.push(`👤 <b>${escapeHtml(name)}</b>`);
        }
        if (profile?.username) {
            lines.push(`🔖 @${escapeHtml(profile.username)}`);
        }
        lines.push(`🆔 <code>${escapeHtml(userId.toString())}</code>`);
        lines.push(`⚠️ ${t(lang, 'admin_warnings_label') || 'Warnings'}: ${warnings.count}`);

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🚫 Ban', callback_data: `admin_action|ban|${userId}|${targetChatId}` },
                    { text: '👢 Kick', callback_data: `admin_action|kick|${userId}|${targetChatId}` },
                    { text: '🤐 Mute', callback_data: `admin_action|mute|${userId}|${targetChatId}` }
                ],
                [
                    { text: '⚠️ Warn', callback_data: `admin_action|warn|${userId}|${targetChatId}` },
                    { text: '🔊 Unmute', callback_data: `admin_action|unmute|${userId}|${targetChatId}` },
                    { text: '🗑️ Del', callback_data: `admin_action|del|${userId}|${targetChatId}` }
                ],
                [
                    { text: '📊 Warnings', callback_data: 'admin_action|warnings' }
                ]
            ]
        };

        await sendReply(msg, lines.join('\n'), { reply_markup: keyboard, parse_mode: 'HTML', disable_web_page_preview: true });
    });

    bot.onText(/^\/lock(?:@[\w_]+)?\s+links/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.enabled = true;
        await sendReply(msg, 'Da bat khoa link.');
    });

    bot.onText(/^\/setlinkaction(?:@[\w_]+)?\s+(\w+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const action = match[1].toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.action = ['warn', 'mute', 'kick', 'ban', 'delete'].includes(action)
            ? action
            : settings.linkLock.action;
        await sendReply(msg, `Da dat hanh dong voi link: ${settings.linkLock.action}.`);
    });

    bot.onText(/^\/unlock(?:@[\w_]+)?\s+links/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.enabled = false;
        await sendReply(msg, 'Da mo khoa link.');
    });

    bot.onText(/^\/link(?:@[\w_]+)?\s+(.+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.linkLock.allowlist.add(match[1].trim());
        await sendReply(msg, 'Da them lien ket vao danh sach an toan.');
    });

    bot.onText(/^\/lock(?:@[\w_]+)?\s+(photos|videos|stickers|documents)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const type = match[1];
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.fileLocks[type] = true;
        await sendReply(msg, `Da khoa ${type}.`);
    });

    bot.onText(/^\/unlock(?:@[\w_]+)?\s+files/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.fileLocks = { photos: false, videos: false, stickers: false, documents: false };
        await sendReply(msg, 'Da mo khoa tat ca tep.');
    });

    bot.onText(/^\/setflood(?:@[\w_]+)?\s+(\d+)\/(\d+)s?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.flood.enabled = true;
        settings.flood.limit = Number(match[1]);
        settings.flood.windowSeconds = Number(match[2]);
        await sendReply(msg, `Da dat gioi han flood ${settings.flood.limit}/${settings.flood.windowSeconds}s.`);
    });

    bot.onText(/^\/setfloodaction(?:@[\w_]+)?\s+(\w+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const action = match[1].toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.flood.action = ['mute', 'kick', 'ban', 'delete'].includes(action) ? action : settings.flood.action;
        await sendReply(msg, `Da dat hanh dong chong flood: ${settings.flood.action}.`);
    });

    bot.onText(/^\/flood(?:@[\w_]+)?\s+(on|off)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        settings.flood.enabled = match[1] === 'on';
        await sendReply(msg, settings.flood.enabled ? 'Da bat chong flood.' : 'Da tat chong flood.');
    });

    bot.onText(/^\/antiflood(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        const summary = [
            `Trang thai: ${settings.flood.enabled ? 'on' : 'off'}`,
            `Gioi han: ${settings.flood.limit}/${settings.flood.windowSeconds}s`,
            `Hanh dong: ${settings.flood.action}`,
            'Thay doi voi /setflood, /setfloodaction hoac /flood on|off.'
        ].join('\n');
        await sendReply(msg, summary);
    });

    bot.onText(/^\/rules(?:@[\w_]+)?(?:\s+([\s\S]+))?/, async (msg, match) => {
        const text = match[1];
        const targetChatId = getAdminTargetChatId(msg);
        const settings = getGroupSettings(targetChatId);
        if (text) {
            if (!(await ensureAdminOrOwner(msg))) {
                return;
            }
            settings.rulesText = text.trim();
            await sendReply(msg, 'Da luu noi quy nhom.');
            return;
        }
        if (settings.rulesText) {
            await sendReply(msg, settings.rulesText, {
                reply_markup: { inline_keyboard: [[{ text: '/rules', callback_data: 'admin_action|rules' }]] }
            });
        } else {
            await sendReply(msg, 'Chua co noi quy.');
        }
    });

    function trimFilterEntities(entities, startOffset = 0) {
        if (!Array.isArray(entities) || !entities.length) {
            return [];
        }

        const trimmed = [];
        for (const entity of entities) {
            if (!entity || typeof entity.offset !== 'number' || typeof entity.length !== 'number') {
                continue;
            }
            const entityStart = entity.offset;
            const entityEnd = entity.offset + entity.length;
            if (entityEnd <= startOffset) {
                continue;
            }

            const offset = Math.max(0, entityStart - startOffset);
            const length = entityEnd - Math.max(entityStart, startOffset);
            if (length <= 0) {
                continue;
            }

            trimmed.push({ ...entity, offset, length });
        }

        return trimmed;
    }

    function buildFiltersListView(lang, chatId) {
        const filters = getFilterState(chatId);
        if (!filters.size) {
            return {
                text: t(lang, 'admin_filters_empty'),
                reply_markup: { inline_keyboard: [[{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]] }
            };
        }

        const lines = [t(lang, 'admin_filters_title')];
        const inline_keyboard = [];
        const entries = Array.from(filters.entries());

        entries.forEach(([keyword, response]) => {
            const preview = (response?.text || response || '').toString();
            const short = preview.length > 64 ? `${preview.slice(0, 61)}…` : preview;
            lines.push(`• <code>${escapeHtml(keyword)}</code> : ${escapeHtml(short || t(lang, 'admin_filters_no_content'))}`);
        });

        lines.push('', escapeHtml(t(lang, 'admin_filters_remove_hint')));

        for (let i = 0; i < entries.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, entries.length); j += 1) {
                const [keyword] = entries[j];
                row.push({ text: `/filters ${keyword}`, callback_data: `filter_remove|${chatId}|${keyword}` });
            }
            inline_keyboard.push(row);
        }

        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]);

        return { text: lines.join('\n'), reply_markup: { inline_keyboard } };
    }

    bot.onText(/^\/filter(?:@[\w_]+)?\s+(\S+)(?:\s+([\s\S]+))?/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const keyword = match[1].toLowerCase();
        const inlinePayload = normalizeFilterResponse(match[2], keyword);
        const targetChatId = getAdminTargetChatId(msg);
        const filters = await ensureFilterState(targetChatId);

        if (inlinePayload) {
            const inlineStart = msg.text?.indexOf(match[2]) ?? -1;
            const entities = inlineStart >= 0
                ? trimFilterEntities(msg.entities || [], inlineStart)
                : [];
            filters.set(keyword, { text: inlinePayload, entities });
            await db.upsertFilter(targetChatId, keyword, inlinePayload, entities);
            await sendReply(msg, t(lang, 'admin_filter_saved', { keyword: escapeHtml(keyword) }));
            return;
        }

        filterSetupStates.set(msg.from.id, { chatId: targetChatId, keyword });
        await sendReply(msg, t(lang, 'admin_filter_prompt', { keyword: escapeHtml(keyword) }));
    });

    bot.onText(/^\/filters(?:@[\w_]+)?(?:\s|$)/, async (msg) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const targetChatId = getAdminTargetChatId(msg);
        await ensureFilterState(targetChatId);
        const view = buildFiltersListView(lang, targetChatId);
        await sendReply(msg, view.text, { reply_markup: view.reply_markup, parse_mode: 'HTML' });
    });

    bot.onText(/^\/filterx(?:@[\w_]+)?\s+(\S+)/, async (msg, match) => {
        if (!(await ensureAdminOrOwner(msg))) {
            return;
        }
        const lang = await getLang(msg);
        const keyword = match[1].toLowerCase();
        const targetChatId = getAdminTargetChatId(msg);
        const filters = await ensureFilterState(targetChatId);
        if (!filters.has(keyword)) {
            await sendReply(msg, t(lang, 'admin_filter_missing', { keyword: escapeHtml(keyword) }));
            return;
        }
        filters.delete(keyword);
        await db.deleteFilter(targetChatId, keyword);
        await sendReply(msg, t(lang, 'admin_filter_removed', { keyword: escapeHtml(keyword) }));
    });

    return { buildFiltersListView };
}

module.exports = registerModerationCommands;
