# MCP Data Storage Architecture Guide

## File Organization Structure

### **Correct File Locations:**

```
Sizzek/
├── mcp-data/                              # 🔧 SHARED STORAGE PACKAGE
│   ├── storage/                           # 📁 All storage implementations live here
│   │   ├── StorageInterface.ts            # ✅ Base interfaces
│   │   ├── JsonStorage.ts                 # ✅ JSON file storage
│   │   ├── MongodbStorage.ts              # ✅ MongoDB simple storage  
│   │   ├── PaginatedGraphStorage.ts       # ✅ MongoDB graph storage (NEW)
│   │   └── StorageFactory.ts              # ✅ Factory for creating storage
│   ├── index.ts                           # 📤 Package exports
│   └── package.json                       # 📦 Package configuration
│
├── mcp-servers/                           # 🚀 INDIVIDUAL MCP SERVERS
│   ├── memory/                            # 🧠 Memory MCP Server
│   │   ├── src/
│   │   │   └── index.ts                   # 🔗 Uses: @sizzek/mcp-data storage
│   │   └── package.json
│   ├── todoodles/                         # ✅ Todos MCP Server  
│   └── calendar/                          # 📅 Calendar MCP Server
│
└── mcp_architecture_proposal.md           # 📋 Architecture documentation
```

## **Why This Organization?**

### **1. Shared Storage Package (`mcp-data/storage/`)**
- **Purpose**: Reusable storage implementations that any MCP server can use
- **Benefits**: 
  - DRY principle (Don't Repeat Yourself)
  - Consistent interfaces across all MCP servers
  - Easy to test and maintain centrally
  - Version control for storage changes

### **2. Individual MCP Servers (`mcp-servers/`)**
- **Purpose**: Business logic specific to each MCP server type
- **Benefits**:
  - Clear separation of concerns
  - Independent deployment and scaling
  - Server-specific optimizations

## **Storage Type Selection Guide**

### **Tier 1: Simple Data** → `JsonStorage` or `MongodbStorage`
**Use for**: todos, contacts, calendar events, user preferences

```typescript
// Example: Todos MCP Server
import { StorageFactory } from '@sizzek/mcp-data';

const storage = StorageFactory.createFromEnvironment({
  tasks: [],
  completedCount: 0
});
```

### **Tier 2: Graph Data** → `PaginatedGraphStorage` 
**Use for**: memory/knowledge graphs, entity relationships

```typescript
// Example: Memory MCP Server  
import { StorageFactory } from '@sizzek/mcp-data';

const storage = StorageFactory.createGraphStorageFromEnvironment();
```

### **Tier 3: Complex Graphs** → External Graph DB (Future)
**Use for**: Large-scale knowledge graphs (>10k entities)

## **Migration Guide: Current → Recommended**

### **Problem: Files in Wrong Locations**
```bash
# ❌ WRONG - Storage implementations scattered
mcp-servers/memory/PaginatedGraphStorage.ts
mcp-servers/memory/MongodbStorage.ts  
mcp-servers/todoodles/JsonStorage.ts

# ✅ CORRECT - Centralized storage package
mcp-data/storage/PaginatedGraphStorage.ts
mcp-data/storage/MongodbStorage.ts
mcp-data/storage/JsonStorage.ts
```

### **Solution: Centralize Storage**

1. **Move storage files to shared package**:
   ```bash
   mv mcp-servers/memory/PaginatedGraphStorage.ts mcp-data/storage/
   ```

2. **Update imports in MCP servers**:
   ```typescript
   // Before
   import { PaginatedGraphStorage } from './PaginatedGraphStorage.js';
   
   // After  
   import { StorageFactory } from '@sizzek/mcp-data';
   const storage = StorageFactory.createGraphStorageFromEnvironment();
   ```

3. **Remove duplicate implementations**

## **Environment Configuration**

### **Memory MCP Server** (Uses Graph Storage)
```yaml
# .env

  MCP_STORAGE_TYPE: "paginated-graph"
  MONGODB_CONNECTION_STRING: "mongodb://mongodb:27017/LibreChat"  
  MONGODB_DATABASE: "LibreChat"
  MONGODB_COLLECTION_PREFIX: "mcp_memory"
  MCP_USER_BASED: "true"
```

### **Todos MCP Server** (Uses Simple Storage)
```yaml
# .env
  MCP_STORAGE_TYPE: "mongodb"
  MONGODB_CONNECTION_STRING: "mongodb://mongodb:27017/LibreChat"
  MONGODB_DATABASE: "LibreChat" 
  MONGODB_COLLECTION: "mcp_todos"
  MCP_USER_BASED: "true"
```

## **Database Collections Architecture**

### **Collection Strategy: One Collection Set Per MCP Server**
```javascript
// Memory server collections
mcp_memory_entities    // Individual entities  
mcp_memory_relations   // Individual relationships
mcp_memory_index       // Search and summary data

// Todos server collection  
mcp_todos              // Simple task lists per user

// Calendar server collection
mcp_calendar           // Events and schedules per user

// User isolation within each collection
{
  "userId": "+1234567890",  // 🔑 User isolation key
  "data": { ... },          // Actual data
  "updatedAt": "2025-01-15T10:00:00Z"
}
```

## **Implementation Benefits**

### **Performance Benefits**
- **Memory Server**: Entity-per-document = O(1) operations vs O(n) for single large document
- **Simple Servers**: Direct MongoDB operations without graph overhead
- **Search**: Full-text indexes on entity collections

### **Scalability Benefits**  
- **No 16MB MongoDB document limit**
- **Horizontal scaling** by user 
- **Independent MCP server scaling**

### **Development Benefits**
- **Single source of truth** for storage logic
- **Consistent APIs** across all MCP servers
- **Easy testing** with `StorageFactory.createTestStorage()`
- **Type safety** with TypeScript interfaces

## **Next Steps**

1. **✅ COMPLETED**: `PaginatedGraphStorage` in correct location
2. **🔄 IN PROGRESS**: Update memory MCP server to use shared storage
3. **📋 TODO**: Migrate other MCP servers to use shared storage
4. **🚀 FUTURE**: Add Redis caching layer for performance

## **Usage Examples**

### **Memory MCP Server**
```typescript
import { StorageFactory, KnowledgeGraph } from '@sizzek/mcp-data';

const storage = StorageFactory.createGraphStorageFromEnvironment();

// Individual entity operations (optimal)
await storage.saveEntity(userId, entity);
const results = await storage.searchEntities(userId, "John Doe");

// Graph traversal  
const connected = await storage.getConnectedEntities(userId, entityId, 2);
```

### **Todos MCP Server**
```typescript
import { StorageFactory } from '@sizzek/mcp-data';

const storage = StorageFactory.createFromEnvironment({
  tasks: [],
  completedCount: 0  
});

// Simple CRUD operations
await storage.saveForUser(userId, todoList);
const todos = await storage.loadForUser(userId);
```

This architecture provides the foundation for scalable, maintainable MCP servers with proper separation of concerns and optimized data access patterns. 