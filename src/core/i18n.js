const { t_, normalizeLanguageCode } = require('../../i18n');
const { defaultLang } = require('../config/env');

function t(langCode, key, variables = {}) {
    return t_(langCode, key, variables);
}

function resolveLangCode(langCode) {
    return normalizeLanguageCode(langCode || defaultLang);
}

module.exports = {
    t,
    resolveLangCode
};
