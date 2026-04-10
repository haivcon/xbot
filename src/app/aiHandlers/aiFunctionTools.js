/**
 * AI Function Tools — extracted from aiHandlers.js createAiHandlers()
 * Contains: all tool declarations, tool implementations,
 * getAvailableFunctions, executeFunctionCall, shouldExecuteFunction.
 *
 * Factory pattern: createFunctionTools(toolDeps) returns { getAvailableFunctions, executeFunctionCall, toolFunctionImplementations }
 */
const logger = require('../../core/logger');
const log = logger.child('AI:FnTools');

/**
 * Create function tools system.
 * @param {Object} toolDeps - Dependencies from createAiHandlers
 * @returns {Object} { getAvailableFunctions, executeFunctionCall, toolFunctionImplementations }
 */
function createFunctionTools(toolDeps) {
  const {
    bot, db, t, getLang, sendReply, buildCloseKeyboard,
    deps, // original deps from createAiHandlers
    onchainToolArrays, executeOnchainToolCall,
    skillRegistry, Type,
    detectImageAction, AI_PERSONAS, getPersonaLabel, getPersonaStrings,
    getUserPersona, setUserPersona, buildPersonaKeyboard,
    getUserCustomPersona, promptCustomPersonaInput,
    clearUserSession,
    applyThreadId,
    getBotIntroductionDeclaration
  } = toolDeps;
  // ============================================================================
  // Function Calling System for /aia Command
  // ============================================================================
  /**
   * Function Declarations organized by permission level.
   * These define the schema that Gemini uses to understand available functions.
   */
  // USER LEVEL FUNCTIONS - Available to all users
  const getUserInfoDeclaration = {
    name: 'get_user_info',
    description: 'Get information about a user including their ID, username, and full name. Works when replying to a message or with user ID/username.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram chat/group ID where to look up the user'
        },
        user_identifier: {
          type: Type.STRING,
          description: 'User ID (numeric) or username (with or without @) to look up. Optional if context provides it.'
        }
      },
      required: ['chat_id']
    }
  };
  const getMemberCountDeclaration = {
    name: 'get_member_count',
    description: 'Retrieves the total number of members in a Telegram group or supergroup.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The unique ID of the Telegram group/supergroup'
        }
      },
      required: ['chat_id']
    }
  };
  // ADMIN LEVEL FUNCTIONS - Only for group administrators
  const banMemberDeclaration = {
    name: 'ban_member',
    description: 'Ban a user from the Telegram group permanently. Requires admin permission. Optionally revoke their messages.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to ban'
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for banning the user'
        },
        revoke_messages: {
          type: Type.BOOLEAN,
          description: 'Whether to delete all messages from this user in the group. Default: true'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const kickMemberDeclaration = {
    name: 'kick_member',
    description: 'Kick (remove) a user from the group temporarily. They can rejoin via invite link. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to kick'
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for kicking the user'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const muteMemberDeclaration = {
    name: 'mute_member',
    description: 'Mute a user in the group, preventing them from sending messages. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to mute'
        },
        duration_seconds: {
          type: Type.NUMBER,
          description: 'How long to mute in seconds. Default: 3600 (1 hour). Use large number for permanent.'
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for muting'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const unmuteMemberDeclaration = {
    name: 'unmute_member',
    description: 'Unmute a previously muted user, restoring their ability to send messages. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to unmute'
        }
      },
      required: ['chat_id', 'user_id']
    }
  };
  const warnMemberDeclaration = {
    name: 'warn_member',
    description: 'Issue a warning to a user. After reaching warn limit, automated action (ban/kick/mute) is applied. Requires admin permission.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chat_id: {
          type: Type.STRING,
          description: 'The Telegram group ID'
        },
        user_id: {
          type: Type.STRING,
          description: 'The numeric user ID to warn'
        },
        reason: {
          type: Type.STRING,
          description: 'Reason for the warning'
        }
      },
      required: ['chat_id', 'user_id', 'reason']
    }
  };
  // OWNER LEVEL FUNCTIONS - Only for bot owners
  const setCommandLimitDeclaration = {
    name: 'set_command_limit',
    description: 'Set usage limit for AI commands for a specific user or globally. Only bot owner can use this.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: 'Maximum number of AI command uses per day'
        },
        user_id: {
          type: Type.STRING,
          description: 'User ID to set limit for. Omit for global limit.'
        }
      },
      required: ['limit']
    }
  };
  // ===========================================================================
  // RANDOM/GAMING FUNCTIONS - User level (all users can play games)
  // ===========================================================================
  const playDiceDeclaration = {
    name: 'play_dice',
    description: 'Roll dice using standard notation like "2d6" (roll two 6-sided dice)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        notation: {
          type: Type.STRING,
          description: 'Dice notation in format NdM where N is number of dice and M is number of faces. Examples: "2d6", "3d20", "1d100"'
        }
      },
      required: ['notation']
    }
  };
  const playRpsDeclaration = {
    name: 'play_rps',
    description: 'Play rock-paper-scissors game with the bot. Accepts multiple languages.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        choice: {
          type: Type.STRING,
          description: 'Your choice in any language. Valid options: ' +
            'English: "rock", "paper", "scissors" | ' +
            'Vietnamese: "búa", "bao", "kéo" | ' +
            'Chinese: "石头", "布", "剪刀" | ' +
            'Korean: "바위", "보", "가위" | ' +
            'Russian: "камень", "бумага", "ножницы" | ' +
            'Indonesian: "batu", "kertas", "gunting"'
        }
      },
      required: ['choice']
    }
  };
  const generateRandomNumberDeclaration = {
    name: 'generate_random_number',
    description: 'Generate a random number within a specified range',
    parameters: {
      type: Type.OBJECT,
      properties: {
        min: {
          type: Type.NUMBER,
          description: 'Minimum value (inclusive). Default is 1'
        },
        max: {
          type: Type.NUMBER,
          description: 'Maximum value (inclusive). Default is 1000'
        }
      },
      required: []
    }
  };
  const generateLongShortDeclaration = {
    name: 'generate_longshort',
    description: 'Generate a LONG or SHORT trading signal with random leverage (1-100x) for fun trading simulation',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const randomChoiceDeclaration = {
    name: 'random_choice',
    description: 'Randomly choose one option from a list of choices',
    parameters: {
      type: Type.OBJECT,
      properties: {
        options: {
          type: Type.ARRAY,
          description: 'List of options to choose from (minimum 2 options)',
          items: { type: Type.STRING }
        }
      },
      required: ['options']
    }
  };
  const getFortuneDeclaration = {
    name: 'get_fortune',
    description: 'Get a random fortune or advice (like a fortune cookie)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic_code: {
          type: Type.NUMBER,
          description: 'Optional topic code number to get fortune from specific category'
        }
      },
      required: []
    }
  };
  const createQuizDeclaration = {
    name: 'create_quiz',
    description: 'Generate a random trivia or quiz question for the user to answer',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const startMemoryGameDeclaration = {
    name: 'start_memory_game',
    description: 'Start a memory card matching game with customizable theme and grid size',
    parameters: {
      type: Type.OBJECT,
      properties: {
        theme: {
          type: Type.STRING,
          description: 'Theme for cards: food, sports, nature, animals, travel, symbols, or mixed (default)'
        },
        size: {
          type: Type.STRING,
          description: 'Grid size in format RxC like "4x4", "6x6". Default is "4x4"'
        }
      },
      required: []
    }
  };
  const startMinesweeperDeclaration = {
    name: 'start_minesweeper',
    description: 'Start a minesweeper game with customizable grid size',
    parameters: {
      type: Type.OBJECT,
      properties: {
        size: {
          type: Type.STRING,
          description: 'Grid size in format RxC like "5x5", "9x9". Default is "5x5"'
        }
      },
      required: []
    }
  };
  const startTreasureHuntDeclaration = {
    name: 'start_treasure_hunt',
    description: 'Start a treasure hunt game where user finds hidden treasure in a grid',
    parameters: {
      type: Type.OBJECT,
      properties: {
        size: {
          type: Type.STRING,
          description: 'Grid size in format RxC like "6x6". Default is "6x6"'
        }
      },
      required: []
    }
  };
  const startSudokuDeclaration = {
    name: 'start_sudoku',
    description: 'Start a sudoku puzzle game',
    parameters: {
      type: Type.OBJECT,
      properties: {
        size: {
          type: Type.NUMBER,
          description: 'Board size: 4 (easy), 6 (medium), or 9 (hard). Default is 9'
        }
      },
      required: []
    }
  };
  const startGomokuDeclaration = {
    name: 'start_gomoku',
    description: 'Start a gomoku (5-in-a-row) game against AI',
    parameters: {
      type: Type.OBJECT,
      properties: {
        board_size: {
          type: Type.NUMBER,
          description: 'Board size from 7 to 12. Default varies by difficulty'
        }
      },
      required: []
    }
  };
  const startChessDeclaration = {
    name: 'start_chess',
    description: 'Start a chess game against AI on standard 8x8 board',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  };
  // ========================================================================
  // XLAYER CHECK FUNCTION DECLARATIONS
  // ========================================================================
  const checkWalletBalanceDeclaration = {
    name: 'check_wallet_balance',
    description: 'Check wallet balance and portfolio. Use when user asks to check wallet, view balance, or see portfolio',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'Optional wallet address to check. If not provided, shows user\'s registered wallets'
        }
      },
      required: []
    }
  };
  const deleteChatHistoryDeclaration = {
    name: 'delete_chat_history',
    description: 'Delete/clear chat history with the bot. Use when user says "clear chat", "delete history", "xóa lịch sử chat"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const getTokenInfoDeclaration = {
    name: 'get_token_info',
    description: 'Get token price, volume, market cap. Use when user asks about token price, crypto price, coin info',
    parameters: {
      type: Type.OBJECT,
      properties: {
        token: {
          type: Type.STRING,
          description: 'Token symbol like ETH, BTC, OKB, or contract address'
        }
      },
      required: []
    }
  };
  const lookupContractDeclaration = {
    name: 'lookup_contract',
    description: 'Look up smart contract information by address',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'Contract address to look up'
        }
      },
      required: ['address']
    }
  };
  const lookupTransactionDeclaration = {
    name: 'lookup_transaction',
    description: 'Look up transaction details by hash. Use when user asks about tx, transaction hash',
    parameters: {
      type: Type.OBJECT,
      properties: {
        txhash: {
          type: Type.STRING,
          description: 'Transaction hash to look up'
        }
      },
      required: ['txhash']
    }
  };
  const checkOkxChainsDeclaration = {
    name: 'check_okx_chains',
    description: 'Get list of supported blockchain chains on OKX',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const checkOkx402StatusDeclaration = {
    name: 'check_okx402_status',
    description: 'Check OKX 402 API status',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };

  const getGroupInfoDeclaration = {
    name: 'get_group_info',
    description: 'Get information about the current group/chat. Use when user asks about group stats, members, admins',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const getCheckinStatsDeclaration = {
    name: 'get_checkin_stats',
    description: 'Get checkin statistics and daily checkin. Use when user asks about checkin, điểm danh, streak',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  // ========================================================================
  // AI COMMAND FUNCTION DECLARATIONS
  // ========================================================================
  const askAiDeclaration = {
    name: 'ask_ai',
    description: 'Ask AI a question or have a conversation. Use when user wants to chat, ask questions, or needs AI help',
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: {
          type: Type.STRING,
          description: 'The question or prompt to ask AI'
        }
      },
      required: ['question']
    }
  };
  const textToSpeechDeclaration = {
    name: 'text_to_speech',
    description: 'Convert text to speech audio. Use when user says "đọc", "read aloud", "nói", "speak", "TTS", "chuyển thành giọng nói"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'The text to convert to speech'
        }
      },
      required: ['text']
    }
  };
  const manageAiApiDeclaration = {
    name: 'manage_ai_api',
    description: 'Open AI API key management. Use when user says "quản lý API", "add API key", "thêm key", "API settings"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const changeAiLanguageDeclaration = {
    name: 'change_ai_language',
    description: 'Change bot language. Use when user says "đổi ngôn ngữ", "change language", "switch to English/Vietnamese"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const generateImageDeclaration = {
    name: 'generate_image',
    description: 'Generate an image from text prompt. Use when user says "tạo ảnh", "vẽ", "create image", "draw", "generate picture"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: 'Description of the image to generate'
        }
      },
      required: ['prompt']
    }
  };
  // ========================================================================
  // CHECKIN & WALLET FUNCTION DECLARATIONS
  // ========================================================================
  const doCheckinDeclaration = {
    name: 'do_checkin',
    description: 'Perform daily check-in. Use when user says "điểm danh", "checkin", "check in", "đăng ký điểm danh", "điểm danh đi"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const getCheckinLeaderboardDeclaration = {
    name: 'get_checkin_leaderboard',
    description: 'Get check-in leaderboard/ranking. Use when user says "top checkin", "bảng xếp hạng điểm danh", "ai điểm danh nhiều nhất", "xếp hạng"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const checkTokenPriceDeclaration = {
    name: 'check_token_price',
    description: 'Check cryptocurrency/token price. Use when user says "giá", "price", "giá coin", "giá token", "bao nhiêu tiền", "giá OKB", "giá BTC". When user specifies a chain (e.g. "trên Xlayer", "on ethereum"), pass the chain parameter.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: 'Token symbol to check price (e.g., OKB, BTC, ETH, XDOG, BANMAO).'
        },
        chain: {
          type: Type.STRING,
          description: 'Blockchain network name if user specified (e.g., xlayer, ethereum, bsc, solana, polygon, arbitrum, base, avalanche). Leave empty if not specified.'
        }
      },
      required: ['symbol']
    }
  };
  const getMyWalletDeclaration = {
    name: 'get_my_wallet',
    description: 'Get user wallet information. Use when user says "ví của tôi", "my wallet", "xem ví", "balance", "số dư", "tài khoản"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const checkWalletBalanceDirectDeclaration = {
    name: 'check_wallet_balance_direct',
    description: 'Look up a SINGLE wallet address balance and holdings directly. Use ONLY when user pastes exactly ONE wallet address (0x... or XKO...) and wants to see balances, portfolio, assets. IMPORTANT: If the user message contains 2 or more wallet addresses (0x...), do NOT use this function. For multiple addresses with a transfer/send request, use batch_transfer instead.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'The wallet address to look up (0x... or XKO... format)'
        }
      },
      required: ['address']
    }
  };
  const compareTokensDeclaration = {
    name: 'compare_tokens',
    description: 'Compare 2-4 cryptocurrency tokens side by side. Use when user says "so sánh", "compare", "vs", "đối chiếu", e.g. "so sánh OKB vs BNB", "compare ETH BTC SOL".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbols: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of 2-4 token symbols to compare (e.g. ["OKB","BNB"])'
        }
      },
      required: ['symbols']
    }
  };
  // ──── AI Insight ────
  const analyzeTokenDeclaration = {
    name: 'analyze_token',
    description: 'Deep analysis of a token with technical indicators (RSI, MA, whale trades). Use when user says "phân tích", "analyze", "nên mua", "should I buy", "phân tích kỹ thuật", "technical analysis", "dự báo", "forecast", "nhận định".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol to analyze (e.g. "OKB", "BANMAO", "ETH")' },
        chain: { type: Type.STRING, description: 'Optional chain filter (e.g. "196" for X Layer)' }
      },
      required: ['symbol']
    }
  };
  // ──── Feature 2: P2E Rewards ────
  const checkRewardPointsDeclaration = {
    name: 'check_reward_points',
    description: 'Check game reward points. Use when user says "điểm thưởng", "reward points", "điểm game", "my points", "xem điểm".',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };
  const redeemRewardsDeclaration = {
    name: 'redeem_rewards',
    description: 'Redeem game points for $BANMAO tokens. Use when user says "đổi thưởng", "redeem", "đổi điểm", "claim reward".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        points: { type: Type.NUMBER, description: 'Number of points to redeem (100 points = 1 $BANMAO)' }
      },
      required: ['points']
    }
  };
  // ──── Feature 3: Intent Trading ────
  const swapIntentDeclaration = {
    name: 'swap_intent',
    description: 'Execute a token swap/trade. Use when user says "mua", "bán", "swap", "đổi", "buy", "sell", "exchange", "trade", e.g. "dùng 10 USDT mua BANMAO", "swap 0.1 OKB to USDT".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        from_token: { type: Type.STRING, description: 'Token to sell (e.g. "USDT", "OKB")' },
        to_token: { type: Type.STRING, description: 'Token to buy (e.g. "BANMAO", "ETH")' },
        amount: { type: Type.STRING, description: 'Amount of from_token to spend (e.g. "10", "0.5")' },
        chain: { type: Type.STRING, description: 'Chain index ("196" for X Layer, default)' }
      },
      required: ['from_token', 'to_token', 'amount']
    }
  };
  // ──── Trading Wallet Management ────
  const manageTradingWalletDeclaration = {
    name: 'manage_trading_wallet',
    description: 'Manage trading wallet. Use when user says "tạo ví", "create wallet", "nhập key", "import key", "xem key", "export key", "ví giao dịch", "trading wallet", "kết nối ví", "connect wallet", "xóa ví giao dịch", "delete trading wallet", "kiểm tra số dư ví giao dịch", "check trading balance".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, description: 'Action: "create" (unlimited wallets allowed), "import" (import key), "export" (secure backup routine), "delete" (remove wallet), "balance" (check balance), "menu" (show wallet menu)' },
        pin_code: { type: Type.STRING, description: 'User\'s 4-digit PIN code for verifying sensitive actions like export.' }
      },
      required: ['action']
    }
  };
  const setWalletPinDeclaration = {
    name: 'set_wallet_pin',
    description: 'Thiết lập hoặc đổi mã PIN bảo mật 4 số cho ví giao dịch của người dùng. Dùng khi user nói "đặt mã pin", "cài pin", "đổi mật khẩu ví".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        new_pin: { type: Type.STRING, description: 'Mã PIN 4 số nguyên mới do người dùng yêu cầu (VD: "1234").' },
        current_pin: { type: Type.STRING, description: 'Mã PIN 4 số nguyên hiện tại (chỉ bắt buộc nếu đổi PIN).' }
      },
      required: ['new_pin']
    }
  };
  // ──── Phase 2: Price Alerts & Favorites ────
  const setPriceAlertDeclaration = {
    name: 'set_price_alert',
    description: 'Set a price alert for a token. Bot will notify when price goes above/below target. Use when user says "báo tôi khi", "alert when", "notify me if", "đặt cảnh báo", "set alert".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol (e.g. "OKB", "ETH")' },
        target_price: { type: Type.NUMBER, description: 'Target price in USD' },
        direction: { type: Type.STRING, description: '"above" or "below"' }
      },
      required: ['symbol', 'target_price']
    }
  };
  const listPriceAlertsDeclaration = {
    name: 'list_price_alerts',
    description: 'Show all active price alerts. Use when user says "danh sách cảnh báo", "my alerts", "xem alert".',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };
  const deletePriceAlertDeclaration = {
    name: 'delete_price_alert',
    description: 'Delete a price alert by ID. Use when user says "xóa cảnh báo", "delete alert", "hủy alert".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        alert_id: { type: Type.NUMBER, description: 'Alert ID to delete' }
      },
      required: ['alert_id']
    }
  };
  const addFavoriteTokenDeclaration = {
    name: 'add_favorite_token',
    description: 'Add a token to favorites. Use when user says "lưu", "yêu thích", "bookmark", "save token", "thêm vào yêu thích".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol (e.g. "OKB")' }
      },
      required: ['symbol']
    }
  };
  const removeFavoriteTokenDeclaration = {
    name: 'remove_favorite_token',
    description: 'Remove a token from favorites.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: 'Token symbol to remove' }
      },
      required: ['symbol']
    }
  };
  const checkFavoritePricesDeclaration = {
    name: 'check_favorite_prices',
    description: 'Check prices of all favorite tokens at once. Use when user says "giá token của tôi", "my tokens", "favorites", "yêu thích", "xem token đã lưu".',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };
  const showHelpDeclaration = {
    name: 'show_help',
    description: 'Show bot help menu. Use only when user explicitly asks for help (/help, "help", "trợ giúp", "hướng dẫn"). Avoid triggering for generic questions like "bạn có thể làm gì".',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const showDonateDeclaration = {
    name: 'show_donate',
    description: 'Show donation information. Use when user says "donate", "ủng hộ", "quyên góp", "捐款", "支持"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const registerWalletDeclaration = {
    name: 'register_wallet',
    description: 'Register wallet address. Use when user says "đăng ký ví", "register wallet", "thêm ví", "add wallet"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        address: {
          type: Type.STRING,
          description: 'Wallet address to register (0x...)'
        }
      },
      required: []
    }
  };
  const showRandomMenuDeclaration = {
    name: 'show_random_menu',
    description: 'Show random games menu. Use when user says "menu game", "trò chơi", "chơi gì", "game menu", "random menu"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const showTelegramIdDeclaration = {
    name: 'show_telegram_id',
    description: 'Show Telegram user/chat ID information. Use when user says "ID của tôi", "telegram ID", "chat ID", "user ID", "lấy ID"',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  };
  const setPersonaDeclaration = {
    name: 'set_persona',
    description: 'Change AI personality/persona. Use when user says "đổi tính cách", "change persona", "AI hài hước", "AI anime", "AI chuyên nghiệp", "personality mode"',
    parameters: {
      type: Type.OBJECT,
      properties: {
        persona_id: {
          type: Type.STRING,
          description: 'Persona ID to set (default, friendly, formal, anime, mentor, funny, crypto, gamer, rebel, mafia, cute, little_girl, little_brother, old_uncle, old_grandma, deity, king, banana_cat, pretty_sister, seductive_girl, gentleman, custom)'
        },
        persona_prompt: {
          type: Type.STRING,
          description: 'Optional prompt/description for custom persona when persona_id is "custom"'
        }
      },
      required: []
    }
  };
  /**
   * Map function names to their actual implementation functions
   */
  const toolFunctionImplementations = {
    // User functions
    get_user_info: async ({ chat_id, user_identifier }, context) => {
      try {
        const targetId = user_identifier || context.msg.reply_to_message?.from?.id;
        if (!targetId) {
          return { success: false, error: 'No user specified. Please reply to a message or provide user ID/username.' };
        }
        let userId = targetId;
        if (isNaN(targetId)) {
          // It's a username, look it up
          const resolved = await context.deps.resolveTargetId?.(chat_id, targetId);
          userId = resolved;
        }
        if (!userId) {
          return { success: false, error: `User ${targetId} not found.` };
        }
        const userInfo = await context.deps.resolveUserProfile?.(chat_id, userId);
        return {
          success: true,
          user_id: userId,
          username: userInfo?.username || null,
          first_name: userInfo?.first_name || null,
          last_name: userInfo?.last_name || null,
          full_name: [userInfo?.first_name, userInfo?.last_name].filter(Boolean).join(' ') || null
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    get_member_count: async ({ chat_id }, context) => {
      try {
        const count = await bot.getChatMemberCount(chat_id);
        return {
          success: true,
          chat_id,
          member_count: count,
          message: `The group has ${count} members.`
        };
      } catch (error) {
        return { success: false, error: `Failed to get member count: ${error.message}` };
      }
    },
    // Admin functions
    ban_member: async ({ chat_id, user_id, reason, revoke_messages = true }, context) => {
      try {
        await bot.banChatMember(chat_id, user_id, { revoke_messages });
        return {
          success: true,
          action: 'ban',
          chat_id,
          user_id,
          reason: reason || 'No reason provided',
          message: `Successfully banned user ${user_id}${reason ? ` for: ${reason}` : ''}`
        };
      } catch (error) {
        return { success: false, error: `Failed to ban user: ${error.message}` };
      }
    },
    kick_member: async ({ chat_id, user_id, reason }, context) => {
      try {
        const until = Math.floor(Date.now() / 1000) + 60;
        await bot.banChatMember(chat_id, user_id, { until_date: until });
        await bot.unbanChatMember(chat_id, user_id, { only_if_banned: true });
        return {
          success: true,
          action: 'kick',
          chat_id,
          user_id,
          reason: reason || 'No reason provided',
          message: `Successfully kicked user ${user_id}${reason ? ` for: ${reason}` : ''}`
        };
      } catch (error) {
        return { success: false, error: `Failed to kick user: ${error.message}` };
      }
    },
    mute_member: async ({ chat_id, user_id, duration_seconds = 3600, reason }, context) => {
      try {
        const until = Math.floor(Date.now() / 1000) + duration_seconds;
        await bot.restrictChatMember(chat_id, user_id, {
          until_date: until,
          permissions: { can_send_messages: false }
        });
        return {
          success: true,
          action: 'mute',
          chat_id,
          user_id,
          duration_seconds,
          reason: reason || 'No reason provided',
          message: `Successfully muted user ${user_id} for ${duration_seconds} seconds${reason ? ` - ${reason}` : ''}`
        };
      } catch (error) {
        return { success: false, error: `Failed to mute user: ${error.message}` };
      }
    },
    unmute_member: async ({ chat_id, user_id }, context) => {
      try {
        await bot.restrictChatMember(chat_id, user_id, {
          permissions: { can_send_messages: true }
        });
        return {
          success: true,
          action: 'unmute',
          chat_id,
          user_id,
          message: `Successfully unmuted user ${user_id}`
        };
      } catch (error) {
        return { success: false, error: `Failed to unmute user: ${error.message}` };
      }
    },
    warn_member: async ({ chat_id, user_id, reason }, context) => {
      try {
        // This would integrate with existing warn system
        return {
          success: true,
          action: 'warn',
          chat_id,
          user_id,
          reason,
          message: `Warning issued to user ${user_id} for: ${reason}`
        };
      } catch (error) {
        return { success: false, error: `Failed to warn user: ${error.message}` };
      }
    },
    // Owner functions
    set_command_limit: async ({ limit, user_id }, context) => {
      try {
        // Would integrate with existing limit system
        const target = user_id || 'global';
        return {
          success: true,
          action: 'set_limit',
          target,
          limit,
          message: `Set AI command limit to ${limit} per day for ${target}`
        };
      } catch (error) {
        return { success: false, error: `Failed to set limit: ${error.message}` };
      }
    },
    // ========================================================================
    // RANDOM/GAMING FUNCTION IMPLEMENTATIONS
    // ========================================================================
    // Bot self-introduction
    get_bot_introduction: async ({ }, context) => {
      try {
        const { msg } = context;
        const lang = await getLang(msg);
        const introduction = t(lang, 'aib_bot_introduction') ||
          "I'm Xlayer Bot AI, a virtual assistant helping OKX's Xlayer community. Developed by DOREMON (x.com/haivcon_X)";
        return {
          success: true,
          introduction,
          message: introduction
        };
      } catch (error) {
        return { success: false, error: `Failed to get introduction: ${error.message}` };
      }
    },
    play_dice: async ({ notation }, context) => {
      try {
        // Parse dice notation (e.g., "2d6")
        const match = /^([1-9]\d*)d([1-9]\d*)$/i.exec((notation || '').trim());
        if (!match) {
          return {
            success: false,
            error: 'Invalid dice notation. Use format like "2d6" (2 six-sided dice)'
          };
        }
        const count = Math.min(10, Math.max(1, parseInt(match[1])));
        const faces = Math.min(100, Math.max(2, parseInt(match[2])));
        // Roll the dice
        const rolls = [];
        for (let i = 0; i < count; i++) {
          rolls.push(Math.floor(Math.random() * faces) + 1);
        }
        const total = rolls.reduce((sum, val) => sum + val, 0);
        return {
          success: true,
          notation: `${count}d${faces}`,
          rolls,
          total,
          message: `Rolled ${count}d${faces}: [${rolls.join(', ')}] = ${total}`
        };
      } catch (error) {
        return { success: false, error: `Failed to roll dice: ${error.message}` };
      }
    },
    play_rps: async ({ choice }, context) => {
      try {
        const choices = ['rock', 'paper', 'scissors'];
        const icons = { rock: '🪨', paper: '📄', scissors: '✂️' };
        // Multilingual mapping
        const languageMap = {
          // Vietnamese
          'búa': 'rock', 'bao': 'paper', 'kéo': 'scissors',
          // Chinese
          '石头': 'rock', '布': 'paper', '剪刀': 'scissors',
          // Korean
          '바위': 'rock', '보': 'paper', '가위': 'scissors',
          // Russian
          'камень': 'rock', 'бумага': 'paper', 'ножницы': 'scissors',
          // Indonesian
          'batu': 'rock', 'kertas': 'paper', 'gunting': 'scissors'
        };
        let userChoice = (choice || '').toLowerCase().trim();
        // Map to English if needed
        if (languageMap[userChoice]) {
          userChoice = languageMap[userChoice];
        }
        if (!choices.includes(userChoice)) {
          return {
            success: false,
            error: 'Invalid choice. Must be rock/paper/scissors (or equivalent in your language)'
          };
        }
        const botChoice = choices[Math.floor(Math.random() * 3)];
        let outcome = 'draw';
        if (
          (userChoice === 'rock' && botChoice === 'scissors') ||
          (userChoice === 'paper' && botChoice === 'rock') ||
          (userChoice === 'scissors' && botChoice === 'paper')
        ) {
          outcome = 'win';
        } else if (userChoice !== botChoice) {
          outcome = 'lose';
        }
        return {
          success: true,
          your_choice: userChoice,
          bot_choice: botChoice,
          outcome,
          message: `You: ${icons[userChoice]} ${userChoice} | Bot: ${icons[botChoice]} ${botChoice} → ${outcome.toUpperCase()}!`
        };
      } catch (error) {
        return { success: false, error: `Failed to play RPS: ${error.message}` };
      }
    },
    generate_random_number: async ({ min = 1, max = 1000 }, context) => {
      try {
        const minVal = Math.floor(Math.min(min, max));
        const maxVal = Math.floor(Math.max(min, max));
        const result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
        return {
          success: true,
          min: minVal,
          max: maxVal,
          result,
          message: `Random number between ${minVal} and ${maxVal}: ${result}`
        };
      } catch (error) {
        return { success: false, error: `Failed to generate random number: ${error.message}` };
      }
    },
    generate_longshort: async ({ }, context) => {
      try {
        const isLong = Math.random() > 0.5;
        const leverage = Math.floor(Math.random() * 100) + 1;
        const position = isLong ? 'LONG' : 'SHORT';
        const icon = isLong ? '📈' : '📉';
        return {
          success: true,
          position,
          leverage,
          message: `${icon} ${position} ${leverage}x - Good luck with your trade!`
        };
      } catch (error) {
        return { success: false, error: `Failed to generate LONG/SHORT: ${error.message}` };
      }
    },
    random_choice: async ({ options }, context) => {
      try {
        if (!Array.isArray(options) || options.length < 2) {
          return {
            success: false,
            error: 'Provide at least 2 options to choose from'
          };
        }
        const index = Math.floor(Math.random() * options.length);
        const chosen = options[index];
        return {
          success: true,
          options,
          chosen,
          chosen_index: index + 1,
          message: `Random choice from ${options.length} options: ${chosen}`
        };
      } catch (error) {
        return { success: false, error: `Failed to make random choice: ${error.message}` };
      }
    },
    get_fortune: async ({ topic_code }, context) => {
      try {
        // Simple fortune messages
        const fortunes = [
          "Good luck will come your way soon",
          "A pleasant surprise is in store for you",
          "Your hard work will pay off",
          "An exciting opportunity is coming",
          "Trust your instincts",
          "A new friendship will bring joy",
          "Your creativity will flourish",
          "Patience will bring rewards",
          "A journey awaits you",
          "Success is on the horizon"
        ];
        const index = topic_code ?
          (topic_code - 1) % fortunes.length :
          Math.floor(Math.random() * fortunes.length);
        const fortune = fortunes[index];
        return {
          success: true,
          fortune,
          message: `🔮 Fortune: "${fortune}"`
        };
      } catch (error) {
        return { success: false, error: `Failed to get fortune: ${error.message}` };
      }
    },
    create_quiz: async ({ }, context) => {
      try {
        // Simple math quiz
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        const operators = ['+', '-', '*'];
        const operator = operators[Math.floor(Math.random() * operators.length)];
        let answer;
        switch (operator) {
          case '+': answer = num1 + num2; break;
          case '-': answer = num1 - num2; break;
          case '*': answer = num1 * num2; break;
        }
        // Generate wrong answers
        const options = [
          answer,
          answer + Math.floor(Math.random() * 5) + 1,
          answer - Math.floor(Math.random() * 5) - 1,
          answer + Math.floor(Math.random() * 10) + 5
        ].sort(() => Math.random() - 0.5);
        const question = `What is ${num1} ${operator} ${num2}?`;
        return {
          success: true,
          question,
          options,
          correct_answer: answer,
          message: `Quiz: ${question}\nOptions: ${options.join(', ')}\nCorrect answer: ${answer}`
        };
      } catch (error) {
        return { success: false, error: `Failed to create quiz: ${error.message}` };
      }
    },
    // ========================================================================
    // INTERACTIVE GAME STARTERS - Enhanced messages with clear instructions
    // ========================================================================
    start_memory_game: async ({ theme = 'mixed', size = '4x4' }, context) => {
      try {
        const [rows, cols] = size.split('x').map(n => parseInt(n) || 4);
        return {
          success: true,
          game_type: 'memory',
          theme,
          size: `${rows}x${cols}`,
          message: `🧠 Memory Game Created!\n\n` +
            `➤ Theme: ${theme}\n` +
            `➤ Grid: ${rows}x${cols}\n\n` +
            `Ready to play! Use the /memory command to start flipping cards and matching pairs.\n` +
            `Tip: Type /memory ${theme} ${rows}x${cols} to launch this exact setup.`
        };
      } catch (error) {
        return { success: false, error: `Failed to configure memory game: ${error.message}` };
      }
    },
    start_minesweeper: async ({ size = '5x5' }, context) => {
      try {
        const [rows, cols] = size.split('x').map(n => parseInt(n) || 5);
        return {
          success: true,
          game_type: 'minesweeper',
          size: `${rows}x${cols}`,
          message: `💣 Minesweeper Game Ready!\n\n` +
            `➤ Grid: ${rows}x${cols}\n\n` +
            `Use /mines command to start the game with interactive buttons.\n` +
            `Features: flag mode, replay, auto-reveal nearby cells.\n` +
            `Quick start: /mines ${rows}x${cols}`
        };
      } catch (error) {
        return { success: false, error: `Failed to configure minesweeper: ${error.message}` };
      }
    },
    start_treasure_hunt: async ({ size = '6x6' }, context) => {
      try {
        const gridSize = size.includes('x') ? size : `${size}x${size}`;
        const [rows, cols] = gridSize.split('x').map(n => parseInt(n) || 6);
        return {
          success: true,
          game_type: 'treasure',
          size: `${rows}x${cols}`,
          message: `🧭 Treasure Hunt Initialized!\n\n` +
            `➤ Map: ${rows}x${cols}\n\n` +
            `Search for hidden treasure! Use /treasure to start.\n` +
            `Radar hints show distance, avoid traps!\n` +
            `Commands: /treasure ${rows}x${cols}`
        };
      } catch (error) {
        return { success: false, error: `Failed to setup treasure hunt: ${error.message}` };
      }
    },
    start_sudoku: async ({ size = 9 }, context) => {
      try {
        const validSizes = [4, 6, 9];
        const boardSize = validSizes.includes(size) ? size : 9;
        const difficulty = boardSize === 4 ? 'Easy' : boardSize === 6 ? 'Medium' : 'Hard';
        return {
          success: true,
          game_type: 'sudoku',
          size: boardSize,
          difficulty,
          message: `🔢 Sudoku Puzzle Generated!\n\n` +
            `➤ Size: ${boardSize}x${boardSize}\n` +
            `➤ Difficulty: ${difficulty}\n\n` +
            `Solve the puzzle using /sudoku command.\n` +
            `Select cells, fill numbers, clear mistakes.\n` +
            `Launch: /sudoku ${boardSize}`
        };
      } catch (error) {
        return { success: false, error: `Failed to generate sudoku: ${error.message}` };
      }
    },
    start_gomoku: async ({ board_size }, context) => {
      try {
        const size = (board_size && board_size >= 7 && board_size <= 12) ? board_size : 8;
        return {
          success: true,
          game_type: 'gomoku',
          board_size: `8x${size}`,
          message: `⭕ Gomoku Board Set!\n\n` +
            `➤ Board: 8x${size} (5-in-a-row)\n\n` +
            `Play against AI using /gomoku command.\n` +
            `Get 5 in a row to win!\n` +
            `Start: /gomoku 8x${size}`
        };
      } catch (error) {
        return { success: false, error: `Failed to setup gomoku: ${error.message}` };
      }
    },
    start_chess: async ({ }, context) => {
      try {
        return {
          success: true,
          game_type: 'chess',
          message: `♟️ Chess Match Ready!\n\n` +
            `➤ Board: Standard 8x8\n` +
            `➤ Opponent: AI Bot\n\n` +
            `Challenge the AI using /chess command.\n` +
            `Tap pieces to select, tap squares to move.\n` +
            `Commands: /chess`
        };
      } catch (error) {
        return { success: false, error: `Failed to setup chess: ${error.message}` };
      }
    },
    // ========================================================================
    // XLAYER CHECK FUNCTION IMPLEMENTATIONS
    // Use bot.processUpdate() to trigger native command handlers
    // ========================================================================
    check_wallet_balance: async ({ address }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = address ? `/mywallet ${address}` : '/mywallet';
        // Trigger native /mywallet command
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'check_wallet',
          message: 'Opening wallet manager...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check wallet: ${error.message}` };
      }
    },
    delete_chat_history: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/rmchat',
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'delete_chat_history',
          message: 'Clearing chat history...'
        };
      } catch (error) {
        return { success: false, error: `Failed to delete chat history: ${error.message}` };
      }
    },
    get_token_info: async ({ token }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = token ? `/token ${token}` : '/token';
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 6 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'token_info',
          token,
          message: `Looking up token: ${token || 'default'}...`
        };
      } catch (error) {
        return { success: false, error: `Failed to get token info: ${error.message}` };
      }
    },
    lookup_contract: async ({ address }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/contract ${address}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'contract_lookup',
          address,
          message: 'Looking up contract...'
        };
      } catch (error) {
        return { success: false, error: `Failed to lookup contract: ${error.message}` };
      }
    },
    lookup_transaction: async ({ txhash }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/txhash ${txhash}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'transaction_lookup',
          txhash,
          message: 'Looking up transaction...'
        };
      } catch (error) {
        return { success: false, error: `Failed to lookup transaction: ${error.message}` };
      }
    },
    check_okx_chains: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/okxchains',
            entities: [{ type: 'bot_command', offset: 0, length: 10 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'check_chains',
          message: 'Getting supported chains...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check chains: ${error.message}` };
      }
    },
    check_okx402_status: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/okx402status',
            entities: [{ type: 'bot_command', offset: 0, length: 13 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'check_okx402',
          message: 'Checking OKX 402 status...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check OKX402 status: ${error.message}` };
      }
    },

    get_group_info: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/info',
            entities: [{ type: 'bot_command', offset: 0, length: 5 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'group_info',
          message: 'Getting group information...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get group info: ${error.message}` };
      }
    },
    get_checkin_stats: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/checkin',
            entities: [{ type: 'bot_command', offset: 0, length: 8 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'checkin_stats',
          message: 'Getting checkin stats...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get checkin stats: ${error.message}` };
      }
    },
    // ========================================================================
    // CHECKIN & WALLET FUNCTION IMPLEMENTATIONS
    // ========================================================================
    do_checkin: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/checkin',
            entities: [{ type: 'bot_command', offset: 0, length: 8 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'do_checkin',
          message: 'Processing check-in...'
        };
      } catch (error) {
        return { success: false, error: `Failed to check-in: ${error.message}` };
      }
    },
    get_checkin_leaderboard: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/topcheckin',
            entities: [{ type: 'bot_command', offset: 0, length: 11 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'checkin_leaderboard',
          message: 'Getting check-in leaderboard...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get leaderboard: ${error.message}` };
      }
    },
    check_token_price: async ({ symbol, chain }, context) => {
      try {
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        const keyword = (symbol || '').trim();
        if (!keyword) {
          return { success: false, error: 'No token symbol provided. Please specify a token like OKB, BTC, ETH.' };
        }
        // Map chain name to chainIndex
        const chainNameToIndex = {
          'ethereum': '1', 'eth': '1', 'bsc': '56', 'binance': '56', 'xlayer': '196', 'x layer': '196',
          'solana': '501', 'sol': '501', 'polygon': '137', 'avalanche': '43114', 'avax': '43114',
          'arbitrum': '42161', 'arb': '42161', 'optimism': '10', 'op': '10', 'base': '8453'
        };
        const specifiedChainIndex = chain ? chainNameToIndex[chain.toLowerCase()] || null : null;
        // Well-known tokens — instant lookup
        const KNOWN_TOKENS = {
          'BTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Bitcoin (Wrapped)' },
          'WBTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Wrapped Bitcoin' },
          'ETH': { chainIndex: '1', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', fullName: 'Ethereum' },
          'USDT': { chainIndex: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', fullName: 'Tether USD' },
          'USDC': { chainIndex: '1', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', fullName: 'USD Coin' },
          'BNB': { chainIndex: '56', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB', fullName: 'BNB' },
          'SOL': { chainIndex: '501', address: '11111111111111111111111111111111', symbol: 'SOL', fullName: 'Solana' },
          'DOGE': { chainIndex: '1', address: '0x4206931337dc273a630d328da6441786bfad668f', symbol: 'DOGE', fullName: 'Dogecoin' },
          'OKB': { chainIndex: '196', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'OKB', fullName: 'OKB' }
        };
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '43114': 'Avalanche', '42161': 'Arbitrum', '10': 'Optimism', '8453': 'Base' };
        const upperKeyword = keyword.toUpperCase();
        // Known token → instant price card
        const known = KNOWN_TOKENS[upperKeyword];
        const lang = getLang(msg.chat.id);
        if (known) {
          const priceCard = await _buildPriceCard(onchainos, known.chainIndex, known.address, known.symbol, known.fullName, chainNames, t, lang);
          return { success: true, displayMessage: priceCard };
        }
        // Search across chains (filter by specified chain if any)
        const searchChains = specifiedChainIndex || '196,1,56,501,43114,42161,10,8453,137';
        const searchResults = await onchainos.getTokenSearch(searchChains, keyword).catch(() => null);
        if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
          return { success: false, error: `Token "${keyword}" not found${specifiedChainIndex ? ` on ${chain}` : ''}. Try full name or contract address.` };
        }
        // If chain specified or exactly 1 result → show price directly
        if (specifiedChainIndex || searchResults.length === 1) {
          const sr = searchResults[0];
          const priceCard = await _buildPriceCard(onchainos, sr.chainIndex, sr.tokenContractAddress, sr.tokenSymbol, sr.tokenFullName, chainNames, t, lang);
          // Send via bot for HTML formatting
          await bot.sendMessage(msg.chat.id, priceCard, {
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
            message_thread_id: msg.message_thread_id || undefined,
            disable_web_page_preview: true
          });
          return { success: true, action: 'price_displayed', displayMessage: t(lang, 'ai_token_search_found_single', { symbol: sr.tokenSymbol }) || `Price displayed for ${sr.tokenSymbol}.` };
        }
        // Multiple results → paginated inline keyboard
        // Cache search results for callback (includes t and lang for i18n)
        const cacheKey = `tks_${Date.now()}_${msg.from?.id || 0}`;
        _tokenSearchCache.set(cacheKey, { results: searchResults, keyword, chainNames, timestamp: Date.now(), t, lang });
        // Clean old cache entries (>10 min)
        for (const [k, v] of _tokenSearchCache.entries()) {
          if (Date.now() - v.timestamp > 600000) _tokenSearchCache.delete(k);
        }
        // Send paginated list
        const page = 0;
        const pageText = _buildTokenListPage(searchResults, keyword, page, chainNames, t, lang);
        const keyboard = _buildTokenListKeyboard(searchResults, cacheKey, page, t, lang);
        await bot.sendMessage(msg.chat.id, pageText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
          reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined
        });
        return {
          success: true,
          action: 'token_search_list',
          displayMessage: t(lang, 'ai_token_search_found_multi', { count: searchResults.length, keyword }) || `Found ${searchResults.length} tokens matching "${keyword}". Sent selection list.`
        };
      } catch (error) {
        return { success: false, error: `Failed to check price: ${error.message}` };
      }
    },
    get_my_wallet: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/mywallet',
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'my_wallet',
          message: 'Getting wallet information...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get wallet: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // Direct wallet balance lookup - calls API and returns data
    // ────────────────────────────────────────────────────────────
    check_wallet_balance_direct: async ({ address }, context) => {
      try {
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        if (!address || !address.trim()) {
          return { success: false, error: 'No wallet address provided.' };
        }
        let walletAddress = address.trim();
        const originalAddress = walletAddress;
        // Convert XKO prefix to 0x for API compatibility
        if (/^XKO/i.test(walletAddress)) {
          walletAddress = '0x' + walletAddress.slice(3);
        }
        const chainSlugs = { '1': 'eth', '56': 'bsc', '196': 'xlayer', '137': 'polygon', '501': 'solana', '42161': 'arbitrum', '8453': 'base' };
        // Feature 7: Check if address is a token contract (not a wallet)
        const tryChains = ['196', '1', '56'];
        for (const ci of tryChains) {
          const tokenInfo = await onchainos.getTokenBasicInfo([{ chainIndex: ci, tokenContractAddress: walletAddress }]).catch(() => null);
          if (tokenInfo && Array.isArray(tokenInfo) && tokenInfo.length > 0 && tokenInfo[0].tokenSymbol) {
            const ti = tokenInfo[0];
            const wLang = getLang(msg.chat.id);
            const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base' };
            const priceCard = await _buildPriceCard(onchainos, ci, walletAddress, ti.tokenSymbol, ti.tokenFullName || ti.tokenSymbol, chainNames, t, wLang);
            await bot.sendMessage(msg.chat.id, `💡 ${t(wLang, 'ai_detected_token')}\n\n` + priceCard, {
              parse_mode: 'HTML', reply_to_message_id: msg.message_id,
              message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
            });
            return { success: true, action: 'token_detected', displayMessage: `Detected token contract: ${ti.tokenSymbol}` };
          }
        }
        // Chain map
        const chains = '196,1,56';
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base' };
        const [totalValue, balances] = await Promise.all([
          onchainos.getWalletTotalValue(walletAddress, chains).catch(() => null),
          onchainos.getWalletBalances(walletAddress, chains).catch(() => null)
        ]);
        // Parse aggregate total
        let totalUSD = 0;
        if (totalValue && Array.isArray(totalValue) && totalValue.length > 0) {
          totalUSD = Number(totalValue[0].totalValue || 0);
        }
        // Extract token holdings with correct field names
        let holdings = [];
        const chainTotals = {};
        if (balances && Array.isArray(balances)) {
          balances.forEach(b => {
            const tokenList = b?.tokenAssets || [];
            if (Array.isArray(tokenList)) {
              tokenList.forEach(t => {
                const bal = Number(t.balance || t.holdingAmount || 0);
                const price = Number(t.tokenPrice || 0);
                const valueUSD = price * bal;
                const ci = t.chainIndex || '';
                if (bal > 0) {
                  holdings.push({
                    symbol: t.symbol || t.tokenSymbol || '?',
                    name: t.tokenName || '',
                    amount: bal,
                    price,
                    valueUSD,
                    chain: ci,
                    address: t.tokenContractAddress || ''
                  });
                  chainTotals[ci] = (chainTotals[ci] || 0) + valueUSD;
                }
              });
            }
          });
        }
        holdings.sort((a, b) => b.valueUSD - a.valueUSD);
        const topHoldings = holdings.slice(0, 15);
        const wLang = getLang(msg.chat.id);
        // Build professional display message with OKX Explorer links
        const addrShort = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        const mainChain = Object.keys(chainTotals).sort((a, b) => (chainTotals[b] || 0) - (chainTotals[a] || 0))[0] || '196';
        const explorerSlug = chainSlugs[mainChain] || 'xlayer';
        const explorerLink = `https://www.okx.com/web3/explorer/${explorerSlug}/address/${walletAddress}`;
        let card = `👛 <b>${t(wLang, 'ai_wallet_analysis')}</b>`;
        // Feature 5: Whale badge
        if (totalUSD >= 10000) card += ` ${t(wLang, 'ai_whale_badge')}`;
        card += `\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        card += `📍 <a href="${explorerLink}">${addrShort}</a>`;
        if (originalAddress !== walletAddress) card += ` (${originalAddress.slice(0, 6)}...)`;
        card += `\n`;
        card += `💰 ${t(wLang, 'ai_wallet_total')}: <b>$${totalUSD.toFixed(2)}</b>\n`;
        // Chain breakdown
        const activeChains = Object.entries(chainTotals).filter(([, v]) => v > 0.001).sort((a, b) => b[1] - a[1]);
        if (activeChains.length > 0) {
          card += `\n🔗 <b>${t(wLang, 'ai_wallet_chains')}:</b>\n`;
          activeChains.forEach(([ci, val]) => {
            card += `   ${chainNames[ci] || ci}: $${val.toFixed(2)}\n`;
          });
        }
        // Token holdings
        if (topHoldings.length > 0) {
          card += `\n📊 <b>${t(wLang, 'ai_wallet_top_tokens', { count: holdings.length })}:</b>\n`;
          topHoldings.forEach((h, i) => {
            const amtStr = h.amount < 0.001 ? h.amount.toFixed(8) : h.amount < 1 ? h.amount.toFixed(4) : h.amount > 1e6 ? (h.amount / 1e6).toFixed(2) + 'M' : h.amount.toFixed(2);
            const chain = chainNames[h.chain] || h.chain;
            const tokenLink = h.address ? `https://www.okx.com/web3/explorer/${chainSlugs[h.chain] || explorerSlug}/token/${h.address}` : '';
            const symDisplay = tokenLink ? `<a href="${tokenLink}">${h.symbol}</a>` : `<b>${h.symbol}</b>`;
            card += `   ${i + 1}. ${symDisplay} · ${amtStr} · $${h.valueUSD.toFixed(2)} · ${chain}\n`;
          });
        } else {
          card += `\n📭 ${t(wLang, 'ai_wallet_no_tokens')}\n`;
        }
        // Feature 6: TX History link
        card += `\n📃 <a href="${explorerLink}">${t(wLang, 'ai_wallet_tx_history')}</a>\n`;
        // Send directly via bot for proper HTML formatting
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML',
          reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined,
          disable_web_page_preview: true
        });
        return {
          success: true,
          action: 'wallet_displayed',
          displayMessage: `Wallet ${addrShort}: $${totalUSD.toFixed(2)} with ${holdings.length} tokens.`
        };
      } catch (error) {
        return { success: false, error: `Failed to check wallet: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // Token Compare - side by side price comparison
    // ────────────────────────────────────────────────────────────
    compare_tokens: async ({ symbols }, context) => {
      try {
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
          return { success: false, error: 'Need at least 2 token symbols to compare.' };
        }
        const toCompare = symbols.slice(0, 4).map(s => s.trim().toUpperCase());
        const KNOWN_TOKENS = {
          'BTC': { chainIndex: '1', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', fullName: 'Bitcoin' },
          'ETH': { chainIndex: '1', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', fullName: 'Ethereum' },
          'USDT': { chainIndex: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', fullName: 'Tether' },
          'BNB': { chainIndex: '56', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB', fullName: 'BNB' },
          'SOL': { chainIndex: '501', address: '11111111111111111111111111111111', symbol: 'SOL', fullName: 'Solana' },
          'OKB': { chainIndex: '196', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'OKB', fullName: 'OKB' }
        };
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '137': 'Polygon', '501': 'Solana', '42161': 'Arbitrum', '8453': 'Base' };
        const lang = getLang(msg.chat.id);
        // Resolve each symbol to chain+address
        const resolved = await Promise.all(toCompare.map(async sym => {
          const known = KNOWN_TOKENS[sym];
          if (known) return { sym, chainIndex: known.chainIndex, address: known.address, fullName: known.fullName };
          const sr = await onchainos.getTokenSearch('196,1,56,501', sym).catch(() => []);
          if (sr && sr.length > 0) return { sym: sr[0].tokenSymbol, chainIndex: sr[0].chainIndex, address: sr[0].tokenContractAddress, fullName: sr[0].tokenFullName || sym };
          return null;
        }));
        const valid = resolved.filter(Boolean);
        if (valid.length < 2) return { success: false, error: 'Could not find enough tokens to compare.' };
        // Fetch prices+candles in parallel
        const data = await Promise.all(valid.map(async v => {
          const [priceInfo, candles] = await Promise.all([
            onchainos.getTokenPriceInfo([{ chainIndex: v.chainIndex, tokenContractAddress: v.address }]).catch(() => null),
            onchainos.getMarketCandles(v.chainIndex, v.address, { bar: '1D', limit: 7 }).catch(() => null)
          ]);
          const info = priceInfo && Array.isArray(priceInfo) && priceInfo.length > 0 ? priceInfo[0] : {};
          return { ...v, price: Number(info.price || 0), change24h: Number(info.priceChange24H || 0), marketCap: Number(info.marketCap || 0), sparkline: _buildSparkline(candles) };
        }));
        // Build comparison card
        let card = `⚖️ <b>${t(lang, 'ai_compare_title')}</b>\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        data.forEach((d, i) => {
          const priceStr = d.price < 0.0001 ? d.price.toFixed(10) : d.price < 0.01 ? d.price.toFixed(8) : d.price < 1 ? d.price.toFixed(4) : d.price.toFixed(2);
          const changeStr = `${d.change24h >= 0 ? '+' : ''}${d.change24h.toFixed(2)}%`;
          const changeIcon = d.change24h >= 0 ? '📈' : '📉';
          const mCapStr = d.marketCap > 1e9 ? (d.marketCap / 1e9).toFixed(2) + 'B' : d.marketCap > 1e6 ? (d.marketCap / 1e6).toFixed(2) + 'M' : '$' + d.marketCap.toFixed(0);
          card += `\n<b>${i + 1}. ${d.sym}</b> (${d.fullName})\n`;
          card += `   💵 $${priceStr}  ${changeIcon} ${changeStr}\n`;
          if (d.marketCap > 0) card += `   📊 MCap: $${mCapStr}\n`;
          if (d.sparkline) card += `   📉 <code>${d.sparkline}</code>\n`;
          card += `   🔗 ${chainNames[d.chainIndex] || d.chainIndex}\n`;
        });
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
        });
        return { success: true, action: 'compare_displayed', displayMessage: `Compared ${valid.map(v => v.sym).join(' vs ')}.` };
      } catch (error) {
        return { success: false, error: `Failed to compare: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // AI Insight: Token Analysis with Technical Indicators
    // ────────────────────────────────────────────────────────────
    analyze_token: async ({ symbol, chain }, context) => {
      try {
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        const lang = getLang(msg.chat.id);
        // Resolve token
        const KNOWN = {
          'BTC': { ci: '1', addr: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', fn: 'Bitcoin' },
          'ETH': { ci: '1', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'Ethereum' },
          'OKB': { ci: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'OKB' },
          'BNB': { ci: '56', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'BNB' },
          'BANMAO': { ci: '196', addr: '0x9bA84834c10d07372e33D4C105F08C984b03a5e0', fn: '$BANMAO' }
        };
        const upper = symbol.toUpperCase();
        let chainIndex, tokenAddress, fullName;
        if (KNOWN[upper]) { chainIndex = KNOWN[upper].ci; tokenAddress = KNOWN[upper].addr; fullName = KNOWN[upper].fn; }
        else {
          const sr = await onchainos.getTokenSearch(chain || '196,1,56,501', symbol).catch(() => []);
          if (sr && sr.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; fullName = sr[0].tokenFullName || upper; }
          else return { success: false, error: `Token "${symbol}" not found.` };
        }
        // Fetch 30D candles (1H bars = 720 points) + recent trades + current price
        const [candles1H, candles1D, trades, priceInfo] = await Promise.all([
          onchainos.getMarketCandles(chainIndex, tokenAddress, { bar: '1H', limit: 168 }).catch(() => []),
          onchainos.getMarketCandles(chainIndex, tokenAddress, { bar: '1D', limit: 30 }).catch(() => []),
          onchainos.getMarketTrades(chainIndex, tokenAddress, { limit: 20 }).catch(() => []),
          onchainos.getTokenPriceInfo([{ chainIndex, tokenContractAddress: tokenAddress }]).catch(() => [])
        ]);
        const info = priceInfo && priceInfo.length > 0 ? priceInfo[0] : {};
        const price = Number(info.price || 0);
        const change24h = Number(info.priceChange24H || 0);
        const volume24h = Number(info.volume24H || 0);
        const marketCap = Number(info.marketCap || 0);
        // Compute technical indicators from 1H candles
        const closes1H = _extractCandelCloses(candles1H);
        const closes1D = _extractCandelCloses(candles1D);
        const rsi14 = _calculateRSI(closes1H, 14);
        const ma7 = _calculateMA(closes1D, 7);
        const ma25 = _calculateMA(closes1D, 25);
        const sparkline = _buildSparkline(candles1D);
        // Whale trade detection
        let whaleBuys = 0, whaleSells = 0, whaleCount = 0;
        if (trades && Array.isArray(trades)) {
          trades.forEach(tr => {
            const val = Number(tr.tradeValue || tr.amount || 0);
            const side = tr.side || tr.type || '';
            if (val > 1000) {
              whaleCount++;
              if (side === 'buy' || side === '1') whaleBuys++; else whaleSells++;
            }
          });
        }
        // RSI interpretation
        let rsiLabel = t(lang, 'ai_neutral');
        let rsiEmoji = '⚪';
        if (rsi14 !== null) {
          if (rsi14 > 70) { rsiLabel = t(lang, 'ai_overbought'); rsiEmoji = '🔴'; }
          else if (rsi14 < 30) { rsiLabel = t(lang, 'ai_oversold'); rsiEmoji = '🟢'; }
          else if (rsi14 < 45) { rsiLabel = t(lang, 'ai_accumulation'); rsiEmoji = '🟡'; }
        }
        // MA cross signal
        let maSignal = '—';
        if (ma7 !== null && ma25 !== null) {
          maSignal = ma7 > ma25 ? '📈 Golden Cross (MA7 > MA25)' : '📉 Death Cross (MA7 < MA25)';
        }
        // Build analysis card
        const priceStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(4) : price.toFixed(2);
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
        let card = `📊 <b>${t(lang, 'ai_analysis_title')}: ${upper}</b> (${fullName})\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        card += `💵 $${priceStr}  ${change24h >= 0 ? '📈' : '📉'} ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%\n`;
        if (volume24h > 0) card += `📈 Vol 24h: $${volume24h > 1e6 ? (volume24h / 1e6).toFixed(2) + 'M' : volume24h.toFixed(0)}\n`;
        if (marketCap > 0) card += `📊 MCap: $${marketCap > 1e9 ? (marketCap / 1e9).toFixed(2) + 'B' : (marketCap / 1e6).toFixed(2) + 'M'}\n`;
        if (sparkline) card += `📉 30D: <code>${sparkline}</code>\n`;
        card += `\n<b>📐 ${t(lang, 'ai_rsi_label')}:</b> ${rsi14 !== null ? rsi14.toFixed(1) : '—'} ${rsiEmoji} ${rsiLabel}\n`;
        card += `<b>📏 MA-7:</b> $${ma7 !== null ? ma7.toFixed(ma7 < 1 ? 8 : 2) : '—'}\n`;
        card += `<b>📏 MA-25:</b> $${ma25 !== null ? ma25.toFixed(ma25 < 1 ? 8 : 2) : '—'}\n`;
        card += `<b>🔀 Signal:</b> ${maSignal}\n`;
        if (whaleCount > 0) {
          card += `\n🐋 ${t(lang, 'ai_whale_trades')}: ${whaleCount} (Buy: ${whaleBuys}, Sell: ${whaleSells})\n`;
        }
        card += `\n🔗 ${chainNames[chainIndex] || chainIndex}\n`;
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
        });
        // Return structured data for AI to provide verdict
        return {
          success: true,
          action: 'analysis_displayed',
          analysis: {
            symbol: upper, price, change24h, volume24h, marketCap,
            rsi14: rsi14 !== null ? Number(rsi14.toFixed(1)) : null,
            ma7: ma7 !== null ? Number(ma7.toFixed(8)) : null,
            ma25: ma25 !== null ? Number(ma25.toFixed(8)) : null,
            maSignal: ma7 && ma25 ? (ma7 > ma25 ? 'bullish' : 'bearish') : 'unknown',
            rsiSignal: rsi14 > 70 ? 'overbought' : rsi14 < 30 ? 'oversold' : rsi14 < 45 ? 'accumulation' : 'neutral',
            whaleBuys, whaleSells, whaleCount
          },
          displayMessage: `Analysis for ${upper}: RSI=${rsi14?.toFixed(1)}, MA7/25 ${ma7 > ma25 ? 'bullish' : 'bearish'}, ${whaleCount} whale trades. Please provide your AI analysis based on this data.`
        };
      } catch (error) {
        return { success: false, error: `Failed to analyze: ${error.message}` };
      }
    },
    // ────────────────────────────────────────────────────────────
    // Feature 2: P2E Reward Points
    // ────────────────────────────────────────────────────────────
    check_reward_points: async ({ }, context) => {
      try {
        const { dbGet, dbRun } = require('../../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        // Ensure row exists
        await dbRun('INSERT OR IGNORE INTO user_game_rewards (userId) VALUES (?)', [userId]);
        const row = await dbGet('SELECT * FROM user_game_rewards WHERE userId = ?', [userId]);
        const points = row?.points || 0;
        const redeemed = row?.totalRedeemed || 0;
        const banmaoValue = (points / 100).toFixed(2);
        return { success: true, displayMessage: `${t(lang, 'ai_reward_points')}\n━━━━━━━━━━━━━━━━━━\n⭐ ${points} ${t(lang, 'ai_points_label')}\n💰 ≈ ${banmaoValue} $BANMAO\n📊 ${t(lang, 'ai_total_redeemed')}: $${redeemed.toFixed(2)}\n\n💡 ${t(lang, 'ai_redeem_hint')}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    redeem_rewards: async ({ points }, context) => {
      try {
        const { dbGet, dbRun } = require('../../../db/core');
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        if (!points || points < 100) return { success: false, error: t(lang, 'ai_reward_insufficient') + ' (min 100)' };
        // Check balance
        await dbRun('INSERT OR IGNORE INTO user_game_rewards (userId) VALUES (?)', [userId]);
        const row = await dbGet('SELECT * FROM user_game_rewards WHERE userId = ?', [userId]);
        if ((row?.points || 0) < points) return { success: false, error: t(lang, 'ai_reward_insufficient') };
        // Check user wallet
        const user = await dbGet('SELECT wallets FROM users WHERE chatId = ?', [String(msg.chat.id)]);
        const wallets = user?.wallets ? JSON.parse(user.wallets) : [];
        if (!wallets.length) return { success: false, error: t(lang, 'ai_swap_need_wallet') };
        const userWallet = wallets[0].startsWith('XKO') ? '0x' + wallets[0].slice(3) : wallets[0];
        // Check bot wallet
        const botKey = process.env.BOT_REWARD_PRIVATE_KEY;
        if (!botKey || botKey === '123') return { success: false, error: t(lang, 'ai_swap_no_wallet_key') + '. Set BOT_REWARD_PRIVATE_KEY in .env' };
        const banmaoAmount = points / 100;
        // Deduct points first
        await dbRun('UPDATE user_game_rewards SET points = points - ?, totalRedeemed = totalRedeemed + ? WHERE userId = ?', [points, banmaoAmount, userId]);
        // Try to execute on-chain transfer
        try {
          const ethers = require('ethers');
          const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
          const botWallet = new ethers.Wallet(botKey, provider);
          const banmaoContract = process.env.CONTRACT_ADDRESS || '0x9bA84834c10d07372e33D4C105F08C984b03a5e0';
          const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
          const contract = new ethers.Contract(banmaoContract, erc20Abi, botWallet);
          const tx = await contract.transfer(userWallet, ethers.parseEther(String(banmaoAmount)));
          const receipt = await tx.wait();
          const explorerLink = `https://www.okx.com/web3/explorer/xlayer/tx/${receipt.hash}`;
          await bot.sendMessage(msg.chat.id, `🎉 <b>${t(lang, 'ai_reward_redeemed')}</b>\n\n💰 ${banmaoAmount} $BANMAO → <code>${userWallet.slice(0, 6)}...${userWallet.slice(-4)}</code>\n🔗 <a href="${explorerLink}">TX</a>`, {
            parse_mode: 'HTML', reply_to_message_id: msg.message_id, disable_web_page_preview: true
          });
          return { success: true, action: 'reward_sent', displayMessage: `Sent ${banmaoAmount} $BANMAO to ${userWallet.slice(0, 8)}...` };
        } catch (txErr) {
          // Refund points if transfer fails
          await dbRun('UPDATE user_game_rewards SET points = points + ?, totalRedeemed = totalRedeemed - ? WHERE userId = ?', [points, banmaoAmount, userId]);
          return { success: false, error: `Transfer failed: ${txErr.message}. Points refunded.` };
        }
      } catch (error) { return { success: false, error: error.message }; }
    },
    // ────────────────────────────────────────────────────────────
    // Trading Wallet Management (AI-triggered)
    // ────────────────────────────────────────────────────────────
    manage_trading_wallet: async ({ action, walletId, walletName, tags, privateKeys }, context) => {
      try {
        const { msg, bot } = context;
        let lang;
        try {
          const { getLang: _getLangAsync } = require('../../app/language');
          lang = await _getLangAsync(msg);
        } catch (_e) {
          lang = getLang(msg.chat.id);
        }
        const userId = String(msg.from?.id || msg.chat.id);
        const { dbGet, dbRun, dbAll } = require('../../../db/core');

        // ── Inline i18n for wallet management ──
        const _walletI18n = {
          wallet_prefix: { vi: 'Ví', en: 'Wallet', zh: '钱包', ko: '지갑', ru: 'Кошелёк', id: 'Dompet' },
          default_label: { vi: '⭐ Ví mặc định', en: '⭐ Default wallet', zh: '⭐ 默认钱包', ko: '⭐ 기본 지갑', ru: '⭐ Кошелёк по умолчанию', id: '⭐ Dompet utama' },
          which_delete: { vi: '❓ Chọn ví để xóa:', en: '❓ Which wallet to delete?', zh: '❓ 选择要删除的钱包:', ko: '❓ 삭제할 지갑 선택:', ru: '❓ Какой кошелёк удалить?', id: '❓ Pilih dompet untuk dihapus:' },
          which_default: { vi: '❓ Chọn ví đặt mặc định:', en: '❓ Which wallet to set as default?', zh: '❓ 选择默认钱包:', ko: '❓ 기본으로 설정할 지갑:', ru: '❓ Какой сделать по умолчанию?', id: '❓ Pilih dompet utama:' },
          specify_id: { vi: 'Vui lòng nhập ID ví.', en: 'Please specify the wallet ID.', zh: '请输入钱包 ID。', ko: '지갑 ID를 입력하세요.', ru: 'Укажите ID кошелька.', id: 'Masukkan ID dompet.' },
          not_found: { vi: '❌ Không tìm thấy ví ID', en: '❌ Wallet ID not found:', zh: '❌ 未找到钱包 ID:', ko: '❌ 지갑 ID를 찾을 수 없습니다:', ru: '❌ Кошелёк не найден:', id: '❌ ID Dompet tidak ditemukan:' },
          deleted: { vi: '✅ Đã xóa ví', en: '✅ Deleted wallet', zh: '✅ 已删除钱包', ko: '✅ 지갑 삭제됨', ru: '✅ Кошелёк удалён', id: '✅ Dompet dihapus' },
          now_default: { vi: 'đã được đặt làm ví mặc định.', en: 'is now the default wallet.', zh: '已设为默认钱包。', ko: '기본 지갑으로 설정되었습니다.', ru: 'теперь кошелёк по умолчанию.', id: 'sekarang menjadi dompet utama.' },
          renamed: { vi: '✅ Đã đổi tên ví thành', en: '✅ Wallet renamed to', zh: '✅ 钱包已重命名为', ko: '✅ 지갑 이름 변경:', ru: '✅ Кошелёк переименован в', id: '✅ Dompet diubah namanya menjadi' },
          tagged: { vi: '🏷 Đã gắn tag ví:', en: '🏷 Wallet tagged:', zh: '🏷 钱包已标记:', ko: '🏷 지갑 태그:', ru: '🏷 Кошелёк помечен:', id: '🏷 Tag dompet:' },
          need_id_name: { vi: '❌ Vui lòng cung cấp walletId và tên mới.', en: '❌ Please provide walletId and new name.', zh: '❌ 请提供钱包ID和新名称。', ko: '❌ walletId와 새 이름을 입력하세요.', ru: '❌ Укажите walletId и новое имя.', id: '❌ Masukkan walletId dan nama baru.' },
          need_id_tags: { vi: '❌ Vui lòng cung cấp walletId và tags.', en: '❌ Please provide walletId and tags.', zh: '❌ 请提供钱包ID和标签。', ko: '❌ walletId와 태그를 입력하세요.', ru: '❌ Укажите walletId и теги.', id: '❌ Masukkan walletId dan tag.' },
          unnamed: { vi: 'Chưa đặt tên', en: 'Unnamed', zh: '未命名', ko: '이름 없음', ru: 'Без имени', id: 'Tanpa nama' },
          current: { vi: 'hiện tại', en: 'current', zh: '当前', ko: '현재', ru: 'текущий', id: 'saat ini' },
          imported_prefix: { vi: 'Nhập', en: 'Imported', zh: '导入', ko: '가져옴', ru: 'Импорт', id: 'Impor' },
          already_exists: { vi: 'đã tồn tại', en: 'already exists', zh: '已存在', ko: '이미 존재', ru: 'уже существует', id: 'sudah ada' },
          imported_as: { vi: 'nhập thành', en: 'imported as', zh: '导入为', ko: '가져옴:', ru: 'импортирован как', id: 'diimpor sebagai' },
          invalid_key: { vi: '❌ Key không hợp lệ:', en: '❌ Invalid key:', zh: '❌ 无效密钥:', ko: '❌ 잘못된 키:', ru: '❌ Невалидный ключ:', id: '❌ Kunci tidak valid:' },
          import_results: { vi: '🔑 Kết quả nhập:', en: '🔑 Import Results:', zh: '🔑 导入结果:', ko: '🔑 가져오기 결과:', ru: '🔑 Результаты импорта:', id: '🔑 Hasil impor:' },
        };
        const wT = (key) => (_walletI18n[key] || {})[lang] || (_walletI18n[key] || {}).en || key;

        // Helper: encrypt a private key
        const encryptKey = (privateKey) => {
          const ENCRYPT_KEY = (process.env.WALLET_ENCRYPT_SECRET || process.env.TELEGRAM_TOKEN || '').slice(0, 32).padEnd(32, '0');
          const crypto = require('crypto');
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
          let encrypted = cipher.update(privateKey, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          return iv.toString('hex') + ':' + encrypted;
        };

        if (action === 'create') {
          // ── MULTI-WALLET CREATE ──
          const existingWallets = await dbAll('SELECT id, walletName FROM user_trading_wallets WHERE userId = ?', [userId]);
          const walletCount = existingWallets.length;
          const autoName = walletName || `${wT('wallet_prefix')} #${walletCount + 1}`;
          const isFirst = walletCount === 0;

          const ethers = require('ethers');
          const newWallet = ethers.Wallet.createRandom();
          const encryptedKey = encryptKey(newWallet.privateKey);

          await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, autoName, newWallet.address, encryptedKey, '196', isFirst ? 1 : 0, Math.floor(Date.now() / 1000)]);

          // Auto-register as watch wallet
          try {
            const dbModule = require('../../../db.js');
            await dbModule.addWalletToUser(userId, lang, newWallet.address, { name: autoName });
          } catch (err) {
            log.child('TW').error('Failed to auto-register watch wallet:', err.message);
          }

          let card = `${t(lang, 'tw_created')}\n━━━━━━━━━━━━━━━━━━\n`;
          card += `> 👛 ${autoName}\n`;
          card += `> ${t(lang, 'ai_wallet_address')}: <code>${newWallet.address}</code>\n`;
          if (isFirst) card += `> ${wT('default_label')}\n`;
          card += `> #${walletCount + 1}\n\n`;
          card += `${t(lang, 'tw_backup_warning').replace(/<[^>]+>/g, '')}`;
          await bot.sendMessage(msg.chat.id, card, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
          log.child('TW').info(`✔ Created wallet #${walletCount + 1} for user ${userId}: ${newWallet.address.slice(0, 8)}... (name: ${autoName})`);

          // Auto-trigger wallet manager
          try {
            const { buildWalletManagerMenu } = require('../walletUi')({ t, db: require('../../../db.js') });
            const menuData = await buildWalletManagerMenu(lang, msg.chat.id);
            await bot.sendMessage(msg.chat.id, `👛 ${t(lang, 'wallet_manager_title') || t(lang, 'wh_title')}\n\n${menuData.text}`, {
              parse_mode: 'HTML', reply_markup: menuData.replyMarkup, disable_web_page_preview: true
            });
          } catch (err) { log.child('TW').error('Failed to auto-trigger /mywallet:', err.message); }

          return { success: true, action: 'create_wallet', walletAddress: newWallet.address, walletName: autoName, walletNumber: walletCount + 1 };

        } else if (action === 'delete') {
          // ── SAFE DELETE by walletId ──
          if (!walletId) {
            const wallets = await dbAll('SELECT id, walletName, address, isDefault FROM user_trading_wallets WHERE userId = ?', [userId]);
            if (wallets.length === 0) return { success: true, displayMessage: t(lang, 'tw_none') };
            let list = `${wT('which_delete')}\n━━━━━━━━━━━━━━━━━━\n`;
            for (const w of wallets) {
              list += `🆔 ID: ${w.id} | ${w.walletName || wT('unnamed')} | ${w.address.slice(0, 6)}...${w.address.slice(-4)}${w.isDefault ? ' ⭐' : ''}\n`;
            }
            list += `\n${wT('specify_id')}`;
            return { success: true, displayMessage: list, needWalletId: true };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          if (target.isDefault) {
            const other = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND id != ?', [userId, walletId]);
            if (other) await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ?', [other.id]);
          }
          await dbRun('DELETE FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          return { success: true, displayMessage: `${wT('deleted')} ${target.walletName || target.address.slice(0, 8) + '...'} (ID: ${walletId})` };

        } else if (action === 'set_default') {
          // ── SET DEFAULT ──
          if (!walletId) {
            const wallets = await dbAll('SELECT id, walletName, address, isDefault FROM user_trading_wallets WHERE userId = ?', [userId]);
            if (wallets.length === 0) return { success: true, displayMessage: t(lang, 'tw_none') };
            let list = `${wT('which_default')}\n━━━━━━━━━━━━━━━━━━\n`;
            for (const w of wallets) {
              list += `🆔 ID: ${w.id} | ${w.walletName || wT('unnamed')} | ${w.address.slice(0, 6)}...${w.address.slice(-4)}${w.isDefault ? ` ⭐ (${wT('current')})` : ''}\n`;
            }
            return { success: true, displayMessage: list, needWalletId: true };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          await dbRun('UPDATE user_trading_wallets SET isDefault = 0 WHERE userId = ?', [userId]);
          await dbRun('UPDATE user_trading_wallets SET isDefault = 1 WHERE id = ? AND userId = ?', [walletId, userId]);
          return { success: true, displayMessage: `⭐ ${target.walletName || target.address.slice(0, 8) + '...'} ${wT('now_default')}` };

        } else if (action === 'rename') {
          // ── RENAME ──
          if (!walletId || !walletName) {
            return { success: false, displayMessage: wT('need_id_name') };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          const safeName = walletName.slice(0, 20);
          await dbRun('UPDATE user_trading_wallets SET walletName = ? WHERE id = ? AND userId = ?', [safeName, walletId, userId]);
          return { success: true, displayMessage: `${wT('renamed')} "${safeName}"` };

        } else if (action === 'tag') {
          // ── TAG ──
          if (!walletId || !tags) {
            return { success: false, displayMessage: wT('need_id_tags') };
          }
          const target = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          if (!target) return { success: false, displayMessage: `${wT('not_found')} ${walletId}` };
          const safeTags = tags.split(',').map(tg => tg.trim().toLowerCase()).filter(Boolean).join(',');
          await dbRun('UPDATE user_trading_wallets SET tags = ? WHERE id = ? AND userId = ?', [safeTags, walletId, userId]);
          return { success: true, displayMessage: `${wT('tagged')} ${safeTags}` };

        } else if (action === 'import') {
          // ── IMPORT via privateKeys arg ──
          if (privateKeys && privateKeys.trim()) {
            const ethers = require('ethers');
            const keys = privateKeys.trim().split(/[\s,]+/).filter(Boolean);
            const results = [];
            for (const pk of keys) {
              try {
                const w = new ethers.Wallet(pk);
                const dup = await dbGet('SELECT id FROM user_trading_wallets WHERE userId = ? AND address = ?', [userId, w.address]);
                if (dup) { results.push(`⚠️ ${w.address.slice(0, 8)}... ${wT('already_exists')}`); continue; }
                const existCount = (await dbAll('SELECT id FROM user_trading_wallets WHERE userId = ?', [userId])).length;
                const encryptedKey = encryptKey(pk);
                const isFirst = existCount === 0;
                const name = `${wT('imported_prefix')} #${existCount + 1}`;
                await dbRun('INSERT INTO user_trading_wallets (userId, walletName, address, encryptedKey, chainIndex, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [userId, name, w.address, encryptedKey, '196', isFirst ? 1 : 0, Math.floor(Date.now() / 1000)]);
                results.push(`✅ ${w.address.slice(0, 8)}...${w.address.slice(-4)} ${wT('imported_as')} "${name}"`);
              } catch (e) {
                results.push(`${wT('invalid_key')} ${pk.slice(0, 6)}...`);
              }
            }
            try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) { }
            await bot.sendMessage(msg.chat.id, `${wT('import_results')}\n━━━━━━━━━━━━━━━━━━\n${results.join('\n')}`, { parse_mode: 'HTML' });
            return { success: true, action: 'import_keys', imported: results.length };
          }
          // No keys provided — show hint
          await bot.sendMessage(msg.chat.id, t(lang, 'ai_import_wallet_hint'), { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
          return { success: true, action: 'import_hint' };

        } else if (action === 'export') {
          if (msg.chat.type !== 'private') {
            return { success: true, displayMessage: t(lang, 'ai_dm_only').replace(/<[^>]+>/g, '') };
          }
          // Export specific wallet or default
          let tw;
          if (walletId) {
            tw = await dbGet('SELECT * FROM user_trading_wallets WHERE id = ? AND userId = ?', [walletId, userId]);
          } else {
            tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ? AND isDefault = 1', [userId]);
            if (!tw) tw = await dbGet('SELECT * FROM user_trading_wallets WHERE userId = ?', [userId]);
          }
          if (!tw) { return { success: true, displayMessage: t(lang, 'tw_none') }; }
          const key = global._decryptTradingKey(tw.encryptedKey);
          const keyMsg = await bot.sendMessage(msg.chat.id, `${t(lang, 'tw_export_dm')}\n\n👛 ${tw.walletName || tw.address.slice(0, 8) + '...'}\n<code>${key}</code>\n\n⚠️ Auto-delete 30s`, { parse_mode: 'HTML' });
          setTimeout(() => { bot.deleteMessage(msg.chat.id, keyMsg.message_id).catch(() => { }); }, 30000);
          return { success: true, action: 'export_key' };

        } else if (action === 'balance' || action === 'menu') {
          await _sendTradingWalletMenu(bot, msg.chat.id, null, lang, userId, t);
          return { success: true, action: 'trading_menu_shown' };
        }

        // Default: show menu
        await _sendTradingWalletMenu(bot, msg.chat.id, null, lang, userId, t);
        return { success: true, action: 'trading_menu_shown' };
      } catch (error) { return { success: false, error: error.message }; }
    },
    // ────────────────────────────────────────────────────────────
    // Feature 3: Intent-based Trading (Swap Preview)
    // ────────────────────────────────────────────────────────────
    swap_intent: async ({ from_token, to_token, amount, chain }, context) => {
      try {
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        const lang = getLang(msg.chat.id);
        const chainIndex = chain || '196';
        // Resolve token addresses
        const TOKEN_MAP = {
          'OKB': { addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18 },
          'USDT': { addr: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', decimals: 6 },
          'USDC': { addr: '0x74b7f16337b8972027f6196a17a631ac6de26d22', decimals: 6 },
          'BANMAO': { addr: '0x9bA84834c10d07372e33D4C105F08C984b03a5e0', decimals: 18 },
          'ETH': { addr: '0x5a77f1443d16ee5761d310cf8e1133b13e41d25e', decimals: 18 },
          'WBTC': { addr: '0xea034fb02eb1808c2cc3adbc15f447b93cbe08a6', decimals: 8 }
        };
        const fromUpper = from_token.toUpperCase();
        const toUpper = to_token.toUpperCase();
        const fromInfo = TOKEN_MAP[fromUpper];
        const toInfo = TOKEN_MAP[toUpper];
        if (!fromInfo || !toInfo) {
          return { success: false, error: `${t(lang, 'ai_swap_token_not_supported')} ${t(lang, 'ai_swap_available')}: ${Object.keys(TOKEN_MAP).join(', ')}` };
        }
        // Calculate amount in minimal units
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) return { success: false, error: t(lang, 'ai_invalid_amount') };
        const minUnits = BigInt(Math.floor(amountNum * (10 ** fromInfo.decimals))).toString();
        // Get swap quote
        const quoteRaw = await onchainos.getSwapQuote({
          chainIndex, fromTokenAddress: fromInfo.addr, toTokenAddress: toInfo.addr, amount: minUnits
        }).catch(() => null);
        const quote = Array.isArray(quoteRaw) ? quoteRaw[0] : quoteRaw;
        if (!quote || !quote.toTokenAmount) {
          // No DEX pool — show helpful fallback with OKX DEX link
          const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
          const dexLink = `https://www.okx.com/web3/dex-swap#inputChain=${chainIndex}&inputCurrency=${fromInfo.addr}&outputChain=${chainIndex}&outputCurrency=${toInfo.addr}`;
          let fallback = `⚡ <b>${t(lang, 'ai_swap_preview')}</b>\n━━━━━━━━━━━━━━━━━━\n`;
          fallback += `📤 ${amount} <b>${fromUpper}</b> → <b>${toUpper}</b>\n`;
          fallback += `🔗 ${chainNames[chainIndex] || 'X Layer'}\n\n`;
          fallback += `⚠️ ${t(lang, 'ai_swap_no_pool')}\n`;
          fallback += `🌐 <a href="${dexLink}">OKX DEX</a>\n\n`;
          fallback += `💡 ${t(lang, 'ai_swap_or_try')}: OKB↔USDT, OKB↔ETH`;
          await bot.sendMessage(msg.chat.id, fallback, {
            parse_mode: 'HTML', reply_to_message_id: msg.message_id,
            message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: false
          });
          return { success: true, action: 'swap_no_pool', displayMessage: `No DEX pool for ${fromUpper}→${toUpper}. Showed OKX DEX link.` };
        }
        const toAmount = Number(quote.toTokenAmount || 0) / (10 ** toInfo.decimals);
        const toAmountStr = toAmount < 0.001 ? toAmount.toFixed(8) : toAmount < 1 ? toAmount.toFixed(4) : toAmount.toFixed(4);
        const estimatedGas = quote.estimateGasFee || 'N/A';
        const dexName = quote.dexRouterList?.[0]?.dexProtocol?.dexName || '';
        // Build preview card
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
        let card = `⚡ <b>${t(lang, 'ai_swap_preview')}</b>\n`;
        card += `━━━━━━━━━━━━━━━━━━\n`;
        card += `📤 ${amount} <b>${fromUpper}</b>\n`;
        card += `📥 ≈ ${toAmountStr} <b>${toUpper}</b>\n`;
        card += `⛽ Gas: ${estimatedGas}\n`;
        if (dexName) card += `🏦 DEX: ${dexName}\n`;
        if (quote.priceImpactPercent) card += `📊 Impact: ${quote.priceImpactPercent}%\n`;
        card += `🔗 ${chainNames[chainIndex] || 'X Layer'}\n`;
        // Check if user has trading wallet
        const { dbGet: dbGetCheck } = require('../../../db/core');
        const userId = String(msg.from?.id || msg.chat.id);
        const hasTW = await dbGetCheck('SELECT 1 FROM user_trading_wallets WHERE userId = ?', [userId]);
        const buttons = [];
        if (hasTW) {
          // Confirm button with swap data encoded
          const cbData = `swpc|${chainIndex}|${fromInfo.addr}|${toInfo.addr}|${minUnits}|${fromInfo.decimals}|${toInfo.decimals}|${fromUpper}|${toUpper}`;
          buttons.push([{ text: t(lang, 'ai_swap_confirm'), callback_data: cbData }]);
          buttons.push([{ text: t(lang, 'ai_swap_cancel'), callback_data: 'swpc|cancel' }]);
        } else {
          card += `\n⚠️ <i>${t(lang, 'ai_no_trading_wallet')}</i>`;
        }
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true,
          reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined
        });
        return {
          success: true,
          action: 'swap_preview',
          quote: { from: fromUpper, to: toUpper, fromAmount: amount, toAmount: toAmountStr, chain: chainIndex },
          displayMessage: `Swap preview: ${amount} ${fromUpper} → ${toAmountStr} ${toUpper} on ${chainNames[chainIndex] || 'X Layer'}.`
        };
      } catch (error) { return { success: false, error: `Swap failed: ${error.message}` }; }
    },
    // ────────────────────────────────────────────────────────────
    // Phase 2: Price Alerts
    // ────────────────────────────────────────────────────────────
    set_price_alert: async ({ symbol, target_price, direction = 'above' }, context) => {
      try {
        const { dbRun, dbAll } = require('../../../db/core');
        const onchainos = require('../../services/onchainos');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        // Check limit
        const existing = await dbAll('SELECT id FROM user_price_alerts WHERE userId = ? AND active = 1', [userId]);
        if (existing.length >= 5) return { success: false, error: t(lang, 'ai_alert_set') + ' Max 5 alerts.' };
        // Resolve token
        const KNOWN = { 'BTC': '1', 'ETH': '1', 'USDT': '1', 'BNB': '56', 'SOL': '501', 'OKB': '196' };
        let chainIndex = KNOWN[symbol.toUpperCase()] || null;
        let tokenAddress = null;
        if (!chainIndex) {
          const sr = await onchainos.getTokenSearch('196,1,56,501', symbol).catch(() => []);
          if (sr && sr.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; }
        }
        const dir = direction === 'below' ? 'below' : 'above';
        await dbRun('INSERT INTO user_price_alerts (userId, chatId, symbol, chainIndex, tokenAddress, targetPrice, direction) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, String(msg.chat.id), symbol.toUpperCase(), chainIndex, tokenAddress, target_price, dir]);
        const dirStr = t(lang, dir === 'above' ? 'ai_alert_above' : 'ai_alert_below');
        return { success: true, displayMessage: `${t(lang, 'ai_alert_set')} ${symbol.toUpperCase()} ${dirStr} $${target_price}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    list_price_alerts: async ({ }, context) => {
      try {
        const { dbAll } = require('../../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        const alerts = await dbAll('SELECT * FROM user_price_alerts WHERE userId = ? AND active = 1 ORDER BY createdAt DESC', [userId]);
        if (!alerts.length) return { success: true, displayMessage: `📭 ${t(lang, 'ai_no_active_alerts')}` };
        let text = `🔔 <b>${t(lang, 'ai_price_alerts_title')} (${alerts.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
        alerts.forEach(a => {
          const dirStr = t(lang, a.direction === 'above' ? 'ai_alert_above' : 'ai_alert_below');
          text += `#${a.id} · <b>${a.symbol}</b> ${dirStr} $${a.targetPrice}\n`;
        });
        return { success: true, displayMessage: text };
      } catch (error) { return { success: false, error: error.message }; }
    },
    delete_price_alert: async ({ alert_id }, context) => {
      try {
        const { dbRun, dbGet } = require('../../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        const alert = await dbGet('SELECT * FROM user_price_alerts WHERE id = ? AND userId = ?', [alert_id, userId]);
        if (!alert) return { success: false, error: `${t(lang, 'ai_alert_not_found')} #${alert_id}` };
        await dbRun('UPDATE user_price_alerts SET active = 0 WHERE id = ?', [alert_id]);
        return { success: true, displayMessage: `✅ ${t(lang, 'ai_deleted_alert')} #${alert_id} (${alert.symbol} ${t(lang, alert.direction === 'above' ? 'ai_alert_above' : 'ai_alert_below')} $${alert.targetPrice})` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    // ────────────────────────────────────────────────────────────
    // Phase 2: Favorite Tokens
    // ────────────────────────────────────────────────────────────
    add_favorite_token: async ({ symbol }, context) => {
      try {
        const { dbRun, dbAll } = require('../../../db/core');
        const onchainos = require('../../services/onchainos');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        // Check limit
        const existing = await dbAll('SELECT id FROM user_favorite_tokens WHERE userId = ?', [userId]);
        if (existing.length >= 10) return { success: false, error: 'Max 10 favorites.' };
        // Resolve token
        const KNOWN = { 'BTC': { ci: '1', addr: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', fn: 'Bitcoin' }, 'ETH': { ci: '1', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'Ethereum' }, 'OKB': { ci: '196', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'OKB' }, 'BNB': { ci: '56', addr: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fn: 'BNB' } };
        const upper = symbol.toUpperCase();
        let chainIndex, tokenAddress, fullName;
        if (KNOWN[upper]) { chainIndex = KNOWN[upper].ci; tokenAddress = KNOWN[upper].addr; fullName = KNOWN[upper].fn; }
        else {
          const sr = await onchainos.getTokenSearch('196,1,56,501', symbol).catch(() => []);
          if (sr && sr.length > 0) { chainIndex = sr[0].chainIndex; tokenAddress = sr[0].tokenContractAddress; fullName = sr[0].tokenFullName || upper; }
          else return { success: false, error: `Token "${symbol}" not found.` };
        }
        await dbRun('INSERT OR REPLACE INTO user_favorite_tokens (userId, symbol, chainIndex, tokenAddress, fullName) VALUES (?, ?, ?, ?, ?)',
          [userId, upper, chainIndex, tokenAddress, fullName]);
        return { success: true, displayMessage: `⭐ ${t(lang, 'ai_add_favorite')}: ${upper}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    remove_favorite_token: async ({ symbol }, context) => {
      try {
        const { dbRun } = require('../../../db/core');
        const { msg } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        await dbRun('DELETE FROM user_favorite_tokens WHERE userId = ? AND symbol = ?', [userId, symbol.toUpperCase()]);
        return { success: true, displayMessage: `${t(lang, 'ai_remove_favorite')}: ${symbol.toUpperCase()}` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    check_favorite_prices: async ({ }, context) => {
      try {
        const { dbAll } = require('../../../db/core');
        const onchainos = require('../../services/onchainos');
        const { msg, bot } = context;
        const userId = String(msg.from?.id || msg.chat.id);
        const lang = getLang(msg.chat.id);
        const favorites = await dbAll('SELECT * FROM user_favorite_tokens WHERE userId = ? ORDER BY addedAt', [userId]);
        if (!favorites.length) return { success: true, displayMessage: `📭 ${t(lang, 'ai_favorites_empty')}` };
        // Batch price fetch
        const chainNames = { '1': 'Ethereum', '56': 'BSC', '196': 'X Layer', '501': 'Solana' };
        const priceTokens = favorites.map(f => ({ chainIndex: f.chainIndex, tokenContractAddress: f.tokenAddress }));
        const prices = await onchainos.getTokenPriceInfo(priceTokens).catch(() => []);
        let card = `⭐ <b>${t(lang, 'ai_favorites_title')} (${favorites.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
        favorites.forEach((f, i) => {
          const pi = prices && prices[i] ? prices[i] : {};
          const price = Number(pi.price || 0);
          const change = Number(pi.priceChange24H || 0);
          const priceStr = price < 0.0001 ? price.toFixed(10) : price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(4) : price.toFixed(2);
          const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
          const icon = change >= 0 ? '📈' : '📉';
          card += `${i + 1}. <b>${f.symbol}</b> · $${priceStr} ${icon} ${changeStr} · ${chainNames[f.chainIndex] || f.chainIndex}\n`;
        });
        await bot.sendMessage(msg.chat.id, card, {
          parse_mode: 'HTML', reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id || undefined, disable_web_page_preview: true
        });
        return { success: true, action: 'favorites_displayed', displayMessage: `Showed ${favorites.length} favorite token prices.` };
      } catch (error) { return { success: false, error: error.message }; }
    },
    show_help: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/help',
            entities: [{ type: 'bot_command', offset: 0, length: 5 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_help',
          message: 'Opening help menu...'
        };
      } catch (error) {
        return { success: false, error: `Failed to show help: ${error.message}` };
      }
    },
    show_donate: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/donate',
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_donate',
          message: 'Showing donation info...'
        };
      } catch (error) {
        return { success: false, error: `Failed to show donate: ${error.message}` };
      }
    },
    register_wallet: async ({ address }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = address ? `/register ${address}` : '/register';
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'register_wallet',
          message: 'Opening wallet registration...'
        };
      } catch (error) {
        return { success: false, error: `Failed to register wallet: ${error.message}` };
      }
    },
    show_random_menu: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/random',
            entities: [{ type: 'bot_command', offset: 0, length: 7 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_random_menu',
          message: 'Opening games menu...'
        };
      } catch (error) {
        return { success: false, error: `Failed to show random menu: ${error.message}` };
      }
    },
    show_telegram_id: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/dataTelegram',
            entities: [{ type: 'bot_command', offset: 0, length: 13 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'show_telegram_id',
          message: 'Getting Telegram ID...'
        };
      } catch (error) {
        return { success: false, error: `Failed to get telegram ID: ${error.message}` };
      }
    },
    set_persona: async ({ persona_id, persona_prompt }, context) => {
      try {
        const { msg, bot } = context;
        const userId = msg.from?.id?.toString();
        const lang = await getLang(msg);
        // If no persona_id provided, show persona selection menu
        if (!persona_id) {
          const currentPersonaId = await getUserPersona(userId);
          const personaList = Object.values(AI_PERSONAS).map((p) => {
            const { name, desc } = getPersonaStrings(lang, p.id);
            const current = currentPersonaId === p.id ? ' ✓' : '';
            return `• ${name}${current}: ${desc}`;
          }).join('\n');
          const menuText = `🎭 ${t(lang, 'ai_persona_title')}\n\n${personaList}\n\n${t(lang, 'ai_persona_hint')}`;
          await sendReply(msg, menuText, { reply_markup: await buildPersonaKeyboard(lang, userId) });
          return {
            success: true,
            action: 'show_persona_menu',
            message: 'Showing persona selection menu'
          };
        }
        // Set the persona
        let success = false;
        let personaName = persona_id;
        if (persona_id === 'custom') {
          const customPrompt = (persona_prompt || '').trim();
          if (customPrompt) {
            const customName = (customPrompt.split('\n')[0] || 'Custom persona').trim().slice(0, 64) || 'Custom persona';
            success = await setUserPersona(userId, 'custom', { customPrompt, customName });
            personaName = customName;
          } else {
            const existing = await getUserCustomPersona(userId);
            if (existing?.prompt) {
              success = await setUserPersona(userId, 'custom');
              personaName = existing.name || 'Custom persona';
            } else {
              await promptCustomPersonaInput(msg, lang);
              return {
                success: true,
                action: 'request_custom_persona',
                message: 'Prompted user for custom persona details'
              };
            }
          }
        } else {
          success = await setUserPersona(userId, persona_id);
          personaName = getPersonaLabel(lang, AI_PERSONAS[persona_id]) || persona_id;
        }
        if (success) {
          await sendReply(msg, t(lang, 'ai_persona_saved', { name: personaName }));
          return {
            success: true,
            action: 'set_persona',
            message: `Persona set to ${personaName}`
          };
        } else {
          return { success: false, error: 'Invalid persona ID' };
        }
      } catch (error) {
        return { success: false, error: `Failed to set persona: ${error.message}` };
      }
    },
    // ========================================================================
    // AI COMMAND FUNCTION IMPLEMENTATIONS
    // ========================================================================
    ask_ai: async ({ question }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/ai ${question}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 3 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'ask_ai',
          message: 'Processing your question...'
        };
      } catch (error) {
        return { success: false, error: `Failed to ask AI: ${error.message}` };
      }
    },
    text_to_speech: async ({ text }, context) => {
      try {
        const { msg, bot } = context;
        const commandText = `/ai tts ${text}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 3 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'text_to_speech',
          message: 'Converting text to speech...'
        };
      } catch (error) {
        return { success: false, error: `Failed to convert to speech: ${error.message}` };
      }
    },
    manage_ai_api: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/api',
            entities: [{ type: 'bot_command', offset: 0, length: 4 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'manage_ai_api',
          message: 'Opening API management...'
        };
      } catch (error) {
        return { success: false, error: `Failed to open API management: ${error.message}` };
      }
    },
    change_ai_language: async ({ }, context) => {
      try {
        const { msg, bot } = context;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: '/language',
            entities: [{ type: 'bot_command', offset: 0, length: 9 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'change_ai_language',
          message: 'Opening language settings...'
        };
      } catch (error) {
        return { success: false, error: `Failed to change language: ${error.message}` };
      }
    },
    generate_image: async ({ prompt }, context) => {
      try {
        const { msg, bot } = context;
        // Use "tạo ảnh" keyword to trigger detectImageAction
        const commandText = `/ai tạo ảnh ${prompt}`;
        const syntheticUpdate = {
          update_id: Date.now(),
          message: {
            ...msg,
            text: commandText,
            entities: [{ type: 'bot_command', offset: 0, length: 3 }]
          }
        };
        bot.processUpdate(syntheticUpdate);
        return {
          success: true,
          action: 'generate_image',
          message: 'Generating image...'
        };
      } catch (error) {
        return { success: false, error: `Failed to generate image: ${error.message}` };
      }
    }
  };
  /**
   * Get available function declarations based on user permissions
   */
  async function getAvailableFunctions(userId, chatId, msg) {
    const userFunctions = [
      getUserInfoDeclaration,
      getMemberCountDeclaration,
      // Bot introduction - all users can ask
      getBotIntroductionDeclaration,
      // Simple gaming functions - all users can play
      playDiceDeclaration,
      playRpsDeclaration,
      generateRandomNumberDeclaration,
      generateLongShortDeclaration,
      randomChoiceDeclaration,
      getFortuneDeclaration,
      createQuizDeclaration,
      // Interactive gaming functions - all users can start
      startMemoryGameDeclaration,
      startMinesweeperDeclaration,
      startTreasureHuntDeclaration,
      startSudokuDeclaration,
      startGomokuDeclaration,
      startChessDeclaration,
      // Xlayer Check functions - wallet, token, transaction, group, checkin
      deleteChatHistoryDeclaration,
      lookupContractDeclaration,
      lookupTransactionDeclaration,
      checkOkxChainsDeclaration,
      checkOkx402StatusDeclaration,
      getGroupInfoDeclaration,
      getCheckinStatsDeclaration,
      // AI command functions - natural language for /ai features
      askAiDeclaration,
      textToSpeechDeclaration,
      manageAiApiDeclaration,
      changeAiLanguageDeclaration,
      generateImageDeclaration,
      // Checkin & Wallet functions
      doCheckinDeclaration,
      getCheckinLeaderboardDeclaration,
      // P2E & Trading
      checkRewardPointsDeclaration,
      redeemRewardsDeclaration,
      // Phase 2: Alerts & Favorites
      setPriceAlertDeclaration,
      listPriceAlertsDeclaration,
      deletePriceAlertDeclaration,
      addFavoriteTokenDeclaration,
      removeFavoriteTokenDeclaration,
      checkFavoritePricesDeclaration,
      // Utility functions
      showHelpDeclaration,
      showDonateDeclaration,
      registerWalletDeclaration,
      showRandomMenuDeclaration,
      showTelegramIdDeclaration,
      setPersonaDeclaration
    ];
    // Merge ONCHAIN_TOOLS declarations (DeFi: charts, candles, market detail, gas, swap)
    const onchainDeclarations = [];
    for (const toolObj of onchainToolArrays) {
      if (toolObj?.functionDeclarations) {
        onchainDeclarations.push(...toolObj.functionDeclarations);
      }
    }
    const adminFunctions = [
      banMemberDeclaration,
      kickMemberDeclaration,
      muteMemberDeclaration,
      unmuteMemberDeclaration,
      warnMemberDeclaration
    ];
    const ownerFunctions = [setCommandLimitDeclaration];

    // Helper to deduplicate function declarations by name
    const deduplicate = (funcs) => {
      const seen = new Set();
      return funcs.filter(f => {
        if (!f || !f.name) return false;
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
      });
    };

    const allSkillTools = (skillRegistry.getAllTools()[0]?.functionDeclarations) || [];

    // Check permissions
    const { isOwner } = require('../accessControl');
    const isOwnerUser = isOwner(userId, msg.from?.username);
    if (isOwnerUser) {
      // Owner has access to all functions + onchain tools
      return deduplicate([...userFunctions, ...adminFunctions, ...ownerFunctions, ...onchainDeclarations, ...allSkillTools]);
    }
    // Check if user is admin in the current chat
    let isAdminUser = false;
    if (chatId) {
      try {
        const member = await bot.getChatMember(chatId, userId);
        isAdminUser = ['creator', 'administrator'].includes(member.status);
      } catch (error) {
        log.child('FnCall').warn(`Failed to check admin status: ${error.message}`);
      }
    }
    if (isAdminUser) {
      return deduplicate([...userFunctions, ...adminFunctions, ...onchainDeclarations, ...allSkillTools]);
    }
    // Regular user only gets user-level functions + onchain tools
    return deduplicate([...userFunctions, ...onchainDeclarations, ...allSkillTools]);
  }
  function hasExplicitHelpIntent(promptText) {
    const normalized = (promptText || '').toLowerCase().trim();
    if (!normalized) {
      return false;
    }
    if (normalized.startsWith('/help') || normalized === 'help') {
      return true;
    }
    return /\b(help menu|show help|trợ giúp|tro giup|hướng dẫn|huong dan|hdsd)\b/.test(normalized);
  }
  function shouldExecuteFunction(functionName, context) {
    const msg = context?.msg || {};
    const userPrompt = (msg.text || msg.caption || '').toString();
    const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
    switch (functionName) {
      case 'generate_image':
        return Boolean(detectImageAction(userPrompt, hasPhoto));
      case 'show_help':
        return hasExplicitHelpIntent(userPrompt);
      default:
        return true;
    }
  }
  /**
   * Execute a function call with permission validation
   */
  async function executeFunctionCall(functionCall, context) {
    let { name, args } = functionCall;

    // Gemini sometimes strips underscores from function names (e.g. manage_trading_wallet → managetradingwallet)
    // Try fuzzy match if exact name not found
    if (!toolFunctionImplementations[name]) {
      const normalizedName = name.replace(/_/g, '').toLowerCase();
      const matchedKey = Object.keys(toolFunctionImplementations).find(
        key => key.replace(/_/g, '').toLowerCase() === normalizedName
      );
      if (matchedKey) {
        name = matchedKey;
        functionCall = { ...functionCall, name: matchedKey };
      }
    }

    if (!toolFunctionImplementations[name]) {

      try {
        const onchainResult = await executeOnchainToolCall(functionCall, context);
        if (onchainResult !== undefined && onchainResult !== null) {
          // Update functionCall.name if onchain handler resolved a mangled name (e.g. getsignallist → get_signal_list)
          if (onchainResult._resolvedName && onchainResult._resolvedName !== functionCall.name) {
            functionCall = { ...functionCall, name: onchainResult._resolvedName };
          }
          if (typeof onchainResult === 'object' && onchainResult.displayMessage) {
            return onchainResult;
          }
          return { success: true, displayMessage: typeof onchainResult === 'string' ? onchainResult : JSON.stringify(onchainResult) };
        }
      } catch (e) { /* not an onchain tool either */ }

      // Try skill engine handlers
      try {
        const skillResult = await skillRegistry.executeToolCall(functionCall, context);
        if (skillResult !== undefined && skillResult !== null && typeof skillResult === 'string' && !skillResult.startsWith('Unknown function:')) {
          return { success: true, displayMessage: skillResult };
        }
        if (skillResult !== undefined && skillResult !== null && typeof skillResult !== 'string') {
          return { success: true, displayMessage: JSON.stringify(skillResult) };
        }
      } catch (e) { /* not a skill tool either */ }

      return {
        success: false,
        error: `Unknown function: ${name}`
      };
    }
    if (!shouldExecuteFunction(name, context)) {
      return {
        success: false,
        error: `Skipped ${name} due to low intent confidence`
      };
    }
    try {
      const result = await toolFunctionImplementations[name](args, context);
      return result;
    } catch (error) {
      log.child('FnCall').error(`Function ${name} failed:`, error);
      return {
        success: false,
        error: `Function execution failed: ${error.message}`
      };
    }
  }

  return {
    getAvailableFunctions,
    executeFunctionCall,
    toolFunctionImplementations,
    hasExplicitHelpIntent,
    shouldExecuteFunction
  };
}

module.exports = createFunctionTools;
