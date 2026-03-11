/**
 * Dashboard API Routes
 * Handles auth, owner, and user endpoints for the web dashboard.
 * File: src/server/dashboardRoutes.js
 */

const crypto = require('crypto');
const { Router } = require('express');
const db = require('../../db.js');
const logger = require('../core/logger');
const log = logger.child('Dashboard');

const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || process.env.TELEGRAM_TOKEN || 'xbot-dashboard-fallback-secret';
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const OWNER_IDS = [
    ...(process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    ...(process.env.BOT_OWNER_ID || '').split(',').map(s => s.trim()).filter(Boolean),
];

// ============================
// Simple JWT implementation
// ============================
function createJWT(payload, expiresInSec = 86400 * 7) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec })).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

function verifyJWT(token) {
    try {
        const [header, body, signature] = token.split('.');
        const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        if (signature !== expected) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

// ============================
// Telegram Login Verification
// ============================
function verifyTelegramAuth(data) {
    if (!BOT_TOKEN) return false;

    // Dev/Quick login: DISABLED by default for security
    // Set DASHBOARD_ENABLE_DEV_LOGIN=true in .env to enable (LOCAL DEV ONLY)
    if (data.hash === 'dev_mode') {
        if (process.env.DASHBOARD_ENABLE_DEV_LOGIN === 'true') {
            log.warn('Dashboard: Dev mode login accepted (DASHBOARD_ENABLE_DEV_LOGIN=true)');
            return true;
        }
        log.warn('Dashboard: Dev mode login REJECTED (set DASHBOARD_ENABLE_DEV_LOGIN=true to enable)');
        return false;
    }

    const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const checkString = Object.keys(data)
        .filter(k => k !== 'hash')
        .sort()
        .map(k => `${k}=${data[k]}`)
        .join('\n');
    const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
    return hmac === data.hash;
}

// ============================
// Middleware
// ============================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authentication token' });
    }
    const payload = verifyJWT(authHeader.slice(7));
    if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.dashboardUser = payload;
    next();
}

function ownerGuard(req, res, next) {
    if (req.dashboardUser?.role !== 'owner') {
        return res.status(403).json({ error: 'Owner access required' });
    }
    next();
}

// ============================
// Login Rate Limiter (stricter: 5 attempts/min per IP)
// ============================
const loginBuckets = new Map();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW = 60_000;

function loginRateLimit(req, res, next) {
    const ip = (req.ip || req.connection?.remoteAddress || 'unknown').toString();
    const now = Date.now();
    let bucket = loginBuckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + LOGIN_RATE_WINDOW };
    }
    bucket.count++;
    loginBuckets.set(ip, bucket);
    if (bucket.count > LOGIN_RATE_LIMIT) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    // Cleanup old buckets periodically
    if (loginBuckets.size > 500 && Math.random() < 0.1) {
        for (const [k, v] of loginBuckets) { if (v.resetAt < now) loginBuckets.delete(k); }
    }
    next();
}

// ============================
// Determine user role
// ============================
async function getUserRole(userId, username) {
    const uid = String(userId);
    if (OWNER_IDS.includes(uid)) return 'owner';
    // Also check by username (BOT_OWNER_ID may be set to a username)
    if (username && OWNER_IDS.some(id => id.toLowerCase() === username.toLowerCase())) return 'owner';
    try {
        const coOwners = await db.getCoOwners?.();
        if (coOwners?.some(co => String(co.userId) === uid)) return 'owner';
    } catch { /* ignore */ }
    return 'user';
}

