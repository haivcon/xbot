import { useEffect } from 'react';

/**
 * useKeyboardShortcuts — global keyboard shortcuts for the dashboard.
 *
 * Shortcuts:
 * - Ctrl+K / Cmd+K: Focus search / command palette (future)
 * - Ctrl+/ / Cmd+/: Focus chat input
 * - Escape: Close modals, blur active element
 */
export default function useKeyboardShortcuts({ onCommandPalette, onFocusChat } = {}) {
    useEffect(() => {
        const handler = (e) => {
            const isMod = e.ctrlKey || e.metaKey;
            const tag = document.activeElement?.tagName;
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true';

            // Ctrl+K — command palette / search
            if (isMod && e.key === 'k') {
                e.preventDefault();
                onCommandPalette?.();
                return;
            }

            // Ctrl+/ — focus chat input
            if (isMod && e.key === '/') {
                e.preventDefault();
                onFocusChat?.();
                return;
            }

            // Escape — blur / close
            if (e.key === 'Escape' && isInput) {
                document.activeElement?.blur();
                return;
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCommandPalette, onFocusChat]);
}
