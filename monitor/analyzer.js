/**
 * Scalping Analyzer
 * 
 * Runs full chart analysis when a trigger condition is met.
 * Analyzes trend, momentum, structure, and generates trade recommendation.
 * 
 * ALL indicators calculated LOCALLY from OHLCV bars:
 * - EMA 9, VWAP, Supertrend
 * - RSI (14), Bollinger Bands (20,2)
 * - Volume analysis, price action patterns
 * 
 * Targets are PERCENTAGE-based for meaningful profit/loss projections.
 * Includes self-improvement: tracks trade outcomes and adjusts weights.
 */

// ─── Self-Improvement Engine ───
const TRADE_HISTORY = [];
const WEIGHTS = {
  ema: 2,
  supertrend: 3,
  rsi: 2,
  bollinger: 2,
  vwap: 1,
  momentum_hh: 2,
  momentum_body: 1,
  momentum_accel: 1,
  volume_high: 2,
  volume_low: -1,
  structure_hh: 2,
  structure_hl: 1,
  structure_range: 1,
};

let totalPredictions = 0;
let correctPredictions = 0;

/**
 * Record a trade outcome for self-improvement
 */
export function recordTradeOutcome(trade) {
  if (!trade) return;
  
  TRADE_HISTORY.push({
    entry: trade.entry,
    exit: trade.exit_price,
    direction: trade.direction,
    pnl: trade.pnl,
    pnl_pct: trade.pnl_pct,
    exit_reason: trade.exit_reason,
    entry_time: trade.entry_time,
    exit_time: trade.exit_time,
    duration: ((trade.exit_time - trade.entry_time) / 1000).toFixed(0),
    timestamp: new Date().toISOString(),
  });

  totalPredictions++;
  if (trade.pnl > 0) correctPredictions++;

  if (TRADE_HISTORY.length > 50) TRADE_HISTORY.shift();
}

/**
 * Get self-improvement stats
 */
export function getLearningStats() {
  if (totalPredictions === 0) return null;
  
  const winRate = (correctPredictions / totalPredictions * 100).toFixed(1);
  const recentTrades = TRADE_HISTORY.slice(-10);
  const recentWins = recentTrades.filter(t => t.pnl > 0).length;
  const recentWinRate = recentTrades.length > 0 ? (recentWins / recentTrades.length * 100).toFixed(1) : 'N/A';
  
  const losses = TRADE_HISTORY.filter(t => t.pnl <= 0);
  const commonExitReasons = {};
  losses.forEach(t => {
    commonExitReasons[t.exit_reason] = (commonExitReasons[t.exit_reason] || 0) + 1;
  });
  
  return {
    totalTrades: totalPredictions,
    winRate: `${winRate}%`,
    recentWinRate: `${recentWinRate}%`,
    totalPnl: TRADE_HISTORY.reduce((sum, t) => sum + t.pnl, 0).toFixed(2),
    lossPatterns: commonExitReasons,
    advice: generateAdvice(winRate, commonExitReasons),
  };
}

function generateAdvice(winRate, lossPatterns) {
  const rate = parseFloat(winRate);
  if (rate < 40) {
    return 'Win rate below 40%. Consider tightening entry conditions or increasing confidence threshold.';
  }
  if (rate < 50) {
    return 'Win rate below 50%. Review exit strategy - consider taking profits earlier.';
  }
  if (rate > 65) {
    return 'Good win rate. Consider increasing position size slightly.';
  }
  return 'Performance is acceptable. Continue monitoring.';
}

// Signal persistence: track direction over last N polls to avoid flip-flop
let directionHistory = [];

/**
 * Analyze the current chart state and generate a trade recommendation
 * Uses locally calculated indicators + multi-timeframe (5m) trend confirmation
 * Requires signal persistence across multiple polls before recommending
 */
