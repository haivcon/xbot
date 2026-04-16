require('dotenv').config();
const onchainos = require('./src/services/onchainos');
(async () => {
    try {
        const addr = '0x5061289f1effdd90483a9e6a7e25887aea2521a0';
        const portfolio = await onchainos.getPortfolioOverview('196', addr, '4');
        console.log('Portfolio [0]:', portfolio ? JSON.stringify(portfolio, null, 2) : 'none');
    } catch (e) {
        console.error(e);
    }
})();
