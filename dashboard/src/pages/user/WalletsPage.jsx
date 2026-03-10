import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Wallet, Plus, Trash2, Star, RefreshCw, Eye, EyeOff, Copy, Check,
    ExternalLink, AlertTriangle, Loader2, ChevronDown, Shield
} from 'lucide-react';

const CHAIN_NAMES = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '42161': 'Arbitrum', '8453': 'Base', '501': 'Solana' };
const EXPLORERS = { '196': 'https://www.okx.com/web3/explorer/xlayer', '1': 'https://etherscan.io', '56': 'https://bscscan.com', '137': 'https://polygonscan.com' };

function formatUsd(val) {
    const n = Number(val || 0);
    return n < 0.01 && n > 0 ? `$${n.toFixed(6)}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddr(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
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

/* ── Wallet Card ── */
function WalletCard({ wallet, onRefresh, onSetDefault, onDelete }) {
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

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

    const copyAddr = () => {
        navigator.clipboard.writeText(wallet.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`glass-card overflow-hidden transition-all ${wallet.isDefault ? 'ring-1 ring-brand-500/30' : ''}`}>
            {/* Header */}
            <div className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${wallet.isDefault
                        ? 'bg-gradient-to-br from-brand-500 to-cyan-500'
                        : 'bg-surface-700/60 border border-white/5'
                    }`}>
                    <Wallet size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-surface-100">{wallet.walletName || 'Trading Wallet'}</h3>
                        {wallet.isDefault && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-brand-500/15 text-brand-400 border border-brand-500/20">Default</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[11px] text-surface-200/40">{shortAddr(wallet.address)}</code>
                        <button onClick={copyAddr} className="text-surface-200/30 hover:text-brand-400 transition-colors">
                            {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        </button>
                        <a href={`${explorer}/address/${wallet.address}`} target="_blank" rel="noopener" className="text-surface-200/30 hover:text-brand-400 transition-colors">
                            <ExternalLink size={10} />
                        </a>
                        <span className="text-[9px] text-surface-200/25">{chainName}</span>
                    </div>
                </div>
                <div className="text-right">
                    {loading ? (
                        <Loader2 size={14} className="animate-spin text-surface-200/30" />
                    ) : (
                        <p className="text-base font-bold text-surface-100">{formatUsd(totalUsd)}</p>
                    )}
                </div>
            </div>

            {/* Token list (expandable) */}
            {balance?.tokens?.length > 0 && (
                <>
                    <button onClick={() => setExpanded(!expanded)} className="w-full px-4 py-2 border-t border-white/5 flex items-center justify-between text-xs text-surface-200/40 hover:bg-white/[0.02] transition-colors">
                        <span>{balance.tokens.length} token{balance.tokens.length > 1 ? 's' : ''}</span>
                        <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                        <div className="border-t border-white/5 divide-y divide-white/5">
                            {balance.tokens.map((token, i) => {
                                const price = Number(token.price || 0);
                                const bal = Number(token.balance || 0);
                                const usd = price * bal;
                                return (
                                    <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-full bg-surface-700/60 border border-white/5 flex items-center justify-center text-[10px] font-bold text-surface-200/60">
                                            {token.symbol?.slice(0, 2) || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-surface-100 flex items-center gap-1.5">
                                                {token.symbol}
                                                {token.isRisk && <AlertTriangle size={10} className="text-red-400" />}
                                            </p>
                                            <p className="text-[10px] text-surface-200/30">{bal.toLocaleString('en-US', { maximumFractionDigits: 6 })}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-surface-100">{formatUsd(usd)}</p>
                                            <p className="text-[9px] text-surface-200/25">{price < 0.01 ? `$${price.toFixed(8)}` : `$${price.toFixed(4)}`}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {balance?.tokens?.length === 0 && !loading && (
                <div className="px-4 py-3 border-t border-white/5 text-center text-xs text-surface-200/25">
                    📭 Empty wallet — fund it to start trading
                </div>
            )}

            {/* Actions */}
            <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-2">
                <button onClick={() => { loadBalance(); onRefresh(); }} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-brand-400 transition-colors" title="Refresh">
                    <RefreshCw size={12} />
                </button>
                {!wallet.isDefault && (
                    <button onClick={() => onSetDefault(wallet.id)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-amber-400 transition-colors" title="Set Default">
                        <Star size={12} />
                    </button>
                )}
                <div className="flex-1" />
                <button onClick={() => onDelete(wallet.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-200/20 hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    );
}

/* ── Main WalletsPage ── */
export default function WalletsPage() {
    const { t } = useTranslation();
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    const loadWallets = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getWallets();
            setWallets(data.wallets || []);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadWallets(); }, [loadWallets]);

    const handleSetDefault = async (id) => {
        try { await api.setDefaultWallet(id); loadWallets(); } catch { /* ignore */ }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this wallet? This cannot be undone.')) return;
        try { await api.deleteWallet(id); loadWallets(); } catch { /* ignore */ }
    };

    const totalPortfolio = wallets.length; // placeholder — real total comes from balance cards

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
                        <Wallet size={22} className="text-brand-400" />
                        {t('dashboard.sidebar.wallets') || 'Wallets'}
                    </h1>
                    <p className="text-xs text-surface-200/40 mt-0.5">{wallets.length} trading wallet{wallets.length !== 1 ? 's' : ''} · X Layer</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadWallets} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                        <RefreshCw size={12} /> Refresh
                    </button>
                    <button onClick={() => setShowCreate(true)} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
                        <Plus size={12} /> New Wallet
                    </button>
                </div>
            </div>

            {/* Wallet grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
            ) : wallets.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Wallet size={40} className="mx-auto text-surface-200/20 mb-4" />
                    <h2 className="text-lg font-semibold text-surface-100 mb-2">No Wallets Yet</h2>
                    <p className="text-sm text-surface-200/40 mb-6 max-w-sm mx-auto">Create your first trading wallet to start swapping, transferring, and managing assets on-chain.</p>
                    <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
                        <Plus size={14} className="inline mr-1.5" /> Create Wallet
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {wallets.map(w => (
                        <WalletCard
                            key={w.id}
                            wallet={w}
                            onRefresh={loadWallets}
                            onSetDefault={handleSetDefault}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* Create modal */}
            {showCreate && (
                <CreateWalletModal onClose={() => setShowCreate(false)} onCreated={loadWallets} />
            )}
        </div>
    );
}
