/**
 * AI Auto-Trade Agent Page — BETA
 * Full-page version of the AI Trader panel (accessible from sidebar)
 * All strings are i18n-ready via dashboard.aiTraderPage.*
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, TrendingUp, Shield, Zap, Target, DollarSign, Pause, Play, Power, Check, XCircle, AlertTriangle, Activity, ChevronDown, ChevronUp, RefreshCw, BarChart3, Layers, Clock, BookOpen } from 'lucide-react';
import api from '@/api/client';

const CHAIN_OPTIONS = [
    { id: '196', label: 'XLayer', icon: '⛓' },
    { id: '1', label: 'Ethereum', icon: '🔷' },
    { id: '56', label: 'BSC', icon: '🟡' },
    { id: '501', label: 'Solana', icon: '🟣' },
    { id: '137', label: 'Polygon', icon: '🟪' },
    { id: '42161', label: 'Arbitrum', icon: '🔵' },
];

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
    const [expandedPlan, setExpandedPlan] = useState(null);
    const [planFilter, setPlanFilter] = useState('all');
    const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'error', text }
    const [positions, setPositions] = useState([]);
    const [showGuide, setShowGuide] = useState(false);
    const [wallets, setWallets] = useState([]);
    const [selectedWalletId, setSelectedWalletId] = useState(null);

    // Setup form
    const [budget, setBudget] = useState(100);
    const [maxPerTrade, setMaxPerTrade] = useState(10);
    const [profitTarget, setProfitTarget] = useState(25);
    const [stopLoss, setStopLoss] = useState(20);
    const [riskLevel, setRiskLevel] = useState('moderate');
    const [selectedChains, setSelectedChains] = useState(['196']);
    const [autoApprove, setAutoApprove] = useState(false);
    const [paperMode, setPaperMode] = useState(false);

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
        try { const r = await api.request('/ai/agent/wallets'); setWallets(r?.wallets || []); } catch {}
    }, []);

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
                body: JSON.stringify({ riskLevel, maxAmountUsd: maxPerTrade, totalBudgetUsd: budget, profitTargetPct: profitTarget, stopLossPct: stopLoss, takeProfitPct: profitTarget, chains: selectedChains.join(','), autoApprove, walletId: selectedWalletId, paperMode }),
            });
            setShowSetup(false);
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

    const toggleChain = (id) => setSelectedChains(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

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
                    <div className="text-center space-y-3">
                        <button onClick={() => setShowSetup(true)}
                            className="px-8 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold hover:from-brand-400 hover:to-purple-400 transition-all shadow-lg shadow-brand-500/20 inline-flex items-center gap-2 hover:scale-[1.02]">
                            <Zap size={16} /> {p('setupBtn')}
                        </button>
                        <div>
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
                                    <h3 className="text-sm font-bold text-surface-100">{p('guideTitle') || 'User Guide'}</h3>
                                </div>
                                <p className="text-[11px] text-surface-200/50 mt-1">{p('guideSubtitle') || 'How to use the AI Trading Agent'}</p>
                            </div>
                            <div className="divide-y divide-surface-700/10">
                                {[
                                    { step: '1', icon: '⚙️', title: p('guideStep1Title') || 'Setup Agent', desc: p('guideStep1Desc') || 'Click "Setup AI Agent" to configure your trading preferences. Choose risk level, budget, and target chains.' },
                                    { step: '2', icon: '🎚️', title: p('guideStep2Title') || 'Configure Risk', desc: p('guideStep2Desc') || 'Set Stop-Loss and Take-Profit percentages. Conservative = small trades, low risk. Aggressive = larger trades, higher potential.' },
                                    { step: '3', icon: '📡', title: p('guideStep3Title') || 'Monitor Signals', desc: p('guideStep3Desc') || 'The AI automatically scans whale & smart money signals every 90 seconds, combining with technical indicators (BB, MACD, SuperTrend) for better accuracy.' },
                                    { step: '4', icon: '✅', title: p('guideStep4Title') || 'Review Plans', desc: p('guideStep4Desc') || 'When a good signal is found, a trade plan appears. Review the AI score, token info, and signal sources (🐋📊📈🔄). Then Approve or Reject.' },
                                    { step: '5', icon: '📊', title: p('guideStep5Title') || 'Track Positions', desc: p('guideStep5Desc') || 'Approved trades open positions with triple barrier protection. Monitor SL/TP progress, unrealized PnL, and close manually if needed.' },
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
                            <div className="p-4 bg-amber-500/5 border-t border-amber-500/10">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                    <p className="text-[10px] text-amber-400/80 leading-relaxed">{p('guideNote') || 'BETA: Trades are currently simulated. The AI analyzes real signals but execution is virtual. Real on-chain execution coming soon.'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : showSetup ? (
                /* ── SETUP FORM ── */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Config */}
                    <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-6 space-y-5">
                        <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2"><Zap size={16} className="text-brand-400" /> {p('configTitle')}</h3>

                        {/* Risk Level */}
                        <div>
                            <label className="text-xs text-surface-200/60 mb-2 block">{p('riskLevel')}</label>
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

                        {/* Budget */}
                        <div>
                            <label className="text-xs text-surface-200/60 mb-1.5 flex items-center gap-1"><DollarSign size={12} /> {p('totalBudget')}</label>
                            <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))}
                                className="w-full px-3 py-2.5 rounded-lg bg-surface-800/50 border border-surface-700/30 text-sm text-surface-100 focus:border-brand-500/50 focus:outline-none" />
                        </div>

                        {/* Max per trade */}
                        <div>
                            <label className="text-xs text-surface-200/60 mb-1.5 block">{p('maxPerTrade')}</label>
                            <div className="flex items-center gap-3">
                                <input type="range" min="1" max="100" value={maxPerTrade} onChange={e => setMaxPerTrade(Number(e.target.value))} className="flex-1 accent-brand-500" />
                                <span className="text-sm font-mono text-brand-400 w-14 text-right">${maxPerTrade}</span>
                            </div>
                        </div>

                        {/* Profit Target */}
                        <div>
                            <label className="text-xs text-surface-200/60 mb-1.5 flex items-center gap-1"><Target size={12} /> {p('profitTarget')}</label>
                            <div className="flex items-center gap-2">
                                {[10, 25, 50, 100].map(v => (
                                    <button key={v} onClick={() => setProfitTarget(v)}
                                        className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                                            profitTarget === v
                                                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-semibold'
                                                : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                        }`}>{v}%</button>
                                ))}
                            </div>
                        </div>

                        {/* Stop Loss */}
                        <div>
                            <label className="text-xs text-surface-200/60 mb-1.5 block">{p('stopLoss')}</label>
                            <div className="flex items-center gap-2">
                                {[10, 20, 30, 50].map(v => (
                                    <button key={v} onClick={() => setStopLoss(v)}
                                        className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                                            stopLoss === v
                                                ? 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold'
                                                : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                        }`}>{v}%</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Chains + Options */}
                    <div className="space-y-6">
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-6 space-y-4">
                            <h3 className="text-sm font-bold text-surface-100">{p('chains')}</h3>
                            <div className="grid grid-cols-2 gap-2">
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

                        <label className="flex items-center justify-between p-4 rounded-2xl bg-surface-800/30 border border-surface-700/20 cursor-pointer">
                            <div>
                                <div className="text-xs font-semibold text-surface-100">{p('autoApprove')}</div>
                                <div className="text-[10px] text-surface-200/40">{p('autoApproveDesc')}</div>
                            </div>
                            <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="w-5 h-5 accent-brand-500 rounded" />
                        </label>

                        {/* Wallet Selector */}
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-4 space-y-2">
                            <label className="text-xs font-semibold text-surface-100 flex items-center gap-1">
                                👛 {p('walletLabel') || 'Trading Wallet'}
                            </label>
                            {wallets.length === 0 ? (
                                <p className="text-[10px] text-red-400">⚠️ {p('noWallet') || 'No wallet found. Create a trading wallet first via Telegram.'}</p>
                            ) : (
                                <select value={selectedWalletId || ''} onChange={e => setSelectedWalletId(Number(e.target.value) || null)}
                                    className="w-full px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700/30 text-xs text-surface-100 focus:outline-none focus:border-brand-500/50">
                                    {wallets.map(w => (
                                        <option key={w.id} value={w.id}>
                                            {w.address.slice(0,6)}...{w.address.slice(-4)} {w.isDefault ? '⭐' : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Paper Mode Toggle */}
                        <div className="rounded-2xl bg-surface-800/30 border border-surface-700/20 p-4">
                            <label className="flex items-center justify-between cursor-pointer">
                                <div>
                                    <div className="text-xs font-semibold text-surface-100 flex items-center gap-1">📝 {p('paperMode') || 'Paper Trading'}</div>
                                    <div className="text-[10px] text-surface-400 mt-0.5">{p('paperModeDesc') || 'Simulate trades without real funds'}</div>
                                </div>
                                <div className={`relative w-10 h-5 rounded-full transition-colors ${paperMode ? 'bg-emerald-500' : 'bg-surface-700'}`}
                                    onClick={() => setPaperMode(!paperMode)}>
                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${paperMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </div>
                            </label>
                        </div>

                        {/* Warning */}
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-400/80 leading-relaxed">
                                {p('liveWarning') || 'Trades are executed on-chain using real funds from your selected wallet. Always verify your settings before starting.'}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button onClick={() => setShowSetup(false)}
                                className="flex-1 py-3 rounded-xl border border-surface-700/30 text-surface-200/60 text-sm hover:bg-surface-800/50 transition-colors">
                                {p('cancel')}
                            </button>
                            <button onClick={handleEnable} disabled={actionLoading === 'enable' || selectedChains.length === 0}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold text-sm hover:from-brand-400 hover:to-purple-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                {actionLoading === 'enable' ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <><Zap size={14} /> {p('startAgent')}</>}
                            </button>
                        </div>
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
                                {plans.map(plan => (
                                    <div key={plan.id} className="rounded-xl bg-surface-900/40 border border-surface-700/15 overflow-hidden hover:border-surface-600/30 transition-colors">
                                        <button onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                                            className="w-full p-3.5 flex items-center justify-between text-left">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-lg bg-surface-800/60 flex items-center justify-center text-base shrink-0">🪙</div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-surface-100">{plan.tokenSymbol}</span>
                                                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${STATUS_COLORS[plan.status] || ''}`}>{plan.status?.toUpperCase()}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-surface-200/40">
                                                        <span>{plan.chainLabel} • AI {p('score')}: {plan.aiScore}/100</span>
                                                        {(plan.signalSource || 'whale').split(',').map((src, i) => {
                                                            const badges = { whale: '🐋', bollinger: '📊', macd_bb: '📈', supertrend: '🔄' };
                                                            return badges[src] ? <span key={i} className="px-1 py-0 rounded bg-surface-800/50 text-[8px]" title={src}>{badges[src]}</span> : null;
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-sm font-mono text-surface-100">${plan.suggestedAmountUsd}</span>
                                                {expandedPlan === plan.id ? <ChevronUp size={14} className="text-surface-200/30" /> : <ChevronDown size={14} className="text-surface-200/30" />}
                                            </div>
                                        </button>

                                        {expandedPlan === plan.id && (
                                            <div className="px-4 pb-4 space-y-3 border-t border-surface-700/15 pt-3">
                                                <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/10">
                                                    <div className="text-[10px] text-brand-400/60 mb-0.5">{p('aiAnalysis')}</div>
                                                    <p className="text-xs text-surface-200/70 leading-relaxed">{plan.aiReason || 'Signal detected'}</p>
                                                </div>
                                                <div className="grid grid-cols-4 gap-3 text-[11px]">
                                                    <div><span className="text-surface-200/40 block">{p('price')}</span><span className="text-surface-100 font-mono">${Number(plan.tokenPrice || 0).toPrecision(4)}</span></div>
                                                    <div><span className="text-surface-200/40 block">{p('target')}</span><span className="text-emerald-400 font-semibold">+{plan.targetPct}%</span></div>
                                                    <div><span className="text-surface-200/40 block">{p('stopLoss')}</span><span className="text-red-400 font-semibold">-{plan.stopLossPct}%</span></div>
                                                    <div><span className="text-surface-200/40 block">{p('score')}</span><span className={`font-bold ${plan.aiScore >= 70 ? 'text-emerald-400' : plan.aiScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{plan.aiScore}/100</span></div>
                                                </div>
                                                {plan.status === 'pending' && (
                                                    <div className="flex gap-2 pt-1">
                                                        <button onClick={() => handleRejectPlan(plan.id)} disabled={actionLoading === `reject-${plan.id}`}
                                                            className="flex-1 py-2.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                            <XCircle size={14} /> {p('reject')}
                                                        </button>
                                                        <button onClick={() => handleApprovePlan(plan.id)} disabled={actionLoading === `approve-${plan.id}`}
                                                            className="flex-1 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                            {actionLoading === `approve-${plan.id}` ? <div className="animate-spin h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full" /> : <><Check size={14} /> {p('approve')}</>}
                                                        </button>
                                                    </div>
                                                )}
                                                {(plan.status === 'executed' || plan.status === 'closed') && (
                                                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-800/40">
                                                        <span className="text-[10px] text-surface-200/40">{p('pnl')}</span>
                                                        <span className={`text-sm font-bold ${(plan.pnlUsd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {(plan.pnlUsd || 0) >= 0 ? '+' : ''}${(plan.pnlUsd || 0).toFixed(2)} ({(plan.pnlPct || 0).toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="text-[9px] text-surface-200/25 text-right">{new Date(plan.createdAt).toLocaleString()}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button onClick={() => setShowSetup(true)} className="text-xs text-surface-200/40 hover:text-brand-400 transition-colors">⚙️ {p('modifyConfig')}</button>
                </div>
            )}
        </div>
    );
}
