import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, UserCheck, AlertTriangle, X, Loader2 } from 'lucide-react';
import useToastStore from '@/stores/toastStore';
import api from '@/api/client';

const WELCOME_ACTIONS = ['kick', 'ban', 'mute'];
const QUESTION_TYPES = [
    { key: 'math', emoji: '🧮', color: '#3b82f6', diff: 1 },
    { key: 'physics', emoji: '🔬', color: '#8b5cf6', diff: 2 },
    { key: 'chemistry', emoji: '⚗️', color: '#10b981', diff: 2 },
    { key: 'okx', emoji: '💱', color: '#f59e0b', diff: 3 },
    { key: 'crypto', emoji: '₿', color: '#ef4444', diff: 3 },
];
const PRESETS = [
    { id: 'mathOnly', label: '🎯 Math Only', w: { math: 100, physics: 0, chemistry: 0, okx: 0, crypto: 0 } },
    { id: 'crypto', label: '💰 Crypto Focus', w: { math: 20, physics: 0, chemistry: 0, okx: 40, crypto: 40 } },
    { id: 'academic', label: '📚 Academic', w: { math: 40, physics: 30, chemistry: 30, okx: 0, crypto: 0 } },
    { id: 'balanced', label: '⚖️ Balanced', w: { math: 20, physics: 20, chemistry: 20, okx: 20, crypto: 20 } },
];
const TEMPLATE_VARS = [
    { var: '{group}', desc: 'Group name' },
    { var: '{user}', desc: 'Member name' },
    { var: '{time}', desc: 'Time limit' },
    { var: '{attempts}', desc: 'Max attempts' },
];

