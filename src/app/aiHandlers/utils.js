/**
 * AI Handlers Utilities
 * Shared utility functions for AI modules
 */

const { aiTokenUsageByUser, intentCache, INTENT_CACHE_TTL } = require('./sharedState');

/**
 * Safe JSON parse with fallback
 */
function safeJsonParse(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

/**
 * Check if line starts with emoji
 */
function startsWithEmoji(line) {
    return /^\s*[\u2600-\u27BF]/.test(line || '');
}

/**
 * Pick contextual icon based on line content
 */
function pickContextIcon(line) {
    const normalized = (line || '').toLowerCase();
    const rules = [
        { icon: '⚠️', test: /(caution|warning|rủi ro|rui ro|chú ý|chu y|lưu ý|luu y|issue|problem|error|lỗi|loi|fail|bug)/i },
        { icon: '✅', test: /(success|thành công|hoàn thành|done|fixed|resolved|ok)/i },
        { icon: '💡', test: /(tip|hint|idea|gợi ý|goi y|suggest|note|lời khuyên|loi khuyen)/i },
        { icon: '🧠', test: /(analysis|phân tích|phan tich|insight|logic|strategy|chiến lược|chien luoc)/i },
        { icon: '🧭', test: /(step|bước|buoc|hướng dẫn|huong dan|roadmap|plan|todo|checklist)/i },
        { icon: '🛠️', test: /(setup|install|cài đặt|cai dat|config|configure|sửa|sua|chỉnh|chinh|patch|fix)/i },
        { icon: '🚀', test: /(deploy|launch|kick off|bắt đầu|bat dau|start|bật|mo|rollout|go live)/i },
        { icon: '📌', test: /(example|ví dụ|vd:|vi du|sample|demo)/i },
        { icon: '📊', test: /(data|số liệu|so lieu|metric|thống kê|thong ke|analytics|chart|report)/i },
        { icon: '⏰', test: /(deadline|time|giờ|gio|ngày|ngay|schedule|lịch|lich|due)/i },
        { icon: '🔗', test: /(link|url|http|https|liên kết|lien ket)/i },
        { icon: '🧑‍💻', test: /(code|snippet|command|lệnh|lenh|script|terminal|cli)/i },
        { icon: '📦', test: /(kết quả|ket qua|output|result|payload|response)/i },
        { icon: '❓', test: /\?\s*$|\b(how|what|why|where|when|khi nao|bao gio|là gì|la gi)\b/i }
    ];
    for (const rule of rules) {
        if (rule.test.test(normalized)) {
            return rule.icon;
        }
    }
    return null;
}

/**
 * Decorate text with contextual icons
 */
function decorateWithContextualIcons(text) {
    if (!text) return text;
    const lines = String(text).split('\n');
    let inCodeFence = false;
    const decorated = lines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
            inCodeFence = !inCodeFence;
            return line;
        }
        if (inCodeFence || !trimmed) {
            return line;
        }
        if (/^\s*>/.test(line) || startsWithEmoji(trimmed)) {
            return line;
        }
        const icon = pickContextIcon(trimmed);
        if (!icon) return line;
        const bulletMatch = line.match(/^(\s*[-*•]\s+)(.+)$/);
        if (bulletMatch) {
            return `${bulletMatch[1]}${icon} ${bulletMatch[2]}`;
        }
        const orderedMatch = line.match(/^(\s*\d+[.)]\s+)(.+)$/);
        if (orderedMatch) {
            return `${orderedMatch[1]}${icon} ${orderedMatch[2]}`;
        }
        return `${icon} ${trimmed}`;
    });
    return decorated.join('\n');
}

/**
 * Record AI token usage for user
 */
function recordAiTokenUsage(userId, prompt = 0, completion = 0, total = 0) {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    let entry = aiTokenUsageByUser.get(userId);
    if (!entry || entry.date !== today) {
        entry = { date: today, prompt: 0, completion: 0, total: 0, images: 0 };
    }
    entry.prompt += Number(prompt) || 0;
    entry.completion += Number(completion) || 0;
    entry.total += Number(total) || 0;
    aiTokenUsageByUser.set(userId, entry);
}

/**
 * Record image generation usage
 */
function recordImageUsage(userId) {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    let entry = aiTokenUsageByUser.get(userId);
    if (!entry || entry.date !== today) {
        entry = { date: today, prompt: 0, completion: 0, total: 0, images: 0 };
    }
    entry.images += 1;
    aiTokenUsageByUser.set(userId, entry);
}

/**
 * Get AI token usage for user
 */
function getAiTokenUsage(userId) {
    if (!userId) return null;
    const entry = aiTokenUsageByUser.get(userId);
    const today = new Date().toISOString().slice(0, 10);
    if (entry && entry.date === today) return entry;
    return { date: today, prompt: 0, completion: 0, total: 0, images: 0 };
}

/**
 * Normalize Gemini model name
 */
function normalizeGeminiModelName(modelName) {
    return String(modelName || '').replace(/^models\//, '');
}

/**
 * Format model ID for display
 */
function formatModelId(modelName) {
    return normalizeGeminiModelName(modelName);
}

/**
 * Apply thread ID to options
 */
function applyThreadId(source, options = {}) {
    const threadId = source?.message_thread_id;
    if (threadId) {
        return { ...options, message_thread_id: threadId };
    }
    return options;
}

module.exports = {
    safeJsonParse,
    startsWithEmoji,
    pickContextIcon,
    decorateWithContextualIcons,
    recordAiTokenUsage,
    recordImageUsage,
    getAiTokenUsage,
    normalizeGeminiModelName,
    formatModelId,
    applyThreadId
};
