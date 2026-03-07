function normalizeChainEntries(entries) {
    return (entries || []).filter((entry) => Number.isFinite(entry?.chainIndex));
}

function sortChainsWithPriority(entries, { preferChainIndex = null, preferAliases = [] } = {}) {
    const normalized = normalizeChainEntries(entries);
    const normalizedAliases = (preferAliases || []).map((alias) => String(alias || '').toLowerCase()).filter(Boolean);

    const score = (entry) => {
        const idx = Number(entry?.chainIndex);
        if (Number.isFinite(preferChainIndex) && idx === Number(preferChainIndex)) {
            return -2;
        }
        const names = [
            entry?.chainShortName,
            entry?.chainName,
            ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
        ]
            .map((value) => String(value || '').toLowerCase())
            .filter(Boolean);
        if (normalizedAliases.some((alias) => names.includes(alias))) {
            return -1;
        }
        return 0;
    };

    return normalized.sort((a, b) => {
        const scoreA = score(a);
        const scoreB = score(b);
        if (scoreA !== scoreB) {
            return scoreA - scoreB;
        }
        return Number(a.chainIndex) - Number(b.chainIndex);
    });
}

function buildPaginatedChainKeyboard(entries, {
    t,
    lang,
    prefix,
    formatLabel = (entry) => entry?.chainShortName || entry?.chainName || `#${entry?.chainIndex ?? ''}`,
    buildSelectCallback = null,
    page = 0,
    perRow = 2,
    maxRows = 5,
    backCallbackData = null,
    closeCallbackData = 'ui_close',
    preferChainIndex = null,
    preferAliases = ['xlayer']
} = {}) {
    const sorted = sortChainsWithPriority(entries, { preferChainIndex, preferAliases });
    const chainRowsAllowed = Math.max(1, maxRows - 1); // reserve 1 row for navigation/controls
    const perPage = Math.max(1, chainRowsAllowed * Math.max(1, perRow));
    const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
    const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);

    const start = currentPage * perPage;
    const slice = sorted.slice(start, start + perPage);

    const inline_keyboard = [];
    for (let i = 0; i < slice.length; i += perRow) {
        const row = slice.slice(i, i + perRow).map((entry) => {
            const labelResult = formatLabel(entry);
            const label = typeof labelResult === 'object' && labelResult !== null ? labelResult.label : labelResult;
            const customCallback = typeof labelResult === 'object' && labelResult !== null ? labelResult.callbackToken : null;
            const callbackData = typeof buildSelectCallback === 'function'
                ? buildSelectCallback(entry, { label, callbackToken: customCallback })
                : null;
            return {
                text: label || `#${entry?.chainIndex ?? ''}`,
                callback_data: callbackData
                    || (customCallback ? `${prefix}_chain:${customCallback}` : `${prefix}_chain:${entry.chainIndex}`)
            };
        });
        inline_keyboard.push(row);
    }

    const navRow = [];
    if (totalPages > 1 && currentPage > 0) {
        navRow.push({ text: '⬅️', callback_data: `${prefix}_page:${currentPage - 1}` });
    }
    if (totalPages > 1) {
        navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: `${prefix}_noop` });
    }
    if (totalPages > 1 && currentPage < totalPages - 1) {
        navRow.push({ text: '➡️', callback_data: `${prefix}_page:${currentPage + 1}` });
    }
    if (backCallbackData) {
        navRow.push({ text: `↩️ ${t(lang, 'action_back')}`, callback_data: backCallbackData });
    }
    navRow.push({ text: `✖ ${t(lang, 'action_close')}`, callback_data: closeCallbackData || 'ui_close' });
    inline_keyboard.push(navRow);

    return {
        inline_keyboard,
        page: currentPage,
        pageCount: totalPages,
        entries: sorted
    };
}

module.exports = {
    normalizeChainEntries,
    sortChainsWithPriority,
    buildPaginatedChainKeyboard
};
