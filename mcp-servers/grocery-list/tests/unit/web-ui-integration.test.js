#!/usr/bin/env node

/**
 * Unit Tests for Grocery List Web UI Integration
 * Tests the specific functionality we fixed:
 * - Action handlers (toggle, add, delete)  
 * - Stats calculation
 * - Form schema generation
 * - Data transformation
 */

import { GroceryListWebUIManager } from '../../dist/web-ui-integration.js';
import { TestRunner, assert, MockGroceryManager, setupTestEnvironment, cleanupTestEnvironment } from '../helpers/test-utilities.js';

// Setup test environment
setupTestEnvironment();

// Initialize test runner
const runner = new TestRunner('Web UI Integration Unit Tests');

// Test 1: UI Manager Initialization
runner.test('UI Manager initializes correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    assert.true(webUI instanceof GroceryListWebUIManager, 'Should create instance');
    assert.true(typeof webUI.handleGetWebUI === 'function', 'Should have handleGetWebUI method');
    assert.true(typeof webUI.getMCPToolDefinition === 'function', 'Should have getMCPToolDefinition method');

    await webUI.cleanup();
});

// Test 2: Data Source Returns Array
runner.test('Data source returns items array correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Add test data
    await manager.addGroceryItem('Apples', 5, 'produce', 'test-user');
    await manager.addGroceryItem('Milk', 1, 'dairy', 'test-user');
    await manager.addGroceryItem('Bread', 2, 'pantry', 'test-user');

    // Purchase one item
    await manager.purchaseItem('1', 'test-user');

    // Get data source (should return array)
    const dataSource = webUI['getDataSource'];
    const data = await dataSource.call(webUI, 'test-user');

    assert.isArray(data, 'Should return an array');
    assert.equal(data.length, 3, 'Should return all items');

    // Check sorting: unpurchased items first, then by creation date
    assert.false(data[0].purchased, 'First item should be unpurchased');
    assert.false(data[1].purchased, 'Second item should be unpurchased');
    assert.true(data[2].purchased, 'Third item should be purchased');

    await webUI.cleanup();
});

// Test 3: Toggle Action Handler
runner.test('Toggle action handler works correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Add test item
    const item = await manager.addGroceryItem('Test Item', 1, 'other', 'test-user');

    // Test toggle action with field/value format
    const toggleResult1 = await webUI['handleUIUpdate']('toggle', {
        id: item.id,
        field: 'purchased',
        value: true
    }, 'test-user');

    assert.true(toggleResult1.success, 'Toggle should succeed');
    assert.hasProperty(toggleResult1, 'message', 'Should have success message');
    assert.hasProperty(toggleResult1, 'item', 'Should return updated item');
    assert.true(toggleResult1.item.purchased, 'Item should be marked as purchased');

    // Test toggle action with purchased format
    const manager2 = new MockGroceryManager();
    const webUI2 = new GroceryListWebUIManager(manager2, true);
    const item2 = await manager2.addGroceryItem('Test Item 2', 1, 'other', 'test-user');

    const toggleResult2 = await webUI2['handleUIUpdate']('toggle', {
        id: item2.id,
        purchased: true
    }, 'test-user');

    assert.true(toggleResult2.success, 'Toggle with purchased format should succeed');
    assert.true(toggleResult2.item.purchased, 'Item should be marked as purchased');

    await webUI.cleanup();
    await webUI2.cleanup();
});

// Test 4: Toggle Unchecking (Unpurchasing)
runner.test('Toggle unchecking works correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Add and purchase an item
    const item = await manager.addGroceryItem('Test Item', 1, 'other', 'test-user');
    await manager.purchaseItem(item.id, 'test-user');

    // Test toggle action to uncheck (unpurchase)
    const toggleResult = await webUI['handleUIUpdate']('toggle', {
        id: item.id,
        field: 'purchased',
        value: false
    }, 'test-user');

    assert.true(toggleResult.success, 'Uncheck toggle should succeed');
    assert.false(toggleResult.item.purchased, 'Item should be marked as unpurchased');
    assert.true(!toggleResult.item.purchasedAt, 'Purchase timestamp should be removed');

    await webUI.cleanup();
});

// Test 5: Add Action Handler - Form Request
runner.test('Add action returns form schema when no data provided', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Test add action without data (should return form)
    const formResult = await webUI['handleUIUpdate']('add', {}, 'test-user');

    assert.true(formResult.success, 'Add form request should succeed');
    assert.true(formResult.showForm, 'Should indicate form should be shown');
    assert.hasProperty(formResult, 'form', 'Should have form schema');
    assert.hasProperty(formResult.form, 'title', 'Form should have title');
    assert.hasProperty(formResult.form, 'fields', 'Form should have fields');
    assert.isArray(formResult.form.fields, 'Fields should be array');
    assert.true(formResult.form.fields.length >= 3, 'Should have at least 3 fields (name, quantity, category)');

    // Check required fields
    const nameField = formResult.form.fields.find(f => f.key === 'name');
    const quantityField = formResult.form.fields.find(f => f.key === 'quantity');
    const categoryField = formResult.form.fields.find(f => f.key === 'category');

    assert.true(nameField && nameField.required, 'Name field should be required');
    assert.true(quantityField && quantityField.type === 'number', 'Quantity field should be number type');
    assert.true(categoryField && Array.isArray(categoryField.options), 'Category field should have options');

    await webUI.cleanup();
});

