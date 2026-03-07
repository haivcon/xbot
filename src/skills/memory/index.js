/**
 * Memory Skill — Conversation Context & User Preferences
 * 
 * Provides persistent short-term memory for AI conversations,
 * allowing the agent to remember user preferences, recent queries,
 * and conversation context across messages.
 */

// ═══════════════════════════════════════════════════════
// In-Memory Conversation Store (per user)
// ═══════════════════════════════════════════════════════

/** @type {Map<string, ConversationMemory>} userId -> memory */
const memoryStore = new Map();
const MAX_HISTORY = 20;
const MAX_NOTES = 50;
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @typedef {Object} ConversationMemory
 * @property {Array<{role: string, content: string, timestamp: number}>} history
 * @property {Map<string, string>} notes - Key-value user preferences
 * @property {number} lastAccess
 */

function getMemory(userId) {
    const key = String(userId);
    let mem = memoryStore.get(key);
    if (!mem) {
        mem = { history: [], notes: new Map(), lastAccess: Date.now() };
        memoryStore.set(key, mem);
    }
    mem.lastAccess = Date.now();
    return mem;
}

function addToHistory(userId, role, content) {
    const mem = getMemory(userId);
    mem.history.push({ role, content: String(content).slice(0, 500), timestamp: Date.now() });
    if (mem.history.length > MAX_HISTORY) {
        mem.history = mem.history.slice(-MAX_HISTORY);
    }
}

function getHistory(userId, count = 10) {
    const mem = getMemory(userId);
    return mem.history.slice(-count);
}

function setNote(userId, key, value) {
    const mem = getMemory(userId);
    if (mem.notes.size >= MAX_NOTES && !mem.notes.has(key)) {
        // Remove oldest note
        const firstKey = mem.notes.keys().next().value;
        mem.notes.delete(firstKey);
    }
    mem.notes.set(key, String(value).slice(0, 200));
}

function getNote(userId, key) {
    return getMemory(userId).notes.get(key) || null;
}

function getAllNotes(userId) {
    return Object.fromEntries(getMemory(userId).notes);
}

function clearMemory(userId) {
    memoryStore.delete(String(userId));
}

// Periodic cleanup of stale memories
setInterval(() => {
    const now = Date.now();
    for (const [key, mem] of memoryStore) {
        if (now - mem.lastAccess > MEMORY_TTL_MS) {
            memoryStore.delete(key);
        }
    }
}, 3600000); // Every hour

// ═══════════════════════════════════════════════════════
// AI Tools
// ═══════════════════════════════════════════════════════

const MEMORY_TOOLS = [{
    functionDeclarations: [
        {
            name: 'remember_preference',
            description: 'Remember a user preference or important note for future conversations. Use this when the user tells you their preferred chain, favorite tokens, risk tolerance, language, or any other preference.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Preference key (e.g., "preferred_chain", "favorite_token", "risk_level", "language")' },
                    value: { type: 'string', description: 'The value to remember' }
                },
                required: ['key', 'value']
            }
        },
        {
            name: 'recall_preference',
            description: 'Recall a previously saved user preference or note.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'The preference key to recall. Use "all" to retrieve all saved preferences.' }
                },
                required: ['key']
            }
        },
        {
            name: 'get_conversation_summary',
            description: 'Get a summary of the recent conversation history with this user. Useful for maintaining context.',
            parameters: {
                type: 'object',
                properties: {
                    count: { type: 'number', description: 'Number of recent messages to retrieve (default: 5, max: 20)' }
                }
            }
        }
    ]
}];

// ═══════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════

const memoryHandlers = {
    async remember_preference(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ Cannot save preference: unknown user.';

        setNote(userId, args.key, args.value);
        const total = Object.keys(getAllNotes(userId)).length;
        return `✅ Remembered: "${args.key}" = "${args.value}"\n📝 Total saved preferences: ${total}`;
    },

    async recall_preference(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ Cannot recall: unknown user.';

        if (args.key === 'all') {
            const notes = getAllNotes(userId);
            const keys = Object.keys(notes);
            if (keys.length === 0) {
                return '📝 No preferences saved yet.\n\nTip: Tell me things like "I prefer Solana chain" or "My risk tolerance is low" and I\'ll remember them.';
            }
            const lines = keys.map(k => `• ${k}: ${notes[k]}`);
            return `📝 User Preferences (${keys.length}):\n${lines.join('\n')}`;
        }

        const value = getNote(userId, args.key);
        return value
            ? `📝 ${args.key}: ${value}`
            : `❌ No preference saved for "${args.key}"`;
    },

    async get_conversation_summary(args, context) {
        const userId = context?.userId;
        if (!userId) return '❌ Cannot recall: unknown user.';

        const count = Math.min(Math.max(args?.count || 5, 1), MAX_HISTORY);
        const history = getHistory(userId, count);

        if (history.length === 0) {
            return '📋 No conversation history yet.';
        }

        const lines = history.map(h => {
            const time = new Date(h.timestamp).toLocaleTimeString();
            return `[${time}] ${h.role}: ${h.content.slice(0, 100)}${h.content.length > 100 ? '...' : ''}`;
        });
        return `📋 Recent Conversation (${history.length} messages):\n${lines.join('\n')}`;
    }
};

// ═══════════════════════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════════════════════

const MEMORY_SYSTEM_PROMPT = `
MEMORY & CONTEXT:
You have memory capabilities. You can:
- Remember user preferences (preferred chain, favorite tokens, risk level, etc.)
- Recall previously saved preferences to personalize responses
- Access recent conversation history for context

IMPORTANT: Proactively use remember_preference when users mention preferences.
For example, if a user says "I mostly trade on Solana", remember "preferred_chain" = "Solana".
When giving token advice, recall their risk_level preference first.`;

module.exports = {
    name: 'memory',
    description: 'Conversation memory — remembers user preferences and conversation context',
    enabled: true,
    tools: MEMORY_TOOLS,
    handlers: memoryHandlers,
    systemPrompt: MEMORY_SYSTEM_PROMPT,

    // Expose for external integration
    addToHistory,
    getHistory,
    setNote,
    getNote,
    getAllNotes,
    clearMemory,
    memoryStore
};
