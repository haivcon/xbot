import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import {
    Search, Loader2, ExternalLink, Shield, AlertTriangle, CheckCircle,
    Users, Droplets, TrendingUp, TrendingDown, Copy, Check, BarChart3,
    Coins, Activity, XCircle, Star, Bell, ShoppingCart, Clock,
    ChevronDown, ChevronUp, Tag, Zap, ArrowLeftRight,
} from 'lucide-react';

/* ═══════════════════════════════════════════
   Constants & Helpers
   ═══════════════════════════════════════════ */
const CHAINS = [
    { id: '196', label: 'X Layer', icon: '🔷', evm: true },
    { id: '1', label: 'Ethereum', icon: '⟠', evm: true },
    { id: '56', label: 'BSC', icon: '🔶', evm: true },
    { id: '501', label: 'Solana', icon: '◎', evm: false },
    { id: '42161', label: 'Arbitrum', icon: '🔵', evm: true },
    { id: '137', label: 'Polygon', icon: '🟣', evm: true },
    { id: '8453', label: 'Base', icon: '🔵', evm: true },
];

const EVM_CHAINS = CHAINS.filter(c => c.evm);

function formatNumber(n, decimals = 2) {
    if (!n || isNaN(n)) return '0';
    const num = Number(n);
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
}

function formatPrice(p) {
    if (!p) return '$0';
    const num = Number(p);
    if (num >= 1) return `$${num.toFixed(2)}`;
    if (num >= 0.01) return `$${num.toFixed(4)}`;
    const s = num.toFixed(18);
    const match = s.match(/^0\.(0*)/);
    const leadingZeros = match ? match[1].length : 0;
    return `$${s.slice(0, 2 + leadingZeros + 4)}`;
}

function timeAgo(ts) {
    const diff = Date.now() - Number(ts);
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
}

function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
}

/* ═══════════════════════════════════════════
   localStorage helpers
   ═══════════════════════════════════════════ */
const HISTORY_KEY = 'token_search_history';
const FAVORITES_KEY = 'token_favorites';

function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function addHistory(token) {
    const h = getHistory().filter(t => t.address !== token.address);
    h.unshift(token);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 8)));
}

function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}
function toggleFavorite(token) {
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.address === token.address);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.unshift({ address: token.address, symbol: token.symbol, name: token.name, chainId: token.chainId, logo: token.logo });
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs.slice(0, 20)));
    return favs;
}
function isFavorited(address) {
    return getFavorites().some(f => f.address === address);
}

/* ═══════════════════════════════════════════
   SVG Sparkline Chart
   ═══════════════════════════════════════════ */
