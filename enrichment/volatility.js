/**
 * Volatility Metrics
 * 
 * Computes volatility context from OHLCV bars and optional options data.
 * 
 * Input: bars[] in format {t, o, h, l, c, v}
 *        optionsData (optional) from options-chain-parser
 * Output: { atr, atr_pct, realized_vol_20, realized_vol_50, vol_regime, iv_atm, iv_percentile, vol_spread }
 */

/**
 * Calculate ATR (Average True Range)
 * @param {Array} bars - OHLCV bars
 * @param {number} period - ATR period
 * @returns {number|null} ATR value
 */
export function calcATR(bars, period = 14) {
  if (!bars || bars.length < 2) return null;

  const trs = [];
  for (let i = 1; i < Math.min(bars.length, period + 1); i++) {
    const b = bars[i];
    const pb = bars[i - 1];
    trs.push(Math.max(
      b.h - b.l,
      Math.abs(b.h - pb.c),
      Math.abs(b.l - pb.c)
    ));
  }

  if (trs.length === 0) return null;
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/**
 * Calculate realized volatility (annualized) from returns
 * @param {Array} bars - OHLCV bars
 * @param {number} period - Lookback period
 * @returns {number|null} Annualized volatility as percentage
 */
export function calcRealizedVol(bars, period = 20) {
  if (!bars || bars.length < period + 1) return null;

  const closes = bars.slice(-(period + 1)).map(b => b.c);
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] === 0) continue;
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize: sqrt(252 trading days * 1440 minutes per day) for 1m bars
  // For 1m bars: sqrt(252 * 1440) = sqrt(362880) ≈ 602.4
  // For 5m bars: sqrt(252 * 288) = sqrt(72576) ≈ 269.4
  // For 1h bars: sqrt(252 * 24) = sqrt(6048) ≈ 77.8
  // For daily bars: sqrt(252) ≈ 15.9
  // We'll use a generic annualization factor based on bar interval
  // Since we don't know the exact interval, use a reasonable default
  // For 1m bars (most common for scalping):
  const annualizationFactor = 602.4; // sqrt(252 * 1440) for 1-minute bars
  const annualizedVol = stdDev * annualizationFactor * 100;

  return Math.round(annualizedVol * 10) / 10;
}

/**
 * Determine volatility regime from ATR%
 * @param {number} atrPct - ATR as percentage of price
 * @returns {string} 'low' | 'moderate' | 'high'
 */
export function classifyVolRegime(atrPct) {
  if (atrPct === null || atrPct === undefined) return 'unknown';
  if (atrPct < 0.15) return 'low';
  if (atrPct < 0.5) return 'moderate';
  return 'high';
}

/**
 * Calculate IV percentile from options data
 * @param {object} optionsData - Parsed options chain data
 * @param {number} spotPrice - Current spot price
 * @returns {number|null} IV percentile (0-100)
 */
export function calcIVPercentile(optionsData, spotPrice) {
  if (!optionsData || !optionsData.options || optionsData.options.length === 0) return null;
  if (!spotPrice) return null;

  // Find ATM strike
  const atmStrike = Math.round(spotPrice / 50) * 50;
  const atmOption = optionsData.options.find(o => o.strike === atmStrike);
  if (!atmOption) return null;

  // Get ATM IV (use CE IV as proxy)
  const atmIV = atmOption.ce?.iv || atmOption.pe?.iv || null;
  if (atmIV === null) return null;

  // Collect all IVs to compute percentile
  const allIVs = [];
  for (const opt of optionsData.options) {
    if (opt.ce?.iv) allIVs.push(opt.ce.iv);
    if (opt.pe?.iv) allIVs.push(opt.pe.iv);
  }

  if (allIVs.length === 0) return null;

  // Sort and find percentile of ATM IV
  allIVs.sort((a, b) => a - b);
  const rank = allIVs.filter(iv => iv <= atmIV).length;
  return Math.round((rank / allIVs.length) * 100);
}

/**
 * Compute full volatility context
 * @param {Array} bars - OHLCV bars
 * @param {object} optionsData - Optional parsed options chain data
 * @param {number} spotPrice - Optional current spot price
 * @returns {object} Volatility metrics
 */
export function computeVolatility(bars, optionsData = null, spotPrice = null) {
  if (!bars || bars.length < 2) {
    return {
      atr: null,
      atr_pct: null,
      realized_vol_20: null,
      realized_vol_50: null,
      vol_regime: 'unknown',
      iv_atm: null,
      iv_percentile: null,
      vol_spread: null,
    };
  }

  const atr = calcATR(bars, 14);
  const lastClose = bars[bars.length - 1].c;
  const atrPct = atr !== null && lastClose > 0 ? (atr / lastClose) * 100 : null;

  const realizedVol20 = calcRealizedVol(bars, 20);
  const realizedVol50 = calcRealizedVol(bars, 50);

  const volRegime = classifyVolRegime(atrPct);

  // Options data
  let ivAtm = null;
  let ivPercentile = null;
  let volSpread = null;

  if (optionsData && optionsData.options && optionsData.options.length > 0 && spotPrice) {
    const atmStrike = Math.round(spotPrice / 50) * 50;
    const atmOption = optionsData.options.find(o => o.strike === atmStrike);
    if (atmOption) {
      ivAtm = atmOption.ce?.iv || atmOption.pe?.iv || null;
    }
    ivPercentile = calcIVPercentile(optionsData, spotPrice);

    if (ivAtm !== null && realizedVol20 !== null) {
      volSpread = Math.round((ivAtm / realizedVol20) * 10) / 10;
    }
  }

  return {
    atr: atr !== null ? Math.round(atr * 100) / 100 : null,
    atr_pct: atrPct !== null ? Math.round(atrPct * 100) / 100 : null,
    realized_vol_20: realizedVol20,
    realized_vol_50: realizedVol50,
    vol_regime: volRegime,
    iv_atm: ivAtm !== null ? Math.round(ivAtm * 10) / 10 : null,
    iv_percentile: ivPercentile,
    vol_spread: volSpread,
  };
}

/**
 * Format volatility for display
 */
export function formatVolatility(vol) {
  if (!vol) return 'N/A';

  const emoji = {
    'low': '🟢',
    'moderate': '🟡',
    'high': '🔴',
    'unknown': '❓',
  }[vol.vol_regime] || '❓';

  let output = `${emoji} Vol: ${vol.vol_regime.toUpperCase()} (ATR%: ${vol.atr_pct ?? 'N/A'}%)`;
  if (vol.realized_vol_20 !== null) {
    output += ` | RV20: ${vol.realized_vol_20}%`;
  }
  if (vol.iv_atm !== null) {
    output += ` | IV: ${vol.iv_atm}%`;
  }
  if (vol.vol_spread !== null) {
    output += ` | IV/RV: ${vol.vol_spread}`;
  }
  return output;
}