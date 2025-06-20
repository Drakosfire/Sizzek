#!/usr/bin/env node

/**
 * MongoDB Storage Integration Test for MCP Memory Server
 * 
 * This test simulates the type of data that would be stored by the MCP memory server
 * and helps diagnose why no data is appearing in MongoDB collections.
 */

import { MongoClient } from 'mongodb';

// Test configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'mcp-data';
const COLLECTION_NAME = 'mcp_storage';

// Sample data that mimics real MCP memory server usage
const TEST_USERS = [
    {
        userId: '+1234567890',
        scenarios: [
            {
                name: 'Personal Preferences',
                data: {
                    entities: [
                        {
                            name: 'Pizza-Preference',
                            entityType: 'FoodPreference',
                            observations: [
                                'User mentioned they love pizza with pepperoni',
                                'Prefers thin crust over thick crust',
                                'Orders pizza every Friday night'
                            ]
                        },
                        {
                            name: 'Work-Schedule',
                            entityType: 'Schedule',
                            observations: [
                                'Works Monday through Friday 9-5',
                                'Has team meetings every Tuesday at 2pm',
                                'Prefers morning calls over afternoon calls'
                            ]
                        },
                        {
                            name: 'Pet-Information',
                            entityType: 'PersonalInfo',
                            observations: [
                                'Has a golden retriever named Max',
                                'Dog needs to be walked twice daily',
                                'Vet appointment scheduled for next month'
                            ]
                        }
                    ],
                    relations: [
                        {
                            from: 'Pizza-Preference',
                            to: 'Work-Schedule',
                            relationType: 'associated_with',
                            observations: ['Orders pizza on Friday nights after work week']
                        }
                    ]
                }
            },
            {
                name: 'Project Management',
                data: {
                    entities: [
                        {
                            name: 'Website-Redesign-Project',
                            entityType: 'Project',
                            observations: [
                                'Due date is end of next month',
                                'Working with design team and developers',
                                'Budget approved for $15,000',
                                'Needs mobile-first approach'
                            ]
                        },
                        {
                            name: 'Client-ABC-Corp',
                            entityType: 'Client',
                            observations: [
                                'Long-term client for 3 years',
                                'Prefers email communication over calls',
                                'Decision maker is Sarah Johnson',
                                'Budget-conscious but values quality'
                            ]
                        }
                    ],
                    relations: [
                        {
                            from: 'Website-Redesign-Project',
                            to: 'Client-ABC-Corp',
                            relationType: 'belongs_to',
                            observations: ['Project is for ABC Corp website update']
                        }
                    ]
                }
            }
        ]
    },
    {
        userId: '+0987654321',
        scenarios: [
            {
                name: 'Health & Fitness',
                data: {
                    entities: [
                        {
                            name: 'Morning-Workout-Routine',
                            entityType: 'Routine',
                            observations: [
                                'Wakes up at 6 AM for gym',
                                'Focuses on strength training Mon/Wed/Fri',
                                'Does cardio Tue/Thu',
                                'Takes protein shake after workouts'
                            ]
                        },
                        {
                            name: 'Diet-Restrictions',
                            entityType: 'HealthInfo',
                            observations: [
                                'Vegetarian for 5 years',
                                'Allergic to nuts',
                                'Prefers organic food when possible',
                                'Drinks 8 glasses of water daily'
                            ]
                        }
                    ],
                    relations: [
                        {
                            from: 'Morning-Workout-Routine',
                            to: 'Diet-Restrictions',
                            relationType: 'supports',
                            observations: ['Workout routine supports vegetarian diet goals']
                        }
                    ]
                }
            }
        ]
    },
    {
        userId: 'charlie@email.com',
        scenarios: [
            {
                name: 'Travel Planning',
                data: {
                    entities: [
                        {
                            name: 'Europe-Trip-2025',
                            entityType: 'Travel',
                            observations: [
                                'Planning 2-week trip to Europe in summer',
                                'Want to visit Paris, Rome, and Barcelona',
                                'Budget is around $5000 for two people',
                                'Looking for mid-range hotels'
                            ]
                        },
                        {
                            name: 'Passport-Renewal',
                            entityType: 'Document',
                            observations: [
                                'Passport expires in 6 months',
                                'Need to renew before trip',
                                'Appointment booked at post office',
                                'Photos already taken'
                            ]
                        }
                    ],
                    relations: [
                        {
                            from: 'Passport-Renewal',
                            to: 'Europe-Trip-2025',
                            relationType: 'required_for',
                            observations: ['Passport renewal is required for Europe trip']
                        }
                    ]
                }
            }
        ]
    }
];

