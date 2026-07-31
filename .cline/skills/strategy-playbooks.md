# Skill: Strategy Playbooks

## Purpose

This document defines every supported trading strategy.

A strategy is a repeatable set of rules that converts market conditions into executable trades.

The agent MUST classify the market first, then select the best strategy.

Never invent new strategies.

Never mix multiple strategies unless explicitly stated.

---

# Strategy Selection Order

Always evaluate strategies in this order

1. News Filter
2. Market Regime
3. Higher Timeframe Trend
4. Option Chain
5. Strategy Match
6. Confidence Score
7. Execute or NO TRADE

---

# Strategy 1
## Opening Range Breakout (ORB)

### Best Time

09:30–10:15

### Market

Trend Day

### Conditions

Opening range established

15 minutes complete

Volume increasing

ADX > 25

VWAP aligned

Higher timeframe trend agrees

OI confirms

### Entry

Price closes outside ORB

↓

Retests breakout

↓

Bullish candle closes

↓

Enter

### Stop

Opposite side of ORB

### Target

2R

Trail using Supertrend

### Reject

Flat VWAP

Low Volume

Weak ADX

Conflicting OI

---

# Strategy 2
## Opening Range Reversal (ORR)

### Best Time

09:30–10:15

### Conditions

Gap

↓

Opening breakout fails

↓

Price returns inside range

↓

VWAP flips

↓

Volume confirms

### Entry

After reversal candle closes

### Stop

Swing High / Swing Low

### Target

VWAP

Then previous day's close

---

# Strategy 3
## VWAP Pullback

### Best Market

Trend Day

### Conditions

Price above VWAP

EMA Stack Bullish

ADX > 25

Healthy Volume

### Entry

Price retraces

↓

Touches VWAP

↓

Rejects VWAP

↓

Bullish candle

↓

Enter CE

Mirror logic for PE.

### Stop

Below VWAP

### Target

Previous High

Trail with VWAP

---

# Strategy 4
## EMA Pullback

### Conditions

EMA Stack aligned

Strong trend

No major resistance nearby

### Entry

Price retraces

EMA9 or EMA20

↓

Bullish engulfing

↓

Enter

### Stop

Below EMA20

### Target

New High

---

# Strategy 5
## Trend Continuation

### Conditions

HH HL

Strong ADX

Volume increasing

OI supports

VWAP support

### Entry

Break of previous swing high

Retest

Confirmation candle

### Target

Next resistance

---

# Strategy 6
## Breakout Retest

### Conditions

BOS

Strong Volume

Price returns

Retests breakout

Fails to break back

### Entry

Confirmation candle

### Stop

Retest Low

### Target

2R minimum

---

# Strategy 7
## Liquidity Sweep Reversal

### Conditions

Equal High

or

Equal Low

↓

Liquidity Sweep

↓

Immediate rejection

↓

CHOCH

↓

Volume confirmation

### Entry

After rejection closes

### Stop

Sweep High/Low

### Target

VWAP

Then opposite liquidity

---

# Strategy 8
## CPR Breakout

### Conditions

Price consolidates inside CPR

↓

Breakout

↓

Volume Spike

↓

VWAP aligned

### Entry

Retest CPR

### Stop

Opposite CPR

---

# Strategy 9
## CPR Reversal

### Conditions

Price rejects CPR

↓

Volume confirms

↓

Momentum weakens

### Entry

Reversal candle

### Stop

Outside CPR

---

# Strategy 10
## Inside Bar Breakout

### Conditions

Inside Bar

↓

Volume Compression

↓

ATR Compression

↓

Breakout

↓

Volume Expansion

### Entry

Break of Mother Candle

### Stop

Opposite Mother Candle

---

# Strategy 11
## NR7 Breakout

### Conditions

Narrowest Range

Last 7 candles

↓

ATR Compression

↓

Volume Expansion

↓

Breakout

### Entry

Break of NR7 High

or

Low

### Stop

Opposite side

---

# Strategy 12
## Volatility Expansion

### Conditions

ATR Expansion

Volume Spike

EMA Expansion

VWAP aligned

### Entry

Continuation

Never chase

Wait first pullback

---

# Strategy 13
## Expiry Day Momentum

### Conditions

Current Weekly Expiry

ATM Options

High Volume

Strong OI

Gamma Expansion

### Rules

Never trade deep OTM

Book profits quickly

Reduce targets

---

# Strategy 14
## Gap Fill

### Conditions

Gap

↓

Fails

↓

Returns inside previous day's range

↓

VWAP confirms

### Entry

Gap Fill begins

### Target

Gap Close

---

# Strategy 15
## Gap and Go

### Conditions

Gap

↓

Strong Volume

↓

VWAP Support

↓

OI confirms

↓

No selling pressure

### Entry

Pullback after first impulse

### Stop

VWAP

---

# Strategy 16
## Option Chain Breakout

### Conditions

Fresh Put Writing

Call Unwinding

Increasing Volume

PCR improving

### Entry

Technical breakout

AND

OI confirmation

Both required

---

# Strategy 17
## Gamma Squeeze

### Conditions

ATM Gamma high

Price near key strike

Volume increasing

OI trapped

### Entry

Breakout candle

### Exit

Momentum weakens

Gamma fades

---

# Strategy 18
## Mean Reversion

### Market

Range

### Conditions

Flat VWAP

Low ADX

No trend

### Entry

Support

↓

Bullish rejection

or

Resistance

↓

Bearish rejection

### Target

VWAP

Only.

---

# Strategy Priority

If multiple strategies qualify

Prefer

1.
Trend Continuation

2.
VWAP Pullback

3.
Breakout Retest

4.
ORB

5.
Liquidity Sweep

6.
EMA Pullback

7.
Gap and Go

8.
Gap Fill

9.
CPR

10.
Mean Reversion

---

# Strategy Filters

Reject strategy if

Confidence < 80

RR < 1:2

Low Liquidity

Wide Spread

Major News

Mixed Timeframes

Low ADX

Conflicting OI

---

# Strategy Confidence Bonus

Trend Continuation

+12

VWAP Pullback

+10

ORB

+10

Breakout Retest

+10

Liquidity Sweep

+8

EMA Pullback

+8

Gap and Go

+7

Gap Fill

+6

CPR

+6

Mean Reversion

+5

---

# Strategy Output

Every recommendation MUST include

Strategy Name

Why strategy matched

Entry Trigger

Stop Loss

Targets

Invalidation Condition

Confidence

Expected Holding Time

Risk Reward

Alternative Strategy

---

# Final Rule

The agent must never recommend a trade based only on indicators.

Every trade recommendation must belong to exactly one primary strategy.

Indicators are confirmations.

The strategy is the reason for taking the trade.