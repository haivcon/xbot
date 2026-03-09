const logger = require('../../core/logger');
const log = logger.child('TopToken');

async function handleTopTokenCallback({
    bot,
    query,
    chatId,
    callbackLang,
    buildTopTokenSessionKey,
    getTopTokenSession,
    updateTopTokenSession,
    buildTopTokenChainMenu,
    buildTopTokenSortMenu,
    buildTopTokenTimeframeMenu,
    renderTopTokenResults,
    describeTopTokenSort,
    formatChainLabel,
    resolveTopTokenChainEntry,
    t
}) {
    const data = query.data;
    if (!data || !data.startsWith('toptoken')) {
        return false;
    }

    const topTokenSessionKey = buildTopTokenSessionKey(chatId, query.from?.id);
    const topTokenTargetChat = chatId || query.from?.id;
    const queryId = query.id;

    if (data === 'toptoken_noop') {
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    const renderTopTokenMessage = async (payload) => {
        if (!payload || !payload.text || !topTokenTargetChat) {
            return;
        }

        const options = {
            chat_id: topTokenTargetChat,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: payload.replyMarkup
        };

        if (options.message_id) {
            try {
                await bot.editMessageText(payload.text, options);
                return;
            } catch (error) {
                // fallback to sending a new message
            }
        }

        await bot.sendMessage(topTokenTargetChat, payload.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: payload.replyMarkup
        });
    };

    if (data === 'toptoken_restart') {
        updateTopTokenSession(topTokenSessionKey, { sortBy: null, timeFrame: null, entries: null, page: 0 });
        try {
            const menu = await buildTopTokenChainMenu(callbackLang);
            await renderTopTokenMessage(menu);
        } catch (error) {
            log.error(`Failed to restart flow: ${error.message}`);
        }
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data === 'toptoken_back_sort') {
        const session = getTopTokenSession(topTokenSessionKey) || {};
        if (!Number.isFinite(session.chainIndex)) {
            const menu = await buildTopTokenChainMenu(callbackLang);
            await renderTopTokenMessage(menu);
            await bot.answerCallbackQuery(queryId);
            return true;
        }
        const sortMenu = buildTopTokenSortMenu(callbackLang, session);
        await renderTopTokenMessage(sortMenu);
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data === 'toptoken_back_time') {
        const session = getTopTokenSession(topTokenSessionKey) || {};
        if (!Number.isFinite(session.chainIndex) || !Number.isFinite(session.sortBy)) {
            const menu = await buildTopTokenChainMenu(callbackLang);
            await renderTopTokenMessage(menu);
            await bot.answerCallbackQuery(queryId);
            return true;
        }
        const timeMenu = buildTopTokenTimeframeMenu(callbackLang, session);
        await renderTopTokenMessage(timeMenu);
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data.startsWith('toptoken_page')) {
        const page = Number((data.includes('|') ? data.split('|')[1] : data.split(':')[1]) || '0');
        try {
            const menu = await buildTopTokenChainMenu(callbackLang, { page });
            await renderTopTokenMessage(menu);
        } catch (error) {
            log.error(`Failed to paginate chains: ${error.message}`);
        }
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data.startsWith('toptoken_chain|')) {
        const parts = data.split('|');
        const chainIndex = Number(parts[1]);
        const chainEntry = await resolveTopTokenChainEntry(chainIndex);
        const chainLabel = formatChainLabel(chainEntry) || (Number.isFinite(chainIndex) ? `#${chainIndex}` : '-');

        updateTopTokenSession(topTokenSessionKey, {
            chainIndex,
            chainLabel,
            sortBy: null,
            timeFrame: null,
            lang: callbackLang,
            entries: null,
            page: 0
        });

        const sortMenu = buildTopTokenSortMenu(callbackLang, { chainIndex, chainLabel });
        await renderTopTokenMessage(sortMenu);
        await bot.answerCallbackQuery(queryId, { text: chainLabel });
        return true;
    }

    if (data.startsWith('toptoken_sort|')) {
        const parts = data.split('|');
        const sortBy = Number(parts[1]);
        const session = getTopTokenSession(topTokenSessionKey) || {};
        if (!Number.isFinite(session.chainIndex)) {
            const menu = await buildTopTokenChainMenu(callbackLang);
            await renderTopTokenMessage(menu);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'toptoken_chain_prompt') });
            return true;
        }

        const updated = updateTopTokenSession(topTokenSessionKey, {
            sortBy,
            sortLabel: describeTopTokenSort(callbackLang, sortBy),
            entries: null,
            page: 0
        });
        const timeMenu = buildTopTokenTimeframeMenu(callbackLang, updated);
        await renderTopTokenMessage(timeMenu);
        await bot.answerCallbackQuery(queryId, { text: updated.sortLabel });
        return true;
    }

    if (data.startsWith('toptoken_time|')) {
        const parts = data.split('|');
        const timeFrame = Number(parts[1]);
        const session = getTopTokenSession(topTokenSessionKey) || {};
        if (!Number.isFinite(session.chainIndex) || !Number.isFinite(session.sortBy)) {
            const menu = await buildTopTokenChainMenu(callbackLang);
            await renderTopTokenMessage(menu);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'toptoken_chain_prompt') });
            return true;
        }

        updateTopTokenSession(topTokenSessionKey, { timeFrame, entries: null, page: 0 });
        const result = await renderTopTokenResults(callbackLang, {
            chainIndex: session.chainIndex,
            sortBy: session.sortBy,
            timeFrame
        }, { sessionKey: topTokenSessionKey, page: 0, forceRefresh: true });
        await renderTopTokenMessage(result);
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_executed') });
        return true;
    }

    if (data.startsWith('toptoken_result_page|')) {
        const parts = data.split('|');
        const page = Number(parts[1]);
        const session = getTopTokenSession(topTokenSessionKey) || {};
        if (!Number.isFinite(session.chainIndex) || !Number.isFinite(session.sortBy) || !Number.isFinite(session.timeFrame)) {
            const menu = await buildTopTokenChainMenu(callbackLang);
            await renderTopTokenMessage(menu);
            await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'toptoken_chain_prompt') });
            return true;
        }

        const result = await renderTopTokenResults(callbackLang, {
            chainIndex: session.chainIndex,
            sortBy: session.sortBy,
            timeFrame: session.timeFrame
        }, { sessionKey: topTokenSessionKey, page });
        await renderTopTokenMessage(result);
        await bot.answerCallbackQuery(queryId);
        return true;
    }

    if (data.startsWith('toptoken_refresh|')) {
        const parts = data.split('|');
        const chainIndex = Number(parts[1]);
        const sortBy = Number(parts[2]);
        const timeFrame = Number(parts[3]);

        const session = updateTopTokenSession(topTokenSessionKey, { chainIndex, sortBy, timeFrame, entries: null });
        const result = await renderTopTokenResults(callbackLang, { chainIndex, sortBy, timeFrame }, {
            sessionKey: topTokenSessionKey,
            page: Number.isFinite(session?.page) ? session.page : 0,
            forceRefresh: true
        });
        await renderTopTokenMessage(result);
        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_executed') });
        return true;
    }

    return false;
}

module.exports = { handleTopTokenCallback };
