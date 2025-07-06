/**
 * MongoDB Mocks for Testing
 * 
 * This module provides comprehensive mocks for MongoDB operations
 * used in the scheduled tasks MCP server, particularly for user lookup testing.
 */

// =============================================
// Mock ObjectId Implementation
// =============================================

export class MockObjectId {
    constructor(id) {
        this.id = id || Math.random().toString(36).substr(2, 24);
    }

    toString() {
        return this.id;
    }

    equals(other) {
        return this.id === (other?.id || other);
    }

    toHexString() {
        return this.id;
    }

    static isValid(id) {
        return typeof id === 'string' && id.length > 0;
    }

    static createFromHexString(hex) {
        return new MockObjectId(hex);
    }
}

// =============================================
// Mock MongoDB Client
// =============================================

export class MockMongoClient {
    constructor(connectionString, options = {}) {
        this.connectionString = connectionString;
        this.options = options;
        this.connected = false;
        this.databases = new Map();
        this.connectTimeout = options.connectTimeoutMS || 10000;
        this.serverSelectionTimeout = options.serverSelectionTimeoutMS || 10000;
        this.connectionAttempts = 0;
        this.shouldFailConnection = false;
        this.connectionDelay = 10; // ms
    }

    // Configure mock behavior
    setConnectionFailure(shouldFail) {
        this.shouldFailConnection = shouldFail;
    }

    setConnectionDelay(delay) {
        this.connectionDelay = delay;
    }

    async connect() {
        this.connectionAttempts++;

        if (this.shouldFailConnection) {
            throw new Error('Mock connection failure');
        }

        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, this.connectionDelay));

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

    // Test utilities
    getConnectionAttempts() {
        return this.connectionAttempts;
    }

    isConnected() {
        return this.connected;
    }
}

// =============================================
// Mock Database
// =============================================

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

    // Test utilities
    dropDatabase() {
        this.collections.clear();
    }

    listCollections() {
        return {
            toArray: async () => Array.from(this.collections.keys()).map(name => ({ name }))
        };
    }
}

// =============================================
// Mock Collection
// =============================================

export class MockCollection {
    constructor(name) {
        this.name = name;
        this.documents = new Map();
        this.nextId = 1;
        this.queryFailure = false;
        this.queryDelay = 0;
    }

    // Configure mock behavior
    setQueryFailure(shouldFail) {
        this.queryFailure = shouldFail;
    }

    setQueryDelay(delay) {
        this.queryDelay = delay;
    }

