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

    // Dev/Quick login: accept mock auth unless explicitly disabled
    // Set DASHBOARD_DISABLE_DEV_LOGIN=true in .env to disable on production VPS
    if (data.hash === 'dev_mode') {
        if (process.env.DASHBOARD_DISABLE_DEV_LOGIN === 'true') {
            return false;
        }
        log.info('Dashboard: Dev mode login accepted');
        return true;
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
// Determine user role
// ============================
async function getUserRole(userId) {
    const uid = String(userId);
    if (OWNER_IDS.includes(uid)) return 'owner';
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
    router.get('/bot-info', (req, res) => {
        const botUsername = (process.env.BOT_USERNAME || '').replace(/^@+/, '');
        res.json({
            botUsername: botUsername || null,
            dashboardUrl: `${req.protocol}://${req.get('host')}/dashboard/`,
        });
    });

    // --- Auth: One-time token auto-login (from /dashboard bot command) ---
    router.get('/auth/auto-login', async (req, res) => {
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

            const role = await getUserRole(tokenData.userId);
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

            const role = await getUserRole(data.id);
            const token = createJWT({
                userId: String(data.id),
                username: data.username,
                firstName: data.first_name,
                role,
            });

            log.info(`Dashboard login: ${data.first_name} (${data.id}) as ${role}`);

            res.json({
                token,
                role,
                user: {
                    id: data.id,
                    first_name: data.first_name,
                    last_name: data.last_name,
                    username: data.username,
                    photo_url: data.photo_url,
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

    // ==================
    // PROTECTED ROUTES
    // ==================
    router.use(authMiddleware);

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
