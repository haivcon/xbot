'use strict';

const { aiApiAddPrompts, customPersonaPrompts } = require('./state');

function matchesChat(state, chatId) {
    return state?.chatId != null && String(state.chatId) === String(chatId);
}

function deleteBound(map, key, chatId) {
    const state = map.get(key);
    if (!state || !matchesChat(state, chatId)) return false;
    map.delete(key);
    return true;
}

function cancelCancellableAiState({ userId, chatId, searchState }) {
    const key = String(userId || '');
    if (!key || !chatId) return false;
    let cancelled = false;
    for (const [searchKey, state] of searchState || []) {
        if (String(state?.userId || key) === key && matchesChat(state, chatId)) {
            searchState.delete(searchKey);
            cancelled = true;
        }
    }
    cancelled = deleteBound(aiApiAddPrompts, key, chatId) || cancelled;
    cancelled = deleteBound(customPersonaPrompts, key, chatId) || cancelled;
    try {
        const { priceWizardStates } = require('../features/priceAlerts');
        cancelled = deleteBound(priceWizardStates, key, chatId) || cancelled;
    } catch {}
    return cancelled;
}

module.exports = { cancelCancellableAiState };