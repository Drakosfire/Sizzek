# Knowledge Graph Memory Server

A basic implementation of persistent memory using a local knowledge graph. This lets Claude remember information about the user across chats.

## Core Concepts

### Entities
Entities are the primary nodes in the knowledge graph. Each entity has:
- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event")
- A list of observations

Example:
```json
{
  "name": "John_Smith",
  "entityType": "person",
  "observations": ["Speaks fluent Spanish"]
}
```

### Relations
Relations define directed connections between entities. They are always stored in active voice and describe how entities interact or relate to each other.

Example:
```json
{
  "from": "John_Smith",
  "to": "Anthropic",
  "relationType": "works_at"
}
```
### Observations
Observations are discrete pieces of information about an entity. They are:

- Stored as strings
- Attached to specific entities
- Can be added or removed independently
- Should be atomic (one fact per observation)

Example:
```json
{
  "entityName": "John_Smith",
  "observations": [
    "Speaks fluent Spanish",
    "Graduated in 2019",
    "Prefers morning meetings"
  ]
}
```

## API

### Tools
- **create_entities**
  - Create multiple new entities in the knowledge graph
  - Input: `entities` (array of objects)
    - Each object contains:
      - `name` (string): Entity identifier
      - `entityType` (string): Type classification
      - `observations` (string[]): Associated observations
  - Ignores entities with existing names

- **create_relations**
  - Create multiple new relations between entities
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type in active voice
  - Skips duplicate relations

- **add_observations**
  - Add new observations to existing entities
  - Input: `observations` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `contents` (string[]): New observations to add
  - Returns added observations per entity
  - Fails if entity doesn't exist

- **delete_entities**
  - Remove entities and their relations
  - Input: `entityNames` (string[])
  - Cascading deletion of associated relations
  - Silent operation if entity doesn't exist

- **delete_observations**
  - Remove specific observations from entities
  - Input: `deletions` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `observations` (string[]): Observations to remove
  - Silent operation if observation doesn't exist

- **delete_relations**
  - Remove specific relations from the graph
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type
  - Silent operation if relation doesn't exist

- **read_graph**
  - Read the entire knowledge graph
  - No input required
  - Returns complete graph structure with all entities and relations

- **search_nodes**
  - Search for nodes based on query
  - Input: `query` (string)
  - Searches across:
    - Entity names
    - Entity types
    - Observation content
  - Returns matching entities and their relations

- **open_nodes**
  - Retrieve specific nodes by name
  - Input: `names` (string[])
  - Returns:
    - Requested entities
    - Relations between requested entities
  - Silently skips non-existent nodes

# LibreChat Integration Guide

## MongoDB Integration with LibreChat

This memory server has been enhanced for seamless integration with LibreChat's MongoDB database, providing persistent user-specific memory storage.

### Key Features
- **User Isolation**: Each LibreChat user gets their own memory space
- **MongoDB Storage**: Persistent storage using LibreChat's existing database
- **Enhanced Debugging**: Comprehensive logging for troubleshooting
- **Environment Flexibility**: Support for both JSON and MongoDB storage

### Critical Configuration Requirements

**🚨 IMPORTANT**: MCP servers run as HOST processes, not Docker containers. They connect to containerized MongoDB via `localhost:27017`.

#### LibreChat Configuration (`librechat.yaml`)

```yaml
mcpServers:
  remember:
    type: stdio
    command: node
    args:
      - "../Sizzek/mcp-servers/memory/dist/index.js"
    timeout: 30000
    initTimeout: 10000
    env:
      # MongoDB Configuration (REQUIRED for LibreChat integration)
      MCP_STORAGE_TYPE: "paginated-graph"
      MCP_USER_BASED: "true"
      MONGO_URI: "mongodb://localhost:27017/LibreChat"  # HOST connection!
      MONGODB_DATABASE: "LibreChat"
      MONGODB_COLLECTION_PREFIX: "mcp_memory"
      MCP_USER_ID: "${USER_ID}"  # LibreChat provides this automatically
      
      # Optional: Enhanced debugging
      MCP_DEBUG: "true"
    stderr: inherit
```