function SparklineChart({ data, width = 500, height = 120 }) {
    if (!data || data.length < 2) return null;
    const prices = data.map(d => Number(d[4] || d.close || d));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const points = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((p - min) / range) * (height - 10) - 5;
        return `${x},${y}`;
    }).join(' ');

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#34d399' : '#f87171';
    const gradientId = `sparkGrad_${isUp ? 'up' : 'down'}`;

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="rounded-lg overflow-hidden">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${height} ${points} ${width},${height}`}
                fill={`url(#${gradientId})`}
            />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* ═══════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════ */
export default function TokenLookupPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [chainId, setChainId] = useState('196');
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [selectedToken, setSelectedToken] = useState(null);
    const [tokenInfo, setTokenInfo] = useState(null);
    const [holders, setHolders] = useState(null);
    const [candles, setCandles] = useState(null);
    const [trades, setTrades] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [copiedAddr, setCopiedAddr] = useState(false);
    const [favorites, setFavorites] = useState(() => getFavorites());
    const [history, setHistoryState] = useState(() => getHistory());
    const [showAlert, setShowAlert] = useState(false);
    const [alertPrice, setAlertPrice] = useState('');
    const [alertDir, setAlertDir] = useState('above');
    const [alertSaving, setAlertSaving] = useState(false);
    const [showTrades, setShowTrades] = useState(false);
    const [showHolders, setShowHolders] = useState(true);
    const [autoDetecting, setAutoDetecting] = useState(false);
    const [detectedChain, setDetectedChain] = useState(null);

    /* ── Multi-chain auto-detect (Feature 9) ── */
    const isEvmAddress = (q) => /^0x[a-fA-F0-9]{40}$/i.test(q.trim());
    const isSolanaAddress = (q) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q.trim());

    const autoDetectChain = useCallback(async (addr) => {
        if (isSolanaAddress(addr)) {
            setChainId('501');
            setDetectedChain(CHAINS.find(c => c.id === '501'));
            return '501';
        }
        if (!isEvmAddress(addr)) return chainId;

        setAutoDetecting(true);
        try {
            const results = await Promise.allSettled(
                EVM_CHAINS.map(async (chain) => {
                    const res = await api.request('/market/token/info', {
                        method: 'POST',
                        body: JSON.stringify({ tokens: [{ chainIndex: chain.id, tokenContractAddress: addr }] }),
                    });
                    const basic = res?.basicInfo?.[0] || {};
                    const price = res?.priceInfo?.[0] || {};
                    if (basic.tokenSymbol || price.price) return { chain, basic, price };
                    throw new Error('not found');
                })
            );
            const found = results.find(r => r.status === 'fulfilled');
            if (found) {
                const { chain } = found.value;
                setChainId(chain.id);
                setDetectedChain(chain);
                return chain.id;
            }
        } catch {/* ignore */}
        finally { setAutoDetecting(false); }
        return chainId;
    }, [chainId]);

    /* ── Search (with auto-detect for addresses) ── */
    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setSelectedToken(null);
        setTokenInfo(null);
        setHolders(null);
        setCandles(null);
        setTrades(null);
        setDetectedChain(null);
        try {
            const trimmed = query.trim();
            if (isEvmAddress(trimmed) || isSolanaAddress(trimmed)) {
                const resolvedChain = await autoDetectChain(trimmed);
                const addr = trimmed;
                const res = await api.request('/market/token/info', {
                    method: 'POST',
                    body: JSON.stringify({ tokens: [{ chainIndex: resolvedChain, tokenContractAddress: addr }] }),
                });
                const basic = res?.basicInfo?.[0] || {};
                const price = res?.priceInfo?.[0] || {};
                const merged = { ...basic, ...price };
                if (merged.tokenSymbol || merged.symbol) {
                    const tok = {
                        address: addr, tokenContractAddress: addr,
                        symbol: merged.tokenSymbol || merged.symbol || '?',
                        name: merged.tokenName || merged.name || 'Unknown',
                        chainId: resolvedChain,
                        logo: merged.logoUrl || merged.tokenLogoUrl || '',
                    };
                    setSelectedToken(tok);
                    setTokenInfo(merged);
                    addHistory(tok);
                    setHistoryState(getHistory());
                    loadExtras(addr, resolvedChain);
                }
            } else {
                const data = await api.request(`/market/token/search?chains=${chainId}&keyword=${encodeURIComponent(trimmed)}`);
                setSearchResults(data?.data || data?.tokens || data || []);
            }
        } catch (err) {
            console.error('Search failed:', err);
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    }, [query, chainId, autoDetectChain]);

    /* ── Load candles, trades, holders ── */
    const loadExtras = async (address, chain) => {
        const cid = chain || chainId;
        Promise.allSettled([
            api.getCandles(cid, address, '1H', 24).then(d => setCandles(d?.data || d || [])).catch(() => setCandles(null)),
            api.getMarketTrades(cid, address).then(d => setTrades(d?.data || d || [])).catch(() => setTrades(null)),
            api.request(`/market/token/holders?chainIndex=${cid}&tokenContractAddress=${address}`).then(d => setHolders(d)).catch(() => setHolders(null)),
        ]);
    };

    const selectToken = async (token) => {
        setSelectedToken(token);
        setLoadingInfo(true);
        setCandles(null);
        setTrades(null);
        try {
            const address = token.tokenContractAddress || token.address;
            const res = await api.request('/market/token/info', {
                method: 'POST',
                body: JSON.stringify({ tokens: [{ chainIndex: chainId, tokenContractAddress: address }] }),
            });
            const basic = res?.basicInfo?.[0] || {};
            const price = res?.priceInfo?.[0] || {};
            const merged = { ...basic, ...price };
            setTokenInfo(merged);
            const tok = {
                address, tokenContractAddress: address,
                symbol: merged.tokenSymbol || merged.symbol || token.symbol || '?',
                name: merged.tokenName || merged.name || token.name || 'Unknown',
                chainId,
                logo: merged.logoUrl || merged.tokenLogoUrl || token.logoUrl || '',
            };
            addHistory(tok);
            setHistoryState(getHistory());
            loadExtras(address, chainId);
        } catch { setTokenInfo(null); }
        finally { setLoadingInfo(false); }
    };

    const handleCopy = (text) => {
        copyToClipboard(text);
        setCopiedAddr(true);
        setTimeout(() => setCopiedAddr(false), 2000);
    };

    const handleToggleFavorite = () => {
        if (!selectedToken) return;
        const addr = selectedToken.tokenContractAddress || selectedToken.address;
        const tok = {
            address: addr, symbol: selectedToken.symbol || tokenInfo?.tokenSymbol || '?',
            name: selectedToken.name || tokenInfo?.tokenName || '', chainId,
            logo: tokenInfo?.logoUrl || tokenInfo?.tokenLogoUrl || '',
        };
        const newFavs = toggleFavorite(tok);
        setFavorites([...newFavs]);
    };

    const handleCreateAlert = async () => {
        if (!alertPrice || !selectedToken) return;
        setAlertSaving(true);
        try {
            await api.createAlert({
                symbol: selectedToken.symbol || tokenInfo?.tokenSymbol || '?',
                chainIndex: chainId,
                tokenAddress: selectedToken.tokenContractAddress || selectedToken.address,
                targetPrice: parseFloat(alertPrice),
                direction: alertDir,
            });
            setShowAlert(false);
            setAlertPrice('');
        } catch (e) { console.error('Alert failed:', e); }
        finally { setAlertSaving(false); }
    };

    const address = selectedToken?.tokenContractAddress || selectedToken?.address || '';
    const priceChange = tokenInfo?.priceChange24H || tokenInfo?.priceChange24h || tokenInfo?.change24h;
    const isPositive = Number(priceChange) >= 0;
    const isFav = address && isFavorited(address);
    const holderCount = holders?.totalHolder || tokenInfo?.holders || tokenInfo?.totalHolder || null;

    // Tags (Feature 8)
    const tags = useMemo(() => {
        const tl = tokenInfo?.tagList;
        if (!tl) return [];
        if (typeof tl === 'string') return tl.split(',').map(t => t.trim()).filter(Boolean);
        if (Array.isArray(tl)) return tl;
        return [];
    }, [tokenInfo?.tagList]);

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/5 flex items-center justify-center">
                    <Search size={20} className="text-purple-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.tokenLookupPage.title')}</h1>
                    <p className="text-xs text-surface-200/40">{t('dashboard.tokenLookupPage.subtitle')}</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="glass-card p-4">
                <div className="flex gap-2 items-center flex-wrap">
                    {CHAINS.map(c => (
                        <button key={c.id} onClick={() => setChainId(c.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                chainId === c.id
                                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                                    : 'text-surface-200/50 hover:bg-white/5 border border-transparent'
                            }`}>
                            {c.icon} {c.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 mt-3">
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                        placeholder={t('dashboard.tokenLookupPage.placeholder')}
                        className="flex-1 bg-surface-800/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-surface-100 placeholder-surface-200/30 focus:outline-none focus:border-brand-400/50 font-mono"
                    />
                    <button onClick={handleSearch} disabled={loading || !query.trim()}
                        className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                            loading || !query.trim()
                                ? 'bg-surface-800/40 text-surface-200/20 cursor-not-allowed'
                                : 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                        }`}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        Search
                    </button>
                </div>
                {/* Auto-detect indicator */}
                {autoDetecting && (
                    <p className="text-[10px] text-brand-400 mt-2 flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> Auto-detecting chain...
                    </p>
                )}
                {detectedChain && (
                    <p className="text-[10px] text-emerald-400 mt-2 flex items-center gap-1">
                        <CheckCircle size={10} /> Detected: {detectedChain.icon} {detectedChain.label}
                    </p>
                )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedToken && (
                <div className="glass-card p-4 space-y-1">
                    <p className="text-xs text-surface-200/40 mb-2 font-medium">
                        Found {searchResults.length} token{searchResults.length !== 1 ? 's' : ''}
                    </p>
                    {searchResults.slice(0, 20).map((tkn, i) => (
                        <button key={i} onClick={() => selectToken(tkn)}
                            className="w-full text-left px-3 py-3 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 border border-transparent hover:border-white/5">
                            {tkn.logoUrl || tkn.tokenLogoUrl ? (
                                <img src={tkn.logoUrl || tkn.tokenLogoUrl} alt="" className="w-8 h-8 rounded-full bg-surface-800" onError={e => { e.target.style.display = 'none'; }} />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                                    <Coins size={14} className="text-purple-400" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-semibold text-surface-100">{tkn.tokenSymbol || tkn.symbol || '?'}</span>
                                <span className="text-xs text-surface-200/40 ml-2">{tkn.tokenName || tkn.name || ''}</span>
                                <span className="block text-[10px] text-surface-200/25 font-mono truncate">{tkn.tokenContractAddress || tkn.address || ''}</span>
                            </div>
                            {tkn.price && <span className="text-xs text-surface-200/60 font-mono">{formatPrice(tkn.price)}</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* Token Detail */}
            {selectedToken && (
                <div className="space-y-4">
                    {searchResults.length > 0 && (
                        <button onClick={() => { setSelectedToken(null); setTokenInfo(null); setHolders(null); setCandles(null); setTrades(null); }}
                            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                            ← Back to results
                        </button>
                    )}

                    {loadingInfo ? (
                        <div className="glass-card p-8 flex items-center justify-center gap-3">
                            <Loader2 size={20} className="animate-spin text-brand-400" />
                            <span className="text-sm text-surface-200/50">{t('dashboard.tokenLookupPage.loading')}</span>
                        </div>
                    ) : tokenInfo ? (
                        <>
                            {/* ═══ Token Header ═══ */}
                            <div className="glass-card p-5">
                                <div className="flex items-start gap-4">
                                    {tokenInfo.logoUrl || tokenInfo.tokenLogoUrl ? (
                                        <img src={tokenInfo.logoUrl || tokenInfo.tokenLogoUrl} alt="" className="w-12 h-12 rounded-full ring-2 ring-white/10" onError={e => { e.target.style.display = 'none'; }} />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white text-lg font-bold">
                                            {(tokenInfo.symbol || '?')[0]}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-xl font-bold text-surface-100">
                                                {tokenInfo.tokenSymbol || tokenInfo.symbol || selectedToken.symbol}
                                            </h2>
                                            {/* Tags (Feature 8) */}
                                            {tags.map((tag, i) => (
                                                <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-brand-500/10 text-brand-400 text-[9px] font-semibold">
                                                    <Tag size={8} /> {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <p className="text-xs text-surface-200/40">{tokenInfo.tokenName || tokenInfo.name || selectedToken.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-surface-200/25 font-mono break-all">{address}</span>
                                            <button onClick={() => handleCopy(address)} className="p-0.5 text-surface-200/30 hover:text-brand-400 transition-colors">
                                                {copiedAddr ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-surface-100">{formatPrice(tokenInfo.price || tokenInfo.tokenPrice)}</p>
                                        {priceChange !== undefined && (
                                            <p className={`text-xs font-medium flex items-center gap-1 justify-end ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                {isPositive ? '+' : ''}{Number(priceChange).toFixed(2)}%
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons (Features 3, 5, 6) */}
                                <div className="flex gap-2 mt-4 flex-wrap">
                                    <button onClick={handleToggleFavorite}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                                            isFav ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-white/[0.03] text-surface-200/50 border border-white/[0.06] hover:bg-amber-500/10 hover:text-amber-400'
                                        }`}>
                                        <Star size={13} className={isFav ? 'fill-current' : ''} /> {isFav ? 'Saved' : 'Save'}
                                    </button>
                                    <button onClick={() => setShowAlert(!showAlert)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.03] text-surface-200/50 border border-white/[0.06] hover:bg-purple-500/10 hover:text-purple-400 transition-all">
                                        <Bell size={13} /> Alert
                                    </button>
                                    <button onClick={() => navigate(`/trading?to=${address}&chain=${chainId}`)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-brand-500 to-purple-500 text-white hover:shadow-lg hover:shadow-brand-500/25 transition-all">
                                        <ShoppingCart size={13} /> Buy
                                    </button>
                                    <a href={`https://www.okx.com/web3/explorer/${chainId === '501' ? 'solana' : 'xlayer'}/address/${address}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.03] text-surface-200/50 border border-white/[0.06] hover:text-brand-400 transition-all">
                                        <ExternalLink size={13} /> Explorer
                                    </a>
                                </div>

                                {/* Quick Alert Form (Feature 5) */}
                                {showAlert && (
                                    <div className="mt-3 p-3 rounded-xl bg-surface-800/60 border border-white/5 animate-fadeIn">
                                        <div className="flex gap-2 items-center">
                                            <select value={alertDir} onChange={e => setAlertDir(e.target.value)}
                                                className="bg-surface-800 border border-white/10 rounded-lg px-2 py-2 text-xs text-surface-100">
                                                <option value="above">Price above ↑</option>
                                                <option value="below">Price below ↓</option>
                                            </select>
                                            <input type="number" value={alertPrice} onChange={e => setAlertPrice(e.target.value)}
                                                step="any" placeholder="Target price (USD)"
                                                className="flex-1 bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder-surface-200/30 font-mono" />
                                            <button onClick={handleCreateAlert} disabled={alertSaving || !alertPrice}
                                                className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 transition-all">
                                                {alertSaving ? <Loader2 size={12} className="animate-spin" /> : 'Set'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ═══ Stats Grid ═══ */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <StatCard icon={BarChart3} label="Market Cap" value={`$${formatNumber(tokenInfo.marketCap || tokenInfo.totalMarketCap)}`} color="text-blue-400" bg="bg-blue-400/10" />
                                <StatCard icon={Droplets} label="Liquidity" value={`$${formatNumber(tokenInfo.liquidity || tokenInfo.totalLiquidity)}`} color="text-cyan-400" bg="bg-cyan-400/10" />
                                <StatCard icon={Activity} label="Volume 24h" value={`$${formatNumber(tokenInfo.volume24H || tokenInfo.volume24h || tokenInfo.totalVolume24h)}`} color="text-amber-400" bg="bg-amber-400/10" />
                                <StatCard icon={Users} label="Holders" value={holderCount ? Number(holderCount).toLocaleString() : '—'} color="text-purple-400" bg="bg-purple-400/10" />
                            </div>

                            {/* ═══ Mini Price Chart (Feature 1) ═══ */}
                            {candles && candles.length > 1 && (
                                <div className="glass-card p-4 space-y-2">
                                    <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                                        <BarChart3 size={14} className="text-brand-400" /> Price Chart (24h)
                                    </h3>
                                    <SparklineChart data={candles} height={120} />
                                    <div className="flex justify-between text-[10px] text-surface-200/25">
                                        <span>24h ago</span>
                                        <span>Now</span>
                                    </div>
                                </div>
                            )}

                            {/* ═══ Safety Score ═══ */}
                            <div className="glass-card p-5 space-y-3">
                                <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                                    <Shield size={16} className="text-emerald-400" /> Safety Analysis
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <SafetyItem label="Contract verified" status={tokenInfo.isVerified !== false} />
                                    <SafetyItem label="Not a honeypot" status={!tokenInfo.isHoneypot} warn={tokenInfo.isHoneypot} />
                                    <SafetyItem label="Liquidity present" status={Number(tokenInfo.liquidity || tokenInfo.totalLiquidity || 0) > 0} />
                                    <SafetyItem label="Normal tax rates" status={Number(tokenInfo.buyTax || 0) < 10 && Number(tokenInfo.sellTax || 0) < 10} warn={Number(tokenInfo.buyTax || 0) >= 10 || Number(tokenInfo.sellTax || 0) >= 10} />
                                </div>
                                {(tokenInfo.buyTax || tokenInfo.sellTax) && (
                                    <div className="flex gap-4 text-xs text-surface-200/50 mt-2 bg-surface-800/40 rounded-lg px-3 py-2">
                                        <span>Buy Tax: <strong className="text-surface-200/80">{tokenInfo.buyTax || '0'}%</strong></span>
                                        <span>Sell Tax: <strong className="text-surface-200/80">{tokenInfo.sellTax || '0'}%</strong></span>
                                    </div>
                                )}
                            </div>

                            {/* ═══ Recent Trades (Feature 2) ═══ */}
                            {trades && trades.length > 0 && (
                                <div className="glass-card p-5 space-y-3">
                                    <button onClick={() => setShowTrades(!showTrades)} className="w-full flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                                            <ArrowLeftRight size={14} className="text-cyan-400" /> Recent Trades
                                            <span className="text-[10px] text-surface-200/30 font-normal">({trades.length})</span>
                                        </h3>
                                        {showTrades ? <ChevronUp size={14} className="text-surface-200/40" /> : <ChevronDown size={14} className="text-surface-200/40" />}
                                    </button>
                                    {showTrades && (
                                        <div className="space-y-1 animate-fadeIn">
                                            {trades.slice(0, 15).map((tr, i) => {
                                                const isBuy = tr.side === 'buy' || tr.type === 'buy' || tr.tradeType === '1';
                                                const walletAddr = tr.userAddress || tr.makerAddress || tr.takerAddress || '';
                                                const explorerBase = chainId === '501' ? 'https://www.okx.com/web3/explorer/solana/address/' : 'https://www.okx.com/web3/explorer/xlayer/address/';
                                                return (
                                                    <div key={i} className="px-3 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                    {isBuy ? 'BUY' : 'SELL'}
                                                                </span>
                                                                <span className="text-xs text-surface-200/60 font-mono">
                                                                    {formatPrice(tr.price || tr.tradePrice)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[10px] text-surface-200/40">
                                                                    {tr.volume ? `$${formatNumber(tr.volume)}` : tr.amountUsd ? `$${formatNumber(tr.amountUsd)}` : formatNumber(tr.amount || tr.tradeAmount)}
                                                                </span>
                                                                <span className="text-[10px] text-surface-200/25 w-10 text-right">
                                                                    {tr.timestamp || tr.tradeTime ? timeAgo(tr.timestamp || tr.tradeTime) : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {walletAddr && (
                                                            <div className="flex items-center gap-1.5 ml-9">
                                                                <span className="text-[10px] text-surface-200/30 font-mono break-all">{walletAddr}</span>
                                                                <button onClick={() => handleCopy(walletAddr)} className="p-0.5 text-surface-200/20 hover:text-brand-400 transition-colors flex-shrink-0">
                                                                    <Copy size={9} />
                                                                </button>
                                                                <a href={`${explorerBase}${walletAddr}`} target="_blank" rel="noopener noreferrer" className="p-0.5 text-surface-200/20 hover:text-brand-400 transition-colors flex-shrink-0">
                                                                    <ExternalLink size={9} />
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ═══ Advanced Holder Analysis (Features 4) ═══ */}
                            {holders?.data?.length > 0 && (
                                <div className="glass-card p-5 space-y-3">
                                    <button onClick={() => setShowHolders(!showHolders)} className="w-full flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                                            <Users size={16} className="text-purple-400" /> Top Holders
                                            {holderCount && <span className="text-[10px] text-surface-200/30 font-normal">({Number(holderCount).toLocaleString()} total)</span>}
                                        </h3>
                                        {showHolders ? <ChevronUp size={14} className="text-surface-200/40" /> : <ChevronDown size={14} className="text-surface-200/40" />}
                                    </button>
                                    {showHolders && (
                                        <div className="space-y-2 animate-fadeIn">
                                            {/* Bar chart visualization */}
                                            <div className="space-y-1">
                                                {holders.data.slice(0, 10).map((h, i) => {
                                                    const pct = Number(h.holdPercent || h.holdingPercent || 0);
                                                    const isWhale = pct >= 5;
                                                    const pnl = Number(h.totalPnlUsd || 0);
                                                    const holderAddr = h.holderWalletAddress || h.holderAddress || h.address || '';
                                                    const explorerUrl = chainId === '501' ? 'https://www.okx.com/web3/explorer/solana/address/' : 'https://www.okx.com/web3/explorer/xlayer/address/';
                                                    return (
                                                        <div key={i} className="space-y-0.5">
                                                            <div className="flex items-start justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors gap-2">
                                                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                                                    <span className="text-[10px] text-surface-200/30 w-4 text-right mt-0.5 flex-shrink-0">{i + 1}</span>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-[10px] text-surface-200/60 font-mono break-all">
                                                                                {holderAddr}
                                                                            </span>
                                                                            <button onClick={() => handleCopy(holderAddr)} className="p-0.5 text-surface-200/20 hover:text-brand-400 transition-colors flex-shrink-0">
                                                                                <Copy size={9} />
                                                                            </button>
                                                                            <a href={`${explorerUrl}${holderAddr}`} target="_blank" rel="noopener noreferrer" className="p-0.5 text-surface-200/20 hover:text-brand-400 transition-colors flex-shrink-0">
                                                                                <ExternalLink size={9} />
                                                                            </a>
                                                                            {isWhale && (
                                                                                <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold">🐋 WHALE</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                                    {pnl !== 0 && (
                                                                        <span className={`text-[10px] font-medium ${pnl > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                            {pnl > 0 ? '+$' : '-$'}{formatNumber(Math.abs(pnl))}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs text-surface-200/80 font-semibold w-16 text-right">{pct.toFixed(2)}%</span>
                                                                </div>
                                                            </div>
                                                            {/* Bar */}
                                                            <div className="ml-8 mr-2 h-1 rounded-full bg-surface-800/60 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-500 ${isWhale ? 'bg-purple-500/60' : 'bg-brand-500/40'}`}
                                                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="glass-card p-6 text-center">
                            <XCircle size={32} className="text-red-400/50 mx-auto mb-2" />
                            <p className="text-sm text-surface-200/50">Token information not available</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Empty State: History + Favorites (Features 3, 7) ═══ */}
            {!loading && searchResults.length === 0 && !selectedToken && (
                <div className="space-y-4">
                    {/* Search History (Feature 7) */}
                    {history.length > 0 && (
                        <div className="glass-card p-4 space-y-3">
                            <h3 className="text-xs font-bold text-surface-200/50 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock size={12} /> Recent Searches
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {history.map((h, i) => (
                                    <button key={i} onClick={() => { setQuery(h.address); setChainId(h.chainId || '196'); setTimeout(() => handleSearch(), 100); }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-800/40 border border-white/5 hover:border-brand-500/20 hover:bg-surface-800/60 transition-all text-xs">
                                        <span className="font-semibold text-surface-100">{h.symbol}</span>
                                        <span className="text-surface-200/30">{h.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Favorites (Feature 3) */}
                    {favorites.length > 0 && (
                        <div className="glass-card p-4 space-y-3">
                            <h3 className="text-xs font-bold text-surface-200/50 uppercase tracking-widest flex items-center gap-1.5">
                                <Star size={12} className="text-amber-400" /> Favorites
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {favorites.map((f, i) => (
                                    <button key={i} onClick={() => { setQuery(f.address); setChainId(f.chainId || '196'); setTimeout(() => handleSearch(), 100); }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:border-amber-400/30 hover:bg-amber-500/10 transition-all text-xs">
                                        <Star size={10} className="text-amber-400 fill-current" />
                                        <span className="font-semibold text-surface-100">{f.symbol}</span>
                                        <span className="text-surface-200/30">{f.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Default empty state */}
                    <div className="glass-card p-12 text-center space-y-3">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center mx-auto">
                            <Coins size={28} className="text-purple-400/50" />
                        </div>
                        <h3 className="text-sm font-semibold text-surface-200/60">{t('dashboard.tokenLookupPage.searchPrompt')}</h3>
                        <p className="text-[11px] text-surface-200/30 max-w-xs mx-auto">
                            {t('dashboard.tokenLookupPage.searchHint')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════ */
function StatCard({ icon: Icon, label, value, color, bg }) {
    return (
        <div className="glass-card p-3 space-y-1.5">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={14} className={color} />
            </div>
            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-bold text-surface-100">{value}</p>
        </div>
    );
}

function SafetyItem({ label, status, warn }) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800/30">
            {warn ? (
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            ) : status ? (
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            ) : (
                <XCircle size={14} className="text-red-400 flex-shrink-0" />
            )}
            <span className={`text-xs ${warn ? 'text-amber-400/80' : status ? 'text-surface-200/60' : 'text-red-400/80'}`}>{label}</span>
        </div>
    );
}
