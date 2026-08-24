/**
 * Web Chat AI routes. All model discovery and inference use one private 9Router connection.
 * Upstream names returned by 9Router are display metadata, never direct providers.
 */
const { Router } = require('express');
const crypto = require('crypto');
const logger = require('../core/logger');
const log = logger.child('WebChat');
const { NINEROUTER_MODEL } = require('../config/env');
const { ONCHAIN_TOOLS, executeToolCall, buildSystemInstruction } = require('../features/ai/ai-onchain');
const { WEB_TOOL_DECLARATIONS, executeWebToolCall } = require('./webToolExecutor');
const { buildAIAPrompt } = require('../config/prompts');
const db = require('../../db.js');
const { dbRun, dbGet, dbAll } = require('../../db/core');
const { createChatOrchestrator, parseCostOptions } = require('../services/chatOrchestrator');
const { createToolPolicy } = require('../services/chatOrchestrator/policy');
const { createXBotAgentClient } = require('../services/xbot-agent/client');
const { createNineRouterConnection } = require('../services/nineRouterConnection');
const { beginChatRequest, recordChatOutcome } = require('../services/chatOrchestrator/telemetry');
const { recordChatAudit } = require('../services/chatOrchestrator/audit');
const {
    createTenantHeaders,
    getConfig: getNineRouterTenantConfig,
    normalizeTenantId
} = require('../services/nineRouterTenantClient');

const SESSION_TTL = 30 * 60 * 1000;
const SESSION_MAX_MESSAGES = 40;
const MAX_TOOL_ROUNDS = 8;
const chatSessionsCache = new Map();
const chatRateBuckets = new Map();
const CHAT_RATE_LIMIT = 15;
const CHAT_RATE_WINDOW = 60_000;

const CHAT_V2_READ_ONLY_TOOLS = new Set([
    'ai_portfolio_report', 'analyze_sentiment', 'analyze_token', 'aw_balance', 'aw_history',
    'backtest_strategy', 'browse_marketplace', 'calculate_profit_roi', 'check_airdrop_eligibility',
    'check_approval_safety', 'check_favorite_prices', 'check_multi_wallet_balances', 'check_scam',
    'check_token_vesting', 'check_wallet_balance_direct', 'compare_cex_dex_price', 'compare_tokens',
    'deep_research_token', 'defi_detail', 'defi_position_detail', 'defi_positions', 'defi_search',
    'detect_narratives', 'estimate_gas_limit', 'filter_wallets_by_tag', 'generate_tax_report',
    'get_address_tracker', 'get_gas_price', 'get_historical_candles', 'get_historical_index_price',
    'get_holder_cluster', 'get_hot_tokens', 'get_index_price', 'get_liquidity', 'get_market_candles',
    'get_meme_detail', 'get_meme_dev_info', 'get_meme_list', 'get_optimal_gas', 'get_order_status',
    'get_portfolio_dex_history', 'get_portfolio_overview', 'get_portfolio_pnl', 'get_recent_trades',
    'get_signal_chains', 'get_signal_list', 'get_similar_memes', 'get_smart_trades',
    'get_specific_token_balances', 'get_swap_history', 'get_swap_quote', 'get_token_audit',
    'get_token_holders', 'get_token_info', 'get_token_liquidity_pools', 'get_token_market_detail',
    'get_token_price', 'get_token_security', 'get_top_tokens', 'get_top_traders',
    'get_trader_leaderboard', 'get_trading_wallet_balance', 'get_tx_detail', 'get_tx_history',
    'get_wallet_balance', 'get_wallet_pnl', 'get_weather', 'list_favorite_pairs', 'list_price_alerts',
    'list_trading_wallets', 'lookup_contract', 'lookup_transaction', 'scan_arbitrage',
    'scan_wallet_security', 'search_token', 'simulate_batch_swap', 'simulate_transaction',
    'treasury_status'
]);

