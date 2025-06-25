/**
 * Edge Cases and Error Handling Tests
 */

import { expect } from 'chai';
import { getTestDatabase } from '../helpers/test-database.js';
import { generateMCPRequest, generateEdgeCaseData } from '../helpers/test-data.js';
import { assertMCPSuccess, assertMCPError, assertPerformance } from '../helpers/test-assertions.js';

let UserAwareTodoodlesManager;

describe('Edge Cases and Error Handling', function () {
    this.timeout(30000);

    let manager, testDb;
    const testUserId = 'edge-case-user';

    before(async function () {
        const module = await import('../../dist/index.js');
        UserAwareTodoodlesManager = module.UserAwareTodoodlesManager;

        testDb = getTestDatabase('edge-cases');
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

    describe('Invalid Tool Names', function () {
        it('should handle invalid tool names', async function () {
            const request = generateMCPRequest('invalid_tool', {}, testUserId);
            const response = await manager.handleToolCall(request);
            assertMCPError(response, 'Unknown tool');
        });

        it('should handle missing tool name', async function () {
            const malformedRequest = {
                params: {
                    arguments: {}
                }
            };
            const response = await manager.handleToolCall(malformedRequest);
            assertMCPError(response, 'Tool name is required');
        });
    });

    describe('Parameter Validation', function () {
        it('should handle missing required parameters', async function () {
            const testCases = [
                { tool: 'add_todoodle', args: {}, expectedError: 'text is required' },
                { tool: 'complete_todoodle', args: {}, expectedError: 'id is required' },
                { tool: 'delete_todoodle', args: {}, expectedError: 'id is required' },
                { tool: 'search_todoodles', args: {}, expectedError: 'query is required' },
                { tool: 'get_todoodles_by_category', args: {}, expectedError: 'category is required' },
                { tool: 'get_todoodles_by_priority', args: {}, expectedError: 'priority is required' }
            ];

            for (const testCase of testCases) {
                const request = generateMCPRequest(testCase.tool, testCase.args, testUserId);
                const response = await manager.handleToolCall(request);
                assertMCPError(response, testCase.expectedError);
            }
        });

        it('should handle invalid parameter types', async function () {
            const testCases = [
                {
                    tool: 'add_todoodle',
                    args: { text: 123 },
                    expectedError: 'text must be a string'
                },
                {
                    tool: 'get_todoodles',
                    args: { completed: 'invalid' },
                    expectedError: 'completed must be a boolean'
                },
                {
                    tool: 'get_due_todoodles',
                    args: { days: 'invalid' },
                    expectedError: 'days must be a number'
                }
            ];

            for (const testCase of testCases) {
                const request = generateMCPRequest(testCase.tool, testCase.args, testUserId);
                const response = await manager.handleToolCall(request);
                assertMCPError(response);
            }
        });

        it('should handle invalid priority values', async function () {
            const request = generateMCPRequest('add_todoodle', {
                text: 'Test task',
                priority: 'invalid_priority'
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPError(response, 'Invalid priority');
        });

        it('should handle invalid date formats', async function () {
            const request = generateMCPRequest('add_todoodle', {
                text: 'Test task',
                dueDate: 'invalid-date-format'
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPError(response, 'Invalid date format');
        });

        it('should handle negative days parameter', async function () {
            const request = generateMCPRequest('get_due_todoodles', {
                days: -1
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPError(response, 'days must be non-negative');
        });
    });

    describe('Non-existent Resource Handling', function () {
        it('should handle non-existent todoodle IDs', async function () {
            const testCases = [
                { tool: 'complete_todoodle', args: { id: 'non-existent' } },
                { tool: 'delete_todoodle', args: { id: 'non-existent' } }
            ];

            for (const testCase of testCases) {
                const request = generateMCPRequest(testCase.tool, testCase.args, testUserId);
                const response = await manager.handleToolCall(request);
                assertMCPError(response, 'Todoodle not found');
            }
        });

        it('should handle already completed todoodles', async function () {
            // Add and complete a todoodle
            await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'Task to complete twice',
                priority: 'medium'
            }, testUserId));

            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );
            const todoodles = JSON.parse(getAllResponse.content[0].text);
            const todoId = todoodles[0].id;

            // Complete once
            await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                id: todoId
            }, testUserId));

            // Try to complete again
            const response = await manager.handleToolCall(generateMCPRequest('complete_todoodle', {
                id: todoId
            }, testUserId));

            assertMCPError(response, 'already completed');
        });
    });

    describe('Special Characters and Unicode', function () {
        it('should handle empty strings', async function () {
            const request = generateMCPRequest('add_todoodle', {
                text: '',
                priority: 'medium'
            }, testUserId);

            const response = await manager.handleToolCall(request);
            // Empty text should either be accepted or rejected gracefully
            expect(response).to.have.property('content');
        });

        it('should handle very long text', async function () {
            const longText = 'A'.repeat(1000);

            const request = generateMCPRequest('add_todoodle', {
                text: longText,
                priority: 'low'
            }, testUserId);

            const response = await manager.handleToolCall(request);
            assertMCPSuccess(response);

            // Verify the text was stored correctly
            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );

            const todoodles = JSON.parse(getAllResponse.content[0].text);
            expect(todoodles[0].text).to.equal(longText);
        });

        it('should handle special characters and unicode', async function () {
            const specialCases = [
                'Special chars: !@#$%^&*()_+-=[]{}|;\':",./<>?',
                'Unicode: 🎯📝✅❌⭐️🔥💯🚀',
                'Mixed: Hello 世界 🌍',
                'Quotes: "Hello" \'World\'',
                'HTML: <script>alert("test")</script>',
                'JSON: {"key": "value"}',
                'SQL: DROP TABLE todos; --'
            ];

            for (const text of specialCases) {
                const request = generateMCPRequest('add_todoodle', {
                    text: text,
                    category: 'special-test',
                    priority: 'low'
                }, testUserId);

                const response = await manager.handleToolCall(request);
                assertMCPSuccess(response);
            }

            // Verify all were stored correctly
            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );

            const todoodles = JSON.parse(getAllResponse.content[0].text);
            expect(todoodles).to.have.lengthOf(specialCases.length);

            specialCases.forEach((expectedText, index) => {
                const matchingTodo = todoodles.find(t => t.text === expectedText);
                expect(matchingTodo).to.exist;
            });
        });
    });

    describe('Performance and Limits', function () {
        it('should handle large number of todoodles efficiently', async function () {
            const startTime = Date.now();
            const numTasks = 50;

            // Add many tasks
            const addPromises = [];
            for (let i = 1; i <= numTasks; i++) {
                const promise = manager.handleToolCall(generateMCPRequest('add_todoodle', {
                    text: `Task ${i}`,
                    priority: i % 2 === 0 ? 'high' : 'low',
                    category: `category-${i % 5}`
                }, testUserId));
                addPromises.push(promise);
            }

            await Promise.all(addPromises);
            assertPerformance(startTime, 10000); // 10 second limit for 50 tasks

            // Verify all tasks were added
            const getAllResponse = await manager.handleToolCall(
                generateMCPRequest('get_todoodles', {}, testUserId)
            );

            const todoodles = JSON.parse(getAllResponse.content[0].text);
            expect(todoodles).to.have.lengthOf(numTasks);
        });

        it('should handle rapid consecutive operations', async function () {
            const startTime = Date.now();

            // Add a task
            await manager.handleToolCall(generateMCPRequest('add_todoodle', {
                text: 'Task for rapid operations',
                priority: 'medium'
            }, testUserId));

            // Perform rapid operations
            const operations = [];
            for (let i = 0; i < 10; i++) {
                operations.push(
                    manager.handleToolCall(generateMCPRequest('get_todoodles', {}, testUserId))
                );
            }

            const results = await Promise.all(operations);
            assertPerformance(startTime, 5000); // 5 second limit

            // All operations should succeed
            results.forEach(result => {
                assertMCPSuccess(result);
                const todoodles = JSON.parse(result.content[0].text);
                expect(todoodles).to.have.lengthOf(1);
            });
        });
    });

    describe('Malformed Request Handling', function () {
        it('should handle requests with null parameters', async function () {
            const request = {
                params: {
                    name: 'add_todoodle',
                    arguments: null
                },
                meta: {
                    user_id: testUserId
                }
            };

            const response = await manager.handleToolCall(request);
            assertMCPError(response);
        });

        it('should handle requests with missing meta', async function () {
            const request = {
                params: {
                    name: 'get_todoodles',
                    arguments: {}
                }
                // Missing meta
            };

            const response = await manager.handleToolCall(request);
            // Should either work with default user or fail gracefully
            expect(response).to.have.property('content');
        });

        it('should handle deeply nested malformed data', async function () {
            const request = generateMCPRequest('add_todoodle', {
                text: 'Test',
                priority: 'medium',
                malformedData: {
                    deeply: {
                        nested: {
                            circular: null
                        }
                    }
                }
            }, testUserId);

            // Create circular reference
            request.params.arguments.malformedData.deeply.nested.circular =
                request.params.arguments.malformedData;

            const response = await manager.handleToolCall(request);
            // Should handle gracefully without crashing
            expect(response).to.have.property('content');
        });
    });

    describe('Edge Case Data Processing', function () {
        it('should process edge case data correctly', async function () {
            const edgeCases = generateEdgeCaseData();

            for (const edgeCase of edgeCases) {
                const request = generateMCPRequest('add_todoodle', {
                    text: edgeCase.text || 'Default text',
                    priority: edgeCase.priority || 'medium',
                    category: edgeCase.category || undefined
                }, testUserId);

                const response = await manager.handleToolCall(request);

                // Should either succeed or fail gracefully
                expect(response).to.have.property('content');
                expect(response.content).to.be.an('array');
                expect(response.content[0]).to.have.property('text');
            }
        });

        it('should handle boundary date values', async function () {
            const dateCases = [
                '2024-01-01', // Valid date
                '2024-02-29', // Leap year
                '2024-12-31', // End of year
                '1900-01-01', // Old date
                '2100-12-31'  // Future date
            ];

            for (const date of dateCases) {
                const request = generateMCPRequest('add_todoodle', {
                    text: `Task due ${date}`,
                    dueDate: date,
                    priority: 'medium'
                }, testUserId);

                const response = await manager.handleToolCall(request);
                assertMCPSuccess(response);
            }
        });
    });
}); 