#!/usr/bin/env node

/**
 * Scalping Monitor — Entry Point
 * 
 * Usage: node monitor/run.js
 * 
 * Monitors the TradingView chart in real-time, triggers on conditions,
 * runs full analysis, asks for trade confirmation, and tracks positions.
 * 
 * Positions NEVER auto-exit — user must confirm all exits.
 * Real-time dashboard updates every tick during active positions.
 */

import { createInterface } from 'node:readline';
import { startMonitoring, stopMonitoring } from './engine.js';
import { analyze, formatAnalysis } from './analyzer.js';
import { enterTrade, updatePosition, confirmExit, getPosition, hasActivePosition, formatPositionStatus, onExit } from './tracker.js';
import { recordTradeOutcome, getLearningStats } from './analyzer.js';
import config from './config.js';

// Readline interface for user input
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

let lastAnalysis = null;
let lastExit = null;
let exitHistory = [];
let tickCount = 0;
let pendingExitSignal = null;
let lastExitPromptTime = 0;
const EXIT_PROMPT_COOLDOWN = 10000; // Don't re-prompt for same exit within 10s

/**
 * Ask user for trade confirmation
 */
function askTradeConfirmation(analysis) {
  return new Promise((resolve) => {
    console.log(formatAnalysis(analysis));
    rl.question('  Enter trade? (y/n/s to skip): ', (answer) => {
      const a = answer.toLowerCase().trim();
      if (a === 'y' || a === 'yes') {
        const result = enterTrade(analysis);
        if (result.success) {
          resolve(true);
        } else {
          console.log(`  ❌ ${result.error}`);
          resolve(false);
        }
      } else if (a === 'n' || a === 'no' || a === 's' || a === 'skip') {
        console.log('  ⏭️  Trade skipped.\n');
        resolve(false);
      } else {
        console.log('  ⏭️  Invalid input. Trade skipped.\n');
        resolve(false);
      }
    });
  });
}

/**
 * Handle trigger event — run analysis and ask for trade
 * SKIPS if already in an active position to prevent auto-closing
 */
async function onTrigger(state, triggers, cfg) {
  // NEVER enter a new trade if already in one
  if (hasActivePosition()) {
    console.log(`  ⏸️  Already in a position. Ignoring new trigger signals.\n`);
    return;
  }

  console.log(`  ⏳ Running analysis...`);

  const analysis = await analyze(state, triggers, cfg);
  lastAnalysis = analysis;

  if (!analysis) {
    console.log('  ❌ Analysis failed.\n');
    return;
  }

  // Display analysis
  const formatted = formatAnalysis(analysis);
  console.log(formatted);

  // If recommendation is a trade, ask for confirmation
  if (analysis.recommendation && analysis.recommendation.action !== 'NO TRADE') {
    await askTradeConfirmation(analysis);
  } else {
    console.log('  ⏸️  No actionable trade. Waiting for next trigger...\n');
  }
}

/**
 * Handle tick event — update position tracking and show real-time dashboard
 */
async function onTick(state, cycleCount) {
  tickCount = cycleCount;

  const pos = getPosition();
  if (!pos) return;

  // Run fresh analysis on every tick when a position is active
  let currentAnalysis = null;
  try {
    currentAnalysis = await analyze(state, [], config);
    lastAnalysis = currentAnalysis;
  } catch(e) {
    currentAnalysis = lastAnalysis;
  }

  const trackerState = {
    momentum: currentAnalysis?.momentum || { score: 0 },
    recommendation: currentAnalysis?.recommendation || null,
  };

  // Check for exit signals (does NOT auto-exit)
  const exitSignal = updatePosition(state.lastBar.c, trackerState, config);

  // ─── Show real-time dashboard every tick ───
  console.log(formatPositionStatus(pos, currentAnalysis));

  // ─── Handle exit signals (non-blocking) ───
  if (exitSignal) {
    const now = Date.now();
    const isNewSignal = !pendingExitSignal || 
      pendingExitSignal.reason !== exitSignal.reason || 
      (now - lastExitPromptTime) > EXIT_PROMPT_COOLDOWN;

    if (isNewSignal) {
      pendingExitSignal = exitSignal;
      lastExitPromptTime = now;

      console.log(`\n╔══════════════════════════════════════════════════╗`);
      console.log(`║  🚨 EXIT SIGNAL                                 ║`);
      console.log(`╚══════════════════════════════════════════════════╝`);
      console.log(`  Reason:     ${exitSignal.reason}`);
      console.log(`  Message:    ${exitSignal.message}`);
      console.log(`  Price:      ${exitSignal.price?.toFixed(2) || exitSignal.price}`);
      console.log(`  P&L:        ${pos.pnl >= 0 ? '✅' : '❌'} ${pos.pnl.toFixed(2)} (${pos.pnl_pct.toFixed(2)}%)`);
      console.log(`──────────────────────────────────────────────────`);
      console.log(`  Type 'exit' and press Enter to close the trade.`);
      console.log(`  Type 'hold' to stay and continue monitoring.\n`);
    }
  } else {
    pendingExitSignal = null;
  }
}