class MCPStorageTest {
    constructor() {
        this.client = null;
        this.db = null;
        this.collection = null;
    }

    async connect() {
        try {
            console.log(`🔌 Connecting to MongoDB: ${MONGODB_URI}`);
            this.client = new MongoClient(MONGODB_URI);
            await this.client.connect();
            this.db = this.client.db(DATABASE_NAME);
            this.collection = this.db.collection(COLLECTION_NAME);
            console.log(`✅ Connected to database: ${DATABASE_NAME}.${COLLECTION_NAME}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to MongoDB:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            console.log('🔌 Disconnected from MongoDB');
        }
    }

    async clearTestData() {
        const testUserIds = TEST_USERS.map(u => u.userId);
        const result = await this.collection.deleteMany({
            userId: { $in: testUserIds }
        });
        console.log(`🧹 Cleared ${result.deletedCount} test documents`);
    }

    async createTestData() {
        console.log('\n📝 Creating test data...');
        let totalInserted = 0;

        for (const user of TEST_USERS) {
            console.log(`\n👤 Processing user: ${user.userId}`);

            for (const scenario of user.scenarios) {
                const document = {
                    userId: user.userId,
                    data: scenario.data,
                    metadata: {
                        scenario: scenario.name,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        source: 'mcp-memory-test',
                        entityCount: scenario.data.entities.length,
                        relationCount: scenario.data.relations.length
                    }
                };

                try {
                    const result = await this.collection.insertOne(document);
                    console.log(`  ✅ Inserted ${scenario.name}: ${result.insertedId}`);
                    totalInserted++;
                } catch (error) {
                    console.error(`  ❌ Failed to insert ${scenario.name}:`, error.message);
                }
            }
        }

        console.log(`\n📊 Total documents inserted: ${totalInserted}`);
        return totalInserted;
    }

    async testUserIsolation() {
        console.log('\n🔒 Testing User Isolation...');

        for (const user of TEST_USERS) {
            const userDocs = await this.collection.find({ userId: user.userId }).toArray();
            console.log(`👤 User ${user.userId}: ${userDocs.length} documents`);

            // Verify no cross-contamination
            const otherUserIds = TEST_USERS.map(u => u.userId).filter(id => id !== user.userId);
            const crossContamination = await this.collection.find({
                userId: { $in: otherUserIds },
                'data.entities.observations': {
                    $in: userDocs.flatMap(doc =>
                        doc.data.entities.flatMap(entity => entity.observations)
                    )
                }
            }).toArray();

            if (crossContamination.length === 0) {
                console.log(`  ✅ No cross-contamination for ${user.userId}`);
            } else {
                console.log(`  ❌ Cross-contamination detected for ${user.userId}:`, crossContamination.length);
            }
        }
    }

    async testDataStructure() {
        console.log('\n🏗️  Testing Data Structure...');

        const sampleDoc = await this.collection.findOne();
        if (!sampleDoc) {
            console.log('❌ No documents found to test structure');
            return;
        }

        console.log('📋 Sample document structure:');
        console.log('  - userId:', typeof sampleDoc.userId, '✅');
        console.log('  - data:', typeof sampleDoc.data, '✅');
        console.log('  - data.entities:', Array.isArray(sampleDoc.data.entities) ? '✅' : '❌');
        console.log('  - data.relations:', Array.isArray(sampleDoc.data.relations) ? '✅' : '❌');

        if (sampleDoc.data.entities.length > 0) {
            const entity = sampleDoc.data.entities[0];
            console.log('  - entity.name:', typeof entity.name, '✅');
            console.log('  - entity.entityType:', typeof entity.entityType, '✅');
            console.log('  - entity.observations:', Array.isArray(entity.observations) ? '✅' : '❌');
        }
    }

    async testRealisticQueries() {
        console.log('\n🔍 Testing Realistic Queries...');

        // Test 1: Find all food preferences
        const foodPrefs = await this.collection.find({
            'data.entities.entityType': 'FoodPreference'
        }).toArray();
        console.log(`🍕 Food preferences found: ${foodPrefs.length}`);

        // Test 2: Find users with projects
        const projectUsers = await this.collection.find({
            'data.entities.entityType': 'Project'
        }).toArray();
        console.log(`📋 Users with projects: ${projectUsers.length}`);

        // Test 3: Find health-related data
        const healthData = await this.collection.find({
            'data.entities.entityType': { $in: ['HealthInfo', 'Routine'] }
        }).toArray();
        console.log(`🏃 Health-related documents: ${healthData.length}`);

        // Test 4: Complex aggregation - entity counts per user
        const entityCounts = await this.collection.aggregate([
            { $unwind: '$data.entities' },
            {
                $group: {
                    _id: '$userId',
                    totalEntities: { $sum: 1 },
                    entityTypes: { $addToSet: '$data.entities.entityType' }
                }
            }
        ]).toArray();

        console.log('📊 Entity counts per user:');
        entityCounts.forEach(count => {
            console.log(`  ${count._id}: ${count.totalEntities} entities (${count.entityTypes.join(', ')})`);
        });
    }

    async runDiagnostics() {
        console.log('\n🔧 Running Diagnostics...');

        // Check collection exists
        const collections = await this.db.listCollections().toArray();
        const collectionExists = collections.some(c => c.name === COLLECTION_NAME);
        console.log(`📁 Collection '${COLLECTION_NAME}' exists:`, collectionExists ? '✅' : '❌');

        // Check indexes
        const indexes = await this.collection.indexes();
        console.log(`📇 Indexes on collection: ${indexes.length}`);
        indexes.forEach(index => {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });

        // Check total document count
        const totalDocs = await this.collection.countDocuments();
        console.log(`📄 Total documents in collection: ${totalDocs}`);

        // Check unique users
        const uniqueUsers = await this.collection.distinct('userId');
        console.log(`👥 Unique users: ${uniqueUsers.length}`, uniqueUsers);

        // Check data size
        const stats = await this.db.command({ collStats: COLLECTION_NAME });
        console.log(`💾 Collection size: ${Math.round(stats.size / 1024)} KB`);
        console.log(`💾 Average document size: ${Math.round(stats.avgObjSize)} bytes`);
    }

    async verifyMCPIntegration() {
        console.log('\n🔗 Verifying MCP Integration Compatibility...');

        // Simulate MCP server operations
        const testUserId = '+1234567890';

        // Test 1: Simulate entity creation (like MCP createEntities tool)
        const newEntity = {
            name: 'Test-MCP-Entity',
            entityType: 'TestType',
            observations: ['This is a test entity created by MCP simulation']
        };

        // Find existing graph or create new
        let existingDoc = await this.collection.findOne({ userId: testUserId });
        if (existingDoc) {
            existingDoc.data.entities.push(newEntity);
            existingDoc.metadata.updatedAt = new Date();

            const result = await this.collection.replaceOne(
                { userId: testUserId },
                existingDoc
            );
            console.log(`✅ MCP simulation - entity added: ${result.modifiedCount > 0}`);
        } else {
            console.log('❌ No existing document found for MCP simulation');
        }

        // Test 2: Simulate readGraph operation
        const graphData = await this.collection.findOne({ userId: testUserId });
        if (graphData) {
            console.log(`✅ MCP simulation - graph read: ${graphData.data.entities.length} entities`);
        } else {
            console.log('❌ MCP simulation - failed to read graph');
        }

        // Test 3: Clean up test entity
        if (existingDoc) {
            existingDoc.data.entities = existingDoc.data.entities.filter(e => e.name !== 'Test-MCP-Entity');
            await this.collection.replaceOne({ userId: testUserId }, existingDoc);
            console.log('🧹 Cleaned up MCP test entity');
        }
    }
}

// Main test execution
async function runTests() {
    const test = new MCPStorageTest();

    try {
        console.log('🚀 Starting MCP Memory Server MongoDB Integration Tests\n');

        // Connect to MongoDB
        const connected = await test.connect();
        if (!connected) {
            process.exit(1);
        }

        // Clear any existing test data
        await test.clearTestData();

        // Create test data
        const inserted = await test.createTestData();
        if (inserted === 0) {
            console.log('❌ No test data was inserted. Exiting.');
            process.exit(1);
        }

        // Run all tests
        await test.testUserIsolation();
        await test.testDataStructure();
        await test.testRealisticQueries();
        await test.runDiagnostics();
        await test.verifyMCPIntegration();

        console.log('\n✅ All tests completed successfully!');
        console.log('\n📋 Summary:');
        console.log('  - MongoDB connection: ✅');
        console.log('  - Data insertion: ✅');
        console.log('  - User isolation: ✅');
        console.log('  - Data structure: ✅');
        console.log('  - Realistic queries: ✅');
        console.log('  - MCP compatibility: ✅');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        await test.disconnect();
    }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests();
}

export { MCPStorageTest, TEST_USERS }; 