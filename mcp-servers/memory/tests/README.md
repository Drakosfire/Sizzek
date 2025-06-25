# Memory MCP Server Test Suite

This test suite provides comprehensive testing for the Memory MCP Server using the new **PaginatedGraphStorage** architecture with MongoDB backend and user isolation.

## 🏗️ Architecture Overview

The Memory MCP Server implements a graph-based memory system with:
- **9 MCP Tools**: Entity/relation management, observations, search, and graph operations
- **User Isolation**: Multi-tenant data separation by USER_ID
- **MongoDB Storage**: Scalable document-based storage with proper indexing
- **Graph Operations**: Efficient entity and relationship management

## 📁 Test Structure

```
tests/
├── package.json              # Test dependencies and scripts
├── .env.test                 # Test environment configuration
├── helpers/                  # Test utilities and setup
│   ├── test-setup.js        # Global test environment
│   ├── test-database.js     # MongoDB test database management
│   ├── test-data.js         # Realistic test data generators
│   ├── mock-mcp-client.js   # MCP server simulation
│   └── assertions.js        # Custom validation functions
├── unit/                    # Unit tests
│   ├── storage/             # PaginatedGraphStorage tests
│   └── mcp-tools/           # Individual MCP tool tests
├── integration/             # End-to-end workflow tests
├── performance/             # Load and performance tests
└── edge-cases/              # Error handling and edge case tests
```

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v18+)
2. **MongoDB** running locally on port 27017
3. **Built mcp-data package** (see setup step 2)

### Setup

1. **Navigate to test directory:**
   ```bash
   cd Sizzek/mcp-servers/memory/tests
   ```

2. **Build the mcp-data dependency:**
   ```bash
   cd ../../../mcp-data
   npm install
   npm run build
   cd ../mcp-servers/memory/tests
   ```

3. **Install test dependencies:**
   ```bash
   npm install
   ```

4. **Verify environment:**
   ```bash
   npm run test:basic
   ```

### Running Tests

- **All tests:** `npm test`
- **Unit tests only:** `npm run test:unit`
- **Storage tests:** `npm run test:storage`
- **MCP tools tests:** `npm run test:tools`
- **With coverage:** `npm run test:coverage`
- **Watch mode:** `npm run test:watch`

## 🧪 Test Categories

### Unit Tests - Storage Layer
Tests the PaginatedGraphStorage implementation:
- Entity CRUD operations
- Relation management
- User isolation
- MongoDB operations
- Data validation

### Unit Tests - MCP Tools
Tests each of the 9 MCP tools individually:
- `create_entities` - Entity creation and validation
- `create_relations` - Relationship establishment
- `add_observations` - Observation attachment
- `delete_entities` - Entity removal
- `delete_observations` - Observation cleanup
- `delete_relations` - Relationship removal
- `read_graph` - Graph data retrieval
- `search_nodes` - Entity search functionality
- `open_nodes` - Node expansion operations

### Integration Tests
End-to-end workflows testing:
- Complete conversation memory flows
- Multi-user scenario testing
- LibreChat SMS integration patterns
- Complex graph operations

### Performance Tests
Load and scalability testing:
- Large dataset operations
- Concurrent user scenarios
- Memory usage optimization
- Query performance benchmarks

## 🔧 Configuration

### Environment Variables (.env.test)
```bash
MONGODB_CONNECTION_STRING=mongodb://localhost:27017
MONGODB_TEST_DATABASE=mcp_test_db
MONGODB_COLLECTION_PREFIX=test_memory
NODE_ENV=test
MCP_STORAGE_TYPE=paginated-graph
MCP_USER_BASED=true
MCP_DEBUG=false
TEST_CLEANUP_ON_EXIT=true
```

### MongoDB Setup
The tests automatically create and clean up test databases. Ensure MongoDB is running:
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB if needed
sudo systemctl start mongod
```

## 📝 Writing New Tests

### Storage Test Example
```javascript
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/test-database.js';
import { createTestUser, generateEntityData } from '../helpers/test-data.js';
import { PaginatedGraphStorage } from '@sizzek/mcp-data';

