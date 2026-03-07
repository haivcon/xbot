# 🧠 XBot AI Feature (Core Architecture)

The `src/features/ai/` directory serves as the Brain of XBot. It acts as the architect that processes all Natural Language Processing (NLP) requests from users through world-class Providers (Google Gemini, OpenAI, Groq), combined with a powerful **Agentic Web3 On-chain** system that interacts directly with OnchainOS.

Below is detailed documentation describing the function, operational flow, and usage of each File / Folder in this structure.

---

## 📁 1. Directory `onchain/` (Web3 Agentic Tools)
This is where all "On-chain Skills" reside. The AI has the authority to automatically execute (Function Calling) these skills when commanded by the user. Instead of just chatting, the AI can call these functions to read Blockchain data or execute wallet transactions.

- **`declarations.js`**
  - **Function:** Declares the structure (JSON Schema) of all On-chain Tools. When initializing the AI Model, the system loads this file into the `tools` array so the AI understands "what it can do" and "what parameters it needs".
  - **Usage:** When adding a new feature (e.g., Cross-chain Bridge), Devs must declare the function name, description, and input parameters in this file for the AI to recognize it.
  
- **`helpers.js`**
  - **Function:** Core utility functions shared across On-chain tools: Getting RPC URLs (`_getChainRpc`), outputting Explorer Links (`_getExplorerUrl`), hashing/verifying PIN codes (`_verifyPin`), and notably, the extremely powerful language detection system `detectPromptLanguage` and Scam token trend filtering `autoResolveToken` (selects tokens based on liquidity, verified status).
  - **Usage:** Import into the modules below to handle logic and intelligently resolve Tickers into safe Contract Addresses.
  
- **`formatters.js`**
  - **Function:** The aesthetic layer (UI/UX) of the Bot. Its sole purpose is to receive raw data (Raw JSON) returned from APIs and "render" them into beautiful HTML/Markdown tables, complete with Emojis, banners, and inline buttons.
  - **Usage:** The Tools below always return via a Formatter function (e.g., `formatSwapQuoteResult`) to output to the Telegram screen.

- **`marketTools.js`**
  - **Function:** Provides the AI with market intelligence: Searching tokens, checking prices, getting candlestick charts (K-lines), hunting Top trending tokens, viewing Holder details, and measuring liquidity.
  - **Usage:** Runs passively when the User asks about market analysis or Dex data (Example command: "Check the chart for PEPE on the ETH network").

- **`tradingTools.js`**
  - **Function:** Equips the AI with Trading power: Swap routing quotes (Dex Aggregator), security risk assessment (GoPlus Security for Cannot Sell/Honeypot/Massive Tax), transaction execution simulation (Simulate), and Transaction Broadcasting. Notably includes **Batch Swap** (auto slippage) for multiple wallets.
  - **Usage:** Tightly linked directly to users' natural language trading commands ("Buy 10$ of BANMAO using USDT").

- **`walletTools.js`**
  - **Function:** Grants the AI management rights over Trading Wallets: Rapid anonymous wallet creation, Wallet deletion, encrypted Private Key retrieval, comprehensive multi-token Balance checks, and Batch Transfers.
  - **Usage:** The AI automatically calls the balance fetching tool `get_trading_wallet_balance` before the user decides to swap, or acts upon user commands ("Create 3 new wallets for me").

---

## 📄 2. Core Files in `src/features/ai/`

- **`ai-onchain.js`**
  - **Function:** The Routing hub for On-chain Tools. It holds `ONCHAIN_SYSTEM_INSTRUCTION` (The highly critical rulebook embedded into the AI's neural network to understand blockchain networks and Scam handling logic). It also exports the `executeToolCall` function to receive AI functional intents and run the specific sub-functions.
  - **Usage:** The main entry point linking from `aiHandlers.js` to the `onchain/` directory. Imported when initializing the AI.

- **`clients.js`**
  - **Function:** The connection "Anchor" (Load Balancer). XBot allows dozens of API Keys to cycle to overcome the Rate Limits of free tiers. This file provides `getGeminiClient`, `getOpenAiClient`, `getGroqClient`, evaluates errors, and temporarily Disables keys that are dead, Expired, or overloaded (429/503). Responsible for managing both Server Keys and individual Users' Personal Keys.
  - **Usage:** Called periodically whenever the Bot needs the AI to generate text/images/audio. The function will auto-advance to the next Key if the current one fails.

- **`gemini.js`**
  - **Function:** The Multimodal Engine Core. This massive file contains the entire logic for creating Content using Google Gemini, OpenAI, Groq (Multimodal system processing Text/Photo/Audio). It provides:
    - `runGeminiCompletion`: Processes general text/analysis using Gemini.
    - `runGoogleAudioCompletion` / `runOpenAiAudioCompletion`: Processes User voice recordings and extracts them to text.
    - `runGoogleImageRequest` / `runOpenAiImageRequest`: System for creating or reading images via prompts.
  - This colossal logic block includes dynamic error analysis and automatic Key rotation functionality.
  - **Usage:** Called by `aiHandlers.js` whenever receiving Message Text/Voice/Image to send to the AI for processing.

- **`tts.js`** (Text-To-Speech)
  - **Function:** The AI Audio processing division (AI Voice). Handles the `/ai tts [Text]` command. Even when the User types text, the Bot can reply with an audio Voice Message. Or it can Upload User Voice for AI Text Transcription.
  - **Usage:** Manages the Setting menu for TTS tone/Language (Male/Female/Regional options). The Bot can reply like a "Friend" through this feature.

- **`utils.js`**
  - **Function:** Pre-processing utility functions for the Machine Learning / AI Layer. Includes:
    - `detectImageAction`: Identifies if the user is "requesting an image draw", "editing an image", or "just chatting", optimized with multi-language support.
    - `isQuotaOrRateLimitError` & `isGeminiApiKeyExpired`: RegEx / Regex / Lookup structures to clearly distinguish error codes from Google / OpenAI so the Load Balancer system in `clients.js` can behave appropriately (Lock key, or just wait a few seconds).
  - **Usage:** Required into `gemini.js` and `index.js`.

- **`index.js`**
  - **Function:** The outermost Entry Point of the `/ai` directory module. Routes Telegram UI/UX. The custom API Keys control panel Menu for Users. Defines Provider configurations (Google, OpenAI, Groq), and contains the AI Intro function via Video (`sendAiIntroMedia`).
  - **Usage:** Manages the communication flow with users when registering API Keys.

---
*We hope you have an incredible journey exploring and developing the super-memory & Web3 Agentic (XBot) module!*
