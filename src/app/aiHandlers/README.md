# AI Handlers Modules

Modular architecture for AI command handlers.

## Directory Structure

```
aiHandlers/
├── index.js              # Entry point wrapper
├── sharedState.js        # Shared Maps/caches
├── personas.js           # AI Personas definitions
├── utils.js              # Utility functions
├── sessions.js           # User sessions management
├── functionDeclarations.js  # Tool schemas for function calling
└── gameFunctions.js      # Game implementations
```

## Usage

```javascript
// Import the main factory (backward compatible)
const { createAiHandlers } = require('./aiHandlers');

// Or import specific modules
const { AI_PERSONAS } = require('./aiHandlers/personas');
const { formatStatus } = require('../utils/emojiLibrary');
```

## Modules

| Module | Description |
|--------|-------------|
| `sharedState` | Maps and caches shared across all AI modules |
| `personas` | AI persona definitions and management |
| `utils` | Helper functions (JSON parse, emoji decoration) |
| `sessions` | User conversation history and image context |
| `functionDeclarations` | Gemini function calling tool schemas |
| `gameFunctions` | Game implementations (dice, quiz, RPS...) |
