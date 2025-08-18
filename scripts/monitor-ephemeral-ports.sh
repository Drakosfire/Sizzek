#!/bin/bash

# Monitor Ephemeral Web UI Ports Security Script
# Monitors ports 11000-12000 for security threats and usage patterns

set -e

# Configuration
PORT_RANGE_START=11000
PORT_RANGE_END=12000
LOG_FILE="/var/log/ephemeral-ui-monitor.log"
ALERT_EMAIL="admin@dungeonmind.net"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

alert() {
    log "🚨 ALERT: $1"
    # Uncomment to send email alerts
    # echo "Ephemeral Web UI Security Alert: $1" | mail -s "Security Alert" "$ALERT_EMAIL"
}

# Check for active ephemeral web UI servers
check_active_servers() {
    log "🔍 Checking active ephemeral web UI servers..."
    
    active_ports=$(netstat -tlnp 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | awk '{print $4}' | cut -d: -f2 | sort -n)
    
    if [[ -n "$active_ports" ]]; then
        log "✅ Active ephemeral web UI servers found on ports: $active_ports"
        echo "$active_ports" | while read port; do
            connections=$(netstat -an 2>/dev/null | grep ":$port " | wc -l)
            log "   Port $port: $connections active connections"
        done
    else
        log "ℹ️  No active ephemeral web UI servers found"
    fi
}

# Check for suspicious connection patterns
check_suspicious_connections() {
    log "🔍 Checking for suspicious connection patterns..."
    
    # Check for multiple failed connection attempts
    failed_attempts=$(grep "Connection refused" /var/log/syslog 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | tail -20 | wc -l)
    
    if [[ $failed_attempts -gt 10 ]]; then
        alert "High number of failed connection attempts to ephemeral ports: $failed_attempts"
    fi
    
    # Check for port scanning patterns
    port_scan_attempts=$(netstat -an 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -nr | head -5)
    
    if [[ -n "$port_scan_attempts" ]]; then
        log "📊 Top connection sources to ephemeral ports:"
        echo "$port_scan_attempts" | while read count ip; do
            if [[ $count -gt 5 ]]; then
                alert "Potential port scanning from $ip ($count connections)"
            else
                log "   $ip: $count connections"
            fi
        done
    fi
}

# Check for expired sessions that should be cleaned up
check_expired_sessions() {
    log "🔍 Checking for expired ephemeral web UI sessions..."
    
    # This would need to be implemented based on your session management system
    # For now, we'll just log that this check should be implemented
    log "ℹ️  Session cleanup check - implement based on your session management system"
}

# Check firewall status
check_firewall_status() {
    log "🔍 Checking firewall status for ephemeral ports..."
    
    if command -v ufw >/dev/null 2>&1; then
        ufw_status=$(sudo ufw status | grep "11000:12000")
        if [[ -n "$ufw_status" ]]; then
            log "✅ Firewall rule for ephemeral ports is active"
        else
            alert "Firewall rule for ephemeral ports may not be active"
        fi
    else
        log "⚠️  UFW not available, cannot check firewall status"
    fi
}

# Generate security report
generate_report() {
    log "📊 Generating ephemeral web UI security report..."
    
    echo "=== Ephemeral Web UI Security Report ===" | tee -a "$LOG_FILE"
    echo "Date: $(date)" | tee -a "$LOG_FILE"
    echo "Port Range: $PORT_RANGE_START-$PORT_RANGE_END" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    # Active servers
    echo "Active Servers:" | tee -a "$LOG_FILE"
    netstat -tlnp 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    # Recent connections
    echo "Recent Connections:" | tee -a "$LOG_FILE"
    netstat -an 2>/dev/null | grep -E ":(11[0-9]{3}|12[0-9]{3})" | tail -10 | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    log "📄 Security report generated and saved to $LOG_FILE"
}

# Main execution
main() {
    log "🚀 Starting ephemeral web UI security monitoring..."
    
    check_active_servers
    check_suspicious_connections
    check_expired_sessions
    check_firewall_status
    generate_report
    
    log "✅ Ephemeral web UI security monitoring completed"
}

# Run main function
main "$@"
