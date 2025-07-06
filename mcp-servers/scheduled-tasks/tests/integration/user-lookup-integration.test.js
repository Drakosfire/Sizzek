import { TestRunner, assert, setupTestEnvironment, cleanupTestEnvironment } from '../helpers/test-utilities.js';
import { MongoTestScenario } from '../helpers/mongodb-mocks.js';

// Mock MongoDB before importing the services
import { MockMongoClient } from '../helpers/mongodb-mocks.js';
global.MongoClient = MockMongoClient;

// Import the services after mocking
import { UserLookupService } from '../../dist/src/http/user-lookup.js';
import { LibreChatClient } from '../../dist/src/http/librechat-client.js';
import { TaskManager } from '../../dist/src/core/task-manager.js';

const runner = new TestRunner('User Lookup Integration Tests');

// Test infrastructure
let mongoScenario;
let userLookupService;
let librechatClient;
let taskManager;

runner.beforeEach(async () => {
    // Clean environment
    await cleanupTestEnvironment();
    setupTestEnvironment();

    // Setup MongoDB scenario
    mongoScenario = new MongoTestScenario();
    await mongoScenario.setup();

    // Create services
    userLookupService = new UserLookupService({
        connectionString: 'mongodb://test',
        databaseName: 'TestLibreChat',
        timeout: 5000,
        maxRetries: 2,
        agentName: 'Sizzek'
    });

    // Mock the internal MongoDB client and database directly
    userLookupService.client = mongoScenario.getClient();
    userLookupService.db = mongoScenario.getDatabase();

    // Mock the initialize method to prevent real MongoDB connection
    userLookupService.initialize = async () => {
        // Already mocked above, just return success
        console.log('✅ Mock: UserLookupService initialized');
    };

    // Create LibreChat client with user lookup service
    librechatClient = new LibreChatClient({
        endpoint: 'http://localhost:3080',
        apiKey: 'test-api-key',
        conversationId: undefined,
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 100,
        userLookupService: userLookupService,
        agentName: 'Sizzek'
    });

    // Create task manager
    taskManager = new TaskManager(librechatClient, undefined, undefined, userLookupService);
});

runner.afterEach(async () => {
    if (taskManager) {
        await taskManager.cleanup();
    }
    if (librechatClient) {
        // Clean up client
    }
    if (mongoScenario) {
        await mongoScenario.teardown();
    }
    await cleanupTestEnvironment();
});

// =============================================
// User Lookup Service Integration Tests
// =============================================

runner.test('User lookup service integrates with task manager', async () => {
    // Seed test user
    const testUser = mongoScenario.seedSizzekUser();

    // Initialize task manager
    await taskManager.initialize();

    // Create a task
    const task = await taskManager.createTask({
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    });

    assert.notNull(task);
    assert.equal(task.name, 'Test Task');
    assert.hasProperty(task, 'id');
});