function configuredModels() {
    return (NINEROUTER_MODEL || '')
        .split(',').map(value => value.trim()).filter(Boolean);
}

function preferredDiscoveredModel(models) {
    const ids = (models || []).map(model => model?.id).filter(Boolean);
    return ids.includes(NINEROUTER_MODEL) ? NINEROUTER_MODEL : ids[0];
}

function createChatV2ToolPolicy(toolDeclarations) {
    const tools = Object.fromEntries(toolDeclarations.map(tool => [
        tool?.function?.name,
        { risk: CHAT_V2_READ_ONLY_TOOLS.has(tool?.function?.name) ? 'low' : 'high' }
    ]).filter(([name]) => Boolean(name)));
    return createToolPolicy({ tools });
}

function getToolDeclarations() {
    const declarations = [...WEB_TOOL_DECLARATIONS];
    for (const group of ONCHAIN_TOOLS) declarations.push(...(group?.functionDeclarations || []));
    const seen = new Set();
    return [{ functionDeclarations: declarations.filter(item => {
        if (!item?.name || seen.has(item.name)) return false;
        seen.add(item.name);
        return true;
    }) }];
}

function convertToolsToOpenAI(groups) {
    return (groups || []).flatMap(group => (group.functionDeclarations || []).map(declaration => ({
        type: 'function',
        function: {
            name: declaration.name,
            description: declaration.description || '',
            parameters: declaration.parameters || { type: 'object', properties: {} }
        }
    })));
}

function htmlToMarkdown(html) {
    if (!html) return '';
    return String(html)
        .replace(/<b>(.*?)<\/b>/gi, '**$1**')
        .replace(/<i>(.*?)<\/i>/gi, '*$1*')
        .replace(/<code>(.*?)<\/code>/gi, '`$1`')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '');
}

const chatOrchestratorsV2 = new Map();
function getTenantApiRoot() {
    return `${getNineRouterTenantConfig().baseUrl}/v1`;
}

function getChatOrchestratorV2(allowedModels = configuredModels()) {
    const modelKey = [...new Set(allowedModels.map(String).filter(Boolean))].sort().join('\n');
    if (chatOrchestratorsV2.has(modelKey)) return chatOrchestratorsV2.get(modelKey);
    let xbotAgentClient;
    if (process.env.XBOT_AGENT_ENABLED === 'true') {
        xbotAgentClient = createXBotAgentClient({
            baseUrl: process.env.XBOT_AGENT_INTERNAL_URL,
            serviceToken: process.env.XBOT_AGENT_SERVICE_TOKEN,
            contextSecret: process.env.XBOT_AGENT_CONTEXT_SECRET,
            timeoutMs: Number(process.env.XBOT_AGENT_TIMEOUT_MS || 60000)
        });
    }
    const tools = convertToolsToOpenAI(getToolDeclarations());
    const orchestrator = createChatOrchestrator({
        baseUrl: getTenantApiRoot(),
        buildHeaders: (identity, request) => createTenantHeaders({
            tenantId: normalizeTenantId(identity.userId),
            method: request.method,
            path: request.path,
            body: request.body
        }),
        allowedModels: [...new Set(allowedModels.map(String).filter(Boolean))],
        timeoutMs: 60000,
        maxConcurrentPerTenant: 2,
        rateLimitPerMinute: 15,
        maxInputTokens: 25000,
        maxOutputTokens: 8192,
        ...parseCostOptions(),
        circuitFailureThreshold: 5,
        circuitResetMs: 30000,
        tools,
        toolPolicy: createChatV2ToolPolicy(tools),
        maxToolRounds: MAX_TOOL_ROUNDS,
        executeTool: async envelope => {
            const context = {
                userId: envelope.userId,
                chatId: envelope.userId,
                lang: 'en',
                isGroup: false,
                isAdmin: false,
                isWeb: true,
                isTelegramContext: false
            };
            const call = { name: envelope.toolName, args: envelope.args };
            let result = await executeWebToolCall(call, context);
            if (result === undefined) result = await executeToolCall(call, context);
            if (result === undefined) return { error: `Tool ${envelope.toolName} is not available.` };
            if (result?.displayMessage) result.displayMessage = htmlToMarkdown(result.displayMessage);
            return result;
        },
        hermesEnabled: process.env.XBOT_AGENT_ENABLED === 'true',
        hermesClient: xbotAgentClient
    });
    chatOrchestratorsV2.set(modelKey, orchestrator);
    return orchestrator;
}

