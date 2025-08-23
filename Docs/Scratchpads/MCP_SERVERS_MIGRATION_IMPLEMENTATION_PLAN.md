# MCP Servers Migration Implementation Plan

## Overview
This plan outlines the systematic migration of all MCP servers from individual file storage to unified MongoDB storage using the `mcp-data` package and shared `.env.sizzek` configuration.

## Current Status
- ✅ **grocery-list**: Fully migrated and working
- ✅ **memory**: Already migrated and working
- ✅ **twilio-sms**: Fully migrated and working (completed 2025-08-22)
- ❌ **scheduled-tasks**: Needs migration
- ❌ **movies**: Needs migration
- ❌ **todoodles**: Needs migration
- ❌ **google-calendar-mcp**: Needs migration
- ❌ **Gmail-MCP-Server**: Needs migration

## Migration Pattern (Proven Success)
Based on the successful grocery-list migration, each server needs:

1. **Add mcp-data dependency** to package.json
2. **Import StorageFactory** from 'mcp-data'
3. **Replace file storage** with StorageFactory.createUserStorage()
4. **Use shared environment variables** from .env.sizzek
5. **Test in Docker container**

## Detailed Migration Steps

### Phase 1: Preparation
1. **Backup current state** (already done)
2. **Verify shared configuration** (already done)
3. **Set up testing environment** (MongoDB running)

### Phase 2: Server-by-Server Migration

#### Server 1: twilio-sms
**Current Issues:**
- No mcp-data dependency
- Uses file storage for contacts
- Tries to create `/data` directory

**Migration Steps:**
1. Add `"mcp-data": "^1.0.1"` to package.json
2. Import StorageFactory in contacts.js
3. Replace ContactManager file storage with StorageFactory
4. Update environment variable loading to use shared config
5. Test contact storage functionality

**Files to modify:**
- `package.json`
- `src/contacts.js`
- `src/index.ts`

#### Server 2: scheduled-tasks
**Current Issues:**
- No mcp-data dependency
- Uses file storage for tasks
- Has TaskStorageManager that needs migration

**Migration Steps:**
1. Add `"mcp-data": "^1.0.1"` to package.json
2. Import StorageFactory in TaskStorageManager
3. Replace file storage with StorageFactory
4. Update task data structure for MongoDB
5. Test task CRUD operations

**Files to modify:**
- `package.json`
- `src/storage/TaskStorageManager.ts`
- `src/index.ts`

#### Server 3: movies
**Current Issues:**
- No mcp-data dependency
- Uses file storage for movie data
- Has McpDataMovieStorage but not fully implemented

**Migration Steps:**
1. Add `"mcp-data": "^1.0.1"` to package.json
2. Complete McpDataMovieStorage implementation
3. Replace file storage with StorageFactory
4. Update movie data structure
5. Test movie management functionality

**Files to modify:**
- `package.json`
- `src/storage/McpDataMovieStorage.ts`
- `src/index.ts`

#### Server 4: todoodles
**Current Issues:**
- No mcp-data dependency
- Uses file storage for todos
- Similar structure to grocery-list

**Migration Steps:**
1. Add `"mcp-data": "^1.0.1"` to package.json
2. Import StorageFactory
3. Replace file storage with StorageFactory
4. Update todo data structure
5. Test todo CRUD operations

**Files to modify:**
- `package.json`
- `src/index.ts`

#### Server 5: google-calendar-mcp
**Current Issues:**
- No mcp-data dependency
- Uses file storage for OAuth tokens
- Needs secure token storage

**Migration Steps:**
1. Add `"mcp-data": "^1.0.1"` to package.json
2. Import StorageFactory
3. Replace token file storage with StorageFactory
4. Implement secure token encryption
5. Test OAuth flow

**Files to modify:**
- `package.json`
- `src/index.ts` (or main server file)

#### Server 6: Gmail-MCP-Server
**Current Issues:**
- No mcp-data dependency
- Uses file storage for OAuth credentials
- Needs secure credential storage

**Migration Steps:**
1. Add `"mcp-data": "^1.0.1"` to package.json
2. Import StorageFactory
3. Replace credential file storage with StorageFactory
4. Implement secure credential encryption
5. Test OAuth flow

**Files to modify:**
- `package.json`
- `src/index.ts` (or main server file)

### Phase 3: Testing & Validation

#### Individual Server Testing
For each migrated server:
1. **Build the server**: `npm run build`
2. **Test standalone**: Run server directly with shared config
3. **Verify MongoDB connection**: Check logs for successful connection
4. **Test core functionality**: Verify main features work
5. **Test user isolation**: Ensure multi-user support works

#### Integration Testing
1. **Start LibreChat**: `docker-compose up -d`
2. **Check all MCP servers**: Verify 8/8 servers initialize successfully
3. **Test MCP functionality**: Use LibreChat to test each server
4. **Verify data persistence**: Restart containers, check data remains
5. **Test user isolation**: Create multiple users, verify data separation

### Phase 4: Deployment & Documentation

#### Final Steps
1. **Remove backup files**: Clean up .env.backup files
2. **Update documentation**: Document new unified storage approach
3. **Create migration guide**: For future MCP server development
4. **Monitor production**: Watch for any issues in live environment

## Implementation Schedule

### Day 1: twilio-sms + scheduled-tasks
- Morning: Migrate twilio-sms
- Afternoon: Migrate scheduled-tasks
- Evening: Test both servers

### Day 2: movies + todoodles
- Morning: Migrate movies
- Afternoon: Migrate todoodles
- Evening: Test both servers

### Day 3: google-calendar-mcp + Gmail-MCP-Server
- Morning: Migrate google-calendar-mcp
- Afternoon: Migrate Gmail-MCP-Server
- Evening: Test both servers

### Day 4: Integration Testing
- Full LibreChat deployment test
- All MCP servers functionality test
- Documentation updates

## Success Criteria

### Technical Success
- ✅ All 8 MCP servers use mcp-data package
- ✅ All servers connect to MongoDB successfully
- ✅ No file system dependencies remain
- ✅ User isolation works correctly
- ✅ Data persists across container restarts

### Operational Success
- ✅ LibreChat starts with 8/8 MCP servers
- ✅ All MCP functionality works in LibreChat
- ✅ No environment variable conflicts
- ✅ Shared configuration works for all servers
- ✅ No host-specific paths in configuration

## Risk Mitigation

### Backup Strategy
- All original .env files backed up as .env.backup
- Git commits before each major change
- Docker images tagged before migration

### Rollback Plan
- Restore .env.backup files if needed
- Revert to previous Docker image
- Restore original docker-compose.yml if needed

### Testing Strategy
- Test each server individually before integration
- Test in Docker environment before production
- Monitor logs carefully during migration

## Expected Benefits

### Immediate Benefits
- Unified storage approach across all MCP servers
- No more file system permission issues
- Consistent user isolation
- Simplified deployment

### Long-term Benefits
- Easier MCP server development
- Better scalability with MongoDB
- Improved maintainability
- Consistent configuration management

## Next Steps
1. Begin with twilio-sms migration (highest priority - currently failing)
2. Follow the proven grocery-list pattern
3. Test each server individually
4. Integrate into LibreChat deployment
5. Document the complete migration process