runner.test('LibreChat client uses user lookup service correctly', async () => {
    // Seed test user with phone number
    const testUser = mongoScenario.seedSizzekUser();

    // Ensure the test user has a phone number
    testUser.phoneNumber = '+1234567890';

    // Mock fetch to capture the API call
    let capturedRequest = null;
    global.fetch = async (url, options) => {
        capturedRequest = { url, options };
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Create a test task
    const task = {
        id: 'test-task-001',
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    };

    // Trigger the task
    await librechatClient.triggerTask(task);

    // Verify the request was made with correct URL (SMS conversation route)
    assert.notNull(capturedRequest);
    assert.equal(capturedRequest.url, 'http://localhost:3080/api/messages/sms-conversation');

    const payload = JSON.parse(capturedRequest.options.body);

    // Verify the payload structure for regular SMS message
    assert.equal(payload.role, 'external');
    assert.equal(payload.from, testUser.phoneNumber); // Uses agent's actual phone number
    assert.hasProperty(payload, 'content');
    assert.hasProperty(payload, 'metadata');

    // Verify phone number is included
    assert.equal(payload.metadata.phoneNumber, testUser.phoneNumber);

    // Verify agent metadata is included
    assert.equal(payload.metadata.endpoint, 'agents');
    assert.equal(payload.metadata.source, 'scheduled');
    assert.equal(payload.metadata.taskName, 'Test Task');

    // Verify conversation metadata is included for dynamic creation
    assert.hasProperty(payload.metadata, 'conversationMetadata');
    assert.equal(payload.metadata.conversationMetadata.source, 'scheduled');
    assert.equal(payload.metadata.conversationMetadata.endpoint, 'agents');

    // Verify no hardcoded conversationId (let External Client handle it via SMS pipeline)
    assert.equal(payload.conversationId, undefined);
});

runner.test('Task execution works with user lookup', async () => {
    // Seed test user
    const testUser = mongoScenario.seedSizzekUser();

    // Mock fetch
    let apiCallCount = 0;
    global.fetch = async (url, options) => {
        apiCallCount++;
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Initialize task manager
    await taskManager.initialize();

    // Create and execute a task
    const task = await taskManager.createTask({
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    });

    // Execute the task manually
    await taskManager.executeTask(task.id);

    // Verify API call was made
    assert.equal(apiCallCount, 1);

    // Verify task execution was recorded
    const executions = await taskManager.getTaskExecutions(task.id);
    assert.equal(executions.length, 1);
    assert.equal(executions[0].status, 'completed');
});

// =============================================
// Error Handling Integration Tests
// =============================================

runner.test('Handles user lookup failure gracefully', async () => {
    // Don't seed any users - lookup should fail

    // Mock fetch to ensure it's not called
    let apiCallCount = 0;
    global.fetch = async (url, options) => {
        apiCallCount++;
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Initialize task manager
    await taskManager.initialize();

    // Create a task
    const task = await taskManager.createTask({
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    });

    // Try to execute the task - should fail gracefully
    try {
        await taskManager.executeTask(task.id);
    } catch (error) {
        assert.true(error.message.includes('Unable to determine user ID'));
    }

    // Verify no API call was made
    assert.equal(apiCallCount, 0);
});

runner.test('Falls back to conversation ID when user lookup fails', async () => {
    // Don't seed any users - lookup should fail

    // Create LibreChat client with fallback conversation ID
    const fallbackClient = new LibreChatClient({
        endpoint: 'http://localhost:3080',
        apiKey: 'test-api-key',
        conversationId: 'fallback-conversation-id',
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 100,
        userLookupService: userLookupService,
        agentName: 'Sizzek'
    });

    // Mock fetch to capture the API call
    let capturedRequest = null;
    global.fetch = async (url, options) => {
        capturedRequest = { url, options };
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Create a test task
    const task = {
        id: 'test-task-001',
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    };

    // Trigger the task
    await fallbackClient.triggerTask(task);

    // Verify the request was made with fallback conversation ID
    assert.notNull(capturedRequest);
    assert.equal(capturedRequest.url, 'http://localhost:3080/api/messages/fallback-conversation-id');

    const payload = JSON.parse(capturedRequest.options.body);
    assert.equal(payload.conversationId, 'fallback-conversation-id');
});

// =============================================
// User Transition Scenarios
// =============================================

runner.test('SMS user transition to Sizzek scenario', async () => {
    // Start with SMS user
    const smsUser = mongoScenario.seedSMSUser();

    // Mock fetch to capture API calls
    let apiCalls = [];
    global.fetch = async (url, options) => {
        apiCalls.push({ url, options });
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Initialize task manager
    await taskManager.initialize();

    // Create a task
    const task = await taskManager.createTask({
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    });

    // First execution - should fail because user lookup can't find 'Sizzek'
    try {
        await taskManager.executeTask(task.id);
        assert.true(false, 'Should have thrown error');
    } catch (error) {
        assert.true(error.message.includes('Unable to determine user ID'));
    }

    // Convert SMS user to Sizzek
    await mongoScenario.convertSMSUserToSizzek();

    // Clear the cached user ID in LibreChat client
    await librechatClient.refreshUserId();

    // Second execution - should succeed
    await taskManager.executeTask(task.id);

    // Verify API call was made with correct user ID
    assert.equal(apiCalls.length, 1);
    const payload = JSON.parse(apiCalls[0].options.body);
    assert.equal(payload.userId, smsUser._id);
});

runner.test('Multiple users with same agent name - priority order', async () => {
    // Create multiple users that could match 'Sizzek'
    const usersCollection = mongoScenario.getUsersCollection();

    // User 1: Has agent name in metadata (highest priority)
    const metadataUser = usersCollection.addTestUser({
        _id: 'metadata-user',
        name: 'Metadata User',
        email: 'metadata@example.com',
        phoneNumber: '+15551111111',
        metadata: {
            agentName: 'Sizzek'
        }
    });

    // User 2: Has name 'Sizzek' (lower priority)
    const nameUser = usersCollection.addTestUser({
        _id: 'name-user',
        name: 'Sizzek',
        email: 'name@example.com',
        phoneNumber: '+15552222222'
    });

    // User 3: Has sizzek in email (lowest priority)
    const emailUser = usersCollection.addTestUser({
        _id: 'email-user',
        name: 'Email User',
        email: 'sizzek@example.com',
        phoneNumber: '+15553333333'
    });

    // Mock fetch to capture API calls
    let capturedRequest = null;
    global.fetch = async (url, options) => {
        capturedRequest = { url, options };
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Create a test task
    const task = {
        id: 'test-task-001',
        name: 'Test Task',
        description: 'Integration test task',
        message: 'This is a test message',
        schedule: {
            type: 'interval',
            interval: '1 minute'
        }
    };

    // Trigger the task
    await librechatClient.triggerTask(task);

    // Verify the request was made with the highest priority user (metadata user)
    assert.notNull(capturedRequest);
    const payload = JSON.parse(capturedRequest.options.body);
    assert.equal(payload.userId, metadataUser._id);
});

// =============================================
// Concurrent Operations Tests
// =============================================

runner.test('Concurrent user lookups work correctly', async () => {
    // Seed test user
    const testUser = mongoScenario.seedSizzekUser();

    // Create multiple LibreChat clients
    const clients = [];
    for (let i = 0; i < 3; i++) {
        clients.push(new LibreChatClient({
            endpoint: 'http://localhost:3080',
            apiKey: 'test-api-key',
            conversationId: undefined,
            timeout: 5000,
            retryAttempts: 2,
            retryDelay: 100,
            userLookupService: userLookupService,
            agentName: 'Sizzek'
        }));
    }

    // Mock fetch to capture API calls
    let apiCalls = [];
    global.fetch = async (url, options) => {
        apiCalls.push({ url, options });
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Create test tasks
    const tasks = [];
    for (let i = 0; i < 3; i++) {
        tasks.push({
            id: `test-task-${i}`,
            name: `Test Task ${i}`,
            description: `Integration test task ${i}`,
            message: `This is test message ${i}`,
            schedule: {
                type: 'interval',
                interval: '1 minute'
            }
        });
    }

    // Trigger all tasks concurrently
    await Promise.all(
        clients.map((client, index) => client.triggerTask(tasks[index]))
    );

    // Verify all API calls were made with correct user ID
    assert.equal(apiCalls.length, 3);
    for (const call of apiCalls) {
        const payload = JSON.parse(call.options.body);
        assert.equal(payload.userId, testUser._id);
    }
});

runner.test('Task manager handles concurrent task executions', async () => {
    // Seed test user
    const testUser = mongoScenario.seedSizzekUser();

    // Mock fetch
    let apiCallCount = 0;
    global.fetch = async (url, options) => {
        apiCallCount++;
        // Simulate some delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
            ok: true,
            status: 200,
            text: async () => 'Success'
        };
    };

    // Initialize task manager
    await taskManager.initialize();

    // Create multiple tasks
    const tasks = [];
    for (let i = 0; i < 3; i++) {
        const task = await taskManager.createTask({
            name: `Test Task ${i}`,
            description: `Integration test task ${i}`,
            message: `This is test message ${i}`,
            schedule: {
                type: 'interval',
                interval: '1 minute'
            }
        });
        tasks.push(task);
    }

    // Execute all tasks concurrently
    await Promise.all(
        tasks.map(task => taskManager.executeTask(task.id))
    );

    // Verify all API calls were made
    assert.equal(apiCallCount, 3);

    // Verify all task executions were recorded
    for (const task of tasks) {
        const executions = await taskManager.getTaskExecutions(task.id);
        assert.equal(executions.length, 1);
        assert.equal(executions[0].status, 'completed');
    }
});

// =============================================
// Connection Resilience Tests
// =============================================

runner.test('Handles MongoDB connection failures gracefully', async () => {
    // Create a service that will fail to connect
    const failingService = new UserLookupService({
        connectionString: 'mongodb://invalid-host:27017',
        databaseName: 'TestLibreChat',
        timeout: 1000,
        maxRetries: 1,
        agentName: 'Sizzek'
    });

    // Mock the client to fail
    const mockClient = mongoScenario.getClient();
    mockClient.setConnectionFailure(true);
    failingService.client = mockClient;

    // Try to use the service
    try {
        await failingService.initialize();
        assert.true(false, 'Should have thrown error');
    } catch (error) {
        assert.true(error.message.includes('Mock connection failure'));
    }

    // Verify the service can be cleaned up
    await failingService.disconnect();
});

runner.test('Handles MongoDB query failures gracefully', async () => {
    // Seed test user
    const testUser = mongoScenario.seedSizzekUser();

    // Configure the collection to fail queries
    const usersCollection = mongoScenario.getUsersCollection();
    usersCollection.setQueryFailure(true);

    // Try to lookup user
    try {
        const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');
        assert.true(false, 'Should have thrown error');
    } catch (error) {
        assert.true(error.message.includes('Mock query failure'));
    }

    // Reset the collection
    usersCollection.setQueryFailure(false);

    // Should work now
    const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');
    assert.equal(userId, testUser._id);
});

// =============================================
// Run Integration Tests (Modified to NOT call process.exit)
// =============================================

async function runIntegrationTests() {
    try {
        setupTestEnvironment();

        console.log('🧪 Starting User Lookup Integration Tests...');
        console.log('='.repeat(60));

        const success = await runner.run();

        await cleanupTestEnvironment();

        if (success) {
            console.log('\n✅ All integration tests passed!');
            return true;
        } else {
            console.log('\n❌ Some integration tests failed!');
            return false;
        }
    } catch (error) {
        console.error('❌ Integration test execution failed:', error);
        await cleanupTestEnvironment();
        return false;
    }
}

// Run if called directly (only then use process.exit)
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    runIntegrationTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { runner as integrationTestRunner, runIntegrationTests }; 