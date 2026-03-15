module.exports.ONCHAIN_TOOLS = [
    {
        functionDeclarations: [
            {
                name: 'get_token_price',
                description: 'Get the current real-time price of one or more tokens on-chain. Use ONLY when users ask about token PRICE. Vietnamese: "giá token", "bao nhiêu", "giá bao nhiêu". English: "BTC price", "How much is OKB?". Do NOT use this for holder queries, chart queries, or security checks — use the appropriate tool instead.',
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
                description: 'Search for tokens by name, symbol, or contract address. Use ONLY when user wants to FIND/DISCOVER a token or get its contract address. Vietnamese: "tìm token", "tìm kiếm token". Do NOT use for price, holders, charts, or security — use the specific tool instead.',
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
                description: 'Get the total portfolio value and token balances of a wallet address. Vietnamese: "số dư ví", "tài sản ví", "ví có gì". English: "check balance", "what tokens do I have?". For WATCH wallets only — for trading wallets use get_trading_wallet_balance.',
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
                description: 'Get a swap quote BEFORE executing any swap. This MUST be called first — users must see and confirm the quote before execution. Auto-resolves token symbols, no need to call search_token first. Use when users say "swap", "đổi", "exchange", "báo giá". ⚠️ MULTIPLE SWAPS: If user requests multiple swaps in one message (e.g. "đổi X lấy A, đổi X lấy B"), you MUST call get_swap_quote SEPARATELY for EACH swap pair. Return ALL quotes so user can confirm each one.',
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
                description: 'Get trending/top tokens by price change, volume, or market cap. Vietnamese: "token nổi bật", "token trending", "token tăng mạnh", "coin hot". English: "trending tokens", "top gainers". Do NOT use for top HOLDERS — use get_token_holders instead.',
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
                description: 'Get top holders and holder distribution for a token. Use when users ask about WHO holds/owns a token, holder lists, whale addresses. Vietnamese: "ai đang nắm giữ", "top holder", "ai giữ token", "cá voi", "holder lớn nhất", "phân bổ holder", "ai sở hữu". English: "who holds", "top holders", "holder distribution", "whale analysis". IMPORTANT: If user mentions "holder" or "nắm giữ" or "sở hữu" with a token name, ALWAYS use this tool, NOT get_token_price.',
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
                description: 'Get current gas prices for a blockchain. Vietnamese: "phí gas", "giá gas", "gas bao nhiêu". English: "gas fees", "how much is gas?",',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: 'Chain ID. Default "196" for X Layer' }
                    }
                }
            },
            {
                name: 'get_token_info',
                description: 'Get detailed token metadata: market cap, liquidity, 24h volume, price change, social links. Vietnamese: "thông tin token", "chi tiết token". Use when users want comprehensive token overview (not just price).',
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
                description: 'Execute SAME token pair swap across MULTIPLE trading wallets simultaneously. One fromToken→toToken pair, each wallet gets its own amount. Use when: "swap từ tất cả ví", "batch swap", "swap hàng loạt", "swap nhiều ví", "swap max tất cả", "모든 지갑에서 스왑", "所有钱包兑换", "обмен со всех кошельков", "swap semua dompet". ⚠️ For DIFFERENT token pairs (e.g. OKB→A and OKB→B), use get_swap_quote separately — NOT batch_swap.',
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
                name: 'save_favorite_pair',
                description: 'Save a token pair as favorite for quick swapping. Use when user says "save pair", "lưu cặp", "收藏交易对", "페어 저장", "сохранить пару", "simpan pasangan".',
                parameters: {
                    type: 'object',
                    properties: {
                        pairName: { type: 'string', description: 'Display name (e.g. "OKB/banmao")' },
                        fromToken: { type: 'string', description: 'From token symbol or address' },
                        toToken: { type: 'string', description: 'To token symbol or address' },
                        chainIndex: { type: 'string', description: 'Chain ID (default 196)' }
                    },
                    required: ['fromToken', 'toToken']
                }
            },
            {
                name: 'list_favorite_pairs',
                description: 'List saved favorite token pairs. Use when user says "favorite pairs", "cặp yêu thích", "收藏的交易对", "즐겨찾기", "избранные пары", "pasangan favorit".',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'get_swap_history',
                description: 'View recent swap history for the user. Shows past swap transactions with pair, amount, time, and explorer link. Use when user says "lịch sử swap", "swap history", "兑换历史", "스왑 내역", "история обменов", "riwayat swap".',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of recent swaps to show. Default 10, max 50.' }
                    }
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
            },
            {
                name: 'manage_wallet_template',
                description: 'Save, list, load, or delete named wallet address templates for batch transfers. User can say "save these addresses as Team1" or "transfer to template Team1" or "list my templates" or "delete template Team1". Vietnamese: "lưu template ví", "danh sách template", "chuyển tới template", "xóa template".',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', description: '"save", "list", "load", "delete"' },
                        name: { type: 'string', description: 'Template name (for save/load/delete)' },
                        addresses: {
                            type: 'array',
                            description: 'Array of wallet addresses to save (for "save" action)',
                            items: { type: 'string' }
                        }
                    },
                    required: ['action']
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
        ]    },
    {
        functionDeclarations: [
            // ── Meme Pump Scanner ──
            {
                name: 'get_meme_list',
                description: 'Get list of trending Meme/Pump tokens from PumpFun, Moonshot, SunPump. Vietnamese: "meme coin mới", "token pump", "scan meme". Use to discover new meme tokens.',
                parameters: {
                    type: 'object',
                    properties: {
                        chainIndex: { type: 'string', description: '"501" for Solana (PumpFun), "728126428" for Tron (SunPump). Default "501"' },
                        stage: { type: 'string', description: '"NEW", "MIGRATING", or "MIGRATED". Default "MIGRATED"' },
                        sortBy: { type: 'string', description: '"progress", "createdTime", "marketCap", "volume24h". Default "createdTime"' },
                        minMarketCap: { type: 'string', description: 'Min market cap USD' },
                        maxMarketCap: { type: 'string', description: 'Max market cap USD' },
                        minVolume24h: { type: 'string', description: 'Min 24h volume USD' },
                        minHolders: { type: 'string', description: 'Min holders count' },
                        limit: { type: 'string', description: 'Results (default 20, max 50)' }
                    }
                }
            },
            {
                name: 'get_meme_detail',
                description: 'Get detailed meme token info: creator, mcap, holders, socials, progress, risk. Vietnamese: "chi tiết meme", "thông tin pump token".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            {
                name: 'get_meme_dev_info',
                description: 'Check meme dev reputation: total created, rug-pulled, migrated. Vietnamese: "kiểm tra dev", "dev rug bao nhiêu".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            {
                name: 'get_similar_memes',
                description: 'Find similar meme tokens. Vietnamese: "tìm token tương tự".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            // ── Portfolio PnL ──
            {
                name: 'get_portfolio_overview',
                description: 'On-chain portfolio overview for any wallet: PnL, win rate, stats. Vietnamese: "phân tích ví", "win rate", "portfolio PnL". Works for ANY address.',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, walletAddress: { type: 'string' }, timeFrame: { type: 'string', description: '"1"=1D, "2"=3D, "3"=7D, "4"=1M, "5"=3M' } }, required: ['chainIndex', 'walletAddress'] }
            },
            {
                name: 'get_portfolio_pnl',
                description: 'Recent PnL list per token for any wallet. Vietnamese: "lãi lỗ từng token".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, walletAddress: { type: 'string' }, tokenContractAddress: { type: 'string' }, limit: { type: 'string' } }, required: ['chainIndex', 'walletAddress'] }
            },
            {
                name: 'get_portfolio_dex_history',
                description: 'DEX transaction history with PnL per trade. Vietnamese: "lịch sử DEX", "đã mua bán gì".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, walletAddress: { type: 'string' }, type: { type: 'string', description: '"1"=Buy, "2"=Sell, "3"=Transfer In, "4"=Transfer Out' }, limit: { type: 'string' } }, required: ['chainIndex', 'walletAddress'] }
            },
            // ── Transaction History ──
            {
                name: 'get_tx_history',
                description: 'On-chain tx history for any address. Vietnamese: "lịch sử giao dịch on-chain", "tx history".',
                parameters: { type: 'object', properties: { address: { type: 'string' }, chains: { type: 'string', description: 'Comma-separated chain IDs' }, limit: { type: 'string', description: 'Default 20' } }, required: ['address', 'chains'] }
            },
            {
                name: 'get_tx_detail',
                description: 'Transaction details by hash. Vietnamese: "chi tiết giao dịch", "xem tx hash".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, txHash: { type: 'string' } }, required: ['chainIndex', 'txHash'] }
            },
            // ── Token Advanced Audit ──
            {
                name: 'get_token_audit',
                description: 'Advanced audit: honeypot, LP burn %, dev/bundle/sniper holding %, risk level, rug history. Vietnamese: "audit token", "honeypot check". More detailed than get_token_security.',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            {
                name: 'get_token_liquidity_pools',
                description: 'Top 5 liquidity pools for a token: TVL, fee rate, pool creator. Vietnamese: "thanh khoản token", "pool token".',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            // ── Smart Trade Activity ──
            {
                name: 'get_smart_trades',
                description: 'Trades filtered by wallet type: KOL, Smart Money, Whale, Sniper. Vietnamese: "ai đang mua", "smart money có mua không". Unlike get_recent_trades, filters by reputation.',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string' }, tokenContractAddress: { type: 'string' }, tagFilter: { type: 'string', description: '"1"=KOL, "2"=Dev, "3"=Smart Money, "4"=Whale, "5"=New, "6"=Suspicious, "7"=Sniper, "8"=Phishing, "9"=Bundle' }, limit: { type: 'string', description: 'Max 500. Default 50' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            // ── Idea #6: AI Deep Research ──
            {
                name: 'deep_research_token',
                description: 'Run a comprehensive AI deep research analysis on a token. Calls 10+ APIs to produce a detailed report with Technical Score, Safety Score, Whale Interest, and AI Verdict. Vietnamese: "phân tích sâu", "research token", "đánh giá token". Use when user wants a thorough, multi-dimensional analysis beyond simple price/info.',
                parameters: { type: 'object', properties: { chainIndex: { type: 'string', description: 'Chain ID. Default "196"' }, tokenContractAddress: { type: 'string', description: 'Token contract address OR symbol' } }, required: ['chainIndex', 'tokenContractAddress'] }
            },
            // ── Idea #1: AI Auto Trading Agent ──
            {
                name: 'manage_auto_trading',
                description: 'Manage autonomous AI trading agent. Actions: enable, disable, status, set_config. Vietnamese: "bật auto trade", "tắt auto trade", "cấu hình trading AI", "trạng thái agent". The agent monitors Smart Money/Whale signals and auto-trades based on AI risk scoring.',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"enable", "disable", "status", "set_config"' }, riskLevel: { type: 'string', description: '"conservative", "moderate", "aggressive". Default "conservative"' }, maxAmountUsd: { type: 'string', description: 'Max USD per auto trade. Default "5"' }, chains: { type: 'string', description: 'Comma-separated chains to watch. Default "196,1,56,501"' }, stopLossPct: { type: 'number', description: 'Stop loss %. Default 20' }, takeProfitPct: { type: 'number', description: 'Take profit %. Default 50' } }, required: ['action'] }
            },
            // ── Idea #9: Cross-Chain Arbitrage Scanner ──
            {
                name: 'scan_arbitrage',
                description: 'Scan for cross-chain price arbitrage opportunities. Compares the same token price across multiple chains and calculates net profit after gas. Vietnamese: "tìm chênh lệch giá", "arbitrage", "kiếm lời xuyên chuỗi".',
                parameters: { type: 'object', properties: { tokenSymbol: { type: 'string', description: 'Token symbol to scan (e.g. "ETH", "USDT")' }, chains: { type: 'string', description: 'Comma-separated chain IDs. Default "1,56,196,137,42161,8453"' } }, required: ['tokenSymbol'] }
            },
            // ── Idea #5: Copy Trading ──
            {
                name: 'manage_copy_trading',
                description: 'Social copy trading — follow top traders and auto-copy their trades. Actions: register (become leader), follow, unfollow, leaderboard, my_followers. Vietnamese: "copy trade", "theo dõi trader", "bảng xếp hạng", "leader", "đăng ký copy".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"register", "follow", "unfollow", "leaderboard", "my_followers", "status"' }, leaderId: { type: 'string', description: 'Leader user ID (for follow/unfollow)' }, walletAddress: { type: 'string', description: 'Your wallet address (for register as leader)' }, maxCopyAmount: { type: 'string', description: 'Max USD to copy per trade. Default "10"' } }, required: ['action'] }
            },
            // ── Idea #7: Agent Marketplace ──
            {
                name: 'browse_marketplace',
                description: 'Browse and manage AI agent plugins in the marketplace. Actions: list, install, remove, info. Vietnamese: "marketplace", "cài plugin", "xem plugin", "chợ agent".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"list", "install", "remove", "info"' }, pluginId: { type: 'string', description: 'Plugin ID (for install/remove/info)' }, category: { type: 'string', description: 'Filter by category: "trading", "analytics", "social", "utility"' } }, required: ['action'] }
            },
            // ── #4: Meme Sniper Intelligence Radar ──
            {
                name: 'scan_meme_radar',
                description: 'Start/stop real-time meme token radar scanning. Finds new meme tokens, scores risk, and identifies snipe candidates. Vietnamese: "quét meme", "radar meme", "tìm meme mới", "snipe token". English: "scan memes", "meme radar", "find new tokens".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"start", "stop", "status", "candidates", "heatmap"' }, maxMarketCap: { type: 'string', description: 'Max market cap filter for snipe candidates' }, minScore: { type: 'string', description: 'Min risk score (0-100). Default "60"' } }, required: ['action'] }
            },
            // ── #10: Paper Trading Academy ──
            {
                name: 'paper_trade',
                description: 'Paper trading (virtual money, real prices). Practice trading without risk. Vietnamese: "giao dịch ảo", "paper trade", "tập trade", "portfolio ảo". English: "paper trade", "practice trading", "virtual portfolio".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"buy", "sell", "portfolio", "leaderboard", "challenge", "level"' }, token: { type: 'string', description: 'Token symbol to trade' }, amount: { type: 'string', description: 'Amount in USD or tokens' } }, required: ['action'] }
            },
            // ── #15: Emergency Panic Sell ──
            {
                name: 'emergency_sell_all',
                description: 'EMERGENCY: Sell ALL tokens in wallet to stablecoin in one command. Includes honeypot detection and recovery report. ⚠️ Requires confirmation. Vietnamese: "panic sell", "bán hết", "khẩn cấp bán tất cả", "sell all". English: "panic button", "emergency sell", "sell everything".',
                parameters: { type: 'object', properties: { targetStable: { type: 'string', description: 'Stablecoin to convert to. Default "USDT"' }, dryRun: { type: 'boolean', description: 'If true, simulate without executing. Default true' }, confirm: { type: 'boolean', description: 'Must be true to execute. Default false for safety' } }, required: [] }
            },
            // ── #16: Smart DCA Bot ──
            {
                name: 'manage_dca',
                description: 'Manage Smart DCA (Dollar Cost Averaging) bot. AI adjusts buy amount based on MA20, RSI, and whale activity. Vietnamese: "mua định kỳ", "DCA", "mua mỗi ngày", "tắt DCA". English: "DCA bot", "daily buy", "auto buy".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"create", "cancel", "list", "stats"' }, token: { type: 'string', description: 'Token to DCA into' }, amount: { type: 'string', description: 'Base amount per buy in USD' }, interval: { type: 'string', description: '"hourly", "4h", "12h", "daily", "weekly". Default "daily"' }, smartMode: { type: 'boolean', description: 'Enable AI-adjusted amounts. Default true' } }, required: ['action'] }
            },
            // ── #14: CEX-DEX Price Bridge ──
            {
                name: 'compare_cex_dex_price',
                description: 'Compare token prices between CEX (OKX) and DEX (multiple chains) to find the best route. Calculates fees and gas. Vietnamese: "so sánh giá", "giá sàn nào rẻ", "mua ở đâu tốt". English: "compare prices", "best price", "CEX vs DEX".',
                parameters: { type: 'object', properties: { token: { type: 'string', description: 'Token symbol to compare (e.g. "OKB", "ETH")' }, amount: { type: 'string', description: 'Amount in USD to buy. Default "100"' }, chains: { type: 'string', description: 'Comma-separated chain IDs. Default "196,1,56"' } }, required: ['token'] }
            },
            // ── #25: Strategy Backtester ──
            {
                name: 'backtest_strategy',
                description: 'Backtest a trading strategy against historical price data. Supports: Fixed DCA, Smart DCA, MA Crossover, RSI Bounce, Whale Follow. Vietnamese: "backtest", "kiểm tra chiến lược", "test strategy". English: "backtest strategy", "test trading plan".',
                parameters: { type: 'object', properties: { strategy: { type: 'string', description: '"dca_fixed", "smart_dca", "ma_crossover", "rsi_bounce", "whale_follow"' }, token: { type: 'string', description: 'Token to backtest on' }, period: { type: 'string', description: '"7d", "30d", "90d", "1y". Default "30d"' }, initialCapital: { type: 'string', description: 'Starting capital in USD. Default "1000"' } }, required: ['strategy', 'token'] }
            },
            // ── #29: Multi-Wallet Strategy Manager ──
            {
                name: 'manage_wallet_groups',
                description: 'Organize wallets into strategy groups (HODL, DCA, Sniper, Yield, Arbitrage, Reserve). Vietnamese: "nhóm ví", "chiến lược ví", "quản lý đa ví". English: "wallet groups", "multi-wallet", "strategy manager".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"create_group", "delete_group", "add_wallet", "remove_wallet", "list_groups", "rebalance_check"' }, groupName: { type: 'string', description: 'Name of the wallet group' }, strategy: { type: 'string', description: '"hodl", "dca", "sniper", "yield", "arbitrage", "reserve"' }, walletId: { type: 'string', description: 'Wallet ID to add/remove' } }, required: ['action'] }
            },
            // ── #11: Wallet Security Guardian ──
            {
                name: 'scan_wallet_security',
                description: 'Comprehensive wallet security scan: approval scanner, anomaly detection, security scoring, pre-swap honeypot check. Vietnamese: "kiểm tra bảo mật ví", "quét approval", "điểm an toàn ví", "revoke approval". English: "security scan", "check approvals", "wallet safety".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"full_scan", "check_approvals", "security_score", "pre_swap_check"' }, walletAddress: { type: 'string', description: 'Wallet address to scan' }, tokenAddress: { type: 'string', description: 'Token address (for pre_swap_check)' } }, required: ['action'] }
            },
            // ── #17: AI Daily Market Report ──
            {
                name: 'manage_daily_report',
                description: 'Enable/disable automated AI daily market report. Includes: market overview, whale activity, meme spotlight, portfolio summary, AI verdict. Vietnamese: "bản tin hàng ngày", "bật báo cáo sáng", "tắt daily report". English: "daily report", "morning brief", "market summary".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"enable", "disable", "send_now", "status", "set_time"' }, hour: { type: 'string', description: 'Hour to receive report (0-23). Default "8"' } }, required: ['action'] }
            },
            // ── #18: Custom Alert Rules Engine ──
            {
                name: 'manage_alert_rules',
                description: 'Create custom multi-condition alerts using natural language. Supports: price above/below, whale buys, smart money, volume, holder count. Vietnamese: "tạo cảnh báo tùy chỉnh", "alert khi...", "báo khi OKB dưới $50 VÀ whale mua". English: "custom alert", "alert when", "create rule".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"create", "list", "delete", "parse_text"' }, ruleText: { type: 'string', description: 'Natural language rule (for create/parse_text)' }, ruleId: { type: 'string', description: 'Rule ID (for delete)' } }, required: ['action'] }
            },
            // ── #21: Whale Wallet Cloner ──
            {
                name: 'manage_whale_tracking',
                description: 'Track and mirror whale wallet trades. Auto-copy trades with proportional sizing. Vietnamese: "theo dõi cá voi", "clone ví whale", "copy cá voi", "mirror whale". English: "track whale", "clone whale", "copy wallet".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"track", "untrack", "list", "stats", "set_auto_mirror"' }, whaleAddress: { type: 'string', description: 'Whale wallet address' }, label: { type: 'string', description: 'Custom label for the whale' }, maxPerTrade: { type: 'string', description: 'Max USD per mirrored trade. Default "50"' }, autoMirror: { type: 'boolean', description: 'Enable auto-mirror trades. Default false' } }, required: ['action'] }
            },
            // ── #22: AI Narrative Detector ──
            {
                name: 'detect_narratives',
                description: 'Detect trending crypto narratives (AI, RWA, DePIN, GameFi, DeFi, Meme, L2, BTC Eco, SocialFi, Privacy). Checks portfolio alignment. Vietnamese: "xu hướng narrative", "trend gì đang hot", "danh mục có theo trend không". English: "trending narratives", "what narrative is hot", "portfolio alignment".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"trending", "check_alignment", "analyze_text"' }, text: { type: 'string', description: 'Text to analyze (for analyze_text)' }, hours: { type: 'string', description: 'Lookback hours. Default "24"' } }, required: ['action'] }
            },
            // ── #28: Token Unlock Tracker ──
            {
                name: 'check_token_vesting',
                description: 'Track token unlock/vesting schedules. Get next unlock date, supply impact analysis. Vietnamese: "lịch unlock token", "token nào sắp unlock", "vesting schedule", "bao giờ unlock". English: "token unlock", "vesting schedule", "upcoming unlocks".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"check", "add_schedule", "upcoming", "impact"' }, token: { type: 'string', description: 'Token symbol' }, days: { type: 'string', description: 'Lookahead days. Default "30"' } }, required: ['action'] }
            },
            // ── #30: Social Sentiment Radar ──
            {
                name: 'analyze_sentiment',
                description: 'Analyze social sentiment for a token. Includes Fear & Greed Index. Vietnamese: "tâm lý thị trường", "sentiment", "sợ hay tham", "fear greed index". English: "market sentiment", "fear greed", "social mood".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"analyze", "fear_greed", "trend", "keyword_cloud"' }, token: { type: 'string', description: 'Token to analyze' }, text: { type: 'string', description: 'Text to analyze sentiment (optional)' } }, required: ['action'] }
            },
            // ── #13: DeFi Yield Autopilot ──
            {
                name: 'manage_yield_autopilot',
                description: 'Auto yield farming optimization — scans pools, auto-rebalances to highest APY, monitors impermanent loss. Vietnamese: "yield farming tự động", "bật autopilot", "APY tốt nhất", "impermanent loss". English: "yield autopilot", "auto farm", "best APY".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"enable", "disable", "status", "scan_pools", "check_il"' }, amount: { type: 'string', description: 'Amount to deposit in USD' }, token: { type: 'string', description: 'Token to farm with. Default "USDT"' } }, required: ['action'] }
            },
            // ── #19: Anti-Scam Group Moderation ──
            {
                name: 'check_scam',
                description: 'Check URLs and token addresses for scam indicators. Includes: phishing detection, dev rug history, bundler check, anti-shill. Vietnamese: "kiểm tra lừa đảo", "có phải scam không", "check scam". English: "is this a scam", "check scam", "verify token".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"check_url", "check_token", "top_shillers", "enable_auto_mod", "disable_auto_mod"' }, url: { type: 'string', description: 'URL to check (for check_url)' }, tokenAddress: { type: 'string', description: 'Token address (for check_token)' } }, required: ['action'] }
            },
            // ── #20: Referral System ──
            {
                name: 'manage_referral',
                description: 'Referral and rewards system — generate referral codes, earn rewards for inviting friends. Vietnamese: "giới thiệu bạn", "referral", "code giới thiệu", "thưởng mời bạn". English: "referral code", "invite friends", "referral rewards".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"get_code", "stats", "leaderboard", "apply_code"' }, code: { type: 'string', description: 'Referral code (for apply_code)' } }, required: ['action'] }
            },
            // ── #23: Gas Optimizer ──
            {
                name: 'get_optimal_gas',
                description: 'Get optimal gas timing and cost estimation. Finds cheapest time to transact. Vietnamese: "gas rẻ nhất khi nào", "tối ưu gas", "phí gas". English: "cheapest gas", "gas timing", "gas optimizer".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"current", "best_time", "estimate_cost", "history"' }, chainId: { type: 'string', description: 'Chain ID. Default "196"' }, gasLimit: { type: 'string', description: 'Gas limit for cost estimation. Default "21000"' } }, required: ['action'] }
            },
            // ── #26: Prediction Market ──
            {
                name: 'manage_predictions',
                description: 'Community prediction market — create predictions, bet on outcomes, view leaderboard. Vietnamese: "dự đoán giá", "đặt cược", "tạo prediction". English: "create prediction", "bet on", "prediction market".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"create", "bet", "list", "resolve", "my_bets"' }, question: { type: 'string', description: 'Prediction question (for create)' }, predictionId: { type: 'string', description: 'Prediction ID (for bet/resolve)' }, option: { type: 'string', description: '"0" or "1" (for bet)' }, amount: { type: 'string', description: 'Bet amount in USDT' } }, required: ['action'] }
            },
            // ── #27: Airdrop Hunter ──
            {
                name: 'check_airdrop_eligibility',
                description: 'Check wallet activity score and airdrop eligibility. Analyzes tx count, unique protocols, chains, bridge activity. Vietnamese: "kiểm tra airdrop", "ví được airdrop không", "điểm hoạt động ví". English: "airdrop eligibility", "activity score", "am I eligible".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"check_score", "active_airdrops", "claim_status"' }, walletAddress: { type: 'string', description: 'Wallet to check' } }, required: ['action'] }
            },
            // ── #24: Crypto Tax Reporter ──
            {
                name: 'generate_tax_report',
                description: 'Generate crypto tax report with gain/loss calculations. Supports FIFO, LIFO, Average cost methods. Vietnamese: "báo cáo thuế", "tính thuế crypto", "lãi lỗ giao dịch". English: "tax report", "capital gains", "export CSV".',
                parameters: { type: 'object', properties: { action: { type: 'string', description: '"generate", "export_csv", "summary"' }, taxYear: { type: 'string', description: 'Tax year. Default current year' }, method: { type: 'string', description: '"fifo", "lifo", "average". Default "fifo"' } }, required: ['action'] }
            },
            // ── B1: AI Portfolio Report ──
            {
                name: 'ai_portfolio_report',
                description: 'Generate comprehensive AI portfolio analysis: profit/loss breakdown, risk analysis, top performers, AI recommendations. Vietnamese: "báo cáo portfolio", "phân tích danh mục", "portfolio AI". English: "portfolio report", "analyze my portfolio", "portfolio summary".',
                parameters: { type: 'object', properties: { period: { type: 'string', description: '"24h", "7d", "30d", "all". Default "7d"' } } }
            },
            // ── B2: AI Price Alert (Natural Language) ──
            {
                name: 'create_ai_price_alert',
                description: 'Create price alerts using natural language — no need for /price command. Vietnamese: "báo khi ETH lên 3000", "nhắc khi OKB dưới 50", "cảnh báo giá". English: "alert me when ETH hits 3000", "notify when BTC drops to 60000".',
                parameters: { type: 'object', properties: { description: { type: 'string', description: 'Natural language alert description' }, token: { type: 'string', description: 'Token symbol' }, targetPrice: { type: 'string', description: 'Target price in USD' }, direction: { type: 'string', description: '"above" or "below"' } }, required: ['token', 'targetPrice', 'direction'] }
            }
        ]
    }
];
