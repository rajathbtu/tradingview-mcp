/**
 * OpenBB REST API Bridge
 * 
 * Fetches market context from OpenBB (fundamentals, sentiment, news).
 * Graceful degradation: if OpenBB is not running, returns { available: false }.
 * 
 * Input: symbol (e.g., 'AAPL'), config
 * Output: { available, fundamentals, sentiment, news, error }
 */

// Cache for OpenBB data (60s TTL — fundamentals don't change every second)
// Keyed by symbol+baseUrl to avoid cross-symbol contamination
const openbbCache = new Map();
const CACHE_TTL = 60000;

/**
 * Check if OpenBB API is reachable
 * @param {string} baseUrl - OpenBB API base URL
 * @returns {Promise<boolean>}
 */
async function checkOpenBBAvailability(baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${baseUrl}/docs`, { signal: controller.signal });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch fundamentals for a symbol from OpenBB
 * @param {string} symbol - Symbol (e.g., 'AAPL')
 * @param {string} baseUrl - OpenBB API base URL
 * @returns {Promise<object|null>}
 */
async function fetchFundamentals(symbol, baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${baseUrl}/api/v1/equity/fundamental/metrics?symbol=${encodeURIComponent(symbol)}&provider=yfinance`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.results?.[0] || data?.data?.[0] || data?.results || data?.data || null;
  } catch {
    return null;
  }
}

/**
 * Fetch quote data for a symbol from OpenBB
 * @param {string} symbol - Symbol (e.g., 'AAPL')
 * @param {string} baseUrl - OpenBB API base URL
 * @returns {Promise<object|null>}
 */
async function fetchQuote(symbol, baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${baseUrl}/api/v1/equity/price/quote?symbol=${encodeURIComponent(symbol)}&provider=yfinance`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.results?.[0] || data?.data?.[0] || data?.results || data?.data || null;
  } catch {
    return null;
  }
}

/**
 * Fetch recent news for a symbol from OpenBB
 * @param {string} symbol - Symbol (e.g., 'AAPL')
 * @param {string} baseUrl - OpenBB API base URL
 * @returns {Promise<Array|null>}
 */
async function fetchNews(symbol, baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${baseUrl}/api/v1/news/company?symbol=${encodeURIComponent(symbol)}&limit=5&provider=yfinance`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.results || data?.data || null;
  } catch {
    return null;
  }
}

/**
 * Get OpenBB market context for a symbol
 * @param {string} symbol - Symbol (e.g., 'AAPL')
 * @param {object} config - Monitor config (enrichment.openbb section)
 * @returns {Promise<object>} Enriched context
 */
export async function getOpenBBContext(symbol, config = {}) {
  const baseUrl = config?.base_url || 'http://localhost:8000';
  const cacheTtl = config?.cache_ttl_ms || CACHE_TTL;

  // Check cache (per-symbol)
  const now = Date.now();
  const cacheKey = `${symbol}:${baseUrl}`;
  const cached = openbbCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < cacheTtl) {
    return cached.data;
  }

  // Check if OpenBB is available
  const available = await checkOpenBBAvailability(baseUrl);
  if (!available) {
    const result = {
      available: false,
      fundamentals: null,
      quote: null,
      news: null,
      error: 'OpenBB API not reachable',
    };
    openbbCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  }

  // Fetch data sequentially (OpenBB is single-threaded)
  const fundamentals = await fetchFundamentals(symbol, baseUrl);
  const quote = await fetchQuote(symbol, baseUrl);
  const news = await fetchNews(symbol, baseUrl);

  // Build sentiment from fundamentals + quote
  const sentiment = buildSentiment(fundamentals, quote);

  const result = {
    available: true,
    fundamentals,
    quote,
    sentiment,
    news,
    error: null,
  };

  openbbCache.set(cacheKey, { data: result, timestamp: now });
  return result;
}

/**
 * Build a sentiment score from available data
 * @param {object} fundamentals - Fundamentals data
 * @param {object} quote - Quote data
 * @returns {object|null} Sentiment object
 */
function buildSentiment(fundamentals, quote) {
  if (!fundamentals && !quote) return null;

  let score = 0;
  let signals = 0;

  // Fundamentals-based signals
  if (fundamentals) {
    if (fundamentals.revenue_growth > 0.1) { score += 0.3; signals++; }
    else if (fundamentals.revenue_growth > 0) { score += 0.1; signals++; }
    else if (fundamentals.revenue_growth < 0) { score -= 0.2; signals++; }

    if (fundamentals.profit_margin > 0.2) { score += 0.2; signals++; }
    else if (fundamentals.profit_margin > 0) { score += 0.1; signals++; }

    if (fundamentals.earnings_growth > 0.2) { score += 0.2; signals++; }
    else if (fundamentals.earnings_growth > 0) { score += 0.1; signals++; }
  }

  // Quote-based signals
  if (quote) {
    if (quote.last_price && quote.prev_close) {
      const changePct = ((quote.last_price - quote.prev_close) / quote.prev_close) * 100;
      if (changePct > 1) { score += 0.3; signals++; }
      else if (changePct > 0) { score += 0.1; signals++; }
      else if (changePct < -1) { score -= 0.3; signals++; }
      else if (changePct < 0) { score -= 0.1; signals++; }
    }
  }

  if (signals === 0) return null;

  // Normalize to -1 to +1
  const normalized = Math.max(-1, Math.min(1, score / Math.max(signals, 1)));

  return {
    score: Math.round(normalized * 100) / 100,
    label: normalized > 0.3 ? 'positive' : normalized < -0.3 ? 'negative' : 'neutral',
    signals_used: signals,
  };
}

/**
 * Format OpenBB context for display
 */
export function formatOpenBBContext(ctx) {
  if (!ctx) return 'N/A';
  if (!ctx.available) return '  ❌ OpenBB not available\n';

  let output = '';
  if (ctx.fundamentals) {
    const f = ctx.fundamentals;
    output += `  📊 Fundamentals:`;
    if (f.market_cap) output += ` MCap: $${(f.market_cap / 1e12).toFixed(2)}T`;
    if (f.pe_ratio) output += ` | P/E: ${f.pe_ratio.toFixed(1)}`;
    if (f.eps) output += ` | EPS: $${f.eps.toFixed(2)}`;
    if (f.revenue_growth) output += ` | RevGr: ${(f.revenue_growth * 100).toFixed(1)}%`;
    if (f.profit_margin) output += ` | Margin: ${(f.profit_margin * 100).toFixed(1)}%`;
    output += `\n`;
  }
  if (ctx.quote) {
    const q = ctx.quote;
    output += `  💹 Quote: $${q.last_price?.toFixed(2) || 'N/A'}`;
    if (q.prev_close) {
      const chg = ((q.last_price - q.prev_close) / q.prev_close * 100).toFixed(2);
      output += ` (${chg > 0 ? '+' : ''}${chg}%)`;
    }
    if (q.ma_50d) output += ` | 50dMA: $${q.ma_50d.toFixed(2)}`;
    if (q.ma_200d) output += ` | 200dMA: $${q.ma_200d.toFixed(2)}`;
    output += `\n`;
  }
  if (ctx.sentiment) {
    const s = ctx.sentiment;
    const emoji = s.label === 'positive' ? '🟢' : s.label === 'negative' ? '🔴' : '🟡';
    output += `  ${emoji} Sentiment: ${s.label.toUpperCase()} (${s.score})\n`;
  }
  if (ctx.news && ctx.news.length > 0) {
    output += `  📰 News: ${ctx.news.length} recent items\n`;
  }
  return output || '  📊 OpenBB: no data available\n';
}