**⚠️ Common Configuration Mistakes**:
- Using `mongodb://mongodb:27017` (Docker hostname) instead of `localhost:27017`
- Forgetting to set `MCP_USER_BASED: "true"` for user isolation
- Not including `dotenv` configuration in the MCP server startup

### Environment Variables

The server supports multiple configuration methods:

```bash
# MongoDB Configuration (Recommended for LibreChat)
MCP_STORAGE_TYPE=paginated-graph
MCP_USER_BASED=true
MONGO_URI=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION_PREFIX=mcp_memory
MCP_USER_ID=${USER_ID}

# JSON File Configuration (Fallback)
MCP_STORAGE_TYPE=json
MEMORY_FILE_PATH=./memory_files/memory.json

# Debugging
MCP_DEBUG=true
```

### Debugging Common Issues

#### 30-Second Timeout Issues
**Symptoms**: MCP server hangs for exactly 30 seconds then times out
**Root Causes**:
1. Wrong MongoDB connection string (`mongodb://mongodb:27017` vs `localhost:27017`)
2. Missing environment variable loading (`dotenv.config()` not called)
3. Variable scope issues in LibreChat's MCP service

**Solutions**:
1. Use `mongodb://localhost:27017` for host-based MCP servers
2. Ensure `dotenv.config()` is called early in server startup
3. Check LibreChat's `/api/server/services/MCP.js` for variable scope errors

#### Environment Variables Not Loading
**Symptoms**: Empty environment variables (`{}`)
**Root Cause**: Missing `dotenv.config()` in MCP server
**Solution**: Add to server startup:
```javascript
import dotenv from 'dotenv';
dotenv.config();
```

#### User Isolation Not Working
**Symptoms**: All users see the same memory data
**Root Cause**: `MCP_USER_BASED` not enabled or `MCP_USER_ID` not set
**Solution**: 
```yaml
env:
  MCP_USER_BASED: "true"
  MCP_USER_ID: "${USER_ID}"
```

### Enhanced Logging

For debugging, the server includes comprehensive logging:

```javascript
// Environment verification
console.log('[Memory MCP] Environment loaded:', {
  MONGO_URI: process.env.MONGO_URI ? 'SET' : 'MISSING',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE,
  MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE,
  MCP_USER_BASED: process.env.MCP_USER_BASED
});

// Operation tracing
console.log('[Memory MCP] Adding observations for user:', userId);
console.log('[Memory MCP] Storage operation result:', JSON.stringify(result, null, 2));
```

# Usage with Claude Desktop

### Setup

Add this to your claude_desktop_config.json:

#### Docker

```json
{
  "mcpServers": {
    "memory": {
      "command": "docker",
      "args": ["run", "-i", "-v", "claude-memory:/app/dist", "--rm", "mcp/memory"]
    }
  }
}
```

#### NPX
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

#### NPX with custom setting

