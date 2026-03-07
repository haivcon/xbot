function createWalletInline({ t, buildWalletDexOverviewText, formatCopyableValueHtml, escapeHtml }) {
    function buildWalletBalanceTextInline(lang, entries, options = {}) {
        if (!entries || entries.length === 0) {
            return t(lang, 'wallet_overview_empty');
        }

        const entry = entries[0] || {};
        const warnings = [];
        if (entry.warning === 'rpc_offline') {
            warnings.push(t(lang, 'wallet_balance_rpc_warning'));
        }
        if (entry.warning === 'wallet_cached' || entry.cached) {
            warnings.push(t(lang, 'wallet_balance_cache_warning'));
        }

        const overview = {
            tokens: Array.isArray(entry.tokens) ? entry.tokens : [],
            totalUsd: Number.isFinite(entry.totalUsd) ? entry.totalUsd : null
        };

        const body = buildWalletDexOverviewText(lang, entry.address, overview, {
            chainLabel: options.chainLabel,
            page: options.page
        });

        return [warnings.join('\n'), body].filter(Boolean).join('\n\n').trim();
    }

    function formatUserLabel(user) {
        const nameParts = [];
        if (user?.fullName) {
            nameParts.push(escapeHtml(user.fullName));
        }
        if (user?.username) {
            nameParts.push(`@${escapeHtml(user.username)}`);
        }
        const copyableId = formatCopyableValueHtml(user?.chatId || user?.userId) || escapeHtml(user?.chatId || user?.userId || '');
        if (!nameParts.length) {
            return copyableId;
        }
        return `${nameParts.join(' · ')} (${copyableId})`;
    }

    return {
        buildWalletBalanceTextInline,
        formatUserLabel
    };
}

module.exports = createWalletInline;
