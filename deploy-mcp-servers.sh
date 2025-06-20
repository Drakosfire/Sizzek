#!/bin/bash

# Deploy Updated MCP Servers to LibreChat
# This script copies the Phase 2.1 user-aware MCP servers to LibreChat

set -e

echo "🚀 Deploying Phase 2.1 MCP Servers to LibreChat"
echo "================================================="

# Configuration
LIBRECHAT_PATH="../LibreChat"
SIZZEK_PATH="."

# Check if LibreChat directory exists
if [ ! -d "$LIBRECHAT_PATH" ]; then
    echo "❌ LibreChat directory not found at $LIBRECHAT_PATH"
    echo "Please adjust the LIBRECHAT_PATH variable in this script"
    exit 1
fi

# Create MCP servers directory in LibreChat if it doesn't exist
mkdir -p "$LIBRECHAT_PATH/mcp-servers"

echo "📦 Building MCP Data Package..."
cd "$SIZZEK_PATH/mcp-data"
npm install
npm run build
cd "$SIZZEK_PATH"

echo "🧠 Deploying Memory MCP Server..."
# Copy memory server
cp -r "mcp-servers/memory" "$LIBRECHAT_PATH/mcp-servers/"
echo "   ✅ Memory server copied"

# Build memory server in LibreChat
cd "$LIBRECHAT_PATH/mcp-servers/memory"
npm install
npm run build
cd "$SIZZEK_PATH"

echo "📝 Deploying Todoodles MCP Server..."
# Copy todoodles server
cp -r "mcp-servers/todoodles" "$LIBRECHAT_PATH/mcp-servers/"
echo "   ✅ Todoodles server copied"

# Build todoodles server in LibreChat
cd "$LIBRECHAT_PATH/mcp-servers/todoodles"
npm install
npm run build
cd "$SIZZEK_PATH"

echo "📊 Copying MCP Data Package..."
# Copy the mcp-data package
cp -r "mcp-data" "$LIBRECHAT_PATH/mcp-servers/"
echo "   ✅ MCP data package copied"

echo "⚙️  Deployment Summary:"
echo "   📁 $LIBRECHAT_PATH/mcp-servers/memory (with user isolation)"
echo "   📁 $LIBRECHAT_PATH/mcp-servers/todoodles (with storage abstraction)"
echo "   📁 $LIBRECHAT_PATH/mcp-servers/mcp-data (shared storage layer)"

echo ""
echo "🔧 Next Steps:"
echo "1. Update your LibreChat MCP configuration:"
echo "   memory-server: $LIBRECHAT_PATH/mcp-servers/memory/dist/index.js"
echo "   todoodles-server: $LIBRECHAT_PATH/mcp-servers/todoodles/dist/index.js"
echo ""
echo "2. Set environment variables:"
echo "   MCP_STORAGE_TYPE=mongodb"
echo "   MONGODB_CONNECTION_STRING=mongodb://localhost:27017"
echo ""
echo "3. Restart LibreChat to load updated MCP servers"
echo ""
echo "4. Test user isolation with the MongoDB guide:"
echo "   See MONGODB_TESTING_GUIDE.md for detailed instructions"

echo ""
echo "🎉 Phase 2.1 MCP Servers deployed successfully!" 