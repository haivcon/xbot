import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Loader2, RefreshCw, Search, Zap, TrendingUp, TrendingDown,
    Users, BarChart3, Shield, AlertTriangle, ChevronDown, ExternalLink, ArrowLeft,
} from 'lucide-react';

const STAGES = ['MIGRATED', 'MIGRATING', 'NEW'];
const CHAINS = [
    { value: '501', label: 'Solana', emoji: '☀️' },
    { value: '728126428', label: 'Tron', emoji: '⚡' },
];

function formatUSD(n) {
    const num = Number(n || 0);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
}

function RiskBadge({ rugs }) {
    if (rugs > 3) return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400">🔴 HIGH RISK</span>;
    if (rugs > 0) return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-500/20 text-yellow-400">🟡 MEDIUM</span>;
    return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400">🟢 LOW</span>;
}

export default function MemeScannerPage() {
    const { t } = useTranslation();
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState('MIGRATED');
    const [chain, setChain] = useState('501');
    const [selectedToken, setSelectedToken] = useState(null);
    const [detailData, setDetailData] = useState(null);
    const [devData, setDevData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const loadTokens = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.request('/market/meme-scanner', {
                params: { chainIndex: chain, stage, sortBy: 'marketCap', limit: '30' }
            });
            setTokens(data?.tokens || data || []);
        } catch (err) {
            console.error('Failed to load meme tokens:', err);
            setTokens([]);
        } finally {
            setLoading(false);
        }
    }, [chain, stage]);

    const loadTokenDetail = useCallback(async (tokenAddress) => {
        setLoadingDetail(true);
        setSelectedToken(tokenAddress);
        try {
            const [detail, dev] = await Promise.allSettled([
                api.request('/market/meme-detail', { params: { chainIndex: chain, tokenContractAddress: tokenAddress } }),
                api.request('/market/meme-dev', { params: { chainIndex: chain, tokenContractAddress: tokenAddress } }),
            ]);
            setDetailData(detail.status === 'fulfilled' ? detail.value : null);
            setDevData(dev.status === 'fulfilled' ? dev.value : null);
        } catch (err) {
            console.error('Failed to load token detail:', err);
        } finally {
            setLoadingDetail(false);
        }
    }, [chain]);

    useEffect(() => { loadTokens(); }, [loadTokens]);

    const stageEmoji = { 'NEW': '🆕', 'MIGRATING': '🔄', 'MIGRATED': '🚀' };

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-white/5 flex items-center justify-center">
                        <Zap size={20} className="text-orange-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-surface-100">🎯 Meme Token Scanner</h1>
                        <p className="text-xs text-surface-200/40">PumpFun · Moonshot · SunPump</p>
                    </div>
                </div>
                <button onClick={loadTokens} disabled={loading}
                    className="p-2.5 rounded-xl bg-surface-800/60 border border-white/5 hover:border-white/10 text-surface-200/50 hover:text-brand-400 transition-all">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
                {CHAINS.map(c => (
                    <button key={c.value} onClick={() => setChain(c.value)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${chain === c.value
                            ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 font-semibold'
                            : 'bg-surface-800/40 border-white/5 text-surface-200/50 hover:border-white/10'}`}>
                        {c.emoji} {c.label}
                    </button>
                ))}
                <div className="w-px bg-white/10 mx-1" />
                {STAGES.map(s => (
                    <button key={s} onClick={() => setStage(s)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${stage === s
                            ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-semibold'
                            : 'bg-surface-800/40 border-white/5 text-surface-200/50 hover:border-white/10'}`}>
                        {stageEmoji[s]} {s}
                    </button>
                ))}
            </div>

            {/* Token List */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
            ) : tokens.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Zap size={32} className="text-orange-400/30 mx-auto mb-3" />
                    <p className="text-sm text-surface-200/40">No meme tokens found for this filter</p>
                </div>
            ) : (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {tokens.slice(0, 30).map((tok, i) => {
                        const sym = tok.tokenSymbol || '?';
                        const mcap = Number(tok.marketCap || 0);
                        const vol = Number(tok.volume24h || tok.volumeUsd || 0);
                        const holders = tok.holderCount || tok.holders || '?';
                        const progress = tok.progress ? (Number(tok.progress) * 100).toFixed(0) : null;
                        const addr = tok.tokenContractAddress || tok.address || '';

                        return (
                            <button key={i} onClick={() => loadTokenDetail(addr)}
                                className={`glass-card p-4 text-left hover:border-orange-500/30 transition-all group ${selectedToken === addr ? 'border-orange-500/40 ring-1 ring-orange-500/20' : ''}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-surface-200/20 w-4">{i + 1}</span>
                                        <span className="text-sm font-bold text-surface-100 group-hover:text-orange-300 transition-colors">{sym}</span>
                                    </div>
                                    {progress && (
                                        <div className="flex items-center gap-1">
                                            <div className="w-12 h-1.5 rounded-full bg-surface-700/60 overflow-hidden">
                                                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-pink-500" style={{ width: `${Math.min(100, progress)}%` }} />
                                            </div>
                                            <span className="text-[9px] text-surface-200/30">{progress}%</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[10px] text-surface-200/30 mb-2 truncate">{tok.tokenName || sym}</p>
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-surface-200/50">💰 {formatUSD(mcap)}</span>
                                    <span className="text-surface-200/50">📊 {formatUSD(vol)}</span>
                                    <span className="text-surface-200/50">👥 {holders}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Token Detail Modal */}
            {selectedToken && (
                <div className="glass-card p-5 space-y-4 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-pink-500/5">
                    {loadingDetail ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 size={20} className="animate-spin text-orange-400" />
                        </div>
                    ) : (
                        <>
                            {detailData && (() => {
                                const d = Array.isArray(detailData) ? detailData[0] : detailData;
                                const sym = d?.tokenSymbol || '?';
                                const price = Number(d?.price || 0);
                                const mcap = Number(d?.marketCap || 0);
                                return (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-lg font-bold text-surface-100">🎯 {sym}</h3>
                                            <button onClick={() => { setSelectedToken(null); setDetailData(null); setDevData(null); }}
                                                className="flex items-center gap-1.5 text-xs text-surface-200/40 hover:text-brand-400 transition-colors">
                                                <ArrowLeft size={14} /> {t('dashboard.mySpace.back')}</button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="bg-surface-800/40 rounded-lg p-3 text-center">
                                                <p className="text-[10px] text-surface-200/40">Price</p>
                                                <p className="text-sm font-bold text-surface-100">${price < 0.001 ? price.toFixed(8) : price.toFixed(6)}</p>
                                            </div>
                                            <div className="bg-surface-800/40 rounded-lg p-3 text-center">
                                                <p className="text-[10px] text-surface-200/40">Market Cap</p>
                                                <p className="text-sm font-bold text-surface-100">{formatUSD(mcap)}</p>
                                            </div>
                                            <div className="bg-surface-800/40 rounded-lg p-3 text-center">
                                                <p className="text-[10px] text-surface-200/40">Holders</p>
                                                <p className="text-sm font-bold text-surface-100">{d?.holderCount || d?.holders || '?'}</p>
                                            </div>
                                            <div className="bg-surface-800/40 rounded-lg p-3 text-center">
                                                <p className="text-[10px] text-surface-200/40">Progress</p>
                                                <p className="text-sm font-bold text-surface-100">{d?.progress ? (Number(d.progress) * 100).toFixed(1) + '%' : 'N/A'}</p>
                                            </div>
                                        </div>
                                        {d?.description && (
                                            <p className="text-xs text-surface-200/40 mt-3 italic">📝 {d.description.slice(0, 300)}</p>
                                        )}
                                    </div>
                                );
                            })()}

                            {devData && (() => {
                                const dev = Array.isArray(devData) ? devData[0] : devData;
                                const rugs = dev?.rugPullCount || dev?.rugs || 0;
                                const total = dev?.totalTokensCreated || dev?.tokenCount || 0;
                                return (
                                    <div className="border-t border-white/5 pt-3">
                                        <h4 className="text-sm font-bold text-surface-100 mb-2 flex items-center gap-2">
                                            <Shield size={14} className="text-orange-400" /> Developer Reputation
                                        </h4>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <RiskBadge rugs={rugs} />
                                            <span className="text-xs text-surface-200/50">📦 {total} tokens created</span>
                                            <span className="text-xs text-surface-200/50">⚠️ {rugs} rug(s)</span>
                                            {dev?.migratedCount && <span className="text-xs text-surface-200/50">✅ {dev.migratedCount} migrated</span>}
                                        </div>
                                        {rugs > 0 && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                                                <AlertTriangle size={12} /> {t('dashboard.memeScanner.rugWarning', { count: rugs })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
