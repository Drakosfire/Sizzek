#!/bin/bash

# Install the SECURE MCP Gateway systemd service
# This installs the hardened version with non-root user and security restrictions

set -e

SERVICE_FILE="mcp-gateway-secure.service"
TARGET_SERVICE="mcp-gateway.service"  # Install as mcp-gateway for standard naming
SYSTEMD_PATH="/etc/systemd/system"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔒 Installing SECURE MCP Gateway systemd service${NC}"
echo "=================================================="

# Check if we're running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ This script must be run as root (use sudo)${NC}"
    echo "   sudo $0"
    exit 1
fi

# Check if secure service file exists
if [ ! -f "$SCRIPT_DIR/$SERVICE_FILE" ]; then
    echo -e "${RED}❌ Secure service file not found: $SCRIPT_DIR/$SERVICE_FILE${NC}"
    exit 1
fi

# Check if mcp-gateway user exists (should be created by setup-secure-gateway-user.sh)
if ! id "mcp-gateway" &>/dev/null; then
    echo -e "${RED}❌ User 'mcp-gateway' not found${NC}"
    echo -e "${YELLOW}💡 Please run setup-secure-gateway-user.sh first${NC}"
    exit 1
fi

# Check if secure environment is set up
if [ ! -d "/opt/mcp-gateway" ]; then
    echo -e "${RED}❌ Secure gateway directory not found: /opt/mcp-gateway${NC}"
    echo -e "${YELLOW}💡 Please run setup-secure-gateway-user.sh first${NC}"
    exit 1
fi

# Stop any existing service
echo -e "${YELLOW}🛑 Stopping any existing mcp-gateway service...${NC}"
systemctl stop mcp-gateway 2>/dev/null || true
systemctl disable mcp-gateway 2>/dev/null || true

# Install the secure service file
echo -e "${BLUE}📋 Installing secure service file...${NC}"
cp "$SCRIPT_DIR/$SERVICE_FILE" "$SYSTEMD_PATH/$TARGET_SERVICE"
chmod 644 "$SYSTEMD_PATH/$TARGET_SERVICE"

echo -e "${GREEN}✅ Installed: $SYSTEMD_PATH/$TARGET_SERVICE${NC}"

# Reload systemd to recognize the new service
echo -e "${BLUE}🔄 Reloading systemd...${NC}"
systemctl daemon-reload

# Enable the service (start on boot)
echo -e "${BLUE}✅ Enabling service...${NC}"
systemctl enable mcp-gateway

echo -e "${GREEN}🎉 SECURE MCP Gateway service installed successfully!${NC}"
echo ""
echo -e "${BLUE}🔒 Security Features Enabled:${NC}"
echo "   ✅ Non-root user (mcp-gateway)"
echo "   ✅ Resource limits (512MB RAM, 50% CPU)"
echo "   ✅ Read-only filesystem with specific exceptions"
echo "   ✅ Network access restrictions"
echo "   ✅ System call filtering"
echo "   ✅ Capability restrictions"
echo "   ✅ Namespace isolation"
echo ""
echo -e "${BLUE}🔧 Service Management Commands:${NC}"
echo "   Start service:        sudo systemctl start mcp-gateway"
echo "   Stop service:         sudo systemctl stop mcp-gateway"
echo "   Restart service:      sudo systemctl restart mcp-gateway"
echo "   Check status:         sudo systemctl status mcp-gateway"
echo "   View logs:            sudo journalctl -u mcp-gateway -f"
echo "   Disable auto-start:   sudo systemctl disable mcp-gateway"
echo ""
echo -e "${BLUE}🧪 Test the installation:${NC}"
echo "   sudo systemctl start mcp-gateway"
echo "   sudo systemctl status mcp-gateway"
echo "   curl http://localhost:3082/health"
echo ""
echo -e "${GREEN}💡 The service will now:${NC}"
echo "   ✅ Start automatically when the server boots"
echo "   ✅ Restart automatically if it crashes"
echo "   ✅ Run with minimal security privileges"
echo "   ✅ Be isolated from the rest of the system"
echo "   ✅ Log to system journal (journalctl)"
