import { Component } from 'react';

/**
 * ErrorBoundary — catches unhandled React errors and shows a fallback UI
 * instead of crashing the entire app.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info?.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-[60vh] p-8">
                    <div className="text-center max-w-md space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl">
                            💥
                        </div>
                        <h2 className="text-lg font-semibold text-surface-100">Something went wrong</h2>
                        <p className="text-sm text-surface-200/50 leading-relaxed">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <button
                            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
                            className="px-5 py-2.5 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-all text-sm font-medium"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
