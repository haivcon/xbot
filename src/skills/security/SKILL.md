# Security Skill

**Name**: `security`

## Description

On-chain transaction safety with deep token analysis, approval risk assessment, and rate limiting.

## Tools (2)

| Tool | Purpose |
|------|---------|
| `security_check_token` | Deep security analysis before trading — honeypot, tax, liquidity, holders, scam patterns |
| `check_approval_safety` | Assess token approval transactions — warns about unlimited approvals |

## Safety Features

- 🔴 HIGH RISK = AI refuses to trade
- 🟡 MEDIUM RISK = AI warns and asks for confirmation
- 🟢 LOW RISK = Safe to proceed
- Per-user rate limiting: 20 tool calls per minute
- Known scam pattern database
