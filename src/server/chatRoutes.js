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
const { GEMINI_API_KEYS, GEMINI_MODEL } = require('../config/env');
const { ONCHAIN_TOOLS, executeToolCall, buildSystemInstruction } = require('../features/ai/ai-onchain');
const { WEB_TOOL_DECLARATIONS, executeWebToolCall } = require('./webToolExecutor');
const { buildAIAPrompt } = require('../config/prompts');
const { t } = require('../core/i18n');

// Debug: verify tools loaded correctly
log.info(`ONCHAIN_TOOLS loaded: ${Array.isArray(ONCHAIN_TOOLS) ? ONCHAIN_TOOLS.length + ' tool groups' : 'FAILED'}, total declarations: ${Array.isArray(ONCHAIN_TOOLS) ? ONCHAIN_TOOLS.reduce((sum, g) => sum + (g.functionDeclarations?.length || 0), 0) : 0}`);

// ── In-memory session store ──────────────────────────────
const chatSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;   // 30 min
const SESSION_MAX_MESSAGES = 40;
const MAX_TOOL_ROUNDS = 8;            // prevent infinite loops

// Cleanup stale sessions every 10 min
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of chatSessions) {
        if (now - session.updatedAt > SESSION_TTL) chatSessions.delete(key);
    }
}, 10 * 60 * 1000);

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

// ── Build tool declarations for Gemini ───────────────────
function getToolDeclarations() {
    // Flatten ONCHAIN_TOOLS declarations and merge with WEB_TOOL_DECLARATIONS
    const onchainDecls = [];
    for (const toolObj of ONCHAIN_TOOLS) {
        if (toolObj?.functionDeclarations) onchainDecls.push(...toolObj.functionDeclarations);
    }
    // Deduplicate by name (web tools take priority)
    const seen = new Set();
    const merged = [];
    for (const decl of WEB_TOOL_DECLARATIONS) {
        if (decl?.name && !seen.has(decl.name)) { seen.add(decl.name); merged.push(decl); }
    }
    for (const decl of onchainDecls) {
        if (decl?.name && !seen.has(decl.name)) { seen.add(decl.name); merged.push(decl); }
    }
    log.info(`[Tools] Merged: ${merged.length} declarations (${WEB_TOOL_DECLARATIONS.length} web + ${onchainDecls.length} onchain, deduped)`);
    return [{ functionDeclarations: merged }];
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
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const apiKey = await resolveGeminiKey(userId);
        if (!apiKey) {
            return res.status(503).json({ error: 'No AI API keys configured. Add GEMINI_API_KEYS to .env or add a key via /api command in Telegram.' });
        }
        const client = getGeminiClient(apiKey);

        try {
            // Build or retrieve session
            const sessionKey = conversationId || `web_${userId}_${Date.now()}`;
            let session = chatSessions.get(sessionKey);
            if (!session) {
                // Build system prompt with user's wallet context
                const systemInstruction = await buildSystemInstruction(userId);
                const aiaPrompt = buildAIAPrompt({
                    lang: req.dashboardUser?.lang || 'en',
                    isGroup: false,
                    isAdmin: false,
                    botUsername: process.env.BOT_USERNAME || 'xbot',
                    userId
                });

                session = {
                    history: [],
                    systemInstruction: systemInstruction + '\n\n' + aiaPrompt +
                        '\n\nIMPORTANT: You are now responding via a WEB DASHBOARD (not Telegram). ' +
                        'Use Markdown formatting instead of HTML. Do NOT use Telegram-specific formatting (<b>, <i>, <code>). ' +
                        'Use **bold**, *italic*, `code` instead. Do NOT mention Telegram-specific features like /commands. ' +
                        'Keep responses conversational and helpful.',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                chatSessions.set(sessionKey, session);
            }

            // Add user message to history
            session.history.push({ role: 'user', parts: [{ text: message.trim() }] });

            // Trim old messages
            while (session.history.length > SESSION_MAX_MESSAGES) {
                session.history.shift();
            }

            // Call Gemini with function calling
            const model = GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';
            const toolCalls = [];
            let finalResponse = '';
            let currentHistory = [...session.history];
            let round = 0;
            const mergedTools = getToolDeclarations();

            while (round < MAX_TOOL_ROUNDS) {
                round++;

                log.info(`[Round ${round}] Calling Gemini model=${model}, tools=${mergedTools[0]?.functionDeclarations?.length || 0} total, history=${currentHistory.length} msgs`);
                const response = await client.models.generateContent({
                    model,
                    contents: currentHistory,
                    systemInstruction: session.systemInstruction,
                    config: {
                        tools: mergedTools,
                        temperature: 0.7,
                        maxOutputTokens: 8192,
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
                    session.history.push({ role: 'model', parts: textParts.length > 0 ? textParts : [{ text: finalResponse }] });
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
                            session.history = [];
                            currentHistory = [{ role: 'user', parts: [{ text: message.trim() }] }];
                        }
                    } catch (err) {
                        log.error(`WebChat tool error ${fc.name}: ${err.message}`);
                        result = { error: err.message };
                    }

                    // Convert result to string if needed
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                    toolCalls.push({ name: fc.name, args: fc.args, result: resultStr.substring(0, 2000) });

                    functionResponseParts.push({
                        functionResponse: {
                            name: fc.name,
                            response: { result: resultStr }
                        }
                    });
                }

                currentHistory.push({ role: 'user', parts: functionResponseParts });
            }

            // Save updated history
            session.history = currentHistory.slice(-SESSION_MAX_MESSAGES);
            session.updatedAt = Date.now();

            res.json({
                reply: finalResponse || 'No response generated.',
                conversationId: sessionKey,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined
            });
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
    router.get('/history', (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const conversations = [];
        for (const [key, session] of chatSessions) {
            if (key.startsWith(`web_${userId}_`)) {
                const messages = session.history.filter(h => h.role === 'user' || h.role === 'model');
                const firstUserMsg = messages.find(m => m.role === 'user');
                conversations.push({
                    conversationId: key,
                    title: firstUserMsg?.parts?.[0]?.text?.substring(0, 60) || 'New Chat',
                    messageCount: messages.length,
                    createdAt: session.createdAt,
                    updatedAt: session.updatedAt
                });
            }
        }

        conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        res.json({ conversations });
    });

    /**
     * GET /history/:conversationId
     * Returns full message history for a conversation
     */
    router.get('/history/:conversationId', (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        const { conversationId } = req.params;

        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        if (!conversationId.startsWith(`web_${userId}_`)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const session = chatSessions.get(conversationId);
        if (!session) return res.status(404).json({ error: 'Conversation not found' });

        const messages = session.history
            .filter(h => h.role === 'user' || h.role === 'model')
            .map(h => ({
                role: h.role === 'model' ? 'assistant' : 'user',
                content: h.parts?.map(p => p.text).filter(Boolean).join('') || '',
                timestamp: session.updatedAt
            }));

        res.json({ conversationId, messages });
    });

    /**
     * DELETE /history/:conversationId
     * Clear a conversation
     */
    router.delete('/history/:conversationId', (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        const { conversationId } = req.params;

        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        if (!conversationId.startsWith(`web_${userId}_`)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        chatSessions.delete(conversationId);
        res.json({ ok: true });
    });

    /**
     * DELETE /history
     * Clear all conversations for the user
     */
    router.delete('/history', (req, res) => {
        const userId = req.dashboardUser?.userId?.toString();
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        for (const key of chatSessions.keys()) {
            if (key.startsWith(`web_${userId}_`)) chatSessions.delete(key);
        }
        res.json({ ok: true });
    });

    return router;
}

module.exports = { createChatRoutes };
