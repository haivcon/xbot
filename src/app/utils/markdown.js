const { escapeHtml } = require('../../utils/text');

const EXTENDED_PICTOGRAPHIC_REGEX = /\p{Extended_Pictographic}/u;
let graphemeSegmenter;

try {
    graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
} catch (error) {
    graphemeSegmenter = null;
}

function isFullWidthCodePoint(codePoint) {
    if (Number.isNaN(codePoint)) {
        return false;
    }

    return (
        codePoint >= 0x1100 &&
        (
            codePoint <= 0x115f ||
            codePoint === 0x2329 ||
            codePoint === 0x232a ||
            (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
            (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
            (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
            (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
            (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
            (codePoint >= 0xff00 && codePoint <= 0xff60) ||
            (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
            (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
            (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
        )
    );
}

function measureDisplayWidth(text) {
    const graphemes = graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(text || ''), (item) => item.segment)
        : Array.from(text || '');

    let width = 0;
    for (const grapheme of graphemes) {
        const codePoint = grapheme.codePointAt(0);
        if (EXTENDED_PICTOGRAPHIC_REGEX.test(grapheme) || isFullWidthCodePoint(codePoint)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

function padDisplayText(text, width) {
    const raw = text || '';
    const len = measureDisplayWidth(raw);
    if (len >= width) {
        return raw;
    }
    return raw + ' '.repeat(width - len);
}

function looksLikeTableRow(line) {
    if (!line || typeof line !== 'string') {
        return false;
    }
    const pipeCount = (line.match(/\|/g) || []).length;
    return pipeCount >= 2;
}

function isTableSeparatorLine(line) {
    if (!line || typeof line !== 'string') {
        return false;
    }
    const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
    if (!cells.length) {
        return false;
    }
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeTableCellText(text) {
    if (text === undefined || text === null) {
        return '';
    }

    let cleaned = String(text);

    cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    cleaned = cleaned.replace(/[`*_~]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

function mapBoldChar(char) {
    const code = char.codePointAt(0);
    if (code >= 0x41 && code <= 0x5a) {
        return String.fromCodePoint(0x1d400 + (code - 0x41));
    }
    if (code >= 0x61 && code <= 0x7a) {
        return String.fromCodePoint(0x1d41a + (code - 0x61));
    }
    if (code >= 0x30 && code <= 0x39) {
        return String.fromCodePoint(0x1d7ce + (code - 0x30));
    }
    return char;
}

function formatCommandText(commandText, { context = 'html' } = {}) {
    if (!commandText) {
        return '';
    }

    if (context === 'html') {
        return `<b>${escapeHtml(commandText)}</b>`;
    }

    const mapped = Array.from(commandText)
        .map((ch) => mapBoldChar(ch))
        .join('');

    return mapped;
}

function formatCommandLabel(commandText, { icon = '', context = 'html' } = {}) {
    const formatted = formatCommandText(commandText, { context });
    if (!formatted) {
        return icon || '';
    }
    return icon ? `${icon} ${formatted}` : formatted;
}

function formatMarkdownTableBlock(lines, options = {}) {
    const MAX_COLUMN_WIDTH = options.maxColumnWidth || 40;
    const MIN_COLUMN_WIDTH = options.minColumnWidth || 6;
    const MAX_TABLE_WIDTH = options.maxWidth || 70;
    const TARGET_TABLE_WIDTH = Math.min(options.targetWidth || MAX_TABLE_WIDTH, MAX_TABLE_WIDTH);

    const borderStyle = options.borderStyle === 'ascii'
        ? {
            horizontal: '-',
            vertical: '|',
            topLeft: '+',
            topJoin: '+',
            topRight: '+',
            midLeft: '+',
            midJoin: '+',
            midRight: '+',
            bottomLeft: '+',
            bottomJoin: '+',
            bottomRight: '+'
        }
        : {
            horizontal: '═',
            vertical: '║',
            topLeft: '╔',
            topJoin: '╦',
            topRight: '╗',
            midLeft: '╠',
            midJoin: '╬',
            midRight: '╣',
            bottomLeft: '╚',
            bottomJoin: '╩',
            bottomRight: '╝'
        };
    const rows = [];

    for (const line of lines || []) {
        const parts = line.split('|').map((cell) => normalizeTableCellText(cell));
        if (parts.length && parts[0] === '') {
            parts.shift();
        }
        if (parts.length && parts[parts.length - 1] === '') {
            parts.pop();
        }

        if (!parts.length) {
            continue;
        }

        const isSeparator = parts.every((cell) => /^:?-{3,}:?$/.test(cell));
        if (isSeparator) {
            continue;
        }

        rows.push(parts);
    }

    if (!rows.length) {
        return lines.join('\n');
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const columnWidths = new Array(columnCount).fill(0);

    for (const row of rows) {
        while (row.length < columnCount) {
            row.push('');
        }
        row.forEach((cell, idx) => {
            const width = measureDisplayWidth(cell);
            columnWidths[idx] = Math.min(Math.max(columnWidths[idx], width), MAX_COLUMN_WIDTH);
        });
    }

    const totalWidth = () =>
        columnWidths.reduce((sum, width) => sum + width + 2, 0) + Math.max(0, columnCount - 1);

    const shrinkColumns = () => {
        const overBy = totalWidth() - MAX_TABLE_WIDTH;
        if (overBy <= 0) {
            return false;
        }

        const adjustable = columnWidths
            .map((width, idx) => ({ idx, width, spare: width - MIN_COLUMN_WIDTH }))
            .filter((col) => col.spare > 0);

        if (!adjustable.length) {
            return false;
        }

        const totalSpare = adjustable.reduce((sum, col) => sum + col.spare, 0);
        if (totalSpare <= 0) {
            return false;
        }

        adjustable.forEach((col) => {
            const share = Math.min(col.spare, Math.ceil((col.spare / totalSpare) * overBy));
            columnWidths[col.idx] -= share;
        });

        return true;
    };

    while (totalWidth() > MAX_TABLE_WIDTH) {
        if (!shrinkColumns()) {
            break;
        }
    }

    const growColumns = () => {
        const underBy = TARGET_TABLE_WIDTH - totalWidth();
        if (underBy <= 0) {
            return false;
        }

        const expandable = columnWidths
            .map((width, idx) => ({ idx, width, spare: MAX_COLUMN_WIDTH - width }))
            .filter((col) => col.spare > 0);

        if (!expandable.length) {
            return false;
        }

        const totalSpare = expandable.reduce((sum, col) => sum + col.spare, 0);
        if (totalSpare <= 0) {
            return false;
        }

        expandable.forEach((col) => {
            const share = Math.min(col.spare, Math.ceil((col.spare / totalSpare) * underBy));
            columnWidths[col.idx] += share;
        });

        return true;
    };

    while (totalWidth() < TARGET_TABLE_WIDTH) {
        if (!growColumns()) {
            break;
        }
    }

    const wrapCell = (cell, width) => {
        const words = (cell || '').split(/(\s+)/).filter((w) => w.length > 0);
        const linesOut = [];
        let current = '';
        let currentWidth = 0;

        const flush = () => {
            linesOut.push(current || '');
            current = '';
            currentWidth = 0;
        };

        for (const word of words) {
            const wordWidth = measureDisplayWidth(word);
            if (wordWidth > width) {
                if (current) {
                    flush();
                }
                let buffer = word;
                while (buffer.length) {
                    let slice = '';
                    let sliceWidth = 0;
                    for (const char of buffer) {
                        const charWidth = measureDisplayWidth(char);
                        if (sliceWidth + charWidth > width && slice) {
                            break;
                        }
                        slice += char;
                        sliceWidth += charWidth;
                    }
                    linesOut.push(slice);
                    buffer = buffer.slice(slice.length);
                }
                continue;
            }

            if (currentWidth + wordWidth > width) {
                flush();
            }

            current += word;
            currentWidth += wordWidth;
        }

        if (current || !linesOut.length) {
            flush();
        }

        return linesOut;
    };

    const buildBorder = (left, middle, right) => {
        const segments = columnWidths.map((width) => borderStyle.horizontal.repeat(width + 2));
        return `${left}${segments.join(middle)}${right}`;
    };

    const formatWrappedRow = (row) => {
        const wrappedCells = row.map((cell, idx) => wrapCell(cell, columnWidths[idx]));
        const rowHeight = Math.max(...wrappedCells.map((lines) => lines.length));
        const linesOut = [];

        for (let lineIdx = 0; lineIdx < rowHeight; lineIdx += 1) {
            const padded = wrappedCells.map((lines, idx) => padDisplayText(lines[lineIdx] || '', columnWidths[idx]));
            linesOut.push(`${borderStyle.vertical} ${padded.join(` ${borderStyle.vertical} `)} ${borderStyle.vertical}`);
        }

        return linesOut;
    };

    const output = [];
    output.push(buildBorder(borderStyle.topLeft, borderStyle.topJoin, borderStyle.topRight));
    formatWrappedRow(rows[0]).forEach((line) => output.push(line));

    if (rows.length > 1) {
        output.push(buildBorder(borderStyle.midLeft, borderStyle.midJoin, borderStyle.midRight));
        rows.slice(1).forEach((row, index, arr) => {
            formatWrappedRow(row).forEach((line) => output.push(line));
            if (index < arr.length - 1) {
                output.push(buildBorder(borderStyle.midLeft, borderStyle.midJoin, borderStyle.midRight));
            }
        });
    }

    output.push(buildBorder(borderStyle.bottomLeft, borderStyle.bottomJoin, borderStyle.bottomRight));

    return output.join('\n');
}

function formatBoldMarkdownToHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }

    const parts = [];
    let lastIndex = 0;
    const regex = /\*\*(.+?)\*\*/gs;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const [fullMatch, boldContent] = match;
        const start = match.index;
        if (start > lastIndex) {
            parts.push(escapeHtml(text.slice(lastIndex, start)));
        }
        parts.push(`<b>${escapeHtml(boldContent)}</b>`);
        lastIndex = start + fullMatch.length;
    }

    if (lastIndex < text.length) {
        parts.push(escapeHtml(text.slice(lastIndex)));
    }

    return parts.join('');
}

function escapeMarkdownV2(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text.replace(/([_*\\>`\[\]()~>#+\-=|{}.!])/g, '\\$1');
}

function convertMarkdownToTelegram(text) {
    if (typeof text !== 'string') {
        return '';
    }

    // ── Convert HTML tags to Markdown equivalents ──
    // This handles cases where the AI responds with HTML formatting
    let working = text;
    working = working.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**');
    working = working.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');
    working = working.replace(/<i>([\s\S]*?)<\/i>/gi, '_$1_');
    working = working.replace(/<em>([\s\S]*?)<\/em>/gi, '_$1_');
    working = working.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
    working = working.replace(/<pre>([\s\S]*?)<\/pre>/gi, '```$1```');
    working = working.replace(/<br\s*\/?>/gi, '\n');
    // Strip any remaining HTML tags
    working = working.replace(/<[^>]+>/g, '');

    const placeholders = [];

    const toPlaceholder = (content) => {
        const key = `@@MDPH${placeholders.length}@@`;
        placeholders.push({ key, content });
        return key;
    };

    working = working.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => `**${title.trim()}**`);

    const lines = working.split('\n');
    const rebuilt = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (looksLikeTableRow(line) && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
            const tableLines = [line];
            i += 1;
            while (i + 1 < lines.length && looksLikeTableRow(lines[i + 1])) {
                tableLines.push(lines[i + 1]);
                i += 1;
            }

            const formattedTable = formatMarkdownTableBlock(tableLines);
            rebuilt.push(toPlaceholder(['```', escapeMarkdownV2(formattedTable), '```'].join('\n')));
            continue;
        }

        rebuilt.push(line);
    }

    working = rebuilt.join('\n');

    working = working.replace(/```([\s\S]*?)```/g, (match, code) => toPlaceholder(['```', escapeMarkdownV2(code), '```'].join('\n')));
    working = working.replace(/`([^`]+)`/g, (match, code) => toPlaceholder(`\`${escapeMarkdownV2(code)}\``));
    working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const safeLabel = escapeMarkdownV2(label);
        const safeUrl = escapeMarkdownV2(url);
        return toPlaceholder(`[${safeLabel}](${safeUrl})`);
    });
    working = working.replace(/\*\*([^*]+)\*\*/g, (match, boldText) => toPlaceholder(`*${escapeMarkdownV2(boldText)}*`));
    working = working.replace(/__(.+?)__/g, (match, underlineText) => toPlaceholder(`__${escapeMarkdownV2(underlineText)}__`));
    working = working.replace(/~~(.+?)~~/g, (match, strikeText) => toPlaceholder(`~${escapeMarkdownV2(strikeText)}~`));
    working = working.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (match, italicText) => toPlaceholder(`_${escapeMarkdownV2(italicText)}_`));

    const escaped = escapeMarkdownV2(working);
    let restored = escaped;

    for (const { key, content } of placeholders) {
        restored = restored.split(key).join(content);
    }

    if (/@@MDPH\d+@@/.test(restored)) {
        restored = restored.replace(/@@MDPH\d+@@/g, '');
    }

    return restored;
}

function formatCopyableValueHtml(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    if (!text) {
        return null;
    }
    const encoded = encodeURIComponent(text);
    const code = `<code>${escapeHtml(text)}</code>`;
    return `<a href="https://t.me/share/url?url=${encoded}&text=${encoded}">${code}</a>`;
}

module.exports = {
    formatCommandLabel,
    formatMarkdownTableBlock,
    convertMarkdownToTelegram,
    escapeMarkdownV2,
    formatCopyableValueHtml,
    formatBoldMarkdownToHtml
};
