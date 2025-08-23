# MongoDB Integration for Scheduled Tasks MCP Server

This document describes the MongoDB integration added to the Scheduled Tasks MCP Server, enabling persistent, scalable storage and multi-user support.

## 🎯 Overview

The scheduled-tasks server now supports both **JSON file storage** (default) and **MongoDB storage** through a unified storage abstraction layer. This integration provides:

- ✅ **Seamless migration** from JSON to MongoDB
- ✅ **Multi-user support** with user isolation  
- ✅ **Production-ready** scalability
- ✅ **LibreChat integration** with user-based storage
- ✅ **Encryption support** for sensitive data
- ✅ **Backward compatibility** with existing setups

## 🚀 Quick Start

### 1. Environment Configuration

Copy and configure the environment variables:

```bash
cp env.example .env
```

**For JSON Storage (Default):**
```bash
MCP_STORAGE_TYPE=json
TASKS_FILE_PATH=./tasks.json
MCP_USER_BASED=false
```

**For MongoDB Storage:**
```bash
MCP_STORAGE_TYPE=mongodb
MONGO_URI=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=scheduled_tasks
MCP_USER_BASED=true
MCP_USER_ID=${USER_ID}  # Set by LibreChat
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build and Test

```bash
npm run build
node test-mongodb-integration.js
```

## ⚙️ Configuration Options

### Storage Type Selection

```bash
# Choose storage backend
MCP_STORAGE_TYPE=json          # File-based storage
MCP_STORAGE_TYPE=mongodb       # MongoDB storage
```

### JSON Storage Configuration

```bash
# File location
TASKS_FILE_PATH=./tasks.json

# Backup settings
MCP_BACKUP_ENABLED=true
MCP_BACKUP_MAX_FILES=30
MCP_BACKUP_INTERVAL=60         # minutes
```

### MongoDB Storage Configuration

```bash
# Connection
MONGO_URI=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=scheduled_tasks

# Performance
MCP_MONGODB_TIMEOUT=10000      # milliseconds
MCP_MONGODB_RETRIES=3

# Security
CREDS_KEY=your-64-char-hex-key # Encryption key
```

### User Isolation

```bash
# Enable multi-user support
MCP_USER_BASED=true
MCP_USER_ID=${USER_ID}         # Passed by LibreChat
```

### Migration Settings

```bash
# Automatic migration from old format
MCP_AUTO_MIGRATE=true
MCP_KEEP_MIGRATION_BACKUP=true
MCP_MIGRATION_DEBUG=false
```

## 🔄 Migration Process

The server automatically detects and migrates existing JSON task files to the new unified format:

### Migration Detection
- Scans for legacy task files in common locations
- Identifies files in old format vs new unified format
- Reports migration requirements during startup

### Migration Execution
1. **Backup Creation**: Original files are backed up with timestamp
2. **Data Conversion**: Tasks converted to unified storage format
3. **Validation**: Data integrity verified post-migration
4. **Cleanup**: Option to keep or remove original files

### Migration Logging
```bash
# Enable detailed migration logging
MCP_MIGRATION_DEBUG=true
```

Example migration output:
```
🔧 Initializing TaskStorageManager...
📊 Storage type: mongodb
👤 User-based: true
🔄 Migration required from legacy storage format
🔄 Starting migration from legacy JSON format...
🔄 Migrating file: /path/to/tasks.json
📦 Created migration backup: /path/to/tasks.json.migration-backup-2024-01-15T10-30-00-000Z
✅ Migrated 5 tasks from /path/to/tasks.json
🎉 Migration completed! Migrated 5 tasks from 1 files
✅ TaskStorageManager initialized successfully
```

## 🏗️ Architecture

### Storage Abstraction Layer

```
┌─────────────────┐
│   TaskManager   │
└─────────┬───────┘
          │
┌─────────▼───────┐
│TaskStorageManager│
└─────────┬───────┘
          │
┌─────────▼───────┐    ┌──────────────┐
│ StorageFactory  │────│  mcp-data    │
└─────────┬───────┘    │  (unified)   │
          │            └──────────────┘
   ┌──────▼──────┐
   │   Storage   │
   │ Backends    │
   │             │
   ├─JSON────────┤
   ├─MongoDB─────┤
   └─Future──────┘
