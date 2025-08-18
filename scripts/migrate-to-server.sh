#!/bin/bash
# scripts/migrate-to-server.sh
# Migrate local MongoDB data to remote server

set -e

# Configuration
LOCAL_MONGO_HOST="localhost"
LOCAL_MONGO_PORT="27017"
REMOTE_HOST="alan@srv586875"
REMOTE_MONGO_HOST="localhost"
REMOTE_MONGO_PORT="27017"
BACKUP_DIR="/tmp/mongodb-migration"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

# Pre-migration checks
pre_migration_checks() {
    log "🔍 Running pre-migration checks..."
    
    # Check if local MongoDB is accessible
    if ! mongosh --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --eval "db.runCommand('ping')" > /dev/null 2>&1; then
        error "Cannot connect to local MongoDB at $LOCAL_MONGO_HOST:$LOCAL_MONGO_PORT"
    fi
    
    # Check if remote server is accessible
    if ! ssh "$REMOTE_HOST" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        error "Cannot connect to remote server $REMOTE_HOST"
    fi
    
    # Check if remote MongoDB is accessible (using Docker)
    if ! ssh "$REMOTE_HOST" "docker exec chat-mongodb mongosh --eval 'db.runCommand(\"ping\")'" > /dev/null 2>&1; then
        error "Cannot connect to remote MongoDB container on $REMOTE_HOST"
    fi
    
    log "✅ Pre-migration checks passed"
}

# Export databases from local MongoDB
export_databases() {
    log "📦 Exporting databases from local MongoDB..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Databases to migrate (excluding system databases)
    databases=("LibreChat" "mcp_data" "config" "debug_todoodles")
    
    for db in "${databases[@]}"; do
        log "Exporting database: $db"
        
        # Export database
        mongodump \
            --host "$LOCAL_MONGO_HOST" \
            --port "$LOCAL_MONGO_PORT" \
            --db "$db" \
            --out "$BACKUP_DIR" \
            --gzip
        
        if [[ $? -eq 0 ]]; then
            log "✅ Successfully exported $db"
        else
            error "Failed to export database $db"
        fi
    done
    
    log "✅ All databases exported to $BACKUP_DIR"
}

# Transfer backup to remote server
transfer_to_server() {
    log "📤 Transferring backup to remote server..."
    
    # Create backup directory on remote server
    ssh "$REMOTE_HOST" "mkdir -p ~/mongodb-migration"
    
    # Transfer backup files
    scp -r "$BACKUP_DIR"/* "$REMOTE_HOST:~/mongodb-migration/"
    
    if [[ $? -eq 0 ]]; then
        log "✅ Backup transferred to remote server"
    else
        error "Failed to transfer backup to remote server"
    fi
    
    # Copy files into MongoDB container
    log "📋 Copying files into MongoDB container..."
    ssh "$REMOTE_HOST" "docker cp ~/mongodb-migration/. chat-mongodb:/tmp/mongodb-migration/"
    
    if [[ $? -eq 0 ]]; then
        log "✅ Files copied into MongoDB container"
    else
        error "Failed to copy files into MongoDB container"
    fi
}

# Import databases on remote server
import_on_server() {
    log "📥 Importing databases on remote server..."
    
    # Import each database
    databases=("LibreChat" "mcp_data" "config" "debug_todoodles")
    
    for db in "${databases[@]}"; do
        log "Importing database: $db"
        
        ssh "$REMOTE_HOST" "
            docker exec -i chat-mongodb mongorestore \
                --db $db \
                --dir /tmp/mongodb-migration/$db \
                --gzip \
                --drop
        "
        
        if [[ $? -eq 0 ]]; then
            log "✅ Successfully imported $db"
        else
            error "Failed to import database $db"
        fi
    done
    
    log "✅ All databases imported on remote server"
}

# Verify migration
verify_migration() {
    log "🔍 Verifying migration..."
    
    # Check database counts
    local_count=$(mongosh --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return ['LibreChat', 'mcp_data', 'config', 'debug_todoodles'].includes(db.name); })
            .length;
    ")
    
    remote_count=$(ssh "$REMOTE_HOST" "docker exec chat-mongodb mongosh --quiet --eval \"
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return ['LibreChat', 'mcp_data', 'config', 'debug_todoodles'].includes(db.name); })
            .length;
    \"")
    
    if [[ "$local_count" == "$remote_count" ]]; then
        log "✅ Database count matches: $local_count databases"
    else
        warn "⚠️ Database count mismatch: Local=$local_count, Remote=$remote_count"
    fi
    
    # Check document counts for key collections
    log "📊 Document count verification:"
    
    # Check LibreChat users
    local_users=$(mongosh --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "db = db.getSiblingDB('LibreChat'); db.users.countDocuments();")
    remote_users=$(ssh "$REMOTE_HOST" "docker exec chat-mongodb mongosh --quiet --eval \"db = db.getSiblingDB('LibreChat'); db.users.countDocuments();\"")
    
    if [[ "$local_users" == "$remote_users" ]]; then
        log "✅ LibreChat users: $local_users (matches)"
    else
        warn "⚠️ LibreChat users mismatch: Local=$local_users, Remote=$remote_users"
    fi
    
    # Check LibreChat conversations
    local_conversations=$(mongosh --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "db = db.getSiblingDB('LibreChat'); db.conversations.countDocuments();")
    remote_conversations=$(ssh "$REMOTE_HOST" "docker exec chat-mongodb mongosh --quiet --eval \"db = db.getSiblingDB('LibreChat'); db.conversations.countDocuments();\"")
    
    if [[ "$local_conversations" == "$remote_conversations" ]]; then
        log "✅ LibreChat conversations: $local_conversations (matches)"
    else
        warn "⚠️ LibreChat conversations mismatch: Local=$local_conversations, Remote=$remote_conversations"
    fi
}

# Cleanup
cleanup() {
    log "🧹 Cleaning up temporary files..."
    rm -rf "$BACKUP_DIR"
    ssh "$REMOTE_HOST" "rm -rf ~/mongodb-migration"
    log "✅ Cleanup completed"
}

# Main migration function
main() {
    log "🚀 Starting MongoDB migration to remote server..."
    
    pre_migration_checks
    export_databases
    transfer_to_server
    import_on_server
    verify_migration
    cleanup
    
    log "🎉 Migration completed successfully!"
    log ""
    log "📋 Migration Summary:"
    log "  Source: $LOCAL_MONGO_HOST:$LOCAL_MONGO_PORT"
    log "  Destination: $REMOTE_HOST:$REMOTE_MONGO_HOST:$REMOTE_MONGO_PORT"
    log "  Databases: LibreChat, mcp_data, config, debug_todoodles"
    log ""
    log "📝 Next Steps:"
    log "  1. Update LibreChat configuration to use remote MongoDB"
    log "  2. Test LibreChat connectivity to remote database"
    log "  3. Monitor application logs for any connection issues"
    log "  4. Consider setting up automated backups for the remote database"
}

# Handle script interruption
trap 'error "Migration interrupted by user"' INT TERM

# Run main function
main "$@"
