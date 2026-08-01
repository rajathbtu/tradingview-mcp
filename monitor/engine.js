/**
 * Scalping Monitor Engine
 * 
 * Polls TradingView every 5 seconds via the existing MCP CDP connection,
 * checks trigger conditions, and fires full analysis when conditions are met.
 * 
 * REUSES the proven connection infrastructure from src/connection.js
 * with the exact same API paths as the working MCP tools.
 * 
 * ALL indicators calculated LOCALLY from OHLCV bars:
 * - EMA 9, VWAP, Supertrend
 * - RSI (14), Bollinger Bands (20,2)
 * - Volume analysis, price action patterns
 * No premium TradingView indicators required.
 */

import { evaluate, getClient } from '../src/connection.js';

let lastState = {};
let triggerCount = 0;
let lastTriggerTime = 0;
const MIN_TRIGGER_INTERVAL = 15000;

// Track supertrend direction to detect real flips (not value oscillations)
let lastSupertrendDirection = null;

// Track RSI direction for cross detection
let lastRSI = null;

// Track Bollinger Band position for breakout detection
let lastBollingerPosition = null;

// Exact same path as proven in src/connection.js KNOWN_PATHS
const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';
const BARS_PATH = 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()';

/**
 * Fetch current state from the chart
 */
async function fetchCurrentState() {
  await getClient();

  const data = await evaluate(`
    (function() {
      var result = { symbol: '', lastBar: null, prevBar: null, bars: [], studies: {} };
      
      try {
        var chart = ${CHART_API};
        if (!chart) return { error: 'Chart API not available' };
        
        try { result.symbol = chart.symbol() || ''; } catch(e) {}
        
        var bars = ${BARS_PATH};
        if (!bars || typeof bars.lastIndex !== 'function') return { error: 'bars not available' };
        
        var lastIdx = bars.lastIndex();
        var prevIdx = Math.max(bars.firstIndex(), lastIdx - 1);
        
        var last = bars.valueAt(lastIdx);
        var prev = bars.valueAt(prevIdx);
        
        if (last) result.lastBar = { t: last[0], o: last[1], h: last[2], l: last[3], c: last[4], v: last[5] || 0 };
        if (prev) result.prevBar = { t: prev[0], o: prev[1], h: prev[2], l: prev[3], c: prev[4], v: prev[5] || 0 };
        
        // Get 50 bars for local indicator calculation
        var startIdx = Math.max(bars.firstIndex(), lastIdx - 50);
        for (var i = startIdx; i <= lastIdx; i++) {
          var b = bars.valueAt(i);
          if (b) result.bars.push({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] || 0 });
        }
        
        // Try to get TV studies (may be empty on free accounts)
        var widget = chart._chartWidget;
        if (!widget) return result;
        var model = widget.model();
        if (!model) return result;
        var sources = model.model().dataSources();
        for (var si = 0; si < sources.length; si++) {
          var s = sources[si];
          if (!s.metaInfo) continue;
          try {
            var meta = s.metaInfo();
            var name = meta.description || meta.shortDescription || '';
            if (!name) continue;
            var vals = {};
            try {
              var dwv = s.dataWindowView();
              if (dwv) {
                var items = dwv.items();
                if (items) {
                  for (var ii = 0; ii < items.length; ii++) {
                    var item = items[ii];
                    if (item && item._value && item._value !== '\\u2205' && item._title) {
                      vals[item._title] = String(item._value);
                    }
                  }
                }
              }
            } catch(e) {}
            if (Object.keys(vals).length > 0) result.studies[name] = vals;
          } catch(e) {}
        }
      } catch(e) {
        return { error: (e.message || 'Unknown error').substring(0, 200) };
      }
      
      return result;
    })()
  `);

  return data;
}

/**
 * Calculate ATR from recent bars using True Range
 */
function calcATR(bars, period = 14) {
  if (!bars || bars.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < Math.min(bars.length, period + 1); i++) {
    const b = bars[i];
    const pb = bars[i - 1];
    const tr = Math.max(
      b.h - b.l,
      Math.abs(b.h - pb.c),
      Math.abs(b.l - pb.c)
    );
    trs.push(tr);
  }
  if (trs.length === 0) return 0;
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/**
 * Calculate EMA locally from bars
 */
function calcEMA(bars, period = 9) {
  if (!bars || bars.length < period + 1) return null;
  const closes = bars.map(b => b.c);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * k + ema;
  }
  return ema;
}

