import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    ExternalLink, Globe, Gamepad2, Landmark, Users, UserPlus,
    TrendingUp, TrendingDown, Copy, Check, ChevronRight, ChevronDown, ChevronUp,
    Sparkles, ArrowUpRight, Heart, ShoppingCart, Star, Zap
} from 'lucide-react';
import api from '@/api/client';

/* ═══════════════════════════════════════════════════
   X Layer Community Ecosystem — Premium Design v2
   ═══════════════════════════════════════════════════ */

const XLAYER_CHAIN = '196';
const OKX_TOKEN_URL = (addr) => `https://web3.okx.com/token/x-layer/${addr}`;

const COMMUNITIES = [
    {
        name: 'Banmao',
        symbol: 'BANMAO',
        token: '0x16d91d1615fc55b76d5f92365bd60c069b46ef78',
        logo: '/logos/banmao.png',
        color: '#f59e0b',
        gradient: 'from-amber-500 via-orange-500 to-yellow-400',
        bgGradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
        borderColor: 'border-amber-500/20 hover:border-amber-400/40',
        glowColor: 'hover:shadow-amber-500/15',
        expandedBg: 'from-amber-500/15 via-orange-500/8 to-transparent',
        tagline: 'banmaoTagline',
        desc: 'banmaoDesc',
        isNew: false,
        addedDate: '2024-01-01',
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
        logo: '/logos/niuma.png',
        color: '#ef4444',
        gradient: 'from-red-500 via-rose-500 to-pink-400',
        bgGradient: 'from-red-500/10 via-rose-500/5 to-transparent',
        borderColor: 'border-red-500/20 hover:border-red-400/40',
        glowColor: 'hover:shadow-red-500/15',
        expandedBg: 'from-red-500/15 via-rose-500/8 to-transparent',
        tagline: 'niumaTagline',
        desc: 'niumaDesc',
        isNew: false,
        addedDate: '2024-01-01',
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
        logo: '/logos/xwizard.png',
        color: '#8b5cf6',
        gradient: 'from-purple-500 via-violet-500 to-indigo-400',
        bgGradient: 'from-purple-500/10 via-violet-500/5 to-transparent',
        borderColor: 'border-purple-500/20 hover:border-purple-400/40',
        glowColor: 'hover:shadow-purple-500/15',
        expandedBg: 'from-purple-500/15 via-violet-500/8 to-transparent',
        tagline: 'xwizardTagline',
        desc: 'xwizardDesc',
        isNew: true,
        addedDate: '2025-12-01',
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
            className={`group/social relative w-9 h-9 rounded-xl ${bg} flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg ${hoverBg}`}
        >
            <Icon size={14} />
        </a>
    );
}

