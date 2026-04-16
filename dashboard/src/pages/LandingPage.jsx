import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Globe, Shield, Sparkles, BarChart3, Wallet, LogIn, ChevronRight, Zap, ArrowRight, Terminal, Brain, TrendingUp, MessageSquare, Sun, Moon, Loader2, Copy, Check, Users, ExternalLink } from 'lucide-react';
import config from '@/config';
import LanguageSelector from '@/components/LanguageSelector';
import useThemeStore from '@/stores/themeStore';

const INSTALL_TABS = {
    en: [
        {
            id: 'prep',
            title: '1. Preparation',
            desc: 'Get API Keys & Bot Token',
            steps: [
                { comment: "# Get Telegram Token via @BotFather", cmd: "/newbot" },
                { comment: "# Get OKX API Keys at OKX Developer Portal", cmd: "Project -> API Key, Secret, Passphrase" },
                { comment: "# Get Google Gemini API Key", cmd: "aistudio.google.com/apikey" }
            ]
        },
        {
            id: 'setup',
            title: '2. Local Setup',
            desc: 'Clone code & config env',
            steps: [
                { comment: "# Clone repo & install dependencies", cmd: "git clone https://github.com/haivcon/xbot.git\ncd xbot && npm install" },
                { comment: "# Create & configure .env file", cmd: "cp .env.example .env\nnano .env" },
                { comment: "# Generate a random 32-char wallet secret", cmd: "node -e \"console.log(require('crypto').randomBytes(16).toString('hex'))\"" },
                { comment: "# Test locally", cmd: "node index.js" }
            ]
        },
        {
            id: 'vps',
            title: '3. Cloud VPS',
            desc: 'Deploy on Ubuntu 22.04',
            steps: [
                { comment: "# Update & Install Node.js 18", cmd: "sudo apt update && sudo apt upgrade -y\ncurl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -\nsudo apt install -y nodejs git build-essential" },
                { comment: "# Install PM2 & Clone code on server", cmd: "sudo npm install -g pm2\ncd ~\ngit clone https://github.com/haivcon/xbot.git\ncd xbot && npm install" },
                { comment: "# Edit .env, Build Dashboard & Start Bot 24/7", cmd: "cp .env.example .env\nnano .env\ncd dashboard && npm install && npm run build && cd ..\npm2 start index.js --name xbot\npm2 startup\npm2 save" },
                { comment: "# Allow Firewall ports", cmd: "sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443\nsudo ufw enable" }
            ]
        },
        {
            id: 'domain',
            title: '4. Domain & SSL',
            desc: 'Secure with Nginx',
            steps: [
                { comment: "# Install Nginx & Route proxy_pass to port 3000", cmd: "sudo apt install -y nginx\nsudo nano /etc/nginx/sites-available/xbot" },
                { comment: "# Apply Nginx configuration", cmd: "sudo ln -s /etc/nginx/sites-available/xbot /etc/nginx/sites-enabled/\nsudo rm /etc/nginx/sites-enabled/default\nsudo nginx -t && sudo systemctl restart nginx" },
                { comment: "# Install SSL via Certbot", cmd: "sudo apt install -y certbot python3-certbot-nginx\nsudo certbot --nginx -d yourdomain.com" }
            ]
        }
    ],
    vi: [
        {
            id: 'prep',
            title: '1. Chuẩn bị',
            desc: 'Lấy Bot Token & API Keys',
            steps: [
                { comment: "# Mở Telegram, tìm @BotFather và gửi lệnh tạo bot", cmd: "/newbot" },
                { comment: "# Lấy HTTP API Token và Telegram User ID (qua @userinfobot)", cmd: "TELEGRAM_TOKEN=...\nBOT_OWNER_ID=..." },
                { comment: "# Lấy OKX API (Key, Secret, Passphrase) & Google Gemini API", cmd: "Vào OKX Developer Portal & Google AI Studio" }
            ]
        },
        {
            id: 'setup',
            title: '2. Tải & Cấu hình',
            desc: 'Clone Repo & Sửa .env',
            steps: [
                { comment: "# Tải mã nguồn & cài đặt thư viện gốc", cmd: "git clone https://github.com/haivcon/xbot.git\ncd xbot && npm install" },
                { comment: "# Tạo file cấu hình và điền các khóa API", cmd: "cp .env.example .env\nnano .env" },
                { comment: "# Sinh mã ngẫu nhiên 32 ký tự cho WALLET_ENCRYPT_SECRET", cmd: "node -e \"console.log(require('crypto').randomBytes(16).toString('hex'))\"" },
                { comment: "# Chạy thử trên máy cá nhân", cmd: "node index.js" }
            ]
        },
        {
            id: 'vps',
            title: '3. Máy chủ VPS',
            desc: 'Chạy nền 24/7 trên Ubuntu',
            steps: [
                { comment: "# Kết nối SSH, Cập nhật OS & Cài đặt Node.js 18", cmd: "ssh root@IP_VPS_CUA_BAN\nsudo apt update && sudo apt upgrade -y\ncurl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -\nsudo apt install -y nodejs git build-essential" },
                { comment: "# Cài đặt PM2 & Clone mã nguồn lên VPS", cmd: "sudo npm install -g pm2\ncd ~\ngit clone https://github.com/haivcon/xbot.git\ncd xbot && npm install" },
                { comment: "# Copy biến môi trường và Build Dashboard", cmd: "cp .env.example .env\nnano .env\ncd dashboard && npm install && npm run build && cd .." },
                { comment: "# Khởi chạy Bot 24/7 và Cấu hình tường lửa", cmd: "pm2 start index.js --name xbot\npm2 startup && pm2 save\nsudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443\nsudo ufw enable" }
            ]
        },
        {
            id: 'domain',
            title: '4. Tên miền & SSL',
            desc: 'Bọc bảo mật HTTPS',
            steps: [
                { comment: "# Cài đặt Nginx & Mở file cấu hình proxy_pass", cmd: "sudo apt install -y nginx\nsudo nano /etc/nginx/sites-available/xbot" },
                { comment: "# Kích hoạt Nginx và khởi động lại", cmd: "sudo ln -s /etc/nginx/sites-available/xbot /etc/nginx/sites-enabled/\nsudo rm /etc/nginx/sites-enabled/default\nsudo nginx -t && sudo systemctl restart nginx" },
                { comment: "# Cài đặt chứng chỉ SSL tự động (Let's Encrypt)", cmd: "sudo apt install -y certbot python3-certbot-nginx\nsudo certbot --nginx -d tenmiencuaban.com" },
                { comment: "# Khi có cập nhật mã nguồn mới", cmd: "cd ~/xbot && git pull origin main\nnpm install\ncd dashboard && npm run build\ncd .. && pm2 restart xbot" }
            ]
        }
    ]
};

