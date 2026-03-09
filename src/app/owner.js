const logger = require('../core/logger');
const log = logger.child('Owner');

function createOwnerFeature(deps) {
    const {
        t,
        defaultLang,
        resolveLangCode,
        formatCommandLabel,
        formatMarkdownTableBlock,
        escapeHtml,
        formatCopyableValueHtml,
        buildCloseKeyboard,
        buildDeviceTargetId,
        isOwner,
        banUser,
        unbanUser,
        registerCoOwner,
        revokeCoOwner,
        clearOwnerAction,
        getLang,
        sendReply,
        parseAiApiSubmission,
        normalizeAiProvider,
        isUserApiKeyValid,
        OWNER_COMMAND_LIMIT_KEY,
        DOREMON_COMMAND_LIMIT_KEY,
        ADDITIONAL_OWNER_USERNAME,
        BOT_OWNER_ID,
        BOT_ID,
        GEMINI_API_KEYS,
        GROQ_API_KEYS,
        ownerActionStates,
        coOwnerIds,
        bannedUserIds,
        bannedDeviceIds,
        ownerPasswordPrompts,
        bot,
        db,
        sanitizeSecrets,
        createOwnerListState,
        renderOwnerListState,
        updateOwnerListState,
        getOwnerListState
    } = deps;

    const OWNER_TABLE_LAYOUT = {
        maxWidth: 72,
        targetWidth: 70,
        maxColumnWidth: 32,
        minColumnWidth: 8,
        borderStyle: 'unicode'
    };

    const OWNER_MENU_ACTIONS = {
        broadcast: { icon: '\uD83D\uDCE2', labelKey: 'owner_action_broadcast', descKey: 'owner_action_broadcast_desc', callback: 'owner_menu|broadcast' },
        group_stats: { icon: '\uD83D\uDCCA', labelKey: 'owner_menu_group_stats', descKey: 'owner_action_group_stats_desc', callback: 'owner_menu|group_stats' },
        run_command: { icon: '\u26A1', labelKey: 'owner_menu_run_command', descKey: 'owner_action_run_command_desc', callback: 'owner_menu|run_command' },
        ai_stats: { icon: '\uD83E\uDD16', labelKey: 'owner_menu_ai_stats', descKey: 'owner_action_ai_stats_desc', callback: 'owner_ai_command|stats' },
        api_stats: { icon: '\uD83D\uDD11', labelKey: 'owner_menu_api_stats', descKey: 'owner_action_api_stats_desc', callback: 'owner_api|stats' },
        ai_limit: { icon: '\uD83D\uDEA6', labelKey: 'owner_menu_ai_limit', descKey: 'owner_action_ai_limit_desc', callback: 'owner_ai_command|limit' },
        ai_unlimit: { icon: '\u267B', labelKey: 'owner_menu_ai_unlimit', descKey: 'owner_action_ai_unlimit_desc', callback: 'owner_ai_command|unlimit' },
        command_stats: { icon: '\uD83D\uDCC8', labelKey: 'owner_menu_command_stats', descKey: 'owner_action_command_stats_desc', callback: 'owner_command|stats' },
        command_limit: { icon: '\u23F1\uFE0F', labelKey: 'owner_command_button_limit', descKey: 'owner_action_command_limit_desc', callback: 'owner_command|limit' },
        command_unlimit: { icon: '\uD83D\uDD13', labelKey: 'owner_command_button_unlimit', descKey: 'owner_action_command_unlimit_desc', callback: 'owner_command|unlimit' },
        doremon_limit: { icon: '\uD83C\uDFAF', labelKey: 'owner_menu_doremon_limit', descKey: 'owner_action_doremon_limit_desc', callback: 'owner_doremon|limit' },
        doremon_unlimit: { icon: '\uD83E\uDE81', labelKey: 'owner_menu_doremon_unlimit', descKey: 'owner_action_doremon_unlimit_desc', callback: 'owner_doremon|unlimit' },
        check_users: { icon: '\uD83D\uDD75\uFE0F', labelKey: 'owner_menu_check_users', descKey: 'owner_action_check_users_desc', callback: 'owner_menu|check_users' },
        coowner_grant: { icon: '\u2795', labelKey: 'owner_menu_coowner_grant', descKey: 'owner_action_coowner_grant_desc', callback: 'owner_menu|coowner_grant' },
        coowner_revoke: { icon: '\u2796', labelKey: 'owner_menu_coowner_revoke', descKey: 'owner_action_coowner_revoke_desc', callback: 'owner_menu|coowner_revoke' },
        ban: { icon: '\u26D4', labelKey: 'owner_menu_ban', descKey: 'owner_action_ban_desc', callback: 'owner_menu|ban' },
        unban: { icon: '\u2705', labelKey: 'owner_menu_unban', descKey: 'owner_action_unban_desc', callback: 'owner_menu|unban' },
        reset_id: { icon: '\uD83D\uDD04', labelKey: 'owner_menu_reset_id', descKey: 'owner_action_reset_id_desc', callback: 'owner_menu|reset_id' },
        cmdstats: { icon: '\uD83D\uDCCA', labelKey: 'owner_menu_cmdstats', descKey: 'owner_action_cmdstats_desc', callback: 'owner_menu|cmdstats' }
    };

    const OWNER_MENU_GROUPS = [
        {
            key: 'ops',
            icon: '\uD83D\uDEE0',
            titleKey: 'owner_menu_group_ops_title',
            descKey: 'owner_menu_group_ops_desc',
            actions: ['broadcast', 'group_stats', 'run_command', 'cmdstats']
        },
        {
            key: 'limits',
            icon: '\uD83E\uDDFD',
            titleKey: 'owner_menu_group_limits_title',
            descKey: 'owner_menu_group_limits_desc',
            actions: ['ai_stats', 'api_stats', 'ai_limit', 'ai_unlimit', 'command_stats', 'command_limit', 'command_unlimit', 'doremon_limit', 'doremon_unlimit']
        },
        {
            key: 'users',
            icon: '\uD83D\uDC65',
            titleKey: 'owner_menu_group_users_title',
            descKey: 'owner_menu_group_users_desc',
            actions: ['check_users', 'coowner_grant', 'ban', 'unban', 'reset_id']
        }
    ];

    function getDefaultOwnerGroup() {
        return OWNER_MENU_GROUPS[0]?.key || 'ops';
    }

    function buildOwnerMenuText(lang, activeGroup = getDefaultOwnerGroup()) {
        const headers = [t(lang, 'owner_table_command'), t(lang, 'owner_table_description')];
        const group = OWNER_MENU_GROUPS.find((entry) => entry.key === activeGroup) || OWNER_MENU_GROUPS[0];

        if (!group) {
            return '';
        }

        const rows = [];
        (group.actions || []).forEach((actionKey) => {
            const action = OWNER_MENU_ACTIONS[actionKey];
            if (!action) {
                return;
            }
            const labelText = t(lang, action.labelKey);
            const commandLabel = formatCommandLabel(labelText, { icon: action.icon, context: 'plain' });
            const desc = t(lang, action.descKey);
            rows.push([commandLabel, escapeHtml(desc)]);
        });

        const lines = [t(lang, 'owner_menu_title'), `<i>${escapeHtml(t(lang, 'owner_menu_hint'))}</i>`];

        if (rows.length) {
            lines.push(
                '',
                `${group.icon} <b>${escapeHtml(t(lang, group.titleKey))}</b>`,
                `<i>${escapeHtml(t(lang, group.descKey))}</i>`,
                formatOwnerTable(headers, rows)
            );
        }

        return lines.filter(Boolean).join('\n');
    }

    function buildOwnerMenuKeyboard(lang, activeGroup = getDefaultOwnerGroup()) {
        const inline_keyboard = [];

        const navButtons = OWNER_MENU_GROUPS.map((group) => ({
            text: `${group.icon} ${t(lang, group.titleKey)}`,
            callback_data: `owner_menu|group|${group.key}`
        }));

        for (let i = 0; i < navButtons.length; i += 2) {
            inline_keyboard.push(navButtons.slice(i, i + 2));
        }

        const active = OWNER_MENU_GROUPS.find((group) => group.key === activeGroup) || OWNER_MENU_GROUPS[0];
        const actionButtons = [];

        (active?.actions || []).forEach((actionKey, index) => {
            const action = OWNER_MENU_ACTIONS[actionKey];
            if (!action) {
                return;
            }
            const label = `${action.icon} ${t(lang, action.labelKey)}`;
            actionButtons.push({ text: label, callback_data: action.callback });

            if ((index + 1) % 3 === 0) {
                inline_keyboard.push(actionButtons.splice(0, actionButtons.length));
            }
        });

        if (actionButtons.length) {
            inline_keyboard.push(actionButtons.splice(0, actionButtons.length));
        }

        inline_keyboard.push([{ text: `❌ ${t(lang, 'help_button_close')}`, callback_data: 'owner_menu|close' }]);

        return { inline_keyboard };
    }

    function buildOwnerCommandLimitKeyboard(lang) {
        return {
            inline_keyboard: [
                [{ text: `⏳ ${t(lang, 'owner_command_button_limit')}`, callback_data: 'owner_command|limit' }],
                [{ text: `🔓 ${t(lang, 'owner_command_button_unlimit')}`, callback_data: 'owner_command|unlimit' }],
                [{ text: `📊 ${t(lang, 'owner_command_button_stats')}`, callback_data: 'owner_command|stats' }],
                [{ text: t(lang, 'help_button_close'), callback_data: 'owner_menu|close' }]
            ]
        };
    }

    function buildOwnerAiCommandLimitKeyboard(lang) {
        return {
            inline_keyboard: [
                [{ text: `🛑 ${t(lang, 'owner_menu_ai_limit')}`, callback_data: 'owner_ai_command|limit' }],
                [{ text: `🔓 ${t(lang, 'owner_menu_ai_unlimit')}`, callback_data: 'owner_ai_command|unlimit' }],
                [{ text: `📊 ${t(lang, 'owner_menu_ai_stats')}`, callback_data: 'owner_ai_command|stats' }],
                [{ text: t(lang, 'help_button_close'), callback_data: 'owner_menu|close' }]
            ]
        };
    }

    function isLikelyGroupChatId(chatId) {
        return chatId?.toString().startsWith('-');
    }

    function filterGroupProfiles(profiles = []) {
        return (profiles || []).filter((profile) => {
            const type = (profile?.type || '').toLowerCase();
            return isLikelyGroupChatId(profile?.chatId) || type === 'group' || type === 'supergroup';
        });
    }

    function isGroupRevokedError(error) {
        const statusCode = error?.response?.statusCode;
        const description = error?.response?.body?.description || error?.message || '';

        if (statusCode === 403 || statusCode === 400) {
            return true;
        }

        return /kicked|blocked|not found|chat not found|forbidden|not a member|user not found/i.test(description);
    }

    async function cleanupGroupProfile(chatId) {
        if (!chatId) {
            return;
        }

        try {
            await db.removeGroupProfile(chatId);
        } catch (error) {
            log.warn(`Failed to purge group profile ${chatId}: ${error.message}`);
        }

        try {
            await db.wipeChatFootprint(chatId);
        } catch (error) {
            log.warn(`Failed to wipe group footprint ${chatId}: ${error.message}`);
        }
    }

    async function loadActiveGroupProfiles() {
        const groups = filterGroupProfiles(await db.listGroupProfiles());
        const hydrated = filterGroupProfiles(await hydrateGroupProfiles(groups));
        return hydrated;
    }

    function buildOwnerGroupDashboardKeyboard(lang, groups = []) {
        const inline_keyboard = [];

        for (const profile of groups) {
            const countLabel = Number.isFinite(Number(profile.memberCount)) ? ` (${profile.memberCount})` : '';
            const label = `${profile.title || profile.username || profile.chatId}${countLabel}`.slice(0, 60);
            inline_keyboard.push([
                { text: `👥 ${label}`, callback_data: `owner_group|info|${profile.chatId}` }
            ]);
        }

        inline_keyboard.push([
            { text: t(lang, 'owner_group_button_broadcast_all'), callback_data: 'owner_group|broadcast_all' }
        ]);

        inline_keyboard.push([
            { text: t(lang, 'owner_group_button_refresh'), callback_data: 'owner_group|refresh' }
        ]);

        inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'owner_menu|close' }]);

        return { inline_keyboard };
    }

    function buildOwnerGroupDetailKeyboard(lang, profile = {}) {
        const inline_keyboard = [
            [
                { text: t(lang, 'owner_group_button_broadcast_one'), callback_data: `owner_group|broadcast|${profile.chatId}` },
                { text: t(lang, 'owner_group_button_ban_users'), callback_data: `owner_group|ban_users|${profile.chatId}` }
            ],
            [
                { text: t(lang, 'owner_group_button_add_users'), callback_data: `owner_group|add_users|${profile.chatId}` },
                { text: t(lang, 'owner_group_button_pin'), callback_data: `owner_group|pin|${profile.chatId}` }
            ],
            [
                { text: t(lang, 'owner_group_button_create_topic'), callback_data: `owner_group|topic|${profile.chatId}` }
            ],
            [
                { text: t(lang, 'owner_group_button_change_info'), callback_data: `owner_group|change_info|${profile.chatId}` },
                { text: t(lang, 'owner_group_button_delete_messages'), callback_data: `owner_group|delete_messages|${profile.chatId}` }
            ],
            [
                { text: t(lang, 'owner_group_button_toggle_anonymous'), callback_data: `owner_group|toggle_anon|${profile.chatId}` },
                { text: t(lang, 'owner_group_button_remove'), callback_data: `owner_group|remove|${profile.chatId}` }
            ],
            [
                { text: t(lang, 'owner_group_button_back'), callback_data: 'owner_group|back' },
                { text: t(lang, 'help_button_close'), callback_data: 'owner_menu|close' }
            ]
        ];

        if (profile.username) {
            inline_keyboard[0].push({
                text: t(lang, 'owner_group_button_open_link'),
                url: `https://t.me/${profile.username}`
            });
        }

        return { inline_keyboard };
    }

    function formatOwnerTable(headers, rows, layout = OWNER_TABLE_LAYOUT) {
        if (!Array.isArray(headers) || !headers.length || !Array.isArray(rows) || !rows.length) {
            return '';
        }

        const headerLine = `| ${headers.join(' | ')} |`;
        const separator = `| ${headers.map(() => '---').join(' | ')} |`;
        const tableLines = [headerLine, separator];

        rows.forEach((row) => {
            tableLines.push(`| ${row.map((cell) => cell || '').join(' | ')} |`);
        });

        const formatted = formatMarkdownTableBlock(tableLines, layout);
        return `<pre>${escapeHtml(formatted)}</pre>`;
    }

    function extractOwnerBroadcastPayload(msg, fallbackText = '') {
        const caption = (msg?.caption || fallbackText || '').trim();

        if (Array.isArray(msg?.photo) && msg.photo.length) {
            const largestPhoto = msg.photo[msg.photo.length - 1];
            return { kind: 'photo', fileId: largestPhoto.file_id, caption };
        }

        if (msg?.video) {
            return { kind: 'video', fileId: msg.video.file_id, caption };
        }

        if (msg?.document) {
            return { kind: 'document', fileId: msg.document.file_id, caption };
        }

        return { kind: 'text', text: (fallbackText || '').trim() };
    }

    async function sendOwnerBroadcastPayload(targetId, payload) {
        if (!payload || !targetId) {
            return null;
        }

        try {
            if (payload.kind === 'photo') {
                return await bot.sendPhoto(targetId, payload.fileId, { caption: payload.caption });
            }

            if (payload.kind === 'video') {
                return await bot.sendVideo(targetId, payload.fileId, { caption: payload.caption });
            }

            if (payload.kind === 'document') {
                return await bot.sendDocument(targetId, payload.fileId, { caption: payload.caption });
            }

            const text = payload.text || payload.caption;
            if (text) {
                return await bot.sendMessage(targetId, text, { disable_web_page_preview: true });
            }
        } catch (error) {
            log.error(`Failed to deliver broadcast payload to ${targetId}: ${error.message}`);
        }

        return null;
    }

    function formatOwnerUserCards(entries = [], lang, { icon = '👤', showRank = false } = {}) {
        return entries.map((entry, index) => {
            const name = escapeHtml(entry.fullName || '');
            const username = entry.username ? ` (@${escapeHtml(entry.username)})` : '';
            const rank = showRank ? `🏆 ${t(lang, 'owner_table_rank')}: #${index + 1}\n` : '';
            const firstSeenLabel = formatTimestampLabel(entry.firstSeen);
            const lastSeenLabel = formatTimestampLabel(entry.lastSeen);

            return `${icon} <b>${name || t(lang, 'owner_table_name')}</b>${username}\n${rank}🆔 ${formatOwnerIdCell(entry.chatId || entry.userId)}\n📅 ${t(lang, 'owner_table_first_seen')}: ${firstSeenLabel}\n🕒 ${t(lang, 'owner_table_last_seen')}: ${lastSeenLabel}`;
        }).join('\n\n');
    }

    function formatOwnerCommandCards(entries = [], lang, { icon = '👤', showRank = false } = {}) {
        return entries.map((entry, index) => {
            const name = escapeHtml(entry.fullName || '');
            const username = entry.username ? ` (@${escapeHtml(entry.username)})` : '';
            const rank = showRank ? `🏆 ${t(lang, 'owner_table_rank')}: #${index + 1}\n` : '';
            const firstSeenLabel = formatTimestampLabel(entry.firstSeen);
            const lastSeenLabel = formatTimestampLabel(entry.lastSeen);
            const usageLine = entry.total !== undefined ? `📉 ${t(lang, 'owner_table_usage')}: ${entry.total}\n` : '';
            const breakdown = (entry.commands || [])
                .sort((a, b) => b[1] - a[1])
                .map(([command, total]) => `/${command}: ${total}`)
                .join('\n');

            const breakdownBlock = breakdown ? `⌨️ ${t(lang, 'owner_table_commands')}:\n${breakdown}` : '';

            return `${icon} <b>${name || t(lang, 'owner_table_name')}</b>${username}\n${rank}🆔 ${formatOwnerIdCell(entry.userId)}\n📅 ${t(lang, 'owner_table_first_seen')}: ${firstSeenLabel}\n🕒 ${t(lang, 'owner_table_last_seen')}: ${lastSeenLabel}\n${usageLine}${breakdownBlock}`.trim();
        }).join('\n\n');
    }

    function buildCopyList(entries = []) {
        const lines = [];
        for (const entry of entries) {
            const id = entry?.id || entry?.userId || entry?.chatId;
            if (!id) {
                continue;
            }
            const label = entry?.label || entry?.fullName || entry?.username || t(defaultLang, 'owner_table_copy_label');
            const copyable = formatCopyableValueHtml(id) || escapeHtml(id);
            if (copyable) {
                lines.push(`🔹 ${escapeHtml(label || '')}: ${copyable}`);
            }
        }
        return lines.join('\n');
    }

    function formatOwnerIdCell(value) {
        if (value === undefined || value === null) {
            return '';
        }

        return formatCopyableValueHtml(value) || escapeHtml(String(value));
    }

    function parseOwnerTargetInput(rawText) {
        const trimmed = (rawText || '').trim();
        if (!trimmed) {
            return null;
        }

        const lowered = trimmed.toLowerCase();
        if (['all', '*', 'global', 'tat ca', 't?t c?'].includes(lowered)) {
            return { scope: 'all', targetId: null };
        }

        const idMatch = trimmed.match(/-?\d+/);
        if (idMatch) {
            return { scope: 'user', targetId: idMatch[0] };
        }

        return null;
    }

    async function resolveOwnerTargetWithUsername(rawText) {
        const parsed = parseOwnerTargetInput(rawText);
        if (parsed) {
            return parsed;
        }

        const lookup = (rawText || '').trim().replace(/^@/, '');
        if (!lookup) {
            return null;
        }

        const found = await db.findUserByIdOrUsername(lookup);
        if (found?.chatId) {
            return { scope: 'user', targetId: found.chatId.toString() };
        }
        return null;
    }

    function describeOwnerTarget(lang, target) {
        if (!target || target.scope === 'all') {
            return t(lang, 'owner_target_all');
        }
        return target.targetId || t(lang, 'owner_target_all');
    }

    async function setCommandLimitForUserAndDevices(commandKey, targetId, limitValue) {
        await db.setCommandLimit(commandKey, limitValue, targetId);
        if (!targetId) {
            return;
        }

        try {
            const devices = await db.listUserDevices(targetId);
            for (const device of devices || []) {
                const deviceTargetId = buildDeviceTargetId(device.deviceId);
                if (!deviceTargetId) {
                    continue;
                }
                await db.setCommandLimit(commandKey, limitValue, deviceTargetId);
            }
        } catch (error) {
            log.warn(`Failed to sync device limits for ${targetId}: ${error.message}`);
        }
    }

    async function clearCommandLimitForUserAndDevices(commandKey, targetId) {
        if (!targetId) {
            await db.clearAllCommandLimits(commandKey);
            return;
        }

        await db.clearCommandLimit(commandKey, targetId);

        try {
            const devices = await db.listUserDevices(targetId);
            for (const device of devices || []) {
                const deviceTargetId = buildDeviceTargetId(device.deviceId);
                if (!deviceTargetId) {
                    continue;
                }
                await db.clearCommandLimit(commandKey, deviceTargetId);
            }
        } catch (error) {
            log.warn(`Failed to clear device limits for ${targetId}: ${error.message}`);
        }
    }

    function clearOwnerCaches(target) {
        if (!target || target.scope === 'all') {
            coOwnerIds.clear();
            bannedUserIds.clear();
            bannedDeviceIds.clear();
            ownerPasswordPrompts.clear();
            return;
        }

        const targetId = target.targetId || target;
        if (!targetId) {
            return;
        }
        coOwnerIds.delete(targetId.toString());
        bannedUserIds.delete(targetId.toString());
        ownerPasswordPrompts.delete(targetId.toString());
    }

    async function purgeChatHistory(chatId, ownerLang) {
        if (!chatId) {
            return { deleted: 0, attempted: false };
        }

        const normalizedChatId = chatId.toString();
        const numericChatId = Number(normalizedChatId);
        if (Number.isFinite(numericChatId) && numericChatId < 0) {
            return { deleted: 0, attempted: false };
        }

        let lang = ownerLang || defaultLang;
        try {
            const info = await db.getUserLanguageInfo(normalizedChatId);
            if (info?.lang) {
                lang = resolveLangCode(info.lang) || lang;
            }
        } catch (error) {
            log.error(`Unable to resolve language for chat ${normalizedChatId}: ${sanitizeSecrets(error?.message || error?.toString())}`);
        }

        try {
            const marker = await bot.sendMessage(normalizedChatId, t(lang, 'owner_reset_chat_notice'), {
                disable_notification: true
            });

            const latestId = marker?.message_id || 0;
            const maxSweep = 60000;
            const startId = Math.max(1, latestId - maxSweep + 1);
            let deleted = 0;
            let consecutiveSkips = 0;

            for (let messageId = latestId; messageId >= startId; messageId--) {
                try {
                    await bot.deleteMessage(normalizedChatId, messageId);
                    deleted++;
                    consecutiveSkips = 0;
                } catch (error) {
                    const description = error?.response?.body?.description || error?.message || '';
                    if (
                        description.includes('message to delete not found') ||
                        description.includes("message can't be deleted") ||
                        description.includes('MESSAGE_ID_INVALID')
                    ) {
                        consecutiveSkips++;
                        if (consecutiveSkips >= 250) {
                            break;
                        }
                        continue;
                    }
                }
            }

            if (marker?.message_id) {
                try {
                    await bot.deleteMessage(normalizedChatId, marker.message_id);
                } catch (error) {
                    const description = error?.response?.body?.description || error?.message || '';
                    if (!description.includes('message to delete not found')) {
                        log.error(`Failed to delete marker message for ${normalizedChatId}: ${sanitizeSecrets(description)}`);
                    }
                }
            }

            return { deleted, attempted: true };
        } catch (error) {
            log.error(`Failed to clear chat history for ${normalizedChatId}: ${sanitizeSecrets(error?.message || error?.toString())}`);
            return { deleted: 0, attempted: false };
        }
    }

    async function collectAllKnownChatIds() {
        const users = await db.listUsersDetailed();
        return (users || []).map((user) => user?.chatId).filter(Boolean);
    }

    async function clearChatHistoriesForIds(chatIds, ownerLang) {
        const uniqueIds = Array.from(new Set((chatIds || []).map((id) => id?.toString()).filter(Boolean)));
        let deletedMessages = 0;
        let attemptedChats = 0;

        const maxConcurrency = Math.min(10, uniqueIds.length || 0);
        let cursor = 0;

        async function worker() {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const nextIndex = cursor;
                if (nextIndex >= uniqueIds.length) {
                    break;
                }
                cursor += 1;
                const chatId = uniqueIds[nextIndex];
                // eslint-disable-next-line no-await-in-loop
                const result = await purgeChatHistory(chatId, ownerLang);
                if (result.attempted) {
                    attemptedChats += 1;
                    deletedMessages += result.deleted;
                }
            }
        }

        const workers = Array.from({ length: maxConcurrency }, () => worker());
        await Promise.all(workers);

        return { attemptedChats, deletedMessages };
    }

    async function clearChatHistoriesForTarget(target, ownerLang, presetChatIds = null) {
        const chatIds = presetChatIds || (target?.scope === 'all'
            ? await collectAllKnownChatIds()
            : [target?.targetId].filter(Boolean));

        return clearChatHistoriesForIds(chatIds, ownerLang);
    }

    async function ensureGroupProfile(chat = {}) {
        if (!chat.id || !['group', 'supergroup'].includes(chat.type)) {
            return;
        }

        await db.upsertGroupProfile({
            chatId: chat.id,
            title: chat.title || null,
            username: chat.username || null,
            type: chat.type
        });
    }

    async function resolveOwnerGroupTarget(chatToken) {
        const trimmed = (chatToken || '').trim();
        if (!trimmed) {
            return { targetChatId: null, profile: null };
        }

        const tokenId = trimmed.match(/-?\d+/)?.[0] || null;
        const username = trimmed.startsWith('@') ? trimmed.slice(1).toLowerCase() : trimmed.toLowerCase();
        const groups = await loadActiveGroupProfiles();

        let profile = null;

        if (tokenId) {
            profile = groups.find((item) => item.chatId === tokenId || item.chatId === tokenId.toString());
        }

        if (!profile && username) {
            profile = groups.find((item) => (item.username || '').toLowerCase() === username);
        }

        const isGroupIdLike = tokenId?.startsWith('-');
        const targetChatId = profile?.chatId || (isGroupIdLike ? tokenId : null);

        return { targetChatId, profile: profile || null };
    }

    async function resolveGroupMetadata(chatId, fallbackProfile = null) {
        const normalizedId = chatId?.toString();
        if (!normalizedId) {
            return { chatId: null, title: null, username: null, type: null };
        }

        const profile = fallbackProfile || (await db.listGroupProfiles()).find((item) => item.chatId === normalizedId);
        let resolved = null;

        try {
            const chat = await bot.getChat(normalizedId);
            if (isLikelyGroupChatId(normalizedId) || ['group', 'supergroup'].includes(chat.type)) {
                await ensureGroupProfile(chat);
            }
            resolved = {
                chatId: normalizedId,
                title: chat.title || null,
                username: chat.username || null,
                type: chat.type || 'supergroup'
            };
        } catch (error) {
            log.warn(`Unable to resolve group metadata for ${normalizedId}: ${error.message}`);
            if (isGroupRevokedError(error)) {
                await cleanupGroupProfile(normalizedId);
                return { chatId: normalizedId, removed: true };
            }
        }

        const fallback = resolved || profile || null;
        if (!fallback) {
            return { chatId: normalizedId, title: null, username: null, type: 'supergroup' };
        }

        return {
            chatId: normalizedId,
            title: fallback.title || null,
            username: fallback.username || null,
            type: fallback.type || 'supergroup'
        };
    }

    async function hydrateGroupProfiles(profiles = []) {
        const hydrated = [];

        for (const profile of profiles) {
            const resolved = await resolveGroupMetadata(profile?.chatId, profile);
            if (!resolved?.chatId || resolved.removed) {
                continue;
            }

            hydrated.push(resolved);

            const hasNewTitle = resolved?.title && resolved.title !== profile?.title;
            const hasNewUsername = resolved?.username && resolved.username !== profile?.username;
            const hasNewType = resolved?.type && resolved.type !== profile?.type;

            if (resolved?.chatId && (hasNewTitle || hasNewUsername || hasNewType)) {
                await db.upsertGroupProfile({
                    chatId: resolved.chatId,
                    title: resolved.title || profile?.title || null,
                    username: resolved.username || profile?.username || null,
                    type: resolved.type || profile?.type || null
                });
            }
        }

        return hydrated;
    }

    function formatGroupAddress(profile = {}) {
        if (profile.username) {
            return `https://t.me/${profile.username}`;
        }
        return profile.chatId || 'N/A';
    }

    async function getGroupMemberCountSafe(chatId) {
        try {
            const count = await bot.getChatMemberCount(chatId);
            return Number.isFinite(Number(count)) ? Number(count) : null;
        } catch (error) {
            log.warn(`Failed to fetch member count for ${chatId}: ${error.message}`);
            if (isGroupRevokedError(error)) {
                await cleanupGroupProfile(chatId?.toString());
            }
            return null;
        }
    }

    async function getGroupAdminSummary(chatId) {
        try {
            const admins = await bot.getChatAdministrators(chatId);
            return (admins || []).map((entry) => ({
                id: entry?.user?.id?.toString(),
                username: entry?.user?.username || null,
                fullName: [entry?.user?.first_name, entry?.user?.last_name].filter(Boolean).join(' ').trim() || null,
                isOwner: entry?.status === 'creator'
            })).filter((admin) => admin.id);
        } catch (error) {
            log.warn(`Failed to load admins for ${chatId}: ${error.message}`);
            return [];
        }
    }

    function formatAdminList(admins = [], lang = defaultLang) {
        if (!admins.length) {
            return t(lang, 'owner_group_admins_unknown');
        }

        const lines = admins.map((admin) => {
            const parts = [];
            if (admin.isOwner) {
                parts.push('👑');
            }
            if (admin.fullName) {
                parts.push(escapeHtml(admin.fullName));
            }
            if (admin.username) {
                parts.push(`@${escapeHtml(admin.username)}`);
            }
            parts.push(`ID: ${formatCopyableValueHtml(admin.id) || escapeHtml(admin.id)}`);
            return `🔹 ${parts.join(' • ')}`;
        });

        return lines.join('\n');
    }

    function parseUserIdsFromText(text) {
        const matches = (text || '').match(/-?\d+/g) || [];
        return Array.from(new Set(matches.map((id) => id.toString())));
    }

    async function purgeBotMessagesInGroup(chatId, lang, lookback = 400) {
        if (!chatId) {
            return { deleted: 0 };
        }

        let marker = null;
        try {
            marker = await bot.sendMessage(chatId, t(lang, 'owner_group_delete_progress'), {
                disable_notification: true
            });
        } catch (error) {
            log.warn(`Unable to send purge marker in ${chatId}: ${error.message}`);
        }

        const latestId = marker?.message_id || 0;
        const startId = Math.max(1, latestId - lookback);
        let deleted = 0;

        for (let messageId = latestId; messageId >= startId; messageId--) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await bot.deleteMessage(chatId, messageId);
                deleted++;
            } catch (error) {
                // ignore messages we cannot delete
            }
        }

        return { deleted };
    }

    async function toggleBotAnonymousMode(chatId, lang) {
        if (!chatId || !BOT_ID) {
            return { toggled: false };
        }

        try {
            const member = await bot.getChatMember(chatId, Number(BOT_ID));
            const current = Boolean(member?.is_anonymous);
            const promoteConfig = {
                is_anonymous: !current,
                can_manage_chat: member?.can_manage_chat ?? true,
                can_delete_messages: member?.can_delete_messages ?? true,
                can_manage_video_chats: member?.can_manage_video_chats ?? true,
                can_restrict_members: member?.can_restrict_members ?? true,
                can_promote_members: member?.can_promote_members ?? true,
                can_change_info: member?.can_change_info ?? true,
                can_invite_users: member?.can_invite_users ?? true,
                can_pin_messages: member?.can_pin_messages ?? true,
                can_post_messages: member?.can_post_messages ?? undefined,
                can_edit_messages: member?.can_edit_messages ?? undefined,
                can_manage_topics: member?.can_manage_topics ?? true
            };

            await bot.promoteChatMember(chatId, Number(BOT_ID), promoteConfig);
            return { toggled: true, nextState: !current };
        } catch (error) {
            log.warn(`Failed to toggle anonymous mode in ${chatId}: ${error.message}`);
            return { toggled: false, error };
        }
    }

    async function sendOwnerGroupDashboard(chatId, lang) {
        const hydrated = await loadActiveGroupProfiles();
        const enriched = [];
        for (const profile of hydrated) {
            // eslint-disable-next-line no-await-in-loop
            const memberCount = await getGroupMemberCountSafe(profile.chatId);
            enriched.push({
                ...profile,
                memberCount,
                search: `${profile.title || ''} ${profile.username || ''} ${profile.chatId}`,
                groupFilter: Number(memberCount) > 100 ? 'active' : 'all'
            });
        }

        const sorted = enriched.sort((a, b) => (Number(b.memberCount) || 0) - (Number(a.memberCount) || 0));
        const state = createOwnerListState('groups', chatId.toString(), chatId, sorted, { defaultFilter: 'all' });
        const rendered = renderOwnerListState(state, lang);
        const message = await bot.sendMessage(chatId, rendered.text, {
            reply_markup: rendered.reply_markup,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        updateOwnerListState(state.id, chatId.toString(), { messageId: message?.message_id, chatId });
    }

    async function sendOwnerGroupDetail(chatId, targetChatId, lang) {
        const normalized = targetChatId?.toString();
        if (!normalized || !isLikelyGroupChatId(normalized)) {
            await bot.sendMessage(chatId, t(lang, 'owner_group_usage_help'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const groups = await loadActiveGroupProfiles();
        const profile = groups.find((item) => item.chatId === normalized) || { chatId: normalized };
        const hydratedProfiles = profile.title || profile.username
            ? [profile]
            : await hydrateGroupProfiles([profile]);
        const hydrated = hydratedProfiles[0];

        if (!hydrated) {
            await bot.sendMessage(chatId, t(lang, 'owner_group_removed_auto'), { reply_markup: buildCloseKeyboard(lang) });
            await sendOwnerGroupDashboard(chatId, lang);
            return;
        }

        const targetId = hydrated.chatId || normalized;

        if (!isLikelyGroupChatId(targetId)) {
            await bot.sendMessage(chatId, t(lang, 'owner_group_usage_help'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const memberCount = await getGroupMemberCountSafe(targetId);
        const countText = memberCount === null ? t(lang, 'owner_group_unknown_count') : memberCount;
        const admins = await getGroupAdminSummary(targetId);
        const adminBlock = formatAdminList(admins, lang);
        const createdLabel = t(lang, 'owner_group_created_unknown');
        const addedLabel = formatTimestampLabel(hydrated?.firstSeen) || t(lang, 'owner_group_added_unknown');
        const lastSeenLabel = formatTimestampLabel(hydrated?.lastSeen) || t(lang, 'owner_group_added_unknown');
        const usageTotal = await db.getGroupCommandUsageTotal(targetId);
        const usageSummary = await db.getGroupCommandUsageSummary(targetId, 12);
        const usageBlock = (usageSummary || [])
            .map((entry) => `🔹 /${escapeHtml(entry.command)} — ${entry.total}`)
            .join('\n') || t(lang, 'owner_group_usage_empty');

        const lines = [
            `🛡️ <b>${escapeHtml(hydrated?.title || hydrated?.username || targetId)}</b>`,
            `🆔 ${formatCopyableValueHtml(targetId) || escapeHtml(targetId)}`
        ];

        if (hydrated?.username) {
            lines.push(`🔗 https://t.me/${escapeHtml(hydrated.username)}`);
        }

        lines.push(
            `👥 ${t(lang, 'owner_group_member_count', { count: countText })}`,
            `👮 ${t(lang, 'owner_group_admin_count', { count: admins.length })}`,
            adminBlock,
            `📅 ${t(lang, 'owner_group_created_label')}: ${createdLabel}`,
            `📥 ${t(lang, 'owner_group_added_label')}: ${addedLabel}`,
            `👁️ ${t(lang, 'owner_group_last_seen_label')}: ${lastSeenLabel}`,
            `⚡ ${t(lang, 'owner_group_activity_total', { count: usageTotal || 0 })}`,
            `${t(lang, 'owner_group_usage_header')}:\n${usageBlock}`,
            t(lang, 'owner_group_actions_hint')
        );

        const text = lines.filter(Boolean).join('\n');

        await bot.sendMessage(chatId, text, {
            reply_markup: buildOwnerGroupDetailKeyboard(lang, hydrated),
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    }

    async function discardOwnerPanelMessage(query) {
        if (!query?.message?.chat?.id || !query.message?.message_id) {
            return;
        }

        try {
            await bot.deleteMessage(query.message.chat.id, query.message.message_id);
        } catch (error) {
            // ignore cleanup errors
        }
    }

    function buildUserInfoLine(user) {
        const parts = [];
        if (user.fullName) {
            parts.push(`👤 ${escapeHtml(user.fullName)}`);
        }

        if (user.username) {
            parts.push(`@${escapeHtml(user.username)}`);
        }

        const copyableId = formatCopyableValueHtml(user.chatId || user.userId) || escapeHtml(user.chatId || user.userId || '');
        if (copyableId) {
            parts.push(`ID: ${copyableId}`);
        }

        return parts.join(' • ');
    }

    function safeParseJsonObject(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }

        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function formatTimestampLabel(timestampSeconds) {
        if (!Number.isFinite(timestampSeconds)) {
            return '';
        }
        const date = new Date(timestampSeconds * 1000);
        return escapeHtml(date.toLocaleString());
    }

    function buildUserBasicInfoBlock(user, lang) {
        const identityParts = [];
        if (user.fullName) {
            identityParts.push(`👤 ${escapeHtml(user.fullName)}`);
        }
        if (user.username) {
            identityParts.push(`@${escapeHtml(user.username)}`);
        }

        const copyableId = formatCopyableValueHtml(user.chatId || user.userId) || escapeHtml(user.chatId || user.userId || '');
        if (copyableId) {
            identityParts.push(`ID: ${copyableId}`);
        }

        const metaParts = [];
        const firstSeenLabel = formatTimestampLabel(user.firstSeen);
        if (firstSeenLabel) {
            metaParts.push(`📅 ${t(lang, 'owner_user_first_seen_label')}: ${firstSeenLabel}`);
        }
        const lastSeenLabel = formatTimestampLabel(user.lastSeen);
        if (lastSeenLabel) {
            metaParts.push(`🕒 ${t(lang, 'owner_user_last_seen_label')}: ${lastSeenLabel}`);
        }

        return [identityParts.join(' • '), metaParts.join(' • ')]
            .filter(Boolean)
            .join('\n');
    }

    function formatUserLabel(user) {
        const nameParts = [];
        if (user.fullName) {
            nameParts.push(escapeHtml(user.fullName));
        }
        if (user.username) {
            nameParts.push(`@${escapeHtml(user.username)}`);
        }

        const copyableId = formatCopyableValueHtml(user.chatId || user.userId) || escapeHtml(user.chatId || user.userId || '');
        if (nameParts.length === 0) {
            return copyableId;
        }

        return `${nameParts.join(' · ')} (${copyableId})`;
    }

    async function sendChunkedHtmlMessages(chatId, text, options = {}) {
        if (!text) {
            return;
        }
        const chunkSize = 3500;
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            // eslint-disable-next-line no-await-in-loop
            await bot.sendMessage(chatId, chunk, { parse_mode: 'HTML', disable_web_page_preview: true, ...options });
        }
    }

    async function sendOwnerUserOverview(chatId, lang) {
        const [users, coOwners, banned] = await Promise.all([
            db.listUsersDetailed(),
            db.listCoOwners(),
            db.listBannedUsers()
        ]);

        const entries = [];
        const coOwnerIdSet = new Set((coOwners || []).map((c) => c.userId?.toString()).filter(Boolean));
        const bannedIdSet = new Set((banned || []).map((b) => b.userId?.toString()).filter(Boolean));
        let ownerCount = 0;
        let coOwnerCount = 0;
        let bannedCount = 0;

        if (BOT_OWNER_ID) {
            const mainOwner = users?.find((u) => u.chatId?.toString() === BOT_OWNER_ID);
            entries.push({
                role: 'owner',
                fullName: mainOwner?.fullName || t(lang, 'owner_primary_label'),
                username: mainOwner?.username,
                chatId: BOT_OWNER_ID,
                firstSeen: mainOwner?.firstSeen,
                lastSeen: mainOwner?.lastSeen,
                search: `${mainOwner?.fullName || ''} ${mainOwner?.username || ''} ${BOT_OWNER_ID}`
            });
            ownerCount += 1;
        }

        const usernameOwner = users?.find((u) => (u.username || '').toLowerCase() === ADDITIONAL_OWNER_USERNAME);
        if (usernameOwner) {
            entries.push({
                role: 'owner',
                fullName: usernameOwner.fullName,
                username: usernameOwner.username,
                chatId: usernameOwner.chatId,
                firstSeen: usernameOwner.firstSeen,
                lastSeen: usernameOwner.lastSeen,
                search: `${usernameOwner.fullName || ''} ${usernameOwner.username || ''} ${usernameOwner.chatId}`
            });
            ownerCount += 1;
        }

        for (const entry of coOwners || []) {
            const chatIdStr = entry.userId?.toString();
            entries.push({
                role: 'coowner',
                fullName: entry.fullName,
                username: entry.username,
                chatId: entry.userId,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                search: `${entry.fullName || ''} ${entry.username || ''} ${chatIdStr}`
            });
            coOwnerCount += 1;
        }

        for (const entry of banned || []) {
            const chatIdStr = entry.userId?.toString();
            entries.push({
                role: 'banned',
                fullName: entry.fullName,
                username: entry.username,
                chatId: entry.userId,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                search: `${entry.fullName || ''} ${entry.username || ''} ${chatIdStr}`
            });
            bannedCount += 1;
        }

        const excludedIds = new Set([BOT_OWNER_ID, ...coOwnerIdSet]);
        if (usernameOwner?.chatId) {
            excludedIds.add(usernameOwner.chatId.toString());
        }

        for (const entry of users || []) {
            const id = entry.chatId?.toString();
            if (!id || isLikelyGroupChatId(id) || excludedIds.has(id) || bannedIdSet.has(id)) {
                continue;
            }
            entries.push({
                role: 'member',
                fullName: entry.fullName,
                username: entry.username,
                chatId: entry.chatId,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                search: `${entry.fullName || ''} ${entry.username || ''} ${entry.chatId}`
            });
        }

        const state = createOwnerListState('users', chatId.toString(), chatId, entries, {
            meta: { ownerCount, coOwnerCount, bannedCount }
        });
        const rendered = renderOwnerListState(state, lang);
        const message = await bot.sendMessage(chatId, rendered.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: rendered.reply_markup
        });
        updateOwnerListState(state.id, chatId.toString(), { messageId: message?.message_id, chatId });
    }

    async function sendOwnerAiStats(chatId, lang) {
        const usageDate = new Date().toISOString().slice(0, 10);
        const leaderboard = await db.getCommandUsageLeaderboard('ai', 200, usageDate);
        if (!leaderboard || leaderboard.length === 0) {
            await sendReply({ chat: { id: chatId } }, t(lang, 'owner_ai_stats_empty'), {
                parse_mode: 'HTML',
                reply_markup: buildCloseKeyboard(lang)
            });
            return;
        }

        const entries = leaderboard.map((entry) => ({
            ...entry,
            commands: { ai: entry.total },
            search: `${entry.userId} ${entry.username || ''} ${entry.fullName || ''}`
        }));

        const state = createOwnerListState('ai', chatId.toString(), chatId, entries);
        const rendered = renderOwnerListState(state, lang);
        const message = await bot.sendMessage(chatId, rendered.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: rendered.reply_markup
        });
        updateOwnerListState(state.id, chatId.toString(), { messageId: message?.message_id, chatId });
    }

    async function sendOwnerCommandUsageStats(chatId, lang) {
        const usageDate = new Date().toISOString().slice(0, 10);
        const stats = await db.getAllCommandUsageStats(200, usageDate);
        const filtered = (stats || []).map((entry) => {
            const commands = Object.entries(entry.commands || {}).filter(([key]) => key !== OWNER_COMMAND_LIMIT_KEY);
            return { ...entry, commands: Object.fromEntries(commands) };
        }).filter((entry) => Object.keys(entry.commands).length);

        if (!filtered.length) {
            await bot.sendMessage(chatId, t(lang, 'owner_command_usage_empty'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const state = createOwnerListState('commands', chatId.toString(), chatId, filtered, { defaultFilter: 'all' });
        const rendered = renderOwnerListState(state, lang);
        const message = await bot.sendMessage(chatId, rendered.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: rendered.reply_markup
        });
        updateOwnerListState(state.id, chatId.toString(), { messageId: message?.message_id, chatId });
    }

    function buildServerApiKeyStats(lang) {
        const entries = [];
        if (GEMINI_API_KEYS.length) {
            entries.push({ provider: 'google', label: t(lang, 'ai_provider_google'), count: GEMINI_API_KEYS.length });
        }
        if (GROQ_API_KEYS.length) {
            entries.push({ provider: 'groq', label: t(lang, 'ai_provider_groq'), count: GROQ_API_KEYS.length });
        }
        return entries;
    }

    async function sendOwnerApiStats(chatId, lang) {
        const [allKeys, blocks] = await Promise.all([
            db.listAllUserAiKeysDetailed(),
            db.listApiKeyBlocks()
        ]);

        const blockedSet = new Set((blocks || []).map((entry) => entry.userId?.toString()).filter(Boolean));
        const userMap = new Map();

        for (const entry of allKeys || []) {
            const userId = entry.userId?.toString();
            if (!userId) {
                continue;
            }

            const existing = userMap.get(userId) || {
                userId,
                username: entry.username || null,
                fullName: entry.fullName || null,
                providers: {},
                keys: [],
                search: `${entry.username || ''} ${entry.fullName || ''} ${userId}`,
                blocked: blockedSet.has(userId)
            };

            existing.providers[entry.provider || 'google'] = (existing.providers[entry.provider || 'google'] || 0) + 1;
            existing.keys.push({ id: entry.id, name: entry.name, apiKey: entry.apiKey, provider: entry.provider || 'google' });

            userMap.set(userId, existing);
        }

        const items = Array.from(userMap.values()).sort((a, b) => (b.keys.length || 0) - (a.keys.length || 0));
        const serverKeys = buildServerApiKeyStats(lang);
        const filters = new Set(['all']);
        items.forEach((item) => Object.keys(item.providers || {}).forEach((provider) => filters.add(provider)));
        serverKeys.forEach((entry) => entry.provider && filters.add(entry.provider));

        if (!items.length && !serverKeys.length) {
            await bot.sendMessage(chatId, t(lang, 'owner_api_no_keys'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        const state = createOwnerListState('api_keys', chatId.toString(), chatId, items, {
            defaultFilter: 'all',
            meta: { serverKeys, providers: Array.from(filters), blocked: Array.from(blockedSet) }
        });
        const rendered = renderOwnerListState(state, lang);
        const message = await bot.sendMessage(chatId, rendered.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: rendered.reply_markup
        });
        updateOwnerListState(state.id, chatId.toString(), { messageId: message?.message_id, chatId });
    }

    async function autoDeleteInvalidApiKeys(chatId, lang) {
        const allKeys = await db.listAllUserAiKeysDetailed();
        if (!allKeys || !allKeys.length) {
            await bot.sendMessage(chatId, t(lang, 'owner_api_no_keys'), { reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        let checked = 0;
        let deleted = 0;
        const cache = new Map();

        for (const entry of allKeys) {
            checked += 1;
            const key = `${normalizeAiProvider(entry.provider || 'google')}|${(entry.apiKey || '').trim()}`;
            let valid = cache.get(key);

            if (valid === undefined) {
                // eslint-disable-next-line no-await-in-loop
                valid = await isUserApiKeyValid(entry);
                cache.set(key, valid);
            }

            if (!valid) {
                // eslint-disable-next-line no-await-in-loop
                await db.deleteUserAiKey(entry.userId, entry.id);
                deleted += 1;
            }
        }

        const messageKey = deleted ? 'owner_api_autodelete_done' : 'owner_api_autodelete_none';
        await bot.sendMessage(chatId, t(lang, messageKey, { checked, deleted }), { reply_markup: buildCloseKeyboard(lang) });
        await sendOwnerApiStats(chatId, lang);
    }

    async function handleOwnerStateMessage(msg, textOrCaption) {
        const userId = msg.from?.id?.toString();
        const username = msg.from?.username || '';
        if (!isOwner(userId, username) || msg.chat?.type !== 'private') {
            return false;
        }

        let state = ownerActionStates.get(userId);
        if (!state) {
            return false;
        }

        const lang = await getLang(msg);
        const content = (textOrCaption || '').trim();

        if (state.mode === 'owner_list_search') {
            const listState = getOwnerListState(state.stateId, userId);
            if (!listState) {
                await sendReply(msg, t(lang, 'owner_list_state_missing'), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                return true;
            }

            const updated = updateOwnerListState(state.stateId, userId, (current) => ({
                ...current,
                searchTerm: content,
                page: 0
            }));
            const rendered = renderOwnerListState(updated, lang);
            if (updated?.messageId && updated.chatId) {
                try {
                    await bot.editMessageText(rendered.text, {
                        chat_id: updated.chatId,
                        message_id: updated.messageId,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        reply_markup: rendered.reply_markup
                    });
                } catch (error) {
                    await bot.sendMessage(updated.chatId, rendered.text, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        reply_markup: rendered.reply_markup
                    });
                }
            }

            await sendReply(msg, t(lang, 'owner_list_search_applied'), { reply_markup: buildCloseKeyboard(lang) });
            clearOwnerAction(userId);
            return true;
        }

        if (state.mode === 'api_manage') {
            if (state.step === 'target') {
                const target = await resolveOwnerTargetWithUsername(content);
                if (!target) {
                    await sendReply(msg, t(lang, 'owner_api_invalid_target'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                if (state.action === 'block') {
                    ownerActionStates.set(userId, { ...state, step: 'reason', target });
                    await sendReply(msg, t(lang, 'owner_api_prompt_block_reason'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                const nextStep = state.action === 'add' ? 'keys' : (state.action === 'message' ? 'message' : 'execute');
                const nextState = { ...state, step: nextStep, target };
                ownerActionStates.set(userId, nextState);
                state = nextState;
                if (state.action === 'add') {
                    await sendReply(msg, t(lang, 'owner_api_add_prompt_keys'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }
                if (state.action === 'message') {
                    await sendReply(msg, t(lang, 'owner_api_message_prompt'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }
            }

            if (state.step === 'keys' && state.action === 'add') {
                const target = state.target || { scope: 'all', targetId: null };
                const parsed = parseAiApiSubmission(content);
                if (!parsed.length) {
                    await sendReply(msg, t(lang, 'ai_api_parse_error'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                const recipients = target.scope === 'all'
                    ? (await db.listUserChatIds()).filter((id) => id && !id.toString().startsWith('-'))
                    : [target.targetId];
                const uniqueRecipients = Array.from(new Set(recipients.map((id) => id?.toString()).filter(Boolean)));

                let added = 0;
                for (const recipient of uniqueRecipients) {
                    for (const entry of parsed) {
                        // eslint-disable-next-line no-await-in-loop
                        const result = await db.addUserAiKey(recipient, entry.name || t(lang, 'ai_api_default_name'), entry.apiKey, entry.provider || 'google');
                        if (result.added) {
                            added += 1;
                        }
                    }
                }

                await sendReply(msg, t(lang, 'owner_api_add_result', { added, users: uniqueRecipients.length }), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                await sendOwnerApiStats(state.chatId || msg.chat.id, lang);
                return true;
            }

            if (state.step === 'execute' && state.action === 'delete') {
                const target = state.target || { scope: 'all', targetId: null };
                let result;
                if (target.scope === 'all') {
                    result = await db.deleteAllUserAiKeys();
                } else {
                    result = await db.deleteUserAiKeys(target.targetId);
                }

                await sendReply(msg, t(lang, 'owner_api_delete_done', { count: result.deleted || 0, target: describeOwnerTarget(lang, target) }), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                await sendOwnerApiStats(state.chatId || msg.chat.id, lang);
                return true;
            }

            if (state.step === 'execute' && state.action === 'unblock') {
                const target = state.target || { scope: 'all', targetId: null };
                if (target.scope === 'all') {
                    await db.setApiKeyBlock('GLOBAL', false);
                } else {
                    await db.setApiKeyBlock(target.targetId, false);
                }
                await sendReply(msg, t(lang, 'owner_api_unblock_done', { target: describeOwnerTarget(lang, target) }), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                await sendOwnerApiStats(state.chatId || msg.chat.id, lang);
                return true;
            }

            if (state.step === 'reason' && state.action === 'block') {
                const target = state.target || { scope: 'all', targetId: null };
                const reason = content || t(lang, 'owner_api_block_default');
                if (target.scope === 'all') {
                    await db.setApiKeyBlock('GLOBAL', true, reason, userId);
                } else if (target.targetId) {
                    await db.setApiKeyBlock(target.targetId, true, reason, userId);
                    await bot.sendMessage(target.targetId, t(lang, 'owner_api_blocked_notice', { reason }), { reply_markup: buildCloseKeyboard(lang) });
                }

                await sendReply(msg, t(lang, 'owner_api_block_done', { target: describeOwnerTarget(lang, target) }), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                await sendOwnerApiStats(state.chatId || msg.chat.id, lang);
                return true;
            }

            if (state.step === 'message' && state.action === 'message') {
                const target = state.target || { scope: 'all', targetId: null };
                const recipients = target.scope === 'all'
                    ? await db.listAiKeyUsers()
                    : [target.targetId];
                const uniqueRecipients = Array.from(new Set((recipients || []).map((id) => id?.toString()).filter(Boolean)));
                if (!uniqueRecipients.length) {
                    await sendReply(msg, t(lang, 'owner_api_no_recipients'), { reply_markup: buildCloseKeyboard(lang) });
                    clearOwnerAction(userId);
                    return true;
                }

                let success = 0;
                for (const recipient of uniqueRecipients) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await bot.sendMessage(recipient, content, { reply_markup: buildCloseKeyboard(lang) });
                        success += 1;
                    } catch (error) {
                        // ignore delivery errors
                    }
                }

                await sendReply(msg, t(lang, 'owner_api_message_done', { success, total: uniqueRecipients.length }), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                return true;
            }

            return false;
        }

        if (state.mode === 'broadcast') {
            if (state.step === 'target') {
                const target = parseOwnerTargetInput(content);
                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                ownerActionStates.set(userId, { ...state, step: 'message', target });
                await sendReply(msg, t(lang, 'owner_prompt_message'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            if (state.step === 'message') {
                const target = state.target || { scope: 'all', targetId: null };
                const recipients = target.scope === 'all'
                    ? await db.listUserChatIds()
                    : [target.targetId].filter(Boolean);
                const uniqueRecipients = Array.from(new Set((recipients || []).map((id) => id?.toString()).filter(Boolean)));
                const payload = extractOwnerBroadcastPayload(msg, content);

                if (payload.kind === 'text' && !payload.text) {
                    await sendReply(msg, t(lang, 'owner_broadcast_empty'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                if (!uniqueRecipients.length) {
                    await sendReply(msg, t(lang, 'owner_no_recipients'));
                    clearOwnerAction(userId);
                    return true;
                }

                let success = 0;
                let failed = 0;
                for (const recipient of uniqueRecipients) {
                    try {
                        const delivered = await sendOwnerBroadcastPayload(recipient, payload);
                        success += delivered ? 1 : 0;
                    } catch (error) {
                        failed += 1;
                        log.error(`Failed to broadcast to ${recipient}: ${error.message}`);
                    }
                }

                await sendReply(msg, t(lang, 'owner_broadcast_result', { success, failed }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'ai_limit') {
            if (state.step === 'target') {
                const target = parseOwnerTargetInput(content);
                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                ownerActionStates.set(userId, { ...state, step: 'limit', target });
                await sendReply(msg, t(lang, 'owner_prompt_limit'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            if (state.step === 'limit') {
                const target = state.target || { scope: 'all', targetId: null };
                const limitValue = Number.parseInt(content, 10);

                if (!Number.isFinite(limitValue) || limitValue < 0) {
                    await sendReply(msg, t(lang, 'owner_limit_invalid'));
                    return true;
                }

                const targetId = target.scope === 'user' ? target.targetId : null;
                if (limitValue === 0) {
                    await clearCommandLimitForUserAndDevices('ai', targetId);
                    await sendReply(msg, t(lang, 'owner_limit_cleared', { target: describeOwnerTarget(lang, target) }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                    clearOwnerAction(userId);
                    return true;
                }

                await setCommandLimitForUserAndDevices('ai', targetId, limitValue);
                await sendReply(msg, t(lang, 'owner_limit_saved', {
                    limit: limitValue,
                    target: describeOwnerTarget(lang, target)
                }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'ai_unlimit') {
            if (state.step === 'target') {
                const target = parseOwnerTargetInput(content);
                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                const targetId = target.scope === 'user' ? target.targetId : null;
                await clearCommandLimitForUserAndDevices('ai', targetId);
                await sendReply(msg, t(lang, 'owner_limit_cleared', { target: describeOwnerTarget(lang, target) }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'coowner_manage') {
            if (state.step === 'target') {
                const lookup = content.replace(/^@/, '');
                let resolved = await db.findUserByIdOrUsername(lookup);
                const targetId = resolved?.chatId?.toString() || content.match(/-?\d+/)?.[0];

                if (!targetId) {
                    await sendReply(msg, t(lang, 'owner_coowner_target_invalid'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                if (isOwner(targetId, resolved?.username)) {
                    await sendReply(msg, t(lang, 'owner_coowner_forbidden'), { reply_markup: buildCloseKeyboard(lang) });
                    clearOwnerAction(userId);
                    return true;
                }

                if (!resolved) {
                    resolved = { chatId: targetId, username: lookup };
                }

                if (state.action === 'grant') {
                    await registerCoOwner(targetId, resolved, userId);
                    await sendReply(msg, t(lang, 'owner_coowner_granted', { target: targetId }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                } else {
                    await revokeCoOwner(targetId);
                    await sendReply(msg, t(lang, 'owner_coowner_revoked', { target: targetId }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                }

                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'command_limit') {
            if (state.step === 'target') {
                const target = parseOwnerTargetInput(content);
                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                ownerActionStates.set(userId, { ...state, step: 'limit', target });
                await sendReply(msg, t(lang, 'owner_command_limit_value_prompt'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            if (state.step === 'limit') {
                const target = state.target || { scope: 'all', targetId: null };
                const limitValue = Number.parseInt(content, 10);

                if (!Number.isFinite(limitValue) || limitValue < 0) {
                    await sendReply(msg, t(lang, 'owner_command_limit_invalid'));
                    return true;
                }

                const targetId = target.scope === 'user' ? target.targetId : null;
                if (limitValue === 0) {
                    await clearCommandLimitForUserAndDevices(OWNER_COMMAND_LIMIT_KEY, targetId);
                    await sendReply(msg, t(lang, 'owner_command_limit_cleared', { target: describeOwnerTarget(lang, target) }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                    clearOwnerAction(userId);
                    return true;
                }

                await setCommandLimitForUserAndDevices(OWNER_COMMAND_LIMIT_KEY, targetId, limitValue);
                await sendReply(msg, t(lang, 'owner_command_limit_saved', {
                    limit: limitValue,
                    target: describeOwnerTarget(lang, target)
                }), { reply_markup: buildCloseKeyboard(lang) });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'command_unlimit') {
            if (state.step === 'target') {
                const target = parseOwnerTargetInput(content);
                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                const targetId = target.scope === 'user' ? target.targetId : null;
                await clearCommandLimitForUserAndDevices(OWNER_COMMAND_LIMIT_KEY, targetId);
                await sendReply(msg, t(lang, 'owner_command_limit_cleared', { target: describeOwnerTarget(lang, target) }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'doremon_limit') {
            if (state.step === 'limit') {
                const limitValue = Number.parseInt(content, 10);
                if (!Number.isFinite(limitValue) || limitValue < 0) {
                    await sendReply(msg, t(lang, 'owner_doremon_limit_invalid'));
                    return true;
                }

                if (limitValue === 0) {
                    await clearCommandLimitForUserAndDevices(DOREMON_COMMAND_LIMIT_KEY, null);
                    await sendReply(msg, t(lang, 'owner_doremon_limit_cleared'), { reply_markup: buildCloseKeyboard(lang) });
                    clearOwnerAction(userId);
                    return true;
                }

                await setCommandLimitForUserAndDevices(DOREMON_COMMAND_LIMIT_KEY, null, limitValue);
                await sendReply(msg, t(lang, 'owner_doremon_limit_saved', { limit: limitValue }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'doremon_unlimit') {
            if (state.step === 'target') {
                let target = parseOwnerTargetInput(content);
                if (!target) {
                    const found = await db.findUserByIdOrUsername(content.replace(/^@/, ''));
                    if (found?.chatId) {
                        target = { scope: 'user', targetId: found.chatId.toString() };
                    }
                }

                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                const targetId = target.scope === 'user' ? target.targetId : null;
                await clearCommandLimitForUserAndDevices(DOREMON_COMMAND_LIMIT_KEY, targetId);
                await sendReply(msg, t(lang, 'owner_doremon_unlimit_cleared', { target: describeOwnerTarget(lang, target) }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'reset_id') {
            if (state.step === 'target') {
                let target = parseOwnerTargetInput(content);
                if (!target) {
                    const found = await db.findUserByIdOrUsername(content.replace(/^@/, ''));
                    if (found?.chatId) {
                        target = { scope: 'user', targetId: found.chatId.toString() };
                    }
                }

                if (!target) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                ownerActionStates.set(userId, { ...state, step: 'confirm', target });
                await sendReply(msg, t(lang, 'owner_reset_confirm', { target: describeOwnerTarget(lang, target) }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                return true;
            }

            if (state.step === 'confirm') {
                const normalized = content.toLowerCase();
                const confirmed = [
                    'confirm',
                    'yes',
                    'y',
                    'ok',
                    'okay',
                    'đồng ý',
                    'dong y',
                    'có',
                    'oui',
                    'si',
                    'sí',
                    'да',
                    '好的',
                    '是的',
                    'ok',
                    '👍'
                ].includes(normalized);
                if (!confirmed) {
                    await sendReply(msg, t(lang, 'owner_reset_confirm', { target: describeOwnerTarget(lang, state.target) }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                    return true;
                }

                const target = state.target || { scope: 'all', targetId: null };
                const targetId = target.scope === 'user' ? target.targetId : null;
                const chatIdsForCleanup = target.scope === 'all'
                    ? await collectAllKnownChatIds()
                    : [targetId].filter(Boolean);
                const cleanup = await clearChatHistoriesForTarget(target, lang, chatIdsForCleanup);
                const changes = await db.resetUserData(target.scope === 'all' ? null : targetId);
                clearOwnerCaches(target);

                await sendReply(msg, t(lang, 'owner_reset_done', {
                    target: describeOwnerTarget(lang, target),
                    count: changes,
                    chats: cleanup.attemptedChats,
                    messages: cleanup.deletedMessages
                }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'group_stats') {
            if (state.step === 'broadcast_message') {
                const targetChatId = state.targetChatId || null;
                const payload = extractOwnerBroadcastPayload(msg, content);

                if (payload.kind === 'text' && !payload.text) {
                    await sendReply(msg, t(lang, 'owner_broadcast_empty'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                const groups = await loadActiveGroupProfiles();
                const targets = targetChatId
                    ? groups.filter((item) => item.chatId === targetChatId || item.chatId === targetChatId.toString())
                    : groups;

                if (!targets || targets.length === 0) {
                    await sendReply(msg, t(lang, 'owner_group_none'), { reply_markup: buildCloseKeyboard(lang) });
                    ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                    return true;
                }

                let success = 0;
                let failed = 0;
                for (const profile of targets) {
                    // eslint-disable-next-line no-await-in-loop
                    try {
                        const delivered = await sendOwnerBroadcastPayload(profile.chatId, payload);
                        success += delivered ? 1 : 0;
                    } catch (error) {
                        failed += 1;
                        log.error(`Failed to broadcast to group ${profile.chatId}: ${error.message}`);
                        if (isGroupRevokedError(error)) {
                            await cleanupGroupProfile(profile.chatId);
                        }
                    }
                }

                await sendReply(msg, t(lang, 'owner_group_broadcast_result', { success, failed }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                await sendOwnerGroupDashboard(state.chatId, lang);
                return true;
            }

            if (state.step === 'ban_users' || state.step === 'kick_user') {
                const targetChatId = state.targetChatId;
                if (!targetChatId) {
                    await sendReply(msg, t(lang, 'owner_group_ban_hint'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                const tokens = Array.from(new Set(content.split(/[\s,]+/).filter(Boolean)));
                if (!tokens.length) {
                    await sendReply(msg, t(lang, 'owner_group_invalid_user'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                let banned = 0;
                let muted = 0;
                let failed = 0;

                for (const token of tokens) {
                    const lookup = token.replace(/^@/, '');
                    // eslint-disable-next-line no-await-in-loop
                    const resolved = await db.findUserByIdOrUsername(lookup);
                    const targetUserId = resolved?.chatId?.toString() || token.match(/-?\d+/)?.[0];

                    if (!targetUserId) {
                        failed += 1;
                        continue;
                    }

                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await bot.banChatMember(targetChatId, Number(targetUserId));
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await bot.unbanChatMember(targetChatId, Number(targetUserId), { only_if_banned: true });
                        } catch (error) {
                            log.warn(`Unban after ban for ${targetUserId} in ${targetChatId}: ${error.message}`);
                        }
                        banned += 1;
                        continue;
                    } catch (error) {
                        log.error(`Failed to ban ${targetUserId} from ${targetChatId}: ${error.message}`);
                    }

                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await bot.restrictChatMember(targetChatId, Number(targetUserId), {
                            permissions: {
                                can_send_messages: false,
                                can_send_audios: false,
                                can_send_documents: false,
                                can_send_photos: false,
                                can_send_videos: false,
                                can_send_video_notes: false,
                                can_send_voice_notes: false,
                                can_send_polls: false,
                                can_send_other_messages: false,
                                can_add_web_page_previews: false,
                                can_change_info: false,
                                can_invite_users: false,
                                can_pin_messages: false,
                                can_manage_topics: false
                            },
                            until_date: Math.floor(Date.now() / 1000) + 24 * 60 * 60
                        });
                        muted += 1;
                    } catch (error) {
                        log.error(`Failed to mute ${targetUserId} in ${targetChatId}: ${error.message}`);
                        failed += 1;
                    }
                }

                const summary = t(lang, 'owner_group_ban_done', { banned, muted, failed });
                await sendReply(msg, summary, { reply_markup: buildCloseKeyboard(lang) });
                ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                await sendOwnerGroupDashboard(state.chatId, lang);
                return true;
            }

            if (state.step === 'add_users') {
                const targetChatId = state.targetChatId;
                const ids = parseUserIdsFromText(content);
                if (!targetChatId || !ids.length) {
                    await sendReply(msg, t(lang, 'owner_group_add_users_hint'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                let inviteLink = null;
                try {
                    const link = await bot.createChatInviteLink(targetChatId, { creates_join_request: false });
                    inviteLink = link?.invite_link || null;
                } catch (error) {
                    log.warn(`Failed to create invite link for ${targetChatId}: ${error.message}`);
                }

                if (!inviteLink) {
                    try {
                        inviteLink = await bot.exportChatInviteLink(targetChatId);
                    } catch (error) {
                        log.warn(`Failed to export invite link for ${targetChatId}: ${error.message}`);
                    }
                }

                if (!inviteLink) {
                    await sendReply(msg, t(lang, 'owner_group_invite_failed'), { reply_markup: buildCloseKeyboard(lang) });
                    ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                    return true;
                }

                let sent = 0;
                let failed = 0;
                for (const targetId of ids) {
                    // eslint-disable-next-line no-await-in-loop
                    try {
                        await bot.sendMessage(targetId, t(lang, 'owner_group_invite_template', { link: inviteLink }));
                        sent += 1;
                    } catch (error) {
                        log.warn(`Failed to DM invite to ${targetId}: ${error.message}`);
                        failed += 1;
                    }
                }

                await sendReply(msg, t(lang, 'owner_group_invite_result', { sent, failed }), {
                    reply_markup: buildCloseKeyboard(lang)
                });
                ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                await sendOwnerGroupDetail(state.chatId, targetChatId, lang);
                return true;
            }

            if (state.step === 'pin_message') {
                const targetChatId = state.targetChatId;
                const payload = extractOwnerBroadcastPayload(msg, content);

                if (payload.kind === 'text' && !payload.text) {
                    await sendReply(msg, t(lang, 'owner_group_pin_hint'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                const sent = await sendOwnerBroadcastPayload(targetChatId, payload);
                if (!sent?.message_id) {
                    await sendReply(msg, t(lang, 'owner_group_pin_failed'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                try {
                    await bot.pinChatMessage(targetChatId, sent.message_id, { disable_notification: true });
                } catch (error) {
                    log.warn(`Failed to pin message in ${targetChatId}: ${error.message}`);
                }

                await sendReply(msg, t(lang, 'owner_group_pin_done'), { reply_markup: buildCloseKeyboard(lang) });
                ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                await sendOwnerGroupDetail(state.chatId, targetChatId, lang);
                return true;
            }

            if (state.step === 'create_topic') {
                const targetChatId = state.targetChatId;
                if (!content) {
                    await sendReply(msg, t(lang, 'owner_group_topic_hint'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                try {
                    const topic = await bot.createForumTopic(targetChatId, content.slice(0, 128));
                    await sendReply(msg, t(lang, 'owner_group_topic_created', { title: content.slice(0, 128) }), {
                        reply_markup: buildCloseKeyboard(lang)
                    });
                    ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                    await sendOwnerGroupDetail(state.chatId, targetChatId, lang);
                    return true;
                } catch (error) {
                    log.warn(`Failed to create topic in ${targetChatId}: ${error.message}`);
                    await sendReply(msg, t(lang, 'owner_group_topic_failed'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }
            }

            if (state.step === 'change_info') {
                const targetChatId = state.targetChatId;
                const hasPhoto = Array.isArray(msg?.photo) && msg.photo.length;
                const [titleRaw, descriptionRaw] = (content || '').split('|').map((item) => item.trim());

                if (!hasPhoto && !titleRaw && !descriptionRaw) {
                    await sendReply(msg, t(lang, 'owner_group_change_info_hint'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                try {
                    if (titleRaw) {
                        await bot.setChatTitle(targetChatId, titleRaw.slice(0, 128));
                    }
                    if (descriptionRaw) {
                        await bot.setChatDescription(targetChatId, descriptionRaw.slice(0, 255));
                    }
                    if (hasPhoto) {
                        const largest = msg.photo[msg.photo.length - 1];
                        await bot.setChatPhoto(targetChatId, largest.file_id);
                    }
                    await sendReply(msg, t(lang, 'owner_group_change_info_done'), { reply_markup: buildCloseKeyboard(lang) });
                } catch (error) {
                    log.warn(`Failed to change group info for ${targetChatId}: ${error.message}`);
                    await sendReply(msg, t(lang, 'owner_group_change_info_failed'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                ownerActionStates.set(userId, { mode: 'group_stats', step: 'idle', chatId: state.chatId });
                await sendOwnerGroupDetail(state.chatId, targetChatId, lang);
                return true;
            }

            await sendReply(msg, t(lang, 'owner_group_dashboard_hint'), { reply_markup: buildCloseKeyboard(lang) });
            return true;
        }

        if (state.mode === 'run_command') {
            if (state.step === 'target') {
                const parts = content.split(/\s+/).filter(Boolean);
                const targetToken = (parts.shift() || '').trim();
                const secondaryToken = parts.join(' ');

                if (!targetToken) {
                    await sendReply(msg, t(lang, 'owner_run_target_prompt'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                if (targetToken.toLowerCase() === 'all') {
                    ownerActionStates.set(userId, { ...state, step: 'command', targetScope: 'all' });
                    await sendReply(msg, t(lang, 'owner_run_command_prompt'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                const lookup = targetToken.replace(/^@/, '');
                const resolved = await db.findUserByIdOrUsername(lookup);
                const targetId = resolved?.chatId?.toString() || targetToken.match(/-?\d+/)?.[0];

                if (!targetId) {
                    await sendReply(msg, t(lang, 'owner_run_invalid_user'), { reply_markup: buildCloseKeyboard(lang) });
                    return true;
                }

                let targetChatId = null;
                let targetGroupProfile = null;
                if (secondaryToken) {
                    const { targetChatId: resolvedChatId, profile } = await resolveOwnerGroupTarget(secondaryToken);
                    if (!resolvedChatId) {
                        await sendReply(msg, t(lang, 'owner_run_group_invalid'), { reply_markup: buildCloseKeyboard(lang) });
                        return true;
                    }
                    targetChatId = resolvedChatId;
                    targetGroupProfile = profile || null;
                }

                ownerActionStates.set(userId, {
                    ...state,
                    step: 'command',
                    targetScope: 'single',
                    targetChatId,
                    targetGroupProfile,
                    targetUser: {
                        id: targetId,
                        username: resolved?.username || lookup,
                        fullName: resolved?.fullName || null
                    }
                });
                await sendReply(msg, t(lang, 'owner_run_command_prompt'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            if (state.step === 'command') {
                const commandText = content.startsWith('/') ? content : `/${content}`;
                const targets = [];

                if (state.targetScope === 'all') {
                    const groups = await db.listGroupProfiles();
                    groups.forEach((profile) => {
                        targets.push({ chatId: profile.chatId.toString(), profile });
                    });
                } else {
                    targets.push({
                        chatId: state.targetChatId || state.targetUser?.id || msg.chat.id.toString(),
                        profile: state.targetGroupProfile || null
                    });
                }

                let success = 0;
                let failed = 0;

                for (const target of targets) {
                    const groupMeta = state.targetScope === 'all'
                        ? await resolveGroupMetadata(target.chatId, target.profile)
                        : (state.targetChatId ? await resolveGroupMetadata(target.chatId, target.profile) : null);
                    const synthetic = {
                        message_id: Date.now(),
                        from: {
                            id: state.targetUser?.id || msg.from?.id,
                            is_bot: false,
                            username: state.targetUser?.username || msg.from?.username || undefined,
                            first_name: state.targetUser?.fullName || state.targetUser?.username || msg.from?.first_name || 'User'
                        },
                        chat: {
                            id: target.chatId,
                            type: target.chatId === msg.chat.id.toString()
                                ? msg.chat?.type || 'private'
                                : (groupMeta?.type || (target.chatId.toString().startsWith('-') ? 'supergroup' : 'private')),
                            title: groupMeta?.title || groupMeta?.username || target.chatId,
                            username: groupMeta?.username || undefined,
                            isDelegated: target.chatId !== msg.chat.id.toString()
                        },
                        date: Math.floor(Date.now() / 1000),
                        text: commandText,
                        ownerRedirectId: msg.chat.id.toString(),
                        ownerExecutorId: userId,
                        ownerExecutorUsername: msg.from?.username
                    };

                    try {
                        await bot.processUpdate({ update_id: Date.now(), message: synthetic });
                        success += 1;
                    } catch (error) {
                        log.error(`Failed to run delegated command for ${target.chatId}: ${error.message}`);
                        failed += 1;
                    }
                }

                const summaryKey = state.targetScope === 'all' ? 'owner_run_done_all' : 'owner_run_done';
                const chatLabel = state.targetScope === 'all'
                    ? t(lang, 'owner_run_all_chats')
                    : (state.targetChatId || t(lang, 'owner_run_private_chat'));

                await sendReply(msg, t(lang, summaryKey, {
                    command: commandText,
                    user: state.targetUser?.id || t(lang, 'owner_run_all_users'),
                    chat: chatLabel,
                    success,
                    failed
                }), { reply_markup: buildCloseKeyboard(lang) });

                clearOwnerAction(userId);
                return true;
            }
        }

        if (state.mode === 'user_check') {
            const lowered = content.toLowerCase();
            const revokeIntent = lowered.startsWith('revoke ') || lowered.startsWith('remove ');
            const lookupRaw = revokeIntent ? content.replace(/^(revoke|remove)\s+/i, '') : content;

            if (!lookupRaw) {
                await sendReply(msg, t(lang, 'owner_user_check_prompt'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            const lookup = lookupRaw.replace(/^@/, '');
            let found = await db.findUserByIdOrUsername(lookup);
            const ownerId = BOT_OWNER_ID ? BOT_OWNER_ID.toString() : null;
            const lookupLower = lookup.toLowerCase();
            const callerId = msg.from?.id?.toString();
            const callerUsername = msg.from?.username || '';
            const callerOwner = isOwner(callerId, callerUsername);
            const matchesOwnerId = ownerId && lookup === ownerId;
            const matchesOwnerUsername = ADDITIONAL_OWNER_USERNAME && lookupLower === ADDITIONAL_OWNER_USERNAME.toLowerCase();
            const matchesCaller = callerOwner && (lookup === callerId || lookupLower === callerUsername.toLowerCase());

            if (!found && (matchesOwnerId || matchesOwnerUsername || matchesCaller)) {
                found = {
                    chatId: ownerId || callerId || lookup,
                    username: callerUsername || ADDITIONAL_OWNER_USERNAME || lookup
                };
            }

            const isKnown = Boolean(found);

            if (!isKnown) {
                await sendReply(msg, t(lang, 'owner_user_not_found'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            const chatId = found.chatId?.toString();
            if (chatId && isLikelyGroupChatId(chatId)) {
                await sendReply(msg, t(lang, 'owner_user_not_found'), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }
            if (revokeIntent && chatId) {
                await revokeCoOwner(chatId);
                await sendReply(msg, t(lang, 'owner_coowner_revoked', { target: chatId }), { reply_markup: buildCloseKeyboard(lang) });
                return true;
            }

            const role = isOwner(chatId, found.username)
                ? t(lang, 'owner_user_role_owner')
                : coOwnerIds.has(chatId)
                    ? t(lang, 'owner_user_role_coowner')
                    : bannedUserIds.has(chatId)
                        ? t(lang, 'owner_user_role_banned')
                        : t(lang, 'owner_user_role_member');

            const headers = [
                t(lang, 'owner_table_name'),
                t(lang, 'owner_table_username'),
                t(lang, 'owner_table_id'),
                t(lang, 'owner_table_first_seen'),
                t(lang, 'owner_table_last_seen'),
                t(lang, 'owner_table_role')
            ];

            const rows = [[
                escapeHtml(found.fullName || ''),
                found.username ? `@${escapeHtml(found.username)}` : '',
                escapeHtml(chatId || ''),
                formatTimestampLabel(found.firstSeen),
                formatTimestampLabel(found.lastSeen),
                role
            ]];

            const copyText = buildCopyList([{ id: chatId, label: found.username || found.fullName || chatId }]);

            const parts = [
                t(lang, 'owner_user_lookup_result'),
                formatOwnerTable(headers, rows),
                copyText ? `${t(lang, 'owner_table_copy_hint')}\n${copyText}` : ''
            ];

            await sendReply(msg, parts.filter(Boolean).join('\n\n'), { parse_mode: 'HTML', reply_markup: buildCloseKeyboard(lang) });
            return true;
        }

        if (state.mode === 'ban' || state.mode === 'unban') {
            if (state.step === 'target') {
                const lookup = content.replace(/^@/, '');
                const resolved = await db.findUserByIdOrUsername(lookup);
                const targetId = resolved?.chatId?.toString() || content.match(/-?\d+/)?.[0];

                if (!targetId) {
                    await sendReply(msg, t(lang, 'owner_invalid_target'));
                    return true;
                }

                if (isOwner(targetId, resolved?.username)) {
                    await sendReply(msg, t(lang, 'owner_ban_forbidden'));
                    clearOwnerAction(userId);
                    return true;
                }

                if (state.mode === 'ban') {
                    await revokeCoOwner(targetId);
                    await banUser(targetId, resolved || { username: lookup }, userId);
                    await sendReply(msg, t(lang, 'owner_ban_success', { target: targetId }), { reply_markup: buildCloseKeyboard(lang) });
                } else {
                    await unbanUser(targetId);
                    await sendReply(msg, t(lang, 'owner_unban_success', { target: targetId }), { reply_markup: buildCloseKeyboard(lang) });
                }

                clearOwnerAction(userId);
                return true;
            }
        }

        return false;
    }

    return {
        OWNER_TABLE_LAYOUT,
        OWNER_MENU_ACTIONS,
        OWNER_MENU_GROUPS,
        getDefaultOwnerGroup,
        buildOwnerMenuText,
        buildOwnerMenuKeyboard,
        buildOwnerCommandLimitKeyboard,
        buildOwnerAiCommandLimitKeyboard,
        isLikelyGroupChatId,
        filterGroupProfiles,
        isGroupRevokedError,
        cleanupGroupProfile,
        loadActiveGroupProfiles,
        buildOwnerGroupDashboardKeyboard,
        buildOwnerGroupDetailKeyboard,
        formatOwnerTable,
        extractOwnerBroadcastPayload,
        sendOwnerBroadcastPayload,
        formatOwnerUserCards,
        formatOwnerCommandCards,
        buildCopyList,
        formatOwnerIdCell,
        parseOwnerTargetInput,
        resolveOwnerTargetWithUsername,
        describeOwnerTarget,
        setCommandLimitForUserAndDevices,
        clearCommandLimitForUserAndDevices,
        clearOwnerCaches,
        purgeChatHistory,
        collectAllKnownChatIds,
        clearChatHistoriesForIds,
        clearChatHistoriesForTarget,
        ensureGroupProfile,
        resolveOwnerGroupTarget,
        resolveGroupMetadata,
        hydrateGroupProfiles,
        formatGroupAddress,
        getGroupMemberCountSafe,
        getGroupAdminSummary,
        formatAdminList,
        parseUserIdsFromText,
        purgeBotMessagesInGroup,
        toggleBotAnonymousMode,
        sendOwnerGroupDashboard,
        sendOwnerGroupDetail,
        discardOwnerPanelMessage,
        buildUserInfoLine,
        safeParseJsonObject,
        formatTimestampLabel,
        buildUserBasicInfoBlock,
        formatUserLabel,
        sendChunkedHtmlMessages,
        sendOwnerUserOverview,
        sendOwnerAiStats,
        sendOwnerCommandUsageStats,
        buildServerApiKeyStats,
        sendOwnerApiStats,
        autoDeleteInvalidApiKeys,
        handleOwnerStateMessage
    };
}

module.exports = { createOwnerFeature };