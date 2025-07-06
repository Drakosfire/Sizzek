/**
 * Test Utilities for Grocery List MCP Server
 * Provides common test helpers, mocks, and utilities
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Test Runner Class
 * Provides structured test execution with proper reporting
 */
export class TestRunner {
    constructor(name = 'Test Suite') {
        this.name = name;
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.verbose = process.env.VERBOSE === 'true';
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
                if (this.verbose) {
                    console.log(`   Stack: ${error.stack}`);
                }
                this.failed++;
            }
        }

        const duration = Date.now() - startTime;
        console.log('\n' + '='.repeat(60));
        console.log(`📊 Results: ${this.passed} passed, ${this.failed} failed (${duration}ms)`);

        if (this.failed > 0) {
            console.log('\n❌ Some tests failed. See output above for details.');
            return false;
        } else {
            console.log('\n🎉 All tests passed!');
            return true;
        }
    }
}

/**
 * Assertion Helpers
 * Provide consistent assertion functionality across tests
 */
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

    false(condition, message = '') {
        if (condition) {
            throw new Error(message || 'Expected condition to be false');
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
    }
};

/**
 * Mock Grocery Manager
 * Provides a consistent mock for testing without database dependencies
 */
export class MockGroceryManager {
    constructor() {
        this.userItems = new Map(); // Map of userId -> items array
        this.nextId = 1;
    }

    async initialize() {
        // Mock initialization
    }

    async getGroceryItems(userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }
        return [...this.userItems.get(userKey)];
    }

    async addGroceryItem(name, quantity = 1, category, userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const newItem = {
            id: (this.nextId++).toString(),
            name: name.trim(),
            quantity: quantity,
            unit: "pieces",
            category: category || "other",
            purchased: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isStaple: false
        };
        this.userItems.get(userKey).push(newItem);
        return newItem;
    }

    async purchaseItem(id, userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        const item = items.find(i => i.id === id);
        if (!item || item.purchased) return null;

        item.purchased = true;
        item.purchasedAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();
        return item;
    }

    async unpurchaseItem(id, userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        const item = items.find(i => i.id === id);
        if (!item || !item.purchased) return null;

        item.purchased = false;
        delete item.purchasedAt;
        item.updatedAt = new Date().toISOString();
        return item;
    }

    async deleteGroceryItem(id, userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        const index = items.findIndex(i => i.id === id);
        if (index === -1) return { success: false };

        const deletedItem = items.splice(index, 1)[0];
        return { success: true, deletedItem };
    }

    async searchGroceryItems(query, userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        return items.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    async getGroceryStats(userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        const totalItems = items.length;
        const purchasedItems = items.filter(i => i.purchased).length;
        const pendingItems = totalItems - purchasedItems;

        return {
            totalItems,
            purchasedItems,
            pendingItems,
            lastUpdated: new Date().toISOString(),
            categoryStats: []
        };
    }

    async getCategories(userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        const categories = [...new Set(items.map(i => i.category))];
        return categories.sort();
    }

    async getStats(userId) {
        const userKey = userId || 'default';
        if (!this.userItems.has(userKey)) {
            this.userItems.set(userKey, []);
        }

        const items = this.userItems.get(userKey);
        const totalItems = items.length;
        const purchasedItems = items.filter(i => i.purchased).length;
        const pendingItems = totalItems - purchasedItems;

        return {
            totalItems,
            purchasedItems,
            pendingItems,
            lastUpdated: new Date().toISOString(),
            categoryStats: []
        };
    }

    async cleanup() {
        this.userItems.clear();
        this.nextId = 1;
    }

    // Helper methods for testing
    addTestData() {
        const testItems = [
            { name: 'Organic Apples', quantity: 6, category: 'produce' },
            { name: 'Whole Milk', quantity: 1, category: 'dairy' },
            { name: 'Whole Wheat Bread', quantity: 1, category: 'pantry' },
            { name: 'Chicken Breast', quantity: 2, category: 'meat' },
            { name: 'Frozen Peas', quantity: 1, category: 'frozen' }
        ];

        return Promise.all(
            testItems.map(item =>
                this.addGroceryItem(item.name, item.quantity, item.category, 'test-user')
            )
        );
    }
}

