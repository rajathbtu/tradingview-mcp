# Skill: Indicator Definitions

## Purpose

This document defines every trading signal using deterministic rules.

The agent MUST use these definitions consistently.

Never invent custom interpretations.

If a signal cannot be confirmed,

consider it absent.

---

# Market Structure

## Higher High (HH)

Current confirmed swing high >

Previous confirmed swing high.

AND

Swing low remains intact.

---

## Higher Low (HL)

Current swing low >

Previous swing low.

---

## Lower High (LH)

Current swing high <

Previous swing high.

---

## Lower Low (LL)

Current swing low <

Previous swing low.

---

# Break of Structure (BOS)

Bullish BOS

Current candle closes above the previous confirmed swing high.

Volume >

20-period average.

Body size >

60% of candle range.

---

Bearish BOS

Current candle closes below previous confirmed swing low.

Volume confirmation required.

---

# Change of Character (CHOCH)

Previous trend reverses.

Example

HH HL

↓

LL LH

or

LL LH

↓

HH HL

Must occur with increased volume.

---

# Liquidity Sweep

Price temporarily breaks

Previous High

or

Previous Low

and immediately closes back inside the range.

Prefer confirmation using long candle wick.

---

# Fair Value Gap (FVG)

Bullish

Low of Candle 3 >

High of Candle 1

Gap remains unfilled.

---

Bearish

High of Candle 3 <

Low of Candle 1

Gap remains unfilled.

---

# Order Block

Bullish

Last bearish candle

before impulsive bullish BOS.

---

Bearish

Last bullish candle

before impulsive bearish BOS.

---

# Mitigation Block

Price revisits an existing Order Block

before continuing trend.

---

# VWAP

## Bullish VWAP Reclaim

Previous

3 candles

closed below VWAP.

Current candle

closes above VWAP.

Volume

>

1.5×

20-period average.

---

## VWAP Retest

Price pulls back to VWAP.

Touches VWAP.

Closes above VWAP.

---

## VWAP Rejection

Price tests VWAP.

Fails.

Closes below.

Long upper wick preferred.

---

# EMA Stack

Bullish

EMA9

>

EMA20

>

EMA50

>

EMA200

---

Bearish

EMA9

<

EMA20

<

EMA50

<

EMA200

---

Compression

Distance between EMA9 and EMA20

<

0.2%

---

Expansion

EMA distances increasing.

Slope increasing.

---

# Supertrend

Bullish

Price closes above Supertrend.

---

Bearish

Price closes below.

---

# ADX

Strong Trend

ADX > 25

---

Moderate Trend

20–25

---

Weak Trend

Below 18

Avoid breakout trades.

---

# ATR

Expansion

Current ATR >

20-period ATR Average

---

Compression

Current ATR <

20-period ATR Average

---

# RSI

Bullish

RSI > 60

---

Bearish

RSI < 40

---

Bullish Divergence

Price Lower Low

RSI Higher Low

---

Bearish Divergence

Price Higher High

RSI Lower High

---

Hidden Bullish

Price Higher Low

RSI Lower Low

---

Hidden Bearish

Price Lower High

RSI Higher High

---

# MACD

Only use

Histogram

Zero Line

Momentum

Ignore crossover-only signals.

---

Bullish Momentum

Histogram increasing

Above Zero

---

Bearish Momentum

Histogram decreasing

Below Zero

---

# Relative Volume

Current Volume

>

1.5×

Average Volume

Last 20 candles.

---

Volume Spike

Current Volume

>

2×

20-period average.

---

Buying Climax

Large bullish candle.

Extremely high volume.

Next candle weak.

---

Selling Climax

Large bearish candle.

Very high volume.

Next candle stabilizes.

---

Absorption

Large volume.

Very small body.

Long wicks.

Price fails to continue.

---

# Option Chain

## Long Build-up

Price ↑

OI ↑

---

## Short Build-up

Price ↓

OI ↑

---

## Short Covering

Price ↑

OI ↓

---

## Long Unwinding

Price ↓

OI ↓

---

# PCR

Bullish

PCR > 1

Bearish

PCR < 0.8

Neutral

0.8–1.0

---

# Greeks

Bullish Delta

Delta > 0.5

---

High Gamma Zone

Gamma highest near ATM.

Expect acceleration.

---

Theta Risk

Avoid buying options

near market close

unless momentum extremely strong.

---

# Bid Ask Spread

Acceptable

Spread

<

2%

Reject

>

5%

---

# Liquidity

Minimum Volume

Above 20-period average.

Open Interest

Above median

for analyzed strikes.

---

# Trend Alignment

Required

15m

↓

5m

↓

3m

↓

1m Entry

If higher timeframe disagrees,

confidence penalty applies.

---

# No Trade Conditions

No signal if

ADX < 18

Mixed Timeframes

Conflicting OI

Flat VWAP

Very Low Volume

Wide Spread

Major News

Lunch Session

Confidence below threshold