'use strict';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_JSON_BYTES = 64 * 1024;

function hasReviewedSignature(bytes, mime) {
    if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
        && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    return false;
}

class AvatarError extends Error {
    constructor(code, statusCode) {
        super(code);
        this.name = 'AvatarError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

async function readBounded(response, maxBytes, tooLargeCode) {
    const declared = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new AvatarError(tooLargeCode, 502);
    if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
        throw new AvatarError('AVATAR_UPSTREAM_MALFORMED', 502);
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        total += bytes.length;
        if (total > maxBytes) throw new AvatarError(tooLargeCode, 502);
        chunks.push(bytes);
    }
    return Buffer.concat(chunks, total);
}

async function readTelegramJson(response) {
    if (!response?.ok) throw new AvatarError('AVATAR_UPSTREAM_FAILED', 502);
    const bytes = await readBounded(response, MAX_JSON_BYTES, 'AVATAR_UPSTREAM_MALFORMED');
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch {
        throw new AvatarError('AVATAR_UPSTREAM_MALFORMED', 502);
    }
    if (!data || data.ok !== true || !data.result || typeof data.result !== 'object') {
        throw new AvatarError('AVATAR_UPSTREAM_FAILED', 502);
    }
    return data.result;
}

function createTelegramAvatarService({
    token = process.env.TELEGRAM_TOKEN,
    fetchImpl = global.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES
} = {}) {
    async function getAvatar(userId) {
        if (!token || typeof fetchImpl !== 'function') {
            throw new AvatarError('AVATAR_SERVICE_UNAVAILABLE', 503);
        }
        const principal = String(userId || '');
        if (!principal) throw new AvatarError('AVATAR_SERVICE_UNAVAILABLE', 503);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const request = url => fetchImpl(url, { method: 'GET', redirect: 'error', signal: controller.signal });
        try {
            const profileUrl = new URL(`https://api.telegram.org/bot${token}/getUserProfilePhotos`);
            profileUrl.searchParams.set('user_id', principal);
            profileUrl.searchParams.set('offset', '0');
            profileUrl.searchParams.set('limit', '1');
            const profile = await readTelegramJson(await request(profileUrl.toString()));
            if (!Array.isArray(profile.photos) || profile.photos.length === 0) {
                throw new AvatarError('AVATAR_NOT_AVAILABLE', 404);
            }
            const candidates = profile.photos[0];
            if (!Array.isArray(candidates) || candidates.length === 0) {
                throw new AvatarError('AVATAR_UPSTREAM_MALFORMED', 502);
            }
            const photo = candidates
                .filter(item => item && typeof item.file_id === 'string' && Number.isFinite(item.width) && Number.isFinite(item.height))
                .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            if (!photo) throw new AvatarError('AVATAR_UPSTREAM_MALFORMED', 502);

            const fileUrl = new URL(`https://api.telegram.org/bot${token}/getFile`);
            fileUrl.searchParams.set('file_id', photo.file_id);
            const file = await readTelegramJson(await request(fileUrl.toString()));
            if (typeof file.file_path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(file.file_path)
                || file.file_path.startsWith('/') || file.file_path.split('/').includes('..')) {
                throw new AvatarError('AVATAR_UPSTREAM_MALFORMED', 502);
            }
            const encodedPath = file.file_path.split('/').map(encodeURIComponent).join('/');
            const downloadUrl = `https://api.telegram.org/file/bot${token}/${encodedPath}`;
            const response = await request(downloadUrl);
            if (!response?.ok) throw new AvatarError('AVATAR_UPSTREAM_FAILED', 502);
            const mime = String(response.headers?.get?.('content-type') || '').split(';', 1)[0].trim().toLowerCase();
            if (!ALLOWED_MIME.has(mime)) throw new AvatarError('AVATAR_UNSUPPORTED_MEDIA', 502);
            const bytes = await readBounded(response, maxBytes, 'AVATAR_TOO_LARGE');
            if (!hasReviewedSignature(bytes, mime)) throw new AvatarError('AVATAR_UNSUPPORTED_MEDIA', 502);
            return { bytes, mime };
        } catch (error) {
            if (error instanceof AvatarError) throw error;
            if (error?.name === 'AbortError' || controller.signal.aborted) {
                throw new AvatarError('AVATAR_UPSTREAM_TIMEOUT', 504);
            }
            throw new AvatarError('AVATAR_UPSTREAM_FAILED', 502);
        } finally {
            clearTimeout(timer);
        }
    }

    return { getAvatar };
}

module.exports = { AvatarError, createTelegramAvatarService };
