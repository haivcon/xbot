# XBot — Complete Architecture Reference

> **Last Updated**: 2026-03-05 | **Total Source Files**: ~150+ | **Languages**: 6 (en, vi, id, ko, ru, zh)

---

## Table of Contents

1. [Root Files](#root-files)
2. [src/core/ — System Core](#srccore--system-core)
3. [src/config/ — Configuration](#srcconfig--configuration)
4. [src/features/ — Feature Modules](#srcfeatures--feature-modules)
5. [src/app/ — Business Logic (Main)](#srcapp--business-logic-main)
6. [src/commands/ — Slash Commands](#srccommands--slash-commands)
7. [src/handlers/ — Event Handlers (New)](#srchandlers--event-handlers-new)
8. [src/bot/handlers/ — Event Handlers (Legacy)](#srcbothandlers--event-handlers-legacy)
9. [src/services/ — External API Services](#srcservices--external-api-services)
10. [src/utils/ — Shared Utilities](#srcutils--shared-utilities)
11. [src/callbacks/ — Callback Routing](#srccallbacks--callback-routing)
12. [src/server/ — HTTP API](#srcserver--http-api)
13. [db/ — Database Layer](#db--database-layer)
14. [data/ — Static Data Files](#data--static-data-files)
15. [locales/ — Internationalization](#locales--internationalization)
16. [assets/ — Media Assets](#assets--media-assets)
17. [scripts/ — Build & Utility Scripts](#scripts--build--utility-scripts)
18. [🗑️ Redundant Files — Safe to Delete](#️-redundant-files--safe-to-delete)

---

## Root Files

| File | Size | Purpose |
|------|------|---------|
| `index.js` | 329KB | **Main entry point**. Initializes bot, registers all handlers, wires dependency injection. Extremely large — legacy monolith being gradually refactored into `src/`. |
| `.env` | 1KB | Environment variables: `TELEGRAM_BOT_TOKEN`, `OWNER_ID`, API keys (Gemini, Groq, OpenAI, OKX), database paths, feature flags |
| `package.json` | 1KB | NPM dependencies: `node-telegram-bot-api`, `@google/genai`, `ethers`, `axios`, `better-sqlite3`, `sqlite3`, `uuid` |
| `db.js` | 161B | **Proxy** — re-exports `db/index.js` for backward compatibility with old `require('./db')` imports |
| `i18n.js` | 2KB | **Root i18n module** — loads locale JSON files, provides `t_()` translation function and `normalizeLanguageCode()` |
| `.eslintrc.js` | 1KB | ESLint configuration (Node.js environment, single quotes, 4-space indent) |
| `.gitignore` | 116B | Ignores `node_modules/`, `.env`, `*.db`, temp files |
| `gemini.md` | 14KB | Gemini model documentation reference (for development) |

---

## src/core/ — System Core

Core infrastructure that the entire bot depends on.

| File | Size | Purpose |
|------|------|---------|
| `bot.js` | 3KB | Creates and exports the singleton `TelegramBot` instance with polling config. All modules import bot from here. |
| `state.js` | 8KB | In-memory state management: AI provider sessions, disabled API key tracking, pending voice commands, user persona preferences, image context, token usage maps |
| `i18n.js` | 348B | Re-exports `getLang()` and `t()` from root `i18n.js` for use within `src/` modules |
| `commandRegistry.js` | 12KB | Central registry of all bot commands. Maps command names to handlers, supports dynamic registration, prefix matching, alias resolution |
| `commandLoader.js` | 5KB | Loads command modules from `src/commands/` directory, registers them with the registry |
| `commandRouter.js` | 9KB | Routes incoming messages to correct command handler. Handles command parsing, argument extraction, permission checks |
| `jobQueue.js` | 7KB | Async job queue for background tasks: scheduled posts, price alert checks, check-in reminders. Uses `setTimeout`-based scheduling |
| `sanitize.js` | 322B | Sanitizes sensitive data (API keys) from error messages/logs |
| `userInputState.js` | 10KB | Manages multi-step user input flows (e.g. wallet import wizard, swap confirmation). Tracks pending inputs per user/chat |
| `api.js` | 1KB | Minimal HTTP API bootstrap (not main bot functionality) |

---

## src/config/ — Configuration

| File | Size | Purpose |
|------|------|---------|
| `env.js` | 22KB | **Master config loader**. Reads all `.env` variables with defaults. Exports: `TELEGRAM_TOKEN`, `OWNER_IDS`, `GEMINI_API_KEYS` (array), `GROQ_API_KEYS` (array), `OPENAI_API_KEYS` (array), `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`, `AI_SERVER_KEY_DAILY_LIMIT`, chain configs, feature flags |
| `index.js` | 136B | Re-exports `env.js` |

---

## src/features/ — Feature Modules

Self-contained feature implementations with clear responsibilities.

### src/features/ai/ — AI Engine (6 files)

| File | Size | Purpose |
|------|------|---------|
| `ai-onchain.js` | 33KB | **AI Function Calling layer**. Defines 17 Gemini tools (token price, search, swap, wallet, weather, candles, etc.), tool handlers, result formatters, and system prompt for the OnchainOS-aware AI agent |
| `gemini.js` | 49KB | Gemini AI provider: multi-key rotation, text/audio/image completion, Function Calling multi-turn loop, Groq provider, OpenAI provider, quota tracking |
| `clients.js` | 9KB | API client factory: creates/caches Gemini, Groq, OpenAI clients. Manages key rotation, disabled key tracking |
| `tts.js` | 8KB | Text-to-Speech via Gemini TTS API. Voice selection, language detection, audio buffer generation |
| `utils.js` | 4KB | AI utilities: detect image action (generate/edit/describe), quota/rate-limit error detection, API key expiry checks |
| `index.js` | 5KB | Re-exports AI features: `normalizeAiProvider()`, `buildAiProviderMeta()`, `purgeAiProviderSelections()`, provider key rotation functions |

### src/features/auth/ — Authentication & Access Control (3 files)

| File | Size | Purpose |
|------|------|---------|
| `enforceBan.js` | 655B | Middleware: blocks banned users from bot interactions |
| `owner.js` | 3KB | Owner/admin privilege checks, multi-owner support |
| `utils.js` | 851B | Auth utilities: `enforceOwnerCommandLimit()`, permission helpers |

### src/features/checkin/ — Daily Check-in System (10 files)

| File | Size | Purpose |
|------|------|---------|
| `runtime.js` | 151KB | **Main check-in engine**. Quiz generation, answer verification, scoring, streak tracking, leaderboard rendering, admin panel |
| `service.js` | 15KB | Check-in business logic: point calculation, streak computation, date-based queries |
| `scheduler.js` | 4KB | Cron-like check-in reminder scheduling per group timezone |
| `challenges.js` | 8KB | Daily challenge generation: math, physics, chemistry, crypto, OKX questions with configurable weights |
| `constants.js` | 9KB | Check-in constants: point values, streak bonuses, achievement thresholds, emoji mappings |
| `dateUtils.js` | 5KB | Date manipulation: timezone-aware date strings, period comparison, streak calculation |
| `summary.js` | 4KB | Check-in summary generation: daily/weekly/monthly reports |
| `adminUi.js` | 10KB | Admin panel UI for check-in configuration (inline keyboards) |
| `adminActions.js` | 3KB | Admin action handlers: configure check-in times, weights, periods |
| `welcomeActions.js` | 5KB | New member welcome actions triggered by check-in system |

### src/features/ — Other Feature Files

| File | Size | Purpose |
|------|------|---------|
| `aiService.js` | 61KB | AI service orchestration: handles `/ai` command flow, provider selection, key management, image/audio routing |
| `aiAudio.js` | 6KB | Audio message processing: voice-to-text, audio transcription, Gemini audio handling |
| `geminiLiveAudio.js` | 21KB | Gemini Live Audio streaming: real-time bidirectional audio with WebSocket |
| `liveAudioTools.js` | 7KB | Tools available during Gemini Live Audio sessions (function calling in real-time) |
| `priceAlerts.js` | 106KB | **Price alert system**: create/edit/delete alerts, price checking loop, notification delivery, alert conditions (above/below/change%), per-user limits |
| `achievements.js` | 9KB | Achievement/badge system: unlock conditions, badge rendering, user achievement tracking |
| `dailyChallenges.js` | 6KB | Daily challenge engine: generates rotating challenges, tracks completion |
| `chainMenu.js` | 4KB | Blockchain chain selector inline keyboard (EVM, Solana, Tron, etc.) |
| `chainIcons.js` | 1KB | Chain icon emoji mappings (ETH ⟿ ⟐, BSC ⟿ 🟡, etc.) |
| `help.js` | 8KB | Help menu generation: categorized command list, inline keyboard navigation |
| `languageMenu.js` | 3KB | Language selection inline keyboard (🇬🇧 EN, 🇻🇳 VI, 🇮🇩 ID, 🇰🇷 KO, 🇷🇺 RU, 🇨🇳 ZH) |
| `ownerList.js` | 18KB | Owner management: add/remove owners, list owners with status |
| `ownerMenu.js` | 5KB | Owner admin panel inline keyboard |
| `welcomeVerification.js` | 12KB | New member verification: captcha/quiz before granting access |
| `ui.js` | 2KB | Shared UI components: progress bars, status indicators |
| `top-tokens/` | 1 file | Top token rankings display module |

---

## src/app/ — Business Logic (Main)

The largest directory — handles core bot operations. Many of these are legacy monoliths being refactored.

### AI System (src/app/aiHandlers/ — 12 files)

| File | Size | Purpose |
|------|------|---------|
| `index.js` | 2KB | Re-exports all AI handler sub-modules |
| `completions.js` | 5KB | AI completion request building and response parsing |
| `functionDeclarations.js` | 10KB | Gemini function declarations for game-related AI tools |
| `gameFunctions.js` | 8KB | AI game function execution: trivia, riddles, word games |
| `imageHandler.js` | 4KB | AI image generation/editing request handler |
| `ttsHandler.js` | 3KB | TTS request handler within AI context |
| `personas.js` | 14KB | AI persona system: prebuilt personas (Professor, Pirate, Chef, etc.), custom persona support |
| `sessions.js` | 4KB | AI conversation session management |
| `sharedState.js` | 1KB | Shared mutable state across AI handlers |
| `aibCommand.js` | 4KB | `/aib` command handler (AI with custom behavior) |
| `utils.js` | 5KB | AI formatting utilities: token usage tracking, model name normalization, contextual icons |
| `README.md` | 1KB | Documentation for this directory |

### Main Application Files

| File | Size | Purpose |
|------|------|---------|
| `aiHandlers.js` | 314KB | **Mega AI handler** — master file containing all AI chat logic, token search, swap UI, inline mode, price cards. Being refactored into `aiHandlers/` and `features/ai/` |
| `walletTokenActions.js` | 224KB | **Wallet token actions** — buy/sell/transfer tokens, swap execution, approve transactions, transaction history, token details view |
| `random.js` | 135KB | **Random games** — fortune telling, dice, RPS, number guess, word games, trivia, science quiz, mini-games |
| `walletFeatures.js` | 121KB | **Wallet management** — connect wallet, view portfolio, token list, chain selection, balance display |
| `owner.js` | 104KB | **Owner/admin commands** — broadcast, stats, user management, group management, feature toggles, debug tools |
| `randomCallbacks.js` | 47KB | Callback handlers for random game inline keyboard interactions |
| `adminHandlers.js` | 39KB | Admin command handlers: group settings, welcome messages, moderation config |
| `moderationCommands.js` | 32KB | Moderation: ban/unban, mute/unmute, warn, kick, clean messages, anti-spam |
| `helpExecutors.js` | 20KB | Help menu execution: renders categorized help pages with inline navigation |
| `accessControl.js` | 18KB | Permission system: admin check, owner check, group vs DM restrictions, command throttling |
| `aiApiHandlers.js` | 17KB | AI API key management: `/ai apikey`, `/ai provider`, `/ai usage`, key listing |
| `languageHandlers.js` | 16KB | Language command handlers: `/lang`, per-user language preference |
| `personaI18n.js` | 16KB | Persona internationalization: translated persona descriptions and prompts |
| `randomCommands.js` | 14KB | Random game command registration and routing |
| `coreCommands.js` | 12KB | Core bot commands: `/start`, `/help`, `/id`, `/ping` |
| `walletOverview.js` | 11KB | Wallet overview page: total portfolio value, top holdings summary |
| `tokenFlow.js` | 7KB | Token lookup flow: auto-detect contract address → fetch token info → display card |
| `walletCommandHandlers.js` | 6KB | Wallet slash command handlers: `/wallet`, `/mywallet` |
| `language.js` | 5KB | Language detection and switching logic |
| `featureTopics.js` | 5KB | Feature topic management for Telegram topic-enabled groups |
| `txhashFlow.js` | 5KB | Transaction hash lookup flow: detect tx hash → fetch details → display |
| `donateHandlers.js` | 4KB | Donation command handlers: `/donate`, `/donatecm`, `/donatedev` |
| `telegramDebug.js` | 3KB | Debug tools: `/debug` command for inspecting message objects |
| `utilityCommands.js` | 2KB | Utility commands: `/rmchat`, `/stats` |
| `walletUi.js` | 18KB | Wallet UI components: inline keyboards, balance cards, portfolio displays |
| `walletInline.js` | 2KB | Wallet inline query handler |
| `startHandlers.js` | 2KB | `/start` deep-link handler |
| `adminCommands.js` | 2KB | Admin command registration |
| `rmchat.js` | 1KB | `/rmchat` command logic (delete bot messages) |
| `rmchatCommands.js` | 2KB | `/rmchat` command registration |
| `featureTopicCommands.js` | 1KB | Feature topic command registration |

### Subdirectories

| Dir | Files | Purpose |
|-----|-------|---------|
| `utils/` | 6 files | App-specific utilities: `markdown.js` (14KB — Telegram MarkdownV2 escaping), `telegram.js` (4KB — message sending helpers), `telegramMedia.js` (3KB — file download), `idTelegram.js` (2KB — ID formatting), `reply.js` (1KB — reply builder), `randomText.js` (1KB — random text generator) |
| `moderation/` | 1 file | Moderation sub-module |
| `telegram/` | 1 file | Telegram-specific helpers |

---

## src/commands/ — Slash Commands

New-style command modules following `{ meta, handler }` pattern.

| File | Size | Purpose |
|------|------|---------|
| `start.js` | 2KB | `/start` — welcome message, deep-link handling |
| `help.js` | 1KB | `/help` — shows command categories |
| `ai.js` | 7KB | `/ai` — AI chat, provider selection, API key management |
| `gas.js` | 5KB | `/gas` — real-time gas prices across chains |
| `swap.js` | 8KB | `/swap` — DEX swap flow (quote → confirm → execute) |
| `portfolio.js` | 6KB | `/portfolio` — wallet portfolio overview |
| `toptoken.js` | 1KB | `/toptoken` — trending token rankings |
| `mywallet.js` | 1KB | `/mywallet` — trading wallet management |
| `donate.js` | 1KB | `/donate` — donation info |
| `donatecm.js` | 3KB | `/donatecm` — community donation |
| `donatedev.js` | 1KB | `/donatedev` — developer donation |
| `register.js` | 3KB | `/register` — user registration flow |
| `handler.js` | 1KB | Command handler base class |
| `admin/` | 1 file | Admin-only commands subdirectory |
| `tools/` | 3 files | Tool sub-commands: `ping.cmd.js` (ping test), `profile.cmd.js` (10KB — user profile card), `recent.cmd.js` (2KB — recent activity) |

---

## src/handlers/ — Event Handlers (New)

New-style event handler modules.

### callbacks/ (3 files)

| File | Size | Purpose |
|------|------|---------|
| `token.js` | 5KB | Token-related callback queries (inline buttons on token info cards) |
| `topToken.js` | 8KB | Top token callback queries (pagination, sorting, chain filter) |
| `txhash.js` | 5KB | Transaction hash callback queries (details, explorer links) |

### commands/ (7 files)

| File | Size | Purpose |
|------|------|---------|
| `contract.js` | 3KB | Contract address auto-detection handler |
| `donate.js` | 4KB | Donation command handler |
| `okx402.js` | 1KB | OKX x402 payment protocol handler |
| `okxChains.js` | 2KB | OKX chain selection handler |
| `token.js` | 1KB | Token command handler |
| `topToken.js` | 19KB | Top token command handler with rich UI |
| `txhash.js` | 1KB | Transaction hash command handler |

---

## src/bot/handlers/ — Event Handlers (Legacy)

Older handler architecture, still actively used.

| File | Size | Purpose |
|------|------|---------|
| `autoDetection.js` | 13KB | Auto-detects: contract addresses, tx hashes, token symbols, and wallet addresses in messages. Routes to appropriate handlers |
| `commands.js` | 52KB | **Master command handler** — routes all `/command` messages to the correct handler. Maps 50+ commands |
| `messages.js` | 33KB | **Master message handler** — processes all non-command messages: AI replies, auto-detection triggers, group management events |
| `confirmationHandler.js` | 8KB | Handles confirmation dialogs (yes/no) for destructive actions like swap execution |
| `README.md` | 1KB | Documentation |

---

## src/services/ — External API Services

| File | Size | Purpose |
|------|------|---------|
| `okxService.js` | 97KB | **OKX DEX API service** — token balance, swap execution, approve transactions, price fetching, chain management, wallet tracking. Uses OKX Web3 API v6 |
| `onchainos.js` | 18KB | **OnchainOS API service** — unified wrapper for all OKX OnchainOS APIs: Wallet Portfolio, DEX Market, DEX Token, DEX Swap, Onchain Gateway. HMAC-SHA256 authentication, retry logic, rate limit handling |
| `walletWatchers.js` | 6KB | Wallet monitoring service: tracks wallet balances, detects transactions, triggers notifications |
| `ai/` | subdir | AI service sub-modules (provider-specific) |

---

## src/utils/ — Shared Utilities

| File | Size | Purpose |
|------|------|---------|
| `format.js` | 13KB | Number/date formatting, markdown escaping, Telegram MarkdownV2 conversion, secret sanitization |
| `helpers.js` | 6KB | General helpers: `sleep()`, `retry()`, `chunk()`, `pick()`, safe JSON parse |
| `builders.js` | 5KB | UI builders: close keyboard, pagination keyboard, confirmation dialog |
| `chat.js` | 6KB | Chat utilities: `sendReply()`, `splitTelegramMessageText()`, thread-aware message sending |
| `device.js` | 3KB | Device info: `ensureDeviceInfo()`, `buildDeviceTargetId()` for multi-device support |
| `emojiLibrary.js` | 19KB | Comprehensive emoji mapping library for decorating bot responses |
| `gamingKeywords.js` | 10KB | Gaming trigger keyword detection (sudoku, chess, etc.) |
| `payload.js` | 1KB | Callback payload encoding/decoding |
| `text.js` | 305B | Text manipulation utilities |
| `web3.js` | 541B | Web3 helpers: address validation, chain detection |
| `format/` | subdir | Extended formatting utilities |
| `web3/` | subdir | Extended Web3 utilities |

---

## src/callbacks/ — Callback Routing

| File | Size | Purpose |
|------|------|---------|
| (1 file) | — | Callback router for inline keyboard button presses |

---

## src/server/ — HTTP API

| File | Size | Purpose |
|------|------|---------|
| (1 file) | — | Express-based HTTP server for health checks and external integrations |

---

## db/ — Database Layer

SQLite database with promisified query wrappers.

| File | Size | Purpose |
|------|------|---------|
| `schema.js` | 15KB | **Database schema** — CREATE TABLE statements for all 20+ tables: users, groups, wallets, checkin_groups, checkin_records, checkin_members, checkin_attempts, price_alerts, scheduled_posts, command_usage, AI data, moderation logs, topics |
| `index.js` | 2KB | Main export — re-exports all DB modules |
| `core.js` | 8KB | Core DB operations: `dbRun()`, `dbGet()`, `dbAll()`, connection management, transaction support |
| `users.js` | 12KB | User CRUD: register, get profile, update language, track activity, manage API keys |
| `groups.js` | 8KB | Group CRUD: register group, get settings, update config, track members |
| `wallets.js` | 12KB | Wallet operations: link/unlink wallet, get balance, trading wallets CRUD, encrypted key storage |
| `ai.js` | 12KB | AI data: conversation history, token usage tracking, persona preferences, image context |
| `checkin.js` | 27KB | Check-in data: records, members, groups, attempts, streaks, leaderboards |
| `games.js` | 15KB | Game data: scores, history, achievements, daily challenge tracking |
| `moderation.js` | 7KB | Moderation data: bans, warns, mutes, filter rules, anti-spam state |
| `priceAlerts.js` | 14KB | Price alert data: alert CRUD, condition storage, notification history |
| `topics.js` | 6KB | Topic data: Telegram topic management, feature-to-topic mapping |
| `scheduledPosts.js` | 3KB | Scheduled post data: create/update/delete scheduled messages |
| `commandUsage.js` | 10KB | Command usage analytics: per-user, per-group, per-command tracking |

---

## data/ — Static Data Files

| File | Size | Purpose |
|------|------|---------|
| `randomFortunes.js` | 326KB | Fortune telling data: 1000+ fortune messages in multiple languages |
| `scienceQuestions.js` | 100KB | Science quiz questions: math, physics, chemistry with multiple difficulty levels |
| `gamingKeywords.js` | 10KB | Gaming keyword trigger lists for auto-detection |
| `index.js` | 322B | Re-exports all data files |

---

## locales/ — Internationalization

| File | Size | Language |
|------|------|----------|
| `en.json` | 145KB | 🇬🇧 English |
| `vi.json` | 163KB | 🇻🇳 Vietnamese |
| `id.json` | 148KB | 🇮🇩 Indonesian |
| `ko.json` | 161KB | 🇰🇷 Korean |
| `ru.json` | 200KB | 🇷🇺 Russian |
| `zh.json` | 143KB | 🇨🇳 Chinese |

Each file contains 1500+ translation keys covering all bot messages, buttons, and responses.

---

## assets/ — Media Assets

| Path | Purpose |
|------|---------|
| `assets/fonts/` | 4 font files used for image generation (profile cards, check-in badges) |

---

## scripts/ — Build & Utility Scripts

| File | Size | Purpose |
|------|------|---------|
| `add-i18n-keys.js` | 8KB | Script to add new translation keys across all locale files simultaneously |

---

## 🗑️ Redundant Files — Safe to Delete

### ❌ Legacy/Unused Root Files

| File | Size | Reason | Risk |
|------|------|--------|------|
| `database.js` | **109KB** | Old monolithic DB module. Fully replaced by `db/` directory. **Not imported anywhere** | ✅ Safe |
| `config.js` | 257B | Old config stub. Replaced by `src/config/env.js`. **Not imported anywhere** | ✅ Safe |
| `config_new/` | 2 files | Abandoned config refactor. Contains `env.js` (22KB) + `index.js` (136B) that duplicate `src/config/` | ✅ Safe |
| `code.txt` | 4KB | Temporary code notes/dump | ✅ Safe |
| `db.json` | 34B | Empty JSON file `{}` — not used | ✅ Safe |
| `db_migrate.js` | 2KB | One-time migration script (already executed) | ✅ Safe |
| `.gitkeep` | 126B | Empty placeholder file at root (unnecessary) | ✅ Safe |
| `src/commands/.gitkeep` | — | Empty placeholder | ✅ Safe |
| `src/utils/.gitkeep` | — | Empty placeholder | ✅ Safe |
| `bot.db` | varies | Old/empty database file — active DB is `banmao.db` | ⚠️ Check first |
| `command_dump.txt` | varies | AI generated temp command dump list | ✅ Safe |

### 📄 Outdated Documentation (Replace with this file)

| File | Size | Reason |
|------|------|--------|
| `FILE_ANALYSIS.md` | 7KB | Outdated, in Vietnamese, partially incorrect. Superseded by this document |
| `CLEANUP_SUMMARY.md` | 2KB | Historical cleanup log — can be archived |
| `PROJECT_STRUCTURE.md` | 10KB | Outdated structure overview — superseded by this document |

### 📦 Reference Codebases (Can be removed from project)

| Directory | Size | Reason |
|-----------|------|--------|
| `openclaw-main/` | 7445 files | External reference codebase (OpenClaw). Not integrated into bot code. Keep separately or archive |
| `onchainos-skills-main/` | 10 files | External reference (OnchainOS Skills docs). Integration complete — skills are in `ai-onchain.js` now |

### 🧹 Quick Cleanup Command

```powershell
# Safe to run — removes only confirmed redundant files
Remove-Item "database.js"
Remove-Item "config.js"
Remove-Item "code.txt"
Remove-Item "command_dump.txt"
Remove-Item "db.json"
Remove-Item "db_migrate.js"
Remove-Item ".gitkeep"
Remove-Item "config_new" -Recurse
Remove-Item "FILE_ANALYSIS.md"
Remove-Item "CLEANUP_SUMMARY.md"
Remove-Item "PROJECT_STRUCTURE.md"
# Optional — archive these if you want to keep a copy
# Remove-Item "openclaw-main" -Recurse
# Remove-Item "onchainos-skills-main" -Recurse
```

> **Estimated savings**: ~120KB source code + ~7MB reference codebases

---

*Generated 2026-03-05. This document supersedes `PROJECT_STRUCTURE.md`, `FILE_ANALYSIS.md`, and `CLEANUP_SUMMARY.md`.*
