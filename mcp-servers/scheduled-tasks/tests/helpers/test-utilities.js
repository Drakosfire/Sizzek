import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';

// =============================================
// Test Environment Setup
// =============================================

export function setupTestEnvironment() {
    // Unique test ID to prevent conflicts
    const testId = Math.random().toString(36).substr(2, 9);

    // Core test environment
    process.env.NODE_ENV = 'test';
    process.env.MCP_USER_ID = 'test-user';
    process.env.MCP_STORAGE_TYPE = 'json';
    process.env.MCP_DEBUG = 'false';
    process.env.MCP_USER_BASED = 'false';

    // Unique test file paths
    process.env.DATA_DIR = `./test-data-${testId}`;
    process.env.STORAGE_FILE_PATH = `./test-data-${testId}.json`;

    // Test LibreChat configuration
    process.env.LIBRECHAT_ENDPOINT = 'http://localhost:3080';
    process.env.LIBRECHAT_API_KEY = 'test-api-key';
    process.env.LIBRECHAT_AGENT_NAME = 'Sizzek';
    process.env.LIBRECHAT_AGENT_ID = 'test-agent';
    process.env.LIBRECHAT_AGENT_MODEL = 'gpt-4o';

    // Test MongoDB configuration
    process.env.MONGO_URI = 'mongodb://localhost:27017/TestLibreChat';
    process.env.MONGODB_DATABASE = 'TestLibreChat';
    process.env.MCP_MONGODB_TIMEOUT = '5000';
    process.env.MCP_MONGODB_RETRIES = '2';

    // HTTP configuration
    process.env.HTTP_TIMEOUT = '5000';
    process.env.RETRY_ATTEMPTS = '2';
    process.env.RETRY_DELAY = '100';

    console.log(`🔧 Test environment setup with ID: ${testId}`);
}

export async function cleanupTestEnvironment() {
    console.log('🧹 Cleaning up test environment...');

    // Files to clean up
    const testFiles = [
        './test-data.json',
        './test-data.json.backup',
        './test-tasks.json',
        './test-tasks.json.backup'
    ];

    // Clean up dynamically named test files
    const currentTestFile = process.env.STORAGE_FILE_PATH;
    const currentDataDir = process.env.DATA_DIR;

    if (currentTestFile) {
        testFiles.push(currentTestFile);
        testFiles.push(currentTestFile + '.backup');
    }

    if (currentDataDir) {
        testFiles.push(currentDataDir);
    }

    // Pattern-based cleanup for any remaining test files
    try {
        const files = await fs.readdir('.');
        const testFilePattern = /^test-.*\.(json|db)$/;
        for (const file of files) {
            if (testFilePattern.test(file)) {
                testFiles.push(file);
            }
        }
    } catch (e) {
        // Directory read failed, ignore
    }

    // Remove test files
    for (const file of testFiles) {
        try {
            await fs.unlink(file);
            console.log(`   Deleted: ${file}`);
        } catch (e) {
            // File might not exist, that's okay
        }
    }

    // Clean up test directories
    try {
        if (currentDataDir) {
            await fs.rmdir(currentDataDir, { recursive: true });
            console.log(`   Deleted directory: ${currentDataDir}`);
        }
    } catch (e) {
        // Directory might not exist, that's okay
    }

    console.log('✅ Test environment cleanup complete');
}

// =============================================
// Test Runner Framework
// =============================================

export class TestRunner {
    constructor(name = 'Test Suite') {
        this.name = name;
        this.tests = [];
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
        this.passed = 0;
        this.failed = 0;
        this.stats = {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            totalDuration: 0
        };
    }

    beforeEach(hook) {
        this.beforeEachHooks.push(hook);
    }

    afterEach(hook) {
        this.afterEachHooks.push(hook);
    }

    test(name, testFn) {
        this.tests.push({ name, testFn });
    }

