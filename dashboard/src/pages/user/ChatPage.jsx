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
    ThumbsUp, ThumbsDown, Edit, Share2, Settings, Gauge, Key, ExternalLink, Home, Columns, Lock
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
function ChatBubble({ message, onRetry, onPin, isPinned, onFeedback, feedback, onEdit, onSave }) {
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
                    {isUser && onSave && (
                        <button onClick={() => onSave(message.content)} className="p-1 rounded-md bg-surface-800 border border-white/10 text-surface-200/50 hover:text-amber-400 transition-colors" title="Save prompt">
                            <Star size={10} />
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
    const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [modelOptions, setModelOptions] = useState(FALLBACK_MODELS);
    const [modelMeta, setModelMeta] = useState({ hasPersonalKey: false, hasServerKey: false, isOwner: false });
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [userApiKeys, setUserApiKeys] = useState([]);
    // AI Settings panel state
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [settingsTab, setSettingsTab] = useState('model');
    const [selectedPersona, setSelectedPersona] = useState('default');
    const [selectedProvider, setSelectedProvider] = useState('google');
    const [selectedThinking, setSelectedThinking] = useState('medium');
    const [apiKeyProvider, setApiKeyProvider] = useState('google');

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
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
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
                if (data.defaultModel && !data.models.find(m => m.id === selectedModel)) {
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

    // ── Auto-load last conversation on mount (restore after tab switch) ──
    useEffect(() => {
        if (conversationId && messages.length === 0 && !loading) {
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

                {/* #20 Copilot Quick Prompts */}
                <div className="border-t border-white/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={12} className="text-purple-400" />
                        <span className="text-[10px] font-semibold text-surface-200/50 uppercase tracking-wider">{t('dashboard.chatPage.copilot', 'Copilot')}</span>
                    </div>
                    <div className="space-y-1">
                        {[
                            { label: '🔍 Analyze token', cmd: 'Analyze this token for me: ' },
                            { label: '📊 Market trend', cmd: 'What is the current market trend for top tokens?' },
                            { label: '🐋 Whale signals', cmd: 'Show me the latest whale buy signals' },
                            { label: '💱 Best swap', cmd: 'What is the best swap route for 0.1 OKB to USDT?' },
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
                        {/* Compare toggle */}
                        <button
                            onClick={() => setCompareMode(!compareMode)}
                            className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
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
                                className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
                                    showSettingsPanel ? 'bg-brand-500/15 text-brand-400' : 'hover:bg-white/5 text-surface-200/40 hover:text-brand-400'
                                }`}
                                title="AI Settings">
                                <Settings size={12} />
                                <span className="hidden sm:inline text-[10px]">{modelOptions.find(m => m.id === selectedModel)?.label || 'Flash'}</span>
                            </button>
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
                                                            : <ChatBubble message={{ role: 'assistant', content: r?.response || '' }} />
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
                                        onSave={msg.role === 'user' ? savePrompt : undefined}
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

                    {/* U6: Quick-switch chips + U7: Token counter */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                            {/* Model chip */}
                            <button onClick={() => { setShowSettingsPanel(true); setSettingsTab('model'); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] bg-surface-800/60 border border-white/5 text-surface-200/50 hover:text-surface-200/80 hover:border-white/10 transition-all">
                                {(MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || []).find(m => m.id === selectedModel)?.icon || '🤖'}
                                <span className="truncate max-w-[80px]">{(MODEL_OPTIONS_BY_PROVIDER[selectedProvider] || []).find(m => m.id === selectedModel)?.label || selectedModel}</span>
                            </button>
                            {/* Persona chip */}
                            <button onClick={() => { setShowSettingsPanel(true); setSettingsTab('persona'); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] bg-surface-800/60 border border-white/5 text-surface-200/50 hover:text-surface-200/80 hover:border-white/10 transition-all">
                                {selectedPersona === 'custom' ? '✏️' : (PERSONA_OPTIONS.find(p => p.value === selectedPersona)?.icon || '🤖')}
                                <span className="truncate max-w-[60px]">{selectedPersona === 'custom' ? t('dashboard.chatPage.custom', 'Custom') : (PERSONA_OPTIONS.find(p => p.value === selectedPersona)?.label || 'Default')}</span>
                            </button>
                            {/* Compare mode indicator */}
                            {compareMode && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400">{t('dashboard.chatPage.compareIndicator', '⚔️ Compare')}</span>}
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
                                                            <span className="block text-[10px] text-surface-200/40">{p.desc}</span>
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
                                                            <span className="block text-[10px] text-surface-200/40">{m.desc}</span>
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
    );
}
