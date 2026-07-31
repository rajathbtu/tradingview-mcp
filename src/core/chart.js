/**
 * Core chart control logic.
 */
import { evaluate as _evaluate, evaluateAsync as _evaluateAsync, safeString, requireFinite, getClient as _getClient, getTargetInfo as _getTargetInfo } from '../connection.js';
import { waitForChartReady as _waitForChartReady } from '../wait.js';
import { analysisCache, clearAnalysisCache, makeCacheKey } from './cache.js';
import { openPanel as _openPanel } from './ui.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

function _resolve(deps) {
  return {
    evaluate: deps?.evaluate || _evaluate,
    evaluateAsync: deps?.evaluateAsync || _evaluateAsync,
    waitForChartReady: deps?.waitForChartReady || _waitForChartReady,
    getClient: deps?.getClient || _getClient,
    getTargetInfo: deps?.getTargetInfo || _getTargetInfo,
    openPanel: deps?.openPanel || _openPanel,
  };
}

export async function getState({ _deps } = {}) {
  const cacheKey = makeCacheKey('chart-state', { scope: 'current' });
  const cached = analysisCache.get(cacheKey);
  if (cached) return cached;

  const { evaluate } = _resolve(_deps);
  const state = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = [];
      try {
        var allStudies = chart.getAllStudies();
        studies = allStudies.map(function(s) {
          return { id: s.id, name: s.name || s.title || 'unknown' };
        });
      } catch(e) {}
      return {
        symbol: chart.symbol(),
        resolution: chart.resolution(),
        chartType: chart.chartType(),
        studies: studies,
      };
    })()
  `);
  const result = { success: true, ...state };
  analysisCache.set(cacheKey, result);
  return result;
}

export async function setSymbol({ symbol, _deps }) {
  const { evaluateAsync, waitForChartReady } = _resolve(_deps);
  clearAnalysisCache();
  await evaluateAsync(`
    (function() {
      var chart = ${CHART_API};
      return new Promise(function(resolve) {
        chart.setSymbol(${safeString(symbol)}, {});
        setTimeout(resolve, 500);
      });
    })()
  `);
  const ready = await waitForChartReady(symbol);
  return { success: true, symbol, chart_ready: ready };
}

export async function setTimeframe({ timeframe, _deps }) {
  const { evaluate, waitForChartReady } = _resolve(_deps);
  clearAnalysisCache();
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setResolution(${safeString(timeframe)}, {});
    })()
  `);
  const ready = await waitForChartReady(null, timeframe);
  return { success: true, timeframe, chart_ready: ready };
}

export async function setType({ chart_type, _deps }) {
  const { evaluate } = _resolve(_deps);
  clearAnalysisCache();
  const typeMap = {
    'Bars': 0, 'Candles': 1, 'Line': 2, 'Area': 3,
    'Renko': 4, 'Kagi': 5, 'PointAndFigure': 6, 'LineBreak': 7,
    'HeikinAshi': 8, 'HollowCandles': 9,
  };
  const typeNum = typeMap[chart_type] ?? Number(chart_type);
  if (isNaN(typeNum) || typeNum < 0 || typeNum > 9 || !Number.isInteger(typeNum)) {
    throw new Error(`Unknown chart type: ${chart_type}. Use a name (Candles, Line, etc.) or number (0-9).`);
  }
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setChartType(${typeNum});
    })()
  `);
  return { success: true, chart_type, type_num: typeNum };
}

export async function manageIndicator({ action, indicator, entity_id, inputs: inputsRaw, _deps }) {
  const { evaluate } = _resolve(_deps);
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;

  if (action === 'add') {
    const before = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    clearAnalysisCache();
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.createStudy(${safeString(indicator)}, false, false, []);
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));
    const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    const newIds = (after || []).filter(id => !(before || []).includes(id));
    const entityId = newIds[0] || null;

    // createStudy's inputs argument is unreliable across builds (#249): the
    // study is created with defaults regardless. Apply overrides afterward
    // via the study's own getInputValues/setInputValues, then read back to
    // report what actually took.
    let appliedInputs;
    if (entityId && inputs && Object.keys(inputs).length) {
      const result = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var study = chart.getStudyById(${safeString(entityId)});
          if (!study || typeof study.getInputValues !== 'function') return { error: 'inputs unsupported for this study' };
          var current = study.getInputValues();
          var overrides = ${JSON.stringify(inputs)};
          var applied = {}, unknown = [];
          var byId = {};
          for (var i = 0; i < current.length; i++) byId[current[i].id] = true;
          for (var k in overrides) {
            if (byId[k]) { for (var j = 0; j < current.length; j++) { if (current[j].id === k) current[j].value = overrides[k]; } applied[k] = overrides[k]; }
            else unknown.push(k);
          }
          study.setInputValues(current);
          var after = study.getInputValues();
          var confirmed = {};
          for (var m = 0; m < after.length; m++) { if (applied.hasOwnProperty(after[m].id)) confirmed[after[m].id] = after[m].value; }
          return { confirmed: confirmed, unknown: unknown };
        })()
      `);
      if (result?.error) appliedInputs = { error: result.error };
      else appliedInputs = { applied: result?.confirmed || {}, ...(result?.unknown?.length && { unknown_inputs: result.unknown }) };
    }

    return {
      success: newIds.length > 0,
      action: 'add',
      indicator,
      entity_id: entityId,
      new_study_count: newIds.length,
      ...(appliedInputs && { inputs: appliedInputs }),
    };
  } else if (action === 'remove') {
    if (!entity_id) throw new Error('entity_id required for remove action. Use chart_get_state to find study IDs.');
    clearAnalysisCache();
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.removeEntity(${safeString(entity_id)});
      })()
    `);
    return { success: true, action: 'remove', entity_id };
  } else {
    throw new Error('action must be "add" or "remove"');
  }
}

export async function getVisibleRange({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      return { visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange() };
    })()
  `);
  return { success: true, visible_range: result.visible_range, bars_range: result.bars_range };
}

