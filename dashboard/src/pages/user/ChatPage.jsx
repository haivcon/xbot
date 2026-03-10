import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    MessageSquare, Send, Trash2, Plus, ChevronLeft, Bot, User, Loader2,
    Sparkles, X, Clock, ArrowDown
} from 'lucide-react';

/* ─── Markdown renderer (lightweight) ─── */
function renderMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/```([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>')
        .replace(/^> (.+)$/gm, '<blockquote class="chat-blockquote">$1</blockquote>')
        .replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>')
        .replace(/\n/g, '<br/>');
    return html;
}

/* ─── Single message bubble ─── */
function ChatBubble({ message }) {
    const isUser = message.role === 'user';
    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fadeIn`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser
                    ? 'bg-brand-500/20 ring-1 ring-brand-500/30'
                    : 'bg-emerald-500/20 ring-1 ring-emerald-500/30'
                }`}>
                {isUser
                    ? <User size={14} className="text-brand-400" />
                    : <Bot size={14} className="text-emerald-400" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                    ? 'bg-brand-500/15 border border-brand-500/20'
                    : 'bg-surface-800/60 border border-white/5'
                }`}>
                {isUser ? (
                    <p className="text-sm text-surface-100 whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <div
                        className="text-sm text-surface-200/90 chat-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                    />
                )}
            </div>
        </div>
    );
}

/* ─── Tool call indicator ─── */
function ToolCallBadge({ toolCalls }) {
    if (!toolCalls?.length) return null;
    return (
        <div className="flex items-center gap-2 px-4 py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70 bg-amber-400/5 rounded-full px-2.5 py-1 border border-amber-400/10">
                <Sparkles size={10} />
                {toolCalls.map((tc, i) => (
                    <span key={i} className="font-mono">{tc.name}</span>
                ))}
            </div>
        </div>
    );
}

