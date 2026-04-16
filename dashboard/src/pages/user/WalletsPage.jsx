import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import useAuthStore from '@/stores/authStore';
import CustomSelect from '@/components/ui/CustomSelect';
import {
    Wallet, Plus, Trash2, Star, RefreshCw, Eye, EyeOff, Copy, Check,
    ExternalLink, AlertTriangle, Loader2, ChevronDown, Shield, Download,
    Key, Pencil, Send, X, ArrowUpDown, Upload, FileText, CheckSquare, Square,
    Lock, Tag, BarChart3, Search, LayoutGrid, List, GripVertical, Link, Globe
} from 'lucide-react';

const CHAIN_NAMES = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
const CHAIN_OPTIONS = Object.entries(CHAIN_NAMES).map(([k, v]) => ({ value: k, label: v }));
const EXPLORERS = { '196': 'https://www.okx.com/web3/explorer/xlayer', '1': 'https://etherscan.io', '56': 'https://bscscan.com', '137': 'https://polygonscan.com' };
const PRESET_TAGS = ['Trading', 'Holding', 'DCA', 'Airdrop', 'Test'];
const TAG_COLORS = { Trading: 'bg-blue-500/15 text-blue-400 border-blue-500/20', Holding: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', DCA: 'bg-purple-500/15 text-purple-400 border-purple-500/20', Airdrop: 'bg-amber-500/15 text-amber-400 border-amber-500/20', Test: 'bg-gray-500/15 text-gray-400 border-gray-500/20' };

// PIN verification cache (5 min)
let _pinVerifiedAt = 0;
const isPinCacheValid = () => Date.now() - _pinVerifiedAt < 300_000;
const cachePinVerified = () => { _pinVerifiedAt = Date.now(); };

// Balance cache (30s TTL) — prevents redundant API calls across re-renders
const _balanceCache = new Map();
const CACHE_TTL = 30_000;
function getCachedBalance(walletId, chainIndex) {
    const key = `${walletId}:${chainIndex}`;
    const cached = _balanceCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;
    return null;
}
function setCachedBalance(walletId, chainIndex, data) {
    _balanceCache.set(`${walletId}:${chainIndex}`, { data, fetchedAt: Date.now() });
}

function formatUsd(val) {
    const n = Number(val || 0);
    return n < 0.01 && n > 0 ? `$${n.toFixed(6)}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddr(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
}

/* ── Set PIN Modal ── */
function SetPinModal({ hasPin, onClose, onDone }) {
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (!/^\d{4,6}$/.test(newPin)) { setError('PIN phải 4-6 chữ số'); return; }
        if (newPin !== confirmPin) { setError('PIN xác nhận không khớp'); return; }
        if (hasPin && !currentPin) { setError('Nhập PIN hiện tại'); return; }
        setLoading(true); setError('');
        try {
            await api.setPin(newPin, hasPin ? currentPin : undefined);
            cachePinVerified();
            onDone();
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <Lock className="text-brand-400" size={20} />
                    <h3 className="text-lg font-bold text-surface-100">{hasPin ? 'Đổi mã PIN' : 'Thiết lập PIN'}</h3>
                </div>
                <div className="space-y-3 mb-4">
                    {hasPin && (
                        <input type="password" maxLength={6} value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="PIN hiện tại" className="input-field text-sm text-center tracking-[0.5em]" />
                    )}
                    <input type="password" maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="PIN mới (4-6 số)" className="input-field text-sm text-center tracking-[0.5em]" />
                    <input type="password" maxLength={6} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Xác nhận PIN" className="input-field text-sm text-center tracking-[0.5em]" />
                </div>
                {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                <div className="flex gap-3">
                    <button onClick={onClose} className="btn-secondary flex-1 text-sm">Hủy</button>
                    <button onClick={submit} disabled={loading} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                        {hasPin ? 'Đổi PIN' : 'Đặt PIN'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── PIN Verify Modal (for sensitive operations) ── */
function PinVerifyModal({ onVerified, onClose }) {
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        setLoading(true); setError('');
        try {
            const res = await api.verifyPin(pin);
            if (res.valid) { cachePinVerified(); onVerified(pin); }
            else { setError('Mã PIN không đúng'); }
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <Lock className="text-amber-400" size={20} />
                    <h3 className="text-lg font-bold text-surface-100">Nhập PIN</h3>
                </div>
                <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    placeholder="••••" className="input-field text-sm text-center tracking-[0.5em] mb-3" autoFocus />
                {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                <div className="flex gap-3">
                    <button onClick={onClose} className="btn-secondary flex-1 text-sm">Hủy</button>
                    <button onClick={submit} disabled={loading || pin.length < 4} className="btn-primary flex-1 text-sm">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : 'Xác nhận'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Portfolio Chart (SVG sparkline) ── */
function PortfolioChart({ days = 30 }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getPortfolioHistory(days).then(r => setData(r.snapshots || [])).catch(() => {}).finally(() => setLoading(false));
    }, [days]);

    if (loading || data.length < 2) return null;

    const W = 320, H = 60, PAD = 0;
    const values = data.map(d => d.totalUsd);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((v, i) => {
        const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
        const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
        return `${x},${y}`;
    }).join(' ');

    const isUp = values[values.length - 1] >= values[0];

    return (
        <div className="glass-card p-3">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-surface-200/40 flex items-center gap-1"><BarChart3 size={10} /> Portfolio {days}d</span>
                <span className={`text-[10px] font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatUsd(values[values.length - 1])}
                </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 50 }}>
                <defs>
                    <linearGradient id="pgFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={`${PAD},${H} ${points} ${W - PAD},${H}`} fill="url(#pgFill)" />
                <polyline points={points} fill="none" stroke={isUp ? '#10b981' : '#ef4444'} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
        </div>
    );
}

