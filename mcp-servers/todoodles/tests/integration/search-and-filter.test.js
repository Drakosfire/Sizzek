/**
 * Search and Filter Tests for Todoodles MCP Server
 */

import { expect } from 'chai';
import { getTestDatabase } from '../helpers/test-database.js';
import {
    generateCategoryTodoodles,
    generatePriorityTodoodles,
    generateDueDateTodoodles,
    generateMCPRequest
} from '../helpers/test-data.js';
import {
    assertMCPSuccess,
    assertMCPError,
    assertCategoryFilter,
    assertPriorityFilter,
    assertSearchMatch,
    assertDueFilter,
    assertValidCategories,
    assertValidStatistics
} from '../helpers/test-assertions.js';

let UserAwareTodoodlesManager;

describe('Todoodles MCP Server - Search and Filter', function () {
    this.timeout(30000);

    let manager;
    let testDb;
    const testUserId = 'test-user-search';

    before(async function () {
        const module = await import('../../dist/index.js');
        UserAwareTodoodlesManager = module.UserAwareTodoodlesManager;

        testDb = getTestDatabase('search-filter');
        await testDb.connect();
        await testDb.createIndexes();
    });

    beforeEach(async function () {
        await testDb.clearAllData();
        testDb.applyTestEnvironment('json', testUserId);

        manager = new UserAwareTodoodlesManager();
        await manager.initialize();
    });

    after(async function () {
        await testDb.cleanup();
    });

    describe('Search Todoodles', function () {
        beforeEach(async function () {
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

    describe('Filter by Category', function () {
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

    describe('Filter by Priority', function () {
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

    describe('Filter by Due Date', function () {
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
            expect(results.length).to.be.at.least(1);
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

    describe('Get Categories', function () {
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

    describe('Get Statistics', function () {
        beforeEach(async function () {
            const testTodos = [
                { text: 'Task 1', category: 'work', priority: 'high' },
                { text: 'Task 2', category: 'personal', priority: 'medium' },
                { text: 'Task 3', category: 'work', priority: 'low' },
                { text: 'Task 4', category: 'health', priority: 'high' }
            ];

            for (const todo of testTodos) {
                await manager.handleToolCall(generateMCPRequest('add_todoodle', todo, testUserId));
            }

            // Complete some tasks
            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );
            const allTodos = JSON.parse(getAllResponse.content[0].text);

            // Complete first two tasks
            await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                id: allTodos[0].id
            }, testUserId));

            await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                id: allTodos[1].id
            }, testUserId));
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