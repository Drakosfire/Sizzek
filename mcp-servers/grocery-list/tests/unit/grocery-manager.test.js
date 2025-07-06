#!/usr/bin/env node

/**
 * Unit Tests for GroceryListManager
 * Tests core grocery management functionality:
 * - CRUD operations
 * - Search and filtering
 * - Statistics calculation
 * - Data validation
 */

import { TestRunner, assert, setupTestEnvironment, cleanupTestEnvironment, testData, MockGroceryManager } from '../helpers/test-utilities.js';

// Setup test environment
setupTestEnvironment();

// Initialize test runner
const runner = new TestRunner('GroceryListManager Unit Tests');

// Test 1: Manager Initialization
runner.test('Manager initializes correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    assert.true(manager instanceof MockGroceryManager, 'Should create instance');
    assert.true(typeof manager.addGroceryItem === 'function', 'Should have addGroceryItem method');
    assert.true(typeof manager.getGroceryItems === 'function', 'Should have getGroceryItems method');
    assert.true(typeof manager.purchaseItem === 'function', 'Should have purchaseItem method');
    assert.true(typeof manager.deleteGroceryItem === 'function', 'Should have deleteGroceryItem method');

    await manager.cleanup();
});

// Test 2: Add Grocery Item
runner.test('Add grocery item works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    const item = await manager.addGroceryItem('Test Apples', 5, 'produce', testData.users.testUser);

    assert.hasProperty(item, 'id', 'Should have ID');
    assert.equal(item.name, 'Test Apples', 'Should set name correctly');
    assert.equal(item.quantity, 5, 'Should set quantity correctly');
    assert.equal(item.category, 'produce', 'Should set category correctly');
    assert.false(item.purchased, 'Should default to unpurchased');
    assert.hasProperty(item, 'createdAt', 'Should have creation timestamp');

    await manager.cleanup();
});

// Test 3: Get Grocery Items
runner.test('Get grocery items returns correct data', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add test items
    await manager.addGroceryItem('Apples', 5, 'produce', testData.users.testUser);
    await manager.addGroceryItem('Milk', 1, 'dairy', testData.users.testUser);

    const items = await manager.getGroceryItems(testData.users.testUser);

    assert.isArray(items, 'Should return array');
    assert.equal(items.length, 2, 'Should return all items');
    assert.equal(items[0].name, 'Apples', 'Should have first item');
    assert.equal(items[1].name, 'Milk', 'Should have second item');

    await manager.cleanup();
});

// Test 4: Purchase Item
runner.test('Purchase item works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add item
    const item = await manager.addGroceryItem('Test Item', 1, 'other', testData.users.testUser);

    // Purchase item
    const purchasedItem = await manager.purchaseItem(item.id, testData.users.testUser);

    assert.true(purchasedItem.purchased, 'Should be marked as purchased');
    assert.hasProperty(purchasedItem, 'purchasedAt', 'Should have purchase timestamp');
    assert.hasProperty(purchasedItem, 'updatedAt', 'Should have updated timestamp');

    await manager.cleanup();
});

// Test 5: Delete Grocery Item
runner.test('Delete grocery item works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add item
    const item = await manager.addGroceryItem('Test Delete', 1, 'other', testData.users.testUser);

    // Delete item
    const result = await manager.deleteGroceryItem(item.id, testData.users.testUser);

    assert.true(result.success, 'Should succeed');
    assert.hasProperty(result, 'deletedItem', 'Should return deleted item');

    // Verify deletion
    const items = await manager.getGroceryItems(testData.users.testUser);
    assert.equal(items.length, 0, 'Should have no items after deletion');

    await manager.cleanup();
});

// Test 6: Search Grocery Items
runner.test('Search grocery items works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add test items
    await manager.addGroceryItem('Organic Apples', 5, 'produce', testData.users.testUser);
    await manager.addGroceryItem('Apple Juice', 1, 'beverages', testData.users.testUser);
    await manager.addGroceryItem('Bananas', 3, 'produce', testData.users.testUser);

    // Search for items containing "apple"
    const results = await manager.searchGroceryItems('apple', testData.users.testUser);

    assert.isArray(results, 'Should return array');
    assert.equal(results.length, 2, 'Should find 2 items containing "apple"');
    assert.true(results[0].name.toLowerCase().includes('apple'), 'First result should contain "apple"');
    assert.true(results[1].name.toLowerCase().includes('apple'), 'Second result should contain "apple"');

    await manager.cleanup();
});

