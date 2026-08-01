/**
 * Position Tracker
 * 
 * After a trade is entered, monitors the position in real-time
 * and provides exit signals based on targets, stop loss, trailing stop,
 * time limits, and reversal conditions.
 * 
 * NEVER auto-exits — always returns exit signals for user confirmation.
 */

let position = null;
let trailingStopPrice = null;
let highestPrice = null;
let lowestPrice = null;
let entryTime = null;
let exitCallbacks = [];

/**
 * Enter a trade position
 */
export function enterTrade(analysis) {
  const rec = analysis.recommendation;
  if (!rec || rec.action === 'NO TRADE') {
    return { success: false, error: 'No valid trade recommendation' };
  }

  position = {
    symbol: analysis.symbol,
    direction: rec.direction,
    entry: rec.entry,
    stop_loss: rec.stop_loss,
    target1: rec.target1,
    target2: rec.target2,
    entry_time: Date.now(),
    atr: analysis.atr,
    status: 'active',
    pnl: 0,
    pnl_pct: 0,
    current_price: rec.entry,
    highest_price: rec.entry,
    lowest_price: rec.entry,
    trailing_stop: null,
    trailing_activated: false,
    exit_reason: null,
    exit_price: null,
    exit_time: null,
  };

  entryTime = Date.now();
  highestPrice = rec.entry;
  lowestPrice = rec.entry;
  trailingStopPrice = null;

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  🎯 TRADE ENTERED                               ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`  Symbol:     ${position.symbol}`);
  console.log(`  Direction:  ${position.direction === 'BUY' ? '🟢 LONG' : '🔴 SHORT'}`);
  console.log(`  Entry:      ${position.entry}`);
  console.log(`  Stop Loss:  ${position.stop_loss}`);
  console.log(`  Target 1:   ${position.target1}`);
  console.log(`  Target 2:   ${position.target2}`);
  console.log(`  Time:       ${new Date().toLocaleTimeString()}`);
  console.log(`──────────────────────────────────────────────────\n`);

  return { success: true, position };
}

/**
 * Update position with current price and check exit conditions.
 * Returns an exit signal object if an exit condition is met, but does NOT auto-exit.
 * The caller must call confirmExit() to actually close the trade.
 */
