/**
 * Agent Marketplace — Idea #7
 * Plugin listing, installation, and payment integration
 */
const logger = require('../core/logger');
const log = logger.child('Marketplace');
const { loadPlugin, unloadPlugin, discoverPlugins, getLoadedPlugins } = require('../plugins/pluginLoader');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins', 'community');

/**
 * Initialize marketplace DB tables
 */
async function initDB() {
    const { dbRun } = require('../../db/core');
    await dbRun(`CREATE TABLE IF NOT EXISTS marketplace_plugins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        version TEXT DEFAULT '1.0',
        description TEXT,
        author TEXT,
        price REAL DEFAULT 0,
        currency TEXT DEFAULT 'USDT',
        downloads INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        category TEXT DEFAULT 'general',
        filePath TEXT,
        isVerified INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now'))
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS user_installed_plugins (
        userId TEXT NOT NULL,
        pluginName TEXT NOT NULL,
        installedAt TEXT DEFAULT (datetime('now')),
        active INTEGER DEFAULT 1,
        PRIMARY KEY (userId, pluginName)
    )`);
}

/**
 * List available plugins in the marketplace
 */
async function listPlugins(options = {}) {
    await initDB();
    const { dbAll } = require('../../db/core');
    const category = options.category || null;
    let query = 'SELECT * FROM marketplace_plugins ORDER BY downloads DESC';
    const params = [];
    if (category) {
        query = 'SELECT * FROM marketplace_plugins WHERE category = ? ORDER BY downloads DESC';
        params.push(category);
    }
    const plugins = await dbAll(query, params);

    // Also discover local plugins
    const localPlugins = await discoverPlugins(PLUGINS_DIR);
    return { marketplace: plugins || [], local: localPlugins };
}

/**
 * Install a plugin for a user
 */
async function installPlugin(userId, pluginName) {
    await initDB();
    const { dbGet, dbRun } = require('../../db/core');

    // Check if plugin exists in marketplace
    const plugin = await dbGet('SELECT * FROM marketplace_plugins WHERE name = ?', [pluginName]);
    if (!plugin) {
        // Try local discovery
        const locals = await discoverPlugins(PLUGINS_DIR);
        const local = locals.find(p => p.name === pluginName);
        if (!local) return { success: false, error: `Plugin "${pluginName}" not found.` };

        // Load local plugin
        const result = await loadPlugin(local.path);
        if (result.success) {
            await dbRun('INSERT OR REPLACE INTO user_installed_plugins (userId, pluginName, active) VALUES (?, ?, 1)',
                [userId, pluginName]);
        }
        return result;
    }

    // Check payment requirement
    if (plugin.price > 0) {
        const { checkFeatureAccess } = require('../services/x402PaymentService');
        const access = await checkFeatureAccess(userId, `plugin_${pluginName}`);
        if (!access.allowed) {
            return { success: false, error: `Payment required: $${plugin.price} ${plugin.currency}`, paymentRequired: true, price: plugin.price };
        }
    }

    // Load the plugin
    if (plugin.filePath) {
        const result = await loadPlugin(plugin.filePath);
        if (result.success) {
            await dbRun('INSERT OR REPLACE INTO user_installed_plugins (userId, pluginName, active) VALUES (?, ?, 1)',
                [userId, pluginName]);
            await dbRun('UPDATE marketplace_plugins SET downloads = downloads + 1 WHERE name = ?', [pluginName]);
        }
        return result;
    }

    return { success: false, error: 'Plugin file not available.' };
}

/**
 * Uninstall a plugin for a user
 */
async function uninstallPlugin(userId, pluginName) {
    const { dbRun } = require('../../db/core');
    await unloadPlugin(pluginName);
    await dbRun('UPDATE user_installed_plugins SET active = 0 WHERE userId = ? AND pluginName = ?', [userId, pluginName]);
    return { success: true };
}

/**
 * Get user's installed plugins
 */
async function getUserPlugins(userId) {
    await initDB();
    const { dbAll } = require('../../db/core');
    return await dbAll('SELECT * FROM user_installed_plugins WHERE userId = ? AND active = 1', [userId]) || [];
}

/**
 * Format marketplace listing for Telegram
 */
function formatMarketplace(data, lang = 'en') {
    const { marketplace, local } = data;
    const headers = { en: 'AGENT MARKETPLACE', vi: 'CHỢ AGENT' };
    let card = `🏪 <b>${headers[lang] || headers.en}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

    if (marketplace.length === 0 && local.length === 0) {
        card += lang === 'vi' ? '<i>Chưa có plugin nào. Hãy tạo plugin đầu tiên!</i>' : '<i>No plugins yet. Create the first one!</i>';
        return card;
    }

    if (marketplace.length > 0) {
        card += `📦 <b>${lang === 'vi' ? 'Marketplace' : 'Marketplace'}:</b>\n\n`;
        for (const p of marketplace.slice(0, 10)) {
            const priceStr = p.price > 0 ? `$${p.price}` : '🆓 Free';
            const verified = p.isVerified ? ' ✅' : '';
            card += `• <b>${p.name}</b>${verified} (v${p.version})\n`;
            card += `  ${p.description || 'No description'}\n`;
            card += `  💰 ${priceStr} | ⬇️ ${p.downloads} | ⭐ ${Number(p.rating || 0).toFixed(1)}\n\n`;
        }
    }

    if (local.length > 0) {
        card += `📂 <b>${lang === 'vi' ? 'Plugin cục bộ' : 'Local Plugins'}:</b>\n\n`;
        for (const p of local.slice(0, 5)) {
            const statusIcon = p.loaded ? '🟢' : '⚪';
            card += `${statusIcon} <b>${p.name}</b> (v${p.version})\n`;
            card += `  ${p.description}\n\n`;
        }
    }

    const hintL = {
        en: '💡 Use "/marketplace install <name>" to install.',
        vi: '💡 Dùng "/marketplace install <tên>" để cài đặt.'
    };
    card += `\n${hintL[lang] || hintL.en}`;
    return card;
}

module.exports = { listPlugins, installPlugin, uninstallPlugin, getUserPlugins, formatMarketplace, initDB };
