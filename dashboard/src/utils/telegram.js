/**
 * Telegram Mini App Utilities
 * Back Button, Haptic Feedback, and helper functions.
 * File: dashboard/src/utils/telegram.js
 */

/** Check if running inside Telegram Mini App */
export function isTelegramMiniApp() {
    return !!window.Telegram?.WebApp?.initData;
}

/** Get the Telegram WebApp instance (or null) */
export function getTgWebApp() {
    return window.Telegram?.WebApp || null;
}

// ═══════════════════════════════════════════════════════════
//  Back Button
// ═══════════════════════════════════════════════════════════

/**
 * Show/hide the Telegram back button based on navigation depth.
 * Call this in useEffect when route changes.
 *
 * @param {boolean} show - Whether to show the back button
 * @param {Function} onBack - Callback when back button is pressed
 */
export function setupBackButton(show, onBack) {
    const tg = getTgWebApp();
    if (!tg?.BackButton) return;

    if (show) {
        tg.BackButton.show();
        tg.BackButton.onClick(onBack);
    } else {
        tg.BackButton.hide();
        tg.BackButton.offClick(onBack);
    }
}

// ═══════════════════════════════════════════════════════════
//  Haptic Feedback
// ═══════════════════════════════════════════════════════════

/**
 * Trigger haptic feedback in Telegram Mini App.
 * No-op in regular browsers.
 *
 * @param {'light'|'medium'|'heavy'|'rigid'|'soft'} style - Impact style
 */
export function hapticImpact(style = 'light') {
    try {
        getTgWebApp()?.HapticFeedback?.impactOccurred(style);
    } catch { /* ignore */ }
}

/**
 * Trigger haptic notification feedback.
 * @param {'success'|'warning'|'error'} type
 */
export function hapticNotification(type = 'success') {
    try {
        getTgWebApp()?.HapticFeedback?.notificationOccurred(type);
    } catch { /* ignore */ }
}

/**
 * Trigger haptic selection changed feedback (light tap).
 */
export function hapticSelection() {
    try {
        getTgWebApp()?.HapticFeedback?.selectionChanged();
    } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
//  Theme Sync
// ═══════════════════════════════════════════════════════════

/**
 * Get the Telegram theme color scheme.
 * @returns {'light'|'dark'|null} - null if not in Mini App
 */
export function getTelegramColorScheme() {
    return getTgWebApp()?.colorScheme || null;
}
