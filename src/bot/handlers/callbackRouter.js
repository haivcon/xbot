/**
 * Callback Router — prefix-based callback routing table
 * Provides an efficient O(1) lookup for callback_query routing.
 *
 * Usage:
 *   const router = createCallbackRouter();
 *   router.on('checkin_start', handler);         // exact match
 *   router.onPrefix('checkin_admin', handler);   // prefix match
 *   const matched = router.match(query.data);    // returns handler or null
 *   if (matched) await matched.handler(query, matched.params);
 */

function createCallbackRouter() {
    // Exact match routes: data === key
    const exactRoutes = new Map();
    // Prefix match routes: data.startsWith(key) — sorted longest-first for specificity
    const prefixRoutes = [];
    let prefixSorted = true;

    /**
     * Register an exact match route.
     * @param {string} key - Exact callback_data value
     * @param {Function} handler - async (query, context) => void
     */
    function on(key, handler) {
        exactRoutes.set(key, handler);
    }

    /**
     * Register a prefix match route.
     * @param {string} prefix - Prefix to match (e.g. 'checkin_admin_')
     * @param {Function} handler - async (query, context) => void
     */
    function onPrefix(prefix, handler) {
        prefixRoutes.push({ prefix, handler });
        prefixSorted = false;
    }

    /**
     * Match a callback_data string against registered routes.
     * Returns { handler, params } or null.
     * Priority: exact match > longest prefix match
     */
    function match(data) {
        if (!data || typeof data !== 'string') return null;

        // 1. Exact match (O(1))
        const exact = exactRoutes.get(data);
        if (exact) return { handler: exact, params: data };

        // 2. Prefix match (longest prefix wins)
        if (!prefixSorted) {
            prefixRoutes.sort((a, b) => b.prefix.length - a.prefix.length);
            prefixSorted = true;
        }
        for (const route of prefixRoutes) {
            if (data.startsWith(route.prefix)) {
                return {
                    handler: route.handler,
                    params: data.slice(route.prefix.length)
                };
            }
        }

        return null;
    }

    /**
     * Get registered route count for diagnostics.
     */
    function stats() {
        return {
            exact: exactRoutes.size,
            prefix: prefixRoutes.length,
            total: exactRoutes.size + prefixRoutes.length
        };
    }

    return { on, onPrefix, match, stats };
}

module.exports = { createCallbackRouter };
