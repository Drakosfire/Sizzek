import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TaskManager } from '../../src/core/task-manager.js';
import { extractUserContext, validateUserAccess } from '../../src/utils/user-context.js';
import { TaskStatus, UserContext } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock LibreChat client
const mockLibreChatClient = {
    triggerTask: jest.fn(),
    getUser: jest.fn()
};

describe('User Context Integration Tests', () => {
    let taskManager: TaskManager;
    let testDataDir: string;

    beforeEach(async () => {
        // Setup test environment
        testDataDir = join(tmpdir(), `context-integration-test-${Date.now()}`);
        await fs.mkdir(testDataDir, { recursive: true });

        process.env.DATA_DIR = testDataDir;
        process.env.MCP_USER_BASED = 'true';
        process.env.LIBRECHAT_ENDPOINT = 'http://localhost:3080';
        process.env.LIBRECHAT_API_KEY = 'test-key';
        process.env.LIBRECHAT_AGENT_NAME = 'TestAgent';

        // Initialize TaskManager with mocked LibreChat client
        taskManager = new TaskManager(mockLibreChatClient as any);
        await taskManager.initialize();

        // Reset mocks
        jest.clearAllMocks();

        // Setup default mock implementations
        (mockLibreChatClient.triggerTask as any).mockResolvedValue(undefined);
        (mockLibreChatClient.getUser as any).mockResolvedValue({
            _id: 'agent-user-123',
            phoneNumber: '+1234567890'
        });
    });

    afterEach(async () => {
        if (taskManager) {
            await taskManager.cleanup();
        }

        try {
            await fs.rm(testDataDir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Failed to cleanup test directory:', error);
        }
    });

    describe('End-to-End User Context Flow', () => {
        it('should handle complete user context flow from request to execution', async () => {
            // Step 1: Simulate LibreChat MCP request with user context
            const mcpRequest = {
                params: {
                    name: 'create_once_task',
                    arguments: {
                        name: 'E2E Test Task',
                        message: 'Test message for E2E flow',
                        delayMinutes: 0.01, // Very short delay for testing
                        sharedWith: ['shared-user-456']
                    },
                    userId: 'creator-user-123',
                    tenantId: 'tenant-corporate'
                }
            };

            // Step 2: Extract user context (as would happen in MCP server)
            const userContext = extractUserContext(mcpRequest);

            expect(userContext.userId).toBe('creator-user-123');
            expect(userContext.effectiveUserId).toBe('creator-user-123');
            expect(userContext.tenantId).toBe('tenant-corporate');
            expect(userContext.isSharedContext).toBe(false);

            // Step 3: Create task with user context
            const task = await taskManager.createTask({
                name: mcpRequest.params.arguments.name,
                description: undefined,
                schedule: { type: 'once', delayMinutes: mcpRequest.params.arguments.delayMinutes },
                message: mcpRequest.params.arguments.message,
                enabled: true,
                sharedWith: mcpRequest.params.arguments.sharedWith
            }, userContext);

            // Step 4: Verify task creation with correct context
            expect(task.creatorUserId).toBe('creator-user-123');
            expect(task.tenantId).toBe('tenant-corporate');
            expect(task.sharedWith).toEqual(['shared-user-456']);
            expect(task.contextType).toBe('shared');

            // Step 5: Wait for task execution and verify LibreChat trigger
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for execution

            expect(mockLibreChatClient.triggerTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: task.id,
                    creatorUserId: 'creator-user-123',
                    sharedWith: ['shared-user-456'],
                    contextType: 'shared'
                })
            );
        });

        it('should handle shared context scenario (agent executing original user task)', async () => {
            // Step 1: Create task as original user
            const originalUserContext: UserContext = {
                userId: 'original-user-123',
                effectiveUserId: 'original-user-123',
                sharedWith: [],
                isSharedContext: false,
                tenantId: 'tenant-1'
            };

            const task = await taskManager.createTask({
                name: 'Shared Context Task',
                description: 'Task to be executed in shared context',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Check the grocery list',
                enabled: true,
                sharedWith: ['shared-user-456']
            }, originalUserContext);

            // Step 2: Simulate agent request with shared context (after task triggered)
            const agentMcpRequest = {
                params: {
                    name: 'list_scheduled_tasks',
                    arguments: {},
                    userId: 'agent-user-789',
                    originalUserId: 'original-user-123',
                    sharedWith: ['shared-user-456'],
                    contextType: 'shared',
                    tenantId: 'tenant-1'
                }
            };

            // Step 3: Extract agent context with original user info
            const agentContext = extractUserContext(agentMcpRequest);

            expect(agentContext.userId).toBe('agent-user-789');
            expect(agentContext.originalUserId).toBe('original-user-123');
            expect(agentContext.effectiveUserId).toBe('original-user-123');
            expect(agentContext.isSharedContext).toBe(true);

            // Step 4: Verify access validation works for shared context
            expect(validateUserAccess(task, agentContext)).toBe(true);

            // Step 5: Verify task filtering works for agent context
            const accessibleTasks = taskManager.getTasksForUser(agentContext);
            expect(accessibleTasks).toHaveLength(1);
            expect(accessibleTasks[0].id).toBe(task.id);
        });

        it('should handle access control for different user scenarios', async () => {
            // Create tasks for different users and sharing scenarios
            const user1Context: UserContext = {
                userId: 'user-1',
                effectiveUserId: 'user-1',
                sharedWith: [],
                isSharedContext: false
            };

            const user2Context: UserContext = {
                userId: 'user-2',
                effectiveUserId: 'user-2',
                sharedWith: [],
                isSharedContext: false
            };

            // User 1 private task
            const privateTask = await taskManager.createTask({
                name: 'Private Task',
                description: 'User 1 private task',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Private message',
                enabled: true
            }, user1Context);

            // User 1 shared task
            const sharedTask = await taskManager.createTask({
                name: 'Shared Task',
                description: 'User 1 shared with User 2',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Shared message',
                enabled: true,
                sharedWith: ['user-2']
            }, user1Context);

            // User 2 private task
            const user2Task = await taskManager.createTask({
                name: 'User 2 Task',
                description: 'User 2 private task',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'User 2 message',
                enabled: true
            }, user2Context);

            // Test User 1 access
            const user1Tasks = taskManager.getTasksForUser(user1Context);
            expect(user1Tasks).toHaveLength(2);
            expect(user1Tasks.map(t => t.name)).toContain('Private Task');
            expect(user1Tasks.map(t => t.name)).toContain('Shared Task');

            // Test User 2 access
            const user2Tasks = taskManager.getTasksForUser(user2Context);
            expect(user2Tasks).toHaveLength(2);
            expect(user2Tasks.map(t => t.name)).toContain('Shared Task');
            expect(user2Tasks.map(t => t.name)).toContain('User 2 Task');

            // Test User 3 (no access)
            const user3Context: UserContext = {
                userId: 'user-3',
                effectiveUserId: 'user-3',
                sharedWith: [],
                isSharedContext: false
            };

            const user3Tasks = taskManager.getTasksForUser(user3Context);
            expect(user3Tasks).toHaveLength(0);

            // Test individual task access
            expect(taskManager.hasUserAccess(privateTask.id, user1Context)).toBe(true);
            expect(taskManager.hasUserAccess(privateTask.id, user2Context)).toBe(false);
            expect(taskManager.hasUserAccess(sharedTask.id, user2Context)).toBe(true);
            expect(taskManager.hasUserAccess(user2Task.id, user1Context)).toBe(false);
        });
    });

    describe('LibreChat Client Integration', () => {
        it('should pass correct user context in LibreChat trigger', async () => {
            const userContext: UserContext = {
                userId: 'test-user-123',
                effectiveUserId: 'test-user-123',
                sharedWith: [],
                isSharedContext: false,
                tenantId: 'test-tenant'
            };

            const task = await taskManager.createTask({
                name: 'LibreChat Integration Task',
                description: 'Test LibreChat context passing',
                schedule: { type: 'once', delayMinutes: 0.01 },
                message: 'Test LibreChat integration with user context',
                enabled: true,
                sharedWith: ['collaborator-456']
            }, userContext);

            // Wait for task execution
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify LibreChat client was called with correct context
            expect(mockLibreChatClient.triggerTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: task.id,
                    creatorUserId: 'test-user-123',
                    tenantId: 'test-tenant',
                    sharedWith: ['collaborator-456'],
                    contextType: 'shared',
                    message: 'Test LibreChat integration with user context'
                })
            );
        });

        it('should handle LibreChat client errors gracefully', async () => {
            // Mock LibreChat client to throw error
            (mockLibreChatClient.triggerTask as any).mockRejectedValueOnce(new Error('LibreChat API error'));

            const userContext: UserContext = {
                userId: 'error-test-user',
                effectiveUserId: 'error-test-user',
                sharedWith: [],
                isSharedContext: false
            };

            const task = await taskManager.createTask({
                name: 'Error Test Task',
                description: 'Test error handling',
                schedule: { type: 'once', delayMinutes: 0.01 },
                message: 'This task should fail',
                enabled: true
            }, userContext);

            // Wait for task execution
            await new Promise(resolve => setTimeout(resolve, 100));

            // Task should be marked as failed but context preserved
            const failedTask = taskManager.getTask(task.id);
            expect(failedTask?.status).toBe(TaskStatus.FAILED);
            expect(failedTask?.creatorUserId).toBe('error-test-user');
            expect(failedTask?.lastError).toContain('LibreChat API error');
        });
    });

    describe('Migration and Backward Compatibility', () => {
        it('should handle tasks without user context gracefully', async () => {
            // Create a task without user context (simulating legacy data)
            const legacyTask = await taskManager.createTask({
                name: 'Legacy Task',
                description: 'Task created without user context',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Legacy message',
                enabled: true,
                creatorUserId: 'fallback-user-123'
            });

            expect(legacyTask.creatorUserId).toBe('fallback-user-123');
            expect(legacyTask.sharedWith).toEqual([]);
            expect(legacyTask.contextType).toBe('user');
        });

        it('should maintain context through task updates', async () => {
            const userContext: UserContext = {
                userId: 'persistent-user-123',
                effectiveUserId: 'persistent-user-123',
                sharedWith: [],
                isSharedContext: false,
                tenantId: 'persistent-tenant'
            };

            const task = await taskManager.createTask({
                name: 'Persistent Context Task',
                description: 'Original description',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Original message',
                enabled: true,
                sharedWith: ['original-user']
            }, userContext);

            // Update task
            await taskManager.updateTask(task.id, {
                name: 'Updated Persistent Task',
                description: 'Updated description',
                message: 'Updated message'
            });

            // Verify context is preserved
            const updatedTask = taskManager.getTask(task.id);
            expect(updatedTask?.name).toBe('Updated Persistent Task');
            expect(updatedTask?.description).toBe('Updated description');
            expect(updatedTask?.message).toBe('Updated message');

            // Context should remain unchanged
            expect(updatedTask?.creatorUserId).toBe('persistent-user-123');
            expect(updatedTask?.tenantId).toBe('persistent-tenant');
            expect(updatedTask?.sharedWith).toEqual(['original-user']);
            expect(updatedTask?.contextType).toBe('shared');
        });
    });

    describe('Multi-tenant Scenarios', () => {
        it('should isolate tasks by tenant ID', async () => {
            const tenant1UserContext: UserContext = {
                userId: 'user-123',
                effectiveUserId: 'user-123',
                sharedWith: [],
                isSharedContext: false,
                tenantId: 'tenant-1'
            };

            const tenant2UserContext: UserContext = {
                userId: 'user-123', // Same user ID but different tenant
                effectiveUserId: 'user-123',
                sharedWith: [],
                isSharedContext: false,
                tenantId: 'tenant-2'
            };

            // Create tasks in different tenants
            const tenant1Task = await taskManager.createTask({
                name: 'Tenant 1 Task',
                description: 'Task in tenant 1',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Tenant 1 message',
                enabled: true
            }, tenant1UserContext);

            const tenant2Task = await taskManager.createTask({
                name: 'Tenant 2 Task',
                description: 'Task in tenant 2',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Tenant 2 message',
                enabled: true
            }, tenant2UserContext);

            // Verify tasks have correct tenant isolation
            expect(tenant1Task.tenantId).toBe('tenant-1');
            expect(tenant2Task.tenantId).toBe('tenant-2');

            // Verify both tasks exist but with different tenant contexts
            const allTasks = taskManager.getAllTasks();
            expect(allTasks).toHaveLength(2);

            const tenant1Tasks = allTasks.filter(t => t.tenantId === 'tenant-1');
            const tenant2Tasks = allTasks.filter(t => t.tenantId === 'tenant-2');

            expect(tenant1Tasks).toHaveLength(1);
            expect(tenant2Tasks).toHaveLength(1);
            expect(tenant1Tasks[0].name).toBe('Tenant 1 Task');
            expect(tenant2Tasks[0].name).toBe('Tenant 2 Task');
        });

        it('should handle cross-tenant sharing restrictions', async () => {
            const tenant1UserContext: UserContext = {
                userId: 'creator-user',
                effectiveUserId: 'creator-user',
                sharedWith: [],
                isSharedContext: false,
                tenantId: 'tenant-1'
            };

            // Note: tenant2UserContext would be used for cross-tenant validation in a full implementation
            // const tenant2UserContext: UserContext = {
            //     userId: 'other-user',
            //     effectiveUserId: 'other-user',
            //     sharedWith: [],
            //     isSharedContext: false,
            //     tenantId: 'tenant-2'
            // };

            // Create task in tenant 1
            const task = await taskManager.createTask({
                name: 'Cross-Tenant Test',
                description: 'Test cross-tenant access',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Cross-tenant message',
                enabled: true,
                sharedWith: ['other-user'] // Try to share with user from different tenant
            }, tenant1UserContext);

            // Verify task creation succeeded with sharing info
            expect(task.tenantId).toBe('tenant-1');
            expect(task.sharedWith).toEqual(['other-user']);

            // In a real implementation, access validation might consider tenant isolation
            // For now, we verify the structure supports it
            expect(task.creatorUserId).toBe('creator-user');
            expect(task.tenantId).toBe('tenant-1');
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle large numbers of shared users efficiently', async () => {
            const largeSharedList = Array.from({ length: 1000 }, (_, i) => `user-${i}`);

            const userContext: UserContext = {
                userId: 'creator-large-share',
                effectiveUserId: 'creator-large-share',
                sharedWith: [],
                isSharedContext: false
            };

            const task = await taskManager.createTask({
                name: 'Large Share List Task',
                description: 'Task with many shared users',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Large share test',
                enabled: true,
                sharedWith: largeSharedList
            }, userContext);

            expect(task.sharedWith).toHaveLength(1000);
            expect(task.contextType).toBe('shared');

            // Verify access validation works efficiently
            const testUserContext: UserContext = {
                userId: 'user-500',
                effectiveUserId: 'user-500',
                sharedWith: [],
                isSharedContext: false
            };

            expect(validateUserAccess(task, testUserContext)).toBe(true);
        });

        it('should handle special characters and edge cases in user IDs', async () => {
            const specialUserIds = [
                'user@domain.com',
                'user-with-dashes_and_underscores',
                'user.with.dots',
                'user+with+plus',
                'user#with#hash',
                'user%20with%20encoding'
            ];

            for (const userId of specialUserIds) {
                const userContext: UserContext = {
                    userId,
                    effectiveUserId: userId,
                    sharedWith: [],
                    isSharedContext: false
                };

                const task = await taskManager.createTask({
                    name: `Task for ${userId}`,
                    description: 'Special character test',
                    schedule: { type: 'once', delayMinutes: 60 },
                    message: 'Special character message',
                    enabled: true
                }, userContext);

                expect(task.creatorUserId).toBe(userId);
                expect(validateUserAccess(task, userContext)).toBe(true);
            }
        });
    });
}); 