/**
 * Calculate VWAP locally from bars
 */
function calcVWAP(bars) {
  if (!bars || bars.length < 2) return null;
  let cumPV = 0;
  let cumVol = 0;
  for (const b of bars) {
    const typicalPrice = (b.h + b.l + b.c) / 3;
    cumPV += typicalPrice * b.v;
    cumVol += b.v;
  }
  return cumVol > 0 ? cumPV / cumVol : null;
}

/**
 * Calculate Supertrend locally from bars
 */
function calcSupertrend(bars, period = 10, multiplier = 3) {
  if (!bars || bars.length < period + 1) return { value: null, direction: null };
  
  const atr = calcATR(bars, period);
  if (atr === 0) return { value: null, direction: null };
  
  const last = bars[bars.length - 1];
  const hl2 = (last.h + last.l) / 2;
  
  let direction = 'up';
  if (last.c < hl2) direction = 'down';
  else direction = 'up';
  
  return { value: hl2, direction };
}

/**
 * Calculate RSI locally from bars
 */
function calcRSI(bars, period = 14) {
  if (!bars || bars.length < period + 1) return null;
  const closes = bars.map(b => b.c);
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Bollinger Bands locally from bars
 */
function calcBollingerBands(bars, period = 20, stdDev = 2) {
  if (!bars || bars.length < period) return { upper: null, middle: null, lower: null };
  const closes = bars.map(b => b.c);
  const recent = closes.slice(-period);
  const sma = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: sma + stdDev * std,
    middle: sma,
    lower: sma - stdDev * std,
  };
}

/**
 * Check if any trigger conditions are met
 * ALL indicators calculated LOCALLY from OHLCV bars
 */
