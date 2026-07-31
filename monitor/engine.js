/**
 * Scalping Monitor Engine
 * 
 * Polls TradingView every 5 seconds, checks trigger conditions,
 * and fires full analysis when conditions are met.
 */

import CDP from 'chrome-remote-interface';
import http from 'node:http';

let client = null;
let lastState = {};
let triggerCount = 0;
let lastTriggerTime = 0;
const MIN_TRIGGER_INTERVAL = 15000; // Min 15s between triggers to avoid spam

/**
 * Find the TradingView chart tab via CDP
 */
async function findChartTarget() {
  const list = await new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  // Prefer the chart tab (not options chain)
  const target = list.find(t => 
    t.title && t.title.includes('TradingView') && t.url.includes('/chart/')
  );
  if (!target) {
    // Fallback: any TradingView page
    const fallback = list.find(t => t.title && t.title.includes('TradingView'));
    if (!fallback) throw new Error('No TradingView tab found. Is TradingView open?');
    return fallback;
  }
  return target;
}

/**
 * Connect to CDP client
 */
async function connect() {
  if (client) return client;
  const target = await findChartTarget();
  client = await CDP({ host: '127.0.0.1', port: 9222, target: target.id });
  await client.Runtime.enable();
  await client.Page.enable();
  return client;
}

/**
 * Evaluate JavaScript in the page context
 */
