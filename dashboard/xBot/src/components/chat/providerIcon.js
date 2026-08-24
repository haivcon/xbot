const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_TEXT = /^[A-Z0-9+.-]{1,4}$/;
const configuredBase = String(import.meta.env?.BASE_URL || '');
const PUBLIC_BASE = (configuredBase && configuredBase !== '/' ? configuredBase : '/xBot/').replace(/\/+$/, '');

function providerAsset(fileName) {
    return `${PUBLIC_BASE}/providers/${fileName}`;
}

const PROVIDER_ICON_OVERRIDES = Object.freeze({
    antigravity: { src: providerAsset('antigravity.png'), text: 'AG' },
    claude: { src: providerAsset('claude.png'), text: 'AI' },
    cline: { src: providerAsset('cline.png'), text: 'CL' },
    cursor: { src: providerAsset('cursor.png'), text: 'CU' },
    'gemini-cli': { src: providerAsset('gemini-cli.png'), text: 'G' },
    'grok-web': { src: providerAsset('grok-web.png'), text: 'GX' },
    kimchi: { src: providerAsset('kimchi.svg'), text: 'K' },
    'mimo-free': { src: providerAsset('mimo-free.png'), text: 'MF' },
    codex: { src: providerAsset('codex.png'), text: 'OX' },
    opencode: { src: providerAsset('opencode.png'), text: 'OC' },
    'perplexity-web': { src: providerAsset('perplexity-web.png'), text: 'PX' },
});

const PROVIDER_ICON_ALIASES = Object.freeze({
    'anthropic-claude': 'claude',
    'claude-code': 'claude',
    gcli: 'grok-cli',
    gb: 'grok-cli',
    'grok-build': 'grok-cli',
    'openai-codex': 'codex',
    'opencode-free': 'opencode',
    perplexity: 'perplexity-web',
});

function monogram(provider) {
    const source = String(provider?.name || provider?.id || '?').trim();
    const words = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
    const value = words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2);
    return value.toUpperCase().replace(/[^A-Z0-9+.-]/g, '').slice(0, 4) || '?';
}

export function resolveProviderIcon(provider = {}) {
    const rawId = String(provider.id || '').toLowerCase();
    const id = SAFE_ID.test(rawId) ? (PROVIDER_ICON_ALIASES[rawId] || rawId) : '';
    const reviewed = PROVIDER_ICON_OVERRIDES[id];
    const candidateText = reviewed?.text || String(provider.textIcon || '');
    return {
        kind: reviewed ? 'asset' : 'monogram',
        src: reviewed?.src || null,
        text: SAFE_TEXT.test(candidateText) ? candidateText : monogram(provider),
    };
}

export { PROVIDER_ICON_ALIASES, PROVIDER_ICON_OVERRIDES };
