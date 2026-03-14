import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Ghost, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4">
                <Ghost size={64} className="mx-auto text-surface-200/20" />
                <h2 className="text-4xl font-bold gradient-text">404</h2>
                <p className="text-surface-200/50">{t('dashboard.common.pageNotFound')}</p>
                <Link to="/" className="btn-primary inline-flex items-center gap-2">
                    <ArrowLeft size={16} /> {t('dashboard.common.back')}
                </Link>
            </div>
        </div>
    );
}
