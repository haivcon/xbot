import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import {
    Bot, Loader2, MessageSquare, ExternalLink, Copy, Check,
    Sparkles, ArrowLeft, Share2
} from 'lucide-react';

/* ─── Markdown renderer (XSS-safe, simplified from ChatWidget) ─── */
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
            `<div class="shared-code-wrapper" style="position:relative">`
            + `<pre class="shared-code-block"><code class="language-${lang}">${escaped}</code></pre></div>`
        );
        return `%%CB_${idx}%%`;
    });
    safe = safe
        .replace(/^-{3,}$/gm, '<hr class="shared-hr"/>')
        .replace(/((?:^[-*] .+$\n?)+)/gm, (block) => {
            const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`);
            return `<ul class="shared-list">${items.join('')}</ul>`;
        });
    safe = safe
        .replace(/`([^`]+)`/g, '<code class="shared-inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => /javascript\s*:/i.test(url) ? t : `<a href="${url}" target="_blank" rel="noopener" class="shared-link">${t}</a>`)
        .replace(/^> (.+)$/gm, '<blockquote class="shared-blockquote">$1</blockquote>')
        .replace(/^### (.+)$/gm, '<h4 class="shared-h4">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="shared-h3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="shared-h2">$1</h2>');
    safe = safe.replace(/\n/g, '<br/>');
    codeBlocks.forEach((block, i) => { safe = safe.replace(`%%CB_${i}%%`, block); });
    return safe;
}

/* ─── Message Bubble (read-only) ─── */
function SharedBubble({ msg }) {
    const isUser = msg.role === 'user';
    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fadeIn`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden ${
                isUser ? 'bg-brand-500/20 ring-1 ring-brand-500/30' : 'bg-surface-800 ring-1 ring-emerald-500/30'
            }`}>
                {isUser
                    ? <span className="text-xs text-brand-400 font-bold">U</span>
                    : <img src="/xbot-logo.png" alt="XBOT" className="w-full h-full object-cover rounded-full" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                    ? 'bg-brand-500/15 border border-brand-500/15'
                    : 'bg-surface-800/60 border border-white/5'}`}>
                {isUser ? (
                    <p className="text-sm text-surface-100 whitespace-pre-wrap">{msg.content}</p>
                ) : (
                    <div className="text-sm text-surface-200/90 shared-content leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   SharedChatPage — Public read-only view
   ═══════════════════════════════════════ */
export default function SharedChatPage() {
    const { shareId } = useParams();
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!shareId) return;
        setLoading(true);
        api.getSharedChat(shareId)
            .then(d => { setData(d); setError(null); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [shareId]);

    const copyLink = () => {
        navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 size={32} className="text-brand-400 animate-spin mx-auto" />
                    <p className="text-sm text-surface-200/50">{t('shared.loading', 'Loading shared conversation...')}</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md px-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                        <MessageSquare size={24} className="text-red-400" />
                    </div>
                    <h2 className="text-lg font-bold text-surface-100">{t('shared.notFound', 'Conversation not found')}</h2>
                    <p className="text-sm text-surface-200/50">{t('shared.notFoundDesc', 'This shared link may have expired or been removed.')}</p>
                    <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500/15 text-brand-400 text-sm font-medium hover:bg-brand-500/25 transition-colors">
                        <ArrowLeft size={14} /> {t('shared.goHome', 'Go to Home')}
                    </Link>
                </div>
            </div>
        );
    }

    const messages = data.messages || [];
    const sharedDate = data.sharedAt ? new Date(data.sharedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';

    return (
        <div className="min-h-screen bg-surface-900 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-white/5 bg-surface-900/90 backdrop-blur-xl">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Link to="/" className="p-2 rounded-xl hover:bg-white/5 text-surface-200/40 hover:text-brand-400 transition-colors">
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="w-8 h-8 rounded-full bg-surface-800 ring-1 ring-emerald-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img src="/xbot-logo.png" alt="XBot" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-bold text-surface-100 truncate">{data.title || 'Shared Chat'}</h1>
                        <p className="text-[10px] text-surface-200/30 flex items-center gap-1.5">
                            <Share2 size={10} />
                            <span>{t('shared.sharedOn', 'Shared')} {sharedDate}</span>
                        </p>
                    </div>
                    <button onClick={copyLink}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                            copied
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                : 'bg-surface-800/60 text-surface-200/50 hover:text-surface-100 border border-white/5 hover:border-white/10'
                        }`}>
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? t('shared.copied', 'Copied!') : t('shared.copyLink', 'Copy link')}
                    </button>
                </div>
            </header>

            {/* Messages */}
            <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-5">
                {messages.length === 0 ? (
                    <div className="text-center py-16 text-surface-200/30 text-sm">
                        {t('shared.empty', 'This conversation is empty.')}
                    </div>
                ) : (
                    messages.map((msg, i) => <SharedBubble key={i} msg={msg} />)
                )}
            </main>

            {/* Footer branding */}
            <footer className="border-t border-white/5 bg-surface-900/80 backdrop-blur-sm">
                <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-800 ring-1 ring-emerald-500/30 overflow-hidden flex-shrink-0">
                            <img src="/xbot-logo.png" alt="XBot" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[11px] text-surface-200/30">
                            {t('shared.poweredBy', 'Powered by')} <strong className="text-surface-200/50">XBot AI</strong> — Gemini + OnchainOS
                        </span>
                    </div>
                    <Link to="/chat" className="flex items-center gap-1 text-[11px] text-brand-400/60 hover:text-brand-400 transition-colors">
                        <Sparkles size={10} /> {t('shared.tryXBot', 'Try XBot')}
                        <ExternalLink size={9} />
                    </Link>
                </div>
            </footer>

            {/* Inline styles for shared content */}
            <style>{`
                .shared-content { word-break: break-word; }
                .shared-content strong { color: rgba(255,255,255,0.95); font-weight: 600; }
                .shared-content em { color: rgba(255,255,255,0.7); }
                .shared-link { color: #60a5fa; text-decoration: none; transition: color 0.2s; }
                .shared-link:hover { color: #93bbfc; text-decoration: underline; }
                .shared-code-block { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 16px; overflow-x: auto; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.8); }
                .shared-inline-code { background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px; font-size: 0.85em; color: #f0abfc; }
                .shared-list { padding-left: 1.2em; margin: 4px 0; }
                .shared-list li { margin-bottom: 2px; }
                .shared-blockquote { border-left: 3px solid rgba(96,165,250,0.3); padding-left: 12px; color: rgba(255,255,255,0.6); margin: 6px 0; }
                .shared-h2 { font-size: 1.1em; font-weight: 700; color: rgba(255,255,255,0.95); margin: 8px 0 4px; }
                .shared-h3 { font-size: 1em; font-weight: 600; color: rgba(255,255,255,0.9); margin: 6px 0 3px; }
                .shared-h4 { font-size: 0.95em; font-weight: 600; color: rgba(255,255,255,0.85); margin: 4px 0 2px; }
                .shared-hr { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 8px 0; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
            `}</style>
        </div>
    );
}
