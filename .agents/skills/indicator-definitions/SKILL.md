---
name: indicator-definitions
description: Define every trading signal with deterministic rules and use them consistently without inventing custom interpretations.
---

# Indicator Definitions

## Purpose

This document defines every trading signal using deterministic rules.

The agent MUST use these definitions consistently.

Never invent custom interpretations.

If a signal cannot be confirmed, consider it absent.

---

## Market Structure

### Higher High (HH)

Current confirmed swing high is greater than the previous confirmed swing high, and the swing low remains intact.

### Higher Low (HL)

Current swing low is greater than the previous swing low.

### Lower High (LH)

Current swing high is less than the previous swing high.

### Lower Low (LL)

Current swing low is less than the previous swing low.

---

## Break of Structure (BOS)

### Bullish BOS

Current candle closes above the previous confirmed swing high, with volume above the 20-period average and body size above 60% of the candle range.

### Bearish BOS

Current candle closes below the previous confirmed swing low, with volume confirmation required.

---

## Change of Character (CHOCH)

A previous trend reverses. Example:

- HH HL → LL LH
- LL LH → HH HL

This must occur with increased volume.

---

## Liquidity Sweep

Price temporarily breaks the previous high or previous low and immediately closes back inside the range. Long wick confirmation is preferred.

---

## Fair Value Gap (FVG)

### Bullish

Low of Candle 3 is greater than High of Candle 1 and the gap remains unfilled.

### Bearish

High of Candle 3 is less than Low of Candle 1 and the gap remains unfilled.

---

## Order Block

### Bullish

The last bearish candle before an impulsive bullish BOS.

### Bearish

The last bullish candle before an impulsive bearish BOS.

---

## Mitigation Block

Price revisits an existing Order Block before continuing the trend.

---

## VWAP

### Bullish VWAP Reclaim

Previous 3 candles close below VWAP and the current candle closes above VWAP with volume above 1.5x the 20-period average.

### VWAP Retest

Price pulls back to VWAP, touches VWAP, and closes above VWAP.

### VWAP Rejection

Price tests VWAP, fails, and closes below. A long upper wick is preferred.

---

## EMA Stack

### Bullish

EMA9 > EMA20 > EMA50 > EMA200

### Bearish

EMA9 < EMA20 < EMA50 < EMA200

### Compression

Distance between EMA9 and EMA20 is less than 0.2%.

### Expansion

EMA distances increasing with increasing slope.

---

## Supertrend

- Bullish: price closes above Supertrend
- Bearish: price closes below Supertrend

---

## ADX

- Strong Trend: ADX > 25
- Moderate Trend: 20–25
- Weak Trend: below 18; avoid breakout trades

---

## ATR

- Expansion: current ATR > 20-period ATR average
- Compression: current ATR < 20-period ATR average

---

## RSI

- Bullish: RSI > 60
- Bearish: RSI < 40
- Bullish Divergence: price lower low, RSI higher low
- Bearish Divergence: price higher high, RSI lower high
- Hidden Bullish: price higher low, RSI lower low
- Hidden Bearish: price lower high, RSI higher high

---

## MACD

Use only the histogram and zero-line momentum. Ignore crossover-only signals.

- Bullish Momentum: histogram increasing and above zero
- Bearish Momentum: histogram decreasing and below zero

---

## Relative Volume

- Current volume > 1.5x average volume over the last 20 candles
- Volume Spike: current volume > 2x the 20-period average
- Buying Climax: large bullish candle with extremely high volume followed by a weak next candle
- Selling Climax: large bearish candle with very high volume followed by stabilization
- Absorption: large volume with a very small body and long wicks, showing price fails to continue

---

## Option Chain

- Long Build-up: price up, OI up
- Short Build-up: price down, OI up
- Short Covering: price up, OI down
- Long Unwinding: price down, OI down

---

## PCR

- Bullish: PCR > 1
- Bearish: PCR < 0.8
- Neutral: 0.8–1.0

---

## Greeks

- Bullish Delta: Delta > 0.5
- High Gamma Zone: gamma highest near ATM; expect acceleration
- Theta Risk: avoid buying options near market close unless momentum is extremely strong

---

## Bid Ask Spread

- Acceptable: spread < 2%
- Reject: spread > 5%

---

## Liquidity

- Minimum volume should be above the 20-period average
- Open interest should be above the median for analyzed strikes

---

## Trend Alignment

Required alignment is 15m → 5m → 3m → 1m entry. If the higher timeframe disagrees, apply a confidence penalty.

---

## No Trade Conditions

Do not trade if:

- ADX < 18
- Mixed timeframes
- Conflicting OI
- Flat VWAP
- Very low volume
- Wide spread
- Major news
- Lunch session
- Confidence below threshold
