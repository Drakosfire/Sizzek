#!/bin/bash

# Unified Ephemeral Web UI Test Script
# Configurable for local or remote testing

# Usage:
#   ./test-ephemeral-webui-unified.sh local    # Test local infrastructure
#   ./test-ephemeral-webui-unified.sh remote   # Test remote server infrastructure
#   ./test-ephemeral-webui-unified.sh          # Auto-detect based on context

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

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Configuration
MODE="$1"
PORT_RANGE_START=11000
PORT_RANGE_END=12000
REMOTE_SERVER="alan@srv586875"
DOMAIN="sizzek.dungeonmind.net"

# Auto-detect mode if not specified
if [ -z "$MODE" ]; then
    if [ "$(hostname)" = "your-remote-hostname" ]; then  # Replace with actual remote hostname
        MODE="local"
    else
        MODE="remote"
    fi
fi

# Validate mode
if [ "$MODE" != "local" ] && [ "$MODE" != "remote" ]; then
    error "Invalid mode. Use 'local' or 'remote'"
    echo "Usage: $0 [local|remote]"
    exit 1
fi

log "🔍 Ephemeral Web UI Infrastructure Test"
log "Mode: $MODE"
log "Domain: $DOMAIN"
log "Port Range: $PORT_RANGE_START-$PORT_RANGE_END"
if [ "$MODE" = "remote" ]; then
    log "Remote Server: $REMOTE_SERVER"
fi
echo

# Test functions for local mode
test_local_infrastructure() {
    log "Testing Local Infrastructure"
    
    # Check if we're running on the actual server or locally
    local_ip=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")
    log "Local IP: $local_ip"
    
    # Test 1: Check local MCP servers
    log "Test 1: Local MCP Server Status"
    local mcp_servers=("todoodles" "grocery-list" "memory" "movies" "scheduled-tasks" "twilio-sms" "google-calendar-mcp")
    local running_count=0
    
    for server in "${mcp_servers[@]}"; do
        if pgrep -f "$server" > /dev/null 2>&1; then
            success "$server is running locally"
            ((running_count++))
        else
            error "$server is not running locally"
        fi
    done
    
    info "Local MCP servers running: $running_count/${#mcp_servers[@]}"
    echo
    
    # Test 2: Check for ephemeral ports
    log "Test 2: Local Ephemeral Port Status"
    local listening_ports=$(ss -tlnp 2>/dev/null | grep -E ":(1[12][0-9]{3})" | awk '{print $4}' | cut -d: -f2 | sort -n 2>/dev/null || echo "")
    
    if [ -n "$listening_ports" ]; then
        success "Found local ephemeral ports: $listening_ports"
        
        # Test each port
        for port in $listening_ports; do
            log "Testing local port $port..."
            if curl -s --connect-timeout 5 "http://localhost:$port/" > /dev/null 2>&1; then
                success "Port $port responds locally"
            else
                warning "Port $port is listening but not responding"
            fi
        done
    else
        warning "No ephemeral ports listening locally (expected if none created yet)"
    fi
    echo
    
    # Test 3: Check firewall if we're on the server
    log "Test 3: Local Firewall Status"
    if command -v ufw >/dev/null 2>&1; then
        if sudo ufw status 2>/dev/null | grep -q "11000:12000"; then
            success "Firewall allows ephemeral ports"
        else
            error "Firewall does NOT allow ephemeral ports"
            warning "Run: sudo ufw allow 11000:12000/tcp"
        fi
    else
        info "UFW not available or not on server"
    fi
    echo
}

