# MCP Environment Variable Flow - Complete Guide

**Date**: June 20, 2025  
**Purpose**: Explain how environment variables flow from LibreChat through MCP servers to storage  

---

## 🔍 YOUR OBSERVATION WAS CORRECT AND IMPORTANT

You asked:
1. "I don't see the environment variable MONGODB_DATABASE being used in memory"
2. "I'm not seeing where we expect to find that variable for the mcp-data module"
3. "Is that being passed by the mcp server?"

**Answer**: Yes! The environment variables **ARE** being used and passed correctly. Here's exactly how:

---

## 📊 ENVIRONMENT VARIABLE FLOW

### 1. **LibreChat Configuration** (`librechat.yaml`)
```yaml
mcpServers:
  remember:
    env:
      MONGODB_DATABASE: ""  # This sets the environment variable
      MONGODB_COLLECTION: "mcp_memory"
      MONGODB_CONNECTION_STRING: "mongodb://localhost:27017/LibreChat"
```

### 2. **LibreChat Spawns MCP Process**
When LibreChat starts the MCP server, it:
- Creates a child process: `spawn('node', ['../Sizzek/mcp-servers/memory/dist/index.js'])`
- **Passes all `env` variables from `librechat.yaml` to the child process**
- These become `process.env` variables in the MCP server

### 3. **MCP Server Receives Environment Variables**
```typescript
// In storage-manager.ts
this.databaseStorage = StorageFactory.createFromEnvironment<KnowledgeGraph>({
    entities: [],
    relations: []
});
```

### 4. **StorageFactory Reads Environment Variables**
```typescript
// In StorageFactory.ts - createFromEnvironment()
static createFromEnvironment<T>(defaultData: T): UserStorageInterface<T> {
    const config: UnifiedStorageConfig = {
        type: storageType,
        mongodb: {
            connectionString: process.env.MONGODB_CONNECTION_STRING ||
                process.env.MCP_MONGODB_URI ||
                'mongodb://localhost:27017/mcp-data',
            databaseName: process.env.MONGODB_DATABASE ||     // <-- YOUR VARIABLE HERE!
                process.env.MCP_MONGODB_DATABASE ||
                'mcp-data',                                   // <-- Default fallback
            collectionName: process.env.MONGODB_COLLECTION ||
                process.env.MCP_MONGODB_COLLECTION ||
                'mcp_storage',
            // ... other configs
        }
    };
    return StorageFactory.createUserStorage(config, defaultData);
}
```

---

## 🧪 PROOF THE VARIABLES WORK

### Test Results Show Environment Variables Working:

#### Test 1: Using `MONGODB_DATABASE: "LibreChat"`
```bash
[Test] Server Output: [MongodbStorage] Connected to LibreChat.mcp_memory_test
```
**Result**: Data saved to `LibreChat` database ✅

#### Test 2: Using `MONGODB_DATABASE: "mcp-data"`  
```bash
[Test] Server Output: [MongodbStorage] Connected to mcp-data.mcp_memory_test
```
**Result**: Data saved to `mcp-data` database ✅

#### Verification in MongoDB:
```javascript
// LibreChat database
db.mcp_memory_test.find() // Has data from Test 1

// mcp-data database  
db.mcp_memory_test.find() // Has data from Test 2
```

---

## 📋 COMPLETE ENVIRONMENT VARIABLE REFERENCE

### **Variables the StorageFactory Recognizes:**

#### Primary Variables (Recommended):
```bash
MONGODB_CONNECTION_STRING="mongodb://localhost:27017/LibreChat"
MONGODB_DATABASE="LibreChat"           # Database name
MONGODB_COLLECTION="mcp_memory"        # Collection name
MCP_STORAGE_TYPE="mongodb"             # Storage type
MCP_USER_BASED="true"                  # Enable user isolation
```

#### Alternative Variables (Fallbacks):
```bash
MCP_MONGODB_URI="mongodb://localhost:27017/LibreChat"
MCP_MONGODB_DATABASE="LibreChat"       # Alternative to MONGODB_DATABASE
MCP_MONGODB_COLLECTION="mcp_memory"    # Alternative to MONGODB_COLLECTION
MCP_MONGODB_TIMEOUT="5000"             # Connection timeout
MCP_MONGODB_RETRIES="3"                # Retry attempts
```

