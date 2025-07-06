#!/usr/bin/env node

/**
 * Validation Test for Test Utilities
 * Ensures all test utilities are working correctly
 */

import { TestRunner, assert, MockGroceryManager, MCPServerTestHelper, setupTestEnvironment, cleanupTestEnvironment, testData } from './test-utilities.js';

// Setup test environment
setupTestEnvironment();

// Initialize test runner
const runner = new TestRunner('Test Utilities Validation');

// Test 1: TestRunner itself
runner.test('TestRunner works correctly', async () => {
    const testRunner = new TestRunner('Test Runner Test');
    assert.true(testRunner instanceof TestRunner, 'Should create TestRunner instance');
    assert.true(typeof testRunner.test === 'function', 'Should have test method');
    assert.true(typeof testRunner.run === 'function', 'Should have run method');
});

// Test 2: Assertion helpers
runner.test('Assertion helpers work correctly', async () => {
    // Test assert.true
    assert.true(true, 'Should pass for true');

    // Test assert.false
    assert.false(false, 'Should pass for false');

    // Test assert.equal
    assert.equal(1, 1, 'Should pass for equal values');
    assert.equal('test', 'test', 'Should pass for equal strings');

    // Test assert.hasProperty
    const obj = { prop: 'value' };
    assert.hasProperty(obj, 'prop', 'Should pass for existing property');

    // Test assert.isArray
    assert.isArray([], 'Should pass for empty array');
    assert.isArray([1, 2, 3], 'Should pass for array with elements');
});

// Test 3: MockGroceryManager
runner.test('MockGroceryManager works correctly', async () => {
    const manager = new MockGroceryManager();

    assert.true(manager instanceof MockGroceryManager, 'Should create instance');
    assert.true(typeof manager.addGroceryItem === 'function', 'Should have addGroceryItem method');
    assert.true(typeof manager.getGroceryItems === 'function', 'Should have getGroceryItems method');

    // Test basic functionality
    const item = await manager.addGroceryItem('Test Item', 1, 'test', 'test-user');
    assert.hasProperty(item, 'id', 'Should have ID');
    assert.equal(item.name, 'Test Item', 'Should set name correctly');

    const items = await manager.getGroceryItems('test-user');
    assert.isArray(items, 'Should return array');
    assert.equal(items.length, 1, 'Should have one item');

    await manager.cleanup();
});

// Test 4: Test Data
runner.test('Test data is properly structured', async () => {
    assert.hasProperty(testData, 'users', 'Should have users');
    assert.hasProperty(testData, 'groceryItems', 'Should have groceryItems');
    assert.hasProperty(testData, 'categories', 'Should have categories');
    assert.hasProperty(testData, 'mcpRequests', 'Should have mcpRequests');

    assert.isArray(testData.groceryItems, 'Grocery items should be array');
    assert.isArray(testData.categories, 'Categories should be array');

    // Test MCP request generators
    const addRequest = testData.mcpRequests.addItem('Test', 1, 'test');
    assert.hasProperty(addRequest, 'jsonrpc', 'Should have jsonrpc field');
    assert.hasProperty(addRequest, 'method', 'Should have method field');
    assert.hasProperty(addRequest, 'params', 'Should have params field');
});

// Test 5: Environment setup
runner.test('Environment setup works correctly', async () => {
    setupTestEnvironment();

    assert.equal(process.env.NODE_ENV, 'test', 'Should set NODE_ENV to test');
    assert.equal(process.env.MCP_STORAGE_TYPE, 'json', 'Should set storage type');
    assert.equal(process.env.MCP_USER_BASED, 'false', 'Should disable user-based storage');
});

// Run the validation tests
runner.run().then(success => {
    if (success) {
        console.log('\n🎉 All test utilities are working correctly!');
        process.exit(0);
    } else {
        console.log('\n❌ Some test utilities are not working properly!');
        process.exit(1);
    }
}).catch(error => {
    console.error('❌ Test utilities validation failed:', error);
    process.exit(1);
}); 