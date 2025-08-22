#!/bin/bash
# scripts/deploy-mcp-envs.sh
# Simple script to copy .env files from local MCP servers to remote server

set -e

# Configuration
REMOTE_HOST="alan@srv586875"
REMOTE_BASE_DIR="~/projects/Sizzek/mcp-servers"
LOCAL_BASE_DIR="./mcp-servers"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Deploy .env files for all MCP servers
deploy_env_files() {
    log "📤 Deploying .env files to remote server..."
    
    # Get list of MCP server directories
    if [[ ! -d "$LOCAL_BASE_DIR" ]]; then
        error "Local MCP servers directory not found: $LOCAL_BASE_DIR"
    fi
    
    # Process each .env file
    for env_file in $(find "$LOCAL_BASE_DIR" -name ".env" -type f); do
        # Get the relative path from LOCAL_BASE_DIR
        relative_path="${env_file#$LOCAL_BASE_DIR/}"
        server_dir=$(dirname "$relative_path")
        
        log "Deploying .env for: $server_dir"
        
        # Create remote directory if it doesn't exist
        ssh "$REMOTE_HOST" "mkdir -p $REMOTE_BASE_DIR/$server_dir"
        
        # Copy .env file to remote server
        if scp "$env_file" "$REMOTE_HOST:$REMOTE_BASE_DIR/$server_dir/.env"; then
            log "✅ Deployed .env for $server_dir"
        else
            warn "Failed to deploy .env for $server_dir"
        fi
    done
}

# Verify deployment
verify_deployment() {
    log "🔍 Verifying deployment..."
    
    for env_file in $(find "$LOCAL_BASE_DIR" -name ".env" -type f); do
        relative_path="${env_file#$LOCAL_BASE_DIR/}"
        server_dir=$(dirname "$relative_path")
        
        if ssh "$REMOTE_HOST" "test -f $REMOTE_BASE_DIR/$server_dir/.env"; then
            log "✅ Verified .env exists for $server_dir"
        else
            warn "❌ .env missing for $server_dir"
        fi
    done
}

# Main function
main() {
    log "🚀 Starting MCP environment deployment..."
    
    deploy_env_files
    verify_deployment
    
    log "✅ Environment deployment completed!"
}

# Run main function
main "$@"
