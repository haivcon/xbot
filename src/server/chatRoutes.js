/**
 * Web AI Chat Routes
 * Provides a Gemini-powered chat API for the web dashboard.
 * Shares the same on-chain tools and prompts as the Telegram bot.
 * File: src/server/chatRoutes.js
 */

const { Router } = require('express');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const logger = require('../core/logger');
const log = logger.child('WebChat');
const { GEMINI_API_KEYS, GEMINI_MODEL, GEMINI_MODEL_FAMILIES, OPENAI_API_KEYS, OPENAI_MODEL, OPENAI_MODEL_FAMILIES, GROQ_API_KEYS, GROQ_MODEL_FAMILIES, GROQ_API_URL } = require('../config/env');
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

/** Detect AI provider from model ID */
function detectProviderFromModel(modelId) {
    if (!modelId) return 'google';
    if (modelId.startsWith('gemini')) return 'google';
    if (OPENAI_MODEL_FAMILIES && OPENAI_MODEL_FAMILIES[modelId]) return 'openai';
    if (GROQ_MODEL_FAMILIES && GROQ_MODEL_FAMILIES[modelId]) return 'groq';
    // Fallback heuristic
    if (modelId.startsWith('gpt-')) return 'openai';
    if (modelId.includes('llama') || modelId.includes('groq')) return 'groq';
    return 'google';
}

/** Resolve OpenAI API key for user */
async function resolveOpenAIKey(userId) {
    if (OPENAI_API_KEYS && OPENAI_API_KEYS.length > 0) {
        return OPENAI_API_KEYS[Math.floor(Math.random() * OPENAI_API_KEYS.length)];
    }
    if (userId) {
        try {
            const database = require('../core/database');
            const userKeys = await database.listUserAiKeys(userId);
            const keys = userKeys.filter(k => (k.provider || '').toLowerCase() === 'openai').map(k => k.apiKey).filter(Boolean);
            if (keys.length > 0) return keys[Math.floor(Math.random() * keys.length)];
        } catch {}
    }
    return null;
}

/** Resolve Groq API key for user */
async function resolveGroqKey(userId) {
    if (GROQ_API_KEYS && GROQ_API_KEYS.length > 0) {
        return GROQ_API_KEYS[Math.floor(Math.random() * GROQ_API_KEYS.length)];
    }
    if (userId) {
        try {
            const database = require('../core/database');
            const userKeys = await database.listUserAiKeys(userId);
            const keys = userKeys.filter(k => (k.provider || '').toLowerCase() === 'groq').map(k => k.apiKey).filter(Boolean);
            if (keys.length > 0) return keys[Math.floor(Math.random() * keys.length)];
        } catch {}
    }
    return null;
}