// ─── Main ───
async function main() {
  console.clear();
  console.log(`\n`);
  console.log(`  ███████╗ ██████╗ █████╗ ██╗     ██████╗ ██╗███╗   ██╗ ██████╗ `);
  console.log(`  ██╔════╝██╔════╝██╔══██╗██║     ██╔══██╗██║████╗  ██║██╔════╝ `);
  console.log(`  ███████╗██║     ███████║██║     ██████╔╝██║██╔██╗ ██║██║  ███╗`);
  console.log(`  ╚════██║██║     ██╔══██║██║     ██╔═══╝ ██║██║╚██╗██║██║   ██║`);
  console.log(`  ███████║╚██████╗██║  ██║███████╗██║     ██║██║ ╚████║╚██████╔╝`);
  console.log(`  ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝ ╚═════╝ `);
  console.log(`  ════════════════════════════════════════════════════════════════`);
  console.log(`  REAL-TIME SCALPING MONITOR v1.0`);
  console.log(`  ════════════════════════════════════════════════════════════════\n`);

  // Show configuration
  console.log(`  📋 Configuration:`);
  console.log(`     Symbol:     ${config.symbol}`);
  console.log(`     Timeframe:  ${config.timeframe}`);
  console.log(`     Poll rate:  ${config.poll_interval_ms}ms`);
  console.log(`     Conditions: ${Object.entries(config.conditions).filter(([,v]) => v).length} active`);
  console.log(`     Exit:       Manual confirmation required, Trailing=${config.exit.trailing_stop}, MaxHold=${config.exit.max_hold_seconds}s`);
  console.log(`\n  Press Ctrl+C at any time to stop.\n`);

  // Set up non-blocking stdin listener for exit commands during active positions
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    const input = chunk.toString().trim().toLowerCase();
    
    if (input === 'exit' || input === 'e') {
      const pos = getPosition();
      if (pos && pendingExitSignal) {
        const result = confirmExit(pendingExitSignal.price, pendingExitSignal.reason, {});
        if (result) {
          lastExit = result;
          exitHistory.push(result);
          recordTradeOutcome(result);
          console.log(`\n  📊 Trade closed: ${result.pnl_pct.toFixed(2)}% in ${((result.exit_time - result.entry_time) / 1000).toFixed(0)}s`);
          console.log(`  🔍 Resuming monitor...\n`);
          pendingExitSignal = null;
        }
      } else if (pos && !pendingExitSignal) {
        // Force exit at current price even without signal
        const currentPrice = pos.current_price || pos.entry;
        const result = confirmExit(currentPrice, 'manual_exit', {});
        if (result) {
          lastExit = result;
          exitHistory.push(result);
          recordTradeOutcome(result);
          console.log(`\n  📊 Trade closed: ${result.pnl_pct.toFixed(2)}% in ${((result.exit_time - result.entry_time) / 1000).toFixed(0)}s`);
          console.log(`  🔍 Resuming monitor...\n`);
        }
      }
    } else if (input === 'hold' || input === 'h') {
      if (pendingExitSignal) {
        console.log(`  ⏭️  Staying in position. Continuing monitoring...\n`);
        pendingExitSignal = null;
      }
    }
  });

  // Start the monitor
  await startMonitoring(config, onTrigger, onTick);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n  ⏹️  Stopping monitor...`);
  
  const pos = getPosition();
  if (pos) {
    console.log(`  📊 Active position at entry ${pos.entry} will be lost on restart.`);
  }

  await stopMonitoring();
  
  // Print session summary
  if (exitHistory.length > 0) {
    console.log(`\n  ─── Session Summary ───`);
    const wins = exitHistory.filter(e => e.pnl > 0).length;
    const losses = exitHistory.filter(e => e.pnl <= 0).length;
    const totalPnl = exitHistory.reduce((sum, e) => sum + e.pnl, 0);
    const avgPnl = exitHistory.length > 0 ? totalPnl / exitHistory.length : 0;
    
    console.log(`  Trades: ${exitHistory.length} (W: ${wins} | L: ${losses})`);
    console.log(`  Win Rate: ${exitHistory.length > 0 ? Math.round(wins / exitHistory.length * 100) : 0}%`);
    console.log(`  Total P&L: ${totalPnl >= 0 ? '✅' : '❌'} ${totalPnl.toFixed(2)}`);

    exitHistory.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.symbol} ${e.direction} | Entry: ${e.entry} | Exit: ${e.exit_price} | P&L: ${e.pnl_pct.toFixed(2)}% | ${e.exit_reason}`);
    });
  }

  rl.close();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error(`\n  ❌ Unhandled error: ${err.message}`);
});

main().catch(err => {
  console.error(`\n  ❌ Fatal error: ${err.message}`);
  rl.close();
  process.exit(1);
});