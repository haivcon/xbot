const fs = require('fs');
const path = require('path');
const bot = require('../core/bot');

const commandsPath = path.join(__dirname);

function registerCommands() {
    fs.readdirSync(commandsPath).forEach(file => {
        if (file.endsWith('.js') && file !== 'handler.js') {
            try {
                const command = require(path.join(commandsPath, file));
                if (command.command && command.handler) {
                    bot.onText(command.command, command.handler);
                    console.log(`[Commands] Registered command from ${file}`);
                }
            } catch (error) {
                console.error(`[Commands] Failed to load command from ${file}: ${error.message}`);
            }
        }
    });
}

module.exports = {
    registerCommands
}