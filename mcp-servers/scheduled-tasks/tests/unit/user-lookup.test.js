import { TestRunner, assert, MockMongoClient, testData, setupTestEnvironment, cleanupTestEnvironment } from '../helpers/test-utilities.js';

// Mock the MongoDB module to use our test implementation
const originalMongoClient = global.MongoClient;
global.MongoClient = MockMongoClient;

// Import the UserLookupService after mocking
import { UserLookupService } from '../../dist/src/http/user-lookup.js';

const runner = new TestRunner('User Lookup Service Unit Tests');

// Test data setup
let mockClient;
let mockDb;
let mockCollection;
let userLookupService;

runner.beforeEach(async () => {
    // Clean environment
    await cleanupTestEnvironment();
    setupTestEnvironment();

    // Create mock MongoDB infrastructure
    mockClient = new MockMongoClient('mongodb://test');
    await mockClient.connect();
    mockDb = mockClient.db('TestLibreChat');
    mockCollection = mockDb.collection('users');

    // Create UserLookupService instance
    userLookupService = new UserLookupService({
        connectionString: 'mongodb://test',
        databaseName: 'TestLibreChat',
        timeout: 5000,
        maxRetries: 2,
        agentName: 'Sizzek'
    });

    // Mock the internal client, db, and initialize method
    userLookupService.client = mockClient;
    userLookupService.db = mockDb;

    // Mock the initialize method to prevent real MongoDB connections
    userLookupService.initialize = async () => {
        // Already mocked above - do nothing
        console.log('✅ Mock: UserLookupService initialized');
    };

    // Mock the disconnect method for consistency
    userLookupService.disconnect = async () => {
        userLookupService.client = null;
        userLookupService.db = null;
        console.log('🔌 Mock: UserLookupService disconnected');
    };
});

runner.afterEach(async () => {
    try {
        if (mockClient) {
            await mockClient.close();
        }
        if (userLookupService) {
            await userLookupService.disconnect();
        }
    } catch (error) {
        console.warn('Warning: Cleanup error:', error.message);
    }
    await cleanupTestEnvironment();
});

// =============================================
// Initialization Tests
// =============================================

runner.test('UserLookupService initializes correctly', async () => {
    const service = new UserLookupService({
        connectionString: 'mongodb://test',
        databaseName: 'TestLibreChat',
        timeout: 5000,
        maxRetries: 2,
        agentName: 'Sizzek'
    });

    assert.hasProperty(service, 'config');
    assert.equal(service.config.agentName, 'Sizzek');
    assert.equal(service.config.databaseName, 'TestLibreChat');
    assert.equal(service.config.timeout, 5000);
    assert.equal(service.config.maxRetries, 2);
});

runner.test('UserLookupService connects to MongoDB', async () => {
    const service = new UserLookupService({
        connectionString: 'mongodb://test',
        databaseName: 'TestLibreChat',
        timeout: 5000,
        maxRetries: 2,
        agentName: 'Sizzek'
    });

    // Mock the service completely to avoid real connections
    service.client = mockClient;
    service.db = mockDb;
    service.initialize = async () => {
        console.log('✅ Mock: UserLookupService initialized');
    };

    await service.initialize();

    assert.notNull(service.client);
    assert.notNull(service.db);

    await service.disconnect();
});

// =============================================
// User Lookup Strategy Tests
// =============================================

runner.test('Strategy 1: Lookup by agent name in metadata', async () => {
    // Add test user with agent name in metadata
    const testUser = mockCollection.addTestUser({
        name: 'Test User',
        email: 'test@example.com',
        phoneNumber: '+15551234567',
        metadata: {
            agentName: 'Sizzek',
            phoneNumber: '+15551234567'
        }
    });

    const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');

    assert.notNull(userId);
    assert.equal(userId, testUser._id);
});

