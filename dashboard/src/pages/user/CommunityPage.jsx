import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Globe, Gamepad2, Landmark, Users, UserPlus, TrendingUp, Copy, Check, ChevronRight } from 'lucide-react';

/* ═══════════════════════════════════════════════════
   X Layer Community Ecosystem
   ═══════════════════════════════════════════════════ */

const XLAYER_CHAIN = '196';
const OKX_TOKEN_URL = (addr) => `https://web3.okx.com/token/x-layer/${addr}`;
const OKX_PRICE_API = 'https://www.okx.com/api/v5/dex/market/token-price';

const COMMUNITIES = [
    {
        name: 'Banmao',
        symbol: '$BANMAO',
        token: '0x16d91d1615fc55b76d5f92365bd60c069b46ef78',
        logo: '🐱',
        gradient: 'from-amber-500 to-orange-500',
        glow: 'shadow-amber-500/20',
        desc: 'The mischievous cat of X Layer — GameFi, DeFi & memes.',
        links: {
            telegram: 'https://t.me/banmao_X',
            twitter: 'https://x.com/banmao_X',
            web: 'https://banmao.fun',
            gamefi: 'https://banmao.fun/gamefi',
            defi: 'https://banmao.fun/defi',
        },
    },
    {
        name: 'Niuma',
        symbol: '$NIUMA',
        token: '0x87669801a1fad6dad9db70d27ac752f452989667',
        logo: '🐂',
        gradient: 'from-red-500 to-rose-500',
        glow: 'shadow-red-500/20',
        desc: 'The unstoppable bull — powering DEX activity on X Layer.',
        links: {
            telegram: 'https://t.me/NIUMANEW',
            twitter: 'https://x.com/NIUMA_Xlayer',
            web: 'https://niuma.worrks',
        },
    },
    {
        name: 'Xwizard',
        symbol: '$XWIZARD',
        token: '0xdcc83b32b6b4e95a61951bfcc9d71967515c0fca',
        logo: '🧙',
        gradient: 'from-purple-500 to-indigo-500',
        glow: 'shadow-purple-500/20',
        desc: 'The wizard of X Layer — GameFi vibes & community magic.',
        links: {
            telegram: 'https://t.me/okx_xwizard',
            twitter: 'https://x.com/xwizard_cto',
            web: 'https://xwizard.fun',
            gamefi: 'https://vibewizard.fun',
        },
    },
];

/* ── Social Icons ── */
function TelegramIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
    );
}

function XIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
    );
}

