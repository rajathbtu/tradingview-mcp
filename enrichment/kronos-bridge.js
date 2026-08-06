/**
 * Kronos Forecasting Bridge
 * 
 * Fetches AI-powered price forecasts from the Kronos foundation model.
 * Graceful degradation: if Kronos is not running, returns { available: false }.
 * 
 * Input: OHLCV data array, config
 * Output: { available, forecast, summary, error }
 */

// Cache for Kronos predictions (5min TTL — forecasts don't change rapidly)
const kronosCache = new Map();
const CACHE_TTL = 300000;

/**
 * Check if Kronos API is reachable
 * @param {string} baseUrl - Kronos API base URL
 * @returns {Promise<boolean>}
 */
async function checkKronosAvailability(baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Get Kronos forecast for OHLCV data
 * @param {Array} ohlcvData - Array of {timestamp, open, high, low, close, volume, amount}
 * @param {object} config - Monitor config (enrichment.kronos section)
 * @returns {Promise<object>} Forecast result
 */
export async function getKronosForecast(ohlcvData, config = {}) {
  const baseUrl = config?.base_url || 'http://localhost:8001';
  const predLen = config?.pred_len || 5;
  const lookback = config?.lookback || Math.min(ohlcvData?.length || 0, 200);
  const cacheTtl = config?.cache_ttl_ms || CACHE_TTL;

  if (!ohlcvData || ohlcvData.length < 20) {
    return {
      available: false,
      forecast: null,
      summary: null,
      error: 'Insufficient OHLCV data (need at least 20 bars)',
    };
  }

  // Check cache
  const now = Date.now();
  const cacheKey = `${ohlcvData[0]?.timestamp}:${ohlcvData[ohlcvData.length - 1]?.timestamp}:${predLen}`;
  const cached = kronosCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < cacheTtl) {
    return cached.data;
  }

  // Check if Kronos is available
  const available = await checkKronosAvailability(baseUrl);
  if (!available) {
    const result = {
      available: false,
      forecast: null,
      summary: null,
      error: 'Kronos API not reachable',
    };
    kronosCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2min for model inference

    const resp = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        data: ohlcvData,
        pred_len: predLen,
        lookback: lookback,
        temperature: 1.0,
        top_p: 0.9,
        sample_count: 1,
      }),
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      const result = {
        available: true,
        forecast: null,
        summary: null,
        error: `Kronos API error: ${resp.status} ${errText}`,
      };
      kronosCache.set(cacheKey, { data: result, timestamp: now });
      return result;
    }

    const data = await resp.json();
    const result = {
      available: true,
      forecast: data.forecast || null,
      summary: data.summary || null,
      prediction_time_s: data.prediction_time_s,
      error: null,
    };

    kronosCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  } catch (e) {
    const result = {
      available: true,
      forecast: null,
      summary: null,
      error: `Kronos request failed: ${e.message}`,
    };
    kronosCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  }
}

/**
 * Format Kronos forecast for display
 */
export function formatKronosForecast(ctx) {
  if (!ctx) return 'N/A';
  if (!ctx.available) return '  🤖 Kronos: not available\n';
  if (!ctx.forecast || ctx.forecast.length === 0) {
    return `  🤖 Kronos: ${ctx.error || 'no forecast'}\n`;
  }

  const s = ctx.summary;
  let output = `  🤖 Kronos AI Forecast (${ctx.forecast.length} bars):`;
  if (s) {
    const emoji = s.direction === 'up' ? '📈' : '📉';
    output += ` ${emoji} ${s.direction.toUpperCase()} ${s.change_pct > 0 ? '+' : ''}${s.change_pct}%`;
    output += ` (${s.last_close?.toFixed(2)} → ${s.final_close?.toFixed(2)})`;
  }
  output += `\n`;

  // Show first and last few forecast bars
  const bars = ctx.forecast;
  const showBars = bars.slice(0, 2).concat(bars.length > 4 ? bars.slice(-2) : []);
  for (const bar of showBars) {
    const ts = bar.timestamp ? new Date(bar.timestamp).toLocaleString() : 'N/A';
    output += `    ${ts}: O:${bar.open?.toFixed(2)} H:${bar.high?.toFixed(2)} L:${bar.low?.toFixed(2)} C:${bar.close?.toFixed(2)}\n`;
  }

  return output;
}