# Test functions for remote mode
test_remote_infrastructure() {
    log "Testing Remote Infrastructure"
    
    # Get remote server IP
    local remote_ip=$(ssh "$REMOTE_SERVER" "curl -s ifconfig.me 2>/dev/null || echo 'unknown'")
    log "Remote Server IP: $remote_ip"
    
    # Test 1: Check remote MCP servers
    log "Test 1: Remote MCP Server Status"
    local mcp_servers=("todoodles" "grocery-list" "memory" "movies" "scheduled-tasks" "twilio-sms" "google-calendar-mcp")
    local running_count=0
    
    for server in "${mcp_servers[@]}"; do
        if ssh "$REMOTE_SERVER" "pgrep -f '$server'" > /dev/null 2>&1; then
            success "$server is running on remote server"
            ((running_count++))
        else
            error "$server is not running on remote server"
        fi
    done
    
    info "Remote MCP servers running: $running_count/${#mcp_servers[@]}"
    echo
    
    # Test 2: Check remote ephemeral ports
    log "Test 2: Remote Ephemeral Port Status"
    local listening_ports=$(ssh "$REMOTE_SERVER" "ss -tlnp 2>/dev/null | grep -E ':(1[12][0-9]{3})' | awk '{print \$4}' | cut -d: -f2 | sort -n" 2>/dev/null || echo "")
    
    if [ -n "$listening_ports" ]; then
        success "Found remote ephemeral ports: $listening_ports"
        
        # Test external accessibility for each port
        for port in $listening_ports; do
            log "Testing external access to port $port..."
            if curl -s --connect-timeout 10 "http://$remote_ip:$port/" > /dev/null 2>&1; then
                success "Port $port is accessible externally"
            else
                error "Port $port is NOT accessible externally"
            fi
        done
    else
        warning "No ephemeral ports listening on remote server (expected if none created yet)"
    fi
    echo
    
    # Test 3: Check remote firewall
    log "Test 3: Remote Firewall Status"
    if ssh "$REMOTE_SERVER" "sudo ufw status 2>/dev/null | grep -q '11000:12000'" 2>/dev/null; then
        success "Remote firewall allows ephemeral ports"
    else
        error "Remote firewall does NOT allow ephemeral ports"
        warning "Run on remote server: sudo ufw allow 11000:12000/tcp"
    fi
    echo
    
    # Test 4: External connectivity
    log "Test 4: External Connectivity Test"
    local test_port=$PORT_RANGE_START
    
    if curl -s --connect-timeout 10 "http://$remote_ip:$test_port/" > /dev/null 2>&1; then
        success "External connectivity to port $test_port works"
    else
        error "External connectivity to port $test_port blocked"
        info "This is expected if no ephemeral server is running on port $test_port"
    fi
    echo
}

# Common tests for both modes
test_dns_and_domain() {
    log "DNS and Domain Testing"
    
    # Test DNS resolution
    if nslookup "$DOMAIN" > /dev/null 2>&1; then
        local resolved_ip=$(nslookup "$DOMAIN" 2>/dev/null | grep -A1 "Name:" | tail -1 | awk '{print $2}' 2>/dev/null || echo "unknown")
        success "Domain $DOMAIN resolves to $resolved_ip"
        
        if [ "$MODE" = "remote" ]; then
            local remote_ip=$(ssh "$REMOTE_SERVER" "curl -s ifconfig.me 2>/dev/null || echo 'unknown'")
            if [ "$resolved_ip" = "$remote_ip" ]; then
                success "DNS points directly to server"
            else
                warning "DNS points to proxy/CDN ($resolved_ip) not server ($remote_ip)"
                info "This is expected if using Cloudflare"
            fi
        fi
    else
        error "Cannot resolve domain $DOMAIN"
    fi
    echo
}

# Main execution
main() {
    case "$MODE" in
        "local")
            test_local_infrastructure
            ;;
        "remote")
            test_remote_infrastructure
            ;;
    esac
    
    test_dns_and_domain
    
    # Summary and recommendations
    log "📊 Test Summary"
    echo "=================================="
    echo "Mode: $MODE"
    echo "Domain: $DOMAIN"
    
    if [ "$MODE" = "remote" ]; then
        echo "Remote Server: $REMOTE_SERVER"
    fi
    
    echo
    log "🎯 Recommendations based on findings:"
    echo
    echo "For testing ephemeral web UIs:"
    echo "  1. Access LibreChat at https://$DOMAIN"
    echo "  2. Use an MCP server that supports web UIs (e.g., todoodles)"
    echo "  3. Request a web interface from the MCP server"
    echo "  4. The MCP server will create an ephemeral web UI on a random port"
    echo "  5. Re-run this test to see the ephemeral server"
    echo
    echo "If external access fails after ephemeral creation:"
    echo "  1. Check firewall: sudo ufw allow 11000:12000/tcp"
    echo "  2. Check cloud provider security groups"
    echo "  3. Verify MCP servers are binding to 0.0.0.0 (not just localhost)"
}

# Run main function
main "$@"
