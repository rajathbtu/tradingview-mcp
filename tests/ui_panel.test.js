import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPanelSelectors } from '../src/core/ui.js';

describe('panel selector helpers', () => {
  it('builds selector candidates for the options-chain panel', () => {
    const selectors = buildPanelSelectors('options-chain');
    const flattened = selectors.join(' ').toLowerCase();

    assert.match(flattened, /option/);
    assert.match(flattened, /chain/);
    assert.doesNotMatch(flattened, /\bbutton\b/);
    assert.doesNotMatch(flattened, /role="tab"/);
    assert.doesNotMatch(flattened, /role="button"/);
  });
});
