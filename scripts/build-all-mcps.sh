#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
MCP_DIR="$ROOT_DIR/mcp-servers"

# Increase Node memory for heavier builds
export NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=4096}

if [[ ! -d "$MCP_DIR" ]]; then
  echo "MCP servers directory not found: $MCP_DIR" >&2
  exit 1
fi

# Servers to process (dir names under mcp-servers)
SERVERS=(
  "Gmail-MCP-Server"
  "google-calendar-mcp"
  "grocery-list"
  "memory"
  "movies"
  "scheduled-tasks"
  "todoodles"
  "twilio-sms"
)

build_server() {
  local dir="$1"
  local path="$MCP_DIR/$dir"
  if [[ ! -d "$path" ]]; then
    echo "[SKIP] $dir (not found)"
    return 0
  fi

  echo "\n==== Building $dir ===="
  pushd "$path" > /dev/null

  # Prefer npm ci if lock exists
  if [[ -f package-lock.json ]]; then
    npm ci || npm install
  else
    npm install
  fi

  # Determine build script
  if npm run | grep -q " build\b"; then
    npm run build
  elif [[ -f tsconfig.json ]]; then
    npx tsc
  else
    echo "[WARN] No build step detected for $dir"
  fi

  popd > /dev/null
}

for s in "${SERVERS[@]}"; do
  build_server "$s"
done

echo "\nAll MCP servers processed."


