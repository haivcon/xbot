import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Globe, Gamepad2, Landmark, Users, UserPlus, TrendingUp, TrendingDown, Copy, Check, ChevronRight, Sparkles, ArrowUpRight } from 'lucide-react';

/* ═══════════════════════════════════════════════════
   X Layer Community Ecosystem — Premium Design
   ═══════════════════════════════════════════════════ */

const XLAYER_CHAIN = '196';
const OKX_TOKEN_URL = (addr) => `https://web3.okx.com/token/x-layer/${addr}`;
const OKX_PRICE_API = 'https://www.okx.com/api/v5/dex/market/token-price';

const COMMUNITIES = [
    {
        name: 'Banmao',
        symbol: 'BANMAO',
        token: '0x16d91d1615fc55b76d5f92365bd60c069b46ef78',
        emoji: '🐱',
        color: '#f59e0b',
        gradient: 'from-amber-500 via-orange-500 to-yellow-400',
        bgGradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
        borderColor: 'border-amber-500/20 hover:border-amber-400/40',
        glowColor: 'hover:shadow-amber-500/15',
        tagline: 'The mischievous cat of X Layer',
        desc: 'GameFi, DeFi & memes ecosystem — building the most fun community on X Layer.',
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
        symbol: 'NIUMA',
        token: '0x87669801a1fad6dad9db70d27ac752f452989667',
        emoji: '🐂',
        color: '#ef4444',
        gradient: 'from-red-500 via-rose-500 to-pink-400',
        bgGradient: 'from-red-500/10 via-rose-500/5 to-transparent',
        borderColor: 'border-red-500/20 hover:border-red-400/40',
        glowColor: 'hover:shadow-red-500/15',
        tagline: 'The unstoppable bull of X Layer',
        desc: 'Powering DEX activity and community culture on X Layer.',
        links: {
            telegram: 'https://t.me/NIUMANEW',
            twitter: 'https://x.com/NIUMA_Xlayer',
            web: 'https://niuma.worrks',
        },
    },
    {
        name: 'Xwizard',
        symbol: 'XWIZARD',
        token: '0xdcc83b32b6b4e95a61951bfcc9d71967515c0fca',
        emoji: '🧙',
        color: '#8b5cf6',
        gradient: 'from-purple-500 via-violet-500 to-indigo-400',
        bgGradient: 'from-purple-500/10 via-violet-500/5 to-transparent',
        borderColor: 'border-purple-500/20 hover:border-purple-400/40',
        glowColor: 'hover:shadow-purple-500/15',
        tagline: 'The wizard of X Layer',
        desc: 'Community magic meets GameFi — conjuring vibes and value.',
        links: {
            telegram: 'https://t.me/okx_xwizard',
            twitter: 'https://x.com/xwizard_cto',
            web: 'https://xwizard.fun',
            gamefi: 'https://vibewizard.fun',
        },
    },
];

/* ── SVG Icons ── */
function TelegramIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
    );
}

function XTwitterIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
    );
}

