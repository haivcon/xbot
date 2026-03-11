import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/api/client';
import {
    Bot, Send, Loader2, Sparkles, X, Minus, Maximize2, Minimize2,
    Wallet, BarChart3, Fuel, TrendingUp, ArrowRightLeft, AlertTriangle
} from 'lucide-react';

/* ─── Markdown renderer (XSS-safe) ─── */
function renderMd(text) {
    if (!text) return '';
    let safe = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    const codeBlocks = [];
    safe = safe.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`<pre class="chat-code-block"><code class="language-${lang}">${code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
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
        })
        .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => /javascript\s*:/i.test(url) ? t : `<a href="${url}" target="_blank" rel="noopener" class="chat-link">${t}</a>`)
        .replace(/^> (.+)$/gm, '<blockquote class="chat-blockquote">$1</blockquote>')
        .replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>')
        .replace(/\n/g, '<br/>');
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
        swap_tokens: ArrowRightLeft,
        get_signal_list: AlertTriangle,
        get_token_info: BarChart3,
    };
    return (
        <div className="flex flex-wrap gap-1 mb-1.5">
            {toolCalls.map((tc, i) => {
                const Icon = iconMap[tc.name] || Sparkles;
                return (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                        text-[9px] font-medium bg-amber-500/8 text-amber-400/80 border border-amber-500/10">
                        <Icon size={9} />
                        {tc.name?.replace(/_/g, ' ')}
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
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                isUser ? 'bg-brand-500/20' : 'bg-emerald-500/20'}`}>
                {isUser
                    ? <span className="text-[10px] text-brand-400 font-bold">U</span>
                    : <Bot size={11} className="text-emerald-400" />}
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
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Bot size={11} className="text-emerald-400" />
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

/* ─── Quick suggestion chips ─── */
const SUGGESTIONS = [
    { icon: '💰', text: 'Check my portfolio' },
    { icon: '📊', text: 'Top trending tokens' },
    { icon: '⛽', text: 'Gas prices' },
    { icon: '🐳', text: 'Whale signals' },
];

/* ═══════════════════════════════════════
   Main Floating Chat Widget
   ═══════════════════════════════════════ */
export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [unread, setUnread] = useState(0);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);
    useEffect(() => { if (open) { inputRef.current?.focus(); setUnread(0); } }, [open]);

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
            const data = await api.sendChatMessage(msg, conversationId);
            if (controller.signal.aborted) return;
            setConversationId(data.conversationId);
            const reply = {
                role: 'assistant',
                content: data.reply,
                toolCalls: data.toolCalls
            };
            setMessages(prev => [...prev, reply]);
        } catch (err) {
            if (controller.signal.aborted) return;
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ ${err.message || 'Failed to get response'}`
            }]);
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
    };

    // Panel dimensions
    const panelClass = expanded
        ? 'fixed inset-4 sm:inset-8 z-[60]'
        : 'fixed bottom-20 right-4 sm:right-6 w-[360px] sm:w-[400px] h-[520px] sm:h-[560px] z-[60]';

    return (
        <>
            {/* ── Floating Bubble ── */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[59]
                        w-14 h-14 rounded-full
                        bg-gradient-to-br from-brand-500 to-emerald-500
                        shadow-xl shadow-brand-500/30
                        flex items-center justify-center
                        hover:scale-110 hover:shadow-brand-500/50
                        active:scale-95 transition-all duration-200
                        group"
                    aria-label="Open AI Chat"
                >
                    <Bot size={24} className="text-white group-hover:scale-110 transition-transform" />

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
                        bg-gradient-to-r from-brand-500/5 to-emerald-500/5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center">
                            <Bot size={15} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-surface-100">AI Assistant</h3>
                            <p className="text-[9px] text-emerald-400/70 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                                Online — Gemini + OnchainOS
                            </p>
                        </div>
                        <div className="flex items-center gap-0.5">
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

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/15 to-emerald-500/15
                                    border border-white/5 flex items-center justify-center">
                                    <Sparkles size={22} className="text-brand-400" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-surface-100 mb-0.5">AI Trading Assistant</p>
                                    <p className="text-[10px] text-surface-200/30 max-w-[250px]">
                                        Ask about tokens, swap, signals, gas, portfolio — I execute on-chain tools for you.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 w-full">
                                    {SUGGESTIONS.map((s, i) => (
                                        <button key={i}
                                            onClick={() => sendMessage(s.text)}
                                            className="text-left px-2.5 py-2 rounded-lg border border-white/5 bg-surface-800/30
                                                hover:bg-white/5 hover:border-brand-500/15 transition-all text-[10px]
                                                text-surface-200/50 hover:text-surface-200/80">
                                            <span className="mr-1">{s.icon}</span>{s.text}
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
                    <div className="p-2.5 border-t border-white/5 bg-surface-900/80">
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
                </div>
            )}

            {/* Backdrop for expanded mode */}
            {open && expanded && (
                <div className="fixed inset-0 bg-black/40 z-[55]" onClick={() => setExpanded(false)} />
            )}
        </>
    );
}