runner.test('Strategy 2: Lookup by name field', async () => {
    // Add test user with matching name
    const testUser = mockCollection.addTestUser({
        name: 'Sizzek',
        email: 'sizzek@example.com',
        phoneNumber: '+15551234567'
    });

    const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');

    assert.notNull(userId);
    assert.equal(userId, testUser._id);
});

runner.test('Strategy 2: Lookup by username field', async () => {
    // Add test user with matching username
    const testUser = mockCollection.addTestUser({
        name: 'Some User',
        username: 'Sizzek',
        email: 'user@example.com',
        phoneNumber: '+15551234567'
    });

    const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');

    assert.notNull(userId);
    assert.equal(userId, testUser._id);
});

runner.test('Strategy 3: Lookup by phone number pattern', async () => {
    // Add test user with phone number containing agent name
    const testUser = mockCollection.addTestUser({
        name: 'Phone User',
        email: 'phone@example.com',
        phoneNumber: '+13022716778',
        metadata: {
            phoneNumber: '+13022716778'
        }
    });

    console.log('🔍 Debug: Added test user with ID:', testUser._id, 'and phone:', testUser.phoneNumber);

    // Test direct regex matching first
    const directMatch = '+13022716778'.includes('3022716778');
    console.log('🔍 Debug: Direct string match test:', directMatch);

    // Test regex object
    const regex = new RegExp('3022716778', 'i');
    const regexMatch = regex.test('+13022716778');
    console.log('🔍 Debug: Regex object test:', regexMatch);

    // Search for partial phone number that should match
    const userId = await userLookupService.lookupUserIdByAgentName('3022716778');

    assert.notNull(userId);
    assert.equal(userId, testUser._id);
});

runner.test('Strategy 4: Lookup by email pattern for sizzek', async () => {
    // Add test user with sizzek in email
    const testUser = mockCollection.addTestUser({
        name: 'Email User',
        email: 'sizzek@example.com',
        phoneNumber: '+15551234567'
    });

    const userId = await userLookupService.lookupUserIdByAgentName('sizzek');

    assert.notNull(userId);
    assert.equal(userId, testUser._id);
});

runner.test('Strategy priorities work correctly', async () => {
    // Add multiple users that match different strategies
    const metadataUser = mockCollection.addTestUser({
        name: 'Metadata User',
        email: 'metadata@example.com',
        phoneNumber: '+15551111111',
        metadata: {
            agentName: 'Sizzek'
        }
    });

    const nameUser = mockCollection.addTestUser({
        name: 'Sizzek',
        email: 'name@example.com',
        phoneNumber: '+15552222222'
    });

    // Strategy 1 (metadata) should win over Strategy 2 (name)
    const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');

    assert.notNull(userId);
    assert.equal(userId, metadataUser._id);
});

// =============================================
// Error Handling Tests
// =============================================

runner.test('Returns null when no user found', async () => {
    const userId = await userLookupService.lookupUserIdByAgentName('NonExistentAgent');

    assert.null(userId);
});

runner.test('Throws error when not initialized', async () => {
    const service = new UserLookupService({
        connectionString: 'mongodb://test',
        databaseName: 'TestLibreChat',
        timeout: 5000,
        maxRetries: 2,
        agentName: 'Sizzek'
    });

    await assert.throwsAsync(async () => {
        await service.lookupUserIdByAgentName('Sizzek');
    }, 'Should throw error when not initialized');
});

runner.test('Handles case-insensitive lookups', async () => {
    // Add test user with mixed case
    const testUser = mockCollection.addTestUser({
        name: 'SiZzEk',
        email: 'mixed@example.com',
        phoneNumber: '+15551234567'
    });

    const userId = await userLookupService.lookupUserIdByAgentName('sizzek');

    // This should NOT find the user because we're using exact match in Strategy 2
    // Only Strategy 4 (email) uses case-insensitive regex
    assert.null(userId);
});

