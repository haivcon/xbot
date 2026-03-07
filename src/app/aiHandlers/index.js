/**
 * AI Handlers - Entry Point
 * 
 * This module provides a modular wrapper for the AI handlers.
 * It re-exports all functionality from the original aiHandlers.js
 * while allowing gradual migration to separate modules.
 * 
 * Usage: const { createAiHandlers } = require('./aiHandlers');
 * This maintains backward compatibility.
 */

// Re-export from original file for backward compatibility
// The original file is kept as _core.js during migration
const { createAiHandlers: createCoreHandlers, registerTokenSearchCallbacks } = require('../aiHandlers');

// Export individual modules for direct access
const sharedState = require('./sharedState');
const { AI_PERSONAS, createPersonaHandlers } = require('./personas');
const utils = require('./utils');
const { createSessionHandlers } = require('./sessions');
const functionDeclarations = require('./functionDeclarations');
const { createGameFunctions } = require('./gameFunctions');
const completions = require('./completions');
const imageHandler = require('./imageHandler');
const ttsHandler = require('./ttsHandler');
const aibCommand = require('./aibCommand');

/**
 * Main factory function - creates all AI handlers
 * This wraps the core handlers and injects the modular components
 */
function createAiHandlers(deps) {
    // Register token search callback handler
    if (deps.bot) registerTokenSearchCallbacks(deps.bot);

    // Get core handlers (from original file)
    const coreHandlers = createCoreHandlers(deps);

    // Create modular handlers
    const personaHandlers = createPersonaHandlers(deps);
    const sessionHandlers = createSessionHandlers(deps);
    const gameFunctions = createGameFunctions(deps);

    // Return merged handlers
    // Core handlers take precedence for backward compatibility
    return {
        ...coreHandlers,
        // Expose modules for advanced usage
        _modules: {
            sharedState,
            utils,
            personaHandlers,
            sessionHandlers,
            functionDeclarations,
            gameFunctions,
            completions,
            imageHandler,
            ttsHandler,
            aibCommand
        }
    };
}

module.exports = {
    createAiHandlers,
    // Direct module exports for granular imports
    AI_PERSONAS,
    createPersonaHandlers,
    createSessionHandlers,
    createGameFunctions,
    sharedState,
    utils,
    functionDeclarations,
    completions,
    imageHandler,
    ttsHandler,
    aibCommand
};
