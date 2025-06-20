# MCP Server MongoDB Architecture Proposal

## Executive Summary

This document outlines a scalable MongoDB architecture for MCP servers that addresses graph database limitations while maintaining user isolation and performance.

## Current State Problems

1. **MongoDB Document Size Limits**: 16MB limit will break large knowledge graphs
2. **Inefficient Graph Operations**: MongoDB isn't optimized for graph traversals
3. **Atomic Update Conflicts**: Entire graph rewrites for small changes
4. **Memory Performance**: Loading complete graphs for simple operations

## Recommended Architecture: Tiered Storage Strategy

### Tier 1: Simple Data Collections (Current MongoDB)
**Use Case**: Basic CRUD operations, lists, preferences
**Examples**: todos, calendar events, contacts, user preferences

```javascript
// mcp_todos collection
{
  "_id": ObjectId("..."),
  "userId": "+1234567890",
  "tasks": [
    {
      "id": "task-1",
      "title": "Buy groceries",
      "completed": false,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "metadata": {
    "totalTasks": 1,
    "completedTasks": 0
  },
  "updatedAt": "2025-01-15T10:00:00Z"
}
```

### Tier 2: Paginated Graph Collections (Enhanced MongoDB)
**Use Case**: Medium-scale graphs that can be chunked
**Examples**: memory entities, relationships with pagination

```javascript
// mcp_memory_entities collection
{
  "_id": ObjectId("..."),
  "userId": "+1234567890",
  "entityId": "person-john-doe",
  "entityType": "person",
  "name": "John Doe",
  "observations": ["Works at Tech Corp", "Lives in Seattle"],
  "metadata": {
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:05:00Z",
    "relationCount": 3
  },
  "tags": ["colleague", "friend"],
  "searchText": "john doe person tech corp seattle" // For text search
}

// mcp_memory_relations collection  
{
  "_id": ObjectId("..."),
  "userId": "+1234567890", 
  "fromEntityId": "person-john-doe",
  "toEntityId": "company-tech-corp",
  "relationType": "works_at",
  "strength": 0.9,
  "metadata": {
    "createdAt": "2025-01-15T10:00:00Z",
    "source": "conversation",
    "confidence": 0.85
  }
}

// mcp_memory_index collection (for fast queries)
{
  "_id": ObjectId("..."),
  "userId": "+1234567890",
  "summary": {
    "totalEntities": 150,
    "totalRelations": 300,
    "entityTypes": {
      "person": 50,
      "company": 20,
      "concept": 80
    }
  },
  "recentEntities": ["person-john-doe", "company-tech-corp"],
  "searchIndex": {
    "frequent_terms": ["work", "seattle", "programming"],
    "entity_names": ["john doe", "tech corp", "alice smith"]
  },
  "updatedAt": "2025-01-15T10:05:00Z"
}
```

### Tier 3: External Graph Database (Future Enhancement)
**Use Case**: Complex graph operations, large-scale knowledge graphs
**Technology**: Neo4j, ArangoDB, or Amazon Neptune

```cypher
// Neo4j example for complex queries
MATCH (person:Person)-[r:WORKS_AT]->(company:Company)
WHERE person.userId = "+1234567890"
  AND company.location = "Seattle"
RETURN person, r, company
```

## Implementation Strategy

### Phase 1: Enhanced MongoDB Collections (Immediate)

#### 1. Memory Server Refactoring

```typescript
interface EnhancedMemoryStorage {
  // Entity operations (individual documents)
  saveEntity(userId: string, entity: Entity): Promise<void>;
  getEntity(userId: string, entityId: string): Promise<Entity | null>;
  searchEntities(userId: string, query: string): Promise<Entity[]>;
  deleteEntity(userId: string, entityId: string): Promise<void>;
  
  // Relation operations (individual documents)  
  saveRelation(userId: string, relation: Relation): Promise<void>;
  getRelations(userId: string, entityId: string): Promise<Relation[]>;
  deleteRelation(userId: string, relationId: string): Promise<void>;
  
  // Batch operations for performance
  saveEntitiesBatch(userId: string, entities: Entity[]): Promise<void>;
  getEntitiesBatch(userId: string, entityIds: string[]): Promise<Entity[]>;
  
  // Graph queries (limited but useful)
  getConnectedEntities(userId: string, entityId: string, depth: number): Promise<KnowledgeGraph>;
  getUserSummary(userId: string): Promise<GraphSummary>;
}
```

#### 2. Collection Schema Design

```typescript
// Collection naming strategy
const collections = {
  todos: `mcp_todos`,           // Simple data
  calendar: `mcp_calendar`,     // Time-based data
  contacts: `mcp_contacts`,     // Contact data
  memoryEntities: `mcp_memory_entities`,     // Graph entities
  memoryRelations: `mcp_memory_relations`,   // Graph relations  
  memoryIndex: `mcp_memory_index`,           // Search/summary
  userSessions: `mcp_user_sessions`          // Session data
};

// Indexes for performance
const indexes = {
  mcp_memory_entities: [
    { "userId": 1, "entityId": 1 },  // Unique constraint
    { "userId": 1, "entityType": 1 }, 
    { "userId": 1, "searchText": "text" }, // Full text search
    { "userId": 1, "updatedAt": -1 }
  ],
  mcp_memory_relations: [
    { "userId": 1, "fromEntityId": 1 },
    { "userId": 1, "toEntityId": 1 },
    { "userId": 1, "relationType": 1 },
    { "fromEntityId": 1, "toEntityId": 1 } // Unique constraint
  ]
};
```