/* ─── Typing indicator ─── */
function TypingIndicator() {
    return (
        <div className="flex gap-3 animate-fadeIn">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <Bot size={14} className="text-emerald-400" />
            </div>
            <div className="bg-surface-800/60 border border-white/5 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                    <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
}

/* ─── Main ChatPage ─── */
export default function ChatPage() {
    const { t } = useTranslation();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showScroll, setShowScroll] = useState(false);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading, scrollToBottom]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Scroll detection
    useEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            setShowScroll(distanceFromBottom > 200);
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    // Load conversations list
    const loadConversations = useCallback(async () => {
        try {
            const data = await api.getChatHistory();
            setConversations(data.conversations || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    // Load a specific conversation
    const loadConversation = async (convId) => {
        try {
            const data = await api.getChatMessages(convId);
            setMessages(data.messages || []);
            setConversationId(convId);
            setSidebarOpen(false);
        } catch { /* ignore */ }
    };

    // Start new chat
    const startNewChat = () => {
        setMessages([]);
        setConversationId(null);
        setSidebarOpen(false);
        inputRef.current?.focus();
    };

    // Delete conversation
    const deleteConversation = async (convId, e) => {
        e.stopPropagation();
        try {
            await api.clearChat(convId);
            if (convId === conversationId) startNewChat();
            loadConversations();
        } catch { /* ignore */ }
    };

    // Send message
    const sendMessage = async () => {
        const text = input.trim();
        if (!text || loading) return;

        setInput('');
        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const data = await api.sendChatMessage(text, conversationId);
            setConversationId(data.conversationId);

            const assistantMsg = { role: 'assistant', content: data.reply, toolCalls: data.toolCalls };
            setMessages(prev => [...prev, assistantMsg]);

            // Refresh conversation list
            loadConversations();
        } catch (err) {
            const errorMsg = {
                role: 'assistant',
                content: `❌ ${err.message || 'Failed to get AI response. Please try again.'}`
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Suggested prompts
    const suggestions = [
        { icon: '💰', text: 'Check my wallet balance' },
        { icon: '📊', text: 'Show top trending tokens' },
        { icon: '⛽', text: 'What are the current gas prices?' },
        { icon: '🔍', text: 'Analyze token BANMAO' },
    ];

    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-white/5 bg-surface-900/50">
            {/* Sidebar - Conversations */}
            <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                fixed md:relative z-20 w-72 h-full bg-surface-900 border-r border-white/5
                flex flex-col transition-transform duration-200`}>

                {/* Sidebar header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
                        <MessageSquare size={14} className="text-brand-400" />
                        AI Chat
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

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {conversations.length === 0 ? (
                        <p className="text-xs text-surface-200/30 text-center py-8">No conversations yet</p>
                    ) : conversations.map(conv => (
                        <button
                            key={conv.conversationId}
                            onClick={() => loadConversation(conv.conversationId)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors group flex items-center gap-2 ${conv.conversationId === conversationId
                                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                    : 'hover:bg-white/3 text-surface-200/60 hover:text-surface-200/80'
                                }`}>
                            <MessageSquare size={12} className="flex-shrink-0 opacity-50" />
                            <span className="flex-1 truncate">{conv.title}</span>
                            <button
                                onClick={(e) => deleteConversation(conv.conversationId, e)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-surface-200/30 hover:text-red-400 transition-all">
                                <Trash2 size={10} />
                            </button>
                        </button>
                    ))}
                </div>
            </div>

            {/* Overlay for mobile sidebar */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Main chat area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-surface-900/80 backdrop-blur-sm">
                    <button onClick={() => setSidebarOpen(true)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 md:hidden">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center">
                        <Bot size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-semibold text-surface-100">AI Assistant</h1>
                        <p className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Online — Powered by Gemini + OnchainOS
                        </p>
                    </div>
                    {conversationId && (
                        <button onClick={startNewChat}
                            className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors text-xs flex items-center gap-1.5">
                            <Plus size={12} /> New
                        </button>
                    )}
                </div>

                {/* Messages area */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                    {messages.length === 0 ? (
                        /* Empty state with suggestions */
                        <div className="flex flex-col items-center justify-center h-full gap-6 animate-fadeIn">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-emerald-500/20 border border-white/5 flex items-center justify-center">
                                <Sparkles size={28} className="text-brand-400" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-lg font-semibold text-surface-100 mb-1">AI Trading Assistant</h2>
                                <p className="text-xs text-surface-200/40 max-w-sm">
                                    Chat with AI to check token prices, swap tokens, manage wallets,
                                    view signals, and more — all on-chain powered.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                                {suggestions.map((s, i) => (
                                    <button key={i}
                                        onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                                        className="text-left px-3 py-2.5 rounded-xl border border-white/5 bg-surface-800/30
                                            hover:bg-white/5 hover:border-brand-500/20 transition-all text-xs text-surface-200/60
                                            hover:text-surface-200/90 group">
                                        <span className="mr-1.5">{s.icon}</span>
                                        {s.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, i) => (
                                <div key={i}>
                                    {msg.toolCalls && <ToolCallBadge toolCalls={msg.toolCalls} />}
                                    <ChatBubble message={msg} />
                                </div>
                            ))}
                            {loading && <TypingIndicator />}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Scroll to bottom button */}
                {showScroll && (
                    <button onClick={scrollToBottom}
                        className="absolute bottom-24 right-8 w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30
                            flex items-center justify-center text-brand-400 hover:bg-brand-500/30 transition-colors shadow-lg">
                        <ArrowDown size={14} />
                    </button>
                )}

                {/* Input area */}
                <div className="p-3 border-t border-white/5 bg-surface-900/80 backdrop-blur-sm">
                    <div className="flex items-end gap-2">
                        <div className="flex-1 relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask anything about crypto, tokens, wallets..."
                                rows={1}
                                className="w-full px-4 py-2.5 rounded-xl bg-surface-800/60 border border-white/5
                                    text-sm text-surface-100 placeholder:text-surface-200/25
                                    focus:outline-none focus:border-brand-500/30 focus:ring-1 focus:ring-brand-500/20
                                    resize-none transition-all"
                                style={{ maxHeight: '120px', minHeight: '40px' }}
                                onInput={(e) => {
                                    e.target.style.height = '40px';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                }}
                            />
                        </div>
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${input.trim() && !loading
                                    ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                                    : 'bg-surface-800/40 text-surface-200/20 cursor-not-allowed'
                                }`}>
                            {loading
                                ? <Loader2 size={16} className="animate-spin" />
                                : <Send size={16} />}
                        </button>
                    </div>
                    <p className="text-[9px] text-surface-200/20 mt-1.5 text-center">
                        AI can make mistakes. Always verify important information.
                    </p>
                </div>
            </div>
        </div>
    );
}
