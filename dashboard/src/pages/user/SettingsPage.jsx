import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import useThemeStore from '@/stores/themeStore';
import api from '@/api/client';
import CustomSelect from '@/components/CustomSelect';
import {
    Globe, Bot, Brain, Save, Check, Sun, Moon, Monitor,
    Sparkles, ToggleLeft, ToggleRight, FileText,
    MessageSquare, HandMetal, Settings as SettingsIcon, Loader2
} from 'lucide-react';
import SettingsExport from '@/components/SettingsExport';

const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English', icon: '🇺🇸' },
    { value: 'vi', label: 'Tiếng Việt', icon: '🇻🇳' },
    { value: 'zh', label: '中文', icon: '🇨🇳' },
    { value: 'ko', label: '한국어', icon: '🇰🇷' },
    { value: 'ru', label: 'Русский', icon: '🇷🇺' },
    { value: 'id', label: 'Indonesia', icon: '🇮🇩' },
];

const PERSONA_OPTIONS = [
    { value: 'default', label: '佳佳 OKX', icon: '🤖', description: 'Default AI personality' },
    { value: 'xwizard', label: 'Xwizard', icon: '🧙‍♂️', description: 'Crypto wizard personality' },
];

const PROVIDER_OPTIONS = [
    { value: 'google', label: 'Google (Gemini)', icon: '✨', description: 'Multimodal, best for complex tasks' },
    { value: 'openai', label: 'OpenAI (GPT)', icon: '🧠', description: 'Strong reasoning & code' },
    { value: 'groq', label: 'Groq (LLaMA)', icon: '⚡', description: 'Ultra-fast inference' },
];

const THINKING_OPTIONS = [
    { value: 'none', label: 'None', icon: '💤', description: 'Fastest, no extra reasoning' },
    { value: 'low', label: 'Low', icon: '💡', description: 'Light reasoning' },
    { value: 'medium', label: 'Medium', icon: '🔥', description: 'Balanced speed & quality' },
    { value: 'high', label: 'High', icon: '🚀', description: 'Deep reasoning, slower' },
];

const THEME_MODES = [
    { key: 'dark', icon: Moon, label: 'Dark' },
    { key: 'light', icon: Sun, label: 'Light' },
    { key: 'system', icon: Monitor, label: 'System' },
];

