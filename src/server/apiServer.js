const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../core/logger');
const log = logger.child('API');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db.js');
const { normalizeAddressSafe } = require('../utils/helpers');
const { OKX_BASE_URL, API_PORT } = require('../config/env');
const { createDashboardRoutes } = require('./dashboardRoutes');
const {
    enqueueJob,
    registerJobHandler,
    startJobWorkers,
    queueInfo,
    isRedisBacked,
    hasHandlers
} = require('../core/jobQueue');

const app = express();
const startedAt = new Date();
const RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 120);
const REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 10_000);
const MAX_PENDING_REQUESTS = Number(process.env.API_MAX_PENDING_REQUESTS || 300);
const BODY_LIMIT = process.env.API_BODY_LIMIT || '64kb';
const USE_ASYNC_TOKEN_JOB = String(process.env.API_GENERATE_TOKEN_ASYNC || '').toLowerCase() === 'true';
const METRICS_ENABLED = String(process.env.API_METRICS_ENABLED || 'true').toLowerCase() !== 'false';

// Simple in-memory rate limiter to shed bursts quickly without extra deps
const requestBuckets = new Map();
let inFlight = 0;
let totalRequests = 0;
let activeRequests = 0;
let rateLimitHits = 0;
let busyRejects = 0;
let timeoutHits = 0;
let serverErrors = 0;
const statusCounts = new Map();

registerJobHandler('generate-token', async ({ walletAddress, token }) => {
    if (!walletAddress || !token) {
        throw new Error('walletAddress and token are required');
    }
    await db.addPendingToken(token, walletAddress);
    log.child('Queue').info(`Stored token for wallet: ${walletAddress}`);
});

startJobWorkers();

const isControlPath = (req) =>
    req.path === '/health' || req.path === '/healthz' || req.path === '/metrics';

function metricsMiddleware(req, res, next) {
    totalRequests += 1;
    activeRequests += 1;
    const started = process.hrtime.bigint();
    let finished = false;

    const finalize = () => {
        if (finished) {
            return;
        }
        finished = true;
        activeRequests = Math.max(0, activeRequests - 1);
        const status = res.statusCode || 0;
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        if (status >= 500) {
            serverErrors += 1;
        }
        // Drop duration detail on the floor; we only use it to ensure finalize fires
        const _ = started;
    };

    res.once('finish', finalize);
    res.once('close', finalize);
    next();
}

function requestTimeoutGuard(req, res, next) {
    const timer = setTimeout(() => {
        if (!res.headersSent) {
            timeoutHits += 1;
            res.status(503).json({ error: 'Request timeout' });
        }
        req.destroy?.();
    }, REQUEST_TIMEOUT_MS);

    const clear = () => clearTimeout(timer);
    res.once('finish', clear);
    res.once('close', clear);
    next();
}

