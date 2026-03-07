/**
 * XBot Skill Engine — Core Loader & Registry
 * 
 * Provides a plug-and-play skill system for the AI agent.
 * Each skill is a self-contained module in its own directory under skills/
 * with a standard interface: { name, tools, handlers, systemPrompt }
 * 
 * Inspired by OpenClaw's skill architecture.
 */
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════
// Skill Registry
// ═══════════════════════════════════════════════════════

class SkillRegistry {
    constructor() {
        /** @type {Map<string, Skill>} */
        this.skills = new Map();
        /** @type {Map<string, string>} skill name -> tool name mapping */
        this.toolToSkill = new Map();
        this._loaded = false;
    }

    /**
     * Register a skill
     * @param {Skill} skill 
     */
    register(skill) {
        if (!skill || !skill.name) {
            throw new Error('Skill must have a name');
        }
        if (this.skills.has(skill.name)) {
            console.warn(`[SkillEngine] Skill "${skill.name}" already registered, overwriting.`);
        }
        this.skills.set(skill.name, skill);

        // Index tool names to skill
        if (skill.tools && Array.isArray(skill.tools)) {
            for (const toolGroup of skill.tools) {
                if (toolGroup.functionDeclarations) {
                    for (const decl of toolGroup.functionDeclarations) {
                        this.toolToSkill.set(decl.name, skill.name);
                    }
                }
            }
        }
        console.log(`[SkillEngine] ✅ Registered skill: ${skill.name} (${this._countTools(skill)} tools)`);
    }

    /**
     * Unregister a skill
     * @param {string} skillName 
     */
    unregister(skillName) {
        const skill = this.skills.get(skillName);
        if (!skill) return false;

        // Remove tool index
        if (skill.tools) {
            for (const toolGroup of skill.tools) {
                if (toolGroup.functionDeclarations) {
                    for (const decl of toolGroup.functionDeclarations) {
                        this.toolToSkill.delete(decl.name);
                    }
                }
            }
        }
        this.skills.delete(skillName);
        console.log(`[SkillEngine] ❌ Unregistered skill: ${skillName}`);
        return true;
    }

    /**
     * Get all registered tools (for Gemini Function Calling)
     * @returns {Array} Combined tool declarations from all skills
     */
    getAllTools() {
        const allDeclarations = [];
        for (const skill of this.skills.values()) {
            if (!skill.enabled) continue;
            if (skill.tools) {
                for (const toolGroup of skill.tools) {
                    if (toolGroup.functionDeclarations) {
                        allDeclarations.push(...toolGroup.functionDeclarations);
                    }
                }
            }
        }
        return [{ functionDeclarations: allDeclarations }];
    }

    /**
     * Get all handlers (for tool execution)
     * @returns {Object} Combined handlers from all skills
     */
    getAllHandlers() {
        const handlers = {};
        for (const skill of this.skills.values()) {
            if (!skill.enabled) continue;
            if (skill.handlers) {
                Object.assign(handlers, skill.handlers);
            }
        }
        return handlers;
    }

    /**
     * Build combined system instruction from all skills
     * @returns {string}
     */
    getSystemPrompt() {
        const parts = [];
        for (const skill of this.skills.values()) {
            if (!skill.enabled) continue;
            if (skill.systemPrompt) {
                parts.push(skill.systemPrompt);
            }
        }
        return parts.join('\n\n');
    }

    /**
     * Execute a tool call, routing to the correct skill handler
     * @param {object} functionCall - { name, args }
     * @param {object} context - { userId, chatId, ... }
     * @returns {Promise<string>}
     */
    async executeToolCall(functionCall, context) {
        const skillName = this.toolToSkill.get(functionCall.name);
        if (!skillName) {
            return `Unknown function: ${functionCall.name}`;
        }
        const skill = this.skills.get(skillName);
        if (!skill || !skill.enabled) {
            return `Skill "${skillName}" is not available.`;
        }
        const handler = skill.handlers?.[functionCall.name];
        if (!handler) {
            return `No handler for function: ${functionCall.name}`;
        }
        try {
            return await handler(functionCall.args || {}, context);
        } catch (error) {
            console.error(`[SkillEngine] Error in ${skillName}.${functionCall.name}:`, error);
            return `Error executing ${functionCall.name}: ${error.message || 'Unknown error'}`;
        }
    }

    /**
     * Get skill info for display
     * @returns {Array<{name, enabled, toolCount, description}>}
     */
    listSkills() {
        return Array.from(this.skills.values()).map(s => ({
            name: s.name,
            enabled: s.enabled !== false,
            toolCount: this._countTools(s),
            description: s.description || ''
        }));
    }

    /**
     * Enable/disable a skill
     */
    setEnabled(skillName, enabled) {
        const skill = this.skills.get(skillName);
        if (!skill) return false;
        skill.enabled = enabled;
        console.log(`[SkillEngine] ${enabled ? '✅ Enabled' : '⏸️ Disabled'} skill: ${skillName}`);
        return true;
    }

    _countTools(skill) {
        let count = 0;
        if (skill.tools) {
            for (const group of skill.tools) {
                count += (group.functionDeclarations || []).length;
            }
        }
        return count;
    }
}

// ═══════════════════════════════════════════════════════
// Skill Auto-Loader
// ═══════════════════════════════════════════════════════

/**
 * Auto-discover and load skills from the skills/ directory
 * Each skill directory must have an index.js that exports a skill object
 * @param {SkillRegistry} registry
 * @param {string} [skillsDir] - Path to skills directory (default: ./skills)
 */
function loadSkillsFromDirectory(registry, skillsDir) {
    const dir = skillsDir || path.join(__dirname);
    if (!fs.existsSync(dir)) {
        console.warn(`[SkillEngine] Skills directory not found: ${dir}`);
        return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

        const skillIndexPath = path.join(dir, entry.name, 'index.js');
        if (!fs.existsSync(skillIndexPath)) continue;

        try {
            const skillModule = require(skillIndexPath);
            const skill = typeof skillModule === 'function' ? skillModule() : skillModule;
            if (skill && skill.name) {
                if (skill.enabled === undefined) skill.enabled = true;
                registry.register(skill);
            }
        } catch (error) {
            console.error(`[SkillEngine] Failed to load skill from ${entry.name}:`, error.message);
        }
    }
}

// ═══════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════

const globalRegistry = new SkillRegistry();

module.exports = {
    SkillRegistry,
    registry: globalRegistry,
    loadSkillsFromDirectory
};
