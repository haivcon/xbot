import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

/**
 * CustomSelect — Premium glassmorphism dropdown.
 * 
 * Props:
 *   value       — current value
 *   onChange     — (value) => void
 *   options      — [{ value, label, icon?, description? }]
 *   placeholder  — placeholder when no value
 *   searchable   — enable search filtering (default false)
 *   disabled     — disable the select
 *   className    — extra wrapper class
 */
export default function CustomSelect({
    value,
    onChange,
    options = [],
    placeholder = 'Select...',
    searchable = false,
    disabled = false,
    className = '',
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const wrapperRef = useRef(null);
    const searchRef = useRef(null);
    const listRef = useRef(null);

    const selected = options.find(o => o.value === value);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus search on open
    useEffect(() => {
        if (open && searchable) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
        if (open) {
            const idx = filteredOptions.findIndex(o => o.value === value);
            setHighlightIdx(idx >= 0 ? idx : 0);
        }
    }, [open]);

    const filteredOptions = search
        ? options.filter(o =>
            o.label.toLowerCase().includes(search.toLowerCase()) ||
            (o.description && o.description.toLowerCase().includes(search.toLowerCase()))
        )
        : options;

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightIdx >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[data-option]');
            items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightIdx]);

    const handleSelect = useCallback((val) => {
        onChange(val);
        setOpen(false);
        setSearch('');
    }, [onChange]);

    const handleKeyDown = (e) => {
        if (disabled) return;
        if (!open) {
            if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                setOpen(false);
                setSearch('');
                break;
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIdx(i => Math.min(i + 1, filteredOptions.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIdx(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightIdx >= 0 && filteredOptions[highlightIdx]) {
                    handleSelect(filteredOptions[highlightIdx].value);
                }
                break;
        }
    };

    return (
        <div ref={wrapperRef} className={`relative ${open ? 'z-50' : ''} ${className}`} onKeyDown={handleKeyDown}>
            {/* Trigger Button */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(!open)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200
                    ${open
                        ? 'border-brand-500/40 ring-2 ring-brand-500/20 bg-surface-800/80'
                        : 'border-white/10 bg-surface-800/50 hover:border-white/20 hover:bg-surface-800/70'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                {/* Selected display */}
                {selected ? (
                    <span className="flex items-center gap-2.5 flex-1 min-w-0">
                        {selected.icon && <span className="text-base flex-shrink-0">{selected.icon}</span>}
                        <span className="truncate text-sm text-surface-100 font-medium">{selected.label}</span>
                        {selected.description && (
                            <span className="text-[11px] text-surface-200/40 truncate hidden sm:inline">
                                — {selected.description}
                            </span>
                        )}
                    </span>
                ) : (
                    <span className="text-sm text-surface-200/40 flex-1">{placeholder}</span>
                )}
                <ChevronDown
                    size={16}
                    className={`text-surface-200/40 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown Panel */}
            {open && (
                <div className="absolute z-50 w-full mt-2 rounded-xl border border-white/10 bg-surface-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-fadeIn"
                    role="listbox"
                >
                    {/* Search */}
                    {searchable && (
                        <div className="p-2 border-b border-white/5">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800/60 border border-white/5">
                                <Search size={13} className="text-surface-200/30 flex-shrink-0" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
                                    placeholder="Search..."
                                    className="w-full bg-transparent text-sm text-surface-100 placeholder:text-surface-200/25 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Options list */}
                    <div ref={listRef} className="max-h-64 overflow-y-auto py-1 custom-scrollbar">
                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-surface-200/30">No options found</div>
                        ) : (
                            filteredOptions.map((opt, idx) => {
                                const isSelected = opt.value === value;
                                const isHighlighted = idx === highlightIdx;
                                return (
                                    <button
                                        key={opt.value}
                                        data-option
                                        type="button"
                                        onClick={() => handleSelect(opt.value)}
                                        onMouseEnter={() => setHighlightIdx(idx)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100
                                            ${isHighlighted ? 'bg-brand-500/10' : ''}
                                            ${isSelected ? 'text-brand-400' : 'text-surface-200/80 hover:text-surface-100'}
                                        `}
                                        role="option"
                                        aria-selected={isSelected}
                                    >
                                        {opt.icon && <span className="text-base flex-shrink-0">{opt.icon}</span>}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{opt.label}</div>
                                            {opt.description && (
                                                <div className="text-[11px] text-surface-200/35 truncate mt-0.5">{opt.description}</div>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <Check size={14} className="text-brand-400 flex-shrink-0" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
