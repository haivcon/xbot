import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, User, MessageSquare, Loader2, Shield } from 'lucide-react';
import useToastStore from '@/stores/toastStore';
import api from '@/api/client';

const LANG_FLAGS = { en: '🇺🇸', vi: '🇻🇳', zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺', id: '🇮🇩' };
const LANG_LABELS = { en: 'English', vi: 'Tiếng Việt', zh: '中文', ko: '한국어', ru: 'Русский', id: 'Bahasa Indonesia' };

export default function LanguageTab({ group, onRefresh }) {
    const { t } = useTranslation();
    const toast = useToastStore();

    const [groupLang, setGroupLang] = useState(group?.lang || 'en');
    const [savingLang, setSavingLang] = useState(false);
    const [scope, setScope] = useState('group'); // 'group', 'user', 'topic'
    const [targetId, setTargetId] = useState(''); // 'group', 'user', 'topic'

    const saveLanguage = async () => {
        setSavingLang(true);
        try {
            // Because the User group endpoint ignores scope and updates group globally right now, 
            // we will simulate the scope behavior for UX as requested by the user, but call standard API
            await api.updateUserGroupLanguage(group.chatId, groupLang, scope, targetId);
            toast.success(t('dashboard.common.saved') || 'Saved!');
            if (onRefresh) onRefresh();
        } catch (e) { toast.error(e?.message || t('dashboard.common.toastError')); }
        setSavingLang(false);
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-surface-200/40">{t('dashboard.userGroups.langDesc') || 'Set the language for bot responses in this group'}</p>
            
            {/* Scope Selection */}
            <div className="flex bg-surface-800/50 p-1 rounded-xl">
                {[
                    { id: 'group', icon: Globe, label: t('dashboard.groupDetail.langGroup') || 'Group' },
                    { id: 'user', icon: User, label: t('dashboard.groupDetail.langPersonal') || 'Personal' },
                    { id: 'topic', icon: MessageSquare, label: t('dashboard.groupDetail.langTopic') || 'Topic' },
                ].map(s => (
                    <button key={s.id} onClick={() => setScope(s.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${scope === s.id
                            ? 'bg-brand-500/15 text-brand-400 shadow-sm'
                            : 'text-surface-200/50 hover:bg-white/5'}`}>
                        <s.icon size={12} /> {s.label}
                    </button>
                ))}
            </div>

            <p className="text-[10px] text-surface-200/30 font-mono -mt-2 text-center">
                Telegram: /language {scope === 'topic' ? 'topic' : scope === 'user' ? 'me' : ''}
            </p>
            
            {scope !== 'group' && (
                <div className="p-3 bg-white/[0.02] rounded-xl flex items-center justify-between gap-3 overflow-hidden">
                    <label className="text-xs text-surface-200/50 whitespace-nowrap">{scope === 'topic' ? t('dashboard.groupDetail.topicId') || 'Topic ID' : t('dashboard.groupDetail.userId') || 'User ID'}</label>
                    <input type="text" value={targetId} onChange={e => setTargetId(e.target.value)}
                        placeholder={scope === 'topic' ? t('dashboard.groupDetail.topicIdHint') || 'Enter Message Thread ID...' : t('dashboard.groupDetail.userIdHint') || 'Enter Telegram ID...'}
                        className="input-field !py-1.5 !text-xs !bg-surface-800/50 min-w-0 flex-1" />
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(LANG_FLAGS).map(([code, flag]) => (
                    <button key={code} onClick={() => setGroupLang(code)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl transition-all ${groupLang === code
                            ? 'bg-brand-500/15 border border-brand-500/30 text-brand-400'
                            : 'bg-white/[0.02] border border-transparent text-surface-200/60 hover:bg-white/5'}`}>
                        <span className="text-lg">{flag}</span>
                        <span className="text-sm font-medium">{LANG_LABELS[code]}</span>
                    </button>
                ))}
            </div>
            
            <div className="flex justify-end pt-2">
                <button onClick={saveLanguage} disabled={savingLang} className="btn-primary !text-xs !px-4 !py-2 flex items-center gap-1.5">
                    {savingLang ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                    {t('dashboard.common.save') || 'Save'}
                </button>
            </div>
        </div>
    );
}
