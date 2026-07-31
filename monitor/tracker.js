/**
 * Position Tracker
 * 
 * After a trade is entered, monitors the position in real-time
 * and provides exit signals based on targets, stop loss, trailing stop,
 * time limits, and reversal conditions.
 */

let position = null;
let trailingStop = null;
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
  trailingStop = null;

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
 * Update position with current price and check exit conditions
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

  // ─── Check Exit Conditions ───

  // 1. Stop Loss hit
  if (position.direction === 'BUY' && currentPrice <= position.stop_loss) {
    return exitTrade(currentPrice, 'stop_loss', state);
  }
  if (position.direction === 'SELL' && currentPrice >= position.stop_loss) {
    return exitTrade(currentPrice, 'stop_loss', state);
  }

  // 2. Target 2 hit
  if (position.direction === 'BUY' && currentPrice >= position.target2) {
    return exitTrade(currentPrice, 'target2', state);
  }
  if (position.direction === 'SELL' && currentPrice <= position.target2) {
    return exitTrade(currentPrice, 'target2', state);
  }

  // 3. Target 1 hit (partial or full)
  if (position.direction === 'BUY' && currentPrice >= position.target1) {
    // Could exit partial here, but for scalping we exit full at T1 if momentum fades
    if (state.momentum?.score < 0) {
      return exitTrade(currentPrice, 'target1_no_momentum', state);
    }
  }
  if (position.direction === 'SELL' && currentPrice <= position.target1) {
    if (state.momentum?.score > 0) {
      return exitTrade(currentPrice, 'target1_no_momentum', state);
    }
  }

  // 4. Trailing Stop
  if (exitConfig.trailing_stop) {
    const atr = position.atr || 1;
    const activationDist = exitConfig.trailing_activation * atr;
    const trailDist = exitConfig.trailing_distance * atr;

    if (!trailingStop) {
      // Check if profit is enough to activate trailing
      if (position.pnl >= activationDist) {
        trailingStop = true;
        if (position.direction === 'BUY') {
          trailingStop = currentPrice - trailDist;
        } else {
          trailingStop = currentPrice + trailDist;
        }
      }
    } else {
      // Update trailing stop
      if (position.direction === 'BUY') {
        const newStop = currentPrice - trailDist;
        if (newStop > trailingStop) trailingStop = newStop;
        if (currentPrice <= trailingStop) {
          return exitTrade(currentPrice, 'trailing_stop', state);
        }
      } else {
        const newStop = currentPrice + trailDist;
        if (newStop < trailingStop) trailingStop = newStop;
        if (currentPrice >= trailingStop) {
          return exitTrade(currentPrice, 'trailing_stop', state);
        }
      }
    }
  }

  // 5. Time-based exit
  if (elapsed >= exitConfig.max_hold_seconds) {
    return exitTrade(currentPrice, 'time_limit', state);
  }

  // 6. Reversal exit
  if (exitConfig.exit_on_reversal && state.recommendation) {
    const rec = state.recommendation;
    if (position.direction === 'BUY' && rec.action === 'SELL') {
      return exitTrade(currentPrice, 'reversal', state);
    }
    if (position.direction === 'SELL' && rec.action === 'BUY') {
      return exitTrade(currentPrice, 'reversal', state);
    }
  }

  return null;
}

/**
 * Exit the trade
 */
function exitTrade(exitPrice, reason, state) {
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
  trailingStop = null;
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
 * Format position status for display
 */
export function formatPositionStatus(pos) {
  if (!pos) return 'No active position.';

  const elapsed = ((Date.now() - pos.entry_time) / 1000).toFixed(0);
  const pnlEmoji = pos.pnl >= 0 ? '✅' : '❌';
  const directionEmoji = pos.direction === 'BUY' ? '🟢' : '🔴';

  let output = `\n  ${directionEmoji} ACTIVE: ${pos.symbol} ${pos.direction} @ ${pos.entry}\n`;
  output += `  Current: ${pos.current_price || '?'} | P&L: ${pnlEmoji} ${pos.pnl.toFixed(2)} (${pos.pnl_pct.toFixed(2)}%)\n`;
  output += `  SL: ${pos.stop_loss} | T1: ${pos.target1} | T2: ${pos.target2}\n`;
  output += `  Duration: ${elapsed}s`;

  if (trailingStop) {
    output += ` | Trail: ${typeof trailingStop === 'number' ? trailingStop.toFixed(2) : 'active'}`;
  }

  return output;
}