import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import {
    Wallet, Plus, Trash2, Star, RefreshCw, Eye, EyeOff, Copy, Check,
    ExternalLink, AlertTriangle, Loader2, ChevronDown, Shield, Download,
    Key, Pencil, Send, X, ArrowUpDown, Upload, FileText, CheckSquare, Square,
    Lock, Tag, BarChart3
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
function CreateWalletModal({ onClose, onCreated }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showKey, setShowKey] = useState(false);

    const create = async () => {
        setLoading(true);
        try {
            const data = await api.createWallet();
            setResult(data);
        } catch (err) {
            setResult({ error: err.message });
        } finally {
            setLoading(false);
        }
    };

    const copyKey = () => {
        navigator.clipboard.writeText(result.privateKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                {!result ? (
                    <>
                        <h3 className="text-lg font-bold text-surface-100 mb-2">Create New Wallet</h3>
                        <p className="text-xs text-surface-200/50 mb-6">A new trading wallet will be created on X Layer. Save the private key securely — it will only be shown once.</p>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
                            <button onClick={create} disabled={loading} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Create
                            </button>
                        </div>
                    </>
                ) : result.error ? (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="text-red-400" size={20} />
                            <h3 className="text-lg font-bold text-red-400">Error</h3>
                        </div>
                        <p className="text-sm text-surface-200/70 mb-4">{result.error}</p>
                        <button onClick={onClose} className="btn-secondary w-full text-sm">Close</button>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="text-emerald-400" size={20} />
                            <h3 className="text-lg font-bold text-emerald-400">Wallet Created!</h3>
                        </div>
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">Address</label>
                                <code className="block bg-surface-800/80 px-3 py-2 rounded-lg text-xs text-brand-400 break-all">
                                    {result.wallet?.address}
                                </code>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">Private Key</label>
                                <div className="relative">
                                    <code className="block bg-surface-800/80 px-3 py-2 rounded-lg text-xs text-amber-400/80 break-all pr-16">
                                        {showKey ? result.privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••'}
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
                                    <AlertTriangle size={8} /> Save this key! It will not be shown again.
                                </p>
                            </div>
                        </div>
                        <button onClick={() => { onCreated(); onClose(); }} className="btn-primary w-full text-sm">Done</button>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Import Wallet Modal (Bulk + File) ── */
function ImportWalletModal({ onClose, onImported }) {
    const [rows, setRows] = useState([{ key: '', name: '' }]);
    const [showKeys, setShowKeys] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [chainIndex, setChainIndex] = useState('196');
    const fileRef = useRef(null);

    const updateRow = (i, field, val) => {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
    };
    const addRow = () => {
        if (rows.length >= 50) return;
        setRows(prev => [...prev, { key: '', name: '' }]);
    };
    const removeRow = (i) => setRows(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i));

    const validCount = rows.filter(r => r.key.trim()).length;

    const handleImport = async () => {
        const keys = rows.filter(r => r.key.trim()).map(r => ({ key: r.key.trim(), name: r.name.trim() || undefined }));
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
        return lines.slice(0, 50).map(line => {
            // Support: key,name  |  key\tname  |  key name(if name doesn't look like hex)
            const csvMatch = line.match(/^([0-9a-fA-Fx]+)[,\t]\s*(.*)$/);
            if (csvMatch) return { key: csvMatch[1], name: csvMatch[2].trim() };
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {!result ? (
                    <>
                        <div className="flex items-center gap-2 mb-3">
                            <Download className="text-brand-400" size={20} />
                            <h3 className="text-lg font-bold text-surface-100">Import Wallets</h3>
                        </div>
                        <p className="text-xs text-surface-200/50 mb-1">
                            Paste or upload EVM private keys. Each will be encrypted with AES-256-CBC.
                        </p>
                        <p className="text-[10px] text-surface-200/30 mb-4 flex items-center gap-1">
                            <AlertTriangle size={9} /> Tối đa 50 key mỗi lần · Hỗ trợ file .txt/.csv (mỗi dòng: key hoặc key,name)
                        </p>

                        {/* Chain selector */}
                        <div className="mb-3">
                            <label className="text-[10px] uppercase tracking-wider text-surface-200/40 mb-1 block">Chain</label>
                            <select value={chainIndex} onChange={e => setChainIndex(e.target.value)} className="input-field text-sm !py-1.5">
                                {CHAIN_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>

                        {/* File upload zone */}
                        <input ref={fileRef} type="file" accept=".txt,.csv" onChange={handleFile} className="hidden" />
                        <button
                            onClick={() => fileRef.current?.click()}
                            className="w-full mb-3 py-3 border-2 border-dashed border-white/10 rounded-xl text-xs text-surface-200/40 hover:border-brand-500/30 hover:text-brand-400 transition-colors flex items-center justify-center gap-2"
                        >
                            <Upload size={14} /> Upload file (.txt / .csv) or paste below
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
                                            placeholder="Name"
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
                            <button onClick={addRow} disabled={rows.length >= 50} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                <Plus size={12} /> Add key ({rows.length}/50)
                            </button>
                            <button onClick={() => setShowKeys(!showKeys)} className="text-xs text-surface-200/30 hover:text-surface-200/60 flex items-center gap-1 transition-colors ml-auto">
                                {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                                {showKeys ? 'Hide' : 'Show'}
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
                            <button onClick={handleImport} disabled={loading || validCount === 0} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                Import {validCount > 1 ? `(${validCount})` : ''}
                            </button>
                        </div>
                    </>
                ) : result.error ? (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="text-red-400" size={20} />
                            <h3 className="text-lg font-bold text-red-400">Import Failed</h3>
                        </div>
                        <p className="text-sm text-surface-200/70 mb-4">{result.error}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setResult(null)} className="btn-secondary flex-1 text-sm">Try Again</button>
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Close</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="text-emerald-400" size={20} />
                            <h3 className="text-lg font-bold text-emerald-400">Import Complete!</h3>
                        </div>
                        <div className="space-y-3 mb-4">
                            {result.results?.imported?.length > 0 && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                    <p className="text-xs font-bold text-emerald-400 mb-1.5">✅ Imported ({result.results.imported.length})</p>
                                    {result.results.imported.map((w, i) => (
                                        <p key={i} className="text-[11px] text-surface-200/60 font-mono">{w.name}: {shortAddr(w.address)}</p>
                                    ))}
                                </div>
                            )}
                            {result.results?.duplicates?.length > 0 && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                    <p className="text-xs font-bold text-amber-400 mb-1">⚠️ Duplicates ({result.results.duplicates.length})</p>
                                    {result.results.duplicates.map((w, i) => (
                                        <p key={i} className="text-[11px] text-surface-200/50 font-mono">{shortAddr(w.address)} — already exists</p>
                                    ))}
                                </div>
                            )}
                            {result.results?.invalid?.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <p className="text-xs font-bold text-red-400 mb-1">❌ Invalid ({result.results.invalid.length})</p>
                                    {result.results.invalid.map((w, i) => (
                                        <p key={i} className="text-[11px] text-surface-200/50">{w.key}: {w.error}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={() => { onImported(); onClose(); }} className="btn-primary w-full text-sm">Done</button>
                    </>
                )}
            </div>
        </div>
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
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
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
                            Wallet: <code className="text-brand-400">{shortAddr(walletAddress)}</code>
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
                            Wallet: <code className="text-brand-400">{shortAddr(walletAddress)}</code>
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
        </div>
    );
}

/* ── Bulk Export Modal ── */
function BulkExportModal({ walletIds, wallets, onClose }) {
    const [loading, setLoading] = useState(false);
    const [keys, setKeys] = useState(null);
    const [showKeys, setShowKeys] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const timerRef = useRef(null);

    const exportAll = async () => {
        setLoading(true);
        try {
            const results = [];
            for (const id of walletIds) {
                const data = await api.exportWalletKey(id);
                const w = wallets.find(w => w.id === id);
                results.push({ ...data, name: w?.walletName || 'Wallet' });
            }
            setKeys(results);
            timerRef.current = setTimeout(() => { setKeys(null); setShowKeys(false); onClose(); }, 60000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const copyAll = () => {
        const text = keys.map(k => `${k.privateKey}  ${k.name}  ${k.address}`).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadFile = () => {
        const text = keys.map(k => `${k.privateKey},${k.name},${k.address}`).join('\n');
        const blob = new Blob([text], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'wallets_export.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <Key className="text-amber-400" size={20} />
                    <h3 className="text-lg font-bold text-surface-100">Export {walletIds.length} Wallet{walletIds.length > 1 ? 's' : ''}</h3>
                </div>

                {error ? (
                    <>
                        <p className="text-sm text-red-400 mb-4">{error}</p>
                        <button onClick={onClose} className="btn-secondary w-full text-sm">Close</button>
                    </>
                ) : !keys ? (
                    <>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                            <p className="text-xs text-red-400 flex items-start gap-2">
                                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                <span>Private keys will be revealed for {walletIds.length} wallet(s). Never share these keys. Auto-hides after 60 seconds.</span>
                            </p>
                        </div>
                        <div className="mb-4 space-y-1">
                            {walletIds.map(id => {
                                const w = wallets.find(w => w.id === id);
                                return <p key={id} className="text-xs text-surface-200/50 font-mono">• {w?.walletName}: {shortAddr(w?.address)}</p>;
                            })}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
                            <button onClick={exportAll} disabled={loading} className="flex-1 text-sm flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                                Reveal All
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="space-y-2 mb-4" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                            {keys.map((k, i) => (
                                <div key={i} className="bg-surface-800/80 rounded-lg px-3 py-2">
                                    <p className="text-[10px] text-surface-200/40 mb-0.5">{k.name} · {shortAddr(k.address)}</p>
                                    <code className="text-[11px] text-amber-400/80 break-all">
                                        {showKeys ? k.privateKey : '••••••••••••••••••••••••'}
                                    </code>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mb-3">
                            <button onClick={() => setShowKeys(!showKeys)} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                                {showKeys ? 'Hide' : 'Show'}
                            </button>
                            <button onClick={copyAll} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                Copy All
                            </button>
                            <button onClick={downloadFile} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
                                <FileText size={12} /> Save CSV
                            </button>
                        </div>
                        <p className="text-[9px] text-amber-400/50 mb-3 flex items-center gap-1">
                            <AlertTriangle size={8} /> Auto-hides in 60 seconds
                        </p>
                        <button onClick={onClose} className="btn-secondary w-full text-sm">Close</button>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Wallet Card ── */
function WalletCard({ wallet, onRefresh, onSetDefault, onDelete, onRename, onTagsChange, selected, onToggleSelect, hasPinCode }) {
    const navigate = useNavigate();
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(wallet.walletName || '');
    const [showExport, setShowExport] = useState(false);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const nameInputRef = useRef(null);

    const loadBalance = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getWalletBalance(wallet.id);
            setBalance(data);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [wallet.id]);

    useEffect(() => { loadBalance(); }, [loadBalance]);

    const totalUsd = balance?.tokens?.reduce((sum, t) => sum + Number(t.price || 0) * Number(t.balance || 0), 0) || 0;
    const chainName = CHAIN_NAMES[wallet.chainIndex] || `Chain #${wallet.chainIndex}`;
    const explorer = EXPLORERS[wallet.chainIndex] || EXPLORERS['196'];
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
            <div className={`glass-card overflow-hidden transition-all ${wallet.isDefault ? 'ring-1 ring-brand-500/30' : ''} ${selected ? 'ring-1 ring-amber-400/40' : ''}`}>
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
                                    title="Click to rename"
                                >
                                    {wallet.walletName || 'Trading Wallet'}
                                    <Pencil size={8} className="text-surface-200/20 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                                </h3>
                            )}
                            {wallet.isDefault && (
                                <span className="px-1 py-0.5 rounded text-[8px] bg-brand-500/15 text-brand-400 border border-brand-500/20 flex-shrink-0">Default</span>
                            )}
                        </div>
                        {/* Chain badge + backup warning */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] px-1 py-0.5 rounded bg-surface-700/60 border border-white/5 text-surface-200/40">{chainName}</span>
                            <code className="text-[10px] text-surface-200/40">{shortAddr(wallet.address)}</code>
                            <button onClick={copyAddr} className="text-surface-200/30 hover:text-brand-400 transition-colors">
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
                                            <div className="w-6 h-6 rounded-full bg-surface-700/60 border border-white/5 flex items-center justify-center text-[9px] font-bold text-surface-200/60">
                                                {token.symbol?.slice(0, 2) || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-medium text-surface-100">{token.symbol}</p>
                                                <p className="text-[9px] text-surface-200/30">{bal.toLocaleString('en-US', { maximumFractionDigits: 4 })}</p>
                                            </div>
                                            <p className="text-[10px] text-surface-100">{formatUsd(usd)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {balance?.tokens?.length === 0 && !loading && (
                    <div className="px-3 py-2 border-t border-white/5 text-center text-[10px] text-surface-200/25">
                        📭 Empty — fund to trade
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
                    <button onClick={() => { loadBalance(); onRefresh(); }} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-brand-400 transition-colors" title="Refresh">
                        <RefreshCw size={11} />
                    </button>
                    {!wallet.isDefault && (
                        <button onClick={() => onSetDefault(wallet.id)} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-amber-400 transition-colors" title="Set Default">
                            <Star size={11} />
                        </button>
                    )}
                    <button onClick={() => setShowExport(true)} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-amber-400 transition-colors relative" title={hasPinCode ? 'Export Key (PIN required)' : 'Export Key'}>
                        <Key size={11} />
                        {hasPinCode && <Lock size={6} className="absolute -top-0.5 -right-0.5 text-amber-400" />}
                    </button>
                    <div className="relative">
                        <button onClick={() => setShowTagMenu(!showTagMenu)} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-purple-400 transition-colors" title="Tags">
                            <Tag size={11} />
                        </button>
                        {showTagMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowTagMenu(false)} />
                                <div className="absolute bottom-full left-0 mb-1 bg-surface-800 border border-white/10 rounded-xl shadow-2xl z-50 py-1 min-w-[120px]">
                                    {PRESET_TAGS.map(tag => (
                                        <button key={tag} onClick={() => handleToggleTag(tag)}
                                            className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 transition-colors flex items-center gap-2 ${walletTags.includes(tag) ? 'text-brand-400' : 'text-surface-200/50'}`}>
                                            {walletTags.includes(tag) ? <Check size={9} /> : <span className="w-[9px]" />}
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <button onClick={() => navigate('/trading')} className="p-1 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-emerald-400 transition-colors" title="Quick Trade">
                        <Send size={11} />
                    </button>
                    <div className="flex-1" />
                    <button onClick={() => onDelete(wallet.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-surface-200/20 hover:text-red-400 transition-colors relative" title={hasPinCode ? 'Delete (PIN required)' : 'Delete'}>
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

    // Balance tracking for sorting and portfolio total
    const balancesRef = useRef({});
    const updatePortfolioTotal = useCallback(() => {
        const total = Object.values(balancesRef.current).reduce((sum, val) => sum + val, 0);
        setTotalPortfolio(total);
    }, []);

    useEffect(() => {
        if (wallets.length === 0) { setTotalPortfolio(0); return; }
        let cancelled = false;
        const fetchAll = async () => {
            const sums = {};
            await Promise.all(wallets.map(async (w) => {
                try {
                    const data = await api.getWalletBalance(w.id);
                    const usd = (data?.tokens || []).reduce((s, t) => s + Number(t.price || 0) * Number(t.balance || 0), 0);
                    sums[w.id] = usd;
                } catch { sums[w.id] = 0; }
            }));
            if (!cancelled) {
                balancesRef.current = sums;
                updatePortfolioTotal();
            }
        };
        fetchAll();
        return () => { cancelled = true; };
    }, [wallets, updatePortfolioTotal]);

    // Sorted + filtered wallets
    const sortedWallets = useMemo(() => {
        let list = [...wallets];
        if (filterTag) list = list.filter(w => { try { return JSON.parse(w.tags || '[]').includes(filterTag); } catch { return false; } });
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
    }, [wallets, sortBy, filterTag]);

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

    const handleSetDefault = async (id) => {
        try { await api.setDefaultWallet(id); loadWallets(); } catch { /* ignore */ }
    };

    const handleDelete = async (id) => {
        if (!confirm(t('dashboard.walletPage.deleteConfirm'))) return;
        try { await api.deleteWallet(id); loadWallets(); } catch { /* ignore */ }
    };

    const handleRename = (id, newName) => {
        setWallets(prev => prev.map(w => w.id === id ? { ...w, walletName: newName } : w));
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
                        <RefreshCw size={12} /> Refresh
                    </button>
                    <button onClick={() => setShowImport(true)} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 border-brand-500/20 text-brand-400 hover:bg-brand-500/10">
                        <Download size={12} /> Import
                    </button>
                    <button onClick={() => setShowCreate(true)} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
                        <Plus size={12} /> New
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
                        {PRESET_TAGS.map(tag => (
                            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                                className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${filterTag === tag ? (TAG_COLORS[tag] || 'bg-brand-500/15 text-brand-400 border-brand-500/20') : 'bg-surface-700/20 text-surface-200/30 border-white/5 hover:border-white/10'}`}>
                                {tag}
                            </button>
                        ))}
                    </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {sortedWallets.map(w => (
                        <WalletCard
                            key={w.id}
                            wallet={w}
                            onRefresh={loadWallets}
                            onSetDefault={handleSetDefault}
                            onDelete={handleDelete}
                            onRename={handleRename}
                            onTagsChange={handleTagsChange}
                            selected={selectedIds.has(w.id)}
                            onToggleSelect={toggleSelect}
                            hasPinCode={hasPinCode}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            {showCreate && (
                <CreateWalletModal onClose={() => setShowCreate(false)} onCreated={loadWallets} />
            )}
            {showImport && (
                <ImportWalletModal onClose={() => setShowImport(false)} onImported={loadWallets} />
            )}
            {showBulkExport && (
                <BulkExportModal
                    walletIds={[...selectedIds]}
                    wallets={wallets}
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