// Test 6: Add Action Handler - Form Submission
runner.test('Add action processes form submission correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Test add action with form data
    const addResult = await webUI['handleUIUpdate']('add', {
        name: 'Test Bananas',
        quantity: 5,
        category: 'produce'
    }, 'test-user');

    assert.true(addResult.success, 'Add form submission should succeed');
    assert.hasProperty(addResult, 'message', 'Should have success message');
    assert.hasProperty(addResult, 'item', 'Should return added item');
    assert.equal(addResult.item.name, 'Test Bananas', 'Should set item name correctly');
    assert.equal(addResult.item.quantity, 5, 'Should set quantity correctly');
    assert.equal(addResult.item.category, 'produce', 'Should set category correctly');

    // Verify item was actually added
    const items = await manager.getGroceryItems('test-user');
    assert.equal(items.length, 1, 'Should have added one item');
    assert.equal(items[0].name, 'Test Bananas', 'Added item should match');

    await webUI.cleanup();
});

// Test 7: Delete Action Handler
runner.test('Delete action handler works correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Add test item
    const item = await manager.addGroceryItem('Test Delete Item', 1, 'other', 'test-user');

    // Test delete action
    const deleteResult = await webUI['handleUIUpdate']('delete', {
        id: item.id
    }, 'test-user');

    assert.true(deleteResult.success, 'Delete should succeed');
    assert.hasProperty(deleteResult, 'message', 'Should have success message');
    assert.hasProperty(deleteResult, 'deletedItem', 'Should return deleted item');
    assert.equal(deleteResult.deletedItem.name, 'Test Delete Item', 'Should return correct deleted item');

    // Verify item was actually deleted
    const items = await manager.getGroceryItems('test-user');
    assert.equal(items.length, 0, 'Should have no items after deletion');

    await webUI.cleanup();
});

// Test 8: Action Mapping Coverage
runner.test('Action mapping covers all expected actions', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Add test data
    await manager.addTestData();

    // Test various action mappings
    const actions = [
        { action: 'add', params: {} }, // Should return form
        { action: 'purchase_item', params: { id: '1' } },
        { action: 'search', params: { query: 'apple' } },
        { action: 'filter', params: { filter: 'purchased' } },
        { action: 'get_stats', params: {} },
        { action: 'get_categories', params: {} }
    ];

    for (const { action, params } of actions) {
        const result = await webUI['handleUIUpdate'](action, params, 'test-user');
        assert.true(result.success, `Action ${action} should succeed`);
    }

    await webUI.cleanup();
});

// Test 9: Error Handling
runner.test('Error handling works correctly', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Test toggle on non-existent item
    try {
        await webUI['handleUIUpdate']('toggle', { id: 'nonexistent', purchased: true }, 'test-user');
        assert.true(false, 'Should have thrown error for non-existent item');
    } catch (error) {
        assert.true(error.message.includes('not found'), 'Should throw appropriate error message');
    }

    // Test delete on non-existent item
    try {
        await webUI['handleUIUpdate']('delete', { id: 'nonexistent' }, 'test-user');
        assert.true(false, 'Should have thrown error for non-existent item');
    } catch (error) {
        assert.true(error.message.includes('not found'), 'Should throw appropriate error message');
    }

    // Test unknown action
    try {
        await webUI['handleUIUpdate']('unknown-action', {}, 'test-user');
        assert.true(false, 'Should have thrown error for unknown action');
    } catch (error) {
        assert.true(error.message.includes('Unknown UI action'), 'Should throw appropriate error message');
    }

    await webUI.cleanup();
});

// Test 10: Data Source Integration
runner.test('Data source returns correct format', async () => {
    const manager = new MockGroceryManager();
    const webUI = new GroceryListWebUIManager(manager, true);

    // Add mixed test data
    await manager.addGroceryItem('Item 1', 1, 'produce', 'test-user');
    await manager.addGroceryItem('Item 2', 2, 'dairy', 'test-user');
    await manager.purchaseItem('1', 'test-user');

    const dataSource = webUI['getDataSource'];
    const data = await dataSource.call(webUI, 'test-user');

    // Check structure - should be array directly
    assert.isArray(data, 'Should return array directly');
    assert.equal(data.length, 2, 'Should return all items');

    // Check sorting (unpurchased first)
    assert.false(data[0].purchased, 'First item should be unpurchased');
    assert.true(data[1].purchased, 'Second item should be purchased');

    await webUI.cleanup();
});

// Run all tests and exit properly
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