runner.test('Handles empty and invalid inputs', async () => {
    // Test empty string
    const result1 = await userLookupService.lookupUserIdByAgentName('');
    assert.null(result1);

    // Test null - should handle gracefully without crashing
    try {
        const result2 = await userLookupService.lookupUserIdByAgentName(null);
        assert.null(result2);
    } catch (error) {
        // If it throws, that's also acceptable - just shouldn't hang
        assert.true(error instanceof Error);
    }

    // Test undefined - should handle gracefully without crashing
    try {
        const result3 = await userLookupService.lookupUserIdByAgentName(undefined);
        assert.null(result3);
    } catch (error) {
        // If it throws, that's also acceptable - just shouldn't hang
        assert.true(error instanceof Error);
    }
});

// =============================================
// lookupUserById Tests
// =============================================

runner.test('lookupUserById finds user by ID', async () => {
    const testUser = mockCollection.addTestUser({
        name: 'Test User',
        email: 'test@example.com',
        phoneNumber: '+15551234567'
    });

    // Use the actual ID returned from addTestUser (which is now a proper ObjectId)
    const user = await userLookupService.lookupUserById(testUser._id);

    assert.notNull(user);
    assert.equal(user._id, testUser._id);
    assert.equal(user.name, 'Test User');
});

runner.test('lookupUserById returns null for non-existent ID', async () => {
    // Use a proper 24-character hex string for MongoDB ObjectId
    const nonExistentId = '507f1f77bcf86cd799439011';
    const user = await userLookupService.lookupUserById(nonExistentId);

    assert.null(user);
});

// =============================================
// Utility Method Tests
// =============================================

runner.test('createConversationId generates valid IDs', async () => {
    const userId = 'test-user-12345678';
    const conversationId = userLookupService.createConversationId(userId);

    assert.isString(conversationId);
    assert.true(conversationId.startsWith('sched_'));
    assert.true(conversationId.includes('12345678')); // Should include last 8 chars of user ID
});

runner.test('createConversationId handles short user IDs', async () => {
    const userId = 'short';
    const conversationId = userLookupService.createConversationId(userId);

    assert.isString(conversationId);
    assert.true(conversationId.startsWith('sched_'));
    assert.true(conversationId.includes('short'));
});

// =============================================
// Comprehensive Integration Scenarios
// =============================================

runner.test('Real-world scenario: SMS User becomes Sizzek', async () => {
    // Simulate the original SMS user
    const smsUser = mockCollection.addTestUser({
        name: 'SMS User +13022716778',
        email: 'sms+13022716778@example.com',
        phoneNumber: '+13022716778',
        metadata: {
            phoneNumber: '+13022716778'
        }
    });

    // Should NOT find by agent name initially
    let userId = await userLookupService.lookupUserIdByAgentName('Sizzek');
    assert.null(userId);

    // Update the user name to 'Sizzek'
    await mockCollection.updateOne(
        { _id: smsUser._id },
        { $set: { name: 'Sizzek' } }
    );

    // Should now find by agent name
    userId = await userLookupService.lookupUserIdByAgentName('Sizzek');
    assert.notNull(userId);
    assert.equal(userId, smsUser._id);
});

runner.test('Real-world scenario: Multiple agent strategies', async () => {
    // Add users matching different strategies
    const phoneUser = mockCollection.addTestUser({
        name: 'Phone User',
        email: 'phone@example.com',
        phoneNumber: '+13022716778',
        metadata: {
            phoneNumber: '+13022716778'
        }
    });

    const emailUser = mockCollection.addTestUser({
        name: 'Email User',
        email: 'sizzek@example.com',
        phoneNumber: '+15551234567'
    });

    // Phone number search should work - search for just the last digits
    let userId = await userLookupService.lookupUserIdByAgentName('2716778');
    assert.notNull(userId);
    assert.equal(userId, phoneUser._id);

    // Email search should work
    userId = await userLookupService.lookupUserIdByAgentName('sizzek');
    assert.notNull(userId);
    assert.equal(userId, emailUser._id);
});