/* ── Link Badge ── */
function LinkBadge({ href, icon: Icon, label, color = 'brand' }) {
    const colors = {
        brand: 'bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 border-brand-500/20',
        telegram: 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border-sky-500/20',
        twitter: 'bg-slate-200/10 text-slate-200 hover:bg-slate-200/20 border-slate-200/20',
        gamefi: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border-purple-500/20',
        defi: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20',
        web: 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border-cyan-500/20',
    };
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-200 hover:scale-[1.03] active:scale-95 ${colors[color]}`}
        >
            <Icon size={12} />
            {label}
            <ExternalLink size={9} className="opacity-40" />
        </a>
    );
}

/* ── Token Price Hook ── */
function useTokenPrices(tokens) {
    const [prices, setPrices] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetchPrices() {
            setLoading(true);
            const results = {};
            await Promise.allSettled(
                tokens.map(async (addr) => {
                    try {
                        const res = await fetch(
                            `${OKX_PRICE_API}?chainIndex=${XLAYER_CHAIN}&tokenContractAddress=${addr}`
                        );
                        const json = await res.json();
                        const price = json?.data?.[0]?.price || json?.data?.[0]?.tokenPrice;
                        if (price && !cancelled) results[addr.toLowerCase()] = parseFloat(price);
                    } catch { /* ignore */ }
                })
            );
            if (!cancelled) { setPrices(results); setLoading(false); }
        }
        fetchPrices();
        const interval = setInterval(fetchPrices, 30000); // refresh every 30s
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return { prices, loading };
}

/* ── Community Card ── */
function CommunityCard({ community, price, priceLoading }) {
    const [copied, setCopied] = useState(false);
    const { name, symbol, token, logo, gradient, glow, desc, links } = community;

    const copyAddress = () => {
        navigator.clipboard.writeText(token);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fmtPrice = (p) => {
        if (!p) return '—';
        if (p < 0.000001) return `$${p.toExponential(2)}`;
        if (p < 0.01) return `$${p.toFixed(8).replace(/0+$/, '')}`;
        if (p < 1) return `$${p.toFixed(6)}`;
        return `$${p.toFixed(4)}`;
    };

    return (
        <div className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-800/80 hover:border-white/[0.12] transition-all duration-300 hover:shadow-xl ${glow}`}>
            {/* Gradient accent top */}
            <div className={`h-1 bg-gradient-to-r ${gradient}`} />

            <div className="p-5 sm:p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                            {logo}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-surface-100 flex items-center gap-2">
                                {name}
                                <span className="text-xs font-medium text-surface-200/40">{symbol}</span>
                            </h3>
                            <p className="text-[11px] text-surface-200/40 mt-0.5 max-w-xs">{desc}</p>
                        </div>
                    </div>

                    {/* Price badge */}
                    <div className="text-right flex-shrink-0 ml-3">
                        {priceLoading ? (
                            <div className="h-6 w-20 bg-white/5 rounded animate-pulse" />
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <TrendingUp size={12} className="text-emerald-400" />
                                <span className="text-sm font-bold text-surface-100">{fmtPrice(price)}</span>
                            </div>
                        )}
                        <a
                            href={OKX_TOKEN_URL(token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-brand-400/60 hover:text-brand-400 transition-colors flex items-center gap-0.5 justify-end mt-1"
                        >
                            OKX Web3 <ExternalLink size={8} />
                        </a>
                    </div>
                </div>

                {/* Contract address */}
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-surface-200/25 font-medium uppercase tracking-wider">CA</span>
                    <code className="text-[11px] text-surface-200/50 font-mono flex-1 truncate">{token}</code>
                    <button
                        onClick={copyAddress}
                        className="p-1 rounded-md hover:bg-white/10 text-surface-200/30 hover:text-surface-200/70 transition-all"
                        title="Copy address"
                    >
                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                </div>

                {/* Social links */}
                <div className="flex flex-wrap gap-2">
                    {links.telegram && <LinkBadge href={links.telegram} icon={TelegramIcon} label="Telegram" color="telegram" />}
                    {links.twitter && <LinkBadge href={links.twitter} icon={XIcon} label="X" color="twitter" />}
                    {links.web && <LinkBadge href={links.web} icon={Globe} label="Website" color="web" />}
                    {links.gamefi && <LinkBadge href={links.gamefi} icon={Gamepad2} label="GameFi" color="gamefi" />}
                    {links.defi && <LinkBadge href={links.defi} icon={Landmark} label="DeFi" color="defi" />}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════ */
export default function CommunityPage() {
    const { t } = useTranslation();
    const tokenAddresses = useMemo(() => COMMUNITIES.map(c => c.token), []);
    const { prices, loading: priceLoading } = useTokenPrices(tokenAddresses);

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Hero Header */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-surface-800/90 to-surface-800/50">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDE3aDR2NEgzNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
                <div className="relative px-6 py-8 sm:px-10 sm:py-10">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-2xl shadow-lg shadow-brand-500/20">
                            🌐
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-surface-100">
                                X Layer Community
                            </h1>
                            <p className="text-sm text-surface-200/40 mt-1">
                                Discover the vibrant ecosystem of communities building on X Layer
                            </p>
                        </div>
                    </div>

                    {/* Stats bar */}
                    <div className="flex items-center gap-6 mt-6">
                        <div className="flex items-center gap-2">
                            <Users size={14} className="text-brand-400" />
                            <span className="text-xs text-surface-200/50">
                                <span className="text-surface-100 font-bold">{COMMUNITIES.length}</span> Communities
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Gamepad2 size={14} className="text-purple-400" />
                            <span className="text-xs text-surface-200/50">
                                <span className="text-surface-100 font-bold">{COMMUNITIES.filter(c => c.links.gamefi).length}</span> GameFi
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Landmark size={14} className="text-emerald-400" />
                            <span className="text-xs text-surface-200/50">
                                <span className="text-surface-100 font-bold">{COMMUNITIES.filter(c => c.links.defi).length}</span> DeFi
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Community Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {COMMUNITIES.map((community) => (
                    <CommunityCard
                        key={community.token}
                        community={community}
                        price={prices[community.token.toLowerCase()]}
                        priceLoading={priceLoading}
                    />
                ))}
            </div>

            {/* Registration CTA */}
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-brand-500/20 bg-gradient-to-br from-brand-500/[0.04] to-purple-500/[0.04]">
                <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <UserPlus size={24} className="text-brand-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-surface-100 mb-1">List Your Community</h3>
                        <p className="text-sm text-surface-200/40 leading-relaxed max-w-lg">
                            Are you building on X Layer? Get your community token, GameFi, or DeFi project listed in the X Layer ecosystem directory. 
                            Join  the growing network of projects that are shaping the future of X Layer.
                        </p>
                    </div>
                    <a
                        href="https://x.com/haivcon"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.03] active:scale-95 transition-all duration-200 whitespace-nowrap"
                    >
                        <XIcon size={14} />
                        Contact @haivcon
                        <ChevronRight size={14} />
                    </a>
                </div>
            </div>

            {/* Footer note */}
            <p className="text-center text-[10px] text-surface-200/20 pb-4">
                Prices powered by OKX DEX API · Last updated every 30 seconds · X Layer (Chain ID: 196)
            </p>
        </div>
    );
}
