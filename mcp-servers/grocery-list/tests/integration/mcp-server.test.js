#!/usr/bin/env node

/**
 * Integration Tests for Grocery List MCP Server
 * Tests full MCP server functionality:
 * - JSON-RPC communication
 * - Tool definitions and execution
 * - Web UI generation
 * - End-to-end workflows
 */

import { TestRunner, assert, MCPServerTestHelper, setupTestEnvironment, cleanupTestEnvironment, testData } from '../helpers/test-utilities.js';

// Setup test environment
setupTestEnvironment();

// Initialize test runner
const runner = new TestRunner('MCP Server Integration Tests');
let serverHelper;

// Setup before tests
async function setupServer() {
    serverHelper = new MCPServerTestHelper();
    await serverHelper.startServer();
}

// Cleanup after tests
async function cleanupServer() {
    if (serverHelper) {
        await serverHelper.cleanup();
    }
    await cleanupTestEnvironment();
}

// Test 1: Server Startup and Tool Listing
runner.test('Server starts and lists tools correctly', async () => {
    await setupServer();

    const response = await serverHelper.sendRequest(testData.mcpRequests.listTools);

    assert.hasProperty(response, 'result', 'Should have result');
    assert.hasProperty(response.result, 'tools', 'Should have tools array');
    assert.isArray(response.result.tools, 'Tools should be array');
    assert.true(response.result.tools.length > 0, 'Should have at least one tool');

    // Check for expected tools
    const toolNames = response.result.tools.map(tool => tool.name);
    assert.true(toolNames.includes('add_grocery_item'), 'Should have add_grocery_item tool');
    assert.true(toolNames.includes('get_grocery_list'), 'Should have get_grocery_list tool');
    assert.true(toolNames.includes('purchase_item'), 'Should have purchase_item tool');
    assert.true(toolNames.includes('delete_grocery_item'), 'Should have delete_grocery_item tool');
    assert.true(toolNames.includes('get_web_ui'), 'Should have get_web_ui tool');

    await cleanupServer();
});

// Test 2: Add Grocery Item
runner.test('Add grocery item works via MCP', async () => {
    await setupServer();

    const response = await serverHelper.sendRequest(
        testData.mcpRequests.addItem('Test Apples', 5, 'produce')
    );

    assert.hasProperty(response, 'result', 'Should have result');
    assert.hasProperty(response.result, 'content', 'Should have content');
    assert.isArray(response.result.content, 'Content should be array');
    assert.true(response.result.content.length > 0, 'Should have content');

    const content = response.result.content[0].text;
    assert.true(content.includes('Test Apples'), 'Should mention item name');
    assert.true(content.includes('5'), 'Should mention quantity');
    assert.true(content.includes('produce'), 'Should mention category');

    await cleanupServer();
});

// Test 3: Get Grocery List
runner.test('Get grocery list works via MCP', async () => {
    await setupServer();

    // Add some items first
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Apples', 5, 'produce'));
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Milk', 1, 'dairy'));

    const response = await serverHelper.sendRequest(testData.mcpRequests.getList());

    assert.hasProperty(response, 'result', 'Should have result');
    assert.hasProperty(response.result, 'content', 'Should have content');

    const content = response.result.content[0].text;
    assert.true(content.includes('Apples'), 'Should list first item');
    assert.true(content.includes('Milk'), 'Should list second item');
    assert.true(content.includes('2'), 'Should show total count');

    await cleanupServer();
});

// Test 4: Purchase Item
runner.test('Purchase item works via MCP', async () => {
    await setupServer();

    // Add an item first
    const addResponse = await serverHelper.sendRequest(
        testData.mcpRequests.addItem('Test Item', 1, 'other')
    );

    // Extract item ID from response (this might need adjustment based on actual response format)
    const addContent = addResponse.result.content[0].text;

    // Purchase the item (using ID "1" for simplicity in test)
    const purchaseResponse = await serverHelper.sendRequest(
        testData.mcpRequests.purchaseItem('1')
    );

    assert.hasProperty(purchaseResponse, 'result', 'Should have result');
    const purchaseContent = purchaseResponse.result.content[0].text;
    assert.true(purchaseContent.includes('purchased') || purchaseContent.includes('completed'), 'Should indicate purchase');

    await cleanupServer();
});

