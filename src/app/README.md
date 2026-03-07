# src/app Directory

This directory contains **application-level business logic** - commands, handlers, and feature implementations.

## 📁 Directory Contents (30 files)

### Core Commands & Handlers
- **`coreCommands.js`** - Basic commands (help, start, donate, language, etc.)
- **`helpExecutors.js`** - ⭐ Callback handlers for help menu buttons (ACTIVE)

### Random Games
- **`random.js`** - Main game logic
- **`randomCommands.js`** - Command handlers
- **`randomCallbacks.js`** - Callback handlers

### Wallet System
- **`walletFeatures.js`** - Core wallet functionality
- **`walletCommandHandlers.js`** - Wallet commands
- **`walletTokenActions.js`** - Token operations
- `walletOverview.js`, `walletUi.js`, `walletInline.js`

### Administration
- **`adminHandlers.js`** - Admin operations
- `adminCommands.js`, `moderationCommands.js`
- **`owner.js`** - Owner-specific features

### AI & Integrations
- **`aiHandlers.js`** - AI chat handlers
- **`aiApiHandlers.js`** - AI API management

### Other Features
- `accessControl.js` - Permissions
- `language.js`, `languageHandlers.js` - i18n
- `donateHandlers.js` - Donations
- `startHandlers.js` - Start command
- `tokenFlow.js`, `txhashFlow.js` - Blockchain
- `rmchat.js`, `rmchatCommands.js` - Cleanup
- `utilityCommands.js` - Utilities
- `telegramDebug.js` - Debugging

### Subdirectories
- **`utils/`** - App-specific utilities
- **`telegram/`** - Telegram utilities
- **`moderation/`** - Moderation features

## 🔍 Finding Things

**"Where's the random command?"** → `randomCommands.js`  
**"Where's help button handling?"** → `helpExecutors.js`  
**"Where's wallet logic?"** → `walletFeatures.js`

## 📝 Notes

⚠️ This directory has grown to 30 files without clear organization. Consider grouping by feature in the future (e.g., `random/`, `wallet/`, `admin/`).
