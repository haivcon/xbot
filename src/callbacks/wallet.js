const logger = require('../core/logger');
const log = logger.child('Wallet');

// Placeholder function. I will implement this later.
async function handleWalletTokenCallback(callbackQuery) {
    log.info('handleWalletTokenCallback called with:', callbackQuery);
}

module.exports = {
    handleWalletTokenCallback
}