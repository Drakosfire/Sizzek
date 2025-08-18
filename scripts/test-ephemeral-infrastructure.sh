#!/bin/bash

# Test Ephemeral Web UI Infrastructure
# Comprehensive testing script for ephemeral web UI setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
PORT_RANGE_START=11000
PORT_RANGE_END=12000
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")
DOMAIN="sizzek.dungeonmind.net"

log "🔍 Testing Ephemeral Web UI Infrastructure"
log "Server IP: $SERVER_IP"
log "Domain: $DOMAIN"
log "Port Range: $PORT_RANGE_START-$PORT_RANGE_END"
echo

# Test 1: Check if MCP servers are running
log "Test 1: MCP Server Status"
mcp_servers=("todoodles" "grocery-list" "memory" "movies" "scheduled-tasks" "twilio-sms" "google-calendar-mcp")
running_count=0

for server in "${mcp_servers[@]}"; do
    if pgrep -f "$server" > /dev/null; then
        success "$server is running"
        ((running_count++))
    else
        error "$server is not running"
    fi
done

if [ $running_count -eq ${#mcp_servers[@]} ]; then
    success "All MCP servers are running"
else
    warning "Only $running_count/${#mcp_servers[@]} MCP servers are running"
fi
echo

# Test 2: Check if ephemeral ports are listening
log "Test 2: Ephemeral Port Status"
listening_ports=$(ss -tlnp 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | awk '{print $4}' | cut -d: -f2 | sort -n)

if [ -n "$listening_ports" ]; then
    success "Found listening ephemeral ports: $listening_ports"
else
    error "No ephemeral ports are currently listening"
fi
echo

# Test 3: Test local port accessibility
log "Test 3: Local Port Accessibility"
test_port=$PORT_RANGE_START
if curl -s --connect-timeout 5 "http://localhost:$test_port/health" > /dev/null 2>&1; then
    success "Port $test_port is accessible locally"
else
    error "Port $test_port is not accessible locally"
fi
echo

# Test 4: Check firewall status (if possible)
log "Test 4: Firewall Status"
if command -v ufw >/dev/null 2>&1; then
    if sudo ufw status | grep -q "11000:12000"; then
        success "Firewall rule for ephemeral ports is active"
    else
        error "Firewall rule for ephemeral ports is NOT active"
        warning "Run: sudo ufw allow 11000:12000/tcp"
    fi
else
    warning "UFW not available, cannot check firewall status"
fi
echo

# Test 5: Test external accessibility
log "Test 5: External Port Accessibility"
if [ "$SERVER_IP" != "unknown" ]; then
    if curl -s --connect-timeout 10 "http://$SERVER_IP:$test_port/health" > /dev/null 2>&1; then
        success "Port $test_port is accessible externally via IP"
    else
        error "Port $test_port is NOT accessible externally via IP"
    fi
else
    warning "Cannot determine server IP for external testing"
fi
echo

# Test 6: DNS resolution
log "Test 6: DNS Resolution"
if nslookup "$DOMAIN" > /dev/null 2>&1; then
    resolved_ip=$(nslookup "$DOMAIN" | grep -A1 "Name:" | tail -1 | awk '{print $2}')
    success "Domain $DOMAIN resolves to $resolved_ip"
    
    if [ "$resolved_ip" = "$SERVER_IP" ]; then
        success "DNS resolution matches server IP"
    else
        warning "DNS resolution ($resolved_ip) doesn't match server IP ($SERVER_IP)"
    fi
else
    error "Cannot resolve domain $DOMAIN"
fi
echo

# Test 7: Test ephemeral URL structure
log "Test 7: Ephemeral URL Structure Test"
test_url="https://$DOMAIN:$test_port/health"
log "Testing URL: $test_url"

if curl -s --connect-timeout 10 "$test_url" > /dev/null 2>&1; then
    success "Ephemeral URL is accessible"
else
    error "Ephemeral URL is NOT accessible"
    warning "This is expected if no ephemeral server is running on port $test_port"
fi
echo

# Test 8: Check MCP server environment configuration
log "Test 8: MCP Server Environment Configuration"
env_files=("todoodles/.env" "grocery-list/.env" "memory/.env" "movies/.env")

for env_file in "${env_files[@]}"; do
    if [ -f "$env_file" ]; then
        if grep -q "MCP_WEB_UI_PORT_MIN=11000" "$env_file" && grep -q "MCP_WEB_UI_PORT_MAX=12000" "$env_file"; then
            success "$env_file has correct port range configuration"
        else
            error "$env_file missing or incorrect port range configuration"
        fi
        
        if grep -q "MCP_WEB_UI_BASE_URL=sizzek.dungeonmind.net" "$env_file"; then
            success "$env_file has correct base URL configuration"
        else
            error "$env_file missing or incorrect base URL configuration"
        fi
    else
        error "$env_file not found"
    fi
done
echo

# Test 9: Check for ephemeral web UI package version
log "Test 9: MCP Web UI Package Version"
for server in "${mcp_servers[@]}"; do
    if [ -f "$server/package.json" ]; then
        version=$(grep -o '"mcp-web-ui": "[^"]*"' "$server/package.json" | cut -d'"' -f4)
        if [ "$version" = "^1.1.0" ]; then
            success "$server has correct mcp-web-ui version: $version"
        else
            error "$server has incorrect mcp-web-ui version: $version (expected ^1.1.0)"
        fi
    else
        error "$server package.json not found"
    fi
done
echo

# Summary
log "📊 Infrastructure Test Summary"
echo "=================================="
echo "MCP Servers Running: $running_count/${#mcp_servers[@]}"
echo "Ephemeral Ports Listening: $(echo "$listening_ports" | wc -w)"
echo "Local Port Access: $(curl -s --connect-timeout 5 "http://localhost:$test_port/health" > /dev/null 2>&1 && echo "✅" || echo "❌")"
echo "External Port Access: $(curl -s --connect-timeout 10 "http://$SERVER_IP:$test_port/health" > /dev/null 2>&1 && echo "✅" || echo "❌")"
echo "DNS Resolution: $(nslookup "$DOMAIN" > /dev/null 2>&1 && echo "✅" || echo "❌")"
echo "Ephemeral URL Access: $(curl -s --connect-timeout 10 "https://$DOMAIN:$test_port/health" > /dev/null 2>&1 && echo "✅" || echo "❌")"

log "🎯 Next Steps:"
if [ $running_count -lt ${#mcp_servers[@]} ]; then
    echo "  1. Start missing MCP servers"
fi
if [ -z "$listening_ports" ]; then
    echo "  2. Trigger ephemeral web UI creation by using MCP servers"
fi
if ! curl -s --connect-timeout 5 "http://localhost:$test_port/health" > /dev/null 2>&1; then
    echo "  3. Verify ephemeral web UI servers are binding to correct ports"
fi
if ! curl -s --connect-timeout 10 "http://$SERVER_IP:$test_port/health" > /dev/null 2>&1; then
    echo "  4. Check firewall configuration: sudo ufw allow 11000:12000/tcp"
fi
