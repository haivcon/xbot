/**
 * Reusable skeleton loading components
 */

export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
    return (
        <div className={`${width} ${height} rounded-lg bg-white/5 animate-pulse`} />
    );
}

export function SkeletonCircle({ size = 'w-10 h-10' }) {
    return (
        <div className={`${size} rounded-full bg-white/5 animate-pulse`} />
    );
}

export function SkeletonCard({ lines = 3 }) {
    return (
        <div className="rounded-2xl border border-white/5 bg-surface-800/50 p-5 space-y-3">
            <SkeletonLine width="w-1/3" height="h-5" />
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonLine key={i} width={i === lines - 1 ? 'w-2/3' : 'w-full'} />
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
    return (
        <div className="rounded-2xl border border-white/5 bg-surface-800/50 overflow-hidden">
            {/* Header */}
            <div className="grid gap-4 px-5 py-3 border-b border-white/5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {Array.from({ length: cols }).map((_, i) => (
                    <SkeletonLine key={i} width="w-3/4" height="h-3" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="grid gap-4 px-5 py-4 border-b border-white/[0.03]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                    {Array.from({ length: cols }).map((_, c) => (
                        <SkeletonLine key={c} width={c === 0 ? 'w-full' : 'w-2/3'} />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonStatCards({ count = 4 }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/5 bg-surface-800/50 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <SkeletonLine width="w-20" height="h-3" />
                        <SkeletonCircle size="w-8 h-8" />
                    </div>
                    <SkeletonLine width="w-16" height="h-7" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonProfile() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-surface-800/50 p-6 flex items-center gap-5">
                <SkeletonCircle size="w-16 h-16" />
                <div className="space-y-2 flex-1">
                    <SkeletonLine width="w-40" height="h-6" />
                    <SkeletonLine width="w-24" height="h-4" />
                </div>
            </div>
            <SkeletonStatCards count={6} />
        </div>
    );
}

export function PageSkeleton() {
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <SkeletonLine width="w-48" height="h-8" />
            <SkeletonStatCards count={4} />
            <SkeletonTable rows={5} cols={4} />
        </div>
    );
}