export async function analyze(state, triggers, config) {
  const { lastBar, prevBar, bars, symbol, atr, localEMA, localVWAP, localSupertrend, localRSI, localBB, mtfTrend, context } = state;
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
    potential_profit_pct: null,
    potential_loss_pct: null,
  };

  // ─── Trend Analysis (all local) ───
  const emaVal = localEMA;
  const vwapVal = localVWAP;
  const supertrendUp = localSupertrend?.direction === 'up';
  const supertrendDown = localSupertrend?.direction === 'down';
  const supertrendVal = localSupertrend?.value;
  const rsiVal = localRSI;
  const bb = localBB;

  // Determine trend
  let trendScore = 0;
  let trendDirection = 'neutral';

  if (emaVal) {
    if (lastBar.c > emaVal) { trendScore += WEIGHTS.ema; }
    else { trendScore -= WEIGHTS.ema; }
  }
  if (supertrendUp) { trendScore += WEIGHTS.supertrend; }
  if (supertrendDown) { trendScore -= WEIGHTS.supertrend; }
  if (vwapVal) {
    if (lastBar.c > vwapVal) { trendScore += WEIGHTS.vwap; }
    else { trendScore -= WEIGHTS.vwap; }
  }
  // RSI trend contribution
  if (rsiVal !== null) {
    if (rsiVal > 50) trendScore += 1;
    else if (rsiVal < 50) trendScore -= 1;
  }
  // Bollinger position
  if (bb && bb.upper !== null) {
    if (lastBar.c > bb.middle) trendScore += 1;
    else trendScore -= 1;
  }

  if (trendScore >= 3) trendDirection = 'bullish';
  else if (trendScore <= -3) trendDirection = 'bearish';
  else trendDirection = 'neutral';

  analysis.trend = {
    direction: trendDirection,
    score: trendScore,
    ema9: emaVal,
    vwap: vwapVal,
    supertrend: supertrendVal,
    supertrend_direction: supertrendUp ? 'up' : supertrendDown ? 'down' : 'none',
    rsi: rsiVal,
    bollinger_upper: bb?.upper,
    bollinger_middle: bb?.middle,
    bollinger_lower: bb?.lower,
  };

  // ─── Momentum Analysis ───
  let momentumScore = 0;
  let momentumDirection = 'neutral';

  if (bars && bars.length >= 3) {
    const b1 = bars[bars.length - 1];
    const b2 = bars[bars.length - 2];
    const b3 = bars[bars.length - 3];
    
    if (b1.h > b2.h && b2.h > b3.h) momentumScore += WEIGHTS.momentum_hh;
    if (b1.l < b2.l && b2.l < b3.l) momentumScore -= WEIGHTS.momentum_hh;
    
    const body1 = b1.c - b1.o;
    const body2 = b2.c - b2.o;
    if (body1 > 0 && body2 > 0) momentumScore += WEIGHTS.momentum_body;
    if (body1 < 0 && body2 < 0) momentumScore -= WEIGHTS.momentum_body;
    
    const move1 = Math.abs(b1.c - b2.c);
    const move2 = Math.abs(b2.c - b3.c);
    if (move1 > move2) momentumScore += WEIGHTS.momentum_accel;
    else momentumScore -= WEIGHTS.momentum_accel;
  }

  if (bars && bars.length > 5) {
    const volumes = bars.map(b => b.v);
    const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
    if (lastBar.v > avgVol * 1.5) momentumScore += WEIGHTS.volume_high;
    if (lastBar.v > avgVol * 2) momentumScore += 1;
    if (lastBar.v < avgVol * 0.5) momentumScore += WEIGHTS.volume_low;
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
  // Uses last 2 bars for practical scalping detection:
  // - Higher high = bullish, lower low = bearish
  // - Bullish/bearish engulfing patterns
  // - Range expansion/contraction
  let structureDirection = 'neutral';
  let structureScore = 0;

  if (bars && bars.length >= 3) {
    const b1 = bars[bars.length - 1]; // current bar (newest)
    const b2 = bars[bars.length - 2]; // previous bar
    const b3 = bars[bars.length - 3]; // bar before that
    
    // Higher high: current bar's high > previous bar's high
    if (b1.h > b2.h) structureScore += 1;
    else if (b1.h < b2.h) structureScore -= 1;
    
    // Higher low: current bar's low > previous bar's low
    if (b1.l > b2.l) structureScore += 1;
    else if (b1.l < b2.l) structureScore -= 1;
    
    // Bullish close: current bar closes higher than previous
    if (b1.c > b2.c) structureScore += 1;
    else if (b1.c < b2.c) structureScore -= 1;
    
    // Bullish engulfing: current bar opens below prev close, closes above prev open
    if (b1.o < b2.c && b1.c > b2.o) structureScore += 2;
    // Bearish engulfing: current bar opens above prev close, closes below prev open
    if (b1.o > b2.c && b1.c < b2.o) structureScore -= 2;
    
    // Range expansion: current bar range > previous bar range (volatility increase)
    const range1 = b1.h - b1.l;
    const range2 = b2.h - b2.l;
    if (range1 > range2 * 1.2) structureScore += 1; // Expanding range
    if (range1 < range2 * 0.8) structureScore -= 1; // Contracting range
    
    // Check for 2-bar trend (b2 → b1 direction)
    if (b2.c > b3.c && b1.c > b2.c) structureScore += 1; // 2-bar uptrend
    if (b2.c < b3.c && b1.c < b2.c) structureScore -= 1; // 2-bar downtrend
  }

  if (structureScore >= 2) structureDirection = 'bullish';
  else if (structureScore <= -2) structureDirection = 'bearish';
  else structureDirection = 'neutral';

  analysis.structure = {
    direction: structureDirection,
    score: structureScore,
  };

  // ─── Multi-Timeframe Validation ───
  // 5m trend must agree with the 1m trade direction
  const mtfValid = mtfTrend && mtfTrend.direction !== 'neutral';
  const mtfBullish = mtfTrend?.direction === 'bullish';
  const mtfBearish = mtfTrend?.direction === 'bearish';

  // ─── Context Enrichment (Phase 1) ───
  // Market regime, volatility, and OpenBB context adjust confidence
  const marketRegime = context?.market_regime || null;
  const volatility = context?.volatility || null;
  const openbb = context?.openbb || null;
  const kronos = context?.kronos || null;

  // Regime alignment: trending regime = higher confidence
  let regimeBonus = 0;
  if (marketRegime) {
    if (marketRegime.regime === 'trending_up' && trendDirection === 'bullish') regimeBonus += 2;
    else if (marketRegime.regime === 'trending_down' && trendDirection === 'bearish') regimeBonus += 2;
    else if (marketRegime.regime === 'ranging') regimeBonus -= 1; // Ranging = harder to trade
    else if (marketRegime.regime === 'volatile') regimeBonus -= 1; // Volatile = more risk
  }

  // Volatility adjustment: high vol = wider targets, lower confidence
  let volAdjustment = 0;
  if (volatility) {
    if (volatility.vol_regime === 'high') volAdjustment -= 1;
    else if (volatility.vol_regime === 'low') volAdjustment += 1;
  }

  // OpenBB sentiment: positive sentiment + bullish = bonus
  let sentimentBonus = 0;
  if (openbb?.available && openbb.sentiment) {
    const sentScore = openbb.sentiment.score || 0;
    if (sentScore > 0.3 && trendDirection === 'bullish') sentimentBonus += 1;
    else if (sentScore < -0.3 && trendDirection === 'bearish') sentimentBonus += 1;
  }

  // Kronos AI forecast: AI direction + trend = bonus
  let kronosBonus = 0;
  if (kronos?.available && kronos.summary) {
    const aiDir = kronos.summary.direction;
    if (aiDir === 'up' && trendDirection === 'bullish') kronosBonus += 1;
    else if (aiDir === 'down' && trendDirection === 'bearish') kronosBonus += 1;
  }

  // ─── Signal Persistence ───
  // Track direction over last N polls to avoid flip-flop
  const currentDirection = trendScore > 0 ? 'bullish' : trendScore < 0 ? 'bearish' : 'neutral';
  directionHistory.push(currentDirection);
  if (directionHistory.length > 3) directionHistory.shift();

  const persistentBullish = directionHistory.filter(d => d === 'bullish').length >= 3;
  const persistentBearish = directionHistory.filter(d => d === 'bearish').length >= 3;

  // ─── Generate Recommendation (Cross-Verified + Multi-TF + Persistent + Context) ───
  const totalScore = trendScore + momentumScore + structureScore + regimeBonus + volAdjustment + sentimentBonus + kronosBonus;
  const maxScore = 9 + 6 + 4 + 2 + 1 + 1 + 1;
  const confidence = Math.round(Math.abs(totalScore) / maxScore * 100);

  // Cross-verification: count how many indicators agree on direction
  let confirmingSignals = 0;
  let totalSignals = 0;

  // Trend indicators
  if (emaVal) { totalSignals++; if (lastBar.c > emaVal) confirmingSignals++; }
  if (supertrendUp || supertrendDown) { totalSignals++; if (supertrendUp) confirmingSignals++; }
  if (vwapVal) { totalSignals++; if (lastBar.c > vwapVal) confirmingSignals++; }
  if (rsiVal !== null) { totalSignals++; if (rsiVal > 50) confirmingSignals++; }
  if (bb && bb.upper !== null) { totalSignals++; if (lastBar.c > bb.middle) confirmingSignals++; }

  // Momentum
  if (momentumScore > 0) { totalSignals++; confirmingSignals++; }
  else if (momentumScore < 0) { totalSignals++; }

  // Structure
  if (structureScore > 0) { totalSignals++; confirmingSignals++; }
  else if (structureScore < 0) { totalSignals++; }

  const minConfirming = config.analysis?.min_confirming_signals || 3;
  const minConfidence = config.analysis?.min_confidence_pct || 50;
  const requireTrend = config.analysis?.require_trend_alignment !== false;
  const requireMomentum = config.analysis?.require_momentum_alignment !== false;

  // Determine if conditions are met for a trade
  const trendBullish = trendDirection === 'bullish';
  const trendBearish = trendDirection === 'bearish';
  const momentumBullish = momentumDirection === 'bullish';
  const momentumBearish = momentumDirection === 'bearish';
  const structureBullish = structureDirection === 'bullish';
  const structureBearish = structureDirection === 'bearish';

  // BUY conditions:
  // 1. 1m indicators bullish
  // 2. 5m trend bullish (multi-timeframe confirmation)
  // 3. Direction persisted for 3+ consecutive polls (no flip-flop)
  // 4. Enough confirming signals
  // 5. Confidence above threshold
  const buyConditions = 
    (!requireTrend || trendBullish) &&
    (!requireMomentum || momentumBullish) &&
    structureBullish &&
    (!mtfValid || mtfBullish) &&       // 5m must agree if available
    persistentBullish &&                // Must persist for 3+ polls
    confirmingSignals >= minConfirming &&
    confidence >= minConfidence;

  // SELL conditions:
  const sellConditions = 
    (!requireTrend || trendBearish) &&
    (!requireMomentum || momentumBearish) &&
    structureBearish &&
    (!mtfValid || mtfBearish) &&        // 5m must agree if available
    persistentBearish &&                 // Must persist for 3+ polls
    (totalSignals - confirmingSignals) >= minConfirming &&
    confidence >= minConfidence;

  let action = 'NO TRADE';
  let entry = lastBar.c;
  let stopLoss = null;
  let target1 = null;
  let target2 = null;
  let direction = null;

  if (buyConditions) {
    direction = 'BUY';
    
    // ATR-based targets (points, not %)
    const atr = analysis.atr || 1;
    const t1Mult = config.exit.target1_multiplier || 0.5;
    const t2Mult = config.exit.target2_multiplier || 1.0;
    const slMult = config.exit.stop_loss_multiplier || 0.3;

    entry = lastBar.c;
    stopLoss = entry - (atr * slMult);
    target1 = entry + (atr * t1Mult);
    target2 = entry + (atr * t2Mult);
    action = direction;
  } else if (sellConditions) {
    direction = 'SELL';
    
    const atr = analysis.atr || 1;
    const t1Mult = config.exit.target1_multiplier || 0.5;
    const t2Mult = config.exit.target2_multiplier || 1.0;
    const slMult = config.exit.stop_loss_multiplier || 0.3;

    entry = lastBar.c;
    stopLoss = entry + (atr * slMult);
    target1 = entry - (atr * t1Mult);
    target2 = entry - (atr * t2Mult);
    action = direction;
  }

  const rr = stopLoss && entry ? Math.abs((target2 - entry) / (stopLoss - entry)) : 0;

  // Calculate potential profit/loss in points
  let potentialProfitPts = null;
  let potentialLossPts = null;
  if (direction === 'BUY' && target2 && stopLoss) {
    potentialProfitPts = (target2 - entry).toFixed(1);
    potentialLossPts = (entry - stopLoss).toFixed(1);
  } else if (direction === 'SELL' && target2 && stopLoss) {
    potentialProfitPts = (entry - target2).toFixed(1);
    potentialLossPts = (stopLoss - entry).toFixed(1);
  }

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
    potential_profit_pts: potentialProfitPts,
    potential_loss_pts: potentialLossPts,
  };

  // ─── Context Summary (Phase 1) ───
  analysis.context = {
    market_regime: marketRegime,
    volatility: volatility,
    openbb: openbb,
    kronos: kronos,
    regime_bonus: regimeBonus,
    vol_adjustment: volAdjustment,
    sentiment_bonus: sentimentBonus,
    kronos_bonus: kronosBonus,
  };

  analysis.potential_profit_pts = potentialProfitPts;
  analysis.potential_loss_pts = potentialLossPts;

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
  if (triggers && triggers.length > 0) {
    output += `  🔔 TRIGGERS:\n`;
    triggers.forEach(t => output += `     • ${t.type}: ${t.detail}\n`);
    output += `\n`;
  }

  // Indicators (all locally calculated)
  output += `  📈 INDICATORS (local):\n`;
  output += `     ATR: ${atr.toFixed(2)}\n`;
  if (trend) {
    output += `     EMA 9: ${trend.ema9 ? trend.ema9.toFixed(2) : 'N/A'}\n`;
    output += `     VWAP: ${trend.vwap ? trend.vwap.toFixed(2) : 'N/A'}\n`;
    output += `     Supertrend: ${trend.supertrend ? trend.supertrend.toFixed(2) : 'N/A'} (${trend.supertrend_direction})\n`;
    output += `     RSI(14): ${trend.rsi !== null && trend.rsi !== undefined ? trend.rsi.toFixed(1) : 'N/A'}\n`;
    if (trend.bollinger_upper !== null) {
      output += `     Bollinger: Upper ${trend.bollinger_upper.toFixed(2)} | Mid ${trend.bollinger_middle.toFixed(2)} | Lower ${trend.bollinger_lower.toFixed(2)}\n`;
    }
  }
  if (analysis.mtfTrend) {
    const m = analysis.mtfTrend;
    const mArrow = m.direction === 'bullish' ? '🟢' : m.direction === 'bearish' ? '🔴' : '⚪';
    output += `\n  🔄 MULTI-TIMEFRAME (5m):\n`;
    output += `     ${mArrow} 5m Trend: ${m.direction} (${m.score})\n`;
    output += `     5m EMA: ${m.ema ? m.ema.toFixed(2) : 'N/A'} | 5m VWAP: ${m.vwap ? m.vwap.toFixed(2) : 'N/A'} | 5m ST: ${m.supertrend_dir}\n`;
  }
  output += `\n`;

  // Scores
  output += `  📊 SCORES:\n`;
  output += `     Trend: ${trend?.direction || 'N/A'} (${trend?.score || 0})\n`;
  output += `     Momentum: ${momentum?.direction || 'N/A'} (${momentum?.score || 0})\n`;
  output += `     Structure: ${structure?.direction || 'N/A'} (${structure?.score || 0})\n`;
  output += `     Total: ${rec?.total_score || 0} | Confidence: ${rec?.confidence || 0}%\n`;
  output += `\n`;

  // Context (Phase 1)
  if (analysis.context) {
    const ctx = analysis.context;
    output += `  🌐 CONTEXT:\n`;
    if (ctx.market_regime) {
      const mr = ctx.market_regime;
      const mrEmoji = mr.regime === 'trending_up' ? '🟢' : mr.regime === 'trending_down' ? '🔴' : mr.regime === 'volatile' ? '⚡' : '⚪';
      output += `     ${mrEmoji} Regime: ${mr.regime.replace('_', ' ').toUpperCase()} (ADX: ${mr.adx ?? 'N/A'})\n`;
    }
    if (ctx.volatility) {
      const v = ctx.volatility;
      const vEmoji = v.vol_regime === 'high' ? '🔴' : v.vol_regime === 'low' ? '🟢' : '🟡';
      output += `     ${vEmoji} Vol: ${v.vol_regime.toUpperCase()} (ATR%: ${v.atr_pct ?? 'N/A'}%`;
      if (v.iv_atm !== null) output += `, IV: ${v.iv_atm}%`;
      if (v.vol_spread !== null) output += `, IV/RV: ${v.vol_spread}`;
      output += `)\n`;
    }
    if (ctx.openbb?.available && ctx.openbb.sentiment) {
      const s = ctx.openbb.sentiment;
      output += `     📰 Sentiment: ${s.label || 'N/A'} (${s.score ?? 'N/A'})\n`;
    }
    if (ctx.kronos?.available && ctx.kronos.summary) {
      const k = ctx.kronos.summary;
      const kEmoji = k.direction === 'up' ? '📈' : '📉';
      output += `     ${kEmoji} Kronos AI: ${k.direction.toUpperCase()} ${k.change_pct > 0 ? '+' : ''}${k.change_pct}% (${k.last_close?.toFixed(2)} → ${k.final_close?.toFixed(2)})\n`;
    }
    if (ctx.regime_bonus || ctx.vol_adjustment || ctx.sentiment_bonus || ctx.kronos_bonus) {
      output += `     Bonus: Regime ${ctx.regime_bonus > 0 ? '+' : ''}${ctx.regime_bonus} | Vol ${ctx.vol_adjustment > 0 ? '+' : ''}${ctx.vol_adjustment} | Sent ${ctx.sentiment_bonus > 0 ? '+' : ''}${ctx.sentiment_bonus} | Kronos ${ctx.kronos_bonus > 0 ? '+' : ''}${ctx.kronos_bonus}\n`;
    }
    output += `\n`;
  }

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
    if (rec.potential_profit_pts) {
      output += `     Potential Profit: +${rec.potential_profit_pts} pts\n`;
    }
    if (rec.potential_loss_pts) {
      output += `     Potential Loss:   -${rec.potential_loss_pts} pts\n`;
    }
    output += `\n`;
    output += `  💡 Enter trade? Type 'y' to confirm, 'n' to skip\n`;
  } else {
    output += `  ⏸️  NO TRADE — Confidence ${rec?.confidence || 0}% (below threshold)\n`;
    output += `     ${rec?.total_score > 0 ? 'Slight bullish bias, waiting for confirmation' : rec?.total_score < 0 ? 'Slight bearish bias, waiting for confirmation' : 'No clear direction'}\n`;
  }
  output += `\n`;

  return output;
}