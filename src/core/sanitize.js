const { createSanitizeSecrets } = require('../utils/helpers');
const {
    GEMINI_API_KEYS,
    GROQ_API_KEYS,
    OPENAI_API_KEYS
} = require('../config/env');

const sanitizeSecrets = createSanitizeSecrets([
    ...GEMINI_API_KEYS,
    ...GROQ_API_KEYS,
    ...OPENAI_API_KEYS
]);

module.exports = { sanitizeSecrets };
