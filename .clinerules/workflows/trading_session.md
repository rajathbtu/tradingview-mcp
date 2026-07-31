# Trading Session Prompt

Today's task is to analyze live NIFTY options for intraday scalping.

Follow the "NIFTY Options Scalping Expert" skill.

## Data Source Priority

1. TradingView Desktop
2. TradingView Web
3. TradingView Option Chain

Never use stale or cached market data for prices.

---

## Workflow

1. Open TradingView if necessary.
2. Read current NIFTY spot price.
3. Identify current, next, and third weekly expiries.
4. Compute ATM strike.
5. Analyze only ATM ±2 strikes.
6. Read live option chain data.
7. Analyze technical indicators.
8. Score every candidate.
9. Recommend the highest-confidence trade.
10. If confidence is below 80, return NO TRADE.

---

## Tool Constraints

Maximum tool calls: 20

Maximum chart switches: 6

Maximum symbol search: 1

Maximum strikes analyzed: 5

Maximum expiries analyzed: 3

Never brute-force symbol names.

Never repeatedly retry failed requests.

Stop immediately if live data cannot be obtained.

---

## Expected Output

Return a structured report including:

- Current Spot
- Current Weekly Expiry
- Market Bias
- Trend Strength
- Option Chain Summary
- Best CE Candidate
- Best PE Candidate
- Recommended Trade
- Confidence Score
- Entry
- Stop Loss
- Target 1
- Target 2
- Risk:Reward
- Key Reasons
- Risk Factors
- Final Verdict (BUY CE / BUY PE / NO TRADE)