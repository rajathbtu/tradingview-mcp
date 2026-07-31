import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const RSI_THRESHOLD = 35;
const CHECK_INTERVAL_MS = 30000;
const TRIGGER_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'analysis_trigger.md');
const MIN_STUDIES = 2;
const MIN_TRIGGER_SCORE = 2;

function logStatus(message) {
  process.stderr.write(`[monitor] ${message}\n`);
}

function writeTriggerFile(payload) {
  const timestamp = new Date().toISOString();
  const body = [
    `# Analysis Trigger`,
    '',
    `- Timestamp: ${timestamp}`,
    '- Indicator Data:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '',
    'I have reached an entry condition. Please perform a full chart analysis, check volume, and provide a Go/No-Go recommendation.',
    '',
  ].join('\n');

  fs.writeFileSync(TRIGGER_FILE, body, 'utf8');
  logStatus(`Wrote trigger file: ${TRIGGER_FILE}`);
}

export function parseStudyValues(result) {
  if (!result?.content?.length) {
    return [];
  }

  const textItem = result.content.find((item) => item.type === 'text');
  if (!textItem?.text) {
    return [];
  }

  try {
    const parsed = JSON.parse(textItem.text);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.studies)) {
        return parsed.studies;
      }
      if (Array.isArray(parsed.values)) {
        return parsed.values;
      }
      return [parsed];
    }

    return [];
  } catch {
    return [];
  }
}

function findNumericValueByKey(value, pattern) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue === 'number' && pattern.test(key)) {
      return nestedValue;
    }

    if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
      const nestedResult = findNumericValueByKey(nestedValue, pattern);
      if (nestedResult !== null) {
        return nestedResult;
      }
    }
  }

  return null;
}

export function getRsiValue(values) {
  for (const value of values) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const directValue = findNumericValueByKey(value, /rsi/i);
    if (directValue !== null) {
      return directValue;
    }

    if (value.values && typeof value.values === 'object') {
      const nestedValue = findNumericValueByKey(value.values, /rsi/i);
      if (nestedValue !== null) {
        return nestedValue;
      }
    }
  }

  return null;
}

function getStudyValue(values, pattern) {
  for (const value of values) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const directValue = findNumericValueByKey(value, pattern);
    if (directValue !== null) {
      return directValue;
    }

    if (value.values && typeof value.values === 'object') {
      const nestedValue = findNumericValueByKey(value.values, pattern);
      if (nestedValue !== null) {
        return nestedValue;
      }
    }
  }

  return null;
}

function evaluateTriggerConditions(values) {
  const rsiValue = getRsiValue(values);
  const macdValue = getStudyValue(values, /macd/i);
  const volumeValue = getStudyValue(values, /volume/i);
  const emaValue = getStudyValue(values, /ema/i);

  const conditions = [];

  if (rsiValue !== null) {
    conditions.push({ name: 'rsi_oversold', passed: rsiValue < RSI_THRESHOLD, value: rsiValue });
  }
  if (macdValue !== null) {
    conditions.push({ name: 'macd_signal', passed: macdValue < 0, value: macdValue });
  }
  if (volumeValue !== null) {
    conditions.push({ name: 'volume_spike', passed: volumeValue > 0, value: volumeValue });
  }
  if (emaValue !== null) {
    conditions.push({ name: 'ema_alignment', passed: emaValue > 0, value: emaValue });
  }

  const passedCount = conditions.filter((condition) => condition.passed).length;
  const triggered = values.length >= MIN_STUDIES && passedCount >= MIN_TRIGGER_SCORE;

  return { triggered, passedCount, conditions, rsiValue, macdValue, volumeValue, emaValue };
}

async function connectToServer() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.js')],
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    stderr: 'pipe',
  });

  const client = new Client({ name: 'tradingview-monitor', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

async function pollOnce(client) {
  const result = await client.callTool({
    name: 'data_get_study_values',
    arguments: {},
  });

  const values = parseStudyValues(result);
  const triggerStatus = evaluateTriggerConditions(values);

  const snapshot = {
    timestamp: new Date().toISOString(),
    threshold: RSI_THRESHOLD,
    rsiValue: triggerStatus.rsiValue,
    macdValue: triggerStatus.macdValue,
    volumeValue: triggerStatus.volumeValue,
    emaValue: triggerStatus.emaValue,
    studies: values,
    conditions: triggerStatus.conditions,
    passedCount: triggerStatus.passedCount,
    triggered: triggerStatus.triggered,
  };

  if (triggerStatus.triggered) {
    logStatus(`TRIGGERED: ${triggerStatus.passedCount}/${triggerStatus.conditions.length} conditions satisfied (studies=${values.length})`);
    writeTriggerFile(snapshot);
    return true;
  }

  logStatus(`Monitoring: RSI=${triggerStatus.rsiValue ?? 'n/a'} | score=${triggerStatus.passedCount}/${triggerStatus.conditions.length} | studies=${values.length}`);
  return false;
}

async function main() {
  logStatus('Connecting to TradingView MCP server...');

  let client;
  let transport;

  try {
    ({ client, transport } = await connectToServer());
    logStatus('Connected. Monitoring loop started.');
  } catch (error) {
    logStatus(`Connection failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const loop = async () => {
    try {
      await pollOnce(client);
    } catch (error) {
      logStatus(`Polling failed: ${error.message}`);
    }
  };

  await loop();

  const intervalId = setInterval(loop, CHECK_INTERVAL_MS);
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    void transport.close().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(intervalId);
    void transport.close().catch(() => {});
    process.exit(0);
  });
}

main().catch((error) => {
  logStatus(`Fatal error: ${error.message}`);
  process.exitCode = 1;
});
