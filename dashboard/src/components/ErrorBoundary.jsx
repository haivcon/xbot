import { Component, useState, useEffect } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * OfflineBanner — shows when the browser loses connection
 */
export function OfflineBanner() {
    const [offline, setOffline] = useState(!navigator.onLine);
    useEffect(() => {
        const on = () => setOffline(false);
        const off = () => setOffline(true);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    if (!offline) return null;
    return (
        <div className="fixed top-0 left-0 right-0 z-[999] bg-amber-500/90 backdrop-blur-sm text-white text-center py-2 text-xs font-medium flex items-center justify-center gap-2 animate-fadeIn">
            <WifiOff size={14} />
            You are offline — some features may be unavailable
        </div>
    );
}

/**
 * ErrorBoundary — catches unhandled React errors and shows a premium fallback UI
 * instead of crashing the entire app.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info?.componentStack);
        this.setState({ errorInfo: info });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-[60vh] p-8">
                    <div className="text-center max-w-md space-y-5">
                        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-red-500/20 to-amber-500/20 border border-red-500/20 flex items-center justify-center">
                            <AlertTriangle size={32} className="text-red-400" />
                        </div>
                        <h2 className="text-xl font-bold text-surface-100">Something went wrong</h2>
                        <p className="text-sm text-surface-200/50 leading-relaxed">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        {this.state.errorInfo?.componentStack && (
                            <details className="text-left">
                                <summary className="text-xs text-surface-200/30 cursor-pointer hover:text-surface-200/50 transition-colors">
                                    Technical details
                                </summary>
                                <pre className="mt-2 text-[10px] text-red-400/60 bg-surface-800/50 p-3 rounded-xl overflow-auto max-h-40 border border-white/5">
                                    {this.state.errorInfo.componentStack.slice(0, 500)}
                                </pre>
                            </details>
                        )}
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => { this.setState({ hasError: false, error: null, errorInfo: null }); }}
                                className="px-5 py-2.5 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-all text-sm font-medium flex items-center gap-2"
                            >
                                <RefreshCw size={14} />
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-5 py-2.5 rounded-xl bg-surface-700/80 text-surface-200 border border-white/5 hover:bg-surface-700 transition-all text-sm font-medium"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
