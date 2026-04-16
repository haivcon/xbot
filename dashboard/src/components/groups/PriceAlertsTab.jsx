import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Plus, Tag, Timer, Image as ImageIcon, Play, Trash2, Save, X, Loader2 } from 'lucide-react';
import useToastStore from '@/stores/toastStore';
import api from '@/api/client';

const PA_CHAINS = [
    { chainIndex: '196', shortName: 'xlayer', label: 'X Layer' },
    { chainIndex: '1', shortName: 'eth', label: 'Ethereum' },
    { chainIndex: '56', shortName: 'bsc', label: 'BSC' },
    { chainIndex: '137', shortName: 'polygon', label: 'Polygon' },
    { chainIndex: '42161', shortName: 'arbitrum', label: 'Arbitrum' },
    { chainIndex: '8453', shortName: 'base', label: 'Base' },
    { chainIndex: '501', shortName: 'solana', label: 'Solana' },
];

const INTERVAL_OPTIONS = [
    { value: 60, label: '1m' },
    { value: 120, label: '2m' },
    { value: 300, label: '5m' },
    { value: 600, label: '10m' },
    { value: 1800, label: '30m' },
    { value: 3600, label: '1h' },
    { value: 7200, label: '2h' },
    { value: 18000, label: '5h' },
    { value: 43200, label: '12h' },
    { value: 86400, label: '24h' },
];