```

### Data Structure

**Unified Storage Format:**
```typescript
interface TaskStorageData {
  tasks: Task[];
  metadata: {
    version: string;
    lastBackup: Date;
    totalTasks: number;
    lastModified: Date;
    storageType: 'json' | 'mongodb';
    migratedFrom?: string;
  };
}
```

### User Isolation

**Single User Mode:**
```
Storage: { tasks: [...], metadata: {...} }
```

**Multi-User Mode:**
```
User1: { tasks: [...], metadata: {...} }
User2: { tasks: [...], metadata: {...} }
User3: { tasks: [...], metadata: {...} }
```

## 🔒 Security Features

### Encryption Support
- Uses LibreChat's `CREDS_KEY` for data encryption
- Transparent encryption/decryption in MongoDB storage
- Optional encryption for sensitive task data

### User Isolation
- Complete data separation between users
- User ID validation and sanitization
- Secure multi-tenant architecture

## 🔧 Development

### Testing MongoDB Integration

1. **Start MongoDB:**
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

2. **Configure test environment:**
   ```bash
   export MONGO_URI=mongodb://localhost:27017/test_scheduled_tasks
   export MCP_STORAGE_TYPE=mongodb
   export MCP_USER_BASED=true
   export MCP_USER_ID=test-user
   ```

3. **Run integration test:**
   ```bash
   node test-mongodb-integration.js
   ```

### Adding New Storage Backends

The unified storage system makes it easy to add new backends:

1. Implement the storage interface in `mcp-data-standalone`
2. Update `StorageFactory` configuration
3. Add environment variable support
4. Test with existing TaskManager code

## 📊 Performance Considerations

### JSON Storage
- ✅ **Fast** for small task sets (<1000 tasks)
- ✅ **Simple** setup and deployment
- ❌ **Limited** scalability for large datasets
- ❌ **No** built-in user isolation

### MongoDB Storage  
- ✅ **Scalable** for large task sets (millions+)
- ✅ **Multi-user** support with isolation
- ✅ **Production-ready** with replication/sharding
- ✅ **Rich** querying and indexing capabilities
- ❌ **Complex** setup and maintenance

## 🚀 Production Deployment

### LibreChat Integration

1. **Configure LibreChat environment:**
   ```bash
   # In LibreChat's .env
   MCP_STORAGE_TYPE=mongodb
   MONGO_URI=mongodb://localhost:27017/LibreChat
   MONGODB_DATABASE=LibreChat
   MCP_USER_BASED=true
   ```

2. **User ID is automatically passed by LibreChat**
3. **Encryption uses LibreChat's CREDS_KEY**
4. **Tasks are isolated per LibreChat user**

### Scaling Considerations

- **MongoDB Replica Sets** for high availability
- **Connection pooling** for multiple server instances  
- **Database indexing** on user_id and task status
- **Automatic backup** strategies for task data

## 🐛 Troubleshooting

### Common Issues

**Migration fails:**
```bash
# Enable debug logging
MCP_MIGRATION_DEBUG=true
MCP_DEBUG=true
```

**MongoDB connection issues:**
```bash
# Check connection string format
MONGO_URI=mongodb://username:password@host:port/database

# Verify network connectivity
ping your-mongodb-host

# Check authentication
mongo mongodb://your-connection-string
```

**Performance issues:**
```bash
# Enable MongoDB query logging
# Monitor connection pool usage
# Check for proper indexing
```

### Debug Logging

```bash
# Enable comprehensive logging
MCP_DEBUG=true
MCP_MIGRATION_DEBUG=true

# Check server logs for detailed information
tail -f /path/to/server.log
```

## 📚 API Compatibility

The MongoDB integration maintains **100% API compatibility** with existing MCP tool interfaces:

- ✅ All existing tools work unchanged
- ✅ Task creation, scheduling, execution unchanged  
- ✅ LibreChat integration seamless
- ✅ Backup/restore functionality preserved
- ✅ No breaking changes to client code

## 🔮 Future Enhancements

### Planned Features
- **Redis storage backend** for high-performance caching
- **PostgreSQL storage** for relational data needs
- **Cloud storage** backends (AWS DynamoDB, Azure Cosmos)
- **GraphQL query interface** for advanced task querying
- **Real-time task synchronization** across instances
- **Advanced analytics** and task performance metrics

### Contributing

To contribute to the MongoDB integration:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure backward compatibility
5. Submit a pull request

---

## ✅ Summary

The MongoDB integration provides a robust, scalable foundation for the Scheduled Tasks MCP Server while maintaining simplicity and backward compatibility. Whether you're running a single-user development environment or a multi-user production deployment, the unified storage system adapts to your needs.

**Key Benefits:**
- 🚀 **Production-ready** scalability
- 👥 **Multi-user** support  
- 🔄 **Automatic migration** from existing setups
- 🔒 **Enterprise security** features
- 🛠️ **Simple configuration** and deployment
- 📈 **Future-proof** architecture

Get started today by simply changing `MCP_STORAGE_TYPE=mongodb` in your environment configuration! 