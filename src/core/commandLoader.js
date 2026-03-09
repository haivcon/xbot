/**
 * Command Loader - Modular Command Architecture
 * Auto-loads commands from src/commands/ directory
 * Supports hot reload in development mode
 */

const fs = require('fs');
const logger = require('../core/logger');
const log = logger.child('CmdLoader');
const path = require('path');
const { commandRegistry } = require('./commandRegistry');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/**
 * Load all commands from the commands directory
 * @param {Object} deps Dependencies to inject into command handlers
 * @returns {Promise<{ loaded: number, errors: string[] }>}
 */
async function loadCommands(deps = {}) {
    const errors = [];
    let loaded = 0;

    if (!fs.existsSync(COMMANDS_DIR)) {
        log.child('CommandLoader').info('Creating commands directory:', COMMANDS_DIR);
        fs.mkdirSync(COMMANDS_DIR, { recursive: true });
        return { loaded: 0, errors: ['Commands directory was empty/missing'] };
    }

    const files = findCommandFiles(COMMANDS_DIR);

    for (const filePath of files) {
        try {
            const commandModule = require(filePath);

            if (typeof commandModule === 'function') {
                // Factory pattern: module.exports = (deps) => commandConfig
                const config = commandModule(deps);
                if (Array.isArray(config)) {
                    for (const cmd of config) {
                        commandRegistry.register(cmd);
                        loaded++;
                    }
                } else if (config && config.name) {
                    commandRegistry.register(config);
                    loaded++;
                }
            } else if (commandModule && commandModule.name) {
                // Direct export: module.exports = commandConfig
                commandRegistry.register(commandModule);
                loaded++;
            } else if (Array.isArray(commandModule)) {
                // Array of commands
                for (const cmd of commandModule) {
                    if (cmd && cmd.name) {
                        commandRegistry.register(cmd);
                        loaded++;
                    }
                }
            }
        } catch (error) {
            const relativePath = path.relative(COMMANDS_DIR, filePath);
            errors.push(`${relativePath}: ${error.message}`);
            log.child('CommandLoader').error(`Error loading ${relativePath}:`, error.message);
        }
    }

    log.child('CommandLoader').info(`Loaded ${loaded} commands from ${files.length} files`);
    if (errors.length > 0) {
        log.child('CommandLoader').warn(`${errors.length} errors encountered`);
    }

    return { loaded, errors };
}

/**
 * Find all command files recursively
 * @param {string} dir 
 * @returns {string[]}
 */
function findCommandFiles(dir) {
    const files = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Skip node_modules and hidden directories
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                files.push(...findCommandFiles(fullPath));
            }
        } else if (entry.isFile() && entry.name.endsWith('.cmd.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Reload a specific command file (for hot reload)
 * @param {string} filePath 
 * @param {Object} deps 
 */
function reloadCommand(filePath, deps = {}) {
    // Clear from require cache
    delete require.cache[require.resolve(filePath)];

    try {
        const commandModule = require(filePath);

        if (typeof commandModule === 'function') {
            const config = commandModule(deps);
            if (config && config.name) {
                commandRegistry.register(config);
                log.child('CommandLoader').info(`Reloaded: ${config.name}`);
            }
        } else if (commandModule && commandModule.name) {
            commandRegistry.register(commandModule);
            log.child('CommandLoader').info(`Reloaded: ${commandModule.name}`);
        }
    } catch (error) {
        log.child('CommandLoader').error(`Reload error:`, error.message);
    }
}

/**
 * Start watching for file changes (development only)
 * @param {Object} deps 
 */
function startHotReload(deps = {}) {
    if (process.env.NODE_ENV !== 'development') {
        log.child('CommandLoader').info('Hot reload disabled (not in development mode)');
        return;
    }

    if (!fs.existsSync(COMMANDS_DIR)) {
        return;
    }

    log.child('CommandLoader').info('Hot reload enabled - watching for changes');

    fs.watch(COMMANDS_DIR, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.cmd.js')) {
            const filePath = path.join(COMMANDS_DIR, filename);
            if (fs.existsSync(filePath)) {
                log.child('CommandLoader').info(`File changed: ${filename}`);
                setTimeout(() => reloadCommand(filePath, deps), 100);
            }
        }
    });
}

module.exports = {
    loadCommands,
    findCommandFiles,
    reloadCommand,
    startHotReload,
    COMMANDS_DIR
};
