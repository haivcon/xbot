import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '@/stores/authStore';
import config from '@/config';

const entries = new Map();
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function revokeEntry(key, entry) {
    if (entries.get(key) === entry) entries.delete(key);
    if (entry.url) {
        URL.revokeObjectURL(entry.url);
        entry.url = null;
    }
}

function clearAvatarCache() {
    for (const [key, entry] of entries) revokeEntry(key, entry);
}

if (typeof window !== 'undefined') {
    window.addEventListener('xbot:auth-changed', clearAvatarCache);
}

function acquireAvatar(key, token) {
    let entry = entries.get(key);
    if (!entry) {
        entry = { refs: 0, url: null, promise: null };
        entry.promise = fetch(`${config.apiBase}/user/avatar`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        }).then(async response => {
            if (!response.ok) return null;
            const mime = String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
            if (!ALLOWED_MIME.has(mime)) return null;
            const blob = await response.blob();
            if (!ALLOWED_MIME.has(blob.type)) return null;
            entry.url = URL.createObjectURL(blob);
            return entry.url;
        }).catch(() => null);
        entries.set(key, entry);
    }
    entry.refs += 1;
    return entry;
}

function releaseAvatar(key, entry) {
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0) {
        entry.promise.finally(() => {
            if (entry.refs === 0) revokeEntry(key, entry);
        });
    }
}

function initialsFor(user) {
    const values = [user?.first_name, user?.last_name]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    return (values.map(value => value[0]).join('').slice(0, 2) || '?').toUpperCase();
}

export default function UserAvatar({
    user,
    className = 'w-8 h-8 rounded-full',
    fallbackClassName = '',
    alt,
    icon: Icon,
    iconSize = 14,
}) {
    const token = useAuthStore(state => state.token);
    const authenticatedUser = useAuthStore(state => state.user);
    const currentUser = user || authenticatedUser;
    const key = useMemo(
        () => token && currentUser?.id != null ? `${currentUser.id}:${token}` : null,
        [token, currentUser?.id]
    );
    const [src, setSrc] = useState(null);

    useEffect(() => {
        setSrc(null);
        if (!key) return undefined;
        let active = true;
        const entry = acquireAvatar(key, token);
        entry.promise.then(url => { if (active) setSrc(url); });
        return () => {
            active = false;
            releaseAvatar(key, entry);
        };
    }, [key, token]);

    const handleError = () => {
        const entry = key ? entries.get(key) : null;
        if (entry) revokeEntry(key, entry);
        setSrc(null);
    };
    const label = alt || `${currentUser?.first_name || 'User'} avatar`;

    if (src) {
        return <img src={src} alt={label} className={`${className} object-cover`} onError={handleError} />;
    }

    return (
        <div
            role="img"
            aria-label={label}
            className={`${className} ${fallbackClassName || 'bg-gradient-to-br from-brand-600 to-purple-600 text-white font-bold'} flex items-center justify-center`}
        >
            {Icon ? <Icon size={iconSize} aria-hidden="true" /> : initialsFor(currentUser)}
        </div>
    );
}
