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

    // --- Auth: Token refresh ---
    router.post('/auth/refresh', async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'No token' });
            }
            // Decode without strict expiry check (allow slightly expired tokens for refresh)
            const token = authHeader.slice(7);
            let payload;
            try {
                const [, body] = token.split('.');
                payload = JSON.parse(Buffer.from(body, 'base64url').toString());
            } catch {
                return res.status(401).json({ error: 'Invalid token' });
            }
            // Verify signature
            const [header, body, signature] = token.split('.');
            const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
            if (signature !== expected) return res.status(401).json({ error: 'Invalid signature' });

            // Allow refresh within 24h of expiry
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && now - payload.exp > 86400) {
                return res.status(401).json({ error: 'Token expired beyond refresh window' });
            }

            const role = await getUserRole(payload.userId, payload.username);
            const newToken = createJWT({
                userId: payload.userId,
                username: payload.username,
                firstName: payload.firstName,
                role,
            });

            res.json({ token: newToken, role });
        } catch (err) {
            log.error('Dashboard token refresh error:', err.message);
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

    // --- Social Hub Routes (Community Feed, Posts, DMs) ---
    const { createSocialRoutes } = require('./socialRoutes');
    router.use('/social', createSocialRoutes());

    // --- User Overview (safe, non-sensitive system data) ---
    router.get('/user/overview', async (req, res) => {
        try {
            const mem = process.memoryUsage();

            // Telegram API latency test
            let telegramLatencyMs = -1;
            try {
                const { bot } = require('../core/bot');
                const start = Date.now();
                await bot.getMe();
                telegramLatencyMs = Date.now() - start;
            } catch { /* ignore */ }

            res.json({
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
            // Enrich each group with subscription + settings summary
            const enriched = await Promise.all(groups.map(async (g) => {
                let subscription = null, settingsSummary = {};
                try { subscription = await db.getGroupSubscription?.(g.chatId); } catch {}
                try {
                    const s = await db.getGroupBotSettings?.(g.chatId);
                    settingsSummary = { hasRules: !!s?.rulesText, hasBlacklist: (s?.blacklist?.length || 0) > 0 };
                } catch {}
                return { ...g, subscription, ...settingsSummary };
            }));
            res.json({ groups: enriched });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Group Detail ---
    router.get('/owner/groups/:chatId', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const [settings, subscription, memberLangs] = await Promise.all([
                db.getGroupBotSettings?.(chatId) || {},
                db.getGroupSubscription?.(chatId),
                db.getGroupMemberLanguages?.(chatId) || [],
            ]);
            res.json({
                settings: settings || {},
                rules: settings?.rulesText || null,
                blacklist: Array.isArray(settings?.blacklist) ? settings.blacklist : [],
                subscription: subscription || null,
                memberLanguages: memberLangs || [],
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Telegram HTML Sanitizer ---
    // Telegram only supports: b, strong, i, em, u, ins, s, strike, del, code, pre, a, tg-spoiler, blockquote, tg-emoji
    const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'a', 'tg-spoiler', 'blockquote', 'tg-emoji']);
    function sanitizeTelegramHtml(html) {
        if (!html) return '';
        return html
            // Convert headings to bold + newline
            .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '<b>$1</b>\n')
            // Convert <p> to newlines
            .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')
            // Convert <br> to newlines
            .replace(/<br\s*\/?>/gi, '\n')
            // Strip all remaining unsupported tags (keep content)
            .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g, (match, tag) => {
                const t = tag.toLowerCase();
                if (ALLOWED_TAGS.has(t)) return match;
                return ''; // strip unsupported tag
            })
            .replace(/\n{3,}/g, '\n\n') // collapse excessive newlines
            .trim();
    }

    // --- Activity Log Helper (must be defined before endpoints that use it) ---
    const logGroupActivity = async (chatId, action, details, userId) => {
        try {
            const ts = Math.floor(Date.now() / 1000);
            await db.dbRun(
                `INSERT INTO group_activity_log (chatId, action, details, userId, createdAt) VALUES (?, ?, ?, ?, ?)`,
                [chatId, action, details || '', userId || '', ts]
            );
            // Broadcast via WebSocket
            try {
                const { broadcastWsEvent } = require('./apiServer');
                broadcastWsEvent('group_activity', { chatId, action, details, userId, ts });
            } catch { /* ws might not be ready */ }
        } catch { /* ignore logging failures */ }
    };

    // --- Broadcast Message to All Groups (must be before :chatId routes) ---
    router.post('/owner/groups/broadcast', ownerGuard, async (req, res) => {
        try {
            const { text } = req.body;
            if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

            const { bot } = require('../core/bot');
            const groups = await db.listGroupProfiles?.() || [];
            let success = 0, failed = 0;

            for (const [idx, g] of groups.entries()) {
                try {
                    await bot.sendMessage(g.chatId, sanitizeTelegramHtml(text.trim()), { parse_mode: 'HTML' });
                    success++;
                } catch {
                    failed++;
                }
                // Rate limit: wait 500ms between messages
                if (idx < groups.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            log.info(`Dashboard: Broadcast sent to ${success}/${groups.length} groups by ${req.dashboardUser.userId}`);
            logGroupActivity('ALL', 'broadcast', `Sent to ${success}/${groups.length} groups`, req.dashboardUser.userId);
            res.json({ success: true, sent: success, failed, total: groups.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Get Recent Activity (all groups, must be before :chatId routes) ---
    router.get('/owner/activity/recent', ownerGuard, async (req, res) => {
        try {
            const limit = Math.min(Number(req.query.limit) || 20, 50);
            const rows = await db.dbAll(
                `SELECT * FROM group_activity_log ORDER BY createdAt DESC LIMIT ?`,
                [limit]
            ) || [];
            res.json({ logs: rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Update Group Settings ---
    router.put('/owner/groups/:chatId/settings', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const { settings, rules, blacklist, subscription } = req.body;

            // Merge all bot settings updates into a single call to avoid overwrites
            const settingsUpdates = {};
            if (settings && typeof settings === 'object') {
                Object.assign(settingsUpdates, settings);
            }
            if (Array.isArray(blacklist)) {
                settingsUpdates.blacklist = blacklist;
            }
            if (Object.keys(settingsUpdates).length > 0) {
                await db.updateGroupBotSettings?.(chatId, settingsUpdates);
            }

            // Update rules
            if (rules !== undefined) {
                await db.setGroupRules?.(chatId, rules, req.dashboardUser.userId);
            }

            // Update subscription
            if (subscription !== undefined) {
                if (subscription === null) {
                    await db.removeGroupSubscription?.(chatId);
                } else if (subscription && typeof subscription === 'object') {
                    await db.upsertGroupSubscription?.(chatId, subscription.lang || 'en', subscription.minStake || 0, subscription.messageThreadId || null);
                }
            }

            log.info(`Dashboard: Group ${chatId} settings updated by ${req.dashboardUser.userId}`);
            logGroupActivity(chatId, 'settings_update', 'Settings updated via dashboard', req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Send Message to Group ---
    router.post('/owner/groups/:chatId/message', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const { text } = req.body;
            if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

            const { bot } = require('../core/bot');
            await bot.sendMessage(chatId, sanitizeTelegramHtml(text.trim()), { parse_mode: 'HTML' });
            log.info(`Dashboard: Message sent to group ${chatId} by ${req.dashboardUser.userId}`);
            logGroupActivity(chatId, 'message_sent', text.trim().substring(0, 100), req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            log.error(`Dashboard: Failed to send message to group: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // --- Delete Group Profile ---
    router.delete('/owner/groups/:chatId', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            await db.removeGroupProfile?.(chatId);
            // Also clean up related data
            try { await db.removeGroupSubscription?.(chatId); } catch {}
            log.info(`Dashboard: Group ${chatId} removed by ${req.dashboardUser.userId}`);
            logGroupActivity(chatId, 'group_deleted', 'Group profile removed', req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Sync Group Member Count from Telegram ---
    router.post('/owner/groups/:chatId/sync', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const { bot } = require('../core/bot');
            const count = await bot.getChatMemberCount(chatId);
            await db.upsertGroupProfile?.({ chatId, memberCount: count });
            logGroupActivity(chatId, 'member_sync', `Synced: ${count} members`, req.dashboardUser.userId);
            res.json({ success: true, memberCount: count });
        } catch (err) {
            log.error(`Dashboard: Failed to sync group ${req.params.chatId}: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // --- Get Group Activity Log ---
    router.get('/owner/groups/:chatId/activity', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const limit = Math.min(Number(req.query.limit) || 50, 100);
            const rows = await db.dbAll(
                `SELECT * FROM group_activity_log WHERE chatId = ? ORDER BY createdAt DESC LIMIT ?`,
                [chatId, limit]
            ) || [];
            res.json({ logs: rows });
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

            // Build user growth data (daily new users)
            let userGrowth = [];
            try {
                const sinceTs = Math.floor(since / 1000);
                const userList = await db.listUsersDetailed?.() || [];
                const dailyMap = {};
                for (let i = 0; i < days; i++) {
                    const d = new Date(Date.now() - i * 86400000);
                    dailyMap[d.toISOString().split('T')[0]] = 0;
                }
                for (const u of userList) {
                    if (u.firstSeen && u.firstSeen > sinceTs) {
                        const date = new Date(u.firstSeen * 1000).toISOString().split('T')[0];
                        if (dailyMap[date] !== undefined) dailyMap[date]++;
                    }
                }
                userGrowth = Object.entries(dailyMap).sort().map(([date, newUsers]) => ({ date, newUsers }));
            } catch { /* ignore */ }

            res.json({
                totalCommands: commandStats.total || 0,
                aiChats: userStats.totalAiChats || 0,
                gamesPlayed: userStats.totalGamesPlayed || 0,
                checkins: userStats.totalCheckins || 0,
                dailyUsage: commandStats.daily || [],
                topCommands: commandStats.topCommands || [],
                userGrowth,
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
            const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
            const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
            const activeUsers = userList.filter(u => u.lastSeen && u.lastSeen > weekAgo).length;
            const newUsersToday = userList.filter(u => u.firstSeen && u.firstSeen > todayStart).length;
            const newUsersWeek = userList.filter(u => u.firstSeen && u.firstSeen > weekAgo).length;

            // Get command count today from usage logs
            let commandsToday = 0;
            try {
                const today = new Date().toISOString().split('T')[0]; // "2026-03-11"
                const row = await db.dbGet(`SELECT SUM(count) as cnt FROM command_usage_logs WHERE usageDate = ?`, [today]);
                commandsToday = row?.cnt || 0;
            } catch { /* table may not exist */ }

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
                newUsersToday,
                newUsersWeek,
                commandsToday,
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
            const prefs = await db.getUserAiModelPreferences?.(userId);
            const memory = await db.getAiMemory?.(userId);
            res.json({
                user: user || {},
                preferences: {
                    language: user?.lang || 'en',
                    persona: memory?.persona || 'default',
                    provider: prefs?.modelFamily ? undefined : (memory?.userPreferences?.provider || 'google'),
                    thinkingLevel: prefs?.thinkingLevel || 'medium',
                    model: prefs?.modelFamily || undefined,
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
            if (persona) {
                await db.updateAiMemory(userId, { persona });
            }
            if (provider || thinkingLevel) {
                await db.saveUserAiModelPreferences(userId, { thinkingLevel });
            }
            log.info(`Dashboard: User ${userId} updated preferences — persona:${persona || '-'}, provider:${provider || '-'}, thinking:${thinkingLevel || '-'}`);
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

    // ==================
    // ADMIN ANALYTICS (#15)
    // ==================
    router.get('/owner/analytics/stats', async (req, res) => {
        try {
            const sessions = await db.dbAll?.('SELECT * FROM web_chat_sessions ORDER BY updatedAt DESC LIMIT 500') || [];
            const totalSessions = sessions.length;
            const uniqueUsers = new Set(sessions.map(s => s.userId)).size;
            const totalMessages = sessions.reduce((sum, s) => {
                try { return sum + JSON.parse(s.messages || '[]').length; } catch { return sum; }
            }, 0);
            // Messages per day (last 7 days)
            const now = Date.now();
            const dailyStats = [];
            for (let i = 6; i >= 0; i--) {
                const dayStart = now - (i + 1) * 86400_000;
                const dayEnd = now - i * 86400_000;
                const daySessions = sessions.filter(s => s.updatedAt >= dayStart && s.updatedAt < dayEnd);
                const dayMessages = daySessions.reduce((sum, s) => {
                    try { return sum + JSON.parse(s.messages || '[]').length; } catch { return sum; }
                }, 0);
                dailyStats.push({
                    date: new Date(dayEnd).toISOString().slice(0, 10),
                    messages: dayMessages,
                    users: new Set(daySessions.map(s => s.userId)).size,
                });
            }
            res.json({ totalSessions, uniqueUsers, totalMessages, dailyStats });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // USER PREFERENCES (#12)
    // ==================
    router.get('/user/preferences', async (req, res) => {
        try {
            const prefs = await db.getUserPreferences(req.dashboardUser.id);
            res.json({ preferences: prefs });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/user/preferences', async (req, res) => {
        try {
            const { key, value } = req.body;
            if (!key) return res.status(400).json({ error: 'key is required' });
            await db.setUserPreference(req.dashboardUser.id, key, value);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // TRADE HISTORY (#11)
    // ==================
    router.get('/user/trades', async (req, res) => {
        try {
            const trades = await db.getTradeHistory(req.dashboardUser.id, 100);
            res.json({ trades });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/user/trades/summary', async (req, res) => {
        try {
            const summary = await db.getTradeSummary(req.dashboardUser.id);
            res.json({ summary });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // SCHEDULED REPORTS (#13)
    // ==================
    router.get('/user/reports', async (req, res) => {
        try {
            const reports = await db.getUserReports(req.dashboardUser.id);
            res.json({ reports });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/user/reports', async (req, res) => {
        try {
            const { type, frequency, time } = req.body;
            if (!type || !frequency) return res.status(400).json({ error: 'type and frequency required' });
            await db.createScheduledReport(req.dashboardUser.id, type, frequency, time);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // CHECKIN ADMIN (Owner)
    // ==================
    router.get('/owner/checkin/groups', ownerGuard, async (req, res) => {
        try {
            const groups = await db.listCheckinGroups?.() || [];
            res.json({ groups });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/checkin/groups/:chatId', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const settings = await db.getCheckinGroup?.(chatId);
            res.json({ settings: settings || {} });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/owner/checkin/groups/:chatId', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const patch = req.body;
            const updated = await db.updateCheckinGroup?.(chatId, patch);
            log.info(`Dashboard: Checkin settings for ${chatId} updated by ${req.dashboardUser.userId}`);
            res.json({ success: true, settings: updated });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/owner/checkin/leaderboard/:chatId', ownerGuard, async (req, res) => {
        try {
            const chatId = decodeURIComponent(req.params.chatId);
            const mode = req.query.mode || 'streak';
            const limit = Math.min(Number(req.query.limit) || 20, 100);
            const settings = await db.getCheckinGroup?.(chatId);
            const top = await db.getTopCheckins?.(chatId, limit, mode, settings?.leaderboardPeriodStart) || [];
            res.json({ leaderboard: top });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // AI MEMORY (User) — delete preferences
    // ==================
    router.delete('/user/preferences/:key', async (req, res) => {
        try {
            const key = decodeURIComponent(req.params.key);
            await db.deleteUserPreference(req.dashboardUser.id, key);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // DCA (Dollar-Cost Averaging) CRUD (User)
    // ==================
    const { dbGet: dcaDbGet, dbRun: dcaDbRun, dbAll: dcaDbAll } = require('../../db/core');

    // List user's DCA tasks
    router.get('/user/dca', async (req, res) => {
        try {
            const userId = String(req.dashboardUser.userId);
            const tasks = await dcaDbAll(
                "SELECT * FROM ai_scheduled_tasks WHERE userId = ? AND type = 'dca_swap' ORDER BY createdAt DESC",
                [userId]
            ) || [];
            const mapped = tasks.map(t => {
                const p = JSON.parse(t.params || '{}');
                return {
                    id: t.id,
                    status: t.enabled === 2 ? 'paused' : t.enabled === 1 ? 'active' : 'cancelled',
                    chainIndex: p.chainIndex || '196',
                    fromTokenAddress: p.fromTokenAddress,
                    toTokenAddress: p.toTokenAddress,
                    fromSymbol: p.fromSymbol || '?',
                    toSymbol: p.toSymbol || '?',
                    amount: p.amount,
                    intervalMs: t.intervalMs,
                    nextRunAt: t.nextRunAt,
                    stopLossPct: p.stopLossPct,
                    takeProfitPct: p.takeProfitPct,
                    walletId: p.walletId,
                    createdAt: t.createdAt,
                };
            });
            res.json({ tasks: mapped });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Create new DCA task
    router.post('/user/dca', async (req, res) => {
        try {
            const userId = String(req.dashboardUser.userId);
            const { walletId, chainIndex = '196', fromTokenAddress, toTokenAddress,
                fromSymbol, toSymbol, amount, intervalMs = 86400000,
                stopLossPct, takeProfitPct } = req.body;

            if (!walletId || !fromTokenAddress || !toTokenAddress || !amount) {
                return res.status(400).json({ error: 'Missing required fields: walletId, fromTokenAddress, toTokenAddress, amount' });
            }

            // Check wallet ownership
            const wallet = await dcaDbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
            if (!wallet) return res.status(404).json({ error: 'Wallet not found or not yours' });

            // Check max limit
            const existing = await dcaDbAll("SELECT id FROM ai_scheduled_tasks WHERE userId = ? AND type = 'dca_swap' AND enabled = 1", [userId]) || [];
            if (existing.length >= 5) {
                return res.status(400).json({ error: 'Max 5 DCA tasks allowed. Cancel some first.' });
            }

            const taskId = `dca_${userId}_${Date.now()}`;
            const params = JSON.stringify({
                walletId, chainIndex,
                fromTokenAddress, toTokenAddress,
                fromSymbol: fromSymbol || '?', toSymbol: toSymbol || '?',
                amount,
                stopLossPct: stopLossPct ? Number(stopLossPct) : null,
                takeProfitPct: takeProfitPct ? Number(takeProfitPct) : null,
                initialPrice: null,
                consecutiveFailures: 0
            });
            const chatId = userId;
            await dcaDbRun(
                'INSERT INTO ai_scheduled_tasks (id, userId, chatId, type, intervalMs, nextRunAt, params, enabled, lang, createdAt) VALUES (?,?,?,?,?,?,?,1,?,?)',
                [taskId, userId, chatId, 'dca_swap', intervalMs, Date.now() + intervalMs, params, 'en', Math.floor(Date.now() / 1000)]
            );

            log.info(`Dashboard DCA created: ${taskId} by user ${userId}`);
            res.json({ success: true, taskId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Pause / Resume / Edit DCA task
    router.patch('/user/dca/:id', async (req, res) => {
        try {
            const userId = String(req.dashboardUser.userId);
            const taskId = req.params.id;
            const { action } = req.body; // 'pause', 'resume', or 'edit'
            const task = await dcaDbGet("SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ? AND type = 'dca_swap'", [taskId, userId]);
            if (!task) return res.status(404).json({ error: 'Task not found' });

            if (action === 'pause') {
                await dcaDbRun("UPDATE ai_scheduled_tasks SET enabled = 2 WHERE id = ?", [taskId]);
            } else if (action === 'resume') {
                await dcaDbRun("UPDATE ai_scheduled_tasks SET enabled = 1, nextRunAt = ? WHERE id = ?", [Date.now() + task.intervalMs, taskId]);
            } else if (action === 'edit') {
                const { amount, intervalMs, stopLossPct, takeProfitPct } = req.body;
                const params = JSON.parse(task.params || '{}');
                if (amount !== undefined) params.amount = amount;
                if (stopLossPct !== undefined) params.stopLossPct = stopLossPct ? Number(stopLossPct) : null;
                if (takeProfitPct !== undefined) params.takeProfitPct = takeProfitPct ? Number(takeProfitPct) : null;
                const newIntervalMs = intervalMs ? Number(intervalMs) : task.intervalMs;
                await dcaDbRun(
                    "UPDATE ai_scheduled_tasks SET params = ?, intervalMs = ?, nextRunAt = ? WHERE id = ?",
                    [JSON.stringify(params), newIntervalMs, Date.now() + newIntervalMs, taskId]
                );
            } else {
                return res.status(400).json({ error: 'Invalid action. Use pause, resume, or edit.' });
            }
            log.info(`Dashboard DCA ${action}: ${taskId} by user ${userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Cancel (delete) DCA task
    router.delete('/user/dca/:id', async (req, res) => {
        try {
            const userId = String(req.dashboardUser.userId);
            const taskId = req.params.id;
            const task = await dcaDbGet("SELECT * FROM ai_scheduled_tasks WHERE id = ? AND userId = ?", [taskId, userId]);
            if (!task) return res.status(404).json({ error: 'Task not found' });
            await dcaDbRun("DELETE FROM ai_scheduled_tasks WHERE id = ? AND userId = ?", [taskId, userId]);
            log.info(`Dashboard DCA deleted: ${taskId} by user ${userId}`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });


    // ==================
    // USER GROUP MANAGEMENT (users manage only groups they admin)
    // ==================

    // Security middleware: verify user is admin of the target group
    async function userGroupGuard(req, res, next) {
        try {
            const userId = String(req.dashboardUser.userId);
            const chatId = decodeURIComponent(req.params.chatId);
            if (!chatId) return res.status(400).json({ error: 'chatId required' });

            // Fast DB check first
            const inDb = await db.isGroupAdminInDb?.(chatId, userId);
            if (inDb) {
                req.groupChatId = chatId;
                return next();
            }

            // Verify with Telegram API
            try {
                const { bot } = require('../core/bot');
                const member = await bot.getChatMember(chatId, userId);
                if (member && (member.status === 'administrator' || member.status === 'creator')) {
                    // Cache in DB for future requests
                    await db.addGroupAdmin?.(chatId, userId);
                    req.groupChatId = chatId;
                    return next();
                }
            } catch (tgErr) {
                log.warn(`userGroupGuard: Telegram check failed for user ${userId} in ${chatId}: ${tgErr.message}`);
            }

            return res.status(403).json({ error: 'You are not an admin of this group' });
        } catch (err) {
            log.error(`userGroupGuard error: ${err.message}`);
            return res.status(500).json({ error: 'Authorization check failed' });
        }
    }

    // List groups where user is admin (with auto-discovery)
    router.get('/user/groups', async (req, res) => {
        try {
            const userId = String(req.dashboardUser.userId);
            const { bot } = require('../core/bot');
            const { dbRun: _dbRun } = require('../../db/core');

            // Ensure the group_admins table exists (self-healing)
            try {
                await _dbRun(`CREATE TABLE IF NOT EXISTS group_admins (
                    chatId TEXT, userId TEXT, addedAt INTEGER,
                    PRIMARY KEY (chatId, userId)
                )`);
                await _dbRun(`CREATE INDEX IF NOT EXISTS idx_group_admins_userId ON group_admins(userId)`);
            } catch (tableErr) {
                log.warn(`group_admins table creation: ${tableErr.message}`);
            }

            // Step 1: Get all group profiles the bot is tracking
            const allGroupProfiles = await db.listGroupProfiles?.() || [];
            log.info(`User ${userId} group discovery: ${allGroupProfiles.length} total group profiles found`);

            // Step 2: Get already-cached admin records
            let cachedGroups = [];
            try {
                cachedGroups = await db.getGroupsByAdmin?.(userId) || [];
            } catch (cacheErr) {
                log.warn(`getGroupsByAdmin failed: ${cacheErr.message}`);
            }
            const cachedChatIds = new Set(cachedGroups.map(g => String(g.chatId)));

            // Step 3: Discover new groups where user might be admin
            const uncheckedGroups = allGroupProfiles.filter(gp => !cachedChatIds.has(String(gp.chatId)));
            log.info(`User ${userId}: ${cachedGroups.length} cached, ${uncheckedGroups.length} to check via Telegram API`);

            // Check Telegram API for each unchecked group
            for (const gp of uncheckedGroups) {
                try {
                    const member = await bot.getChatMember(gp.chatId, userId);
                    if (member && (member.status === 'administrator' || member.status === 'creator')) {
                        try {
                            await db.addGroupAdmin?.(gp.chatId, userId);
                        } catch (addErr) {
                            log.warn(`addGroupAdmin failed for ${gp.chatId}: ${addErr.message}`);
                        }
                        cachedGroups.push(gp); // Add to result directly
                        log.info(`User ${userId} discovered as admin of group ${gp.chatId} (${gp.title})`);
                    }
                } catch (tgErr) {
                    // Bot might not be in group anymore, or API error — skip
                    log.debug?.(`getChatMember skipped for ${gp.chatId}: ${tgErr.message}`);
                }
                // Small delay to avoid Telegram rate limits
                if (uncheckedGroups.length > 3) {
                    await new Promise(r => setTimeout(r, 150));
                }
            }

            // Step 4: Enrich with subscription + settings
            const enriched = await Promise.all(cachedGroups.map(async (g) => {
                let subscription = null, settingsSummary = {};
                try { subscription = await db.getGroupSubscription?.(g.chatId); } catch {}
                try {
                    const s = await db.getGroupBotSettings?.(g.chatId);
                    settingsSummary = { hasRules: !!s?.rulesText, hasBlacklist: (s?.blacklist?.length || 0) > 0, lang: s?.groupLanguage };
                } catch {}
                return { ...g, subscription, ...settingsSummary };
            }));

            log.info(`User ${userId} groups result: ${enriched.length} groups`);
            res.json({ groups: enriched });
        } catch (err) {
            log.error(`GET /user/groups FATAL: ${err.message}\n${err.stack}`);
            res.status(500).json({ error: err.message });
        }
    });

    // Get group detail
    router.get('/user/groups/:chatId', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const [settings, subscription, memberLangs] = await Promise.all([
                db.getGroupBotSettings?.(chatId) || {},
                db.getGroupSubscription?.(chatId),
                db.getGroupMemberLanguages?.(chatId) || [],
            ]);
            res.json({
                settings: settings || {},
                rules: settings?.rulesText || null,
                blacklist: Array.isArray(settings?.blacklist) ? settings.blacklist : [],
                subscription: subscription || null,
                memberLanguages: memberLangs || [],
                groupLanguage: settings?.groupLanguage || null,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update group settings (user-level)
    router.put('/user/groups/:chatId/settings', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { settings, rules, blacklist, subscription } = req.body;

            const settingsUpdates = {};
            if (settings && typeof settings === 'object') {
                Object.assign(settingsUpdates, settings);
            }
            if (Array.isArray(blacklist)) {
                settingsUpdates.blacklist = blacklist;
            }
            if (Object.keys(settingsUpdates).length > 0) {
                await db.updateGroupBotSettings?.(chatId, settingsUpdates);
            }
            if (rules !== undefined) {
                await db.setGroupRules?.(chatId, rules, req.dashboardUser.userId);
            }
            if (subscription !== undefined) {
                if (subscription === null) {
                    await db.removeGroupSubscription?.(chatId);
                } else if (subscription && typeof subscription === 'object') {
                    await db.upsertGroupSubscription?.(chatId, subscription.lang || 'en', subscription.minStake || 0, subscription.messageThreadId || null);
                }
            }
            log.info(`Dashboard: User ${req.dashboardUser.userId} updated group ${chatId} settings`);
            logGroupActivity(chatId, 'settings_update', `Settings updated by user ${req.dashboardUser.userId}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Send message to group (user-level)
    router.post('/user/groups/:chatId/message', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { text } = req.body;
            if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

            const { bot } = require('../core/bot');
            await bot.sendMessage(chatId, sanitizeTelegramHtml(text.trim()), { parse_mode: 'HTML' });
            log.info(`Dashboard: User ${req.dashboardUser.userId} sent message to group ${chatId}`);
            logGroupActivity(chatId, 'message_sent', text.trim().substring(0, 100), req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Sync group member count (user-level)
    router.post('/user/groups/:chatId/sync', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { bot } = require('../core/bot');
            const count = await bot.getChatMemberCount(chatId);
            await db.upsertGroupProfile?.({ chatId, memberCount: count });
            logGroupActivity(chatId, 'member_sync', `Synced: ${count} members (by user)`, req.dashboardUser.userId);
            res.json({ success: true, memberCount: count });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get checkin settings for a group (user-level)
    router.get('/user/groups/:chatId/checkin', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const settings = await db.getCheckinGroup?.(chatId);
            res.json({ settings: settings || {} });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update checkin settings (user-level)
    router.put('/user/groups/:chatId/checkin', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const patch = req.body;
            const updated = await db.updateCheckinGroup?.(chatId, patch);
            log.info(`Dashboard: User ${req.dashboardUser.userId} updated checkin for ${chatId}`);
            logGroupActivity(chatId, 'checkin_update', `Checkin settings updated by user`, req.dashboardUser.userId);
            res.json({ success: true, settings: updated });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get checkin leaderboard (user-level)
    router.get('/user/groups/:chatId/checkin/leaderboard', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const mode = req.query.mode || 'streak';
            const limit = Math.min(Number(req.query.limit) || 20, 100);
            const settings = await db.getCheckinGroup?.(chatId);
            const top = await db.getTopCheckins?.(chatId, limit, mode, settings?.leaderboardPeriodStart) || [];
            res.json({ leaderboard: top });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get welcome verification settings (user-level)
    // Returns: enabled, timeLimitSeconds, maxAttempts, action, questionWeights, titleTemplate
    router.get('/user/groups/:chatId/welcome', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const settings = await db.getGroupBotSettings?.(chatId) || {};
            const welcome = settings.welcomeVerification || {};
            res.json({
                enabled: !!welcome.enabled,
                timeLimitSeconds: welcome.timeLimitSeconds || 60,
                maxAttempts: welcome.maxAttempts || 3,
                action: welcome.action || 'kick',
                // Question type weights (percentages, must sum > 0)
                questionWeights: {
                    math: welcome.mathWeight ?? 50,
                    physics: welcome.physicsWeight ?? 0,
                    chemistry: welcome.chemistryWeight ?? 0,
                    okx: welcome.okxWeight ?? 25,
                    crypto: welcome.cryptoWeight ?? 25,
                },
                titleTemplate: welcome.titleTemplate || '',
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update welcome verification settings (user-level)
    // Accepts: enabled, timeLimitSeconds, maxAttempts, action, questionWeights, titleTemplate
    router.put('/user/groups/:chatId/welcome', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { enabled, timeLimitSeconds, maxAttempts, action, questionWeights, titleTemplate } = req.body;
            const welcomeSettings = {};
            if (enabled !== undefined) welcomeSettings.enabled = !!enabled;
            if (timeLimitSeconds !== undefined) welcomeSettings.timeLimitSeconds = Math.max(15, Math.min(300, Number(timeLimitSeconds) || 60));
            if (maxAttempts !== undefined) welcomeSettings.maxAttempts = Math.max(1, Math.min(10, Number(maxAttempts) || 3));
            if (action !== undefined && ['kick', 'ban', 'mute'].includes(action)) welcomeSettings.action = action;
            // Question weights — sanitize each to 0-100
            if (questionWeights && typeof questionWeights === 'object') {
                const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
                welcomeSettings.mathWeight = clamp(questionWeights.math);
                welcomeSettings.physicsWeight = clamp(questionWeights.physics);
                welcomeSettings.chemistryWeight = clamp(questionWeights.chemistry);
                welcomeSettings.okxWeight = clamp(questionWeights.okx);
                welcomeSettings.cryptoWeight = clamp(questionWeights.crypto);
            }
            // Title template — max 180 chars
            if (titleTemplate !== undefined) {
                welcomeSettings.titleTemplate = (titleTemplate || '').trim().slice(0, 180);
            }
            await db.updateGroupBotSettings?.(chatId, { welcomeVerification: welcomeSettings });
            log.info(`Dashboard: User ${req.dashboardUser.userId} updated welcome for ${chatId}`);
            logGroupActivity(chatId, 'welcome_update', `Welcome verification updated by user`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update group bot language (user-level)
    router.put('/user/groups/:chatId/language', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { lang } = req.body;
            if (!lang) return res.status(400).json({ error: 'lang required' });
            const validLangs = ['en', 'vi', 'zh', 'ko', 'ru', 'id'];
            if (!validLangs.includes(lang)) return res.status(400).json({ error: 'Invalid language code' });
            await db.updateGroupBotSettings?.(chatId, { groupLanguage: lang });
            // Also update subscription language if exists
            try { await db.updateGroupSubscriptionLanguage?.(chatId, lang); } catch {}
            log.info(`Dashboard: User ${req.dashboardUser.userId} set group ${chatId} language to ${lang}`);
            logGroupActivity(chatId, 'language_change', `Language set to ${lang}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // USER GROUP: MODERATION
    // ==================

    // Get group members (via Telegram getChatAdministrators + stored data)
    router.get('/user/groups/:chatId/members', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { bot } = require('../core/bot');
            const admins = await bot.getChatAdministrators(chatId);
            const members = admins.map(m => ({
                userId: String(m.user.id),
                firstName: m.user.first_name || '',
                lastName: m.user.last_name || '',
                username: m.user.username || '',
                isBot: !!m.user.is_bot,
                status: m.status, // creator, administrator
            }));
            const memberCount = await bot.getChatMemberCount(chatId).catch(() => null);
            res.json({ members, memberCount, adminCount: members.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Ban a member
    router.post('/user/groups/:chatId/moderation/ban', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            if (String(userId) === String(req.dashboardUser.userId)) return res.status(400).json({ error: 'Cannot ban yourself' });
            const { bot } = require('../core/bot');
            const me = await bot.getMe();
            if (String(userId) === String(me.id)) return res.status(400).json({ error: 'Cannot ban the bot' });
            await bot.banChatMember(chatId, userId);
            log.info(`Dashboard: User ${req.dashboardUser.userId} banned ${userId} in ${chatId}`);
            logGroupActivity(chatId, 'ban', `Banned user ${userId}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Kick a member (ban + unban)
    router.post('/user/groups/:chatId/moderation/kick', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            if (String(userId) === String(req.dashboardUser.userId)) return res.status(400).json({ error: 'Cannot kick yourself' });
            const { bot } = require('../core/bot');
            await bot.banChatMember(chatId, userId);
            await bot.unbanChatMember(chatId, userId, { only_if_banned: true });
            log.info(`Dashboard: User ${req.dashboardUser.userId} kicked ${userId} from ${chatId}`);
            logGroupActivity(chatId, 'kick', `Kicked user ${userId}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Mute a member
    router.post('/user/groups/:chatId/moderation/mute', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { userId, duration } = req.body; // duration in seconds, 0 = forever
            if (!userId) return res.status(400).json({ error: 'userId required' });
            if (String(userId) === String(req.dashboardUser.userId)) return res.status(400).json({ error: 'Cannot mute yourself' });
            const { bot } = require('../core/bot');
            const opts = { permissions: { can_send_messages: false } };
            if (duration && Number(duration) > 0) opts.until_date = Math.floor(Date.now() / 1000) + Number(duration);
            await bot.restrictChatMember(chatId, userId, opts);
            log.info(`Dashboard: User ${req.dashboardUser.userId} muted ${userId} in ${chatId} for ${duration || 'forever'}s`);
            logGroupActivity(chatId, 'mute', `Muted user ${userId}${duration ? ` for ${duration}s` : ' forever'}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Unmute a member
    router.post('/user/groups/:chatId/moderation/unmute', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            const { bot } = require('../core/bot');
            await bot.restrictChatMember(chatId, userId, {
                permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true },
            });
            log.info(`Dashboard: User ${req.dashboardUser.userId} unmuted ${userId} in ${chatId}`);
            logGroupActivity(chatId, 'unmute', `Unmuted user ${userId}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Warn a member
    router.post('/user/groups/:chatId/moderation/warn', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { userId, reason } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            // Store warning in DB
            const ts = Math.floor(Date.now() / 1000);
            await db.dbRun(
                `CREATE TABLE IF NOT EXISTS group_warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, chatId TEXT, userId TEXT, reason TEXT, warnedBy TEXT, createdAt INTEGER)`
            );
            await db.dbRun(
                `INSERT INTO group_warnings (chatId, userId, reason, warnedBy, createdAt) VALUES (?, ?, ?, ?, ?)`,
                [chatId, userId, reason || '', req.dashboardUser.userId, ts]
            );
            // Count total warnings
            const rows = await db.dbAll(
                `SELECT COUNT(*) as count FROM group_warnings WHERE chatId = ? AND userId = ?`,
                [chatId, userId]
            );
            const warnCount = rows?.[0]?.count || 1;
            log.info(`Dashboard: User ${req.dashboardUser.userId} warned ${userId} in ${chatId} (${warnCount} total)`);
            logGroupActivity(chatId, 'warn', `Warned user ${userId}: ${reason || 'no reason'} (${warnCount} total)`, req.dashboardUser.userId);
            // Auto-ban at 3 warnings
            if (warnCount >= 3) {
                try {
                    const { bot } = require('../core/bot');
                    await bot.banChatMember(chatId, userId);
                    logGroupActivity(chatId, 'auto_ban', `User ${userId} auto-banned after ${warnCount} warnings`, req.dashboardUser.userId);
                } catch { /* ignore ban failure */ }
            }
            res.json({ success: true, warnCount });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get warnings for a group (optionally filtered by userId)
    router.get('/user/groups/:chatId/moderation/warnings', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { userId } = req.query;
            await db.dbRun(
                `CREATE TABLE IF NOT EXISTS group_warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, chatId TEXT, userId TEXT, reason TEXT, warnedBy TEXT, createdAt INTEGER)`
            );
            let warnings;
            if (userId) {
                warnings = await db.dbAll(
                    `SELECT * FROM group_warnings WHERE chatId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 50`,
                    [chatId, userId]
                ) || [];
            } else {
                warnings = await db.dbAll(
                    `SELECT * FROM group_warnings WHERE chatId = ? ORDER BY createdAt DESC LIMIT 100`,
                    [chatId]
                ) || [];
            }
            res.json({ warnings });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update lock settings (links, files) and antiflood
    router.put('/user/groups/:chatId/moderation/locks', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { lockLinks, lockFiles, antifloodLimit } = req.body;
            const updates = {};
            if (lockLinks !== undefined) updates.lockLinks = !!lockLinks;
            if (lockFiles !== undefined) updates.lockFiles = !!lockFiles;
            if (antifloodLimit !== undefined) updates.antifloodLimit = Math.max(0, Math.min(50, Number(antifloodLimit) || 0));
            if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No settings provided' });
            await db.updateGroupBotSettings?.(chatId, updates);
            log.info(`Dashboard: User ${req.dashboardUser.userId} updated moderation locks for ${chatId}: ${JSON.stringify(updates)}`);
            logGroupActivity(chatId, 'locks_update', `Moderation settings: ${JSON.stringify(updates)}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // USER GROUP: PRICE ALERTS
    // ==================

    // List price alert tokens for a group
    router.get('/user/groups/:chatId/price-alerts', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const tokens = await db.listPriceAlertTokens(chatId);
            const target = await db.getPriceAlertTarget(chatId);
            // Enrich with title/media counts
            const enriched = await Promise.all(tokens.map(async t => {
                const [titleCount, mediaCount] = await Promise.all([
                    db.countPriceAlertTitles(t.id, chatId).catch(() => 0),
                    db.countPriceAlertMedia(t.id, chatId).catch(() => 0),
                ]);
                return { ...t, titleCount, mediaCount };
            }));
            res.json({ tokens: enriched, target });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Add a new price alert token
    router.post('/user/groups/:chatId/price-alerts', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { tokenAddress, tokenLabel, chainIndex, chainShortName, intervalSeconds } = req.body;
            if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress required' });
            // Check limit (max 3 tokens per group)
            const existing = await db.listPriceAlertTokens(chatId);
            if (existing.length >= 3) return res.status(400).json({ error: 'Maximum 3 tokens per group' });
            const token = await db.upsertPriceAlertToken(chatId, {
                tokenAddress, tokenLabel, chainIndex: chainIndex || 196, chainShortName: chainShortName || 'xlayer', intervalSeconds: intervalSeconds || 3600,
            });
            log.info(`Dashboard: User ${req.dashboardUser.userId} added price alert token ${tokenAddress} in ${chatId}`);
            logGroupActivity(chatId, 'price_alert_add', `Added token ${tokenLabel || tokenAddress}`, req.dashboardUser.userId);
            res.json({ success: true, token });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Set price alert target topic — MUST be before /:tokenId routes
    router.put('/user/groups/:chatId/price-alerts/target', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { topicId } = req.body;
            const target = await db.setPriceAlertTarget(chatId, topicId !== undefined ? topicId : null);
            log.info(`Dashboard: User ${req.dashboardUser.userId} set price alert target in ${chatId} to topic ${topicId}`);
            res.json({ success: true, target });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete a custom title — MUST be before /:tokenId routes (has /titles/ static segment)
    router.delete('/user/groups/:chatId/price-alerts/titles/:titleId', userGroupGuard, async (req, res) => {
        try {
            const deleted = await db.deletePriceAlertTitle(req.params.titleId);
            if (!deleted) return res.status(404).json({ error: 'Title not found' });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update a price alert token
    router.put('/user/groups/:chatId/price-alerts/:tokenId', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const tokenId = req.params.tokenId;
            const patch = req.body;
            const token = await db.updatePriceAlertToken(chatId, tokenId, patch);
            if (!token) return res.status(404).json({ error: 'Token not found' });
            log.info(`Dashboard: User ${req.dashboardUser.userId} updated price alert token ${tokenId} in ${chatId}`);
            logGroupActivity(chatId, 'price_alert_update', `Updated token #${tokenId}`, req.dashboardUser.userId);
            res.json({ success: true, token });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete a price alert token
    router.delete('/user/groups/:chatId/price-alerts/:tokenId', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const tokenId = req.params.tokenId;
            const deleted = await db.deletePriceAlertToken(chatId, tokenId);
            if (!deleted) return res.status(404).json({ error: 'Token not found' });
            // Also clean up associated media and titles
            await db.deleteAllPriceAlertMedia(tokenId, chatId).catch(() => {});
            await db.deleteAllPriceAlertTitles(tokenId, chatId).catch(() => {});
            log.info(`Dashboard: User ${req.dashboardUser.userId} deleted price alert token ${tokenId} in ${chatId}`);
            logGroupActivity(chatId, 'price_alert_delete', `Deleted token #${tokenId}`, req.dashboardUser.userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // List custom titles for a token
    router.get('/user/groups/:chatId/price-alerts/:tokenId/titles', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const titles = await db.listPriceAlertTitles(req.params.tokenId, chatId);
            res.json({ titles });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Add a custom title
    router.post('/user/groups/:chatId/price-alerts/:tokenId/titles', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const { title } = req.body;
            if (!title?.trim()) return res.status(400).json({ error: 'title required' });
            const count = await db.countPriceAlertTitles(req.params.tokenId, chatId);
            if (count >= 44) return res.status(400).json({ error: 'Maximum 44 titles' });
            const result = await db.addPriceAlertTitle(req.params.tokenId, chatId, title.trim());
            res.json({ success: true, title: result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Trigger immediate price alert send
    router.post('/user/groups/:chatId/price-alerts/:tokenId/send-now', userGroupGuard, async (req, res) => {
        try {
            const chatId = req.groupChatId;
            const tokenId = req.params.tokenId;
            const token = await db.getPriceAlertToken(chatId, tokenId);
            if (!token) return res.status(404).json({ error: 'Token not found' });
            // Set nextRunAt to now so the scheduler picks it up immediately
            await db.updatePriceAlertToken(chatId, tokenId, { nextRunAt: Date.now() - 1000 });
            log.info(`Dashboard: User ${req.dashboardUser.userId} triggered send-now for token ${tokenId} in ${chatId}`);
            logGroupActivity(chatId, 'price_alert_send', `Triggered immediate alert for token #${tokenId}`, req.dashboardUser.userId);
            res.json({ success: true, message: 'Alert will be sent shortly' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================
    // OWNER: BROADCAST TO ALL USERS (DM)
    // ==================
    router.post('/owner/broadcast-users', ownerGuard, async (req, res) => {
        try {
            const { text } = req.body;
            if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

            const { bot } = require('../core/bot');
            const users = await db.listUsersDetailed?.() || [];
            let success = 0, failed = 0;

            for (const [idx, u] of users.entries()) {
                const userId = u.chatId || u.userId;
                if (!userId) continue;
                try {
                    await bot.sendMessage(userId, sanitizeTelegramHtml(text.trim()), { parse_mode: 'HTML' });
                    success++;
                } catch {
                    failed++;
                }
                // Rate limit: 500ms between messages
                if (idx < users.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            log.info(`Dashboard: Broadcast to users sent to ${success}/${users.length} users by ${req.dashboardUser.userId}`);
            res.json({ success: true, sent: success, failed, total: users.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createDashboardRoutes };
