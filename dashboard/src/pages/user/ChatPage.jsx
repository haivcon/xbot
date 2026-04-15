import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useOutletContext } from 'react-router-dom';
import api from '@/api/client';
import useAuthStore from '@/stores/authStore';
import {
    MessageSquare, Send, Trash2, Plus, ChevronLeft, Bot, User, Loader2,
    Sparkles, X, ArrowDown, ChevronDown, ChevronRight, Wrench, Copy, RefreshCw, Check,
    Wallet, TrendingUp, BarChart3, Zap, Shield, Globe, Coins, ArrowLeftRight,
    HelpCircle, BookOpen, Star, Bell, Search, Activity, ArrowUpDown, Eye,
    Download, Pin, PinOff, Keyboard, Mic, MicOff, Paperclip, Image,
    ThumbsUp, ThumbsDown, Edit, Share2, Settings, Gauge, Key, ExternalLink, Home, Columns, Lock, Menu, MoreVertical,
    Brain, Save, Tag, AlertCircle, ChevronUp
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/utils/telegram';
import AiTraderPanel from '@/components/AiTraderPanel';

/* ─── Markdown renderer (lightweight, XSS-safe) ─── */
function renderMarkdown(text) {
    if (!text) return '';
    // Sanitize: strip dangerous HTML before processing
    let safe = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        // Strip internal [Used: tool_name] metadata from display
        .replace(/\n?\[Used: [\w, ]+\]/g, '');

    // Process code blocks first (protect from further parsing)
    const codeBlocks = [];
    safe = safe.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        // Syntax highlighting via CSS classes
        const langClass = lang ? ` language-${lang}` : '';
        const langLabel = lang ? `<span class="chat-code-lang">${lang}</span>` : '';
        codeBlocks.push(`<div class="chat-code-wrapper">${langLabel}<pre class="chat-code-block"><code class="${langClass}">${code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre></div>`);
        return `%%CODEBLOCK_${idx}%%`;
    });

    // Process tables (| a | b | row blocks)
    safe = safe.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter(r => r.trim());
        if (rows.length < 1) return tableBlock;
        let html = '<table class="chat-table">';
        rows.forEach((row, i) => {
            if (row.replace(/[|\-\s]/g, '') === '') return; // skip separator row
            const cells = row.split('|').filter(c => c !== '').map(c => c.trim());
            const tag = i === 0 ? 'th' : 'td';
            html += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        });
        html += '</table>';
        return html;
    });

    // Process block-level elements
    safe = safe
        // Horizontal rules
        .replace(/^-{3,}$/gm, '<hr class="chat-hr"/>')
        // Unordered lists (consecutive - lines)
        .replace(/((?:^[-*] .+$\n?)+)/gm, (block) => {
            const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`);
            return `<ul class="chat-list">${items.join('')}</ul>`;
        })
        // Ordered lists (consecutive 1. lines)
        .replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
            const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`);
            return `<ol class="chat-list chat-ol">${items.join('')}</ol>`;
        });

    // ── Multi-chain address & tx hash auto-linking ──
    // Detect chain from context keywords in the full text
    const chainMap = {
        'ethereum': 'eth', 'erc-20': 'eth', 'erc20': 'eth',
        'bsc': 'bsc', 'bnb chain': 'bsc', 'binance smart': 'bsc', 'bep-20': 'bsc', 'bep20': 'bsc',
        'arbitrum': 'arbitrum',
        'polygon': 'polygon', 'matic': 'polygon',
        'base chain': 'base', 'base network': 'base', 'base mainnet': 'base',
        'avalanche': 'avax', 'avax': 'avax',
        'optimism': 'optimism', 'op mainnet': 'optimism',
        'x layer': 'xlayer', 'xlayer': 'xlayer', 'oktc': 'xlayer',
        'solana': 'solana',
    };
    let detectedEvmChain = 'xlayer'; // default for 0x addresses
    let detectedSolChain = 'solana';
    const lowerText = text.toLowerCase();
    for (const [keyword, chain] of Object.entries(chainMap)) {
        if (lowerText.includes(keyword)) {
            if (chain === 'solana') detectedSolChain = chain;
            else detectedEvmChain = chain;
            break;
        }
    }

    // 1. EVM: 0x + 64 hex = tx hash
    safe = safe.replace(/(^|[\s(`])0x([a-fA-F0-9]{64})(?=[\s,.)}`<]|$)/gm, (_, pre, hex) => {
        const hash = '0x' + hex;
        return `${pre}<a href="https://www.okx.com/web3/explorer/${detectedEvmChain}/tx/${hash}" target="_blank" rel="noopener" class="chat-link">${hash}</a>`;
    });

    // 2. EVM: 0x + 40-42 hex = address (wallet/token/contract)
    safe = safe.replace(/(^|[\s(`])0x([a-fA-F0-9]{40,42})(?=[\s,.)}`<]|$)/gm, (_, pre, hex) => {
        const addr = '0x' + hex;
        return `${pre}<a href="https://www.okx.com/web3/explorer/${detectedEvmChain}/address/${addr}" target="_blank" rel="noopener" class="chat-link">${addr}</a>`;
    });

    // 3. Solana: base58, 32-44 chars
    safe = safe.replace(/(^|[\s(:`])([1-9A-HJ-NP-Za-km-z]{32,44})(?=[\s,.)}`<]|$)/gm, (_, pre, addr) => {
        if (/^[a-z]+$/.test(addr)) return `${pre}${addr}`;
        return `${pre}<a href="https://www.okx.com/web3/explorer/${detectedSolChain}/address/${addr}" target="_blank" rel="noopener" class="chat-link">${addr}</a>`;
    });

    // Process inline markdown (runs AFTER address linking so backtick-wrapped addresses are already linked)
    safe = safe
        .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
            if (/javascript\s*:/i.test(url)) return text;
            return `<a href="${url}" target="_blank" rel="noopener" class="chat-link">${text}</a>`;
        })
        .replace(/^> (.+)$/gm, '<blockquote class="chat-blockquote">$1</blockquote>')
        .replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>');

    // Collapse long repeated character sequences (prevent horizontal overflow)
    safe = safe.replace(/[_\-=~.·]{10,}/g, '<hr class="chat-hr"/>');

    // Newlines to <br>
    safe = safe.replace(/\n/g, '<br/>');

    // Restore code blocks
    codeBlocks.forEach((block, i) => { safe = safe.replace(`%%CODEBLOCK_${i}%%`, block); });
    return safe;
}

