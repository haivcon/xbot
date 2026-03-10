import { create } from 'zustand';
import config from '@/config';

const useWsStore = create((set, get) => ({
    ws: null,
    connected: false,
    botStatus: null,
    lastEvent: null,

    connect: () => {
        const existing = get().ws;
        if (existing && existing.readyState <= 1) return; // Already connected or connecting

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

            // Store cleanup function
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
}));

export default useWsStore;