export default function PriceAlertsTab({ group }) {
    const { t } = useTranslation();
    const toast = useToastStore();
    
    const [paTokens, setPaTokens] = useState([]);
    const [paLoading, setPaLoading] = useState(false);
    const [paAdding, setPaAdding] = useState(false);
    const [paForm, setPaForm] = useState({ tokenAddress: '', tokenLabel: '', intervalSeconds: 3600, chainIndex: '196', chainShortName: 'xlayer' });
    const [paEditing, setPaEditing] = useState(null);
    const [paSaving, setPaSaving] = useState(false);
    const [paTitles, setPaTitles] = useState([]);
    const [paTitleInput, setPaTitleInput] = useState('');
    const [paSelectedToken, setPaSelectedToken] = useState(null);
    const [paMedia, setPaMedia] = useState([]);
    const [paMediaInput, setPaMediaInput] = useState('');
    const [paMediaToken, setPaMediaToken] = useState(null);
    
    const [lastSynced, setLastSynced] = useState(null);
    const syncTimerRef = useRef(null);

    const loadPaData = useCallback(async (showLoading = true) => {
        if (showLoading) setPaLoading(true);
        try {
            const r = await api.getPriceAlerts(group.chatId);
            setPaTokens(r?.tokens || []);
            setLastSynced(Date.now());
        } catch { /* silent */ }
        if (showLoading) setPaLoading(false);
    }, [group.chatId]);

    useEffect(() => {
        loadPaData(true);
        syncTimerRef.current = setInterval(() => loadPaData(false), 30_000);
        return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current); };
    }, [loadPaData]);

    const addPriceAlertToken = async () => {
        if (!paForm.tokenAddress.trim()) return;
        setPaAdding(true);
        try {
            await api.addPriceAlert(group.chatId, paForm);
            toast.success(t('dashboard.userGroups.tokenAdded') || 'Token added!');
            setPaForm({ tokenAddress: '', tokenLabel: '', intervalSeconds: 3600, chainIndex: '196', chainShortName: 'xlayer' });
            loadPaData(false);
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
        setPaAdding(false);
    };

    const updatePaToken = async (tokenId, patch) => {
        setPaSaving(true);
        try {
            await api.updatePriceAlert(group.chatId, tokenId, patch);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            setPaEditing(null);
            loadPaData(false);
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
        setPaSaving(false);
    };

    const deletePaToken = async (tokenId) => {
        try {
            await api.deletePriceAlert(group.chatId, tokenId);
            toast.success(t('dashboard.userGroups.tokenDeleted') || 'Token deleted!');
            setPaTokens(prev => prev.filter(tk => tk.id !== tokenId));
            if (paSelectedToken === tokenId) { setPaSelectedToken(null); setPaTitles([]); }
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
    };

    const sendNow = async (tokenId) => {
        try {
            await api.sendPriceAlertNow(group.chatId, tokenId);
            toast.success(t('dashboard.userGroups.alertSent') || 'Alert sent!');
        } catch (e) {
            toast.error(e?.message || t('dashboard.common.toastError'));
        }
    };

    const loadTitles = async (tokenId) => {
        setPaSelectedToken(tokenId);
        try {
            const r = await api.getPriceAlertTitles(group.chatId, tokenId);
            setPaTitles(r?.titles || []);
        } catch { setPaTitles([]); }
    };

    const addTitle = async () => {
        if (!paTitleInput.trim() || !paSelectedToken) return;
        try {
            await api.addPriceAlertTitle(group.chatId, paSelectedToken, paTitleInput.trim());
            toast.success(t('dashboard.userGroups.titleAdded') || 'Title added!');
            setPaTitleInput('');
            const r = await api.getPriceAlertTitles(group.chatId, paSelectedToken);
            setPaTitles(r?.titles || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const deleteTitle = async (titleId) => {
        try {
            await api.deletePriceAlertTitle(group.chatId, titleId);
            toast.success(t('dashboard.userGroups.titleDeleted') || 'Title deleted!');
            setPaTitles(prev => prev.filter(tl => tl.id !== titleId));
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const loadMedia = async (tokenId) => {
        setPaMediaToken(tokenId);
        try {
            const r = await api.getPriceAlertMedia(group.chatId, tokenId);
            setPaMedia(r?.media || []);
        } catch { setPaMedia([]); }
    };

    const addMedia = async () => {
        if (!paMediaInput.trim() || !paMediaToken) return;
        try {
            await api.addPriceAlertMedia(group.chatId, paMediaToken, 'photo', paMediaInput.trim());
            toast.success(t('dashboard.userGroups.mediaAdded') || 'Media added!');
            setPaMediaInput('');
            const r = await api.getPriceAlertMedia(group.chatId, paMediaToken);
            setPaMedia(r?.media || []);
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    const deleteMedia = async (mediaId) => {
        try {
            await api.deletePriceAlertMedia(group.chatId, mediaId);
            toast.success(t('dashboard.userGroups.mediaDeleted') || 'Media deleted!');
            setPaMedia(prev => prev.filter(m => m.id !== mediaId));
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
    };

    if (paLoading) {
        return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-amber-400" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs text-surface-200/40">{t('dashboard.userGroups.priceAlertsDesc') || 'Manage automated price alerts for this group (max 3 tokens).'}</p>
                {lastSynced && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400/70 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ⚡ {new Date(lastSynced).toLocaleTimeString()}
                    </span>
                )}
            </div>
            <p className="text-[10px] text-surface-200/25 -mt-2">{t('dashboard.userGroups.priceAlertsHint')}</p>

            {/* Token List */}
            {paTokens.length > 0 ? (
                <div className="space-y-2">
                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                        <TrendingUp size={12} className="text-emerald-400" /> {t('dashboard.userGroups.priceAlerts')} ({paTokens.length}/3)
                        <span className="text-[9px] text-surface-200/25 font-mono font-normal">/listtokens</span>
                    </h4>
                    {paTokens.map(tk => (
                        <div key={tk.id} className={`p-3 rounded-xl border transition-all ${tk.enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.02] border-white/5'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <TrendingUp size={14} className={tk.enabled ? 'text-emerald-400' : 'text-surface-200/30'} />
                                    <span className="text-sm font-semibold text-surface-100 truncate">{tk.tokenLabel || tk.tokenAddress.slice(0, 10) + '...'}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40">{tk.chainShortName || 'xlayer'}</span>
                                </div>
                                <button onClick={() => updatePaToken(tk.id, { enabled: !tk.enabled })}
                                    className={`w-9 h-4.5 rounded-full transition-all relative ${tk.enabled ? 'bg-emerald-500' : 'bg-surface-700'}`}>
                                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${tk.enabled ? 'left-[1.125rem]' : 'left-0.5'}`} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40 flex items-center gap-1" title={t('dashboard.userGroups.intervalHint') || 'Alert frequency — how often price updates are sent'}>
                                    <Timer size={9} /> {INTERVAL_OPTIONS.find(o => o.value === tk.intervalSeconds)?.label || `${tk.intervalSeconds}s`}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40 flex items-center gap-1" title={t('dashboard.userGroups.titleCountHint') || 'Custom titles rotate randomly on each alert (max 44)'}>
                                    <Tag size={9} /> {tk.titleCount || 0}/44 {t('dashboard.userGroups.titleCount') || 'titles'}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/40 text-surface-200/40 flex items-center gap-1" title={t('dashboard.userGroups.mediaCountHint') || 'Media attachments rotate randomly on each alert (max 44)'}>
                                    <ImageIcon size={9} /> {tk.mediaCount || 0}/44 {t('dashboard.userGroups.mediaCount') || 'media'}
                                </span>
                            </div>
                            <p className="text-[10px] text-surface-200/30 font-mono truncate mb-2">{tk.tokenAddress}</p>
                            <div className="flex gap-1">
                                <button onClick={() => setPaEditing(paEditing === tk.id ? null : tk.id)} title={t('dashboard.userGroups.editTokenHint') || 'Edit token label & interval (Telegram: token detail → Edit)'}
                                    className="px-2 py-1 rounded text-[10px] bg-brand-500/10 text-brand-400 hover:bg-brand-500/20">✏️ {t('dashboard.userGroups.editToken')}</button>
                                <button onClick={() => loadMedia(tk.id)} title={t('dashboard.userGroups.mediaManageHint') || 'Add/remove photo/GIF/video attachments (max 44, rotate randomly). Telegram: token → 📷 Media'}
                                    className="px-2 py-1 rounded text-[10px] bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"><ImageIcon size={9} /> {t('dashboard.userGroups.manageMedia') || 'Media'}</button>
                                <button onClick={() => loadTitles(tk.id)} title={t('dashboard.userGroups.titleManageHint') || 'Add/remove custom titles (max 44, rotate randomly). Telegram: token → 📝 Titles'}
                                    className="px-2 py-1 rounded text-[10px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"><Tag size={9} /> {t('dashboard.userGroups.manageTitles')}</button>
                                <button onClick={() => sendNow(tk.id)} title={t('dashboard.userGroups.sendNowHint') || 'Send price alert immediately (resets timer). Telegram: token detail → ▶ Send Now'}
                                    className="px-2 py-1 rounded text-[10px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-0.5">
                                    <Play size={9} /> {t('dashboard.userGroups.sendNow')}
                                </button>
                                <button onClick={() => deletePaToken(tk.id)} title={t('dashboard.userGroups.deleteTokenHint') || 'Remove this token and all its titles/media. Telegram: /rmtoken'}
                                    className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center gap-0.5">
                                    <Trash2 size={9} /> {t('dashboard.userGroups.deleteToken')}
                                </button>
                            </div>

                            {/* Edit Form */}
                            {paEditing === tk.id && (
                                <div className="mt-2 p-2 bg-surface-800/40 rounded-lg space-y-2">
                                    <div>
                                        <label className="text-[10px] text-surface-200/40">{t('dashboard.userGroups.tokenLabel') || 'Label'}</label>
                                        <input defaultValue={tk.tokenLabel || ''} id={`pa-label-${tk.id}`}
                                            className="input-field !py-1 !text-xs w-full" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-surface-200/40">{t('dashboard.userGroups.interval') || 'Interval'}</label>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {INTERVAL_OPTIONS.map(opt => (
                                                <button key={opt.value} id={`pa-int-${tk.id}-${opt.value}`}
                                                    onClick={() => {
                                                        document.querySelectorAll(`[id^="pa-int-${tk.id}-"]`).forEach(b => b.classList.remove('!bg-brand-500/20', '!text-brand-400'));
                                                        document.getElementById(`pa-int-${tk.id}-${opt.value}`)?.classList.add('!bg-brand-500/20', '!text-brand-400');
                                                    }}
                                                    className={`px-2 py-1 rounded text-[10px] ${tk.intervalSeconds === opt.value ? '!bg-brand-500/20 !text-brand-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => {
                                        const label = document.getElementById(`pa-label-${tk.id}`)?.value;
                                        const activeInt = document.querySelector(`[id^="pa-int-${tk.id}-"].\\!bg-brand-500\\/20`);
                                        const interval = activeInt ? Number(activeInt.id.split('-').pop()) : tk.intervalSeconds;
                                        updatePaToken(tk.id, { tokenLabel: label, intervalSeconds: interval });
                                    }} disabled={paSaving}
                                        className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                                        {paSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {t('dashboard.common.save') || 'Save'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-surface-200/30 text-center py-4">{t('dashboard.userGroups.noPriceAlerts') || 'No price alerts configured. Add a token below.'}</p>
            )}

            {/* Add Token Form */}
            {paTokens.length < 3 && (
                <div className="bg-surface-800/30 rounded-xl p-3 space-y-2">
                    <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                        <Plus size={12} className="text-emerald-400" /> {t('dashboard.userGroups.addToken') || 'Add Token'}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/60 font-mono font-normal">{paTokens.length}/3</span>
                    </h4>
                    <p className="text-[10px] text-surface-200/30">{t('dashboard.userGroups.addTokenDesc') || 'Add a token to track its price. The bot will send periodic updates to this group. Max 3 tokens per group.'}</p>
                    <input value={paForm.tokenAddress} onChange={e => setPaForm(p => ({ ...p, tokenAddress: e.target.value }))}
                        placeholder={t('dashboard.userGroups.tokenAddress') || 'Token contract address'} className="input-field !py-1.5 !text-xs w-full" />
                    <input value={paForm.tokenLabel} onChange={e => setPaForm(p => ({ ...p, tokenLabel: e.target.value }))}
                        placeholder={t('dashboard.userGroups.tokenLabel') || 'Label (e.g. BANMAO)'} className="input-field !py-1.5 !text-xs w-full" />
                    <div>
                        <label className="text-[10px] text-surface-200/40 mb-1 block">{t('dashboard.userGroups.interval') || 'Interval'} <span className="text-surface-200/20">— {t('dashboard.userGroups.intervalDesc') || 'How often the alert is sent (min 1m, max 24h)'}</span></label>
                        <div className="flex flex-wrap gap-1">
                            {INTERVAL_OPTIONS.map(opt => (
                                <button key={opt.value} onClick={() => setPaForm(p => ({ ...p, intervalSeconds: opt.value }))}
                                    className={`px-2 py-1 rounded text-[10px] ${paForm.intervalSeconds === opt.value ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Chain Selector */}
                    <div>
                        <label className="text-[10px] text-surface-200/40 mb-1 block">{t('dashboard.userGroups.chain') || 'Chain'} <span className="text-surface-200/20">— {t('dashboard.userGroups.chainDesc') || 'Blockchain network of this token'}</span></label>
                        <div className="flex flex-wrap gap-1">
                            {PA_CHAINS.map(ch => (
                                <button key={ch.chainIndex} onClick={() => setPaForm(p => ({ ...p, chainIndex: ch.chainIndex, chainShortName: ch.shortName }))}
                                    className={`px-2 py-1 rounded text-[10px] ${paForm.chainIndex === ch.chainIndex ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-800/30 text-surface-200/40'}`}>
                                    {ch.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={addPriceAlertToken} disabled={paAdding || !paForm.tokenAddress.trim()}
                        className="btn-primary !text-xs !px-3 !py-1.5 flex items-center gap-1 disabled:opacity-30">
                        {paAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {t('dashboard.userGroups.addToken') || 'Add Token'}
                    </button>
                    <p className="text-[9px] text-surface-200/20">💡 Telegram: /addtoken {'<address>'} — {t('dashboard.userGroups.addTokenTgHint') || 'You can also add tokens via Telegram command'}</p>
                </div>
            )}

            {/* Custom Titles Manager */}
            {paSelectedToken && (
                <div className="bg-surface-800/30 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                            <Tag size={12} className="text-amber-400" /> {t('dashboard.userGroups.manageTitles')}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/60 font-mono font-normal">{paTitles.length}/44</span>
                        </h4>
                        <button onClick={() => { setPaSelectedToken(null); setPaTitles([]); }}
                            className="text-surface-200/30 hover:text-surface-200"><X size={12} /></button>
                    </div>
                    <p className="text-[10px] text-surface-200/30">{t('dashboard.userGroups.titleDesc') || 'Custom titles rotate randomly each time a price alert is sent. Add catchy titles to keep your group engaged! Up to 44 titles per token.'}</p>
                    <div className="flex gap-2">
                        <input value={paTitleInput} onChange={e => setPaTitleInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addTitle()}
                            placeholder={t('dashboard.userGroups.titleAddPlaceholder') || 'Enter custom title...'} className="input-field !py-1.5 !text-xs flex-1" />
                        <button onClick={addTitle} disabled={paTitles.length >= 44} className="btn-primary !text-xs !px-2 !py-1.5 disabled:opacity-30">+</button>
                    </div>
                    {paTitles.length > 0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {paTitles.map(title => (
                                <div key={title.id} className="flex items-center justify-between px-2 py-1 rounded bg-surface-800/30 text-xs">
                                    <span className="text-surface-200/60 truncate">{title.title}</span>
                                    <button onClick={() => deleteTitle(title.id)} className="text-red-400/50 hover:text-red-400"><X size={10} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[9px] text-surface-200/20">💡 Telegram: {t('dashboard.userGroups.titleTgHint') || 'Token detail → 📝 Titles → Add/Bulk Add'}</p>
                </div>
            )}
            {/* Custom Media Manager */}
            {paMediaToken && (
                <div className="bg-surface-800/30 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                            <ImageIcon size={12} className="text-cyan-400" /> {t('dashboard.userGroups.manageMedia') || 'Media'}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/60 font-mono font-normal">{paMedia.length}/44</span>
                        </h4>
                        <button onClick={() => { setPaMediaToken(null); setPaMedia([]); }}
                            className="text-surface-200/30 hover:text-surface-200"><X size={12} /></button>
                    </div>
                    <p className="text-[10px] text-surface-200/30">{t('dashboard.userGroups.mediaDesc') || 'Media attachments (photo/GIF/video) rotate randomly each alert. Send media to the bot in Telegram to get file_id, or paste a direct URL. Max 44 per token.'}</p>
                    <div className="flex gap-2">
                        <input value={paMediaInput} onChange={e => setPaMediaInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addMedia()}
                            placeholder={t('dashboard.userGroups.mediaAddPlaceholder') || 'Telegram file_id or URL...'} className="input-field !py-1.5 !text-xs flex-1" />
                        <button onClick={addMedia} disabled={paMedia.length >= 44} className="btn-primary !text-xs !px-2 !py-1.5 disabled:opacity-30">+</button>
                    </div>
                    {paMedia.length > 0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {paMedia.map(m => (
                                <div key={m.id} className="flex items-center justify-between px-2 py-1 rounded bg-surface-800/30 text-xs">
                                    <span className="text-surface-200/60 truncate flex items-center gap-1">
                                        <span className="text-[9px] px-1 rounded bg-cyan-500/10 text-cyan-400">{m.mediaType || 'photo'}</span>
                                        {m.fileId?.slice(0, 30)}{m.fileId?.length > 30 ? '...' : ''}
                                    </span>
                                    <button onClick={() => deleteMedia(m.id)} className="text-red-400/50 hover:text-red-400"><X size={10} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[9px] text-surface-200/20">💡 Telegram: {t('dashboard.userGroups.mediaTgHint') || 'Token detail → 📷 Media → Send photo/GIF/video to bot'}</p>
                </div>
            )}
        </div>
    );
}
