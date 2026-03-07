# Memory Skill

**Name**: `memory`

## Description

Conversation memory and user preferences. Allows the AI to remember user preferences across messages and maintain conversation context.

## Tools (3)

| Tool | Purpose |
|------|---------|
| `remember_preference` | Save a user preference (preferred chain, favorite token, risk level, etc.) |
| `recall_preference` | Recall a saved preference or list all preferences |
| `get_conversation_summary` | Get recent conversation history for context |

## Storage

- In-memory per-user store (up to 20 messages history, 50 preference keys)
- 24-hour TTL with automatic cleanup
- No persistence across bot restarts (by design — lightweight)