/* ── Token Price Hook — uses API client with proper auth ── */
function useTokenPrices(tokens) {
    const [prices, setPrices] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetchPrices() {
            setLoading(true);
            try {
                const body = tokens.map(addr => ({ chainIndex: XLAYER_CHAIN, tokenContractAddress: addr }));
                const json = await api.getTokenPrice(body);
                if (!cancelled && Array.isArray(json?.data)) {
                    const results = {};
                    for (const item of json.data) {
                        const addr = (item.tokenContractAddress || '').toLowerCase();
                        const p = parseFloat(item.price);
                        if (addr && p > 0) results[addr] = p;
                    }
                    setPrices(results);
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        }
        fetchPrices();
        const interval = setInterval(fetchPrices, 30000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return { prices, loading };
}

/* ── Token Info Hook (market cap, liquidity, 24h change, holder count) ── */
function useTokenInfo(tokens) {
    const [info, setInfo] = useState({});

    useEffect(() => {
        let cancelled = false;
        async function fetchInfo() {
            try {
                const body = tokens.map(addr => ({ chainIndex: XLAYER_CHAIN, tokenContractAddress: addr }));
                const json = await api.getTokenInfo(body);
                if (!cancelled) {
                    const results = {};
                    const priceInfos = json?.priceInfo || [];
                    const basicInfos = json?.basicInfo || [];

                    // Index basicInfo by address for holder count lookup
                    const basicMap = {};
                    for (const bi of basicInfos) {
                        const addr = (bi.tokenContractAddress || '').toLowerCase();
                        basicMap[addr] = bi;
                    }

                    for (const item of priceInfos) {
                        const addr = (item.tokenContractAddress || '').toLowerCase();
                        const basic = basicMap[addr] || {};
                        results[addr] = {
                            change24h: parseFloat(item.priceChange24H || 0),
                            marketCap: parseFloat(item.marketCap || 0),
                            liquidity: parseFloat(item.liquidity || 0),
                            volume24h: parseFloat(item.volume24H || 0),
                            holderCount: parseInt(basic.totalHolder || basic.holderCount || basic.holders || 0, 10),
                        };
                    }
                    setInfo(results);
                }
            } catch { /* ignore */ }
        }
        fetchInfo();
        const interval = setInterval(fetchInfo, 60000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return info;
}

/* ── Token Holders Hook (uses /api/v6/dex/market/token/holder) ── */
function useTokenHolders(tokens) {
    const [holders, setHolders] = useState({});

    useEffect(() => {
        let cancelled = false;
        async function fetchHolders() {
            const results = {};
            await Promise.allSettled(
                tokens.map(async (addr) => {
                    try {
                        const json = await api.getTokenHolders(XLAYER_CHAIN, addr);
                        const holderList = json?.data || [];
                        // Use holderCount from response if available, else count the returned list
                        const count = json?.holderCount || json?.totalHolder || json?.total || holderList.length || 0;
                        results[addr.toLowerCase()] = count;
                    } catch { /* ignore */ }
                })
            );
            if (!cancelled) setHolders(results);
        }
        fetchHolders();
        const iv = setInterval(fetchHolders, 120000); // refresh every 2min
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    return holders;
}

/* ── Vote/Like System (localStorage) ── */
function useVotes() {
    const [votes, setVotes] = useState(() => {
        try { return JSON.parse(localStorage.getItem('community_votes') || '{}'); }
        catch { return {}; }
    });
    const [voted, setVoted] = useState(() => {
        try { return JSON.parse(localStorage.getItem('community_voted') || '{}'); }
        catch { return {}; }
    });

    const toggleVote = useCallback((tokenAddr) => {
        const addr = tokenAddr.toLowerCase();
        setVotes(prev => {
            const next = { ...prev };
            const isVoted = voted[addr];
            next[addr] = (next[addr] || 0) + (isVoted ? -1 : 1);
            if (next[addr] < 0) next[addr] = 0;
            localStorage.setItem('community_votes', JSON.stringify(next));
            return next;
        });
        setVoted(prev => {
            const next = { ...prev, [addr]: !prev[addr] };
            localStorage.setItem('community_voted', JSON.stringify(next));
            return next;
        });
    }, [voted]);

    return { votes, voted, toggleVote };
}

/* ── Format Helpers ── */
function fmtPrice(p) {
    if (!p) return '—';
    if (p < 1) {
        const s = p.toFixed(18);
        const match = s.match(/^0\.(0*)/);
        const leadingZeros = match ? match[1].length : 0;
        const truncated = s.slice(0, 2 + leadingZeros + 4);
        return `$${truncated}`;
    }
    const floored = Math.floor(p * 100) / 100;
    return `$${floored.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompact(n) {
    if (!n || n === 0) return '—';
    if (n >= 1e9) return `$${(Math.floor(n / 1e7) / 100).toFixed(2)}B`;
    if (n >= 1e6) return `$${(Math.floor(n / 1e4) / 100).toFixed(2)}M`;
    if (n >= 1e3) return `$${(Math.floor(n / 10) / 100).toFixed(2)}K`;
    return `$${Math.floor(n * 100) / 100}`;
}

function fmtChange(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return null;
    const val = (Math.floor(Math.abs(pct) * 100) / 100).toFixed(2);
    return pct >= 0 ? `+${val}%` : `-${val}%`;
}

/* ── Community Card — Premium Design v2 ── */
function CommunityCard({ community, price, prevPrice, priceLoading, tokenInfo, holderCount, votes, isVoted, onVote, t, navigate }) {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const { name, symbol, token, logo, gradient, bgGradient, borderColor, glowColor, expandedBg, tagline, desc, links, isNew } = community;

    // Price flash animation
    const [priceFlash, setPriceFlash] = useState('');
    const prevPriceRef = useRef(price);
    useEffect(() => {
        if (prevPriceRef.current && price && prevPriceRef.current !== price) {
            setPriceFlash(price > prevPriceRef.current ? 'flash-green' : 'flash-red');
            const tm = setTimeout(() => setPriceFlash(''), 1200);
            return () => clearTimeout(tm);
        }
        prevPriceRef.current = price;
    }, [price]);

    const copyAddress = () => {
        navigator.clipboard.writeText(token);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const change24h = tokenInfo?.change24h;
    const changeStr = fmtChange(change24h);

    const displayHolderCount = holderCount || tokenInfo?.holderCount || 0;

    return (
        <div className={`group relative overflow-hidden rounded-2xl border ${borderColor} bg-surface-800/60 backdrop-blur-sm transition-all duration-500 hover:shadow-2xl ${glowColor} flex flex-col`}>
            {/* Background gradient overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${expanded ? expandedBg : bgGradient} transition-opacity duration-500 ${expanded ? 'opacity-80' : 'opacity-50 group-hover:opacity-80'}`} />

            <div className="relative p-5 flex flex-col flex-1">
                {/* ── Top Row: Logo + Name + Price ── */}
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                        {/* Real token logo — uniform size + NEW badge overlay */}
                        <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} p-0.5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 flex-shrink-0`}>
                            <div className="w-full h-full rounded-[12px] bg-surface-900/80 flex items-center justify-center overflow-hidden">
                                <img src={logo} alt={name} className="w-10 h-10 object-contain" />
                            </div>
                            {isNew && (
                                <span className="absolute -top-1.5 -right-1.5 z-10 px-1.5 py-0.5 rounded-full bg-emerald-500 text-[7px] font-bold text-white uppercase tracking-wider shadow-lg shadow-emerald-500/30">
                                    NEW
                                </span>
                            )}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-surface-100 tracking-tight">
                                {name}
                            </h3>
                            <p className="text-xs text-surface-200/40 mt-0.5 italic">{t(`dashboard.community.${tagline}`)}</p>
                        </div>
                    </div>

                    {/* Price Section with animated ticker */}
                    <div className="text-right flex-shrink-0">
                        {priceLoading ? (
                            <div className="space-y-1.5">
                                <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
                                <div className="h-3 w-16 bg-white/5 rounded animate-pulse ml-auto" />
                            </div>
                        ) : (
                            <>
                                <div className="flex items-baseline gap-1 justify-end">
                                    <span className={`text-xl font-bold text-surface-100 tabular-nums tracking-tight transition-colors duration-500 ${
                                        priceFlash === 'flash-green' ? '!text-emerald-400' : priceFlash === 'flash-red' ? '!text-red-400' : ''
                                    }`}>
                                        {fmtPrice(price)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 justify-end mt-0.5">
                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                        price ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-surface-200/30'
                                    }`}>
                                        ${symbol}
                                    </span>
                                    {changeStr && (
                                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                            change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        }`}>
                                            {change24h >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                            {changeStr}
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                        {/* Vote heart — top-right next to price */}
                        <button
                            onClick={() => onVote(token)}
                            className={`mt-1 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all duration-200 ml-auto ${
                                isVoted
                                    ? 'bg-pink-500/15 border border-pink-500/30 text-pink-400'
                                    : 'bg-white/[0.03] border border-white/[0.06] text-surface-200/30 hover:bg-pink-500/10 hover:text-pink-400'
                            }`}
                        >
                            <Heart size={11} className={isVoted ? 'fill-current' : ''} />
                            {votes > 0 && <span>{votes}</span>}
                        </button>
                    </div>
                </div>

                {/* ── Market Data Pills (always 4 pills for consistency) ── */}
                <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-surface-200/50">
                        <Star size={9} className="text-amber-400" />
                        MCap {tokenInfo?.marketCap ? fmtCompact(tokenInfo.marketCap) : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-surface-200/50">
                        <Zap size={9} className="text-cyan-400" />
                        Liq {tokenInfo?.liquidity ? fmtCompact(tokenInfo.liquidity) : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-surface-200/50">
                        <Users size={9} className="text-purple-400" />
                        {displayHolderCount > 0 ? displayHolderCount.toLocaleString() : '—'} {t('dashboard.community.holders')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-surface-200/50">
                        <TrendingUp size={9} className="text-emerald-400" />
                        Vol {tokenInfo?.volume24h ? fmtCompact(tokenInfo.volume24h) : '—'}
                    </span>
                </div>

                {/* ── Description (fixed height — 2 lines) ── */}
                <p className="text-[13px] text-surface-200/45 leading-relaxed mb-4 line-clamp-2 flex-1">
                    {t(`dashboard.community.${desc}`)}
                </p>

                {/* ── Contract Address ── */}
                <div className="flex items-center gap-2 mb-4 group/ca">
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

                {/* ── Expanded Details ── */}
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${expanded ? 'max-h-[500px] opacity-100 mb-4' : 'max-h-0 opacity-0'}`}>
                    <div className="pt-3 border-t border-white/[0.06] space-y-3">
                        {/* Social Feed Preview */}
                        {links.twitter && (
                            <a
                                href={links.twitter}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/[0.04] hover:border-white/[0.08] transition-all group/feed"
                            >
                                <div className="w-8 h-8 rounded-full bg-slate-200/10 flex items-center justify-center">
                                    <XTwitterIcon size={14} />
                                </div>
                                <div className="flex-1">
                                    <span className="text-xs font-semibold text-surface-100">@{links.twitter.split('/').pop()}</span>
                                    <p className="text-[10px] text-surface-200/40 mt-0.5">{t('dashboard.community.latestPosts')}</p>
                                </div>
                                <ArrowUpRight size={12} className="text-surface-200/30 group-hover/feed:text-surface-200/60 transition-colors" />
                            </a>
                        )}

                        {/* Quick Actions */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => navigate(`/trading?to=${token}`)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r ${gradient} text-white text-xs font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all duration-200`}
                            >
                                <ShoppingCart size={13} />
                                {t('dashboard.community.buyToken')} {symbol}
                            </button>
                            <a
                                href={OKX_TOKEN_URL(token)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-surface-200/60 hover:text-surface-100 hover:bg-white/[0.08] transition-all text-xs font-medium"
                            >
                                OKX
                                <ArrowUpRight size={11} />
                            </a>
                        </div>
                    </div>
                </div>

                {/* ── Bottom Row: Social + Actions ── */}
                <div className="flex items-center justify-between min-h-[44px] mt-auto">
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

                    {/* Right side: Expand + OKX (icon-only) */}
                    <div className="flex items-center gap-1.5">
                        {/* Expand toggle — icon only */}
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] text-surface-200/40 hover:bg-white/[0.06] hover:text-surface-200/70 transition-all flex items-center justify-center"
                            title={expanded ? t('dashboard.community.collapse') : t('dashboard.community.details')}
                        >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {/* OKX Web3 link — icon only */}
                        {!expanded && (
                            <a
                                href={OKX_TOKEN_URL(token)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] text-surface-200/40 hover:text-surface-200/70 transition-all flex items-center justify-center"
                                title="OKX Web3"
                            >
                                <ArrowUpRight size={14} />
                            </a>
                        )}
                    </div>
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
    const navigate = useNavigate();
    const tokenAddresses = useMemo(() => COMMUNITIES.map(c => c.token), []);
    const { prices, loading: priceLoading } = useTokenPrices(tokenAddresses);
    const tokenInfo = useTokenInfo(tokenAddresses);
    const holderCounts = useTokenHolders(tokenAddresses);
    const { votes, voted, toggleVote } = useVotes();
    const [activeFilter, setActiveFilter] = useState('all');

    const filteredCommunities = useMemo(() => {
        if (activeFilter === 'all') return COMMUNITIES;
        if (activeFilter === 'gamefi') return COMMUNITIES.filter(c => c.links.gamefi);
        if (activeFilter === 'defi') return COMMUNITIES.filter(c => c.links.defi);
        return COMMUNITIES;
    }, [activeFilter]);

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
                                X Layer <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">{t('dashboard.community.communities')}</span>
                            </h1>
                            <p className="text-sm text-surface-200/40 mt-1 max-w-lg">
                                {t('dashboard.community.subtitle')}
                            </p>
                        </div>
                    </div>

                    {/* Filter tabs */}
                    <div className="flex items-center gap-2 mt-7 flex-wrap">
                        {[
                            { id: 'all', icon: Users, label: `${COMMUNITIES.length} ${t('dashboard.community.filterAll')}`, color: 'text-brand-400' },
                            { id: 'gamefi', icon: Gamepad2, label: `${COMMUNITIES.filter(c => c.links.gamefi).length} GameFi`, color: 'text-purple-400' },
                            { id: 'defi', icon: Landmark, label: `${COMMUNITIES.filter(c => c.links.defi).length} DeFi`, color: 'text-emerald-400' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveFilter(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-sm transition-all duration-200 text-xs cursor-pointer ${
                                    activeFilter === tab.id
                                        ? 'bg-white/[0.08] border-white/[0.15] text-surface-100 shadow-lg'
                                        : 'bg-white/[0.03] border-white/[0.06] text-surface-200/50 hover:bg-white/[0.06] hover:border-white/[0.10]'
                                }`}
                            >
                                <tab.icon size={14} className={activeFilter === tab.id ? tab.color : 'text-surface-200/30'} />
                                <span className={activeFilter === tab.id ? 'font-bold' : 'font-medium'}>{tab.label}</span>
                            </button>
                        ))}
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm">
                            <Sparkles size={14} className="text-amber-400" />
                            <span className="text-xs text-surface-200/50">
                                <span className="text-surface-100 font-bold">X Layer</span> {t('dashboard.community.chain')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ Community Cards — 3 Column Grid ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
                {filteredCommunities.map((community) => (
                    <CommunityCard
                        key={community.token}
                        community={community}
                        price={prices[community.token.toLowerCase()]}
                        priceLoading={priceLoading}
                        tokenInfo={tokenInfo[community.token.toLowerCase()]}
                        holderCount={holderCounts[community.token.toLowerCase()] || 0}
                        votes={votes[community.token.toLowerCase()] || 0}
                        isVoted={!!voted[community.token.toLowerCase()]}
                        onVote={toggleVote}
                        t={t}
                        navigate={navigate}
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
                            {t('dashboard.community.listTitle')}
                            <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 text-[10px] font-semibold uppercase tracking-wider">{t('dashboard.community.listFree')}</span>
                        </h3>
                        <p className="text-sm text-surface-200/40 leading-relaxed max-w-xl">
                            {t('dashboard.community.listDesc')}
                        </p>
                    </div>

                    <a
                        href="https://x.com/haivcon"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-xl shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.03] active:scale-95 transition-all duration-300 whitespace-nowrap"
                    >
                        <XTwitterIcon size={16} />
                        {t('dashboard.community.contact')}
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </a>
                </div>
            </div>

            {/* ═══════ Footer ═══════ */}
            <div className="text-center space-y-2 pb-6">
                <p className="text-[10px] text-surface-200/15">
                    {t('dashboard.community.footer')}
                </p>
            </div>
        </div>
    );
}