describe('Entity Operations', function() {
    let storage;
    let testUser;

    beforeEach(async function() {
        const db = await setupTestDatabase();
        testUser = createTestUser();
        storage = new PaginatedGraphStorage(db, testUser.id);
    });

    afterEach(async function() {
        await cleanupTestDatabase();
    });

    it('should create entities with proper validation', async function() {
        const entityData = generateEntityData();
        const result = await storage.createEntity(entityData);
        
        expect(result).to.have.property('id');
        expect(result.name).to.equal(entityData.name);
        expect(result.userId).to.equal(testUser.id);
    });
});
```

### MCP Tool Test Example
```javascript
import { testMCPTool } from '../helpers/mock-mcp-client.js';
import { validateEntityCreation } from '../helpers/assertions.js';

describe('create_entities MCP Tool', function() {
    it('should handle valid entity creation requests', async function() {
        const request = {
            name: 'create_entities',
            arguments: {
                entities: [{ name: 'Test Entity', type: 'concept' }]
            }
        };

        const response = await testMCPTool(request);
        validateEntityCreation(response);
    });
});
```

## 🛠️ Helper Utilities

### Test Data Generators
- `createTestUser()` - Generate test user with isolation
- `generateEntityData()` - Create realistic entity data
- `generateRelationData()` - Create relationship data
- `createTestConversation()` - Generate conversation context

### Test Database Management
- `setupTestDatabase()` - Initialize clean test database
- `cleanupTestDatabase()` - Remove test data
- `seedTestData()` - Populate with sample data

### MCP Tool Testing
- `testMCPTool(request)` - Simulate MCP tool calls
- `mockMCPServer()` - Create test MCP server instance
- `validateMCPResponse()` - Verify response format

### Custom Assertions
- `validateEntityCreation()` - Verify entity creation
- `validateUserIsolation()` - Check data separation
- `validateGraphStructure()` - Verify graph integrity

## 📊 Test Coverage

Current coverage targets:
- **Storage Layer**: 95%+ (core functionality)
- **MCP Tools**: 90%+ (all 9 tools)
- **Integration**: 80%+ (key workflows)
- **Error Handling**: 85%+ (edge cases)

Run coverage reports:
```bash
npm run test:coverage
```

## 🐛 Debugging

### Debug Mode
Enable detailed logging:
```bash
MCP_DEBUG=true npm test
```

### Test Isolation Issues
If tests interfere with each other:
```bash
npm run test:isolated  # Run tests sequentially
```

### MongoDB Connection Issues
```bash
# Check MongoDB logs
sudo journalctl -u mongod -f

# Test connection manually
npm run test:connection
```

## 🚀 Migration Notes

This test suite was migrated from legacy test files:
- `test-phase-2-1-integration.js` (archived)
- `test-mongodb-storage.js` (archived)
- `test-user-isolation.js` (archived)
- `debug-mcp-storage.js` (archived)

The new architecture provides:
- ✅ **User Isolation**: Proper multi-tenant separation
- ✅ **Scalability**: Individual document storage
- ✅ **Performance**: Optimized MongoDB queries
- ✅ **Maintainability**: Clear test organization
- ✅ **Coverage**: Comprehensive test scenarios

## 📚 Related Documentation

- [Memory MCP Server README](../README.md)
- [PaginatedGraphStorage Architecture](../../../mcp-data/ARCHITECTURE_GUIDE.md)
- [LibreChat MCP Integration](../LIBRECHAT_INTEGRATION.md)
- [Cleanup Migration Plan](../CLEANUP_PLAN.md)

## 🤝 Contributing

When adding new tests:
1. Follow the established patterns in `helpers/`
2. Use descriptive test names
3. Include both positive and negative test cases
4. Add performance considerations for large datasets
5. Ensure proper cleanup in `afterEach` hooks
6. Update this README if adding new test categories

## 📞 Support

For issues with the test suite:
1. Check MongoDB is running and accessible
2. Verify `@sizzek/mcp-data` package is built
3. Review environment configuration in `.env.test`
4. Run `npm run test:basic` to verify setup
5. Check the archived test files for legacy reference patterns 