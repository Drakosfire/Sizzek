#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
MCP_DIR="$ROOT_DIR/mcp-servers"
CONFIG_DIR="$ROOT_DIR/config"

# Increase Node memory for heavier builds
export NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=4096}

if [[ ! -d "$MCP_DIR" ]]; then
  echo "MCP servers directory not found: $MCP_DIR" >&2
  exit 1
fi

# Servers to process (dir names under mcp-servers)
SERVERS=(  
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

  # Install dependencies (prefer ci, fallback to install)
  if [[ -f package-lock.json ]]; then
    if npm ci; then
      echo "[INFO] Dependencies installed with npm ci"
    else
      echo "[INFO] npm ci failed, trying npm install..."
      npm install --include=dev
    fi
  else
    npm install --include=dev
  fi

  # Quick sanity check for known invalid deps
  if grep -q '"mcp-data"\s*:\s*"mcp-data"' package.json 2>/dev/null; then
    echo "[WARN] $dir has invalid dependency entry mcp-data@mcp-data. Please set to a valid version or file:path."
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

echo "Installing and building all MCP servers..."
for s in "${SERVERS[@]}"; do
  build_server "$s"
done

echo "\nAll MCP servers processed."

# Verify unified environment configuration
echo "\n==== Verifying Environment Configuration ===="
if [[ -f "$CONFIG_DIR/.env.sizzek" ]]; then
  echo "✅ Found unified .env.sizzek configuration"
  
  # Check for required common variables
  if grep -q "MONGO_URI" "$CONFIG_DIR/.env.sizzek"; then
    echo "✅ MongoDB connection string configured"
  else
    echo "⚠️  WARNING: MONGO_URI not found in .env.sizzek"
  fi
  
  if grep -q "MCP_STORAGE_TYPE" "$CONFIG_DIR/.env.sizzek"; then
    echo "✅ MCP storage type configured"
  else
    echo "⚠️  WARNING: MCP_STORAGE_TYPE not found in .env.sizzek"
  fi
else
  echo "❌ ERROR: Unified .env.sizzek not found at $CONFIG_DIR/.env.sizzek"
  echo "   Please create the unified configuration file with common MCP server variables"
  exit 1
fi

# Deploy centralized environment configurations (if remote deployment script exists)
echo "\n==== Deploying Environment Configurations ===="
if [[ -f "$ROOT_DIR/ci-cd/deploy-mcp-envs.sh" ]]; then
  echo "Running centralized environment deployment..."
  bash "$ROOT_DIR/ci-cd/deploy-mcp-envs.sh"
else
  echo "[INFO] deploy-mcp-envs.sh not found. Skipping remote environment deployment."
  echo "[INFO] MCP servers will use local .env.sizzek configuration"
fi

echo "\n✅ MCP server build and configuration verification complete!"
echo "   All servers now load from unified .env.sizzek configuration"