    async findOne(query = {}, options = {}) {
        if (this.queryFailure) {
            throw new Error('Mock query failure');
        }

        if (this.queryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.queryDelay));
        }

        console.log('🔍 Mock Debug: findOne query:', JSON.stringify(query, null, 2));

        const results = [];
        for (const [id, doc] of this.documents) {
            if (this.matchesQuery(doc, query)) {
                console.log('🔍 Mock Debug: Found matching document:', JSON.stringify(doc, null, 2));
                results.push(doc);
            }
        }

        if (results.length > 0) {
            // Apply projection if specified
            if (options.projection) {
                return this.applyProjection(results[0], options.projection);
            }
            return results[0];
        }

        return null;
    }

    async find(query = {}, options = {}) {
        if (this.queryFailure) {
            throw new Error('Mock query failure');
        }

        if (this.queryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.queryDelay));
        }

        const docs = Array.from(this.documents.values());
        let results = docs;

        // Apply query filters
        if (query && Object.keys(query).length > 0) {
            results = docs.filter(d => this.matchesQuery(d, query));
        }

        // Apply projection
        if (options.projection) {
            results = results.map(doc => this.applyProjection(doc, options.projection));
        }

        return new MockCursor(results);
    }

    async insertOne(document) {
        const id = document._id || this.nextId++;
        const doc = {
            _id: id.toString(),
            ...document,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.documents.set(id.toString(), doc);
        return {
            insertedId: id.toString(),
            acknowledged: true
        };
    }

    async insertMany(documents) {
        const results = [];
        for (const document of documents) {
            const result = await this.insertOne(document);
            results.push(result.insertedId);
        }
        return {
            insertedIds: results,
            acknowledged: true
        };
    }

    async updateOne(query, update, options = {}) {
        const doc = await this.findOne(query);
        if (doc) {
            const updatedDoc = { ...doc };

            // Apply $set operations
            if (update.$set) {
                Object.assign(updatedDoc, update.$set);
            }

            // Apply $unset operations
            if (update.$unset) {
                for (const key of Object.keys(update.$unset)) {
                    delete updatedDoc[key];
                }
            }

            // Apply $inc operations
            if (update.$inc) {
                for (const [key, value] of Object.entries(update.$inc)) {
                    updatedDoc[key] = (updatedDoc[key] || 0) + value;
                }
            }

            updatedDoc.updatedAt = new Date();
            this.documents.set(doc._id, updatedDoc);

            return {
                matchedCount: 1,
                modifiedCount: 1,
                acknowledged: true
            };
        }

        return {
            matchedCount: 0,
            modifiedCount: 0,
            acknowledged: true
        };
    }

    async updateMany(query, update, options = {}) {
        const cursor = await this.find(query);
        const docs = await cursor.toArray();

        let modifiedCount = 0;
        for (const doc of docs) {
            const result = await this.updateOne({ _id: doc._id }, update, options);
            modifiedCount += result.modifiedCount;
        }

        return {
            matchedCount: docs.length,
            modifiedCount: modifiedCount,
            acknowledged: true
        };
    }

    async deleteOne(query) {
        const doc = await this.findOne(query);
        if (doc) {
            this.documents.delete(doc._id);
            return {
                deletedCount: 1,
                acknowledged: true
            };
        }
        return {
            deletedCount: 0,
            acknowledged: true
        };
    }

    async deleteMany(query) {
        const cursor = await this.find(query);
        const docs = await cursor.toArray();

        for (const doc of docs) {
            this.documents.delete(doc._id);
        }

        return {
            deletedCount: docs.length,
            acknowledged: true
        };
    }

    async countDocuments(query = {}) {
        const cursor = await this.find(query);
        const docs = await cursor.toArray();
        return docs.length;
    }

    // Helper methods
    matchesQuery(doc, query) {
        console.log('🔍 Mock Debug: matchesQuery called with doc:', JSON.stringify(doc, null, 2), 'query:', JSON.stringify(query, null, 2));

        // Handle empty query
        if (!query || Object.keys(query).length === 0) {
            console.log('🔍 Mock Debug: Empty query, returning true');
            return true;
        }

        // Handle _id queries (both string and ObjectId)
        if (query._id) {
            const id = query._id instanceof MockObjectId ? query._id.toString() : query._id;
            const result = doc._id === id;
            console.log('🔍 Mock Debug: _id query result:', result);
            return result;
        }

        // Handle complex queries
        for (const [key, value] of Object.entries(query)) {
            if (key === '$or') {
                console.log('🔍 Mock Debug: Processing $or query');
                const result = this.matchesCondition(doc, { [key]: value });
                console.log('🔍 Mock Debug: $or query result:', result);
                if (!result) return false;
            } else {
                const result = this.matchesCondition(doc, { [key]: value });
                console.log('🔍 Mock Debug: Simple query result for', key, ':', result);
                if (!result) return false;
            }
        }

        console.log('🔍 Mock Debug: matchesQuery returning true');
        return true;
    }

    matchesCondition(doc, condition) {
        for (const [key, value] of Object.entries(condition)) {
            if (key === '$or') {
                // Handle $or operator - check if any condition matches
                const orConditions = value;
                const hasMatch = orConditions.some(orCondition =>
                    this.matchesCondition(doc, orCondition)
                );
                if (!hasMatch) return false;
            } else if (typeof value === 'object' && value !== null) {
                if (value.$regex !== undefined) {
                    // Handle regex pattern matching
                    const fieldValue = this.getNestedValue(doc, key);
                    if (fieldValue === undefined || fieldValue === null) return false;

                    const flags = value.$options || '';
                    const regex = new RegExp(value.$regex, flags);
                    if (!regex.test(fieldValue.toString())) return false;
                } else {
                    // Handle nested object matching (like metadata.agentName)
                    const fieldValue = this.getNestedValue(doc, key);
                    if (fieldValue === undefined || fieldValue === null) return false;
                    if (fieldValue !== value) return false;
                }
            } else {
                // Direct value comparison
                const fieldValue = this.getNestedValue(doc, key);
                if (fieldValue !== value) return false;
            }
        }
        return true;
    }

    // Helper method to get nested values like 'metadata.agentName'
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    applyProjection(doc, projection) {
        const result = {};

        // Handle inclusion projection
        const includeFields = Object.keys(projection).filter(key => projection[key] === 1);
        if (includeFields.length > 0) {
            for (const field of includeFields) {
                if (doc.hasOwnProperty(field)) {
                    result[field] = doc[field];
                }
            }
            // Always include _id unless explicitly excluded
            if (!projection._id || projection._id === 1) {
                result._id = doc._id;
            }
        } else {
            // Handle exclusion projection
            Object.assign(result, doc);
            for (const [field, value] of Object.entries(projection)) {
                if (value === 0) {
                    delete result[field];
                }
            }
        }

        return result;
    }

    cloneDocument(doc) {
        return JSON.parse(JSON.stringify(doc));
    }

    // Test utilities
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

    getAllDocuments() {
        return Array.from(this.documents.values());
    }

    getDocumentById(id) {
        return this.documents.get(id.toString());
    }

    // Predefined test users for LibreChat scenarios
    seedTestUsers() {
        const users = [
            {
                _id: '685634596a44c25f827f04ac',
                name: 'Sizzek',
                email: 'sizzek@example.com',
                phoneNumber: '+13022716778',
                metadata: {
                    agentName: 'Sizzek',
                    phoneNumber: '+13022716778'
                }
            },
            {
                _id: 'test-user-sms-001',
                name: 'SMS User +13022716778',
                email: 'sms+13022716778@example.com',
                phoneNumber: '+13022716778',
                metadata: {
                    phoneNumber: '+13022716778'
                }
            },
            {
                _id: 'test-user-regular-001',
                name: 'Regular User',
                email: 'regular@example.com',
                phoneNumber: '+15551234567',
                metadata: {}
            }
        ];

        for (const user of users) {
            this.documents.set(user._id, {
                ...user,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        return users;
    }
}

// =============================================
// Mock Cursor
// =============================================

export class MockCursor {
    constructor(results) {
        this.results = results;
        this.position = 0;
    }

    async toArray() {
        return [...this.results];
    }

    limit(n) {
        return new MockCursor(this.results.slice(0, n));
    }

    skip(n) {
        return new MockCursor(this.results.slice(n));
    }

    sort(sortSpec) {
        const sortedResults = [...this.results];

        for (const [field, direction] of Object.entries(sortSpec)) {
            sortedResults.sort((a, b) => {
                const aVal = a[field];
                const bVal = b[field];

                if (aVal < bVal) return direction === 1 ? -1 : 1;
                if (aVal > bVal) return direction === 1 ? 1 : -1;
                return 0;
            });
        }

        return new MockCursor(sortedResults);
    }

    async forEach(callback) {
        for (const doc of this.results) {
            await callback(doc);
        }
    }

    async count() {
        return this.results.length;
    }
}

// =============================================
// Mock Factory Functions
// =============================================

export function createMockMongoClient(connectionString, options = {}) {
    return new MockMongoClient(connectionString, options);
}

export function createMockDatabase(name) {
    return new MockDatabase(name);
}

export function createMockCollection(name) {
    return new MockCollection(name);
}

// =============================================
// Test Scenario Helpers
// =============================================

export class MongoTestScenario {
    constructor() {
        this.client = null;
        this.db = null;
        this.usersCollection = null;
    }

    async setup(connectionString = 'mongodb://test', dbName = 'TestLibreChat') {
        this.client = createMockMongoClient(connectionString);
        await this.client.connect();
        this.db = this.client.db(dbName);
        this.usersCollection = this.db.collection('users');
        return this;
    }

    async teardown() {
        if (this.client) {
            await this.client.close();
        }
    }

    seedSizzekUser() {
        return this.usersCollection.addTestUser({
            _id: '685634596a44c25f827f04ac',
            name: 'Sizzek',
            email: 'sizzek@example.com',
            phoneNumber: '+13022716778',
            metadata: {
                agentName: 'Sizzek',
                phoneNumber: '+13022716778'
            }
        });
    }

    seedSMSUser() {
        return this.usersCollection.addTestUser({
            _id: 'test-user-sms-001',
            name: 'SMS User +13022716778',
            email: 'sms+13022716778@example.com',
            phoneNumber: '+13022716778',
            metadata: {
                phoneNumber: '+13022716778'
            }
        });
    }

    seedMultipleUsers() {
        return this.usersCollection.seedTestUsers();
    }

    async convertSMSUserToSizzek() {
        const result = await this.usersCollection.updateOne(
            { name: 'SMS User +13022716778' },
            { $set: { name: 'Sizzek' } }
        );
        return result;
    }

    getClient() {
        return this.client;
    }

    getDatabase() {
        return this.db;
    }

    getUsersCollection() {
        return this.usersCollection;
    }
}

// =============================================
// Export Everything
// =============================================

export default {
    MockObjectId,
    MockMongoClient,
    MockDatabase,
    MockCollection,
    MockCursor,
    createMockMongoClient,
    createMockDatabase,
    createMockCollection,
    MongoTestScenario
}; 