function createDiscoveryConnection() {
    return createNineRouterConnection({
        baseUrl: getTenantApiRoot(),
        buildHeaders: (identity, request) => createTenantHeaders({
            tenantId: normalizeTenantId(identity.userId),
            method: request.method,
            path: `/v1${request.path}`,
            body: request.body
        }),
        allowedModels: configuredModels(),
        allowDynamicModels: true,
        timeoutMs: 5000
    });
}

function chatRateLimit(userId) {
    const now = Date.now();
    let bucket = chatRateBuckets.get(userId);
    if (!bucket || now > bucket.resetAt) bucket = { count: 0, resetAt: now + CHAT_RATE_WINDOW };
    bucket.count += 1;
    chatRateBuckets.set(userId, bucket);
    return bucket.count <= CHAT_RATE_LIMIT;
}

async function getSession(sessionId, userId) {
    const cached = chatSessionsCache.get(sessionId);
    if (cached?.userId === userId) return cached;
    try {
        const row = await dbGet('SELECT * FROM web_chat_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
        if (!row) return null;
        const session = {
            id: row.id,
            userId: row.userId,
            title: row.title,
            messages: JSON.parse(row.messages || '[]'),
            isPinned: Boolean(row.isPinned),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt || Date.now()
        };
        chatSessionsCache.set(sessionId, session);
        return session;
    } catch (error) {
        log.warn(`DB load session failed: ${error.message}`);
        return null;
    }
}

async function saveSession(session) {
    chatSessionsCache.set(session.id, session);
    await dbRun(
        `INSERT OR REPLACE INTO web_chat_sessions (id, userId, title, messages, createdAt, updatedAt, isPinned)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [session.id, session.userId, session.title, JSON.stringify(session.messages), session.createdAt, session.updatedAt, session.isPinned ? 1 : 0]
    );
}

async function listUserSessions(userId, limit = 20) {
    return dbAll(
        'SELECT id, title, updatedAt, isPinned, createdAt FROM web_chat_sessions WHERE userId = ? ORDER BY isPinned DESC, updatedAt DESC LIMIT ?',
        [userId, limit]
    );
}

async function buildWebSystemPrompt(req, userId, persona, customPersonaText) {
    const systemInstruction = await buildSystemInstruction(userId);
    let preferences = '';
    try { preferences = db.formatPreferencesForPrompt(await db.getUserPreferences(userId)); } catch {}
    const customPersona = persona === 'custom'
        ? String(customPersonaText || '').slice(0, 500).replace(/[<>]/g, '')
        : '';
    const personaSection = customPersona ? `\n\nPERSONALITY: ${customPersona}` : '';
    const aiaPrompt = buildAIAPrompt({
        lang: req.dashboardUser?.lang || 'en',
        isGroup: false,
        isAdmin: false,
        botUsername: process.env.BOT_USERNAME || 'xbot',
        userId,
        personaSection
    });
    return `${systemInstruction}\n\n${aiaPrompt}\n\nRespond for the web dashboard using Markdown. Never truncate blockchain addresses or transaction hashes.${preferences}`;
}

function statusForError(error) {
    if (error?.status && Number.isInteger(error.status)) return error.status;
    if (error?.code === 'CLIENT_ABORTED') return 499;
    if (error?.code === 'MODEL_NOT_ALLOWED') return 400;
    if (error?.code === 'RATE_LIMITED') return 429;
    return 503;
}

function createChatRoutes() {
    const router = Router();

    router.post('/chat', (_req, res) => res.status(405).json({ error: 'Use the streaming Chat AI endpoint' }));

    router.get('/models', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const controller = new AbortController();
        res.on('close', () => controller.abort());
        try {
            const tenantId = normalizeTenantId(userId);
            const discovery = await createDiscoveryConnection().discover({
                tenantId,
                userId: tenantId
            }, { signal: controller.signal });
            const defaultModel = preferredDiscoveredModel(discovery.models);
            return res.json({
                provider: discovery.provider,
                configured: true,
                upstreams: discovery.upstreams,
                models: discovery.models.map(model => ({
                    ...model,
                    icon: '🧭',
                    locked: false,
                    isDefault: model.id === defaultModel
                })),
                defaultModel,
                defaultProvider: '9router'
            });
        } catch (error) {
            if (error?.code !== 'CLIENT_ABORTED') log.warn(`[Discovery] ${error?.code || 'FAILED'}`);
            if (res.headersSent || res.writableEnded) return;
            return res.status(statusForError(error)).json({ error: '9Router model discovery unavailable', code: error?.code || 'DISCOVERY_FAILED' });
        }
    });

    router.post('/chat/stream', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { message, conversationId, model, provider, persona, customPersonaText, image } = req.body || {};
        if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
        if (message.length > 10000) return res.status(400).json({ error: 'Message too long' });
        if (image) return res.status(400).json({ error: 'Image input is not enabled for this 9Router connection' });
        if (provider && String(provider).toLowerCase() !== '9router') return res.status(400).json({ error: 'Only 9Router is supported' });
        if (conversationId && !conversationId.startsWith(`web_${userId}_`)) return res.status(400).json({ error: 'Invalid conversation ID' });
        if (!chatRateLimit(userId)) return res.status(429).json({ error: 'Rate limited' });

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        const sendEvent = (event, data) => {
            if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        const abortController = new AbortController();
        let aborted = false;
        let auditContext = null;
        const endTelemetry = beginChatRequest();
        res.on('close', () => { aborted = true; abortController.abort(); });

        try {
            const tenantId = normalizeTenantId(userId);
            const discovery = await createDiscoveryConnection().discover(
                { tenantId, userId: tenantId },
                { signal: abortController.signal }
            );
            const availableModelIds = discovery.models.map(item => item.id);
            const chosenModel = String(model || preferredDiscoveredModel(discovery.models) || '').trim();
            if (!chosenModel || !availableModelIds.includes(chosenModel)) {
                throw Object.assign(new Error('Model is not available for this account'), { code: 'MODEL_NOT_ALLOWED' });
            }
            const sessionId = conversationId || `web_${userId}_${Date.now()}`;
            let session = await getSession(sessionId, userId);
            if (!session) {
                session = {
                    id: sessionId,
                    userId,
                    title: message.trim().substring(0, 60),
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    isPinned: false
                };
            }
            const messages = [{ role: 'system', content: await buildWebSystemPrompt(req, userId, persona, customPersonaText) }];
            messages.push(...session.messages.map(item => ({ role: item.role, content: item.content || '' })));
            messages.push({ role: 'user', content: message.trim() });

            const requestId = crypto.createHash('sha256')
                .update(`${sessionId}:${session.messages.length}:${message.trim()}`)
                .digest('hex');
            auditContext = { tenantId, userId, requestId };
            recordChatAudit({
                tenantId, userId, requestId,
                action: 'request_started', engine: 'unknown', outcome: 'started', code: 'OK'
            });

            const result = await getChatOrchestratorV2(availableModelIds).streamChat({
                tenantId,
                userId,
                model: chosenModel,
                messages,
                requestId
            }, {
                signal: abortController.signal,
                onEvent: event => {
                    if (event.type === 'tool-start') {
                        recordChatAudit({
                            tenantId, userId, requestId,
                            action: 'tool_started', engine: 'unknown', tool: event.data?.name,
                            outcome: 'started', code: 'OK'
                        });
                    } else if (event.type === 'tool-result') {
                        recordChatAudit({
                            tenantId, userId, requestId,
                            action: 'tool_completed', engine: 'unknown', tool: event.data?.name,
                            outcome: 'completed', code: 'OK'
                        });
                    }
                    if (event.type !== 'done') sendEvent(event.type, event.data);
                }
            });

            recordChatAudit({
                tenantId, userId, requestId,
                action: 'routing_decision', engine: result.engine,
                outcome: result.completed ? 'completed' : 'cancelled', code: result.completed ? 'OK' : 'INCOMPLETE'
            });
            if (!result.completed || aborted) {
                recordChatOutcome({ engine: result.engine, outcome: 'cancelled', code: aborted ? 'CLIENT_ABORTED' : 'INCOMPLETE' });
                recordChatAudit({
                    tenantId, userId, requestId,
                    action: 'request_cancelled', engine: result.engine,
                    outcome: 'cancelled', code: aborted ? 'CLIENT_ABORTED' : 'INCOMPLETE'
                });
                return res.end();
            }
            session.messages = messages
                .filter(item => item.role === 'user' || item.role === 'assistant')
                .concat(result.text ? [{ role: 'assistant', content: result.text }] : [])
                .slice(-SESSION_MAX_MESSAGES);
            session.updatedAt = Date.now();
            await saveSession(session);
            recordChatOutcome({ engine: result.engine, outcome: 'completed', code: 'ok' });
            recordChatAudit({
                tenantId, userId, requestId,
                action: 'request_completed', engine: result.engine, outcome: 'completed', code: 'OK'
            });
            sendEvent('done', { conversationId: sessionId, title: session.title, engine: result.engine });
            return res.end();
        } catch (error) {
            log.warn(`[Stream] 9Router request rejected (${error?.code || 'UNKNOWN'})`);
            recordChatOutcome({ engine: '9router', outcome: error?.code === 'CLIENT_ABORTED' ? 'cancelled' : 'failed', code: error?.code || 'UNKNOWN' });
            if (auditContext) recordChatAudit({
                ...auditContext,
                action: error?.code === 'CLIENT_ABORTED' ? 'request_cancelled' : 'request_failed',
                engine: 'unknown',
                outcome: error?.code === 'CLIENT_ABORTED' ? 'cancelled' : 'failed',
                code: error?.code || 'UNKNOWN'
            });
            if (!aborted) sendEvent('error', { error: 'AI service unavailable. Please try again.', code: error?.code || 'AI_UNAVAILABLE' });
            return res.end();
        } finally {
            endTelemetry();
        }
    });

    router.post('/chat/agent/:runId/approval', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        if (process.env.XBOT_AGENT_ENABLED !== 'true') return res.status(503).json({ error: 'xBot Agent is not enabled' });
        const runId = String(req.params.runId || '').trim();
        const choice = String(req.body?.choice || '').trim();
        if (!runId || runId.length > 256) return res.status(400).json({ error: 'Invalid run ID' });
        if (!['once', 'deny'].includes(choice)) return res.status(400).json({ error: 'Invalid approval choice' });
        try {
            const tenantId = normalizeTenantId(userId);
            const result = await getChatOrchestratorV2(configuredModels()).approveAgentRun({
                tenantId, userId: tenantId, runId, choice
            });
            recordChatAudit({
                tenantId,
                userId: tenantId,
                requestId: crypto.createHash('sha256').update(runId).digest('hex'),
                action: 'approval_submitted',
                engine: 'xbot-agent',
                outcome: 'completed',
                code: `CHOICE_${choice}`
            });
            return res.json({ ok: true, status: result?.status || 'running' });
        } catch (error) {
            const status = error?.code === 'RUN_TENANT_MISMATCH' ? 403 :
                ['APPROVAL_NOT_PENDING', 'APPROVAL_IN_PROGRESS'].includes(error?.code) ? 409 :
                    error?.code === 'APPROVAL_CHOICE_INVALID' ? 400 : 502;
            return res.status(status).json({ error: status === 502 ? 'xBot agent approval failed' : error.message });
        }
    });

    router.get('/history', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        try {
            const rows = await listUserSessions(userId);
            return res.json({ conversations: rows.map(row => ({
                conversationId: row.id,
                title: row.title || 'New Chat',
                isPinned: Boolean(row.isPinned),
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
            })) });
        } catch { return res.json({ conversations: [] }); }
    });

    router.get('/history/:conversationId', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const session = await getSession(req.params.conversationId, userId);
        if (!session) return res.status(404).json({ error: 'Conversation not found' });
        return res.json({ conversationId: session.id, messages: session.messages.filter(item => item.content?.trim()) });
    });

    router.put('/history/:conversationId', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const session = await getSession(req.params.conversationId, userId);
        if (!session) return res.status(404).json({ error: 'Conversation not found' });
        if (typeof req.body?.title === 'string') session.title = req.body.title.trim().slice(0, 100) || session.title;
        if (typeof req.body?.isPinned === 'boolean') session.isPinned = req.body.isPinned;
        session.updatedAt = Date.now();
        await saveSession(session);
        return res.json({ ok: true, title: session.title, isPinned: session.isPinned });
    });

    router.delete('/history/:conversationId', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        await dbRun('DELETE FROM web_chat_sessions WHERE id = ? AND userId = ?', [req.params.conversationId, userId]);
        chatSessionsCache.delete(req.params.conversationId);
        return res.json({ ok: true });
    });

    router.delete('/history', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        await dbRun('DELETE FROM web_chat_sessions WHERE userId = ?', [userId]);
        for (const [key, session] of chatSessionsCache) if (session.userId === userId) chatSessionsCache.delete(key);
        return res.json({ ok: true });
    });

    router.post('/history/:conversationId/share', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const session = await getSession(req.params.conversationId, userId);
        if (!session) return res.status(404).json({ error: 'Conversation not found' });
        const existing = await dbGet('SELECT id FROM shared_conversations WHERE conversationId = ? AND userId = ?', [session.id, userId]);
        if (existing) return res.json({ shareId: existing.id, shareUrl: `/shared/${existing.id}` });
        const shareId = crypto.randomBytes(9).toString('base64url').slice(0, 12);
        await dbRun(
            'INSERT INTO shared_conversations (id, conversationId, userId, title, messages, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [shareId, session.id, userId, session.title || 'Shared Chat', JSON.stringify(session.messages).slice(0, 200000), Date.now()]
        );
        return res.json({ shareId, shareUrl: `/shared/${shareId}` });
    });

    router.delete('/history/:conversationId/share', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        await dbRun('DELETE FROM shared_conversations WHERE conversationId = ? AND userId = ?', [req.params.conversationId, userId]);
        return res.json({ ok: true });
    });

    router.all('/keys', (_req, res) => res.status(410).json({ error: 'Direct provider credentials are not supported' }));
    router.post('/compare', (_req, res) => res.status(410).json({ error: 'Direct multi-provider comparison is not supported' }));

    return router;
}

setInterval(() => {
    const now = Date.now();
    for (const [key, session] of chatSessionsCache) if (now - session.updatedAt > SESSION_TTL) chatSessionsCache.delete(key);
    for (const [key, bucket] of chatRateBuckets) if (now > bucket.resetAt) chatRateBuckets.delete(key);
}, 5 * 60 * 1000).unref?.();

module.exports = { createChatRoutes };
