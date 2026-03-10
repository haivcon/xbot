import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { Wallet, Copy, Check, ExternalLink, RefreshCw, Star } from 'lucide-react';

export default function WalletsPage() {
    const { t } = useTranslation();
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(null);

    useEffect(() => {
        api.getWallets()
            .then(d => setWallets(d.wallets || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const copyAddr = (addr) => {
        navigator.clipboard.writeText(addr);
        setCopied(addr);
        setTimeout(() => setCopied(null), 1500);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.wallets')}</h1>

            <div className="stat-card inline-flex">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                        <Wallet size={20} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-xs text-surface-200/50">Total Wallets</p>
                        <p className="text-2xl font-bold text-surface-100">{wallets.length}</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : wallets.length === 0 ? (
                <div className="glass-card p-8 text-center text-surface-200/40">
                    <Wallet size={40} className="mx-auto mb-3 text-surface-200/20" />
                    <p>{t('dashboard.common.noData')}</p>
                    <p className="text-xs mt-1">Create wallets via the Telegram bot</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {wallets.map(w => (
                        <div key={w.id} className="glass-card-hover p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-surface-100">{w.walletName || 'Wallet'}</h3>
                                    {w.isDefault ? <Star size={14} className="text-amber-400 fill-amber-400" /> : null}
                                </div>
                                <span className="badge-info text-[10px]">Chain {w.chainIndex}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-surface-800/50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs text-surface-200/60 flex-1 truncate">{w.address}</span>
                                <button
                                    onClick={() => copyAddr(w.address)}
                                    className="p-1 rounded hover:bg-white/5 text-surface-200/40 hover:text-surface-200 transition-colors"
                                >
                                    {copied === w.address ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                                <a
                                    href={`https://www.okx.com/web3/explorer/xlayer/address/${w.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors"
                                >
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                            {w.createdAt && (
                                <p className="text-[10px] text-surface-200/30 mt-2">
                                    Created: {new Date(w.createdAt * 1000).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
