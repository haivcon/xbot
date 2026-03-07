const { ethers } = require('ethers');

function formatUsdPrice(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
        return '0.0000';
    }

    let minimumFractionDigits = 2;
    let maximumFractionDigits = 2;

    if (numeric < 1 && numeric >= 0.01) {
        minimumFractionDigits = 4;
        maximumFractionDigits = 4;
    } else if (numeric < 0.01 && numeric >= 0.0001) {
        minimumFractionDigits = 6;
        maximumFractionDigits = 6;
    } else if (numeric < 0.0001) {
        minimumFractionDigits = 8;
        maximumFractionDigits = 8;
    }

    return numeric.toLocaleString('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });
}

function formatUsdCompact(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric === 0) {
        return '-';
    }

    try {
        return numeric.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
            maximumFractionDigits: 2
        });
    } catch (error) {
        const abs = Math.abs(numeric);
        if (abs >= 1e9) {
            return `$${(numeric / 1e9).toFixed(2)}B`;
        }
        if (abs >= 1e6) {
            return `$${(numeric / 1e6).toFixed(2)}M`;
        }
        if (abs >= 1e3) {
            return `$${(numeric / 1e3).toFixed(2)}K`;
        }
        return `$${numeric.toFixed(2)}`;
    }
}

function formatPercentage(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '0.00%';
    }

    const { minimumFractionDigits = 2, maximumFractionDigits = 2, includeSign = true } = options;
    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });

    const formatted = formatter.format(Math.abs(numeric));
    const sign = includeSign ? (numeric >= 0 ? '+' : '-') : '';
    return `${sign}${formatted}%`;
}

function normalizePercentageValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    if (Math.abs(numeric) <= 1) {
        return numeric * 100;
    }

    return numeric;
}

function formatTokenQuantity(amount, options = {}) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
        return '-';
    }

    const { minimumFractionDigits = 2, maximumFractionDigits = 4 } = options;
    return numeric.toLocaleString('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });
}

function parseBigIntValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'bigint') {
        return value;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return null;
        }
        return BigInt(Math.trunc(value));
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/[,_\s]/g, '');
        if (!cleaned) {
            return null;
        }

        if (/^-?\d+$/.test(cleaned)) {
            try {
                return BigInt(cleaned);
            } catch (error) {
                return null;
            }
        }
    }

    return null;
}

function formatBigIntValue(value, decimals = 18, options = {}) {
    if (value === null || value === undefined) {
        return null;
    }

    let bigIntValue;
    try {
        bigIntValue = BigInt(value);
    } catch (error) {
        return null;
    }

    let safeDecimals = Number(decimals);
    if (!Number.isFinite(safeDecimals) || safeDecimals < 0) {
        safeDecimals = 18;
    }

    try {
        return ethers.formatUnits(bigIntValue, safeDecimals, options);
    } catch (error) {
        return null;
    }
}

function formatTokenAmountFromUnits(amount, decimals, options = {}) {
    const bigIntValue = parseBigIntValue(amount);
    if (bigIntValue === null) {
        return null;
    }

    const digits = Number.isFinite(decimals) ? Math.max(0, Math.trunc(decimals)) : 0;

    try {
        const formatted = ethers.formatUnits(bigIntValue, digits);
        const numeric = Number(formatted);
        if (Number.isFinite(numeric)) {
            const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
                ? options.minimumFractionDigits
                : (Math.abs(numeric) < 1 ? 6 : 2);
            const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
                ? options.maximumFractionDigits
                : Math.max(minimumFractionDigits, Math.abs(numeric) < 1 ? 8 : 6);

            return numeric.toLocaleString('en-US', {
                minimumFractionDigits,
                maximumFractionDigits
            });
        }

        return formatted;
    } catch (error) {
        return null;
    }
}

function formatTimestampRange(startMs, endMs) {
    const start = startMs ? new Date(startMs) : null;
    const end = endMs ? new Date(endMs) : null;

    const format = (date) => {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '-';
        }
        return date.toISOString().replace('T', ' ').slice(0, 16);
    };

    return { start: format(start), end: format(end) };
}

function formatRelativeTime(timestampMs) {
    if (!Number.isFinite(Number(timestampMs))) {
        return null;
    }

    const now = Date.now();
    const diffMs = now - Number(timestampMs);
    if (!Number.isFinite(diffMs)) {
        return null;
    }

    const diffSeconds = Math.max(Math.round(diffMs / 1000), 0);
    if (diffSeconds < 60) {
        return `${diffSeconds}s`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes}m`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 48) {
        return `${diffHours}h`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
        return `${diffDays}d`;
    }

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
        return `${diffMonths}mo`;
    }

    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears}y`;
}

function renderSparkline(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    const numericValues = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

    if (numericValues.length === 0) {
        return null;
    }

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    if (min === max) {
        return '▁'.repeat(numericValues.length);
    }

    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const scale = (value) => {
        const normalized = (value - min) / (max - min);
        const index = Math.min(blocks.length - 1, Math.max(0, Math.round(normalized * (blocks.length - 1))));
        return blocks[index];
    };

    return numericValues.map((value) => scale(value)).join('');
}

