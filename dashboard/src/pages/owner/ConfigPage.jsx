import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { Settings, Bot, Key, ShieldAlert, Users, Save, Check, RefreshCw, Trash2, Eye, EyeOff } from 'lucide-react';

export default function ConfigPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('keys');
    const [aiKeys, setAiKeys] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [coOwners, setCoOwners] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [k, b, c] = await Promise.all([
                api.get('/owner/config/ai-keys'),
                api.get('/owner/config/blocks'),
                api.get('/owner/co-owners'),
            ]);
            setAiKeys(k.keys || []);
            setBlocks(b.blocks || []);
            setCoOwners(c.coOwners || []);
        } catch { /* handled */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleBlockUser = async (userId) => {
        await api.post('/owner/config/block-user', { userId, reason: 'Blocked from dashboard' });
        fetchData();
    };

    const handleUnblockUser = async (userId) => {
        await api.post('/owner/config/unblock-user', { userId });
        fetchData();
    };

    const handleRemoveCoOwner = async (userId) => {
        if (!confirm(t('dashboard.common.confirm'))) return;
        await api.delete(`/owner/config/co-owner/${userId}`);
        fetchData();
    };

    const tabs = [
        { id: 'keys', label: 'API Keys', icon: Key },
        { id: 'blocks', label: 'Blocked', icon: ShieldAlert },
        { id: 'coowners', label: 'Co-Owners', icon: Users },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.config')}</h1>
                <button onClick={fetchData} className="btn-secondary !py-2 !px-3">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-surface-800/50 rounded-xl p-1 self-start w-fit">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-brand-500/20 text-brand-400' : 'text-surface-200/50 hover:text-surface-200'}`}
                        >
                            <Icon size={14} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
                <>
                    {/* API Keys Tab */}
                    {activeTab === 'keys' && (
                        <div className="glass-card overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                                <h3 className="font-semibold text-surface-100 flex items-center gap-2"><Key size={16} className="text-brand-400" /> User API Keys</h3>
                                <span className="text-xs text-surface-200/40">{aiKeys.length} keys</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">User ID</th>
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Name</th>
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Provider</th>
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Key (masked)</th>
                                            <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {aiKeys.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-8 text-surface-200/40">{t('dashboard.common.noData')}</td></tr>
                                        ) : aiKeys.map(k => (
                                            <tr key={k.id} className="table-row">
                                                <td className="px-5 py-3 font-mono text-xs text-surface-200/60">{k.userId}</td>
                                                <td className="px-5 py-3 text-surface-100">{k.name || '—'}</td>
                                                <td className="px-5 py-3"><span className="badge-info">{k.provider}</span></td>
                                                <td className="px-5 py-3 font-mono text-xs text-surface-200/40">
                                                    {k.apiKey ? `${k.apiKey.slice(0, 8)}...${k.apiKey.slice(-4)}` : '***'}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <button onClick={() => handleBlockUser(k.userId)} className="text-xs text-red-400 hover:text-red-300 font-medium">
                                                        Block
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Blocked Users Tab */}
                    {activeTab === 'blocks' && (
                        <div className="glass-card overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/5">
                                <h3 className="font-semibold text-surface-100 flex items-center gap-2"><ShieldAlert size={16} className="text-red-400" /> Blocked from API Keys</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">User ID</th>
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Reason</th>
                                            <th className="text-left px-5 py-3 text-surface-200/50 font-medium">Blocked By</th>
                                            <th className="text-right px-5 py-3 text-surface-200/50 font-medium">{t('dashboard.common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {blocks.length === 0 ? (
                                            <tr><td colSpan={4} className="text-center py-8 text-surface-200/40">{t('dashboard.common.noData')}</td></tr>
                                        ) : blocks.map(b => (
                                            <tr key={b.userId} className="table-row">
                                                <td className="px-5 py-3 font-mono text-xs text-surface-200/60">{b.userId}</td>
                                                <td className="px-5 py-3 text-surface-200/80">{b.reason || '—'}</td>
                                                <td className="px-5 py-3 text-surface-200/60 text-xs">{b.addedBy || '—'}</td>
                                                <td className="px-5 py-3 text-right">
                                                    <button onClick={() => handleUnblockUser(b.userId)} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
                                                        Unblock
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Co-Owners Tab */}
                    {activeTab === 'coowners' && (
                        <div className="glass-card overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/5">
                                <h3 className="font-semibold text-surface-100 flex items-center gap-2"><Users size={16} className="text-amber-400" /> Co-Owners</h3>
                            </div>
                            {coOwners.length === 0 ? (
                                <div className="p-8 text-center text-surface-200/40">{t('dashboard.common.noData')}</div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {coOwners.map(co => (
                                        <div key={co.userId} className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                            <div>
                                                <p className="font-medium text-surface-100">{co.firstName || co.username || co.userId}</p>
                                                <p className="text-xs text-surface-200/40 font-mono">{co.userId}</p>
                                            </div>
                                            <button onClick={() => handleRemoveCoOwner(co.userId)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-200/40 hover:text-red-400 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