export function updatePosition(currentPrice, state, config) {
  if (!position || position.status !== 'active') return null;

  const now = Date.now();
  const elapsed = (now - entryTime) / 1000;
  const exitConfig = config.exit;

  // Update highest/lowest
  if (position.direction === 'BUY') {
    if (currentPrice > highestPrice) highestPrice = currentPrice;
    if (currentPrice < lowestPrice) lowestPrice = currentPrice;
  } else {
    if (currentPrice < lowestPrice) lowestPrice = currentPrice;
    if (currentPrice > highestPrice) highestPrice = currentPrice;
  }

  // Calculate P&L
  if (position.direction === 'BUY') {
    position.pnl = currentPrice - position.entry;
    position.pnl_pct = ((currentPrice - position.entry) / position.entry) * 100;
  } else {
    position.pnl = position.entry - currentPrice;
    position.pnl_pct = ((position.entry - currentPrice) / position.entry) * 100;
  }

  position.current_price = currentPrice;
  position.highest_price = highestPrice;
  position.lowest_price = lowestPrice;

  // ─── Check Exit Conditions (return signal, do NOT auto-exit) ───

  // 1. Stop Loss hit
  if (position.direction === 'BUY' && currentPrice <= position.stop_loss) {
    return { reason: 'stop_loss', price: currentPrice, message: `Stop loss hit at ${currentPrice}` };
  }
  if (position.direction === 'SELL' && currentPrice >= position.stop_loss) {
    return { reason: 'stop_loss', price: currentPrice, message: `Stop loss hit at ${currentPrice}` };
  }

  // 2. Target 2 hit
  if (position.direction === 'BUY' && currentPrice >= position.target2) {
    return { reason: 'target2', price: currentPrice, message: `Target 2 reached at ${currentPrice}` };
  }
  if (position.direction === 'SELL' && currentPrice <= position.target2) {
    return { reason: 'target2', price: currentPrice, message: `Target 2 reached at ${currentPrice}` };
  }

  // 3. Target 1 hit — signal if momentum fades
  if (position.direction === 'BUY' && currentPrice >= position.target1) {
    if (state.momentum?.score < 0) {
      return { reason: 'target1_no_momentum', price: currentPrice, message: `Target 1 reached at ${currentPrice} but momentum fading` };
    }
  }
  if (position.direction === 'SELL' && currentPrice <= position.target1) {
    if (state.momentum?.score > 0) {
      return { reason: 'target1_no_momentum', price: currentPrice, message: `Target 1 reached at ${currentPrice} but momentum fading` };
    }
  }

  // 4. Trailing Stop (percentage-based)
  if (exitConfig.trailing_stop) {
    const activationPct = (exitConfig.trailing_activation_pct || 0.3) / 100;
    const trailPct = (exitConfig.trailing_distance_pct || 0.15) / 100;

    if (!trailingStopPrice) {
      // Check if profit % is enough to activate trailing
      const pnlPct = Math.abs(position.pnl_pct) / 100;
      if (pnlPct >= activationPct) {
        if (position.direction === 'BUY') {
          trailingStopPrice = currentPrice * (1 - trailPct);
        } else {
          trailingStopPrice = currentPrice * (1 + trailPct);
        }
        position.trailing_activated = true;
      }
    } else {
      // Update trailing stop
      if (position.direction === 'BUY') {
        const newStop = currentPrice * (1 - trailPct);
        if (newStop > trailingStopPrice) trailingStopPrice = newStop;
        if (currentPrice <= trailingStopPrice) {
          return { reason: 'trailing_stop', price: currentPrice, message: `Trailing stop hit at ${currentPrice}` };
        }
      } else {
        const newStop = currentPrice * (1 + trailPct);
        if (newStop < trailingStopPrice) trailingStopPrice = newStop;
        if (currentPrice >= trailingStopPrice) {
          return { reason: 'trailing_stop', price: currentPrice, message: `Trailing stop hit at ${currentPrice}` };
        }
      }
    }
    position.trailing_stop = trailingStopPrice;
  }

  // 5. Time-based exit
  if (elapsed >= exitConfig.max_hold_seconds) {
    return { reason: 'time_limit', price: currentPrice, message: `Max hold time (${exitConfig.max_hold_seconds}s) reached` };
  }

  // 6. Reversal exit
  if (exitConfig.exit_on_reversal && state.recommendation) {
    const rec = state.recommendation;
    if (position.direction === 'BUY' && rec.action === 'SELL') {
      return { reason: 'reversal', price: currentPrice, message: `Reversal signal: recommendation changed to SELL` };
    }
    if (position.direction === 'SELL' && rec.action === 'BUY') {
      return { reason: 'reversal', price: currentPrice, message: `Reversal signal: recommendation changed to BUY` };
    }
  }

  return null;
}

/**
 * Confirm exit — actually closes the trade.
 * Called when user approves an exit signal.
 */
export function confirmExit(exitPrice, reason, state) {
  if (!position || position.status !== 'active') return null;

  position.status = 'exited';
  position.exit_price = exitPrice;
  position.exit_time = Date.now();
  position.exit_reason = reason;

  // Final P&L
  if (position.direction === 'BUY') {
    position.pnl = exitPrice - position.entry;
    position.pnl_pct = ((exitPrice - position.entry) / position.entry) * 100;
  } else {
    position.pnl = position.entry - exitPrice;
    position.pnl_pct = ((position.entry - exitPrice) / position.entry) * 100;
  }

  const elapsed = ((position.exit_time - position.entry_time) / 1000).toFixed(0);

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  🏁 TRADE EXITED                               ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`  Symbol:     ${position.symbol}`);
  console.log(`  Direction:  ${position.direction === 'BUY' ? '🟢 LONG' : '🔴 SHORT'}`);
  console.log(`  Entry:      ${position.entry}`);
  console.log(`  Exit:       ${exitPrice}`);
  console.log(`  P&L:        ${position.pnl >= 0 ? '✅' : '❌'} ${position.pnl.toFixed(2)} (${position.pnl_pct.toFixed(2)}%)`);
  console.log(`  Reason:     ${reason}`);
  console.log(`  Duration:   ${elapsed}s`);
  console.log(`──────────────────────────────────────────────────\n`);

  // Fire exit callbacks
  exitCallbacks.forEach(cb => cb(position));

  const result = { ...position };
  position = null;
  trailingStopPrice = null;
  highestPrice = null;
  lowestPrice = null;
  entryTime = null;

  return result;
}

