# Project Context for AI Assistants (Claude)

## Project Name
Binance Bollinger Notice Bot

## Project Type
Event-driven cryptocurrency trading **notification bot** (not auto-trading).

---

## High-Level Intent

This project monitors **Binance Futures real-time market data** via WebSocket,
calculates **Bollinger Bands (Mean Reversion strategy)** on confirmed candles,
and sends **LONG / SHORT entry notifications via Telegram**.

⚠️ This system does NOT execute trades.
It only generates and sends notifications.

---

## Architectural Principles

- Event-driven architecture
- Clear separation of responsibilities (SRP)
- No shared mutable state across modules
- In-memory state only (no database)

---

## Core Modules & Responsibilities

### Market Data Consumer
- Manages Binance Futures WebSocket connection
- Listens to kline (candlestick) streams
- Emits events **only on candle close (x = true)**
- Handles reconnection, heartbeat, and buffering
- Does NOT calculate indicators or signals

Reference:
- `20_System_Design/Market_Data_Consumer.md`
- `ADR-003-WebSocket-Data-Handling`

---

### Strategy Engine
- Receives confirmed candle close events
- Maintains rolling close price buffer (period = 20)
- Calculates Bollinger Bands (20, 2)
- Applies Mean Reversion logic
- Applies Volatility Filter (Bandwidth-based)
- Emits structured trading signals

It does NOT:
- Send notifications
- Handle debounce or rate limits
- Execute trades

Reference:
- `20_System_Design/Strategy_Engine.md`
- `ADR-002-Strategy-Logic-Bollinger-Bands`

---

### Notification Service
- Receives validated signals from Strategy Engine
- Applies debounce rules (one signal per candle/type)
- Handles Telegram API rate limits
- Formats and sends messages via Telegram Bot API
- Sends fatal error notifications separately

Reference:
- `20_System_Design/Notification_Service.md`
- `ADR-004-Notification-Debounce-Policy`

---

## Data Flow (Strict Order)

1. Binance WebSocket emits kline data
2. Market Data Consumer filters confirmed candles
3. Strategy Engine evaluates indicators and signals
4. Notification Service decides whether to notify
5. Telegram message is sent

No module should skip or invert this order.

---

## Security Constraints

- API keys must never be hard-coded
- All secrets come from environment variables
- Binance API keys use IP whitelist
- Initial deployment uses **read-only permissions**

Reference:
- `ADR-005-Security-API-Key-Management`

---

## Coding Guidelines for AI

When generating or modifying code:

- Do NOT mix responsibilities between modules
- Do NOT calculate indicators outside Strategy Engine
- Do NOT send notifications outside Notification Service
- Do NOT use unconfirmed candle data for signals
- Prefer clarity and correctness over optimization
- Follow existing ADR decisions unless explicitly overridden

---

## Extension Notes

Possible future modules (not yet implemented):

- Execution Engine (auto trading)
- Portfolio Management
- Multi-strategy orchestration
- Persistence layer (DB)

AI assistants should NOT assume these exist unless explicitly added.

---

## Source of Truth

If there is ambiguity:

1. ADR documents take precedence
2. System Design documents come next
3. README is descriptive, not authoritative
````

---
