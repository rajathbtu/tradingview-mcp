import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisCache } from '../src/core/cache.js';

test('createAnalysisCache returns a value within its TTL and invalidates after clear', async () => {
  const cache = createAnalysisCache({ ttlMs: 50 });
  const key = 'quote:NIFTY';

  assert.equal(cache.get(key), null);
  cache.set(key, { price: 22000 });
  assert.deepEqual(cache.get(key), { price: 22000 });

  cache.clear();
  assert.equal(cache.get(key), null);
});

test('createAnalysisCache expires entries after their TTL', async () => {
  const cache = createAnalysisCache({ ttlMs: 20 });
  cache.set('ohlcv:summary', { count: 10 });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(cache.get('ohlcv:summary'), null);
});
