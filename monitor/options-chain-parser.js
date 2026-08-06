/**
 * Options Chain Parser
 * 
 * Reads the TradingView options chain tab via CDP and parses the FULL table.
 * Extracts ALL 50 columns for both CE and PE sides.
 * 
 * Table structure (50 columns per row):
 *   [CE: Rho, Vega, Gamma, Theta, Delta, ToBE%, BE, IVspread, AskIV%, BidIV%,
 *    TimeVal, IntrVal, AnnAsk%, AnnBid%, Ask%, Bid%, LTP, Theor, Spread, Ask, Bid,
 *    RelDist, Distance, Volume, Strike, IV, Volume, Distance, RelDist, Bid, Ask,
 *    Spread, Theor, LTP, Bid%, Ask%, AnnBid%, AnnAsk%, IntrVal, TimeVal,
 *    BidIV%, AskIV%, IVspread, BE, ToBE%, Delta, Theta, Gamma, Vega, Rho]
 * 
 * Column indices:
 *   CE: Rho=0, Vega=1, Gamma=2, Theta=3, Delta=4, ToBE%=5, BE=6, IVspread=7,
 *       AskIV%=8, BidIV%=9, TimeVal=10, IntrVal=11, AnnAsk%=12, AnnBid%=13,
 *       Ask%=14, Bid%=15, LTP=16, Theor=17, Spread=18, Ask=19, Bid=20,
 *       RelDist=21, Distance=22, Volume=23, Strike=24
 *   PE: IV=25, Volume=26, Distance=27, RelDist=28, Bid=29, Ask=30, Spread=31,
 *       Theor=32, LTP=33, Bid%=34, Ask%=35, AnnBid%=36, AnnAsk%=37, IntrVal=38,
 *       TimeVal=39, BidIV%=40, AskIV%=41, IVspread=42, BE=43, ToBE%=44,
 *       Delta=45, Theta=46, Gamma=47, Vega=48, Rho=49
 * 
 * Expiry groups appear as header rows in the table with a badge showing DTE:
 *   Group header: "August 115 DTE" + badge: "5 DTE"
 *   → day=11, dte=5, expiry=20260811
 * 
 * The DTE badge is read directly from the DOM — never guessed.
 */

import WebSocket from 'ws';

const CDP_PORT = 9222;

// Column indices in the options chain table
const COL = {
  // CE side
  CE_RHO: 0, CE_VEGA: 1, CE_GAMMA: 2, CE_THETA: 3, CE_DELTA: 4,
  CE_TO_BE_PCT: 5, CE_BE: 6, CE_IV_SPREAD: 7, CE_ASK_IV_PCT: 8, CE_BID_IV_PCT: 9,
  CE_TIME_VAL: 10, CE_INTR_VAL: 11, CE_ANN_ASK_PCT: 12, CE_ANN_BID_PCT: 13,
  CE_ASK_PCT: 14, CE_BID_PCT: 15, CE_LTP: 16, CE_THEOR: 17, CE_SPREAD: 18,
  CE_ASK: 19, CE_BID: 20, CE_REL_DIST: 21, CE_DISTANCE: 22, CE_VOLUME: 23,
  STRIKE: 24,
  // PE side
  PE_IV: 25, PE_VOLUME: 26, PE_DISTANCE: 27, PE_REL_DIST: 28, PE_BID: 29,
  PE_ASK: 30, PE_SPREAD: 31, PE_THEOR: 32, PE_LTP: 33, PE_BID_PCT: 34,
  PE_ASK_PCT: 35, PE_ANN_BID_PCT: 36, PE_ANN_ASK_PCT: 37, PE_INTR_VAL: 38,
  PE_TIME_VAL: 39, PE_BID_IV_PCT: 40, PE_ASK_IV_PCT: 41, PE_IV_SPREAD: 42,
  PE_BE: 43, PE_TO_BE_PCT: 44, PE_DELTA: 45, PE_THETA: 46, PE_GAMMA: 47,
  PE_VEGA: 48, PE_RHO: 49,
};

// Cache for options chain data (30s TTL)
let chainCache = { data: null, timestamp: 0 };
const CACHE_TTL = 30000;

// Month name → number mapping
const MONTHS = {
  'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
  'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
  'JANUARY': 1, 'FEBRUARY': 2, 'MARCH': 3, 'APRIL': 4, 'MAY': 5, 'JUNE': 6,
  'JULY': 7, 'AUGUST': 8, 'SEPTEMBER': 9, 'OCTOBER': 10, 'NOVEMBER': 11, 'DECEMBER': 12,
};

/**
 * Find the options chain CDP target
 */
async function findOptionsTarget() {
  const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  return targets.find(t => 
    t.type === 'page' && 
    (t.url.includes('/options/chain') || /options chain/i.test(t.title))
  ) || null;
}

