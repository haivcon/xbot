import { create } from 'zustand';
import config from '@/config';

// Simple notification beep using AudioContext
let audioCtx = null;
function playNotifBeep() {
    try {
        if (localStorage.getItem('notifSoundOff') === '1') return;
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = 0.08;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.stop(audioCtx.currentTime + 0.15);
    } catch { /* AudioContext not available */ }
}

const useWsStore = create((set, get) => ({
    ws: null,
    connected: false,
    botStatus: null,
    lastEvent: null,
    notifications: [],
    unreadCount: 0,
    soundEnabled: localStorage.getItem('notifSoundOff') !== '1',

    connect: () => {
        const existing = get().ws;
        if (existing && existing.readyState <= 1) return;

        try {
            const ws = new WebSocket(config.wsUrl);
            let reconnectTimer = null;

            ws.onopen = () => {
                set({ ws, connected: true });
                console.log('[WS] Connected');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'status') {
                        set({ botStatus: data.data, lastEvent: data });
                    } else if (data.type === 'group_activity') {
                        const notif = {
                            id: Date.now(),
                            type: data.type,
                            action: data.data?.action || 'unknown',
                            details: data.data?.details || '',
                            chatId: data.data?.chatId || '',
                            ts: data.data?.ts || Math.floor(Date.now() / 1000),
                        };
                        playNotifBeep();
                        set((state) => ({
                            lastEvent: data,
                            notifications: [notif, ...state.notifications].slice(0, 50),
                            unreadCount: state.unreadCount + 1,
                        }));
                    } else {
                        set({ lastEvent: data });
                    }
                } catch { /* ignore non-JSON */ }
            };

            ws.onclose = () => {
                set({ connected: false, ws: null });
                console.log('[WS] Disconnected, reconnecting in 5s...');
                reconnectTimer = setTimeout(() => get().connect(), 5000);
            };

            ws.onerror = () => {
                ws.close();
            };

            set({ ws, _cleanup: () => clearTimeout(reconnectTimer) });
        } catch (e) {
            console.warn('[WS] Connection failed:', e.message);
        }
    },

    disconnect: () => {
        const { ws, _cleanup } = get();
        if (_cleanup) _cleanup();
        if (ws) ws.close();
        set({ ws: null, connected: false });
    },

    markAllRead: () => {
        set({ unreadCount: 0 });
    },

    clearNotifications: () => {
        set({ notifications: [], unreadCount: 0 });
    },

    toggleSound: () => {
        const newVal = !get().soundEnabled;
        localStorage.setItem('notifSoundOff', newVal ? '0' : '1');
        set({ soundEnabled: newVal });
    },
}));

export default useWsStore;
