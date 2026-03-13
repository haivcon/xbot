/**
 * Web AI Chat Routes
 * Provides a Gemini-powered chat API for the web dashboard.
 * Shares the same on-chain tools and prompts as the Telegram bot.
 * File: src/server/chatRoutes.js
 */

const { Router } = require('express');
const { GoogleGenAI } = require('@google/genai');
const logger = require('../core/logger');
const log = logger.child('WebChat');
const { GEMINI_API_KEYS, GEMINI_MODEL, GEMINI_MODEL_FAMILIES } = require('../config/env');
const { ONCHAIN_TOOLS, executeToolCall, buildSystemInstruction } = require('../features/ai/ai-onchain');
const { WEB_TOOL_DECLARATIONS, executeWebToolCall } = require('./webToolExecutor');
const { buildAIAPrompt } = require('../config/prompts');
const { t } = require('../core/i18n');
const db = require('../../db.js');

// Debug: verify tools loaded correctly
log.info(`ONCHAIN_TOOLS loaded: ${Array.isArray(ONCHAIN_TOOLS) ? ONCHAIN_TOOLS.length + ' tool groups' : 'FAILED'}, total declarations: ${Array.isArray(ONCHAIN_TOOLS) ? ONCHAIN_TOOLS.reduce((sum, g) => sum + (g.functionDeclarations?.length || 0), 0) : 0}`);

// ── Session store (hybrid: in-memory cache + SQLite persistence) ──
const { dbRun, dbGet, dbAll } = require('../../db/core');
const chatSessionsCache = new Map();
const SESSION_TTL = 30 * 60 * 1000;   // 30 min (cache eviction)
const SESSION_MAX_MESSAGES = 40;
const MAX_TOOL_ROUNDS = 8;            // prevent infinite loops

