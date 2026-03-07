const TELEGRAM_MESSAGE_SAFE_LENGTH = (() => {
    const value = Number(process.env.TELEGRAM_MESSAGE_SAFE_LENGTH || 3900);
    return Number.isFinite(value) && value > 100 ? Math.min(Math.floor(value), 4050) : 3900;
})();

function splitTelegramMessageText(text, limit = TELEGRAM_MESSAGE_SAFE_LENGTH) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : TELEGRAM_MESSAGE_SAFE_LENGTH;
    if (!text) {
        return [''];
    }

    const lines = String(text).split('\n');
    const chunks = [];
    let current = '';

    const pushCurrent = () => {
        if (current) {
            chunks.push(current);
            current = '';
        }
    };

    for (const line of lines) {
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > safeLimit) {
            pushCurrent();
            if (line.length > safeLimit) {
                for (let offset = 0; offset < line.length; offset += safeLimit) {
                    chunks.push(line.slice(offset, offset + safeLimit));
                }
            } else {
                current = line;
            }
            continue;
        }
        current = candidate;
    }

    pushCurrent();

    return chunks.length > 0 ? chunks : [''];
}

function splitTelegramMarkdownV2Text(text, limit = TELEGRAM_MESSAGE_SAFE_LENGTH) {
    const fenceOverhead = 6; // room for closing + reopening ``` when needed
    const baseLimit = Math.max(1, (Number.isFinite(limit) && limit > 0 ? limit : TELEGRAM_MESSAGE_SAFE_LENGTH) - fenceOverhead);
    const baseChunks = splitTelegramMessageText(text, baseLimit);

    let carryFenceOpen = false;
    const fixed = [];

    for (const chunk of baseChunks) {
        if (!chunk || !chunk.trim()) {
            continue;
        }

        let fenceState = carryFenceOpen;
        const fenceRegex = /```/g;
        while (fenceRegex.exec(chunk) !== null) {
            fenceState = !fenceState;
        }

        let working = chunk;
        if (carryFenceOpen) {
            working = ['```', working].join('\n');
        }

        if (fenceState) {
            working = [working, '```'].join('\n');
        }

        carryFenceOpen = fenceState;
        fixed.push(working);
    }

    return fixed.length > 0 ? fixed : [''];
}

function extractThreadId(source) {
    if (!source) {
        return null;
    }

    const directThreadId = Object.prototype.hasOwnProperty.call(source, 'message_thread_id')
        ? source.message_thread_id
        : undefined;

    if (directThreadId !== undefined && directThreadId !== null) {
        return directThreadId;
    }

    const nestedThreadId = Object.prototype.hasOwnProperty.call(source, 'message')
        ? source.message?.message_thread_id
        : undefined;
    if (nestedThreadId !== undefined && nestedThreadId !== null) {
        return nestedThreadId;
    }

    const replyThreadId =
        source.reply_to_message?.message_thread_id
        ?? source.message?.reply_to_message?.message_thread_id;
    if (replyThreadId !== undefined && replyThreadId !== null) {
        return replyThreadId;
    }

    return null;
}

function buildThreadedOptions(source, options = {}) {
    if (options && options.message_thread_id !== undefined && options.message_thread_id !== null) {
        // Skip thread_id 0 (General topic) - causes "message thread not found" error
        if (options.message_thread_id === 0) {
            const { message_thread_id, ...rest } = options;
            return rest;
        }
        return { ...options };
    }

    const threadId = extractThreadId(source);
    // Skip null, undefined, or 0 (General topic)
    if (threadId === undefined || threadId === null || threadId === 0) {
        return { ...options };
    }

    const finalOptions = {
        ...options,
        message_thread_id: threadId
    };

    return finalOptions;
}

module.exports = {
    TELEGRAM_MESSAGE_SAFE_LENGTH,
    splitTelegramMessageText,
    splitTelegramMarkdownV2Text,
    extractThreadId,
    buildThreadedOptions
};
