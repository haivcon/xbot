import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ExternalLink, Globe, Gamepad2, Landmark, Users, UserPlus,
    TrendingUp, TrendingDown, Copy, Check, ChevronRight, ChevronDown, ChevronUp,
    Sparkles, ArrowUpRight, Heart, ShoppingCart, Star, Zap,
    MessageCircle, Send, Plus, Trash2, Bell, User, Loader2, X as XIcon,
    Trophy, CalendarCheck, ImageIcon, Hash, ArrowLeft, Home,
    AlertTriangle, Search, Ban, MoreVertical, Pencil, Shield
} from 'lucide-react';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import useAuthStore from '@/stores/authStore';

/* ═══════════════════════════════════════════════════
   X Layer Community Ecosystem — Premium Design v2
   ═══════════════════════════════════════════════════ */

const XLAYER_CHAIN = '196';
const OKX_TOKEN_URL = (addr) => `https://web3.okx.com/token/x-layer/${addr}`;

const COMMUNITIES = [
    {
        name: 'banmao 🐱🍌',
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
        name: 'NIUMA 🐂🐴',
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
        name: 'Xwizard 🧙',
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
                            holderCount: parseInt(item.holders || basic.totalHolder || basic.holderCount || basic.holders || item.totalHolder || 0, 10),
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

/* ── Token Holders Hook (uses /api/v6/dex/market/token/holder + basicInfo totalHolder) ── */
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
                        // Backend now returns { data: holderList, totalHolder: number }
                        const count = json?.totalHolder || json?.holderCount || 0;
                        results[addr.toLowerCase()] = count;
                    } catch { /* ignore */ }
                })
            );
            if (!cancelled) setHolders(results);
        }
        fetchHolders();
        const iv = setInterval(fetchHolders, 120000);
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
    const [lightbox, setLightbox] = useState(false);
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
                        {/* Real token logo — uniform size + NEW badge overlay + clickable */}
                        <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} p-0.5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 flex-shrink-0 cursor-pointer`}
                             onClick={() => setLightbox(true)}>
                            <div className="w-full h-full rounded-[12px] bg-surface-900/80 flex items-center justify-center overflow-hidden">
                                <img src={logo} alt={name} className="w-10 h-10 object-contain" />
                            </div>
                            {isNew && (
                                <span className="absolute -top-1.5 -right-1.5 z-10 px-1.5 py-0.5 rounded-full bg-emerald-500 text-[7px] font-bold text-white uppercase tracking-wider shadow-lg shadow-emerald-500/30">
                                    NEW
                                </span>
                            )}
                        </div>

                        {/* Logo Lightbox */}
                        {lightbox && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(false)}>
                                <div className="relative max-w-[320px] max-h-[320px] animate-scaleIn" onClick={e => e.stopPropagation()}>
                                    <img src={logo} alt={name} className="w-full h-full object-contain rounded-3xl shadow-2xl" />
                                    <p className="text-center mt-3 text-sm font-bold text-white">{name}</p>
                                    <button onClick={() => setLightbox(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-surface-800 border border-white/10 text-white flex items-center justify-center hover:bg-red-500/30 transition-colors text-sm">&times;</button>
                                </div>
                            </div>
                        )}
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
                        <code className="text-[11px] text-surface-200/40 font-mono flex-1 break-all group-hover/ca:text-surface-200/60 transition-colors">
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

/* ═══════════════════════════════════════════════════════
   Social Feed Components
   ═══════════════════════════════════════════════════════ */

function timeSince(ts) {
    const s = Math.floor(Date.now() / 1000 - ts);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

/* ── User Profile Modal ── */
function UserProfileModal({ userId, onClose, onStartDM }) {
    const { t } = useTranslation();
    const [profile, setProfile] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getUserProfile(userId).then(r => {
            setProfile(r.profile);
            setIsFollowing(r.isFollowing);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [userId]);

    const handleFollow = async () => {
        try {
            const r = await api.toggleFollow(userId);
            setIsFollowing(r.following);
            setProfile(p => p ? { ...p, followersCount: r.following ? (p.followersCount || 0) + 1 : Math.max(0, (p.followersCount || 0) - 1) } : p);
        } catch { /* ignore */ }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md mx-4 rounded-3xl bg-surface-800 border border-white/[0.08] shadow-2xl animate-scaleIn overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header gradient */}
                <div className="h-24 bg-gradient-to-br from-brand-500/30 via-purple-500/20 to-cyan-500/10 relative">
                    <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"><XIcon size={16} /></button>
                </div>
                <div className="px-6 pb-6 -mt-10 relative">
                    {loading ? (
                        <div className="space-y-4 pt-14">
                            <div className="h-5 w-32 bg-white/[0.05] rounded-lg animate-pulse" />
                            <div className="h-3 w-full bg-white/[0.03] rounded animate-pulse" />
                        </div>
                    ) : profile ? (
                        <>
                            {/* Avatar */}
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/50 to-purple-500/50 flex items-center justify-center text-xl text-white font-bold border-4 border-surface-800 shadow-xl">
                                {(profile.displayName || 'U')[0].toUpperCase()}
                            </div>
                            <div className="mt-3">
                                <h3 className="text-lg font-bold text-surface-100">{profile.displayName || `User ${String(userId).slice(-4)}`}</h3>
                                {profile.bio && <p className="text-xs text-surface-200/50 mt-1 leading-relaxed">{profile.bio}</p>}
                            </div>
                            {/* Stats */}
                            <div className="flex items-center gap-6 mt-4">
                                <div className="text-center"><span className="text-lg font-bold text-surface-100">{profile.followersCount || 0}</span><p className="text-[9px] text-surface-200/30 uppercase tracking-wider">{t('dashboard.mySpace.followers', 'Followers')}</p></div>
                                <div className="text-center"><span className="text-lg font-bold text-surface-100">{profile.followingCount || 0}</span><p className="text-[9px] text-surface-200/30 uppercase tracking-wider">{t('dashboard.mySpace.following', 'Following')}</p></div>
                                <div className="text-center"><span className="text-lg font-bold text-amber-400">{profile.reputation || 0}</span><p className="text-[9px] text-surface-200/30 uppercase tracking-wider">{t('dashboard.mySpace.rep', 'Rep')}</p></div>
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-5">
                                <button onClick={handleFollow} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold transition-all ${isFollowing ? 'bg-white/[0.06] border border-white/[0.1] text-surface-200/60 hover:text-red-400 hover:border-red-500/30' : 'bg-gradient-to-r from-brand-500 to-purple-500 text-white shadow-lg hover:shadow-brand-500/30'}`}>
                                    <UserPlus size={14} /> {isFollowing ? t('dashboard.mySpace.unfollow', 'Unfollow') : t('dashboard.mySpace.follow', 'Follow')}
                                </button>
                                <button onClick={() => { onStartDM?.(userId, profile.displayName); onClose(); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold bg-white/[0.06] border border-white/[0.1] text-surface-200/60 hover:text-brand-400 hover:border-brand-500/30 transition-all">
                                    <Send size={14} /> {t('dashboard.mySpace.message', 'Message')}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-surface-200/30 text-center py-8 pt-14">{t('dashboard.mySpace.profileNotFound', 'Profile not found')}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Tip Modal (Redesigned) ── */
function TipModal({ postId, toUserId, toName, onClose, onTipped }) {
    const { t } = useTranslation();
    const [amount, setAmount] = useState('');
    const [tipping, setTipping] = useState(false);
    const [done, setDone] = useState(false);

    // Wallet & token state
    const [wallets, setWallets] = useState([]);
    const [selectedWalletId, setSelectedWalletId] = useState('');
    const [tokens, setTokens] = useState([]);
    const [selectedToken, setSelectedToken] = useState(null); // { symbol, contractAddress, balance }
    const [walletLoading, setWalletLoading] = useState(true);
    const [tokenLoading, setTokenLoading] = useState(false);
    const [recipientProfile, setRecipientProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);

    const quickAmounts = ['0.01', '0.05', '0.1', '0.5', '1'];

    // Fetch user wallets
    useEffect(() => {
        api.getWallets().then(r => {
            const ws = r.wallets || [];
            setWallets(ws);
            const def = ws.find(w => w.isDefault) || ws[0];
            if (def) setSelectedWalletId(def.id);
        }).catch(() => {}).finally(() => setWalletLoading(false));
    }, []);

    // Fetch recipient profile (for wallet address)
    useEffect(() => {
        api.getUserProfile(toUserId).then(r => setRecipientProfile(r.profile)).catch(() => {}).finally(() => setProfileLoading(false));
    }, [toUserId]);

    // Fetch token balances when wallet changes
    useEffect(() => {
        if (!selectedWalletId) { setTokens([]); return; }
        setTokenLoading(true);
        api.getWalletBalance(selectedWalletId).then(r => {
            const tks = (r.tokens || []).filter(t => Number(t.balance) > 0).map(t => ({
                symbol: t.symbol || t.tokenSymbol || 'Unknown',
                contractAddress: t.tokenContractAddress || '',
                balance: t.balance,
                price: t.price || 0,
                logoUrl: t.logoUrl || '',
            }));
            setTokens(tks);
            // Auto-select native or first token
            const native = tks.find(t => !t.contractAddress || t.contractAddress === '0x' || t.symbol === 'OKB');
            setSelectedToken(native || tks[0] || null);
        }).catch(() => setTokens([])).finally(() => setTokenLoading(false));
    }, [selectedWalletId]);

    const handleTip = async () => {
        if (!amount || Number(amount) <= 0 || !selectedToken) return;
        setTipping(true);
        try {
            await api.recordTip({
                postId: postId || null,
                toUserId,
                tokenSymbol: selectedToken.symbol,
                tokenContractAddress: selectedToken.contractAddress,
                amount,
                chainIndex: '196',
                walletId: selectedWalletId,
            });
            setDone(true);
            onTipped?.();
            setTimeout(() => onClose(), 1500);
        } catch { /* ignore */ }
        setTipping(false);
    };

    const adjustAmount = (delta) => {
        const cur = Number(amount) || 0;
        const step = cur < 0.1 ? 0.01 : cur < 1 ? 0.05 : 0.1;
        const next = Math.max(0, cur + delta * step);
        setAmount(next.toFixed(next < 0.1 ? 4 : next < 1 ? 3 : 2));
    };

    const selectedWallet = wallets.find(w => w.id === selectedWalletId);
    const recipientAddr = recipientProfile?.walletAddress;
    const OKX_ADDR_URL = (addr) => `https://www.okx.com/web3/explorer/xlayer/address/${addr}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md mx-4 rounded-3xl bg-surface-800 border border-white/[0.08] shadow-2xl animate-scaleIn" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                    <h3 className="text-lg font-bold text-surface-100 flex items-center gap-2"><Zap size={18} className="text-amber-400" /> {t('dashboard.mySpace.tipUser', 'Tip')} {toName}</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-surface-200/50 hover:text-surface-100 transition-colors"><XIcon size={16} /></button>
                </div>
                <div className="p-5 space-y-4">
                    {done ? (
                        <div className="text-center py-6">
                            <div className="text-4xl mb-2">🎉</div>
                            <p className="text-sm font-bold text-emerald-400">{t('dashboard.mySpace.tipSent', 'Tip sent!')}</p>
                        </div>
                    ) : (
                        <>
                            {/* Recipient wallet address */}
                            <div className="rounded-xl bg-surface-900/50 border border-white/[0.04] p-3">
                                <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1">{t('dashboard.mySpace.tipRecipient', 'Recipient')}</p>
                                {profileLoading ? (
                                    <div className="h-4 w-40 bg-white/[0.05] rounded animate-pulse" />
                                ) : recipientAddr ? (
                                    <a href={OKX_ADDR_URL(recipientAddr)} target="_blank" rel="noopener noreferrer"
                                        className="text-xs font-mono text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1.5 break-all">
                                        {recipientAddr.slice(0, 10)}…{recipientAddr.slice(-8)}
                                        <ExternalLink size={10} className="flex-shrink-0" />
                                    </a>
                                ) : (
                                    <p className="text-xs text-amber-400/70 flex items-center gap-1.5">
                                        <AlertTriangle size={12} className="flex-shrink-0" />
                                        {t('dashboard.mySpace.tipNoWallet', 'This user has not linked a wallet address')}
                                    </p>
                                )}
                            </div>

                            {/* Wallet selector */}
                            <div>
                                <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1 block">{t('dashboard.mySpace.tipFromWallet', 'From Wallet')}</label>
                                {walletLoading ? (
                                    <div className="h-10 bg-white/[0.03] rounded-xl animate-pulse" />
                                ) : wallets.length === 0 ? (
                                    <p className="text-xs text-red-400/70 flex items-center gap-1.5">
                                        <AlertTriangle size={12} />
                                        {t('dashboard.mySpace.tipNoWallets', 'No wallets found. Create one in Wallets page.')}
                                    </p>
                                ) : (
                                    <CustomSelect
                                        value={selectedWalletId}
                                        onChange={(val) => setSelectedWalletId(val)}
                                        options={wallets.map(w => ({
                                            value: w.id,
                                            label: `${w.walletName || t('dashboard.mySpace.wallet', 'Wallet')} (${w.address?.slice(0, 6)}…${w.address?.slice(-4)})`,
                                            sublabel: w.isDefault ? '★ Default' : '',
                                        }))}
                                        placeholder={t('dashboard.mySpace.tipSelectWallet', 'Select wallet')}
                                    />
                                )}
                            </div>

                            {/* Token selector */}
                            {selectedWalletId && (
                                <div>
                                    <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1 block">{t('dashboard.mySpace.tipToken', 'Token')}</label>
                                    {tokenLoading ? (
                                        <div className="h-10 bg-white/[0.03] rounded-xl animate-pulse" />
                                    ) : tokens.length === 0 ? (
                                        <p className="text-xs text-surface-200/25">{t('dashboard.mySpace.tipNoTokens', 'No tokens with balance in this wallet')}</p>
                                    ) : (
                                        <CustomSelect
                                            value={selectedToken?.symbol || ''}
                                            onChange={(val) => setSelectedToken(tokens.find(tk => tk.symbol === val) || null)}
                                            options={tokens.map(tk => ({
                                                value: tk.symbol,
                                                label: tk.symbol,
                                                sublabel: `${Number(tk.balance).toFixed(4)}`,
                                            }))}
                                            placeholder={t('dashboard.mySpace.tipSelectToken', 'Select token')}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Amount input */}
                            <div>
                                <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1 block">{t('dashboard.mySpace.tipAmount', 'Amount')}</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-surface-900/60 border border-white/[0.08] rounded-2xl px-4 py-3.5 text-xl text-surface-100 outline-none text-center font-bold placeholder:text-surface-200/15 focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/10 transition-all"
                                        autoFocus
                                    />
                                    {selectedToken && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-400/50 uppercase">{selectedToken.symbol}</span>}
                                </div>
                                {/* Range slider for quick amount */}
                                <input
                                    type="range"
                                    min="0"
                                    max={selectedToken ? Math.min(Number(selectedToken.balance), 10) : 1}
                                    step="0.01"
                                    value={amount || 0}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full mt-2 h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500 bg-white/[0.06] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-amber-400 [&::-webkit-slider-thumb]:to-orange-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-amber-500/30 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
                                />
                                {selectedToken && (
                                    <p className="text-[9px] text-surface-200/20 mt-1 text-right">
                                        {t('dashboard.mySpace.tipBalance', 'Balance')}: {Number(selectedToken.balance).toFixed(4)} {selectedToken.symbol}
                                    </p>
                                )}
                            </div>

                            {/* Quick amounts */}
                            <div className="flex items-center gap-2">
                                {quickAmounts.map(q => (
                                    <button key={q} onClick={() => setAmount(q)} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${amount === q ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-white/[0.03] border-white/[0.06] text-surface-200/35 hover:bg-white/[0.06]'}`}>
                                        {q}
                                    </button>
                                ))}
                            </div>

                            {/* Send button */}
                            <button
                                onClick={handleTip}
                                disabled={!amount || Number(amount) <= 0 || tipping || !selectedToken || wallets.length === 0}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-lg hover:shadow-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                {tipping ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                {t('dashboard.mySpace.sendTip', 'Send Tip')} {selectedToken ? selectedToken.symbol : ''}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── DM View (Messages Tab — Enhanced) ── */
const DM_NICKNAMES_KEY = 'xbot_dm_nicknames';
const DM_BLOCKED_KEY = 'xbot_dm_blocked';

function getDmNicknames() { try { return JSON.parse(localStorage.getItem(DM_NICKNAMES_KEY) || '{}'); } catch { return {}; } }
function setDmNickname(userId, nick) {
    const all = getDmNicknames();
    if (nick) all[String(userId)] = nick; else delete all[String(userId)];
    localStorage.setItem(DM_NICKNAMES_KEY, JSON.stringify(all));
}
function getDmBlocked() { try { return JSON.parse(localStorage.getItem(DM_BLOCKED_KEY) || '[]'); } catch { return []; } }
function toggleDmBlocked(userId) {
    const all = getDmBlocked();
    const id = String(userId);
    const idx = all.indexOf(id);
    if (idx >= 0) all.splice(idx, 1); else all.push(id);
    localStorage.setItem(DM_BLOCKED_KEY, JSON.stringify(all));
    return all;
}

function DMView({ initialChat, onClearInitialChat }) {
    const { t } = useTranslation();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeChat, setActiveChat] = useState(null); // { userId, displayName }
    const [messages, setMessages] = useState([]);
    const [msgLoading, setMsgLoading] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const [dmProfileModal, setDmProfileModal] = useState(null); // userId for View Profile

    // Enhanced features
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTab, setFilterTab] = useState('all'); // 'all' | 'pending' | 'blocked'
    const [nicknames, setNicknames] = useState(getDmNicknames());
    const [blockedIds, setBlockedIds] = useState(getDmBlocked());
    const [showActions, setShowActions] = useState(false);
    const [editingNickname, setEditingNickname] = useState(false);
    const [nickInput, setNickInput] = useState('');
    const actionsRef = useRef(null);

    // Load conversations
    useEffect(() => {
        api.getConversations().then(r => setConversations(r.conversations || [])).catch(() => {}).finally(() => setLoading(false));
    }, []);

    // Handle initialChat from parent (e.g. clicking "Message" on profile)
    useEffect(() => {
        if (initialChat && initialChat.userId) {
            setActiveChat(initialChat);
            onClearInitialChat?.();
        }
    }, [initialChat]);

    // Load messages for active chat
    useEffect(() => {
        if (!activeChat) return;
        setMsgLoading(true);
        api.getMessages(activeChat.userId).then(r => setMessages(r.messages || [])).catch(() => {}).finally(() => setMsgLoading(false));
    }, [activeChat?.userId]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMsg = async () => {
        if (!text.trim() || !activeChat) return;
        setSending(true);
        try {
            await api.sendMessage(activeChat.userId, { content: text.trim() });
            setText('');
            const r = await api.getMessages(activeChat.userId);
            setMessages(r.messages || []);
            api.getConversations().then(r2 => setConversations(r2.conversations || [])).catch(() => {});
        } catch { /* ignore */ }
        setSending(false);
    };

    // Poll for new messages in active chat
    useEffect(() => {
        if (!activeChat) return;
        const iv = setInterval(() => {
            api.getMessages(activeChat.userId).then(r => setMessages(r.messages || [])).catch(() => {});
        }, 8000);
        return () => clearInterval(iv);
    }, [activeChat?.userId]);

    // Close actions menu on outside click
    useEffect(() => {
        const handler = (e) => { if (actionsRef.current && !actionsRef.current.contains(e.target)) setShowActions(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Nickname helpers
    const getDisplayName = (conv) => {
        const nick = nicknames[String(conv.partnerId)];
        return nick || conv.displayName || `User ${String(conv.partnerId).slice(-4)}`;
    };
    const getActiveName = () => {
        if (!activeChat) return '';
        const nick = nicknames[String(activeChat.userId)];
        return nick || activeChat.displayName || '';
    };
    const handleSaveNickname = () => {
        if (!activeChat) return;
        setDmNickname(activeChat.userId, nickInput.trim());
        setNicknames(getDmNicknames());
        setEditingNickname(false);
    };

    // Block helpers
    const handleToggleBlock = (userId) => {
        const newBlocked = toggleDmBlocked(userId);
        setBlockedIds([...newBlocked]);
        if (activeChat && String(activeChat.userId) === String(userId)) setActiveChat(null);
        setShowActions(false);
    };

    // Filter conversations
    const filteredConvos = useMemo(() => {
        let list = [...conversations];
        const blockedSet = new Set(blockedIds);

        if (filterTab === 'blocked') {
            list = list.filter(c => blockedSet.has(String(c.partnerId)));
        } else if (filterTab === 'pending') {
            list = list.filter(c => !blockedSet.has(String(c.partnerId)) && !c.lastMessageIsOwn && c.unreadCount > 0);
        } else {
            list = list.filter(c => !blockedSet.has(String(c.partnerId)));
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => {
                const name = getDisplayName(c).toLowerCase();
                const id = String(c.partnerId);
                return name.includes(q) || id.includes(q);
            });
        }

        return list;
    }, [conversations, filterTab, searchQuery, blockedIds, nicknames]);

    const isBlocked = activeChat ? blockedIds.includes(String(activeChat.userId)) : false;

    return (
        <div className="space-y-5 animate-fadeIn">
            <h2 className="text-2xl font-bold text-surface-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                    <Send size={20} className="text-brand-400" />
                </div>
                {t('dashboard.mySpace.navMessages')}
            </h2>

            <div className="flex gap-4 min-h-[500px]">
                {/* Conversations sidebar */}
                <div className="w-72 flex-shrink-0 rounded-2xl border border-white/[0.06] bg-surface-800/60 overflow-hidden flex flex-col">
                    {/* Search bar */}
                    <div className="p-3 border-b border-white/[0.04] space-y-2">
                        <div className="relative">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/20" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t('dashboard.mySpace.dmSearch', 'Search by name, UID...')}
                                className="w-full bg-surface-900/50 border border-white/[0.04] rounded-xl pl-8 pr-3 py-2 text-[11px] text-surface-100 outline-none placeholder:text-surface-200/15 focus:border-brand-500/20 transition-colors"
                            />
                        </div>
                        {/* Filter tabs */}
                        <div className="flex items-center gap-1">
                            {[
                                { id: 'all', label: t('dashboard.mySpace.dmAll', 'All') },
                                { id: 'pending', label: t('dashboard.mySpace.dmPending', 'Pending') },
                                { id: 'blocked', label: t('dashboard.mySpace.dmBlocked', 'Blocked') },
                            ].map(f => (
                                <button key={f.id} onClick={() => setFilterTab(f.id)}
                                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${filterTab === f.id ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' : 'text-surface-200/25 hover:text-surface-200/50'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="space-y-2 p-3">
                                {[1,2,3].map(i => <div key={i} className="h-14 bg-white/[0.03] rounded-xl animate-pulse" />)}
                            </div>
                        ) : filteredConvos.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-[11px] text-surface-200/20">
                                    {filterTab === 'pending' ? t('dashboard.mySpace.dmNoPending', 'No pending messages') :
                                     filterTab === 'blocked' ? t('dashboard.mySpace.dmNoBlocked', 'No blocked users') :
                                     searchQuery ? t('dashboard.mySpace.dmNoResults', 'No results') :
                                     t('dashboard.mySpace.noMessagesYet')}
                                </p>
                                {filterTab === 'all' && !searchQuery && (
                                    <p className="text-[9px] text-surface-200/15 mt-1">{t('dashboard.mySpace.startConversation')}</p>
                                )}
                            </div>
                        ) : filteredConvos.map(c => {
                            const displayName = getDisplayName(c);
                            const isBlockedConvo = blockedIds.includes(String(c.partnerId));
                            return (
                                <button
                                    key={c.partnerId}
                                    onClick={() => setActiveChat({ userId: c.partnerId, displayName: c.displayName })}
                                    className={`w-full flex items-center gap-3 p-3 transition-all text-left hover:bg-white/[0.04] ${activeChat?.userId === c.partnerId ? 'bg-brand-500/10 border-l-2 border-brand-500' : ''} ${isBlockedConvo ? 'opacity-50' : ''}`}
                                >
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500/40 to-purple-500/40 flex items-center justify-center text-xs text-surface-100 font-bold flex-shrink-0">
                                        {(displayName || 'U')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-surface-100 truncate">{displayName}</span>
                                            {nicknames[String(c.partnerId)] && <span className="text-[8px] text-surface-200/20 truncate">({c.displayName})</span>}
                                            {isBlockedConvo && <Ban size={10} className="text-red-400/50 flex-shrink-0" />}
                                            {c.unreadCount > 0 && !isBlockedConvo && <span className="w-4 h-4 rounded-full bg-brand-500 text-[7px] text-white font-bold flex items-center justify-center flex-shrink-0">{c.unreadCount}</span>}
                                        </div>
                                        <p className="text-[10px] text-surface-200/30 truncate mt-0.5">
                                            {c.lastMessageIsOwn ? `${t('dashboard.mySpace.you')}: ` : ''}{c.lastMessage}
                                        </p>
                                    </div>
                                    <span className="text-[8px] text-surface-200/15 flex-shrink-0">{timeSince(c.lastMessageAt)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Chat area */}
                <div className="flex-1 rounded-2xl border border-white/[0.06] bg-surface-800/60 overflow-hidden flex flex-col">
                    {!activeChat ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-4xl mb-3">💬</div>
                                <p className="text-sm text-surface-200/25">{t('dashboard.mySpace.selectConversation')}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Chat header with actions menu */}
                            <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
                                <button onClick={() => setActiveChat(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-surface-200/40 hover:text-surface-100 transition-colors" title={t('dashboard.mySpace.back')}>
                                    <ArrowLeft size={16} />
                                </button>
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500/40 to-purple-500/40 flex items-center justify-center text-xs text-surface-100 font-bold">
                                    {(getActiveName() || 'U')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-semibold text-surface-100 truncate block">{getActiveName()}</span>
                                    {nicknames[String(activeChat.userId)] && (
                                        <span className="text-[9px] text-surface-200/25 block">{activeChat.displayName}</span>
                                    )}
                                </div>
                                {isBlocked && <span className="text-[9px] text-red-400/60 flex items-center gap-1"><Ban size={10} /> {t('dashboard.mySpace.dmBlockedLabel', 'Blocked')}</span>}

                                {/* Actions menu */}
                                <div className="relative" ref={actionsRef}>
                                    <button onClick={() => setShowActions(!showActions)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-surface-200/30 hover:text-surface-100 transition-colors">
                                        <MoreVertical size={16} />
                                    </button>
                                    {showActions && (
                                        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-surface-900 border border-white/[0.08] shadow-2xl z-10 py-1 animate-fadeIn">
                                            <button onClick={() => { setDmProfileModal(activeChat.userId); setShowActions(false); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200/60 hover:text-surface-100 hover:bg-white/[0.04] transition-colors">
                                                <User size={12} /> {t('dashboard.mySpace.dmViewProfile', 'View Profile')}
                                            </button>
                                            <button onClick={() => { setNickInput(nicknames[String(activeChat.userId)] || ''); setEditingNickname(true); setShowActions(false); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200/60 hover:text-surface-100 hover:bg-white/[0.04] transition-colors">
                                                <Pencil size={12} /> {t('dashboard.mySpace.dmSetNickname', 'Set Nickname')}
                                            </button>
                                            <button onClick={() => handleToggleBlock(activeChat.userId)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isBlocked ? 'text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/5' : 'text-red-400/70 hover:text-red-400 hover:bg-red-500/5'}`}>
                                                {isBlocked ? <Shield size={12} /> : <Ban size={12} />}
                                                {isBlocked ? t('dashboard.mySpace.dmUnblock', 'Unblock') : t('dashboard.mySpace.dmBlock', 'Block User')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Nickname editing bar */}
                            {editingNickname && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-brand-500/5 border-b border-brand-500/10">
                                    <Pencil size={12} className="text-brand-400 flex-shrink-0" />
                                    <input
                                        value={nickInput}
                                        onChange={e => setNickInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveNickname(); if (e.key === 'Escape') setEditingNickname(false); }}
                                        placeholder={t('dashboard.mySpace.dmNickPlaceholder', 'Enter nickname...')}
                                        className="flex-1 bg-transparent text-xs text-surface-100 outline-none placeholder:text-surface-200/20"
                                        autoFocus
                                        maxLength={30}
                                    />
                                    <button onClick={handleSaveNickname} className="text-[10px] text-brand-400 font-bold hover:text-brand-300">{t('dashboard.common.save', 'Save')}</button>
                                    <button onClick={() => setEditingNickname(false)} className="text-[10px] text-surface-200/30 hover:text-surface-100"><XIcon size={12} /></button>
                                </div>
                            )}

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {msgLoading ? (
                                    <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-surface-200/20" /></div>
                                ) : messages.length === 0 ? (
                                    <p className="text-center text-[11px] text-surface-200/20 py-8">{t('dashboard.mySpace.sayHello')} 👋</p>
                                ) : messages.map((m, i) => {
                                    const isOwn = String(m.fromUserId) !== String(activeChat.userId);
                                    return (
                                        <div key={m.id || i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${isOwn
                                                ? 'bg-gradient-to-r from-brand-500/25 to-purple-500/20 text-surface-100 rounded-br-sm'
                                                : 'bg-white/[0.06] text-surface-200/70 rounded-bl-sm'
                                            }`}>
                                                <p className="break-words whitespace-pre-wrap">{m.content}</p>
                                                <p className={`text-[8px] mt-1 ${isOwn ? 'text-brand-400/40' : 'text-surface-200/15'}`}>{timeSince(m.createdAt)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Composer (disabled if blocked) */}
                            <div className="p-3 border-t border-white/[0.06]">
                                {isBlocked ? (
                                    <div className="flex items-center justify-center gap-2 py-2 text-xs text-surface-200/20">
                                        <Ban size={12} />
                                        {t('dashboard.mySpace.dmBlockedComposer', 'You blocked this user. Unblock to send messages.')}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={text}
                                            onChange={e => setText(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                                            placeholder={t('dashboard.mySpace.typeMessage')}
                                            className="flex-1 bg-surface-900/50 border border-white/[0.06] rounded-2xl px-4 py-2.5 text-sm text-surface-100 outline-none placeholder:text-surface-200/15 focus:border-brand-500/20 transition-colors"
                                        />
                                        <button onClick={sendMsg} disabled={!text.trim() || sending} className="p-2.5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-500 text-white hover:shadow-brand-500/30 disabled:opacity-20 transition-all">
                                            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            {dmProfileModal && (
                <UserProfileModal userId={dmProfileModal} onClose={() => setDmProfileModal(null)} onStartDM={(uid, name) => { setActiveChat({ userId: uid, displayName: name }); setDmProfileModal(null); }} />
            )}
        </div>
    );
}
/* ── Social Leaderboard View ── */
function SocialLeaderboardView() {
    const { t } = useTranslation();
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getLeaderboard().then(r => setLeaders(r.leaderboard || [])).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const podiumOrder = leaders.length >= 3 ? [leaders[1], leaders[0], leaders[2]] : [];
    const podiumLabels = ['🥈', '🥇', '🥉'];
    const podiumSizes = ['h-28', 'h-36', 'h-24'];
    const podiumBg = [
        'from-slate-400/20 to-slate-300/20 border-slate-400/30',
        'from-amber-500/25 to-yellow-500/20 border-amber-500/40 ring-2 ring-amber-500/20',
        'from-amber-700/15 to-orange-600/15 border-amber-600/25',
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-surface-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center">
                    <Star size={20} className="text-amber-400" />
                </div>
                {t('dashboard.mySpace.topCreators')}
            </h2>

            {loading ? (
                <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-surface-200/20" /></div>
            ) : leaders.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-white/[0.06] bg-surface-800/40">
                    <Star size={40} className="mx-auto mb-3 text-surface-200/15" />
                    <p className="text-sm text-surface-200/30">{t('dashboard.mySpace.noLeaderboard')}</p>
                </div>
            ) : (
                <>
                    {/* Podium */}
                    {podiumOrder.length >= 3 && (
                        <div className="flex items-end justify-center gap-4 pt-4 pb-2">
                            {podiumOrder.map((p, i) => (
                                <div key={p?.userId || i} className="flex flex-col items-center">
                                    <div className="text-2xl mb-2">{podiumLabels[i]}</div>
                                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/40 to-purple-500/40 flex items-center justify-center text-lg text-white font-bold shadow-xl ${i === 1 ? 'ring-2 ring-amber-500/30' : ''}`}>
                                        {(p?.displayName || 'U')[0].toUpperCase()}
                                    </div>
                                    <p className="text-xs font-bold text-surface-100 mt-2 truncate max-w-[80px]">{p?.displayName || t('dashboard.mySpace.user', 'User')}</p>
                                    <p className="text-[10px] text-amber-400 font-bold mt-0.5">{p?.reputation || 0} {t('dashboard.mySpace.rep', 'Rep')}</p>
                                    <div className={`w-20 ${podiumSizes[i]} mt-2 rounded-t-2xl bg-gradient-to-b ${podiumBg[i]} border border-b-0 flex items-end justify-center pb-2`}>
                                        <span className="text-[9px] text-surface-200/40">{parseFloat(p?.totalTipsReceived || 0).toFixed(2)} {t('dashboard.mySpace.tips', 'tips')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Full list */}
                    <div className="space-y-2">
                        {leaders.map((l, i) => (
                            <div key={l.userId} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all hover:bg-white/[0.02] ${i < 3 ? 'border-amber-500/15 bg-gradient-to-r from-amber-500/5 to-transparent' : 'border-white/[0.06] bg-surface-800/40'}`}>
                                <div className="w-8 flex items-center justify-center">
                                    {i === 0 ? <span className="text-lg">👑</span> : i < 3 ? <span className="text-[10px] font-bold text-amber-400">#{i + 1}</span> : <span className="text-[10px] font-bold text-surface-200/30">#{i + 1}</span>}
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center text-sm text-surface-100 font-bold">
                                    {(l.displayName || 'U')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-surface-100 truncate">{l.displayName || 'User'}</p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-[10px] text-surface-200/40"><Users size={9} className="inline mr-0.5" />{l.followersCount || 0}</span>
                                        <span className="text-[10px] text-amber-400/60"><Zap size={9} className="inline mr-0.5" />{parseFloat(l.totalTipsReceived || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-amber-400 tabular-nums">{l.reputation || 0}</p>
                                    <p className="text-[9px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.mySpace.reputation')}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* ── Level System ── */
const LEVELS = [
    { name: 'levelBronze', min: 0, max: 100, gradient: 'from-amber-700 to-amber-500', text: 'text-amber-400', emoji: '🥉' },
    { name: 'levelSilver', min: 100, max: 500, gradient: 'from-slate-400 to-slate-300', text: 'text-slate-300', emoji: '🥈' },
    { name: 'levelGold', min: 500, max: 2000, gradient: 'from-yellow-500 to-amber-300', text: 'text-yellow-400', emoji: '🥇' },
    { name: 'levelPlatinum', min: 2000, max: 5000, gradient: 'from-cyan-400 to-blue-300', text: 'text-cyan-300', emoji: '💎' },
    { name: 'levelDiamond', min: 5000, max: 999999, gradient: 'from-purple-400 to-pink-300', text: 'text-purple-300', emoji: '👑' },
];

function getLevel(xp) {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (xp >= LEVELS[i].min) return { ...LEVELS[i], index: i };
    }
    return { ...LEVELS[0], index: 0 };
}

function getGreeting(t) {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.mySpace.greetingMorning');
    if (h < 18) return t('dashboard.mySpace.greetingAfternoon');
    return t('dashboard.mySpace.greetingEvening');
}

/* ── Achievement Definitions ── */
function getAchievements(t, stats) {
    const xp = stats?.totalXP || 0;
    const games = stats?.gamesPlayed || 0;
    const wins = stats?.gamesWon || 0;
    const chats = stats?.aiChats || 0;
    const checkins = stats?.checkinCount || 0;
    const images = stats?.imagesGenerated || 0;

    return [
        { id: 'firstCheckin', emoji: '📅', label: t('dashboard.mySpace.achFirstCheckin'), unlocked: checkins >= 1 },
        { id: 'firstGame', emoji: '🎮', label: t('dashboard.mySpace.achFirstGame'), unlocked: games >= 1 },
        { id: 'firstWin', emoji: '🏆', label: t('dashboard.mySpace.achFirstWin'), unlocked: wins >= 1 },
        { id: 'aiExplorer', emoji: '🤖', label: t('dashboard.mySpace.achAiExplorer'), unlocked: chats >= 10 },
        { id: 'artist', emoji: '🎨', label: t('dashboard.mySpace.achArtist'), unlocked: images >= 5 },
        { id: 'xp100', emoji: '⭐', label: t('dashboard.mySpace.achXp100'), unlocked: xp >= 100 },
        { id: 'gamer10', emoji: '🕹️', label: t('dashboard.mySpace.achGamer10'), unlocked: games >= 10 },
        { id: 'xp500', emoji: '🌟', label: t('dashboard.mySpace.achXp500'), unlocked: xp >= 500 },
        { id: 'streak7', emoji: '🔥', label: t('dashboard.mySpace.achStreak7'), unlocked: (stats?.checkinStreak || 0) >= 7 },
        { id: 'xp2000', emoji: '💎', label: t('dashboard.mySpace.achXp2000'), unlocked: xp >= 2000 },
    ];
}

/* ── My Profile Editor View (Enhanced) ── */
function MyProfileView() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [form, setForm] = useState({ displayName: '', bio: '', walletAddress: '' });
    const [botStats, setBotStats] = useState(null);
    const [editingField, setEditingField] = useState(null); // 'name' | 'bio' | 'wallet'

    useEffect(() => {
        api.getMyProfile().then(r => {
            const p = r.profile;
            setProfile(p);
            setForm({ displayName: p?.displayName || '', bio: p?.bio || '', walletAddress: p?.walletAddress || '' });
        }).catch(() => {}).finally(() => setLoading(false));
        api.getStats().then(setBotStats).catch(() => {});
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const r = await api.updateProfile(form);
            setProfile(r.profile);
            setSaved(true);
            setEditingField(null);
            setTimeout(() => setSaved(false), 2000);
        } catch { /* ignore */ }
        setSaving(false);
    };

    const xp = botStats?.totalXP || 0;
    const level = getLevel(xp);
    const nextLevel = LEVELS[Math.min(level.index + 1, LEVELS.length - 1)];
    const progress = level.index < LEVELS.length - 1
        ? Math.min(100, Math.round(((xp - level.min) / (nextLevel.min - level.min)) * 100))
        : 100;
    const streak = botStats?.checkinStreak || 0;

    const achievements = useMemo(() => getAchievements(t, botStats), [t, botStats]);
    const unlockedCount = achievements.filter(a => a.unlocked).length;

    /* Unified stat items — bot + hub merged */
    const statItems = [
        { icon: Sparkles, label: 'XP', value: xp, max: nextLevel.min, color: 'text-amber-400 bg-amber-500/10', barColor: 'bg-amber-400' },
        { icon: CalendarCheck, label: t('dashboard.analytics.checkins'), value: botStats?.checkinCount || 0, max: 100, color: 'text-emerald-400 bg-emerald-500/10', barColor: 'bg-emerald-400' },
        { icon: Gamepad2, label: t('dashboard.analytics.gamesPlayed'), value: botStats?.gamesPlayed || 0, max: 50, color: 'text-purple-400 bg-purple-500/10', barColor: 'bg-purple-400' },
        { icon: Trophy, label: t('dashboard.mySpace.wins'), value: botStats?.gamesWon || 0, max: 25, color: 'text-cyan-400 bg-cyan-500/10', barColor: 'bg-cyan-400' },
        { icon: MessageCircle, label: t('dashboard.analytics.aiChats'), value: botStats?.aiChats || 0, max: 100, color: 'text-brand-400 bg-brand-500/10', barColor: 'bg-brand-400' },
        { icon: ImageIcon, label: t('dashboard.mySpace.images'), value: botStats?.imagesGenerated || 0, max: 30, color: 'text-pink-400 bg-pink-500/10', barColor: 'bg-pink-400' },
        { icon: Users, label: t('dashboard.mySpace.followers'), value: profile?.followersCount || 0, max: 50, color: 'text-sky-400 bg-sky-500/10', barColor: 'bg-sky-400' },
        { icon: Heart, label: t('dashboard.mySpace.reputation'), value: profile?.reputation || 0, max: 100, color: 'text-red-400 bg-red-500/10', barColor: 'bg-red-400' },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* ── #2 Time-based Greeting ── */}
            <h2 className="text-2xl font-bold text-surface-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                    <User size={20} className="text-brand-400" />
                </div>
                {getGreeting(t)}, {user?.first_name || 'User'}! ✨
            </h2>

            {loading ? (
                <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-surface-200/20" /></div>
            ) : (
                <>
                    {/* ── Profile Card + Level + Streak ── */}
                    <div className="glass-card p-6">
                        <div className="flex flex-col sm:flex-row items-start gap-5">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                {user?.photo_url ? (
                                    <img src={user.photo_url} alt="" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-brand-500/30" />
                                ) : (
                                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                                        {(user?.first_name || '?')[0]}
                                    </div>
                                )}
                                {/* #4 Level Badge */}
                                <div className={`absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r ${level.gradient} text-[9px] font-bold text-white shadow-lg`}>
                                    {level.emoji} {t(`dashboard.mySpace.${level.name}`)}
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-bold text-surface-100">{user?.first_name} {user?.last_name || ''}</h2>
                                {user?.username && <p className="text-sm text-surface-200/50">@{user.username}</p>}
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className="badge-info">ID: {user?.id}</span>
                                    {/* #4 XP Level Progress */}
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${level.text} bg-white/[0.05]`}>
                                        {xp} XP
                                    </span>
                                    {/* #5 Check-in Streak */}
                                    {streak > 0 && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md text-orange-400 bg-orange-500/10">
                                            🔥 {streak} {t('dashboard.mySpace.streakDays')}
                                        </span>
                                    )}
                                </div>
                                {/* #4 Level Progress Bar */}
                                <div className="mt-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] text-surface-200/30 font-medium">{t(`dashboard.mySpace.${level.name}`)} → {t(`dashboard.mySpace.${nextLevel.name}`)}</span>
                                        <span className="text-[9px] text-surface-200/30 tabular-nums">{xp}/{nextLevel.min} XP</span>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full bg-gradient-to-r ${level.gradient} transition-all duration-700 ease-out`} style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── #8 Quick Actions ── */}
                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => navigate('/games')} className="glass-card p-4 flex flex-col items-center gap-2 hover:bg-white/[0.06] hover:scale-[1.02] active:scale-95 transition-all group">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                                <Gamepad2 size={20} className="text-purple-400" />
                            </div>
                            <span className="text-[11px] font-bold text-surface-200/50 group-hover:text-surface-100 transition-colors">{t('dashboard.mySpace.playGames')}</span>
                        </button>
                        <button onClick={() => navigate('/chat')} className="glass-card p-4 flex flex-col items-center gap-2 hover:bg-white/[0.06] hover:scale-[1.02] active:scale-95 transition-all group">
                            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
                                <MessageCircle size={20} className="text-brand-400" />
                            </div>
                            <span className="text-[11px] font-bold text-surface-200/50 group-hover:text-surface-100 transition-colors">{t('dashboard.mySpace.chatAi')}</span>
                        </button>
                        <button onClick={() => navigate('/wallets')} className="glass-card p-4 flex flex-col items-center gap-2 hover:bg-white/[0.06] hover:scale-[1.02] active:scale-95 transition-all group">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                <CalendarCheck size={20} className="text-emerald-400" />
                            </div>
                            <span className="text-[11px] font-bold text-surface-200/50 group-hover:text-surface-100 transition-colors">{t('dashboard.mySpace.myWallets')}</span>
                        </button>
                    </div>

                    {/* ── #7 + #9 Unified Stats Grid with Progress Bars ── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {statItems.map((s) => {
                            const Icon = s.icon;
                            const pct = Math.min(100, Math.round((s.value / s.max) * 100));
                            return (
                                <div key={s.label} className="glass-card p-4 space-y-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.color}`}>
                                            <Icon size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] text-surface-200/40 truncate">{s.label}</p>
                                            <p className="text-lg font-bold text-surface-100 leading-tight">{s.value.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    {/* #7 Progress Bar */}
                                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${s.barColor} transition-all duration-700 ease-out`} style={{ width: `${pct}%`, opacity: 0.6 }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── #6 Achievement Badges ── */}
                    <div className="glass-card p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-surface-200/60 flex items-center gap-2">
                                <Trophy size={15} className="text-amber-400" />
                                {t('dashboard.mySpace.achievements')}
                            </h3>
                            <span className="text-[10px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md">
                                {unlockedCount}/{achievements.length}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {achievements.map(a => (
                                <div
                                    key={a.id}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                                        a.unlocked
                                            ? 'bg-white/[0.06] border-white/[0.1] text-surface-100'
                                            : 'bg-white/[0.02] border-white/[0.04] text-surface-200/20'
                                    }`}
                                    title={a.label}
                                >
                                    <span className={`text-sm ${a.unlocked ? '' : 'grayscale opacity-30'}`}>{a.emoji}</span>
                                    <span className="hidden sm:inline">{a.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── #10 Inline-Edit Hub Profile ── */}
                    <div className="glass-card overflow-hidden">
                        <div className="h-16 bg-gradient-to-br from-brand-500/25 via-purple-500/15 to-cyan-500/10" />
                        <div className="px-6 pb-6 -mt-6 space-y-4">
                            <div className="flex items-end gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/50 to-purple-500/50 flex items-center justify-center text-lg text-white font-bold border-4 border-surface-800 shadow-xl flex-shrink-0">
                                    {(form.displayName || 'U')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] text-surface-200/25 uppercase tracking-wider mb-0.5">{t('dashboard.mySpace.hubProfile')}</p>
                                    {/* Inline-edit: Display Name */}
                                    {editingField === 'name' ? (
                                        <input
                                            value={form.displayName}
                                            onChange={e => setForm({ ...form, displayName: e.target.value })}
                                            onBlur={() => setEditingField(null)}
                                            className="w-full bg-transparent border-b border-brand-500/30 text-lg font-bold text-surface-100 outline-none pb-0.5"
                                            autoFocus
                                        />
                                    ) : (
                                        <h3
                                            className="text-lg font-bold text-surface-100 cursor-pointer hover:text-brand-400 transition-colors truncate"
                                            onClick={() => setEditingField('name')}
                                            title={t('dashboard.mySpace.clickToEdit')}
                                        >
                                            {form.displayName || t('dashboard.mySpace.yourName')} ✏️
                                        </h3>
                                    )}
                                </div>
                            </div>

                            {/* Inline-edit: Bio */}
                            <div>
                                <p className="text-[9px] text-surface-200/20 uppercase tracking-wider mb-1">{t('dashboard.mySpace.bio')}</p>
                                {editingField === 'bio' ? (
                                    <textarea
                                        value={form.bio}
                                        onChange={e => setForm({ ...form, bio: e.target.value })}
                                        onBlur={() => setEditingField(null)}
                                        className="w-full h-20 bg-transparent border border-brand-500/20 rounded-xl p-3 text-xs text-surface-100 outline-none resize-none"
                                        autoFocus
                                    />
                                ) : (
                                    <p
                                        className="text-xs text-surface-200/50 leading-relaxed cursor-pointer hover:text-surface-200/80 transition-colors min-h-[1.5rem]"
                                        onClick={() => setEditingField('bio')}
                                    >
                                        {form.bio || t('dashboard.mySpace.bioPlaceholder')} ✏️
                                    </p>
                                )}
                            </div>

                            {/* Inline-edit: Wallet */}
                            <div>
                                <p className="text-[9px] text-surface-200/20 uppercase tracking-wider mb-1">{t('dashboard.mySpace.walletLabel')}</p>
                                {editingField === 'wallet' ? (
                                    <input
                                        value={form.walletAddress}
                                        onChange={e => setForm({ ...form, walletAddress: e.target.value })}
                                        onBlur={() => setEditingField(null)}
                                        className="w-full bg-transparent border border-brand-500/20 rounded-xl px-3 py-2 text-[11px] text-surface-100 outline-none font-mono"
                                        placeholder="0x..."
                                        autoFocus
                                    />
                                ) : (
                                    <div
                                        className="px-3 py-2 rounded-xl bg-black/20 border border-white/[0.04] cursor-pointer hover:border-white/[0.1] transition-colors"
                                        onClick={() => setEditingField('wallet')}
                                    >
                                        <code className="text-[10px] text-surface-200/40 font-mono break-all">
                                            {form.walletAddress || t('dashboard.mySpace.walletPlaceholder')} ✏️
                                        </code>
                                    </div>
                                )}
                            </div>

                            {/* Social Stats + Save */}
                            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                                <div className="flex items-center gap-5">
                                    <div className="text-center"><span className="text-sm font-bold text-surface-100">{profile?.followersCount || 0}</span><p className="text-[8px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.mySpace.followers')}</p></div>
                                    <div className="text-center"><span className="text-sm font-bold text-surface-100">{profile?.followingCount || 0}</span><p className="text-[8px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.mySpace.following')}</p></div>
                                    <div className="text-center"><span className="text-sm font-bold text-amber-400">{profile?.reputation || 0}</span><p className="text-[8px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.mySpace.reputation')}</p></div>
                                    <div className="text-center"><span className="text-sm font-bold text-emerald-400">{parseFloat(profile?.totalTipsReceived || 0).toFixed(2)}</span><p className="text-[8px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.mySpace.tipsReceived')}</p></div>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-xs font-bold shadow-lg hover:shadow-brand-500/30 disabled:opacity-30 transition-all"
                                >
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <User size={12} />}
                                    {saved ? t('dashboard.mySpace.saved') : t('dashboard.mySpace.saveProfile')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/* ── Create Post Modal ── */
function CreatePostModal({ onClose, onCreated }) {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [posting, setPosting] = useState(false);

    const handlePost = async () => {
        if (!content.trim()) return;
        setPosting(true);
        try {
            await api.createPost({ content: content.trim() });
            onCreated?.();
            onClose();
        } catch { /* ignore */ }
        setPosting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-lg mx-4 rounded-3xl bg-surface-800 border border-white/[0.08] shadow-2xl animate-scaleIn" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                    <h3 className="text-lg font-bold text-surface-100 flex items-center gap-2"><Plus size={18} className="text-brand-400" /> {t('dashboard.mySpace.createPost', 'Create Post')}</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-surface-200/50 hover:text-surface-100 transition-colors"><XIcon size={16} /></button>
                </div>
                <div className="p-5">
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder={t('dashboard.mySpace.createPostPlaceholder', "What's on your mind? Share trading insights, token analysis...")}
                        className="w-full h-32 bg-surface-900/60 border border-white/[0.06] rounded-2xl p-4 text-sm text-surface-100 placeholder:text-surface-200/20 outline-none resize-none focus:border-brand-500/30 transition-colors"
                        autoFocus
                    />
                    <div className="flex items-center justify-between mt-4">
                        <span className="text-[10px] text-surface-200/25">{content.length}/2000</span>
                        <button
                            onClick={handlePost}
                            disabled={!content.trim() || posting}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-lg hover:shadow-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {t('dashboard.mySpace.post', 'Post')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Comment Section ── */
function CommentSection({ postId }) {
    const { t } = useTranslation();
    const [comments, setComments] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.getComments(postId).then(r => setComments(r.comments || [])).catch(() => {}).finally(() => setLoading(false));
    }, [postId]);

    const submit = async () => {
        if (!text.trim()) return;
        setSubmitting(true);
        try {
            const r = await api.addComment(postId, { content: text.trim() });
            setComments(r.comments || []);
            setText('');
        } catch { /* ignore */ }
        setSubmitting(false);
    };

    return (
        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2.5">
            {loading ? (
                <div className="flex items-center gap-2 text-[10px] text-surface-200/20"><Loader2 size={10} className="animate-spin" /> Loading comments...</div>
            ) : (
                <>
                    {comments.map(c => (
                        <div key={c.id} className="flex gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center text-[8px] text-surface-100 font-bold flex-shrink-0">
                                {(c.displayName || 'U')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-surface-100">{c.displayName || `User ${String(c.userId).slice(-4)}`}</span>
                                    <span className="text-[9px] text-surface-200/20">{timeSince(c.createdAt)}</span>
                                </div>
                                <p className="text-[11px] text-surface-200/60 mt-0.5 break-words">{c.content}</p>
                            </div>
                        </div>
                    ))}
                    {comments.length === 0 && <p className="text-[10px] text-surface-200/15 text-center py-1">No comments yet</p>}
                </>
            )}
            <div className="flex items-center gap-2 mt-1">
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    placeholder="Add a comment..."
                    className="flex-1 bg-surface-900/50 border border-white/[0.06] rounded-xl px-3 py-1.5 text-[11px] text-surface-100 outline-none placeholder:text-surface-200/15 focus:border-brand-500/20 transition-colors"
                />
                <button onClick={submit} disabled={!text.trim() || submitting} className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 disabled:opacity-20 transition-colors">
                    {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </button>
            </div>
        </div>
    );
}

/* ── Post Card ── */
function SocialPostCard({ post, onLike, onDelete, currentUserId, onViewProfile, onTip }) {
    const { t } = useTranslation();
    const [showComments, setShowComments] = useState(false);
    const [liked, setLiked] = useState(post.isLiked);
    const [likesCount, setLikesCount] = useState(post.likesCount || 0);

    const handleLike = async () => {
        try {
            const res = await api.toggleLike(post.id);
            setLiked(res.liked);
            setLikesCount(prev => res.liked ? prev + 1 : Math.max(0, prev - 1));
        } catch { /* ignore */ }
    };

    const handleDelete = async () => {
        if (!confirm(t('dashboard.mySpace.deletePostConfirm', 'Delete this post?'))) return;
        try {
            await api.deletePost(post.id);
            onDelete?.(post.id);
        } catch { /* ignore */ }
    };

    return (
        <div className="group relative rounded-2xl border border-white/[0.06] bg-surface-800/60 backdrop-blur-sm p-5 hover:border-white/[0.1] transition-all">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-3">
                <button onClick={() => onViewProfile?.(post.userId)} className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500/40 to-purple-500/40 flex items-center justify-center text-xs text-surface-100 font-bold flex-shrink-0 hover:scale-110 transition-transform cursor-pointer">
                    {(post.displayName || 'U')[0].toUpperCase()}
                </button>
                <div className="flex-1 min-w-0">
                    <button onClick={() => onViewProfile?.(post.userId)} className="text-sm font-semibold text-surface-100 hover:text-brand-400 transition-colors cursor-pointer">{post.displayName || `User ${String(post.userId).slice(-4)}`}</button>
                    <p className="text-[10px] text-surface-200/25">{timeSince(post.createdAt)} {t('dashboard.mySpace.ago', 'ago')}</p>
                </div>
                {String(post.userId) === String(currentUserId) && (
                    <button onClick={handleDelete} className="p-1.5 rounded-lg text-surface-200/15 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {/* Content */}
            <p className="text-sm text-surface-200/70 leading-relaxed whitespace-pre-wrap break-words mb-4">{post.content}</p>

            {/* Actions row */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleLike}
                    className={`flex items-center gap-1.5 text-xs transition-all ${liked ? 'text-pink-400' : 'text-surface-200/30 hover:text-pink-400'}`}
                >
                    <Heart size={14} className={liked ? 'fill-current' : ''} />
                    <span className="font-medium">{likesCount || ''}</span>
                </button>
                <button
                    onClick={() => setShowComments(!showComments)}
                    className={`flex items-center gap-1.5 text-xs transition-all ${showComments ? 'text-brand-400' : 'text-surface-200/30 hover:text-brand-400'}`}
                >
                    <MessageCircle size={14} />
                    <span className="font-medium">{post.commentsCount || ''}</span>
                </button>
                <button
                    onClick={() => onTip?.({ postId: post.id, toUserId: post.userId, toName: post.displayName || `User ${String(post.userId).slice(-4)}` })}
                    className="flex items-center gap-1.5 text-xs text-surface-200/30 hover:text-amber-400 transition-all"
                >
                    <Zap size={14} />
                    <span className="font-medium">{post.tipsCount || ''}</span>
                </button>
            </div>

            {/* Comments */}
            {showComments && <CommentSection postId={post.id} />}
        </div>
    );
}

/* ── Social Feed View ── */
function SocialFeedView({ onSwitchToMessages }) {
    const { t } = useTranslation();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('newest');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [profile, setProfile] = useState(null);
    const [notifications, setNotifications] = useState({ notifications: [], unreadCount: 0 });
    const [showNotif, setShowNotif] = useState(false);
    const [profileModal, setProfileModal] = useState(null); // userId
    const [tipModal, setTipModal] = useState(null); // { postId, toUserId, toName }

    // Load profile once
    useEffect(() => {
        api.getMyProfile().then(r => setProfile(r.profile)).catch(() => {});
        api.getNotifications().then(r => setNotifications(r)).catch(() => {});
    }, []);

    // Load posts on tab change
    const loadPosts = useCallback(async (reset = false) => {
        const newOffset = reset ? 0 : offset;
        setLoading(true);
        try {
            const r = await api.getPosts(tab, 20, newOffset);
            if (reset) {
                setPosts(r.posts || []);
            } else {
                setPosts(prev => [...prev, ...(r.posts || [])]);
            }
            setHasMore(r.hasMore);
            setOffset(newOffset + (r.posts?.length || 0));
        } catch { /* ignore */ }
        setLoading(false);
    }, [tab, offset]);

    useEffect(() => {
        setOffset(0);
        setLoading(true);
        api.getPosts(tab, 20, 0).then(r => {
            setPosts(r.posts || []);
            setHasMore(r.hasMore);
            setOffset(r.posts?.length || 0);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [tab]);

    const handleDelete = (id) => setPosts(prev => prev.filter(p => p.id !== id));

    const feedTabs = [
        { id: 'newest', label: `🆕 ${t('dashboard.mySpace.feedNewest', 'Newest')}` },
        { id: 'following', label: `👥 ${t('dashboard.mySpace.feedFollowing', 'Following')}` },
        { id: 'trending', label: `🔥 ${t('dashboard.mySpace.feedTrending', 'Trending')}` },
        { id: 'top_tipped', label: `💰 ${t('dashboard.mySpace.feedTopTipped', 'Top Tipped')}` },
        { id: 'mine', label: `📝 ${t('dashboard.mySpace.feedMyPosts', 'My Posts')}` },
    ];

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Header + Notifications */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-surface-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                        <MessageCircle size={20} className="text-brand-400" />
                    </div>
                    {t('dashboard.socialHub.tabs.socialFeed', 'Social Feed')}
                </h2>
                <div className="flex items-center gap-2">
                    {/* Notification bell */}
                    <button
                        onClick={() => { setShowNotif(!showNotif); if (!showNotif) api.markNotificationsRead().then(() => setNotifications(n => ({ ...n, unreadCount: 0 }))).catch(() => {}); }}
                        className="relative p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-surface-200/40 hover:text-surface-100 hover:bg-white/[0.06] transition-colors"
                    >
                        <Bell size={16} />
                        {notifications.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[8px] text-white font-bold flex items-center justify-center">{notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold shadow-lg hover:shadow-brand-500/30 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                        <Plus size={16} /> {t('dashboard.mySpace.post', 'Post')}
                    </button>
                </div>
            </div>

            {/* Notification dropdown */}
            {showNotif && (
                <div className="rounded-2xl border border-white/[0.08] bg-surface-800/95 backdrop-blur-xl p-4 space-y-2 max-h-[300px] overflow-y-auto">
                    <h4 className="text-xs font-bold text-surface-200/50 uppercase tracking-wider">{t('dashboard.mySpace.notifications', 'Notifications')}</h4>
                    {notifications.notifications?.length === 0 && <p className="text-[11px] text-surface-200/20 text-center py-4">{t('dashboard.mySpace.noNotifications', 'No notifications yet')}</p>}
                    {notifications.notifications?.map(n => (
                        <div key={n.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${n.read ? 'bg-transparent' : 'bg-brand-500/5'} transition-colors`}>
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center text-[9px] font-bold text-surface-100">
                                {n.type === 'like' ? '❤️' : n.type === 'comment' ? '💬' : n.type === 'follow' ? '👤' : n.type === 'tip' ? '💰' : '🔔'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-surface-200/60">
                                    <span className="font-semibold text-surface-100">{n.actorName || t('dashboard.mySpace.someone', 'Someone')}</span>
                                    {' '}{n.type === 'like' ? t('dashboard.mySpace.notifLiked', 'liked your post') : n.type === 'comment' ? t('dashboard.mySpace.notifCommented', 'commented on your post') : n.type === 'follow' ? t('dashboard.mySpace.notifFollowed', 'started following you') : n.type === 'tip' ? t('dashboard.mySpace.notifTipped', 'tipped you') : t('dashboard.mySpace.notifInteracted', 'interacted')}
                                </p>
                            </div>
                            <span className="text-[9px] text-surface-200/20 flex-shrink-0">{timeSince(n.createdAt)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Feed tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {feedTabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${tab === t.id ? 'bg-white/[0.08] border-white/[0.15] text-surface-100 shadow-lg' : 'bg-white/[0.03] border-white/[0.06] text-surface-200/40 hover:bg-white/[0.06]'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Posts */}
            <div className="space-y-4">
                {loading && posts.length === 0 ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="rounded-2xl border border-white/[0.06] bg-surface-800/40 p-5 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-full bg-white/[0.05]" />
                                    <div className="space-y-1.5 flex-1"><div className="h-3 w-24 bg-white/[0.05] rounded" /><div className="h-2 w-16 bg-white/[0.03] rounded" /></div>
                                </div>
                                <div className="space-y-2"><div className="h-3 w-full bg-white/[0.04] rounded" /><div className="h-3 w-3/4 bg-white/[0.03] rounded" /></div>
                            </div>
                        ))}
                    </div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-4xl mb-3">📝</div>
                        <p className="text-sm text-surface-200/30">{t('dashboard.mySpace.noPostsYet', 'No posts yet. Be the first to share!')}</p>
                        <button onClick={() => setShowCreate(true)} className="mt-4 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold">
                            <Plus size={14} className="inline mr-1" /> {t('dashboard.mySpace.createPost', 'Create Post')}
                        </button>
                    </div>
                ) : (
                    <>
                        {posts.map(post => (
                            <SocialPostCard
                                key={post.id}
                                post={post}
                                onDelete={handleDelete}
                                currentUserId={profile?.userId}
                                onViewProfile={(uid) => setProfileModal(uid)}
                                onTip={(data) => setTipModal(data)}
                            />
                        ))}
                        {hasMore && (
                            <button
                                onClick={() => loadPosts(false)}
                                disabled={loading}
                                className="w-full py-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-surface-200/30 text-xs font-medium hover:bg-white/[0.04] hover:text-surface-200/50 transition-colors disabled:opacity-30"
                            >
                                {loading ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                                {t('dashboard.mySpace.loadMore', 'Load More')}
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Create Post Modal */}
            {showCreate && (
                <CreatePostModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setTab('newest'); setOffset(0); api.getPosts('newest', 20, 0).then(r => { setPosts(r.posts || []); setHasMore(r.hasMore); setOffset(r.posts?.length || 0); }).catch(() => {}); }}
                />
            )}

            {/* User Profile Modal */}
            {profileModal && (
                <UserProfileModal
                    userId={profileModal}
                    onClose={() => setProfileModal(null)}
                    onStartDM={(uid, name) => {
                        onSwitchToMessages?.(uid, name);
                    }}
                />
            )}

            {/* Tip Modal */}
            {tipModal && (
                <TipModal
                    postId={tipModal.postId}
                    toUserId={tipModal.toUserId}
                    toName={tipModal.toName}
                    onClose={() => setTipModal(null)}
                    onTipped={() => { /* optionally refresh post */ }}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   Main Page — with Communities/Social tab switcher
   ═══════════════════════════════════════════════════ */
function CommunitiesView({ t, navigate, tokenAddresses, prices, priceLoading, tokenInfo, holderCounts, votes, voted, toggleVote, activeFilter, setActiveFilter, filteredCommunities }) {
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
                        href="https://x.com/haivcon_X"
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

export default function CommunityPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeFilter, setActiveFilter] = useState('all');
    const [dmUnread, setDmUnread] = useState(0);
    const [dmInitialChat, setDmInitialChat] = useState(null); // { userId, displayName } for deep-link DM

    const VALID_TABS = ['profile', 'communities', 'social', 'messages', 'leaderboard'];
    const urlTab = searchParams.get('tab');
    const viewMode = VALID_TABS.includes(urlTab) ? urlTab : 'profile';

    const [tabHistory, setTabHistory] = useState([viewMode]);

    useEffect(() => {
        api.getUnreadDMs().then(r => setDmUnread(r.unreadCount || 0)).catch(() => {});
    }, [viewMode]);

    const tabs = useMemo(() => [
        { id: 'profile', icon: User, label: t('dashboard.socialHub.tabs.myProfile') },
        { id: 'communities', icon: Globe, label: t('dashboard.socialHub.tabs.communities') },
        { id: 'social', icon: MessageCircle, label: t('dashboard.socialHub.tabs.socialFeed') },
        { id: 'messages', icon: Send, label: t('dashboard.socialHub.tabs.messages'), badge: dmUnread },
        { id: 'leaderboard', icon: Star, label: t('dashboard.socialHub.tabs.leaderboard') },
    ], [t, dmUnread]);

    const switchTab = useCallback((id) => {
        setTabHistory(prev => [...prev, id]);
        setSearchParams({ tab: id }, { replace: false });
    }, [setSearchParams]);

    const goBack = useCallback(() => {
        setTabHistory(prev => {
            if (prev.length <= 1) return prev;
            const next = prev.slice(0, -1);
            setSearchParams({ tab: next[next.length - 1] }, { replace: true });
            return next;
        });
    }, [setSearchParams]);

    const currentTab = tabs.find(tab => tab.id === viewMode);
    const canGoBack = tabHistory.length > 1;

    return (
        <div className="space-y-5">
            {/* ── Professional Page Header ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    {canGoBack && (
                        <button
                            onClick={goBack}
                            className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-surface-200/40 hover:text-surface-100 hover:bg-white/[0.08] hover:border-white/[0.12] transition-all active:scale-90"
                            title={t('dashboard.mySpace.back')}
                        >
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                            <Sparkles size={16} className="text-brand-400" />
                        </div>
                        <div className="min-w-0">
                            {/* Breadcrumb */}
                            <div className="flex items-center gap-1.5 text-[10px] text-surface-200/30">
                                <button onClick={() => switchTab('profile')} className="hover:text-brand-400 transition-colors">{t('dashboard.sidebar.mySpace')}</button>
                                {viewMode !== 'profile' && (
                                    <>
                                        <ChevronRight size={10} className="flex-shrink-0" />
                                        <span className="text-surface-200/50 truncate">{currentTab?.label}</span>
                                    </>
                                )}
                            </div>
                            <h1 className="text-lg font-bold text-surface-100 leading-tight truncate">{currentTab?.label || t('dashboard.sidebar.mySpace')}</h1>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Professional Tab Bar ── */}
            <div className="relative">
                {/* Tab container with horizontal scroll on mobile */}
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-px">
                    {tabs.map(tab => {
                        const isActive = viewMode === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => switchTab(tab.id)}
                                className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all duration-200
                                    ${isActive
                                        ? 'text-brand-400'
                                        : 'text-surface-200/40 hover:text-surface-200/70 hover:bg-white/[0.03]'
                                    } rounded-xl`}
                            >
                                <tab.icon size={14} className={isActive ? 'text-brand-400' : ''} />
                                {tab.label}
                                {tab.badge > 0 && (
                                    <span className="w-4 h-4 rounded-full bg-red-500 text-[7px] text-white font-bold flex items-center justify-center flex-shrink-0">
                                        {tab.badge > 9 ? '9+' : tab.badge}
                                    </span>
                                )}
                                {/* Active indicator line */}
                                {isActive && (
                                    <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-purple-500" />
                                )}
                            </button>
                        );
                    })}
                </div>
                {/* Full-width divider */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.06]" />
            </div>

            {/* ── Tab Content ── */}
            {viewMode === 'communities' ? (
                <LazyCommunitiesView t={t} navigate={navigate} activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
            ) : viewMode === 'social' ? (
                <SocialFeedView onSwitchToMessages={(uid, name) => { setDmInitialChat({ userId: uid, displayName: name }); switchTab('messages'); }} />
            ) : viewMode === 'messages' ? (
                <DMView initialChat={dmInitialChat} onClearInitialChat={() => setDmInitialChat(null)} />
            ) : viewMode === 'leaderboard' ? (
                <SocialLeaderboardView />
            ) : (
                <MyProfileView />
            )}
        </div>
    );
}

/* #3 Lazy-load: only fetch token prices when Communities tab is active */
function LazyCommunitiesView({ t, navigate, activeFilter, setActiveFilter }) {
    const tokenAddresses = useMemo(() => COMMUNITIES.map(c => c.token), []);
    const { prices, loading: priceLoading } = useTokenPrices(tokenAddresses);
    const tokenInfo = useTokenInfo(tokenAddresses);
    const holderCounts = useTokenHolders(tokenAddresses);
    const { votes, voted, toggleVote } = useVotes();

    const filteredCommunities = useMemo(() => {
        if (activeFilter === 'all') return COMMUNITIES;
        if (activeFilter === 'gamefi') return COMMUNITIES.filter(c => c.links.gamefi);
        if (activeFilter === 'defi') return COMMUNITIES.filter(c => c.links.defi);
        return COMMUNITIES;
    }, [activeFilter]);

    return (
        <CommunitiesView
            t={t} navigate={navigate} tokenAddresses={tokenAddresses}
            prices={prices} priceLoading={priceLoading} tokenInfo={tokenInfo}
            holderCounts={holderCounts} votes={votes} voted={voted} toggleVote={toggleVote}
            activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            filteredCommunities={filteredCommunities}
        />
    );
}
