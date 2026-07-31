/**
 * Scalping Analyzer
 * 
 * Runs full chart analysis when a trigger condition is met.
 * Analyzes trend, momentum, structure, and generates trade recommendation.
 */

/**
 * Analyze the current chart state and generate a trade recommendation
 */
export async function analyze(state, triggers, config) {
  const { lastBar, prevBar, bars, studies, symbol, atr } = state;
  if (!lastBar) return null;

  const analysis = {
    timestamp: new Date().toISOString(),
    symbol,
    price: lastBar.c,
    atr: atr || 0,
    triggers,
    trend: null,
    momentum: null,
    structure: null,
    recommendation: null,
    confidence: 0,
  };

  // ─── Trend Analysis ───
  const ema9 = studies['Moving Average Exponential']?.EMA;
  const emaVal = ema9 ? parseFloat(ema9.replace(/,/g, '')) : null;
  
  const supertrend = studies['Supertrend'];
  const supertrendVal = supertrend?.Supertrend ? parseFloat(supertrend.Supertrend.replace(/,/g, '')) : null;
  const supertrendUp = supertrend?.['Up Trend'] ? true : false;
  const supertrendDown = supertrend?.['Down Trend'] ? true : false;

  const utbot = studies['UT Bot'];
  const utbotBuy = utbot?.Buy ? parseFloat(utbot.Buy) : 0;
  const utbotStop = utbot?.['Trailing Stop'] ? parseFloat(utbot['Trailing Stop'].replace(/,/g, '')) : null;

  const vwap = studies['Volume Weighted Average Price']?.VWAP;
  const vwapVal = vwap ? parseFloat(vwap.replace(/,/g, '')) : null;

  // Determine trend
  let trendScore = 0;
  let trendDirection = 'neutral';

  if (emaVal) {
    if (lastBar.c > emaVal) { trendScore += 2; }
    else { trendScore -= 2; }
  }
  if (supertrendUp) { trendScore += 3; }
  if (supertrendDown) { trendScore -= 3; }
  if (utbotBuy > 0) { trendScore += 3; }
  if (vwapVal) {
    if (lastBar.c > vwapVal) { trendScore += 1; }
    else { trendScore -= 1; }
  }

  if (trendScore >= 3) trendDirection = 'bullish';
  else if (trendScore <= -3) trendDirection = 'bearish';
  else trendDirection = 'neutral';

  analysis.trend = {
    direction: trendDirection,
    score: trendScore,
    ema9: emaVal,
    supertrend: supertrendVal,
    supertrend_direction: supertrendUp ? 'up' : supertrendDown ? 'down' : 'none',
    utbot_signal: utbotBuy > 0 ? 'buy' : 'none',
    utbot_stop: utbotStop,
    vwap: vwapVal,
  };

  // ─── Momentum Analysis ───
  let momentumScore = 0;
  let momentumDirection = 'neutral';

  // Price momentum (last 3 bars)
  if (bars && bars.length >= 3) {
    const b1 = bars[bars.length - 1];
    const b2 = bars[bars.length - 2];
    const b3 = bars[bars.length - 3];
    
    // Higher highs / lower lows
    if (b1.h > b2.h && b2.h > b3.h) momentumScore += 2;
    if (b1.l < b2.l && b2.l < b3.l) momentumScore -= 2;
    
    // Bullish / bearish candle body
    const body1 = b1.c - b1.o;
    const body2 = b2.c - b2.o;
    if (body1 > 0 && body2 > 0) momentumScore += 1;
    if (body1 < 0 && body2 < 0) momentumScore -= 1;
    
    // Momentum of move
    const move1 = Math.abs(b1.c - b2.c);
    const move2 = Math.abs(b2.c - b3.c);
    if (move1 > move2) momentumScore += 1; // Acceleration
    else momentumScore -= 1; // Deceleration
  }

  // Volume momentum
  if (bars && bars.length > 5) {
    const volumes = bars.map(b => b.v);
    const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
    if (lastBar.v > avgVol * 1.5) momentumScore += 2;
    if (lastBar.v > avgVol * 2) momentumScore += 1;
    if (lastBar.v < avgVol * 0.5) momentumScore -= 1;
  }

  if (momentumScore >= 2) momentumDirection = 'bullish';
  else if (momentumScore <= -2) momentumDirection = 'bearish';
  else momentumDirection = 'neutral';

  analysis.momentum = {
    direction: momentumDirection,
    score: momentumScore,
    current_volume: lastBar.v,
    avg_volume: bars ? Math.round(bars.slice(0, -1).reduce((a, b) => a + b.v, 0) / Math.max(bars.length - 1, 1)) : 0,
  };

  // ─── Market Structure ───
  let structureDirection = 'neutral';
  let structureScore = 0;

  if (bars && bars.length >= 5) {
    const recent = bars.slice(-5);
    const highs = recent.map(b => b.h);
    const lows = recent.map(b => b.l);
    
    // Higher highs = bullish
    if (highs[4] > highs[3] && highs[3] > highs[2]) structureScore += 2;
    // Lower highs = bearish
    if (highs[4] < highs[3] && highs[3] < highs[2]) structureScore -= 2;
    // Higher lows = bullish
    if (lows[4] > lows[3] && lows[3] > lows[2]) structureScore += 1;
    // Lower lows = bearish
    if (lows[4] < lows[3] && lows[3] < lows[2]) structureScore -= 1;
    
    // Breakout detection
    const range = Math.max(...highs) - Math.min(...lows);
    const recentRange = highs[4] - lows[4];
    if (recentRange > range * 0.8) structureScore += 1; // Expanding range
  }

  if (structureScore >= 2) structureDirection = 'bullish';
  else if (structureScore <= -2) structureDirection = 'bearish';
  else structureDirection = 'neutral';

  analysis.structure = {
    direction: structureDirection,
    score: structureScore,
  };

  // ─── Generate Recommendation ───
  const totalScore = trendScore + momentumScore + structureScore;
  const maxScore = 9 + 6 + 4; // max possible
  const confidence = Math.round(Math.abs(totalScore) / maxScore * 100);

  let action = 'NO TRADE';
  let entry = lastBar.c;
  let stopLoss = null;
  let target1 = null;
  let target2 = null;
  let direction = null;

  if (confidence >= 30 && Math.abs(totalScore) >= 3) {
    direction = totalScore > 0 ? 'BUY' : 'SELL';
    
    // Calculate SL and targets using ATR
    const slPoints = config.exit.stop_loss_points || (atr * config.exit.stop_loss_multiplier);
    const t1Points = config.exit.target1_points || (atr * config.exit.target1_multiplier);
    const t2Points = config.exit.target2_points || (atr * config.exit.target2_multiplier);

    if (direction === 'BUY') {
      entry = lastBar.c;
      stopLoss = entry - slPoints;
      target1 = entry + t1Points;
      target2 = entry + t2Points;
    } else {
      entry = lastBar.c;
      stopLoss = entry + slPoints;
      target1 = entry - t1Points;
      target2 = entry - t2Points;
    }

    action = direction;
  }

  const rr = stopLoss && entry ? Math.abs((target2 - entry) / (stopLoss - entry)) : 0;

  analysis.recommendation = {
    action,
    direction,
    entry: Math.round(entry * 100) / 100,
    stop_loss: stopLoss ? Math.round(stopLoss * 100) / 100 : null,
    target1: target1 ? Math.round(target1 * 100) / 100 : null,
    target2: target2 ? Math.round(target2 * 100) / 100 : null,
    risk_reward: Math.round(rr * 100) / 100,
    confidence,
    total_score: totalScore,
  };

  return analysis;
}

