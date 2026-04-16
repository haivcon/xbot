import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import api from '@/api/client';
import CustomSelect from '@/components/ui/CustomSelect';
import {
    Users, Search, ShieldX, Shield, Crown, RefreshCw, Download, CheckSquare, Wallet,
    Send, MessageSquare, Brain, X, Loader2, Check, AlertTriangle, Zap, ChevronDown, Eye
} from 'lucide-react';

/* ─── Send Message Modal ─── */
function SendMessageModal({ open, onClose, targetUsers, allUsers, onSend }) {
    const { t } = useTranslation();
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const textRef = useRef(null);

    useEffect(() => {
        if (open) {
            setText('');
            setResult(null);
            setTimeout(() => textRef.current?.focus(), 100);
        }
    }, [open]);

    if (!open) return null;

    const isAll = !targetUsers || targetUsers.length === 0;
    const targetCount = isAll ? allUsers?.length || 0 : targetUsers.length;

    const handleSend = async () => {
        if (!text.trim() || sending) return;
        setSending(true);
        setResult(null);

        const ids = isAll ? allUsers.map(u => u.chatId || u.userId).filter(Boolean) : targetUsers;
        
        let sent = 0;
        let failed = 0;
        const logs = [];

        setResult({ type: 'progress', current: 0, total: ids.length, logs });

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const user = allUsers?.find(u => u.chatId === id || u.userId === id);
            const name = user?.firstName || user?.username || id;

            try {
                await onSend([id], text.trim());
                sent++;
                logs.unshift({ id, name, status: 'success' });
            } catch (err) {
                failed++;
                logs.unshift({ id, name, status: 'error', error: err.message });
            }

            if (logs.length > 50) logs.pop();

            setResult({
                type: 'progress',
                current: i + 1,
                total: ids.length,
                sent, failed,
                logs: [...logs]
            });
        }

        setResult({ type: 'success', sent, failed, total: ids.length, logs });
        setSending(false);
    };

    const insertTag = (tag) => {
        const ta = textRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = text.substring(start, end);
        const wrapped = `<${tag}>${selected}</${tag}>`;
        setText(text.substring(0, start) + wrapped + text.substring(end));
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = start + tag.length + 2;
            ta.selectionEnd = start + tag.length + 2 + selected.length;
        }, 0);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            {/* Modal */}
            <div className="relative w-full max-w-lg bg-surface-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 animate-[fadeIn_0.2s_ease]"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
                            <Send size={16} className="text-brand-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-surface-100">
                                {t('dashboard.users.sendMessage', 'Send Message')}
                            </h3>
                            <p className="text-[10px] text-surface-200/40">
                                {isAll
                                    ? t('dashboard.users.sendToAll', 'To all {{count}} users', { count: targetCount })
                                    : t('dashboard.users.sendToSelected', 'To {{count}} selected users', { count: targetCount })}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-surface-200/40 hover:text-surface-200/70 hover:bg-white/5 transition-all">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3">
                    {/* Formatting toolbar */}
                    <div className="flex gap-1">
                        {[
                            { tag: 'b', label: 'B', title: 'Bold' },
                            { tag: 'i', label: 'I', title: 'Italic' },
                            { tag: 'u', label: 'U', title: 'Underline' },
                            { tag: 'code', label: '</>', title: 'Code' },
                            { tag: 's', label: 'S̶', title: 'Strikethrough' },
                        ].map(btn => (
                            <button key={btn.tag} onClick={() => insertTag(btn.tag)} title={btn.title}
                                className="px-2 py-1 rounded text-xs font-bold text-surface-200/50 hover:text-surface-100 hover:bg-white/5 border border-white/5 transition-all">
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    <textarea
                        ref={textRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={t('dashboard.users.messagePlaceholder', 'Type your message... (HTML supported)')}
                        rows={5}
                        className="w-full bg-surface-800/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-surface-100 placeholder-surface-200/30
                            focus:outline-none focus:ring-1 focus:ring-brand-500/30 resize-none"
                    />

                    {/* Character count */}
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] text-surface-200/30">
                            {t('dashboard.users.supportsHtml', 'Supports:')} <code className="text-brand-400/50">&lt;b&gt;</code> <code className="text-brand-400/50">&lt;i&gt;</code> <code className="text-brand-400/50">&lt;u&gt;</code> <code className="text-brand-400/50">&lt;code&gt;</code> <code className="text-brand-400/50">&lt;a href&gt;</code>
                        </p>
                        <span className={`text-[10px] ${text.length > 4000 ? 'text-red-400' : 'text-surface-200/30'}`}>
                            {text.length}/4096
                        </span>
                    </div>

                    {/* Preview */}
                    {text.trim() && (
                        <div className="border border-white/5 rounded-xl p-3 bg-surface-800/30">
                            <p className="text-[10px] text-surface-200/30 mb-1.5 flex items-center gap-1">
                                <Eye size={10} /> {t('dashboard.users.preview', 'Preview')}
                            </p>
                            <div className="text-xs text-surface-200/70 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
                                    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
                                    .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
                                    .replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>')
                                    .replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>')
                                    .replace(/&lt;s&gt;/g, '<s>').replace(/&lt;\/s&gt;/g, '</s>')
                                    .replace(/\n/g, '<br/>')
                                }} />
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className={`mt-2 p-3 rounded-xl text-xs font-medium ${
                            result.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                            result.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                            'bg-brand-500/10 border border-brand-500/20'
                        }`}>
                            {result.type === 'error' ? (
                                <div className="flex items-center gap-2"><AlertTriangle size={14} /> {result.message}</div>
                            ) : (
                                <div>
                                    <div className="flex items-center mb-2 gap-2 text-surface-100 font-semibold">
                                        {result.type === 'success' ? <Check size={14} className="text-emerald-400"/> : <Loader2 size={14} className="animate-spin text-brand-400"/>}
                                        {result.type === 'success' 
                                            ? t('dashboard.users.sendComplete', 'Finished sending to {{total}} users.', { total: result.total }) 
                                            : t('dashboard.users.sendProgress', 'Sending: {{current}}/{{total}}...', { current: result.current, total: result.total })
                                        }
                                        <span className="ml-auto text-emerald-400">{t('dashboard.common.ok', 'OK')}: {result.sent || 0}</span>
                                        <span className="text-red-400 text-[10px] ml-1">{t('dashboard.common.failed', 'Failed')}: {result.failed || 0}</span>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto space-y-1 bg-black/20 rounded p-2 text-[10px] font-mono">
                                        {result.logs?.map((log, idx) => (
                                            <div key={idx} className="flex justify-between border-b border-white/5 pb-1">
                                                <span className="text-surface-200 truncate pr-2 flex-1">{log.name}</span>
                                                {log.status === 'success' ? (
                                                    <span className="text-emerald-400">{t('dashboard.users.sendSuccess', 'Success')}</span>
                                                ) : (
                                                    <span className="text-red-400 truncate max-w-[120px]" title={log.error}>
                                                        {t('dashboard.users.sendFailed', 'Failed')} ({log.error})
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
                    <button onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-surface-200/50 hover:text-surface-200/70 hover:bg-white/5 transition-all">
                        {result?.type === 'success' ? t('dashboard.common.close', 'Close') : t('dashboard.common.cancel', 'Cancel')}
                    </button>
                    {result?.type !== 'success' && (
                        <button onClick={handleSend} disabled={!text.trim() || sending || text.length > 4096}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-brand-500/20 text-brand-400 border border-brand-500/20
                                hover:bg-brand-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                            {sending ? <><Loader2 size={12} className="animate-spin" /> {t('dashboard.common.sending', 'Sending...')}</> : <><Send size={12} /> {t('dashboard.common.send', 'Send')}</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── AI Limit Quick Set Modal ─── */
function AiLimitModal({ open, onClose, targetUsers, allUsersCount, onSetLimit }) {
    const { t } = useTranslation();
    const [limit, setLimit] = useState(50);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (open) { setLimit(50); setResult(null); }
    }, [open]);

    if (!open) return null;

    const isAll = !targetUsers || targetUsers.length === 0;
    const targetCount = isAll ? allUsersCount : targetUsers.length;

    const limitOptions = [
        { value: 0, label: '🚫 Block', desc: 'No AI access' },
        { value: 10, label: '10/day', desc: 'Minimal' },
        { value: 25, label: '25/day', desc: 'Basic' },
        { value: 50, label: '50/day', desc: 'Standard' },
        { value: 100, label: '100/day', desc: 'Pro' },
        { value: 200, label: '200/day', desc: 'Power' },
        { value: -1, label: '∞ Unlimited', desc: 'No limits' },
    ];

    const handleSave = async () => {
        setSaving(true);
        setResult(null);
        try {
            const res = await onSetLimit(isAll ? [] : targetUsers, limit);
            setResult({ type: 'success', updated: res.updated || targetCount });
        } catch (err) {
            setResult({ type: 'error', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 animate-[fadeIn_0.2s_ease]"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                            <Brain size={16} className="text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-surface-100">
                                {t('dashboard.users.setAiLimit', 'Set AI Limit')}
                            </h3>
                            <p className="text-[10px] text-surface-200/40">
                                {isAll
                                    ? t('dashboard.users.aiLimitAll', 'Apply to all {{count}} users', { count: targetCount })
                                    : t('dashboard.users.aiLimitSelected', 'Apply to {{count}} selected users', { count: targetCount })}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-surface-200/40 hover:text-surface-200/70 hover:bg-white/5 transition-all">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3">
                    <p className="text-xs text-surface-200/50">
                        {t('dashboard.users.aiLimitDesc', 'Set the max number of AI requests per day using the server API key.')}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {limitOptions.map(opt => (
                            <button key={opt.value} onClick={() => setLimit(opt.value)}
                                className={`p-2.5 rounded-xl border text-center transition-all ${
                                    limit === opt.value
                                        ? 'bg-brand-500/15 border-brand-500/30 ring-1 ring-brand-500/20'
                                        : 'bg-surface-800/50 border-white/5 hover:border-white/10 hover:bg-surface-800'
                                }`}>
                                <span className={`text-sm font-bold block ${limit === opt.value ? 'text-brand-400' : 'text-surface-100'}`}>
                                    {opt.label}
                                </span>
                                <span className="text-[9px] text-surface-200/30">{opt.desc}</span>
                            </button>
                        ))}
                    </div>

                    {result && (
                        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
                            result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                            {result.type === 'success'
                                ? <><Check size={14} /> Updated {result.updated} users</>
                                : <><AlertTriangle size={14} /> {result.message}</>
                            }
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
                    <button onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-surface-200/50 hover:text-surface-200/70 hover:bg-white/5 transition-all">
                        {result?.type === 'success' ? 'Close' : 'Cancel'}
                    </button>
                    {result?.type !== 'success' && (
                        <button onClick={handleSave} disabled={saving}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/20
                                hover:bg-purple-500/30 transition-all disabled:opacity-30 flex items-center gap-1.5">
                            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : <><Zap size={12} /> Apply</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Wallet Limit Modal ─── */
function WalletLimitModal({ open, onClose, targetUsers, allUsersCount, onSetLimit }) {
    const { t } = useTranslation();
    const [limit, setLimit] = useState(50);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (open) { setLimit(50); setResult(null); }
    }, [open]);

    if (!open) return null;

    const isAll = !targetUsers || targetUsers.length === 0;
    const targetCount = isAll ? allUsersCount : targetUsers.length;

    const limitOptions = [
        { value: 50, label: '50' },
        { value: 100, label: '100' },
        { value: 200, label: '200' },
        { value: 300, label: '300' },
        { value: 500, label: '500' },
        { value: 1000, label: '1000' },
    ];

    const handleSave = async () => {
        setSaving(true);
        setResult(null);
        try {
            const res = await onSetLimit(isAll ? [] : targetUsers, limit);
            setResult({ type: 'success', updated: res.updated || targetCount });
        } catch (err) {
            setResult({ type: 'error', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 animate-[fadeIn_0.2s_ease]"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                            <Wallet size={16} className="text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-surface-100">
                                {t('dashboard.users.setWalletLimit', 'Set Wallet Limit')}
                            </h3>
                            <p className="text-[10px] text-surface-200/40">
                                {isAll
                                    ? t('dashboard.users.walletLimitAll', 'Apply to all {{count}} users', { count: targetCount })
                                    : t('dashboard.users.walletLimitSelected', 'Apply to {{count}} selected users', { count: targetCount })}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-surface-200/40 hover:text-surface-200/70 hover:bg-white/5 transition-all">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3">
                    <p className="text-xs text-surface-200/50">
                        {t('dashboard.users.walletLimitDesc', 'Set the max number of wallets a user can create.')}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {limitOptions.map(opt => (
                            <button key={opt.value} onClick={() => setLimit(opt.value)}
                                className={`p-2.5 rounded-xl border text-center transition-all ${
                                    limit === opt.value
                                        ? 'bg-brand-500/15 border-brand-500/30 ring-1 ring-brand-500/20'
                                        : 'bg-surface-800/50 border-white/5 hover:border-white/10 hover:bg-surface-800'
                                }`}>
                                <span className={`text-sm font-bold block ${limit === opt.value ? 'text-brand-400' : 'text-surface-100'}`}>
                                    {opt.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {result && (
                        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
                            result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                            {result.type === 'success'
                                ? <><Check size={14} /> Updated {result.updated} users</>
                                : <><AlertTriangle size={14} /> {result.message}</>
                            }
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
                    <button onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-surface-200/50 hover:text-surface-200/70 hover:bg-white/5 transition-all">
                        {result?.type === 'success' ? 'Close' : 'Cancel'}
                    </button>
                    {result?.type !== 'success' && (
                        <button onClick={handleSave} disabled={saving}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20
                                hover:bg-emerald-500/30 transition-all disabled:opacity-30 flex items-center gap-1.5">
                            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : <><Zap size={12} /> Apply</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── AI Limit Display Badge ─── */
function AiLimitBadge({ limit }) {
    if (limit === undefined || limit === null || limit === 50) {
        return <span className="text-surface-200/30 text-xs">50</span>;
    }
    if (limit === -1) {
        return <span className="text-emerald-400 text-xs font-semibold">∞</span>;
    }
    if (limit === 0) {
        return <span className="text-red-400 text-xs font-semibold">🚫</span>;
    }
    return <span className="text-amber-400 text-xs font-semibold">{limit}</span>;
}

export default function UsersPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [users, setUsers] = useState([]);
    const [bannedUsers, setBannedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(searchParams.get('q') || '');
    const [tab, setTab] = useState('all'); // 'all' | 'banned'
    const [selected, setSelected] = useState(new Set());

    // Modal states
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [showAiLimitModal, setShowAiLimitModal] = useState(false);
    const [showWalletLimitModal, setShowWalletLimitModal] = useState(false);
    const [messageTargets, setMessageTargets] = useState(null); // null = all, [...ids] = selected

    const switchTab = (newTab) => {
        setTab(newTab);
        setSelected(new Set()); // clear selections on tab change
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [u, b] = await Promise.all([
                api.getUsers({ search }),
                api.getBannedUsers(),
            ]);
            setUsers(u.users || []);
            setBannedUsers(b.users || []);
        } catch {
            // error handled in api client
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredUsers = tab === 'banned' ? bannedUsers :
        (search ? users.filter(u =>
            (u.firstName || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.chatId || '').includes(search)
        ) : users);

    const handleBan = async (userId) => {
        if (!confirm(t('dashboard.common.confirm'))) return;
        await api.banUser(userId, 'Banned from dashboard');
        fetchData();
    };

    const handleUnban = async (userId) => {
        await api.unbanUser(userId);
        fetchData();
    };

    // Bulk actions
    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === filteredUsers.length) setSelected(new Set());
        else setSelected(new Set(filteredUsers.map(u => u.chatId || u.userId)));
    };

    const handleBulkBan = async () => {
        if (!selected.size || !confirm(t('dashboard.users.confirmBulkBan', { count: selected.size }))) return;
        for (const id of selected) {
            try { await api.banUser(id, 'Bulk banned from dashboard'); } catch {}
        }
        setSelected(new Set());
        fetchData();
    };

    const handleBulkUnban = async () => {
        if (!selected.size || !confirm(t('dashboard.users.confirmBulkUnban', { count: selected.size }))) return;
        for (const id of selected) {
            try { await api.unbanUser(id); } catch {}
        }
        setSelected(new Set());
        fetchData();
    };

    const handleSendMessage = async (userIds, text) => {
        const res = await api.sendMessageToUsers(userIds, text);
        return res;
    };

    const handleSetAiLimit = async (userIds, limit) => {
        const res = await api.setUserAiLimit(userIds, limit);
        fetchData(); // Refresh to show updated limits
        return res;
    };

    const handleSetWalletLimit = async (userIds, limit) => {
        let targetIds = userIds;
        if (!targetIds || targetIds.length === 0) {
            targetIds = users.map(u => u.chatId || u.userId);
        }
        let updated = 0;
        for (const id of targetIds) {
            try {
                await api.setUserWalletLimit(id, limit);
                updated++;
            } catch {}
        }
        fetchData(); // Refresh to show updated limits
        return { updated };
    };

    const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

    // Computed stats
    const customAiLimitUsers = users.filter(u => u.aiDailyLimit !== undefined && u.aiDailyLimit !== null && u.aiDailyLimit !== 50);
    const blockedAiUsers = users.filter(u => u.aiDailyLimit === 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.users.title')}</h1>
                <div className="flex gap-2">
                    {/* Send to all button */}
                    <button onClick={() => { setMessageTargets(null); setShowMessageModal(true); }}
                        className="btn-secondary flex items-center gap-1.5 !py-2 !px-3.5 !text-sm">
                        <Send size={14} /> {t('dashboard.users.broadcast', 'Broadcast')}
                    </button>
                    <button onClick={() => {
                        if (!users.length) return;
                        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
                        const header = 'Name,Username,UserID,Language,LastSeen,AILimit,Status';
                        const rows = users.map(u =>
                            [
                                esc(u.firstName || u.username || '-'),
                                esc(u.username || '-'),
                                esc(u.chatId || u.userId),
                                esc(u.lang || 'en'),
                                esc(u.lastSeen ? new Date(u.lastSeen * 1000).toISOString() : '-'),
                                esc(u.aiDailyLimit === -1 ? '∞' : (u.aiDailyLimit ?? 50)),
                                bannedUsers.some(b => b.userId === u.chatId) ? 'Banned' : 'Active',
                            ].join(',')
                        );
                        const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'users_export.csv'; a.click();
                        URL.revokeObjectURL(url);
                    }} disabled={!users.length} className="btn-secondary flex items-center gap-1.5 !py-2 !px-3.5 !text-sm disabled:opacity-30">
                        <Download size={14} /> CSV
                    </button>
                    <button onClick={fetchData} className="btn-secondary flex items-center gap-2 !py-2 !px-3.5 !text-sm">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                            <Users size={20} className="text-brand-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.total')}</p>
                            <p className="text-2xl font-bold text-surface-100">{users.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <Shield size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.active')}</p>
                            <p className="text-2xl font-bold text-surface-100">{users.length - bannedUsers.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                            <ShieldX size={20} className="text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.banned')}</p>
                            <p className="text-2xl font-bold text-surface-100">{bannedUsers.length}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Brain size={20} className="text-purple-400" />
                        </div>
                        <div>
                            <p className="text-xs text-surface-200/50">{t('dashboard.users.aiLimited', 'AI Custom')}</p>
                            <p className="text-2xl font-bold text-surface-100">
                                {customAiLimitUsers.length}
                                {blockedAiUsers.length > 0 && (
                                    <span className="text-xs text-red-400/70 font-normal ml-1">({blockedAiUsers.length} blocked)</span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex bg-surface-800/50 rounded-xl p-1 self-start">
                    <button
                        onClick={() => switchTab('all')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                    >
                        {t('dashboard.users.active')} ({users.length})
                    </button>
                    <button
                        onClick={() => switchTab('banned')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'banned' ? 'bg-red-500/20 text-red-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                    >
                        {t('dashboard.users.banned')} ({bannedUsers.length})
                    </button>
                </div>
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('dashboard.users.searchPlaceholder')}
                        className="input-field !pl-10 !py-2 !text-sm"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-3 py-3 w-10">
                                    <input type="checkbox" checked={selected.size === filteredUsers.length && filteredUsers.length > 0}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-white/20 bg-white/5 accent-brand-500 cursor-pointer" />
                                </th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">ID</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Name</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.language')}</th>
                                <th className="text-left px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.lastSeen')}</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.users.walletLimit', 'Wallet Limit')}</th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">
                                    <span className="flex items-center gap-1 justify-end">
                                        <Brain size={12} className="text-purple-400/50" />
                                        {t('dashboard.users.aiLimit', 'AI Limit')}
                                    </span>
                                </th>
                                <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-8 text-surface-200/40">{t('dashboard.common.loading')}</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-8 text-surface-200/40">{t('dashboard.users.noUsers')}</td></tr>
                            ) : (
                                filteredUsers.map((u) => {
                                    const uid = u.chatId || u.userId;
                                    return (
                                    <tr key={uid} className={`table-row ${selected.has(uid) ? 'bg-brand-500/[0.04]' : ''}`}>
                                        <td className="px-3 py-3">
                                            <input type="checkbox" checked={selected.has(uid)}
                                                onChange={() => toggleSelect(uid)}
                                                className="w-4 h-4 rounded border-white/20 bg-white/5 accent-brand-500 cursor-pointer" />
                                        </td>
                                        <td className="px-5 py-3 font-mono text-xs text-surface-200/60">{u.chatId || u.userId}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-surface-100 font-medium">{u.firstName || u.username || '—'}</span>
                                                {u.username && <span className="text-surface-200/40 text-xs">@{u.username}</span>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-surface-200/60">{u.lang || 'en'}</td>
                                        <td className="px-5 py-3 text-surface-200/60 text-xs">{formatDate(u.lastSeen)}</td>
                                        <td className="px-5 py-3 text-right">
                                            {tab !== 'banned' && (
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Wallet size={10} className="text-surface-200/30" />
                                                    <CustomSelect
                                                        value={u.walletLimit || 50}
                                                        onChange={async (val) => {
                                                            try {
                                                                await api.setUserWalletLimit(u.chatId || u.userId, parseInt(val, 10));
                                                                fetchData();
                                                            } catch {}
                                                        }}
                                                        size="sm"
                                                        className="w-20"
                                                        options={[50, 100, 200, 300, 500, 1000].map(n => ({ value: n, label: String(n) }))}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {tab !== 'banned' && (
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Brain size={10} className="text-purple-400/30" />
                                                    <CustomSelect
                                                        value={u.aiDailyLimit ?? 50}
                                                        onChange={async (val) => {
                                                            try {
                                                                await api.setUserAiLimit([uid], parseInt(val, 10));
                                                                fetchData();
                                                            } catch {}
                                                        }}
                                                        size="sm"
                                                        className="w-20"
                                                        options={[
                                                            { value: 0, label: '🚫 0' },
                                                            { value: 10, label: '10' },
                                                            { value: 25, label: '25' },
                                                            { value: 50, label: '50' },
                                                            { value: 100, label: '100' },
                                                            { value: 200, label: '200' },
                                                            { value: -1, label: '∞' },
                                                        ]}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center gap-1.5 justify-end">
                                                {/* Send DM button */}
                                                {tab !== 'banned' && (
                                                    <button onClick={() => { setMessageTargets([uid]); setShowMessageModal(true); }}
                                                        className="p-1.5 rounded-lg text-surface-200/40 hover:text-brand-400 hover:bg-brand-500/10 transition-all"
                                                        title={t('dashboard.users.sendDM', 'Send DM')}>
                                                        <MessageSquare size={13} />
                                                    </button>
                                                )}
                                                {tab === 'banned' ? (
                                                    <button onClick={() => handleUnban(u.userId)} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
                                                        {t('dashboard.users.unban')}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleBan(u.chatId)} className="text-xs text-red-400 hover:text-red-300 font-medium">
                                                        {t('dashboard.users.ban')}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Floating Bulk Action Bar */}
            {selected.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s_ease] pointer-events-auto">
                    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface-800/95 border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl">
                        <CheckSquare size={16} className="text-brand-400" />
                        <span className="text-sm text-surface-100 font-medium">{t('dashboard.users.selectedCount', { count: selected.size })}</span>
                        <div className="w-px h-5 bg-white/10" />

                        {/* Send Message */}
                        <button onClick={() => { setMessageTargets([...selected]); setShowMessageModal(true); }}
                            className="px-3 py-1.5 rounded-lg bg-brand-500/15 text-brand-400 text-xs font-medium hover:bg-brand-500/25 transition-all flex items-center gap-1.5">
                            <Send size={11} /> {t('dashboard.users.sendMessage', 'Send Message')}
                        </button>

                        {/* Set AI Limit */}
                        {tab !== 'banned' && (
                            <button onClick={() => { setMessageTargets([...selected]); setShowAiLimitModal(true); }}
                                className="px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-medium hover:bg-purple-500/25 transition-all flex items-center gap-1.5">
                                <Brain size={11} /> {t('dashboard.users.setAiLimit', 'AI Limit')}
                            </button>
                        )}

                        {/* Set Wallet Limit */}
                        {tab !== 'banned' && (
                            <button onClick={() => { setMessageTargets([...selected]); setShowWalletLimitModal(true); }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-all flex items-center gap-1.5">
                                <Wallet size={11} /> {t('dashboard.users.setWalletLimit', 'Wallet Limit')}
                            </button>
                        )}

                        {/* Ban / Unban */}
                        {tab === 'banned' ? (
                            <button onClick={handleBulkUnban} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-all">
                                ✅ {t('dashboard.users.unbanAll', 'Unban All')}
                            </button>
                        ) : (
                            <button onClick={handleBulkBan} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-all">
                                🚫 {t('dashboard.users.banAll', 'Ban All')}
                            </button>
                        )}
                        <button onClick={() => setSelected(new Set())} className="px-2 py-1.5 rounded-lg text-surface-200/40 hover:text-surface-200/70 text-xs transition-all">
                            {t('dashboard.common.cancel', 'Cancel')}
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            <SendMessageModal
                open={showMessageModal}
                onClose={() => setShowMessageModal(false)}
                targetUsers={messageTargets}
                allUsers={users}
                onSend={handleSendMessage}
            />
            <AiLimitModal
                open={showAiLimitModal}
                onClose={() => setShowAiLimitModal(false)}
                targetUsers={messageTargets}
                allUsersCount={users.length}
                onSetLimit={handleSetAiLimit}
            />
            <WalletLimitModal
                open={showWalletLimitModal}
                onClose={() => setShowWalletLimitModal(false)}
                targetUsers={messageTargets}
                allUsersCount={users.length}
                onSetLimit={handleSetWalletLimit}
            />
        </div>
    );
}
