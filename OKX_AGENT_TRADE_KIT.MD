Introduction
OKX Agent Trade Kit connects AI assistants directly to your OKX account. Instead of switching between your AI and the exchange, you describe what you want — the AI executes it.


It runs as a local process on your machine. Your API keys never leave your device. Fully open source under the MIT license.


The official OKX toolkit for AI-powered trading. Let your AI agent trade spot, futures, options, and more on OKX — using natural language.

GitHub · npm: okx-trade-mcp · npm: okx-trade-cli

This page may not reflect the latest release. For the most up-to-date tool list, module details, configuration options, and changelog, always refer to the GitHub repository: github.com/okx/agent-trade-kit

What can it do?
Market data — prices, order books, candles, funding rates, open interest
Spot trading — place, cancel, amend orders, batch operations, algo orders
Futures & swaps — perpetual and delivery contracts, leverage, positions
Options — order placement, option chains, Greeks (IV, Delta, Gamma, Theta, Vega)
Algo orders — conditional orders, OCO take-profit/stop-loss, trailing stops
Account — balances, bills, fee rates, position management
Bots — create, monitor, and stop grid strategies
Three ways to use it
MCP Server (okx-trade-mcp) — Plug into Claude, Cursor, Codex, OpenCode, or any AI client that supports MCP. Your agent calls OKX tools via natural language.
CLI (okx-trade-cli) — Trade from the terminal. Works with shell pipes, cron jobs, and scripts — no AI client needed.
Skills (okx-cex-market, okx-cex-trade, okx-cex-portfolio, okx-cex-bot) — Plug-and-play modules for AI clients that support the Skills protocol (e.g. OpenClaw). Install one, some, or all.
On this page: OpenClaw · MCP Clients · MCP Server · CLI · Skills · Safety · FAQ

Quick Start
OpenClaw
Security notice: Never paste your API Key, Secret Key, or Passphrase into the chat. OpenClaw's AI cannot and should not access your credentials directly — keep them in your config file only. Because AI behavior in OpenClaw is non-deterministic, we strongly recommend using a sub-account API key rather than your main account, and enabling only the permissions you need.

Step 1 — Install Skills

Open OpenClaw and paste this into the chat — not the command line:

Run npx skills add okx/agent-skills, resolve any issues you encounter, then check the BTC price.

Step 2 — Configure your API credentials

Open Terminal and run:

mkdir -p ~/.okx && cat > ~/.okx/config.toml << 'EOF'
default_profile = "demo"

[profiles.live]
api_key    = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

[profiles.demo]
api_key    = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo       = true
EOF
Open ~/.okx/config.toml in any text editor, fill in your api_key, secret_key, and passphrase, then save.

Where to get keys: API page — start with a demo key.

MCP Clients
Claude Desktop, Claude Code, Cursor, VS Code, Windsurf — and any MCP-compatible client.

Step 1 — Install
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
Verify:

okx market ticker BTC-USDT
💡 Market data works immediately — no API Key needed.

Step 2 — Add your OKX API credentials
okx config init
The interactive wizard creates ~/.okx/config.toml. Run it once and you are done.

Where to get keys: API page — start with a demo key.

Or configure manually — skip the wizard and create ~/.okx/config.toml directly:

default_profile = "demo"    # which profile to load by default

# Profile names are labels you choose — call them anything.
# Pass --profile <name> at startup to switch between them.
# "demo" and "live" are just conventions; the name itself has no special meaning.

[profiles.demo]
api_key    = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo       = true    # demo = true → simulated trading, zero real funds at risk

[profiles.live]
api_key    = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"
             # no demo flag → live trading with real funds
Site Configuration
OKX operates independent regional sites. Add site to your profile to match where your account is registered:

Site	Website	When to use
global (default)	www.okx.com	Most users worldwide
eea	my.okx.com	EEA / European users
us	app.okx.com	US users
[profiles.live]
site       = "global"    # global | eea | us  (omit for default: global)
api_key    = "your-api-key"
secret_key = "your-secret-key"
passphrase = "your-passphrase"
Step 3 — Connect your AI client
okx-trade-mcp setup --client <client>
Client	--client value
Claude Desktop	claude-desktop
Claude Code	claude-code
Cursor	cursor
VS Code	vscode
Windsurf	windsurf
For manual configuration, see Client Setup (Manual) on GitHub.

Step 4 — Try it
Open your AI client and type:

What's the current BTC price on OKX?
Show my account balance
Buy 100 USDT of BTC at market on demo
What's the BTC-USDT-SWAP funding rate?
MCP
The MCP Server exposes OKX trading tools via the Model Context Protocol standard. Register it once, then your AI agent can trade, query, and manage your account.

Startup options
What you want	Command
Market data only (no key needed)	okx-trade-mcp --modules market
Demo trading, all features	okx-trade-mcp --profile demo --modules all
Live, read-only monitoring	okx-trade-mcp --profile live --read-only
Live, spot only	okx-trade-mcp --profile live --modules market,spot
Live, swaps + options	okx-trade-mcp --profile live --modules market,swap,option
For any MCP client not listed, register it as a stdio server with:

okx-trade-mcp --profile <demo|live> --modules <all|market|spot|swap|...>
Tools
The market module requires no API key. All other modules require Read permission; write operations additionally require Trade permission.

market — Market Data
Tool	Description
market_get_ticker	Single instrument ticker (last price, 24h volume, bid/ask)
market_get_tickers	All tickers for an instrument type (SPOT / SWAP / FUTURES / OPTION)
market_get_orderbook	Order book depth
market_get_candles	Candlestick data (up to 300 recent bars)
market_get_history_candles	Historical candlestick data (older than 2 days, up to 3 months)
market_get_index_ticker	Index ticker for an underlying (e.g. BTC-USD)
market_get_index_candles	Index candlestick data
market_get_price_limit	Price limit (upper/lower) for a contract
market_get_funding_rate	Current funding rate for a perpetual contract
market_get_funding_rate_history	Historical funding rates
market_get_mark_price	Mark price for derivatives
market_get_open_interest	Open interest across instruments
market_get_trades	Recent trade history
spot — Spot Trading
Tool	Description
spot_place_order	Place a spot order (market, limit, post-only, FOK, IOC)
spot_cancel_order	Cancel an open spot order
spot_amend_order	Amend price or size of an open order
spot_batch_place_orders	Place up to 20 orders in a single request
spot_batch_cancel_orders	Cancel multiple orders in a single request
spot_get_order	Get details of a single order
spot_get_open_orders	List currently open orders
spot_get_order_history	Order history (last 7 days)
spot_get_order_history_archive	Order history older than 7 days (up to 3 months)
spot_get_fills	Recent fills / trade history
spot_get_fills_archive	Fills older than 1 hour (up to 3 months)
swap — Perpetual Contracts
Tool	Description
swap_place_order	Place a perpetual contract order
swap_cancel_order	Cancel an open swap order
swap_amend_order	Amend price or size of an open order
swap_batch_place_orders	Place up to 20 orders in a single request
swap_batch_cancel_orders	Cancel multiple orders in a single request
swap_close_position	Close all positions for an instrument
swap_get_order	Get details of a single order
swap_get_open_orders	List currently open orders
swap_get_order_history	Order history (last 7 days)
swap_get_positions	Current open positions
swap_get_fills	Recent fills
swap_set_leverage	Set leverage for an instrument
swap_get_leverage	Get current leverage settings
futures — Delivery Contracts
Tool	Description
futures_place_order	Place a delivery contract order
futures_cancel_order	Cancel an open futures order
futures_amend_order	Amend price or size of an open order
futures_get_order	Get details of a single order
futures_get_open_orders	List currently open futures orders
futures_get_order_history	Order history
futures_get_positions	Current open positions
futures_get_fills	Recent fills
option — Options
Tool	Description
option_place_order	Place an options order (buy/sell call or put)
option_cancel_order	Cancel an unfilled order
option_batch_cancel	Batch cancel up to 20 orders
option_amend_order	Amend price or size of an open order
option_get_order	Get details of a single order
option_get_orders	List pending or historical orders
option_get_positions	Current positions with Greeks
option_get_fills	Fill history
option_get_instruments	List available contracts (option chain)
option_get_greeks	IV and Greeks per contract (delta, gamma, theta, vega)
account — Account Management
Tool	Description
account_get_balance	Trading account balance (by currency or all)
account_get_asset_balance	Funding account balance
account_get_positions	Current open positions across all instruments
account_get_positions_history	Historical position records
account_get_bills	Account bills / ledger (last 7 days)
account_get_bills_archive	Bills older than 7 days (up to 3 months)
account_get_fee_rates	Trading fee rates for instrument type
account_get_config	Account configuration (position mode, account level, etc.)
account_set_position_mode	Switch between net mode and long/short mode
account_get_max_size	Maximum order size for an instrument
account_get_max_withdrawal	Maximum withdrawable amount per currency
account_get_leverage	Get leverage for an instrument
account_set_leverage	Set leverage (general, across instruments)
account_get_audit_log	Query local audit log of tool calls
bot — Trading Bots
Grid (bot.grid)