    async run() {
        console.log(`\n🧪 Running ${this.name}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        this.stats.totalTests = this.tests.length;

        for (const { name, testFn } of this.tests) {
            try {
                console.log(`\n🔍 ${name}`);

                // Run beforeEach hooks
                for (const hook of this.beforeEachHooks) {
                    await hook();
                }

                // Run the test
                await testFn();

                // Run afterEach hooks
                for (const hook of this.afterEachHooks) {
                    await hook();
                }

                console.log(`✅ PASSED: ${name}`);
                this.passed++;
                this.stats.passedTests++;
            } catch (error) {
                console.log(`❌ FAILED: ${name}`);
                console.log(`   Error: ${error.message}`);
                if (error.stack) {
                    console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
                }
                this.failed++;
                this.stats.failedTests++;
            }
        }

        const duration = Date.now() - startTime;
        this.stats.totalDuration = duration;

        console.log('\n' + '='.repeat(60));
        console.log(`📊 Results: ${this.passed} passed, ${this.failed} failed (${duration}ms)`);
        console.log(`📈 Success Rate: ${Math.round((this.passed / this.tests.length) * 100)}%`);

        return this.failed === 0;
    }
}

// =============================================
// Assertion Library
// =============================================

export const assert = {
    equal(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
        }
    },

    notEqual(actual, expected, message = '') {
        if (actual === expected) {
            throw new Error(`${message ? message + ': ' : ''}expected ${actual} not to equal ${expected}`);
        }
    },

    true(condition, message = '') {
        if (!condition) {
            throw new Error(message || 'Expected condition to be true');
        }
    },

    false(condition, message = '') {
        if (condition) {
            throw new Error(message || 'Expected condition to be false');
        }
    },

    null(value, message = '') {
        if (value !== null) {
            throw new Error(`${message ? message + ': ' : ''}expected null, got ${value}`);
        }
    },

    notNull(value, message = '') {
        if (value === null) {
            throw new Error(`${message ? message + ': ' : ''}expected non-null value`);
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
    },

    isString(value, message = '') {
        if (typeof value !== 'string') {
            throw new Error(`${message ? message + ': ' : ''}expected string, got ${typeof value}`);
        }
    },

    isNumber(value, message = '') {
        if (typeof value !== 'number') {
            throw new Error(`${message ? message + ': ' : ''}expected number, got ${typeof value}`);
        }
    },

    isFunction(value, message = '') {
        if (typeof value !== 'function') {
            throw new Error(`${message ? message + ': ' : ''}expected function, got ${typeof value}`);
        }
    },

    throws(fn, message = '') {
        try {
            fn();
            throw new Error(`${message ? message + ': ' : ''}expected function to throw`);
        } catch (error) {
            // Expected behavior
        }
    },

    async throwsAsync(fn, message = '') {
        try {
            await fn();
            throw new Error(`${message ? message + ': ' : ''}expected async function to throw`);
        } catch (error) {
            // Expected behavior
        }
    },

    includes(array, item, message = '') {
        if (!Array.isArray(array) || !array.includes(item)) {
            throw new Error(`${message ? message + ': ' : ''}expected array to include ${item}`);
        }
    },

    match(string, regex, message = '') {
        if (!regex.test(string)) {
            throw new Error(`${message ? message + ': ' : ''}expected string to match regex`);
        }
    }
};

// =============================================
// MongoDB Mock Framework
// =============================================

export class MockMongoClient {
    constructor(connectionString, options = {}) {
        this.connectionString = connectionString;
        this.options = options;
        this.connected = false;
        this.databases = new Map();
        this.connectTimeout = options.connectTimeoutMS || 10000;
        this.serverSelectionTimeout = options.serverSelectionTimeoutMS || 10000;
    }

    async connect() {
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 10));
        this.connected = true;
        console.log(`📡 Mock MongoDB connected to: ${this.connectionString}`);
    }

    db(name) {
        if (!this.connected) {
            throw new Error('Client not connected');
        }

        if (!this.databases.has(name)) {
            this.databases.set(name, new MockDatabase(name));
        }

        return this.databases.get(name);
    }

    async close() {
        this.connected = false;
        this.databases.clear();
        console.log('📡 Mock MongoDB disconnected');
    }
}

export class MockDatabase {
    constructor(name) {
        this.name = name;
        this.collections = new Map();
    }

    collection(name) {
        if (!this.collections.has(name)) {
            this.collections.set(name, new MockCollection(name));
        }
        return this.collections.get(name);
    }
}

export class MockCollection {
    constructor(name) {
        this.name = name;
        this.documents = new Map();
        this.nextId = 1;
    }

    async findOne(query = {}) {
        // Simulate various query patterns
        const docs = Array.from(this.documents.values());

        // Handle _id queries
        if (query._id) {
            const doc = this.documents.get(query._id.toString());
            return doc ? { ...doc } : null;
        }

        // Handle name queries
        if (query.name) {
            const doc = docs.find(d => d.name === query.name);
            return doc ? { ...doc } : null;
        }

        // Handle $or queries
        if (query.$or) {
            for (const condition of query.$or) {
                const doc = docs.find(d => this.matchesCondition(d, condition));
                if (doc) {
                    return { ...doc };
                }
            }
            return null;
        }

        // Handle metadata queries
        if (query['metadata.agentName']) {
            const doc = docs.find(d => d.metadata && d.metadata.agentName === query['metadata.agentName']);
            return doc ? { ...doc } : null;
        }

        // Handle regex queries
        if (query.email && query.email.$regex) {
            const regex = new RegExp(query.email.$regex, query.email.$options || '');
            const doc = docs.find(d => d.email && regex.test(d.email));
            return doc ? { ...doc } : null;
        }

        // Return first document if no specific query
        return docs.length > 0 ? { ...docs[0] } : null;
    }

    async find(query = {}) {
        const docs = Array.from(this.documents.values());
        const results = query && Object.keys(query).length > 0
            ? docs.filter(d => this.matchesCondition(d, query))
            : docs;

        return {
            toArray: async () => results.map(d => ({ ...d })),
            limit: (n) => ({
                toArray: async () => results.slice(0, n).map(d => ({ ...d }))
            })
        };
    }

    async insertOne(document) {
        const id = this.nextId++;
        const doc = {
            _id: id.toString(),
            ...document,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.documents.set(id.toString(), doc);
        return { insertedId: id.toString() };
    }

    async updateOne(query, update) {
        const doc = await this.findOne(query);
        if (doc) {
            const updatedDoc = { ...doc, ...update.$set, updatedAt: new Date() };
            this.documents.set(doc._id, updatedDoc);
            return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
    }

    async deleteOne(query) {
        const doc = await this.findOne(query);
        if (doc) {
            this.documents.delete(doc._id);
            return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
    }

    matchesCondition(doc, condition) {
        for (const [key, value] of Object.entries(condition)) {
            if (key === '$or') {
                const matches = value.some(c => this.matchesCondition(doc, c));
                if (!matches) return false;
            } else if (key.includes('.')) {
                // Handle nested properties like 'metadata.agentName'
                const keys = key.split('.');
                let current = doc;
                for (const k of keys) {
                    if (!current || typeof current !== 'object') {
                        return false;
                    }
                    current = current[k];
                }

                // Handle regex patterns in nested fields
                if (typeof value === 'object' && value !== null && value.$regex !== undefined) {
                    if (!current) return false;
                    const regex = new RegExp(value.$regex, value.$options || '');
                    if (!regex.test(current.toString())) return false;
                } else {
                    if (current !== value) return false;
                }
            } else {
                // Handle direct field matching
                if (typeof value === 'object' && value !== null && value.$regex !== undefined) {
                    // Handle regex patterns
                    const fieldValue = doc[key];
                    if (!fieldValue) return false;
                    const regex = new RegExp(value.$regex, value.$options || '');
                    if (!regex.test(fieldValue.toString())) return false;
                } else {
                    // Handle simple equality
                    if (doc[key] !== value) return false;
                }
            }
        }
        return true;
    }

    // Helper methods for testing
    clear() {
        this.documents.clear();
        this.nextId = 1;
    }

    size() {
        return this.documents.size;
    }

    addTestUser(userData) {
        // Generate a proper MongoDB ObjectId (24-character hex string)
        const generateObjectId = () => {
            const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
            const randomHex = Math.random().toString(16).substr(2, 16).padStart(16, '0');
            return timestamp + randomHex;
        };

        const id = userData._id || generateObjectId();
        const user = {
            _id: id,
            email: userData.email || `test${id}@example.com`,
            name: userData.name || `Test User ${id}`,
            username: userData.username,
            phoneNumber: userData.phoneNumber,
            metadata: userData.metadata || {},
            createdAt: new Date(),
            updatedAt: new Date(),
            ...userData
        };

        this.documents.set(id, user);
        return user;
    }
}

// =============================================
// MCP Server Test Helper
// =============================================

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
            STORAGE_FILE_PATH: `./test-data-${testId}.json`,
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
                if (dataStr.includes('TaskManager initialized') ||
                    dataStr.includes('User lookup service initialized') ||
                    dataStr.includes('Server started')) {
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
            }, 10000);

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

// =============================================
// Test Data Generators
// =============================================

export const testData = {
    users: {
        sizzekUser: {
            _id: 'test-user-sizzek-001',
            name: 'Sizzek',
            email: 'sizzek@example.com',
            phoneNumber: '+13022716778',
            metadata: {
                agentName: 'Sizzek',
                phoneNumber: '+13022716778'
            }
        },

        smsUser: {
            _id: 'test-user-sms-001',
            name: 'SMS User +13022716778',
            email: 'sms+13022716778@example.com',
            phoneNumber: '+13022716778',
            metadata: {
                phoneNumber: '+13022716778'
            }
        },

        regularUser: {
            _id: 'test-user-regular-001',
            name: 'Regular User',
            email: 'regular@example.com',
            phoneNumber: '+15551234567'
        }
    },

    tasks: {
        simpleTask: {
            name: 'Test Task',
            description: 'A simple test task',
            message: 'This is a test message',
            schedule: {
                type: 'interval',
                interval: '1 minute'
            }
        },

        complexTask: {
            name: 'Complex Task',
            description: 'A complex test task with metadata',
            message: 'This is a complex test message with more details',
            schedule: {
                type: 'daily',
                time: '09:00',
                timezone: 'America/New_York'
            },
            metadata: {
                priority: 'high',
                category: 'reminder'
            }
        }
    },

    mcpRequests: {
        listTools: () => ({
            jsonrpc: '2.0',
            id: randomUUID(),
            method: 'tools/list',
            params: {}
        }),

        createTask: (task) => ({
            jsonrpc: '2.0',
            id: randomUUID(),
            method: 'tools/call',
            params: {
                name: 'create_task',
                arguments: task
            }
        }),

        listTasks: () => ({
            jsonrpc: '2.0',
            id: randomUUID(),
            method: 'tools/call',
            params: {
                name: 'list_tasks',
                arguments: {}
            }
        }),

        executeTask: (taskId) => ({
            jsonrpc: '2.0',
            id: randomUUID(),
            method: 'tools/call',
            params: {
                name: 'execute_task',
                arguments: { taskId }
            }
        })
    }
};

// =============================================
// Test Lifecycle Hooks
// =============================================

export async function beforeEach() {
    // Clean up any previous test state
    await cleanupTestEnvironment();

    // Setup fresh test environment
    setupTestEnvironment();
}

export async function afterEach() {
    // Clean up after each test
    await cleanupTestEnvironment();
}

// =============================================
// Test Utilities Validation
// =============================================

export async function validateTestUtilities() {
    console.log('🔍 Validating test utilities...');

    const runner = new TestRunner('Test Utilities Validation');

    runner.test('TestRunner creates instances correctly', async () => {
        const testRunner = new TestRunner('Test Name');
        assert.equal(testRunner.name, 'Test Name');
        assert.isArray(testRunner.tests);
        assert.equal(testRunner.passed, 0);
        assert.equal(testRunner.failed, 0);
    });

    runner.test('Assert library works correctly', async () => {
        assert.equal(1, 1);
        assert.true(true);
        assert.false(false);
        assert.hasProperty({ a: 1 }, 'a');
        assert.isArray([1, 2, 3]);
        assert.includes([1, 2, 3], 2);
    });

    runner.test('MockMongoClient behaves correctly', async () => {
        const client = new MockMongoClient('mongodb://test');
        await client.connect();

        const db = client.db('test');
        const collection = db.collection('users');

        assert.equal(collection.name, 'users');

        await client.close();
    });

    runner.test('Test data generation works', async () => {
        const sizzekUser = testData.users.sizzekUser;
        assert.equal(sizzekUser.name, 'Sizzek');
        assert.hasProperty(sizzekUser, '_id');
        assert.hasProperty(sizzekUser, 'email');

        const testTask = testData.tasks.simpleTask;
        assert.equal(testTask.name, 'Test Task');
        assert.hasProperty(testTask, 'schedule');
    });

    const success = await runner.run();

    if (success) {
        console.log('✅ All test utilities validated successfully');
    } else {
        console.log('❌ Test utilities validation failed');
        process.exit(1);
    }
}

// Export everything for easy testing
export default {
    setupTestEnvironment,
    cleanupTestEnvironment,
    TestRunner,
    assert,
    MockMongoClient,
    MockDatabase,
    MockCollection,
    MCPServerTestHelper,
    testData,
    beforeEach,
    afterEach,
    validateTestUtilities
}; 