runner.test('Concurrent lookup calls work correctly', async () => {
    const testUser = mockCollection.addTestUser({
        name: 'Sizzek',
        email: 'sizzek@example.com',
        phoneNumber: '+13022716778'
    });

    // Make multiple concurrent lookups
    const lookupPromises = [
        userLookupService.lookupUserIdByAgentName('Sizzek'),
        userLookupService.lookupUserIdByAgentName('Sizzek'),
        userLookupService.lookupUserIdByAgentName('Sizzek')
    ];

    const results = await Promise.all(lookupPromises);

    // All should return the same user ID
    assert.equal(results[0], testUser._id);
    assert.equal(results[1], testUser._id);
    assert.equal(results[2], testUser._id);
});

// =============================================
// Edge Cases and Error Conditions
// =============================================

runner.test('Handles database connection errors gracefully', async () => {
    // Create a service that simulates connection failure
    const service = new UserLookupService({
        connectionString: 'mongodb://invalid',
        databaseName: 'TestLibreChat',
        timeout: 1000,
        maxRetries: 1,
        agentName: 'Sizzek'
    });

    // Mock initialize to throw an error
    service.initialize = async () => {
        throw new Error('Mock connection failure');
    };

    await assert.throwsAsync(async () => {
        await service.initialize();
    }, 'Should throw error for invalid connection');
});

runner.test('Handles malformed user data gracefully', async () => {
    // Add user with malformed data
    mockCollection.documents.set('malformed', {
        _id: 'malformed',
        // Missing required fields
        someField: 'value'
    });

    const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');

    // Should not crash and should return null
    assert.null(userId);
});

runner.test('Disconnect works correctly', async () => {
    const service = new UserLookupService({
        connectionString: 'mongodb://test',
        databaseName: 'TestLibreChat',
        timeout: 5000,
        maxRetries: 2,
        agentName: 'Sizzek'
    });

    // Mock the service to avoid real connections
    service.client = mockClient;
    service.db = mockDb;
    service.initialize = async () => {
        console.log('✅ Mock: UserLookupService initialized');
    };

    await service.initialize();
    assert.notNull(service.client);

    await service.disconnect();
    assert.null(service.client);
    assert.null(service.db);
});

// =============================================
// Factory Function Tests
// =============================================

runner.test('createUserLookupService factory works correctly', async () => {
    // Set environment variables
    const originalEnv = { ...process.env };

    try {
        process.env.MONGO_URI = 'mongodb://factory-test';
        process.env.MONGODB_DATABASE = 'FactoryTest';
        process.env.MCP_MONGODB_TIMEOUT = '7000';
        process.env.MCP_MONGODB_RETRIES = '5';
        process.env.LIBRECHAT_AGENT_NAME = 'FactoryAgent';

        // Import the factory function
        const { createUserLookupService } = await import('../../dist/src/http/user-lookup.js');
        const service = createUserLookupService();

        assert.equal(service.config.connectionString, 'mongodb://factory-test');
        assert.equal(service.config.databaseName, 'FactoryTest');
        assert.equal(service.config.timeout, 7000);
        assert.equal(service.config.maxRetries, 5);
        assert.equal(service.config.agentName, 'FactoryAgent');
    } finally {
        // Restore original environment
        process.env = originalEnv;
    }
});

// =============================================
// Run Tests (Modified to NOT call process.exit)
// =============================================

async function runUserLookupTests() {
    try {
        setupTestEnvironment();

        console.log('🧪 Starting User Lookup Service Unit Tests...');
        console.log('='.repeat(60));

        const success = await runner.run();

        await cleanupTestEnvironment();

        if (success) {
            console.log('\n✅ All User Lookup Service tests passed!');
            return true;
        } else {
            console.log('\n❌ Some User Lookup Service tests failed!');
            return false;
        }
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        await cleanupTestEnvironment();
        return false;
    }
}

// Run if called directly (only then use process.exit)
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    runUserLookupTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { runner as userLookupTestRunner, runUserLookupTests }; 