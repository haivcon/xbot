import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import useAuthStore from '@/stores/authStore';
import {
    MessageSquare, Send, Trash2, Plus, ChevronLeft, Bot, User, Loader2,
    Sparkles, X, ArrowDown, ChevronDown, ChevronRight, Wrench, Copy, RefreshCw, Check,
    Wallet, TrendingUp, BarChart3, Zap, Shield, Globe, Coins, ArrowLeftRight,
    HelpCircle, BookOpen, Star, Bell, Search, Activity, ArrowUpDown, Eye,
    Download, Pin, PinOff, Keyboard, Mic, MicOff, Paperclip, Image,
    ThumbsUp, ThumbsDown, Edit, Share2, Settings, Gauge, Key, ExternalLink, Home
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/utils/telegram';

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

    // ── Auto-link blockchain addresses & tx hashes BEFORE inline markdown ──
    // (Must run before backtick→<code> conversion so addresses inside `backticks` get linked)

    // 1. EVM: 0x + 64 hex = tx hash → /tx/ link
    safe = safe.replace(/(^|[\s(`])0x([a-fA-F0-9]{64})(?=[\s,.)}`<]|$)/gm, (_, pre, hex) => {
        const hash = '0x' + hex;
        return `${pre}<a href="https://www.okx.com/web3/explorer/xlayer/tx/${hash}" target="_blank" rel="noopener" class="chat-link">${hash}</a>`;
    });

    // 2. EVM: 0x + 40-42 hex = address (wallet/token/contract) → /address/ link
    safe = safe.replace(/(^|[\s(`])0x([a-fA-F0-9]{40,42})(?=[\s,.)}`<]|$)/gm, (_, pre, hex) => {
        const addr = '0x' + hex;
        return `${pre}<a href="https://www.okx.com/web3/explorer/xlayer/address/${addr}" target="_blank" rel="noopener" class="chat-link">${addr}</a>`;
    });

    // 3. Solana: base58, 32-44 chars (wallet/token/contract/tx) → /address/ link
    safe = safe.replace(/(^|[\s(:`])([1-9A-HJ-NP-Za-km-z]{32,44})(?=[\s,.)}`<]|$)/gm, (_, pre, addr) => {
        if (/^[a-z]+$/.test(addr)) return `${pre}${addr}`;
        return `${pre}<a href="https://www.okx.com/web3/explorer/solana/address/${addr}" target="_blank" rel="noopener" class="chat-link">${addr}</a>`;
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

/* ─── Tool call card with expandable details ─── */
function ToolCallCard({ toolCall }) {
    const [expanded, setExpanded] = useState(false);
    const meta = getToolMeta(toolCall.name);
    const Icon = meta.icon;

    // Parse result for preview
    let resultPreview = '';
    try {
        const parsed = JSON.parse(toolCall.result);
        if (parsed.error) resultPreview = `❌ ${parsed.error}`;
        else if (typeof parsed === 'object') resultPreview = `✅ Data received`;
        else resultPreview = `✅ ${String(parsed).substring(0, 100)}`;
    } catch {
        resultPreview = toolCall.result ? `✅ ${toolCall.result.substring(0, 80)}` : '✅ Done';
    }

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
                    <span className="text-xs font-mono font-medium text-surface-200/80">{toolCall.name}</span>
                    <span className="text-[10px] text-surface-200/35 ml-2">{resultPreview}</span>
                </div>
                <ChevronDown size={12} className={`text-surface-200/30 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
                <div className="px-3 pb-3 space-y-2 animate-fadeIn">
                    {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                        <div>
                            <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1">Arguments</p>
                            <pre className="text-[11px] text-surface-200/60 bg-surface-900/50 rounded-lg p-2 overflow-x-auto font-mono">
                                {JSON.stringify(toolCall.args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {toolCall.result && (
                        <div>
                            <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-1">Result</p>
                            <pre className="text-[11px] text-surface-200/60 bg-surface-900/50 rounded-lg p-2 overflow-x-auto font-mono max-h-48 overflow-y-auto custom-scrollbar">
                                {(() => {
                                    try { return JSON.stringify(JSON.parse(toolCall.result), null, 2); }
                                    catch { return toolCall.result; }
                                })()}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── Single message bubble ─── */
function ChatBubble({ message, onRetry, onPin, isPinned, onFeedback, feedback, onEdit }) {
    const [copied, setCopied] = useState(false);
    const isUser = message.role === 'user';
    const isError = !isUser && message.content?.startsWith('\u274c');
    const copyText = () => {
        navigator.clipboard.writeText(message.content || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fadeIn group ${isPinned ? 'ring-1 ring-amber-500/20 rounded-2xl p-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser
                    ? 'bg-brand-500/20 ring-1 ring-brand-500/30'
                    : 'bg-emerald-500/20 ring-1 ring-emerald-500/30'
                }`}>
                {isUser
                    ? <User size={14} className="text-brand-400" />
                    : <Bot size={14} className="text-emerald-400" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 relative ${isUser
                    ? 'bg-brand-500/15 border border-brand-500/20'
                    : 'bg-surface-800/60 border border-white/5'
                }`}>
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
                {/* Action buttons */}
                <div className={`absolute -bottom-3 ${isUser ? 'left-2' : 'right-2'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1`}>
                    {!isUser && (
                        <>
                            <button onClick={copyText} className="p-1 rounded-md bg-surface-800 border border-white/10 text-surface-200/50 hover:text-surface-100 transition-colors" title="Copy">
                                {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                            </button>
                            {onFeedback && (
                                <>
                                    <button onClick={() => onFeedback('up')}
                                        className={`p-1 rounded-md bg-surface-800 border border-white/10 transition-colors ${feedback === 'up' ? 'text-emerald-400' : 'text-surface-200/50 hover:text-emerald-400'}`} title="Good">
                                        <ThumbsUp size={10} />
                                    </button>
                                    <button onClick={() => onFeedback('down')}
                                        className={`p-1 rounded-md bg-surface-800 border border-white/10 transition-colors ${feedback === 'down' ? 'text-red-400' : 'text-surface-200/50 hover:text-red-400'}`} title="Bad">
                                        <ThumbsDown size={10} />
                                    </button>
                                </>
                            )}
                        </>
                    )}
                    {isUser && onEdit && (
                        <button onClick={onEdit} className="p-1 rounded-md bg-surface-800 border border-white/10 text-surface-200/50 hover:text-brand-400 transition-colors" title="Edit">
                            <Edit size={10} />
                        </button>
                    )}
                    {onPin && (
                        <button onClick={onPin} className={`p-1 rounded-md bg-surface-800 border border-white/10 transition-colors ${isPinned ? 'text-amber-400' : 'text-surface-200/50 hover:text-amber-400'}`} title={isPinned ? 'Unpin' : 'Pin'}>
                            {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
                        </button>
                    )}
                    {isError && onRetry && (
                        <button onClick={onRetry} className="p-1 rounded-md bg-surface-800 border border-white/10 text-amber-400/60 hover:text-amber-400 transition-colors" title="Retry">
                            <RefreshCw size={10} />
                        </button>
                    )}
                </div>
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

/* ─── Typing indicator ─── */
function TypingIndicator() {
    return (
        <div className="flex gap-3 animate-fadeIn">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <Bot size={14} className="text-emerald-400" />
            </div>
            <div className="bg-surface-800/60 border border-white/5 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                        <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-surface-200/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[10px] text-surface-200/30">Thinking & executing tools...</span>
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

/* ─── Main ChatPage ─── */
export default function ChatPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
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
    const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [modelOptions, setModelOptions] = useState(FALLBACK_MODELS);
    const [modelMeta, setModelMeta] = useState({ hasPersonalKey: false, hasServerKey: false, isOwner: false });
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [userApiKeys, setUserApiKeys] = useState([]);
    const [apiKeyLoading, setApiKeyLoading] = useState(false);
    const [apiKeyError, setApiKeyError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [loadingConv, setLoadingConv] = useState(false);
    const [inputShake, setInputShake] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
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

    // ── Load available models from backend ──
    const loadModels = useCallback(async () => {
        try {
            const viewMode = useAuthStore.getState().viewMode;
            const data = await api.request(`/ai/models?viewMode=${viewMode || ''}`);
            if (data?.models?.length) {
                setModelOptions(data.models);
                setModelMeta({ hasPersonalKey: data.hasPersonalKey, hasServerKey: data.hasServerKey, isOwner: data.isOwner });
                if (data.defaultModel && !data.models.find(m => m.id === selectedModel)) {
                    setSelectedModel(data.defaultModel);
                }
            }
        } catch { /* fallback to FALLBACK_MODELS */ }
    }, []);
    useEffect(() => { loadModels(); }, [loadModels]);

    // ── API key management helpers ──
    const loadApiKeys = useCallback(async () => {
        try {
            const data = await api.request('/ai/keys');
            setUserApiKeys(data?.keys || []);
        } catch { setUserApiKeys([]); }
    }, []);

    const addApiKey = useCallback(async () => {
        if (!apiKeyInput.trim()) return;
        setApiKeyLoading(true);
        setApiKeyError('');
        try {
            await api.request('/ai/keys', { method: 'POST', body: JSON.stringify({ apiKey: apiKeyInput.trim() }) });
            setApiKeyInput('');
            await loadApiKeys();
            await loadModels(); // Refresh model list
            hapticNotification('success');
        } catch (err) {
            setApiKeyError(err.message || 'Failed to add key');
            hapticNotification('error');
        } finally { setApiKeyLoading(false); }
    }, [apiKeyInput, loadApiKeys, loadModels]);

    const deleteApiKey = useCallback(async (keyId) => {
        try {
            await api.request('/ai/keys', { method: 'DELETE', body: JSON.stringify({ keyId }) });
            await loadApiKeys();
            await loadModels();
            hapticNotification('success');
        } catch { hapticNotification('error'); }
    }, [loadApiKeys, loadModels]);
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

    const startNewChat = () => {
        abortRef.current?.abort();
        setMessages([]);
        setConversationId(null);
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

    const sendMessage = async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;

        hapticImpact('light');
        setInput('');
        if (inputRef.current) inputRef.current.style.height = '40px';
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const userMsg = { role: 'user', content: msg, ts: Date.now(), image: imagePreview || undefined };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);
        setFollowUpSuggestions([]);
        const currentImage = imagePreview;
        setImagePreview(null);

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
                },
                onError: (data) => {
                    setMessages(prev => {
                        const copy = [...prev];
                        if (copy[assistantIdx.current]) copy[assistantIdx.current] = { ...copy[assistantIdx.current], content: `\u274c ${data.error || 'Stream failed'}` };
                        return copy;
                    });
                },
            });
            hapticNotification('success');
        } catch (err) {
            if (controller.signal.aborted) return;
            hapticNotification('error');
            // Update the existing streaming placeholder instead of adding a duplicate
            setMessages(prev => {
                const copy = [...prev];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].role === 'assistant' && !copy[lastIdx].content) {
                    copy[lastIdx] = { ...copy[lastIdx], content: `\u274c ${err.message || 'Failed to get AI response. Please try again.'}` };
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

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!input.trim()) {
                // Shake animation feedback for empty input
                setInputShake(true);
                setTimeout(() => setInputShake(false), 500);
                return;
            }
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

    // #2 Build follow-up suggestions from AI response
    const buildFollowUps = (reply, tools) => {
        const suggestions = [];
        const toolNames = (tools || []).map(t => t.name);
        if (toolNames.includes('get_token_price') || toolNames.includes('get_market_price'))
            suggestions.push('📊 Show price chart', '🔬 Analyze this token', '🔔 Set price alert');
        else if (toolNames.includes('analyze_token'))
            suggestions.push('💱 Swap this token', '⭐ Add to favorites', '🐳 Show whale signals');
        else if (toolNames.includes('get_signal_list'))
            suggestions.push('📊 Analyze top signal', '💰 Check my portfolio', '🔔 Set alerts');
        else if (toolNames.includes('swap_tokens') || toolNames.includes('get_swap_quote'))
            suggestions.push('💼 Check balance', '📊 Show price', '📈 Top trending tokens');
        else if (toolNames.includes('get_wallet_balance') || toolNames.includes('list_wallets'))
            suggestions.push('💱 Swap tokens', '📊 Top trending', '🐳 Whale signals');
        else
            suggestions.push('💰 Check balance', '📊 Top tokens', '🐳 Whale signals');
        return suggestions.slice(0, 3);
    };

    // #4 Token autocomplete
    const handleInputChange = (e) => {
        const val = e.target.value;
        setInput(val);
        // Check for $ trigger
        const match = val.match(/\$(\w*)$/);
        if (match) {
            const query = match[1].toUpperCase();
            const results = KNOWN_TOKEN_LIST.filter(t => t.startsWith(query)).slice(0, 6);
            setAutocompleteResults(results);
            setShowAutocomplete(results.length > 0);
        } else {
            setShowAutocomplete(false);
        }
    };
    const insertToken = (token) => {
        setInput(prev => prev.replace(/\$\w*$/, token + ' '));
        setShowAutocomplete(false);
        inputRef.current?.focus();
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
        <div className={`flex overflow-hidden bg-surface-900/50 ${isMobile ? 'chat-page-mobile h-[100dvh]' : 'h-full rounded-2xl border border-white/5'}`}>
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
                    ) : filteredConversations.map(conv => (
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

            {sidebarOpen && isMobile && (
                <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
            )}
            {sidebarOpen && !isMobile && (
                <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Main chat area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-surface-900/80 backdrop-blur-sm">
                    <button onClick={() => navigate('/')}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 hover:text-brand-400 transition-colors md:hidden"
                        title="Home">
                        <Home size={16} />
                    </button>
                    <button onClick={() => setSidebarOpen(true)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/50 md:hidden">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center">
                        <Bot size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-semibold text-surface-100">{t('dashboard.chatPage.title', 'AI Trading Assistant')}</h1>
                        <p className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {t('dashboard.chatPage.status', 'Online — Powered by Gemini + OnchainOS')}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Model selector */}
                        <div className="relative">
                            <button onClick={() => setShowModelPicker(!showModelPicker)}
                                className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors flex items-center gap-1"
                                title="Model">
                                <Settings size={12} />
                                <span className="hidden sm:inline text-[10px]">{modelOptions.find(m => m.id === selectedModel)?.label || 'Flash'}</span>
                            </button>
                            {showModelPicker && (
                                <>
                                    <div className={`fixed inset-0 ${isMobile ? 'bg-black/50 z-40' : 'z-10'}`} onClick={() => setShowModelPicker(false)} />
                                    <div className={`${isMobile
                                        ? 'fixed bottom-0 left-0 right-0 z-50 w-full rounded-t-2xl bottom-sheet-enter'
                                        : 'absolute right-0 top-full mt-1 w-56 rounded-xl'
                                    } bg-surface-800 border border-white/10 shadow-xl overflow-hidden`}
                                    onClick={e => e.stopPropagation()}>
                                    {/* Mobile handle */}
                                    {isMobile && (
                                        <div className="flex justify-center py-2">
                                            <div className="w-10 h-1 rounded-full bg-white/20" />
                                        </div>
                                    )}
                                    <div className={`${isMobile ? 'px-2 pb-safe' : ''}`}>
                                    {modelOptions.map(m => (
                                        <button key={m.id} onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                                            className={`w-full text-left ${isMobile ? 'px-4 py-3.5' : 'px-3 py-2.5'} text-xs transition-colors flex items-center justify-between ${
                                                selectedModel === m.id ? 'bg-brand-500/10 text-brand-400' : 'text-surface-200/70 hover:bg-white/5'
                                            } ${isMobile ? 'rounded-xl mb-1' : ''}`}>
                                            <div>
                                                <span className={`font-medium ${isMobile ? 'text-sm' : ''}`}>{m.icon} {m.label}</span>
                                                <span className={`block ${isMobile ? 'text-xs' : 'text-[10px]'} text-surface-200/40`}>{m.desc}</span>
                                            </div>
                                            {selectedModel === m.id && <Check size={isMobile ? 16 : 12} className="text-brand-400" />}
                                        </button>
                                    ))}
                                    {/* Divider + API key section */}
                                    <div className="border-t border-white/5 mt-1">
                                        {modelMeta.hasPersonalKey ? (
                                            <div className={`${isMobile ? 'px-4 py-3' : 'px-3 py-2'} text-[10px] text-emerald-400/70 flex items-center gap-1`}>
                                                <Key size={10} /> Personal API key active
                                            </div>
                                        ) : !modelMeta.isOwner ? (
                                            <button onClick={() => { setShowModelPicker(false); setShowApiKeyModal(true); loadApiKeys(); }}
                                                className={`w-full text-left ${isMobile ? 'px-4 py-3.5 text-sm' : 'px-3 py-2.5 text-xs'} text-amber-400/80 hover:bg-amber-500/10 transition-colors flex items-center gap-1.5`}>
                                                <Key size={11} /> Add API Key to unlock all models
                                            </button>
                                        ) : (
                                            <div className={`${isMobile ? 'px-4 py-3' : 'px-3 py-2'} text-[10px] text-brand-400/70 flex items-center gap-1`}>
                                                <Settings size={10} /> Owner: all models unlocked
                                            </div>
                                        )}
                                    </div>
                                    </div>
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Context indicator */}
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
                        {messages.length > 0 && (
                            <>
                                <button onClick={shareConversation}
                                    className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors"
                                    title="Share">
                                    <Share2 size={12} />
                                </button>
                                <button onClick={exportConversation}
                                    className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-emerald-400 transition-colors"
                                    title={t('dashboard.chatPage.export', 'Export chat')}>
                                    <Download size={12} />
                                </button>
                            </>
                        )}
                        <button onClick={() => setShowHelp(!showHelp)}
                            className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 ${
                                showHelp ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'hover:bg-white/5 text-surface-200/40 hover:text-brand-400'
                            }`}
                            title={t('dashboard.chatPage.helpBtn', 'Features Guide')}>
                            <BookOpen size={12} />
                            <span className="hidden sm:inline">{t('dashboard.chatPage.helpBtn', 'Guide')}</span>
                        </button>
                        {conversationId && (
                            <button onClick={startNewChat}
                                className="p-2 rounded-lg hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors text-xs flex items-center gap-1.5">
                                <Plus size={12} /> {t('dashboard.chatPage.newChat', 'New')}
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
                                <span>Drop image to analyze</span>
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
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-emerald-500/20 border border-white/5 flex items-center justify-center">
                                <Sparkles size={28} className="text-brand-400" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-lg font-semibold text-surface-100 mb-1">{t('dashboard.chatPage.welcomeTitle', 'AI Trading Assistant')}</h2>
                                <p className="text-xs text-surface-200/40 max-w-md">
                                    {t('dashboard.chatPage.welcomeDesc', 'Chat naturally to control your wallets, swap tokens, check prices, view signals, and manage your portfolio — all powered by AI + OnchainOS.')}
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                                {suggestionCategories.map((cat, ci) => (
                                    <div key={ci} className="space-y-1.5">
                                        <p className="text-[10px] text-surface-200/30 font-semibold uppercase tracking-wider px-1">{cat.title}</p>
                                        {cat.items.map((s, si) => (
                                            <button key={si}
                                                onClick={() => sendMessage(s.text)}
                                                className="w-full text-left px-3 py-2.5 rounded-xl border border-white/5 bg-surface-800/30
                                                    hover:bg-white/5 hover:border-brand-500/20 transition-all text-xs text-surface-200/60
                                                    hover:text-surface-200/90 flex items-center gap-2 group">
                                                <span>{s.icon}</span>
                                                <span className="flex-1">{s.text}</span>
                                                <ChevronRight size={10} className="text-surface-200/20 group-hover:text-brand-400 transition-colors" />
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            {/* Quick help link */}
                            <button onClick={() => setShowHelp(true)}
                                className="flex items-center gap-2 text-[11px] text-surface-200/30 hover:text-brand-400 transition-colors group">
                                <BookOpen size={12} className="group-hover:text-brand-400" />
                                {t('dashboard.chatHelp.viewAll', 'View all 53 available tools & features')}
                                <ChevronRight size={10} />
                            </button>
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
                                return (
                                <div key={i} id={`msg-${i}`}>
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <div className="ml-11 mb-2 space-y-1.5">
                                            <p className="text-[10px] text-surface-200/30 flex items-center gap-1.5 mb-1">
                                                <Wrench size={10} />
                                                {msg.toolCalls.length} {msg.toolCalls.length > 1 ? t('dashboard.chatPage.toolsUsed', 'tools used') : t('dashboard.chatPage.toolUsed', 'tool used')}
                                            </p>
                                            {msg.toolCalls.map((tc, j) => (
                                                <ToolCallCard key={j} toolCall={tc} />
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
                                    />
                                    {/* Always-visible retry button on error messages */}
                                    {msg.role === 'assistant' && msg.content?.startsWith('\u274c') && (
                                        <div className="ml-11 mt-1.5 animate-fadeIn">
                                            <button onClick={retryLastMessage}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]
                                                    bg-amber-500/10 text-amber-400 border border-amber-500/20
                                                    hover:bg-amber-500/20 transition-all">
                                                <RefreshCw size={11} />
                                                {t('dashboard.chatPage.retry', 'Retry')}
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
                                <div className="flex flex-wrap gap-1.5 mt-2 animate-fadeIn">
                                    {followUpSuggestions.map((s, i) => (
                                        <button key={i}
                                            onClick={() => sendMessage(s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, ''))}
                                            className="px-3 py-1.5 rounded-full text-[11px] bg-brand-500/8 text-brand-400/80
                                                border border-brand-500/15 hover:bg-brand-500/15 hover:text-brand-400 transition-all">
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
                <div className={`p-3 border-t border-white/5 bg-surface-900/80 backdrop-blur-sm ${isMobile ? 'chat-input-safe' : ''}`}>
                    {/* Quick action chips (new/empty chat only) */}
                    {messages.length === 0 && !loading && (
                        <div className="flex flex-wrap gap-1.5 mb-2 animate-fadeIn">
                            {[
                                { label: '💰 Balance', cmd: 'Check my wallet balance' },
                                { label: '📈 Top tokens', cmd: 'Show top trending tokens' },
                                { label: '🔄 Swap', cmd: 'I want to swap tokens' },
                                { label: '📊 Analyze', cmd: 'Analyze OKB token' },
                                { label: '📡 Signals', cmd: 'Show whale buy signals' },
                            ].map(chip => (
                                <button key={chip.cmd}
                                    onClick={() => sendMessage(chip.cmd)}
                                    className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-2.5 py-1.5 text-[11px]'} rounded-full
                                        bg-brand-500/8 text-brand-400/80 border border-brand-500/15
                                        hover:bg-brand-500/15 hover:text-brand-400 transition-all active:scale-95`}>
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    )}
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
                            className="p-2.5 rounded-xl hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60 transition-all flex-shrink-0"
                            title={t('dashboard.chatPage.uploadImage', 'Upload image for analysis')}>
                            <Paperclip size={16} />
                        </button>
                        <div className="flex-1 relative">
                            {/* Token autocomplete dropdown */}
                            {showAutocomplete && (
                                <div className="absolute bottom-full mb-1 left-0 w-full bg-surface-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                                    {autocompleteResults.map(token => (
                                        <button key={token}
                                            onClick={() => insertToken(token)}
                                            className="w-full text-left px-3 py-2 text-xs text-surface-100 hover:bg-brand-500/10 transition-colors flex items-center gap-2">
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
                                placeholder={t('dashboard.chatPage.inputPlaceholder', 'Ask anything about crypto, tokens, wallets...')}
                                rows={1}
                                className={`w-full px-4 py-2.5 rounded-xl bg-surface-800/60 border
                                    text-sm text-surface-100 placeholder:text-surface-200/25
                                    focus:outline-none focus:border-brand-500/30 focus:ring-1 focus:ring-brand-500/20
                                    resize-none transition-all ${isListening ? 'border-red-500/40 ring-1 ring-red-500/20' : 'border-white/5'}
                                    ${inputShake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
                                style={{ maxHeight: '120px', minHeight: '40px' }}
                                onInput={(e) => {
                                    e.target.style.height = '40px';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                }}
                            />
                        </div>
                        {/* Voice input button */}
                        {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                            <button
                                onClick={toggleVoice}
                                className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${isListening
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                                    : 'hover:bg-white/5 text-surface-200/30 hover:text-surface-200/60'
                                }`}
                                title={isListening ? 'Stop' : t('dashboard.chatPage.voiceHint', 'Voice input')}>
                                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
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
                        {t('dashboard.chatPage.disclaimer', 'AI can make mistakes. Always verify important information.')}
                        {' · '}<span className="text-surface-200/15">$token · Ctrl+N · Esc</span>
                    </p>
                </div>
            </div>

            {/* ── API Key Management Modal ── */}
            {showApiKeyModal && (
                <>
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowApiKeyModal(false)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                                        <Key size={16} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-surface-100">Google AI API Key</h3>
                                        <p className="text-[10px] text-surface-200/50">Unlock all AI models with your own key</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowApiKeyModal(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-200/40 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-5 py-4 space-y-4">
                                {/* Existing keys */}
                                {userApiKeys.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-surface-200/60">Your Keys</p>
                                        {userApiKeys.map(k => (
                                            <div key={k.id} className="flex items-center justify-between bg-surface-800/60 rounded-lg px-3 py-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Key size={12} className="text-emerald-400 flex-shrink-0" />
                                                    <span className="text-xs text-surface-200/70 truncate font-mono">{k.maskedKey}</span>
                                                </div>
                                                <button onClick={() => deleteApiKey(k.id)}
                                                    className="p-1 rounded hover:bg-red-500/20 text-surface-200/30 hover:text-red-400 transition-colors flex-shrink-0"
                                                    title="Delete key">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add key form */}
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-surface-200/60">{userApiKeys.length > 0 ? 'Add Another Key' : 'Add Your API Key'}</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            value={apiKeyInput}
                                            onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
                                            placeholder="AIzaSy..."
                                            className="flex-1 bg-surface-800/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder-surface-200/30 focus:outline-none focus:border-brand-400/50 font-mono"
                                            onKeyDown={e => { if (e.key === 'Enter') addApiKey(); }}
                                        />
                                        <button onClick={addApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
                                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                                apiKeyLoading || !apiKeyInput.trim()
                                                    ? 'bg-surface-800/40 text-surface-200/20 cursor-not-allowed'
                                                    : 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                                            }`}>
                                            {apiKeyLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                            Add
                                        </button>
                                    </div>
                                    {apiKeyError && (
                                        <p className="text-[10px] text-red-400 flex items-center gap-1">
                                            <X size={10} /> {apiKeyError}
                                        </p>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2.5 space-y-1.5">
                                    <p className="text-[11px] text-amber-400/80 font-medium">How to get a free API key:</p>
                                    <p className="text-[10px] text-surface-200/50 leading-relaxed">
                                        1. Visit Google AI Studio → Create API Key<br />
                                        2. Copy the key and paste it above<br />
                                        3. All AI models will be unlocked instantly
                                    </p>
                                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 transition-colors mt-1">
                                        <ExternalLink size={10} /> Get your free key →
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