export async function setVisibleRange({ from, to, _deps }) {
  const { evaluate } = _resolve(_deps);
  const f = requireFinite(from, 'from');
  const t = requireFinite(to, 'to');

  // Ensure enough history is loaded to cover `from`. The chart lazy-loads bars
  // (~300 initially), so without this a multi-year range clamps to whatever is
  // already loaded. Page back via requestMoreData until the earliest loaded bar
  // reaches `from`, the feed runs out, or a guard trips.
  for (let i = 0; i < 25; i++) {
    const state = await evaluate(`(function() {
      var ms = ${CHART_API}._chartWidget.model().mainSeries();
      var b = ms.bars(); var fv = b.valueAt(b.firstIndex());
      var more = true; try { more = ms.requestMoreDataAvailable(); } catch (e) {}
      return { firstTime: fv && fv[0], more: more };
    })()`);
    if (!state || state.firstTime == null || state.firstTime <= f || !state.more) break;
    await evaluate(`(function() { try { ${CHART_API}._chartWidget.model().mainSeries().requestMoreData(1000); } catch (e) {} })()`);
    await new Promise(r => setTimeout(r, 1800));
  }

  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${f} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${t}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await new Promise(r => setTimeout(r, 500));
  const actual = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      try { var r = chart.getVisibleRange(); return { from: r.from || 0, to: r.to || 0 }; }
      catch(e) { return { from: 0, to: 0, error: e.message }; }
    })()
  `);
  return { success: true, requested: { from, to }, actual: actual || { from: 0, to: 0 } };
}

export async function scrollToDate({ date, _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  let timestamp;
  if (/^\d+$/.test(date)) timestamp = Number(date);
  else timestamp = Math.floor(new Date(date).getTime() / 1000);
  if (isNaN(timestamp)) throw new Error(`Could not parse date: ${date}. Use ISO format (2024-01-15) or unix timestamp.`);

  const resolution = await evaluate(`${CHART_API}.resolution()`);
  let secsPerBar = 60;
  const res = String(resolution);
  if (res === 'D' || res === '1D') secsPerBar = 86400;
  else if (res === 'W' || res === '1W') secsPerBar = 604800;
  else if (res === 'M' || res === '1M') secsPerBar = 2592000;
  else { const mins = parseInt(res, 10); if (!isNaN(mins)) secsPerBar = mins * 60; }

  const halfWindow = 25 * secsPerBar;
  const from = timestamp - halfWindow;
  const to = timestamp + halfWindow;

  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${from} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${to}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await new Promise(r => setTimeout(r, 500));
  return { success: true, date, centered_on: timestamp, resolution, window: { from, to } };
}

export async function symbolInfo({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var info = chart.symbolExt();
      return {
        symbol: info.symbol, full_name: info.full_name, exchange: info.exchange,
        description: info.description, type: info.type, pro_name: info.pro_name,
        typespecs: info.typespecs, resolution: chart.resolution(), chart_type: chart.chartType()
      };
    })()
  `);
  return { success: true, ...result };
}