/** Load session from cache or DB */
async function getSession(sessionId, userId) {
    if (chatSessionsCache.has(sessionId)) return chatSessionsCache.get(sessionId);
    try {
        const row = await dbGet('SELECT * FROM web_chat_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
        if (row) {
            const session = {
                id: row.id,
                userId: row.userId,
                title: row.title,
                messages: JSON.parse(row.messages || '[]'),
                updatedAt: row.updatedAt || Date.now(),
            };
            chatSessionsCache.set(sessionId, session);
            return session;
        }
    } catch (err) { log.warn('DB load session error:', err.message); }
    return null;
}

/** Save session to cache + DB */
async function saveSession(session) {
    chatSessionsCache.set(session.id, session);
    try {
        await dbRun(
            `INSERT OR REPLACE INTO web_chat_sessions (id, userId, title, messages, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [session.id, session.userId, session.title, JSON.stringify(session.messages), session.createdAt || Date.now(), Date.now()]
        );
    } catch (err) { log.warn('DB save session error:', err.message); }
}

/** Delete session from cache + DB */
async function deleteSession(sessionId, userId) {
    chatSessionsCache.delete(sessionId);
    try {
        await dbRun('DELETE FROM web_chat_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
    } catch (err) { log.warn('DB delete session error:', err.message); }
}

/** List user's sessions from DB */
async function listUserSessions(userId, limit = 20) {
    try {
        return await dbAll(
            'SELECT id, title, updatedAt FROM web_chat_sessions WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?',
            [userId, limit]
        );
    } catch { return []; }
}

// Cache cleanup every 10 min (only evicts from memory, not DB)
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of chatSessionsCache) {
        if (now - session.updatedAt > SESSION_TTL) chatSessionsCache.delete(key);
    }
}, 10 * 60 * 1000);

// ── Per-user chat rate limiter ───────────────────────────
const chatRateBuckets = new Map();
const CHAT_RATE_LIMIT = 15;          // max requests per window
const CHAT_RATE_WINDOW = 60_000;     // 1 minute

function chatRateLimit(userId) {
    const now = Date.now();
    let bucket = chatRateBuckets.get(userId);
    if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + CHAT_RATE_WINDOW };
    }
    bucket.count++;
    chatRateBuckets.set(userId, bucket);
    // Periodic cleanup
    if (chatRateBuckets.size > 200 && Math.random() < 0.1) {
        for (const [k, v] of chatRateBuckets) { if (v.resetAt < now) chatRateBuckets.delete(k); }
    }
    return bucket.count <= CHAT_RATE_LIMIT;
}
// Periodic cleanup for rate limiter (every 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of chatRateBuckets) { if (v.resetAt < now) chatRateBuckets.delete(k); }
}, 5 * 60 * 1000);

// ── Gemini client pool ───────────────────────────────────
function getGeminiClient(apiKey) {
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
}

/**
 * Resolve an API key for the given user.
 * Priority: 1) env GEMINI_API_KEYS  2) user's DB-stored keys
 */
async function resolveGeminiKey(userId) {
    // 1. Try env-level keys
    if (GEMINI_API_KEYS && GEMINI_API_KEYS.length > 0) {
        const idx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
        return GEMINI_API_KEYS[idx];
    }
    // 2. Try user's DB-stored keys (added via /api or ConfigPage)
    if (userId) {
        try {
            const db = require('../core/database');
            const userKeys = await db.listUserAiKeys(userId);
            const googleKeys = userKeys
                .filter(k => (k.provider || '').toLowerCase() === 'google' || (k.provider || '').toLowerCase() === 'gemini')
                .map(k => k.apiKey)
                .filter(Boolean);
            if (googleKeys.length > 0) {
                const idx = Math.floor(Math.random() * googleKeys.length);
                return googleKeys[idx];
            }
        } catch (err) {
            log.warn(`Failed to load user AI keys: ${err.message}`);
        }
    }
    return null;
}

// ── Helper: strip HTML tags for web (use markdown) ───────
function htmlToMarkdown(html) {
    if (!html) return '';
    return html
        .replace(/<b>(.*?)<\/b>/gi, '**$1**')
        .replace(/<i>(.*?)<\/i>/gi, '*$1*')
        .replace(/<code>(.*?)<\/code>/gi, '`$1`')
        .replace(/<pre>(.*?)<\/pre>/gis, '```\n$1\n```')
        .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '');
}

// ── Build tool declarations for Gemini (cached at startup) ─
let _cachedToolDeclarations = null;
function getToolDeclarations() {
    if (_cachedToolDeclarations) return _cachedToolDeclarations;
    const onchainDecls = [];
    for (const toolObj of ONCHAIN_TOOLS) {
        if (toolObj?.functionDeclarations) onchainDecls.push(...toolObj.functionDeclarations);
    }
    const seen = new Set();
    const merged = [];
    for (const decl of WEB_TOOL_DECLARATIONS) {
        if (decl?.name && !seen.has(decl.name)) { seen.add(decl.name); merged.push(decl); }
    }
    for (const decl of onchainDecls) {
        if (decl?.name && !seen.has(decl.name)) { seen.add(decl.name); merged.push(decl); }
    }
    _cachedToolDeclarations = [{ functionDeclarations: merged }];
    log.info(`[Tools] Merged: ${merged.length} declarations (${WEB_TOOL_DECLARATIONS.length} web + ${onchainDecls.length} onchain, deduped)`);
    return _cachedToolDeclarations;
}

// ── Create chat routes ───────────────────────────────────
function createChatRoutes() {
    const router = Router();

    /**
     * POST /chat
     * Body: { message: string, conversationId?: string }
     * Returns: { reply: string, conversationId: string, toolCalls?: object[] }
     */
    router.post('/chat', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const { message, conversationId } = req.body;
        // Validate input BEFORE rate limiting (don't burn quota on bad requests)
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        if (message.length > 10000) {
            return res.status(400).json({ error: 'Message too long (max 10,000 characters)' });
        }
        // Validate conversationId format (prevent injection)
        if (conversationId && !conversationId.startsWith(`web_${userId}_`)) {
            return res.status(400).json({ error: 'Invalid conversation ID' });
        }

        if (!chatRateLimit(userId)) {
            return res.status(429).json({ error: 'Too many messages. Please wait a moment.' });
        }

        const apiKey = await resolveGeminiKey(userId);
        if (!apiKey) {
            return res.status(503).json({ error: 'No AI API keys configured. Add GEMINI_API_KEYS to .env or add a key via /api command in Telegram.' });
        }
        const client = getGeminiClient(apiKey);

        try {
            // Build or retrieve session
            const sessionKey = conversationId || `web_${userId}_${Date.now()}`;
            let session = await getSession(sessionKey, userId);
            let sessionHistory;
            if (session) {
                // Existing session with DB-backed messages — rebuild Gemini history
                const systemInstruction = await buildSystemInstruction(userId);
                const aiaPrompt = buildAIAPrompt({
                    lang: req.dashboardUser?.lang || 'en',
                    isGroup: false,
                    isAdmin: false,
                    botUsername: process.env.BOT_USERNAME || 'xbot',
                    userId
                });
                sessionHistory = session.messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : m.role,
                    parts: [{ text: m.content }]
                }));
                session._systemInstruction = systemInstruction + '\n\n' + aiaPrompt +
                    '\n\nIMPORTANT: You are now responding via a WEB DASHBOARD (not Telegram). ' +
                    'Use Markdown formatting instead of HTML. Do NOT use Telegram-specific formatting (<b>, <i>, <code>). ' +
                    'Use **bold**, *italic*, `code` instead. Do NOT mention Telegram-specific features like /commands. ' +
                    'CRITICAL: NEVER truncate or shorten blockchain addresses, token addresses, contract addresses, or transaction hashes. ' +
                    'Always display them in FULL (e.g. 0x16d91d1615fc55b76d5f92365bd60c069b46ef78, NOT 0x16d9...ef78). ' +
                    'Keep responses conversational and helpful.';
            } else {
                // New session
                const systemInstruction = await buildSystemInstruction(userId);
                const aiaPrompt = buildAIAPrompt({
                    lang: req.dashboardUser?.lang || 'en',
                    isGroup: false,
                    isAdmin: false,
                    botUsername: process.env.BOT_USERNAME || 'xbot',
                    userId
                });

                // Load user preferences for AI memory (#12)
                let prefsContext = '';
                try {
                    const prefs = await db.getUserPreferences(userId);
                    prefsContext = db.formatPreferencesForPrompt(prefs);
                } catch (e) { /* preferences table may not exist yet */ }

                session = {
                    id: sessionKey,
                    userId,
                    title: message.trim().substring(0, 60),
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    _systemInstruction: systemInstruction + '\n\n' + aiaPrompt +
                        '\n\nIMPORTANT: You are now responding via a WEB DASHBOARD (not Telegram). ' +
                        'Use Markdown formatting instead of HTML. Do NOT use Telegram-specific formatting (<b>, <i>, <code>). ' +
                        'Use **bold**, *italic*, `code` instead. Do NOT mention Telegram-specific features like /commands. ' +
                        'CRITICAL: NEVER truncate or shorten blockchain addresses, token addresses, contract addresses, or transaction hashes. ' +
                        'Always display them in FULL (e.g. 0x16d91d1615fc55b76d5f92365bd60c069b46ef78, NOT 0x16d9...ef78). ' +
                        'Keep responses conversational and helpful.' + prefsContext,
                };
                sessionHistory = [];
            }

            // Add user message to history
            sessionHistory.push({ role: 'user', parts: [{ text: message.trim() }] });

            // Trim old messages
            while (sessionHistory.length > SESSION_MAX_MESSAGES) {
                sessionHistory.shift();
            }

            // Call Gemini with function calling
            const model = GEMINI_MODEL || 'gemini-3-flash-preview';
            const toolCalls = [];
            let finalResponse = '';
            let currentHistory = [...sessionHistory];
            let round = 0;
            const mergedTools = getToolDeclarations();

            while (round < MAX_TOOL_ROUNDS) {
                round++;

                log.info(`[Round ${round}] Calling Gemini model=${model}, tools=${mergedTools[0]?.functionDeclarations?.length || 0} total, history=${currentHistory.length} msgs`);
                const response = await client.models.generateContent({
                    model,
                    contents: currentHistory,
                    systemInstruction: session._systemInstruction,
                    config: {
                        tools: mergedTools,
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                        timeout: 60000,
                    }
                });

                const candidate = response?.candidates?.[0];
                if (!candidate?.content?.parts) {
                    log.warn(`[Round ${round}] No candidate parts! Response: ${JSON.stringify(response?.candidates?.[0]).substring(0, 200)}`);
                    finalResponse = 'Sorry, I could not generate a response. Please try again.';
                    break;
                }

                const parts = candidate.content.parts;
                const textParts = parts.filter(p => p.text);
                const functionCallParts = parts.filter(p => p.functionCall);
                log.info(`[Round ${round}] Response: ${textParts.length} text parts, ${functionCallParts.length} function calls${functionCallParts.length ? ' (' + functionCallParts.map(p => p.functionCall.name).join(', ') + ')' : ''}`);

                if (functionCallParts.length === 0) {
                    // No function calls — we have the final text response
                    finalResponse = textParts.map(p => p.text).join('').trim();
                    // Add assistant response to history
                    currentHistory.push({ role: 'model', parts: textParts.length > 0 ? textParts : [{ text: finalResponse }] });
                    break;
                }

                // Process function calls
                const assistantParts = [...parts]; // include both text + functionCall parts
                currentHistory.push({ role: 'model', parts: assistantParts });

                const functionResponseParts = [];
                for (const part of functionCallParts) {
                    const fc = part.functionCall;
                    log.info(`WebChat tool call: ${fc.name}(${JSON.stringify(fc.args || {}).substring(0, 200)})`);

                    const context = {
                        userId,
                        chatId: userId,
                        lang: req.dashboardUser?.lang || 'en',
                        isWeb: true
                    };

                    let result;
                    try {
                        // Try web tools first, then fall back to onchain tools
                        result = await executeWebToolCall(fc, context);
                        if (result === undefined) {
                            result = await executeToolCall(fc, context);
                        }
                        if (result === undefined) {
                            result = { error: `Unknown tool: ${fc.name}` };
                        }
                        // Handle special actions
                        if (result?.action === 'clear_session') {
                            session.messages = [];
                            currentHistory = [{ role: 'user', parts: [{ text: message.trim() }] }];
                        }
                    } catch (err) {
                        log.error(`WebChat tool error ${fc.name}: ${err.message}`);
                        result = { error: err.message };
                    }

                    // Convert result to string for logging, but pass object to Gemini
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                    toolCalls.push({ name: fc.name, args: fc.args, result: resultStr.substring(0, 2000) });

                    // Ensure response is an object (Gemini API requires Struct, not string/array)
                    let safeResult = result || { error: 'No result' };
                    if (typeof safeResult === 'string') safeResult = { result: safeResult };
                    if (Array.isArray(safeResult)) safeResult = { items: safeResult };
                    // Strip displayMessage (UI-only, too long for Struct)
                    if (safeResult.displayMessage) {
                        const summary = typeof safeResult.displayMessage === 'string'
                            ? safeResult.displayMessage.substring(0, 2000) : '[display content]';
                        safeResult = { ...safeResult, displayMessage: summary };
                    }

                    functionResponseParts.push({
                        functionResponse: {
                            name: fc.name,
                            response: safeResult
                        }
                    });
                }

                currentHistory.push({ role: 'user', parts: functionResponseParts });
            }

            // Save updated history to DB
            // Serialize: merge tool metadata into model messages, skip pure function-response entries
            const rawEntries = currentHistory.slice(-SESSION_MAX_MESSAGES)
                .filter(h => h.role === 'user' || h.role === 'model')
                .map(h => {
                    const textContent = h.parts?.map(p => p.text).filter(Boolean).join('') || '';
                    const fcParts = h.parts?.filter(p => p.functionCall) || [];
                    const hasFR = h.parts?.some(p => p.functionResponse);
                    // Pure function-response entry (role=user) — skip entirely
                    if (!textContent && hasFR) return null;
                    // Model message with function calls — append tool names as context
                    let content = textContent;
                    if (fcParts.length > 0) {
                        const toolNames = fcParts.map(p => p.functionCall.name).join(', ');
                        content = content
                            ? `${content}\n[Used: ${toolNames}]`
                            : `[Used: ${toolNames}]`;
                    }
                    const msg = { role: h.role === 'model' ? 'assistant' : h.role, content };
                    if (fcParts.length > 0) {
                        msg.toolCalls = fcParts.map(p => ({ name: p.functionCall.name, args: p.functionCall.args }));
                    }
                    return msg;
                })
                .filter(Boolean);
            session.messages = rawEntries;
            session.updatedAt = Date.now();
            await saveSession(session);

            res.json({
                reply: finalResponse || 'No response generated.',
                conversationId: sessionKey,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                title: session.title
            });

            // #8 Auto-rename: generate a smart title after first exchange
            if (session.messages.length <= 4 && session.title === message.trim().substring(0, 60)) {
                (async () => {
                    try {
                        const titleResp = await client.models.generateContent({
                            model: GEMINI_MODEL || 'gemini-3-flash-preview',
                            contents: [{ role: 'user', parts: [{ text: `Summarize this chat in max 5 words as a title. Just the title, no quotes, no explanation.\n\nUser: ${message}\nAI: ${(finalResponse || '').substring(0, 300)}` }] }],
                            config: { maxOutputTokens: 30, temperature: 0.3 }
                        });
                        const newTitle = titleResp?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                        if (newTitle && newTitle.length > 2 && newTitle.length < 80) {
                            session.title = newTitle;
                            await saveSession(session);
                            log.info(`[AutoTitle] "${sessionKey}" → "${newTitle}"`);
                        }
                    } catch (e) { log.debug(`AutoTitle failed: ${e.message}`); }
                })();
            }
        } catch (err) {
            log.error(`WebChat error: ${err.message}`);

            // Guard: don't send if response was already sent
            if (res.headersSent) return;

            // Check for common Gemini errors
            if (err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429')) {
                return res.status(429).json({ error: 'AI rate limit exceeded. Please wait a moment.' });
            }
            if (err.message?.includes('API_KEY_INVALID')) {
                return res.status(503).json({ error: 'AI API key expired. Contact admin.' });
            }

            res.status(500).json({ error: 'AI service error. Please try again.' });
        }
    });

    /**
     * GET /history
     * Returns conversation list for the user
     */
    router.get('/history', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const rows = await listUserSessions(userId);
        const conversations = rows.map(r => ({
            conversationId: r.id,
            title: r.title || 'New Chat',
            updatedAt: r.updatedAt
        }));
        res.json({ conversations });
    });

    /**
     * GET /history/:conversationId
     * Returns full message history for a conversation
     */
    router.get('/history/:conversationId', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        const { conversationId } = req.params;

        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const session = await getSession(conversationId, userId);
        if (!session) return res.status(404).json({ error: 'Conversation not found' });

        // Filter out empty messages and legacy tool summaries from old sessions
        const displayMessages = (session.messages || []).filter(m => {
            if (!m.content || !m.content.trim()) return false;
            const c = m.content.trim();
            // Backward compat: skip legacy [Called X] / [Result from X] entries
            if (/^(\[(Called|Result from) [\w]+\]\s*)+$/.test(c)) return false;
            return true;
        });
        res.json({ conversationId, messages: displayMessages });
    });

    /**
     * DELETE /history/:conversationId
     * Clear a conversation
     */
    router.delete('/history/:conversationId', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        const { conversationId } = req.params;

        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        await deleteSession(conversationId, userId);
        res.json({ ok: true });
    });

    /**
     * DELETE /history
     * Clear all conversations for the user
     */
    router.delete('/history', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        try {
            await dbRun('DELETE FROM web_chat_sessions WHERE userId = ?', [userId]);
            // Also clear cache
            for (const key of chatSessionsCache.keys()) {
                if (chatSessionsCache.get(key)?.userId === userId) chatSessionsCache.delete(key);
            }
        } catch { /* ignore */ }
        res.json({ ok: true });
    });

    /**
     * POST /chat/stream
     * SSE streaming endpoint — sends text chunks in real-time
     */
    router.post('/chat/stream', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });

        const { message, conversationId, image, model: requestedModel } = req.body;
        // Validate input BEFORE rate limiting
        if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
        if (message.length > 10000) return res.status(400).json({ error: 'Message too long' });
        if (image && image.length > 5_000_000) return res.status(400).json({ error: 'Image too large' });
        if (conversationId && !conversationId.startsWith(`web_${userId}_`)) {
            return res.status(400).json({ error: 'Invalid conversation ID' });
        }

        if (!chatRateLimit(userId)) return res.status(429).json({ error: 'Rate limited' });

        // Validate model selection (allow-list)
        const ALLOWED_MODELS = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
        const useModel = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : (GEMINI_MODEL || 'gemini-3-flash-preview');

        // SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        const sendEvent = (event, data) => { try { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} };

        // Handle client abort — use res.on('close'), NOT req.on('close')
        // req 'close' fires prematurely on Windows after POST body is received
        let aborted = false;
        res.on('close', () => { aborted = true; });

        try {
            const apiKey = await resolveGeminiKey(userId);
            if (!apiKey) { sendEvent('error', { error: 'No API key' }); res.end(); return; }
            const client = getGeminiClient(apiKey);
            const sessionKey = conversationId || `web_${userId}_${Date.now()}`;

            let session = await getSession(sessionKey, userId);
            let sessionHistory;

            if (session) {
                sessionHistory = (session.messages || []).map(m => ({
                    role: m.role === 'assistant' ? 'model' : m.role,
                    parts: [{ text: m.content || '' }]
                }));
                // Always rebuild the full system instruction (it's not persisted to DB)
                const systemInstruction = await buildSystemInstruction(userId);
                const aiaPrompt = buildAIAPrompt({ lang: req.dashboardUser?.lang || 'en', isGroup: false, isAdmin: false, botUsername: process.env.BOT_USERNAME || 'xbot', userId });
                // Load user preferences for AI memory (#12)
                let prefsContext = '';
                try { const prefs = await db.getUserPreferences(userId); prefsContext = db.formatPreferencesForPrompt(prefs); } catch (e) { /* table may not exist yet */ }
                session._systemInstruction = systemInstruction + '\n\n' + aiaPrompt +
                    '\n\nIMPORTANT: You are now responding via a WEB DASHBOARD. Use Markdown formatting instead of HTML. ' +
                    'Use **bold**, *italic*, `code` instead. Do NOT mention Telegram-specific features like /commands. ' +
                    'CRITICAL: NEVER truncate or shorten blockchain addresses, token addresses, contract addresses, or transaction hashes. ' +
                    'Always display them in FULL. Keep responses conversational and helpful.' + prefsContext;
            } else {
                const systemInstruction = await buildSystemInstruction(userId);
                const aiaPrompt = buildAIAPrompt({ lang: req.dashboardUser?.lang || 'en', isGroup: false, isAdmin: false, botUsername: process.env.BOT_USERNAME || 'xbot', userId });
                // Load user preferences for AI memory (#12)
                let prefsContext = '';
                try { const prefs = await db.getUserPreferences(userId); prefsContext = db.formatPreferencesForPrompt(prefs); } catch (e) { /* table may not exist yet */ }
                session = {
                    id: sessionKey, userId,
                    title: message.trim().substring(0, 60),
                    messages: [], createdAt: Date.now(), updatedAt: Date.now(),
                    _systemInstruction: systemInstruction + '\n\n' + aiaPrompt +
                        '\n\nIMPORTANT: You are now responding via a WEB DASHBOARD. Use Markdown formatting instead of HTML. ' +
                        'Use **bold**, *italic*, `code` instead. Do NOT mention Telegram-specific features like /commands. ' +
                        'CRITICAL: NEVER truncate or shorten blockchain addresses, token addresses, contract addresses, or transaction hashes. ' +
                        'Always display them in FULL. Keep responses conversational and helpful.' + prefsContext,
                };
                sessionHistory = [];
            }

            // Build user parts (text + optional image)
            const userParts = [{ text: message.trim() }];
            if (image && typeof image === 'string' && image.startsWith('data:image/')) {
                const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
                if (match) userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
            sessionHistory.push({ role: 'user', parts: userParts });
            while (sessionHistory.length > SESSION_MAX_MESSAGES) sessionHistory.shift();

            const model = useModel;
            const mergedTools = getToolDeclarations();
            let finalResponse = '';
            const toolCalls = [];
            let currentHistory = [...sessionHistory];
            let round = 0;

            log.info(`[Stream] Starting: model=${model}, history=${currentHistory.length} msgs, tools=${mergedTools[0]?.functionDeclarations?.length || 0}`);

            while (round < MAX_TOOL_ROUNDS) {
                if (aborted) break;
                round++;
                let response;
                try {
                    response = await client.models.generateContentStream({
                        model,
                        contents: currentHistory,
                        systemInstruction: session._systemInstruction,
                        config: { tools: mergedTools, temperature: 0.7, maxOutputTokens: 8192 }
                    });
                } catch (apiErr) {
                    log.error(`[Stream][Round ${round}] API error: ${apiErr?.message}`);
                    sendEvent('error', { error: apiErr?.message || 'API call failed' });
                    res.end();
                    return;
                }

                let roundText = '';
                let functionCallParts = [];
                let allParts = [];

                try {
                    for await (const chunk of response) {
                        const parts = chunk?.candidates?.[0]?.content?.parts || [];
                        for (const part of parts) {
                            allParts.push(part);
                            if (part.text) {
                                roundText += part.text;
                                sendEvent('text-delta', { text: part.text });
                            }
                            if (part.functionCall) functionCallParts.push(part);
                        }
                    }
                } catch (streamErr) {
                    log.error(`[Stream][Round ${round}] Stream error: ${streamErr?.message}`);
                    sendEvent('error', { error: streamErr?.message || 'Stream iteration failed' });
                    res.end();
                    return;
                }

                log.info(`[Stream][Round ${round}] text=${roundText.length} chars, tools=${functionCallParts.length}`);

                if (functionCallParts.length === 0) {
                    finalResponse = roundText.trim();
                    currentHistory.push({ role: 'model', parts: allParts.length > 0 ? allParts : [{ text: finalResponse }] });
                    break;
                }

                // Process tool calls
                currentHistory.push({ role: 'model', parts: allParts });
                const functionResponseParts = [];
                for (const part of functionCallParts) {
                    const fc = part.functionCall;
                    sendEvent('tool-start', { name: fc.name, args: fc.args });
                    const context = { userId, chatId: userId, lang: req.dashboardUser?.lang || 'en', isWeb: true };

                    let result;
                    result = await executeWebToolCall(fc, context);
                    if (!result) {
                        // Fallback to onchain tools safely (same as main endpoint)
                        try { result = await executeToolCall(fc, context); } catch {}
                    }
                    if (!result) result = { error: `Tool ${fc.name} not available via web.` };
                    if (result?.displayMessage) result.displayMessage = htmlToMarkdown(result.displayMessage);

                    // Handle special actions (e.g. clear_session from delete_chat_history)
                    if (result?.action === 'clear_session') {
                        session.messages = [];
                        currentHistory = [{ role: 'user', parts: userParts }];
                    }

                    toolCalls.push({ name: fc.name, args: fc.args, result: typeof result === 'string' ? result : JSON.stringify(result)?.substring(0, 500) });
                    sendEvent('tool-result', { name: fc.name, result: typeof result === 'string' ? result : JSON.stringify(result)?.substring(0, 500) });
                    // Ensure response is an object (Gemini API requires Struct, not string/array)
                    let safeResult = result || { error: 'No result' };
                    if (typeof safeResult === 'string') safeResult = { result: safeResult };
                    if (Array.isArray(safeResult)) safeResult = { items: safeResult };
                    // Truncate displayMessage (too long for Struct payload)
                    if (safeResult.displayMessage && typeof safeResult.displayMessage === 'string' && safeResult.displayMessage.length > 2000) {
                        safeResult = { ...safeResult, displayMessage: safeResult.displayMessage.substring(0, 2000) };
                    }
                    functionResponseParts.push({ functionResponse: { name: fc.name, response: safeResult } });
                }
                currentHistory.push({ role: 'user', parts: functionResponseParts });
            }

            // Serialize: merge tool metadata, skip pure function-response entries
            session.messages = currentHistory.slice(-SESSION_MAX_MESSAGES)
                .filter(h => h.role === 'user' || h.role === 'model')
                .map(h => {
                    const textContent = h.parts?.map(p => p.text).filter(Boolean).join('') || '';
                    const fcParts = h.parts?.filter(p => p.functionCall) || [];
                    const hasFR = h.parts?.some(p => p.functionResponse);
                    if (!textContent && hasFR) return null;
                    let content = textContent;
                    if (fcParts.length > 0) {
                        const toolNames = fcParts.map(p => p.functionCall.name).join(', ');
                        content = content ? `${content}\n[Used: ${toolNames}]` : `[Used: ${toolNames}]`;
                    }
                    const msg = { role: h.role === 'model' ? 'assistant' : h.role, content };
                    if (fcParts.length > 0) {
                        msg.toolCalls = fcParts.map(p => ({ name: p.functionCall.name, args: p.functionCall.args }));
                    }
                    return msg;
                })
                .filter(Boolean);
            session.updatedAt = Date.now();
            await saveSession(session);

            sendEvent('done', { conversationId: sessionKey, title: session.title, toolCalls: toolCalls.length > 0 ? toolCalls : undefined });
            res.end();

            // Auto-rename (fire-and-forget)
            if (session.messages.length <= 2 && session.title === message.trim().substring(0, 60)) {
                (async () => {
                    try {
                        const titleResp = await client.models.generateContent({
                            model, contents: [{ role: 'user', parts: [{ text: `Summarize this chat in max 5 words as a title. Just the title, no quotes.\n\nUser: ${message}\nAI: ${(finalResponse || '').substring(0, 300)}` }] }],
                            config: { maxOutputTokens: 30, temperature: 0.3 }
                        });
                        const newTitle = titleResp?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                        if (newTitle && newTitle.length > 2 && newTitle.length < 80) { session.title = newTitle; await saveSession(session); }
                    } catch {}
                })();
            }
        } catch (err) {
            log.error(`Stream error: ${err.message}`);
            sendEvent('error', { error: err.message || 'Stream failed' });
            res.end();
        }
    });

    // ── GET /ai/models — Available models for current user ─────
    router.get('/models', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId;
            const jwtRole = req.dashboardUser?.role;
            // Respect viewMode: owner in 'user' mode is treated as regular user
            const viewMode = req.query.viewMode;
            const isOwner = jwtRole === 'owner' && viewMode !== 'user';
            const db = require('../../db');
            const userKeys = userId ? await db.listUserAiKeys(userId) : [];
            const hasPersonalKey = userKeys.some(k =>
                ['google', 'gemini'].includes((k.provider || '').toLowerCase()) && k.apiKey
            );
            const hasServerKey = GEMINI_API_KEYS && GEMINI_API_KEYS.length > 0;

            // Build model list based on user permissions
            const allModels = [
                { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'Best reasoning & complex tasks', icon: '🧠', tier: 'pro' },
                { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Powerful multimodal & agentic', icon: '🚀', tier: 'free' },
                { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Lite', desc: 'Fastest, lowest cost', icon: '💨', tier: 'free' },
            ];

            let models;
            if (isOwner || hasPersonalKey) {
                // Owner or user with personal key: can use all models
                models = allModels;
            } else {
                // Regular user with server key only: default model only
                models = allModels.filter(m => m.id === GEMINI_MODEL);
            }

            res.json({
                models,
                defaultModel: GEMINI_MODEL,
                hasPersonalKey,
                hasServerKey,
                isOwner,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /ai/keys — List user's Google AI keys ────────────
    router.get('/keys', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });
            const db = require('../../db');
            const keys = await db.listUserAiKeys(userId);
            const googleKeys = keys
                .filter(k => ['google', 'gemini'].includes((k.provider || '').toLowerCase()))
                .map(k => ({
                    id: k.id || k.rowid,
                    name: k.name || k.label || 'Google AI',
                    provider: k.provider || 'google',
                    maskedKey: k.apiKey ? `${k.apiKey.slice(0, 6)}...${k.apiKey.slice(-4)}` : '***',
                    createdAt: k.createdAt,
                }));
            res.json({ keys: googleKeys });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /ai/keys — Add a Google AI key ──────────────────
    router.post('/keys', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });
            const { apiKey, name } = req.body;
            if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
                return res.status(400).json({ error: 'Invalid API key' });
            }

            // Quick validation: try listing models with the key
            try {
                const testClient = new GoogleGenAI({ apiKey: apiKey.trim() });
                await testClient.models.get({ model: 'gemini-3-flash-preview' });
            } catch (testErr) {
                return res.status(400).json({ error: `Invalid key: ${testErr?.message?.substring(0, 100) || 'validation failed'}` });
            }

            const db = require('../../db');
            const result = await db.addUserAiKey(userId, name || 'Google AI', apiKey.trim(), 'google');
            res.json({ success: true, added: result?.added !== false });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── DELETE /ai/keys — Remove a user's API key ────────────
    router.delete('/keys', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });
            const { keyId } = req.body;
            const db = require('../../db');
            if (keyId) {
                await db.deleteUserAiKey(userId, keyId);
            } else {
                await db.deleteUserAiKeys(userId, 'google');
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================================
    // MULTI-MODEL COMPARISON (#14)
    // with per-user rate limit (#5)
    // ==================================
    const _compareRateMap = new Map(); // userId -> { count, resetAt }
    const COMPARE_RATE_LIMIT = 5; // max 5 per minute
    const COMPARE_RATE_WINDOW = 60_000;

    router.post('/compare', async (req, res) => {
        const userId = req.dashboardUser?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        // Rate limit check
        const now = Date.now();
        let entry = _compareRateMap.get(String(userId));
        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + COMPARE_RATE_WINDOW };
            _compareRateMap.set(String(userId), entry);
        }
        entry.count++;
        if (entry.count > COMPARE_RATE_LIMIT) {
            return res.status(429).json({ error: 'Too many compare requests. Try again in 1 minute.' });
        }

        const { message, modelA, modelB } = req.body;
        if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

        const ALLOWED = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
        const mA = ALLOWED.includes(modelA) ? modelA : 'gemini-3-flash-preview';
        const mB = ALLOWED.includes(modelB) ? modelB : 'gemini-3.1-pro-preview';

        try {
            const apiKey = await resolveGeminiKey(userId);
            if (!apiKey) return res.status(503).json({ error: 'No API key' });
            const client = getGeminiClient(apiKey);
            const systemInstruction = await buildSystemInstruction(userId);

            const generate = async (model) => {
                try {
                    const result = await client.models.generateContent({
                        model,
                        contents: [{ role: 'user', parts: [{ text: message.trim() }] }],
                        config: { systemInstruction }
                    });
                    return { model, response: result.text || '', error: null };
                } catch (err) {
                    return { model, response: '', error: err.message };
                }
            };

            const [resultA, resultB] = await Promise.all([generate(mA), generate(mB)]);
            res.json({ modelA: resultA, modelB: resultB });
        } catch (err) {
            log.child('Compare').error('Compare error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createChatRoutes };
