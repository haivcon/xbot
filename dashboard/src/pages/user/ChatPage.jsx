import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    MessageSquare, Send, Trash2, Plus, ChevronLeft, Bot, User, Loader2,
    Sparkles, X, ArrowDown, ChevronDown, ChevronRight, Wrench,
    Wallet, TrendingUp, BarChart3, Zap, Shield, Globe, Coins, ArrowLeftRight,
    HelpCircle, BookOpen, Star, Bell, Search, Activity, ArrowUpDown, Eye
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/utils/telegram';

/* ─── Markdown renderer (lightweight) ─── */
function renderMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre class="chat-code-block"><code class="language-${lang}">${code.trim()}</code></pre>`)
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
    const [showHelp, setShowHelp] = useState(false);
    const [expandedGuide, setExpandedGuide] = useState(null);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);
    useEffect(() => { inputRef.current?.focus(); }, []);

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
        try {
            const data = await api.getChatMessages(convId);
            setMessages(data.messages || []);
            setConversationId(convId);
            setSidebarOpen(false);
        } catch { /* ignore */ }
    };

    const startNewChat = () => {
        setMessages([]);
        setConversationId(null);
        setSidebarOpen(false);
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
        const userMsg = { role: 'user', content: msg };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const data = await api.sendChatMessage(msg, conversationId);
            setConversationId(data.conversationId);

            const assistantMsg = {
                role: 'assistant',
                content: data.reply,
                toolCalls: data.toolCalls
            };
            setMessages(prev => [...prev, assistantMsg]);
            hapticNotification('success');
            loadConversations();
        } catch (err) {
            hapticNotification('error');
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ ${err.message || 'Failed to get AI response. Please try again.'}`
            }]);
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
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-white/5 bg-surface-900/50">
            {/* Sidebar */}
            <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                fixed md:relative z-20 w-72 h-full bg-surface-900 border-r border-white/5
                flex flex-col transition-transform duration-200`}>

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

                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {conversations.length === 0 ? (
                        <p className="text-xs text-surface-200/30 text-center py-8">{t('dashboard.chatPage.noConv', 'No conversations yet')}</p>
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

            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Main chat area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-surface-900/80 backdrop-blur-sm">
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
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
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

                    {messages.length === 0 && !showHelp ? (
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
                            {messages.map((msg, i) => (
                                <div key={i}>
                                    {/* Tool calls card (shown before assistant text) */}
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <div className="ml-11 mb-2 space-y-1.5">
                                            <p className="text-[10px] text-surface-200/30 flex items-center gap-1.5 mb-1">
                                                <Wrench size={10} />
                                                {msg.toolCalls.length} tool{msg.toolCalls.length > 1 ? 's' : ''} executed
                                            </p>
                                            {msg.toolCalls.map((tc, j) => (
                                                <ToolCallCard key={j} toolCall={tc} />
                                            ))}
                                        </div>
                                    )}
                                    <ChatBubble message={msg} />
                                </div>
                            ))}
                            {loading && <TypingIndicator />}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Scroll button */}
                {showScroll && (
                    <button onClick={scrollToBottom}
                        className="absolute bottom-24 right-8 w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30
                            flex items-center justify-center text-brand-400 hover:bg-brand-500/30 transition-colors shadow-lg">
                        <ArrowDown size={14} />
                    </button>
                )}

                {/* Input */}
                <div className="p-3 border-t border-white/5 bg-surface-900/80 backdrop-blur-sm">
                    <div className="flex items-end gap-2">
                        <div className="flex-1 relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t('dashboard.chatPage.inputPlaceholder', 'Ask anything about crypto, tokens, wallets...')}
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
                            onClick={() => sendMessage()}
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
                        {t('dashboard.chatPage.disclaimer', 'AI can make mistakes. Always verify important information.')}
                    </p>
                </div>
            </div>
        </div>
    );
}