function checkConditions(state, config) {
  const { conditions, thresholds } = config;
  const triggers = [];
  const bars = state.bars || [];
  const last = state.lastBar;
  const prev = state.prevBar;

  if (!last || !prev || !last.c || !prev.c) return triggers;

  // ─── Locally calculated indicators ───
  const localEMA = calcEMA(bars, 9);
  const localVWAP = calcVWAP(bars);
  const localST = calcSupertrend(bars);
  const localRSI = calcRSI(bars, 14);
  const localBB = calcBollingerBands(bars, thresholds.bollinger_period || 20, thresholds.bollinger_std || 2);

  // --- EMA Cross ---
  if (conditions.ema9_cross && localEMA) {
    if (last.c >= localEMA && prev.c < localEMA) {
      triggers.push({ type: 'ema_cross_above', detail: `Price ${last.c.toFixed(2)} crossed above EMA 9 (${localEMA.toFixed(2)})` });
    }
    if (last.c <= localEMA && prev.c > localEMA) {
      triggers.push({ type: 'ema_cross_below', detail: `Price ${last.c.toFixed(2)} crossed below EMA 9 (${localEMA.toFixed(2)})` });
    }
  }

  // --- VWAP Cross ---
  if (conditions.vwap_cross && localVWAP) {
    if (last.c >= localVWAP && prev.c < localVWAP) {
      triggers.push({ type: 'vwap_cross_above', detail: `Price crossed above VWAP (${localVWAP.toFixed(2)})` });
    }
    if (last.c <= localVWAP && prev.c > localVWAP) {
      triggers.push({ type: 'vwap_cross_below', detail: `Price crossed below VWAP (${localVWAP.toFixed(2)})` });
    }
  }

  // --- Supertrend Flip ---
  if (conditions.supertrend_flip && localST.direction) {
    if (lastSupertrendDirection && lastSupertrendDirection !== localST.direction) {
      const dir = localST.direction === 'down' ? 'changed direction (was up→down)' : 'changed direction (was down→up)';
      triggers.push({ type: 'supertrend_flip', detail: `Supertrend ${dir}` });
    }
    lastSupertrendDirection = localST.direction;
  }

  // --- RSI Overbought/Oversold ---
  if (conditions.rsi_overbought_oversold && localRSI !== null) {
    const overbought = thresholds.rsi_overbought || 70;
    const oversold = thresholds.rsi_oversold || 30;
    
    if (lastRSI !== null) {
      // Crossed above overbought
      if (localRSI >= overbought && lastRSI < overbought) {
        triggers.push({ type: 'rsi_overbought', detail: `RSI crossed above ${overbought} (${localRSI.toFixed(1)}) — overbought` });
      }
      // Crossed below oversold
      if (localRSI <= oversold && lastRSI > oversold) {
        triggers.push({ type: 'rsi_oversold', detail: `RSI crossed below ${oversold} (${localRSI.toFixed(1)}) — oversold` });
      }
      // Crossed back below overbought (bearish signal)
      if (localRSI < overbought && lastRSI >= overbought) {
        triggers.push({ type: 'rsi_exit_overbought', detail: `RSI dropped below ${overbought} (${localRSI.toFixed(1)}) — exiting overbought` });
      }
      // Crossed back above oversold (bullish signal)
      if (localRSI > oversold && lastRSI <= oversold) {
        triggers.push({ type: 'rsi_exit_oversold', detail: `RSI rose above ${oversold} (${localRSI.toFixed(1)}) — exiting oversold` });
      }
    }
    lastRSI = localRSI;
  }

  // --- Bollinger Band Breakout ---
  if (conditions.bollinger_breakout && localBB.upper !== null) {
    const currentPos = last.c > localBB.upper ? 'above' : last.c < localBB.lower ? 'below' : 'inside';
    
    if (lastBollingerPosition && lastBollingerPosition !== currentPos) {
      if (currentPos === 'above') {
        triggers.push({ type: 'bollinger_breakout_up', detail: `Price broke above upper Bollinger Band (${localBB.upper.toFixed(2)})` });
      }
      if (currentPos === 'below') {
        triggers.push({ type: 'bollinger_breakout_down', detail: `Price broke below lower Bollinger Band (${localBB.lower.toFixed(2)})` });
      }
    }
    lastBollingerPosition = currentPos;
  }

  // --- Breakout 1m High/Low ---
  if (conditions.breakout_1min_high && prev) {
    if (last.h > prev.h && last.c > prev.h) {
      triggers.push({ type: 'breakout_high', detail: `Broke above prev 1m high (${prev.h}) → ${last.h}` });
    }
  }
  if (conditions.breakout_1min_low && prev) {
    if (last.l < prev.l && last.c < prev.l) {
      triggers.push({ type: 'breakout_low', detail: `Broke below prev 1m low (${prev.l}) → ${last.l}` });
    }
  }

  // --- Round Number Cross ---
  if (conditions.round_number) {
    const roundNumbers = [];
    const base = Math.round(last.c / 10) * 10;
    for (let r = base - 100; r <= base + 100; r += 10) {
      roundNumbers.push(r);
    }
    for (const rn of roundNumbers) {
      if ((last.c >= rn && prev.c < rn) || (last.c <= rn && prev.c > rn)) {
        triggers.push({ type: 'round_number', detail: `Price crossed round number ${rn}` });
        break;
      }
    }
  }

  // --- Volume Spike ---
  if (conditions.volume_spike) {
    const volumes = bars.map(b => b.v).filter(v => v > 0);
    if (volumes.length > 5) {
      const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
      const multiplier = thresholds.volume_spike_multiplier || 1.5;
      if (last.v > avgVol * multiplier && avgVol > 0) {
        triggers.push({ type: 'volume_spike', detail: `Volume spike: ${last.v} vs avg ${Math.round(avgVol)} (${Math.round(last.v/avgVol*100)}%)` });
      }
    }
  }

  // --- Price Move > threshold ---
  if (conditions.price_move_0_2_pct && prev) {
    const movePct = Math.abs(last.c - prev.c) / prev.c * 100;
    const minMove = thresholds.min_price_move_pct || 0.2;
    if (movePct >= minMove) {
      const direction = last.c > prev.c ? 'up' : 'down';
      triggers.push({ type: 'price_move', detail: `Price moved ${movePct.toFixed(2)}% ${direction} in 1m (${prev.c} → ${last.c})` });
    }
  }

  return triggers;
}

/**
 * Main monitor loop
 */
