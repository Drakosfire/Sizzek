# MCP Servers Storage Migration Plan

## Current State Analysis

### MCP Servers with Storage Issues

#### 1. **twilio-sms** 
- **Current Issue**: Uses local file storage with `CONTACTS_DATA_DIR`
- **Problem**: `.env` file has `CONTACTS_DATA_DIR=/media/drakosfire/Projects/Sizzek/memory_files` (host path)
- **Current Storage**: JSON file storage in `./data/contacts.json`
- **Status**: ❌ Needs migration to mcp-data

#### 2. **scheduled-tasks**
- **Current Issue**: Uses local file storage with `TASKS_FILE_PATH`
- **Problem**: `.env` file has `MONGO_URI=mongodb://localhost:27017/LibreChat` (host path)
- **Current Storage**: JSON file storage in `./tasks.json`
- **Status**: ❌ Needs migration to mcp-data

#### 3. **grocery-list**
- **Current Issue**: Uses local file storage
- **Problem**: `.env` file has `MONGO_URI=mongodb://localhost:27017/LibreChat` (host path)
- **Current Storage**: JSON file storage
- **Status**: ❌ Needs migration to mcp-data

#### 4. **movies**
- **Current Issue**: Uses local file storage with `MCP_MOVIES_DATA_DIR`
- **Problem**: `.env` file has `MONGODB_URI=mongodb://localhost:27017/LibreChat` and `MCP_MOVIES_DATA_DIR=/media/drakosfire/Projects/Sizzek/memory_files` (host paths)
- **Current Storage**: JSON file storage
- **Status**: ❌ Needs migration to mcp-data

#### 5. **todoodles**
- **Current Issue**: Uses local file storage
- **Problem**: `.env` file has `MONGO_URI=mongodb://localhost:27017/mcp_data` (host path)
- **Current Storage**: JSON file storage
- **Status**: ❌ Needs migration to mcp-data

#### 6. **google-calendar-mcp**
- **Current Issue**: Uses local file storage for tokens
- **Problem**: Needs writable directory for token storage
- **Current Storage**: JSON file storage for OAuth tokens
- **Status**: ❌ Needs migration to mcp-data

#### 7. **Gmail-MCP-Server**
- **Current Issue**: Uses local file storage for credentials
- **Problem**: Needs writable directory for OAuth credentials
- **Current Storage**: JSON file storage for OAuth credentials
- **Status**: ❌ Needs migration to mcp-data

### MCP Servers Already Using mcp-data

#### 1. **memory**
- **Current Storage**: Uses mcp-data with MongoDB
- **Status**: ✅ Already migrated

## Root Problems Identified

1. **Multiple `.env` files** overriding Docker environment variables
2. **Inconsistent storage approaches** across MCP servers
3. **Host paths hardcoded** in `.env` files
4. **Mixed storage types** (JSON files vs MongoDB)
5. **No unified data management** across MCP servers

## Migration Plan

### Phase 1: Environment Cleanup
1. **Remove problematic `.env` files** or comment out host-specific paths
2. **Standardize environment variables** across all MCP servers
3. **Use Docker Compose environment variables** instead of local `.env` files

### Phase 2: Storage Migration
1. **Migrate each MCP server** to use `mcp-data` package
2. **Implement MongoDB storage** for all data
3. **Remove local file storage** dependencies
4. **Update MCP server configurations** to use unified storage

### Phase 3: Testing & Validation
1. **Test each MCP server** in Docker container
2. **Verify MongoDB connections** work correctly
3. **Validate data persistence** across container restarts
4. **Test user isolation** and multi-user support

## Implementation Steps

### Step 1: Environment Variable Standardization
```yaml
# Docker Compose environment variables (already added)
environment:
  - MONGO_URI=mongodb://librechat_user:${MONGO_PASSWORD}@mongodb:27017/LibreChat?authSource=LibreChat
  - MCP_STORAGE_TYPE=mongodb
  - MCP_USER_BASED=true
```

### Step 2: Remove Local .env Files
- Comment out or remove host-specific paths from all `.env` files
- Let Docker Compose environment variables take precedence

### Step 3: Migrate Each MCP Server
1. **Update package.json** to include `mcp-data` dependency
2. **Replace storage implementation** with `mcp-data` StorageFactory
3. **Update configuration** to use MongoDB
4. **Test in container environment**

### Step 4: Update Docker Configuration
- Remove writable volume mounts (no longer needed)
- Simplify environment variables
- Ensure all MCP servers use same MongoDB connection

## Benefits of Migration

1. **Unified Storage**: All MCP servers use same storage backend
2. **Container Compatibility**: No more file system permission issues
3. **User Isolation**: Proper multi-user support via mcp-data
4. **Scalability**: MongoDB can handle larger datasets
5. **Consistency**: Same storage patterns across all MCP servers
6. **Maintainability**: Single storage implementation to maintain

## Next Actions

1. **Document current storage implementations** for each MCP server
2. **Create migration scripts** for each server
3. **Test migration process** on one server first
4. **Systematically migrate** remaining servers
5. **Update documentation** and deployment guides