The server can be configured using the following environment variables:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ],
      "env": {
        "MEMORY_FILE_PATH": "/path/to/custom/memory.json"
      }
    }
  }
}
```

- `MEMORY_FILE_PATH`: Path to the memory storage JSON file (default: `memory.json` in the server directory)

# VS Code Installation Instructions

For quick installation, use one of the one-click installation buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-memory%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-memory%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22-v%22%2C%22claude-memory%3A%2Fapp%2Fdist%22%2C%22--rm%22%2C%22mcp%2Fmemory%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22-v%22%2C%22claude-memory%3A%2Fapp%2Fdist%22%2C%22--rm%22%2C%22mcp%2Fmemory%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others. 

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

#### NPX

```json
{
  "mcp": {
    "servers": {
      "memory": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-memory"
        ]
      }
    }
  }
}
```

#### Docker

```json
{
  "mcp": {
    "servers": {
      "memory": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "-v",
          "claude-memory:/app/dist",
          "--rm",
          "mcp/memory"
        ]
      }
    }
  }
}
```

### System Prompt

The prompt for utilizing memory depends on the use case. Changing the prompt will help the model determine the frequency and types of memories created.

Here is an example prompt for chat personalization. You could use this prompt in the "Custom Instructions" field of a [Claude.ai Project](https://www.anthropic.com/news/projects). 

```
Follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always begin your chat by saying only "Remembering..." and retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     b) Store facts about them as observations
```

### Architectural Insights

#### MCP Server Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LibreChat Container                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            LibreChat Application                        │ │
│  │  ┌─────────────────────────────────────────────────────┐│ │
│  │  │        MCP Service                                  ││ │
│  │  │  - Spawns host MCP processes                       ││ │
│  │  │  - Passes USER_ID via environment                  ││ │
│  │  │  - Manages stdio communication                     ││ │
│  │  └─────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Host Machine                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │        MCP Memory Server Process                        │ │
│  │  - Runs as Node.js process on host                     │ │
│  │  - Connects to MongoDB via localhost:27017             │ │
│  │  - Loads environment from librechat.yaml               │ │
│  │  - Isolated storage per USER_ID                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    MongoDB Container                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            MongoDB Database                             │ │
│  │  Collections:                                           │ │
│  │  - users (LibreChat users)                             │ │
│  │  - conversations (chat history)                        │ │
│  │  - mcp_memory_entities (user memories)                 │ │
│  │  - mcp_memory_relations (user relationships)           │ │
│  │  - mcp_memory_summaries (user summaries)               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Configuration Priority Order

1. **librechat.yaml env section** (Highest priority)
2. **System environment variables**
3. **Process.env from .env files** (Requires dotenv.config())

#### Critical Success Factors

**✅ Essential Requirements**:
- MCP server must call `dotenv.config()` early in startup
- MongoDB connection string must use `localhost:27017` for host processes
- User isolation requires `MCP_USER_BASED=true` and proper `MCP_USER_ID`
- Enhanced logging essential for debugging complex integrations

**🚨 Common Failure Points**:
- Wrong connection string hostname (mongodb vs localhost)
- Missing environment variable loading
- Variable scope errors in LibreChat MCP service
- Inadequate logging making debugging nearly impossible

### Troubleshooting Checklist

#### Quick Diagnostic Commands

```bash
# Check if MCP server can connect to MongoDB
node -e "
const { MongoClient } = require('mongodb');
const client = new MongoClient('mongodb://localhost:27017/LibreChat');
client.connect().then(() => {
  console.log('✅ MongoDB connection successful');
  client.close();
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
});
"

# Verify environment variables are loading
node -e "
require('dotenv').config();
console.log('Environment check:', {
  MONGO_URI: process.env.MONGO_URI ? 'SET' : 'MISSING',
  MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE,
  MCP_USER_BASED: process.env.MCP_USER_BASED
});
"
```

#### Performance Monitoring

```javascript
// Add to MCP server for performance tracking
const startTime = Date.now();
console.log(`[Memory MCP] Storage operation completed in ${Date.now() - startTime}ms`);

// MongoDB operation monitoring
const mongoStartTime = Date.now();
await collection.insertOne(document);
console.log(`[Memory MCP] MongoDB insert took ${Date.now() - mongoStartTime}ms`);
```

## Building

Docker:

```sh
docker build -t mcp/memory -f src/memory/Dockerfile . 
```

TypeScript Build:
```sh
npm run build
```

Development:
```sh
npm run dev
```

## Testing with LibreChat

### Local Testing Setup

1. **Start LibreChat with MongoDB**:
   ```bash
   cd LibreChat
   docker-compose up mongodb -d
   npm start
   ```

2. **Build and Start MCP Server**:
   ```bash
   cd mcp-servers/memory
   npm run build
   ```

3. **Test Memory Operations**:
   ```bash
   # Test basic connectivity
   curl -X POST http://localhost:3080/api/ask/external \
     -H "Authorization: Bearer $EXTERNAL_MESSAGE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4o",
       "messages": [{"role": "user", "content": "Remember that I like pizza"}],
       "user": "test-user-123",
       "metadata": {"source": "test"}
     }'
   ```

### Integration Verification

```javascript
// Verify user isolation is working
const testUsers = ['user1', 'user2', 'user3'];
for (const userId of testUsers) {
  // Test that each user gets isolated memory storage
  // Verify MongoDB collections have user-specific data
}
```

## Database Exploration Commands

### Quick Database Overview

```bash
# Show all databases
docker exec chat-mongodb mongosh --eval "show dbs"

