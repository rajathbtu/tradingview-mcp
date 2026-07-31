---
name: market-playbook
description: Define market behavior and how the trading agent should react under different regimes without forcing trades.
---

# Market Playbook

This document defines market behavior and how the trading agent should react.

The objective is not to predict; the objective is to identify high-probability situations.

---

## Rule Zero

Never force a trade. If market conditions are unclear, return NO TRADE.

## Option-Chain Verification Rule

Before evaluating options, verify the underlying symbol and expiry from visible TradingView evidence. For NIFTY options, do not guess the symbol, expiry, ATM strike, or option ticker. If the option chain cannot be verified, return NO TRADE and state that the option-chain could not be resolved.

---

## Daily Workflow

Before looking at options, determine:

- Gap
- Trend
- Market Structure
- VWAP
- Opening Range
- Option Chain
- India VIX
- News Events

Only then consider buying options.

---

## Market Classification

Every session must be classified into one category.

### Trend Day Bullish

Characteristics:

- HH HL
- Price above VWAP
- EMA Stack Bullish
- ADX > 25
- Increasing Volume
- Strong Put Writing
- Call Unwinding

Strategy: prefer BUY CE and avoid PE.

### Trend Day Bearish

Characteristics:

- LH LL
- Price below VWAP
- EMA Stack Bearish
- ADX > 25
- Strong Call Writing
- Put Unwinding

Strategy: prefer BUY PE and avoid CE.

### Range Day

Characteristics:

- ADX below 18
- VWAP flat
- Low ATR
- Equal highs
- Equal lows
- Balanced OI

Strategy: avoid directional buying and wait for a breakout.

### Breakout Day

Requirements:

- Opening Range Break
- Volume Spike
- VWAP Support
- OI Confirmation
- EMA Expansion
- ATR Expansion

Enter only after a retest.

### Failed Breakout

Signs:

- Weak Volume
- VWAP Lost
- Rejection Candle
- No OI Confirmation

Exit immediately and never average.

### VWAP Trend Day

- Bullish: price remains above VWAP with repeated VWAP bounces and increasing volume; buy CE on pullbacks
- Bearish: price remains below VWAP with repeated VWAP rejection; buy PE only

### Opening Range Breakout (ORB)

Opening range is 15 minutes. Do not trade before it completes. Enter only after break, retest, and volume confirmation.

### Opening Range Reversal (ORR)

Gap fails and price returns inside ORB. VWAP flips and relative volume is high; trade the opposite direction.

### Gap Up

Gap > 0.7%. Wait 15 minutes. Never chase the first candle. Look for continuation or gap fill.

### Gap Down

Same logic. Wait and never buy immediately.

### Short Covering Rally

Price rising, OI falling, high volume, momentum increasing; bullish.

### Long Build-up

Price rising, OI rising, very bullish, highest confidence.

### Long Unwinding

Price falling, OI falling, weakness; avoid buying CE.

### Short Build-up

Price falling, OI rising, bearish; prefer PE.

### Expiry Day

Premium decay accelerates. Avoid deep OTM. Trade only ATM, ATM+1, ATM-1 with smaller targets and faster exits.

### High VIX

Expect larger swings. Increase stop and reduce quantity.

### Low VIX

Expect mean reversion. Avoid breakout trades.

---

## News Filter

Never trade 15 minutes before or after major events such as RBI, Fed, Budget, Election Results, CPI, US Jobs Data, or FOMC.

---

## Lunch Session

11:45–1:30 is usually low volume. Trade only if the trend is already established.

---

## Closing Session

The last 45 minutes often see momentum increase and trend continuation probability rise. Watch for institutional flows.

---

## Confidence Boosters

Every bullish factor adds confidence:

- VWAP reclaim: +10
- Bullish EMA Stack: +10
- ADX > 25: +10
- Long Build-up: +10
- Volume Spike: +10
- BOS: +10
- Positive Delta: +10
- Strong Put Writing: +10
- ATR Expansion: +10
- Higher Timeframe Alignment: +10

---

## Confidence Reducers

- Low Volume: -10
- Flat VWAP: -10
- Mixed Timeframes: -10
- Low ADX: -10
- Wide Spread: -15
- Conflicting OI: -10
- High IV Crush Risk: -20
- News Event: -15

---

## Final Decision

- 90+ = Very High: BUY
- 80–89 = High: BUY
- 70–79 = Watchlist
- Below 70 = NO TRADE

---

## Trade Management

Once in a trade, never move the stop further away. Book partial profit at Target 1.
