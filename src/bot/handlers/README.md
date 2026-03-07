# Bot Event Handlers

This directory contains handlers for bot events (messages, callbacks, etc.).

## 📁 Files

### ⚠️ **`callbacks.js`** (4513 lines) - UNUSED
This file exists but is **NOT USED**. The actual callback handlers are in:
- `src/app/helpExecutors.js` - Help menu button callbacks
- `src/app/randomCallbacks.js` - Random game callbacks
- Other feature-specific callback files

**This file can be safely deleted** or kept as reference.

### **`commands.js`** - Command Handlers
Additional command registrations (help, welcome, random, etc.).

**Note**: Some commands are also registered in `src/app/coreCommands.js`. There's duplication that should be consolidated.

### **`messages.js`** - Message Event Handlers
Handles incoming text messages and message events.

## 🔍 Important Notes

1. **Callback Handlers**: Despite the name, `callbacks.js` is NOT used. Check `src/app/helpExecutors.js` instead.

2. **Command Duplication**: Commands are registered in multiple places:
   - `src/app/coreCommands.js`
   - `src/bot/handlers/commands.js`
   
   The last one to register wins.

3. **Thread Support**: All handlers use thread-aware functions from `src/app/utils/telegram.js`

## 🚀 Quick Reference

**Looking for help button handling?** → `src/app/helpExecutors.js` (NOT callbacks.js)  
**Looking for message handling?** → `messages.js`  
**Looking for command registration?** → `commands.js` + `src/app/coreCommands.js`
