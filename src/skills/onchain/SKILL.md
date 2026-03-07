# Onchain Skill

**Name**: `onchain`  
**Source**: Wraps `src/features/ai/ai-onchain.js`

## Description

Web3/DeFi assistant powered by OKX OnchainOS. Provides real-time blockchain data 
and transaction execution capabilities through Gemini Function Calling.

## Tools (17)

| Tool | Purpose |
|------|---------|
| `get_token_price` | Real-time token prices across 100+ chains |
| `search_token` | Search tokens by name/symbol/address |
| `get_wallet_balance` | Wallet portfolio and balances |
| `get_swap_quote` | DEX swap quotes with safety warnings |
| `execute_swap` | Full swap execution (calldata generation) |
| `get_top_tokens` | Trending token rankings with rich data |
| `get_token_holders` | Holder distribution analysis |
| `get_gas_price` | Network gas prices |
| `get_token_info` | Token metadata and market data |
| `get_market_candles` | K-line charts with RSI and sparkline |
| `get_token_market_detail` | Deep market analysis (MC, Vol, Liq) |
| `simulate_transaction` | Transaction simulation for safety |
| `manage_trading_wallet` | Create/delete/set default wallet |
| `get_trading_wallet_balance` | Trading wallet portfolio |
| `list_trading_wallets` | List all user wallets |
| `get_weather` | Weather information (via wttr.in) |

## Safety Features

- 🚨 Honeypot detection on swap quotes
- ⚠️ Buy/sell tax rate warnings
- ⚠️ High price impact alerts (>5%)
- 🛡️ Transaction simulation before broadcast