function backpressureGuard(req, res, next) {
    if (isControlPath(req)) {
        return next();
    }

    if (inFlight >= MAX_PENDING_REQUESTS) {
        busyRejects += 1;
        return res.status(503).json({ error: 'Server busy, please retry later' });
    }

    inFlight += 1;
    const release = () => {
        inFlight = Math.max(0, inFlight - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
}

function rateLimit(req, res, next) {
    if (isControlPath(req)) {
        return next();
    }

    if (RATE_LIMIT_MAX < 1) {
        return next();
    }

    const now = Date.now();
    const ip = (req.ip || req.connection?.remoteAddress || 'unknown').toString();
    let bucket = requestBuckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    }

    bucket.count += 1;
    requestBuckets.set(ip, bucket);

    if (bucket.count > RATE_LIMIT_MAX) {
        rateLimitHits += 1;
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({ error: 'Too many requests' });
    }

    // Opportunistic cleanup to prevent unbounded memory
    if (requestBuckets.size > 5000 && Math.random() < 0.02) {
        const cutoff = Date.now();
        for (const [key, value] of requestBuckets.entries()) {
            if (value.resetAt <= cutoff) {
                requestBuckets.delete(key);
            }
        }
    }

    next();
}

const escapeLabelValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const metricLine = (name, value, labels = null) => {
    const numeric = Number.isFinite(value) ? value : 0;
    if (!labels || !Object.keys(labels).length) {
        return `${name} ${numeric}`;
    }
    const labelText = Object.entries(labels)
        .map(([key, val]) => `${key}="${escapeLabelValue(val)}"`)
        .join(',');
    return `${name}{${labelText}} ${numeric}`;
};

function startApiServer() {
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.disable('etag');

    app.use(cors());
    app.use(metricsMiddleware);
    app.use(express.json({ limit: BODY_LIMIT }));
    app.use(requestTimeoutGuard);
    app.use(backpressureGuard);
    app.use(rateLimit);

    app.get(['/health', '/healthz'], async (req, res) => {
        const now = Date.now();
        const mem = process.memoryUsage();

        // DB connectivity check
        let dbStatus = 'unknown';
        try {
            await db.getUserLanguage('__health_check__');
            dbStatus = 'ok';
        } catch {
            dbStatus = 'error';
        }

        // Event loop lag estimate
        const lagStart = process.hrtime.bigint();
        await new Promise(resolve => setImmediate(resolve));
        const lagNs = Number(process.hrtime.bigint() - lagStart);
        const lagMs = Math.round(lagNs / 1e6);

        res.json({
            status: dbStatus === 'ok' ? 'ok' : 'degraded',
            uptimeSeconds: Math.round(process.uptime()),
            startedAt: startedAt.toISOString(),
            now: new Date(now).toISOString(),
            version: process.env.npm_package_version || 'unknown',
            node: process.version,
            memory: {
                rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB'
            },
            eventLoopLagMs: lagMs,
            db: dbStatus,
            inFlight,
            rateLimitMax: RATE_LIMIT_MAX,
            rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
            requestBuckets: requestBuckets.size,
            queue: queueInfo()
        });
    });


    app.get('/metrics', async (req, res) => {
        if (!METRICS_ENABLED) {
            res.status(404).end();
            return;
        }

        const qInfo = queueInfo();
        const lines = [];

        lines.push('# HELP api_start_time_seconds Unix time when the API started');
        lines.push('# TYPE api_start_time_seconds gauge');
        lines.push(metricLine('api_start_time_seconds', Math.floor(startedAt.getTime() / 1000)));

        lines.push('# HELP api_requests_total Total HTTP requests received');
        lines.push('# TYPE api_requests_total counter');
        lines.push(metricLine('api_requests_total', totalRequests));

        lines.push('# HELP api_requests_in_flight Current in-flight requests (backpressure scope)');
        lines.push('# TYPE api_requests_in_flight gauge');
        lines.push(metricLine('api_requests_in_flight', inFlight));

        lines.push('# HELP api_requests_active Current requests being processed (metrics scope)');
        lines.push('# TYPE api_requests_active gauge');
        lines.push(metricLine('api_requests_active', activeRequests));

        lines.push('# HELP api_responses_total HTTP responses by status code');
        lines.push('# TYPE api_responses_total counter');
        for (const [status, count] of statusCounts.entries()) {
            lines.push(metricLine('api_responses_total', count, { status }));
        }

        lines.push('# HELP api_requests_rate_limited_total Requests rejected by rate limit');
        lines.push('# TYPE api_requests_rate_limited_total counter');
        lines.push(metricLine('api_requests_rate_limited_total', rateLimitHits));

        lines.push('# HELP api_requests_busy_rejected_total Requests rejected due to backpressure limit');
        lines.push('# TYPE api_requests_busy_rejected_total counter');
        lines.push(metricLine('api_requests_busy_rejected_total', busyRejects));

        lines.push('# HELP api_requests_timeout_total Requests that hit timeout guard');
        lines.push('# TYPE api_requests_timeout_total counter');
        lines.push(metricLine('api_requests_timeout_total', timeoutHits));

        lines.push('# HELP api_responses_5xx_total Server error responses (5xx)');
        lines.push('# TYPE api_responses_5xx_total counter');
        lines.push(metricLine('api_responses_5xx_total', serverErrors));

        lines.push('# HELP api_request_buckets_total Active IP rate limit buckets');
        lines.push('# TYPE api_request_buckets_total gauge');
        lines.push(metricLine('api_request_buckets_total', requestBuckets.size));

        lines.push('# HELP api_queue_mode Queue backing store mode (1 for active mode)');
        lines.push('# TYPE api_queue_mode gauge');
        lines.push(metricLine('api_queue_mode', 1, { mode: qInfo.mode }));

        if (Array.isArray(qInfo.handlers)) {
            lines.push('# HELP api_queue_handler Registered job handlers (1 per handler)');
            lines.push('# TYPE api_queue_handler gauge');
            for (const handlerName of qInfo.handlers) {
                lines.push(metricLine('api_queue_handler', 1, { handler: handlerName }));
            }
        }

        lines.push('# HELP process_uptime_seconds Process uptime in seconds');
        lines.push('# TYPE process_uptime_seconds gauge');
        lines.push(metricLine('process_uptime_seconds', process.uptime()));

        const mem = process.memoryUsage();
        lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes');
        lines.push('# TYPE process_resident_memory_bytes gauge');
        lines.push(metricLine('process_resident_memory_bytes', mem.rss));

        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(lines.join('\n'));
    });

    app.get('/webview/portfolio/:wallet', (req, res) => {
        const normalized = normalizeAddressSafe(req.params.wallet);
        if (!normalized) {
            res.status(400).send('Invalid wallet');
            return;
        }

        const portfolioUrl = `${OKX_BASE_URL.replace(/\/$/, '')}/portfolio/${normalized}`;
        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Xlayer Portfolio Preview</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b1021; color: #e5e8f0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    header { padding: 12px 16px; background: #0f162d; border-bottom: 1px solid #1f2a44; display: flex; align-items: center; gap: 12px; }
    header .title { font-weight: 700; font-size: 14px; letter-spacing: 0.4px; text-transform: uppercase; color: #8ab4ff; }
    header .addr { font-weight: 600; color: #e5e8f0; font-size: 13px; }
    iframe { width: 100%; height: calc(100% - 54px); border: none; background: #0b1021; }
    .fallback { padding: 16px; text-align: center; }
    .fallback a { color: #8ab4ff; }
  </style>
</head>
<body>
  <header>
    <div class="title">Xlayer - BOT</div>
    <div class="addr">${normalized}</div>
  </header>
  <iframe src="${portfolioUrl}" title="OKX Portfolio"></iframe>
  <noscript>
    <div class="fallback">JavaScript is required. <a href="${portfolioUrl}" target="_blank" rel="noopener noreferrer">Open in browser</a>.</div>
  </noscript>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    });

    app.post('/api/generate-token', async (req, res) => {
        try {
            const { walletAddress } = req.body;
            if (!walletAddress) return res.status(400).json({ error: 'walletAddress la bat buoc' });
            const token = uuidv4();
            const shouldQueue = USE_ASYNC_TOKEN_JOB && hasHandlers();

            if (shouldQueue) {
                await enqueueJob('generate-token', { walletAddress, token });
                log.info(`Queued token generation for wallet: ${walletAddress}`);
                res.json({
                    token,
                    queued: true,
                    queueMode: isRedisBacked() ? 'redis' : 'memory'
                });
                return;
            }

            await db.addPendingToken(token, walletAddress);
            log.info(`Da tao token cho vi: ${walletAddress}`);
            res.json({ token, queued: false });
        } catch (error) {
            log.error('Loi generate-token:', error.message);
            res.status(500).json({ error: 'Dia chi vi khong hop le' });
        }
    });

    app.get('/api/check-status', async (req, res) => {
        try {
            const { walletAddress } = req.query;
            if (!walletAddress) return res.status(400).json({ error: 'walletAddress la bat buoc' });
            const users = await db.getUsersForWallet(walletAddress);
            res.json({ isConnected: users.length > 0, count: users.length });
        } catch (error) {
            res.status(500).json({ error: 'Dia chi vi khong hop le' });
        }
    });

    // === Dashboard Routes ===
    app.use('/api/dashboard', createDashboardRoutes());
    log.child('Dashboard').info('Dashboard API routes mounted at /api/dashboard');

    // === Serve Dashboard Static Files ===
    const dashboardDist = path.join(__dirname, '../../dashboard/dist');
    if (fs.existsSync(dashboardDist)) {
        app.use('/dashboard', express.static(dashboardDist));
        // SPA fallback: serve index.html for any unmatched dashboard routes
        app.get('/dashboard/*', (req, res) => {
            res.sendFile(path.join(dashboardDist, 'index.html'));
        });
        log.child('Dashboard').info(`Serving dashboard from ${dashboardDist}`);
    } else {
        log.child('Dashboard').info('Dashboard dist not found — run "npm run build" in dashboard/ to enable');
    }

    if (app.locals.apiServerStarted) {
        return;
    }
    app.locals.apiServerStarted = true;
    const tryListen = (port, attemptsLeft = 5) => {
        const server = app.listen(port, '0.0.0.0', () => {
            log.child('APIServer').info(`Dang chay tai http://0.0.0.0:${port}`);
        });
        server.on('error', (err) => {
            if (err?.code === 'EADDRINUSE' && attemptsLeft > 0) {
                const nextPort = port + 1;
                log.child('APIServer').error(`Port ${port} dang bi chiem. Thu port ${nextPort}...`);
                tryListen(nextPort, attemptsLeft - 1);
            } else if (err?.code === 'EADDRINUSE') {
                log.child('APIServer').error(`Khong the mo port (thu ${port}) sau nhieu lan thu. Dat env API_PORT de chon port khac.`);
            } else {
                log.child('APIServer').error('Loi khi khoi dong:', err);
            }
        });
    };

    tryListen(API_PORT);
}

module.exports = {
    app,
    startApiServer
};
