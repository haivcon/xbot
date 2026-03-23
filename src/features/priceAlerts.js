const logger = require('../core/logger');
const log = logger.child('PriceAlert');

// Module-level wizard state for external access by userInputState.js
const priceWizardStates = new Map();

function createPriceAlerts(deps) {
    const {
        t,
        defaultLang,
        getLang,
        escapeHtml,
        bot,
        delay,
        shortenAddress,
        sendReply,
        sendMessageRespectingThread,
        buildCloseKeyboard,
        buildPaginatedChainKeyboard,
        sortChainsWithPriority,
        getChainIcon,
        collectTxhashChainEntries,
        resolveGroupLanguage,
        resolveTopicLanguage,
        resolveNotificationLanguage,
        isGroupAdmin,
        openAdminHub,
        adminHubSessions,
        formatMarkdownTableBlock,
        HELP_TABLE_LAYOUT,
        listPriceAlertTokens,
        getPriceAlertToken,
        upsertPriceAlertToken,
        updatePriceAlertToken,
        deletePriceAlertToken,
        listDuePriceAlertTokens,
        recordPriceAlertRun,
        addFeatureTopic,
        listFeatureTopics,
        removeFeatureTopic,
        listPriceAlertTokenTopics,
        setPriceAlertTokenTopic,
        setPriceAlertTarget,
        getPriceAlertTarget,
        fetchTokenPriceOverview,
        addPriceAlertMedia,
        listPriceAlertMedia,
        deletePriceAlertMedia,
        deleteAllPriceAlertMedia,
        countPriceAlertMedia,
        addPriceAlertTitle,
        listPriceAlertTitles,
        deletePriceAlertTitle,
        deleteAllPriceAlertTitles,
        countPriceAlertTitles,
        PRICE_ALERT_DEFAULT_INTERVAL,
        PRICE_ALERT_POLL_INTERVAL_MS,
        PRICE_ALERT_MAX_PER_TICK,
        PRICE_ALERT_RATE_LIMIT_MS
    } = deps;
    const priceMenuSessions = new Map();
    // priceWizardStates is now module-level for external access
    const priceChainStates = new Map();
    const tokenMetaCache = new Map();
    let priceSchedulerTimer = null;
    const META_CACHE_TTL = 10 * 60 * 1000;
    const INTERVAL_OPTIONS = [60, 120, 300, 600, 1800, 3600, 7200, 18000, 43200, 86400];
    const PRICE_ALERT_MAX_TOKENS = 3;
    const formatIntervalLabel = (seconds, langForLabel = defaultLang) => {
        const sec = Number(seconds);
        if (!Number.isFinite(sec) || sec <= 0) {
            return formatIntervalLabel(PRICE_ALERT_DEFAULT_INTERVAL, langForLabel);
        }
        if (sec < 3600) {
            const minutes = Math.round(sec / 60);
            return `⏱ ${minutes} ${t(langForLabel, 'price_interval_minutes')}`;
        }
        const hours = Math.round(sec / 3600);
        return `⏲️ ${hours} ${t(langForLabel, 'price_interval_hours')}`;
    };
    const formatNumberWithCommas = (value, { prefix = '', suffix = '' } = {}) => {
        if (value === null || value === undefined) {
            return `${prefix}0${suffix}`;
        }
        const raw = typeof value === 'number' && Number.isFinite(value)
            ? value.toString()
            : String(value || '').replace(/,/g, '').trim();
        if (!raw) {
            return `${prefix}0${suffix}`;
        }
        const [intPartRaw, fracPartRaw = ''] = raw.split('.');
        const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        // Remove trailing zeros but keep original precision
        const fracPart = fracPartRaw.replace(/0+$/, '');
        const decimal = fracPart.length ? `.${fracPart}` : '';
        return `${prefix}${intPart}${decimal}${suffix}`;
    };
    const formatPercent = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return null;
        }
        const sign = numeric >= 0 ? '+' : '-';
        const abs = Math.abs(numeric);
        return `${sign}${abs.toFixed(2)}%`;
    };
    const formatChainLabel = (entry) => {
        if (!entry) {
            return '#';
        }
        const icon = getChainIcon(entry) || '';
        const name = entry.chainShortName || entry.chainName || '#';
        const id = Number.isFinite(entry.chainIndex) ? `#${entry.chainIndex}` : '';
        return `${icon} ${name}${id ? ` (${id})` : ''}`.trim();
    };
    // Build ASCII box table for price alerts (Premium 2-column style)
    // Helper: Calculate visual width (CJK characters = 2, ASCII = 1)
    const getVisualWidth = (str) => {
        let width = 0;
        for (const char of String(str || '')) {
            const code = char.codePointAt(0);
            // CJK ranges: Chinese, Japanese, Korean, CJK symbols
            if (
                (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
                (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
                (code >= 0xAC00 && code <= 0xD7AF) ||   // Korean Hangul
                (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols and Punctuation
                (code >= 0xFF00 && code <= 0xFFEF) ||   // Fullwidth Forms
                (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
                (code >= 0x30A0 && code <= 0x30FF)      // Katakana
            ) {
                width += 2;
            } else {
                width += 1;
            }
        }
        return width;
    };
    const buildAsciiBoxTable = (rows, { col1Width = 15, col2Width = 27 } = {}) => {
        const pad = (str, targetWidth) => {
            const s = String(str || '');
            const visualWidth = getVisualWidth(s);
            if (visualWidth >= targetWidth) {
                // Truncate if too long, accounting for visual width
                let result = '';
                let currentWidth = 0;
                for (const char of s) {
                    const charWidth = getVisualWidth(char);
                    if (currentWidth + charWidth > targetWidth) break;
                    result += char;
                    currentWidth += charWidth;
                }
                // Pad any remaining space
                return result + ' '.repeat(Math.max(0, targetWidth - getVisualWidth(result)));
            }
            return s + ' '.repeat(targetWidth - visualWidth);
        };
        const lines = [];
        // Top border
        lines.push(`╔${'═'.repeat(col1Width)}╦${'═'.repeat(col2Width)}╗`);
        rows.forEach((row, idx) => {
            if (row.separator) {
                lines.push(`╠${'═'.repeat(col1Width)}╬${'═'.repeat(col2Width)}╣`);
            } else {
                const label = pad(row.label || '', col1Width);
                const value = pad(row.value || '', col2Width);
                lines.push(`║${label}║${value}║`);
            }
        });
        // Bottom border
        lines.push(`╚${'═'.repeat(col1Width)}╩${'═'.repeat(col2Width)}╝`);
        return lines.join('\n');
    };
    const mapChainEntries = async () => {
        const chains = await collectTxhashChainEntries();
        return sortChainsWithPriority(chains, { preferChainIndex: 196, preferAliases: ['xlayer', 'x-layer'] });
    };
    const cacheTokenMeta = (key, meta) => {
        if (!key || !meta) {
            return;
        }
        tokenMetaCache.set(key, {
            meta,
            expiresAt: Date.now() + META_CACHE_TTL
        });
    };
    const getCachedMeta = (key) => {
        if (!key) {
            return null;
        }
        const cached = tokenMetaCache.get(key);
        if (!cached) {
            return null;
        }
        if (cached.expiresAt && cached.expiresAt < Date.now()) {
            tokenMetaCache.delete(key);
            return null;
        }
        return cached.meta;
    };
    const buildTokenLabel = (token, snapshot) => {
        const label = token?.tokenLabel || snapshot?.tokenName || snapshot?.tokenSymbol;
        if (label) {
            return label;
        }
        if (token?.tokenAddress) {
            return shortenAddress(token.tokenAddress);
        }
        return t(defaultLang, 'price_token_fallback_label');
    };
    const buildTopicLink = (chatId, topicId) => {
        if (!chatId || !topicId || topicId === 'main') {
            return null;
        }
        const chatStr = chatId.toString();
        const numeric = chatStr.startsWith('-100')
            ? chatStr.slice(4)
            : chatStr.replace(/^-/, '');
        if (!numeric) {
            return null;
        }
        return `https://t.me/c/${numeric}/${topicId}`;
    };
    const buildAdminHomeView = async (chatId, lang) => {
        const tokens = await listPriceAlertTokens(chatId);
        const target = await getPriceAlertTarget(chatId);
        const featureTopics = await listFeatureTopics(chatId, 'price');
        const activeTopics = (featureTopics && featureTopics.length)
            ? featureTopics
            : (target ? [{ topicId: target.topicId === undefined || target.topicId === null ? 'main' : target.topicId.toString() }] : []);
        const topicLabel = activeTopics && activeTopics.length
            ? activeTopics
                .map((entry) => (entry.topicId === undefined || entry.topicId === null ? 'main' : entry.topicId.toString()))
                .map((key) => (key === 'main' ? t(lang, 'price_topic_main') : key))
                .join(', ')
            : t(lang, 'price_menu_target_missing');
        const headerLabel = escapeHtml(t(lang, 'help_table_command_header'));
        const headerValue = escapeHtml(t(lang, 'help_table_description_header'));
        const tableSource = [
            `| ${headerLabel} | ${headerValue} |`,
            '| --- | --- |',
            `| ${escapeHtml(t(lang, 'price_menu_target_label'))} | ${escapeHtml(topicLabel)} |`,
            `| ${escapeHtml(t(lang, 'price_menu_hint_label'))} | ${escapeHtml(t(lang, 'price_menu_hint'))} |`,
            `| ${escapeHtml(t(lang, 'price_menu_pricev_label'))} | ${escapeHtml(t(lang, 'price_menu_pricev_hint'))} |`,
            `| ${escapeHtml(t(lang, 'price_menu_pricex_label'))} | ${escapeHtml(t(lang, 'price_menu_pricex_hint'))} |`
        ];
        const formattedTable = formatMarkdownTableBlock(tableSource, HELP_TABLE_LAYOUT);
        const tokensHeader = escapeHtml(t(lang, 'price_menu_tokens_header', { count: tokens.length, max: PRICE_ALERT_MAX_TOKENS }));
        let tokensSection = tokensHeader;
        if (!tokens.length) {
            tokensSection = [tokensHeader, escapeHtml(t(lang, 'price_menu_empty'))].join('\n');
        }

        // Build keyboard with grid layout for tokens
        const keyboard = { inline_keyboard: [] };

        // Token buttons in grid (up to 3 per row, directly under title)
        if (tokens.length > 0) {
            const tokenRow = [];
            tokens.forEach((token) => {
                const label = buildTokenLabel(token);
                const status = Number(token.enabled) === 1 ? '✅' : '⏸️';
                tokenRow.push({
                    text: `${status} ${label}`,
                    callback_data: `price_token|${chatId}|${token.id}`
                });
            });
            keyboard.inline_keyboard.push(tokenRow);
        }

        // Add Token button (only show if less than 3 tokens)
        if (tokens.length < PRICE_ALERT_MAX_TOKENS) {
            keyboard.inline_keyboard.push([
                { text: `➕ ${t(lang, 'price_button_add')}`, callback_data: `price_add|${chatId}` }
            ]);
        }

        // Refresh and Close buttons
        keyboard.inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_refresh'), callback_data: `price_refresh|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `price_close|${chatId}` }
        ]);

        const text = [
            `<b>${escapeHtml(t(lang, 'price_menu_title'))}</b>`,
            `<pre>${escapeHtml(formattedTable)}</pre>`,
            tokensSection
        ].filter(Boolean).join('\n');
        return { text, reply_markup: keyboard };
    };
    const buildTopicsView = async (chatId, tokenId, lang) => {
        const featureTopics = await listFeatureTopics(chatId, 'price');
        if (!featureTopics || featureTopics.length === 0) {
            return null;
        }
        const tokenTopics = tokenId ? await listPriceAlertTokenTopics(tokenId, chatId) : [];
        const statusMap = new Map();
        tokenTopics.forEach((entry) => {
            const key = (entry.topicId === undefined || entry.topicId === null ? 'main' : entry.topicId.toString());
            statusMap.set(key, Number(entry.enabled) === 1);
        });
        const rows = featureTopics.map((entry) => {
            const topicKey = entry.topicId === undefined || entry.topicId === null ? 'main' : entry.topicId.toString();
            const isOn = statusMap.has(topicKey) ? statusMap.get(topicKey) : true;
            const label = topicKey === 'main' ? t(lang, 'price_topic_main') : topicKey;
            const prefix = isOn ? '🟢' : '⚪️';
            return [{
                text: `${prefix} ${label}`,
                callback_data: `price_topic_toggle|${chatId}|${tokenId}|${topicKey}`
            }];
        });
        rows.push([
            { text: t(lang, 'price_button_back'), callback_data: `price_token|${chatId}|${tokenId}` },
            { text: '✖️', callback_data: `price_close|${chatId}` }
        ]);
        const text = [
            t(lang, 'price_topics_title'),
            '',
            t(lang, 'price_topics_hint')
        ].join('\n');
        return { text, reply_markup: { inline_keyboard: rows } };
    };
    const buildManageView = async (chatId, lang) => {
        const tokens = await listPriceAlertTokens(chatId);
        const lines = [t(lang, 'price_manage_title'), `<i>${escapeHtml(t(lang, 'price_manage_hint'))}</i>`];
        const keyboard = { inline_keyboard: [] };
        if (!tokens.length) {
            lines.push('', t(lang, 'price_menu_empty'));
        } else {
            tokens.forEach((token) => {
                const label = buildTokenLabel(token);
                const status = Number(token.enabled) === 1 ? '✅' : '🚫';
                keyboard.inline_keyboard.push([{
                    text: `${status} ${label}`,
                    callback_data: `price_token|${chatId}|${token.id}`
                }]);
            });
        }
        keyboard.inline_keyboard.push([
            { text: '⬅️ ' + t(lang, 'price_button_back'), callback_data: `price_home|${chatId}` },
            { text: '✖️', callback_data: `price_close|${chatId}` }
        ]);
        return { text: lines.filter(Boolean).join('\n'), reply_markup: keyboard };
    };
    const buildTokenDetailView = async (token, snapshot, lang, mediaCount = 0, titleCount = 0) => {
        const label = buildTokenLabel(token, snapshot);
        const chainLabel = token.chainShortName || (Number.isFinite(token.chainIndex) ? `#${token.chainIndex}` : t(lang, 'price_chain_unknown'));
        const interval = formatIntervalLabel(token.intervalSeconds, lang);
        const status = Number(token.enabled) === 1 ? t(lang, 'price_status_on') : t(lang, 'price_status_off');

        // Build preview using the same format as the alert that will be sent
        const previewText = buildAlertText(lang, token, snapshot || {});

        const lines = [
            `<b>${t(lang, 'price_detail_title', { label: escapeHtml(label) })}</b>`,
            '',
            `${t(lang, 'price_detail_status')}: ${escapeHtml(status)}`,
            `${t(lang, 'price_detail_chain')}: ${escapeHtml(chainLabel)}`,
            `${t(lang, 'price_detail_interval')}: ${escapeHtml(interval)}`,
            '',
            `<b>${t(lang, 'price_preview_title')}</b>`,
            previewText
        ];

        // Show custom title if set
        if (token.customTitle) {
            lines.splice(5, 0, `${t(lang, 'price_detail_custom_title')}: ${escapeHtml(token.customTitle)}`);
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: t(lang, 'price_button_toggle'), callback_data: `price_toggle|${token.chatId}|${token.id}` }],
                [{ text: t(lang, 'price_button_interval_custom'), callback_data: `price_interval_custom|${token.chatId}|${token.id}` }],
                [{ text: t(lang, 'price_button_chain'), callback_data: `price_chain|${token.chatId}|${token.id}` }],
                [{ text: t(lang, 'price_button_rename'), callback_data: `price_rename|${token.chatId}|${token.id}` }],
                [{ text: t(lang, 'price_button_topics'), callback_data: `price_topics|${token.chatId}|${token.id}` }],
                [
                    { text: t(lang, 'price_button_custom_title', { count: titleCount }), callback_data: `price_title|${token.chatId}|${token.id}` },
                    { text: t(lang, 'price_button_attach_media', { count: mediaCount }), callback_data: `price_media|${token.chatId}|${token.id}` }
                ],
                [{ text: t(lang, 'price_button_send_now'), callback_data: `price_send|${token.chatId}|${token.id}` }],
                [{ text: '🗑️ ' + t(lang, 'price_button_delete'), callback_data: `price_delete|${token.chatId}|${token.id}` }],
                [
                    { text: '⬅️ ' + t(lang, 'price_button_back'), callback_data: `price_home|${token.chatId}` },
                    { text: '✖️', callback_data: `price_close|${token.chatId}` }
                ]
            ]
        };
        return { text: lines.filter(Boolean).join('\n'), reply_markup: keyboard };
    };
    const sendPriceAdminMenu = async (userId, chatId, { fallbackLang, langOverride = null, view = 'home', tokenId = null } = {}) => {
        const lang = langOverride || await resolveNotificationLanguage(userId, fallbackLang || defaultLang);
        const key = userId?.toString();
        if (!key || !chatId) {
            return;
        }
        let payload;
        if (view === 'manage') {
            payload = await buildManageView(chatId, lang);
        } else if (view === 'token' && tokenId) {
            const token = await getPriceAlertToken(chatId, tokenId);
            if (!token) {
                payload = await buildManageView(chatId, lang);
            } else {
                const cacheKey = `${token.tokenAddress}|${token.chainIndex || ''}`;
                const cached = getCachedMeta(cacheKey);
                let snapshot = cached;
                if (!snapshot) {
                    try {
                        snapshot = await fetchTokenPriceOverview({
                            tokenAddress: token.tokenAddress,
                            chainIndex: token.chainIndex,
                            chainShortName: token.chainShortName,
                            throttleMs: PRICE_ALERT_RATE_LIMIT_MS
                        });
                        if (snapshot) {
                            cacheTokenMeta(cacheKey, snapshot);
                        }
                    } catch (error) {
                        // ignore preview fetch errors
                    }
                }
                const mediaCount = await countPriceAlertMedia(token.id, token.chatId);
                const titleCount = await countPriceAlertTitles(token.id, token.chatId);
                payload = await buildTokenDetailView(token, snapshot, lang, mediaCount, titleCount);
            }
        } else {
            payload = await buildAdminHomeView(chatId, lang);
        }
        const session = priceMenuSessions.get(key);
        if (session) {
            try {
                await bot.editMessageText(payload.text, {
                    chat_id: userId,
                    message_id: session.messageId,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: payload.reply_markup
                });
                priceMenuSessions.set(key, { messageId: session.messageId, chatId });
                return;
            } catch (error) {
                priceMenuSessions.delete(key);
            }
        }
        const sent = await bot.sendMessage(userId, payload.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: payload.reply_markup
        });
        if (sent?.message_id) {
            priceMenuSessions.set(key, { messageId: sent.message_id, chatId });
        }
    };
    const buildChainMenu = async (userId, chatId, tokenId, lang, page = 0) => {
        const chainOptions = await mapChainEntries();
        const keyboard = buildPaginatedChainKeyboard(chainOptions, {
            t,
            lang,
            prefix: `pricechain|${chatId}|${tokenId}`,
            page,
            perRow: 2,
            maxRows: 5,
            closeCallbackData: `price_close|${chatId}`,
            formatLabel: formatChainLabel,
            preferChainIndex: 196,
            preferAliases: ['xlayer']
        });
        priceChainStates.set(userId, { chatId, tokenId, chainOptions, page: keyboard.page });
        return keyboard;
    };

    // ═══ TITLE LIST MENU WITH PAGINATION ═══
    const TITLE_PAGE_SIZE = 5;
    const MEDIA_PAGE_SIZE = 5;
    const MAX_TITLES = 44;
    const MAX_MEDIA = 44;

    const buildTitleListMenu = async (chatId, tokenId, lang, page = 0) => {
        const titleList = await listPriceAlertTitles(tokenId, chatId);
        const totalCount = titleList.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / TITLE_PAGE_SIZE));
        const currentPage = Math.min(Math.max(0, page), totalPages - 1);
        const startIdx = currentPage * TITLE_PAGE_SIZE;
        const pageItems = titleList.slice(startIdx, startIdx + TITLE_PAGE_SIZE);

        const keyboard = { inline_keyboard: [] };
        pageItems.forEach((ti, idx) => {
            const shortTitle = ti.title.length > 20 ? ti.title.substring(0, 20) + '...' : ti.title;
            const globalIdx = startIdx + idx + 1;
            keyboard.inline_keyboard.push([
                { text: `📝 ${globalIdx}. ${shortTitle}`, callback_data: `price_title_view|${chatId}|${tokenId}|${ti.id}` },
                { text: '🗑️', callback_data: `price_title_del|${chatId}|${tokenId}|${ti.id}` }
            ]);
        });

        // Pagination row (always show)
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({ text: '⬅️', callback_data: `price_title_page|${chatId}|${tokenId}|${currentPage - 1}` });
        }
        navRow.push({ text: `📄 ${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
        if (currentPage < totalPages - 1) {
            navRow.push({ text: '➡️', callback_data: `price_title_page|${chatId}|${tokenId}|${currentPage + 1}` });
        }
        keyboard.inline_keyboard.push(navRow);

        // Add buttons (if not at max)
        if (totalCount < MAX_TITLES) {
            keyboard.inline_keyboard.push([
                { text: `➕ ${t(lang, 'price_title_add_button')}`, callback_data: `price_title_add|${chatId}|${tokenId}` },
                { text: `📋 ${t(lang, 'price_title_bulk_add_button')}`, callback_data: `price_title_bulk|${chatId}|${tokenId}` }
            ]);
        }

        // Reset all button
        keyboard.inline_keyboard.push([
            { text: `🗑️ ${t(lang, 'price_title_reset_all')}`, callback_data: `price_title_reset|${chatId}|${tokenId}` }
        ]);

        // Back and close
        keyboard.inline_keyboard.push([
            { text: '⬅️ ' + t(lang, 'price_button_back'), callback_data: `price_token|${chatId}|${tokenId}` },
            { text: '✖️ ' + t(lang, 'price_button_close'), callback_data: `price_close|${chatId}` }
        ]);

        const text = [
            `<b>📝 ${t(lang, 'price_title_manager')}</b>`,
            '',
            t(lang, 'price_title_hint'),
            '',
            `📊 ${t(lang, 'price_title_count', { count: totalCount, max: MAX_TITLES })}`
        ].join('\n');

        return { text, keyboard, page: currentPage, totalPages };
    };

    const buildMediaListMenu = async (chatId, tokenId, lang, page = 0) => {
        const mediaList = await listPriceAlertMedia(tokenId, chatId);
        const totalCount = mediaList.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / MEDIA_PAGE_SIZE));
        const currentPage = Math.min(Math.max(0, page), totalPages - 1);
        const startIdx = currentPage * MEDIA_PAGE_SIZE;
        const pageItems = mediaList.slice(startIdx, startIdx + MEDIA_PAGE_SIZE);

        const keyboard = { inline_keyboard: [] };
        pageItems.forEach((media, idx) => {
            const typeIcon = media.mediaType === 'video' ? '🎬' : '🖼️';
            const globalIdx = startIdx + idx + 1;
            keyboard.inline_keyboard.push([
                { text: `${typeIcon} ${globalIdx}. ${media.mediaType}`, callback_data: `price_media_view|${chatId}|${tokenId}|${media.id}` },
                { text: '🗑️', callback_data: `price_media_del|${chatId}|${tokenId}|${media.id}` }
            ]);
        });

        // Pagination row (always show)
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({ text: '⬅️', callback_data: `price_media_page|${chatId}|${tokenId}|${currentPage - 1}` });
        }
        navRow.push({ text: `📄 ${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
        if (currentPage < totalPages - 1) {
            navRow.push({ text: '➡️', callback_data: `price_media_page|${chatId}|${tokenId}|${currentPage + 1}` });
        }
        keyboard.inline_keyboard.push(navRow);

        // Add buttons (if not at max)
        if (totalCount < MAX_MEDIA) {
            keyboard.inline_keyboard.push([
                { text: `➕ ${t(lang, 'price_media_add_button')}`, callback_data: `price_media_add|${chatId}|${tokenId}` },
                { text: `📋 ${t(lang, 'price_media_bulk_add_button')}`, callback_data: `price_media_bulk|${chatId}|${tokenId}` }
            ]);
        }

        // Reset all button
        keyboard.inline_keyboard.push([
            { text: `🗑️ ${t(lang, 'price_media_reset_all')}`, callback_data: `price_media_reset|${chatId}|${tokenId}` }
        ]);

        // Back and close
        keyboard.inline_keyboard.push([
            { text: '⬅️ ' + t(lang, 'price_button_back'), callback_data: `price_token|${chatId}|${tokenId}` },
            { text: '✖️ ' + t(lang, 'price_button_close'), callback_data: `price_close|${chatId}` }
        ]);

        const text = [
            `<b>📎 ${t(lang, 'price_media_title')}</b>`,
            '',
            t(lang, 'price_media_hint'),
            '',
            `📊 ${t(lang, 'price_media_count', { count: totalCount, max: MAX_MEDIA })}`
        ].join('\n');

        return { text, keyboard, page: currentPage, totalPages };
    };

    const handlePriceCommand = async (msg) => {
        const chatId = msg.chat?.id;
        const chatType = msg.chat?.type;
        const userId = msg.from?.id;
        if (!chatId || !userId) {
            return;
        }
        // Detect user language (Telegram/DB) so DM menu respects user setting immediately
        const lang = await getLang(msg);
        if (chatType === 'private') {
            try {
                await openAdminHub(userId, { fallbackLang: lang, mode: 'price' });
            } catch (error) {
                await sendReply(msg, t(lang, 'help_action_dm_blocked'), { reply_markup: buildCloseKeyboard(lang) });
            }
            return;
        }
        if (!['group', 'supergroup'].includes(chatType)) {
            await sendReply(msg, t(lang, 'price_group_only'));
            return;
        }
        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await sendReply(msg, t(lang, 'price_no_permission'));
            return;
        }
        await openAdminHub(userId, { fallbackLang: lang, mode: 'price' });
        await sendPriceAdminMenu(userId, chatId, { fallbackLang: lang, langOverride: lang });
        await sendReply(msg, t(lang, 'price_dm_notice'));
    };
    const handlePriceTargetCommand = async (msg) => {
        const chatId = msg.chat?.id;
        const chatType = msg.chat?.type;
        const userId = msg.from?.id;
        if (!chatId || !userId) {
            return;
        }
        const topicId = Object.prototype.hasOwnProperty.call(msg, 'message_thread_id') ? msg.message_thread_id : null;
        const lang = await resolveGroupLanguage(chatId, defaultLang, topicId);
        if (!['group', 'supergroup'].includes(chatType)) {
            await sendReply(msg, t(lang, 'price_group_only'));
            return;
        }
        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await sendReply(msg, t(lang, 'price_no_permission'));
            return;
        }
        const topicKey = topicId === null || topicId === undefined ? 'main' : topicId.toString();
        await addFeatureTopic(chatId, 'price', topicKey === 'main' ? null : topicKey);
        await setPriceAlertTarget(chatId, topicId); // legacy fallback
        const key = topicId ? 'price_target_saved_topic' : 'price_target_saved_chat';
        await sendReply(msg, t(lang, key, { topic: topicId ? topicId.toString() : '' }));
    };
    const handlePriceUnsubscribeCommand = async (msg) => {
        const chatId = msg.chat?.id;
        const chatType = msg.chat?.type;
        const userId = msg.from?.id;
        if (!chatId || !userId) {
            return;
        }
        const topicId = Object.prototype.hasOwnProperty.call(msg, 'message_thread_id') ? msg.message_thread_id : null;
        const lang = await resolveGroupLanguage(chatId, defaultLang, topicId);
        if (!['group', 'supergroup'].includes(chatType)) {
            await sendReply(msg, t(lang, 'price_group_only'));
            return;
        }
        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await sendReply(msg, t(lang, 'price_no_permission'));
            return;
        }
        const topicKey = topicId === null || topicId === undefined ? 'main' : topicId.toString();
        const removed = await removeFeatureTopic(chatId, 'price', topicKey === 'main' ? null : topicKey);
        if (topicKey === 'main') {
            await setPriceAlertTarget(chatId, null);
        }
        if (removed) {
            await sendReply(msg, t(lang, 'price_topic_removed', { topic: topicKey === 'main' ? t(lang, 'price_topic_main') : topicKey }));
        } else {
            await sendReply(msg, t(lang, 'price_topic_not_found'));
        }
    };
    const handlePriceCallback = async ({ query, callbackLang }) => {
        const data = query.data || '';
        if (!data.startsWith('price')) {
            return false;
        }
        const userId = query.from?.id;
        const parts = data.split('|');
        const actionParts = parts[0].split('_');
        const action = actionParts[0];
        const subAction = actionParts[1] || null;
        const subAction2 = actionParts[2] || null;
        const targetChatId = (parts[1] || '').toString();
        const tokenId = parts[2] ? Number(parts[2]) : null;
        const extraValue = parts[3] ? Number(parts[3]) : null;
        const requireAdmin = async () => {
            if (!targetChatId || !userId) {
                return false;
            }
            const isAdmin = await isGroupAdmin(targetChatId, userId);
            if (!isAdmin) {
                await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_no_permission'), show_alert: true });
                return false;
            }
            return true;
        };
        if (action === 'pricechain') {
            const chainParts = data.split('|');
            const chainChatId = chainParts[1];
            const tokenAndAction = chainParts[2] || '';
            const [tokenSegment, actionSegment = ''] = tokenAndAction.split('_');
            const chainTokenId = Number(tokenSegment);
            if (!(await requireAdmin())) {
                return true;
            }
            const state = priceChainStates.get(userId) || {};
            if (actionSegment === 'noop') {
                await bot.answerCallbackQuery(query.id);
                return true;
            }
            if (actionSegment.startsWith('page')) {
                const page = Number(actionSegment.split(':')[1] || 0);
                const keyboard = await buildChainMenu(userId, chainChatId, chainTokenId, callbackLang, page);
                try {
                    await bot.editMessageReplyMarkup(
                        { inline_keyboard: keyboard.inline_keyboard },
                        { chat_id: query.message?.chat?.id, message_id: query.message?.message_id }
                    );
                } catch (error) {
                    // ignore edit errors
                }
                await bot.answerCallbackQuery(query.id);
                return true;
            }
            if (actionSegment.startsWith('chain')) {
                const selectedIndex = Number(actionSegment.split(':')[1] || 0);
                const entries = state.chainOptions || await mapChainEntries();
                const entry = entries.find((item) => Number(item.chainIndex) === selectedIndex);
                if (!entry) {
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_chain_missing'), show_alert: true });
                    return true;
                }
                await updatePriceAlertToken(chainChatId, chainTokenId, {
                    chainIndex: entry.chainIndex,
                    chainShortName: entry.chainShortName || entry.chainName || null,
                    nextRunAt: Date.now()
                });
                await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_chain_saved') });
                await sendPriceAdminMenu(userId, chainChatId, { fallbackLang: callbackLang, view: 'token', tokenId: chainTokenId });
                return true;
            }
        }
        if (action === 'price') {
            if (!await requireAdmin()) {
                return true;
            }
            switch (subAction) {
                case 'home':
                    await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'home' });
                    await bot.answerCallbackQuery(query.id);
                    return true;
                case 'add': {
                    const existingTokens = await listPriceAlertTokens(targetChatId);
                    if (existingTokens.length >= PRICE_ALERT_MAX_TOKENS) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_max_tokens_reached', { max: PRICE_ALERT_MAX_TOKENS }), show_alert: true });
                        return true;
                    }
                    const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_prompt_address'), {
                        reply_markup: { force_reply: true, input_field_placeholder: '0x...' }
                    });
                    priceWizardStates.set(userId.toString(), {
                        type: 'add_address',
                        chatId: targetChatId,
                        promptMessageId: prompt?.message_id || null,
                        lang: callbackLang
                    });
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_prompt_address_hint') });
                    return true;
                }
                case 'manage':
                    await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'manage' });
                    await bot.answerCallbackQuery(query.id);
                    return true;
                case 'topics': {
                    const payload = await buildTopicsView(targetChatId, tokenId, callbackLang);
                    if (!payload) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_topic_not_found'), show_alert: true });
                        return true;
                    }
                    try {
                        await bot.editMessageText(payload.text, {
                            chat_id: query.message?.chat?.id,
                            message_id: query.message?.message_id,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            reply_markup: payload.reply_markup
                        });
                    } catch (error) {
                        // ignore edit errors
                    }
                    await bot.answerCallbackQuery(query.id);
                    return true;
                }
                case 'refresh':
                    await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'home' });
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_menu_refreshed') });
                    return true;
                case 'close':
                    if (query.message?.chat?.id && query.message?.message_id) {
                        try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
                    }
                    priceMenuSessions.delete(userId.toString());
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_menu_closed') });
                    return true;
                case 'token':
                    if (tokenId) {
                        await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }
                    break;
                case 'toggle': {
                    const token = await getPriceAlertToken(targetChatId, tokenId);
                    if (!token) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_token_missing'), show_alert: true });
                        return true;
                    }
                    const nextEnabled = Number(token.enabled) === 1 ? 0 : 1;
                    await updatePriceAlertToken(targetChatId, tokenId, { enabled: nextEnabled });
                    await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                    const key = nextEnabled ? 'price_status_on' : 'price_status_off';
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, key) });
                    return true;
                }
                case 'topic': {
                    if (subAction2 === 'toggle') {
                        const topicIdRaw = parts[3] || 'main';
                        const token = await getPriceAlertToken(targetChatId, tokenId);
                        if (!token) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_token_missing'), show_alert: true });
                            return true;
                        }
                        const tokenTopics = await listPriceAlertTokenTopics(tokenId, targetChatId);
                        const statusMap = new Map();
                        tokenTopics.forEach((entry) => {
                            const key = (entry.topicId === undefined || entry.topicId === null ? 'main' : entry.topicId.toString());
                            statusMap.set(key, Number(entry.enabled) === 1);
                        });
                        const isOn = statusMap.has(topicIdRaw) ? statusMap.get(topicIdRaw) : true;
                        const nextEnabled = isOn ? 0 : 1;
                        await setPriceAlertTokenTopic(tokenId, targetChatId, topicIdRaw === 'main' ? null : topicIdRaw, nextEnabled);
                        const payload = await buildTopicsView(targetChatId, tokenId, callbackLang);
                        if (payload && query.message?.chat?.id && query.message?.message_id) {
                            try {
                                await bot.editMessageText(payload.text, {
                                    chat_id: query.message.chat.id,
                                    message_id: query.message.message_id,
                                    parse_mode: 'HTML',
                                    disable_web_page_preview: true,
                                    reply_markup: payload.reply_markup
                                });
                            } catch (error) {
                                // ignore edit issues
                            }
                        }
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, nextEnabled ? 'price_topic_enabled' : 'price_topic_disabled') });
                        return true;
                    }
                    break;
                }
                case 'interval': {
                    if (subAction2 === 'custom') {
                        const menuRows = [];
                        for (let i = 0; i < INTERVAL_OPTIONS.length; i += 2) {
                            const row = [];
                            for (let j = i; j < Math.min(i + 2, INTERVAL_OPTIONS.length); j += 1) {
                                const value = INTERVAL_OPTIONS[j];
                                row.push({
                                    text: formatIntervalLabel(value, callbackLang),
                                    callback_data: `price_interval|${targetChatId}|${tokenId}|${value}`
                                });
                            }
                            if (row.length) {
                                menuRows.push(row);
                            }
                        }
                        menuRows.push([
                            { text: t(callbackLang, 'price_button_back'), callback_data: `price_token|${targetChatId}|${tokenId}` },
                            { text: t(callbackLang, 'price_button_close'), callback_data: `price_close|${targetChatId}` }
                        ]);
                        const text = t(callbackLang, 'price_interval_menu_title');
                        await bot.sendMessage(userId, text, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            reply_markup: { inline_keyboard: menuRows }
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }
                    const parseInterval = () => {
                        const raw = parts[3] || parts[2] || '';
                        if (!raw) return NaN;
                        const match = String(raw).trim().match(/^(\d+)([smh]?)$/i);
                        if (match) {
                            const num = Number(match[1]);
                            const unit = match[2]?.toLowerCase();
                            if (unit === 'm') return num * 60;
                            if (unit === 'h') return num * 3600;
                            return num;
                        }
                        return Number(raw);
                    };
                    const interval = parseInterval();
                    if (!Number.isFinite(interval) || interval < 30 || interval > 86400) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_invalid_interval'), show_alert: true });
                        return true;
                    }
                    await updatePriceAlertToken(targetChatId, tokenId, {
                        intervalSeconds: interval,
                        nextRunAt: Date.now() + interval * 1000
                    });
                    await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_interval_saved', { value: formatIntervalLabel(interval, callbackLang) }) });
                    if (query.message?.text && query.message.text.startsWith(t(callbackLang, 'price_interval_menu_title'))) {
                        try { await bot.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_) { }
                    }
                    return true;
                }
                case 'chain': {
                    const keyboard = await buildChainMenu(userId, targetChatId, tokenId, callbackLang, 0);
                    const text = t(callbackLang, 'price_prompt_chain');
                    await bot.sendMessage(userId, text, { reply_markup: keyboard });
                    await bot.answerCallbackQuery(query.id);
                    return true;
                }
                case 'rename': {
                    const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_prompt_label'), {
                        reply_markup: { force_reply: true, input_field_placeholder: 'My Token' }
                    });
                    priceWizardStates.set(userId.toString(), {
                        type: 'rename',
                        chatId: targetChatId,
                        tokenId,
                        promptMessageId: prompt?.message_id || null,
                        lang: callbackLang
                    });
                    await bot.answerCallbackQuery(query.id);
                    return true;
                }
                case 'delete': {
                    await deletePriceAlertToken(targetChatId, tokenId);
                    await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'manage' });
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_deleted') });
                    return true;
                }
                case 'send': {
                    const token = await getPriceAlertToken(targetChatId, tokenId);
                    if (!token) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_token_missing'), show_alert: true });
                        return true;
                    }
                    await sendPriceAlertNow(token);
                    await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_sent_now') });
                    return true;
                }
                case 'title': {
                    // Handle all title sub-actions: view, add, del, reset, page
                    // subAction2 = view|add|del|reset|page or undefined (for main menu)
                    const titleActionType = subAction2 || 'menu';

                    // ═══ TITLE MENU (with pagination) ═══
                    if (titleActionType === 'menu') {
                        const titleMenu = await buildTitleListMenu(targetChatId, tokenId, callbackLang, 0);
                        await bot.sendMessage(userId, titleMenu.text, {
                            parse_mode: 'HTML',
                            reply_markup: titleMenu.keyboard
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ TITLE PAGE NAVIGATION ═══
                    if (titleActionType === 'page') {
                        const pageParts = query.data.split('|');
                        const pageNum = parseInt(pageParts[3], 10) || 0;
                        const titleMenu = await buildTitleListMenu(targetChatId, tokenId, callbackLang, pageNum);
                        try {
                            await bot.editMessageText(titleMenu.text, {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id,
                                parse_mode: 'HTML',
                                reply_markup: titleMenu.keyboard
                            });
                        } catch (_) { /* ignore edit errors */ }
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ TITLE VIEW ═══
                    if (titleActionType === 'view') {
                        const titleParts = query.data.split('|');
                        const viewTitleId = titleParts[3];
                        if (!viewTitleId) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_invalid_id'), show_alert: true });
                            return true;
                        }
                        const titleList = await listPriceAlertTitles(tokenId, targetChatId);
                        const titleItem = titleList.find(ti => ti.id.toString() === viewTitleId.toString());
                        if (!titleItem) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_title_not_found'), show_alert: true });
                            return true;
                        }
                        // Send preview (auto-delete after 10 seconds)
                        try {
                            const caption = `📝 ${t(callbackLang, 'price_title_preview')}\n\n<b>${escapeHtml(titleItem.title)}</b>\n\n${t(callbackLang, 'price_auto_delete_notice', { seconds: 10 })}`;
                            const previewMsg = await bot.sendMessage(userId, caption, { parse_mode: 'HTML' });
                            if (previewMsg?.message_id) {
                                setTimeout(async () => {
                                    try { await bot.deleteMessage(userId, previewMsg.message_id); } catch (_) { /* ignore */ }
                                }, 10000);
                            }
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_preview_sent') });
                        } catch (error) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_preview_error'), show_alert: true });
                        }
                        return true;
                    }

                    // ═══ TITLE ADD ═══
                    if (titleActionType === 'add') {
                        const currentCount = await countPriceAlertTitles(tokenId, targetChatId);
                        if (currentCount >= MAX_TITLES) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_title_max'), show_alert: true });
                            return true;
                        }
                        const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_title_add_prompt'), {
                            reply_markup: { force_reply: true }
                        });
                        priceWizardStates.set(userId.toString(), {
                            type: 'title_add',
                            chatId: targetChatId,
                            tokenId,
                            promptMessageId: prompt?.message_id || null,
                            lang: callbackLang,
                            createdAt: Date.now()
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ TITLE BULK ADD ═══
                    if (titleActionType === 'bulk') {
                        const currentCount = await countPriceAlertTitles(tokenId, targetChatId);
                        if (currentCount >= MAX_TITLES) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_title_max'), show_alert: true });
                            return true;
                        }
                        const remaining = MAX_TITLES - currentCount;
                        const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_title_bulk_add_prompt', { remaining, max: MAX_TITLES }), {
                            reply_markup: { force_reply: true },
                            parse_mode: 'HTML'
                        });
                        priceWizardStates.set(userId.toString(), {
                            type: 'title_bulk_add',
                            chatId: targetChatId,
                            tokenId,
                            promptMessageId: prompt?.message_id || null,
                            lang: callbackLang,
                            createdAt: Date.now()
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ TITLE DELETE ═══
                    if (titleActionType === 'del') {
                        const delParts = query.data.split('|');
                        const delTitleId = delParts[3];
                        if (!delTitleId) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_invalid_id'), show_alert: true });
                            return true;
                        }
                        await deletePriceAlertTitle(delTitleId);
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_title_deleted') });

                        // Refresh title menu (edit-in-place)
                        const refreshList = await listPriceAlertTitles(tokenId, targetChatId);
                        const refreshCount = refreshList.length;

                        if (refreshCount === 0) {
                            await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                        } else {
                            const refreshKeyboard = { inline_keyboard: [] };
                            refreshList.forEach((ti, idx) => {
                                const shortTitle = ti.title.length > 20 ? ti.title.substring(0, 20) + '...' : ti.title;
                                refreshKeyboard.inline_keyboard.push([
                                    { text: `📝 ${idx + 1}. ${shortTitle}`, callback_data: `price_title_view|${targetChatId}|${tokenId}|${ti.id}` },
                                    { text: '🗑️', callback_data: `price_title_del|${targetChatId}|${tokenId}|${ti.id}` }
                                ]);
                            });
                            if (refreshCount < MAX_TITLES) {
                                refreshKeyboard.inline_keyboard.push([
                                    { text: `➕ ${t(callbackLang, 'price_title_add_button')}`, callback_data: `price_title_add|${targetChatId}|${tokenId}` }
                                ]);
                            }
                            refreshKeyboard.inline_keyboard.push([
                                { text: `🗑️ ${t(callbackLang, 'price_title_reset_all')}`, callback_data: `price_title_reset|${targetChatId}|${tokenId}` }
                            ]);
                            refreshKeyboard.inline_keyboard.push([
                                { text: '⬅️ ' + t(callbackLang, 'price_button_back'), callback_data: `price_token|${targetChatId}|${tokenId}` },
                                { text: '✖️ ' + t(callbackLang, 'price_button_close'), callback_data: `price_close|${targetChatId}` }
                            ]);
                            const refreshText = [
                                `<b>📝 ${t(callbackLang, 'price_title_manager')}</b>`,
                                '',
                                t(callbackLang, 'price_title_hint'),
                                '',
                                `📊 ${t(callbackLang, 'price_title_count', { count: refreshCount, max: MAX_TITLES })}`
                            ].join('\n');
                            try {
                                await bot.editMessageText(refreshText, {
                                    chat_id: userId,
                                    message_id: query.message.message_id,
                                    parse_mode: 'HTML',
                                    reply_markup: refreshKeyboard
                                });
                            } catch (_) { /* ignore */ }
                        }
                        return true;
                    }

                    // ═══ TITLE RESET (delete all) ═══
                    if (titleActionType === 'reset') {
                        await deleteAllPriceAlertTitles(tokenId, targetChatId);
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_title_reset_success') });
                        await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                        return true;
                    }

                    // ═══ TITLE MENU (default) ═══
                    const token = await getPriceAlertToken(targetChatId, tokenId);
                    if (!token) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_token_missing'), show_alert: true });
                        return true;
                    }
                    const titleList = await listPriceAlertTitles(tokenId, targetChatId);
                    const titleCount = titleList.length;

                    // If no titles exist, go directly to add prompt
                    if (titleCount === 0) {
                        const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_title_add_prompt'), {
                            reply_markup: { force_reply: true }
                        });
                        priceWizardStates.set(userId.toString(), {
                            type: 'title_add',
                            chatId: targetChatId,
                            tokenId,
                            promptMessageId: prompt?.message_id || null,
                            lang: callbackLang,
                            createdAt: Date.now()
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // Build title management menu
                    const keyboard = { inline_keyboard: [] };
                    titleList.forEach((ti, idx) => {
                        const shortTitle = ti.title.length > 20 ? ti.title.substring(0, 20) + '...' : ti.title;
                        keyboard.inline_keyboard.push([
                            { text: `📝 ${idx + 1}. ${shortTitle}`, callback_data: `price_title_view|${targetChatId}|${tokenId}|${ti.id}` },
                            { text: '🗑️', callback_data: `price_title_del|${targetChatId}|${tokenId}|${ti.id}` }
                        ]);
                    });
                    if (titleCount < MAX_TITLES) {
                        keyboard.inline_keyboard.push([
                            { text: `➕ ${t(callbackLang, 'price_title_add_button')}`, callback_data: `price_title_add|${targetChatId}|${tokenId}` }
                        ]);
                    }
                    keyboard.inline_keyboard.push([
                        { text: `🗑️ ${t(callbackLang, 'price_title_reset_all')}`, callback_data: `price_title_reset|${targetChatId}|${tokenId}` }
                    ]);
                    keyboard.inline_keyboard.push([
                        { text: '⬅️ ' + t(callbackLang, 'price_button_back'), callback_data: `price_token|${targetChatId}|${tokenId}` },
                        { text: '✖️ ' + t(callbackLang, 'price_button_close'), callback_data: `price_close|${targetChatId}` }
                    ]);

                    const text = [
                        `<b>📝 ${t(callbackLang, 'price_title_manager')}</b>`,
                        '',
                        t(callbackLang, 'price_title_hint'),
                        '',
                        `📊 ${t(callbackLang, 'price_title_count', { count: titleCount, max: MAX_TITLES })}`
                    ].join('\n');

                    try {
                        await bot.editMessageText(text, {
                            chat_id: userId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    } catch (_) { /* ignore */ }
                    await bot.answerCallbackQuery(query.id);
                    return true;
                }
                case 'media': {
                    // Handle all media sub-actions: view, add, del, reset, page
                    // subAction2 = view|add|del|reset|page or undefined (for main menu)
                    const mediaActionType = subAction2 || 'menu';

                    // ═══ MEDIA MENU (with pagination) ═══
                    if (mediaActionType === 'menu') {
                        const mediaMenu = await buildMediaListMenu(targetChatId, tokenId, callbackLang, 0);
                        await bot.sendMessage(userId, mediaMenu.text, {
                            parse_mode: 'HTML',
                            reply_markup: mediaMenu.keyboard
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ MEDIA PAGE NAVIGATION ═══
                    if (mediaActionType === 'page') {
                        const pageParts = query.data.split('|');
                        const pageNum = parseInt(pageParts[3], 10) || 0;
                        const mediaMenu = await buildMediaListMenu(targetChatId, tokenId, callbackLang, pageNum);
                        try {
                            await bot.editMessageText(mediaMenu.text, {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id,
                                parse_mode: 'HTML',
                                reply_markup: mediaMenu.keyboard
                            });
                        } catch (_) { /* ignore edit errors */ }
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ MEDIA VIEW ═══
                    if (mediaActionType === 'view') {
                        const mediaParts = query.data.split('|');
                        const viewMediaId = mediaParts[3];
                        if (!viewMediaId) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_invalid_id'), show_alert: true });
                            return true;
                        }
                        const mediaList = await listPriceAlertMedia(tokenId, targetChatId);
                        const media = mediaList.find(m => m.id.toString() === viewMediaId.toString());
                        if (!media) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_not_found'), show_alert: true });
                            return true;
                        }
                        // Send preview (auto-delete after 10 seconds)
                        try {
                            let previewMsg;
                            const mediaTypeLabel = media.mediaType === 'video' ? '🎬 Video' : '📷 Photo';
                            const caption = t(callbackLang, 'price_media_preview_caption', { type: mediaTypeLabel, seconds: 10 });
                            if (media.mediaType === 'video') {
                                previewMsg = await bot.sendVideo(userId, media.fileId, { caption });
                            } else {
                                previewMsg = await bot.sendPhoto(userId, media.fileId, { caption });
                            }
                            if (previewMsg?.message_id) {
                                setTimeout(async () => {
                                    try {
                                        await bot.deleteMessage(userId, previewMsg.message_id);
                                    } catch (_) { /* ignore */ }
                                }, 10000);
                            }
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_preview_sent') });
                        } catch (error) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_preview_error'), show_alert: true });
                        }
                        return true;
                    }

                    // ═══ MEDIA ADD ═══
                    if (mediaActionType === 'add') {
                        const currentCount = await countPriceAlertMedia(tokenId, targetChatId);
                        if (currentCount >= MAX_MEDIA) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_max'), show_alert: true });
                            return true;
                        }
                        const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_media_add_prompt'), {
                            reply_markup: { force_reply: true }
                        });
                        priceWizardStates.set(userId.toString(), {
                            type: 'media_add',
                            chatId: targetChatId,
                            tokenId,
                            promptMessageId: prompt?.message_id || null,
                            lang: callbackLang,
                            createdAt: Date.now()
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ MEDIA BULK ADD ═══
                    if (mediaActionType === 'bulk') {
                        const currentCount = await countPriceAlertMedia(tokenId, targetChatId);
                        if (currentCount >= MAX_MEDIA) {
                            await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_max'), show_alert: true });
                            return true;
                        }
                        const remaining = MAX_MEDIA - currentCount;
                        const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_media_bulk_add_prompt', { remaining, max: MAX_MEDIA }), {
                            reply_markup: { force_reply: true },
                            parse_mode: 'HTML'
                        });
                        priceWizardStates.set(userId.toString(), {
                            type: 'media_bulk_add',
                            chatId: targetChatId,
                            tokenId,
                            promptMessageId: prompt?.message_id || null,
                            lang: callbackLang,
                            startCount: currentCount,
                            createdAt: Date.now()
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // ═══ MEDIA DELETE ═══
                    if (mediaActionType === 'del') {
                        const delParts = query.data.split('|');
                        const delMediaId = delParts[3];
                        if (!delMediaId) {
                            await bot.answerCallbackQuery(query.id, { text: '❌ Invalid media ID', show_alert: true });
                            return true;
                        }
                        await deletePriceAlertMedia(delMediaId);
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_deleted') });

                        // Refresh media menu (edit-in-place)
                        const refreshList = await listPriceAlertMedia(tokenId, targetChatId);
                        const refreshCount = refreshList.length;

                        if (refreshCount === 0) {
                            await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                        } else {
                            const refreshKeyboard = { inline_keyboard: [] };
                            refreshList.forEach((m, idx) => {
                                const typeEmoji = m.mediaType === 'video' ? '🎬' : '📷';
                                refreshKeyboard.inline_keyboard.push([
                                    { text: `${typeEmoji} Media ${idx + 1} - Xem`, callback_data: `price_media_view|${targetChatId}|${tokenId}|${m.id}` },
                                    { text: '🗑️', callback_data: `price_media_del|${targetChatId}|${tokenId}|${m.id}` }
                                ]);
                            });
                            if (refreshCount < MAX_MEDIA) {
                                refreshKeyboard.inline_keyboard.push([
                                    { text: `➕ ${t(callbackLang, 'price_media_add_button')}`, callback_data: `price_media_add|${targetChatId}|${tokenId}` }
                                ]);
                            }
                            refreshKeyboard.inline_keyboard.push([
                                { text: `🗑️ ${t(callbackLang, 'price_button_reset_media')}`, callback_data: `price_media_reset|${targetChatId}|${tokenId}` }
                            ]);
                            refreshKeyboard.inline_keyboard.push([
                                { text: '⬅️ ' + t(callbackLang, 'price_button_back'), callback_data: `price_token|${targetChatId}|${tokenId}` }
                            ]);
                            const refreshText = [
                                `<b>📎 ${t(callbackLang, 'price_media_title')}</b>`,
                                '',
                                t(callbackLang, 'price_media_hint'),
                                '',
                                `📊 ${t(callbackLang, 'price_media_count', { count: refreshCount, max: MAX_MEDIA })}`
                            ].join('\n');
                            try {
                                await bot.editMessageText(refreshText, {
                                    chat_id: userId,
                                    message_id: query.message.message_id,
                                    parse_mode: 'HTML',
                                    reply_markup: refreshKeyboard
                                });
                            } catch (_) { /* ignore */ }
                        }
                        return true;
                    }

                    // ═══ MEDIA RESET (delete all) ═══
                    if (mediaActionType === 'reset') {
                        await deleteAllPriceAlertMedia(tokenId, targetChatId);
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_media_reset_confirm') });
                        await sendPriceAdminMenu(userId, targetChatId, { fallbackLang: callbackLang, view: 'token', tokenId });
                        return true;
                    }

                    // ═══ MEDIA MENU (default) ═══
                    const token = await getPriceAlertToken(targetChatId, tokenId);
                    if (!token) {
                        await bot.answerCallbackQuery(query.id, { text: t(callbackLang, 'price_token_missing'), show_alert: true });
                        return true;
                    }
                    const mediaList = await listPriceAlertMedia(tokenId, targetChatId);
                    const mediaCount = mediaList.length;

                    // If no media exists, go directly to add prompt
                    if (mediaCount === 0) {
                        const prompt = await bot.sendMessage(userId, t(callbackLang, 'price_media_add_prompt'), {
                            reply_markup: { force_reply: true }
                        });
                        priceWizardStates.set(userId.toString(), {
                            type: 'media_add',
                            chatId: targetChatId,
                            tokenId,
                            promptMessageId: prompt?.message_id || null,
                            lang: callbackLang,
                            createdAt: Date.now()
                        });
                        await bot.answerCallbackQuery(query.id);
                        return true;
                    }

                    // Build media management menu
                    const keyboard = { inline_keyboard: [] };
                    mediaList.forEach((m, idx) => {
                        const typeEmoji = m.mediaType === 'video' ? '🎬' : '📷';
                        keyboard.inline_keyboard.push([
                            { text: `${typeEmoji} Media ${idx + 1} - Xem`, callback_data: `price_media_view|${targetChatId}|${tokenId}|${m.id}` },
                            { text: '🗑️', callback_data: `price_media_del|${targetChatId}|${tokenId}|${m.id}` }
                        ]);
                    });
                    if (mediaCount < MAX_MEDIA) {
                        keyboard.inline_keyboard.push([
                            { text: `➕ ${t(callbackLang, 'price_media_add_button')}`, callback_data: `price_media_add|${targetChatId}|${tokenId}` }
                        ]);
                    }
                    keyboard.inline_keyboard.push([
                        { text: `🗑️ ${t(callbackLang, 'price_button_reset_media')}`, callback_data: `price_media_reset|${targetChatId}|${tokenId}` }
                    ]);
                    keyboard.inline_keyboard.push([
                        { text: '⬅️ ' + t(callbackLang, 'price_button_back'), callback_data: `price_token|${targetChatId}|${tokenId}` },
                        { text: '✖️ ' + t(callbackLang, 'price_button_close'), callback_data: `price_close|${targetChatId}` }
                    ]);

                    const text = [
                        `<b>📎 ${t(callbackLang, 'price_media_title')}</b>`,
                        '',
                        t(callbackLang, 'price_media_hint'),
                        '',
                        `📊 ${t(callbackLang, 'price_media_count', { count: mediaCount, max: MAX_MEDIA })}`
                    ].join('\n');

                    try {
                        await bot.editMessageText(text, {
                            chat_id: userId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    } catch (_) { /* ignore */ }
                    await bot.answerCallbackQuery(query.id);
                    return true;
                }
                default:
                    break;
            }
        }
        await bot.answerCallbackQuery(query.id);
        return true;
    };
    const handlePriceWizardMessage = async (msg, text) => {
        const userId = msg.from?.id?.toString();
        if (!userId) {
            return false;
        }
        const state = priceWizardStates.get(userId);
        if (!state) {
            return false;
        }
        const lang = state.lang || defaultLang;

        // In DM (chat.id === user.id), accept any message from user within 5 minutes
        // This fixes issue when another bot "steals" the reply
        const isDm = msg.chat?.id?.toString() === userId;
        const isReplyToPrompt = state.promptMessageId && msg.reply_to_message?.message_id === state.promptMessageId;
        const stateAge = state.createdAt ? Date.now() - state.createdAt : 0;
        const isWithinTimeWindow = stateAge < 300000; // 5 minutes

        // Accept if: explicit reply to prompt, OR in DM within time window
        if (!isReplyToPrompt && !(isDm && isWithinTimeWindow)) {
            return false;
        }

        // NOTE: Do NOT delete state here - let each handler manage its own state deletion
        // Some handlers like media_bulk_add need to persist state across multiple messages
        if (state.type === 'add_address') {
            priceWizardStates.delete(userId);
            const address = text.trim();
            if (!address) {
                await bot.sendMessage(msg.chat.id, t(lang, 'price_invalid_address'));
                return true;
            }
            const existingTokens = await listPriceAlertTokens(state.chatId);
            const normalizedAddress = address.toLowerCase();
            const alreadyExists = existingTokens.some((item) => (item.tokenAddress || '').toLowerCase() === normalizedAddress);
            if (existingTokens.length >= PRICE_ALERT_MAX_TOKENS && !alreadyExists) {
                await bot.sendMessage(msg.chat.id, t(lang, 'price_max_tokens_reached', { max: PRICE_ALERT_MAX_TOKENS }));
                return true;
            }
            const token = await upsertPriceAlertToken(state.chatId, {
                tokenAddress: address,
                intervalSeconds: PRICE_ALERT_DEFAULT_INTERVAL,
                nextRunAt: Date.now()
            });
            if (!token) {
                await bot.sendMessage(msg.chat.id, t(lang, 'price_invalid_address'));
                return true;
            }
            try {
                const snapshot = await fetchTokenPriceOverview({
                    tokenAddress: token.tokenAddress,
                    chainIndex: token.chainIndex,
                    chainShortName: token.chainShortName,
                    throttleMs: PRICE_ALERT_RATE_LIMIT_MS
                });
                const cacheKey = `${token.tokenAddress}|${token.chainIndex || ''}`;
                if (snapshot) {
                    cacheTokenMeta(cacheKey, snapshot);
                    const autoLabel = snapshot.tokenName || snapshot.tokenSymbol;
                    if (autoLabel) {
                        await updatePriceAlertToken(token.chatId, token.id, { tokenLabel: autoLabel });
                    }
                }
            } catch (error) {
                // ignore preview errors
            }
            const chainKeyboard = await buildChainMenu(userId, state.chatId, token.id, lang, 0);
            await bot.sendMessage(msg.chat.id, t(lang, 'price_prompt_chain'), { reply_markup: chainKeyboard });
            await sendPriceAdminMenu(userId, state.chatId, { fallbackLang: lang, view: 'token', tokenId: token.id });
            return true;
        }
        if (state.type === 'rename') {
            priceWizardStates.delete(userId);
            await updatePriceAlertToken(state.chatId, state.tokenId, { tokenLabel: text.trim() || null });
            await bot.sendMessage(msg.chat.id, t(lang, 'price_label_saved'));
            await sendPriceAdminMenu(msg.from.id, state.chatId, { fallbackLang: lang, view: 'token', tokenId: state.tokenId });
            return true;
        }
        if (state.type === 'interval') {
            priceWizardStates.delete(userId);
            const cleaned = text.trim().toLowerCase();
            let seconds = Number(cleaned);
            if (cleaned.endsWith('m')) {
                seconds = Number(cleaned.replace(/m$/, '')) * 60;
            } else if (cleaned.endsWith('h')) {
                seconds = Number(cleaned.replace(/h$/, '')) * 3600;
            }
            if (!Number.isFinite(seconds) || seconds <= 0) {
                await bot.sendMessage(msg.chat.id, t(lang, 'price_invalid_interval'));
                return true;
            }
            await updatePriceAlertToken(state.chatId, state.tokenId, {
                intervalSeconds: seconds,
                nextRunAt: Date.now() + seconds * 1000
            });
            await bot.sendMessage(msg.chat.id, t(lang, 'price_interval_saved', { value: formatIntervalLabel(seconds, lang) }));
            await sendPriceAdminMenu(msg.from.id, state.chatId, { fallbackLang: lang, view: 'token', tokenId: state.tokenId });
            return true;
        }
        if (state.type === 'title_add') {
            priceWizardStates.delete(userId);
            const newTitle = text.trim();
            if (!newTitle) {
                const errorMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_title_empty'));
                const promptMsgId = state.promptMessageId;
                setTimeout(async () => {
                    try { await bot.deleteMessage(msg.chat.id, promptMsgId); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, errorMsg.message_id); } catch (_) { }
                }, 5000);
                return true;
            }
            const currentCount = await countPriceAlertTitles(state.tokenId, state.chatId);
            if (currentCount >= MAX_TITLES) {
                const maxMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_title_max'));
                const promptMsgId = state.promptMessageId;
                setTimeout(async () => {
                    try { await bot.deleteMessage(msg.chat.id, promptMsgId); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, maxMsg.message_id); } catch (_) { }
                }, 5000);
                return true;
            }
            await addPriceAlertTitle(state.tokenId, state.chatId, newTitle);
            const newCount = currentCount + 1;
            const confirmMsg = await bot.sendMessage(msg.chat.id, `${t(lang, 'price_title_added', { count: newCount })}\n${t(lang, 'price_auto_delete_notice', { seconds: 5 })}`);

            // Auto-delete prompt, user's message and confirmation after 5 seconds
            const userMsgId = msg.message_id;
            const confirmMsgId = confirmMsg?.message_id;
            const promptMsgId = state.promptMessageId;
            const chatId = msg.chat.id;

            setTimeout(async () => {
                try { await bot.deleteMessage(chatId, promptMsgId); } catch (_) { }
                try { await bot.deleteMessage(chatId, userMsgId); } catch (_) { }
                try { await bot.deleteMessage(chatId, confirmMsgId); } catch (_) { }
            }, 5000);

            // Refresh to Title Manager menu (send new message with title menu)
            // Build and send title menu inline
            const titleList = await listPriceAlertTitles(state.tokenId, state.chatId);
            const titleCount = titleList.length;
            const keyboard = { inline_keyboard: [] };
            titleList.forEach((ti, idx) => {
                const shortTitle = ti.title.length > 20 ? ti.title.substring(0, 20) + '...' : ti.title;
                keyboard.inline_keyboard.push([
                    { text: `📝 ${idx + 1}. ${shortTitle}`, callback_data: `price_title_view|${state.chatId}|${state.tokenId}|${ti.id}` },
                    { text: '🗑️', callback_data: `price_title_del|${state.chatId}|${state.tokenId}|${ti.id}` }
                ]);
            });
            if (titleCount < MAX_TITLES) {
                keyboard.inline_keyboard.push([
                    { text: `➕ ${t(lang, 'price_title_add_button')}`, callback_data: `price_title_add|${state.chatId}|${state.tokenId}` }
                ]);
            }
            keyboard.inline_keyboard.push([
                { text: `🗑️ ${t(lang, 'price_title_reset_all')}`, callback_data: `price_title_reset|${state.chatId}|${state.tokenId}` }
            ]);
            keyboard.inline_keyboard.push([
                { text: '⬅️ ' + t(lang, 'price_button_back'), callback_data: `price_token|${state.chatId}|${state.tokenId}` },
                { text: '✖️ ' + t(lang, 'price_button_close'), callback_data: `price_close|${state.chatId}` }
            ]);
            const titleMenuText = [
                `<b>📝 ${t(lang, 'price_title_manager')}</b>`,
                '',
                t(lang, 'price_title_hint'),
                '',
                `📊 ${t(lang, 'price_title_count', { count: titleCount, max: MAX_TITLES })}`
            ].join('\n');
            await bot.sendMessage(msg.from.id, titleMenuText, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            return true;
        }
        // ═══ TITLE BULK ADD ═══
        if (state.type === 'title_bulk_add') {
            priceWizardStates.delete(userId);
            const rawTitles = text.split('|').map(t => t.trim()).filter(t => t.length > 0);
            if (rawTitles.length === 0) {
                const errorMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_title_bulk_empty'));
                setTimeout(async () => {
                    try { await bot.deleteMessage(msg.chat.id, state.promptMessageId); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, errorMsg.message_id); } catch (_) { }
                }, 5000);
                return true;
            }
            const currentCount = await countPriceAlertTitles(state.tokenId, state.chatId);
            const available = MAX_TITLES - currentCount;
            const toAdd = rawTitles.slice(0, available);
            let addedCount = 0;
            for (const title of toAdd) {
                await addPriceAlertTitle(state.tokenId, state.chatId, title);
                addedCount++;
            }
            const skipped = rawTitles.length - addedCount;
            const confirmMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_title_bulk_added', { added: addedCount, skipped, total: currentCount + addedCount }), { parse_mode: 'HTML' });
            setTimeout(async () => {
                try { await bot.deleteMessage(msg.chat.id, state.promptMessageId); } catch (_) { }
                try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) { }
                try { await bot.deleteMessage(msg.chat.id, confirmMsg.message_id); } catch (_) { }
            }, 5000);
            // Refresh title menu using buildTitleListMenu
            const titleMenu = await buildTitleListMenu(state.chatId, state.tokenId, lang, 0);
            await bot.sendMessage(msg.from.id, titleMenu.text, {
                parse_mode: 'HTML',
                reply_markup: titleMenu.keyboard
            });
            return true;
        }
        if (state.type === 'media_add') {
            priceWizardStates.delete(userId);
            // Check for photo or video
            let mediaType = null;
            let fileId = null;
            if (msg.photo && msg.photo.length > 0) {
                mediaType = 'photo';
                fileId = msg.photo[msg.photo.length - 1].file_id; // Get highest resolution
            } else if (msg.video) {
                mediaType = 'video';
                fileId = msg.video.file_id;
            }
            if (!fileId) {
                const errorMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_media_invalid'));
                // Auto-delete prompt, error message and user's message after 5 seconds
                const promptMsgId = state.promptMessageId;
                setTimeout(async () => {
                    try { await bot.deleteMessage(msg.chat.id, promptMsgId); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, errorMsg.message_id); } catch (_) { }
                }, 5000);
                return true;
            }
            const currentCount = await countPriceAlertMedia(state.tokenId, state.chatId);
            if (currentCount >= MAX_MEDIA) {
                const maxMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_media_max'));
                const promptMsgId = state.promptMessageId;
                setTimeout(async () => {
                    try { await bot.deleteMessage(msg.chat.id, promptMsgId); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, maxMsg.message_id); } catch (_) { }
                }, 5000);
                return true;
            }
            await addPriceAlertMedia(state.tokenId, state.chatId, mediaType, fileId);
            const newCount = currentCount + 1;
            const confirmMsg = await bot.sendMessage(msg.chat.id, `${t(lang, 'price_media_added', { count: newCount })}\n${t(lang, 'price_auto_delete_notice', { seconds: 5 })}`);

            // Auto-delete prompt, user's media message and confirmation after 5 seconds
            const userMsgId = msg.message_id;
            const confirmMsgId = confirmMsg?.message_id;
            const promptMsgId = state.promptMessageId;
            const chatId = msg.chat.id;

            setTimeout(async () => {
                try { await bot.deleteMessage(chatId, promptMsgId); } catch (_) { }
                try { await bot.deleteMessage(chatId, userMsgId); } catch (_) { }
                try { await bot.deleteMessage(chatId, confirmMsgId); } catch (_) { }
            }, 5000);

            // Refresh to media menu (not token view)
            await sendPriceAdminMenu(msg.from.id, state.chatId, { fallbackLang: lang, view: 'token', tokenId: state.tokenId });
            return true;
        }
        // ═══ MEDIA BULK ADD ═══
        if (state.type === 'media_bulk_add') {
            // Process media from message (photo or video)
            const mediaItems = [];
            if (msg.photo && msg.photo.length > 0) {
                mediaItems.push({ type: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id });
            }
            if (msg.video) {
                mediaItems.push({ type: 'video', fileId: msg.video.file_id });
            }

            if (mediaItems.length === 0) {
                // User sent text or non-media - end bulk mode and show summary
                priceWizardStates.delete(userId);
                const finalCount = await countPriceAlertMedia(state.tokenId, state.chatId);
                const startCount = state.startCount || 0;
                const addedCount = finalCount - startCount;
                if (addedCount === 0) {
                    const errorMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_media_bulk_empty'));
                    setTimeout(async () => {
                        try { await bot.deleteMessage(msg.chat.id, state.promptMessageId); } catch (_) { }
                        try { await bot.deleteMessage(msg.chat.id, errorMsg.message_id); } catch (_) { }
                    }, 5000);
                } else {
                    const confirmMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_media_bulk_done', { count: addedCount }), { parse_mode: 'HTML' });
                    setTimeout(async () => {
                        try { await bot.deleteMessage(msg.chat.id, state.promptMessageId); } catch (_) { }
                        try { await bot.deleteMessage(msg.chat.id, confirmMsg.message_id); } catch (_) { }
                    }, 5000);
                }
                // Refresh media menu
                const mediaMenu = await buildMediaListMenu(state.chatId, state.tokenId, lang, 0);
                await bot.sendMessage(msg.from.id, mediaMenu.text, {
                    parse_mode: 'HTML',
                    reply_markup: mediaMenu.keyboard
                });
                return true;
            }

            // Add media items - always read current count from DB to avoid race condition
            const currentCount = await countPriceAlertMedia(state.tokenId, state.chatId);
            let addedThisMsg = 0;
            for (const item of mediaItems) {
                if (currentCount + addedThisMsg >= MAX_MEDIA) {
                    break;
                }
                await addPriceAlertMedia(state.tokenId, state.chatId, item.type, item.fileId);
                addedThisMsg++;
            }

            // Calculate total added from startCount (not in-memory addedCount to avoid race)
            const newTotal = await countPriceAlertMedia(state.tokenId, state.chatId);
            const startCount = state.startCount || 0;
            const totalAdded = newTotal - startCount;

            // Check if reached max
            if (newTotal >= MAX_MEDIA) {
                priceWizardStates.delete(userId);
                const doneMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_media_bulk_max_reached', { count: totalAdded }), { parse_mode: 'HTML' });
                setTimeout(async () => {
                    try { await bot.deleteMessage(msg.chat.id, state.promptMessageId); } catch (_) { }
                    try { await bot.deleteMessage(msg.chat.id, doneMsg.message_id); } catch (_) { }
                }, 5000);
                const mediaMenu = await buildMediaListMenu(state.chatId, state.tokenId, lang, 0);
                await bot.sendMessage(msg.from.id, mediaMenu.text, {
                    parse_mode: 'HTML',
                    reply_markup: mediaMenu.keyboard
                });
            }

            // For albums: use debounce to detect when upload finishes
            // Clear any existing debounce timer for this user
            if (state.debounceTimer) {
                clearTimeout(state.debounceTimer);
            }

            // Set debounce timer - if no more photos arrive within 2 seconds, show summary
            const debounceTimer = setTimeout(async () => {
                // Check if user is still in bulk mode (hasn't sent text to end)
                const currentState = priceWizardStates.get(userId);
                if (currentState && currentState.type === 'media_bulk_add') {
                    priceWizardStates.delete(userId);
                    const finalCount = await countPriceAlertMedia(currentState.tokenId, currentState.chatId);
                    const startCount = currentState.startCount || 0;
                    const addedCount = finalCount - startCount;

                    // Show summary
                    const doneMsg = await bot.sendMessage(msg.chat.id, t(lang, 'price_media_bulk_done', { count: addedCount }), { parse_mode: 'HTML' });
                    setTimeout(async () => {
                        try { await bot.deleteMessage(msg.chat.id, currentState.promptMessageId); } catch (_) { }
                        try { await bot.deleteMessage(msg.chat.id, doneMsg.message_id); } catch (_) { }
                    }, 5000);

                    // Show media menu
                    const mediaMenu = await buildMediaListMenu(currentState.chatId, currentState.tokenId, lang, 0);
                    await bot.sendMessage(msg.from.id, mediaMenu.text, {
                        parse_mode: 'HTML',
                        reply_markup: mediaMenu.keyboard
                    });
                }
            }, 2000);

            // Store debounce timer in state
            state.debounceTimer = debounceTimer;
            priceWizardStates.set(userId, state);

            return true;
        }
        return false;
    };
    const buildAlertText = (lang, token, snapshot, overrideTitle = null) => {
        const label = buildTokenLabel(token, snapshot);
        const address = token.tokenAddress || '-';
        // Use overrideTitle if provided, then custom title if set, otherwise use i18n default
        let titleText;
        if (overrideTitle) {
            titleText = escapeHtml(overrideTitle);
        } else if (token.customTitle) {
            titleText = escapeHtml(token.customTitle);
        } else {
            titleText = t(lang, 'price_alert_title', { name: escapeHtml(label) });
        }

        // Format values (no trailing zeros, full precision)
        const formatValue = (val, opts = {}) => {
            if (val === null || val === undefined) return t(lang, 'price_metric_missing');
            let num = Number(val);
            if (opts.maxDecimals !== undefined && Number.isFinite(num)) {
                const factor = Math.pow(10, opts.maxDecimals);
                num = Math.trunc(num * factor) / factor;
            }
            return formatNumberWithCommas(num, opts);
        };

        // Format change with emoji color indicator
        const formatChange = (val) => {
            const num = Number(val);
            if (!Number.isFinite(num)) return null;
            if (num >= 0) return `<b>+${Math.abs(num).toFixed(2)}%</b> 🟢`;
            return `<b>-${Math.abs(num).toFixed(2)}%</b> 🔴`;
        };

        // Get chain name from chainIndex
        const chainIndex = snapshot?.chainIndex || token?.chainIndex;
        const chainName = snapshot?.chainShortName || token?.chainShortName || (chainIndex ? `#${chainIndex}` : null);

        // Build professional layout with section headers
        const lines = [
            `<b>💹 ${titleText}</b>`,
            '',
            // ═══ PRICE SECTION ═══
            `<b>━━━ 💰 ${t(lang, 'price_section_price')} ━━━</b>`,
            `💲 USD: <code>${formatValue(snapshot?.priceUsd, { prefix: '$' })}</code>`,
            `☒ OKB: <code>${formatValue(snapshot?.priceOkb)} OKB</code>`,
            `⟠ ETH: <code>${formatValue(snapshot?.priceEth)} ETH</code>`,
            `₿ BTC: <code>${formatValue(snapshot?.priceBtc)} BTC</code>`,
            '',
            // ═══ MARKET SECTION ═══
            `<b>━━━ 📊 ${t(lang, 'price_section_market')} ━━━</b>`,
            `💎 ${t(lang, 'price_table_market_cap')}: <code>${formatValue(snapshot?.marketCap, { prefix: '$', maxDecimals: 4 })}</code>`,
            `💧 ${t(lang, 'price_table_liquidity')}: <code>${formatValue(snapshot?.liquidity, { prefix: '$', maxDecimals: 4 })}</code>`,
            `🔄 ${t(lang, 'price_table_circ_supply')}: <code>${formatValue(snapshot?.circSupply, { maxDecimals: 4 })}${snapshot?.tokenSymbol ? ' ' + escapeHtml(snapshot.tokenSymbol) : ''}</code>`,
            Number.isFinite(snapshot?.lpBurnedPercent) ? `🔥 ${t(lang, 'price_table_lp_burned')}: <code>${Number(snapshot.lpBurnedPercent).toFixed(2)}%</code>` : null,
            '',
            // ═══ 24H RANGE ═══
            (Number.isFinite(snapshot?.minPrice) && Number.isFinite(snapshot?.maxPrice))
                ? `📊 ${t(lang, 'price_table_24h_range')}: <code>${formatValue(snapshot.minPrice, { prefix: '$', maxDecimals: 4 })} – ${formatValue(snapshot.maxPrice, { prefix: '$', maxDecimals: 4 })}</code>`
                : null,
            '',
            // ═══ ACTIVITY SECTION ═══
            `<b>━━━ 📈 ${t(lang, 'price_section_activity')} ━━━</b>`,
            `👥 ${t(lang, 'price_table_holders')}: <code>${formatValue(snapshot?.holders, { maxDecimals: 4 })}</code>`,
            '',
            `📊 ${t(lang, 'price_table_volume')}:`,
            `  5m: <code>${formatValue(snapshot?.volume5M, { prefix: '$', maxDecimals: 4 })}</code> │ 1h: <code>${formatValue(snapshot?.volume1H, { prefix: '$', maxDecimals: 4 })}</code>`,
            `  4h: <code>${formatValue(snapshot?.volume4H, { prefix: '$', maxDecimals: 4 })}</code> │ 24h: <code>${formatValue(snapshot?.volume24H, { prefix: '$', maxDecimals: 4 })}</code>`,
            '',
            `🔀 ${t(lang, 'price_table_txs')}:`,
            `  5m: <code>${formatValue(snapshot?.txs5M, { maxDecimals: 4 })}</code> │ 1h: <code>${formatValue(snapshot?.txs1H, { maxDecimals: 4 })}</code>`,
            `  4h: <code>${formatValue(snapshot?.txs4H, { maxDecimals: 4 })}</code> │ 24h: <code>${formatValue(snapshot?.txs24H, { maxDecimals: 4 })}</code>`,
            '',
            `📝 ${t(lang, 'price_table_trade_num')}: <code>${formatValue(snapshot?.tradeNum, { maxDecimals: 4 })}${snapshot?.tokenSymbol ? ' ' + escapeHtml(snapshot.tokenSymbol) : ''}</code>`,
            '',
            // ═══ PERFORMANCE ═══
            `<b>━━━ 📉 ${t(lang, 'price_section_performance')} ━━━</b>`,
            (() => {
                const c5 = formatChange(snapshot?.priceChange5M);
                const c1 = formatChange(snapshot?.priceChange1H);
                const c4 = formatChange(snapshot?.priceChange4H);
                const c24 = formatChange(snapshot?.change24h);
                const parts = [];
                if (c5) parts.push(`5m: ${c5}`);
                if (c1) parts.push(`1h: ${c1}`);
                if (c4) parts.push(`4h: ${c4}`);
                if (c24) parts.push(`24h: ${c24}`);
                return parts.length > 0 ? parts.join(' │ ') : `⚪ ${t(lang, 'price_metric_missing')}`;
            })(),
            '',
            // ═══ TOKEN INFO ═══
            `<b>━━━ 🔗 ${t(lang, 'price_section_info')} ━━━</b>`,
            chainName ? `⛓️ ${t(lang, 'price_table_chain')}: <code>${escapeHtml(chainName)}</code>` : null,
            snapshot?.tokenSymbol ? `🏷️ ${t(lang, 'price_table_symbol')}: <code>${escapeHtml(snapshot.tokenSymbol)}</code>` : null,
            snapshot?.tokenLogoUrl ? `🖼️ ${t(lang, 'price_table_icon')}: <a href="${escapeHtml(snapshot.tokenLogoUrl)}">Click Link</a>` : null,
            snapshot?.fetchedAt ? (() => {
                const localeMap = {
                    'vi': { locale: 'vi-VN', tz: 'Asia/Ho_Chi_Minh' },
                    'en': { locale: 'en-US', tz: 'America/New_York' },
                    'zh': { locale: 'zh-CN', tz: 'Asia/Shanghai' },
                    'ko': { locale: 'ko-KR', tz: 'Asia/Seoul' },
                    'ru': { locale: 'ru-RU', tz: 'Europe/Moscow' },
                    'id': { locale: 'id-ID', tz: 'Asia/Jakarta' }
                };
                const { locale, tz } = localeMap[lang] || localeMap['en'];
                return `🕐 ${t(lang, 'price_table_time')}: <code>${new Date(snapshot.fetchedAt).toLocaleString(locale, { timeZone: tz })}</code>`;
            })() : null,
            `📍 ${t(lang, 'price_table_address')}:`,
            (() => {
                const slugMap = { '196': 'xlayer', '1': 'eth', '56': 'bsc', '42161': 'arbitrum', '8453': 'base', '137': 'polygon', '501': 'solana' };
                const ci = String(chainIndex || token?.chainIndex || '196');
                const slug = slugMap[ci] || 'xlayer';
                const explorerUrl = `https://www.okx.com/web3/explorer/${slug}/token/${address}`;
                return `<a href="${explorerUrl}">${escapeHtml(address)}</a>`;
            })()
        ];
        return lines.filter(Boolean).join('\n');
    };
    const sendPriceAlertNow = async (token) => {
        const topicTargets = await listFeatureTopics(token.chatId, 'price');
        const legacyTarget = await getPriceAlertTarget(token.chatId);
        const tokenTopics = await listPriceAlertTokenTopics(token.id, token.chatId);
        const topicStatus = new Map();
        tokenTopics.forEach((entry) => {
            const key = (entry.topicId === undefined || entry.topicId === null ? 'main' : entry.topicId.toString());
            topicStatus.set(key, Number(entry.enabled) === 1);
        });
        const targets = [];
        if (Array.isArray(topicTargets) && topicTargets.length > 0) {
            targets.push(...topicTargets.map((t) => (t.topicId === undefined || t.topicId === null ? 'main' : t.topicId.toString())));
        } else if (legacyTarget) {
            targets.push(legacyTarget.topicId === undefined || legacyTarget.topicId === null ? 'main' : legacyTarget.topicId.toString());
        } else {
            targets.push('main');
        }
        let snapshot = null;
        const cacheKey = `${token.tokenAddress}|${token.chainIndex || ''}`;
        const cached = getCachedMeta(cacheKey);
        try {
            snapshot = await fetchTokenPriceOverview({
                tokenAddress: token.tokenAddress,
                chainIndex: token.chainIndex,
                chainShortName: token.chainShortName,
                throttleMs: PRICE_ALERT_RATE_LIMIT_MS
            });
            if (snapshot) {
                cacheTokenMeta(cacheKey, snapshot);
            }
        } catch (error) {
            if (cached) {
                snapshot = cached;
            } else {
                throw error;
            }
        }

        // Get attached media for random selection
        const mediaList = await listPriceAlertMedia(token.id, token.chatId);
        const randomMedia = mediaList.length > 0
            ? mediaList[Math.floor(Math.random() * mediaList.length)]
            : null;

        // Get custom titles for random selection
        const titleList = await listPriceAlertTitles(token.id, token.chatId);
        const randomTitle = titleList.length > 0
            ? titleList[Math.floor(Math.random() * titleList.length)].title
            : null;

        for (const topicId of targets) {
            const enabled = topicStatus.has(topicId) ? topicStatus.get(topicId) : true;
            if (!enabled) {
                continue;
            }
            const threadId = topicId === 'main' ? null : topicId;
            const lang = await resolveTopicLanguage(token.chatId, threadId, defaultLang);
            const text = buildAlertText(lang, token, snapshot || {}, randomTitle);

            const options = {
                parse_mode: 'HTML'
            };
            if (threadId !== null && threadId !== undefined) {
                options.message_thread_id = Number(threadId);
            }

            // Send with media if available, otherwise text only
            if (randomMedia) {
                options.caption = text;
                if (randomMedia.mediaType === 'video') {
                    await bot.sendVideo(token.chatId, randomMedia.fileId, options);
                } else {
                    await bot.sendPhoto(token.chatId, randomMedia.fileId, options);
                }
            } else {
                options.disable_web_page_preview = true;
                await bot.sendMessage(token.chatId, text, options);
            }
            await delay(PRICE_ALERT_RATE_LIMIT_MS);
        }
    };
    // Circuit breaker: stop hammering when network is down
    let priceAlertConsecutiveFailures = 0;
    const PRICE_ALERT_MAX_CONSECUTIVE_FAILURES = 5;

    const runPriceSchedulerTick = async () => {
        // Circuit breaker: skip tick if too many consecutive failures
        if (priceAlertConsecutiveFailures >= PRICE_ALERT_MAX_CONSECUTIVE_FAILURES) {
            log.warn(`Circuit breaker active (${priceAlertConsecutiveFailures} consecutive failures), skipping tick`);
            // Gradually recover: decrement to allow retry after a few skipped ticks
            priceAlertConsecutiveFailures--;
            return;
        }

        try {
            const due = await listDuePriceAlertTokens(PRICE_ALERT_MAX_PER_TICK, Date.now());
            for (const token of due) {
                try {
                    await sendPriceAlertNow(token);
                    priceAlertConsecutiveFailures = 0; // Reset on success
                } catch (error) {
                    priceAlertConsecutiveFailures++;
                    log.error(`Failed to send alert for ${token.tokenAddress}: ${error.message}`);
                } finally {
                    await recordPriceAlertRun(token.id, token.intervalSeconds);
                }
                await delay(PRICE_ALERT_RATE_LIMIT_MS);
            }
        } catch (error) {
            priceAlertConsecutiveFailures++;
            log.error(`Scheduler tick failed: ${error.message}`);
        }
    };
    const startPriceAlertScheduler = () => {
        if (priceSchedulerTimer) {
            clearInterval(priceSchedulerTimer);
            priceSchedulerTimer = null;
        }
        const tick = () => {
            runPriceSchedulerTick().catch((error) => {
                log.error(`Tick error: ${error.message}`);
            });
        };
        tick();
        priceSchedulerTimer = setInterval(tick, PRICE_ALERT_POLL_INTERVAL_MS);
        if (typeof priceSchedulerTimer.unref === 'function') {
            priceSchedulerTimer.unref();
        }
    };
    return {
        handlePriceCommand,
        handlePriceTargetCommand,
        handlePriceUnsubscribeCommand,
        handlePriceCallback,
        handlePriceWizardMessage,
        sendPriceAdminMenu,
        startPriceAlertScheduler,
        priceWizardStates
    };
}
module.exports = createPriceAlerts;
module.exports.priceWizardStates = priceWizardStates;