// Test 5: Delete Grocery Item
runner.test('Delete grocery item works via MCP', async () => {
    await setupServer();

    // Add an item first
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Delete Me', 1, 'other'));

    // Delete the item
    const deleteResponse = await serverHelper.sendRequest(
        testData.mcpRequests.deleteItem('1')
    );

    assert.hasProperty(deleteResponse, 'result', 'Should have result');
    const deleteContent = deleteResponse.result.content[0].text;
    assert.true(deleteContent.includes('deleted') || deleteContent.includes('removed'), 'Should indicate deletion');

    await cleanupServer();
});

// Test 6: Search Grocery Items
runner.test('Search grocery items works via MCP', async () => {
    await setupServer();

    // Add some items
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Apple Juice', 1, 'beverages'));
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Apple Pie', 1, 'dessert'));
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Bananas', 1, 'produce'));

    const searchResponse = await serverHelper.sendRequest(
        testData.mcpRequests.searchItems('apple')
    );

    assert.hasProperty(searchResponse, 'result', 'Should have result');
    const searchContent = searchResponse.result.content[0].text;
    assert.true(searchContent.includes('Apple Juice'), 'Should find Apple Juice');
    assert.true(searchContent.includes('Apple Pie'), 'Should find Apple Pie');
    assert.false(searchContent.includes('Bananas'), 'Should not include Bananas');

    await cleanupServer();
});

// Test 7: Get Grocery Statistics
runner.test('Get grocery statistics works via MCP', async () => {
    await setupServer();

    // Add and purchase some items
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Item 1', 1, 'produce'));
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Item 2', 1, 'dairy'));
    await serverHelper.sendRequest(testData.mcpRequests.purchaseItem('1'));

    const statsResponse = await serverHelper.sendRequest(testData.mcpRequests.getStats());

    assert.hasProperty(statsResponse, 'result', 'Should have result');
    const statsContent = statsResponse.result.content[0].text;
    assert.true(statsContent.includes('total') || statsContent.includes('Total'), 'Should show total stats');
    assert.true(statsContent.includes('purchased') || statsContent.includes('completed'), 'Should show purchased stats');

    await cleanupServer();
});

// Test 8: Get Categories
runner.test('Get categories works via MCP', async () => {
    await setupServer();

    const categoriesResponse = await serverHelper.sendRequest(testData.mcpRequests.getCategories());

    assert.hasProperty(categoriesResponse, 'result', 'Should have result');
    const categoriesContent = categoriesResponse.result.content[0].text;

    // Should include default categories
    assert.true(categoriesContent.includes('produce'), 'Should include produce category');
    assert.true(categoriesContent.includes('dairy'), 'Should include dairy category');
    assert.true(categoriesContent.includes('pantry'), 'Should include pantry category');

    await cleanupServer();
});

// Test 9: Get Web UI
runner.test('Get web UI works via MCP', async () => {
    await setupServer();

    const webUIResponse = await serverHelper.sendRequest(testData.mcpRequests.getWebUI());

    assert.hasProperty(webUIResponse, 'result', 'Should have result');
    const webUIContent = webUIResponse.result.content[0].text;

    // Should contain HTML and URL
    assert.true(webUIContent.includes('http://'), 'Should contain web UI URL');
    assert.true(webUIContent.includes('<!DOCTYPE html>') || webUIContent.includes('<html'), 'Should contain HTML');
    assert.true(webUIContent.includes('grocery'), 'Should reference grocery functionality');

    await cleanupServer();
});

