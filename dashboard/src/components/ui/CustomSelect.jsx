import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Premium Custom Select — replaces native <select> across the dashboard.
 *
 * Props:
 *   value        — current selected value
 *   onChange     — (value) => void
 *   options      — [{ value, label, icon?, sublabel?, disabled? }]
 *   placeholder  — placeholder text when nothing selected
 *   label        — optional top label
 *   size         — 'sm' | 'md' (default 'md')
 *   disabled     — boolean
 *   className    — extra wrapper classes
 *   dropUp       — force dropdown to open upward
 *   searchable   — show a search input inside the dropdown
 */
export default function CustomSelect({
    value,
    onChange,
    options = [],
    placeholder = 'Select…',
    label,
    size = 'md',
    disabled = false,
    className = '',
    dropUp = false,
    searchable = false,
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const ref = useRef(null);
    const searchRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close on scroll (any scrollable ancestor)
    useEffect(() => {
        if (!open) return;
        const handler = () => setOpen(false);
        window.addEventListener('scroll', handler, true);
        return () => window.removeEventListener('scroll', handler, true);
    }, [open]);

    // Compute dropdown position when opening (portal)
    useEffect(() => {
        if (open && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const shouldDropUp = dropUp || spaceBelow < 240;
            setPos({
                top: shouldDropUp ? rect.top + window.scrollY : rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width,
                dropUp: shouldDropUp,
            });
        }
    }, [open, dropUp]);

    // Focus search on open
    useEffect(() => {
        if (open && searchable) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
        if (!open) setSearch('');
    }, [open, searchable]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (disabled) return;
        if (e.key === 'Escape') { setOpen(false); return; }
        if (e.key === 'Enter' || e.key === ' ') {
            if (!open) { e.preventDefault(); setOpen(true); }
        }
    }, [disabled, open]);

    const selected = options.find(o => String(o.value) === String(value));

    const filteredOptions = search
        ? options.filter(o => {
            const haystack = `${o.label} ${o.sublabel || ''}`.toLowerCase();
            return haystack.includes(search.toLowerCase());
        })
        : options;

    const isSm = size === 'sm';
    const triggerPy = isSm ? 'py-1.5' : 'py-2.5';
    const triggerText = isSm ? 'text-[11px]' : 'text-xs';

    // Dropdown rendered via portal to avoid overflow clipping
    const dropdown = open ? createPortal(
        <div
            className={`
                fixed rounded-xl border border-white/[0.08] bg-surface-800/95 backdrop-blur-xl
                shadow-2xl shadow-black/40 overflow-hidden
                animate-fadeIn
            `}
            style={{
                top: pos.dropUp ? 'auto' : pos.top,
                bottom: pos.dropUp ? `${window.innerHeight - pos.top + 4}px` : 'auto',
                left: pos.left,
                width: pos.width,
                maxHeight: '220px',
                zIndex: 9999,
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Search */}
            {searchable && (
                <div className="p-2 border-b border-white/[0.04]">
                    <input
                        ref={searchRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full bg-surface-900/50 border border-white/[0.04] rounded-lg px-2.5 py-1.5 text-[11px] text-surface-100 outline-none placeholder:text-surface-200/15 focus:border-brand-500/20 transition-colors"
                    />
                </div>
            )}

            {/* Options */}
            <div className="overflow-y-auto" style={{ maxHeight: searchable ? '170px' : '220px' }}>
                {filteredOptions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-surface-200/20">
                        No options
                    </div>
                ) : (
                    filteredOptions.map((opt, i) => {
                        const isSelected = String(opt.value) === String(value);
                        return (
                            <button
                                key={`${opt.value}-${i}`}
                                type="button"
                                onClick={() => {
                                    if (!opt.disabled) {
                                        onChange(opt.value);
                                        setOpen(false);
                                    }
                                }}
                                disabled={opt.disabled}
                                className={`
                                    w-full flex items-center gap-2.5 px-3 ${isSm ? 'py-1.5' : 'py-2.5'}
                                    text-left transition-all duration-100
                                    ${isSelected
                                        ? 'bg-brand-500/10 text-brand-400'
                                        : 'text-surface-200/70 hover:bg-white/[0.04] hover:text-surface-100'
                                    }
                                    ${opt.disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                                    ${i === 0 ? '' : 'border-t border-white/[0.02]'}
                                `}
                            >
                                {/* Option icon */}
                                {opt.icon && (
                                    <span className="flex-shrink-0 w-5 flex items-center justify-center text-surface-200/40">
                                        {opt.icon}
                                    </span>
                                )}

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    <span className={`${triggerText} font-medium block truncate`}>
                                        {opt.label}
                                    </span>
                                    {opt.sublabel && (
                                        <span className="text-[9px] text-surface-200/25 block truncate">
                                            {opt.sublabel}
                                        </span>
                                    )}
                                </div>

                                {/* Check mark */}
                                {isSelected && (
                                    <Check size={12} className="flex-shrink-0 text-brand-400" />
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div ref={ref} className={`relative ${className}`}>
            {label && (
                <label className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1 block">
                    {label}
                </label>
            )}

            {/* ── Trigger Button ── */}
            <button
                type="button"
                onClick={() => !disabled && setOpen(!open)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={`
                    w-full flex items-center gap-2 px-3 ${triggerPy} rounded-xl
                    bg-surface-900/60 border transition-all duration-200 outline-none
                    ${open
                        ? 'border-brand-500/40 ring-1 ring-brand-500/10 shadow-lg shadow-brand-500/5'
                        : 'border-white/[0.06] hover:border-white/[0.12]'
                    }
                    ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                {/* Icon */}
                {selected?.icon && (
                    <span className="flex-shrink-0 text-surface-200/50">{selected.icon}</span>
                )}

                {/* Label */}
                <span className={`flex-1 text-left truncate ${triggerText} ${selected ? 'text-surface-100 font-medium' : 'text-surface-200/30'}`}>
                    {selected?.label || placeholder}
                </span>

                {/* Sublabel */}
                {selected?.sublabel && (
                    <span className="text-[9px] text-surface-200/25 truncate max-w-[80px]">
                        {selected.sublabel}
                    </span>
                )}

                {/* Chevron */}
                <ChevronDown
                    size={isSm ? 12 : 14}
                    className={`flex-shrink-0 text-surface-200/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {dropdown}
        </div>
    );
}
