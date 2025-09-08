#!/bin/bash

# MCP Gateway Proxy Server Startup Script
# This script starts the standalone gateway service with proper shutdown handling
#
# Environment Variables:
#   MCP_WEB_UI_PATH - Override the path to mcp-web-ui directory
#                     If not set, the script will search common locations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variable to store gateway PID
GATEWAY_PID=""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Received shutdown signal, cleaning up...${NC}"
    
    if [ ! -z "$GATEWAY_PID" ]; then
        echo -e "${BLUE}🔄 Stopping gateway process ${GATEWAY_PID}...${NC}"
        
        # Try graceful shutdown first
        if kill -TERM $GATEWAY_PID 2>/dev/null; then
            echo -e "${BLUE}⏳ Waiting for graceful shutdown...${NC}"
            
            # Wait up to 10 seconds for graceful shutdown
            for i in {1..10}; do
                if ! kill -0 $GATEWAY_PID 2>/dev/null; then
                    echo -e "${GREEN}✅ Gateway stopped gracefully${NC}"
                    exit 0
                fi
                sleep 1
            done
            
            # Force kill if still running
            echo -e "${YELLOW}⚠️  Graceful shutdown timeout, force killing...${NC}"
            if kill -9 $GATEWAY_PID 2>/dev/null; then
                echo -e "${GREEN}✅ Gateway force stopped${NC}"
            else
                echo -e "${RED}❌ Failed to stop gateway${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  Gateway process not found or already stopped${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No gateway PID recorded${NC}"
    fi
    
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}🚀 Starting MCP Gateway Proxy Server...${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Try multiple possible locations for mcp-web-ui
GATEWAY_DIR=""

# Option 1: Sibling directory (current assumption)
if [ -f "$PROJECT_ROOT/../mcp-web-ui/package.json" ]; then
    GATEWAY_DIR="$PROJECT_ROOT/../mcp-web-ui"
    echo -e "${GREEN}✅ Found mcp-web-ui at: $GATEWAY_DIR${NC}"
fi

# Option 2: Check if mcp-web-ui is in the same directory as Sizzek
if [ -z "$GATEWAY_DIR" ] && [ -f "$PROJECT_ROOT/mcp-web-ui/package.json" ]; then
    GATEWAY_DIR="$PROJECT_ROOT/mcp-web-ui"
    echo -e "${GREEN}✅ Found mcp-web-ui at: $GATEWAY_DIR${NC}"
fi

# Option 3: Check if mcp-web-ui is in the current working directory
if [ -z "$GATEWAY_DIR" ] && [ -f "./mcp-web-ui/package.json" ]; then
    GATEWAY_DIR="$(pwd)/mcp-web-ui"
    echo -e "${GREEN}✅ Found mcp-web-ui at: $GATEWAY_DIR${NC}"
fi

# Option 4: Check if mcp-web-ui is in the parent directory
if [ -z "$GATEWAY_DIR" ] && [ -f "../mcp-web-ui/package.json" ]; then
    GATEWAY_DIR="$(cd .. && pwd)/mcp-web-ui"
    echo -e "${GREEN}✅ Found mcp-web-ui at: $GATEWAY_DIR${NC}"
fi

# If still not found, try to find it in common locations
if [ -z "$GATEWAY_DIR" ]; then
    echo -e "${YELLOW}🔍 Searching for mcp-web-ui in common locations...${NC}"
    
    # Search in parent directories
    SEARCH_DIRS=(
        "$PROJECT_ROOT/../mcp-web-ui"
        "$PROJECT_ROOT/mcp-web-ui"
        "./mcp-web-ui"
        "../mcp-web-ui"
        "/home/alan/projects/mcp-web-ui"
        "/opt/mcp-web-ui"
        "/usr/local/mcp-web-ui"
    )
    
    for dir in "${SEARCH_DIRS[@]}"; do
        if [ -f "$dir/package.json" ]; then
            GATEWAY_DIR="$dir"
            echo -e "${GREEN}✅ Found mcp-web-ui at: $GATEWAY_DIR${NC}"
            break
        fi
    done
fi

# Final check
if [ -z "$GATEWAY_DIR" ] || [ ! -f "$GATEWAY_DIR/package.json" ]; then
    echo -e "${RED}❌ Error: mcp-web-ui directory not found${NC}"
    echo -e "${YELLOW}Searched locations:${NC}"
    echo "  - $PROJECT_ROOT/../mcp-web-ui"
    echo "  - $PROJECT_ROOT/mcp-web-ui"
    echo "  - ./mcp-web-ui"
    echo "  - ../mcp-web-ui"
    echo "  - /home/alan/projects/mcp-web-ui"
    echo "  - /opt/mcp-web-ui"
    echo "  - /usr/local/mcp-web-ui"
    echo ""
    echo -e "${YELLOW}Please ensure mcp-web-ui is installed and accessible${NC}"
    echo -e "${YELLOW}You can also set MCP_WEB_UI_PATH environment variable to specify the path${NC}"
    
    # Check if environment variable is set
    if [ ! -z "$MCP_WEB_UI_PATH" ] && [ -f "$MCP_WEB_UI_PATH/package.json" ]; then
        GATEWAY_DIR="$MCP_WEB_UI_PATH"
        echo -e "${GREEN}✅ Using mcp-web-ui from environment variable: $GATEWAY_DIR${NC}"
    else
        exit 1
    fi
fi

# Change to gateway directory
cd "$GATEWAY_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Installing dependencies...${NC}"
    npm install
fi

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠️  Building gateway...${NC}"
    npm run build
fi

    # Load environment variables
    if [ -f "$GATEWAY_DIR/config/.env.gateway" ]; then
        echo -e "${GREEN}✅ Loading environment from .env.gateway${NC}"
        export $(cat "$GATEWAY_DIR/config/.env.gateway" | grep -v '^#' | xargs)
    else
        echo -e "${YELLOW}⚠️  .env.gateway not found, using defaults${NC}"
        export MCP_GATEWAY_PORT=3082
        export MCP_GATEWAY_HOST=0.0.0.0
        export MCP_GATEWAY_MONGO_URL=mongodb://localhost:27017
        export MCP_GATEWAY_MONGO_DB_NAME=mcp_webui
        export MCP_GATEWAY_JWT_SECRET=default-secret-change-me
        export MCP_GATEWAY_PROXY_PREFIX=/mcp
        export MCP_GATEWAY_ENABLE_LOGGING=true
    fi

# Check if MongoDB is accessible
echo -e "${BLUE}🔍 Checking MongoDB connection...${NC}"
if ! curl -s "http://localhost:27017" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  MongoDB not accessible on localhost:27017${NC}"
    echo "Make sure MongoDB is running and accessible"
fi

# Check if gateway is already running and stop it
echo -e "${BLUE}🔍 Checking if gateway is already running on port ${MCP_GATEWAY_PORT}...${NC}"
if netstat -tlnp 2>/dev/null | grep -q ":${MCP_GATEWAY_PORT}"; then
    echo -e "${YELLOW}⚠️  Gateway already running on port ${MCP_GATEWAY_PORT}, stopping it...${NC}"
    
    # Find and kill the gateway process
    GATEWAY_PID=$(netstat -tlnp 2>/dev/null | grep ":${MCP_GATEWAY_PORT}" | awk '{print $7}' | cut -d'/' -f1)
    if [ ! -z "$GATEWAY_PID" ]; then
        echo -e "${BLUE}🔄 Stopping gateway process ${GATEWAY_PID}...${NC}"
        kill $GATEWAY_PID
        
        # Wait for process to stop
        sleep 2
        
        # Force kill if still running
        if kill -0 $GATEWAY_PID 2>/dev/null; then
            echo -e "${YELLOW}⚠️  Force killing gateway process...${NC}"
            kill -9 $GATEWAY_PID
            sleep 1
        fi
        
        echo -e "${GREEN}✅ Gateway stopped successfully${NC}"
    else
        echo -e "${RED}❌ Could not find gateway process ID${NC}"
    fi
else
    echo -e "${GREEN}✅ No existing gateway found on port ${MCP_GATEWAY_PORT}${NC}"
fi

# Start the gateway
echo -e "${GREEN}✅ Starting gateway on port ${MCP_GATEWAY_PORT}...${NC}"
echo -e "${BLUE}📊 Health check: http://localhost:${MCP_GATEWAY_PORT}/health${NC}"
echo -e "${BLUE}📈 Stats: http://localhost:${MCP_GATEWAY_PORT}/stats${NC}"
echo -e "${BLUE}🔗 Proxy: http://localhost:${MCP_GATEWAY_PORT}${MCP_GATEWAY_PROXY_PREFIX}/:token/...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the gateway${NC}"

# Start the gateway in the background and capture PID
node dist/gateway.js &
GATEWAY_PID=$!

echo -e "${GREEN}✅ Gateway started with PID ${GATEWAY_PID}${NC}"

# Give the gateway a moment to initialize
sleep 2

# Check if the gateway process is still running
if ! kill -0 $GATEWAY_PID 2>/dev/null; then
    echo -e "${RED}❌ Gateway failed to start or crashed immediately${NC}"
    echo -e "${YELLOW}Check the logs above for error details${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Gateway is running successfully${NC}"

# Wait for the gateway process to finish or be interrupted
wait $GATEWAY_PID
GATEWAY_EXIT_CODE=$?

# Clear the PID since the process has ended
GATEWAY_PID=""

# If we get here, the gateway exited normally
if [ $GATEWAY_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Gateway process ended normally${NC}"
else
    echo -e "${YELLOW}⚠️  Gateway process ended with exit code ${GATEWAY_EXIT_CODE}${NC}"
fi
