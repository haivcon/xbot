/**
 * Input Validation — Zod schemas + Express middleware
 */
const { z } = require('zod');

// ─── Schemas ───
const schemas = {
    chatMessage: z.object({
        message: z.string().min(1, 'Message is required').max(10000, 'Message too long (max 10,000 chars)'),
        conversationId: z.string().max(200).optional().nullable(),
        model: z.string().max(100).optional().nullable(),
        image: z.string().max(5_000_000).optional().nullable(), // base64 image up to ~3.75MB
    }),

    conversationId: z.object({
        conversationId: z.string().min(1).max(200),
    }),

    walletAddress: z.object({
        walletAddress: z.string().min(10).max(128),
    }),

    generateToken: z.object({
        walletAddress: z.string().min(10, 'walletAddress is required').max(128),
    }),

    apiKeyUpdate: z.object({
        key: z.string().min(10, 'API key too short').max(256, 'API key too long'),
    }),

    renameConversation: z.object({
        title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
    }),

    pagination: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    }),

    scheduleReport: z.object({
        type: z.enum(['portfolio', 'signals', 'price']),
        frequency: z.enum(['daily', 'weekly']),
        time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM format').optional(),
    }),

    userPreference: z.object({
        key: z.string().min(1).max(100),
        value: z.string().max(1000),
    }),
};

// ─── Middleware factory ───
function validate(schemaName, source = 'body') {
    const schema = schemas[schemaName];
    if (!schema) throw new Error(`Unknown schema: ${schemaName}`);

    return (req, res, next) => {
        const data = source === 'body' ? req.body
            : source === 'params' ? req.params
            : source === 'query' ? req.query
            : req.body;

        const result = schema.safeParse(data);
        if (!result.success) {
            const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            return res.status(400).json({ error: 'Validation failed', details: errors });
        }

        // Attach validated data
        req.validated = result.data;
        next();
    };
}

module.exports = { schemas, validate };
