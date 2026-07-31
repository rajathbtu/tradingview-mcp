import CDP from 'chrome-remote-interface';
import http from 'node:http';

const list = await new Promise((resolve, reject) => {
  const req = http.get('http://127.0.0.1:9222/json/list', (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => resolve(JSON.parse(data)));
  });
  req.on('error', reject);
});

const target = list.find((t) => t.title && /options chain/i.test(t.title));
if (!target) {
  console.log(JSON.stringify({ success: false, error: 'No options-chain target found' }));
  process.exit(0);
}

const client = await CDP({ host: '127.0.0.1', port: 9222, target: target.id });
await client.Runtime.enable();
await client.Page.enable();
const result = await client.Runtime.evaluate({
  expression: `(() => {
    const text = document.body ? document.body.innerText || '' : '';
    const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const rows = Array.from(document.querySelectorAll('tr'))
      .map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((row) => row && /\d/.test(row) && row.length < 400)
      .slice(0, 20);
    return {
      title: document.title,
      url: window.location.href,
      rowCount: rows.length,
      rows,
      bodyText: text.slice(0, 4000)
    };
  })()`,
  returnByValue: true,
});
console.log(JSON.stringify(result.result.value, null, 2));
await client.close();