function parseExpiryLabel(match) {
  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const monthIndex = monthMap[String(match[2] || '').toUpperCase()];
  if (typeof monthIndex === 'undefined') return null;
  const date = new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[1])));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export async function extractVisibleOptionChainData({ title, bodyText, html } = {}) {
  const combined = [title, bodyText, html].filter(Boolean).join('\n');
  const symbolMatch = combined.match(/(?:NSE|BSE|MCX|NFO|CBOE|NYSE|NASDAQ)?[:\s-]*([A-Z0-9.-]+)(\d{1,2}[A-Z]{3})(\d{4,6})(CE|PE)/i);
  const fallbackMatch = combined.match(/\b(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY)\b/i);
  const optionTypeMatch = combined.match(/\b(CE|PE)\b/i);
  const expiryMatch = combined.match(/\b(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\b/i);

  const strikeCandidates = [
    combined.match(/\b(CE|PE)\b[^\d]{0,20}\b(\d{3,6})\b/i),
    combined.match(/\b(\d{3,6})\b[^\d]{0,20}\b(CE|PE)\b/i),
    combined.match(/\b(\d{3,6})\b/),
  ].filter(Boolean);

  let strike = null;
  for (const candidate of strikeCandidates) {
    const value = candidate[2] || candidate[1];
    const numeric = Number(value);
    const isYear = candidate[2] && String(candidate[2]).length === 4 && numeric >= 1900 && numeric <= 2100;
    if (!Number.isNaN(numeric) && numeric > 0 && numeric < 100000 && !isYear) {
      strike = String(value);
      break;
    }
  }

  return {
    success: true,
    option_symbol: symbolMatch ? symbolMatch[1] + symbolMatch[2] + symbolMatch[3] + symbolMatch[4] : null,
    underlying: fallbackMatch ? fallbackMatch[1].toUpperCase() : (symbolMatch ? symbolMatch[1].toUpperCase() : null),
    expiry: expiryMatch ? parseExpiryLabel(expiryMatch) : null,
    strike,
    option_type: optionTypeMatch ? optionTypeMatch[1].toUpperCase() : null,
    visible_text: combined.slice(0, 4000),
  };
}

export async function readOptionChainSelection({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      function textOf(node) {
        if (!node) return '';
        if (typeof node.textContent === 'string') return node.textContent;
        return '';
      }
      function visibleText(node) {
        if (!node) return '';
        var text = textOf(node).replace(/\s+/g, ' ').trim();
        if (text) return text;
        var children = node.children || [];
        var acc = '';
        for (var i = 0; i < children.length; i++) {
          acc += visibleText(children[i]);
          if (acc) acc += ' ';
        }
        return acc.replace(/\s+/g, ' ').trim();
      }
      function collectTableRows() {
        var rows = [];
        var tables = Array.from(document.querySelectorAll('table'));
        for (var t = 0; t < tables.length; t++) {
          var table = tables[t];
          var tr = table.querySelectorAll('tr');
          for (var i = 0; i < tr.length; i++) {
            var cells = Array.from(tr[i].querySelectorAll('th, td'))
              .map(function(cell) { return (cell.textContent || '').replace(/\s+/g, ' ').trim(); })
              .filter(function(cell) { return cell.length > 0; });
            if (cells.length > 0) rows.push(cells);
          }
        }
        return rows.slice(0, 80);
      }
      var documentText = [document.title, document.body && document.body.innerText, document.body && document.body.textContent]
        .filter(Boolean)
        .join('\n');
      var html = document.body && document.body.innerHTML ? document.body.innerHTML : '';
      var visibleEntries = Array.from(document.querySelectorAll('div, span, button, a'))
        .map(function(el) { return visibleText(el); })
        .filter(function(text) { return text && text.length > 1; })
        .slice(0, 240);
      return {
        title: document.title,
        url: window.location.href,
        html,
        visible_text: visibleEntries.join(' | '),
        full_text: documentText,
        table_rows: collectTableRows(),
      };
    })()
  `, { context: 'options' });

  const parsed = await extractVisibleOptionChainData({
    title: result?.title,
    bodyText: result?.full_text || result?.visible_text,
    html: result?.html,
  });

  return { success: true, ...result, ...parsed };
}

export async function readVisibleOptionChain({ _deps } = {}) {
  const deps = _resolve(_deps);
  let panelState = { success: true, action: 'open', source: 'target' };

  try {
    const client = await deps.getClient('options');
    let targetId = null;
    if (deps.getTargetInfo) {
      try {
        const targetInfo = await deps.getTargetInfo();
        targetId = targetInfo?.targetId || targetInfo?.id || null;
      } catch {
        // Fall through to the direct-page read path even if Target.getTargetInfo is unavailable.
      }
    }
    panelState = { success: true, action: 'open', source: 'target', targetId };
  } catch (error) {
    try {
      const panelResult = await deps.openPanel({ panel: 'options-chain', action: 'open' });
      panelState = { success: true, action: 'open', source: 'panel', ...(panelResult || {}) };
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch (panelError) {
      panelState = { success: false, error: panelError.message, action: 'open', source: 'panel' };
    }
  }

  const result = await readOptionChainSelection({ _deps });
  return {
    success: true,
    panel: panelState,
    ...result,
  };
}

function normalizeUnderlying(underlying) {
  const rawValue = String(underlying || '').trim();
  if (!rawValue) return { underlying: '', expiry: null };

  const expiryMatch = rawValue.match(/\b(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\b$/i);
  const extractedExpiry = expiryMatch ? `${expiryMatch[1]} ${expiryMatch[2]} ${expiryMatch[3]}` : null;
  const strippedValue = rawValue.replace(/\s+\d{1,2}\s+[A-Z]{3}\s+\d{4}$/i, '').trim();
  const normalizedValue = strippedValue.toUpperCase();
  const match = normalizedValue.match(/^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|[A-Z][A-Z0-9.-]*)/);

  return {
    underlying: match ? match[1] : normalizedValue,
    expiry: extractedExpiry,
  };
}

function normalizeOptionType(optionType) {
  const value = String(optionType || '').trim().toUpperCase();
  if (value === 'CE') return 'CE';
  if (value === 'PE') return 'PE';
  throw new Error(`Unsupported option type: ${optionType}. Use CE/PE.`);
}

function normalizeExpiry(expiry) {
  if (!expiry) throw new Error('Expiry is required.');

  const rawValue = String(expiry).trim();
  const monthMap = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };

  const humanReadableMatch = rawValue.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i);
  if (humanReadableMatch) {
    const [, day, month, year] = humanReadableMatch;
    const monthIndex = monthMap[month.toUpperCase()];
    if (typeof monthIndex === 'undefined') throw new Error(`Invalid expiry: ${expiry}`);
    const date = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
    const dayString = String(date.getUTCDate()).padStart(2, '0');
    const monthString = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
    return {
      iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${dayString}`,
      compact: `${dayString}${monthString}`,
    };
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid expiry: ${expiry}`);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return {
    iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${day}`,
    compact: `${day}${month}`,
  };
}