// ============================
// Create Router
// ============================
function createDashboardRoutes() {
    const router = Router();

    // --- Public Info (no auth required) ---
    router.get('/bot-info', async (req, res) => {
        let botUsername = (process.env.BOT_USERNAME || global._botUsername || '').replace(/^@+/, '');
        // Dynamically fetch from Telegram API if not cached
        if (!botUsername) {
            try {
                const { bot } = require('../core/bot');
                const me = await bot.getMe();
                if (me?.username) {
                    botUsername = me.username;
                    global._botUsername = me.username;
                }
            } catch (e) {
                log.warn('bot-info: Failed to fetch bot username via getMe:', e.message);
            }
        }
        res.json({
            botUsername: botUsername || null,
            dashboardUrl: `${req.protocol}://${req.get('host')}/dashboard/`,
        });
    });

    // --- Auth: One-time token auto-login (from /dashboard bot command) ---
    router.get('/auth/auto-login', loginRateLimit, async (req, res) => {
        try {
            const { token } = req.query;
            if (!token) {
                return res.status(400).send('Missing token');
            }

            // Import shared state that holds login tokens
            const { dashboardLoginTokens } = require('../core/state');
            const tokenData = dashboardLoginTokens.get(token);

            if (!tokenData) {
                return res.status(401).send(`
                    <html><body style="background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Inter,sans-serif">
                    <div style="text-align:center"><h2>⏰ Link expired</h2><p>Please type <code>/dashboard</code> in the bot to get a new link.</p>
                    <a href="/dashboard/" style="color:#60a5fa">Go to Dashboard →</a></div></body></html>
                `);
            }

            // Consume token (one-time use)
            dashboardLoginTokens.delete(token);

            // Check if token is expired (5 min)
            if (Date.now() - tokenData.createdAt > 5 * 60 * 1000) {
                return res.status(401).send(`
                    <html><body style="background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Inter,sans-serif">
                    <div style="text-align:center"><h2>⏰ Link expired</h2><p>Please type <code>/dashboard</code> in the bot to get a new link.</p></div></body></html>
                `);
            }

            const role = await getUserRole(tokenData.userId, tokenData.username);
            const jwt = createJWT({
                userId: tokenData.userId,
                username: tokenData.username,
                firstName: tokenData.firstName,
                role,
            });

            log.info(`Dashboard auto-login: ${tokenData.firstName} (${tokenData.userId}) as ${role}`);

            // Redirect to dashboard with JWT in URL — the frontend will grab it and store it
            res.send(`
                <!DOCTYPE html>
                <html><head><title>Redirecting...</title></head>
                <body style="background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Inter,sans-serif">
                <div style="text-align:center"><h2>✅ Logged in!</h2><p>Redirecting to dashboard...</p></div>
                <script>
                    var authData = ${JSON.stringify({
                token: jwt,
                role,
                user: {
                    id: Number(tokenData.userId),
                    first_name: tokenData.firstName,
                    username: tokenData.username,
                }
            })};
                    localStorage.setItem('xbot_dashboard_auth', JSON.stringify(authData));
                    window.location.href = '/';
                </script>
                </body></html>
            `);
        } catch (err) {
            log.error('Dashboard auto-login error:', err.message);
            res.status(500).send('Internal error');
        }
    });

    // --- Auth: Telegram Mini App (WebApp.initData) login ---
    router.post('/auth/webapp-login', loginRateLimit, async (req, res) => {
        try {
            const { initData } = req.body;
            if (!initData || typeof initData !== 'string') {
                return res.status(400).json({ error: 'Missing initData' });
            }
            if (!BOT_TOKEN) {
                return res.status(503).json({ error: 'Bot token not configured' });
            }

            // Parse initData (URL-encoded string)
            const params = new URLSearchParams(initData);
            const hash = params.get('hash');
            if (!hash) return res.status(401).json({ error: 'Invalid initData: no hash' });

            // Validate HMAC-SHA256 per Telegram docs:
            // 1. secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
            // 2. data_check_string = sorted key=value pairs (excluding hash), joined by \n
            // 3. HMAC_SHA256(secret_key, data_check_string) === hash
            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
            const dataCheckArr = [];
            for (const [key, value] of params.entries()) {
                if (key !== 'hash') dataCheckArr.push(`${key}=${value}`);
            }
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');
            const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

            if (computedHash !== hash) {
                log.warn('Dashboard webapp-login: HMAC validation failed');
                return res.status(401).json({ error: 'Invalid initData signature' });
            }

            // Check auth_date (max 5 minutes old)
            const authDate = Number(params.get('auth_date') || 0);
            if (Math.abs(Date.now() / 1000 - authDate) > 300) {
                return res.status(401).json({ error: 'initData expired' });
            }

            // Extract user data
            const userStr = params.get('user');
            if (!userStr) return res.status(401).json({ error: 'No user data in initData' });

            let userData;
            try { userData = JSON.parse(userStr); } catch {
                return res.status(401).json({ error: 'Invalid user data format' });
            }

            const userId = String(userData.id);
            const firstName = userData.first_name || 'User';
            const username = userData.username || '';
            const role = await getUserRole(userId, username);

            const jwt = createJWT({ userId, username, firstName, role });

            log.info(`Dashboard webapp-login: ${firstName} (${userId}) as ${role}`);

            res.json({
                token: jwt,
                role,
                user: {
                    id: Number(userId) || userId,
                    first_name: firstName,
                    last_name: userData.last_name || '',
                    username,
                    photo_url: userData.photo_url || '',
                },
            });
        } catch (err) {
            log.error('Dashboard webapp-login error:', err.message);
            res.status(500).json({ error: 'Internal error' });
        }
    });

    // --- Auth ---
    router.post('/auth/telegram-login', async (req, res) => {
        try {
            const data = req.body;
            if (!data?.id) {
                return res.status(400).json({ error: 'Invalid Telegram data' });
            }

            if (!verifyTelegramAuth(data)) {
                return res.status(401).json({ error: 'Telegram authentication failed' });
            }

            // For dev_mode login: use real owner/user data from DB
            let userId = String(data.id);
            let firstName = data.first_name;
            let lastName = data.last_name || '';
            let username = data.username;
            let photoUrl = data.photo_url;

            if (data.hash === 'dev_mode') {
                const realOwnerId = process.env.BOT_OWNER_ID;
                if (data._devRole === 'owner' && realOwnerId) {
                    userId = String(realOwnerId);
                } else if (data._devRole === 'user') {
                    // For user dev login, try to find any real user in DB
                    userId = String(data.id);
                }
                // Look up real user data from DB
                try {
                    const dbUser = await db.getUser?.(userId);
                    if (dbUser) {
                        firstName = dbUser.firstName || dbUser.first_name || firstName;
                        lastName = dbUser.lastName || dbUser.last_name || lastName;
                        username = dbUser.username || username;
                    }
                } catch { /* use mock data as fallback */ }
            }

            const role = await getUserRole(userId, username);
            const token = createJWT({
                userId,
                username,
                firstName,
                role,
            });

            log.info(`Dashboard login: ${firstName} (${userId}) as ${role}`);

            res.json({
                token,
                role,
                user: {
                    id: Number(userId) || userId,
                    first_name: firstName,
                    last_name: lastName,
                    username,
                    photo_url: photoUrl,
                },
            });
        } catch (err) {
            log.error('Dashboard login error:', err.message);
            res.status(500).json({ error: 'Internal error' });
        }
    });

    // --- Health (shared, but reachable from dashboard) ---
    router.get('/health', async (req, res) => {
        try {
            const mem = process.memoryUsage();
            let dbStatus = 'unknown';
            try {
                await db.getUserLanguage?.('__health_check__');
                dbStatus = 'ok';
            } catch { dbStatus = 'error'; }

            const lagStart = process.hrtime.bigint();
            await new Promise(resolve => setImmediate(resolve));
            const lagMs = Math.round(Number(process.hrtime.bigint() - lagStart) / 1e6);

            res.json({
                status: dbStatus === 'ok' ? 'ok' : 'degraded',
                uptimeSeconds: Math.round(process.uptime()),
                startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                now: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                node: process.version,
                memory: {
                    rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
                },
                eventLoopLagMs: lagMs,
                db: dbStatus,
                inFlight: 0,
                rateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 120),
                rateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60000),
                requestBuckets: 0,
                queue: { mode: 'memory', handlers: [] },
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- JWT Refresh (protected, returns a fresh token) ---
    router.post('/auth/refresh', authMiddleware, async (req, res) => {
        try {
            const user = req.dashboardUser;
            const role = await getUserRole(user.userId, user.username);
            const token = createJWT({
                userId: user.userId,
                username: user.username,
                firstName: user.firstName,
                role,
            });
            res.json({ token, role });
        } catch (err) {
            res.status(500).json({ error: 'Failed to refresh token' });
        }
    });

    // ==================
    // PROTECTED ROUTES
    // ==================
    router.use(authMiddleware);

    // --- AI Chat Routes (Web AI Chat) ---
    const { createChatRoutes } = require('./chatRoutes');
    router.use('/ai', createChatRoutes());

    // --- Market & Onchain Routes ---
    const { createMarketRoutes } = require('./marketRoutes');
    router.use('/market', createMarketRoutes());

    // --- OKX CEX Trading Routes ---
    const { createOkxRoutes } = require('./okxRoutes');
    router.use('/okx', createOkxRoutes());

    // --- Owner Routes ---
    router.get('/owner/users', ownerGuard, async (req, res) => {
        try {
            const users = await db.listUsersDetailed?.() || [];
            res.json({ users });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/users/banned', ownerGuard, async (req, res) => {
        try {
            const users = await db.listBannedUsers?.() || [];
            res.json({ users });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/owner/users/ban', ownerGuard, async (req, res) => {
        try {
            const { userId, reason } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            await db.addBannedUser?.(userId, { reason, bannedBy: req.dashboardUser.userId });
            log.info(`Dashboard: Banned user ${userId} by ${req.dashboardUser.userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/owner/users/unban', ownerGuard, async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            await db.removeBannedUser?.(userId);
            log.info(`Dashboard: Unbanned user ${userId} by ${req.dashboardUser.userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/co-owners', ownerGuard, async (req, res) => {
        try {
            const coOwners = await db.listCoOwners?.() || [];
            res.json({ coOwners });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/groups', ownerGuard, async (req, res) => {
        try {
            const groups = await db.listGroupProfiles?.() || [];
            res.json({ groups });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/analytics', ownerGuard, async (req, res) => {
        try {
            const period = req.query.period || '7d';
            const days = period === '30d' ? 30 : 7;
            const since = Date.now() - days * 86400000;

            // Aggregate stats from command_usage_logs
            const commandStats = await db.getCommandUsageStats?.(since) || {};
            const userStats = await db.getGlobalUserStats?.() || {};

            res.json({
                totalCommands: commandStats.total || 0,
                aiChats: userStats.totalAiChats || 0,
                gamesPlayed: userStats.totalGamesPlayed || 0,
                checkins: userStats.totalCheckins || 0,
                dailyUsage: commandStats.daily || [],
                topCommands: commandStats.topCommands || [],
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Owner: Dashboard Overview Stats ---
    router.get('/owner/overview', ownerGuard, async (req, res) => {
        try {
            const [users, groups, health] = await Promise.allSettled([
                db.listUsersDetailed?.(),
                db.listGroupProfiles?.(),
                Promise.resolve(process.memoryUsage()),
            ]);

            const userList = users.status === 'fulfilled' ? (users.value || []) : [];
            const groupList = groups.status === 'fulfilled' ? (groups.value || []) : [];
            const mem = health.status === 'fulfilled' ? health.value : process.memoryUsage();

            // Calculate active users (seen in last 7 days)
            const weekAgo = Date.now() - 7 * 86400000;
            const activeUsers = userList.filter(u => u.lastSeen && u.lastSeen > weekAgo).length;

            // Telegram API latency test
            let telegramLatencyMs = -1;
            try {
                const { bot } = require('../core/bot');
                const start = Date.now();
                await bot.getMe();
                telegramLatencyMs = Date.now() - start;
            } catch { /* ignore */ }

            res.json({
                totalUsers: userList.length,
                activeUsers,
                totalGroups: groupList.length,
                memory: {
                    rss: Math.round(mem.rss / 1024 / 1024),
                    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
                },
                uptimeSeconds: Math.round(process.uptime()),
                telegramLatencyMs,
                nodeVersion: process.version,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Owner: Bot Config (read/write runtime settings) ---
    router.get('/owner/config/runtime', ownerGuard, async (req, res) => {
        try {
            res.json({
                botUsername: process.env.BOT_USERNAME || global._botUsername || '',
                defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
                aiProvider: process.env.DEFAULT_AI_PROVIDER || 'google',
                apiPort: process.env.API_PORT || 3000,
                publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
                rateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 120),
                webhookMode: process.env.TELEGRAM_WEBHOOK_URL ? true : false,
                features: {
                    games: process.env.DISABLE_GAMES !== 'true',
                    ai: process.env.DISABLE_AI !== 'true',
                    trading: process.env.DISABLE_TRADING !== 'true',
                    priceAlerts: process.env.DISABLE_PRICE_ALERTS !== 'true',
                },
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Owner: Full Settings (read/write for dashboard Settings page) ---
    router.get('/owner/config/settings', ownerGuard, async (req, res) => {
        try {
            // Read system prompt from DB or env
            let systemPrompt = '';
            try {
                const promptData = await db.getGlobalConfig?.('ai_system_prompt');
                systemPrompt = promptData?.value || '';
            } catch { /* ignore */ }

            res.json({
                defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
                aiProvider: process.env.DEFAULT_AI_PROVIDER || 'google',
                systemPrompt,
                features: {
                    games: process.env.DISABLE_GAMES !== 'true',
                    ai: process.env.DISABLE_AI !== 'true',
                    trading: process.env.DISABLE_TRADING !== 'true',
                    priceAlerts: process.env.DISABLE_PRICE_ALERTS !== 'true',
                },
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/owner/config/settings', ownerGuard, async (req, res) => {
        try {
            const { systemPrompt, defaultLanguage, features } = req.body;

            // Save system prompt to DB
            if (systemPrompt !== undefined) {
                try {
                    await db.setGlobalConfig?.('ai_system_prompt', systemPrompt);
                } catch { /* DB method may not exist */ }
            }

            // Log the configuration change
            log.info(`Dashboard: Owner ${req.dashboardUser.userId} updated settings — lang:${defaultLanguage || '-'}, features:${JSON.stringify(features || {})}`);

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- User Routes ---
    router.get('/user/profile', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const user = await db.getUser?.(userId);
            const prefs = await db.getAiPreferences?.(userId);
            const memory = await db.getAiMemory?.(userId);
            res.json({
                user: user || {},
                preferences: {
                    language: user?.lang || 'en',
                    persona: memory?.persona || 'default',
                    provider: prefs?.provider || 'google',
                    thinkingLevel: prefs?.thinkingLevel || 'medium',
                },
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/user/preferences', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const { language, persona, provider, thinkingLevel } = req.body;
            if (language) await db.setUserLanguage?.(userId, language, 'dashboard');
            if (persona) await db.setAiPersona?.(userId, persona);
            if (provider || thinkingLevel) {
                await db.setAiPreferences?.(userId, { provider, thinkingLevel });
            }
            log.info(`Dashboard: User ${userId} updated preferences`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/user/stats', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const stats = await db.getUserStats?.(userId) || {};
            res.json(stats);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/user/wallets', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const wallets = await db.getTradingWallets?.(userId) || [];
            // Strip encrypted keys for security
            const safeWallets = wallets.map(w => ({
                id: w.id,
                walletName: w.walletName,
                address: w.address,
                chainIndex: w.chainIndex,
                isDefault: w.isDefault,
                createdAt: w.createdAt,
            }));
            res.json({ wallets: safeWallets });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/user/trading-history', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const limit = Math.min(Number(req.query.limit) || 50, 200);
            const history = await db.getTransactionHistory?.(userId, limit) || [];
            res.json({ history });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/user/favorites', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const favorites = await db.getFavoriteTokens?.(userId) || [];
            res.json({ favorites });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // PRICE ALERTS (Owner)
    // ==================
    router.get('/owner/alerts', ownerGuard, async (req, res) => {
        try {
            // List all price alert tokens across all chats (owner sees everything)
            const alerts = await db.listPriceAlertTokens?.('__all__') || [];
            res.json({ alerts });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/owner/alerts', ownerGuard, async (req, res) => {
        try {
            const { tokenAddress, tokenLabel, intervalSeconds, chatId } = req.body;
            if (!tokenAddress || !tokenLabel) return res.status(400).json({ error: 'tokenAddress and tokenLabel required' });
            const id = await db.upsertPriceAlertToken?.(chatId || '__dashboard__', {
                tokenAddress, tokenLabel, tokenSymbol: tokenLabel, intervalSeconds: intervalSeconds || 300, enabled: true,
            });
            log.info(`Dashboard: Created price alert for ${tokenLabel} by ${req.dashboardUser.userId}`);
            res.json({ success: true, id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/owner/alerts/:id', ownerGuard, async (req, res) => {
        try {
            const { enabled, intervalSeconds, tokenLabel } = req.body;
            const updates = {};
            if (enabled !== undefined) updates.enabled = enabled;
            if (intervalSeconds) updates.intervalSeconds = intervalSeconds;
            if (tokenLabel) updates.tokenLabel = tokenLabel;
            await db.updatePriceAlertToken?.('__all__', req.params.id, updates);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/owner/alerts/:id', ownerGuard, async (req, res) => {
        try {
            await db.deletePriceAlertToken?.('__all__', req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // SCHEDULED POSTS (Owner)
    // ==================
    router.get('/owner/posts', ownerGuard, async (req, res) => {
        try {
            const posts = await db.getScheduledPosts?.('__all__') || [];
            res.json({ posts });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/owner/posts', ownerGuard, async (req, res) => {
        try {
            const { chatId, content, scheduleTime, repeatType, timezone } = req.body;
            if (!chatId || !content) return res.status(400).json({ error: 'chatId and content required' });
            const id = await db.createScheduledPost?.(chatId, {
                content, scheduleTime, repeatType: repeatType || 'none',
                timezone: timezone || 'UTC', createdBy: req.dashboardUser.userId,
            });
            log.info(`Dashboard: Created scheduled post by ${req.dashboardUser.userId}`);
            res.json({ success: true, id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/owner/posts/:id', ownerGuard, async (req, res) => {
        try {
            const { content, scheduleTime, repeatType, enabled } = req.body;
            const updates = {};
            if (content !== undefined) updates.content = content;
            if (scheduleTime !== undefined) updates.scheduleTime = scheduleTime;
            if (repeatType !== undefined) updates.repeatType = repeatType;
            if (enabled !== undefined) updates.enabled = enabled;
            await db.updateScheduledPost?.(req.params.id, updates);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/owner/posts/:id', ownerGuard, async (req, res) => {
        try {
            await db.deleteScheduledPost?.(req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // CONFIG (Owner)
    // ==================
    router.get('/owner/config/ai-keys', ownerGuard, async (req, res) => {
        try {
            const keys = await db.listAllUserAiKeysDetailed?.() || [];
            // Mask API keys for security
            const masked = keys.map(k => ({
                ...k,
                apiKey: k.apiKey ? `${k.apiKey.slice(0, 8)}...${k.apiKey.slice(-4)}` : '***',
            }));
            res.json({ keys: masked });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/config/blocks', ownerGuard, async (req, res) => {
        try {
            const blocks = await db.listApiKeyBlocks?.() || [];
            res.json({ blocks });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/owner/config/block-user', ownerGuard, async (req, res) => {
        try {
            const { userId, reason } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            await db.setApiKeyBlock?.(userId, true, reason, req.dashboardUser.userId);
            log.info(`Dashboard: Blocked API keys for ${userId} by ${req.dashboardUser.userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/owner/config/unblock-user', ownerGuard, async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            await db.setApiKeyBlock?.(userId, false);
            log.info(`Dashboard: Unblocked API keys for ${userId} by ${req.dashboardUser.userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/owner/config/co-owner/:userId', ownerGuard, async (req, res) => {
        try {
            await db.removeCoOwner?.(req.params.userId);
            log.info(`Dashboard: Removed co-owner ${req.params.userId} by ${req.dashboardUser.userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // LEADERBOARD (User)
    // ==================
    router.get('/user/leaderboard', async (req, res) => {
        try {
            const gameType = req.query.gameType || 'sudoku';
            const leaderboard = await db.getCommandUsageLeaderboard?.(gameType, 50) || [];
            res.json({ leaderboard });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createDashboardRoutes };
