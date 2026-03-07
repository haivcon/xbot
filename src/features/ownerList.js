const { v4: uuidv4 } = require('uuid');

function createOwnerListFeature({
    t,
    escapeHtml,
    formatCommandLabel,
    formatCopyableValueHtml,
    formatUserLabel,
    maskApiKey,
    buildCloseKeyboard,
    ownerListStates,
    bot
}) {
    const OWNER_LIST_DEFAULT_PAGE_SIZE = 10;
    const OWNER_LIST_MAX_STATES = 100;

    function createOwnerListState(type, ownerId, chatId, items, options = {}) {
        const stateId = uuidv4();
        const state = {
            id: stateId,
            type,
            ownerId,
            chatId,
            items: items || [],
            pageSize: options.pageSize || OWNER_LIST_DEFAULT_PAGE_SIZE,
            page: 0,
            filter: options.defaultFilter || 'all',
            searchTerm: options.searchTerm || '',
            meta: options.meta || {},
            messageId: null
        };

        if (ownerListStates.size >= OWNER_LIST_MAX_STATES) {
            const firstKey = ownerListStates.keys().next().value;
            ownerListStates.delete(firstKey);
        }

        ownerListStates.set(stateId, state);
        return state;
    }

    function getOwnerListState(stateId, ownerId) {
        const state = ownerListStates.get(stateId);
        if (state && (!ownerId || state.ownerId === ownerId)) {
            return state;
        }
        return null;
    }

    function updateOwnerListState(stateId, ownerId, updater) {
        const current = getOwnerListState(stateId, ownerId);
        if (!current) {
            return null;
        }

        const updated = typeof updater === 'function' ? updater({ ...current }) : { ...current, ...updater };
        ownerListStates.set(stateId, updated);
        return updated;
    }

    function filterOwnerListItems(state) {
        if (!state) {
            return [];
        }

        const query = (state.searchTerm || '').toLowerCase().trim();
        return state.items.filter((item) => {
            if (state.filter && state.filter !== 'all') {
                if (item.role && item.role !== state.filter) return false;
                if (state.type === 'commands' && state.filter !== 'all' && (!item.commands || !item.commands[state.filter])) return false;
                if (state.type === 'api_keys' && state.filter !== 'all' && (!item.providers || !item.providers[state.filter])) return false;
                if (item.command && state.filter !== 'all' && state.type === 'commands' && item.command !== state.filter) return false;
                if (item.groupFilter && state.type === 'groups' && item.groupFilter !== state.filter) return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [item.search || '', item.label || '', item.username || '', item.userId || '', item.chatId || '']
                .map((v) => (v || '').toString().toLowerCase())
                .join(' ');
            return haystack.includes(query);
        });
    }

    function buildOwnerListNavigation(state, lang) {
        const filtered = filterOwnerListItems(state);
        const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
        const currentPage = Math.min(Math.max(state.page, 0), totalPages - 1);
        const prefix = `owner_list|${state.type}|${state.id}`;

        const inline_keyboard = [];

        // Row 1: Pagination
        inline_keyboard.push([
            { text: '⬅️', callback_data: `${prefix}|prev` },
            { text: `📄 ${currentPage + 1}/${totalPages}`, callback_data: 'noop' },
            { text: '➡️', callback_data: `${prefix}|next` }
        ]);

        // Row 2: Filter & Refresh
        const filterKey = `owner_list_filter_${state.filter}`;
        const translatedFilter = t(lang, filterKey);
        const filterLabel = translatedFilter === filterKey
            ? (state.filter === 'all' ? t(lang, 'owner_list_filter_all') : formatCommandLabel(state.filter, { context: 'plain' }))
            : translatedFilter;

        inline_keyboard.push([
            { text: `🌪 ${t(lang, 'owner_list_filter_button', { value: filterLabel })}`, callback_data: `${prefix}|filter` },
            { text: '🔄 Refresh', callback_data: `${prefix}|refresh` }
        ]);

        // Row 3: Actions (Search, Export)
        inline_keyboard.push([
            { text: `🔍 ${t(lang, 'owner_list_search_button')}`, callback_data: `${prefix}|search` },
            { text: `📥 ${t(lang, 'owner_list_export_button')}`, callback_data: `${prefix}|export` }
        ]);

        // Row 4: Close
        inline_keyboard.push([{ text: `❌ ${t(lang, 'help_button_close')}`, callback_data: 'owner_menu|close' }]);

        return { inline_keyboard, totalPages, currentPage };
    }

    function formatOwnerUserEntry(entry, lang) {
        // Use different icon based on role if available
        let icon = '👤';
        if (entry.role === 'owner') icon = '👑';
        if (entry.role === 'admin') icon = '🛡️';
        if (entry.role === 'banned') icon = '🚫';

        const label = entry.fullName || entry.username ? formatUserLabel(entry) : formatCopyableValueHtml(entry.userId) || entry.userId;
        const safeLabel = typeof label === 'string' ? label : formatCopyableValueHtml(entry.userId) || entry.userId;
        
        return `${icon} <b>${safeLabel}</b>\n   📉 ${t(lang, 'owner_list_total_usage', { total: entry.total || 0 })}`;
    }

    function formatOwnerCommandEntry(entry, lang, { focusCommand = null } = {}) {
        const label = formatUserLabel(entry);
        const lines = [`👤 <b>${label}</b>`, `   📉 ${t(lang, 'owner_list_total_usage', { total: entry.total || 0 })}`];
        const commands = Object.entries(entry.commands || {});
        if (commands.length) {
            const rendered = commands
                .map(([cmd, count]) => {
                    const prefix = focusCommand && focusCommand === cmd ? '👉' : '▫️';
                    return `   ${prefix} <code>/${cmd}</code>: ${count}`;
                })
                .join('\n');
            lines.push(rendered);
        }
        return lines.filter(Boolean).join('\n');
    }

    function formatOwnerAiEntry(entry, lang) {
        const label = formatUserLabel(entry);
        const total = entry.total || entry.commands?.ai || 0;
        return `🤖 <b>${label}</b>\n   💬 ${t(lang, 'owner_list_total_usage', { total })}`;
    }

    function formatOwnerApiEntry(entry, lang) {
        const label = entry.fullName || entry.username ? formatUserLabel(entry) : formatCopyableValueHtml(entry.userId) || entry.userId;
        const safeLabel = typeof label === 'string' ? label : formatCopyableValueHtml(entry.userId) || entry.userId;
        const providerIcons = { google: "🌐", groq: "⚡", server: "🗄️", openai: "🧠", anthropic: "🎭" };
        
        const providerLines = Object.entries(entry.providers || {})
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .map(([provider, count]) => `${providerIcons[provider] || "❓"} <b>${provider.toUpperCase()}</b>: ${count}`)
            .join('  ');

        const maskedKeys = (entry.keys || []).slice(0, 3).map((key) => {
            const name = key.name && key.name.trim() ? key.name.trim() : t(lang, 'ai_api_default_name');
            const providerIcon = providerIcons[key.provider] || "🔑";
            const fullKey = formatCopyableValueHtml(key.apiKey) || escapeHtml(key.apiKey || '');
            return `   ${providerIcon} ${name} · <code>${fullKey || maskApiKey(key.apiKey)}</code>`;
        });

        const blockedLine = entry.blocked ? `\n   ⛔ <b>${t(lang, 'owner_api_blocked_flag')}</b>` : '';
        return [`👤 ${safeLabel}`, `   ${providerLines || t(lang, 'owner_api_no_provider')}`, ...maskedKeys].filter(Boolean).join('\n') + blockedLine;
    }

    function formatOwnerGroupEntry(entry, lang) {
        const name = escapeHtml(entry.title || entry.username || entry.chatId);
        const idCell = formatCopyableValueHtml(entry.chatId) || escapeHtml(entry.chatId || '');
        const countLabel = Number.isFinite(Number(entry.memberCount))
            ? t(lang, 'owner_group_member_count', { count: entry.memberCount })
            : t(lang, 'owner_group_unknown_count');
            
        return `📢 <b>${name}</b>\n   🆔 <code>${idCell}</code>\n   👥 ${countLabel}`;
    }

    function renderOwnerListState(state, lang) {
        if (!state) {
            return null;
        }

        const filtered = filterOwnerListItems(state);
        const nav = buildOwnerListNavigation(state, lang);
        const totalPages = Math.max(1, nav.totalPages);
        const page = Math.min(Math.max(state.page, 0), totalPages - 1);
        const start = page * state.pageSize;
        const slice = filtered.slice(start, start + state.pageSize);

        const body = [];
        
        // Header Section
        if (state.type === 'users') {
            body.push(`👥 <b>${t(lang, 'owner_user_stats_overview', {
                total: state.items.length,
                ownerCount: state.meta.ownerCount || 0,
                coOwnerCount: state.meta.coOwnerCount || 0,
                bannedCount: state.meta.bannedCount || 0
            })}</b>`);
        } else if (state.type === 'commands') {
            const focus = state.filter && state.filter !== 'all' ? state.filter : null;
            body.push(`🧾 <b>${t(lang, 'owner_command_usage_header', { count: state.items.length })}</b>`);
            if (focus) {
                body.push(`🎯 ${t(lang, 'owner_list_filter_now', { value: formatCommandLabel(focus, { context: 'plain' }) })}`);
            }
        } else if (state.type === 'ai') {
            body.push(`🤖 <b>${t(lang, 'owner_ai_stats_title')}</b>`);
        } else if (state.type === 'api_keys') {
            body.push(`🔑 <b>${t(lang, 'owner_api_stats_title', { total: state.items.length })}</b>`);
            if (state.meta?.serverKeys?.length) {
                const serverLines = state.meta.serverKeys.map((entry) => {
                    const icon = entry.provider === 'groq' ? '⚡' : '🌐';
                    return `${icon} ${entry.label}: ${entry.count}`;
                });
                body.push(t(lang, 'owner_api_server_header'));
                body.push(...serverLines);
            }
            if (state.meta?.blocked?.length) {
                body.push(`⛔ ${t(lang, 'owner_api_blocked_count', { count: state.meta.blocked.length })}`);
            }
        } else if (state.type === 'groups') {
            body.push(`🏘️ <b>${t(lang, 'owner_group_dashboard', { count: state.items.length })}</b>`);
        }

        // Active Filters/Search Warning
        if (state.searchTerm) {
            body.push(`🔍 ${t(lang, 'owner_list_search_active', { term: escapeHtml(state.searchTerm) })}`);
        } else if (state.filter && state.filter !== 'all' && state.type !== 'commands') {
             body.push(`🌪 ${t(lang, 'owner_list_filter_now', { value: state.filter.toUpperCase() })}`);
        }

        // Separator
        body.push('━━━━━━━━━━━━━━━━');

        // List Items
        if (!slice.length) {
            body.push(`<i>${t(lang, 'owner_list_no_results')}</i>`);
        } else {
            if (state.type === 'users') {
                slice.forEach((entry) => body.push(formatOwnerUserEntry(entry, lang)));
            } else if (state.type === 'commands') {
                const focus = state.filter && state.filter !== 'all' ? state.filter : null;
                slice.forEach((entry) => body.push(formatOwnerCommandEntry(entry, lang, { focusCommand: focus })));
            } else if (state.type === 'ai') {
                slice.forEach((entry) => body.push(formatOwnerAiEntry(entry, lang)));
            } else if (state.type === 'api_keys') {
                slice.forEach((entry) => body.push(formatOwnerApiEntry(entry, lang)));
            } else if (state.type === 'groups') {
                slice.forEach((entry, index) => {
                    body.push(`${formatOwnerGroupEntry(entry, lang)}\n#️⃣ <i>${t(lang, 'owner_list_rank_label', { rank: start + index + 1 })}</i>`);
                });
            }
        }

        // Add context buttons (Group Info or API Key Actions)
        if (state.type === 'groups') {
            const groupButtons = slice.map((entry) => {
                const label = (entry.title || entry.username || entry.chatId || '').toString().slice(0, 30);
                return [{ text: `ℹ️ ${label}`, callback_data: `owner_group|info|${entry.chatId}` }];
            });
            nav.inline_keyboard = [...groupButtons, ...nav.inline_keyboard];
        } else if (state.type === 'api_keys') {
            const managementRow = [
                { text: `🗑️ ${t(lang, 'owner_api_button_delete')}`, callback_data: 'owner_api|delete' },
                { text: `➕ ${t(lang, 'owner_api_button_add')}`, callback_data: 'owner_api|add' }
            ];
            const blockRow = [
                { text: `🚫 ${t(lang, 'owner_api_button_block')}`, callback_data: 'owner_api|block' },
                { text: `✅ ${t(lang, 'owner_api_button_unblock')}`, callback_data: 'owner_api|unblock' }
            ];
            const extraRow = [
                { text: `🧹 ${t(lang, 'owner_api_button_autodelete')}`, callback_data: 'owner_api|autodelete' },
                { text: `💬 ${t(lang, 'owner_api_button_message')}`, callback_data: 'owner_api|message' }
            ];
            nav.inline_keyboard = [managementRow, blockRow, extraRow, ...nav.inline_keyboard];
        }

        const text = body.filter((line) => line !== null && line !== undefined && line !== '').join('\n\n');
        return { text, reply_markup: { inline_keyboard: nav.inline_keyboard }, page, totalPages };
    }

    function resolveOwnerListFilters(state) {
        if (!state) {
            return ['all'];
        }
        if (state.type === 'users') {
            return ['all', 'owner', 'coowner', 'member', 'banned'];
        }
        if (state.type === 'commands') {
            const commands = new Set(['all']);
            for (const entry of state.items || []) {
                Object.keys(entry.commands || {}).forEach((cmd) => commands.add(cmd));
            }
            return Array.from(commands);
        }
        if (state.type === 'ai') {
            return ['all'];
        }
        if (state.type === 'api_keys') {
            const providers = new Set(['all']);
            for (const entry of state.items || []) {
                Object.keys(entry.providers || {}).forEach((provider) => providers.add(provider));
            }
            (state.meta?.serverKeys || []).forEach((entry) => {
                if (entry.provider) {
                    providers.add(entry.provider);
                }
            });
            return Array.from(providers);
        }
        if (state.type === 'groups') {
            return ['all', 'active'];
        }
        return ['all'];
    }

    async function exportOwnerList(state, lang, chatId) {
        if (!state) {
            return;
        }
        const filtered = filterOwnerListItems(state);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let csv = '';
        if (state.type === 'users') {
            csv = ['role,name,username,id,firstSeen,lastSeen'].concat(filtered.map((entry) => (
                `${entry.role || ''},"${(entry.fullName || '').replace(/"/g, '""')}",${entry.username || ''},${entry.chatId || entry.userId || ''},${entry.firstSeen || ''},${entry.lastSeen || ''}`
            ))).join('\n');
        } else if (state.type === 'commands' || state.type === 'ai') {
            csv = ['userId,username,fullName,total,commands'].concat(filtered.map((entry) => {
                const commands = Object.entries(entry.commands || {})
                    .map(([cmd, count]) => `${cmd}:${count}`)
                    .join('|');
                return `${entry.userId || ''},${entry.username || ''},"${(entry.fullName || '').replace(/"/g, '""')}",${entry.total || 0},${commands}`;
            })).join('\n');
        } else if (state.type === 'api_keys') {
            csv = ['userId,username,fullName,providers,keys'].concat(filtered.map((entry) => {
                const providers = Object.entries(entry.providers || {})
                    .map(([provider, count]) => `${provider}:${count}`)
                    .join('|');
                const keys = (entry.keys || [])
                    .map((key) => `${key.provider}:${(key.apiKey || '').replace(/,/g, '')}:${(key.name || '').replace(/,/g, '')}`)
                    .join('|');
                return `${entry.userId || ''},${entry.username || ''},"${(entry.fullName || '').replace(/"/g, '""')}",${providers},${keys}`;
            })).join('\n');
        } else if (state.type === 'groups') {
            csv = ['chatId,title,username,memberCount'].concat(filtered.map((entry) => (
                `${entry.chatId || ''},"${(entry.title || '').replace(/"/g, '""')}",${entry.username || ''},${entry.memberCount || ''}`
            ))).join('\n');
        }

        const buffer = Buffer.from(csv, 'utf8');
        const filename = `${state.type}-export-${timestamp}.csv`;

        try {
            await bot.sendDocument(chatId, buffer, {
                caption: t(lang, 'owner_list_export_caption', { count: filtered.length }),
                parse_mode: 'HTML'
            }, {
                filename,
                contentType: 'text/csv'
            });
        } catch (error) {
            console.warn(`[Owner] Failed to export list for ${chatId}: ${error.message}`);
            await bot.sendMessage(chatId, t(lang, 'owner_list_export_failed'), {
                reply_markup: buildCloseKeyboard(lang)
            });
        }
    }

    return {
        createOwnerListState,
        getOwnerListState,
        updateOwnerListState,
        filterOwnerListItems,
        buildOwnerListNavigation,
        formatOwnerUserEntry,
        formatOwnerApiEntry,
        formatOwnerGroupEntry,
        renderOwnerListState,
        resolveOwnerListFilters,
        exportOwnerList,
        formatOwnerCommandEntry,
        formatOwnerAiEntry
    };
}

module.exports = createOwnerListFeature;