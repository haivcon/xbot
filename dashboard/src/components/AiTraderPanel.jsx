/**
 * AI Auto-Trade Agent Panel — BETA
 * Slide-in panel for ChatPage with setup, dashboard, and trade plan cards
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, TrendingUp, Shield, Zap, Target, DollarSign, Pause, Play, Power, X, Check, XCircle, AlertTriangle, Activity, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import api from '@/api/client';

const RISK_LABELS = {
    conservative: 'riskConservative',
    moderate: 'riskModerate',
    aggressive: 'riskAggressive',
};
const RISK_DESCS = {
    conservative: 'riskConservativeDesc',
    moderate: 'riskModerateDesc',
    aggressive: 'riskAggressiveDesc',
};
const RISK_COLORS = {
    conservative: 'emerald',
    moderate: 'amber',
    aggressive: 'red',
};
const RISK_ICONS = { conservative: '🛡️', moderate: '⚖️', aggressive: '🔥' };

const CHAIN_OPTIONS = [
    { id: '196', label: 'XLayer', icon: '⛓', checked: true },
    { id: '1', label: 'Ethereum', icon: '🔷' },
    { id: '56', label: 'BSC', icon: '🟡' },
    { id: '501', label: 'Solana', icon: '🟣' },
    { id: '137', label: 'Polygon', icon: '🟪' },
    { id: '42161', label: 'Arbitrum', icon: '🔵' },
];

const STATUS_COLORS = {
    pending: 'text-amber-400 bg-amber-400/10',
    approved: 'text-blue-400 bg-blue-400/10',
    executed: 'text-emerald-400 bg-emerald-400/10',
    rejected: 'text-red-400 bg-red-400/10',
    failed: 'text-red-500 bg-red-500/10',
    closed: 'text-surface-200/50 bg-surface-800/30',
};

export default function AiTraderPanel({ visible, onClose }) {
    const { t } = useTranslation();
    const p = (key) => t(`dashboard.aiTraderPage.${key}`);
    const [agentStatus, setAgentStatus] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [showSetup, setShowSetup] = useState(false);
    const [expandedPlan, setExpandedPlan] = useState(null);
    const [planFilter, setPlanFilter] = useState('all');

    // Setup form state
    const [budget, setBudget] = useState(100);
    const [maxPerTrade, setMaxPerTrade] = useState(10);
    const [profitTarget, setProfitTarget] = useState(25);
    const [stopLoss, setStopLoss] = useState(20);
    const [riskLevel, setRiskLevel] = useState('moderate');
    const [selectedChains, setSelectedChains] = useState(['196']);
    const [autoApprove, setAutoApprove] = useState(false);

    const refreshStatus = useCallback(async () => {
        try {
            const data = await api.request('/ai/agent/status');
            setAgentStatus(data);
            if (data?.enabled && !data?.configured) setShowSetup(true);
        } catch { setAgentStatus(null); }
    }, []);

    const refreshPlans = useCallback(async () => {
        try {
            const filter = planFilter === 'all' ? '' : `?status=${planFilter}`;
            const data = await api.request(`/ai/agent/plans${filter}`);
            setPlans(data?.plans || []);
        } catch { setPlans([]); }
    }, [planFilter]);

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        Promise.all([refreshStatus(), refreshPlans()]).finally(() => setLoading(false));
        const interval = setInterval(() => { refreshStatus(); refreshPlans(); }, 30000);
        return () => clearInterval(interval);
    }, [visible, refreshStatus, refreshPlans]);

    const handleEnable = async () => {
        setActionLoading('enable');
        try {
            await api.request('/ai/agent/enable', {
                method: 'POST',
                body: JSON.stringify({
                    riskLevel,
                    maxAmountUsd: maxPerTrade,
                    totalBudgetUsd: budget,
                    profitTargetPct: profitTarget,
                    stopLossPct: stopLoss,
                    takeProfitPct: profitTarget,
                    chains: selectedChains.join(','),
                    autoApprove
                }),
            });
            setShowSetup(false);
            await refreshStatus();
        } catch (err) { console.error('Enable error:', err); }
        setActionLoading(null);
    };

    const handleDisable = async () => {
        setActionLoading('disable');
        try {
            await api.request('/ai/agent/disable', { method: 'POST' });
            await refreshStatus();
            await refreshPlans();
        } catch (err) { console.error('Disable error:', err); }
        setActionLoading(null);
    };

    const handlePause = async (pause) => {
        setActionLoading('pause');
        try {
            await api.request('/ai/agent/pause', { method: 'POST', body: JSON.stringify({ pause }) });
            await refreshStatus();
        } catch (err) { console.error('Pause error:', err); }
        setActionLoading(null);
    };

    const handleApprovePlan = async (planId) => {
        setActionLoading(`approve-${planId}`);
        try {
            await api.request(`/ai/agent/plans/${planId}/approve`, { method: 'POST' });
            await refreshPlans();
            await refreshStatus();
        } catch (err) { console.error('Approve error:', err); }
        setActionLoading(null);
    };

    const handleRejectPlan = async (planId) => {
        setActionLoading(`reject-${planId}`);
        try {
            await api.request(`/ai/agent/plans/${planId}/reject`, { method: 'POST' });
            await refreshPlans();
        } catch (err) { console.error('Reject error:', err); }
        setActionLoading(null);
    };

    const toggleChain = (id) => {
        setSelectedChains(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md bg-surface-900/95 border-l border-surface-700/50 shadow-2xl overflow-y-auto animate-slide-in-right"
                 onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur-sm border-b border-surface-700/30 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bot size={20} className="text-brand-400" />
                            <h2 className="text-base font-bold text-surface-100">{p('panelTitle')}</h2>
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 uppercase tracking-wider">{p('betaBadge')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { refreshStatus(); refreshPlans(); }} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-brand-400 transition-colors">
                                <RefreshCw size={14} />
                            </button>
                            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-red-400 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
                        </div>
                    ) : !agentStatus?.enabled && !showSetup ? (
                        /* ── INACTIVE STATE ── */
                        <div className="text-center space-y-6 py-8">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20 flex items-center justify-center">
                                <Bot size={32} className="text-brand-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-surface-100 mb-2">{p('title')}</h3>
                                <p className="text-sm text-surface-200/60 leading-relaxed max-w-xs mx-auto">
                                    {p('panelWelcomeDesc')}
                                </p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
                                    <TrendingUp size={18} className="mx-auto text-emerald-400 mb-1.5" />
                                    <p className="text-[10px] text-surface-200/60">{p('signalAnalysis')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
                                    <Shield size={18} className="mx-auto text-blue-400 mb-1.5" />
                                    <p className="text-[10px] text-surface-200/60">{p('riskControl')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
                                    <Target size={18} className="mx-auto text-amber-400 mb-1.5" />
                                    <p className="text-[10px] text-surface-200/60">{p('featureTarget')}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSetup(true)}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold hover:from-brand-400 hover:to-purple-400 transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2">
                                <Zap size={16} />
                                {p('configureAgent')}
                            </button>
                        </div>
                    ) : showSetup ? (
                        /* ── SETUP FORM ── */
                        <div className="space-y-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Zap size={16} className="text-brand-400" />
                                <h3 className="text-sm font-bold text-surface-100">{p('configureAgent')}</h3>
                            </div>

                            {/* Risk Level */}
                            <div>
                                <label className="text-xs text-surface-200/60 mb-2 block">{p('riskLevel')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['conservative', 'moderate', 'aggressive'].map(rId => (
                                        <button key={rId} onClick={() => setRiskLevel(rId)}
                                            className={`p-2.5 rounded-xl border text-center transition-all ${
                                                riskLevel === rId
                                                    ? `border-${RISK_COLORS[rId]}-500/50 bg-${RISK_COLORS[rId]}-500/10`
                                                    : 'border-surface-700/30 bg-surface-800/30 hover:border-surface-600/50'
                                            }`}>
                                            <div className="text-lg mb-0.5">{RISK_ICONS[rId]}</div>
                                            <div className="text-[10px] font-semibold text-surface-100">{p(RISK_LABELS[rId])}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Budget */}
                            <div>
                                <label className="text-xs text-surface-200/60 mb-1.5 block flex items-center gap-1">
                                    <DollarSign size={12} /> {p('totalBudget')}
                                </label>
                                <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-lg bg-surface-800/50 border border-surface-700/30 text-sm text-surface-100 focus:border-brand-500/50 focus:outline-none" />
                            </div>

                            {/* Max per trade */}
                            <div>
                                <label className="text-xs text-surface-200/60 mb-1.5 block">{p('maxPerTrade')}</label>
                                <div className="flex items-center gap-3">
                                    <input type="range" min="1" max="100" value={maxPerTrade} onChange={e => setMaxPerTrade(Number(e.target.value))}
                                        className="flex-1 accent-brand-500" />
                                    <span className="text-sm font-mono text-brand-400 w-12 text-right">${maxPerTrade}</span>
                                </div>
                            </div>

                            {/* Profit Target */}
                            <div>
                                <label className="text-xs text-surface-200/60 mb-1.5 block flex items-center gap-1">
                                    <Target size={12} /> {p('takeProfitLabel')}
                                </label>
                                <div className="flex items-center gap-2">
                                    {[10, 25, 50, 100].map(v => (
                                        <button key={v} onClick={() => setProfitTarget(v)}
                                            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                                                profitTarget === v
                                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-semibold'
                                                    : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                            }`}>{v}%</button>
                                    ))}
                                </div>
                            </div>

                            {/* Stop Loss */}
                            <div>
                                <label className="text-xs text-surface-200/60 mb-1.5 block">{p('stopLossLabel')}</label>
                                <div className="flex items-center gap-2">
                                    {[10, 20, 30, 50].map(v => (
                                        <button key={v} onClick={() => setStopLoss(v)}
                                            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                                                stopLoss === v
                                                    ? 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold'
                                                    : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60 hover:border-surface-600/50'
                                            }`}>{v}%</button>
                                    ))}
                                </div>
                            </div>

                            {/* Chains */}
                            <div>
                                <label className="text-xs text-surface-200/60 mb-1.5 block">{p('chains')}</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {CHAIN_OPTIONS.map(c => (
                                        <button key={c.id} onClick={() => toggleChain(c.id)}
                                            className={`px-2.5 py-1 text-[10px] rounded-lg border transition-colors flex items-center gap-1 ${
                                                selectedChains.includes(c.id)
                                                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                                                    : 'border-surface-700/30 bg-surface-800/30 text-surface-200/60'
                                            }`}>
                                            <span>{c.icon}</span> {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Auto Approve toggle */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-surface-800/30 border border-surface-700/30 cursor-pointer">
                                <div>
                                    <div className="text-xs font-semibold text-surface-100">{p('autoApprove')}</div>
                                    <div className="text-[10px] text-surface-200/40">{p('autoApproveDesc')}</div>
                                </div>
                                <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)}
                                    className="w-4 h-4 accent-brand-500 rounded" />
                            </label>

                            {/* Warning */}
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-amber-400/80 leading-relaxed">
                                    {p('betaWarning')}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button onClick={() => setShowSetup(false)}
                                    className="flex-1 py-2.5 rounded-xl border border-surface-700/30 text-surface-200/60 text-sm hover:bg-surface-800/50 transition-colors">
                                    {p('cancel')}
                                </button>
                                <button onClick={handleEnable} disabled={actionLoading === 'enable' || selectedChains.length === 0}
                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-semibold text-sm hover:from-brand-400 hover:to-purple-400 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                                    {actionLoading === 'enable' ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <><Zap size={14} /> {p('startAgent')}</>}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ── ACTIVE DASHBOARD ── */
                        <div className="space-y-4">
                            {/* Status Card */}
                            <div className="p-4 rounded-xl bg-gradient-to-br from-surface-800/60 to-surface-800/30 border border-surface-700/30">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${agentStatus?.paused ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
                                        <span className="text-xs font-semibold text-surface-100">
                                            {agentStatus?.paused ? p('paused') : p('running')}
                                        </span>
                                        <span className="text-[10px] text-surface-200/40">{agentStatus?.riskLevel}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {agentStatus?.paused ? (
                                            <button onClick={() => handlePause(false)} disabled={actionLoading === 'pause'}
                                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title={p('resumedToast')}>
                                                <Play size={12} />
                                            </button>
                                        ) : (
                                            <button onClick={() => handlePause(true)} disabled={actionLoading === 'pause'}
                                                className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors" title={p('pausedToast')}>
                                                <Pause size={12} />
                                            </button>
                                        )}
                                        <button onClick={handleDisable} disabled={actionLoading === 'disable'}
                                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title={p('agentStopped')}>
                                            <Power size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* PnL Display */}
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <div className="text-center">
                                        <div className="text-[10px] text-surface-200/40 mb-0.5">{p('totalPnl')}</div>
                                        <div className={`text-sm font-bold ${(agentStatus?.totalPnlUsd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {(agentStatus?.totalPnlUsd || 0) >= 0 ? '+' : ''}${(agentStatus?.totalPnlUsd || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-surface-200/40 mb-0.5">{p('trades')}</div>
                                        <div className="text-sm font-bold text-surface-100">{agentStatus?.totalTrades || 0}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-surface-200/40 mb-0.5">{p('pending')}</div>
                                        <div className={`text-sm font-bold ${(agentStatus?.pendingPlans || 0) > 0 ? 'text-amber-400' : 'text-surface-200/40'}`}>
                                            {agentStatus?.pendingPlans || 0}
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-surface-200/40">{p('profitProgress')}</span>
                                        <span className="text-[10px] font-semibold text-brand-400">{agentStatus?.profitProgress || 0}% of {agentStatus?.profitTargetPct || 25}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-surface-800/60 overflow-hidden">
                                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-500"
                                            style={{ width: `${Math.min(100, agentStatus?.profitProgress || 0)}%` }} />
                                    </div>
                                </div>

                                {/* Chain labels */}
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {(agentStatus?.chainLabels || []).map((c, i) => (
                                        <span key={i} className="px-1.5 py-0.5 text-[9px] rounded bg-surface-800/50 text-surface-200/50 border border-surface-700/20">{c}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Plan Filters */}
                            <div className="flex items-center gap-1.5">
                                {[
                                    { id: 'all', label: p('all') },
                                    { id: 'pending', label: p('filterPending') },
                                    { id: 'executed', label: p('filterExecuted') },
                                    { id: 'rejected', label: p('filterRejected') },
                                ].map(f => (
                                    <button key={f.id} onClick={() => setPlanFilter(f.id)}
                                        className={`px-2.5 py-1 text-[10px] rounded-lg transition-colors ${
                                            planFilter === f.id
                                                ? 'bg-brand-500/15 text-brand-400 font-semibold'
                                                : 'text-surface-200/50 hover:text-surface-200/70 hover:bg-white/5'
                                        }`}>{f.label}</button>
                                ))}
                            </div>

                            {/* Trade Plans */}
                            <div className="space-y-2">
                                {plans.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Activity size={24} className="mx-auto text-surface-200/20 mb-2" />
                                        <p className="text-xs text-surface-200/40">{p('noPlansPanel')}</p>
                                        <p className="text-[10px] text-surface-200/30 mt-1">{p('scanningPanel')}</p>
                                    </div>
                                ) : plans.map(plan => (
                                    <div key={plan.id} className="rounded-xl bg-surface-800/30 border border-surface-700/20 overflow-hidden hover:border-surface-600/30 transition-colors">
                                        {/* Plan Header */}
                                        <button onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                                            className="w-full p-3 flex items-center justify-between text-left">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-surface-800/60 flex items-center justify-center text-sm shrink-0">
                                                    🪙
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-bold text-surface-100 truncate">{plan.tokenSymbol}</span>
                                                        <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded ${STATUS_COLORS[plan.status] || ''}`}>
                                                            {plan.status?.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-surface-200/40 truncate">{plan.chainLabel} • {p('score')}: {plan.aiScore}/100</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs font-mono text-surface-100">${plan.suggestedAmountUsd}</span>
                                                {expandedPlan === plan.id ? <ChevronUp size={12} className="text-surface-200/30" /> : <ChevronDown size={12} className="text-surface-200/30" />}
                                            </div>
                                        </button>

                                        {/* Expanded Details */}
                                        {expandedPlan === plan.id && (
                                            <div className="px-3 pb-3 space-y-2 border-t border-surface-700/20 pt-2">
                                                {/* AI Reason */}
                                                <div className="p-2 rounded-lg bg-brand-500/5 border border-brand-500/10">
                                                    <div className="text-[10px] text-brand-400/60 mb-0.5">{p('aiAnalysis')}</div>
                                                    <p className="text-[11px] text-surface-200/70 leading-relaxed">{plan.aiReason || p('signalDetected')}</p>
                                                </div>

                                                {/* Details Grid */}
                                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                    <div className="flex justify-between">
                                                        <span className="text-surface-200/40">{p('price')}</span>
                                                        <span className="text-surface-100 font-mono">${Number(plan.tokenPrice || 0).toPrecision(4)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-surface-200/40">{p('target')}</span>
                                                        <span className="text-emerald-400">+{plan.targetPct}%</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-surface-200/40">{p('stopLoss')}</span>
                                                        <span className="text-red-400">-{plan.stopLossPct}%</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-surface-200/40">{p('score')}</span>
                                                        <span className={`font-bold ${plan.aiScore >= 70 ? 'text-emerald-400' : plan.aiScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                                            {plan.aiScore}/100
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Action Buttons (only for pending) */}
                                                {plan.status === 'pending' && (
                                                    <div className="flex gap-2 pt-1">
                                                        <button onClick={() => handleRejectPlan(plan.id)}
                                                            disabled={actionLoading === `reject-${plan.id}`}
                                                            className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                                                            <XCircle size={12} /> {p('reject')}
                                                        </button>
                                                        <button onClick={() => handleApprovePlan(plan.id)}
                                                            disabled={actionLoading === `approve-${plan.id}`}
                                                            className="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                                                            {actionLoading === `approve-${plan.id}` ? <div className="animate-spin h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full" /> : <><Check size={12} /> {p('approve')}</>}
                                                        </button>
                                                    </div>
                                                )}

                                                {/* PnL (for executed) */}
                                                {(plan.status === 'executed' || plan.status === 'closed') && (
                                                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40">
                                                        <span className="text-[10px] text-surface-200/40">{p('pnl')}</span>
                                                        <span className={`text-xs font-bold ${(plan.pnlUsd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {(plan.pnlUsd || 0) >= 0 ? '+' : ''}${(plan.pnlUsd || 0).toFixed(2)} ({(plan.pnlPct || 0).toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="text-[9px] text-surface-200/25 text-right">
                                                    {new Date(plan.createdAt).toLocaleString()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Modify Config */}
                            <button onClick={() => setShowSetup(true)}
                                className="w-full py-2 text-xs text-surface-200/40 hover:text-brand-400 transition-colors">
                                ⚙️ {p('modifyConfiguration')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
