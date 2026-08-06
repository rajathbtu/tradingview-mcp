
const CDP = require('chrome-remote-interface');
const http = require('http');

async function getTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
  });
}

async function evalOnTarget(targetId, expression) {
  const client = await CDP({ host: '127.0.0.1', port: 9222, target: targetId });
  await client.Runtime.enable();
  const result = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  await client.close();
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function readChartData(targetId) {
  const expression = `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value();
    var studies = [];
    try {
      var allStudies = chart.getAllStudies();
      studies = allStudies.map(function(s) { return { id: s.id, name: s.name || s.title || 'unknown' }; });
    } catch(e) {}
    
    // Get study values from the data window
    var studyValues = {};
    try {
      var model = chart._chartWidget.model();
      var sources = model.dataSources();
      for (var i = 0; i < sources.length; i++) {
        var src = sources[i];
        var name = src.metaInfo ? (src.metaInfo.shortName || src.metaInfo.name || '') : '';
        if (name) {
          try {
            var vals = src.rows();
            if (vals && vals.length > 0) {
              var lastRow = vals[vals.length - 1];
              var lastVal = lastRow && lastRow.length > 1 ? lastRow[1] : null;
              studyValues[name] = lastVal;
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
    
    // Get quote data
    var quote = null;
    try {
      var q = chart.quotes();
      if (q) {
        quote = {
          last: q.last ? q.last.value : null,
          open: q.open ? q.open.value : null,
          high: q.high ? q.high.value : null,
          low: q.low ? q.low.value : null,
          volume: q.volume ? q.volume.value : null,
          change: q.change ? q.change.value : null,
          change_pct: q.change_pct ? q.change_pct.value : null
        };
      }
    } catch(e) {}
    
    // Get OHLCV data - last 30 bars
    var bars = [];
    try {
      var m = chart._chartWidget.model();
      var mainSeries = m.mainSeries();
      var barData = mainSeries.bars();
      var startIdx = barData.firstIndex();
      var endIdx = barData.lastIndex();
      var count = Math.min(30, endIdx - startIdx + 1);
      for (var i = endIdx - count + 1; i <= endIdx; i++) {
        var v = barData.valueAt(i);
        if (v) {
          bars.push({t: v[0], o: v[1], h: v[2], l: v[3], c: v[4], v: v[5]});
        }
      }
    } catch(e) {}
    
    return JSON.stringify({
      symbol: chart.symbol(),
      resolution: chart.resolution(),
      studies: studies,
      studyValues: studyValues,
      quote: quote,
      bars: bars
    });
  })()`;
  
  return JSON.parse(await evalOnTarget(targetId, expression));
}

async function readOptionsChain(targetId) {
  const expression = `(function() {
    var tables = document.querySelectorAll('table');
    var allRows = [];
    for (var t = 0; t < tables.length; t++) {
      var trs = tables[t].querySelectorAll('tr');
      for (var r = 0; r < trs.length; r++) {
        var cells = [];
        var tds = trs[r].querySelectorAll('th, td');
        for (var c = 0; c < tds.length; c++) {
          cells.push((tds[c].textContent || '').replace(/\\s+/g, ' ').trim());
        }
        if (cells.length > 0) allRows.push(cells);
      }
    }
    var bodyText = document.body ? document.body.innerText || '' : '';
    var url = window.location.href;
    return JSON.stringify({
      rows: allRows,
      bodyText: bodyText.substring(0, 5000),
      url: url
    });
  })()`;
  
  return JSON.parse(await evalOnTarget(targetId, expression));
}

async function main() {
  const targets = await getTargets();
  const optionsTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/options/i.test(t.url || ''));
  const chartTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url || ''));
  
  console.log('=== TARGETS ===');
  console.log('Options:', optionsTarget ? optionsTarget.id : 'NOT FOUND');
  console.log('Chart:', chartTarget ? chartTarget.id : 'NOT FOUND');
  
  if (chartTarget) {
    console.log('\n=== CHART DATA ===');
    const chart = await readChartData(chartTarget.id);
    console.log(JSON.stringify(chart, null, 2));
  }
  
  if (optionsTarget) {
    console.log('\n=== OPTIONS CHAIN ===');
    const chain = await readOptionsChain(optionsTarget.id);
    console.log('URL:', chain.url);
    console.log('Rows:', chain.rows.length);
    console.log('Body text:');
    console.log(chain.bodyText);
  }
}

main().catch(e => console.error('ERROR:', e.message));