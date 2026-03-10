import { useEffect, useState } from 'react';
import useToastStore from '@/stores/toastStore';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICON_MAP = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const COLOR_MAP = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    info: 'bg-brand-500/10 border-brand-500/30 text-brand-400',
};

function ToastItem({ toast, onRemove }) {
    const [exiting, setExiting] = useState(false);
    const Icon = ICON_MAP[toast.type] || Info;
    const colors = COLOR_MAP[toast.type] || COLOR_MAP.info;

    const handleRemove = () => {
        setExiting(true);
        setTimeout(() => onRemove(toast.id), 200);
    };

    useEffect(() => {
        // Start exit animation 300ms before removal
        const timer = setTimeout(() => setExiting(true), 2700);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg shadow-black/20 transition-all duration-200 ${colors} ${
                exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'
            }`}
        >
            <Icon size={18} className="shrink-0" />
            <span className="flex-1 text-sm font-medium text-surface-100">{toast.message}</span>
            <button
                onClick={handleRemove}
                className="p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
            >
                <X size={14} className="text-surface-200/50" />
            </button>
        </div>
    );
}

export default function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (!toasts.length) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
            ))}
        </div>
    );
}
