const CHAIN_ICON_MAP = [
    { aliases: ['xlayer', 'x-layer', 'x layer', 'okxchain', 'okbchain'], icon: '❤️' },
    { aliases: ['ethereum', 'eth'], icon: '🟣' },
    { aliases: ['bsc', 'bnb', 'binance'], icon: '🟡' },
    { aliases: ['arbitrum', 'arb'], icon: '🔵' },
    { aliases: ['polygon', 'matic'], icon: '🟪' },
    { aliases: ['optimism', 'op'], icon: '🔴' },
    { aliases: ['solana', 'sol'], icon: '🟧' },
    { aliases: ['avalanche', 'avax'], icon: '⚪' },
    { aliases: ['tron', 'trx'], icon: '🔺' }
];

function getChainIcon(entry) {
    if (!entry) {
        return '';
    }
    const chainIndex = Number(entry.chainIndex ?? entry.chainId);
    if (Number.isFinite(chainIndex) && chainIndex === 196) {
        return '❤️';
    }
    const names = [
        entry.chainShortName,
        entry.chainName,
        ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ]
        .map((name) => (name || '').toString().toLowerCase())
        .filter(Boolean);

    for (const item of CHAIN_ICON_MAP) {
        if (item.aliases.some((alias) => names.includes(alias))) {
            return item.icon;
        }
    }
    return '⛓️';
}

module.exports = { getChainIcon };