/* ── Create Wallet Modal ── */
function CreateWalletModal({ currentCount, limit, onClose, onCreated }) {
    const { user } = useAuthStore();
    const { t } = useTranslation();
    const [chainIndex, setChainIndex] = useState('196');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [count, setCount] = useState(1);
    const [showKey, setShowKey] = useState(false);
    const [copied, setCopied] = useState(false);
    const maxCreate = Math.max(0, limit - currentCount);

    const create = async () => {
        if (count < 1 || count > maxCreate) return;
        setLoading(true);
        const newResults = [];
        let errMessage = null;
        try {
            for (let i = 0; i < count; i++) {
                const data = await api.createWallet();
                if (data.error) throw new Error(data.error);
                newResults.push(data);
            }
        } catch (err) {
            errMessage = err.message;
        } finally {
            setLoading(false);
            if (newResults.length > 0 || errMessage) {
                setResults({ items: newResults, error: errMessage });
            }
        }
    };

    const copyAll = () => {
        if (!results || !results.items) return;
        const text = results.items.map(r => `${r.privateKey}  ${r.wallet?.name}  ${r.wallet?.address}`).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadCsv = () => {
        if (!results || !results.items) return;
        const timestamp = new Date().toLocaleString();
        let text = 'Private Key,Wallet Name,Address,Creation Time\n';
        text += results.items.map(r => `${r.privateKey},"${r.wallet?.name || ''}",${r.wallet?.address},"${timestamp}"`).join('\n');
        const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const uIdentifier = user?.username || user?.userId || 'user';
        const dObj = new Date();
        const dString = `${dObj.getFullYear()}${String(dObj.getMonth() + 1).padStart(2, '0')}${String(dObj.getDate()).padStart(2, '0')}_${String(dObj.getHours()).padStart(2, '0')}${String(dObj.getMinutes()).padStart(2, '0')}`;
        const chainName = CHAIN_NAMES[chainIndex] || 'Chain';
        const chainTag = `${chainName.replace(/\s+/g, '')}_${chainIndex}`;
        a.download = `wallets_${uIdentifier}_${chainTag}_${results.items.length}_${dString}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {!results ? (
                    <>
                        <h3 className="text-lg font-bold text-surface-100 mb-2">{t('dashboard.walletPage.createTitle', 'Create New Wallet')}</h3>
                        <p className="text-xs text-surface-200/50 mb-6">{t('dashboard.walletPage.createDesc', 'A new trading wallet will be created on X Layer. Save the private key securely — it will only be shown once.')}</p>
                        
                        <div className="mb-4">
                            <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">Chain</label>
                            <CustomSelect value={chainIndex} onChange={setChainIndex} size="sm" options={CHAIN_OPTIONS.map(c => ({ value: c.value, label: c.label }))} />
                        </div>

                        <div className="mb-6">
                            <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">
                                {t('dashboard.walletPage.walletAmount', 'Number of wallets to create')} (Max: {maxCreate})
                            </label>
                            <input 
                                type="number" 
                                min={1} 
                                max={maxCreate} 
                                value={count} 
                                onChange={e => setCount(Math.min(maxCreate, Math.max(1, parseInt(e.target.value) || 1)))}
                                className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-surface-100 outline-none focus:border-brand-500/50 transition-colors"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel', 'Cancel')}</button>
                            <button onClick={create} disabled={loading || count < 1 || count > maxCreate} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                {t('dashboard.walletPage.createBtn', 'Create')}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            {results.error && results.items.length === 0 ? (
                                <AlertTriangle className="text-red-400" size={20} />
                            ) : (
                                <Shield className="text-emerald-400" size={20} />
                            )}
                            <h3 className={`text-lg font-bold ${results.error && results.items.length === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {results.error && results.items.length === 0 ? t('dashboard.walletPage.errorTitle', 'Error') : t('dashboard.walletPage.createdTitle', 'Wallet Created!')}
                            </h3>
                        </div>
                        
                        {results.error && (
                            <p className="text-sm text-red-400/80 mb-4 bg-red-500/10 p-3 rounded-xl border border-red-500/20">{results.error}</p>
                        )}
                        
                        {results.items.length > 0 && (
                            <div className="space-y-3 mb-4" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                                {results.items.map((r, i) => (
                                    <div key={i} className="bg-surface-800/80 p-3 rounded-xl">
                                        <div className="mb-2">
                                            <span className="text-[10px] text-surface-200/40">{r.wallet?.name} • </span>
                                            <code className="text-[10px] text-brand-400 break-all">
                                                {r.wallet?.address}
                                            </code>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">{t('dashboard.walletPage.privateKey', 'Private Key')}</label>
                                            <code className="block bg-surface-900/50 px-3 py-2 rounded-lg text-xs text-amber-400/80 break-all">
                                                {showKey ? r.privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                                            </code>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {results.items.length > 0 && (
                            <>
                                <p className="text-[9px] text-amber-400/50 mb-3 flex items-center gap-1">
                                    <AlertTriangle size={8} /> {t('dashboard.walletPage.saveKeyWarning', 'Save this key! It will not be shown again.')}
                                </p>
                                <div className="flex gap-2 mb-4">
                                    <button onClick={() => setShowKey(!showKey)} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                        {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                                        {showKey ? t('dashboard.walletPage.hide', 'Hide') : t('dashboard.walletPage.show', 'Show')}
                                    </button>
                                    <button onClick={copyAll} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                        {t('dashboard.walletPage.copyAll', 'Copy All')}
                                    </button>
                                    <button onClick={downloadCsv} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                        <FileText size={12} /> {t('dashboard.walletPage.saveCsv', 'Save CSV')}
                                    </button>
                                </div>
                            </>
                        )}
                        <button onClick={() => { onCreated(); onClose(); }} className="btn-primary w-full text-sm">{t('dashboard.walletPage.done', 'Done')}</button>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Import Wallet Modal (Bulk + File) ── */
function ImportWalletModal({ currentCount, limit, onClose, onImported }) {
    const { t } = useTranslation();
    const [rows, setRows] = useState([{ key: '', name: '' }]);
    const [showKeys, setShowKeys] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [chainIndex, setChainIndex] = useState('196');
    const fileRef = useRef(null);

    const maxCreate = Math.max(0, limit - currentCount);
    const maxImport = maxCreate;

    const updateRow = (i, field, val) => {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
    };
    const addRow = () => {
        if (rows.length >= maxImport) return;
        setRows(prev => [...prev, { key: '', name: '' }]);
    };
    const removeRow = (i) => setRows(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i));

    const validCount = rows.filter(r => r.key.trim()).length;

    const handleImport = async () => {
        const keys = rows.filter(r => r.key.trim()).slice(0, maxImport).map(r => ({ key: r.key.trim(), name: r.name.trim() || undefined }));
        if (keys.length === 0) return;
        setLoading(true);
        try {
            const data = await api.importWallet(keys);
            setResult(data);
        } catch (err) {
            setResult({ error: err.message });
        } finally {
            setLoading(false);
        }
    };

    // Parse lines into rows
    const parseLines = (text) => {
        const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
        return lines.slice(0, maxImport).map(line => {
            // Support: key,name,address... | key\tname... | key name
            const csvMatch = line.match(/^([0-9a-fA-Fx]+)[,\t]\s*([^,\t]*)/);
            if (csvMatch) {
                let name = csvMatch[2].trim();
                // Remove surrounding quotes if they exist from CSV
                if (name.startsWith('"') && name.endsWith('"')) name = name.substring(1, name.length - 1);
                return { key: csvMatch[1], name };
            }
            const parts = line.split(/\s+/);
            const key = parts[0] || '';
            const rest = parts.slice(1).join(' ').trim();
            return { key, name: rest };
        });
    };

    // Paste handler
    const handlePaste = (e) => {
        const text = e.clipboardData?.getData('text') || '';
        const lines = text.split(/[\n\r]+/).filter(l => l.trim());
        if (lines.length > 1) {
            e.preventDefault();
            setRows(parseLines(text));
        }
    };

    // File upload handler (txt/csv)
    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result || '';
            const parsed = parseLines(text);
            if (parsed.length > 0) setRows(parsed);
        };
        reader.readAsText(file);
        e.target.value = ''; // reset
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {!result ? (
                    <>
                        <div className="flex items-center gap-2 mb-3">
                            <Download className="text-brand-400" size={20} />
                            <h3 className="text-lg font-bold text-surface-100">{t('dashboard.walletPage.importTitle', 'Import Wallets')}</h3>
                        </div>
                        <p className="text-xs text-surface-200/50 mb-1">
                            {t('dashboard.walletPage.importDesc', 'Paste or upload EVM private keys. Each will be encrypted with AES-256-CBC.')}
                        </p>
                        
                        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 mb-4 mt-2">
                            <p className="text-[10px] text-brand-400 font-semibold mb-1 flex items-center gap-1">
                                <AlertTriangle size={10} /> 
                                {t('dashboard.walletPage.importLimitMax', 'Bạn có thể thêm tối đa {{max}} ví nữa', { max: maxImport })}
                            </p>
                            <p className="text-[10px] text-surface-200/60 leading-relaxed font-mono mt-1">
                                {t('dashboard.walletPage.importFormatInfo', 'Định dạng hỗ trợ file TXT/CSV (mỗi ví 1 dòng):')}
                                <br />• 0x123...abc <span className="text-surface-200/40">(chỉ có Private Key)</span>
                                <br />• 0x123...abc, Wallet Name <span className="text-surface-200/40">(Private Key phẩy Tên ví)</span>
                                <br />• 0x123...abc Wallet Name <span className="text-surface-200/40">(Private Key khoảng trắng Tên ví)</span>
                            </p>
                        </div>

                        {/* File upload zone */}
                        <input ref={fileRef} type="file" accept=".txt,.csv" onChange={handleFile} className="hidden" />
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={maxImport <= 0}
                            className="w-full mb-3 py-3 border-2 border-dashed border-white/10 rounded-xl text-xs text-surface-200/40 hover:border-brand-500/30 hover:text-brand-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Upload size={14} /> {t('dashboard.walletPage.uploadOrPaste', 'Upload file (.txt / .csv) or paste below')}
                        </button>

                        <div className="space-y-2 mb-3" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                            {rows.map((row, i) => (
                                <div key={i} className="flex gap-2 items-start">
                                    <span className="text-[9px] text-surface-200/20 pt-2.5 w-4 text-right flex-shrink-0">{i + 1}</span>
                                    <div className="flex-1">
                                        <input
                                            type={showKeys ? 'text' : 'password'}
                                            value={row.key}
                                            onChange={e => updateRow(i, 'key', e.target.value)}
                                            onPaste={i === 0 ? handlePaste : undefined}
                                            placeholder="0x... (private key)"
                                            className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2.5 py-2 text-[11px] text-surface-100 outline-none focus:border-brand-500/40 font-mono"
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="w-28">
                                        <input
                                            type="text"
                                            value={row.name}
                                            onChange={e => updateRow(i, 'name', e.target.value)}
                                            placeholder={t('dashboard.walletPage.nameLabel', 'Name')}
                                            maxLength={30}
                                            className="w-full bg-surface-800/80 border border-white/[0.08] rounded-lg px-2.5 py-2 text-[11px] text-surface-100 outline-none focus:border-brand-500/40"
                                        />
                                    </div>
                                    {rows.length > 1 && (
                                        <button onClick={() => removeRow(i)} className="p-2 text-surface-200/20 hover:text-red-400 transition-colors flex-shrink-0">
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 mb-5">
                            <button onClick={addRow} disabled={rows.length >= maxImport} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                <Plus size={12} /> {t('dashboard.walletPage.addKey', 'Add key')} ({rows.length}/{maxImport})
                            </button>
                            <button onClick={() => setShowKeys(!showKeys)} className="text-xs text-surface-200/30 hover:text-surface-200/60 flex items-center gap-1 transition-colors ml-auto">
                                {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                                {showKeys ? t('dashboard.walletPage.hide', 'Hide') : t('dashboard.walletPage.show', 'Show')}
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel', 'Cancel')}</button>
                            <button onClick={handleImport} disabled={loading || validCount === 0} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                {t('dashboard.walletPage.importBtn', 'Import')} {validCount > 1 ? `(${validCount})` : ''}
                            </button>
                        </div>
                    </>
                ) : result.error ? (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="text-red-400" size={20} />
                            <h3 className="text-lg font-bold text-red-400">{t('dashboard.walletPage.importFailed', 'Import Failed')}</h3>
                        </div>
                        <p className="text-sm text-surface-200/70 mb-4">{result.error}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setResult(null)} className="btn-secondary flex-1 text-sm">{t('dashboard.walletPage.tryAgain', 'Try Again')}</button>
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.walletPage.close', 'Close')}</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="text-emerald-400" size={20} />
                            <h3 className="text-lg font-bold text-emerald-400">{t('dashboard.walletPage.importComplete', 'Import Complete!')}</h3>
                        </div>
                        <div className="space-y-3 mb-4">
                            {result.results?.imported?.length > 0 && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                    <p className="text-xs font-bold text-emerald-400 mb-1.5">✅ {t('dashboard.walletPage.imported', 'Imported')} ({result.results.imported.length})</p>
                                    {result.results.imported.map((w, i) => (
                                        <p key={i} className="text-[11px] text-surface-200/60 font-mono">{w.name}: {shortAddr(w.address)}</p>
                                    ))}
                                </div>
                            )}
                            {result.results?.duplicates?.length > 0 && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                    <p className="text-xs font-bold text-amber-400 mb-1">⚠️ {t('dashboard.walletPage.duplicates', 'Duplicates')} ({result.results.duplicates.length})</p>
                                    {result.results.duplicates.map((w, i) => (
                                        <p key={i} className="text-[10px] text-surface-200/50 font-mono break-all">{w.address} — {t('dashboard.walletPage.alreadyExists', 'already exists')}</p>
                                    ))}
                                </div>
                            )}
                            {result.results?.invalid?.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <p className="text-xs font-bold text-red-400 mb-1">❌ {t('dashboard.walletPage.invalid', 'Invalid')} ({result.results.invalid.length})</p>
                                    {result.results.invalid.map((w, i) => (
                                        <p key={i} className="text-[11px] text-surface-200/50">{w.key}: {w.error}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={() => { onImported(); onClose(); }} className="btn-primary w-full text-sm">{t('dashboard.walletPage.done', 'Done')}</button>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

/* ── Export Key Modal (single) — with PIN support ── */
function ExportKeyModal({ walletId, walletAddress, onClose }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [privateKey, setPrivateKey] = useState(null);
    const [showKey, setShowKey] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const [needPin, setNeedPin] = useState(false);
    const [pin, setPin] = useState('');
    const timerRef = useRef(null);

    const exportKey = async (pinOverride) => {
        setLoading(true); setError(null);
        const usePin = pinOverride || pin || undefined;
        try {
            const data = await api.exportWalletKey(walletId, usePin);
            if (usePin) cachePinVerified();
            setPrivateKey(data.privateKey);
            setNeedPin(false);
            timerRef.current = setTimeout(() => { setPrivateKey(null); setShowKey(false); onClose(); }, 30000);
        } catch (err) {
            if (err.message === 'PIN required' || err.message?.includes('PIN')) {
                if (isPinCacheValid()) {
                    // PIN was recently verified, should not happen — but retry is harmless
                }
                setNeedPin(true);
                setError(null);
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = () => {
        if (pin.length < 4) return;
        exportKey(pin);
    };

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const copyKey = () => {
        navigator.clipboard.writeText(privateKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        // Auto-lock: hide key and close after 5s
        setTimeout(() => { setPrivateKey(null); setShowKey(false); onClose(); }, 5000);
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <Key className="text-amber-400" size={20} />
                    <h3 className="text-lg font-bold text-surface-100">{t('dashboard.walletPage.exportTitle')}</h3>
                </div>

                {error && !needPin ? (
                    <>
                        <p className="text-sm text-red-400 mb-4">{error}</p>
                        <button onClick={onClose} className="btn-secondary w-full text-sm">{t('dashboard.walletPage.close')}</button>
                    </>
                ) : needPin && !privateKey ? (
                    <>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
                            <p className="text-xs text-amber-400 flex items-start gap-2">
                                <Lock size={14} className="mt-0.5 flex-shrink-0" />
                                <span>{t('dashboard.walletPage.enterPin')}</span>
                            </p>
                        </div>
                        <p className="text-xs text-surface-200/50 mb-3">
                            Wallet: <code className="text-brand-400 text-[10px] break-all">{walletAddress}</code>
                        </p>
                        <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                            placeholder="••••" className="input-field text-sm text-center tracking-[0.5em] mb-3" autoFocus />
                        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel')}</button>
                            <button onClick={handlePinSubmit} disabled={loading || pin.length < 4} className="flex-1 text-sm flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                                {t('dashboard.walletPage.confirm')}
                            </button>
                        </div>
                    </>
                ) : !privateKey ? (
                    <>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5">
                            <p className="text-xs text-red-400 flex items-start gap-2">
                                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                <span>{t('dashboard.walletPage.exportWarning')}</span>
                            </p>
                        </div>
                        <p className="text-xs text-surface-200/50 mb-4">
                            Wallet: <code className="text-brand-400 text-[10px] break-all">{walletAddress}</code>
                        </p>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel')}</button>
                            <button onClick={() => exportKey()} disabled={loading} className="flex-1 text-sm flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                                {t('dashboard.walletPage.revealKey')}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">{t('dashboard.walletPage.privateKey')}</label>
                            <div className="relative">
                                <code className="block bg-surface-800/80 px-3 py-2 rounded-lg text-xs text-amber-400/80 break-all pr-16">
                                    {showKey ? privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                                </code>
                                <div className="absolute right-1 top-1 flex gap-1">
                                    <button onClick={() => setShowKey(!showKey)} className="p-1 rounded hover:bg-white/5">
                                        {showKey ? <EyeOff size={12} className="text-surface-200/40" /> : <Eye size={12} className="text-surface-200/40" />}
                                    </button>
                                    <button onClick={copyKey} className="p-1 rounded hover:bg-white/5">
                                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-surface-200/40" />}
                                    </button>
                                </div>
                            </div>
                            <p className="text-[9px] text-amber-400/50 mt-1 flex items-center gap-1">
                                <AlertTriangle size={8} /> {t('dashboard.walletPage.autoHide')}
                            </p>
                        </div>
                        <button onClick={onClose} className="btn-secondary w-full text-sm mt-4">{t('dashboard.walletPage.close')}</button>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

/* ── Bulk Export Modal ── */
function BulkExportModal({ walletIds, wallets, balances, onClose }) {
    const { user } = useAuthStore();
    const { t } = useTranslation();
    const [chainIndex, setChainIndex] = useState('196');
    const [loading, setLoading] = useState(false);
    const [keys, setKeys] = useState(null);
    const [showKeys, setShowKeys] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const [needPin, setNeedPin] = useState(false);
    const [pin, setPin] = useState('');
    const timerRef = useRef(null);

    const exportAll = async (pinOverride) => {
        setLoading(true); setError(null);
        const usePin = pinOverride || pin || undefined;
        try {
            const data = await api.bulkExportKeys(walletIds, usePin);
            if (usePin) cachePinVerified();
            const results = (data.results || []).map(r => ({
                ...r,
                name: r.name || wallets.find(w => w.id === r.id)?.walletName || 'Wallet'
            }));
            setKeys(results);
            setNeedPin(false);
            timerRef.current = setTimeout(() => { setKeys(null); setShowKeys(false); onClose(); }, 60000);
        } catch (err) {
            if (err.message === 'PIN required' || err.message?.includes('PIN')) {
                if (isPinCacheValid()) {
                    // PIN was recently verified — shouldn't happen
                }
                setNeedPin(true);
                if (err.message !== 'PIN required') setError(err.message);
                else setError(null);
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = () => {
        if (pin.length < 4) return;
        exportAll(pin);
    };

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        // Clear keys from memory on unmount
    }, []);

    const copyAll = () => {
        const text = keys.map(k => `${k.privateKey}  ${k.name}  ${k.address}`).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        // Auto-lock: hide keys after 5s post-copy
        setTimeout(() => { setKeys(null); setShowKeys(false); onClose(); }, 5000);
    };

    const downloadFile = () => {
        const timestamp = new Date().toLocaleString();
        let text = 'Private Key,Wallet Name,Address,Balance ($),Export Time\n';
        text += keys.map(k => `${k.privateKey},"${k.name || ''}",${k.address},${balances?.[k.id] || 0},"${timestamp}"`).join('\n');
        const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const uIdentifier = user?.username || user?.userId || 'user';
        const dObj = new Date();
        const dString = `${dObj.getFullYear()}${String(dObj.getMonth() + 1).padStart(2, '0')}${String(dObj.getDate()).padStart(2, '0')}_${String(dObj.getHours()).padStart(2, '0')}${String(dObj.getMinutes()).padStart(2, '0')}`;
        const chainName = CHAIN_NAMES[chainIndex] || 'Chain';
        const chainTag = `${chainName.replace(/\s+/g, '')}_${chainIndex}`;
        a.download = `wallets_${uIdentifier}_${chainTag}_${keys.length}_${dString}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <Key className="text-amber-400" size={20} />
                    <h3 className="text-lg font-bold text-surface-100">{t('dashboard.walletPage.exportBulkTitle', 'Export {{count}} Wallets', { count: walletIds.length })}</h3>
                </div>

                {!keys && !loading && (
                    <div className="mb-4">
                        <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">Chain tag for exported file name</label>
                        <CustomSelect value={chainIndex} onChange={setChainIndex} size="sm" options={CHAIN_OPTIONS.map(c => ({ value: c.value, label: c.label }))} />
                    </div>
                )}

                {error && !needPin ? (
                    <>
                        <p className="text-sm text-red-400 mb-4">{error}</p>
                        <button onClick={onClose} className="btn-secondary w-full text-sm">{t('dashboard.walletPage.close', 'Close')}</button>
                    </>
                ) : needPin && !keys ? (
                    <>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
                            <p className="text-xs text-amber-400 flex items-start gap-2">
                                <Lock size={14} className="mt-0.5 flex-shrink-0" />
                                <span>{t('dashboard.walletPage.enterPin', 'Enter PIN to export private keys')}</span>
                            </p>
                        </div>
                        <p className="text-xs text-surface-200/50 mb-3">
                            {walletIds.length} {t('dashboard.walletPage.bulkExportDesc', 'wallets selected')}
                        </p>
                        <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                            placeholder="••••" className="input-field text-sm text-center tracking-[0.5em] mb-3" autoFocus />
                        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel', 'Cancel')}</button>
                            <button onClick={handlePinSubmit} disabled={loading || pin.length < 4} className="flex-1 text-sm flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                                {t('dashboard.walletPage.confirm', 'Confirm')}
                            </button>
                        </div>
                    </>
                ) : !keys ? (
                    <>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                            <p className="text-xs text-red-400 flex items-start gap-2">
                                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                <span>{t('dashboard.walletPage.bulkExportWarning', 'You are about to export private keys for {{count}} wallets. Never share these with anyone!', { count: walletIds.length })}</span>
                            </p>
                        </div>
                        <div className="mb-4 space-y-1">
                            {walletIds.map(id => {
                                const w = wallets.find(w => w.id === id);
                                return <p key={id} className="text-xs text-surface-200/50 font-mono">• {w?.walletName}: {shortAddr(w?.address)}</p>;
                            })}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel', 'Cancel')}</button>
                            <button onClick={() => exportAll()} disabled={loading} className="flex-1 text-sm flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                                {t('dashboard.walletPage.revealAll', 'Reveal All')}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="space-y-2 mb-4" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                            {keys.map((k, i) => (
                                <div key={i} className="bg-surface-800/80 rounded-lg px-3 py-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-[10px] font-medium text-surface-200/60">{k.name}</p>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => { navigator.clipboard.writeText(k.address); }} className="p-0.5 rounded hover:bg-white/5 text-surface-200/30 hover:text-brand-400 transition-colors" title="Copy address">
                                                <Copy size={9} />
                                            </button>
                                            <a href={`https://www.okx.com/web3/explorer/xlayer/address/${k.address}`} target="_blank" rel="noopener" className="p-0.5 rounded hover:bg-white/5 text-surface-200/30 hover:text-brand-400 transition-colors" title="View on OKX Explorer">
                                                <ExternalLink size={9} />
                                            </a>
                                        </div>
                                    </div>
                                    <code className="text-[9px] text-surface-200/40 break-all block mb-1">{k.address}</code>
                                    <code className="text-[11px] text-amber-400/80 break-all block">
                                        {showKeys ? k.privateKey : '••••••••••••••••••••••••'}
                                    </code>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mb-3">
                            <button onClick={() => setShowKeys(!showKeys)} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                                {showKeys ? t('dashboard.walletPage.hide', 'Hide') : t('dashboard.walletPage.show', 'Show')}
                            </button>
                            <button onClick={copyAll} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                {t('dashboard.walletPage.copyAll', 'Copy All')}
                            </button>
                            <button onClick={downloadFile} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                <FileText size={12} /> {t('dashboard.walletPage.saveCsv', 'Save CSV')}
                            </button>
                        </div>
                        <p className="text-[9px] text-amber-400/50 mb-3 flex items-center gap-1">
                            <AlertTriangle size={8} /> {t('dashboard.walletPage.autoHideBulk', 'Auto-hides in 60 seconds')}
                        </p>
                        <button onClick={onClose} className="btn-secondary w-full text-sm">{t('dashboard.walletPage.close', 'Close')}</button>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

/* ── Wallet Card ── */
function WalletCard({ wallet, onRefresh, onSetDefault, onDelete, onRename, onTagsChange, selected, onToggleSelect, hasPinCode, onBalanceUpdate, globalChain, availableTags }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(wallet.walletName || '');
    const [showExport, setShowExport] = useState(false);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [showFullAddr, setShowFullAddr] = useState(false);
    const [selectedChain, setSelectedChain] = useState(globalChain || wallet.chainIndex || '196');
    const [showChainMenu, setShowChainMenu] = useState(false);
    const [settingDefault, setSettingDefault] = useState(false);

    useEffect(() => {
        if (globalChain) {
            setSelectedChain(globalChain);
        }
    }, [globalChain]);
    const [isVisible, setIsVisible] = useState(false);
    const nameInputRef = useRef(null);
    const chainBtnRef = useRef(null);
    const tagBtnRef = useRef(null);
    const cardRef = useRef(null);
    const hasLoadedRef = useRef(false);

    // IntersectionObserver: only load balance when card enters viewport
    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) setIsVisible(true);
        }, { rootMargin: '100px' });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const loadBalance = useCallback(async (force = false) => {
        if (!force) {
            const cached = getCachedBalance(wallet.id, selectedChain);
            if (cached) {
                setBalance(cached);
                const usd = (cached?.tokens || []).reduce((s, t) => s + Number(t.price || 0) * Number(t.balance || 0), 0);
                onBalanceUpdate?.(wallet.id, usd);
                return;
            }
        }
        setLoading(true);
        try {
            const data = await api.getWalletBalance(wallet.id, selectedChain);
            setBalance(data);
            setCachedBalance(wallet.id, selectedChain, data);
            const usd = (data?.tokens || []).reduce((s, t) => s + Number(t.price || 0) * Number(t.balance || 0), 0);
            onBalanceUpdate?.(wallet.id, usd);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [wallet.id, selectedChain, onBalanceUpdate]);

    // Load when visible (lazy) or when chain changes
    useEffect(() => {
        if (!isVisible) return;
        if (!hasLoadedRef.current || selectedChain !== wallet.chainIndex) {
            hasLoadedRef.current = true;
            loadBalance();
        }
    }, [isVisible, loadBalance, selectedChain, wallet.chainIndex]);

    const totalUsd = balance?.tokens?.reduce((sum, t) => sum + Number(t.price || 0) * Number(t.balance || 0), 0) || 0;
    const chainName = CHAIN_NAMES[selectedChain] || `Chain #${selectedChain}`;
    const explorer = EXPLORERS[selectedChain] || EXPLORERS['196'];
    const walletTags = (() => { try { return JSON.parse(wallet.tags || '[]'); } catch { return []; } })();
    const needsBackup = wallet.lastExportedAt === 0 || (Math.floor(Date.now() / 1000) - (wallet.lastExportedAt || 0) > 7 * 86400);

    const handleToggleTag = async (tag) => {
        const current = [...walletTags];
        const idx = current.indexOf(tag);
        if (idx >= 0) current.splice(idx, 1); else if (current.length < 5) current.push(tag);
        try { await api.updateWalletTags(wallet.id, current); onTagsChange(wallet.id, current); } catch {}
    };

    const copyAddr = () => {
        navigator.clipboard.writeText(wallet.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRename = async () => {
        const trimmed = editName.trim();
        if (!trimmed || trimmed === wallet.walletName) { setEditing(false); return; }
        try {
            await api.renameWallet(wallet.id, trimmed);
            onRename(wallet.id, trimmed);
        } catch { /* ignore */ }
        setEditing(false);
    };

    useEffect(() => { if (editing && nameInputRef.current) nameInputRef.current.focus(); }, [editing]);

    return (
        <>
            <div ref={cardRef} className={`glass-card overflow-hidden transition-all ${wallet.isDefault ? 'ring-1 ring-brand-500/30' : ''} ${selected ? 'ring-1 ring-amber-400/40' : ''}`}>
                {/* Header */}
                <div className="p-3 flex items-center gap-2.5">
                    {/* Select checkbox */}
                    <button onClick={() => onToggleSelect(wallet.id)} className="flex-shrink-0 text-surface-200/30 hover:text-brand-400 transition-colors">
                        {selected ? <CheckSquare size={16} className="text-amber-400" /> : <Square size={16} />}
                    </button>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${wallet.isDefault
                            ? 'bg-gradient-to-br from-brand-500 to-cyan-500'
                            : 'bg-surface-700/60 border border-white/5'
                        }`}>
                        <Wallet size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            {editing ? (
                                <input
                                    ref={nameInputRef}
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onBlur={handleRename}
                                    onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
                                    maxLength={30}
                                    className="bg-surface-800/80 border border-brand-500/40 rounded px-1.5 py-0.5 text-xs font-semibold text-surface-100 outline-none w-full"
                                />
                            ) : (
                                <h3
                                    className="text-xs font-semibold text-surface-100 cursor-pointer hover:text-brand-400 transition-colors group flex items-center gap-1 truncate"
                                    onClick={() => { setEditName(wallet.walletName || ''); setEditing(true); }}
                                    title={t('dashboard.walletPage.clickRename', 'Click to rename')}
                                >
                                    {wallet.walletName || t('dashboard.walletPage.defaultName', 'Trading Wallet')}
                                    <Pencil size={8} className="text-surface-200/20 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                                </h3>
                            )}
                            {wallet.isDefault && (
                                <span className="px-1 py-0.5 rounded text-[8px] bg-brand-500/15 text-brand-400 border border-brand-500/20 flex-shrink-0">{t('dashboard.walletPage.default', 'Default')}</span>
                            )}
                        </div>
                        {/* Chain badge + backup warning */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="relative">
                                <button
                                    ref={chainBtnRef}
                                    onClick={() => setShowChainMenu(!showChainMenu)}
                                    className="text-[8px] px-1 py-0.5 rounded bg-surface-700/60 border border-white/5 text-surface-200/40 hover:border-brand-500/30 hover:text-brand-400 transition-colors flex items-center gap-0.5 cursor-pointer"
                                >
                                    {chainName}
                                    <ChevronDown size={7} className={`transition-transform ${showChainMenu ? 'rotate-180' : ''}`} />
                                </button>
                                {showChainMenu && createPortal(
                                    <>
                                        <div className="fixed inset-0 z-[90]" onClick={() => setShowChainMenu(false)} />
                                        <div
                                            className="fixed z-[91] bg-surface-800 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[130px]"
                                            style={(() => {
                                                const r = chainBtnRef.current?.getBoundingClientRect();
                                                return r ? { top: r.bottom + 4, left: r.left } : {};
                                            })()}
                                        >
                                            {CHAIN_OPTIONS.map(c => (
                                                <button
                                                    key={c.value}
                                                    onClick={() => { setSelectedChain(c.value); setShowChainMenu(false); }}
                                                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 transition-colors flex items-center gap-2 ${selectedChain === c.value ? 'text-brand-400 font-semibold' : 'text-surface-200/50'}`}
                                                >
                                                    {selectedChain === c.value ? <Check size={9} /> : <span className="w-[9px]" />}
                                                    {c.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>,
                                    document.body
                                )}
                            </div>
                            <button onClick={loadBalance} className="text-surface-200/30 hover:text-brand-400 transition-colors flex-shrink-0" title={t('dashboard.walletPage.refresh')}>
                                <RefreshCw size={9} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <code 
                                onClick={(e) => { e.stopPropagation(); setShowFullAddr(!showFullAddr); }}
                                className={`text-[9px] text-surface-200/40 cursor-pointer hover:text-brand-400 transition-colors ${showFullAddr ? 'break-all' : ''}`}
                                title={showFullAddr ? t('dashboard.walletPage.hide', 'Hide') : t('dashboard.walletPage.show', 'Show full address')}
                            >
                                {showFullAddr ? wallet.address : shortAddr(wallet.address)}
                            </code>
                            <button onClick={copyAddr} className="text-surface-200/30 hover:text-brand-400 transition-colors flex-shrink-0">
                                {copied ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                            </button>
                            <a href={`${explorer}/address/${wallet.address}`} target="_blank" rel="noopener" className="text-surface-200/30 hover:text-brand-400 transition-colors">
                                <ExternalLink size={9} />
                            </a>
                            {needsBackup && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">⚠️ Backup</span>}
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                        {loading ? (
                            <Loader2 size={12} className="animate-spin text-surface-200/30" />
                        ) : (
                            <p className="text-sm font-bold text-surface-100">{formatUsd(totalUsd)}</p>
                        )}
                    </div>
                </div>

                {/* Token list (expandable) */}
                {balance?.tokens?.length > 0 && (
                    <>
                        <button onClick={() => setExpanded(!expanded)} className="w-full px-3 py-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-surface-200/40 hover:bg-white/[0.02] transition-colors">
                            <span>{balance.tokens.length} token{balance.tokens.length > 1 ? 's' : ''}</span>
                            <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                            <div className="border-t border-white/5 divide-y divide-white/5">
                                {balance.tokens.map((token, i) => {
                                    const price = Number(token.price || 0);
                                    const bal = Number(token.balance || 0);
                                    const usd = price * bal;
                                    return (
                                        <div key={i} className="px-3 py-2 flex items-center gap-2">
                                            {token.logoUrl ? (
                                                <img src={token.logoUrl} alt={token.symbol} className="w-6 h-6 rounded-full object-cover flex-shrink-0" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                                            ) : null}
                                            <div className={`w-6 h-6 rounded-full bg-surface-700/60 border border-white/5 flex items-center justify-center text-[9px] font-bold text-surface-200/60 flex-shrink-0 ${token.logoUrl ? 'hidden' : ''}`}>
                                                {token.symbol?.slice(0, 2) || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-medium text-surface-100">{token.symbol}</p>
                                                <p className="text-[9px] text-surface-200/30">{bal.toLocaleString('en-US', { maximumFractionDigits: 4 })}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-[10px] text-surface-100">{formatUsd(usd)}</p>
                                                <p className="text-[8px] text-surface-200/30">{price > 0 ? formatUsd(price) : ''}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {balance?.tokens?.length === 0 && !loading && (
                    <div className="px-3 py-2 border-t border-white/5 text-center text-[10px] text-surface-200/25">
                        📭 {t('dashboard.walletPage.emptyWallet', 'Empty — fund to trade')}
                    </div>
                )}

                {/* Tags row */}
                {walletTags.length > 0 && (
                    <div className="px-3 py-1 border-t border-white/5 flex items-center gap-1 flex-wrap">
                        {walletTags.map(tag => (
                            <span key={tag} className={`text-[8px] px-1.5 py-0.5 rounded-full border ${TAG_COLORS[tag] || 'bg-surface-700/40 text-surface-200/50 border-white/5'}`}>{tag}</span>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="px-3 py-2 border-t border-white/5 flex items-center gap-1">
                    <button onClick={() => { loadBalance(true); onRefresh(); }} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-brand-400 transition-colors" title={t('dashboard.walletPage.refresh', 'Refresh')}>
                        <RefreshCw size={11} />
                    </button>
                    <button 
                        onClick={async () => {
                            if (settingDefault) return;
                            setSettingDefault(true);
                            try { await onSetDefault(wallet.id); } finally { setSettingDefault(false); }
                        }} 
                        disabled={settingDefault}
                        className={`p-1 rounded-lg hover:bg-white/5 transition-all ${wallet.isDefault ? 'text-amber-400 scale-110' : 'text-surface-200/30 hover:text-amber-400'} ${settingDefault ? 'opacity-50 animate-pulse' : ''}`} 
                        title={wallet.isDefault ? t('dashboard.walletPage.unsetDefault', 'Remove Default') : t('dashboard.walletPage.setDefault', 'Set Default')}
                    >
                        {settingDefault ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} className={wallet.isDefault ? 'fill-amber-400' : ''} />}
                    </button>
                    <button onClick={() => setShowExport(true)} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-amber-400 transition-colors relative" title={hasPinCode ? t('dashboard.walletPage.exportKeyPin', 'Export Key (PIN required)') : t('dashboard.walletPage.exportKey', 'Export Key')}>
                        <Key size={11} />
                        {hasPinCode && <Lock size={6} className="absolute -top-0.5 -right-0.5 text-amber-400" />}
                    </button>
                    <div className="relative">
                        <button ref={tagBtnRef} onClick={() => setShowTagMenu(!showTagMenu)} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-purple-400 transition-colors" title={t('dashboard.walletPage.tags', 'Tags')}>
                            <Tag size={11} />
                        </button>
                        {showTagMenu && createPortal(
                            <>
                                <div className="fixed inset-0 z-[90]" onClick={() => setShowTagMenu(false)} />
                                <div className="fixed z-[91] bg-surface-800 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[120px]"
                                    style={(() => {
                                        const r = tagBtnRef.current?.getBoundingClientRect();
                                        // Position above the button, anchored left
                                        return r ? { bottom: window.innerHeight - r.top + 4, left: r.left } : {};
                                    })()}>
                                    <div className="px-2 py-1.5 border-b border-white/10 mb-1">
                                        <input
                                            type="text"
                                            value={newTagInput}
                                            onChange={e => setNewTagInput(e.target.value)}
                                            placeholder={t('dashboard.common.searchPlaceholder', 'Search or create...')}
                                            className="w-full bg-surface-700/50 border border-white/10 rounded px-2 py-1.5 text-[10px] text-surface-100 placeholder-surface-200/50 focus:outline-none focus:border-brand-500/50 transition-colors"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newTagInput.trim()) {
                                                    handleToggleTag(newTagInput.trim());
                                                    setNewTagInput('');
                                                    setShowTagMenu(false);
                                                }
                                            }}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="max-h-[160px] overflow-y-auto custom-scrollbar">
                                        {availableTags.filter(t => t.toLowerCase().includes(newTagInput.toLowerCase())).map(tag => (
                                            <button key={tag} onClick={() => { handleToggleTag(tag); setShowTagMenu(false); setNewTagInput(''); }}
                                                className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 transition-colors flex items-center gap-2 ${walletTags.includes(tag) ? 'text-brand-400' : 'text-surface-200/50'}`}>
                                                {walletTags.includes(tag) ? <Check size={9} /> : <span className="w-[9px]" />}
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                    {newTagInput.trim() && !availableTags.some(t => t.toLowerCase() === newTagInput.trim().toLowerCase()) && (
                                        <div className="px-2 pt-1 border-t border-white/10 mt-1">
                                            <button onClick={() => { handleToggleTag(newTagInput.trim()); setShowTagMenu(false); setNewTagInput(''); }}
                                                className="w-full text-left px-2 py-1.5 text-[10px] bg-brand-500/10 hover:bg-brand-500/20 rounded text-brand-400 font-medium flex items-center gap-1.5 transition-colors">
                                                <Plus size={10} />
                                                "{newTagInput.trim()}"
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>,
                            document.body
                        )}
                    </div>
                    <button onClick={() => navigate('/trading')} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-emerald-400 transition-colors" title={t('dashboard.walletPage.quickTrade', 'Quick Trade')}>
                        <Send size={11} />
                    </button>
                    <div className="flex-1" />
                    <button onClick={() => onDelete(wallet.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-surface-200/20 hover:text-red-400 transition-colors relative" title={hasPinCode ? t('dashboard.walletPage.deletePin', 'Delete (PIN required)') : t('dashboard.walletPage.delete', 'Delete')}>
                        <Trash2 size={11} />
                        {hasPinCode && <Lock size={6} className="absolute -top-0.5 -right-0.5 text-amber-400" />}
                    </button>
                </div>
            </div>

            {showExport && (
                <ExportKeyModal walletId={wallet.id} walletAddress={wallet.address} onClose={() => setShowExport(false)} />
            )}
        </>
    );
}

/* ── Sort options ── */
const SORT_OPTIONS = [
    { key: 'name', labelKey: 'sortName', suffix: ' A-Z' },
    { key: 'name-desc', labelKey: 'sortName', suffix: ' Z-A' },
    { key: 'value', labelKey: 'sortValue', suffix: ' ↓' },
    { key: 'value-asc', labelKey: 'sortValue', suffix: ' ↑' },
    { key: 'date', labelKey: 'sortDate', suffix: ' ↓' },
    { key: 'date-asc', labelKey: 'sortDate', suffix: ' ↑' },
    { key: 'default', labelKey: 'sortDefault', suffix: '' },
];

/* ── Main WalletsPage ── */
export default function WalletsPage() {
    const { t } = useTranslation();
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [totalPortfolio, setTotalPortfolio] = useState(null);
    const [sortBy, setSortBy] = useState('default');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkExport, setShowBulkExport] = useState(false);
    const [hasPinCode, setHasPinCode] = useState(false);
    const [showSetPin, setShowSetPin] = useState(false);
    const [showRemovePin, setShowRemovePin] = useState(false);
    const [removePinLoading, setRemovePinLoading] = useState(false);
    const [removePinError, setRemovePinError] = useState('');
    const [removePinInput, setRemovePinInput] = useState('');
    const [walletLimit, setWalletLimit] = useState(50);
    const [filterTag, setFilterTag] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('walletViewMode') || 'grid');
    const [draggedId, setDraggedId] = useState(null);
    const [walletOrder, setWalletOrder] = useState(() => {
        try { return JSON.parse(localStorage.getItem('walletOrder') || '[]'); } catch { return []; }
    });
    const [globalChain, setGlobalChain] = useState(() => localStorage.getItem('walletPageGlobalChain') || '');
    const [showGlobalChainMenu, setShowGlobalChainMenu] = useState(false);

    const handleGlobalChainSelect = (chainValue) => {
        setGlobalChain(chainValue);
        localStorage.setItem('walletPageGlobalChain', chainValue);
        setShowGlobalChainMenu(false);
    };

    const loadWallets = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getWallets();
            setWallets(data.wallets || []);
            setHasPinCode(!!data.hasPinCode);
            setWalletLimit(data.walletLimit || 50);
            setSelectedIds(new Set());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadWallets(); }, [loadWallets]);

    const handleTagsChange = (id, tags) => {
        setWallets(prev => prev.map(w => w.id === id ? { ...w, tags: JSON.stringify(tags) } : w));
    };

    const backupCount = wallets.filter(w => w.lastExportedAt === 0 || (Math.floor(Date.now() / 1000) - (w.lastExportedAt || 0) > 7 * 86400)).length;

    // Balance tracking — each WalletCard reports its balance via onBalanceUpdate
    const balancesRef = useRef({});
    const snapshotSavedRef = useRef(false);
    const handleBalanceUpdate = useCallback((walletId, usd) => {
        balancesRef.current[walletId] = usd;
        const total = Object.values(balancesRef.current).reduce((sum, val) => sum + val, 0);
        setTotalPortfolio(total);
        // Auto-save portfolio snapshot (once per page load, rate-limited on backend)
        if (!snapshotSavedRef.current && total > 0 && Object.keys(balancesRef.current).length >= Math.min(wallets.length, 3)) {
            snapshotSavedRef.current = true;
            api.savePortfolioSnapshot(total).catch(() => {});
        }
    }, [wallets.length]);

    useEffect(() => {
        if (wallets.length === 0) { setTotalPortfolio(0); balancesRef.current = {}; snapshotSavedRef.current = false; }
    }, [wallets]);

    const availableTags = useMemo(() => {
        const custom = new Set();
        wallets.forEach(w => {
            try {
                const tags = JSON.parse(w.tags || '[]');
                tags.forEach(t => { if (!PRESET_TAGS.includes(t)) custom.add(t); });
            } catch {}
        });
        return [...PRESET_TAGS, ...Array.from(custom)];
    }, [wallets]);

    // Sorted + filtered wallets
    const sortedWallets = useMemo(() => {
        let list = [...wallets];
        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(w => (w.walletName || '').toLowerCase().includes(q) || (w.address || '').toLowerCase().includes(q));
        }
        if (filterTag) list = list.filter(w => { try { return JSON.parse(w.tags || '[]').includes(filterTag); } catch { return false; } });
        // Custom order from drag-drop
        if (sortBy === 'custom' && walletOrder.length > 0) {
            const orderMap = new Map(walletOrder.map((id, i) => [id, i]));
            return list.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        switch (sortBy) {
            case 'name': return list.sort((a, b) => (a.walletName || '').localeCompare(b.walletName || ''));
            case 'name-desc': return list.sort((a, b) => (b.walletName || '').localeCompare(a.walletName || ''));
            case 'value': return list.sort((a, b) => (balancesRef.current[b.id] || 0) - (balancesRef.current[a.id] || 0));
            case 'value-asc': return list.sort((a, b) => (balancesRef.current[a.id] || 0) - (balancesRef.current[b.id] || 0));
            case 'date': return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            case 'date-asc': return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            case 'default': return list.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
            default: return list;
        }
    }, [wallets, sortBy, filterTag, searchQuery, walletOrder]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === wallets.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(wallets.map(w => w.id)));
        }
    };

    const [defaultToast, setDefaultToast] = useState(null);
    const handleSetDefault = async (id) => {
        try {
            const result = await api.setDefaultWallet(id);
            await loadWallets();
            const wallet = wallets.find(w => w.id === id);
            const name = wallet?.walletName || 'Wallet';
            if (result.isDefault) {
                setDefaultToast({ type: 'success', msg: `⭐ ${name} ${t('dashboard.walletPage.setAsDefault', 'set as default')}` });
            } else {
                setDefaultToast({ type: 'info', msg: `${name} ${t('dashboard.walletPage.removedDefault', 'removed from default')}` });
            }
            setTimeout(() => setDefaultToast(null), 3000);
        } catch (err) {
            console.error('Set default wallet error:', err);
            setDefaultToast({ type: 'error', msg: err.message || 'Failed' });
            setTimeout(() => setDefaultToast(null), 3000);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm(t('dashboard.walletPage.deleteConfirm'))) return;
        try { await api.deleteWallet(id); loadWallets(); } catch { /* ignore */ }
    };

    const handleRename = (id, newName) => {
        setWallets(prev => prev.map(w => w.id === id ? { ...w, walletName: newName } : w));
    };

    // Drag-and-drop handlers
    const handleDragStart = (id) => setDraggedId(id);
    const handleDragOver = (e, targetId) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;
    };
    const handleDrop = (targetId) => {
        if (!draggedId || draggedId === targetId) return;
        const ids = sortedWallets.map(w => w.id);
        const fromIdx = ids.indexOf(draggedId);
        const toIdx = ids.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0) return;
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, draggedId);
        setWalletOrder(ids);
        setSortBy('custom');
        localStorage.setItem('walletOrder', JSON.stringify(ids));
        setDraggedId(null);
    };
    const handleDragEnd = () => setDraggedId(null);

    // Bulk delete
    const handleBulkDelete = async () => {
        if (!confirm(t('dashboard.walletPage.bulkDeleteConfirm', `Delete ${selectedIds.size} wallets?`))) return;
        try {
            await Promise.all([...selectedIds].map(id => api.deleteWallet(id)));
            loadWallets();
        } catch { /* ignore */ }
    };

    // Toggle view mode
    const toggleViewMode = () => {
        const next = viewMode === 'grid' ? 'list' : 'grid';
        setViewMode(next);
        localStorage.setItem('walletViewMode', next);
    };

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                        <Wallet size={22} className="text-brand-400" />
                        {t('dashboard.sidebar.wallets') || 'Wallets'}
                    </h1>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <p className="text-xs text-surface-200/40">{wallets.length}/{walletLimit} ví</p>
                        {totalPortfolio !== null && totalPortfolio > 0 && (
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                                Total: {formatUsd(totalPortfolio)}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={loadWallets} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                        <RefreshCw size={12} /> {t('dashboard.walletPage.refresh')}
                    </button>
                    <button onClick={() => setShowImport(true)} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 border-brand-500/20 text-brand-400 hover:bg-brand-500/10">
                        <Download size={12} /> {t('dashboard.walletPage.import')}
                    </button>
                    <button onClick={() => setShowCreate(true)} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
                        <Plus size={12} /> {t('dashboard.walletPage.newWallet')}
                    </button>
                </div>
            </div>

            {/* PIN Status Card */}
            <div className={`glass-card p-3 flex items-center gap-3 ${hasPinCode ? 'border-emerald-500/10' : 'border-amber-500/10'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${hasPinCode ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                    <Shield size={18} className={hasPinCode ? 'text-emerald-400' : 'text-amber-400'} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${hasPinCode ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {hasPinCode ? t('dashboard.walletPage.pinOn') : t('dashboard.walletPage.pinOff')}
                    </p>
                    <p className="text-[10px] text-surface-200/40 mt-0.5">
                        {hasPinCode ? t('dashboard.walletPage.pinOnDesc') : t('dashboard.walletPage.pinOffDesc')}
                    </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setShowSetPin(true)} className={`text-[10px] px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors ${hasPinCode ? 'bg-surface-700/50 text-surface-200/60 hover:text-surface-200' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'}`}>
                        <Lock size={10} /> {hasPinCode ? t('dashboard.walletPage.changePin') : t('dashboard.walletPage.setPin')}
                    </button>
                    {hasPinCode && (
                        <button onClick={() => { setShowRemovePin(true); setRemovePinInput(''); setRemovePinError(''); }} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors">
                            {t('dashboard.walletPage.removePin')}
                        </button>
                    )}
                </div>
            </div>

            {/* Wallet limit progress bar */}
            {wallets.length > 0 && (
                <div className="glass-card p-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-surface-200/40">{t('dashboard.walletPage.walletLimit')}</span>
                        <span className={`text-[10px] font-bold ${wallets.length >= walletLimit ? 'text-red-400' : wallets.length >= walletLimit * 0.8 ? 'text-amber-400' : 'text-surface-200/50'}`}>
                            {wallets.length}/{walletLimit}
                        </span>
                    </div>
                    <div className="h-1.5 bg-surface-700/50 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${wallets.length >= walletLimit ? 'bg-red-500' : wallets.length >= walletLimit * 0.8 ? 'bg-amber-500' : 'bg-brand-500'}`}
                            style={{ width: `${Math.min((wallets.length / walletLimit) * 100, 100)}%` }} />
                    </div>
                    {wallets.length >= walletLimit && (
                        <p className="text-[9px] text-amber-400/60 mt-1">⚠️ {t('dashboard.walletPage.limitReached')}</p>
                    )}
                </div>
            )}

            {/* Portfolio chart */}
            <PortfolioChart days={30} />

            {/* Backup reminder banner */}
            {backupCount > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-2.5 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                    <p className="text-xs text-amber-400/80">{backupCount} {t('dashboard.walletPage.backupWarning')}</p>
                </div>
            )}

            {/* Toolbar: sort + select + bulk export */}
            {wallets.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Sort dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortMenu(!showSortMenu)}
                            className="btn-secondary text-[11px] flex items-center gap-1.5 px-2.5 py-1.5"
                        >
                            <ArrowUpDown size={11} />
                            {(() => { const opt = SORT_OPTIONS.find(o => o.key === sortBy); return opt ? t(`dashboard.walletPage.${opt.labelKey}`) + opt.suffix : t('dashboard.walletPage.sortDefault'); })()}
                        </button>
                        {showSortMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                                <div className="absolute top-full left-0 mt-1 bg-surface-800 border border-white/10 rounded-xl shadow-2xl z-50 py-1 min-w-[140px]">
                                    {SORT_OPTIONS.map(opt => (
                                        <button
                                            key={opt.key}
                                            onClick={() => { setSortBy(opt.key); setShowSortMenu(false); }}
                                            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/5 transition-colors ${sortBy === opt.key ? 'text-brand-400' : 'text-surface-200/60'}`}
                                        >
                                            {t(`dashboard.walletPage.${opt.labelKey}`)}{opt.suffix}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Select all */}
                    <button onClick={selectAll} className="btn-secondary text-[11px] flex items-center gap-1.5 px-2.5 py-1.5">
                        {selectedIds.size === wallets.length ? <CheckSquare size={11} className="text-amber-400" /> : <Square size={11} />}
                        {selectedIds.size === wallets.length ? t('dashboard.walletPage.deselectAll') : t('dashboard.walletPage.selectAll')}
                    </button>

                    {/* Global Chain select */}
                    <div className="relative">
                        <button
                            onClick={() => setShowGlobalChainMenu(!showGlobalChainMenu)}
                            className="btn-secondary text-[11px] flex items-center gap-1.5 px-2.5 py-1.5"
                            title={t('dashboard.walletPage.globalChainDesc', 'Select chain for all wallets')}
                        >
                            <Globe size={11} />
                            {globalChain ? (CHAIN_OPTIONS.find(c => c.value === globalChain)?.label || 'All Chains') : t('dashboard.walletPage.globalChain', 'Global Chain')}
                        </button>
                        {showGlobalChainMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowGlobalChainMenu(false)} />
                                <div className="absolute top-full left-0 mt-1 bg-surface-800 border border-white/10 rounded-xl shadow-2xl z-50 py-1 min-w-[140px]">
                                    <button
                                        onClick={() => handleGlobalChainSelect('')}
                                        className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/5 transition-colors ${!globalChain ? 'text-brand-400' : 'text-surface-200/60'}`}
                                    >
                                        {t('dashboard.walletPage.individualChains', 'Individual Chains')}
                                    </button>
                                    <div className="h-px bg-white/5 my-1" />
                                    {CHAIN_OPTIONS.map(c => (
                                        <button
                                            key={c.value}
                                            onClick={() => handleGlobalChainSelect(c.value)}
                                            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/5 transition-colors ${globalChain === c.value ? 'text-brand-400' : 'text-surface-200/60'}`}
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Bulk export */}
                    {selectedIds.size > 0 && (
                        <button
                            onClick={() => setShowBulkExport(true)}
                            className="text-[11px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 hover:border-amber-400/50 transition-colors"
                        >
                            <Key size={11} /> {t('dashboard.walletPage.exportKey')} ({selectedIds.size})
                        </button>
                    )}

                    {/* Tag filter */}
                    <div className="flex items-center gap-1 ml-auto">
                        <Tag size={10} className="text-surface-200/25" />
                        {availableTags.map(tag => (
                            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                                className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${filterTag === tag ? (TAG_COLORS[tag] || 'bg-brand-500/15 text-brand-400 border-brand-500/20') : 'bg-surface-700/20 text-surface-200/30 border-white/5 hover:border-white/10'}`}>
                                {tag}
                            </button>
                        ))}
                    </div>

                    {/* View mode toggle */}
                    <button onClick={toggleViewMode} className="btn-secondary text-[11px] flex items-center gap-1 px-2 py-1.5" title={viewMode === 'grid' ? 'List view' : 'Grid view'}>
                        {viewMode === 'grid' ? <List size={11} /> : <LayoutGrid size={11} />}
                    </button>
                </div>
            )}

            {/* Search bar */}
            {wallets.length > 0 && (
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('dashboard.walletPage.searchPlaceholder', 'Search by name or address...')}
                        className="w-full pl-9 pr-3 py-2 bg-surface-800/50 border border-white/5 rounded-xl text-xs text-surface-100 placeholder-surface-200/30 focus:border-brand-500/30 focus:outline-none transition-colors"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/30 hover:text-surface-200">
                            <X size={12} />
                        </button>
                    )}
                    {searchQuery && <p className="text-[10px] text-surface-200/40 mt-1 ml-1">{sortedWallets.length} {t('dashboard.walletPage.results', 'results')}</p>}
                </div>
            )}

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="glass-card p-2.5 flex items-center gap-2 flex-wrap animate-fadeIn">
                    <span className="text-[11px] text-surface-200/60 font-medium">{selectedIds.size} {t('dashboard.walletPage.selected', 'selected')}</span>
                    <div className="h-4 w-px bg-white/10" />
                    <button
                        onClick={() => setShowBulkExport(true)}
                        className="text-[10px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                    >
                        <Key size={10} /> {t('dashboard.walletPage.exportKey', 'Export')}
                    </button>
                    <button
                        onClick={handleBulkDelete}
                        className="text-[10px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                        <Trash2 size={10} /> {t('dashboard.common.delete', 'Delete')}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-surface-200/40 hover:text-surface-200 ml-auto">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Wallet grid — 3 columns */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
            ) : wallets.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Wallet size={40} className="mx-auto text-surface-200/20 mb-4" />
                    <h2 className="text-lg font-semibold text-surface-100 mb-2">{t('dashboard.walletPage.noWallets')}</h2>
                    <p className="text-sm text-surface-200/40 mb-6 max-w-sm mx-auto">{t('dashboard.walletPage.noWalletsDesc')}</p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => setShowImport(true)} className="btn-secondary text-sm flex items-center gap-1.5 px-4 py-2">
                            <Download size={14} /> {t('dashboard.walletPage.import')}
                        </button>
                        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5 px-4 py-2">
                            <Plus size={14} /> {t('dashboard.common.create')}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                {defaultToast && (
                    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-xl shadow-2xl text-sm font-medium animate-fadeIn flex items-center gap-2 ${
                        defaultToast.type === 'success' ? 'bg-emerald-500/90 text-white' :
                        defaultToast.type === 'error' ? 'bg-red-500/90 text-white' :
                        'bg-surface-700/90 text-surface-100 border border-white/10'
                    }`}>
                        {defaultToast.type === 'success' && <Star size={14} className="fill-white" />}
                        {defaultToast.msg}
                    </div>
                )}
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2'}>
                    {sortedWallets.map(w => viewMode === 'list' ? (
                        /* Compact List View */
                        <div
                            key={w.id}
                            draggable
                            onDragStart={() => handleDragStart(w.id)}
                            onDragOver={(e) => handleDragOver(e, w.id)}
                            onDrop={() => handleDrop(w.id)}
                            onDragEnd={handleDragEnd}
                            className={`glass-card px-3 py-2 flex items-center gap-3 cursor-grab active:cursor-grabbing transition-all ${draggedId === w.id ? 'opacity-50 scale-95' : ''} ${w.isDefault ? 'ring-1 ring-brand-500/20' : ''} ${selectedIds.has(w.id) ? 'ring-1 ring-amber-400/30' : ''}`}
                        >
                            <GripVertical size={12} className="text-surface-200/20 flex-shrink-0" />
                            <button onClick={() => toggleSelect(w.id)} className="flex-shrink-0 text-surface-200/30 hover:text-brand-400">
                                {selectedIds.has(w.id) ? <CheckSquare size={14} className="text-amber-400" /> : <Square size={14} />}
                            </button>
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${w.isDefault ? 'bg-gradient-to-br from-brand-500 to-cyan-500' : 'bg-surface-700/60'}`}>
                                <Wallet size={10} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium text-surface-100 truncate block">{w.walletName || 'Unnamed'}</span>
                            </div>
                            <span className="text-[9px] text-surface-200/40 font-mono hidden sm:block">{shortAddr(w.address)}</span>
                            <span className="text-[10px] text-surface-200/30 hidden md:block">{CHAIN_NAMES[globalChain || w.chainIndex] || 'Chain'}</span>
                            <span className="text-xs font-bold text-emerald-400 min-w-[60px] text-right">{formatUsd(balancesRef.current[w.id] || 0)}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => handleSetDefault(w.id)} className={`p-1 rounded hover:bg-white/5 ${w.isDefault ? 'text-amber-400' : 'text-surface-200/20 hover:text-amber-400'}`}>
                                    <Star size={11} className={w.isDefault ? 'fill-amber-400' : ''} />
                                </button>
                                <button onClick={() => handleDelete(w.id)} className="p-1 rounded hover:bg-white/5 text-surface-200/20 hover:text-red-400">
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            key={w.id}
                            draggable
                            onDragStart={() => handleDragStart(w.id)}
                            onDragOver={(e) => handleDragOver(e, w.id)}
                            onDrop={() => handleDrop(w.id)}
                            onDragEnd={handleDragEnd}
                            className={`transition-all ${draggedId === w.id ? 'opacity-50 scale-95' : ''}`}
                        >
                        <WalletCard
                            wallet={w}
                            onRefresh={loadWallets}
                            onSetDefault={handleSetDefault}
                            onDelete={handleDelete}
                            onRename={handleRename}
                            onTagsChange={handleTagsChange}
                            selected={selectedIds.has(w.id)}
                            onToggleSelect={toggleSelect}
                            onBalanceUpdate={handleBalanceUpdate}
                            hasPinCode={hasPinCode}
                            globalChain={globalChain}
                            availableTags={availableTags}
                        />
                        </div>
                    ))}
                </div>
                </>
            )}

            {/* Modals */}
            {showCreate && (
                <CreateWalletModal currentCount={wallets.length} limit={walletLimit} onClose={() => setShowCreate(false)} onCreated={loadWallets} />
            )}
            {showImport && (
                <ImportWalletModal currentCount={wallets.length} limit={walletLimit} onClose={() => setShowImport(false)} onImported={loadWallets} />
            )}
            {showBulkExport && (
                <BulkExportModal
                    walletIds={[...selectedIds]}
                    wallets={wallets}
                    balances={balancesRef.current}
                    onClose={() => setShowBulkExport(false)}
                />
            )}
            {showSetPin && (
                <SetPinModal hasPin={hasPinCode} onClose={() => setShowSetPin(false)} onDone={() => { setShowSetPin(false); loadWallets(); }} />
            )}
            {showRemovePin && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRemovePin(false)}>
                    <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="text-red-400" size={20} />
                            <h3 className="text-lg font-bold text-surface-100">{t('dashboard.walletPage.removePinTitle')}</h3>
                        </div>
                        <p className="text-xs text-surface-200/40 mb-3">{t('dashboard.walletPage.removePinDesc')}</p>
                        <input type="password" maxLength={6} value={removePinInput} onChange={e => setRemovePinInput(e.target.value.replace(/\D/g, ''))}
                            placeholder={t('dashboard.walletPage.currentPin')} className="input-field text-sm text-center tracking-[0.5em] mb-3" autoFocus />
                        {removePinError && <p className="text-xs text-red-400 mb-3">{removePinError}</p>}
                        <div className="flex gap-3">
                            <button onClick={() => setShowRemovePin(false)} className="btn-secondary flex-1 text-sm">{t('dashboard.common.cancel')}</button>
                            <button
                                disabled={removePinLoading || removePinInput.length < 4}
                                onClick={async () => {
                                    setRemovePinLoading(true); setRemovePinError('');
                                    try {
                                        await api.removePin(removePinInput);
                                        setShowRemovePin(false); loadWallets();
                                    } catch (err) { setRemovePinError(err.message); }
                                    finally { setRemovePinLoading(false); }
                                }}
                                className="flex-1 text-sm px-3 py-2 rounded-xl bg-red-500/15 text-red-400 font-medium hover:bg-red-500/25 transition-colors disabled:opacity-40">
                                {removePinLoading ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('dashboard.walletPage.removePin')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
