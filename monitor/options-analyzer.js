/**
 * NIFTY Options Analyzer
 * 
 * Reads the TradingView options chain tab directly via CDP and analyzes it.
 * Uses ALL option chain data: LTP, IV, Delta, Theta, Gamma, Vega, Rho,
 * Bid/Ask, Spread, Theoretical, Intrinsic/Time value, Break-even, Volume.
 * 
 * Scoring weightage (0-100):
 * - ATM proximity (20): ATM=20, ±50=15, else=5
 * - Delta (15): 0.30-0.50 ideal for scalping
 * - IV (15): 10-25% ideal (not too high, not too low)
 * - Volume/Liquidity (15): >1M=15, >500K=10, >100K=5
 * - Premium range (10): 50-150 ideal
 * - Bid/Ask spread (10): tight spread = better
 * - Time value (10): more time value = better for scalping
 * - Risk/Reward (5): >=1.5 good
 * 
 * Expiries come from the options tab URL (e.g., 20260804, 20260811)
 * NIFTY weekly expiries are TUESDAYS.
 */

import { parseOptionsChain, getOptionByStrike } from './options-chain-parser.js';

/**
 * Convert YYYYMMDD expiry to TradingView ddMMMyyyy format
 * e.g., 20260804 → 04AUG2026
 */
