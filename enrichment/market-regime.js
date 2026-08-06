/**
 * Market Regime Detection
 * 
 * Classifies the current market state from OHLCV bars.
 * Uses ADX for trend strength, ATR% for volatility, and HH/HL structure.
 * 
 * Regimes:
 * - trending_up: ADX > 25, price making higher highs/higher lows
 * - trending_down: ADX > 25, price making lower lows/lower highs
 * - ranging: ADX <= 25, price oscillating
 * - volatile: ATR% above threshold regardless of direction
 * 
 * Input: bars[] in format {t, o, h, l, c, v}
 * Output: { regime, direction, adx, atr_pct, range_pct, higher_highs, lower_lows, score }
 */

/**
 * Calculate ADX (Average Directional Index)
 * @param {Array} bars - OHLCV bars
 * @param {number} period - ADX period (default 14)
 * @returns {number|null} ADX value 0-100
 */
export function calcADX(bars, period = 14) {
  if (!bars || bars.length < period * 2) return null;

  const plusDM = [];
  const minusDM = [];
  const tr = [];

  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const pb = bars[i - 1];

    const upMove = b.h - pb.h;
    const downMove = pb.l - b.l;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    tr.push(Math.max(
      b.h - b.l,
      Math.abs(b.h - pb.c),
      Math.abs(b.l - pb.c)
    ));
  }

  // Use Wilder's smoothing
  const startIdx = tr.length - period;
  if (startIdx < 0) return null;

  let atr = tr.slice(startIdx).reduce((a, b) => a + b, 0) / period;
  let plusDI = plusDM.slice(startIdx).reduce((a, b) => a + b, 0) / period;
  let minusDI = minusDM.slice(startIdx).reduce((a, b) => a + b, 0) / period;

  // Smooth over remaining bars
  for (let i = startIdx + period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    plusDI = (plusDI * (period - 1) + plusDM[i]) / period;
    minusDI = (minusDI * (period - 1) + minusDM[i]) / period;
  }

  if (atr === 0) return null;

  const plusDIPct = (plusDI / atr) * 100;
  const minusDIPct = (minusDI / atr) * 100;
  const dx = Math.abs(plusDIPct - minusDIPct) / (plusDIPct + minusDIPct) * 100;

  return isNaN(dx) ? null : dx;
}

/**
 * Calculate ATR as percentage of price
 * @param {Array} bars - OHLCV bars
 * @param {number} period - ATR period
 * @returns {number|null} ATR as % of last close
 */
export function calcATRPct(bars, period = 14) {
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
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  const lastClose = bars[bars.length - 1].c;
  if (lastClose === 0) return null;

  return (atr / lastClose) * 100;
}

/**
 * Check for higher highs / higher lows structure
 * @param {Array} bars - OHLCV bars
 * @returns {object} { higher_highs, higher_lows, lower_highs, lower_lows }
 */
export function checkStructure(bars, lookback = 10) {
  if (!bars || bars.length < lookback + 1) {
    return { higher_highs: false, higher_lows: false, lower_highs: false, lower_lows: false };
  }

  const recent = bars.slice(-lookback);
  const highs = recent.map(b => b.h);
  const lows = recent.map(b => b.l);

  // Count HH/HL
  let hh = 0, hl = 0, lh = 0, ll = 0;
  for (let i = 1; i < recent.length; i++) {
    if (highs[i] > highs[i - 1]) hh++;
    if (lows[i] > lows[i - 1]) hl++;
    if (highs[i] < highs[i - 1]) lh++;
    if (lows[i] < lows[i - 1]) ll++;
  }

  const total = recent.length - 1;
  return {
    higher_highs: hh / total > 0.6,
    higher_lows: hl / total > 0.6,
    lower_highs: lh / total > 0.6,
    lower_lows: ll / total > 0.6,
  };
}

/**
 * Calculate 20-bar range as percentage of price
 * @param {Array} bars - OHLCV bars
 * @returns {number|null} Range as % of last close
 */
export function calcRangePct(bars, lookback = 20) {
  if (!bars || bars.length < 2) return null;
  const recent = bars.slice(-lookback);
  const high = Math.max(...recent.map(b => b.h));
  const low = Math.min(...recent.map(b => b.l));
  const lastClose = bars[bars.length - 1].c;
  if (lastClose === 0) return null;
  return ((high - low) / lastClose) * 100;
}

/**
 * Classify the current market regime
 * @param {Array} bars - OHLCV bars in {t, o, h, l, c, v} format
 * @returns {object} Market regime classification
 */
export function detectMarketRegime(bars) {
  if (!bars || bars.length < 30) {
    return {
      regime: 'insufficient_data',
      direction: 'neutral',
      adx: null,
      atr_pct: null,
      range_pct: null,
      higher_highs: false,
      lower_lows: false,
      score: 0,
    };
  }

  const adx = calcADX(bars, 14);
  const atrPct = calcATRPct(bars, 14);
  const rangePct = calcRangePct(bars, 20);
  const structure = checkStructure(bars, 10);

  // Score: -5 (strong bearish) to +5 (strong bullish)
  let score = 0;

  // ADX contribution: trending = stronger signal
  const isTrending = adx !== null && adx > 25;
  const isStrongTrend = adx !== null && adx > 35;

  // Structure contribution
  if (structure.higher_highs) score += 2;
  if (structure.higher_lows) score += 1;
  if (structure.lower_highs) score -= 1;
  if (structure.lower_lows) score -= 2;

  // Price vs recent range
  const lastClose = bars[bars.length - 1].c;
  const recent = bars.slice(-20);
  const high = Math.max(...recent.map(b => b.h));
  const low = Math.min(...recent.map(b => b.l));
  const mid = (high + low) / 2;
  if (lastClose > mid) score += 1;
  else if (lastClose < mid) score -= 1;

  // Determine direction
  let direction = 'neutral';
  if (score >= 2) direction = 'bullish';
  else if (score <= -2) direction = 'bearish';

  // Determine regime
  let regime = 'ranging';
  if (isTrending && direction === 'bullish') regime = 'trending_up';
  else if (isTrending && direction === 'bearish') regime = 'trending_down';
  else if (isStrongTrend) regime = 'volatile';

  // Volatility check: if ATR% is very high, classify as volatile
  if (atrPct !== null && atrPct > 1.5) {
    regime = 'volatile';
  }

  return {
    regime,
    direction,
    adx: adx !== null ? Math.round(adx * 10) / 10 : null,
    atr_pct: atrPct !== null ? Math.round(atrPct * 100) / 100 : null,
    range_pct: rangePct !== null ? Math.round(rangePct * 100) / 100 : null,
    higher_highs: structure.higher_highs,
    lower_lows: structure.lower_lows,
    score,
  };
}

/**
 * Format market regime for display
 */
export function formatMarketRegime(regime) {
  if (!regime) return 'N/A';

  const emoji = {
    'trending_up': '🟢',
    'trending_down': '🔴',
    'ranging': '⚪',
    'volatile': '⚡',
    'insufficient_data': '❓',
  }[regime.regime] || '❓';

  return `${emoji} ${regime.regime.replace('_', ' ').toUpperCase()} (ADX: ${regime.adx ?? 'N/A'}, ATR%: ${regime.atr_pct ?? 'N/A'}%)`;
}