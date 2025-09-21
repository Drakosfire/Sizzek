#!/bin/bash

# Setup secure user and environment for MCP Gateway service
# This creates a dedicated user with minimal privileges

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Setting up secure MCP Gateway user and environment${NC}"
echo "======================================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ This script must be run as root${NC}"
    exit 1
fi

# Configuration
GATEWAY_USER="mcp-gateway"
GATEWAY_HOME="/opt/mcp-gateway"
GATEWAY_LOGS="$GATEWAY_HOME/logs"
PROJECT_DIR="../../External-Endpoint"

echo -e "\n${BLUE}👤 Creating dedicated user: $GATEWAY_USER${NC}"

# Create system user (no login shell, no home directory creation)
if id "$GATEWAY_USER" &>/dev/null; then
    echo "User $GATEWAY_USER already exists"
else
    useradd --system --no-create-home --shell /usr/sbin/nologin "$GATEWAY_USER"
    echo -e "${GREEN}✅ Created system user: $GATEWAY_USER${NC}"
fi

# Add user to docker group for container management
usermod -a -G docker "$GATEWAY_USER"
echo -e "${GREEN}✅ Added $GATEWAY_USER to docker group${NC}"

echo -e "\n${BLUE}📁 Setting up secure directory structure${NC}"

# Create secure gateway directory
mkdir -p "$GATEWAY_HOME" "$GATEWAY_LOGS"

# Copy only necessary files (not the entire project)
echo "Copying docker-compose.yml..."
cp "$PROJECT_DIR/docker-compose.yml" "$GATEWAY_HOME/"

echo "Copying environment files..."
cp "$PROJECT_DIR/.env" "$GATEWAY_HOME/" 2>/dev/null || echo "No .env file found"

# Set strict permissions
chown -R "$GATEWAY_USER:$GATEWAY_USER" "$GATEWAY_HOME"
chmod 750 "$GATEWAY_HOME"
chmod 755 "$GATEWAY_LOGS"
chmod 644 "$GATEWAY_HOME/docker-compose.yml"

echo -e "${GREEN}✅ Created secure directory: $GATEWAY_HOME${NC}"

echo -e "\n${BLUE}📝 Creating service control scripts${NC}"

# Create pre-start script
cat > /usr/local/bin/mcp-gateway-pre-start.sh << 'EOF'
#!/bin/bash
# Pre-start checks for MCP Gateway

set -e

# Check Docker is available
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not available"
    exit 1
fi

# Check MongoDB is reachable
if ! docker exec chat-mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo "❌ MongoDB is not reachable"
    exit 1
fi

# Create log file with proper permissions
touch /opt/mcp-gateway/logs/gateway.log
chown mcp-gateway:mcp-gateway /opt/mcp-gateway/logs/gateway.log

echo "✅ Pre-start checks passed"
EOF

# Create start script
cat > /usr/local/bin/mcp-gateway-start.sh << 'EOF'
#!/bin/bash
# Start MCP Gateway with security restrictions

set -e
cd /opt/mcp-gateway

# Start only the gateway service
exec docker-compose up mcp-gateway 2>&1 | tee logs/gateway.log
EOF

# Create stop script
cat > /usr/local/bin/mcp-gateway-stop.sh << 'EOF'
#!/bin/bash
# Stop MCP Gateway cleanly

set -e
cd /opt/mcp-gateway

# Stop the gateway service
docker-compose stop mcp-gateway
EOF

# Make scripts executable
chmod +x /usr/local/bin/mcp-gateway-*.sh

echo -e "${GREEN}✅ Created service control scripts${NC}"

echo -e "\n${BLUE}🔒 Applying security restrictions${NC}"

# Remove world access to the gateway directory
chmod o-rwx "$GATEWAY_HOME"

# Ensure log directory is writable by gateway user
chmod 755 "$GATEWAY_LOGS"

echo -e "${GREEN}✅ Applied security restrictions${NC}"

echo -e "\n${BLUE}🧪 Testing setup${NC}"

# Test if user can access Docker
if sudo -u "$GATEWAY_USER" docker ps >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Gateway user can access Docker${NC}"
else
    echo -e "${RED}❌ Gateway user cannot access Docker${NC}"
    exit 1
fi

# Test directory permissions
if sudo -u "$GATEWAY_USER" test -r "$GATEWAY_HOME/docker-compose.yml"; then
    echo -e "${GREEN}✅ Gateway user can read configuration${NC}"
else
    echo -e "${RED}❌ Gateway user cannot read configuration${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 Secure gateway user setup completed!${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "  User: $GATEWAY_USER (system user, no login)"
echo "  Home: $GATEWAY_HOME (restricted permissions)"
echo "  Logs: $GATEWAY_LOGS"
echo "  Docker: Member of docker group"
echo ""
echo -e "${BLUE}🔧 Next steps:${NC}"
echo "  1. Install the secure service file"
echo "  2. Test with: sudo systemctl start mcp-gateway"
echo "  3. Monitor with: sudo journalctl -u mcp-gateway -f"
