/**
 * Plugin Loader — Idea #7 Agent Marketplace
 * Dynamic plugin discovery, loading, and lifecycle management
 */
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');
const log = logger.child('Plugins');

// Plugin registry
const loadedPlugins = new Map();

/**
 * Standard Plugin Interface:
 * {
 *   name: string,
 *   version: string,
 *   description: string,
 *   author: string,
 *   tools: [{ name, description, parameters, handler }],
 *   onLoad: async (context) => void,
 *   onUnload: async () => void
 * }
 */

/**
 * W14 fix: Basic plugin security checks
 * Scan plugin source for dangerous patterns
 */
function _checkPluginSecurity(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dangerousPatterns = [
        /require\s*\(\s*['"]child_process['"]/,
        /require\s*\(\s*['"]fs['"]/,
        /require\s*\(\s*['"]net['"]/,
        /require\s*\(\s*['"]http['"]/,
        /eval\s*\(/,
        /Function\s*\(/,
        /process\.exit/,
        /process\.env/
    ];
    const warnings = [];
    for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
            warnings.push(`Contains: ${pattern.source}`);
        }
    }
    return warnings;
}

/**
 * Load a plugin from a file path
 */
async function loadPlugin(pluginPath, context = {}) {
    try {
        const fullPath = path.resolve(pluginPath);
        if (!fs.existsSync(fullPath)) {
            return { success: false, error: `Plugin file not found: ${fullPath}` };
        }

        // W14 fix: Prevent directory traversal
        const pluginsRoot = path.resolve(__dirname);
        if (!fullPath.startsWith(pluginsRoot) && !context.trusted) {
            return { success: false, error: 'Plugin must be within the plugins directory. Set trusted:true to override.' };
        }

        // W14 fix: Security scan
        const securityWarnings = _checkPluginSecurity(fullPath);
        if (securityWarnings.length > 0 && !context.trusted) {
            log.warn(`Plugin security warnings for ${fullPath}:`, securityWarnings);
            return { success: false, error: `Plugin has security concerns: ${securityWarnings.join(', ')}. Set trusted:true to override.`, warnings: securityWarnings };
        }

        // Clear require cache for hot reload
        delete require.cache[require.resolve(fullPath)];
        const plugin = require(fullPath);

        if (!plugin.name) {
            return { success: false, error: 'Plugin must export a "name" property.' };
        }

        // Validate plugin interface
        if (plugin.tools && !Array.isArray(plugin.tools)) {
            return { success: false, error: 'Plugin "tools" must be an array.' };
        }

        // Call onLoad lifecycle
        if (typeof plugin.onLoad === 'function') {
            await plugin.onLoad(context);
        }

        loadedPlugins.set(plugin.name, {
            ...plugin,
            path: fullPath,
            loadedAt: new Date().toISOString(),
            status: 'active'
        });

        log.info(`Plugin loaded: ${plugin.name} v${plugin.version || '1.0'}`);
        return { success: true, name: plugin.name, tools: (plugin.tools || []).length };
    } catch (err) {
        log.error(`Plugin load error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Unload a plugin
 */
async function unloadPlugin(pluginName) {
    const plugin = loadedPlugins.get(pluginName);
    if (!plugin) return { success: false, error: `Plugin "${pluginName}" not found.` };

    try {
        if (typeof plugin.onUnload === 'function') {
            await plugin.onUnload();
        }

        // Clear require cache
        if (plugin.path) {
            delete require.cache[require.resolve(plugin.path)];
        }

        loadedPlugins.delete(pluginName);
        log.info(`Plugin unloaded: ${pluginName}`);
        return { success: true };
    } catch (err) {
        log.error(`Plugin unload error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Discover plugins in a directory
 */
async function discoverPlugins(pluginDir) {
    const dir = path.resolve(pluginDir);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        return [];
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.json'));
    const discovered = [];

    for (const file of files) {
        try {
            const fullPath = path.join(dir, file);
            // Peek at plugin metadata without fully loading
            const content = fs.readFileSync(fullPath, 'utf8');
            const nameMatch = content.match(/name\s*[:=]\s*['"]([^'"]+)['"]/);
            const versionMatch = content.match(/version\s*[:=]\s*['"]([^'"]+)['"]/);
            const descMatch = content.match(/description\s*[:=]\s*['"]([^'"]+)['"]/);

            discovered.push({
                file,
                path: fullPath,
                name: nameMatch?.[1] || file.replace(/\.js$/, ''),
                version: versionMatch?.[1] || '1.0',
                description: descMatch?.[1] || 'No description',
                loaded: loadedPlugins.has(nameMatch?.[1] || file.replace(/\.js$/, ''))
            });
        } catch (e) {
            log.warn(`Failed to read plugin ${file}:`, e.message);
        }
    }

    return discovered;
}

/**
 * Get all tools from loaded plugins
 */
function getPluginTools() {
    const tools = [];
    for (const [name, plugin] of loadedPlugins) {
        if (plugin.tools && plugin.status === 'active') {
            for (const tool of plugin.tools) {
                tools.push({
                    ...tool,
                    pluginName: name
                });
            }
        }
    }
    return tools;
}

/**
 * Execute a plugin tool by name
 */
async function executePluginTool(toolName, args, context) {
    for (const [name, plugin] of loadedPlugins) {
        if (plugin.tools && plugin.status === 'active') {
            const tool = plugin.tools.find(t => t.name === toolName);
            if (tool && typeof tool.handler === 'function') {
                return await tool.handler(args, context);
            }
        }
    }
    return { error: `Plugin tool "${toolName}" not found.` };
}

/**
 * Get list of loaded plugins with status
 */
function getLoadedPlugins() {
    const list = [];
    for (const [name, plugin] of loadedPlugins) {
        list.push({
            name: plugin.name,
            version: plugin.version || '1.0',
            description: plugin.description || '',
            author: plugin.author || 'Unknown',
            tools: (plugin.tools || []).length,
            status: plugin.status,
            loadedAt: plugin.loadedAt
        });
    }
    return list;
}

module.exports = {
    loadPlugin, unloadPlugin, discoverPlugins,
    getPluginTools, executePluginTool, getLoadedPlugins,
    loadedPlugins
};
