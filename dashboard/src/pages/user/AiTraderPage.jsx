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
        { symbol: 'WOKB', name: 'Wrapped OKB', logoUrl: 'https://static.coinpaprika.com/coin/okb-okb/logo.png' },
        { symbol: 'OKB', name: 'OKB Token', logoUrl: 'https://static.coinpaprika.com/coin/okb-okb/logo.png' },
        { symbol: 'WETH', name: 'Wrapped ETH', logoUrl: 'https://static.coinpaprika.com/coin/eth-ethereum/logo.png' },
        { symbol: 'USDT', name: 'Tether USD', logoUrl: 'https://static.coinpaprika.com/coin/usdt-tether/logo.png' },
        { symbol: 'USDC', name: 'USD Coin', logoUrl: 'https://static.coinpaprika.com/coin/usdc-usd-coin/logo.png' },
    ],
    '1': [
        { symbol: 'WBTC', name: 'Wrapped BTC', logoUrl: 'https://static.coinpaprika.com/coin/wbtc-wrapped-bitcoin/logo.png' },
        { symbol: 'UNI', name: 'Uniswap', logoUrl: 'https://static.coinpaprika.com/coin/uni-uniswap/logo.png' },
        { symbol: 'LINK', name: 'Chainlink', logoUrl: 'https://static.coinpaprika.com/coin/link-chainlink/logo.png' },
        { symbol: 'AAVE', name: 'Aave', logoUrl: 'https://static.coinpaprika.com/coin/aave-new/logo.png' },
        { symbol: 'PEPE', name: 'Pepe', logoUrl: 'https://static.coinpaprika.com/coin/pepe-pepe/logo.png' },
        { symbol: 'SHIB', name: 'Shiba Inu', logoUrl: 'https://static.coinpaprika.com/coin/shib-shiba-inu/logo.png' },
    ],
    '56': [
        { symbol: 'CAKE', name: 'PancakeSwap', logoUrl: 'https://static.coinpaprika.com/coin/cake-pancakeswap/logo.png' },
        { symbol: 'XVS', name: 'Venus', logoUrl: 'https://static.coinpaprika.com/coin/xvs-venus/logo.png' },
        { symbol: 'BAKE', name: 'BakeryToken', logoUrl: 'https://static.coinpaprika.com/coin/bake-bakerytoken/logo.png' },
    ],
    '501': [
        { symbol: 'JUP', name: 'Jupiter', logoUrl: 'https://static.coinpaprika.com/coin/jup-jupiter/logo.png' },
        { symbol: 'RAY', name: 'Raydium', logoUrl: 'https://static.coinpaprika.com/coin/ray-raydium/logo.png' },
        { symbol: 'BONK', name: 'Bonk', logoUrl: 'https://static.coinpaprika.com/coin/bonk-bonk/logo.png' },
    ],
    '137': [
        { symbol: 'MATIC', name: 'Polygon', logoUrl: 'https://static.coinpaprika.com/coin/matic-polygon/logo.png' },
        { symbol: 'QUICK', name: 'QuickSwap', logoUrl: 'https://static.coinpaprika.com/coin/quick-quickswap/logo.png' },
    ],
    '42161': [
        { symbol: 'ARB', name: 'Arbitrum', logoUrl: 'https://static.coinpaprika.com/coin/arb-arbitrum/logo.png' },
        { symbol: 'GMX', name: 'GMX', logoUrl: 'https://static.coinpaprika.com/coin/gmx-gmx/logo.png' },
        { symbol: 'MAGIC', name: 'Magic', logoUrl: 'https://static.coinpaprika.com/coin/magic-magic/logo.png' },
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
    const [planFilter, setPlanFilter] = useState('pending'); // #6 default to pending
    const [showDisableConfirm, setShowDisableConfirm] = useState(false); // #9 confirmation dialog
    const [statusMsg, setStatusMsg] = useState(null);
    const [positions, setPositions] = useState([]);
    const [showGuide, setShowGuide] = useState(false);
    const [wallets, setWallets] = useState([]);
    const [selectedWalletId, setSelectedWalletId] = useState(null);
    const [walletBalances, setWalletBalances] = useState({}); // { walletId: '123.45' }
    const [refreshingWallet, setRefreshingWallet] = useState(false);

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
    const [aiModel, setAiModel] = useState('auto');
    const [tokenBudgets, setTokenBudgets] = useState({}); // { [symbol]: amountUsd }
    const [customTokens, setCustomTokens] = useState([]);
    const [tokenSearch, setTokenSearch] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [showTokenPanel, setShowTokenPanel] = useState(false);
    const [searchResults, setSearchResults] = useState([]); // API search results
    const [expandedResult, setExpandedResult] = useState(null); // expanded token detail
    const [walletTokens, setWalletTokens] = useState([]); // tokens in selected wallet

    // Available tokens = wallet tokens (priority) + preset pool (filtered by chains) + custom tokens
    const presetTokens = selectedChains.flatMap(chainId => (TOKEN_POOL[chainId] || []).map(t => ({ ...t, chainId, isCustom: false })));
    // Merge: wallet tokens first, then presets that aren't duplicated, then custom tokens
    const allPreset = [...walletTokens, ...presetTokens.filter(pt => !walletTokens.some(wt => wt.symbol.toLowerCase() === pt.symbol.toLowerCase()))];
    const availableTokens = [...allPreset, ...customTokens];
    const filteredTokens = tokenSearch
        ? availableTokens.filter(t => t.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) || t.name.toLowerCase().includes(tokenSearch.toLowerCase()))
        : availableTokens;

    // Debounced auto-search API (like DEX TradingPage)
    useEffect(() => {
        if (!tokenSearch.trim() || tokenSearch.trim().length < 2) { setSearchResults([]); return; }
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const chain = selectedChains[0] || '196';
                const data = await api.searchToken(tokenSearch.trim(), chain);
                const results = data?.data || data?.tokens || [];
                // Filter out tokens that already exist in preset/custom pool
                const newResults = results.filter(r => {
                    const sym = r.tokenSymbol || r.symbol;
                    return sym && !availableTokens.some(t => t.symbol.toLowerCase() === sym.toLowerCase());
                }).slice(0, 8).map(r => ({
                    symbol: r.tokenSymbol || r.symbol,
                    name: r.tokenFullName || r.tokenName || r.tokenSymbol || '',
                    icon: '🔍',
                    chainId: chain,
                    isCustom: true,
                    address: r.tokenContractAddress,
                    logoUrl: r.tokenLogoUrl || '',
                    isSearchResult: true,
                    // Extra detail from API
                    price: r.price || null,
                    marketCap: r.marketCap || null,
                    liquidity: r.liquidity || null,
                    change: r.change || null,
                    holders: r.holders || null,
                }));
                setSearchResults(newResults);
                setExpandedResult(null);
            } catch { setSearchResults([]); }
            setSearchLoading(false);
        }, 400);
        return () => clearTimeout(timer);
    }, [tokenSearch, selectedChains]);

    // Add search result token to custom list and select it
    const addSearchToken = (tok) => {
        if (!customTokens.some(c => c.symbol === tok.symbol)) {
            setCustomTokens(prev => [...prev, { ...tok, isSearchResult: false }]);
        }
        if (!selectedTokens.includes(tok.symbol)) {
            setSelectedTokens(prev => [...prev, tok.symbol]);
        }
        // Clear search after adding
        setSearchResults(prev => prev.filter(r => r.symbol !== tok.symbol));
        setExpandedResult(null);
    };

    const fmtNum = (v) => {
        const n = Number(v);
        if (!n || isNaN(n)) return '-';
        if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
        if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
        if (n >= 1) return `$${n.toFixed(2)}`;
        // Small price — show full decimals, no scientific notation
        const s = n.toFixed(10).replace(/0+$/, '');
        return `$${s}`;
    };

    // Search DEX token by contract address (+ button / Enter — only for 0x addresses)
    const searchCustomToken = async () => {
        const q = tokenSearch.trim();
        if (!q || q.length < 2) return;
        // If it's a contract address, do direct lookup
        if (q.startsWith('0x') && q.length >= 40) {
            setSearchLoading(true);
            try {
                const chain = selectedChains[0] || '196';
                const data = await api.post('/market/token/info', { address: q, chainIndex: chain });
                if (data?.symbol) {
                    const exists = availableTokens.some(t => t.symbol === data.symbol);
                    if (!exists) {
                        const newToken = { symbol: data.symbol, name: data.name || data.symbol, icon: '🔍', chainId: chain, isCustom: true, address: q };
                        setCustomTokens(prev => [...prev, newToken]);
                        setSelectedTokens(prev => [...prev, data.symbol]);
                    }
                }
            } catch { /* silent */ }
            setSearchLoading(false);
            setTokenSearch('');
        }
        // For text search, results are already shown via debounced auto-search above
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
        // #10 Skip positions refresh when in paper mode (no real positions)
        const interval = setInterval(() => {
            refreshStatus(); refreshPlans();
            if (!paperMode) refreshPositions();
        }, 30000);
        return () => clearInterval(interval);
    }, [refreshStatus, refreshPlans, refreshWallets, refreshPositions, paperMode]);

    // Fetch selected wallet balance + tokens (dedicated, with retry)
    useEffect(() => {
        if (!selectedWalletId || paperMode) { setWalletTokens([]); return; }
        const w = wallets.find(w => String(w.id) === String(selectedWalletId));
        if (!w) return;
        const chains = selectedChains.join(',') || '196';
        let cancelled = false;
        const fetchWalletData = async (retries = 2) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    const data = await api.request(`/market/wallets/${w.id}/balance?chainIndex=${chains}`);
                    if (cancelled) return;
                    // Update balance
                    const tv = data?.totalValue || '0';
                    setWalletBalances(prev => ({ ...prev, [w.id]: tv }));
                    // Update wallet tokens
                    const toks = (data?.tokens || []).filter(t => Number(t.balance) > 0).map(t => ({
                        symbol: t.symbol || '?',
                        name: t.symbol || '',
                        logoUrl: t.logoUrl || '',
                        chainId: t.chainIndex || chains,
                        isCustom: false,
                        isWalletToken: true,
                        balance: t.balance || '0',
                        price: t.price || '0',
                        address: t.address || '',
                    }));
                    setWalletTokens(toks);
                    return; // success
                } catch {
                    if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        };
        fetchWalletData();
        return () => { cancelled = true; };
    }, [selectedWalletId, selectedChains, paperMode, wallets]);

    // Fetch other wallets' balances (just for display in wallet cards, no tokens needed)
    useEffect(() => {
        if (wallets.length === 0) return;
        const chains = selectedChains.join(',') || '196';
        wallets.forEach(async (w) => {
            if (String(w.id) === String(selectedWalletId)) return; // already fetched above
            try {
                const data = await api.request(`/market/wallets/${w.id}/balance?chainIndex=${chains}`);
                setWalletBalances(prev => ({ ...prev, [w.id]: data?.totalValue || '0' }));
            } catch { /* silent */ }
        });
    }, [wallets, selectedChains, selectedWalletId]);

    const showToast = useCallback((type, text) => {
        setStatusMsg({ type, text });
        // #8 Longer display for errors so user can read
        setTimeout(() => setStatusMsg(null), type === 'error' ? 6000 : 3500);
    }, []);

    const handleEnable = async () => {
        setActionLoading('enable');
        try {
            await api.request('/ai/agent/enable', {
                method: 'POST',
                // #2 Don't send walletId in paper mode
                body: JSON.stringify({ riskLevel, maxAmountUsd: maxPerTrade, totalBudgetUsd: budget, profitTargetPct: profitTarget, stopLossPct: stopLoss, takeProfitPct: profitTarget, chains: selectedChains.join(','), autoApprove, walletId: paperMode ? null : selectedWalletId, paperMode, selectedTokens: selectedTokens.length > 0 ? selectedTokens.join(',') : '', aiModel, tokenBudgets: Object.keys(tokenBudgets).length > 0 ? JSON.stringify(tokenBudgets) : '' }),
            });
            setShowSetup(false);
            setSetupStep(1);
            await refreshStatus();
            showToast('success', `✅ ${p('agentStarted')}`);
            // #3 Immediate refresh: poll plans after 3s so user sees first scan results quickly
            setTimeout(() => { refreshPlans(); refreshStatus(); }, 3000);
            setTimeout(() => { refreshPlans(); }, 8000);
        } catch (err) { showToast('error', `❌ ${err.message || p('failedEnable')}`); }
        setActionLoading(null);
    };

    // #9 Disable with confirmation dialog
    const handleDisable = async () => {
        setActionLoading('disable');
        try { await api.request('/ai/agent/disable', { method: 'POST' }); await refreshStatus(); await refreshPlans(); showToast('success', `🔴 ${p('agentStopped')}`); } catch (err) { showToast('error', `❌ ${err.message}`); }
        setActionLoading(null);
        setShowDisableConfirm(false);
    };

    const handlePause = async (pause) => {
        setActionLoading('pause');
        try { await api.request('/ai/agent/pause', { method: 'POST', body: JSON.stringify({ pause }) }); await refreshStatus(); showToast('success', pause ? `⏸ ${p('pausedToast')}` : `▶ ${p('resumedToast')}`); } catch (err) { showToast('error', `❌ ${err.message}`); }
        setActionLoading(null);
    };

    const handleApprovePlan = async (planId) => {
        setActionLoading(`approve-${planId}`);
        try { const r = await api.request(`/ai/agent/plans/${planId}/approve`, { method: 'POST' }); await refreshPlans(); await refreshStatus(); showToast(r?.success ? 'success' : 'error', r?.success ? `✅ ${p('approve')}` : `❌ ${r?.error || p('failedEnable')}`); } catch (err) { showToast('error', `❌ ${err.message || p('failedEnable')}`); }
        setActionLoading(null);
    };

    const handleRejectPlan = async (planId) => {
        setActionLoading(`reject-${planId}`);
        try { await api.request(`/ai/agent/plans/${planId}/reject`, { method: 'POST' }); await refreshPlans(); showToast('success', `❌ ${p('reject')}`); } catch (err) { showToast('error', `❌ ${err.message || p('failedEnable')}`); }
        setActionLoading(null);
    };

    const handleClosePosition = async (posId) => {
        setActionLoading(`close-${posId}`);
        try {
            const r = await api.request(`/ai/agent/positions/${posId}/close`, { method: 'POST' });
            await refreshPositions(); await refreshStatus();
            showToast(r?.success ? 'success' : 'error', r?.success ? `✅ ${p('closedPnl')} (PnL: $${r.pnlUsd?.toFixed(2)})` : `❌ ${p('failedEnable')}`);
        } catch (err) { showToast('error', `❌ ${err.message || p('failedEnable')}`); }
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
        { title: p('tourWelcomeTitle'), desc: p('tourWelcomeDesc'), icon: '🤖' },
        { title: p('tourSignalTitle'), desc: p('tourSignalDesc'), icon: '📡' },
        { title: p('tourApproveTitle'), desc: p('tourApproveDesc'), icon: '📋' },
        { title: p('tourTrackTitle'), desc: p('tourTrackDesc'), icon: '💹' },
    ];

    // Helper: get risk color
    const getRiskColor = (score) => score >= 70 ? 'emerald' : score >= 50 ? 'amber' : 'red';
    const getRiskLabel = (score) => score >= 70 ? p('lowRisk') : score >= 50 ? p('mediumRisk') : p('highRisk');

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
            {/* #9 Disable Confirmation Dialog */}
            {showDisableConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-surface-800 border border-surface-700/40 rounded-2xl p-6 max-w-sm mx-4 space-y-4 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                                <Power size={20} className="text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-surface-100">{p('confirmDisableTitle')}</h3>
                                <p className="text-[11px] text-surface-200/50">{p('confirmDisableDesc')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => setShowDisableConfirm(false)}
                                className="px-4 py-2 rounded-lg text-xs font-medium text-surface-200/60 hover:text-surface-100 bg-surface-700/30 hover:bg-surface-700/50 transition-colors">
                                {p('cancel')}
                            </button>
                            <button onClick={handleDisable} disabled={actionLoading === 'disable'}
                                className="px-4 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 transition-colors">
                                {actionLoading === 'disable' ? '...' : p('confirmDisableBtn')}
                            </button>
                        </div>
                    </div>
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
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30 uppercase tracking-wider">{p('betaBadge')}</span>
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
                            { icon: Shield, label: p('featureTripleBarrier'), desc: p('featureTripleBarrierDesc'), gradient: 'from-rose-500/15 to-rose-600/10', border: 'border-rose-500/20', iconColor: 'text-rose-400' },
                            { icon: BarChart3, label: p('featureTechSignals'), desc: p('featureTechSignalsDesc'), gradient: 'from-cyan-500/15 to-cyan-600/10', border: 'border-cyan-500/20', iconColor: 'text-cyan-400' },
                            { icon: Layers, label: p('featureVwap'), desc: p('featureVwapDesc'), gradient: 'from-indigo-500/15 to-indigo-600/10', border: 'border-indigo-500/20', iconColor: 'text-indigo-400' },
                            { icon: Clock, label: p('featureDca'), desc: p('featureDcaDesc'), gradient: 'from-teal-500/15 to-teal-600/10', border: 'border-teal-500/20', iconColor: 'text-teal-400' },
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
                                <span className="text-xs font-bold text-surface-100">{p('strategyWhale')}</span>
                            </div>
                            <p className="text-[10px] text-surface-200/50 leading-relaxed">{p('strategyWhaleDesc')}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800/30 border border-surface-700/20 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">📊</span>
                                <span className="text-xs font-bold text-surface-100">{p('strategyTech')}</span>
                            </div>
                            <p className="text-[10px] text-surface-200/50 leading-relaxed">{p('strategyTechDesc')}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800/30 border border-surface-700/20 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">🛡️</span>
                                <span className="text-xs font-bold text-surface-100">{p('strategyExec')}</span>
                            </div>
                            <p className="text-[10px] text-surface-200/50 leading-relaxed">{p('strategyExecDesc')}</p>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-3">
                            <button onClick={() => { setShowSetup(true); setSetupStep(1); }}
                                className="px-8 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold hover:from-brand-400 hover:to-purple-400 transition-all shadow-lg shadow-brand-500/20 inline-flex items-center gap-2 hover:scale-[1.02]">
                                <Zap size={16} /> {p('setupBtn')}
                            </button>
                        </div>
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => setShowGuide(!showGuide)}
                                className="inline-flex items-center gap-1.5 text-xs text-surface-200/50 hover:text-brand-400 transition-colors">
                                <BookOpen size={14} /> {p('guideTitle')}
                                {showGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        </div>
                        <p className="text-[10px] text-surface-200/30">{p('poweredBy')}</p>
                    </div>

                    {/* Collapsible Guide */}
                    {showGuide && (
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 overflow-hidden">
                            <div className="p-5 border-b border-surface-700/15">
                                <div className="flex items-center gap-2">
                                    <BookOpen size={18} className="text-brand-400" />
                                    <h3 className="text-sm font-bold text-surface-100">{p('guideTitle')}</h3>
                                </div>
                                <p className="text-[11px] text-surface-200/50 mt-1">{p('guideSubtitle')}</p>
                            </div>
                            <div className="divide-y divide-surface-700/10">
                                {[
                                    { step: '1', icon: '⚙️', title: p('guideStep1Title'), desc: p('guideStep1Desc') },
                                    { step: '2', icon: '🎚️', title: p('guideStep2Title'), desc: p('guideStep2Desc') },
                                    { step: '3', icon: '📡', title: p('guideStep3Title'), desc: p('guideStep3Desc') },
                                    { step: '4', icon: '✅', title: p('guideStep4Title'), desc: p('guideStep4Desc') },
                                    { step: '5', icon: '📊', title: p('guideStep5Title'), desc: p('guideStep5Desc') },
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
                            { n: 1, label: p('wizardStepMode') },
                            { n: 2, label: p('wizardStepMarkets') },
                            { n: 3, label: p('wizardStepConfig') },
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
                                    <h3 className="text-sm font-bold text-surface-100">{p('wizardModeTitle')}</h3>
                                    <p className="text-[11px] text-surface-200/40 mt-1">{p('wizardModeSubtitle')}</p>
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
                                        <h4 className="text-sm font-bold text-surface-100">{p('paperMode')}</h4>
                                        <p className="text-[11px] text-surface-200/50 mt-1 leading-relaxed">{p('paperModeDesc')}</p>
                                        <div className="mt-3 px-2 py-1 inline-block rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                            <span className="text-[10px] text-emerald-400 font-semibold">✨ {p('paperRecommended')}</span>
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
                                        <h4 className="text-sm font-bold text-surface-100">{p('liveTrading')}</h4>
                                        <p className="text-[11px] text-surface-200/50 mt-1 leading-relaxed">{p('liveTradingDesc')}</p>
                                        <div className="mt-3 px-2 py-1 inline-block rounded-md bg-amber-500/10 border border-amber-500/20">
                                            <span className="text-[10px] text-amber-400 font-semibold">⚠️ {p('liveRequires')}</span>
                                        </div>
                                    </button>
                                </div>

                                {/* Wallet selector only in Live mode */}
                                {!paperMode && (
                                    <div className="rounded-xl bg-surface-900/30 border border-surface-700/20 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold text-surface-100 flex items-center gap-1">👛 {p('walletLabel')}</label>
                                            <button onClick={async () => {
                                                setRefreshingWallet(true);
                                                const chains = selectedChains.join(',') || '196';
                                                for (const w of wallets) {
                                                    try {
                                                        const data = await api.request(`/market/wallets/${w.id}/balance?chainIndex=${chains}`);
                                                        setWalletBalances(prev => ({ ...prev, [w.id]: data?.totalValue || '0' }));
                                                        if (String(w.id) === String(selectedWalletId)) {
                                                            const toks = (data?.tokens || []).filter(t => Number(t.balance) > 0).map(t => ({
                                                                symbol: t.symbol || '?', name: t.symbol || '', logoUrl: t.logoUrl || '',
                                                                chainId: t.chainIndex || chains, isCustom: false, isWalletToken: true,
                                                                balance: t.balance || '0', price: t.price || '0', address: t.address || '',
                                                            }));
                                                            setWalletTokens(toks);
                                                        }
                                                    } catch {}
                                                }
                                                setRefreshingWallet(false);
                                                }} className="p-1 rounded-md hover:bg-brand-500/10 transition-colors" title={t('common.refresh') || 'Refresh'}>
                                                <RefreshCw size={12} className={`text-surface-200/40 hover:text-brand-400 ${refreshingWallet ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                        {wallets.length === 0 ? (
                                            <p className="text-[10px] text-amber-400">⚠️ {p('noWallet')}</p>
                                        ) : (
                                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                {wallets.map(w => {
                                                    const isSelected = selectedWalletId === w.id;
                                                    const bal = walletBalances[w.id];
                                                    return (
                                                        <button key={w.id} onClick={() => setSelectedWalletId(w.id)}
                                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                                                isSelected
                                                                    ? 'border-brand-500/50 bg-brand-500/5 ring-1 ring-brand-500/10'
                                                                    : 'border-surface-700/20 bg-surface-900/20 hover:border-surface-600/40'
                                                            }`}>
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                                                                isSelected ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-800/50 text-surface-200/40'
                                                            }`}>
                                                                {w.isDefault ? '⭐' : '👛'}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[11px] font-semibold text-surface-100 flex items-center gap-1">
                                                                    {w.walletName || `Wallet`}
                                                                    {w.isDefault && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{p('defaultWallet')}</span>}
                                                                </div>
                                                                <div className="text-[10px] font-mono text-surface-200/40 mt-0.5">
                                                                    {w.address?.slice(0,6)}...{w.address?.slice(-4)}
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <div className="text-[11px] font-bold text-surface-100">
                                                                    {bal !== undefined ? `$${Number(bal).toFixed(2)}` : <div className="animate-pulse w-12 h-3 bg-surface-700/30 rounded" />}
                                                                </div>
                                                                <div className="text-[8px] text-surface-200/30 mt-0.5">{p('balance')}</div>
                                                            </div>
                                                            {isSelected && <Check size={14} className="text-brand-400 shrink-0" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── STEP 2: Markets ── */}
                        {setupStep === 2 && (
                            <div className="space-y-5">
                                <div className="text-center mb-2">
                                    <h3 className="text-sm font-bold text-surface-100">{p('wizardMarketsTitle')}</h3>
                                    <p className="text-[11px] text-surface-200/40 mt-1">{p('wizardMarketsSubtitle')}</p>
                                </div>

                                {/* Chains */}
                                <div>
                                    <label className="text-xs text-surface-200/60 mb-2 block font-semibold">{p('blockchains')}</label>
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

                                {/* Token Panel */}
                                <div className="rounded-xl bg-surface-900/20 border border-surface-700/15 p-4 space-y-3">
                                    {/* Selected wallet display in Step 2 */}
                                    {!paperMode && selectedWalletId && (() => {
                                        const w = wallets.find(w => w.id === selectedWalletId);
                                        if (!w) return null;
                                        const bal = walletBalances[w.id];
                                        return (
                                            <div className="flex items-center gap-2 p-2 rounded-lg bg-brand-500/5 border border-brand-500/15 mb-1">
                                                <div className="w-6 h-6 rounded-md bg-brand-500/15 flex items-center justify-center text-[10px]">👛</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] font-semibold text-surface-100">{w.walletName || 'Wallet'} <span className="font-mono text-surface-200/40">{w.address?.slice(0,6)}...{w.address?.slice(-4)}</span></div>
                                                </div>
                                                {bal !== undefined && <span className="text-[10px] font-bold text-emerald-400">${Number(bal).toFixed(2)}</span>}
                                                <button onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setRefreshingWallet(true);
                                                    const chains = selectedChains.join(',') || '196';
                                                    try {
                                                        const data = await api.request(`/market/wallets/${w.id}/balance?chainIndex=${chains}`);
                                                        setWalletBalances(prev => ({ ...prev, [w.id]: data?.totalValue || '0' }));
                                                        const toks = (data?.tokens || []).filter(t => Number(t.balance) > 0).map(t => ({
                                                            symbol: t.symbol || '?', name: t.symbol || '', logoUrl: t.logoUrl || '',
                                                            chainId: t.chainIndex || chains, isCustom: false, isWalletToken: true,
                                                            balance: t.balance || '0', price: t.price || '0', address: t.address || '',
                                                        }));
                                                        setWalletTokens(toks);
                                                    } catch {}
                                                    setRefreshingWallet(false);
                                                    }} className="p-1 rounded-md hover:bg-brand-500/10 transition-colors" title={t('common.refresh') || 'Refresh'}>
                                                    <RefreshCw size={12} className={`text-brand-400/60 hover:text-brand-400 ${refreshingWallet ? 'animate-spin' : ''}`} />
                                                </button>
                                            </div>
                                        );
                                    })()}

                                    {/* Wallet tokens section */}
                                    {walletTokens.length > 0 && !tokenSearch && (
                                        <div className="mb-2">
                                            <div className="text-[9px] text-surface-200/30 uppercase tracking-wider mb-1.5 font-semibold">💰 {p('walletTokensLabel')} ({walletTokens.length})</div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                                {walletTokens.map(tok => {
                                                    const isSelected = selectedTokens.includes(tok.symbol);
                                                    return (
                                                        <button key={`wt-${tok.chainId}-${tok.symbol}`} onClick={() => toggleToken(tok.symbol)}
                                                            className={`px-2 py-1.5 rounded-lg border transition-all text-left flex items-center gap-1.5 ${
                                                                isSelected
                                                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                                                    : 'border-emerald-500/15 bg-emerald-500/5 text-surface-200/60 hover:border-emerald-500/30'
                                                            }`}>
                                                            {tok.logoUrl
                                                                ? <img src={tok.logoUrl} alt="" width={16} height={16} className="rounded-full shrink-0" onError={e => { e.target.onerror=null; e.target.style.display='none'; }} />
                                                                : <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-500/40 to-teal-500/40 shrink-0 flex items-center justify-center text-[7px] font-bold text-white">{tok.symbol?.[0]}</div>
                                                            }
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[10px] font-bold truncate">{tok.symbol}</div>
                                                                <div className="text-[8px] text-surface-200/30 font-mono">{Number(tok.balance) > 0.001 ? Number(tok.balance).toFixed(3) : '<0.001'}</div>
                                                            </div>
                                                            {isSelected && <Check size={10} className="text-emerald-400 shrink-0 ml-auto" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Preset tokens header */}
                                    {walletTokens.length > 0 && !tokenSearch && (
                                        <div className="text-[9px] text-surface-200/30 uppercase tracking-wider font-semibold">📋 {p('presetTokensLabel')}</div>
                                    )}

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-surface-100">🪙 {p('tokens')} ({selectedTokens.length || p('all')})</span>
                                        <div className="flex items-center gap-3">
                                            <button onClick={selectAllTokens} className="text-[10px] text-brand-400/80 hover:text-brand-400 font-medium">{p('selectAll')}</button>
                                            <button onClick={deselectAllTokens} className="text-[10px] text-surface-200/40 hover:text-surface-200/60">{p('clear')}</button>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-200/30" />
                                            <input type="text" value={tokenSearch} onChange={e => setTokenSearch(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && searchCustomToken()}
                                                placeholder={p('searchPlaceholder')}
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
                                            const hasLogo = tok.logoUrl && tok.logoUrl.length > 0;
                                            return (
                                                <button key={`${tok.chainId}-${tok.symbol}`} onClick={() => toggleToken(tok.symbol)}
                                                    className={`px-2 py-1.5 rounded-lg border transition-all text-left flex items-center gap-1.5 ${
                                                        isSelected
                                                            ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                                                            : 'border-surface-700/15 bg-surface-900/20 text-surface-200/50 hover:border-surface-600/30'
                                                    }`}>
                                                    {hasLogo
                                                        ? <img src={tok.logoUrl} alt="" width={16} height={16} className="rounded-full shrink-0" onError={e => { e.target.onerror=null; e.target.style.display='none'; }} />
                                                        : <div className="w-4 h-4 rounded-full bg-gradient-to-br from-brand-500/40 to-purple-500/40 shrink-0 flex items-center justify-center text-[7px] font-bold text-white">{tok.symbol?.[0]}</div>
                                                    }
                                                    <span className="text-[10px] font-bold truncate">{tok.symbol}</span>
                                                    {isSelected && <Check size={10} className="text-brand-400 shrink-0 ml-auto" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* API Search Results — show on-chain tokens found */}
                                    {searchResults.length > 0 && (
                                        <div className="mt-2 space-y-1.5">
                                            <div className="text-[9px] text-surface-200/30 uppercase tracking-wider font-semibold">🔍 Kết quả tìm kiếm on-chain ({searchResults.length})</div>
                                            {searchResults.map(tok => {
                                                const isExpanded = expandedResult === tok.symbol;
                                                const chg = Number(tok.change);
                                                const chgColor = chg > 0 ? 'text-emerald-400' : chg < 0 ? 'text-red-400' : 'text-surface-200/40';
                                                return (
                                                    <div key={`sr-${tok.chainId}-${tok.symbol}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                                                        <div className="flex items-center gap-2 px-2.5 py-2">
                                                            {tok.logoUrl ? <img src={tok.logoUrl} alt="" width={18} height={18} className="rounded-full shrink-0" onError={e => { e.target.style.display='none'; }} /> : <span className="text-base shrink-0">{tok.icon}</span>}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] font-bold text-surface-100">{tok.symbol}</span>
                                                                    <span className="text-[9px] text-surface-200/30 truncate">{tok.name}</span>
                                                                </div>
                                                                {tok.price && <div className="text-[10px] text-surface-200/60 font-mono">{fmtNum(tok.price)} <span className={`${chgColor} font-semibold`}>{chg > 0 ? '+' : ''}{chg ? chg + '%' : ''}</span></div>}
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setExpandedResult(isExpanded ? null : tok.symbol); }}
                                                                className={`p-1 rounded-md transition-all shrink-0 ${isExpanded ? 'bg-brand-500/15 text-brand-400' : 'text-surface-200/30 hover:text-surface-200/60 hover:bg-white/5'}`}>
                                                                <Info size={12} />
                                                            </button>
                                                            <button onClick={() => addSearchToken(tok)}
                                                                className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/25 transition-all shrink-0 flex items-center gap-1">
                                                                <Plus size={10} /> Thêm
                                                            </button>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="px-2.5 pb-2 pt-0.5 border-t border-emerald-500/10">
                                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
                                                                    <div className="flex justify-between"><span className="text-surface-200/30">Giá</span><span className="text-surface-100 font-mono">{fmtNum(tok.price)}</span></div>
                                                                    <div className="flex justify-between"><span className="text-surface-200/30">24h</span><span className={chgColor}>{chg > 0 ? '+' : ''}{chg ? chg + '%' : '-'}</span></div>
                                                                    <div className="flex justify-between"><span className="text-surface-200/30">Vốn hóa</span><span className="text-surface-100">{fmtNum(tok.marketCap)}</span></div>
                                                                    <div className="flex justify-between"><span className="text-surface-200/30">Thanh khoản</span><span className="text-surface-100">{fmtNum(tok.liquidity)}</span></div>
                                                                    <div className="flex justify-between"><span className="text-surface-200/30">Holders</span><span className="text-surface-100">{tok.holders ? Number(tok.holders).toLocaleString() : '-'}</span></div>
                                                                    <div className="flex justify-between"><span className="text-surface-200/30">Địa chỉ</span><span className="text-surface-100 font-mono">{tok.address?.slice(0,6)}...{tok.address?.slice(-4)}</span></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {tokenSearch.trim().length >= 2 && searchResults.length === 0 && !searchLoading && filteredTokens.length === 0 && (
                                        <p className="text-[10px] text-surface-200/30 text-center py-2">Không tìm thấy token "{tokenSearch}"</p>
                                    )}
                                    <p className="text-[9px] text-surface-200/25">{p('tokenHint')}</p>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3: Configuration ── */}
                        {setupStep === 3 && (
                            <div className="space-y-5">
                                <div className="text-center mb-2">
                                    <h3 className="text-sm font-bold text-surface-100">{p('wizardConfigTitle')}</h3>
                                    <p className="text-[11px] text-surface-200/40 mt-1">{p('wizardConfigSubtitle')}</p>
                                </div>

                                {/* Risk Level */}
                                <div>
                                    <label className="text-xs text-surface-200/60 mb-2 block font-semibold">{p('riskLevel')}</label>
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
                                        <label className="text-xs text-surface-200/60 mb-1.5 flex items-center gap-1"><DollarSign size={12} /> {p('totalBudget')}</label>
                                        <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))}
                                            className="w-full px-3 py-2.5 rounded-lg bg-surface-800/50 border border-surface-700/30 text-sm text-surface-100 focus:border-brand-500/50 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-surface-200/60 mb-1.5 block">{p('maxPerTrade')}</label>
                                        <div className="flex items-center gap-2">
                                            <input type="range" min="1" max="100" value={maxPerTrade} onChange={e => setMaxPerTrade(Number(e.target.value))} className="flex-1 accent-brand-500" />
                                            <span className="text-sm font-mono text-brand-400 w-12 text-right">${maxPerTrade}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Profit Target + Stop Loss */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-surface-200/60 mb-1.5 flex items-center gap-1"><Target size={12} /> {p('takeProfitLabel')}</label>
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
                                        <label className="text-xs text-surface-200/60 mb-1.5 block">{p('stopLossLabel')}</label>
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
                                        <div className="text-xs font-semibold text-surface-100">{p('autoApprove')}</div>
                                        <div className="text-[10px] text-surface-200/40">{p('autoApproveDesc')}</div>
                                    </div>
                                    <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="w-5 h-5 accent-brand-500 rounded" />
                                </label>

                                {/* AI Model Selection */}
                                <div>
                                    <label className="text-xs text-surface-200/60 mb-2 block font-semibold">🤖 Mô hình AI Agent</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'auto', label: 'Auto', icon: '⚡', desc: 'Cân bằng tín hiệu & rủi ro', color: 'brand' },
                                            { id: 'conservative', label: 'Thận trọng', icon: '🛡️', desc: 'Chỉ giao dịch tín hiệu mạnh', color: 'blue' },
                                            { id: 'sniper', label: 'Sniper', icon: '🎯', desc: 'Phản ứng nhanh, ngưỡng thấp', color: 'red' },
                                        ].map(m => (
                                            <button key={m.id} onClick={() => setAiModel(m.id)}
                                                className={`p-2.5 rounded-xl border text-center transition-all ${
                                                    aiModel === m.id
                                                        ? `border-${m.color}-500/50 bg-${m.color}-500/10 ring-1 ring-${m.color}-500/20`
                                                        : 'border-surface-700/30 bg-surface-800/30 hover:border-surface-600/50'
                                                }`}>
                                                <div className="text-lg mb-0.5">{m.icon}</div>
                                                <div className="text-[10px] font-semibold text-surface-100">{m.label}</div>
                                                <div className="text-[8px] text-surface-200/40 mt-0.5 leading-tight">{m.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Token Configuration Panel ── */}
                                {selectedTokens.length > 0 && (
                                    <div className="rounded-xl bg-surface-900/20 border border-surface-700/15 overflow-hidden">
                                        <div className="px-4 py-2.5 bg-surface-800/30 border-b border-surface-700/15 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-surface-100">🪙 Cấu hình token ({selectedTokens.length})</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => {
                                                    const perToken = Math.floor(budget / selectedTokens.length);
                                                    const newBudgets = {};
                                                    selectedTokens.forEach(sym => { newBudgets[sym] = perToken; });
                                                    setTokenBudgets(newBudgets);
                                                }} className="px-2 py-0.5 text-[9px] rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-colors font-semibold">
                                                    ⚡ Chia đều (${Math.floor(budget / selectedTokens.length)}/token)
                                                </button>
                                            </div>
                                        </div>
                                        {/* Header row */}
                                        <div className="grid grid-cols-[1fr_80px_70px_80px_60px_28px] gap-1 px-3 py-1.5 text-[8px] uppercase tracking-wider text-surface-200/30 font-semibold border-b border-surface-700/10">
                                            <span>Token</span>
                                            <span className="text-right">Giá</span>
                                            <span className="text-right">Trong ví</span>
                                            <span className="text-center">Ngân sách</span>
                                            <span className="text-right">Số lượng</span>
                                            <span></span>
                                        </div>
                                        {/* Token rows */}
                                        <div className="divide-y divide-surface-700/10 max-h-[240px] overflow-y-auto">
                                            {selectedTokens.map(sym => {
                                                const tok = availableTokens.find(t => t.symbol === sym);
                                                const wTok = walletTokens.find(t => t.symbol.toUpperCase() === sym.toUpperCase());
                                                const hasLogo = tok?.logoUrl && tok.logoUrl.length > 0;
                                                const price = Number(wTok?.price || tok?.price || 0);
                                                const walBal = Number(wTok?.balance || 0);
                                                const tokBudget = tokenBudgets[sym] ?? Math.floor(budget / selectedTokens.length);
                                                const estQty = price > 0 ? (tokBudget / price) : 0;
                                                return (
                                                    <div key={sym} className="grid grid-cols-[1fr_80px_70px_80px_60px_28px] gap-1 px-3 py-2 items-center hover:bg-white/[0.02] transition-colors">
                                                        {/* Token info */}
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {hasLogo
                                                                ? <img src={tok.logoUrl} alt="" width={20} height={20} className="rounded-full shrink-0" onError={e => { e.target.onerror=null; e.target.style.display='none'; }} />
                                                                : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-500/40 to-purple-500/40 flex items-center justify-center text-[8px] font-bold text-white shrink-0">{sym[0]}</div>
                                                            }
                                                            <div className="min-w-0">
                                                                <div className="text-[11px] font-bold text-surface-100 truncate">{sym}</div>
                                                                {tok?.name && tok.name !== sym && <div className="text-[8px] text-surface-200/30 truncate">{tok.name}</div>}
                                                            </div>
                                                        </div>
                                                        {/* Price */}
                                                        <div className="text-right">
                                                            <div className="text-[10px] font-mono text-surface-100">{price > 0 ? `$${fmtNum(price)}` : '—'}</div>
                                                        </div>
                                                        {/* Wallet balance */}
                                                        <div className="text-right">
                                                            {walBal > 0 ? (
                                                                <div className="text-[10px] font-mono text-emerald-400/80">{walBal > 0.001 ? walBal.toFixed(3) : '<0.001'}</div>
                                                            ) : (
                                                                <div className="text-[9px] text-surface-200/20">—</div>
                                                            )}
                                                        </div>
                                                        {/* Budget input */}
                                                        <div className="flex items-center justify-center">
                                                            <div className="relative">
                                                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-surface-200/30">$</span>
                                                                <input type="number" min="0" step="1"
                                                                    value={tokBudget}
                                                                    onChange={e => setTokenBudgets(prev => ({ ...prev, [sym]: Math.max(0, Number(e.target.value) || 0) }))}
                                                                    className="w-[65px] pl-4 pr-1 py-1 text-[10px] rounded-md bg-surface-800/50 border border-surface-700/30 text-surface-100 text-right focus:border-brand-500/50 focus:outline-none font-mono" />
                                                            </div>
                                                        </div>
                                                        {/* Quantity (auto-calc) */}
                                                        <div className="text-right">
                                                            <div className="text-[10px] font-mono text-brand-400/80">{estQty > 0 ? (estQty > 1 ? estQty.toFixed(2) : estQty.toFixed(6)) : '—'}</div>
                                                        </div>
                                                        {/* Remove */}
                                                        <button onClick={() => {
                                                            setSelectedTokens(prev => prev.filter(s => s !== sym));
                                                            setTokenBudgets(prev => { const n = { ...prev }; delete n[sym]; return n; });
                                                        }} className="p-0.5 rounded hover:bg-red-500/10 text-surface-200/20 hover:text-red-400 transition-colors">
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {/* Footer totals */}
                                        <div className="px-3 py-2 bg-surface-800/20 border-t border-surface-700/15 grid grid-cols-[1fr_80px_70px_80px_60px_28px] gap-1 items-center">
                                            <span className="text-[9px] font-semibold text-surface-200/40">Tổng</span>
                                            <span></span>
                                            <span></span>
                                            <div className="text-center">
                                                {(() => {
                                                    const totalAllocated = selectedTokens.reduce((s, sym) => s + (tokenBudgets[sym] ?? Math.floor(budget / selectedTokens.length)), 0);
                                                    const isOver = totalAllocated > budget;
                                                    return <span className={`text-[10px] font-bold font-mono ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>${totalAllocated}{isOver && ' ⚠️'}</span>;
                                                })()}
                                            </div>
                                            <span></span>
                                            <span></span>
                                        </div>
                                    </div>
                                )}

                                {/* Compact Summary */}
                                <div className="rounded-xl bg-brand-500/5 border border-brand-500/15 p-4">
                                    <h4 className="text-[11px] font-bold text-brand-400 mb-3">📋 {p('summary')}</h4>
                                    <div className="grid grid-cols-2 gap-y-2 text-[11px]">
                                        <span className="text-surface-200/40">{p('mode')}</span><span className="text-surface-100 text-right">{paperMode ? `🎮 ${p('paperMode')}` : `💰 ${p('liveTrading')}`}</span>
                                        <span className="text-surface-200/40">{p('chains')}</span><span className="text-surface-100 text-right">{selectedChains.map(c => CHAIN_OPTIONS.find(o => o.id === c)?.label).join(', ')}</span>
                                        <span className="text-surface-200/40">{p('risk')}</span><span className="text-surface-100 text-right capitalize">{riskLevel}</span>
                                        <span className="text-surface-200/40">{p('budget')}</span><span className="text-surface-100 text-right">${budget}</span>
                                        <span className="text-surface-200/40">{p('stopLossLabel')}/{p('takeProfitLabel')}</span><span className="text-surface-100 text-right">-{stopLoss}% / +{profitTarget}%</span>
                                        <span className="text-surface-200/40">🤖 {p('aiModelLabel')}</span><span className="text-surface-100 text-right capitalize">{aiModel === 'auto' ? '⚡ Auto' : aiModel === 'conservative' ? `🛡️ ${p('riskConservative')}` : '🎯 Sniper'}</span>
                                        {selectedTokens.length > 0 && <><span className="text-surface-200/40">🪙 Token</span><span className="text-surface-100 text-right">{selectedTokens.length} token</span></>}
                                    </div>
                                    {/* #4 Warning when no tokens selected → AI scans ALL */}
                                    {selectedTokens.length === 0 && (
                                        <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                                                <span className="text-[10px] text-amber-400">{p('noTokensWarning')}</span>
                                            </div>
                                        </div>
                                    )}
                                    {/* Wallet info for live mode */}
                                    {!paperMode && selectedWalletId && (
                                        <div className="mt-3 pt-3 border-t border-brand-500/10">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-surface-200/40">👛 {p('walletLabel')}</span>
                                                <span className="text-surface-100 font-mono">
                                                    {(() => { const w = wallets.find(w => w.id === selectedWalletId); return w ? `${w.address?.slice(0,6)}...${w.address?.slice(-4)}` : ''; })()}
                                                    {walletBalances[selectedWalletId] && <span className="ml-1.5 text-emerald-400 font-semibold">(${Number(walletBalances[selectedWalletId]).toFixed(2)})</span>}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex gap-3">
                        {setupStep > 1 ? (
                            <button onClick={() => setSetupStep(setupStep - 1)}
                                className="flex-1 py-3 rounded-xl border border-surface-700/30 text-surface-200/60 text-sm hover:bg-surface-800/50 transition-colors flex items-center justify-center gap-1.5">
                                <ArrowLeft size={14} /> {p('back')}
                            </button>
                        ) : (
                            <button onClick={() => { setShowSetup(false); setSetupStep(1); }}
                                className="flex-1 py-3 rounded-xl border border-surface-700/30 text-surface-200/60 text-sm hover:bg-surface-800/50 transition-colors">
                                {p('cancel')}
                            </button>
                        )}

                        {setupStep < 3 ? (
                            <button onClick={() => setSetupStep(setupStep + 1)}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold text-sm hover:from-brand-400 hover:to-purple-400 transition-all flex items-center justify-center gap-1.5">
                                {p('next')} <ArrowRight size={14} />
                            </button>
                        ) : (
                            <button onClick={handleEnable} disabled={actionLoading === 'enable' || selectedChains.length === 0 || (!paperMode && wallets.length === 0)}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-brand-500 text-white font-semibold text-sm hover:from-emerald-400 hover:to-brand-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                {actionLoading === 'enable' ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <><Sparkles size={14} /> {p('startAgent')}</>}
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
                                    <button onClick={() => setShowDisableConfirm(true)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"><Power size={14} /></button>
                                    <a href={`/api/ai/agent/export`} download="trade_history.csv"
                                       className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 text-xs" title={p('exportCsv')}>📥</a>
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
                                {p('activePositions')}
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
                                                    <span className="text-surface-200/40">{p('entryPrice')}: ${entryPrice.toPrecision(4)}</span>
                                                    <span className="text-emerald-400/60">TP +{tpPct}%</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-surface-800/60 overflow-hidden relative">
                                                    <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500/40 via-surface-600/30 to-emerald-500/40 w-full rounded-full" />
                                                    <div className="absolute inset-y-0 w-1.5 bg-white rounded-full shadow-lg shadow-white/30 transition-all duration-500"
                                                        style={{ left: `calc(${progressPct}% - 3px)` }} />
                                                </div>
                                                <div className="flex justify-between text-[9px] text-surface-200/25 mt-1">
                                                    <span>{p('currentPrice')}: ${currentPrice.toPrecision(4)}</span>
                                                    <span>{pos.lastCheckedAt ? new Date(pos.lastCheckedAt).toLocaleTimeString() : ''}</span>
                                                </div>
                                            </div>

                                            {/* Barrier badges */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    {pos.trailingStopEnabled ? (
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">🔒 {p('trailingStop')}</span>
                                                    ) : null}
                                                    {pos.timeLimitHours > 0 ? (
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">⏰ {pos.timeLimitHours}h</span>
                                                    ) : null}
                                                    {pos.trailingStopTrigger ? (
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">🎯 {p('lockLabel')}: {Number(pos.trailingStopTrigger).toFixed(1)}%</span>
                                                    ) : null}
                                                </div>
                                                <button onClick={() => handleClosePosition(pos.id)} disabled={actionLoading === `close-${pos.id}`}
                                                    className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-semibold disabled:opacity-50">
                                                    {actionLoading === `close-${pos.id}` ? '...' : p('closePosition')}
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
                            <Clock size={14} className="text-brand-400" /> {p('activity')}
                        </h3>
                        {/* Live scanning indicator */}
                        {!agentStatus?.paused && (
                            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-brand-500/5 border border-brand-500/10">
                                <div className="animate-spin h-3 w-3 border-2 border-brand-400 border-t-transparent rounded-full" />
                                <span className="text-[11px] text-brand-400">{p('scanningSignals')}</span>
                            </div>
                        )}
                        <div className="space-y-1 max-h-[150px] overflow-y-auto">
                            {plans.slice(0, 8).map((plan, i) => {
                                const time = new Date(plan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const icons = { pending: '📋', approved: '✅', executed: '🟢', rejected: '❌', closed: '🟠', failed: '🔴' };
                                const labels = { pending: p('planCreated'), approved: p('approve'), executed: p('filterExecuted'), rejected: p('reject'), closed: p('closedPnl'), failed: p('failedEnable') };
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
                                <p className="text-[11px] text-surface-200/30 py-2">{p('noActivityYet')}</p>
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
                                                    <span className="text-[10px] text-brand-400/60 font-semibold">{p('aiAnalysis')}</span>
                                                </div>
                                                <p className="text-[11px] text-surface-200/60 leading-relaxed">{plan.aiReason || p('signalDetected')}</p>
                                            </div>

                                            {/* Expandable details */}
                                            <button onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                                                className="text-[10px] text-surface-200/30 hover:text-surface-200/50 transition-colors flex items-center gap-1 mb-2">
                                                {expandedPlan === plan.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                {expandedPlan === plan.id ? p('hideDetails') : p('showDetails')}
                                            </button>

                                            {expandedPlan === plan.id && (
                                                <div className="grid grid-cols-4 gap-3 text-[11px] mb-2 p-2 rounded-lg bg-surface-800/30">
                                                    <div><span className="text-surface-200/40 block">{p('price')}</span><span className="text-surface-100 font-mono">${Number(plan.tokenPrice || 0).toPrecision(4)}</span></div>
                                                    <div><span className="text-surface-200/40 block">{p('target')}</span><span className="text-emerald-400 font-semibold">+{plan.targetPct}%</span></div>
                                                    <div><span className="text-surface-200/40 block">{p('stopLoss')}</span><span className="text-red-400 font-semibold">-{plan.stopLossPct}%</span></div>
                                                    <div><span className="text-surface-200/40 block">{p('score')}</span><span className={`font-bold text-${riskColor}-400`}>{plan.aiScore}/100</span></div>
                                                </div>
                                            )}

                                            {/* Approve/Reject — always visible for pending */}
                                            {plan.status === 'pending' && (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleRejectPlan(plan.id)} disabled={actionLoading === `reject-${plan.id}`}
                                                        className="flex-1 py-2.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                        <XCircle size={14} /> {p('reject')}
                                                    </button>
                                                    <button onClick={() => handleApprovePlan(plan.id)} disabled={actionLoading === `approve-${plan.id}`}
                                                        className="flex-1 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition flex items-center justify-center gap-1.5 disabled:opacity-50 border border-emerald-500/20">
                                                        {actionLoading === `approve-${plan.id}` ? <div className="animate-spin h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full" /> : <><Check size={14} /> {p('approve')}</>}
                                                    </button>
                                                </div>
                                            )}
                                            {(plan.status === 'executed' || plan.status === 'closed') && (
                                                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40">
                                                    <span className="text-[10px] text-surface-200/40">{p('pnl')}</span>
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

                    <button onClick={() => { setShowSetup(true); setSetupStep(1); }} className="text-xs text-surface-200/40 hover:text-brand-400 transition-colors">⚙️ {p('modifyConfig')}</button>
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
                                    {p('skip')}
                                </button>
                                {tourStep < TOUR_STEPS.length - 1 ? (
                                    <button onClick={() => setTourStep(tourStep + 1)}
                                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-1.5">
                                        {p('next')} <ArrowRight size={14} />
                                    </button>
                                ) : (
                                    <button onClick={dismissTour}
                                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-brand-500 text-white font-semibold text-sm flex items-center justify-center gap-1.5">
                                        <Sparkles size={14} /> {p('getStarted')}
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