function parseDecimalStringParts(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }

    const sanitized = trimmed.replace(/[,�]/g, '');
    const match = sanitized.match(/^([+-]?)(\d*(?:\.\d*)?)(?:[eE]([+-]?\d+))?$/);
    if (!match) {
        return null;
    }

    const signChar = match[1] || '+';
    let base = match[2];
    let exponent = match[3] ? Number(match[3]) : 0;

    if (!base || base === '.') {
        base = '0';
    }

    if (!Number.isFinite(exponent)) {
        exponent = 0;
    }

    if (!base.includes('.')) {
        base = `${base}.`;
    }

    let [intPartRaw, fracPartRaw = ''] = base.split('.');
    if (!intPartRaw) {
        intPartRaw = '0';
    }

    let intPart = intPartRaw;
    let fracPart = fracPartRaw;

    if (exponent > 0) {
        if (fracPart.length <= exponent) {
            intPart = `${intPart}${fracPart}${'0'.repeat(exponent - fracPart.length)}`;
            fracPart = '';
        } else {
            intPart = `${intPart}${fracPart.slice(0, exponent)}`;
            fracPart = fracPart.slice(exponent);
        }
    } else if (exponent < 0) {
        const shift = Math.abs(exponent);
        if (intPart.length <= shift) {
            const zerosNeeded = shift - intPart.length;
            fracPart = `${'0'.repeat(zerosNeeded)}${intPart}${fracPart}`;
            intPart = '0';
        } else {
            const splitIndex = intPart.length - shift;
            fracPart = `${intPart.slice(splitIndex)}${fracPart}`;
            intPart = intPart.slice(0, splitIndex);
        }
    }

    const digits = `${intPart}${fracPart}`.replace(/^0+/, '') || '0';
    const scale = fracPart.length;
    const sign = signChar === '-' ? -1 : 1;
    return { sign, digits, scale };
}

function multiplyDecimalStrings(valueA, valueB) {
    const partsA = parseDecimalStringParts(valueA);
    const partsB = parseDecimalStringParts(valueB);
    if (!partsA || !partsB) {
        return null;
    }

    if (partsA.digits === '0' || partsB.digits === '0') {
        return '0';
    }

    const resultSign = partsA.sign * partsB.sign;
    let productDigits;
    try {
        productDigits = (BigInt(partsA.digits) * BigInt(partsB.digits)).toString();
    } catch (error) {
        return null;
    }

    const scale = partsA.scale + partsB.scale;
    if (scale > 0) {
        if (productDigits.length <= scale) {
            productDigits = productDigits.padStart(scale + 1, '0');
        }
        const intPart = productDigits.slice(0, productDigits.length - scale) || '0';
        const fracPart = productDigits.slice(productDigits.length - scale);
        const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0';
        const normalizedFrac = fracPart.replace(/0+$/, '');
        const combined = normalizedFrac ? `${normalizedInt}.${normalizedFrac}` : normalizedInt;
        if (resultSign < 0 && combined !== '0') {
            return `-${combined}`;
        }
        return combined;
    }

    const normalizedInt = productDigits.replace(/^0+(?=\d)/, '') || '0';
    if (resultSign < 0 && normalizedInt !== '0') {
        return `-${normalizedInt}`;
    }
    return normalizedInt;
}

function subtractDecimalStrings(valueA, valueB) {
    const partsA = parseDecimalStringParts(valueA);
    const partsB = parseDecimalStringParts(valueB);
    if (!partsA || !partsB) {
        return null;
    }

    const targetScale = Math.max(partsA.scale, partsB.scale);
    const scaleDiffA = targetScale - partsA.scale;
    const scaleDiffB = targetScale - partsB.scale;

    let digitsA;
    let digitsB;
    try {
        const multiplierA = 10n ** BigInt(Math.max(0, scaleDiffA));
        const multiplierB = 10n ** BigInt(Math.max(0, scaleDiffB));
        digitsA = BigInt(partsA.digits) * multiplierA;
        digitsB = BigInt(partsB.digits) * multiplierB;
    } catch (error) {
        return null;
    }

    const signedA = partsA.sign < 0 ? -digitsA : digitsA;
    const signedB = partsB.sign < 0 ? -digitsB : digitsB;

    const diff = signedA - signedB;
    if (diff === 0n) {
        return '0';
    }

    const isNegative = diff < 0n;
    const absolute = isNegative ? -diff : diff;
    let digits = absolute.toString();

    if (targetScale > 0) {
        if (digits.length <= targetScale) {
            digits = digits.padStart(targetScale + 1, '0');
        }
        const intPart = digits.slice(0, digits.length - targetScale) || '0';
        const fracPart = digits.slice(digits.length - targetScale);
        const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0';
        const normalizedFrac = fracPart.replace(/0+$/, '');
        const combined = normalizedFrac ? `${normalizedInt}.${normalizedFrac}` : normalizedInt;
        if (combined === '0') {
            return '0';
        }
        return isNegative ? `-${combined}` : combined;
    }

    const normalizedInt = digits.replace(/^0+(?=\d)/, '') || '0';
    if (normalizedInt === '0') {
        return '0';
    }
    return isNegative ? `-${normalizedInt}` : normalizedInt;
}

module.exports = {
    formatBigIntValue,
    formatPercentage,
    formatRelativeTime,
    formatTimestampRange,
    formatTokenAmountFromUnits,
    formatTokenQuantity,
    formatUsdCompact,
    formatUsdPrice,
    multiplyDecimalStrings,
    normalizePercentageValue,
    parseBigIntValue,
    parseDecimalStringParts,
    renderSparkline,
    subtractDecimalStrings
};