/* ── Social Icon Button ── */
function SocialButton({ href, icon: Icon, label, bg, hoverBg }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            className={`group/social relative w-10 h-10 rounded-xl ${bg} flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg ${hoverBg}`}
        >
            <Icon size={16} />
            {/* Tooltip */}
            <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[9px] font-medium text-surface-200/50 opacity-0 group-hover/social:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {label}
            </span>
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
        const interval = setInterval(fetchPrices, 30000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return { prices, loading };
}

/* ── Format Price ── */
function fmtPrice(p) {
    if (!p) return '—';
    if (p < 0.000001) return `$${p.toExponential(2)}`;
    if (p < 0.0001) return `$${p.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`;
    if (p < 0.01) return `$${p.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
    if (p < 1) return `$${p.toFixed(4)}`;
    return `$${p.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

/* ── Community Card — Premium Design ── */
function CommunityCard({ community, price, priceLoading }) {
    const [copied, setCopied] = useState(false);
    const { name, symbol, token, emoji, gradient, bgGradient, borderColor, glowColor, tagline, desc, links } = community;

    const copyAddress = () => {
        navigator.clipboard.writeText(token);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`group relative overflow-hidden rounded-2xl border ${borderColor} bg-surface-800/60 backdrop-blur-sm transition-all duration-500 hover:shadow-2xl ${glowColor}`}>
            {/* Background gradient overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} opacity-50 group-hover:opacity-80 transition-opacity duration-500`} />
            {/* Animated gradient border top */}
            <div className={`h-[2px] bg-gradient-to-r ${gradient} opacity-80`} />

            <div className="relative p-6">
                {/* ── Top Row: Logo + Name + Price ── */}
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-4">
                        {/* Animated logo */}
                        <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                            {emoji}
                            {/* Pulse ring */}
                            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-30 animate-ping`} style={{ animationDuration: '2s' }} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-surface-100 tracking-tight">
                                {name}
                            </h3>
                            <p className="text-xs text-surface-200/40 mt-0.5 italic">{tagline}</p>
                        </div>
                    </div>

                    {/* Price Section */}
                    <div className="text-right flex-shrink-0">
                        {priceLoading ? (
                            <div className="space-y-1.5">
                                <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
                                <div className="h-3 w-16 bg-white/5 rounded animate-pulse ml-auto" />
                            </div>
                        ) : (
                            <>
                                <div className="flex items-baseline gap-1 justify-end">
                                    <span className="text-xl font-bold text-surface-100 tabular-nums tracking-tight">
                                        {fmtPrice(price)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 justify-end mt-0.5">
                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                        price ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-surface-200/30'
                                    }`}>
                                        ${symbol}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Description ── */}
                <p className="text-[13px] text-surface-200/45 leading-relaxed mb-5">
                    {desc}
                </p>

                {/* ── Contract Address ── */}
                <div className="flex items-center gap-2 mb-5 group/ca">
                    <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/[0.04] hover:border-white/[0.08] transition-all">
                        <span className="text-[9px] text-surface-200/20 font-bold uppercase tracking-widest">CA</span>
                        <div className="w-px h-3 bg-white/[0.06]" />
                        <code className="text-[11px] text-surface-200/40 font-mono flex-1 truncate group-hover/ca:text-surface-200/60 transition-colors">
                            {token}
                        </code>
                        <button
                            onClick={copyAddress}
                            className="p-1 rounded-lg hover:bg-white/10 text-surface-200/25 hover:text-surface-200/70 transition-all"
                        >
                            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                    </div>
                </div>

                {/* ── Social Links + OKX ── */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        {links.telegram && (
                            <SocialButton href={links.telegram} icon={TelegramIcon} label="Telegram"
                                bg="bg-sky-500/10 text-sky-400" hoverBg="hover:bg-sky-500/20 hover:shadow-sky-500/20" />
                        )}
                        {links.twitter && (
                            <SocialButton href={links.twitter} icon={XTwitterIcon} label="X / Twitter"
                                bg="bg-slate-200/10 text-slate-200" hoverBg="hover:bg-slate-200/20 hover:shadow-slate-200/10" />
                        )}
                        {links.web && (
                            <SocialButton href={links.web} icon={Globe} label="Website"
                                bg="bg-cyan-500/10 text-cyan-400" hoverBg="hover:bg-cyan-500/20 hover:shadow-cyan-500/20" />
                        )}
                        {links.gamefi && (
                            <SocialButton href={links.gamefi} icon={Gamepad2} label="GameFi"
                                bg="bg-purple-500/10 text-purple-400" hoverBg="hover:bg-purple-500/20 hover:shadow-purple-500/20" />
                        )}
                        {links.defi && (
                            <SocialButton href={links.defi} icon={Landmark} label="DeFi"
                                bg="bg-emerald-500/10 text-emerald-400" hoverBg="hover:bg-emerald-500/20 hover:shadow-emerald-500/20" />
                        )}
                    </div>

                    {/* OKX Web3 link */}
                    <a
                        href={OKX_TOKEN_URL(token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] text-surface-200/40 hover:text-surface-200/70 transition-all duration-200 text-[11px] font-medium group/okx"
                    >
                        <span>OKX Web3</span>
                        <ArrowUpRight size={11} className="group-hover/okx:translate-x-0.5 group-hover/okx:-translate-y-0.5 transition-transform" />
                    </a>
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

            {/* ═══════ Hero Section ═══════ */}
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.06]">
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-brand-500/15 via-purple-500/10 to-cyan-500/10" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-500/10 via-transparent to-transparent" />

                {/* Grid pattern overlay */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />

                {/* Floating orbs */}
                <div className="absolute top-10 right-20 w-32 h-32 rounded-full bg-brand-500/10 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute bottom-5 left-20 w-24 h-24 rounded-full bg-purple-500/10 blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />

                <div className="relative px-8 py-10 sm:px-12 sm:py-14">
                    <div className="flex items-center gap-5 mb-2">
                        {/* Animated X Layer logo */}
                        <div className="relative">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-3xl shadow-2xl shadow-brand-500/30">
                                🌐
                            </div>
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-surface-800 flex items-center justify-center">
                                <Check size={10} className="text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-surface-100 tracking-tight">
                                X Layer <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">Community</span>
                            </h1>
                            <p className="text-sm text-surface-200/40 mt-1 max-w-lg">
                                Discover the vibrant ecosystem of communities building on X Layer — GameFi, DeFi & beyond
                            </p>
                        </div>
                    </div>

                    {/* Stats pills */}
                    <div className="flex items-center gap-3 mt-7 flex-wrap">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
                            <Users size={14} className="text-brand-400" />
                            <span className="text-xs text-surface-200/60">
                                <span className="text-surface-100 font-bold">{COMMUNITIES.length}</span> Communities
                            </span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
                            <Gamepad2 size={14} className="text-purple-400" />
                            <span className="text-xs text-surface-200/60">
                                <span className="text-surface-100 font-bold">{COMMUNITIES.filter(c => c.links.gamefi).length}</span> GameFi
                            </span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
                            <Landmark size={14} className="text-emerald-400" />
                            <span className="text-xs text-surface-200/60">
                                <span className="text-surface-100 font-bold">{COMMUNITIES.filter(c => c.links.defi).length}</span> DeFi
                            </span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
                            <Sparkles size={14} className="text-amber-400" />
                            <span className="text-xs text-surface-200/60">
                                <span className="text-surface-100 font-bold">X Layer</span> Chain
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ Community Cards ═══════ */}
            <div className="space-y-5">
                {COMMUNITIES.map((community) => (
                    <CommunityCard
                        key={community.token}
                        community={community}
                        price={prices[community.token.toLowerCase()]}
                        priceLoading={priceLoading}
                    />
                ))}
            </div>

            {/* ═══════ Registration CTA ═══════ */}
            <div className="relative overflow-hidden rounded-3xl">
                {/* Gradient border effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-brand-500/30 via-purple-500/30 to-cyan-500/30 rounded-3xl" />
                <div className="absolute inset-[1px] bg-surface-800/95 rounded-3xl" />

                <div className="relative p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20 flex items-center justify-center">
                            <UserPlus size={26} className="text-brand-400" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 text-lg">✨</div>
                    </div>

                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-surface-100 mb-2 flex items-center gap-2">
                            List Your Community
                            <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 text-[10px] font-semibold uppercase tracking-wider">Free</span>
                        </h3>
                        <p className="text-sm text-surface-200/40 leading-relaxed max-w-xl">
                            Building on X Layer? Get your community token, GameFi, or DeFi project featured in the X Layer ecosystem directory.
                            Join the growing network of projects shaping the future of X Layer.
                        </p>
                    </div>

                    <a
                        href="https://x.com/haivcon"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-xl shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.03] active:scale-95 transition-all duration-300 whitespace-nowrap"
                    >
                        <XTwitterIcon size={16} />
                        Contact @haivcon
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </a>
                </div>
            </div>

            {/* ═══════ Footer ═══════ */}
            <div className="text-center space-y-2 pb-6">
                <p className="text-[10px] text-surface-200/15">
                    Prices powered by OKX DEX API · Auto-refresh every 30s · X Layer (Chain ID: 196)
                </p>
            </div>
        </div>
    );
}
