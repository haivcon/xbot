import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/stores/authStore';
import api from '@/api/client';
import { Globe, Bot, Brain, Save, Check } from 'lucide-react';

export default function SettingsPage() {
    const { t, i18n } = useTranslation();
    const { user } = useAuthStore();
    const [prefs, setPrefs] = useState({
        language: i18n.language?.substring(0, 2) || 'en',
        persona: 'default',
        provider: 'google',
        thinkingLevel: 'medium',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.getProfile()
            .then((data) => {
                if (data.preferences) {
                    setPrefs(prev => ({ ...prev, ...data.preferences }));
                }
            })
            .catch(() => { });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.updatePreferences(prefs);
            i18n.changeLanguage(prefs.language);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            // handled
        } finally {
            setSaving(false);
        }
    };

    const Section = ({ icon: Icon, title, children }) => (
        <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-3">
                <Icon size={18} className="text-brand-400" />
                <h3 className="font-semibold text-surface-100">{title}</h3>
            </div>
            {children}
        </div>
    );

    return (
        <div className="space-y-6 max-w-2xl">
            <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.settings')}</h1>

            {/* Language */}
            <Section icon={Globe} title={t('dashboard.users.language')}>
                <select
                    value={prefs.language}
                    onChange={(e) => setPrefs(p => ({ ...p, language: e.target.value }))}
                    className="input-field"
                >
                    <option value="en">🇺🇸 English</option>
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="zh">🇨🇳 中文</option>
                    <option value="ko">🇰🇷 한국어</option>
                    <option value="ru">🇷🇺 Русский</option>
                    <option value="id">🇮🇩 Indonesia</option>
                </select>
            </Section>

            {/* AI Persona */}
            <Section icon={Bot} title="AI Persona">
                <select
                    value={prefs.persona}
                    onChange={(e) => setPrefs(p => ({ ...p, persona: e.target.value }))}
                    className="input-field"
                >
                    <option value="default">佳佳 OKX (Default)</option>
                    <option value="xwizard">Xwizard 🧙‍♂️</option>
                </select>
            </Section>

            {/* AI Provider */}
            <Section icon={Brain} title="AI Provider">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-surface-200/50 mb-1 block">Provider</label>
                        <select
                            value={prefs.provider}
                            onChange={(e) => setPrefs(p => ({ ...p, provider: e.target.value }))}
                            className="input-field !text-sm"
                        >
                            <option value="google">Google (Gemini)</option>
                            <option value="openai">OpenAI (GPT)</option>
                            <option value="groq">Groq (LLama)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-surface-200/50 mb-1 block">Thinking Level</label>
                        <select
                            value={prefs.thinkingLevel}
                            onChange={(e) => setPrefs(p => ({ ...p, thinkingLevel: e.target.value }))}
                            className="input-field !text-sm"
                        >
                            <option value="none">None</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                </div>
            </Section>

            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
            >
                {saved ? <Check size={16} /> : <Save size={16} />}
                {saved ? 'Saved!' : t('dashboard.common.save')}
            </button>
        </div>
    );
}
