import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Bot, Send, Loader2, Sparkles, X, Minus, Maximize2, Minimize2, Trash2,
    Wallet, BarChart3, Fuel, TrendingUp, ArrowRightLeft, AlertTriangle,
    Search, Shield, Users, Store, Mic, Brain, Copy, Repeat, History, MessageSquare
} from 'lucide-react';

/* ─── Markdown renderer (XSS-safe) ─── */
function renderMd(text) {
    if (!text) return '';
    let safe = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/\n?\[Used: [\w, ]+\]/g, '');
    const codeBlocks = [];
    safe = safe.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        const escaped = code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(
            `<div class="chat-code-wrapper" style="position:relative">`
            + `<button class="copy-code-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code').textContent).then(()=>{this.textContent='✓';setTimeout(()=>{this.textContent='📋'},1200)})" title="Copy code" style="position:absolute;top:4px;right:4px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.5);z-index:1;transition:all 0.2s">📋</button>`
            + `<pre class="chat-code-block"><code class="language-${lang}">${escaped}</code></pre></div>`
        );
        return `%%CB_${idx}%%`;
    });
    safe = safe
        .replace(/^-{3,}$/gm, '<hr class="chat-hr"/>')
        .replace(/((?:^[-*] .+$\n?)+)/gm, (block) => {
            const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`);
            return `<ul class="chat-list">${items.join('')}</ul>`;
        })
        .replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
            const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`);
            return `<ol class="chat-list chat-ol">${items.join('')}</ol>`;
        });

    // ── Multi-chain address & tx hash auto-linking ──
    const chainMap = {
        'ethereum': 'eth', 'erc-20': 'eth', 'erc20': 'eth',
        'bsc': 'bsc', 'bnb chain': 'bsc', 'binance smart': 'bsc',
        'arbitrum': 'arbitrum', 'polygon': 'polygon',
        'base chain': 'base', 'base network': 'base',
        'avalanche': 'avax', 'avax': 'avax',
        'optimism': 'optimism',
        'x layer': 'xlayer', 'xlayer': 'xlayer', 'oktc': 'xlayer',
        'solana': 'solana',
    };
    let evmChain = 'xlayer', solChain = 'solana';
    const lt = text.toLowerCase();
    for (const [kw, ch] of Object.entries(chainMap)) {
        if (lt.includes(kw)) { if (ch === 'solana') solChain = ch; else evmChain = ch; break; }
    }
    safe = safe.replace(/(^|[\s(`])0x([a-fA-F0-9]{64})(?=[\s,.)}`<]|$)/gm, (_, pre, hex) => {
        const hash = '0x' + hex;
        return `${pre}<a href="https://www.okx.com/web3/explorer/${evmChain}/tx/${hash}" target="_blank" rel="noopener" class="chat-link">${hash}</a>`;
    });
    safe = safe.replace(/(^|[\s(`])0x([a-fA-F0-9]{40,42})(?=[\s,.)}`<]|$)/gm, (_, pre, hex) => {
        const addr = '0x' + hex;
        return `${pre}<a href="https://www.okx.com/web3/explorer/${evmChain}/address/${addr}" target="_blank" rel="noopener" class="chat-link">${addr}</a>`;
    });
    safe = safe.replace(/(^|[\s(:`])([1-9A-HJ-NP-Za-km-z]{32,44})(?=[\s,.)}`<]|$)/gm, (_, pre, addr) => {
        if (/^[a-z]+$/.test(addr)) return `${pre}${addr}`;
        return `${pre}<a href="https://www.okx.com/web3/explorer/${solChain}/address/${addr}" target="_blank" rel="noopener" class="chat-link">${addr}</a>`;
    });

    // Process inline markdown (after address linking)
    safe = safe
        .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => /javascript\s*:/i.test(url) ? t : `<a href="${url}" target="_blank" rel="noopener" class="chat-link">${t}</a>`)
        .replace(/^> (.+)$/gm, '<blockquote class="chat-blockquote">$1</blockquote>')
        .replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>');

    // Collapse long repeated characters (prevent horizontal overflow)
    safe = safe.replace(/[_\-=~.·]{10,}/g, '<hr class="chat-hr"/>');

    safe = safe.replace(/\n/g, '<br/>');
    codeBlocks.forEach((block, i) => { safe = safe.replace(`%%CB_${i}%%`, block); });
    return safe;
}

/* ─── Tool result visual cards ─── */
function ToolResultCard({ toolCalls }) {
    if (!toolCalls?.length) return null;
    const iconMap = {
        get_gas_price: Fuel,
        get_token_price: TrendingUp,
        get_market_price: TrendingUp,
        get_portfolio: Wallet,
        get_wallet_balance: Wallet,
        swap_tokens: ArrowRightLeft,
        get_swap_quote: ArrowRightLeft,
        execute_swap: ArrowRightLeft,
        get_signal_list: AlertTriangle,
        get_token_info: BarChart3,
        search_token: Search,
        get_token_security: Shield,
        deep_research_token: Brain,
        manage_auto_trading: Repeat,
        scan_arbitrage: TrendingUp,
        manage_copy_trading: Users,
        browse_marketplace: Store,
    };
    return (
        <div className="flex flex-wrap gap-1 mb-1.5">
            {toolCalls.map((tc, i) => {
                const Icon = iconMap[tc.name] || Sparkles;
                const isPriceTool = /price|market|token_info|portfolio/.test(tc.name);
                return (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                        text-[9px] font-medium bg-amber-500/8 text-amber-400/80 border border-amber-500/10">
                        <Icon size={9} />
                        {tc.name?.replace(/_/g, ' ')}
                        {/* D1: Sparkline mini chart for price tools */}
                        {isPriceTool && (
                            <svg viewBox="0 0 40 12" width="40" height="12" className="ml-0.5">
                                <polyline
                                    fill="none"
                                    stroke="#34d399"
                                    strokeWidth="1.2"
                                    points="0,8 5,6 10,9 15,4 20,5 25,3 30,6 35,2 40,4"
                                />
                            </svg>
                        )}
                    </span>
                );
            })}
        </div>
    );
}

/* ─── Message bubble ─── */
function MsgBubble({ msg }) {
    const isUser = msg.role === 'user';
    return (
        <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''} animate-fadeIn`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden ${
                isUser ? 'bg-brand-500/20' : 'bg-surface-800 ring-1 ring-emerald-500/30'}`}>
                {isUser
                    ? <span className="text-[10px] text-brand-400 font-bold">U</span>
                    : <img src="/XBOT-logo.png" alt="XBOT" className="w-full h-full object-cover" />}
            </div>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isUser
                    ? 'bg-brand-500/15 border border-brand-500/15'
                    : 'bg-surface-800/60 border border-white/5'}`}>
                {msg.toolCalls && <ToolResultCard toolCalls={msg.toolCalls} />}
                {isUser ? (
                    <p className="text-xs text-surface-100 whitespace-pre-wrap">{msg.content}</p>
                ) : (
                    <div className="text-xs text-surface-200/90 chat-content leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
                )}
            </div>
        </div>
    );
}

/* ─── Typing dots ─── */
function TypingDots() {
    return (
        <div className="flex gap-2 animate-fadeIn">
            <div className="w-6 h-6 rounded-full bg-surface-800 ring-1 ring-emerald-500/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src="/XBOT-logo.png" alt="XBOT" className="w-full h-full object-cover" />
            </div>
            <div className="bg-surface-800/60 border border-white/5 rounded-xl px-3 py-2">
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
}

/* ─── D2: Interactive Trade Confirmation Card (in ChatWidget) ─── */
function TradeConfirmCard({ data, onConfirm, onCancel }) {
    if (!data) return null;
    return (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 my-2 animate-fadeIn">
            <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft size={14} className="text-purple-400" />
                <span className="text-xs font-semibold text-purple-300">Swap Confirmation</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-surface-200/80 mb-2">
                <span className="bg-surface-800/60 px-2 py-1 rounded-lg">{data.fromAmount} {data.fromToken}</span>
                <span className="text-surface-200/30">→</span>
                <span className="bg-surface-800/60 px-2 py-1 rounded-lg">≈ {data.toAmount} {data.toToken}</span>
            </div>
            {data.priceImpact && (
                <div className="text-[10px] text-amber-400/70 mb-2">⚠️ Price impact: {data.priceImpact}</div>
            )}
            <div className="flex gap-2">
                <button onClick={onConfirm}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/20
                        text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/30 transition-colors">
                    ✅ Confirm
                </button>
                <button onClick={onCancel}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/15
                        text-red-400/70 text-[10px] font-medium hover:bg-red-500/20 transition-colors">
                    ❌ Cancel
                </button>
            </div>
        </div>
    );
}

/* ─── Quick suggestion chips (D6: Context-Aware) ─── */
const SUGGESTIONS = [
    { icon: '💰', text: 'Check my portfolio' },
    { icon: '📊', text: 'Top trending tokens' },
    { icon: '⛽', text: 'Gas prices' },
    { icon: '🐳', text: 'Whale signals' },
    { icon: '🔬', text: 'Deep research' },
    { icon: '📈', text: 'Scan arbitrage' },
    { icon: '👥', text: 'Copy trading board' },
    { icon: '🤖', text: 'Auto trading status' },
];

/* ═══════════════════════════════════════
   Main Floating Chat Widget
   ═══════════════════════════════════════ */
export default function ChatWidget() {
    const { t } = useTranslation();
    const location = useLocation();
    const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
    const [open, setOpen] = useState(false);

    // Auto-close widget when navigating to full chat page
    useEffect(() => {
        if (isChatRoute) setOpen(false);
    }, [isChatRoute]);
    
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [unread, setUnread] = useState(0);
    
    const [showHistory, setShowHistory] = useState(false);
    const [activeWidgetMenu, setActiveWidgetMenu] = useState(null);
    const [historyConvs, setHistoryConvs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom, showHistory]);
    useEffect(() => { if (open && !showHistory) { inputRef.current?.focus(); setUnread(0); } }, [open, showHistory]);

    const sendMessage = async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;
        setInput('');
        if (inputRef.current) inputRef.current.style.height = '36px';
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setMessages(prev => [...prev, { role: 'user', content: msg }]);
        setLoading(true);

        try {
            let fullText = '';
            const streamToolCalls = [];
            // Add placeholder assistant message for streaming
            const assistantIdx = { current: -1 };
            setMessages(prev => {
                assistantIdx.current = prev.length;
                return [...prev, { role: 'assistant', content: '', toolCalls: [] }];
            });

            await api.streamChatMessage(msg, conversationId, {
                signal: controller.signal,
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
                    if (!open) setUnread(prev => prev + 1);
                },
                onError: (data) => {
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) copy[assistantIdx.current] = { ...copy[assistantIdx.current], content: `❌ ${data.error || 'Stream failed'}` };
                        return copy;
                    });
                },
            });
        } catch (err) {
            if (controller.signal.aborted) return;
            setMessages(prev => {
                const copy = [...prev];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].role === 'assistant' && !copy[lastIdx].content) {
                    copy[lastIdx] = { ...copy[lastIdx], content: `❌ ${err.message || 'Failed to get response'}` };
                    return copy;
                }
                return [...prev, { role: 'assistant', content: `❌ ${err.message || 'Failed to get response'}` }];
            });
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
                inputRef.current?.focus();
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const clearChat = () => {
        abortRef.current?.abort();
        setMessages([]);
        setConversationId(null);
        setLoading(false);
        setShowHistory(false);
    };

    const toggleHistory = async () => {
        if (!showHistory) {
            setLoadingHistory(true);
            setShowHistory(true);
            try {
                const res = await api.getChatHistory();
                setHistoryConvs(res.conversations || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingHistory(false);
            }
        } else {
            setShowHistory(false);
        }
    };

    const loadOldChat = async (convId) => {
        setLoading(true);
        setShowHistory(false);
        abortRef.current?.abort();
        
           const deleteOldChat = async (convId, e) => {
        e.stopPropagation();
        try {
            await api.clearChat(convId);
            setHistoryConvs(prev => prev.filter(c => c.id !== convId));
            if (convId === conversationId) {
                setMessages([]);
                setConversationId(null);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Panel dimensions
    const panelClass = expanded
        ? 'fixed inset-4 sm:inset-8 z-[60]'
        : 'fixed bottom-20 right-4 sm:right-6 w-[360px] sm:w-[400px] h-[520px] sm:h-[560px] z-[60]';

    // Hide entirely on /chat page
    if (isChatRoute) return null;

    return (
        <>
            {/* ── Floating Bubble ── */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    className="fixed bottom-8 right-5 sm:bottom-10 sm:right-6 z-[59]
                        w-14 h-14 rounded-full
                        shadow-xl shadow-brand-500/30
                        flex items-center justify-center overflow-hidden
                        hover:scale-110 hover:shadow-brand-500/50
                        active:scale-95 transition-all duration-200
                        group bg-surface-900 ring-2 ring-brand-500/50"
                    aria-label="Open AI Chat"
                >
                    <img src="/xbot-logo.png" alt="XBOT" className="w-[44px] h-[44px] rounded-full object-cover group-hover:scale-110 transition-transform" />

                    {/* Unread badge */}
                    {unread > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px]
                            font-bold flex items-center justify-center ring-2 ring-surface-900 animate-bounce">
                            {unread}
                        </span>
                    )}

                    {/* Pulse ring */}
                    <span className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping opacity-30 pointer-events-none" />
                </button>
            )}

            {/* ── Chat Panel ── */}
            {open && (
                <div className={`${panelClass} flex flex-col
                    bg-surface-900/95 backdrop-blur-2xl
                    border border-white/10 rounded-2xl
                    shadow-2xl shadow-black/40
                    overflow-hidden animate-fadeIn`}
                >
                    {/* Header */}
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5
                        bg-gradient-to-r from-brand-500/5 to-emerald-500/5 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-surface-800 ring-1 ring-emerald-500/30 flex items-center justify-center overflow-hidden">
                            <img src="/xbot-logo.png" alt="XBOT" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-surface-100">XBOT</h3>
                            <p className="text-[9px] text-emerald-400/70 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                                Online — Gemini + OnchainOS
                            </p>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <button onClick={toggleHistory}
                                className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-brand-500/15 text-brand-400' : 'hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60'}`}
                                title="Chat history">
                                <History size={13} />
                            </button>
                            <button onClick={() => setExpanded(!expanded)}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60 transition-colors hidden sm:block">
                                {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                            </button>
                            <button onClick={clearChat}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60 transition-colors"
                                title="New chat">
                                <Sparkles size={13} />
                            </button>
                            <button onClick={() => { setOpen(false); setExpanded(false); }}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-200/30 hover:text-red-400 transition-colors">
                                <X size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Messages & History */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth custom-scrollbar">
                        {showHistory ? (
                            <div className="flex flex-col gap-2 animate-fadeIn">
                                <div className="text-[10px] font-semibold text-surface-200/40 uppercase tracking-widest px-1 mb-1">
                                    Recent Conversations
                                </div>
                                {loadingHistory ? (
                                    <div className="flex justify-center p-8"><Loader2 size={16} className="text-brand-400 animate-spin" /></div>
                                ) : historyConvs.length === 0 ? (
                                    <div className="text-center p-8 text-xs text-surface-200/40">No chat history found.</div>
                                ) : (
                                    historyConvs.map(conv => (
                                        <div key={conv.id} className="relative group">
                                            <button onClick={() => loadOldChat(conv.id)}
                                                className={`w-full text-left p-3 pr-10 rounded-xl border transition-all ${
                                                    conv.id === conversationId 
                                                        ? 'bg-brand-500/10 border-brand-500/20' 
                                                        : 'bg-surface-800/40 border-white/5 hover:bg-surface-800 hover:border-white/10'
                                                }`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <MessageSquare size={12} className={conv.id === conversationId ? 'text-brand-400' : 'text-surface-200/40'} />
                                                    <span className={`text-xs font-semibold truncate ${conv.id === conversationId ? 'text-brand-400' : 'text-surface-100'}`}>
                                                        {conv.title || 'Conversation'}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-surface-200/50 line-clamp-2 pl-5">
                                                    {conv.lastMessage || '...'}
                                                </div>
                                            </button>
                                            {/* Delete button — always visible */}
                                            <button
                                                onClick={(e) => deleteOldChat(conv.id, e)}
                                                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all z-10
                                                    ${conv.id === conversationId ? 'text-red-400 hover:bg-red-500/20' : 'text-surface-200/30 hover:text-red-400 hover:bg-red-500/10'}
                                                    opacity-70 hover:opacity-100`}
                                                title="Delete Chat">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 animate-fadeIn">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/15 to-emerald-500/15
                                    border border-white/5 flex items-center justify-center overflow-hidden ring-1 ring-emerald-500/30">
                                    <img src="/xbot-logo.png" alt="XBOT" className="w-full h-full object-cover" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-surface-100 mb-0.5">XBOT Trading Assistant</p>
                                    <p className="text-[10px] text-surface-200/30 max-w-[250px] mx-auto">
                                        {t('dashboard.chatPage.widgetSubtitle', 'Ask about tokens, swap, signals, gas, portfolio — I execute on-chain tools for you.')}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 w-full mt-2">
                                    {SUGGESTIONS.map((s, i) => (
                                        <button key={i}
                                            onClick={() => sendMessage(s.text)}
                                            className="text-left px-2.5 py-2 rounded-lg border border-white/5 bg-surface-800/30
                                                hover:bg-white/5 hover:border-brand-500/15 transition-all text-[10px]
                                                text-surface-200/50 hover:text-surface-200/80">
                                            <span className="mr-1">{s.icon}</span>{t(`dashboard.chatPage.suggestions.${i}`, s.text)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, i) => <MsgBubble key={i} msg={msg} />)}
                                {loading && <TypingDots />}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>

                    {/* Input */}
                    {!showHistory && (
                        <div className="p-2.5 border-t border-white/5 bg-surface-900/80 animate-fadeIn">
                            <div className="flex items-end gap-1.5">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask anything..."
                                    rows={1}
                                    className="flex-1 px-3 py-2 rounded-xl bg-surface-800/60 border border-white/5
                                        text-xs text-surface-100 placeholder:text-surface-200/20
                                        focus:outline-none focus:border-brand-500/25 focus:ring-1 focus:ring-brand-500/15
                                        resize-none transition-all"
                                    style={{ maxHeight: '80px', minHeight: '36px' }}
                                    onInput={(e) => {
                                        e.target.style.height = '36px';
                                        e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
                                    }}
                                />
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || loading}
                                    className={`p-2 rounded-xl transition-all flex-shrink-0 ${
                                        input.trim() && !loading
                                            ? 'bg-gradient-to-r from-brand-500 to-emerald-500 text-white shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40'
                                            : 'bg-surface-800/40 text-surface-200/15 cursor-not-allowed'
                                    }`}>
                                    {loading
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <Send size={14} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Backdrop for expanded mode */}
            {open && expanded && (
                <div className="fixed inset-0 bg-black/40 z-[55]" onClick={() => setExpanded(false)} />
            )}
        </>
    );
}

export default ChatWidget;
