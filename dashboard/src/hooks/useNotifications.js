import { useEffect, useRef } from 'react';

/**
 * useNotifications — Browser push notification wrapper
 * Requests permission on mount and provides a notify() function.
 */
export default function useNotifications() {
    const permission = useRef(Notification?.permission || 'default');

    useEffect(() => {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(p => { permission.current = p; });
        }
    }, []);

    const notify = (title, options = {}) => {
        if (!('Notification' in window) || permission.current !== 'granted') return null;
        try {
            return new Notification(title, {
                icon: '/logos/banmao.png',
                badge: '/logos/banmao.png',
                tag: options.tag || 'xbot',
                ...options,
            });
        } catch { return null; }
    };

    return { notify, permission: permission.current };
}
