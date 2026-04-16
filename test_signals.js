require('dotenv').config();
const onchainos = require('./src/services/onchainos');
(async () => {
    try {
        const signals = await onchainos.getSignalList('196', { walletType: '1,2,3' });
        console.log('Signals logic:', signals ? signals.length : 'null');
        console.log('Signals [0]:', signals ? JSON.stringify(signals[0], null, 2) : 'none');
    } catch (e) {
        console.error(e);
    }
})();
