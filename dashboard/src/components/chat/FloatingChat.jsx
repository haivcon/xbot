import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, X, Send, Loader2, Maximize2 } from 'lucide-react';
import api from '@/api/client';

/* ─── Lightweight Markdown renderer for mini chat ─── */
function renderMiniMd(text) {
    if (!text) return '';
    let s = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript\s*:/gi, '');
    // Code blocks
    const blocks = [];
    s = s.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = blocks.length;
        blocks.push(`<pre style="background:rgba(255,255,255,0.05);padding:6px 8px;border-radius:6px;overflow-x:auto;font-size:10px;margin:4px 0"><code>${code.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`);
        return `%%CB_${idx}%%`;
    });
    s = s
        .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:10px">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => /javascript:/i.test(url) ? t : `<a href="${url}" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:underline">${t}</a>`)
        .replace(/^> (.+)$/gm, '<div style="border-left:2px solid rgba(255,255,255,0.15);padding-left:8px;color:rgba(255,255,255,0.5);margin:2px 0">$1</div>')
        .replace(/^### (.+)$/gm, '<strong style="font-size:11px">$1</strong>')
        .replace(/^## (.+)$/gm, '<strong style="font-size:12px">$1</strong>')
        .replace(/\n/g, '<br/>');
    blocks.forEach((b, i) => { s = s.replace(`%%CB_${i}%%`, b); });
    return s;
}

/**
 * FloatingChat — Persistent chat bubble on non-chat pages.
 * Opens a mini chat panel with the last active conversation context.
 */
export default function FloatingChat() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [unread, setUnread] = useState(0);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);
            setUnread(0);
        }
    }, [open]);

    const sendMessage = useCallback(async () => {
        const msg = input.trim();
        if (!msg || loading) return;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
        setLoading(true);

        try {
            let fullText = '';
            const assistantTs = Date.now();
            setMessages(prev => [...prev, { role: 'assistant', content: '', ts: assistantTs }]);

            await api.streamChatMessage(msg, conversationId, {
                onTextDelta: (text) => {
                    fullText += text;
                    setMessages(prev => {
                        const copy = [...prev];
                        const last = copy[copy.length - 1];
                        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: fullText };
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
                        const last = copy[copy.length - 1];
                        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: `❌ ${data.error}` };
                        return copy;
                    });
                },
            });
        } catch (err) {
            setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: `❌ ${err.message}` };
                return copy;
            });
        } finally {
            setLoading(false);
        }
    }, [input, loading, conversationId, open]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    return (
        <>
            {/* Floating bubble */}
            <button
                onClick={() => setOpen(!open)}
                className={`fixed bottom-28 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center
                    transition-all duration-300 shadow-2xl
                    ${open
                        ? 'bg-surface-700 hover:bg-surface-600 rotate-0'
                        : 'bg-gradient-to-br from-brand-500 to-cyan-500 floating-chat-btn'
                    }`}
            >
                {open
                    ? <X size={20} className="text-surface-200" />
                    : <Bot size={22} className="text-white" />
                }
                {/* Unread badge */}
                {!open && unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                        {unread}
                    </span>
                )}
            </button>

            {/* Mini chat panel */}
            {open && (
                <div className="fixed bottom-44 right-6 z-40 w-80 sm:w-96 h-[420px] rounded-2xl
                    bg-surface-900 border border-white/10 shadow-2xl shadow-black/40
                    flex flex-col overflow-hidden animate-fadeIn">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-surface-800/60">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center">
                            <Bot size={14} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-xs font-semibold text-surface-100">AI Assistant</h3>
                            <span className="text-[9px] text-emerald-400/70 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-emerald-400" /> Online
                            </span>
                        </div>
                        <button onClick={() => { navigate('/chat'); setOpen(false); }}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-surface-200"
                            title="Open full chat">
                            <Maximize2 size={14} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center py-8">
                                <Bot size={28} className="mx-auto text-brand-400/40 mb-2" />
                                <p className="text-xs text-surface-200/40">Ask anything about crypto, tokens, wallets...</p>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role !== 'user' && (
                                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                        <Bot size={10} className="text-emerald-400" />
                                    </div>
                                )}
                                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-brand-500/15 text-surface-100'
                                        : 'bg-surface-800/60 text-surface-200/80'
                                }`}>
                                    {msg.role === 'user'
                                        ? <span>{msg.content || '...'}</span>
                                        : msg.content
                                            ? <div dangerouslySetInnerHTML={{ __html: renderMiniMd(msg.content) }} />
                                            : <span className="text-surface-200/30">...</span>
                                    }
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-white/5 flex items-end gap-2">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            className="flex-1 px-3 py-2 rounded-lg bg-surface-800/60 border border-white/5 text-xs text-surface-100
                                placeholder:text-surface-200/25 focus:outline-none focus:border-brand-500/30 transition-colors"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={loading || !input.trim()}
                            className={`p-2 rounded-lg transition-all flex-shrink-0 ${input.trim() && !loading
                                ? 'bg-brand-500 hover:bg-brand-600 text-white'
                                : 'bg-surface-800/40 text-surface-200/20 cursor-not-allowed'
                            }`}>
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