Tool	Description
grid_get_orders	List active or historical grid bots
grid_get_order_details	Get details of a specific grid bot
grid_get_sub_orders	List sub-orders within a grid bot
grid_create_order	Create a new grid bot (spot, contract, or moon grid)
grid_stop_order	Stop a running grid bot
DCA (bot.dca)

Tool	Description
dca_create_order	Create a DCA (Martingale) bot
dca_stop_order	Stop a running DCA strategy
dca_get_orders	List active or historical DCA strategies
dca_get_order_details	Get details of a single DCA strategy
dca_get_sub_orders	List sub-orders generated by a DCA strategy
CLI
The CLI is a standalone terminal tool — no AI client required.

# Market data
okx market ticker BTC-USDT
okx market candles BTC-USDT --bar 1H --limit 10
okx market funding-rate BTC-USDT-SWAP

# Trading
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross

# Account
okx account balance
okx account positions

# Grid bots
okx --demo bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# Pipes & scripting
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'
okx market candles BTC-USDT --bar 1H --limit 200 --json | python3 analyze.py
Full CLI reference →

Skills
Skills are plug-and-play modules for AI clients that support the Skills protocol. Pick the capabilities you need — install one, some, or all.

npx skills add okx/agent-skills
Skill	Package	Description	Auth
Market Data	okx-cex-market	Real-time tickers, orderbook depth, candlesticks, funding rates, open interest, and index data.	Public · No API key required
Trading	okx-cex-trade	Spot, futures, options, and algo orders — place, cancel, amend, batch operations, OCO, trailing stops, and grid bots.	Requires API key
Portfolio	okx-cex-portfolio	Account balance, positions, P&L, bills history, fee rates, and fund transfers. Full portfolio visibility in one skill.	Requires API key
Bots	okx-cex-bot	Automated trading strategies: spot grid, contract grid, and DCA bots.	Requires API key
Browse all skills on GitHub →

Safety
OKX Agent Trade Kit has four layers of protection:

Demo mode (--demo) — Trades on simulated account, live funds untouched. Start here.
Read-only mode (--read-only) — Only data queries, no trading.
Smart registration — The server checks your API Key permissions on startup. If your key can't trade, order tools are never shown to the AI.
Risk labels — Every tool that moves money is marked [CAUTION], prompting the AI to confirm before acting.
Built-in rate limiting prevents overloading the OKX API.

Credential safety: Never share your API Key, Secret Key, or Passphrase with any AI model or paste them into a chat. All credentials should stay in your local config file (~/.okx/config.toml) only. Because AI behavior is non-deterministic, we strongly recommend using a sub-account API key with only the permissions you need — avoid granting withdrawal permission unless strictly necessary.

