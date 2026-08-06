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
  const optionsTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/options/i.test(t.url || ''));
  const chartTarget = targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url || ''));
  
  console.log('Options target:', optionsTarget ? optionsTarget.id : 'NOT FOUND');
  console.log('Chart target:', chartTarget ? chartTarget.id : 'NOT FOUND');
  
  // Change chart symbol to TSLA
  if (chartTarget) {
    console.log('\n=== CHANGING CHART TO TSLA ===');
    const result = await evalOnTarget(chartTarget.id, `(function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value();
      chart.setSymbol('BATS:TSLA', {});
      return 'chart symbol set to TSLA';
    })()`);
    console.log(result);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Change options chain to TSLA
  if (optionsTarget) {
    console.log('\n=== CHANGING OPTIONS CHAIN TO TSLA ===');
    const result = await evalOnTarget(optionsTarget.id, `(function() {
      // Navigate to TSLA options chain
      window.location.href = 'https://www.tradingview.com/options/chain/?symbol=NASDAQ%3ATSLA';
      return 'navigating to TSLA options';
    })()`);
    console.log(result);
    await new Promise(r => setTimeout(r, 5000));
  }
  
  // Read back the new state
  const newTargets = await getTargets();
  const newOptionsTarget = newTargets.find(t => t.type === 'page' && /tradingview\.com\/options/i.test(t.url || ''));
  const newChartTarget = newTargets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url || ''));
  
  if (newChartTarget) {
    const chartState = await evalOnTarget(newChartTarget.id, `(function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value();
      return JSON.stringify({symbol: chart.symbol(), resolution: chart.resolution()});
    })()`);
    console.log('\nChart state:', chartState);
  }
  
  if (newOptionsTarget) {
    console.log('\nOptions URL:', newOptionsTarget.url);
  }
}

main().catch(e => console.error('ERROR:', e.message));