/**
 * Connect to a CDP target via WebSocket
 */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    
    ws.on('open', () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const msgId = ++id;
          pending.set(msgId, { res, rej });
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      },
      close() { ws.close(); }
    }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
    
    ws.on('error', reject);
  });
}

/**
 * Read the raw options chain table from the options tab.
 * For each row, captures both the cell text AND the badge DTE (if present).
 * 
 * @returns {Array<{cells: Array<string>, badgeDte: number|null}>} Table rows
 */
async function readRawChainTable() {
  const target = await findOptionsTarget();
  if (!target) {
    throw new Error('Options chain tab not found. Open TradingView options chain for NSE:NIFTY.');
  }
  
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(function() {
      var tables = document.querySelectorAll('table');
      var allRows = [];
      for (var t = 0; t < tables.length; t++) {
        var trs = tables[t].querySelectorAll('tr');
        for (var r = 0; r < trs.length; r++) {
          var tr = trs[r];
          var cells = [];
          var tds = tr.querySelectorAll('th, td');
          for (var c = 0; c < tds.length; c++) {
            cells.push((tds[c].textContent || '').replace(/\\s+/g, ' ').trim());
          }
          
          // Extract badge DTE from this row (e.g., "5 DTE" badge in group header)
          var badgeDte = null;
          var badges = tr.querySelectorAll('[class*="badge"]');
          for (var b = 0; b < badges.length; b++) {
            var badgeText = (badges[b].textContent || '').trim();
            var dteMatch = badgeText.match(/^(\\d+)\\s*DTE$/i);
            if (dteMatch) {
              badgeDte = parseInt(dteMatch[1], 10);
              break;
            }
          }
          
          if (cells.length > 0) {
            allRows.push({ cells: cells, badgeDte: badgeDte });
          }
        }
      }
      return JSON.stringify(allRows);
    })()`,
    returnByValue: true,
  });
  
  cdp.close();
  
  if (!result.result?.value) return [];
  return JSON.parse(result.result.value);
}

/**
 * Parse a numeric cell value (handles commas, %, unicode minus, empty)
 */
function num(cell) {
  if (!cell) return null;
  // Replace unicode minus (U+2212) with regular hyphen
  let cleaned = String(cell).replace(/\u2212/g, '-').replace(/,/g, '').replace(/%/g, '').trim();
  if (cleaned === '' || cleaned === '—' || cleaned === '-') return null;
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

/**
 * Parse an expiry group header using the badge DTE from the DOM.
 * 
 * Group header text: "August 115 DTE" (month + concatenated day+DTE)
 * Badge DTE: 5 (from the "5 DTE" badge element in the same row)
 * 
 * Algorithm:
 * 1. Extract month name from header text
 * 2. Extract the concatenated day+DTE number
 * 3. Use the badge DTE to determine how many trailing digits belong to DTE
 * 4. The remaining leading digits are the day
 * 
 * @param {string} text - Group header text (e.g., "August 115 DTE")
 * @param {number|null} badgeDte - DTE from badge element (e.g., 5)
 * @returns {object|null} { month, day, dte, year, yyyymmdd }
 */
function parseExpiryGroup(text, badgeDte) {
  if (!text) return null;
  
  // Match: "August 115 DTE" or "August 18 12 DTE"
  const match = text.match(/^([A-Za-z]+)\s+(\d+)\s*(\d*)\s*DTE$/i);
  if (!match) return null;
  
  const monthName = match[1].toUpperCase();
  const month = MONTHS[monthName];
  if (!month) return null;
  
  // Concatenated day+DTE: "115" or "1812" or "126"
  const combined = match[2] + (match[3] || '');
  
  // Use badge DTE to determine the split
  let day = null;
  let dte = null;
  
  if (badgeDte && badgeDte > 0) {
    // Badge DTE is authoritative — use it to split
    const dteStr = String(badgeDte);
    if (combined.endsWith(dteStr)) {
      const dayStr = combined.slice(0, combined.length - dteStr.length);
      if (dayStr && /^\d+$/.test(dayStr)) {
        day = parseInt(dayStr, 10);
        dte = badgeDte;
      }
    }
  }
  
  // Fallback: if badge DTE not available, try both splits
  if (!day || !dte) {
    if (combined.length === 2) {
      day = parseInt(combined[0], 10);
      dte = parseInt(combined[1], 10);
    } else if (combined.length === 3) {
      // Try day=1, dte=2digits first
      const d1 = parseInt(combined[0], 10);
      const t1 = parseInt(combined.slice(1), 10);
      const d2 = parseInt(combined.slice(0, 2), 10);
      const t2 = parseInt(combined[2], 10);
      if (t1 >= 1 && t1 <= 60 && d1 >= 1 && d1 <= 31) {
        day = d1; dte = t1;
      } else if (t2 >= 1 && t2 <= 60 && d2 >= 1 && d2 <= 31) {
        day = d2; dte = t2;
      }
    } else if (combined.length === 4) {
      day = parseInt(combined.slice(0, 2), 10);
      dte = parseInt(combined.slice(2), 10);
    }
  }
  
  if (!day || !dte || day < 1 || day > 31 || dte < 1 || dte > 60) return null;
  
  // Determine year: if month is before current month, it's next year
  const now = new Date();
  let year = now.getFullYear();
  if (month < now.getMonth() + 1) year++;
  
  // Build expiry date
  const yyyymmdd = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  
  return { month, day, dte, year, yyyymmdd };
}

/**
 * Parse a single table row into structured option data with ALL fields
 * @param {Array<string>} row - Raw table row cells
 * @returns {object|null} Parsed option data
 */
function parseRow(row) {
  if (!row || row.length < 50) return null;
  
  // Strike cell may contain the strike twice (e.g., "2430024300")
  const rawStrike = row[COL.STRIKE]?.replace(/,/g, '') || '';
  let strike;
  if (/^\d{10}$/.test(rawStrike)) {
    strike = parseFloat(rawStrike.slice(0, 5));
  } else {
    const strikeMatch = rawStrike.match(/^(\d+)/);
    strike = strikeMatch ? parseFloat(strikeMatch[1]) : NaN;
  }
  
  if (!strike || isNaN(strike)) return null;
  
  return {
    strike,
    // ─── CE (Call) side — full data ───
    ce: {
      ltp: num(row[COL.CE_LTP]),
      bid: num(row[COL.CE_BID]),
      ask: num(row[COL.CE_ASK]),
      spread: num(row[COL.CE_SPREAD]),
      theoretical: num(row[COL.CE_THEOR]),
      volume: num(row[COL.CE_VOLUME]) || 0,
      iv: num(row[COL.CE_ASK_IV_PCT]) || num(row[COL.CE_BID_IV_PCT]) || null,
      bid_iv_pct: num(row[COL.CE_BID_IV_PCT]),
      ask_iv_pct: num(row[COL.CE_ASK_IV_PCT]),
      iv_spread: num(row[COL.CE_IV_SPREAD]),
      delta: num(row[COL.CE_DELTA]),
      theta: num(row[COL.CE_THETA]),
      gamma: num(row[COL.CE_GAMMA]),
      vega: num(row[COL.CE_VEGA]),
      rho: num(row[COL.CE_RHO]),
      intrinsic_value: num(row[COL.CE_INTR_VAL]),
      time_value: num(row[COL.CE_TIME_VAL]),
      break_even: num(row[COL.CE_BE]),
      to_break_even_pct: num(row[COL.CE_TO_BE_PCT]),
      bid_pct: num(row[COL.CE_BID_PCT]),
      ask_pct: num(row[COL.CE_ASK_PCT]),
      ann_bid_pct: num(row[COL.CE_ANN_BID_PCT]),
      ann_ask_pct: num(row[COL.CE_ANN_ASK_PCT]),
      distance: num(row[COL.CE_DISTANCE]),
      rel_distance: num(row[COL.CE_REL_DIST]),
    },
    // ─── PE (Put) side — full data ───
    pe: {
      ltp: num(row[COL.PE_LTP]),
      bid: num(row[COL.PE_BID]),
      ask: num(row[COL.PE_ASK]),
      spread: num(row[COL.PE_SPREAD]),
      theoretical: num(row[COL.PE_THEOR]),
      volume: num(row[COL.PE_VOLUME]) || 0,
      iv: num(row[COL.PE_IV]) || num(row[COL.PE_ASK_IV_PCT]) || num(row[COL.PE_BID_IV_PCT]) || null,
      bid_iv_pct: num(row[COL.PE_BID_IV_PCT]),
      ask_iv_pct: num(row[COL.PE_ASK_IV_PCT]),
      iv_spread: num(row[COL.PE_IV_SPREAD]),
      delta: num(row[COL.PE_DELTA]),
      theta: num(row[COL.PE_THETA]),
      gamma: num(row[COL.PE_GAMMA]),
      vega: num(row[COL.PE_VEGA]),
      rho: num(row[COL.PE_RHO]),
      intrinsic_value: num(row[COL.PE_INTR_VAL]),
      time_value: num(row[COL.PE_TIME_VAL]),
      break_even: num(row[COL.PE_BE]),
      to_break_even_pct: num(row[COL.PE_TO_BE_PCT]),
      bid_pct: num(row[COL.PE_BID_PCT]),
      ask_pct: num(row[COL.PE_ASK_PCT]),
      ann_bid_pct: num(row[COL.PE_ANN_BID_PCT]),
      ann_ask_pct: num(row[COL.PE_ANN_ASK_PCT]),
      distance: num(row[COL.PE_DISTANCE]),
      rel_distance: num(row[COL.PE_REL_DIST]),
    },
  };
}

/**
 * Parse the full options chain table
 * Handles expiry group headers to map each option to its expiry
 * Uses the badge DTE from the DOM — never guesses
 * @returns {object} Parsed chain data with ALL fields
 */
export async function parseOptionsChain() {
  // Check cache
  const now = Date.now();
  if (chainCache.data && (now - chainCache.timestamp) < CACHE_TTL) {
    return chainCache.data;
  }
  
  const rawRows = await readRawChainTable();
  if (rawRows.length === 0) {
    throw new Error('Options chain table is empty. Ensure the options chain tab is open and loaded.');
  }
  
  // Parse rows, tracking expiry groups
  const options = [];
  const expiries = [];
  let currentExpiry = null;
  let currentExpiryIndex = -1;
  
  for (const rowData of rawRows) {
    const { cells, badgeDte } = rowData;
    
    // Check if this is an expiry group header (e.g., "August 115 DTE")
    const firstCell = cells[0] || '';
    const expiryGroup = parseExpiryGroup(firstCell, badgeDte);
    
    if (expiryGroup) {
      // New expiry group
      currentExpiry = expiryGroup.yyyymmdd;
      currentExpiryIndex = expiries.length;
      expiries.push(currentExpiry);
      continue;
    }
    
    // Check if this is a data row (has 50+ columns with a strike)
    if (cells.length >= 50) {
      const parsed = parseRow(cells);
      if (parsed) {
        parsed.expiry = currentExpiry || '';
        parsed.expiry_index = currentExpiryIndex;
        options.push(parsed);
      }
    }
  }
  
  const result = {
    options,
    expiries,
    source: 'options_chain_tab',
    timestamp: now,
  };
  
  chainCache = { data: result, timestamp: now };
  return result;
}

/**
 * Get option data for a specific strike
 * @param {Array} options - Parsed options array
 * @param {number} strike - Strike price
 * @returns {object|null} { ce: {...}, pe: {...} }
 */
export function getOptionByStrike(options, strike) {
  return options.find(o => o.strike === strike) || null;
}

/**
 * Get ATM option data
 * @param {Array} options - Parsed options array
 * @param {number} spotPrice - Current spot price
 * @returns {object|null}
 */
export function getATMOption(options, spotPrice) {
  const atmStrike = Math.round(spotPrice / 50) * 50;
  return getOptionByStrike(options, atmStrike);
}

/**
 * Format parsed chain for display (compact summary)
 */
export function formatChainSummary(chainData, spotPrice) {
  if (!chainData || !chainData.options || chainData.options.length === 0) {
    return '  No options chain data available.\n';
  }
  
  const atmStrike = Math.round(spotPrice / 50) * 50;
  
  let output = '';
  output += `  📊 OPTIONS CHAIN (${chainData.expiries.join(', ') || 'NIFTY'})\n`;
  output += `  ────────────────────────\n`;
  output += `  Spot: ${spotPrice} | ATM: ${atmStrike}\n`;
  
  // Show ATM-2 to ATM+2 with key fields
  const strikes = [atmStrike - 100, atmStrike - 50, atmStrike, atmStrike + 50, atmStrike + 100];
  output += `  Strike   CE LTP  CE IV%  CE Δ    CE Vol    PE LTP  PE IV%  PE Δ    PE Vol\n`;
  for (const s of strikes) {
    const opt = getOptionByStrike(chainData.options, s);
    if (opt) {
      output += `  ${String(s).padEnd(7)} `;
      output += `${String(opt.ce.ltp?.toFixed(1) || 'N/A').padEnd(7)} `;
      output += `${String(opt.ce.iv?.toFixed(1) || 'N/A').padEnd(6)} `;
      output += `${String(opt.ce.delta?.toFixed(2) || 'N/A').padEnd(6)} `;
      output += `${String(opt.ce.volume || 0).padEnd(9)} `;
      output += `${String(opt.pe.ltp?.toFixed(1) || 'N/A').padEnd(7)} `;
      output += `${String(opt.pe.iv?.toFixed(1) || 'N/A').padEnd(6)} `;
      output += `${String(opt.pe.delta?.toFixed(2) || 'N/A').padEnd(6)} `;
      output += `${String(opt.pe.volume || 0).padEnd(9)}\n`;
    }
  }
  output += `\n`;
  
  return output;
}