// Test 10: End-to-End Workflow
runner.test('Complete grocery workflow works via MCP', async () => {
    await setupServer();

    // 1. Start with empty list
    let listResponse = await serverHelper.sendRequest(testData.mcpRequests.getList());
    let content = listResponse.result.content[0].text;
    assert.true(content.includes('0') || content.includes('empty') || content.includes('no items'), 'Should start empty');

    // 2. Add multiple items
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Apples', 5, 'produce'));
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Milk', 1, 'dairy'));
    await serverHelper.sendRequest(testData.mcpRequests.addItem('Bread', 2, 'pantry'));

    // 3. Verify list has items
    listResponse = await serverHelper.sendRequest(testData.mcpRequests.getList());
    content = listResponse.result.content[0].text;
    assert.true(content.includes('3') || content.includes('Apples'), 'Should have added items');

    // 4. Purchase some items
    await serverHelper.sendRequest(testData.mcpRequests.purchaseItem('1'));
    await serverHelper.sendRequest(testData.mcpRequests.purchaseItem('2'));

    // 5. Check statistics
    const statsResponse = await serverHelper.sendRequest(testData.mcpRequests.getStats());
    const statsContent = statsResponse.result.content[0].text;
    assert.true(statsContent.includes('3'), 'Should show 3 total items');
    assert.true(statsContent.includes('2'), 'Should show 2 purchased items');

    // 6. Search functionality
    const searchResponse = await serverHelper.sendRequest(testData.mcpRequests.searchItems('bread'));
    const searchContent = searchResponse.result.content[0].text;
    assert.true(searchContent.includes('Bread'), 'Should find bread in search');

    // 7. Delete an item
    await serverHelper.sendRequest(testData.mcpRequests.deleteItem('3'));

    // 8. Verify final state
    listResponse = await serverHelper.sendRequest(testData.mcpRequests.getList());
    content = listResponse.result.content[0].text;
    assert.true(content.includes('2'), 'Should have 2 items after deletion');

    await cleanupServer();
});

// Test 11: Error Handling
runner.test('Error handling works correctly via MCP', async () => {
    await setupServer();

    // Test invalid tool call
    const invalidRequest = {
        jsonrpc: "2.0",
        id: 999,
        method: "tools/call",
        params: {
            name: "nonexistent_tool",
            arguments: {}
        }
    };

    const errorResponse = await serverHelper.sendRequest(invalidRequest);
    assert.hasProperty(errorResponse, 'error', 'Should have error for invalid tool');

    // Test delete non-existent item
    const deleteResponse = await serverHelper.sendRequest(testData.mcpRequests.deleteItem('nonexistent'));
    // Should either error or gracefully handle
    assert.true(deleteResponse.error || deleteResponse.result, 'Should handle non-existent item deletion');

    await cleanupServer();
});

// Test 12: Concurrent Operations
runner.test('Concurrent operations work correctly', async () => {
    await setupServer();

    // Send multiple add requests concurrently
    const promises = [
        serverHelper.sendRequest(testData.mcpRequests.addItem('Item 1', 1, 'produce')),
        serverHelper.sendRequest(testData.mcpRequests.addItem('Item 2', 1, 'dairy')),
        serverHelper.sendRequest(testData.mcpRequests.addItem('Item 3', 1, 'pantry'))
    ];

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach((response, index) => {
        assert.hasProperty(response, 'result', `Request ${index + 1} should succeed`);
        assert.true(response.result.content[0].text.includes(`Item ${index + 1}`), `Should add Item ${index + 1}`);
    });

    // Verify all items are present
    const listResponse = await serverHelper.sendRequest(testData.mcpRequests.getList());
    const content = listResponse.result.content[0].text;
    assert.true(content.includes('3'), 'Should have 3 items total');

    await cleanupServer();
});

// Cleanup on exit
process.on('exit', async () => {
    await cleanupServer();
});

process.on('SIGINT', async () => {
    await cleanupServer();
    process.exit(0);
});

// Run all tests and exit properly
async function runTests() {
    try {
        const success = await runner.run();
        await cleanupServer();
        await cleanupTestEnvironment();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Test execution failed:', error);
        await cleanupServer();
        await cleanupTestEnvironment();
        process.exit(1);
    }
}

runTests(); 