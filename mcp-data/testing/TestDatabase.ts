/**
 * Generic Test Database Helper for MCP Servers
 * Provides MongoDB setup, teardown, and storage management for tests
 * Supports different storage types and collections
 */

import { MongoClient } from 'mongodb';
import { PaginatedGraphStorage } from '../storage/PaginatedGraphStorage.js';

export interface TestDatabaseConfig {
    testName?: string;
    collectionName?: string;
    connectionString?: string;
    baseDbName?: string;
}

/**
 * Test Database Manager Class
 */
export class TestDatabase {
    public testName: string;
    public client: MongoClient | null = null;
    public db: any = null;
    public isConnected = false;
    public dbName: string;
    public connectionString: string;
    public collectionName: string;

    constructor(config: TestDatabaseConfig = {}) {
        this.testName = config.testName || 'default';
        this.collectionName = config.collectionName || 'mcp_data';

        // Use test-specific database name with timestamp for isolation
        const baseDbName = config.baseDbName || process.env.MONGODB_TEST_DATABASE || 'mcp_test_db';
        this.dbName = `${baseDbName}_${this.testName}_${Date.now()}`;

        this.connectionString = config.connectionString ||
            process.env.MONGODB_CONNECTION_STRING ||
            'mongodb://localhost:27017';
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
            throw new Error(`Failed to connect to test database: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create MongoDB indexes for optimal performance
     * Can be overridden by specific MCP servers for custom indexes
     */
    async createIndexes() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection(this.collectionName);

        // Create basic indexes that work for most MCP servers
        await collection.createIndex({ userId: 1 });
        await collection.createIndex({ updatedAt: -1 });
        await collection.createIndex({ userId: 1, updatedAt: -1 });

        console.log(`📁 Created indexes for test database: ${this.dbName}`);
    }

    /**
     * Create a PaginatedGraphStorage instance for testing
     */
    createPaginatedGraphStorage(_userId = 'test-user') {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call connect() first.');
        }

        return new PaginatedGraphStorage(this.connectionString, this.dbName, this.collectionName);
    }

    /**
     * Clear all data for a specific user
     */
    async clearUserData(userId: string) {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection(this.collectionName);
        const result = await collection.deleteMany({ userId });

        console.log(`🗑️  Cleared ${result.deletedCount} documents for user: ${userId}`);
        return result.deletedCount;
    }

    /**
     * Clear all data from the test database (all users)
     */
    async clearAllData() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection(this.collectionName);
        const result = await collection.deleteMany({});

        console.log(`🗑️  Cleared all ${result.deletedCount} documents from database`);
        return result.deletedCount;
    }

    /**
     * Apply test environment configuration
     */
    async applyTestEnvironment(config: any = {}) {
        // Set up environment variables for testing
        const defaultConfig = {
            MCP_STORAGE_TYPE: config.storageType || 'mongodb',
            MONGODB_CONNECTION_STRING: this.connectionString,
            MONGODB_DATABASE: this.dbName,
            MONGODB_COLLECTION: this.collectionName,
            MCP_USER_BASED: 'true',
            MCP_DEBUG: 'true'
        };

        // Apply to process.env
        Object.assign(process.env, defaultConfig, config.env || {});

        console.log(`🔧 Applied test environment for database: ${this.dbName}`);
        return defaultConfig;
    }

    /**
     * Insert test data for a user
     */
    async insertTestData(userId: string, data: any) {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection(this.collectionName);
        const document = {
            userId,
            data,
            updatedAt: new Date(),
            createdAt: new Date(),
            version: '1.0.0',
            dataType: 'test-data'
        };

        await collection.replaceOne(
            { userId },
            document,
            { upsert: true }
        );

        console.log(`📝 Inserted test data for user: ${userId}`);
    }

    /**
     * Get test data statistics
     */
    async getStats() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection(this.collectionName);
        const totalDocs = await collection.countDocuments();
        const userCounts = await collection.aggregate([
            { $group: { _id: '$userId', count: { $sum: 1 } } }
        ]).toArray();

        return {
            totalDocuments: totalDocs,
            userCounts: userCounts.reduce((acc: any, item: any) => {
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
            await this.client?.close();
            this.isConnected = false;
            console.log(`🔌 Disconnected from MongoDB`);
        } catch (error) {
            console.error(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Reset database to clean state
     */
    async reset() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const collection = this.db.collection(this.collectionName);
        await collection.deleteMany({});
        console.log(`🔄 Reset test database: ${this.dbName}`);
    }
}

/**
 * Create a test database instance
 */
export function createTestDatabase(config: TestDatabaseConfig = {}) {
    return new TestDatabase(config);
}

/**
 * Helper function for quick test setup
 */
export async function setupTestDatabase(config: TestDatabaseConfig = {}) {
    const testDb = createTestDatabase(config);
    await testDb.connect();
    await testDb.createIndexes();
    return testDb;
}

/**
 * Helper function for quick test cleanup
 */
export async function cleanupTestDatabase(testDb: TestDatabase) {
    if (testDb && testDb.cleanup) {
        await testDb.cleanup();
    }
}

/**
 * Create storage instance with auto-cleanup
 */
export async function createTestStorage(_userId = 'test-user', config: TestDatabaseConfig = {}) {
    const testDb = await setupTestDatabase(config);
    const storage = testDb.createPaginatedGraphStorage();

    return {
        storage,
        cleanup: () => testDb.cleanup(),
        testDb
    };
} 