import { useState } from 'react';
import { Download, Upload, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * SettingsExport — export/import dashboard settings as JSON.
 * Includes: language, theme, sidebar state, onboarding, custom configs.
 */
const EXPORT_KEYS = [
    'xbot_dashboard_lang', 'xbot_theme', 'xbot_sidebar_collapsed',
    'onboarding_done', 'xbot_ai_model', 'xbot_alerts',
];

export default function SettingsExport() {
    const { t } = useTranslation();
    const [importStatus, setImportStatus] = useState(null); // null | 'success' | 'error'

    const handleExport = () => {
        const data = {};
        EXPORT_KEYS.forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) data[key] = val;
        });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xbot-settings-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (typeof data !== 'object') throw new Error('Invalid format');
                    Object.entries(data).forEach(([k, v]) => {
                        if (EXPORT_KEYS.includes(k)) localStorage.setItem(k, v);
                    });
                    setImportStatus('success');
                    setTimeout(() => window.location.reload(), 1500);
                } catch {
                    setImportStatus('error');
                    setTimeout(() => setImportStatus(null), 3000);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    return (
        <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-surface-100">
                {t('dashboard.settingsPage.exportImport', 'Export / Import Settings')}
            </h3>
            <p className="text-xs text-surface-200/50">
                {t('dashboard.settingsPage.exportDesc', 'Backup your settings to a file or restore from a previous backup.')}
            </p>
            <div className="flex flex-wrap gap-3">
                <button onClick={handleExport} className="btn-secondary flex items-center gap-2 !px-4 !py-2 !text-xs">
                    <Download size={14} />
                    {t('dashboard.settingsPage.export', 'Export')}
                </button>
                <button onClick={handleImport} className="btn-secondary flex items-center gap-2 !px-4 !py-2 !text-xs">
                    <Upload size={14} />
                    {t('dashboard.settingsPage.import', 'Import')}
                </button>
            </div>
            {importStatus === 'success' && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 animate-fadeIn">
                    <Check size={14} /> {t('dashboard.settingsPage.importSuccess', 'Settings restored! Reloading...')}
                </div>
            )}
            {importStatus === 'error' && (
                <div className="flex items-center gap-2 text-xs text-red-400 animate-fadeIn">
                    <AlertTriangle size={14} /> {t('dashboard.settingsPage.importError', 'Invalid file format')}
                </div>
            )}
        </div>
    );
}
