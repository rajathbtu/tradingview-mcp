const CDP = require('chrome-remote-interface');
const http = require('http');

async function main() {
  const list = await new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
  });

  const target = list.find((t) => t.title && t.title.includes('Options Chain'));
  if (!target) { console.log(JSON.stringify({error: 'NO TARGET'})); return; }
  console.log('TARGET_FOUND:', target.id, target.url);

  const client = await CDP({ host: '127.0.0.1', port: 9222, target: target.id });
  await client.Runtime.enable();
  await client.Page.enable();

  // Wait for page to render
  await new Promise(r => setTimeout(r, 3000));

  // Get full document HTML
  const html = await client.Runtime.evaluate({
    expression: 'document.documentElement.outerHTML',
    returnByValue: true,
  });
  
  const text = html.result.value;
  console.log('HTML_LENGTH:', text.length);
  console.log('HTML_START:', text.substring(0, 3000));
  
  // Also try to get innerText
  const bodyText = await client.Runtime.evaluate({
    expression: 'document.body ? document.body.innerText || "" : ""',
    returnByValue: true,
  });
  console.log('BODY_TEXT_LENGTH:', bodyText.result.value?.length);
  console.log('BODY_TEXT:', bodyText.result.value?.substring(0, 5000));
  
  await client.close();
}
main().catch(e => console.error('ERROR:', e.message));