# Show collections in mcp_data database
docker exec chat-mongodb mongosh mcp_data --eval "db.getCollectionNames()"

# Count documents in each collection
docker exec chat-mongodb mongosh mcp_data --eval "
db.getCollectionNames().forEach(coll => {
  console.log(\`\${coll}: \${db[coll].countDocuments()} documents\`);
})"
```

### User Data Exploration

```bash
# Check user distribution across entities
docker exec chat-mongodb mongosh mcp_data --eval "
db.mcp_memory_entities.aggregate([
  { \$group: { _id: '\$userId', count: { \$sum: 1 } } },
  { \$sort: { count: -1 } }
]).forEach(user => console.log(\`User \${user._id}: \${user.count} entities\`));"

# Show sample entities for a specific user
docker exec chat-mongodb mongosh mcp_data --eval "
db.mcp_memory_entities.find({userId: 'YOUR_USER_ID'}).limit(5).forEach(entity => {
  console.log(\`- \${entity.name} (\${entity.entityType}): \${entity.observations.join(', ')}\`);
});"

# Show relations for a specific user
docker exec chat-mongodb mongosh mcp_data --eval "
db.mcp_memory_relations.find({userId: 'YOUR_USER_ID'}).forEach(rel => {
  console.log(\`\${rel.fromEntityId} \${rel.relationType} \${rel.toEntityId}\`);
});"
```

### Search and Query Examples

```bash
# Find entities by type
docker exec chat-mongodb mongosh mcp_data --eval "
db.mcp_memory_entities.find({
  userId: 'YOUR_USER_ID',
  entityType: 'person'
}).forEach(entity => console.log(\`\${entity.name}: \${entity.observations.join(', ')}\`));"

# Search entities by observation content
docker exec chat-mongodb mongosh mcp_data --eval "
db.mcp_memory_entities.find({
  userId: 'YOUR_USER_ID',
  \$text: { \$search: 'phone number' }
}).forEach(entity => console.log(\`\${entity.name}: \${entity.observations.join(', ')}\`));"

# Find all relationships involving a specific entity
docker exec chat-mongodb mongosh mcp_data --eval "
var entityName = 'Alan';
db.mcp_memory_relations.find({
  userId: 'YOUR_USER_ID',
  \$or: [
    { fromEntityId: entityName },
    { toEntityId: entityName }
  ]
}).forEach(rel => console.log(\`\${rel.fromEntityId} \${rel.relationType} \${rel.toEntityId}\`));"
```

### Performance and Indexing

```bash
# Check indexes on collections
docker exec chat-mongodb mongosh mcp_data --eval "
db.getCollectionNames().forEach(coll => {
  console.log(\`\\n=== \${coll} indexes ===\`);
  db[coll].getIndexes().forEach(idx => {
    console.log(\`  \${JSON.stringify(idx.key)}: \${idx.name}\`);
  });
});"

# Explain query performance
docker exec chat-mongodb mongosh mcp_data --eval "
db.mcp_memory_entities.find({userId: 'YOUR_USER_ID'}).explain('executionStats');"
```

### Data Verification

```bash
# Verify data integrity after migration
docker exec chat-mongodb mongosh mcp_data --eval "
console.log('=== DATA INTEGRITY CHECK ===');
console.log('Total entities:', db.mcp_memory_entities.countDocuments());
console.log('Total relations:', db.mcp_memory_relations.countDocuments());
console.log('Users with entities:', db.mcp_memory_entities.distinct('userId').length);
console.log('Users with relations:', db.mcp_memory_relations.distinct('userId').length);

// Check for orphaned relations (relations without corresponding entities)
var entityNames = db.mcp_memory_entities.distinct('name');
var orphanedRelations = db.mcp_memory_relations.find({
  \$and: [
    { fromEntityId: { \$nin: entityNames } },
    { toEntityId: { \$nin: entityNames } }
  ]
}).count();
console.log('Orphaned relations:', orphanedRelations);
"

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
