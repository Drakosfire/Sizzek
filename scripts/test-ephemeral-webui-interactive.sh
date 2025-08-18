#!/bin/bash

# Interactive Ephemeral Web UI Test Script
# Guides user through triggering and testing ephemeral web UIs

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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
    echo -e "${CYAN}ℹ️  $1${NC}"
}

prompt() {
    echo -e "${BOLD}${YELLOW}👉 $1${NC}"
}

header() {
    echo -e "${BOLD}${BLUE}$1${NC}"
}

# Configuration
MODE="$1"
PORT_RANGE_START=11000
PORT_RANGE_END=12000
REMOTE_SERVER="alan@srv586875"
DOMAIN="sizzek.dungeonmind.net"

# Auto-detect mode if not specified
if [ -z "$MODE" ]; then
    if ssh "$REMOTE_SERVER" "echo 'test'" > /dev/null 2>&1; then
        MODE="remote"
    else
        MODE="local"
    fi
fi

# Function to extract port and token from URL
parse_ephemeral_url() {
    local url="$1"
    
    # Extract port using regex
    if [[ $url =~ :([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo ""
    fi
}

# Function to test ephemeral URL
test_ephemeral_url() {
    local url="$1"
    local port=$(parse_ephemeral_url "$url")
    
    if [ -z "$port" ]; then
        error "Could not extract port from URL: $url"
        return 1
    fi
    
    log "Testing ephemeral URL: $url"
    log "Extracted port: $port"
    
    # Test 1: Check if port is in expected range
    if [ "$port" -ge $PORT_RANGE_START ] && [ "$port" -le $PORT_RANGE_END ]; then
        success "Port $port is in expected range ($PORT_RANGE_START-$PORT_RANGE_END)"
    else
        warning "Port $port is outside expected range ($PORT_RANGE_START-$PORT_RANGE_END)"
    fi
    
    # Test 2: Check if port is listening
    if [ "$MODE" = "local" ]; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            success "Port $port is listening locally"
        else
            error "Port $port is NOT listening locally"
            return 1
        fi
    else
        if ssh "$REMOTE_SERVER" "ss -tlnp 2>/dev/null | grep -q ':$port '" 2>/dev/null; then
            success "Port $port is listening on remote server"
        else
            error "Port $port is NOT listening on remote server"
            return 1
        fi
    fi
    
    # Test 3: Test local access
    log "Testing local access to ephemeral server..."
    local test_command
    if [ "$MODE" = "local" ]; then
        test_command="curl -s --connect-timeout 10 '$url'"
    else
        test_command="ssh '$REMOTE_SERVER' \"curl -s --connect-timeout 10 '$url'\""
    fi
    
    if eval "$test_command" > /dev/null 2>&1; then
        success "Ephemeral URL responds to local access"
    else
        error "Ephemeral URL does NOT respond to local access"
        return 1
    fi
    
    # Test 4: Test external access (if remote mode)
    if [ "$MODE" = "remote" ]; then
        log "Testing external access to ephemeral server..."
        if curl -s --connect-timeout 15 "$url" > /dev/null 2>&1; then
            success "Ephemeral URL is accessible externally!"
            success "🎉 EPHEMERAL WEB UI IS WORKING! 🎉"
        else
            error "Ephemeral URL is NOT accessible externally"
            warning "This indicates a firewall or network configuration issue"
            
            # Additional diagnostics
            local remote_ip
            if [ "$MODE" = "remote" ]; then
                remote_ip=$(ssh "$REMOTE_SERVER" "curl -s ifconfig.me 2>/dev/null || echo 'unknown'")
                log "Trying direct IP access: http://$remote_ip:$port/"
                if curl -s --connect-timeout 10 "http://$remote_ip:$port/" > /dev/null 2>&1; then
                    warning "Direct IP access works, but domain access doesn't (DNS/proxy issue)"
                else
                    error "Direct IP access also fails (firewall/binding issue)"
                fi
            fi
        fi
    fi
    
    return 0
}

# Function to guide user through ephemeral creation
guide_ephemeral_creation() {
    header "🚀 Ephemeral Web UI Creation Guide"
    echo
    
    prompt "Follow these steps to create an ephemeral web UI:"
    echo
    echo "1. Open your web browser"
    echo "2. Navigate to: https://$DOMAIN"
    echo "3. Log into LibreChat (or use as guest if available)"
    echo "4. Start a conversation with an MCP server that supports web UIs"
    echo "5. Common MCP servers with web UI support:"
    echo "   - todoodles (todo management)"
    echo "   - grocery-list (grocery management)"
    echo "   - memory (memory management)"
    echo "   - movies (movie preferences)"
    echo
    echo "6. In your conversation, request a web interface, for example:"
    echo "   - 'Can you show me a web interface for my todos?'"
    echo "   - 'Open the grocery list web UI'"
    echo "   - 'Show me the memory management interface'"
    echo
    echo "7. The MCP server should respond with an ephemeral URL like:"
    echo "   https://$DOMAIN:11234/?token=abc123def456"
    echo
    echo "8. Copy that URL and return here"
    echo
}

# Function to wait for user input
get_ephemeral_url() {
    local url=""
    
    while [ -z "$url" ]; do
        echo
        prompt "Paste the ephemeral URL here (or type 'skip' to exit):"
        read -r url
        
        if [ "$url" = "skip" ] || [ "$url" = "exit" ]; then
            info "Exiting ephemeral URL test"
            return 1
        fi
        
        if [ -z "$url" ]; then
            warning "Please enter a URL or type 'skip' to exit"
            continue
        fi
        
        # Basic URL validation
        if [[ $url =~ ^https?:// ]]; then
            echo "$url"
            return 0
        else
            warning "Please enter a valid URL starting with http:// or https://"
            url=""
        fi
    done
}

# Pre-flight checks
pre_flight_checks() {
    header "🔍 Pre-flight Infrastructure Checks"
    echo
    
    log "Mode: $MODE"
    log "Domain: $DOMAIN"
    log "Port Range: $PORT_RANGE_START-$PORT_RANGE_END"
    if [ "$MODE" = "remote" ]; then
        log "Remote Server: $REMOTE_SERVER"
    fi
    echo
    
    # Check MCP servers
    log "Checking MCP server status..."
    local mcp_servers=("todoodles" "grocery-list" "memory" "movies" "scheduled-tasks" "twilio-sms" "google-calendar-mcp")
    local running_count=0
    
    for server in "${mcp_servers[@]}"; do
        local check_command
        if [ "$MODE" = "local" ]; then
            check_command="pgrep -f '$server' > /dev/null 2>&1"
        else
            check_command="ssh '$REMOTE_SERVER' 'pgrep -f \"$server\"' > /dev/null 2>&1"
        fi
        
        if eval "$check_command"; then
            success "$server is running"
            ((running_count++))
        else
            warning "$server is not running"
        fi
    done
    
    info "MCP servers running: $running_count/${#mcp_servers[@]}"
    
    if [ $running_count -eq 0 ]; then
        error "No MCP servers are running! Cannot create ephemeral web UIs."
        return 1
    fi
    
    # Check for existing ephemeral ports (corrected regex)
    log "Checking for existing ephemeral servers..."
    local listening_ports
    if [ "$MODE" = "local" ]; then
        listening_ports=$(ss -tlnp 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | awk '{print $4}' | cut -d: -f2 | sort -n 2>/dev/null || echo "")
    else
        listening_ports=$(ssh "$REMOTE_SERVER" "ss -tlnp 2>/dev/null | grep -E ':(11[0-9]{3}|12[0-9]{3})' | awk '{print \$4}' | cut -d: -f2 | sort -n" 2>/dev/null || echo "")
    fi
    
    if [ -n "$listening_ports" ]; then
        success "Found existing ephemeral servers on ports: $listening_ports"
        warning "You may already have ephemeral web UIs running"
    else
        info "No existing ephemeral servers found (this is normal)"
    fi
    
    echo
    return 0
}

# Main execution
main() {
    header "🌐 Interactive Ephemeral Web UI Tester"
    echo
    
    # Run pre-flight checks
    if ! pre_flight_checks; then
        error "Pre-flight checks failed. Please fix issues and try again."
        exit 1
    fi
    
    # Guide user through creation
    guide_ephemeral_creation
    
    # Get URL from user
    local ephemeral_url
    ephemeral_url=$(get_ephemeral_url)
    
    if [ $? -ne 0 ] || [ -z "$ephemeral_url" ]; then
        info "Test cancelled by user"
        exit 0
    fi
    
    echo
    header "🧪 Testing Ephemeral URL"
    
    # Test the provided URL
    if test_ephemeral_url "$ephemeral_url"; then
        echo
        success "🎉 Ephemeral Web UI test completed successfully!"
        info "Your ephemeral web UI system is working correctly."
    else
        echo
        error "❌ Ephemeral Web UI test failed"
        warning "Check the recommendations above to fix the issues."
    fi
    
    echo
    header "📊 Summary"
    echo "Mode: $MODE"
    echo "Tested URL: $ephemeral_url"
    echo "Domain: $DOMAIN"
    
    if [ "$MODE" = "remote" ]; then
        echo "Remote Server: $REMOTE_SERVER"
    fi
}

# Show usage if help requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Interactive Ephemeral Web UI Tester"
    echo
    echo "Usage: $0 [local|remote]"
    echo
    echo "This script helps you test ephemeral web UI functionality by:"
    echo "1. Checking infrastructure prerequisites"
    echo "2. Guiding you through creating an ephemeral web UI"
    echo "3. Testing the generated ephemeral URL for accessibility"
    echo
    echo "Modes:"
    echo "  local  - Test local infrastructure and ephemeral URLs"
    echo "  remote - Test remote server infrastructure and external access"
    echo "  (auto) - Auto-detect based on SSH connectivity to remote server"
    exit 0
fi

# Run main function
main "$@"