export async function resolveOptionSymbol({ underlying, expiry, strike, optionType, exchange, _deps }) {
  const underlyingInfo = normalizeUnderlying(underlying);
  const normalizedUnderlying = underlyingInfo.underlying;
  const normalizedOptionTypeInput = String(optionType || '').trim();
  const resolvedExpiry = expiry || underlyingInfo.expiry;

  if (!normalizedUnderlying || !normalizedOptionTypeInput || !resolvedExpiry || typeof strike === 'undefined' || strike === null || String(strike).trim() === '') {
    throw new Error('Option symbol resolution requires explicitly verified underlying, expiry, strike, and option type. Do not guess NIFTY option symbols.');
  }

  const normalizedOptionType = normalizeOptionType(optionType);
  const normalizedExpiry = normalizeExpiry(resolvedExpiry);
  const normalizedStrike = String(strike).trim();

  const underlyingSymbol = normalizedUnderlying === 'NIFTY' ? 'NIFTY' : normalizedUnderlying;
  const symbol = `${exchange ? `${exchange}:` : ''}${underlyingSymbol}${normalizedExpiry.compact}${normalizedStrike}${normalizedOptionType}`;

  return {
    success: true,
    symbol,
    underlying: underlyingSymbol,
    expiry: normalizedExpiry.iso,
    strike: normalizedStrike,
    option_type: normalizedOptionType,
    exchange: exchange || '',
  };
}

export async function symbolSearch({ query, type }) {
  const normalizedQuery = String(query || '').trim();
  const normalizedType = String(type || '').trim().toLowerCase();

  if (normalizedType === 'option' || /\b(?:nifty|banknifty|finnifty|midcpnifty)\b/i.test(normalizedQuery)) {
    return {
      success: false,
      error: 'Do not use symbol_search for NIFTY option symbols. Read the live TradingView options-chain tab and use the visible option symbol from there. Do not guess.',
      query: normalizedQuery,
      source: 'blocked',
      results: [],
      count: 0,
    };
  }

  // Use TradingView's public symbol search REST API (works without auth)
  const params = new URLSearchParams({
    text: query,
    hl: '1',
    exchange: '',
    lang: 'en',
    search_type: type || '',
    domain: 'production',
  });

  const resp = await fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?${params}`, {
    headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' },
  });
  if (!resp.ok) throw new Error(`Symbol search API returned ${resp.status}`);
  const data = await resp.json();

  const strip = s => (s || '').replace(/<\/?em>/g, '');
  const results = (data.symbols || data || []).slice(0, 15).map(r => ({
    symbol: strip(r.symbol),
    description: strip(r.description),
    exchange: r.exchange || r.prefix || '',
    type: r.type || '',
    full_name: r.exchange ? `${r.exchange}:${strip(r.symbol)}` : strip(r.symbol),
  }));

  return { success: true, query, source: 'rest_api', results, count: results.length };
}
