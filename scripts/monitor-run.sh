#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
nohup node scripts/monitor.js > /tmp/tradingview-monitor.out 2> /tmp/tradingview-monitor.err < /dev/null &
echo $! > /tmp/tradingview-monitor.pid
printf 'Started monitor with pid %s\n' "$!"
printf 'Logs: /tmp/tradingview-monitor.out\n'
printf 'Errors: /tmp/tradingview-monitor.err\n'