const INSTALL_GUIDE_HEADER = {
    en: { title: "Complete Self-Hosting Guide", subtitle: "Zero to 24/7 Production in 4 Simple Stages" },
    vi: { title: "Hướng Dẫn Tự Triển Khai Từ A-Z", subtitle: "Từ con số 0 đến chạy nền 24/7 trên server chuyên nghiệp" }
};

const InstallGuideSection = ({ isDark, lang }) => {
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [activeTabId, setActiveTabId] = useState('prep');
    
    // Auto-fallback mapping
    const locale = (INSTALL_TABS[lang]) ? lang : 'en';
    const tabs = INSTALL_TABS[locale];
    const header = INSTALL_GUIDE_HEADER[locale];
    
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    const handleCopy = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
        <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 py-20">
            <div className={`text-center mb-14`}>
                <h2 className="text-sm font-bold text-brand-400 uppercase tracking-[0.2em] mb-3">{header.title}</h2>
                <p className={`text-2xl md:text-3xl lg:text-4xl font-bold ${isDark ? 'text-white' : 'text-surface-900'}`}>{header.subtitle}</p>
            </div>
            
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Tab Menu */}
                <div className="lg:w-1/3 flex flex-col gap-3">
                    {tabs.map((t) => {
                        const isActive = t.id === activeTabId;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActiveTabId(t.id)}
                                className={`text-left p-4 rounded-xl transition-all duration-300 border backdrop-blur-sm ${
                                    isActive 
                                        ? isDark 
                                            ? 'bg-brand-500/10 border-brand-500/50 shadow-inner ring-1 ring-brand-500/20' 
                                            : 'bg-brand-50 border-brand-500/50 shadow-sm ring-1 ring-brand-500/20'
                                        : isDark
                                            ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/20'
                                            : 'bg-white/50 border-surface-200 hover:bg-white hover:border-surface-300'
                                }`}
                            >
                                <h3 className={`font-bold tracking-tight text-base mb-1 transition-colors ${
                                    isActive 
                                        ? 'text-brand-500' 
                                        : isDark ? 'text-surface-300' : 'text-surface-700'
                                }`}>{t.title}</h3>
                                <p className={`text-[13px] leading-relaxed transition-colors ${
                                    isActive
                                        ? isDark ? 'text-brand-200/70' : 'text-brand-700/70'
                                        : isDark ? 'text-surface-500' : 'text-surface-500'
                                }`}>{t.desc}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Right: Terminal Viewer */}
                <div className={`lg:w-2/3 relative rounded-xl overflow-hidden backdrop-blur-md transition-all duration-500 shadow-2xl flex flex-col ${
                    isDark 
                        ? 'bg-[#0f172a]/80 shadow-black/80 border border-white/10' 
                        : 'bg-white/80 shadow-brand-500/5 border border-surface-200/60'
                }`}>
                    {/* Terminal Mac Chrome */}
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${
                        isDark ? 'border-white/10 bg-white/[0.02]' : 'border-surface-200/60 bg-surface-50/50'
                    }`}>
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-amber-400" />
                            <div className="w-3 h-3 rounded-full bg-emerald-400" />
                        </div>
                        <div className={`text-xs font-mono flex items-center gap-2 ${
                            isDark ? 'text-surface-400' : 'text-surface-500 font-bold'
                        }`}>
                            <Terminal size={14} />
                            root@xbot-server: ~/{activeTab.id}
                        </div>
                        <button 
                            onClick={() => handleCopy(activeTab.steps.map(s => s.cmd).join('\n'), 'all')}
                            className={`text-[11px] uppercase tracking-wider flex items-center gap-1.5 font-bold transition-colors hidden sm:flex ${
                                isDark ? 'text-white/30 hover:text-white' : 'text-surface-400 hover:text-surface-900'
                            }`}
                        >
                            {copiedIndex === 'all' ? <Check size={14} className={isDark ? "text-emerald-400" : "text-emerald-600"} /> : <Copy size={14} />}
                            {copiedIndex === 'all' ? (lang === 'vi' ? 'Đã chép!' : 'Copied!') : (lang === 'vi' ? 'Chép toàn bộ' : 'Copy All')}
                        </button>
                    </div>
                    
                    {/* Terminal Content */}
                    <div key={activeTab.id} className="p-6 overflow-x-auto text-left font-mono text-[13px] md:text-sm leading-relaxed custom-scrollbar flex-1 relative animate-fade-in-up">
                        {activeTab.steps.map((step, idx) => (
                            <div key={`${activeTab.id}-${idx}`} className="mb-6 last:mb-0 group/cmd relative pr-12">
                                <span className={`block select-none mb-1.5 ${
                                    isDark ? 'text-surface-500' : 'text-surface-400 font-bold'
                                }`}>
                                    {step.comment}
                                </span>
                                <div className={isDark ? 'text-surface-100' : 'text-surface-800 font-semibold'}>
                                    {step.cmd.split('\n').map((line, i) => (
                                        <div key={i} className="flex">
                                            <span className={`select-none mr-3 ${
                                                isDark ? 'text-pink-400/80' : 'text-brand-500'
                                            }`}>$</span>
                                            <span>{line}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => handleCopy(step.cmd, `${activeTab.id}-${idx}`)}
                                    className={`absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/cmd:opacity-100 transition-opacity p-2 rounded-lg ${
                                        isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                                    }`}
                                    title="Copy script"
                                >
                                    {copiedIndex === `${activeTab.id}-${idx}` ? <Check size={16} className={isDark ? "text-emerald-400" : "text-emerald-600"} /> : <Copy size={16} />}
                                </button>
                            </div>
                        ))}
                        <div className="flex items-center mt-5 animate-pulse">
                            <span className={`select-none font-bold ${isDark ? 'text-emerald-400' : 'text-brand-500'}`}>_</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="mt-12 flex justify-center w-full">
                <a href="https://github.com/haivcon/xbot" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-[13px] uppercase tracking-wide transition-all duration-300 border ${
                    isDark 
                        ? 'bg-white/[0.04] border-white/10 text-white hover:bg-white/10 shadow-lg shadow-black/20 hover:scale-[1.02]' 
                        : 'bg-white border-brand-500/20 text-brand-700 hover:border-brand-500 hover:bg-brand-50 hover:shadow-lg hover:shadow-brand-500/10 hover:scale-[1.02]'
                }`}>
                    <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                    GitHub Open Source
                </a>
            </div>
        </section>
    );
};

