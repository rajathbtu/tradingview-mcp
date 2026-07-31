import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStudyValues, getRsiValue } from '../scripts/monitor.js';

test('parseStudyValues unwraps the MCP payload shape returned by data_get_study_values', () => {
  const payload = {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        study_count: 1,
        studies: [{ name: 'RSI', values: { RSI: 24 } }],
      }),
    }],
  };

  assert.deepEqual(parseStudyValues(payload), [{ name: 'RSI', values: { RSI: 24 } }]);
});

test('getRsiValue finds RSI values nested inside study objects', () => {
  const studies = [{ name: 'RSI', values: { RSI: 24 } }];
  assert.equal(getRsiValue(studies), 24);
});