/**
 * Format analysis for display
 */
export function formatAnalysis(analysis) {
  if (!analysis) return 'No analysis available.';

  const { recommendation, trend, momentum, structure, price, atr, triggers } = analysis;
  const rec = recommendation;

  let output = '';
  
  // Header
  output += `\n╔══════════════════════════════════════════════════╗\n`;
  output += `║  📊 FULL SCALPING ANALYSIS                      ║\n`;
  output += `║  ${analysis.symbol} @ ${price}  |  ${new Date().toLocaleTimeString()}         ║\n`;
  output += `╚══════════════════════════════════════════════════╝\n\n`;

  // Triggers
  output += `  🔔 TRIGGERS:\n`;
  triggers.forEach(t => output += `     • ${t.type}: ${t.detail}\n`);
  output += `\n`;

  // Indicators
  output += `  📈 INDICATORS:\n`;
  output += `     ATR: ${atr.toFixed(2)}\n`;
  if (trend) {
    output += `     EMA 9: ${trend.ema9 || 'N/A'}\n`;
    output += `     VWAP: ${trend.vwap || 'N/A'}\n`;
    output += `     Supertrend: ${trend.supertrend || 'N/A'} (${trend.supertrend_direction})\n`;
    output += `     UT Bot: ${trend.utbot_signal === 'buy' ? '✅ BUY' : '❌ None'} (Stop: ${trend.utbot_stop || 'N/A'})\n`;
  }
  output += `\n`;

  // Scores
  output += `  📊 SCORES:\n`;
  output += `     Trend: ${trend?.direction || 'N/A'} (${trend?.score || 0})\n`;
  output += `     Momentum: ${momentum?.direction || 'N/A'} (${momentum?.score || 0})\n`;
  output += `     Structure: ${structure?.direction || 'N/A'} (${structure?.score || 0})\n`;
  output += `     Total: ${rec?.total_score || 0} | Confidence: ${rec?.confidence || 0}%\n`;
  output += `\n`;

  // Recommendation
  if (rec && rec.action !== 'NO TRADE') {
    const arrow = rec.direction === 'BUY' ? '🟢' : '🔴';
    output += `  ${arrow} RECOMMENDATION: ${rec.action}\n`;
    output += `  ─────────────────────────────────────────────\n`;
    output += `     Entry:      ${rec.entry}\n`;
    output += `     Stop Loss:  ${rec.stop_loss}\n`;
    output += `     Target 1:   ${rec.target1}\n`;
    output += `     Target 2:   ${rec.target2}\n`;
    output += `     Risk:Reward: 1:${rec.risk_reward}\n`;
    output += `     Confidence: ${rec.confidence}%\n`;
    output += `\n`;
    output += `  💡 Enter trade? Type 'y' to confirm, 'n' to skip\n`;
  } else {
    output += `  ⏸️  NO TRADE — Confidence ${rec?.confidence || 0}% (below threshold)\n`;
    output += `     ${rec?.total_score > 0 ? 'Slight bullish bias, waiting for confirmation' : rec?.total_score < 0 ? 'Slight bearish bias, waiting for confirmation' : 'No clear direction'}\n`;
  }
  output += `\n`;

  return output;
}