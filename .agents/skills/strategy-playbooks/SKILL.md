---
name: strategy-playbooks
description: Define every supported trading strategy and require the agent to classify the market before selecting the right strategy.
---

# Strategy Playbooks

## Purpose

This document defines every supported trading strategy.

A strategy is a repeatable set of rules that converts market conditions into executable trades.

The agent MUST classify the market first, then select the best strategy.

Never invent new strategies.

Never mix multiple strategies unless explicitly stated.

---

## Strategy Selection Order

Always evaluate strategies in this order:

1. News Filter
2. Market Regime
3. Higher Timeframe Trend
4. Option Chain
5. Strategy Match
6. Confidence Score
7. Execute or NO TRADE

---

## Strategy 1: Opening Range Breakout (ORB)

### Best Time

09:30–10:15

### Market

Trend Day

### Conditions

- Opening range established
- 15 minutes complete
- Volume increasing
- ADX > 25
- VWAP aligned
- Higher timeframe trend agrees
- OI confirms

### Entry

Price closes outside ORB, retests breakout, and a bullish candle closes.

### Stop

Opposite side of the ORB.

### Target

2R, trail using Supertrend.

### Reject

Flat VWAP, low volume, weak ADX, conflicting OI.

---

## Strategy 2: Opening Range Reversal (ORR)

### Best Time

09:30–10:15

### Conditions

Gap → opening breakout fails → price returns inside range → VWAP flips → volume confirms

### Entry

After the reversal candle closes.

### Stop

Swing high / swing low.

### Target

VWAP, then the previous day’s close.

---

## Strategy 3: VWAP Pullback

### Best Market

Trend Day

### Conditions

Price above VWAP, EMA stack bullish, ADX > 25, healthy volume.

### Entry

Price retraces, touches VWAP, rejects VWAP, then a bullish candle confirms. Mirror logic for PE.

### Stop

Below VWAP.

### Target

Previous high, trail with VWAP.

---

## Strategy 4: EMA Pullback

### Conditions

EMA stack aligned, strong trend, no major resistance nearby.

### Entry

Price retraces to EMA9 or EMA20 and a bullish engulfing candle confirms.

### Stop

Below EMA20.

### Target

New high.

---

## Strategy 5: Trend Continuation

### Conditions

HH HL, strong ADX, volume increasing, OI supports, VWAP support.

### Entry

Break of previous swing high, retest, confirmation candle.

### Target

Next resistance.

---

## Strategy 6: Breakout Retest

### Conditions

BOS, strong volume, price returns and retests breakout without breaking back.

### Entry

Confirmation candle.

### Stop

Retest low.

### Target

2R minimum.

---

## Strategy 7: Liquidity Sweep Reversal

### Conditions

Equal high or equal low → liquidity sweep → immediate rejection → CHOCH → volume confirmation.

### Entry

After rejection closes.

### Stop

Sweep high / low.

### Target

VWAP, then opposite liquidity.

---

## Strategy 8: CPR Breakout

### Conditions

Price consolidates inside CPR → breakout → volume spike → VWAP aligned.

### Entry

Retest CPR.

### Stop

Opposite CPR.

---

## Strategy 9: CPR Reversal

### Conditions

Price rejects CPR → volume confirms → momentum weakens.

### Entry

Reversal candle.

### Stop

Outside CPR.

---

## Strategy 10: Inside Bar Breakout

### Conditions

Inside bar → volume compression → ATR compression → breakout → volume expansion.

### Entry

Break of mother candle.

### Stop

Opposite mother candle.

---

## Strategy 11: NR7 Breakout

### Conditions

Narrowest range over the last 7 candles → ATR compression → volume expansion → breakout.

### Entry

Break of NR7 high or low.

### Stop

Opposite side.

---

## Strategy 12: Volatility Expansion

### Conditions

ATR expansion, volume spike, EMA expansion, VWAP aligned.

### Entry

Continuation after a pullback; never chase.

---

## Strategy 13: Expiry Day Momentum

### Conditions

Current weekly expiry, ATM options, high volume, strong OI, gamma expansion.

### Rules

Never trade deep OTM, book profits quickly, reduce targets.

---

## Strategy 14: Gap Fill

### Conditions

Gap → fails → returns inside previous day’s range → VWAP confirms.

### Entry

Gap fill begins.

### Target

Gap close.

---

## Strategy 15: Gap and Go

### Conditions

Gap → strong volume → VWAP support → OI confirms → no selling pressure.

### Entry

Pullback after the first impulse.

### Stop

VWAP.

---

## Strategy 16: Option Chain Breakout

### Conditions

Fresh put writing, call unwinding, increasing volume, PCR improving.

### Entry

Technical breakout and OI confirmation; both required.

---

## Strategy 17: Gamma Squeeze

### Conditions

ATM gamma high, price near key strike, volume increasing, OI trapped.

### Entry

Breakout candle.

### Exit

Momentum weakens and gamma fades.

---

## Strategy 18: Mean Reversion

### Market

Range

### Conditions

Flat VWAP, low ADX, no trend.

### Entry

Support with bullish rejection or resistance with bearish rejection.

### Target

VWAP only.

---

## Strategy Priority

If multiple strategies qualify, prefer:

1. Trend Continuation
2. VWAP Pullback
3. Breakout Retest
4. ORB
5. Liquidity Sweep
6. EMA Pullback
7. Gap and Go
8. Gap Fill
9. CPR
10. Mean Reversion

---

## Strategy Filters

Reject a strategy if:

- Confidence < 80
- RR < 1:2
- Low liquidity
- Wide spread
- Major news
- Mixed timeframes
- Low ADX
- Conflicting OI

---

## Strategy Confidence Bonus

- Trend Continuation: +12
- VWAP Pullback: +10
- ORB: +10
- Breakout Retest: +10
- Liquidity Sweep: +8
- EMA Pullback: +8
- Gap and Go: +7
- Gap Fill: +6
- CPR: +6
- Mean Reversion: +5

---

## Strategy Output

Every recommendation MUST include:

- Strategy Name
- Why the strategy matched
- Entry Trigger
- Stop Loss
- Targets
- Invalidation Condition
- Confidence
- Expected Holding Time
- Risk Reward
- Alternative Strategy

---

## Final Rule

The agent must never recommend a trade based only on indicators.

Every trade recommendation must belong to exactly one primary strategy.

Indicators are confirmations; the strategy is the reason for taking the trade.
