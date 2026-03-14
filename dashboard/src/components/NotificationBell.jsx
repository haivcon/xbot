import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useWsStore from '@/stores/wsStore';

/**
 * NotificationBell — real-time notification bell with badge and dropdown.
 * Subscribes to WebSocket events (swap completed, limit order, DCA, etc.)
 */
export default function NotificationBell() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const ref = useRef(null);
    const { lastMessage } = useWsStore();

    const notifTitles = {
        swap_complete: t('dashboard.notif.swapComplete', 'Swap Completed'),
        limit_order_executed: t('dashboard.notif.limitOrder', 'Limit Order Executed'),
        transfer_complete: t('dashboard.notif.transferComplete', 'Transfer Completed'),
        dca_executed: t('dashboard.notif.dcaExecuted', 'DCA Executed'),
        price_alert: t('dashboard.notif.priceAlert', 'Price Alert'),
        report_generated: t('dashboard.notif.reportReady', 'Report Ready'),
    };

    // Listen for new WS messages
    useEffect(() => {
        if (!lastMessage) return;
        const data = typeof lastMessage === 'string' ? (() => { try { return JSON.parse(lastMessage); } catch { return null; } })() : lastMessage;
        if (!data) return;

        // Add actionable events as notifications
        const eventTypes = ['swap_complete', 'limit_order_executed', 'transfer_complete', 'dca_executed', 'price_alert', 'report_generated'];
        if (data.type && eventTypes.includes(data.type)) {
            const notification = {
                id: Date.now(),
                type: data.type,
                title: notifTitles[data.type] || t('dashboard.notif.notification', 'Notification'),
                message: data.message || data.summary || JSON.stringify(data.data || {}).substring(0, 100),
                ts: Date.now(),
                read: false,
            };
            setNotifications(prev => [notification, ...prev].slice(0, 50)); // keep last 50
        }
    }, [lastMessage]);

    // Close on outside click
    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const clearAll = () => {
        setNotifications([]);
        setOpen(false);
    };

    const formatTimeAgo = (ts) => {
        const diff = Date.now() - ts;
        if (diff < 60000) return t('dashboard.common.timeJustNow', 'Just now');
        if (diff < 3600000) return `${Math.floor(diff / 60000)}${t('dashboard.common.timeMinAgo', 'm ago')}`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t('dashboard.common.timeHourAgo', 'h ago')}`;
        return `${Math.floor(diff / 86400000)}${t('dashboard.common.timeDayAgo', 'd ago')}`;
    };

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
                className="relative p-2 rounded-xl hover:bg-white/5 transition-all"
            >
                <Bell size={18} className="text-surface-200/60" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-surface-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-[fadeIn_0.15s_ease]">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                        <span className="text-sm font-medium text-surface-100">{t('dashboard.header.notifications', 'Notifications')}</span>
                        {notifications.length > 0 && (
                            <button onClick={clearAll} className="text-[10px] text-surface-200/40 hover:text-red-400 transition-colors">
                                {t('dashboard.notif.clearAll', 'Clear all')}
                            </button>
                        )}
                    </div>
                    <div className="overflow-y-auto max-h-72">
                        {notifications.length === 0 ? (
                            <div className="py-10 text-center text-surface-200/30 text-xs">
                                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                                {t('dashboard.notif.noNotifications', 'No notifications yet')}
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div key={n.id} className={`px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${!n.read ? 'bg-brand-500/[0.03]' : ''}`}>
                                    <div className="flex items-start gap-2.5">
                                        <span className="text-base mt-0.5">{getNotificationIcon(n.type)}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-surface-100">{n.title}</p>
                                            <p className="text-[10px] text-surface-200/50 mt-0.5 truncate">{n.message}</p>
                                            <p className="text-[9px] text-surface-200/25 mt-1">{formatTimeAgo(n.ts)}</p>
                                        </div>
                                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function getNotificationIcon(type) {
    const icons = {
        swap_complete: '🔄',
        limit_order_executed: '📌',
        transfer_complete: '📤',
        dca_executed: '📊',
        price_alert: '🔔',
        report_generated: '📋',
    };
    return icons[type] || '🔔';
}
