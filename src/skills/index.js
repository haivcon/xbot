/**
 * Skills Index — Initializes the Skill Engine and loads all skills
 * 
 * Usage:
 *   const { registry, initSkills } = require('./skills');
 *   initSkills(); // Call once at startup
 *   
 *   // Then use:
 *   registry.getAllTools()        // → Gemini tools array
 *   registry.executeToolCall()   // → Execute a function call
 *   registry.getSystemPrompt()   // → Combined system instruction
 *   registry.listSkills()        // → List all registered skills
 */
const { registry, loadSkillsFromDirectory } = require('./engine');
const path = require('path');

let _initialized = false;

/**
 * Initialize the skill engine — loads all skills from ./skills subdirectories
 * Safe to call multiple times (idempotent)
 */
function initSkills() {
    if (_initialized) return registry;

    console.log('[SkillEngine] Initializing skill engine...');
    loadSkillsFromDirectory(registry, path.join(__dirname));
    _initialized = true;

    const skills = registry.listSkills();
    const totalTools = skills.reduce((sum, s) => sum + s.toolCount, 0);
    console.log(`[SkillEngine] ✅ Loaded ${skills.length} skills with ${totalTools} total tools`);

    return registry;
}

module.exports = {
    registry,
    initSkills
};
