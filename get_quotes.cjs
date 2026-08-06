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

async function main() {
  const targets = await getTargets();
  const chartTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url || ''));
  
  if (!chartTarget) {
    console.log('Chart target not found');
    return;
  }
  
  // Get TSLA quote
  const tslaQuote = await evalOnTarget(chartTarget.id, `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value();
    var bars = chart._chartWidget.model().mainSeries().bars();
    var last = bars.valueAt(bars.lastIndex());
    var ext = chart.symbolExt();
    return JSON.stringify({
      symbol: chart.symbol(),
      last: last ? last[4] : null,
      open: last ? last[1] : null,
      high: last ? last[2] : null,
      low: last ? last[3] : null,
      volume: last ? last[5] : null,
      description: ext.description,
      exchange: ext.exchange
    });
  })()`);
  console.log('TSLA quote:', tslaQuote);
  
  // Switch back to AAPL
  await evalOnTarget(chartTarget.id, `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value();
    chart.setSymbol('BATS:AAPL', {});
    return 'switched to AAPL';
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  
  // Get AAPL study values
  const aaplStudies = await evalOnTarget(chartTarget.id, `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
    var model = chart.model();
    var sources = model.model().dataSources();
    var results = [];
    for (var si = 0; si < sources.length; si++) {
      var s = sources[si];
      if (!s.metaInfo) continue;
      try {
        var meta = s.metaInfo();
        var name = meta.description || meta.shortDescription || '';
        if (!name) continue;
        var values = {};
        try {
          var dwv = s.dataWindowView();
          if (dwv) {
            var items = dwv.items();
            if (items) {
              for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item._value && item._value !== '∅' && item._title) values[item._title] = item._value;
              }
            }
          }
        } catch(e) {}
        var id = null;
        try { id = s.id ? s.id() : null; } catch(e) {}
        if (Object.keys(values).length > 0) results.push({ id: id, name: name, values: values });
      } catch(e) {}
    }
    return JSON.stringify(results);
  })()`);
  console.log('\nAAPL study values:', aaplStudies);
  
  // Get AAPL quote
  const aaplQuote = await evalOnTarget(chartTarget.id, `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value();
    var bars = chart._chartWidget.model().mainSeries().bars();
    var last = bars.valueAt(bars.lastIndex());
    var ext = chart.symbolExt();
    return JSON.stringify({
      symbol: chart.symbol(),
      last: last ? last[4] : null,
      open: last ? last[1] : null,
      high: last ? last[2] : null,
      low: last ? last[3] : null,
      volume: last ? last[5] : null,
      description: ext.description,
      exchange: ext.exchange
    });
  })()`);
  console.log('\nAAPL quote:', aaplQuote);
}

main().catch(e => console.error('ERROR:', e.message));