FAQ
Q: What can I do with Agent Trade Kit?

Just about everything you can do on OKX. Check prices, trade spot, futures, and options, set up advanced orders (like stop-loss or trailing stop), manage your account, and run grid bots. You can do it all using natural language or your command line. Check GitHub for the full feature list.

Q: Can I trade futures, options, or other products with Agent Trade Kit?

That depends on your OKX account, not on Agent Trade Kit. The toolkit can only do what your account is already authorized to do on OKX — it has no ability to grant or change your trading permissions.

If your account can trade futures, swaps, or options on OKX, Agent Trade Kit can execute those too. But if your region or account type restricts certain products (for example, users in certain jurisdictions cannot access derivatives), those tools simply won't work for you — Agent Trade Kit cannot bypass these restrictions.

Think of it like a remote control: it can only operate what the TV already supports. If you are unsure what your account can access, check your OKX account settings or contact OKX support.

Q: Will I lose money if the AI makes a mistake?

We built four layers of safety to prevent that. Start in --demo mode to trade with simulated funds, or use --read-only mode to restrict the AI to data queries. Even in live mode, the AI is strictly warned before taking any action with real funds. Read our Safety guide for details. You need to independently verify all relevant information prior to execution. AI can make mistakes, and you are responsible for losses.

Q: Which AI clients are supported?

It works with any AI client that supports the Model Context Protocol (MCP). This includes Claude Desktop, Claude Code, Cursor, VS Code, and custom agents built with the MCP SDK. Right now, it runs locally on your machine, with cloud-hosted support coming soon. We may add or remove certain AI clients at our discretion.

Q: Is it free?

Yes. Agent Trade Kit is 100% free and open-source under the MIT license. All you need is an OKX account and API keys to execute trades. (You don't even need API keys just to pull market data.)

Q: Are my API keys safe?

Absolutely. Everything runs locally. Your keys are securely stored on your device (~/.okx/config.toml), all transactions are signed locally, and the AI never sees your credentials. No data is ever sent anywhere except directly to OKX. Since it's open-source, you can audit the code yourself on GitHub. You are responsible for keeping your API keys safe.

Q: What are the risks of Agent Trade Kit?

The Agent Trade Kit is a collection of servers and toolkits intended to facilitate automated or AI-assisted trading, and does not constitute financial, investment, legal, or tax advice. AI-generated actions may trigger real trades and result in significant losses due to model errors, hallucinations, inaccurate or outdated information, latency, market volatility, slippage, liquidity constraints, technical failures, incorrect parameters, or service disruptions. The Service is provided "as is" and "as available," with no warranties regarding accuracy, completeness, execution reliability, or continuous availability. The Kit may rely on third-party large language models (LLMs) that are not owned, operated, controlled, verified, or endorsed by OKX; OKX disclaims all responsibility and liability for any third-party LLM services or outputs, and you use them entirely at your own risk. You are solely responsible for independently verifying all information, configuring and supervising automated strategies, safeguarding API credentials, applying least-privilege permissions (including avoiding withdrawal permissions unless strictly necessary), binding trusted IPs, and testing with small amounts before scaling. To the maximum extent permitted by law, OKX disclaims liability for any direct or indirect losses arising from use of the Agent Trade Kit, and you agree to indemnify and hold OKX harmless from any claims related to your use, trading activities, or reliance on AI-generated outputs.

Q: How do I report a bug or suggest a feature?

Open an issue on GitHub. If a tool call fails, include the full error block — it contains everything needed to diagnose the problem.

Links
GitHub (MCP + CLI): github.com/okx/agent-trade-kit
GitHub (Skills): github.com/okx/agent-skills
npm: okx-trade-mcp · okx-trade-cli
OKX Open API: okx.com/docs-v5
Issues: github.com/okx/agent-trade-kit/issues
License: MIT
Community
Join the OKX AgentKit Telegram community for the latest updates, tips, and discussions:

t.me/OKX_AgentKit