import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Brain, Plus, Trash2, RefreshCw, Loader2, Save,
    Key, Tag, AlertCircle, Sparkles,
} from 'lucide-react';

export default function AiMemoryPage() {
    const { t } = useTranslation();
    const [preferences, setPreferences] = useState({});
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [saving, setSaving] = useState(false);

    const loadPreferences = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.request('/user/preferences');
            setPreferences(data?.preferences || {});
        } catch (err) {
            console.error('Failed to load preferences:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadPreferences(); }, [loadPreferences]);

    const savePreference = async () => {
        if (!newKey.trim() || !newValue.trim()) return;
        setSaving(true);
        try {
            await api.request('/user/preferences', {
                method: 'POST',
                body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
            });
            setNewKey('');
            setNewValue('');
            await loadPreferences();
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    };

    const deletePreference = async (key) => {
        if (!confirm(t('dashboard.aiMemoryPage.deleteConfirm', { key }))) return;
        try {
            await api.request(`/user/preferences/${encodeURIComponent(key)}`, { method: 'DELETE' });
            await loadPreferences();
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    };

    const entries = Object.entries(preferences);

    const SUGGESTED_KEYS = [
        { key: 'nickname', desc: 'What AI calls you' },
        { key: 'language', desc: 'Preferred language' },
        { key: 'trading_style', desc: 'Cautious/Aggressive' },
        { key: 'favorite_chain', desc: 'Preferred chain' },
        { key: 'risk_tolerance', desc: 'Low/Medium/High' },
        { key: 'timezone', desc: 'Your timezone' },
    ];

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/5 flex items-center justify-center">
                        <Brain size={20} className="text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.aiMemoryPage.title')}</h1>
                        <p className="text-xs text-surface-200/40">{t('dashboard.aiMemoryPage.subtitle')}</p>
                    </div>
                </div>
                <button onClick={loadPreferences} className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-surface-100 transition-colors">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Info */}
            <div className="glass-card p-4 flex items-start gap-3 border-l-2 border-violet-500/30">
                <Sparkles size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-surface-200/60">
                    {t('dashboard.aiMemoryPage.description')}
                </p>
            </div>

            {/* Add New */}
            <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                    <Plus size={14} className="text-emerald-400" /> {t('dashboard.aiMemoryPage.addMemory')}
                </h3>
                <div className="flex gap-2 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                        <label className="text-[10px] text-surface-200/40 uppercase tracking-wider mb-1 block">{t('dashboard.aiMemoryPage.keyLabel')}</label>
                        <input
                            type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
                            placeholder={t('dashboard.aiMemoryPage.keyPlaceholder')}
                            className="w-full bg-surface-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-200/25 focus:outline-none focus:border-violet-400/50"
                        />
                    </div>
                    <div className="flex-[2] min-w-[200px]">
                        <label className="text-[10px] text-surface-200/40 uppercase tracking-wider mb-1 block">{t('dashboard.aiMemoryPage.valueLabel')}</label>
                        <input
                            type="text" value={newValue} onChange={e => setNewValue(e.target.value)}
                            placeholder={t('dashboard.aiMemoryPage.valuePlaceholder')}
                            onKeyDown={e => { if (e.key === 'Enter') savePreference(); }}
                            className="w-full bg-surface-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-200/25 focus:outline-none focus:border-violet-400/50"
                        />
                    </div>
                    <div className="flex items-end">
                        <button onClick={savePreference} disabled={saving || !newKey.trim() || !newValue.trim()}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/25 disabled:opacity-40 transition-all flex items-center gap-1.5">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {t('dashboard.common.save')}
                        </button>
                    </div>
                </div>
                {/* Quick suggestions */}
                <div className="flex gap-1.5 flex-wrap">
                    {SUGGESTED_KEYS.filter(s => !preferences[s.key]).slice(0, 4).map(s => (
                        <button key={s.key} onClick={() => { setNewKey(s.key); }}
                            className="px-2 py-1 rounded-md bg-surface-800/40 text-[10px] text-surface-200/40 hover:text-violet-400 hover:bg-violet-500/10 transition-colors">
                            <Tag size={8} className="inline mr-0.5" /> {s.key}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stored Memories */}
            <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-bold text-surface-100 flex items-center gap-2">
                    <Key size={14} className="text-amber-400" /> {t('dashboard.aiMemoryPage.storedMemories')}
                    <span className="text-[10px] text-surface-200/30 font-normal">({entries.length})</span>
                </h3>
                {loading ? (
                    <div className="flex items-center justify-center py-8 gap-2">
                        <Loader2 size={16} className="animate-spin text-violet-400" />
                        <span className="text-sm text-surface-200/40">{t('dashboard.common.loading')}</span>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                        <AlertCircle size={28} className="text-surface-200/20 mx-auto" />
                        <p className="text-sm text-surface-200/40">{t('dashboard.aiMemoryPage.noMemories')}</p>
                        <p className="text-[10px] text-surface-200/25">{t('dashboard.aiMemoryPage.noMemoriesHint')}</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {entries.map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-800/30 hover:bg-surface-800/50 transition-colors group">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="text-xs text-violet-400 font-mono font-semibold whitespace-nowrap">{key}</span>
                                    <span className="text-xs text-surface-200/60 truncate">{value}</span>
                                </div>
                                <button onClick={() => deletePreference(key)}
                                    className="p-1.5 rounded-lg text-surface-200/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
