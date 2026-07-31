const CDP = require('chrome-remote-interface');
const http = require('node:http');
(async () => {
  const list = await new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
  });
  const target = list.find((t) => t.title && /options chain/i.test(t.title));
  if (target == null) {
    console.log(JSON.stringify({ success: false, error: 'No options chain target found' }));
    process.exit(0);
  }
  const client = await CDP({ host: '127.0.0.1', port: 9222, target: target.id });
  await client.Runtime.enable();
  await client.Page.enable();
  const result = await client.Runtime.evaluate({
    expression: `(function () {
      const text = document.body ? (document.body.innerText || '') : '';
      const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
      const relevant = lines.filter((line) => /strike|expiry|ce|pe|call|put|bid|ask|volume|oi|underlying|nifty|nse|series/i.test(line));
      return {
        title: document.title,
        url: window.location.href,
        relevantLines: relevant.slice(0, 220),
        bodyText: text.slice(0, 20000)
      };
    })()`,
    returnByValue: true,
  });
  console.log(JSON.stringify(result.result.value, null, 2));
  await client.close();
})();
