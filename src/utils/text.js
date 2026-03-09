function escapeHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Sanitize HTML to ensure all tags are properly matched for Telegram's strict parser.
 * Telegram only allows: b, i, u, s, code, pre, a, tg-spoiler, tg-emoji
 * This prevents "Unmatched end tag" errors (400 Bad Request).
 */
function sanitizeTelegramHtml(html) {
    if (!html) return html;

    const ALLOWED_TAGS = new Set(['b', 'i', 'u', 's', 'code', 'pre', 'a', 'tg-spoiler', 'tg-emoji']);
    const tagRegex = /<\/?([a-z][a-z0-9-]*)\b[^>]*\/?>/gi;
    const stack = [];
    let result = '';
    let lastIndex = 0;

    let match;
    const pieces = [];
    const tags = [];
    while ((match = tagRegex.exec(html)) !== null) {
        pieces.push(html.substring(lastIndex, match.index));
        tags.push({ full: match[0], name: match[1].toLowerCase(), index: pieces.length });
        pieces.push(null);
        lastIndex = tagRegex.lastIndex;
    }
    pieces.push(html.substring(lastIndex));

    for (const tag of tags) {
        const isClose = tag.full.startsWith('</');
        const isSelfClose = tag.full.endsWith('/>');

        if (!ALLOWED_TAGS.has(tag.name)) {
            pieces[tag.index] = '';
            continue;
        }

        if (isSelfClose) {
            pieces[tag.index] = '';
            continue;
        }

        if (isClose) {
            const openIdx = stack.lastIndexOf(tag.name);
            if (openIdx === -1) {
                pieces[tag.index] = '';
            } else {
                const unclosed = stack.splice(openIdx);
                const overlapping = unclosed.slice(1);
                let prefix = overlapping.map(t => `</${t}>`).reverse().join('');
                let suffix = overlapping.map(t => `<${t}>`).join('');
                pieces[tag.index] = prefix + tag.full + suffix;
                stack.push(...overlapping);
            }
        } else {
            stack.push(tag.name);
            pieces[tag.index] = tag.full;
        }
    }

    result = pieces.join('');
    while (stack.length > 0) {
        const unclosed = stack.pop();
        result += `</${unclosed}>`;
    }

    return result;
}

module.exports = {
    escapeHtml,
    sanitizeTelegramHtml
};