// Test 7: Get Grocery Statistics
runner.test('Get grocery statistics works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add and purchase some items
    const item1 = await manager.addGroceryItem('Item 1', 1, 'produce', testData.users.testUser);
    const item2 = await manager.addGroceryItem('Item 2', 1, 'dairy', testData.users.testUser);
    const item3 = await manager.addGroceryItem('Item 3', 1, 'produce', testData.users.testUser);

    await manager.purchaseItem(item1.id, testData.users.testUser);

    const stats = await manager.getStats(testData.users.testUser);

    assert.hasProperty(stats, 'totalItems', 'Should have total count');
    assert.hasProperty(stats, 'purchasedItems', 'Should have purchased count');
    assert.hasProperty(stats, 'pendingItems', 'Should have pending count');
    assert.equal(stats.totalItems, 3, 'Should have 3 total items');
    assert.equal(stats.purchasedItems, 1, 'Should have 1 purchased item');
    assert.equal(stats.pendingItems, 2, 'Should have 2 pending items');

    await manager.cleanup();
});

// Test 8: Get Categories
runner.test('Get categories works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add items with different categories
    await manager.addGroceryItem('Apples', 1, 'produce', testData.users.testUser);
    await manager.addGroceryItem('Milk', 1, 'dairy', testData.users.testUser);
    await manager.addGroceryItem('Bread', 1, 'pantry', testData.users.testUser);

    const categories = await manager.getCategories(testData.users.testUser);

    assert.isArray(categories, 'Should return array');
    assert.true(categories.includes('produce'), 'Should include produce');
    assert.true(categories.includes('dairy'), 'Should include dairy');
    assert.true(categories.includes('pantry'), 'Should include pantry');

    await manager.cleanup();
});

// Test 9: Data Validation
runner.test('Data validation works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Test adding item with empty name (should throw or handle gracefully)
    try {
        await manager.addGroceryItem('', 1, 'other', testData.users.testUser);
        // If it doesn't throw, check that it handled gracefully
        const items = await manager.getGroceryItems(testData.users.testUser);
        assert.true(items.length === 0 || items[0].name.length > 0, 'Should not create item with empty name');
    } catch (error) {
        // Expected behavior - validation should catch empty names
        assert.true(error.message.length > 0, 'Should provide error message');
    }

    // Test adding item with invalid quantity
    try {
        await manager.addGroceryItem('Test Item', -1, 'other', testData.users.testUser);
        // If it doesn't throw, check that it handled gracefully
        const items = await manager.getGroceryItems(testData.users.testUser);
        assert.true(items.length === 0 || items[0].quantity > 0, 'Should not allow negative quantities');
    } catch (error) {
        // Expected behavior - validation should catch negative quantities
        assert.true(error.message.length > 0, 'Should provide error message');
    }

    await manager.cleanup();
});

// Test 10: User Isolation
runner.test('User data isolation works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add items for different users
    await manager.addGroceryItem('User1 Item', 1, 'other', testData.users.testUser);
    await manager.addGroceryItem('User2 Item', 1, 'other', testData.users.testUser2);

    // Verify each user sees only their items
    const user1Items = await manager.getGroceryItems(testData.users.testUser);
    const user2Items = await manager.getGroceryItems(testData.users.testUser2);

    assert.equal(user1Items.length, 1, 'User 1 should have 1 item');
    assert.equal(user2Items.length, 1, 'User 2 should have 1 item');
    assert.equal(user1Items[0].name, 'User1 Item', 'User 1 should see their item');
    assert.equal(user2Items[0].name, 'User2 Item', 'User 2 should see their item');

    await manager.cleanup();
});

// Test 11: Filter by Purchase Status
runner.test('Filter by purchase status works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add items and purchase some
    const item1 = await manager.addGroceryItem('Item 1', 1, 'other', testData.users.testUser);
    const item2 = await manager.addGroceryItem('Item 2', 1, 'other', testData.users.testUser);
    const item3 = await manager.addGroceryItem('Item 3', 1, 'other', testData.users.testUser);

    await manager.purchaseItem(item1.id, testData.users.testUser);
    await manager.purchaseItem(item2.id, testData.users.testUser);

    // Get all items and filter manually (since the actual API doesn't have getGroceryList with filters)
    const allItems = await manager.getGroceryItems(testData.users.testUser);
    const purchasedItems = allItems.filter(item => item.purchased);
    const unpurchasedItems = allItems.filter(item => !item.purchased);

    assert.equal(purchasedItems.length, 2, 'Should have 2 purchased items');
    assert.equal(unpurchasedItems.length, 1, 'Should have 1 unpurchased item');

    await manager.cleanup();
});

// Test 12: Auto-categorization
runner.test('Auto-categorization works correctly', async () => {
    const manager = new MockGroceryManager();
    await manager.initialize();

    // Add item without category (should auto-categorize)
    const item = await manager.addGroceryItem('Bread', 1, null, testData.users.testUser);

    assert.hasProperty(item, 'category', 'Should have category');
    assert.true(item.category.length > 0, 'Should have non-empty category');
    // Note: Specific auto-categorization logic depends on implementation

    await manager.cleanup();
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