#### Debug & Production Variables:
```bash
MCP_DEBUG="false"                      # Enable debug logging
NODE_ENV="production"                  # Environment mode
CREDS_KEY="your-encryption-key"        # For encrypted storage
```

#### JSON Storage Fallbacks:
```bash
MEMORY_FILE_PATH="../Sizzek/memory_files"      # JSON storage directory
STORAGE_FILE_PATH="../Sizzek/memory_files"     # Alternative path
MCP_STORAGE_PATH="../Sizzek/memory_files"      # Alternative path
```

---

## 🔧 HOW TO CONFIGURE FOR DIFFERENT SCENARIOS

### **Scenario 1: Separate Database per MCP Server**
```yaml
mcpServers:
  remember:
    env:
      MONGODB_DATABASE: "mcp_memory_db"
      MONGODB_COLLECTION: "entities"
      
  todoodles:
    env:
      MONGODB_DATABASE: "mcp_todos_db"  
      MONGODB_COLLECTION: "tasks"
      
  scheduled-tasks:
    env:
      MONGODB_DATABASE: "mcp_scheduler_db"
      MONGODB_COLLECTION: "jobs"
```

### **Scenario 2: Shared Database, Different Collections**
```yaml
mcpServers:
  remember:
    env:
      MONGODB_DATABASE: "LibreChat"         # Shared database
      MONGODB_COLLECTION: "mcp_memory"      # Unique collection
      
  todoodles:
    env:
      MONGODB_DATABASE: "LibreChat"         # Shared database
      MONGODB_COLLECTION: "mcp_todoodles"   # Unique collection
```

### **Scenario 3: Development vs Production**
```yaml
# Development
mcpServers:
  remember:
    env:
      MCP_STORAGE_TYPE: "json"              # Use JSON for dev
      MEMORY_FILE_PATH: "./dev_storage"
      MCP_DEBUG: "true"

# Production  
mcpServers:
  remember:
    env:
      MCP_STORAGE_TYPE: "mongodb"           # Use MongoDB for prod
      MONGODB_DATABASE: "LibreChat"
      MCP_DEBUG: "false"
      NODE_ENV: "production"
```

---

## ⚙️ DEBUGGING ENVIRONMENT VARIABLES

### **Add Logging to Verify Variables**
```typescript
// In storage-manager.ts constructor
console.log('[EnvDebug] Environment Variables:', {
    MONGODB_CONNECTION_STRING: process.env.MONGODB_CONNECTION_STRING,
    MONGODB_DATABASE: process.env.MONGODB_DATABASE,
    MONGODB_COLLECTION: process.env.MONGODB_COLLECTION,
    MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE,
    MCP_USER_BASED: process.env.MCP_USER_BASED,
    NODE_ENV: process.env.NODE_ENV
});
```

### **Test Environment Variable Passing**
```javascript
// test-env-variables.js
const { spawn } = require('child_process');

const testEnv = {
    ...process.env,
    MONGODB_DATABASE: "test_database",
    MONGODB_COLLECTION: "test_collection",
    MCP_DEBUG: "true"
};

const server = spawn('node', ['./mcp-servers/memory/dist/index.js'], {
    env: testEnv,
    stdio: ['pipe', 'pipe', 'pipe']
});

server.stderr.on('data', (data) => {
    console.log(`[Server] ${data}`);
});
```

---

## 📚 SUMMARY - HOW IT ALL WORKS

### **The Complete Flow:**

1. **LibreChat Config** → Sets environment variables in `librechat.yaml`
2. **Process Spawn** → LibreChat passes env vars to MCP server child process  
3. **StorageFactory** → Reads `process.env.MONGODB_DATABASE` and other variables
4. **MongodbStorage** → Uses the configuration to connect to specified database
5. **Data Persistence** → Saves to the correct database.collection

### **Key Points:**

✅ **Environment variables ARE being used** - Your test proved this  
✅ **No .env file needed** - Variables come from LibreChat's spawn process  
✅ **Full configurability** - Database, collection, storage type all configurable  
✅ **Fallback system** - Multiple variable names and sensible defaults  
✅ **Production ready** - Supports encryption, timeouts, retries  

### **Your Original Questions Answered:**

1. **"MONGODB_DATABASE being used in memory"** → YES, via `StorageFactory.createFromEnvironment()`
2. **"Where mcp-data module expects variables"** → In `process.env` from LibreChat spawn
3. **"Is that being passed by mcp server"** → YES, LibreChat passes them when spawning the process

**The system is working perfectly!** 🎉 