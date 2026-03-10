import { create } from 'zustand';

let toastId = 0;

const useToastStore = create((set) => ({
    toasts: [],

    addToast: (message, type = 'info', duration = 3000) => {
        const id = ++toastId;
        set((state) => ({
            toasts: [...state.toasts, { id, message, type, createdAt: Date.now() }],
        }));
        if (duration > 0) {
            setTimeout(() => {
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                }));
            }, duration);
        }
        return id;
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },

    success: (message, duration) => {
        return useToastStore.getState().addToast(message, 'success', duration);
    },
    error: (message, duration) => {
        return useToastStore.getState().addToast(message, 'error', duration);
    },
    warning: (message, duration) => {
        return useToastStore.getState().addToast(message, 'warning', duration);
    },
    info: (message, duration) => {
        return useToastStore.getState().addToast(message, 'info', duration);
    },
}));

export default useToastStore;