/* ── Animated badge ── */
const AnimatedBadge = ({ values }) => {
    const [index, setIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setIndex((prev) => (prev + 1) % values.length);
                setIsAnimating(false);
            }, 300);
        }, 3000);
        return () => clearInterval(interval);
    }, [values]);

    return (
        <span className="relative flex items-center justify-center text-[10px] font-bold text-brand-400 bg-brand-400/10 px-2 rounded-md min-w-[80px] h-5 overflow-hidden">
            <span className={`transition-all duration-300 ${isAnimating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                {values[index]}
            </span>
        </span>
    );
};

/* ── Interactive Ecosystem Hub ── */
const InteractiveEcosystem = ({ features, pages, onLogin, isDark, t }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    // Auto-advance logic
    useEffect(() => {
        const duration = 5000;
        const intervalStep = 50;
        
        const tick = () => {
            setProgress(p => {
                const newP = p + (intervalStep / duration) * 100;
                if (newP >= 100) {
                    setActiveIndex(prev => (prev + 1) % features.length);
                    return 0;
                }
                return newP;
            });
        };

        const timer = setInterval(tick, intervalStep);
        return () => clearInterval(timer);
    }, [features.length]);

    const activeFeature = features[activeIndex] || features[0];
    // Odd indexes -> User context (demo purpose, can be adjusted)
    const isOwnerContext = [0, 1, 5].includes(activeIndex);
    
    const displayPages = isOwnerContext ? pages.filter(p => p.owner) : pages.filter(p => !p.owner);

    return (
        <section className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 py-24">
            <div className={`text-center mb-16 transition-all duration-1000`}>
                <h2 className="text-sm font-bold text-brand-400 uppercase tracking-[0.2em] mb-3">{t('dashboard.landing.featuresTitle') || 'Capabilities'}</h2>
                <p className={`text-2xl md:text-4xl font-extrabold ${isDark ? 'text-white' : 'text-surface-900'}`}>Tất cả nền tảng tại một tâm điểm</p>
            </div>

            <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 p-4 md:p-6 lg:p-8 rounded-3xl border overflow-hidden shadow-2xl transition-all duration-500 ${
                isDark ? 'bg-[#0f172a]/60 border-white/[0.08] shadow-black/60 backdrop-blur-xl' : 'bg-white/80 border-black/[0.06] shadow-brand-500/10 backdrop-blur-3xl'
            }`}>
                
                {/* ── Capabilities List (Left) ── */}
                <div className="lg:col-span-5 flex flex-col gap-2 relative z-10">
                    {features.map((f, i) => {
                        const Icon = f.icon;
                        const isActive = i === activeIndex;
                        return (
                            <div 
                                key={i}
                                onClick={() => { setActiveIndex(i); setProgress(0); }}
                                className={`relative flex items-center gap-4 py-3.5 px-4 rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden ${
                                    isActive 
                                        ? isDark ? 'bg-white/[0.06] shadow-inner border border-white/[0.05]' : 'bg-black/[0.03] shadow-sm border border-black/[0.05]'
                                        : 'hover:bg-transparent opacity-50 hover:opacity-100'
                                }`}
                            >
                                <div className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 transition-all duration-500 shadow-md ${isActive ? `bg-gradient-to-br ${f.gradient} scale-110 shadow-lg shadow-${f.color}-500/30` : isDark ? 'bg-white/[0.03]' : 'bg-black/[0.05]'}`}>
                                    <Icon size={20} className={isActive ? 'text-white' : isDark ? 'text-surface-200' : 'text-surface-600'} />
                                </div>
                                <div className="flex-1">
                                    <h3 className={`text-[15px] font-extrabold mb-1 transition-colors ${isActive ? (isDark ? 'text-white' : 'text-surface-900') : (isDark ? 'text-surface-200/80' : 'text-surface-700/80')}`}>{f.title}</h3>
                                    <p className={`text-xs leading-relaxed transition-colors line-clamp-1 ${isActive ? (isDark ? 'text-surface-200/60' : 'text-surface-700/70') : (isDark ? 'text-surface-200/30' : 'text-surface-700/40')}`}>{f.desc}</p>
                                </div>
                                
                                {isActive && (
                                    <div className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent w-full">
                                        <div className={`h-full bg-gradient-to-r ${f.gradient} transition-all duration-75`} style={{ width: `${progress}%` }} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* ── Pages Mockup Display (Right) ── */}
                <div className={`lg:col-span-7 relative flex flex-col justify-center min-h-[480px] rounded-2xl border overflow-hidden p-6 lg:p-10 transition-all duration-500 ${
                    isDark ? 'bg-black/30 border-white/[0.04]' : 'bg-surface-50 border-black/[0.04]'
                }`}>
                    {/* Active Halo */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${activeFeature.gradient} opacity-[0.07] blur-[100px] transition-all duration-1000`} />
                    
                    <div key={activeIndex} className="w-full relative z-10 animate-fade-in-up" style={{ animationDuration: '0.4s' }}>
                        <div className="flex items-center gap-3 mb-6 px-1">
                            {isOwnerContext ? <Shield size={20} className="text-brand-400" /> : <Bot size={20} className="text-cyan-400" />}
                            <h4 className="text-[13px] font-black uppercase tracking-[0.15em]">{isOwnerContext ? t('dashboard.landing.ownerSection') || 'Owner Dashboard' : t('dashboard.landing.userSection') || 'User Platform'}</h4>
                            <span className={`ml-auto text-[11px] font-bold px-2.5 py-1 rounded-md tracking-wider ${isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-surface-600'}`}>{displayPages.length} MODULES</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 rounded-xl custom-scrollbar" style={{ maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)' }}>
                            {displayPages.map((p, idx) => (
                                <button key={idx} onClick={onLogin} className={`group/item flex items-center justify-between p-4 rounded-xl border transition-all duration-300 hover:scale-[1.02] text-left hover:shadow-lg ${
                                    isDark ? 'bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10' : 'bg-white border-black/5 hover:bg-black/[0.02]'
                                }`}>
                                    <div>
                                        <p className={`text-sm font-bold mb-1 transition-colors ${isDark ? 'text-surface-200/90 group-hover/item:text-white' : 'text-surface-800 group-hover/item:text-brand-600'}`}>{p.name}</p>
                                        <p className={`text-[11px] transition-colors ${isDark ? 'text-surface-200/40 group-hover/item:text-surface-200/60' : 'text-surface-500'}`}>{p.desc}</p>
                                    </div>
                                    <ChevronRight size={16} className={`opacity-0 -translate-x-2 group-hover/item:translate-x-0 group-hover/item:opacity-100 transition-all ${isDark ? 'text-brand-400' : 'text-brand-500'}`} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};


/* ── Animated counter ── */
function AnimatedNumber({ target, duration = 1200, suffix = '' }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (target == null || target === 0) { setVal(0); return; }
        let start = 0;
        const step = Math.max(1, Math.ceil(target / (duration / 16)));
        const iv = setInterval(() => {
            start += step;
            if (start >= target) { setVal(target); clearInterval(iv); }
            else setVal(start);
        }, 16);
        return () => clearInterval(iv);
    }, [target, duration]);
    return <span>{val.toLocaleString()}{suffix}</span>;
}

/* ── Floating orb component ── */
function FloatingOrb({ className, delay = 0 }) {
    return (
        <div
            className={`absolute rounded-full pointer-events-none ${className}`}
            style={{ animation: `float ${8 + delay}s ease-in-out infinite ${delay}s` }}
        />
    );
}

export default function LandingPage({ onLogin }) {
    const { t, i18n } = useTranslation();
    const { theme, toggleTheme } = useThemeStore();
    const [scrollY, setScrollY] = useState(0);
    const [mounted, setMounted] = useState(false);

    // ── Real-time stats from API ──
    const [liveStats, setLiveStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Fetch real-time data from public endpoints
    useEffect(() => {
        let cancelled = false;
        async function fetchStats() {
            try {
                // Try health endpoint (public, no auth required)
                const healthRes = await fetch('/api/dashboard/health').then(r => r.ok ? r.json() : null).catch(() => null);
                // Try bot-info endpoint (already confirmed public)
                const botInfoRes = await fetch('/api/dashboard/bot-info').then(r => r.ok ? r.json() : null).catch(() => null);

                if (cancelled) return;

                if (healthRes || botInfoRes) {
                    setLiveStats({
                        status: healthRes?.status || 'unknown',
                        uptime: healthRes?.uptimeSeconds || null,
                        memory: healthRes?.memory?.rss || null,
                        heapUsed: healthRes?.memory?.heapUsed || null,
                        eventLoopLag: healthRes?.eventLoopLagMs || null,
                        db: healthRes?.db || null,
                        version: healthRes?.version || null,
                        node: healthRes?.node || null,
                        botUsername: botInfoRes?.botUsername || null,
                        communities: botInfoRes?.communities || [],
                        tokens: botInfoRes?.tokens || [],
                    });
                }
            } catch { /* ignore */ }
            if (!cancelled) setStatsLoading(false);
        }
        fetchStats();
        // Refresh every 30s for real-time
        const iv = setInterval(fetchStats, 30000);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    // Format uptime
    const formatUptime = (seconds) => {
        if (!seconds) return '—';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const features = [
        { icon: Shield, title: t('dashboard.landing.featAccess'), desc: t('dashboard.landing.featAccessDesc'), gradient: 'from-blue-500 to-indigo-600', glow: 'shadow-blue-500/20' },
        { icon: BarChart3, title: t('dashboard.landing.featAnalytics'), desc: t('dashboard.landing.featAnalyticsDesc'), gradient: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/20' },
        { icon: Wallet, title: t('dashboard.landing.featWallets'), desc: t('dashboard.landing.featWalletsDesc'), gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/20' },
        { icon: Globe, title: t('dashboard.landing.featLanguages'), desc: t('dashboard.landing.featLanguagesDesc'), gradient: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/20' },
        { icon: Brain, title: t('dashboard.landing.featAI'), desc: t('dashboard.landing.featAIDesc'), gradient: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/20' },
        { icon: Zap, title: t('dashboard.landing.featRealtime'), desc: t('dashboard.landing.featRealtimeDesc'), gradient: 'from-cyan-500 to-blue-600', glow: 'shadow-cyan-500/20' },
    ];

    const highlights = [
        { icon: TrendingUp, label: 'DEX Trading', values: ['On-chain', 'Off-chain', 'Cross-chain'] },
        { icon: Bot, label: 'AI Chat', values: ['GPT-4o', 'Gemini 3.1', 'Claude 3.5', 'Groq'] },
        { icon: MessageSquare, label: 'Groups', values: ['Multi', 'Global', 'Communities'] },
        { icon: Terminal, label: 'Commands', values: ['100+', 'Advanced', 'Natural'] },
    ];

    const pages = [
        // Owner Pages
        { name: t('dashboard.sidebar.home') || 'Dashboard', desc: t('dashboard.landing.pageDashboardDesc'), owner: true },
        { name: t('dashboard.sidebar.users') || 'Users', desc: t('dashboard.landing.pageUsersDesc'), owner: true },
        { name: t('dashboard.sidebar.groups') || 'Groups', desc: t('dashboard.landing.pageGroupsDesc'), owner: true },
        { name: t('dashboard.sidebar.alerts') || 'Alerts', desc: t('dashboard.landing.pageAlertsDesc'), owner: true },
        { name: t('dashboard.sidebar.posts') || 'Scheduled Posts', desc: t('dashboard.landing.pagePostsDesc'), owner: true },
        { name: t('dashboard.sidebar.config') || 'Bot Config', desc: t('dashboard.landing.pageConfigDesc'), owner: true },
        { name: t('dashboard.sidebar.auditLog') || 'Audit Log', desc: t('dashboard.landing.pageAuditLogDesc'), owner: true },
        { name: t('dashboard.sidebar.checkinAdmin') || 'Check-in Admin', desc: t('dashboard.landing.pageCheckinAdminDesc'), owner: true },

        // User Pages
        { name: t('dashboard.sidebar.aiChat') || 'AI Chat', desc: t('dashboard.landing.pageAiChatDesc'), owner: false },
        { name: t('dashboard.sidebar.aiMemory') || 'AI Memory', desc: t('dashboard.landing.pageAiMemoryDesc'), owner: false },
        { name: t('dashboard.sidebar.aiTrader') || 'AI Trader', desc: t('dashboard.landing.pageAiTraderDesc'), owner: false },
        { name: 'Smart Copy', desc: t('dashboard.landing.pageSmartCopyDesc'), owner: false },
        { name: t('dashboard.sidebar.mySpace') || 'My Space', desc: t('dashboard.landing.pageMySpaceDesc'), owner: false },
        { name: t('dashboard.sidebar.wallets') || 'Wallets', desc: t('dashboard.landing.pageWalletsDesc'), owner: false },
        { name: t('dashboard.sidebar.dexTrading') || 'DEX Trading', desc: t('dashboard.landing.pageTradingDesc'), owner: false },
        { name: t('dashboard.sidebar.okxTrading') || 'OKX Trading', desc: t('dashboard.landing.pageOkxTradingDesc'), owner: false },
        { name: t('dashboard.sidebar.discovery') || 'Discovery', desc: t('dashboard.landing.pageDiscoveryDesc'), owner: false },
        { name: t('dashboard.sidebar.leaderboard') || 'Leaderboard', desc: t('dashboard.landing.pageLeaderboardDesc'), owner: false },
        { name: t('dashboard.sidebar.myGroups') || 'My Groups', desc: t('dashboard.landing.pageMyGroupsDesc'), owner: false },
        { name: t('dashboard.sidebar.games') || 'Mini Games', desc: t('dashboard.landing.pageGamesDesc'), owner: false },
        { name: t('dashboard.sidebar.settings') || 'Settings', desc: t('dashboard.landing.pageSettingsDesc'), owner: false },
    ];

    const isDark = theme === 'dark';

    // Real-time stat cards data
    const statCards = liveStats ? [
        {
            label: t('dashboard.status.title'),
            value: liveStats.status === 'ok' ? t('dashboard.status.online') : (liveStats.status || '—'),
            color: liveStats.status === 'ok' ? 'emerald' : 'amber',
            dot: liveStats.status === 'ok',
        },
        {
            label: t('dashboard.status.uptime'),
            value: formatUptime(liveStats.uptime),
            color: 'brand',
        },
        {
            label: t('dashboard.status.memory'),
            value: liveStats.memory || '—',
            color: 'cyan',
        },
        {
            label: t('dashboard.status.eventLoop'),
            value: liveStats.eventLoopLag != null ? `${liveStats.eventLoopLag}ms` : '—',
            color: (liveStats.eventLoopLag || 0) > 50 ? 'rose' : 'emerald',
        },
    ] : null;

    return (
        <div className={`min-h-screen relative overflow-hidden ${isDark ? 'bg-surface-900' : 'bg-surface-50'}`}>
            {/* ── Animated Background ── */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-[0.02]"
                    style={{ backgroundImage: `linear-gradient(${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px)`, backgroundSize: '60px 60px' }}
                />
                {/* Floating orbs */}
                <FloatingOrb className={`w-[500px] h-[500px] ${isDark ? 'bg-brand-500/[0.07]' : 'bg-brand-500/[0.05]'} blur-[120px] -top-20 -left-20`} delay={0} />
                <FloatingOrb className={`w-[600px] h-[600px] ${isDark ? 'bg-purple-500/[0.05]' : 'bg-purple-500/[0.04]'} blur-[150px] top-1/3 -right-40`} delay={2} />
                <FloatingOrb className={`w-[400px] h-[400px] ${isDark ? 'bg-cyan-500/[0.06]' : 'bg-cyan-500/[0.04]'} blur-[100px] bottom-20 left-1/3`} delay={4} />
                <FloatingOrb className={`w-[300px] h-[300px] ${isDark ? 'bg-emerald-500/[0.04]' : 'bg-emerald-500/[0.03]'} blur-[80px] top-2/3 right-1/4`} delay={6} />
            </div>

            {/* ── Header (Glassmorphism) ── */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
                scrollY > 50
                    ? isDark
                        ? 'bg-surface-900/80 backdrop-blur-2xl border-b border-white/5 shadow-xl shadow-black/20'
                        : 'bg-white/80 backdrop-blur-2xl border-b border-black/5 shadow-xl shadow-black/5'
                    : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto flex items-center justify-between px-6 md:px-10 py-4">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img src="/xbot-logo.png" alt="XBot" className="w-10 h-10 rounded-xl shadow-lg shadow-brand-500/30 object-cover ring-1 ring-white/10" />
                            {liveStats?.status === 'ok' && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-surface-900 animate-pulse" />
                            )}
                        </div>
                        <div>
                            <span className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-surface-900'}`}>{config.appName}</span>
                            <span className={`hidden sm:inline text-xs ml-2 font-medium ${isDark ? 'text-surface-200/30' : 'text-surface-700/40'}`}>{config.appTagline}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Theme toggle */}
                        <button
                            onClick={toggleTheme}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-300 ${
                                isDark
                                    ? 'bg-white/[0.06] border-white/10 text-surface-200 hover:bg-white/[0.12] hover:text-amber-400'
                                    : 'bg-black/[0.04] border-black/10 text-surface-700 hover:bg-black/[0.08] hover:text-indigo-600'
                            }`}
                            title={isDark ? t('dashboard.header.lightMode') : t('dashboard.header.darkMode')}
                        >
                            {isDark ? <Sun size={16} /> : <Moon size={16} />}
                        </button>

                        <LanguageSelector variant="landing" />

                        <button
                            onClick={onLogin}
                            className={`group relative flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl shadow-lg transition-all duration-300 hover:scale-[1.03] overflow-hidden ${
                                isDark
                                    ? 'bg-white text-surface-900 shadow-white/10 hover:shadow-white/20'
                                    : 'bg-surface-900 text-white shadow-black/10 hover:shadow-black/20'
                            }`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <LogIn size={16} className="relative z-10 group-hover:text-white transition-colors" />
                            <span className="relative z-10 group-hover:text-white transition-colors">{t('dashboard.auth.loginBtn')}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Hero Section ── */}
            <section className="relative z-10 pt-32 pb-8 md:pt-40 md:pb-16">
                <div className="max-w-7xl mx-auto px-6 md:px-10">
                    <div className="text-center max-w-3xl mx-auto">
                        {/* Badge */}
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold mb-8 transition-all duration-700 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                        } bg-gradient-to-r from-brand-500/10 to-cyan-500/10 border-brand-500/20 text-brand-400`}>
                            <Sparkles size={13} className="animate-pulse" />
                            {t('dashboard.landing.badge')}
                            {liveStats?.status === 'ok' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        </div>

                        {/* Title */}
                        <h1 className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] mb-6 transition-all duration-700 delay-100 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                        }`}>
                            <span className={isDark ? 'text-white' : 'text-surface-900'}>{config.appName}</span>
                            <br />
                            <span className="bg-gradient-to-r from-brand-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                                {config.appTagline}
                            </span>
                        </h1>

                        {/* Subtitle */}
                        <p className={`text-base sm:text-lg mb-10 max-w-xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                        } ${isDark ? 'text-surface-200/50' : 'text-surface-700/60'}`}>
                            {t('dashboard.auth.subtitle')}
                        </p>

                        {/* CTA Buttons */}
                        <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 transition-all duration-700 delay-300 ${
                            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                        }`}>
                            <button
                                onClick={onLogin}
                                className="group relative flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-brand-500 to-cyan-500 text-white font-bold rounded-2xl shadow-2xl shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 hover:scale-[1.03] text-base overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <LogIn size={20} className="relative z-10" />
                                <span className="relative z-10">{t('dashboard.auth.loginBtn')}</span>
                                <ArrowRight size={18} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                            </button>
                            {liveStats?.botUsername && (
                                <a
                                    href={`https://t.me/${liveStats.botUsername}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 px-6 py-3.5 border font-semibold rounded-2xl transition-all duration-300 text-sm no-underline ${
                                        isDark
                                            ? 'bg-white/[0.04] border-white/10 text-surface-200/80 hover:bg-white/[0.08] hover:border-white/20 hover:text-white'
                                            : 'bg-black/[0.03] border-black/10 text-surface-700/80 hover:bg-black/[0.06] hover:border-black/20 hover:text-surface-900'
                                    }`}
                                >
                                    <Bot size={18} />
                                    @{liveStats.botUsername}
                                </a>
                            )}
                        </div>
                    </div>

                    {/* ── Highlight Pills ── */}
                    <div className={`flex flex-wrap items-center justify-center gap-3 mb-8 transition-all duration-700 delay-[400ms] ${
                        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                    }`}>
                        {highlights.map((h, i) => {
                            const Icon = h.icon;
                            return (
                                <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full border backdrop-blur-sm transition-all duration-300 group cursor-default ${
                                    isDark
                                        ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
                                        : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.04] hover:border-black/[0.12]'
                                }`}>
                                    <Icon size={15} className="text-brand-400 group-hover:text-cyan-400 transition-colors" />
                                    <span className={`text-xs font-semibold ${isDark ? 'text-surface-200/70' : 'text-surface-700/70'}`}>{h.label}</span>
                                    <AnimatedBadge values={h.values} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Live System Status (Real-time data) ── */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 pb-20">
                <div className={`relative transition-all duration-1000 delay-500 ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}>
                    {/* Glow behind */}
                    <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 via-purple-500/5 to-transparent rounded-3xl blur-3xl" />

                    <div className={`relative rounded-2xl border overflow-hidden shadow-2xl ${
                        isDark
                            ? 'border-white/[0.08] bg-white/[0.02] backdrop-blur-sm shadow-black/30'
                            : 'border-black/[0.06] bg-white/60 backdrop-blur-sm shadow-black/5'
                    }`}>
                        {/* Browser chrome */}
                        <div className={`flex items-center gap-2 px-4 py-3 border-b ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-black/5 bg-black/[0.02]'}`}>
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                            </div>
                            <div className="flex-1 flex justify-center">
                                <div className={`px-4 py-1 rounded-lg border text-[11px] font-mono ${
                                    isDark ? 'bg-white/[0.04] border-white/5 text-surface-200/30' : 'bg-black/[0.03] border-black/5 text-surface-700/30'
                                }`}>
                                    {liveStats?.botUsername ? `${liveStats.botUsername}.xbot.app` : 'dashboard.xbot.app'}
                                </div>
                            </div>
                            {/* Live indicator */}
                            <div className="flex items-center gap-1.5">
                                {statsLoading ? (
                                    <Loader2 size={12} className="animate-spin text-surface-200/30" />
                                ) : liveStats?.status === 'ok' ? (
                                    <>
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400/60' : 'text-emerald-600/60'}`}>Live</span>
                                    </>
                                ) : (
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>offline</span>
                                )}
                            </div>
                        </div>

                        {/* Real-time stats */}
                        <div className="p-6 md:p-8">
                            {statsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-brand-400" />
                                    <span className={`ml-3 text-sm ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>{t('dashboard.common.loading')}</span>
                                </div>
                            ) : statCards ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                        {statCards.map((s, i) => (
                                            <div key={i} className={`p-4 rounded-xl border ${
                                                isDark ? 'bg-white/[0.03] border-white/5' : 'bg-black/[0.02] border-black/5'
                                            }`}>
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <p className={`text-[10px] font-medium ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>{s.label}</p>
                                                    {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                                </div>
                                                <p className={`text-xl font-bold tabular-nums text-${s.color}-400`}>
                                                    {s.value}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Additional info row */}
                                    <div className={`flex flex-wrap items-center gap-4 text-[11px] ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>
                                        {liveStats?.version && (
                                            <span className="flex items-center gap-1.5">
                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${isDark ? 'bg-white/[0.04]' : 'bg-black/[0.04]'}`}>v{liveStats.version}</span>
                                            </span>
                                        )}
                                        {liveStats?.node && (
                                            <span className="flex items-center gap-1.5">
                                                Node.js <span className="font-mono">{liveStats.node}</span>
                                            </span>
                                        )}
                                        {liveStats?.db && (
                                            <span className="flex items-center gap-1.5">
                                                DB: <span className={liveStats.db === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>{liveStats.db === 'ok' ? '✓ OK' : '✗ Error'}</span>
                                            </span>
                                        )}
                                        {liveStats?.heapUsed && (
                                            <span className="flex items-center gap-1.5">
                                                Heap: <span className="font-mono">{liveStats.heapUsed}</span>
                                            </span>
                                        )}
                                        <span className="ml-auto flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                                            Auto-refresh 30s
                                        </span>
                                    </div>

                                    {/* Onchain ecosystem status */}
                                    {(liveStats?.tokens?.length > 0 || liveStats?.communities?.length > 0) && (
                                        <div className={`mt-6 pt-6 border-t ${isDark ? 'border-white/5' : 'border-black/5'} grid grid-cols-1 md:grid-cols-2 gap-8`}>
                                            {/* Left: Tokens */}
                                            {liveStats?.tokens && liveStats.tokens.length > 0 && (
                                                <div className="w-full">
                                                    <div className="flex items-center gap-2 mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                                                        <TrendingUp size={16} className={isDark ? 'text-amber-400' : 'text-amber-500'} />
                                                        <h4 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-surface-200' : 'text-surface-800'}`}>{t('dashboard.landing.ecosystemTokens', 'XLayer Ecosystem Tokens')}</h4>
                                                    </div>
                                                    <div className="flex flex-col gap-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                                                        {liveStats.tokens.map((tItem, i) => (
                                                            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                                                                isDark ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-black/[0.02] border-black/5 hover:bg-black/[0.04]'
                                                            }`}>
                                                                {tItem.logoUrl ? (
                                                                    <img src={tItem.logoUrl} alt={tItem.symbol} className="w-10 h-10 rounded-full object-cover border border-white/5 bg-black" />
                                                                ) : (
                                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border ${isDark ? 'border-white/5 bg-white/5 text-white' : 'border-black/5 bg-black/5 text-black'}`}>
                                                                        {tItem.symbol.slice(0,2)}
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-sm font-bold truncate ${isDark ? 'text-surface-100' : 'text-surface-900'}`}>${tItem.symbol}</p>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        <p className={`text-[10px] font-medium font-mono truncate opacity-60`} title={tItem.address}>{tItem.address.slice(0, 6)}...{tItem.address.slice(-4)}</p>
                                                                        <button onClick={() => {
                                                                            navigator.clipboard.writeText(tItem.address);
                                                                            const toast = document.createElement('div');
                                                                            toast.innerText = 'Copied!';
                                                                            toast.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-3 py-1 text-xs rounded-full shadow-lg z-50 animate-fade-in-up';
                                                                            document.body.appendChild(toast);
                                                                            setTimeout(() => toast.remove(), 2000);
                                                                        }} className="text-surface-400 hover:text-brand-400 transition-colors" title="Copy Address">
                                                                            <Copy size={12} />
                                                                        </button>
                                                                        <a href={`https://www.okx.com/web3/explorer/xlayer/token/${tItem.address}`} target="_blank" rel="noopener noreferrer" className="text-surface-400 hover:text-cyan-400 transition-colors" title="OKX Web3 Explorer">
                                                                            <ExternalLink size={12} />
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className={`text-sm font-bold font-mono ${isDark ? 'text-white' : 'text-surface-900'}`}>${Number(tItem.price).toFixed(6)}</p>
                                                                    <div className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-0.5 ${Number(tItem.priceChange24h) >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                                        {Number(tItem.priceChange24h) >= 0 ? '+' : ''}{Number(tItem.priceChange24h * 100).toFixed(2)}%
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Right: Communities */}
                                            {liveStats?.communities && liveStats.communities.length > 0 && (
                                                <div className="w-full">
                                                    <div className="flex items-center gap-2 mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                                                        <Users size={16} className={isDark ? 'text-brand-400' : 'text-brand-500'} />
                                                        <h4 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-surface-200' : 'text-surface-800'}`}>{t('dashboard.landing.registeredCommunities', 'Registered Communities')}</h4>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-brand-500/20 text-brand-400' : 'bg-brand-50 text-brand-600'}`}>
                                                            {liveStats.communities.length}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-2 animate-fade-in-up pb-2" style={{ animationDelay: '0.2s' }}>
                                                        {liveStats.communities.map((c, i) => (
                                                            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                                                                isDark ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-black/[0.02] border-black/5 hover:bg-black/[0.04]'
                                                            }`}>
                                                                <img src={`/api/dashboard/community-logo/${c.chatId}`} 
                                                                     alt={c.title} 
                                                                     className={`w-10 h-10 rounded-full object-cover border flex-shrink-0 ${isDark ? 'border-white/5 bg-surface-800' : 'border-black/5 bg-surface-200'}`}
                                                                     onError={(e) => { e.target.src = '/xbot-logo.png'; }}
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className={`text-sm font-bold truncate ${isDark ? 'text-surface-100' : 'text-surface-900'}`} title={c.title}>{c.title}</p>
                                                                        {c.link && (
                                                                            <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-cyan-400 transition-colors flex-shrink-0">
                                                                                <ArrowRight size={14} className="-rotate-45" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                    <p className={`text-[11px] mt-0.5 font-medium flex items-center ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                                                        {t('dashboard.landing.members', { count: c.memberCount, defaultValue: `${c.memberCount} members` })}
                                                                        <span className="mx-1.5 opacity-30">•</span>
                                                                        {c.type === 'supergroup' ? t('dashboard.landing.supergroup', 'Supergroup') : t('dashboard.landing.group', c.type || 'Group')}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    {(liveStats?.tokens?.length > 0 || liveStats?.communities?.length > 0) && (
                                        <div className="mt-6 text-center animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                                            <a href="https://x.com/xlayerAi_bot" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold border transition-all ${isDark ? 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] text-surface-300 hover:text-white' : 'bg-black/[0.02] border-black/10 hover:bg-black/[0.05] text-surface-600 hover:text-black'}`}>
                                                <Sparkles size={12} className="text-brand-500" />
                                                {t('dashboard.landing.listYourToken', 'Want to feature your token & community here? Apply on X')}
                                                <ExternalLink size={12} className="opacity-50" />
                                            </a>
                                            <p className={`mt-3 text-[10px] sm:text-[11px] max-w-lg mx-auto ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
                                                {t('dashboard.landing.autoListInstruction', 'Or simply add @XlayerAi_bot as an Admin to your Telegram Group to list it automatically.')}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Fallback when API is not reachable */
                                <div className={`text-center py-12 ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>
                                    <Bot size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">{t('dashboard.auth.loginHint')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Interactive Ecosystem Hub ── */}
            <InteractiveEcosystem features={features} pages={pages} onLogin={onLogin} isDark={isDark} t={t} />

            {/* ── System Installation Guide ── */}
            <InstallGuideSection isDark={isDark} lang={i18n.language || 'en'} />

            {/* ── Footer ── */}
            <footer className={`relative z-10 border-t ${isDark ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>
                <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
                    {/* Top row — Brand + Social links */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                        {/* Brand */}
                        <div className="flex items-center gap-3">
                            <img src="/xbot-logo.png" alt="XBot" className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-brand-500/10 ring-1 ring-white/5" />
                            <div>
                                <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-surface-900'}`}>{config.appName}</p>
                                <p className={`text-[11px] ${isDark ? 'text-surface-200/30' : 'text-surface-700/30'}`}>{config.appTagline}</p>
                            </div>
                        </div>

                        {/* Social Links */}
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                            {/* Telegram Dev */}
                            <a href={`https://t.me/${config.devTelegram?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20' : 'bg-black/[0.02] border-black/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20'
                               }`}
                               title={`Dev: ${config.devTelegram}`}
                            >
                                <svg className="w-4 h-4 text-surface-200/40 group-hover:text-[#2AABEE] transition-colors" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                </svg>
                                <span className={`text-[11px] group-hover:text-[#2AABEE] transition-colors font-medium ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>{config.devTelegram}</span>
                            </a>

                            {/* X Dev */}
                            <a href={`https://x.com/${config.devTwitter?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]' : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.06] hover:border-black/[0.12]'
                               }`}
                               title={`Dev: ${config.devTwitter}`}
                            >
                                <svg className={`w-3.5 h-3.5 transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                <span className={`text-[11px] transition-colors font-medium ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`}>{config.devTwitter}</span>
                            </a>

                            {/* Telegram Bot */}
                            <a href={`https://t.me/${config.botTelegram?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20' : 'bg-black/[0.02] border-black/[0.06] hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/20'
                               }`}
                               title={`Bot: ${config.botTelegram}`}
                            >
                                <svg className="w-4 h-4 text-surface-200/40 group-hover:text-[#2AABEE] transition-colors" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                </svg>
                                <span className={`text-[11px] group-hover:text-[#2AABEE] transition-colors font-medium ${isDark ? 'text-surface-200/40' : 'text-surface-700/40'}`}>Bot</span>
                            </a>

                            {/* X Bot */}
                            <a href={`https://x.com/${config.botTwitter?.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]' : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.06] hover:border-black/[0.12]'
                               }`}
                               title={`Bot X: ${config.botTwitter}`}
                            >
                                <svg className={`w-3.5 h-3.5 transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                <span className={`text-[11px] transition-colors font-medium ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`}>Bot</span>
                            </a>

                            {/* GitHub */}
                            <a href={config.githubRepo} target="_blank" rel="noopener noreferrer"
                               className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 no-underline ${
                                   isDark ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]' : 'bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.06] hover:border-black/[0.12]'
                               }`}
                               title={`GitHub: ${config.githubRepo.replace('https://github.com/', '')}`}
                            >
                                <svg className={`w-4 h-4 transition-colors ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                                </svg>
                                <span className={`text-[11px] transition-colors font-medium ${isDark ? 'text-surface-200/40 group-hover:text-white' : 'text-surface-700/40 group-hover:text-surface-900'}`}>Source Code</span>
                            </a>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className={`h-px bg-gradient-to-r from-transparent to-transparent mb-6 ${isDark ? 'via-white/[0.06]' : 'via-black/[0.06]'}`} />

                    {/* Bottom row — Credits & Version */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className={`flex items-center gap-2 text-[11px] ${isDark ? 'text-surface-200/25' : 'text-surface-700/30'}`}>
                            <span>Dev:</span>
                            <span className={`font-bold tracking-wider ${isDark ? 'text-surface-200/40' : 'text-surface-700/50'}`}>{config.devName}</span>
                            <span className={isDark ? 'text-surface-200/10' : 'text-surface-700/15'}>•</span>
                            <span>{config.footerText}</span>
                        </div>
                        <div className={`flex items-center gap-2 text-[10px] font-mono ${isDark ? 'text-surface-200/20' : 'text-surface-700/25'}`}>
                            <span>v{config.appVersion}</span>
                            {config.buildTime && (
                                <>
                                    <span className={isDark ? 'text-surface-200/10' : 'text-surface-700/15'}>•</span>
                                    <span>build {new Date(config.buildTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </footer>

            {/* ── CSS Animations ── */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -20px) scale(1.05); }
                    66% { transform: translate(-20px, 15px) scale(0.95); }
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    opacity: 0;
                }
            `}</style>
        </div>
    );
}
