function createRandomTextHelpers({ t, escapeHtml, formatExecutionAudit, defaultLang }) {
    if (!t || !escapeHtml || !formatExecutionAudit) {
        throw new Error('t, escapeHtml and formatExecutionAudit are required');
    }

    function formatOpponentAudit(opponent, lang = defaultLang) {
        const fullName = [opponent?.first_name, opponent?.last_name].filter(Boolean).join(' ') || opponent?.username || 'N/A';
        const username = opponent?.username ? `@${escapeHtml(opponent.username)}` : 'N/A';
        const userId = opponent?.id ? escapeHtml(opponent.id.toString()) : 'N/A';

        return [
            `👤 <b>${escapeHtml(t(lang, 'random_gomoku_opponent_title'))}</b>`,
            `🪪 ${escapeHtml(t(lang, 'audit_name_label'))}: ${escapeHtml(fullName)}`,
            `🔗 ${escapeHtml(t(lang, 'audit_username_label'))}: ${username}`,
            `🆔 ${escapeHtml(t(lang, 'audit_id_label'))}: <code>${userId}</code>`
        ].join('\n');
    }

    function buildRandomGameText(bodyText, actor, lang, opponent = null) {
        const safeBody = bodyText || '';
        const audit = formatExecutionAudit(actor || {}, lang);
        const sections = [safeBody];
        if (opponent) {
            sections.push('', formatOpponentAudit(opponent, lang));
        }
        sections.push('', audit);
        return sections.join('\n');
    }

    return {
        buildRandomGameText
    };
}

module.exports = createRandomTextHelpers;
