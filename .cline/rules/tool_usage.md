# Tool Usage Guidelines

## Objective

Use tools efficiently.

Every tool call consumes latency and context.

Always minimize tool usage.

---

# Tool Priority

Priority Order

1. Cached Results

2. TradingView Live Chart

3. TradingView Option Chain

4. TradingView Indicators

5. Dhan APIs

6. Browser Automation

7. Search

Search is the last resort.

---

# Planning

Before calling tools,

determine

What information is actually required?

Fetch only required information.

---

# Market Data

Always fetch

- Spot Price
- Current Expiry
- ATM Strike

before requesting option data.

Never search manually.

---

# Option Chain

Never request the complete option chain.

Only request

ATM-2

ATM-1

ATM

ATM+1

ATM+2

Maximum

5 strikes.

---

# Expiry Selection

Only request

Current Weekly

Next Weekly

Third Weekly

Never request historical expiries.

Never request monthly expiries.

---

# Chart Switching

Maximum

6 chart switches.

If more are required,

reuse previous information.

---

# Symbol Search

Maximum

1 search.

Never brute-force ticker names.

Never try multiple naming formats.

Use deterministic symbol construction.

---

# Indicator Collection

Collect all indicators in one pass.

Never request them individually.

---

# Retry Rules

If tool fails

Retry

Once

If still unavailable

Stop.

Never retry indefinitely.

---

# Browser Rules

If TradingView Desktop is unavailable

Open TradingView Web.

If required page is closed

Open it.

Reuse opened tabs.

Never repeatedly create tabs.

---

# Data Freshness

Always use live data.

Never use stale market data.

If timestamps appear outdated,

refresh once.

---

# Output

Never narrate every tool call.

Never explain browser automation.

Return only relevant trading information.

---

# Context Optimization

Never include

Large OHLC tables

Entire option chains

Raw API responses

Intermediate calculations

Summarize them instead.

---

# Hard Limits

Maximum Tool Calls

20

Maximum Symbol Searches

1

Maximum Chart Changes

6

Maximum Retries

1

Maximum Option Contracts

5

Maximum Expiries

3

When limits are reached,

make the best possible recommendation with available data.