/**
 * Test Database Helper for Todoodles MCP Server
 * Uses centralized TestDatabase from @sizzek/mcp-data package
 */

import {
    createTestDatabase,
    setupTestDatabase,
    cleanupTestDatabase
} from '@sizzek/mcp-data';

/**
 * Create a test database configured for todoodles
 */
export function getTestDatabase(testName) {
    const config = {
        testName: `todoodles_${testName}`,
        collectionName: 'user_todoodles',
        baseDbName: 'test_todoodles'
    };

    return createTestDatabase(config);
}

/**
 * Setup test database with indexes optimized for todoodles
 */
export async function setupTodoodlesTestDatabase(testName) {
    const config = {
        testName: `todoodles_${testName}`,
        collectionName: 'user_todoodles',
        baseDbName: 'test_todoodles'
    };

    const testDb = await setupTestDatabase(config);

    // Add todoodles-specific indexes
    if (testDb.isConnected && testDb.db) {
        const collection = testDb.db.collection('user_todoodles');
        try {
            await collection.createIndex({ "userId": 1, "data.todoodles.id": 1 });
            await collection.createIndex({ "userId": 1, "data.todoodles.completed": 1 });
            await collection.createIndex({ "userId": 1, "data.todoodles.priority": 1 });
            await collection.createIndex({ "userId": 1, "data.todoodles.category": 1 });
            await collection.createIndex({ "userId": 1, "data.todoodles.dueDate": 1 });
            console.log('📁 Created todoodles-specific indexes');
        } catch (error) {
            console.warn('⚠️  Could not create todoodles indexes:', error.message);
        }
    }

    return testDb;
}

/**
 * Cleanup test database
 */
export async function cleanupTodoodlesTestDatabase(testDb) {
    await cleanupTestDatabase(testDb);
}

/**
 * Legacy compatibility - cleanup all test databases
 */
export async function cleanupAllTestDatabases() {
    console.log('🗑️  Test database cleanup completed (using centralized cleanup)');
} 