function formatExpiryForSymbol(expiry) {
  if (!expiry || expiry.length !== 8) return expiry || '';
  const year = expiry.slice(0, 4);
  const monthNum = parseInt(expiry.slice(4, 6), 10);
  const day = expiry.slice(6, 8);
  const monthMap = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${day}${monthMap[monthNum - 1]}${year}`;
}

/**
 * Analyze NIFTY options chain and recommend best trade
 * Uses ALL option chain data with weighted scoring
 * 
 * @param {number} spotPrice - Current NIFTY spot price
 * @param {object} config - Monitor config
 * @returns {object} Options analysis with best_trade
 */
export async function analyzeNiftyOptions(spotPrice, config) {
  try {
    const chainData = await parseOptionsChain();
    
    const atmStrike = Math.round(spotPrice / 50) * 50;
    const optConfig = config.options || {};
    const minPremium = optConfig.min_premium || 20;
    const maxPremium = optConfig.max_premium || 200;
    const targetMult = optConfig.target_multiplier || 1.25;
    const slMult = optConfig.stop_loss_multiplier || 0.85;
    const minScore = optConfig.min_score || 50;
    
    // Build option list from chain data with ALL fields
    const options = [];
    for (const row of chainData.options) {
      const strike = row.strike;
      const distFromATM = Math.abs(strike - atmStrike);
      // Use the per-option expiry (from UI group header) or fall back to first expiry
      const expiry = row.expiry || chainData.expiries[0] || '';
      const expiryCompact = formatExpiryForSymbol(expiry);
      
      // CE option
      if (row.ce.ltp && row.ce.ltp > 0) {
        options.push({
          symbol: `NSE:NIFTY${expiryCompact}${strike}CE`,
          underlying: 'NIFTY',
          expiry,
          strike,
          option_type: 'CE',
          premium: row.ce.ltp,
          volume: row.ce.volume || 0,
          dist_from_atm: distFromATM,
          // Full greeks & market data
          iv: row.ce.iv,
          delta: row.ce.delta,
          theta: row.ce.theta,
          gamma: row.ce.gamma,
          vega: row.ce.vega,
          rho: row.ce.rho,
          bid: row.ce.bid,
          ask: row.ce.ask,
          spread: row.ce.spread,
          theoretical: row.ce.theoretical,
          intrinsic_value: row.ce.intrinsic_value,
          time_value: row.ce.time_value,
          break_even: row.ce.break_even,
          to_break_even_pct: row.ce.to_break_even_pct,
          bid_pct: row.ce.bid_pct,
          ask_pct: row.ce.ask_pct,
          ann_bid_pct: row.ce.ann_bid_pct,
          ann_ask_pct: row.ce.ann_ask_pct,
          distance: row.ce.distance,
          rel_distance: row.ce.rel_distance,
        });
      }
      
      // PE option
      if (row.pe.ltp && row.pe.ltp > 0) {
        options.push({
          symbol: `NSE:NIFTY${expiryCompact}${strike}PE`,
          underlying: 'NIFTY',
          expiry,
          strike,
          option_type: 'PE',
          premium: row.pe.ltp,
          volume: row.pe.volume || 0,
          dist_from_atm: distFromATM,
          // Full greeks & market data
          iv: row.pe.iv,
          delta: row.pe.delta,
          theta: row.pe.theta,
          gamma: row.pe.gamma,
          vega: row.pe.vega,
          rho: row.pe.rho,
          bid: row.pe.bid,
          ask: row.pe.ask,
          spread: row.pe.spread,
          theoretical: row.pe.theoretical,
          intrinsic_value: row.pe.intrinsic_value,
          time_value: row.pe.time_value,
          break_even: row.pe.break_even,
          to_break_even_pct: row.pe.to_break_even_pct,
          bid_pct: row.pe.bid_pct,
          ask_pct: row.pe.ask_pct,
          ann_bid_pct: row.pe.ann_bid_pct,
          ann_ask_pct: row.pe.ann_ask_pct,
          distance: row.pe.distance,
          rel_distance: row.pe.rel_distance,
        });
      }
    }
    
    // Score and find best trade using ALL data
    const bestTrade = findBestOptionTrade(options, atmStrike, {
      minPremium, maxPremium, targetMult, slMult, minScore,
    });
    
    return {
      spot_price: spotPrice,
      atm_strike: atmStrike,
      current_expiry: chainData.expiries[0] || '',
      next_expiry: chainData.expiries[1] || '',
      options,
      best_trade: bestTrade,
      source: 'options_chain_tab',
    };
  } catch (e) {
    return {
      spot_price: spotPrice,
      atm_strike: Math.round(spotPrice / 50) * 50,
      current_expiry: '',
      next_expiry: '',
      options: [],
      best_trade: null,
      error: e.message,
    };
  }
}

/**
 * Score each option using ALL chain data with weighted criteria
 * 
 * Weightage (total 100):
 * - ATM proximity (20): ATM=20, ±50=15, else=5
 * - Delta (15): 0.30-0.50 ideal for scalping
 * - IV (15): 10-25% ideal
 * - Volume/Liquidity (15): >1M=15, >500K=10, >100K=5
 * - Premium range (10): 50-150 ideal
 * - Bid/Ask spread (10): tight spread = better
 * - Time value (10): more time value = better for scalping
 * - Risk/Reward (5): >=1.5 good
 */
function findBestOptionTrade(options, atmStrike, opts) {
  if (!options || options.length === 0) return null;
  
  const { minPremium, maxPremium, targetMult, slMult, minScore } = opts;
  
  let bestOption = null;
  let bestScore = 0;
  
  for (const opt of options) {
    if (!opt.premium || opt.premium <= 0) continue;
    if (opt.premium < minPremium || opt.premium > maxPremium) continue;
    
    let score = 0;
    const reasons = [];
    
    // 1. ATM proximity (0-20)
    if (opt.dist_from_atm === 0) { score += 20; reasons.push('ATM'); }
    else if (opt.dist_from_atm <= 50) { score += 15; reasons.push('ATM±1'); }
    else { score += 5; reasons.push('OTM'); }
    
    // 2. Delta (0-15): 0.30-0.50 ideal for scalping
    if (opt.delta !== null && opt.delta !== undefined) {
      const absDelta = Math.abs(opt.delta);
      if (absDelta >= 0.30 && absDelta <= 0.50) { score += 15; reasons.push(`Δ=${absDelta.toFixed(2)}`); }
      else if (absDelta >= 0.20 && absDelta <= 0.60) { score += 10; reasons.push(`Δ=${absDelta.toFixed(2)}`); }
      else if (absDelta >= 0.10 && absDelta <= 0.70) { score += 5; reasons.push(`Δ=${absDelta.toFixed(2)}`); }
    }
    
    // 3. IV (0-15): 10-25% ideal
    if (opt.iv !== null && opt.iv !== undefined) {
      if (opt.iv >= 10 && opt.iv <= 25) { score += 15; reasons.push(`IV=${opt.iv.toFixed(1)}%`); }
      else if (opt.iv >= 8 && opt.iv <= 30) { score += 10; reasons.push(`IV=${opt.iv.toFixed(1)}%`); }
      else if (opt.iv >= 5 && opt.iv <= 40) { score += 5; reasons.push(`IV=${opt.iv.toFixed(1)}%`); }
    }
    
    // 4. Volume/Liquidity (0-15)
    if (opt.volume > 1000000) { score += 15; reasons.push('HiVol'); }
    else if (opt.volume > 500000) { score += 10; reasons.push('MedVol'); }
    else if (opt.volume > 100000) { score += 5; reasons.push('LowVol'); }
    
    // 5. Premium range (0-10): 50-150 ideal
    if (opt.premium >= 50 && opt.premium <= 150) { score += 10; reasons.push('PremOK'); }
    else if (opt.premium >= 20 && opt.premium <= 200) { score += 5; reasons.push('PremFair'); }
    
    // 6. Bid/Ask spread (0-10): tight spread = better
    if (opt.spread !== null && opt.spread !== undefined && opt.premium > 0) {
      const spreadPct = (opt.spread / opt.premium) * 100;
      if (spreadPct <= 1.0) { score += 10; reasons.push('TightSprd'); }
      else if (spreadPct <= 2.0) { score += 7; reasons.push('FairSprd'); }
      else if (spreadPct <= 3.0) { score += 4; reasons.push('WideSprd'); }
    }
    
    // 7. Time value (0-10): more time value = better for scalping
    if (opt.time_value !== null && opt.time_value !== undefined && opt.premium > 0) {
      const tvPct = (opt.time_value / opt.premium) * 100;
      if (tvPct >= 50) { score += 10; reasons.push('HighTV'); }
      else if (tvPct >= 30) { score += 7; reasons.push('MedTV'); }
      else if (tvPct >= 10) { score += 4; reasons.push('LowTV'); }
    }
    
    // 8. Risk/Reward (0-5)
    const optTarget = opt.premium * targetMult;
    const optSL = opt.premium * slMult;
    const rr = (optTarget - opt.premium) / (opt.premium - optSL);
    if (rr >= 1.5) { score += 5; reasons.push(`R:R=${rr.toFixed(1)}`); }
    else if (rr >= 1.0) { score += 3; reasons.push(`R:R=${rr.toFixed(1)}`); }
    
    if (score > bestScore) {
      bestScore = score;
      bestOption = {
        ...opt,
        score,
        score_reasons: reasons,
        entry: opt.premium,
        target: Math.round(opt.premium * targetMult * 100) / 100,
        stop_loss: Math.round(opt.premium * slMult * 100) / 100,
        risk_reward: rr.toFixed(1),
        potential_profit_pts: (opt.premium * targetMult - opt.premium).toFixed(1),
        potential_loss_pts: (opt.premium - opt.premium * slMult).toFixed(1),
      };
    }
  }
  
  if (bestScore < minScore) return null;
  return bestOption;
}

/**
 * Format options analysis for display
 */
export function formatOptionsAnalysis(optionsData) {
  if (!optionsData) return '';
  
  let output = '';
  const bt = optionsData.best_trade;
  const spot = optionsData.spot_price;
  
  output += `\n╔══════════════════════════════════════════════════╗\n`;
  output += `║  📊 NIFTY OPTIONS CHAIN ANALYSIS               ║\n`;
  output += `╚══════════════════════════════════════════════════╝\n`;
  output += `  Spot: ${spot} | ATM: ${optionsData.atm_strike}\n`;
  output += `  Expiry: ${optionsData.current_expiry || 'N/A'} (current) | ${optionsData.next_expiry || 'N/A'} (next)\n`;
  output += `\n`;
  
  // Options table with key greeks
  if (optionsData.options && optionsData.options.length > 0) {
    output += `  ─── Chain (ATM ±2) ───\n`;
    const atm = optionsData.atm_strike;
    const strikes = [atm - 100, atm - 50, atm, atm + 50, atm + 100];
    
    output += `  Strike   CE LTP  CE IV%  CE Δ    CE Vol    PE LTP  PE IV%  PE Δ    PE Vol\n`;
    for (const s of strikes) {
      const ce = optionsData.options.find(o => o.strike === s && o.option_type === 'CE');
      const pe = optionsData.options.find(o => o.strike === s && o.option_type === 'PE');
      if (ce || pe) {
        output += `  ${String(s).padEnd(7)} `;
        output += `${String(ce?.premium?.toFixed(1) || 'N/A').padEnd(7)} `;
        output += `${String(ce?.iv?.toFixed(1) || 'N/A').padEnd(6)} `;
        output += `${String(ce?.delta?.toFixed(2) || 'N/A').padEnd(6)} `;
        output += `${String(ce?.volume || 0).padEnd(9)} `;
        output += `${String(pe?.premium?.toFixed(1) || 'N/A').padEnd(7)} `;
        output += `${String(pe?.iv?.toFixed(1) || 'N/A').padEnd(6)} `;
        output += `${String(pe?.delta?.toFixed(2) || 'N/A').padEnd(6)} `;
        output += `${String(pe?.volume || 0).padEnd(9)}\n`;
      }
    }
    output += `\n`;
  }
  
  // Best trade with full details
  if (bt) {
    const arrow = bt.option_type === 'CE' ? '🟢' : '🔴';
    const direction = bt.option_type === 'CE' ? 'BULLISH CALL' : 'BEARISH PUT';
    output += `  ${arrow} RECOMMENDED OPTION TRADE\n`;
    output += `  ─────────────────────────────────────────────\n`;
    output += `     Symbol:     ${bt.symbol}\n`;
    output += `     Direction:  ${direction} (${bt.option_type})\n`;
    output += `     Strike:     ${bt.strike} | Expiry: ${bt.expiry}\n`;
    output += `     Entry:      ${bt.entry?.toFixed(1)} (premium)\n`;
    output += `     Stop Loss:  ${bt.stop_loss?.toFixed(1)}\n`;
    output += `     Target:     ${bt.target?.toFixed(1)}\n`;
    output += `     Risk:Reward: 1:${bt.risk_reward}\n`;
    output += `     Score:      ${bt.score}/100\n`;
    output += `     Profit:     +${bt.potential_profit_pts} pts | Loss: -${bt.potential_loss_pts} pts\n`;
    output += `\n`;
    output += `     ─── Greeks & Market Data ───\n`;
    output += `     IV:         ${bt.iv?.toFixed(1) || 'N/A'}%\n`;
    output += `     Delta:      ${bt.delta?.toFixed(2) || 'N/A'}\n`;
    output += `     Theta:      ${bt.theta?.toFixed(2) || 'N/A'}\n`;
    output += `     Gamma:      ${bt.gamma?.toFixed(4) || 'N/A'}\n`;
    output += `     Vega:       ${bt.vega?.toFixed(2) || 'N/A'}\n`;
    output += `     Rho:        ${bt.rho?.toFixed(3) || 'N/A'}\n`;
    output += `     Bid/Ask:    ${bt.bid?.toFixed(1) || 'N/A'} / ${bt.ask?.toFixed(1) || 'N/A'} (spread ${bt.spread?.toFixed(1) || 'N/A'})\n`;
    output += `     Theoretical: ${bt.theoretical?.toFixed(1) || 'N/A'}\n`;
    output += `     Intrinsic:  ${bt.intrinsic_value?.toFixed(1) || 'N/A'} | Time: ${bt.time_value?.toFixed(1) || 'N/A'}\n`;
    output += `     Break-even: ${bt.break_even?.toFixed(1) || 'N/A'} (${bt.to_break_even_pct?.toFixed(2) || 'N/A'}%)\n`;
    output += `     Volume:     ${bt.volume || 0}\n`;
    if (bt.score_reasons && bt.score_reasons.length > 0) {
      output += `     Why:        ${bt.score_reasons.join(', ')}\n`;
    }
  } else {
    output += `  ⏸️  No suitable option trade found\n`;
    if (optionsData.error) output += `     (${optionsData.error})\n`;
  }
  output += `\n`;
  
  return output;
}