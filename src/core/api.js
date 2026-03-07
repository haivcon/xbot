const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// --- EXPRESS API (cho các dịch vụ bên ngoài) ---

// Endpoint để phục vụ tệp NotoSans-Regular.ttf
app.get('/fonts/NotoSans-Regular.ttf', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'));
});

// Endpoint để phục vụ tệp NotoSans-Bold.ttf
app.get('/fonts/NotoSans-Bold.ttf', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Bold.ttf'));
});

const { verifyOwner } = require('../features/auth/owner');

// Endpoint để xác minh quyền sở hữu qua mật khẩu
app.post('/verify-owner', (req, res) => {
    const { session, password } = req.body;
    const result = verifyOwner(session, password);
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    res.json({ success: true });
});

const { handleTopTokensApi } = require('../features/top-tokens');

// Endpoint để lấy dữ liệu top token
app.get('/api/top-tokens', handleTopTokensApi);

module.exports = app;
