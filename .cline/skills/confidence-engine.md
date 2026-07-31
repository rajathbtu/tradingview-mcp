# Confidence Engine

## Purpose

Every recommendation must receive a confidence score.

Confidence determines whether a trade should be taken.

No recommendation may bypass this engine.

---

# Scoring

Maximum Score

100

---

# Trend (20)

Bullish Structure

+10

Higher Timeframe Alignment

+10

---

# VWAP (10)

VWAP Reclaim

+5

VWAP Holding

+5

---

# EMA Stack (10)

EMA Alignment

+5

EMA Expansion

+5

---

# ADX (10)

ADX > 25

+5

DI Confirmation

+5

---

# Volume (10)

Relative Volume

+5

Volume Spike

+5

---

# Option Chain (15)

OI Confirmation

+5

Fresh Writing

+5

PCR Confirmation

+5

---

# Greeks (10)

Delta Alignment

+5

Gamma Support

+5

---

# Smart Money (10)

BOS

+3

CHOCH

+3

Liquidity Sweep

+2

Order Block

+2

---

# Risk (5)

RR >= 1:2

+5

---

# Volatility (5)

ATR Expansion

+2

Healthy IV

+3

---

# Penalties

Low ADX

-10

Low Volume

-10

Wide Spread

-10

Conflicting Timeframes

-10

Mixed OI

-10

High IV Crush Risk

-10

Major News

-20

Lunch Session

-5

First Candle

-5

Last 15 Minutes

-10

---

# Confidence Levels

95–100

Exceptional Setup

Trade aggressively within risk limits.

---

90–94

Very High Confidence

Ideal trade.

---

80–89

High Confidence

Preferred setup.

---

70–79

Moderate Confidence

Smaller position.

Extra confirmation required.

---

60–69

Weak Setup

Watchlist only.

---

Below 60

NO TRADE

---

# Mandatory Rules

Confidence below 80

Return

NO TRADE

unless user explicitly asks for speculative setups.

---

# Tie Breakers

When CE and PE both score similarly

Prefer

1. Higher Liquidity
2. Better Risk Reward
3. Stronger OI Confirmation
4. Better Higher Timeframe Alignment
5. Lower Bid Ask Spread

---

# Final Output

Always include

Overall Confidence

Trend Score

Momentum Score

Volume Score

Option Chain Score

Risk Score

Key Confirmations

Key Risks

Decision

BUY CE

BUY PE

NO TRADE

---

# Learning Rule

If a recommendation fails because

- VWAP broke
- OI reversed
- Momentum disappeared
- Volume collapsed

mention these reasons in the post-trade summary so future analyses can prioritize those failure conditions.

The confidence engine should continuously favor quality over quantity.

A skipped trade is always preferable to a low-confidence trade.