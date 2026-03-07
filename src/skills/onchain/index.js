// Onchain skill disabled — tools are loaded directly in gemini.js via ONCHAIN_TOOLS
// The ai-onchain.js module has lazy requires (../../db/core, ../../config/env) that
// fail when loaded through the skill engine's directory context.
module.exports = {
    name: 'onchain',
    description: 'Disabled — onchain tools loaded directly in gemini.js',
    enabled: false
};
