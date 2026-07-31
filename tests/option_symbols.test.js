import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOptionSymbol, extractVisibleOptionChainData, readVisibleOptionChain } from '../src/core/chart.js';
import { selectPageTarget } from '../src/connection.js';

describe('option symbol resolution', () => {
  it('creates a deterministic TradingView-compatible option symbol', async () => {
    const result = await resolveOptionSymbol({
      underlying: 'NIFTY',
      expiry: '2026-08-04',
      strike: 24000,
      optionType: 'CE',
      exchange: 'NSE',
    });

    assert.equal(result.success, true);
    assert.equal(result.symbol, 'NSE:NIFTY04AUG24000CE');
    assert.equal(result.expiry, '2026-08-04');
    assert.equal(result.option_type, 'CE');
  });

  it('resolves a NIFTY option symbol from a human-readable expiry label', async () => {
    const result = await resolveOptionSymbol({
      underlying: 'NIFTY 30 JUL 2026',
      expiry: '30 JUL 2026',
      strike: 24000,
      optionType: 'CE',
      exchange: 'NSE',
    });

    assert.equal(result.success, true);
    assert.equal(result.symbol, 'NSE:NIFTY30JUL24000CE');
    assert.equal(result.expiry, '2026-07-30');
    assert.equal(result.underlying, 'NIFTY');
  });

  it('rejects NIFTY option resolution when required verified inputs are missing', async () => {
    await assert.rejects(
      () => resolveOptionSymbol({ underlying: 'NIFTY', expiry: '2026-08-04', strike: 24000 }),
      /explicitly verified/i
    );
  });

  it('rejects unsupported option types', async () => {
    await assert.rejects(
      () => resolveOptionSymbol({ underlying: 'NIFTY', expiry: '2026-08-04', strike: 24000, optionType: 'BOTH' }),
      /Unsupported option type/
    );
  });

  it('prefers the TradingView options page for options-chain context', () => {
    const targets = [
      { id: 'chart', url: 'https://www.tradingview.com/chart/abc123/' },
      { id: 'options', url: 'https://www.tradingview.com/options/chain/' },
      { id: 'other', url: 'https://www.tradingview.com/' },
    ];

    const selected = selectPageTarget(targets, 'options');
    assert.equal(selected?.id, 'options');
  });

  it('prefers an options-chain page when the title signals an options chain', () => {
    const targets = [
      { id: 'chart', url: 'https://www.tradingview.com/chart/abc123/' },
      { id: 'chain', title: 'NIFTY Options Chain — NSE:NIFTY — TradingView', url: 'https://www.tradingview.com/chart/abc123/' },
      { id: 'other', url: 'https://www.tradingview.com/' },
    ];

    const selected = selectPageTarget(targets, 'options');
    assert.equal(selected?.id, 'chain');
  });

  it('does not fall back to a chart page when no options-chain target exists', () => {
    const targets = [
      { id: 'chart', url: 'https://www.tradingview.com/chart/abc123/' },
      { id: 'other', url: 'https://www.tradingview.com/' },
    ];

    const selected = selectPageTarget(targets, 'options');
    assert.equal(selected, null);
  });

  it('extracts visible option-chain data from page text', async () => {
    const result = await extractVisibleOptionChainData({
      title: 'NIFTY 30 JUL 2026 CE',
      bodyText: 'NIFTY 30 JUL 2026 CE 24000 123.45',
      html: '<div>Underlying NIFTY</div><div>Expiry 30 JUL 2026</div><div>Strike 24000</div><div>CE</div>',
    });

    assert.equal(result.success, true);
    assert.equal(result.underlying, 'NIFTY');
    assert.equal(result.expiry, '2026-07-30');
    assert.equal(result.strike, '24000');
    assert.equal(result.option_type, 'CE');
  });

  it('uses the known options-page target instead of falling back to panel UI', async () => {
    let panelOpened = false;
    const result = await readVisibleOptionChain({
      _deps: {
        getClient: async () => ({}) ,
        getTargetInfo: async () => ({ targetId: 'options-target' }),
        openPanel: async () => {
          panelOpened = true;
          return { success: true };
        },
        evaluate: async () => ({
          title: 'NIFTY Options Chain — NSE:NIFTY — TradingView',
          url: 'https://www.tradingview.com/options/chain/',
          html: '<div>Underlying NIFTY</div><div>Expiry 30 JUL 2026</div><div>Strike 24000</div><div>CE</div>',
          visible_text: 'NIFTY 30 JUL 2026 CE 24000 123.45',
        }),
      },
    });

    assert.equal(panelOpened, false);
    assert.equal(result.panel.source, 'target');
    assert.equal(result.panel.targetId, 'options-target');
    assert.equal(result.underlying, 'NIFTY');
  });

  it('returns complete table rows from the visible options-chain page', async () => {
    const result = await readVisibleOptionChain({
      _deps: {
        getClient: async () => ({}),
        getTargetInfo: async () => ({ targetId: 'options-target' }),
        openPanel: async () => ({ success: true }),
        evaluate: async () => ({
          title: 'NIFTY Options Chain — NSE:NIFTY — TradingView',
          url: 'https://www.tradingview.com/options/chain/',
          html: '<table><tr><td>Strike</td><td>CE LTP</td><td>Volume</td></tr><tr><td>24350</td><td>132.40</td><td>1000</td></tr></table>',
          visible_text: 'Strike CE LTP Volume 24350 132.40 1000',
          full_text: 'Strike CE LTP Volume 24350 132.40 1000',
          table_rows: [['Strike', 'CE LTP', 'Volume'], ['24350', '132.40', '1000']],
        }),
      },
    });

    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.table_rows));
    assert.equal(result.table_rows[0][0], 'Strike');
    assert.equal(result.table_rows[1][1], '132.40');
  });
});
