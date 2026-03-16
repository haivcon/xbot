/**
 * AI Auto-Trade Agent Page — BETA
 * Full-page version of the AI Trader panel (accessible from sidebar)
 * All strings are i18n-ready via dashboard.aiTraderPage.*
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, TrendingUp, Shield, Zap, Target, DollarSign, Pause, Play, Power, Check, XCircle, AlertTriangle, Activity, ChevronDown, ChevronUp, RefreshCw, BarChart3, Layers, Clock, BookOpen, Search, Plus, X, ArrowRight, ArrowLeft, Sparkles, Eye, Info } from 'lucide-react';
import api from '@/api/client';

const CHAIN_OPTIONS = [
    { id: '196', label: 'XLayer', icon: '⛓' },
    { id: '1', label: 'Ethereum', icon: '🔷' },
    { id: '56', label: 'BSC', icon: '🟡' },
    { id: '501', label: 'Solana', icon: '🟣' },
    { id: '137', label: 'Polygon', icon: '🟪' },
    { id: '42161', label: 'Arbitrum', icon: '🔵' },
];

const TOKEN_POOL = {
    '196': [
        { symbol: 'WOKB', name: 'Wrapped OKB', icon: '🔶' },
        { symbol: 'OKB', name: 'OKB Token', icon: '🟠' },
        { symbol: 'WETH', name: 'Wrapped ETH', icon: '💎' },
        { symbol: 'USDT', name: 'Tether USD', icon: '💵' },
        { symbol: 'USDC', name: 'USD Coin', icon: '🪙' },
        { symbol: 'DAI', name: 'Dai Stablecoin', icon: '📀' },
        { symbol: 'XLAYER', name: 'XLayer Token', icon: '⛓' },
        { symbol: 'OKSWAP', name: 'OKSwap', icon: '🔄' },
        { symbol: 'xSUSHI', name: 'XLayer Sushi', icon: '🍣' },
        { symbol: 'XDAO', name: 'XLayer DAO', icon: '🏛' },
        { symbol: 'XNFT', name: 'XLayer NFT', icon: '🖼' },
        { symbol: 'xBRIDGE', name: 'XBridge', icon: '🌉' },
    ],
    '1': [
        { symbol: 'WBTC', name: 'Wrapped BTC', icon: '₿' },
        { symbol: 'UNI', name: 'Uniswap', icon: '🦄' },
        { symbol: 'LINK', name: 'Chainlink', icon: '🔗' },
        { symbol: 'AAVE', name: 'Aave', icon: '👻' },
        { symbol: 'PEPE', name: 'Pepe', icon: '🐸' },
        { symbol: 'SHIB', name: 'Shiba Inu', icon: '🐕' },
    ],
    '56': [
        { symbol: 'CAKE', name: 'PancakeSwap', icon: '🥞' },
        { symbol: 'XVS', name: 'Venus', icon: '♀' },
        { symbol: 'BAKE', name: 'BakeryToken', icon: '🍞' },
    ],
    '501': [
        { symbol: 'JUP', name: 'Jupiter', icon: '🪐' },
        { symbol: 'RAY', name: 'Raydium', icon: '☀' },
        { symbol: 'BONK', name: 'Bonk', icon: '🐶' },
    ],
    '137': [
        { symbol: 'MATIC', name: 'Polygon', icon: '🟪' },
        { symbol: 'QUICK', name: 'QuickSwap', icon: '⚡' },
    ],
    '42161': [
        { symbol: 'ARB', name: 'Arbitrum', icon: '🔵' },
        { symbol: 'GMX', name: 'GMX', icon: '📉' },
        { symbol: 'MAGIC', name: 'Magic', icon: '✨' },
    ],
};


const STATUS_COLORS = {
    pending: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    approved: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    executed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
    failed: 'text-red-500 bg-red-500/10 border-red-500/20',
    closed: 'text-surface-200/50 bg-surface-800/30 border-surface-700/20',
};

export default function AiTraderPage() {
    const { t } = useTranslation();
    const p = (key) => t(`dashboard.aiTraderPage.${key}`);

    const [agentStatus, setAgentStatus] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [showSetup, setShowSetup] = useState(false);
    const [setupStep, setSetupStep] = useState(1); // Wizard: 1=Mode, 2=Chain+Token, 3=Risk+Config
    const [expandedPlan, setExpandedPlan] = useState(null);
    const [planFilter, setPlanFilter] = useState('all');
    const [statusMsg, setStatusMsg] = useState(null);
    const [positions, setPositions] = useState([]);
    const [showGuide, setShowGuide] = useState(false);
    const [wallets, setWallets] = useState([]);
    const [selectedWalletId, setSelectedWalletId] = useState(null);

    // Onboarding tour
    const [tourStep, setTourStep] = useState(0);
    const [showTour, setShowTour] = useState(() => !localStorage.getItem('ai_trader_tour_done'));

    // Setup form
    const [budget, setBudget] = useState(100);
    const [maxPerTrade, setMaxPerTrade] = useState(10);
    const [profitTarget, setProfitTarget] = useState(25);
    const [stopLoss, setStopLoss] = useState(20);
    const [riskLevel, setRiskLevel] = useState('moderate');
    const [selectedChains, setSelectedChains] = useState(['196']);
    const [autoApprove, setAutoApprove] = useState(false);
    const [paperMode, setPaperMode] = useState(true); // Default paper mode ON
    const [selectedTokens, setSelectedTokens] = useState([]);
    const [customTokens, setCustomTokens] = useState([]);
    const [tokenSearch, setTokenSearch] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [showTokenPanel, setShowTokenPanel] = useState(false);

    // Available tokens = preset pool (filtered by chains) + custom tokens
    const presetTokens = selectedChains.flatMap(chainId => (TOKEN_POOL[chainId] || []).map(t => ({ ...t, chainId, isCustom: false })));
    const availableTokens = [...presetTokens, ...customTokens];
    const filteredTokens = tokenSearch
        ? availableTokens.filter(t => t.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) || t.name.toLowerCase().includes(tokenSearch.toLowerCase()))
        : availableTokens;

    // Search DEX token by address or name
    const searchCustomToken = async () => {
        const q = tokenSearch.trim();
        if (!q || q.length < 2) return;
        setSearchLoading(true);
        try {
            const chain = selectedChains[0] || '196';
            // Try as contract address first
            if (q.startsWith('0x') && q.length >= 40) {
                const data = await api.request('/market/token/info', { method: 'POST', body: JSON.stringify({ address: q, chainIndex: chain }) });
                if (data?.symbol) {
                    const exists = availableTokens.some(t => t.symbol === data.symbol);
                    if (!exists) {
                        const newToken = { symbol: data.symbol, name: data.name || data.symbol, icon: '🔍', chainId: chain, isCustom: true, address: q };
                        setCustomTokens(prev => [...prev, newToken]);
                        setSelectedTokens(prev => [...prev, data.symbol]);
                    }
                }
            } else {
                // Search by name/symbol via API
                const data = await api.request('/market/search', { method: 'POST', body: JSON.stringify({ query: q, chainIndex: chain }) });
                const results = data?.tokens || data?.results || [];
                for (const r of results.slice(0, 5)) {
                    if (r.tokenSymbol && !availableTokens.some(t => t.symbol === r.tokenSymbol)) {
                        setCustomTokens(prev => {
                            if (prev.some(p => p.symbol === r.tokenSymbol)) return prev;
                            return [...prev, { symbol: r.tokenSymbol, name: r.tokenName || r.tokenSymbol, icon: '🔍', chainId: chain, isCustom: true, address: r.tokenContractAddress }];
                        });
                    }
                }
            }
        } catch { /* silent */ }
        setSearchLoading(false);
        setTokenSearch('');
    };

    const RISK_LEVELS = [
        { id: 'conservative', icon: '🛡️', label: p('riskConservative'), desc: p('riskConservativeDesc'), color: 'emerald' },
        { id: 'moderate', icon: '⚖️', label: p('riskModerate'), desc: p('riskModerateDesc'), color: 'amber' },
        { id: 'aggressive', icon: '🔥', label: p('riskAggressive'), desc: p('riskAggressiveDesc'), color: 'red' },
    ];

    const refreshStatus = useCallback(async () => {
        try {
            const data = await api.request('/ai/agent/status');
            setAgentStatus(data);
            if (!data?.enabled && !data?.configured) setShowSetup(true);
        } catch { setAgentStatus(null); }
    }, []);

    const refreshPlans = useCallback(async () => {
        try {
            const filter = planFilter === 'all' ? '' : `?status=${planFilter}`;
            const data = await api.request(`/ai/agent/plans${filter}`);
            setPlans(data?.plans || []);
        } catch { setPlans([]); }
    }, [planFilter]);

    const refreshWallets = useCallback(async () => {
        try {
            const r = await api.request('/market/wallets');
            const list = r?.wallets || [];
            setWallets(list);
            // Auto-select default wallet if none selected
            if (!selectedWalletId && list.length > 0) {
                const def = list.find(w => w.isDefault) || list[0];
                setSelectedWalletId(def.id);
            }
        } catch {}
    }, [selectedWalletId]);

    const refreshPositions = useCallback(async () => {
        try {
            const r = await api.request('/ai/agent/positions');
            setPositions(r?.positions || []);
        } catch {}
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([refreshStatus(), refreshPlans(), refreshWallets(), refreshPositions()]).finally(() => setLoading(false));
        const interval = setInterval(() => { refreshStatus(); refreshPlans(); refreshPositions(); }, 30000);
        return () => clearInterval(interval);
    }, [refreshStatus, refreshPlans, refreshWallets, refreshPositions]);

    const showToast = useCallback((type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg(null), 3500);
    }, []);

    const handleEnable = async () => {
        setActionLoading('enable');
        try {
            await api.request('/ai/agent/enable', {
                method: 'POST',
                body: JSON.stringify({ riskLevel, maxAmountUsd: maxPerTrade, totalBudgetUsd: budget, profitTargetPct: profitTarget, stopLossPct: stopLoss, takeProfitPct: profitTarget, chains: selectedChains.join(','), autoApprove, walletId: selectedWalletId, paperMode, selectedTokens: selectedTokens.length > 0 ? selectedTokens.join(',') : '' }),
            });
            setShowSetup(false);
            setSetupStep(1);
            await refreshStatus();
            showToast('success', '✅ Agent started');
        } catch (err) { showToast('error', `❌ ${err.message || 'Failed to enable agent'}`); }
        setActionLoading(null);
    };

    const handleDisable = async () => {
        setActionLoading('disable');
        try { await api.request('/ai/agent/disable', { method: 'POST' }); await refreshStatus(); await refreshPlans(); showToast('success', '🔴 Agent stopped'); } catch (err) { showToast('error', `❌ ${err.message || 'Failed'}`); }
        setActionLoading(null);
    };

    const handlePause = async (pause) => {
        setActionLoading('pause');
        try { await api.request('/ai/agent/pause', { method: 'POST', body: JSON.stringify({ pause }) }); await refreshStatus(); showToast('success', pause ? '⏸ Paused' : '▶ Resumed'); } catch (err) { showToast('error', `❌ ${err.message || 'Failed'}`); }
        setActionLoading(null);
    };

    const handleApprovePlan = async (planId) => {
        setActionLoading(`approve-${planId}`);
        try { const r = await api.request(`/ai/agent/plans/${planId}/approve`, { method: 'POST' }); await refreshPlans(); await refreshStatus(); showToast(r?.success ? 'success' : 'error', r?.success ? '✅ Approved' : `❌ ${r?.error || 'Failed'}`); } catch (err) { showToast('error', `❌ ${err.message || 'Failed'}`); }
        setActionLoading(null);
    };

    const handleRejectPlan = async (planId) => {
        setActionLoading(`reject-${planId}`);
        try { await api.request(`/ai/agent/plans/${planId}/reject`, { method: 'POST' }); await refreshPlans(); showToast('success', '❌ Rejected'); } catch (err) { showToast('error', `❌ ${err.message || 'Failed'}`); }
        setActionLoading(null);
    };

    const handleClosePosition = async (posId) => {
        setActionLoading(`close-${posId}`);
        try {
            const r = await api.request(`/ai/agent/positions/${posId}/close`, { method: 'POST' });
            await refreshPositions(); await refreshStatus();
            showToast(r?.success ? 'success' : 'error', r?.success ? `✅ Closed (PnL: $${r.pnlUsd?.toFixed(2)})` : '❌ Failed');
        } catch (err) { showToast('error', `❌ ${err.message || 'Failed'}`); }
        setActionLoading(null);
    };

    const toggleChain = (id) => {
        setSelectedChains(prev => {
            const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id];
            // Remove tokens from deselected chains
            const removedChains = prev.filter(c => !next.includes(c));
            if (removedChains.length > 0) {
                const tokensToRemove = removedChains.flatMap(c => (TOKEN_POOL[c] || []).map(t => t.symbol));
                setSelectedTokens(st => st.filter(s => !tokensToRemove.includes(s)));
            }
            return next;
        });
    };
    const toggleToken = (symbol) => setSelectedTokens(prev => prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]);
    const selectAllTokens = () => setSelectedTokens(availableTokens.map(t => t.symbol));
    const deselectAllTokens = () => setSelectedTokens([]);

    // Quick Start — 1-click paper mode
    const handleQuickStart = () => {
        setPaperMode(true);
        setRiskLevel('moderate');
        setBudget(100);
        setMaxPerTrade(10);
        setSelectedChains(['196']);
        setStopLoss(20);
        setProfitTarget(25);
        setShowSetup(true);
        setSetupStep(1);
    };

    // Dismiss onboarding tour
    const dismissTour = () => {
        setShowTour(false);
        localStorage.setItem('ai_trader_tour_done', '1');
    };

    const TOUR_STEPS = [
        { title: '👋 Welcome to AI Trader', desc: 'AI automatically scans the market for profitable opportunities and creates trade plans for you.', icon: '🤖' },
        { title: '🔍 Signal Detection', desc: 'Every 90 seconds, the bot scans whale movements, smart money flows, and technical indicators across your selected chains.', icon: '📡' },
        { title: '✅ Approve or Reject', desc: 'When a signal is found, a Trade Plan appears. Review the AI score and reasoning, then Approve or Reject.', icon: '📋' },
        { title: '📈 Track Performance', desc: 'Approved trades are tracked with Stop-Loss and Take-Profit. Monitor your PnL in real-time.', icon: '💹' },
    ];

    // Helper: get risk color
    const getRiskColor = (score) => score >= 70 ? 'emerald' : score >= 50 ? 'amber' : 'red';
    const getRiskLabel = (score) => score >= 70 ? 'Low Risk' : score >= 50 ? 'Medium' : 'High Risk';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Status Toast */}
            {statusMsg && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm text-sm font-medium animate-in slide-in-from-top-2 transition-all ${
                    statusMsg.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border-red-500/30 text-red-400'
                }`}>
                    {statusMsg.text}
                </div>
            )}
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20 flex items-center justify-center">
                        <Bot size={22} className="text-brand-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-surface-100">{p('title')}</h1>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30 uppercase tracking-wider">LIVE</span>
                        </div>
                        <p className="text-xs text-surface-200/50">{p('subtitle')}</p>
                    </div>
                </div>
                <button onClick={() => { refreshStatus(); refreshPlans(); }} className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors">
                    <RefreshCw size={16} />
                </button>
            </div>

            {!agentStatus?.enabled && !showSetup ? (
                /* ── INACTIVE — Welcome ── */
                <div className="space-y-5">
                    {/* Hero Section */}
                    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-brand-500/10 via-purple-500/8 to-indigo-500/10 border border-brand-500/15 p-8 text-center">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_60%)]"></div>
                        <div className="relative z-10 space-y-4">
                            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-brand-500/25 to-purple-500/25 border border-brand-500/25 flex items-center justify-center shadow-lg shadow-brand-500/10">
                                <Bot size={40} className="text-brand-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-surface-100 mb-2">{p('title')}</h2>
                                <p className="text-sm text-surface-200/60 max-w-lg mx-auto leading-relaxed">{p('welcomeDesc')}</p>
                            </div>
                        </div>
                    </div>

                    {/* 8 Feature Cards — 2 rows of 4 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { icon: TrendingUp, label: p('featureSignal'), desc: p('featureSignalDesc'), gradient: 'from-emerald-500/15 to-emerald-600/10', border: 'border-emerald-500/20', iconColor: 'text-emerald-400' },
                            { icon: Shield, label: p('featureRisk'), desc: p('featureRiskDesc'), gradient: 'from-blue-500/15 to-blue-600/10', border: 'border-blue-500/20', iconColor: 'text-blue-400' },
                            { icon: Target, label: p('featureTarget'), desc: p('featureTargetDesc'), gradient: 'from-amber-500/15 to-amber-600/10', border: 'border-amber-500/20', iconColor: 'text-amber-400' },
                            { icon: Activity, label: p('featureChain'), desc: p('featureChainDesc'), gradient: 'from-purple-500/15 to-purple-600/10', border: 'border-purple-500/20', iconColor: 'text-purple-400' },
                            { icon: Shield, label: p('featureTripleBarrier') || 'Triple Barrier', desc: p('featureTripleBarrierDesc') || 'SL / TP / Trailing Stop', gradient: 'from-rose-500/15 to-rose-600/10', border: 'border-rose-500/20', iconColor: 'text-rose-400' },
                            { icon: BarChart3, label: p('featureTechSignals') || 'Tech Analysis', desc: p('featureTechSignalsDesc') || 'BB / MACD / SuperTrend', gradient: 'from-cyan-500/15 to-cyan-600/10', border: 'border-cyan-500/20', iconColor: 'text-cyan-400' },
                            { icon: Layers, label: p('featureVwap') || 'VWAP', desc: p('featureVwapDesc') || 'Smart Order Splitting', gradient: 'from-indigo-500/15 to-indigo-600/10', border: 'border-indigo-500/20', iconColor: 'text-indigo-400' },
                            { icon: Clock, label: p('featureDca') || 'DCA', desc: p('featureDcaDesc') || 'Multi-Level Entry', gradient: 'from-teal-500/15 to-teal-600/10', border: 'border-teal-500/20', iconColor: 'text-teal-400' },
                        ].map((f, i) => (
                            <div key={i} className={`p-4 rounded-xl bg-gradient-to-br ${f.gradient} border ${f.border} text-center hover:scale-[1.02] transition-transform`}>
                                <f.icon size={22} className={`mx-auto ${f.iconColor} mb-2`} />
                                <p className="text-xs font-semibold text-surface-100">{f.label}</p>
                                <p className="text-[10px] text-surface-200/40 mt-0.5">{f.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* Strategy Highlights */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-surface-800/30 border border-surface-700/20 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">🐋</span>
                                <span className="text-xs font-bold text-surface-100">{p('strategyWhale') || 'Whale Tracking'}</span>
                            </div>
                            <p className="text-[10px] text-surface-200/50 leading-relaxed">{p('strategyWhaleDesc') || 'AI scans whale & smart money signals, analyzes token safety, then generates trade proposals.'}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800/30 border border-surface-700/20 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">📊</span>
                                <span className="text-xs font-bold text-surface-100">{p('strategyTech') || 'Technical Analysis'}</span>
                            </div>
                            <p className="text-[10px] text-surface-200/50 leading-relaxed">{p('strategyTechDesc') || 'Bollinger Bands, MACD+BB combo, SuperTrend confirm buy/sell signals with up to +15% AI score boost.'}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800/30 border border-surface-700/20 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">🛡️</span>
                                <span className="text-xs font-bold text-surface-100">{p('strategyExec') || 'Smart Execution'}</span>
                            </div>
                            <p className="text-[10px] text-surface-200/50 leading-relaxed">{p('strategyExecDesc') || 'Triple barrier protection (SL/TP/Trailing), VWAP order splitting, and DCA multi-level entries.'}</p>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-3">
                            <button onClick={() => { setShowSetup(true); setSetupStep(1); }}
                                className="px-8 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold hover:from-brand-400 hover:to-purple-400 transition-all shadow-lg shadow-brand-500/20 inline-flex items-center gap-2 hover:scale-[1.02]">
                                <Zap size={16} /> {p('setupBtn') || 'Setup AI Agent'}
                            </button>
                        </div>
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => setShowGuide(!showGuide)}
                                className="inline-flex items-center gap-1.5 text-xs text-surface-200/50 hover:text-brand-400 transition-colors">
                                <BookOpen size={14} /> {p('guideTitle') || 'User Guide'}
                                {showGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        </div>
                        <p className="text-[10px] text-surface-200/30">Powered by Hummingbot strategies</p>
                    </div>

                    {/* Collapsible Guide */}
                    {showGuide && (
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 overflow-hidden">
                            <div className="p-5 border-b border-surface-700/15">
                                <div className="flex items-center gap-2">
                                    <BookOpen size={18} className="text-brand-400" />
                                    <h3 className="text-sm font-bold text-surface-100">User Guide</h3>
                                </div>
                                <p className="text-[11px] text-surface-200/50 mt-1">How to use the AI Trading Agent</p>
                            </div>
                            <div className="divide-y divide-surface-700/10">
                                {[
                                    { step: '1', icon: '⚙️', title: 'Setup Agent', desc: 'Click "Setup AI Agent" to configure. Choose Paper mode to practice safely.' },
                                    { step: '2', icon: '🎚️', title: 'Configure', desc: 'Select chains, tokens, risk level and budget. Paper mode recommended for beginners.' },
                                    { step: '3', icon: '📡', title: 'Monitor', desc: 'AI scans whale & smart money signals every 90s with technical indicators.' },
                                    { step: '4', icon: '✅', title: 'Review & Approve', desc: 'Trade plans appear with AI score. Approve or Reject each suggestion.' },
                                    { step: '5', icon: '📊', title: 'Track PnL', desc: 'Positions include SL/TP protection. Monitor and close manually if needed.' },
                                ].map((s, i) => (
                                    <div key={i} className="p-4 flex gap-3 hover:bg-white/[0.02] transition-colors">
                                        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/15 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">{s.step}</div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm">{s.icon}</span>
                                                <span className="text-xs font-semibold text-surface-100">{s.title}</span>
                                            </div>
                                            <p className="text-[10px] text-surface-200/50 mt-0.5 leading-relaxed">{s.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : showSetup ? (
                /* ── 3-STEP WIZARD ── */
                <div className="space-y-5">
                    {/* Step Indicator */}
                    <div className="flex items-center justify-center gap-2">
                        {[
                            { n: 1, label: 'Mode' },
                            { n: 2, label: 'Markets' },
                            { n: 3, label: 'Configure' },
                        ].map((s, i) => (
                            <div key={s.n} className="flex items-center gap-2">
                                <button onClick={() => setSetupStep(s.n)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        setupStep === s.n
                                            ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                                            : setupStep > s.n
                                            ? 'bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20'
                                            : 'bg-surface-800/30 text-surface-200/40 border border-surface-700/20'
                                    }`}>
                                    {setupStep > s.n ? <Check size={12} /> : <span>{s.n}</span>}
                                    <span className="hidden sm:inline">{s.label}</span>
                                </button>
                                {i < 2 && <div className={`w-8 h-0.5 rounded ${setupStep > s.n ? 'bg-emerald-500/30' : 'bg-surface-700/30'}`} />}
                            </div>
                        ))}
                    </div>

                    {/* Step Content */}
                    <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-6">
                        {/* ── STEP 1: Trading Mode ── */}
                        {setupStep === 1 && (
                            <div className="space-y-5">
                                <div className="text-center mb-2">
                                    <h3 className="text-sm font-bold text-surface-100">Choose Trading Mode</h3>
                                    <p className="text-[11px] text-surface-200/40 mt-1">How would you like to trade?</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Paper Mode Card */}
                                    <button onClick={() => setPaperMode(true)}
                                        className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.01] ${
                                            paperMode
                                                ? 'border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-2 ring-emerald-500/10'
                                                : 'border-surface-700/30 bg-surface-900/30 hover:border-surface-600/40'
                                        }`}>
                                        {paperMode && <div className="absolute top-3 right-3"><Check size={16} className="text-emerald-400" /></div>}
                                        <div className="text-3xl mb-3">🎮</div>
                                        <h4 className="text-sm font-bold text-surface-100">Paper Trading</h4>
                                        <p className="text-[11px] text-surface-200/50 mt-1 leading-relaxed">Simulate trades without real funds. Perfect for learning and testing strategies.</p>
                                        <div className="mt-3 px-2 py-1 inline-block rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                            <span className="text-[10px] text-emerald-400 font-semibold">✨ Recommended for beginners</span>
                                        </div>
                                    </button>

                                    {/* Live Mode Card */}
                                    <button onClick={() => setPaperMode(false)}
                                        className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.01] ${
                                            !paperMode
                                                ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-600/5 ring-2 ring-amber-500/10'
                                                : 'border-surface-700/30 bg-surface-900/30 hover:border-surface-600/40'
                                        }`}>
                                        {!paperMode && <div className="absolute top-3 right-3"><Check size={16} className="text-amber-400" /></div>}
                                        <div className="text-3xl mb-3">💰</div>
                                        <h4 className="text-sm font-bold text-surface-100">Live Trading</h4>
                                        <p className="text-[11px] text-surface-200/50 mt-1 leading-relaxed">Execute real on-chain trades using funds from your wallet.</p>
                                        <div className="mt-3 px-2 py-1 inline-block rounded-md bg-amber-500/10 border border-amber-500/20">
                                            <span className="text-[10px] text-amber-400 font-semibold">⚠️ Requires wallet & real funds</span>
                                        </div>
                                    </button>
                                </div>

                                {/* Wallet selector only in Live mode */}
                                {!paperMode && (
                                    <div className="rounded-xl bg-surface-900/30 border border-surface-700/20 p-4 space-y-2">
                                        <label className="text-xs font-semibold text-surface-100 flex items-center gap-1">👛 Trading Wallet</label>
                                        {wallets.length === 0 ? (
                                            <p className="text-[10px] text-amber-400">⚠️ No wallet found. Create a wallet in the Wallets tab first.</p>
                                        ) : (
                                            <select value={selectedWalletId || ''} onChange={e => setSelectedWalletId(Number(e.target.value) || null)}
                                                className="w-full px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700/30 text-xs text-surface-100 focus:outline-none focus:border-brand-500/50">
                                                {wallets.map(w => (
                                                    <option key={w.id} value={w.id}>
                                                        {w.walletName ? `${w.walletName} — ` : ''}{w.address?.slice(0,6)}...{w.address?.slice(-4)} {w.isDefault ? '⭐' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── STEP 2: Markets ── */}
                        {setupStep === 2 && (
                            <div className="space-y-5">
                                <div className="text-center mb-2">
                                    <h3 className="text-sm font-bold text-surface-100">Select Markets</h3>
                                    <p className="text-[11px] text-surface-200/40 mt-1">Choose blockchains and tokens to scan</p>
                                </div>

                                {/* Chains */}
                                <div>
                                    <label className="text-xs text-surface-200/60 mb-2 block font-semibold">Blockchains</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {CHAIN_OPTIONS.map(c => (
                                            <button key={c.id} onClick={() => toggleChain(c.id)}
                                                className={`px-3 py-2.5 text-xs rounded-xl border transition-colors flex items-center gap-2 ${
                                                    selectedChains.includes(c.id)
                                                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                                                        : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                                }`}>
                                                <span className="text-base">{c.icon}</span> {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Token Panel (reused) */}
                                <div className="rounded-xl bg-surface-900/20 border border-surface-700/15 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-surface-100">🪙 Tokens ({selectedTokens.length || 'All'})</span>
                                        <div className="flex items-center gap-3">
                                            <button onClick={selectAllTokens} className="text-[10px] text-brand-400/80 hover:text-brand-400 font-medium">Select All</button>
                                            <button onClick={deselectAllTokens} className="text-[10px] text-surface-200/40 hover:text-surface-200/60">Clear</button>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-200/30" />
                                            <input type="text" value={tokenSearch} onChange={e => setTokenSearch(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && searchCustomToken()}
                                                placeholder="Search or paste contract address..."
                                                className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700/30 text-xs text-surface-100 placeholder:text-surface-200/25 focus:outline-none focus:border-brand-500/50" />
                                        </div>
                                        <button onClick={searchCustomToken} disabled={searchLoading || !tokenSearch.trim()}
                                            className="px-3 py-2 rounded-lg bg-brand-500/10 border border-brand-500/25 text-brand-400 text-xs hover:bg-brand-500/20 transition-colors disabled:opacity-40 flex items-center gap-1">
                                            {searchLoading ? <div className="animate-spin h-3 w-3 border-2 border-brand-400 border-t-transparent rounded-full" /> : <Plus size={13} />}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[200px] overflow-y-auto pr-0.5">
                                        {filteredTokens.map(tok => {
                                            const isSelected = selectedTokens.includes(tok.symbol);
                                            return (
                                                <button key={`${tok.chainId}-${tok.symbol}`} onClick={() => toggleToken(tok.symbol)}
                                                    className={`px-2 py-1.5 rounded-lg border transition-all text-left flex items-center gap-1.5 ${
                                                        isSelected
                                                            ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                                                            : 'border-surface-700/15 bg-surface-900/20 text-surface-200/50 hover:border-surface-600/30'
                                                    }`}>
                                                    <span className="text-sm">{tok.icon}</span>
                                                    <span className="text-[10px] font-bold truncate">{tok.symbol}</span>
                                                    {isSelected && <Check size={10} className="text-brand-400 shrink-0 ml-auto" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[9px] text-surface-200/25">Leave empty = scan all tokens. Paste DEX contract address to add custom tokens.</p>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3: Configuration ── */}
                        {setupStep === 3 && (
                            <div className="space-y-5">
                                <div className="text-center mb-2">
                                    <h3 className="text-sm font-bold text-surface-100">Configure Strategy</h3>
                                    <p className="text-[11px] text-surface-200/40 mt-1">Set risk level, budget, and targets</p>
                                </div>

                                {/* Risk Level */}
                                <div>
                                    <label className="text-xs text-surface-200/60 mb-2 block font-semibold">Risk Level</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {RISK_LEVELS.map(r => (
                                            <button key={r.id} onClick={() => setRiskLevel(r.id)}
                                                className={`p-3 rounded-xl border text-center transition-all ${
                                                    riskLevel === r.id
                                                        ? `border-${r.color}-500/50 bg-${r.color}-500/10`
                                                        : 'border-surface-700/30 bg-surface-800/30 hover:border-surface-600/50'
                                                }`}>
                                                <div className="text-xl mb-1">{r.icon}</div>
                                                <div className="text-[11px] font-semibold text-surface-100">{r.label}</div>
                                                <div className="text-[9px] text-surface-200/40 mt-0.5">{r.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Budget + Max per trade */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-surface-200/60 mb-1.5 flex items-center gap-1"><DollarSign size={12} /> Total Budget</label>
                                        <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))}
                                            className="w-full px-3 py-2.5 rounded-lg bg-surface-800/50 border border-surface-700/30 text-sm text-surface-100 focus:border-brand-500/50 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-surface-200/60 mb-1.5 block">Max per Trade</label>
                                        <div className="flex items-center gap-2">
                                            <input type="range" min="1" max="100" value={maxPerTrade} onChange={e => setMaxPerTrade(Number(e.target.value))} className="flex-1 accent-brand-500" />
                                            <span className="text-sm font-mono text-brand-400 w-12 text-right">${maxPerTrade}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Profit Target + Stop Loss */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-surface-200/60 mb-1.5 flex items-center gap-1"><Target size={12} /> Take Profit</label>
                                        <div className="flex items-center gap-1.5">
                                            {[10, 25, 50, 100].map(v => (
                                                <button key={v} onClick={() => setProfitTarget(v)}
                                                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                                                        profitTarget === v ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-semibold' : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                                    }`}>{v}%</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-surface-200/60 mb-1.5 block">Stop Loss</label>
                                        <div className="flex items-center gap-1.5">
                                            {[10, 20, 30, 50].map(v => (
                                                <button key={v} onClick={() => setStopLoss(v)}
                                                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                                                        stopLoss === v ? 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold' : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                                    }`}>{v}%</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Auto Approve */}
                                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-900/30 border border-surface-700/15 cursor-pointer">
                                    <div>
                                        <div className="text-xs font-semibold text-surface-100">Auto Approve</div>
                                        <div className="text-[10px] text-surface-200/40">Execute trades without manual review</div>
                                    </div>
                                    <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="w-5 h-5 accent-brand-500 rounded" />
                                </label>

                                {/* Summary */}
                                <div className="rounded-xl bg-brand-500/5 border border-brand-500/15 p-4">
                                    <h4 className="text-[11px] font-bold text-brand-400 mb-2">📋 Summary</h4>
                                    <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                                        <span className="text-surface-200/40">Mode</span><span className="text-surface-100 text-right">{paperMode ? '🎮 Paper' : '💰 Live'}</span>
                                        <span className="text-surface-200/40">Chains</span><span className="text-surface-100 text-right">{selectedChains.map(c => CHAIN_OPTIONS.find(o => o.id === c)?.label).join(', ')}</span>
                                        <span className="text-surface-200/40">Tokens</span><span className="text-surface-100 text-right">{selectedTokens.length || 'All'}</span>
                                        <span className="text-surface-200/40">Risk</span><span className="text-surface-100 text-right capitalize">{riskLevel}</span>
                                        <span className="text-surface-200/40">Budget</span><span className="text-surface-100 text-right">${budget}</span>
                                        <span className="text-surface-200/40">SL/TP</span><span className="text-surface-100 text-right">-{stopLoss}% / +{profitTarget}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex gap-3">
                        {setupStep > 1 ? (
                            <button onClick={() => setSetupStep(setupStep - 1)}
                                className="flex-1 py-3 rounded-xl border border-surface-700/30 text-surface-200/60 text-sm hover:bg-surface-800/50 transition-colors flex items-center justify-center gap-1.5">
                                <ArrowLeft size={14} /> Back
                            </button>
                        ) : (
                            <button onClick={() => { setShowSetup(false); setSetupStep(1); }}
                                className="flex-1 py-3 rounded-xl border border-surface-700/30 text-surface-200/60 text-sm hover:bg-surface-800/50 transition-colors">
                                Cancel
                            </button>
                        )}

                        {setupStep < 3 ? (
                            <button onClick={() => setSetupStep(setupStep + 1)}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold text-sm hover:from-brand-400 hover:to-purple-400 transition-all flex items-center justify-center gap-1.5">
                                Next <ArrowRight size={14} />
                            </button>
                        ) : (
                            <button onClick={handleEnable} disabled={actionLoading === 'enable' || selectedChains.length === 0 || (!paperMode && wallets.length === 0)}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-brand-500 text-white font-semibold text-sm hover:from-emerald-400 hover:to-brand-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                {actionLoading === 'enable' ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <><Sparkles size={14} /> Start Agent</>}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* ── ACTIVE DASHBOARD ── */
                <div className="space-y-6">
                    {/* Status + PnL Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Status */}
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${agentStatus?.paused ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
                                    <span className="text-sm font-bold text-surface-100">{agentStatus?.paused ? p('paused') : p('running')}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {agentStatus?.paused ? (
                                        <button onClick={() => handlePause(false)} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Play size={14} /></button>
                                    ) : (
                                        <button onClick={() => handlePause(true)} className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"><Pause size={14} /></button>
                                    )}
                                    <button onClick={handleDisable} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"><Power size={14} /></button>
                                    <a href={`/api/ai/agent/export`} download="trade_history.csv"
                                       className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 text-xs" title="Export CSV">📥</a>
                                </div>
                            </div>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between"><span className="text-surface-200/40">{p('risk')}</span><span className="text-surface-100 capitalize">{agentStatus?.riskLevel}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{p('budget')}</span><span className="text-surface-100">${agentStatus?.totalBudgetUsd}</span></div>
                                <div className="flex justify-between"><span className="text-surface-200/40">{p('maxTrade')}</span><span className="text-surface-100">${agentStatus?.maxAmountUsd}</span></div>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-3">
                                {(agentStatus?.chainLabels || []).map((c, i) => (
                                    <span key={i} className="px-2 py-0.5 text-[10px] rounded-lg bg-surface-800/50 text-surface-200/50 border border-surface-700/20">{c}</span>
                                ))}
                            </div>
                        </div>

                        {/* PnL */}
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-5 text-center">
                            <p className="text-xs text-surface-200/40 mb-2">{p('totalPnl')}</p>
                            <p className={`text-3xl font-bold ${(agentStatus?.totalPnlUsd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {(agentStatus?.totalPnlUsd || 0) >= 0 ? '+' : ''}${(agentStatus?.totalPnlUsd || 0).toFixed(2)}
                            </p>
                            <p className="text-xs text-surface-200/40 mt-2">{agentStatus?.totalTrades || 0} {p('trades')}</p>
                        </div>

                        {/* Progress */}
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-5">
                            <p className="text-xs text-surface-200/40 mb-2">{p('profitProgress')}</p>
                            <div className="flex items-end gap-2 mb-3">
                                <span className="text-2xl font-bold text-brand-400">{agentStatus?.profitProgress || 0}%</span>
                                <span className="text-xs text-surface-200/40 mb-1">/ {agentStatus?.profitTargetPct || 25}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-surface-800/60 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-500"
                                    style={{ width: `${Math.min(100, agentStatus?.profitProgress || 0)}%` }} />
                            </div>
                            <div className="flex items-center gap-1.5 mt-3">
                                <span className={`text-[10px] px-2 py-0.5 rounded-lg ${(agentStatus?.pendingPlans || 0) > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-surface-800/50 text-surface-200/40'}`}>
                                    {agentStatus?.pendingPlans || 0} {p('pending')}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Active Positions — Triple Barrier Engine */}
                    {positions.filter(p => p.status === 'active').length > 0 && (
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-5">
                            <h3 className="text-sm font-bold text-surface-100 mb-4 flex items-center gap-2">
                                <Activity size={14} className="text-brand-400" />
                                {p('activePositions') || 'Active Positions'}
                                <span className="px-1.5 py-0.5 text-[9px] bg-brand-500/15 text-brand-400 rounded-md font-bold">{positions.filter(p => p.status === 'active').length}</span>
                            </h3>
                            <div className="space-y-3">
                                {positions.filter(pos => pos.status === 'active').map(pos => {
                                    const pnlPct = Number(pos.unrealizedPnlPct || 0);
                                    const pnlUsd = Number(pos.unrealizedPnlUsd || 0);
                                    const entryPrice = Number(pos.entryPrice || 0);
                                    const currentPrice = Number(pos.currentPrice || entryPrice);
                                    const slPct = Number(pos.stopLossPct || 15);
                                    const tpPct = Number(pos.takeProfitPct || 30);
                                    // Progress bar: SL=-slPct, Entry=0, TP=+tpPct, current=pnlPct
                                    const totalRange = slPct + tpPct;
                                    const progressPct = Math.max(0, Math.min(100, ((pnlPct + slPct) / totalRange) * 100));

                                    return (
                                        <div key={pos.id} className="rounded-xl bg-surface-900/40 border border-surface-700/15 p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-surface-800/60 flex items-center justify-center text-sm">🪙</div>
                                                    <div>
                                                        <span className="text-sm font-bold text-surface-100">{pos.tokenSymbol}</span>
                                                        <div className="text-[10px] text-surface-200/40">{pos.side?.toUpperCase()} • ${Number(pos.amountUsd).toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-sm font-bold ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                                                    </div>
                                                    <div className={`text-[10px] ${pnlUsd >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                                                        {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* SL / Entry / TP price bar — inspired by hummingbot format_status */}
                                            <div>
                                                <div className="flex justify-between text-[9px] text-surface-200/30 mb-1">
                                                    <span className="text-red-400/60">SL -{slPct}%</span>
                                                    <span className="text-surface-200/40">{p('entryPrice') || 'Entry'}: ${entryPrice.toPrecision(4)}</span>
                                                    <span className="text-emerald-400/60">TP +{tpPct}%</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-surface-800/60 overflow-hidden relative">
                                                    <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500/40 via-surface-600/30 to-emerald-500/40 w-full rounded-full" />
                                                    <div className="absolute inset-y-0 w-1.5 bg-white rounded-full shadow-lg shadow-white/30 transition-all duration-500"
                                                        style={{ left: `calc(${progressPct}% - 3px)` }} />
                                                </div>
                                                <div className="flex justify-between text-[9px] text-surface-200/25 mt-1">
                                                    <span>{p('currentPrice') || 'Current'}: ${currentPrice.toPrecision(4)}</span>
                                                    <span>{pos.lastCheckedAt ? new Date(pos.lastCheckedAt).toLocaleTimeString() : ''}</span>
                                                </div>
                                            </div>

                                            {/* Barrier badges */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    {pos.trailingStopEnabled ? (
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">🔒 Trailing Stop</span>
                                                    ) : null}
                                                    {pos.timeLimitHours > 0 ? (
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">⏰ {pos.timeLimitHours}h</span>
                                                    ) : null}
                                                    {pos.trailingStopTrigger ? (
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">🎯 Lock: {Number(pos.trailingStopTrigger).toFixed(1)}%</span>
                                                    ) : null}
                                                </div>
                                                <button onClick={() => handleClosePosition(pos.id)} disabled={actionLoading === `close-${pos.id}`}
                                                    className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-semibold disabled:opacity-50">
                                                    {actionLoading === `close-${pos.id}` ? '...' : (p('closePosition') || 'Close')}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Activity Timeline ── */}
                    <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-5">
                        <h3 className="text-sm font-bold text-surface-100 mb-3 flex items-center gap-2">
                            <Clock size={14} className="text-brand-400" /> Activity
                        </h3>
                        {/* Live scanning indicator */}
                        {!agentStatus?.paused && (
                            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-brand-500/5 border border-brand-500/10">
                                <div className="animate-spin h-3 w-3 border-2 border-brand-400 border-t-transparent rounded-full" />
                                <span className="text-[11px] text-brand-400">Scanning markets for signals...</span>
                            </div>
                        )}
                        <div className="space-y-1 max-h-[150px] overflow-y-auto">
                            {plans.slice(0, 8).map((plan, i) => {
                                const time = new Date(plan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const icons = { pending: '📋', approved: '✅', executed: '🟢', rejected: '❌', closed: '🟠', failed: '🔴' };
                                const labels = { pending: 'Plan created', approved: 'Approved', executed: 'Executed', rejected: 'Rejected', closed: 'Closed', failed: 'Failed' };
                                return (
                                    <div key={plan.id} className="flex items-center gap-2.5 py-1.5 text-[11px]">
                                        <span className="text-surface-200/30 font-mono w-10 shrink-0 text-right">{time}</span>
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            plan.status === 'executed' ? 'bg-emerald-400' : plan.status === 'pending' ? 'bg-amber-400' : plan.status === 'rejected' ? 'bg-red-400' : 'bg-surface-200/30'
                                        }`} />
                                        <span className="text-surface-200/60">{icons[plan.status] || '📝'} {labels[plan.status] || plan.status}: <span className="text-surface-100 font-semibold">{plan.tokenSymbol}</span> ${plan.suggestedAmountUsd}</span>
                                    </div>
                                );
                            })}
                            {plans.length === 0 && (
                                <p className="text-[11px] text-surface-200/30 py-2">No activity yet. Agent is scanning for signals...</p>
                            )}
                        </div>
                    </div>

                    {/* Trade Plans */}
                    <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-surface-100">{p('tradePlans')}</h3>
                            <div className="flex items-center gap-1">
                                {['all', 'pending', 'executed', 'rejected'].map(f => (
                                    <button key={f} onClick={() => setPlanFilter(f)}
                                        className={`px-2.5 py-1 text-[10px] rounded-lg transition-colors ${
                                            planFilter === f ? 'bg-brand-500/15 text-brand-400 font-semibold' : 'text-surface-200/50 hover:text-surface-200/70 hover:bg-white/5'
                                        }`}>{f === 'all' ? p('all') : f === 'pending' ? p('filterPending') : f === 'executed' ? p('filterExecuted') : p('filterRejected')}</button>
                                ))}
                            </div>
                        </div>

                        {plans.length === 0 ? (
                            <div className="text-center py-12">
                                <Activity size={28} className="mx-auto text-surface-200/20 mb-3" />
                                <p className="text-sm text-surface-200/40">{p('noPlans')}</p>
                                <p className="text-xs text-surface-200/30 mt-1">{p('scanning')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {plans.map(plan => {
                                    const riskColor = getRiskColor(plan.aiScore);
                                    const signalBadges = { whale: { icon: '🐋', label: 'Whale' }, smart_money: { icon: '🧠', label: 'Smart $' }, bollinger: { icon: '📊', label: 'BB' }, macd_bb: { icon: '📈', label: 'MACD' }, supertrend: { icon: '🔄', label: 'Trend' }, kol: { icon: '⭐', label: 'KOL' } };
                                    return (
                                    <div key={plan.id} className="rounded-xl bg-surface-900/40 border border-surface-700/15 overflow-hidden hover:border-surface-600/30 transition-colors">
                                        {/* Risk color bar */}
                                        <div className={`h-0.5 bg-${riskColor}-500`} />

                                        <div className="p-3.5">
                                            {/* Header */}
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-9 h-9 rounded-lg bg-${riskColor}-500/10 border border-${riskColor}-500/20 flex items-center justify-center text-base shrink-0`}>🪙</div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-surface-100">{plan.tokenSymbol}</span>
                                                            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${STATUS_COLORS[plan.status] || ''}`}>{plan.status?.toUpperCase()}</span>
                                                            <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded bg-${riskColor}-500/10 text-${riskColor}-400`}>{getRiskLabel(plan.aiScore)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-surface-200/40 mt-0.5">
                                                            <span>{plan.chainLabel}</span>
                                                            <span>•</span>
                                                            <span className={`font-bold text-${riskColor}-400`}>{plan.aiScore}/100</span>
                                                            <span>•</span>
                                                            {(plan.signalSource || 'whale').split(',').map((src, i) => {
                                                                const b = signalBadges[src.trim()];
                                                                return b ? <span key={i} className="inline-flex items-center gap-0.5 px-1 rounded bg-surface-800/50 text-[8px]">{b.icon} {b.label}</span> : null;
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-mono text-surface-100">${plan.suggestedAmountUsd}</span>
                                                    <div className="text-[9px] text-surface-200/30">{new Date(plan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </div>
                                            </div>

                                            {/* AI Reason — always visible */}
                                            <div className="p-2.5 rounded-lg bg-brand-500/5 border border-brand-500/10 mb-2">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <Eye size={10} className="text-brand-400/60" />
                                                    <span className="text-[10px] text-brand-400/60 font-semibold">AI Analysis</span>
                                                </div>
                                                <p className="text-[11px] text-surface-200/60 leading-relaxed">{plan.aiReason || 'Signal detected — click to see details'}</p>
                                            </div>

                                            {/* Expandable details */}
                                            <button onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                                                className="text-[10px] text-surface-200/30 hover:text-surface-200/50 transition-colors flex items-center gap-1 mb-2">
                                                {expandedPlan === plan.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                {expandedPlan === plan.id ? 'Hide details' : 'Show details'}
                                            </button>

                                            {expandedPlan === plan.id && (
                                                <div className="grid grid-cols-4 gap-3 text-[11px] mb-2 p-2 rounded-lg bg-surface-800/30">
                                                    <div><span className="text-surface-200/40 block">Price</span><span className="text-surface-100 font-mono">${Number(plan.tokenPrice || 0).toPrecision(4)}</span></div>
                                                    <div><span className="text-surface-200/40 block">Target</span><span className="text-emerald-400 font-semibold">+{plan.targetPct}%</span></div>
                                                    <div><span className="text-surface-200/40 block">Stop Loss</span><span className="text-red-400 font-semibold">-{plan.stopLossPct}%</span></div>
                                                    <div><span className="text-surface-200/40 block">AI Score</span><span className={`font-bold text-${riskColor}-400`}>{plan.aiScore}/100</span></div>
                                                </div>
                                            )}

                                            {/* Approve/Reject — always visible for pending */}
                                            {plan.status === 'pending' && (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleRejectPlan(plan.id)} disabled={actionLoading === `reject-${plan.id}`}
                                                        className="flex-1 py-2.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                        <XCircle size={14} /> Reject
                                                    </button>
                                                    <button onClick={() => handleApprovePlan(plan.id)} disabled={actionLoading === `approve-${plan.id}`}
                                                        className="flex-1 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition flex items-center justify-center gap-1.5 disabled:opacity-50 border border-emerald-500/20">
                                                        {actionLoading === `approve-${plan.id}` ? <div className="animate-spin h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full" /> : <><Check size={14} /> Approve</>}
                                                    </button>
                                                </div>
                                            )}
                                            {(plan.status === 'executed' || plan.status === 'closed') && (
                                                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40">
                                                    <span className="text-[10px] text-surface-200/40">PnL</span>
                                                    <span className={`text-sm font-bold ${(plan.pnlUsd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {(plan.pnlUsd || 0) >= 0 ? '+' : ''}${(plan.pnlUsd || 0).toFixed(2)} ({(plan.pnlPct || 0).toFixed(1)}%)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <button onClick={() => { setShowSetup(true); setSetupStep(1); }} className="text-xs text-surface-200/40 hover:text-brand-400 transition-colors">⚙️ Modify Config</button>
                </div>
            )}

            {/* ── Onboarding Tour Overlay ── */}
            {showTour && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-2xl bg-surface-800 border border-surface-700/30 shadow-2xl overflow-hidden">
                        {/* Tour header */}
                        <div className="p-5 bg-gradient-to-r from-brand-500/10 to-purple-500/10 border-b border-surface-700/20">
                            <div className="text-center">
                                <div className="text-4xl mb-2">{TOUR_STEPS[tourStep]?.icon}</div>
                                <h3 className="text-base font-bold text-surface-100">{TOUR_STEPS[tourStep]?.title}</h3>
                            </div>
                        </div>
                        {/* Tour body */}
                        <div className="p-5">
                            <p className="text-sm text-surface-200/70 leading-relaxed text-center mb-5">{TOUR_STEPS[tourStep]?.desc}</p>
                            {/* Step dots */}
                            <div className="flex items-center justify-center gap-1.5 mb-5">
                                {TOUR_STEPS.map((_, i) => (
                                    <div key={i} className={`w-2 h-2 rounded-full transition-all ${
                                        i === tourStep ? 'bg-brand-400 w-5' : i < tourStep ? 'bg-emerald-400/50' : 'bg-surface-700'
                                    }`} />
                                ))}
                            </div>
                            {/* Tour actions */}
                            <div className="flex gap-3">
                                <button onClick={dismissTour}
                                    className="flex-1 py-2.5 rounded-xl border border-surface-700/30 text-surface-200/50 text-sm hover:bg-surface-800/50 transition-colors">
                                    Skip
                                </button>
                                {tourStep < TOUR_STEPS.length - 1 ? (
                                    <button onClick={() => setTourStep(tourStep + 1)}
                                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-1.5">
                                        Next <ArrowRight size={14} />
                                    </button>
                                ) : (
                                    <button onClick={dismissTour}
                                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-brand-500 text-white font-semibold text-sm flex items-center justify-center gap-1.5">
                                        <Sparkles size={14} /> Get Started
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
