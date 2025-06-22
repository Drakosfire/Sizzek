/**
 * User Isolation Tests for Todoodles MCP Server
 */

import { expect } from 'chai';
import { getTestDatabase } from '../helpers/test-database.js';
import { generateMCPRequest, generateTestUsers } from '../helpers/test-data.js';
import { assertMCPSuccess, assertUserIsolation } from '../helpers/test-assertions.js';

let UserAwareTodoodlesManager;

describe('Todoodles MCP Server - User Isolation', function () {
    this.timeout(30000);

    let testDb;
    const testConfigs = [
        { storageType: 'json', name: 'JSON Storage' },
        { storageType: 'mongodb', name: 'MongoDB Storage' }
    ];

    before(async function () {
        const module = await import('../../dist/index.js');
        UserAwareTodoodlesManager = module.UserAwareTodoodlesManager;

        testDb = getTestDatabase('user-isolation');
        await testDb.connect();
        await testDb.createIndexes();
    });

    after(async function () {
        await testDb.cleanup();
    });

    testConfigs.forEach(({ storageType, name }) => {
        describe(`${name} - User Isolation`, function () {
            let manager1, manager2;
            const user1Id = `isolation-user-1-${storageType}`;
            const user2Id = `isolation-user-2-${storageType}`;

            beforeEach(async function () {
                await testDb.clearAllData();

                // Set up two separate managers with different user contexts
                testDb.applyTestEnvironment(storageType, user1Id);
                manager1 = new UserAwareTodoodlesManager();
                await manager1.initialize();

                testDb.applyTestEnvironment(storageType, user2Id);
                manager2 = new UserAwareTodoodlesManager();
                await manager2.initialize();
            });

            it('should maintain separate todoodles for different users', async function () {
                // Add todoodles for user 1
                await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'User 1 task',
                    category: 'user1',
                    priority: 'high'
                }, user1Id));

                await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Another user 1 task',
                    category: 'work',
                    priority: 'medium'
                }, user1Id));

                // Add todoodles for user 2
                await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'User 2 task',
                    category: 'user2',
                    priority: 'low'
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
                expect(user1Todos).to.have.lengthOf(2);
                expect(user2Todos).to.have.lengthOf(1);

                expect(user1Todos[0].text).to.include('User 1');
                expect(user1Todos[1].text).to.include('User 1');
                expect(user2Todos[0].text).to.include('User 2');

                // Verify no cross-contamination
                expect(user1Todos.some(t => t.text.includes('User 2'))).to.be.false;
                expect(user2Todos.some(t => t.text.includes('User 1'))).to.be.false;
            });

            it('should support SMS phone number user IDs', async function () {
                const phoneUser1 = '+1234567890';
                const phoneUser2 = '+0987654321';

                // Create managers for phone users
                testDb.applyTestEnvironment(storageType, phoneUser1);
                const phoneManager1 = new UserAwareTodoodlesManager();
                await phoneManager1.initialize();

                testDb.applyTestEnvironment(storageType, phoneUser2);
                const phoneManager2 = new UserAwareTodoodlesManager();
                await phoneManager2.initialize();

                // Add tasks for each phone user
                await phoneManager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'SMS user 1 task',
                    priority: 'high',
                    category: 'sms'
                }, phoneUser1));

                await phoneManager2.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'SMS user 2 task',
                    priority: 'low',
                    category: 'sms'
                }, phoneUser2));

                // Verify isolation
                const phone1Response = await phoneManager1.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, phoneUser1)
                );
                const phone2Response = await phoneManager2.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, phoneUser2)
                );

                const phone1Todos = JSON.parse(phone1Response.content[0].text);
                const phone2Todos = JSON.parse(phone2Response.content[0].text);

                expect(phone1Todos).to.have.lengthOf(1);
                expect(phone2Todos).to.have.lengthOf(1);
                expect(phone1Todos[0].text).to.equal('SMS user 1 task');
                expect(phone2Todos[0].text).to.equal('SMS user 2 task');
                expect(phone1Todos[0].priority).to.equal('high');
                expect(phone2Todos[0].priority).to.equal('low');
            });

            it('should handle completion isolation between users', async function () {
                // Add same task text for both users
                await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Common task name',
                    priority: 'medium'
                }, user1Id));

                await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Common task name',
                    priority: 'medium'
                }, user2Id));

                // Get task IDs
                const user1GetResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user1Id)
                );
                const user2GetResponse = await manager2.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user2Id)
                );

                const user1Todos = JSON.parse(user1GetResponse.content[0].text);
                const user2Todos = JSON.parse(user2GetResponse.content[0].text);

                // Complete task for user 1 only
                await manager1.handleToolCall(generateMCPRequest('complete_todoodle', {
                    id: user1Todos[0].id
                }, user1Id));

                // Verify only user 1's task is completed
                const user1UpdatedResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user1Id)
                );
                const user2UpdatedResponse = await manager2.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user2Id)
                );

                const user1Updated = JSON.parse(user1UpdatedResponse.content[0].text);
                const user2Updated = JSON.parse(user2UpdatedResponse.content[0].text);

                expect(user1Updated[0].completed).to.be.true;
                expect(user2Updated[0].completed).to.be.false;
            });

            it('should handle deletion isolation between users', async function () {
                // Add tasks for both users
                await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'User 1 task to delete',
                    priority: 'low'
                }, user1Id));

                await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'User 2 task to keep',
                    priority: 'high'
                }, user2Id));

                // Get task IDs
                const user1GetResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user1Id)
                );
                const user1Todos = JSON.parse(user1GetResponse.content[0].text);

                // Delete user 1's task
                await manager1.handleToolCall(generateMCPRequest('delete_todoodle', {
                    id: user1Todos[0].id
                }, user1Id));

                // Verify user 1 has no tasks, user 2 still has their task
                const user1FinalResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user1Id)
                );
                const user2FinalResponse = await manager2.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user2Id)
                );

                const user1Final = JSON.parse(user1FinalResponse.content[0].text);
                const user2Final = JSON.parse(user2FinalResponse.content[0].text);

                expect(user1Final).to.be.an('array').that.is.empty;
                expect(user2Final).to.have.lengthOf(1);
                expect(user2Final[0].text).to.equal('User 2 task to keep');
            });

            it('should maintain separate statistics for each user', async function () {
                // Add different numbers of tasks for each user
                const user1Tasks = [
                    { text: 'Task 1', category: 'work', priority: 'high' },
                    { text: 'Task 2', category: 'personal', priority: 'medium' },
                    { text: 'Task 3', category: 'work', priority: 'low' }
                ];

                const user2Tasks = [
                    { text: 'Task A', category: 'health', priority: 'urgent' },
                    { text: 'Task B', category: 'shopping', priority: 'medium' }
                ];

                // Add tasks
                for (const task of user1Tasks) {
                    await manager1.handleToolCall(generateMCPRequest('add_todoodle', task, user1Id));
                }

                for (const task of user2Tasks) {
                    await manager2.handleToolCall(generateMCPRequest('add_todoodle', task, user2Id));
                }

                // Complete one task for each user
                const user1GetResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user1Id)
                );
                const user2GetResponse = await manager2.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, user2Id)
                );

                const user1Todos = JSON.parse(user1GetResponse.content[0].text);
                const user2Todos = JSON.parse(user2GetResponse.content[0].text);

                await manager1.handleToolCall(generateMCPRequest('complete_todoodle', {
                    id: user1Todos[0].id
                }, user1Id));

                await manager2.handleToolCall(generateMCPRequest('complete_todoodle', {
                    id: user2Todos[0].id
                }, user2Id));

                // Get statistics for each user
                const user1StatsResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_todoodles_stats', {}, user1Id)
                );
                const user2StatsResponse = await manager2.handleToolCall(
                    generateMCPRequest('get_todoodles_stats', {}, user2Id)
                );

                const user1Stats = JSON.parse(user1StatsResponse.content[0].text);
                const user2Stats = JSON.parse(user2StatsResponse.content[0].text);

                // Verify separate statistics
                expect(user1Stats.total).to.equal(3);
                expect(user1Stats.completed).to.equal(1);
                expect(user1Stats.incomplete).to.equal(2);
                expect(user1Stats.categories.work).to.equal(2);
                expect(user1Stats.categories.personal).to.equal(1);

                expect(user2Stats.total).to.equal(2);
                expect(user2Stats.completed).to.equal(1);
                expect(user2Stats.incomplete).to.equal(1);
                expect(user2Stats.categories.health).to.equal(1);
                expect(user2Stats.categories.shopping).to.equal(1);

                // Verify no cross-contamination
                expect(user1Stats.categories.health).to.be.undefined;
                expect(user1Stats.categories.shopping).to.be.undefined;
                expect(user2Stats.categories.work).to.be.undefined;
                expect(user2Stats.categories.personal).to.be.undefined;
            });

            it('should maintain separate categories for each user', async function () {
                // Add tasks with different categories for each user
                await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Work task',
                    category: 'work',
                    priority: 'high'
                }, user1Id));

                await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Personal task',
                    category: 'personal',
                    priority: 'medium'
                }, user1Id));

                await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Health task',
                    category: 'health',
                    priority: 'low'
                }, user2Id));

                await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: 'Finance task',
                    category: 'finance',
                    priority: 'urgent'
                }, user2Id));

                // Get categories for each user
                const user1CategoriesResponse = await manager1.handleToolCall(
                    generateMCPRequest('get_categories', {}, user1Id)
                );
                const user2CategoriesResponse = await manager2.handleToolCall(
                    generateMCPRequest('get_categories', {}, user2Id)
                );

                const user1Categories = JSON.parse(user1CategoriesResponse.content[0].text);
                const user2Categories = JSON.parse(user2CategoriesResponse.content[0].text);

                // Verify separate categories
                expect(user1Categories.sort()).to.deep.equal(['personal', 'work']);
                expect(user2Categories.sort()).to.deep.equal(['finance', 'health']);

                // Verify no cross-contamination
                expect(user1Categories).to.not.include('health');
                expect(user1Categories).to.not.include('finance');
                expect(user2Categories).to.not.include('work');
                expect(user2Categories).to.not.include('personal');
            });
        });
    });

    describe('Multi-User Concurrent Operations', function () {
        it('should handle concurrent operations from multiple users', async function () {
            const users = generateTestUsers().slice(0, 3); // Use first 3 test users
            const managers = [];

            // Create managers for each user
            for (const user of users) {
                testDb.applyTestEnvironment('json', user.userId);
                const manager = new UserAwareTodoodlesManager();
                await manager.initialize();
                managers.push({ manager, userId: user.userId, todos: user.todos });
            }

            // Perform concurrent operations
            const operations = managers.map(async ({ manager, userId, todos }) => {
                // Add multiple tasks concurrently
                const addPromises = todos.map(todo =>
                    manager.handleToolCall(generateMCPRequest('add_todoodle', {
                        text: todo.text,
                        category: todo.category,
                        priority: todo.priority,
                        dueDate: todo.dueDate
                    }, userId))
                );

                await Promise.all(addPromises);

                // Get all tasks
                const getResponse = await manager.handleToolCall(
                    generateMCPRequest('get_todoodles', {}, userId)
                );

                return {
                    userId,
                    todos: JSON.parse(getResponse.content[0].text),
                    expectedCount: todos.length
                };
            });

            const results = await Promise.all(operations);

            // Verify each user got their correct data
            results.forEach(({ userId, todos, expectedCount }) => {
                expect(todos).to.have.lengthOf(expectedCount);
                assertMCPSuccess({ content: [{ text: JSON.stringify(todos) }] });
            });

            // Verify no cross-contamination
            for (let i = 0; i < results.length; i++) {
                for (let j = i + 1; j < results.length; j++) {
                    const result1 = results[i];
                    const result2 = results[j];

                    // Ensure different users have different data
                    expect(result1.todos).to.not.deep.equal(result2.todos);
                }
            }
        });
    });
}); 