/* ─── Tool name → icon + color mapping ─── */
const TOOL_META = {
    get_token_price: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    get_market_price: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    search_token: { icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    get_top_tokens: { icon: Coins, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    get_token_info: { icon: BarChart3, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
    swap_tokens: { icon: ArrowLeftRight, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    get_swap_quote: { icon: ArrowLeftRight, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    create_wallet: { icon: Wallet, color: 'text-brand-400', bg: 'bg-brand-400/10' },
    get_wallet_balance: { icon: Wallet, color: 'text-brand-400', bg: 'bg-brand-400/10' },
    list_wallets: { icon: Wallet, color: 'text-brand-400', bg: 'bg-brand-400/10' },
    transfer_tokens: { icon: Zap, color: 'text-orange-400', bg: 'bg-orange-400/10' },
    get_gas_price: { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    get_signal_list: { icon: Shield, color: 'text-red-400', bg: 'bg-red-400/10' },
    analyze_token: { icon: BarChart3, color: 'text-teal-400', bg: 'bg-teal-400/10' },
};

function getToolMeta(name) {
    return TOOL_META[name] || { icon: Wrench, color: 'text-surface-200/60', bg: 'bg-white/5' };
}

/* ─── Parse tool result into structured preview ─── */
function parseToolResult(name, result) {
    try {
        const d = typeof result === 'string' ? JSON.parse(result) : result;
        if (d?.error) return { type: 'error', error: d.error };
        // Token price
        if ((name === 'get_token_price' || name === 'get_market_price') && d) {
            const price = d.price || d.lastPrice || d.usdPrice;
            const change = d.change24h || d.priceChange24h || d.changePercent24h;
            const symbol = d.symbol || d.tokenSymbol || d.token || '';
            const vol = d.volume24h || d.vol24h;
            if (price) return { type: 'price', price: Number(price), change: Number(change || 0), symbol, volume: vol ? Number(vol) : null };
        }
        // Balance
        if ((name === 'get_wallet_balance' || name === 'list_wallets') && d) {
            const tokens = d.tokens || d.balances || d.assets || (Array.isArray(d) ? d : null);
            const total = d.totalUsd || d.totalValue;
            if (tokens) return { type: 'balance', tokens: Array.isArray(tokens) ? tokens.slice(0, 5) : [], total: total ? Number(total) : null };
        }
        // Swap
        if ((name === 'swap_tokens' || name === 'get_swap_quote') && d) {
            return { type: 'swap', fromToken: d.fromToken || d.srcToken, toToken: d.toToken || d.dstToken, fromAmount: d.fromAmount || d.srcAmount, toAmount: d.toAmount || d.dstAmount || d.estimatedAmount, status: d.status || 'quoted' };
        }
        // Signals
        if (name === 'get_signal_list' && d) {
            const signals = d.signals || d.data || (Array.isArray(d) ? d : []);
            return { type: 'signals', count: signals.length, top: signals.slice(0, 3) };
        }
        // Generic object
        if (typeof d === 'object') return { type: 'data' };
        return { type: 'text', text: String(d).substring(0, 100) };
    } catch {
        return { type: 'text', text: result ? String(result).substring(0, 80) : 'Done' };
    }
}

/* ─── Rich tool call card with data previews & actions ─── */
function ToolCallCard({ toolCall, onAction }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const meta = getToolMeta(toolCall.name);
    const Icon = meta.icon;
    const parsed = parseToolResult(toolCall.name, toolCall.result);

    // Build rich preview based on parsed type
    const renderPreview = () => {
        switch (parsed.type) {
            case 'error':
                return <span className="text-red-400/80">❌ {parsed.error}</span>;
            case 'price':
                return (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-surface-100">${parsed.price?.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                        {parsed.change !== 0 && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                                parsed.change > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                                {parsed.change > 0 ? '▲' : '▼'} {Math.abs(parsed.change).toFixed(2)}%
                            </span>
                        )}
                        {parsed.symbol && <span className="text-surface-200/30 text-[10px]">{parsed.symbol.toUpperCase()}</span>}
                    </div>
                );
            case 'balance':
                return (
                    <div className="flex items-center gap-2">
                        {parsed.total != null && <span className="font-semibold text-surface-100">${parsed.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                        <span className="text-surface-200/30 text-[10px]">{parsed.tokens.length} token{parsed.tokens.length > 1 ? 's' : ''}</span>
                    </div>
                );
            case 'swap':
                return (
                    <div className="flex items-center gap-1.5 text-surface-200/70">
                        <span className="font-medium text-surface-100">{parsed.fromAmount}</span>
                        <span className="text-[10px]">{parsed.fromToken}</span>
                        <ArrowLeftRight size={10} className="text-purple-400 mx-0.5" />
                        <span className="font-medium text-surface-100">{parsed.toAmount || '...'}</span>
                        <span className="text-[10px]">{parsed.toToken}</span>
                    </div>
                );
            case 'signals':
                return (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-surface-100">{parsed.count}</span>
                        <span className="text-surface-200/30 text-[10px]">{t('dashboard.chatPage.signalsFound', 'signals found')}</span>
                    </div>
                );
            default:
                return <span className="text-surface-200/35">✅ {parsed.text || t('dashboard.chatPage.dataReceived', 'Data received')}</span>;
        }
    };

    // Context-aware action buttons
    const renderActions = () => {
        const actions = [];
        if (parsed.type === 'price')
            actions.push(
                { label: '💱 Swap', cmd: `Swap ${parsed.symbol || 'this token'}` },
                { label: '🔔 Alert', cmd: `Set price alert for ${parsed.symbol || 'this token'}` },
                { label: '🔬 Analyze', cmd: `Analyze token ${parsed.symbol || ''}` },
            );
        else if (parsed.type === 'balance')
            actions.push(
                { label: '💱 Swap', cmd: 'I want to swap tokens' },
                { label: '📤 Transfer', cmd: 'Transfer tokens' },
                { label: '📊 Portfolio', cmd: 'Show my portfolio' },
            );
        else if (parsed.type === 'swap')
            actions.push(
                { label: '💼 Balance', cmd: 'Check my wallet balance' },
                { label: '📈 Price', cmd: `What is the price of ${parsed.toToken || 'this token'}?` },
            );
        else if (parsed.type === 'signals')
            actions.push(
                { label: '🔬 Analyze top', cmd: 'Analyze the top signal token' },
                { label: '💱 Swap', cmd: 'Swap into top signal token' },
            );
        if (actions.length === 0) return null;
        return (
            <div className="flex gap-1 mt-1.5 flex-wrap">
                {actions.map((a, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); onAction?.(a.cmd); }}
                        className="px-2 py-1 rounded-lg text-[9px] font-medium bg-brand-500/8 text-brand-400/70
                            border border-brand-500/10 hover:bg-brand-500/15 hover:text-brand-400 transition-all active:scale-95">
                        {a.label}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className={`rounded-xl border border-white/5 overflow-hidden transition-all duration-200 ${expanded ? 'bg-surface-800/40' : 'bg-surface-800/20 hover:bg-surface-800/30'}`}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
            >
                <div className={`w-6 h-6 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={12} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono font-medium text-surface-200/60">{toolCall.name?.replace(/_/g, ' ')}</span>
                    <div className="text-[11px] mt-0.5">{renderPreview()}</div>
                </div>
                <ChevronDown size={12} className={`text-surface-200/30 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {/* Action buttons row */}
            {!expanded && parsed.type !== 'error' && renderActions()}
            {expanded && (
                <div className="px-3 pb-3 space-y-2 animate-fadeIn">
                    {/* Rich expanded content */}
                    {parsed.type === 'balance' && parsed.tokens.length > 0 && (
                        <div className="rounded-lg bg-surface-900/40 border border-white/5 overflow-hidden">
                            {parsed.tokens.map((tk, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-white/3 last:border-0 text-[11px]">
                                    <span className="text-surface-200/70 font-medium">{tk.symbol || tk.token || tk.name || 'Token'}</span>
                                    <span className="text-surface-100 font-semibold">{tk.balance || tk.amount || '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {parsed.type === 'signals' && parsed.top.length > 0 && (
                        <div className="rounded-lg bg-surface-900/40 border border-white/5 overflow-hidden">
                            {parsed.top.map((sig, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-white/3 last:border-0 text-[11px]">
                                    <span className="text-surface-200/70">{sig.token || sig.symbol || `Signal #${i + 1}`}</span>
                                    <span className="text-emerald-400 text-[10px] font-medium">{sig.type || sig.direction || 'BUY'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Raw data fallback */}
                    {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                        <div>
                            <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1">{t('dashboard.chatPage.arguments', 'Arguments')}</p>
                            <pre className="text-[11px] text-surface-200/60 bg-surface-900/50 rounded-lg p-2 overflow-x-auto font-mono">
                                {JSON.stringify(toolCall.args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {toolCall.result && (
                        <div>
                            <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1">{t('dashboard.chatPage.result', 'Result')}</p>
                            <pre className="text-[11px] text-surface-200/60 bg-surface-900/50 rounded-lg p-2 overflow-x-auto font-mono max-h-48 overflow-y-auto custom-scrollbar">
                                {(() => {
                                    try { return JSON.stringify(JSON.parse(toolCall.result), null, 2); }
                                    catch { return toolCall.result; }
                                })()}
                            </pre>
                        </div>
                    )}
                    {renderActions()}
                </div>
            )}
        </div>
    );
}

/* ─── Mobile message action sheet (bottom sheet) ─── */
function MessageActionSheet({ visible, onClose, message, onCopy, onFeedback, feedback, onPin, isPinned, onEdit, onSave, onRetry }) {
    const { t } = useTranslation();
    if (!visible) return null;
    const isUser = message?.role === 'user';
    const isError = !isUser && message?.content?.startsWith('\u274c');
    return (
        <>
            <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-[71] bg-surface-900 border-t border-white/10 rounded-t-2xl
                shadow-2xl shadow-black/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bottom-sheet-enter">
                <div className="flex justify-center mb-3">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {!isUser && onCopy && (
                        <button onClick={() => { onCopy(); onClose(); }}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 active:scale-95 transition-all">
                            <Copy size={18} className="text-surface-200/70" />
                            <span className="text-[10px] text-surface-200/50">{t('dashboard.chatPage.copy', 'Copy')}</span>
                        </button>
                    )}
                    {!isUser && onFeedback && (
                        <>
                            <button onClick={() => { onFeedback('up'); onClose(); }}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl active:scale-95 transition-all ${feedback === 'up' ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}>
                                <ThumbsUp size={18} className={feedback === 'up' ? 'text-emerald-400' : 'text-surface-200/70'} />
                                <span className="text-[10px] text-surface-200/50">{t('dashboard.chatPage.good', 'Good')}</span>
                            </button>
                            <button onClick={() => { onFeedback('down'); onClose(); }}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl active:scale-95 transition-all ${feedback === 'down' ? 'bg-red-500/10' : 'hover:bg-white/5'}`}>
                                <ThumbsDown size={18} className={feedback === 'down' ? 'text-red-400' : 'text-surface-200/70'} />
                                <span className="text-[10px] text-surface-200/50">{t('dashboard.chatPage.bad', 'Bad')}</span>
                            </button>
                        </>
                    )}
                    {onPin && (
                        <button onClick={() => { onPin(); onClose(); }}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl active:scale-95 transition-all ${isPinned ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}>
                            {isPinned ? <PinOff size={18} className="text-amber-400" /> : <Pin size={18} className="text-surface-200/70" />}
                            <span className="text-[10px] text-surface-200/50">{isPinned ? t('dashboard.chatPage.unpin', 'Unpin') : t('dashboard.chatPage.pin', 'Pin')}</span>
                        </button>
                    )}
                    {isUser && onEdit && (
                        <button onClick={() => { onEdit(); onClose(); }}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 active:scale-95 transition-all">
                            <Edit size={18} className="text-brand-400" />
                            <span className="text-[10px] text-surface-200/50">{t('dashboard.chatPage.edit', 'Edit')}</span>
                        </button>
                    )}
                    {isUser && onSave && (
                        <button onClick={() => { onSave(message.content); onClose(); }}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 active:scale-95 transition-all">
                            <Star size={18} className="text-amber-400" />
                            <span className="text-[10px] text-surface-200/50">{t('dashboard.chatPage.save', 'Save')}</span>
                        </button>
                    )}
                    {isError && onRetry && (
                        <button onClick={() => { onRetry(); onClose(); }}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 active:scale-95 transition-all">
                            <RefreshCw size={18} className="text-amber-400" />
                            <span className="text-[10px] text-surface-200/50">{t('dashboard.chatPage.retryAction', 'Retry')}</span>
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

/* ─── Single message bubble (mobile-friendly: tap to show actions) ─── */
function ChatBubble({ message, onRetry, onPin, isPinned, onFeedback, feedback, onEdit, onSave, isMobile }) {
    const [copied, setCopied] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [showSheet, setShowSheet] = useState(false);
    const longPressTimer = useRef(null);
    const isUser = message.role === 'user';
    const isError = !isUser && message.content?.startsWith('\u274c');
    const copyText = () => {
        navigator.clipboard.writeText(message.content || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Long-press handlers for mobile
    const handleTouchStart = () => {
        if (!isMobile) return;
        longPressTimer.current = setTimeout(() => {
            setShowSheet(true);
            hapticImpact('medium');
        }, 500);
    };
    const handleTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
    // Tap toggle for mobile (fallback)
    const handleTap = () => {
        if (isMobile) setShowActions(prev => !prev);
    };
    const { user } = useAuthStore();

    return (
        <>
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fadeIn group ${isPinned ? 'ring-1 ring-amber-500/20 rounded-2xl p-1' : ''}`}>
            {isUser ? (
                user?.photo_url ? (
                    <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-brand-500/30 flex-shrink-0" />
                ) : (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-500/20 ring-1 ring-brand-500/30`}>
                        <User size={14} className="text-brand-400" />
                    </div>
                )
            ) : (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ring-1 ring-emerald-500/30 overflow-hidden bg-surface-800`}>
                    <img src="/xbot-logo.png" alt="XBot" className="w-full h-full object-cover" />
                </div>
            )}
            <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 relative ${isUser
                    ? 'bg-brand-500/15 border border-brand-500/20'
                    : 'bg-surface-800/60 border border-white/5'
                }`}
                onClick={handleTap}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            >
                {isUser ? (
                    <>
                        {message.image && <img src={message.image} alt="" className="max-h-32 rounded-lg mb-2 border border-white/10" />}
                        <p className="text-sm text-surface-100 whitespace-pre-wrap">{message.content}</p>
                    </>
                ) : (
                    <div
                        className="text-sm text-surface-200/90 chat-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                    />
                )}
                {message.ts && (
                    <span className="block text-[9px] text-surface-200/20 mt-1.5 text-right">
                        {new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
                {/* Action buttons — desktop: hover, mobile: tap toggle */}
                <div className={`absolute -bottom-3 ${isUser ? 'left-2' : 'right-2'} flex gap-1 transition-opacity duration-150
                    ${isMobile ? (showActions ? 'opacity-100' : 'opacity-0 pointer-events-none') : 'opacity-0 group-hover:opacity-100'}`}>
                    {!isUser && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); copyText(); }} className="p-1.5 rounded-md bg-surface-800 border border-white/10 text-surface-200/50 hover:text-surface-100 transition-colors" title="Copy">
                                {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                            </button>
                            {onFeedback && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); onFeedback('up'); }}
                                        className={`p-1.5 rounded-md bg-surface-800 border border-white/10 transition-colors ${feedback === 'up' ? 'text-emerald-400' : 'text-surface-200/50 hover:text-emerald-400'}`} title="Good">
                                        <ThumbsUp size={10} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onFeedback('down'); }}
                                        className={`p-1.5 rounded-md bg-surface-800 border border-white/10 transition-colors ${feedback === 'down' ? 'text-red-400' : 'text-surface-200/50 hover:text-red-400'}`} title="Bad">
                                        <ThumbsDown size={10} />
                                    </button>
                                </>
                            )}
                        </>
                    )}
                    {isUser && onEdit && (
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-md bg-surface-800 border border-white/10 text-surface-200/50 hover:text-brand-400 transition-colors" title="Edit">
                            <Edit size={10} />
                        </button>
                    )}
                    {isUser && onSave && (
                        <button onClick={(e) => { e.stopPropagation(); onSave(message.content); }} className="p-1.5 rounded-md bg-surface-800 border border-white/10 text-surface-200/50 hover:text-amber-400 transition-colors" title="Save prompt">
                            <Star size={10} />
                        </button>
                    )}
                    {onPin && (
                        <button onClick={(e) => { e.stopPropagation(); onPin(); }} className={`p-1.5 rounded-md bg-surface-800 border border-white/10 transition-colors ${isPinned ? 'text-amber-400' : 'text-surface-200/50 hover:text-amber-400'}`} title={isPinned ? 'Unpin' : 'Pin'}>
                            {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
                        </button>
                    )}
                    {isError && onRetry && (
                        <button onClick={(e) => { e.stopPropagation(); onRetry(); }} className="p-1.5 rounded-md bg-surface-800 border border-white/10 text-amber-400/60 hover:text-amber-400 transition-colors" title="Retry">
                            <RefreshCw size={10} />
                        </button>
                    )}
                </div>
            </div>
        </div>
        {/* Mobile long-press bottom sheet */}
        <MessageActionSheet
            visible={showSheet}
            onClose={() => setShowSheet(false)}
            message={message}
            onCopy={!isUser ? copyText : undefined}
            onFeedback={!isUser ? onFeedback : undefined}
            feedback={feedback}
            onPin={onPin}
            isPinned={isPinned}
            onEdit={isUser ? onEdit : undefined}
            onSave={isUser ? onSave : undefined}
            onRetry={isError ? onRetry : undefined}
        />
        </>
    );
}

/* ─── Conversation list item with preview & relative time ─── */
function ConvItem({ conv, active, onLoad, onDelete, onRename, onPin, onShare, isMobile }) {
    const { t } = useTranslation();
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(conv.title || '');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const submitRename = () => {
        if (editTitle.trim() !== '' && editTitle !== conv.title) {
            onRename?.(conv, editTitle.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') submitRename();
        if (e.key === 'Escape') {
            setIsEditing(false);
            setEditTitle(conv.title || '');
        }
    };

    // Relative time helper
    const relTime = (ts) => {
        if (!ts) return '';
        const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
        const now = Date.now();
        const diff = now - d.getTime();
        if (diff < 60000) return 'now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return (
        <div className={`relative rounded-xl transition-colors group
            ${active ? 'bg-brand-500/10 border border-brand-500/20' : 'hover:bg-white/3 border border-transparent'}`}>
            <button
                onClick={() => !isEditing && onLoad(conv.conversationId)}
                className="w-full text-left pl-3 pr-8 py-2.5 flex items-start gap-2.5"
            >
                {conv.isPinned ? (
                    <Pin size={12} className={`flex-shrink-0 mt-0.5 ${active ? 'text-brand-400' : 'text-amber-400/80'}`} />
                ) : (
                    <MessageSquare size={12} className={`flex-shrink-0 mt-0.5 ${active ? 'text-brand-400' : 'text-surface-200/30'}`} />
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={submitRename}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-surface-900 border border-white/20 rounded px-1.5 py-0.5 text-xs text-brand-400 focus:outline-none focus:border-brand-500/50"
                            />
                        ) : (
                            <span className={`text-xs truncate flex-1 ${active ? 'text-brand-400 font-medium' : 'text-surface-200/60'}`}>
                                {conv.title || t('dashboard.chatPage.newChat', 'New Chat')}
                            </span>
                        )}
                        <span className="text-[9px] text-surface-200/20 flex-shrink-0">
                            {relTime(conv.updatedAt || conv.createdAt)}
                        </span>
                    </div>
                    {conv.lastMessage && (
                        <p className="text-[10px] text-surface-200/25 truncate mt-0.5">{conv.lastMessage.substring(0, 60)}</p>
                    )}
                </div>
            </button>
            {/* Context Menu ⋮ */}
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    className={`p-1 rounded-md transition-all
                        ${showMenu ? 'bg-white/10 text-surface-100' : 'text-surface-200/25 hover:text-surface-100 hover:bg-white/5 opacity-0 group-hover:opacity-100'}
                        ${active ? 'opacity-100 text-brand-400' : ''}`}
                    title={t('dashboard.chatPage.options', 'Options')}>
                    <MoreVertical size={14} />
                </button>
                {showMenu && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                        <div className="absolute top-8 right-0 w-44 bg-surface-800 border border-white/10 rounded-xl shadow-2xl z-50 py-1 overflow-hidden"
                             onClick={(e) => e.stopPropagation()}>
                            <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onShare?.(conv); }} className="flex items-center w-full px-3 py-2 text-[11px] text-surface-200/50 hover:bg-white/5 gap-2">
                                <Share2 size={12}/> {t('dashboard.chatPage.shareChat', 'Chia sẻ cuộc trò chuyện')}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onPin?.(conv); }} className="flex items-center w-full px-3 py-2 text-[11px] text-surface-200/50 hover:bg-white/5 gap-2">
                                {conv.isPinned ? <PinOff size={12}/> : <Pin size={12}/>} {conv.isPinned ? t('dashboard.chatPage.unpinChat', 'Bỏ ghim') : t('dashboard.chatPage.pinChat', 'Ghim')}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); setIsEditing(true); }} className="flex items-center w-full px-3 py-2 text-[11px] text-surface-200/50 hover:bg-white/5 gap-2">
                                <Edit size={12}/> {t('dashboard.chatPage.renameChat', 'Đổi tên')}
                            </button>
                            <div className="h-px bg-white/5 my-1" />
                            <button onClick={(e) => { onDelete(conv.conversationId, e); setShowMenu(false); }}
                                className="flex items-center w-full px-3 py-2 text-[11px] text-red-400 hover:bg-red-500/10 gap-2">
                                <Trash2 size={12}/> {t('dashboard.chatPage.deleteChat', 'Xoá')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ─── Smart paste detection banner ─── */
function PasteDetectionBanner({ type, onAction, onDismiss }) {
    const { t } = useTranslation();
    if (!type) return null;
    const actions = type === 'tx'
        ? [{ label: '🔍 Check TX', action: 'tx' }]
        : [
            { label: '🔬 Analyze', action: 'analyze' },
            { label: '📋 Lookup', action: 'lookup' },
            { label: '🛡️ Security', action: 'security' },
        ];
    return (
        <div className="absolute bottom-full mb-1 left-0 right-0 z-10 bg-surface-800/95 backdrop-blur-xl border border-brand-500/20
            rounded-xl shadow-xl p-2.5 animate-fadeIn">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-brand-400 font-semibold">
                    ✨ {type === 'tx' ? t('dashboard.chatPage.txDetected', 'Transaction hash detected') : t('dashboard.chatPage.addrDetected', 'Address detected')}
                </span>
                <button onClick={onDismiss} className="ml-auto p-0.5 text-surface-200/30 hover:text-surface-200/60">
                    <X size={10} />
                </button>
            </div>
            <div className="flex gap-1.5">
                {actions.map(a => (
                    <button key={a.action} onClick={() => onAction(a.action)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-brand-500/10 text-brand-400
                            border border-brand-500/15 hover:bg-brand-500/20 transition-all active:scale-95 flex-1">
                        {a.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ─── Loading skeleton for conversation switch ─── */
function ChatSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
                <div key={i} className={`flex gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-surface-800/60 flex-shrink-0" />
                    <div className={`rounded-2xl px-4 py-3 ${i % 2 === 0 ? 'bg-brand-500/10 w-48' : 'bg-surface-800/40 w-64'}`}>
                        <div className="h-3 bg-surface-700/50 rounded w-full mb-2" />
                        <div className="h-3 bg-surface-700/50 rounded w-3/4" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─── Tool call shimmer skeleton ─── */
function ToolCallSkeleton({ name }) {
    const meta = getToolMeta(name);
    const Icon = meta.icon;
    return (
        <div className="rounded-xl border border-white/5 bg-surface-800/20 px-3 py-2.5 flex items-center gap-2.5 animate-pulse">
            <div className={`w-6 h-6 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={12} className={meta.color} />
            </div>
            <div className="flex-1 min-w-0">
                <span className="text-xs font-mono font-medium text-surface-200/50">{name?.replace(/_/g, ' ')}</span>
                <div className="mt-1 h-2 bg-surface-700/40 rounded w-24 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{ animation: 'shimmer 1.5s infinite' }} />
                </div>
            </div>
            <Loader2 size={12} className="text-surface-200/30 animate-spin flex-shrink-0" />
        </div>
    );
}

/* ─── Slash Command Palette ─── */
const SLASH_COMMANDS = [
    { cmd: '/swap', icon: '💱', label: 'Swap tokens', template: 'Swap 0.01 OKB to USDT' },
    { cmd: '/balance', icon: '💰', label: 'Check wallet balance', template: 'Check my wallet balance' },
    { cmd: '/price', icon: '📈', label: 'Token price', template: 'What is the price of OKB?' },
    { cmd: '/analyze', icon: '🔬', label: 'Analyze token', template: 'Analyze token OKB' },
    { cmd: '/signals', icon: '📡', label: 'Whale/KOL signals', template: 'Show whale buy signals' },
    { cmd: '/trending', icon: '🔥', label: 'Top trending tokens', template: 'Show top trending tokens' },
    { cmd: '/gas', icon: '⛽', label: 'Gas prices', template: 'What are current gas prices?' },
    { cmd: '/portfolio', icon: '📊', label: 'Portfolio overview', template: 'Show my portfolio' },
    { cmd: '/alert', icon: '🔔', label: 'Set price alert', template: 'Alert me when ETH goes above $4000' },
    { cmd: '/transfer', icon: '📤', label: 'Transfer tokens', template: 'Transfer 10 USDT to ' },
    { cmd: '/wallet', icon: '🔑', label: 'Create wallet', template: 'Create a new wallet' },
    { cmd: '/compare', icon: '⚖️', label: 'Compare tokens', template: 'Compare OKB vs BNB vs ETH' },
    { cmd: '/research', icon: '🧠', label: 'Deep research', template: 'Deep research ETH' },
    { cmd: '/copy-trade', icon: '👥', label: 'Copy trading', template: 'Show copy trading leaderboard' },
    { cmd: '/auto-trade', icon: '🤖', label: 'AI Auto Trading', template: 'Auto trading status' },
    { cmd: '/security', icon: '🛡️', label: 'Token security', template: 'Check token security for ' },
];

function SlashCommandPalette({ input, onSelect, isMobile }) {
    const match = input.match(/^\/([\w-]*)$/);
    if (!match) return null;
    const query = match[1].toLowerCase();
    const filtered = SLASH_COMMANDS.filter(c =>
        c.cmd.toLowerCase().includes(query) || c.label.toLowerCase().includes(query)
    ).slice(0, isMobile ? 6 : 10);
    if (filtered.length === 0) return null;

    return (
        <div className={`absolute bottom-full mb-1 left-0 right-0 z-20
            bg-surface-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/30
            overflow-hidden ${isMobile ? 'max-h-[240px]' : 'max-h-[320px]'} overflow-y-auto custom-scrollbar`}>
            <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                <Zap size={11} className="text-brand-400" />
                <span className="text-[10px] text-surface-200/40 font-semibold uppercase tracking-wider">Commands</span>
            </div>
            {filtered.map(c => (
                <button key={c.cmd}
                    onClick={() => onSelect(c.template)}
                    className={`w-full text-left flex items-center gap-3 px-3 transition-colors group
                        ${isMobile ? 'py-3 active:bg-brand-500/10' : 'py-2 hover:bg-brand-500/10'}`}>
                    <span className="text-base">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-surface-100">{c.cmd}</div>
                        <div className="text-[10px] text-surface-200/40 truncate">{c.label}</div>
                    </div>
                    <ChevronRight size={12} className="text-surface-200/20 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                </button>
            ))}
        </div>
    );
}

/* ─── Typing indicator ─── */
function TypingIndicator() {
    const { t } = useTranslation();
    return (
        <div className="flex gap-3 animate-fadeIn">
            <div className="w-8 h-8 rounded-full ring-1 ring-emerald-500/30 flex items-center justify-center flex-shrink-0 overflow-hidden bg-surface-800">
                <img src="/xbot-logo.png" alt="XBot" className="w-full h-full object-cover" />
            </div>
            <div className="bg-surface-800/60 border border-white/5 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                        <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[10px] text-surface-200/30">{t('dashboard.chatPage.thinking', 'Thinking & executing tools...')}</span>
                </div>
            </div>
        </div>
    );
}

// Token autocomplete data (outside component to avoid re-creation)
const KNOWN_TOKEN_LIST = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'OKB', 'BANMAO', 'PEPE', 'DOGE', 'SHIB', 'ARB', 'OP', 'AVAX', 'MATIC', 'DOT', 'ADA', 'XRP', 'LINK', 'UNI', 'AAVE'];
const FALLBACK_MODELS = [
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Powerful multimodal & agentic', icon: '🚀' },
];

const PERSONA_OPTIONS = [
    { value: 'default', icon: '🔰', label: 'Default', desc: 'Friendly & helpful AI assistant' },
    { value: 'friendly', icon: '😊', label: 'Friendly', desc: 'Cheerful, energetic, lots of emoji' },
    { value: 'formal', icon: '🎩', label: 'Professional', desc: 'Polite, precise, professional' },
    { value: 'anime', icon: '🌸', label: 'Anime', desc: 'Kawaii anime-style character' },
    { value: 'mentor', icon: '📚', label: 'Mentor', desc: 'Patient teacher, step-by-step' },
    { value: 'funny', icon: '🤣', label: 'Comedian', desc: 'Witty jokes & humor' },
    { value: 'crypto', icon: '🪙', label: 'Crypto Expert', desc: 'DeFi, blockchain specialist' },
    { value: 'gamer', icon: '🎮', label: 'Gamer', desc: 'Excited gamer, game slang' },
    { value: 'rebel', icon: '⚡', label: 'Rebel', desc: 'Bold, direct, sassy' },
    { value: 'mafia', icon: '🕶️', label: 'Mafia', desc: 'Calm mafia boss, decisive' },
    { value: 'cute', icon: '🍬', label: 'Cute', desc: 'Sweet, gentle, charming' },
    { value: 'little_girl', icon: '🧒', label: 'Little girl', desc: 'Innocent, adorable, playful' },
    { value: 'little_brother', icon: '👦', label: 'Little brother', desc: 'Cheeky, witty, youthful' },
    { value: 'old_uncle', icon: '🧔‍♂️', label: 'Old uncle', desc: 'Humorous, life experience' },
    { value: 'old_grandma', icon: '👵', label: 'Old grandma', desc: 'Caring, storytelling' },
    { value: 'deity', icon: '✨', label: 'Deity', desc: 'Omniscient, divine calm' },
    { value: 'king', icon: '👑', label: 'King', desc: 'Formal, noble, dignified' },
    { value: 'banana_cat', icon: '🍌', label: 'Banana Cat', desc: 'Cat in banana costume' },
    { value: 'pretty_sister', icon: '💖', label: 'Pretty sister', desc: 'Graceful, elegant' },
    { value: 'seductive_girl', icon: '🔥', label: 'Seductive girl', desc: 'Confident, alluring' },
    { value: 'gentleman', icon: '🤵', label: 'Gentleman', desc: 'Polite, considerate' },
    { value: 'star_xu', icon: '⭐️', label: 'Star Xu', desc: 'OKX founder, visionary' },
    { value: 'niuma', icon: '🐮', label: 'NIUMA', desc: 'Steady, persistent, humble' },
    { value: 'xcat', icon: '🐈️', label: 'XCAT', desc: 'Free-spirited, curious cat' },
    { value: 'xdog', icon: '🐕️', label: 'XDOG', desc: 'Proud, loyal, brave dog' },
    { value: 'xwawa', icon: '🐸', label: 'XWAWA', desc: 'Carefree, cheerful frog' },
    { value: 'banmao', icon: '🐱', label: 'Banmao', desc: 'Mischievous cat in banana suit' },
    { value: 'mia', icon: '🍚', label: 'Mia', desc: 'Tiny grain of rice, big confidence' },
    { value: 'jiajia', icon: '💎', label: '佳佳 OKX', desc: 'Cute but sharp-minded mascot' },
    { value: 'xwizard', icon: '🧙', label: 'Xwizard', desc: 'Magical wizard, mysterious' },
];

// U4: Persona preview sample responses
const PERSONA_PREVIEWS = {
    default: 'I can help you with that! Let me look into it...',
    friendly: 'OMG yes!! 🎉 Let me help you right away! This is going to be so fun!! 💖✨',
    formal: 'Certainly. I shall address your inquiry with due diligence and precision.',
    anime: 'Sugoi~! ✧(◕‿◕✿) Let me help you, senpai! This is going to be kawaii~',
    mentor: 'Great question! Let\'s break this down step by step. First, consider...',
    funny: 'Well, well, well... if it isn\'t another coding puzzle! *cracks knuckles* 😄',
    crypto: 'WAGMI fren! 🚀 Let me check the charts... looking bullish NGL 💎🙌',
    gamer: 'GG! Let\'s speedrun this quest! 🎮 Achievement unlocked: asking for help! 🏆',
    rebel: 'Pfft, the conventional approach? Nah. Let me show you the REAL way.',
    mafia: 'I\'ll make you an offer you can\'t refuse. This solution... is elegant.',
    cute: 'Aww~ of course I\'ll help! 🌸 Let me find the sweetest solution for you~',
    little_girl: 'Ooh ooh! I know this one! *jumps excitedly* Why does it work like that?? 🎀',
    little_brother: 'Hehe, you need MY help? Fine fine, I\'ll show you... this time 😏',
    old_uncle: 'Ah, back in my day we did it differently! *sips tea* Let me tell you...',
    old_grandma: 'Oh sweetie, come here, let grandma help you. Have you eaten yet? 🍲',
    deity: 'Mortal, I perceive the nature of your query. The cosmic truth reveals...',
    king: 'By royal decree, I shall bestow upon you the wisdom of the crown. 👑',
    banana_cat: 'Meow~ 🍌🐱 *knocks your question off the table* Wait, let me actually help... meow~',
    pretty_sister: 'Ara ara~ Let your big sister handle this elegantly for you 💅✨',
    seductive_girl: 'Oh? You need help? *leans in* Let me show you something... incredible 🔥',
    gentleman: 'It would be my pleasure to assist you. Allow me, if you will...',
};

const PROVIDER_OPTIONS = [
    { value: 'google', label: 'Google (Gemini)', icon: '✨', desc: 'Multimodal, best for complex tasks' },
    { value: 'openai', label: 'OpenAI (GPT)', icon: '🧠', desc: 'Strong reasoning & code' },
    { value: 'groq', label: 'Groq (LLaMA)', icon: '⚡', desc: 'Ultra-fast inference' },
];

const THINKING_OPTIONS = [
    { value: 'none', label: 'None', icon: '💤', desc: 'Fastest, no extra reasoning' },
    { value: 'low', label: 'Low', icon: '💡', desc: 'Light reasoning' },
    { value: 'medium', label: 'Medium', icon: '🔥', desc: 'Balanced speed & quality' },
    { value: 'high', label: 'High', icon: '🚀', desc: 'Deep reasoning, slower' },
];

// Per-provider reasoning support config
const REASONING_BY_PROVIDER = {
    google: { supported: true, levels: ['none', 'low', 'medium', 'high'] },
    openai: {
        supported: true,
        byModel: {
            'gpt-5.4': ['none', 'low', 'medium', 'high'],
            'gpt-5-mini': ['medium'],
            'gpt-4o': [],
            'gpt-4o-mini': [],
        },
        defaultLevels: [],
    },
    groq: { supported: false, levels: [] },
};

const SETTINGS_TABS = [
    { id: 'model', icon: '🎯', labelKey: 'model' },
    { id: 'persona', icon: '🎭', labelKey: 'persona' },
    { id: 'keys', icon: '🔑', labelKey: 'apiKeys' },
];

// Model options per provider (fallback when backend doesn't return provider-specific models)
const MODEL_OPTIONS_BY_PROVIDER = {
    google: [
        { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'Best reasoning & complex tasks', icon: '🟠' },
        { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Powerful multimodal & agentic', icon: '🚀' },
        { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Lite', desc: 'Fastest, lowest cost', icon: '⚡' },
    ],
    openai: [
        { id: 'gpt-5.4', label: 'GPT-5.4', desc: 'Flagship, best intelligence', icon: '🧠' },
        { id: 'gpt-5-mini', label: 'GPT-5 Mini', desc: 'Fast & affordable', icon: '⚡' },
        { id: 'gpt-4o', label: 'GPT-4o', desc: 'Reliable multimodal', icon: '🌟' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Budget-friendly', icon: '💡' },
    ],
    groq: [
        { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', desc: 'OpenAI flagship, reasoning', icon: '🧠' },
        { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', desc: 'Fastest, 1000 t/s', icon: '🚀' },
        { id: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B', desc: 'Best quality, versatile', icon: '🦙' },
        { id: 'llama-3.1-8b-instant', label: 'LLaMA 3.1 8B', desc: 'Ultra-fast, 560 t/s', icon: '⚡' },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'LLaMA 4 Scout', desc: 'Vision-capable', icon: '🔭' },
    ],
};

/* ─── Main ChatPage ─── */
export default function ChatPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const outletContext = useOutletContext();
    const setGlobalSidebarOpen = outletContext?.setGlobalSidebarOpen;
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(() => {
        try { return sessionStorage.getItem('chat_active_conv') || null; } catch { return null; }
    });
    const [conversations, setConversations] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showScroll, setShowScroll] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [expandedGuide, setExpandedGuide] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [pinnedMessages, setPinnedMessages] = useState([]);
    const [followUpSuggestions, setFollowUpSuggestions] = useState([]);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [autocompleteResults, setAutocompleteResults] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [messageFeedback, setMessageFeedback] = useState({});
    const [selectedModel, setSelectedModel] = useState(() => {
        try { return localStorage.getItem('xbot_ai_model') || 'gemini-3-flash-preview'; } catch { return 'gemini-3-flash-preview'; }
    });
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [modelOptions, setModelOptions] = useState(FALLBACK_MODELS);
    const [modelMeta, setModelMeta] = useState({ hasPersonalKey: false, hasServerKey: false, isOwner: false });
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [userApiKeys, setUserApiKeys] = useState([]);
    // AI Settings panel state
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showAiTrader, setShowAiTrader] = useState(false);
    const [settingsTab, setSettingsTab] = useState('model');
    const [selectedPersona, setSelectedPersona] = useState(() => {
        try { return localStorage.getItem('xbot_ai_persona') || 'default'; } catch { return 'default'; }
    });
    const [selectedProvider, setSelectedProvider] = useState(() => {
        try { return localStorage.getItem('xbot_ai_provider') || 'google'; } catch { return 'google'; }
    });
    const [selectedThinking, setSelectedThinking] = useState(() => {
        try { return localStorage.getItem('xbot_ai_thinking') || 'medium'; } catch { return 'medium'; }
    });
    const [apiKeyProvider, setApiKeyProvider] = useState('google');

    // Persist AI settings to localStorage
    useEffect(() => { try { localStorage.setItem('xbot_ai_model', selectedModel); } catch {} }, [selectedModel]);
    useEffect(() => { try { localStorage.setItem('xbot_ai_provider', selectedProvider); } catch {} }, [selectedProvider]);
    useEffect(() => { try { localStorage.setItem('xbot_ai_persona', selectedPersona); } catch {} }, [selectedPersona]);
    useEffect(() => { try { localStorage.setItem('xbot_ai_thinking', selectedThinking); } catch {} }, [selectedThinking]);

    // #18 Saved Prompts
    const [savedPrompts, setSavedPrompts] = useState(() => {
        try { return JSON.parse(localStorage.getItem('chat_saved_prompts') || '[]'); } catch { return []; }
    });
    const savePrompt = (text) => {
        const updated = [{ text, ts: Date.now() }, ...savedPrompts.filter(p => p.text !== text)].slice(0, 20);
        setSavedPrompts(updated);
        localStorage.setItem('chat_saved_prompts', JSON.stringify(updated));
    };
    const removePrompt = (ts) => {
        const updated = savedPrompts.filter(p => p.ts !== ts);
        setSavedPrompts(updated);
        localStorage.setItem('chat_saved_prompts', JSON.stringify(updated));
    };
    const [apiKeyLoading, setApiKeyLoading] = useState(false);
    const [apiKeyError, setApiKeyError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [compareMode, setCompareMode] = useState(false);
    const [loadingConv, setLoadingConv] = useState(false);
    const [inputShake, setInputShake] = useState(false);
    const [shareModal, setShareModal] = useState(null); // { url, title, loading }
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    // ── AI Memory panel state ──
    const [showMemoryPanel, setShowMemoryPanel] = useState(false);
    const [memPrefs, setMemPrefs] = useState({});
    const [memLoading, setMemLoading] = useState(false);
    const [memNewKey, setMemNewKey] = useState('');
    const [memNewValue, setMemNewValue] = useState('');
    const [memSaving, setMemSaving] = useState(false);
    // U3: Model usage tracking
    const [modelUsageStats, setModelUsageStats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('xbot_model_usage') || '{}'); } catch { return {}; }
    });
    // U5: Custom persona
    const [customPersonaInput, setCustomPersonaInput] = useState(() => {
        try { return localStorage.getItem('xbot_custom_persona') || ''; } catch { return ''; }
    });
    // U7: Token counter
    const [sessionTokens, setSessionTokens] = useState({ sent: 0, received: 0 });
    // U4: Persona preview
    const [previewPersona, setPreviewPersona] = useState(null);
    const recognitionRef = useRef(null);
    const imageInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);

    // ── Responsive: detect mobile ──
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── AI Memory: load/save/delete ──
    const MEMORY_SUGGESTED_KEYS = [
        { key: 'nickname', desc: 'What AI calls you' },
        { key: 'language', desc: 'Preferred language' },
        { key: 'trading_style', desc: 'Cautious/Aggressive' },
        { key: 'favorite_chain', desc: 'Preferred chain' },
        { key: 'risk_tolerance', desc: 'Low/Medium/High' },
        { key: 'timezone', desc: 'Your timezone' },
    ];
    const loadMemory = useCallback(async () => {
        setMemLoading(true);
        try {
            const data = await api.request('/user/preferences');
            setMemPrefs(data?.preferences || {});
        } catch (err) { console.error('Failed to load memory:', err); }
        finally { setMemLoading(false); }
    }, []);
    const saveMemoryItem = async () => {
        if (!memNewKey.trim() || !memNewValue.trim()) return;
        setMemSaving(true);
        try {
            await api.request('/user/preferences', {
                method: 'POST',
                body: JSON.stringify({ key: memNewKey.trim(), value: memNewValue.trim() }),
            });
            setMemNewKey(''); setMemNewValue('');
            await loadMemory();
        } catch (err) { console.error('Failed to save memory:', err); }
        finally { setMemSaving(false); }
    };
    const deleteMemoryItem = async (key) => {
        try {
            await api.request(`/user/preferences/${encodeURIComponent(key)}`, { method: 'DELETE' });
            await loadMemory();
        } catch (err) { console.error('Failed to delete memory:', err); }
    };
    // Auto-load memory when panel opens
    useEffect(() => { if (showMemoryPanel) loadMemory(); }, [showMemoryPanel, loadMemory]);

    // ── Load available models from backend ──
    const loadModels = useCallback(async () => {
        try {
            const viewMode = useAuthStore.getState().viewMode;
            const data = await api.request(`/ai/models?viewMode=${viewMode || ''}`);
            if (data?.models?.length) {
                setModelOptions(data.models);
                setModelMeta({
                    hasPersonalKey: data.hasPersonalKey,
                    hasServerKey: data.hasServerKey,
                    isOwner: data.isOwner,
                    hasOpenAiKey: data.hasOpenAiKey,
                    hasServerOpenAiKey: data.hasServerOpenAiKey,
                    hasGroqKey: data.hasGroqKey,
                    hasServerGroqKey: data.hasServerGroqKey,
                    defaultModel: data.defaultModel,
                });
                // Only reset model if the current model doesn't exist in ANY provider's model list
                const savedModel = localStorage.getItem('xbot_ai_model');
                const savedProvider = localStorage.getItem('xbot_ai_provider') || 'google';
                const allKnownModels = Object.values(MODEL_OPTIONS_BY_PROVIDER).flat().map(m => m.id);
                const currentModel = savedModel || selectedModel;
                if (data.defaultModel && !allKnownModels.includes(currentModel) && !data.models.find(m => m.id === currentModel)) {
                    setSelectedModel(data.defaultModel);
                }
            }
        } catch { /* fallback to FALLBACK_MODELS */ }
    }, []);
    useEffect(() => { loadModels(); }, [loadModels]);

    // ── Load user AI preferences ──
    useEffect(() => {
        api.getProfile().then(data => {
            const p = data?.preferences || {};
            if (p.persona) setSelectedPersona(p.persona);
            if (p.provider) setSelectedProvider(p.provider);
            if (p.thinkingLevel) setSelectedThinking(p.thinkingLevel);
            if (p.model) setSelectedModel(p.model);
        }).catch(() => {});
    }, []);

    // B4 fix: use refs to prevent stale closure in saveAiPrefs
    const personaRef = useRef(selectedPersona);
    const providerRef = useRef(selectedProvider);
    const thinkingRef = useRef(selectedThinking);
    useEffect(() => { personaRef.current = selectedPersona; }, [selectedPersona]);
    useEffect(() => { providerRef.current = selectedProvider; }, [selectedProvider]);
    useEffect(() => { thinkingRef.current = selectedThinking; }, [selectedThinking]);

    const saveAiPrefs = useCallback(async (updates) => {
        const newPrefs = { persona: personaRef.current, provider: providerRef.current, thinkingLevel: thinkingRef.current, ...updates };
        try { await api.updatePreferences(newPrefs); } catch {}
    }, []);

    // U3: Track model usage
    const trackModelUsage = useCallback((modelId) => {
        setModelUsageStats(prev => {
            const updated = { ...prev, [modelId]: (prev[modelId] || 0) + 1 };
            try { localStorage.setItem('xbot_model_usage', JSON.stringify(updated)); } catch {}
            return updated;
        });
    }, []);

    // ── API key management — stored locally on device only ──
    const LOCAL_KEYS_STORAGE = 'xbot_ai_api_keys';
    const loadApiKeys = useCallback(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(LOCAL_KEYS_STORAGE) || '[]');
            setUserApiKeys(stored);
        } catch { setUserApiKeys([]); }
    }, []);
    useEffect(() => { loadApiKeys(); }, [loadApiKeys]);

    const addApiKey = useCallback(async () => {
        if (!apiKeyInput.trim()) return;
        setApiKeyLoading(true);
        setApiKeyError('');
        const key = apiKeyInput.trim();
        const prov = apiKeyProvider;
        // Client-side format validation
        if (prov === 'google' && !key.startsWith('AIza') && key.length < 30) {
            setApiKeyError('Google key should start with AIzaSy...'); setApiKeyLoading(false); return;
        }
        if (prov === 'openai' && !key.startsWith('sk-') && key.length < 20) {
            setApiKeyError('OpenAI key should start with sk-...'); setApiKeyLoading(false); return;
        }
        try {
            const existing = JSON.parse(localStorage.getItem(LOCAL_KEYS_STORAGE) || '[]');
            // Prevent duplicates
            if (existing.some(k => k.apiKey === key)) {
                setApiKeyError('Key already added'); setApiKeyLoading(false); return;
            }
            const newKey = {
                id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                provider: prov,
                apiKey: key,
                maskedKey: `${key.slice(0, 6)}...${key.slice(-4)}`,
                addedAt: Date.now(),
            };
            const updated = [...existing, newKey];
            localStorage.setItem(LOCAL_KEYS_STORAGE, JSON.stringify(updated));
            setApiKeyInput('');
            loadApiKeys();
            hapticNotification('success');
        } catch (err) {
            setApiKeyError(err.message || 'Failed to save key');
            hapticNotification('error');
        } finally { setApiKeyLoading(false); }
    }, [apiKeyInput, apiKeyProvider, loadApiKeys]);

    const deleteApiKey = useCallback((keyId) => {
        try {
            const existing = JSON.parse(localStorage.getItem(LOCAL_KEYS_STORAGE) || '[]');
            const updated = existing.filter(k => k.id !== keyId);
            localStorage.setItem(LOCAL_KEYS_STORAGE, JSON.stringify(updated));
            loadApiKeys();
            hapticNotification('success');
        } catch { hapticNotification('error'); }
    }, [loadApiKeys]);

    // ── Unified helper: can user change model/thinking for a provider? ──
    // Combines backend DB key flags + local localStorage keys
    const canChangeForProvider = useCallback((provider) => {
        if (modelMeta.isOwner) return true;
        // Check local keys (stored in localStorage)
        const hasLocalKey = userApiKeys.some(k => {
            const p = (k.provider || '').toLowerCase();
            if (provider === 'google') return ['google', 'gemini'].includes(p);
            return p === provider;
        });
        if (hasLocalKey) return true;
        // Check backend DB keys
        if (provider === 'google') return modelMeta.hasPersonalKey;
        if (provider === 'openai') return modelMeta.hasOpenAiKey;
        if (provider === 'groq') return modelMeta.hasGroqKey;
        return false;
    }, [modelMeta, userApiKeys]);

    useEffect(() => { inputRef.current?.focus(); }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); startNewChat(); }
            if (e.key === 'Escape' && showHelp) setShowHelp(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showHelp]);

    // Scroll detection
    useEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
            setShowScroll(dist > 200);
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const loadConversations = useCallback(async () => {
        try {
            const data = await api.getChatHistory();
            setConversations(data.conversations || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadConversations(); }, [loadConversations]);

    // ── Persist conversationId to sessionStorage ──
    useEffect(() => {
        try {
            if (conversationId) sessionStorage.setItem('chat_active_conv', conversationId);
            else sessionStorage.removeItem('chat_active_conv');
        } catch {}
    }, [conversationId]);

    const loadConversation = async (convId) => {
        setLoadingConv(true);
        try {
            const data = await api.getChatMessages(convId);
            setMessages(data.messages || []);
            setConversationId(convId);
            setSidebarOpen(false);
            setPinnedMessages([]);
            setFollowUpSuggestions([]);
        } catch { /* ignore */ } finally {
            setLoadingConv(false);
        }
    };

    // ── Auto-load last conversation on mount (restore after tab switch / deep link) ──
    useEffect(() => {
        // Deep link: /chat?conv=xxx
        const params = new URLSearchParams(window.location.search);
        const deepConv = params.get('conv');
        if (deepConv) {
            loadConversation(deepConv);
            // Clean URL
            window.history.replaceState({}, '', '/chat');
        } else if (conversationId && messages.length === 0 && !loading) {
            loadConversation(conversationId);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startNewChat = () => {
        abortRef.current?.abort();
        setMessages([]);
        setConversationId(null);
        try { sessionStorage.removeItem('chat_active_conv'); } catch {}
        setSidebarOpen(false);
        setPinnedMessages([]);
        setFollowUpSuggestions([]);
        setLoading(false);
        setIsListening(false);
        setImagePreview(null);
        recognitionRef.current?.stop();
        inputRef.current?.focus();
    };

    const deleteConversation = async (convId, e) => {
        e.stopPropagation();
        try {
            await api.clearChat(convId);
            if (convId === conversationId) startNewChat();
            loadConversations();
        } catch { /* ignore */ }
    };

    const handleRename = async (conv, newTitle) => {
        if (newTitle && newTitle.trim() !== '') {
            try {
                await api.renameConversation(conv.conversationId, newTitle.trim());
                loadConversations();
            } catch (err) {
                console.error('Failed to rename conversation:', err);
            }
        }
    };

    const handleShare = async (conv) => {
        setShareModal({ url: null, title: conv.title || 'Chat', loading: true });
        try {
            const res = await api.shareConversation(conv.conversationId);
            const shareUrl = `${window.location.origin}/shared/${res.shareId}`;
            setShareModal({ url: shareUrl, title: conv.title || 'Chat', loading: false });
        } catch (err) {
            console.error('Failed to share:', err);
            setShareModal(null);
        }
    };

    const handlePin = async (conv) => {
        try {
            await api.pinConversation(conv.conversationId, !conv.isPinned);
            loadConversations();
        } catch (err) {
            console.error('Failed to pin conversation:', err);
        }
    };

    const sendMessage = async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;

        hapticImpact('light');
        setInput('');
        if (inputRef.current) inputRef.current.style.height = isMobile ? '44px' : '40px';
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const userMsg = { role: 'user', content: msg, ts: Date.now(), image: imagePreview || undefined };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);
        setFollowUpSuggestions([]);
        const currentImage = imagePreview;
        setImagePreview(null);
        // U7: estimate sent tokens (~4 chars per token)
        setSessionTokens(prev => ({ ...prev, sent: prev.sent + Math.ceil(msg.length / 4) }));

        // ── Compare Mode: side-by-side model comparison ──
        if (compareMode) {
            try {
                // Add placeholder
                setMessages(prev => [...prev, { role: 'compare', content: null, ts: Date.now() }]);
                const models = availableModels?.length >= 2
                    ? availableModels
                    : (MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || MODEL_OPTIONS_BY_PROVIDER.google).map(m => m.id);
                const modelA = selectedModel || models[0];
                const modelB = models.find(m => m !== modelA) || models[1] || models[0];
                const result = await api.compareChat(msg, modelA, modelB);
                setMessages(prev => {
                    const copy = [...prev];
                    const lastIdx = copy.length - 1;
                    if (copy[lastIdx]?.role === 'compare') {
                        copy[lastIdx] = { role: 'compare', content: result, ts: Date.now() };
                    }
                    return copy;
                });
                hapticNotification('success');
            } catch (err) {
                hapticNotification('error');
                setMessages(prev => {
                    const copy = [...prev];
                    const lastIdx = copy.length - 1;
                    if (copy[lastIdx]?.role === 'compare') {
                        copy[lastIdx] = { role: 'assistant', content: `❌ Compare failed: ${err.message}`, ts: Date.now() };
                    }
                    return copy;
                });
            } finally {
                setLoading(false);
                inputRef.current?.focus();
            }
            return;
        }

        try {
            let fullText = '';
            const streamToolCalls = [];
            // Add placeholder assistant message for streaming
            const assistantIdx = { current: -1 };
            setMessages(prev => {
                assistantIdx.current = prev.length;
                return [...prev, { role: 'assistant', content: '', toolCalls: [], ts: Date.now() }];
            });

            await api.streamChatMessage(msg, conversationId, {
                signal: controller.signal,
                image: currentImage,
                model: selectedModel,
                persona: selectedPersona,
                // U5: Pass custom persona text
                customPersonaText: selectedPersona === 'custom' ? customPersonaInput : undefined,
                userApiKey: (() => {
                    try {
                        const keys = JSON.parse(localStorage.getItem('xbot_ai_api_keys') || '[]');
                        const providerKey = keys.find(k => k.provider === selectedProvider);
                        return providerKey?.apiKey || undefined;
                    } catch { return undefined; }
                })(),
                onTextDelta: (text) => {
                    fullText += text;
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) copy[assistantIdx.current] = { ...copy[assistantIdx.current], content: fullText };
                        return copy;
                    });
                },
                onToolStart: (data) => {
                    streamToolCalls.push({ name: data.name, args: data.args, result: '...' });
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) copy[assistantIdx.current] = { ...copy[assistantIdx.current], toolCalls: [...streamToolCalls] };
                        return copy;
                    });
                },
                onToolResult: (data) => {
                    const tc = streamToolCalls.find(t => t.name === data.name && t.result === '...');
                    if (tc) tc.result = data.result;
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) copy[assistantIdx.current] = { ...copy[assistantIdx.current], toolCalls: [...streamToolCalls] };
                        return copy;
                    });
                },
                onDone: (data) => {
                    setConversationId(data.conversationId);
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) {
                            copy[assistantIdx.current] = {
                                ...copy[assistantIdx.current],
                                toolCalls: data.toolCalls || streamToolCalls,
                            };
                        }
                        return copy;
                    });
                    setFollowUpSuggestions(buildFollowUps(fullText, data.toolCalls || streamToolCalls));
                    loadConversations();
                    // U3: Track model usage
                    trackModelUsage(selectedModel);
                    // U7: estimate received tokens
                    setSessionTokens(prev => ({ ...prev, received: prev.received + Math.ceil(fullText.length / 4) }));
                },
                onError: (data) => {
                    let rawErr = data.error || 'Stream failed';
                    // Sanitize: strip API keys and detect auth/quota errors
                    rawErr = rawErr.replace(/sk-[a-zA-Z0-9*_-]{10,}/g, 'sk-***').replace(/https?:\/\/[^\s)]+/g, '').trim();
                    const errLower = rawErr.toLowerCase();
                    const isAuth = errLower.includes('401') || errLower.includes('403') || errLower.includes('incorrect api key') || errLower.includes('invalid api key') || errLower.includes('authentication');
                    const isQuota = errLower.includes('429') || errLower.includes('quota') || errLower.includes('rate limit') || errLower.includes('resource_exhausted');
                    
                    let errContent;
                    if (isAuth || isQuota) {
                        const pName = selectedProvider === 'google' ? 'Gemini' : selectedProvider === 'openai' ? 'OpenAI' : selectedProvider === 'groq' ? 'Groq' : 'AI';
                        const pLink = selectedProvider === 'google' ? 'aistudio.google.com/app/apikey' : selectedProvider === 'openai' ? 'platform.openai.com/api-keys' : 'console.groq.com/keys';
                        const errTitle = t('dashboard.chatPage.err_authTitle', `Lỗi kết nối {{pName}}`, { pName });
                        const errReason = isQuota ? t('dashboard.chatPage.err_quotaUser', 'Dạ, tài khoản API của bạn hình như đã dùng hết hạn mức (quota) rồi ạ.') : t('dashboard.chatPage.err_authUser', 'Dạ, khóa API của bạn có vẻ đã hết hạn hoặc không chính xác mất rồi.');
                        errContent = `\u274c **${errTitle}**\n\n${errReason}\n\n${t('dashboard.chatPage.err_openSettingsHint', '💡 Bạn có thể nhấn vào nút **⚙️ Cài đặt AI** bên dưới để kiểm tra và cập nhật lại API key nhé.')} [${t('dashboard.chatPage.err_getKey', 'Lấy key miễn phí')}](https://${pLink})`;
                    } else {
                        errContent = `\u274c ${t('dashboard.chatPage.err_generic', 'Dạ, có chút trục trặc nhỏ:')} ${rawErr.substring(0, 200)}`;
                    }
                    
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) copy[assistantIdx.current] = { ...copy[assistantIdx.current], content: errContent };
                        return copy;
                    });
                },
            });
            hapticNotification('success');
        } catch (err) {
            if (controller.signal.aborted) return;
            hapticNotification('error');
            
            let errMsg = err.message || 'Lỗi kết nối. Vui lòng thử lại sau.';
            const errLower = errMsg.toLowerCase();
            const isRateLimit = errMsg.includes('429') || errLower.includes('quota') || errLower.includes('rate limit') || errLower.includes('resource_exhausted') || errLower.includes('tokens per min');
            const isAuthError = errMsg.includes('401') || errMsg.includes('403') || errLower.includes('invalid api key') || errLower.includes('incorrect api key') || errLower.includes('unauthorized') || errLower.includes('api_key_invalid') || errLower.includes('authentication') || errLower.includes('permission denied');
            
            // Always sanitize raw error — strip API keys and technical URLs
            const sanitized = errMsg.replace(/sk-[a-zA-Z0-9*_-]{10,}/g, 'sk-***').replace(/https?:\/\/[^\s)]+/g, '').trim();

            if (isRateLimit || isAuthError) {
                const hasUserKey = (() => {
                    try {
                        const keys = JSON.parse(localStorage.getItem('xbot_ai_api_keys') || '[]');
                        return !!keys.find(k => k.provider === selectedProvider)?.apiKey;
                    } catch { return false; }
                })();
                
                const pName = selectedProvider === 'google' ? 'Gemini' : selectedProvider === 'openai' ? 'OpenAI' : selectedProvider === 'groq' ? 'Groq' : 'AI';
                const pLink = selectedProvider === 'google' ? 'aistudio.google.com/app/apikey' : selectedProvider === 'openai' ? 'platform.openai.com/api-keys' : 'console.groq.com/keys';

                if (hasUserKey) {
                   const errTitle = t('dashboard.chatPage.err_authTitle', `Lỗi kết nối {{pName}}`, { pName });
                   const errReason = isRateLimit ? t('dashboard.chatPage.err_quotaUser', 'Dạ, tài khoản API của bạn hình như đã dùng hết hạn mức (quota) rồi ạ.') : t('dashboard.chatPage.err_authUser', 'Dạ, khóa API của bạn có vẻ đã hết hạn hoặc không chính xác mất rồi.');
                   errMsg = `\u274c **${errTitle}**\n\n${errReason}\n\n${t('dashboard.chatPage.err_openSettingsHint', '💡 Bạn có thể nhấn vào nút **⚙️ Cài đặt AI** bên dưới để kiểm tra và cập nhật lại API key nhé.')}`;
                } else {
                   errMsg = `\u274c **${t('dashboard.chatPage.err_titleServer', `Máy chủ {{pName}} đang quá tải`, { pName })}**\n\n${t('dashboard.chatPage.err_descServer', 'Dạ, hiện tại lượng truy cập đang vượt quá hạn mức miễn phí của hệ thống XBot.')}\n\n💡 **${t('dashboard.chatPage.err_tipServer', 'Mẹo để không bị gián đoạn:')}**\n${t('dashboard.chatPage.err_tipServerDesc', 'Bạn có thể tự thiết lập API key cá nhân để được xử lý ngay lập tức, tốc độ cao nhất và hoàn toàn miễn phí nhé!')}\n\n**${t('dashboard.chatPage.err_guideServer', 'Hướng dẫn nhanh:')}**\n${t('dashboard.chatPage.err_guideServer1', '1. Lấy key miễn phí tại:')} [${pLink}](https://${pLink})\n${t('dashboard.chatPage.err_guideServer2', '2. Nhấn nút [Cài đặt AI] bên dưới > chuyển sang tab [Khóa API]')}\n${t('dashboard.chatPage.err_guideServer3', '3. Dán key của bạn vào và tận hưởng đường truyền riêng biệt ạ.')}`;
                }
            } else {
                // Safely wrap any remaining error without leaking raw technical details
                errMsg = `\u274c ${t('dashboard.chatPage.err_generic', 'Dạ, có chút trục trặc nhỏ:')} ${sanitized.substring(0, 200)}`;
            }

            // Update the existing streaming placeholder instead of adding a duplicate
            setMessages(prev => {
                const copy = [...prev];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].role === 'assistant' && !copy[lastIdx].content) {
                    copy[lastIdx] = { ...copy[lastIdx], content: errMsg };
                    return copy;
                }
                return [...prev, {
                    role: 'assistant',
                    content: `\u274c ${err.message || 'Failed to get AI response. Please try again.'}`,
                    ts: Date.now()
                }];
            });
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
                inputRef.current?.focus();
            }
        }
    };

    const retryLastMessage = () => {
        // Find last user message and resend
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) return;
        // Remove last error message
        setMessages(prev => {
            const copy = [...prev];
            if (copy.length > 0 && copy[copy.length - 1].content?.startsWith('❌')) copy.pop();
            return copy;
        });
        sendMessage(lastUserMsg.content);
    };

    // ── Command history (↑ to recall) ──
    const commandHistoryRef = useRef([]);
    const historyIndexRef = useRef(-1);
    // Save sent commands
    const pushToHistory = useCallback((cmd) => {
        if (!cmd?.trim()) return;
        const h = commandHistoryRef.current;
        if (h[0] === cmd) return; // dedup
        h.unshift(cmd);
        if (h.length > 30) h.pop();
        historyIndexRef.current = -1;
    }, []);

    const handleKeyDown = (e) => {
        // Arrow up — recall previous commands
        if (e.key === 'ArrowUp' && !e.shiftKey && (!input || historyIndexRef.current >= 0)) {
            const h = commandHistoryRef.current;
            if (h.length === 0) return;
            e.preventDefault();
            const next = Math.min(historyIndexRef.current + 1, h.length - 1);
            historyIndexRef.current = next;
            setInput(h[next]);
            return;
        }
        if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
            e.preventDefault();
            const next = historyIndexRef.current - 1;
            historyIndexRef.current = next;
            setInput(next < 0 ? '' : commandHistoryRef.current[next]);
            return;
        }
        if (e.key === 'Escape') {
            // Dismiss slash palette or paste banner
            if (input.match(/^\/[\w-]*$/)) { setInput(''); return; }
            if (pasteDetected) { setPasteDetected(null); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!input.trim()) {
                setInputShake(true);
                setTimeout(() => setInputShake(false), 500);
                return;
            }
            // Intercept slash commands — select first matching command instead of sending raw text
            const slashMatch = input.match(/^\/[\w-]*$/);
            if (slashMatch) {
                const query = input.slice(1).toLowerCase();
                const match = SLASH_COMMANDS.find(c =>
                    c.cmd.toLowerCase().includes(query) || c.label.toLowerCase().includes(query)
                );
                if (match) {
                    setInput('');
                    sendMessage(match.template);
                    return;
                }
            }
            pushToHistory(input.trim());
            sendMessage();
        }
    };

    // #5 Export conversation as markdown
    const exportConversation = () => {
        if (messages.length === 0) return;
        const lines = messages.map(m => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.content}`).join('\n\n---\n\n');
        const blob = new Blob([`# AI Chat Export\n\n${lines}`], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // #10 Pin/unpin message
    const togglePin = (msgIndex) => {
        setPinnedMessages(prev =>
            prev.includes(msgIndex) ? prev.filter(i => i !== msgIndex) : [...prev, msgIndex]
        );
    };

    // #7 Filtered conversations for search
    const filteredConversations = searchQuery.trim()
        ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
        : conversations;

    // #2 Build context-aware follow-up suggestions from AI response
    const buildFollowUps = (reply, tools) => {
        const suggestions = [];
        const toolNames = (tools || []).map(t => t.name);
        // Extract token names from response for contextual suggestions
        const tokenMatch = reply?.match(/\b([A-Z]{2,10})(?:\/USDT|\s*\$)/) || reply?.match(/\b(OKB|ETH|BTC|SOL|BNB|USDT|PEPE|DOGE|SHIB|ARB|OP|AVAX|MATIC|DOT|ADA|XRP|LINK|UNI|AAVE|BANMAO)\b/i);
        const token = tokenMatch ? tokenMatch[1].toUpperCase() : '';
        const t_ = token ? ` ${token}` : '';

        if (toolNames.includes('get_token_price') || toolNames.includes('get_market_price')) {
            suggestions.push(`💱 Swap${t_}`, `🔔 Set alert for${t_}`, `🔬 Deep analyze${t_}`, `📊 Compare${t_} vs ETH`);
        } else if (toolNames.includes('analyze_token') || toolNames.includes('get_token_info')) {
            suggestions.push(`💱 Swap${t_}`, `⭐ Add${t_} to favorites`, '🐳 Whale signals', `🛡️ Security check${t_}`);
        } else if (toolNames.includes('get_signal_list')) {
            suggestions.push('🔬 Analyze top signal token', '💱 Buy top signal', '📊 Portfolio overview', '🔔 Set alerts');
        } else if (toolNames.includes('swap_tokens') || toolNames.includes('get_swap_quote')) {
            suggestions.push('💼 Check balance', `📈 Price of${t_}`, '📊 Top trending tokens', '🔔 Set take-profit alert');
        } else if (toolNames.includes('get_wallet_balance') || toolNames.includes('list_wallets')) {
            suggestions.push('💱 Swap lowest performer', '📤 Transfer tokens', '📊 Portfolio chart', '🐳 Whale signals');
        } else if (toolNames.includes('transfer_tokens')) {
            suggestions.push('💼 Check balance', `📈 Price of${t_}`, '📜 Transfer history');
        } else if (toolNames.includes('create_wallet')) {
            suggestions.push('💼 Check balance', '💱 First swap', '📡 Show signals');
        } else if (toolNames.includes('get_gas_price')) {
            suggestions.push('💱 Swap tokens', '📤 Transfer', '📈 Top tokens');
        } else {
            // Generic — extract context from reply text
            if (reply?.toLowerCase().includes('price') || reply?.toLowerCase().includes('$'))
                suggestions.push(`📊 More about${t_ || ' prices'}`, '💱 Swap tokens');
            else
                suggestions.push('💰 Check balance', '📊 Top tokens', '🐳 Whale signals');
        }
        return suggestions.slice(0, 4); // Show up to 4 suggestions
    };

    // #4 Token autocomplete & smart paste detection
    const [pasteDetected, setPasteDetected] = useState(null);
    const handleInputChange = (e) => {
        const val = e.target.value;
        setInput(val);
        // Reset history index on manual typing
        historyIndexRef.current = -1;
        // Check for $ trigger (token autocomplete)
        const match = val.match(/\$(\w*)$/);
        if (match) {
            const query = match[1].toUpperCase();
            const results = KNOWN_TOKEN_LIST.filter(t => t.startsWith(query)).slice(0, 6);
            setAutocompleteResults(results);
            setShowAutocomplete(results.length > 0);
        } else {
            setShowAutocomplete(false);
        }
        // Smart paste detection — detect 0x addresses / tx hashes pasted
        if (val.match(/^0x[a-fA-F0-9]{40,64}$/)) {
            const isLong = val.length > 50; // tx hash vs address
            setPasteDetected(isLong ? 'tx' : 'address');
        } else {
            if (pasteDetected) setPasteDetected(null);
        }
    };
    const insertToken = (token) => {
        setInput(prev => prev.replace(/\$\w*$/, token + ' '));
        setShowAutocomplete(false);
        inputRef.current?.focus();
    };
    // Paste detection action handler
    const handlePasteAction = (action) => {
        const addr = input.trim();
        setPasteDetected(null);
        setInput(''); // Clear input before sending
        if (action === 'analyze') sendMessage(`Analyze this address: ${addr}`);
        else if (action === 'lookup') sendMessage(`Look up contract ${addr}`);
        else if (action === 'tx') sendMessage(`Check transaction ${addr}`);
        else if (action === 'security') sendMessage(`Check token security for ${addr}`);
    };

    // #6 Voice input
    const toggleVoice = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        const recognition = new SpeechRecognition();
        // Use user's language from i18n, fallback to browser default
        const langMap = { vi: 'vi-VN', en: 'en-US', zh: 'zh-CN', ko: 'ko-KR', ru: 'ru-RU', id: 'id-ID' };
        const i18nLang = document.documentElement.lang || 'en';
        recognition.lang = langMap[i18nLang] || 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput(prev => prev + (prev ? ' ' : '') + transcript);
            setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    // #3 Image upload for multimodal
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            // Show feedback instead of silently ignoring
            alert(t('dashboard.chatPage.imageTooLarge', 'Image must be under 2MB'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset so same file can be re-selected
    };

    // #1 Message feedback (thumbs up/down)
    const handleFeedback = (msgIndex, type) => {
        setMessageFeedback(prev => ({
            ...prev,
            [msgIndex]: prev[msgIndex] === type ? null : type
        }));
    };

    // #3 Edit & resend user message
    const editMessage = (msgIndex) => {
        const msg = messages[msgIndex];
        if (!msg || msg.role !== 'user') return;
        setInput(msg.content);
        // Remove this message and all after it
        setMessages(prev => prev.slice(0, msgIndex));
        // Clean up stale pins and feedback
        setPinnedMessages(prev => prev.filter(i => i < msgIndex));
        setMessageFeedback(prev => {
            const next = {};
            for (const k in prev) { if (Number(k) < msgIndex) next[k] = prev[k]; }
            return next;
        });
        setFollowUpSuggestions([]);
        inputRef.current?.focus();
    };

    // #5 Share conversation
    const shareConversation = () => {
        if (messages.length === 0) return;
        const lines = messages.map(m => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.content}`).join('\n\n---\n\n');
        const text = `# AI Chat\n\n${lines}`;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => hapticNotification('success')).catch(() => {});
        } else {
            // Fallback for insecure contexts (http)
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
            hapticNotification('success');
        }
    };

    // #4 Drag & drop image
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => {
        // Prevent flicker when dragging over child elements
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsDragging(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        if (file.size > 2 * 1024 * 1024) {
            alert(t('dashboard.chatPage.imageTooLarge', 'Image must be under 2MB'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
    };

    // #10 Context indicator (estimate tokens used)
    const contextSize = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const contextPercent = Math.min(100, Math.round((contextSize / 100000) * 100)); // ~100k chars ≈ context window

    // Quick suggestion prompts (shown in empty state)
    const suggestionCategories = [
        {
            title: '💰 Wallet & Assets',
            items: [
                { icon: '👛', text: t('dashboard.chatPage.suggestBalance', 'Check my wallet balance') },
                { icon: '🔑', text: t('dashboard.chatPage.suggestCreate', 'Create a new wallet') },
            ]
        },
        {
            title: '📊 Market & Trading',
            items: [
                { icon: '🔥', text: t('dashboard.chatPage.suggestTop', 'Show top trending tokens') },
                { icon: '💱', text: t('dashboard.chatPage.suggestSwap', 'Swap 0.01 OKB to USDT') },
            ]
        },
        {
            title: '🔍 Research & Analysis',
            items: [
                { icon: '🔎', text: t('dashboard.chatPage.suggestAnalyze', 'Analyze token BANMAO') },
                { icon: '⚖️', text: t('dashboard.chatPage.suggestCompare', 'Compare OKB vs BNB vs ETH') },
            ]
        },
        {
            title: '📡 Signals & Alerts',
            items: [
                { icon: '🐋', text: t('dashboard.chatPage.suggestWhale', 'Show whale buy signals') },
                { icon: '🔔', text: t('dashboard.chatPage.suggestAlert', 'Alert me when ETH goes above $4000') },
            ]
        },
    ];

    // Full features guide data
    const featuresGuide = [
        {
            id: 'wallet',
            icon: Wallet,
            color: 'text-brand-400',
            bg: 'bg-brand-400/10',
            title: t('dashboard.chatHelp.walletTitle', '💼 Wallet Management'),
            desc: t('dashboard.chatHelp.walletDesc', 'Create, manage, and check your trading wallets and balances.'),
            examples: [
                'Check my wallet balance',
                'Create a new wallet',
                'List all my wallets',
                'Show my portfolio PnL',
                'Export my wallet data',
                'Set wallet PIN to 1234',
                'Check balance of 0x1234...abcd',
            ]
        },
        {
            id: 'market',
            icon: TrendingUp,
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10',
            title: t('dashboard.chatHelp.marketTitle', '📊 Market Data & Prices'),
            desc: t('dashboard.chatHelp.marketDesc', 'Get real-time prices, charts, trending tokens, and market candles.'),
            examples: [
                'What is the price of OKB?',
                'Show top trending tokens',
                'Show 7-day chart for ETH',
                'Recent trades for BANMAO',
                'What are current gas prices?',
                'Get liquidity for OKB on X Layer',
                'Search token PEPE',
            ]
        },
        {
            id: 'analysis',
            icon: Activity,
            color: 'text-teal-400',
            bg: 'bg-teal-400/10',
            title: t('dashboard.chatHelp.analysisTitle', '🔬 Token Analysis'),
            desc: t('dashboard.chatHelp.analysisDesc', 'Deep technical analysis with RSI, MA, whale detection, and token comparison.'),
            examples: [
                'Analyze ETH',
                'Should I buy OKB?',
                'Technical analysis for SOL',
                'Compare OKB vs BNB vs ETH',
                'Compare BANMAO vs PEPE',
                'Check token security for 0xabc...',
            ]
        },
        {
            id: 'trading',
            icon: ArrowLeftRight,
            color: 'text-purple-400',
            bg: 'bg-purple-400/10',
            title: t('dashboard.chatHelp.tradingTitle', '💱 Trading & Swaps'),
            desc: t('dashboard.chatHelp.tradingDesc', 'Swap tokens, get quotes, batch operations, and DCA scheduling.'),
            examples: [
                'Swap 0.01 OKB to USDT',
                'Get quote for 100 USDT to OKB',
                'Batch swap OKB to USDT and BNB',
                'Transfer 10 USDT to 0xabc...',
                'Schedule DCA buy ETH every day',
                'Simulate swap before executing',
            ]
        },
        {
            id: 'signals',
            icon: Shield,
            color: 'text-red-400',
            bg: 'bg-red-400/10',
            title: t('dashboard.chatHelp.signalsTitle', '📡 Signals & Intelligence'),
            desc: t('dashboard.chatHelp.signalsDesc', 'Smart money, whale, and KOL buy direction signals powered by OnchainOS.'),
            examples: [
                'Show whale buy signals',
                'Smart money signals on X Layer',
                'KOL signals on Ethereum',
                'What chains have signals?',
            ]
        },
        {
            id: 'alerts',
            icon: Bell,
            color: 'text-amber-400',
            bg: 'bg-amber-400/10',
            title: t('dashboard.chatHelp.alertsTitle', '🔔 Price Alerts & Favorites'),
            desc: t('dashboard.chatHelp.alertsDesc', 'Set price alerts and manage your favorite token watchlist.'),
            examples: [
                'Alert me when ETH goes above $4000',
                'Set alert OKB below $50',
                'Show my price alerts',
                'Delete alert #3',
                'Add OKB to favorites',
                'Show my favorite token prices',
                'Remove PEPE from favorites',
            ]
        },
        {
            id: 'lookup',
            icon: Search,
            color: 'text-cyan-400',
            bg: 'bg-cyan-400/10',
            title: t('dashboard.chatHelp.lookupTitle', '🔍 On-Chain Lookup'),
            desc: t('dashboard.chatHelp.lookupDesc', 'Look up contracts, transactions, check approval safety, and ROI.'),
            examples: [
                'Look up contract 0xabc...',
                'Check transaction 0xtxhash...',
                'Is this approval safe? 0xabc...',
                'Calculate ROI for OKB if bought 30 days ago',
            ]
        },
        {
            id: 'general',
            icon: Globe,
            color: 'text-surface-200/60',
            bg: 'bg-white/5',
            title: t('dashboard.chatHelp.generalTitle', '🌐 General & Utilities'),
            desc: t('dashboard.chatHelp.generalDesc', 'Weather, chat management, and general questions.'),
            examples: [
                'What is the weather in Hanoi?',
                'Clear chat history',
                'Explain what DCA means',
                'How does DEX trading work?',
            ]
        },
    ];

    return (
        <>
        <div className={`flex overflow-hidden bg-surface-900/50 ${isMobile ? 'h-full w-full' : 'h-full rounded-2xl border border-white/5'}`}>
            {/* Sidebar */}
            <div className={`${sidebarOpen ? (isMobile ? 'chat-sidebar-sheet bottom-sheet-enter' : 'translate-x-0') : (isMobile ? 'translate-y-full' : '-translate-x-full md:translate-x-0')}
                ${isMobile ? 'fixed bottom-0 left-0 right-0 z-50 w-full max-h-[70vh] rounded-t-2xl' : 'fixed md:relative z-20 w-72 h-full'}
                bg-surface-900 border-r border-white/5 flex flex-col transition-transform duration-300`}>
                {/* Mobile bottom sheet handle */}
                {isMobile && sidebarOpen && (
                    <div className="flex justify-center py-2" onClick={() => setSidebarOpen(false)}>
                        <div className="w-10 h-1 rounded-full bg-white/20" />
                    </div>
                )}

                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
                        <MessageSquare size={14} className="text-brand-400" />
                        {t('dashboard.sidebar.aiChat', 'AI Chat')}
                    </h2>
                    <div className="flex items-center gap-1">
                        <button onClick={startNewChat}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-brand-400 transition-colors"
                            title="New Chat">
                            <Plus size={14} />
                        </button>
                        <button onClick={() => setSidebarOpen(false)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 md:hidden">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* #7 Search bar */}
                {conversations.length > 0 && (
                    <div className="px-3 py-2 border-b border-white/5">
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-200/25" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('dashboard.chatPage.searchConv', 'Search conversations...')}
                                className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-surface-800/40 border border-white/5 text-[11px] text-surface-100
                                    placeholder:text-surface-200/20 focus:outline-none focus:border-brand-500/25 transition-colors"
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {filteredConversations.length === 0 ? (
                        <p className="text-xs text-surface-200/30 text-center py-8">{t('dashboard.chatPage.noConv', 'No conversations yet')}</p>
                    ) : (() => {
                        // Group conversations by date
                        const now = new Date();
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                        const yesterday = today - 86400000;
                        const weekAgo = today - 7 * 86400000;
                        const groups = { pinned: [], today: [], yesterday: [], week: [], older: [] };
                        filteredConversations.forEach(conv => {
                            const ts = conv.updatedAt || conv.createdAt || 0;
                            const time = typeof ts === 'string' ? new Date(ts).getTime() : ts;
                            if (conv.isPinned) groups.pinned.push(conv);
                            else if (time >= today) groups.today.push(conv);
                            else if (time >= yesterday) groups.yesterday.push(conv);
                            else if (time >= weekAgo) groups.week.push(conv);
                            else groups.older.push(conv);
                        });
                        const groupLabels = [
                            { key: 'pinned', label: '📌 ' + t('dashboard.chatPage.pinned', 'Pinned'), items: groups.pinned },
                            { key: 'today', label: t('dashboard.chatPage.today', 'Today'), items: groups.today },
                            { key: 'yesterday', label: t('dashboard.chatPage.yesterday', 'Yesterday'), items: groups.yesterday },
                            { key: 'week', label: t('dashboard.chatPage.thisWeek', 'This Week'), items: groups.week },
                            { key: 'older', label: t('dashboard.chatPage.older', 'Older'), items: groups.older },
                        ].filter(g => g.items.length > 0);
                        // If no date info, fall back to flat list
                        const hasDateInfo = filteredConversations.some(c => c.updatedAt || c.createdAt);
                        if (!hasDateInfo) {
                            return filteredConversations.map(conv => (
                                <ConvItem key={conv.conversationId} conv={conv} active={conv.conversationId === conversationId}
                                    onLoad={loadConversation} onDelete={deleteConversation} onRename={handleRename} onPin={handlePin} onShare={handleShare} isMobile={isMobile} />
                            ));
                        }
                        return groupLabels.map(g => (
                            <div key={g.key}>
                                <p className="text-[9px] text-surface-200/25 font-semibold uppercase tracking-wider px-2 pt-2 pb-1">{g.label}</p>
                                {g.items.map(conv => (
                                    <ConvItem key={conv.conversationId} conv={conv} active={conv.conversationId === conversationId}
                                        onLoad={loadConversation} onDelete={deleteConversation} onRename={handleRename} onPin={handlePin} onShare={handleShare} isMobile={isMobile} />
                                ))}
                            </div>
                        ));
                    })()}
                </div>

                {/* #18 Saved Prompts */}
                {savedPrompts.length > 0 && (
                    <div className="border-t border-white/5">
                        <div className="px-3 py-2 flex items-center gap-2">
                            <Star size={12} className="text-amber-400" />
                            <span className="text-[10px] font-semibold text-surface-200/50 uppercase tracking-wider">{t('dashboard.chatPage.savedPrompts', 'Saved Prompts')}</span>
                        </div>
                        <div className="px-2 pb-2 space-y-0.5">
                            {savedPrompts.slice(0, 5).map(p => (
                                <div key={p.ts} className="flex items-center gap-1 group">
                                    <button onClick={() => sendMessage(p.text)}
                                        className="flex-1 text-left px-2 py-1.5 rounded-lg text-[11px] text-surface-200/60 hover:text-surface-100 hover:bg-white/[0.03] truncate transition-colors">
                                        {p.text.slice(0, 50)}{p.text.length > 50 ? '…' : ''}
                                    </button>
                                    <button onClick={() => removePrompt(p.ts)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-surface-200/20 hover:text-red-400 transition-all">
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── 🧠 AI Memory Panel (collapsible) ── */}
                <div className="border-t border-white/5">
                    <button onClick={() => setShowMemoryPanel(!showMemoryPanel)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/[0.03] transition-colors">
                        <Brain size={12} className="text-violet-400" />
                        <span className="text-[10px] font-semibold text-surface-200/50 uppercase tracking-wider flex-1 text-left">
                            {t('dashboard.aiMemoryPage.title', 'AI Memory')}
                            <span className="text-surface-200/25 font-normal ml-1">({Object.keys(memPrefs).length})</span>
                        </span>
                        {showMemoryPanel ? <ChevronUp size={12} className="text-surface-200/30" /> : <ChevronDown size={12} className="text-surface-200/30" />}
                    </button>
                    {showMemoryPanel && (
                        <div className="px-3 pb-3 space-y-2 animate-fadeIn">
                            {/* Usage guide */}
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-violet-500/5 border border-violet-500/10">
                                <AlertCircle size={11} className="text-violet-400 mt-0.5 flex-shrink-0" />
                                <p className="text-[9px] text-surface-200/50 leading-relaxed">
                                    {t('dashboard.aiMemoryPage.usageGuide', 'AI stores these preferences and uses them across ALL conversations to personalize responses. Example: set nickname, language, trading style.')}
                                </p>
                            </div>

                            {/* Stored memories list */}
                            {memLoading ? (
                                <div className="flex justify-center py-3">
                                    <Loader2 size={14} className="animate-spin text-violet-400" />
                                </div>
                            ) : Object.keys(memPrefs).length === 0 ? (
                                <p className="text-[10px] text-surface-200/25 text-center py-2">
                                    {t('dashboard.aiMemoryPage.noMemories', 'No memories yet')}
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {Object.entries(memPrefs).map(([key, value]) => (
                                        <div key={key} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-800/30 hover:bg-surface-800/50 transition-colors group">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span className="text-[10px] text-violet-400 font-mono font-semibold whitespace-nowrap">{key}</span>
                                                <span className="text-[10px] text-surface-200/50 truncate">{value}</span>
                                            </div>
                                            <button onClick={() => deleteMemoryItem(key)}
                                                className="p-1 rounded text-surface-200/15 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Quick add form */}
                            <div className="flex gap-1.5 items-end">
                                <input type="text" value={memNewKey} onChange={e => setMemNewKey(e.target.value)}
                                    placeholder={t('dashboard.aiMemoryPage.keyPlaceholder', 'Key')}
                                    className="flex-1 min-w-0 bg-surface-800/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-surface-100 placeholder-surface-200/20 focus:outline-none focus:border-violet-400/30" />
                                <input type="text" value={memNewValue} onChange={e => setMemNewValue(e.target.value)}
                                    placeholder={t('dashboard.aiMemoryPage.valuePlaceholder', 'Value')}
                                    onKeyDown={e => { if (e.key === 'Enter') saveMemoryItem(); }}
                                    className="flex-[1.5] min-w-0 bg-surface-800/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-surface-100 placeholder-surface-200/20 focus:outline-none focus:border-violet-400/30" />
                                <button onClick={saveMemoryItem} disabled={memSaving || !memNewKey.trim() || !memNewValue.trim()}
                                    className="p-1.5 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 disabled:opacity-30 transition-all flex-shrink-0">
                                    {memSaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                </button>
                            </div>

                            {/* Suggested keys */}
                            <div className="flex gap-1 flex-wrap">
                                {MEMORY_SUGGESTED_KEYS.filter(s => !memPrefs[s.key]).slice(0, 4).map(s => (
                                    <button key={s.key} onClick={() => setMemNewKey(s.key)}
                                        className="px-1.5 py-0.5 rounded bg-surface-800/30 text-[9px] text-surface-200/30 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                                        title={s.desc}>
                                        <Tag size={7} className="inline mr-0.5" /> {s.key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* #20 Copilot Quick Prompts */}
                <div className="border-t border-white/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={12} className="text-purple-400" />
                        <span className="text-[10px] font-semibold text-surface-200/50 uppercase tracking-wider">{t('dashboard.chatPage.copilot', 'Copilot')}</span>
                    </div>
                    <div className="space-y-1">
                        {[
                            { label: '🔍 ' + t('dashboard.chatPage.copilotAnalyze', 'Analyze token'), cmd: t('dashboard.chatPage.suggestAnalyze', 'Analyze this token for me: ') },
                            { label: '📊 ' + t('dashboard.chatPage.copilotTrend', 'Market trend'), cmd: t('dashboard.chatPage.copilotTrendCmd', 'What is the current market trend for top tokens?') },
                            { label: '🐋 ' + t('dashboard.chatPage.copilotWhale', 'Whale signals'), cmd: t('dashboard.chatPage.suggestWhale', 'Show me the latest whale buy signals') },
                            { label: '💱 ' + t('dashboard.chatPage.copilotSwap', 'Best swap'), cmd: t('dashboard.chatPage.copilotSwapCmd', 'What is the best swap route for 0.1 OKB to USDT?') },
                        ].map(p => (
                            <button key={p.cmd} onClick={() => sendMessage(p.cmd)}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-surface-200/50 hover:text-brand-400 hover:bg-brand-500/5 transition-colors">
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {sidebarOpen && isMobile && (
                <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
            )}
            {sidebarOpen && !isMobile && (
                <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Main chat area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className={`flex-shrink-0 z-20 border-b border-white/5 flex items-center bg-surface-900/80 backdrop-blur-sm
                    ${isMobile ? 'px-3 py-3 gap-1' : 'px-4 py-3 gap-3'}`}
                    style={isMobile ? { paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))', paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))', paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))' } : {}}>
                    {/* Mobile: Global Menu button */}
                    <button onClick={() => setGlobalSidebarOpen?.(true)}
                        className={`rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-brand-400 transition-colors active:scale-95 md:hidden
                            ${isMobile ? 'p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center' : 'p-1.5'}`}
                        title={t('dashboard.common.menu', 'Menu')}>
                        <Menu size={isMobile ? 18 : 16} />
                    </button>
                    {/* Mobile: Home button */}
                    <button onClick={() => navigate('/')}
                        className={`rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-brand-400 transition-colors active:scale-95 md:hidden
                            ${isMobile ? 'p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center' : 'p-1.5'}`}
                        title={t('dashboard.chatPage.home', 'Home')}>
                        <Home size={isMobile ? 18 : 16} />
                    </button>
                    {/* Mobile: Conversations button with count badge */}
                    <button onClick={() => setSidebarOpen(true)}
                        className={`rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-brand-400 transition-colors active:scale-95 relative md:hidden
                            ${isMobile ? 'p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center' : 'p-1.5'}`}
                        title={t('dashboard.chatPage.conversations', 'Conversations')}>
                        <MessageSquare size={isMobile ? 18 : 16} />
                        {conversations.length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-500 text-white text-[8px] font-bold flex items-center justify-center">
                                {conversations.length > 9 ? '9+' : conversations.length}
                            </span>
                        )}
                    </button>
                    <div className={`rounded-full flex items-center justify-center flex-shrink-0 ring-1 ring-emerald-500/30 overflow-hidden bg-surface-800
                        ${isMobile ? 'w-7 h-7' : 'w-8 h-8'}`}>
                        <img src="/xbot-logo.png" alt="XBot" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className={`font-semibold text-surface-100 truncate ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            {t('dashboard.chatPage.title', 'XBot')}
                        </h1>
                        <p className="text-[10px] text-emerald-400/70 flex items-center gap-1 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                            <span className="truncate">{t('dashboard.chatPage.status', 'Online — Powered by Gemini + OnchainOS')}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        {/* Compare toggle — hidden on mobile */}
                        <button
                            onClick={() => setCompareMode(!compareMode)}
                            className={`hidden sm:flex p-2 rounded-lg transition-colors items-center gap-1 ${
                                compareMode
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : 'hover:bg-white/5 text-surface-200/40 hover:text-purple-400'
                            }`}
                            title={t('dashboard.chatPage.compareIndicator', 'Compare')}
                        >
                            <Columns size={12} />
                            <span className="hidden sm:inline text-[10px]">{compareMode ? t('dashboard.chatPage.compareIndicator', 'Compare') : ''}</span>
                        </button>
                        {/* AI Settings Button */}
                        <div className="relative">
                            <button onClick={() => { setShowSettingsPanel(!showSettingsPanel); if (!showSettingsPanel) { loadApiKeys(); } }}
                                className={`rounded-lg transition-colors flex items-center gap-1 active:scale-95 ${
                                    isMobile ? 'p-2.5 min-w-[40px] min-h-[40px] justify-center' : 'p-2'
                                } ${
                                    showSettingsPanel ? 'bg-brand-500/15 text-brand-400' : 'hover:bg-white/5 text-surface-200/40 hover:text-brand-400'
                                }`}
                                title={t('dashboard.chatPage.aiSettings', 'AI Settings')}>
                                <Settings size={isMobile ? 16 : 12} />
                                <span className="hidden sm:inline text-[10px]">{modelOptions.find(m => m.id === selectedModel)?.label || 'Flash'}</span>
                            </button>
                        </div>
                        {/* Context indicator — desktop only */}
                        {messages.length > 0 && (
                            <div className="hidden sm:flex items-center gap-1.5 px-2" title={`Context: ${contextPercent}%`}>
                                <Gauge size={10} className="text-surface-200/30" />
                                <div className="w-12 h-1 rounded-full bg-surface-800/60 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${contextPercent > 80 ? 'bg-red-400' : contextPercent > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                        style={{ width: `${contextPercent}%` }} />
                                </div>
                                <span className="text-[9px] text-surface-200/25">{contextPercent}%</span>
                            </div>
                        )}
                        {/* Share & Export — desktop only */}
                        {messages.length > 0 && (
                            <>
                                <button onClick={shareConversation}
                                    className="hidden sm:flex p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors"
                                    title={t('dashboard.chatPage.share', 'Share')}>
                                    <Share2 size={12} />
                                </button>
                                <button onClick={exportConversation}
                                    className="hidden sm:flex p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-emerald-400 transition-colors"
                                    title={t('dashboard.chatPage.export', 'Export chat')}>
                                    <Download size={12} />
                                </button>
                            </>
                        )}
                        {/* Guide — desktop only */}
                        <button onClick={() => setShowHelp(!showHelp)}
                            className={`hidden sm:flex p-2 rounded-lg transition-colors text-xs items-center gap-1.5 ${
                                showHelp ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'hover:bg-white/5 text-surface-200/40 hover:text-brand-400'
                            }`}
                            title={t('dashboard.chatPage.helpBtn', 'Features Guide')}>
                            <BookOpen size={12} />
                            <span className="hidden sm:inline">{t('dashboard.chatPage.helpBtn', 'Guide')}</span>
                        </button>
                        {/* New Chat */}
                        {conversationId && (
                            <button onClick={startNewChat}
                                className={`rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors active:scale-95 flex items-center gap-1
                                    ${isMobile ? 'p-2.5 min-w-[40px] min-h-[40px] justify-center' : 'p-2 text-xs gap-1.5'}`}>
                                <Plus size={isMobile ? 16 : 12} />
                                <span className="hidden sm:inline">{t('dashboard.chatPage.newChat', 'New')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div ref={chatContainerRef}
                    className={`flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth relative ${isDragging ? 'ring-2 ring-brand-500/30 ring-inset' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}>
                    {/* Drag overlay */}
                    {isDragging && (
                        <div className="absolute inset-0 bg-brand-500/5 flex items-center justify-center z-10 pointer-events-none">
                            <div className="flex items-center gap-2 text-brand-400 text-sm font-medium">
                                <Image size={20} />
                                <span>{t('dashboard.chatPage.dropImage', 'Drop image to analyze')}</span>
                            </div>
                        </div>
                    )}
                    {/* ─── Help Guide Panel (overlay, toggled from header) ─── */}
                    {showHelp && (
                        <div className="animate-fadeIn mb-4">
                            <div className="rounded-2xl border border-brand-500/15 bg-gradient-to-br from-surface-800/80 to-surface-900/80 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center">
                                            <BookOpen size={14} className="text-brand-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-surface-100">
                                                {t('dashboard.chatHelp.title', 'Features Guide')}
                                            </h3>
                                            <p className="text-[10px] text-surface-200/40">
                                                {t('dashboard.chatHelp.subtitle', '53 tools available — just chat naturally!')}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowHelp(false)}
                                        className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-surface-200">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="p-3 space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                    {featuresGuide.map(cat => {
                                        const CatIcon = cat.icon;
                                        const isExpanded = expandedGuide === cat.id;
                                        return (
                                            <div key={cat.id} className={`rounded-xl border transition-all duration-200 ${
                                                isExpanded ? 'border-white/10 bg-surface-800/40' : 'border-transparent hover:bg-surface-800/20'
                                            }`}>
                                                <button
                                                    onClick={() => setExpandedGuide(isExpanded ? null : cat.id)}
                                                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left"
                                                >
                                                    <div className={`w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center flex-shrink-0`}>
                                                        <CatIcon size={14} className={cat.color} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium text-surface-100">{cat.title}</p>
                                                        <p className="text-[10px] text-surface-200/35 truncate">{cat.desc}</p>
                                                    </div>
                                                    <ChevronDown size={12} className={`text-surface-200/30 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                                </button>
                                                {isExpanded && (
                                                    <div className="px-3 pb-3 animate-fadeIn">
                                                        <p className="text-[10px] text-surface-200/25 uppercase tracking-wider mb-2 ml-11">
                                                            {t('dashboard.chatHelp.tryAsking', 'Try asking:')}
                                                        </p>
                                                        <div className="ml-11 space-y-1">
                                                            {cat.examples.map((ex, i) => (
                                                                <button key={i}
                                                                    onClick={() => { setShowHelp(false); sendMessage(ex); }}
                                                                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-surface-200/50
                                                                        hover:text-surface-200/90 hover:bg-white/5 transition-colors
                                                                        flex items-center gap-2 group"
                                                                >
                                                                    <span className="text-surface-200/20 group-hover:text-brand-400 transition-colors">→</span>
                                                                    <span className="flex-1">{ex}</span>
                                                                    <Send size={9} className="opacity-0 group-hover:opacity-50 text-brand-400 transition-opacity" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="px-4 py-2.5 border-t border-white/5 bg-surface-900/50">
                                    <p className="text-[10px] text-surface-200/25 text-center">
                                        💡 {t('dashboard.chatHelp.tip', 'You don\'t need commands — just describe what you want in natural language!')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {loadingConv ? (
                        <ChatSkeleton />
                    ) : messages.length === 0 && !showHelp ? (
                        /* ─── Empty state with quick suggestions ─── */
                        <div className="flex flex-col items-center justify-center h-full gap-6 animate-fadeIn">
                            {/* Animated gradient icon */}
                            <div className="relative">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 via-purple-500/15 to-emerald-500/20 border border-white/5
                                    flex items-center justify-center shadow-2xl shadow-brand-500/10">
                                    <Sparkles size={32} className="text-brand-400" />
                                </div>
                                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-brand-500/10 to-emerald-500/10 blur-xl -z-10 animate-pulse" />
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-surface-900 flex items-center justify-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                </div>
                            </div>
                            <div className="text-center">
                                <h2 className="text-lg font-semibold text-surface-100 mb-1">{t('dashboard.chatPage.welcomeTitle', 'XBot')}</h2>
                                <p className="text-xs text-surface-200/40 max-w-md">
                                    {t('dashboard.chatPage.welcomeDesc', 'Chat naturally to control your wallets, swap tokens, check prices, view signals, and manage your portfolio — all powered by AI + OnchainOS.')}
                                </p>
                                <p className="text-[10px] text-surface-200/25 mt-2">
                                    💡 {t('dashboard.chatPage.slashHint', 'Type / to see all commands, or just describe what you need')}
                                </p>
                            </div>
                            <div className={`grid gap-4 w-full max-w-lg ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                {suggestionCategories.map((cat, ci) => (
                                    <div key={ci} className="space-y-1.5">
                                        <p className="text-[10px] text-surface-200/30 font-semibold uppercase tracking-wider px-1">{cat.title}</p>
                                        {cat.items.map((s, si) => (
                                            <button key={si}
                                                onClick={() => sendMessage(s.text)}
                                                className={`w-full text-left rounded-xl border border-white/5 bg-surface-800/30
                                                    hover:bg-white/5 hover:border-brand-500/20 transition-all text-xs text-surface-200/60
                                                    hover:text-surface-200/90 flex items-center gap-2.5 group active:scale-[0.98]
                                                    ${isMobile ? 'px-4 py-3' : 'px-3 py-2.5'}`}>
                                                <span className="text-base">{s.icon}</span>
                                                <span className="flex-1">{s.text}</span>
                                                <ChevronRight size={10} className="text-surface-200/20 group-hover:text-brand-400 transition-colors" />
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            {/* Quick help link + Type / hint */}
                            <div className="flex flex-col items-center gap-2">
                                <button onClick={() => setShowHelp(true)}
                                    className="flex items-center gap-2 text-[11px] text-surface-200/30 hover:text-brand-400 transition-colors group">
                                    <BookOpen size={12} className="group-hover:text-brand-400" />
                                    {t('dashboard.chatHelp.viewAll', 'View all 53 available tools & features')}
                                    <ChevronRight size={10} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Pinned messages strip */}
                            {pinnedMessages.length > 0 && (
                                <div className="mb-3 p-2 rounded-xl bg-amber-500/5 border border-amber-500/15">
                                    <p className="text-[10px] text-amber-400/70 font-semibold flex items-center gap-1 mb-1.5">
                                        <Pin size={10} /> {t('dashboard.chatPage.pinned', 'Pinned')} ({pinnedMessages.length})
                                    </p>
                                    <div className="space-y-1">
                                        {pinnedMessages.map(idx => messages[idx] && (
                                            <div key={idx}
                                                className="text-[11px] text-surface-200/60 truncate px-2 py-1 rounded-lg bg-surface-800/30 cursor-pointer hover:bg-surface-800/50 transition-colors"
                                                onClick={() => document.getElementById(`msg-${idx}`)?.scrollIntoView({ behavior: 'smooth' })}>
                                                📌 {messages[idx].content?.substring(0, 80)}...
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {messages.map((msg, i) => {
                                // Skip empty assistant messages (streaming placeholder before text arrives)
                                if (msg.role === 'assistant' && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0)) return null;
                                // ── Compare result rendering ──
                                if (msg.role === 'compare') {
                                    if (!msg.content) return <div key={i} className="flex justify-center py-6"><div className="animate-pulse flex items-center gap-3 text-surface-200/40 text-xs"><Columns size={14} /> Comparing models...</div></div>;
                                    const { modelA, modelB } = msg.content;
                                    const shortName = (m) => (m?.model || '').replace('gemini-', '').replace('-preview', '');
                                    return (
                                        <div key={i} id={`msg-${i}`} className="mb-4">
                                            <div className="text-center text-[10px] text-surface-200/30 mb-2 flex items-center justify-center gap-1.5">
                                                <Columns size={10} /> {t('dashboard.chatPage.modelComparison', 'Model Comparison')}
                                            </div>
                                            <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-2 gap-3'}`}>
                                                {[modelA, modelB].map((r, idx) => (
                                                    <div key={idx} className="rounded-xl border border-surface-700/30 bg-surface-800/20 p-3">
                                                        <div className="text-[10px] font-medium text-accent-400/70 mb-2 flex items-center gap-1.5">
                                                            <span className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-blue-400' : 'bg-emerald-400'}`}/>
                                                            {shortName(r)}
                                                        </div>
                                                        {r?.error
                                                            ? <p className="text-xs text-red-400">❌ {r.error}</p>
                                                            : <ChatBubble message={{ role: 'assistant', content: r?.response || '' }} isMobile={isMobile} />
                                                        }
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                <div key={i} id={`msg-${i}`}>
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <div className="ml-11 mb-2 space-y-1.5">
                                            <p className="text-[10px] text-surface-200/30 flex items-center gap-1.5 mb-1">
                                                <Wrench size={10} />
                                                {msg.toolCalls.length} {msg.toolCalls.length > 1 ? t('dashboard.chatPage.toolsUsed', 'tools used') : t('dashboard.chatPage.toolUsed', 'tool used')}
                                            </p>
                                            {msg.toolCalls.map((tc, j) => (
                                                tc.result === '...' ? <ToolCallSkeleton key={j} name={tc.name} /> : <ToolCallCard key={j} toolCall={tc} onAction={sendMessage} />
                                            ))}
                                        </div>
                                    )}
                                    <ChatBubble
                                        message={msg}
                                        onRetry={retryLastMessage}
                                        onPin={() => togglePin(i)}
                                        isPinned={pinnedMessages.includes(i)}
                                        onFeedback={msg.role === 'assistant' ? (type) => handleFeedback(i, type) : undefined}
                                        feedback={messageFeedback[i]}
                                        onEdit={msg.role === 'user' ? () => editMessage(i) : undefined}
                                        onSave={msg.role === 'user' ? savePrompt : undefined}
                                        isMobile={isMobile}
                                    />
                                    {/* Always-visible retry button on error messages */}
                                    {msg.role === 'assistant' && msg.content?.startsWith('\u274c') && (
                                        <div className="ml-11 mt-1.5 animate-fadeIn flex items-center gap-2 flex-wrap">
                                            <button onClick={retryLastMessage}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]
                                                    bg-amber-500/10 text-amber-400 border border-amber-500/20
                                                    hover:bg-amber-500/20 transition-all">
                                                <RefreshCw size={11} />
                                                {t('dashboard.chatPage.retryBtn', 'Thử lại')}
                                            </button>
                                            <button onClick={() => { setShowSettingsPanel(true); setSettingsTab('keys'); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]
                                                    bg-brand-500/10 text-brand-400 border border-brand-500/20
                                                    hover:bg-brand-500/20 transition-all">
                                                <Settings size={11} />
                                                {t('dashboard.chatPage.openAiSettings', 'Cài đặt AI')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                            {loading && <TypingIndicator />}
                            <div ref={messagesEndRef} />
                            {/* Follow-up suggestions */}
                            {followUpSuggestions.length > 0 && !loading && (
                                <div className={`flex gap-1.5 mt-2 animate-fadeIn ${isMobile ? 'overflow-x-auto pb-1 -mx-2 px-2 scrollbar-hide' : 'flex-wrap'}`}>
                                    {followUpSuggestions.map((s, i) => (
                                        <button key={i}
                                            onClick={() => sendMessage(s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, ''))}
                                            className={`rounded-full bg-brand-500/8 text-brand-400/80
                                                border border-brand-500/15 hover:bg-brand-500/15 hover:text-brand-400 transition-all
                                                active:scale-95 whitespace-nowrap flex-shrink-0
                                                ${isMobile ? 'px-4 py-2 text-xs' : 'px-3 py-1.5 text-[11px]'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Scroll button */}
                {showScroll && (
                    <button onClick={scrollToBottom}
                        className={`absolute ${isMobile ? 'bottom-20 right-4' : 'bottom-24 right-8'} w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30
                            flex items-center justify-center text-brand-400 hover:bg-brand-500/30 transition-colors shadow-lg`}>
                        <ArrowDown size={14} />
                    </button>
                )}

                {/* Input */}
                <div className={`flex-shrink-0 z-20 p-3 border-t border-white/5 bg-surface-900/80 backdrop-blur-sm`}
                     style={isMobile ? { 
                         paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                         paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
                         paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))' 
                     } : {}}>
                    {/* Quick action chips (new/empty chat only) */}
                    {messages.length === 0 && !loading && (
                        <div className={`flex gap-1.5 mb-2 animate-fadeIn ${isMobile ? 'overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide' : 'flex-wrap'}`}>
                            {[
                                { label: '💰 Balance', cmd: 'Check my wallet balance' },
                                { label: '📈 Top tokens', cmd: 'Show top trending tokens' },
                                { label: '💱 Swap', cmd: 'I want to swap tokens' },
                                { label: '📊 Analyze', cmd: 'Analyze OKB token' },
                                { label: '📡 Signals', cmd: 'Show whale buy signals' },
                                { label: '🔔 Alerts', cmd: 'Show my price alerts' },
                            ].map(chip => (
                                <button key={chip.cmd}
                                    onClick={() => sendMessage(chip.cmd)}
                                    className={`rounded-full bg-brand-500/8 text-brand-400/80 border border-brand-500/15
                                        hover:bg-brand-500/15 hover:text-brand-400 transition-all active:scale-95
                                        whitespace-nowrap flex-shrink-0
                                        ${isMobile ? 'px-4 py-2.5 text-xs min-h-[40px]' : 'px-2.5 py-1.5 text-[11px]'}`}>
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Compact chip bar — Model+Persona unified + AI Trader */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${isMobile ? 'overflow-x-auto scrollbar-hide' : 'flex-wrap'}`}>
                            {/* Unified Model+Persona chip */}
                            <button onClick={() => { setShowSettingsPanel(true); setSettingsTab('model'); }}
                                className={`inline-flex items-center gap-1.5 rounded-full bg-surface-800/60 border border-white/5 text-surface-200/60 hover:text-surface-200/90 hover:border-white/10 transition-all whitespace-nowrap flex-shrink-0
                                    ${isMobile ? 'px-3 py-2 text-xs' : 'px-2.5 py-1 text-[10px]'}`}>
                                <span>{(MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || []).find(m => m.id === selectedModel)?.icon || '🤖'}</span>
                                <span className="truncate max-w-[70px]">{(MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || []).find(m => m.id === selectedModel)?.label || 'Flash'}</span>
                                <span className="text-surface-200/25">·</span>
                                <span>{selectedPersona === 'custom' ? '✏️' : (PERSONA_OPTIONS.find(p => p.value === selectedPersona)?.icon || '🔰')}</span>
                                <span className="truncate max-w-[50px]">{selectedPersona === 'custom' ? t('dashboard.chatPage.custom', 'Custom') : (PERSONA_OPTIONS.find(p => p.value === selectedPersona)?.label || 'Default')}</span>
                            </button>
                            {/* AI Trader chip */}
                            <button onClick={() => setShowAiTrader(true)}
                                className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-500/10 to-purple-500/10 border border-brand-500/20 text-brand-400 hover:border-brand-500/40 transition-all whitespace-nowrap flex-shrink-0
                                    ${isMobile ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-[10px]'}`}>
                                🤖 <span>AI Trader</span>
                                <span className="px-1 py-0 text-[8px] font-bold bg-amber-500/20 text-amber-400 rounded">β</span>
                            </button>
                            {/* Compare mode indicator */}
                            {compareMode && <span className={`inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 whitespace-nowrap flex-shrink-0
                                ${isMobile ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-[10px]'}`}>{t('dashboard.chatPage.compareIndicator', '⚔️ Compare')}</span>}
                        </div>
                        {/* U7: Session token counter */}
                        {(sessionTokens.sent > 0 || sessionTokens.received > 0) && (
                            <div className="flex items-center gap-1.5 text-[9px] text-surface-200/25 flex-shrink-0">
                                <span>↑{sessionTokens.sent.toLocaleString()}</span>
                                <span>↓{sessionTokens.received.toLocaleString()}</span>
                                <span className="text-surface-200/15">{t('dashboard.chatPage.tokenUnit', 'tok')}</span>
                            </div>
                        )}
                    </div>
                    {/* Image preview */}
                    {imagePreview && (
                        <div className="mb-2 flex items-center gap-2">
                            <div className="relative">
                                <img src={imagePreview} alt="" className="h-16 rounded-lg border border-white/10 object-cover" />
                                <button onClick={() => setImagePreview(null)}
                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px]">
                                    <X size={8} />
                                </button>
                            </div>
                            <span className="text-[10px] text-surface-200/30">{t('dashboard.chatPage.imageAttached', 'Image attached — AI will analyze')}</span>
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        {/* Image upload button */}
                        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        <button
                            onClick={() => imageInputRef.current?.click()}
                            className={`rounded-xl hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60 transition-all flex-shrink-0
                                ${isMobile ? 'p-3 min-w-[44px] min-h-[44px] flex items-center justify-center' : 'p-2.5'}`}
                            title={t('dashboard.chatPage.uploadImage', 'Upload image for analysis')}>
                            <Paperclip size={isMobile ? 18 : 16} />
                        </button>
                        <div className="flex-1 relative">
                            {/* Slash command palette */}
                            <SlashCommandPalette
                                input={input}
                                isMobile={isMobile}
                                onSelect={(template) => {
                                    setInput('');
                                    sendMessage(template);
                                }}
                            />
                            {/* Smart paste detection */}
                            <PasteDetectionBanner
                                type={pasteDetected}
                                onAction={handlePasteAction}
                                onDismiss={() => setPasteDetected(null)}
                            />
                            {/* Token autocomplete dropdown */}
                            {showAutocomplete && (
                                <div className="absolute bottom-full mb-1 left-0 w-full bg-surface-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                                    {autocompleteResults.map(token => (
                                        <button key={token}
                                            onClick={() => insertToken(token)}
                                            className={`w-full text-left px-3 text-xs text-surface-100 hover:bg-brand-500/10 transition-colors flex items-center gap-2
                                                ${isMobile ? 'py-3' : 'py-2'}`}>
                                            <Coins size={12} className="text-amber-400" />
                                            <span className="font-semibold">{token}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={t('dashboard.chatPage.inputPlaceholder', 'Type / for commands or ask anything...')}
                                rows={1}
                                className={`w-full rounded-xl bg-surface-800/60 border resize-none
                                    text-surface-100 placeholder:text-surface-200/25
                                    focus:outline-none focus:border-brand-500/30 focus:ring-1 focus:ring-brand-500/20
                                    resize-none transition-all ${isListening ? 'border-red-500/40 ring-1 ring-red-500/20' : 'border-white/5'}
                                    ${inputShake ? 'animate-[shake_0.4s_ease-in-out]' : ''}
                                    ${isMobile ? 'px-4 py-3 text-base min-h-[44px]' : 'px-4 py-2.5 text-sm min-h-[40px]'}`}
                                style={{ maxHeight: '120px' }}
                                onInput={(e) => {
                                    const minH = isMobile ? 44 : 40;
                                    e.target.style.height = minH + 'px';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                }}
                            />
                        </div>
                        {/* Voice input button */}
                        {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                            <button
                                onClick={toggleVoice}
                                className={`rounded-xl transition-all flex-shrink-0
                                    ${isMobile ? 'p-3 min-w-[44px] min-h-[44px] flex items-center justify-center' : 'p-2.5'}
                                    ${isListening
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                                    : 'hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60'
                                }`}
                                title={isListening ? 'Stop' : t('dashboard.chatPage.voiceHint', 'Voice input')}>
                                {isListening ? <MicOff size={isMobile ? 18 : 16} /> : <Mic size={isMobile ? 18 : 16} />}
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (!input.trim()) {
                                    setInputShake(true);
                                    setTimeout(() => setInputShake(false), 500);
                                    return;
                                }
                                sendMessage();
                            }}
                            disabled={loading}
                            className={`rounded-xl transition-all flex-shrink-0
                                ${isMobile ? 'p-3 min-w-[44px] min-h-[44px] flex items-center justify-center' : 'p-2.5'}
                                ${input.trim() && !loading
                                    ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                                    : 'bg-surface-800/40 text-surface-200/20 cursor-not-allowed'
                                }`}>
                            {loading
                                ? <Loader2 size={isMobile ? 18 : 16} className="animate-spin" />
                                : <Send size={isMobile ? 18 : 16} />}
                        </button>
                    </div>
                    <p className="text-[9px] text-surface-200/20 mt-1.5 text-center">
                        {t('dashboard.chatPage.disclaimer', 'AI can make mistakes. Always verify important information.')}
                        {' · '}<span className="text-surface-200/15">/cmd · $token · Ctrl+N</span>
                    </p>
                </div>
            </div>

            {/* ── AI Settings Side Panel ── */}
            {showSettingsPanel && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none" onClick={() => setShowSettingsPanel(false)} />
                    <div className={`fixed z-50 bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl shadow-black/30 overflow-hidden flex flex-col ${
                        isMobile ? 'inset-x-0 bottom-0 top-auto max-h-[85vh] rounded-t-2xl border-t' : 'right-0 top-0 bottom-0 w-80'
                    }`} onClick={e => e.stopPropagation()}>
                        {/* Mobile handle */}
                        {isMobile && (
                            <div className="flex justify-center pt-2 pb-1">
                                <div className="w-10 h-1 rounded-full bg-white/20" />
                            </div>
                        )}
                        {/* Panel Header */}
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                                    <Settings size={14} className="text-white" />
                                </div>
                                <h3 className="text-sm font-bold text-surface-100">{t('dashboard.chatPage.aiSettings', 'AI Settings')}</h3>
                            </div>
                            <button onClick={() => setShowSettingsPanel(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-white/5 px-4 gap-1 flex-shrink-0">
                            {SETTINGS_TABS.map(tab => (
                                <button key={tab.id} onClick={() => { setSettingsTab(tab.id); if (tab.id === 'keys') setApiKeyProvider(selectedProvider); }}
                                    className={`px-3 py-2.5 text-xs font-medium transition-all relative ${
                                        settingsTab === tab.id
                                            ? 'text-brand-400'
                                            : 'text-surface-200/50 hover:text-surface-200/80'
                                    }`}>
                                    <span>{tab.icon} {t(`dashboard.chatPage.settingsTab_${tab.labelKey}`, tab.labelKey)}</span>
                                    {settingsTab === tab.id && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-brand-400 rounded-full" />}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                            {/* ── Model Tab ── */}
                            {settingsTab === 'model' && (
                                <>
                                    {/* Provider */}
                                    <div>
                                        <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-2">{t('dashboard.chatPage.provider', 'Provider')}</p>
                                        <div className="space-y-1">
                                            {PROVIDER_OPTIONS.map(p => {
                                                // U1: Key status per provider
                                                const hasLocal = userApiKeys.some(k => {
                                                    const kp = (k.provider || '').toLowerCase();
                                                    return p.value === 'google' ? ['google', 'gemini'].includes(kp) : kp === p.value;
                                                });
                                                const hasServer = p.value === 'google' ? modelMeta.hasServerKey :
                                                    p.value === 'openai' ? modelMeta.hasServerOpenAiKey :
                                                    p.value === 'groq' ? modelMeta.hasServerGroqKey : false;
                                                const hasDbKey = p.value === 'google' ? modelMeta.hasPersonalKey :
                                                    p.value === 'openai' ? modelMeta.hasOpenAiKey :
                                                    p.value === 'groq' ? modelMeta.hasGroqKey : false;
                                                const keyDot = (hasLocal || hasDbKey) ? 'bg-emerald-400' : hasServer ? 'bg-amber-400' : 'bg-surface-200/20';
                                                const keyLabel = (hasLocal || hasDbKey) ? t('dashboard.chatPage.yourKey', 'Your key') : hasServer ? t('dashboard.chatPage.serverKey', 'Server') : t('dashboard.chatPage.noKey', 'No key');
                                                // U3: usage count for this provider
                                                const providerUsage = (MODEL_OPTIONS_BY_PROVIDER[p.value] || []).reduce((sum, m) => sum + (modelUsageStats[m.id] || 0), 0);
                                                return (
                                                    <button key={p.value} onClick={() => {
                                                        setSelectedProvider(p.value);
                                                        const providerModels = MODEL_OPTIONS_BY_PROVIDER[p.value] || [];
                                                        const firstModel = providerModels.length > 0 ? providerModels[0].id : selectedModel;
                                                        if (providerModels.length > 0) setSelectedModel(firstModel);
                                                        saveAiPrefs({ provider: p.value, model: firstModel });
                                                    }}
                                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                                                            selectedProvider === p.value
                                                                ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                                                : 'text-surface-200/70 hover:bg-white/5 border border-transparent'
                                                        }`}>
                                                        <div>
                                                            <span className="font-medium">{p.icon} {p.label}</span>
                                                            <span className="block text-[10px] text-surface-200/40">{t(`dashboard.chatPage.providerDesc.${p.value}`, p.desc)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {providerUsage > 0 && <span className="text-[9px] text-surface-200/30">{t('dashboard.chatPage.msgCount', '{count} msgs').replace('{count}', providerUsage)}</span>}
                                                            <div className="flex items-center gap-1">
                                                                <div className={`w-1.5 h-1.5 rounded-full ${keyDot}`} />
                                                                <span className="text-[8px] text-surface-200/30">{keyLabel}</span>
                                                            </div>
                                                            {selectedProvider === p.value && <Check size={12} className="text-brand-400" />}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>\n                                    </div>

                                    {/* Model — filtered by provider */}
                                    {(() => {
                                        const canChange = canChangeForProvider(selectedProvider);
                                        return (
                                            <>
                                                {!canChange && (
                                                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl px-3 py-2 mb-3">
                                                        <p className="text-[10px] text-amber-400/70 flex items-center gap-1.5">
                                                            <Lock size={10} />
                                                            {t('dashboard.chatPage.modelLockedHint', 'Model & thinking level are locked when using server API key. Add your own key in the "API Key" tab to unlock all options.')}
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                    <div>
                                        <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-2">{t('dashboard.chatPage.modelLabel', 'Model')}</p>
                                        <div className="space-y-1">
                                            {(MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || modelOptions).map(m => {
                                                const canChange = canChangeForProvider(selectedProvider);
                                                // Default model for each provider (first in list)
                                                const providerModels = MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || modelOptions;
                                                const defaultProviderModel = selectedProvider === 'google' ? (modelMeta.defaultModel || providerModels[0]?.id) : providerModels[0]?.id;
                                                const isDefault = m.id === defaultProviderModel;
                                                const isLocked = !canChange && !isDefault;
                                                return (
                                                    <button key={m.id}
                                                        onClick={() => { if (!isLocked) { setSelectedModel(m.id); saveAiPrefs({ model: m.id }); } }}
                                                        disabled={isLocked}
                                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                                                            isLocked ? 'opacity-40 cursor-not-allowed border border-transparent' :
                                                            selectedModel === m.id
                                                                ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                                                : 'text-surface-200/70 hover:bg-white/5 border border-transparent'
                                                        }`}>
                                                        <div>
                                                            <span className="font-medium">{m.icon} {m.label}</span>
                                                            <span className="block text-[10px] text-surface-200/40">{t(`dashboard.chatPage.modelDesc.${m.id}`, m.desc)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            {modelUsageStats[m.id] > 0 && <span className="text-[8px] text-surface-200/25 tabular-nums">{modelUsageStats[m.id]}</span>}
                                                            {isLocked && <Lock size={10} className="text-surface-200/30" />}
                                                            {isDefault && !isLocked && <span className="text-[8px] bg-brand-500/10 text-brand-400/70 px-1.5 py-0.5 rounded-full font-medium">{t('dashboard.chatPage.defaultBadge', 'DEFAULT')}</span>}
                                                            {selectedModel === m.id && !isLocked && <Check size={12} className="text-brand-400" />}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Thinking Level — filtered by provider & model */}
                                    {(() => {
                                        const providerCfg = REASONING_BY_PROVIDER[selectedProvider] || { supported: false };
                                        if (!providerCfg.supported) return null;
                                        let allowedLevels;
                                        if (providerCfg.byModel) {
                                            allowedLevels = providerCfg.byModel[selectedModel] ?? providerCfg.defaultLevels ?? [];
                                        } else {
                                            allowedLevels = providerCfg.levels || [];
                                        }
                                        if (!allowedLevels.length) return null;
                                        const filtered = THINKING_OPTIONS.filter(th => allowedLevels.includes(th.value));
                                        if (!filtered.length) return null;
                                        const canChangeThinking = canChangeForProvider(selectedProvider);
                                        const defaultThinking = 'medium';
                                        return (
                                            <div>
                                                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-2">{t('dashboard.chatPage.thinkingLevel', 'Thinking Level')}</p>
                                                <div className="grid grid-cols-2 gap-1">
                                                    {filtered.map(th => {
                                                        const isDefaultTh = th.value === defaultThinking;
                                                        const isLockedTh = !canChangeThinking && !isDefaultTh;
                                                        return (
                                                            <button key={th.value}
                                                                onClick={() => { if (!isLockedTh) { setSelectedThinking(th.value); saveAiPrefs({ thinkingLevel: th.value }); } }}
                                                                disabled={isLockedTh}
                                                                className={`px-3 py-2 rounded-xl text-xs transition-all text-left ${
                                                                    isLockedTh ? 'opacity-40 cursor-not-allowed border border-transparent' :
                                                                    selectedThinking === th.value
                                                                        ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                                                        : 'text-surface-200/70 hover:bg-white/5 border border-transparent'
                                                                }`}>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-medium">{th.icon} {t(`dashboard.chatPage.thinking_${th.value}`, th.label)}</span>
                                                                    <div className="flex items-center gap-1">
                                                                        {isLockedTh && <Lock size={9} className="text-surface-200/30" />}
                                                                        {isDefaultTh && !isLockedTh && <span className="text-[7px] bg-brand-500/10 text-brand-400/70 px-1 py-0.5 rounded-full font-medium">{t('dashboard.chatPage.defaultBadge', 'DEFAULT')}</span>}
                                                                    </div>
                                                                </div>
                                                                <span className="block text-[9px] text-surface-200/35 mt-0.5">{t(`dashboard.chatPage.thinkingDesc_${th.value}`, th.desc)}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </>
                            )}

                            {/* ── Persona Tab ── */}
                            {settingsTab === 'persona' && (
                                <>
                                    <div>
                                        <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-2">{t('dashboard.chatPage.aiPersonality', 'AI Personality')}</p>
                                        <div className="grid grid-cols-2 gap-1.5 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                                            {PERSONA_OPTIONS.map(p => (
                                                <button key={p.value} onClick={() => { setSelectedPersona(p.value); saveAiPrefs({ persona: p.value }); }}
                                                    className={`text-left px-3 py-2.5 rounded-xl transition-all ${
                                                        selectedPersona === p.value
                                                            ? 'bg-brand-500/10 border border-brand-500/20'
                                                            : 'hover:bg-white/5 border border-transparent'
                                                    }`}>
                                                    <span className="text-lg">{p.icon}</span>
                                                    <span className={`block text-[11px] font-bold mt-0.5 ${selectedPersona === p.value ? 'text-brand-400' : 'text-surface-100'}`}>{t(`dashboard.chatPage.persona_${p.value}`, p.label)}</span>
                                                    <span className="block text-[9px] text-surface-200/40 leading-tight">{t(`dashboard.chatPage.personaDesc_${p.value}`, p.desc)}</span>
                                                </button>
                                            ))}
                                            {/* U5: Custom persona option */}
                                            <button onClick={() => {
                                                setSelectedPersona('custom');
                                                saveAiPrefs({ persona: 'custom' });
                                            }}
                                                className={`text-left px-3 py-2.5 rounded-xl transition-all col-span-2 ${
                                                    selectedPersona === 'custom'
                                                        ? 'bg-brand-500/10 border border-brand-500/20'
                                                        : 'hover:bg-white/5 border border-transparent border-dashed'
                                                }`}>
                                                <span className="text-lg">✏️</span>
                                                <span className={`block text-[11px] font-bold mt-0.5 ${selectedPersona === 'custom' ? 'text-brand-400' : 'text-surface-100'}`}>{t('dashboard.chatPage.customPersona', 'Custom Persona')}</span>
                                                <span className="block text-[9px] text-surface-200/40 leading-tight">{t('dashboard.chatPage.customPersonaDesc', 'Write your own AI personality')}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* U5: Custom persona text input */}
                                    {selectedPersona === 'custom' && (
                                        <div className="bg-surface-800/40 border border-white/5 rounded-xl px-3 py-2.5 space-y-2">
                                            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">{t('dashboard.chatPage.customInstructions', 'Custom Instructions')}</p>
                                            <textarea
                                                value={customPersonaInput}
                                                onChange={(e) => {
                                                    setCustomPersonaInput(e.target.value);
                                                    try { localStorage.setItem('xbot_custom_persona', e.target.value); } catch {}
                                                }}
                                                placeholder={t('dashboard.chatPage.customPersonaPlaceholder', 'Describe how the AI should behave, its personality, tone, and style...')}
                                                className="w-full bg-surface-900/50 border border-white/5 rounded-lg px-3 py-2 text-[11px] text-surface-100 placeholder-surface-200/25 resize-none focus:outline-none focus:border-brand-500/30 transition-colors"
                                                rows={4}
                                            />
                                            <p className="text-[9px] text-surface-200/30">{customPersonaInput.length}/500 {t('dashboard.chatPage.chars', 'characters')}</p>
                                        </div>
                                    )}

                                    {/* U4: Persona preview */}
                                    {selectedPersona !== 'custom' && (
                                        <div className="bg-surface-800/40 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
                                            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">{t('dashboard.chatPage.preview', 'Preview')}</p>
                                            <div className="bg-surface-900/50 rounded-lg px-3 py-2 border border-white/[0.03]">
                                                <p className="text-[11px] text-surface-100/80 italic leading-relaxed">
                                                    "{PERSONA_PREVIEWS[selectedPersona] || PERSONA_PREVIEWS.default}"
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-surface-800/40 border border-white/5 rounded-xl px-3 py-2.5">
                                        <p className="text-[10px] text-surface-200/40 leading-relaxed">💡 {t('dashboard.chatPage.personaHint', 'Persona affects the AI\'s language style, personality, and response format. Changes apply to new messages only.')}</p>
                                    </div>
                                </>
                            )}

                            {/* ── API Keys Tab ── */}
                            {settingsTab === 'keys' && (
                                <>
                                    {/* Provider selector for keys */}
                                    <div>
                                        <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-2">{t('dashboard.chatPage.provider', 'Provider')}</p>
                                        <div className="flex gap-1">
                                            {PROVIDER_OPTIONS.map(p => (
                                                <button key={p.value} onClick={() => setApiKeyProvider(p.value)}
                                                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                                                        apiKeyProvider === p.value
                                                            ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                                                            : 'text-surface-200/50 hover:bg-white/5 border border-transparent'
                                                    }`}>
                                                    {p.icon} {p.value === 'google' ? 'Google' : p.value === 'openai' ? 'OpenAI' : 'Groq'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Existing keys */}
                                    {userApiKeys.filter(k => !apiKeyProvider || (k.provider || 'google') === apiKeyProvider).length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">{t('dashboard.chatPage.yourKeys', 'Your Keys')}</p>
                                            {userApiKeys.filter(k => !apiKeyProvider || (k.provider || 'google') === apiKeyProvider).map(k => (
                                                <div key={k.id} className="flex items-center justify-between bg-surface-800/60 rounded-xl px-3 py-2.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Key size={12} className="text-emerald-400 flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <span className="text-xs text-surface-200/70 truncate font-mono block">{k.maskedKey}</span>
                                                            <span className="text-[9px] text-surface-200/30">{k.provider || 'google'}</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => deleteApiKey(k.id)}
                                                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-200/30 hover:text-red-400 transition-colors flex-shrink-0"
                                                        title="Delete key">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add key form */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">{t('dashboard.chatPage.addKey', 'Add Key')}</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="password"
                                                value={apiKeyInput}
                                                onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
                                                placeholder={apiKeyProvider === 'google' ? 'AIzaSy...' : apiKeyProvider === 'openai' ? 'sk-...' : 'gsk_...'}
                                                className="flex-1 bg-surface-800/60 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-surface-100 placeholder-surface-200/30 focus:outline-none focus:border-brand-400/50 font-mono"
                                                onKeyDown={e => { if (e.key === 'Enter') addApiKey(); }}
                                            />
                                            <button onClick={addApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
                                                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                                    apiKeyLoading || !apiKeyInput.trim()
                                                        ? 'bg-surface-800/40 text-surface-200/20 cursor-not-allowed'
                                                        : 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                                                }`}>
                                                {apiKeyLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                                {t('dashboard.chatPage.add', 'Add')}
                                            </button>
                                        </div>
                                        {apiKeyError && (
                                            <p className="text-[10px] text-red-400 flex items-center gap-1">
                                                <X size={10} /> {apiKeyError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl px-3 py-2.5 space-y-1.5">
                                        <p className="text-[11px] text-amber-400/80 font-medium">{t('dashboard.chatPage.howToGetKeys', 'How to get API keys:')}</p>
                                        <p className="text-[10px] text-surface-200/50 leading-relaxed">
                                            <strong className="text-surface-200/70">Google:</strong> <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-brand-400 hover:text-brand-300">aistudio.google.com</a><br/>
                                            <strong className="text-surface-200/70">OpenAI:</strong> <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-brand-400 hover:text-brand-300">platform.openai.com</a><br/>
                                            <strong className="text-surface-200/70">Groq:</strong> <a href="https://console.groq.com/keys" target="_blank" rel="noopener" className="text-brand-400 hover:text-brand-300">console.groq.com</a>
                                        </p>
                                        <p className="text-[10px] text-emerald-400/60 flex items-center gap-1">🔒 {t('dashboard.chatPage.keysLocalOnly', 'Keys are stored locally on your device only — never sent to our server.')}</p>
                                    </div>

                                    {/* Status */}
                                    {(() => {
                                        const canChange = canChangeForProvider(selectedProvider);
                                        return (
                                            <div className={`rounded-xl px-3 py-2.5 ${
                                                canChange ? 'bg-emerald-500/5 border border-emerald-500/10' :
                                                'bg-amber-500/5 border border-amber-500/10'
                                            }`}>
                                                {canChange ? (
                                                    <div className="flex items-center gap-2">
                                                        <Key size={12} className="text-emerald-400 flex-shrink-0" />
                                                        <span className="text-[10px] text-emerald-400/80 font-medium">✓ {t('dashboard.chatPage.personalKeyActive', 'Your API key is active — all models & thinking levels unlocked')}</span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <Lock size={12} className="text-amber-400/70 flex-shrink-0" />
                                                            <span className="text-[10px] text-amber-400/70 font-medium">{t('dashboard.chatPage.serverKeyLocked', 'Server key — limited to default model & thinking level')}</span>
                                                        </div>
                                                        <p className="text-[9px] text-surface-200/40 leading-relaxed pl-5">
                                                            {t('dashboard.chatPage.unlockHint', 'Go to the "API Key" tab and add your own key to unlock all models, thinking levels, and get faster responses with higher quotas.')}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
        {/* AI Trader Panel */}
        <AiTraderPanel visible={showAiTrader} onClose={() => setShowAiTrader(false)} />

        {/* ── Share Link Modal ── */}
        {shareModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setShareModal(null)}>
                <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-brand-500/15 flex items-center justify-center">
                                <Share2 size={14} className="text-brand-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-surface-100">{t('dashboard.chatPage.shareChat', 'Share Chat')}</h3>
                                <p className="text-[10px] text-surface-200/40 truncate max-w-[200px]">{shareModal.title}</p>
                            </div>
                        </div>
                        <button onClick={() => setShareModal(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-surface-100 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="px-5 py-5 space-y-4">
                        {shareModal.loading ? (
                            <div className="flex items-center justify-center py-6 gap-3">
                                <Loader2 size={16} className="text-brand-400 animate-spin" />
                                <span className="text-sm text-surface-200/50">{t('dashboard.chatPage.shareGenerating', 'Creating public link...')}</span>
                            </div>
                        ) : shareModal.url ? (
                            <>
                                <p className="text-xs text-surface-200/50">{t('dashboard.chatPage.shareDesc', 'Anyone with this link can view a read-only snapshot of this conversation.')}</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={shareModal.url}
                                        className="flex-1 bg-surface-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-surface-200/80 select-all focus:outline-none focus:border-brand-500/30"
                                        onFocus={e => e.target.select()}
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard?.writeText(shareModal.url);
                                            const btn = document.getElementById('share-copy-btn');
                                            if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
                                        }}
                                        id="share-copy-btn"
                                        className="px-4 py-2.5 rounded-xl bg-brand-500/20 border border-brand-500/20 text-brand-400 text-xs font-semibold hover:bg-brand-500/30 transition-colors flex-shrink-0"
                                    >Copy</button>
                                </div>
                                <div className="flex items-center gap-3 pt-1">
                                    <a href={shareModal.url} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-[11px] text-brand-400/70 hover:text-brand-400 transition-colors">
                                        <ExternalLink size={11} /> {t('dashboard.chatPage.sharePreview', 'Preview')}
                                    </a>
                                    <span className="text-surface-200/10">|</span>
                                    <span className="text-[10px] text-surface-200/25 flex items-center gap-1">
                                        <Lock size={9} /> {t('dashboard.chatPage.shareReadOnly', 'Read-only • Snapshot')}
                                    </span>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        )}

        {/* Animation CSS */}
        <style>{`
            @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            .animate-slide-in-right { animation: slideInRight 0.25s ease-out; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        `}</style>
        </>
    );
}