/** Convert Gemini tool declarations to OpenAI format */
function convertToolsToOpenAI(geminiTools) {
    const functions = [];
    for (const toolGroup of (geminiTools || [])) {
        for (const decl of (toolGroup.functionDeclarations || [])) {
            functions.push({
                type: 'function',
                function: {
                    name: decl.name,
                    description: decl.description || '',
                    parameters: decl.parameters || { type: 'object', properties: {} }
                }
            });
        }
    }
    return functions;
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
                    config: {
                        systemInstruction: session._systemInstruction,
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

        const { message, conversationId, image, model: requestedModel, userApiKey, persona, customPersonaText } = req.body;
        // Validate input BEFORE rate limiting
        if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
        if (message.length > 10000) return res.status(400).json({ error: 'Message too long' });
        if (image && image.length > 5_000_000) return res.status(400).json({ error: 'Image too large' });
        if (conversationId && !conversationId.startsWith(`web_${userId}_`)) {
            return res.status(400).json({ error: 'Invalid conversation ID' });
        }

        if (!chatRateLimit(userId)) return res.status(429).json({ error: 'Rate limited' });

        // Validate model selection (allow-list)
        const ALLOWED_GEMINI_MODELS = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
        const ALLOWED_OPENAI_MODELS = Object.keys(OPENAI_MODEL_FAMILIES);
        const ALLOWED_GROQ_MODELS = Object.keys(GROQ_MODEL_FAMILIES);
        const ALLOWED_MODELS = [...ALLOWED_GEMINI_MODELS, ...ALLOWED_OPENAI_MODELS, ...ALLOWED_GROQ_MODELS];
        let useModel = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : (GEMINI_MODEL || 'gemini-3-flash-preview');

        // ── Enforce default model for users without personal API key ──
        // Only owners and users with their own API key can change models
        if (!userApiKey) {
            const jwtRole = req.dashboardUser?.role;
            const viewMode = req.query?.viewMode;
            const isOwner = jwtRole === 'owner' && viewMode !== 'user';
            if (!isOwner) {
                const provider = detectProviderFromModel(useModel);
                const userKeys = await db.listUserAiKeys(userId);
                const hasPersonalGoogleKey = userKeys.some(k => ['google', 'gemini'].includes((k.provider || '').toLowerCase()) && k.apiKey);
                const hasPersonalOpenAiKey = userKeys.some(k => (k.provider || '').toLowerCase() === 'openai' && k.apiKey);
                const hasPersonalGroqKey = userKeys.some(k => (k.provider || '').toLowerCase() === 'groq' && k.apiKey);
                const DEFAULT_MODELS = {
                    google: GEMINI_MODEL || 'gemini-3-flash-preview',
                    openai: ALLOWED_OPENAI_MODELS[0] || 'gpt-5.4',
                    groq: ALLOWED_GROQ_MODELS[0] || 'openai/gpt-oss-120b',
                };
                if (
                    (provider === 'google' && !hasPersonalGoogleKey) ||
                    (provider === 'openai' && !hasPersonalOpenAiKey) ||
                    (provider === 'groq' && !hasPersonalGroqKey)
                ) {
                    const defaultModel = DEFAULT_MODELS[provider] || DEFAULT_MODELS.google;
                    if (useModel !== defaultModel) {
                        log.info(`[Stream] User ${userId} has no personal ${provider} key — forcing default model: ${defaultModel} (requested: ${useModel})`);
                        useModel = defaultModel;
                    }
                }
            }
        }

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
            const provider = detectProviderFromModel(useModel);
            const sessionKey = conversationId || `web_${userId}_${Date.now()}`;
            let session = await getSession(sessionKey, userId);

            // Build system instruction (shared across all providers)
            const sysInstr = await buildSystemInstruction(userId);
            let prefsCtx = '';
            try { const prefs = await db.getUserPreferences(userId); prefsCtx = db.formatPreferencesForPrompt(prefs); } catch (e) {}

            // ── Persona injection (CRITICAL: must be passed as personaSection into buildAIAPrompt
            // so it appears at the START of the prompt — matching Telegram handler pattern) ──
            const PERSONA_PROMPTS = {
                default: '',
                friendly: 'You are cheerful, energetic, and enthusiastic. Use lots of emoji 🎉 and exclamation marks! Be warm, supportive, and make conversations fun.',
                formal: 'You are a polished professional. Use formal language, precise terminology, and structured responses. Be courteous and business-like.',
                anime: 'You are a kawaii anime character! Use expressions like "sugoi!", "kawaii~", "nani?!". Add cute emoticons (◕‿◕✿) and speak in an anime style.',
                mentor: 'You are a patient, wise mentor. Explain things step-by-step. Use analogies and examples. Encourage learning and ask reflective questions.',
                funny: 'You are a witty comedian. Include clever jokes, puns, and humorous observations. Keep things light and entertaining while still being helpful.',
                crypto: 'You are a hardcore DeFi/crypto expert. Use crypto slang (WAGMI, NGMI, diamond hands, ape in, degen). Be bullish and enthusiastic about blockchain.',
                gamer: 'You are an excited gamer. Use gaming slang (GG, clutch, nerf, buff, OP). Reference game mechanics and treat everything like a quest or achievement.',
                rebel: 'You are bold, direct, and sassy. Challenge assumptions. Be confident and unapologetic. Use strong language (but stay helpful).',
                mafia: 'You are a calm, collected mafia boss. Speak with authority and confidence. Use phrases like "I\'ll make you an offer you can\'t refuse." Be decisive and strategic.',
                cute: 'You are sweet, gentle, and charming. Use soft language, endearing expressions, and cute descriptions. Be adorable and caring.',
                little_girl: 'You are an innocent, adorable little girl. Be playful, curious, and use simple expressions. Ask lots of "why?" questions. Very enthusiastic about everything!',
                little_brother: 'You are a cheeky little brother. Be witty, slightly mischievous, and full of youthful energy. Tease playfully but always help.',
                old_uncle: 'You are a humorous old uncle with lots of life experience. Share wisdom through funny anecdotes and dad jokes. Use Vietnamese proverbs when appropriate.',
                old_grandma: 'You are a warm, caring grandma. Be nurturing, share stories, and give motherly advice. Use gentle, loving language. Always worried about whether they ate yet.',
                deity: 'You are an omniscient deity. Speak with calm, divine wisdom. Use philosophical language and profound insights. Be serene and all-knowing.',
                king: 'You are a noble king. Speak with royal dignity and authority. Use formal, regal language. Be decisive and magnanimous.',
                banana_cat: 'You are a cat wearing a banana costume 🍌🐱. Be quirky, playful, and cat-like. Make cat puns. Occasionally meow and knock things off tables.',
                pretty_sister: 'You are an elegant, graceful older sister. Be supportive, fashionable, and confident. Give advice with warmth and sophistication.',
                seductive_girl: 'You are confident and alluring. Use charismatic, magnetic language. Be witty and captivating while maintaining helpfulness.',
                gentleman: 'You are a perfect gentleman. Be extremely polite, considerate, and chivalrous. Use refined language and always show respect.',
                star_xu: 'You are Star Xu, visionary founder of OKX. Speak about crypto with passion and vision. Reference OKX ecosystem, X Layer, and Web3 innovation.',
                niuma: 'You are NIUMA 🐮, steady and persistent like a bull. Be humble, hardworking, and reliable. Use motivational language about persistence.',
                xcat: 'You are XCAT 🐈, a free-spirited, curious cat. Be independent, adventurous, and occasionally mysterious. Love exploring new things.',
                xdog: 'You are XDOG 🐕, a proud, loyal, and brave dog. Be protective, enthusiastic, and fiercely loyal. Always excited to help!',
                xwawa: 'You are XWAWA 🐸, a carefree, cheerful frog. Be relaxed, optimistic, and go with the flow. Love water and rainy days!',
                banmao: 'You are Banmao 🐱🍌, a mischievous cat in a banana suit. Be funny, unpredictable, and slightly chaotic. Love bananas and causing harmless trouble.',
                mia: 'You are Mia 🍚, a tiny grain of rice with BIG confidence. Be surprisingly assertive for your size. Make food puns and be fierce!',
                jiajia: 'You are 佳佳 OKX 💎, a cute but sharp-minded mascot. Balance cuteness with intelligence. Be helpful and crypto-savvy.',
                xwizard: 'You are Xwizard 🧙, a magical crypto wizard. Use mystical language, cast "spells" (analyses), and speak of blockchain as magic.',
            };
            // U5: Support custom persona from user-defined text
            let personaText = '';
            if (persona === 'custom' && customPersonaText) {
                personaText = String(customPersonaText).slice(0, 500).replace(/[<>]/g, '');
            } else {
                personaText = PERSONA_PROMPTS[persona] || '';
            }
            // Build personaSection in the same format as Telegram handler (aiHandlers.js:3707)
            // This ensures persona is placed at the START of the prompt, not at the end
            const personaSection = personaText
                ? `\n\nPERSONALITY (CRITICAL — you MUST adopt this personality in ALL responses): ${personaText}`
                : '';

            const aiaPrompt = buildAIAPrompt({ personaSection });
            const dashboardNote = '\n\nIMPORTANT: You are now responding via a WEB DASHBOARD. Use Markdown formatting instead of HTML. ' +
                'Use **bold**, *italic*, `code` instead. Do NOT mention Telegram-specific features like /commands. ' +
                'CRITICAL: NEVER truncate or shorten blockchain addresses, token addresses, contract addresses, or transaction hashes. ' +
                'Always display them in FULL. Keep responses conversational and helpful.';
            // ── PROMPT ARCHITECTURE (sandwich technique): ──
            // 1. PERSONA IDENTITY (top — primacy bias, sets the character)
            // 2. TECHNICAL CONTEXT (middle — onchain tools, AIA rules)
            // 3. PERSONA REINFORCEMENT (bottom — recency bias, seals the character)
            const personaHeader = personaText
                ? `🎭 YOUR CHARACTER IDENTITY:\n${personaText}\n\nYou MUST stay in this character for ALL responses below. Your tools and capabilities are listed next, but your PERSONALITY must always shine through.\n\n---\n`
                : '';
            const personaFooter = personaText
                ? `\n\n---\n🎭 REMINDER — STAY IN CHARACTER:\n${personaText}\nEvery response must reflect this personality in tone, word choice, and style. Never revert to generic assistant mode.`
                : '';
            const fullSystemPrompt = personaHeader + sysInstr + '\n\n' + aiaPrompt + dashboardNote + prefsCtx + personaFooter;

            // ══════════ GEMINI ══════════
            if (provider === 'google') {
            const apiKey = userApiKey || await resolveGeminiKey(userId);
            if (!apiKey) { sendEvent('error', { error: 'No Google API key configured' }); res.end(); return; }
            const client = getGeminiClient(apiKey);

            let sessionHistory;
            if (session) {
                sessionHistory = (session.messages || []).map(m => ({
                    role: m.role === 'assistant' ? 'model' : m.role,
                    parts: [{ text: m.content || '' }]
                }));
                session._systemInstruction = fullSystemPrompt;
            } else {
                session = {
                    id: sessionKey, userId,
                    title: message.trim().substring(0, 60),
                    messages: [], createdAt: Date.now(), updatedAt: Date.now(),
                    _systemInstruction: fullSystemPrompt,
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

            log.info(`[Stream] Starting: model=${model}, persona=${persona || 'none'}, personaText=${personaText ? personaText.substring(0, 50) + '...' : 'EMPTY'}, history=${currentHistory.length} msgs, tools=${mergedTools[0]?.functionDeclarations?.length || 0}`);

            while (round < MAX_TOOL_ROUNDS) {
                if (aborted) break;
                round++;
                let response;
                try {
                    response = await client.models.generateContentStream({
                        model,
                        contents: currentHistory,
                        config: {
                            systemInstruction: session._systemInstruction,
                            tools: mergedTools,
                            temperature: 0.7,
                            maxOutputTokens: 8192
                        }
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

            // ══════════ OPENAI ══════════
            } else if (provider === 'openai') {
                const oaiKey = userApiKey || await resolveOpenAIKey(userId);
                if (!oaiKey) { sendEvent('error', { error: 'No OpenAI API key. Add one in AI Settings → API Keys.' }); res.end(); return; }
                const oaiClient = new OpenAI({ apiKey: oaiKey });
                if (!session) session = { id: sessionKey, userId, title: message.trim().substring(0, 60), messages: [], createdAt: Date.now(), updatedAt: Date.now() };

                const oaiMsgs = [{ role: 'system', content: fullSystemPrompt }];
                for (const m of (session.messages || [])) oaiMsgs.push({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content || '' });
                if (image && typeof image === 'string' && image.startsWith('data:image/')) {
                    oaiMsgs.push({ role: 'user', content: [{ type: 'text', text: message.trim() }, { type: 'image_url', image_url: { url: image } }] });
                } else {
                    oaiMsgs.push({ role: 'user', content: message.trim() });
                }

                const oaiTools = convertToolsToOpenAI(getToolDeclarations());
                let oaiFinal = '';
                const oaiToolCalls = [];
                let oaiRound = 0;
                log.info(`[Stream] OpenAI: model=${useModel}, msgs=${oaiMsgs.length}, tools=${oaiTools.length}`);

                while (oaiRound < MAX_TOOL_ROUNDS) {
                    if (aborted) break;
                    oaiRound++;
                    let stream;
                    try {
                        stream = await oaiClient.chat.completions.create({ model: useModel, messages: oaiMsgs, tools: oaiTools.length > 0 ? oaiTools : undefined, stream: true, temperature: 0.7, max_tokens: 8192 });
                    } catch (apiErr) {
                        log.error(`[Stream][OpenAI][R${oaiRound}] ${apiErr?.message}`);
                        sendEvent('error', { error: apiErr?.message || 'OpenAI API failed' }); res.end(); return;
                    }
                    let rText = '';
                    const pending = [];
                    try {
                        for await (const chunk of stream) {
                            const d = chunk.choices?.[0]?.delta;
                            if (!d) continue;
                            if (d.content) { rText += d.content; sendEvent('text-delta', { text: d.content }); }
                            if (d.tool_calls) for (const tc of d.tool_calls) {
                                if (!pending[tc.index]) pending[tc.index] = { id: '', name: '', args: '' };
                                if (tc.id) pending[tc.index].id = tc.id;
                                if (tc.function?.name) pending[tc.index].name = tc.function.name;
                                if (tc.function?.arguments) pending[tc.index].args += tc.function.arguments;
                            }
                        }
                    } catch (sErr) { log.error(`[Stream][OpenAI] ${sErr?.message}`); sendEvent('error', { error: sErr?.message || 'OpenAI stream failed' }); res.end(); return; }

                    const valid = pending.filter(t => t && t.name);
                    if (valid.length === 0) { oaiFinal = rText.trim(); if (rText) oaiMsgs.push({ role: 'assistant', content: oaiFinal }); break; }

                    oaiMsgs.push({ role: 'assistant', content: rText || null, tool_calls: valid.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) });
                    const ctx = { userId, lang: req.dashboardUser?.lang || 'en', isGroup: false, isAdmin: false, chatId: userId, isTelegramContext: false };
                    for (const tc of valid) {
                        let args = {}; try { args = JSON.parse(tc.args || '{}'); } catch {}
                        sendEvent('tool-start', { name: tc.name, args });
                        let res2; try { res2 = await executeWebToolCall(tc.name, args, ctx); } catch {}
                        if (!res2) try { res2 = await executeToolCall({ functionCall: { name: tc.name, args } }, ctx); } catch {}
                        if (!res2) res2 = { error: `Tool ${tc.name} not available.` };
                        if (res2?.displayMessage) res2.displayMessage = htmlToMarkdown(res2.displayMessage);
                        const rs = typeof res2 === 'string' ? res2 : JSON.stringify(res2)?.substring(0, 500);
                        oaiToolCalls.push({ name: tc.name, args, result: rs });
                        sendEvent('tool-result', { name: tc.name, result: rs });
                        oaiMsgs.push({ role: 'tool', tool_call_id: tc.id, content: typeof res2 === 'string' ? res2 : JSON.stringify(res2) });
                    }
                }

                session.messages = oaiMsgs.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || '') })).slice(-SESSION_MAX_MESSAGES);
                session.updatedAt = Date.now(); await saveSession(session);
                sendEvent('done', { conversationId: sessionKey, title: session.title, toolCalls: oaiToolCalls.length > 0 ? oaiToolCalls : undefined }); res.end();
                if (session.messages.length <= 2 && session.title === message.trim().substring(0, 60)) {
                    (async () => { try { const r = await oaiClient.chat.completions.create({ model: useModel, messages: [{ role: 'user', content: `Summarize in max 5 words as title. No quotes.\nUser: ${message}\nAI: ${(oaiFinal||'').substring(0,300)}` }], max_tokens: 30, temperature: 0.3 }); const t = r?.choices?.[0]?.message?.content?.trim(); if (t && t.length > 2 && t.length < 80) { session.title = t; await saveSession(session); } } catch {} })();
                }

            // ══════════ GROQ ══════════
            } else if (provider === 'groq') {
                const gKey = userApiKey || await resolveGroqKey(userId);
                if (!gKey) { sendEvent('error', { error: 'No Groq API key. Add one in AI Settings → API Keys.' }); res.end(); return; }
                const gClient = new OpenAI({ apiKey: gKey, baseURL: 'https://api.groq.com/openai/v1' });
                if (!session) session = { id: sessionKey, userId, title: message.trim().substring(0, 60), messages: [], createdAt: Date.now(), updatedAt: Date.now() };

                const gMsgs = [{ role: 'system', content: fullSystemPrompt }];
                for (const m of (session.messages || [])) gMsgs.push({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content || '' });
                gMsgs.push({ role: 'user', content: message.trim() });

                let gFinal = '';
                log.info(`[Stream] Groq: model=${useModel}, msgs=${gMsgs.length}`);
                try {
                    const stream = await gClient.chat.completions.create({ model: useModel, messages: gMsgs, stream: true, temperature: 0.7, max_tokens: 4096 });
                    for await (const chunk of stream) { const d = chunk.choices?.[0]?.delta; if (d?.content) { gFinal += d.content; sendEvent('text-delta', { text: d.content }); } }
                } catch (apiErr) { log.error(`[Stream][Groq] ${apiErr?.message}`); sendEvent('error', { error: apiErr?.message || 'Groq API failed' }); res.end(); return; }

                if (gFinal.trim()) gMsgs.push({ role: 'assistant', content: gFinal.trim() });
                session.messages = gMsgs.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content || '' })).slice(-SESSION_MAX_MESSAGES);
                session.updatedAt = Date.now(); await saveSession(session);
                sendEvent('done', { conversationId: sessionKey, title: session.title }); res.end();
                if (session.messages.length <= 2 && session.title === message.trim().substring(0, 60)) {
                    (async () => { try { const r = await gClient.chat.completions.create({ model: useModel, messages: [{ role: 'user', content: `Summarize in max 5 words as title. No quotes.\nUser: ${message}\nAI: ${(gFinal||'').substring(0,300)}` }], max_tokens: 30, temperature: 0.3 }); const t = r?.choices?.[0]?.message?.content?.trim(); if (t && t.length > 2 && t.length < 80) { session.title = t; await saveSession(session); } } catch {} })();
                }

            } else {
                sendEvent('error', { error: `Unknown provider: ${provider}` }); res.end(); return;
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
            const geminiModels = [
                { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'Best reasoning & complex tasks', icon: '🧠', tier: 'pro', provider: 'google' },
                { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Powerful multimodal & agentic', icon: '🚀', tier: 'free', provider: 'google' },
                { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Lite', desc: 'Fastest, lowest cost', icon: '💨', tier: 'free', provider: 'google' },
            ];

            // Build OpenAI models from OPENAI_MODEL_FAMILIES
            const openaiModels = Object.values(OPENAI_MODEL_FAMILIES).map(m => ({
                id: m.id,
                label: m.label,
                desc: m.description,
                icon: m.icon,
                tier: m.id === 'gpt-5.4' ? 'pro' : 'free',
                provider: 'openai',
                contextWindow: m.contextWindow,
                supportsReasoning: m.supportsReasoning || false,
            }));

            const hasOpenAiKey = userKeys.some(k =>
                (k.provider || '').toLowerCase() === 'openai' && k.apiKey
            );
            const hasServerOpenAiKey = OPENAI_API_KEYS && OPENAI_API_KEYS.length > 0;

            // Build Groq models from GROQ_MODEL_FAMILIES
            const groqModels = Object.values(GROQ_MODEL_FAMILIES).map(m => ({
                id: m.id,
                label: m.label,
                desc: m.description,
                icon: m.icon,
                tier: 'free',
                provider: 'groq',
                speed: m.speed,
                contextWindow: m.contextWindow,
            }));

            const hasGroqKey = userKeys.some(k =>
                (k.provider || '').toLowerCase() === 'groq' && k.apiKey
            );
            const hasServerGroqKey = GROQ_API_KEYS && GROQ_API_KEYS.length > 0;

            // ── Always return ALL models with `locked` flag ──
            // Frontend shows all models but disables locked ones
            const defaultGemini = GEMINI_MODEL || 'gemini-3-flash-preview';
            const defaultOpenAi = openaiModels[0]?.id || 'gpt-5.4';
            const defaultGroq = groqModels[0]?.id;

            const canGoogle = isOwner || hasPersonalKey;
            const canOpenAi = isOwner || hasOpenAiKey;
            const canGroq = isOwner || hasGroqKey;

            const tagModels = (list, canChange, defaultId, available) => list.map(m => ({
                ...m,
                locked: !available ? true : (!canChange && m.id !== defaultId),
                isDefault: m.id === defaultId,
            }));

            const models = [
                ...tagModels(geminiModels, canGoogle, defaultGemini, hasServerKey || canGoogle),
                ...tagModels(openaiModels, canOpenAi, defaultOpenAi, hasServerOpenAiKey || canOpenAi),
                ...tagModels(groqModels, canGroq, defaultGroq, hasServerGroqKey || canGroq),
            ];

            res.json({
                models,
                defaultModel: GEMINI_MODEL,
                hasPersonalKey,
                hasServerKey,
                isOwner,
                hasOpenAiKey,
                hasServerOpenAiKey,
                hasGroqKey,
                hasServerGroqKey,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /ai/keys — List user's AI keys (Google + OpenAI) ──
    router.get('/keys', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });
            const db = require('../../db');
            const keys = await db.listUserAiKeys(userId);
            const providerFilter = req.query.provider;
            const filteredKeys = keys
                .filter(k => {
                    const p = (k.provider || '').toLowerCase();
                    if (providerFilter === 'openai') return p === 'openai';
                    if (providerFilter === 'google') return ['google', 'gemini'].includes(p);
                    if (providerFilter === 'groq') return p === 'groq';
                    // No filter — return all
                    return ['google', 'gemini', 'openai', 'groq'].includes(p);
                })
                .map(k => ({
                    id: k.id || k.rowid,
                    name: k.name || k.label || (k.provider === 'openai' ? 'OpenAI' : k.provider === 'groq' ? 'Groq' : 'Google AI'),
                    provider: k.provider || 'google',
                    maskedKey: k.apiKey ? `${k.apiKey.slice(0, 6)}...${k.apiKey.slice(-4)}` : '***',
                    createdAt: k.createdAt,
                }));
            res.json({ keys: filteredKeys });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /ai/keys — Add a Google AI or OpenAI key ────────
    router.post('/keys', async (req, res) => {
        try {
            const userId = req.dashboardUser?.userId;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });
            const { apiKey, name, provider: reqProvider } = req.body;
            if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
                return res.status(400).json({ error: 'Invalid API key' });
            }

            const provider = (reqProvider || '').toLowerCase();
            const normalizedProvider = provider === 'openai' ? 'openai' : provider === 'groq' ? 'groq' : 'google';

            // Quick validation based on provider
            if (normalizedProvider === 'openai') {
                try {
                    const axios = require('axios');
                    const resp = await axios.get('https://api.openai.com/v1/models', {
                        headers: { Authorization: `Bearer ${apiKey.trim()}` },
                        timeout: 8000,
                    });
                    if (!resp.data?.data?.length) throw new Error('No models returned');
                } catch (testErr) {
                    const msg = testErr?.response?.status === 401 ? 'Invalid API key'
                        : testErr?.response?.status === 429 ? 'Rate limited, but key is valid'
                        : `Validation failed: ${testErr?.message?.substring(0, 100) || 'unknown error'}`;
                    if (testErr?.response?.status === 429) {
                        // 429 means the key is valid but rate limited — allow adding
                    } else {
                        return res.status(400).json({ error: msg });
                    }
                }
            } else if (normalizedProvider === 'groq') {
                try {
                    const axios = require('axios');
                    const resp = await axios.get('https://api.groq.com/openai/v1/models', {
                        headers: { Authorization: `Bearer ${apiKey.trim()}` },
                        timeout: 8000,
                    });
                    if (!resp.data?.data?.length) throw new Error('No models returned');
                } catch (testErr) {
                    const msg = testErr?.response?.status === 401 ? 'Invalid API key'
                        : testErr?.response?.status === 429 ? 'Rate limited, but key is valid'
                        : `Validation failed: ${testErr?.message?.substring(0, 100) || 'unknown error'}`;
                    if (testErr?.response?.status === 429) {
                        // 429 = valid key, rate limited — allow
                    } else {
                        return res.status(400).json({ error: msg });
                    }
                }
            } else {
                try {
                    const testClient = new GoogleGenAI({ apiKey: apiKey.trim() });
                    await testClient.models.get({ model: 'gemini-3-flash-preview' });
                } catch (testErr) {
                    return res.status(400).json({ error: `Invalid key: ${testErr?.message?.substring(0, 100) || 'validation failed'}` });
                }
            }

            const db = require('../../db');
            const defaultName = normalizedProvider === 'openai' ? 'OpenAI' : normalizedProvider === 'groq' ? 'Groq' : 'Google AI';
            const result = await db.addUserAiKey(userId, name || defaultName, apiKey.trim(), normalizedProvider);
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
            const { keyId, provider: reqProvider } = req.body;
            const db = require('../../db');
            if (keyId) {
                await db.deleteUserAiKey(userId, keyId);
            } else {
                const provider = ['openai', 'groq'].includes((reqProvider || '').toLowerCase()) ? (reqProvider || '').toLowerCase() : 'google';
                await db.deleteUserAiKeys(userId, provider);
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

        const ALLOWED = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', ...Object.keys(OPENAI_MODEL_FAMILIES), ...Object.keys(GROQ_MODEL_FAMILIES)];
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

    // ══════════════════════════════════════════════════════════════
    // AI AUTO-TRADE AGENT (BETA)
    // ══════════════════════════════════════════════════════════════
    const autoTrading = require('../features/autoTrading');

    // POST /ai/agent/enable — Enable AI Trading Agent
    router.post('/ai/agent/enable', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const result = await autoTrading.enableAgent(userId, req.body || {});
            res.json(result);
        } catch (err) {
            log.error('[Agent] Enable error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /ai/agent/disable — Disable AI Trading Agent
    router.post('/ai/agent/disable', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const result = await autoTrading.disableAgent(userId);
            res.json(result);
        } catch (err) {
            log.error('[Agent] Disable error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /ai/agent/pause — Pause/Resume AI Trading Agent
    router.post('/ai/agent/pause', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const pause = req.body?.pause !== false;
            const result = await autoTrading.pauseAgent(userId, pause);
            res.json(result);
        } catch (err) {
            log.error('[Agent] Pause error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /ai/agent/status — Get agent status with PnL
    router.get('/ai/agent/status', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const status = await autoTrading.getAgentStatus(userId);
            res.json(status);
        } catch (err) {
            log.error('[Agent] Status error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /ai/agent/config — Update agent config
    router.put('/ai/agent/config', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const result = await autoTrading.updateAgentConfig(userId, req.body || {});
            res.json(result);
        } catch (err) {
            log.error('[Agent] Config update error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /ai/agent/plans — Get trade plans (optional ?status=pending)
    router.get('/ai/agent/plans', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const ALLOWED_STATUSES = ['pending', 'approved', 'executed', 'rejected', 'failed', 'closed'];
            const status = ALLOWED_STATUSES.includes(req.query.status) ? req.query.status : null;
            const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);
            const plans = await autoTrading.getTradePlans(userId, status, limit);
            res.json({ plans });
        } catch (err) {
            log.error('[Agent] Plans error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /ai/agent/plans/:id/approve — Approve a trade plan
    router.post('/ai/agent/plans/:id/approve', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const planId = Number(req.params.id);
            if (!planId || isNaN(planId)) return res.status(400).json({ error: 'Invalid plan ID' });
            const modifiedAmount = req.body?.amount ? Number(req.body.amount) : null;
            if (modifiedAmount !== null && (isNaN(modifiedAmount) || modifiedAmount <= 0)) return res.status(400).json({ error: 'Invalid amount' });
            const result = await autoTrading.approvePlan(userId, planId, modifiedAmount);
            res.json(result);
        } catch (err) {
            log.error('[Agent] Approve error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /ai/agent/plans/:id/reject — Reject a trade plan
    router.post('/ai/agent/plans/:id/reject', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const planId = Number(req.params.id);
            if (!planId || isNaN(planId)) return res.status(400).json({ error: 'Invalid plan ID' });
            const reason = req.body?.reason || '';
            const result = await autoTrading.rejectPlan(userId, planId, reason);
            res.json(result);
        } catch (err) {
            log.error('[Agent] Reject error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Position Management (Triple Barrier Engine) ──
    const tradeEngine = require('../features/tradeExecutionEngine');

    // GET /ai/agent/positions — Get active and closed positions
    router.get('/ai/agent/positions', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const positions = await tradeEngine.getActivePositions(userId);
            res.json({ positions });
        } catch (err) {
            log.error('[Agent] Positions error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /ai/agent/positions/:id/close — Manually close a position
    router.post('/ai/agent/positions/:id/close', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const posId = Number(req.params.id);
            if (!posId || isNaN(posId)) return res.status(400).json({ error: 'Invalid position ID' });
            const result = await tradeEngine.manualClosePosition(userId, posId);
            res.json(result);
        } catch (err) {
            log.error('[Agent] Close position error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Wallet Selection for AI Trader ──
    router.get('/ai/agent/wallets', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { dbAll } = require('../../db/core');
            const wallets = await dbAll('SELECT id, address, chainIndex, isDefault FROM user_trading_wallets WHERE userId = ? ORDER BY isDefault DESC, id ASC', [userId]) || [];
            res.json({ wallets });
        } catch (err) {
            res.json({ wallets: [] });
        }
    });

    // #11 CSV export endpoint
    router.get('/ai/agent/export', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const result = await autoTrading.exportTradeHistory(userId);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=trade_history.csv');
            res.send(result.csv || '');
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Smart Order Execution (VWAP + DCA) ──
    const smartExecutor = require('../features/smartOrderExecutor');

    // POST /ai/agent/execute/vwap — Start VWAP execution
    router.post('/ai/agent/execute/vwap', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { planId, totalAmountUsd, chunks, intervalMs } = req.body || {};
            if (!planId) return res.status(400).json({ error: 'planId required' });
            const safeChunks = Math.min(Math.max(2, Number(chunks) || 3), 20);
            const safeInterval = Math.min(Math.max(10000, Number(intervalMs) || 30000), 300000);
            const { dbGet } = require('../../db/core');
            const plan = await dbGet('SELECT * FROM auto_trading_plans WHERE id = ? AND userId = ?', [planId, userId]);
            if (!plan) return res.status(404).json({ error: 'Plan not found' });
            const result = smartExecutor.startVwapExecution({
                userId, planId, chainIndex: plan.chainIndex, tokenAddress: plan.tokenAddress,
                tokenSymbol: plan.tokenSymbol, totalAmountUsd: totalAmountUsd || plan.suggestedAmountUsd,
                chunks: safeChunks, intervalMs: safeInterval, action: plan.action || 'buy'
            });
            res.json(result);
        } catch (err) {
            log.error('[Agent] VWAP start error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /ai/agent/execute/dca — Start DCA execution
    router.post('/ai/agent/execute/dca', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { planId, levels, weights } = req.body || {};
            if (!planId) return res.status(400).json({ error: 'planId required' });
            const { dbGet } = require('../../db/core');
            const plan = await dbGet('SELECT * FROM auto_trading_plans WHERE id = ? AND userId = ?', [planId, userId]);
            if (!plan) return res.status(404).json({ error: 'Plan not found' });
            const result = smartExecutor.startDcaExecution({
                userId, planId, chainIndex: plan.chainIndex, tokenAddress: plan.tokenAddress,
                tokenSymbol: plan.tokenSymbol, entryPrice: plan.tokenPrice || 0,
                totalAmountUsd: plan.modifiedAmountUsd || plan.suggestedAmountUsd,
                levels: levels || [0, -3, -6, -10], weights: weights || [0.25, 0.25, 0.25, 0.25]
            });
            res.json(result);
        } catch (err) {
            log.error('[Agent] DCA start error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /ai/agent/executions — List active smart executions
    router.get('/ai/agent/executions', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        res.json({ executions: smartExecutor.listActiveExecutions(userId) });
    });

    // ── Technical Signals Analysis ──
    // GET /ai/agent/signals/:chainIndex/:tokenAddress — Get tech analysis for a token
    router.get('/ai/agent/signals/:chainIndex/:tokenAddress', async (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Auth required' });
        try {
            const { chainIndex, tokenAddress } = req.params;
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress) && !/^[a-zA-Z0-9]{32,44}$/.test(tokenAddress)) {
                return res.status(400).json({ error: 'Invalid token address format' });
            }
            const techSignals = require('../features/technicalSignals');
            const analysis = await techSignals.analyzeToken(chainIndex, tokenAddress, req.query.bar || '1H');
            res.json(analysis);
        } catch (err) {
            log.error('[Agent] Signals error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createChatRoutes };
