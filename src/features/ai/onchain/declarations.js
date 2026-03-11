module.exports.ONCHAIN_TOOLS = [
    {
        functionDeclarations: [
            {
                name: 'get_token_price',
                description: 'Get the current real-time price of one or more tokens on-chain. Use this when users ask about token prices, e.g. "BTC price", "How much is OKB?"',
                parameters: {
                    type: 'object',
                    properties: {
                        tokens: {
                            type: 'array',
                            description: 'List of tokens to get prices for',
                            items: {
                                type: 'object',
                                properties: {
                                    chainIndex: { type: 'string', description: 'Chain ID, e.g. "1" for Ethereum, "196" for X Layer, "56" for BSC, "501" for Solana' },
                                    tokenContractAddress: { type: 'string', description: 'Token contract address AND/OR Token Symbol (e.g. "BTC", "OKB"). Use native symbol or search if unknown.' }
                                },
                                required: ['chainIndex', 'tokenContractAddress']
                            }
                        }
                    },
                    required: ['tokens']
                }
            },
            {
                name: 'search_token',
                description: 'Search for tokens by name, symbol, or contract address. Use this when you need to find a token\'s contract address, e.g. "find BANMAO token", "search for USDT on X Layer"',
                parameters: {
                    type: 'object',
                    properties: {
                        keyword: { type: 'string', description: 'Token name, symbol, or address to search' },
                        chains: { type: 'string', description: 'Comma-separated chain IDs to search on. Default "196" for X Layer' }
                    },
                    required: ['keyword']
                }
            },
            {
                name: 'get_wallet_balance',
                description: 'Get the total portfolio value and token balances of a wallet address. Use this when users ask "how much is in my wallet?", "check my balance", or "what tokens do I have?"',
                parameters: {
                    type: 'object',
                    properties: {
                        address: { type: 'string', description: 'Wallet address to check (EVM 0x format)' },
                        chains: { type: 'string', description: 'Comma-separated chain IDs. Default "196" for X Layer' }
                    },
                    required: ['address']
                }
            },
            {
                name: 'get_swap_quote',
                description: 'Get a swap quote BEFORE executing any swap. This MUST be called first — users must see and confirm the quote before execution. Auto-resolves token symbols, no need to call search_token first. Use when users say "swap", "đổi", "exchange", "báo giá".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID for the swap' },
                        fromTokenAddress: { type: 'string', description: 'Source token contract address OR token symbol (the token you are SELLING). E.g. "OKB", "USDT"' },
                        toTokenAddress: { type: 'string', description: 'Destination token contract address OR token symbol (the token you are BUYING). E.g. "banmao", "PEPE"' },
                        amount: { type: 'string', description: 'Amount to SELL in normal human units (e.g. "1000" for 1000 tokens). System auto-converts to wei. CRITICAL: This MUST be the quantity of the SOURCE token (fromTokenAddress), never the destination token.' }
                    },
                    required: ['chainIndex', 'fromTokenAddress', 'toTokenAddress', 'amount']
                }
            },
            {
                name: 'get_top_tokens',
                description: 'Get trending/top tokens by price change, volume, or market cap. Use when users ask "trending tokens", "top gainers", "best tokens today"',
                parameters: {
                    type: 'object',
                    properties: {
                        chains: { type: 'string', description: 'Chain IDs. Default "196"' },
                        sortBy: { type: 'string', description: '"2"=price change, "5"=volume, "6"=market cap. Default "2"' },
                        timeFrame: { type: 'string', description: '"1"=5min, "2"=1h, "3"=4h, "4"=24h. Default "4"' }
                    }
                }
            },
            {
                name: 'get_token_holders',
                description: 'Get top holders and holder distribution for a token. Use when users ask "who holds this token?", "holder distribution", "whale analysis"',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        tokenContractAddress: { type: 'string', description: 'Token contract address OR token symbol (e.g. "banmao", "shib")' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            },
            {
                name: 'get_gas_price',
                description: 'Get current gas prices for a blockchain. Use when users ask "gas fees", "how much is gas?", "network congestion"',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID. Default "196" for X Layer' }
                    }
                }
            },
            {
                name: 'get_token_info',
                description: 'Get detailed token metadata: market cap, liquidity, 24h volume, price change, social links. Use when users ask for detailed analysis of a token.',
                parameters: {
                    type: 'object',
                    properties: {
                        tokens: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    chainIndex: { type: 'string' },
                                    tokenContractAddress: { type: 'string' }
                                },
                                required: ['chainIndex', 'tokenContractAddress']
                            }
                        }
                    },
                    required: ['tokens']
                }
            },
            {
                name: 'manage_trading_wallet',
                description: 'Manage user trading wallets. Actions: create, delete, set_default, import, export, rename, tag. Vietnamese: "tạo ví", "xóa ví", "đặt ví mặc định", "import ví", "thêm ví", "đổi tên ví", "gắn tag ví". Chinese: "创建钱包", "删除钱包", "导入钱包", "设为默认", "重命名钱包". English: "create wallet", "delete wallet", "set default wallet", "import wallet", "rename wallet". Users can create MULTIPLE wallets — there is no single-wallet limit.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', description: 'Action: "create", "delete", "set_default", "import", "export", "rename", "tag"' },
                        walletId: { type: 'string', description: 'Wallet ID for delete/set_default/rename actions' },
                        walletName: { type: 'string', description: 'New wallet name for rename action (max 20 chars)' },
                        tags: { type: 'string', description: 'Comma-separated tags for tag action (e.g. "trading,airdrop")' },
                        privateKeys: { type: 'string', description: 'For import action: one or more private keys separated by spaces' }
                    },
                    required: ['action']
                }
            },
            {
                name: 'set_wallet_pin',
                description: 'Thiết lập hoặc đổi mã PIN bảo mật 4 số cho ví giao dịch của người dùng. Dùng khi user nói "đặt mã pin", "cài pin", "đổi mật khẩu ví".',
                parameters: {
                    type: 'object',
                    properties: {
                        new_pin: { type: 'string', description: 'Mã PIN 4 số nguyên mới do người dùng yêu cầu (VD: "1234").' },
                        current_pin: { type: 'string', description: 'Mã PIN 4 số nguyên hiện tại (chỉ bắt buộc nếu đổi PIN).' }
                    },
                    required: ['new_pin']
                }
            },
            {
                name: 'get_token_security',
                description: 'Check the security, rug-pull, and honeypot risk of a specific token smart contract. Use when users ask to "kiểm tra bảo mật", "check scam", "check honeypot", "token này an toàn không".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID where the token exists.' },
                        tokenContractAddress: { type: 'string', description: 'The token contract address to scan.' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            },
            {
                name: 'get_trading_wallet_balance',
                description: 'Check the balance/portfolio of user trading wallet(s) on X Layer chain. Use when user asks about their trading wallet balance, assets, tokens, or portfolio. Vietnamese triggers: "số dư ví giao dịch", "ví tôi có gì", "tài sản ví", "check balance ví".',
                parameters: {
                    type: 'object',
                    properties: {
                        walletId: { type: 'string', description: 'Specific wallet ID to check (optional, uses default wallet if not specified)' }
                    }
                }
            },
            {
                name: 'list_trading_wallets',
                description: 'List all trading wallets of the user with addresses, default status, and creation date. Use when user asks to see their wallets, list wallets, or asks which wallet is default. Vietnamese triggers: "danh sách ví", "ví giao dịch của tôi", "xem ví".',
                parameters: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'get_market_candles',
                description: 'Get K-line/candlestick chart data for a token. Use for technical analysis, price history, chart requests. E.g. "show ETH chart", "BTC 1 day candles", "phân tích kỹ thuật OKB"',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (optional if passing token symbol, default: 196 for X Layer)' },
                        tokenContractAddress: { type: 'string', description: 'Token contract address OR token symbol (e.g. "OKB", "ETH", "PEPE"). Symbols will be auto-resolved.' },
                        bar: { type: 'string', description: 'Candle interval: "1m","5m","15m","30m","1H","2H","4H","6H","1D","1W". Default "1H"' },
                        limit: { type: 'string', description: 'Number of candles (max 299). Default "24"' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            },
            {
                name: 'get_token_market_detail',
                description: 'Get detailed market data for tokens: 24h price change, volume, market cap, liquidity, social links. Richer than get_token_info. Use for "phân tích token", "token X có tốt không?", "should I buy X?". You can pass token symbols instead of addresses.',
                parameters: {
                    type: 'object',
                    properties: {
                        tokens: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    chainIndex: { type: 'string' },
                                    tokenContractAddress: { type: 'string' }
                                },
                                required: ['chainIndex', 'tokenContractAddress']
                            }
                        }
                    },
                    required: ['tokens']
                }
            },
            {
                name: 'execute_swap',
                description: 'Execute a confirmed token swap. ONLY call this AFTER the user has seen and explicitly confirmed a get_swap_quote result (user said "ok"/"có"/"confirm"). NEVER call directly without a prior quote. Handles approval, signing and broadcasting automatically.',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID for the swap' },
                        fromTokenAddress: { type: 'string', description: 'Source token address OR token symbol (selling)' },
                        toTokenAddress: { type: 'string', description: 'Destination token address OR token symbol (buying)' },
                        amount: { type: 'string', description: 'Amount to SELL in normal human units (e.g. "1000"). System auto-converts to wei.' },
                        userWalletAddress: { type: 'string', description: 'User wallet address that will sign the tx' },
                        slippagePercent: { type: 'string', description: 'Slippage tolerance %. Default "1"' }
                    },
                    required: ['chainIndex', 'fromTokenAddress', 'toTokenAddress', 'amount', 'userWalletAddress']
                }
            },
            {
                name: 'batch_swap',
                description: 'Execute token swap across multiple trading wallets simultaneously. Supports per-wallet amounts and swap-max mode. Use when user says "swap từ tất cả ví", "batch swap", "swap hàng loạt", "swap nhiều ví", "swap max tất cả".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. "196")' },
                        fromTokenAddress: { type: 'string', description: 'Source token contract address OR token symbol (selling)' },
                        toTokenAddress: { type: 'string', description: 'Destination token contract address OR token symbol (buying)' },
                        swaps: {
                            type: 'array',
                            description: 'Array of swaps, specifying exact amounts per wallet',
                            items: {
                                type: 'object',
                                properties: {
                                    walletId: { type: 'number', description: 'Wallet ID' },
                                    amount: { type: 'string', description: 'Amount to SELL in normal human units (e.g. "1000" for 1000 tokens). System auto-converts to wei. Use "max" to swap entire balance minus gas reserve.' }
                                },
                                required: ['walletId', 'amount']
                            }
                        },
                        slippagePercent: { type: 'string', description: 'Slippage tolerance %. Default "1"' }
                    },
                    required: ['chainIndex', 'fromTokenAddress', 'toTokenAddress', 'swaps']
                }
            },
            {
                name: 'check_multi_wallet_balances',
                description: 'Check the balance of a SPECIFIC token across ALL user trading wallets efficiently via RPC. Supports scanning multiple chains at once (omni-chain). Use BEFORE multi-wallet swaps. Vietnamese: "kiểm tra số dư token X ở các ví", "ví nào có token X", "tìm USDT ở tất cả mạng"',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. "196"). Use comma-separated for omni-chain scan (e.g. "1,56,196,137,42161,8453")' },
                        tokenAddress: { type: 'string', description: 'Token contract address (Use "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" for native token). For omni-chain, this should be the token on the first chain; others will be auto-searched.' }
                    },
                    required: ['chainIndex', 'tokenAddress']
                }
            },
            {
                name: 'simulate_batch_swap',
                description: 'Dry-run simulate a batch swap BEFORE executing it. Returns estimated gas, slippage impact, and success predictions for each wallet. Use when user has many wallets or large amounts. Vietnamese: "mô phỏng batch swap", "kiểm tra trước khi swap nhiều ví"',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        fromTokenAddress: { type: 'string', description: 'Source token contract address OR token symbol' },
                        toTokenAddress: { type: 'string', description: 'Destination token contract address OR token symbol' },
                        swaps: {
                            type: 'array',
                            description: 'Same swaps array as batch_swap',
                            items: {
                                type: 'object',
                                properties: {
                                    walletId: { type: 'number', description: 'Wallet ID' },
                                    amount: { type: 'string', description: 'Amount in minimal units (wei)' }
                                },
                                required: ['walletId', 'amount']
                            }
                        },
                        slippagePercent: { type: 'string', description: 'Slippage tolerance %. Default "1"' }
                    },
                    required: ['chainIndex', 'fromTokenAddress', 'toTokenAddress', 'swaps']
                }
            },
            {
                name: 'simulate_transaction',
                description: 'Simulate a blockchain transaction to check if it will succeed before broadcasting. Use for safety checks before swap execution. Vietnamese: "mô phỏng giao dịch", "kiểm tra giao dịch"',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        fromAddress: { type: 'string', description: 'Sender address' },
                        toAddress: { type: 'string', description: 'Target contract/address' },
                        txAmount: { type: 'string', description: 'Value in minimal units. "0" for token approvals' },
                        inputData: { type: 'string', description: 'Transaction calldata (hex)' }
                    },
                    required: ['chainIndex', 'fromAddress', 'toAddress', 'txAmount']
                }
            },

            {
                name: 'broadcast_transaction',
                description: 'Broadcast a signed transaction on-chain. Use AFTER user signs a swap/approve tx. Vietnamese: "gửi giao dịch", "broadcast tx"',
                parameters: {
                    type: 'object',
                    properties: {
                        signedTx: { type: 'string', description: 'Fully signed transaction hex string' },
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. "196")' },
                        address: { type: 'string', description: 'Sender wallet address' }
                    },
                    required: ['signedTx', 'chainIndex', 'address']
                }
            },
            {
                name: 'get_order_status',
                description: 'Track the status of a broadcast transaction. Use after broadcast_transaction to check if tx succeeded. Vietnamese: "trạng thái giao dịch", "kiểm tra tx"',
                parameters: {
                    type: 'object',
                    properties: {
                        address: { type: 'string', description: 'Wallet address' },
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. "196")' },
                        orderId: { type: 'string', description: 'Order ID from broadcast response (optional)' }
                    },
                    required: ['address', 'chainIndex']
                }
            },
            // get_trade_history removed — use get_recent_trades instead (duplicate functionality)
            {
                name: 'get_weather',
                description: 'Get current weather and forecast for any location. Use when user asks about weather, temperature, forecast, rain. Vietnamese: "thời tiết", "nhiệt độ", "trời có mưa không?"',
                parameters: {
                    type: 'object',
                    properties: {
                        location: { type: 'string', description: 'City name, e.g. "Hanoi", "Ho Chi Minh", "London"' },
                        forecast: { type: 'string', description: '"current" for now, "3day" for 3-day forecast. Default "current"' }
                    },
                    required: ['location']
                }
            },
            // ── Phase 3: Wallet Upgrades ──
            {
                name: 'transfer_tokens',
                description: 'Transfer native tokens or ERC-20 tokens from a trading wallet to a SINGLE destination address. Vietnamese: "chuyển token", "gửi OKB", "transfer". Supports native (OKB/ETH) and ERC-20 tokens. IMPORTANT: This function supports ONLY ONE destination address. If the user provides MULTIPLE wallet addresses (2 or more 0x... addresses) to send tokens to, you MUST use batch_transfer with mode="distribute" instead. NEVER call transfer_tokens multiple times in a loop for batch sends.',
                parameters: {
                    type: 'object',
                    properties: {
                        walletId: { type: 'string', description: 'Source wallet ID' },
                        toAddress: { type: 'string', description: 'Destination address' },
                        tokenAddress: { type: 'string', description: 'Token contract address OR token symbol (e.g. "banmao", "USDT"). Use "native" for native chain token (OKB/ETH). System auto-resolves symbols to contract addresses.' },
                        amount: { type: 'string', description: 'Amount in human-readable units (e.g. "1.5"). Use "max" or "all" to transfer entire balance minus gas reserve.' },
                        chainIndex: { type: 'string', description: 'Chain ID. Default "196"' }
                    },
                    required: ['walletId', 'toAddress', 'tokenAddress', 'amount']
                }
            },
            {
                name: 'batch_transfer',
                description: 'Transfer tokens from multiple wallets to one or more destinations at once. Vietnamese: "chuyển hàng loạt", "gom quỹ", "phân phối token", "chuyển đến các ví", "gửi đến danh sách ví". Modes: collect (many→one), distribute (one→many), custom (N→N). CRITICAL ROUTING RULE: When user provides a LIST of multiple wallet addresses (2+ addresses starting with 0x) to send tokens to, you MUST use this function with mode="distribute". Use the user\'s default trading wallet as fromWalletId for each entry in the transfers array, and create one entry per destination address with the specified amount. Example: "Transfer 333 banmao to 0xAAA..., 0xBBB..., 0xCCC..." → batch_transfer with mode="distribute", transfers=[{fromWalletId:"default", toAddress:"0xAAA", amount:"333"}, {fromWalletId:"default", toAddress:"0xBBB", amount:"333"}, ...].',
                parameters: {
                    type: 'object',
                    properties: {
                        mode: { type: 'string', description: '"collect" (many wallets → 1 dest), "distribute" (1 wallet → many dests), "custom" (N→N array)' },
                        tokenAddress: { type: 'string', description: 'Token contract address OR symbol (e.g. "banmao"). Use "native" for native chain token. System auto-resolves symbols.' },
                        chainIndex: { type: 'string', description: 'Chain ID. Default "196"' },
                        transfers: {
                            type: 'array', items: {
                                type: 'object', properties: {
                                    fromWalletId: { type: 'string' }, toAddress: { type: 'string' }, amount: { type: 'string', description: 'Amount in human units (e.g. "100"). Use "max" or "all" to transfer entire balance minus gas reserve.' }
                                }
                            }, description: 'Array of {fromWalletId, toAddress, amount}'
                        }
                    },
                    required: ['mode', 'tokenAddress', 'transfers']
                }
            },
            {
                name: 'get_wallet_pnl',
                description: 'Get Profit & Loss report and transaction history for trading wallets. Vietnamese: "xem lãi lỗ", "PnL ví", "lịch sử giao dịch ví".',
                parameters: {
                    type: 'object',
                    properties: {
                        walletId: { type: 'string', description: 'Specific wallet ID (optional, all wallets if omitted)' },
                        period: { type: 'string', description: '"7d", "30d", "all". Default "30d"' }
                    }
                }
            },
            {
                name: 'schedule_dca',
                description: 'Schedule a recurring DCA (Dollar-Cost Averaging) swap. Vietnamese: "mua tự động mỗi ngày", "DCA hàng tuần", "đặt lịch swap". Supports create, list, cancel, pause, resume, dashboard actions.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', description: '"create", "list", "cancel", "pause", "resume", "dashboard"' },
                        walletId: { type: 'string', description: 'Wallet ID for DCA' },
                        chainIndex: { type: 'string', description: 'Chain ID. Default "196". Supports any chain.' },
                        fromTokenAddress: { type: 'string', description: 'Source token contract OR symbol (e.g. "USDT", "OKB")' },
                        toTokenAddress: { type: 'string', description: 'Target token contract OR symbol (e.g. "banmao", "ETH")' },
                        amount: { type: 'string', description: 'Amount per swap in human units' },
                        interval: { type: 'string', description: 'Preset interval: "hourly", "daily", "weekly", "monthly". Overrides intervalHours.' },
                        intervalHours: { type: 'number', description: 'Custom interval in hours (e.g. 24 = daily, 168 = weekly). Used if interval preset not set.' },
                        stopLossPct: { type: 'number', description: 'Auto-cancel DCA if token price drops by this % from initial price (e.g. 20 = -20%)' },
                        takeProfitPct: { type: 'number', description: 'Auto-cancel DCA if token price rises by this % from initial price (e.g. 50 = +50%)' },
                        taskId: { type: 'string', description: 'Task ID for cancel/pause/resume actions' }
                    },
                    required: ['action']
                }
            },
            {
                name: 'manage_whitelist',
                description: 'Manage trusted/whitelisted addresses for fast transfers without extra confirmation. Vietnamese: "thêm địa chỉ tin cậy", "whitelist", "danh sách tin cậy".',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', description: '"add", "remove", "list"' },
                        address: { type: 'string', description: 'Wallet address to add/remove' },
                        label: { type: 'string', description: 'Friendly label for the address' }
                    },
                    required: ['action']
                }
            },
            {
                name: 'export_wallet_data',
                description: 'Export wallet data to a file (CSV/JSON) and send as Telegram document. Vietnamese: "xuất dữ liệu ví", "export lịch sử", "download PnL", "tải xuống".',
                parameters: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', description: '"wallets", "history", "pnl", "whitelist", "all"' },
                        format: { type: 'string', description: '"csv" or "json". Default "csv"' }
                    },
                    required: ['type']
                }
            },
            {
                name: 'filter_wallets_by_tag',
                description: 'Filter/list trading wallets by tag. Vietnamese: "ví trading", "lọc ví theo tag", "ví airdrop".',
                parameters: {
                    type: 'object',
                    properties: {
                        tag: { type: 'string', description: 'Tag to filter by (e.g. "trading", "airdrop", "hodl")' }
                    },
                    required: ['tag']
                }
            },
            {
                name: 'check_approval_safety',
                description: 'Check if a token approval/allowance is safe or risky. Detects unlimited approvals to suspicious spenders. Vietnamese: "kiểm tra approval", "kiểm tra quyền truy cập token", "approval có an toàn không". English: "check approval safety", "is this approval safe".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. "1" for Ethereum, "56" for BSC, "196" for X Layer)' },
                        tokenAddress: { type: 'string', description: 'Token contract address to check approvals for (optional, checks all if omitted)' },
                        walletAddress: { type: 'string', description: 'Wallet address to check approvals for. If omitted, uses user default trading wallet.' }
                    },
                    required: ['chainIndex']
                }
            }
        ]
    },
    {
        functionDeclarations: [
            {
                name: 'get_index_price',
                description: 'Get aggregated index price from multiple sources for tokens',
                parameters: {
                    type: 'object',
                    properties: {
                        tokens: {
                            type: 'array',
                            description: 'Array of {chainIndex, tokenContractAddress} objects',
                            items: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } } }
                        }
                    },
                    required: ['tokens']
                }
            },
            {
                name: 'get_historical_index_price',
                description: 'Get historical index price data for a token',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. 196, 1, 56)' },
                        tokenContractAddress: { type: 'string', description: 'Token contract address' },
                        period: { type: 'string', description: 'Time period: 1m, 5m, 1H, 1D' },
                        limit: { type: 'string', description: 'Number of data points (max 299)' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            },
            {
                name: 'estimate_gas_limit',
                description: 'Estimate gas limit for a transaction before executing it',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        fromAddress: { type: 'string', description: 'Sender address' },
                        toAddress: { type: 'string', description: 'Receiver/contract address' },
                        txAmount: { type: 'string', description: 'Transaction amount in wei' }
                    },
                    required: ['chainIndex', 'fromAddress', 'toAddress']
                }
            },
            {
                name: 'get_liquidity',
                description: 'Get available DEX liquidity pools on a chain',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. 196, 1, 56)' }
                    },
                    required: ['chainIndex']
                }
            },
            {
                name: 'get_specific_token_balances',
                description: 'Get balance of specific tokens in a wallet (more precise than general balance)',
                parameters: {
                    type: 'object',
                    properties: {
                        address: { type: 'string', description: 'Wallet address' },
                        tokens: {
                            type: 'array',
                            description: 'Array of {chainIndex, tokenContractAddress} objects',
                            items: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } } }
                        }
                    },
                    required: ['address', 'tokens']
                }
            },
            {
                name: 'get_historical_candles',
                description: 'Get historical K-line/candlestick data for longer time ranges (use for weekly/monthly charts)',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        tokenContractAddress: { type: 'string', description: 'Token contract address' },
                        bar: { type: 'string', description: 'Period: 1m, 5m, 1H, 1D, 1W' },
                        limit: { type: 'string', description: 'Number of candles (max 299)' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            },
            {
                name: 'get_recent_trades',
                description: 'Get recent buy/sell trades (log) for a specific token on a DEX. Use when the user asks for "giao dịch gần đây", "lịch sử giao dịch", "có ai đang mua/bán không".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        tokenContractAddress: { type: 'string', description: 'Token contract address' },
                        limit: { type: 'string', description: 'Number of trades to fetch (max 500), default 50' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            },
            {
                name: 'get_signal_chains',
                description: 'Get a list of blockchain networks that support Smart Money / Whale / KOL buy signals. Use to check if a chain is supported before querying signals.',
                parameters: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'get_signal_list',
                description: 'Get the latest buy-direction signals from Smart Money, Whales, or KOLs/Influencers. Use when user asks "smart money đang mua gì", "cá mập mua token nào", "xem tín hiệu mạng Solana".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID (e.g. 196 for X Layer, 1 for Ethereum, 501 for Solana)' },
                        walletType: { type: 'string', description: 'Wallet classification. 1=Smart Money, 2=KOL/Influencer, 3=Whale. Can be comma-separated or omitted for all.' },
                        minAmountUsd: { type: 'string', description: 'Minimum transaction amount in USD' },
                        tokenContractAddress: { type: 'string', description: 'Filter signals for a specific token (optional)' }
                    },
                    required: ['chainIndex']
                }
            },
            {
                name: 'calculate_profit_roi',
                description: 'Calculate ROI, historic profit, or distance from ATH/ATL for a token based on its candlestick history. Use when user asks "tính lợi nhuận nếu ôm OKB 1 năm", "ví dụ mua BTC tháng trước lãi bao nhiêu", "còn cách bao xa để về bờ (hòa vốn)".',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID' },
                        tokenContractAddress: { type: 'string', description: 'Token contract address' },
                        buyPrice: { type: 'number', description: 'Optional explicit buy price to calculate ROI. If omitted, uses oldest candle in history.' },
                        bar: { type: 'string', description: 'Period to fetch history for: 1D, 1W. Default 1D' },
                        limit: { type: 'string', description: 'Number of periods for historical analysis (e.g. 365 for 1 year). Default 30' }
                    },
                    required: ['chainIndex', 'tokenContractAddress']
                }
            }
        ]
    }
];