async function evaluate(expression) {
  const c = await connect();
  const result = await c.Runtime.evaluate({
    expression: `(function() { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'JS evaluation error');
  }
  return result.result.value;
}

/**
 * Fetch current bar data from the chart
 */
async function fetchCurrentState() {
  const data = await evaluate(`
    var api = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
    var bars = api.chart()._mainSeries.bars();
    var lastIdx = bars.lastIndex();
    var prevIdx = lastIdx - 1;
    var last = bars.valueAt(lastIdx);
    var prev = bars.valueAt(prevIdx);
    var allBars = [];
    for (var i = Math.max(bars.firstIndex(), lastIdx - 20); i <= lastIdx; i++) {
      var b = bars.valueAt(i);
      if (b) allBars.push({t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] || 0});
    }
    
    // Get indicators
    var model = api._chartWidget.model();
    var sources = model.model().dataSources();
    var studies = {};
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
              for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item._value && item._value !== '\\u2205' && item._title) vals[item._title] = item._value;
              }
            }
          }
        } catch(e) {}
        if (Object.keys(vals).length > 0) studies[name] = vals;
      } catch(e) {}
    }
    
    // Get symbol info
    var sym = '';
    try { sym = api.symbol(); } catch(e) {}
    
    return {
      symbol: sym,
      bars: allBars,
      studies: studies,
      lastBar: last ? {t: last[0], o: last[1], h: last[2], l: last[3], c: last[4], v: last[5] || 0} : null,
      prevBar: prev ? {t: prev[0], o: prev[1], h: prev[2], l: prev[3], c: prev[4], v: prev[5] || 0} : null,
    };
  `);
  return data;
}

/**
 * Calculate ATR from recent bars
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
 * Check if any trigger conditions are met
 */
function checkConditions(state, config) {
  const { conditions, thresholds } = config;
  const triggers = [];
  const bars = state.bars || [];
  const last = state.lastBar;
  const prev = state.prevBar;
  const studies = state.studies || {};

  if (!last || !prev) return triggers;

  // --- EMA 9 Cross ---
  if (conditions.ema9_cross) {
    const ema9 = studies['Moving Average Exponential']?.EMA;
    if (ema9) {
      const emaVal = parseFloat(ema9.replace(/,/g, ''));
      if (!isNaN(emaVal)) {
        if (last.c >= emaVal && prev.c < emaVal) {
          triggers.push({ type: 'ema9_cross_above', detail: `Price ${last.c} crossed above EMA 9 (${emaVal})` });
        }
        if (last.c <= emaVal && prev.c > emaVal) {
          triggers.push({ type: 'ema9_cross_below', detail: `Price ${last.c} crossed below EMA 9 (${emaVal})` });
        }
      }
    }
  }

  // --- VWAP Cross ---
  if (conditions.vwap_cross) {
    const vwap = studies['Volume Weighted Average Price']?.VWAP;
    if (vwap) {
      const vwapVal = parseFloat(vwap.replace(/,/g, ''));
      if (!isNaN(vwapVal)) {
        if (last.c >= vwapVal && prev.c < vwapVal) {
          triggers.push({ type: 'vwap_cross_above', detail: `Price crossed above VWAP (${vwapVal})` });
        }
        if (last.c <= vwapVal && prev.c > vwapVal) {
          triggers.push({ type: 'vwap_cross_below', detail: `Price crossed below VWAP (${vwapVal})` });
        }
      }
    }
  }

  // --- Supertrend Flip ---
  if (conditions.supertrend_flip) {
    const supertrend = studies['Supertrend'];
    if (supertrend) {
      const prevST = lastState.supertrend;
      const currST = supertrend.Supertrend ? parseFloat(supertrend.Supertrend.replace(/,/g, '')) : null;
      if (prevST && currST && prevST !== currST) {
        const direction = supertrend['Up Trend'] ? 'bullish' : 'bearish';
        triggers.push({ type: 'supertrend_flip', detail: `Supertrend flipped to ${direction}` });
      }
      if (currST) lastState.supertrend = currST;
    }
  }

  // --- UT Bot Signal ---
  if (conditions.utbot_signal) {
    const utbot = studies['UT Bot'];
    if (utbot) {
      const buy = parseFloat(utbot.Buy || '0');
      if (buy > 0 && (!lastState.utbotBuy || lastState.utbotBuy === 0)) {
        triggers.push({ type: 'utbot_buy', detail: `UT Bot Buy signal at ${buy}` });
      }
      if (buy === 0 && lastState.utbotBuy > 0) {
        triggers.push({ type: 'utbot_sell', detail: 'UT Bot Buy signal turned off' });
      }
      lastState.utbotBuy = buy;
    }
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
    const range = thresholds.round_number_range || 5;
    const roundNumbers = [];
    // Generate round numbers around current price
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

  // --- Price Move > 0.2% ---
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
  console.log(`═══════════════════════════════════════════\n`);

  let cycleCount = 0;

  const poll = async () => {
    try {
      cycleCount++;
      const state = await fetchCurrentState();
      
      if (!state || !state.lastBar) {
        setTimeout(poll, config.poll_interval_ms);
        return;
      }

      // Calculate ATR
      const atr = calcATR(state.bars);
      state.atr = atr;

      // Call tick callback
      if (onTick) onTick(state, cycleCount);

      // Check conditions
      const triggers = checkConditions(state, config);

      if (triggers.length > 0) {
        const now = Date.now();
        if (now - lastTriggerTime >= MIN_TRIGGER_INTERVAL) {
          triggerCount++;
          lastTriggerTime = now;
          
          if (config.notifications?.sound) {
            process.stdout.write('\x07'); // Terminal bell
          }

          console.log(`\n┌─────────────────────────────────────────────`);
          console.log(`  🔔 TRIGGER #${triggerCount} — ${new Date().toLocaleTimeString()}`);
          console.log(`  Price: ${state.lastBar.c} | Symbol: ${state.symbol}`);
          triggers.forEach(t => console.log(`  ├─ ${t.type}: ${t.detail}`));
          console.log(`└─────────────────────────────────────────────\n`);

          if (onTrigger) {
            await onTrigger(state, triggers, config);
          }
        }
      }

      // Update last state for comparison
      lastState.lastBar = state.lastBar;
      lastState.prevBar = state.prevBar;

    } catch (err) {
      // Connection might have dropped — reconnect on next cycle
      if (client) {
        try { await client.close(); } catch(e) {}
        client = null;
      }
      if (cycleCount % 10 === 0) {
        console.error(`  ⚠ Monitor error: ${err.message}`);
      }
    }

    setTimeout(poll, config.poll_interval_ms);
  };

  // Start polling
  poll();
}

/**
 * Stop the monitor
 */
export async function stopMonitoring() {
  if (client) {
    try { await client.close(); } catch(e) {}
    client = null;
  }
}