export default function SettingsPage() {
    const { t, i18n } = useTranslation();
    const { user } = useAuthStore();
    const isOwner = useAuthStore(s => s.role) === 'owner';
    const { theme, setTheme } = useThemeStore();
    const navigate = useNavigate();

    const [prefs, setPrefs] = useState({
        language: i18n.language?.substring(0, 2) || 'en',
        persona: 'default',
        provider: 'google',
        thinkingLevel: 'medium',
    });
    const [ownerSettings, setOwnerSettings] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loadingOwner, setLoadingOwner] = useState(false);

    // Load user preferences
    useEffect(() => {
        api.getProfile()
            .then((data) => {
                if (data.preferences) {
                    setPrefs(prev => ({ ...prev, ...data.preferences }));
                }
            })
            .catch(() => {});
    }, []);

    // Load owner settings
    useEffect(() => {
        if (!isOwner) return;
        setLoadingOwner(true);
        api.get('/owner/config/settings')
            .then(data => setOwnerSettings(data))
            .catch(() => {
                // Fallback to runtime config if new endpoint not yet deployed
                api.getRuntimeConfig()
                    .then(data => setOwnerSettings({
                        defaultLanguage: data.defaultLanguage || 'en',
                        aiProvider: data.aiProvider || 'google',
                        features: data.features || {},
                        systemPrompt: '',
                    }))
                    .catch(() => {});
            })
            .finally(() => setLoadingOwner(false));
    }, [isOwner]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.updatePreferences(prefs);
            i18n.changeLanguage(prefs.language);

            // Save owner settings if applicable
            if (isOwner && ownerSettings) {
                try {
                    await api.put('/owner/config/settings', ownerSettings);
                } catch {
                    // Endpoint may not exist yet, silently ignore
                }
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch {
            // handled
        } finally {
            setSaving(false);
        }
    };

    // Section wrapper
    const Section = ({ icon: Icon, title, description, children, className = '' }) => (
        <div className={`glass-card p-5 space-y-4 ${className}`}>
            <div>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                        <Icon size={16} className="text-brand-400" />
                    </div>
                    <h3 className="font-semibold text-surface-100">{title}</h3>
                </div>
                {description && (
                    <p className="text-xs text-surface-200/40 mt-2 ml-11">{description}</p>
                )}
            </div>
            {children}
        </div>
    );

    // Toggle switch component
    const ToggleSwitch = ({ value, onChange, label }) => (
        <div className="flex items-center justify-between py-2">
            <span className="text-sm text-surface-200/80">{label}</span>
            <button
                onClick={() => onChange(!value)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    value ? 'bg-brand-500' : 'bg-surface-700 border border-white/10'
                }`}
            >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    value ? 'translate-x-5' : ''
                }`} />
            </button>
        </div>
    );

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-emerald-500/20 border border-white/5 flex items-center justify-center">
                    <SettingsIcon size={20} className="text-brand-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-surface-100">{t('dashboard.sidebar.settings')}</h1>
                    <p className="text-xs text-surface-200/40">
                        {isOwner ? t('dashboard.settingsPage.ownerDesc', 'Configure your preferences and bot settings') : t('dashboard.settingsPage.userDesc', 'Customize your experience')}
                    </p>
                </div>
            </div>

            {/* ═══ Language ═══ */}
            <Section icon={Globe} title={t('dashboard.users.language')} description={t('dashboard.settingsPage.langDesc', 'Select your preferred display language')}>
                <CustomSelect
                    value={prefs.language}
                    onChange={(v) => setPrefs(p => ({ ...p, language: v }))}
                    options={LANGUAGE_OPTIONS}
                />
            </Section>

            {/* ═══ AI Settings (moved to ChatPage) ═══ */}
            <Section icon={Bot} title={t('dashboard.settingsPage.persona', 'AI Persona')} description={t('dashboard.settingsPage.aiMovedDesc', 'AI Persona, Provider, and API Keys are now in the Chat page')}>
                <button
                    onClick={() => navigate('/chat')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium hover:bg-brand-500/15 transition-colors"
                >
                    <MessageSquare size={16} />
                    {t('dashboard.settingsPage.goToChat', 'Open AI Chat → Settings')}
                </button>
            </Section>

            {/* ═══ Theme ═══ */}
            <Section icon={Sun} title={t('dashboard.settingsPage.theme', 'Theme')} description={t('dashboard.settingsPage.themeDesc', 'Choose your visual appearance')}>
                <div className="flex gap-2">
                    {THEME_MODES.map(({ key, icon: ThemeIcon, label }) => (
                        <button
                            key={key}
                            onClick={() => setTheme(key)}
                            className={`flex-1 flex flex-col items-center gap-2 py-3 px-4 rounded-xl border transition-all duration-200 ${
                                theme === key
                                    ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                                    : 'border-white/5 bg-surface-800/30 text-surface-200/50 hover:border-white/10 hover:text-surface-200/80'
                            }`}
                        >
                            <ThemeIcon size={18} />
                            <span className="text-xs font-medium">{label}</span>
                        </button>
                    ))}
                </div>
            </Section>

            {/* ═══════════════════════════════════════════ */}
            {/* ═══ OWNER-ONLY SECTIONS ═══ */}
            {/* ═══════════════════════════════════════════ */}
            {isOwner && (
                <>
                    <div className="border-t border-white/5 pt-6">
                        <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2 mb-4">
                            <Sparkles size={18} className="text-amber-400" />
                            {t('dashboard.settingsPage.ownerSection', 'Owner Settings')}
                        </h2>
                    </div>

                    {loadingOwner ? (
                        <div className="flex items-center justify-center h-24">
                            <Loader2 size={24} className="animate-spin text-brand-400" />
                        </div>
                    ) : ownerSettings && (
                        <>
                            {/* ═══ AI System Prompt ═══ */}
                            <Section icon={FileText} title={t('dashboard.settingsPage.systemPrompt', 'AI System Prompt')} description={t('dashboard.settingsPage.systemPromptDesc', 'Edit the AI persona behavior instructions')}>
                                <textarea
                                    value={ownerSettings.systemPrompt || ''}
                                    onChange={(e) => setOwnerSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                                    rows={6}
                                    placeholder={t('dashboard.settingsPage.systemPromptPlaceholder', 'Enter custom AI behavior instructions...')}
                                    className="w-full px-4 py-3 rounded-xl bg-surface-800/50 border border-white/10 text-sm text-surface-100
                                        placeholder:text-surface-200/25 focus:outline-none focus:border-brand-500/30 focus:ring-1 focus:ring-brand-500/20
                                        resize-y transition-all font-mono min-h-[120px]"
                                />
                                <p className="text-[10px] text-surface-200/30 mt-1">
                                    {t('dashboard.settingsPage.systemPromptHint', 'This prompt defines the AI personality and behavior rules. Changes apply to all users.')}
                                </p>
                            </Section>

                            {/* ═══ Feature Toggles ═══ */}
                            <Section icon={ToggleRight} title={t('dashboard.settingsPage.featureToggles', 'Feature Toggles')} description={t('dashboard.settingsPage.featureTogglesDesc', 'Enable or disable bot features globally')}>
                                <div className="divide-y divide-white/5">
                                    <ToggleSwitch
                                        value={ownerSettings.features?.ai !== false}
                                        onChange={(v) => setOwnerSettings(s => ({ ...s, features: { ...s.features, ai: v } }))}
                                        label={`🤖 ${t('dashboard.settingsPage.featureAi', 'AI Chat')}`}
                                    />
                                    <ToggleSwitch
                                        value={ownerSettings.features?.trading !== false}
                                        onChange={(v) => setOwnerSettings(s => ({ ...s, features: { ...s.features, trading: v } }))}
                                        label={`💱 ${t('dashboard.settingsPage.featureTrading', 'Trading & DeFi')}`}
                                    />
                                    <ToggleSwitch
                                        value={ownerSettings.features?.games !== false}
                                        onChange={(v) => setOwnerSettings(s => ({ ...s, features: { ...s.features, games: v } }))}
                                        label={`🎮 ${t('dashboard.settingsPage.featureGames', 'Mini Games')}`}
                                    />
                                    <ToggleSwitch
                                        value={ownerSettings.features?.priceAlerts !== false}
                                        onChange={(v) => setOwnerSettings(s => ({ ...s, features: { ...s.features, priceAlerts: v } }))}
                                        label={`🔔 ${t('dashboard.settingsPage.featureAlerts', 'Price Alerts')}`}
                                    />
                                </div>
                            </Section>

                            {/* ═══ Default Bot Language ═══ */}
                            <Section icon={Globe} title={t('dashboard.settingsPage.defaultLang', 'Default Bot Language')} description={t('dashboard.settingsPage.defaultLangDesc', 'Fallback language for new users who haven\'t set a preference')}>
                                <CustomSelect
                                    value={ownerSettings.defaultLanguage || 'en'}
                                    onChange={(v) => setOwnerSettings(s => ({ ...s, defaultLanguage: v }))}
                                    options={LANGUAGE_OPTIONS}
                                />
                            </Section>
                        </>
                    )}
                </>
            )}

            {/* ═══ Export / Import ═══ */}
            <SettingsExport />

            {/* ═══ Save Button ═══ */}
            <div className="sticky bottom-4 z-10">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`w-full sm:w-auto btn-primary flex items-center justify-center gap-2 py-3 px-8 rounded-xl text-sm font-semibold transition-all duration-300 shadow-lg ${
                        saved ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25' : 'shadow-brand-500/25'
                    }`}
                >
                    {saving ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : saved ? (
                        <Check size={16} />
                    ) : (
                        <Save size={16} />
                    )}
                    {saved ? t('dashboard.settingsPage.saved', 'Saved!') : t('dashboard.common.save')}
                </button>
            </div>
        </div>
    );
}