/**
 * Get current position status
 */
export function getPosition() {
  return position;
}

/**
 * Check if there's an active position
 */
export function hasActivePosition() {
  return position && position.status === 'active';
}

/**
 * Register exit callback
 */
export function onExit(callback) {
  exitCallbacks.push(callback);
}

/**
 * Format position status for display — rich real-time dashboard
 */
export function formatPositionStatus(pos, analysis) {
  if (!pos) return 'No active position.';

  const elapsed = ((Date.now() - pos.entry_time) / 1000).toFixed(0);
  const pnlEmoji = pos.pnl >= 0 ? '✅' : '❌';
  const directionEmoji = pos.direction === 'BUY' ? '🟢' : '🔴';
  const rec = analysis?.recommendation;

  let output = `\n╔══════════════════════════════════════════════════╗\n`;
  output += `║  ${directionEmoji} ACTIVE POSITION MONITOR                        ║\n`;
  output += `╚══════════════════════════════════════════════════╝\n`;
  output += `  Symbol:     ${pos.symbol}\n`;
  output += `  Direction:  ${pos.direction === 'BUY' ? '🟢 LONG' : '🔴 SHORT'}\n`;
  output += `  Entry:      ${pos.entry}\n`;
  output += `  Current:    ${pos.current_price?.toFixed(2) || '?'}\n`;
  output += `  P&L:        ${pnlEmoji} ${pos.pnl.toFixed(2)} (${pos.pnl_pct.toFixed(2)}%)\n`;
  output += `  Duration:   ${elapsed}s\n`;
  output += `\n`;

  // Targets
  output += `  ─── Levels ───\n`;
  output += `  Stop Loss:  ${pos.stop_loss?.toFixed(2) || 'N/A'}\n`;
  output += `  Target 1:   ${pos.target1?.toFixed(2) || 'N/A'}\n`;
  output += `  Target 2:   ${pos.target2?.toFixed(2) || 'N/A'}\n`;
  if (trailingStopPrice) {
    output += `  Trail Stop: ${trailingStopPrice.toFixed(2)}\n`;
  }
  output += `\n`;

  // Real-time analysis
  if (analysis) {
    output += `  ─── Real-Time Analysis ───\n`;
    output += `  Trend:      ${analysis.trend?.direction || 'N/A'} (${analysis.trend?.score || 0})\n`;
    output += `  Momentum:   ${analysis.momentum?.direction || 'N/A'} (${analysis.momentum?.score || 0})\n`;
    output += `  Structure:  ${analysis.structure?.direction || 'N/A'} (${analysis.structure?.score || 0})\n`;
    output += `  Confidence: ${rec?.confidence || 0}%\n`;
    output += `\n`;

    if (rec && rec.action !== 'NO TRADE') {
      const arrow = rec.direction === 'BUY' ? '🟢' : '🔴';
      output += `  ${arrow} RECOMMENDATION: ${rec.action}\n`;
      output += `     Entry:      ${rec.entry}\n`;
      output += `     Stop Loss:  ${rec.stop_loss}\n`;
      output += `     Target 1:   ${rec.target1}\n`;
      output += `     Target 2:   ${rec.target2}\n`;
      output += `     Risk:Reward: 1:${rec.risk_reward}\n`;
      output += `     Confidence: ${rec.confidence}%\n`;
    } else {
      output += `  ⏸️  Recommendation: HOLD / NO TRADE\n`;
      // Bias interpretation depends on position direction
      if (pos.direction === 'BUY') {
        output += `     ${rec?.total_score > 0 ? 'Bullish bias ✅ — favorable for LONG' : rec?.total_score < 0 ? 'Bearish bias ⚠️ — consider exit' : 'No clear direction'}\n`;
      } else {
        // SHORT position: bearish bias is favorable, bullish bias is warning
        output += `     ${rec?.total_score < 0 ? 'Bearish bias ✅ — favorable for SHORT' : rec?.total_score > 0 ? 'Bullish bias ⚠️ — consider exit' : 'No clear direction'}\n`;
      }
    }
  }

  return output;
}