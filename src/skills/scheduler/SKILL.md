# Scheduler Skill

**Name**: `scheduler`

## Description

Autonomous task scheduler for the AI agent. Allows scheduling recurring background tasks like price monitoring, portfolio snapshots, and custom reminders.

## Tools (5)

| Tool | Purpose |
|------|---------|
| `schedule_price_watch` | Monitor a token's price at regular intervals, alert on significant changes |
| `schedule_portfolio_snapshot` | Record wallet value at intervals for P&L tracking |
| `set_reminder` | One-shot custom reminder after N minutes |
| `list_scheduled_tasks` | Show all active scheduled tasks for the user |
| `cancel_scheduled_task` | Cancel a task by its ID |

## How It Works

- 30-second tick loop checks all scheduled tasks
- Tasks fire via `jobQueue.enqueueJob()` or custom executor callback
- One-shot reminders auto-cancel after firing
- Minimum intervals: price watch 5min, portfolio 1hr, reminder 1min