/**
 * MCP Server Test Helper
 * Provides utilities for testing MCP server functionality
 */
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
            GROCERY_FILE_PATH: `./test-grocery-data-${testId}.json`,
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
            }, 15000); // Increased timeout

            // Buffer to collect initialization output
            let initBuffer = '';

            this.server.stdout.on('data', (data) => {
                const dataStr = data.toString();
                initBuffer += dataStr;

                // Look for signs that the server is ready
                if (dataStr.includes('GroceryListManager initialized') ||
                    dataStr.includes('Server listening') ||
                    dataStr.includes('MCP server started')) {
                    serverReady = true;
                    clearTimeout(timeout);
                    resolve();
                    return;
                }
            });

            this.server.stderr.on('data', (data) => {
                const dataStr = data.toString();
                // Look for initialization messages in stderr as well
                if (dataStr.includes('GroceryListManager initialized') ||
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

            this.server.on('exit', (code) => {
                if (!serverReady) {
                    clearTimeout(timeout);
                    reject(new Error(`Server exited with code ${code} before ready`));
                }
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

    async cleanup() {
        await this.stopServer();

        // Clean up test files
        const testFiles = [
            './test-grocery-data.json',
            './test-grocery-data.json.backup'
        ];

        for (const file of testFiles) {
            try {
                await fs.unlink(file);
            } catch (e) {
                // File might not exist
            }
        }
    }
}

/**
 * Common Test Data
 * Provides consistent test data across test suites
 */
export const testData = {
    users: {
        testUser: 'test-user',
        testUser2: 'test-user-2'
    },

    groceryItems: [
        {
            name: 'Organic Apples',
            quantity: 6,
            category: 'produce',
            unit: 'pieces'
        },
        {
            name: 'Whole Milk',
            quantity: 1,
            category: 'dairy',
            unit: 'gallon'
        },
        {
            name: 'Whole Wheat Bread',
            quantity: 1,
            category: 'pantry',
            unit: 'loaf'
        },
        {
            name: 'Chicken Breast',
            quantity: 2,
            category: 'meat',
            unit: 'lbs'
        },
        {
            name: 'Frozen Peas',
            quantity: 1,
            category: 'frozen',
            unit: 'bag'
        }
    ],

    categories: [
        'produce',
        'dairy',
        'pantry',
        'meat',
        'frozen',
        'cleaning',
        'personal care',
        'beverages',
        'other'
    ],

    mcpRequests: {
        listTools: {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {}
        },

        addItem: (name, quantity, category) => ({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "add_grocery_item",
                arguments: { name, quantity, category }
            }
        }),

        purchaseItem: (id) => ({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
                name: "purchase_item",
                arguments: { id }
            }
        }),

        getList: (purchased) => ({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
                name: "get_grocery_list",
                arguments: purchased !== undefined ? { purchased } : {}
            }
        }),

        deleteItem: (id) => ({
            jsonrpc: "2.0",
            id: 5,
            method: "tools/call",
            params: {
                name: "delete_grocery_item",
                arguments: { id }
            }
        }),

        searchItems: (query) => ({
            jsonrpc: "2.0",
            id: 6,
            method: "tools/call",
            params: {
                name: "search_grocery_items",
                arguments: { query }
            }
        }),

        getStats: () => ({
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: {
                name: "get_grocery_stats",
                arguments: {}
            }
        }),

        getCategories: () => ({
            jsonrpc: "2.0",
            id: 8,
            method: "tools/call",
            params: {
                name: "get_categories",
                arguments: {}
            }
        }),

        getWebUI: () => ({
            jsonrpc: "2.0",
            id: 9,
            method: "tools/call",
            params: {
                name: "get_web_ui",
                arguments: {}
            }
        })
    }
};

/**
 * Test Environment Setup
 * Provides consistent environment setup for all tests
 */
export function setupTestEnvironment() {
    process.env.NODE_ENV = 'test';
    process.env.MCP_USER_ID = 'test-user';
    process.env.MCP_STORAGE_TYPE = 'json';
    // Use a unique test file path to avoid interference between tests
    const testId = Math.random().toString(36).substr(2, 9);
    process.env.GROCERY_FILE_PATH = `./test-grocery-data-${testId}.json`;
    process.env.MCP_USER_BASED = 'false';
    process.env.MCP_DEBUG = 'false';
}

/**
 * Test Cleanup
 * Provides consistent cleanup after tests
 */
export async function cleanupTestEnvironment() {
    const testFiles = [
        './test-grocery-data.json',
        './test-grocery-data.json.backup'
    ];

    // Also clean up dynamically named test files
    const currentTestFile = process.env.GROCERY_FILE_PATH;
    if (currentTestFile) {
        testFiles.push(currentTestFile);
        testFiles.push(currentTestFile + '.backup');
    }

    // Clean up any other test files that might exist
    try {
        const files = await fs.readdir('.');
        const testFilePattern = /^test-grocery-data.*\.json/;
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