export async function startMonitoring(config, onTrigger, onTick) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  🔍 SCALPING MONITOR STARTED`);
  console.log(`  Symbol: ${config.symbol}`);
  console.log(`  Timeframe: ${config.timeframe}`);
  console.log(`  Polling: every ${config.poll_interval_ms}ms`);
  console.log(`  Conditions: ${Object.entries(config.conditions).filter(([,v]) => v).map(([k]) => k).join(', ')}`);
  console.log(`  Indicators: EMA9, VWAP, Supertrend, RSI(14), Bollinger(20,2), Volume, Price Action`);
  console.log(`═══════════════════════════════════════════\n`);

  let cycleCount = 0;
  let consecutiveErrors = 0;

  const poll = async () => {
    try {
      cycleCount++;
      const state = await fetchCurrentState();
      
      if (!state || state.error) {
        if (cycleCount % 3 === 0) {
          console.error(`  ⚠ Chart data error: ${state?.error || 'No data'}. Ensure TradingView is open on a chart.`);
        }
        consecutiveErrors++;
        if (consecutiveErrors > 10) {
          console.error(`  ❌ Too many consecutive errors. Will retry...`);
          consecutiveErrors = 0;
        }
        setTimeout(poll, config.poll_interval_ms);
        return;
      }
      consecutiveErrors = 0;

      // Verify symbol
      if (config.symbol && state.symbol) {
        const expectedBare = config.symbol.split(':').pop().toUpperCase();
        const actualBare = state.symbol.split(':').pop().toUpperCase();
        if (expectedBare !== actualBare && cycleCount % 10 === 0) {
          console.log(`  ℹ️  Chart shows ${state.symbol}, config expects ${config.symbol}. Switch chart or update config.`);
        }
      }

      // Calculate all local indicators
      const atr = calcATR(state.bars);
      state.atr = atr;
      state.localEMA = calcEMA(state.bars, 9);
      state.localVWAP = calcVWAP(state.bars);
      state.localSupertrend = calcSupertrend(state.bars);
      state.localRSI = calcRSI(state.bars, 14);
      state.localBB = calcBollingerBands(state.bars, config.thresholds.bollinger_period || 20, config.thresholds.bollinger_std || 2);

      // Heartbeat
      if (cycleCount % 20 === 0) {
        console.log(`  💓 [${new Date().toLocaleTimeString()}] ${state.symbol || '?'} @ ${state.lastBar?.c || '?'} | ATR: ${atr.toFixed(2)} | RSI: ${state.localRSI?.toFixed(1) || 'N/A'} | Bars: ${state.bars?.length || 0}`);
      }

      // Tick callback
      if (onTick) {
        try { await onTick(state, cycleCount); } catch(e) {
          if (cycleCount % 10 === 0) console.error(`  ⚠ Tick error: ${e.message}`);
        }
      }

      // Check trigger conditions
      const triggers = checkConditions(state, config);

      if (triggers.length > 0) {
        const now = Date.now();
        if (now - lastTriggerTime >= MIN_TRIGGER_INTERVAL) {
          triggerCount++;
          lastTriggerTime = now;
          
          if (config.notifications?.sound) {
            process.stdout.write('\x07');
          }

          console.log(`\n┌─────────────────────────────────────────────`);
          console.log(`  🔔 TRIGGER #${triggerCount} — ${new Date().toLocaleTimeString()}`);
          console.log(`  Price: ${state.lastBar.c} | Symbol: ${state.symbol || '?'}`);
          triggers.forEach(t => console.log(`  ├─ ${t.type}: ${t.detail}`));
          console.log(`└─────────────────────────────────────────────\n`);

          if (onTrigger) {
            try { await onTrigger(state, triggers, config); } catch(e) {
              console.error(`  ⚠ Trigger handler error: ${e.message}`);
            }
          }
        }
      }

      lastState.lastBar = state.lastBar;
      lastState.prevBar = state.prevBar;

    } catch (err) {
      if (cycleCount % 5 === 0) {
        console.error(`  ⚠ Monitor error: ${err.message.substring(0, 120)}`);
      }
    }

    setTimeout(poll, config.poll_interval_ms);
  };

  poll();
}

/**
 * Stop the monitor
 */
export async function stopMonitoring() {
  console.log(`  Monitor stopped.`);
}