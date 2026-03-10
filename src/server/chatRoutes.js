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
const { buildAIAPrompt } = require('../config/prompts');
const { t } = require('../core/i18n');

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
function getGeminiClient() {
    if (!GEMINI_API_KEYS || GEMINI_API_KEYS.length === 0) return null;
    const idx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
    return new GoogleGenAI({ apiKey: GEMINI_API_KEYS[idx] });
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
    // ONCHAIN_TOOLS is an array of { functionDeclarations: [...] }
    // We flatten them into a single tools array for Gemini
    return ONCHAIN_TOOLS;
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

        const client = getGeminiClient();
        if (!client) {
            return res.status(503).json({ error: 'No AI API keys configured. Add GEMINI_API_KEYS to .env' });
        }

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

            while (round < MAX_TOOL_ROUNDS) {
                round++;

                const response = await client.models.generateContent({
                    model,
                    contents: currentHistory,
                    systemInstruction: { parts: [{ text: session.systemInstruction }] },
                    tools: getToolDeclarations(),
                    config: {
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                    }
                });

                const candidate = response?.candidates?.[0];
                if (!candidate?.content?.parts) {
                    finalResponse = 'Sorry, I could not generate a response. Please try again.';
                    break;
                }

                const parts = candidate.content.parts;
                const textParts = parts.filter(p => p.text);
                const functionCallParts = parts.filter(p => p.functionCall);

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
                        result = await executeToolCall(fc, context);
                        if (result === undefined) {
                            result = { error: `Unknown tool: ${fc.name}` };
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
