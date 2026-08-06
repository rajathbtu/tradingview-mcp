/**
 * Context Enricher
 * 
 * Orchestrates all enrichment modules and merges their output into the state object.
 * 
 * Input: state (from engine.js), config
 * Output: state with added `context` field
 * 
 * Key design:
 * - Non-blocking: enrichment runs after fetchCurrentState(), never before
 * - Graceful degradation: if any enrichment fails, data_complete: false but pipeline continues
 * - No data loss: all original state fields preserved; enrichment only ADDS state.context
 */

import { detectMarketRegime, formatMarketRegime } from '../enrichment/market-regime.js';
import { computeVolatility, formatVolatility } from '../enrichment/volatility.js';
import { getOpenBBContext, formatOpenBBContext } from '../enrichment/openbb-bridge.js';
import { getKronosForecast, formatKronosForecast } from '../enrichment/kronos-bridge.js';

// Cache for options data (30s TTL — same as options-chain-parser)
let optionsCache = { data: null, timestamp: 0 };
const OPTIONS_CACHE_TTL = 30000;

/**
 * Try to fetch options chain data (non-blocking)
 * @param {string} symbol - Symbol to check
 * @returns {Promise<object|null>} Options data or null
 */
async function tryFetchOptions(symbol) {
  const now = Date.now();
  if (optionsCache.data && (now - optionsCache.timestamp) < OPTIONS_CACHE_TTL) {
    return optionsCache.data;
  }

  try {
    // Dynamically import to avoid circular dependency
    const { parseOptionsChain } = await import('./options-chain-parser.js');
    const data = await parseOptionsChain();
    optionsCache = { data, timestamp: now };
    return data;
  } catch {
    return null;
  }
}

/**
 * Enrich the state object with market context
 * @param {object} state - State from engine.js (has bars, lastBar, symbol, etc.)
 * @param {object} config - Monitor config
 * @returns {Promise<object>} Enriched state (same object with context added)
 */
export async function enrichContext(state, config) {
  // If enrichment is disabled, return state unchanged
  const enrichmentConfig = config?.enrichment;
  if (!enrichmentConfig || enrichmentConfig.enabled === false) {
    return state;
  }

  const bars = state.bars || [];
  const symbol = state.symbol || '';
  const spotPrice = state.lastBar?.c || null;

  // ─── Market Regime (always computed from bars) ───
  let marketRegime = null;
  if (enrichmentConfig.market_regime !== false) {
    try {
      marketRegime = detectMarketRegime(bars);
    } catch (e) {
      marketRegime = { regime: 'error', error: e.message };
    }
  }

  // ─── Volatility (from bars + optional options) ───
  let volatility = null;
  if (enrichmentConfig.volatility !== false) {
    try {
      // Try to get options data for IV context (non-blocking)
      let optionsData = null;
      if (enrichmentConfig.include_options !== false) {
        optionsData = await tryFetchOptions(symbol);
      }
      volatility = computeVolatility(bars, optionsData, spotPrice);
    } catch (e) {
      volatility = { vol_regime: 'error', error: e.message };
    }
  }

  // ─── OpenBB Context (optional, graceful degradation) ───
  let openbb = null;
  if (enrichmentConfig.openbb?.enabled !== false) {
    try {
      openbb = await getOpenBBContext(symbol, enrichmentConfig.openbb);
    } catch (e) {
      openbb = { available: false, error: e.message };
    }
  }

  // ─── Kronos AI Forecast (optional, graceful degradation) ───
  let kronos = null;
  if (enrichmentConfig.kronos?.enabled !== false) {
    try {
      // Convert bars to OHLCV format for Kronos
      const ohlcvData = bars.map((bar, i) => ({
        timestamp: new Date(bar.t * 1000).toISOString(),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v || 0,
        amount: (bar.c * (bar.v || 0)) || 0,
      }));
      kronos = await getKronosForecast(ohlcvData, enrichmentConfig.kronos);
    } catch (e) {
      kronos = { available: false, error: e.message };
    }
  }

  // ─── Merge into state ───
  state.context = {
    market_regime: marketRegime,
    volatility: volatility,
    openbb: openbb,
    kronos: kronos,
    enriched_at: Date.now(),
    data_complete: marketRegime !== null && volatility !== null,
  };

  return state;
}

/**
 * Format context for display
 */
export function formatContext(context) {
  if (!context) return '';

  let output = `\n  📊 MARKET CONTEXT:\n`;

  if (context.market_regime) {
    output += `  ${formatMarketRegime(context.market_regime)}\n`;
  }
  if (context.volatility) {
    output += `  ${formatVolatility(context.volatility)}\n`;
  }
  if (context.openbb) {
    output += formatOpenBBContext(context.openbb);
  }
  if (context.kronos) {
    output += formatKronosForecast(context.kronos);
  }
  if (!context.data_complete) {
    output += `  ⚠️  Partial data — some enrichment sources unavailable\n`;
  }

  return output;
}