export default function WelcomeTab({ group, onRefresh }) {
    const { t } = useTranslation();
    const toast = useToastStore();
    
    const [welcome, setWelcome] = useState({ enabled: false, timeLimitSeconds: 60, maxAttempts: 3, action: 'kick', questionWeights: { math: 50, physics: 0, chemistry: 0, okx: 25, crypto: 25 }, titleTemplate: '' });
    const [welcomeLoading, setWelcomeLoading] = useState(false);
    const [savingWelcome, setSavingWelcome] = useState(false);
    const [lastSynced, setLastSynced] = useState(null);
    const syncTimerRef = useRef(null);

    const loadWelcomeData = useCallback(async (showLoading = true) => {
        if (showLoading) setWelcomeLoading(true);
        try {
            const r = await api.getUserGroupWelcome(group.chatId);
            setWelcome(prev => {
                const data = r || { enabled: false, timeLimitSeconds: 60, maxAttempts: 3, action: 'kick', questionWeights: { math: 50, physics: 0, chemistry: 0, okx: 25, crypto: 25 }, titleTemplate: '' };
                return { ...data, _preview: prev._preview };
            });
            setLastSynced(Date.now());
        } catch { /* silent */ }
        if (showLoading) setWelcomeLoading(false);
    }, [group.chatId]);

    useEffect(() => {
        loadWelcomeData(true);
        syncTimerRef.current = setInterval(() => loadWelcomeData(false), 30_000);
        return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current); };
    }, [loadWelcomeData]);

    const saveWelcomeSettings = async () => {
        setSavingWelcome(true);
        try {
            const { _preview, stats, ...payload } = welcome;
            await api.updateUserGroupWelcome(group.chatId, payload);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            if (onRefresh) onRefresh();
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
        setSavingWelcome(false);
    };

    if (welcomeLoading) {
        return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-brand-400" /></div>;
    }

    const generatePreview = (activeTypes) => {
        const pool = activeTypes.length > 0 ? activeTypes : [QUESTION_TYPES[0]];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const labels = {
            math: t('dashboard.userGroups.questionMath') || '🧮 Math',
            physics: t('dashboard.userGroups.questionPhysics') || '🔬 Physics',
            chemistry: t('dashboard.userGroups.questionChemistry') || '⚗️ Chemistry',
            okx: t('dashboard.userGroups.questionOkx') || '💱 OKX/DeFi',
            crypto: t('dashboard.userGroups.questionCrypto') || '₿ Crypto',
        };
        const samples = {
            math: () => { const a = Math.floor(Math.random()*50)+1, b = Math.floor(Math.random()*50)+1; return { q: `${a} + ${b} = ?`, a: `${a+b}` }; },
            physics: () => { const m = Math.floor(Math.random()*10)+1; return { q: `F = m×a. If m=${m}kg, a=10m/s², F = ?`, a: `${m*10}N` }; },
            chemistry: () => { const els = [['H₂O','Water'],['NaCl','Salt'],['CO₂','Carbon dioxide']]; const e = els[Math.floor(Math.random()*els.length)]; return { q: `What is ${e[0]}?`, a: e[1] }; },
            okx: () => ({ q: 'What does DEX stand for?', a: 'Decentralized Exchange' }),
            crypto: () => ({ q: 'What is the max supply of Bitcoin?', a: '21 million' }),
        };
        const s = (samples[pick.key] || samples.math)();
        return { type: labels[pick.key], question: s.q, answer: s.a };
    };

    const w = welcome.questionWeights || {};
    const totalW = Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);
    const activeTypes = QUESTION_TYPES.filter(q => (w[q.key] || 0) > 0);
    const avgDiff = activeTypes.length > 0 ? activeTypes.reduce((s, q) => s + q.diff * (w[q.key] || 0), 0) / (totalW || 1) : 0;
    const diffLabel = avgDiff <= 1.3 ? { text: t('dashboard.userGroups.diffEasy') || 'Easy', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' }
        : avgDiff <= 2.2 ? { text: t('dashboard.userGroups.diffMedium') || 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' }
        : { text: t('dashboard.userGroups.diffHard') || 'Hard', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' };

    return (
        <div className="space-y-4 relative">
            {lastSynced && (
                <div className="flex items-center gap-2 text-[10px] text-emerald-400/70 -mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ⚡ {t('dashboard.common.synced') || 'Synced with Telegram'} · {new Date(lastSynced).toLocaleTimeString()}
                    <span className="text-surface-200/30">· {t('dashboard.common.autoRefresh') || 'auto-refresh 30s'}</span>
                </div>
            )}
            <p className="text-xs text-surface-200/40">{t('dashboard.userGroups.welcomeDesc') || 'Configure new member verification (anti-bot protection)'}</p>
            <p className="text-[9px] text-surface-200/25 font-mono -mt-2">{t('dashboard.userGroups.welcomeHint')}</p>

            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
                <div className="flex items-center gap-3">
                    <UserCheck size={16} className={welcome.enabled ? 'text-emerald-400' : 'text-surface-200/30'} />
                    <span className="text-sm text-surface-100">{t('dashboard.userGroups.welcomeEnabled') || 'Enable Welcome Verification'}</span>
                </div>
                <button onClick={() => setWelcome(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`w-10 h-5 rounded-full transition-all relative ${welcome.enabled ? 'bg-emerald-500' : 'bg-surface-700'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${welcome.enabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
                </button>
            </div>
            <p className="text-[9px] text-surface-200/25 font-mono -mt-2">Telegram: /welcome → toggle</p>

            {welcome.enabled && (
                <div className="space-y-3">
                    {/* Time limit */}
                    <div className="p-3 bg-white/[0.02] rounded-xl">
                        <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.timeLimit') || 'Time Limit (seconds)'}</label>
                        <input type="number" min="15" max="300" value={welcome.timeLimitSeconds}
                            onChange={e => setWelcome(prev => ({ ...prev, timeLimitSeconds: Number(e.target.value) }))}
                            onBlur={e => { const v = Math.max(15, Math.min(300, Number(e.target.value) || 60)); setWelcome(prev => ({ ...prev, timeLimitSeconds: v })); }}
                            className="input-field !py-2 !text-sm w-full" />
                    </div>

                    {/* Max attempts */}
                    <div className="p-3 bg-white/[0.02] rounded-xl">
                        <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.maxAttempts') || 'Max Attempts'}</label>
                        <input type="number" min="1" max="10" value={welcome.maxAttempts}
                            onChange={e => setWelcome(prev => ({ ...prev, maxAttempts: Number(e.target.value) }))}
                            onBlur={e => { const v = Math.max(1, Math.min(10, Number(e.target.value) || 3)); setWelcome(prev => ({ ...prev, maxAttempts: v })); }}
                            className="input-field !py-2 !text-sm w-full" />
                    </div>

                    {/* Enforcement action */}
                    <div className="p-3 bg-white/[0.02] rounded-xl">
                        <label className="text-xs text-surface-200/40 block mb-1.5">{t('dashboard.userGroups.action') || 'Fail Action'}</label>
                        <div className="flex gap-2">
                            {WELCOME_ACTIONS.map(action => (
                                <button key={action} onClick={() => setWelcome(prev => ({ ...prev, action }))}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${welcome.action === action
                                        ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                                        : 'bg-surface-800/30 text-surface-200/50 border border-transparent hover:bg-white/5'}`}>
                                    {action === 'kick' ? '👢 Kick' : action === 'ban' ? '🔨 Ban' : '🔇 Mute'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Verification Stats */}
                    {welcome.stats && (
                        <div className="p-3 bg-white/[0.02] rounded-xl">
                            <label className="text-xs text-surface-200/40 block mb-2">{t('dashboard.userGroups.verifyStats') || '📊 Verification Stats'}</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: t('dashboard.userGroups.statTotal') || 'Total', value: welcome.stats.total || 0, color: 'text-brand-400' },
                                    { label: t('dashboard.userGroups.statPassed') || 'Passed', value: welcome.stats.passed || 0, color: 'text-emerald-400' },
                                    { label: t('dashboard.userGroups.statFailed') || 'Failed', value: welcome.stats.failed || 0, color: 'text-red-400' },
                                ].map(s => (
                                    <div key={s.label} className="text-center p-2 rounded-lg bg-white/[0.02]">
                                        <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] text-surface-200/30 uppercase">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                            {welcome.stats.total > 0 && (
                                <div className="mt-2 h-1.5 rounded-full bg-surface-700 overflow-hidden flex">
                                    <div className="bg-emerald-400 transition-all" style={{ width: `${(welcome.stats.passed / welcome.stats.total) * 100}%` }} />
                                    <div className="bg-red-400 transition-all" style={{ width: `${(welcome.stats.failed / welcome.stats.total) * 100}%` }} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Question Weights */}
                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-surface-200/40">{t('dashboard.userGroups.questionWeights') || 'Question Types'}</label>
                                {totalW > 0 && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${diffLabel.bg} ${diffLabel.color}`}>
                                        {diffLabel.text}
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] text-surface-200/25 font-mono">Telegram: /welcome → weights</span>
                        </div>

                        {/* Presets */}
                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map(p => {
                                const isActive = QUESTION_TYPES.every(q => (w[q.key] || 0) === (p.w[q.key] || 0));
                                return (
                                    <button key={p.id}
                                        onClick={() => setWelcome(prev => ({ ...prev, questionWeights: { ...p.w } }))}
                                        className={`text-[10px] px-2 py-1 rounded-lg transition-all border ${isActive
                                            ? 'bg-brand-500/15 text-brand-400 border-brand-500/30'
                                            : 'bg-white/[0.02] text-surface-200/40 border-transparent hover:bg-white/5 hover:text-surface-200/60'}`}>
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Stacked bar chart */}
                        {totalW > 0 && (
                            <div className="h-3 rounded-full overflow-hidden flex bg-surface-700/50" title="Weight distribution">
                                {QUESTION_TYPES.map(q => {
                                    const pct = ((w[q.key] || 0) / totalW) * 100;
                                    if (pct <= 0) return null;
                                    return (
                                        <div key={q.key} className="transition-all relative group"
                                            style={{ width: `${pct}%`, backgroundColor: q.color }}
                                            title={`${q.emoji} ${Math.round(pct)}%`}>
                                            {pct > 12 && (
                                                <span className="absolute inset-0 flex items-center justify-center text-[7px] text-white font-bold">
                                                    {q.emoji}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {totalW <= 0 && (
                            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                <AlertTriangle size={12} className="text-red-400 shrink-0" />
                                <span className="text-[10px] text-red-400">{t('dashboard.userGroups.weightZeroWarn') || '⚠ All weights are 0 — verification questions will not be generated!'}</span>
                            </div>
                        )}

                        {/* Sliders */}
                        {QUESTION_TYPES.map(q => {
                            const pct = totalW > 0 ? Math.round(((w[q.key] || 0) / totalW) * 100) : 0;
                            const labelStr = t(`dashboard.userGroups.question${q.key.charAt(0).toUpperCase() + q.key.slice(1)}`) || `${q.emoji} ${q.key}`;
                            return (
                                <div key={q.key} className="flex items-center gap-2">
                                    <span className="text-[10px] text-surface-100 w-24 truncate">{labelStr}</span>
                                    <div className="flex-1 relative">
                                        <input type="range" min="0" max="100" value={w[q.key] || 0}
                                            onChange={e => setWelcome(prev => ({ ...prev, questionWeights: { ...prev.questionWeights, [q.key]: Number(e.target.value) } }))}
                                            className="w-full h-1" style={{ accentColor: q.color }} />
                                    </div>
                                    <span className={`text-[10px] font-mono w-8 text-right ${totalW <= 0 ? 'text-red-400' : ''}`}
                                        style={{ color: totalW > 0 ? q.color : undefined }}>{pct}%</span>
                                </div>
                            );
                        })}

                        {/* Preview question button */}
                        <button
                            onClick={() => {
                                const p = generatePreview(activeTypes);
                                setWelcome(prev => ({ ...prev, _preview: p }));
                            }}
                            className="w-full py-2 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all flex items-center justify-center gap-1.5">
                            👁 {t('dashboard.userGroups.previewQuestion') || 'Preview Sample Question'}
                        </button>
                        {welcome._preview && (
                            <div className="p-2.5 rounded-lg bg-brand-500/5 border border-brand-500/15 space-y-1 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-brand-400/60 font-mono">{welcome._preview.type}</span>
                                    <button onClick={() => setWelcome(prev => { const { _preview, ...rest } = prev; return rest; })}
                                        className="text-surface-200/30 hover:text-surface-200/60"><X size={10} /></button>
                                </div>
                                <p className="text-xs text-surface-100 font-medium">❓ {welcome._preview.question}</p>
                                <p className="text-[10px] text-emerald-400">✅ {welcome._preview.answer}</p>
                            </div>
                        )}
                    </div>

                    {/* Title Template */}
                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-surface-200/40">{t('dashboard.userGroups.titleTemplate') || 'Verification Title'}</label>
                            <span className="text-[9px] text-surface-200/25 font-mono">Telegram: /welcome → title</span>
                        </div>
                        <p className="text-[9px] text-surface-200/25">{t('dashboard.userGroups.titleTemplateDesc')}</p>
                        <input type="text" maxLength={180} value={welcome.titleTemplate || ''}
                            onChange={e => setWelcome(prev => ({ ...prev, titleTemplate: e.target.value }))}
                            placeholder={t('dashboard.userGroups.titleTemplatePlaceholder') || 'e.g. Welcome to {group}! Solve to enter...'}
                            className="input-field !py-2 !text-xs w-full" />
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-surface-200/25">{(welcome.titleTemplate || '').length}/180</span>
                            {welcome.titleTemplate && (
                                <button onClick={() => {
                                    if (window.confirm(t('dashboard.userGroups.titleTemplateResetConfirm') || 'Reset title to default?')) {
                                        setWelcome(prev => ({ ...prev, titleTemplate: '' }));
                                    }
                                }}
                                    className="text-[9px] text-red-400/60 hover:text-red-400">
                                    {t('dashboard.userGroups.titleTemplateReset') || 'Reset to default'}
                                </button>
                            )}
                        </div>

                        {/* Template variables */}
                        <div className="flex flex-wrap gap-1">
                            {TEMPLATE_VARS.map(v => (
                                <button key={v.var} title={t('dashboard.userGroups.var' + v.var.replace(/[{}]/g, '')) || v.desc}
                                    onClick={() => {
                                        setWelcome(prev => ({ ...prev, titleTemplate: (prev.titleTemplate || '') + v.var }));
                                    }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400/70 hover:text-brand-400 hover:bg-brand-500/20 transition-all font-mono border border-brand-500/10">
                                    {v.var}
                                </button>
                            ))}
                            <span className="text-[8px] text-surface-200/20 self-center ml-1">{t('dashboard.userGroups.clickToInsert') || 'click to insert'}</span>
                        </div>

                        {/* Live message preview */}
                        {welcome.titleTemplate && (
                            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1">
                                <span className="text-[8px] text-surface-200/25 uppercase tracking-wider">{t('dashboard.userGroups.livePreview') || 'Live Preview'}</span>
                                <p className="text-xs text-surface-100">
                                    {(welcome.titleTemplate || '')
                                        .replace(/\{group\}/g, group?.title || 'My Group')
                                        .replace(/\{user\}/g, 'John')
                                        .replace(/\{time\}/g, `${welcome.timeLimitSeconds}s`)
                                        .replace(/\{attempts\}/g, String(welcome.maxAttempts))}
                                </p>
                                <p className="text-[9px] text-surface-200/25 italic">❓ {t('dashboard.userGroups.previewHintInline') || 'Click "Preview" above to see a sample question here'}</p>
                            </div>
                        )}
                    </div>

                    {/* Export / Import Settings */}
                    <div className="p-3 bg-white/[0.02] rounded-xl space-y-2">
                        <label className="text-xs text-surface-200/40">{t('dashboard.userGroups.exportImport') || '📋 Export / Import'}</label>
                        <div className="flex gap-2">
                            <button onClick={() => {
                                try {
                                    const { _preview, stats, ...exportData } = welcome;
                                    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
                                        .then(() => toast.success(t('dashboard.userGroups.exportCopied') || 'Settings copied to clipboard!'))
                                        .catch(() => toast.error('Clipboard access denied'));
                                } catch (err) { toast.error(err.message); }
                            }}
                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.03] text-surface-200/50 border border-transparent hover:bg-white/5 transition-all">
                                📤 {t('dashboard.userGroups.exportBtn') || 'Export'}
                            </button>
                            <button onClick={() => {
                                navigator.clipboard.readText().then(text => {
                                    try {
                                        const data = JSON.parse(text);
                                        if (typeof data.enabled !== 'boolean') throw new Error('Invalid');
                                        const ALLOWED = ['enabled', 'timeLimitSeconds', 'maxAttempts', 'action', 'questionWeights', 'titleTemplate'];
                                        const safe = {};
                                        for (const k of ALLOWED) { if (k in data) safe[k] = data[k]; }
                                        if (safe.action && !['kick', 'ban', 'mute'].includes(safe.action)) delete safe.action;
                                        setWelcome(prev => ({ ...prev, ...safe }));
                                        toast.success(t('dashboard.userGroups.importSuccess') || 'Settings imported!');
                                    } catch { toast.error(t('dashboard.userGroups.importError') || 'Invalid settings JSON in clipboard'); }
                                }).catch(() => toast.error(t('dashboard.userGroups.importError') || 'Cannot read clipboard'));
                            }}
                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.03] text-surface-200/50 border border-transparent hover:bg-white/5 transition-all">
                                📥 {t('dashboard.userGroups.importBtn') || 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Save Button (Floating) */}
            <div className="flex justify-end pt-2">
                 <button onClick={saveWelcomeSettings} disabled={savingWelcome} className="btn-primary !text-xs !px-4 !py-2 flex items-center gap-1.5">
                    {savingWelcome ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                    {t('dashboard.common.save') || 'Save'}
                </button>
            </div>
        </div>
    );
}
