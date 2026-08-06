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
    // Also get the spot price and expiry info
    var bodyText = document.body ? document.body.innerText || '' : '';
    var spotMatch = bodyText.match(/AAPL\\s*([\\d.]+)\\s*USD/);
    var spot = spotMatch ? parseFloat(spotMatch[1]) : null;
    var expiryMatch = bodyText.match(/([A-Z][a-z]+ \\d+)\\s*\\n\\s*(\\d+) DTE/);
    return JSON.stringify({
      rows: allRows,
      spot: spot,
      expiry: expiryMatch ? expiryMatch[1] + ' (' + expiryMatch[2] + ' DTE)' : null,
      bodyText: bodyText.substring(0, 2000)
    });
  })()`;
  
  return JSON.parse(await evalOnTarget(targetId, expression));
}

async function readChartData(targetId) {
  const expression = `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value();
    var studies = [];
    try {
      var allStudies = chart.getAllStudies();
      studies = allStudies.map(function(s) { return { id: s.id, name: s.name || s.title || 'unknown' }; });
    } catch(e) {}
    return JSON.stringify({
      symbol: chart.symbol(),
      resolution: chart.resolution(),
      studies: studies
    });
  })()`;
  
  return JSON.parse(await evalOnTarget(targetId, expression));
}

async function main() {
  const targets = await getTargets();
  
  // Find options chain target
  const optionsTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/options/i.test(t.url || ''));
  // Find chart target
  const chartTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url || ''));
  
  console.log('=== TARGETS ===');
  console.log('Options target:', optionsTarget ? optionsTarget.id : 'NOT FOUND');
  console.log('Chart target:', chartTarget ? chartTarget.id : 'NOT FOUND');
  
  if (optionsTarget) {
    console.log('\n=== OPTIONS CHAIN ===');
    const chain = await readOptionsChain(optionsTarget.id);
    console.log('Spot:', chain.spot);
    console.log('Expiry:', chain.expiry);
    console.log('Table rows:', chain.rows.length);
    
    // Print all rows with data
    for (let i = 0; i < chain.rows.length; i++) {
      const row = chain.rows[i];
      if (row.length > 0 && row.some(c => c && c.length > 0)) {
        console.log('Row', i, ':', JSON.stringify(row));
      }
    }
  }
  
  if (chartTarget) {
    console.log('\n=== CHART ===');
    const chart = await readChartData(chartTarget.id);
    console.log(JSON.stringify(chart, null, 2));
  }
}

main().catch(e => console.error('ERROR:', e.message));