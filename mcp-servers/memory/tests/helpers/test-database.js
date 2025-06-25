/**
 * Test Database Helper for Memory MCP Server
 * Provides MongoDB setup, teardown, and storage management for tests
 */

import { MongoClient } from 'mongodb';
import { PaginatedGraphStorage } from '@sizzek/mcp-data';

/**
 * Test Database Manager Class
 */
class TestDatabase {
    constructor(testName = 'default') {
        this.testName = testName;
        this.client = null;
        this.db = null;
        this.isConnected = false;

        // Use test-specific database name
        const baseDbName = process.env.MONGODB_TEST_DATABASE || 'mcp_test_db';
        this.dbName = `${baseDbName}_${testName}_${Date.now()}`;

        const connectionString = process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017';
        this.connectionString = connectionString;
    }

    /**
     * Connect to MongoDB test database
     */
    async connect() {
        if (this.isConnected) {
            return this.db;
        }

        try {
            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
            });

            await this.client.connect();
            this.db = this.client.db(this.dbName);
            this.isConnected = true;

            console.log(`🔗 Connected to test database: ${this.dbName}`);
            return this.db;
        } catch (error) {
            throw new Error(`Failed to connect to test database: ${error.message}`);
        }
    }

    /**
     * Create MongoDB indexes for optimal performance
     */
    async createIndexes() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection('mcp_memory');

        // Create indexes for efficient querying
        await collection.createIndex({ userId: 1 });
        await collection.createIndex({ userId: 1, 'data.entities.name': 1 });
        await collection.createIndex({ userId: 1, 'data.entities.entityType': 1 });
        await collection.createIndex({ userId: 1, 'data.relations.from': 1 });
        await collection.createIndex({ userId: 1, 'data.relations.to': 1 });
        await collection.createIndex({ userId: 1, 'data.entities.searchText': 'text' });

        console.log(`📁 Created indexes for test database: ${this.dbName}`);
    }

    /**
     * Create a PaginatedGraphStorage instance for testing
     */
    createStorage(userId = 'test-user') {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call connect() first.');
        }

        // PaginatedGraphStorage expects connection string and database name
        return new PaginatedGraphStorage(this.connectionString, this.dbName, 'mcp_memory');
    }

    /**
     * Clear all data for a specific user
     */
    async clearUserData(userId) {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection('mcp_memory');
        const result = await collection.deleteMany({ userId });

        console.log(`🗑️  Cleared ${result.deletedCount} documents for user: ${userId}`);
        return result.deletedCount;
    }

    /**
     * Get test data statistics
     */
    async getStats() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection('mcp_memory');
        const totalDocs = await collection.countDocuments();
        const userCounts = await collection.aggregate([
            { $group: { _id: '$userId', count: { $sum: 1 } } }
        ]).toArray();

        return {
            totalDocuments: totalDocs,
            userCounts: userCounts.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {})
        };
    }

    /**
     * Cleanup and close database connection
     */
    async cleanup() {
        if (!this.isConnected) {
            return;
        }

        try {
            // Drop the test database
            await this.db.dropDatabase();
            console.log(`🗑️  Dropped test database: ${this.dbName}`);

            // Close connection
            await this.client.close();
            this.isConnected = false;
            console.log(`🔌 Disconnected from MongoDB`);
        } catch (error) {
            console.error(`Error during cleanup: ${error.message}`);
        }
    }

    /**
     * Reset database to clean state
     */
    async reset() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection('mcp_memory');
        await collection.deleteMany({});
        console.log(`🔄 Reset test database: ${this.dbName}`);
    }
}

/**
 * Create a test database instance
 */
export function getTestDatabase(testName = 'default') {
    return new TestDatabase(testName);
}

/**
 * Helper function for quick test setup
 */
export async function setupTestDatabase(testName = 'quick-test') {
    const testDb = getTestDatabase(testName);
    await testDb.connect();
    await testDb.createIndexes();
    return testDb;
}

/**
 * Helper function for quick test cleanup
 */
export async function cleanupTestDatabase(testDb) {
    if (testDb && testDb.cleanup) {
        await testDb.cleanup();
    }
}

/**
 * Create storage instance with auto-cleanup
 */
export async function createTestStorage(userId = 'test-user', testName = 'storage-test') {
    const testDb = await setupTestDatabase(testName);
    const storage = testDb.createStorage(userId);

    return {
        storage,
        cleanup: () => testDb.cleanup(),
        testDb
    };
} 