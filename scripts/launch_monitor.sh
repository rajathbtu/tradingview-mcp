#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

./scripts/launch_tv_debug_mac.sh

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found." >&2
  exit 1
fi

node src/server.js > /tmp/tradingview-mcp-server.log 2>&1 &
SERVER_PID=$!

echo "Started MCP server with pid $SERVER_PID"

node scripts/monitor.js

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
