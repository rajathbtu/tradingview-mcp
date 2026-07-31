#!/usr/bin/env node

/**
 * Scalping Monitor — Entry Point
 * 
 * Usage: node monitor/run.js
 * 
 * Monitors the TradingView chart in real-time, triggers on conditions,
 * runs full analysis, asks for trade confirmation, and tracks positions.
 */

import { createInterface } from 'node:readline';
import { startMonitoring, stopMonitoring } from './engine.js';
import { analyze, formatAnalysis } from './analyzer.js';
import { enterTrade, updatePosition, getPosition, hasActivePosition, formatPositionStatus, onExit } from './tracker.js';
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
 */
async function onTrigger(state, triggers, cfg) {
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
 * Handle tick event — update position tracking
 */
async function onTick(state, cycleCount) {
  tickCount = cycleCount;

  // Show status every 10 cycles
  if (cycleCount % 10 === 0) {
    const pos = getPosition();
    if (pos) {
      // Create a lightweight state for the tracker
      const trackerState = {
        momentum: lastAnalysis?.momentum || { score: 0 },
        recommendation: lastAnalysis?.recommendation || null,
      };

      const exit = updatePosition(state.lastBar.c, trackerState, config);
      if (exit) {
        lastExit = exit;
        exitHistory.push(exit);
        console.log(`  📊 Trade closed: ${exit.pnl_pct.toFixed(2)}% in ${((exit.exit_time - exit.entry_time) / 1000).toFixed(0)}s`);

        // Continue monitoring after exit
        console.log(`  🔍 Resuming monitor...\n`);
      } else {
        const pos = getPosition();
        if (pos) {
          console.log(formatPositionStatus(pos));
        }
      }
    }
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
  console.log(`     Exit:       Trailing=${config.exit.trailing_stop}, MaxHold=${config.exit.max_hold_seconds}s`);
  console.log(`\n  Press Ctrl+C at any time to stop.\n`);

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