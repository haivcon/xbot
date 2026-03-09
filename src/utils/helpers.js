// Generic helpers shared across modules.
const { ethers } = require('ethers');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkInlineButtons(buttons, size = 3) {
    const rows = [];
    let current = [];

    for (const btn of buttons) {
        current.push(btn);
        if (current.length >= size) {
            rows.push(current);
            current = [];
        }
    }

    if (current.length) {
        rows.push(current);
    }

    return rows;
}

// Factory so callers can inject the secrets they want to redact.
function createSanitizeSecrets(defaultSecrets = []) {
    return (text, extraSecrets = []) => {
        if (!text) {
            return text;
        }

        const secrets = [...defaultSecrets, ...extraSecrets].filter(Boolean);
        const envSecretKeys = [
            'OPENAI_API_KEY',
            'ANTHROPIC_API_KEY',
            'GEMINI_API_KEY',
            'GEMINI_API_KEYS',
            'GROQ_API_KEY',
            'GROQ_API_KEYS',
            'HF_API_KEY',
            'HUGGINGFACE_API_KEY',
            'TELEGRAM_TOKEN'
        ];

        for (const key of envSecretKeys) {
            const raw = process.env[key];
            if (!raw) {
                continue;
            }
            const parts = Array.isArray(raw) ? raw : String(raw).split(',');
            for (const part of parts) {
                const trimmed = (part || '').trim();
                if (trimmed) {
                    secrets.push(trimmed);
                }
            }
        }

        let sanitized = String(text);
        for (const secret of secrets) {
            if (!secret) {
                continue;
            }
            const escaped = secret.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
            sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED]');
        }

        return sanitized;
    };
}

function normalizeAddress(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return ethers.getAddress(trimmed);
    } catch (error) {
        const basicHexPattern = /^0x[0-9a-fA-F]{40}$/;
        if (basicHexPattern.test(trimmed)) {
            return trimmed;
        }
    }

    return null;
}

// Alias — normalizeOkxConfigAddress is identical to normalizeAddress
const normalizeOkxConfigAddress = normalizeAddress;


function normalizeAddressSafe(address) {
    if (!address) {
        return null;
    }
    try {
        return ethers.getAddress(address);
    } catch (error) {
        return null;
    }
}

function shortenAddress(address) {
    if (!address || address.length < 10) {
        return address || '';
    }
    const normalized = normalizeAddressSafe(address) || address;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function normalizeNumeric(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/[,\s]/g, '');
        if (!cleaned) {
            return null;
        }
        const numeric = Number(cleaned);
        return Number.isFinite(numeric) ? numeric : null;
    }

    return null;
}

function decimalToRawBigInt(amount, decimals) {
    if (!Number.isFinite(Number(decimals))) {
        return null;
    }

    if (amount === undefined || amount === null) {
        return null;
    }

    const amountStr = String(amount).trim();
    if (!amountStr) {
        return null;
    }

    const decimalsInt = Number(decimals);
    const [intPart, fracPartRaw = ''] = amountStr.split('.');
    const fracPart = fracPartRaw.slice(0, Math.max(0, decimalsInt));
    const paddedFrac = fracPart.padEnd(Math.max(0, decimalsInt), '0');
    const combined = `${intPart || '0'}${paddedFrac}`.replace(/^0+(?=\d)/, '');

    try {
        return BigInt(combined || '0');
    } catch (error) {
        return null;
    }
}

function unwrapOkxData(payload) {
    if (!payload || typeof payload !== 'object') {
        return [];
    }

    const directData = payload.data !== undefined ? payload.data : payload.result;

    if (Array.isArray(directData)) {
        return directData;
    }

    if (directData && typeof directData === 'object') {
        const candidates = [
            directData.data,
            directData.items,
            directData.list,
            directData.rows,
            directData.result,
            directData.candles,
            directData.records,
            directData.trades,
            directData.pools,
            directData.liquidityList,
            directData.tokens,
            directData.tokenList
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                return candidate;
            }
        }
    }

    return [];
}

function unwrapOkxFirst(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const data = unwrapOkxData(payload);
    if (data.length > 0) {
        return data[0] || null;
    }

    if (payload.data && typeof payload.data === 'object') {
        return payload.data;
    }

    return null;
}

module.exports = {
    chunkInlineButtons,
    createSanitizeSecrets,
    delay,
    decimalToRawBigInt,
    normalizeAddress,
    normalizeAddressSafe,
    normalizeOkxConfigAddress,
    normalizeNumeric,
    shortenAddress,
    unwrapOkxData,
    unwrapOkxFirst
};
