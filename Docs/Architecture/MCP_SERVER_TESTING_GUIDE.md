# MCP Server Testing Guide

## Comprehensive Testing Framework for MCP Servers with Web UI and Data Persistence

*Based on lessons learned from organizing and optimizing the grocery-list MCP server test suite*

---

## Table of Contents

1. [Test Organization Structure](#test-organization-structure)
2. [Core Testing Principles](#core-testing-principles)
3. [Test Environment Setup](#test-environment-setup)
4. [Unit Testing Patterns](#unit-testing-patterns)
5. [Integration Testing](#integration-testing)
6. [Web UI Testing](#web-ui-testing)
7. [Data Isolation & Mocking](#data-isolation--mocking)
8. [Test Lifecycle Management](#test-lifecycle-management)
9. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
10. [Best Practices Checklist](#best-practices-checklist)

---

## Test Organization Structure

### Directory Layout

```
your-mcp-server/
├── tests/
│   ├── helpers/
│   │   ├── test-utilities.js           # Core test framework
│   │   └── test-utilities-validation.js # Self-testing utilities
│   ├── unit/
│   │   ├── server-manager.test.js      # Core business logic
│   │   └── web-ui-integration.test.js  # Web UI components
│   ├── integration/
│   │   └── mcp-server.test.js          # Full MCP protocol tests
│   └── run-all-tests.js               # Comprehensive test runner
├── package.json                       # Test scripts
└── src/                               # Source code
```

### Test Script Configuration

```json
{
  "scripts": {
    "test": "npm run build && node tests/run-all-tests.js",
    "test:unit": "npm run build && node tests/unit/*.test.js",
    "test:integration": "npm run build && node tests/integration/*.test.js",
    "test:utilities": "node tests/helpers/test-utilities-validation.js",
    "test:cleanup": "node -e \"require('./tests/helpers/test-utilities.js').cleanupTestEnvironment()\""
  }
}
```

---

## Core Testing Principles

### 1. **Test Isolation**
- Each test should run independently
- No shared state between tests
- Clean data isolation per user/test case

### 2. **Proper Exit Behavior**
- **Graceful shutdown is REQUIRED** - all MCP servers must handle SIGINT/SIGTERM properly
- Tests must verify that servers exit cleanly when interrupted
- No hanging processes or resource leaks after shutdown
```javascript
// ❌ BAD: Tests hang indefinitely
runner.run().catch(console.error);

// ✅ GOOD: Tests exit properly
async function runTests() {
    try {
        const success = await runner.run();
        await cleanupTestEnvironment();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Test execution failed:', error);
        await cleanupTestEnvironment();
        process.exit(1);
    }
}
runTests();
```

### 3. **Resource Cleanup**
```javascript
// Always clean up resources in tests
afterEach(async () => {
    await manager.cleanup();
    await webUI.cleanup();
});
```

### 4. **Deterministic Test Data**
```javascript
// Use unique test file paths to avoid interference
export function setupTestEnvironment() {
    const testId = Math.random().toString(36).substr(2, 9);
    process.env.STORAGE_FILE_PATH = `./test-data-${testId}.json`;
    process.env.NODE_ENV = 'test';
    process.env.USER_BASED = 'false';
}
```

---

## Test Environment Setup

### Environment Variables for Testing

```javascript
export function setupTestEnvironment() {
    process.env.NODE_ENV = 'test';
    process.env.MCP_USER_ID = 'test-user';
    process.env.MCP_STORAGE_TYPE = 'json';
    
    // Use unique test file paths to avoid interference
    const testId = Math.random().toString(36).substr(2, 9);
    process.env.DATA_FILE_PATH = `./test-data-${testId}.json`;
    
    // Disable user-based storage for predictable tests
    process.env.MCP_USER_BASED = 'false';
    process.env.MCP_DEBUG = 'false';
}
```

### Cleanup Function

```javascript
export async function cleanupTestEnvironment() {
    const testFiles = [
        './test-data.json',
        './test-data.json.backup'
    ];

    // Clean up dynamically named test files
    const currentTestFile = process.env.DATA_FILE_PATH;
    if (currentTestFile) {
        testFiles.push(currentTestFile);
        testFiles.push(currentTestFile + '.backup');
    }

    // Pattern-based cleanup for any remaining test files
    try {
        const files = await fs.readdir('.');
        const testFilePattern = /^test-.*\.json/;
        for (const file of files) {
            if (testFilePattern.test(file)) {
                testFiles.push(file);
            }
        }
    } catch (e) {
        // Directory read failed, ignore
    }

    for (const file of testFiles) {
        try {
            await fs.unlink(file);
        } catch (e) {
            // File might not exist, that's okay
        }
    }
}
```

---

## Unit Testing Patterns

### Test Runner Framework

```javascript
export class TestRunner {
    constructor(name = 'Test Suite') {
        this.name = name;
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, testFn) {
        this.tests.push({ name, testFn });
    }

    async run() {
        console.log(`🧪 Running ${this.name}`);
        console.log('='.repeat(60));

        const startTime = Date.now();

        for (const { name, testFn } of this.tests) {
            try {
                console.log(`\n🔍 ${name}`);
                await testFn();
                console.log(`✅ PASSED: ${name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ FAILED: ${name}`);
                console.log(`   Error: ${error.message}`);
                this.failed++;
            }
        }

        const duration = Date.now() - startTime;
        console.log('\n' + '='.repeat(60));
        console.log(`📊 Results: ${this.passed} passed, ${this.failed} failed (${duration}ms)`);

        return this.failed === 0;
    }
}
```

### Assertion Library

```javascript
export const assert = {
    equal(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
        }
    },

    true(condition, message = '') {
        if (!condition) {
            throw new Error(message || 'Expected condition to be true');
        }
    },

    hasProperty(obj, prop, message = '') {
        if (!obj || typeof obj !== 'object' || !(prop in obj)) {
            throw new Error(`${message ? message + ': ' : ''}expected object to have property ${prop}`);
        }
    },

    isArray(value, message = '') {
        if (!Array.isArray(value)) {
            throw new Error(`${message ? message + ': ' : ''}expected array, got ${typeof value}`);
        }
    }
};
```

### Mock Manager Pattern

```javascript
export class MockServerManager {
    constructor() {
        this.userItems = new Map(); // Map of userId -> items array
        this.nextId = 1;
    }

    async initialize() {
        // Mock initialization
    }

    async getItems(userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }
        return [...this.userItems.get(userKey)];
    }

    async addItem(name, category, userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }
        
        const newItem = {
            id: (this.nextId++).toString(),
            name: name.trim(),
            category: category || "other",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.userItems.get(userKey).push(newItem);
        return newItem;
    }

    async cleanup() {
        this.userItems.clear();
        this.nextId = 1;
    }
}
```

---

## Integration Testing

### MCP Server Test Helper

```javascript
export class MCPServerTestHelper {
    constructor(serverPath = 'dist/index.js') {
        this.serverPath = serverPath;
        this.server = null;
    }

    async startServer(env = {}) {
        const testId = Math.random().toString(36).substr(2, 9);
        const testEnv = {
            ...process.env,
            MCP_STORAGE_TYPE: 'json',
            DATA_FILE_PATH: `./test-data-${testId}.json`,
            MCP_USER_BASED: 'false',
            MCP_DEBUG: 'false',
            NODE_ENV: 'test',
            ...env
        };

        return new Promise((resolve, reject) => {
            this.server = spawn('node', [this.serverPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: testEnv,
                cwd: process.cwd()
            });

            let serverReady = false;
            const timeout = setTimeout(() => {
                if (!serverReady) {
                    this.server.kill();
                    reject(new Error('Server startup timeout'));
                }
            }, 15000);

            this.server.stderr.on('data', (data) => {
                const dataStr = data.toString();
                // Look for initialization messages
                if (dataStr.includes('Manager initialized') ||
                    dataStr.includes('Loading .env file')) {
                    serverReady = true;
                    clearTimeout(timeout);
                    resolve();
                    return;
                }
            });

            this.server.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            // Send initial request to wake up the server
            setTimeout(() => {
                if (!serverReady) {
                    try {
                        this.server.stdin.write(JSON.stringify({
                            jsonrpc: '2.0',
                            id: 'init',
                            method: 'tools/list',
                            params: {}
                        }) + '\n');
                    } catch (e) {
                        // Ignore write errors
                    }
                }
            }, 1000);
        });
    }

    async sendRequest(request) {
        if (!this.server) {
            throw new Error('Server not started');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 5000);

            const onResponse = (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === request.id) {
                            clearTimeout(timeout);
                            this.server.stdout.removeListener('data', onResponse);
                            resolve(response);
                            return;
                        }
                    } catch (e) {
                        // Ignore non-JSON lines
                    }
                }
            };

            this.server.stdout.on('data', onResponse);
            this.server.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async stopServer() {
        if (this.server) {
            this.server.kill();
            this.server = null;
        }
    }
}
```

### MCP Request Generators

```javascript
export const testData = {
    users: {
        testUser: 'test-user-1',
        testUser2: 'test-user-2'
    },
    
    mcpRequests: {
        addItem: (name, category) => ({
            jsonrpc: "2.0",
            id: Math.random(),
            method: "tools/call",
            params: {
                name: "add_item",
                arguments: { name, category }
            }
        }),

        getList: () => ({
            jsonrpc: "2.0",
            id: Math.random(),
            method: "tools/call",
            params: {
                name: "get_list",
                arguments: {}
            }
        }),

        deleteItem: (id) => ({
            jsonrpc: "2.0",
            id: Math.random(),
            method: "tools/call",
            params: {
                name: "delete_item",
                arguments: { id }
            }
        })
    }
};
```

---

## Web UI Testing

### Web UI Integration Testing

```javascript
// Test Web UI Manager initialization
runner.test('UI Manager initializes correctly', async () => {
    const manager = new MockServerManager();
    const webUI = new ServerWebUIManager(manager, true);

    assert.true(webUI instanceof ServerWebUIManager, 'Should create instance');
    assert.true(typeof webUI.handleGetWebUI === 'function', 'Should have handleGetWebUI method');

    await webUI.cleanup();
});

// Test action handlers
runner.test('Toggle action handler works correctly', async () => {
    const manager = new MockServerManager();
    const webUI = new ServerWebUIManager(manager, true);

    // Add test item
    const item = await manager.addItem('Test Item', 'test', 'test-user');

    // Test toggle action
    const toggleResult = await webUI['handleUIUpdate']('toggle', {
        id: item.id,
        field: 'completed',
        value: true
    }, 'test-user');

    assert.true(toggleResult.success, 'Toggle should succeed');
    assert.hasProperty(toggleResult, 'message', 'Should have success message');
    assert.hasProperty(toggleResult, 'item', 'Should return updated item');

    await webUI.cleanup();
});
```

### Form Testing Patterns

```javascript
// Test form schema generation
runner.test('Add action returns form schema when no data provided', async () => {
    const manager = new MockServerManager();
    const webUI = new ServerWebUIManager(manager, true);

    const formResult = await webUI['handleUIUpdate']('add', {}, 'test-user');

    assert.true(formResult.success, 'Add form request should succeed');
    assert.true(formResult.showForm, 'Should indicate form should be shown');
    assert.hasProperty(formResult, 'form', 'Should have form schema');
    assert.hasProperty(formResult.form, 'fields', 'Form should have fields');
    assert.isArray(formResult.form.fields, 'Fields should be array');

    // Check specific field requirements
    const nameField = formResult.form.fields.find(f => f.key === 'name');
    assert.true(nameField && nameField.required, 'Name field should be required');

    await webUI.cleanup();
});
```

---

## Data Isolation & Mocking

### User-Based Data Isolation

```javascript
export class MockDataManager {
    constructor() {
        this.userData = new Map(); // userId -> user data
        this.nextId = 1;
    }

    getUserData(userId) {
        const userKey = userId || 'default';
        if (!this.userData.has(userKey)) {
            this.userData.set(userKey, {
                items: [],
                settings: {},
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            });
        }
        return this.userData.get(userKey);
    }

    async addItem(name, userId) {
        const userData = this.getUserData(userId);
        const newItem = {
            id: (this.nextId++).toString(),
            name: name.trim(),
            createdAt: new Date().toISOString()
        };
        userData.items.push(newItem);
        userData.metadata.updatedAt = new Date().toISOString();
        return newItem;
    }

    async getItems(userId) {
        const userData = this.getUserData(userId);
        return [...userData.items];
    }

    async cleanup() {
        this.userData.clear();
        this.nextId = 1;
    }
}
```

### Storage Framework Mocking

```javascript
// Mock the mcp-data storage framework
export class MockStorageFactory {
    static create() {
        return {
            async read() {
                return { items: [], metadata: { updatedAt: new Date().toISOString() } };
            },
            async write(data) {
                // Mock write operation
                return true;
            },
            async disconnect() {
                // Mock cleanup
            }
        };
    }
}
```

---

## Test Lifecycle Management

### Comprehensive Test Runner

```javascript
export class ComprehensiveTestRunner {
    constructor() {
        this.testSuites = [];
        this.stats = {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            totalDuration: 0
        };
    }

    addTestSuite(suite) {
        this.testSuites.push(suite);
    }

    async runTestSuite(testSuite) {
        console.log(`\n📋 Running: ${testSuite.name}`);
        console.log(`   ${testSuite.description}`);
        console.log('   ' + '-'.repeat(60));

        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const proc = spawn(testSuite.command, testSuite.args, {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    NODE_ENV: 'test'
                }
            });

            // Handle output and timeouts...
            const timeout = setTimeout(() => {
                proc.kill('SIGTERM');
                resolve({
                    name: testSuite.name,
                    success: false,
                    error: 'Test timed out',
                    duration: Date.now() - startTime,
                    required: testSuite.required
                });
            }, testSuite.timeout);

            proc.on('close', (code) => {
                clearTimeout(timeout);
                resolve({
                    name: testSuite.name,
                    success: code === 0,
                    error: code !== 0 ? `Process exited with code ${code}` : null,
                    duration: Date.now() - startTime,
                    required: testSuite.required
                });
            });
        });
    }

    async run() {
        console.log('🧪 Comprehensive Test Suite');
        console.log('='.repeat(60));

        const results = [];
        for (const suite of this.testSuites) {
            const result = await this.runTestSuite(suite);
            results.push(result);
            
            if (result.success) {
                console.log(`   ✅ PASSED (${result.duration}ms)`);
                this.stats.passedTests++;
            } else {
                console.log(`   ❌ FAILED (${result.duration}ms)`);
                console.log(`   Error: ${result.error}`);
                this.stats.failedTests++;
            }
        }

        this.printSummary(results);
        return this.stats.failedTests === 0;
    }

    printSummary(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 COMPREHENSIVE TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Test Suites: ${results.length}`);
        console.log(`Passed: ${this.stats.passedTests}`);
        console.log(`Failed: ${this.stats.failedTests}`);
        console.log(`Success Rate: ${Math.round((this.stats.passedTests / results.length) * 100)}%`);
    }
}
```

---

## Common Pitfalls & Solutions

### ❌ Problem: Tests Never Exit

**Cause**: Unclean resource cleanup, hanging timers, open connections, or missing graceful shutdown handlers

**Solution**: 
```javascript
// Always use explicit process.exit() with proper cleanup
async function runTests() {
    try {
        const success = await runner.run();
        await cleanupTestEnvironment();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Test execution failed:', error);
        await cleanupTestEnvironment();
        process.exit(1);
    }
}

// MCP servers must implement graceful shutdown
const cleanup = async () => {
    console.error('🛑 Shutting down server...');
    try {
        // Clean up resources (storage, web UI, etc.)
        if (server['storage'] && 'cleanup' in server['storage']) {
            await server['storage'].cleanup();
        }
        console.error('✅ Server shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

### ❌ Problem: Data Pollution Between Tests

**Cause**: Shared storage files or state between test runs

**Solution**:
```javascript
// Use unique test file paths
export function setupTestEnvironment() {
    const testId = Math.random().toString(36).substr(2, 9);
    process.env.DATA_FILE_PATH = `./test-data-${testId}.json`;
}

// Always clean up in each test
afterEach(async () => {
    await manager.cleanup();
});
```

### ❌ Problem: Flaky Integration Tests

**Cause**: Race conditions, insufficient startup time, or resource conflicts

**Solution**:
```javascript
// Increase timeouts and add proper startup detection
async startServer(env = {}) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (!serverReady) {
                this.server.kill();
                reject(new Error('Server startup timeout'));
            }
        }, 15000); // Adequate timeout

        this.server.stderr.on('data', (data) => {
            // Look for specific initialization messages
            if (dataStr.includes('Manager initialized')) {
                serverReady = true;
                clearTimeout(timeout);
                resolve();
            }
        });
    });
}
```

### ❌ Problem: Hard-Coded Test Data

**Cause**: Using fixed IDs or assumptions about data state

**Solution**:
```javascript
// Use dynamic data and actual returned IDs
const item = await manager.addItem('Test Item', 'category', 'test-user');
const result = await manager.deleteItem(item.id, 'test-user'); // Use actual ID
```

---

## Best Practices Checklist

### ✅ Test Organization
- [ ] Tests organized in `tests/{helpers,unit,integration}/`
- [ ] Comprehensive test runner with proper reporting
- [ ] Test utilities are self-validating
- [ ] Clear separation between unit and integration tests

### ✅ Test Environment
- [ ] Unique test file paths to prevent conflicts
- [ ] Environment variables properly configured for testing
- [ ] Test-specific configuration isolated from production

### ✅ Data Management
- [ ] User data isolation implemented
- [ ] Mock managers provide clean, isolated data
- [ ] Proper cleanup after each test
- [ ] No shared state between tests

### ✅ Test Execution
- [ ] Tests exit properly with correct exit codes
- [ ] Resource cleanup prevents hanging
- [ ] Timeouts configured for reliable execution
- [ ] Error handling provides useful debugging information
- [ ] **Graceful shutdown handlers implemented and tested**
- [ ] **SIGINT/SIGTERM signals handled properly**
- [ ] **No hanging processes after shutdown**

### ✅ MCP Server Testing
- [ ] Integration tests cover full MCP protocol
- [ ] JSON-RPC communication tested end-to-end
- [ ] Tool definitions and responses validated
- [ ] Error handling tested for invalid requests

### ✅ Web UI Testing
- [ ] Action handlers tested with various input formats
- [ ] Form generation and submission tested
- [ ] Data source integration validated
- [ ] UI update lifecycle tested

### ✅ Coverage & Quality
- [ ] Core business logic has 100% unit test coverage
- [ ] Integration tests cover real-world workflows
- [ ] Error conditions and edge cases tested
- [ ] Performance characteristics validated

---

## Example Implementation

For a complete reference implementation, see the `grocery-list` MCP server test suite, which demonstrates all these patterns in practice:

- **Test Utilities**: `tests/helpers/test-utilities.js`
- **Unit Tests**: `tests/unit/grocery-manager.test.js`
- **Web UI Tests**: `tests/unit/web-ui-integration.test.js`
- **Integration Tests**: `tests/integration/mcp-server.test.js`
- **Test Runner**: `tests/run-all-tests.js`

---

## Conclusion

This testing framework provides a solid foundation for building reliable, maintainable MCP servers with confidence. By following these patterns, your servers will have:

1. **Professional test organization** that scales with complexity
2. **Reliable test execution** that doesn't hang or pollute data
3. **Comprehensive coverage** of both unit and integration scenarios
4. **Maintainable test code** that serves as documentation
5. **CI/CD readiness** with proper exit codes and reporting

Remember: **Good tests are an investment in code quality, developer confidence, and long-term maintainability.** Take the time to implement them properly from the start. 