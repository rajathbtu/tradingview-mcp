import CDP from 'chrome-remote-interface';

const response = await fetch('http://127.0.0.1:9222/json/list');
const targets = await response.json();
for (const t of targets.filter(t => t.type === 'page')) {
  if (\!/tradingview/i.test(t.url) || /about:blank/i.test(t.url)) continue;
  try {
    const client = await CDP({ host: '127.0.0.1', port: 9222, target: t.id });
    await client.Runtime.enable();
    const res = await client.Runtime.evaluate({
      expression: `(() => {
        try {
          const candidates = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a, [data-name], [aria-label]'));
          const matches = [];
          for (const el of candidates) {
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            const aria = el.getAttribute('aria-label') || '';
            const dataName = el.getAttribute('data-name') || '';
            const title = el.getAttribute('title') || '';
            const s = [txt, aria, dataName, title].filter(Boolean).join(' | ');
            if (s && /option|chain|trade|widget|watchlist|alert|panel|book|market|order/i.test(s)) {
              const rect = el.getBoundingClientRect();
              matches.push({ text: s.substring(0, 220), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), tag: el.tagName.toLowerCase() });
            }
          }
          return { title: document.title, url: location.href, matches: matches.slice(0, 300) };
        } catch (e) { return { error: e.message }; }
      })()`,
      returnByValue: true,
    });
    console.log('---');
    console.log(t.title, t.url);
    console.log(JSON.stringify(res.result.value, null, 2));
    await client.close();
  } catch (e) {
    console.log('ERR', e.message);
  }
}
