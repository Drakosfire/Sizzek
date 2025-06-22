/**
 * Basic Operations Integration Tests for Todoodles MCP Server
 */

import { expect } from 'chai';
import { setupTodoodlesTestDatabase, cleanupTodoodlesTestDatabase } from '../helpers/test-database.js';
import { generateBasicTodoodles, generateMCPRequest } from '../helpers/test-data.js';
import { assertMCPSuccess, assertMCPError, assertValidTodoodle } from '../helpers/test-assertions.js';

// Import the MCP server manager dynamically
let UserAwareTodoodlesManager;

describe('Todoodles MCP Server - Basic Operations', function () {
    this.timeout(30000);

    let manager;
    let testDb;
    const testUserId = 'test-user-basic';

    before(async function () {
        // Import the server manager
        const module = await import('../../dist/index.js');
        UserAwareTodoodlesManager = module.UserAwareTodoodlesManager;

        testDb = await setupTodoodlesTestDatabase('basic-operations');

        // Clean up any persistent JSON files from previous test runs
        const fs = await import('fs');
        const path = await import('path');

        try {
            // Clean up main todoodle.json file
            const mainJsonFile = path.join(process.cwd(), 'todoodle.json');
            if (fs.existsSync(mainJsonFile)) {
                fs.unlinkSync(mainJsonFile);
            }

            // Clean up users directory
            const usersDir = path.join(process.cwd(), 'users');
            if (fs.existsSync(usersDir)) {
                const deleteDirectory = (dirPath) => {
                    if (fs.existsSync(dirPath)) {
                        fs.readdirSync(dirPath).forEach((file) => {
                            const curPath = path.join(dirPath, file);
                            if (fs.lstatSync(curPath).isDirectory()) {
                                deleteDirectory(curPath);
                            } else {
                                fs.unlinkSync(curPath);
                            }
                        });
                        fs.rmdirSync(dirPath);
                    }
                };
                deleteDirectory(usersDir);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    beforeEach(async function () {
        await testDb.clearUserData(testUserId);

        // Set up environment for JSON storage
        Object.assign(process.env, {
            MCP_DEBUG: 'true',
            MCP_USER_BASED: 'true',
            MCP_USER_ID: testUserId,
            MCP_STORAGE_TYPE: 'json',
            MCP_BACKUP_ENABLED: 'false'
        });

        // Clean up any existing JSON storage files for test isolation
        const fs = await import('fs');
        const path = await import('path');
        const userDir = path.join(process.cwd(), 'users', testUserId);
        const userDataFile = path.join(userDir, 'data.json');

        try {
            if (fs.existsSync(userDataFile)) {
                fs.unlinkSync(userDataFile);
            }
            if (fs.existsSync(userDir) && fs.readdirSync(userDir).length === 0) {
                fs.rmdirSync(userDir);
            }
        } catch (error) {
            // Ignore cleanup errors
        }

        manager = new UserAwareTodoodlesManager();
        await manager.initialize();
    });

    afterEach(async function () {
        // Clean up manager connections
        if (manager && manager.cleanup) {
            await manager.cleanup();
        }
    });

    after(async function () {
        await cleanupTodoodlesTestDatabase(testDb);

        // Clean up any remaining JSON files after tests
        const fs = await import('fs');
        const path = await import('path');

        try {
            // Clean up main todoodle.json file
            const mainJsonFile = path.join(process.cwd(), 'todoodle.json');
            if (fs.existsSync(mainJsonFile)) {
                fs.unlinkSync(mainJsonFile);
            }

            // Clean up users directory
            const usersDir = path.join(process.cwd(), 'users');
            if (fs.existsSync(usersDir)) {
                const deleteDirectory = (dirPath) => {
                    if (fs.existsSync(dirPath)) {
                        fs.readdirSync(dirPath).forEach((file) => {
                            const curPath = path.join(dirPath, file);
                            if (fs.lstatSync(curPath).isDirectory()) {
                                deleteDirectory(curPath);
                            } else {
                                fs.unlinkSync(curPath);
                            }
                        });
                        fs.rmdirSync(dirPath);
                    }
                };
                deleteDirectory(usersDir);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Add Todoodle', function () {
        it('should add a basic todoodle successfully', async function () {
            const request = generateMCPRequest('add_todoodle', {
                text: 'Test task',
                priority: 'medium',
                category: 'work'
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPSuccess(response, 'added successfully');
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
    });

    describe('Get Todoodles', function () {
        beforeEach(async function () {
            // Add test data
            await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'Task 1',
                priority: 'high',
                category: 'work'
            }, testUserId));

            await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'Task 2',
                priority: 'low',
                category: 'personal'
            }, testUserId));
        });

        it('should return all todoodles', async function () {
            const request = generateMCPRequest('get_todoodles', {}, testUserId);
            const response = await manager.handleToolCall(request);

            assertMCPSuccess(response);
            const todoodles = JSON.parse(response.content[0].text);
            expect(todoodles).to.have.lengthOf(2);

            todoodles.forEach(todo => {
                assertValidTodoodle(todo);
            });
        });

        it('should filter by completion status', async function () {
            const request = generateMCPRequest('get_todoodles', {
                completed: false
            }, testUserId);
            const response = await manager.handleToolCall(request);

            assertMCPSuccess(response);
            const todoodles = JSON.parse(response.content[0].text);
            expect(todoodles).to.have.lengthOf(2);

            todoodles.forEach(todo => {
                expect(todo.completed).to.be.false;
            });
        });
    });

    describe('Complete Todoodle', function () {
        let testTodoId;

        beforeEach(async function () {
            await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'Task to complete',
                priority: 'medium'
            }, testUserId));

            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );
            const todoodles = JSON.parse(getAllResponse.content[0].text);
            testTodoId = todoodles[0].id;
        });

        it('should complete a todoodle successfully', async function () {
            const request = generateMCPRequest('complete_todoodle', {
                id: testTodoId
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPSuccess(response, 'marked as completed');

            // Verify completion
            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );

            const todoodles = JSON.parse(getAllResponse.content[0].text);
            const completedTodo = todoodles.find(t => t.id === testTodoId);

            expect(completedTodo.completed).to.be.true;
            expect(completedTodo.completedAt).to.be.a('string');
            expect(completedTodo.timeToComplete).to.be.a('number');
        });

        it('should handle non-existent todoodle ID', async function () {
            const request = generateMCPRequest('complete_todoodle', {
                id: 'non-existent-id'
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPError(response, 'Todoodle not found');
        });
    });

    describe('Delete Todoodle', function () {
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
            const request = generateMCPRequest('delete_todoodle', {
                id: testTodoId
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPSuccess(response, 'deleted successfully');

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
    });
}); 