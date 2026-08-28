'use strict';

const AI_VISIBLE_COMMANDS = Object.freeze([
    'chat', 'new', 'model', 'stop', 'retry', 'history', 'status', 'providers'
]);

const AI_HIDDEN_COMMANDS = Object.freeze([
    'ai', 'models', 'api', 'persona', 'personas', 'personality', 'aib', 'cancel'
]);

function resolveAiCommandPolicy(env = process.env) {
    return Object.freeze({
        chat9RouterUiEnabled: env.XBOT_TELEGRAM_CHAT_9R_UI !== 'false',
        legacyApiUiEnabled: env.XBOT_LEGACY_AI_API_UI === 'true',
        audioCompatEnabled: env.XBOT_AI_AUDIO_COMPAT_ENABLED !== 'false',
        legacyPersonaEnabled: env.XBOT_LEGACY_PERSONA_ENABLED !== 'false'
    });
}

module.exports = { AI_HIDDEN_COMMANDS, AI_VISIBLE_COMMANDS, resolveAiCommandPolicy };
