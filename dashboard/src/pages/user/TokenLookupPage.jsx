import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Search, Loader2, ExternalLink, Shield, AlertTriangle, CheckCircle,
    Users, Droplets, TrendingUp, TrendingDown, Copy, Check, BarChart3,
    Coins, Activity, XCircle, RefreshCw,
} from 'lucide-react';

const CHAINS = [
    { id: '196', label: 'X Layer', icon: '🔷' },
    { id: '1', label: 'Ethereum', icon: '⟠' },
    { id: '56', label: 'BSC', icon: '🔶' },
    { id: '501', label: 'Solana', icon: '◎' },
    { id: '42161', label: 'Arbitrum', icon: '🔵' },
    { id: '137', label: 'Polygon', icon: '🟣' },
    { id: '8453', label: 'Base', icon: '🔵' },
];

function formatNumber(n, decimals = 2) {
    if (!n || isNaN(n)) return '0';
    const num = Number(n);
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
}

function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
}

export default function TokenLookupPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [chainId, setChainId] = useState('196');
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [selectedToken, setSelectedToken] = useState(null);
    const [tokenInfo, setTokenInfo] = useState(null);
    const [holders, setHolders] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [copiedAddr, setCopiedAddr] = useState(false);

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setSelectedToken(null);
        setTokenInfo(null);
        setHolders(null);
        try {
            // If it looks like a contract address, use token/info directly
            if (/^0x[a-fA-F0-9]{40}$/i.test(query.trim()) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.trim())) {
                const addr = query.trim();
                const res = await api.request('/market/token/info', {
                    method: 'POST',
                    body: JSON.stringify({ tokens: [{ chainIndex: chainId, tokenContractAddress: addr }] }),
                });
                const basic = res?.basicInfo?.[0] || {};
                const price = res?.priceInfo?.[0] || {};
                const merged = { ...basic, ...price };
                if (merged.tokenSymbol || merged.symbol) {
                    setSelectedToken({ address: addr, tokenContractAddress: addr, symbol: merged.tokenSymbol || merged.symbol || '?', name: merged.tokenName || merged.name || 'Unknown' });
                    setTokenInfo(merged);
                    loadHolders(addr);
                }
            } else {
                // Name search
                const data = await api.request(`/market/token/search?chains=${chainId}&keyword=${encodeURIComponent(query.trim())}`);
                setSearchResults(data?.data || data?.tokens || data || []);
            }
        } catch (err) {
            console.error('Search failed:', err);
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    }, [query, chainId]);

    const loadHolders = async (address) => {
        try {
            const data = await api.request(`/market/token/holders?chainIndex=${chainId}&tokenContractAddress=${address}`);
            setHolders(data);
        } catch { setHolders(null); }
    };

    const selectToken = async (token) => {
        setSelectedToken(token);
        setLoadingInfo(true);
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
            loadHolders(address);
        } catch { setTokenInfo(null); }
        finally { setLoadingInfo(false); }
    };

    const handleCopy = (text) => {
        copyToClipboard(text);
        setCopiedAddr(true);
        setTimeout(() => setCopiedAddr(false), 2000);
    };

    const address = selectedToken?.tokenContractAddress || selectedToken?.address || '';
    const priceChange = tokenInfo?.priceChange24h || tokenInfo?.change24h;
    const isPositive = Number(priceChange) >= 0;

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
                    {/* Chain selector */}
                    <div className="flex gap-1 flex-wrap">
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
                            {tkn.price && <span className="text-xs text-surface-200/60 font-mono">${Number(tkn.price).toFixed(6)}</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* Token Detail */}
            {selectedToken && (
                <div className="space-y-4">
                    {/* Back button */}
                    {searchResults.length > 0 && (
                        <button onClick={() => { setSelectedToken(null); setTokenInfo(null); setHolders(null); }}
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
                            {/* Token Header Card */}
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
                                        <h2 className="text-xl font-bold text-surface-100">
                                            {tokenInfo.tokenSymbol || tokenInfo.symbol || selectedToken.symbol}
                                        </h2>
                                        <p className="text-xs text-surface-200/40">{tokenInfo.tokenName || tokenInfo.name || selectedToken.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-surface-200/25 font-mono truncate max-w-[200px]">{address}</span>
                                            <button onClick={() => handleCopy(address)} className="p-0.5 text-surface-200/30 hover:text-brand-400 transition-colors">
                                                {copiedAddr ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-surface-100">${Number(tokenInfo.price || tokenInfo.tokenPrice || 0).toFixed(6)}</p>
                                        {priceChange !== undefined && (
                                            <p className={`text-xs font-medium flex items-center gap-1 justify-end ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                {isPositive ? '+' : ''}{Number(priceChange).toFixed(2)}%
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <StatCard icon={BarChart3} label="Market Cap" value={`$${formatNumber(tokenInfo.marketCap || tokenInfo.totalMarketCap)}`} color="text-blue-400" bg="bg-blue-400/10" />
                                <StatCard icon={Droplets} label="Liquidity" value={`$${formatNumber(tokenInfo.liquidity || tokenInfo.totalLiquidity)}`} color="text-cyan-400" bg="bg-cyan-400/10" />
                                <StatCard icon={Activity} label="Volume 24h" value={`$${formatNumber(tokenInfo.volume24h || tokenInfo.totalVolume24h)}`} color="text-amber-400" bg="bg-amber-400/10" />
                                <StatCard icon={Users} label="Holders" value={holders?.totalHolder || tokenInfo.totalHolder || tokenInfo.holdersCount || '—'} color="text-purple-400" bg="bg-purple-400/10" />
                            </div>

                            {/* Safety Score */}
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

                            {/* Holders Top List */}
                            {holders?.data?.length > 0 && (
                                <div className="glass-card p-5 space-y-3">
                                    <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                                        <Users size={16} className="text-purple-400" /> Top Holders
                                        {holders.totalHolder && <span className="text-[10px] text-surface-200/30 font-normal">({Number(holders.totalHolder).toLocaleString()} total)</span>}
                                    </h3>
                                    <div className="space-y-1">
                                        {holders.data.slice(0, 10).map((h, i) => (
                                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/3 transition-colors">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-[10px] text-surface-200/30 w-5">{i + 1}</span>
                                                    <span className="text-xs text-surface-200/60 font-mono truncate max-w-[180px]">{h.holderAddress}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs text-surface-200/80 font-medium">{Number(h.holdingPercent || h.percentage || 0).toFixed(2)}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* External Links */}
                            <div className="flex gap-2 flex-wrap">
                                <a href={`https://www.okx.com/web3/explorer/${chainId === '501' ? 'solana' : 'xlayer'}/address/${address}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-800/60 border border-white/5 text-xs text-surface-200/60 hover:text-brand-400 hover:border-brand-500/20 transition-all">
                                    <ExternalLink size={12} /> OKX Explorer
                                </a>
                            </div>
                        </>
                    ) : (
                        <div className="glass-card p-6 text-center">
                            <XCircle size={32} className="text-red-400/50 mx-auto mb-2" />
                            <p className="text-sm text-surface-200/50">Token information not available</p>
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {!loading && searchResults.length === 0 && !selectedToken && (
                <div className="glass-card p-12 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center mx-auto">
                        <Coins size={28} className="text-purple-400/50" />
                    </div>
                    <h3 className="text-sm font-semibold text-surface-200/60">{t('dashboard.tokenLookupPage.searchPrompt')}</h3>
                    <p className="text-[11px] text-surface-200/30 max-w-xs mx-auto">
                        {t('dashboard.tokenLookupPage.searchHint')}
                    </p>
                </div>
            )}
        </div>
    );
}

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
