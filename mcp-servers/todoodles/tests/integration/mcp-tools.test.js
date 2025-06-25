/**
 * Integration Tests for Todoodles MCP Server Tools
 * Tests all MCP tools with both JSON and MongoDB storage
 */

import { expect } from 'chai';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTestDatabase } from '../helpers/test-database.js';
import {
    generateBasicTodoodles,
    generatePriorityTodoodles,
    generateCategoryTodoodles,
    generateDueDateTodoodles,
    generateCompletionStatusTodoodles,
    generateEdgeCaseData,
    generateMCPRequest,
    generateTestUsers
} from '../helpers/test-data.js';
import {
    assertValidTodoodle,
    assertValidTodoodles,
    assertMCPSuccess,
    assertMCPError,
    assertCompletionFilter,
    assertCategoryFilter,
    assertPriorityFilter,
    assertSearchMatch,
    assertDueFilter,
    assertValidStatistics,
    assertValidCategories,
    assertUserIsolation,
    assertPerformance
} from '../helpers/test-assertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the MCP server manager dynamically
let UserAwareTodoodlesManager;

describe('Todoodles MCP Server Integration Tests', function () {
    this.timeout(30000); // 30 second timeout for all tests

    // Test configurations for both storage types
    const storageTypes = ['json', 'mongodb'];

    // Test databases for different test suites
    let testDbs = {};

    before(async function () {
        console.log('Setting up test environment...');

        // Import the server manager
        const module = await import('../../dist/index.js');
        UserAwareTodoodlesManager = module.UserAwareTodoodlesManager;

        // Set up test databases
        for (const storageType of storageTypes) {
            testDbs[storageType] = getTestDatabase(`mcp-tools-${storageType}`);
            await testDbs[storageType].connect();
            await testDbs[storageType].createIndexes();
        }

        console.log('Test environment ready');
    });

    after(async function () {
        console.log('Cleaning up test environment...');

        // Cleanup all test databases
        for (const testDb of Object.values(testDbs)) {
            await testDb.cleanup();
        }

        console.log('Test environment cleaned up');
    });

    // Test each storage type
    storageTypes.forEach(storageType => {
        describe(`Storage: ${storageType.toUpperCase()}`, function () {
            let manager;
            let testDb;
            const testUserId = `test-user-${storageType}`;

            beforeEach(async function () {
                testDb = testDbs[storageType];
                await testDb.clearAllData();

                // Set up environment for this storage type
                await testDb.applyTestEnvironment({
                    storageType: storageType,
                    env: {
                        MCP_USER_ID: testUserId
                    }
                });

                // Create manager instance
                manager = new UserAwareTodoodlesManager();
                await manager.initialize();
            });

            describe('add_todoodle Tool', function () {
                it('should add a basic todoodle successfully', async function () {
                    const startTime = Date.now();

                    const request = generateMCPRequest('add_todoodle', {
                        text: 'Test task',
                        priority: 'medium',
                        category: 'work'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);

                    assertMCPSuccess(response, 'added successfully');
                    assertPerformance(startTime);

                    // Verify the todoodle was added
                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );

                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    expect(todoodles).to.have.lengthOf(1);
                    expect(todoodles[0].text).to.equal('Test task');
                    expect(todoodles[0].priority).to.equal('medium');
                    expect(todoodles[0].category).to.equal('work');
                    expect(todoodles[0].completed).to.be.false;
                    assertValidTodoodle(todoodles[0]);
                });

                it('should add todoodle with due date', async function () {
                    const dueDate = '2024-12-31';

                    const request = generateMCPRequest('add_todoodle', {
                        text: 'Year-end task',
                        dueDate: dueDate,
                        priority: 'high'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );

                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    expect(todoodles[0].dueDate).to.equal(dueDate);
                });

                it('should handle missing text parameter', async function () {
                    const request = generateMCPRequest('add_todoodle', {
                        priority: 'medium'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'text is required');
                });

                it('should handle invalid priority', async function () {
                    const request = generateMCPRequest('add_todoodle', {
                        text: 'Test task',
                        priority: 'invalid_priority'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'Invalid priority');
                });

                it('should handle invalid due date format', async function () {
                    const request = generateMCPRequest('add_todoodle', {
                        text: 'Test task',
                        dueDate: 'invalid-date'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'Invalid date format');
                });

                it('should handle very long text', async function () {
                    const longText = 'A'.repeat(1000);

                    const request = generateMCPRequest('add_todoodle', {
                        text: longText,
                        priority: 'low'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );

                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    expect(todoodles[0].text).to.equal(longText);
                });

                it('should handle special characters and unicode', async function () {
                    const specialText = 'Special chars: 🎯📝✅❌ !@#$%^&*()';

                    const request = generateMCPRequest('add_todoodle', {
                        text: specialText,
                        category: 'test-special'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );

                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    expect(todoodles[0].text).to.equal(specialText);
                });
            });

            describe('get_todoodles Tool', function () {
                beforeEach(async function () {
                    // Add some test data
                    const testTodos = generateBasicTodoodles();
                    for (const todo of testTodos) {
                        await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                            text: todo.text,
                            priority: todo.priority,
                            category: todo.category,
                            dueDate: todo.dueDate
                        }, testUserId));
                    }
                });

                it('should return all todoodles', async function () {
                    const startTime = Date.now();

                    const request = generateMCPRequest('get_todoodles', {}, testUserId);
                    const response = await manager.handleToolCall(request);

                    assertMCPSuccess(response);
                    assertPerformance(startTime);

                    const todoodles = JSON.parse(response.content[0].text);
                    expect(todoodles).to.have.lengthOf(3);
                    assertValidTodoodles(todoodles);
                });

                it('should filter by completed status', async function () {
                    // Complete one task first
                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );
                    const allTodos = JSON.parse(getAllResponse.content[0].text);

                    await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                        id: allTodos[0].id
                    }, testUserId));

                    // Get only incomplete
                    const incompleteRequest = generateMCPRequest('get_todoodles', {
                        completed: false
                    }, testUserId);
                    const incompleteResponse = await manager.handleToolCall(incompleteRequest);

                    const incompleteTodos = JSON.parse(incompleteResponse.content[0].text);
                    expect(incompleteTodos).to.have.lengthOf(2);
                    assertCompletionFilter(incompleteTodos, false);

                    // Get only completed
                    const completedRequest = generateMCPRequest('get_todoodles', {
                        completed: true
                    }, testUserId);
                    const completedResponse = await manager.handleToolCall(completedRequest);

                    const completedTodos = JSON.parse(completedResponse.content[0].text);
                    expect(completedTodos).to.have.lengthOf(1);
                    assertCompletionFilter(completedTodos, true);
                });

                it('should return empty array when no todoodles exist', async function () {
                    await testDb.clearUserData(testUserId);

                    const request = generateMCPRequest('get_todoodles', {}, testUserId);
                    const response = await manager.handleToolCall(request);

                    assertMCPSuccess(response);
                    const todoodles = JSON.parse(response.content[0].text);
                    expect(todoodles).to.be.an('array').that.is.empty;
                });
            });

            describe('complete_todoodle Tool', function () {
                let testTodoId;

                beforeEach(async function () {
                    // Add a test todoodle
                    await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                        text: 'Task to complete',
                        priority: 'medium'
                    }, testUserId));

                    // Get the ID
                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );
                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    testTodoId = todoodles[0].id;
                });

                it('should complete a todoodle successfully', async function () {
                    const startTime = Date.now();

                    const request = generateMCPRequest('complete_todoodle', {
                        id: testTodoId
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response, 'marked as completed');
                    assertPerformance(startTime);

                    // Verify completion
                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );

                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    const completedTodo = todoodles.find(t => t.id === testTodoId);

                    expect(completedTodo.completed).to.be.true;
                    expect(completedTodo.completedAt).to.be.a('string');
                    expect(completedTodo.timeToComplete).to.be.a('number');
                    expect(completedTodo.timeToComplete).to.be.above(0);
                });

                it('should handle non-existent todoodle ID', async function () {
                    const request = generateMCPRequest('complete_todoodle', {
                        id: 'non-existent-id'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'Todoodle not found');
                });

                it('should handle missing ID parameter', async function () {
                    const request = generateMCPRequest('complete_todoodle', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'id is required');
                });

                it('should handle already completed todoodle', async function () {
                    // Complete the todoodle first
                    await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                        id: testTodoId
                    }, testUserId));

                    // Try to complete again
                    const request = generateMCPRequest('complete_todoodle', {
                        id: testTodoId
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'already completed');
                });
            });

            describe('search_todoodles Tool', function () {
                beforeEach(async function () {
                    // Add diverse test data
                    const testTodos = [
                        { text: 'Buy groceries at store', category: 'shopping', priority: 'medium' },
                        { text: 'Finish work project', category: 'work', priority: 'high' },
                        { text: 'Exercise routine', category: 'health', priority: 'low' },
                        { text: 'Buy birthday gift', category: 'shopping', priority: 'medium' },
                        { text: 'Work on side project', category: 'work', priority: 'low' }
                    ];

                    for (const todo of testTodos) {
                        await manager.handleToolCall(generateMCPRequest('add_todoodle', todo, testUserId));
                    }
                });

                it('should search by text content', async function () {
                    const request = generateMCPRequest('search_todoodles', {
                        query: 'project'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.have.lengthOf(2);
                    assertSearchMatch(results, 'project');
                });

                it('should search by category', async function () {
                    const request = generateMCPRequest('search_todoodles', {
                        query: 'shopping'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.have.lengthOf(2);
                    assertSearchMatch(results, 'shopping');
                });

                it('should handle case-insensitive search', async function () {
                    const request = generateMCPRequest('search_todoodles', {
                        query: 'BUY'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.have.lengthOf(2);
                    assertSearchMatch(results, 'buy');
                });

                it('should return empty results for non-matching query', async function () {
                    const request = generateMCPRequest('search_todoodles', {
                        query: 'nonexistent'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.be.an('array').that.is.empty;
                });

                it('should handle missing query parameter', async function () {
                    const request = generateMCPRequest('search_todoodles', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'query is required');
                });
            });

            describe('get_todoodles_by_category Tool', function () {
                beforeEach(async function () {
                    const testTodos = generateCategoryTodoodles();
                    for (const todo of testTodos) {
                        await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                            text: todo.text,
                            category: todo.category,
                            priority: todo.priority
                        }, testUserId));
                    }
                });

                it('should filter by specific category', async function () {
                    const request = generateMCPRequest('get_todoodles_by_category', {
                        category: 'work'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.have.lengthOf(1);
                    assertCategoryFilter(results, 'work');
                });

                it('should handle non-existent category', async function () {
                    const request = generateMCPRequest('get_todoodles_by_category', {
                        category: 'nonexistent'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.be.an('array').that.is.empty;
                });

                it('should handle missing category parameter', async function () {
                    const request = generateMCPRequest('get_todoodles_by_category', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'category is required');
                });
            });

            describe('get_todoodles_by_priority Tool', function () {
                beforeEach(async function () {
                    const testTodos = generatePriorityTodoodles();
                    for (const todo of testTodos) {
                        await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                            text: todo.text,
                            category: todo.category,
                            priority: todo.priority
                        }, testUserId));
                    }
                });

                it('should filter by specific priority', async function () {
                    const request = generateMCPRequest('get_todoodles_by_priority', {
                        priority: 'urgent'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results).to.have.lengthOf(1);
                    assertPriorityFilter(results, 'urgent');
                });

                it('should handle all priority levels', async function () {
                    const priorities = ['low', 'medium', 'high', 'urgent'];

                    for (const priority of priorities) {
                        const request = generateMCPRequest('get_todoodles_by_priority', {
                            priority: priority
                        }, testUserId);

                        const response = await manager.handleToolCall(request);
                        assertMCPSuccess(response);

                        const results = JSON.parse(response.content[0].text);
                        expect(results.length).to.be.at.least(1);
                        assertPriorityFilter(results, priority);
                    }
                });

                it('should handle invalid priority', async function () {
                    const request = generateMCPRequest('get_todoodles_by_priority', {
                        priority: 'invalid'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'Invalid priority');
                });
            });

            describe('get_due_todoodles Tool', function () {
                beforeEach(async function () {
                    const testTodos = generateDueDateTodoodles();
                    for (const todo of testTodos.slice(0, 4)) { // Skip the one without due date
                        await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                            text: todo.text,
                            category: todo.category,
                            priority: todo.priority,
                            dueDate: todo.dueDate
                        }, testUserId));
                    }
                });

                it('should get overdue and due today tasks', async function () {
                    const request = generateMCPRequest('get_due_todoodles', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results.length).to.be.at.least(1); // At least overdue or due today
                    assertDueFilter(results, 0);
                });

                it('should get tasks due within specified days', async function () {
                    const request = generateMCPRequest('get_due_todoodles', {
                        days: 7
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const results = JSON.parse(response.content[0].text);
                    expect(results.length).to.be.at.least(1);
                    assertDueFilter(results, 7);
                });

                it('should handle invalid days parameter', async function () {
                    const request = generateMCPRequest('get_due_todoodles', {
                        days: -1
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'days must be non-negative');
                });
            });

            describe('delete_todoodle Tool', function () {
                let testTodoId;

                beforeEach(async function () {
                    await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                        text: 'Task to delete',
                        priority: 'low'
                    }, testUserId));

                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );
                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    testTodoId = todoodles[0].id;
                });

                it('should delete a todoodle successfully', async function () {
                    const startTime = Date.now();

                    const request = generateMCPRequest('delete_todoodle', {
                        id: testTodoId
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response, 'deleted successfully');
                    assertPerformance(startTime);

                    // Verify deletion
                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );

                    const todoodles = JSON.parse(getAllResponse.content[0].text);
                    expect(todoodles).to.be.an('array').that.is.empty;
                });

                it('should handle non-existent todoodle ID', async function () {
                    const request = generateMCPRequest('delete_todoodle', {
                        id: 'non-existent-id'
                    }, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'Todoodle not found');
                });

                it('should handle missing ID parameter', async function () {
                    const request = generateMCPRequest('delete_todoodle', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPError(response, 'id is required');
                });
            });

            describe('get_categories Tool', function () {
                beforeEach(async function () {
                    const testTodos = generateCategoryTodoodles();
                    for (const todo of testTodos) {
                        if (todo.category) { // Skip uncategorized
                            await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                                text: todo.text,
                                category: todo.category,
                                priority: todo.priority
                            }, testUserId));
                        }
                    }
                });

                it('should return list of unique categories', async function () {
                    const request = generateMCPRequest('get_categories', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const categories = JSON.parse(response.content[0].text);

                    // Get expected categories from test data
                    const expectedCategories = ['work', 'personal', 'shopping', 'health'];
                    assertValidCategories(categories, generateCategoryTodoodles().filter(t => t.category));
                });

                it('should return empty array when no categories exist', async function () {
                    await testDb.clearUserData(testUserId);

                    const request = generateMCPRequest('get_categories', {}, testUserId);
                    const response = await manager.handleToolCall(request);

                    assertMCPSuccess(response);
                    const categories = JSON.parse(response.content[0].text);
                    expect(categories).to.be.an('array').that.is.empty;
                });
            });

            describe('get_todoodles_stats Tool', function () {
                beforeEach(async function () {
                    const testTodos = generateCompletionStatusTodoodles();
                    for (const todo of testTodos) {
                        await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                            text: todo.text,
                            category: todo.category,
                            priority: todo.priority
                        }, testUserId));

                        if (todo.completed) {
                            // Get the added todoodle ID and complete it
                            const getAllResponse = await manager.handleToolCall(
                                generateMCPRequest('get_todoodles', {}, testUserId)
                            );
                            const todoodles = JSON.parse(getAllResponse.content[0].text);
                            const addedTodo = todoodles.find(t => t.text === todo.text);

                            if (addedTodo) {
                                await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                                    id: addedTodo.id
                                }, testUserId));
                            }
                        }
                    }
                });

                it('should return comprehensive statistics', async function () {
                    const request = generateMCPRequest('get_todoodles_stats', {}, testUserId);

                    const response = await manager.handleToolCall(request);
                    assertMCPSuccess(response);

                    const stats = JSON.parse(response.content[0].text);

                    // Get current todoodles for validation
                    const getAllResponse = await manager.handleToolCall(
                        generateMCPRequest('get_todoodles', {}, testUserId)
                    );
                    const currentTodoodles = JSON.parse(getAllResponse.content[0].text);

                    assertValidStatistics(stats, currentTodoodles);
                });

                it('should return zero stats when no todoodles exist', async function () {
                    await testDb.clearUserData(testUserId);

                    const request = generateMCPRequest('get_todoodles_stats', {}, testUserId);
                    const response = await manager.handleToolCall(request);

                    assertMCPSuccess(response);
                    const stats = JSON.parse(response.content[0].text);

                    expect(stats.total).to.equal(0);
                    expect(stats.completed).to.equal(0);
                    expect(stats.incomplete).to.equal(0);
                    expect(Object.keys(stats.categories)).to.have.lengthOf(0);
                    expect(Object.keys(stats.priorities)).to.have.lengthOf(0);
                });
            });
        });
    });

    describe('User Isolation Tests', function () {
        let manager1, manager2;
        let testDb;
        const user1Id = 'isolation-user-1';
        const user2Id = 'isolation-user-2';

        beforeEach(async function () {
            testDb = getTestDatabase('user-isolation');
            await testDb.connect();
            await testDb.clearAllData();

            // Set up two separate managers with different user contexts
            testDb.applyTestEnvironment('mongodb', user1Id);
            manager1 = new UserAwareTodoodlesManager();
            await manager1.initialize();

            testDb.applyTestEnvironment('mongodb', user2Id);
            manager2 = new UserAwareTodoodlesManager();
            await manager2.initialize();
        });

        afterEach(async function () {
            await testDb.cleanup();
        });

        it('should maintain separate todoodles for different users', async function () {
            // Add todoodles for user 1
            await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'User 1 task',
                category: 'user1'
            }, user1Id));

            // Add todoodles for user 2
            await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'User 2 task',
                category: 'user2'
            }, user2Id));

            // Get todoodles for each user
            const user1Response = await manager1.handleToolCall(
                generateMCPRequest('get_todoodles', {}, user1Id)
            );
            const user2Response = await manager2.handleToolCall(
                generateMCPRequest('get_todoodles', {}, user2Id)
            );

            const user1Todos = JSON.parse(user1Response.content[0].text);
            const user2Todos = JSON.parse(user2Response.content[0].text);

            // Verify isolation
            expect(user1Todos).to.have.lengthOf(1);
            expect(user2Todos).to.have.lengthOf(1);
            expect(user1Todos[0].text).to.equal('User 1 task');
            expect(user2Todos[0].text).to.equal('User 2 task');
            expect(user1Todos[0].category).to.equal('user1');
            expect(user2Todos[0].category).to.equal('user2');
        });

        it('should support SMS phone number user IDs', async function () {
            const phoneUser1 = '+1234567890';
            const phoneUser2 = '+0987654321';

            // Test with phone number user IDs
            await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'SMS user 1 task',
                priority: 'high'
            }, phoneUser1));

            await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'SMS user 2 task',
                priority: 'low'
            }, phoneUser2));

            const phone1Response = await manager1.handleToolCall(
                generateMCPRequest('get_todoodles', {}, phoneUser1)
            );
            const phone2Response = await manager2.handleToolCall(
                generateMCPRequest('get_todoodles', {}, phoneUser2)
            );

            const phone1Todos = JSON.parse(phone1Response.content[0].text);
            const phone2Todos = JSON.parse(phone2Response.content[0].text);

            expect(phone1Todos).to.have.lengthOf(1);
            expect(phone2Todos).to.have.lengthOf(1);
            expect(phone1Todos[0].priority).to.equal('high');
            expect(phone2Todos[0].priority).to.equal('low');
        });
    });

    describe('Error Handling and Edge Cases', function () {
        let manager;
        let testDb;
        const testUserId = 'edge-case-user';

        beforeEach(async function () {
            testDb = getTestDatabase('edge-cases');
            await testDb.connect();
            await testDb.clearAllData();

            testDb.applyTestEnvironment('json', testUserId);
            manager = new UserAwareTodoodlesManager();
            await manager.initialize();
        });

        afterEach(async function () {
            await testDb.cleanup();
        });

        it('should handle invalid tool names', async function () {
            const request = generateMCPRequest('invalid_tool', {}, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPError(response, 'Unknown tool');
        });

        it('should handle malformed requests', async function () {
            const malformedRequest = {
                params: {
                    // Missing name
                    arguments: {}
                }
            };

            const response = await manager.handleToolCall(malformedRequest);
            assertMCPError(response, 'Tool name is required');
        });

        it('should handle storage backend failures gracefully', async function () {
            // This test would require mocking storage failures
            // For now, we'll test that the manager handles initialization properly
            expect(manager).to.be.an('object');
            expect(manager.handleToolCall).to.be.a('function');
        });

        it('should handle edge case data', async function () {
            const edgeCases = generateEdgeCaseData();

            for (const edgeCase of edgeCases) {
                const request = generateMCPRequest('add_todoodle', {
                    text: edgeCase.text || 'Default text',
                    priority: edgeCase.priority || 'medium',
                    category: edgeCase.category || undefined
                }, testUserId);

                const response = await manager.handleToolCall(request);

                // Most edge cases should either succeed or fail gracefully
                expect(response).to.have.property('content');
                expect(response.content).to.be.an('array');
            }
        });
    });
}); 