### Phase 2: Storage Factory Pattern

```typescript
enum StorageComplexity {
  SIMPLE = 'simple',        // Basic CRUD (todos, contacts)
  MEDIUM = 'medium',        // Paginated graphs (memory)
  COMPLEX = 'complex'       // External graph DB
}

class StorageFactory {
  static createStorage<T>(
    serverType: string,
    complexity: StorageComplexity,
    config: StorageConfig
  ): UserStorageInterface<T> {
    
    switch (complexity) {
      case StorageComplexity.SIMPLE:
        return new SimpleMongoStorage<T>(config);
        
      case StorageComplexity.MEDIUM:
        return new PaginatedGraphStorage<T>(config);
        
      case StorageComplexity.COMPLEX:
        return new ExternalGraphStorage<T>(config);
    }
  }
}

// Usage in MCP servers
const memoryStorage = StorageFactory.createStorage(
  'memory',
  StorageComplexity.MEDIUM,
  { connectionString: mongoUri, collectionPrefix: 'mcp_memory' }
);

const todoStorage = StorageFactory.createStorage(
  'todos', 
  StorageComplexity.SIMPLE,
  { connectionString: mongoUri, collection: 'mcp_todos' }
);
```

### Phase 3: Migration Strategy

#### 3.1 Data Migration

```typescript
class GraphMigrationTool {
  async migrateFromSingleDocument(userId: string): Promise<void> {
    // Read existing single-document graph
    const oldGraph = await legacyStorage.loadForUser(userId);
    
    // Migrate entities to individual documents
    for (const entity of oldGraph.entities) {
      await newStorage.saveEntity(userId, {
        ...entity,
        entityId: this.generateEntityId(entity),
        searchText: this.generateSearchText(entity)
      });
    }
    
    // Migrate relations to individual documents
    for (const relation of oldGraph.relations) {
      await newStorage.saveRelation(userId, {
        ...relation,
        relationId: this.generateRelationId(relation)
      });
    }
    
    // Create search index
    await newStorage.rebuildIndex(userId);
    
    // Backup old data
    await this.backupLegacyData(userId, oldGraph);
  }
}
```

## Performance Comparison

### Current Single Document Approach
```
- Read entire graph: O(1) query, O(n) transfer
- Add entity: O(n) - rewrite entire document  
- Search entities: O(n) - scan all entities
- Graph traversal: O(n²) - in application memory
- Storage limit: 16MB MongoDB document limit
```

### Proposed Entity-per-Document Approach  
```
- Read entity: O(1) query, O(1) transfer
- Add entity: O(1) - single document write
- Search entities: O(log n) - indexed text search
- Graph traversal: O(k) where k = result size
- Storage limit: Virtually unlimited
```

## User Isolation Strategies

### Option A: Collection-per-Server (Recommended)
```
Collections: mcp_memory_entities, mcp_memory_relations, mcp_todos
User isolation: userId field in each document
Pros: Simple management, efficient indexing, cross-user analytics possible
Cons: Requires careful query design to prevent data leaks
```

### Option B: Collection-per-User-per-Server  
```
Collections: user_+1234567890_memory_entities, user_+1234567890_todos
User isolation: Separate collections entirely
Pros: Complete isolation, easier backup/restore per user
Cons: Collection proliferation, index inefficiency, complex management
```

### Option C: Database-per-User
```
Databases: user_+1234567890, user_alice_email_com  
Collections: memory_entities, memory_relations, todos
Pros: Maximum isolation, independent scaling
Cons: Connection pooling complexity, backup complexity
```

**Recommendation**: Use **Option A** with robust query middleware to ensure user isolation.

## Implementation Checklist

### Immediate (Week 1)
- [ ] Implement PaginatedGraphStorage for memory server
- [ ] Create entity and relation collections with proper indexes
- [ ] Add migration tool for existing single-document graphs
- [ ] Update memory MCP server to use new storage

### Short Term (Week 2-3)  
- [ ] Implement search functionality across entities
- [ ] Add graph traversal queries (limited depth)
- [ ] Create user summary/index collections
- [ ] Performance testing with large graphs

### Medium Term (Month 2)
- [ ] Add Redis caching layer for frequent queries
- [ ] Implement GraphQL interface for complex queries
- [ ] Add graph analytics and insights
- [ ] Consider external graph database integration

### Long Term (Month 3+)
- [ ] Evaluate Neo4j/ArangoDB integration
- [ ] Implement graph machine learning features
- [ ] Add collaborative graph features
- [ ] Scale testing with 1000+ users

## Conclusion

The proposed tiered architecture provides:

1. **Immediate scalability** beyond MongoDB's 16MB limit
2. **Performance optimization** for different data types  
3. **Future-proofing** with external graph database path
4. **User isolation** with efficient resource utilization
5. **Backward compatibility** with existing systems

This approach allows you to start with enhanced MongoDB collections and gradually migrate to specialized graph databases as your user base and graph complexity grows. 