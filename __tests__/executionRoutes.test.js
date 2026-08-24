const express = require('express');
const http = require('http');

function request(server, method, path, body) {
    const address = server.address();
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1', port: address.port, method, path,
            headers: { 'content-type': 'application/json' },
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

describe('execution-disabled REST entrypoints', () => {
    let server;

    beforeEach(() => {
        process.env.EXECUTION_DISABLED = 'true';
        jest.resetModules();
    });

    afterEach(done => {
        if (server) server.close(() => done());
        else done();
    });

    test('market execution route returns stable 503 before auth, DB, decrypt, or send', async () => {
        const onchainos = require('../src/services/onchainos');
        const swap = jest.spyOn(onchainos, 'getSwapTransaction');
        const { createMarketRoutes } = require('../src/server/marketRoutes');
        const app = express(); app.use(express.json()); app.use(createMarketRoutes());
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));

        const response = await request(server, 'POST', '/swap/execute', {});
        expect(response).toEqual({ status: 503, body: { error: 'Execution is disabled by runtime policy.', code: 'EXECUTION_DISABLED' } });
        expect(swap).toHaveBeenCalledTimes(0);
    });

    test('OKX trade route returns stable 503 before credentials or order call', async () => {
        const okx = require('../src/services/okxCex');
        const placeOrder = jest.spyOn(okx, 'placeOrder');
        const credentials = jest.spyOn(okx, 'getUserOkxCredentials');
        const { createOkxRoutes } = require('../src/server/okxRoutes');
        const app = express(); app.use(express.json()); app.use(createOkxRoutes());
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));

        const response = await request(server, 'POST', '/spot/order', {});
        expect(response).toEqual({ status: 503, body: { error: 'Execution is disabled by runtime policy.', code: 'EXECUTION_DISABLED' } });
        expect(credentials).toHaveBeenCalledTimes(0);
        expect(placeOrder).toHaveBeenCalledTimes(0);
    });
});
